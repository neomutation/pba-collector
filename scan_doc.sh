#!/bin/zsh
# 사용: scan_doc.sh <파일경로> <문서이름> <저장접두사> <시트...>
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
FILE=$1; DOC=$2; PFX=$3; shift 3
open -a Numbers "$FILE"
for i in $(seq 1 40); do n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")'); case ",$n," in *",$DOC,"*) break;; esac; sleep 2; done; sleep 3
./close_others.sh "$DOC"
for s in $@; do osascript -l JavaScript wrapscan.js "$DOC" $s "$PWD/tmp/wrap_${PFX}_$s.json" 2>&1 | tail -1; done
