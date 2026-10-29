#!/usr/bin/env ruby
# encoding: utf-8
# 수집한 데이터로 만든 줄과, 선수 파일에 손으로 입력된 줄을 비교한다.
#   ruby compare.rb <선수 공식명> <tmp 파일 접두사> [시즌시트...]
require_relative 'lib/model'
require_relative 'lib/sheet'

player, prefix = ARGV[0], ARGV[1]
sheets = ARGV[2..-1].empty? ? %w[2223 2324 2425 2526 2627] : ARGV[2..-1]
ALIAS = {}  # 파일상 이름 => 공식명 (필요할 때 채움)
ALIAS_FILE = File.join(__dir__, 'aliases.json')
ALIAS.merge!(JSON.parse(File.read(ALIAS_FILE))) if File.exist?(ALIAS_FILE)
norm = ->(s) { n = ALIAS[s.to_s] || s.to_s; n.gsub(/[\s.]/, '') }

total = { rows: 0, matched: 0, only_file: 0, only_gen: 0, diffs: 0 }
sheets.each do |name|
  path = File.join(__dir__, 'tmp', "#{prefix}_#{name}.json")
  next puts("== #{name}: (추출 파일 없음)") unless File.exist?(path)
  season = 2000 + name[0, 2].to_i
  sh = SeasonSheet.new(name, path)
  file_rows = sh.matches
  gen = Model.history(player).select { |r| r[:season] == season }
  puts "== #{name}  파일 #{file_rows.size}줄 / 수집 #{gen.size}경기"
  used = {}
  file_rows.each do |fr|
    g = Model.match_row(gen, used, fr)
    total[:rows] += 1
    unless g
      total[:only_file] += 1
      puts "  [파일에만] 투어#{fr[:tour]} #{fr[:round]} #{fr[:opp]} (행 #{fr[:row]})"
      next
    end
    used[g[:pst]] = true
    total[:matched] += 1
    diffs = []
    diffs << "라운드 #{fr[:round]}→#{g[:round]}" if fr[:round].to_s != g[:round].to_s
    if g[:single]
      s = g[:sets][0]
      diffs << "단판이닝 #{fr[:single_inn].inspect}→#{s[:inn]}" if fr[:single_inn] != s[:inn]
      diffs << "단판득점 #{fr[:single_pts].inspect}→#{s[:pts]}" if fr[:single_pts] != s[:pts]
      diffs << "단판승패 #{fr[:result].inspect}→#{g[:win] ? 1 : 0}" if fr[:result] != (g[:win] ? 1 : 0)
      diffs << "세트1초구 #{fr[:sets][0][:fb].inspect}→#{s[:first_ball].inspect}" if fr[:sets][0][:fb] != s[:first_ball]
    end
    (g[:single] ? [] : g[:sets]).each_with_index do |s, i|
      f = fr[:sets][i] or (diffs << "세트#{i + 1} 칸없음"; next)
      w = s[:win] ? 1 : 0
      diffs << "세트#{i + 1}승패 #{f[:win].inspect}→#{w}" if f[:win] != w
      diffs << "세트#{i + 1}이닝 #{f[:inn].inspect}→#{s[:inn]}" if f[:inn] != s[:inn]
      diffs << "세트#{i + 1}득점 #{f[:pts].inspect}→#{s[:pts]}" if f[:pts] != s[:pts]
      diffs << "세트#{i + 1}초구 #{f[:fb].inspect}→#{s[:first_ball].inspect}" if f[:fb] != s[:first_ball]
    end
    ((g[:single] ? 1 : g[:sets].size)...fr[:sets].size).each { |i| f = fr[:sets][i]; diffs << "세트#{i + 1} 파일에만 있음" if f[:win] }
    ball = { 'white' => 'ㅎ', 'yellow' => 'ㄴ' }[g[:ball]]
    diffs << "공 #{fr[:ball]}→#{ball}" if fr[:ball] != ball
    if g[:tiebreak]
      t = g[:tiebreak]
      diffs << "승부치기승 #{fr[:tie_win].inspect}→#{t[:win] ? 1 : 0}" if fr[:tie_win] != (t[:win] ? 1 : 0)
      diffs << "승부치기이닝 #{fr[:tb_inn].inspect}→#{t[:inn]}" if fr[:tb_inn] && fr[:tb_inn] != t[:inn]
      diffs << "승부치기득점 #{fr[:tb_pts].inspect}→#{t[:pts]}" if fr[:tb_pts] && fr[:tb_pts] != t[:pts]
      diffs << "승부치기초구 #{fr[:tie_fb].inspect}→#{t[:first_ball].inspect}" if fr[:tie_fb] != (t[:first] ? t[:first_ball] : nil)
    elsif fr[:tie_win]
      diffs << "승부치기 파일에만"
    end
    unless diffs.empty?
      total[:diffs] += 1
      puts "  [차이] 투어#{fr[:tour]} #{fr[:opp]} (행 #{fr[:row]}): #{diffs.join(', ')}"
    end
  end
  rest = gen.reject { |x| used[x[:pst]] }
  total[:only_gen] += rest.size
  rest.each { |x| puts "  [수집에만] 투어#{x[:seq]} #{x[:round]} #{x[:opp]} #{x[:win] ? '승' : '패'} #{x[:set_score].join(':')}" }
end
puts "합계: 파일 #{total[:rows]}줄, 일치 #{total[:matched]}, 파일에만 #{total[:only_file]}, 수집에만 #{total[:only_gen]}, 값 차이 #{total[:diffs]}줄"
