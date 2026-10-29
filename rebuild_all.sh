#!/bin/zsh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
echo "== 응꾸응"; ./build_copy.sh 응꾸응_시범 "/Users/당구/남/응꾸응.numbers" ung "Q.응우옌" 2627 2526 2425 2324 2223 2>&1 | grep -v "^menu item" | tail -4
ruby -Eutf-8 apply_notes.rb 응꾸응_시범 tmp/plan_ung.json | tail -1
ruby -Eutf-8 -e 'require "json"; JSON.parse(File.read(ARGV[0])).each { |p| (p["changes"]||[]).each { |c| puts "#{p["sheet"]} 행#{p["row"]} #{p["opp"]}: #{c}" } }' tmp/plan_ung.json > out/응꾸응_홈피기준_수정내역.txt
echo "== 조건휘"; ./update_player.sh 조건휘_업데이트 "/Users/당구/남/조건휘.numbers" cgh "조건휘" 응꾸응_시범 2627 2526 2425 2324 2>&1 | grep -v "^menu item" | tail -4
echo "== 강동궁"; ./update_player.sh 강동궁_업데이트 "/Users/당구/남/강동궁.numbers" kdg "강동궁" 응꾸응_시범 2627 2526 2425 2324 2223 2>&1 | grep -v "^menu item" | tail -4
echo "== 김가영"; ./build_new.sh 김가영_시범 "/Users/당구/여/김가영.numbers" kgyn "김가영" 2223 2324 2425 2526 2>&1 | grep -v "^menu item" | tail -6
echo "== 끝"
