// 캐스터 앱 영역 캡쳐 (맥 앱에서만): 찍은 그림은 클립보드로 → 다른 앱에 ⌘V
//   ⌘C  커서가 있는 칩·항목 (바로 다시 누르면 한 단계 위 항목)   글자를 골라 놓았거나 입력칸에서는 원래 복사
//   ⌘1 / ⌘2  지금 보이는 1번 / 2번 선수(팀) 영역 전체
//   ⌘A  지금 앱 화면 전체   입력칸에서는 원래 전체 선택
//   찍은 그림은 /Users/당구/캡쳐 폴더에도 PNG 로 저장 (맥 앱이 저장)
(() => {
  if (!new URLSearchParams(location.search).has('caster')) return;
  if (!(window.webkit && webkit.messageHandlers && webkit.messageHandlers.pba)) return;
  let mx = -1, my = -1, last = null;   // last: 바로 전 ⌘C 로 찍은 항목 (다시 누르면 그 위 항목)
  addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, true);

  // 항목 상자: 배경 · 테두리 · 둥근 모서리가 있거나 표 · 카드
  const isBox = n => {
    if (n.matches('td, th, tr, tbody, thead')) return false;
    const r = n.getBoundingClientRect(); if (r.width < 14 || r.height < 12) return false;
    if (n.matches('table, .card, .sec, .kpi, .tile')) return true;
    const s = getComputedStyle(n), bg = s.backgroundColor;
    return (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderRadius) > 0 || s.boxShadow !== 'none';
  };
  const TOP = '.pane, #bc, #tbc, #board, #sheet, body';
  const boxAbove = n => { for (n = n && n.parentElement; n && n !== document.body; n = n.parentElement) { if (isBox(n)) return n; if (n.matches(TOP)) return n; } return null; };
  const boxAt = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { if (n.matches(TOP) || isBox(n)) return n; } return null; };

  // 보이는 부분만: 화면 · 스크롤 칸 밖은 잘라낸다
  const visRect = el => {
    let { left: l, top: t, right: r, bottom: b } = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p); if (!/(auto|scroll|hidden)/.test(s.overflow + s.overflowY + s.overflowX)) continue;
      const q = p.getBoundingClientRect(); l = Math.max(l, q.left); t = Math.max(t, q.top); r = Math.min(r, q.right); b = Math.min(b, q.bottom);
    }
    l = Math.max(l, 0); t = Math.max(t, 0); r = Math.min(r, innerWidth); b = Math.min(b, innerHeight);
    return r - l >= 4 && b - t >= 4 ? { l, t, w: r - l, h: b - t } : null;
  };

  let tip, tipT;
  const say = (msg, rc) => {
    if (!tip) { tip = document.createElement('div'); tip.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:rgba(20,24,30,.92);color:#fff;font:600 13px -apple-system,sans-serif;padding:8px 14px;border-radius:8px;pointer-events:none;white-space:nowrap'; document.body.appendChild(tip); }
    tip.textContent = msg; tip.hidden = false;
    if (rc) { const f = document.createElement('div'); f.style.cssText = `position:fixed;left:${rc.l}px;top:${rc.t}px;width:${rc.w}px;height:${rc.h}px;z-index:99998;outline:2px solid #4aa3ff;outline-offset:-2px;background:rgba(74,163,255,.12);pointer-events:none;transition:opacity .5s`; document.body.appendChild(f); setTimeout(() => { f.style.opacity = '0'; }, 250); setTimeout(() => f.remove(), 800); }
    clearTimeout(tipT); tipT = setTimeout(() => { tip.hidden = true; }, 1400);
  };

  let busy = false;
  const shoot = (rc, label, fname) => {   // fname: 저장 파일 이름 (당구/캡쳐 폴더, 앞에 날짜·시각)
    if (!rc) { say('찍을 영역이 화면에 없습니다'); return; }
    if (busy) return; busy = true;
    if (tip) tip.hidden = true;
    document.body.classList.add('capshot');   // 마우스 올림 표시가 그림에 찍히지 않게
    window.pbaCapDone = ok => { busy = false; document.body.classList.remove('capshot'); say(ok ? `📋 ${label} 복사 · 캡쳐 폴더에 저장됨` : '캡쳐하지 못했습니다', ok ? rc : null); };
    requestAnimationFrame(() => webkit.messageHandlers.pba.postMessage(`cap:${[rc.l, rc.t, rc.w, rc.h, innerWidth].map(v => Math.round(v * 100) / 100).join(',')}|${fname || label}`));
    setTimeout(() => { if (busy) window.pbaCapDone(false); }, 4000);
  };

  const paneOf = k => {
    const id = document.body.classList.contains('teammode') ? `#tpane${k}` : `#pane${k}`;
    const p = document.querySelector(id); return p && p.offsetParent ? p : null;
  };

  document.addEventListener('keydown', e => {
    if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return;
    const k = e.code === 'KeyC' ? 'c' : e.code === 'KeyA' ? 'a' : /^(Digit|Numpad)[12]$/.test(e.code) ? e.code.slice(-1) : null;
    if (!k) return;
    const typing = e.target.closest && e.target.closest('input, select, textarea, [contenteditable]');
    if (k === 'c') {
      const sel = getSelection(); if (typing || (sel && !sel.isCollapsed && String(sel).trim())) return;   // 글자 복사는 그대로
      const at = document.elementFromPoint(mx, my); if (!at) return;
      e.preventDefault();
      // 같은 자리에서 바로 다시 누르면 한 단계 위 항목
      let box = last && Date.now() - last.t < 2500 && last.x === mx && last.y === my && last.el.isConnected ? boxAbove(last.el) : boxAt(at);
      if (!box) box = boxAt(at);
      last = { el: box, t: Date.now(), x: mx, y: my };
      shoot(box === document.body ? visRect(document.documentElement) : visRect(box), '항목');
      return;
    }
    if (k === 'a') { if (typing) return; e.preventDefault(); shoot({ l: 0, t: 0, w: innerWidth, h: innerHeight }, '화면 전체'); return; }
    e.preventDefault();
    const p = paneOf(k === '1' ? 'A' : 'B');
    const who = p && p.querySelector('h2'), lab = `${k}번 ${document.body.classList.contains('teammode') ? '팀' : '선수'} 영역`;
    shoot(p && visRect(p), lab, who ? `${lab} ${who.textContent.trim()}` : lab);
  }, true);
})();
