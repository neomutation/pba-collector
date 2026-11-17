// 캐스터 기록지 · 개인투어 경기 브리핑과 라이브 정보 (팀리그 기록지와 같은 모양, team.js 의 TeamApp.sheet* 에 해당)
//  자료 = 같은 종목 전체 경기(/api/league, 기권 제외)의 1:1 세트 경기. 이번 시즌 · 통산, 순위는 같은 종목 선수 중 (시즌 3 · 통산 5번 이상, 초구는 5 · 20번)
//  세트 스코어는 선승 세트 수(경기 target)가 같은 경기끼리 센다 (3선승의 2:2 와 4선승의 2:2 는 다르다)
(function () {
  const C = {}, P = {};   // 종목 → 집계 / 불러오는 중
  const z = () => ({ w: 0, n: 0 }), add = (x, w) => { x.n++; if (w) x.w++; }, addK = (m, k, w) => add(m[k] || (m[k] = z()), w);
  const blank = () => ({ st: {}, tr: {}, no: {}, gs: {}, gtr: {}, fbSt: {}, game: z(), set: z(), fst: z(), snd: z(), fb: z(), fbN: 0, fbP: 0, fbM: 0, fbOk: z(), fbMiss: z(), fb3: z(),
    ofbOk: z(), ofbMiss: z(), al3: z(), tie: z(), keep: z(), back: z(), cl: z(), bank: z(), wh: z(), ye: z(), pts: 0, inn: 0, recent: [], tb: tbNew(), sh: 0, sa: 0, tfb: z(), tfbOk: z(), tfbMiss: z(), tofbOk: z(), tofbMiss: z() });
  const FB_KEYS = new Set(['fb', 'avg', 'multi', 'fbOk', 'fbMiss', 'fb3', 'ofbOk', 'ofbMiss', 'al3']), FB_MIN = [5, 20];
  const rt = x => x && x.n ? x.w / x.n : null, cn = x => x ? x.n : 0;
  const rankIn = (pool, me, sc, val, cnt, mins = [3, 5]) => { const mv = me ? val(me[sc]) : null; if (mv == null) return ''; const min = sc === 's' ? mins[0] : mins[1]; return `${1 + pool.filter(x => x !== me && cnt(x[sc]) >= min && val(x[sc]) != null && val(x[sc]) > mv).length}위`; };
  const rk2 = (D, me, val, cnt, mins) => ['s', 'a'].map(sc => rankIn(D.pool, me, sc, val, cnt, mins));
  const UI = () => window.TeamApp && TeamApp.sheetUI;

  function build(type, L) {
    const gs = L.games.filter(g => !g.single && g.sets && g.sets.length);
    const cur = Math.max(...gs.map(g => g.season));
    const idx = {}; gs.forEach(g => { idx[`${g.tour}|${g.round_code}|${g.player}|${g.opp}`] = g; });
    const E = {}, byName = {}, last = {}, lg = { fst: z(), after: {} };   // lg = 리그 전체 승부치기: 선공 승률 · 선공 초구 n점 뒤 후공 승률 (선공 쪽 기록으로 한 번씩)
    gs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(g => {
      const e = E[g.player] || (E[g.player] = { id: g.player, name: g.player_name, s: blank(), a: blank(), h2h: {} });
      if (!last[g.player_name] || g.season >= last[g.player_name]) { byName[g.player_name] = g.player; last[g.player_name] = g.season; }
      const og = idx[`${g.tour}|${g.round_code}|${g.opp}|${g.player}`], T = g.target || Math.max(g.sw, g.sl), xs = g.season === cur ? [e.s, e.a] : [e.a];
      const hx = e.h2h[g.opp] || (e.h2h[g.opp] = { s: { w: 0, sw: 0, n: 0 }, a: { w: 0, sw: 0, n: 0 } });
      (g.season === cur ? [hx.s, hx.a] : [hx.a]).forEach(h => { h.n++; if (g.win) h.w++; h.sw += g.sw || 0; });
      xs.forEach(x => { add(x.game, g.win); if (g.ball === 'ㅎ' || g.ball === 'ㄴ') { add(x.bank, g.ball === 'ㅎ'); add(g.ball === 'ㅎ' ? x.wh : x.ye, g.win); } });
      e.a.recent.push(g); if (g.season === cur) e.s.recent.push(g);
      // 승부치기 초구: 내가 선공 = 초구 성공률 · 초성/초실 승률, 후공 = 상대 초구(상대 쪽 기록) 성공/실패 뒤 승률
      if (g.tiebreak) { const t0 = g.tiebreak, ofb = og && og.tiebreak ? og.tiebreak.first_ball : null;
        xs.forEach(x => { if (t0.first && t0.first_ball != null) { add(x.tfb, t0.first_ball > 0); add(t0.first_ball > 0 ? x.tfbOk : x.tfbMiss, t0.win); } if (!t0.first && ofb != null) add(ofb > 0 ? x.tofbOk : x.tofbMiss, t0.win); }); }
      if (g.tiebreak) { xs.forEach(x => tbAdd(x.tb, g)); const t = g.tiebreak; if (t.first) { add(lg.fst, t.win); if (t.first_ball != null) addK(lg.after, Math.min(t.first_ball, 5), !t.win); } }
      let a = 0, b = 0, prev = null;
      g.sets.forEach((s, i) => {
        const sk = `${a}:${b}`, tk = prev ? `${prev}>${sk}` : null; prev = sk; s.win ? a++ : b++;
        const os = og && og.sets[i];
        xs.forEach(x => {
          add(x.set, s.win); addK(x.st, `${T}|${sk}`, s.win); if (tk) addK(x.tr, `${T}|${tk}`, s.win); addK(x.no, s.no, s.win);
          addK(x.gs, `${T}|${a}:${b}`, g.win); addK(x.gtr, `${T}|${sk}>${a}:${b}`, g.win);
          x.pts += s.pts || 0; x.inn += s.inn || 0;
          if (s.p1 != null && s.inn) { const h = s.p1 + (s.p2 || 0); x.sh += h; x.sa += h + s.inn - (s.win ? 1 : 0); }   // 일반 세트 공격 성공률 (승부치기 성공률과 비교)
          if (s.first === true) add(x.fst, s.win); else if (s.first === false) add(x.snd, s.win);
          if (s.first && s.first_ball != null) { const r = s.first_ball; x.fbN++; x.fbP += r; if (r >= 2) x.fbM++; add(x.fb, r > 0); addK(x.fbSt, sk, r > 0); add(r > 0 ? x.fbOk : x.fbMiss, s.win); if (r >= 3) add(x.fb3, s.win); }
          if (s.first === false && os && os.first_ball != null) { add(os.first_ball > 0 ? x.ofbOk : x.ofbMiss, s.win); if (os.first_ball >= 3) add(x.al3, s.win); }
          if (s.lf === 0) add(x.tie, s.win); else if (s.lf === 1) add(x.keep, s.win); else if (s.lf === -1) add(x.back, s.win);
          if (s.cl) add(x.cl, s.win);
        });
      });
    });
    return { type, cur, E, byName, pool: Object.values(E), lg };
  }
  // 불러오기: 다 받으면 then (기록지가 다시 그린다)
  const load = type => C[type] ? Promise.resolve(C[type]) : P[type] || (P[type] = (typeof league === 'function' ? league(type) : Promise.reject()).then(L => (C[type] = build(type, L))).catch(() => { P[type] = null; return null; }));
  const get = type => C[type] || null;
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
      met(me, '노란공 승률', 'ye'),
      ...(hideBank ? [] : [met(me, '뱅킹 승률', 'bank')]),
    ];
    const I = M.map(items);
    const chips = (mine, other) => mine.map((x, i) => { const v = x[3], w = other[i][3], hi = v != null && w != null && v > w;
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

  // ── 이름 아랫줄 1: 지금 세트 스코어 a:b 의 게임 승률 + 'N세트 승률' 버튼(펴면 지금 스코어가 된 두 길의 게임 승률) ── (팀 sheetTeamFlow 와 같은 모양)
  function flow(name, type, T, a, b, prev, btn, open) {
    const D = get(type), me = who(D, name); if (!me) return '';
    const n = a + b, no = n + 1, r = x => x && x.n ? `${Math.round(x.w / x.n * 100)}%` : '–', d = x => x && x.n ? `${x.w}-${x.n - x.w}` : '';
    const line = (l, m, kk, cls = '', lab = '') => { const s = me.s[m][kk], A = me.a[m][kk], rk = rk2(D, me, x => rt(x[m][kk]), x => cn(x[m][kk]));
      return `<span class="tfl${cls}">${lab || `<small>${l}</small>`}<b>${r(s)}${rk[0] ? `<small class="rkn">(${rk[0]})</small>` : ''}</b><small>${d(s)}</small><em>(${r(A)}${rk[1] ? `<small class="rkn">(${rk[1]})</small>` : ''}</em><small>${d(A)}<em class="frp">)</em></small></span>`; };
    const head = n && btn ? `<small class="flb${open ? ' on' : ''}" data-flt="${btn}">${no}세트 승률 <span class="dni"></span></small>` : '';
    const br = n ? sheetBranch(a, b, prev ? prev[0] : null, prev ? prev[1] : null).map(([tk, l, now]) => line(l, 'gtr', `${T}|${tk}`, ' tfx' + (now ? ' now' : ''))).join('') : '';
    const gs = n ? line(`${a}:${b} 게임 승률`, 'gs', `${T}|${a}:${b}`) : '';
    return `<div class="tflw${open ? ' open' : ''}">` + gs + line(`${no}세트 승률`, 'no', no, '', head) + br + '</div>';
  }
  // ── 이름 아랫줄 2: 지금 세트 스코어로 시작한 세트 승률 + 버튼(펴면 그 스코어가 된 두 길의 세트 승률) ── (팀 sheetSetNoInfo · sheetStateInfo 자리)
  function state(name, type, T, a, b, pa, pb, ny, btn, open) {
    const D = get(type), me = who(D, name); if (!me || !(a + b)) return '';
    const row = (l, m, k, lab = '', cls = '') => frRow(l, me.s[m][k], me.a[m][k], rk2(D, me, x => rt(x[m][k]), x => cn(x[m][k])), ny, lab, cls);
    const lab = btn ? `<small class="flb${open ? ' on' : ''}" data-flt="${btn}">${a}:${b} 세트 승률 <span class="dni"></span></small>` : '';
    return `<div class="frg${open ? ' open' : ''}">` + row(`${a}:${b} 세트 승률`, 'st', `${T}|${a}:${b}`, lab)
      + sheetBranch(a, b, pa, pb).map(([tk, l, now]) => row(l, 'tr', `${T}|${tk}`, '', ' frx' + (now ? ' now' : ''))).join('') + '</div>';
  }
  // ── 이름 아랫줄 3: ① 경기 시작 = 뱅킹 승률 ② 선공 = 초구 묶음 · 초구 뒤 승률 ③ 후공 = 상대 초구 뒤 승률 ──
  function bankInfo(name, type) {
    const D = get(type), me = who(D, name), U = UI(); if (!me || !U) return '';
    return U.xtHead(`뱅킹 ${esc(me.name)}`) + U.xtChip('뱅킹 승률', me.s.bank, me.a.bank, true, rk2(D, me, x => rt(x.bank), x => cn(x.bank)));
  }
  function firstInfo(name, type, ny, sc, p) {
    const D = get(type), me = who(D, name), U = UI(); if (!me || !U) return '';
    const c = (l, k) => U.xtChip(l, me.s[k], me.a[k], ny, rk2(D, me, x => rt(x[k]), x => cn(x[k]), FB_KEYS.has(k) ? FB_MIN : undefined));
    const avgV = x => x.fbN ? f3(x.fbP / x.fbN) : '–', avgR = rk2(D, me, x => x.fbN ? x.fbP / x.fbN : null, x => x.fbN, FB_MIN);
    const multi = x => ({ w: x.fbM, n: x.fbN });
    const scChip = sc ? U.xtChip(`${sc} 초구 성공률`, me.s.fbSt[sc], me.a.fbSt[sc], ny, rk2(D, me, x => rt(x.fbSt[sc]), x => cn(x.fbSt[sc]))) : '';
    return U.grp([c('초구 성공률', 'fb'), scChip,
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
  function timing(name, type, st, cl, fresh) {
    const D = get(type), me = who(D, name); if (!me) return { ratio: '', state: '', f5: '' };
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
    };
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
  window.IndSheet = { load, get, brief, flow, state, bankInfo, firstInfo, secondInfo, timing, tbInfo };
})();
