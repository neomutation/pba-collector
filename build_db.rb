#!/usr/bin/env ruby
# encoding: utf-8
# data/matches/*.json + tours.json + players.json → data/pba.db (SQLite)
#   ruby build_db.rb
require 'json'
require 'sqlite3'
require_relative 'lib/model'

DATA = File.join(PBA::ROOT, 'data')
DB_PATH = File.join(DATA, 'pba.db')
tmp = DB_PATH + '.tmp'
File.delete(tmp) if File.exist?(tmp)
db = SQLite3::Database.new(tmp)
db.execute_batch <<~SQL
  CREATE TABLE tours(code INTEGER PRIMARY KEY, type TEXT, season INTEGER, seq TEXT, name TEXT, start TEXT, end_date TEXT, status TEXT, winner TEXT);
  CREATE TABLE players(id TEXT PRIMARY KEY, code TEXT, name TEXT, type TEXT, birth TEXT, nation TEXT, photo TEXT,
                       prize INTEGER, prize_rank INTEGER, stats TEXT, site_tours TEXT);
  CREATE TABLE games(pst INTEGER, tour INTEGER, player TEXT, opp TEXT, player_name TEXT, opp_name TEXT,
                     type TEXT, season INTEGER, seq TEXT, date TEXT, round_code INTEGER, round TEXT, round_raw TEXT,
                     single INTEGER, win INTEGER, sw INTEGER, sl INTEGER, avg REAL, hr INTEGER, pts INTEGER, inn INTEGER,
                     ball TEXT, shutout INTEGER, tiebreak TEXT, sets TEXT, target INTEGER, PRIMARY KEY(pst, player));
  CREATE INDEX games_player ON games(player);
  CREATE INDEX games_pair ON games(player, opp);
  CREATE TABLE results(player TEXT, tour INTEGER, result TEXT, PRIMARY KEY(player, tour));
  CREATE TABLE awards(tour INTEGER, player TEXT, avg REAL, pst INTEGER, round_desc TEXT, site_name TEXT);
  CREATE TABLE prizes(player TEXT, tour INTEGER, season INTEGER, title TEXT, prize INTEGER, rank INTEGER, points INTEGER);
SQL

tours = Model.tours
db.transaction do
  tours.each_value do |t|
    db.execute('INSERT INTO tours VALUES (?,?,?,?,?,?,?,?,?)',
               [t[:code], t[:type], t[:season], t[:seq], t[:name], t[:start], t[:end], t[:status], t[:winner]])
  end
end

pid = ->(code, name) { code ? code : "N:#{name}" }
names = {}   # id → [name, type]
games = []
Dir[File.join(DATA, 'matches', '*.json')].sort.each do |f|
  JSON.parse(File.read(f)).each do |m|
    next unless m['players'] && m['players'].size == 2
    Model.perspectives(m).each_with_index do |r, i|
      me = m['players'][i]; op = m['players'][1 - i]
      id = pid.(me['code'], me['name']); oid = pid.(op['code'], op['name'])
      names[id] = [me['name'], r[:type]]
      # 세트 기록에서 이닝 단위 값(1P/2P, 득점 이닝, 장타 이닝)을 더 뽑는다
      setmap = m['sets'].each_with_object({}) { |s, h| h[Model.set_no(s['label'])] = s }
      sets = r[:sets].map do |s|
        raw = setmap[s[:no]]; rec = raw && raw['record']; p1 = p2 = nil
        if rec && rec['names'] && (k = rec['names'].index(me['name']))
          key = k.zero? ? 'a' : 'b'
          rows = rec['innings'].map { |x| x[key] }.reject { |x| x[0].nil? }
          p1 = rows.sum { |x| x[0].to_i }; p2 = rows.sum { |x| x[1].to_i }
        end
        runs = s[:runs]
        s.merge(p1: p1, p2: p2,
                set_hr: runs && runs.max, scoring: runs && runs.count { |x| x > 0 }, long: runs && runs.count { |x| x >= 5 },
                opp_pts: raw && (o = raw['players'].find { |x| x['name'] != me['name'] }) && o['pts'],
                rec_inn: runs && runs.size, long_pts: runs && runs.select { |x| x >= 5 }.sum,
                mid: runs && runs.count { |x| x.between?(2, 4) }, mid_pts: runs && runs.select { |x| x.between?(2, 4) }.sum,
                runs: nil, runs_list: runs)
      end
      pts = sets.sum { |s| s[:pts].to_i }; inn = sets.sum { |s| s[:inn].to_i }
      round = r[:round_raw].to_s
      games << [r[:pst], r[:tour], id, oid, me['name'], op['name'], r[:type], r[:season], r[:seq].to_s, r[:date],
                r[:round_code], r[:round].to_s, round, r[:single] ? 1 : 0, r[:win] ? 1 : 0, r[:set_score][0], r[:set_score][1],
                me['avg'], me['hr'], pts, inn, r[:ball] == 'white' ? 'ㅎ' : (r[:ball] == 'yellow' ? 'ㄴ' : nil),
                r[:shutout] ? 1 : 0, r[:tiebreak] && JSON.generate(r[:tiebreak].merge(win_flag: r[:tiebreak_win])),
                JSON.generate(sets.map { |s| s.reject { |k, _| k == :runs } })]
    end
  end
end
# 몇 세트를 먼저 이겨야 하는 경기인지: 같은 투어·라운드에서 이긴 쪽 세트 수의 최댓값
target = Hash.new(0)
games.each { |g| k = [g[1], g[10]]; target[k] = [target[k], [g[15].to_i, g[16].to_i].max].max }
games.each { |g| g << target[[g[1], g[10]]] }
db.transaction { games.each { |g| db.execute("INSERT OR REPLACE INTO games VALUES (#{(['?'] * g.size).join(',')})", g) } }
$stderr.puts "games: #{games.size}"

# 선수 정보
prof = File.exist?(File.join(DATA, 'players.json')) ? JSON.parse(File.read(File.join(DATA, 'players.json'))) : {}
db.transaction do
  names.each do |id, (name, type)|
    p = prof[id] || {}
    db.execute('INSERT INTO players VALUES (?,?,?,?,?,?,?,?,?,?,?)',
               [id, id.start_with?('N:') ? nil : id, name, p['type'] || type, p['birth'], p['nation'].to_s.strip, p['photo'],
                p['prize'], p['prize_rank'], p['stats'] && JSON.generate(p['stats']), p['tours'] && JSON.generate(p['tours'])])
  end
end

# 투어별 성적: 홈피 선수정보의 대회성적(순위) 우선, 없으면 경기 기록으로 판정
#  1=우승 2=준우승 3=4강 탈락, 그 외는 탈락 라운드(8,16,32,64,128 …)
site_res = ->(s) do
  case s
  when /\A1위/ then '1'
  when /\A2위/ then '2'
  when /\A3위/ then '3'
  when /\A(\d+)위/
    n = $1.to_i; r = (n - 1) * 2
    (r & (r - 1)).zero? ? r.to_s : "#{n}위"
  when /진행중/ then nil
  else s
  end
end
results = {}
by_player = games.group_by { |g| g[2] }
by_player.each do |id, gs|
  gs.group_by { |g| g[1] }.each do |tour, ms|
    ms = ms.sort_by { |g| [-g[10].to_i, g[0]] }
    last = ms.last
    res = if last[10] == 2 && last[14] == 1 then '1'
          elsif last[10] == 2 then '2'
          elsif last[10] == 4 && last[14].zero? then '3'
          elsif last[14] == 1 then nil
          else (last[12] =~ /강\z/ ? last[12].to_i.to_s : last[12])
          end
    results[[id, tour]] = res if res
  end
end
tour_list = tours.values.sort_by { |t| t[:end].to_s }.reverse
prof.each do |code, p|
  next unless names[code] && p['tours']
  used = {}
  cands = tour_list.select { |t| t[:type] == p['type'] }
  p['tours'].each do |st|
    t = cands.find { |x| !used[x[:code]] && x[:name].gsub(/\s/, '') == st['name'].to_s.gsub(/\s/, '') } or next
    used[t[:code]] = true
    v = site_res.(st['result'])
    results[[code, t[:code]]] = v if v
  end
end
db.transaction { results.each { |(id, tour), v| db.execute('INSERT INTO results VALUES (?,?,?)', [id, tour, v]) } }

# 웰컴(웰뱅)톱랭킹: pbatour.org 공식 수상 목록(topranking.rb). 대회마다 PBA·LPBA 한 명씩 (동률은 세컨드 에버로 이미 가려져 있음)
# 공식 목록엔 선수 전체 이름만 있어서, 같은 시즌·라운드·에버리지의 경기를 찾아 선수와 경기를 연결한다.
tr_path = File.join(DATA, 'topranking.json')
if File.exist?(tr_path)
  norm = ->(s, type) { s.to_s.sub(/\A\[[^\]]*\]\s*/, '').gsub('PBA-LPBA', type).gsub(/\s/, '') }
  bigr = ->(s) { (0...s.size - 1).map { |i| s[i, 2] } }
  sim = ->(a, b) { x = bigr.(a); y = bigr.(b); x.empty? || y.empty? ? 0 : (x & y).size.to_f / [x.uniq.size, y.uniq.size].max }
  rcode = ->(d) { d == '결승' ? 2 : d == '준결승' ? 4 : (d.to_s[/\A(\d+)강/, 1] || 0).to_i }
  missed = []
  fn = File.join(DATA, 'fullnames.json')
  full = File.exist?(fn) ? JSON.parse(File.read(fn)) : {}
  db.transaction do
    JSON.parse(File.read(tr_path)).each do |x|
      season = x['SEASON'].to_s[0, 4].to_i
      %w[PBA LPBA].each do |type|
        name = x["#{type}_NAME"].to_s.strip; v = x["#{type}_DES2"].to_f; desc = x["#{type}_DESCRIPTION"].to_s; rd = rcode.(desc)
        next if name.empty?
        tname = norm.(x['RALLY_NAME'], type)
        cands = games.select { |g| g[6] == type && g[7] == season && (g[17].to_f - v).abs < 0.0006 && (rd.zero? || g[10] == rd) }
        # 대회 이름이 두 사이트에서 조금씩 달라서(연도 꼬리, 단어 순서) 글자 2개씩 겹치는 정도로 가장 비슷한 대회를 고른다
        pick = cands.max_by { |g| tours[g[1]] ? sim.(norm.(tours[g[1]][:name], type), tname) : 0 }
        pick = nil if pick && cands.size > 1 && sim.(norm.(tours[pick[1]][:name], type), tname) < 0.3
        if pick
          db.execute('INSERT INTO awards VALUES (?,?,?,?,?,?)', [pick[1], pick[2], v, pick[0], desc, name])
        else
          # 경기 기록이 없는 대회(서바이벌 시절 등): 대회는 비슷한 이름으로, 선수는 pbatour 전체 이름(fullnames.json)으로 찾는다
          t = tours.values.select { |tt| tt[:type] == type && tt[:season] == season }.max_by { |tt| sim.(norm.(tt[:name], type), tname) }
          t = nil if t && sim.(norm.(t[:name], type), tname) < 0.3
          key = ->(s) { s.to_s.gsub(/[\s.]/, '') }
          code = full.find { |c, n| key.(n) == key.(name) && names[c] && names[c][1] == type }
          pl = code ? [code[0]] : names.find { |_, (n, ty)| ty == type && key.(n) == key.(name) }
          db.execute('INSERT INTO awards VALUES (?,?,?,?,?,?)', [t && t[:code], pl ? pl[0] : "N:#{name}", v, nil, desc, name])
          missed << "#{season} #{type} #{name} #{v} #{x['RALLY_NAME']}"
        end
      end
    end
  end
  $stderr.puts "톱랭킹 경기 연결 못 함 #{missed.size}건 (서바이벌 시절 등 경기 기록 없음):\n  " + missed.join("\n  ") unless missed.empty?
end
# pbatour.org 대회별 상금 (prizes.rb)
pz = File.join(DATA, %q(prizes.json))
if File.exist?(pz)
  db.transaction do
    JSON.parse(File.read(pz)).each do |code, ts|
      ts.each { |tour, x| db.execute(%q(INSERT INTO prizes VALUES (?,?,?,?,?,?,?)), [code, tour.to_i, x[%q(season)], x[%q(title)], x[%q(prize)], x[%q(rank)], x[%q(points)]]) }
    end
  end
end
db.close
File.rename(tmp, DB_PATH)
$stderr.puts "saved #{DB_PATH}"
