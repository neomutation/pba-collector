// 캐스터용 경기 기록지 (주소에 ?caster 가 있을 때만: 바탕화면 '프바 캐스터' 앱)
//  엑셀 기록지와 같은 방식: 이닝마다 공격을 하나씩 적고, 이닝의 마지막 공격 = 실패(공수 교대). 뱅크샷(1·2·3)은 성공하면 2점
//  기호: 기술 ㄷ ㅏ ㅕ ㅂ ㅐ ㅎ ㅅ ㄸ + ㅋ ㄹ ㅁ · 뱅크샷 1 2 3 · 파울 T O W H (넣으면 이닝 끝) · X = 시도에서 뺌
//  키보드: 한글 자판 그대로 (ㄷ=E, ㄸ=Shift+E, ㅏ=K, ㅕ=U, ㅂ=Q, ㅐ=O, ㅎ=G, ㅅ=T, ㅋ=Z, ㄹ=F, ㅁ=A), 1·2·3, +, Shift+T·O·W·H = 파울, X,
//          Enter = 이닝 끝(마지막 공격 실패), Backspace = 지우기, Esc = 최소화
(function () {
  const CASTER = new URLSearchParams(location.search).has('caster');
  window.Sheet = { on: CASTER, btn: () => '' };
  if (!CASTER) return;

  const TECH = ['ㄷ', 'ㅏ', 'ㅕ', 'ㅂ', 'ㅐ', 'ㅎ', 'ㅅ', 'ㄸ', '+', 'ㅋ', 'ㄹ', 'ㅁ'], BANK = ['1', '2', '3'], FOUL = ['T', 'O', 'W', 'H'];
  const isBank = x => BANK.includes(x), isFoul = x => FOUL.includes(x);
  const KEY = { KeyE: s => s ? 'ㄸ' : 'ㄷ', KeyK: () => 'ㅏ', KeyU: () => 'ㅕ', KeyQ: () => 'ㅂ', KeyO: s => s ? 'O' : 'ㅐ', KeyG: () => 'ㅎ', KeyT: s => s ? 'T' : 'ㅅ',
    KeyZ: () => 'ㅋ', KeyF: () => 'ㄹ', KeyA: () => 'ㅁ', KeyW: s => s ? 'W' : null, KeyH: s => s ? 'H' : null, KeyX: () => 'X',
    Digit1: () => '1', Digit2: () => '2', Digit3: () => '3', Numpad1: () => '1', Numpad2: () => '2', Numpad3: () => '3', NumpadAdd: () => '+', Equal: s => s ? '+' : null };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pc = v => v == null || isNaN(v) ? '–' : (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const f3 = v => v == null || isNaN(v) ? '–' : v.toFixed(3);
  const rt = (a, b) => b ? a / b : null;

  // ── 상태 (이 맥에 저장) ── turn = 한 선수의 한 이닝 { e: 공격 기호들, closed: false 진행 중 | 'miss' 마지막 공격 실패 | 'end' 세트를 끝낸 이닝(전부 성공) }
  //  세트의 이닝 순서는 선공(first)부터 번갈아: turns[i] 의 선수 = (first + i) % 2, 이닝 번호 = i/2 + 1
  const SKEY = 'pba_caster_sheet';
  const blankSet = first => ({ first, turns: [], winner: null });
  const fresh = () => ({ names: ['', ''], type: 'PBA', target: 15, lastTarget: 11, toWin: 3, sets: [blankSet(0)], open: { s0: true }, view: 'open' });
  let S; try { S = JSON.parse(localStorage.getItem(SKEY)) || null; } catch (e) { S = null; }
  if (!S || !S.sets) S = fresh();
  let sel = null;   // 고친다고 고른 칸 { set, turn }
  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} };

  // ── 계산 ──
  const succOf = t => t.closed === 'miss' ? t.e.slice(0, -1) : t.e;
  const ptsOf = t => succOf(t).reduce((a, x) => a + (isBank(x) ? 2 : x === 'X' || isFoul(x) ? 0 : 1), 0);
  const sideOf = (set, i) => (set.first + i) % 2;
  const setScore = set => [0, 1].map(p => set.turns.reduce((a, t, i) => a + (sideOf(set, i) === p ? ptsOf(t) : 0), 0));
  const setsWon = () => [0, 1].map(p => S.sets.filter(s => s.winner === p).length);
  const targetOf = si => { const w = setsWon(), before = S.sets.slice(0, si).filter(s => s.winner != null); const a = before.filter(s => s.winner === 0).length, b = before.filter(s => s.winner === 1).length; return a === S.toWin - 1 && b === S.toWin - 1 ? S.lastTarget : S.target; };
  const matchOver = () => setsWon().some(n => n >= S.toWin);
  // 한 선수의 이닝들 → 기록
  function stat(turns) {
    const o = { pts: 0, inn: turns.length, hr: 0, one: 0, mid: 0, long: 0, zero: 0, att: 0, succ: 0, bAtt: 0, bSucc: 0, foul: 0, type: {} };
    turns.forEach(t => {
      const p = ptsOf(t), sc = succOf(t);
      o.pts += p; o.hr = Math.max(o.hr, p);
      if (p === 0) o.zero++; else if (p === 1) o.one++; else if (p <= 4) o.mid++; else o.long++;
      t.e.forEach(x => { if (x === 'X') return; o.att++; const y = o.type[x] || (o.type[x] = { a: 0, s: 0 }); y.a++; if (isBank(x)) o.bAtt++; if (isFoul(x)) o.foul++; });
      sc.forEach(x => { if (x === 'X' || isFoul(x)) return; o.succ++; o.type[x].s++; if (isBank(x)) o.bSucc++; });
    });
    o.avg = rt(o.pts, o.inn); o.longR = rt(o.long, o.inn); o.midR = rt(o.mid, o.inn); o.zeroR = rt(o.zero, o.inn); o.oneR = rt(o.one, o.inn);
    o.bPtsR = rt(o.bSucc * 2, o.pts); o.bTry = rt(o.bAtt, o.att); o.bRate = rt(o.bSucc, o.bAtt); o.tech = rt(o.succ, o.att);
    return o;
  }
  const turnsOf = (set, p) => set.turns.filter((t, i) => sideOf(set, i) === p);

  // ── 입력 ──
  function liveSet() { return S.sets[S.sets.length - 1]; }
  function add(x) {
    if (sel) { const t = S.sets[sel.set].turns[sel.turn]; t.e.push(x); save(); render(); return; }
    if (matchOver()) return;
    const set = liveSet(); let t = set.turns[set.turns.length - 1];
    if (!t || t.closed) { t = { e: [], closed: false }; set.turns.push(t); }
    t.e.push(x);
    if (isFoul(x)) t.closed = 'miss';
    const si = S.sets.length - 1, sc = setScore(set), p = sideOf(set, set.turns.length - 1);
    if (!t.closed && sc[p] >= targetOf(si)) {   // 목표 점수 → 세트 끝, 다음 세트 (선공은 번갈아)
      t.closed = 'end'; set.winner = p;
      if (!matchOver()) { S.sets.push(blankSet(1 - set.first)); S.open = { ['s' + (S.sets.length - 1)]: true }; }
    }
    save(); render();
  }
  function endInning() {
    if (sel) { sel = null; render(); return; }
    if (matchOver()) return;
    const set = liveSet(); let t = set.turns[set.turns.length - 1];
    if (!t || t.closed) { t = { e: [], closed: false }; set.turns.push(t); }   // 공격 기록 없이 넘긴 이닝 = 0점
    t.closed = 'miss'; save(); render();
  }
  function back() {
    if (sel) { const t = S.sets[sel.set].turns[sel.turn]; t.e.pop(); save(); render(); return; }
    let set = liveSet();
    if (!set.turns.length && S.sets.length > 1) { S.sets.pop(); set = liveSet(); set.winner = null; const t = set.turns[set.turns.length - 1]; if (t) t.closed = false; S.open = { ['s' + (S.sets.length - 1)]: true }; save(); render(); return; }
    const t = set.turns[set.turns.length - 1]; if (!t) return;
    if (set.winner != null) set.winner = null;
    if (t.closed) t.closed = false;
    else if (t.e.length) t.e.pop();
    else set.turns.pop();
    save(); render();
  }

  // ── 화면 ──
  const css = document.createElement('style');
  css.textContent = `
#sheet { position: fixed; z-index: 60; left: 50%; top: 52px; transform: translateX(-50%); width: min(1180px, calc(100vw - 24px)); max-height: calc(100vh - 64px); overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 70px rgba(0,0,0,.5); font-variant-numeric: tabular-nums; }
#sheet[hidden], #sheetFab[hidden] { display: none; }
#sheet .shead { position: sticky; top: 0; z-index: 2; background: var(--panel); border-bottom: 1px solid var(--line); padding: 10px 14px 8px; }
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
#sheet .sbody { padding: 8px 14px 16px; }
#sheet details { border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; }
#sheet details > summary { cursor: pointer; padding: 7px 12px; font-weight: 800; display: flex; gap: 10px; align-items: baseline; }
#sheet details > summary small { color: var(--sub); font-weight: 600; }
#sheet details details { margin: 6px 10px 10px; }
#sheet table { border-collapse: collapse; width: 100%; }
#sheet td, #sheet th { padding: 3px 6px; border-bottom: 1px solid var(--line); text-align: center; white-space: nowrap; }
#sheet th { color: var(--sub); font-size: 11.5px; font-weight: 700; }
#sheet table.inn td.seq { width: 42%; }
#sheet table.inn td.seq.a { text-align: right; } #sheet table.inn td.seq.b { text-align: left; }
#sheet table.inn td.no { color: var(--sub); font-weight: 700; width: 3em; }
#sheet table.inn td.pt { font-weight: 800; width: 3em; } #sheet table.inn td.cum { color: var(--sub); width: 3em; font-size: 12px; }
#sheet table.inn td.seq { cursor: pointer; } #sheet table.inn td.seq:hover { background: rgba(var(--heat), .06); }
#sheet table.inn td.seq.sel { outline: 2px solid var(--accent); outline-offset: -2px; } #sheet table.inn td.seq.now { background: rgba(var(--heat), .10); }
#sheet .ch { display: inline-block; min-width: 1.6em; padding: 0 3px; margin: 1px; border-radius: 5px; background: var(--chip); font-weight: 800; font-size: 13px; }
#sheet .ch.bk { background: rgba(59,130,246,.30); } #sheet .ch.fl { background: rgba(245,158,11,.35); } #sheet .ch.x { opacity: .55; }
#sheet .ch.miss { background: transparent; color: var(--lose); text-decoration: line-through; border: 1px solid rgba(196,55,47,.5); }
#sheet table.st td.v { font-weight: 800; width: 32%; } #sheet table.st td.v small { color: var(--sub); font-weight: 600; margin-left: 4px; } #sheet table.st td.lab { color: var(--sub); font-size: 12px; }
#sheet table.st td.v.hi { color: var(--accent); }
#sheet .stgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 760px) { #sheet .stgrid { grid-template-columns: 1fr; } #sheet .board .pl { font-size: 17px; } }
#sheetFab { position: fixed; z-index: 61; right: 22px; bottom: 26px; width: 64px; height: 64px; border-radius: 50%; border: 0; cursor: pointer; background: var(--accent); color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.45); font-weight: 800; font-size: 12px; line-height: 1.1; animation: sheetbob 2.6s ease-in-out infinite; }
#sheetFab i { display: block; font-style: normal; font-size: 20px; }
@keyframes sheetbob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
#sheet .sbtn.arm { background: var(--lose); color: #fff; }
#live .sheetbtn { margin-left: auto; font: inherit; font-size: 12px; font-weight: 800; border: 1px solid var(--line); background: var(--chip); color: var(--ink); border-radius: 7px; padding: 2px 10px; cursor: pointer; }
`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'sheet'; box.hidden = true; document.body.appendChild(box);
  const fab = document.createElement('button'); fab.id = 'sheetFab'; fab.hidden = true; fab.title = ''; document.body.appendChild(fab);

  const chip = (x, miss) => `<span class="ch${isBank(x) ? ' bk' : ''}${isFoul(x) ? ' fl' : ''}${x === 'X' ? ' x' : ''}${miss ? ' miss' : ''}">${esc(x)}</span>`;
  const seqH = (t, rev) => { if (!t) return ''; const arr = t.e.map((x, i) => chip(x, t.closed === 'miss' && i === t.e.length - 1)); return (rev ? arr.reverse() : arr).join(''); };
  // 한 세트의 이닝 표 (대칭: 왼쪽 선수 공격은 가운데에서 바깥으로)
  function innTable(set, si) {
    const rows = Math.ceil(set.turns.length / 2), live = si === S.sets.length - 1 && !matchOver();
    const cum = [0, 0];
    let h = `<table class="inn"><thead><tr><th>득점</th><th>누적</th><th style="text-align:right">${esc(S.names[0] || '왼쪽')}</th><th>이닝</th><th style="text-align:left">${esc(S.names[1] || '오른쪽')}</th><th>누적</th><th>득점</th></tr></thead><tbody>`;
    for (let r = 0; r < Math.max(rows, 1); r++) {
      const cell = [null, null], idx = [null, null];
      [2 * r, 2 * r + 1].forEach(i => { if (i < set.turns.length) { const p = sideOf(set, i); cell[p] = set.turns[i]; idx[p] = i; } });
      const pts = cell.map(t => t ? ptsOf(t) : null); pts.forEach((v, p) => { if (v != null) cum[p] += v; });
      const cls = p => { const i = idx[p]; const s = sel && sel.set === si && sel.turn === i ? ' sel' : ''; const n = live && i != null && i === set.turns.length - 1 && !set.turns[i].closed ? ' now' : ''; return s + n; };
      h += `<tr><td class="pt">${pts[0] ?? ''}</td><td class="cum">${cell[0] ? cum[0] : ''}</td><td class="seq a${cls(0)}" data-st="${si}|${idx[0] ?? ''}">${seqH(cell[0], true)}</td><td class="no">${r + 1}</td>
        <td class="seq b${cls(1)}" data-st="${si}|${idx[1] ?? ''}">${seqH(cell[1], false)}</td><td class="cum">${cell[1] ? cum[1] : ''}</td><td class="pt">${pts[1] ?? ''}</td></tr>`;
    }
    return h + '</tbody></table>';
  }
  // 대칭 기록 표: 왼쪽 선수 | 항목 | 오른쪽 선수 (더 좋은 쪽 강조)
  function statTable(A, B, extra = {}) {
    const R = [['득점', o => o.pts, String], ['이닝', o => o.inn, String, 'none'], ['에버', o => o.avg, f3], ['하이런', o => o.hr, String],
      ['장타율 <small>5점+ 이닝</small>', o => o.longR, pc, 'high', o => `${o.long}`], ['중타율 <small>2~4점</small>', o => o.midR, pc, 'none', o => `${o.mid}`], ['단타 <small>1점</small>', o => o.oneR, pc, 'none', o => `${o.one}`],
      ['공타율 <small>0점 이닝</small>', o => o.zeroR, pc, 'low', o => `${o.zero}`],
      ['뱅크샷 득점 비율', o => o.bPtsR, pc, 'high', o => `${o.bSucc * 2}점`], ['뱅크샷 시도율', o => o.bTry, pc, 'none', o => `${o.bAtt}/${o.att}`], ['뱅크샷 성공률', o => o.bRate, pc, 'high', o => `${o.bSucc}/${o.bAtt}`],
      ['기술 성공률 <small>성공 ÷ 시도</small>', o => o.tech, pc, 'high', o => `${o.succ}/${o.att}`], ['파울', o => o.foul, String, 'low']];
    if (extra.fb) R.push(['초구', o => o.fb, v => v == null ? '–' : v + '점', 'high']);
    const td = (o, q, [, get, fmt, better = 'high', sub]) => { const v = get(o), w = get(q); const hi = better !== 'none' && v != null && w != null && v !== w && (better === 'low' ? v < w : v > w); return `<td class="v${hi ? ' hi' : ''}">${v == null ? '–' : fmt(v)}${sub && v != null ? `<small>${sub(o)}</small>` : ''}</td>`; };
    return `<table class="st"><tbody>${R.map(r => `<tr>${td(A, B, r)}<td class="lab">${r[0]}</td>${td(B, A, r)}</tr>`).join('')}</tbody></table>`;
  }
  // 공격 종류별 시도 · 성공 (기호 순서 고정, 둘 다 안 쓴 기호는 뺀다)
  function typeTable(A, B) {
    const keys = TECH.concat(BANK, FOUL).filter(k => A.type[k] || B.type[k]);
    if (!keys.length) return '<div style="color:var(--sub);padding:6px">아직 공격 기록이 없습니다.</div>';
    const c = (o, k) => { const y = o.type[k]; return y ? `<b>${pc(rt(y.s, y.a))}</b> <small style="color:var(--sub)">${y.s}/${y.a}</small>` : '–'; };
    return `<table class="st"><thead><tr><th>성공/시도</th><th>공격</th><th>성공/시도</th></tr></thead><tbody>${keys.map(k => `<tr><td class="v">${c(A, k)}</td><td>${chip(k)}</td><td class="v">${c(B, k)}</td></tr>`).join('')}</tbody></table>`;
  }
  function render() {
    const set = liveSet(), si = S.sets.length - 1, sc = setScore(set), won = setsWon(), over = matchOver();
    const last = set.turns[set.turns.length - 1], nextSide = !last ? set.first : last.closed ? 1 - sideOf(set, set.turns.length - 1) : sideOf(set, set.turns.length - 1);
    const nm = p => esc(S.names[p] || (p ? '오른쪽 선수' : '왼쪽 선수'));
    const tgt = targetOf(si);
    let h = `<div class="shead"><div class="srow"><span class="stitle">📝 경기 기록지</span>
      <input class="nm r" data-nm="0" value="${esc(S.names[0])}" placeholder="왼쪽 선수"><span style="color:var(--sub)">vs</span><input class="nm" data-nm="1" value="${esc(S.names[1])}" placeholder="오른쪽 선수">
      <button class="sbtn" data-fill title="">이름 불러오기</button>
      <select data-cfg="type"><option ${S.type === 'PBA' ? 'selected' : ''}>PBA</option><option ${S.type === 'LPBA' ? 'selected' : ''}>LPBA</option></select>
      <select data-cfg="target">${[15, 11, 9, 25].map(v => `<option value="${v}" ${S.target === v ? 'selected' : ''}>세트 ${v}점</option>`).join('')}</select>
      <select data-cfg="lastTarget">${[11, 9, 15].map(v => `<option value="${v}" ${S.lastTarget === v ? 'selected' : ''}>마지막 세트 ${v}점</option>`).join('')}</select>
      <select data-cfg="toWin">${[2, 3, 4].map(v => `<option value="${v}" ${S.toWin === v ? 'selected' : ''}>${v}세트 선승</option>`).join('')}</select>
      <button class="sbtn" data-new>새 경기</button><button class="sbtn min" data-min>최소화 ▁</button></div>
      <div class="board"><div class="pl a${!over && nextSide === 0 && !sel ? ' on' : ''}">${nm(0)}</div><div class="mid"><b>${sc[0]} : ${sc[1]}</b><small>${over ? '경기 끝' : `${si + 1}세트 · ${tgt}점 · ${set.first ? nm(1) : nm(0)} 선공`}</small><span class="sets">세트 ${won[0]} : ${won[1]}</span></div><div class="pl${!over && nextSide === 1 && !sel ? ' on' : ''}">${nm(1)}</div></div>
      <div class="pad">${TECH.map(k => `<button data-k="${esc(k)}">${esc(k)}</button>`).join('')}<span class="gap"></span>${BANK.map(k => `<button class="bk" data-k="${k}">${k}</button>`).join('')}<span class="gap"></span>${FOUL.map(k => `<button class="fl" data-k="${k}">${k}</button>`).join('')}<button data-k="X">X</button>
        <span class="gap"></span><button class="act" data-enter>${sel ? '고치기 끝' : '↵ 이닝 끝 (마지막 공격 실패)'}</button><button class="act" data-back>⌫ 지우기</button>${!set.turns.length && !over ? `<button class="act" data-swap>선공 바꾸기</button>` : ''}</div></div>
      <div class="sbody">`;
    S.sets.forEach((st, i) => {
      const s2 = setScore(st), A = stat(turnsOf(st, 0)), B = stat(turnsOf(st, 1));
      const fbT = st.turns[0]; A.fb = st.first === 0 && fbT ? ptsOf(fbT) : null; B.fb = st.first === 1 && fbT ? ptsOf(fbT) : null;
      const res = st.winner != null ? `${nm(st.winner)} 승` : i === si && !over ? '진행 중' : '';
      h += `<details data-open="s${i}" ${S.open['s' + i] ? 'open' : ''}><summary>${i + 1}세트 <span>${s2[0]} : ${s2[1]}</span><small>${res} · ${Math.ceil(st.turns.length / 2)}이닝 · 에버 ${f3(A.avg)} : ${f3(B.avg)}</small></summary>
        ${innTable(st, i)}
        <details data-open="r${i}" ${S.open['r' + i] ? 'open' : ''}><summary>${i + 1}세트 기록</summary><div class="stgrid"><div>${statTable(A, B, { fb: true })}</div><div>${typeTable(A, B)}</div></div></details></details>`;
    });
    // 경기 전체
    const all = [0, 1].map(p => stat(S.sets.flatMap(st => turnsOf(st, p))));
    h += `<details data-open="g" ${S.open.g ? 'open' : ''}><summary>경기 전체 기록 <small>세트 ${won[0]} : ${won[1]} · 득점 ${all[0].pts} : ${all[1].pts}</small></summary>
      <div style="padding:0 10px 10px"><table class="st"><thead><tr><th>득점 · 이닝 · 에버</th><th>세트</th><th>득점 · 이닝 · 에버</th></tr></thead><tbody>${S.sets.map((st, i) => { const a = stat(turnsOf(st, 0)), b = stat(turnsOf(st, 1)); return `<tr><td class="v${st.winner === 0 ? ' hi' : ''}">${a.pts} <small>${a.inn}이닝 · ${f3(a.avg)}</small></td><td class="lab">${i + 1}세트</td><td class="v${st.winner === 1 ? ' hi' : ''}">${b.pts} <small>${b.inn}이닝 · ${f3(b.avg)}</small></td></tr>`; }).join('')}</tbody></table>
      <div class="stgrid" style="margin-top:8px"><div>${statTable(all[0], all[1])}</div><div>${typeTable(all[0], all[1])}</div></div></div></details></div>`;
    box.innerHTML = h;
    fab.innerHTML = `<i>📝</i>${sc[0]}:${sc[1]}`;
  }

  // ── 열기 · 최소화 ──
  const open = () => { box.hidden = false; fab.hidden = true; S.view = 'open'; save(); render(); };
  const minimize = () => { if (box.hidden) return; box.hidden = true; fab.hidden = false; S.view = 'min'; save(); render(); };
  window.Sheet = { on: true, btn: () => '<button class="sheetbtn" data-sheet>📝 기록지</button>', open };
  // 이름 불러오기: 두 칸에서 보고 있는 선수 (실시간 경기 중이면 그 선수들)
  function fillNames() {
    const P = typeof panes !== 'undefined' ? [panes.a.data, panes.b.data] : [];
    P.forEach((d, i) => { if (d) S.names[i] = d.player.name; });
    const t = P[0] && P[0].player.type; if (t && t !== S.type) { S.type = t; S.target = t === 'LPBA' ? 11 : 15; S.lastTarget = t === 'LPBA' ? 9 : 11; }
    save(); render();
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-sheet]')) { open(); return; }
    if (e.target.closest('#sheetFab')) { open(); return; }
    if (box.hidden) return;
    if (!box.contains(e.target)) { minimize(); return; }   // 기록지 밖을 누르면 작은 아이콘으로
    const k = e.target.closest('[data-k]'); if (k) { add(k.dataset.k); return; }
    if (e.target.closest('[data-enter]')) { endInning(); return; }
    if (e.target.closest('[data-back]')) { back(); return; }
    if (e.target.closest('[data-swap]')) { const s = liveSet(); s.first = 1 - s.first; save(); render(); return; }
    if (e.target.closest('[data-min]')) { minimize(); return; }
    if (e.target.closest('[data-fill]')) { fillNames(); return; }
    // 새 경기: 실수로 지우지 않게 3초 안에 한 번 더 눌러야 지운다
    const nb = e.target.closest('[data-new]');
    if (nb) { if (!nb.classList.contains('arm')) { nb.classList.add('arm'); nb.textContent = '한 번 더 누르면 지움'; setTimeout(() => { if (nb.isConnected) { nb.classList.remove('arm'); nb.textContent = '새 경기'; } }, 3000); return; }
      const keep = { type: S.type, target: S.target, lastTarget: S.lastTarget, toWin: S.toWin }; S = { ...fresh(), ...keep }; sel = null; fillNames(); return; }
    const c = e.target.closest('td.seq[data-st]');
    if (c) { const [s, t] = c.dataset.st.split('|'); if (t === '') return; const same = sel && sel.set === +s && sel.turn === +t; sel = same ? null : { set: +s, turn: +t }; render(); return; }
  }, true);
  // 펼치기 · 접기 상태 기억
  box.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.open) { S.open[d.dataset.open] = d.open; save(); } }, true);
  box.addEventListener('change', e => {
    const n = e.target.closest('[data-nm]'); if (n) { S.names[+n.dataset.nm] = n.value.trim(); save(); render(); return; }
    const c = e.target.closest('[data-cfg]'); if (c) { const k = c.dataset.cfg; S[k] = k === 'type' ? c.value : +c.value; if (k === 'type') { S.target = c.value === 'LPBA' ? 11 : 15; S.lastTarget = c.value === 'LPBA' ? 9 : 11; } save(); render(); }
  });
  // 키보드 (이름 입력 중에는 안 받음)
  document.addEventListener('keydown', e => {
    if (box.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.key === 'Escape') { minimize(); e.preventDefault(); return; }
    if (e.key === 'Enter' || e.code === 'NumpadEnter') { endInning(); e.preventDefault(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { back(); e.preventDefault(); return; }
    const f = KEY[e.code], x = f && f(e.shiftKey);
    if (x) { add(x); e.preventDefault(); }
  }, true);
  render();
  if (S.view === 'min') { fab.hidden = false; }
})();
