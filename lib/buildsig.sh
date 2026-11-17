# update_app.sh · quick_update.sh 가 같이 쓴다 (source).
# DB 를 만드는 입력(받아 온 자료 파일 + 만드는 코드)의 지문. 지난번에 DB 를 만들 때와 같으면 다시 만들지 않는다.
#  (수집 스크립트는 바뀐 게 없어도 파일을 새로 쓰므로 시각이 아니라 내용으로 비교한다)
#  DB 를 새로 만들면 앱 화면이 자료 전체(수십 MB)를 다시 받으니, 새 경기가 없을 때 30분마다 다시 만드는 일을 막는다.
pba_sig() { cat build_db.rb model/build_predict.rb lib/*.rb aliases.json data/*.json data/matches/*.json 2>/dev/null | md5 }
team_sig() { { pba_sig; cat build_team_db.rb lib/*.rb aliases.json data/*.json data/team/*.json 2>/dev/null; } | md5 }
# same_sig 이름 지문 : 지난번 지문과 같고 DB 파일도 있으면 참
same_sig() { [[ -f data/$1.db && -f data/.$1.sig && $(cat data/.$1.sig) == $2 ]] }
