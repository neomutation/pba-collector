#!/usr/bin/env ruby
# encoding: utf-8
# pbatour.org 선수 통계에서 PBA 선수들의 드림투어(PBA2)·챌린지투어(PBA3) 시즌별 경기 수를 모아 data/subtours.json 에 저장한다.
# 앱의 시즌별 소속 표시(팀리그 팀이 없을 때 PBA / 드림 / 챌린지 중 그 시즌 가장 많이 뛴 투어)에 쓴다. LPBA 는 2·3부 기록이 없다.
#   ruby subtours.rb          # 이번 시즌만 새로 받기
#   ruby subtours.rb --all    # 2019-20 시즌부터 전부
require 'json'
require 'open3'
require 'thread'

ROOT = __dir__
DATA = File.join(ROOT, 'data')
OUT = File.join(DATA, 'subtours.json')
now = Time.now
current = now.month < 6 ? now.year - 1 : now.year
seasons = ARGV.include?('--all') ? (2019..current).to_a : [current]

players = JSON.parse(File.read(File.join(DATA, 'players.json'), encoding: 'utf-8')).select { |_, p| p['type'] == 'PBA' }
res = File.exist?(OUT) ? JSON.parse(File.read(OUT)) : {}

def get(url)
  3.times do
    out, st = Open3.capture2('curl', '-sL', '--max-time', '30', '-A', 'Mozilla/5.0', '-e', 'https://www.pbatour.org/ko/stats/player/index', url)
    return JSON.parse(out.force_encoding('utf-8')) if st.success? && out.start_with?('{')
    sleep 1
  end
  nil
end

q = Queue.new
players.each_key { |code| seasons.each { |s| %w[PBA2 PBA3].each { |t| q << [code, s, t] } } }
lock = Mutex.new
$stderr.puts "requests: #{q.size}"
Array.new(6) do
  Thread.new do
    loop do
      item = (q.pop(true) rescue nil) or break
      code, season, t = item
      j = get("https://www.pbatour.org/ko/stats/service/tour?memCode=#{code}&seasonCode=#{season}&pbaType=#{t}")
      next $stderr.puts("! #{code} #{season} #{t}") unless j
      n = ((j['result'] && j['result']['list']) || []).sum { |x| x['경기수'].to_i }
      lock.synchronize do
        h = ((res[code] ||= {})[season.to_s] ||= {})
        key = t == 'PBA2' ? 'dream' : 'challenge'
        n > 0 ? h[key] = n : h.delete(key)
        res[code].delete(season.to_s) if h.empty?
        res.delete(code) if res[code].empty?
      end
    end
  end
end.each(&:join)
File.write(OUT, JSON.generate(res))
$stderr.puts "saved #{res.size} players with 2부/3부 records"
