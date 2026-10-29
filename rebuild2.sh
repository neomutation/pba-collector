#!/bin/zsh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
echo "== 강동궁"; ./update_player.sh 강동궁_업데이트 "/Users/당구/남/강동궁.numbers" kdg "강동궁" 응꾸응_시범 2627 2526 2425 2324 2223 2>&1 | grep -v "^menu item" | tail -5
echo "== 김가영"; ./build_new.sh 김가영_시범 "/Users/당구/여/김가영.numbers" kgyn "김가영" 2223 2324 2425 2526 2>&1 | grep -v "^menu item" | tail -5
echo "== 응꾸응 신규"; ./add_new_sheets.sh 응꾸응_시범 ungn "Q.응우옌" 2223 2324 2425 2526 2>&1 | grep -v "^menu item" | tail -4
echo "== 조건휘 신규"; ./add_new_sheets.sh 조건휘_업데이트 cghn "조건휘" 2223 2324 2425 2526 2>&1 | grep -v "^menu item" | tail -4
echo "== 강동궁 신규"; ./add_new_sheets.sh 강동궁_업데이트 kdgn "강동궁" 2223 2324 2425 2526 2>&1 | grep -v "^menu item" | tail -4
echo "== 끝"
