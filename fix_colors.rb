# encoding: utf-8
# 입력 영역에 남은 템플릿 채우기 색을 찾아 같은 열 이웃 칸의 스타일을 붙여 없앤다.
#   ruby fix_colors.rb <문서이름> <선수공식명> <tmp접두사> <시트...>   (문서가 열려 있어야 함)
require 'json'
require_relative 'lib/sheet'
doc, player, pf = ARGV[0], ARGV[1], ARGV[2]; sheets = ARGV[3..-1]
sheets.each { |s| system('osascript', '-l', 'JavaScript', 'extract.js', doc, s, File.join(Dir.pwd, 'tmp', "#{pf}_#{s}.json"), 'values', out: File::NULL) }
plan = JSON.parse(`ruby -Eutf-8 plan.rb "#{player}" #{pf} #{sheets.join(' ')}`)
expected = Hash.new { |h, k| h[k] = {} }
plan.each { |p| (p['colors'] || {}).each { |c, v| expected[p['sheet']][c] = v } }
sheets.each do |s|
  hdr = SeasonSheet.new(s, File.join('tmp', "#{pf}_#{s}.json")).layout[:hdr]
  out = File.join(Dir.pwd, 'tmp', "color_#{pf}_#{s}.json")
  system('osascript', '-l', 'JavaScript', 'colorscan.js', doc, s, (hdr + 1).to_s, out, out: File::NULL)
  colored = JSON.parse(File.read(out)).map { |x| x['cell'] }
  (colored - expected[s].keys).each do |cell|
    col, row = cell.match(/\A([A-Z]+)(\d+)\z/).captures
    neighbor = [row.to_i - 1, row.to_i + 1].map { |r| "#{col}#{r}" }.find { |c| !colored.include?(c) } or next
    system('./restyle_cell.sh', doc, s, cell, neighbor)
    puts "색 제거: #{s} #{cell} (스타일 본뜸: #{neighbor})"
  end
end
