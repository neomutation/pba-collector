#!/usr/bin/env ruby
# encoding: utf-8
# PBA 선수 비교 앱 서버.  ruby server.rb  →  http://localhost:4567
require 'webrick'
require 'json'
require 'sqlite3'
require 'open3'

ROOT = __dir__
DB_PATH = File.join(ROOT, 'data', 'pba.db')
PORT = (ENV['PORT'] || 4567).to_i

def db
  @db = nil if @db_mtime != File.mtime(DB_PATH)     # build_db.rb 로 새로 만들면 다시 연다
  @db_mtime = File.mtime(DB_PATH)
  @db ||= SQLite3::Database.new(DB_PATH, readonly: true).tap { |d| d.results_as_hash = true }
end

def rows(sql, *args) db.execute(sql, args).map { |r| r.reject { |k, _| k.is_a?(Integer) } } end

def game_json(g)
  g.merge('sets' => JSON.parse(g['sets'] || '[]'), 'tiebreak' => g['tiebreak'] && JSON.parse(g['tiebreak']))
end

# 세트 흐름: 선공 → 후공 순서로 이닝 득점을 쌓아 본다
#  lf: 먼저 N점 차로 앞선 쪽 (1 = 나, -1 = 상대, 0 = 없음) · N = PBA 5점, LPBA 3점
#  cl: 클러치 상황까지 갔는지 = 두 선수 모두 남은 점수가 N점 이내 (PBA 5점 · LPBA 3점, 세트 목표 점수와 상관없이)
LEAD_PTS = { 'PBA' => 5, 'LPBA' => 3 }
def set_flow(mine, theirs, first, lead, gp)
  return nil unless mine.is_a?(Array) && theirs.is_a?(Array) && !first.nil? && lead
  a = b = lf = 0; cl = false; thr = gp.to_i > lead ? gp.to_i - lead : nil
  first = mine.size > theirs.size if mine.size != theirs.size   # 이닝 수가 다르면 더 많은 쪽이 선공 (선공 표시가 틀린 옛 기록 보정)
  order = first ? [[mine, 0], [theirs, 1]] : [[theirs, 1], [mine, 0]]
  [mine.size, theirs.size].max.times do |k|
    order.each do |arr, who|
      next unless arr[k]
      who.zero? ? a += arr[k].to_i : b += arr[k].to_i
      lf = (a - b >= lead ? 1 : b - a >= lead ? -1 : 0) if lf.zero?
      cl = true if thr && a >= thr && b >= thr
    end
  end
  { 'lf' => lf, 'cl' => thr ? cl : nil }
end
# 상대 쪽 세트 기록(JSON 문자열)과 맞춰 세트마다 lf · cl 을 붙인다
def add_flow!(sets, opp_raw, type)
  opp = (JSON.parse(opp_raw || '[]') rescue [])
  sets.each do |s|
    o = opp.find { |x| x['no'] == s['no'] } or next
    f = set_flow(s['runs_list'], o['runs_list'], s['first'], LEAD_PTS[type], s['gp']) or next
    s.merge!(f)
  end
  sets
end

# 시즌 순위(계산값): 그 시즌 대회별 랭킹 포인트(pbatour 상금 표의 포인트) 합으로 같은 종목 선수끼리 줄 세운다
def season_ranks(type)
  @rank_cache = {} if @rank_mtime != File.mtime(DB_PATH)
  @rank_mtime = File.mtime(DB_PATH)
  @rank_cache[type] ||= begin
    by = Hash.new { |h, k| h[k] = Hash.new(0) }; money = Hash.new { |h, k| h[k] = Hash.new(0) }
    rows('SELECT z.player, z.season, z.points, z.prize FROM prizes z JOIN players p ON p.id = z.player WHERE p.type = ?', type)
      .each { |r| by[r['season']][r['player']] += r['points'].to_i; money[r['season']][r['player']] += r['prize'].to_i }
    # 같은 값이면 같은 순위 (1 + 나보다 큰 사람 수)
    rank_of = ->(h) { vs = h.values.sort.reverse; h.map { |pl, v| [pl, vs.index(v) + 1] }.to_h }
    by.map do |season, h|
      pr = rank_of.(h)
      mr = rank_of.(money[season])
      [season, h.map { |pl, v| [pl, { 'rank' => pr[pl], 'points' => v, 'of' => h.size, 'prize' => money[season][pl], 'prize_rank' => mr[pl] }] }.to_h]
    end.to_h
  end
end

def player(id)
  p = rows('SELECT * FROM players WHERE id = ?', id).first or return nil
  p['stats'] = p['stats'] && JSON.parse(p['stats'])
  p['site_tours'] = p['site_tours'] && JSON.parse(p['site_tours'])
  # 상대 에버·하이런: 같은 경기(pst)의 상대 쪽 줄에서
  games = rows('SELECT g.*, t.name AS tour_name, o.avg AS opp_avg, o.hr AS opp_hr, o.sets AS opp_raw FROM games g JOIN tours t ON t.code = g.tour LEFT JOIN games o ON o.pst = g.pst AND o.player = g.opp WHERE g.player = ? ORDER BY g.date, g.pst', id)
    .map { |g| raw = g.delete('opp_raw'); x = game_json(g); add_flow!(x['sets'], raw, g['type']); x }
  { player: p, games: games,
    results: rows('SELECT r.tour, r.result FROM results r WHERE r.player = ?', id),
    prizes: rows(%q(SELECT tour, season, title, prize, rank, points FROM prizes WHERE player = ? ORDER BY season, tour), id),
    season_ranks: season_ranks(p['type']).map { |season, h| [season, h[id]] }.select { |_, v| v }.to_h,
    awards: rows('SELECT a.tour, a.avg, a.pst, a.round_desc, t.name, t.season, t.seq FROM awards a JOIN tours t ON t.code = a.tour WHERE a.player = ?', id),
    tours: rows('SELECT * FROM tours WHERE type = ? ORDER BY season, end_date', p['type']),
    affil: affiliation(id), entry: entries(id, p, games) }
end

# 대회 출전 상태: 그 대회 출전 명단(홈피 선수 정보의 대회 목록 = results, 진행 중 대회는 site_tours 이름으로)에 있는지와 경기 기록으로
#  'played'  = 경기를 뛰었음 (서바이벌 시절처럼 그 라운드에 1:1 경기 자체가 없던 대회도 여기)
#  'forfeit' = 명단에는 있는데 경기 기록이 없음(또는 기권 0:0 경기뿐) — 그 대회에 탈락 라운드의 1:1 경기가 있었는데 이 선수 경기만 없을 때
#  'pending' = 진행 중 대회 명단에 있고 아직 경기 전
#  명단에 없는 대회는 넣지 않음(화면에서 '불참')
def entries(id, p, games)
  out = {}
  by_tour = games.group_by { |g| g['tour'] }
  played = ->(gs) { gs.any? { |g| g['pts'].to_i > 0 || (g['sets'] || []).any? { |x| x['opp_pts'].to_i > 0 } } }
  results = rows('SELECT r.tour, r.result FROM results r WHERE r.player = ?', id)
  results.each do |r|
    gs = by_tour[r['tour']] || []
    next out[r['tour']] = 'played' if played.(gs)
    next out[r['tour']] = 'forfeit' if gs.any?
    res = r['result'].to_s
    round_has_games = if res =~ /\A\d+\z/ then rows('SELECT 1 FROM games WHERE tour = ? AND round_code = ? LIMIT 1', r['tour'], res.to_i).any?
                      elsif %w[Q PQ PPQ].include?(res) then rows('SELECT 1 FROM games WHERE tour = ? AND round_raw = ? LIMIT 1', r['tour'], res).any?
                      else false
                      end
    out[r['tour']] = round_has_games ? 'forfeit' : 'played'
  end
  # 진행 중 대회: 홈피 목록에 '진행중'으로 있으면 명단에 있는 것
  live = rows("SELECT code, name FROM tours WHERE type = ? AND status != '종료'", p['type'])
  (p['site_tours'] || []).each do |st|
    t = live.find { |x| x['name'].gsub(/\s/, '') == st['name'].to_s.gsub(/\s/, '') } or next
    gs = by_tour[t['code']] || []
    out[t['code']] ||= played.(gs) ? 'played' : gs.any? ? 'forfeit' : 'pending'
  end
  by_tour.each { |code, gs| out[code] ||= played.(gs) ? 'played' : 'forfeit' }
  out
end

# 시즌별 소속: 팀리그 명단(team.db rosters, 회원 코드로 연결)의 팀 + 드림·챌린지투어 경기 수(data/subtours.json, subtours.rb)
#  { 시즌 => { team:, team_name:, dream:, challenge: } } — 화면에서 팀이 없으면 PBA·드림·챌린지 중 그 시즌 가장 많이 뛴 투어로 표시
def affiliation(id)
  out = Hash.new { |h, k| h[k] = {} }
  tdb_path = File.join(ROOT, 'data', 'team.db')
  if File.exist?(tdb_path)
    @team_affil = nil if @team_affil_mtime != File.mtime(tdb_path)
    @team_affil_mtime = File.mtime(tdb_path)
    @team_affil ||= begin
      tdb = SQLite3::Database.new(tdb_path, readonly: true)
      tdb.execute(%q(SELECT r.mem, l.season, r.team, t.name, t.short FROM rosters r JOIN leagues l ON l.league = r.league
                     LEFT JOIN teams t ON t.code = r.team AND t.league = r.league WHERE r.mem IS NOT NULL ORDER BY l.season, r.ord))
         .each_with_object({}) { |(mem, season, team, name, short), h| (h[mem] ||= {})[season] ||= { 'team' => team, 'team_name' => short || name } }
    ensure
      tdb&.close
    end
    (@team_affil[id] || {}).each { |season, v| out[season].merge!(v) }
  end
  sub_path = File.join(ROOT, 'data', 'subtours.json')
  if File.exist?(sub_path)
    @subtours = nil if @subtours_mtime != File.mtime(sub_path)
    @subtours_mtime = File.mtime(sub_path)
    @subtours ||= JSON.parse(File.read(sub_path))
    (@subtours[id] || {}).each { |season, v| out[season.to_i].merge!(v) }
  end
  out
end

srv = WEBrick::HTTPServer.new(Port: PORT, BindAddress: '127.0.0.1', AccessLog: [], Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN))
json = ->(res, obj) { res['Content-Type'] = 'application/json; charset=utf-8'; res.body = JSON.generate(obj) }

srv.mount_proc('/api/search') do |req, res|
  q = req.query['q'].to_s.strip.force_encoding('utf-8')
  list = q.empty? ? [] : rows(<<~SQL, "%#{q.gsub(/\s/, '')}%")
    SELECT p.id, p.name, p.type, p.birth, p.photo, COUNT(g.pst) AS n, MAX(g.season) AS last
    FROM players p LEFT JOIN games g ON g.player = p.id
    WHERE REPLACE(p.name, ' ', '') LIKE ? GROUP BY p.id ORDER BY n DESC LIMIT 20
  SQL
  json.(res, list)
end
srv.mount_proc('/api/player') { |req, res| json.(res, player(req.query['id'].to_s.force_encoding('utf-8'))) }
srv.mount_proc('/api/h2h') do |req, res|
  a = req.query['a'].to_s.force_encoding('utf-8'); b = req.query['b'].to_s.force_encoding('utf-8')
  mine = rows(%q(SELECT g.*, t.name AS tour_name, o.sets AS opp_raw FROM games g JOIN tours t ON t.code = g.tour LEFT JOIN games o ON o.pst = g.pst AND o.player = g.opp WHERE g.player = ? AND g.opp = ? ORDER BY g.date, g.pst), a, b)
    .map { |g| raw = g.delete('opp_raw'); x = game_json(g); add_flow!(x['sets'], raw, g['type']); x }
  theirs = rows(%q(SELECT * FROM games WHERE player = ? AND opp = ?), b, a).map { |g| game_json(g) }.each_with_object({}) { |g, h| h[g['pst']] = g }
  json.(res, mine.map { |g| o = theirs[g['pst']] || {}; g.merge('opp_sets' => o['sets'], 'opp_avg' => o['avg'], 'opp_hr' => o['hr'], 'opp_tiebreak' => o['tiebreak']) })
end
# 공식 시즌 순위·기록 (pbatour 선수 정보 → 이번 시즌 기록의 '순위' 칸과 같은 자료). 선수를 열 때 받아서 10분 동안 다시 쓴다
#  rank: 포인트·상금 순위 / season: 그 시즌 기록과 항목별 순위 / tour: 그 대회 기록과 대회 안 순위
official_cache = {}
pba_json = lambda do |path|
  out, st = Open3.capture2('curl', '-sL', '--max-time', '12', '-A', 'Mozilla/5.0', '-e', 'https://www.pbatour.org/ko/stats/player/index', "https://www.pbatour.org/ko/stats/service/#{path}")
  st.success? && out.start_with?('{') ? ((JSON.parse(out.force_encoding('utf-8'))['result'] || {})['list'] || [])[0] : nil
rescue
  nil
end
srv.mount_proc('/api/official') do |req, res|
  id = req.query['id'].to_s.force_encoding('utf-8')[/\AM\d+\z/].to_s
  season = req.query['season'].to_i; tour = req.query['tour'].to_i
  type = req.query['type'].to_s == 'LPBA' ? 'LPBA1' : 'PBA1'
  key = [id, season, tour, type]
  hit = official_cache[key]
  if !hit || Time.now - hit[0] > 600
    v = { rank: pba_json.("rank?seasonCode=#{season}&pbaType=#{type}&memCode=#{id}"),
          season: pba_json.("season?seasonCode=#{season}&tourCode=0&memCode=#{id}&pbaType=#{type}"),
          tour: tour > 0 ? pba_json.("season?seasonCode=#{season}&tourCode=#{tour}&memCode=#{id}&pbaType=#{type}") : nil }
    official_cache[key] = hit = [Time.now, v]
  end
  json.(res, hit[1])
end
# 웰컴톱랭킹(계산값) 전체 기록: 수상자·에버·달성 라운드
srv.mount_proc('/api/awards') do |req, res|
  type = req.query['type'].to_s.force_encoding('utf-8')
  json.(res, rows(<<~SQL, type))
    SELECT a.tour, a.player, a.avg, a.pst, a.round_desc, t.name AS tour_name, t.season, t.seq, COALESCE(p.name, a.site_name) AS player_name,
           g.round_raw, g.round_code, g.opp_name, g.win, g.sw, g.sl, g.date
    FROM awards a JOIN tours t ON t.code = a.tour LEFT JOIN players p ON p.id = a.player
    LEFT JOIN games g ON g.pst = a.pst AND g.player = a.player
    WHERE t.type = ? ORDER BY a.avg DESC
  SQL
end
# 리그 평균 계산용: 한 종목의 모든 경기 (이닝별 득점 목록은 빼서 가볍게)
league_cache = {}
srv.mount_proc('/api/league') do |req, res|
  type = req.query['type'].to_s.force_encoding('utf-8')   # 바이너리 문자열은 SQLite 에 BLOB 으로 넘어가 비교가 안 된다
  key = [type, File.mtime(DB_PATH)]
  league_cache[key] ||= begin
    list = rows('SELECT g.player, g.player_name, g.tour, g.season, g.seq, g.round_raw, g.round_code, g.single, g.win, g.sw, g.sl, g.avg, g.hr, g.pts, g.inn, g.ball, g.shutout, g.tiebreak, g.sets, g.target, o.sets AS opp_raw FROM games g LEFT JOIN games o ON o.pst = g.pst AND o.player = g.opp WHERE g.type = ?', type)
    list = list.map { |g| raw = g.delete('opp_raw'); g.merge('sets' => add_flow!(JSON.parse(g['sets'] || '[]'), raw, type).map { |s| s.reject { |k, _| k == 'runs_list' } }, 'tiebreak' => g['tiebreak'] && JSON.parse(g['tiebreak'])) }
    $stderr.puts "league #{type}: #{list.size}"
    JSON.generate(list)
  end
  res['Content-Type'] = 'application/json; charset=utf-8'
  res.body = league_cache[key]
end
# ── 실시간: 진행 중인 개인투어 경기(끝난 세트 포함)와 팀리그 경기 ──
require_relative 'lib/live'
# players= 로 받은 선수가 뛰는 경기만 세트 상세를 받는다 (나머지는 목록만: 홈피 요청을 줄이려고). team=0 이면 팀리그는 안 본다
# 진행 중 경기의 세트제(몇 세트 선승): 그 시즌 같은 라운드 경기에서 가장 많은 값 (없으면 전 시즌). 선수 개인 옛 기록으로 짐작하면 틀린다
#  (예: 준결승은 21-22 시즌까지 3선승, 22-23 시즌부터 4선승)
def live_target(type, round, season)
  code = round.to_s == '결승' ? '2' : round.to_s =~ /준결승|4강/ ? '4' : round.to_s[/\d+/]
  return nil unless code
  [season, season.to_i - 1].each do |ss|
    r = rows('SELECT target, COUNT(*) AS n FROM games WHERE type = ? AND round = ? AND season = ? AND target IS NOT NULL GROUP BY target ORDER BY n DESC LIMIT 1', type, code, ss).first
    return r['target'] if r
  end
  nil
end
srv.mount_proc('/api/live') do |req, res|
  out = { at: Time.now.strftime('%H:%M:%S'), indiv: [], team: [] }
  want = req.query['players'].to_s.split(',')
  begin
    tours = JSON.parse(File.read(File.join(ROOT, 'data', 'tours.json'))).select { |t| t['status'] == '진행중' }
    season_of = tours.map { |t| [t['code'], t['season']] }.to_h
    out[:indiv] = Live.individual(tours).map do |m|
      m = m.merge(target: live_target(m[:type], m[:round], season_of[m[:tour]]))
      next m.merge(done_sets: []) unless m[:players].any? { |p| want.include?(p[:code]) }
      d = Live.detail(m[:tour], m[:pst])
      names = m[:players].map { |p| p[:name] }
      # 세트마다 기록지(이닝별 1P·2P)에서 이닝 점수(1P + 2P×2)와 뱅크샷 수를 뽑는다. 진행 중인 세트도 기록지는 이닝마다 채워진다.
      #  홈피는 세트를 최근 것부터 주고 진행 중 세트 이름이 틀릴 때가 있어, 순서로 세트 번호를 붙인다
      list = d[:sets] || []
      all = list.each_with_index.map do |s, i|
        by = ->(n) { s[:players].find { |p| p[:name] == n } || {} }
        rec = s[:record] || {}
        side = ->(n) { k = (rec[:names] || []).index(n); k && (k.zero? ? :a : :b) }
        rows = names.map { |n| (key = side.(n)) ? (rec[:innings] || []).map { |x| x[key] }.reject { |x| x.nil? || x[0].nil? } : [] }
        { no: list.size - i, label: s[:label], pts: names.map { |n| by.(n)[:pts] }, inn: by.(names[0])[:inn], win: names.map { |n| by.(n)[:win] },
          first: rec[:first], runs: rows.map { |r| r.map { |x| x[0].to_i + 2 * x[1].to_i } }, bank: rows.map { |r| r.sum { |x| x[1].to_i } },
          done: s[:players].any? { |p| p[:win] } }
      end
      m.merge(done_sets: all.select { |x| x[:done] }, cur_set: all.find { |x| !x[:done] }, round_name: d[:round])
    end
  rescue => e
    out[:indiv_error] = e.message
  end
  out[:team] = req.query['team'] == '0' ? [] : (Live.team rescue [])
  json.(res, out)
end
# ── 팀리그 (data/team.db): 화면이 한 번에 전부 받아서 계산한다 ──
TEAM_DB = File.join(ROOT, 'data', 'team.db')
team_cache = {}
srv.mount_proc('/api/team/all') do |_req, res|
  res['Content-Type'] = 'application/json; charset=utf-8'
  unless File.exist?(TEAM_DB)
    res.body = JSON.generate(leagues: [], teams: [], players: [], games: [])
    next
  end
  sched_path = File.join(ROOT, 'data', 'team_schedule.json')
  key = [File.mtime(TEAM_DB), File.exist?(sched_path) ? File.mtime(sched_path) : nil]
  team_cache.clear unless team_cache[key]
  team_cache[key] ||= begin
    tdb = SQLite3::Database.new(TEAM_DB, readonly: true); tdb.results_as_hash = true
    q = ->(sql) { tdb.execute(sql).map { |r| r.reject { |k, _| k.is_a?(Integer) } } }
    out = JSON.generate(leagues: q.('SELECT * FROM leagues ORDER BY season DESC'), teams: q.('SELECT * FROM teams'),
                        players: q.('SELECT * FROM players'),
                        standings: q.('SELECT * FROM standings ORDER BY league, rank').map { |s| s.merge('stats' => JSON.parse(s['stats'] || '{}')) },
                        post_standings: q.('SELECT * FROM post_standings ORDER BY league, rank'),
                        rosters: q.('SELECT * FROM rosters ORDER BY league, team, ord'),
                        games: q.('SELECT * FROM games ORDER BY date, no').map { |g| g.merge('sets' => JSON.parse(g['sets'])) },
                        schedule: File.exist?(sched_path) ? JSON.parse(File.read(sched_path)) : [],   # 이번 시즌 일정 (team_schedule.rb)
                        built: File.mtime(TEAM_DB).strftime('%Y-%m-%d %H:%M'))
    tdb.close
    out
  end
  res.body = team_cache[key]
end
# 화면(앱 창)에서 난 오류·느린 동작을 data/app_ui.log 에 남긴다 (먹통 원인 찾기용)
srv.mount_proc('/api/uilog') do |req, res|
  msg = req.body.to_s.force_encoding('utf-8').scrub[0, 2000]
  File.open(File.join(ROOT, 'data', 'app_ui.log'), 'a') { |f| f.puts "[#{Time.now.strftime('%F %T')}] #{msg}" } unless msg.empty?
  res.body = ''
end
srv.mount_proc('/api/meta') do |_req, res|
  json.(res, rows("SELECT MAX(date) AS last_date, COUNT(*) / 2 AS matches FROM games").first.merge('built' => [File.mtime(DB_PATH), File.exist?(TEAM_DB) ? File.mtime(TEAM_DB) : Time.at(0)].max.strftime('%Y-%m-%d %H:%M'),
                                                                                                       # 화면 파일이 바뀐 시각: 바뀌면 화면이 스스로 새로고침한다
                                                                                                       'ui' => Dir[File.join(ROOT, 'app', '*')].map { |f| File.mtime(f) }.max.to_f))
end
# 화면 파일은 캐시하지 말라고 알려서(앱 창이 옛 화면을 붙잡지 않게) 그대로 내준다
class NoCacheFiles < WEBrick::HTTPServlet::FileHandler
  def do_GET(req, res)
    super
    res['Cache-Control'] = 'no-cache, no-store'
  end
end
srv.mount('/', NoCacheFiles, File.join(ROOT, 'app'))
trap('INT') { srv.shutdown }
trap('TERM') { srv.shutdown }
$stderr.puts "PBA 앱: http://localhost:#{PORT}"
# 바탕화면 앱(포트 4580)으로 켜졌을 때: 켜자마자 새 경기 결과를 한 번 받고, 그 뒤로 30분마다 (update_app.sh, 겹치면 스스로 건너뜀)
# 개발용 서버(4567)는 업데이트를 돌리지 않는다. AUTO_UPDATE=1 로 강제로 켤 수 있다.
# 앱을 쓰는 동안(화면이 보이면 30초마다 /api/active 를 보냄)에는 30초마다 진행 중 경기 목록(실시간 정보, 투어마다 한 번 요청)을 보고,
#  목록에서 사라진 경기(= 방금 끝난 경기)가 있으면 그 투어만 빠른 업데이트(quick_update.sh). 홈피에 부담이 적은 방식.
$last_active = Time.at(0)
srv.mount_proc('/api/active') { |_req, res| $last_active = Time.now; json.(res, { ok: true }) }
if PORT == 4580 || ENV['AUTO_UPDATE'] == '1'
  Thread.new do
    loop do
      system('/bin/zsh', File.join(ROOT, 'update_app.sh'), out: File::NULL, err: File::NULL)
      sleep 30 * 60
    end
  end
  Thread.new do
    prev_i = prev_t = nil
    quick = ->(*args) { Process.detach(spawn('/bin/zsh', File.join(ROOT, 'quick_update.sh'), *args, out: File::NULL, err: File::NULL)) }
    loop do
      sleep 30
      next (prev_i = prev_t = nil) if Time.now - $last_active > 75   # 앱을 안 쓰는 동안은 쉰다 (다시 쓰기 시작하면 처음부터 비교)
      begin
        tours = JSON.parse(File.read(File.join(ROOT, 'data', 'tours.json'))).select { |t| t['status'] == '진행중' }
        cur = tours.empty? ? [] : Live.individual(tours).map { |m| [m[:tour], m[:pst]] }
        done = prev_i ? prev_i - cur : []
        quick.('indiv', done.map(&:first).uniq.join(',')) unless done.empty?
        prev_i = cur
        curt = (Live.team rescue []).map { |m| "#{m[:t1]}-#{m[:t2]}" }
        quick.('team') if prev_t && !(prev_t - curt).empty?
        prev_t = curt
      rescue => e
        $stderr.puts "빠른 업데이트 확인 실패: #{e.message}"
      end
    end
  end
end
srv.start
