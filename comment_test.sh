#!/bin/zsh
# 시험: 선택한 셀에 주석(댓글) 하나 넣기
TEXT="$1"
printf '%s' "$TEXT" | pbcopy
osascript <<'AS'
tell application "Numbers" to activate
delay 0.5
tell application "System Events"
  tell process "Numbers"
    click menu item "주석" of menu 1 of menu bar item "삽입" of menu bar 1
    delay 0.8
    keystroke "v" using command down
    delay 0.5
  end tell
end tell
AS
