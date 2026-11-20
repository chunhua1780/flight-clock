/* 途经国家的空域应急程序（Worldwide Airspace Contingency Flashcards）
   资料是公司的（LIDO / OM-C），不放在公开网站：有网时用口令从时钟后台取一次，存在这台 iPad 上，离线可用。
   用主页面的全局：S, lsGet, lsSet, clockUrl, th, thb, tt, esc, hmZ, toast, firLegs, LANG */
(function () {
  'use strict';
  let D = null, ZH = {};
  try { D = JSON.parse(localStorage.getItem('fa.wac') || 'null'); } catch (e) {}
  try { ZH = JSON.parse(localStorage.getItem('fa.waczh') || '{}'); } catch (e) {}
  // 「说人话」的中文（后台 AI 翻，按 国家名|标题 存；地区卡是 R:地区名|标题）
  let Z2 = {}; try { Z2 = JSON.parse(localStorage.getItem('fa.wacz2') || '{}'); } catch (e) {}
  const save = () => { try { localStorage.setItem('fa.wac', JSON.stringify(D)); } catch (e) {} };
  const TOPZ = { 'Weather avoidance': '天气绕飞', 'Emergency navigation': '紧急导航（偏置 / 改航）', 'Communication failure': '通讯失效', 'ATS service disruption': 'ATS 服务中断' };
  const STZ = { R: ['已核对', 'Reviewed'], F: ['仅有出处', 'Reference'], U: ['未核对', 'Unverified'] };
  const REGZ = { 'Africa and Indian Ocean': '非洲和印度洋', 'Caribbean': '加勒比', 'Europe / SERA': '欧洲 / SERA', 'Middle East / Asia': '中东 / 亚洲', 'North America': '北美', 'North Atlantic': '北大西洋', 'Pacific': '太平洋', 'Polar': '极地', 'South America / South Atlantic': '南美 / 南大西洋', 'General': '通用' };

  // ---------- 取资料（有网 + 有口令） ----------
  let busy = false;
  async function load(force) {
    if (busy || !navigator.onLine || !lsGet('key')) return;
    if (D && !force && Date.now() - (D.got || 0) < 7 * 864e5) return;
    busy = true;
    try {
      const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'wac' }) });
      const j = JSON.parse(await r.text());
      if (j.ok && j.d) { D = typeof j.d === 'string' ? JSON.parse(j.d) : j.d; D.got = Date.now(); save(); translate(); }
    } catch (e) {}
    busy = false;
  }
  // 中文：后台用 AI 翻成简单明了的中文（只翻这条航线经过的国家和地区卡），翻好存起来，离线也能看
  let zbusy = false;
  function routeNames() { if (!D || !S.ofp) return []; const o = S.ofp, codes = [o.flight.dep, o.flight.arr].concat(firLegs().map(l => l.code)), n = new Set();
    codes.forEach(c => country(c).forEach(x => n.add(x.n))); regionsFor(codes, Object.values(o.fixes || {})).concat(['General']).forEach(r => n.add('R:' + r)); return [...n]; }
  async function translate(names, tries) {
    if (!D || !navigator.onLine || !lsGet('key') || zbusy) return; names = names || routeNames(); if (!names.length) return; zbusy = true; let left = 0;
    try { const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'waczh', names }) });
      const j = JSON.parse(await r.text()); if (j.ok) { Object.assign(Z2, j.zh || {}); localStorage.setItem('fa.wacz2', JSON.stringify(Z2)); left = j.left || 0; if (document.getElementById('wacov')) route(); } } catch (e) {}
    zbusy = false; if (left && (tries || 0) < 8) setTimeout(() => translate(names, (tries || 0) + 1), 15000);   // 还没翻完：过一会儿接着翻
  }
  const zk = (k, x) => { const z = Z2[k]; return z ? '<span style="white-space:pre-line">' + thb(esc(z.x), esc(x)) + '</span>' : (LANG !== 'en' ? '<span style="color:var(--dim);font-size:11.5px">' + tt('（中文还在翻译，有网时自动补上）', '(translating…)') + '</span><br>' : '') + esc(x); };
  const zh = (k, h) => { const z = Z2[k]; return z && z.h ? th(esc(z.h), esc(h)) : null; };
  async function translateOld() {
    if (!D || !navigator.onLine || !lsGet('key')) return;
    const all = [];
    D.c.forEach(c => c.t.forEach(t => { if (t.x && !ZH[t.x]) all.push(t.x); }));
    D.r.forEach(r => r.sec.forEach(s => { if (s.x && !ZH[s.x]) all.push(s.x); }));
    for (let i = 0; i < all.length; i += 30) {
      const part = all.slice(i, i + 30);
      try { const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'translate', texts: part, to: 'zh-CN' }) });
        const j = JSON.parse(await r.text()); if (!j.ok) return; j.out.forEach((t, k) => { if (t) ZH[part[k]] = t; });
        localStorage.setItem('fa.waczh', JSON.stringify(ZH)); } catch (e) { return; }
    }
  }
  const tx = x => thb(esc(ZH[x] || x), esc(x));

  // ---------- ICAO 前缀 → 国家 ----------
  // 「VA/E/I/O」= VA VE VI VO；「K/NS/PA/F/G」= K NS PA PF PG；单独一个字母 = 整个字母（K 美国、C 加拿大、Y 澳大利亚）
  function expand(list) {
    const out = []; let base = '';
    list.forEach(p => String(p).split('/').forEach(tok => {
      const m = /\b([A-Z]{1,2})\b/.exec(tok.trim()); if (!m) return; const t = m[1];
      if (t.length === 2) { out.push(t); base = t[0]; }
      else if (base && out.length) out.push(base + t);
      else { out.push(t); base = ''; }
    }));
    return out;
  }
  let PX = null;
  function country(code) {
    if (!D || !code) return null;
    if (!PX) { PX = []; D.c.forEach(c => expand(c.px).forEach(p => PX.push([p, c]))); PX.sort((a, b) => b[0].length - a[0].length); }
    const hit = PX.find(p => code.indexOf(p[0]) === 0); if (!hit) return [];
    // 同一个前缀可能属于几个国家（例如 FM = 科摩罗 / 马达加斯加 / 留尼汪）：都列出来
    return PX.filter(p => p[0] === hit[0]).map(p => p[1]).filter((c, i, a) => a.indexOf(c) === i);
  }
  // 国家属于哪个地区卡
  function regionsFor(codes, fixes) {
    const R = new Set(), f = codes.map(c => c[0]);
    if (f.some(x => 'EL'.includes(x))) R.add('Europe / SERA');
    if (f.some(x => 'OVWZRU'.includes(x))) R.add('Middle East / Asia');
    if (f.some(x => 'DFGH'.includes(x))) R.add('Africa and Indian Ocean');
    if (f.some(x => 'KC'.includes(x))) R.add('North America');
    if (f.some(x => 'TM'.includes(x))) R.add('Caribbean');
    if (f.some(x => x === 'S')) R.add('South America / South Atlantic');
    if (f.some(x => 'NAPY'.includes(x))) R.add('Pacific');
    if (codes.some(c => /^(CZQX|EGGX|BIRD|BGGL|KZNY|LPPO|ENOB|CZQM)$/.test(c)) || (fixes || []).some(p => p[0] > 44 && p[1] > -60 && p[1] < -10)) R.add('North Atlantic');
    if ((fixes || []).some(p => p[0] > 78)) R.add('Polar');
    return [...R];
  }

  // ---------- 显示 ----------
  function cardHtml(c, full) {
    const st = s => '<span class="tag" style="' + (s === 'R' ? 'border-color:var(--green);color:var(--green)' : 'opacity:.6') + '">' + th(STZ[s][0], STZ[s][1]) + '</span>';
    return '<div class="wac"><div style="font-weight:800">🌐 ' + esc(c.n) + ' <span style="color:var(--dim);font-weight:600;font-size:12px">CRAR ' + esc(c.crar) + ' · ' + esc(expand(c.px).join(' ')) + '</span></div>' +
      c.t.map(t => '<div style="margin-top:5px"><b>' + (zh(c.n + '|' + t.h, t.h) || th(TOPZ[t.h] || t.h, t.h)) + '</b> ' + st(t.s) +
        (t.x ? '<div style="margin-top:2px">' + (full || t.x.length < 260 ? zk(c.n + '|' + t.h, t.x) : (Z2[c.n + '|' + t.h] ? thb(esc(Z2[c.n + '|' + t.h].x.slice(0, 140) + '…'), esc(t.x.slice(0, 220) + '…')) : esc(t.x.slice(0, 220) + '…'))) + '</div>' : '') + '</div>').join('') +
      (c.note ? '<div style="color:var(--dim);font-size:12px;margin-top:4px">' + th('只有国家索引，程序还没核对', 'Country index only — procedure review pending') + '</div>' : '') + '</div>';
  }
  function regionHtml(name) {
    const r = D && D.r.find(x => x.n === name); if (!r) return '';
    return '<div class="wac"><div style="font-weight:800">🗺 ' + th(REGZ[r.n] || r.n, r.n) + ' <span style="color:var(--dim);font-size:12px">' + esc(r.ref) + '</span></div>' +
      r.sec.map(s => '<div style="margin-top:5px"><b>' + (zh('R:' + r.n + '|' + s.h, s.h) || esc(s.h)) + '</b> <span style="color:var(--dim);font-size:11.5px">' + esc(s.r) + '</span><div>' + zk('R:' + r.n + '|' + s.h, s.x) + '</div></div>').join('') + '</div>';
  }
  // 给 FIR 弹窗用：这个管制区所在国家的应急卡（摘要）
  function forFir(code) {
    if (!D) return navigator.onLine && lsGet('key') ? '' : '';
    const cs = country(code); if (!cs.length) return '';
    return '<div style="border-top:1px solid var(--line);margin-top:8px;padding-top:6px">' + cs.map(c => cardHtml(c, false)).join('') + '</div>';
  }
  // 整条航路：经过的国家（按时间），加地区卡和天气绕飞表
  function route() {
    if (!S.ofp) { toast(th('先载入 OFP', 'Load an OFP first')); return; }
    if (!D) { toast(navigator.onLine ? th('正在下载应急资料…', 'Downloading contingency data…') : th('应急资料还没下载：有网时打开一次', 'Contingency data not downloaded yet — open once when online')); load(true); return; }
    const o = S.ofp, legs = [];
    legs.push({ code: o.flight.dep, t: o.times.std, kind: th('起飞', 'DEP') });
    firLegs().slice().sort((a, b) => a.from - b.from).forEach(l => legs.push({ code: l.code, t: l.tIn, name: l.name }));
    legs.push({ code: o.flight.arr, t: S.atd ? null : o.times.sta, kind: th('落地', 'ARR') });
    const seen = [], rows = [];
    legs.forEach(l => { const cs = country(l.code); if (!cs.length) return; const key = cs.map(c => c.n).join(' / '), last = rows[rows.length - 1]; if (last && last.key === key) { if (last.codes.indexOf(l.code) < 0) last.codes.push(l.code); return; } rows.push({ cs, key, t: l.t, codes: [l.code], kind: l.kind }); });
    const fixes = Object.values(o.fixes || {});
    const regs = regionsFor(legs.map(l => l.code), fixes);
    const gen = D.r.find(x => x.n === 'General');
    let h = '<div class="bar"><b style="font-size:16px">🌐 ' + th('途经国家应急程序', 'Contingency on route') + '</b><span style="flex:1"></span><button class="btn sm" onclick="document.getElementById(\'wacov\').remove()">✕</button></div><div class="wacin">' +
      '<div style="color:var(--dim);font-size:12px">' + esc(D.src) + ' · ' + th('学习资料，飞行前以现行批准的资料为准', 'Study aid — verify current approved sources before flight') + '</div>' +
      rows.map(r => '<details' + (r.cs.some(c => c.t.some(t => t.x)) ? ' open' : '') + '><summary><b>' + esc(r.key) + '</b> · ' + esc(r.codes.join(' ')) + (r.t ? ' · ' + hmZ(r.t).slice(0, 4) + 'Z' : '') + (r.kind ? ' · ' + r.kind : '') + '</summary>' + r.cs.map(c => cardHtml(c, true)).join('') + '</details>').join('') +
      regs.map(n => '<details><summary><b>🗺 ' + th(REGZ[n] || n, n) + '</b></summary>' + regionHtml(n) + '</details>').join('') +
      (gen ? '<details><summary><b>☁︎ ' + th('天气绕飞改高度表', 'Weather deviation level-change table') + '</b></summary>' + regionHtml('General') + '</details>' : '') + '</div>';
    if (!route.asked) { route.asked = 1; setTimeout(() => translate(), 300); }
    let ov = document.getElementById('wacov'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'wacov'; ov.innerHTML = h; document.body.appendChild(ov);
  }

  window.WAC = { load, route, forFir, country, expand, has: () => !!D, translate };
  window.addEventListener('online', () => load(false));
  setTimeout(() => { load(false); if (D) translate(); }, 4000);
})();
