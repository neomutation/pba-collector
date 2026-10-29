#!/bin/zsh
# 사용: ./sb_rebuild.sh <대상파일경로> <대상문서이름> <kdg|cgh> <선수공식명>
# 응꾸응_시범의 시즌비교 표를 통째로 복사해 대상 파일의 시즌비교를 바꾸고, 대상 선수의 값을 다시 넣는다.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
FILE=$1; DOC=$2; KIND=$3; PLAYER=$4
TPL="/Users/당구/남/응꾸응_시범.numbers"; TPLDOC=응꾸응_시범
menu() { osascript -e "tell application \"System Events\" to tell process \"Numbers\" to click menu item \"$2\" of menu 1 of menu bar item \"$1\" of menu bar 1"; }
opendoc() { open -a Numbers "$1"; for i in $(seq 1 40); do n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")'); case ",$n," in *",$2,"*) break;; esac; sleep 2; done; sleep 3; ./close_others.sh "$2"; ./raise.sh "$2"; }
# 1) 응꾸응 시즌비교 표 복사
opendoc "$TPL" $TPLDOC
osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$TPLDOC'); d.activeSheet=d.sheets.byName('시즌비교'); var t=d.sheets.byName('시즌비교').tables[0]; t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
for try in 1 2 3 4; do
  sleep 1; ./raise.sh $TPLDOC
  osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$TPLDOC'); d.activeSheet=d.sheets.byName('시즌비교'); var t=d.sheets.byName('시즌비교').tables[0]; t.selectionRange=t.ranges.byName('A1:' + t.cells[t.rowCount()*t.columnCount()-1].name());" >/dev/null
  sleep 1; menu 편집 복사 >/dev/null; sleep 3
  osascript -e 'clipboard info' | grep -q "rtfd., [0-9][0-9][0-9][0-9][0-9]" && break
  echo "복사 재시도 $try"
done
# 2) 대상 파일: 현재 값 추출 → 수정 목록 만들기
opendoc "$FILE" $DOC
osascript -l JavaScript extract.js $DOC 시즌비교 "$PWD/tmp/${KIND}_sbnow.json" >/dev/null
ruby -Eutf-8 sb_rebuild.rb "$PLAYER" $KIND "tmp/${KIND}_sbnow.json" "tmp/sbnew_${KIND}.json"
# 3) 표 교체
osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$DOC'); var s=d.sheets.byName('시즌비교'); d.activeSheet=s; while (s.tables().length) { s.tables[0].delete(); }" >/dev/null
sleep 1; ./raise.sh $DOC
menu 편집 붙여넣기 >/dev/null
osascript -l JavaScript -e "ObjC.import('Foundation'); var N=Application('Numbers'); var s=N.documents.byName('$DOC').sheets.byName('시즌비교'); var ok=false; for (var i=0;i<90;i++){ if (s.tables().length && s.tables[0].rowCount()>=44) { ok=true; break; } \$.NSThread.sleepForTimeInterval(1); } ok ? 'table ok' : 'ERR table missing'"
sleep 3
osascript -l JavaScript apply_formulas.js $DOC "$PWD/tmp/sbnew_${KIND}.json"
osascript -l JavaScript -e "
var N=Application('Numbers'); var t=N.documents.byName('$DOC').sheets.byName('시즌비교').tables[0]; var f=t.cells.formula(), bad=0, ok=0; for (var i=0;i<f.length;i++){ if(f[i]){ var s=String(f[i]); if (/#REF|#N\\/A|#NAME/.test(s)) bad++; else if (/::/.test(s)) ok++; } }
'$DOC 시즌비교: ' + t.rowCount() + 'x' + t.columnCount() + ' 오류 수식=' + bad + ' 새 시트 참조=' + ok"
