/* AI 关键影响：整份 OFP 交给 Google Gemini（经时钟后台），按阶段列出关键影响。
   每一条都必须引用 OFP 原文；这里逐条核对原文，找不到原句的一律不显示（防止 AI 编造）。
   用主页面的全局：S, lsGet, lsSet, clockUrl, th, thb, esc, toast, renderList, lastList */
(function () {
  'use strict';
  // 这个文件比主页面先载入：自己读写 localStorage（前缀 fa.）
  const lsGet = k => { try { return localStorage.getItem('fa.' + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem('fa.' + k, v); } catch (e) {} };
  // 一次性：清掉以前用普通翻译 / 旧规则存下的通告翻译和解读（里面可能有把滑行道当跑道的错误）
  if (lsGet('trv') !== '2') {
    ['tr', 'trp', 'ai'].forEach(k => lsSet(k, '{}'));
    try { const kb = JSON.parse(lsGet('kb') || '{}'); if (kb.terms) Object.keys(kb.terms).forEach(t => { if (/^[A-Z]{1,2}\d{1,2}[LRC]?$|^\d{1,2}[LRC]?(\/\d{1,2}[LRC]?)?$/.test(t)) delete kb.terms[t]; }); lsSet('kb', JSON.stringify(kb)); } catch (e) {}
    lsSet('trv', '2');
  }
  const keyOf = () => S.ofp ? S.ofp.flight.no + S.ofp.flight.date : '';
  let B = null; const load = () => { try { B = JSON.parse(lsGet('aib.' + keyOf()) || 'null'); } catch (e) { B = null; } };
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9/]+/g, ' ').trim();
  let busy = false, msg = '';
  async function fetchB(force) {
    if (!S.ofp || busy || !navigator.onLine || !lsGet('key')) return;
    load(); if (B && !force && B.ver === 4) return;   // 旧版（没按我们的时间筛）的结果：有网时重读一次
    const text = lsGet('ofptext') || ''; if (text.length < 1000) return;
    busy = true; msg = '⏳ ' + th('AI 正在读整份 OFP…（约半分钟）', 'AI is reading the whole OFP… (~30 s)'); redraw();
    try { if (window.CLOUD) await CLOUD.upload(text, S.ofp); } catch (e) {}   // 先把原文存到云端，另一台设备就不用再下载解析
    try {
      const r = await fetch(clockUrl() + '?k=' + encodeURIComponent(lsGet('key')), { method: 'POST', body: JSON.stringify({ action: 'ofpbrief', text, win: winText(), k: keyOf().replace(/[^\w.-]/g, '') }) });
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { ok: false, error: t.slice(0, 80) }; }
      if (j.ok && j.items) {
        // 核对原文：引用的那句在 OFP 里找得到才算
        const N = ' ' + norm(text) + ' ';
        const items = j.items.map(x => Object.assign({}, x, { ok: norm(x.src).length >= 8 && N.indexOf(' ' + norm(x.src) + ' ') >= 0 || N.indexOf(norm(x.src)) >= 0 }));
        const kept = items.filter(x => x.ok), inT = kept.filter(x => inTime(x));
        B = { ver: 4, t: Date.now(), items: inT, dropped: items.filter(x => !x.ok).length, outT: kept.length - inT.length, model: j.model, ds: j.ds === true ? 'DeepSeek' : (j.ds || '') };
        lsSet('aib.' + keyOf(), JSON.stringify(B)); msg = '';
      } else msg = /unknown|action/i.test(j.error || '') || !j.error ? th('后台要更新才能用 AI 解读', 'Update the backend to use the AI briefing') : '⚠️ ' + j.error;
    } catch (e) { msg = th('没连上', 'Could not connect'); }
    busy = false; redraw();
  }
  // ---------- 我们的时间窗（UTC）：起飞前后、到达 ±1 小时、各备降场 ETA ±1 小时、每个管制区进出 ±1 小时 ----------
  const H = 36e5, hm = t => { const d = new Date(t); return String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + 'Z'; };
  function windows() {
    const o = S.ofp, t = o.times, off = S.atd || (t.std + (t.taxi || 0) * 6e4), eta = S.atd ? atP(t.trip || 0) : (t.sta || off + (t.trip || 0) * 6e4);
    const W = { dep: [t.std - H, off + H], arr: [eta - H, eta + H], altn: {}, fir: {}, all: [t.std - H, eta + H] };
    (o.alternates || []).forEach(a => { const x = eta + (a.time || 0) * 6e4; W.altn[a.icao] = [x - H, x + H]; });
    try { firLegs().forEach(l => { if (l.tIn && l.tOut) W.fir[l.code] = [l.tIn - H, l.tOut + H]; }); } catch (e) {}
    return W;
  }
  function winText() {
    if (!S.ofp) return ''; const o = S.ofp, W = windows(), L = [];
    L.push('Departure ' + o.flight.dep + ': ' + hm(W.dep[0]) + ' – ' + hm(W.dep[1]));
    L.push('Destination ' + o.flight.arr + ': ' + hm(W.arr[0]) + ' – ' + hm(W.arr[1]));
    Object.keys(W.altn).forEach(k => L.push('Alternate ' + k + ': ' + hm(W.altn[k][0]) + ' – ' + hm(W.altn[k][1])));
    Object.keys(W.fir).forEach(k => L.push('FIR ' + k + ': ' + hm(W.fir[k][0]) + ' – ' + hm(W.fir[k][1])));
    return L.join('\n');
  }
  // AI 说的那条通告：在 OFP 里找到原通告，看它的有效期和固定时段，在我们的时间窗里才保留
  function inTime(x) {
    if (!S.ofp || (x.ph || 'gen') === 'gen') return true;
    const W = windows(), q = norm(x.src); let win = W.all;
    if (x.ph === 'dep') win = W.dep; else if (x.ph === 'arr') win = W.arr;
    else if (x.ph === 'altn') win = W.altn[x.icao] || [W.arr[0], W.arr[1] + 2 * H];
    else if (x.ph === 'enr') win = W.fir[x.icao] || Object.keys(W.fir).filter(k => (FIRALIAS[k] || k) === x.icao).map(k => W.fir[k])[0] || W.all;
    let n = null; Object.values(S.ofp.notams || {}).some(L => L.some(m => { if (norm(m.text).indexOf(q) >= 0) { n = m; return true; } return false; }));
    const own = WX.sched(x.src, win[0], win[1]); if (own === false) return false;   // AI 引用的那一句自己带时段（例如「EV TUE, THU AND SAT FM 1130 TO 1430」）
    if (!n) return true;   // 不是通告（天气、公司说明……）：照常
    if ((n.to != null && n.to < win[0]) || (n.from != null && n.from > win[1])) return false;
    return own === true || WX.sched(n.text, win[0], win[1]) !== false;
  }
  function redraw() { try { lastList = 0; renderList(true); } catch (e) {} }
  const PH = { dep: ['🛫 起飞', '🛫 Departure'], enr: ['✈️ 航路', '✈️ En route'], arr: ['🛬 目的地', '🛬 Destination'], altn: ['🔁 备降场', '🔁 Alternates'], gen: ['📋 公司 / 签派', '📋 Company / dispatch'] };
  function html(onlyRed) {
    if (!S.ofp) return ''; load();
    if (!B) return onlyRed ? '' : '<div class="ap" style="cursor:default"><div class="h"><span class="id">🤖 AI</span><span style="flex:1">' + th('整份 OFP 的关键影响', 'Key impacts from the whole OFP') + '</span><span class="small" style="cursor:pointer" onclick="AIB.fetch(true)">⟳</span></div><div class="small" style="color:var(--dim)">' + (msg || (navigator.onLine ? th('有网时自动读', 'Reads automatically when online') : th('离线：有网时再读', 'Offline — will read when online'))) + '</div></div>';
    const L = B.items.filter(x => !onlyRed || x.lv === 'red'); if (onlyRed && !L.length) return '';
    let h = '<div class="ap" style="cursor:default;border-left:5px solid ' + (L.some(x => x.lv === 'red') ? 'var(--red)' : 'var(--amber)') + '"><div class="h"><span class="id">🤖 AI</span><span style="flex:1">' + th('整份 OFP 的关键影响', 'Key impacts from the whole OFP') + '</span><span class="small" style="cursor:pointer" onclick="AIB.fetch(true)">⟳</span></div>';
    ['dep', 'enr', 'arr', 'altn', 'gen'].forEach(p => {
      const g = L.filter(x => (x.ph || 'gen') === p); if (!g.length) return;
      h += '<div style="margin-top:6px;font-weight:700">' + th(PH[p][0], PH[p][1]) + '</div>' + g.map(x => '<div class="' + (x.lv === 'red' ? 't-red' : x.lv === 'amber' ? 't-amber' : '') + '" style="margin-top:3px">● ' + (x.icao ? '<b>' + esc(x.icao) + '</b> ' : '') + thb(esc(x.zh), esc(x.en || '')) +
        badge(x) + '<div class="small" style="color:var(--dim);font-family:ui-monospace,Menlo,monospace">“' + esc(x.src) + '”</div></div>').join('');
    });
    const nOk = L.filter(x => x.v === 'ok').length, nFix = L.filter(x => x.v === 'fix' || x.v === 'dis').length;
    if (B.outT) h += '<div class="small" style="color:var(--dim);margin-top:6px">⏱ ' + th('另有 ' + B.outT + ' 条通告不在我们经过的时间内（前后 1 小时），已去掉', B.outT + ' NOTAM item(s) not in force during our times (±1 h) — hidden') + '</div>';
    h += '<div class="small" style="color:var(--dim);margin-top:6px">' + (B.ds ? th('Gemini 解读 · ' + B.ds + ' 复核：' + nOk + ' 条一致，' + nFix + ' 条有修正 / 分歧', 'Gemini briefing · ' + B.ds + ' review: ' + nOk + ' agree, ' + nFix + ' corrected / disputed') + ' · ' : th('只有 Gemini（后台还没填第二个 AI 的 Key）', 'Gemini only (no reviewer key yet)') + ' · ') + th('每条都已核对 OFP 原文（引号里是原句）', 'Each item checked against the OFP (quoted text)') + (B.dropped ? ' · ' + th('有 ' + B.dropped + ' 条找不到原文，已去掉', B.dropped + ' unverifiable item(s) removed') : '') + ' · ' + th('AI 解读仅供参考', 'AI aid only') + '</div></div>';
    return h;
  }
  // 复核结果的小标记
  function badge(x) {
    if (x.v === 'ok') return '<div class="small" style="color:var(--green)">✓✓ ' + th('Gemini 和 ' + (B.ds || '第二个 AI') + ' 一致', 'Gemini and ' + (B.ds || 'reviewer') + ' agree') + '</div>';
    if (x.v === 'fix') return '<div class="small t-amber">⚠ ' + th((B.ds || '第二个 AI') + ' 复核修正', 'Corrected by ' + (B.ds || 'reviewer')) + (x.why ? '：' + esc(x.why) : '') + (x.g ? '<br><s style="opacity:.6">' + esc(x.g.zh) + '</s>' : '') + '</div>';
    if (x.v === 'dis') return '<div class="small t-red">⚠ ' + th('两个 AI 不一致，请看原文', 'The two AIs disagree — read the original') + (x.why ? '：' + esc(x.why) : '') + '</div>';
    return '';
  }
  window.AIB = { fetch: fetchB, html };
  window.addEventListener('online', () => fetchB(false));
})();
