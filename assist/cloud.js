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
        meta: { no: o.flight.no, date: o.flight.date, dep: o.flight.dep, arr: o.flight.arr, depI: o.flight.depIata, arrI: o.flight.arrIata, std: o.times.std, trip: o.times.trip, cs: o.flight.cs || '' } }) });
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
        const m = x.meta || {}; if (!m.std || m.std < now - 12 * 36e5 || m.std > now + 48 * 36e5) continue;
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
      // 当前这份 OFP 的通告译文（云端已经翻好的）：合进来，就不用再翻
      try { if (S.ofp) { const k = keyOf(S.ofp), x = idx.find(e => e.k === k);
        if (x && x.tr && +(lsGet('cloudtr.' + k) || 0) < x.tr) { const r2 = await gh('ofpdata/' + k + '.tr.json'); if (r2) { const m = await r2.json(); if (typeof TR === 'object') { Object.assign(TR, m); lsSet('tr', JSON.stringify(TR)); } lsSet('cloudtr.' + k, String(x.tr)); } } } } catch (e) {}
      if (got) { if (!quiet) toast('☁️ ' + th('从云端收到 ' + got + ' 份 OFP', got + ' OFP(s) from the cloud'), 3000); try { await OFL.auto(); } catch (e) {} }
    } catch (e) {}
    finally { busy = false; }
    return got;
  }
  window.CLOUD = { upload, sync };
  window.addEventListener('online', () => sync(true));
  setTimeout(() => sync(true), 2500);
  setInterval(() => sync(true), 15 * 60e3);
})();
