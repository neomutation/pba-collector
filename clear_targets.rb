# encoding: utf-8
# 2627 형식 시트에서 지워야 할 입력 칸(수식이 아닌 값) 목록을 만든다.  ruby clear_targets.rb <tpl.json> <out.json>
require 'json'
require_relative 'lib/sheet'
s = SeasonSheet.new('2627', ARGV[0]); l = s.layout
cols = (9..l[:fb_tie]).to_a - [l[:tour]]
cells = []
((l[:hdr] + 1)..s.rows).each do |r|
  cols.each do |c|
    v = s.v(r, c)
    cells << SeasonSheet.col_letter(c) + r.to_s if !v.nil? && !s.formula?(r, c)
  end
end
File.write(ARGV[1], JSON.generate(cells))
puts "clear targets: #{cells.size}"
