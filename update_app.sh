#!/bin/zsh
# 앱 데이터 갱신: 이번 시즌 새 경기 수집 → 선수정보 갱신 → DB 다시 만들기
#   ./update_app.sh          # 이번 시즌만
#   ./update_app.sh 2019     # 2019-20 시즌부터 전부 (이미 끝난 투어는 건너뜀)
# 바탕화면 앱을 켜면 server.rb 가 바로 한 번, 그 뒤 30분마다 실행한다. (예전 launchd 2시간 자동 실행은 꺼 둠: kr.local.pba-update.plist.disabled)
cd "$(dirname "$0")"
export LANG=ko_KR.UTF-8 LC_ALL=ko_KR.UTF-8 PATH=/usr/bin:/bin:/usr/sbin:/sbin
LOG=data/update.log
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> $LOG }

# 동시에 두 번 돌지 않게 (자동 실행과 앱의 ⌘U 가 겹칠 때)
LOCK=data/.update.lock
if ! mkdir $LOCK 2>/dev/null; then
  if [[ -n $(find $LOCK -mmin +60 2>/dev/null) ]]; then rmdir $LOCK; mkdir $LOCK; else log "이미 업데이트 중이라 건너뜀"; exit 0; fi
fi
trap 'rmdir $LOCK 2>/dev/null' EXIT

# 막 켜졌을 때는 인터넷 연결을 기다린다 (최대 3분)
for i in {1..36}; do
  curl -s -o /dev/null --max-time 5 https://pba.billiboard.co.kr && break
  sleep 5
done

SINCE=${1:-$(date +%Y)}
[[ $(date +%m) -lt 6 && -z $1 ]] && SINCE=$(( $(date +%Y) - 1 ))   # 1~5월은 지난해 시작 시즌
log "업데이트 시작 (시즌 $SINCE~)"
ruby -Eutf-8 collect.rb --since $SINCE >> data/collect_app.log 2>&1 || { log "경기 수집 실패"; exit 1; }
ruby -Eutf-8 players.rb >> data/collect_app.log 2>&1 || { log "선수정보 실패"; exit 1; }
ruby -Eutf-8 prizes.rb >> data/collect_app.log 2>&1 || log "상금 정보 실패 (계속 진행)"
ruby -Eutf-8 subtours.rb >> data/collect_app.log 2>&1 || log "드림·챌린지 정보 실패 (계속 진행)"
ruby -Eutf-8 topranking.rb >> data/collect_app.log 2>&1 || log "톱랭킹 정보 실패 (계속 진행)"
ruby -Eutf-8 build_db.rb >> data/collect_app.log 2>&1 || { log "DB 만들기 실패"; exit 1; }
ruby -Eutf-8 team_collect.rb --current >> data/collect_app.log 2>&1 || log "팀리그 수집 실패 (계속 진행)"
ruby -Eutf-8 team_roster.rb --current >> data/collect_app.log 2>&1 || log "팀 명단 실패 (계속 진행)"
ruby -Eutf-8 team_schedule.rb >> data/collect_app.log 2>&1 || log "팀리그 일정 실패 (계속 진행)"
ruby -Eutf-8 build_team_db.rb >> data/collect_app.log 2>&1 || log "팀리그 DB 실패"
log "업데이트 완료: $(sqlite3 data/pba.db 'select count(*)/2 from games')경기, 마지막 경기 $(sqlite3 data/pba.db 'select max(date) from games')"
