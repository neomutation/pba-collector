// 캐스터용 경기 기록지 (주소에 ?caster 가 있을 때만: 바탕화면 '프바 캐스터' 앱)
//  엑셀 기록지와 같은 방식: 이닝마다 공격을 하나씩 적고, 이닝의 마지막 공격 = 실패(공수 교대). 뱅크샷(1·2·3)은 성공하면 2점
//  기호: 어떤 글자든 기술로 받는다 (버튼 입력은 ㄷ ㅏ ㅕ ㅂ ㅐ ㅎ ㅅ ㄸ + ㅋ ㄹ ㅁ) · 뱅크샷 1 2 3 · 파울 T O W H (넣으면 이닝 끝)
//  세트는 목표 점수에 닿은 뒤 '이닝 끝'을 눌러야 끝난다. 팀리그는 세트 점수와 선수를 홈피 출전 오더에서 받는다
//  키보드: 한글 자판 그대로 글자가 들어간다 (받침 조합 없이 한 글자씩), 1·2·3 = 뱅크샷, Shift+T·O·W·H = 파울,
//          Enter = 이닝 끝(마지막 공격 실패), Backspace = 지우기, Esc = 최소화
(function () {
  const CASTER = new URLSearchParams(location.search).has('caster');
  window.Sheet = { on: CASTER, btn: () => '' };
  if (!CASTER) return;
  const HAS_NATIVE = !!(window.webkit && webkit.messageHandlers && webkit.messageHandlers.pba);
  const SHEETWIN = new URLSearchParams(location.search).has('sheetwin');   // 다른 화면으로 옮길 수 있는 별도 창 (기록지만 보인다)

  const TECH = ['ㄷ', 'ㅏ', 'ㅕ', 'ㅂ', 'ㅐ', 'ㅎ', 'ㅅ', 'ㄸ', '+', 'ㅋ', 'ㄹ', 'ㅁ'], BANK = ['1', '2', '3'], FOUL = ['T', 'O', 'W', 'H'];
  const isBank = x => BANK.includes(x), isFoul = x => FOUL.includes(x);
  // 두벌식 자판 그대로 (한글 입력 중에도 조합되지 않게 물리 키로 읽는다)
  const JAMO = { KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyO: 'ㅐ', KeyP: 'ㅔ', KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ', KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ' };
  const SHIFT = { KeyT: 'T', KeyO: 'O', KeyW: 'W', KeyH: 'H', KeyE: 'ㄸ', KeyQ: 'ㅃ', KeyR: 'ㄲ' };
  const keyOf = e => e.shiftKey && SHIFT[e.code] ? SHIFT[e.code] : JAMO[e.code] || (/^(Numpad|Digit)[1-9]$/.test(e.code) ? e.code.slice(-1) : e.code === 'NumpadAdd' || (e.shiftKey && e.code === 'Equal') ? '+' : e.key && e.key.length === 1 && e.key !== ' ' ? e.key : null);
  const TEAM_TARGETS = [11, 9, 15, 9, 11, 9, 11];   // 팀리그 세트 점수 (홈피 오더의 GP 가 있으면 그 값)
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pc = v => v == null || isNaN(v) ? '–' : (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const f3 = v => v == null || isNaN(v) ? '–' : v.toFixed(3);
  const rt = (a, b) => b ? a / b : null;

  // ── 상태 (이 맥에 저장) ── turn = 한 선수의 한 이닝 { e: 공격 기호들, closed: false 진행 중 | 'miss' 마지막 공격 실패 | 'end' 세트를 끝낸 이닝(전부 성공) }
  //  세트의 이닝 순서는 선공(first)부터 번갈아: turns[i] 의 선수 = (first + i) % 2, 이닝 번호 = i/2 + 1
  const SKEY = 'pba_caster_sheet';
  const blankSet = first => ({ first, turns: [], winner: null });
  const fresh = () => ({ names: ['', ''], type: 'PBA', target: 15, lastTarget: 11, toWin: 3, input: 'direct', orders: [], gameKey: null, sets: [blankSet(0)], open: { s0: true }, view: 'open' });
  let S; try { S = JSON.parse(localStorage.getItem(SKEY)) || null; } catch (e) { S = null; }
  if (!S || !S.sets) S = fresh();
  S.input = S.input || 'direct'; S.orders = S.orders || [];
  let notice = '';   // 안내 문구
  // 기록 중인 경기가 있는데 다른 경기를 불렀을 때 묻는 것은 S.pend 에 둔다 (본 창에서 눌러도 별도 기록지 창에 보이게): 팀 = 오더, 개인 = { ind, names, type, title }
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let sel = null;   // 고친다고 고른 칸 { set, turn }
  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} };

  // ── 계산 ──
  // 진행 중 이닝은 지금까지 입력한 공격을 모두 득점으로 본다. 이닝을 Tab으로 닫으면 마지막 공격이 실패로 빠진다
  const succOf = t => t.closed === 'miss' ? t.e.slice(0, -1) : t.e;
  const sumPts = l => l.reduce((a, x) => a + (isBank(x) ? 2 : isFoul(x) ? 0 : 1), 0);
  // over = 세트 끝 이닝에서 목표 점수를 넘긴 만큼 (10점에서 뱅크샷 2점으로 끝내도 11점). 득점 · 에버에서 빼고, 뱅크샷 성공 수는 그대로
  const ptsOf = t => sumPts(succOf(t)) - (t.over || 0);
  const sideOf = (set, i) => (set.first + i) % 2;
  const setScore = set => [0, 1].map(p => set.turns.reduce((a, t, i) => a + (sideOf(set, i) === p ? ptsOf(t) : 0), 0));
  // 복식 선수별 득점: 스카치 더블은 팀 공격마다 번갈아 친다 (이닝이 바뀌어도 이어짐). set.pw[p] = 그 팀에서 먼저 치는 선수 (이름을 눌러 바꿈)
  const pairPts = (set, p) => {
    const out = [0, 0]; let k = (set.pw && set.pw[p]) || 0;
    set.turns.forEach((t, i) => {
      if (sideOf(set, i) !== p) return;
      const ok = succOf(t).length;
      t.e.forEach((x, j) => { if (j < ok) out[k % 2] += sumPts([x]) - (t.over && j === ok - 1 ? t.over : 0); k++; });
      if (!t.e.length) k++;   // 공격 기록 없이 넘긴 이닝도 실패 한 번
    });
    return out;
  };
  const setsWon = () => [0, 1].map(p => S.sets.filter(s => s.winner === p).length);
  const orderOf = si => (S.orders || []).find(o => o.no === si + 1);
  // 오더 고치기: 홈피 오더를 기본으로 두고 세트마다 선수를 바꿀 수 있다. 고친 세트는 홈피 오더를 o.home 에 남겨 둔다(되돌리기 · 다시 불러와도 고친 것 유지)
  //  직접 넣은 오더(홈피 오더 없음 · 인터넷 없음)는 o.manual
  let editOrd = false;
  const ordKind = o => o.kind || (S.codes && window.TeamApp ? TeamApp.sheetSetKind(S.codes[0], S.codes[1], S.league, o.no) : '');
  const ordSlots = o => { const k = ordKind(o); return /단식/.test(k) ? 1 : /복식/.test(k) ? 2 : Math.max(1, ...[0, 1].map(p => ((o.p && o.p[p]) || []).length)); };
  const sameP = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
  //  세트 한쪽 선수 고르기: 그 세트 종목 성별이 위, 명단에 없는 이름(홈피 표기)은 그대로 보이게
  const ordSel = (o, p) => {
    const k = ordKind(o), code = S.codes && S.codes[p], ros = window.TeamApp && TeamApp.sheetRoster && code ? TeamApp.sheetRoster(code, S.league) : [], cur = (o.p && o.p[p]) || [];
    const gs = /여자/.test(k) ? [['F', '여자'], ['M', '남자']] : [['M', '남자'], ['F', '여자']];
    return Array.from({ length: Math.max(ordSlots(o), cur.length) }, (_, j) => { const v = cur[j] || '';
      const grp = ([g, lab]) => { const xs = ros.filter(r => (r.gender === 'F') === (g === 'F')); return xs.length ? `<optgroup label="${lab}">${xs.map(r => `<option${r.name === v ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</optgroup>` : ''; };
      return `<select class="osel" data-ord="${o.no}|${p}|${j}"><option value="">–</option>${v && !ros.some(r => r.name === v) ? `<option selected>${esc(v)}</option>` : ''}${gs.map(grp).join('')}</select>`; }).join('');
  };
  const setNames = (si, p) => { const o = S.type === '팀리그' && orderOf(si); return o && o.p && o.p[p] ? o.p[p].join('·') : ''; };
  const playersH = (si, p) => { const o = S.type === '팀리그' && orderOf(si); return o && o.p && o.p[p] ? o.p[p].map(n => `<span class="plh" data-pl="${si}|${p}">${esc(n)}</span>`).join('·') : ''; };
  const targetOf = si => { if (S.sets[si] && S.sets[si].tb) return Infinity; if (S.type === '팀리그') { const o = orderOf(si); return (o && o.gp) || TEAM_TARGETS[si] || 11; } const before = S.sets.slice(0, si).filter(s => s.winner != null); const a = before.filter(s => s.winner === 0).length, b = before.filter(s => s.winner === 1).length; return a === S.toWin - 1 && b === S.toWin - 1 ? S.lastTarget : S.target; };
  const matchOver = () => setsWon().some(n => n >= S.toWin);
  // 한 선수의 이닝들 → 기록
  function stat(turns) {
    const o = { over: 0, pts: 0, inn: turns.length, hr: 0, one: 0, mid: 0, long: 0, zero: 0, att: 0, succ: 0, bAtt: 0, bSucc: 0, foul: 0, type: {} };
    turns.forEach(t => {
      const p = ptsOf(t), sc = succOf(t); o.over += t.over || 0;
      o.pts += p; o.hr = Math.max(o.hr, p);
      if (p === 0) o.zero++; else if (p === 1) o.one++; else if (p <= 4) o.mid++; else o.long++;
      t.e.forEach(x => { o.att++; const y = o.type[x] || (o.type[x] = { a: 0, s: 0 }); y.a++; if (isBank(x)) o.bAtt++; if (isFoul(x)) o.foul++; });
      sc.forEach(x => { if (isFoul(x)) return; o.succ++; o.type[x].s++; if (isBank(x)) o.bSucc++; });
    });
    o.avg = rt(o.pts, o.inn); o.longR = rt(o.long, o.inn); o.midR = rt(o.mid, o.inn); o.zeroR = rt(o.zero, o.inn); o.oneR = rt(o.one, o.inn);
    o.bPts = o.bSucc * 2 - o.over; o.bPtsR = rt(o.bPts, o.pts); o.bTry = rt(o.bAtt, o.att); o.bRate = rt(o.bSucc, o.bAtt); o.tech = rt(o.succ, o.att);
    return o;
  }
  const turnsOf = (set, p) => set.turns.filter((t, i) => sideOf(set, i) === p && t.closed);

  // ── 입력 ──
  function liveSet() { return S.sets[S.sets.length - 1]; }
  function add(x) {
    if (sel) { const t = S.sets[sel.set].turns[sel.turn]; t.e.push(x); save(); render(); return; }
    if (matchOver()) return;
    const set = liveSet(); let t = set.turns[set.turns.length - 1];
    if (set.tb && set.first == null) return;   // 승부치기: 선공을 먼저 고른다
    S.started = true; set.fc = true; S.day = todayStr();   // 마지막으로 기록한 날 (다른 경기를 부를 때 지난 기록인지 본다)
    if (!t || t.closed) { t = { e: [], closed: false }; set.turns.push(t); }
    t.e.push(x);
    if (isFoul(x)) { t.closed = 'miss'; finishIfWon(set); }
    save(); render();
  }
  // 승부치기 세트(set.tb): 목표 점수 없이 한 이닝씩 번갈아 → 후공 이닝이 끝났을 때 점수가 다르면 끝 (후공이 넘어서면 Enter 로 바로 끝)
  function finishIfWon(set) {
    const si = S.sets.indexOf(set), p = sideOf(set, set.turns.length - 1);
    if (set.tb) { const s2 = setScore(set); if ((set.turns.length - 1) % 2 === 1 && s2[0] !== s2[1]) set.winner = s2[0] > s2[1] ? 0 : 1; return; }
    if (setScore(set)[p] < targetOf(si)) return;
    set.winner = p;
    if (!matchOver()) { S.sets.push(blankSet(1 - set.first)); S.open = { ['s' + (S.sets.length - 1)]: true }; }
  }
  // 진행 중 이닝의 마지막 공격이 들어가면 세트가 끝나는지
  function canFinish() {
    if (sel || matchOver()) return false;
    const set = liveSet(), t = set.turns[set.turns.length - 1];
    if (!t || t.closed || !t.e.length) return false;
    const p = sideOf(set, set.turns.length - 1);
    if (set.tb) return (set.turns.length - 1) % 2 === 1 && setScore(set)[p] > setScore(set)[1 - p];   // 승부치기: 후공이 상대 점수를 넘으면
    return setScore(set)[p] >= targetOf(S.sets.length - 1);
  }
  // Tab = 이닝 끝: 마지막 공격 실패로 바로 닫는다 (묻지 않음)
  function endInning() {
    if (sel) { sel = null; const lt = liveSet().turns[liveSet().turns.length - 1]; if (!lt || lt.closed || !lt.e.length) { render(); return; } }   // 고치기 끝 (진행 중 이닝이 있으면 그 이닝도 이어서 닫는다)
    if (matchOver()) return;
    const set = liveSet(); let t = set.turns[set.turns.length - 1];
    if (set.tb && set.first == null) return;
    S.started = true; set.fc = true; S.day = todayStr();   // 마지막으로 기록한 날 (다른 경기를 부를 때 지난 기록인지 본다)
    if (!t || t.closed) { t = { e: [], closed: false }; set.turns.push(t); }   // 공격 기록 없이 넘긴 이닝 = 0점
    closeTurn('miss');
  }
  // Enter = 마지막 공격까지 성공: 세트 끝. 세트가 끝나는 상황이 아니면 Tab 과 같다
  function endSuccess() { if (canFinish()) closeTurn('end'); else endInning(); }
  function closeTurn(how) {
    const set = liveSet(), t = set.turns[set.turns.length - 1];
    if (how === 'end') { const over = setScore(set)[sideOf(set, set.turns.length - 1)] - targetOf(S.sets.indexOf(set)); if (over > 0) t.over = over; }
    t.closed = how; finishIfWon(set); save(); render();
  }
  function back() {
    if (sel) { const t = S.sets[sel.set].turns[sel.turn]; t.e.pop(); save(); render(); return; }
    let set = liveSet();
    if (set.tb && !set.turns.length) { if (set.fc) { set.fc = false; set.first = null; } else { delete set.tb; const pv = S.sets[S.sets.length - 2]; set.first = pv ? 1 - pv.first : 0; } save(); render(); return; }   // 승치 선공 → 승부치기 돌입 순으로 되돌림
    if (!set.turns.length && S.sets.length > 1) { S.sets.pop(); set = liveSet(); S.open = { ['s' + (S.sets.length - 1)]: true }; }
    const t = set.turns[set.turns.length - 1];
    // 경기 시작 · 선공 입력도 지우기로 되돌린다
    if (!t) { if (S.sets.length === 1) { if (set.fc) set.fc = false; else S.started = false; } save(); render(); return; }
    set.winner = null; t.closed = false; delete t.over;
    if (t.e.length) t.e.pop();
    if (!t.e.length) set.turns.pop();   // 빈 이닝은 남기지 않아 다음 지우기가 헛돌지 않게
    save(); render();
  }

  // ── 화면 ──
  const css = document.createElement('style');
  css.textContent = `
#sheet { position: fixed; z-index: 60; left: 50%; top: 52px; transform: translateX(-50%); width: min(1180px, calc(100vw - 24px)); max-height: calc(100vh - 64px); overflow: auto; background: color-mix(in srgb, var(--panel) 32%, transparent); -webkit-backdrop-filter: blur(1.5px); backdrop-filter: blur(1.5px); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 70px rgba(0,0,0,.5); font-variant-numeric: tabular-nums; }
#sheet[hidden], #sheetFab[hidden] { display: none; }
#sheet { resize: both; min-width: 420px; min-height: 200px; }
#sheet .shead { cursor: move; user-select: none; -webkit-user-select: none; } #sheet .shead input, #sheet .shead select, #sheet .shead button { cursor: pointer; } #sheet .shead input { cursor: text; }
body.sheetwin > *:not(#sheet):not(.rkbub) { display: none !important; }
body.sheetwin #sheet { left: 0; top: 0; transform: none; width: 100vw; height: 100vh; max-height: 100vh; border: 0; border-radius: 0; resize: none; box-shadow: none; background: var(--panel); } body.sheetwin #sheet .shead { cursor: default; }
#sheet .tinfo { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 2px 3px; margin-top: 4px; }
#sheet .tinfo .ti { display: flex; align-items: baseline; gap: 4px; padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--chip) 70%, transparent); line-height: 1.35; font-size: 12px; text-align: left; min-width: 0; }
#sheet .tinfo .ti small { flex: 1 1 auto; min-width: 0; font-size: 10px; font-weight: 600; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #sheet .tinfo .ti b { flex: none; font-weight: 800; color: var(--ink); white-space: nowrap; } #sheet .tinfo .ti i { flex: 0 1 auto; min-width: 0; font-style: normal; font-size: 10px; font-weight: 500; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#sheet .tinfo .ti.hi b { color: var(--accent); }
@media (max-width: 900px) { #sheet .tinfo { grid-template-columns: repeat(2, minmax(0, 1fr)); } #sheet .tinfo .ti { padding: 0 3px; line-height: 1.25; font-size: 11px; } #sheet .pad .hint { display: none; } #sheet .shead { padding: 6px 10px 6px; } #sheet .board { margin-top: 4px; } #sheet .pad { margin-top: 4px; } #sheet .board .mid { padding-top: 0; } #sheet .board .mid .mscore { font-size: 24px; } #sheet .board .mid small { font-size: 10px; } #sheet .board .mid .h2h { font-size: 10px; margin-top: 2px; max-width: 170px; } #sheet .board .who, #sheet .board .strate { font-size: 11px; } #sheet .board .setpt { font-size: 13px; } #sheet .tinfo .ti i { display: none; } #sheet .board { gap: 6px; } #sheet .board .pl { font-size: 17px; padding: 2px 6px; } }
#sheet table.mt { border-collapse: collapse; margin: 0 auto; font-size: 11px; font-weight: 800; line-height: 1.2; } #sheet table.mt th { font-size: 10px; font-weight: 600; color: var(--sub); padding: 0 4px; white-space: nowrap; border: 0; background: none; } #sheet table.mt td { min-width: 2.7em; padding: 0 1px; border: 0; } #sheet table.mt td.hi { color: var(--accent); } #sheet table.mt td:first-child { text-align: right; } #sheet table.mt td:last-child { text-align: left; } #sheet .board .mid .mscore { display: block; font-size: 30px; line-height: 1.2; margin-top: 2px; }
#sheet .board { align-items: start; } #sheet .board .mid { padding-top: 6px; } #sheet .board .mid .h2h { display: block; font-size: 12px; color: var(--sub); margin-top: 4px; max-width: 170px; } #sheet .board .mid .h2h b { font-size: 12px; color: var(--ink); }
#sheet .shead { position: sticky; top: 0; z-index: 2; background: color-mix(in srgb, var(--panel) 81%, transparent); border-bottom: 1px solid var(--line); padding: 10px 14px 8px; }
#sheet .srow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#sheet .stitle { font-weight: 800; font-size: 15px; margin-right: 6px; }
#sheet input.nm { width: 8.5em; font: inherit; font-weight: 800; background: var(--chip); color: var(--ink); border: 1px solid var(--line); border-radius: 7px; padding: 3px 8px; }
#sheet input.nm.r { text-align: right; }
#sheet select, #sheet .sbtn { font: inherit; font-size: 12px; background: var(--chip); color: var(--ink); border: 1px solid var(--line); border-radius: 7px; padding: 3px 8px; cursor: pointer; }
#sheet .sbtn.min { margin-left: auto; }
#sheet .board { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-top: 8px; }
#sheet .board .pl { font-size: 22px; font-weight: 800; padding: 4px 10px; border-radius: 9px; border: 2px solid transparent; }
#sheet .board .pl.a { text-align: right; } #sheet .board .pl.on { border-color: var(--accent); background: rgba(var(--heat), .12); }
#sheet .board .mid { text-align: center; } #sheet .board .mid b { font-size: 30px; } #sheet .board .mid small { display: block; color: var(--sub); font-size: 12px; }
#sheet .board .sets { font-size: 13px; color: var(--sub); }
#sheet .pad { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; justify-content: center; }
#sheet .pad button { min-width: 34px; height: 32px; font: inherit; font-size: 15px; font-weight: 800; border-radius: 7px; border: 1px solid var(--line); background: var(--chip); color: var(--ink); cursor: pointer; }
#sheet .pad button.bk { background: rgba(59,130,246,.28); } #sheet .pad button.fl { background: rgba(245,158,11,.28); } #sheet .pad button.act { padding: 0 12px; font-size: 13px; background: rgba(var(--heat), .18); }
#sheet .pad .gap { width: 10px; }
#sheet .board .who { display: block; font-size: 13px; font-weight: 700; color: var(--sub); }
#sheet .pad .hint { font-size: 12px; color: var(--sub); align-self: center; }
#sheet .board .strate { display: block; font-size: 12px; font-weight: 600; color: var(--sub); } #sheet .board .strate b { color: var(--ink); } #sheet .board .strate small { font-size: 11px; }
#sheet .board .strate.fst { color: var(--accent); }
#sheet .plw { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.15; vertical-align: bottom; cursor: pointer; } #sheet .plpt { font-size: 11px; font-weight: 800; color: var(--accent); } #sheet .plsep { margin: 0 2px; }
#sheet table.lineup { width: 100%; border-collapse: collapse; font-size: 13px; } #sheet table.lineup th, #sheet table.lineup td { padding: 2px 8px; border-bottom: 1px solid var(--line); text-align: center; } #sheet table.lineup .ln { white-space: nowrap; font-weight: 800; } #sheet table.lineup .ln small { display: block; font-size: 10px; font-weight: 500; color: var(--sub); } #sheet table.lineup .lp { text-align: right; width: 42%; } #sheet table.lineup .lp.r { text-align: left; } #sheet table.lineup .lvs { display: block; font-size: 9.5px; font-weight: 500; line-height: 1.1; color: var(--sub); } #sheet table.lineup .lp.hi { font-weight: 800; color: var(--accent); } #sheet table.mt td { white-space: nowrap; } #sheet .board .mid table.mt td small { display: inline; font-size: 9px; font-weight: 500; color: var(--sub); } #sheet table.lineup .ls { font-weight: 800; white-space: nowrap; } #sheet table.lineup .lst { margin: 0 6px; font-size: 10px; font-weight: 500; color: var(--sub); white-space: nowrap; } #sheet table.lineup tr.cur td { background: rgba(var(--heat), .10); }
#sheet .board .setpt { color: var(--ink); font-size: 15px; font-weight: 800; margin-left: 4px; }
#sheet .octl { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 4px 8px; font-size: 12px; } #sheet .octl small { color: var(--sub); }   /* 오더 고치기 버튼 줄 */ #sheet .lsum .obtn { margin-left: 8px; padding: 1px 8px; font-size: 11.5px; vertical-align: 1px; } #sheet .lsum .obtn.on { background: var(--accent); color: #fff; border-color: var(--accent); }
#sheet select.osel { font-size: 12px; padding: 1px 4px; max-width: 7.5em; margin: 1px 2px; } #sheet .oed { font-size: 9.5px; font-weight: 800; color: #fff; background: #8b5cf6; border-radius: 4px; padding: 0 3px; margin: 0 3px; cursor: help; }   /* 고친 선수 칸 표시 */
#sheet .plh { cursor: help; border-bottom: 1px dotted var(--sub); }
#sheet .pad button.fin { opacity: .4; cursor: default; } #sheet .pad button.fin.on { opacity: 1; cursor: pointer; background: var(--accent); color: #fff; }
.rkbub table.ptip th { font-size: 11px; font-weight: 800; padding: 0 5px 2px; color: var(--ink); text-align: right; border-bottom: 1px solid var(--line); } .rkbub table.ptip td { padding: 0 5px; } @media (max-width: 900px) { .rkbub { max-width: calc(100vw - 12px); box-sizing: border-box; } .rkbub .ptip { font-size: 10px; letter-spacing: -.3px; } .rkbub .ptip td { padding: 0 2px; } .ptip td.pv, .ptip td.pa { padding-left: 4px !important; } .ptip td.px { padding-left: 2px !important; } .rkbub .ptip td.tl { white-space: normal; min-width: 4.5em; max-width: 6.5em; line-height: 1.15; } .rkbub .ptip small { font-size: 9px; } .rkbub .ptip th { padding-left: 4px; } }   /* 절반화면: 선수 말풍선이 화면 폭을 넘지 않게 */ .ptip { border-collapse: separate; border-spacing: 0; } .ptip tr.wr > td { border-left: 0; border-right: 0; } .ptip tr.wr > td:first-child { border-left: 1px solid var(--line); } .ptip tr.wr > td:last-child { border-right: 1px solid var(--line); } .ptip tr.wr0 > td { border-top: 1px solid var(--line); padding-top: 1px; } .ptip tr.wr1 > td { border-bottom: 1px solid var(--line); padding-bottom: 1px; } .ptip tr.wr0 > td:first-child { border-top-left-radius: 6px; } .ptip tr.wr0 > td:last-child { border-top-right-radius: 6px; } .ptip tr.wr1 > td:first-child { border-bottom-left-radius: 6px; } .ptip tr.wr1 > td:last-child { border-bottom-right-radius: 6px; } .ptip tr.now > td, .ptip tr.now > td small { color: var(--ny, #fde047) !important; font-weight: 800; } .rkbub table.ptip th.pc, .rkbub table.ptip td.pc { text-align: center; white-space: nowrap; padding: 0 6px; } .rkbub table.ptip tr.pn > * { padding-top: 5px; border-top: 2px solid var(--sub); } .rkbub table.ptip .p2 { border-left: 1px solid var(--sub) !important; }   /* 복식 말풍선: 공통 칸 · 선수별 칸 가운데 */   /* 선수 말풍선: 승률 묶음 테두리 · 이번 세트 종목 노란 강조 */ .ptip td.pv, .ptip td.pa { text-align: left; padding: 0 0 0 8px; white-space: nowrap; } .ptip td.px { text-align: left; padding: 0 0 0 3px; white-space: nowrap; } .ptip th { text-align: left; padding-left: 8px; } .rkbub table.ptip td.tl { text-align: left; color: var(--sub); } .rkbub table.ptip td.tg { text-align: left; font-weight: 800; color: var(--ink); padding: 3px 5px 0; border-bottom: 1px solid var(--line); } .rkbub table.ptip small { color: var(--sub); }
#sheet .snote.ask { color: var(--ink); font-weight: 700; } #sheet .pfqline { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; margin: 2px 0 3px; } #sheet .pfqline.l { justify-content: flex-start; } #sheet .pfqline.r { justify-content: flex-end; }   /* 퍼펙트큐 알림: 세트 기록 표 위 한 줄 (도전하는 쪽으로) */ #sheet .snote.pend { color: var(--ink); font-weight: 600; padding: 6px 10px; border: 1.5px solid #ffd60a; border-radius: 8px; background: color-mix(in srgb, #ffd60a 14%, transparent); }   /* 다른 경기 오더가 왔을 때: 눈에 띄게 */
#sheet .tinfo .ti.fbp > small { color: var(--sub) !important; font-weight: 500; text-align: right; } #sheet .tflw .tfl.tfx > small:first-child, #sheet .frg .frw.frx > small:first-child { text-align: right; } #sheet .tsr.sx .lv { white-space: nowrap; overflow: hidden; gap: 4px; } #sheet .sqw { color: var(--win) !important; font-weight: 800; } #sheet .sql { color: var(--lose) !important; font-weight: 800; }   /* 세트 결과 순서 줄('패승'): 이름 칸 오른쪽 끝에 붙임(세트 승률 칸과 같게) · 승 / 패 글자 색 (이름 옆 최근 5경기와 같은 색) */
#sheet .snote { margin-top: 6px; font-size: 12.5px; color: var(--sub); }
#sheet .sbody { padding: 8px 14px 16px; }
#sheet details { border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; }
#sheet details > summary { cursor: pointer; padding: 7px 12px; font-weight: 800; display: flex; gap: 10px; align-items: baseline; }
#sheet details > summary small { color: var(--sub); font-weight: 600; }
#sheet details details { margin: 6px 10px 10px; }
#sheet table { border-collapse: collapse; width: 100%; }
/* 데이터가 있는 칸만 진하게, 빈 곳은 뒤 화면이 비친다 */
#sheet td:not(:empty), #sheet th:not(:empty), #sheet details > summary { background: color-mix(in srgb, var(--panel) 76%, transparent); }
#sheet td, #sheet th { padding: 3px 6px; border-bottom: 1px solid var(--line); text-align: center; white-space: nowrap; }
#sheet th { color: var(--sub); font-size: 11.5px; font-weight: 700; }
#sheet table.inn td.seq { width: 42%; }
#sheet table.inn td.seq.a { text-align: right; } #sheet table.inn td.seq.b { text-align: left; }
#sheet table.inn td.no { color: var(--sub); font-weight: 700; width: 3em; }
#sheet table.inn td.pt { font-weight: 800; width: 3em; }
/* 이닝 득점: 기록 칩과 헷갈리지 않게 파란 테두리 상자 + 큰 숫자 (0점은 흐리게) */
#sheet table.inn td.pt .ip { display: inline-block; min-width: 1.9em; padding: 0 4px; border: 2px solid var(--accent); border-radius: 7px; background: var(--panel); color: var(--accent); font-size: 16px; font-weight: 900; line-height: 1.35; font-variant-numeric: tabular-nums; }
#sheet table.inn td.pt .ip.z { border-color: var(--line); color: var(--sub); font-weight: 700; } #sheet table.inn td.cum { color: var(--sub); width: 3em; font-size: 12px; }
#sheet table.inn td.seq { cursor: pointer; } #sheet table.inn td.seq:hover { background: rgba(var(--heat), .06); }
/* 차례인 쪽 절반 테두리 (ona = 왼쪽 1·2열, onb = 오른쪽 4·5열): 칸마다 안쪽 그림자로 네 변을 잇는다 */
#sheet table.inn.ona tr > :nth-child(-n+2), #sheet table.inn.onb tr > :nth-child(n+4) { background: rgba(var(--heat), .12); box-shadow: var(--bl, 0 0), var(--br, 0 0), var(--bt, 0 0), var(--bb, 0 0); }
#sheet table.inn.ona tr > :nth-child(1), #sheet table.inn.onb tr > :nth-child(4) { --bl: inset 2px 0 var(--accent); }
#sheet table.inn.ona tr > :nth-child(2), #sheet table.inn.onb tr > :nth-child(5) { --br: inset -2px 0 var(--accent); }
#sheet table.inn.ona thead th, #sheet table.inn.onb thead th { --bt: inset 0 2px var(--accent); }
#sheet table.inn.ona tbody tr:last-child > *, #sheet table.inn.onb tbody tr:last-child > * { --bb: inset 0 -2px var(--accent); }
#sheet table.inn td.seq.sel { outline: 2px solid var(--accent); outline-offset: -2px; } #sheet table.inn td.seq.now { background: rgba(var(--heat), .10); }
#sheet .ch { display: inline-block; min-width: 1.6em; padding: 0 3px; margin: 1px; border-radius: 5px; background: var(--chip); font-weight: 800; font-size: 13px; }
#sheet .ch.bk { background: rgba(59,130,246,.30); } #sheet .ch.fl { background: rgba(245,158,11,.35); } #sheet .ch.x { opacity: .55; }
#sheet .ch.miss { background: transparent; color: var(--lose); text-decoration: line-through; border: 1px solid rgba(196,55,47,.5); }
#sheet table.st td.v { font-weight: 800; width: 32%; } #sheet table.st td.v small { color: var(--sub); font-weight: 600; margin-left: 4px; } #sheet table.st td.lab { color: var(--sub); font-size: 12px; }
#sheet table.st td.v.hi { color: var(--accent); }
#sheet .stgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 760px) { #sheet .stgrid { grid-template-columns: 1fr; } #sheet .board .pl { font-size: 17px; } }
#sheetFab { position: fixed; z-index: 61; right: 22px; bottom: 26px; width: 64px; height: 64px; border-radius: 50%; border: 0; cursor: pointer; background: var(--accent); color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.45); font-weight: 800; font-size: 12px; line-height: 1.1; }
#sheetFab i { display: block; font-style: normal; font-size: 20px; }

#sheet .sbtn.arm { background: var(--lose); color: #fff; }
#sheet { --ny: #a16207; --nybg: rgba(250, 204, 21, .28); --nyln: rgba(202, 138, 4, .75); } @media (prefers-color-scheme: dark) { #sheet { --ny: #fde047; --nybg: rgba(250, 204, 21, .16); --nyln: rgba(250, 204, 21, .6); } }
#sheet .tinfo:not(.ext) { grid-template-columns: repeat(2, minmax(0, 1fr)); } #sheet .tinfo.ext { grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); } #sheet .tinfo .xh { grid-column: 1 / -1; font-size: 11px; font-weight: 800; color: var(--ink); text-align: left; padding: 1px 2px 0; } #sheet .tinfo .xh small { font-size: 10px; font-weight: 500; color: var(--sub); } #sheet .tinfo .xh.ny { color: var(--ny); }
#sheet .tinfo .ti.ny { background: var(--nybg); box-shadow: inset 0 0 0 1px var(--nyln); } #sheet .tinfo .ti.ny small, #sheet .tinfo .ti.ny i { color: var(--ny); } #sheet .tinfo .ti.ny b { color: var(--ny); }
#sheet .tinfo .ti b em { font-style: normal; font-size: 10px; font-weight: 700; opacity: .8; } #sheet .tinfo .ti b em.xtr { margin-left: 4px; padding-left: 4px; border-left: 1px solid var(--line); color: var(--ink); opacity: 1; }   /* 초구 성공률 줄 끝 이번 대회(팀리그 라운드) 값 */ #sheet .tmg { padding: 6px 8px; } #sheet .tmgb { display: flex; justify-content: center; align-items: flex-start; gap: 6px; } #sheet .tcol { display: flex; flex-direction: column; gap: 2px; min-width: 0; } #sheet .tcol.l { align-items: flex-end; } #sheet .tcol.r { align-items: flex-start; }
#sheet .lv { display: inline-flex; align-items: baseline; gap: 5px; width: fit-content; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; font-size: 11.5px; line-height: 1.45; white-space: nowrap; background: color-mix(in srgb, var(--panel) 80%, transparent); } #sheet .lv small { font-size: 10.5px; color: var(--sub); font-weight: 600; } #sheet .lv b { font-weight: 800; } #sheet .lv i { font-style: normal; font-size: 10px; color: var(--sub); } #sheet .lv.ny { border-color: var(--nyln); background: var(--nybg); } #sheet .lv.ny b, #sheet .lv.ny small, #sheet .lv.ny i { color: var(--ny); }
#sheet .srt { display: block; font-size: 11.5px; font-weight: 700; color: var(--ink); white-space: nowrap; } #sheet .srt small { font-size: 10.5px; color: var(--sub); font-weight: 600; } #sheet .srt em { font-style: normal; font-size: 10px; opacity: .8; } #sheet .srt.ny { color: var(--ny); } #sheet .srt.ny small { color: var(--ny); }
@media (max-width: 900px) { #sheet .lv i { display: none; } }
#sheet .r5[data-stip] { cursor: help; } #sheet .r5 { margin: 0 6px; font-size: 12px; font-weight: 800; letter-spacing: 1px; vertical-align: middle; } #sheet .r5 .w { color: var(--win); } #sheet .r5 .l { color: var(--lose); } #sheet .r5 .d { color: var(--sub); }
#sheet .tmgb { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; } #sheet .tsr { display: flex; flex-wrap: wrap; gap: 3px; } #sheet .tcol.l .tsr { justify-content: flex-end; }
#sheet .perf { display: inline-block; margin-left: 4px; padding: 0 5px; border-radius: 4px; background: var(--gold); color: #fff; font-size: 11px; line-height: 1.5; }
#sheet .board .mid .h2h { margin-left: auto; margin-right: auto; text-align: center; }
/* 가운데 스코어 · 기록 표: 왼쪽 값 | 항목 | 오른쪽 값을 같은 폭으로, 값은 가운데로 붙인다. 큰 숫자 = 이번 세트 점수, 그 안쪽 괄호 = 세트 스코어 (왼쪽 팀은 점수 오른쪽, 오른쪽 팀은 점수 왼쪽) */
#sheet .board .mid table.mt { width: 100%; table-layout: fixed; } #sheet .board .mid table.mt td { width: 30%; min-width: 0; } #sheet .board .mid table.mt th { width: 30%; text-align: center; white-space: nowrap; } #sheet .board .mid table.mt td { width: 35%; } #sheet .board .mid table.mt td:first-child { text-align: right; padding-right: 6px; } #sheet .board .mid table.mt td:last-child { text-align: left; padding-left: 6px; }
#sheet .board .mid .mscore { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 2px 0; line-height: 1.15; } #sheet .board .mid .mscore b { font-size: 34px; } #sheet .board .mid .msets { font-size: 18px; font-weight: 800; color: var(--sub); min-width: 1.2em; } #sheet .board .mid > small { text-align: center; }
#sheet .board .mid table.mtop td small { display: inline; font-size: 10.5px; font-weight: 600; color: var(--sub); } #sheet .board .mid table.mtop { table-layout: fixed; } #sheet .board .mid table.mtop td { width: auto; } #sheet .board .mid table.mtop td:first-child { padding-right: 0; } #sheet .board .mid table.mtop td:last-child { padding-left: 0; } #sheet .board .mid table.mtop th { width: var(--thw, 30%); padding: 0 .35em; }   /* --thw = 가장 긴 항목 이름 + 좌우 한 칸 (alignExt) */ #sheet .board .mid table.mtop tr.gap td { height: 4px; } #sheet .board .mid table.mtop th.ps { text-decoration: underline dotted; text-underline-offset: 2px; } #sheet [data-h2hp] { cursor: help; }
#sheet table.mlu { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 4px; font-size: 11px; line-height: 1.2; } #sheet table.mlu td { padding: 2px 2px; border-top: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; } #sheet table.mlu td.l, #sheet table.mlu td.r { text-align: left; width: 37%; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; } #sheet table.mlu td.p { width: 9%; text-align: center; font-weight: 800; color: var(--ink); white-space: nowrap; padding: 2px 0; } #sheet table.mlu td.n { width: 8%; text-align: center; font-size: 10px; color: var(--sub); white-space: nowrap; } #sheet .board .mid table.mlu small { display: block; font-size: 10px; color: var(--sub); font-weight: 500; } #sheet table.mlu span { font-weight: 700; color: var(--ink); } #sheet table.mlu span.w { color: #22c55e; font-weight: 800; } #sheet table.mlu span.l { color: var(--sub); font-weight: 500; } #sheet table.mlu tr.cur td { background: color-mix(in srgb, var(--accent) 10%, transparent); }
#sheet .sdet { padding: 4px 10px 8px; } #sheet .sdet table.mt { margin: 0 auto 6px; font-size: 13px; } #sheet .sdet table.mt td { min-width: 6em; } #sheet .sdet table.mt td:first-child { text-align: right; padding-right: 8px; } #sheet .sdet table.mt td:last-child { text-align: left; padding-left: 8px; } #sheet .sdet table.mt small { display: inline; font-size: 10px; color: var(--sub); } #sheet .sdh { font-size: 11px; font-weight: 800; color: var(--sub); text-align: center; margin: 4px 0 2px; }
#sheet .board { grid-template-rows: repeat(6, auto) 1fr; row-gap: 0; } #sheet .board .pl { grid-row: 1 / span 7; display: grid; grid-template-rows: subgrid; align-content: start; } #sheet .board .mid { grid-row: 1 / span 7; } #sheet .board .pb { min-width: 0; } #sheet .board .pb:empty { display: block; }
#sheet .board .who { color: var(--ink); } #sheet .board .snr { display: block; font-size: 11px; font-weight: 700; color: var(--ink); white-space: nowrap; letter-spacing: -.3px; } #sheet .board .snr small { font-size: 10px; font-weight: 600; } #sheet .board .snr small.snl { color: var(--sub); } #sheet .board .snr em { font-style: normal; font-size: 10px; font-weight: 600; color: var(--sub); margin: 0 1px; } #sheet .tflw { display: grid; grid-template-columns: repeat(5, max-content); justify-content: start; column-gap: 4px; text-align: left; font-size: 12px; font-weight: 600; color: var(--sub); white-space: nowrap; letter-spacing: -.2px; line-height: 1.35; } #sheet .tfl { display: contents; } #sheet .tfl em.rk { color: var(--sub); font-weight: 600; font-size: 10px; margin-left: 0; } #sheet .tfl.now em.rk { color: var(--sub); }   /* 순위: 값 바로 뒤 */ #sheet .tflw:has(.flb), #sheet .frg:has(.flb), #sheet .xgb { outline: 1px solid var(--line); outline-offset: 1px; border-radius: 5px; margin: 3px 0; } #sheet .tinfo.ext { margin-top: 0 !important; row-gap: 0 !important; } #sheet .tinfo.ext .ti { line-height: 1.25; padding-top: 0; padding-bottom: 0; } #sheet .frg, #sheet .tflw { line-height: 1.3 !important; }   /* 선수 영역 묶음: 줄 간격 최소 (테두리로 구분) */ #sheet .frw small.rkn, #sheet .tfl small.rkn, #sheet .tinfo .ti b small.rkn { font-size: 10px !important; font-weight: 600 !important; color: var(--sub) !important; margin-left: 0; } #sheet .frw small.rkn, #sheet .tfl small.rkn, #sheet .tinfo .ti b small.rkn { font-size: 10.5px !important; }   /* 선수 순위: 옆 수치보다 조금만 작게 */ #sheet .who .r5 { margin: 0 4px; font-size: 10px; } #sheet .xgb { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; }   /* 화살표로 접는 영역: 펼친 줄까지 얇은 테두리 */ #sheet .tfl b { color: var(--ink); font-weight: 800; } #sheet .tfl em { font-style: normal; color: var(--ink); font-weight: 700; margin-left: 2px; } #sheet .tfl small { font-size: 10.5px; } #sheet .tfl.now b, #sheet .tfl.now em { color: var(--accent); }   /* 팀 흐름 승률: 양 팀 모두 왼쪽 정렬, 칸 위치를 줄끼리 맞춘다 */
#sheet .tinfo .ti b .rv { font-weight: 500; } #sheet .tinfo .ti b strong { font-weight: 800; } #sheet .tinfo .ti b small.rkn { font-size: 10px; font-weight: 600; color: var(--sub); } #sheet .tinfo [data-stip] { cursor: help; } #sheet .pstar { display: inline-block; width: 30px; height: 30px; margin: 0 1px; vertical-align: -6px; cursor: help; overflow: visible; } #sheet .pstar polygon { stroke-width: 1; stroke-linejoin: round; } #sheet .pstar text { font: 900 9.6px/1 system-ui, sans-serif; letter-spacing: -.4px; paint-order: stroke; stroke-width: 1.8px; stroke-linejoin: round; }   /* 숫자 테두리를 별 색으로 둘러 별 밖으로 살짝 나가도 읽히게 */ #sheet .pstar.gold { filter: drop-shadow(0 0 4px rgba(255, 196, 40, .75)); } #sheet .pstar.gold polygon { fill: #ffc928; stroke: #8a5600; } #sheet .pstar.gold text { fill: #2e1b00; stroke: #ffc928; } #sheet .pstar.silver { filter: drop-shadow(0 0 3px rgba(220, 228, 240, .6)); } #sheet .pstar.silver polygon { fill: #e4e9f0; stroke: #5d6775; } #sheet .pstar.silver text { fill: #12171d; stroke: #e4e9f0; }   /* 포스트시즌 우승 금별 · 준우승 은별 (별 안 = 시즌) */
#sheet .board .pl > .pb:first-child { white-space: nowrap; } #sheet .skd { display: inline-flex; vertical-align: middle; margin-top: 3px; font-size: 0; } #sheet .pl.a .skd { float: left; } #sheet .pl:not(.a) .skd { float: right; } #sheet .skd button { font-size: 11px; font-weight: 700; line-height: 1; padding: 3px 7px; border: 1px solid var(--line); background: var(--panel); color: var(--sub); cursor: pointer; } #sheet .skd button + button { border-left: 0; } #sheet .skd button:first-child { border-radius: 9px 0 0 9px; } #sheet .skd button:last-child { border-radius: 0 9px 9px 0; } #sheet .skd button.on { background: var(--accent); border-color: var(--accent); color: #fff; }   /* 기록지 합 · 세 · 단 (이름 줄 바깥 끝) */ #sheet .board .pl.a > .pb:first-child .r5 { margin-left: 0; } #sheet .board .pl:not(.a) > .pb:first-child .r5 { margin-right: 0; } @media (max-width: 900px) { #sheet .pstar { width: 23px; height: 23px; margin: 0; vertical-align: -5px; } #sheet .pstar + .pstar { margin-left: -5px; } #sheet .board .pl > .pb:first-child { font-size: 16px; } #sheet .board .pl > .pb:first-child .r5 { margin: 0 3px; font-size: 11px; letter-spacing: 0; } }   /* 팀 이름 줄은 한 줄로 (절반 화면에선 별 · 최근 5경기를 줄인다) */ @media (max-width: 900px) { #sheet .tinfo:not(.ext) .ti { gap: 2px; } #sheet .tinfo:not(.ext) .ti b { letter-spacing: -.3px; } #sheet .tinfo .ti b small.rkn { font-size: 9px; letter-spacing: -.4px; } }   /* 절반 화면: 팀 기록 칩 이름이 잘리지 않게 수치를 조금 좁힌다 */
#sheet details > summary.ssum { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1fr); align-items: baseline; column-gap: 10px; list-style: none; } #sheet summary.ssum::-webkit-details-marker { display: none; } #sheet summary.ssum .sl { text-align: right; } #sheet summary.ssum .sr { text-align: left; } #sheet summary.ssum small { color: var(--sub); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #sheet summary.ssum .sp { font-size: 17px; font-weight: 800; min-width: 1.6em; } #sheet summary.ssum .sp:first-of-type { text-align: right; } #sheet summary.ssum .sp.w { color: #22c55e; } #sheet summary.ssum .sn { font-weight: 800; white-space: nowrap; }   /* 세트 결과 줄: 'N세트' 가운데 */
#sheet details > summary.lsum { justify-content: center; text-align: center; list-style: none; gap: 8px; }   /* 라인업 · 세부 결과 · 경기 전체 기록 줄: 가운데 */ #sheet summary.lsum::-webkit-details-marker { display: none; } #sheet table.mlu span[data-stip] { cursor: help; text-decoration: underline dotted; text-underline-offset: 2px; }
#sheet .tcol > .tsr:first-child, #sheet .tcol > .tsr.f5r { flex-wrap: nowrap; } #sheet .tsr.f5r { align-items: baseline; } #sheet .f5row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 6px; margin-top: 3px; } #sheet .f5row .f5c { font-size: 11px; font-weight: 800; color: var(--sub); white-space: nowrap; }   /* 끝내기 장타: 이름 가운데, 양옆 양 팀 */ #sheet .tsr .lv[data-stip] { cursor: help; } @media (max-width: 900px) { #sheet .tcol > .tsr:first-child, #sheet .tcol > .tsr.f5r { gap: 2px; } #sheet .tcol > .tsr:first-child .lv, #sheet .tcol > .tsr.f5r .lv { padding: 0 3px; letter-spacing: -.4px; font-size: 11px; } }   /* 우세 · 박빙 · 열세 비율은 한 줄 */
#sheet .pfqa, #sheet .pfqb { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 6px; white-space: nowrap; vertical-align: middle; font-size: 12px; } #sheet .pfqa { box-shadow: inset 0 0 0 2px var(--ny); background: var(--nybg); color: var(--ink); } #sheet .pfqa .pq1 { color: var(--ny); font-weight: 700; } #sheet .pfqa b, #sheet .pfqb b { color: var(--ny); font-weight: 900; margin-left: 1px; } #sheet .pfqb { box-shadow: inset 0 0 0 1px var(--nyln); color: var(--sub); font-weight: 700; margin: 0 4px; } #sheet .pfp { display: inline-grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; background: var(--ny); color: #1a1300; font-weight: 900; font-size: 11px; } #sheet .wpr { display: grid; grid-template-columns: auto minmax(30px, 1fr) auto minmax(30px, 1fr) auto; align-items: center; gap: 6px; margin: 2px auto 4px; max-width: 520px; font-size: 12px; cursor: help; } #sheet .wpr b { font-size: 15px; font-weight: 800; color: var(--sub); font-variant-numeric: tabular-nums; } #sheet .wpr b.up { color: var(--ny); } #sheet .wpr small { color: var(--sub); font-weight: 700; white-space: nowrap; } #sheet .wpt { height: 6px; border-radius: 3px; background: var(--chip); display: flex; justify-content: flex-end; overflow: hidden; } #sheet .wpt.r { justify-content: flex-start; } #sheet .wpt i { display: block; height: 100%; background: var(--ny); opacity: .8; }   /* 실시간 세트 승률: 가운데 글자 양옆 막대가 각자 승률만큼 */ #sheet .gwp { display: flex; justify-content: center; align-items: baseline; gap: 6px; margin: 0; cursor: help; white-space: nowrap; } #sheet .board > .gwp { grid-column: 2; grid-row: 1; align-self: center; } #sheet .board:has(> .gwp) > .mid { grid-column: 2; grid-row: 2 / span 6; } #sheet .gwp b { font-size: 15px; font-weight: 800; color: var(--sub); font-variant-numeric: tabular-nums; } #sheet .gwp b.up { color: var(--ny); } #sheet .gwp small { font-size: 10.5px; font-weight: 700; color: var(--sub); }   /* 실시간 게임 승률 */ #sheet .tsr.rt .lv, #sheet .tsr.rt .lv b, #sheet .tsr.rt .lv .vs { color: var(--ink); } #sheet .tsr.rt .lv.on { border-color: var(--ny); background: var(--nybg); } #sheet .tsr.rt .lv.on b, #sheet .tsr.rt .lv.on .vs, #sheet .tsr.rt .lv.on .va { color: var(--ny); } #sheet .tsr.sr .lv { border-color: var(--ny); }   /* 라이브 정보: 지금 상황 칸 노란 강조 · 아랫줄 노란 테두리 */   /* 퍼펙트큐 도전: 이름 묶음 테두리만 깜빡임 */ #sheet tr.pfqrow th { border: 0; padding: 2px 4px 4px; background: none; }   /* 세트 기록 표 위 한 줄: 그 팀 쪽에 붙인다 */ #sheet .pfq b { color: var(--ny); font-weight: 900; }   /* 퍼펙트큐 도전 알림 (라이브 정보 노란 칩과 같은 색) */
#sheet .frg { display: grid; grid-template-columns: repeat(5, max-content); justify-content: start; column-gap: 3px; font-size: 11.5px; font-weight: 600; color: var(--sub); white-space: nowrap; line-height: 1.4; letter-spacing: -.2px; } #sheet .frw { display: contents; } #sheet .frw b { color: var(--ink); font-weight: 800; } #sheet .frw i { font-style: normal; color: var(--ink); font-weight: 700; margin-left: 2px; } #sheet .frw small { font-size: 10.5px; } #sheet .frw em { font-style: normal; font-size: 10px; color: var(--sub); } #sheet .frw small .frp, #sheet .tfl small .frp { font-style: normal; font-size: inherit; font-weight: 700; color: var(--ink); margin: 0; } #sheet .frw.now small .frp, #sheet .tfl.now small .frp { color: var(--accent); }   /* 통산 괄호 닫힘도 여는 괄호와 같은 흰색 */ (강조 줄은 여는 괄호와 같은 색) #sheet .frw.ny b, #sheet .frw.ny i, #sheet .frw.ny small:first-child { color: var(--ny); }   /* 선수 흐름 승률 3줄: 팀 흐름 승률처럼 칸을 맞춘다 */
#sheet table.mlu .ihb { display: inline-block; min-width: 1.5em; padding: 0 3px; border: 1px solid var(--accent); border-radius: 5px; cursor: help; color: var(--ink); }   /* 단식 세트: 개인투어 맞대결 말풍선 */
#sheet .ih2h { text-align: center; font-size: 12px; color: var(--sub); margin: 2px 0 4px; white-space: nowrap; } #sheet .ih2h b { color: var(--ink); } #sheet .ih2h b.w { color: #22c55e; } #sheet .ih2h small { font-size: 11px; }   /* 개인투어 맞대결 (임시 자리) */
#sheet .tflw .tfl.tfx, #sheet .frg .frw.frx { display: none; } #sheet .tflw.open .tfl.tfx, #sheet .frg.open .frw.frx { display: contents; } #sheet .flb { cursor: pointer; border: 1px solid var(--line); border-radius: 5px; padding: 0 4px; background: var(--chip); color: var(--ink); font-weight: 700; } #sheet .flb.on { border-color: var(--accent); } #sheet .frw.now b, #sheet .frw.now i { color: var(--accent); } @media (max-width: 900px) { #sheet .tflw { font-size: 11px; column-gap: 2px; letter-spacing: -.4px; } #sheet .tflw small { font-size: 9.5px; } #sheet .frg { font-size: 11px; column-gap: 2px; letter-spacing: -.4px; } #sheet .frg small, #sheet .frg em { font-size: 9.5px; } #sheet .flb { padding: 0 2px; } }   /* 절반 화면: 선수 흐름 칸을 조금 좁힌다 */   /* 승률 버튼: 앞 세트 승 · 패 줄 접고 펴기 */
#sheet .tinfo .xgm { display: none !important; } #sheet .tinfo.o-gfb .xgm.gfb, #sheet .tinfo.o-gwr .xgm.gwr, #sheet .tinfo.o-gtw .xgm.gtw { display: flex !important; } #sheet .tinfo .xgh { cursor: pointer; } #sheet .tinfo.pre .xgm small, #sheet .tinfo.pre [data-bk] small { color: var(--ny) !important; font-weight: 800; }   /* 경기 시작 전: 승률 항목 이름 노란색 */ #sheet .tinfo .xgh small { color: var(--ink) !important; font-weight: 800; } #sheet .tinfo .gtwh { grid-column: 1 / -1; justify-content: center; }
#sheet .dni { display: inline-block; width: 13px; height: 13px; border-radius: 50%; background: var(--accent); vertical-align: -2px; position: relative; margin-left: 2px; transition: transform .15s; } #sheet .dni::after { content: ''; position: absolute; left: 3.5px; top: 3px; width: 4px; height: 4px; border-right: 1.6px solid #fff; border-bottom: 1.6px solid #fff; transform: rotate(45deg); } #sheet .o-gfb [data-flt^="gfb"] .dni, #sheet .o-gwr [data-flt^="gwr"] .dni, #sheet .o-gtw [data-flt^="gtw"] .dni, #sheet .flb.on .dni { transform: rotate(180deg); }   /* 묶음 버튼: 아래 화살표, 펼치면 위로 */
#sheet .tflw { font-size: 11.5px; } #sheet .tflw .tfl > :not(:first-child), #sheet .frg .frw > b, #sheet .frg .frw > i, #sheet .frg .frw > small:not(:first-child) { font-size: inherit !important; } #sheet .tflw .tfl > small:not(:first-child), #sheet .frg .frw > small:not(:first-child) { font-weight: 500; }   /* 승률과 옆 승패 숫자는 같은 크기 (승률만 굵게) */
@media (max-width: 900px) { #sheet .tflw, #sheet .frg { font-size: 10.5px !important; } }
.rkbub .rdb { display: inline-block; min-width: 1.4em; padding: 0 4px; border: 1px solid currentColor; border-radius: 5px; font-size: 11px; font-weight: 800; line-height: 1.3; text-align: center; }   /* 개인투어 전적 말풍선: 라운드 네모 */
@media (max-width: 735px) { #sheet .tinfo.ext .ti { padding-left: 2px !important; padding-right: 2px !important; gap: 2px !important; } #sheet .tinfo.ext .ti b { letter-spacing: -.5px; } #sheet .frg { column-gap: 1px !important; letter-spacing: -.5px !important; } #sheet .board .pl { row-gap: 0; } #sheet .frw small.rkn, #sheet .tfl small.rkn, #sheet .tinfo .ti b small.rkn { font-size: 8px !important; letter-spacing: -.6px; } #sheet .frw small.rkn, #sheet .tfl small.rkn, #sheet .tinfo .ti b small.rkn { font-size: 9.5px !important; letter-spacing: -.5px; } #sheet .board .mid table.mtop td small { font-size: 9.5px; letter-spacing: -.4px; } #sheet .tinfo.ext .ti { letter-spacing: -.4px; } #sheet .tsr.f5r .lv, #sheet .tsr.rt .lv { white-space: nowrap; flex-shrink: 0; font-size: 10px !important; padding: 0 2px !important; letter-spacing: -.5px; } #sheet .tsr.f5r, #sheet .tsr.rt { gap: 2px; } #sheet .tflw { font-size: 10px !important; column-gap: 1px; letter-spacing: -.6px; } #sheet .tflw .tfl > small:not(:first-child) { letter-spacing: -.7px; } #sheet .tfl em.rk { font-size: 8.5px; letter-spacing: -.5px; } #sheet table.mtop td { letter-spacing: -.4px; }  #sheet .pstar { width: 19px; height: 19px; vertical-align: -4px; } #sheet .pstar + .pstar { margin-left: -4px; } #sheet .board .mid { width: 168px !important; } #sheet .board { gap: 4px; } #sheet .board .pl { padding: 2px 3px; } #sheet .tinfo .ti { padding: 0 2px; } #sheet .tinfo .ti b em, #sheet .frg em { font-size: 8.5px; letter-spacing: -.5px; } #sheet .tinfo.ext .ti > small { margin-right: 2px; } #sheet table.mt { font-size: 10px; } #sheet table.mlu .ihb { min-width: 0; padding: 0 2px; } #sheet table.mlu td.n { padding: 2px 0; } }   /* 1280 화면의 절반(640) 같은 더 좁은 창: 가운데를 줄이고 칩 여백 · 순위 글씨를 줄인다 */
#sheet .board .mid .mscore b.colon { font-size: 26px; } #sheet .board .mid { width: 250px; max-width: none; } @media (max-width: 900px) { #sheet .board .mid .mscore b { font-size: 26px; } #sheet .board .mid .msets { font-size: 14px; } #sheet .board .mid { width: 200px; } }
/* 좁은 창: 칸이 넘치지 않게 줄바꿈 허용 */
#sheet .board { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); } #sheet .tinfo.ext { grid-template-columns: repeat(auto-fill, minmax(min(215px, 100%), 1fr)); } #sheet .srt { white-space: nowrap; letter-spacing: -.3px; } #sheet .srt small { letter-spacing: -.4px; } #sheet .lv { max-width: 100%; white-space: normal; }
#sheet .tinfo.ext .ti small { flex: 0 0 auto; } #sheet .tinfo.ext .ti i { flex: 1 1 0; text-align: right; order: 3; }
#sheet .tinfo.ext .ti > small { flex: 0 0 var(--lw, auto); margin-right: .3em; } #sheet .tinfo.ext .ti b .vs { display: inline-block; min-width: var(--vsw, 0); text-align: left; }   /* 이름 칸(가장 긴 이름) + 한 칸 → 시즌 값은 왼쪽부터, ' / ' 는 가장 긴 시즌 값 뒤에 맞춘다 */   /* 라이브 정보: 이름 칸 = 그 묶음에서 가장 긴 이름 폭(alignExt) → 수치 시작 위치가 같다. 자리가 모자라면 작은 승패 글씨부터 줄어든다 */
#sheet .lv .vs, #sheet .tinfo.ext .ti b .vs { color: var(--ny); } #sheet .lv .va, #sheet .tinfo.ext .ti b .va { color: var(--ink); } #sheet table.inn th.cumh { font-size: 15px; font-weight: 800; color: var(--ink); }
#sheet .board .mid .mscore { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); column-gap: 6px; } #sheet .board .mid .mscore .msl, #sheet .board .mid .mscore .msr { display: flex; align-items: center; gap: 6px; } #sheet .board .mid .mscore .msl { justify-content: flex-end; } #sheet .board .mid .mscore .msr { justify-content: flex-start; }   /* 점수판 '세트 점수 (세트스코어) : (세트스코어) 세트 점수': 쌍점이 가운데 */
#sheet summary.ssum .sn { min-width: 4.6em; text-align: center; } #sheet summary.ssum .sn .perf.ph { visibility: hidden; margin: 0 4px 0 0; }   /* 세트 결과 줄: P 칩 반대편에 같은 폭 빈 칩을 둬서 'N세트'와 점수가 가운데 */
.rkbub table.tktip td { padding: 0 4px; text-align: right; color: var(--ink); } .rkbub table.tktip td small { color: var(--sub); font-weight: 500; font-size: 9.5px; margin-left: 2px; } .rkbub table.tktip td.g { color: var(--sub); } .rkbub table.tktip td.g b { font-weight: 600; } .rkbub table.tktip td.k { text-align: center; color: var(--ink); font-weight: 800; padding: 0 8px; }
.rkbub table.tktip tr.hd td { text-align: center; color: var(--ink); font-weight: 800; padding-bottom: 1px; } .rkbub table.tktip tr.hd2 td { text-align: right; font-size: 10px; color: var(--sub); font-weight: 600; } .rkbub table.tktip tr.atk td { border-bottom: 1px solid var(--line); padding-bottom: 2px; } .rkbub table.tktip tr.atk + tr td { padding-top: 2px; } .rkbub table.tktip tr.atk td.k { color: var(--accent); }   /* 기록지 '이닝' 말풍선: 세트 · 게임 기술 성공률 */
#sheet .ls { display: none; } @media (max-width: 900px) { #sheet .lf { display: none; } #sheet .ls { display: inline; } }
@media (max-width: 820px) { #sheet .board .mid { max-width: 210px; } #sheet table.mt td { min-width: 2.2em; } #sheet .tinfo .ti { padding: 0 3px; } }
#sheet .pad button.act.go { background: var(--accent); color: #fff; border-color: var(--accent); }
#sheet .pad .kh { font-size: inherit; }
/* 절반 화면(직접 입력): 이닝 끝 · 세트 끝 · 지우기 · 선공 버튼을 작게 한 줄로, 키 안내 (Tab) (Enter) 는 숨김 */
@media (max-width: 900px) { #sheet .pad.dir { flex-wrap: nowrap; gap: 3px; } #sheet .pad.dir .gap { display: none; } #sheet .pad.dir button.act { height: 26px; padding: 0 6px; font-size: 11.5px; white-space: nowrap; letter-spacing: -.3px; flex: 0 1 auto; min-width: 0; } #sheet .pad.dir .kh { display: none; } }
header.top .sheetbtn { font: inherit; font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.1); color: #fff; border-radius: 7px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
header.top .sheetbtn:hover { background: rgba(255,255,255,.2); }
@media (max-width: 1100px) { header.top .sheetbtn { padding: 4px 8px; } }
`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'sheet'; box.hidden = true; document.body.appendChild(box);
  const fab = document.createElement('button'); fab.id = 'sheetFab'; fab.hidden = true; fab.title = ''; document.body.appendChild(fab);

  const chip = (x, miss) => `<span class="ch${isBank(x) ? ' bk' : ''}${isFoul(x) ? ' fl' : ''}${miss ? ' miss' : ''}">${esc(x)}</span>`;
  const seqH = (t, rev) => { if (!t) return ''; const arr = t.e.map((x, i) => chip(x, t.closed === 'miss' && i === t.e.length - 1)); return (rev ? arr.reverse() : arr).join(''); };
  // 이닝 표 머리글 이름: 복식은 이름 위에 그 세트 선수별 득점 (이름을 누르면 먼저 치는 선수를 바꾼다)
  const headNames = (set, si, p) => { const o = S.type === '팀리그' && orderOf(si), ps = o && o.p && o.p[p]; if (!ps || ps.length !== 2) return playersH(si, p); const pp = pairPts(set, p); return ps.map((x, i) => `<span class="plw" data-plsw="${si}|${p}"><small class="plpt">${pp[i]}</small><span class="plh" data-pl="${si}|${p}">${esc(x)}</span></span>`).join('<span class="plsep">·</span>'); };
  // 한 세트의 이닝 표 (대칭: 왼쪽 선수 공격은 가운데에서 바깥으로). 열: 왼쪽 선수 | 이닝 점수 | 이닝 | 이닝 점수 | 오른쪽 선수, 머리줄 점수 칸 = 세트 누적 점수
  // 팀리그 단식 세트: 두 선수의 개인투어 맞대결 (같은 이름의 개인투어 선수, 남자 세트 = PBA · 여자 세트 = LPBA). 받아 오면 다시 그린다
  //  indH2H(si) → { a, b: 선수 이름, games, w, l, sw, sl, last: { date, win, sw, sl } } | null (복식 · 자료 없음) | undefined (불러오는 중)
  const indCache = {};
  function indId(name, type) {
    const k = name + '|' + type; if (k in indCache) return indCache[k];
    indCache[k] = undefined;
    api('/api/search?q=' + encodeURIComponent(name)).then(list => { const n0 = name.replace(/\s/g, ''); const x = list.filter(p => p.name.replace(/\s/g, '') === n0); const y = x.find(p => p.type === type) || x[0]; indCache[k] = y ? y.id : null; render(); }).catch(() => { indCache[k] = null; });
    return undefined;
  }
  // 라운드 짧게: 결승 = 결, 4강 = 4, 8강 = 8 … (그 밖은 홈피 이름 그대로, 조별리그 = 조)
  const rdShort = g => { const r = typeof roundName === 'function' ? roundName(g) : (g.round_raw || ''); return r === '결승' ? '결' : /^(\d+)강$/.test(r) ? r.replace('강', '') : r === '조별리그' ? '조' : r; };
  function indH2H(si) {
    if (S.type !== '팀리그') return null;
    const o = orderOf(si); if (!o || !o.p || !o.p[0] || !o.p[1] || o.p[0].length !== 1 || o.p[1].length !== 1) return null;   // 단식만
    const kind = o.kind || (S.codes && window.TeamApp ? TeamApp.sheetSetKind(S.codes[0], S.codes[1], S.league, si + 1) : ''), type = /여자/.test(kind) ? 'LPBA' : /남자/.test(kind) ? 'PBA' : '';
    const ids = [indId(o.p[0][0], type), indId(o.p[1][0], type)]; if (ids.includes(undefined)) return undefined; if (ids.includes(null)) return null;
    const k = 'h|' + ids.join('|'); if (k in indCache) return indCache[k];
    indCache[k] = undefined;
    api(`/api/h2h?a=${encodeURIComponent(ids[0])}&b=${encodeURIComponent(ids[1])}`).then(gs => {
      const last = gs[gs.length - 1];
      indCache[k] = { gs: gs.map(g => ({ season: g.season, seq: g.seq, rc: g.round_code, rr: g.round_raw, win: !!g.win, sw: g.sw, sl: g.sl })), a: o.p[0][0], b: o.p[1][0], games: gs.length, w: gs.filter(g => g.win).length, l: gs.filter(g => !g.win).length, sw: gs.reduce((x, g) => x + (g.sw || 0), 0), sl: gs.reduce((x, g) => x + (g.sl || 0), 0), last: last ? { date: last.date, round: rdShort(last), win: !!last.win, sw: last.sw, sl: last.sl, single: !!last.single } : null };
      render();
    }).catch(() => { indCache[k] = null; });
    return undefined;
  }
  window.sheetIndH2H = () => indH2H(S.sets.length - 1);   // 표시 위치를 정하기 전까지 확인용
  // 가운데 라인업 세트 번호: 둥근 네모 테두리 + 커서 말풍선 = 맞대결 (왼쪽 선수 기준)
  //  개인투어(단식만): 이번 시즌 승패 → 통산 승패 → 최근 대결 (26 3T 128 = 시즌 · 차수 · 라운드)
  //  팀리그(정규리그, 같은 선수 · 콤비끼리): 이번 시즌 승패 → 통산 승패
  const curSeason = () => { const d = new Date(); return d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1; };   // 시즌은 6월에 시작
  const tourCode = g => `${String(g.season).slice(2)} ${g.seq === 'F' ? 'WC' : g.seq + 'T'} ${g.rc === 2 ? '결승' : g.rc === 4 ? '4강' : +g.rc > 4 ? g.rc : (g.rr || '')}`;
  const wlT = (w, l) => `${w}승 ${l}패`;
  const indH2HNo = (si, no) => {
    const o = orderOf(si); if (!o || !o.p || !o.p[0] || !o.p[1] || !o.p[0].length || !o.p[1].length) return no;
    const h = indH2H(si), t = window.TeamApp && TeamApp.sheetSetVs ? TeamApp.sheetSetVs(o.p[0], o.p[1], S.league) : null;
    let rows = '';
    if (h) {
      const cs = curSeason(), sg = h.gs.filter(g => g.season === cs), last = h.gs[h.gs.length - 1];
      rows += `<tr><td class="tg" colspan="2">개인투어</td></tr>` + (!h.games ? '<tr><td colspan="2">첫 맞대결</td></tr>'
        : `<tr><td>이번 시즌</td><td><b>${sg.length ? wlT(sg.filter(g => g.win).length, sg.filter(g => !g.win).length) : '–'}</b></td></tr><tr><td>통산</td><td>${wlT(h.w, h.l)}</td></tr><tr><td>최근</td><td>${esc(tourCode(last))} <b>${last.win ? '승' : '패'}</b> ${last.sw}:${last.sl}</td></tr>`);
    }
    if (t) rows += `<tr><td class="tg" colspan="2">팀리그 <small>정규리그</small></td></tr>` + (!(t.a.w + t.a.l) ? '<tr><td colspan="2">첫 맞대결</td></tr>'
      : `<tr><td>이번 시즌</td><td><b>${t.s.w + t.s.l ? wlT(t.s.w, t.s.l) : '–'}</b></td></tr><tr><td>통산</td><td>${wlT(t.a.w, t.a.l)}</td></tr>`);
    if (!rows) return no;
    const tip = `<div class="rkh0">${no}세트 맞대결 <small>${esc(o.p[0].join('·'))} 기준 vs ${esc(o.p[1].join('·'))}</small></div><table class="rdtip vs">${rows}</table>`;
    return `<span class="ihb" data-stip="${esc(tip)}">${no}</span>`; };
  const indH2HLine = si => { const h = indH2H(si); if (h === undefined) return '<div class="ih2h">개인투어 맞대결 불러오는 중…</div>'; if (!h) return '';
    if (!h.games) return `<div class="ih2h">개인투어 맞대결 <b>${esc(h.a)}</b> vs <b>${esc(h.b)}</b> · 첫 맞대결</div>`;
    return `<div class="ih2h">개인투어 맞대결 <b class="${h.w > h.l ? 'w' : ''}">${esc(h.a)} ${h.w}승</b> · <b class="${h.l > h.w ? 'w' : ''}">${h.l}승 ${esc(h.b)}</b> <small>세트 ${h.sw}:${h.sl}${h.last ? ` · 최근 ${esc(String(h.last.date || '').slice(2, 10).replace(/-/g, '.'))} ${esc(h.a)} ${h.last.win ? '승' : '패'}` : ''}</small></div>`; };
  // 퍼펙트큐 도전 (팀리그 진행 중 세트): 이 팀이 이 세트에 아직 0점이었다가 지금 이닝에서 목표까지 3점 이하만 남으면 몇 호인지 알림 (노란 칩, 세트 기록 표 이름 옆)
  function pfqFor(set, si, p) {
    if (S.type !== '팀리그' || matchOver() || si !== S.sets.length - 1 || !window.TeamApp) return '';
    const o = orderOf(si), ps = o && o.p && o.p[p]; if (!ps || !ps.length) return '';
    const k = set.turns.length - 1, t = set.turns[k]; if (!t || t.closed || sideOf(set, k) !== p) return '';
    const before = set.turns.reduce((a, x, i) => a + (i < k && sideOf(set, i) === p ? ptsOf(x) : 0), 0), left = targetOf(si) - ptsOf(t);
    return before === 0 && left > 0 && left <= 3 ? TeamApp.sheetPerfectNo(ps, S.league) : null;
  }
  // 퍼펙트큐 도전 알림 줄: [P 이름 시즌n호 단식n호](노란 테두리) + [시즌 n호 · 통산 n호](테두리만)
  //  예전엔 세트 기록 표 이름 칸 안에 넣었는데, 복식이면 그 칸만 넓어져 표(이닝 · 점수)가 한쪽으로 쏠렸다 → 표 바로 위 따로 한 줄 (도전하는 쪽으로 붙임)
  function pfqLine(set, si) {
    for (const p of [0, 1]) {
      const q = pfqFor(set, si, p); if (!q) continue;
      const mine = q.per.length < 2 ? `${esc(q.per[0].n)} <span class="pq1">시즌<b>${q.per[0].s}호</b> ${q.fmt}<b>${q.per[0].f}호</b></span>` : q.per.map(x => `<span class="pq1">${esc(x.n)} 시즌<b>${x.s}호</b> ${q.fmt}<b>${x.f}호</b></span>`).join(' ');
      const A = `<span class="pfqa" title="이번 이닝에 세트 점수를 모두 치면 퍼펙트큐 (선수 이번 시즌 · ${q.fmt} 몇 호)"><span class="pfp">P</span>${mine}</span>`, B = `<span class="pfqb" title="리그 이번 시즌 · 통산 몇 호">시즌 <b>${q.lg}호</b> · 통산 <b>${q.all}호</b></span>`;
      return `<div class="pfqline ${p ? 'r' : 'l'}">${p ? A + B : B + A}</div>`;
    }
    return '';
  }
  const headCell = (set, si, p, nameH) => nameH;
  function innTable(set, si) {
    const rows = Math.ceil(set.turns.length / 2), live = si === S.sets.length - 1 && !matchOver();
    // 지금 칠 차례인 쪽: 위 점수판 이름 칸처럼 이 세트 기록 표의 그쪽 절반에도 테두리
    const last = set.turns[set.turns.length - 1], on = !live || sel ? null : !last ? set.first : last.closed ? 1 - sideOf(set, set.turns.length - 1) : sideOf(set, set.turns.length - 1);
    let h = `${live ? pfqLine(set, si) : ''}<table class="inn${on == null ? '' : on ? ' onb' : ' ona'}"><thead><tr><th style="text-align:right">${headCell(set, si, 0, headNames(set, si, 0) || esc(S.names[0] || '왼쪽'))}</th><th class="cumh">${setScore(set)[0]}</th><th data-stip="${esc(techTip(set, si))}">이닝</th><th class="cumh">${setScore(set)[1]}</th><th style="text-align:left">${headCell(set, si, 1, headNames(set, si, 1) || esc(S.names[1] || '오른쪽'))}</th></tr></thead><tbody>`;
    for (let r = 0; r < Math.max(rows, 1); r++) {
      const cell = [null, null], idx = [null, null];
      [2 * r, 2 * r + 1].forEach(i => { if (i < set.turns.length) { const p = sideOf(set, i); cell[p] = set.turns[i]; idx[p] = i; } });
      const pts = cell.map(t => t ? `<span class="ip${ptsOf(t) ? '' : ' z'}">${ptsOf(t)}</span>` : null);
      const cls = p => { const i = idx[p]; const s = sel && sel.set === si && sel.turn === i ? ' sel' : ''; const n = live && i != null && i === set.turns.length - 1 && !set.turns[i].closed ? ' now' : ''; return s + n; };
      h += `<tr><td class="seq a${cls(0)}" data-st="${si}|${idx[0] ?? ''}">${seqH(cell[0], true)}</td><td class="pt">${pts[0] ?? ''}</td><td class="no">${r + 1}</td><td class="pt">${pts[1] ?? ''}</td>
        <td class="seq b${cls(1)}" data-st="${si}|${idx[1] ?? ''}">${seqH(cell[1], false)}</td></tr>`;
    }
    return h + '</tbody></table>';
  }
  // 대칭 기록 표: 왼쪽 선수 | 항목 | 오른쪽 선수 (더 좋은 쪽 강조)
  function statTable(A, B, extra = {}) {
    const R = [['득점', o => o.pts, String], ['이닝', o => o.inn, String, 'none'], ['에버', o => o.avg, f3], ['하이런', o => o.hr, String],
      ['장타율 <small>5점+ 이닝</small>', o => o.longR, pc, 'high', o => `${o.long}`], ['중타율 <small>2~4점</small>', o => o.midR, pc, 'none', o => `${o.mid}`], ['단타 <small>1점</small>', o => o.oneR, pc, 'none', o => `${o.one}`],
      ['공타율 <small>0점 이닝</small>', o => o.zeroR, pc, 'low', o => `${o.zero}`],
      ['뱅크샷 득점 비율', o => o.bPtsR, pc, 'high', o => `${o.bPts}점`], ['뱅크샷 시도율', o => o.bTry, pc, 'none', o => `${o.bAtt}/${o.att}`], ['뱅크샷 성공률', o => o.bRate, pc, 'high', o => `${o.bSucc}/${o.bAtt}`],
      ['기술 성공률 <small>성공 ÷ 시도</small>', o => o.tech, pc, 'high', o => `${o.succ}/${o.att}`], ['파울', o => o.foul, String, 'low']];
    if (extra.fb) R.push(['초구', o => o.fb, v => v == null ? '–' : v + '점', 'high']);
    const td = (o, q, [, get, fmt, better = 'high', sub]) => { const v = get(o), w = get(q); const hi = better !== 'none' && v != null && w != null && v !== w && (better === 'low' ? v < w : v > w); return `<td class="v${hi ? ' hi' : ''}">${v == null ? '–' : fmt(v)}${sub && v != null ? `<small>${sub(o)}</small>` : ''}</td>`; };
    return `<table class="st"><tbody>${R.map(r => `<tr>${td(A, B, r)}<td class="lab">${r[0]}</td>${td(B, A, r)}</tr>`).join('')}</tbody></table>`;
  }
  // 공격 종류별 시도 · 성공 (기호 순서 고정, 둘 다 안 쓴 기호는 뺀다)
  // 세트 기록 표 머리 '이닝' 말풍선: 두 선수의 이 세트 · 게임 전체 기술 성공률 (맨 윗줄 = 공격 성공률 = 성공 ÷ 시도)
  //  칸 순서: 게임 | 세트 | 기술 | 세트 | 게임 (가운데 기술 바로 옆이 이번 세트)
  function techTip(set, si) {
    const st = [0, 1].map(p => stat(turnsOf(set, p))), gm = [0, 1].map(p => stat(S.sets.flatMap(x => turnsOf(x, p))));
    const seen = [...new Set(gm.flatMap(o => Object.keys(o.type)))], keys = TECH.concat(seen.filter(k => !TECH.includes(k) && !BANK.includes(k) && !isFoul(k)), BANK).filter(k => gm[0].type[k] || gm[1].type[k]);
    const c = (s, a) => a ? `<b>${pc(rt(s, a))}</b><small>${s}/${a}</small>` : '–', ty = (o, k) => o.type[k] ? c(o.type[k].s, o.type[k].a) : '–';
    const row = (l, f, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td class="g">${f(gm[0])}</td><td>${f(st[0])}</td><td class="k">${l}</td><td>${f(st[1])}</td><td class="g">${f(gm[1])}</td></tr>`;
    const o = S.type === '팀리그' && orderOf(si), nm = p => esc((o && o.p && o.p[p] || []).join('·') || S.names[p] || '');
    return `<div class="rkh0">${set.tb ? '승부치기' : `${si + 1}세트`} 기술 성공률<small>세트 · 게임 전체</small></div><table class="tktip"><tr class="hd"><td colspan="2">${nm(0)}</td><td></td><td colspan="2">${nm(1)}</td></tr><tr class="hd2"><td class="g">게임</td><td>세트</td><td></td><td>세트</td><td class="g">게임</td></tr>`
      + row('공격 성공률', x => c(x.succ, x.att), 'atk') + keys.map(k => row(esc(k), x => ty(x, k))).join('') + '</table>';
  }
  function typeTable(A, B) {
    const seen = [...new Set(Object.keys(A.type).concat(Object.keys(B.type)))], rest = seen.filter(k => !TECH.includes(k) && !BANK.includes(k) && !isFoul(k));
    const keys = TECH.concat(rest, BANK, FOUL).filter(k => A.type[k] || B.type[k]);
    if (!keys.length) return '<div style="color:var(--sub);padding:6px">아직 공격 기록이 없습니다.</div>';
    const c = (o, k) => { const y = o.type[k]; return y ? `<b>${pc(rt(y.s, y.a))}</b> <small style="color:var(--sub)">${y.s}/${y.a}</small>` : '–'; };
    return `<table class="st"><thead><tr><th>성공/시도</th><th>공격</th><th>성공/시도</th></tr></thead><tbody>${keys.map(k => `<tr><td class="v">${c(A, k)}</td><td>${chip(k)}</td><td class="v">${c(B, k)}</td></tr>`).join('')}</tbody></table>`;
  }
  // 라이브 정보 칩: 묶음마다 가장 긴 항목 이름 폭에 맞춰 이름 칸을 같게 (지금 보이는 이름 기준 · 창 크기가 바뀌면 다시)
  // 가운데 상대 전적: 포스트시즌 맞대결 말풍선
  box.addEventListener('mouseover', e => { const c = e.target.closest('[data-h2hp]'); if (!c || !window.TeamApp || typeof showRkBub !== 'function') return; const [a, b] = c.dataset.h2hp.split('|'), h = TeamApp.sheetH2HPost(a, b); if (h) showRkBub(c, h); });
  box.addEventListener('mouseout', e => { const c = e.target.closest('[data-h2hp]'); if (c && !c.contains(e.relatedTarget) && typeof hideRkBub === 'function') hideRkBub(); });
  // 팀 기록 칩 말풍선 (data-stip = 말풍선 HTML)
  box.addEventListener('mouseover', e => { const c = e.target.closest('[data-stip]'); if (c && typeof showRkBub === 'function') showRkBub(c, c.dataset.stip); });
  box.addEventListener('mouseout', e => { const c = e.target.closest('[data-stip]'); if (c && !c.contains(e.relatedTarget) && typeof hideRkBub === 'function') hideRkBub(); });
  function alignExt() {
    // 가운데 윗부분: 항목 칸 폭 = 가장 긴 항목 이름 + 좌우 한 칸 → 양쪽 값 칸은 남은 폭을 똑같이 나눈다
    box.querySelectorAll('table.mtop').forEach(t => { const r = document.createRange(), ths = [...t.querySelectorAll('th')]; if (!ths.length) return; const pad = parseFloat(getComputedStyle(ths[0]).paddingLeft) * 2;
      const w = Math.max(...ths.map(th => { r.selectNodeContents(th); return r.getBoundingClientRect().width; })); t.style.setProperty('--thw', Math.ceil(w + pad) + 'px'); });
    // 가운데 표 값 칸: 글자가 칸보다 길면(앱마다 글꼴 폭이 조금 달라 넘칠 때) 그 칸만 글자를 0.5px씩 줄여 맞춘다 (최소 7px)
    box.querySelectorAll('table.mtop td, table.mt td').forEach(td => { td.style.removeProperty('font-size'); td.style.removeProperty('letter-spacing'); td.querySelectorAll('small').forEach(x => x.style.removeProperty('font-size')); const r = document.createRange(); r.selectNodeContents(td); const cs = getComputedStyle(td), room = td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1; if (!room || r.getBoundingClientRect().width <= room) return;
      let fs = parseFloat(getComputedStyle(td).fontSize); td.style.letterSpacing = '-.5px'; while (fs > 7 && (r.selectNodeContents(td), r.getBoundingClientRect().width > room)) { fs -= 0.5; td.style.fontSize = fs + 'px'; td.querySelectorAll('small').forEach(x => { x.style.fontSize = Math.max(6.5, fs - 1.5) + 'px'; }); } });
    box.querySelectorAll('.tinfo.ext').forEach(x => {
      x.style.removeProperty('--lw');
      // scrollWidth 는 정수로 잘려 소수점 폭만큼 모자랄 수 있다(말줄임표가 생김) → 실제 글자 폭(Range)을 올림하고 1px 여유
      const rg = document.createRange(), w = Math.max(0, ...[...x.querySelectorAll('.ti > small')].map(s => { rg.selectNodeContents(s); return rg.getBoundingClientRect().width; }));
      if (w) x.style.setProperty('--lw', Math.ceil(w) + 1 + 'px');
      // 수치의 ' / ' 위치도 맞춘다: 시즌 쪽(.vs) 폭 = 그 묶음에서 가장 긴 시즌 값
      x.style.removeProperty('--vsw');
      const v = Math.max(0, ...[...x.querySelectorAll('.ti b .vs')].map(s => s.getBoundingClientRect().width));
      if (v) x.style.setProperty('--vsw', Math.ceil(v) + 'px');
    });
    // 초구 묶음의 세트 결과 순서 칩('승패')은 'a:b 초구 성공률' 바로 아래 칸: 두 칸 이상이면 둘째 칸에 두고 빈자리는 다음 칩이 채운다 (한 칸이면 그대로 바로 아래). 칸 수는 부모에서 (.xgb 는 subgrid)
    box.querySelectorAll('.tinfo.ext .xgb').forEach(g => { const f = g.querySelector('.ti.fbp'); if (!f) return;
      const two = getComputedStyle(g.parentElement).gridTemplateColumns.split(' ').length > 1; f.style.gridColumn = two ? '2' : ''; g.style.gridAutoFlow = two ? 'row dense' : ''; });
    // 이닝 위 라이브 셋째 줄('승패 에버 · 승률 · 초성')은 한 줄로: 칸보다 길면 글자를 0.5px씩 줄인다 (최소 8px)
    box.querySelectorAll('.tsr.sx .lv').forEach(c => { const ss = [c, ...c.querySelectorAll('small')]; ss.forEach(x => x.style.removeProperty('font-size'));
      const col = c.closest('.tcol'), pad = el => { const cs = getComputedStyle(el); return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); }, room = col ? col.clientWidth - pad(col) - pad(c.parentElement) : c.clientWidth;   // 칸 폭 - 줄(.tsr) 여백
      let fs = parseFloat(getComputedStyle(c).fontSize); while (fs > 8 && c.getBoundingClientRect().width > room + 0.5) { fs -= 0.5; ss.forEach(x => { x.style.fontSize = (x === c ? fs : Math.max(7.5, fs - 1)) + 'px'; }); } });
  }
  let alignW = 0, alignT = 0; const realign = () => { clearTimeout(alignT); alignT = setTimeout(() => { if (box.hidden || box.offsetWidth === alignW) return; alignW = box.offsetWidth; alignExt(); }, 60); };   // 창 폭이 바뀌면 칸 맞춤 다시 (끄는 동안엔 마지막 한 번만)
  new ResizeObserver(realign).observe(box); addEventListener('resize', realign);   // 기록지 창 폭이 바뀌면 (짧은 이름으로 바뀔 수 있어) 다시
  // 단식 세트가 시작되면 개인투어 화면에 두 선수를 불러와 띄운다 (세트마다 한 번, key = 경기 + 세트). 기록지가 별도 창이면 원래 창에 띄운다
  //  선수는 이름으로 찾는다: 이름이 같고 종목(남자단식 = PBA · 여자단식 = LPBA)이 맞는 선수, 여럿이면 가장 최근에 뛴 선수
  async function showIndiv(key, names, kind) {
    if (S.indivFor === key) return; S.indivFor = key; save();
    const host = SHEETWIN && window.opener && !window.opener.closed ? window.opener : window;
    const P = host.indivPanes; if (!P || !P.a || typeof host.setApp !== 'function') return;
    const type = /여자/.test(kind || '') ? 'LPBA' : /남자/.test(kind || '') ? 'PBA' : null;
    const find = async n => { const r = await api('/api/search?q=' + encodeURIComponent(n)).catch(() => []); const xs = (r || []).filter(x => x.name === n && (!type || x.type === type)).sort((a, b) => (b.last || 0) - (a.last || 0)); return xs[0] && xs[0].id; };
    const [a, b] = await Promise.all(names.map(find));
    if (!a || !b) return;
    S.indivIds = [a, b]; save();   // 이 두 선수 화면에서 기록지를 누르면 팀리그 기록지 그대로 (indivSheet)
    host.setApp('indiv'); P.a.load(a); P.b.load(b);
  }
  function render() {
    const set = liveSet(), si = S.sets.length - 1, sc = setScore(set), won = setsWon(), over = matchOver();
    const last = set.turns[set.turns.length - 1], nextSide = !last ? set.first : last.closed ? 1 - sideOf(set, set.turns.length - 1) : sideOf(set, set.turns.length - 1);
    const isTeam = S.type === '팀리그', nm = p => esc(S.names[p] || (isTeam ? (p ? '오른쪽 팀' : '왼쪽 팀') : (p ? '오른쪽 선수' : '왼쪽 선수')));
    const tgt = targetOf(si), direct = S.input !== 'btn';
    // 개인투어 경기: 브리핑 · 라이브 정보는 indsheet.js (같은 종목 전체 경기를 받으면 다시 그린다)
    const ind = !isTeam && window.IndSheet ? S.type : null;
    if (ind) IndSheet.setKind(S.kind);   // 합 · 세 · 단 (설정 줄)
    if (ind && !IndSheet.get(ind)) IndSheet.load(ind).then(d => { if (d) render(); });
    const seqOf = p => S.sets.slice(0, si).filter(x => x.winner != null).map(x => x.winner === p ? '승' : '패').join('');   // 지금까지 세트 결과 순서 ('패승')
    // 이번 세트 선수 이름 (점수는 가운데 스코어와 이닝 표에서 본다)
    // 이름 옆: 그 선수 · 콤비의 이번 세트 번호 승률 (팀리그)
    // 세트 선수 이름 + 그 선수(콤비) 최근 5세트 (왼쪽 팀은 이름 앞, 오른쪽 팀은 이름 뒤)
    const who = p => { const n = playersH(si, p); if (!n) return ''; const r5 = isTeam && window.TeamApp && psOf(p).length ? TeamApp.sheetRecent5(psOf(p)) : ''; return p ? `<small class="who">${n}${r5}</small>` : `<small class="who">${r5}${n}</small>`; };   // 이름 아랫줄에 'N세트 승률 …'
    // 팀리그: 지금 세트 스코어에서 그 팀의 시즌 승률
    // 팀리그: 지금 세트 스코어에서 그 팀의 경기 승률 (시즌(통산)) + 그 스코어가 될 수 있는 앞 스코어 둘에서 온 경우 (실제로 온 쪽 강조)
    const rate = p => { if (set.tb) return '';   // 승부치기: 세트 번호 승률 줄은 맞지 않아 뺀다 (승부치기 정보는 라이브 정보에)
      if (ind && !over) return IndSheet.flow(S.names[p], ind, S.toWin || 3, won[p], won[1 - p], seqOf(p), 'tf' + p, !!S.open['tf' + p]);
      if (!isTeam || over || !S.codes || !window.TeamApp) return ''; return TeamApp.sheetTeamFlow(S.codes[p], S.league, won[p], won[1 - p], seqOf(p), 'tf' + p, !!S.open['tf' + p]); };
    const cfgs = isTeam ? '' : `<select data-cfg="target">${[15, 11, 9, 25].map(v => `<option value="${v}" ${S.target === v ? 'selected' : ''}>세트 ${v}점</option>`).join('')}</select>
      <select data-cfg="lastTarget">${[11, 9, 15].map(v => `<option value="${v}" ${S.lastTarget === v ? 'selected' : ''}>마지막 세트 ${v}점</option>`).join('')}</select>
      <select data-cfg="toWin">${[2, 3, 4].map(v => `<option value="${v}" ${S.toWin === v ? 'selected' : ''}>${v}세트 선승</option>`).join('')}</select>`;
    // 팀 브리핑 단계: 0 경기 시작 전 → 1 경기 시작(뱅킹 주자 뱅킹 승률) → 2 선공 입력(뱅킹 승률 빼고 초구 · 선공 · 후공 정보). 2세트부터는 선공이 번갈아 정해져 바로 2단계
    const started = S.started || S.sets.length > 1 || set.turns.length > 0, fcDone = set.tb ? !!set.fc || set.turns.length > 0 : si > 0 || set.fc || set.turns.length > 0;
    const stage = (!isTeam && !ind) || over ? 0 : !started ? 0 : !fcDone ? 1 : 2;
    // 세트가 시작되면(선공이 정해진 순간) 브리핑의 접는 버튼을 한 번 모두 펼친다. 그 세트 안에서 다시 접은 건 그대로 둔다
    if (stage === 2 && S.autoOpen !== si) { S.autoOpen = si; ['tf0', 'tf1', 'pf0', 'pf1', 'gfb0', 'gfb1', 'gwr0', 'gwr1'].concat(S.codes ? S.codes.map(c => 'gtw|' + c) : []).forEach(k => { S.open[k] = true; }); save(); }
    // 그 세트 첫 공격(초구 이닝)이 끝나면 초구 기록 묶음(초구 성공률 · 스코어별 · 에버 · 다득률)을 한 번 접는다. 그 뒤에 다시 펴는 건 그대로
    if (stage === 2 && S.fbClosed !== si && set.turns[0] && set.turns[0].closed) { S.fbClosed = si; S.open.gfb0 = false; S.open.gfb1 = false; save(); }
    const brief = S.brief === false ? null : isTeam ? (S.codes && window.TeamApp ? TeamApp.sheetBrief(S.codes[0], S.codes[1], S.league, si + 1, stage === 2) : null) : ind ? IndSheet.brief(S.names, ind, stage === 2) : null;
    const ordNow = isTeam && orderOf(si), psOf = p => (ordNow && ordNow.p && ordNow.p[p]) || [];
    if (isTeam && started && !over && psOf(0).length === 1 && psOf(1).length === 1) showIndiv(`${S.gameKey || ''}|${si}`, [psOf(0)[0], psOf(1)[0]], (ordNow && ordNow.kind) || (S.codes && window.TeamApp ? TeamApp.sheetSetKind(S.codes[0], S.codes[1], S.league, si + 1) : ''));
    const hitter = p => { const ps = psOf(p); return ps.length ? ps[((set.pw && set.pw[p]) || 0) % ps.length] : ''; };
    // 라이브 정보는 선공을 정하면 바로(세트 시작) 뜬다. fresh = 아직 끝난 이닝이 없음: 이때 새로 뜬 정보(초구 · 비율 · 스코어별 승률)가 노란색, 이닝이 끝나면 지금 상황 승률만 노란색
    const closedN = set.turns.filter(t => t.closed).length, timingOn = (isTeam || ind) && !over && stage === 2 && !set.tb, fresh = closedN < 2;   // 첫 이닝(양 팀 한 번씩)이 끝나면 노란색을 뗀다
    const extra = p => { if (set.tb && ind) return IndSheet.tbInfo(S.names[p], ind, set.first == null || !set.fc && !set.turns.length ? null : set.first === p ? 'first' : 'second', set.first !== p && set.turns[0] && set.turns[0].closed ? ptsOf(set.turns[0]) : null);
      if (brief && ind) return stage === 1 ? IndSheet.bankInfo(S.names[p], ind) : stage !== 2 ? '' : set.first === p ? IndSheet.firstInfo(S.names[p], ind, fresh, `${won[p]}:${won[1 - p]}`, p, seqOf(p), S.toWin || 3) : IndSheet.secondInfo(S.names[p], ind, fresh, p);
      if (!brief || !window.TeamApp) return ''; if (stage === 1) return TeamApp.sheetBankInfo(psOf(p), hitter(p), S.league); if (stage !== 2) return ''; return set.first === p ? TeamApp.sheetFirstInfo(psOf(p), hitter(p), S.league, fresh, `${won[p]}:${won[1 - p]}`, p, seqOf(p)) : TeamApp.sheetSecondInfo(psOf(p), S.league, fresh, p); };
    // 이름 옆 두 줄: 지금 세트 스코어에서의 승률, 앞 세트 스코어에서 지금 스코어가 됐을 때의 승률 (그 선수 · 콤비, 이번 시즌(통산), 앞 = 시즌 순위 · 뒤 = 통산 순위)
    const stRate = p => { if (set.tb) return ''; if (ind && !over) { return IndSheet.state(S.names[p], ind, S.toWin || 3, won[p], won[1 - p], seqOf(p), fresh, 'pf' + p, !!S.open['pf' + p]); }
      if (!isTeam || over || !psOf(p).length || !window.TeamApp) return ''; return `<div class="frg${S.open['pf' + p] ? ' open' : ''}">` + TeamApp.sheetSetNoInfo(psOf(p), S.league, si + 1, fresh, seqOf(p).length > 1 ? 'pf' + p : '', !!S.open['pf' + p]) + TeamApp.sheetStateInfo(psOf(p), S.league, won[p], won[1 - p], seqOf(p), fresh) + '</div>'; };
        // 묶음 버튼으로 펼친 것: 팀 칩 o-gtw, 라이브 정보 o-gfb · o-gwr
    //  경기 시작 전(pre): 남자 · 여자 · 흰공 · 노란공 · 뱅킹 승률을 펼쳐 두고 항목 이름만 노란색
    const pre = isTeam && !over && !started;
    const tinfo = p => brief ? `<div class="tinfo${pre || (S.codes && S.open['gtw|' + S.codes[p]]) ? ' o-gtw' : ''}${pre ? ' pre' : ''}">${brief.teams[p]}</div>` : '', tinfoX = p => { const x = brief ? extra(p) : ''; return x ? `<div class="tinfo ext${S.open['gfb' + p] ? ' o-gfb' : ''}${S.open['gwr' + p] ? ' o-gwr' : ''}">${x}</div>` : ''; };
    // 팀 칸은 6줄(이름 · 팀 흐름 · 팀 기록 · 선수 · 선수 흐름 · 라이브 정보). 두 팀 같은 줄끼리 높이를 맞춘다
    // 합 · 세 · 단 (개인투어): 선수 이름 줄 바깥 끝 (왼쪽 선수는 왼쪽 끝, 오른쪽 선수는 오른쪽 끝). 두 선수 칸 같은 값
    const skd = ind ? `<span class="skd">${[['sum', '합', '세트제 + 25점 단판 (세트 승률 · 스코어별 · 흐름은 세트제만)'], ['set', '세', '세트제 경기만'], ['single', '단', '25점 단판만']].map(([v, l, t]) => `<button type="button" data-skd="${v}" class="${(S.kind || 'sum') === v ? 'on' : ''}" title="${t}">${l}</button>`).join('')}</span>` : '';
    const plCol = (p, cls) => `<div class="pl${cls}${!over && nextSide === p && !sel ? ' on' : ''}"><div class="pb">${skd}${p ? `${brief ? brief.stars[1] : ''}${nm(1)}${brief ? brief.recent[1] : ''}` : `${brief ? brief.recent[0] : ''}${nm(0)}${brief ? brief.stars[0] : ''}`}</div><div class="pb">${rate(p)}</div><div class="pb">${tinfo(p)}</div><div class="pb">${who(p)}</div><div class="pb">${stRate(p)}</div><div class="pb">${tinfoX(p)}</div></div>`;
    // 이닝 위 라이브 정보: 지금 점수를 따라간다. 팀마다 윗줄 우세 · 박빙 · 열세 비율, 아랫줄 지금 상황의 승률 · 클러치 승률
    // 실시간 세트 승률 (이닝 득점 마르코프 모델, predict.js): 지금 남은 점수 · 다음 차례에서 이 세트를 이길 확률
    const liveSetP = (() => {
      if (over || set.tb || !window.Predict || !started || !fcDone || set.winner != null || (isTeam ? !psOf(0).length || !psOf(1).length : !S.names[0] || !S.names[1])) return null;
      const ab = [0, 0]; set.turns.forEach((t, i) => { ab[sideOf(set, i)] += ptsOf(t); });
      const kind = (ordNow && ordNow.kind) || (brief && brief.kind) || (isTeam && S.codes && window.TeamApp ? TeamApp.sheetSetKind(S.codes[0], S.codes[1], S.league, si + 1) : '');
      // 선공이 아직 안 정해졌으면(세트 시작 전) 두 경우의 평균
      const f = leftNext => isTeam ? (window.TeamApp && TeamApp.sheetWinProb(psOf(0), psOf(1), kind, tgt - ab[0], tgt - ab[1], leftNext)) : Predict.liveByName(S.names[0], S.names[1], tgt - ab[0], tgt - ab[1], leftNext);
      if (set.first == null) { const a = f(true), b = f(false); return a == null || b == null ? null : (a + b) / 2; }
      const p = f(nextSide === 0);
      return p == null ? null : p;
    })();
    // 실시간 게임 승률 (가운데 맨 위, 양 팀 이름 사이): 지금 세트는 실시간 세트 승률(세트 시작 전이면 그 세트 선수로 계산한 승률), 남은 세트는 오더 선수 · 없으면 이번 시즌 그 세트 번호 출전 비율로 'N세트 먼저' 확률
    const gwpH = (() => {
      if (over || set.tb || !window.Predict || !started) return '';
      const p = isTeam ? (S.codes && window.TeamApp ? TeamApp.sheetGameProb(S.codes[0], S.codes[1], S.orders || [], won[0], won[1], liveSetP) : null)
        : Predict.indGameByName(S.names[0], S.names[1], won[0], won[1], S.toWin || 3, k => targetOf(k), liveSetP);
      if (p == null) return '';
      const c = x => `${Math.round(x * 100)}%`;
      const tip = `<div class="rkh0">실시간 게임 승률 <small>이 경기를 이길 확률</small></div><div class="hbn">지금 세트는 실시간 세트 승률, 남은 세트는 ${isTeam ? '발표된 오더 선수(없으면 이번 시즌 그 세트 번호에 나온 선수 비율)' : '두 선수'}의 세트 승률로 '${S.toWin || (isTeam ? 4 : 3)}세트 먼저 따기' 확률을 계산합니다. 세트가 끝날 때마다 · 이닝마다 바뀝니다.</div>` + Predict.tipHtml('live');
      return `<div class="gwp" data-rtip="${esc(tip)}"><b class="${p >= 0.5 ? 'up' : ''}">${c(p)}</b><small>게임 승률</small><b class="${p < 0.5 ? 'up' : ''}">${c(1 - p)}</b></div>`;
    })();
    const wpH = () => {
      const p = liveSetP; if (p == null) return '';
      const c = x => `${Math.round(x * 100)}%`;
      return `<div class="wpr" data-rtip="${esc(Predict.tipHtml('live'))}"><b class="${p >= 0.5 ? 'up' : ''}">${c(p)}</b><span class="wpt"><i style="width:${(p * 100).toFixed(1)}%"></i></span><small>실시간 세트 승률</small><span class="wpt r"><i style="width:${((1 - p) * 100).toFixed(1)}%"></i></span><b class="${p < 0.5 ? 'up' : ''}">${c(1 - p)}</b></div>`;
    };
    const timingH = () => wpH() + timingH0();
    const timingH0 = () => {
      if (!timingOn || (isTeam && (!window.TeamApp || !psOf(0).length || !psOf(1).length))) return '';
      const kind = (ordNow && ordNow.kind) || (brief && brief.kind) || (S.codes ? TeamApp.sheetSetKind(S.codes[0], S.codes[1], S.league, si + 1) : ''), men = ind ? ind !== 'LPBA' : /남자/.test(kind), lead = men ? 5 : 3, cln = men ? 5 : 4;
      // 클러치 = 이닝과 상관없이(공격이 끝날 때마다) 둘 다 목표 점수에 못 미친 채 남은 점수가 cln 점 이내 (한 번 들어가면 세트 끝까지)
      //  우세 · 박빙 · 열세는 이닝과 상관없이 지금 점수(ab)로: lead 점 이상 앞서면 우세, 뒤지면 열세, 그 안이면 박빙
      const ab = [0, 0]; let cl = false;
      set.turns.forEach((t, i) => { ab[sideOf(set, i)] += ptsOf(t); if (t.closed && tgt > cln && ab.every(v => v < tgt && tgt - v <= cln)) cl = true; });
      const d = ab[0] - ab[1], stOf = p => Math.abs(d) < lead ? 'tie' : (p ? -d : d) > 0 ? 'up' : 'dn';
      const T = [0, 1].map(p => ind ? IndSheet.timing(S.names[p], ind, stOf(p), cl, fresh, { T: S.toWin || 3, seq: seqOf(p), first: set.first === p }) : TeamApp.sheetTiming(psOf(p), S.league, stOf(p), cl, fresh));
      // 팀마다 윗줄 = 우세 · 박빙 · 열세 비율, 아랫줄 = 지금 상황의 승률. 왼쪽 팀은 오른쪽으로, 오른쪽 팀은 왼쪽으로 붙인다
      // 아랫줄(지금 상황 승률)은 노란 테두리로 강조. 끝내기 장타 줄은 클러치 스코어가 된 뒤에만
      return `<div class="tmg"><div class="tmgb"><div class="tcol l">${T[0].ratio}<div class="tsr sr">${T[0].state}</div>${T[0].sx ? `<div class="tsr sx">${T[0].sx}</div>` : ''}</div><div class="tcol r">${T[1].ratio}<div class="tsr sr">${T[1].state}</div>${T[1].sx ? `<div class="tsr sx">${T[1].sx}</div>` : ''}</div></div>` + (!cl || ind ? '</div>' : `<div class="f5row"><div class="tcol l">${T[0].f5}</div><b class="f5c" title="마지막 이닝 5점 이상 연속 득점으로 세트를 끝낸 것. 친 순간 점수 차로 우세(3점 이상 앞섬) · 박빙(±2점) · 열세(3점 이상 뒤짐) 비율">끝내기 장타</b><div class="tcol r">${T[1].f5}</div></div></div>`);
    };
    // 가운데 표: 왼쪽 값 | 항목 | 오른쪽 값 (끝난 이닝 기준, 더 좋은 쪽 강조)
    //  pre: 가운데 윗부분 데칼코마니 (왼쪽 (괄호)값 · 오른쪽 값(괄호))
    const midRows = (rows, pre) => rows.map(([l, a, b, f = String, sub]) => { const hi = (x, y) => x != null && y != null && x > y ? ' class="hi"' : ''; const v = (x, p) => x == null ? '–' : !sub ? f(x) : pre ? (p ? `${f(x)}<small>(${sub[p]})</small>` : `<small>(${sub[p]})</small>${f(x)}`) : `${f(x)} <small>(${sub[p]})</small>`; return `<tr><td${hi(a, b)}>${v(a, 0)}</td><th>${l}</th><td${hi(b, a)}>${v(b, 1)}</td></tr>`; }).join('');
    const midT = rows => `<table class="mt"><tbody>${midRows(rows)}</tbody></table>`;
    // 가운데 표 항목 (G = 게임, S = 세트): AV 에버, 5+ 장타율(5점 이상 이닝/이닝), HR 하이런, BPP 뱅크샷 득점 비율(뱅크샷 득점/득점), BSP 뱅크샷 성공률(성공/시도)
    const subL = X => X.map(o => `${o.long}/${o.inn}`), subP = X => X.map(o => `${o.bPts}/${o.pts}`), subB = X => X.map(o => `${o.bSucc}/${o.bAtt}`);
    const GS = [0, 1].map(p => stat(S.sets.flatMap(st => turnsOf(st, p)))), SS = [0, 1].map(p => stat(turnsOf(set, p)));
    const gameR = midRows([['G.AV', GS[0].avg, GS[1].avg, f3], ['G.5+', GS[0].longR, GS[1].longR, pc, subL(GS)], ['G.BPP', GS[0].bPtsR, GS[1].bPtsR, pc, subP(GS)], ['G.BSP', GS[0].bRate, GS[1].bRate, pc, subB(GS)]], true);
    // 세트 세부 결과 (각 세트 아래): S.AV · S.HR · S.5+ · S.BPP · S.BSP
    const setT = X => midT([['S.AV', X[0].avg, X[1].avg, f3], ['S.HR', X[0].inn ? X[0].hr : null, X[1].inn ? X[1].hr : null], ['S.5+', X[0].longR, X[1].longR, pc, subL(X)], ['S.BPP', X[0].bPtsR, X[1].bPtsR, pc, subP(X)], ['S.BSP', X[0].bRate, X[1].bRate, pc, subB(X)]]);
    // 가운데 윗부분 한 표: 상대 전적(경기 승 → 승점 → 세트, 왼쪽 (통산)이번 시즌 · 오른쪽 이번 시즌(통산)) → 게임 기록. 항목 칸 = 가장 긴 항목 이름 + 좌우 한 칸, 값은 항목 쪽으로 붙인다
    //  포스트시즌 맞대결이 있으면 전적 줄에 커서를 올렸을 때 말풍선 (data-h2hp, 항목 이름 점선)
    const psA = brief && brief.h2hPost && S.codes ? ` data-h2hp="${esc(S.codes[0])}|${esc(S.codes[1])}"` : '';
    const h2hR = brief && brief.h2hRows ? brief.h2hRows.map(([l, [[s0, a0], [s1, a1]]]) => `<tr${psA}><td${s0 > s1 ? ' class="hi"' : ''}><small>(${a0})</small>${s0}</td><th${psA ? ' class="ps"' : ''}>${l}</th><td${s1 > s0 ? ' class="hi"' : ''}>${s1}<small>(${a1})</small></td></tr>`).join('') + '<tr class="gap"><td colspan="3"></td></tr>' : '';
    const topT = `${brief && !brief.h2hRows ? `<small class="h2h"${psA}>${isTeam ? '정규시즌 ' : ''}첫 맞대결</small>` : ''}<table class="mt mtop"><tbody>${h2hR}${gameR}</tbody></table>`;
    // 스코어 아래 라인업: 세트마다 선수 점수 세트 번호 점수 선수. 양쪽 이름은 시작 위치를 맞춘다(왼쪽 정렬, 길면 · 에서 줄바꿈). 이긴 쪽 이름 초록 굵게 · 진 쪽 흐리게
    const luT = !isTeam || !(S.orders || []).length ? '' : `<table class="mlu"><tbody>${(S.orders || []).slice().sort((a, b) => a.no - b.no).map(o => { const i = o.no - 1, st = S.sets[i], on = st && st.turns.length, s2 = on ? setScore(st) : null;
      //  복식은 이름에 커서를 올리면 그 세트 두 선수의 득점 (한 말풍선에)
      const tipP = (ns, p) => { if (ns.length !== 2 || !on) return ''; const pp = pairPts(st, p); return ` data-stip="${esc(`<div class="rkh0">${o.no}세트 ${esc(o.kind || '')}</div><table class="rdtip">${ns.map((n, j) => `<tr><td>${esc(n)}</td><td><b>${pp[j]}점</b></td></tr>`).join('')}</table>`)}"`; };
      const nm2 = p => { const ns = (o.p && o.p[p]) || [], r = st && st.winner != null ? (st.winner === p ? 'w' : 'l') : ''; return `<td class="${p ? 'r' : 'l'}"><span class="${r}"${tipP(ns, p)}>${ns.map(esc).join('·<wbr>') || '–'}</span></td>`; }, pt = p => `<td class="p">${on ? s2[p] : ''}</td>`;
      return `<tr class="${i === si && !over ? 'cur' : ''}">${nm2(0)}${pt(0)}<td class="n">${indH2HNo(i, o.no)}</td>${pt(1)}${nm2(1)}</tr>`; }).join('')}</tbody></table>`;
    let h = `<div class="shead"><div class="srow"><span class="stitle">📝 경기 기록지</span>
      <input class="nm r" data-nm="0" value="${esc(S.names[0])}" placeholder="${isTeam ? '왼쪽 팀' : '왼쪽 선수'}"><span style="color:var(--sub)">vs</span><input class="nm" data-nm="1" value="${esc(S.names[1])}" placeholder="${isTeam ? '오른쪽 팀' : '오른쪽 선수'}">
      <button class="sbtn" data-fill>${isTeam ? '오더 불러오기' : '이름 불러오기'}</button>
      <select data-cfg="type">${['PBA', 'LPBA', '팀리그'].map(v => `<option ${S.type === v ? 'selected' : ''}>${v}</option>`).join('')}</select>${cfgs}
      <select data-cfg="input"><option value="direct" ${direct ? 'selected' : ''}>직접 입력</option><option value="btn" ${direct ? '' : 'selected'}>버튼 입력</option></select>
      <button class="sbtn" data-brief>${S.brief === false ? '브리핑 펼치기' : '브리핑 접기'}</button><button class="sbtn" data-new>새 경기</button>${SHEETWIN ? (HAS_NATIVE ? '<button class="sbtn" data-win="left">◧ 왼쪽 절반</button><button class="sbtn" data-win="right">◨ 오른쪽 절반</button><button class="sbtn" data-win="full">⛶ 전용 화면</button><button class="sbtn" data-win="tile">앱과 나란히</button>' : '') : `<button class="sbtn" data-popout>↗ 새 창으로</button>${HAS_NATIVE ? '<button class="sbtn" data-tile>◧ 앱과 나란히</button>' : ''}`}<button class="sbtn min" data-min>${SHEETWIN ? '창 닫기' : '최소화 ▁'}</button></div>
      ${sel ? `<div class="snote ask">${sel.set + 1}세트 ${Math.floor(sel.turn / 2) + 1}이닝 ${esc(S.names[sideOf(S.sets[sel.set], sel.turn)] || '')} 고치는 중 · 글자 입력 / Backspace 지우기 · Tab으로 끝</div>` : ''}${S.pend ? `<div class="snote pend">지금 기록지는 <b>${esc(S.names.join(' vs '))}</b> 경기(진행 중)입니다. <b>${esc(S.pend.title)}</b> ${S.pend.ind ? '경기를 불렀습니다.' : '오더가 있습니다.'} <button class="sbtn" data-apply>이 경기로 새 기록 시작 (지금 기록 지움)</button></div>` : notice ? `<div class="snote">${esc(notice)}</div>` : ''}
      <div class="board">${plCol(0, ' a')}${gwpH}<div class="mid">${topT}<div class="mscore"><span class="msl"><b>${sc[0]}</b><span class="msets">(${won[0]})</span></span><b class="colon">:</b><span class="msr"><span class="msets">(${won[1]})</span><b>${sc[1]}</b></span></div>${over ? '<small>경기 끝</small>' : ''}${luT}</div>${plCol(1, '')}</div>
      <div class="pad${direct ? ' dir' : ''}">${direct ? `<span class="hint">키보드로 바로 입력 · 숫자 1·2·3 = 뱅크샷 · Shift+T·O·W·H = 파울</span>` : `${TECH.map(k => `<button data-k="${esc(k)}">${esc(k)}</button>`).join('')}<span class="gap"></span>${BANK.map(k => `<button class="bk" data-k="${k}">${k}</button>`).join('')}<span class="gap"></span>${FOUL.map(k => `<button class="fl" data-k="${k}">${k}</button>`).join('')}`}
        <span class="gap"></span><button class="act" data-enter>${sel ? '⇥ 고치기 끝 <small class="kh">(Tab)</small>' : '⇥ 이닝 끝 · 실패 <small class="kh">(Tab)</small>'}</button><button class="act fin${canFinish() ? ' on' : ''}" data-endok ${canFinish() ? '' : 'disabled'}>↵ 세트 끝 · 성공 <small class="kh">(Enter)</small></button><button class="act" data-back>⌫ 지우기</button>${(isTeam || ind) && !started ? '<button class="act go" data-start>▶ 경기 시작</button>' : (isTeam || ind || set.tb) && !over && !fcDone ? `<button class="act go" data-fc="0">◀ ${nm(0)} ${set.tb ? '승치 ' : ''}선공</button><button class="act go" data-fc="1">${nm(1)} ${set.tb ? '승치 ' : ''}선공 ▶</button>` : !set.turns.length && !over ? `<button class="act" data-swap>선공 바꾸기</button>${!isTeam && !set.tb && si > 0 && won[0] === won[1] && won[0] === (S.toWin || 3) - 1 ? '<button class="act go" data-tb>⚔ 승부치기</button>' : ''}` : ''}</div></div>
      <div class="sbody">`;
    // 이번 경기 라인업 (팀리그, 열고 닫기). 이름에 올리면 선수 말풍선
    if (isTeam) {
      const os = (S.orders || []).slice().sort((a, b) => a.no - b.no);
      const lrows = os.map(o => { const i = o.no - 1, st = S.sets[i];
        const lst = p => { const x = st ? stat(turnsOf(st, p)) : null; return x && x.inn ? `<small class="lst">에버 ${f3(x.avg)} · 하이런 ${x.hr}</small>` : ''; };
        const vs = p => { const x = o.p && o.p[p] && o.p[1 - p] && window.TeamApp ? TeamApp.sheetLineupVs(o.p[p], o.p[1 - p], S.league) : ''; return x ? `<small class="lvs">${x}</small>` : ''; };
        //  고친 쪽: 이름 옆 '수정' (말풍선 = 홈피 오더)
        const edT = p => o.home && !sameP(o.home[p], o.p && o.p[p]) ? `<small class="oed" title="홈피 오더: ${esc((o.home[p] || []).join('·') || '없음')}">수정</small>` : '';
        const side = p => editOrd ? `<td class="lp${p ? ' r' : ''}">${ordSel(o, p)}</td>` : `<td class="lp${p ? ' r' : ''}${st && st.winner === p ? ' hi' : ''}">${vs(p)}${p ? '' : lst(p)}${p ? '' : edT(p)}${playersH(i, p) || '–'}${p ? edT(p) : ''}${p ? lst(p) : ''}</td>`;
        return `<tr class="${i === si && !over ? 'cur' : ''}">${side(0)}<td class="ln">${o.no}세트${editOrd ? `<small>${esc(ordKind(o).replace('혼합복식', '혼복').replace(/^(남|여)자(단|복)식$/, '$1$2'))}</small>` : ''}</td>${side(1)}</tr>`; }).join('');
      //  '오더 수정' 버튼은 제목 바로 오른쪽 (누르면 라인업이 펼쳐지며 고치기, 다시 누르면 끝)
      const obtn = os.length ? `<button class="sbtn obtn${editOrd ? ' on' : ''}" data-oedit>${editOrd ? '✓ 수정 끝' : '✎ 오더 수정'}</button>` : '';
      const octl = os.some(o => o.home) || editOrd ? `<div class="octl">${os.some(o => o.home) ? '<button class="sbtn" data-oreset>↺ 홈피 오더로 되돌리기</button>' : ''}${editOrd ? '<small>고른 선수로 바로 브리핑 · 승률이 바뀝니다</small>' : ''}</div>` : '';
      h += `<details class="lineup" data-open="lineup" ${S.open.lineup ? 'open' : ''}><summary class="lsum">이번 경기 라인업${obtn}${os.length ? (os.some(o => o.home) ? ' <small>수정함</small>' : os.some(o => o.manual) ? ' <small>직접 넣음</small>' : '') : ' <small>오더 없음</small>'}</summary>${os.length ? `${octl}<table class="lineup"><thead><tr><th class="lp">${nm(0)}</th><th>세트</th><th class="lp r">${nm(1)}</th></tr></thead><tbody>${lrows}</tbody></table>` : '<div class="octl" style="color:var(--sub)">오더 불러오기를 누르면 세트별 선수가 나옵니다. 홈피 오더가 없거나 인터넷이 안 되면 <button class="sbtn" data-omake>✎ 직접 오더 넣기</button></div>'}</details>`;
    }
    S.sets.forEach((st, i) => {
      const s2 = setScore(st), A = stat(turnsOf(st, 0)), B = stat(turnsOf(st, 1));
      A.pts = s2[0]; B.pts = s2[1];   // 득점은 진행 중 이닝까지 (에버 등 나머지는 끝난 이닝만)
      const fbT = st.turns[0]; A.fb = st.first === 0 && fbT ? ptsOf(fbT) : null; B.fb = st.first === 1 && fbT ? ptsOf(fbT) : null;
      const res = st.winner != null ? `${nm(st.winner)} 승` : i === si && !over ? '진행 중' : '';
      // 퍼펙트큐: 이긴 쪽이 한 이닝에 세트 점수를 모두 냈으면 P
      const perf = st.winner != null && st.turns.some((t, k) => sideOf(st, k) === st.winner && ptsOf(t) >= targetOf(i));
      h += `<details data-open="s${i}" ${S.open['s' + i] ? 'open' : ''}><summary class="ssum"><small class="sl">${A.inn ? `에버 ${f3(A.avg)} · 하이런 ${A.hr}` : ''}</small><span class="sp${st.winner === 0 ? ' w' : ''}">${s2[0]}</span><span class="sn">${perf ? '<b class="perf ph">P</b>' : ''}${st.tb ?'승부치기' : `${i + 1}세트`}${perf ? '<b class="perf" title="퍼펙트큐">P</b>' : ''}</span><span class="sp${st.winner === 1 ? ' w' : ''}">${s2[1]}</span><small class="sr">${B.inn ? `에버 ${f3(B.avg)} · 하이런 ${B.hr}` : ''}</small></summary>
        ${i === si ? timingH() : ''}${innTable(st, i)}
        <details data-open="r${i}" ${S.open['r' + i] ? 'open' : ''}><summary class="lsum">${st.tb ? '승부치기' : `${i + 1}세트`} 세부 결과</summary><div class="sdet">${setT([A, B])}<div class="sdh">기술 성공률</div>${typeTable(A, B)}</div></details></details>`;
    });
    // 경기 전체
    const all = [0, 1].map(p => { const o = stat(S.sets.flatMap(st => turnsOf(st, p))); o.pts = S.sets.reduce((a, st) => a + setScore(st)[p], 0); return o; });
    h += `<details data-open="g" ${S.open.g ? 'open' : ''}><summary class="lsum">경기 전체 기록 <small>세트 ${won[0]} : ${won[1]} · 득점 ${all[0].pts} : ${all[1].pts}</small></summary>
      <div style="padding:0 10px 10px"><div class="stgrid"><div>${statTable(all[0], all[1])}</div><div>${typeTable(all[0], all[1])}</div></div></div></details></div>`;
    box.innerHTML = h;
    alignExt();
    fab.innerHTML = `<i>📝</i>${sc[0]}:${sc[1]}`;
  }

  // ── 열기 · 최소화 ──
  // 별도 창이 떠 있는지: 창이 2초마다 시각을 남기고 닫힐 때 지운다
  const WKEY = 'pba_sheet_win', POSKEY = 'pba_sheet_pos';
  const winAlive = () => { try { return Date.now() - (+localStorage.getItem(WKEY) || 0) < 5000; } catch (e) { return false; } };
  let popup = null;
  const nativeWin = c => { try { webkit.messageHandlers.pba.postMessage(c); return true; } catch (e) { return false; } };   // 맥 앱에서만 창을 배치할 수 있다
  const open = () => { if (!SHEETWIN && winAlive()) { if (!nativeWin('focus') && popup) popup.focus(); return; } box.hidden = false; fab.hidden = true; if (!SHEETWIN) S.view = 'open'; save(); place(); render(); };
  function tile() { if (!winAlive()) popOut(); nativeWin('tile'); }
  function popOut() {
    popup = window.open('?caster&sheetwin' + location.hash, 'pbasheet', 'width=1180,height=820');
    if (!popup) { notice = '새 창을 열지 못했습니다. 바탕화면의 프바 캐스터 앱을 껐다가 다시 켜 주세요.'; render(); return; }
    minimize();
  }
  // 끌어서 옮기기 · 크기 조절: 위치는 이 맥에 기억 (머리글 빈 곳을 끈다)
  const readPos = () => { try { return JSON.parse(localStorage.getItem(POSKEY)) || null; } catch (e) { return null; } };
  const savePos = o => { try { localStorage.setItem(POSKEY, JSON.stringify(o)); } catch (e) {} };
  function place() {
    if (SHEETWIN) return; const o = readPos();
    box.style.width = o && o.w ? o.w + 'px' : ''; box.style.height = o && o.h ? o.h + 'px' : '';
    if (!o || o.x == null) { box.style.left = box.style.top = box.style.transform = box.style.maxHeight = ''; return; }
    const w = box.offsetWidth, x = Math.max(80 - w, Math.min(innerWidth - 80, o.x)), y = Math.max(0, Math.min(innerHeight - 40, o.y));
    box.style.transform = 'none'; box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.maxHeight = (innerHeight - y - 4) + 'px';
  }
  // 빈 공간을 누르면 최소화: 글자 · 표 · 버튼이 없는 곳만 (끌어 옮긴 뒤의 클릭은 빼고, 별도 창은 닫히지 않게 빼고)
  let dragged = false;
  addEventListener('mousedown', () => { dragged = false; }, true);
  const isBlank = t => t.nodeType === 1 && !t.closest('button, a, input, select, textarea, label, table, img, svg, canvas, summary, .ti, .plw, .rkbub, [data-sheet], [data-lon], [data-loff]') && ![...t.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  box.addEventListener('mousedown', e => {
    if (SHEETWIN || e.button !== 0) return;
    const r0 = box.getBoundingClientRect();
    if (!e.target.closest('.shead') || e.target.closest('input, select, button, .plh, [data-plsw]')) {
      if (e.clientX > r0.right - 20 && e.clientY > r0.bottom - 20) { dragged = true; const up = () => { removeEventListener('mouseup', up); savePos({ ...(readPos() || {}), w: box.offsetWidth, h: box.offsetHeight }); }; addEventListener('mouseup', up); }   // 오른쪽 아래 모서리 = 크기 조절
      return;
    }
    e.preventDefault();
    const dx = e.clientX - r0.left, dy = e.clientY - r0.top;
    const mv = m => { dragged = true; savePos({ ...(readPos() || {}), x: m.clientX - dx, y: m.clientY - dy }); place(); };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  addEventListener('resize', () => { if (!box.hidden) place(); });
  // 창끼리 같은 기록을 본다 (본 창 ↔ 별도 창)
  addEventListener('storage', e => { if (e.key !== SKEY || !e.newValue) return; try { S = JSON.parse(e.newValue); } catch (x) { return; } sel = null; render(); });
  const minimize = () => { if (SHEETWIN) { window.close(); return; } if (box.hidden) return; box.hidden = true; fab.hidden = false; S.view = 'min'; save(); render(); };
  window.Sheet = { on: true, btn: () => '<button class="sheetbtn" data-sheet>📝 기록지</button>', open, tile };
  // 머리줄 기록지 버튼은 바로 넣는다 (renderLive 는 진행 중 경기 확인 뒤에야 불려서, 앱을 켤 때 창이 가려져 있으면 버튼이 안 생겼다)
  { const slot = document.getElementById('sheetSlot'); if (slot && !SHEETWIN) slot.innerHTML = window.Sheet.btn(); }
  // 이름 불러오기: 두 칸에서 보고 있는 선수 (실시간 경기 중이면 그 선수들)
  function fillNames() {
    const P = typeof panes !== 'undefined' ? [panes.a.data, panes.b.data] : [];
    P.forEach((d, i) => { if (d) S.names[i] = d.player.name; });
    const t = P[0] && P[0].player.type; if (t && t !== S.type) { S.type = t; S.target = t === 'LPBA' ? 11 : 15; S.lastTarget = t === 'LPBA' ? 9 : 11; }
    save(); render();
  }
  // 개인투어 화면에서 기록지를 누르면 두 칸의 선수로 개인투어 기록지. 팀리그 기록은 따로 보관했다가 팀리그 화면에서 누르면 되살린다
  //  팀리그 단식 세트라서 개인투어 화면에 띄운 두 선수(showIndiv → S.indivIds)면 팀리그 기록지 그대로
  const STASH = { team: SKEY + '_team', ind: SKEY + '_ind' };
  const stashOf = k => { try { const x = JSON.parse(localStorage.getItem(STASH[k])); return x && x.sets ? x : null; } catch (e) { return null; } };
  function swapTo(k) {
    if ((S.type === '팀리그') === (k === 'team')) return;
    const back = stashOf(k), keep = { input: S.input, open: S.open };
    try { localStorage.setItem(STASH[k === 'team' ? 'ind' : 'team'], JSON.stringify(S)); localStorage.removeItem(STASH[k]); } catch (e) {}
    S = back || { ...fresh(), ...(k === 'team' ? { type: '팀리그', toWin: 4 } : {}), input: keep.input, open: keep.open }; sel = null;
  }
  function indivSheet() {
    const P = typeof panes !== 'undefined' ? [panes.a.data, panes.b.data] : [];
    if (!P[0] || !P[1]) return;
    const ids = P.map(d => d.player.id), names = P.map(d => d.player.name);
    if (S.type === '팀리그' && !matchOver() && S.indivIds && S.indivIds.join() === ids.join()) return;
    swapTo('ind');
    if (names.join() === S.names.join()) { if (S.pend) { delete S.pend; save(); } return; }
    const has = S.sets.some(s => s.turns.length);
    // 기록 중인 경기가 오늘(또는 날짜 모름) 진행 중이면 기록지 창 위에 묻는다. 끝났거나 지난 날 기록이면 묻지 않고 새 경기로
    if (has && !matchOver() && (!S.day || S.day === todayStr())) { S.pend = { ind: true, names, type: P[0].player.type, title: names.join(' vs ') }; save(); render(); return; }
    if (has) newInd(names, P[0].player.type); else fillNames();
  }
  // 개인 기록지를 새 경기로: 세트 점수 · 입력 방식은 그대로, 종목이 바뀌면 그 종목 기본 점수
  function newInd(names, type) {
    const keep = { type: S.type, target: S.target, lastTarget: S.lastTarget, toWin: S.toWin, input: S.input }; S = { ...fresh(), ...keep, names: names.slice() }; sel = null;
    if (type && type !== S.type) { S.type = type; S.target = type === 'LPBA' ? 11 : 15; S.lastTarget = type === 'LPBA' ? 9 : 11; }
    save(); render();
  }
  // 팀리그: 고른 팀의 다음(또는 진행 중) 경기 오더를 홈피에서 받아 세트마다 선수 · 점수를 붙인다. 고른 왼쪽 팀이 왼쪽에 오게 맞춘다
  async function loadOrder() {
    const sel0 = window.TeamApp && TeamApp.selected ? TeamApp.selected().filter(Boolean) : [];
    if (!sel0.length) { notice = '팀을 먼저 고르면 그 팀 경기의 출전 오더를 불러옵니다.'; render(); return; }
    notice = '출전 오더를 불러오는 중…'; render();
    const o = await api('/api/team/order?teams=' + sel0.join(',')).catch(() => null);   // api = 휴대폰·아이패드용 사이트에서는 사이트 자료(오더는 없음)
    notice = '';
    if (!o && typeof STATIC !== 'undefined' && STATIC) { notice = '휴대폰·아이패드용 사이트에서는 출전 오더를 불러올 수 없습니다. 선수와 세트 점수를 직접 넣어 주세요.'; render(); return; }
    if (!o || !o.t1) { notice = '이 팀의 남은 경기 일정을 찾지 못했습니다.'; render(); return; }
    const flip = sel0[0] === o.t2, codes = flip ? [o.t2, o.t1] : [o.t1, o.t2];
    const names = codes.map(c => TeamApp.shortName ? TeamApp.shortName(c) : c);
    const orders = (o.sets || []).map(s => ({ no: s.no, gp: s.gp, kind: s.kind, p: flip ? [s.p[1], s.p[0]] : s.p }));
    const next = { key: `${o.date}|${codes.join('|')}`, names, orders, codes, league: o.league || TeamApp.curLeague(), title: `${o.round} ${names.join(' vs ')}` };
    if (!orders.length) notice = `${next.title} (${o.date} ${o.time || ''}): 아직 출전 오더가 올라오지 않았습니다.`;
    const has = S.sets.some(s => s.turns.length);
    // 지금 기록지 경기가 이미 끝났으면(지난 날짜 · 세트 승부가 났음 · 팀리그 결과에 그 경기가 올라옴) 묻지 않고 새 경기로 바꾼다. 진행 중이면 위에 눈에 띄게 묻는다
    const [gd, g0, g1] = String(S.gameKey || '').split('|'), d0 = new Date(), today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
    const X = TeamApp.boardData && TeamApp.boardData();
    const oldDone = !gd || gd < today || matchOver() || !!(X && X.D.games.some(g => String(g.date || '').startsWith(gd) && [g.t1, g.t2].sort().join() === [g0, g1].sort().join()));
    if (S.gameKey === next.key || !has || oldDone) applyOrder(next, S.gameKey !== next.key); else { S.pend = next; save(); render(); }
  }
  // 홈피 오더 없이 직접: 고른 두 팀으로 7세트 빈 오더를 만들고 바로 고치기
  function makeOrders() {
    const c = S.codes && S.codes.length === 2 ? S.codes : window.TeamApp && TeamApp.selected ? TeamApp.selected() : [];
    if (c.length < 2) { notice = '팀리그 화면에서 두 팀을 먼저 고르면 직접 오더를 넣을 수 있습니다.'; render(); return; }
    S.type = '팀리그'; S.toWin = 4; S.codes = c.slice(0, 2); S.league = S.league || TeamApp.curLeague();
    if (!S.names[0] && !S.names[1]) S.names = S.codes.map(x => TeamApp.shortName ? TeamApp.shortName(x) : x);
    S.gameKey = S.gameKey || `manual|${S.codes.join('|')}`;
    S.orders = TEAM_TARGETS.map((gp, i) => ({ no: i + 1, gp, p: [[], []], manual: true }));
    editOrd = true; S.open.lineup = true; notice = ''; save(); render();
  }
  window.sheetLoadOrder = loadOrder;   // 상단 일정에서 경기를 누르면 (board.js) 그 두 팀 오더를 불러온다
  function applyOrder(n, reset) {
    // 직접 넣은 오더로 기록하던 경기에 같은 두 팀 홈피 오더가 오면 새 경기가 아니라 이어서
    if (reset && String(S.gameKey || '').startsWith('manual|') && (S.codes || []).join() === n.codes.join()) reset = false;
    const old = reset ? [] : S.orders || [];
    if (reset) { const keep = { input: S.input, open: S.open }; S = { ...fresh(), input: keep.input }; }
    // 홈피 오더가 기본, 내가 고친(또는 직접 넣은) 세트는 그대로 두고 홈피 오더는 되돌리기용으로 남긴다
    const merged = n.orders.map(o => { const x = old.find(y => y.no === o.no); return x && (x.home || x.manual) && (x.p || []).some(a => a.length) && !sameP(x.p, o.p) ? { ...o, p: x.p, home: o.p } : o; })
      .concat(old.filter(x => (x.home || x.manual) && !n.orders.some(o => o.no === x.no)));
    S.type = '팀리그'; S.toWin = 4; S.names = n.names; if (n.orders.length || reset) S.orders = merged; S.gameKey = n.key;   // 홈피에서 못 받았을 때 이미 받은 오더를 지우지 않는다
     S.codes = n.codes; S.league = n.league; delete S.pend; sel = null; save(); render();
  }
  document.addEventListener('click', e => {
    // 맥 앱에서는 '기록지' 버튼이 기본으로 새 창을 연다 (⌥ 누르고 누르면 이 창 안에서)
    if (e.target.closest('[data-sheet]')) { if (document.body.classList.contains('teammode')) swapTo('team'); else indivSheet(); save();
      if (HAS_NATIVE && !SHEETWIN && !e.altKey && box.hidden && !winAlive()) popOut(); else open(); if (document.body.classList.contains('teammode')) loadOrder(); return; }
    if (e.target.closest('#sheetFab')) { open(); return; }
    if (box.hidden) return;
    if (dragged) { dragged = false; return; }
    if (!box.contains(e.target)) { if (!SHEETWIN && isBlank(e.target)) minimize(); return; }
    if (e.target.closest('[data-popout]')) { popOut(); return; }
    if (e.target.closest('[data-tile]')) { tile(); return; }
    const wb = e.target.closest('[data-win]'); if (wb) { nativeWin(wb.dataset.win); return; }
    const flt = e.target.closest('[data-flt]'); if (flt) { const k = flt.dataset.flt; S.open[k] = !S.open[k]; save(); render(); return; }   // 브리핑 묶음 · 승률 버튼 접고 펴기 (처음엔 접힘)   // 브리핑 승률 버튼: 앞 세트 승 · 패 줄 접고 펴기
    if (e.target.closest('[data-brief]')) { S.brief = S.brief === false; save(); render(); return; }
    const kd = e.target.closest('[data-skd]'); if (kd) { S.kind = kd.dataset.skd; save(); render(); return; }
    const k = e.target.closest('[data-k]'); if (k) { add(k.dataset.k); return; }
    if (e.target.closest('[data-endok]')) { endSuccess(); return; }
    if (e.target.closest('[data-enter]')) { endInning(); return; }
    if (e.target.closest('[data-back]')) { back(); return; }
    if (e.target.closest('[data-start]')) { S.started = true; save(); render(); return; }
    if (e.target.closest('[data-tb]')) { const s = liveSet(); s.tb = true; s.first = null; s.fc = false; S.started = true; save(); render(); return; }   // 승부치기 돌입: 선공은 선수가 고른다
    const fcb = e.target.closest('[data-fc]'); if (fcb) { const s = liveSet(); s.first = +fcb.dataset.fc; s.fc = true; S.started = true; save(); render(); return; }
    if (e.target.closest('[data-swap]')) { const s = liveSet(); s.first = 1 - s.first; save(); render(); return; }
    if (e.target.closest('[data-min]')) { minimize(); return; }
    const sw = e.target.closest('[data-plsw]'); if (sw) { const [swS, p] = sw.dataset.plsw.split('|').map(Number), s = S.sets[swS]; s.pw = s.pw || [0, 0]; s.pw[p] = 1 - s.pw[p]; save(); render(); return; }
    if (e.target.closest('[data-apply]')) { const p = S.pend; if (p && p.ind) newInd(p.names, p.type); else if (p) applyOrder(p, true); return; }
    if (e.target.closest('[data-fill]')) { if (S.type === '팀리그') loadOrder(); else fillNames(); return; }
    if (e.target.closest('[data-oedit]')) { e.preventDefault(); editOrd = !editOrd; S.open.lineup = true; save(); render(); return; }   // 제목(summary) 안 버튼: 라인업이 접히지 않게
    if (e.target.closest('[data-oreset]')) { S.orders.forEach(o => { if (o.home) { o.p = o.home; delete o.home; } }); save(); render(); return; }
    if (e.target.closest('[data-omake]')) { makeOrders(); return; }
    // 새 경기: 실수로 지우지 않게 3초 안에 한 번 더 눌러야 지운다
    const nb = e.target.closest('[data-new]');
    if (nb) { if (!nb.classList.contains('arm')) { nb.classList.add('arm'); nb.textContent = '한 번 더 누르면 지움'; setTimeout(() => { if (nb.isConnected) { nb.classList.remove('arm'); nb.textContent = '새 경기'; } }, 3000); return; }
      const keep = { type: S.type, target: S.target, lastTarget: S.lastTarget, toWin: S.toWin, input: S.input }; S = { ...fresh(), ...keep }; sel = null; if (S.type === '팀리그') { save(); loadOrder(); } else fillNames(); return; }
    const c = e.target.closest('td.seq[data-st]');
    if (c) { const [s, t] = c.dataset.st.split('|'); if (t === '') return; const same = sel && sel.set === +s && sel.turn === +t; const liveT = +s === S.sets.length - 1 && +t === liveSet().turns.length - 1 && !liveSet().turns[+t].closed; sel = same || liveT ? null : { set: +s, turn: +t }; render(); return; }
    // 고치는 중에 표 밖을 누르면 고치기 끝
    if (sel && !e.target.closest('[data-back]')) { sel = null; render(); return; }
    if (!SHEETWIN && isBlank(e.target)) minimize();
  }, true);
  // 선수 이름 커서 말풍선 (팀리그 경기 결과만)
  // 같은 팀 두 선수 중 어느 이름에 올려도 둘을 함께 보여준다. 말풍선은 커서 위쪽에 따라다닌다
  let plFor = null;
  const tipAbove = e => {
    const w = rkBub.offsetWidth, h = rkBub.offsetHeight, y = e.clientY - h - 12;
    if (y >= 4) { rkBub.style.left = Math.max(4, Math.min(innerWidth - w - 4, e.clientX - w / 2)) + 'px'; rkBub.style.top = y + 'px'; return; }
    // 위쪽 공간이 모자라면 아래로 내리지 않고 맨 위에 붙여 커서 옆으로 비킨다 (이름 · 이닝 표를 가리지 않게)
    rkBub.style.top = '4px'; rkBub.style.left = (e.clientX + 16 + w <= innerWidth - 4 ? e.clientX + 16 : Math.max(4, e.clientX - 16 - w)) + 'px';
  };
  box.addEventListener('mouseover', e => {
    const c = e.target.closest('[data-pl], [data-bk]'); if (!c || c === plFor) return; plFor = c;
    if (c.dataset.bk) { const b = window.TeamApp ? TeamApp.sheetBankTip(c.dataset.bk, S.league) : ''; if (b) { showRkBub(c, b); tipAbove(e); } return; }
    const [si, p] = c.dataset.pl.split('|').map(Number), o = orderOf(si);
    // 이 세트 앞까지 세트 스코어 (이 팀 기준): 앞섬 · 같음 · 뒤짐, 7세트는 6세트 결과로 3:2 / 2:3에서 온 것
    const won = [0, 1].map(q => S.sets.slice(0, si).filter(x => x.winner === q).length), s6 = S.sets[5];
    const sit = si === 6 ? (s6 && s6.winner != null ? (s6.winner === p ? 'from23' : 'from32') : '') : won[p] > won[1 - p] ? 'lead' : won[p] < won[1 - p] ? 'trail' : 'tie';
    const h = o && window.TeamApp ? TeamApp.sheetPlayersTip(o.p[p], S.league, si + 1, o.p[1 - p], o.kind || (S.codes ? TeamApp.sheetSetKind(S.codes[0], S.codes[1], S.league, si + 1) : ''), sit) : '';
    if (h) { showRkBub(c, h); tipAbove(e); }
  });
  box.addEventListener('mousemove', e => { if (plFor && !rkBub.hidden) tipAbove(e); });
  box.addEventListener('mouseout', e => { const c = e.target.closest('[data-pl], [data-bk]'); if (c && !c.contains(e.relatedTarget)) { plFor = null; hideRkBub(); } });
  // 펼치기 · 접기 상태 기억
  box.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.open) { S.open[d.dataset.open] = d.open; save(); } }, true);
  box.addEventListener('change', e => {
    const od = e.target.closest('[data-ord]');
    if (od) { const [no, p, j] = od.dataset.ord.split('|').map(Number), o = (S.orders || []).find(x => x.no === no); if (!o) return;
      o.p = o.p || [[], []]; if (!o.home && !o.manual) o.home = JSON.parse(JSON.stringify(o.p));
      const a = (o.p[p] || []).slice(); a[j] = od.value; o.p[p] = a.filter(Boolean);
      if (o.home && sameP(o.home, o.p)) delete o.home;   // 홈피 오더와 같아지면 고친 표시를 뗀다
      save(); render(); return; }
    const n = e.target.closest('[data-nm]'); if (n) { S.names[+n.dataset.nm] = n.value.trim(); save(); render(); return; }
    const c = e.target.closest('[data-cfg]'); if (c) { const k = c.dataset.cfg; S[k] = k === 'type' || k === 'input' || k === 'kind' ? c.value : +c.value; if (k === 'type') { if (c.value === '팀리그') { S.toWin = 4; loadOrder(); } else { S.target = c.value === 'LPBA' ? 11 : 15; S.lastTarget = c.value === 'LPBA' ? 9 : 11; S.toWin = 3; } } save(); render(); }
  });
  // 키보드 (이름 입력 중에는 안 받음)
  document.addEventListener('keydown', e => {
    if (box.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const isTab = e.key === 'Tab' || e.code === 'Tab', isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter', isBack = e.key === 'Backspace' || e.key === 'Delete' || e.code === 'Backspace' || e.code === 'Delete';
    if (e.target.closest && e.target.closest('input, select, textarea')) { if (isEnter || isTab) { e.target.blur(); e.preventDefault(); } return; }
    if (e.key === 'Escape') { minimize(); e.preventDefault(); return; }
    if (isTab) { endInning(); e.preventDefault(); return; }
    if (isEnter) { endSuccess(); e.preventDefault(); return; }
    if (isBack) { back(); e.preventDefault(); return; }
    const x = keyOf(e);
    if (x) { add(x); e.preventDefault(); }
  }, true);
  render();
  if (SHEETWIN) {
    document.body.classList.add('sheetwin'); document.title = '경기 기록지'; open();
    const beat = () => { try { localStorage.setItem(WKEY, String(Date.now())); } catch (e) {} };
    beat(); setInterval(beat, 2000);
    addEventListener('pagehide', () => { try { localStorage.removeItem(WKEY); } catch (e) {} });
    if (window.Predict) Predict.loadInd().then(() => render());   // 개인 기록지 실시간 세트 · 게임 승률은 이 자료가 와야 나온다
    if (window.TeamApp) { const t = setInterval(() => { render(); if (TeamApp.boardData()) clearInterval(t); }, 1000); }   // 자료를 받으면 브리핑 · 말풍선을 채운다
  } else if (S.view === 'min') { fab.hidden = false; }
})();
