# encoding: utf-8
# 시즌비교 시트의 끊어진 연결(#REF!)을 새 시트(2627 형식)에서 끌어오도록 다시 만든다.
#   ruby fix_sb.rb <원본시즌비교수식.json> <현재시즌비교수식.json> <현재값.json(_sb)> <출력.json> [강동궁처럼 2026 구간을 새로 붙일 때: --extend]
require 'json'
orig = JSON.parse(File.read(ARGV[0]))
cur  = JSON.parse(File.read(ARGV[1]))
valj = JSON.parse(File.read(ARGV[2])); vals = valj['data'].each_slice(2).map(&:first)
out_path = ARGV[3]; extend_26 = ARGV.include?('--extend')
ung = JSON.parse(File.read('tmp/sbf_응꾸응.json'))
ung_vals = JSON.parse(File.read('tmp/ung_sb.json'))['data'].each_slice(2).map(&:first)
orig = ung.merge(orig) { |_k, a, b| (b['f'] =~ /#REF/ ? a : b) } if ARGV.include?('--fallback-ung')   # 원본에도 끊겨 있던 칸은 응꾸응 수식을 본뜬다
require_relative 'lib/sheet'
def colrow(k) k =~ /\A([A-Z]+)(\d+)\z/ ? [$1, $2.to_i] : nil end
label = ->(r) { x = (vals[r - 1] || [])[0]; x.is_a?(Numeric) ? x.to_i : nil }
# 연속된 22,23,.. 라벨 구간(블록) 찾기
blocks = []; r = 2
while r <= 13
  if label.(r) == 22
    r0 = r; r += 1; r += 1 while label.(r) && label.(r) == 22 + (r - r0)
    blocks << (r0...r)
  else r += 1 end
end
block_of = ->(row) { blocks.index { |b| b.cover?(row) } }
ung_counter = { 0 => 6, 1 => 12 }   # 응꾸응에서 2627(26시즌) 줄
edits = {}; notes = []
ref_re = /\A=(\d{4})::우승표 1::(\$?)([A-Z]+)(\$?)(\d+)\z/
orig.each do |k, x|
  cr = colrow(k); next unless cr
  col, row = cr
  m = x['f'].match(ref_re); next unless m
  next unless ARGV.include?('--force') || (cur[k] && cur[k]['f'] =~ /#REF/)          # 끊어진 칸만 고친다 (--force 면 전부)
  sheet = m[1]
  if row >= 14
    edits[k] = "=#{sheet}::우승표 1::#{m[3]}#{row - 5}"
  elsif row == 1 || (m[3] == 'A')
    v = x['v']; edits[k] = v.nil? ? nil : v          # 옛 시트의 머리글/연도 칸: 새 시트에 없으므로 값으로 둔다
    notes << "#{k}: 값으로 고정 #{v.inspect}"
  else
    bi = block_of.(row)
    lab = label.(row)
    unless bi && lab
      notes << "#{k}: 블록/시즌 라벨 못 찾음 (#{x['f']})"; next
    end
    season_sheet = "#{lab}#{lab + 1}"
    cx = ung["#{col}#{ung_counter[bi]}"]
    cm = cx && cx['f'].match(ref_re)
    unless cm
      notes << "#{k}: 응꾸응 2627 대응 칸 없음 (#{x['f']})"; next
    end
    edits[k] = "=#{season_sheet}::우승표 1::#{cm[2]}#{cm[3]}#{cm[4]}#{cm[5]}"
  end
end
if extend_26
  # 강동궁: 26시즌 줄과 2627 패널을 응꾸응 모양대로 붙인다
  blocks.each_with_index do |b, bi|
    r26 = b.to_a.last + 1
    edits["A#{r26}"] = 26
    ung.each do |k, x|
      cr = colrow(k); next unless cr
      col, row = cr
      next unless row == ung_counter[bi] && (cm = x['f'].match(ref_re))
      edits["#{col}#{r26}"] = "=2627::우승표 1::#{cm[2]}#{cm[3]}#{cm[4]}#{cm[5]}"
    end
  end
  (14..44).each do |row|
    %w[V W X Y].each do |col|
      k = "#{col}#{row}"; x = ung[k]
      if x && (cm = x['f'].match(ref_re))
        edits[k] = "=2627::우승표 1::#{cm[3]}#{row - 5}"
      elsif x
        edits[k] = x['f']     # 같은 시트 안의 계산식
      else
        v = (ung_vals[row - 1] || [])[%w[V W X Y].index(col) + 21]
        edits[k] = v unless v.nil?
      end
    end
  end
end
File.write(out_path, JSON.pretty_generate(edits))
puts "수정할 칸 #{edits.size}개 (값으로 고정 #{notes.count { |n| n.include?('값으로') }}, 못 찾음 #{notes.count { |n| !n.include?('값으로') }})"
notes.reject { |n| n.include?('값으로') }.first(12).each { |n| puts "  ! #{n}" }
notes.select { |n| n.include?('값으로') }.first(8).each { |n| puts "  - #{n}" }
