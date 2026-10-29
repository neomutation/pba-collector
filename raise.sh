#!/bin/zsh
# 사용: raise.sh <문서이름> : 해당 Numbers 창을 맨 앞으로 (창 제목이 "이름 — 편집됨" 처럼 길어도 찾는다)
osascript - "$1" <<'AS'
on run argv
  tell application "Numbers" to activate
  delay 0.4
  tell application "System Events"
    tell process "Numbers"
      repeat with w in windows
        if (name of w as text) starts with (item 1 of argv) then
          perform action "AXRaise" of w
        end if
      end repeat
    end tell
  end tell
  delay 0.6
end run
AS
