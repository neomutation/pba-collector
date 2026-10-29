#!/bin/zsh
# 사용: ./build_new.sh <문서이름> <원본경로> <접두사> <선수공식명> <시즌시트...>
# 2627 시트 형식을 시즌마다 복사해 "<시즌>신규" 시트를 만들고, 수집 데이터를 채운다. 원본은 건드리지 않는다.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
DOC=$1; ORIG=$2; PFX=$3; PLAYER=$4; shift 4; SEASONS=("$@")
menu() { osascript -e "tell application \"System Events\" to tell process \"Numbers\" to click menu item \"$2\" of menu 1 of menu bar item \"$1\" of menu bar 1"; }
osascript -l JavaScript -e "try { Application('Numbers').documents.byName('$DOC').close({saving:'no'}) } catch(e) {}" >/dev/null 2>&1
cp "$ORIG" "out/$DOC.numbers" && open -a Numbers "out/$DOC.numbers"
for i in $(seq 1 40); do
  n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")' 2>&1)
  case ",$n," in *",$DOC,"*) break;; esac; sleep 2
done
./close_others.sh "$DOC"
./raise.sh "$DOC"
osascript -l JavaScript extract.js "$DOC" 2627 "$PWD/tmp/${PFX}_tpl.json" >/dev/null
ruby -Eutf-8 clear_targets.rb "tmp/${PFX}_tpl.json" "tmp/${PFX}_clear.json"
# 2627 표 전체를 복사
osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$DOC'); d.activeSheet=d.sheets.byName('2627'); var t=d.sheets.byName('2627').tables[0]; t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
sleep 1; menu 편집 복사; sleep 2
NEW=()
for S in $SEASONS; do
  NAME="${S}신규"
  osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$DOC'); d.activeSheet=d.sheets.byName('2627');" >/dev/null; sleep 0.5
  ./raise.sh "$DOC"
  menu 삽입 시트; sleep 3
  osascript -l JavaScript newsheet.js "$DOC" "$NAME"; sleep 1
  menu 편집 붙여넣기 >/dev/null; r=$(osascript -l JavaScript waittable.js "$DOC" "$NAME" 90)
  if [[ "$r" == ERR* ]]; then sleep 5; menu 편집 붙여넣기 >/dev/null; osascript -l JavaScript waittable.js "$DOC" "$NAME" 90; fi; sleep 2
  osascript -l JavaScript -e "var N=Application('Numbers'); var d=N.documents.byName('$DOC'); var ts=d.sheets.byName('$NAME').tables(); var t=d.sheets.byName('$NAME').tables[0]; for (var q=0;q<ts.length;q++){ if (ts[q].name()=='우승표 1') t=d.sheets.byName('$NAME').tables[q]; } t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
  sleep 1; menu 편집 "하이라이트 및 주석 제거"; sleep 1
  osascript -l JavaScript clear_inputs.js "$DOC" "$NAME" "$PWD/tmp/${PFX}_clear.json"
  NEW+=("$NAME")
done
for S in 2627 $NEW; do osascript -l JavaScript extract.js "$DOC" $S "$PWD/tmp/${PFX}_$S.json" >/dev/null; done
osascript -l JavaScript extract.js "$DOC" 시즌비교 "$PWD/tmp/${PFX}_sb.json" >/dev/null
ruby -Eutf-8 plan.rb "$PLAYER" $PFX 2627 $NEW > "tmp/plan_rows_$PFX.json"
ruby -Eutf-8 plan_summary.rb "$PLAYER" $PFX > "tmp/plan_sb_$PFX.json"
ruby -Eutf-8 -e 'require "json"; puts JSON.generate(ARGV.flat_map { |f| JSON.parse(File.read(f)) })' "tmp/plan_rows_$PFX.json" "tmp/plan_sb_$PFX.json" > "tmp/plan_$PFX.json"
ruby -Eutf-8 -e 'require "json"; p = JSON.parse(File.read(ARGV[0])); puts "plan: #{p.count { |x| x["cells"] && x["row"] }} new rows, #{p.count { |x| x["error"] }} errors, #{p.sum { |x| (x["colors"]||{}).size }} colors, #{p.sum { |x| (x["notes"]||[]).size }} notes"; p.select { |x| x["error"] }.first(15).each { |x| puts "  ! " + x["error"] }' "tmp/plan_$PFX.json"
osascript -l JavaScript apply.js "$DOC" "$PWD/tmp/plan_$PFX.json"
ruby -Eutf-8 apply_notes.rb "$DOC" "tmp/plan_$PFX.json"
./raise.sh "$DOC"
ruby -Eutf-8 fix_colors.rb "$DOC" "$PLAYER" "${PFX}c" $NEW
