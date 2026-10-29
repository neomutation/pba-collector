#!/bin/zsh
# 사용: ./update_player.sh <문서이름> <원본경로> <접두사> <선수공식명> <양식문서이름> <시즌시트...>
#  - 원본은 건드리지 않고 out/ 의 복사본에 작업한다.
#  - 시즌 시트가 없으면 <양식문서>(예: 응꾸응)의 2627 시트를 복사해 만든다.
#  - 홈피와 다른 값은 홈피 값으로 바꾸고, 빠진 경기는 채운다.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
DOC=$1; ORIG=$2; PFX=$3; PLAYER=$4; TPLDOC=$5; shift 5; SEASONS=("$@")
menu() { osascript -e "tell application \"System Events\" to tell process \"Numbers\" to click menu item \"$2\" of menu 1 of menu bar item \"$1\" of menu bar 1"; }
osascript -l JavaScript -e "try { Application('Numbers').documents.byName('$DOC').close({saving:'no'}) } catch(e) {}" >/dev/null 2>&1
for i in $(seq 1 20); do
  n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")' 2>&1)
  case ",$n," in *",$DOC,"*) sleep 1;; *) break;; esac
done
cp "$ORIG" "out/$DOC.numbers" && open -a Numbers "out/$DOC.numbers"
for i in $(seq 1 40); do
  n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")' 2>&1)
  case ",$n," in *",$DOC,"*) break;; esac; sleep 2
done
sleep 4
HAVE=$(osascript -l JavaScript -e "Application('Numbers').documents.byName('$DOC').sheets().map(function(s){return s.name()}).join(',')")
echo "시트: $HAVE"
for S in $SEASONS; do
  case ",$HAVE," in *",$S,"*) continue;; esac
  echo "시트 $S 없음 → $TPLDOC 의 2627 양식으로 새로 만든다"
  open -a Numbers "out/$TPLDOC.numbers"; for i in $(seq 1 30); do n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")' 2>&1); case ",$n," in *",$TPLDOC,"*) break;; esac; sleep 2; done; sleep 3
  osascript -l JavaScript extract.js "$TPLDOC" 2627 "$PWD/tmp/${PFX}_tpl.json" >/dev/null
  ruby -Eutf-8 clear_targets.rb "tmp/${PFX}_tpl.json" "tmp/${PFX}_clear.json"
  ./raise.sh "$TPLDOC"
  osascript -l JavaScript -e "var N=Application('Numbers'); var d=N.documents.byName('$TPLDOC'); d.activeSheet=d.sheets.byName('2627'); var t=d.sheets.byName('2627').tables[0]; t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
  sleep 1; menu 편집 복사; sleep 2
  osascript -l JavaScript -e "Application('Numbers').documents.byName('$TPLDOC').close({saving:'no'})" >/dev/null; sleep 1
  ./raise.sh "$DOC"
  osascript -l JavaScript -e "var N=Application('Numbers'); var d=N.documents.byName('$DOC'); d.activeSheet=d.sheets.byName('시즌비교');" >/dev/null; sleep 0.5
  menu 삽입 시트; sleep 3
  osascript -l JavaScript newsheet.js "$DOC" "$S"; sleep 1
  menu 편집 붙여넣기 >/dev/null; r=$(osascript -l JavaScript waittable.js "$DOC" "$S" 70)
  if [[ "$r" == ERR* ]]; then sleep 5; menu 편집 붙여넣기 >/dev/null; osascript -l JavaScript waittable.js "$DOC" "$S" 70; fi; sleep 2
  osascript -l JavaScript -e "var N=Application('Numbers'); var d=N.documents.byName('$DOC'); var ts=d.sheets.byName('$S').tables(); var t=d.sheets.byName('$S').tables[0]; for (var q=0;q<ts.length;q++){ if (ts[q].name()=='우승표 1') t=d.sheets.byName('$S').tables[q]; } t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
  sleep 1; menu 편집 "하이라이트 및 주석 제거"; sleep 1
  osascript -l JavaScript clear_inputs.js "$DOC" "$S" "$PWD/tmp/${PFX}_clear.json"
done
./close_others.sh "$DOC"
./raise.sh "$DOC"
for S in $SEASONS; do osascript -l JavaScript extract.js "$DOC" $S "$PWD/tmp/${PFX}_$S.json" >/dev/null; done
osascript -l JavaScript extract.js "$DOC" 시즌비교 "$PWD/tmp/${PFX}_sb.json" >/dev/null
ruby -Eutf-8 plan.rb "$PLAYER" $PFX $SEASONS > "tmp/plan_rows_$PFX.json"
ruby -Eutf-8 plan_summary.rb "$PLAYER" $PFX $SEASONS > "tmp/plan_sb_$PFX.json"
ruby -Eutf-8 -e 'require "json"; puts JSON.generate(ARGV.flat_map { |f| JSON.parse(File.read(f)) })' "tmp/plan_rows_$PFX.json" "tmp/plan_sb_$PFX.json" > "tmp/plan_$PFX.json"
ruby -Eutf-8 -e 'require "json"; p = JSON.parse(File.read(ARGV[0])); puts "plan: 신규 #{p.count { |x| x["new_row"] }}줄, 수정 #{p.count { |x| x["existing"] }}줄, 오류 #{p.count { |x| x["error"] }}, 색 #{p.sum { |x| (x["colors"]||{}).size }}, 주석 #{p.sum { |x| (x["notes"]||[]).size }}"; p.select { |x| x["error"] }.first(15).each { |x| puts "  ! " + x["sheet"].to_s + " " + x["error"] }' "tmp/plan_$PFX.json"
ruby -Eutf-8 -e 'require "json"; JSON.parse(File.read(ARGV[0])).each { |p| (p["changes"]||[]).each { |c| puts "#{p["sheet"]} 행#{p["row"]} #{p["opp"]}: #{c}" } }' "tmp/plan_$PFX.json" > "out/${DOC}_홈피기준_수정내역.txt"
osascript -l JavaScript apply.js "$DOC" "$PWD/tmp/plan_$PFX.json"
ruby -Eutf-8 apply_notes.rb "$DOC" "tmp/plan_$PFX.json" | tail -1
