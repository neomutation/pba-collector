#!/usr/bin/env ruby
# encoding: utf-8
# pbatour.org 공식 웰컴(웰뱅)톱랭킹 수상 목록을 data/topranking.json 에 저장한다.
# (동률이면 세컨드 에버로 가린 최종 수상자가 홈피에 올라와 있다)
require 'json'
require 'open3'

url = 'https://www.pbatour.org/ko/award/ajax/tour?category=%ED%86%B1%EB%9E%AD%ED%82%B9&season='
out, st = Open3.capture2('curl', '-sL', '--max-time', '30', '-A', 'Mozilla/5.0', '-e', 'https://www.pbatour.org/ko/pba/awards/index', url)
# 공식 홈피가 실패해도 아래 빌리보드는 받는다 (옛 topranking.json 은 그대로 둔다)
list = st.success? && out.start_with?('{') ? (JSON.parse(out.force_encoding('utf-8'))['list'] || []) : []
if list.empty? then $stderr.puts 'topranking: 공식 목록 요청 실패 · 빈 목록 (옛 자료 유지)'
else File.write(File.join(__dir__, 'data', 'topranking.json'), JSON.pretty_generate(list)); $stderr.puts "topranking: #{list.size}개 대회" end

# 보조 자료: 빌리보드 대회별 톱랭킹 (pba.billiboard.co.kr 랭킹 > 웰컴 저축은행 톱랭킹, sel_Ranking=6).
# 공식 목록에 빠진 대회(예: 24-25 월드챔피언십)를 채울 때 build_db.rb 가 쓴다. 대회마다 상위 5명 [회원코드, 이름, 에버, 라운드].
# 끝난 대회는 한 번 받으면 다시 받지 않고, 진행 중인 대회만 매번 다시 받는다 → data/topranking_bb.json
bb_path = File.join(__dir__, 'data', 'topranking_bb.json')
bb = File.exist?(bb_path) ? JSON.parse(File.read(bb_path)) : {}
db = File.join(__dir__, 'data', 'pba.db')
tours, = Open3.capture2('sqlite3', '-separator', "\t", db, 'SELECT code, type, season, status FROM tours ORDER BY code')
fetched = 0
tours.force_encoding('utf-8').each_line do |l|
  code, type, season, status = l.chomp.split("\t")
  next if bb[code] && status == '종료'
  ref = "https://pba.billiboard.co.kr/mob/contest_new/admin/PBA_ranking_new.asp?rankingType=#{type}&sel_Ranking=6&SeasonCode=#{season}&txt_Search="
  html, s2 = Open3.capture2('curl', '-sL', '--max-time', '30', '-A', 'Mozilla/5.0', '-e', ref,
    "https://pba.billiboard.co.kr/mob/contest_new/code_behind/PBA_ranking_new.asp?rankingType=#{type}&sel_Ranking=6&SeasonCode=#{season}&iPage=1&TourCode=#{code}&txt_Search=")
  next unless s2.success?
  rows = html.force_encoding('utf-8').scan(/comPlayerInfo\('ko', '\w+', '(\w+)', '([^']*)'.*?TOP:\s*([\d.]+)\s*<\/td>\s*<td class="center">\s*(\d*)/m)
  bb[code] = { 'type' => type, 'season' => season.to_i, 'top' => rows.first(5).map { |m, n, a, r| [m, n, a.to_f, r.to_i] } }
  fetched += 1
  sleep 0.2
end
File.write(bb_path, JSON.pretty_generate(bb))
$stderr.puts "topranking 빌리보드: #{fetched}개 대회 받음 (전체 #{bb.size})"
