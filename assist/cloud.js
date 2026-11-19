/* 云端 OFP：存在你的 GitHub 私有仓库（flight-box/ofpdata，不公开）。
   · 这台 iPad 读到新 OFP（邮箱、文件……）→ 原文上传一份；
   · 有网时自动看云端，接下来 48 小时的 OFP 这台还没有 → 直接下载原文（几秒，不用下 PDF、不用再解析 PDF），AI 解读也一起下载。
   用主页面的全局：S, OFP, OFL, clockUrl, toast, th */
(function () {
  'use strict';
  const lsGet = k => { try { return localStorage.getItem('fa.' + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem('fa.' + k, v); } catch (e) {} };
  const GH = () => ({ tok: lsGet('ghtok') || '', repo: lsGet('ghrepo') || 'chunhua1780/flight-box' });
  const keyOf = o => (o.flight.no + o.flight.date).replace(/[^\w.-]/g, '');
  async function gh(path) {
    const g = GH(); if (!g.tok) return null;
    const r = await fetch('https://api.github.com/repos/' + g.repo + '/contents/' + path + '?_=' + Date.now(), { headers: { Authorization: 'Bearer ' + g.tok, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    return r.ok ? r : null;
  }
  const gunzip = async u8 => new TextDecoder().decode(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());

  // 上传：这份 OFP 云端还没有（或原文长度不同）就传
  async function upload(text, o) {
    if (!navigator.onLine || !lsGet('key') || !o || !o.ok || !text) return;
    const k = keyOf(o); if (lsGet('cloud.' + k) === String(text.length)) return;
    try {
      const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'ofpsave', k, text,
        meta: { no: o.flight.no, date: o.flight.date, dep: o.flight.dep, arr: o.flight.arr, depI: o.flight.depIata, arrI: o.flight.arrIata, std: o.times.std, trip: o.times.trip, cs: o.flight.cs || '', reg: o.flight.reg || '' },
        nt: [].concat.apply([], Object.keys(o.notams || {}).map(c => o.notams[c].map(n => [n.id, typeof NX === 'object' && NX.en ? NX.en(n.text) : n.text]))).filter((n, i, A) => A.findIndex(m => m[0] === n[0]) === i) }) });   // 通告清单：后台马上开始翻译
      const j = JSON.parse(await r.text()); if (j.ok) lsSet('cloud.' + k, String(text.length));
    } catch (e) {}
  }
  // 下载：接下来 48 小时（和 12 小时前到现在）的 OFP
  let busy = false;
  async function sync(quiet) {
    if (busy || !navigator.onLine || typeof DecompressionStream === 'undefined') return 0; busy = true; let got = 0;
    try {
      const r = await gh('ofpdata/index.json'); if (!r) return 0;
      const idx = await r.json(), now = Date.now(), have = new Set((await OFL.all()).map(e => (e.no + e.date).replace(/[^\w.-]/g, '')));
      for (const x of idx) {
        const m = x.meta || {}; if (!m.std || m.std < now - 3 * 864e5 || m.std > now + 48 * 36e5) continue;   // 3 天内的都下载（往返两段、演示）
        if (!have.has(x.k)) {
          const f = await gh('ofpdata/' + x.k + '.txt.gz'); if (!f) continue;
          const text = await gunzip(new Uint8Array(await f.arrayBuffer())); const o = OFP.parse(text); if (!o.ok) continue;
          await OFL.save(text, 'cloud', 'cloud:' + x.k, o); lsSet('cloud.' + x.k, String(text.length)); got++;
        }
        if (x.brief && !lsGet('aib.' + (m.no || '') + (m.date || '')) && m.no) {
          const b = await gh('ofpdata/' + x.k + '.brief.json');
          if (b) { const d = await b.json(); lsSet('aib.' + m.no + m.date, JSON.stringify({ ver: 4, t: d.t, items: d.items || [], dropped: 0, cloud: 1 })); }
        }
      }
      // 共享状态：手机上改的 ATD（最新的赢）
      try { if (S.ofp && !S.demo) { const k = keyOf(S.ofp), x = idx.find(e => e.k === k);
        if (x && x.st && +(lsGet('stn.' + k) || 0) < x.st) { const r3 = await gh('ofpdata/' + k + '.st.json'); if (r3) { const st = await r3.json(); lsSet('stn.' + k, String(x.st));
          if (st.u && (st.u.atd || 0) > +(lsGet('stu.atd.' + k) || 0)) { lsSet('stu.atd.' + k, String(st.u.atd)); if ((st.atd || null) !== (S.atd || null) && typeof setATD === 'function') { setATD(st.atd || null, true); toast('☁️ ' + th('ATD 已按其它设备更新：', 'ATD updated from another device: ') + (st.atd ? hmZ(st.atd) + 'Z' : '—'), 4000); } } } } } } catch (e) {}
      // 当前这份 OFP 的通告译文（云端已经翻好的）：合进来，就不用再翻
      try { if (S.ofp) { const k = keyOf(S.ofp), x = idx.find(e => e.k === k);
        if (x && x.tr && +(lsGet('cloudtr.' + k) || 0) < x.tr) { const r2 = await gh('ofpdata/' + k + '.tr.json'); if (r2) { const m = await r2.json(); if (typeof TR === 'object') { Object.assign(TR, m); lsSet('tr', JSON.stringify(TR)); } lsSet('cloudtr.' + k, String(x.tr)); } } } } catch (e) {}
      if (got) { if (!quiet) toast('☁️ ' + th('从云端收到 ' + got + ' 份 OFP', got + ' OFP(s) from the cloud'), 3000); try { await OFL.auto(); } catch (e) {} }
    } catch (e) {}
    finally { busy = false; }
    return got;
  }
  // 简洁版简报（Today Brief）：这台 iPad 生成一份网页传到云端，手机 Panel 下载显示
  async function sbUp(force) {
    if (!navigator.onLine || !lsGet('key') || !S.ofp || typeof briefOne !== 'function') return;
    const k = keyOf(S.ofp); if (!force && Date.now() - +(lsGet('sbup.' + k) || 0) < 30 * 60e3) return;
    let body = ''; try { body = briefOne(); } catch (e) { return; }
    let css = ''; try { [].forEach.call(document.styleSheets, sh => { try { [].forEach.call(sh.cssRules, r => { if (r.selectorText && /#brief/.test(r.selectorText)) css += r.cssText.replace(/#brief /g, '') + '\n'; }); } catch (e) {} }); } catch (e) {}
    const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:12.5px/1.5 -apple-system,"Noto Sans SC",sans-serif;color:#111;background:#fff;margin:10px}table{border-collapse:collapse;width:100%}' + css + '.note{display:none}.pg{margin:0!important;padding:8px!important;box-shadow:none!important;max-width:none!important}</style></head><body><div class="pg one">' + body + '</div></body></html>';
    try { const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'sbsave', k, html }) }); const j = JSON.parse(await r.text()); if (j.ok) lsSet('sbup.' + k, String(Date.now())); } catch (e) {}
  }
  // 共享状态：这台改了 ATD → 马上传（没网先存着，有网再传）
  async function stPut(set) {
    if (!S.ofp) return; const k = keyOf(S.ofp), t = Date.now(); Object.keys(set).forEach(f => lsSet('stu.' + f + '.' + k, String(t)));
    let q = {}; try { q = JSON.parse(lsGet('stq') || '{}'); } catch (e) {} q[k] = Object.assign(q[k] || {}, set, { _t: t }); lsSet('stq', JSON.stringify(q)); stFlush();
  }
  async function stFlush() {
    if (!navigator.onLine || !lsGet('key')) return; let q = {}; try { q = JSON.parse(lsGet('stq') || '{}'); } catch (e) {}
    for (const k of Object.keys(q)) { const set = Object.assign({}, q[k]), t = set._t; delete set._t;
      try { const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'stput', k, set, t }) }); const j = JSON.parse(await r.text()); if (j.ok) { delete q[k]; lsSet('stq', JSON.stringify(q)); } } catch (e) {} }
  }
  window.CLOUD = { upload, sync, sbUp, stPut };
  window.addEventListener('online', () => { stFlush(); sync(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) { stFlush(); sync(true); } });   // 一打开就同步
  setTimeout(() => sync(true), 2500);
  setInterval(() => { if (navigator.onLine) { stFlush(); sync(false); } }, 2 * 60e3);   // 有网：每 2 分钟看一次云端，有新的就提示
})();
