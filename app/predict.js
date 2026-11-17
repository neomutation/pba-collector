// ── 승부 예측: 이닝 득점 마르코프 모델 ──────────
//  1) 선수마다 '한 이닝에 몇 점 내나' 분포 q(r)를 센다. 최근 시즌일수록 크게(시즌마다 decay 배), 기록이 적으면 리그(종목) 평균 쪽으로 당긴다(베이즈 수축, 가상 이닝 m개)
//     세트를 끝낸 마지막 이닝은 목표 점수에서 잘린 값이라 '그 점수 이상'으로 보고 리그 분포 꼬리 비율로 나눠 넣는다
//  2) 세트 승률 = 두 선수가 번갈아 한 이닝씩 칠 때 먼저 목표 점수에 닿을 확률. 남은 점수 · 차례를 상태로 하는 마르코프 연쇄를 동적 계획으로 정확히 푼다
//  3) 경기 승률 = 세트 승률로 'N세트 먼저 따기'를 계산 (세트마다 목표 점수가 다르면 세트 승률도 다르게)
//  검증: model/eval_ind.rb · eval_team.rb · eval_live.rb (경기 날짜 이전 기록만으로 예측 → 실제 결과와 비교)
window.Predict = (() => {
  const R = 25;
  // 오프라인 검증으로 고른 값 (튜닝 시즌에서 고르고 다음 시즌으로 검증)
  const P = {
    ind: { decay: 0.5, m: 100 },
    team: { decay: 0.7, m: 100, m2: 200, m3: 150 },
  };
  // 검증 결과 (model/eval_*.rb): 튜닝 시즌에서 값을 고르고, 다음 시즌 경기를 그 날 이전 기록만으로 예측해 맞춘 비율
  const VALID = {
    ind: { season: '25-26', n: 1532, acc: 65.2, ll: 0.629, elo: 63.7, setN: 5889, setAcc: 59.7, calib: [['20~30%', 22.8], ['40~50%', 42.7], ['60~70%', 66.7], ['70~80%', 72.6]] },
    team: { season: '26-27 (진행 중)', n: 153, acc: 60.8, ll: 0.658, setN: 878, setAcc: 55.0 },
    live: { season: '25-26', n: 95096, acc: 70.6, calib: [['10~20%', 15.0], ['30~40%', 34.4], ['50~60%', 53.7], ['70~80%', 74.8], ['90~100%', 94.1]] },
  };
  const blank = () => ({ c: new Float64Array(R + 1), cens: {} });
  // 이닝 기록 모음: key → 시즌 → { c: 이닝 득점 수, cens: { k: 잘린 이닝 수 } }
  function Hist() { this.h = new Map(); }
  Hist.prototype.add = function (key, season, runs, gp) {
    if (!Array.isArray(runs) || !runs.length || !(gp > 0)) return;
    let m = this.h.get(key); if (!m) this.h.set(key, m = new Map());
    let o = m.get(season); if (!o) m.set(season, o = blank());
    let tot = 0;
    runs.forEach((r0, i) => { const r = Math.max(0, +r0 || 0); tot += r; const k = Math.min(r, R); if (i === runs.length - 1 && tot >= gp) o.cens[k] = (o.cens[k] || 0) + 1; else o.c[k]++; });
  };
  // 미리 센 수 넣기 (pdata/ind.json: c = 이닝 득점 수, x = 잘린 마지막 이닝 수)
  Hist.prototype.addCounts = function (key, season, c, x) {
    let m = this.h.get(key); if (!m) this.h.set(key, m = new Map());
    let o = m.get(season); if (!o) m.set(season, o = blank());
    for (let r = 0; r <= R; r++) { o.c[r] += c[r] || 0; if (x && x[r]) o.cens[r] = (o.cens[r] || 0) + x[r]; }
  };
  Hist.prototype.n = function (key, now, decay) { const m = this.h.get(key); if (!m) return 0; let n = 0; m.forEach((o, se) => { const w = Math.pow(decay, now - se); if (w < 1e-3) return; n += w * (o.c.reduce((a, b) => a + b, 0) + Object.values(o.cens).reduce((a, b) => a + b, 0)); }); return n; };
  Hist.prototype.dist = function (key, now, decay, prior, m) {
    const c = new Float64Array(R + 1); let n = 0; const H = this.h.get(key);
    if (H) H.forEach((o, se) => {
      const w = Math.pow(decay, now - se); if (w < 1e-3) return;
      for (let r = 0; r <= R; r++) { c[r] += w * o.c[r]; n += w * o.c[r]; }
      Object.entries(o.cens).forEach(([k0, cnt]) => { const k = +k0; let tail = 0; for (let r = k; r <= R; r++) tail += prior[r]; if (tail <= 0) return; for (let r = k; r <= R; r++) c[r] += w * cnt * prior[r] / tail; n += w * cnt; });
    });
    return Array.from(c, (v, r) => (v + m * prior[r]) / (n + m));
  };
  const norm = a => { const s = a.reduce((x, y) => x + y, 0); return a.map(v => v / s); };
  const mix = (ds, ws) => ds[0].map((_, r) => ds.reduce((s, d, i) => s + d[r] * ws[i], 0));
  const mean = q => q.reduce((s, v, r) => s + v * r, 0);

  // 세트 승률: A 남은 ga점 · B 남은 gb점, aFirst = A 차례. 0점 이닝은 차례만 넘어가므로 두 식을 함께 푼다
  function setProb(qa, qb, ga, gb, aFirst) {
    if (ga <= 0) return 1; if (gb <= 0) return 0;
    const ta = new Float64Array(R + 2), tb = new Float64Array(R + 2);
    for (let r = R; r >= 0; r--) { ta[r] = ta[r + 1] + qa[r]; tb[r] = tb[r + 1] + qb[r]; }
    const va = [], vb = [];
    for (let a = 0; a <= ga; a++) { va.push(new Float64Array(gb + 1)); vb.push(new Float64Array(gb + 1)); }
    for (let a = 1; a <= ga; a++) for (let b = 1; b <= gb; b++) {
      let ca = a <= R ? ta[a] : 0; for (let r = 1; r < Math.min(a, R + 1); r++) ca += qa[r] * vb[a - r][b];
      let cb = 0; for (let r = 1; r < Math.min(b, R + 1); r++) cb += qb[r] * va[a][b - r];
      const x = (qa[0] * cb + ca) / (1 - qa[0] * qb[0]); va[a][b] = x; vb[a][b] = qb[0] * x + cb;
    }
    return aFirst ? va[ga][gb] : vb[ga][gb];
  }
  // 경기: 세트마다 승률 ps[k], need 세트 먼저. 최종 스코어별 확률도 함께 (draw7 = 7세트까지 가서 3:3 이면 무승부인 옛 형식은 쓰지 않음)
  function match(ps, need, w0 = 0, l0 = 0) {
    const scores = {}; let win = 0;
    const go = (w, l, pr) => {
      if (pr < 1e-9) return;
      if (w === need || l === need) { scores[`${w}:${l}`] = (scores[`${w}:${l}`] || 0) + pr; if (w === need) win += pr; return; }
      const p = ps[w + l] != null ? ps[w + l] : ps[ps.length - 1];
      go(w + 1, l, pr * p); go(w, l + 1, pr * (1 - p));
    };
    go(w0, l0, 1);
    return { win, scores };
  }
  const setAvg = (qa, qb, gp) => (setProb(qa, qb, gp, gp, true) + setProb(qa, qb, gp, gp, false)) / 2;

  // ── 개인투어: 선수별 이닝 득점 수는 pdata/ind.json (model/build_predict.rb 가 DB 갱신 때 만든다) ──
  let indData = null, indP = null;
  const loadInd = () => indP || (indP = fetch('pdata/ind.json', { cache: 'no-store' }).then(r => r.json()).then(j => (indData = j)).catch(() => { indP = null; return null; }));
  const indCache = {};
  function indModel(type) {
    const J = indData; if (!J || !J.prior[type]) return null;
    const ck = type + '|' + J.built; if (indCache[ck]) return indCache[ck];
    const hist = new Hist(), now = J.now[type], byName = {};
    Object.entries(J.players).forEach(([id, p]) => { if (p.t !== type) return; byName[p.n] = id; Object.entries(p.h).forEach(([se, o]) => hist.addCounts(id, +se, o.c, o.x)); });
    const prior = norm(J.prior[type].map(v => v + 1));
    const M = { hist, prior, now, byName, dist: id => hist.dist(id, now, P.ind.decay, prior, P.ind.m), n: id => hist.n(id, now, P.ind.decay) };
    return (indCache[ck] = M);
  }
  // 개인투어 승부 예측: 세트 형식 (PBA 15점 · 마지막 세트 11점, LPBA 11 · 9점)
  function indPredict(idA, idB, type) {
    const M = indModel(type); if (!M) return null;
    const qa = M.dist(idA), qb = M.dist(idB), lpba = type === 'LPBA', g = lpba ? 11 : 15, gl = lpba ? 9 : 11;
    const pS = setAvg(qa, qb, g), pL = setAvg(qa, qb, gl);
    return { qa, qb, avgA: mean(qa), avgB: mean(qb), nA: Math.round(M.n(idA)), nB: Math.round(M.n(idB)), g, gl, pS, pL,
      m3: match([pS, pS, pS, pS, pL], 3), m4: match([pS, pS, pS, pS, pS, pS, pL], 4) };
  }

  // ── 팀리그: 팀 자료 D.games(sets[].p · runs · gp · kind) + 개인투어 이닝(선수 이름으로) ──
  //  선수 기본 분포 = 개인투어 + 팀리그 단식 이닝 (종목 평균으로 당김) · 단식 = 팀리그 단식 기록을 기본 분포 쪽으로 · 복식 = 콤비 기록을 두 선수 복식 기록 평균 쪽으로
  const ent = ps => ps.length === 1 ? '1|' + ps[0] : '2|' + ps.slice().sort().join('|');
  let teamCache = null;
  function teamModel(D, canon = n => n) {
    const J = indData, key = [D, J && J.built];
    if (teamCache && teamCache.key.every((x, i) => x === key[i])) return teamCache.M;
    const hist = new Hist(), kinds = {}, usage = {}, gpno = {}, kindno = {};
    let now = 0;
    if (J) Object.values(J.players).forEach(p => Object.entries(p.h).forEach(([se, o]) => hist.addCounts('i|' + canon(p.n), +se, o.c, o.x)));
    D.games.forEach(g => {
      now = Math.max(now, g.season);
      (g.sets || []).forEach(s => {
        if (!Array.isArray(s.runs) || s.runs.length !== 2 || !Array.isArray(s.p)) return;
        [0, 1].forEach(i => {
          const ps = (s.p[i] || []).map(canon), runs = s.runs[i]; if (!ps.length) return;
          hist.add(ent(ps), g.season, runs, +s.gp);
          if (ps.length === 2) ps.forEach(p => hist.add('d|' + p, g.season, runs, +s.gp)); else hist.add('i|' + ps[0], g.season, runs, +s.gp);
          const k = kinds[s.kind] || (kinds[s.kind] = new Float64Array(R + 1).fill(1)); (runs || []).forEach(r => k[Math.min(R, Math.max(0, +r || 0))]++);
          if (!g.post) { const u = usage[`${i ? g.t2 : g.t1}|${g.season}|${s.no}`] || (usage[`${i ? g.t2 : g.t1}|${g.season}|${s.no}`] = {}); u[ent(ps)] = (u[ent(ps)] || 0) + 1; }
        });
        if (!g.post) { const a = gpno[`${g.season}|${s.no}`] || (gpno[`${g.season}|${s.no}`] = {}); a[s.gp] = (a[s.gp] || 0) + 1; const b = kindno[`${g.season}|${s.no}`] || (kindno[`${g.season}|${s.no}`] = {}); b[s.kind] = (b[s.kind] || 0) + 1; }
      });
    });
    const T = P.team, priorOf = kind => norm(Array.from(kinds[kind] || kinds[Object.keys(kinds)[0]]));
    const base = (p, pr) => hist.dist('i|' + p, now, T.decay, pr, T.m);
    const dist = (ps0, kind) => { const ps = ps0.map(canon), pr = priorOf(kind);
      if (ps.length === 1) return hist.dist(ent(ps), now, T.decay, base(ps[0], pr), T.m3);
      return hist.dist(ent(ps), now, T.decay, mix(ps.map(p => hist.dist('d|' + p, now, T.decay, base(p, pr), T.m3)), [0.5, 0.5]), T.m2); };
    const top = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
    const M = { hist, now, dist, usage, gpno, kindno, top, n: (ps0, kind) => Math.round(ps0.map(canon).reduce((s, p) => s + hist.n('i|' + p, now, T.decay), 0) / ps0.length) };
    teamCache = { key, M }; return M;
  }
  // 팀리그 승부 예측: lineup = [{ no, kind, gp, p: [[왼쪽], [오른쪽]] }] (발표된 오더). 없는 세트는 그 팀이 이번 시즌 그 세트 번호에 내보낸 선수 비율로 섞는다
  function teamPredict(M, t1, t2, lineup) {
    const sets = [];
    for (let no = 1; no <= 7; no++) {
      const L = (lineup || []).find(x => +x.no === no && x.p && x.p[0] && x.p[0].length && x.p[1] && x.p[1].length);
      const kind = (L && L.kind) || (M.top(M.kindno[`${M.now}|${no}`])[0] || [])[0], gp = +(L && L.gp) || +(M.top(M.gpno[`${M.now}|${no}`])[0] || [])[0] || 11;
      if (L) { sets.push({ no, kind, gp, pa: L.p[0], pb: L.p[1], p: setAvg(M.dist(L.p[0], kind), M.dist(L.p[1], kind), gp), known: true }); continue; }
      const ua = M.top(M.usage[`${t1}|${M.now}|${no}`]).slice(0, 3), ub = M.top(M.usage[`${t2}|${M.now}|${no}`]).slice(0, 3);
      if (!ua.length || !ub.length || !kind) { sets.push({ no, kind, gp, p: 0.5, known: false }); continue; }
      const sa = ua.reduce((s, x) => s + x[1], 0), sb = ub.reduce((s, x) => s + x[1], 0);
      let p = 0; ua.forEach(([ea, ca]) => ub.forEach(([eb, cb]) => { p += ca / sa * cb / sb * setAvg(M.dist(ea.split('|').slice(1), kind), M.dist(eb.split('|').slice(1), kind), gp); }));
      sets.push({ no, kind, gp, pa: ua[0][0].split('|').slice(1), pb: ub[0][0].split('|').slice(1), p, known: false });
    }
    return { sets, m: match(sets.map(s => s.p), 4) };
  }
  // ── 화면 ──
  const pc = p => `${Math.round(p * 100)}%`;
  // 이론 설명 말풍선 (kind: 'ind' | 'team' | 'live')
  function tipHtml(kind) {
    const V = VALID, row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    const base = `<div class="rkh0">승부 예측 모델 <small>이닝 득점 마르코프 모델</small></div>
      <table class="rdtip pdtip">
      ${row('① 이닝 득점 분포', '선수마다 한 이닝에 0점 · 1점 · 2점 … 을 낼 확률을 지난 기록으로 셉니다. 최근 시즌일수록 크게 보고(한 시즌 전 ×' + (kind === 'team' ? P.team.decay : P.ind.decay) + '), 기록이 적은 선수는 리그 평균 쪽으로 당깁니다(베이즈 수축). 세트를 끝낸 마지막 이닝은 목표 점수에서 멈춘 값이라 \'그 점수 이상\'으로 처리합니다(중도 절단).')}
      ${row('② 세트 승률', '두 선수가 번갈아 한 이닝씩 칠 때 누가 먼저 목표 점수에 닿는지를, 남은 점수와 차례를 상태로 하는 마르코프 연쇄로 보고 흡수 확률을 동적 계획으로 정확히 계산합니다. 선공 · 후공 두 경우의 평균입니다.')}
      ${kind === 'live' ? row('③ 실시간', '세트 도중에는 지금 남은 점수와 다음 차례를 그대로 넣어 같은 계산을 다시 합니다. 점수 차뿐 아니라 두 선수의 이닝 득점력 차이가 함께 반영됩니다.')
        : row('③ 경기 승률', `세트 승률로 '${kind === 'team' ? '4세트' : 'N세트'} 먼저 따기' 확률을 계산합니다(세트마다 목표 점수가 다르면 따로). 예상 스코어도 같은 계산에서 나옵니다.`)}
      ${kind === 'team' ? row('④ 팀리그', '선수 기본 분포 = 개인투어 + 팀리그 단식 이닝. 복식은 그 콤비 기록을 두 선수의 복식 기록 쪽으로 당겨 씁니다. 오더 발표 전에는 이번 시즌 그 세트 번호에 나온 선수 비율로 섞습니다.') : ''}
      </table>`;
    const vi = V.ind, vt = V.team, vl = V.live;
    const val = kind === 'live'
      ? `<div class="rsub">검증 <small>${vl.season} 시즌 개인투어 ${vl.n.toLocaleString()}개 이닝 상황 · 그 경기 이전 기록만 사용</small></div><table class="rdtip">${row('맞힌 비율', `<b>${vl.acc}%</b>`)}${vl.calib.map(([a, b]) => row(`예측 ${a}`, `실제 ${b}%`)).join('')}</table>`
      : kind === 'team'
        ? `<div class="rsub">검증 <small>${vt.season} 시즌 · 그 경기 이전 기록만 사용</small></div><table class="rdtip">${row(`경기 승자 (${vt.n}경기)`, `<b>${vt.acc}%</b>`)}${row(`세트 승자 (${vt.setN}세트)`, `<b>${vt.setAcc}%</b>`)}</table><div class="hbn">팀리그는 팀 간 전력 차가 작아 개인투어보다 맞히기 어렵습니다. 50~60% 예측은 사실상 접전입니다.</div>`
        : `<div class="rsub">검증 <small>${vi.season} 시즌 개인투어 · 그 경기 이전 기록만 사용</small></div><table class="rdtip">${row(`경기 승자 (${vi.n.toLocaleString()}경기)`, `<b>${vi.acc}%</b> <small>엘로 레이팅 ${vi.elo}%</small>`)}${row(`세트 승자 (${vi.setN.toLocaleString()}세트)`, `<b>${vi.setAcc}%</b>`)}${vi.calib.map(([a, b]) => row(`예측 ${a}`, `실제 ${b}%`)).join('')}</table>`;
    return base + val;
  }
  // 승부 예측 상자: 막대(왼쪽 · 오른쪽 승률) + 예상 스코어 + rows(세트별) + foot(근거 한두 줄)
  function boxHtml(o) {
    const pA = o.win;
    const sc = Object.entries(o.scores).sort((a, b) => { const [x1, y1] = a[0].split(':').map(Number), [x2, y2] = b[0].split(':').map(Number); return (y1 - x1) - (y2 - x2); });
    const best = Math.max(...sc.map(x => x[1]));
    const esc2 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<div class="pdbox"><h4 class="bch4">승부 예측 <span class="pdi" data-rtip="${esc2(tipHtml(o.kind))}">모델 설명</span>${o.sub ? `<small>${o.sub}</small>` : ''}</h4>
      <div class="pdbar"><span class="pdn">${esc2(o.an)}</span><b class="${pA >= 0.5 ? 'win' : ''}">${pc(pA)}</b><div class="pdtr"><i style="width:${(pA * 100).toFixed(1)}%;background:${o.ca}"></i><i style="background:${o.cb}"></i></div><b class="${pA < 0.5 ? 'win' : ''}">${pc(1 - pA)}</b><span class="pdn">${esc2(o.bn)}</span></div>
      <div class="pdsc">${sc.map(([k, v]) => { const [x, y] = k.split(':').map(Number); return `<span class="${x > y ? 'a' : 'b'}${v === best ? ' top' : ''}"><b>${k}</b>${pc(v)}</span>`; }).join('')}</div>
      ${o.rows || ''}${o.foot ? `<div class="pdft">${o.foot}</div>` : ''}</div>`;
  }
  // 개인투어 기록지: 선수 이름으로 (PBA → LPBA 순으로 찾음)
  function liveByName(na, nb, ga, gb, aNext) {
    for (const type of ['PBA', 'LPBA']) { const M = indModel(type); if (M && M.byName[na] && M.byName[nb]) return setProb(M.dist(M.byName[na]), M.dist(M.byName[nb]), ga, gb, aNext); }
    return null;
  }
  // 개인투어 기록지 게임 승률: 남은 세트는 두 선수 세트 승률(세트마다 목표 점수 gpOf), 지금 세트는 curP
  function indGameByName(na, nb, w0, w1, need, gpOf, curP) {
    for (const type of ['PBA', 'LPBA']) {
      const M = indModel(type); if (!M || !M.byName[na] || !M.byName[nb]) continue;
      const qa = M.dist(M.byName[na]), qb = M.dist(M.byName[nb]), ps = [];
      for (let k = 0; k < 2 * need - 1; k++) ps.push(setAvg(qa, qb, gpOf(k)));
      if (curP != null) ps[w0 + w1] = curP;
      return match(ps, need, w0, w1).win;
    }
    return null;
  }
  loadInd();
  return { R, P, VALID, tipHtml, liveByName, indGameByName, boxHtml, pc, Hist, setProb, match, setAvg, mean, loadInd, indModel, indPredict, teamModel, teamPredict, ready: () => !!indData };
})();
