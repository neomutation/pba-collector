#!/bin/zsh
# 사용: ./add_new_sheets.sh <문서이름> <접두사> <선수공식명> <시즌시트...>
# 이미 열려 있는 복사본에서, 2627 시트 형식을 시즌마다 복사해 "<시즌>신규" 시트를 만들고 수집 데이터를 채운다.
# (새 시트에서는 2627 시트처럼 투어별 에버, 세트득실, 뱅승, 초성, 초에, 흰공/노란공 횟수가 계산된다.)
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
DOC=$1; PFX=$2; PLAYER=$3; shift 3; SEASONS=("$@")
menu() { osascript -e "tell application \"System Events\" to tell process \"Numbers\" to click menu item \"$2\" of menu 1 of menu bar item \"$1\" of menu bar 1"; }
./close_others.sh "$DOC"
./raise.sh "$DOC"
osascript -l JavaScript extract.js "$DOC" 2627 "$PWD/tmp/${PFX}_tpl.json" >/dev/null
ruby -Eutf-8 clear_targets.rb "tmp/${PFX}_tpl.json" "tmp/${PFX}_clear.json"
osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$DOC'); d.activeSheet=d.sheets.byName('2627'); var t=d.sheets.byName('2627').tables[0]; t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
sleep 1; menu 편집 복사 >/dev/null; sleep 2
NEW=()
for S in $SEASONS; do
  NAME="${S}신규"
  osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$DOC'); d.activeSheet=d.sheets.byName('2627');" >/dev/null; sleep 0.5
  menu 삽입 시트 >/dev/null; sleep 3
  osascript -l JavaScript newsheet.js "$DOC" "$NAME"; sleep 1
  menu 편집 붙여넣기 >/dev/null; r=$(osascript -l JavaScript waittable.js "$DOC" "$NAME" 70)
  if [[ "$r" == ERR* ]]; then sleep 5; menu 편집 붙여넣기 >/dev/null; osascript -l JavaScript waittable.js "$DOC" "$NAME" 70; fi; sleep 2
  osascript -l JavaScript -e "var N=Application('Numbers'); var d=N.documents.byName('$DOC'); var ts=d.sheets.byName('$NAME').tables(); var t=d.sheets.byName('$NAME').tables[0]; for (var q=0;q<ts.length;q++){ if (ts[q].name()=='우승표 1') t=d.sheets.byName('$NAME').tables[q]; } t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
  sleep 1; menu 편집 "하이라이트 및 주석 제거" >/dev/null; sleep 1
  osascript -l JavaScript clear_inputs.js "$DOC" "$NAME" "$PWD/tmp/${PFX}_clear.json"
  NEW+=("$NAME")
done
for N in $NEW; do osascript -l JavaScript extract.js "$DOC" $N "$PWD/tmp/${PFX}_$N.json" >/dev/null; done
ruby -Eutf-8 plan.rb "$PLAYER" $PFX $NEW > "tmp/plan_new_$PFX.json"
ruby -Eutf-8 -e 'require "json"; p = JSON.parse(File.read(ARGV[0])); puts "plan: 신규 #{p.count { |x| x["new_row"] }}줄, 오류 #{p.count { |x| x["error"] }}, 색 #{p.sum { |x| (x["colors"]||{}).size }}, 주석 #{p.sum { |x| (x["notes"]||[]).size }}"; p.select { |x| x["error"] }.first(10).each { |x| puts "  ! " + x["sheet"].to_s + " " + x["error"] }' "tmp/plan_new_$PFX.json"
osascript -l JavaScript apply.js "$DOC" "$PWD/tmp/plan_new_$PFX.json"
ruby -Eutf-8 apply_notes.rb "$DOC" "tmp/plan_new_$PFX.json" | tail -1
./raise.sh "$DOC"
ruby -Eutf-8 fix_colors.rb "$DOC" "$PLAYER" "${PFX}c" $NEW
