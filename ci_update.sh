#!/bin/bash
# 휴대폰용 사이트(GitHub Actions)에서 쓰는 자료 업데이트: update_app.sh 와 같은 순서 (맥 전용 설정 · 잠금 · 로그 파일 없이)
#  DB(pba.db · team.db)는 저장소에 두지 않고 매번 data/ 원본 자료로 새로 만든다
set -u
cd "$(dirname "$0")"
SINCE=$(date +%Y); [ "$(date +%m | sed 's/^0//')" -lt 6 ] && SINCE=$((SINCE - 1))   # 1~5월은 지난해 시작 시즌
r() { echo "▶ $*"; ruby -Eutf-8 "$@"; }
r collect.rb --since "$SINCE" || exit 1
r players.rb || exit 1
r prizes.rb || echo "상금 정보 실패 (계속 진행)"
r subtours.rb || echo "드림·챌린지 정보 실패 (계속 진행)"
r topranking.rb || echo "톱랭킹 정보 실패 (계속 진행)"
r build_db.rb || exit 1
r team_collect.rb --current || echo "팀리그 수집 실패 (계속 진행)"
r team_roster.rb --current || echo "팀 명단 실패 (계속 진행)"
r team_schedule.rb || echo "팀리그 일정 실패 (계속 진행)"
r build_team_db.rb || echo "팀리그 DB 실패 (계속 진행)"
