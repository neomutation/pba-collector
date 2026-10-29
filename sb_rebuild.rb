# encoding: utf-8
# 시즌비교 시트를 응꾸응 양식으로 다시 만들 때 쓸 수정 목록을 만든다.
#   ruby sb_rebuild.rb <선수공식명> <kdg|cgh> <현재시즌비교(tmp json, 값+수식표시)> <출력.json>
require 'json'
require_relative 'lib/sheet'
player, kind, now_path, out_path = ARGV
ung = JSON.parse(File.read('tmp/sbf_응꾸응.json'))
ung_j = JSON.parse(File.read('tmp/ung_sb.json')); ung_vals = ung_j['data'].each_slice(2).map(&:first)
now_j = JSON.parse(File.read(now_path)); nv = now_j['data'].each_slice(2).map(&:first); nf = now_j['data'].each_slice(2).map(&:last)
rank = JSON.parse(File.read('data/rankings.json'))[player] || {}
col = ->(l) { SeasonSheet.col_letter(l) }
idx = ->(letters) { letters.chars.reduce(0) { |a, ch| a * 26 + ch.ord - 64 } - 1 }
literal = ->(r, c) { (nf[r - 1] || [])[c] == 0 ? (nv[r - 1] || [])[c] : nil }
edits = {}
ref_re = /\A=(\d{4})::우승표 1::(\$?)([A-Z]+)(\$?)(\d+)\z/

# 1) 응꾸응 양식의 교차 시트 수식을 새 시트(2627 형식) 주소로
label = ->(r) { x = (ung_vals[r - 1] || [])[0]; x.is_a?(Numeric) ? x.to_i : nil }
season_row = { 0 => (2..6), 1 => (8..12) }
ung.each do |k, x|
  next unless k =~ /\A([A-Z]+)(\d+)\z/
  c, r = $1, $2.to_i
  m = x['f'].match(ref_re) or next
  if r >= 14
    edits[k] = "=#{m[1]}::우승표 1::#{m[3]}#{r - 5}"
  elsif r == 1 || m[3] == 'A'
    edits[k] = x['v']                                   # 옛 시트 머리글/연도 칸 → 값 (새 시트엔 없음)
  else
    bi = season_row.keys.find { |b| season_row[b].cover?(r) } or next
    lab = label.(r) or next
    cx = ung["#{c}#{bi.zero? ? 6 : 12}"]; cm = cx && cx['f'].match(ref_re) or next
    edits[k] = "=#{lab}#{lab + 1}::우승표 1::#{cm[2]}#{cm[3]}#{cm[4]}#{cm[5]}"
  end
end
edits['M1'] = player

# 2) 응꾸응 개인 값 비우기 → 대상 선수 값 넣기
(2..9).each { |r| %w[N O P Q].each { |c| edits["#{c}#{r}"] = nil } }
(2..9).each { |r| (idx['AG']..idx['AP']).each { |c| edits["#{col.(c)}#{r}"] = nil } }
(2..9).each { |r| %w[AR AS].each { |c| edits["#{c}#{r}"] = nil } }
stat_cols = kind == 'kdg' ? %w[N O Q R] : %w[N O P Q]        # 강동궁은 공타 열이 하나 더 있어서 뺀다
tour_from = kind == 'kdg' ? idx['Y'] : idx['AD']
(2..9).each do |r|
  stat_cols.each_with_index { |sc, i| v = literal.(r, idx[sc]); edits["#{%w[N O P Q][i]}#{r}"] = v unless v.nil? }
  10.times { |i| v = literal.(r, tour_from + i); edits["#{col.(idx['AG'] + i)}#{r}"] = v unless v.nil? }
  year = 2019 + (r - 2); rk = rank[year.to_s]
  if rk
    edits["AR#{r}"] = rk['prize_rank'].to_i if rk['prize_rank']
    edits["AS#{r}"] = rk['points_rank'].to_i if rk['points_rank']
    # 이번 시즌 대표 기록이 비어 있으면 홈피 값으로 채운다
    if year == 2026 && literal.(r, idx['N']).nil? && rk['avg'].to_f > 0 && edits["N#{r}"].nil?
      edits["N#{r}"] = rk['avg']; edits["O#{r}"] = rk['bank']; edits["P#{r}"] = rk['long']; edits["Q#{r}"] = rk['success']
    end
  end
end
File.write(out_path, JSON.pretty_generate(edits))
puts "수정 #{edits.size}칸 (수식 #{edits.values.count { |v| v.is_a?(String) && v.start_with?('=') }}, 값 #{edits.values.count { |v| !(v.is_a?(String) && v.start_with?('=')) && !v.nil? }}, 비우기 #{edits.values.count(&:nil?)})"
