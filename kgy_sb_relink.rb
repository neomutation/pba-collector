# encoding: utf-8
# 김가영 시즌비교: 새 시트(2627 형식)에 맞춰 연결을 다시 만든다.
#   ruby kgy_sb_relink.rb <원본수식.json> <현재값.json> <출력.json>
require 'json'
orig = JSON.parse(File.read(ARGV[0]))
vals = JSON.parse(File.read(ARGV[1]))['data'].each_slice(2).map(&:first)
label = ->(r) { x = (vals[r - 1] || [])[0]; x.is_a?(Numeric) ? x.to_i : nil }
ref_re = /\A=(\d{4}[^:]*)::[^:]*::(\$?)([A-Z]+)(\$?)(\d+)\z/
edits = {}
orig.each do |k, x|
  next unless k =~ /\A([A-Z]+)(\d+)\z/
  c, r = $1, $2.to_i
  next unless x['f'] =~ /::/ && r < 14
  m = x['f'].match(ref_re) or next
  if m[3] == 'A'                       # 옛 시트의 연도 칸 → 값으로
    edits[k] = x['v']; next
  end
  lab = label.(r) or next
  counter = (2..6).cover?(r) ? 6 : 12
  cx = orig["#{c}#{counter}"]; cm = cx && cx['f'].match(ref_re) or next
  edits[k] = "=#{lab}#{lab + 1}::우승표 1::#{cm[2]}#{cm[3]}#{cm[4]}#{cm[5]}"
end
blocks = [%w[B C D E] => '2223', %w[G H I J] => '2324', %w[L M N O] => '2425', %w[Q R S T] => '2526', %w[V W X Y] => '2627']
blocks.each do |h|
  h.each do |cols, sheet|
    (15..53).each do |r|
      cols.each_with_index { |c, j| edits["#{c}#{r}"] = "=#{sheet}::우승표 1::#{%w[B C D E][j]}#{r - 5}" }
    end
  end
end
{ %w[B C] => 22, %w[G H] => 23, %w[L M] => 24, %w[Q R] => 25 }.each { |cs, yr| cs.each { |c| edits["#{c}14"] = yr } }
File.write(ARGV[2], JSON.pretty_generate(edits))
puts "수정 #{edits.size}칸 (상단 #{edits.count { |k, _| k[/\d+/].to_i < 14 }}, 패널 #{edits.count { |k, _| k[/\d+/].to_i >= 15 }})"
