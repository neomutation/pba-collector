#!/usr/bin/env ruby
# encoding: utf-8
# 투어별 라운드 경기 수가 대진 규모와 맞는지 점검한다.
require_relative 'lib/model'
tours = Model.tours
bad = []
Dir[File.join(PBA::ROOT, 'data', 'matches', '*.json')].sort.each do |f|
  code = File.basename(f, '.json').to_i
  t = tours[code]
  ms = JSON.parse(File.read(f))
  by = ms.group_by { |m| m['round_code'].to_i }.transform_values(&:size)
  # 본선 라운드(결승~64강)는 코드/2 경기, 예선 라운드는 크기가 투어마다 달라서 제외
  issues = []
  [2, 4, 8, 16, 32, 64, 128].each do |r|
    next unless by.key?(r) || r <= 16
    exp = r / 2
    got = by[r].to_i
    next if r == 32 && t[:name] =~ /월드/ # 조별예선
    next if t[:status] != '종료'
    issues << "#{r}강 #{got}/#{exp}" if got < exp && r <= 64
  end
  empties = ms.sum { |m| m['sets'].count { |s| s['gm'] && (s['record'].nil? || s['record']['innings'].to_a.empty?) } }
  issues << "빈기록 #{empties}" if empties > 0
  bad << [code, t[:name], issues] unless issues.empty?
end
bad.each { |c, n, i| puts "#{c} #{n}: #{i.join(', ')}" }
puts "점검 필요 #{bad.size}개 투어"
