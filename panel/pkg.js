/* 简报包：按公司飞行准备流程，把这一班整理成一份文件（手机离线直接看；有网时后台转成 PDF 存云端，iPad / 电脑下载）
   飞行信息 → 起飞前时间轴 → 重量 / 油量 → TEM：起飞 / 航路（逐个 FIR）/ 到达 / 备降 → 参考工具清单
   通告：💡 一句话要点（AI 已翻好的）+ 原文编号；没翻好的显示英文原文。仅供辅助。
   用 index.html 的全局：CUR, LEGS, X, XS, esc, hmZ, dmZ, dur, T, MIN, FIRALIAS, trName, offOf, csOf, ls, postK, WX, LANG；intel.js 的 FIDB, fiUsable, actList, tlItems, routePrep, wacCountry, procMatch */
'use strict';
const PKG_TOOLS = ['FCI / FCN', 'OM-C Area Brief', 'LIDO mBriefing', 'LIDO RSI', 'LIDO mPilot', 'LIDO CRAR', 'CCI / AOI', 'NOAA Space WX', 'ASR', 'Layover Brief', 'Flight Pulse'];
function pkgNotam(L, loc, n) {
  const sm = trName(L, 's:' + n[0]), zh = trName(L, n[0]);
  return '<li><b>' + esc(n[0]) + '</b> ' + (sm ? '💡 ' + esc(sm) : zh ? esc(zh) : '<span class="en">' + esc(n[1].slice(0, 300)) + '</span>')
    + '<span class="tm"> ' + (n[2] ? dmZ(n[2]) : '') + '–' + (n[3] ? dmZ(n[3]) : 'PERM') + '</span></li>';
}
function pkgNotams(L, loc, max) { const A = (L.nt[loc] || []); if (!A.length) return '<p class="tm">' + XS('没有通告', 'No NOTAMs') + '</p>';
  return '<ol class="nl">' + A.slice(0, max || 60).map(n => pkgNotam(L, loc, n)).join('') + '</ol>' + (A.length > (max || 60) ? '<p class="tm">… ' + (A.length - (max || 60)) + XS(' 条没列出（在 Panel 上看全部）', ' more') + '</p>' : ''); }
const pkgRisk = list => (list || []).map(x => '<li class="' + (x.lv === 'red' ? 'r' : '') + '">' + (x.lv === 'red' ? '⛔ ' : '⚠ ') + esc(LANG === 'en' ? x.en : x.zh) + '</li>').join('');
function pkgWx(L, icao) { const w = L.wx && L.wx[icao]; if (!w || (!w.m && !w.t)) return ''; return '<pre>' + esc((w.m ? 'METAR ' + w.m + '\n' : '') + (w.t ? 'TAF ' + w.t : '')) + '</pre>'; }
function pkgFi(x) { return '<div class="fi ' + esc(x.level || '') + '"><b>' + esc(x.name) + '</b> — ' + esc(x.msg || x.msgEn || '') + actList(x) + (x.notes ? '<div class="tm">' + esc(x.notes) + '</div>' : '') + '</div>'; }
function pkgHtml(L) {
  const off = offOf(L), eta = off + L.tr * MIN, now = Date.now(), FI = L.fi || [];
  const items = (FIDB && FIDB.items || []).filter(x => x.kind !== 'wpt' && fiUsable(x, now));
  const procs = items.filter(x => x.kind === 'proc' && x.trigger !== 'timeline' && typeof x.trigger === 'object' && procMatch(x.trigger, L));
  let h = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(L.no + ' ' + L.ai + '-' + L.bi) + ' Brief</title><style>'
    + 'body{font:12.5px/1.45 "Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#000;margin:18px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;border-bottom:2px solid #000;margin:16px 0 6px;padding-bottom:2px}h3{font-size:13.5px;margin:10px 0 4px}'
    + 'table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:3px 6px;text-align:left;vertical-align:top}th{background:#eee}.tm{color:#555;font-size:11px}.en{color:#333;font-family:Menlo,monospace;font-size:11px}'
    + 'pre{white-space:pre-wrap;font:11px/1.35 Menlo,monospace;background:#f4f4f4;padding:4px 6px;margin:4px 0}ol.nl{margin:2px 0 6px 18px;padding:0}ol.nl li{margin:2px 0}li.r{color:#c00;font-weight:700}'
    + '.fi{border-left:4px solid #000;padding:2px 8px;margin:4px 0}.fi.warning{border-color:#c00}.acts{margin:2px 0 2px 18px;padding:0}.chk{display:inline-block;width:12px;height:12px;border:1.5px solid #000;margin-right:6px;vertical-align:-2px}'
    + '.disc{font-size:10.5px;color:#555;border-top:1px solid #999;margin-top:18px;padding-top:6px}</style></head><body>';
  // 1. 飞行信息
  h += '<h1>📑 ' + esc(L.no) + ' · ' + esc(L.ai) + ' → ' + esc(L.bi) + ' <span class="tm">' + XS('飞行准备简报包', 'Flight preparation package') + ' · ' + XS('生成 ', 'generated ') + dmZ(now) + '</span></h1>'
    + '<table><tr><th>' + XS('航班号', 'Flight') + '</th><td>' + esc(L.no) + '</td><th>' + XS('呼号', 'Callsign') + '</th><td>' + esc(csOf(L)) + '</td><th>' + XS('注册号', 'Registration') + '</th><td>' + esc(L.reg || '') + '</td><th>' + XS('机型', 'Type') + '</th><td>' + esc(L.ty || '') + '</td></tr>'
    + '<tr><th>DEP</th><td>' + esc(L.dep) + ' / ' + esc(L.ai) + '</td><th>ARR</th><td>' + esc(L.arr) + ' / ' + esc(L.bi) + '</td><th>ALTN</th><td colspan="3">' + esc((L.alt || []).join(' · ')) + '</td></tr>'
    + '<tr><th>STD</th><td>' + dmZ(L.std) + '</td><th>ETD (off)</th><td>' + dmZ(off) + '</td><th>ETA</th><td>' + dmZ(eta) + '</td><th>' + XS('飞行时间', 'Trip') + '</th><td>' + dur(L.tr) + '</td></tr>'
    + '<tr><th>COMP FREQ</th><td colspan="7">&nbsp;</td></tr></table>';
  // 2. 时间轴
  const TL = typeof tlItems === 'function' ? tlItems(L) : [];
  if (TL.length) h += '<h2>⏱ ' + XS('起飞前时间轴', 'Pre-departure timeline') + '</h2><table><tr><th>UTC</th><th>STD −</th><th>' + XS('事项', 'Item') + '</th></tr>' + TL.map(s => '<tr><td>' + hmZ(s.t) + 'Z</td><td>' + s.min + '</td><td><span class="chk"></span>' + esc(s.zh) + (s.en && s.en !== s.zh ? ' · ' + esc(s.en) : '') + '</td></tr>').join('') + '</table>';
  // 3. 重量 / 油量
  if (L.w) h += '<h2>⚖ ' + XS('重量 / 油量', 'Weights / fuel') + '</h2><table><tr><th>TOW</th><td>' + T(L.w.tow) + ' / ' + T(L.w.towL) + ' t (' + XS('余量 ', 'margin ') + T(L.w.towL - L.w.tow) + ')</td><th>LDW</th><td>' + T(L.w.ldw) + ' / ' + T(L.w.lwL) + ' t (' + XS('余量 ', 'margin ') + T(L.w.lwL - L.w.ldw) + ')</td><th>' + XS('落地油', 'LDG fuel') + '</th><td>' + T(L.w.lf) + ' t</td></tr></table>';
  // 4. TEM：起飞
  h += '<h2>🛫 ' + XS('起飞', 'Departure') + ' · ' + esc(L.dep) + '</h2><p class="tm">Pre-flight（MEL/CDL, Bulletins, Pax/Cabin）· Taxi（closures, speed limits）· Take-off（performance, NADP）· Departure（SID, climb out）</p>';
  const rp = typeof routePrep === 'function' ? routePrep(L) : [];
  if (rp.length) h += '<h3>🧭 ' + XS('航路经过的特殊空域：起飞前准备（MEL / 设备）', 'Special airspace on route: before departure') + '</h3>' + rp.map(x => '<div class="fi ' + esc(x.level) + '"><b>' + esc(x.fir) + ' · ' + esc(x.name) + '</b>' + actList({ actions: x.preflight }) + '</div>').join('');
  procs.filter(x => (x.phases || []).some(p => p.key === 'dep')).forEach(x => { const p = x.phases.find(q => q.key === 'dep'); h += pkgFi(Object.assign({}, x, { actions: p.steps })); });
  if ((L.R && L.R.dep || []).length) h += '<h3>⚠ ' + XS('起飞提醒（OFP）', 'Departure warnings (OFP)') + '</h3><ul>' + pkgRisk(L.R.dep) + '</ul>';
  h += pkgWx(L, L.dep) + '<h3>NOTAM ' + esc(L.dep) + '</h3>' + pkgNotams(L, L.dep, 40);
  // 航路：逐个 FIR
  h += '<h2>✈ ' + XS('航路（按 FIR 顺序）', 'En route (by FIR)') + '</h2><p class="tm">CRAR · Reporting · ADIZ · CPDLC · HF · IFBP · Oceanic · SLOP · Contingency · Emergency</p>';
  FI.forEach(f => { const code = FIRALIAS[f[1]] || f[1];
    h += '<h3>' + hmZ(off + f[3] * MIN) + 'Z · ' + esc(f[1]) + ' ' + esc(f[0]) + ' <span class="tm">' + XS('入口 ', 'entry ') + esc(f[2]) + '</span></h3>';
    items.filter(x => x.kind === 'area' && (x.fir === f[1] || x.fir === code)).forEach(x => h += pkgFi(x));
    (typeof wacCountry === 'function' ? wacCountry(code) : []).forEach(c => { const tp = (c.t || []).filter(t => t.x); if (tp.length) h += '<div class="fi"><b>🌐 ' + esc(c.n) + ' contingency</b>' + tp.map(t => '<div><b>' + esc(t.h) + ':</b> <span class="tm">' + esc(t.x.slice(0, 600)) + '</span></div>').join('') + '</div>'; });
    const enr = (L.R && L.R.enr || []).filter(r => r[2].loc === code).map(r => r[2]); if (enr.length) h += '<ul>' + pkgRisk(enr) + '</ul>';
    if ((L.nt[code] || []).length) h += '<details open><summary class="tm">NOTAM ' + esc(code) + ' · ' + L.nt[code].length + '</summary>' + pkgNotams(L, code, 25) + '</details>';
  });
  // 到达
  h += '<h2>🛬 ' + XS('到达', 'Arrival') + ' · ' + esc(L.arr) + '</h2><p class="tm">Arrival（STAR）· Approach（FAF ALT, RoD）· Missed approach · Landing（LDA, braking & exit）· Taxi / parking · Post-flight</p>';
  procs.filter(x => (x.phases || []).some(p => p.key === 'dest' || p.key === 'arr')).forEach(x => { const p = x.phases.find(q => q.key === 'dest' || q.key === 'arr'); h += pkgFi(Object.assign({}, x, { actions: p.steps })); });
  if ((L.R && L.R.arr || []).length) h += '<ul>' + pkgRisk(L.R.arr) + '</ul>';
  h += pkgWx(L, L.arr) + '<h3>NOTAM ' + esc(L.arr) + '</h3>' + pkgNotams(L, L.arr, 40);
  // 备降
  (L.alt || []).forEach(a => { h += '<h2>↪ ' + XS('备降 ', 'Alternate ') + esc(a) + '</h2><p class="tm">Diversion（fuel, route, wx）· Approach minima · Landing performance · Ramp</p>' + pkgWx(L, a) + pkgNotams(L, a, 20); });
  // 航路机场模型 + 参考工具
  h += '<h2>🧰 ' + XS('航路机场：能不能用（CAN WE）', 'En-route airports: CAN WE') + '</h2><p>' + ['Can we get there (range)', 'Do the approach and landing (wx vs minima)', 'Stop (most limiting LDA vs LDR)', 'Turn-around (ground ops)', 'Go-around (performance)', 'Plan B'].map(t => '<span class="chk"></span>' + esc(t)).join('<br>') + '</p>';
  h += '<h2>📚 ' + XS('参考工具（逐项打勾）', 'Reference tools') + '</h2><p>' + PKG_TOOLS.map(t => '<span class="chk"></span>' + esc(t)).join('　') + '</p>';
  h += '<div class="disc">' + XS('仅供辅助了解情况，不能替代官方航行情报、公司运行程序（OM / LIDO）及 ATC 指令。通告要点由 AI 翻译整理，以原文为准。', 'Awareness aid only — official AIS, company procedures and ATC prevail. AI summaries — the original NOTAM text prevails.') + '</div></body></html>';
  return h;
}
// 手机上直接看（离线）；「☁️ 生成 PDF」= 交给后台转 PDF，存到云端（iPad / 电脑下载）
function openPkg() {
  const L = CUR; if (!L || L.noOfp) { MSG = XS('先读入 OFP', 'Load an OFP first'); draw(); return; }
  const sh = $('sheet'); sh.style.display = 'block'; sh.scrollTop = 0;
  sh.innerHTML = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:16px">📑 ' + XS('简报包', 'Briefing package') + '</b><span style="flex:1"></span><span class="btn" id="pk-pdf">☁️ PDF</span><span class="btn" id="sh-x">✕</span></div><div id="pk-st" class="ok"></div><iframe id="pk-f" style="width:100%;height:calc(100vh - 90px);border:1px solid #999;background:#fff"></iframe>';
  $('pk-f').srcdoc = pkgHtml(L);
  $('sh-x').onclick = () => { sh.style.display = 'none'; draw(); };
  $('pk-pdf').onclick = async () => { $('pk-st').textContent = '⏳ ' + XS('后台生成 PDF…', 'Making the PDF…'); const r = await pkgUpload(L, true); $('pk-st').textContent = r ? '✅ ' + XS('PDF 已存到云端（iPad：工具 → 📑 简报包）', 'PDF saved to the cloud') : '⚠️ ' + XS('没成功（要联网）', 'Failed (needs network)'); };
}
async function pkgUpload(L, force) {
  if (!navigator.onLine || !ls('key')) return false; const k = String(L.k).replace(/[^\w.-]/g, '');
  if (!force && ls('pkg.' + k)) return true;
  try { const j = await postK({ action: 'pkgpdf', k, html: pkgHtml(L) }); if (j && j.ok) { ls('pkg.' + k, String(Date.now())); return true; } } catch (e) {}
  return false;
}
// 自动：STD 前 150 分钟以内（坐车去机场的时候）生成一次 PDF 放到云端
function pkgAuto(L, now) { if (!L || L.noOfp || DEMO) return; const k = String(L.k).replace(/[^\w.-]/g, ''); if (ls('pkg.' + k)) return;
  if (now < L.std - 150 * MIN || now > L.std) return; if (pkgAuto.busy) return; pkgAuto.busy = 1; pkgUpload(L, false).then(() => { pkgAuto.busy = 0; }); }
