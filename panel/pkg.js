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
// 分成几部分：起飞 / 每个 FIR / 到达 / 每个备降场。每部分：给 AI 的原始文字 + 原文的网页
function pkgSections(L) {
  const off = offOf(L), now = Date.now(), FI = L.fi || [], items = (FIDB && FIDB.items || []).filter(x => x.kind !== 'wpt' && fiUsable(x, now));
  const procs = items.filter(x => x.kind === 'proc' && x.trigger !== 'timeline' && typeof x.trigger === 'object' && procMatch(x.trigger, L));
  const ntTxt = loc => (L.nt[loc] || []).map(n => 'NOTAM ' + n[0] + ' (' + (n[2] ? dmZ(n[2]) : '') + '–' + (n[3] ? dmZ(n[3]) : 'PERM') + '): ' + n[1]).join('\n');
  const wxTxt = icao => { const w = L.wx && L.wx[icao]; return w ? (w.m ? 'METAR ' + w.m + '\n' : '') + (w.t ? 'TAF ' + w.t + '\n' : '') : ''; };
  const fiTxt = x => '公司规定 / Rule ' + x.name + ': ' + (x.msg || x.msgEn || '') + ' ' + (x.actions || []).map(a => a.zh || a.en).join('; ') + (x.notes ? ' ' + x.notes : '');
  const rk = list => (list || []).map(x => 'OFP 提醒: ' + (x.en || x.zh)).join('\n'), S = [];
  const rp = typeof routePrep === 'function' ? routePrep(L) : [], pd = procs.filter(x => (x.phases || []).some(p => p.key === 'dep'));
  S.push({ id: 'dep', title: '🛫 ' + XS('起飞', 'Departure') + ' · ' + L.dep, when: dmZ(off),
    text: [rk(L.R && L.R.dep), rp.map(x => '起飞前准备 ' + x.fir + ' ' + x.name + ': ' + x.preflight.map(a => a.zh).join('; ')).join('\n'), pd.map(x => fiTxt(Object.assign({}, x, { actions: x.phases.find(p => p.key === 'dep').steps }))).join('\n'), wxTxt(L.dep), ntTxt(L.dep)].filter(Boolean).join('\n'),
    raw: (rp.length ? '<h3>🧭 ' + XS('航路经过的特殊空域：起飞前准备', 'Special airspace: before departure') + '</h3>' + rp.map(x => '<div class="fi ' + esc(x.level) + '"><b>' + esc(x.fir) + ' · ' + esc(x.name) + '</b>' + actList({ actions: x.preflight }) + '</div>').join('') : '')
      + pd.map(x => pkgFi(Object.assign({}, x, { actions: x.phases.find(p => p.key === 'dep').steps }))).join('') + ((L.R && L.R.dep || []).length ? '<ul>' + pkgRisk(L.R.dep) + '</ul>' : '') + pkgWx(L, L.dep) + '<h3>NOTAM ' + esc(L.dep) + '</h3>' + pkgNotams(L, L.dep, 60) });
  FI.forEach(f => { const code = FIRALIAS[f[1]] || f[1], fx = items.filter(x => x.kind === 'area' && (x.fir === f[1] || x.fir === code || (x.firs || []).some(c => c === f[1] || (FIRALIAS[c] || c) === code)));
    const wc = (typeof wacCountry === 'function' ? wacCountry(code) : []), enr = (L.R && L.R.enr || []).filter(r => r[2].loc === code).map(r => r[2]);
    S.push({ id: 'fir:' + f[1] + ':' + f[2], title: hmZ(off + f[3] * MIN) + 'Z · ' + f[1] + ' ' + f[0], when: hmZ(off + f[3] * MIN) + 'Z（入口 ' + f[2] + '）',
      text: [fx.map(fiTxt).join('\n'), wc.map(c => (c.t || []).filter(t => t.x).map(t => '应急程序 ' + c.n + ' ' + t.h + ': ' + t.x.slice(0, 1500)).join('\n')).join('\n'), rk(enr), ntTxt(code)].filter(Boolean).join('\n'),
      raw: fx.map(pkgFi).join('') + wc.map(c => { const tp = (c.t || []).filter(t => t.x); return tp.length ? '<div class="fi"><b>🌐 ' + esc(c.n) + ' contingency</b>' + tp.map(t => '<div><b>' + esc(t.h) + ':</b> <span class="tm">' + esc(t.x.slice(0, 600)) + '</span></div>').join('') + '</div>' : ''; }).join('')
        + (enr.length ? '<ul>' + pkgRisk(enr) + '</ul>' : '') + ((L.nt[code] || []).length ? '<h3 class="tm">NOTAM ' + esc(code) + ' · ' + L.nt[code].length + '</h3>' + pkgNotams(L, code, 40) : '') }); });
  const pa = procs.filter(x => (x.phases || []).some(p => p.key === 'dest' || p.key === 'arr'));
  S.push({ id: 'arr', title: '🛬 ' + XS('到达', 'Arrival') + ' · ' + L.arr, when: dmZ(off + L.tr * MIN),
    text: [rk(L.R && L.R.arr), pa.map(x => fiTxt(Object.assign({}, x, { actions: x.phases.find(p => p.key === 'dest' || p.key === 'arr').steps }))).join('\n'), wxTxt(L.arr), ntTxt(L.arr)].filter(Boolean).join('\n'),
    raw: pa.map(x => pkgFi(Object.assign({}, x, { actions: x.phases.find(p => p.key === 'dest' || p.key === 'arr').steps }))).join('') + ((L.R && L.R.arr || []).length ? '<ul>' + pkgRisk(L.R.arr) + '</ul>' : '') + pkgWx(L, L.arr) + '<h3>NOTAM ' + esc(L.arr) + '</h3>' + pkgNotams(L, L.arr, 60) });
  (L.alt || []).forEach(a => S.push({ id: 'alt:' + a, title: '↪ ' + XS('备降 ', 'Alternate ') + a, when: '', text: [wxTxt(a), ntTxt(a)].filter(Boolean).join('\n'), raw: pkgWx(L, a) + pkgNotams(L, a, 30) }));
  return S;
}
// AI「说人话」版：存在手机上（离线可看），有网时刷新
const pkgAiGet = L => { try { return JSON.parse(ls('pkgai.' + String(L.k).replace(/[^\w.-]/g, '')) || 'null'); } catch (e) { return null; } };
async function pkgAiRun(L) {
  const S = pkgSections(L), off = offOf(L);
  const j = await postK({ action: 'pkgai', flight: { no: L.no, dep: L.dep, arr: L.arr, off: dmZ(off), eta: dmZ(off + L.tr * MIN) }, secs: S.filter(x => x.text.trim()).map(x => ({ id: x.id, title: x.title, when: x.when, text: x.text })) });
  if (!j || !j.ok) throw new Error((j && j.error) || 'AI');
  const old = pkgAiGet(L); if (old && old.secs) Object.keys(old.secs).forEach(id => { if ((!j.secs[id] || !j.secs[id].points.length) && old.secs[id].points.length) j.secs[id] = old.secs[id]; });   // 这次没整理出来的部分：保留上次的
  ls('pkgai.' + String(L.k).replace(/[^\w.-]/g, ''), JSON.stringify(j)); return j;
}
function pkgHtml(L, simple) {
  const off = offOf(L), eta = off + L.tr * MIN, now = Date.now(), AI = pkgAiGet(L), S = pkgSections(L);
  let h = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(L.no + ' ' + L.ai + '-' + L.bi) + ' Brief</title><style>'
    + 'body{font:12.5px/1.5 "Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#000;margin:18px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;border-bottom:2px solid #000;margin:16px 0 6px;padding-bottom:2px}h3{font-size:13.5px;margin:10px 0 4px}'
    + 'table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:3px 6px;text-align:left;vertical-align:top}th{background:#eee}.tm{color:#555;font-size:11px}.en{color:#333;font-family:Menlo,monospace;font-size:11px}'
    + 'pre{white-space:pre-wrap;font:11px/1.35 Menlo,monospace;background:#f4f4f4;padding:4px 6px;margin:4px 0}ol.nl{margin:2px 0 6px 18px;padding:0}ol.nl li{margin:2px 0}li.r{color:#c00;font-weight:700}'
    + '.fi{border-left:4px solid #000;padding:2px 8px;margin:4px 0}.fi.warning{border-color:#c00}.acts{margin:2px 0 2px 18px;padding:0}.chk{display:inline-block;width:12px;height:12px;border:1.5px solid #000;margin-right:6px;vertical-align:-2px}'
    + 'ul.ai{list-style:none;margin:4px 0 8px;padding:0}ul.ai li{padding:3px 0 3px 22px;position:relative;font-size:14px;line-height:1.45;border-bottom:1px dotted #ccc}ul.ai li:before{position:absolute;left:2px;top:3px}'
    + 'ul.ai li.red{color:#b00000;font-weight:800}ul.ai li.red:before{content:"⛔"}ul.ai li.amber{font-weight:700}ul.ai li.amber:before{content:"⚠️"}ul.ai li.info:before{content:"•";font-weight:900}'
    + '.app{font-size:11px}.app h2{font-size:13px}.app ol.nl li{margin:1px 0}.disc{font-size:10.5px;color:#555;border-top:1px solid #999;margin-top:18px;padding-top:6px}</style></head><body>';
  h += '<h1>📑 ' + esc(L.no) + ' · ' + esc(L.ai) + ' → ' + esc(L.bi) + ' <span class="tm">' + XS('飞行准备简报（完整版）', 'Flight preparation brief (full)') + ' · ' + XS('生成 ', 'generated ') + dmZ(now) + (AI ? ' · 🤖 ' + XS('AI 整理 ', 'AI ') + dmZ(AI.t) : '') + '</span></h1>'
    + '<table><tr><th>' + XS('航班号', 'Flight') + '</th><td>' + esc(L.no) + '</td><th>' + XS('呼号', 'Callsign') + '</th><td>' + esc(csOf(L)) + '</td><th>' + XS('注册号', 'Registration') + '</th><td>' + esc(L.reg || '') + '</td><th>' + XS('机型', 'Type') + '</th><td>' + esc(L.ty || '') + '</td></tr>'
    + '<tr><th>DEP</th><td>' + esc(L.dep) + ' / ' + esc(L.ai) + '</td><th>ARR</th><td>' + esc(L.arr) + ' / ' + esc(L.bi) + '</td><th>ALTN</th><td colspan="3">' + esc((L.alt || []).join(' · ')) + '</td></tr>'
    + '<tr><th>STD</th><td>' + dmZ(L.std) + '</td><th>ETD (off)</th><td>' + dmZ(off) + '</td><th>ETA</th><td>' + dmZ(eta) + '</td><th>' + XS('飞行时间', 'Trip') + '</th><td>' + dur(L.tr) + '</td></tr>'
    + '<tr><th>COMP FREQ</th><td colspan="7">&nbsp;</td></tr></table>';
  const TL = typeof tlItems === 'function' ? tlItems(L) : [];
  if (TL.length) h += '<h2>⏱ ' + XS('起飞前时间轴', 'Pre-departure timeline') + '</h2><table><tr><th>UTC</th><th>STD −</th><th>' + XS('事项', 'Item') + '</th></tr>' + TL.map(s => '<tr><td>' + hmZ(s.t) + 'Z</td><td>' + s.min + '</td><td><span class="chk"></span>' + esc(s.zh) + (s.en && s.en !== s.zh ? ' · ' + esc(s.en) : '') + '</td></tr>').join('') + '</table>';
  if (L.w) { const w = (typeof wFix === 'function' && wFix(L)) || L.w, z = (typeof zfwOf === 'function' && zfwOf(L)) || w.z; h += '<h2>⚖ ' + XS('重量 / 油量', 'Weights / fuel') + '</h2><table><tr><th>ZFW</th><td>' + (z ? T(z) + ' t' : '') + '</td><th>TOW</th><td>' + T(z ? z + w.tof : w.tow) + ' / ' + T(w.towL) + ' t</td><th>LDW</th><td>' + T(z ? z + w.lf : w.ldw) + ' / ' + T(w.lwL) + ' t</td><th>' + XS('落地油', 'LDG fuel') + '</th><td>' + T(w.lf) + ' t</td></tr></table>'; }
  h += '<p class="tm">TEM：Pre-flight（MEL/CDL, Bulletins, Pax）· Taxi · Take-off（performance, NADP）· Departure · En route（CRAR, Reporting, ADIZ, CPDLC, HF, IFBP, Oceanic, SLOP, Contingency）· Arrival · Approach · Missed approach · Landing · Taxi/Parking · Alternate</p>';
  // 每一部分：有 AI 要点就用要点（说人话），原文放到最后的附录；没有就直接放原文
  S.forEach(x => { const a = AI && AI.secs && AI.secs[x.id];
    h += '<h2>' + esc(x.title) + '</h2>' + (a ? (a.points.length ? '<ul class="ai">' + a.points.map(p => '<li class="' + esc(p.lv) + '">' + esc(p.t) + '</li>').join('') + '</ul>' : '<p class="tm">✓ ' + XS('没有需要特别注意的', 'Nothing significant') + '</p>') : x.raw); });
  h += '<h2>🧰 ' + XS('航路机场：CAN WE', 'En-route airports: CAN WE') + '</h2><p>' + ['Can we get there (range)', 'Do the approach and landing (wx vs minima)', 'Stop (most limiting LDA vs LDR)', 'Turn-around (ground ops)', 'Go-around (performance)', 'Plan B'].map(t => '<span class="chk"></span>' + esc(t)).join('<br>') + '</p>';
  h += '<h2>📚 ' + XS('参考工具（逐项打勾）', 'Reference tools') + '</h2><p>' + PKG_TOOLS.map(t => '<span class="chk"></span>' + esc(t)).join('　') + '</p>';
  if (AI) h += '<div class="app"><h2>📎 ' + XS('附录：原文（核对用）', 'Appendix: original text') + '</h2>' + S.map(x => '<h3>' + esc(x.title) + '</h3>' + x.raw).join('') + '</div>';
  h += '<div class="disc">' + XS('仅供辅助了解情况，不能替代官方航行情报、公司运行程序（OM / LIDO）及 ATC 指令。要点由 AI 整理，代号和数字已和原文核对，仍以原文为准。', 'Awareness aid only. AI summaries — the original text prevails.') + '</div></body></html>';
  return h;
}
// 手机上直接看（离线）；「☁️ 生成 PDF」= 交给后台转 PDF，存到云端（iPad / 电脑下载）
function openPkg() {
  const L = CUR; if (!L || L.noOfp) { MSG = XS('先读入 OFP', 'Load an OFP first'); draw(); return; }
  const sh = $('sheet'); sh.style.display = 'block'; sh.scrollTop = 0;
  sh.innerHTML = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:16px">📑 ' + XS('简报包', 'Briefing package') + '</b><span style="flex:1"></span><span class="btn" id="pk-ai">🤖 ' + XS('AI 整理', 'AI rewrite') + '</span><span class="btn" id="pk-pdf">☁️ PDF</span><span class="btn" id="sh-x">✕</span></div><div id="pk-st" class="ok"></div><iframe id="pk-f" style="width:100%;height:calc(100vh - 90px);border:1px solid #999;background:#fff"></iframe>';
  $('pk-f').srcdoc = pkgHtml(L);
  $('sh-x').onclick = () => { sh.style.display = 'none'; draw(); };
  $('pk-ai').onclick = async () => { $('pk-st').textContent = '⏳ ' + XS('AI 正在逐段整理（30–90 秒）…', 'AI rewriting (30–90 s)…'); try { await pkgAiRun(L); $('pk-f').srcdoc = pkgHtml(L); $('pk-st').textContent = '✅ ' + XS('AI 整理好了', 'Done'); } catch (e) { $('pk-st').textContent = '⚠️ ' + e.message; } };
  $('pk-pdf').onclick = async () => { $('pk-st').textContent = '⏳ ' + XS('后台生成 PDF…', 'Making the PDF…'); const r = await pkgUpload(L, true); $('pk-st').textContent = r ? '✅ ' + XS('PDF 已存到云端（iPad：工具 → 📑 简报包）', 'PDF saved to the cloud') : '⚠️ ' + XS('没成功（要联网）', 'Failed (needs network)'); };
}
async function pkgUpload(L, force) {
  if (!navigator.onLine || !ls('key')) return false; const k = String(L.k).replace(/[^\w.-]/g, '');
  if (!force && ls('pkg.' + k)) return true;
  try { if (!pkgAiGet(L)) await pkgAiRun(L); } catch (e) {}   // 先让 AI 整理成「说人话」版
  try { const j = await postK({ action: 'pkgpdf', k, html: pkgHtml(L) }); if (j && j.ok) { ls('pkg.' + k, String(Date.now())); return true; } } catch (e) {}
  return false;
}
// 自动：STD 前 150 分钟以内（坐车去机场的时候）生成一次 PDF 放到云端
function pkgAuto(L, now) { if (!L || L.noOfp || DEMO) return; const k = String(L.k).replace(/[^\w.-]/g, ''); if (ls('pkg.' + k)) return;
  if (now < L.std - 150 * MIN || now > L.std) return; if (pkgAuto.busy) return; pkgAuto.busy = 1; pkgUpload(L, false).then(() => { pkgAuto.busy = 0; }); }
