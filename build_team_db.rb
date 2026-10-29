#!/usr/bin/env ruby
# encoding: utf-8
# data/team/*.json (team_collect.rb) → data/team.db (SQLite)
#   ruby build_team_db.rb
require 'json'
require 'sqlite3'

ROOT = File.expand_path(__dir__ || '.')
DATA = File.join(ROOT, 'data')
DB_PATH = File.join(DATA, 'team.db')
tmp = DB_PATH + '.tmp'
File.delete(tmp) if File.exist?(tmp)
db = SQLite3::Database.new(tmp)
db.execute_batch <<~SQL
  CREATE TABLE leagues(league INTEGER PRIMARY KEY, season INTEGER, name TEXT);
  CREATE TABLE teams(code TEXT, league INTEGER, season INTEGER, name TEXT, short TEXT, logo TEXT, PRIMARY KEY(code, league));
  CREATE TABLE games(id TEXT PRIMARY KEY, league INTEGER, season INTEGER, round_code INTEGER, round_no INTEGER, round_label TEXT,
                     post INTEGER, post_code INTEGER, no INTEGER, date TEXT, t1 TEXT, t2 TEXT, s1 INTEGER, s2 INTEGER,
                     avg1 REAL, avg2 REAL, hr1 INTEGER, hr2 INTEGER, winner INTEGER, sets TEXT, stage TEXT);
  CREATE INDEX games_t1 ON games(t1); CREATE INDEX games_t2 ON games(t2);
  CREATE TABLE players(team TEXT, league INTEGER, name TEXT, gender TEXT, pid TEXT, PRIMARY KEY(team, league, name));
  CREATE TABLE standings(league INTEGER, rank INTEGER, team TEXT, name TEXT, logo TEXT, stats TEXT);
  CREATE TABLE post_standings(league INTEGER, rank INTEGER, team TEXT, name TEXT);
  CREATE TABLE rosters(league INTEGER, team TEXT, ord INTEGER, name TEXT, game_name TEXT, mem TEXT, photo TEXT, captain INTEGER, gender TEXT, birth TEXT);
SQL

# 개인투어 DB 에서 선수 성별(PBA=남, LPBA=여)과 사진용 id 를 찾는다
indiv = {}
pba_db = File.join(DATA, 'pba.db')
if File.exist?(pba_db)
  SQLite3::Database.new(pba_db).execute('SELECT id, name, type, photo FROM players').each do |id, name, type, photo|
    k = name.to_s.gsub(/[\s.]/, '')
    (indiv[k] ||= []) << { id: id, type: type, photo: photo }
  end
end
# 예전 시즌은 "다비드 사파타"처럼 전체 이름 → pbatour 전체 이름(fullnames.json)도 같은 선수로 등록
fn = File.join(DATA, 'fullnames.json')
if File.exist?(fn)
  byid = indiv.values.flatten.each_with_object({}) { |x, h| h[x[:id]] = x }
  JSON.parse(File.read(fn)).each { |code, full| (indiv[full.to_s.gsub(/[\s.]/, '')] ||= []) << byid[code] if byid[code] }
end
indiv.each_value(&:uniq!)
bigr = ->(s) { (0...s.size - 1).map { |i| s[i, 2] } }
sim = ->(a, b) { x = bigr.(a); y = bigr.(b); x.empty? || y.empty? ? 0 : (x & y).size.to_f / [x.uniq.size, y.uniq.size].max }
# 이름으로 개인투어 선수 찾기: 그대로 → 성(마지막 단어) → 비슷한 이름(오타·표기 차이)
find_cache = {}
# 표기가 아주 다른 이름 (aliases.json + 팀리그에서만 쓰는 표기)
alias_map = (File.exist?(File.join(ROOT, 'aliases.json')) ? JSON.parse(File.read(File.join(ROOT, 'aliases.json'))) : {})
  .merge('비롤 위마즈' => '우이마즈', 'Caudron' => '쿠드롱', '레펜스' => '레펀스')
find = lambda do |name|
  find_cache[name] ||= begin
    k = (alias_map[name] || alias_map[name.to_s.split.last.to_s] || name).to_s.gsub(/[\s.]/, '')
    c = indiv[k]
    c = indiv[name.split.last.to_s] if (!c || c.size != 1) && name.include?(' ')
    if !c || c.size != 1
      best = indiv.keys.map { |kk| [kk, sim.(kk, k)] }.max_by { |_, s| s }
      c = best && best[1] >= 0.5 ? indiv[best[0]] : nil
    end
    c && c.map { |x| x[:type] }.uniq.size == 1 ? c : nil
  end
end
gender = ->(name) { c = find.(name); c ? (c[0][:type] == 'LPBA' ? 'F' : 'M') : nil }
pid = ->(name) { c = find.(name); c && c.size == 1 ? c[0][:id] : nil }

# 세트 종류: 출전 인원과 성별로 판정 (남자복식·여자복식·혼합복식·남자단식·여자단식)
kind = ->(players) do
  gs = players.map { |n| gender.(n) }
  if players.size >= 2
    gs.all? { |g| g == 'F' } ? '여자복식' : gs.include?('F') && gs.include?('M') ? '혼합복식' : gs.all? { |g| g == 'M' } ? '남자복식' : '복식'
  else
    gs[0] == 'F' ? '여자단식' : gs[0] == 'M' ? '남자단식' : '단식'
  end
end

roster = {}
Dir[File.join(DATA, 'team', '*.json')].sort.each do |f|
  j = JSON.parse(File.read(f))
  league = j['league']; season = j['season_code'].to_i
  db.execute('INSERT OR REPLACE INTO leagues VALUES (?,?,?)', [league, season, j['name']])
  db.transaction do
    j['rounds'].each do |r|
      rno = r['number'].to_s[/(\d+)\s*Round/i, 1].to_i
      label = r['post'] ? '포스트시즌' : "#{rno}R"
      r['games'].each do |g|
        next unless g['teams'] && g['teams'].size == 2
        g['sets'] ||= []   # 홈피에 세트 상세가 없는 경기도 최종 스코어로 승패·승점은 센다
        t = g['teams']
        names = g['names'] || []
        t.each_with_index do |tm, i|
          next unless tm['code']
          db.execute('INSERT OR REPLACE INTO teams VALUES (?,?,?,?,?,?)', [tm['code'], league, season, names[i] || tm['short'], tm['short'], (g['logos'] || [])[i]])
        end
        sets = g['sets'].map do |s|
          sd = s['sides'] || []
          next nil if sd.size < 2
          rec = s['record'] || {}
          sum = rec['summary']
          # 기록지 요약 표의 선수별 득점·1P·뱅크샷 (왼쪽 = 팀1, 오른쪽은 '종합'이 먼저 나옴)
          per = nil
          if sum && sum['득점']
            lh = sum['left'] || []; rh = sum['right'] || []
            pick = ->(row, side, head) { (sum[row] || {})[side] || [] }
            per = [[lh, 'left'], [rh, 'right']].map do |head, side|
              head.each_with_index.reject { |n, _| n == '종합' }.map do |n, i|
                { name: n, pts: pick.('득점', side, head)[i].to_i, p1: pick.('1P', side, head)[i].to_i, bank: pick.('뱅크샷', side, head)[i].to_i,
                  rate: pick.('공격성공률', side, head)[i].to_s.delete('%').to_f }
              end
            end
          end
          inn = rec['innings']
          players = sd.map { |x| x['players'] }
          sd.each_with_index do |x, i|
            x['players'].each { |n| roster[[t[i]['code'], league, n]] ||= true }
          end
          k1 = kind.(players[0]); k2 = kind.(players[1])
          { no: s['no'], label: s['label'], date: s['date'], gp: s['gp'], kind: %w[복식 단식].include?(k1) ? k2 : k1, p: players, pts: sd.map { |x| x['pts'] }, inn: sd.map { |x| x['inn'] }, avg: sd.map { |x| x['avg'] }, hr: sd.map { |x| x['hr'] },
            win: sd[0]['win'] ? 1 : (sd[1]['win'] ? 2 : 0), first: rec['first'], tiebreak: rec['tiebreak'], per: per,
            runs: inn && inn.map { |a| a.map { |x| x[0] } }, p1: inn && inn.map { |a| a.sum { |x| x[1] } }, p2: inn && inn.map { |a| a.sum { |x| x[2] } } }
        end.compact
        s1 = t[0]['sets'] || sets.count { |s| s[:win] == 1 }; s2 = t[1]['sets'] || sets.count { |s| s[:win] == 2 }
        id = "#{league}-#{r['code']}-#{r['post_code'] || 0}-#{g['no']}"
        # 포스트시즌 경기는 날짜 자리에 단계 이름("파이널 1경기")이 온다 → 단계 이름은 따로, 날짜는 첫 세트 날짜로
        date = g['date']; stage = nil
        if r['post'] && date.to_s !~ /\A\d{4}-/
          stage = date.to_s.sub(/\s*\d+\s*경기.*\z/, '').strip
          date = sets.map { |s| s[:date] }.compact.min || date
        end
        db.execute('INSERT OR REPLACE INTO games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                   [id, league, season, r['code'], rno, label, r['post'] ? 1 : 0, r['post_code'], g['no'], date, t[0]['code'], t[1]['code'],
                    s1, s2, t[0]['avg'], t[1]['avg'], t[0]['hr'], t[1]['hr'], s1 > s2 ? 1 : 2, JSON.generate(sets), stage])
      end
    end
  end
end
# 공식 순위표: 팀 이름으로 팀 코드를 찾는다 (같은 시즌 경기 상세의 팀 이름과 가장 비슷한 것)
db.transaction do
  Dir[File.join(DATA, 'team', '*.json')].each do |f|
    j = JSON.parse(File.read(f)); league = j['league']
    names = db.execute('SELECT code, name FROM teams WHERE league = ?', [league])
    (j['standings'] || []).each do |s|
      k = s['name'].to_s.gsub(/\s/, '')
      code = names.max_by { |_, n| sim.(n.to_s.gsub(/\s/, ''), k) }
      code = code && sim.(code[1].to_s.gsub(/\s/, ''), k) >= 0.3 ? code[0] : nil
      db.execute('INSERT INTO standings VALUES (?,?,?,?,?,?)', [league, s['rank'], code, s['name'], s['logo'], JSON.generate(s['stats'])])
    end
    (j['post_standings'] || []).each do |s|
      k = s['name'].to_s.gsub(/\s/, '')
      code = names.max_by { |_, n| sim.(n.to_s.gsub(/\s/, ''), k) }
      code = code && sim.(code[1].to_s.gsub(/\s/, ''), k) >= 0.3 ? code[0] : nil
      db.execute('INSERT INTO post_standings VALUES (?,?,?,?)', [league, s['rank'], code, s['name']])
    end
  end
end
db.transaction do
  roster.each_key { |(team, league, n)| db.execute('INSERT OR REPLACE INTO players VALUES (?,?,?,?,?)', [team, league, n, gender.(n), pid.(n)]) }
end
# 홈피 팀 소개 명단(team_roster.rb): 소개 순서·캡틴. 경기 기록의 이름과는 회원 코드 → 비슷한 이름 순으로 잇는다
rp = File.join(DATA, 'team_rosters.json')
# 생년월일: 개인투어 선수정보(회원 코드)에서 → 화면에서 나이순 정렬에 쓴다
births = File.exist?(pba_db) ? SQLite3::Database.new(pba_db).execute('SELECT id, birth FROM players WHERE birth IS NOT NULL').to_h : {}
if File.exist?(rp)
  leagues = db.execute('SELECT league, season FROM leagues').each_with_object({}) { |(l, s), h| h[s] = l }
  db.transaction do
    JSON.parse(File.read(rp)).each do |season, teams|
      league = leagues[season.to_i] or next
      names = db.execute('SELECT code, name FROM teams WHERE league = ?', [league])
      teams.each do |t|
        k = t['name'].to_s.gsub(/\s/, '')
        code = names.max_by { |_, n| sim.(n.to_s.gsub(/\s/, ''), k) }
        next unless code && sim.(code[1].to_s.gsub(/\s/, ''), k) >= 0.3
        played = db.execute('SELECT name, pid, gender FROM players WHERE team = ? AND league = ?', [code[0], league])
        t['players'].each_with_index do |p, i|
          m = played.find { |_, pd, _| pd && pd == p['mem'] } ||
              played.max_by { |n, _, _| sim.(n.to_s.gsub(/[\s.]/, ''), p['name'].gsub(/[\s.]/, '')) }.then { |x| x && sim.(x[0].to_s.gsub(/[\s.]/, ''), p['name'].gsub(/[\s.]/, '')) >= 0.3 ? x : nil } ||
              played.find { |n, _, _| p['name'].gsub(/\s/, '').end_with?(n.to_s.gsub(/[\s.]/, '')) }
          g = m ? m[2] : gender.(p['name'])
          db.execute('INSERT INTO rosters VALUES (?,?,?,?,?,?,?,?,?,?)', [league, code[0], i, p['name'], m && m[0], p['mem'], p['photo'], p['captain'] ? 1 : 0, g, births[p['mem']]])
        end
      end
    end
  end
end
db.close
File.rename(tmp, DB_PATH)
$stderr.puts "saved #{DB_PATH}"
