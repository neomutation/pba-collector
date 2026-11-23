// PBA 팀리그 화면. index.html 의 공용 함수($, esc, api, pct, f3, sum, ratio, seasonLabel …)를 같이 쓴다.
'use strict';
(function () {
  let D = null;                      // /api/team/all 응답
  const panes = {};
  // 질문 말풍선: 그 팀 칸 밖을 누르면 닫힘
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
        return { name: n, pts: x.pts || 0, bank: x.bank || 0, succ, att: succ + inn - (endedHere ? 1 : 0), inn, kd: true };
      }
      const att = x.rate > 0 ? Math.round(succ / (x.rate / 100)) : Math.ceil((s.inn[i] || 0) / 2);
      return { name: n, pts: x.pts || 0, bank: x.bank || 0, succ, att, kd };
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
      hits: R && s.hits ? (R === s.runs ? s.hits : [s.hits[1], s.hits[0]])[i] : null,   // 이닝별 성공 횟수 (뱅크샷 1번 = 1)
      per: s.per ? perMine(s, i, g.season) : null, p1: s.p1 ? s.p1[i] : null, p2: s.p2 ? s.p2[i] : null,
    }; });
    const sw = i ? g.s2 : g.s1, sl = i ? g.s1 : g.s2;
    // 경기 에버는 세트 기록으로 직접 계산 (포스트시즌 목록의 에버 칸은 값이 어긋나 있다)
    const sp = sum(sets, s => s.pts), si = sum(sets, s => s.inn), op = sum(sets, s => s.opp), oi = sum(sets, s => s.oinn);
    return { id: g.id, league: g.league, season: g.season, round: g.round_label, round_no: g.round_no, post: !!g.post, post_code: g.post_code,
      date: g.date, opp: i ? g.t1 : g.t2, sw, sl, win: sw > sl, draw: sw === sl, points: g.post ? null : pts3(sw, sl, g.season), avg: si ? sp / si : (i ? g.avg2 : g.avg1), oavg: oi ? op / oi : (i ? g.avg1 : g.avg2),
      hr: i ? g.hr2 : g.hr1, sets, me: code };
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
  //  리드 N = 남자 세트 5점 · 여자 · 혼복 세트 3점. 클러치 = 남자 세트 5점 · 여자 · 혼복 세트 4점 이내. up · dn = N점 앞선 · 뒤진 적이 있는지
  //  리드(lf · up · dn)는 이닝과 상관없이 매 이닝 뒤 점수로 본다 (2026-11 기록지 라이브 기준과 같게. 예전 sameInn 인자는 더 쓰지 않음)
  //  클러치 = 이닝과 상관없이(매 공격 뒤 점수) 두 팀 모두 목표 점수에 못 미친 채 남은 점수가 N점 이내 (세트가 끝난 점수는 아님, 2026-11 사용자 기준)
  function setFlowT(s) {
    if (!s.runs || !s.oruns || s.first == null) return null;
    const lead = /남자/.test(s.kind) ? 5 : 3, cln = /남자/.test(s.kind) ? 5 : 4, thr = s.gp > cln ? s.gp - cln : null;
    const order = s.first ? [[s.runs, 0], [s.oruns, 1]] : [[s.oruns, 1], [s.runs, 0]];
    let a = 0, b = 0, lf = 0, cl = false, up = false, dn = false, lt = false;   // lt = 리드가 생긴 뒤 동점이 된 적 있음 (리드 유지 판정)
    for (let k = 0; k < Math.max(s.runs.length, s.oruns.length); k++) {
      for (const [arr, who] of order) {
        if (arr[k] == null) continue;
        if (who) b += arr[k]; else a += arr[k];
        if (!lf) lf = a - b >= lead ? 1 : b - a >= lead ? -1 : 0; else if (a === b) lt = true;
        if (a - b >= lead) up = true; if (b - a >= lead) dn = true;
        if (thr && a >= thr && b >= thr && a < s.gp && b < s.gp) cl = true;
      }
    }
    return { lf, cl: thr ? cl : null, up, dn, lt };
  }
  // 시즌 순서 버튼을 붙이는 세부 기록 칸 (팀리그) · 누르면 index.html 이 순서를 바꾸고, 팀 칸은 여기서 다시 그린다
  // 한 경기 승패 경과 말풍선 (persp 경기): 세트 번호 · 종목 · 우리 선수 · 세트 점수 · 상대 선수 · 그때까지 세트 스코어
  function gameFlowTip(g, code, lg) {
    let a = 0, b = 0;
    const rows = g.sets.map(s => { s.win ? a++ : b++; return `<tr class="${s.win ? 'w' : 'l'}"><td>${s.no}</td><td><small>${esc(s.kind || '')}</small></td><td>${esc(s.players.join('·'))}</td><td><b>${s.pts}:${s.opp}</b></td><td>${esc(s.oppPlayers.join('·'))}</td><td class="run"><b>${a}:${b}</b></td></tr>`; }).join('');
    return `<div class="rkh0">${esc(g.round || '')} vs <b style="color:${tcolor(g.opp)}">${esc(nameIn(g.opp, lg))}</b> <small>${esc(String(g.date || '').slice(5, 10).replace('-', '.'))} · ${g.win ? '승' : g.draw ? '무' : '패'} ${g.sw}:${g.sl}</small></div>`
      + (rows ? `<table class="rdtip gflow"><tr class="hd"><td></td><td></td><td>${esc(teamShort[code] || code)}</td><td></td><td>${esc(teamShort[g.opp] || g.opp)}</td><td>세트</td></tr>${rows}</table>` : '<div class="rsub">세트 기록 없음</div>');
  }
  // 라운드 말풍선: 치른 순서로 상대 두 글자 · 승패 · 세트 스코어. 커서 위쪽에
  function roundTip(code, lg, round) {
    const gs = gamesOf(code, g => g.league === lg && !g.post && g.round_label === round).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!gs.length) return '';
    return `<div class="rkh0">${esc(round)} 경기</div><div class="rtip">${gs.map(g => `<div><b>${esc(String(teamAbbr(g.opp)).slice(0, 2))}</b><span class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'}</span><small>${g.sw}${g.sl}</small></div>`).join('')}</div>`;
  }
  document.addEventListener('mouseover', e => {
    const c = e.target.closest && e.target.closest('[data-rnd]'); if (!c || !D) return;
    const [code, lg, round] = c.dataset.rnd.split('|'), h = roundTip(code, +lg, round); if (!h) return;
    showRkBub(c, h);
    const w = rkBub.offsetWidth, t = rkBub.offsetHeight;
    rkBub.style.left = Math.max(6, Math.min(innerWidth - w - 6, e.clientX - w / 2)) + 'px';
    rkBub.style.top = Math.max(6, e.clientY - t - 12) + 'px';
  });
  document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('[data-rnd]'); if (c && !c.contains(e.relatedTarget)) hideRkBub(); });
  // 선수 기록칩 세트 칸 말풍선: 우세 · 동점 · 열세 (7세트는 3:2 · 2:3)
  document.addEventListener('mouseover', e => {
    const c = e.target.closest && e.target.closest('[data-pst]'); if (!c) return;
    const [name, no, subs] = c.dataset.pst.split('|');
    const rows = subs.split(',').map(x => { const [l, w, n] = x.split('~'); return `<tr><td>${l}</td><td>${+n ? `<b>${pct(+w / +n)}</b> <small>${w}-${n - w}</small>` : '–'}</td></tr>`; }).join('');
    showRkBub(c, `<div class="rkh0">${esc(name)} ${no}세트 <small>세트 시작 스코어별</small></div><table class="rdtip">${rows}</table>`);
  });
  document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('[data-pst]'); if (c && !c.contains(e.relatedTarget)) hideRkBub(); });
  // 기록지 라이브 정보 칩 말풍선: 이 선수(콤비)의 이긴 세트/세트 (시즌 · 통산) + 같은 단식 / 복식끼리 TOP20 (시즌 3세트 · 통산 5세트 이상)
  //  k: 기록 키(승률) · 'F' = 초구 성공률(직접 친 선수, sheetEnt F) · 'avg' = 초구 에버 · 'multi' = 초구 다득률
  function xtTipHtml(ek, k, lg, label) {
    const isF = k === 'F' || k.startsWith('Fst:'), sub = k.includes(':') ? k.slice(k.indexOf(':') + 1) : null, part = sub ? k.slice(0, k.indexOf(':')) : null;
    const EN = sheetEnt(+lg), M = isF ? EN.F : EN.E, me = M[ek], solo = ek.startsWith('1|'), nm = key => esc(key.slice(2).split('|').join('·'));
    // get: { v 비교값, n 횟수, t 보이는 값 } — 승률은 이긴/전체, 에버는 득점/초구 수
    const get = (x, sc) => { const o = part === 'Fst' ? x && x.st[sc][sub] : part ? x && x[sc] && x[sc][part][sub] : x && x[sc]; if (!o) return { v: null, n: 0 };
      if (isF || part) return o.n ? { v: o.w / o.n, n: o.n, t: `<b>${pct(o.w / o.n)}</b> <small>${o.w}/${o.n}</small>` } : { v: null, n: 0 };
      if (k === 'avg') return o.fbN ? { v: o.fbP / o.fbN, n: o.fbN, t: `<b>${f3(o.fbP / o.fbN)}</b> <small>${o.fbP}/${o.fbN}</small>` } : { v: null, n: 0 };
      const y = k === 'multi' ? { w: o.fbM, n: o.fbN } : o[k];
      return y && y.n ? { v: y.w / y.n, n: y.n, t: `<b>${pct(y.w / y.n)}</b> <small>${y.w}/${y.n}</small>` } : { v: null, n: 0 }; };
    const top = (sc, min) => {
      const list = Object.entries(M).filter(([, x]) => x.solo === solo && (isF || !me || !me.kind || x.kind === me.kind) && get(x, sc).n >= min).sort(([, x], [, y]) => (get(y, sc).v - get(x, sc).v) || get(y, sc).n - get(x, sc).n);
      // 순위는 칩과 같게: 값이 더 높은 수 + 1 (같은 값은 같은 순위)
      const rkOf = x => 1 + list.filter(([, y]) => get(y, sc).v > get(x, sc).v).length;
      const i = list.findIndex(([key]) => key === ek), r = (key, x, cls = '') => `<tr class="${cls}${key === ek ? ' mine' : ''}"><td>${rkOf(x)}</td><td>${nm(key)}</td><td>${get(x, sc).t}</td></tr>`;
      const mine = i >= 0 ? r(ek, me, 'me') : `<tr class="me"><td colspan="3">${nm(ek)} · 순위 기준 미달</td></tr>`;
      return `<div><div class="rsub">${sc === 's' ? '이번 시즌' : '통산'} TOP20 <small>${min}번 이상 ${list.length}${solo ? '명' : '콤비'}</small></div><table>${mine}${list.slice(0, 20).map(([key, x]) => r(key, x)).join('')}</table></div>`;
    };
    const sum = sc => { const g = get(me, sc); return g.n ? g.t.replace(/<[^>]*>/g, '') : '–'; };
    return `<div class="rkh0">${nm(ek)} ${esc(label)} <small>이번 시즌 ${sum('s')} · 통산 ${sum('a')}</small></div><div class="cols">${FB_KEYS.has(k) ? top('s', FB_MIN[0]) + top('a', FB_MIN[1]) : top('s', 3) + top('a', 5)}</div>`;
  }
  document.addEventListener('mouseover', e => {
    const c = e.target.closest && e.target.closest('[data-xtt]'); if (!c || !D) return;
    const [ek, k, lg, label] = c.dataset.xtt.split('~'); showRkBub(c, xtTipHtml(ek, k, lg, label));
  });
  document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('[data-xtt]'); if (c && !c.contains(e.relatedTarget)) hideRkBub(); });
  const flowLgHolder = { teamName: c => teamName[c] };   // 특징 요약 순위 말풍선의 팀 이름
  document.addEventListener('click', e => { if (!isBlankClick(e)) return; for (const p of Object.values(panes)) if (p.qaOpen) p.setQa(false); });   // 질문 창: 빈 곳을 누르면 닫힘
  const TMODE_SECS = new Set(['sum', 'sets', 'kind', 'dist', 'bank']);
  const TORD_SECS = new Set(['sum', 'sets', 'kind', 'bank', 'dist', 'round', 'opp']);
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
    // 뱅킹: 팀리그는 1세트에서 각 팀 첫 공격 선수가 뱅킹한다 (경기당 1번). 1세트 선공 = 뱅킹 승
    const fst = sets.filter(s => s.first === true), snd = sets.filter(s => s.first === false), wl2 = a => ({ w: a.filter(s => s.win).length, n: a.length });
    o.bankW = fst.filter(s => s.no === 1).length; o.bankL = snd.filter(s => s.no === 1).length; o.bankRate = ratio(o.bankW, o.bankW + o.bankL); o.fstWL = wl2(fst); o.sndWL = wl2(snd);
    const KG = { one: s => /단식/.test(s.kind), dbl: s => /남자복식|여자복식/.test(s.kind), mix: s => s.kind === '혼합복식' };
    o.fk = Object.fromEntries(Object.entries(KG).map(([k, f]) => [k, { f: wl2(fst.filter(f)), s: wl2(snd.filter(f)) }]));
    const fbHit = fb.filter(s => s.runs[0] > 0), fbMiss = fb.filter(s => s.runs[0] === 0);
    o.fbHitWL = wl2(fbHit); o.fbMissWL = wl2(fbMiss);
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
    // 시즌 중 팀 이름이 바뀌면 홈피 순위표에 팀 코드가 비어 온다 (하림 용가리즈 ↔ 오드그로서) → 앞 낱말(회사 이름)로 잇는다
    const teamByWord = s => s.team || ((D.teams || []).find(t => t.league === league && s.name && t.name.split(' ')[0] === s.name.split(' ')[0]) || {}).code;
    const off = (D.standings || []).filter(s => s.league === league && teamByWord(s));
    if (off.length) return (standingsCache[league] = off.map(s => ({ code: teamByWord(s), rank: s.rank, logo: s.logo, stats: s.stats })));
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

  // 기록지 팀 이름 옆 별: 포스트시즌 우승 = 금별 · 준우승 = 은별, 별 안에 시즌 앞 두 자리(25-26 → 25). 오래된 시즌부터
  //  말풍선(data-stip): 그 시즌 정규리그 라운드 우승 · 포스트시즌 단계별 상대 · 경기 승패 · 게임 스코어 (치른 순서)
  // 포스트시즌 진출 경로 (별 말풍선): 6라운드 시즌 = 전기(1~3R) · 후기(4~6R) 각 1 · 2위 진출 → 전기 · 후기 순위
  //  그 뒤 시즌 = 라운드 우승 팀 진출, 우승 팀이 겹쳐 빈자리는 정규시즌 순위 차순위 → 라운드 우승 또는 정규시즌 순위
  function periodRank(l, rounds, code) {
    const rows = teamsIn(l).map(c => ({ c, o: tcalc(gamesOf(c, g => g.league === l && !g.post && rounds.includes(g.round_label))) })).filter(r => r.o.games)
      .sort((x, y) => (y.o.points || 0) - (x.o.points || 0) || y.o.win - x.o.win || (y.o.setRatio || 0) - (x.o.setRatio || 0) || (y.o.ptRatio || 0) - (x.o.ptRatio || 0));
    const i = rows.findIndex(r => r.c === code); return i < 0 ? null : i + 1;
  }
  function postRoute(code, l, rw) {
    const rs = roundsOf(l), win = rw.length ? `${rw.map(esc).join(' · ')} 우승` : '';
    const st = standings(l).find(x => x.code === code), sr = st && st.rank ? `정규시즌 ${st.rank}위` : '';
    //  전 · 후기 순위로 설명이 안 되는 시즌(예: 22-23)은 정규시즌 순위만 함께 보여 준다
    if (rs.length === 6) { const a = periodRank(l, rs.slice(0, 3), code), b = periodRank(l, rs.slice(3), code), ok = a <= 2 ? `전기 ${a}위` : b <= 2 ? `후기 ${b}위` : '';
      return `전기 ${a}위 · 후기 ${b}위${win ? ` (${win})` : ''}${ok ? ` → ${ok}로 포스트시즌 진출 <small>전 · 후기 1 · 2위 진출</small>` : ` · ${sr} → 포스트시즌 진출`}`; }
    if (win) return `정규리그 ${win} → 포스트시즌 진출`;
    return `라운드 우승 없음 · ${sr} → 차순위로 포스트시즌 진출 <small>라운드 우승 팀이 겹쳐 생긴 자리</small>`;
  }
  //  인수한 팀은 전신 팀 시절 기록도 함께 (우리금융캐피탈 ← 블루원리조트)
  const TEAM_PRED = { T00022: ['T00005'] };
  function postStars(code0) {
    return [code0, ...(TEAM_PRED[code0] || [])].flatMap(code => (seasonsOfTeam[code] || []).map(l => [code, l])).sort((a, b) => leagueOf[a[1]].season - leagueOf[b[1]].season).map(([code, l]) => {
      const r = postResult(code, l); if (r !== '우승' && r !== '준우승') return '';
      const sl = seasonLabel(leagueOf[l].season), names = stageNames(l);
      const rw = roundsOf(l).filter(rd => roundRanks(l, rd)[code] === 1), how = postRoute(code, l, rw);
      const gs = gamesOf(code, g => g.league === l && g.post).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const stages = [...new Set(gs.map(g => names[g.post_code] || '포스트시즌'))];
      const rows = stages.map(st => { const x = gs.filter(g => (names[g.post_code] || '포스트시즌') === st), opp = x[0].opp;
        return `<tr><td>${esc(String(st).replace(/\s*\d+경기$/, ''))}</td><td>${esc(teamShort[opp] || opp)}</td><td>${x.map(g => `<span class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'}</span> <small>${g.sw}:${g.sl}</small>`).join(' · ')}</td></tr>`; }).join('');
      const tip = `<div class="rkh0">${esc(sl)} 시즌 ${r}${code !== code0 ? ` <small>${esc(nameIn(code, l))} 시절</small>` : ''}</div><div class="rsub">${how}</div><table class="rdtip">${rows}</table>`;
      return `<svg class="pstar ${r === '우승' ? 'gold' : 'silver'}" viewBox="0 0 24 24" data-stip="${esc(tip)}"><polygon points="12,0.8 15,8.4 23.2,8.7 16.8,13.8 19.1,22 12,17.4 4.9,22 7.2,13.8 0.8,8.7 9,8.4"/><text x="12" y="16" text-anchor="middle">${esc(sl.slice(0, 2))}</text></svg>`;
    }).join('');
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
  const lgAvgPts = league => { const n = league == null ? new Set(D.games.flatMap(g => [g.t1, g.t2])).size : standings(league).length; const L = leagueCalc(league); return n && L.points != null ? L.points / n : null; };
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
  // 리버스 스윕 경기 (정규리그): win = 0:3 에서 이긴 경기, 아니면 3:0 에서 진 경기. 칸 말풍선(data-rtip)
  function revGames(code, league, win) {
    return gamesOf(code, g => !g.post && (!league || g.league === league)).filter(g => { let a = 0, b = 0, hit = false; g.sets.slice().sort((p, q) => p.no - q.no).forEach(s => { s.win ? a++ : b++; if (win ? a === 0 && b === 3 : a === 3 && b === 0) hit = true; }); return hit && (win ? g.win : !g.win); });   // 진 쪽은 3:3 무승부도 센다 (칸 숫자와 같게)
  }
  const revTip = (code, c, win) => { const gs = revGames(code, c.tot ? null : c.league, win); if (!gs.length) return '';
    const rows = gs.slice().reverse().map(g => { const ls = g.sets.slice().sort((p, q) => q.no - p.no)[0]; return `<tr><td>${esc(String(g.date || '').slice(2, 10).replace(/-/g, '.'))}</td><td>${esc(c.tot ? `${leagueLabel(g.league)} ${g.round}` : g.round)}</td><td><b>vs ${esc(teamShort[g.opp] || g.opp)}</b></td><td>${g.sw}:${g.sl}${g.draw ? ' 무' : ''}</td><td><small>${ls ? `${ls.no}세트 ${esc((ls.oppPlayers || []).join('·'))}` : ''}</small></td></tr>`; }).join('');
    return ` data-rtip="${esc(`<div class="rkh0">${win ? '리버스 스윕 승 (0:3 → 4:3)' : '리버스 스윕 패 (3:0 → 3:4)'} <small>${gs.length}경기 · 상대 팀 · 마지막 세트 상대 선수</small></div><table class="rdtip">${rows}</table>`)}" style="cursor:help"`; };
  // ── 묶음 · 열 접기 (팀 기록 항목) ──
  // 줄 묶음('__grp' 줄)을 누르면 그 묶음 줄들이 접히고, 표 왼쪽 위 버튼은 지난 시즌 같은 세부 열을 접는다.
  // 상태는 두 팀 칸이 함께 쓴다 (나란히 비교할 때 줄 · 열이 같게). gridSec = 지금 그리는 항목 id (renderSecs 가 정함)
  let gridSec = null;
  const foldSets = {};
  const foldSet = k => foldSets[k] || (foldSets[k] = (() => { try { return new Set(JSON.parse(localStorageGet(k)) || []); } catch (e) { return new Set(); } })());
  const rowFolded = key => foldSet('tfold_rows').has(key), colFolded = key => foldSet('tfold_cols').has(key);
  function toggleFold(kind, key) {
    const k = kind === 'row' ? 'tfold_rows' : 'tfold_cols', set = foldSet(k), off = !set.has(key);
    off ? set.add(key) : set.delete(key); localStorageSet(k, JSON.stringify([...set]));
    const app = document.getElementById('teamApp'); if (!app) return;
    if (kind === 'row') {
      app.querySelectorAll('tr[data-rgk]').forEach(tr => { if (tr.dataset.rgk === key) tr.classList.toggle('off', off); });
      app.querySelectorAll('tr[data-rgm]').forEach(tr => { if (tr.dataset.rgm === key && !(tr.classList.contains('det') && !off)) tr.hidden = off; });
      app.querySelectorAll('details[data-fdk]').forEach(d => { if (d.dataset.fdk === key && d.open === off) d.open = !off; });
    } else app.querySelectorAll('table[data-cfk]').forEach(t => { if (t.dataset.cfk === key) t.classList.toggle('cfold', off); });
  }
  // 열 접기 버튼 (표 왼쪽 위 칸): 펼침 '◂ 지난 시즌' / 접힘 '▸ 지난 시즌 6'
  const cfBtn = (key, label, n, head = '') => key && n ? `${head ? `<span class="cfh">${head}</span>` : ''}<button class="cfb" data-tcf="${esc(key)}" title="${esc(label)} 열 접기 · 펼치기"><span class="cf1">◂ ${esc(label)}</span><span class="cf2">▸ ${esc(label)} ${n}</span></button>` : head;
  function grid(rows, cols0, mode, opt = {}) {
    const ss = cols0.filter(c => !c.tot).sort((a, b) => SEASON_NEW_LEFT ? leagueOf[b.league].season - leagueOf[a.league].season : leagueOf[a.league].season - leagueOf[b.league].season);
    const tot = cols0.find(c => c.tot), cols = tot ? [tot, ...ss] : cols0;   // 시즌 열: 최신부터 / 과거부터 (⇄ 버튼)
    const lgCol = (mode === 'league' || opt.league) && (tot || cols0[cols0.length - 1]).L;
    // 지난 시즌 열 (통산 · 이번 시즌 · 리그 평균은 늘 보임)
    const cur = ss.length ? ss.reduce((a, b) => leagueOf[b.league].season > leagueOf[a.league].season ? b : a) : null;
    const isOld = c => gridSec && cols0.length > 1 && !c.tot && c !== cur, nOld = cols.filter(isOld).length, ck = nOld ? gridSec : null;
    const cx = c => isOld(c) ? ' cx' : '';
    let h = `<div class="tw"><table class="grid${ck && colFolded(ck) ? ' cfold' : ''}"${ck ? ` data-cfk="${esc(ck)}"` : ''}><thead><tr><th class="lab">${cfBtn(ck, '지난 시즌', nOld)}</th>${lgCol ? '<th class="lg">리그 평균</th>' : ''}${cols.map(c => `<th class="${c.tot ? 'tot' : ''}${cx(c)}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`;
    // 줄 묶음: '__grp' 줄 다음부터 다음 '__grp' 줄 전까지
    let gk = null;
    const members = {}; let cg = null;
    rows.forEach(r => { if (r[0] === '__grp') { cg = r[1]; members[cg] = []; } else if (cg != null) members[cg].push(r[0]); });
    rows.forEach(([label, f, sub, desc, num, fmt, better, click]) => {
      if (label === '__grp') {
        gk = gridSec ? `${gridSec}|${f}` : null;
        h += gk ? `<tr class="grp rg${rowFolded(gk) ? ' off' : ''}" data-rgk="${esc(gk)}"><th colspan="${cols.length + (lgCol ? 2 : 1)}"><button class="rgb" data-trg="${esc(gk)}" title="이 묶음 접기 · 펼치기"><b>${esc(f)}</b><small>${esc(members[f].join(' · '))}</small></button></th></tr>`
          : `<tr class="grp"><th colspan="${cols.length + (lgCol ? 2 : 1)}">${esc(f)}</th></tr>`;
        return;
      }
      const lab = opt.descBelow && desc ? `${esc(label)}<span class="s" style="font-weight:400">${esc(desc)}</span>` : desc ? `<abbr title="${esc(desc)}">${esc(label)}</abbr>` : esc(label);
      const lgTd = lgCol ? `<td class="lg">${num ? lg50((fmt || pct)(num(lgCol))) : ''}${opt.lgSub ? `<span class="s">${opt.lgSub(label, lgCol)}</span>` : ''}</td>` : '';
      h += `<tr${gk ? ` data-rgm="${esc(gk)}"${rowFolded(gk) ? ' hidden' : ''}` : ''}><th class="lab">${lab}</th>${lgTd}` + cols.map(c => {
        const v = f(c.o, c), s = sub ? sub(c.o, c) : '';
        let cls = (c.tot ? 'tot' : '') + cx(c), style = '', d = '';
        if ((mode === 'league' || opt.league) && num && c.L && v !== '' && v != null) {
          const x = vsLeague(num(c.o), num(c.L), fmt || pct, better);
          if (x && mode === 'league') { cls += ' ' + x.cls; style = x.style; d = `<span class="d">${x.txt}</span>`; }
        }
        // click: 누르면 팝업 (베스트·워스트 에버, 초구) — 그 열의 시즌(통산은 all)
        const ck = click && v !== '' && v != null ? click(c.o, c) : null;
        const ca = ck ? ` data-tkpi="${ck}" data-tlg="${c.league || 'all'}" data-label="${esc(`${c.label} ${label}`)}" data-val="${esc(String(v).replace(/<[^>]*>/g, ''))}"` : '';
        return `<td class="${cls}${ck ? ' gpop' : ''}" style="${style}"${ca}${opt.tdAttr && v !== '' && v != null ? opt.tdAttr(label, c) : ''}>${v ?? ''}${v !== '' && v != null && s ? `<span class="s">${s}</span>` : ''}${d}${opt.rank && num && v !== '' && v != null ? opt.rank(num, c) : ''}</td>`;
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
  // 질문 항목 (개인투어 질문과 같은 방식: 상위 항목 → 하위 질문, qaPick · qaNameCats 는 index.html)
  const TQA_CATS = [
    { k: '승패', re: /승리|패배|이긴|진\s*경기|역전|무승부|비긴|승률/, items: ['통산 승률', '이긴 경기', '진 경기', '무승부', '역전승', '역전패'] },
    { k: '연승·연패', re: /연승|연패/, items: ['최다 연승', '최다 연패', '이번 시즌 연승', '포스트시즌 연승'] },
    { k: '세트 스코어', re: /세트|셧아웃|영봉|\d\s*:\s*\d/, items: ['세트 승률', '4:0 승리', '4:3 승리', '3:4 패배', '0:4 패배', '셧아웃', '풀세트 경기'] },
    { k: '종목', re: /단식|복식|남복|여복|혼복/, items: ['단식 승률', '남복 승률', '여복 승률', '혼복 승률'] },
    { k: '시즌·라운드', re: /시즌|라운드|\dR\b|포스트|정규|파이널|플레이오프/i, items: ['이번 시즌 경기', '지난 시즌 경기', '정규리그', '포스트시즌', '이번 시즌 1R'] },
  ];
  // 팀 질문 항목: 공통 묶음 + 상대 팀(자주 만난 순) + 이 팀 선수(많이 나온 순)
  function tqaCatsOf(code, text) {
    if (!D || !code) return TQA_CATS;
    const gs = gamesOf(code), oc = {}, pc = {};
    gs.forEach(g => { oc[g.opp] = (oc[g.opp] || 0) + 1; g.sets.forEach(s => s.players.forEach(n => { if (n) pc[n] = (pc[n] || 0) + 1; })); });
    const teams = Object.keys(oc).sort((a, b) => oc[b] - oc[a]).map(c => teamShort[c] || c).filter((x, i, a) => a.indexOf(x) === i);
    const players = Object.keys(pc).sort((a, b) => pc[b] - pc[a]);
    return [...TQA_CATS,
      ...qaNameCats(teams, text, '상대 팀', [n => `${n} 상대`, n => `${n} 상대 이긴 경기`, n => `${n} 상대 진 경기`, n => `이번 시즌 ${n} 상대`, n => `${n} 상대 풀세트 경기`]),
      ...qaNameCats(players, text, '선수', [n => `${n} 출전 경기`, n => `${n} 단식 승률`, n => `이번 시즌 ${n} 출전 경기`, n => `${n} 혼복 승률`])];
  }
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
    if (/연승|연패/.test(t)) return streakQA(head, (cond.includes('포스트시즌') ? gs : gs.filter(g => !g.post)).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))), g => g.post ? 'PS' : g.round);
    if (!cond.length && !kd && !/승률|세트/.test(t))
      return `<div class="qahelp">질문에서 조건을 찾지 못했어요. 위 항목을 누르면 물어볼 수 있는 질문이 나옵니다.<br><small>상대 팀 이름(예: 크라운해태, 하나), 시즌(26-27, 이번 시즌), 라운드(3R, 포스트시즌), 승/패/무, 세트 스코어(4:0), 셧아웃, 풀세트, 역전승, 선수 이름, 단식·남복·여복·혼복, 연승·연패를 알아들어요.</small></div>`;
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
  // ── 리그 검색 (상단 팀리그 창 '리그 검색' 탭): 모든 팀 · 선수 기록에서 답한다 ──
  //  조건: 시즌(26-27 · 이번/지난 시즌) · 정규리그/포스트시즌 · 라운드 · 팀 이름 · 선수 이름 · 종목
  //  답: 대체 · 이적 선수 목록(이름을 누르면 그 선수 기록) · 선수 이름(세트 기록) · 최다 연승/연패(팀 · '선수'면 세트 연승) · 현재 연승 · 역전승/셧아웃/풀세트/4:0 같은 경기 수 · 승률 순위 · 에버 순위 · 하이런
  //  연승 · 연패는 시즌이 바뀌거나 무승부가 나오면 끊는다 (팀 화면 연승 표와 같은 기준)
  const LQA_CATS = [
    { k: '연승·연패', re: /연승|연패/, items: ['최다 연승', '최다 연패', '현재 연승', '선수 최다 연승', '지난 시즌 최다 연승'] },
    { k: '대체·이적', re: /대체|이적/, items: ['대체 선수', '이번 시즌 대체 선수', '이적 선수'] },
    { k: '경기 결과', re: /역전|스윕|영봉|풀\s*세트|셧아웃/, items: ['이번 시즌 역전승', '리버스 스윕', '영봉승', '영봉패', '풀세트'] },
    { k: '팀 기록', re: /승률|에버|하이런|순위/, items: ['이번 시즌 승률', '팀 에버', '하이런'] },
    { k: '뱅크샷', re: /뱅크/, items: ['한 경기 최다 뱅크샷', '한 이닝 최다 뱅크샷', '연속 뱅크샷'] },
  ];
  // 리그 검색 항목: 공통 묶음 + 선수 이름(세트 많이 나온 순, 글자를 쓰면 맞는 이름)
  function lqaCatsOf(text) {
    if (!D) return LQA_CATS;
    const pc = {}; D.games.forEach(g => g.sets.forEach(s => (s.p || []).flat().forEach(n => { n = canonName(n); if (n) pc[n] = (pc[n] || 0) + 1; })));
    const players = Object.keys(pc).filter(n => n.length >= 2).sort((a, b) => pc[b] - pc[a]);
    return [...LQA_CATS, ...qaNameCats(players, text, '선수', [n => n, n => `${n} 한 경기 최다 뱅크샷`, n => `${n} 연속 뱅크샷`, n => `${n} 한 이닝 최다 뱅크샷`])];
  }
  function leagueQA(q, curLeague) {
    const t = q.trim().replace(/\s+/g, ' '); if (!D || !t) return '';
    const flat = t.replace(/\s/g, ''), cond = [];
    const curSeason = leagueOf[curLeague] ? leagueOf[curLeague].season : Math.max(...D.games.map(g => g.season));
    let sf = () => true, m;
    if ((m = t.match(/(\d{2})\s*-\s*(\d{2})/))) { const s = 2000 + +m[1]; sf = g => g.season === s; cond.push(`${seasonLabel(s)} 시즌`); }
    else if (/이번\s*시즌|올\s*시즌|올해/.test(t)) { sf = g => g.season === curSeason; cond.push(`${seasonLabel(curSeason)} 시즌`); }
    else if (/지난\s*시즌|작년|전\s*시즌/.test(t)) { sf = g => g.season === curSeason - 1; cond.push(`${seasonLabel(curSeason - 1)} 시즌`); }
    const post = /포스트|플레이오프|파이널|준플/.test(t);
    if (post) cond.push('포스트시즌'); else cond.push('정규리그');
    let rf = () => true;
    if ((m = t.match(/(\d)\s*(?:R\b|라운드)/i))) { rf = g => String(g.round) === `${m[1]}R`; cond.push(`${m[1]}R`); }
    const codes = [...new Set(D.games.flatMap(g => [g.t1, g.t2]))];
    const keys = codes.flatMap(c => [teamShort[c], teamName[c], ...D.teams.filter(x => x.code === c).map(x => x.name)].filter(Boolean).map(k => [k.replace(/\s/g, ''), c])).filter(([k]) => k.length >= 2).sort((a, b) => b[0].length - a[0].length);
    const hit = keys.find(([k]) => flat.includes(k)), teams = hit ? [hit[1]] : codes;
    if (hit) cond.push(teamShort[hit[1]] || hit[1]);
    const byDate = (a, b) => String(a.date).localeCompare(String(b.date));
    const G = c => gamesOf(c, g => !!g.post === post).filter(g => sf(g) && rf(g)).sort(byDate);
    const tn = c => esc(teamShort[c] || c), where = g => g.post ? 'PS' : g.round, day = g => String(g.date).slice(2, 10).replace(/-/g, '.');
    const head = title => `<div class="qahead"><b>${title}</b> · ${cond.map(esc).join(' · ')}</div>`;
    const table = (hd, rows) => rows.length ? `<table class="games qatab lqa"><thead><tr>${hd.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<div class="qasum">조건에 맞는 기록이 없습니다.</div>';
    const rankRows = (list, val, cells) => list.map(x => `<tr><td class="rkc">${list.findIndex(y => val(y) === val(x)) + 1}</td>${cells(x)}</tr>`);
    // 연속 구간: list(날짜순)에서 같은 결과가 이어진 가장 긴 구간 (무승부 · 시즌 바뀜에서 끊음). key(x) = 1 승 · -1 패 · 0 끊김
    const runs = (list, key) => { const out = []; let i = 0; while (i < list.length) { const k = key(list[i]); let j = i; if (k) while (j + 1 < list.length && key(list[j + 1]) === k && list[j + 1].season === list[i].season) j++; if (k) out.push({ k, n: j - i + 1, a: list[i], b: list[j] }); i = j + 1; } return out; };
    const span = r => `${seasonLabel(r.a.season)} ${where(r.a) === where(r.b) ? where(r.a) : `${where(r.a)}~${where(r.b)}`} <small>(${day(r.a)}~${day(r.b)})</small>`;
    const wantL = /연패/.test(t) && !/연승/.test(t);
    // 대체 · 이적 선수: 그 시즌 그 팀 홈피 명단에 없는데 세트에 나온 선수 (같은 시즌 다른 팀 명단에 있으면 이적). 명단 자료가 없는 팀-시즌은 빼고 센다
    const inRoster = new Set(), hasRoster = new Set();
    (D.rosters || []).forEach(r => { inRoster.add(`${r.league}|${r.team}|${r.canon}`); hasRoster.add(`${r.league}|${r.team}`); });
    const subKind = (g, code, n) => !hasRoster.has(`${g.league}|${code}`) || inRoster.has(`${g.league}|${code}|${n}`) ? null
      : (D.rosters || []).some(r => r.league === g.league && r.team !== code && r.canon === n) ? '이적' : '대체';
    const pBtn = n => `<button class="lqp" data-lqa="${esc(n)}" title="${esc(n)} 기록 보기">${esc(n)}</button>`;
    if (/대체|이적/.test(t) && !/연승|연패|하이런/.test(t)) {
      const want = /이적/.test(t) && !/대체/.test(t) ? '이적' : /대체/.test(t) && !/이적/.test(t) ? '대체' : null;
      const M = {};
      teams.forEach(c => G(c).forEach(g => g.sets.forEach(st => st.players.forEach(n => {
        const kd = subKind(g, c, n); if (!kd || (want && kd !== want)) return;
        const k = `${g.league}|${c}|${n}`, x = M[k] || (M[k] = { n, c, kd, season: g.season, w: 0, l: 0, rounds: [], games: new Set(), sp: 0, si: 0 });
        st.win ? x.w++ : x.l++; const rd = g.post ? 'PS' : g.round; if (!x.rounds.includes(rd)) x.rounds.push(rd); x.games.add(g.date + g.opp);
        if (st.players.length === 1 && st.inn) { x.sp += st.pts; x.si += st.inn; }
      }))));
      const list = Object.values(M).sort((a, b) => sDir(a.season, b.season) || (b.w + b.l) - (a.w + a.l));
      const title = want ? `${want} 선수` : '대체 · 이적 선수';
      return head(`${title} ${list.length}명`) + table(['시즌', '선수', '팀', '라운드', '세트', '승률', '단식 에버'], list.map(x => `<tr><td>${String(x.season).slice(2)}</td><td>${pBtn(x.n)}${want ? '' : ` <small class="${x.kd === '이적' ? 'mv' : ''}">${x.kd}</small>`}</td><td>${tn(x.c)}</td><td>${esc(x.rounds.join('·'))}</td><td>${x.w}-${x.l} <small>${x.games.size}경기</small></td><td><b>${pct(x.w / (x.w + x.l))}</b></td><td>${x.si ? f3(x.sp / x.si) : '–'}</td></tr>`))
        + '<div class="note">그 시즌 그 팀 홈피 소개 명단에 없는데 세트에 나온 선수 (같은 시즌 다른 팀 명단에 있으면 이적). 이름을 누르면 그 선수의 세트 기록.</div>';
    }
    // 리버스 스윕: 세트 0:3 에서 4:3 으로 뒤집은 경기 (진 팀은 3:0 에서 3:4). 팀 이름이 있으면 그 팀이 뒤집은 · 당한 경기, '패 · 당한 · 허용'이면 당한 경기만
    if (/리버스|역스윕/.test(flat)) {
      const lost = /패|당한|허용/.test(t) && hit, won = /승|뒤집/.test(t.replace(/스윕/g, '')) && hit && !lost;
      const xs = codes.flatMap(c => G(c).filter(g => { if (!g.win) return false; let a = 0, b = 0, down = false; g.sets.slice().sort((p, q) => p.no - q.no).forEach(s => { s.win ? a++ : b++; if (a === 0 && b === 3) down = true; }); return down; }).map(g => ({ c, g })))
        .filter(({ c, g }) => !hit || (lost ? g.opp === hit[1] : won ? c === hit[1] : c === hit[1] || g.opp === hit[1])).sort((a, b) => byDate(b.g, a.g));
      const flow = g => g.sets.slice().sort((p, q) => p.no - q.no).map(s => `<b class="${s.win ? 'w' : 'l'}" title="${s.no}세트 ${esc(KABBR[s.kind] || s.kind || '')} ${esc(s.players.join('·'))} vs ${esc((s.oppPlayers || []).join('·'))}">${s.pts}:${s.opp}</b>`).join(' ');
      const last = g => { const s = g.sets.slice().sort((p, q) => q.no - p.no)[0]; return s ? `${esc(s.players.join('·'))} <small>vs ${esc((s.oppPlayers || []).join('·'))}</small>` : '–'; };
      const row = ({ c, g }) => `<tr><td>${seasonLabel(g.season)} ${esc(where(g))}</td><td>${day(g)}</td><td><b class="w">${tn(c)}</b></td><td><b>${g.sw}:${g.sl}</b></td><td><b class="l">${tn(g.opp)}</b></td><td>${flow(g)}</td><td>${last(g)}</td></tr>`;
      const grp = (label, ys) => `<tr class="rsg"><td colspan="7">${label}</td></tr>` + ys.map(row).join('');
      // 보기 버튼(전체 · 시즌별 · 팀별): 세 보기를 다 그려 두고 board.js 가 그 자리에서 바꾼다 (고른 보기는 pba_rsview 에 기억)
      let mode = 'all'; try { mode = localStorage.getItem('pba_rsview') || 'all'; } catch (e) {}
      const seasons = ordS([...new Set(xs.map(x => x.g.season))]);
      const byTeam = codes.filter(c => !hit || c === hit[1]).map(c => ({ c, w: xs.filter(x => x.c === c), l: xs.filter(x => x.g.opp === c) })).filter(o => o.w.length + o.l.length).sort((a, b) => (b.w.length + b.l.length) - (a.w.length + a.l.length) || b.w.length - a.w.length);
      const views = {
        all: xs.map(row).join(''),
        season: seasons.map(s => grp(`${seasonLabel(s)} 시즌 <b>${xs.filter(x => x.g.season === s).length}경기</b>`, xs.filter(x => x.g.season === s))).join(''),
        team: byTeam.map(o => grp(`${tn(o.c)} <b class="w">뒤집음 ${o.w.length}</b> · <b class="l">당함 ${o.l.length}</b>`, xs.filter(x => x.c === o.c || x.g.opp === o.c))).join('') };
      const btn = (k, l) => `<button data-rsv="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`;
      return head(`리버스 스윕 ${xs.length}경기 <small>(0:3 → 4:3)</small>`) + (xs.length ? `<div class="rsvb">${btn('all', '전체')}${btn('season', '시즌별')}${btn('team', '팀별')}</div>`
        + Object.entries(views).map(([k, h]) => `<table class="games qatab lqa rsv" data-v="${k}"${mode === k ? '' : ' hidden'}><tbody>${h}</tbody></table>`).join('') : table([], []))
        + '<div class="note">세트 스코어 0:3으로 뒤지다 4세트를 내리 따서 이긴 경기 (진 팀은 3:0에서 3:4). 팀별은 뒤집은 경기 · 당한 경기를 함께 보여줍니다. 세트 점수에 마우스를 올리면 그 세트 선수.</div>';
    }
    // 선수 이름: 그 선수 세트 기록 (대체 · 이적이면 그 팀-시즌에 표시)
    const pnames = [...new Set(codes.flatMap(c => gamesOf(c).flatMap(g => g.sets.flatMap(st => st.players))))].filter(n => n && n.length >= 2).sort((a, b) => b.length - a.length);
    // 연속 뱅크샷: 이닝마다 득점 · 성공 횟수만 있어 순서를 모른다 → 득점 = 성공 × 2 (1P 없이 뱅크샷만 2개 이상)인 이닝만 확실한 연속.
    //  정규 + 포스트시즌 모두 ('포스트'면 포스트만), 단식은 선수 · 복식은 콤비로 순위 (최다 연속 → 그 기록 횟수 → 2연속 이상 횟수). 선수 이름이 있으면 그 선수 순위
    //  '한 이닝 … 뱅크'면 한 이닝 최다 뱅크샷: 1P 섞여도 그 이닝 뱅크샷 개수(득점 - 성공) 2개 이상
    const binn = /이닝/.test(t) && /뱅크/.test(t);
    if (binn || /연속\s*뱅크|뱅크\S*\s*연속/.test(t)) {
      const U = binn ? '개' : '연속', T = binn ? '한 이닝 최다 뱅크샷' : '연속 뱅크샷';
      if (!post) cond[cond.indexOf('정규리그')] = '정규 + 포스트시즌';
      const recs = teams.flatMap(c => gamesOf(c, g => !post || g.post).filter(g => sf(g) && rf(g)).flatMap(g => g.sets.flatMap(s => (s.runs || []).map((r, k) => ({ c, g, s, inn: k + 1, n: !s.hits ? 0 : binn ? r - s.hits[k] : s.hits[k], r }))
        .filter(x => x.n >= 2 && (binn || x.r === 2 * x.n)))));
      const me = pnames.find(n => flat.includes(n.replace(/\s/g, '')));
      if (!recs.length) return head(T) + '<div class="qasum">조건에 맞는 기록이 없습니다.</div>';
      const by = {};   // 팀 = 가장 최근 기록 때 팀
      recs.forEach(x => { const k = x.s.players.join('·'), o = by[k] || (by[k] = { k, single: x.s.players.length < 2, players: x.s.players, c: x.c, d: '', best: 0, bestN: 0, n: 0 }); o.n++; if (x.g.date > o.d) { o.d = x.g.date; o.c = x.c; } if (x.n > o.best) { o.best = x.n; o.bestN = 1; } else if (x.n === o.best) o.bestN++; });
      const cmp = (a, b) => b.best - a.best || b.bestN - a.bestN || b.n - a.n;
      const rank = list => { list.sort(cmp).forEach((o, i) => o.rk = i && !cmp(o, list[i - 1]) ? list[i - 1].rk : i + 1); return list; };
      const singles = rank(Object.values(by).filter(o => o.single)), combos = rank(Object.values(by).filter(o => !o.single));
      const nOf = {}; recs.forEach(x => nOf[x.n] = (nOf[x.n] || 0) + 1);
      const dist = Object.keys(nOf).map(Number).sort((a, b) => b - a).map(n => `${n}${U} ${nOf[n]}회`).join(' · ');
      const mark = ps => me && ps.includes(me) ? ' style="background:rgba(var(--heat),.15)"' : '';
      const at = x => `${seasonLabel(x.g.season)} ${esc(where(x.g))} ${x.s.no}세트 ${x.inn}이닝 vs ${tn(x.g.opp)} <small>${day(x.g)}</small>`;
      let sumH = '';
      if (me) {
        const mine = recs.filter(x => x.s.players.includes(me)), one = singles.find(o => o.k === me), cs = combos.filter(o => o.players.includes(me));
        sumH = `<div class="qasum"><b>${esc(me)}</b> · ${mine.length ? `${T} 2${U} 이상 <b>${mine.length}회</b>` : `${T} 기록 없음`}`
          + (one ? `<br>단식 최다 <b>${one.best}${U}</b> (${one.bestN}회) · 단식 순위 <b>${one.rk}위</b> / ${singles.length}명` : mine.length ? '<br>단식 기록 없음' : '')
          + cs.slice(0, 3).map(o => `<br>복식 ${esc(o.k)} 최다 <b>${o.best}${U}</b> (${o.bestN}회) · 콤비 순위 <b>${o.rk}위</b> / ${combos.length}조`).join('')
          + (cs.length > 3 ? `<br><small>그 밖의 콤비 ${cs.length - 3}조</small>` : '') + '</div>';
      }
      const top = recs.slice().sort((a, b) => b.n - a.n || byDate(b.g, a.g)).slice(0, 20);
      const rkRow = o => `<tr${mark(o.players)}><td class="rkc">${o.rk}</td><td><b>${esc(o.k)}</b></td><td>${tn(o.c)}</td><td><b>${o.best}${U}</b> ${o.bestN}회</td><td>2${U}+ ${o.n}회</td></tr>`;
      const rkList = (list, lab) => { const mineOut = me ? list.filter(o => o.players.includes(me) && o.rk > 20) : [];
        return `<div class="qahead" style="margin-top:8px"><b>${lab} 순위</b> · 최다 ${U} → 그 기록 횟수 → 2${U} 이상 횟수</div>` + table(['', lab === '단식' ? '선수' : '콤비', '팀', '최다', '합계'], [...list.slice(0, 20), ...mineOut].map(rkRow)); };
      return head(`${T} · ${dist}`) + sumH
        + table(['', '선수', '팀', '경기'], top.map(x => `<tr${mark(x.s.players)}><td><b>${x.n}${U}</b></td><td>${esc(x.s.players.join('·'))}</td><td>${tn(x.c)}</td><td>${at(x)}</td></tr>`))
        + rkList(singles, '단식') + (combos.length ? rkList(combos, '복식') : '')
        + (binn ? '<div class="note">한 이닝에 친 뱅크샷(2점짜리) 개수 = 득점 - 성공 횟수. 1P가 섞인 이닝도 셉니다 (2개 이상만). 복식은 콤비 기록.</div>' : '<div class="note">기록지엔 이닝마다 득점 · 성공 횟수만 있어 순서를 알 수 없습니다. 그래서 한 이닝을 1P 없이 뱅크샷만으로 이어 친 경우(득점 = 성공 × 2)만 연속으로 셉니다. 복식은 두 선수가 번갈아 친 콤비 기록.</div>');
    }
    // 한 경기 최다 뱅크샷: 선수 = 그 경기 단식 세트(세트 뱅크샷 수, 없으면 득점 - 성공) + 복식 세트 기록지 본인 몫(per.bank) 합, 팀 = 그 경기 전 세트 합.
    //  정규 + 포스트시즌 모두 ('포스트'면 포스트만), 1개 이상만. 순위 = 최다 → 그 기록 횟수 → 경기당 평균
    if (/경기/.test(t) && /뱅크/.test(t) && /최다|가장|제일|많/.test(t)) {
      const T = '한 경기 최다 뱅크샷';
      if (!post) cond[cond.indexOf('정규리그')] = '정규 + 포스트시즌';
      const P = {}, TM = [];   // P[이름] = { 경기 기록 … }, TM = 팀 경기 기록
      const setBank = s => s.p2 != null ? s.p2 : s.runs && s.hits ? sum(s.runs, v => v) - sum(s.hits, v => v) : null;
      teams.forEach(c => gamesOf(c, g => !post || g.post).filter(g => sf(g) && rf(g)).forEach(g => {
        const mine = {}; let tot = 0, any = false;
        g.sets.forEach(s => {
          const b = setBank(s); if (b != null) { tot += b; any = true; }
          if (s.players.length < 2) { if (b != null && s.players[0]) mine[s.players[0]] = (mine[s.players[0]] || 0) + b; }
          else (s.per || []).forEach(e => { if (e) mine[e.name] = (mine[e.name] || 0) + (e.bank || 0); });
        });
        if (any) TM.push({ c, g, n: tot });
        Object.entries(mine).forEach(([n, v]) => { const o = P[n] || (P[n] = { k: n, players: [n], c, d: '', best: 0, bestN: 0, tot: 0, gn: 0, recs: [] });
          o.tot += v; o.gn++; if (g.date > o.d) { o.d = g.date; o.c = c; } if (v >= 1) o.recs.push({ c, g, n: v });
          if (v > o.best) { o.best = v; o.bestN = 1; } else if (v === o.best && v) o.bestN++; });
      }));
      const recs = Object.values(P).flatMap(o => o.recs.map(x => ({ ...x, name: o.k })));
      if (!recs.length) return head(T) + '<div class="qasum">조건에 맞는 기록이 없습니다.</div>';
      const cmp = (a, b) => b.best - a.best || b.bestN - a.bestN || b.tot / b.gn - a.tot / a.gn;
      const pl = Object.values(P).filter(o => o.best).sort(cmp); pl.forEach((o, i) => o.rk = i && !cmp(o, pl[i - 1]) ? pl[i - 1].rk : i + 1);
      const me = pnames.find(n => flat.includes(n.replace(/\s/g, ''))), mark = n => me && n === me ? ' style="background:rgba(var(--heat),.15)"' : '';
      const nOf = {}; recs.forEach(x => nOf[x.n] = (nOf[x.n] || 0) + 1);
      const dist = Object.keys(nOf).map(Number).sort((a, b) => b - a).slice(0, 5).map(n => `${n}개 ${nOf[n]}회`).join(' · ');
      const at = x => `${seasonLabel(x.g.season)} ${esc(where(x.g))} vs ${tn(x.g.opp)} <b class="${x.g.win ? 'w' : 'l'}">${x.g.sw}:${x.g.sl}</b> <small>${day(x.g)}</small>`;
      const perH = o => `${(o.tot / o.gn).toFixed(2)}개 <small>(${o.tot}개 / ${o.gn}경기)</small>`;
      const mo = me && P[me];
      const sumH = me ? `<div class="qasum"><b>${esc(me)}</b> · ${mo && mo.best ? `최다 <b>${mo.best}개</b> (${mo.bestN}회) · 경기당 ${perH(mo)} · 순위 <b>${mo.rk}위</b> / ${pl.length}명` : `${T} 기록 없음`}</div>` : '';
      const top = recs.sort((a, b) => b.n - a.n || byDate(b.g, a.g)).slice(0, 20);
      const tTop = TM.sort((a, b) => b.n - a.n || byDate(b.g, a.g)).slice(0, 10);
      const rkRow = o => `<tr${mark(o.k)}><td class="rkc">${o.rk}</td><td><b>${esc(o.k)}</b></td><td>${tn(o.c)}</td><td><b>${o.best}개</b> ${o.bestN}회</td><td>${perH(o)}</td></tr>`;
      return head(`${T} · ${dist}`) + sumH
        + table(['', '선수', '팀', '경기'], top.map(x => `<tr${mark(x.name)}><td><b>${x.n}개</b></td><td>${esc(x.name)}</td><td>${tn(x.c)}</td><td>${at(x)}</td></tr>`))
        + `<div class="qahead" style="margin-top:8px"><b>선수 순위</b> · 최다 개수 → 그 기록 횟수 → 경기당 평균</div>`
        + table(['', '선수', '팀', '최다', '평균'], [...pl.slice(0, 20), ...(mo && mo.rk > 20 ? [mo] : [])].map(rkRow))
        + `<div class="qahead" style="margin-top:8px"><b>팀 기록</b> · 한 경기 팀 전체 뱅크샷</div>`
        + table(['', '팀', '경기'], tTop.map(x => `<tr><td><b>${x.n}개</b></td><td>${tn(x.c)}</td><td>${at(x)}</td></tr>`))
        + '<div class="note">선수 = 그 경기 단식 세트 뱅크샷 + 복식 · 혼복 세트에서 본인이 친 뱅크샷(기록지 선수별 기록). 팀 = 그 경기 모든 세트 합. 뱅크샷 1개 = 2점.</div>';
    }
    const who = !/연승|연패|하이런/.test(t) && pnames.find(n => flat.includes(n.replace(/\s/g, '')));
    if (who) {
      const xs = teams.flatMap(c => G(c).flatMap(g => g.sets.filter(st => st.players.includes(who)).map(st => ({ c, g, s: st })))).sort((a, b) => byDate(b.g, a.g) || b.s.no - a.s.no);
      if (!xs.length) return head(`${esc(who)} 세트 기록`) + '<div class="qasum">조건에 맞는 기록이 없습니다.</div>';
      const wlT = ys => { const w = ys.filter(x => x.s.win).length; return `${w}-${ys.length - w} (${pct(w / ys.length)})`; };
      const kinds = [['단식', x => x.s.players.length < 2], ['복식', x => x.s.players.length >= 2 && x.s.kind !== '혼합복식'], ['혼복', x => x.s.kind === '혼합복식']].map(([l, f]) => [l, xs.filter(f)]).filter(([, ys]) => ys.length);
      const one = xs.filter(x => x.s.players.length < 2 && x.s.inn), sp = sum(one, x => x.s.pts), si = sum(one, x => x.s.inn), hr = Math.max(0, ...xs.map(x => x.s.hr || 0));
      const stints = [...new Map(xs.slice().reverse().map(x => [`${x.g.season}|${x.c}`, x])).values()].reverse()
        .map(x => { const kd = subKind(x.g, x.c, who), rs = [...new Set(xs.filter(y => y.c === x.c && y.g.season === x.g.season).map(y => where(y.g)))].reverse(); return `${String(x.g.season).slice(2)} ${tn(x.c)}${kd ? ` <b class="${kd === '이적' ? 'mv' : 'sub'}">${kd}</b>` : ''} <small>${esc(rs.join('·'))}</small>`; });
      const rows = xs.slice(0, 30).map(({ c, g, s: st }) => { const mate = st.players.filter(n => n !== who);
        return `<tr><td>${String(g.season).slice(2)} ${esc(where(g))}</td><td>${tn(c)}</td><td>${st.no}S ${esc(KABBR[st.kind] || st.kind || '')}</td><td>${mate.length ? `+${esc(mate.join('·'))} ` : ''}<small>vs ${esc((st.oppPlayers || []).join('·'))} (${tn(g.opp)})</small></td><td><b class="${st.win ? 'w' : 'l'}">${st.pts}:${st.opp}</b> <small>${st.inn}이닝</small></td></tr>`; });
      return head(`${esc(who)} 세트 기록`) + `<div class="qasum">전체 <b>${wlT(xs)}</b>${kinds.map(([l, ys]) => ` · ${l} ${wlT(ys)}`).join('')}${si ? ` · 단식 에버 <b>${f3(sp / si)}</b>` : ''}${hr ? ` · 하이런 ${hr}` : ''}<br>${stints.join(' / ')}</div>`
        + table(['대회', '팀', '세트', '짝 · 상대', '점수'], rows) + (xs.length > 30 ? `<div class="note">최근 30세트만 보여줍니다 (전체 ${xs.length}세트).</div>` : '');
    }
    // 선수 세트 연승 · 연패 (단식 · 복식 모두, 그 선수가 나온 세트 순서)
    if (/연승|연패/.test(t) && /선수|개인|세트\s*연/.test(t)) {
      const P = {};
      D.games.filter(g => !!g.post === post && sf(persp(g, g.t1)) && rf(persp(g, g.t1))).slice().sort(byDate).forEach(raw => [raw.t1, raw.t2].forEach(side => { if (hit && side !== hit[1]) return; const g = persp(raw, side); g.sets.forEach(s => s.players.forEach(n => (P[n] || (P[n] = [])).push({ win: s.win, season: g.season, date: g.date, round: g.round, post: g.post, code: side }))); }));
      const best = Object.entries(P).map(([n, xs]) => { const r = runs(xs, x => x.win ? 1 : -1).filter(r => r.k === (wantL ? -1 : 1)).sort((a, b) => b.n - a.n)[0]; return r ? { n, r, code: xs[xs.length - 1].code } : null; }).filter(Boolean).sort((a, b) => b.r.n - a.r.n).slice(0, 20);
      return head(`선수 세트 최다 ${wantL ? '연패' : '연승'} TOP20`) + table(['', '선수', '팀', '', '기간'], rankRows(best, x => x.r.n, x => `<td><b>${esc(x.n)}</b></td><td>${tn(x.code)}</td><td><b class="${wantL ? 'l' : 'w'}">${x.r.n}${wantL ? '연패' : '연승'}</b></td><td>${span(x.r)}</td>`));
    }
    // 팀 현재 연승 · 연패 (이번 시즌 마지막 경기까지)
    if (/연승|연패/.test(t) && /현재|지금|진행/.test(t)) {
      const list = teams.map(c => { const gs = gamesOf(c, g => !g.post && g.season === curSeason).sort(byDate); const rs = runs(gs, g => g.draw ? 0 : g.win ? 1 : -1), last = rs[rs.length - 1]; return last && last.b === gs[gs.length - 1] ? { c, r: last } : null; }).filter(Boolean).sort((a, b) => (b.r.k * b.r.n) - (a.r.k * a.r.n));
      cond.splice(0, cond.length, `${seasonLabel(curSeason)} 시즌`, '정규리그');
      return head('팀 현재 연승 · 연패') + table(['팀', '', '기간'], list.map(x => `<tr><td><b>${tn(x.c)}</b></td><td><b class="${x.r.k > 0 ? 'w' : 'l'}">${x.r.n}${x.r.k > 0 ? '연승' : '연패'}</b></td><td>${span(x.r)}</td></tr>`));
    }
    // 팀 최다 연승 · 연패
    if (/연승|연패/.test(t)) {
      const list = teams.map(c => { const r = runs(G(c), g => g.draw ? 0 : g.win ? 1 : -1).filter(r => r.k === (wantL ? -1 : 1)).sort((a, b) => b.n - a.n || String(b.b.date).localeCompare(String(a.b.date))); return r[0] ? { c, r: r[0], r2: r[1] } : null; }).filter(Boolean).sort((a, b) => b.r.n - a.r.n);
      return head(`팀 최다 ${wantL ? '연패' : '연승'}`) + table(['', '팀', '', '기간'], rankRows(list, x => x.r.n, x => `<td><b>${tn(x.c)}</b></td><td><b class="${wantL ? 'l' : 'w'}">${x.r.n}${wantL ? '연패' : '연승'}</b></td><td>${span(x.r)}</td>`));
    }
    // 하이런: 한 세트 최고 연속 득점 TOP20
    if (/하이런/.test(t)) {
      const xs = teams.flatMap(c => G(c).flatMap(g => g.sets.filter(s => s.hr).map(s => ({ c, g, s })))).sort((a, b) => b.s.hr - a.s.hr || byDate(b.g, a.g)).slice(0, 20);
      return head('하이런 TOP20') + table(['', '', '선수', '팀', '경기'], rankRows(xs, x => x.s.hr, x => `<td><b>${x.s.hr}점</b></td><td>${esc(x.s.players.join('·'))}</td><td>${tn(x.c)}</td><td>${seasonLabel(x.g.season)} ${esc(where(x.g))} ${x.s.no}세트 vs ${tn(x.g.opp)} <small>${day(x.g)}</small></td>`));
    }
    // 경기 유형별 횟수: 역전승 · 역전패 · 셧아웃 · 풀세트 · 무승부 · 세트 스코어
    const TYPES = [[/역전\s*승/, '역전승 (1세트 지고 이김)', g => g.win && g.sets[0] && !g.sets[0].win], [/역전\s*패/, '역전패 (1세트 이기고 짐)', g => !g.win && !g.draw && g.sets[0] && g.sets[0].win],
      [/영봉\s*패|완봉\s*패|셧아웃\s*패/, '영봉패 (한 세트도 못 따고 짐)', g => !g.win && !g.draw && g.sw === 0], [/셧아웃|영봉|완봉/, '영봉승 (한 세트도 안 내주고 이김)', g => g.win && g.sl === 0], [/풀\s*세트/, '풀세트(7세트) 경기', g => g.sw + g.sl >= 7], [/무승부/, '무승부', g => g.draw]];
    let ty = TYPES.find(([re]) => re.test(t));
    if (!ty && (m = t.match(/([0-4])\s*:\s*([0-4])/))) { const a = +m[1], b = +m[2]; ty = [null, `세트 스코어 ${a}:${b}`, g => g.sw === a && g.sl === b]; }
    if (ty) {
      const list = teams.map(c => { const gs = G(c), hs = gs.filter(ty[2]); return { c, n: hs.length, of: gs.length, last: hs[hs.length - 1] }; }).filter(x => x.of).sort((a, b) => b.n - a.n || a.of - b.of);
      return head(ty[1]) + table(['', '팀', '', '최근'], rankRows(list, x => x.n, x => `<td><b>${tn(x.c)}</b></td><td><b>${x.n}회</b></td><td>${x.last ? `${seasonLabel(x.last.season)} ${esc(where(x.last))} vs ${tn(x.last.opp)} ${x.last.sw}:${x.last.sl}` : '–'}</td>`));
    }
    // 팀 에버 순위
    if (/에버/.test(t)) {
      const list = teams.map(c => { const gs = G(c), p = sum(gs, g => sum(g.sets, s => s.pts)), i = sum(gs, g => sum(g.sets, s => s.inn)); return { c, v: i ? p / i : null, p, i, n: gs.length }; }).filter(x => x.v != null).sort((a, b) => b.v - a.v);
      return head('팀 에버 순위') + table(['', '팀', '에버'], rankRows(list, x => x.v, x => `<td><b>${tn(x.c)}</b></td><td><b>${f3(x.v)}</b></td>`));
    }
    // 팀 승률 순위 (기본)
    if (/승률|순위|성적|전적/.test(t) || hit || cond.length > 1) {
      const list = teams.map(c => { const gs = G(c), w = gs.filter(g => g.win).length, d = gs.filter(g => g.draw).length; return { c, n: gs.length, w, d, l: gs.length - w - d, v: gs.length ? w / gs.length : null, sw: sum(gs, g => g.sw), sl: sum(gs, g => g.sl) }; }).filter(x => x.n).sort((a, b) => b.v - a.v || b.w - a.w);
      return head('팀 승률 순위') + table(['', '팀', '승률', '승-패'], rankRows(list, x => x.v, x => `<td><b>${tn(x.c)}</b></td><td><b>${pct(x.v)}</b></td><td>${x.w}-${x.d ? `${x.d}-` : ''}${x.l}</td>`));
    }
    return `<div class="qahead"><b>${esc(t)}</b></div><div class="qahelp">알아듣지 못했어요. 위 예시처럼 물어보세요. 시즌(26-27, 이번 · 지난 시즌) · 포스트시즌 · 라운드(3R) · 팀 이름 · '선수'(세트 연승)를 같이 쓸 수 있어요. '대체 선수' · '이적 선수' 목록, 선수 이름으로 그 선수 세트 기록도 찾아요.</div>`;
  }
  class TeamPane {
    constructor(el, key) {
      this.el = el; this.key = key; this.code = null; this.league = null;
      this.mode = localStorageGet('tmode_' + key) || 'self';
      try { this.secModes = JSON.parse(localStorageGet('tsmodes_' + key)) || {}; } catch (e) { this.secModes = {}; }
      this.playerView = localStorageGet('tplview') || 'base';
      try { this.roundShow = JSON.parse(localStorageGet('troundshow')) || { wl: true, pt: true, rk: true, avg: true }; } catch (e) { this.roundShow = { wl: true, pt: true, rk: true, avg: true }; }
      window.addEventListener('chiporder', () => { if (this.code && this.secs) this.renderSecs(); });
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
      // 시즌별 순위 '정규' 칸: 커서를 올리면 그 시즌 라운드별 성적 (말풍선이 커서를 따라옴)
      let srkFor = null;
      const srkMove = e => { const w = rkBub.offsetWidth, h = rkBub.offsetHeight; rkBub.style.left = Math.max(4, e.clientX + 14 + w > innerWidth - 4 ? e.clientX - 14 - w : e.clientX + 14) + 'px'; rkBub.style.top = (e.clientY + 14 + h > innerHeight - 4 ? Math.max(4, e.clientY - 14 - h) : e.clientY + 14) + 'px'; };
      el.addEventListener('mouseover', e => {
        const c = e.target.closest('[data-srk], [data-srkp], [data-snr]'); if (!c || c === srkFor) return; srkFor = c;
        if (c.dataset.snr) { const [no, lgx] = c.dataset.snr.split('|'); showRkBub(c, setNoRankTip(+no, lgx === 'all' ? null : +lgx, this.code)); srkMove(e); return; }
        if (c.dataset.srkp) { showRkBub(c, postTip(+c.dataset.srkp, this.code)); srkMove(e); return; }
        const lg = +c.dataset.srk, code = this.code, rows = roundsOf(lg).map(rd => { const o = tcalc(gamesOf(code, g => g.league === lg && !g.post && g.round_label === rd)); return o.games ? `<tr><td>${esc(rd)}</td><td>${roundRanks(lg, rd)[code] || ''}위</td><td>${o.wl}</td><td>${o.points ?? ''}${o.points != null ? '점' : ''}</td><td>${f3(o.avg)}</td></tr>` : ''; }).join('');
        showRkBub(c, `<div class="rkh0">${esc(leagueLabel(lg))} 라운드별 <small>순위 · 승패 · 승점 · 에버</small></div><table class="rdtip">${rows}</table>`); srkMove(e);
      });
      // 접고 펼친 <details> 묶음(복식 기여도)도 기억 — toggle 은 거품이 안 올라와 capture 로 받는다
      el.addEventListener('toggle', e => { const d = e.target, k = d.dataset && d.dataset.fdk; if (k && rowFolded(k) === d.open) toggleFold('row', k); }, true);
      el.addEventListener('mousemove', e => { if (srkFor && !rkBub.hidden) srkMove(e); });
      el.addEventListener('mouseout', e => { const c = e.target.closest('[data-srk], [data-srkp], [data-snr]'); if (c && !c.contains(e.relatedTarget)) { srkFor = null; hideRkBub(); } });
      el.addEventListener('click', e => {
        if (e.target.closest('[data-tqa]')) { this.setQa(!this.qaOpen); return; }
        // 질문 창 안을 눌러도 아래 칸은 반응하지 않게 (닫기는 🔍 · ✕ · 빈 곳)
        if (e.target.closest('[data-qaclose]')) { this.setQa(false); return; }
        if (e.target.closest('.qa') && !e.target.closest('input, button, .opp')) return;
        const qx = e.target.closest('[data-qex]'); if (qx) { e.preventDefault(); this.ask(qx.dataset.qex); return; }
        const qc = e.target.closest('[data-qcat]'); if (qc) { e.preventDefault(); qaToggle(this.qaCats(), this.qaTyped, this.qaSt || (this.qaSt = qaSt()), qc.dataset.qcat); this.qaPickUpd(); return; }
        // 10칸에서 펼친 세부 기록: 그 안의 누를 수 없는 곳을 누르면 접힌다
        // 육각형 말풍선이 열려 있으면: 꼭짓점이 아닌 곳을 누르면 닫기만 (섹션은 접지 않음)
        const hb = this.el.querySelector('.hexbub:not([hidden])');
        if (hb && !e.target.closest('[data-hex]')) { hb.hidden = true; return; }
        const tsm = e.target.closest('[data-tsmode]');
        if (tsm) { const [id, v] = tsm.dataset.tsmode.split('|'); this.secModes[id] = v; localStorageSet('tsmodes_' + this.key, JSON.stringify(this.secModes)); this.render(); return; }
        const tpv = e.target.closest('[data-tpv]');
        if (tpv) { this.playerView = tpv.dataset.tpv; localStorageSet('tplview', this.playerView); hideRkBub(); this.renderSecs(); return; }
        const rsb = e.target.closest('[data-trs]');
        if (rsb) { const k = rsb.dataset.trs; if (this.roundShow[k] && Object.values(this.roundShow).filter(Boolean).length < 2) return; this.roundShow[k] = !this.roundShow[k]; localStorageSet('troundshow', JSON.stringify(this.roundShow)); this.renderSecs(); return; }
        const trg = e.target.closest('[data-trg]'); if (trg) { toggleFold('row', trg.dataset.trg); return; }
        const tcf = e.target.closest('[data-tcf]'); if (tcf) { toggleFold('col', tcf.dataset.tcf); return; }
        const sec = e.target.closest('.sec');
        if (sec &&!e.target.closest(POP_CLICKABLE + ', [data-tclose], [data-tsec], [data-fold], th[data-totk]')) { const id = sec.querySelector('[data-tclose]').dataset.tclose; this.opened = this.opened.filter(x => x !== id); localStorageSet('ttiles_' + this.key, JSON.stringify(this.opened)); this.renderSecs(); return; }
        const kp = e.target.closest('[data-tkpi]'); if (kp) { this.openPop(kp); return; }
        const m = e.target.closest('[data-tmode]'); if (m) { this.mode = m.dataset.tmode; this.secModes = {}; localStorageSet('tmode_' + this.key, this.mode); localStorageSet('tsmodes_' + this.key, '{}'); this.render(); return; }
        const tl = e.target.closest('[data-ttile]') || e.target.closest('[data-tclose]');
        if (tl) { const id = tl.dataset.ttile || tl.dataset.tclose; this.opened = this.opened.includes(id) ? this.opened.filter(x => x !== id) : this.opened.concat(id); localStorageSet('ttiles_' + this.key, JSON.stringify(this.opened)); this.renderSecs(); return; }
        const op = e.target.closest('[data-topp]'); if (op) { const other = panes[this.key === 'a' ? 'b' : 'a']; other.league = this.league; other.code = op.dataset.topp; other.render(); saveTeamHash(); renderTeamH2H(); return; }
        const r = e.target.closest('tr.row'); if (r) { const d = r.nextElementSibling; d.hidden = !d.hidden; }
      });
    }
    render() {
      const leagues = D.leagues;
      if (!this.league) this.league = leagues[0] && leagues[0].league;
      if (document.body.classList.contains('sheetwin')) return;   // 기록지 창: 팀 칸은 안 보이니 고른 팀(code · league)만 쓰고 그리지 않는다
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
      // 라운드별 세트 승패 (이번 시즌 정규리그, 라운드 순서). 시즌 승패와 단 · 복 · 혼 사이 빈 곳에 칸마다 '1R' 위 · '67% 4-2' 아래 두 줄 (안 나온 라운드는 빈 칸으로 자리 유지)
      // 라운드 칸: 이번 시즌 전체 라운드(치른 라운드 + 일정에 남은 라운드, 적어도 5R까지) 자리를 고정해 두고, 아직 안 한 라운드는 빈 칸
      const RDS = (() => { const rs = new Set(roundsOf(lg)); (D.schedule || []).filter(s => s.league === lg && s.round).forEach(s => rs.add(String(s.round))); const n = Math.max(5, ...[...rs].map(r => parseInt(r) || 0)); return Array.from({ length: n }, (_, i) => `${i + 1}R`); })(), PR = {};
      reg.forEach(g => g.sets.forEach(s => s.players.forEach(n => { const x = (PR[n] || (PR[n] = {}))[g.round] || (PR[n][g.round] = { w: 0, n: 0 }); x.n++; if (s.win) x.w++; })));
      // 라운드 칸 = 단 · 복 · 혼처럼 색 블록 (1R 주황 · 2R 노랑 · 3R 파랑 · 4R 분홍 · 5R 보라), 너비는 그린 뒤 fitRch가 가장 긴 성적에 맞춘다
      const rdLine = p => { const m = PR[p.name]; if (!m || !RDS.length) return ''; return `<div class="prr" style="--rn:${RDS.length}">${RDS.map((r, i) => { const x = m[r]; return x ? `<span class="rch r${i} ${x.w / x.n >= 0.5 ? 'hi' : 'lo'}${x.w / x.n >= 0.6 ? ' hot' : ''}" title="${esc(r)} ${pct(x.w / x.n)} (${x.w}승 ${x.n - x.w}패)"><i>${esc(r)}</i><b>${Math.round(x.w / x.n * 100)}%</b><em>${x.w}-${x.n - x.w}</em></span>` : `<span class="rch r${i} empty"><i>${esc(r)}</i></span>`; }).join('')}</div>`; };
      // 한 줄: [C] 이름 승률(승-패) · 단 8-9 · 복 13-11 · 혼 6-4, 그 아래 라운드별
      const prow = p => `<div class="prow${p.captain ? ' cap' : ''}${p.st ? '' : ' none'}${p.extra ? (p.moved ? ' sub mv' : ' sub') : ''}">${subTag(p)}<span class="pn" title="${esc(p.name)}">${esc(p.name)}</span>
        ${p.st ? `<span class="pctb ${p.st.w / p.st.n >= 0.5 ? 'hi' : 'lo'}">${pct(p.st.w / p.st.n)}</span><span class="pwl">${p.st.w}-${p.st.n - p.st.w}</span>` : ''}${rdLine(p)}<span class="pk">${kindLine(p)}</span></div>`;
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
      // 이번 라운드 끝난 경기 칸: 커서 말풍선 = 세트마다 라인업 · 세트 점수 · 그때까지 세트 스코어 (title 대신)
      const f5r = g => f5(g).replace(/ title="[^"]*"/, ` data-rtip="${esc(gameFlowTip(g, code, lg))}"`);
      const thisRound = sched.length ? sched.filter(x => x.round === curR).map(x => { const opp = x.t1 === code ? x.t2 : x.t1, g = played(curR, opp); return g ? f5r(g)
          : `<div class="f5 rem" title="${esc(nameIn(opp, lg))} · ${esc((x.date || '').slice(5, 10))} ${esc(x.time || '')} 예정"><b>-</b><small class="op">${abH(opp)}</small><small class="sc">-</small></div>`; })
        : allg.filter(g => !g.post && g.round === curR).map(f5r);
      // 연승 칸에 커서: 최근 5경기 + 이 시즌 최다 연승 · 연패 (괄호 = 팀 통산 최다와 그 시즌). 무승부는 끊긴 것으로 본다
      const maxRun = (gs, w) => { let n = 0, b = 0; gs.forEach(g => { n = !g.draw && g.win === w ? n + 1 : 0; b = Math.max(b, n); }); return b; };
      const byD = gs => gs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const runLine = w => {
        const cur = maxRun(byD(allg), w), all = D.leagues.map(L => ({ s: L.season, n: maxRun(byD(gamesOf(code, g => g.league === L.league)), w) })).filter(x => x.n);
        const best = Math.max(0, ...all.map(x => x.n)), ss = all.filter(x => x.n === best).sort((a, b) => a.s - b.s).map(x => seasonLabel(x.s));
        return `<div class="r5run"><span>시즌 최다 ${w ? '연승' : '연패'}</span><b class="${w ? 'w' : 'l'}">${cur ? `${cur}연${w ? '승' : '패'}` : '–'}</b>${best ? `<small>(통산 ${best}연${w ? '승' : '패'} · ${esc(ss.join('·'))})</small>` : ''}</div>`;
      };
      const formBox = `<div class="formbox"><div class="streak ${sk.includes('승') ? 'w' : sk.includes('패') ? 'l' : ''}"><span>현재</span><b>${sk || '–'}</b><span class="arr">최근 5경기</span></div>
        <div class="last5 rnd"><span>이번 라운드${curR ? ` (${esc(curR)})` : ''}</span><div>${thisRound.join('')}</div></div>
        <div class="r5pop"><span>최근 5경기</span><div>${recent.map(f5).join('')}</div>${runLine(true)}${runLine(false)}</div></div>`;
      // 라운드별 순위·승점·승패 + 정규리그: 팀 이름 오른쪽 빈 자리에
      // 이번 라운드(홈피 일정에 안 끝난 경기가 남은 첫 라운드) 열은 노란 테두리 (상단 팀 순위 · 라운드별 순위와 같은 규칙)
      const curRd = ((D.schedule || []).filter(s => s.league === lg && !s.done).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || {}).round, rc = r => r === curRd ? ' class="rcur"' : '';
      const roundTbl = `<div class="tround"><table class="grid"><thead><tr><th class="lab"></th>${rounds.map(r => `<th${rc(r)} title="${esc(r)}${r === curRd ? ' (진행 중)' : ''}">${esc(String(r).replace(/R$/, ''))}</th>`).join('')}<th class="tot">정규</th></tr></thead><tbody>
          <tr><th class="lab">순위</th>${rounds.map(r => { const rk = roundRanks(lg, r)[code]; return `<td${rc(r)} data-rnd="${esc(code)}|${lg}|${esc(r)}">${rkH(rk, '')}</td>`; }).join('')}<td class="tot">${st ? rkH(st.rank, '') : ''}</td></tr>
          <tr><th class="lab">승점</th>${rounds.map(r => { const x = rcell(r); return `<td${rc(r)} data-rnd="${esc(code)}|${lg}|${esc(r)}">${x && x.points != null ? x.points : ''}</td>`; }).join('')}<td class="tot">${o.points ?? ''}</td></tr>
          <tr><th class="lab">승패</th>${rounds.map(r => { const x = rcell(r); return `<td${rc(r)} data-rnd="${esc(code)}|${lg}|${esc(r)}">${x ? x.wl : ''}</td>`; }).join('')}<td class="tot">${o.wl}</td></tr></tbody></table></div>`;
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
      const rkTd = (r, attr = '') => `<td class="${rkc(r)}"${r ? attr : ''}>${r ? `<b>${r}</b>` : '–'}</td>`;
      const sRows = allLgs.map(l => { const st2 = standings(l.league).find(x => x.code === code); return { l, reg: st2 ? st2.rank : null, fin: st2 ? finalRank(l) : null, in: !!st2 }; });
      const seasonRankTbl = `<div class="tsr"><table class="srank"><thead><tr><th></th>${sRows.map(x => `<th${x.l.league === lg ? ' class="now"' : ''} title="${esc(seasonLabel(x.l.season))} 시즌">${String(x.l.season).slice(2)}</th>`).join('')}</tr></thead><tbody>
        <tr><th>정규</th>${sRows.map(x => rkTd(x.reg, ` data-srk="${x.l.league}" style="cursor:help"`)).join('')}</tr>
        <tr><th>최종</th>${sRows.map(x => x.in && x.fin ? rkTd(x.fin, ` data-srkp="${x.l.league}" data-tkpi="post" data-tlg="${x.l.league}" data-label="${esc(seasonLabel(x.l.season))} 포스트시즌" data-val="최종 ${x.fin}위" style="cursor:pointer"`) : `<td>${x.in ? '<span class="s">진행</span>' : '–'}</td>`).join('')}</tr></tbody></table></div>`;
      h += `<div class="content"><div class="card"><div class="teamhead"><div><div class="teamid"><div class="pcol">${logo ? `<img src="${esc(logo)}">` : '<img alt="">'}<button class="qabtn${this.qaOpen ? ' on' : ''}" data-tqa title="이 팀 기록 질문하기">🔍</button></div><div>
        <h2>${name2(code, lg)}</h2><div class="who">${esc(seasonLabel(leagueOf[lg].season))} 시즌 · 정규리그 ${st ? rkH(st.rank) : ''}${ps ? ` · 포스트시즌 ${esc(ps)}` : ''}</div>
        <div class="modes"><button data-tmode="self" class="${mode === 'self' ? 'on' : ''}">팀 시즌</button><button data-tmode="league" class="${mode === 'league' ? 'on' : ''}">리그 평균</button><button type="button" class="mybtn${myOpen('team') ? ' on' : ''}" data-myopen="team" title="맞춤요약: 세부 칩 키워드를 골라 모아 보기">🧩<span class="mbt"> 맞춤요약</span></button></div></div><div class="trk">${roundTbl}${seasonRankTbl}</div></div>${formBox}</div>
        <div class="rosterbox">${cap.map(prow).join('')}<div class="rcols"><div class="fblk" data-fk="tm:men"><div class="rhead fhd">남자</div>${men.map(prow).join('')}</div><div class="fblk" data-fk="tm:women"><div class="rhead fhd">여자</div>${women.map(prow).join('')}</div></div></div></div>
        <div class="qa"${this.qaOpen ? '' : ' hidden'}><form class="qaf"><input class="qain" placeholder="${esc(teamShort[code] || code)} 기록에 대해 물어보세요 (예: 풀세트 경기, 크라운해태 상대)" value="${esc(this.qaText || '')}" autocomplete="off"><button type="submit">검색</button><button type="button" class="qax" data-qaclose title="닫기">✕</button></form>
          <div class="qaex">${qaPick(tqaCatsOf(code, this.qaText), this.qaTyped, this.qaSt || (this.qaSt = qaSt()))}</div><div class="qaout">${this.qaHtml || ''}</div></div>
        <div class="mysum" hidden></div>
        <div class="kpis">${k(st ? rkH(st.rank) : '', '순위', 'rank')}${k(o.points == null ? null : `${o.points}${lgAvgPts(lg) != null ? dsm(o.points - lgAvgPts(lg), 1) : ''}`, '승점', 'points')}${k(`${o.wl}${dsm(o.winRate - leagueCalc(lg).winRate, 'pct')}`, o.draw ? '승-무-패' : '승패', 'wl')}
        ${k(`${f3(o.setRatio)}${dsm(o.setRatio - leagueCalc(lg).setRatio)}`, `세트득실 ${o.setW}-${o.setL}`, 'set')}${k(`${f3(o.ptRatio)}${dsm(o.ptRatio - leagueCalc(lg).ptRatio)}`, `점수득실 ${o.pts}:${o.opp}`, 'pt')}<div class="kpi duo tri tavg">${kh([`${f3(o.avg)}${dsm(o.avg - leagueCalc(lg).avg)}`, '팀 에버', 'avg'])}<i class="dsep">/</i>${kh([f3(o.bestAvg), '베스트<em class="ev"> 에버</em>', 'best'])}<i class="dsep">/</i>${kh([f3(o.worstAvg), '워스트<em class="ev"> 에버</em>', 'worst'])}</div></div></div>`;
      this.secs = [
        ['sum', '📊', '세부 기록', '정규리그 · 시즌별', () => this.seasonSummary(code)],
        // 이번 시즌(실선 · 큰 숫자) + 통산(점선 · 아랫줄)을 한 그림에, 항목 이름 왼쪽 = 시즌 순위 · 오른쪽 = 통산 순위 (방송 요약 '이번 시즌-통산'과 같은 그림)
        ['hex', '⬡', '육각형 스탯', '이번 시즌 · 통산 · 리그 평균 비교', () => { const me = { id: code, name: teamShort[code] || code, color: tcolor(code) || 'var(--accent)' };
          // 득실성향 키워드 하나: 전체 · 승세트 · 패세트를 누르면 이번 시즌(실선 점) + 통산(점선 점)을 한 그래프 말풍선에 (개인투어와 같음)
          const kw = styleKwDuo('득실성향', [{ tag: '이번 시즌', SS: styleTableT(lg), pool: '그 시즌 팀들' }, { tag: '통산', SS: styleTableT(null), pool: '역대 팀들', dash: true }], me);
          return `<div class="fbhead" style="padding:0 14px 4px;gap:6px;flex-direction:column;align-items:flex-start">${kw}</div>` + hexChart(HEX, [{ t: hexStats(code, lg), ...me, tag: '이번 시즌' }, { t: hexStats(code, null), ...me, tag: '통산', dash: true }], [hexLeague(lg), hexLeague(null)], '그 시즌 · 역대 팀들', { ranks: true, overlay: true }); }],
        ['round', '🗓', '라운드별 성적', '이번 시즌 · 전체 시즌', () => this.roundTable(code, lg)],
        // 세트별 기록: 하위 키워드 세트별 승률 · 세트 흐름 (묶음마다 안에 또 키워드 줄, 개인투어와 같음)
        ['sets', '🎯', '세트별 기록', '세트별 승률(팀 시즌별 · 선수별) · 세트 흐름', () => `<div data-plabel="세트별 승률" data-psub>${this.setNoTable(code, lg)}</div><div data-plabel="세트 흐름" data-psub data-pbox>${this.flowTable(code)}</div>`],
        ['kind', '👥', '종목별 승률', '종목 · 복식 조합', () => this.kindTable(code, lg)],
        ['dist', '📐', '세트 스코어 분포', '4:0 ~ 0:4 · 리그 평균', () => this.distTable(code)],
        ['bank', '🎱', '뱅킹·공 색·선후공', '정규리그 · 시즌별', () => this.bankTable(code)],
        ['players', '🧑', '선수 기록', `${seasonLabel(leagueOf[lg].season)} · 홈피 소개 순서`, () => this.playerTable(code, lg, reg, gamesOf(code, g => g.league === lg && g.post))],
        ['opp', '🆚', '상대 팀별', '창단 순 · 시즌별', () => this.oppTable(code, lg)],
        ['games', '📝', '경기 기록', '줄을 누르면 세트 상세', () => this.gameList(code, lg)],
      ];
      h += `<div class="card tilecard fblk" data-fk="tm:tiles"><div class="fhd fslim">세부 기록</div><div class="tiles">${this.secs.map(([id, ic, t]) => `<div class="tile${this.opened.includes(id) ? ' on' : ''}" data-ttile="${id}"><i>${ic}</i><span>${t.replace('뱅킹·공 색·선후공', '뱅킹·선후공').replace('세트 스코어 분포', '스코어 분포')}</span></div>`).join('')}</div></div><div class="secs"></div></div>`;
      this.el.innerHTML = h;
      const kp = this.el.querySelector('.content > .card:first-child > .kpis');
      if (kp) { const w = document.createElement('div'); w.className = 'fblk'; w.dataset.fk = 'tm:kpis'; w.innerHTML = '<div class="fhd fslim">시즌 기록 칩</div>'; kp.before(w); w.append(kp); }
      if (typeof fitRch === 'function') fitRch(this.el);
      applyChipOrders(this.el);
      this.renderSecs();
      myMount(this.el.querySelector('.mysum'), 'team', this.secs, (id, body) => this.secBody(id, body));
      const qf = this.el.querySelector('.qaf');
      if (qf) qf.addEventListener('submit', e => { e.preventDefault(); this.ask(qf.querySelector('.qain').value); });
      if (qf) qf.querySelector('.qain').addEventListener('input', e => { this.qaTyped = e.target.value; this.qaSt = qaSt(); this.qaPickUpd(); });   // 쓰는 대로 맞는 하위 항목
      if (this.qaOpen) this.setQa(true, true);
    }
    // 질문 말풍선 (개인투어와 같은 동작): 로고 바로 아래에 띄운다
    setQa(open, keepFocus) {
      this.qaOpen = open;
      const box = this.el.querySelector('.qa'), btn = this.el.querySelector('[data-tqa]'); if (!box) return;
      box.hidden = !open; if (btn) btn.classList.toggle('on', open);
      if (!open) return;
      const card = box.closest('.card'), img = this.el.querySelector('.teamid .pcol');
      box.style.top = (img.getBoundingClientRect().bottom - card.getBoundingClientRect().top + 6) + 'px';
      if (!keepFocus) box.querySelector('.qain').focus();
    }
    ask(q) {
      qaFreeze(this.qaCats(), this.qaTyped, this.qaSt || (this.qaSt = qaSt())); this.qaTyped = '';
      this.qaText = q; this.qaHtml = answerTeamQA(this.code, this.league, q);
      const box = this.el.querySelector('.qa'); if (!box) return;
      box.querySelector('.qain').value = q; box.querySelector('.qaout').innerHTML = this.qaHtml; this.qaPickUpd();
    }
    // 질문 항목 칸만 다시 그린다
    qaCats() { const inp = this.el.querySelector('.qa .qain'); return tqaCatsOf(this.code, inp ? inp.value : this.qaText); }
    qaPickUpd() {
      const box = this.el.querySelector('.qa'); if (!box) return;
      box.querySelector('.qaex').innerHTML = qaPick(this.qaCats(), this.qaTyped, this.qaSt || (this.qaSt = qaSt()));
    }
    sm(id) { return this.secModes[id] || this.mode; }
    renderSecs() {
      const box = $('.secs', this.el); if (!box) return;
      this.el.querySelectorAll('[data-ttile]').forEach(x => x.classList.toggle('on', this.opened.includes(x.dataset.ttile)));
      box.innerHTML = chipSort('chiporder_team_tiles', this.secs.filter(s => this.opened.includes(s[0])), s => s[0]).map(([id, ic, t, sub, body]) =>
        `<div class="card sec fblk" data-fk="tsec:${id}" data-fsec="${id}"><div class="sechead fhd"><b${sub ? ` title="${esc(sub)}"` : ''}>${ic} ${t}</b>${id === 'sets' ? funitBtns() : ''}${TMODE_SECS.has(id) ? `<span class="bcseg smode"><button data-tsmode="${id}|self" class="${this.sm(id) === 'self' ? 'on' : ''}">팀 시즌</button><button data-tsmode="${id}|league" class="${this.sm(id) === 'league' ? 'on' : ''}">리그 평균</button></span>` : ''}${TORD_SECS.has(id) ? ordBtnH() : ''}<button class="secx" data-tclose="${id}">✕</button></div>${this.secBody(id, body)}</div>`).join('');
      applyFolds(this.el);
      // 칸마다 맨 위에 하위 항목 키워드 줄 (누른 것만 보인다, 개인투어와 같은 방식)
      box.querySelectorAll(':scope > .sec[data-fsec]').forEach(sec => { applyTotPos(sec, 't:' + sec.dataset.fsec, leagueLabel(this.league)); partifyNested(sec, 't:' + sec.dataset.fsec); });
    }
    // 항목 내용: 그리는 동안 gridSec = 항목 id (묶음 · 열 접기 상태 키)
    secBody(id, body) {
      gridSec = id;
      try { return body(); } finally { gridSec = null; }
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
      // 묶음(접기 · 펼치기): 순위 · 승패 · 리드 · 클러치 · 에버 · 뱅킹
      return [
        ['__grp', '순위 · 경기 · 승점'],
        ['정규리그 순위', rank],
        ['포스트시즌', (o, c) => { if (!c.league) return ''; const r = postRank(code, c.league); return r ? rkH(r) : esc(postResult(code, c.league) || ''); }],
        ['경기', o => o.games],
        ['승점', o => o.points, o => o.maxPoints ? `승점률 ${pct(o.pointRate)}` : '', '이기면 3점(4:3 승은 2점), 3:4 패는 1점 · 22-23은 승점 없음'],
        ['__grp', '승패 · 승률'],
        ['승-(무)-패', o => o.wl],
        ['승률', o => pct(o.winRate)],
        ['선공 세트 승률', o => pct(o.firstSet), null, '', o => o.firstSet, pct],
        ['후공 세트 승률', o => pct(o.secondSet), null, '', o => o.secondSet, pct],
        ['세트 승률', o => pct(o.setRate), o => `${o.setW}-${o.setL}`],
        ['세트득실률', o => f3(o.setRatio), o => `${o.setW}-${o.setL}`, '딴 세트 ÷ 내준 세트'],
        ['점수득실률', o => f3(o.ptRatio), o => `${o.pts}:${o.opp}`, '득점 ÷ 실점', o => o.ptRatio, f3],
        ['__grp', '리드 · 역전'],
        ['선제 리드', o => pct(o.leadFRate), o => `${o.leadFN}세트`, '먼저 남자 세트 5점 · 여자·혼복 세트 3점 차로 앞선 세트 비율', o => o.leadFRate, pct],
        ['선제 리드 허용', o => pct(o.leadARate), o => `${o.leadAN}세트`, '상대가 먼저 그 점수 차로 앞선 세트 비율 (낮을수록 좋음)', o => o.leadARate, pct, 'low'],
        ['리드 유지율', o => pct(o.leadKeep), o => `${o.leadKW}/${o.leadFN}`, '먼저 앞선 뒤 동점을 내주지 않고 이긴 세트 비율', o => o.leadKeep, pct],
        ['역전률', o => pct(o.comeback), o => `${o.leadAW}/${o.leadAN}`, '먼저 뒤진 세트 중 뒤집고 이긴 비율', o => o.comeback, pct],
        ['__grp', '클러치 · 지배력'],
        ['세트 클러치', o => pct(o.setClutch), o => `${o.lateW}/${o.lateN}`, '클러치 상황 세트 승률: 이닝과 상관없이 두 팀 모두 목표 점수까지 남자 세트 5점 · 여자·혼복 세트 4점 이내로 남은 채 세트가 이어진 세트', o => o.setClutch, pct],
        ['게임 클러치', o => pct(o.gameClutch), o => `${o.gcW}/${o.gcN}`, '경기 막판 승률: 5 · 6 · 7세트', o => o.gameClutch, pct],
        ['게임 지배력', o => f1(o.dominance), o => domSub(o).replace(/ · /g, '<br>'), '리그 평균 = 100. 점수득실률 40% · 선제 리드 비율 30% · 리드 유지율 15% · 역전률 15% (각각 그 시즌 리그 평균 대비, 10세트 미만은 빈칸)', o => o.dominance, f1],
        ['__grp', '에버 · 하이런'],
        ['팀 에버', o => f3(o.avg), null, '', o => o.avg, f3],
        ['베스트 에버', o => f3(o.bestAvg), o => o.bestG ? `vs ${esc(teamAbbr(o.bestG.opp))}` : '', '한 경기 팀 최고 에버리지', null, null, null, () => 'best'],
        ['워스트 에버', o => f3(o.worstAvg), o => o.worstG ? `vs ${esc(teamAbbr(o.worstG.opp))}` : '', '한 경기 팀 최저 에버리지', null, null, null, () => 'worst'],
        ['상대 에버', o => f3(o.oavg), null, '우리 팀을 상대로 상대가 친 에버리지 (낮을수록 좋음)', o => o.oavg, f3, 'low'],
        ['하이런', o => o.hr || ''],
        ['__grp', '뱅킹 · 초구'],
        ['뱅킹 승률', o => pct(o.bankRate), o => `${o.bankW}-${o.bankL}`, '1세트 뱅킹을 이겨 선공으로 시작한 경기 비율', o => o.bankRate, pct],
        ['초구 성공률', o => pct(o.fbSuccess), o => `${o.fbN}회`, '선공 세트 첫 이닝에 득점한 비율', o => o.fbSuccess, pct, null, () => 'fb'],
      ];
    }
    // 시즌 요약 칸 말풍선: 그 열(시즌 · 통산 정규리그)의 리그 평균 + 팀 순위만 (개인투어 시즌 요약과 같음, 같으면 같은 순위)
    seasonSummary(code) {
      const rows = this.summaryRows(code), byL = Object.fromEntries(rows.filter(r => r[0] !== '__grp').map(r => [r[0], r]));
      const EXTRA = { '승률': [o => o.winRate, pct], '세트 승률': [o => o.setRate, pct], '세트득실률': [o => o.setRatio, f3], '승점': [o => o.points, null], '하이런': [o => o.hr, null] };
      const tdAttr = (label, c) => {
        const r = byL[label] || [], [num, fmt, noAvg] = r[4] ? [r[4], r[5] || pct, false] : EXTRA[label] ? [EXTRA[label][0], EXTRA[label][1], !EXTRA[label][1]] : [];
        if (!num) return '';
        const me = num(c.o); if (me == null || isNaN(me)) return '';
        const vals = teamRankStats(c.league || null).map(x => { if (label === '게임 지배력' && x.o.dominance === undefined) x.o.dominance = dominanceOf(x.o, c.L); return num(x.o); }).filter(v => v != null && !isNaN(v) && isFinite(v));
        const rk = 1 + vals.filter(v => r[6] === 'low' ? v < me : v > me).length, lv = noAvg || !c.L ? null : num(c.L);
        return ` title="${esc([lv != null && !isNaN(lv) ? `리그 평균 ${fmt(lv)}` : '', vals.length ? `${rk}위 (${vals.length}팀 중)` : ''].filter(Boolean).join(' · '))}"`;
      };
      return grid(rows, this.seasonCols(code), this.sm('sum'), { tdAttr });
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
          <td>${o.setW}-${o.setL}<span class="s">${f3(o.setRatio)}</span></td><td>${f3(o.ptRatio)}<span class="s">${o.pts}:${o.opp}</span></td><td>${f3(o.avg)}</td></tr>`;
      }).join('');
      const o = tcalc(gs.filter(g => !g.post)), st = standings(lg).find(r => r.code === code);
      let h = `<div class="subhead">${seasonLabel(leagueOf[lg].season)} 시즌</div><div class="tw"><table class="grid"><thead><tr><th class="lab">라운드</th><th>순위</th><th>승-패</th><th>승점</th><th>세트</th><th>점수득실</th><th>에버</th></tr></thead><tbody>${rows}
        <tr class="sumrow"><th class="lab">정규리그</th><td>${st ? rkH(st.rank) : ''}</td><td>${o.wl}</td><td>${o.points == null ? '' : `<b>${o.points}</b><span class="s">${pct(o.pointRate)}</span>`}</td><td>${o.setW}-${o.setL}<span class="s">${f3(o.setRatio)}</span></td><td>${f3(o.ptRatio)}<span class="s">${o.pts}:${o.opp}</span></td><td>${f3(o.avg)}</td></tr>
        </tbody></table></div>`;
      // 전체 시즌: 라운드 × 시즌
      const ls = ordS(seasonsOfTeam[code].map(l => leagueOf[l].season)).map(s => seasonsOfTeam[code].find(l => leagueOf[l].season === s));   // 시즌 열 순서 (⇄ 버튼)
      const maxR = Math.max(...ls.map(l => roundsOf(l).length));
      const latest = ls.reduce((p, q) => leagueOf[q].season > leagueOf[p].season ? q : p), nOld = gridSec ? ls.length - 1 : 0, cxL = l => nOld && l !== latest ? ' class="cx"' : '';
      // 칸 크기 고정: 끄는 항목도 자리는 그대로 두고 글자만 숨긴다 (개인투어 라운드별 칩과 같게)
      const show = this.roundShow, RS = [['wl', '승패'], ['pt', '승점'], ['rk', '순위'], ['avg', '에버']];
      const slot = (t, on, big) => `<span class="${big ? 'sl1' : 's'}"${on ? '' : ' style="visibility:hidden"'}>${t || '&nbsp;'}</span>`;
      const lines = (x, rkT) => `${slot(x.wl, show.wl, true)}${slot(x.points != null ? `${x.points}점` : '', show.pt)}${slot(rkT, show.rk)}${slot(f3(x.avg), show.avg)}`;
      h += `<div class="subhead" style="margin-top:8px">전체 시즌 (라운드 × 시즌)</div><div class="bclegend rshow"><span class="bcpers">${RS.map(([k, l]) => `<button data-trs="${k}" class="${show[k] ? 'on' : ''}" aria-pressed="${!!show[k]}">${l}</button>`).join('')}</span></div><div class="tw"><table class="grid rtab${nOld && colFolded(gridSec) ? ' cfold' : ''}"${nOld ? ` data-cfk="${esc(gridSec)}"` : ''}><thead><tr><th class="lab">${cfBtn(nOld ? gridSec : null, '지난 시즌', nOld)}</th>${ls.map(l => `<th${cxL(l)}>${esc(leagueLabel(l))}</th>`).join('')}</tr></thead><tbody>`;
      for (let i = 0; i < maxR; i++) {
        h += `<tr><th class="lab">${i + 1}R</th>` + ls.map(l => {
          const r = roundsOf(l)[i]; if (!r) return `<td${cxL(l)}>${lines({ wl: '' }, '')}</td>`;
          const x = tcalc(gamesOf(code, g => g.league === l && !g.post && g.round_label === r)); if (!x.games) return `<td${cxL(l)}>${lines({ wl: '' }, '')}</td>`;
          const rk = roundRanks(l, r)[code];
          return `<td${cxL(l)}>${lines(x, rk ? `${rk}위` : '')}</td>`;
        }).join('') + '</tr>';
      }
      h += `<tr class="sumrow"><th class="lab">정규리그</th>${ls.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), r = standings(l).find(s => s.code === code); return `<td${cxL(l)}>${lines(x, r ? `${r.rank}위` : '')}</td>`; }).join('')}</tr>
        <tr><th class="lab">포스트시즌</th>${ls.map(l => `<td${cxL(l)}>${esc(postResult(code, l) || '')}</td>`).join('')}</tr></tbody></table></div>
        <div class="note">칸 안 순서: 승패 · 승점 · 순위 · 에버. 라운드 순위는 그 라운드 승점 → 승수 → 세트득실률 → 점수득실률로 계산. 정규리그 순위는 홈피 공식 순위.</div>`;
      return h;
    }
    setNoTable(code, lg) {
      const cols = this.seasonCols(code);
      const rows = [1, 2, 3, 4, 5, 6, 7].flatMap(n => [...(n === 1 ? [['__grp', '1~4세트']] : n === 5 ? [['__grp', '5~7세트 · 막판']] : []), [`${n}세트`, o => { const x = o.byNo[n]; return x ? pct(x.w / x.n) : ''; }, o => wlOf(o.byNo[n])]]);
      const kinds = cols[cols.length - 1].o.byNo;
      const kindLine = Object.keys(kinds).map(n => `${n}세트 ${Object.entries(kinds[n].kinds).sort((a, b) => b[1] - a[1])[0][0]}`).join(' · ');
      // 칸에 커서: 그 세트 전체 팀 순위 말풍선
      let h = `<div class="subhead">팀 세트 번호별 승률 (시즌별)</div>` + grid(rows, cols, this.sm('sets'), { tdAttr: (label, c) => ` data-snr="${parseInt(label, 10)}|${c.league || 'all'}" style="cursor:help"` }) + `<div class="note">주로 나오는 종목: ${esc(kindLine)}</div>`;
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
      let h = `<div class="subhead">종목별 승률 (시즌별)</div>` + grid(kinds.flatMap(k => [...(k === '남자복식' ? [['__grp', '복식 · 혼복']] : k === '남자단식' ? [['__grp', '단식']] : []), [k, o => { const x = o.byKind[k]; return x ? pct(x.w / x.n) : ''; }, o => { const x = o.byKind[k]; return x ? `에버 ${f3(kAvg(x))}` : ''; }, '', o => { const x = o.byKind[k]; return x ? x.w / x.n : null; }, pct]]), cols, this.sm('kind'),
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
        const fk = gridSec ? `${gridSec}|${kd}` : null;
        h += `<details class="kdsec kd${kd[0]}"${fk ? ` data-fdk="${esc(fk)}"` : ''}${fk && rowFolded(fk) ? '' : ' open'}><summary><b>${kd} 선수별 기여도</b> <span class="s">선수 누적 → 파트너별 (파트너 줄을 누르면 시즌별, 다른 팀 조합은 팀 약자 표시)</span></summary>`
          + (cur.length ? `<div class="tw"><table class="grid pairs pvsym byp">${thead}<tbody>${block(cur)}</tbody></table></div>` : '')
          + (old.length ? `<details class="oldp"><summary>예전 선수 ${old.length}명</summary><div class="tw"><table class="grid pairs pvsym byp">${thead}<tbody>${block(old)}</tbody></table></div></details>` : '')
          + '</details>';
      });
      return h + '<div class="note">기록지의 선수별 기록. 방식: <b>K더블</b> = 이닝마다 번갈아 공격(1번 선수 홀수 이닝 · 2번 짝수 이닝) — 남복 23-24까지 · 여복 25-26까지 / <b>스카치</b> = 한 이닝 안에서 번갈아 공격 — 혼복 전 시즌 · 남복 24-25부터 · 여복 26-27부터. 기여도 = 그 조합이 낸 득점 중 그 선수 몫 (누적은 모든 파트너와 낸 득점 중 몫). 공격성공률 = 성공(1점+뱅크샷) ÷ 시도. 에버 = K더블 세트에서 그 선수 득점 ÷ 자기 이닝 (스카치는 선수별 이닝이 없어 비움). 위 표는 고른 시즌의 팀 선수, 그 시즌에 없는 선수는 "예전 선수"에.</div>';
    }
    bankTable(code) {
      const wl = get => [o => { const x = get(o); return x && x.n ? pct(x.w / x.n) : ''; }, o => wlOf(get(o)), '', o => { const x = get(o); return x && x.n ? x.w / x.n : null; }, pct];
      const rows = [
        ['__grp', '뱅킹 · 공 색'],
        ['뱅킹 승률', o => pct(o.bankRate), o => `${o.bankW}-${o.bankL}`, '1세트 뱅킹을 이겨 선공으로 시작한 경기 비율', o => o.bankRate, pct],
        ['흰공 · 선공', ...wl(o => o.fstWL)], ['노란공 · 후공', ...wl(o => o.sndWL)],
        ['__grp', '종목별 선공 · 후공'],
        ['단식 선공', ...wl(o => o.fk.one.f)], ['단식 후공', ...wl(o => o.fk.one.s)], ['복식 선공', ...wl(o => o.fk.dbl.f)], ['복식 후공', ...wl(o => o.fk.dbl.s)], ['혼복 선공', ...wl(o => o.fk.mix.f)], ['혼복 후공', ...wl(o => o.fk.mix.s)],
        ['__grp', '초구'],
        ['초구 성공률', o => pct(o.fbSuccess), o => `${o.fbN}회`, '', o => o.fbSuccess, pct],
        ['초구 성공 시 승률', ...wl(o => o.fbHitWL)], ['초구 실패 시 승률', ...wl(o => o.fbMissWL)],
      ];
      // 칸 순위: 그 열(시즌 · 통산 정규리그) 팀끼리, 같으면 같은 순위 (시즌 요약 말풍선과 같은 기준)
      const pool = new Map();
      const rank = (num, c) => {
        const me = num(c.o); if (me == null || isNaN(me)) return '';
        if (!pool.has(c)) pool.set(c, teamRankStats(c.league || null));
        const vals = pool.get(c).map(x => num(x.o)).filter(v => v != null && !isNaN(v));
        return vals.length ? rankTag(1 + vals.filter(v => v > me).length, vals.length, '팀') : '';
      };
      return '<div class="bankt">' + grid(rows, this.seasonCols(code), this.sm('bank'), { league: true, rank }) + '</div><div class="note">뱅킹 승률은 경기당 한 번, 1세트 기준입니다 (1세트 선공 = 뱅킹 승). 흰공 · 노란공 줄은 전체 세트의 선공 · 후공 기록이고, 홈피에 공 색 표시가 없어 선공을 흰공으로 봅니다.</div>';
    }
    distTable(code) {
      const cols = this.seasonCols(code);
      const keys = ['4:0', '4:1', '4:2', '4:3', '3:3', '3:4', '2:4', '1:4', '0:4'];
      // 리버스 스윕: 0:3 에서 4:3 으로 이긴 경기 (반대로 3:0 에서 3:4 로 진 경기)
      const rs = [['__grp', '리버스 스윕'],
        ['0:3 → 4:3 승', o => { const x = o.state['0:3']; return x && x.w ? `${x.w}회` : (x ? '0회' : ''); }, o => { const x = o.state['0:3']; return x ? `(${x.w}/${x.n})` : ''; }, '', o => { const x = o.state['0:3']; return x ? x.w / x.n : null; }, pct],
        ['3:0 → 3:4 패', o => { const x = o.state['3:0']; return x ? `${x.n - x.w}회` : ''; }, o => { const x = o.state['3:0']; return x ? `(${x.n - x.w}/${x.n})` : ''; }, '', o => { const x = o.state['3:0']; return x ? (x.n - x.w) / x.n : null; }, pct, 'low']];
      // 표 · 그래프 버튼 (개인 세트 흐름 스코어 분포와 같은 distViewBtns · distChartHtml): 그래프 = 이번 시즌 · 통산 막대
      const sC = cols.length > 1 ? cols[cols.length - 2] : null, tC = cols[cols.length - 1];
      const btns = `<div class="dvrow">${distViewBtns()}</div>`;
      const chart = `<div class="dv-c">${distChartHtml([{ title: '7전 4선승 (정규리그)', rows: keys.filter(k => tC.o.dist[k] || (sC && sC.o.dist[k])).map(k => { const [x, y] = k.split(':').map(Number); return { k, cls: x > y ? 'w' : x < y ? 'l' : '', vals: [sC ? { tag: sC.label, n: sC.o.dist[k] || 0, N: sC.o.games } : null, { tag: '통산', n: tC.o.dist[k] || 0, N: tC.o.games }].filter(Boolean) }; }) }])}</div>`;
      return btns + chart + '<div class="dv-t">' + grid(keys.flatMap(k => [...(k === '4:0' ? [['__grp', '이긴 경기']] : k === '3:3' ? [['__grp', '무승부 · 진 경기']] : []), [k, o => o.dist[k] || '', o => o.dist[k] ? pct(o.dist[k] / o.games) : '', '', o => ratio(o.dist[k] || 0, o.games), pct]]).concat(rs), cols, this.sm('dist'), { league: true, tdAttr: (l, c) => /^0:3 → 4:3/.test(l) ? revTip(code, c, true) : /^3:0 → 3:4/.test(l) ? revTip(code, c, false) : '' }) + '<div class="note">작은 글씨 = 그 시즌 경기 중 비율. 리그 평균 = 그 스코어가 나온 비율(모든 팀), 리버스 스윕은 그 상황에서 뒤집은 비율.</div></div>';
    }
    flowTable(code) {
      const cols = this.seasonCols(code);
      const st = key => [o => { const x = o.state[key]; return x ? pct(x.w / x.n) : ''; }, o => { const x = o.state[key]; return x ? `${x.w}/${x.n}` : ''; }];
      // 줄 이름은 짧게: '1:0 → 승' = 세트 스코어가 1:0 이 된 적 있는 경기 중 이긴 비율
      const D2 = ['1:0', '0:1', '2:0', '1:1', '0:2', '3:0', '2:1', '1:2', '0:3', '3:1', '2:2', '1:3', '3:2', '2:3', '3:3'];
      const after = k => k.split(':').reduce((a, b) => +a + +b, 0), GN = { 1: '1세트 뒤', 2: '2세트 뒤', 3: '3세트 뒤', 4: '4세트 뒤', 5: '5 · 6세트 뒤' };
      const rows = D2.flatMap((k, i) => { const [f, s] = st(k), n = Math.min(after(k), 5); return [...(i === 0 || Math.min(after(D2[i - 1]), 5) !== n ? [['__grp', GN[n]]] : []), [`${k} → 승`, f, s, '', o => { const x = o.state[k]; return x ? x.w / x.n : null; }, pct]]; });
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
      const t4 = gs => gs.map(g => ({ ...g, target: 4 })), curLg = this.league;
      if (!flowLgHolder.games) flowLgHolder.games = t4(D.games.filter(g => !g.post).flatMap(g => [persp(g, g.t1), persp(g, g.t2)]));
      const summary = flowSummaryHtml(t4(gamesOf(code, g => !g.post)), t4(gamesOf(code, g => g.league === curLg && !g.post)), flowLgHolder.games, flowLgHolder, '정규리그', '통산 10경기', code, setFlowT);
      return summary + `<div class="subhead" style="margin-top:8px">상황별 승률 · 리버스 스윕</div><div class="note" style="padding:6px 14px 0"><b>2:1 → 승</b> = 세트 스코어가 2:1이 된 적 있는 경기 중 이긴 비율 (작은 글씨 이긴 경기/도달한 경기).</div><div class="flowtab">` +
        grid(rows, cols, this.sm('sets'), { league: true }) + grid(rev, cols, this.sm('sets'), { league: true, tdAttr: (l, c) => l === '0:3 → 승' ? revTip(code, c, true) : l === '3:0 → 패' ? revTip(code, c, false) : '' }) + '</div>';
    }
    playerTable(code, lg, reg, post) {
      const roster = rosterOf(code, lg, reg).filter(p => p.st);
      if (!roster.length) return '<div class="note">기록이 없습니다.</div>';
      // 보기 버튼: 기본 정보 | 세트별 | 라운드별
      const view = ['base', 'set', 'round', 'fbst'].includes(this.playerView) ? this.playerView : 'base';
      const seg = `<div class="bclegend rshow"><span class="bcseg">${[['base', '기본 정보'], ['set', '세트별'], ['round', '라운드별'], ['fbst', '스코어별 초구']].map(([k, l]) => `<button data-tpv="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('')}</span></div>`;
      const cell = (x, cls = '', tip = '', attr = '') => `<td class="${cls}"${tip ? ` title="${esc(tip)}"` : ''}${attr}>${x && x.n ? `<b>${pct(x.w / x.n)}</b><span class="s">${wlOf(x)}</span>` : ''}</td>`;
      const rateCell = (v, n, sub, cls = '') => `<td class="${cls}">${n && v != null ? `<b>${pct(v / n)}</b><span class="s">${sub}</span>` : ''}</td>`;
      const zone = i => `z${i % 2}`;
      const atkTip = a => a && a.att ? `공격 성공률 ${pct(a.succ / a.att)} (${a.succ}/${a.att})` : '';
      const nameTh = rp => `<th class="lab">${subTag(rp)}${esc(rp.name)}${rp.gender === 'F' ? ' <span class="tag">LPBA</span>' : ''}</th>`;
      // 줄 묶음: 남자 · 여자 (성별이 바뀌는 줄 앞에 묶음 줄)
      let lastG = null;
      const gk = rp => gridSec ? `${gridSec}|${rp.gender === 'F' ? '여자' : '남자'}` : null;
      const gHead = rp => { const g = rp.gender === 'F' ? '여자' : '남자'; if (!gridSec || g === lastG) return ''; lastG = g; const k = gk(rp), names = roster.filter(x => (x.gender === 'F') === (g === '여자')).map(x => x.name);
        return `<tr class="grp rg${rowFolded(k) ? ' off' : ''}" data-rgk="${esc(k)}"><th colspan="40"><button class="rgb" data-trg="${esc(k)}" title="이 묶음 접기 · 펼치기"><b>${g}</b><small>${esc(names.join(' · '))}</small></button></th></tr>`; };
      const rowOpen = rp => `${gHead(rp)}<tr class="${rp.extra ? (rp.moved ? 'subrow mv' : 'subrow') : ''}"${gk(rp) ? ` data-rgm="${esc(gk(rp))}"${rowFolded(gk(rp)) ? ' hidden' : ''}` : ''}>${nameTh(rp)}`;
      // 열 접기: 기본 정보 = 종목(단식 · 복식 · 혼복) 칸, 라운드별 = 지난 라운드 (마지막 라운드만 남김)
      const nR = new Set(reg.map(g => g.round)).size, nCx = view === 'base' ? 3 : view === 'round' && nR > 1 ? nR - 1 : 0;
      const ck = gridSec && nCx ? `${gridSec}.${view}` : null, cx = ck ? ' cx' : '', cfTh = ck ? cfBtn(ck, view === 'base' ? '종목' : '지난 라운드', nCx, '선수') : '선수';
      let h = seg + `<div class="tw"><table class="grid ptab${ck && colFolded(ck) ? ' cfold' : ''}"${ck ? ` data-cfk="${esc(ck)}"` : ''}>`;
      if (view === 'base') {
        h += `<thead><tr><th class="lab">${cfTh}</th><th class="gs z0">승률</th><th class="gs z1${cx}">단식</th><th class="z1${cx}">복식</th><th class="z1${cx}">혼복</th><th class="gs z0">초구 성공률</th><th class="gs z1">장타율</th><th class="gs z0">공격성공률</th><th class="gs z1">뱅크샷<br>득점 비율</th><th class="gs z0" title="마지막 이닝 5점 이상 연속 득점으로 세트를 끝낸 횟수">끝내기 장타<br><small>시즌/통산</small></th></tr></thead><tbody>`;
        // 끝내기 장타 칸: 윗줄 단식(그 선수) 시즌 순위 · 시즌/통산 · 통산 순위, 아랫줄 지금 같은 팀 선수와의 복식 콤비마다 (+짝 이름)
        const F = f5Table(lg), mates = new Set(roster.map(r => r.name)), f5Line = (k, lab) => { const s5 = F.s[k] || 0, a5 = F.a[k] || 0; return a5 ? `<span class="f5l" data-rtip="${esc(F.tip(k))}">${lab ? `<small>${esc(lab)}</small> ` : ''}${F.rk(F.s, k) ? `<em>${F.rk(F.s, k)}</em> ` : ''}<b>${s5}/${a5}</b>${F.rk(F.a, k) ? ` <em>${F.rk(F.a, k)}</em>` : ''}</span>` : ''; };
        const f5Cell = name => { const lines = [f5Line(name, '')].concat(Object.keys(F.a).filter(k => k.includes('|') && k.split('|').includes(name) && k.split('|').every(n => n === name || mates.has(n))).sort((x, y) => F.a[y] - F.a[x]).map(k => f5Line(k, '+' + k.split('|').filter(n => n !== name).join('·')))).filter(Boolean);
          return `<td class="gs z0 f5c">${lines.join('') || ''}</td>`; };
        roster.forEach(rp => { const p = rp.st, q = p.rk, dbl = { w: 0, n: 0 }; ['남자복식', '여자복식'].forEach(k => { if (p.byKind[k]) { dbl.w += p.byKind[k].w; dbl.n += p.byKind[k].n; } });
          h += `${rowOpen(rp)}${cell(p, 'gs z0 tot')}${cell(p.single, 'gs z1' + cx, p.single.i ? `단식 에버 ${f3(p.single.p / p.single.i)} (${p.single.p}점 / ${p.single.i}이닝)` : '')}${cell(dbl, 'z1' + cx, atkTip((p.atk || {}).dbl))}${cell(p.byKind['혼합복식'], 'z1' + cx, atkTip((p.atk || {}).mix))}${cell(p.fbS, 'gs z0', p.fbD && p.fbD.n ? `복식·혼복 초구(팀) ${pct(p.fbD.w / p.fbD.n)} (${p.fbD.w}/${p.fbD.n})` : '')}${rateCell(q.long, p.single.i, `${q.long}회`, 'gs z1')}${rateCell(q.succ, q.att, `${q.succ}/${q.att}`, 'gs z0')}${rateCell(q.bank * 2, q.own, `${q.bank * 2}점`, 'gs z1')}${f5Cell(rp.name)}</tr>`;
        });
        h += '</tbody></table></div><div class="note">초구 = 단식 선공 세트 첫 이닝 득점 성공률 (복식 · 혼복 팀 초구는 커서를 올리면). 장타율 = 단식 이닝 중 5점 이상 이닝. 끝내기 장타 = 마지막 이닝 5점 이상 연속 득점으로 끝낸 세트 수 (이번 시즌/통산, 앞 = 시즌 순위 · 뒤 = 통산 순위, 단식은 그 선수 · +이름 = 그 짝과의 복식 콤비). 공격성공률 = 단식 · 복식 성공 ÷ 시도. 뱅크샷 득점 비율 = 단식 · 복식 본인 득점 중 뱅크샷 득점. 커서를 올리면 단식 = 단식 에버, 복식 · 혼복 = 그 종목 공격 성공률. 홈피 선수 소개 순서(캡틴 → 남자 → 여자, 나이순), 정규리그 기준.</div>';
      } else if (view === 'fbst') {
        // 세트 스코어별 초구 성공률: 단식 선공 세트 첫 이닝 득점 (그 세트를 시작할 때 팀 세트 스코어)
        const ORD = ['0:0', '1:0', '0:1', '2:0', '1:1', '0:2', '3:0', '2:1', '1:2', '0:3', '3:1', '2:2', '1:3', '3:2', '2:3', '3:3'];
        const ks = ORD.filter(k => roster.some(r => r.st.fbSt && r.st.fbSt[k]));
        h += `<thead><tr><th class="lab">선수</th><th class="gs z0">전체</th>${ks.map((k, i) => `<th class="gs ${zone(i + 1)}">${k}</th>`).join('')}</tr></thead><tbody>`;
        roster.forEach(rp => { const p = rp.st; h += `${rowOpen(rp)}${cell(p.fbS, 'gs z0 tot')}${ks.map((k, i) => cell(p.fbSt && p.fbSt[k], `gs ${zone(i + 1)}`)).join('')}</tr>`; });
        h += '</tbody></table></div><div class="note">세트 스코어별 초구 성공률 = 그 세트를 시작할 때 팀 세트 스코어(우리 팀 : 상대)에서, 단식 선공 세트 첫 이닝에 득점한 비율 (작은 글씨 성공-실패). 정규리그 기준.</div>';
      } else if (view === 'set') {
        // 세트 칸은 승률 · 승패. 커서를 올리면 말풍선: 짝수 세트 우세/열세 · 3·5세트 우세/동점/열세 · 7세트 3:2/2:3 (1세트는 없음)
        const nos = [1, 2, 3, 4, 5, 6, 7].filter(n => roster.some(r => r.st.byNo[n]));
        const SUBS = n => n === 1 ? [] : n === 7 ? [['from32', '3:2'], ['from23', '2:3']] : n % 2 ? [['lead', '우세'], ['tie', '동점'], ['trail', '열세']] : [['lead', '우세'], ['trail', '열세']];
        h += `<thead><tr><th class="lab">선수</th>${nos.map((n, i) => `<th class="gs ${zone(i)}">${n}세트</th>`).join('')}</tr></thead><tbody>`;
        roster.forEach(rp => { const p = rp.st;
          h += `${rowOpen(rp)}${nos.map((n, i) => { const bs = (p.byNoSit || {})[n] || {}, subs = SUBS(n).map(([k, l]) => `${l}~${bs[k] ? bs[k].w : 0}~${bs[k] ? bs[k].n : 0}`).join(','); return cell(p.byNo[n], `gs ${zone(i)}`, '', p.byNo[n] && subs ? ` data-pst="${esc(rp.name)}|${n}|${subs}"` : ''); }).join('')}</tr>`;
        });
        h += '</tbody></table></div><div class="note">세트 칸에 커서를 올리면 그 세트가 시작될 때 팀 세트 스코어가 앞섰을 / 같았을 / 뒤졌을 때의 승률 (1세트는 늘 0:0이라 없음). 7세트: 3:2 = 3:2에서 6세트를 지고 온 7세트, 2:3 = 2:3에서 6세트를 이기고 온 7세트. 정규리그 기준.</div>';
      } else {
        // 라운드 칸: 승률 · 승패 아래에 그 라운드 경기별 상대와 출전 세트 결과 (치른 순서)
        const rounds = [...new Set(reg.map(g => g.round))];
        const games = r => reg.filter(g => g.round === r).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const rcx = i => i < rounds.length - 1 ? cx : '';
        h += `<thead><tr><th class="lab">${cfTh}</th>${rounds.map((r, i) => `<th class="gs ${zone(i)}${rcx(i)}">${esc(r)}</th>`).join('')}</tr></thead><tbody>`;
        roster.forEach(rp => { const p = rp.st;
          h += `${rowOpen(rp)}${rounds.map((r, i) => { const x = p.byRound[r]; if (!x || !x.n) return `<td class="gs ${zone(i)}${rcx(i)}"></td>`;
            const lines = games(r).map(g => { const ss = g.sets.filter(s => s.players.includes(rp.name)); return ss.length ? `<span class="prg"><small>${esc(teamAbbr(g.opp))}</small> ${ss.map(s => `<span class="${s.win ? 'w' : 'l'}">${s.no}${s.win ? '승' : '패'}</span>`).join(' ')}</span>` : ''; }).join('');
            return `<td class="gs ${zone(i)} prd${rcx(i)}"><b>${pct(x.w / x.n)}</b><span class="s">${wlOf(x)}</span>${lines}</td>`; }).join('')}</tr>`;
        });
        h += '</tbody></table></div><div class="note">라운드 칸: 그 라운드 승률 · 승패, 아래는 치른 순서대로 상대와 출전 세트 결과 (예: 1승 = 1세트 승). 정규리그 기준.</div>';
      }
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
      // 열 순서: 통산 → 이번 시즌 → 지난 시즌들 (지난 시즌은 접을 수 있음)
      const ck = gridSec && ls.length ? gridSec : null;
      const rows = opps.map(c => {
        const cur = tcalc(all.filter(g => g.opp === c && g.league === lg)), t = tcalc(all.filter(g => g.opp === c));
        return `<tr><th class="lab"><span class="opp" data-topp="${esc(c)}">${esc(teamShort[c] || teamName[c] || c)}</span></th>
          <td class="tot"><b>${t.wl}</b><span class="s">${pct(t.winRate)}</span></td><td>${t.setW}-${t.setL}</td>
          <td class="tot">${cur.games ? `<b>${cur.wl}</b>` : ''}</td><td>${cur.games ? `${cur.setW}-${cur.setL}` : ''}</td><td>${cur.games && cur.points != null ? cur.points : ''}</td>
          ${ls.map(l => { const x = tcalc(all.filter(g => g.opp === c && g.league === l)); return `<td${ck ? ' class="cx"' : ''}>${x.games ? x.wl : ''}</td>`; }).join('')}</tr>`;
      }).join('');
      return `<div class="tw"><table class="grid${ck && colFolded(ck) ? ' cfold' : ''}"${ck ? ` data-cfk="${esc(ck)}"` : ''}><thead><tr><th class="lab">${cfBtn(ck, '지난 시즌', ls.length, '상대 팀')}</th><th class="tot">통산</th><th>세트</th><th class="tot">이번 시즌</th><th>세트</th><th>승점</th>${ls.map(l => `<th${ck ? ' class="cx"' : ''}>${esc(leagueLabel(l))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="note">팀 순서 = 창단 순 (홈피 팀 코드 순). 정규리그 기준.</div>`;
    }
    gameList(code, lg) {
      const gs = gamesOf(code, g => g.league === lg).slice().reverse(), names = stageNames(lg);
      return `<table class="games"><thead><tr><th>날짜</th><th>라운드</th><th>상대</th><th>결과</th><th>세트 흐름</th><th>승점</th><th>에버</th></tr></thead><tbody>${gs.map((g, i) => {
        // 줄 묶음: 라운드(포스트시즌은 단계) — 최신 라운드부터
        const rk = g.post ? names[g.post_code] : g.round, k = gridSec ? `${gridSec}|${rk}` : null, prev = gs[i - 1], first = !prev || (prev.post ? names[prev.post_code] : prev.round) !== rk;
        const n = gs.filter(x => (x.post ? names[x.post_code] : x.round) === rk), wl = `${n.filter(x => x.win).length}승 ${n.filter(x => !x.win && !x.draw).length}패${n.some(x => x.draw) ? ` ${n.filter(x => x.draw).length}무` : ''}`;
        const head = k && first ? `<tr class="grp rg${rowFolded(k) ? ' off' : ''}" data-rgk="${esc(k)}"><th colspan="7"><button class="rgb" data-trg="${esc(k)}" title="이 묶음 접기 · 펼치기"><b>${esc(rk)}</b><small>${n.length}경기 · ${wl}</small></button></th></tr>` : '';
        return head + (k ? gameRowT(g, lg, names).replace(/<tr class="(row|det)"( hidden)?/g, (m, c, hd) => `<tr class="${c}" data-rgm="${esc(k)}"${hd || rowFolded(k) ? ' hidden' : ''}`) : gameRowT(g, lg, names));
      }).join('')}</tbody></table>`;
    }
    // ── 기본정보 칸 팝업 ──
    // 칩 팝업 (개인투어와 같은 방식): 맨 위 하위 항목 키워드. 묶은 칩(팀 에버 · 베스트 · 워스트)은 그 값들이 키워드(누른 값만 켠 채로), 하나짜리 칩은 안쪽 소제목이 키워드
    openPop(kp) {
      closePop();
      const grp = [...(kp.closest('.kpi') || kp).querySelectorAll('[data-tkpi]')];
      if (kp.dataset.tkpi !== 'avg') grp.sort((a, b) => (a.dataset.tkpi === 'avg') - (b.dataset.tkpi === 'avg'));   // 베스트·워스트를 누르면 팀 에버는 아래로
      const body = grp.length < 2 ? this.popBody(kp.dataset.tkpi, kp.dataset.tlg)
        : grp.map(x => `<div data-plabel="${esc(x.dataset.label)}" data-pk="${x.dataset.tkpi}"><div class="subhead" style="padding:8px 0 4px">${esc(x.dataset.label)}</div>${this.popBody(x.dataset.tkpi, x.dataset.tlg)}</div>`).join('');
      const r = this.el.getBoundingClientRect(), w = document.createElement('div');
      w.className = 'popwrap'; w._pane = this.el;
      Object.assign(w.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      w.innerHTML = `<div class="pop"><div class="pophead"><b>${esc(kp.dataset.label)}</b><span class="popval">${esc(kp.dataset.val || ($('b', kp) || kp).textContent)}</span><button class="popx">✕</button></div><div class="popbody${grp.length > 1 ? ' side' : ''}">${body}</div></div>`;   // 묶은 칩: 항목을 좌우로 나란히
      w.addEventListener('click', e => {
        if (e.target === w || e.target.closest('.popx')) { closePop(); return; }
        if (!e.target.closest(POP_CLICKABLE)) { closePop(); return; }   // 누를 수 없는 곳을 누르면 닫힘
        const o = e.target.closest('[data-topp]'); if (o) { closePop(); const other = panes[this.key === 'a' ? 'b' : 'a']; other.league = this.league; other.code = o.dataset.topp; other.render(); saveTeamHash(); renderTeamH2H(); }
      });
      document.body.appendChild(w);
      if (grp.length < 2) partify(w.querySelector('.popbody'), []);   // 묶은 칩(팀 에버·베스트·워스트)은 키워드 없이 전부
    }
    popBody(key, lgx) {
      const code = this.code, lg = this.league, reg = gamesOf(code, g => g.league === lg && !g.post), rounds = roundsOf(lg);
      const tbl = (head, rows) => `<table class="games"><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const byRound = f => tbl(['라운드', ...f.head], rounds.map(r => { const x = tcalc(reg.filter(g => g.round === r)); return x.games ? [`<b>${r}</b>`, ...f.cells(x, r)] : null; }).filter(Boolean));
      const byOpp = f => { const opps = [...new Set(reg.map(g => g.opp))].sort(); return tbl(['상대', ...f.head], opps.map(c => { const x = tcalc(reg.filter(g => g.opp === c)); return [`<span class="opp" data-topp="${esc(c)}">${esc(teamShort[c] || c)}</span>`, ...f.cells(x)]; })); };
      const sub = t => `<div class="subhead" style="padding:8px 0 4px">${t}</div>`;
      const seasons = ordBy(seasonsOfTeam[code], l => leagueOf[l].season);
      // 팝업 범위: 시즌 요약 칸에서 누르면 그 열의 시즌(통산 = null), 칩에서 누르면 지금 시즌
      const scope = lgx == null ? lg : lgx === 'all' ? null : Number(lgx);
      const scopeLab = scope == null ? '통산' : `${seasonLabel(leagueOf[scope].season)} 시즌`;
      const allSeasons = ordBy(seasonsOfTeam[code], l => leagueOf[l].season);
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
      if (key === 'post') {
        const names = stageNames(scope), gs = gamesOf(code, g => g.league === scope && g.post).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const all = (D.post_standings || []).filter(s => s.league === scope).slice().sort((a, b) => a.rank - b.rank);
        const pr = postRank(code, scope), stages = [...new Set(gs.map(g => names[g.post_code]))];
        let h = gs.length ? '' : `<div class="note">${seasonLabel(leagueOf[scope].season)} 시즌 포스트시즌에 나가지 못했습니다.</div>`;
        stages.forEach(st => {
          const x = gs.filter(g => names[g.post_code] === st), o = tcalc(x);
          h += sub(`${esc(st)} <small>${o.wl} · 세트 ${o.setW}-${o.setL} · 에버 ${f3(o.avg)}</small>`) + tbl(['날짜', '상대', '결과', '세트 흐름', '에버'], x.map(g => [esc(String(g.date).slice(5, 10)), `<span class="opp" data-topp="${esc(g.opp)}">${esc(teamShort[g.opp] || g.opp)}</span>`, `<b class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'} ${g.sw}:${g.sl}</b>`, `<span class="seq">${seqHtml(g.sets)}</span>`, `${f3(g.avg)} : ${f3(g.oavg)}`]));
        });
        if (gs.length) { const o = tcalc(gs); h += sub('포스트시즌 합계') + tbl(['최종 순위', '승패', '세트', '에버', '상대 에버'], [[pr ? rkH(pr) : esc(postResult(code, scope) || ''), o.wl, `${o.setW}-${o.setL}`, f3(o.avg), f3(o.oavg)]]); }
        if (all.length) h += sub('그 시즌 포스트시즌 순위') + tbl(['순위', '팀'], all.map(s => [rkH(s.rank), `<span${s.team === code ? ' style="font-weight:800"' : ''}>${tnameH(s.team, teamShort[s.team] || s.team)}</span>`]));
        return h;
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
        + sub('시즌별 승점') + tbl(['시즌', '승점', '리그 평균', '승점률', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l), la = lgAvgPts(l); return [leagueLabel(l), x.points == null ? `승점 없음<span class="s">${x.wl}</span>` : `<b>${x.points}</b>${la != null ? dsm(x.points - la, 1) : ''}`, la != null ? la.toFixed(1) : '', x.points == null ? '' : `${pct(x.pointRate)}${dsm(x.pointRate - L.pointRate, 'pct')}`, x.points == null ? '' : pct(L.pointRate)]; }))
        + sub('연승 · 연패') + tbl(STREAK_HEAD, streakRows(gamesOf(code, g => !g.post).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))), g => g.round))
        + `<div class="note">리그 평균 승점 = 그 시즌(라운드) 모든 팀 승점 합 ÷ 팀 수. 승점률 = 딴 승점 ÷ 최대 승점(경기 × 3). 22-23 시즌은 홈피 순위표에 승점이 없고 승률 · 승차로 순위를 매겨, 모든 팀이 승점 없음으로 나옵니다. ${STREAK_NOTE}</div>`;
      if (key === 'wl') return sub('라운드별 승패') + byRound({ head: ['승패', '승률', '리그 평균'], cells: (x, r) => [`<b>${x.wl}</b>`, `${pct(x.winRate)}${dsm(x.winRate - lgRound(lg, r).winRate, 'pct')}`, lg50(pct(lgRound(lg, r).winRate))] })
        + sub('시즌별 승패') + tbl(['시즌', '승패', '승률', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l); return [leagueLabel(l), `<b>${x.wl}</b>`, `${pct(x.winRate)}${dsm(x.winRate - L.winRate, 'pct')}`, lg50(pct(L.winRate))]; }))
        + sub('상대 팀별 승패') + byOpp({ head: ['승패', '세트'], cells: x => [`<b>${x.wl}</b>`, `${x.setW}-${x.setL}`] })
        + sub('최근 10경기') + tbl(['날짜', '라운드', '상대', '결과', '세트 흐름'], reg.slice(-10).reverse().map(g => [esc((g.date || '').slice(5, 10)), g.round, `<span class="opp" data-topp="${esc(g.opp)}">${esc(teamShort[g.opp] || '')}</span>`, `<b class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'} ${g.sw}:${g.sl}</b>`, `<span class="seq">${seqHtml(g.sets)}</span>`]));
      if (key === 'set') { const o = tcalc(reg); return sub('라운드별 세트득실') + byRound({ head: ['세트득실률', '리그 평균', '세트'], cells: (x, r) => [`<b>${f3(x.setRatio)}</b>${dsm(x.setRatio - lgRound(lg, r).setRatio)}`, f3(lgRound(lg, r).setRatio), `${x.setW}-${x.setL}`] })
        + sub('시즌별 세트득실') + tbl(['시즌', '세트득실률', '리그 평균', '세트 승률', '리그 평균'], seasons.map(l => { const x = tcalc(gamesOf(code, g => g.league === l && !g.post)), L = leagueCalc(l); return [leagueLabel(l), `<b>${f3(x.setRatio)}</b>${dsm(x.setRatio - L.setRatio)}`, f3(L.setRatio), `${pct(x.setRate)}${dsm(x.setRate - L.setRate, 'pct')}`, lg50(pct(L.setRate))]; }))
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
    return `<tr class="row"><td class="gd"><span class="gy">${esc((g.date || '').slice(0, 5))}</span>${esc((g.date || '').slice(5, 10))}</td><td>${esc(g.post ? names[g.post_code] : g.round)}${h2h ? ` <span class="s" style="display:inline">${esc(seasonLabel(g.season))}</span>` : ''}</td>
      <td>${h2h ? '' : `<span class="opp" data-topp="${esc(g.opp)}"><span class="onm">${esc(teamShort[g.opp] || nameIn(g.opp, g.league))}</span><span class="oab">${esc(teamAbbr(g.opp))}</span></span>`}</td>
      <td><span class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'}</span> <b>${g.sw}:${g.sl}</b></td><td class="seq">${seqHtml(g.sets)}</td><td>${g.points ?? ''}</td>
      <td class="gav">${f3(g.avg)}${g.oavg != null ? `<span class="goa"> : ${f3(g.oavg)}</span>` : ''}</td></tr>
      <tr class="det" hidden><td colspan="7"><table class="games setdet"><tbody>${g.sets.map(s => `<tr><td>${s.no}S <span class="s" style="display:inline">${esc(s.kind || '')}</span></td>
        <td class="${s.win ? 'w' : ''}">${esc(s.players.join('·'))}</td><td><b class="${s.win ? 'w' : 'l'}">${s.pts}:${s.opp}</b> <span class="s" style="display:inline">${s.inn}이닝</span></td>
        <td>${esc(s.oppPlayers.join('·'))}</td><td>에버 ${f3(s.avg)} : ${f3(s.oavg)}</td><td>HR ${s.hr ?? ''} : ${s.ohr ?? ''}</td><td>${s.first == null ? '' : s.first ? '선공' : '후공'}${s.runs && s.first ? ` · 초구 ${s.runs[0]}` : ''}</td></tr>`).join('')}</tbody></table></td></tr>`;
  }

  // 선수별 세트 기록: 세트 번호·라운드·종목별, 세트 시작 때 팀 스코어가 열세/동점/우세일 때
  // 선수별 통산 기록 (정규리그, 팀 무관). 자료가 바뀌면 다시 계산
  let careerCache = null;
  function careerPlayers() {
    if (careerCache && careerCache.D === D) return careerCache.m;
    const gs = D.games.filter(g => !g.post).flatMap(g => [persp(g, g.t1), persp(g, g.t2)]);
    careerCache = { D, m: Object.fromEntries(playerStats(gs).map(p => [p.name, p])) };
    return careerCache.m;
  }
  // 끝내기 장타 = 마지막 이닝에 5점 이상 연속 득점으로 목표 점수를 채워 세트를 끝낸 것. 단식은 선수, 복식은 콤비('|' 로 이은 이름) 기록
  //  f5Table(lg): { s: 이번 시즌 횟수, a: 통산 횟수 } (정규리그). 순위는 같은 단식 / 복식끼리, 횟수가 많을수록 위 (같으면 같은 순위)
  // 끝내기 장타 상황: 마지막 이닝을 시작할 때 점수 차 (같은 이닝 아니어도 됨) — 3점 이상 앞섬 = 우세, ±2점 = 박빙, 3점 이상 뒤짐 = 열세
  //  상대 점수 = 그때까지 상대가 친 이닝 (내가 선공이면 앞 이닝까지, 후공이면 같은 이닝까지)
  const f5Sit = s => { const k = s.runs.length - 1, me = sum(s.runs.slice(0, k), v => v || 0), op = sum((s.oruns || []).slice(0, s.first ? k : k + 1), v => v || 0), d = me - op; return d >= 3 ? 'keep' : d <= -3 ? 'back' : 'tie'; };
  const isF5 = s => s.win && s.runs && s.runs.length && s.runs[s.runs.length - 1] >= 5 && s.gp && s.runs.reduce((x, v) => x + (v || 0), 0) >= s.gp;
  const f5Cache = {};
  function f5Table(lg) {
    if (f5Cache[lg]) return f5Cache[lg];
    const s = {}, a = {}, sn = {}, an = {}, sp = {}, ap = {};   // sn · an: 출전 세트 { n: 세트 수, w: 이긴 세트 수 }, sp · ap: 끝내기 장타 마지막 이닝 득점 합
    D.games.filter(g => !g.post).forEach(g => [g.t1, g.t2].forEach(c => persp(g, c).sets.forEach(x => {
      if (!x.players || !x.players.length) return;
      const k = x.players.slice().sort().join('|'), cnt = m => { const o = m[k] || (m[k] = { n: 0, w: 0 }); o.n++; if (x.win) o.w++; };
      cnt(an); if (g.league === lg) cnt(sn);
      if (!isF5(x)) return;
      const lp = x.runs[x.runs.length - 1];
      a[k] = (a[k] || 0) + 1; ap[k] = (ap[k] || 0) + lp; if (g.league === lg) { s[k] = (s[k] || 0) + 1; sp[k] = (sp[k] || 0) + lp; }
    })));
    const rk = (m, k) => { const me = m[k] || 0; if (!me) return ''; const dbl = k.includes('|'); return `${1 + Object.keys(m).filter(x => x.includes('|') === dbl && m[x] > me).length}위`; };
    // 비율 = 끝내기 장타 ÷ 이긴 세트, 에버 = 끝내기 장타 마지막 이닝 평균 득점
    //  순위는 같은 단식 / 복식끼리 출전 세트 시즌 5 · 통산 15 이상 (에버는 끝내기 장타 시즌 3 · 통산 5회 이상도)
    const RMIN = { s: 5, a: 15 }, EMIN = { s: 3, a: 5 }, NS = sc => sc === 's' ? sn : an, FS = sc => sc === 's' ? s : a, PS = sc => sc === 's' ? sp : ap;
    const rate = (sc, k) => { const o = NS(sc)[k]; return o && o.w ? (FS(sc)[k] || 0) / o.w : null; }, ever = (sc, k) => FS(sc)[k] ? PS(sc)[k] / FS(sc)[k] : null;
    const rkOf = (sc, k, fn, ok) => { const N = NS(sc), me = fn(sc, k), dbl = k.includes('|'); if (me == null || !ok(k)) return '';
      const vs = Object.keys(N).filter(x => x.includes('|') === dbl && ok(x) && fn(sc, x) != null).map(x => fn(sc, x)); return `${1 + vs.filter(v => v > me).length}위 <small>/ ${vs.length}</small>`; };
    // 같은 단식 / 복식 전체 평균: 비율 = 끝내기 합 ÷ 이긴 세트 합, 에버 = 득점 합 ÷ 끝내기 합
    const avgOf = (sc, dbl) => { const ks = Object.keys(NS(sc)).filter(x => x.includes('|') === dbl), W = sum(ks, x => NS(sc)[x].w), F = sum(ks, x => FS(sc)[x] || 0), P = sum(ks, x => PS(sc)[x] || 0); return { r: W ? F / W : null, e: F ? P / F : null }; };
    // 말풍선: 줄 = 횟수 · 비율 · 에버, 칸 = 이번 시즌 | 통산
    const tip = k => { const col = sc => { const N = NS(sc)[k] || { n: 0, w: 0 }, f = FS(sc)[k] || 0, P = PS(sc)[k] || 0, r = rate(sc, k), e = ever(sc, k), okN = x => (NS(sc)[x] || { n: 0 }).n >= RMIN[sc], A = avgOf(sc, k.includes('|'));
        const rR = rkOf(sc, k, rate, okN) || (N.n ? `<small>(${RMIN[sc]}세트 미만)</small>` : ''), eR = rkOf(sc, k, ever, x => okN(x) && (FS(sc)[x] || 0) >= EMIN[sc]) || (f ? `<small>(${okN(k) ? `${EMIN[sc]}회` : `${RMIN[sc]}세트`} 미만)</small>` : '');
        return [`<b>${f}회</b> ${rk(FS(sc), k)}`,
          `<b>${r == null ? '–' : pct(r)}</b> ${rR}<br><small>${f}/${N.w}${A.r != null ? ` · 평균 ${pct(A.r)}` : ''}</small>`,
          `<b>${e == null ? '–' : f3(e)}</b> ${eR}<br><small>${f ? `${P}점/${f}회 · ` : ''}${A.e != null ? `평균 ${f3(A.e)}` : ''}</small>`]; };
      const S = col('s'), T = col('a');
      return `<div class="rkh0">끝내기 장타 · ${esc(k.split('|').join(' · '))} <small>비율 = 끝내기 장타 ÷ 이긴 세트 · 에버 = 끝내기 이닝 평균 득점</small></div><table class="rdtip f5tip f5sum"><tbody><tr><td></td><td class="f5h">이번 시즌</td><td class="f5h">통산</td></tr>${['횟수', '비율', '에버'].map((l, i) => `<tr><td>${l}</td><td>${S[i]}</td><td>${T[i]}</td></tr>`).join('')}</tbody></table>`; };
    return (f5Cache[lg] = { s, a, rk, tip });
  }
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
          add((p.gm || (p.gm = {}))[g.id] || (p.gm[g.id] = { w: 0, n: 0 }), s.win);   // 그 경기(그날) 출전 세트 · 승
          if (s.no === 1 && s.first != null && s.players[0] === n) add(p.bk || (p.bk = { w: 0, n: 0 }), s.first);   // 뱅킹: 1세트 1번 선수가 뱅킹 주자, 이기면 1세트 선공
          add(p.byNo[s.no] || (p.byNo[s.no] = { w: 0, n: 0 }), s.win);
          add(p.byRound[g.round] || (p.byRound[g.round] = { w: 0, n: 0 }), s.win);
          add(p.byKind[s.kind] || (p.byKind[s.kind] = { w: 0, n: 0 }), s.win);
          add(p[sit], s.win);
          const bs = p.byNoSit || (p.byNoSit = {}); const bx = bs[s.no] || (bs[s.no] = { lead: { w: 0, n: 0 }, trail: { w: 0, n: 0 }, tie: { w: 0, n: 0 }, from23: { w: 0, n: 0 }, from32: { w: 0, n: 0 } }); add(bx[sit], s.win); if (via) add(bx[via], s.win);
          add(s.players.length >= 2 ? p.double : p.single, s.win);
          // 초구: 선공 세트 첫 이닝에 득점 (복식은 첫 샷 선수 기록이 없어 그 세트 선수 모두에게 팀 기록으로)
          if (s.first && s.runs && s.runs.length && s.players.length < 2) add((p.fbSt || (p.fbSt = {}))[`${a}:${b}`] || (p.fbSt[`${a}:${b}`] = { w: 0, n: 0 }), s.runs[0] > 0);   // 세트 스코어별 단식 초구
          if (s.first && s.runs && s.runs.length) add(s.players.length >= 2 ? (p.fbD || (p.fbD = { w: 0, n: 0 })) : (p.fbS || (p.fbS = { w: 0, n: 0 })), s.runs[0] > 0);
          if (s.players.length >= 2 && s.per) { const e = s.per.find(x => x && x.name === n); if (e && e.att) { const a = (p.atk || (p.atk = {}))[s.kind === '혼합복식' ? 'mix' : 'dbl'] || (p.atk[s.kind === '혼합복식' ? 'mix' : 'dbl'] = { succ: 0, att: 0 }); a.succ += e.succ; a.att += e.att; } }
          if (s.players.length < 2) { p.single.p += s.pts || 0; p.single.i += s.inn || 0; }
          // 선수 순위용. 단식은 이닝별 기록으로, 복식은 선수별 기록지로 (실패 = 이닝 수, 이겨서 끝낸 마지막 이닝은 실패 없음)
          const q = p.rk || (p.rk = { pts: 0, opp: 0, own: 0, succ: 0, att: 0, bank: 0, long: 0, cl: { w: 0, n: 0 } });
          q.pts += s.pts || 0; q.opp += s.opp || 0;
          const fl = setFlowT(s); if (fl && fl.cl) add(q.cl, s.win);
          if (s.players.length < 2) {
            // 요약 칸(p1 · p2)은 좌우가 뒤바뀐 시즌이 많아, 점수와 맞춰 둔 이닝별 기록으로 센다. 뱅크샷 수 = 득점 - 성공 수
            if (s.runs && s.hits) { const hit = sum(s.hits, v => v); q.succ += hit; q.att += hit + (s.inn || 0) - (s.win ? 1 : 0); q.bank += sum(s.runs, v => v) - hit; q.own += sum(s.runs, v => v); }
            if (s.runs) q.long += s.runs.filter(v => v >= 5).length;
          } else if (s.per) { const e = s.per.find(x => x && x.name === n); if (e) { q.succ += e.succ || 0; q.att += e.att || 0; q.bank += e.bank || 0; q.own += e.pts || 0; } }
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
      <span>에버 <b>${f3(o.avg)}</b> : <b>${f3(o.oavg)}</b></span><span class="unf">▾ 펼치기</span></summary>
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
    // 새 자료가 오면 옛 자료로 만든 계산은 모두 버린다 (남겨 두면 옛 기록이 보이고 옛 자료도 메모리에 계속 붙잡힌다)
    [standingsCache, leagueCalcCache, lgRoundCache, roundRankCache, f5Cache, hexCache, teamRankCache, tmCache, sheetTipCache].forEach(c => Object.keys(c).forEach(k => delete c[k]));
    careerCache = null;
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

  // 관전 포인트 강점 · 약점 후보: 세트 번호 5세트 이상 · 클러치 · 1세트 패 후 역전 · 3:2 마무리 · 남녀 승률 (all = 순위용, 리그 값 없이)
  function tCand(code, lg) {
    const o = tcalc(gamesOf(code, g => g.league === lg && !g.post)), L = leagueCalc(lg), X = hexLeague(lg), H = hexStats(code, lg), c = H.c, flow = o.state['0:1'], f32 = o.after32, Lf = L.state['0:1'], L32 = L.after32;
    const cand = Object.entries(o.byNo).filter(([, x]) => x.n >= 5).map(([k, x]) => ({ t: `${k}세트`, v: x.w / x.n, l: .5 }));
    if (c.all.n >= 5) cand.push({ t: '클러치', v: rt(c.all), l: rt(X.c.all) });
    if (flow && flow.n >= 3 && Lf) cand.push({ t: '1세트 패 후 역전', v: flow.w / flow.n, l: Lf.w / Lf.n });
    if (f32.n >= 3 && L32.n) cand.push({ t: '3:2 마무리', v: f32.win / f32.n, l: L32.win / L32.n });
    if (H.m.n >= 5) cand.push({ t: '남자 승률', v: rt(H.m), l: .5 }); if (H.w.n >= 5) cand.push({ t: '여자 승률', v: rt(H.w), l: .5 });
    return cand;
  }
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
      pts.push(`${kw(n)} ${bits.filter(Boolean).join(' · ')}`);
      // 강점 · 약점: 리그 평균보다 앞서거나 뒤지는 것. 순위 = 그 시즌 팀들 중 (같은 항목 값이 더 높은 팀 수 + 1)
      const cand = tCand(p.code, p.league), others = teamsIn(p.league).map(t => tCand(t, p.league));
      const rkOf = x => { const vs = others.map(l => (l.find(y => y.t === x.t) || {}).v).filter(v => v != null); return vs.length ? ` <span class="tprk">${vs.filter(v => v > x.v).length + 1}위</span>` : ''; };
      const one = x => `${x.t} <b>${pct(x.v)}</b>${rkOf(x)}${lg50(pct(x.l)) ? `<small> (리그 ${pct(x.l)})</small>` : ''}`;
      const good = cand.filter(x => x.v - x.l > .03).sort((a, b) => (b.v - b.l) - (a.v - a.l)).slice(0, 3);
      const bad = cand.filter(x => x.v - x.l < -.03).sort((a, b) => (a.v - a.l) - (b.v - b.l)).slice(0, 2);
      if (good.length) pts.push(`${kw(`${n} 강점`)} ${good.map(one).join(' · ')}`);
      if (bad.length) pts.push(`${kw(`${n} 약점`)} ${bad.map(one).join(' · ')}`);
      const pl = playerStats(reg).filter(x => x.n >= 6).sort((a, b) => b.w / b.n - a.w / a.n)[0];
      // 주목 선수 세트 승률 순위 = 그 시즌 모든 팀의 6세트 이상 선수 중
      const plRk = pl ? teamsIn(p.league).flatMap(t => playerStats(gamesOf(t, g => g.league === p.league && !g.post))).filter(x => x.n >= 6 && x.w / x.n > pl.w / pl.n).length + 1 : 0;
      if (pl) pts.push(`${kw(`${n} 주목`)} <b>${esc(pl.name)}</b> · 세트 ${pl.w}-${pl.n - pl.w} (${pct(pl.w / pl.n)} <span class="tprk">${plRk}위</span>)${pl.single.i ? ` · 단식 에버 ${f3(pl.single.p / pl.single.i)}` : ''}`);
    }
    return pts;
  }

  // ── 육각형 스탯: 시계 방향으로 승점 · 세트득실 · 팀 에버 · 남자 승률 · 여자 승률 · 클러치 (정규리그) ──
  const MEN = new Set(['남자단식', '남자복식']), WOMEN = new Set(['여자단식', '여자복식']);
  const rt = x => x && x.n ? x.w / x.n : null;
  // 클러치: 5~7세트. trail = 세트 스코어가 뒤진 채 시작한 세트(열세), lead = 앞선 채 시작한 세트(우세)
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
  // 득실 성향 (개인투어 styleBuild 공통): 정규리그 세트. 세트당 점수 기준 = 남자 세트 11점 · 여자 · 혼복 세트 9점 (사용자 지정). 자격 = 5경기 이상
  const styleCache = {};
  const styleSetsT = sets => sets.filter(s => s.inn && s.oinn).map(s => ({ p: s.pts || 0, o: s.opp || 0, gp: s.gp, base: /^남자/.test(s.kind) ? 11 : 9, w: !!s.win }));
  const styleTableT = lg => styleCache[lg || 'all'] || (styleCache[lg || 'all'] = styleBuild(D.games.filter(g => !g.post && (lg == null || g.league === lg)).flatMap(g => [g.t1, g.t2].map(c => ({ id: c, name: teamShort[c] || c, sets: styleSetsT(persp(g, c).sets) }))).filter(x => x.sets.length), 5, 11, '남 11 · 여 · 혼복 9점'));
  // 축 순서(시계 방향, 12시부터): 승점 · 여자 승률 · 팀 에버 · 클러치 · 세트 승률 · 남자 승률 (= 2시 여자, 4시 팀 에버, 6시 클러치, 8시 세트 승률, 10시 남자)
  function hexStats(code, lg) {
    const key = code + '|' + lg; if (hexCache[key]) return hexCache[key];
    const reg = gamesOf(code, g => (lg == null || g.league === lg) && !g.post), o = tcalc(reg), c = clutchOf(reg), m = kindWL(reg, MEN), w = kindWL(reg, WOMEN);
    return (hexCache[key] = { code, lg, o, c, m, w, v: [o.points != null ? o.pointRate : o.winRate, rt(w), o.avg, rt(c.all), o.setRate, rt(m)] });
  }
  // 리그: 평균값 + 팀별 값(축마다 순위 · 그림 범위)
  function hexLeague(lg) {
    const key = 'L|' + lg; if (hexCache[key]) return hexCache[key];
    const teams = (lg == null ? [...new Set(D.games.flatMap(g => [g.t1, g.t2]))] : teamsIn(lg)).map(c => hexStats(c, lg)).filter(t => t.o.games);
    const L = leagueCalc(lg), c = clutchOf(D.games.filter(g => (lg == null || g.league === lg) && !g.post).flatMap(g => [persp(g, g.t1), persp(g, g.t2)]));
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
      // 두 팀 비교 꼭짓점: 윗줄 게임 클러치(5~7세트, = 육각형) · 아랫줄 세트 클러치
      split: [['게임', t => pct(rt(t.c.all)), X => pct(rt(X.c.all))], ['세트', t => pct(t.o.setClutch), X => pct(X.L.setClutch)]],
      rows: [['5~7세트', t => wlS(t.c.all), X => pct(rt(X.c.all))], ['&nbsp;&nbsp;우세 스코어', t => wlS(t.c.lead), X => pct(rt(X.c.lead))], ['&nbsp;&nbsp;열세 스코어', t => wlS(t.c.trail), X => pct(rt(X.c.trail))],
        ['&nbsp;&nbsp;동점', t => wlS(t.c.tie), X => pct(rt(X.c.tie))], ['&nbsp;&nbsp;7세트', t => wlS(t.c.s7), () => '50%']], note: '5·6·7세트 승률. 우세 스코어 = 3:1 · 3:2에서 시작한 세트, 열세 스코어 = 1:3 · 2:3에서 시작한 세트, 동점 = 2:2 · 3:3에서 시작한 세트.' },
    { n: '세트 승률', main: t => pct(t.o.setRate), lgMain: () => '50%',
      rows: [['세트 승률', t => pct(t.o.setRate), () => '50%'], ['세트', t => `${t.o.setW}-${t.o.setL}`, () => ''], ['세트득실률', t => f3(t.o.setRatio), X => f3(X.L.setRatio)]], note: '딴 세트 ÷ 치른 세트.' },
    { n: '남자 승률', main: t => pct(rt(t.m)), lgMain: () => '50%',
      rows: [['남자 세트', t => wlS(t.m), () => '50%'], ['남자단식', t => wlS(t.m.k['남자단식']), () => '50%'], ['남자복식', t => wlS(t.m.k['남자복식']), () => '50%']], note: '남자단식 + 남자복식 세트 승률 (혼복 제외).' },
  ];
  const hexHtml = (list, Xs, pool = '그 시즌 팀들') => hexChart(HEX, list, Xs, pool, { ranks: true });   // 항목 이름 양옆 = 두 팀의 그 항목 순위

  // ── 팀 세 기간 (개인투어 방송 요약의 이번 대회·시즌·통산과 같은 틀): 이번 라운드 · 이번 시즌(정규) · 통산(정규) ──
  // 상단 팀 순위 · 항목별: 팀마다 정규리그 기록 (lg = 그 시즌, null = 통산). 장타 · 공격 성공 · 뱅크샷은 팀 이닝 기록(runs · hits)으로, 클러치는 setFlowT
  //  regW = 정규리그 1위 시즌 수, finW = 포스트시즌 우승 시즌 수 (진행 중인 시즌은 빼고 센다)
  const teamRankCache = {};
  function teamRankStats(lg) {
    const key = lg || 'all'; if (teamRankCache[key]) return teamRankCache[key];
    const cur = D.leagues.slice().sort((a, b) => b.season - a.season)[0].league;
    const codes = lg ? teamsIn(lg) : [...new Set(D.games.filter(g => !g.post).flatMap(g => [g.t1, g.t2]))];
    const out = codes.map(code => {
      const gs = gamesOf(code, g => !g.post && (!lg || g.league === lg)); if (!gs.length) return null;
      const o = tcalc(gs), x = { code, o, inn: 0, long: 0, scr: 0, succ: 0, att: 0, runs: 0, bank: 0, cl: { w: 0, n: 0 } };
      gs.forEach(g => g.sets.forEach(s => {
        if (s.runs && s.hits) { x.inn += s.runs.length; x.long += s.runs.filter(v => v >= 5).length; x.scr += s.runs.filter(v => v > 0).length; { const hit = sum(s.hits, v => v); x.succ += hit; x.att += hit + s.runs.length - (s.win ? 1 : 0); } const r = sum(s.runs, v => v); x.runs += r; x.bank += r - sum(s.hits, v => v); }
        const f = setFlowT(s); if (f && f.cl) { x.cl.n++; if (s.win) x.cl.w++; }
      }));
      const ls = (lg ? [lg] : seasonsOfTeam[code] || []).filter(l => l !== cur);
      x.regS = ls.filter(l => (standings(l).find(r => r.code === code) || {}).rank === 1); x.finS = ls.filter(l => postResult(code, l) === '우승');
      return x;
    }).filter(Boolean);
    return (teamRankCache[key] = out);
  }
  // 기록지 팀 기록 칩 순위: 세트득실 · 팀 에버 · 점수득실 · 남자/여자 승률 · 흰공/노란공 경기 승률. s = 그 시즌 리그 팀끼리, a = 통산(정규리그 치른 모든 팀)
  const tmCache = {};
  function teamMetricRanks(lg) {
    if (tmCache[lg]) return tmCache[lg];
    const rate = x => x && x.n ? x.w / x.n : null;
    const calcM = gs => { if (!gs.length) return null; const o = tcalc(gs), ball = f => { const x = gs.filter(g => { const s1 = g.sets.find(y => y.no === 1); return s1 && s1.first === f; }); return { n: x.length, w: x.filter(g => g.win).length }; };
      return { setRatio: o.setRatio, avg: o.avg, ptRatio: o.ptRatio, men: rate(kindWL(gs, MEN)), women: rate(kindWL(gs, WOMEN)), white: rate(ball(true)), yellow: rate(ball(false)) }; };
    const allCodes = [...new Set(D.games.filter(g => !g.post).flatMap(g => [g.t1, g.t2]))];
    const mk = (codes, f) => { const m = {}; codes.forEach(c => { const x = calcM(gamesOf(c, f)); if (x) m[c] = x; });
      return { v: (c, k) => m[c] ? m[c][k] : null, rank: (c, k) => { const me = m[c] && m[c][k]; return me == null ? null : 1 + Object.values(m).filter(x => x[k] != null && x[k] > me).length; } }; };
    return (tmCache[lg] = { s: mk(teamsIn(lg), g => g.league === lg && !g.post), a: mk(allCodes, g => !g.post) });
  }
  function periods(code, lg) {
    const reg = gamesOf(code, g => g.league === lg && !g.post);
    const r = reg.length ? reg[reg.length - 1].round : null;
    return { code, lg, rname: r, reg, round: tcalc(reg.filter(g => g.round === r)), season: tcalc(reg), all: tcalc(gamesOf(code, g => !g.post)) };
  }
  // 세 기간 비교 표: 라운드 | 시즌 | 통산 | 항목 | 통산 | 시즌 | 라운드 (같은 기간끼리 더 좋은 쪽 강조)
  //  rows: [항목, (그 기간 기록 o, 기간 키, 팀 묶음 P) → { v: 비교값, t: 보이는 값, s: 작은 글씨 } | null, 'high'|'low'|'none'] · '#' 로 시작하면 소제목
  //  bc(방송 요약): 통산 | 시즌 | 라운드 | 항목 | 라운드 | 시즌 | 통산 (가운데에 가까울수록 최근), 두 팀 모두 라운드 기록이 있을 때만 라운드 칸을 넣고 통산 · 시즌 열은 테두리
  function tri3(an, bn, PA, PB, sl, rows, cls = 'bc3', mid = '', bc = false) {
    const hasR = !bc || !!(PA.round && PA.round.games && PB.round && PB.round.games);
    const PK = bc ? (hasR ? ['all', 'season', 'round'] : ['all', 'season']) : ['round', 'season', 'all'], nc = PK.length;
    const C = { round: 'pt', season: bc ? 'ps cbc' : 'ps', all: bc ? 'pa cbt' : 'pa' };
    const ph = (k, P) => k === 'round' ? `<th class="pt">이번 라운드<small>${esc(P.rname || '')}</small></th>` : k === 'season' ? `<th class="${C.season}">${esc(sl)} 시즌</th>` : `<th class="${C.all}">통산</th>`;
    const head = `<thead><tr><th colspan="${nc}" class="nm a">${esc(an)}</th><th></th><th colspan="${nc}" class="nm b">${esc(bn)}</th></tr>
      <tr>${PK.map(k => ph(k, PA)).join('')}<th></th>${PK.slice().reverse().map(k => ph(k, PB)).join('')}</tr></thead>`;
    const body = rows.map(([label, get, better = 'high']) => {
      if (label.startsWith('#')) return `<tr class="grp"><th colspan="${nc * 2 + 1}">${label.slice(1)}</th></tr>`;
      const td = (P, Q, k) => {
        const x = get(P[k], k, P), y = get(Q[k], k, Q);
        const ok = better !== 'none' && x && y && x.v != null && y.v != null && !isNaN(x.v) && !isNaN(y.v) && x.v !== y.v;
        const win = ok && (better === 'high' ? x.v > y.v : x.v < y.v);
        return `<td class="${C[k]}${win ? ' win' : ''}">${(x && x.t) || '–'}${x && x.s ? `<small>${x.s}</small>` : ''}</td>`;
      };
      return `<tr>${PK.map(k => td(PA, PB, k)).join('')}<th${mid ? ` class="${mid}"` : ''}>${label}</th>${PK.slice().reverse().map(k => td(PB, PA, k)).join('')}</tr>`;
    }).join('');
    return `<div class="tw"><table class="${cls}${bc ? ' colmk' : ''}">${bc3Cols(nc)}${head}<tbody>${body}</tbody></table></div>`;
  }
  // 값 하나를 { v, t, s } 로 (기록이 없으면 null)
  const g3 = (f, fmt = pct, sub) => o => { if (!o || !o.games) return null; const v = f(o); return v == null || isNaN(v) ? null : { v, t: fmt(v), s: sub ? sub(o) : '' }; };
  const rank3 = (o, k, P) => { const r = k === 'round' ? roundRanks(P.lg, P.rname)[P.code] : k === 'season' ? (standings(P.lg).find(x => x.code === P.code) || {}).rank : null; return r ? { v: -r, t: rkH(r) } : null; };
  const mainKindOf = o => n => { const x = o.byNo[n]; return x ? Object.entries(x.kinds).sort((a, b) => b[1] - a[1])[0][0] : ''; };
  const KINDS5 = ['남자복식', '여자복식', '혼합복식', '남자단식', '여자단식'];
  const FLOW = ['1:0', '0:1', '2:0', '1:1', '0:2', '2:1', '1:2', '2:2', '3:2', '2:3', '3:3'];

  // 방송 요약 승률 칸: 숫자 · 선형 · 막대 전환. 색 = 팀, 선 모양 · 진하기 = 기간 (통산 · 이번 시즌 · 이번 라운드)
  const chartModes = (() => { try { return JSON.parse(localStorage.getItem('pba_tbc_chart')) || {}; } catch (e) { return {}; } })();
  const chartTips = {};
  const CH_PER = [{ k: 'all', l: '통산', s: '통산', o: .5, dash: '7 4', w: 2 }, { k: 'season', l: '이번 시즌', s: '시즌', o: 1, dash: '', w: 2.5 }];
  const chartSeg = (key, mode) => `<span class="bcseg">${[['num', '숫자'], ['line', '선형'], ['bar', '막대']].map(([m, l]) => `<button data-cm="${key}|${m}" class="${mode === m ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  function winChart(key, mode, rows, teams) {
    const off = chartModes[key + '_off'] || {}, PER = CH_PER.filter(p => !off[p.k]);
    const val = (P, per, r) => { const x = r[1](P[per]); return x && x.v != null ? x : null; };
    // 세로축: 보이는 값의 최저~최고 (5 · 10 · 25% 눈금에 맞춤). 막대는 최저값도 보이게 한 눈금 더
    const vs = rows.flatMap(r => teams.flatMap(t => PER.map(p => val(t.P, p.k, r)))).filter(Boolean).map(x => x.v);
    let lo = vs.length ? Math.min(...vs) : 0, hi = vs.length ? Math.max(...vs) : 1;
    const step = hi - lo <= .3 ? .05 : hi - lo <= .6 ? .1 : .25;
    lo = Math.floor(lo / step + 1e-9) * step; hi = Math.ceil(hi / step - 1e-9) * step;
    if (mode === 'bar' || lo === hi) lo = Math.max(0, lo - step); if (lo === hi) hi = Math.min(1, hi + step);
    const W = 600, ph = 210, L = 38, R = 8, T = 10, n = rows.length, gw = (W - L - R) / n, gapY = T + ph + 44, H = gapY + PER.length * 16;
    const y = v => T + ph * (1 - (v - lo) / (hi - lo)), cx = i => L + gw * (i + .5);
    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" opacity=".7"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--sub)">${Math.round(v * 100)}%</text>`;
    if (mode === 'bar') {
      const bw = Math.min(16, (gw - 12) / (PER.length * 2) - 1);
      rows.forEach((r, i) => teams.forEach((t, ti) => PER.forEach((p, pi) => {
        const x = val(t.P, p.k, r); if (!x) return;
        const bx = cx(i) + (ti ? 2 : -2 - PER.length * (bw + 1)) + pi * (bw + 1), by = y(x.v);
        g += `<rect x="${bx}" y="${by}" width="${bw}" height="${Math.max(1, y(lo) - by)}" rx="2" fill="${t.color}" fill-opacity="${p.o}"/>`;
      })));
    } else teams.forEach(t => PER.forEach(p => {
      const pts = rows.map((r, i) => { const x = val(t.P, p.k, r); return x ? [cx(i), y(x.v)] : null; });
      let d = '', pen = false; pts.forEach(q => { if (!q) { pen = false; return; } d += `${pen ? 'L' : 'M'}${q[0]} ${q[1]} `; pen = true; });
      g += `<path d="${d}" fill="none" stroke="${t.color}" stroke-width="${p.w}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${p.o}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}/>`;
      pts.forEach(q => { if (q) g += `<circle cx="${q[0]}" cy="${q[1]}" r="${p.k === 'season' ? 4 : 3}" fill="${p.k === 'all' ? 'var(--panel)' : t.color}" stroke="${t.color}" stroke-width="1.5" stroke-opacity="${p.o}"/>`; });
    }));
    // 선형: 점마다 숫자. 점 오른쪽에 쓰고, 같은 세로줄에서 겹치면 위아래로 민다
    if (mode === 'line') rows.forEach((r, i) => {
      const ls = teams.flatMap(t => PER.map(p => { const x = val(t.P, p.k, r); return x ? { y: y(x.v) + 3.5, t: x.t, c: t.color, o: p.k === 'all' ? .8 : 1, b: p.k === 'all' ? 500 : 800 } : null; })).filter(Boolean).sort((a, b) => a.y - b.y);
      ls.forEach((l, k) => { if (k && l.y - ls[k - 1].y < 11) l.y = ls[k - 1].y + 11; });
      const over = ls.length ? ls[ls.length - 1].y - (T + ph + 3) : 0; if (over > 0) { ls[ls.length - 1].y -= over; for (let k = ls.length - 2; k >= 0; k--) if (ls[k + 1].y - ls[k].y < 11) ls[k].y = ls[k + 1].y - 11; }
      ls.forEach(l => { g += `<text x="${cx(i) + 7}" y="${l.y}" font-size="10" font-weight="${l.b}" fill="${l.c}" fill-opacity="${l.o}" stroke="var(--panel)" stroke-width="3" paint-order="stroke">${l.t}</text>`; });
    });
    // 같은 지점 양 팀 차이 (%p): 점 색 = 앞선 팀
    const gapOf = (r, p) => { const a = val(teams[0].P, p.k, r), b = val(teams[1].P, p.k, r); return a && b ? { d: Math.abs(a.v - b.v) * 100, lead: a.v > b.v ? teams[0] : b.v > a.v ? teams[1] : null } : null; };
    PER.forEach((p, pi) => { g += `<text x="${L - 6}" y="${gapY + pi * 16}" text-anchor="end" font-size="10" fill="var(--sub)">${p.s}</text>`; });
    const tips = chartTips[key] = [];
    rows.forEach((r, i) => {
      const [a, b] = r[0].split('<small>');
      g += `<text x="${cx(i)}" y="${T + ph + 16}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${a}</text>${b ? `<text x="${cx(i)}" y="${T + ph + 30}" text-anchor="middle" font-size="10" fill="var(--sub)">${b.replace('</small>', '')}</text>` : ''}`;
      PER.forEach((p, pi) => { const x = gapOf(r, p); if (!x) return; g += `${x.lead ? `<circle cx="${cx(i) - 17}" cy="${gapY + pi * 16 - 4}" r="4" fill="${x.lead.color}"/>` : ''}<text x="${cx(i) - 10}" y="${gapY + pi * 16}" font-size="11" font-weight="700" fill="var(--ink)">${x.d.toFixed(1)}</text>`; });
      g += `<rect class="chit" data-cg="${key}|${i}" x="${L + gw * i}" y="${T}" width="${gw}" height="${H - T}" fill="transparent"/>`;
      tips.push(`<div class="rkh0">${r[0].replace(/<small>/, ' <small>')}</div><table>${teams.map(t => `<tr><td colspan="3"><b>${esc(t.name)}</b></td></tr>${PER.map(p => { const x = val(t.P, p.k, r); return `<tr><td>${p.l}</td><td></td><td>${x ? `${x.t}${x.s ? ` <small>${x.s.replace('<br>', ' · ')}</small>` : ''}` : '–'}</td></tr>`; }).join('')}`).join('')}<tr><td colspan="3"><b>양 팀 차이</b></td></tr>${PER.map(p => { const x = gapOf(r, p); return `<tr><td>${p.l}</td><td></td><td>${x ? (x.lead ? `${esc(x.lead.name)} +${x.d.toFixed(1)}%p` : '동률') : '–'}</td></tr>`; }).join('')}</table>`);
    });
    const sw = p => `<svg width="26" height="10" aria-hidden="true">${mode === 'bar' ? `<rect x="3" y="0" width="20" height="10" rx="2" fill="currentColor" fill-opacity="${p.o}"/>` : `<line x1="1" x2="25" y1="5" y2="5" stroke="currentColor" stroke-width="${p.w}" stroke-linecap="round" stroke-opacity="${p.o}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}/>`}</svg>`;
    const legend = `<div class="bclegend">${teams.map(t => `<span><i style="background:${t.color}"></i>${esc(t.name)}</span>`).join('')}<span class="bcpers">${CH_PER.map(p => `<button data-cp="${key}|${p.k}" class="${off[p.k] ? '' : 'on'}" aria-pressed="${!off[p.k]}">${sw(p)}${p.l}</button>`).join('')}</span></div>`;
    return `${legend}<svg class="bcchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="승률 그래프. 숫자 보기로 표를 볼 수 있습니다">${g}</svg><div class="bcgapnote">아래 숫자: 같은 지점 양 팀 차이(%p), 점 색 = 앞선 팀</div>`;
  }
  function renderTeamBroadcast() {
    const el = $('#tbc'), A = panes.a, B = panes.b;
    if (!A || !B || !A.code || !B.code) { el.innerHTML = '<div class="empty">왼쪽·오른쪽에 팀을 먼저 고르세요.</div>'; return; }
    const an = teamShort[A.code], bn = teamShort[B.code];
    const PA = periods(A.code, A.league), PB = periods(B.code, B.league);
    const sl = seasonLabel(leagueOf[A.league].season) + (A.league !== B.league ? ` / ${seasonLabel(leagueOf[B.league].season)}` : '');
    const h2h = gamesOf(A.code, g => g.t1 === B.code || g.t2 === B.code);
    // ② 이후는 처음엔 접혀 제목(키워드)만 보이고, 누르면 펼침
    const sec = (n, title, body, sub = '') => `<section class="bcsec"${n > 1 ? ' data-fdef' : ''}><h3><span class="n">${n}</span>${title}${BCCAP}${sub ? `<small>${sub}</small>` : ''}</h3>${body}</section>`;
    const stA = standings(A.league).find(r => r.code === A.code), stB = standings(B.league).find(r => r.code === B.code);
    const logo = (p, st) => { const u = (st && st.logo) || teamLogo[p.code]; return u ? `<img class="logo" src="${esc(u)}">` : ''; };
    const T = rows => tri3(an, bn, PA, PB, sl, rows, 'bc3', '', true);
    let h = `<div class="bctop">${bcTopLeft('← 팀 비교 화면', 'tbcback')}<span class="bcx"><button class="bccap" data-bccap="all" title="지금 보이는 방송 요약을 그림으로 (클립보드 + 캡쳐 폴더) · 칸마다 📷 = 그 칸만 · ⌘C = 커서 아래 항목">📷 캡쳐</button><button data-export="text">공유</button><button data-export="share">PDF로 공유하기</button><button data-export="pdf">PDF로 만들기</button></span></div>
      <div class="bchead"><div class="bp a">${logo(A, stA)}<b>${esc(an)}</b></div><div class="bvs">VS</div><div class="bp b"><b>${esc(bn)}</b>${logo(B, stB)}</div></div><!--RCPBTN-->`;
    const R = {};   // 섹션별 표 줄 (방송 요약 레시피 항목으로도 쓴다)

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
    // 육각형 (정규리그): 비교 대상 키워드 (hexPick) — A 이번 시즌-통산 · B 이번 시즌-통산 · 두 팀 통산 · 두 팀 이번 시즌. 모두 리그 평균 포함
    const XA = hexLeague(A.league), XB = hexLeague(B.league), Xall = hexLeague(null);
    const self = (c, n, col, X) => hexChart(HEX, [{ t: hexStats(c, X.lg), name: n, color: col, tag: '이번 시즌' }, { t: hexStats(c, null), name: n, color: col, tag: '통산', dash: true }], [X, Xall], '그 시즌 · 역대 팀들', { ranks: true, overlay: true });
    const hexBox = hexPick('tbc', [{ k: 'a', t: `${esc(an)} 이번 시즌-통산`, html: self(A.code, an, cA, XA) }, { k: 'b', t: `${esc(bn)} 이번 시즌-통산`, html: self(B.code, bn, cB, XB) },
      { k: 'all', t: '두 팀 통산', html: hexHtml([{ t: hexStats(A.code, null), name: an, color: cA }, { t: hexStats(B.code, null), name: bn, color: cB }], [Xall], '역대 팀들') },
      { k: 'season', t: '두 팀 이번 시즌', html: hexHtml([{ t: hexStats(A.code, A.league), name: an, color: cA }, { t: hexStats(B.code, B.league), name: bn, color: cB }], A.league === B.league ? [XA] : [XA, XB]) }], 'season');
    // 득실 성향 (주요 특징 '득실성향' 키워드, 처음엔 접힘): 각자 이번 시즌 · 통산 정규리그 + 상대전적(맞대결 세트만, 포스트시즌 포함) 이번 시즌 · 통산
    //  이번 시즌 = 두 팀 시즌이 다르면 A 팀 시즌. 상대전적 기준선 = 같은 기간 각자 정규리그 평소
    const stMarks = [{ id: A.code, name: an, color: cA }, { id: B.code, name: bn, color: cB }];
    const kwLg = A.league, kwSl = `${seasonLabel(leagueOf[kwLg].season)} 시즌`, sSS = styleTableT(kwLg), aSS = styleTableT(null);
    const h2hSS = (gs, base) => { const hs = styleSetsT(gs.flatMap(g => g.sets)); return hs.length ? styleH2H(hs, gs.length, base, { id: A.code, name: an }, { id: B.code, name: bn }) : null; };
    const stBox = styleQuad([{ t: kwSl, SS: sSS }, { t: '통산', SS: aSS }, { t: kwSl, SS: h2hSS(h2h.filter(g => g.league === kwLg), sSS), h2h: true }, { t: '통산', SS: h2hSS(h2h, aSS), h2h: true }], stMarks);
    // ① 주요 특징: 관전포인트 | 상대전적 (반반) → 육각형 (이번 시즌 | 통산) → 득실성향 → 승부예측 (#tpred 는 fillTeamPredict 가 채움)
    h += sec(1, '주요 특징', `<div class="bcfeat"><div class="bcfeat2">${bcKw('tbc', '관전포인트', bcPtsHtml(tTalking(A, B, h2h), [an, bn]))}${bcKw('tbc', '상대전적', hh, `${esc(an)} 기준`)}</div>
      ${bcKw('tbc', '육각형', hexBox, `${esc(sl)} 시즌 · 통산 정규리그`)}
      ${bcKw('tbc', '득실성향', stBox, '', true)}${bcKw('tbc', '승부예측', '<div id="tpred"></div>')}</div>`);

    // ② 레시피(고른 항목만) → ③ 기본 기록 | ④ 주요 선수 (좌우 2분할)
    const psA = postResult(A.code, A.league), psB = postResult(B.code, B.league);
    h += '<!--RCP-->';
    h += '<div class="bc2col">' + sec(3, '기본 기록', T(R.basic = [
      ['순위', rank3],
      ['승-패', o => o && o.games ? { t: o.wl, s: pct(o.winRate) } : null, 'none'],
      ['승점<small>승점률</small>', g3(o => o.points, v => String(v), o => o.maxPoints ? `승점률 ${pct(o.pointRate)}` : '')],
      ['세트 승률', g3(o => o.setRate, pct, o => `${o.setW}-${o.setL}`)],
      ['세트득실률', g3(o => o.setRatio, f3)],
      ['점수득실률', g3(o => o.ptRatio, f3, o => `${o.pts}:${o.opp}`)],
      ['팀 에버', g3(o => o.avg, f3)],
      ['상대 에버<small>낮을수록 좋음</small>', g3(o => o.oavg, f3), 'low'],
      ['초구 성공률', g3(o => o.fbSuccess, pct, o => `${o.fbN}회`)],
      ['뱅킹 승률<small>1세트 선공</small>', g3(o => o.bankRate, pct, o => `${o.bankW}-${o.bankL}`)],
      ['선공 세트 승률', g3(o => o.firstSet)], ['후공 세트 승률', g3(o => o.secondSet)],
    ]) + (psA || psB ? `<div class="note">포스트시즌: ${esc(an)} ${esc(psA || '–')} · ${esc(bn)} ${esc(psB || '–')}</div>` : ''));
    // 주요 선수 (이번 시즌, 세트 많이 나간 순)
    // 값 윗줄, 승패 · 통산 대비(이번 시즌 - 통산) 아랫줄. 승률 · 성공률 차이는 %p, 에버는 그대로
    const CP = careerPlayers();
    const diffH = (now, all, digits) => { if (now == null || all == null) return ''; const d = +(now - all).toFixed(digits); return `<span class="${d > 0 ? 'dup' : d < 0 ? 'ddn' : 'deq'}">${d > 0 ? '+' : ''}${d.toFixed(digits)}</span>`; };
    const wlCell = (x, y) => { if (!x || !x.n) return '<td></td>'; const r = x.w / x.n; return `<td><b>${pct(r)}</b><small class="l2">${x.w}-${x.n - x.w}${y && y.n ? ` ${diffH(r * 100, y.w / y.n * 100, 1)}` : ''}</small></td>`; };
    // 주요 선수 순서 = 팀리그 메인 화면 명단과 같게 (캡틴 → 남자 → 여자, 홈피 소개 순서). 이번 시즌 나온 선수만
    const rosterSort = P => { const st = Object.fromEntries(playerStats(P.reg).map(x => [x.name, x])), r = rosterOf(P.code, P.lg, P.reg).filter(p => st[p.name]);
      return [...r.filter(p => p.captain), ...r.filter(p => !p.captain && p.gender !== 'F'), ...r.filter(p => !p.captain && p.gender === 'F')].map(p => st[p.name]); };
    // 이번 라운드 = 그 팀이 가장 최근에 경기한 라운드 (P.rname), 그 라운드 세트만 센 승률
    const ptbl = (list, P) => { const RS = Object.fromEntries(playerStats(P.reg.filter(g => g.round === P.rname)).map(x => [x.name, x])); return `<table><thead><tr><th>선수</th><th>승률</th><th>라운드${P.rname ? `<br><small>${esc(P.rname)}</small>` : ''}</th><th>단식</th><th>복식</th><th>단식 에버</th><th>장타율</th><th>뱅크샷<br>득점비율</th><th>초구</th></tr></thead><tbody>${list.map(p => { const c = CP[p.name] || {}, ev = o => o && o.single && o.single.i ? o.single.p / o.single.i : null,
        lg = o => o && o.rk && o.single.i ? o.rk.long / o.single.i : null, bk = o => o && o.rk && o.rk.own ? o.rk.bank * 2 / o.rk.own : null,
        rateCell = (v, y, sub) => v == null ? '<td></td>' : `<td><b>${pct(v)}</b><small class="l2">${sub}${y != null ? ` ${diffH(v * 100, y * 100, 1)}` : ''}</small></td>`;
      return `<tr><td><b>${esc(p.name)}</b></td>${wlCell(p, c)}${wlCell(RS[p.name])}${wlCell(p.single, c.single)}${wlCell(p.double, c.double)}<td>${ev(p) != null ? `<b>${f3(ev(p))}</b><small class="l2">${diffH(ev(p), ev(c), 3)}</small>` : ''}</td>${rateCell(lg(p), lg(c), `${p.rk.long}회`)}${rateCell(bk(p), bk(c), `${p.rk.bank * 2}점`)}${wlCell(p.fbS, c.fbS)}</tr>`; }).join('')}</tbody></table><div class="note">라운드 = 그 팀이 가장 최근에 경기한 라운드의 세트 승률. 작은 숫자: 이번 시즌 − 통산 (승률 · 장타율 · 뱅크샷 · 초구는 %p, 에버는 점수). 장타율 = 단식 이닝 중 5점 이상 이닝, 뱅크샷 득점비율 = 단식 · 복식 본인 득점 중 뱅크샷 득점</div>` };
    h += sec(4, '주요 선수', `<div class="bcplayers"><div><h4>${esc(an)}</h4>${ptbl(rosterSort(PA), PA)}</div><div><h4>${esc(bn)}</h4>${ptbl(rosterSort(PB), PB)}</div></div>`, `${esc(sl)} 시즌`) + '</div>';

    // ⑤ 세트별 승률 | ⑥ 종목별 승률 (좌우 2분할)
    const kA = mainKindOf(PA.all);
    const chTeams = [{ P: PA, name: an, color: cA }, { P: PB, name: bn, color: cB }];
    const chartSec = (no, key, title, rows) => { const mode = chartModes[key] || 'num'; return sec(no, title, mode === 'num' ? T(rows) : winChart(key, mode, rows, chTeams), chartSeg(key, mode)); };
    h += '<div class="bc2col">' + chartSec(5, 'setno', '세트별 승률', R.setno = [1, 2, 3, 4, 5, 6, 7].filter(n => PA.all.byNo[n] || PB.all.byNo[n]).map(n =>
      [`${n}세트<small>${esc(kA(n))}</small>`, o => { const x = o && o.byNo && o.byNo[n]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: wlOf(x) } : null; }]));

    // ⑥ 종목별 승률
    h += chartSec(6, 'kind', '종목별 승률', R.kind = KINDS5.filter(k => PA.all.byKind[k] || PB.all.byKind[k]).map(k =>
      [k, o => { const x = o && o.byKind && o.byKind[k]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: `${wlOf(x)}${x.i ? `<br>에버 ${f3(x.p / x.i)}` : ''}` } : null; }])) + '</div>';

    // ⑦ 세트 흐름: 그 스코어가 된 경기 중 이긴 비율
    const st = k => o => { const x = o && o.state && o.state[k]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: `${x.w}/${x.n}` } : null; };
    h += sec(7, '세트 흐름', T(R.flow = FLOW.map(k => [`${k} → 승`, st(k)]).concat([
      ['3:2 → 경기 승', o => o && o.after32 && o.after32.n ? { v: o.after32.win / o.after32.n, t: pct(o.after32.win / o.after32.n), s: `${o.after32.win}/${o.after32.n}` } : null],
      ['2:3 → 6세트 승', o => o && o.after23 && o.after23.n ? { v: o.after23.w6 / o.after23.n, t: pct(o.after23.w6 / o.after23.n), s: `${o.after23.w6}/${o.after23.n}` } : null],
      ['2:3 → 경기 승', o => o && o.after23 && o.after23.n ? { v: o.after23.win / o.after23.n, t: pct(o.after23.win / o.after23.n), s: `${o.after23.win}/${o.after23.n}` } : null],
    ])));


    h += `<div class="note" style="text-align:center;padding:16px">이번 라운드 = 그 팀이 가장 최근에 경기한 라운드 · 정규리그 기준 (상대 전적은 포스트시즌 포함) · 같은 기간끼리 더 좋은 쪽이 강조됩니다.</div>`;
    RCP.tbc = { groups: rcpNorm([['기본 기록', R.basic], ['세트별 승률', R.setno], ['종목별 승률', R.kind], ['세트 흐름', R.flow]]), table: rows => T(rows) };
    h = h.replace('<!--RCPBTN-->', rcpPanel('tbc')).replace('<!--RCP-->', rcpSection('tbc'));
    el.innerHTML = h;
    if (typeof fitBc3 === 'function') { bc3Bottoms(el); fitBc3(el); }
    applyFolds(el);
    fillTeamPredict(A.code, B.code, an, bn, cA, cB);
  }
  // 승부 예측 (육각형 아래): 발표된 오더가 이 두 팀 경기면 그 선수로, 아니면 이번 시즌 세트 번호별 출전 비율로 (predict.js)
  async function fillTeamPredict(c0, c1, an, bn, cA, cB) {
    const box = () => $('#tpred'); if (!box() || !window.Predict) return;
    await Predict.loadInd();
    let lineup = [];
    try { const o = await api(`/api/team/order?teams=${c0},${c1}`); if (o && o.sets && o.sets.length && [o.t1, o.t2].sort().join() === [c0, c1].sort().join()) lineup = o.t1 === c0 ? o.sets : o.sets.map(s => ({ ...s, p: [s.p[1], s.p[0]] })); } catch (e) { /* 오더 없음 */ }
    if (!box()) return;
    const M = Predict.teamModel(D, canonName), r = Predict.teamPredict(M, c0, c1, lineup), known = r.sets.filter(s => s.known).length;
    const nm = ps => (ps || []).map(x => esc(canonName(x))).join('·');
    const kd = k => esc(String(k || '').replace('남자', '남').replace('여자', '여').replace('혼합', '혼').replace('복식', '복').replace('단식', '단'));
    // 세트별 라인업: 왼쪽 선수 · 승률 | 세트 | 승률 · 오른쪽 선수 (좌우 대칭 고정 폭 → 가운데 세트 칸이 늘 가운데)
    const rows = `<table class="pdrows"><colgroup><col style="width:31%"><col style="width:12%"><col style="width:14%"><col style="width:12%"><col style="width:31%"></colgroup>${r.sets.map(s => `<tr class="${s.known ? '' : 'guess'}"><td class="pa">${nm(s.pa)}</td><td class="pv ${s.p >= 0.5 ? 'w' : 'l'}">${Predict.pc(s.p)}</td><td class="n">${s.no}세트 <small>${kd(s.kind)}</small></td><td class="pv ${s.p < 0.5 ? 'w' : 'l'}">${Predict.pc(1 - s.p)}</td><td class="pb">${nm(s.pb)}</td></tr>`).join('')}</table>`;
    box().innerHTML = Predict.boxHtml({ kind: 'team', an, bn, ca: cA, cb: cB, win: r.m.win, scores: r.m.scores, need: 4, sub: known ? `발표된 오더 ${known}세트` : '오더 발표 전',
      rows, foot: known === 7 ? '' : `흐린 글씨 = 오더 발표 전이라 이번 시즌 그 세트 번호에 가장 많이 나온 선수 (계산은 출전 비율 상위 3명을 섞음)` });
  }

  function setTeamBroadcast(on) {
    closePop();
    document.body.classList.toggle('tbcmode', on);
    $('#tbc').hidden = !on;
    if (on) renderTeamBroadcast();
  }
  $('#tbcBtn').addEventListener('click', e => bcBtnClick(e, document.body.classList.contains('tbcmode'), setTeamBroadcast));
  $('#tbc').addEventListener('mouseover', e => { const c = e.target.closest('[data-cg]'); if (!c) return; const [k, i] = c.dataset.cg.split('|'); showRkBub(c, chartTips[k][+i]); });
  $('#tbc').addEventListener('mouseout', e => { if (e.target.closest('[data-cg]')) hideRkBub(); });
  $('#tbc').addEventListener('click', e => {
    const cm = e.target.closest('[data-cm]');
    const cp = e.target.closest('[data-cp]');
    if (cp) { const [k, p] = cp.dataset.cp.split('|'), ok = k + '_off', o = chartModes[ok] || (chartModes[ok] = {}); if (!o[p] && CH_PER.filter(x => !o[x.k]).length < 2) return; o[p] = !o[p]; try { localStorage.setItem('pba_tbc_chart', JSON.stringify(chartModes)); } catch (x) {} hideRkBub(); renderTeamBroadcast(); return; }
    if (cm) { const [k, m] = cm.dataset.cm.split('|'); chartModes[k] = m; try { localStorage.setItem('pba_tbc_chart', JSON.stringify(chartModes)); } catch (x) {} hideRkBub(); renderTeamBroadcast(); return; }
    if (e.target.closest('.tbcback')) { if (BCWIN) window.close(); else setTeamBroadcast(false); return; }
    if (e.target.closest('.bcpop')) { popOutBc(); return; }
    const ex = e.target.closest('[data-export]'); if (ex) { exportSummary(ex.dataset.export, `팀 방송요약 ${teamShort[panes.a.code] || ''} vs ${teamShort[panes.b.code] || ''}`); return; }
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
      ['뱅킹 승률', g3(o => o.bankRate, pct, o => `${o.bankW}-${o.bankL}`)], ['선공 세트 승률', g3(o => o.firstSet)], ['후공 세트 승률', g3(o => o.secondSet)],
      [`#${setNo}세트${kind ? ` (${kind})` : ''}`],
      [`${setNo}세트 승률`, o => { const x = o && o.byNo && o.byNo[setNo]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: wlOf(x) } : null; }],
      ...(kind ? [[`${kind} 승률`, o => { const x = o && o.byKind && o.byKind[kind]; return x && x.n ? { v: x.w / x.n, t: pct(x.w / x.n), s: `에버 ${f3(x.i ? x.p / x.i : null)}` } : null; }]] : []),
      ...(sa + sb > 0 ? [[`지금 스코어 → 승<span class="s">${esc(an)} ${sa}:${sb} · ${esc(bn)} ${sb}:${sa}</span>`, st]] : []),
    ], 'grid ltab', 'mid');
    return `<div class="lcard lsplit"><div class="lleft"><div class="lscore"><div class="pl a">${esc(an)}</div><div class="mid"><div class="sets">${sa} : ${sb}</div><div class="cur">${setNo}세트${kind ? ` · ${esc(kind)}` : ''}</div></div><div class="pl">${esc(bn)}</div></div>
      <div class="ldone">팀리그 · ${esc(sl)} 시즌${PA.rname ? ` · ${esc(PA.rname)}` : ''}</div><ul>${pts.map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div class="lright"><div class="lsub">기본 정보 · 이번 라운드 · 이번 시즌 · 통산</div>${tbl}</div></div>`;
  }

  // 세트별 승률 칸 말풍선: 그 시즌(통산은 전체 시즌) 모든 팀의 그 세트 승률 순위 (정규리그, 승률 같으면 같은 순위)
  function setNoRankTip(no, lg, code) {
    const codes = [...new Set(D.games.filter(g => !lg || g.league === lg).flatMap(g => [g.t1, g.t2]))];
    const list = codes.map(c => ({ c, x: tcalc(gamesOf(c, g => !g.post && (!lg || g.league === lg))).byNo[no] })).filter(o => o.x && o.x.n).map(o => ({ ...o, r: o.x.w / o.x.n })).sort((a, b) => b.r - a.r || b.x.n - a.x.n);
    const rows = list.map(o => `<tr class="${o.c === code ? 'mine' : ''}"><td>${list.filter(y => y.r > o.r).length + 1}위</td><td style="text-align:left">${esc(teamShort[o.c] || o.c)}</td><td>${pct(o.r)}</td><td>${wlOf(o.x)}</td></tr>`).join('');
    return `<div class="rkh0">${lg ? esc(leagueLabel(lg)) : '통산'} ${no}세트 승률 순위</div><table class="rdtip">${rows}</table>`;
  }
  // 시즌별 순위 '최종' 칸 말풍선: 그 시즌 포스트시즌 전체 (단계별 대진 · 시리즈 결과 → 최종 순위). 지금 보는 팀은 굵게
  function postTip(lg, code) {
    const names = stageNames(lg), gs = D.games.filter(g => g.league === lg && g.post);
    const label = leagueLabel(lg), bold = c => { const n = esc(teamAbbr(c)); return c === code ? `<b style="color:var(--accent)">${n}</b>` : n; };
    if (!gs.length) return `<div class="rkh0">${esc(label)} 포스트시즌</div><div class="rsub">기록 없음</div>`;
    const stages = [...new Set(gs.map(g => names[g.post_code]))].sort((a, b) => STAGES.indexOf(a) - STAGES.indexOf(b));
    const rows = stages.map(st => {
      const pair = {};
      gs.filter(g => names[g.post_code] === st).forEach(g => { const k = [g.t1, g.t2].sort().join('|'), x = pair[k] || (pair[k] = { a: k.split('|')[0], b: k.split('|')[1], wa: 0, wb: 0 }); const aw = g.t1 === x.a ? g.s1 > g.s2 : g.s2 > g.s1, bw = g.t1 === x.a ? g.s2 > g.s1 : g.s1 > g.s2; if (aw) x.wa++; if (bw) x.wb++; });
      return Object.values(pair).map((x, i) => { const [hi, lo, wh, wl] = x.wa >= x.wb ? [x.a, x.b, x.wa, x.wb] : [x.b, x.a, x.wb, x.wa]; return `<tr><td>${i ? '' : esc(st)}</td><td>${bold(hi)}</td><td>${wh}:${wl}</td><td style="text-align:left">${bold(lo)}</td></tr>`; }).join('');
    }).join('');
    // 홈피 순위에 빠진 팀은 postRank 가 채운다 (23-24 4위)
    const rk = [...new Set(gs.flatMap(g => [g.t1, g.t2]))].map(team => ({ team, rank: postRank(team, lg) })).filter(s => s.rank).sort((a, b) => a.rank - b.rank);
    return `<div class="rkh0">${esc(label)} 포스트시즌 <small>이긴 경기 수</small></div><table class="rdtip">${rows}</table>${rk.length ? `<div class="rsub" style="margin-top:3px">최종 ${rk.map(s => `${s.rank}위 ${bold(s.team)}`).join(' · ')}</div>` : ''}`;
  }
  const sheetTipCache = {};
  // 기록지 브리핑 최근 5경기 · 5세트 말풍선: 칩 순서(왼쪽 = 오래된 것)대로 날짜 · 라운드 · 상대 팀 · 세트 · 승패 스코어
  //  줄 = [날짜, 라운드, 상대 팀 코드, 세트 칸(HTML, 없으면 ''), w|l|d, 스코어, 상대 선수들]
  const r5Tip = (title, rows) => `<div class="rkh0">${esc(title)} <small>왼쪽 칩부터</small></div><table class="rdtip r5t">${rows.map(([dt, rd, op, st, r, sc, ops]) => `<tr><td>${esc(String(dt || '').slice(2, 10).replace(/-/g, '.'))}</td><td>${esc(rd || '')}</td><td><b style="color:${tcolor(op)}">vs ${esc(teamShort[op] || op)}</b>${ops && ops.length ? ` <small>${esc(ops.join('·'))}</small>` : ''}</td>${st ? `<td>${st}</td>` : ''}<td class="${r}"><b>${r === 'w' ? '승' : r === 'd' ? '무' : '패'}</b> ${sc}</td></tr>`).join('')}</table>`;
  // 기록지 브리핑 추가 칩: 이번 시즌/통산. ny = 노란색(지금 가장 새로운 정보)
  const xtHead = (t, ny = true) => `<span class="xh${ny ? ' ny' : ''}">${t} <small>시즌/통산</small></span>`;
  // 라이브 정보 수치: 이번 시즌 순위/통산 순위 (시즌 = 노란색, 통산 = 흰색)
  //  순위는 팀 에버 칸처럼 값 바로 뒤 작은 회색 '(n위)'
  const xtVal = (sv, av, rk = ['', '']) => `<span class="vs">${sv}${rk[0] ? `<small class="rkn">(${rk[0]})</small>` : ''}</span> / <span class="va">${av}${rk[1] ? `<small class="rkn">(${rk[1]})</small>` : ''}</span>`;
  // 묶음 버튼: 첫 칩 = 버튼(data-flt = 접고 펴는 키, 아래 화살표 아이콘), 나머지 = .xgm.<g> (기록지가 접힌 묶음을 숨긴다)
  const grp = (chips, g, key) => '<div class="xgb">' + chips.filter(Boolean).map((h, i) => i === 0 ? h.replace('<span class="ti xt', `<span data-flt="${key}" class="xgh ti xt`).replace('</small>', ' <span class="dni"></span></small>') : h.replace('<span class="ti xt', `<span class="xgm ${g} ti xt`)).join('') + '</div>';
  const xtChip = (l, s, a, ny = true, rk = ['', ''], tip = '') => { const r = x => x && x.n ? pct(x.w / x.n) : '–', d = x => x && x.n ? `${x.w}-${x.n - x.w}` : '–'; return `<span class="ti xt${ny ? ' ny' : ''}"${tip ? ` data-xtt="${esc(tip)}"` : ''}><small>${l}</small><b>${xtVal(r(s), r(a), rk)}</b><i>${d(s)} / ${d(a)}</i></span>`; };
  // 단식이면 그 선수, 복식이면 그 콤비의 같은 종목 세트 기록 (시즌 · 통산): 선공 · 후공 · 초구 · 점수 상황
  //  sheetEnt: 모든 선수 · 콤비를 한 번에 세어 둔다 (순위용). E = 단식 선수 · 복식 콤비, F = 초구를 직접 친 선수(종목별), B = 뱅킹 (선수 · 콤비)
  const entBlank = () => { const z = () => ({ w: 0, n: 0 }); return { st: {}, tr: {}, sq: {}, no: {}, ofbOk: z(), ofbMiss: z(), fst: z(), snd: z(), fbN: 0, fbP: 0, fbM: 0, fbOk: z(), fbMiss: z(), fb3: z(), al3: z(), tie: z(), up: z(), dn: z(), keep: z(), back: z(), cl: z(), f5: { keep: 0, tie: 0, back: 0 } }; };
  function sheetEnt(lg) {
    const key = 'en|' + lg; if (sheetTipCache[key]) return sheetTipCache[key];
    const add = (x, win) => { x.n++; if (win) x.w++; }, two = () => ({ s: { w: 0, n: 0 }, a: { w: 0, n: 0 } });
    const E = {}, F = {}, B = {};
    const addK = (m, k, win) => add(m[k] || (m[k] = { w: 0, n: 0 }), win);
    // 세트 스코어(st, 'a:b') · 앞 세트 스코어에서 온 경우(tr, '1:0>1:1')별 승률도 센다
    D.games.filter(g => !g.post).forEach(raw => [raw.t1, raw.t2].forEach(side => { let a = 0, b = 0, prev = null, sq = ''; persp(raw, side).sets.forEach(s => {
      const sk = `${a}:${b}`, tk = prev ? `${prev}>${sk}` : null, sq0 = sq; prev = sk; s.win ? a++ : b++; sq += s.win ? '승' : '패';   // sq0 = 앞 세트 결과 순서 ('패승')
      if (!s.players.length) return;
      const solo = s.players.length < 2, k = (solo ? '1|' : '2|') + comboKey(s.players), cur = raw.league === lg, f = setFlowT(s, true);
      const e = E[k] || (E[k] = { solo, kind: s.kind, s: entBlank(), a: entBlank() });
      (cur ? [e.s, e.a] : [e.a]).forEach(x => {
        addK(x.st, sk, s.win); if (tk) addK(x.tr, tk, s.win); if (sq0.length > 1) addK(x.sq, sq0, s.win); addK(x.no, s.no, s.win);
        if (s.first === false && s.oruns && s.oruns.length) add(s.oruns[0] > 0 ? x.ofbOk : x.ofbMiss, s.win);
        if (s.first === true) add(x.fst, s.win); else if (s.first === false) add(x.snd, s.win);
        if (s.first && s.runs && s.runs.length) { const r = s.runs[0]; x.fbN++; x.fbP += r; if (r >= 2) x.fbM++; add(r > 0 ? x.fbOk : x.fbMiss, s.win); if (r >= 3) add(x.fb3, s.win); }
        if (s.first === false && s.oruns && s.oruns.length && s.oruns[0] >= 3) add(x.al3, s.win);
        if (f) { if (f.lf === 0) add(x.tie, s.win); if (f.up) add(x.up, s.win); if (f.dn) add(x.dn, s.win); if (f.lf === 1) add(x.keep, s.win); if (f.lf === -1) add(x.back, s.win); if (f.cl) add(x.cl, s.win); }
        if (isF5(s)) x.f5[f5Sit(s)]++;
      });
      if (s.first && s.runs && s.runs.length) { const fk = (solo ? '1|' : '2|') + s.players[0], x = F[fk] || (F[fk] = { solo, ...two(), st: { s: {}, a: {} }, sq: { s: {}, a: {} } }); add(x.a, s.runs[0] > 0); if (cur) add(x.s, s.runs[0] > 0); addK(x.st.a, sk, s.runs[0] > 0); if (cur) addK(x.st.s, sk, s.runs[0] > 0); if (sq0.length > 1) { addK(x.sq.a, sq0, s.runs[0] > 0); if (cur) addK(x.sq.s, sq0, s.runs[0] > 0); } }
      if (s.no === 1 && s.first != null) [['p|' + s.players[0]], solo ? [] : ['c|' + comboKey(s.players)]].flat().forEach(bk => { const x = B[bk] || (B[bk] = two()); add(x.a, s.first); if (cur) add(x.s, s.first); });
    }); }));
    return (sheetTipCache[key] = { E, F, B });
  }
  function sheetSide(names, lg) { const ns = names.map(canonName), e = sheetEnt(lg).E[(ns.length < 2 ? '1|' : '2|') + comboKey(ns)]; return e || { solo: ns.length < 2, s: entBlank(), a: entBlank() }; }
  // 순위: 같은 무리(pool)에서 값이 더 큰 수 + 1. 대상 = 시즌 3번 · 통산 5번 이상 (본인은 모자라도 넣는다). 전체 수는 쓰지 않는다
  //  mins: [시즌, 통산] 최소 횟수 (기본 3 · 5, 초구 관련은 FB_MIN). kindPool: 같은 단식 / 복식 중에서도 같은 종목(남복 · 여복 · 혼복, 남단 · 여단)끼리
  const FB_KEYS = new Set(['avg', 'multi', 'fbOk', 'fbMiss', 'fb3', 'ofbOk', 'ofbMiss', 'al3']), FB_MIN = [5, 20];
  const kindPool = (E, me, solo) => Object.values(E).filter(x => x.solo === solo && (!me || !me.kind || x.kind === me.kind));
  const rankIn = (pool, me, sc, val, cnt, mins = [3, 5]) => { const mv = me ? val(me[sc]) : null; if (mv == null) return ''; const min = sc === 's' ? mins[0] : mins[1]; return `${1 + pool.filter(x => x !== me && cnt(x[sc]) >= min && val(x[sc]) != null && val(x[sc]) > mv).length}위`; };
  const rt2 = x => x && x.n ? x.w / x.n : null, cn = x => x ? x.n : 0;
  // 기록지 선수 흐름 승률 한 줄 = 칸 7개 (이름 | 시즌 순위 | 시즌 승률 | 승패 | (통산 승률 | 승패) | 통산 순위). 감싸는 .frg 격자가 줄끼리 칸을 맞춘다
//  순위는 다른 칩처럼 값 바로 뒤: 시즌 % 순위 승패 (통산 % 순위 승패). tip = 커서 말풍선 키 (data-xtt)
// 기록지 팀 흐름 집계 (팀 하나, 정규리그): st = 세트 시작 스코어별 세트 승패, no = 세트 번호별, tr = '앞>지금' 스코어를 지난 경기의 경기 승패(무 d), gs = 그 세트 스코어를 지난 경기의 경기 승패. s = 이번 시즌 · a = 통산
const teamFlowOf = (code, lg) => { const key = 'tf4|' + code + '|' + lg;
  return sheetTipCache[key] || (sheetTipCache[key] = (() => { const z = () => ({ st: {}, no: {}, tr: {}, gs: {}, gsq: {} }), m = { s: z(), a: z() }, add = (o, k, w, dr) => { const x = o[k] || (o[k] = { w: 0, n: 0, d: 0 }); x.n++; if (w) x.w++; if (dr) x.d++; };
        gamesOf(code, g => !g.post).forEach(g => { let x = 0, y = 0, sq = ''; g.sets.slice().sort((p, q) => p.no - q.no).forEach(s => { const k = `${x}:${y}`; s.win ? x++ : y++; sq += s.win ? '승' : '패'; const tk = `${k}>${x}:${y}`; (g.league === lg ? [m.s, m.a] : [m.a]).forEach(o => { add(o.st, k, s.win); add(o.no, s.no, s.win); add(o.tr, tk, g.win, g.draw); add(o.gs, `${x}:${y}`, g.win, g.draw); if (sq.length > 1) add(o.gsq, sq, g.win, g.draw); }); }); });
        return m; })());
};
const frRow = (l, s, a, rk, ny, lab = '', cls = '', tip = '') => { const r = x => x && x.n ? `${Math.round(x.w / x.n * 100)}%` : '–', d = x => x && x.n ? `${x.w}-${x.n - x.w}` : ''; const rkS = x => x ? `<small class="rkn">(${x})</small>` : ''; return `<span class="frw${ny ? ' ny' : ''}${cls}"${tip ? ` data-xtt="${esc(tip)}"` : ''}>${lab || `<small>${l}</small>`}<b>${r(s)}${rkS(rk[0])}</b><small>${d(s)}</small><i>(${r(a)}${rkS(rk[1])}</i><small>${d(a)}<i class="frp">)</i></small></span>`; };
// 세트 결과 순서 '패승' → 승 / 패 글자 색 (기록지 흐름 줄 이름)
const seqH = q => q.replace(/[승패]/g, c => `<span class="${c === '승' ? 'sqw' : 'sql'}">${c}</span>`);
window.frRow = frRow; window.seqH = seqH;   // 개인 기록지(indsheet.js)도 같은 줄 모양을 쓴다 (이 파일은 함수로 감싸여 있어 밖에서 보이게)
  // 전체 콤비 표 (시즌 · 통산). 순위 대상: 시즌 3세트 · 통산 5세트 이상 콤비 (본인 콤비는 모자라도 넣어 순위를 보여 준다)
  const comboKey = ns => ns.slice().sort().join('|');
  function sheetComboTable(lg) {
    const key = 'ct|' + lg; if (sheetTipCache[key]) return sheetTipCache[key];
    const z = () => ({ w: 0, n: 0 }), add = (x, win) => { x.n++; if (win) x.w++; }, T = { s: { map: {}, min: 3 }, a: { map: {}, min: 5 } };
    D.games.filter(g => !g.post).forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => {
      if (s.players.length !== 2) return; const k = comboKey(s.players);
      (raw.league === lg ? [T.s, T.a] : [T.a]).forEach(t => {
        const c = t.map[k] || (t.map[k] = { kind: s.kind, wl: z(), pts: 0, opp: 0, runs: z(), runPts: 0, me: {} });
        add(c.wl, s.win); c.pts += s.pts || 0; c.opp += s.opp || 0;
        const es = (s.per || []).filter(Boolean);
        // 연속득점: 스카치 더블에서 한 이닝에 2번 이상 성공 = 두 선수가 모두 성공 (뱅크샷 한 번의 2점, 한 선수만 치는 K더블 이닝은 아님)
        if (s.hits && es.length && !es.some(e => e.kd)) s.hits.forEach((h, i) => { add(c.runs, h >= 2); if (h >= 2) c.runPts += (s.runs && s.runs[i]) || 0; });
        es.forEach(e => { if (!s.players.includes(e.name)) return; const m = c.me[e.name] || (c.me[e.name] = { pts: 0, succ: 0, att: 0, n: 0 }); m.n++; m.pts += e.pts || 0; m.succ += e.succ || 0; m.att += e.att || 0; });
      });
    })));
    return (sheetTipCache[key] = T);
  }
  const comboVal = (m, c, n) => {
    if (m === 'win') return c.wl.n ? c.wl.w / c.wl.n : null;
    if (m === 'ratio') return c.opp ? c.pts / c.opp : null;
    if (m === 'avg') return c.wl.n ? c.pts / c.wl.n : null;
    if (m === 'run') return c.runs.n ? c.runs.w / c.runs.n : null;
    const e = c.me[n]; if (!e) return null;
    if (m === 'atk') return e.att ? e.succ / e.att : null;
    const t = Object.values(c.me).reduce((v, x) => v + x.pts, 0); return t ? e.pts / t : null;   // share
  };
  // 같은 종목(남복 · 여복 · 혼복) 콤비끼리
  function comboRankOf(scope, m, c, n) {
    const me = comboVal(m, c, n); if (me == null) return null;
    const vals = []; let inPool = false;
    Object.values(scope.map).forEach(x => { if (x !== c && (x.wl.n < scope.min || x.kind !== c.kind)) return; (n ? Object.keys(x.me) : [null]).forEach(q => { const v = comboVal(m, x, q); if (v != null) { vals.push(v); if (x === c) inPool = true; } }); });
    return { r: 1 + vals.filter(v => v > me).length, of: vals.length + (inPool ? 0 : 1) };
  }
  window.TeamApp = {
    shortName: c => teamShort[c] || c,
    sheetUI: { xtChip, xtHead, xtVal, grp },   // 개인 기록지(indsheet.js)도 같은 칩 모양을 쓴다
    curLeague: () => panes.a && panes.a.league,
    // 상단 팀리그 창에서 쓰는 자료 · 계산
    leagueQA: q => leagueQA(q, panes.a && panes.a.league), leagueQACats: lqaCatsOf,
    boardData: () => D ? { D, teamShort, standings, tcalc, gamesOf, persp, playerStats, postRank, postResult, roundsOf, roundRanks, teamRankStats, leagueOf, isKDouble } : null,
    // 캐스터 기록지: 세트 스코어 a:b 에서 그 팀 시즌 최종 승률 (0:0 은 시즌 승률)
    // 기록지 팀 흐름: 세트 스코어 a:b 가 된 경기의 승률 · 승패, 앞 스코어(pa:pb)에서 a:b 가 된 경기의 승률 · 승패. 이번 시즌(통산), 정규리그
    //  앞 스코어는 될 수 있는 두 가지(a-1:b = 방금 끝난 a+b 세트 승 · a:b-1 = 패)를 모두 보여 주고, 실제로 온 쪽(prev)을 강조한다
    // 기록지 팀 흐름: 첫 줄 'N세트 승률'(그 팀이 N세트에서 이긴 비율)이 버튼, 펴면 지금 세트 스코어(a:b)로 시작한 세트 승률, 그 아래 같은 세트에서 나올 수 있는 반대 스코어 승률
    //  이번 시즌(통산), 정규리그. 7칸 표 (이름 | 승률 | 순위 | 승패 | (통산 승률 | 순위 | 승패)). 순위 = 모든 팀 중 (시즌 3 · 통산 5번 이상)
    // 기록지 실시간 세트 승률: 두 쪽 선수(콤비) 이닝 득점 분포로 남은 점수 · 다음 차례에서 왼쪽이 이길 확률 (predict.js)
    // 기록지 세트 선수 이름 옆: 그 선수(단식) · 콤비(복식)의 팀리그 최근 5세트 승패 (팀 최근 5경기와 같은 모양)
    sheetRecent5: names => {
      if (!D || !names || !names.length) return '';
      const ns = names.map(canonName), k = (ns.length < 2 ? '1|' : '2|') + comboKey(ns);
      const L = sheetTipCache.r5 || (sheetTipCache.r5 = (() => { const m = {}; D.games.forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => { if (!s.players.length) return; const kk = (s.players.length < 2 ? '1|' : '2|') + comboKey(s.players); (m[kk] || (m[kk] = [])).push({ d: String(raw.date) + String(s.no).padStart(2, '0'), w: s.win, date: raw.date, rd: raw.post ? (raw.stage || '포스트시즌') : raw.round_label, opp: side === raw.t1 ? raw.t2 : raw.t1, no: s.no, kind: s.kind, pts: s.pts, op: s.opp, ops: s.oppPlayers }); }))); Object.values(m).forEach(a => a.sort((x, y) => x.d.localeCompare(y.d))); return m; })());
      const xs = (L[k] || []).slice(-5); if (!xs.length) return '';
      return `<span class="r5" data-stip="${esc(r5Tip('최근 5세트 (팀리그)', xs.map(x => [x.date, x.rd, x.opp, `${x.no}세트${x.kind ? ` <small>${esc(x.kind)}</small>` : ''}`, x.w ? 'w' : 'l', `${x.pts}:${x.op}`, x.ops])))}">${xs.map(x => `<span class="${x.w ? 'w' : 'l'}">${x.w ? '승' : '패'}</span>`).join('')}</span>`;
    },
    // 기록지 실시간 게임 승률: 오더(없는 세트는 시즌 출전 비율)로 세트마다 승률 → 지금 세트는 curP(실시간) → 4세트 먼저
    sheetGameProb: (c0, c1, orders, w0, w1, curP) => {
      if (!D || !window.Predict) return null;
      const M = Predict.teamModel(D, canonName), r = Predict.teamPredict(M, c0, c1, orders), ps = r.sets.map(s => s.p);
      if (curP != null) ps[w0 + w1] = curP;
      return Predict.match(ps, 4, w0, w1).win;
    },
    sheetWinProb: (n0, n1, kind, ga, gb, leftNext) => {
      if (!D || !window.Predict || !kind) return null;
      const M = Predict.teamModel(D, canonName); return Predict.setProb(M.dist(n0, kind), M.dist(n1, kind), ga, gb, leftNext);
    },
    sheetTeamFlow: (code, lg, a, b, seq, btn, open) => {
      if (!D || !code) return '';
      const M = teamFlowOf(code, lg), codes = sheetTipCache.tcodes || (sheetTipCache.tcodes = [...new Set(D.games.flatMap(g => [g.t1, g.t2]))]);
      const rkOf = (m, kk) => { const pool = codes.map(c => { const X = c === code ? M : teamFlowOf(c, lg); return { c, s: X.s[m][kk], a: X.a[m][kk] }; }), me = pool.find(x => x.c === code); return ['s', 'a'].map(sc => rankIn(pool, me, sc, rt2, cn)); };
      const n = a + b, no = n + 1, r = x => x && x.n ? `${Math.round(x.w / x.n * 100)}%` : '–', d = x => x && x.n ? (x.d ? `${x.w}-${x.d}-${x.n - x.w - x.d}` : `${x.w}-${x.n - x.w}`) : '';
      // 'N세트 승률' 말풍선: 이번 시즌 이 팀에서 N세트에 나온 선수(콤비)별 승률 · 승패 (많이 나온 순)
      const noTip = () => { const P = {}; gamesOf(code, g => g.league === lg && !g.post).forEach(g => g.sets.forEach(s => { if (s.no !== no || !s.players.length) return; const k = s.players.slice().sort().join('·'), x = P[k] || (P[k] = { w: 0, n: 0, nm: s.players.join('·') }); x.n++; if (s.win) x.w++; }));   // 콤비는 순서가 달라도 같은 콤비
        const rows = Object.entries(P).sort((a, b) => b[1].n - a[1].n || b[1].w / b[1].n - a[1].w / a[1].n);
        return rows.length ? `<div class="rkh0">${no}세트 출전 선수 <small>${esc(teamShort[code] || code)} · 이번 시즌</small></div><table class="rdtip">${rows.map(([k, x]) => `<tr><td>${esc(x.nm)}</td><td><b>${pct(x.w / x.n)}</b></td><td>${x.w}승 ${x.n - x.w}패</td></tr>`).join('')}</table>` : ''; };
      const line = (l, m, kk, cls = '', lab = '') => { const s = M.s[m][kk], A = M.a[m][kk], rk = rkOf(m, kk), tip = m === 'no' ? noTip() : ''; return `<span class="tfl${cls}"${tip ? ` data-stip="${esc(tip)}"` : ''}>${lab || `<small>${l}</small>`}<b>${r(s)}${rk[0] ? `<small class="rkn">(${rk[0]})</small>` : ''}</b><small>${d(s)}</small><em>(${r(A)}${rk[1] ? `<small class="rkn">(${rk[1]})</small>` : ''}</em><small>${d(A)}<em class="frp">)</em></small></span>`; };
      const head = seq.length > 1 && btn ? `<small class="flb${open ? ' on' : ''}" data-flt="${btn}">${no}세트 승률 <span class="dni"></span></small>` : '';
      // 펼친 줄 = 지금까지 세트 결과 순서('패승')를 지난 경기의 경기 승률 (승-패, 무승부가 있으면 승-무-패). 2세트가 끝난 뒤부터
      const br = seq.length > 1 ? line(seqH(seq), 'gsq', seq, ' tfx now') : '';
      // 지금 세트 스코어 a:b 에서의 경기 승률 (접어도 보이는 줄). 경기 시작 전 0:0 은 빼고
      const gs = n ? line(`${a}:${b} 게임 승률`, 'gs', `${a}:${b}`) : '';
      return `<div class="tflw${open ? ' open' : ''}">` + gs + line(`${no}세트 승률`, 'no', no, '', head) + br + '</div>';
    },
    // 기록지 가운데 상대 전적 말풍선: 두 팀 포스트시즌 대결 (시즌 · 라운드 · 승패, 왼쪽 팀 기준, 치른 순서)
    sheetH2HPost: (c0, c1) => {
      if (!D) return '';
      const gs = gamesOf(c0, g => g.post && (g.t1 === c1 || g.t2 === c1)).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!gs.length) return '';
      const rows = gs.map(g => `<tr><td>${esc(leagueLabel(g.league))}</td><td>${esc(stageNames(g.league)[g.post_code] || '포스트시즌')}</td><td><span class="${g.win ? 'w' : g.draw ? '' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'}</span> <small>${g.sw}:${g.sl}</small></td></tr>`).join('');
      return `<div class="rkh0">포스트시즌 맞대결 <small>${esc(teamShort[c0] || c0)} 기준</small></div><table class="rdtip">${rows}</table>`;
    },
    // 기록지 퍼펙트큐 도전 알림: 지금 이닝에서 퍼펙트큐가 나오면 몇 호인지 (시즌 · 통산 · 선수 개인 단식/복식, 포스트시즌 포함)
    //  퍼펙트큐 = 한 이닝에 세트 점수를 모두 친 세트. K더블 복식은 그 이닝 친 선수 한 명의 기록 (1번 선수 = 홀수 이닝)
    sheetPerfectNo: (names, lg) => {
      if (!D || !names || !names.length) return '';
      const P = sheetTipCache.perf || (sheetTipCache.perf = (() => { const out = []; D.games.forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => {
        if (!s.runs || !s.gp) return; const k = s.runs.findIndex(r => r >= s.gp); if (k < 0) return;
        const kd = s.players.length === 2 && isKDouble(raw.season, s.kind); out.push({ league: raw.league, single: s.players.length < 2, who: kd ? [s.players[k % 2]] : s.players }); }))); return out; })());
      const ns = names.map(canonName), single = ns.length < 2, fmt = single ? '단식' : '복식';
      // 모두 '치면 몇 호': 선수마다 { 시즌 · 단식/복식 }, 리그 { 시즌 · 통산 }. 기록지가 이름 옆 두 묶음으로 그린다
      return { fmt, per: ns.map(n => ({ n, s: P.filter(x => x.league === lg && x.who.includes(n)).length + 1, f: P.filter(x => x.single === single && x.who.includes(n)).length + 1 })), lg: P.filter(x => x.league === lg).length + 1, all: P.length + 1 };
    },
    sheetStateRate: (code, lg, a, b) => {
      if (!D) return null;   // 자료를 받기 전
      const o = tcalc(gamesOf(code, g => g.league === lg && !g.post));
      if (!a && !b) return o.games ? { w: o.win, n: o.games } : null;
      const x = o.state[`${a}:${b}`]; return x && x.n ? x : null;
    },
    // 기록지: 그 선수가 직접 친 초구의 성공률 { season, all } (팀리그 정규리그, 세트 · 종목 무관. 복식 팀 첫 공격은 1번 선수)
    sheetFb: (name, lg, solo) => {
      if (!D || !name) return null;
      const key = 'fb|' + name + '|' + lg + '|' + solo; if (sheetTipCache[key]) return sheetTipCache[key];
      const n = canonName(name), out = { season: { w: 0, n: 0 }, all: { w: 0, n: 0 } };
      D.games.filter(g => !g.post).forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => {
        if (!s.first || !s.runs || !s.runs.length || s.players[0] !== n || (solo != null && (s.players.length < 2) !== solo)) return;
        out.all.n++; if (s.runs[0] > 0) out.all.w++;
        if (raw.league === lg) { out.season.n++; if (s.runs[0] > 0) out.season.w++; }
      })));
      return (sheetTipCache[key] = out);
    },
    // 기록지: 세트 시작 때 볼 팀 브리핑 (실시간 브리핑에서 옮겨 옴). 두 팀 칩 + 상대 전적. 정규리그 기준, 같은 항목끼리 더 좋은 쪽 강조
    sheetBrief: (c0, c1, lg, setNo, hideBank) => {
      if (!D || !c0 || !c1) return null;
      const key = 'br|' + [c0, c1, lg, setNo, !!hideBank].join('|'); if (sheetTipCache[key]) return sheetTipCache[key];
      const PS = [periods(c0, lg), periods(c1, lg)], kind = mainKindOf(PS[0].all)(setNo) || mainKindOf(PS[1].all)(setNo);
      const rate = x => x && x.n ? x.w / x.n : null, rc = x => x && x.n ? pct(x.w / x.n) : '–', rs = x => x && x.n ? wlOf(x) : '';
      // 팀 기록 칩: 순위 · 승-패 · 승점 = 이번 라운드(이번 시즌, 굵게), 나머지 = 이번 시즌 값(리그 순위). 커서 말풍선(data-stip)에 기간 · 시즌/통산 값과 순위
      const TM = teamMetricRanks(lg), rk = (sc, code, k) => { const r = TM[sc].rank(code, k); return r ? `${r}위` : '–'; };
      const items = P => {
        const s = P.season, st = standings(lg).find(x => x.code === P.code) || {}, rr = roundRanks(lg, P.rname)[P.code], rl = P.rname || '라운드';
        const two = (r, sv) => `<span class="rv">${r}</span>(<strong>${sv}</strong>)`, tip2 = (l, r, sv) => `<div class="rkh0">${esc(l)}</div><table class="rdtip"><tr><td>이번 라운드(${esc(rl)})</td><td><b>${r}</b></td></tr><tr><td>이번 시즌</td><td><b>${sv}</b></td></tr></table>`;
        const rkV = rr ? `${rr}위` : '–', rkS = st.rank ? `${st.rank}위` : '–', wlR = P.round.games ? P.round.wl : '–', wlS = s.games ? s.wl : '–', ptR = P.round.games ? P.round.points ?? '–' : '–', ptS = s.games ? s.points ?? '–' : '–';
        // 시즌 값(순위) + 말풍선: 이번 시즌 값(순위) · 통산 값(순위)
        const met = (l, k, fmt) => { const sv = TM.s.v(P.code, k), av = TM.a.v(P.code, k), f = x => x == null ? '–' : fmt(x);
          return [l, `${f(sv)}<small class="rkn">(${rk('s', P.code, k)})</small>`, '', sv, `<div class="rkh0">${esc(l)}</div><table class="rdtip"><tr><td>이번 시즌</td><td><b>${f(sv)}</b> (${rk('s', P.code, k)})</td></tr><tr><td>통산</td><td><b>${f(av)}</b> (${rk('a', P.code, k)})</td></tr></table>`]; };
        return [
          ['순위', two(rkV, rkS), '', st.rank ? -st.rank : null, tip2('순위', rkV, rkS)],
          ['승-패', two(wlR, wlS), '', s.games ? s.winRate : null, tip2('승-패', wlR, wlS)],
          ['승점', two(ptR, ptS), '', s.games ? s.points : null, tip2('승점', ptR, ptS)],
          met('세트득실', 'setRatio', f3),
          met('팀 에버', 'avg', f3),
          met('점수득실', 'ptRatio', f3),
          // 두 칸씩: 남자 | 흰공, 여자 | 노란공, 그 아래 뱅킹 (최근 5경기는 팀 이름 옆, 뱅킹은 선공을 정하면 빠진다)
          met('남자 승률', 'men', pct),
          met('흰공 승률', 'white', pct),
          met('여자 승률', 'women', pct),
          met('노란공 승률', 'yellow', pct),
          ...(hideBank ? [] : [['뱅킹 승률', s.games ? pct(s.bankRate) : '–', s.games ? `${s.bankW}-${s.bankL}` : '', s.games ? s.bankRate : null]]),
        ];
      };
      const I = PS.map(items);
      const GW = new Set(['남자 승률', '흰공 승률', '여자 승률', '노란공 승률']);
      const chips = (mine, other, code) => { const lastGW = mine.reduce((z, x, i) => x && GW.has(x[0]) ? i : z, -1); return mine.map((x, i) => { if (!x || !other[i] && x[0] === '뱅킹 승률') return '<span class="ti" style="visibility:hidden"></span>'; const v = x[3], w = other[i][3], hi = v != null && w != null && !isNaN(v) && !isNaN(w) && v > w; return `${x[0] === '남자 승률' ? `<div class="xgb"><span class="ti xgh gtwh" data-flt="gtw|${code}"><small>종목 · 공 승률 <span class="dni"></span></small><b></b></span>` : ''}<span class="ti${hi ? ' hi' : ''}${GW.has(x[0]) ? ' xgm gtw' : ''}"${x[0] === '뱅킹 승률' ? ` data-bk="${code}" style="cursor:help"` : x[4] ? ` data-stip="${esc(x[4])}"` : x[2] ? ` title="${x[2]}"` : ''}><small>${x[0]}</small><b>${x[1]}</b>${x[2] ? `<i>${x[2]}</i>` : ''}</span>${i === lastGW ? '</div>' : ''}`; }).join(''); };
      const h2 = gamesOf(c0, g => g.t1 === c1 || g.t2 === c1), o = h2.length ? tcalc(h2) : null;
      const recent = P => `<span class="r5" data-stip="${esc(r5Tip('최근 5경기 (정규리그)', P.reg.slice(-5).map(g => [g.date, g.round, g.opp, '', g.win ? 'w' : g.draw ? 'd' : 'l', `${g.sw}:${g.sl}`])))}">${P.reg.slice(-5).map(g => `<span class="${g.win ? 'w' : g.draw ? 'd' : 'l'}">${g.win ? '승' : g.draw ? '무' : '패'}</span>`).join('')}</span>`;
      // 가운데 상대 전적 3줄 (경기 승 · 승점 · 세트): 팀마다 [이번 시즌, 통산], 정규시즌만 (포스트시즌 대결은 커서 말풍선 sheetH2HPost)
      const hx = (me, op) => { const all = gamesOf(me, g => !g.post && (g.t1 === op || g.t2 === op)), cur = all.filter(g => g.league === lg); return [cur.length ? tcalc(cur) : null, all.length ? tcalc(all) : null]; };
      const HX = [hx(c0, c1), hx(c1, c0)], hv = (x, f) => x ? f(x) : 0;
      const h2hRows = HX[0][1] ? [['전적', o => o.win], ['승점', o => o.points ?? 0], ['세트', o => o.setW]].map(([l, f]) => [l, HX.map(([s, a]) => [hv(s, f), hv(a, f)])]) : null;
      const h2hPost = gamesOf(c0, g => g.post && (g.t1 === c1 || g.t2 === c1)).length > 0;
      const out = { kind, recent: PS.map(recent), stars: [postStars(c0), postStars(c1)], h2hRows, h2hPost, teams: [chips(I[0], I[1], c0), chips(I[1], I[0], c1)], h2h: o ? `상대 전적 <b>${o.win}승 ${o.lose}패${o.draw ? ` ${o.draw}무` : ''}</b> · 세트 <b>${o.setW}:${o.setL}</b>` : '첫 맞대결' };
      return (sheetTipCache[key] = out);
    },
    // 기록지 라인업: 이 선수(콤비)와 상대 선수(콤비)의 맞대결 세트 승-패. 단식은 단식끼리, 복식은 그 콤비끼리 (정규리그). 이번 시즌(통산)
    // 기록지: 그 세트 선수(콤비) 대 상대 선수(콤비)의 팀리그 정규리그 맞대결 { s: 이번 시즌 { w, l }, a: 통산 }
    sheetSetVs: (names, opps, lg) => {
      if (!D || !names || !names.length || !opps || !opps.length) return null;
      const key = 'sv|' + names.join('|') + '|' + opps.join('|') + '|' + lg; if (sheetTipCache[key]) return sheetTipCache[key];
      const ns = names.map(canonName), os = opps.map(canonName), solo = ns.length < 2, S = { w: 0, l: 0 }, A = { w: 0, l: 0 };
      D.games.filter(g => !g.post).forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => {
        if ((s.players.length < 2) !== solo || !ns.every(n => s.players.includes(n)) || !os.every(n => (s.oppPlayers || []).includes(n))) return;
        A[s.win ? 'w' : 'l']++; if (raw.league === lg) S[s.win ? 'w' : 'l']++;
      })));
      return (sheetTipCache[key] = { s: S, a: A });
    },
    sheetLineupVs: (names, opps, lg) => { const x = TeamApp.sheetSetVs(names, opps, lg); return x ? `${x.s.w}-${x.s.l}(${x.a.w}-${x.a.l})` : ''; },
    // 기록지: 뱅킹 승률 칸 말풍선. 그 팀 이번 시즌 출전 선수별 뱅킹 승률 (정규리그). 뱅킹은 1세트에서 각 팀 첫 공격 선수(players[0])가 하고, 1세트 선공 = 뱅킹 승
    sheetBankTip: (code, lg) => {
      if (!D) return '';
      const key = 'bk|' + code + '|' + lg; if (sheetTipCache[key]) return sheetTipCache[key];
      const m = {}, mine = new Set(), z = () => ({ w: 0, l: 0 });
      D.games.filter(g => !g.post).forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => {
        if (s.first == null || s.no !== 1 || !s.players.length) return;
        const cur = raw.league === lg, n = s.players[0];
        const x = m[n] || (m[n] = { s: z(), a: z() });
        x.a[s.first ? 'w' : 'l']++; if (cur) x.s[s.first ? 'w' : 'l']++;
        if (cur && side === code) mine.add(n);
      })));
      const cell = x => x.w + x.l ? `${pct(x.w / (x.w + x.l))} <small>${x.w}승 ${x.l}패</small>` : '–';
      const rows = [...mine].sort((a, b) => (m[b].s.w + m[b].s.l) - (m[a].s.w + m[a].s.l)).map(n => `<tr><td class="tl">${esc(n)}</td><td>${cell(m[n].s)}</td><td>${cell(m[n].a)}</td></tr>`).join('');
      return (sheetTipCache[key] = `<div class="rkh0">${esc(teamShort[code] || code)} 선수별 뱅킹 승률 <small>정규리그</small></div><table class="ptip"><thead><tr><th></th><th>이번 시즌</th><th>통산</th></tr></thead><tbody>${rows}</tbody></table>`);
    },
    // 기록지: 그 시즌(lg 없으면 통산) 복식 기여도 순위 (남녀 따로, 복식 5세트 이상만 순위에 넣는다)
    sheetContRank: lg => {
      if (!D) return {};
      const key = 'cr|' + lg; if (sheetTipCache[key]) return sheetTipCache[key];
      const m = {}, gen = {};
      (D.rosters || []).forEach(r => { gen[r.canon] = r.gender; });
      D.games.filter(g => !g.post && (lg == null || g.league === lg)).forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => {
        if (s.players.length < 2) return; const es = (s.per || []).filter(Boolean); if (!es.length) return;
        const t = es.reduce((a, e) => a + (e.pts || 0), 0);
        es.forEach(e => {
          const x = m[e.name] || (m[e.name] = { me: 0, tot: 0, n: 0 }); x.me += e.pts || 0; x.tot += t; x.n++;
          if (!gen[e.name] && /남자|여자/.test(s.kind)) gen[e.name] = s.kind.includes('여자') ? 'F' : 'M';
        });
      })));
      const out = {};
      ['M', 'F'].forEach(g => {
        const list = Object.keys(m).filter(n => (gen[n] === 'F' ? 'F' : 'M') === g && m[n].tot && m[n].n >= 5).sort((a, b) => m[b].me / m[b].tot - m[a].me / m[a].tot);
        list.forEach((n, i) => { const prev = i && m[list[i - 1]].me / m[list[i - 1]].tot === m[n].me / m[n].tot; out[n] = { r: prev ? out[list[i - 1]].r : i + 1, all: list.length, g }; });
      });
      return (sheetTipCache[key] = out);
    },
    // 캐스터 기록지: 그 세트에 나오는 선수들 말풍선 (팀리그 정규리그 결과). 단식은 개인 기록만, 복식은 콤비 기록 먼저 · 개인 기록은 아래로
    //  순서: 해당 세트 승률 → 세트 스코어 흐름(1세트 제외) → 세트 점수 흐름 → 콤비 기록 → 개인 기록. 기록은 이번 시즌(통산)
    //  상대 전적(그 세트 상대와, 단식은 단식끼리 · 복식은 콤비 대 콤비)은 세트 승률 바로 아래 (가운데 라인업 세트 번호 말풍선에도 있다). sit = 이 팀의 지금 세트 스코어 상황(lead · tie · trail · from32 · from23) → 그 줄 노란 강조
    sheetPlayersTip: (names, lg, setNo, opps, kind = '', sit = '') => {
      if (!D || !names || !names.length) return '';
      const key = names.join('|') + '|' + lg + '|' + setNo + '|' + (opps || []).join('|') + '|' + kind + '|' + sit; if (sheetTipCache[key]) return sheetTipCache[key];
      const ns = names.map(canonName), os = (opps || []).map(canonName), solo = ns.length < 2, pair = ns.length === 2, z = () => ({ w: 0, n: 0 }), add = (x, win) => { x.n++; if (win) x.w++; };
      const blankP = () => ({ one: z(), dbl: z(), md: z(), wd: z(), mix: z(), all: z(), rd: z(), oneP: 0, oneI: 0, long: 0, own: 0, bank: 0, pt: 0, op: 0, dS: 0, dA: 0, fbD: z(), me: 0, tot: 0, perN: 0 });
      const blankF = () => ({ fN: 0, fL: 0, fT: 0, fO: 0, keep: z(), back: z(), cl: z() });
      const addF = (x, f, win) => { x.fN++; if (f.lf === 1) { x.fL++; add(x.keep, win); } else if (f.lf === -1) { x.fO++; add(x.back, win); } else x.fT++; if (f.cl) add(x.cl, win); };
      const blankT = () => ({ no: z(), lead: z(), tie: z(), trail: z(), from32: z(), from23: z(), vs: os.map(z), pairVs: z(), flow: blankF() });
      // T = 단식은 그 선수, 복식은 그 콤비의 세트 기록 (시즌 · 통산). P = 선수 개인 기록 (모든 종목, 종목별 · 이번 라운드 따로)
      //  이번 라운드 = 이 리그 정규리그에서 가장 최근 경기의 라운드
      const T = { s: blankT(), a: blankT() }, pF = blankF(), P = ns.map(() => ({ s: blankP(), a: blankP(), recent: [] }));
      const lastReg = D.games.filter(g => g.league === lg && !g.post).reduce((m, g) => !m || String(g.date) > String(m.date) ? g : m, null), curRound = lastReg ? lastReg.round_label : null;
      const curLg = D.leagues.find(l => l.league === lg), prevLg = curLg && (D.leagues.find(l => l.season === curLg.season - 1) || {}).league;
      D.games.filter(g => !g.post).forEach(raw => [raw.t1, raw.t2].forEach(side => {
        const g = persp(raw, side), cur = raw.league === lg; let a = 0, b = 0;
        g.sets.forEach(s => {
          const sit = a < b ? 'trail' : a > b ? 'lead' : 'tie', isSolo = s.players.length < 2, f = setFlowT(s, true);
          // 7세트는 늘 3:3이라 6세트 전 스코어로 나눈다: 6세트를 이겼으면 2:3에서, 졌으면 3:2에서 온 것
          const s6 = s.no === 7 ? g.sets.find(x => x.no === 6) : null, via7 = s6 ? (s6.win ? 'from23' : 'from32') : null;
          if (isSolo === solo) {
            if (ns.every(n => s.players.includes(n))) (cur ? [T.s, T.a] : [T.a]).forEach(x => {
              if (s.no === setNo) { add(x.no, s.win); add(x[sit], s.win); if (via7) add(x[via7], s.win); }
              if (f) addF(x.flow, f, s.win);
              const oppSet = s.oppPlayers || []; os.forEach((q, j) => { if (solo && oppSet.includes(q)) add(x.vs[j], s.win); });
              if (pair && os.length === 2 && os.every(q => oppSet.includes(q))) add(x.pairVs, s.win);
            });
            if (pair && f && raw.league === prevLg && ns.every(n => s.players.includes(n))) addF(pF, f, s.win);
          }
          // 선수 개인 기록: 모든 종목 (단식 · 복식 · 남복 · 여복 · 혼복 따로), 이번 라운드
          ns.forEach((n, i) => {
            if (!s.players.includes(n)) return;
            if (cur) P[i].recent.push(s.win);
            (cur ? [P[i].s, P[i].a] : [P[i].a]).forEach(o => {
              add(o.all, s.win); if (cur && g.round === curRound) add(o.rd, s.win);
              if (isSolo) add(o.one, s.win); else { add(o.dbl, s.win); add(s.kind === '혼합복식' ? o.mix : s.kind === '여자복식' ? o.wd : o.md, s.win); }
              o.pt += s.pts || 0; o.op += s.opp || 0;
              const es = (s.per || []).filter(Boolean), e = es.find(x => x.name === n); if (e) { o.dS += e.succ || 0; o.dA += e.att || 0; }
              if (s.first && s.runs && s.runs.length && (isSolo || s.players[0] === n)) add(o.fbD, s.runs[0] > 0);
              if (isSolo) { o.oneP += s.pts || 0; o.oneI += s.inn || 0; if (s.runs) o.long += s.runs.filter(v => v >= 5).length; if (s.runs && s.hits) { const r = sum(s.runs, v => v); o.own += r; o.bank += r - sum(s.hits, v => v); } }
              else if (e) { o.me += e.pts || 0; o.tot += es.reduce((v, x) => v + (x.pts || 0), 0); o.perN++; o.own += e.pts || 0; o.bank += e.bank || 0; }
            });
          });
          s.win ? a++ : b++;
        });
      }));
      const cell = x => x.n ? `${pct(x.w / x.n)} <small>${x.w}-${x.n - x.w}</small>` : '–';
      const rate = (v, n) => n ? `${pct(v / n)} <small>${v}세트</small>` : '–';
      // 선수마다 칸 4개 (시즌 값 | 시즌 승패 · 횟수 | (통산 값 | 통산 승패 · 횟수)) — 줄마다 시작과 '(' 위치가 맞는다
      const cols = ns.length * 4 + 1;
      //  복식 선수별 영역(indiv)에서는 묶음 제목 줄도 선수 칸을 나눠 세로선이 끊기지 않게
      let indiv = false;
      const group = t => `<tr>${pair && indiv ? `<td class="tg" colspan="5">${t}</td><td class="tg p2" colspan="${cols - 5}"></td>` : `<td class="tg" colspan="${cols}">${t}</td>`}</tr>`;
      const SEP = '\u0001', sa = (s, a) => s === a ? s : `${s}${SEP}${a}`;
      const split = c => { const m = String(c).match(/^(.*?)\s*(<small>(?:(?!<small>).)*<\/small>)?$/); return m ? [m[1], m[2] || ''] : [c, '']; };
      const quad = c => { if (!String(c).includes(SEP)) { const [v, x] = split(c); return /<span|\//.test(v) ? `<td class="pv" colspan="4">${c}</td>` : `<td class="pv">${v}</td><td class="px" colspan="3">${x}</td>`; }
        const [s, a] = String(c).split(SEP), [sv, sx] = split(s), [av, ax] = split(a); return `<td class="pv">${sv}</td><td class="px">${sx}</td><td class="pa">(${av}${ax ? '' : ')'}</td><td class="px">${ax ? ax + ')' : ''}</td>`; };
      // 줄: [이름, 선수별 칸]. 칸이 하나뿐(콤비 전체)이면 첫 선수 칸에 두고 나머지는 비운다. 시즌과 통산이 모두 같으면 그룹 머리에 '동일' 표시 후 한 번만
      //  복식: 공통(콤비) 칸은 두 선수 칸을 합쳐 가운데, 선수별 칸도 가운데 정렬 (시즌 (통산) 한 덩어리)
      //  선수별 칸 사이는 세로선(p2 = 두 번째 선수 칸 왼쪽 테두리)
      const mid = (c, span, i = 0) => { const [s, a] = String(c).split(SEP); return `<td class="pc${i ? ' p2' : ''}" colspan="${span}">${s}${a != null ? ` (${a})` : ''}</td>`; };
      const line = (l, cs, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td class="tl">${l}</td>${pair ? (cs.length < ns.length ? mid(cs[0], cols - 1) : cs.map((c, i) => mid(c, 4, i)).join(''))
        : cs.map(quad).join('') + (cs.length < ns.length ? `<td colspan="${(ns.length - cs.length) * 4}"></td>` : '')}</tr>`;
      // 공통(콤비) 영역과 선수별 영역 사이 가로선은 이 이름 줄 위 테두리
      const nameRow = () => { indiv = true; return `<tr class="pn"><td></td>${ns.map((n, i) => `<th class="pc${i ? ' p2' : ''}" colspan="4">${esc(n)}</th>`).join('')}</tr>`; };
      const section = (title, rows) => {
        const same = rows.every(r => r[1].every((c, i) => c === r[2][i]));
        return group(`${title} <small>${same ? '이번 시즌/통산 동일' : '이번 시즌(통산)'}</small>`) + rows.map(([l, s, a, cls]) => line(l, s.map((c, i) => sa(c, a[i])), cls || '')).join('');
      };
      const FR = [['초반 리드', x => rate(x.fL, x.fN)], ['초반 박빙', x => rate(x.fT, x.fN)], ['초반 열세', x => rate(x.fO, x.fN)], ['리드 승률', x => cell(x.keep)], ['역전 승률', x => cell(x.back)], ['후반 클러치', x => cell(x.cl)]];
      const who = pair ? ' · 콤비' : '';
      // 상대 전적: 단식은 상대 선수와 단식끼리, 복식은 콤비 대 콤비 (정규리그). 통산에도 없으면 첫 맞대결
      const vsC = x => x.n ? `${x.w}승 ${x.n - x.w}패` : '–';
      const vsL = solo ? os.map((q, j) => [esc(q), T.s.vs[j], T.a.vs[j]]) : pair && os.length === 2 ? [[esc(os.join('·')), T.s.pairVs, T.a.pairVs]] : [];
      const vsSec = !vsL.length ? '' : vsL.every(x => !x[2].n) ? group(`상대 전적 <small>vs ${vsL.map(x => x[0]).join(', ')}</small>`) + line('', ['첫 맞대결'])
        : section('상대 전적', vsL.map(([l, s, a]) => [`vs ${l}`, [vsC(s)], [vsC(a)]]));
      let h = `<div class="rkh0">${setNo}세트 선수 기록 <small>팀리그 정규리그</small></div><table class="ptip"><thead><tr><th></th>${pair ? `<th class="pc" colspan="${cols - 1}">${esc(ns.join(' · '))}</th>` : ns.map(n => `<th colspan="4">${esc(n)}</th>`).join('')}</tr></thead><tbody>`
        + line(`${setNo}세트 승률${who} <small>시즌(통산)</small>`, [sa(cell(T.s.no), cell(T.a.no))])
        + vsSec
        + (setNo === 1 ? '' : section(`세트 스코어 흐름${who}`, (setNo === 7 ? [['3:2 &gt; 7세트 승률', 'from32'], ['2:3 &gt; 7세트 승률', 'from23']] : [['우세승', 'lead'], ['박빙승', 'tie'], ['열세승', 'trail']]).map(([l, k]) => [l, [cell(T.s[k])], [cell(T.a[k])], k === sit ? 'now' : '']))) 
        + section(`세트 점수 흐름${who}${T.s.flow.fN < 5 ? ' · 시즌 5세트 미만' : ''}`, FR.map(([l, f]) => [l, [f(T.s.flow)], [f(T.a.flow)]]))
        + (pair && T.s.flow.fN < 5 && pF.fN ? group(`지난 시즌 콤비 <small>${pF.fN}세트</small>`) + FR.map(([l, f]) => line(l, [f(pF)])).join('') : '');
      if (pair) {
        // 콤비 기록: 항목마다 전체 콤비(선수) 중 순위. 이번 시즌(통산)
        const CT = sheetComboTable(lg), ck = comboKey(ns), cs = CT.s.map[ck], ca = CT.a.map[ck];
        const rk = (scope, m, c, n) => { const r = c ? comboRankOf(scope, m, c, n) : null; return r ? ` <small>${r.r}위/${r.of}</small>` : ''; };
        const wide = (m, f) => [c => c ? f(c) : '–'].map(g => [[g(cs) + (cs ? rk(CT.s, m, cs) : '')], [g(ca) + (ca ? rk(CT.a, m, ca) : '')]])[0];
        const each = (m, f) => [ns.map(n => (cs && cs.me[n] ? f(cs.me[n], cs) : '–') + (cs ? rk(CT.s, m, cs, n) : '')), ns.map(n => (ca && ca.me[n] ? f(ca.me[n], ca) : '–') + (ca ? rk(CT.a, m, ca, n) : ''))];
        const tot = c => ns.reduce((v, n) => v + (c.me[n] ? c.me[n].pts : 0), 0);
        h += section(`콤비 ${esc(ns.join('·'))}`, [
          ['승패', ...wide('win', c => cell(c.wl))],
          ['득실비', ...wide('ratio', c => c.opp ? f3(c.pts / c.opp) : '–')],
          ['평균 득점', ...wide('avg', c => c.wl.n ? `${(c.pts / c.wl.n).toFixed(1)}점` : '–')],
          ['연속득점', ...wide('run', c => c.runs.n ? `${c.runs.w}회/${pct(c.runs.w / c.runs.n)}/${c.runs.w ? f3(c.runPts / c.runs.w) : '–'}` : '–')],
        ]);
        // 여기부터 선수별: 이름 줄(선수 칸 가운데) → 콤비 안 선수별 → 선수 개별 성적
        h += nameRow() + section('콤비 안 선수별', [
          // 기여도 두 줄은 노란 강조로 눈에 띄게 (.now)
          ['기여도 <small>이 콤비</small>', ...each('share', (m, c) => m.n && tot(c) ? `${(m.pts / m.n).toFixed(1)}점/${pct(m.pts / tot(c))}` : '–'), 'now'],
          ['기여도 <small>이 선수, 모든 콤비</small>', ...[['s', TeamApp.sheetContRank(lg)], ['a', TeamApp.sheetContRank(null)]].map(([k, cr]) => ns.map((n, i) => { const o = P[i][k], x = cr[n]; return o.tot ? `${(o.me / (o.perN || 1)).toFixed(1)}점/${pct(o.me / o.tot)}${x ? ` <small>${x.r}위/${x.all}</small>` : ''}` : '–'; })), 'now'],
          ['공격 성공률', ...each('atk', m => m.att ? `${pct(m.succ / m.att)} <small>${m.succ}/${m.att}</small>` : '–')],
        ]);
      }
      const pRow = (l, f) => [l, P.map(o => f(o.s)), P.map(o => f(o.a))];
      const ratioC = o => o.op ? `${f3(o.pt / o.op)} <small>${o.pt}:${o.op}</small>` : '–';
      const bankC = o => o.own ? `${pct(o.bank * 2 / o.own)} <small>${o.bank * 2}점</small>` : '–';
      // 선수 개별 성적: 승률 묶음(시즌 전체 · 이번 라운드 · 단식 · 복식 · 남복 · 여복 · 혼복, 테두리) → 공격 · 초구 · 뱅크샷 · 득실비 · 최근 5경기
      //  이번 세트 종목 줄은 노란 강조 (.now)
      // 단식 에버 · 순위: 같은 종목(남자단식 · 여자단식) 단식 선수 중, 시즌 5세트 · 통산 15세트 이상
      const AV = sheetTipCache['avgrk|' + lg] || (sheetTipCache['avgrk|' + lg] = (() => { const m = { s: {}, a: {} };
        D.games.filter(g => !g.post).forEach(raw => [raw.t1, raw.t2].forEach(side => persp(raw, side).sets.forEach(s => { if (s.players.length !== 1 || !s.inn) return;
          (raw.league === lg ? ['s', 'a'] : ['a']).forEach(k => { const x = m[k][s.players[0]] || (m[k][s.players[0]] = { p: 0, i: 0, n: 0, kind: s.kind }); x.p += s.pts || 0; x.i += s.inn; x.n++; }); }))); return m; })());
      const avgRk = (n, o, k) => { if (!o.oneI) return '–'; const me = AV[k][n], v = o.oneP / o.oneI, min = k === 's' ? 5 : 15;
        const r = me && me.n >= min ? 1 + Object.values(AV[k]).filter(x => x !== me && x.kind === me.kind && x.n >= min && x.p / x.i > v).length : 0;
        return `${f3(v)}${r ? ` <small>(${r}위)</small>` : ''}`; };
      const KN = { 남자단식: 'one', 여자단식: 'one', 남자복식: 'md', 여자복식: 'wd', 혼합복식: 'mix' }[kind] || (solo ? 'one' : '');
      const WR = [['시즌 <small>모든 종목</small>', 'all'], [`라운드 <small>${esc(curRound || '이번')}</small>`, 'rd'], ['단식', 'one'], ['복식', 'dbl'], ['남복', 'md'], ['여복', 'wd'], ['혼복', 'mix']];
      h += group(`선수 개별 성적 <small>이번 시즌(통산)</small>`) + WR.map(([l, k], j) => line(l, P.map(o => k === 'rd' ? cell(o.s.rd) : sa(cell(o.s[k]), cell(o.a[k]))), `wr${j === 0 ? ' wr0' : ''}${j === WR.length - 1 ? ' wr1' : ''}${k === KN ? ' now' : ''}`)).join('')
        + (solo ? line('에버', P.map((o, i) => sa(avgRk(ns[i], o.s, 's'), avgRk(ns[i], o.a, 'a')))) : '')
        + [['공격 성공률', o => o.dA ? `${pct(o.dS / o.dA)} <small>${o.dS}/${o.dA}</small>` : '–'], ['초구 성공률', o => cell(o.fbD)], ['뱅크샷 득점비', bankC], [`득실비${solo ? '' : ' <small>복식은 팀 점수</small>'}`, ratioC]]
          .map(([l, f]) => line(l, P.map(o => sa(f(o.s), f(o.a))))).join('');
      h += `<tr><td class="tl">최근 5경기 <small>시즌</small></td>${P.map((o, i) => `<td class="${pair ? 'pc' + (i ? ' p2' : '') : 'pv'}" colspan="4">${o.recent.length ? seqHtml(o.recent.slice(-5).map(win => ({ win }))) : '–'}</td>`).join('')}</tr>`;
      return (sheetTipCache[key] = h + '</tbody></table>');
    },
    // 기록지 오더 고치기: 그 시즌 그 팀 선수 (홈피 명단 + 명단에 없이 나온 선수) [{ name, gender }]
    sheetRoster: (code, lg) => D && code ? rosterOf(code, lg, gamesOf(code, g => g.league === lg)).map(p => ({ name: p.name, gender: p.gender })) : [],
    // 기록지: 그 세트 종목 (오더에 없을 때)
    sheetSetKind: (c0, c1, lg, setNo) => { if (!D || !c0 || !c1) return ''; const PS = [periods(c0, lg), periods(c1, lg)]; return mainKindOf(PS[0].all)(setNo) || mainKindOf(PS[1].all)(setNo) || ''; },
    // 기록지 브리핑 추가 정보 ① 경기 시작: 그날 뱅킹 주자의 시즌/통산 뱅킹 승률 (복식이면 콤비 기록도). 수치 앞 = 시즌 순위, 뒤 = 통산 순위
    sheetBankInfo: (names, banker, lg) => {
      if (!D || !names || !names.length || !banker) return '';
      const n = canonName(banker), ns = names.map(canonName), B = sheetEnt(lg).B, z = { s: { w: 0, n: 0 }, a: { w: 0, n: 0 } };
      const me = B['p|' + n] || z, co = B['c|' + comboKey(ns)] || z, pool = p => Object.keys(B).filter(k => k.startsWith(p)).map(k => B[k]);
      const rk = (x, p) => ['s', 'a'].map(sc => rankIn(pool(p), x, sc, rt2, cn));
      return xtHead(`뱅킹 주자 ${esc(n)}`) + xtChip(`뱅킹 승률 ${esc(n)}`, me.s, me.a, true, rk(me, 'p|')) + (ns.length === 2 ? xtChip('뱅킹 승률 콤비', co.s, co.a, true, rk(co, 'c|')) : '');
    },
    // ② 선공 입력 뒤: 초구 성공률은 치는 선수 개인, 나머지는 단식이면 그 선수 · 복식이면 그 콤비. ny = 지금 가장 새로운 정보인지
    //  seq = 지금까지 팀 세트 결과 순서: 'a:b 초구 성공률' 아래 '패승' 줄 (3세트부터, 이름 회색 · 들여쓰기)
    sheetFirstInfo: (names, shooter, lg, ny, sc, p = 0, seq = '') => {
      if (!D || !names || !names.length || !shooter) return '';
      const solo = names.length < 2, n = canonName(shooter), EN = sheetEnt(lg), ns = names.map(canonName);
      const me = EN.E[(solo ? '1|' : '2|') + comboKey(ns)], pool = kindPool(EN.E, me, solo), S2 = me ? me.s : entBlank(), A = me ? me.a : entBlank();
      const fm = EN.F[(solo ? '1|' : '2|') + n], fpool = Object.values(EN.F).filter(x => x.solo === solo);
      const rk = (val, cnt, mins) => ['s', 'a'].map(sc => rankIn(pool, me, sc, val, cnt, mins));
      const fbAvg = x => x.fbN ? x.fbP / x.fbN : null, fbCnt = x => x.fbN, multi = x => ({ w: x.fbM, n: x.fbN });
      const avgR = rk(fbAvg, fbCnt, FB_MIN), avgV = x => x.fbN ? f3(x.fbP / x.fbN) : '–';
      const ek = (solo ? '1|' : '2|') + comboKey(ns), c = (l, k) => xtChip(l, S2[k], A[k], ny, rk(x => rt2(x[k]), x => cn(x[k]), FB_KEYS.has(k) ? FB_MIN : undefined), `${ek}~${k}~${lg}~${l}`);
      // 세트 스코어별 초구 성공률 (그 선수가 직접 친 초구, 지금 세트 스코어 sc). 순위는 같은 스코어 · 시즌 3번 · 통산 5번 이상
      const scS = sc && fm ? fm.st.s[sc] : null, scA = sc && fm ? fm.st.a[sc] : null;
      const at = x => ({ s: x.st.s[sc], a: x.st.a[sc] }), spool = fpool.map(at), sme = fm ? at(fm) : null; if (sme) spool[fpool.indexOf(fm)] = sme;
      const scChip = sc ? xtChip(`${sc} 초구 성공률`, scS, scA, ny, ['s', 'a'].map(k2 => rankIn(spool, sme, k2, rt2, cn)), `${(solo ? '1|' : '2|') + n}~Fst:${sc}~${lg}~${sc} 초구 성공률`) : '';
      const pk = seq && seq.length > 1 ? seq : '';
      const atp = x => ({ s: x.sq.s[pk], a: x.sq.a[pk] }), ppool = fpool.map(atp), pme = fm ? atp(fm) : null; if (pme) ppool[fpool.indexOf(fm)] = pme;
      const pathChip = pk ? xtChip(seqH(seq), pme && pme.s, pme && pme.a, ny, ['s', 'a'].map(k2 => rankIn(ppool, pme, k2, rt2, cn))).replace('<span class="ti xt', '<span class="ti xt fbp') : '';
      // 묶음 두 개: 초구(성공률 · 스코어별 · 흐름별 · 에버 · 다득률), 초구 뒤 승률(초성 · 초실 · 초3+ · 선공 세트)
      return grp([xtChip('초구 성공률', fm && fm.s, fm && fm.a, ny, ['s', 'a'].map(sc => rankIn(fpool, fm, sc, rt2, cn)), `${(solo ? '1|' : '2|') + n}~F~${lg}~초구 성공률`), scChip, pathChip,
        `<span class="ti xt${ny ? ' ny' : ''}" data-xtt="${esc(`${ek}~avg~${lg}~초구 에버`)}"><small>초구 에버</small><b>${xtVal(avgV(S2), avgV(A), avgR)}</b><i>${S2.fbN} / ${A.fbN}회</i></span>`,
        xtChip('초구 다득률', multi(S2), multi(A), ny, rk(x => rt2(multi(x)), fbCnt, FB_MIN), `${ek}~multi~${lg}~초구 다득률`)], 'gfb', 'gfb' + p)
        + grp([c('초성 승률', 'fbOk'), c('초실 승률', 'fbMiss'), c('초3+ 승률', 'fb3'), c('선공 세트 승률', 'fst')], 'gwr', 'gwr' + p);
    },
    sheetSecondInfo: (names, lg, ny, p = 0) => {
      if (!D || !names || !names.length) return '';
      const solo = names.length < 2, EN = sheetEnt(lg), ns = names.map(canonName), me = EN.E[(solo ? '1|' : '2|') + comboKey(ns)], pool = kindPool(EN.E, me, solo);
      const S2 = me ? me.s : entBlank(), A = me ? me.a : entBlank(), ek = (solo ? '1|' : '2|') + comboKey(ns), c = (l, k) => xtChip(l, S2[k], A[k], ny, ['s', 'a'].map(sc => rankIn(pool, me, sc, x => rt2(x[k]), x => cn(x[k]), FB_KEYS.has(k) ? FB_MIN : undefined)), `${ek}~${k}~${lg}~${l.replace(/<[^>]*>/g, '')}`);
      return grp([c('상대 초성 승률', 'ofbOk'), c('상대 초실 승률', 'ofbMiss'), c('초3+ 허용 승률', 'al3'), c('후공 세트 승률', 'snd')], 'gwr', 'gwr' + p);
    },
    // 이닝 위 라이브 정보 { ratio, state }. ratio = 우세(시즌%/통산%) 박빙(…) 열세(…) 한 줄 (세트 흐름 양상), state = 지금 점수 상황의 승률(결과) · 클러치 승률
    //  st = 'tie' 박빙 | 'up' 우세 | 'dn' 열세, cl = 두 팀 다 클러치. 우세 · 열세 = 먼저 N점(남자 5 · 여자 · 혼복 3) 앞선 · 뒤진 세트, 박빙 = 끝까지 N점 차가 나지 않은 세트
    sheetTiming: (names, lg, st, cl, fresh) => {
      if (!D || !names || !names.length) return { ratio: '', state: '' };
      const sd = sheetSide(names, lg), S2 = sd.s, A = sd.a;
      const lv = (l, v, sub, ny, tip = '') => `<span class="lv${ny ? ' ny' : ''}"${tip ? ` data-stip="${esc(tip)}"` : ''}><small>${l}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</span>`;
      // 커서 말풍선: 우세 · 박빙 · 열세 = 그런 세트가 몇 번이었고(비율) 그 세트의 승패 · 승률, 이번 시즌 · 통산
      const DESC = { keep: '이닝과 상관없이 점수로 먼저 리드 점수(남자 5 · 여자 · 혼복 3점) 이상 앞선 세트', tie: '끝까지 리드 점수 차가 나지 않은 세트', back: '이닝과 상관없이 점수로 먼저 리드 점수 이상 뒤진 세트', cl: '이닝과 상관없이 둘 다 목표 점수까지 남자 5 · 여자 · 혼복 4점 이내로 남은 채 이어진 세트' };
      const tipOf = (l, k) => { const row = (lab, x) => { const T = x.tie.n + x.keep.n + x.back.n, y = x[k]; return `<tr><td>${lab}</td><td>${k === 'cl' ? '' : `<b>${y.n}</b>/${T}세트 (${T ? Math.round(y.n / T * 100) : 0}%) · `}${y.n ? `${y.w}승 ${y.n - y.w}패 <b>${pct(y.w / y.n)}</b>` : '기록 없음'}</td></tr>`; };
        return `<div class="rkh0">${l} <small>${DESC[k]}</small></div><table class="rdtip">${row('이번 시즌', S2)}${row('통산', A)}</table>`; };
      const r2 = x => x && x.n ? pct(x.w / x.n) : '–', d2 = x => x && x.n ? `${x.w}-${x.n - x.w}` : '–';
      // 라이브 정보 값: 이번 시즌은 노란 글씨, 통산은 흰 글씨. ny(노란 테두리)는 첫 이닝이 끝나기 전에만
      const sa = (s, a) => `<span class="vs">${s}</span> / <span class="va">${a}</span>`;
      const wr = (l, k) => lv(l, sa(r2(S2[k]), r2(A[k])), `${d2(S2[k])} / ${d2(A[k])}`, fresh, tipOf(l.replace(' 승률', ''), k));
      const tot = x => x.tie.n + x.keep.n + x.back.n, r0 = (x, k) => tot(x) ? `${Math.round(x[k].n / tot(x) * 100)}%` : '–';
      const part = (l, k) => `${l}(${sa(r0(S2, k), r0(A, k))})`;
      return {
        // 윗줄: 지금 상황(우세 · 박빙 · 열세) 칸만 노란 강조(.on), 나머지는 흰색
        ratio: `<span class="tsr rt">${[['우세', 'keep'], ['박빙', 'tie'], ['열세', 'back']].map(([l, k]) => `<span class="lv${k === { up: 'keep', dn: 'back' }[st] || (st === 'tie' && k === 'tie') ? ' on' : ''}" data-stip="${esc(tipOf(l, k))}"><b>${part(l, k)}</b></span>`).join('')}</span>`,
        // 맨 아랫줄: 끝내기 장타(마지막 이닝 5점 이상 연속 득점으로 끝냄)를 친 순간의 점수 차로 나눈 비율 — 우세(3점 이상 앞섬) · 박빙(±2점) · 열세(3점 이상 뒤짐), 커서 = 횟수
        f5: `<span class="tsr f5r">${[['우세', 'keep'], ['박빙', 'tie'], ['열세', 'back']].map(([l, k]) => { const tot = x => x.f5.keep + x.f5.tie + x.f5.back, f = (x, kk) => tot(x) ? `${Math.round(x.f5[kk] / tot(x) * 100)}%` : '–', how = { keep: '3점 이상 앞선 상태', tie: '±2점 차', back: '3점 이상 뒤진 상태' }[k], tip = `<div class="rkh0">끝내기 장타 · ${l} <small>${how}에서 친 끝내기 장타 / 전체 끝내기 장타</small></div><table class="rdtip"><tr><td>이번 시즌</td><td><b>${S2.f5[k]}회</b> / ${tot(S2)}회</td></tr><tr><td>통산</td><td><b>${A.f5[k]}회</b> / ${tot(A)}회</td></tr></table>`; return `<span class="lv${fresh ? ' ny' : ''}" data-stip="${esc(tip)}"><b>${l}(${sa(f(S2, k), f(A, k))})</b></span>`; }).join('')}</span>`,
        state: (st === 'up' ? wr('우세 승률', 'keep') : st === 'dn' ? wr('열세 승률', 'back') : wr('박빙 승률', 'tie')) + (cl ? wr('클러치 승률', 'cl') : ''),
      };
    },
    // 기록지 이름 옆: 지금 세트 스코어(a:b)에서의 승률 · 앞 세트 스코어(pa:pb)에서 지금 스코어가 됐을 때의 승률. 그 선수 · 콤비, 이번 시즌(통산), 앞 = 시즌 순위 · 뒤 = 통산 순위
    // 기록지 선수 이름 옆: 그 선수(콤비)의 이번 세트 번호 승률. 시즌 순위 · 시즌 승률 · 승패(통산 승률 · 승패) · 통산 순위
    sheetSetNoInfo: (names, lg, no, ny, btn, open) => {
      if (!D || !names || !names.length || !no) return '';
      const solo = names.length < 2, EN = sheetEnt(lg), me = EN.E[(solo ? '1|' : '2|') + comboKey(names.map(canonName))], pool = kindPool(EN.E, me, solo);
      const rk = ['s', 'a'].map(sc => rankIn(pool, me, sc, x => rt2(x.no[no]), x => cn(x.no[no])));
      return frRow(`${no}세트 승률`, me && me.s.no[no], me && me.a.no[no], rk, ny, btn ? `<small class="flb${open ? ' on' : ''}" data-flt="${btn}">${no}세트 승률 <span class="dni"></span></small>` : '', '', `${(solo ? '1|' : '2|') + comboKey(names.map(canonName))}~no:${no}~${lg}~${no}세트 승률`);
    },
    sheetStateInfo: (names, lg, a, b, seq, ny) => {
      if (!D || !names || !names.length) return '';
      const solo = names.length < 2, EN = sheetEnt(lg), me = EN.E[(solo ? '1|' : '2|') + comboKey(names.map(canonName))], pool = kindPool(EN.E, me, solo);
      const line = (l, m, k, cls = '', tt = `${l} → ${a}:${b} 세트 승률`) => frRow(l, me && me.s[m][k], me && me.a[m][k], ['s', 'a'].map(sc => rankIn(pool, me, sc, x => rt2(x[m][k]), x => cn(x[m][k]))), ny, '', cls, `${(solo ? '1|' : '2|') + comboKey(names.map(canonName))}~${m}:${k}~${lg}~${tt}`);
      // 'N세트 승률' 버튼 아래: 지금 스코어가 된 두 길(실제 길이 윗줄, 강조). 접으면 숨김 .frx
      // 펼친 줄 = 그 길로 지금 스코어가 된 뒤 이 선수(콤비)가 친 세트 승률 (tr)
      // N세트 승률(sheetSetNoInfo, 버튼) 아래: 지금 스코어로 시작한 세트 승률 (st), 그 아래 접는 두 길
      return a + b ? line(`${a}:${b} 세트 승률`, 'st', `${a}:${b}`, '', `${a}:${b} 세트 승률`) + (seq.length > 1 ? line(seqH(seq), 'sq', seq, ' frx now', `${seq} 뒤 세트 승률`) : '') : '';
    },
    // 상단 일정에서 경기를 누르면: 왼쪽 · 오른쪽 칸에 두 팀 (그 시즌)
    selectPair: (a, b, lg) => { if (!D) return; panes.a.league = lg; panes.a.code = a; panes.b.league = lg; panes.b.code = b; panes.a.render(); panes.b.render(); saveTeamHash(); renderTeamH2H(); },
    setBroadcast: setTeamBroadcast,
    // 방송 요약 별도 창: 본 창에서 고른 팀을 따라간다 (k = 'ta' | 'tb', v = '리그:팀코드')
    pick(k, v) { const p = panes[k === 'ta' ? 'a' : 'b']; if (!D || !p || !v) return; const [l, c] = v.split(':'); if (p.league === +l && p.code === c) return; p.league = +l; p.code = c; p.render(); renderTeamH2H(); },
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
