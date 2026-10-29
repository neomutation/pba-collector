#!/usr/bin/env ruby
# encoding: utf-8
# 시즌비교 시트의 투어별 성적 칸(1~10차 투어)에서 비어 있는 칸을 채울 계획을 만든다.
#   ruby plan_summary.rb <공식명> <tmp접두사>   (tmp/<접두사>_sb.json 필요)
require 'json'
require_relative 'lib/results'
require_relative 'lib/sheet'

player, prefix = ARGV[0], ARGV[1]
only_seasons = ARGV[2..-1].map { |x| 2000 + x[0, 2].to_i }   # 시즌 시트가 있는 시즌만 (비어 있으면 전부)
j = JSON.parse(File.read(File.join(__dir__, 'tmp', "#{prefix}_sb.json")))
vals = j['data'].each_slice(2).map(&:first); fml = j['data'].each_slice(2).map(&:last)
v = ->(r, c) { (vals[r - 1] || [])[c] }
# 머리글(1행)에서 1,2,3... 이 이어지는 칸을 찾는다 (수식 칸 제외)
first = (20...j['cols']).find { |c| v.(1, c).to_s =~ /\A1(\.0)?\z/ && fml[0][c] == 0 && v.(1, c + 1).to_s =~ /\A2/ }
(warn('시즌비교에 투어별 성적 칸이 없어 건너뜀'); puts('[]'); exit) unless first
cells = {}; report = []
Results.tour_results(player).each do |t|
  next if t[:result].nil?
  next unless only_seasons.empty? || only_seasons.include?(t[:season])
  row = 5 + (t[:season] - 2022)   # 5행=22-23 시즌 ... 9행=26-27 시즌
  tinfo = Model.tours[t[:tour]]
  regular = Model.tours.values.count { |x| x[:type] == tinfo[:type] && x[:season] == tinfo[:season] && x[:seq] != 'F' }
  col = first + (t[:seq] == 'F' ? regular : t[:seq].to_i - 1)   # 월드챔피언십은 일반 투어 바로 다음 칸
  name = SeasonSheet.col_letter(col) + row.to_s
  cur = v.(row, col)
  if cur.nil? || cur.to_s.strip.empty?
    cells[name] = t[:result]; report << "채움 #{name}=#{t[:result]} (#{t[:season]} #{t[:seq]}차)"
  elsif cur.to_i != t[:result]
    cells[name] = t[:result]; report << "바꿈 #{name}: #{cur} → #{t[:result]} (#{t[:season]} #{t[:seq]}차)"
  end
end
$stderr.puts report.join("\n")
puts JSON.pretty_generate([{ sheet: '시즌비교', cells: cells }])
