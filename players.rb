#!/usr/bin/env ruby
# encoding: utf-8
# 경기 기록에 나온 모든 선수의 홈피 선수정보(전체시즌)를 모아 data/players.json 에 저장한다.
#   ruby players.rb            # 전부 새로 받기
#   ruby players.rb --missing  # 아직 없는 선수만
require 'json'
require 'nokogiri'
require 'thread'
require_relative 'lib/pba'

DATA = File.join(PBA::ROOT, 'data')
OUT = File.join(DATA, 'players.json')
only_missing = ARGV.include?('--missing')

# 경기 기록에서 선수 코드와 종목(PBA/LPBA)을 모은다
tours = JSON.parse(File.read(File.join(DATA, 'tours.json'))).each_with_object({}) { |t, h| h[t['code']] = t }
people = {}
Dir[File.join(DATA, 'matches', '*.json')].each do |f|
  JSON.parse(File.read(f)).each do |m|
    type = tours[m['tour']] && tours[m['tour']]['type']
    m['players'].each { |p| people[p['code']] ||= { 'name' => p['name'], 'type' => type } if p['code'] }
  end
end

def lines(html)
  d = Nokogiri::HTML(html)
  d.css('style,script').remove
  d.at('body').text.tr(" ", " ").split("\n").map(&:strip).reject(&:empty?)
end

def num(s) s.to_s.delete(',%점 ').strip.then { |x| x =~ /\A-?\d+(\.\d+)?\z/ ? (x.include?('.') ? x.to_f : x.to_i) : nil } end

def find_from(a, v, from) (from...a.size).find { |i| a[i] == v } end

def parse(html)
  ls = lines(html)
  val = ->(k) { l = ls.find { |x| x.start_with?("#{k} :") }; l && l.sub("#{k} :", '').strip }
  out = { 'name' => val.('이름'), 'nation' => val.('국적'), 'birth' => val.('생년월일'),
          'photo' => html[/<img src="([^"]+)"[^>]*class="photo/, 1] }
  # 경기통계: 구분 / 열 이름들 / (항목, 값...) 반복. 마지막 열이 종합.
  i = ls.index('경기통계')
  if i && (g = find_from(ls, '구분', i))
    k = find_from(ls, '경기수', g)
    ncol = k - g - 1
    stats = {}
    j = k
    while j < ls.size && !ls[j].start_with?('Update')
      stats[ls[j]] = ls[j + 1, ncol].last
      j += ncol + 1
    end
    out['stats'] = { 'matches' => num(stats['경기수']), 'innings' => num(stats['이닝수']), 'avg' => num(stats['Avg']),
                     'best_avg' => num(stats['Best Avg']), 'hr' => num(stats['HR']), 'p1' => num(stats['1P']), 'p2' => num(stats['2P']),
                     'bank' => num(stats['뱅크샷비율']), 'long' => num(stats['장타율(↑5점)']), 'success' => num(stats['득점성공율']) }
  end
  # 대회성적: 대회명 / 성적 쌍 (최근 대회가 위)
  a = ls.index('대회성적')
  b = find_from(ls, '랭킹', a || 0)
  if a && b
    rows = ls[(a + 3)...b]
    out['tours'] = rows.each_slice(2).map { |n, r| { 'name' => n, 'result' => r } }
    # 랭킹 표: 항목 / 값 / 순위
    rk = ls[(b + 4)..-1].to_a
    take = ->(label) { x = rk.index(label); x && [num(rk[x + 1]), num(rk[x + 2])] }
    out['prize'], out['prize_rank'] = take.('상금랭킹')
    out['points'], out['points_rank'] = take.('PBA 랭킹포인트') || take.('LPBA 랭킹포인트')
  end
  out
end

old = File.exist?(OUT) ? JSON.parse(File.read(OUT)) : {}
q = Queue.new
people.each { |code, p| q << [code, p] unless only_missing && old[code] }
res = old.dup
lock = Mutex.new
$stderr.puts "players: #{q.size}"
Array.new(4) do
  Thread.new do
    loop do
      item = (q.pop(true) rescue nil) or break
      code, p = item
      begin
        html = PBA.get('/mob/contest_new/admin/PBA_player_detail.asp', { playerType: p['type'], MemCode: code, sel_Year: 0 }, false)
        r = parse(html).merge('code' => code, 'type' => p['type'])
        r['name'] = p['name'] if r['name'].to_s.empty?
        lock.synchronize { res[code] = r }
      rescue => e
        $stderr.puts "! #{code} #{p['name']}: #{e.message[0, 100]}"
      end
    end
  end
end.each(&:join)
File.write(OUT, JSON.pretty_generate(res))
$stderr.puts "saved #{res.size}"
