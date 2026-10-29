#!/usr/bin/env ruby
# encoding: utf-8
# 수집 데이터(홈피)를 기준으로 선수 파일 시즌 시트의 수정 계획(JSON)을 만든다.
#  - 파일에 없는 경기: 투어 칸의 빈 줄에 새로 쓴다.
#  - 파일에 있는데 홈피와 다른 값: 홈피 값으로 바꾼다 (바꾼 내용은 changes 로 남긴다).
#   ruby plan.rb <공식명> <tmp접두사> <시트...> > plan.json
require_relative 'lib/model'
require_relative 'lib/sheet'

player, prefix = ARGV[0], ARGV[1]
names = ARGV[2..-1]
BALL = { 'white' => 'ㅎ', 'yellow' => 'ㄴ' }

# 경기 하나가 시트에 어떻게 적혀야 하는지: { 열번호 => 값(nil 이면 비어 있어야 함) }
def expected(g, l)
  e = {}
  e[l[:round]] = g[:round]
  e[l[:opp]] = g[:opp]
  e[l[:ball]] = BALL[g[:ball]]
  if g[:single]
    s = g[:sets][0]
    e[l[:single]] = g[:site_avg] if l[:single]
    e[l[:single] + 1] = s[:inn]; e[l[:single] + 2] = s[:pts]
    e[l[:win]] = g[:win] ? 1 : 0
    e[l[:fb]] = s[:first_ball]
  else
    (0...l[:nsets]).each do |i|
      s = g[:sets][i]
      e[l[:wins] + i] = s ? (s[:win] ? 1 : 0) : nil
      ic = l[:inn][i + 1]
      if ic
        e[ic] = s && s[:inn]; e[ic + 1] = s && s[:pts]
      end
      e[l[:fb] + i] = s && s[:first_ball]
    end
    t = g[:tiebreak]
    e[l[:tie]] = t ? (t[:win] ? 1 : 0) : nil
    if l[:tb_inn]
      e[l[:tb_inn]] = t && t[:inn]; e[l[:tb_inn] + 1] = t && t[:pts]
    end
    e[l[:fb_tie]] = t && t[:first] ? t[:first_ball] : nil
    e[l[:avg]] = g[:site_avg] if l[:avg]
    e[l[:win]] = g[:win] ? 1 : 0
    e[l[:ko]] = g[:shutout] ? 1 : nil
  end
  e
end

def blank?(v) v.nil? || v.to_s.strip.empty? end

def same?(cur, exp, col_kind)
  if exp.nil?
    return true if blank?(cur)
    return (col_kind == :ko) && cur.is_a?(Numeric) && cur == 0
  end
  return blank?(cur) || (cur.is_a?(Numeric) && cur == 0) if col_kind == :win && exp == 0   # 진 경기는 비어 있거나 0
  if exp.is_a?(Numeric)
    return false unless cur.is_a?(Numeric)
    return (cur - exp).abs < 0.0006
  end
  return cur.to_i.to_s == exp.to_s if cur.is_a?(Numeric) && exp.to_s =~ /\A\d+\z/
  cur.to_s.strip == exp.to_s.strip
end

plan = []
names.each do |name|
  path = File.join(__dir__, 'tmp', "#{prefix}_#{name}.json")
  next unless File.exist?(path)
  season = 2000 + name[0, 2].to_i
  sh = SeasonSheet.new(name, path); l = sh.layout
  (warn("레이아웃을 찾지 못해 건너뜀: #{name}"); next) unless l
  filled = sh.matches
  gen = Model.history(player).select { |r| r[:season] == season }
  if gen.any? && gen.first[:type] == 'LPBA'   # 여자부 시즌별 예외
    gen = gen.reject { |g| g[:single] } if name.start_with?('2223')   # 22-23 시즌: 세트 경기만
    gen = gen.map { |g| g.merge(tiebreak: nil, notes: g[:notes].merge(tiebreak: nil)) } if name.start_with?('2324')   # 23-24 시즌: 승부치기 없음
  end
  used = {}
  extras = ->(g, row) {
    colors = {}; notes = []
    (g[:single] ? [] : g[:sets]).each do |s|
      ic = l[:inn][s[:no]] or next
      cell = SeasonSheet.col_letter(ic + 1) + row.to_s
      colors[cell] = 'orange' if s[:perfect] == :made
      colors[cell] = 'blue' if s[:perfect] == :suffered
    end
    notes << { cell: SeasonSheet.col_letter(l[:tie]) + row.to_s, text: g[:notes][:tiebreak] } if g[:notes][:tiebreak] && g[:tiebreak]
    notes << { cell: SeasonSheet.col_letter(l[:win]) + row.to_s, text: g[:notes][:tie] } if g[:notes][:tie] && g[:single]
    [colors, notes]
  }
  kind = ->(col) { col == l[:ko] ? :ko : (col == l[:win] ? :win : :other) }

  filled.each do |fr|
    g = Model.match_row(gen, used, fr)
    next unless g
    used[g[:pst]] = true
    cells = {}; changes = []
    expected(g, l).each do |col, val|
      cur = sh.v(fr[:row], col)
      next if same?(cur, val, kind.(col))
      next if val.nil? && sh.formula?(fr[:row], col)          # 수식 칸을 비우지는 않는다
      name_cell = SeasonSheet.col_letter(col) + fr[:row].to_s
      cells[name_cell] = val
      changes << "#{name_cell}: #{cur.inspect} → #{val.inspect}"
    end
    colors, notes = extras.(g, fr[:row])
    next if cells.empty? && colors.empty? && notes.empty?
    plan << { sheet: name, row: fr[:row], tour: g[:seq], round: g[:round], opp: g[:opp], existing: true,
              cells: cells, changes: changes, colors: colors, notes: notes }
  end

  # 새 경기 자리 찾기
  labelled = ((l[:hdr] + 1)..sh.rows).count { |r| !sh.v(r, l[:tour]).nil? }
  block_mode = labelled >= 0.6 * (sh.rows - l[:hdr])     # 2627 형식: 모든 줄에 투어 번호가 미리 적혀 있음
  taken = filled.map { |m| m[:row] }
  pending = gen.reject { |g| used[g[:pst]] }.sort_by { |g| [Model.seq_order(g[:seq]), -g[:round_code], g[:pst]] }
  if block_mode
    blocks = Hash.new { |h, k| h[k] = [] }
    ((l[:hdr] + 1)..sh.rows).each do |r|
      t = sh.v(r, l[:tour]); next if t.nil?
      blocks[t.to_s.sub(/\.0\z/, '')] << r
    end
    pending.each do |g|
      rows = blocks[g[:seq]]
      if (rows.nil? || rows.empty?) && g[:seq] == 'F'   # 월드챔피언십 구역 이름이 'F' 가 아니라 마지막 번호(예: 10)인 파일
        last_label = blocks.keys.select { |k| k =~ /\A\d+\z/ }.max_by(&:to_i)
        rows = blocks[last_label] if last_label
      end
      # 이미 적힌 줄(있으면) 바로 아래부터 채우고, 투어 칸이 비어 있으면 맨 위 줄부터 채운다.
      last = rows && rows.select { |r| taken.include?(r) }.max
      row = rows && rows.find { |r| (last.nil? || r > last) && !taken.include?(r) }
      unless row
        plan << { sheet: name, error: "투어#{g[:seq]} 빈 줄 없음: #{g[:round]} #{g[:opp]}" }
        next
      end
      taken << row
      cells = {}
      expected(g, l).each { |col, val| cells[SeasonSheet.col_letter(col) + row.to_s] = val unless val.nil? }
      colors, notes = extras.(g, row)
      plan << { sheet: name, row: row, tour: g[:seq], round: g[:round], opp: g[:opp], cells: cells, colors: colors, notes: notes, new_row: true }
    end
  else
    # 예전 형식: 경기가 한 줄씩 이어 적혀 있고 투어 번호는 투어의 첫 줄에만 있다. 맨 끝에만 이어 붙일 수 있다.
    last_row = taken.max || l[:hdr]
    last_tour_order = filled.map { |m| Model.seq_order(m[:tour].to_s =~ /\A\d+\z/ ? m[:tour] : 'F') }.max.to_i
    cur_tour = nil
    pending.each do |g|
      if filled.any? && Model.seq_order(g[:seq]) < last_tour_order && !(g[:seq] == 'F')
        plan << { sheet: name, error: "투어#{g[:seq]} 중간에 끼워 넣을 줄 없음: #{g[:round]} #{g[:opp]}" }
        next
      end
      row = last_row + 1
      if row > sh.rows
        plan << { sheet: name, error: "시트 끝 (#{sh.rows}줄): #{g[:round]} #{g[:opp]}" }
        next
      end
      last_row = row
      cells = {}
      expected(g, l).each { |col, val| cells[SeasonSheet.col_letter(col) + row.to_s] = val unless val.nil? }
      if cur_tour != g[:seq] && !filled.any? { |m| Model.tour_label_match?(g, m[:tour]) }
        regular = Model.tours.values.count { |t| t[:type] == g[:type] && t[:season] == g[:season] && t[:seq] != 'F' }
        cells[SeasonSheet.col_letter(l[:tour]) + row.to_s] = (g[:seq] == 'F' ? regular + 1 : g[:seq].to_i)
      end
      cur_tour = g[:seq]
      colors, notes = extras.(g, row)
      plan << { sheet: name, row: row, tour: g[:seq], round: g[:round], opp: g[:opp], cells: cells, colors: colors, notes: notes, new_row: true }
    end
  end
end
puts JSON.pretty_generate(plan)
