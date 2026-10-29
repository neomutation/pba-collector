#!/usr/bin/env ruby
# encoding: utf-8
# pbatour.org 선수 통계의 대회별 상금·순위·랭킹포인트를 모아 data/prizes.json 에 저장한다.
#   ruby prizes.rb          # 이번 시즌만 새로 받기
#   ruby prizes.rb --all    # 2019-20 시즌부터 전부
require 'json'
require 'open3'
require 'thread'

ROOT = __dir__
DATA = File.join(ROOT, 'data')
OUT = File.join(DATA, 'prizes.json')
now = Time.now
current = now.month < 6 ? now.year - 1 : now.year
seasons = ARGV.include?('--all') ? (2019..current).to_a : [current]

players = JSON.parse(File.read(File.join(DATA, 'players.json')))
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
players.each { |code, p| seasons.each { |s| q << [code, p['type'], s] } }
lock = Mutex.new
NAMES = File.join(DATA, 'fullnames.json')
names = File.exist?(NAMES) ? JSON.parse(File.read(NAMES)) : {}
$stderr.puts "requests: #{q.size}"
Array.new(6) do
  Thread.new do
    loop do
      item = (q.pop(true) rescue nil) or break
      code, type, season = item
      j = get("https://www.pbatour.org/ko/stats/service/tour?memCode=#{code}&seasonCode=#{season}&pbaType=#{type == 'LPBA' ? 'LPBA1' : 'PBA1'}")
      next $stderr.puts("! #{code} #{season}") unless j
      list = (j['result'] && j['result']['list']) || []
      lock.synchronize do
        names[code] = list[0]['MemName'] if list[0] && list[0]['MemName']
        h = (res[code] ||= {})
        h.reject! { |_, v| v['season'] == season }
        list.each do |x|
          h[x['TourCode'].to_s] = { 'season' => season, 'title' => x['TourTitle'], 'prize' => x['상금'].to_i,
                                    'rank' => x['상금순위'], 'points' => x['랭킹포인트'], 'avg' => x['에버리지'], 'hr' => x['하이런'] }
        end
      end
    end
  end
end.each(&:join)
File.write(OUT, JSON.generate(res))
File.write(NAMES, JSON.generate(names))
$stderr.puts "saved #{res.size} players"
