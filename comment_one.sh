#!/bin/zsh
# 사용: comment_one.sh <문서이름> <시트이름> <셀> <텍스트>
# Numbers 의 해당 셀에 주석(댓글)을 단다. 이미 주석이 있으면 지우지 않고 아래에 덧붙인다.
DOC="$1"; SHEET="$2"; CELL="$3"; TEXT="$4"
osascript -l JavaScript -e "var N=Application('Numbers'); N.activate(); var d=N.documents.byName('$DOC'); d.activeSheet=d.sheets.byName('$SHEET'); var t=d.sheets.byName('$SHEET').tables[0]; t.selectionRange=t.ranges.byName('$CELL:$CELL');" >/dev/null
osascript - "$TEXT" <<'AS'
on run argv
  set theText to item 1 of argv
  tell application "System Events"
    tell process "Numbers"
      set frontmost to true
      click menu item "주석" of menu 1 of menu bar item "삽입" of menu bar 1
      delay 0.8
      set els to entire contents of window 1
      repeat with e in els
        try
          if (role of e as text) is "AXTextArea" and (description of e as text) is "텍스트 엔트리 영역" then
            set cur to ""
            try
              set cur to (value of e) as text
            end try
            if cur is "missing value" then set cur to ""
            set newText to theText
            if cur is not "" then
              if cur contains theText then
                set newText to cur
              else
                set newText to cur & linefeed & theText
              end if
            end if
            try
              set focused of e to true
            end try
            set value of e to newText
          end if
        end try
      end repeat
      delay 0.3
    end tell
  end tell
end run
AS
osascript -l JavaScript -e "var N=Application('Numbers'); var d=N.documents.byName('$DOC'); var t=d.sheets.byName('$SHEET').tables[0]; t.selectionRange=t.ranges.byName('A1:A1');" >/dev/null
