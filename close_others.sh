#!/bin/zsh
# 사용: close_others.sh <문서이름> : 그 문서 말고 열려 있는 Numbers 문서를 저장하고 닫는다 (메뉴 동작이 엉뚱한 문서로 가는 사고 방지)
osascript -l JavaScript -e "var N=Application('Numbers'); N.documents().forEach(function(d){ if (d.name() != '$1') { try { d.close({saving:'yes'}) } catch(e) {} } }); N.documents().map(function(d){return d.name()}).join(',')" >/dev/null
