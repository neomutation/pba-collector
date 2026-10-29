// PBA 팀리그 화면. index.html 의 공용 함수($, esc, api, pct, f3, sum, ratio, seasonLabel …)를 같이 쓴다.
'use strict';
(function () {
  let D = null;                      // /api/team/all 응답
  const panes = {};
  // 질문 말풍선: 그 팀 칸 밖을 누르면 닫힘
  document.addEventListener("click", e => { for (const p of Object.values(panes)) if (p.qaOpen && !p.el.contains(e.target)) p.setQa(false); });
  let leagueOf = {}, teamName = {}, teamShort = {}, teamLogo = {}, seasonsOfTeam = {};

  // 팀리그 승점 규칙은 시즌마다 다르다 (홈피 순위표로 확인)
  //  20-21·21-22: 무승부(3:3) 있음, 승 3 · 무 1 · 패 0 / 22-23: 승점 없음(승수로 순위) / 23-24~: 2세트 이상 차 승 3, 4:3 승 2, 3:4 패 1
  const pointRule = season => season <= 2021 ? 'draw' : season === 2022 ? 'none' : 'pba';
  function pts3(a, b, season) {
    const r = pointRule(season);
    if (r === 'none') return null;
    if (r === 'draw') return a > b ? 3 : a === b ? 1 : 0;
    return a > b ? (a - b >= 2 ? 3 : 2) : (b - a === 1 ? 1 : 0);
  }
  // 시즌마다 표기가 다른 같은 선수("응우옌꾸옥응우옌" / "Q.응우옌")를 회원 코드로 하나의 이름(가장 최근 표기)으로
  let canonMap = {};
  const canonName = n => canonMap[n] || n;
  // 대표 이름 → 그 선수가 쓰인 모든 표기 (기록지는 "우이마즈"처럼 또 다른 표기를 쓸 때가 있다)
  let aliasOf = {};
  const seqHtml = sets => sets.map(s => `<span class="${s.win ? 'w' : 'l'}">${s.win ? '승' : '패'}</span>`).join('');

  // 복식 방식: 혼합복식은 늘 스카치 더블(한 이닝 안에서 번갈아 공격).
  //  남자복식은 23-24 시즌까지, 여자복식은 25-26 시즌까지 K더블 — 이닝마다 번갈아 공격 (1번 선수 = 홀수 이닝, 2번 = 짝수 이닝)
  const isKDouble = (season, kind) => (kind === '남자복식' && season <= 2023) || (kind === '여자복식' && season <= 2025);
  // 기록지의 선수별 득점·공격성공률 (복식). 예전 시즌은 기록지 좌우가 팀 순서와 다를 때가 있어 이름으로 맞춘다.
  //  성공 = 1점 + 뱅크샷 성공 수. 시도 = 성공 + 실패
  //  K더블: 선수마다 자기 이닝이 있어 실패 = 자기 이닝 수 (세트를 끝낸 마지막 이닝은 실패 없음) → 개인 에버(득점 ÷ 자기 이닝)도 낸다
  //  스카치: 시도 = 성공 ÷ 성공률 (성공률 0 이면 팀 이닝의 절반으로 어림)
  function perMine(s, i, season) {
    const kd = isKDouble(season, s.kind);
    // 이 팀의 이닝별 득점: 예전 기록은 좌우가 바뀌어 있을 때가 있어 합이 팀 득점과 같은 쪽을 쓴다
    const runs = kd && s.runs ? [s.runs[i], s.runs[1 - i]].find(r => r && sum(r, x => x) === s.pts[i]) : null;
    const all = (s.per || []).flat(), mine = (s.p[i] || []).map(canonName);
    return mine.map((n, k) => {
      const al = [n, ...(aliasOf[n] || [])];
      const x = all.find(e => canonName(e.name) === n || al.includes(e.name))
        || all.find(e => { const en = canonName(e.name); return al.some(a => a.endsWith(en) || en.endsWith(a) || a.endsWith(e.name)); });
      if (!x) return null;
      const succ = (x.p1 || 0) + (x.bank || 0);
      if (runs) {
        const inn = runs.filter((_, q) => q % 2 === k).length;
        const endedHere = s.win === i + 1 && (runs.length - 1) % 2 === k;   // 마지막 이닝에서 이겨 끝냈으면 그 이닝은 실패가 없다
        return { name: n, pts: x.pts || 0, succ, att: succ + inn - (endedHere ? 1 : 0), inn, kd: true };
      }
      const att = x.rate > 0 ? Math.round(succ / (x.rate / 100)) : Math.ceil((s.inn[i] || 0) / 2);
      return { name: n, pts: x.pts || 0, succ, att, kd };
    });
  }
  // 이닝 기록 정리: 홈피 이닝 목록은 시즌에 따라 두 팀 순서가 점수와 뒤바뀌어 있다 → 합이 점수와 맞는 순서로 맞춘다 (안 맞으면 버림)
  const alignRuns = s => {
    if (!s.runs) return null;
    const [a, b] = s.runs.map(r => r.reduce((x, y) => x + y, 0));
    return a === s.pts[0] && b === s.pts[1] ? s.runs : a === s.pts[1] && b === s.pts[0] ? [s.runs[1], s.runs[0]] : null;
  };
  // 선공 팀(0/1): 홈피 선공 표시는 절반쯤 틀려서 이닝 수로 판단한다
  //  선공이 끝내면 선공 이닝이 하나 더 많고, 이닝 수가 같으면 후공이 끝낸 것 (= 세트를 이긴 팀이 후공)
  const breakerOf = (s, R) => {
    const n = R ? R.map(r => r.length) : s.inn;
    if (!n || n[0] == null || n[1] == null) return null;
    if (n[0] !== n[1]) return n[0] > n[1] ? 0 : 1;
    return s.win === 1 ? 1 : s.win === 2 ? 0 : null;
  };
  // 한 경기를 code 팀 입장으로
  function persp(g, code) {
    const i = g.t1 === code ? 0 : 1, j = 1 - i;
    const sets = g.sets.map(s => { const R = alignRuns(s), fi = breakerOf(s, R); return {
      no: s.no, kind: s.kind, gp: s.gp, win: s.win === i + 1, pts: s.pts[i], opp: s.pts[j], inn: s.inn[i], oinn: s.inn[j],
      avg: s.avg[i], oavg: s.avg[j], hr: s.hr[i], ohr: s.hr[j], players: (s.p[i] || []).map(canonName), oppPlayers: (s.p[j] || []).map(canonName),
      first: fi == null ? null : fi === i, runs: R ? R[i] : null, oruns: R ? R[j] : null,
      per: s.per ? perMine(s, i, g.season) : null, p1: s.p1 ? s.p1[i] : null, p2: s.p2 ? s.p2[i] : null,
    }; });
    const sw = i ? g.s2 : g.s1, sl = i ? g.s1 : g.s2;
    // 경기 에버는 세트 기록으로 직접 계산 (포스트시즌 목록의 에버 칸은 값이 어긋나 있다)
    const sp = sum(sets, s => s.pts), si = sum(sets, s => s.inn), op = sum(sets, s => s.opp), oi = sum(sets, s => s.oinn);
    return { id: g.id, league: g.league, season: g.season, round: g.round_label, round_no: g.round_no, post: !!g.post, post_code: g.post_code,
      date: g.date, opp: i ? g.t1 : g.t2, sw, sl, win: sw > sl, draw: sw === sl, points: g.post ? null : pts3(sw, sl, g.season), avg: si ? sp / si : (i ? g.avg2 : g.avg1), oavg: oi ? op / oi : (i ? g.avg1 : g.avg2),
      hr: i ? g.hr2 : g.hr1, sets };
  }
  // 순위 표기: 1위는 진한 노란 볼드 (라운드·정규·최종 어디서나)
  const rkH = (r, suf = '위') => r ? `<b class="${r === 1 ? 'r1y' : ''}">${r}${suf}</b>` : '';
  // 팀 상징색 글자: 어두운 색은 어두운 화면에서도 읽히게 밝기만 올린다
  const tcolor = c => {
    const st = typeof TEAM_STYLE !== 'undefined' && TEAM_STYLE[c]; if (!st) return '';
    const hex = st[1] === '#1c1c1c' ? st[2] : st[1];
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (l >= .58) return hex;
    const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    let h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
    return `hsl(${Math.round(h)} ${Math.round(Math.min(1, sat) * 100)}% 62%)`;
  };
  // 팀 이름 두 줄: 1줄 회사(짧은 이름) · 2줄 팀 이름 (예: NH농협카드 / 그린포스). 회사 이름이 따로 없으면 PBA / 브레이커스
  const name2 = (c, l) => {
    const full = nameIn(c, l), sh = teamShort[c] || '';
    let i = 0, k = 0; const s0 = sh.replace(/\s/g, '');
    if (s0 && full.replace(/\s/g, '').startsWith(s0)) { while (i < full.length && k < s0.length) { if (!/\s/.test(full[i])) k++; i++; } }
    let l1 = i ? full.slice(0, i).trim() : sh, l2 = i ? full.slice(i).trim() : full;
    if (!l2) { l2 = l1; l1 = 'PBA'; }
    return `<span class="l1">${esc(l1)}</span><span class="l2">${esc(l2)}</span>`;
  };
  // 좁은 칸용 약자: 한글은 두 글자(휴온·크라), 영문은 그대로(BRK·NH). 넓을 땐 원래 약자
  const abH = c => { const a = teamAbbr(c), s = /^[A-Za-z]+$/.test(a) ? a : a.slice(0, 2); return s === a ? esc(a) : `<span class="abf">${esc(a)}</span><span class="abs">${esc(s)}</span>`; };
  const tnameH = (c, txt) => `<span class="opp tcol" data-topp="${esc(c)}" style="color:${tcolor(c)}">${esc(txt)}</span>`;
  const gamesOf = (code, filt) => D.games.filter(g => (g.t1 === code || g.t2 === code) && (!filt || filt(g))).map(g => persp(g, code));

  // 세트 흐름: 선공 → 후공 순서로 이닝 득점을 쌓아 먼저 N점 차로 앞선 쪽(lf)과 클러치 상황(cl: 두 팀 모두 남은 점수 N점 이내)
  //  N = 남자 세트 5점 · 여자 · 혼복 세트 3점
  function setFlowT(s) {
    if (!s.runs || !s.oruns || s.first == null) return null;
    const lead = /남자/.test(s.kind) ? 5 : 3, thr = s.gp > lead ? s.gp - lead : null;
    const order = s.first ? [[s.runs, 0], [s.oruns, 1]] : [[s.oruns, 1], [s.runs, 0]];
    let a = 0, b = 0, lf = 0, cl = false;
    for (let k = 0; k < Math.max(s.runs.length, s.oruns.length); k++) for (const [arr, who] of order) {
      if (arr[k] == null) continue;
      if (who) b += arr[k]; else a += arr[k];
      if (!lf) lf = a - b >= lead ? 1 : b - a >= lead ? -1 : 0;
      if (thr && a >= thr && b >= thr) cl = true;
    }
    return { lf, cl: thr ? cl : null };
  }
  // 시즌 순서 버튼을 붙이는 세부 기록 칸 (팀리그) · 누르면 index.html 이 순서를 바꾸고, 팀 칸은 여기서 다시 그린다
  const TORD_SECS = new Set(['sum', 'setno', 'kind', 'dist', 'flow', 'round', 'opp']);
  document.addEventListener('click', e => { if (e.target.closest('[data-sord]')) Object.values(panes).forEach(p => { if (p.code) p.render(); }); });
  // 팀 시즌 기록 (정규시즌 기준)
  function tcalc(gs) {
    const o = {}, sets = gs.flatMap(g => g.sets);
    o.games = gs.length; o.win = gs.filter(g => g.win).length; o.draw = gs.filter(g => g.draw).length; o.lose = o.games - o.win - o.draw; o.winRate = ratio(o.win, o.games);
    o.wl = o.draw ? `${o.win}-${o.draw}-${o.lose}` : `${o.win}-${o.lose}`;     // 무승부가 있으면 승-무-패
    const pg = gs.filter(g => g.points != null);
    o.points = pg.length ? sum(pg, g => g.points) : null; o.maxPoints = pg.length * 3; o.pointRate = ratio(o.points, o.maxPoints);
    // 세트 수: 세트 상세가 없는 경기(홈피 누락)는 최종 스코어로 센다
    o.setW = sum(gs, g => g.sets.length ? g.sets.filter(s => s.win).length : g.sw);
    o.setL = sum(gs, g => g.sets.length ? g.sets.filter(s => !s.win).length : g.sl);
    o.setRate = ratio(o.setW, o.setW + o.setL); o.setRatio = ratio(o.setW, o.setL);
    o.pts = sum(sets, s => s.pts); o.opp = sum(sets, s => s.opp); o.ptRatio = ratio(o.pts, o.opp);
    o.inn = sum(sets, s => s.inn); o.avg = ratio(o.pts, o.inn); o.oavg = ratio(o.opp, sum(sets, s => s.oinn));
    o.hr = Math.max(0, ...sets.map(s => s.hr || 0));
    // 한 경기 팀 에버 최고·최저 (세트 기록이 있는 경기)
    const ag = gs.filter(g => g.sets.length && g.avg != null);
    o.bestG = ag.reduce((m, g) => !m || g.avg > m.avg ? g : m, null); o.worstG = ag.reduce((m, g) => !m || g.avg < m.avg ? g : m, null);
    o.bestAvg = o.bestG ? o.bestG.avg : null; o.worstAvg = o.worstG ? o.worstG.avg : null;
    const fb = sets.filter(s => s.first && s.runs && s.runs.length);
    o.fbN = fb.length; o.fbSuccess = ratio(fb.filter(s => s.runs[0] > 0).length, fb.length);
    o.firstSet = ratio(sets.filter(s => s.first && s.win).length, sets.filter(s => s.first === true).length);
    o.secondSet = ratio(sets.filter(s => s.first === false && s.win).length, sets.filter(s => s.first === false).length);
    // 세트 흐름: 선제 리드(남자 세트 5점 · 여자·혼복 세트 3점) · 리드 유지 · 역전 · 세트 클러치 / 게임 클러치 = 5~7세트 승률
    flowStats(o, sets.map(s => ({ win: s.win, ...(setFlowT(s) || {}) })));
    const g57 = sets.filter(s => s.no >= 5); o.gcN = g57.length; o.gcW = g57.filter(s => s.win).length; o.gameClutch = ratio(o.gcW, o.gcN);
    // 세트 번호별
    o.byNo = {};
    sets.forEach(s => { const x = o.byNo[s.no] || (o.byNo[s.no] = { w: 0, n: 0, p: 0, i: 0, kinds: {} }); x.n++; if (s.win) x.w++; x.p += s.pts || 0; x.i += s.inn || 0; x.kinds[s.kind] = (x.kinds[s.kind] || 0) + 1; });
    // 세트 종류별
    o.byKind = {};
    sets.forEach(s => { const x = o.byKind[s.kind] || (o.byKind[s.kind] = { w: 0, n: 0, p: 0, i: 0 }); x.n++; if (s.win) x.w++; x.p += s.pts || 0; x.i += s.inn || 0; });
    // 세트 스코어 분포
    o.dist = {}; gs.forEach(g => { const k = `${g.sw}:${g.sl}`; o.dist[k] = (o.dist[k] || 0) + 1; });
    // 세트 흐름: 각 스코어에 도달한 경기 수와 그중 승리
    o.state = {}; o.after23 = { n: 0, w6: 0, win: 0 }; o.after32 = { n: 0, win: 0 };
    gs.forEach(g => {
      let a = 0, b = 0;
      g.sets.forEach((s, k) => {
        s.win ? a++ : b++;
        if (a >= 4 || b >= 4) return;
        const key = `${a}:${b}`;
        const x = o.state[key] || (o.state[key] = { n: 0, w: 0 }); x.n++; if (g.win) x.w++;
        if (a === 2 && b === 3) { o.after23.n++; if (g.sets[k + 1] && g.sets[k + 1].win) o.after23.w6++; if (g.win) o.after23.win++; }
        if (a === 3 && b === 2) { o.after32.n++; if (g.win) o.after32.win++; }
      });
    });
    return o;
  }

  // 정규시즌 순위: 홈피 공식 순위표 (없으면 승점 → 승수 → 세트득실률 → 점수득실률로 계산)
  const standingsCache = {};
  function standings(league) {
    if (standingsCache[league]) return standingsCache[league];
    const off = (D.standings || []).filter(s => s.league === league && s.team);
    if (off.length) return (standingsCache[league] = off.map(s => ({ code: s.team, rank: s.rank, logo: s.logo, stats: s.stats })));
    const codes = [...new Set(D.games.filter(g => g.league === league).flatMap(g => [g.t1, g.t2]))];
    const rows = codes.map(c => ({ code: c, ...tcalc(gamesOf(c, g => g.league === league && !g.post)) }))
      .sort((x, y) => (y.points || 0) - (x.points || 0) || y.win - x.win || (y.setRatio || 0) - (x.setRatio || 0) || (y.ptRatio || 0) - (x.ptRatio || 0));
    rows.forEach((r, i) => r.rank = i + 1);
    return (standingsCache[league] = rows);
  }
  // 포스트시즌 단계 이름: 날짜가 이른 단계부터 와일드카드 → 준PO → PO → 파이널 (단계 수에 맞춰)
  // 포스트시즌 단계 이름: 홈피 표기(와일드카드·준플레이오프·플레이오프·파이널) 그대로
  const STAGES = ['와일드카드', '준플레이오프', '플레이오프', '파이널'];
  function stageNames(league) {
    const m = {};
    D.games.filter(g => g.league === league && g.post).forEach(g => { m[g.post_code] = g.stage || m[g.post_code] || `포스트시즌 ${g.post_code}`; });
    return m;
  }
  // 포스트시즌 결과: 홈피 포스트시즌 순위(1위 우승, 2위 준우승) → 없으면 가장 높이 간 단계에서 시리즈를 이겼는지
  function postResult(code, league) {
    const gs = gamesOf(code, g => g.league === league && g.post);
    if (!gs.length) return null;
    const names = stageNames(league);
    const stage = gs.map(g => names[g.post_code]).sort((a, b) => STAGES.indexOf(b) - STAGES.indexOf(a))[0];
    const off = (D.post_standings || []).find(s => s.league === league && s.team === code);
    // '플레이오프 탈락' → 'PO컷' (준플레이오프 탈락 → 준PO컷)
    const cut = s => `${s} 탈락`.replace('플레이오프 탈락', 'PO컷');
    if (off) return off.rank === 1 ? '우승' : off.rank === 2 ? '준우승' : cut(stage);
    const st = gs.filter(g => names[g.post_code] === stage), w = st.filter(g => g.win).length;
    if (stage === '파이널') return w > st.length - w ? '우승' : '준우승';
    return cut(stage);
  }

  // 포스트시즌 실제 순위: 홈피 포스트시즌 순위. 홈피에 빠진 순위가 하나뿐이면 순위 없는 진출 팀에 채운다
  function postRank(code, league) {
    if (!gamesOf(code, g => g.league === league && g.post).length) return null;
    const ps = (D.post_standings || []).filter(s => s.league === league);
    const mine = ps.find(s => s.team === code); if (mine) return mine.rank;
    if (!ps.length) return null;
    const teams = [...new Set(D.games.filter(g => g.league === league && g.post).flatMap(g => [g.t1, g.t2]))].filter(t => !ps.some(s => s.team === t));
    const ranks = Array.from({ length: ps.length + teams.length }, (_, i) => i + 1).filter(r => !ps.some(s => s.rank === r));
    return teams.length === 1 && ranks.length === 1 ? ranks[0] : null;
  }

  // ── 리그 평균: 그 시즌(또는 전체) 모든 팀의 정규리그 기록을 합친 값 ──
  const leagueCalcCache = {};
  function leagueCalc(league) {
    const k = league || 'all';
    if (leagueCalcCache[k]) return leagueCalcCache[k];
    const gs = D.games.filter(g => !g.post && (!league || g.league === league));
    return (leagueCalcCache[k] = tcalc(gs.flatMap(g => [persp(g, g.t1), persp(g, g.t2)])));
  }
  // 그 라운드 리그 전체 기록 (리그 평균 비교용)
  const lgRoundCache = {};
  const lgRound = (league, round) => lgRoundCache[league + '|' + round] || (lgRoundCache[league + '|' + round] = tcalc(D.games.filter(g => !g.post && g.league === league && g.round_label === round).flatMap(g => [persp(g, g.t1), persp(g, g.t2)])));
  // 리그 평균과의 차이 (작은 글씨, 좋으면 초록·나쁘면 빨강). kind: 'pct' = %p, 숫자 = 소수 자리
  const dsm = (d, kind = 3) => d == null || isNaN(d) ? '' : `<small class="dsm ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d >= 0 ? '+' : ''}${kind === 'pct' ? (d * 100).toFixed(1).replace(/\.0$/, '') + '%p' : d.toFixed(kind)}</small>`;
  const lgAvgPts = league => { const n = standings(league).length; const L = leagueCalc(league); return n && L.points != null ? L.points / n : null; };
  // 라운드 순위 (그 라운드 승점 → 승수 → 세트득실률 → 점수득실률)
  const roundRankCache = {};
  function roundRanks(league, round) {
    const k = league + '|' + round;
    if (roundRankCache[k]) return roundRankCache[k];
    const codes = teamsIn(league);
    const rows = codes.map(c => ({ c, o: tcalc(gamesOf(c, g => g.league === league && !g.post && g.round_label === round)) })).filter(r => r.o.games)
      .sort((x, y) => (y.o.points || 0) - (x.o.points || 0) || y.o.win - x.o.win || (y.o.setRatio || 0) - (x.o.setRatio || 0) || (y.o.ptRatio || 0) - (x.o.ptRatio || 0));
    const m = {}; rows.forEach((r, i) => m[r.c] = i + 1);
    return (roundRankCache[k] = m);
  }
  const roundsOf = (league) => [...new Set(D.games.filter(g => g.league === league && !g.post).map(g => g.round_label))].sort((a, b) => parseInt(a) - parseInt(b));

  // ── 표 그리기 ──
  // rows: [이름, 값(o,c), 작은글씨(o,c), 설명, 비교용 숫자(o), 표시형식, 'low'(낮을수록 좋음)]
  // mode 'league' 이면 비교용 숫자가 있는 줄을 그 시즌 리그 평균과 비교해 색칠, 맨 끝에 리그 평균 열
  const th = cols => cols.map(c => `<th class="${c.tot ? 'tot' : ''}">${esc(c.label)}</th>`).join('');
  // 여러 시즌 표의 열 순서: 리그 평균 → 통산 → 이번 시즌 → 지난 시즌들(최근 → 과거)
  function grid(rows, cols0, mode, opt = {}) {
    const ss = cols0.filter(c => !c.tot).sort((a, b) => SEASON_NEW_LEFT ? leagueOf[b.league].season - leagueOf[a.league].season : leagueOf[a.league].season - leagueOf[b.league].season);
    const tot = cols0.find(c => c.tot), cols = tot ? [tot, ...ss] : cols0;   // 시즌 열: 최신부터 / 과거부터 (⇄ 버튼)
    const lgCol = (mode === 'league' || opt.league) && (tot || cols0[cols0.length - 1]).L;
    let h = `<div class="tw"><table class="grid"><thead><tr><th class="lab"></th>${lgCol ? '<th class="lg">리그 평균</th>' : ''}${th(cols)}</tr></thead><tbody>`;
    rows.forEach(([label, f, sub, desc, num, fmt, better, click]) => {
      if (label === '__grp') { h += `<tr class="grp"><th colspan="${cols.length + (lgCol ? 2 : 1)}">${esc(f)}</th></tr>`; return; }
      const lab = opt.descBelow && desc ? `${esc(label)}<span class="s" style="font-weight:400">${esc(desc)}</span>` : desc ? `<abbr title="${esc(desc)}">${esc(label)}</abbr>` : esc(label);
      const lgTd = lgCol ? `<td class="lg">${num ? (fmt || pct)(num(lgCol)) : ''}${opt.lgSub ? `<span class="s">${opt.lgSub(label, lgCol)}</span>` : ''}</td>` : '';
      h += `<tr><th class="lab">${lab}</th>${lgTd}` + cols.map(c => {
        const v = f(c.o, c), s = sub ? sub(c.o, c) : '';
        let cls = c.tot ? 'tot' : '', style = '', d = '';
        if ((mode === 'league' || opt.league) && num && c.L && v !== '' && v != null) {
          const x = vsLeague(num(c.o), num(c.L), fmt || pct, better);
          if (x && mode === 'league') { cls += ' ' + x.cls; style = x.style; d = `<span class="d">${x.txt}</span>`; }
        }
        // click: 누르면 팝업 (베스트·워스트 에버, 초구) — 그 열의 시즌(통산은 all)
        const ck = click && v !== '' && v != null ? click(c.o, c) : null;
        const ca = ck ? ` data-tkpi="${ck}" data-tlg="${c.league || 'all'}" data-label="${esc(`${c.label} ${label}`)}" data-val="${esc(String(v).replace(/<[^>]*>/g, ''))}"` : '';
        return `<td class="${cls}${ck ? ' gpop' : ''}" style="${style}"${ca}>${v ?? ''}${v !== '' && v != null && s ? `<span class="s">${s}</span>` : ''}${d}</td>`;
      }).join('') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  const leagueLabel = l => { const x = leagueOf[l]; return x ? seasonLabel(x.season) : String(l); };
  const wlOf = x => x && x.n ? `${x.w}-${x.n - x.w}` : '';
  const KABBR = { '남자복식': '남복', '여자복식': '여복', '혼합복식': '혼복', '남자단식': '단식', '여자단식': '단식' };

  // 팀 약자 (최근 5경기 칸처럼 좁은 곳에 다 보이게)
  const ABBR = [['웰컴', '웰컴'], ['크라운', '크라운'], ['NH', 'NH'], ['휴온스', '휴온스'], ['하이원', '하이원'], ['하나', '하나'], ['에스와이', 'SY'],
    ['우리', '우리'], ['하림', '하림'], ['브레이커스', 'BRK'], ['TS', 'TS'], ['블루원', '블루원'], ['SK', 'SK'], ['신한', '신한']];
  const teamAbbr = c => { const n = teamShort[c] || teamName[c] || c; const a = ABBR.find(([k]) => n.includes(k)); return a ? a[1] : n.slice(0, 3); };
  // 그 시즌 팀 명단: 캡틴 → 남자(나이 많은 순) → 여자(나이 많은 순). 명단에 없는 출전 선수는 같은 성별 끝에 붙인다
  function rosterOf(code, league, gs) {
    const ps = playerStats(gs);
    const byName = Object.fromEntries(ps.map(p => [p.name, p]));
    const rs = (D.rosters || []).filter(r => r.team === code && r.league === league);
    const out = rs.map(r => ({ name: r.canon, full: r.name, captain: !!r.captain, gender: r.gender, birth: r.birth, photo: r.photo, st: byName[r.canon] }));
    // 홈피 팀 명단에 없는데 경기에 나온 선수: 같은 시즌 다른 팀 명단에 있으면 시즌 중 이적(트레이드), 아니면 대체 선수
    const rno = r => r === '포스트시즌' ? 99 : parseInt(r, 10) || 98;
    // 출전 라운드는 기록 범위(정규리그)와 상관없이 그 시즌 포스트시즌까지 모두 센다
    const played = {};
    gamesOf(code, g => g.league === league).forEach(g => g.sets.forEach(st => st.players.forEach(n => (played[n] || (played[n] = new Set())).add(g.round))));
    ps.forEach(p => {
      if (out.some(x => x.name === p.name)) return;
      const moved = (D.rosters || []).some(r => r.league === league && r.team !== code && r.canon === p.name);
      const rounds = [...(played[p.name] || Object.keys(p.byRound))].sort((a, b) => rno(a) - rno(b)).map(r => r === '포스트시즌' ? 'PS' : r);
      out.push({ name: p.name, full: p.name, captain: false, gender: p.gender, st: p, extra: true, moved, rounds });
    });
    const key = p => [p.captain ? 0 : p.gender === 'F' ? 2 : 1, p.extra ? 1 : 0, p.birth || '9999'];
    return out.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); });
  }

  // 대체·이적 선수 표시: 몇 라운드에 나왔는지 함께 (1R · 2R → "1·2R", 포스트시즌 PS)
  const subTag = p => {
    if (!p.extra) return '';
    const rs = p.rounds || [], nums = rs.filter(r => r !== 'PS').map(r => r.replace('R', ''));
    const txt = [nums.length ? nums.join('·') + 'R' : '', rs.includes('PS') ? 'PS' : ''].filter(Boolean).join('·');
    const what = p.moved ? '이적' : '대체';
    const tip = p.moved ? '시즌 중 다른 팀으로 옮긴 선수 (이 팀에서 뛴 라운드)' : '홈피 팀 명단에 없는 대체 출전 선수 (출전 라운드)';
    return `<span class="subtag${p.moved ? ' mv' : ''}" title="${tip}">${what}${txt ? ' ' + txt : ''}</span>`;
  };

  // ── 팀 기록 질문 (로고 모서리 🔍): 개인투어 질문과 같은 방식, 팀 경기 기록에서 조건을 읽어 답한다 ──
  //  알아듣는 조건: 상대 팀(짧은 이름·약자) · 시즌(26-27, 이번/지난 시즌) · 라운드(1R…, 포스트시즌·파이널, 정규리그) · 승/패/무
  //   · 세트 스코어(4:0 …) · 셧아웃 · 풀세트 · 역전승/역전패 · 선수 이름 · 종목(단식·남복·여복·혼복)
  const TQA_EXAMPLES = ['이번 시즌 경기', '풀세트 경기', '역전승', '4:0 승리', '포스트시즌', '혼복 승률', '지난 시즌 크라운해태 상대'];
  function answerTeamQA(code, curLeague, q) {
    const t = q.trim().replace(/\s+/g, ' '); if (!t) return '';
    const flat = t.replace(/\s/g, '');
    let gs = gamesOf(code); const cond = [];
    const curSeason = leagueOf[curLeague] ? leagueOf[curLeague].season : null;
    let m;
    // 시즌
    if ((m = t.match(/(\d{2})\s*-\s*(\d{2})/))) { const s = 2000 + +m[1]; gs = gs.filter(g => g.season === s); cond.push(`${seasonLabel(s)} 시즌`); }
    else if (/이번\s*시즌|올\s*시즌|올해/.test(t)) { gs = gs.filter(g => g.season === curSeason); cond.push(`${seasonLabel(curSeason)} 시즌`); }
    else if (/지난\s*시즌|작년|전\s*시즌/.test(t)) { gs = gs.filter(g => g.season === curSeason - 1); cond.push(`${seasonLabel(curSeason - 1)} 시즌`); }
    // 정규리그 / 포스트시즌 / 라운드
    if (/포스트|플레이오프|파이널|준플/.test(t)) { gs = gs.filter(g => g.post); cond.push('포스트시즌'); }
    else if (/정규/.test(t)) { gs = gs.filter(g => !g.post); cond.push('정규리그'); }
    if ((m = t.match(/(\d)\s*(?:R\b|라운드)/i))) { gs = gs.filter(g => !g.post && String(g.round) === `${m[1]}R`); cond.push(`${m[1]}R`); }
    // 상대 팀: 짧은 이름 · 전체 이름 · 약자 중 질문에 들어 있는 가장 긴 것
    const opps = [...new Set(gamesOf(code).map(g => g.opp))];
    const keys = opps.flatMap(c => [teamShort[c], teamName[c], teamAbbr(c), ...D.teams.filter(x => x.code === c).map(x => x.name)].filter(Boolean).map(k => [k.replace(/\s/g, ''), c]))
      .filter(([k]) => k.length >= 2).sort((a, b) => b[0].length - a[0].length);
    const hit = keys.find(([k]) => flat.includes(k));
    if (hit) { gs = gs.filter(g => g.opp === hit[1]); cond.push(`vs ${teamShort[hit[1]] || hit[1]}`); }
    // 결과 · 경기 유형
    if (/역전\s*승|역전한/.test(t)) { gs = gs.filter(g => g.win && g.sets[0] && !g.sets[0].win); cond.push('역전승 (1세트 지고 이김)'); }
    else if (/역전\s*패|역전당/.test(t)) { gs = gs.filter(g => !g.win && !g.draw && g.sets[0] && g.sets[0].win); cond.push('역전패 (1세트 이기고 짐)'); }
    else if (/무승부|비긴/.test(t)) { gs = gs.filter(g => g.draw); cond.push('무승부'); }
    else if (/이긴|이겼|승리|승한/.test(t) && !/승률/.test(t)) { gs = gs.filter(g => g.win); cond.push('이긴 경기'); }
    else if (/진\s*경기|졌|패배|패한/.test(t)) { gs = gs.filter(g => !g.win && !g.draw); cond.push('진 경기'); }
    if ((m = t.match(/([0-4])\s*:\s*([0-4])/))) { const a = +m[1], b = +m[2]; gs = gs.filter(g => g.sw === a && g.sl === b); cond.push(`세트 스코어 ${a}:${b}`); }
    else if (/셧아웃|영봉|완봉/.test(t)) { gs = gs.filter(g => g.win && g.sl === 0); cond.push('셧아웃 승'); }
    if (/풀\s*세트/.test(t)) { gs = gs.filter(g => g.sw + g.sl >= 7); cond.push('풀세트(7세트)'); }
    // 선수 · 종목 (세트 단위 요약)
    const names = [...new Set(gs.flatMap(g => g.sets.flatMap(s => s.players)))].filter(Boolean).sort((a, b) => b.length - a.length);
    const who = names.find(n => n.length >= 2 && flat.includes(n.replace(/\s/g, '')));
    if (who) { gs = gs.filter(g => g.sets.some(s => s.players.includes(who))); cond.push(`${who} 출전`); }
    const KIND = [[/남(자)?\s*복/, '남자복식', '남복'], [/여(자)?\s*복/, '여자복식', '여복'], [/혼(합)?\s*복/, '혼합복식', '혼복'], [/단식/, '단식', '단식']];
    const kd = KIND.find(([re]) => re.test(t));
    const head = `<div class="qahead"><b>${esc(teamShort[code] || code)}</b>${cond.length ? ' · ' + cond.map(esc).join(' · ') : ' · 통산'}</div>`;
    if (!cond.length && !kd && !/승률|세트/.test(t))
      return `<div class="qahelp">질문에서 조건을 찾지 못했어요. 이렇게 물어보세요: ${TQA_EXAMPLES.map(x => `<button data-qex="${esc(x)}">${esc(x)}</button>`).join('')}<br><small>상대 팀 이름(예: 크라운해태, 하나), 시즌(26-27, 이번 시즌), 라운드(3R, 포스트시즌), 승/패/무, 세트 스코어(4:0), 셧아웃, 풀세트, 역전승, 선수 이름, 단식·남복·여복·혼복을 알아들어요.</small></div>`;
    if (!gs.length) return head + '<div class="qasum">조건에 맞는 경기가 없습니다.</div>';
    const W = gs.filter(g => g.win).length, Dr = gs.filter(g => g.draw).length, L = gs.length - W - Dr;
    const sw = gs.reduce((a, g) => a + (g.sets.length ? g.sets.filter(s => s.win).length : g.sw), 0), sl = gs.reduce((a, g) => a + (g.sets.length ? g.sets.filter(s => !s.win).length : g.sl), 0);
    const lines = [`<b>${gs.length}경기 ${W}승${Dr ? ` ${Dr}무` : ''} ${L}패</b> · 승률 <b>${pct(W / gs.length)}</b> · 세트 ${sw}-${sl}`];
    // 세트 단위: 선수 / 종목
    const setsOf = gs.flatMap(g => g.sets).filter(s => (!who || s.players.includes(who)) && (!kd || (kd[1] === '단식' ? s.players.length < 2 : s.kind === kd[1])));
    if (who || kd) { const w = setsOf.filter(s => s.win).length; lines.push(`${esc(who || '팀')} ${kd ? kd[2] + ' ' : ''}세트 <b>${setsOf.length}세트 ${w}승 ${setsOf.length - w}패</b> · 세트 승률 <b>${pct(setsOf.length ? w / setsOf.length : null)}</b>`); }
    const names2 = {}; [...new Set(gs.filter(g => g.post).map(g => g.league))].forEach(l => Object.assign(names2, Object.fromEntries(Object.entries(stageNames(l)).map(([k, v]) => [l + ':' + k, v]))));
    const tcode = g => `${String(g.season).slice(2)} ${g.post ? (names2[g.league + ':' + g.post_code] || 'PS').replace(/\s*\d+경기$/, '') : g.round}`;
    const wl = w => `<span class="${w ? 'w' : 'l'}">${w ? '승' : '패'}</span>`;
    const res = g => `<b class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'}${g.sw}:${g.sl}</b> <span class="qseq">${g.sets.map(s => wl(s.win)).join('')}</span>`;
    const list = gs.slice().reverse();
    const rows = list.slice(0, 20).map(g => `<tr><td>${esc(tcode(g))}</td><td><span class="opp" data-topp="${esc(g.opp)}">${esc(teamShort[g.opp] || g.opp)}</span></td><td>${res(g)}</td></tr>`).join('');
    return head + `<div class="qasum">${lines.join('<br>')}</div>
      <table class="games qatab"><thead><tr><th>대회</th><th>상대</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table>
      ${gs.length > 20 ? `<div class="note">최근 20경기만 보여줍니다 (전체 ${gs.length}경기).</div>` : ''}`;
  }
  class TeamPane {
    constructor(el, key) {
      this.el = el; this.key = key; this.code = null; this.league = null;
      this.mode = localStorageGet('tmode_' + key) || 'self';
      this.opened = JSON.parse(localStorageGet('ttiles_' + key) || '[]');
      el.addEventListener('change', e => {
        const t = e.target;
        if (!t.matches('.tseason, .tteam')) return;
        if (t.matches('.tseason')) { this.league = +t.value; if (!teamsIn(this.league).includes(this.code)) this.code = null; }
        else this.code = t.value || null;
        // 고르던 드롭다운을 그 자리에서 지우고 다시 그리면 앱 창(WebKit)이 굳을 때가 있어, 드롭다운이 닫힌 뒤에 그린다
        t.blur();
        clearTimeout(this.redrawT);
        this.redrawT = setTimeout(() => {
          const a = performance.now();
          this.render(); saveTeamHash(); renderTeamH2H();
          const ms = performance.now() - a;
          if (ms > 800 && window.uiLog) uiLog(`팀 화면 다시 그리기 ${Math.round(ms)}ms (${location.hash})`);
        }, 30);
      });
      el.addEventListener('click', e => {
        if (e.target.closest('[data-tqa]')) { this.setQa(!this.qaOpen); return; }
        if (this.qaOpen) { const inQa = e.target.closest('.qa'); if (!inQa || !e.target.closest('input, button, .opp')) { this.setQa(false); if (inQa) return; } }
        const qx = e.target.closest('[data-qex]'); if (qx) { e.preventDefault(); this.ask(qx.dataset.qex); return; }
        // 10칸에서 펼친 세부 기록: 그 안의 누를 수 없는 곳을 누르면 접힌다
        // 연승 칸: 누르면 최근 5경기 말풍선, 다른 곳을 누르면 닫힘
        const r5 = this.el.querySelector('.r5pop');
        if (e.target.closest('[data-tstreak]')) { if (r5) r5.hidden = !r5.hidden; return; }
        if (r5 && !r5.hidden && !e.target.closest('.r5pop .f5, .r5pop [data-topp]')) { r5.hidden = true; if (e.target.closest('.r5pop')) return; }
        // 육각형 말풍선이 열려 있으면: 꼭짓점이 아닌 곳을 누르면 닫기만 (섹션은 접지 않음)
        const hb = this.el.querySelector('.hexbub:not([hidden])');
        if (hb && !e.target.closest('[data-hex]')) { hb.hidden = true; return; }
        const sec = e.target.closest('.sec');
        if (sec && !e.target.closest(POP_CLICKABLE + ', [data-tclose], [data-tsec], [data-fold]')) { const id = sec.querySelector('[data-tclose]').dataset.tclose; this.opened = this.opened.filter(x => x !== id); localStorageSet('ttiles_' + this.key, JSON.stringify(this.opened)); this.renderSecs(); return; }
        const kp = e.target.closest('[data-tkpi]'); if (kp) { this.openPop(kp); return; }
        const m = e.target.closest('[data-tmode]'); if (m) { this.mode = m.dataset.tmode; localStorageSet('tmode_' + this.key, this.mode); this.render(); return; }
        const tl = e.target.closest('[data-ttile]') || e.target.closest('[data-tclose]');
        if (tl) { const id = tl.dataset.ttile || tl.dataset.tclose; this.opened = this.opened.includes(id) ? this.opened.filter(x => x !== id) : this.opened.concat(id); localStorageSet('ttiles_' + this.key, JSON.stringify(this.opened)); this.renderSecs(); return; }
        const op = e.target.closest('[data-topp]'); if (op) { const other = panes[this.key === 'a' ? 'b' : 'a']; other.league = this.league; other.code = op.dataset.topp; other.render(); saveTeamHash(); renderTeamH2H(); return; }
        const r = e.target.closest('tr.row'); if (r) { const d = r.nextElementSibling; d.hidden = !d.hidden; }
      });
    }
    render() {
      const leagues = D.leagues;
      if (!this.league) this.league = leagues[0] && leagues[0].league;
      const teams = teamsIn(this.league);
      let h = `<div class="search tsel"><select class="tseason">${leagues.map(l => `<option value="${l.league}" ${l.league === this.league ? 'selected' : ''}>${esc(seasonLabel(l.season))} 시즌</option>`).join('')}</select>
        <select class="tteam"><option value="">팀 선택</option>${teams.map(c => `<option value="${c}" ${c === this.code ? 'selected' : ''}>${esc(nameIn(c, this.league))}</option>`).join('')}</select></div>`;
      if (!this.code) { this.el.innerHTML = h + '<div class="empty">시즌과 팀을 고르세요.<br><small>경기 기록에서 상대 팀 이름을 누르면 반대쪽에 열립니다.</small></div>'; return; }
      const code = this.code, lg = this.league, mode = this.mode;
      if (this.qaCode !== code) { this.qaCode = code; this.qaText = ''; this.qaHtml = ''; }
      const reg = gamesOf(code, g => g.league === lg && !g.post);
      const o = tcalc(reg), st = standings(lg).find(r => r.code === code), ps = postResult(code, lg);
      const logo = (st && st.logo) || teamLogo[code];
      // ① 이름·로고 + 선수 명단 (캡틴 / 남자 | 여자)
      const roster = rosterOf(code, lg, reg);
      const kindLine = p => {
        if (!p.st) return '<span class="s">출전 없음</span>';
        const ks = ['남자단식', '여자단식', '남자복식', '여자복식', '혼합복식'].filter(k => p.st.byKind[k]);
        const SHORT = { 남자단식: '단', 여자단식: '단', 남자복식: '복', 여자복식: '복', 혼합복식: '혼' };   // 한 줄에 담으려고 한 글자로 (남복·여복은 '복'으로 합침)
        const merged = {}; ks.forEach(k => { const a = SHORT[k], x = p.st.byKind[k]; merged[a] = merged[a] ? { w: merged[a].w + x.w, n: merged[a].n + x.n } : { ...x }; });
        // 종목마다 작은 칩: 이름(흐린 글씨) + 승-패(굵게)
        // 단 · 복 · 혼 자리 고정: 없는 종목은 빈 칸으로 두어 줄마다 같은 종목이 같은 세로줄에
        return ['단', '복', '혼'].map((a, i) => merged[a] ? `<span class="kchip k${i}"><i>${a}</i>${wlOf(merged[a])}</span>` : '<span class="kchip empty"></span>').join('');
      };
      // 한 줄: [C] 이름 승률(승-패) · 단 8-9 · 복 13-11 · 혼 6-4
      const prow = p => `<div class="prow${p.captain ? ' cap' : ''}${p.st ? '' : ' none'}${p.extra ? (p.moved ? ' sub mv' : ' sub') : ''}">${subTag(p)}<span class="pn" title="${esc(p.name)}">${esc(p.name)}</span>
        ${p.st ? `<span class="pctb ${p.st.w / p.st.n >= 0.5 ? 'hi' : 'lo'}">${pct(p.st.w / p.st.n)}</span><span class="pwl">(${p.st.w}-${p.st.n - p.st.w})</span>` : ''}<span class="pk">${kindLine(p)}</span></div>`;
      const cap = roster.filter(p => p.captain), men = roster.filter(p => !p.captain && p.gender !== 'F'), women = roster.filter(p => !p.captain && p.gender === 'F');
      // ② 시즌 성적: 정규리그 순위·승점·승패 + 라운드별
      const rounds = roundsOf(lg);
      const rcell = r => { const x = tcalc(reg.filter(g => g.round === r)); return x.games ? x : null; };
      const streakOf = gs => { if (!gs.length) return ''; const l = gs[gs.length - 1]; if (l.draw) return '무승부'; let n = 0; for (let i = gs.length - 1; i >= 0 && gs[i].win === l.win && !gs[i].draw; i--) n++; return `${n}연${l.win ? '승' : '패'}`; };
      const allg = gamesOf(code, g => g.league === lg);
      const recent = allg.slice(-5);
      const k = (v, l, key) => `<div class="kpi click" data-tkpi="${key}" data-label="${esc(l)}"><b>${v === '' || v == null ? '–' : v}</b><span>${l} ▾</span></div>`;
      // 묶은 칸(개인투어와 같은 양식): 칸 안에서 누른 부분의 팝업만 뜬다
      const kh = ([v, l, key]) => { const t = l.replace(/<[^>]*>/g, ''); return `<div class="kh" data-tkpi="${key}" data-label="${esc(t)}"><b>${v === '' || v == null ? '–' : v}</b><span>${l}</span></div>`; };
      // 연승·연패와 최근 5경기: 로고 바로 아래에 크게
      const sk = streakOf(allg);
      // 한 경기 칸: 1줄 승패 · 2줄 상대(약자) · 3줄 세트 스코어. 아직 안 한 경기는 - / 상대 / -
      const f5 = g => `<div class="f5 ${g.win ? 'w' : g.draw ? '' : 'l'}" title="${esc(nameIn(g.opp, lg))} ${g.sw}:${g.sl}${g.date ? ' · ' + esc(g.date.slice(5, 10)) : ''}"><b>${g.win ? '승' : g.draw ? '무' : '패'}</b><small class="op">${abH(g.opp)}</small><small class="sc">${g.sw}:${g.sl}</small></div>`;
      // 이번 라운드: 홈피 일정(끝난 경기 + 남은 경기). 일정이 없는 시즌은 마지막 라운드의 경기 기록으로
      const sched = (D.schedule || []).filter(x => x.league === lg && (x.t1 === code || x.t2 === code));
      const played = (r, opp) => allg.find(g => !g.post && g.round === r && g.opp === opp);
      const sRounds = [...new Set(sched.map(x => x.round))];
      const curR = sRounds.find(r => sched.some(x => x.round === r && !played(r, x.t1 === code ? x.t2 : x.t1))) || sRounds[sRounds.length - 1] || (allg.filter(g => !g.post).pop() || {}).round;
      const thisRound = sched.length ? sched.filter(x => x.round === curR).map(x => { const opp = x.t1 === code ? x.t2 : x.t1, g = played(curR, opp); return g ? f5(g)
          : `<div class="f5 rem" title="${esc(nameIn(opp, lg))} · ${esc((x.date || '').slice(5, 10))} ${esc(x.time || '')} 예정"><b>-</b><small class="op">${abH(opp)}</small><small class="sc">-</small></div>`; })
        : allg.filter(g => !g.post && g.round === curR).map(f5);
      const formBox = `<div class="formbox"><div class="streak click ${sk.includes('승') ? 'w' : sk.includes('패') ? 'l' : ''}" data-tstreak><span>현재</span><b>${sk || '–'}</b><span class="arr">최근 5경기 ▾</span></div>
        <div class="last5 rnd"><span>이번 라운드${curR ? ` (${esc(curR)})` : ''}</span><div>${thisRound.join('')}</div></div>
        <div class="r5pop" hidden><span>최근 5경기</span><div>${recent.map(f5).join('')}</div></div></div>`;
      // 라운드별 순위·승점·승패 + 정규리그: 팀 이름 오른쪽 빈 자리에
      const roundTbl = `<div class="tround"><table class="grid"><thead><tr><th class="lab"></th>${rounds.map(r => `<th>${esc(r)}</th>`).join('')}<th class="tot">정규</th></tr></thead><tbody>
          <tr><th class="lab">순위</th>${rounds.map(r => { const rk = roundRanks(lg, r)[code]; return `<td>${rkH(rk, '')}</td>`; }).join('')}<td class="tot">${st ? rkH(st.rank, '') : ''}</td></tr>
          <tr><th class="lab">승점</th>${rounds.map(r => { const x = rcell(r); return `<td>${x && x.points != null ? x.points : ''}</td>`; }).join('')}<td class="tot">${o.points ?? ''}</td></tr>
          <tr><th class="lab">승패</th>${rounds.map(r => { const x = rcell(r); return `<td>${x ? x.wl : ''}</td>`; }).join('')}<td class="tot">${o.wl}</td></tr></tbody></table></div>`;
      // 시즌별 순위: 정규 = 정규리그 순위, 최종 = 포스트시즌까지 합친 순위(홈피 포스트시즌 순위, 못 나간 팀은 그 뒤에 정규리그 순서)
      const allLgs = D.leagues.slice().sort((a, b) => a.season - b.season);
      const finalRank = l => {
        const ps = (D.post_standings || []).filter(x => x.league === l.league); if (!ps.length) return null;
        const mine = ps.find(x => x.team === code); if (mine) return mine.rank;
        const inPs = new Set(ps.map(x => x.team));
        const rest = standings(l.league).filter(x => !inPs.has(x.code)).sort((a, b) => a.rank - b.rank);
        const i = rest.findIndex(x => x.code === code); return i < 0 ? null : ps.length + i + 1;
      };
      const rkc = r => r === 1 ? ' rk1' : r === 2 ? ' rk2' : r === 3 ? ' rk3' : '';
      const rkTd = r => `<td class="${rkc(r)}">${r ? `<b>${r}</b>` : '–'}</td>`;
      const sRows = allLgs.map(l => { const st2 = standings(l.league).find(x => x.code === code); return { l, reg: st2 ? st2.rank : null, fin: st2 ? finalRank(l) : null, in: !!st2 }; });
      const seasonRankTbl = `<div class="tsr"><table class="srank"><thead><tr><th></th>${sRows.map(x => `<th${x.l.league === lg ? ' class="now"' : ''} title="${esc(seasonLabel(x.l.season))} 시즌">${String(x.l.season).slice(2)}</th>`).join('')}</tr></thead><tbody>
        <tr><th>정규</th>${sRows.map(x => rkTd(x.reg)).join('')}</tr>
        <tr><th>최종</th>${sRows.map(x => x.in && x.fin ? rkTd(x.fin) : `<td>${x.in ? '<span class="s">진행</span>' : '–'}</td>`).join('')}</tr></tbody></table></div>`;
      h += `<div class="content"><div class="card"><div class="teamhead"><div><div class="teamid"><div class="pcol">${logo ? `<img src="${esc(logo)}">` : '<img alt="">'}<button class="qabtn${this.qaOpen ? ' on' : ''}" data-tqa title="이 팀 기록 질문하기">🔍</button></div><div>
        <h2>${name2(code, lg)}</h2><div class="who">${esc(seasonLabel(leagueOf[lg].season))} 시즌 · 정규리그 ${st ? rkH(st.rank) : ''}${ps ? ` · 포스트시즌 ${esc(ps)}` : ''}</div>
        <div class="modes"><button data-tmode="self" class="${mode === 'self' ? 'on' : ''}">팀 시즌</button><button data-tmode="league" class="${mode === 'league' ? 'on' : ''}">리그 평균</button></div></div><div class="trk">${roundTbl}${seasonRankTbl}</div></div>${formBox}</div>
        <div class="rosterbox">${cap.map(prow).join('')}<div class="rcols"><div><div class="rhead">남자</div>${men.map(prow).join('')}</div><div><div class="rhead">여자</div>${women.map(prow).join('')}</div></div></div></div>
        <div class="qa"${this.qaOpen ? '' : ' hidden'}><form class="qaf"><input class="qain" placeholder="${esc(teamShort[code] || code)} 기록에 대해 물어보세요 (예: 풀세트 경기, 크라운해태 상대)" value="${esc(this.qaText || '')}" autocomplete="off"><button type="submit">검색</button></form>
          <div class="qaex">${TQA_EXAMPLES.map(x => `<button data-qex="${esc(x)}">${esc(x)}</button>`).join('')}</div><div class="qaout">${this.qaHtml || ''}</div></div>
        <div class="kpis">${k(st ? rkH(st.rank) : '', '순위', 'rank')}${k(o.points == null ? null : `${o.points}${lgAvgPts(lg) != null ? dsm(o.points - lgAvgPts(lg), 1) : ''}`, '승점', 'points')}${k(`${o.wl}${dsm(o.winRate - leagueCalc(lg).winRate, 'pct')}`, o.draw ? '승-무-패' : '승패', 'wl')}
        ${k(`${f3(o.setRatio)}${dsm(o.setRatio - leagueCalc(lg).setRatio)}`, `세트득실 ${o.setW}-${o.setL}`, 'set')}${k(`${f3(o.ptRatio)}${dsm(o.ptRatio - leagueCalc(lg).ptRatio)}`, `점수득실 ${o.pts}:${o.opp}`, 'pt')}<div class="kpi duo tri tavg">${kh([`${f3(o.avg)}${dsm(o.avg - leagueCalc(lg).avg)}`, '팀 에버', 'avg'])}<i class="dsep">/</i>${kh([f3(o.bestAvg), '베스트<em class="ev"> 에버</em>', 'best'])}<i class="dsep">/</i>${kh([f3(o.worstAvg), '워스트<em class="ev"> 에버</em>', 'worst'])}</div></div></div>`;
      this.secs = [
        ['sum', '📊', '시즌 요약', '정규리그 · 시즌별', () => this.seasonSummary(code)],
        ['now', '📌', '이번 시즌 요약', `${seasonLabel(leagueOf[lg].season)} · 통산 · 리그 평균`, () => this.nowSummary(code, lg)],
        ['hex', '⬡', '육각형 스탯', `${seasonLabel(leagueOf[lg].season)} · 리그 평균 비교`, () => hexHtml([{ t: hexStats(code, lg), name: teamShort[code] || code, color: tcolor(code) || 'var(--accent)' }], [hexLeague(lg)])],
        ['round', '🗓', '라운드별 성적', '이번 시즌 · 전체 시즌', () => this.roundTable(code, lg)],
        ['setno', '🎯', '세트별 승률', '팀 시즌별 · 선수별', () => this.setNoTable(code, lg)],
        ['kind', '👥', '종목별 승률', '종목 · 복식 조합', () => this.kindTable(code, lg)],
        ['dist', '📐', '세트 스코어 분포', '4:0 ~ 0:4 · 리그 평균', () => this.distTable(code)],
        ['flow', '🔀', '세트 흐름', '상황별 승률 · 리버스 스윕 · 리그 평균', () => this.flowTable(code)],
        ['players', '🧑', '선수 기록', `${seasonLabel(leagueOf[lg].season)} · 홈피 소개 순서`, () => this.playerTable(code, lg, reg, gamesOf(code, g => g.league === lg && g.post))],
        ['opp', '🆚', '상대 팀별', '창단 순 · 시즌별', () => this.oppTable(code, lg)],
        ['games', '📝', '경기 기록', '줄을 누르면 세트 상세', () => this.gameList(code, lg)],
      ];
      h += `<div class="card tilecard"><div class="tiles">${this.secs.map(([id, ic, t]) => `<div class="tile${this.opened.includes(id) ? ' on' : ''}" data-ttile="${id}"><i>${ic}</i><span>${t}</span></div>`).join('')}</div></div><div class="secs"></div></div>`;
      this.el.innerHTML = h;
      this.renderSecs();
      const qf = this.el.querySelector('.qaf');
      if (qf) qf.addEventListener('submit', e => { e.preventDefault(); this.ask(qf.querySelector('.qain').value); });
      if (this.qaOpen) this.setQa(true);
    }
    // 질문 말풍선 (개인투어와 같은 동작): 로고 바로 아래에 띄운다
    setQa(open) {
      this.qaOpen = open;
      const box = this.el.querySelector('.qa'), btn = this.el.querySelector('[data-tqa]'); if (!box) return;
      box.hidden = !open; if (btn) btn.classList.toggle('on', open);
      if (!open) return;
      const card = box.closest('.card'), img = this.el.querySelector('.teamid .pcol');
      box.style.top = (img.getBoundingClientRect().bottom - card.getBoundingClientRect().top + 6) + 'px';
      box.querySelector('.qain').focus();
    }
    ask(q) {
      this.qaText = q; this.qaHtml = answerTeamQA(this.code, this.league, q);
      const box = this.el.querySelector('.qa'); if (!box) return;
      box.querySelector('.qain').value = q; box.querySelector('.qaout').innerHTML = this.qaHtml;
    }
    renderSecs() {
      const box = $('.secs', this.el); if (!box) return;
      this.el.querySelectorAll('[data-ttile]').forEach(x => x.classList.toggle('on', this.opened.includes(x.dataset.ttile)));
      box.innerHTML = this.secs.filter(s => this.opened.includes(s[0])).map(([id, ic, t, sub, body]) =>
        `<div class="card sec"><div class="sechead"><b>${ic} ${t}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${TORD_SECS.has(id) ? ordBtnH() : ''}<button class="secx" data-tclose="${id}">✕</button></div>${body()}</div>`).join('');
    }
    // 시즌별 열 (정규리그) + 통산. L = 그 시즌 리그 평균
    seasonCols(code) {
      const ls = seasonsOfTeam[code].slice().sort((a, b) => leagueOf[a].season - leagueOf[b].season);
      const cols = ls.map(l => ({ label: leagueLabel(l), league: l, o: tcalc(gamesOf(code, g => g.league === l && !g.post)), L: leagueCalc(l) }));
      cols.push({ label: '통산', tot: true, o: tcalc(gamesOf(code, g => !g.post)), L: leagueCalc(null) });
      cols.forEach(c => { c.o.dominance = dominanceOf(c.o, c.L); });   // 게임 지배력: 그 열의 리그 평균 대비
      return cols;
    }
    summaryRows(code) {
      const rank = (o, c) => { if (!c.league) return ''; const r = standings(c.league).find(x => x.code === code); return r ? rkH(r.rank) : ''; };
      return [
        ['정규리그 순위', rank], ['포스트시즌', (o, c) => { if (!c.league) return ''; const r = postRank(code, c.league); return r ? rkH(r) : esc(postResult(code, c.league) || ''); }],
        ['경기', o => o.games], ['승-(무)-패', o => o.wl],
        ['승점', o => o.points, o => o.maxPoints ? `승점률 ${pct(o.pointRate)}` : '', '이기면 3점(4:3 승은 2점), 3:4 패는 1점 · 22-23은 승점 없음'],
        ['승률', o => pct(o.winRate)],
        ['세트 승률', o => pct(o.setRate), o => `${o.setW}-${o.setL}`],
        ['세트득실률', o => f3(o.setRatio), o => `${o.setW}-${o.setL}`, '딴 세트 ÷ 내준 세트'],
        ['선제 리드', o => pct(o.leadFRate), o => `${o.leadFN}세트`, '먼저 남자 세트 5점 · 여자·혼복 세트 3점 차로 앞선 세트 비율', o => o.leadFRate, pct],
        ['선제 리드 허용', o => pct(o.leadARate), o => `${o.leadAN}세트`, '상대가 먼저 그 점수 차로 앞선 세트 비율 (낮을수록 좋음)', o => o.leadARate, pct, 'low'],
        ['리드 유지율', o => pct(o.leadKeep), o => `${o.leadFW}/${o.leadFN}`, '먼저 앞선 세트 중 이긴 비율', o => o.leadKeep, pct],
        ['역전률', o => pct(o.comeback), o => `${o.leadAW}/${o.leadAN}`, '먼저 뒤진 세트 중 뒤집고 이긴 비율', o => o.comeback, pct],
        ['세트 클러치', o => pct(o.setClutch), o => `${o.lateW}/${o.lateN}`, '클러치 상황 세트 승률: 두 팀 모두 남자 세트 5점 · 여자·혼복 세트 3점 이내로 남은 상황까지 간 세트', o => o.setClutch, pct],
        ['게임 클러치', o => pct(o.gameClutch), o => `${o.gcW}/${o.gcN}`, '경기 막판 승률: 5 · 6 · 7세트', o => o.gameClutch, pct],
        ['게임 지배력', o => f1(o.dominance), o => domSub(o), '리그 평균 = 100. 점수득실률 40% · 선제 리드 우위(선제 리드 ÷ 허용) 30% · 리드 유지율 15% · 역전률 15% (각각 그 시즌 리그 평균 대비, 10세트 미만은 빈칸)', o => o.dominance, f1],
        ['점수득실률', o => f3(o.ptRatio), o => `${o.pts}:${o.opp}`, '득점 ÷ 실점', o => o.ptRatio, f3],
        ['팀 에버', o => f3(o.avg), null, '', o => o.avg, f3],
        ['베스트 에버', o => f3(o.bestAvg), o => o.bestG ? `vs ${esc(teamAbbr(o.bestG.opp))}` : '', '한 경기 팀 최고 에버리지', null, null, null, () => 'best'],
        ['워스트 에버', o => f3(o.worstAvg), o => o.worstG ? `vs ${esc(teamAbbr(o.worstG.opp))}` : '', '한 경기 팀 최저 에버리지', null, null, null, () => 'worst'],
        ['상대 에버', o => f3(o.oavg), null, '우리 팀을 상대로 상대가 친 에버리지 (낮을수록 좋음)', o => o.oavg, f3, 'low'],
        ['하이런', o => o.hr || ''], ['초구 성공률', o => pct(o.fbSuccess), o => `${o.fbN}회`, '선공 세트 첫 이닝에 득점한 비율', o => o.fbSuccess, pct, null, () => 'fb'],
        ['선공 세트 승률', o => pct(o.firstSet), null, '', o => o.firstSet, pct], ['후공 세트 승률', o => pct(o.secondSet), null, '', o => o.secondSet, pct],
      ];
    }
    seasonSummary(code) { return grid(this.summaryRows(code), this.seasonCols(code), this.mode); }
    nowSummary(code, lg) {
      const cols = this.seasonCols(code).filter(c => c.league === lg || c.tot);
      return grid(this.summaryRows(code), cols, this.mode, { league: true }) + '<div class="note">리그 평균 = 그 시즌 모든 팀의 정규리그 기록을 합친 값 (승률·세트 승률처럼 늘 50%가 되는 항목은 비교하지 않음).</div>';
    }
    roundTable(code, lg) {
      const gs = gamesOf(code, g => g.league === lg);
      const names = stageNames(lg);
      const groups = [];
      gs.forEach(g => { const k = g.post ? names[g.post_code] : g.round; let x = groups.find(y => y.k === k); if (!x) groups.push(x = { k, post: g.post, gs: [] }); x.gs.push(g); });
      groups.sort((a, b) => (a.post - b.post) || (a.gs[0].date || '').localeCompare(b.gs[0].date || ''));
      const rows = groups.map(x => {
        const o = tcalc(x.gs), rk = x.post ? null : roundRanks(lg, x.k)[code];
        return `<tr><th class="lab">${esc(x.k)}</th><td>${rkH(rk)}</td><td>${o.wl}</td><td>${x.post || o.points == null ? '' : `<b>${o.points}</b><span class="s">${pct(o.pointRate)}</span>`}</td>
          <td>${o.setW}-${o.setL}<span class="s">${f3(o.setRatio)}</span></td><td>${f3(o.ptRatio)}<span class="s">${o.pts}:${o.opp}</span></td><td>${f3(o.avg)}</td>
          <td style="text-align:left">${x.gs.map(g => `<span class="${g.win ? 'w' : g.draw ? '' : 'l'}" title="vs ${esc(nameIn(g.opp, lg))}">${g.sw}:${g.sl}</span>`).join(' ')}</td></tr>`;
      }).join('');
      const o = tcalc(gs.filter(g => !g.post)), st = standings(lg).find(r => r.code === code);
      let h = `<div class="subhead">${seasonLabel(leagueOf[lg].season)} 시즌</div><div class="tw"><table class="grid"><thead><tr><th class="lab">라운드</th><th>순위</th><th>승-패</th><th>승점</th><th>세트</th><th>점수득실</th><th>에버</th><th style="text-align:left">경기별 세트 스코어</th></tr></thead><tbody>${rows}
        <tr class="sumrow"><th class="lab">정규리그</th><td>${st ? rkH(st.rank) : ''}</td><td>${o.wl}</td><td>${o.points == null ? '' : `<b>${o.points}</b><span class="s">${pct(o.pointRate)}</span>`}</td><td>${o.setW}-${o.setL}<span class="s">${f3(o.setRatio)}</span></td><td>${f3(o.ptRatio)}<span class="s">${o.pts}:${o.opp}</span></td><td>${f3(o.avg)}</td><td></td></tr>
        </tbody></table></div>`;
      // 전체 시즌: 라운드 × 시즌
      const ls = ordS(seasonsOfTeam[code].map(l => leagueOf[l].season)).map(s => seasonsOfTeam[code].find(l => leagueOf[l].season === s));   // 시즌 열 순서 (⇄ 버튼)
      const maxR = Math.max(...ls.map(l => roundsOf(l).length));
      h += `<div class="subhead" style="margin-top:8px">전체 시즌 (라운드 × 시즌)</div><div class="tw"><table class="grid"><thead><tr><th class="lab"></th>${ls.map(l => `<th>${esc(leagueLabel(l))}</th>`).join('')}</tr></thead><tbody>`;
      for (let i = 0; i < maxR; i++) {
        h += `<tr><th class="lab">${i + 1}R</th>` + ls.map(l => {
          const r = roundsOf(l)[i]; if (!r) return '<td></td>';
          const x = tcalc(gamesOf(code, g => g.league === l && !g.post && g.round_label === r)); if (!x.games) return '<td></td>';
          const rk = roundRanks(l, r)[code];
          return `<td><b>${x.wl}</b><span class="s">${x.points != null ? `${x.points}점 · ` : ''}${rk ? rk + '위' : ''}</span></td>`;
        }).join('') + '</tr>';
      }
      h += `<tr class="sumrow"><th class="lab">정규리그</th>${ls.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), r = standings(l).find(s => s.code === code); return `<td><b>${x.wl}</b><span class="s">${x.points != null ? `${x.points}점 · ` : ''}${r ? rkH(r.rank) : ''}</span></td>`; }).join('')}</tr>
        <tr><th class="lab">포스트시즌</th>${ls.map(l => `<td>${esc(postResult(code, l) || '')}</td>`).join('')}</tr></tbody></table></div>
        <div class="note">라운드 순위는 그 라운드 승점 → 승수 → 세트득실률 → 점수득실률로 계산. 정규리그 순위는 홈피 공식 순위.</div>`;
      return h;
    }
    setNoTable(code, lg) {
      const cols = this.seasonCols(code);
      const rows = [1, 2, 3, 4, 5, 6, 7].map(n => [`${n}세트`, o => { const x = o.byNo[n]; return x ? pct(x.w / x.n) : ''; }, o => wlOf(o.byNo[n])]);
      const kinds = cols[cols.length - 1].o.byNo;
      const kindLine = Object.keys(kinds).map(n => `${n}세트 ${Object.entries(kinds[n].kinds).sort((a, b) => b[1] - a[1])[0][0]}`).join(' · ');
      let h = grid(rows, cols, this.mode) + `<div class="note">주로 나오는 종목: ${esc(kindLine)}</div>`;
      // 세트별 선수 승률 (이번 시즌): 그 세트에서 누가 가장 잘하나
      const reg = gamesOf(code, g => g.league === lg && !g.post), roster = rosterOf(code, lg, reg).filter(p => p.st);
      const nos = [1, 2, 3, 4, 5, 6, 7].filter(n => roster.some(p => p.st.byNo[n]));
      const best = {};
      nos.forEach(n => { const c = roster.map(p => p.st.byNo[n]).filter(x => x && x.n >= 3); best[n] = c.length ? Math.max(...c.map(x => x.w / x.n)) : null; });
      h += `<div class="subhead" style="margin-top:8px">세트별 선수 승률 (${seasonLabel(leagueOf[lg].season)})</div><div class="tw"><table class="grid"><thead><tr><th class="lab">선수</th>${nos.map(n => `<th>${n}세트</th>`).join('')}</tr></thead><tbody>
        ${roster.map(p => `<tr><th class="lab">${esc(p.name)}</th>${nos.map(n => { const x = p.st.byNo[n]; if (!x) return '<td></td>'; const r = x.w / x.n; return `<td class="${x.n >= 3 && r === best[n] ? 'best' : ''}">${pct(r)}<span class="s">${wlOf(x)}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="note">밑줄 = 그 세트에서 가장 높은 승률 (3세트 이상 나간 선수 중).</div>`;
      return h;
    }
    kindTable(code, lg) {
      const cols = this.seasonCols(code);
      const kinds = ['남자복식', '여자복식', '혼합복식', '남자단식', '여자단식'];
      // 종목별: 승률(큰 글씨) · 그 종목 팀 에버(작은 글씨). 끝 칸 = 리그 평균 승률 · 리그 평균 에버
      const kAvg = x => x && x.i ? x.p / x.i : null;
      let h = grid(kinds.map(k => [k, o => { const x = o.byKind[k]; return x ? pct(x.w / x.n) : ''; }, o => { const x = o.byKind[k]; return x ? `에버 ${f3(kAvg(x))}` : ''; }, '', o => { const x = o.byKind[k]; return x ? x.w / x.n : null; }, pct]), cols, this.mode,
        { league: true, lgSub: (k, L) => L.byKind && L.byKind[k] ? `에버 ${f3(kAvg(L.byKind[k]))}` : '' }) + '<div class="note">작은 글씨 = 그 종목 팀 에버. 끝 칸 = 리그 평균 (승률 · 에버).</div>';
      // 복식 조합별: 시즌마다 한 줄 + 끝에 누적. 선수마다 득점 · 공격성공률 · 기여도(조합 득점 중 그 선수 몫)
      const m = {};
      const blank = names => ({ w: 0, n: 0, kd: 0, pl: Object.fromEntries(names.map(n => [n, { pts: 0, succ: 0, att: 0, n: 0, kpts: 0, inn: 0 }])) });
      // 이 팀에서 복식을 뛴 선수들 + 그 선수들이 다른 팀에서 뛴 복식까지 (조합 키에 팀을 붙여 따로 센다)
      const ours = new Set(gamesOf(code, g => !g.post).flatMap(g => g.sets.filter(s => s.players.length >= 2).flatMap(s => s.players)));
      D.games.filter(raw => !raw.post).forEach(raw => [raw.t1, raw.t2].forEach(side => { const g = persp(raw, side); g.sets.forEach(s => {
        if (s.players.length < 2) return;
        if (side !== code && !s.players.some(n => ours.has(n))) return;
        const names = s.players.slice().sort(), k = s.kind + '|' + names.join(' · ') + '|' + side;
        const x = m[k] || (m[k] = { names, team: side, tot: blank(names), season: {} });
        [x.tot, x.season[g.season] || (x.season[g.season] = blank(names))].forEach(b => {
          b.n++; if (s.win) b.w++; if (isKDouble(g.season, s.kind)) b.kd++;
          (s.per || []).forEach(e => { if (e && b.pl[e.name]) { const p = b.pl[e.name]; p.pts += e.pts; p.succ += e.succ; p.att += e.att; p.n++; if (e.inn != null) { p.kpts += e.pts; p.inn += e.inn; } } });
        });
      }); }));
      const sy = y => String(y).slice(2);   // 시즌은 앞 두 자리 (26)
      const tTag = c => c === code ? '' : `<span class="ttag" style="color:${tcolor(c)}">${esc(teamAbbr(c).slice(0, 2))}</span>`;
      const curNames = new Set(rosterOf(code, lg, gamesOf(code, g => g.league === lg && !g.post)).map(p => p.name));
      // 맨 위 요약: 종목마다 승률이 가장 좋은 조합 (통산·고른 시즌 모두 10경기 이상 나온 조합 중 · 승률이 같으면 많이 나온 조합)
      const ssn = leagueOf[lg].season;
      // 베스트 콤비 1·2위 (이 팀에서 뛴 조합만)
      const pickBest = (kd, get, min) => Object.keys(m).filter(k => k.startsWith(kd + '|') && m[k].team === code).map(k => ({ x: m[k], b: get(m[k]) }))
        .filter(o => o.b && o.b.n >= min).sort((p, q) => q.b.w / q.b.n - p.b.w / p.b.n || q.b.n - p.b.n).slice(0, 2);
      // 한 줄: 기간 · 이름 기여도, 이름 기여도 · 승률 · 승패 (줄바꿈 없이)
      const bestLine = (label, o) => {
        if (!o) return `<div class="bestrow"><span class="bl">${label}</span><span class="s">10경기 이상 나온 조합 없음</span></div>`;
        const tot = sum(o.x.names, q => o.b.pl[q].pts);
        const who = o.x.names.map(n => `<b class="${curNames.has(n) ? '' : 'old'}">${esc(n)}</b>${o.b.pl[n].n && tot ? `<span class="s"> ${pct(o.b.pl[n].pts / tot)}</span>` : ''}`).join(', ');
        return `<div class="bestrow"><span class="bl">${label}</span><span class="bn">${who}</span><span class="pctb hi">${pct(o.b.w / o.b.n)}</span><span class="bw">${wlOf(o.b)}</span></div>`;
      };
      const bestCards = ['남자복식', '여자복식', '혼합복식'].filter(kd => Object.keys(m).some(k => k.startsWith(kd + '|') && m[k].team === code)).map(kd => {
        const tot = pickBest(kd, x => x.tot, 10), cur = pickBest(kd, x => x.season[ssn], 10);
        return `<div class="bestcard"><h4>${kd} 베스트 콤비</h4>${tot.length ? tot.map((o, i) => bestLine(`통산 ${i + 1}`, o)).join('') : bestLine('통산', null)}${cur.length ? cur.map((o, i) => bestLine(`${sy(ssn)} ${i + 1}`, o)).join('') : bestLine(sy(ssn), null)}</div>`;
      }).join('');
      if (bestCards) h += `<div class="subhead" style="margin-top:8px">베스트 콤비</div><div class="bestgrid">${bestCards}</div>
        <div class="note">이 팀에서 통산·시즌 각각 10경기 이상 나온 조합 중 승률 1·2위 (같으면 많이 나온 조합, 이번 시즌 2위가 없으면 1위만). 이름 옆 작은 숫자 = 기여도 (그 조합 득점 중 그 선수 몫).</div>`;
      // 복식 기여도: 종목마다 선수별로 — 그 선수 누적 한 줄, 아래에 파트너별 (줄을 누르면 시즌별). 고른 시즌 팀 선수 먼저, 예전 선수는 접어 둔다
      const way = b => !b.kd ? '<span class="tag">스카치</span>' : b.kd === b.n ? '<span class="tag kd">K더블</span>' : '<span class="tag">섞임</span>';
      const statOf = (b, me) => {
        const p = b.pl[me], op = b.pl[Object.keys(b.pl).find(q => q !== me)];
        return { n: b.n, w: b.w, kd: b.kd, pts: p.pts, succ: p.succ, att: p.att, kpts: p.kpts, inn: p.inn, has: p.n, pair: p.n ? p.pts + op.pts : 0 };
      };
      const addStat = (acc, x) => { ['n', 'w', 'kd', 'pts', 'succ', 'att', 'kpts', 'inn', 'has', 'pair'].forEach(k => acc[k] = (acc[k] || 0) + x[k]); return acc; };
      const tds = x => `<td class="gs">${x.n}</td><td><b>${pct(x.w / x.n)}</b><span class="s">${wlOf(x)}</span></td><td class="gs">${x.has ? x.pts + '점' : ''}</td>`
        + `<td>${x.att ? pct(x.succ / x.att) : ''}</td><td class="ctb">${x.pair ? `<b>${pct(x.pts / x.pair)}</b>` : ''}</td><td>${x.inn ? f3(x.kpts / x.inn) : ''}</td><td>${way(x)}</td>`;
      const share = x => x.pair ? x.pts / x.pair : -1;
      const genderOf = Object.fromEntries(D.players.map(p => [p.name, p.gender]));
      const thead = '<thead><tr><th>선수 · 파트너</th><th class="gs">경기</th><th>승률</th><th class="gs">득점</th><th>공격성공률</th><th>기여도</th><th>에버</th><th>방식</th></tr></thead>';
      ['남자복식', '여자복식', '혼합복식'].forEach(kd => {
        const pairs = Object.keys(m).filter(k => k.startsWith(kd + '|')).map(k => m[k]);
        if (!pairs.length) return;
        const players = [...new Set(pairs.flatMap(x => x.names))].filter(me => ours.has(me)).map(me => {
          const mine = pairs.filter(x => x.names.includes(me)).map(x => ({ x, other: x.names.find(n => n !== me), st: statOf(x.tot, me) })).sort((p, q) => q.st.n - p.st.n);
          return { me, mine, tot: mine.reduce((acc, o) => addStat(acc, o.st), {}) };
        // 선수 순서: 누적 기여도 높은 순 (기록지 없는 선수는 뒤로). 혼복은 남자 먼저, 그다음 여자
        }).sort((p, q) => (kd === '혼합복식' ? (genderOf[p.me] === 'F') - (genderOf[q.me] === 'F') : 0) || share(q.tot) - share(p.tot) || q.tot.n - p.tot.n);
        const block = list => list.map(({ me, mine, tot }) =>
          `<tr class="pvtop"><th class="lab"><b class="${curNames.has(me) ? '' : 'old'}">${esc(me)}</b> <span class="cum">누적</span></th>${tds(tot)}</tr>`
          + mine.map(({ x, other, st }) => {
            const ss = Object.keys(x.season).map(Number).sort((p, q) => p - q);
            return `<tr class="row pvsub"><th class="lab"><span class="with">+</span> <span class="${curNames.has(other) ? '' : 'oldn'}">${esc(other)}</span>${tTag(x.team)} <span class="ssns">${ss.length > 1 ? `${sy(ss[0])}~${sy(ss[ss.length - 1])}` : sy(ss[0])}</span></th>${tds(st)}</tr>`
              + `<tr class="det" hidden><td colspan="8"><table class="grid byp"><tbody>${ss.map(y => `<tr><th class="lab">${sy(y)}${tTag(x.team)}</th>${tds(statOf(x.season[y], me))}</tr>`).join('')}</tbody></table></td></tr>`;
          }).join('')).join('');
        const cur = players.filter(p => curNames.has(p.me)), old = players.filter(p => !curNames.has(p.me));
        // 남복 · 여복 · 혼복을 따로 접었다 펼 수 있게
        h += `<details class="kdsec kd${kd[0]}" open><summary><b>${kd} 선수별 기여도</b> <span class="s">선수 누적 → 파트너별 (파트너 줄을 누르면 시즌별, 다른 팀 조합은 팀 약자 표시)</span></summary>`
          + (cur.length ? `<div class="tw"><table class="grid pairs pvsym byp">${thead}<tbody>${block(cur)}</tbody></table></div>` : '')
          + (old.length ? `<details class="oldp"><summary>예전 선수 ${old.length}명</summary><div class="tw"><table class="grid pairs pvsym byp">${thead}<tbody>${block(old)}</tbody></table></div></details>` : '')
          + '</details>';
      });
      return h + '<div class="note">기록지의 선수별 기록. 방식: <b>K더블</b> = 이닝마다 번갈아 공격(1번 선수 홀수 이닝 · 2번 짝수 이닝) — 남복 23-24까지 · 여복 25-26까지 / <b>스카치</b> = 한 이닝 안에서 번갈아 공격 — 혼복 전 시즌 · 남복 24-25부터 · 여복 26-27부터. 기여도 = 그 조합이 낸 득점 중 그 선수 몫 (누적은 모든 파트너와 낸 득점 중 몫). 공격성공률 = 성공(1점+뱅크샷) ÷ 시도. 에버 = K더블 세트에서 그 선수 득점 ÷ 자기 이닝 (스카치는 선수별 이닝이 없어 비움). 위 표는 고른 시즌의 팀 선수, 그 시즌에 없는 선수는 "예전 선수"에.</div>';
    }
    distTable(code) {
      const cols = this.seasonCols(code);
      const keys = ['4:0', '4:1', '4:2', '4:3', '3:3', '3:4', '2:4', '1:4', '0:4'];
      // 리버스 스윕: 0:3 에서 4:3 으로 이긴 경기 (반대로 3:0 에서 3:4 로 진 경기)
      const rs = [['__grp', '리버스 스윕'],
        ['0:3 → 4:3 승', o => { const x = o.state['0:3']; return x && x.w ? `${x.w}회` : (x ? '0회' : ''); }, o => { const x = o.state['0:3']; return x ? `(${x.w}/${x.n})` : ''; }, '', o => { const x = o.state['0:3']; return x ? x.w / x.n : null; }, pct],
        ['3:0 → 3:4 패', o => { const x = o.state['3:0']; return x ? `${x.n - x.w}회` : ''; }, o => { const x = o.state['3:0']; return x ? `(${x.n - x.w}/${x.n})` : ''; }, '', o => { const x = o.state['3:0']; return x ? (x.n - x.w) / x.n : null; }, pct, 'low']];
      return grid(keys.map(k => [k, o => o.dist[k] || '', o => o.dist[k] ? pct(o.dist[k] / o.games) : '', '', o => ratio(o.dist[k] || 0, o.games), pct]).concat(rs), cols, this.mode, { league: true }) + '<div class="note">작은 글씨 = 그 시즌 경기 중 비율. 리그 평균 = 그 스코어가 나온 비율(모든 팀), 리버스 스윕은 그 상황에서 뒤집은 비율.</div>';
    }
    flowTable(code) {
      const cols = this.seasonCols(code);
      const st = key => [o => { const x = o.state[key]; return x ? pct(x.w / x.n) : ''; }, o => { const x = o.state[key]; return x ? `${x.w}/${x.n}` : ''; }];
      // 줄 이름은 짧게: '1:0 → 승' = 세트 스코어가 1:0 이 된 적 있는 경기 중 이긴 비율
      const D2 = ['1:0', '0:1', '2:0', '1:1', '0:2', '3:0', '2:1', '1:2', '0:3', '3:1', '2:2', '1:3', '3:2', '2:3', '3:3'];
      const rows = D2.map(k => { const [f, s] = st(k); return [`${k} → 승`, f, s, '', o => { const x = o.state[k]; return x ? x.w / x.n : null; }, pct]; });
      const rev = [
        ['__grp', '리버스 스윕'],
        ['3:0 → 패', o => { const x = o.state['3:0']; return x ? `${x.n - x.w}회` : ''; }, o => { const x = o.state['3:0']; return x ? `${pct((x.n - x.w) / x.n)} (${x.n - x.w}/${x.n})` : ''; }, '', o => { const x = o.state['3:0']; return x ? (x.n - x.w) / x.n : null; }, pct, 'low'],
        ['0:3 → 승', o => { const x = o.state['0:3']; return x ? `${x.w}회` : ''; }, o => { const x = o.state['0:3']; return x ? `${pct(x.w / x.n)} (${x.w}/${x.n})` : ''; }, '', o => { const x = o.state['0:3']; return x ? x.w / x.n : null; }, pct],
        ['__grp', '3:2 / 2:3 상황'],
        ['3:2 경기', o => o.after32.n || '', o => o.after32.n ? `전체의 ${pct(o.after32.n / o.games)}` : ''],
        ['3:2 → 승', o => o.after32.n ? pct(o.after32.win / o.after32.n) : '', o => o.after32.n ? `${o.after32.win}승` : '', '', o => ratio(o.after32.win, o.after32.n), pct],
        ['2:3 경기', o => o.after23.n || '', o => o.after23.n ? `전체의 ${pct(o.after23.n / o.games)}` : ''],
        ['2:3 → 6세트 승', o => o.after23.n ? pct(o.after23.w6 / o.after23.n) : '', o => o.after23.n ? `${o.after23.w6}/${o.after23.n}` : '', '', o => ratio(o.after23.w6, o.after23.n), pct],
        ['2:3 → 경기 승', o => o.after23.n ? pct(o.after23.win / o.after23.n) : '', o => o.after23.n ? `${o.after23.win}/${o.after23.n}` : '', '', o => ratio(o.after23.win, o.after23.n), pct],
      ];
      return `<div class="note" style="padding:6px 14px 0"><b>2:1 → 승</b> = 세트 스코어가 2:1이 된 적 있는 경기 중 이긴 비율 (작은 글씨 이긴 경기/도달한 경기).</div><div class="flowtab">` +
        grid(rows, cols, this.mode, { league: true }) + grid(rev, cols, this.mode, { league: true }) + '</div>';
    }
    playerTable(code, lg, reg, post) {
      const roster = rosterOf(code, lg, reg).filter(p => p.st);
      if (!roster.length) return '<div class="note">기록이 없습니다.</div>';
      // 구역: 라운드별 | 승률 | 단식(마우스를 올리면 단식 에버) | 복식(남·여복) | 혼복 | 1~7세트
      //  세트 구분: 1세트 전체 · 짝수 세트 전체/우세/열세 · 3·5세트 전체/우세/동점/열세 · 7세트 전체/3:2/2:3
      const nos = [1, 2, 3, 4, 5, 6, 7].filter(n => roster.some(r => r.st.byNo[n]));
      const rounds = [...new Set(reg.map(g => g.round))];
      const SUBS = n => n === 1 ? [] : n === 7 ? [['from32', '3:2'], ['from23', '2:3']] : n % 2 ? [['lead', '우세'], ['tie', '동점'], ['trail', '열세']] : [['lead', '우세'], ['trail', '열세']];
      const cell = (x, cls = '', tip = '') => `<td class="${cls}"${tip ? ` title="${esc(tip)}"` : ''}>${x && x.n ? `<b>${pct(x.w / x.n)}</b><span class="s">${wlOf(x)}</span>` : ''}</td>`;
      const zone = i => `z${i % 2}`;
      const atkTip = a => a && a.att ? `공격 성공률 ${pct(a.succ / a.att)} (${a.succ}/${a.att})` : '';
      let h = `<div class="tw"><table class="grid ptab"><thead>
        <tr><th class="lab" rowspan="2">선수</th>${rounds.length ? `<th class="gs z1" colspan="${rounds.length}">라운드별</th>` : ''}<th class="gs z0" rowspan="2">승률</th><th class="gs z1" rowspan="2">단식</th><th class="gs z0" rowspan="2">복식</th><th class="gs z1" rowspan="2">혼복</th>
        ${nos.map((n, i) => `<th class="gs ${zone(i)}" colspan="${1 + SUBS(n).length}">${n}세트</th>`).join('')}</tr>
        <tr>${rounds.map((r, i) => `<th class="${i ? '' : 'gs'} z1">${esc(r)}</th>`).join('')}${nos.map((n, i) => `<th class="gs ${zone(i)}">전체</th>${SUBS(n).map(([, l]) => `<th class="${zone(i)}">${l}</th>`).join('')}`).join('')}</tr></thead><tbody>`;
      roster.forEach(rp => { const { name, captain, gender, extra, moved, st: p } = rp;
        const dbl = { w: 0, n: 0 }; ['남자복식', '여자복식'].forEach(k => { if (p.byKind[k]) { dbl.w += p.byKind[k].w; dbl.n += p.byKind[k].n; } });
        h += `<tr class="${extra ? (moved ? 'subrow mv' : 'subrow') : ''}"><th class="lab">${subTag(rp)}${esc(name)}${gender === 'F' ? ' <span class="tag">LPBA</span>' : ''}</th>
          ${rounds.map((r, i) => cell(p.byRound[r], `${i ? '' : 'gs'} z1`)).join('')}
          ${cell(p, 'gs z0 tot')}${cell(p.single, 'gs z1', p.single.i ? `단식 에버 ${f3(p.single.p / p.single.i)} (${p.single.p}점 / ${p.single.i}이닝)` : '')}${cell(dbl, 'gs z0', atkTip((p.atk || {}).dbl))}${cell(p.byKind['혼합복식'], 'gs z1', atkTip((p.atk || {}).mix))}
          ${nos.map((n, i) => { const z = zone(i), bs = (p.byNoSit || {})[n] || {}; return cell(p.byNo[n], `gs ${z}`) + SUBS(n).map(([k]) => cell(bs[k], z)).join(''); }).join('')}</tr>`;
      });
      h += '</tbody></table></div><div class="note">우세·동점·열세 = 그 세트가 시작될 때 팀 세트 스코어가 앞섰을 / 같았을 / 뒤졌을 때의 그 세트 승률 (1세트는 늘 0:0). 7세트: 3:2 = 3:2에서 6세트를 지고 온 7세트, 2:3 = 2:3에서 6세트를 이기고 온 7세트. 마우스를 올리면 단식 = 단식 에버, 복식·혼복 = 그 선수 공격 성공률(기록지 성공 ÷ 시도). 홈피 선수 소개 순서(캡틴 → 남자 → 여자, 나이순), 정규리그 기준.</div>';
      if (post.length) {
        const pp = playerStats(post);
        h += `<div class="subhead">포스트시즌</div><div class="tw"><table class="grid"><thead><tr><th class="lab">선수</th><th>세트</th><th>승률</th></tr></thead><tbody>${pp.map(p => `<tr><th class="lab">${esc(p.name)}</th><td>${wlOf(p)}</td><td>${pct(p.w / p.n)}</td></tr>`).join('')}</tbody></table></div>`;
      }
      return h;
    }
    oppTable(code, lg) {
      const all = gamesOf(code, g => !g.post);
      const opps = [...new Set(all.map(g => g.opp))].sort();          // 팀 코드 순 = 창단 순
      const ls = ordS(seasonsOfTeam[code].map(l => leagueOf[l].season)).map(s => seasonsOfTeam[code].find(l => leagueOf[l].season === s)).filter(l => l !== lg);   // 지난 시즌 (⇄ 버튼 순서)
      // 열 순서: 통산 → 이번 시즌 → 지난 시즌들
      const rows = opps.map(c => {
        const cur = tcalc(all.filter(g => g.opp === c && g.league === lg)), t = tcalc(all.filter(g => g.opp === c));
        return `<tr><th class="lab"><span class="opp" data-topp="${esc(c)}">${esc(teamShort[c] || teamName[c] || c)}</span></th>
          <td class="tot"><b>${t.wl}</b><span class="s">${pct(t.winRate)}</span></td><td>${t.setW}-${t.setL}</td>
          <td class="tot">${cur.games ? `<b>${cur.wl}</b>` : ''}</td><td>${cur.games ? `${cur.setW}-${cur.setL}` : ''}</td><td>${cur.games && cur.points != null ? cur.points : ''}</td>
          ${ls.map(l => { const x = tcalc(all.filter(g => g.opp === c && g.league === l)); return `<td>${x.games ? x.wl : ''}</td>`; }).join('')}</tr>`;
      }).join('');
      return `<div class="tw"><table class="grid"><thead><tr><th class="lab">상대 팀</th><th class="tot">통산</th><th>세트</th><th class="tot">이번 시즌</th><th>세트</th><th>승점</th>${ls.map(l => `<th>${esc(leagueLabel(l))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="note">팀 순서 = 창단 순 (홈피 팀 코드 순). 정규리그 기준.</div>`;
    }
    gameList(code, lg) {
      const gs = gamesOf(code, g => g.league === lg).slice().reverse(), names = stageNames(lg);
      return `<table class="games"><thead><tr><th>날짜</th><th>라운드</th><th>상대</th><th>결과</th><th>세트 흐름</th><th>승점</th><th>에버</th></tr></thead><tbody>${gs.map(g => gameRowT(g, lg, names)).join('')}</tbody></table>`;
    }
    // ── 기본정보 칸 팝업 ──
    openPop(kp) {
      closePop();
      const r = this.el.getBoundingClientRect(), w = document.createElement('div');
      w.className = 'popwrap'; w._pane = this.el;
      Object.assign(w.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      w.innerHTML = `<div class="pop"><div class="pophead"><b>${esc(teamShort[this.code])} · ${esc(kp.dataset.label)}</b><span class="popval">${esc(kp.dataset.val || ($('b', kp) || kp).textContent)}</span><button class="popx">✕</button></div><div class="popbody">${this.popBody(kp.dataset.tkpi, kp.dataset.tlg)}</div></div>`;
      w.addEventListener('click', e => {
        if (e.target === w || e.target.closest('.popx')) { closePop(); return; }
        if (!e.target.closest(POP_CLICKABLE)) { closePop(); return; }   // 누를 수 없는 곳을 누르면 닫힘
        const o = e.target.closest('[data-topp]'); if (o) { closePop(); const other = panes[this.key === 'a' ? 'b' : 'a']; other.league = this.league; other.code = o.dataset.topp; other.render(); saveTeamHash(); renderTeamH2H(); }
      });
      document.body.appendChild(w);
    }
    popBody(key, lgx) {
      const code = this.code, lg = this.league, reg = gamesOf(code, g => g.league === lg && !g.post), rounds = roundsOf(lg);
      const tbl = (head, rows) => `<table class="games"><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const byRound = f => tbl(['라운드', ...f.head], rounds.map(r => { const x = tcalc(reg.filter(g => g.round === r)); return x.games ? [`<b>${r}</b>`, ...f.cells(x, r)] : null; }).filter(Boolean));
      const byOpp = f => { const opps = [...new Set(reg.map(g => g.opp))].sort(); return tbl(['상대', ...f.head], opps.map(c => { const x = tcalc(reg.filter(g => g.opp === c)); return [`<span class="opp" data-topp="${esc(c)}">${esc(teamShort[c] || c)}</span>`, ...f.cells(x)]; })); };
      const sub = t => `<div class="subhead" style="padding:8px 0 4px">${t}</div>`;
      const seasons = seasonsOfTeam[code].slice().sort((a, b) => leagueOf[b].season - leagueOf[a].season);
      // 팝업 범위: 시즌 요약 칸에서 누르면 그 열의 시즌(통산 = null), 칩에서 누르면 지금 시즌
      const scope = lgx == null ? lg : lgx === 'all' ? null : Number(lgx);
      const scopeLab = scope == null ? '통산' : `${seasonLabel(leagueOf[scope].season)} 시즌`;
      const allSeasons = seasonsOfTeam[code].slice().sort((a, b) => leagueOf[b].season - leagueOf[a].season);
      if (key === 'best' || key === 'worst') {
        const hi = key === 'best', nm = hi ? '베스트' : '워스트';
        const all = gamesOf(code, g => !g.post).filter(g => g.sets.length && g.avg != null);
        const top = gs => gs.slice().sort((a, b) => hi ? b.avg - a.avg : a.avg - b.avg).slice(0, 5);
        const res = g => `<span class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'} ${g.sw}:${g.sl}</span>`;
        const vsT = g => `<span class="opp" data-topp="${esc(g.opp)}">${esc(teamShort[g.opp] || g.opp)}</span>`;
        const list = gs => tbl(['#', '에버', '시즌·라운드', '상대', '결과', '상대 에버'], top(gs).map((g, i) => [`${i + 1}`, `<b>${f3(g.avg)}</b>`, `${esc(seasonLabel(g.season))} ${esc(g.round)}<span class="s">${esc((g.date || '').slice(0, 10))}</span>`, vsT(g), res(g), f3(g.oavg)]));
        const one = g => g ? `<b>${f3(g.avg)}</b><span class="s">${esc(g.round)} vs ${esc(teamAbbr(g.opp))} · ${g.sw}:${g.sl}</span>` : '';
        let h = sub(`${scopeLab} ${nm} 에버 TOP5`) + list(scope == null ? all : all.filter(g => g.league === scope));
        if (scope != null) h += sub(`통산 ${nm} 에버 TOP5`) + list(all);
        return h + sub('시즌별 베스트 · 워스트 에버') + tbl(['시즌', '베스트 에버', '워스트 에버'], allSeasons.map(l => { const x = tcalc(all.filter(g => g.league === l)); return [leagueLabel(l), one(x.bestG), one(x.worstG)]; }))
          + '<div class="note">정규리그 한 경기 팀 에버리지 (팀 전체 득점 ÷ 이닝, 세트 기록이 있는 경기).</div>';
      }
      if (key === 'fb') {
        const gs = gamesOf(code, g => !g.post && (scope == null || g.league === scope));
        const m = {}, kinds = {};
        gs.forEach(g => g.sets.forEach(s => {
          if (!s.first || !s.runs || !s.runs.length) return;
          const ok = s.runs[0] > 0, solo = s.players.length < 2, kd = KABBR[s.kind] || s.kind;
          const kx = kinds[kd] || (kinds[kd] = { n: 0, ok: 0 }); kx.n++; if (ok) kx.ok++;
          s.players.forEach(n => { const x = m[n] || (m[n] = { name: n, s: { n: 0, ok: 0, p: 0 }, d: { n: 0, ok: 0 } }); const y = solo ? x.s : x.d; y.n++; if (ok) y.ok++; if (solo) y.p += s.runs[0]; });
        }));
        const rt = x => x.n ? `<b>${pct(x.ok / x.n)}</b><span class="s">${x.ok}/${x.n}</span>` : '';
        const ps = Object.values(m).sort((a, b) => b.s.n - a.s.n || b.d.n - a.d.n);
        const tot = tcalc(gs);
        return sub(`${scopeLab} 선수별 초구 성공률`) + tbl(['선수', '단식 초구', '단식 초구 평균 득점', '복식·혼복 초구 (팀)'], ps.map(p => [esc(p.name), rt(p.s), p.s.n ? f3(p.s.p / p.s.n) : '', rt(p.d)]))
          + sub('종목별 초구 성공률') + tbl(['종목', '성공률'], [['<b>전체</b>', `<b>${pct(tot.fbSuccess)}</b><span class="s">${tot.fbN}회</span>`], ...Object.entries(kinds).map(([k2, x]) => [esc(k2), rt(x)])])
          + sub('시즌별 팀 초구 성공률') + tbl(['시즌', '성공률', '리그 평균'], allSeasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l); return [leagueLabel(l), `<b>${pct(x.fbSuccess)}</b>${dsm(x.fbSuccess - L.fbSuccess, 'pct')}<span class="s">${x.fbN}회</span>`, pct(L.fbSuccess)]; }))
          + '<div class="note">초구 = 선공 세트의 첫 이닝에 1점 이상 낸 비율 (정규리그). 복식·혼복은 첫 샷을 친 선수 기록이 없어 그 세트에 나온 선수 모두에게 팀 기록으로 셈.</div>';
      }
      if (key === 'rank') {
        const st = standings(lg);
        return sub(`${seasonLabel(leagueOf[lg].season)} 정규리그 순위 (홈피 공식)`) + tbl(['순위', '팀', '승점', '승패', '세트득실', '점수득실'], st.map(s => {
          const x = tcalc(gamesOf(s.code, g => g.league === lg && !g.post));
          const me = s.code === code ? ' style="font-weight:800"' : '';
          return [rkH(s.rank, ''), `<span${me}>${tnameH(s.code, teamShort[s.code] || s.code)}</span>`, x.points ?? '', x.wl, f3(x.setRatio), f3(x.ptRatio)];
        })) + sub('라운드별 순위') + byRound({ head: ['순위', '승점', '승패'], cells: (x, r) => [rkH(roundRanks(lg, r)[code]), x.points ?? '', x.wl] })
          + sub('시즌별 순위') + tbl(['시즌', '정규리그', '포스트시즌'], seasons.map(l => { const s = standings(l).find(z => z.code === code); return [leagueLabel(l), s ? rkH(s.rank) : '', esc(postResult(code, l) || '')]; }));
      }
      if (key === 'points') return sub('라운드별 승점') + byRound({ head: ['승점', '리그 평균', '승점률', '리그 평균', '승패'], cells: (x, r) => { const L = lgRound(lg, r), n = standings(lg).length; const la = n && L.points != null ? L.points / n : null; return [`<b>${x.points ?? ''}</b>${la != null && x.points != null ? dsm(x.points - la, 1) : ''}`, la != null ? la.toFixed(1) : '', `${pct(x.pointRate)}${dsm(x.pointRate - L.pointRate, 'pct')}`, pct(L.pointRate), x.wl]; } })
        + sub('상대 팀별 승점') + byOpp({ head: ['승점', '승패'], cells: x => [`<b>${x.points ?? ''}</b>`, x.wl] })
        + sub('시즌별 승점') + tbl(['시즌', '승점', '리그 평균', '승점률', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l), la = lgAvgPts(l); return [leagueLabel(l), x.points == null ? '승점 없음' : `<b>${x.points}</b>${la != null ? dsm(x.points - la, 1) : ''}`, la != null ? la.toFixed(1) : '', x.points == null ? '' : `${pct(x.pointRate)}${dsm(x.pointRate - L.pointRate, 'pct')}`, x.points == null ? '' : pct(L.pointRate)]; }))
        + '<div class="note">리그 평균 승점 = 그 시즌(라운드) 모든 팀 승점 합 ÷ 팀 수. 승점률 = 딴 승점 ÷ 최대 승점(경기 × 3).</div>';
      if (key === 'wl') return sub('라운드별 승패') + byRound({ head: ['승패', '승률', '리그 평균'], cells: (x, r) => [`<b>${x.wl}</b>`, `${pct(x.winRate)}${dsm(x.winRate - lgRound(lg, r).winRate, 'pct')}`, pct(lgRound(lg, r).winRate)] })
        + sub('시즌별 승패') + tbl(['시즌', '승패', '승률', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l); return [leagueLabel(l), `<b>${x.wl}</b>`, `${pct(x.winRate)}${dsm(x.winRate - L.winRate, 'pct')}`, pct(L.winRate)]; }))
        + sub('상대 팀별 승패') + byOpp({ head: ['승패', '세트'], cells: x => [`<b>${x.wl}</b>`, `${x.setW}-${x.setL}`] })
        + sub('최근 10경기') + tbl(['날짜', '라운드', '상대', '결과', '세트 흐름'], reg.slice(-10).reverse().map(g => [esc((g.date || '').slice(5, 10)), g.round, `<span class="opp" data-topp="${esc(g.opp)}">${esc(teamShort[g.opp] || '')}</span>`, `<b class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'} ${g.sw}:${g.sl}</b>`, `<span class="seq">${seqHtml(g.sets)}</span>`]));
      if (key === 'set') { const o = tcalc(reg); return sub('라운드별 세트득실') + byRound({ head: ['세트득실률', '리그 평균', '세트'], cells: (x, r) => [`<b>${f3(x.setRatio)}</b>${dsm(x.setRatio - lgRound(lg, r).setRatio)}`, f3(lgRound(lg, r).setRatio), `${x.setW}-${x.setL}`] })
        + sub('시즌별 세트득실') + tbl(['시즌', '세트득실률', '리그 평균', '세트 승률', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l); return [leagueLabel(l), `<b>${f3(x.setRatio)}</b>${dsm(x.setRatio - L.setRatio)}`, f3(L.setRatio), `${pct(x.setRate)}${dsm(x.setRate - L.setRate, 'pct')}`, pct(L.setRate)]; }))
        + sub('세트 번호별') + tbl(['세트', '승률', '승-패'], Object.keys(o.byNo).map(n => [`${n}세트`, `<b>${pct(o.byNo[n].w / o.byNo[n].n)}</b>`, wlOf(o.byNo[n])])); }
      if (key === 'pt') { const o = tcalc(reg); return sub('라운드별 점수득실') + byRound({ head: ['점수득실률', '리그 평균', '득점:실점'], cells: (x, r) => [`<b>${f3(x.ptRatio)}</b>${dsm(x.ptRatio - lgRound(lg, r).ptRatio)}`, f3(lgRound(lg, r).ptRatio), `${x.pts}:${x.opp}`] })
        + sub('시즌별 점수득실') + tbl(['시즌', '점수득실률', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l); return [leagueLabel(l), `<b>${f3(x.ptRatio)}</b>${dsm(x.ptRatio - L.ptRatio)}`, f3(L.ptRatio)]; }))
        + sub('종목별 득점·실점') + tbl(['종목', '득점', '실점', '득실률'], Object.keys(o.byKind).map(k => { const s = reg.flatMap(g => g.sets).filter(z => z.kind === k), a = sum(s, z => z.pts), b = sum(s, z => z.opp); return [k, a, b, `<b>${f3(ratio(a, b))}</b>`]; })); }
      if (key === 'avg') { const o = tcalc(reg), pl = rosterOf(code, lg, reg).filter(p => p.st && p.st.single.i);
        const LK = leagueCalc(lg).byKind || {};
        return sub('라운드별 팀 에버') + byRound({ head: ['에버', '리그 평균', '상대 에버'], cells: (x, r) => [`<b>${f3(x.avg)}</b>${dsm(x.avg - lgRound(lg, r).avg)}`, f3(lgRound(lg, r).avg), f3(x.oavg)] })
          + sub('시즌별 팀 에버') + tbl(['시즌', '에버', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l); return [leagueLabel(l), `<b>${f3(x.avg)}</b>${dsm(x.avg - L.avg)}`, f3(L.avg)]; }))
          + sub('종목별 에버') + tbl(['종목', '에버', '리그 평균'], Object.keys(o.byKind).map(k => { const a = o.byKind[k].i ? o.byKind[k].p / o.byKind[k].i : null, la = LK[k] && LK[k].i ? LK[k].p / LK[k].i : null; return [k, `<b>${f3(a)}</b>${la != null && a != null ? dsm(a - la) : ''}`, f3(la)]; }))
          + sub('선수 단식 에버') + tbl(['선수', '단식 에버', '단식 승패'], pl.map(p => [esc(p.name), `<b>${f3(p.st.single.p / p.st.single.i)}</b>`, wlOf(p.st.single)]))
          + `<div class="note">리그 평균 에버 ${f3(leagueCalc(lg).avg)}</div>`; }
      return '';
    }
  }

  function gameRowT(g, lg, names, h2h) {
    return `<tr class="row"><td>${esc((g.date || '').slice(0, 10))}</td><td>${esc(g.post ? names[g.post_code] : g.round)}${h2h ? ` <span class="s" style="display:inline">${esc(seasonLabel(g.season))}</span>` : ''}</td>
      <td>${h2h ? '' : `<span class="opp" data-topp="${esc(g.opp)}">${esc(teamShort[g.opp] || nameIn(g.opp, g.league))}</span>`}</td>
      <td><span class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'}</span> <b>${g.sw}:${g.sl}</b></td><td class="seq">${seqHtml(g.sets)}</td><td>${g.points ?? ''}</td>
      <td>${f3(g.avg)}${g.oavg != null ? ` : ${f3(g.oavg)}` : ''}</td></tr>
      <tr class="det" hidden><td colspan="7"><table class="games setdet"><tbody>${g.sets.map(s => `<tr><td>${s.no}S <span class="s" style="display:inline">${esc(s.kind || '')}</span></td>
        <td class="${s.win ? 'w' : ''}">${esc(s.players.join('·'))}</td><td><b class="${s.win ? 'w' : 'l'}">${s.pts}:${s.opp}</b> <span class="s" style="display:inline">${s.inn}이닝</span></td>
        <td>${esc(s.oppPlayers.join('·'))}</td><td>에버 ${f3(s.avg)} : ${f3(s.oavg)}</td><td>HR ${s.hr ?? ''} : ${s.ohr ?? ''}</td><td>${s.first == null ? '' : s.first ? '선공' : '후공'}${s.runs && s.first ? ` · 초구 ${s.runs[0]}` : ''}</td></tr>`).join('')}</tbody></table></td></tr>`;
  }

  // 선수별 세트 기록: 세트 번호·라운드·종목별, 세트 시작 때 팀 스코어가 열세/동점/우세일 때
  function playerStats(gs) {
    const m = {};
    const add = (o, win) => { o.n++; if (win) o.w++; };
    gs.forEach(g => {
      let a = 0, b = 0;
      g.sets.forEach((s, si) => {
        const sit = a < b ? 'trail' : a > b ? 'lead' : 'tie';
        // 7세트(3:3)는 어떻게 왔는지: 6세트를 이겼으면 2:3 에서, 졌으면 3:2 에서 온 것
        const via = s.no === 7 && si > 0 ? (g.sets[si - 1].win ? 'from23' : 'from32') : null;
        s.players.forEach(n => {
          const p = m[n] || (m[n] = { name: n, w: 0, n: 0, byNo: {}, byRound: {}, byKind: {}, single: { w: 0, n: 0, p: 0, i: 0 }, double: { w: 0, n: 0 }, trail: { w: 0, n: 0 }, tie: { w: 0, n: 0 }, lead: { w: 0, n: 0 } });
          add(p, s.win);
          add(p.byNo[s.no] || (p.byNo[s.no] = { w: 0, n: 0 }), s.win);
          add(p.byRound[g.round] || (p.byRound[g.round] = { w: 0, n: 0 }), s.win);
          add(p.byKind[s.kind] || (p.byKind[s.kind] = { w: 0, n: 0 }), s.win);
          add(p[sit], s.win);
          const bs = p.byNoSit || (p.byNoSit = {}); const bx = bs[s.no] || (bs[s.no] = { lead: { w: 0, n: 0 }, trail: { w: 0, n: 0 }, tie: { w: 0, n: 0 }, from23: { w: 0, n: 0 }, from32: { w: 0, n: 0 } }); add(bx[sit], s.win); if (via) add(bx[via], s.win);
          add(s.players.length >= 2 ? p.double : p.single, s.win);
          if (s.players.length >= 2 && s.per) { const e = s.per.find(x => x && x.name === n); if (e && e.att) { const a = (p.atk || (p.atk = {}))[s.kind === '혼합복식' ? 'mix' : 'dbl'] || (p.atk[s.kind === '혼합복식' ? 'mix' : 'dbl'] = { succ: 0, att: 0 }); a.succ += e.succ; a.att += e.att; } }
          if (s.players.length < 2) { p.single.p += s.pts || 0; p.single.i += s.inn || 0; }
        });
        s.win ? a++ : b++;
      });
    });
    const gmap = Object.fromEntries(D.players.map(p => [p.name, p.gender]));
    return Object.values(m).map(p => ({ ...p, gender: gmap[p.name] })).sort((a, b) => b.n - a.n);
  }

  // 팀 목록은 창단 순 (홈피 팀 코드 순: 웰컴 T00002 → 크라운해태 T00003 → …)
  const teamsIn = l => [...new Set(D.games.filter(g => g.league === l).flatMap(g => [g.t1, g.t2]))].sort();
  const nameIn = (c, l) => (D.teams.find(t => t.code === c && t.league === l) || {}).name || teamName[c] || c;

  // ── 두 팀 상대 전적 (시즌별로 끊어 보기 + 선수끼리 맞대결) ──
  let h2hSeason = 'all';
  function renderTeamH2H() {
    const el = $('#th2h'), A = panes.a, B = panes.b;
    syncTbcBtn();
    if (window.renderLive) window.renderLive();
    if (!A.code || !B.code || A.code === B.code) { el.innerHTML = ''; return; }
    const allGs = gamesOf(A.code, g => g.t1 === B.code || g.t2 === B.code);
    const an = teamShort[A.code] || A.code, bn = teamShort[B.code] || B.code;
    if (!allGs.length) { el.innerHTML = `<details><summary><span class="vs">${esc(an)} vs ${esc(bn)}</span><span style="color:var(--sub)">맞대결 기록 없음</span></summary></details>`; return; }
    const seasons = [...new Set(allGs.map(g => g.league))].sort((a, b) => leagueOf[b].season - leagueOf[a].season);
    if (h2hSeason !== 'all' && !seasons.includes(h2hSeason)) h2hSeason = 'all';
    const gs = h2hSeason === 'all' ? allGs : allGs.filter(g => g.league === h2hSeason);
    const o = tcalc(gs);
    const open = localStorageGet('th2h_open') === '1';
    // 선수별 상대 팀 전적 (양 팀 대칭): 승률·승패, 단식·남복·여복·혼복, 시즌별
    const KINDS = [['단식', k => k === '남자단식' || k === '여자단식'], ['남복', k => k === '남자복식'], ['여복', k => k === '여자복식'], ['혼복', k => k === '혼합복식']];
    // 선수마다: 첫 줄 = 전체(합계), 그 밑 = 시즌별. 칸 = 계 · 단식 · 남복 · 여복 · 혼복 (각각 승패 + 승률)
    const sideTable = (team, oppName, list) => {
      const m = {};
      const add = (o, win) => { o.n++; if (win) o.w++; };
      const blank = () => ({ all: { w: 0, n: 0 }, kind: {} });
      list.forEach(g => g.sets.forEach(s => s.players.forEach(n => {
        const x = m[n] || (m[n] = { tot: blank(), season: {} });
        const kd = KINDS.find(([, f]) => f(s.kind));
        [x.tot, x.season[g.league] || (x.season[g.league] = blank())].forEach(b => { add(b.all, s.win); if (kd) add(b.kind[kd[0]] || (b.kind[kd[0]] = { w: 0, n: 0 }), s.win); });
      })));
      const lg = h2hSeason === 'all' ? team.league : h2hSeason;
      const order = rosterOf(team.code, lg, gamesOf(team.code, g => g.league === lg)).map(p => p.name);
      const names = Object.keys(m).sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99) || m[b].tot.all.n - m[a].tot.all.n);
      const c = (x, cls = '') => `<td class="${cls}">${x && x.n ? `${wlOf(x)}<span class="s">${pct(x.w / x.n)}</span>` : ''}</td>`;
      const cells = b => c(b.all, 'gs z0') + KINDS.map(([k], i) => c(b.kind[k], `gs z${(i + 1) % 2}`)).join('');
      const body = names.map(n => {
        const x = m[n], ss = Object.keys(x.season).map(Number).sort((a, b) => leagueOf[b].season - leagueOf[a].season);
        return `<tr class="pvtop"><th class="lab"><b>${esc(n)}</b></th><td class="ssn">${h2hSeason === 'all' ? '전체' : esc(leagueLabel(h2hSeason))}</td>${cells(x.tot)}</tr>`
          + (h2hSeason === 'all' ? ss.map(l => `<tr class="pvsub"><th class="lab"></th><td class="ssn">${esc(leagueLabel(l))}</td>${cells(x.season[l])}</tr>`).join('') : '');
      }).join('');
      return `<div><h4>${esc(teamShort[team.code])} 선수 <span class="s" style="display:inline">vs ${esc(oppName)}</span></h4><div class="tw"><table class="grid pvsym"><thead><tr><th class="lab">선수</th><th>시즌</th><th class="gs z0">계</th>${KINDS.map(([n], i) => `<th class="gs z${(i + 1) % 2}">${n}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
    };
    const gsB = gs.map(g => persp(D.games.find(x => x.id === g.id), B.code));
    const ptable = `<div class="pvgrid">${sideTable(A, bn, gs)}${sideTable(B, an, gsB)}</div>`;
    el.innerHTML = `<details ${open ? 'open' : ''}><summary><span class="vs">${esc(an)} vs ${esc(bn)}</span>
      <span>${h2hSeason === 'all' ? '통산' : esc(leagueLabel(h2hSeason))} <b class="big">${o.games}</b>회</span><span><b class="big w">${o.win}</b>승 ${o.draw ? `<b class="big">${o.draw}</b>무 ` : ''}<b class="big l">${o.lose}</b>패</span><span>세트 <b>${o.setW}:${o.setL}</b></span>
      <span>에버 <b>${f3(o.avg)}</b> : <b>${f3(o.oavg)}</b></span><span style="margin-left:auto;color:var(--sub)">▾ 펼치기</span></summary>
      <div class="body"><div class="h2hseasons"><button data-h2hs="all" class="${h2hSeason === 'all' ? 'on' : ''}">통산</button>${seasons.map(l => { const x = tcalc(allGs.filter(g => g.league === l)); return `<button data-h2hs="${l}" class="${h2hSeason === l ? 'on' : ''}">${esc(leagueLabel(l))} <span>${x.wl}</span></button>`; }).join('')}</div>
      <table class="games"><thead><tr><th>날짜</th><th>라운드</th><th></th><th>결과 (${esc(an)} 기준)</th><th>세트 흐름</th><th>승점</th><th>에버</th></tr></thead><tbody>${gs.slice().reverse().map(g => gameRowT(g, g.league, stageNames(g.league), true)).join('')}</tbody></table>
      <div class="subhead" style="padding:10px 0 4px;font-weight:700;color:var(--ink)">선수별 상대 전적 ${h2hSeason === 'all' ? '(통산 · 시즌별)' : `(${esc(leagueLabel(h2hSeason))})`}</div>
      ${ptable}
      <div class="note">그 선수가 이 맞대결에서 나간 세트의 승패. 선수 순서는 팀 명단(캡틴 → 남자 → 여자, 나이순).</div></div></details>`;
    $('details', el).addEventListener('toggle', e => localStorageSet('th2h_open', e.target.open ? '1' : '0'));
    $('.body', el).addEventListener('click', e => {
      const b = e.target.closest('[data-h2hs]'); if (b) { h2hSeason = b.dataset.h2hs === 'all' ? 'all' : +b.dataset.h2hs; localStorageSet('th2h_open', '1'); renderTeamH2H(); return; }
      const r = e.target.closest('tr.row'); if (r) { const d = r.nextElementSibling; d.hidden = !d.hidden; }
    });
  }
  function saveTeamHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    q.set('app', 'team');
    [['ta', panes.a], ['tb', panes.b]].forEach(([k, p]) => p.code ? q.set(k, `${p.league}:${p.code}`) : q.delete(k));
    history.replaceState(null, '', '#' + q.toString());
    // 고르는 즉시 저장 (앱을 다시 켜도 보던 팀이 열리게)
    [['ta', panes.a], ['tb', panes.b]].forEach(([k, p]) => p && p.code && localStorageSet('team_' + k, `${p.league}:${p.code}`));
  }

  async function load() {
    D = await api('/api/team/all');
    leagueOf = Object.fromEntries(D.leagues.map(l => [l.league, l]));
    canonMap = {};
    const latest = {};
    // 대표 이름: 한글이 들어간 가장 짧은 표기 (쿠드롱 · Q.응우옌 · 마민껌 · 히다 …)
    const score = n => (/[가-힣]/.test(n) ? 0 : 100) + n.length;
    D.players.filter(p => p.pid).forEach(p => { if (!latest[p.pid] || score(p.name) < score(latest[p.pid])) latest[p.pid] = p.name; });
    // "이영훈 / 이영훈1"처럼 숫자만 다른 이름은 동명이인일 수 있어 합치지 않는다
    //  같은 사람으로 확인된 이름은 SAME_PERSON 에 적어 합친다 (사용자 확인)
    const SAME_PERSON = { '이영훈1': '이영훈', '최원준1': '최원준', '김형곤1': '김형곤', '김현우1': '김현우' };
    const bare = s => s.replace(/\d+$/, '');
    D.players.filter(p => p.pid).forEach(p => { const t = latest[p.pid]; if (t !== p.name && bare(t) !== bare(p.name)) canonMap[p.name] = t; });
    Object.entries(SAME_PERSON).forEach(([a, b]) => { canonMap[a] = canonMap[b] || b; });
    (D.rosters || []).forEach(r => { if (r.game_name) r.game_name = canonName(r.game_name); r.canon = latest[r.mem] || canonName(r.game_name || r.name); });
    aliasOf = {};
    D.players.forEach(p => { const c = canonName(p.name); (aliasOf[c] || (aliasOf[c] = new Set())).add(p.name); });
    Object.keys(aliasOf).forEach(c => aliasOf[c] = [...aliasOf[c]]);
    // 기록지에만 쓰이는 줄인 이름 (머리글자만 보면 P.응우옌 · Q.응우옌과 헷갈려서 하나씩 적는다)
    const SHEET_NAME = { 'D.응우옌': '응우옌득아인찌엔', 'G. 호프만': '글렌 호프만', '즈엉': '즈엉 아잉 부', '우이마즈': '비롤 우이마즈' };
    Object.entries(SHEET_NAME).forEach(([sheet, full]) => { const c = canonName(full); (aliasOf[c] || (aliasOf[c] = [])).push(sheet); });
    D.players.forEach(p => { p.name = canonName(p.name); });
    D.teams.slice().sort((a, b) => a.season - b.season).forEach(t => { teamName[t.code] = t.name; teamShort[t.code] = t.short; if (t.logo) teamLogo[t.code] = t.logo; });
    seasonsOfTeam = {};
    D.games.forEach(g => [g.t1, g.t2].forEach(c => { (seasonsOfTeam[c] || (seasonsOfTeam[c] = new Set())).add(g.league); }));
    Object.keys(seasonsOfTeam).forEach(c => seasonsOfTeam[c] = [...seasonsOfTeam[c]]);
    [standingsCache, leagueCalcCache, roundRankCache].forEach(c => Object.keys(c).forEach(k => delete c[k]));
  }
  // ── 팀리그 방송 요약 ──────────────────────────────────────
  // 순서: ① 관전 포인트 ② 시즌 기록·상대 전적 ③ 세트별 승률 ④ 종목별 승률 ⑤ 세트 흐름 ⑥ 주요 선수
  let tbcScope = localStorageGet('tbc_scope') || 'season';
  const TBC_SCOPES = [['season', '선택 시즌'], ['two', '최근 2시즌'], ['all', '통산']];
  const scopeLeagues = (p, scope) => {
    if (scope === 'all') return null;
    const s = leagueOf[p.league].season;
    return D.leagues.filter(l => scope === 'season' ? l.league === p.league : l.season >= s - 1 && l.season <= s).map(l => l.league);
  };
  const regGames = (p, scope) => { const ls = scopeLeagues(p, scope); return gamesOf(p.code, g => !g.post && (!ls || ls.includes(g.league))); };

  // 관전 포인트 (개인투어와 같은 틀): 키워드 칸 + 짧은 항목들을 · 로 이어 쓴다
  function tTalking(A, B, h2h) {
    const an = teamShort[A.code] || A.code, bn = teamShort[B.code] || B.code, pts = [];
    const kw = t => `<span class="kw">${t}</span>`;
    if (h2h.length) {
      const o = tcalc(h2h), last = h2h[h2h.length - 1], cur = h2h.filter(g => g.league === A.league), oc = tcalc(cur);
      const lead = o.win === o.lose ? `${o.win}승${o.draw ? ` ${o.draw}무` : ''} ${o.lose}패 팽팽` : `<b>${esc(o.win > o.lose ? an : bn)}</b> ${Math.max(o.win, o.lose)}승${o.draw ? ` ${o.draw}무` : ''} ${Math.min(o.win, o.lose)}패 우세`;
      const bits = [`${o.games}전`, lead];
      if (cur.length) bits.push(`이번 시즌 ${oc.wl}`);
      bits.push(`최근 ${String(last.season).slice(2)} ${last.post ? stageNames(last.league)[last.post_code] : last.round} ${esc(last.win ? an : last.draw ? '무' : bn)} ${last.win ? `${last.sw}:${last.sl}` : `${last.sl}:${last.sw}`}`);
      pts.push(`${kw('상대 전적')} ${bits.join(' · ')}`);
    } else pts.push(`${kw('상대 전적')} <b>첫 맞대결</b>`);
    for (const p of [A, B]) {
      const n = esc(teamShort[p.code] || p.code), reg = gamesOf(p.code, g => g.league === p.league && !g.post), o = tcalc(reg), L = leagueCalc(p.league);
      const st = standings(p.league).find(r => r.code === p.code);
      let streak = 0; for (let i = reg.length - 1; i >= 0 && reg[i].win === reg[reg.length - 1].win && !reg[i].draw; i--) streak++;
      const lastW = reg.length && reg[reg.length - 1].win;
      const curRound = reg.length ? reg[reg.length - 1].round : null, ro = tcalc(reg.filter(g => g.round === curRound));
      const bits = [st ? `<b>${st.rank}위</b>` : '', o.wl, o.points != null ? `승점 ${o.points}` : '', `에버 ${f3(o.avg)}<small> (리그 ${f3(L.avg)})</small>`];
      if (curRound) bits.push(`${curRound} ${ro.wl}`);
      if (streak >= 3) bits.push(`<b>${streak}연${lastW ? '승' : '패'}</b>`);
      else if (reg.length) bits.push(`최근 ${reg.slice(-5).map(g => g.win ? '승' : g.draw ? '무' : '패').join('')}`);
      pts.push(`${kw(n)} ${bits.filter(Boolean).join(' · ')}`);
      // 강점 · 약점: 리그 평균보다 앞서거나 뒤지는 것 (세트 번호 5세트 이상 · 클러치 · 1세트 패 후 역전 · 3:2 마무리 · 남녀 승률)
      const X = hexLeague(p.league), H = hexStats(p.code, p.league), c = H.c, flow = o.state['0:1'], f32 = o.after32, Lf = L.state['0:1'], L32 = L.after32;
      const cand = Object.entries(o.byNo).filter(([, x]) => x.n >= 5).map(([k, x]) => ({ t: `${k}세트`, v: x.w / x.n, l: .5 }));
      if (c.all.n >= 5) cand.push({ t: '클러치', v: rt(c.all), l: rt(X.c.all) });
      if (flow && flow.n >= 3 && Lf) cand.push({ t: '1세트 패 후 역전', v: flow.w / flow.n, l: Lf.w / Lf.n });
      if (f32.n >= 3 && L32.n) cand.push({ t: '3:2 마무리', v: f32.win / f32.n, l: L32.win / L32.n });
      if (H.m.n >= 5) cand.push({ t: '남자 승률', v: rt(H.m), l: .5 }); if (H.w.n >= 5) cand.push({ t: '여자 승률', v: rt(H.w), l: .5 });
      const one = x => `${x.t} <b>${pct(x.v)}</b><small> (리그 ${pct(x.l)})</small>`;
      const good = cand.filter(x => x.v - x.l > .03).sort((a, b) => (b.v - b.l) - (a.v - a.l)).slice(0, 3);
      const bad = cand.filter(x => x.v - x.l < -.03).sort((a, b) => (a.v - a.l) - (b.v - b.l)).slice(0, 2);
      if (good.length) pts.push(`${kw(`${n} 강점`)} ${good.map(one).join(' · ')}`);
      if (bad.length) pts.push(`${kw(`${n} 약점`)} ${bad.map(one).join(' · ')}`);
      const pl = playerStats(reg).filter(x => x.n >= 6).sort((a, b) => b.w / b.n - a.w / a.n)[0];
      if (pl) pts.push(`${kw(`${n} 주목`)} <b>${esc(pl.name)}</b> · 세트 ${pl.w}-${pl.n - pl.w} (${pct(pl.w / pl.n)})${pl.single.i ? ` · 단식 에버 ${f3(pl.single.p / pl.single.i)}` : ''}`);
    }
    return pts;
  }

  // ── 육각형 스탯: 시계 방향으로 승점 · 세트득실 · 팀 에버 · 남자 승률 · 여자 승률 · 클러치 (정규리그) ──
  const MEN = new Set(['남자단식', '남자복식']), WOMEN = new Set(['여자단식', '여자복식']);
  const rt = x => x && x.n ? x.w / x.n : null;
  // 클러치: 5~7세트. 추격 = 세트 스코어가 뒤진 채 시작한 세트, 마무리 = 앞선 채 시작한 세트
  function clutchOf(gs) {
    const z = () => ({ w: 0, n: 0 }), o = { all: z(), trail: z(), lead: z(), tie: z(), s7: z() };
    gs.forEach(g => { let a = 0, b = 0; g.sets.forEach(s => {
      if (s.no >= 5) { const k = a < b ? 'trail' : a > b ? 'lead' : 'tie'; [o.all, o[k]].concat(s.no === 7 ? [o.s7] : []).forEach(x => { x.n++; if (s.win) x.w++; }); }
      s.win ? a++ : b++;
    }); });
    return o;
  }
  const kindWL = (gs, set) => { const x = { w: 0, n: 0, k: {} }; gs.forEach(g => g.sets.forEach(s => { if (!set.has(s.kind)) return; x.n++; if (s.win) x.w++; const y = x.k[s.kind] || (x.k[s.kind] = { w: 0, n: 0 }); y.n++; if (s.win) y.w++; })); return x; };
  const hexCache = {};
  // 축 순서(시계 방향, 12시부터): 승점 · 여자 승률 · 팀 에버 · 클러치 · 세트 승률 · 남자 승률 (= 2시 여자, 4시 팀 에버, 6시 클러치, 8시 세트 승률, 10시 남자)
  function hexStats(code, lg) {
    const key = code + '|' + lg; if (hexCache[key]) return hexCache[key];
    const reg = gamesOf(code, g => g.league === lg && !g.post), o = tcalc(reg), c = clutchOf(reg), m = kindWL(reg, MEN), w = kindWL(reg, WOMEN);
    return (hexCache[key] = { code, lg, o, c, m, w, v: [o.points != null ? o.pointRate : o.winRate, rt(w), o.avg, rt(c.all), o.setRate, rt(m)] });
  }
  // 리그: 평균값 + 팀별 값(축마다 순위 · 그림 범위)
  function hexLeague(lg) {
    const key = 'L|' + lg; if (hexCache[key]) return hexCache[key];
    const teams = teamsIn(lg).map(c => hexStats(c, lg)).filter(t => t.o.games);
    const L = leagueCalc(lg), c = clutchOf(D.games.filter(g => g.league === lg && !g.post).flatMap(g => [persp(g, g.t1), persp(g, g.t2)]));
    return (hexCache[key] = { lg, teams, pool: teams.map(t => t.v), L, c, v: [L.points != null ? L.pointRate : L.winRate, .5, L.avg, rt(c.all), .5, .5] });
  }
  const wlS = x => x && x.n ? `${pct(x.w / x.n)} <small>${x.w}-${x.n - x.w}</small>` : '–';
  // 축: 이름 · 대표 수치 · 리그 평균 대표 수치 · 말풍선 줄 [이름, 팀 값, 리그 값] · 설명
  const HEX = [
    { n: '승점', main: t => t.o.points != null ? String(t.o.points) : pct(t.o.winRate), lgMain: X => X.L.points != null ? lgAvgPts(X.lg).toFixed(1) : '50%',
      rows: [['승점', t => t.o.points ?? '–', X => X.L.points != null ? lgAvgPts(X.lg).toFixed(1) : '–'], ['승점률', t => pct(t.o.pointRate), X => pct(X.L.pointRate)], ['승패', t => `${t.o.wl} <small>${pct(t.o.winRate)}</small>`, () => '50%']],
      note: '승점이 없는 시즌(22-23)은 승률로 그림. 리그 평균 승점 = 모든 팀 승점 합 ÷ 팀 수.' },
    { n: '여자 승률', main: t => pct(rt(t.w)), lgMain: () => '50%',
      rows: [['여자 세트', t => wlS(t.w), () => '50%'], ['여자단식', t => wlS(t.w.k['여자단식']), () => '50%'], ['여자복식', t => wlS(t.w.k['여자복식']), () => '50%']], note: '여자단식 + 여자복식 세트 승률 (혼복 제외).' },
    { n: '팀 에버', main: t => f3(t.o.avg), lgMain: X => f3(X.L.avg),
      rows: [['팀 에버', t => f3(t.o.avg), X => f3(X.L.avg)], ['상대 에버', t => f3(t.o.oavg), X => f3(X.L.avg)], ['점수득실률', t => f3(t.o.ptRatio), X => f3(X.L.ptRatio)]], note: '팀 전체 득점 ÷ 이닝.' },
    { n: '클러치', main: t => pct(rt(t.c.all)), lgMain: X => pct(rt(X.c.all)),
      rows: [['5~7세트', t => wlS(t.c.all), X => pct(rt(X.c.all))], ['추격 <small>뒤진 채 시작</small>', t => wlS(t.c.trail), X => pct(rt(X.c.trail))], ['마무리 <small>앞선 채 시작</small>', t => wlS(t.c.lead), X => pct(rt(X.c.lead))],
        ['동점에서', t => wlS(t.c.tie), X => pct(rt(X.c.tie))], ['7세트 (3:3)', t => wlS(t.c.s7), () => '50%']], note: '5·6·7세트 승률. 추격 = 세트 스코어가 뒤진 채 시작한 세트, 마무리 = 앞선 채 시작한 세트.' },
    { n: '세트 승률', main: t => pct(t.o.setRate), lgMain: () => '50%',
      rows: [['세트 승률', t => pct(t.o.setRate), () => '50%'], ['세트', t => `${t.o.setW}-${t.o.setL}`, () => ''], ['세트득실률', t => f3(t.o.setRatio), X => f3(X.L.setRatio)]], note: '딴 세트 ÷ 치른 세트.' },
    { n: '남자 승률', main: t => pct(rt(t.m)), lgMain: () => '50%',
      rows: [['남자 세트', t => wlS(t.m), () => '50%'], ['남자단식', t => wlS(t.m.k['남자단식']), () => '50%'], ['남자복식', t => wlS(t.m.k['남자복식']), () => '50%']], note: '남자단식 + 남자복식 세트 승률 (혼복 제외).' },
  ];
  const hexHtml = (list, Xs) => hexChart(HEX, list, Xs, '그 시즌 팀들');

  // ── 팀 세 기간 (개인투어 방송 요약의 이번 대회·시즌·통산과 같은 틀): 이번 라운드 · 이번 시즌(정규) · 통산(정규) ──
  function periods(code, lg) {
    const reg = gamesOf(code, g => g.league === lg && !g.post);
    const r = reg.length ? reg[reg.length - 1].round : null;
    return { code, lg, rname: r, reg, round: tcalc(reg.filter(g => g.round === r)), season: tcalc(reg), all: tcalc(gamesOf(code, g => !g.post)) };
  }
  // 세 기간 비교 표: 라운드 | 시즌 | 통산 | 항목 | 통산 | 시즌 | 라운드 (같은 기간끼리 더 좋은 쪽 강조)
  //  rows: [항목, (그 기간 기록 o, 기간 키, 팀 묶음 P) → { v: 비교값, t: 보이는 값, s: 작은 글씨 } | null, 'high'|'low'|'none'] · '#' 로 시작하면 소제목
  function tri3(an, bn, PA, PB, sl, rows, cls = 'bc3', mid = '') {
    const head = `<thead><tr><th colspan="3" class="nm a">${esc(an)}</th><th></th><th colspan="3" class="nm b">${esc(bn)}</th></tr>
      <tr><th class="pt">이번 라운드<small>${esc(PA.rname || '')}</small></th><th class="ps">${esc(sl)} 시즌</th><th class="pa">통산</th><th></th><th class="pa">통산</th><th class="ps">${esc(sl)} 시즌</th><th class="pt">이번 라운드<small>${esc(PB.rname || '')}</small></th></tr></thead>`;
    const body = rows.map(([label, get, better = 'high']) => {
      if (label.startsWith('#')) return `<tr class="grp"><th colspan="7">${label.slice(1)}</th></tr>`;
      const td = (P, Q, k, c) => {
        const x = get(P[k], k, P), y = get(Q[k], k, Q);
        const ok = better !== 'none' && x && y && x.v != null && y.v != null && !isNaN(x.v) && !isNaN(y.v) && x.v !== y.v;
        const win = ok && (better === 'high' ? x.v > y.v : x.v < y.v);
        return `<td class="${c}${win ? ' win' : ''}">${(x && x.t) || '–'}${x && x.s ? `<small>${x.s}</small>` : ''}</td>`;
      };
      return `<tr>${td(PA, PB, 'round', 'pt')}${td(PA, PB, 'season', 'ps')}${td(PA, PB, 'all', 'pa')}<th${mid ? ` class="${mid}"` : ''}>${label}</th>${td(PB, PA, 'all', 'pa')}${td(PB, PA, 'season', 'ps')}${td(PB, PA, 'round', 'pt')}</tr>`;
    }).join('');
    return `<div class="tw"><table class="${cls}">${head}<tbody>${body}</tbody></table></div>`;
  }
  // 값 하나를 { v, t, s } 로 (기록이 없으면 null)
  const g3 = (f, fmt = pct, sub) => o => { if (!o || !o.games) return null; const v = f(o); return v == null || isNaN(v) ? null : { v, t: fmt(v), s: sub ? sub(o) : '' }; };
  const rank3 = (o, k, P) => { const r = k === 'round' ? roundRanks(P.lg, P.rname)[P.code] : k === 'season' ? (standings(P.lg).find(x => x.code === P.code) || {}).rank : null; return r ? { v: -r, t: rkH(r) } : null; };
  const mainKindOf = o => n => { const x = o.byNo[n]; return x ? Object.entries(x.kinds).sort((a, b) => b[1] - a[1])[0][0] : ''; };
  const KINDS5 = ['남자복식', '여자복식', '혼합복식', '남자단식', '여자단식'];
  const FLOW = ['1:0', '0:1', '2:0', '1:1', '0:2', '2:1', '1:2', '2:2', '3:2', '2:3', '3:3'];

  function renderTeamBroadcast() {
    const el = $('#tbc'), A = panes.a, B = panes.b;
    if (!A || !B || !A.code || !B.code) { el.innerHTML = '<div class="empty">왼쪽·오른쪽에 팀을 먼저 고르세요.</div>'; return; }
    const an = teamShort[A.code], bn = teamShort[B.code];
    const PA = periods(A.code, A.league), PB = periods(B.code, B.league);
    const sl = seasonLabel(leagueOf[A.league].season) + (A.league !== B.league ? ` / ${seasonLabel(leagueOf[B.league].season)}` : '');
    const h2h = gamesOf(A.code, g => g.t1 === B.code || g.t2 === B.code);
    const sec = (n, title, body, sub = '') => `<section class="bcsec"><h3><span class="n">${n}</span>${title}${sub ? `<small>${sub}</small>` : ''}</h3>${body}</section>`;
    const stA = standings(A.league).find(r => r.code === A.code), stB = standings(B.league).find(r => r.code === B.code);
    const logo = (p, st) => { const u = (st && st.logo) || teamLogo[p.code]; return u ? `<img class="logo" src="${esc(u)}">` : ''; };
    const T = rows => tri3(an, bn, PA, PB, sl, rows);
    let h = `<div class="bctop"><button class="tbcback">← 팀 비교 화면</button></div>
      <div class="bchead"><div class="bp a">${logo(A, stA)}<b>${esc(an)}</b></div><div class="bvs">VS</div><div class="bp b"><b>${esc(bn)}</b>${logo(B, stB)}</div></div>`;

    // ① 관전 포인트 (키워드) + 상대 전적
    let hh;
    if (h2h.length) {
      const o = tcalc(h2h);
      hh = `<div class="bch2h"><div class="big"><span class="${o.win > o.lose ? 'win' : ''}">${o.win}</span><small>승</small> <em>${o.games}전${o.draw ? ` ${o.draw}무` : ''}</em> <span class="${o.lose > o.win ? 'win' : ''}">${o.lose}</span><small>승</small></div>
        <div class="bcsub">세트 ${o.setW} : ${o.setL} · 맞대결 에버 ${f3(o.avg)} : ${f3(o.oavg)}</div>
        <table class="bclist">${h2h.slice().reverse().slice(0, 5).map(g => `<tr><td>${esc(String(g.season).slice(2))} ${esc(g.post ? stageNames(g.league)[g.post_code] : g.round)}</td>
          <td class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? esc(an) + ' 승' : g.draw ? '무' : esc(bn) + ' 승'}</td><td><b>${g.sw}:${g.sl}</b></td><td>${seqHtml(g.sets)}</td></tr>`).join('')}</table>
        ${h2h.length > 5 ? `<div class="bcsub">최근 5경기 (전체 ${h2h.length}경기)</div>` : ''}</div>`;
    } else hh = '<div class="bch2h"><div class="big"><em>첫 맞대결</em></div></div>';
    // 왼쪽: 관전 포인트 → 상대 전적(최근 5경기) · 오른쪽: 육각형 스탯 (두 팀 + 리그 평균)
    const cA = tcolor(A.code) || '#3b82f6', cB0 = tcolor(B.code) || '#ef4444', cB = cA === cB0 ? '#f59e0b' : cB0;
    const hexBox = hexHtml([{ t: hexStats(A.code, A.league), name: an, color: cA }, { t: hexStats(B.code, B.league), name: bn, color: cB }], (A.league === B.league ? [A.league] : [A.league, B.league]).map(hexLeague));
    h += sec(1, '관전 포인트', `<div class="bcgrid"><div><ul class="bcpts kwlist">${tTalking(A, B, h2h).map(x => `<li>${x}</li>`).join('')}</ul><h4 class="bch4">상대 전적 (${esc(an)} 기준)</h4>${hh}</div><div class="bchex"><h4 class="bch4">육각형 스탯 <small>${esc(sl)} 시즌 정규리그</small></h4>${hexBox}</div></div>`);

    // ② 기본 기록 | 주요 선수 (좌우 2분할)
    const psA = postResult(A.code, A.league), psB = postResult(B.code, B.league);
    h += '<div class="bc2col">' + sec(2, '기본 기록', T([
      ['순위', rank3],
      ['승-패', o => o && o.games ? { t: o.wl, s: pct(o.winRate) } : null, 'none'],
      ['승점<small>승점률</small>', g3(o => o.points, v => String(v), o => o.maxPoints ? `승점률 ${pct(o.pointRate)}` : '')],
      ['세트 승률', g3(o => o.setRate, pct, o => `${o.setW}-${o.setL}`)],
      ['세트득실률', g3(o => o.setRatio, f3)],
      ['점수득실률', g3(o => o.ptRatio, f3, o => `${o.pts}:${o.opp}`)],
      ['팀 에버', g3(o => o.avg, f3)],
      ['상대 에버<small>낮을수록 좋음</small>', g3(o => o.oavg, f3), 'low'],
      ['초구 성공률', g3(o => o.fbSuccess, pct, o => `${o.fbN}회`)],
      ['선공 세트 승률', g3(o => o.firstSet)], ['후공 세트 승률', g3(o => o.secondSet)],
    ]) + (psA || psB ? `<div class="note">포스트시즌: ${esc(an)} ${esc(psA || '–')} · ${esc(bn)} ${esc(psB || '–')}</div>` : ''));
    // 주요 선수 (이번 시즌, 세트 많이 나간 순)
    const ptbl = list => `<table><thead><tr><th>선수</th><th>승률</th><th>단식</th><th>복식</th><th>단식 에버</th></tr></thead><tbody>${list.map(p => `<tr><td><b>${esc(p.name)}</b></td>
      <td><b>${pct(p.w / p.n)}</b><small>${p.w}-${p.n - p.w}</small></td><td>${p.single.n ? `${p.single.w}-${p.single.n - p.single.w}` : ''}</td><td>${p.double.n ? `${p.double.w}-${p.double.n - p.double.w}` : ''}</td><td>${p.single.i ? f3(p.single.p / p.single.i) : ''}</td></tr>`).join('')}</tbody></table>`;
    h += sec(3, '주요 선수', `<div class="bcplayers"><div><h4>${esc(an)}</h4>${ptbl(playerStats(PA.reg).slice(0, 7))}</div><div><h4>${esc(bn)}</h4>${ptbl(playerStats(PB.reg).slice(0, 7))}</div></div>`, `${esc(sl)} 시즌`) + '</div>';

    // ③ 세트별 승률 | 종목별 승률 (좌우 2분할)
    const kA = mainKindOf(PA.all);
    h += '<div class="bc2col">' + sec(4, '세트별 승률', T([1, 2, 3, 4, 5, 6, 7].filter(n => PA.all.byNo[n] || PB.all.byNo[n]).map(n =>
      [`${n}세트<small>${esc(kA(n))}</small>`, o => { const x = o && o.byNo && o.byNo[n]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: wlOf(x) } : null; }])));

    // ④ 종목별 승률
    h += sec(5, '종목별 승률', T(KINDS5.filter(k => PA.all.byKind[k] || PB.all.byKind[k]).map(k =>
      [k, o => { const x = o && o.byKind && o.byKind[k]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: `에버 ${f3(x.i ? x.p / x.i : null)}` } : null; }]))) + '</div>';

    // ⑤ 세트 흐름: 그 스코어가 된 경기 중 이긴 비율
    const st = k => o => { const x = o && o.state && o.state[k]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: `${x.w}/${x.n}` } : null; };
    h += sec(6, '세트 흐름', T(FLOW.map(k => [`${k} → 승`, st(k)]).concat([
      ['3:2 → 경기 승', o => o && o.after32 && o.after32.n ? { v: o.after32.win / o.after32.n, t: pct(o.after32.win / o.after32.n), s: `${o.after32.win}/${o.after32.n}` } : null],
      ['2:3 → 6세트 승', o => o && o.after23 && o.after23.n ? { v: o.after23.w6 / o.after23.n, t: pct(o.after23.w6 / o.after23.n), s: `${o.after23.w6}/${o.after23.n}` } : null],
      ['2:3 → 경기 승', o => o && o.after23 && o.after23.n ? { v: o.after23.win / o.after23.n, t: pct(o.after23.win / o.after23.n), s: `${o.after23.win}/${o.after23.n}` } : null],
    ])));


    h += `<div class="note" style="text-align:center;padding:16px">이번 라운드 = 그 팀이 가장 최근에 경기한 라운드 · 정규리그 기준 (상대 전적은 포스트시즌 포함) · 같은 기간끼리 더 좋은 쪽이 강조됩니다.</div>`;
    el.innerHTML = h;
  }

  function setTeamBroadcast(on) {
    closePop();
    document.body.classList.toggle('tbcmode', on);
    $('#tbc').hidden = !on;
    if (on) renderTeamBroadcast();
  }
  $('#tbcBtn').addEventListener('click', () => setTeamBroadcast(!document.body.classList.contains('tbcmode')));
  $('#tbc').addEventListener('click', e => {
    if (e.target.closest('.tbcback')) { setTeamBroadcast(false); return; }
    const s = e.target.closest('[data-tscope]');
    if (s) { tbcScope = s.dataset.tscope; localStorageSet('tbc_scope', tbcScope); renderTeamBroadcast(); }
  });
  const syncTbcBtn = () => { $('#tbcBtn').hidden = !(panes.a && panes.b && panes.a.code && panes.b.code); if (document.body.classList.contains('tbcmode')) renderTeamBroadcast(); };

  // 실시간 브리핑 (팀리그): 진행 중 경기 m = { t1, t2, teams:[{short, sets}] }
  // 팀리그 실시간 브리핑 (개인투어 브리핑과 같은 틀): 왼쪽 = 점수 · 키워드 요약, 오른쪽 = 이번 라운드 · 시즌 · 통산 표
  function liveBrief(m) {
    // 비교 화면 왼쪽 팀이 브리핑에서도 왼쪽에 오게
    const left = panes.a && panes.a.code, right = panes.b && panes.b.code;
    let t1 = m.t1, t2 = m.t2, teams = m.teams;
    if (t2 === left || t1 === right) { [t1, t2] = [t2, t1]; teams = [teams[1] || {}, teams[0] || {}]; }
    const sa = (teams[0] || {}).sets || 0, sb = (teams[1] || {}).sets || 0, setNo = sa + sb + 1;
    const lg = D.leagues[0].league;
    const PA = { ...periods(t1, lg), ms: sa, os: sb }, PB = { ...periods(t2, lg), ms: sb, os: sa };
    const an = teamShort[t1] || (teams[0] || {}).short, bn = teamShort[t2] || (teams[1] || {}).short;
    const kind = mainKindOf(PA.all)(setNo) || mainKindOf(PB.all)(setNo);
    const kw = t => `<span class="kw">${t}</span>`, pts = [];
    pts.push(`${kw('지금')} ${setNo}세트${kind ? ` (${esc(kind)})` : ''} · 세트 <b>${sa}:${sb}</b>`);
    for (const [P, n] of [[PA, an], [PB, bn]]) {
      const bits = [], o = P.all, cur = P.season;
      const s = o.state[`${P.ms}:${P.os}`]; if (P.ms + P.os > 0 && s && s.n >= 3) bits.push(`${P.ms}:${P.os}→승 <b>${pct(s.w / s.n)}</b><small>(${s.w}/${s.n})</small>`);
      const bnx = o.byNo[setNo], bc = cur.byNo && cur.byNo[setNo]; if (bnx) bits.push(`${setNo}S 승률 ${pct(bnx.w / bnx.n)}${bc && bc.n ? `<small>(시즌 ${pct(bc.w / bc.n)})</small>` : ''}`);
      const top = playerStats(P.reg).filter(p => p.byNo[setNo] && p.byNo[setNo].n >= 2).sort((x, y) => y.byNo[setNo].n - x.byNo[setNo].n).slice(0, 2);
      if (top.length) bits.push(`${setNo}S 주 출전 ${top.map(p => `${esc(p.name)} ${wlOf(p.byNo[setNo])}`).join(', ')}`);
      const r5 = P.reg.slice(-5).map(g => g.win ? '승' : g.draw ? '무' : '패').join(''); if (r5) bits.push(`최근 ${r5}`);
      pts.push(`${kw(esc(n))} ${bits.join(' · ')}`);
    }
    const h2 = gamesOf(t1, g => g.t1 === t2 || g.t2 === t2); if (h2.length) { const o = tcalc(h2); pts.push(`${kw('상대 전적')} ${esc(an)} ${o.wl} · 세트 ${o.setW}:${o.setL}`); }
    const sl = seasonLabel(leagueOf[lg].season);
    const st = (o, k, P) => { const x = o && o.state && o.state[`${P.ms}:${P.os}`]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: `${x.w}/${x.n}` } : null; };
    const tbl = tri3(an, bn, PA, PB, sl, [
      ['#경기 전'],
      ['순위', rank3],
      ['승-패', o => o && o.games ? { t: o.wl, s: pct(o.winRate) } : null, 'none'],
      ['세트득실률', g3(o => o.setRatio, f3)], ['팀 에버', g3(o => o.avg, f3)], ['초구 성공률', g3(o => o.fbSuccess, pct, o => `${o.fbN}회`)],
      [`#${setNo}세트${kind ? ` (${kind})` : ''}`],
      [`${setNo}세트 승률`, o => { const x = o && o.byNo && o.byNo[setNo]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: wlOf(x) } : null; }],
      ...(kind ? [[`${kind} 승률`, o => { const x = o && o.byKind && o.byKind[kind]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: `에버 ${f3(x.i ? x.p / x.i : null)}` } : null; }]] : []),
      ...(sa + sb > 0 ? [[`지금 스코어 → 승<span class="s">${esc(an)} ${sa}:${sb} · ${esc(bn)} ${sb}:${sa}</span>`, st]] : []),
    ], 'grid ltab', 'mid');
    return `<div class="lcard lsplit"><div class="lleft"><div class="lscore"><div class="pl a">${esc(an)}</div><div class="mid"><div class="sets">${sa} : ${sb}</div><div class="cur">${setNo}세트${kind ? ` · ${esc(kind)}` : ''}</div></div><div class="pl">${esc(bn)}</div></div>
      <div class="ldone">팀리그 · ${esc(sl)} 시즌${PA.rname ? ` · ${esc(PA.rname)}` : ''}</div><ul>${pts.map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div class="lright"><div class="lsub">기본 정보 · 이번 라운드 · 이번 시즌 · 통산</div>${tbl}</div></div>`;
  }

  window.TeamApp = {
    setBroadcast: setTeamBroadcast,
    selected: () => [panes.a && panes.a.code, panes.b && panes.b.code].filter(Boolean),
    liveBrief: m => D ? liveBrief(m) : '',
    async show() {
      if (!D) {
        $('#tpaneA').innerHTML = '<div class="empty">팀리그 기록을 불러오는 중…</div>';
        await load();
        panes.a = new TeamPane($('#tpaneA'), 'a'); panes.b = new TeamPane($('#tpaneB'), 'b');
        const q = new URLSearchParams(location.hash.slice(1));
        [['ta', panes.a], ['tb', panes.b]].forEach(([k, p]) => { const v = q.get(k) || localStorageGet('team_' + k); if (v) { const [l, c] = v.split(':'); p.league = +l; p.code = c; } });
        panes.a.render(); panes.b.render(); renderTeamH2H();
      }
      saveTeamHash();
    },
    // 자동 업데이트로 team.db 가 바뀌면 다시 받아서 보던 팀을 그대로 다시 그린다
    async reload() {
      if (!D) return;
      await load();
      panes.a.render(); panes.b.render(); renderTeamH2H();
    },
  };
  window.addEventListener('beforeunload', () => { [['ta', panes.a], ['tb', panes.b]].forEach(([k, p]) => p && p.code && localStorageSet('team_' + k, `${p.league}:${p.code}`)); });
})();
