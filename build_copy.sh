#!/bin/zsh
# 사용: ./build_copy.sh <문서이름> <원본경로> <접두사> <선수공식명> <시즌시트...>
# 원본은 건드리지 않고 out/ 아래 복사본을 새로 만들어 수집 데이터를 채운다.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
DOC=$1; ORIG=$2; PFX=$3; PLAYER=$4; shift 4; SHEETS=("$@")
osascript -l JavaScript -e "try { Application('Numbers').documents.byName('$DOC').close({saving:'no'}) } catch(e) {}" >/dev/null 2>&1
cp "$ORIG" "out/$DOC.numbers" && open -a Numbers "out/$DOC.numbers"
for i in $(seq 1 40); do
  n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")' 2>&1)
  case ",$n," in *",$DOC,"*) break;; esac; sleep 2
done
./close_others.sh "$DOC"
for s in $SHEETS; do osascript -l JavaScript extract.js "$DOC" $s "$PWD/tmp/${PFX}_$s.json" >/dev/null; done
osascript -l JavaScript extract.js "$DOC" 시즌비교 "$PWD/tmp/${PFX}_sb.json" >/dev/null
ruby -Eutf-8 plan.rb "$PLAYER" $PFX $SHEETS > "tmp/plan_rows_$PFX.json"
ruby -Eutf-8 plan_summary.rb "$PLAYER" $PFX > "tmp/plan_sb_$PFX.json"
ruby -Eutf-8 -e 'require "json"; puts JSON.generate(ARGV.flat_map { |f| JSON.parse(File.read(f)) })' "tmp/plan_rows_$PFX.json" "tmp/plan_sb_$PFX.json" > "tmp/plan_$PFX.json"
ruby -Eutf-8 -e 'require "json"; p = JSON.parse(File.read(ARGV[0])); puts "plan: #{p.count { |x| x["cells"] }} new rows, #{p.count { |x| x["error"] }} errors, #{p.sum { |x| (x["colors"]||{}).size }} colors, #{p.sum { |x| (x["notes"]||[]).size }} notes"; p.select { |x| x["error"] }.each { |x| puts "  ! " + x["error"] }' "tmp/plan_$PFX.json"
osascript -l JavaScript apply.js "$DOC" "$PWD/tmp/plan_$PFX.json"
