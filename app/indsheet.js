// 캐스터 기록지 · 개인투어 경기 브리핑과 라이브 정보 (팀리그 기록지와 같은 모양, team.js 의 TeamApp.sheet* 에 해당)
//  자료 = 같은 종목 전체 경기(/api/league, 기권 제외)의 1:1 세트 경기. 이번 시즌 · 통산, 순위는 같은 종목 선수 중 (시즌 3 · 통산 5번 이상, 초구는 5 · 20번)
//  세트 스코어는 선승 세트 수(경기 target)가 같은 경기끼리 센다 (3선승의 2:2 와 4선승의 2:2 는 다르다)
//  합 · 세 · 단 (기록지 설정 줄, setKind): 합 = 세트제 + 25점 단판(경기 승패 · 에버 · 초구 · 선후공 · 뱅킹 · 공격 성공률은 단판 포함, 세트 승률 · 스코어별 · 흐름은 세트제만),
//   세 = 세트제만, 단 = 25점 단판만(한 세트짜리 경기로). 세트 승률은 홈피처럼 옛 월드챔피언십 조별예선 세트를 뺀다
(function () {
  const C = {}, P = {};   // 종목 → 집계 / 불러오는 중
  const z = () => ({ w: 0, n: 0 }), add = (x, w) => { x.n++; if (w) x.w++; }, addK = (m, k, w) => add(m[k] || (m[k] = z()), w);
  // 세트 결과 순서별 다음 세트 기록: 에버 · 세트 승률 · 초구 성공률
  const addX = (m, k, s) => { const o = m[k] || (m[k] = { w: 0, n: 0, p: 0, i: 0, fbN: 0, fbH: 0 }); add(o, s.win); o.p += s.pts || 0; o.i += s.inn || 0; if (s.first && s.first_ball != null) { o.fbN++; if (s.first_ball > 0) o.fbH++; } };
  const blank = () => ({ st: {}, tr: {}, sq: {}, gsq: {}, no: {}, gs: {}, gtr: {}, fbSt: {}, game: z(), set: z(), fst: z(), snd: z(), fb: z(), fbN: 0, fbP: 0, fbM: 0, fbOk: z(), fbMiss: z(), fb3: z(),
    ofbOk: z(), ofbMiss: z(), al3: z(), tie: z(), keep: z(), back: z(), cl: z(), bank: z(), wh: z(), ye: z(), pts: 0, inn: 0, recent: [], tb: tbNew(), sh: 0, sa: 0, tfb: z(), tfbOk: z(), tfbMiss: z(), tofbOk: z(), tofbMiss: z() });
  const FB_KEYS = new Set(['fb', 'avg', 'multi', 'fbOk', 'fbMiss', 'fb3', 'ofbOk', 'ofbMiss', 'al3']), FB_MIN = [5, 20];
  const rt = x => x && x.n ? x.w / x.n : null, cn = x => x ? x.n : 0;
  const rankIn = (pool, me, sc, val, cnt, mins = [3, 5]) => { const mv = me ? val(me[sc]) : null; if (mv == null) return ''; const min = sc === 's' ? mins[0] : mins[1]; return `${1 + pool.filter(x => x !== me && cnt(x[sc]) >= min && val(x[sc]) != null && val(x[sc]) > mv).length}위`; };
  const rk2 = (D, me, val, cnt, mins) => ['s', 'a'].map(sc => rankIn(D.pool, me, sc, val, cnt, mins));
  const UI = () => window.TeamApp && TeamApp.sheetUI;

  let kind = 'sum';
  const wcOld = g => typeof wcGroupOld === 'function' && wcGroupOld(g);
  function build(type, L, kind) {
    const all = L.games.filter(g => g.sets && g.sets.length);
    const gs = kind === 'set' ? all.filter(g => !g.single) : kind === 'single' ? all.filter(g => g.single).map(g => ({ ...g, single: false })) : all;
    const cur = Math.max(...all.map(g => g.season));
    const idx = {}; gs.forEach(g => { idx[`${g.tour}|${g.round_code}|${g.player}|${g.opp}`] = g; });
    const cg = all.filter(g => g.season === cur).reduce((m, g) => !m || String(g.date) > String(m.date) ? g : m, null), curTour = cg ? cg.tour : null;   // 이번 대회 = 이번 시즌 가장 최근 경기의 대회
    const E = {}, byName = {}, last = {}, lg = { fst: z(), after: {} };   // lg = 리그 전체 승부치기: 선공 승률 · 선공 초구 n점 뒤 후공 승률 (선공 쪽 기록으로 한 번씩)
    gs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(g => {
      const e = E[g.player] || (E[g.player] = { id: g.player, name: g.player_name, s: blank(), a: blank(), h2h: {}, tourFb: z() });
      if (!last[g.player_name] || g.season >= last[g.player_name]) { byName[g.player_name] = g.player; last[g.player_name] = g.season; }
      const og = idx[`${g.tour}|${g.round_code}|${g.opp}|${g.player}`], T = g.target || Math.max(g.sw, g.sl), xs = g.season === cur ? [e.s, e.a] : [e.a];
      const hx = e.h2h[g.opp] || (e.h2h[g.opp] = { s: { w: 0, sw: 0, n: 0 }, a: { w: 0, sw: 0, n: 0 } });
      (g.season === cur ? [hx.s, hx.a] : [hx.a]).forEach(h => { h.n++; if (g.win) h.w++; h.sw += g.sw || 0; });
      xs.forEach(x => { add(x.game, g.win); if (g.ball === 'ㅎ' || g.ball === 'ㄴ') { add(x.bank, g.ball === 'ㅎ'); add(g.ball === 'ㅎ' ? x.wh : x.ye, g.win); } });
      e.a.recent.push(g); if (g.season === cur) e.s.recent.push(g);
      // 승부치기 초구: 내가 선공 = 초구 성공률 · 초성/초실 승률, 후공 = 상대 초구(상대 쪽 기록) 성공/실패 뒤 승률
      //  일반 초구 성공률 · 다득률 · 에버에도 승부치기 초구를 넣는다 (초성 · 초실 · 초3+ 승률, 스코어별 초구는 세트만)
      if (g.tiebreak) { const t0 = g.tiebreak, ofb = og && og.tiebreak ? og.tiebreak.first_ball : null;
        xs.forEach(x => { if (t0.first && t0.first_ball != null) { const r = t0.first_ball; add(x.tfb, r > 0); add(r > 0 ? x.tfbOk : x.tfbMiss, t0.win);
          x.fbN++; x.fbP += r; if (r >= 2) x.fbM++; add(x.fb, r > 0); if (x === e.a && g.tour === curTour) add(e.tourFb, r > 0); }
          if (!t0.first && ofb != null) add(ofb > 0 ? x.tofbOk : x.tofbMiss, t0.win); }); }
      if (g.tiebreak) { xs.forEach(x => tbAdd(x.tb, g)); const t = g.tiebreak; if (t.first) { add(lg.fst, t.win); if (t.first_ball != null) addK(lg.after, Math.min(t.first_ball, 5), !t.win); } }
      let a = 0, b = 0, prev = null, sq = '';   // sq = 앞 세트 결과 순서 ('패승' = 1세트 패 · 2세트 승)
      const setG = !g.single, old = wcOld(g);   // setG = 세트 항목에 넣는 경기 (합 보기의 단판은 빼고)
      g.sets.forEach((s, i) => {
        const sk = `${a}:${b}`, tk = prev ? `${prev}>${sk}` : null, sq0 = sq; prev = sk; s.win ? a++ : b++; sq += s.win ? '승' : '패';
        const os = og && og.sets[i];
        xs.forEach(x => {
          if (setG) { if (!old) add(x.set, s.win); addK(x.st, `${T}|${sk}`, s.win); if (tk) addK(x.tr, `${T}|${tk}`, s.win);
          if (sq0) addX(x.sq, `${T}|${sq0}`, s); if (sq.length > 1) addK(x.gsq, `${T}|${sq}`, g.win); addK(x.no, s.no, s.win);   // 세트 결과 순서별: 다음 세트 승패 · 초구 / 경기 승패
          addK(x.gs, `${T}|${a}:${b}`, g.win); addK(x.gtr, `${T}|${sk}>${a}:${b}`, g.win); }
          x.pts += s.pts || 0; x.inn += s.inn || 0;
          if (s.p1 != null && s.inn) { const h = s.p1 + (s.p2 || 0); x.sh += h; x.sa += h + s.inn - (s.win && setG && !old ? 1 : 0); }   // 일반 세트 공격 성공률 (승부치기 성공률과 비교). 홈피처럼 단판 · 옛 WC 조별 세트는 마지막 이닝도 시도로
          if (s.first === true) add(x.fst, s.win); else if (s.first === false) add(x.snd, s.win);
          if (s.first && s.first_ball != null && x === e.a && g.tour === curTour) add(e.tourFb, s.first_ball > 0);   // 이번 대회 초구
          if (s.first && s.first_ball != null) { const r = s.first_ball; x.fbN++; x.fbP += r; if (r >= 2) x.fbM++; add(x.fb, r > 0); addK(x.fbSt, sk, r > 0); add(r > 0 ? x.fbOk : x.fbMiss, s.win); if (r >= 3) add(x.fb3, s.win); }
          if (s.first === false && os && os.first_ball != null) { add(os.first_ball > 0 ? x.ofbOk : x.ofbMiss, s.win); if (os.first_ball >= 3) add(x.al3, s.win); }
          if (setG) { if (s.lf === 0) add(x.tie, s.win); else if (s.lf === 1) add(x.keep, s.win); else if (s.lf === -1) add(x.back, s.win);
          if (s.cl) add(x.cl, s.win); }
        });
      });
    });
    return { type, cur, E, byName, pool: Object.values(E), lg };
  }
  // 불러오기: 다 받으면 then (기록지가 다시 그린다)
  //  집계는 종목 · 보기(합 · 세 · 단)마다 따로 (kind = 기록지가 setKind 로 정한 보기)
  const load = type => { const k = type + '|' + kind, kd = kind; return C[k] ? Promise.resolve(C[k]) : P[k] || (P[k] = (typeof league === 'function' ? league(type) : Promise.reject()).then(L => (C[k] = build(type, L, kd))).catch(() => { P[k] = null; return null; })); };
  const get = type => C[type + '|' + kind] || null;
  const setKind = k => { kind = k === 'set' || k === 'single' ? k : 'sum'; };
  const who = (D, name) => { const id = D && D.byName[name]; return id ? D.E[id] : null; };

  // ── 선수 칸 브리핑 (팀 칩 자리): 경기 승-패 · 세트 승률 · 에버 · 흰공 · 노란공 · 뱅킹 승률 (이번 시즌 값(순위), 말풍선 = 시즌 · 통산 값과 순위) ──
  const avgOf = x => x.inn ? x.pts / x.inn : null;
  function brief(names, type, hideBank) {
    const D = get(type); if (!D) return null;
    const M = names.map(n => who(D, n)); if (!M[0] || !M[1]) return null;
    const tipT = (l, f, val, cnt, me) => { const rk = rk2(D, me, val, cnt); return `<div class="rkh0">${esc(l)}</div><table class="rdtip"><tr><td>이번 시즌</td><td><b>${f(me.s)}</b> ${rk[0] ? `(${rk[0]})` : ''}</td></tr><tr><td>통산</td><td><b>${f(me.a)}</b> ${rk[1] ? `(${rk[1]})` : ''}</td></tr></table>`; };
    const wl = x => x.n ? `${x.w}-${x.n - x.w}` : '–';
    const met = (me, l, k, f = x => x && x.n ? pct(x.w / x.n) : '–', val = x => rt(x[k]), cnt = x => cn(x[k]), sub = x => x[k] && x[k].n ? wl(x[k]) : '') => {
      const r = rk2(D, me, val, cnt)[0];
      return [l, `${f(me.s[k], me.s)}${r ? `<small class="rkn">(${r})</small>` : ''}`, sub(me.s), val(me.s), tipT(l, x => `${f(x[k], x)} ${sub(x)}`, val, cnt, me)];
    };
    const items = me => [
      met(me, '경기 승-패', 'game', x => x && x.n ? `${x.w}-${x.n - x.w}` : '–', x => rt(x.game), x => cn(x.game), x => x.game.n ? pct(x.game.w / x.game.n) : ''),
      met(me, '세트 승률', 'set'),
      met(me, '에버', 'pts', (v, x) => x.inn ? f3(x.pts / x.inn) : '–', avgOf, x => x.set.n, () => ''),
      met(me, '흰공 승률', 'wh'),
      // 두 칸씩이라 노란공은 흰공 바로 아래: 왼쪽 칸 = 뱅킹 (선공을 정하면 빠지고 빈칸)
      hideBank ? null : met(me, '뱅킹 승률', 'bank'),
      met(me, '노란공 승률', 'ye'),
    ];
    const I = M.map(items);
    const chips = (mine, other) => mine.map((x, i) => { if (!x) return '<span class="ti" style="visibility:hidden"></span>'; const v = x[3], w = other[i][3], hi = v != null && w != null && v > w;
      return `<span class="ti${hi ? ' hi' : ''}" data-stip="${esc(x[4])}"><small>${x[0]}</small><b>${x[1]}</b>${x[2] ? `<i>${x[2]}</i>` : ''}</span>`; }).join('');
    // 최근 5경기 (이번 시즌 아니어도 가장 최근 5경기): 말풍선 = 날짜 · 대회 · 라운드 · 상대 · 세트 스코어
    const recent = me => { const xs = me.a.recent.slice(-5); if (!xs.length) return '';
      const tip = `<div class="rkh0">최근 5경기 <small>왼쪽 칩부터</small></div><table class="rdtip r5t">${xs.map(g => `<tr><td>${esc(String(g.date || '').slice(2, 10).replace(/-/g, '.'))}</td><td>${esc(typeof tourShort === 'function' ? `${seasonLabel(g.season)} ${tourShort(g.seq)}` : '')}</td><td>${esc(typeof roundName === 'function' ? roundName(g) : '')}</td><td><b>vs ${esc(g.opp_name || '')}</b></td><td class="${g.win ? 'w' : 'l'}"><b>${g.win ? '승' : '패'}</b> ${g.sw}:${g.sl}</td></tr>`).join('')}</table>`;
      return `<span class="r5" data-stip="${esc(tip)}">${xs.map(g => `<span class="${g.win ? 'w' : 'l'}">${g.win ? '승' : '패'}</span>`).join('')}</span>`; };
    // 가운데 상대 전적 2줄 (경기 승 · 세트): 선수마다 [이번 시즌, 통산]
    const H = [M[0].h2h[M[1].id], M[1].h2h[M[0].id]];
    const h2hRows = H[0] && H[0].a.n ? [['전적', h => h.w], ['세트', h => h.sw]].map(([l, f]) => [l, H.map(h => [f(h.s), f(h.a)])]) : null;
    return { kind: type === 'LPBA' ? '여자단식' : '남자단식', recent: M.map(recent), stars: ['', ''], h2hRows, h2hPost: false, teams: [chips(I[0], I[1]), chips(I[1], I[0])] };
  }

  // ── 이름 아랫줄 1: 지금 세트 스코어 a:b 의 게임 승률(버튼, 펴면 지금 스코어가 된 두 길의 게임 승률). 1세트 전엔 없음 ── (팀 sheetTeamFlow 와 같은 모양)
  //  seq = 지금까지 세트 결과 순서 ('패승'). 펼친 줄 = 그 순서를 지난 경기의 게임 승률 (2세트가 끝난 뒤부터, 오른쪽 들여쓰기)
  function flow(name, type, T, a, b, seq, btn, open) {
    const D = get(type), me = who(D, name); if (!me) return '';
    const n = a + b, no = n + 1, r = x => x && x.n ? `${Math.round(x.w / x.n * 100)}%` : '–', d = x => x && x.n ? `${x.w}-${x.n - x.w}` : '';
    const line = (l, m, kk, cls = '', lab = '') => { const s = me.s[m][kk], A = me.a[m][kk], rk = rk2(D, me, x => rt(x[m][kk]), x => cn(x[m][kk]));
      return `<span class="tfl${cls}">${lab || `<small>${l}</small>`}<b>${r(s)}${rk[0] ? `<small class="rkn">(${rk[0]})</small>` : ''}</b><small>${d(s)}</small><em>(${r(A)}${rk[1] ? `<small class="rkn">(${rk[1]})</small>` : ''}</em><small>${d(A)}<em class="frp">)</em></small></span>`; };
    if (!n) return '';
    const head = btn && seq.length > 1 ? `<small class="flb${open ? ' on' : ''}" data-flt="${btn}">${a}:${b} 게임 승률 <span class="dni"></span></small>` : '';
    const br = seq.length > 1 ? line(seqH(seq), 'gsq', `${T}|${seq}`, ' tfx now') : '';
    return `<div class="tflw${open ? ' open' : ''}">` + line(`${a}:${b} 게임 승률`, 'gs', `${T}|${a}:${b}`, '', head) + br + '</div>';
  }
  // ── 이름 아랫줄 2: N세트 승률(버튼) > 지금 세트 스코어로 시작한 세트 승률 > (펴면) 지금까지 세트 결과 순서('패승')로 시작한 세트 승률 ── (팀 sheetSetNoInfo · sheetStateInfo 자리)
  function state(name, type, T, a, b, seq, ny, btn, open) {
    const D = get(type), me = who(D, name); if (!me) return '';
    const no = a + b + 1;
    const row = (l, m, k, lab = '', cls = '') => frRow(l, me.s[m][k], me.a[m][k], rk2(D, me, x => rt(x[m][k]), x => cn(x[m][k])), ny, lab, cls);
    const lab = btn && seq.length > 1 ? `<small class="flb${open ? ' on' : ''}" data-flt="${btn}">${no}세트 승률 <span class="dni"></span></small>` : '';
    return `<div class="frg${open ? ' open' : ''}">` + row(`${no}세트 승률`, 'no', no, lab) + (a + b ? row(`${a}:${b} 세트 승률`, 'st', `${T}|${a}:${b}`)
      + (seq.length > 1 ? row(seqH(seq), 'sq', `${T}|${seq}`, '', ' frx now') : '') : '') + '</div>';
  }
  // ── 이름 아랫줄 3: ① 경기 시작 = 뱅킹 승률 ② 선공 = 초구 묶음 · 초구 뒤 승률 ③ 후공 = 상대 초구 뒤 승률 ──
  function bankInfo(name, type) {
    const D = get(type), me = who(D, name), U = UI(); if (!me || !U) return '';
    return U.xtHead(`뱅킹 ${esc(me.name)}`) + U.xtChip('뱅킹 승률', me.s.bank, me.a.bank, true, rk2(D, me, x => rt(x.bank), x => cn(x.bank)));
  }
  //  sc = 지금 세트 스코어 'a:b', seq = 지금까지 세트 결과 순서, T = 선승 세트 수 → 'a:b 초구 성공률' 아래 '패승' 줄 (3세트부터)
  function firstInfo(name, type, ny, sc, p, seq, T) {
    const D = get(type), me = who(D, name), U = UI(); if (!me || !U) return '';
    const c = (l, k) => U.xtChip(l, me.s[k], me.a[k], ny, rk2(D, me, x => rt(x[k]), x => cn(x[k]), FB_KEYS.has(k) ? FB_MIN : undefined));
    const avgV = x => x.fbN ? f3(x.fbP / x.fbN) : '–', avgR = rk2(D, me, x => x.fbN ? x.fbP / x.fbN : null, x => x.fbN, FB_MIN);
    const multi = x => ({ w: x.fbM, n: x.fbN });
    const scChip = sc ? U.xtChip(`${sc} 초구 성공률`, me.s.fbSt[sc], me.a.fbSt[sc], ny, rk2(D, me, x => rt(x.fbSt[sc]), x => cn(x.fbSt[sc]))) : '';
    const pk = seq && seq.length > 1 ? `${T}|${seq}` : '';
    const fbX = x => x && x.fbN ? { w: x.fbH, n: x.fbN } : null;
    const pathChip = pk ? U.xtChip(seqH(seq), fbX(me.s.sq[pk]), fbX(me.a.sq[pk]), ny, rk2(D, me, x => rt(fbX(x.sq[pk])), x => x.sq[pk] ? x.sq[pk].fbN : 0)).replace('<span class="ti xt', '<span class="ti xt fbp') : '';
    const fbChip = U.xtChip('초구 성공률', me.s.fb, me.a.fb, ny, rk2(D, me, x => rt(x.fb), x => cn(x.fb), FB_MIN), '', { lab: '대회', x: me.tourFb });
    return U.grp([fbChip, scChip, pathChip,
      `<span class="ti xt${ny ? ' ny' : ''}"><small>초구 에버</small><b>${U.xtVal(avgV(me.s), avgV(me.a), avgR)}</b><i>${me.s.fbN} / ${me.a.fbN}회</i></span>`,
      U.xtChip('초구 다득률', multi(me.s), multi(me.a), ny, rk2(D, me, x => rt(multi(x)), x => x.fbN, FB_MIN))], 'gfb', 'gfb' + p)
      + U.grp([c('초성 승률', 'fbOk'), c('초실 승률', 'fbMiss'), c('초3+ 승률', 'fb3'), c('선공 세트 승률', 'fst')], 'gwr', 'gwr' + p);
  }
  function secondInfo(name, type, ny, p) {
    const D = get(type), me = who(D, name), U = UI(); if (!me || !U) return '';
    const c = (l, k) => U.xtChip(l, me.s[k], me.a[k], ny, rk2(D, me, x => rt(x[k]), x => cn(x[k]), FB_KEYS.has(k) ? FB_MIN : undefined));
    return U.grp([c('상대 초성 승률', 'ofbOk'), c('상대 초실 승률', 'ofbMiss'), c('초3+ 허용 승률', 'al3'), c('후공 세트 승률', 'snd')], 'gwr', 'gwr' + p);
  }
  // ── 이닝 위 라이브 정보 { ratio, state }: 우세 · 박빙 · 열세 비율 (지금 상황 강조) + 지금 상황 승률 · 클러치 승률 ── (팀 sheetTiming 과 같은 모양, 끝내기 장타 줄 없음)
  //  sc = { T, seq, first }: 지금까지 세트 결과 순서(seq '승패')로 시작한 세트의 에버 · 세트 승률 · 초성(초구 성공률, 이번 세트 선공일 때만) 한 줄 (sx 줄)
  function timing(name, type, st, cl, fresh, sc) {
    const D = get(type), me = who(D, name); if (!me) return { ratio: '', state: '', f5: '', sx: '' };
    const S2 = me.s, A = me.a, lead = type === 'LPBA' ? 3 : 5, cln = type === 'LPBA' ? 4 : 5;
    const lv = (l, v, sub, ny, tip = '') => `<span class="lv${ny ? ' ny' : ''}"${tip ? ` data-stip="${esc(tip)}"` : ''}><small>${l}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</span>`;
    const DESC = { keep: `이닝과 상관없이 점수로 먼저 ${lead}점 이상 앞선 세트`, tie: `끝까지 ${lead}점 차가 나지 않은 세트`, back: `이닝과 상관없이 점수로 먼저 ${lead}점 이상 뒤진 세트`, cl: `둘 다 목표 점수까지 ${cln}점 이내로 남은 채 이어진 세트` };
    const tipOf = (l, k) => { const row = (lab, x) => { const T = x.tie.n + x.keep.n + x.back.n, y = x[k]; return `<tr><td>${lab}</td><td>${k === 'cl' ? '' : `<b>${y.n}</b>/${T}세트 (${T ? Math.round(y.n / T * 100) : 0}%) · `}${y.n ? `${y.w}승 ${y.n - y.w}패 <b>${pct(y.w / y.n)}</b>` : '기록 없음'}</td></tr>`; };
      return `<div class="rkh0">${l} <small>${DESC[k]}</small></div><table class="rdtip">${row('이번 시즌', S2)}${row('통산', A)}</table>`; };
    const r2 = x => x && x.n ? pct(x.w / x.n) : '–', d2 = x => x && x.n ? `${x.w}-${x.n - x.w}` : '–';
    const sa = (s, a) => `<span class="vs">${s}</span> / <span class="va">${a}</span>`;
    const wr = (l, k) => lv(l, sa(r2(S2[k]), r2(A[k])), `${d2(S2[k])} / ${d2(A[k])}`, fresh, tipOf(l.replace(' 승률', ''), k));
    const tot = x => x.tie.n + x.keep.n + x.back.n, r0 = (x, k) => tot(x) ? `${Math.round(x[k].n / tot(x) * 100)}%` : '–';
    return {
      ratio: `<span class="tsr rt">${[['우세', 'keep'], ['박빙', 'tie'], ['열세', 'back']].map(([l, k]) => `<span class="lv${k === { up: 'keep', dn: 'back' }[st] || (st === 'tie' && k === 'tie') ? ' on' : ''}" data-stip="${esc(tipOf(l, k))}"><b>${l}(${sa(r0(S2, k), r0(A, k))})</b></span>`).join('')}</span>`,
      state: (st === 'up' ? wr('우세 승률', 'keep') : st === 'dn' ? wr('열세 승률', 'back') : wr('박빙 승률', 'tie')) + (cl ? wr('클러치 승률', 'cl') : ''),
      f5: '',
      sx: scoreX(me, sc, lv, sa, fresh),
    };
  }
  function scoreX(me, sc, lv, sa, ny) {
    if (!sc || !sc.seq) return '';
    const { T, seq, first } = sc, k = `${T}|${seq}`, S2 = me.s.sq[k], A = me.a.sq[k];
    if (!A) return '';
    const av = x => x && x.i ? f3(x.p / x.i) : '–', wr = x => x && x.n ? pct(x.w / x.n) : '–', wl = x => x && x.n ? `${x.w}-${x.n - x.w}` : '–', fb = x => x && x.fbN ? pct(x.fbH / x.fbN) : '–', fbs = x => x && x.fbN ? `${x.fbH}/${x.fbN}` : '–';
    const tip = `<div class="rkh0">${seqH(seq)} <small>세트 결과가 ${seq} 순서로 온 뒤 친 ${seq.length + 1}세트</small></div><table class="rdtip">${[['이번 시즌', S2], ['통산', A]].map(([l, x]) => `<tr><td>${l}</td><td>${x ? x.n : 0}세트 · 에버 ${av(x)} · ${wl(x)}${first ? ` · 초성 ${fbs(x)}` : ''}</td></tr>`).join('')}</table>`;
    return `<span class="lv${ny ? ' ny' : ''}" data-stip="${esc(tip)}"><small>${seqH(seq)}</small><small>에버</small><b>${sa(av(S2), av(A))}</b><small>승률</small><b>${sa(wr(S2), wr(A))}</b>${first ? `<small>초성</small><b>${sa(fb(S2), fb(A))}</b>` : ''}</span>`;
  }
  // ── 승부치기 (기록지에서 '승부치기'로 돌입한 세트): role = null(선공 고르기 전) · 'first' · 'second', oppFb = 상대(선공) 1이닝 득점(끝났으면) ──
  //  선공: 승부치기 승률 · 선공 승률 · 초구(평균 · 최다) · 평균 득점 · 공격 성공률(본인 일반 세트 평균 대비)
  //  후공: 승부치기 승률 · 후공 승률 · 후공 이닝 최다 득점 · 평균 득점 · 공격 성공률, 상대 초구가 끝나면 '선공 n점 뒤 후공 승률'(리그 전체)
  function tbInfo(name, type, role, oppFb) {
    const D = get(type), me = who(D, name), U = UI(); if (!me || !U) return '';
    const S2 = me.s.tb, A = me.a.tb, c = (l, k) => U.xtChip(l, k ? S2[k] : S2, k ? A[k] : A, true, rk2(D, me, x => rt(k ? x.tb[k] : x.tb), x => cn(k ? x.tb[k] : x.tb)));
    const num = (l, sv, av, sub = '') => `<span class="ti xt ny"><small>${l}</small><b>${U.xtVal(sv, av)}</b>${sub ? `<i>${sub}</i>` : ''}</span>`;
    const av = (a, b) => b ? (a / b).toFixed(2) : '–', mx = x => x ? `${x.v}점` : '–';
    const sr = (o, x) => { if (!o.att) return '–'; const v = o.hits / o.att, own = x.sa ? x.sh / x.sa : null; return `${pct(v)}${own != null ? `<em>(${v >= own ? '+' : ''}${((v - own) * 100).toFixed(1)})</em>` : ''}`; };
    const c2 = (l, k) => U.xtChip(l, me.s[k], me.a[k], true, rk2(D, me, x => rt(x[k]), x => cn(x[k])));   // 승치 초구 · 상대 초구 (선수 기록 바로 아래 칸)
    const ch = [c('승부치기 승률')];
    if (role !== 'second') ch.push(c('승치 선공 승률', 'fst'), c2('승치 초구 성공률', 'tfb'), c2('승치 초성 승률', 'tfbOk'), c2('승치 초실 승률', 'tfbMiss'));
    if (role !== 'first') ch.push(c('승치 후공 승률', 'snd'), c2('상대 초성 승률', 'tofbOk'), c2('상대 초실 승률', 'tofbMiss'));
    if (role === 'first') ch.push(num('승치 초구 평균', av(S2.fbP, S2.fbN), av(A.fbP, A.fbN), `최다 ${mx(S2.maxFb)} / ${mx(A.maxFb)}`));
    if (role === 'second') ch.push(num('후공 이닝 최다', mx(S2.maxSnd), mx(A.maxSnd)));
    if (role === 'second' && oppFb != null) { const k = Math.min(oppFb, 5), x = D.lg.after[k];
      ch.push(`<span class="ti xt ny"><small>상대 초구 ${k}점${k === 5 ? '+' : ''} 뒤</small><b>후공 승률 ${x && x.n ? pct(x.w / x.n) : '–'}</b><i>리그 ${x ? `${x.w}-${x.n - x.w}` : ''}</i></span>`); }
    ch.push(num('승치 평균 득점', av(S2.pts, S2.n), av(A.pts, A.n), `평균 ${av(S2.inn, S2.n)} / ${av(A.inn, A.n)}이닝`));
    ch.push(num('승치 공격 성공률', sr(S2, me.s), sr(A, me.a), '(본인 평균 대비 %p)'));
    const lab = role === 'first' ? '선공' : role === 'second' ? '후공' : '';
    return U.xtHead(`승부치기${lab ? ' ' + lab : ''} ${esc(me.name)} <small>${S2.n} / ${A.n}회 · 리그 통산 선공 승률 ${D.lg.fst.n ? pct(D.lg.fst.w / D.lg.fst.n) : '–'}</small>`) + ch.join('');
  }
  window.IndSheet = { setKind, load, get, brief, flow, state, bankInfo, firstInfo, secondInfo, timing, tbInfo };
})();
