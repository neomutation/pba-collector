# encoding: utf-8
# 경기 입력 영역(머리글 아래 ~ 마지막 줄, J열 ~ 초구 승부치기 열)의 자동 줄바꿈을 해제할 범위 목록을 만든다.
#   ruby wrap_plan.rb <tmp접두사> <시트...> > wrap.json
require 'json'
require_relative 'lib/sheet'
pf = ARGV[0]
out = ARGV[1..-1].map do |name|
  s = SeasonSheet.new(name, "tmp/#{pf}_#{name}.json"); l = s.layout
  { sheet: name, range: "J#{l[:hdr] + 1}:#{SeasonSheet.col_letter(l[:fb_tie])}#{s.rows}" }
end
puts JSON.generate(out)
