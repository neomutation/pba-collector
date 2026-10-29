#!/bin/zsh
# 빠른 업데이트: 방금 끝난 경기만 얼른 반영한다 (앱을 쓰는 동안 server.rb 가 경기가 끝난 걸 알아채면 실행)
#   ./quick_update.sh indiv 271,272   # 개인투어: 그 투어(진행 중)만 다시 받고 DB 다시 만들기
#   ./quick_update.sh team            # 팀리그: 이번 시즌만 다시 받고 팀 DB 다시 만들기
# 선수정보·상금 같은 무거운 수집은 하지 않는다 (그건 update_app.sh 가 30분마다). update_app.sh 와 같은 잠금을 써서 겹치지 않는다.
cd "$(dirname "$0")"
export LANG=ko_KR.UTF-8 LC_ALL=ko_KR.UTF-8 PATH=/usr/bin:/bin:/usr/sbin:/sbin
LOG=data/update.log
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> $LOG }

LOCK=data/.update.lock
if ! mkdir $LOCK 2>/dev/null; then
  if [[ -n $(find $LOCK -mmin +60 2>/dev/null) ]]; then rmdir $LOCK; mkdir $LOCK; else exit 0; fi
fi
trap 'rmdir $LOCK 2>/dev/null' EXIT

if [[ $1 == team ]]; then
  log "빠른 업데이트 시작 (팀리그 경기 끝남)"
  ruby -Eutf-8 team_collect.rb --current >> data/collect_app.log 2>&1 || { log "빠른 업데이트: 팀리그 수집 실패"; exit 1; }
  ruby -Eutf-8 team_schedule.rb >> data/collect_app.log 2>&1 || log "빠른 업데이트: 팀리그 일정 실패 (계속)"
  ruby -Eutf-8 build_team_db.rb >> data/collect_app.log 2>&1 || { log "빠른 업데이트: 팀리그 DB 실패"; exit 1; }
  log "빠른 업데이트 완료 (팀리그)"
else
  log "빠른 업데이트 시작 (투어 $2 경기 끝남)"
  ruby -Eutf-8 collect.rb --tours $2 >> data/collect_app.log 2>&1 || { log "빠른 업데이트: 경기 수집 실패"; exit 1; }
  ruby -Eutf-8 build_db.rb >> data/collect_app.log 2>&1 || { log "빠른 업데이트: DB 만들기 실패"; exit 1; }
  log "빠른 업데이트 완료: $(sqlite3 data/pba.db 'select count(*)/2 from games')경기, 마지막 경기 $(sqlite3 data/pba.db 'select max(date) from games')"
fi
