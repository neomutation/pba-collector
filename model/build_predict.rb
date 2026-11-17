# 승부 예측용 자료: 개인투어 선수별 · 시즌별 이닝 득점 수 → app/pdata/ind.json
#  리그 API(/api/league)는 이닝 기록(runs_list)을 빼고 내보내서 화면이 직접 셀 수 없다. update_app.sh · quick_update.sh 가 DB를 만든 뒤 실행한다
#  c = 이닝 득점 0..25점 수 (25 이상은 25칸), x = 세트를 끝낸 마지막 이닝(목표 점수에서 잘린 값, '그 점수 이상') 수
#  화면 폴더(app) 바로 아래 파일이 바뀌면 화면이 새로고침되므로 하위 폴더(pdata)에 제자리 쓰기로 둔다
require 'sqlite3'
require 'json'

R = 25
ROOT = File.expand_path('..', __dir__)
db = SQLite3::Database.new(File.join(ROOT, 'data', 'pba.db'), readonly: true)
now = {}
players = {}
prior = Hash.new { |h, k| h[k] = Array.new(R + 1, 0) }
db.execute('SELECT player, player_name, type, season, sets FROM games').each do |id, name, type, season, sets|
  now[type] = [now[type] || 0, season].max
  ss = JSON.parse(sets || '[]') rescue []
  ss.each do |s|
    runs = s['runs_list']; gp = s['gp'].to_i
    next unless runs.is_a?(Array) && !runs.empty? && gp > 0
    p = players[id] ||= { 'n' => name, 't' => type, 'h' => {} }
    h = p['h'][season.to_s] ||= { 'c' => Array.new(R + 1, 0), 'x' => Array.new(R + 1, 0) }
    tot = 0
    runs.each_with_index do |r0, i|
      r = [r0.to_i, 0].max; tot += r; k = [r, R].min
      if i == runs.size - 1 && tot >= gp then h['x'][k] += 1 else h['c'][k] += 1 end
      prior[type][k] += 1
    end
  end
end
# 오래된 시즌(가중치가 거의 0)은 뺀다
players.each_value { |p| n = now[p['t']]; p['h'].delete_if { |se, _| se.to_i < n - 6 } }
out = { 'built' => Time.now.strftime('%Y-%m-%d %H:%M'), 'now' => now, 'prior' => prior, 'players' => players }
dir = File.join(ROOT, 'app', 'pdata'); Dir.mkdir(dir) unless Dir.exist?(dir)
path = File.join(dir, 'ind.json')
File.open(path, File.exist?(path) ? 'r+' : 'w') { |f| f.truncate(0); f.write(JSON.generate(out)) }
warn "승부 예측 자료: 선수 #{players.size}명 → #{path}"
