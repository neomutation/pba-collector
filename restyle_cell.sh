#!/bin/zsh
# 사용: restyle_cell.sh <문서> <시트> <대상셀> <본뜰셀> : 본뜰 셀의 스타일(채우기 등)을 대상 셀에 붙인다 (값은 그대로)
DOC=$1; SH=$2; TGT=$3; SRC=$4
sel() { osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$DOC'); d.activeSheet=d.sheets.byName('$SH'); var ts=d.sheets.byName('$SH').tables(); var t=d.sheets.byName('$SH').tables[0]; for (var q=0;q<ts.length;q++){ if (ts[q].name()=='우승표 1') t=d.sheets.byName('$SH').tables[q]; } t.selectionRange=t.ranges.byName('$1:$1');" >/dev/null; }
menu() { osascript -e "tell application \"System Events\" to tell process \"Numbers\" to click menu item \"$2\" of menu 1 of menu bar item \"$1\" of menu bar 1" >/dev/null; }
./raise.sh "$DOC"
sel "$SRC"; sleep 0.5; menu 포맷 "스타일 복사하기"; sleep 0.5
sel "$TGT"; sleep 0.5; menu 포맷 "스타일 붙여넣기"; sleep 1
sel A1
