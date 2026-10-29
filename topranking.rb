#!/usr/bin/env ruby
# encoding: utf-8
# pbatour.org 공식 웰컴(웰뱅)톱랭킹 수상 목록을 data/topranking.json 에 저장한다.
# (동률이면 세컨드 에버로 가린 최종 수상자가 홈피에 올라와 있다)
require 'json'
require 'open3'

url = 'https://www.pbatour.org/ko/award/ajax/tour?category=%ED%86%B1%EB%9E%AD%ED%82%B9&season='
out, st = Open3.capture2('curl', '-sL', '--max-time', '30', '-A', 'Mozilla/5.0', '-e', 'https://www.pbatour.org/ko/pba/awards/index', url)
abort 'topranking: 요청 실패' unless st.success? && out.start_with?('{')
list = JSON.parse(out.force_encoding('utf-8'))['list'] || []
abort 'topranking: 빈 목록' if list.empty?
File.write(File.join(__dir__, 'data', 'topranking.json'), JSON.pretty_generate(list))
$stderr.puts "topranking: #{list.size}개 대회"
