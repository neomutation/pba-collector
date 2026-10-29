#!/usr/bin/env ruby
# encoding: utf-8
# PBA 팀리그(team.pbatour.org) 경기 결과를 모은다: 시즌 → 라운드 → 경기 → 세트(출전 선수·점수) → 기록지(이닝별 득점)
#   ruby team_collect.rb            # 전 시즌 (이미 받은 기록지는 캐시 사용)
#   ruby team_collect.rb --current  # 가장 최근 시즌(정규·포스트)만
# 결과: data/team/<LeagueCode>.json
require 'json'
require 'open3'
require 'digest'
require 'fileutils'
require 'nokogiri'
require 'thread'
require 'uri'

ROOT = File.expand_path(__dir__ || ".")
OUT = File.join(ROOT, 'data', 'team')
CACHE = File.join(ROOT, 'cache_team')
FileUtils.mkdir_p(OUT); FileUtils.mkdir_p(CACHE)
BASE = 'https://team.pbatour.org'
CURRENT_ONLY = ARGV.include?('--current')

def log(m) $stderr.puts "[#{Time.now.strftime('%H:%M:%S')}] #{m}" end

# GET/POST. cache=true 면 한 번 받은 응답을 다시 쓴다 (끝난 경기의 기록은 바뀌지 않음)
def fetch(path, form = nil, cache: true, refresh: false, referer: "#{BASE}/mob/ko/plan.asp")
  url = BASE + path
  key = Digest::MD5.hexdigest(url + form.to_s)
  file = File.join(CACHE, key)
  return File.read(file, encoding: 'utf-8') if cache && !refresh && File.exist?(file) && File.size(file) > 0
  args = ['curl', '-sL', '--max-time', '40', '-A', 'Mozilla/5.0', '-e', referer]
  args += ['--data', URI.encode_www_form(form)] if form
  out = nil
  3.times do |i|
    out, st = Open3.capture2(*args, url)
    out.force_encoding('utf-8')
    break if st.success? && !out.empty?
    sleep 1 + i
  end
  File.write(file, out) if cache && out && !out.empty?
  out.to_s
end

def clean(s) s.to_s.gsub(/[[:space:]]+/, ' ').strip end
def num(s) x = clean(s).delete(',%'); x =~ /\A-?\d+(\.\d+)?\z/ ? (x.include?('.') ? x.to_f : x.to_i) : nil end

# 1) 시즌 목록 (정규리그 2026, 포스트시즌 2025_PS …)
def seasons
  h = fetch('/mob/ko/plan.asp', nil, cache: false)
  Nokogiri::HTML(h).css('select#SeasonCode option').map { |o| [o['value'], clean(o.text)] }
end

# 2) 시즌의 라운드 링크 → LeagueCode 와 라운드 이름·기간·상태
def season_rounds(code)
  h = fetch('/mob/code_behind/getPlanLeagueList.asp', { 'SeasonCode' => code, 'LangCode' => 'ko' }, cache: false)
  Nokogiri::HTML(h).css('a[href*="LeagueCode="]').map do |a|
    { league: a['href'][/LeagueCode=(\d+)/, 1].to_i, round: a['href'][/RoundCode=(\d+)/, 1].to_i,
      title: clean(a.at_css('h4')&.text), period: clean(a.css('p.sub_txt').first&.text), status: clean(a.css('p.sub_txt').last&.text).sub(/\A상태 : /, '') }
  end
end

# 3) 라운드 선택 옵션 "93|3 Round|N" (N = 정규, Y = 포스트시즌)
def round_options(league, round)
  h = fetch("/mob/ko/planDetailEnd.asp?LeagueCode=#{league}&RoundCode=#{round}", nil, cache: false)
  opts = Nokogiri::HTML(h).css('select#RoundCode option').map { |o| o['value'].to_s.split('|') }.select { |v| v.size >= 2 }
  posts = h.scan(/getPlanDetailPost\('?(\w+)'?\)/).flatten.uniq
  [opts, posts, h]
end

# 4) 라운드의 경기 목록
def round_games(rc, rnum, done, post_code = nil)
  form = { 'RoundCode' => rc, 'RoundNumber' => rnum, 'LCTCode' => '', 'LangCode' => 'ko', 'IsCompleted' => 'Y' }
  path = '/mob/code_behind/getPlanDetailEnd_new2.asp'
  if post_code   # 포스트시즌은 단계(PostCode)별로 따로 받는다
    form = { 'PostCode' => post_code, 'RoundCode' => rc, 'LangCode' => 'ko', 'IsCompleted' => 'Y', 'LCTCode' => '' }
    path = '/mob/code_behind/getPlanDetailPost_new.asp'
  end
  h = fetch(path, form, cache: done)
  h.split('<div class="proud_box_set">')[1..-1].to_a.map do |chunk|
    d = Nokogiri::HTML('<div>' + chunk)
    no = chunk[/viewResult\('?(\d+)'?\)/, 1] or next
    codes = chunk[/viewRanktOther\('(\w+)','(\w+)'\)/] ? [$1, $2] : [nil, nil]
    rows = d.css('li.player_end, ul.win_lost_block01_set > li').reject { |li| li.text.include?('Result') }.first(2)
    teams = rows.each_with_index.map do |li, i|
      sp = li.css('span.t_set, span.t_high, span.t_avg').map { |x| clean(x.text) }
      { code: codes[i], short: clean(li.at_css('.t_name')&.text), sets: num(li.at_css('.t_set')&.text),
        avg: num(li.css('.t_high')[0]&.text), hr: num(li.css('.t_high')[1]&.text), win: !li.at_css('.icon_win').nil? }
    end
    { no: no.to_i, date: clean(d.at_css('.t14')&.text), teams: teams }
  end.compact
end

# 5) 경기 상세: 세트별 출전 선수·점수/이닝·에버·하이런, 기록지 코드
def game_detail(rc, rnum, no, done, refresh = false)
  h = fetch('/mob/code_behind/getPlanResult_new.asp', { 'RoundCode' => rc, 'RoundNumber' => rnum, 'TeamGameNO' => no, 'LangCode' => 'ko' }, cache: done, refresh: refresh)
  d = Nokogiri::HTML(h)
  names = d.css('th.bg01 .player_name').map { |x| clean(x.text) }.first(2)
  logos = d.css('img.photo').map { |x| x['src'] }.first(2)
  sets = h.split('<div class="set_box">')[1..-1].to_a.map do |chunk|
    sd = Nokogiri::HTML('<div>' + chunk)
    label = clean(sd.at_css('.no_order')&.text)
    t14 = sd.css('.t14').map { |x| clean(x.text) }
    lis = sd.css('ul.win_lost_block01 > li').reject { |li| li.text.include?('Result') }
    sides = lis.first(2).map do |li|
      pi = clean(li.at_css('.t_set')&.text)
      { players: li.at_css('.t_name').inner_html.split(/<br\s*\/?>/).map { |x| clean(Nokogiri::HTML(x).text) }.reject(&:empty?),
        win: !li.at_css('.icon_win').nil?, pts: pi[/(\d+)\s*P/, 1]&.to_i, inn: pi[/\/\s*(\d+)/, 1]&.to_i,
        avg: num(li.at_css('.t_avg')&.text), hr: num(li.at_css('.t_high')&.text) }
    end
    { label: label, no: label[/SET\s*(\d+)/i, 1]&.to_i, date: t14[0], gp: t14.find { |x| x =~ /GP/ }.to_s[/\d+/]&.to_i,
      tg: chunk[/viewResultDetail\('?(\d+)'?\)/, 1]&.to_i, sides: sides }
  end
  { names: names, logos: logos, sets: sets }
end

# 6) 기록지: 선수별 요약(득점·이닝·공격성공률·1P·뱅크샷), 선공, 이닝별 득점
def set_record(league, rc, tg)
  h = fetch("/mob/ko/planResultDetail.asp?LeagueCode=#{league}&RoundCode=#{rc}&TGCode=#{tg}")
  v = ->(name) { h[/var #{name}\s*=\s*"([^"]*)"/, 1] }
  d = Nokogiri::HTML(h)
  tbl = d.css('table').find { |t| t.text.include?('공격성공률') }
  summary = nil
  if tbl
    rows = tbl.css('tr').map { |tr| tr.css('th,td').map { |c| clean(c.text) } }
    head = rows.find { |r| r.include?('구분') }
    if head
      ci = head.index('구분')
      summary = { left: head[0...ci], right: head[(ci + 1)..-1] }
      rows.each do |r|
        next unless r.size == head.size && r[ci] != '구분'
        summary[r[ci]] = { left: r[0...ci], right: r[(ci + 1)..-1] }
      end
    end
  end
  # (선공) 표시가 붙은 쪽: 왼쪽 팀 블록 / 오른쪽 팀 블록
  first = nil
  blocks = h.scan(/<div class="team_[^"]*"[^>]*>.*?<\/div>/m)
  idx = h.index('(선공)')
  if idx
    vs = h.index('VS') || h.index('vs')
    first = vs && idx > vs ? 2 : 1
  end
  inn = nil
  t1, t2 = v.('TPTCode1'), v.('TPTCode2')
  if t1 && t2 && !t1.empty?
    j = fetch('/mob/code_behind/getPlanResultDetail.asp', { 'TPTCode1' => t1, 'TPTCode2' => t2 }, referer: "#{BASE}/mob/ko/planResultDetail.asp")
    inn = (JSON.parse(j) rescue nil)
  end
  { summary: summary, first: first, tiebreak: v.('TieBreakerYN') == 'Y', double: v.('DoubleYN') == 'Y', scotch: v.('ScotchDoubleYN') == 'Y',
    last_inn: v.('LastInn').to_i, inn_limit: v.('InnLimitYN') == 'Y',
    innings: inn && [inn['InnInfo1'], inn['InnInfo2']].map { |a| (a || []).map { |x| [x['InnScore'].to_i, x['OnePoint'].to_i, x['TwoPoint'].to_i] } } }
end

# 7) 정규리그 공식 순위표 (시즌마다 승점 규칙이 달라서 순위는 홈피 값을 그대로 쓴다)
def standings(season_code, league)
  h = fetch('/mob/code_behind/getRankTeam.asp', { 'SeasonCode' => season_code, 'LeagueCode' => league, 'RoundCode' => '', 'LangCode' => 'ko' }, cache: false, referer: "#{BASE}/mob/ko/rankt.asp")
  Nokogiri::HTML(h).css('li').map do |li|
    rank = li.at_css('span.number7') or next
    heads = li.css('thead th').map { |x| clean(x.text) }
    vals = li.css('tr').last.css('td').map { |x| clean(x.text) }
    { rank: clean(rank.text).to_i, name: clean(li.css('span.valign_mid span.valign_mid').first&.text || li.css('span.valign_mid').last&.text),
      logo: li.at_css('img')&.[]('src'), stats: heads.zip(vals).to_h }
  end.compact
end

# 8) 포스트시즌 공식 순위 (1위 = 우승. 정규리그 1위 어드밴티지 등으로 파이널 승패만으로는 알 수 없다)
def post_standings(rc)
  h = fetch('/mob/code_behind/getRankPostTeam.asp', { 'RoundCode' => rc, 'LangCode' => 'ko' }, cache: false, referer: "#{BASE}/mob/ko/rankt.asp")
  Nokogiri::HTML(h).css('#RankTeam > li, li').map do |li|
    t = clean(li.text)
    next unless t =~ /\A(\d+)\s+(.+?)\s+(와일드카드|준플레이오프|플레이오프|파이널)/
    { rank: $1.to_i, name: $2 }
  end.compact.uniq { |x| x[:rank] }
end

def run_league(league, meta)
  out = File.join(OUT, "#{league}.json")
  first_round = meta[:rounds].first
  opts, posts, _ = round_options(league, first_round[:round])
  rounds = []
  stages = []
  opts.each do |rc, rnum, post|
    rmeta = meta[:rounds].find { |r| r[:round] == rc.to_i } || {}
    done = rmeta[:status].to_s.include?('종료')
    if post == 'Y'
      (1..8).each { |pc| gs = round_games(rc, rnum, done, pc); gs.each { |g| g[:post_code] = pc }; stages << [rc, rnum, rmeta, done, gs] unless gs.empty? }
    else
      stages << [rc, rnum, rmeta, done, round_games(rc, rnum, done)]
    end
  end
  stages.each do |rc, rnum, rmeta, done, games|
    q = Queue.new; games.each { |g| q << g }
    lock = Mutex.new
    Array.new(6) do
      Thread.new do
        loop do
          g = (q.pop(true) rescue nil) or break
          begin
            det = game_detail(rc, rnum, g[:no], done)
            # 가끔 빈 응답이 캐시에 남아 세트가 0개로 나온다 → 캐시를 무시하고 다시 받기
            2.times { break unless det[:sets].empty?; sleep 1; det = game_detail(rc, rnum, g[:no], done, true) }
            det[:sets].each { |s| s[:record] = s[:tg] ? set_record(league, rc, s[:tg]) : nil }
            lock.synchronize { g.merge!(det) }
          rescue => e
            log "  ! #{league}/#{rc} 경기 #{g[:no]}: #{e.class} #{e.message[0, 100]}"
          end
        end
      end
    end.each(&:join)
    post_code = games.first && games.first[:post_code]
    rounds << { code: rc.to_i, number: rnum, post: !post_code.nil?, post_code: post_code, title: rmeta[:title], period: rmeta[:period], status: rmeta[:status], games: games.sort_by { |g| g[:no] } }
    log "  #{meta[:name]} #{rnum}#{post_code ? " (단계 #{post_code})" : ''}: #{games.size}경기"
  end
  st = (standings(meta[:code], league) rescue [])
  ps_round = opts.find { |_, _, post| post == 'Y' }
  ps = ps_round ? (post_standings(ps_round[0]) rescue []) : []
  File.write(out, JSON.generate(league: league, season_code: meta[:code], name: meta[:name], rounds: rounds, standings: st, post_standings: ps))
end

# 정규시즌 코드(2025)와 포스트시즌 코드(2025_PS)가 같은 LeagueCode 를 가리켜서, 리그별로 한 번만 받는다
list = seasons
list = list.first(2) if CURRENT_ONLY
leagues = {}
list.each do |code, name|
  season_rounds(code).each do |r|
    l = (leagues[r[:league]] ||= { code: code.sub('_PS', ''), name: name.sub(/\A\[(.*)\]\s*포스트시즌\z/, '\1'), rounds: [] })
    l[:rounds] << r unless l[:rounds].any? { |x| x[:round] == r[:round] }
  end
end
log "리그 #{leagues.size}개"
leagues.each do |league, meta|
  log "#{meta[:name]} (League #{league}, 라운드 #{meta[:rounds].size})"
  run_league(league, meta)
end
log '끝'
