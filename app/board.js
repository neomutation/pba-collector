// 상단 버튼 창: 시즌 일정 · 포인트 순위 · 상금 순위 · 웰컴톱랭킹 · 경기 결과 검색 (일반 · 캐스터 앱 공통)
//  한 창 안에서 탭만 바꾼다. PBA/LPBA · 선수 검색(초성 가능)은 어느 탭에서나 그대로 유지. 줄에 커서 = 세부 말풍선, 경기 줄을 누르면 세트 기록 펼침
(function () {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const choOf = c => { const n = c.charCodeAt(0) - 0xAC00; return n >= 0 && n < 11172 ? CHO[Math.floor(n / 588)] : c; };
  const isJamo = c => CHO.includes(c);
  // 이름 검색: 글자 또는 초성이 이어서 맞으면 찾음 (ㅈㄱㅎ, 조ㄱㅎ, 건휘 모두)
  function nameHit(name, q) {
    const n = String(name || '').replace(/\s/g, '').toLowerCase(), s = String(q || '').replace(/\s/g, '').toLowerCase();
    if (!s) return true;
    for (let i = 0; i + s.length <= n.length; i++) {
      let ok = true;
      for (let j = 0; j < s.length && ok; j++) ok = isJamo(s[j]) ? choOf(n[i + j]) === s[j] : n[i + j] === s[j];
      if (ok) return true;
    }
    return false;
  }
  // 개인투어 · 팀리그 버튼을 따로 둔다 (지금 보는 탭에 맞춰 바뀜)
  const TABS_I = [['sched', '📅 일정'], ['points', '포인트'], ['prize', '상금'], ['top', '[웰컴]톱랭킹'], ['irec', '세부'], ['games', '🔎 [경기 ]결과']];
  const TABS_T = [['tsched', '📅 일정'], ['trank', '팀'], ['tplayer', '선수'], ['tperfect', '퍼펙트큐'], ['tgames', '🔎 [경기 ]결과'], ['tqa', '🔍 [리그 ]검색']];
  const isTeamApp = () => document.body.classList.contains('teammode');
  const tabsNow = () => isTeamApp() ? TABS_T : TABS_I;
  // 머리줄에는 '순위'(경기 결과를 뺀 나머지 항목 묶음 — 마지막으로 본 항목으로 열림)와 '경기 결과'만
  const isGamesTab = k => /games$/.test(k);
  const lastRank = { i: 'points', t: 'trank' };
  const hbtnsNow = () => [['rank', '순위'], tabsNow().find(([k]) => isGamesTab(k))];
  const V = { tab: 'sched', type: 'PBA', q: '', season: null, seq: '', round: '', open: null, tLg: null, tRound: '', tTeam: '', gender: 'M' };
  const boards = {};
  const getBoard = t => boards[t] || (boards[t] = api('/api/board?type=' + t).catch(() => { delete boards[t]; return null; }));

  const css = document.createElement('style');
  css.textContent = `
.hbtns { display: flex; gap: 4px; flex-wrap: wrap; }
.hbtns button { border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.08); color: #fff; border-radius: 6px; padding: 4px 9px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.hbtns button:hover { background: rgba(255,255,255,.2); }
.hbtns button.on { background: #fff; color: var(--head); }
#board { position: fixed; z-index: 55; left: 50%; top: 46px; transform: translateX(-50%); width: calc(100vw - 12px); height: calc(100vh - 56px); display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0,0,0,.5); font-variant-numeric: tabular-nums; }
#board[hidden] { display: none; }
#board .bhead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid var(--line); }
#board .bseg { display: flex; gap: 2px; background: var(--chip); border-radius: 8px; padding: 2px; }
#board .btabs { display: flex; gap: 2px; }   /* 항목마다 테두리, 아주 약간 띄워 바짝 */
#board .btabs button { border: 1px solid var(--line); background: var(--chip); color: var(--sub); border-radius: 6px; padding: 3px 9px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
#board .btabs button:hover { color: var(--ink); }
#board .bhead > input.bq { flex: 1 1 8em; min-width: 5em; max-width: 14em; }
#board .bseg button { border: 0; background: transparent; color: var(--sub); border-radius: 6px; padding: 4px 11px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
#board .btabs button.on { border-color: var(--accent); }
#board .btabs button.on, #board .bseg button.on { background: var(--accent); color: #fff; }
@media (max-width: 1000px) { #board .bcols.many td.v small { display: none; } }
#board .wtop { display: grid; grid-template-columns: minmax(0, 1fr) 180px 220px; gap: 8px; height: calc(100% - 26px); min-height: 0; } #board .wtop .bcol { min-height: 0; }
#board .wseg { margin-left: auto; } #board .wseg button { padding: 2px 9px; font-size: 12px; }
#board table.wgrid td.wc { text-align: center; padding: 3px 6px; white-space: nowrap; line-height: 1.25; } #board table.wgrid td.wc small { display: block; font-size: 10.5px; color: var(--sub); } #board table.wgrid td.wc small b { color: var(--ink); } #board table.wgrid td.wq { font-weight: 800; position: sticky; left: 0; background: var(--panel); white-space: nowrap; } #board table.wgrid td.dim { opacity: .3; }
#board .rrgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 560px), 1fr)); gap: 8px; } #board .rrb .bscr { overflow-x: auto; } #board .rrt { width: 100%; } #board .rrt td.rrc { text-align: center; padding: 2px 4px; line-height: 1.2; white-space: nowrap; } #board .rrt td.rrc b { display: block; font-size: 12.5px; } #board .rrt td.rrc small { display: block; font-size: 10px; color: var(--sub); } #board .rrt td.dim { opacity: .3; }
#board .rrt .rcur { box-shadow: inset 2px 0 #ffd60a, inset -2px 0 #ffd60a; } #board .rrt thead th.rcur { box-shadow: inset 2px 0 #ffd60a, inset -2px 0 #ffd60a, inset 0 2px #ffd60a; border-radius: 8px 8px 0 0; color: #ffd60a; } #board .rrt tbody tr:last-child .rcur { box-shadow: inset 2px 0 #ffd60a, inset -2px 0 #ffd60a, inset 0 -2px #ffd60a; border-radius: 0 0 8px 8px; } #board .rrt th.rcur small { display: block; font-size: 9.5px; font-weight: 700; }   /* 이번 라운드(진행 중) 열: 노란 테두리 */
#board .pfw.two { grid-template-columns: 340px minmax(0, 1fr); } #board .pf2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; min-height: 0; } #board .pf2 .bcol { min-height: 0; } #board .tday { margin-bottom: 10px; } #board .tday h4 { margin: 0 0 6px; font-size: 14px; } #board .tday h4 small { color: var(--sub); font-weight: 500; font-size: 11.5px; margin-left: 6px; } #board .tdcs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; } #board .tdc { border: 1px solid #ffd60a; border-radius: 8px; padding: 4px 4px; min-width: 0; cursor: pointer; background: color-mix(in srgb, #ffd60a 6%, transparent); } #board .tdc:hover { background: color-mix(in srgb, #ffd60a 14%, transparent); } #board .tdh { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 4px; font-weight: 800; font-size: 13px; white-space: nowrap; } .tdh .l, .tdh .r { overflow: hidden; text-overflow: clip; }   /* 한 줄에 다섯 경기 */ #board .tdh .l { text-align: right; } #board .tdh .c { text-align: center; white-space: nowrap; } #board .tdh .c small { display: block; font-size: 10.5px; color: var(--sub); font-weight: 500; } #board .tdh .tdt { color: #ffd60a; }   /* 일정: 오늘 경기 카드 */ #board .pfside table { table-layout: fixed; } #board .pfside td.l { overflow: hidden; text-overflow: ellipsis; } #board .pfside td.v { width: 5.4em; padding-left: 0; } #board tr.pfz1 td { background: color-mix(in srgb, var(--chip) 55%, transparent); } #board tr.pfnew td { border-top: 2px solid var(--sub); } #board .pfss { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 2px 9px; font-size: 11.5px; font-weight: 500; color: var(--sub); } #board .pfss b { color: var(--ink); font-weight: 800; } #board .bcol h4:has(.pfss) { flex-wrap: wrap; }   /* 종목별: 시즌 구분 */ @media (max-width: 900px) { #board .pfw > .bcol table.gt td small { display: none; } #board .pfw > .bcol table.gt td, #board .pfw > .bcol table.gt th { padding: 2px 4px; font-size: 12px; } }   /* 절반 화면: 경기 목록은 종목 · 상대 선수 작은 글씨를 숨겨 한 화면 폭에 */ #board .tag.kd { display: inline-block; font-size: 10px; font-weight: 800; padding: 0 4px; border-radius: 4px; background: #7c3aed; color: #fff; vertical-align: 1px; } #board .kdp { color: var(--sub); font-weight: 500; } #board small.kdn { color: #a78bfa; font-weight: 700; font-size: 10.5px; } #board .pfl2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; min-height: 0; } #board .pfl2 .bcol { min-height: 0; } #board .pfl2 table.gt td small { display: none; } #board .pfl2 table.gt td, #board .pfl2 table.gt th { padding: 2px 4px; font-size: 12px; }   /* 2분할: 종목 · 상대 선수 작은 글씨는 줄인다 (한 줄 유지) */ @media (max-width: 1200px) { #board .pfl2 { grid-template-columns: 1fr; } } @media (max-width: 900px) { #board .pfw.two { grid-template-columns: 1fr; } }
#board .pfw { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 8px; height: calc(100% - 66px); min-height: 0; } #board .pfw .bcol { min-height: 0; } #board tr.pfrow { cursor: pointer; } #board tr.pfrow:hover td { background: rgba(var(--heat), .08); } #board tr.pfrow.on td { background: rgba(var(--heat), .2); font-weight: 800; } #board table.gt td.plain { font-weight: 400; } #board table.gt td small { color: var(--sub); font-size: 10.5px; } @media (max-width: 900px) { #board .pfw { grid-template-columns: 1fr; height: auto; } #board .pfside .bscr { max-height: 170px; } }
#board .wsub { display: block; font-size: 10.5px; color: var(--sub); }
@media (max-width: 1100px) { #board .wtop { grid-template-columns: 1fr 1fr; height: auto; } #board .wtop .bcol:first-child { grid-column: 1 / -1; } }

#board input.bq, #board select { font: inherit; font-size: 13px; background: var(--chip); color: var(--ink); border: 1px solid var(--line); border-radius: 7px; padding: 4px 8px; }
#board input.bq { width: 12em; }
#board .bx { margin-left: auto; border: 0; background: var(--chip); color: var(--sub); width: 28px; height: 28px; border-radius: 7px; cursor: pointer; }
#board .bbody { flex: 1; min-height: 0; overflow: auto; overflow-x: hidden; padding: 6px 8px; }
#board .note { padding: 6px 2px; }
#board .bcols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; height: 100%; }
#board .bcols.many { grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); grid-auto-rows: minmax(280px, 1fr); gap: 4px; }
#board .bcols.many .bcol h4 { padding: 4px 6px; font-size: 12px; }
#board .bcols.many td { padding: 2px 3px; font-size: 11.5px; letter-spacing: -.3px; } #board .bcols.many table { table-layout: fixed; }
#board .bcols.many td.rk { width: 2.7em; font-size: 10.5px; } #board .bcols.many td.v { width: 3.5em; } #board .bcols.many td.v.wv { width: 5.9em; padding-left: 0; } #board .bcols.many td.v.wv small { font-size: 9.5px; letter-spacing: -.4px; }   /* 값 뒤 괄호(비율 · 경기 수)가 붙는 순위 */
#board .bcols.many td.v.wm { width: 4.9em; padding-left: 0; }   /* 상금 (예: 8,300만) */
@media (max-width: 1000px) { #board .bcols.many td.v.wv { width: 4.3em; } }   /* 좁은 창: 괄호는 숨기고(말풍선에 있음) 값 칸도 줄인다 */ #board .bcols.many td.nmc { overflow: hidden; text-overflow: ellipsis; }
#board table.gt td, #board table.gt th { padding: 2px 5px; } #board td.wn { font-weight: 800; color: var(--win); }
#board .bcol { min-width: 0; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 9px; min-height: 0; }
#board .bcol h4 { margin: 0; padding: 6px 10px; font-size: 13px; border-bottom: 1px solid var(--line); display: flex; gap: 6px; align-items: baseline; }
#board .bcol.cur { border-color: #ffd60a; box-shadow: inset 0 0 0 1px #ffd60a; } .lqabox { padding: 0; } .lqaex { margin: 0 0 4px; padding: 2px 0 4px; position: sticky; top: 0; z-index: 3; background: var(--panel); } .lqaex button { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--sub); cursor: pointer; } .lqaex button:hover { color: var(--ink); border-color: var(--accent); } .lqaclrw { text-align: right; margin: -2px 0 4px; } .lqaclr { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px dashed var(--line); background: var(--panel); color: var(--sub); cursor: pointer; }
.lqac { position: relative; display: inline-block; vertical-align: top; margin: 0 4px 4px 0; padding: 2px 22px 2px 6px; border: 1px solid var(--line); border-radius: 6px; max-width: 100%; box-sizing: border-box; } .lqac .qahead { margin: 0 0 1px; font-size: 11.5px; } .lqax { position: absolute; top: 1px; right: 2px; border: 0; background: transparent; color: var(--sub); cursor: pointer; font-size: 11px; padding: 0 3px; } .lqax:hover { color: var(--ink); }
.lqac .rsvb { display: flex; gap: 3px; margin: 2px 0 3px; } .lqac .rsvb button { font-size: 11px; padding: 1px 9px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--sub); cursor: pointer; } .lqac .rsvb button.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; } .lqac table.lqa tr.rsg td { padding: 5px 0 1px; font-size: 11.5px; font-weight: 700; color: var(--ink); border-bottom: 1px solid var(--line); } .lqac table.lqa tr.rsg:first-child td { padding-top: 0; }   /* 리버스 스윕 보기 */
.lqac .lqp { all: unset; cursor: pointer; font-weight: 700; color: var(--ink); text-decoration: underline dotted; text-underline-offset: 2px; } .lqac .lqp:hover { color: var(--accent); } .lqac small.mv, .lqac b.mv { color: #e8a33d; } .lqac b.sub { color: var(--accent); }
.lqac table.lqa { width: auto; border-collapse: collapse; margin: 0; } .lqac table.lqa thead { display: none; } .lqac table.lqa td { padding: 0 5px 0 0; font-size: 12px; line-height: 1.35; text-align: left; white-space: nowrap; border: 0; } .lqac table.lqa td:not(.rkc) { text-align: left !important; } .lqac table.lqa td.rkc { color: var(--sub); text-align: right !important; padding-right: 4px; } .lqac table.lqa td small { color: var(--sub); font-weight: 500; font-size: 10px; } .lqac .qasum, .lqac .qahelp { margin: 0; font-size: 12px; }   /* 리그 검색 */ .bscr tr.tpgap td { height: 9px; padding: 0; border: 0; background: transparent; } .bscr tr.tpbelow td { color: var(--sub); } .bscr tr.tpbelow td.rk { font-size: 10.5px; } .bscr tr.tpbelow td small { margin-left: 4px; font-size: 10px; color: var(--sub); }   /* 선수 순위: 10경기 미만은 두 줄 띄고 맨 아래 */ #board .bcol.cur h4 { color: #ffd60a; }   /* 이번 시즌 */
#board .bcols.many.allv { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); grid-auto-rows: auto; height: auto; } #board .bcols.many.allv .bscr { overflow: visible; } #board .bcols.many.allv td.av { white-space: nowrap; overflow: hidden; } #board .bcols.many.allv .avv { margin-left: 2ch; font-weight: 800; } #board .bcols.many.allv .avv small { display: inline; color: var(--sub); font-weight: 500; font-size: 10.5px; }   /* 통산 보기: 항목마다 TOP20 블록, 이름 4글자 + 두 칸 + 값 */
#board .bcol h4 small { color: var(--sub); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#board .bscr { flex: 1; min-height: 0; overflow: auto; }
#board table { width: 100%; border-collapse: collapse; }
#board td, #board th { padding: 3px 7px; border-bottom: 1px solid var(--line); white-space: nowrap; font-size: 13px; text-align: right; }
#board th { color: var(--sub); font-size: 11.5px; font-weight: 700; position: sticky; top: 0; background: var(--panel); z-index: 1; }
#board td.l, #board th.l { text-align: left; color: var(--ink); } #board td.c, #board th.c { text-align: center; }
#board td.rk { color: var(--sub); width: 2.6em; } #board td.rk.r1 { color: #ffd60a; font-weight: 800; }
#board td.v { font-weight: 800; }
#board tr[data-tip2]:hover td, #board tr.gr:hover td { background: rgba(var(--heat), .08); }
#board tr.gr { cursor: pointer; }
#board tr.mine td { background: rgba(var(--heat), .14); }
#board .nm { font-weight: 700; cursor: pointer; color: var(--ink); } #board .nm.wn { color: var(--win); } #board .nm.ls { color: var(--sub); } #board .nm:hover { text-decoration: underline; }
#board .wn, #board table td.l.wn, #board table td.wn { font-weight: 800; color: var(--win); } #board table.gt td.l:not(.wn):not(.drw) { font-weight: 400; } #board td.drw, #board table td.l.drw { font-weight: 800; color: #e0b400; } @media (prefers-color-scheme: dark) { #board td.drw, #board table td.l.drw { color: #ffd60a; } } #board .ls { color: var(--sub); }
#board .tagw { font-size: 10.5px; font-weight: 800; color: #ffd60a; margin-left: 4px; }
#board .schg { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 10px; }
#board tr.det td { background: var(--zebra); padding: 4px 10px 8px; text-align: left; }
#board .settab td, #board .settab th { font-size: 12px; padding: 2px 8px; text-align: center; position: static; background: none; }
@media (max-width: 620px) { #board .bcols:not(.many) { grid-template-columns: 1fr; height: auto; } #board .bcols:not(.many) .bcol { max-height: 60vh; } }
`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'board'; box.hidden = true; document.body.appendChild(box);
  // 머리줄 버튼: 개인투어 · 팀리그 스위치 바로 오른쪽
  const nav = document.querySelector('.apptabs'), hb = document.createElement('div'); hb.className = 'hbtns';
  // 이름의 [ ] 부분은 좁은 창에서 숨는다 (.hl)
  const drawBtns = () => { hb.innerHTML = hbtnsNow().map(([k, l]) => `<button data-bopen="${k}">${l.replace(/\[(.+?)\]/g, '<span class="hl">$1</span>')}</button>`).join(''); };
  drawBtns(); nav.after(hb);
  new MutationObserver(() => { const k = isTeamApp() ? 't' : 'i'; if (k !== hb.dataset.m) { hb.dataset.m = k; drawBtns(); close(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  const curTourOf = tours => { const a = tours.filter(t => t.start && t.seq !== 'F' || t.start).slice().sort((x, y) => String(y.start).localeCompare(String(x.start))); return a.find(t => t.status && t.status !== '종료') || a[0]; };
  const tl = t => `${String(t.season).slice(2)} ${tourShort(t.seq)}`;
  const openP = id => `data-bp="${esc(id)}"`;
  const rankAll = (list, get) => { const s = list.slice().sort((a, b) => get(b) - get(a)); return s.map(x => ({ x, r: s.filter(y => get(y) > get(x)).length + 1 })); };
  //  머리줄이 없으면 thead 를 빼야 고정 표(table-layout: fixed)가 칸 폭(순위 · 값)을 따른다 (빈 머리줄이면 칸이 똑같이 나뉨)
  const scrTbl = (head, rows) => `<div class="bscr"><table>${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${rows || '<tr><td class="l" colspan="5" style="color:var(--sub)">해당 없음</td></tr>'}</tbody></table></div>`;

  // ── 포인트 · 상금: 이번 대회 | 시즌별(최신 → 과거) | 통산. 칸이 많아 좁은 화면에선 다음 줄로 내려간다 (가로 스크롤 없음) ──
  const shortV = (v, prize) => prize ? won(v) : v >= 10000 ? `${+(v / 10000).toFixed(1)}만` : (v || 0).toLocaleString();
  function moneyTab(B) {
    const prize = V.tab === 'prize', key = prize ? 2 : 4;
    const cur = curTourOf(B.tours), tourBy = Object.fromEntries(B.tours.map(t => [t.code, t]));
    const sum = rows => { const m = {}; rows.forEach(r => { m[r[0]] = (m[r[0]] || 0) + (r[key] || 0); }); return Object.entries(m).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })); };
    const col = (title, sub, rows, scope) => {
      const ranked = rankAll(sum(rows), o => o.v).filter(({ x }) => nameHit(B.names[x.id], V.q));
      return `<div class="bcol${scope === V._curS ? ' cur' : ''}"><h4>${title}${sub ? `<small>${esc(sub)}</small>` : ''}</h4>${scrTbl('', (V.q ? ranked : ranked.slice(0, 50)).map(({ x, r }) => `<tr><td class="rk c ${r === 1 ? 'r1' : ''}">${r}위</td><td class="l nmc"><span class="nm" data-tip2="${scope}|${esc(x.id)}" ${openP(x.id)}>${esc(B.names[x.id] || x.id)}</span></td><td class="v${prize ? ' wm' : ''}">${shortV(x.v, prize)}</td></tr>`).join(''))}</div>`;
    };
    const P = B.prizes, seasons = [...new Set(B.tours.map(t => t.season))].sort((a, c) => c - a);
    V._scopes = { tour: P.filter(r => r[1] === cur.code), all: P };
    seasons.forEach(s => { V._scopes['s' + s] = P.filter(r => tourBy[r[1]] && tourBy[r[1]].season === s); });
    V._curS = 's' + seasons[0];
    return `<div class="bcols many">${col('통산', '', V._scopes.all, 'all')}${col('이번 대회', tourShort(cur.seq), V._scopes.tour, 'tour')}${seasons.map((s, i) => col(seasonLabel(s), i === 0 ? '이번 시즌' : '', V._scopes['s' + s], 's' + s)).join('')}</div>`;
  }
  function moneyTip(B, scope, id) {
    const key = V.tab === 'prize' ? 2 : 4, tourBy = Object.fromEntries(B.tours.map(t => [t.code, t]));
    const mine = (V._scopes[scope] || []).filter(r => r[0] === id && r[key]);
    if (scope === 'all') {   // 통산은 시즌별로 묶어 짧게
      const m = {}; mine.forEach(r => { const s = tourBy[r[1]].season; m[s] = (m[s] || 0) + r[key]; });
      return `<div class="rkh0">${esc(B.names[id] || '')} <small>시즌별</small></div><table>${ordS(Object.keys(m).map(Number)).map(s => `<tr><td>${seasonLabel(+s)}</td><td></td><td>${V.tab === 'prize' ? won(m[s]) : m[s].toLocaleString()}</td></tr>`).join('')}</table>`;
    }
    const rows = mine.slice().sort((a, b) => String(tourBy[b[1]].start).localeCompare(String(tourBy[a[1]].start)));
    return `<div class="rkh0">${esc(B.names[id] || '')} <small>대회별</small></div><table>${rows.map(r => `<tr><td>${esc(tourShort(tourBy[r[1]].seq))}</td><td>${esc(resultText(rankToResult(r[3])) || '')}</td><td>${V.tab === 'prize' ? won(r[2]) : (r[4] || 0).toLocaleString()}</td></tr>`).join('')}</table>`;
  }

  // ── 개인투어 세부 순위: 항목 버튼 16개 × 블록(통산 → 이번 시즌(노란 테두리) → 지난 시즌). 통산 버튼 = 통산 블록만 크게, 시즌별 = 모든 블록 ──
  //  min: 순위 자격 [시즌, 통산] (경기 수 등), 없으면 1번 이상. 기권 경기 제외
  const isFinal = g => g.round_code === 2 || g.round_raw === '결승';
  const I_METRICS = [
    { k: 'champ', l: '우승 횟수', v: x => x.champ || null, f: v => `${v}회`, c: x => `${x.fin - x.champ}회`, e: x => pct(x.champ / x.fin), tie: x => x.fin, note: '결승에서 이긴 횟수. 괄호 = 준우승 횟수, 뒤 = 결승 승률.' },
    { k: 'apps', l: '출전 횟수', v: x => x.tours.size, f: v => `${v}개`, c: x => `${x.o.games}경기`, tie: x => x.o.games, note: '경기를 치른 대회 수. 괄호 = 경기 수.' },
    { k: 'winRate', l: '승률', v: x => x.o.winRate, f: pct, c: x => `${x.o.win}-${x.o.lose}`, n: x => x.o.games, min: [10, 30], tie: x => x.o.win, note: '경기 승률. 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'win', l: '승리', v: x => x.o.win || null, f: v => `${v}승`, c: x => pct(x.o.winRate), tie: x => x.o.winRate || 0, note: '경기 승수. 괄호 = 경기 승률.' },
    { k: 'setW', l: '세트 승리', v: x => x.o.setW || null, f: v => `${v}승`, c: x => pct(x.o.setRate), tie: x => x.o.setRate || 0, note: '세트 승수. 괄호 = 세트 승률.' },
    { k: 'avg', l: '에버', v: x => x.o.avgAll, f: f3, c: x => `${x.o.games}경기`, n: x => x.o.games, min: [10, 30], note: '세트제 경기 에버리지. 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'long', l: '장타율', v: x => x.o.long, f: pct, c: x => `${x.o.longN}회`, n: x => x.o.games, min: [10, 30], note: '한 이닝 5점 이상 친 이닝 비율. 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'success', l: '공격성공률', v: x => x.o.success, f: pct, c: x => `${x.o.games}경기`, n: x => x.o.games, min: [10, 30], note: '샷 기준: 성공(1점 + 뱅크샷 개수) ÷ 시도(성공 + 실패로 끝난 이닝). 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'bpts', l: '뱅크샷 총득점', v: x => x.o.bankN ? x.o.bankN * 2 : null, f: v => `${v}점`, c: x => `${x.o.bankN}개`, tie: x => x.o.bank || 0, note: '뱅크샷으로 낸 득점 합계 (1개 = 2점). 괄호 = 뱅크샷 성공 개수.' },
    { k: 'bank', l: '뱅크샷 득점 비율', v: x => x.o.bank, f: pct, c: x => `${x.o.bankN}개`, n: x => x.o.games, min: [10, 30], note: '득점 중 뱅크샷 득점 비율 (개인투어 자료에는 뱅크샷 시도 수가 없어 성공률 대신). 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'setRatio', l: '세트 득실비', v: x => x.o.setRatio, f: f3, c: x => `${x.o.setW}-${x.o.setL}`, n: x => x.o.games, min: [10, 30], note: '딴 세트 ÷ 내준 세트. 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'ptRatio', l: '점수득실비', v: x => x.o.ptRatio, f: f3, c: x => `${x.o.games}경기`, n: x => x.o.games, min: [10, 30], note: '득점 ÷ 실점. 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'clutch', l: '클러치 승률', v: x => x.o.setClutch, f: pct, c: x => `${x.o.lateW}/${x.o.lateN}`, n: x => x.o.lateN, min: [5, 15], note: '이닝과 상관없이 두 선수 모두 목표 점수까지 PBA 5점 · LPBA 4점 이내로 남은 채 이어진 세트의 승률. 시즌 5세트 · 통산 15세트 이상.' },
    { k: 'dom', l: '게임 지배력', v: x => x.dom, f: f1, c: x => `${x.o.games}경기`, n: x => x.o.games, min: [10, 30], note: '리그 평균 = 100. 점수득실비 40% · 선제 리드 우위 30% · 리드 유지율 15% · 역전률 15%. 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'bankWin', l: '뱅킹 승률', v: x => x.o.bankWinRate, f: pct, c: x => `${x.o.bankWin}-${x.o.bankLose}`, n: x => x.o.bankWin + x.o.bankLose, min: [10, 30], note: '뱅킹(선공 결정)을 이긴 비율. 시즌 10경기 · 통산 30경기 이상.' },
    { k: 'fb', l: '초구 성공률', v: x => x.o.fbSuccess, f: pct, c: x => `${x.o.fbN}번`, n: x => x.o.fbN, min: [10, 30], note: '초구로 득점한 비율. 괄호 = 초구 수. 시즌 10번 · 통산 30번 이상.' },
  ];
  // 선수 × 기간 묶음 (종목마다 한 번)
  const iAggCache = {};
  function iAgg(type, L) {
    if (iAggCache[type] && iAggCache[type].L === L) return iAggCache[type];
    const mk = (gs, lg) => { const m = {}; gs.forEach(g => { (m[g.player] || (m[g.player] = { id: g.player, name: g.player_name, gs: [] })).gs.push(g); });
      return Object.values(m).map(x => { const o = calc(x.gs); return { id: x.id, name: x.name, o, tours: new Set(x.gs.map(g => g.tour)), fin: x.gs.filter(isFinal).length, champ: x.gs.filter(g => isFinal(g) && g.win).length, dom: lg ? dominanceOf(o, lg) : null }; }); };
    const seasons = [...new Set(L.games.map(g => g.season))].sort((a, b) => b - a), by = { all: mk(L.games, L.all) };
    seasons.forEach(s => { by['s' + s] = mk(L.games.filter(g => g.season === s), L.season[s]); });
    return (iAggCache[type] = { L, seasons, by });
  }
  // 통산 보기 줄: 순위 | 이름(4글자까지, 넘으면 말풍선에 전체 이름) 두 칸 띄고 값
  const nm4 = n => [...String(n)].length > 4 ? [...String(n)].slice(0, 4).join('') : n;
  const avRow = (r, nameH, valH) => `<tr><td class="rk c ${r === 1 ? 'r1' : ''}">${r}위</td><td class="l av">${nameH}<span class="avv">${valH}</span></td></tr>`;
  const viewSeg = () => `<div class="bseg"><button data-rv="all" class="${V.rkView === 'all' ? 'on' : ''}">통산</button><button data-rv="season" class="${V.rkView !== 'all' ? 'on' : ''}">시즌별</button></div>`;
  function irecTab(B, L) {
    const M = I_METRICS.find(x => x.k === V.iMetric) || I_METRICS[0], A = iAgg(V.type, L);
    V._irec = A.by; V._iM = M;
    const col = (title, key, cls, MM = M) => {
      const min = MM.min ? MM.min[key === 'all' ? 1 : 0] : 0;
      const list = A.by[key].filter(x => MM.v(x) != null && !isNaN(MM.v(x)) && (!MM.n || MM.n(x) >= min)).sort((a, b) => MM.v(b) - MM.v(a) || (MM.tie ? MM.tie(b) - MM.tie(a) : 0));
      const rows = list.map(x => ({ x, r: list.findIndex(y => MM.v(y) === MM.v(x)) + 1 })).filter(y => nameHit(y.x.name, V.q));
      const lim = V.rkView === 'all' ? 20 : 50;
      return `<div class="bcol${cls}"><h4>${title}<small>${list.length}명</small></h4>${scrTbl('', (V.q ? rows : rows.slice(0, lim)).map(({ x, r }) => V.rkView === 'all' ? avRow(r, `<span class="nm" data-tip2="ir|${key}|${esc(x.id)}" ${openP(x.id)}>${esc(nm4(x.name))}</span>`, `${MM.f(MM.v(x))}<small>(${MM.c(x)})${MM.e ? ' ' + MM.e(x) : ''}</small>`) : `<tr><td class="rk c ${r === 1 ? 'r1' : ''}">${r}위</td><td class="l nmc"><span class="nm" data-tip2="ir|${key}|${esc(x.id)}" ${openP(x.id)}>${esc(x.name)}</span></td><td class="v wv">${MM.f(MM.v(x))}<small style="color:var(--sub);font-weight:500">(${MM.c(x)})${MM.e ? ' ' + MM.e(x) : ''}</small></td></tr>`).join(''))}</div>`;
    };
    // 통산 버튼: 모든 항목의 통산 TOP20 을 한 화면에 (항목마다 한 블록)
    const blocks = V.rkView === 'all' ? I_METRICS.map(m => col(m.l, 'all', '', m)).join('') : col('통산', 'all', '') + ordS(A.seasons).map(s => { const i = A.seasons.indexOf(s); return col(`${seasonLabel(s)}${i === 0 ? ' 이번 시즌' : ''}`, 's' + s, i === 0 ? ' cur' : ''); }).join('');   // 열 순서 = ⇄ 설정, i = 0 이번 시즌
    return `<div class="bhead" style="padding:0 0 8px;border:0;flex-wrap:wrap">${viewSeg()}<div class="bseg" style="flex-wrap:wrap${V.rkView === 'all' ? ';display:none' : ''}">${I_METRICS.map(x => `<button data-im="${x.k}" class="${x === M ? 'on' : ''}">${x.l}</button>`).join('')}</div></div><div class="bcols many${V.rkView === 'all' ? ' allv' : ''}">${blocks}</div><div class="note">${V.rkView === 'all' ? '모든 항목의 통산 TOP20 (순위 자격은 시즌별 보기의 각 항목 설명과 같음).' : M.note} 기권 경기 제외. 이름에 커서 = 주요 기록.</div>`;
  }
  function irecTip(key, id) {
    const x = (V._irec && V._irec[key] || []).find(y => y.id === id); if (!x) return '';
    const o = x.o, row = (l, v) => `<tr><td>${l}</td><td></td><td>${v}</td></tr>`;
    return `<div class="rkh0">${esc(x.name)} <small>${key === 'all' ? '통산' : `${seasonLabel(+key.slice(1))} 시즌`}</small></div><table>${row('우승', `${x.champ}회 (결승 ${x.fin})`)}${row('출전', `${x.tours.size}개 대회 · ${o.games}경기`)}${row('승패', `${o.win}-${o.lose} (${pct(o.winRate)})`)}${row('세트', `${o.setW}-${o.setL} (${pct(o.setRate)})`)}${row('에버', f3(o.avgAll))}${row('장타율', pct(o.long))}${row('공격성공률', pct(o.success))}${row('뱅크샷', `${o.bankN * 2}점 (${pct(o.bank)})`)}${row('클러치', `${pct(o.setClutch)} (${o.lateW}/${o.lateN})`)}${row('게임 지배력', f1(x.dom) || '–')}${row('뱅킹 승률', pct(o.bankWinRate))}${row('초구 성공률', `${pct(o.fbSuccess)} (${o.fbHit}/${o.fbN})`)}</table>`;
  }
  // ── 웰컴톱랭킹: 시즌 × 대회 수상자 표 · 최다 수상 TOP10 · 역대 최고 에버 TOP10 ──
  function topTab(B, L, A) {
    const rnd = a => (a.round_code || a.round_raw ? roundName(a) : '') || a.round_desc || '';
    const seqKey = q => q === 'F' ? 99 : +q;
    const hit = n => !V.q || nameHit(n, V.q);
    const seasons = [...new Set(A.map(a => a.season))].sort((x, y) => V.topOld ? x - y : y - x);
    const seqs = [...new Set(A.map(a => a.seq))].sort((x, y) => seqKey(x) - seqKey(y));
    const at = {}; A.forEach(a => { at[a.season + '|' + a.seq] = a; });
    const cell = a => a ? `<td class="wc${hit(a.player_name) ? '' : ' dim'}" title="${esc(a.tour_name || '')}"><span class="nm" ${openP(a.player)}>${esc(a.player_name)}</span><small><b>${f3(a.avg)}</b> ${esc(rnd(a))}</small></td>` : '<td class="wc"></td>';
    const grid = `<div class="bcol"><h4>대회별 수상자<span class="bseg wseg"><button data-wo="new" class="${V.topOld ? '' : 'on'}">최신순</button><button data-wo="old" class="${V.topOld ? 'on' : ''}">과거순</button></span></h4><div class="bscr"><table class="wgrid"><thead><tr><th class="c"></th>${seasons.map(s => `<th class="c">${seasonLabel(s)}</th>`).join('')}</tr></thead><tbody>${seqs.map(q => `<tr><td class="c wq">${esc(tourShort(q))}</td>${seasons.map(s => cell(at[s + '|' + q])).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    // 같은 값은 같은 순위. 동률이 많아 10명을 넘기면 그 묶음은 한 줄로 줄인다
    const ranked = (list, v) => { const s = list.slice().sort((a, b) => v(b) - v(a)); return s.map(x => ({ x, r: s.findIndex(y => v(y) === v(x)) + 1 })).filter(y => y.r <= 10); };
    const m = {}; A.forEach(a => { const o = m[a.player] || (m[a.player] = { id: a.player, name: a.player_name, n: 0, best: 0 }); o.n++; o.best = Math.max(o.best, a.avg || 0); });
    const mostAll = ranked(Object.values(m), o => o.n), lastR = mostAll.length ? mostAll[mostAll.length - 1].r : 0;
    const mostTied = mostAll.length > 10 ? mostAll.filter(y => y.r === lastR) : [], mostRows = mostAll.filter(y => !mostTied.includes(y));
    const most = `<div class="bcol"><h4>최다 수상 TOP10</h4>${scrTbl('<th class="c">순위</th><th class="l">선수</th><th>수상</th>', mostRows.filter(({ x }) => hit(x.name)).map(({ x, r }) => `<tr><td class="rk c ${r === 1 ? 'r1' : ''}">${r}위</td><td class="l"><span class="nm" ${openP(x.id)}>${esc(x.name)}</span><small class="wsub">최고 ${f3(x.best)}</small></td><td class="v">${x.n}회</td></tr>`).join('') + (mostTied.length && !V.q ? `<tr><td class="rk c">${mostTied[0].r}위</td><td class="l" style="color:var(--sub)">${mostTied.length}명 동률</td><td class="v">${mostTied[0].x.n}회</td></tr>` : ''))}</div>`;
    const awarded = new Set(A.map(a => a.pst + '|' + a.player));
    const best = `<div class="bcol"><h4>역대 최고 에버 TOP10</h4>${scrTbl('<th class="c">순위</th><th class="l">선수</th><th>에버</th>', ranked(L.games.filter(isPlayed), g => g.avg).filter(({ x }) => hit(x.player_name)).map(({ x: g, r }) => `<tr><td class="rk c ${r === 1 ? 'r1' : ''}">${r}위</td><td class="l"><span class="nm" ${openP(g.player)}>${esc(g.player_name)}</span>${awarded.has(g.pst + '|' + g.player) ? '<span class="tagw">수상</span>' : ''}<small class="wsub">${seasonLabel(g.season)} ${esc(tourShort(g.seq))} ${esc(roundName(g))}${g.single ? ' · 25점 단판' : ''}</small></td><td class="v">${f3(g.avg)}</td></tr>`).join(''))}</div>`;
    return `<div class="wtop">${grid}${most}${best}</div><div class="note">표: 그 대회 공식 웰컴톱랭킹 수상자 · 에버 · 달성 라운드. 역대 최고 에버는 공식 웰컴톱랭킹처럼 25점 단판까지 모든 1:1 경기 기준이고(기권 제외), <b style="color:#ffd60a">수상</b> = 공식 웰컴톱랭킹.</div>`;
  }
  const setsLine = g => (g.sets || []).map(s => `${s.pts}:${s.opp_pts ?? ''}`).join(' ');
  function gameTip(g) {
    return `<div class="rkh0">${esc(g.player_name)} vs ${esc(g.opp_name || '')} <small>${esc(g.date || '')}</small></div><table><tr><td>결과</td><td></td><td>${g.win ? '승' : '패'} ${g.sw}:${g.sl}</td></tr><tr><td>세트</td><td></td><td>${esc(setsLine(g))}</td></tr><tr><td>에버</td><td></td><td>${f3(g.avg)}</td></tr><tr><td>하이런</td><td></td><td>${g.hr ?? ''}</td></tr></table>`;
  }

  // ── 시즌 일정 ──
  function schedTab(B) {
    const seasons = [...new Set(B.tours.map(t => t.season))].sort((a, b) => b - a);
    if (!V.season || !seasons.includes(V.season)) V.season = seasons[0];
    const list = B.tours.filter(t => t.season === V.season).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const md = d => String(d || '').slice(5).replace('-', '.');
    return `<div class="bhead" style="padding:0 0 8px;border:0"><select data-bs="season">${seasons.map(s => `<option value="${s}" ${s === V.season ? 'selected' : ''}>${seasonLabel(s)} 시즌</option>`).join('')}</select></div>
      <div class="bcol"><h4>${V.type} 투어<small>줄을 누르면 그 대회 경기 결과</small></h4><div class="bscr"><table><thead><tr><th class="c">차수</th><th class="l">대회</th><th class="c">기간</th><th class="l">우승</th></tr></thead><tbody>${list.map(t => `<tr class="gr" data-tour="${t.season}|${esc(t.seq)}" data-tip2="t|${t.code}"><td class="c"><b>${esc(tourShort(t.seq))}</b></td><td class="l" title="${esc(t.name)}">${esc(tourAbbr(t.name))}</td><td class="c">${md(t.start)}~${md(t.end_date)}</td><td class="l">${t.winner ? `<b>${esc(t.winner)}</b>` : `<span style="color:var(--sub)">${esc(t.status || '')}</span>`}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="note">개인투어는 시작한 대회까지 자료가 있습니다 (앞으로 열릴 대회는 홈피 자료에 없음).</div>`;
  }

  // ── 경기 결과 검색 ──
  function gamesTab(B, L) {
    const seasons = [...new Set(L.games.map(g => g.season))].sort((a, b) => b - a);
    if (!V.season || !seasons.includes(V.season)) V.season = seasons[0];
    const inS = V.season === 'all' ? L.games : L.games.filter(g => g.season === V.season);
    const seqs = [...new Set(inS.map(g => g.seq))].sort((a, b) => (a === 'F' ? 99 : +a) - (b === 'F' ? 99 : +b));
    const ORDER = ['결승', '4강', '8강', '16강', '32강', '조별리그', '64강', '128강', 'Q', 'PQ', 'PPQ'];
    const inT = V.seq ? inS.filter(g => String(g.seq) === V.seq) : inS;
    const rounds = ORDER.filter(r => inT.some(g => roundName(g) === r));
    if (V.round && !rounds.includes(V.round)) V.round = '';
    // 한 경기는 두 줄(양쪽 선수)로 있으니 이긴 쪽 줄만 쓴다. 선수 검색은 양쪽 이름 모두 본다
    const list = inT.filter(g => g.win && (!V.round || roundName(g) === V.round) && (nameHit(g.player_name, V.q) || nameHit(g.opp_name, V.q)))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (a.round_code || 999) - (b.round_code || 999));
    const shown = list.slice(0, 300);
    V._games = Object.fromEntries(shown.map(g => [g.pst + '|' + g.player, g]));
    return `<div class="bhead" style="padding:0 0 8px;border:0"><select data-bs="season"><option value="all" ${V.season === 'all' ? 'selected' : ''}>전체 시즌</option>${seasons.map(s => `<option value="${s}" ${s === V.season ? 'selected' : ''}>${seasonLabel(s)} 시즌</option>`).join('')}</select>
      <select data-bs="seq"><option value="">전체 대회</option>${seqs.map(s => `<option value="${esc(s)}" ${String(s) === V.seq ? 'selected' : ''}>${esc(tourShort(s))}</option>`).join('')}</select>
      <select data-bs="round"><option value="">전체 라운드</option>${rounds.map(r => `<option ${r === V.round ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <span style="color:var(--sub);font-size:12px">${list.length.toLocaleString()}경기${list.length > 300 ? ' · 최근 300경기 표시' : ''}</span></div>
      <table><thead><tr><th class="c">날짜</th><th class="c">대회</th><th class="c">라운드</th><th>승자</th><th class="c">스코어</th><th class="l">패자</th><th class="c">에버</th><th class="c">하이런</th></tr></thead><tbody>${shown.map(g => { const k = g.pst + '|' + g.player, open = V.open === k; return `<tr class="gr" data-gk="${esc(k)}" data-tip2="g|${g.pst}|${esc(g.player)}"><td class="c">${esc(String(g.date || '').slice(2).replace(/-/g, '.'))}</td><td class="c">${esc(String(g.season).slice(2))} ${esc(tourShort(g.seq))}</td><td class="c">${esc(roundName(g))}</td><td><span class="nm wn" ${openP(g.player)}>${esc(g.player_name)}</span></td><td class="c v">${g.single ? '단판' : `${g.sw}:${g.sl}`}</td><td class="l"><span class="nm ls" ${openP(g.opp)}>${esc(g.opp_name || '')}</span></td><td class="c">${f3(g.avg)}</td><td class="c">${g.hr ?? ''}</td></tr>${open ? `<tr class="det"><td colspan="8"><table class="settab"><thead><tr><th>세트</th><th>점수</th><th>이닝</th><th>에버</th><th>하이런</th></tr></thead><tbody>${(g.sets || []).map(s => `<tr><td>${s.no}세트</td><td><b>${s.pts}:${s.opp_pts ?? ''}</b></td><td>${s.inn ?? ''}</td><td>${f3(s.avg)}</td><td>${s.set_hr ?? ''}</td></tr>`).join('')}</tbody></table></td></tr>` : ''}`; }).join('') || '<tr><td colspan="8" class="c" style="color:var(--sub)">조건에 맞는 경기가 없습니다.</td></tr>'}</tbody></table>`;
  }

  // ── 팀리그 창: 일정 · 팀 순위 · 선수 순위 · 경기 결과 ──
  const wnc = (me, opp) => me > opp ? 'wn' : me === opp ? 'drw' : '';   // 이긴 쪽 초록 볼드, 무승부는 양쪽 노랑
  const leaguesDesc = X => X.D.leagues.slice().sort((a, b) => b.season - a.season);
  const teamNm = (X, c) => X.teamShort[c] || c;
  // 오늘 경기 카드용 두세 글자 이름 (한 줄에 다섯 경기)
  const TAB2 = [['웰컴', '웰컴'], ['크라운', '크라운'], ['NH', 'NH'], ['휴온스', '휴온스'], ['하이원', '하이원'], ['하나', '하나'], ['에스와이', 'SY'], ['우리', '우리'], ['하림', '하림'], ['브레이커스', '브렉'], ['SK', 'SK'], ['블루원', '블루원'], ['TS', 'TS'], ['신한', '신한']];
  const teamAb = (X, c) => { const n = teamNm(X, c), a = TAB2.find(([k]) => n.includes(k)); return a ? a[1] : n.slice(0, 3); };
  // 일정 맨 위: 오늘 경기 (없으면 다음 경기일) — 시간 · 두 팀만. 카드를 누르면 두 팀을 왼쪽 · 오른쪽 칸에 띄우고, 기록지(캐스터)에 그 경기 오더를 불러온다
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function tTodayBlock(X) {
    const today = ymd(new Date()), left = X.D.schedule.filter(s => !s.done && s.date >= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const doneToday = X.D.games.filter(g => String(g.date || '').startsWith(today));
    const day = doneToday.length || left.some(s => s.date === today) ? today : left.length ? left[0].date : null;
    if (!day) return '';
    const cards = doneToday.map(g => ({ t1: g.t1, t2: g.t2, lg: g.league, time: '', round: g.post ? (g.stage || 'PS') : g.round_label, g }))
      .concat(left.filter(s => s.date === day && !doneToday.some(g => [g.t1, g.t2].sort().join() === [s.t1, s.t2].sort().join())).map(s => ({ t1: s.t1, t2: s.t2, lg: s.league, time: s.time || '', round: s.round })))
      .sort((p, q) => (p.time || '99').localeCompare(q.time || '99'));
    const card = c => { const sc = c.g ? `<b class="${wnc(c.g.s1, c.g.s2)}">${c.g.s1}</b> : <b class="${wnc(c.g.s2, c.g.s1)}">${c.g.s2}</b>` : `<span class="tdt">${esc(c.time)}</span>`;
      return `<div class="tdc" data-tpick="${esc(c.t1)}|${esc(c.t2)}|${c.lg}" title="누르면 두 팀을 왼쪽 · 오른쪽 칸에 띄우고 기록지에 이 경기 오더를 불러옵니다"><div class="tdh"><span class="l" title="${esc(teamNm(X, c.t1))}">${esc(teamAb(X, c.t1))}</span><span class="c">${sc}<small>${esc(c.round || '')}</small></span><span class="r" title="${esc(teamNm(X, c.t2))}">${esc(teamAb(X, c.t2))}</span></div></div>`; };
    return `<div class="tday"><h4>${day === today ? '오늘 경기' : '다음 경기'} <small>${esc(day.slice(5).replace('-', '.'))} · ${cards.length}경기 · 누르면 두 팀 선택 + 기록지 오더</small></h4><div class="tdcs">${cards.map(card).join('')}</div></div>`;
  }
  function tSchedTab(X) {
    const ls = leaguesDesc(X); if (!V.tLg) V.tLg = ls[0].league;
    const games = X.D.games.filter(g => g.league === V.tLg), cur = X.D.schedule.filter(s => s.league === V.tLg && !s.done);
    const hit = (a, b) => nameHit(teamNm(X, a), V.q) || nameHit(teamNm(X, b), V.q);
    const rows = games.map(g => ({ d: g.date || '', r: g.post ? (g.stage || 'PS') : g.round_label, a: g.t1, b: g.t2, g })).concat(cur.map(s => ({ d: `${s.date} ${s.time || ''}`, r: s.round, a: s.t1, b: s.t2 })))
      .filter(x => hit(x.a, x.b)).sort((p, q) => p.d.localeCompare(q.d));
    V._tg = games;
    return `${tTodayBlock(X)}<div class="bhead" style="padding:0 0 6px;border:0"><select data-bs="tLg">${ls.map(l => `<option value="${l.league}" ${l.league === V.tLg ? 'selected' : ''}>${seasonLabel(l.season)} 시즌</option>`).join('')}</select><span style="color:var(--sub);font-size:12px">${rows.length}경기</span></div>
      <table class="gt"><thead><tr><th class="c">날짜</th><th class="c">라운드</th><th>왼쪽 팀</th><th class="c">결과</th><th class="l">오른쪽 팀</th></tr></thead><tbody>${rows.map(x => `<tr ${x.g ? `data-tip2="tg|${x.g.id}"` : ''}><td class="c">${esc(x.d.slice(2, 16).replace(/-/g, '.'))}</td><td class="c">${esc(x.r)}</td><td class="${x.g ? wnc(x.g.s1, x.g.s2) : ''}">${esc(teamNm(X, x.a))}</td><td class="c v">${x.g ? `${x.g.s1}:${x.g.s2}` : '<span style="color:var(--sub)">예정</span>'}</td><td class="l ${x.g ? wnc(x.g.s2, x.g.s1) : ''}">${esc(teamNm(X, x.b))}</td></tr>`).join('')}</tbody></table>`;
  }
  // 라운드별 순위: 시즌마다 라운드를 열로, 순위를 줄로
  function tRoundRank(X) {
    const block = l => {
      const rs = X.roundsOf(l.league).filter(r => X.D.games.some(g => g.league === l.league && !g.post && g.round_label === r));
      if (!rs.length) return '';
      const cols = rs.map(r => { const m = X.roundRanks(l.league, r); return Object.keys(m).sort((a, b) => m[a] - m[b]).map(c => ({ c, rank: m[c], o: X.tcalc(X.gamesOf(c, g => g.league === l.league && !g.post && g.round_label === r)) })); });
      const n = Math.max(...cols.map(c => c.length));
      // 이번 라운드 = 홈피 일정에 아직 안 끝난 경기가 남은 첫 라운드 (시즌이 끝났으면 없음)
      const cur = ((X.D.schedule || []).filter(s => s.league === l.league && !s.done).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || {}).round;
      const cc = i => rs[i] === cur ? ' rcur' : '';
      const cell = (y, i) => y ? `<td class="rrc${cc(i)}${nameHit(teamNm(X, y.c), V.q) ? '' : ' dim'}"><b><span class="tipn" data-rnd="${esc(y.c)}|${l.league}|${esc(rs[i])}">${esc(teamNm(X, y.c))}</span></b><small>${y.o.points != null ? `${y.o.points}점 · ` : ''}${y.o.wl}</small></td>` : `<td class="${cc(i).trim()}"></td>`;
      const body = Array.from({ length: n }, (_, k) => `<tr><td class="rk c ${k === 0 ? 'r1' : ''}">${k + 1}위</td>${cols.map((c, i) => cell(c.find(y => y.rank === k + 1), i)).join('')}</tr>`).join('');
      return `<div class="bcol rrb"><h4>${seasonLabel(l.season)}</h4><div class="bscr"><table class="rrt"><thead><tr><th class="c"></th>${rs.map((r, i) => `<th class="c${cc(i)}">${esc(r)}${cc(i) ? '<small>진행 중</small>' : ''}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
    };
    return `<div class="rrgrid">${ordBy(leaguesDesc(X), l => l.season).map(block).join('')}</div>`;
  }
  // 팀 항목별 순위: 정규 우승 · 최종 우승은 진행 중인 시즌을 빼고 센다
  const TR_METRICS = [
    { k: 'regW', l: '정규 우승', noCur: true, v: x => x.regS.length || null, f: v => `${v}회`, c: x => x.regS.map(l => seasonLabel(V._X.leagueOf[l].season).slice(0, 2)).join('·'), note: '정규리그 1위 시즌 수. 괄호 = 시즌.' },
    { k: 'finW', l: '최종 우승', noCur: true, v: x => x.finS.length || null, f: v => `${v}회`, c: x => x.finS.map(l => seasonLabel(V._X.leagueOf[l].season).slice(0, 2)).join('·'), note: '포스트시즌 우승 시즌 수. 괄호 = 시즌.' },
    { k: 'winRate', l: '승률', v: x => x.o.winRate, f: pct, c: x => `${x.o.win}승`, note: '경기 승률. 괄호 = 승수 (말풍선에 승-무-패).' },
    { k: 'setW', l: '세트승', v: x => x.o.setW, f: v => `${v}승`, c: x => pct(x.o.setRate), note: '세트 승수. 괄호 = 세트 승률.' },
    { k: 'avg', l: '에버', v: x => x.o.avg, f: f3, c: x => `${x.o.games}경기`, note: '팀 에버리지 (모든 세트 득점 ÷ 이닝).' },
    { k: 'long', l: '장타율', v: x => rr(x.long, x.inn), f: pct, c: x => `${x.long}회`, note: '팀 이닝 중 5점 이상 이닝 비율.' },
    { k: 'atk', l: '공격성공률', v: x => rr(x.succ, x.att), f: pct, note: '샷 기준: 성공(1점 + 뱅크샷 개수) ÷ 시도(성공 + 실패로 끝난 이닝).' },
    { k: 'bpts', l: '뱅크샷 총득점', v: x => x.bank * 2 || null, f: v => `${v}점`, c: x => `${x.bank}개`, note: '뱅크샷으로 낸 득점 합계 (1개 = 2점).' },
    { k: 'bankR', l: '뱅크샷 득점 비율', v: x => rr(x.bank * 2, x.runs), f: pct, c: x => `${x.bank * 2}점`, note: '팀 득점 중 뱅크샷 득점 비율.' },
    { k: 'setRatio', l: '세트득실비', v: x => x.o.setRatio, f: f3, c: x => `${x.o.setW}-${x.o.setL}`, note: '딴 세트 ÷ 내준 세트.' },
    { k: 'ptRatio', l: '점수득실비', v: x => x.o.ptRatio, f: f3, note: '득점 ÷ 실점.' },
    { k: 'clutch', l: '클러치 승률', v: x => rr(x.cl.w, x.cl.n), f: pct, c: x => `${x.cl.w}-${x.cl.n - x.cl.w}`, note: '이닝과 상관없이 두 팀 모두 목표 점수까지 남자 5점 · 여자 · 혼복 4점 이내로 남은 채 이어진 세트의 승률.' },
    { k: 'bankWin', l: '뱅킹 승률', v: x => x.o.bankRate, f: pct, c: x => `${x.o.bankW}-${x.o.bankL}`, note: '뱅킹(1세트 선공 결정)을 이긴 비율.' },
  ];
  function tMetricTab(X) {
    const M = TR_METRICS.find(x => x.k === V.trMetric) || TR_METRICS[0], ls = leaguesDesc(X);
    const col = (title, lg, cls = '', MM = M) => {
      const list = X.teamRankStats(lg).filter(x => MM.v(x) != null && !isNaN(MM.v(x))).sort((a, b) => MM.v(b) - MM.v(a) || b.o.winRate - a.o.winRate);
      const rows = list.map(x => ({ x, r: list.findIndex(y => MM.v(y) === MM.v(x)) + 1 })).filter(y => nameHit(teamNm(X, y.x.code), V.q));
      return `<div class="bcol${cls}"><h4>${title}<small>${list.length}팀</small></h4>${scrTbl('', rows.map(({ x, r }) => V.rkView === 'all' ? avRow(r, `<span class="tipn" data-tip2="ts|${lg || 'all'}|${esc(x.code)}">${esc(teamNm(X, x.code))}</span>`, `${MM.f(MM.v(x))}${MM.c ? `<small>(${MM.c(x)})</small>` : ''}`) : `<tr><td class="rk c ${r === 1 ? 'r1' : ''}">${r}위</td><td class="l nmc"><span class="tipn" data-tip2="ts|${lg || 'all'}|${esc(x.code)}">${esc(teamNm(X, x.code))}</span></td><td class="v${MM.c ? ' wv' : ''}">${MM.f(MM.v(x))}${MM.c ? `<small style="color:var(--sub);font-weight:500">(${MM.c(x)})</small>` : ''}</td></tr>`).join(''))}</div>`;
    };
    const blocks = V.rkView === 'all' ? TR_METRICS.map(m => col(m.l, null, '', m)).join('') : col('통산', null) + ls.map((l, i) => i === 0 && M.noCur ? '' : col(`${seasonLabel(l.season)}${i === 0 ? ' 이번 시즌' : ''}`, l.league, i === 0 ? ' cur' : '')).join('');
    return `<div class="bhead" style="padding:0 0 8px;border:0;flex-wrap:wrap">${viewSeg()}<div class="bseg" style="flex-wrap:wrap${V.rkView === 'all' ? ';display:none' : ''}">${TR_METRICS.map(x => `<button data-trm="${x.k}" class="${x === M ? 'on' : ''}">${x.l}</button>`).join('')}</div></div><div class="bcols many${V.rkView === 'all' ? ' allv' : ''}">${blocks}</div><div class="note">${V.rkView === 'all' ? '모든 항목의 통산 순위.' : M.note} 정규리그.</div>`;
  }
  function tRankTab(X) {
    const seg = `<div class="bseg" style="width:fit-content;margin-bottom:8px"><button data-trk="round" class="${!V.tRk || V.tRk === 'round' ? 'on' : ''}">라운드별 순위</button><button data-trk="season" class="${V.tRk === 'season' ? 'on' : ''}">시즌별 순위</button><button data-trk="metric" class="${V.tRk === 'metric' ? 'on' : ''}">항목별 순위</button></div>`;
    if (V.tRk === 'metric') return seg + tMetricTab(X);
    if (V.tRk !== 'season') return seg + tRoundRank(X) + '<div class="note">라운드 순위는 그 라운드 승점 → 승수 → 세트득실률 → 점수득실률로 계산합니다.</div>';
    const lsD = leaguesDesc(X), cols = ordBy(lsD, l => l.season).map(l => { const i = lsD.indexOf(l);   // 열 순서 = ⇄ 설정, i = 0 이번 시즌
      const st = X.standings(l.league).filter(s => nameHit(teamNm(X, s.code), V.q));
      return `<div class="bcol${i === 0 ? ' cur' : ''}"><h4>${seasonLabel(l.season)}${i === 0 ? '<small>이번 시즌</small>' : ''}</h4>${scrTbl('', st.map(s => { const o = X.tcalc(X.gamesOf(s.code, g => g.league === l.league && !g.post)); return `<tr><td class="rk c ${s.rank === 1 ? 'r1' : ''}">${s.rank}위</td><td class="l nmc"><span class="tipn" data-tip2="ts|${l.league}|${esc(s.code)}">${esc(teamNm(X, s.code))}</span></td><td class="v">${o.points != null ? o.points : o.wl}</td></tr>`; }).join(''))}</div>`;
    });
    return seg + `<div class="bcols many">${cols.join('')}</div>`;
  }
  // ── 팀리그 퍼펙트큐: 한 이닝에 세트 점수를 모두 친 세트 (개인투어와 같은 기준, 복식은 두 선수 모두의 기록) ──
  let perfCache = null;
  function perfList(X) {
    if (perfCache && perfCache.D === X.D) return perfCache.list;
    const list = [];
    X.D.games.forEach(raw => [raw.t1, raw.t2].forEach(side => X.persp(raw, side).sets.forEach(s => {
      if (!s.runs || !s.gp) return; const k = s.runs.findIndex(r => r >= s.gp); if (k < 0) return;
      // K더블 복식(이닝마다 번갈아 한 선수만 침): 그 이닝을 친 선수 한 명의 기록이라 진짜 퍼펙트큐(스카치)와 따로 표시. 1번 선수 = 홀수 이닝
      const kd = s.players.length === 2 && X.isKDouble(raw.season, s.kind);
      list.push({ raw, side, opp: side === raw.t1 ? raw.t2 : raw.t1, s, kd, shooter: kd ? s.players[k % 2] : null, inning: k + 1, date: String(raw.date || ''), season: raw.season, round: raw.post ? (raw.stage || 'PS') : raw.round_label });
    })));
    list.sort((a, b) => b.date.localeCompare(a.date));
    perfCache = { D: X.D, list };
    return list;
  }
  //  보기: 시즌별 · 라운드별(라운드 이름끼리, 포스트시즌은 단계) · 팀별 · 선수별(왼쪽 달성 선수 | 오른쪽 허용 선수) · 종목별(남단 · 여단 · 남복 · 여복 · 혼복, 선수별과 같은 2분할)
  //  검색어가 있으면 경기 목록도 2분할: 왼쪽 = 그 선수 · 팀이 달성, 오른쪽 = 허용
  const PF_KINDS = [['남단', '남자단식'], ['여단', '여자단식'], ['남복', '남자복식'], ['여복', '여자복식'], ['혼복', '혼합복식']];
  const pfRoundKey = r => { const m = String(r).match(/^(\d+)R$/); return m ? +m[1] : 100 + ['와일드카드', '준플레이오프', '플레이오프', '파이널'].indexOf(String(r).replace(/\s*\d+경기$/, '')); };
  function tPerfectTab(X) {
    const by = V.pfBy || 'season', kind = by.startsWith('k:') ? by.slice(2) : null, pl = by === 'player' || !!kind;
    const all = kind ? perfList(X).filter(x => x.s.kind === kind) : perfList(X), nm = c => teamNm(X, c), rl = x => String(x.round).replace(/\s*\d+경기$/, '');
    const groupsOf = x => by === 'season' ? [seasonLabel(x.season)] : by === 'round' ? [rl(x)] : by === 'team' ? [nm(x.side)] : x.kd ? [x.shooter] : x.s.players;
    const mk = f => { const m = {}; all.forEach(x => f(x).forEach(k => { (m[k] || (m[k] = [])).push(x); })); return m; };
    const m = mk(groupsOf), mo = pl ? mk(x => x.s.oppPlayers || []) : {};
    const order = mm => Object.keys(mm).sort((a, b) => by === 'season' ? b.localeCompare(a) : by === 'round' ? pfRoundKey(a) - pfRoundKey(b) : mm[b].length - mm[a].length || a.localeCompare(b));
    // 선택: 'a:이름' = 달성 쪽, 'o:이름' = 허용 쪽 (선수별), 그 밖에는 묶음 이름
    const selRaw = V.pfSel || null, isOpp = pl && selRaw && selRaw.startsWith('o:'), selK = pl && selRaw ? selRaw.slice(2) : selRaw;
    const selList = selRaw ? (isOpp ? mo[selK] : m[selK]) : null, sel = selList ? selK : null;
    const hitA = x => [nm(x.side), ...x.s.players].some(n => nameHit(n, V.q)), hitO = x => [nm(x.opp), ...(x.s.oppPlayers || [])].some(n => nameHit(n, V.q));
    const base = selList || all, rows = V.q ? base.filter(x => hitA(x) || hitO(x)) : base;
    const seg = `<div class="bseg" style="width:fit-content;margin-bottom:8px">${[['season', '시즌별'], ['round', '라운드별'], ['team', '팀별'], ['player', '선수별'], ...PF_KINDS.map(([l, k]) => ['k:' + k, l])].map(([k, l]) => `<button data-pfb="${k}" class="${by === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const kn = xs => xs.filter(x => x.kd).length;   // 그중 K더블 복식
    const sideCol = (title, mm, pre) => { const keys = order(mm).filter(k => !V.q || by === 'season' || by === 'round' || nameHit(k, V.q));   // 종목별은 선수 이름으로 거른다
      return `<div class="bcol pfside"><h4>${title}<small>${all.length}회</small></h4><div class="bscr"><table><tbody><tr data-pfs="" class="pfrow${selRaw ? '' : ' on'}"><td class="l">전체</td><td class="v">${all.length}회${kn(all) ? `<small class="kdn"> K${kn(all)}</small>` : ''}</td></tr>${keys.map(k => `<tr data-pfs="${esc(pre + k)}" class="pfrow${selRaw === pre + k ? ' on' : ''}"><td class="l">${esc(k)}</td><td class="v">${mm[k].length}회${kn(mm[k]) ? `<small class="kdn"> K${kn(mm[k])}</small>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`; };
    const side = pl ? `<div class="pf2">${sideCol('달성 선수', m, 'a:')}${sideCol('허용 선수', mo, 'o:')}</div>` : sideCol({ season: '시즌', round: '라운드', team: '팀' }[by], m, '');
    const title = `${kind ? `${esc(PF_KINDS.find(k => k[1] === kind)[0])} ` : ''}${sel ? `${esc(sel)}${pl ? ` <small>${isOpp ? '허용' : '달성'}</small>` : ''}` : '전체'}`;
    const tbl = rs => `<div class="bscr"><table class="gt"><thead><tr><th class="c">날짜</th><th class="c">라운드</th><th class="c">세트</th><th class="l">선수</th><th class="l">팀</th><th class="c">점수</th><th class="c">이닝</th><th class="l">상대</th></tr></thead><tbody>${rs.map((x, i) => `<tr${kind ? ` class="pfz${seasonIdx(x.season) % 2}${i && rs[i - 1].season !== x.season ? ' pfnew' : ''}"` : ''}><td class="c">${esc(x.date.slice(2, 10).replace(/-/g, '.'))}</td><td class="c">${esc(x.round)}</td><td class="c">${x.s.no}세트 <small>${esc(x.s.kind || '')}</small></td><td class="l wn">${x.kd ? `${x.s.players.map(n => n === x.shooter ? esc(n) : `<span class="kdp">${esc(n)}</span>`).join('·')} <span class="tag kd" title="K더블: ${esc(x.shooter)} 혼자 친 이닝 (스카치 퍼펙트큐 아님)">K더블</span>` : esc(x.s.players.join('·'))}</td><td class="l plain">${esc(nm(x.side))}</td><td class="c v">${x.s.pts}:${x.s.opp}</td><td class="c">${x.inning}이닝</td><td class="l plain">${esc(nm(x.opp))} <small>${esc((x.s.oppPlayers || []).join('·'))}</small></td></tr>`).join('') || '<tr><td class="l" colspan="8" style="color:var(--sub)">해당 없음</td></tr>'}</tbody></table></div>`;
    // 종목별: 경기 목록을 시즌마다 배경색 · 구분선으로 나누고, 제목 오른쪽에 시즌별 횟수 (예: 26시즌 7회)
    const seasonsAll = ordS([...new Set(perfList(X).map(x => x.season))]), seasonIdx = s => seasonsAll.indexOf(s);
    const bySeason = rs => kind ? `<span class="pfss">${seasonsAll.map(s => { const n = rs.filter(x => x.season === s).length; return n ? `<span>${seasonLabel(s).slice(0, 2)}시즌 <b>${n}회</b></span>` : ''; }).join('')}</span>` : '';
    // 검색 중: 왼쪽 달성 | 오른쪽 허용
    const list = V.q ? (() => { const A = base.filter(hitA), O = base.filter(hitO); return `<div class="pfl2"><div class="bcol"><h4>${title} · 달성<small>${A.length}회</small>${bySeason(A)}</h4>${tbl(A)}</div><div class="bcol"><h4>${title} · 허용<small>${O.length}회</small>${bySeason(O)}</h4>${tbl(O)}</div></div>`; })()
      : `<div class="bcol"><h4>${title}<small>${rows.length}회</small>${bySeason(rows)}</h4>${tbl(rows)}</div>`;
    return `${seg}<div class="pfw${pl ? ' two' : ''}">${side}${list}</div><div class="note">퍼펙트큐 = 한 이닝에 세트 점수를 모두 친 세트 (9 · 11 · 15점 세트, 포스트시즌 포함). 복식은 콤비의 기록으로 두 선수 모두에게 셉니다. <span class="tag kd">K더블</span> = 이닝마다 한 선수만 치는 K더블 복식(남복 23-24 · 여복 25-26 시즌까지)에서 그 이닝을 친 선수(초록 글씨) 혼자 세트 점수를 낸 것으로, 두 선수가 번갈아 친 스카치 퍼펙트큐와 다릅니다. 선수별 · 종목별 달성 선수는 K더블이면 친 선수 한 명에게만 셉니다. 횟수 옆 K = 그중 K더블. 라운드별은 모든 시즌의 같은 라운드를 묶습니다. 선수별: 왼쪽 = 달성, 오른쪽 = 허용(상대 선수).</div>`;
  }
  const tPlayerCache = {};
  let champCache = null;
  function champOf(X) {
    if (champCache && champCache.D === X.D) return champCache.m;
    const m = {};
    X.D.leagues.forEach(({ league: l }) => { const post = X.D.games.filter(g => g.league === l && g.post), teams = [...new Set(post.flatMap(g => [g.t1, g.t2]))], ch = teams.find(c => X.postResult(c, l) === '우승'); if (!ch) return;
      m[l] = new Set(post.filter(g => g.t1 === ch || g.t2 === ch).flatMap(g => X.persp(g, ch).sets.flatMap(s => s.players))); });
    champCache = { D: X.D, m }; return m;
  }
  function tPlayersOf(X, lg) {
    if (tPlayerCache.D !== X.D) { Object.keys(tPlayerCache).forEach(k => delete tPlayerCache[k]); tPlayerCache.D = X.D; }   // 새 팀 자료가 오면 옛 계산은 버린다
    const k = lg || 'all'; if (tPlayerCache[k]) return tPlayerCache[k];
    const gs = X.D.games.filter(g => !g.post && (!lg || g.league === lg)).flatMap(g => [X.persp(g, g.t1), X.persp(g, g.t2)]);
    const list = X.playerStats(gs), cm = champOf(X);
    list.forEach(p => { const ls = Object.keys(cm).filter(l => (!lg || +l === lg) && cm[l].has(p.name)); p.champ = ls.length; p.champS = ls.map(l => seasonLabel(X.D.leagues.find(x => x.league === +l).season).slice(0, 2)).join('·'); });
    return (tPlayerCache[k] = list);
  }
  // 선수 순위 항목: 이름 · 값 · 표시 · 작은 글씨 · 자격(시즌, 통산) · 설명. 같은 값이면 tie 순
  const rr = (a, b) => b ? a / b : null;
  // 경기(하루)별: two = 두 세트 이상 나온 경기, ww = 그중 두 세트 이상 이김, ll = 두 세트 이상 짐
  const d2 = p => { if (p._d2) return p._d2; const v = Object.values(p.gm || {}).filter(x => x.n >= 2); return (p._d2 = { two: v.length, ww: v.filter(x => x.w >= 2).length, ll: v.filter(x => x.n - x.w >= 2).length }); };
  const TP_METRICS = [
    { k: 'win', l: '승률', v: p => rr(p.w, p.n), f: pct, s: p => `${p.w}승 ${p.n - p.w}패`, min: p => p.n, m: [10, 30], tie: p => p.w, note: '세트 승률 순, 같으면 승수 순.' },
    { k: 'wins', l: '세트승', v: p => p.w, f: v => `${v}승`, c: p => pct(rr(p.w, p.n)), s: p => `${p.w}승 ${p.n - p.w}패 · 승률 ${pct(rr(p.w, p.n))}`, min: () => 1, m: [1, 1], tie: p => rr(p.w, p.n), note: '세트 승수 순, 같으면 승률 순. 괄호 = 세트 승률.' },
    { k: 'apps', l: '출전횟수', v: p => p.n, f: v => `${v}세트`, sl: p => `${p.n}세트/${Object.keys(p.gm || {}).length}경기`, s: p => `${p.n}세트 / ${Object.keys(p.gm || {}).length}경기 (경기당 ${(p.n / Math.max(1, Object.keys(p.gm || {}).length)).toFixed(2)}세트)`, min: () => 1, m: [1, 1], tie: p => Object.keys(p.gm || {}).length, note: '출전한 세트 수 순, 같으면 경기 수 순. 커서 = 세트/경기.' },
    { k: 'ww', l: '1일 2세트 승', v: p => d2(p).ww || null, f: v => `${v}회`, sl: p => `${d2(p).ww}회/${pct(rr(d2(p).ww, d2(p).two))}`, s: p => `${d2(p).ww}회 / ${pct(rr(d2(p).ww, d2(p).two))} (2세트 출전 ${d2(p).two}경기 중)`, min: () => 1, m: [1, 1], tie: p => rr(d2(p).ww, d2(p).two), note: '한 경기(하루)에 두 세트 이상 나와 두 세트 이상 이긴 횟수. 커서 = 두 세트 이상 나온 경기 중 비율.' },
    { k: 'll', l: '1일 2세트 패', v: p => d2(p).ll || null, f: v => `${v}회`, sl: p => `${d2(p).ll}회/${pct(rr(d2(p).ll, d2(p).two))}`, s: p => `${d2(p).ll}회 / ${pct(rr(d2(p).ll, d2(p).two))} (2세트 출전 ${d2(p).two}경기 중)`, min: () => 1, m: [1, 1], tie: p => rr(d2(p).ll, d2(p).two), note: '한 경기(하루)에 두 세트 이상 나와 두 세트 이상 진 횟수. 커서 = 두 세트 이상 나온 경기 중 비율.' },
    { k: 'avg', l: '에버', v: p => rr(p.single.p, p.single.i), f: f3, s: p => `${p.single.p}/${p.single.i}`, min: p => p.single.n, m: [5, 15], note: '단식 세트만 (복식은 선수별 이닝이 나뉘지 않음).' },
    { k: 'long', l: '장타율', v: p => rr(p.rk.long, p.single.i), f: pct, s: p => `${p.rk.long}/${p.single.i}`, min: p => p.single.n, m: [5, 15], note: '단식 이닝 중 5점 이상 이닝 비율.' },
    { k: 'atk', l: '공격성공률', v: p => rr(p.rk.succ, p.rk.att), f: pct, s: p => `${p.rk.succ}/${p.rk.att}`, min: p => p.n, m: [10, 30], note: '단식 · 복식 전체 성공 ÷ 시도.' },
    { k: 'bpts', l: '뱅크샷 총득점', v: p => p.rk.bank * 2, f: v => `${v}점`, s: p => `${p.rk.bank}개`, min: () => 1, m: [1, 1], note: '단식 · 복식에서 뱅크샷으로 낸 득점 합계 (성공 1개 = 2점).' },
    { k: 'sratio', l: '세트 득실비', v: p => p.n - p.w ? rr(p.w, p.n - p.w) : null, f: f3, c: p => `${p.w}-${p.n - p.w}`, s: p => `${p.w}승 ${p.n - p.w}패`, min: p => p.n, m: [10, 30], note: '이긴 세트 ÷ 진 세트.' },
    { k: 'ratio', l: '점수득실비', v: p => rr(p.rk.pts, p.rk.opp), f: f3, s: p => `${p.rk.pts}:${p.rk.opp}`, min: p => p.n, m: [10, 30], note: '출전 세트의 득점 ÷ 실점 (복식은 팀 점수).' },
    { k: 'fb', l: '초구 성공률', v: p => p.fbS ? rr(p.fbS.w, p.fbS.n) : null, f: pct, c: p => `${p.fbS.n}번`, s: p => `${p.fbS.w}/${p.fbS.n}`, min: p => p.fbS ? p.fbS.n : 0, m: [5, 15], note: '단식 선공 세트 첫 이닝 득점 비율 (복식은 첫 샷 선수 기록이 없어 제외).' },
    { k: 'clutch', l: '클러치 승률', v: p => rr(p.rk.cl.w, p.rk.cl.n), f: pct, s: p => `${p.rk.cl.w}승 ${p.rk.cl.n - p.rk.cl.w}패`, min: p => p.rk.cl.n, m: [3, 10], note: '이닝과 상관없이 두 팀 모두 목표 점수까지 남은 점수가 남자 세트 5점 · 여자 · 혼복 세트 4점 이내인 채 세트가 이어진 세트의 승률.' },
    { k: 'champ', l: '우승 횟수', noCur: true, v: p => p.champ || null, f: v => `${v}회`, c: p => p.champS, s: p => `${p.champ}회 (${p.champS} 시즌)`, min: () => 1, m: [1, 1], tie: p => p.n, note: '팀리그 포스트시즌 우승 팀에서 포스트시즌 경기에 나온 시즌 수. 괄호 = 시즌.' },
    { k: 'bankR', l: '뱅크샷 득점 비율', v: p => rr(p.rk.bank * 2, p.rk.own), f: pct, c: p => `${p.rk.bank}개`, s: p => `${p.rk.bank * 2}점 / ${p.rk.own}점`, min: p => p.n, m: [10, 30], note: '본인 득점 중 뱅크샷 득점 비율 (팀리그 자료에는 뱅크샷 시도 수가 없어 성공률 대신).' },
    { k: 'bankWin', l: '뱅킹 승률', v: p => p.bk ? rr(p.bk.w, p.bk.n) : null, f: pct, c: p => `${p.bk.w}-${p.bk.n - p.bk.w}`, s: p => `${p.bk.w}승 ${p.bk.n - p.bk.w}패`, min: p => p.bk ? p.bk.n : 0, m: [3, 10], note: '1세트 뱅킹 주자로 나가 이긴 비율 (이기면 1세트 선공).' },
  ];
  const TP_GAMES = 10, tpGames = p => Object.keys(p.gm || {}).length;   // 순위 자격: 10경기 이상
  const TP_ORDER = ['champ', 'apps', 'win', 'wins', 'ww', 'll', 'avg', 'long', 'atk', 'bpts', 'bankR', 'sratio', 'ratio', 'clutch', 'bankWin', 'fb'];
  TP_METRICS.sort((a, b) => TP_ORDER.indexOf(a.k) - TP_ORDER.indexOf(b.k));
  function tPlayerTab(X) {
    const M = TP_METRICS.find(x => x.k === V.tMetric) || TP_METRICS[0];
    // 순위 자격: 그 기간 10경기(하루 = 1경기) 이상 (항목별 최소 세트 수는 쓰지 않음). 미달 선수는 순위 칸에 경기 수 못 채운 선수는 순위 없이 두 줄 띄고 맨 아래에 따로 (통산 TOP20 보기는 자격 선수만)
    const col = (title, lg, min, cls = '', MM = M) => {
      const sorter = (a, b) => MM.v(b) - MM.v(a) || (MM.tie ? MM.tie(b) - MM.tie(a) : 0) || b.n - a.n;
      const pool = tPlayersOf(X, lg).filter(p => p.gender === V.gender && MM.v(p) != null), ok = p => tpGames(p) >= TP_GAMES;
      const list = pool.filter(ok).sort(sorter), below = V.rkView === 'all' ? [] : pool.filter(p => !ok(p)).sort(sorter).filter(p => nameHit(p.name, V.q));
      const rows = list.map(p => ({ p, r: list.findIndex(x => MM.v(x) === MM.v(p)) + 1 })).filter(x => nameHit(x.p.name, V.q));
      const valH = p => `${MM.f(MM.v(p))}${MM.c ? `<small style="color:var(--sub);font-weight:500">(${MM.c(p)})</small>` : ''}`;
      const belowH = below.length ? `<tr class="tpgap"><td colspan="3"></td></tr><tr class="tpgap"><td colspan="3"></td></tr>` + below.map(p => `<tr class="tpbelow"><td class="rk c" title="순위 기준 미달 (${TP_GAMES}경기 미만)">${tpGames(p)}경기</td><td class="l nmc"><span class="tipn" data-tip2="tp|${lg || 'all'}|${esc(p.name)}|${MM.k}">${esc(p.name)}</span></td><td class="v${MM.c || MM.sl ? ' wv' : ''}">${valH(p)}</td></tr>`).join('') : '';
      return `<div class="bcol${cls}"><h4>${title}<small>${list.length}명${below.length ? ` · 미달 ${below.length}` : ''}</small></h4>${scrTbl('', (V.q ? rows : rows.slice(0, V.rkView === 'all' ? 20 : 50)).map(({ p, r }) => V.rkView === 'all' ? avRow(r, `<span class="tipn" data-tip2="tp|${lg || 'all'}|${esc(p.name)}|${MM.k}">${esc(nm4(p.name))}</span>`, MM.sl ? MM.sl(p) : `${MM.f(MM.v(p))}${MM.c ? `<small>(${MM.c(p)})</small>` : ''}`) : `<tr><td class="rk c ${r === 1 ? 'r1' : ''}">${r}위</td><td class="l nmc"><span class="tipn" data-tip2="tp|${lg || 'all'}|${esc(p.name)}|${MM.k}">${esc(p.name)}</span></td><td class="v${MM.c || MM.sl ? ' wv' : ''}">${valH(p)}</td></tr>`).join('') + belowH)}</div>`;
    };
    const ls = leaguesDesc(X), blocks = V.rkView === 'all' ? TP_METRICS.map(m => col(m.l, null, m.m[1], '', m)).join('') : col('통산', null, M.m[1]) + ordBy(ls, l => l.season).map(l => [l, ls.indexOf(l)]).map(([l, i]) => (i === 0 && M.noCur ? '' : col(`${seasonLabel(l.season)}${i === 0 ? ' 이번 시즌' : ''}`, l.league, M.m[0], i === 0 ? ' cur' : ''))).join('');
    return `<div class="bhead" style="padding:0 0 8px;border:0;flex-wrap:wrap">${viewSeg()}<div class="bseg" style="flex-wrap:wrap${V.rkView === 'all' ? ';display:none' : ''}">${TP_METRICS.map(x => `<button data-tm="${x.k}" class="${x === M ? 'on' : ''}">${x.l}</button>`).join('')}</div></div><div class="bcols many${V.rkView === 'all' ? ' allv' : ''}">${blocks}</div><div class="note">${V.rkView === 'all' ? '모든 항목의 통산 TOP20 (순위 자격은 시즌별 보기의 각 항목 설명과 같음).' : M.note} 순위는 그 기간 ${TP_GAMES}경기 이상 나온 선수만, 못 채운 선수는 맨 아래 '미달'. 정규리그.</div>`;
  }
  function tGamesTab(X) {
    const ls = leaguesDesc(X); if (V.tLg == null) V.tLg = ls[0].league;
    const inL = V.tLg === 'all' ? X.D.games : X.D.games.filter(g => g.league === V.tLg);
    const rl = g => g.post ? (g.stage || 'PS') : g.round_label;
    const rounds = [...new Set(inL.map(rl))]; if (V.tRound && !rounds.includes(V.tRound)) V.tRound = '';
    const teams = [...new Set(inL.flatMap(g => [g.t1, g.t2]))].sort((a, b) => teamNm(X, a).localeCompare(teamNm(X, b)));
    if (V.tTeam && !teams.includes(V.tTeam)) V.tTeam = '';
    const list = inL.filter(g => (!V.tRound || rl(g) === V.tRound) && (!V.tTeam || g.t1 === V.tTeam || g.t2 === V.tTeam) && (!V.q || g.sets.some(s => s.p.flat().some(n => nameHit(n, V.q))))).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const shown = list.slice(0, 300); V._tg = shown;
    return `<div class="bhead" style="padding:0 0 6px;border:0"><select data-bs="tLg"><option value="all" ${V.tLg === 'all' ? 'selected' : ''}>전체 시즌</option>${ls.map(l => `<option value="${l.league}" ${l.league === V.tLg ? 'selected' : ''}>${seasonLabel(l.season)} 시즌</option>`).join('')}</select>
      <select data-bs="tRound"><option value="">전체 라운드</option>${rounds.map(r => `<option ${r === V.tRound ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <select data-bs="tTeam"><option value="">전체 팀</option>${teams.map(c => `<option value="${esc(c)}" ${c === V.tTeam ? 'selected' : ''}>${esc(teamNm(X, c))}</option>`).join('')}</select><span style="color:var(--sub);font-size:12px">${list.length.toLocaleString()}경기${list.length > 300 ? ' · 최근 300' : ''}</span></div>
      <table class="gt"><thead><tr><th class="c">날짜</th><th class="c">라운드</th><th>왼쪽 팀</th><th class="c">세트</th><th class="l">오른쪽 팀</th></tr></thead><tbody>${shown.map(g => { const k = 't' + g.id, open = V.open === k; return `<tr class="gr" data-gk="${k}" data-tip2="tg|${g.id}"><td class="c">${esc(String(g.date).slice(2, 10).replace(/-/g, '.'))}</td><td class="c">${esc(rl(g))}</td><td class="${wnc(g.s1, g.s2)}">${esc(teamNm(X, g.t1))}</td><td class="c v">${g.s1}:${g.s2}</td><td class="l ${wnc(g.s2, g.s1)}">${esc(teamNm(X, g.t2))}</td></tr>${open ? `<tr class="det"><td colspan="5">${tSets(g)}</td></tr>` : ''}`; }).join('')}</tbody></table>`;
  }
  const tSets = g => `<table class="settab"><tbody>${g.sets.map(s => `<tr><td>${s.no}세트</td><td class="${s.win === 1 ? 'wn' : ''}" style="text-align:right">${esc(s.p[0].join('·'))}</td><td><b>${s.pts[0]}:${s.pts[1]}</b></td><td class="${s.win === 2 ? 'wn' : ''}" style="text-align:left">${esc(s.p[1].join('·'))}</td></tr>`).join('')}</tbody></table>`;
  function teamTip(X, a, b, c, mk) {
    if (a === 'tg') { const g = (V._tg || []).find(x => String(x.id) === b); return g ? `<div class="rkh0">${esc(teamNm(X, g.t1))} ${g.s1}:${g.s2} ${esc(teamNm(X, g.t2))} <small>${esc(String(g.date).slice(0, 10))}</small></div>${tSets(g).replace('class="settab"', '')}` : ''; }
    if (a === 'ts') { const lg = b === 'all' ? null : +b, o = X.tcalc(X.gamesOf(c, g => (lg == null || g.league === lg) && !g.post)), pr = lg ? X.postRank(c, lg) : null; return `<div class="rkh0">${esc(teamNm(X, c))}</div><table><tr><td>승패</td><td></td><td>${o.wl}</td></tr>${o.points != null ? `<tr><td>승점</td><td></td><td>${o.points}</td></tr>` : ''}<tr><td>세트</td><td></td><td>${o.setW}-${o.setL}</td></tr><tr><td>팀 에버</td><td></td><td>${f3(o.avg)}</td></tr>${pr ? `<tr><td>포스트시즌</td><td></td><td>${pr}위</td></tr>` : ''}</table>`; }
    if (a === 'tp') { const p = tPlayersOf(X, b === 'all' ? null : +b).find(x => x.name === c); const M = TP_METRICS.find(x => x.k === (mk || V.tMetric)) || TP_METRICS[0]; return p ? `<div class="rkh0">${esc(p.name)}</div><table><tr><td>${M.l}</td><td></td><td>${M.v(p) == null ? '–' : `${M.f(M.v(p))} (${M.s(p)})`}</td></tr><tr><td>경기</td><td></td><td>${tpGames(p)}경기${tpGames(p) < TP_GAMES ? ' (순위 기준 미달)' : ''}</td></tr><tr><td>세트</td><td></td><td>${p.w}-${p.n - p.w}</td></tr><tr><td>단식</td><td></td><td>${p.single.n ? `${p.single.w}-${p.single.n - p.single.w}` : '–'}</td></tr><tr><td>단식 에버</td><td></td><td>${p.single.i ? f3(p.single.p / p.single.i) : '–'}</td></tr><tr><td>복식</td><td></td><td>${p.double.n ? `${p.double.w}-${p.double.n - p.double.w}` : '–'}</td></tr></table>` : ''; }
    return '';
  }

  let renderNo = 0;
  // 리그 검색: 예시 버튼은 늘 위에, 답은 질문마다 카드로 쌓인다(새 답이 위). 카드 ✕ · '모두 지우기'로만 없어진다
  //  쌓인 질문은 localStorage 에 두어 화면이 새로고침돼도 남는다 (답은 그때 기록으로 다시 계산)
  const LQA_KEY = 'pba_lqa';
  const lqaList = () => { try { return JSON.parse(localStorage.getItem(LQA_KEY) || '[]'); } catch (e) { return []; } };
  const lqaSave = xs => { try { localStorage.setItem(LQA_KEY, JSON.stringify(xs.slice(0, 30))); } catch (e) {} };
  const lqaAdd = q => { q = String(q || '').trim(); if (!q) return; lqaSave([q, ...lqaList().filter(x => x !== q)]); };
  // 리그 검색 항목 칸 (상위 항목 → 하위 질문, 검색칸에 쓰는 대로 맞는 하위 항목). 다시 그리지 않고 이 칸만 바꾼다
  //  V.lqSt = 상위 항목 켜짐(qaSt), V.q = 쓰는 중인 글자. 질문을 보내면(누름 · Enter) 보이던 항목을 굳힌다(lqaFreeze)
  const lqaSt = () => V.lqSt || (V.lqSt = qaSt());
  const lqaPickHtml = () => qaPick(TeamApp.leagueQACats(V.q), V.q, lqaSt(), 'data-lqa');
  const lqaFreeze = () => qaFreeze(TeamApp.leagueQACats(V.q), V.q, lqaSt());
  const lqaPickUpd = () => { const el = box.querySelector('.lqaex'); if (el) el.innerHTML = lqaPickHtml(); };
  function tQaTab() {
    const xs = lqaList();
    return `<div class="lqabox"><div class="lqaex qaex">${lqaPickHtml()}</div>${xs.length ? '<div class="lqaclrw"><button class="lqaclr" data-lqclr>모두 지우기</button></div>' : ''}${xs.length ? xs.map((q, i) => `<div class="lqac"><button class="lqax" data-lqx="${i}" title="이 답 지우기">✕</button>${TeamApp.leagueQA(q)}</div>`).join('') : '<div class="qahelp">위 예시를 누르거나 검색칸에 질문을 쓰고 Enter.</div>'}</div>`;
  }
  async function renderBody() {
    const my = ++renderNo, body = box.querySelector('.bbody');
    hideRkBub();
    if (V.tab[0] === 't' && V.tab !== 'top') {
      const X = window.TeamApp && TeamApp.boardData && TeamApp.boardData();
      if (!X) { body.innerHTML = '<div class="empty">팀리그 자료를 불러오는 중입니다. 잠시 뒤 다시 눌러 주세요.</div>'; return; }
      V._X = X;
      if (V.tab === 'tqa') { body.innerHTML = tQaTab(); return; }
      body.innerHTML = V.tab === 'tsched' ? tSchedTab(X) : V.tab === 'trank' ? tRankTab(X) : V.tab === 'tplayer' ? tPlayerTab(X) : V.tab === 'tperfect' ? tPerfectTab(X) : tGamesTab(X);
      return;
    }
    const need = V.tab === 'top' || V.tab === 'games';
    if ((need && !leagueCache[V.type]) || !boards[V.type]) body.innerHTML = '<div class="empty">자료를 불러오는 중…</div>';
    const B = await getBoard(V.type);
    if (my !== renderNo) return;
    if (!B) { body.innerHTML = '<div class="empty">자료를 불러오지 못했습니다.</div>'; return; }
    V._B = B;
    if (V.tab === 'points' || V.tab === 'prize') { body.innerHTML = moneyTab(B); return; }
    if (V.tab === 'sched') { body.innerHTML = schedTab(B); return; }
    if (V.tab === 'irec') { if (!leagueCache[V.type]) body.innerHTML = '<div class="empty">자료를 불러오는 중…</div>'; const L2 = await league(V.type); if (my !== renderNo) return; body.innerHTML = irecTab(B, L2); return; }
    const L = await league(V.type); if (my !== renderNo) return;
    const Aw = V.tab === 'top' ? await (awardsCache[V.type] || (awardsCache[V.type] = api('/api/awards?type=' + encodeURIComponent(V.type)))) : null; if (my !== renderNo) return;
    body.innerHTML = V.tab === 'top' ? topTab(B, L, Aw) : gamesTab(B, L);
  }
  function render() {
    if (!isGamesTab(V.tab)) lastRank[isTeamApp() ? 't' : 'i'] = V.tab;
    markHb();
    box.innerHTML = `<div class="bhead"><div class="btabs">${tabsNow().map(([k, l]) => `<button data-btab="${k}" class="${V.tab === k ? 'on' : ''}">${l.replace(/\[(.+?)\]/g, '<span class="hl">$1</span>')}</button>`).join('')}</div>
      ${isTeamApp() ? (V.tab === 'tplayer' ? `<div class="bseg"><button data-bg="M" class="${V.gender === 'M' ? 'on' : ''}">남자</button><button data-bg="F" class="${V.gender === 'F' ? 'on' : ''}">여자</button></div>` : '') : `<div class="bseg"><button data-bt="PBA" class="${V.type === 'PBA' ? 'on' : ''}">PBA</button><button data-bt="LPBA" class="${V.type === 'LPBA' ? 'on' : ''}">LPBA</button></div>`}
      <input class="bq" placeholder="${V.tab === 'tqa' ? '리그 기록 질문 (예: 최다 연승, 이번 시즌 역전승)' : V.tab === 'tperfect' ? '선수 · 팀 검색 (초성 가능)' : V.tab === 'trank' || V.tab === 'tsched' ? '팀 검색 (초성 가능)' : '선수 검색 (초성 가능)'}" value="${esc(V.q)}" autocomplete="off"><button class="bx" data-bx>✕</button></div><div class="bbody"></div>`;
    renderBody();
  }
  const close = () => { box.hidden = true; hideRkBub(); markHb(); };
  // 머리줄 '순위' · '경기 결과' 중 지금 열린 쪽을 흰 바탕으로
  function markHb() { hb.querySelectorAll('[data-bopen]').forEach(b => b.classList.toggle('on', !box.hidden && (b.dataset.bopen === 'rank' ? !isGamesTab(V.tab) : V.tab === b.dataset.bopen))); }
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-bopen]');
    if (o) { const k = o.dataset.bopen, rank = k === 'rank'; const same = !box.hidden && (rank ? !isGamesTab(V.tab) : V.tab === k); if (same) { close(); return; } V.tab = rank ? lastRank[isTeamApp() ? 't' : 'i'] : k; const a = typeof panes !== 'undefined' && panes.a.data; if (box.hidden && a && a.player.type) V.type = a.player.type; box.hidden = false; render(); return; }
    if (box.hidden) return;
    if (!box.contains(e.target)) { close(); return; }   // 창 밖을 누르면 닫힘
    if (e.target.closest('[data-bx]')) { close(); return; }
    const t = e.target.closest('[data-btab]'); if (t) { V.tab = t.dataset.btab; V.open = null; render(); return; }
    const bg = e.target.closest('[data-bg]'); if (bg) { V.gender = bg.dataset.bg; render(); return; }
    const pfb = e.target.closest('[data-pfb]'); if (pfb) { V.pfBy = pfb.dataset.pfb; V.pfSel = null; renderBody(); return; }
    const pfs = e.target.closest('[data-pfs]'); if (pfs) { V.pfSel = pfs.dataset.pfs || null; renderBody(); return; }
    const trk = e.target.closest('[data-trk]'); if (trk) { V.tRk = trk.dataset.trk; renderBody(); return; }
    const wo = e.target.closest('[data-wo]'); if (wo) { V.topOld = wo.dataset.wo === 'old'; renderBody(); return; }
    // 리버스 스윕 보기(전체 · 시즌별 · 팀별): 다시 그리지 않고 그 카드 안에서 표만 바꾼다
    const rsv = e.target.closest("[data-rsv]");
    if (rsv) { const c = rsv.closest('.lqac'), k = rsv.dataset.rsv; try { localStorage.setItem('pba_rsview', k); } catch (er) {} c.querySelectorAll('[data-rsv]').forEach(b => b.classList.toggle("on", b === rsv)); c.querySelectorAll('table.rsv').forEach(t => { t.hidden = t.dataset.v !== k; }); return; }
    const lqc = e.target.closest('.lqaex [data-qcat]'); if (lqc) { qaToggle(TeamApp.leagueQACats(V.q), V.q, lqaSt(), lqc.dataset.qcat); lqaPickUpd(); return; }
    const lq = e.target.closest('[data-lqa]'); if (lq) { lqaFreeze(); lqaAdd(lq.dataset.lqa); renderBody(); return; }
    const lqx = e.target.closest('[data-lqx]'); if (lqx) { const xs = lqaList(); xs.splice(+lqx.dataset.lqx, 1); lqaSave(xs); renderBody(); return; }
    if (e.target.closest('[data-lqclr]')) { lqaSave([]); renderBody(); return; }
    const tm = e.target.closest('[data-tm]'); if (tm) { V.tMetric = tm.dataset.tm; render(); return; }
    const im = e.target.closest('[data-im]'); if (im) { V.iMetric = im.dataset.im; renderBody(); return; }
    const tp = e.target.closest('[data-tpick]'); if (tp) { const [a, b2, lg] = tp.dataset.tpick.split('|'); if (window.TeamApp && TeamApp.selectPair) TeamApp.selectPair(a, b2, +lg); close(); if (typeof window.sheetLoadOrder === 'function') window.sheetLoadOrder(); return; }   // 기록지(캐스터 앱)에 그 경기 오더
    const trm = e.target.closest('[data-trm]'); if (trm) { V.trMetric = trm.dataset.trm; renderBody(); return; }
    const rv = e.target.closest('[data-rv]'); if (rv) { V.rkView = rv.dataset.rv; renderBody(); return; }
    const b = e.target.closest('[data-bt]'); if (b) { V.type = b.dataset.bt; V.season = null; V.seq = ''; V.round = ''; V.open = null; render(); return; }
    const p = e.target.closest('[data-bp]'); if (p) { close(); panes.a.load(p.dataset.bp); return; }   // 선수 이름 = 왼쪽 칸에 열기
    const tr = e.target.closest('[data-tour]'); if (tr) { const [s, q] = tr.dataset.tour.split('|'); V.season = +s; V.seq = q; V.round = ''; V.tab = 'games'; render(); return; }
    const g = e.target.closest('[data-gk]'); if (g) { V.open = V.open === g.dataset.gk ? null : g.dataset.gk; renderBody(); return; }
    if (isBlankClick(e)) close();   // 데이터 없는 공간을 누르면 닫힘
  });
  box.addEventListener('input', e => { if (e.target.matches('.bq')) { V.q = e.target.value; if (V.tab !== 'tqa') renderBody(); else { V.lqSt = qaSt(); lqaPickUpd(); } } });   // 리그 검색은 Enter 로 질문 (쓰는 동안엔 항목 칸만)
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && V.tab === 'tqa' && e.target.matches('.bq')) { lqaFreeze(); lqaAdd(e.target.value); e.target.value = ''; V.q = ''; renderBody(); } });
  box.addEventListener('change', e => { const s = e.target.closest('[data-bs]'); if (!s) return; const k = s.dataset.bs; V[k] = k === 'season' || k === 'tLg' ? (s.value === 'all' ? 'all' : +s.value) : s.value; if (k === 'season') { V.seq = ''; V.round = ''; } if (k === 'seq') V.round = ''; V.open = null; renderBody(); });
  // 커서 말풍선
  let tipFor2 = null;
  // 말풍선을 커서 오른쪽 아래에 붙인다 (화면 밖이면 반대쪽으로)
  function followTip(e) {
    const w = rkBub.offsetWidth, h = rkBub.offsetHeight, x = e.clientX + 14 + w > innerWidth - 4 ? e.clientX - 14 - w : e.clientX + 14, y = e.clientY + 14 + h > innerHeight - 4 ? Math.max(4, e.clientY - 14 - h) : e.clientY + 14;
    rkBub.style.left = Math.max(4, x) + 'px'; rkBub.style.top = y + 'px';
  }
  box.addEventListener('mouseover', e => {
    const c = e.target.closest('[data-tip2]'); if (!c || c === tipFor2) return; tipFor2 = c;
    const [k, a, b, mk] = c.dataset.tip2.split('|'), B = V._B; let h = '';
    if (k[0] === 't' && k !== 'tour' && k !== 't') h = teamTip(V._X, k, a, b, mk);
    if (k === 'ir') h = irecTip(a, b);
    if (k === 'tour' || k === 'all' || /^s\d+$/.test(k)) h = moneyTip(B, k, a);
    else if (k === 'g') { const g = V._games && V._games[a + '|' + b]; if (g) h = gameTip(g); }
    else if (k === 't') { const t = B.tours.find(x => x.code === +a), aw = B.awards.find(x => x.tour === +a); if (t) h = `<div class="rkh0">${esc(t.name)}</div><table><tr><td>기간</td><td></td><td>${esc(t.start || '')} ~ ${esc(t.end_date || '')}</td></tr><tr><td>우승</td><td></td><td>${esc(t.winner || '–')}</td></tr>${aw ? `<tr><td>톱랭킹</td><td></td><td>${esc(aw.player_name)} ${f3(aw.avg)}</td></tr>` : ''}</table>`; }
    else if (k === 'r') { const g = (V._sch || []).filter(x => x.round === a); const nm = c2 => { const T = window.TeamApp && TeamApp.shortName ? TeamApp.shortName(c2) : c2; return esc(T); }; const left = g.filter(x => !x.done).slice(0, 12); h = `<div class="rkh0">${esc(a)} <small>남은 경기 ${g.filter(x => !x.done).length}</small></div><table>${left.map(x => `<tr><td>${esc(String(x.date).slice(5))}</td><td>${esc(x.time || '')}</td><td>${nm(x.t1)} : ${nm(x.t2)}</td></tr>`).join('') || '<tr><td>모두 끝남</td></tr>'}</table>`; }
    if (h) { showRkBub(c, h); followTip(e); } else hideRkBub();
  });
  box.addEventListener('mousemove', e => { if (tipFor2 && !rkBub.hidden) followTip(e); });
  box.addEventListener('mouseout', e => { const c = e.target.closest('[data-tip2]'); if (c && !c.contains(e.relatedTarget)) { tipFor2 = null; hideRkBub(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });
})();
