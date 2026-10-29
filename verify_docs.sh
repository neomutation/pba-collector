#!/bin/zsh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")"
check() { # doc player pfx sheets...
  DOC=$1; PLAYER=$2; PFX=$3; shift 3
  open -a Numbers "out/$DOC.numbers"
  for i in $(seq 1 30); do n=$(osascript -l JavaScript -e 'Application("Numbers").documents().map(function(d){return d.name()}).join(",")' 2>&1); case ",$n," in *",$DOC,"*) break;; esac; sleep 2; done; sleep 3
  ./close_others.sh "$DOC"; ./raise.sh "$DOC"
  for S in $@; do osascript -l JavaScript extract.js "$DOC" "$S" "$PWD/tmp/${PFX}_$S.json" values >/dev/null; done
  echo "=== $DOC"; ruby -Eutf-8 compare.rb "$PLAYER" $PFX $@ 2>&1 | grep -E "^==|차이|파일에만|수집에만|합계" | cut -c1-200
  osascript -l JavaScript -e "var d=Application('Numbers').documents.byName('$DOC'); d.sheets().map(function(s){return s.name()+'('+s.tables().length+')'}).join(',')"
}
check 응꾸응_시범 "Q.응우옌" vung 2627 2526 2425 2324 2223 2223신규 2324신규 2425신규 2526신규
check 조건휘_업데이트 "조건휘" vcgh 2627 2526 2425 2324 2223신규 2324신규 2425신규 2526신규
check 강동궁_업데이트 "강동궁" vkdg 2627 2526 2425 2324 2223 2223신규 2324신규 2425신규 2526신규
check 김가영_시범 "김가영" vkgy 2627 2223신규 2324신규 2425신규 2526신규
