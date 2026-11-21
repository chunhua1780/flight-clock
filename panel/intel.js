/* Flight Intelligence on the Panel — everything here works offline.
   · Position: phone GPS (works in airplane mode, no internet) → otherwise the OFP plan (STD/ATD + time over waypoints)
   · FIR/UIR: offline boundary database (fir.json, VATSpy Data Project, CC BY-SA 4.0) → small label in the map corner
   · Area alerts: your Flight Intelligence database (reviewed, in-date items only) × the route ahead × altitude × time
   Uses globals from index.html: ls, X, esc, MIN, HOUR, postK, LANG, hmZ */
'use strict';
// ---------- 1. Real-time position: GPS > plan ----------
const GPS = { fix: null, web: false };
function gpsRead() {
  try { if (window.AndroidPanel && AndroidPanel.gps) { const s = AndroidPanel.gps(); if (s) GPS.fix = JSON.parse(s); } } catch (e) {}
  const f = GPS.fix; if (!f) return null;
  // GPS 卡住了（位置 3 分钟都没变，地速却很大）：不用，改用估算
  const key = f.lat.toFixed(4) + ',' + f.lon.toFixed(4); if (key !== GPS.lk) { GPS.lk = key; GPS.lkt = Date.now(); }
  if (f.gs > 80 && Date.now() - GPS.lkt > 3 * 60e3) return null;
  return Date.now() - f.t < 3 * 60e3 && (f.acc < 0 || f.acc < 500) ? f : null;   // older than 3 minutes = not used
}
(function webGps() {   // web version (iPad / computer): browser location, if the device has GPS
  if (window.AndroidPanel || !navigator.geolocation) return;
  try { navigator.geolocation.watchPosition(p => { const c = p.coords; GPS.web = true;
    GPS.fix = { lat: c.latitude, lon: c.longitude, alt: c.altitude != null ? Math.round(c.altitude * 3.28084) : -1, gs: c.speed != null ? Math.round(c.speed * 1.94384) : -1, trk: c.heading != null && !isNaN(c.heading) ? Math.round(c.heading) : -1, acc: Math.round(c.accuracy || -1), t: p.timestamp || Date.now() }; },
    () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 }); } catch (e) {}
})();
const gpsPerm = () => { try { return !window.AndroidPanel || !AndroidPanel.gpsOk || AndroidPanel.gpsOk(); } catch (e) { return true; } };
const NMr = Math.PI / 180;
function gcNm(a, b) { const x = Math.sin((b[0] - a[0]) * NMr / 2) ** 2 + Math.cos(a[0] * NMr) * Math.cos(b[0] * NMr) * Math.sin((b[1] - a[1]) * NMr / 2) ** 2; return 3440 * 2 * Math.asin(Math.min(1, Math.sqrt(x))); }
// Project the GPS position onto the route → the "route minute" the aircraft is actually at (search near the planned position so a route that crosses itself is OK)
function gpsOnRoute(N, f, elPlan) {
  if (!N.length) return null; let best = null;
  for (let i = 1; i < N.length; i++) { const a = N[i - 1], b = N[i];
    const k = Math.cos(f.lat * NMr), ax = (a[3] - f.lon) * k, ay = a[2] - f.lat, bx = (b[3] - f.lon) * k, by = b[2] - f.lat, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, d = Math.hypot(ax + dx * t, ay + dy * t) * 60, el = a[1] + (b[1] - a[1]) * t;
    const sc = d + Math.max(0, Math.abs(el - elPlan) - 45) * 2;   // a mismatch of more than 45 minutes against the plan counts against it
    if (!best || sc < best.sc) best = { sc, d, el, i }; }
  return best;
}
// The effective state: position, route minute, phase, altitude, data source
function liveState(L, now, off, on) {
  const N = (L.n || []).filter(w => w.length >= 4), elPlan = (now - off) / MIN;
  let ph = now < off ? 0 : now < on ? 1 : 2, el = elPlan, src = 'PLAN', alt = null, gs = null, P = null, dOff = null;
  const f = DEMO ? null : gpsRead();
  if (f) {
    P = [f.lat, f.lon]; alt = f.alt >= 0 ? f.alt : null; gs = f.gs >= 0 ? f.gs : null; src = 'GPS';
    const r = gpsOnRoute(N, f, elPlan);
    if (r && r.d < 150) { el = r.el; dOff = r.d; if (gs != null && gs > 80) ph = 1; else if (gs != null && gs < 40 && ph === 1 && (elPlan < 10 || elPlan > L.tr - 10)) ph = el > L.tr / 2 ? 2 : 0; }
  }
  return { el, ph, src, alt, gs, P, dOff };
}

// ---------- 2. FIR/UIR: offline boundaries ----------
let FIRB = null;
fetch('fir.json').then(r => r.json()).then(j => { FIRB = j.f.map(f => { const rings = f.r.map(a => { const pts = []; for (let k = 0; k < a.length; k += 2) pts.push([a[k], a[k + 1]]); return pts; });
  const bb = [180, 90, -180, -90]; rings.forEach(r => r.forEach(([x, y]) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); })); return { id: f.id, n: f.n, a: f.a, rings, bb }; });
  try { draw(); } catch (e) {} }).catch(() => {});
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
// The FIR the aircraft is in: one of the OFP FIRs if possible (their names are official), otherwise the largest boundary containing the point (a FIR, not a sector)
function firHere(lat, lon, L) {
  // 先用你上传的 FIR / 管制区边界
  const U = ((FIDB && FIDB.items) || []).filter(x => x.kind === 'area' && /^(FIR|UIR)$/.test(x.type) && fiUsable(x, Date.now())).find(x => { const G = fiGeom(x); return G && inGeom(G, lat, lon); });
  if (U) return { id: U.fir || U.name, label: (/FIR|UIR/.test(U.name) ? U.name : U.name + ' ' + U.type) + (U.fir && U.name.indexOf(U.fir) < 0 ? ' – ' + U.fir : '') };
  if (!FIRB) return null;
  const C = FIRB.filter(f => !(lon < f.bb[0] || lon > f.bb[2] || lat < f.bb[1] || lat > f.bb[3]) && f.rings.some(r => inRing(lon, lat, r))); if (!C.length) return null;
  const ofp = {}; (L && L.fi || []).forEach(x => { ofp[x[1]] = x[0]; ofp[FIRALIAS[x[1]] || x[1]] = x[0]; });
  const hit = C.find(f => ofp[f.id]); const f = hit || C.sort((a, b) => b.a - a.a)[0];
  const nm = (hit ? ofp[f.id] : f.n).toUpperCase().replace(/\s+-\s+.*$/, '');
  return { id: f.id, label: (/FIR|UIR|OCEANIC|CONTROL/.test(nm) ? nm : nm + ' FIR') + ' – ' + f.id };
}
const FIRGEO = { KZWY: 'KZNY' };   // 边界库里没有单独的代码：New York Oceanic 在 KZNY 里
function firRings(code) { if (!FIRB || !code) return null; const id = FIRGEO[code] || code; let F = FIRB.filter(x => x.id === id); if (!F.length) F = FIRB.filter(x => x.id === (FIRALIAS[code] || code)); return F.length ? [].concat.apply([], F.map(f => f.rings)) : null; }

// ---------- 3. Flight Intelligence database (downloaded when online, used offline) ----------
let FIDB = null, WPTI = {}, WPTL = []; try { FIDB = JSON.parse(ls('fidb') || 'null'); } catch (e) {}
// 上传的航路点：按名字索引（补 OFP 里缺坐标的点、地图上显示）
function fiIndex() { WPTI = {}; WPTL = []; FIG = {}; ((FIDB && FIDB.items) || []).forEach(x => { if (x.kind !== 'wpt') return; (WPTI[x.name] = WPTI[x.name] || []).push([x.lat, x.lon]); WPTL.push(x); }); }
function wptFix(id, near) { const a = WPTI[id]; if (!a || !a.length) return null; if (!near || a.length === 1) return a[0]; return a.slice().sort((p, q) => gcNm(p, near) - gcNm(q, near))[0]; }
const BOUNDARY = /^(FIR|UIR|CTA|TMA)$/;
async function fiSync() {
  if (!navigator.onLine || !ls('key') || Date.now() - +(ls('fit') || 0) < 10 * MIN) return;
  try { const j = await postK({ action: 'figet' }); if (j && j.ok && j.db) { FIDB = j.db; try { localStorage.setItem('pnl.fidb', JSON.stringify(FIDB)); } catch (e) { MSG = '⚠️ ' + X('数据库太大，手机只能临时保存（重开要联网）', 'Database too large to store offline'); } ls('fit', String(Date.now())); fiIndex(); } } catch (e) {}
}
// Usable only if reviewed and in date; unreviewed / expired items are listed but never alert
const fiUsable = (x, t) => x.kind !== 'wpt' && x.status === 'approved' && !(x.to && Date.parse(x.to) < t) && !(x.from && Date.parse(x.from) > t + 24 * HOUR);
const fiActiveAt = (x, t) => !(x.to && Date.parse(x.to) < t) && !(x.from && Date.parse(x.from) > t);
let FIG = {};
function fiGeom(x) {   // rings as [lon,lat] arrays
  if (FIG[x.id]) return FIG[x.id]; let R = null;
  if (x.poly && x.poly.length >= 3) R = [x.poly.map(p => [p[1], p[0]])];
  else if (x.circle && x.circle.nm) { const c = x.circle, p = []; for (let a = 0; a < 360; a += 10) p.push([c.lon + c.nm / 60 * Math.sin(a * NMr) / Math.cos(c.lat * NMr), c.lat + c.nm / 60 * Math.cos(a * NMr)]); R = [p]; }
  else if (x.firOnly) R = x.firs && x.firs.length ? [].concat.apply([], x.firs.map(c => firRings(c) || [])) : firRings(x.fir);   // firs：几个管制区合成一块（例如整个中国空域）
  if (R && !R.length) R = null;
  if (R) { const bb = [180, 90, -180, -90]; R.forEach(r => r.forEach(([a, b]) => { bb[0] = Math.min(bb[0], a); bb[1] = Math.min(bb[1], b); bb[2] = Math.max(bb[2], a); bb[3] = Math.max(bb[3], b); })); FIG[x.id] = { R, bb }; }
  return R ? FIG[x.id] : null;
}
const inGeom = (G, lat, lon) => !(lon < G.bb[0] || lon > G.bb[2] || lat < G.bb[1] || lat > G.bb[3]) && G.R.some(r => inRing(lon, lat, r));
function edgeNm(G, lat, lon) { let d = 1e9; G.R.forEach(r => r.forEach(p => { d = Math.min(d, gcNm([lat, lon], [p[1], p[0]])); })); return d; }
// Alerts: walk the route ahead minute by minute (next 3 hours) — first point inside the area, at a level inside its vertical limits, while it is active
function fiAlerts(L, S, off, now) {
  const out = []; if (!FIDB || !FIDB.items) return out;
  const N = (L.n || []).filter(w => w.length >= 4); if (!N.length && !S.P) return out;
  const cum = cumNm(N);
  FIDB.items.forEach(x => {
    if (!fiUsable(x, now) || (BOUNDARY.test(x.type) && !x.msg && !x.msgEn)) return; const G = fiGeom(x); if (!G) return;   // 只是边界（FIR 等）的不提醒
    const lo = (+x.lower || 0) - 1000, hi = (x.upper ? +x.upper : 99999) + 1000;
    const here = S.P || (wpos(L, S.ph === 0 ? -1 : S.ph === 2 ? 1e9 : S.el) || {}).p, altNow = S.alt != null ? S.alt : altAt(L, S.ph, S.el);
    if (here && inGeom(G, here[0], here[1]) && altNow >= lo && altNow <= hi && fiActiveAt(x, now)) { out.push({ x, state: 'in', min: 0, nm: 0 }); return; }
    if (S.ph === 2) return;
    const e0 = Math.max(0, S.el), eMax = Math.min(L.tr, e0 + 180);
    for (let m = e0; m <= eMax; m += 1) {
      const p = (wpos(L, m) || {}).p; if (!p || !inGeom(G, p[0], p[1])) continue;
      const a = altAt(L, 1, m); if (a < lo || a > hi || !fiActiveAt(x, off + m * MIN)) continue;
      const nm = Math.max(0, alongNm(N, cum, m) - alongNm(N, cum, e0)) + (S.ph === 0 ? 0 : 0);
      out.push({ x, state: 'ahead', min: m - e0 + (S.ph === 0 ? (off - now) / MIN : 0), nm }); return;
    }
    if (S.P && !N.length) { const d = edgeNm(G, S.P[0], S.P[1]); if (d <= (x.alertNm || 30)) out.push({ x, state: 'near', min: null, nm: d }); }
  });
  // Trigger only inside the reminder distance / time
  return out.filter(a => a.state !== 'ahead' || (x => a.min <= (x.alertMin || 0) || a.nm <= (x.alertNm || 0))(a.x))
    .sort((a, b) => LVR[b.x.level] - LVR[a.x.level] || (a.min || 0) - (b.min || 0));
}
const LVR = { warning: 3, caution: 2, info: 1 };
function cumNm(N) { const c = [0]; for (let i = 1; i < N.length; i++) c.push(c[i - 1] + gcNm([N[i - 1][2], N[i - 1][3]], [N[i][2], N[i][3]])); return c; }
function alongNm(N, cum, el) { if (!N.length) return 0; if (el <= N[0][1]) return 0; for (let i = 1; i < N.length; i++) if (el <= N[i][1]) { const k = (el - N[i - 1][1]) / Math.max(.5, N[i][1] - N[i - 1][1]); return cum[i - 1] + (cum[i] - cum[i - 1]) * k; } return cum[cum.length - 1]; }

// ---------- 4. Acknowledge + sound ----------
const ackKey = (L, a) => 'ack.' + L.k + '.' + a.x.id + '.' + (a.x.ver || 0) + (a.state === 'in' && a.x.repeatMin ? '.r' + Math.floor(NOW() / (a.x.repeatMin * MIN)) : '');
const acked = (L, a) => !!ls(ackKey(L, a));
let ACTX = null, BEEPED = {};
function beep(n, hi) {
  if (ls('snd') === 'off') return;
  try { ACTX = ACTX || new (window.AudioContext || window.webkitAudioContext)(); if (ACTX.state === 'suspended') ACTX.resume();
    for (let i = 0; i < n; i++) { const o = ACTX.createOscillator(), g = ACTX.createGain(), t = ACTX.currentTime + i * .32; o.frequency.value = hi ? 1250 : 880; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .22); o.connect(g).connect(ACTX.destination); o.start(t); o.stop(t + .25); } } catch (e) {}
}
// Warning: 3 high beeps, repeated every 2 minutes until acknowledged · Caution: one beep when it appears · Info: silent
function alertSound(L, list) {
  const now = Date.now(); list.forEach(a => { if (acked(L, a) || DEMO) return; const k = ackKey(L, a), last = BEEPED[k] || 0;
    if (a.x.level === 'warning' && now - last > 115e3) { BEEPED[k] = now; beep(3, true); }
    else if (a.x.level === 'caution' && !last) { BEEPED[k] = now; beep(1, false); } });
}
const fmtMin = m => m == null ? '' : m < 1 ? XS('现在', 'now') : m < 60 ? Math.round(m) + ' min' : Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0');
const flLab = v => v >= 99999 ? 'UNL' : !v ? 'SFC' : v >= 10000 ? 'FL' + Math.round(v / 100) : v + 'ft';
// 「要做的事」清单（通讯：CPDLC 登录、RCL、联系频率……）
// 广播 / 喊话模板：把 {call_sign} 这些换成这一班此刻的数据
function fillPhrase(t) { const L = CUR; if (!L || !t) return t || ''; const now = NOW(), off = offOf(L), el = (now - off) / MIN, N = (L.n || []).filter(w => w.length >= 4);
  const nx = N.find(w => w[1] > el), pv = N.filter(w => w[1] <= el).slice(-1)[0], P = (wpos(L, el) || {}).p, fh = P ? firHere(P[0], P[1], L) : null;
  const trk = nx && pv ? (Math.atan2(dlon(nx[3], pv[3]) * Math.cos(pv[2] * Math.PI / 180), nx[2] - pv[2]) * 180 / Math.PI + 360) % 360 : 0;
  const fl = GPS.fix && GPS.fix.alt > 5000 && !DEMO ? Math.round(GPS.fix.alt / 1000) * 10 : Math.round((L.fl || 35000) / 100);
  const V = { call_sign: csOf(L), current_fir: fh ? fh.label.replace(/ – .*/, '') : '', current_position: pv ? pv[0] : '', current_time_utc: hmZ(now), flight_level: fl, direction: trk < 180 ? 'EAST' : 'WEST', airway: '(AWY)',
    next_wpt_or_crossing_awy: nx ? nx[0] : '', next_est_time_utc: nx ? hmZ(off + nx[1] * MIN) : '', next_wpt: (N[N.indexOf(nx) + 1] || [''])[0] };
  return t.replace(/\{(\w+)\}/g, (m, k) => V[k] != null && V[k] !== '' ? V[k] : m); }
function actList(x) { const A = (x.actions || []).concat(x.phrase ? [{ zh: '📻 ' + fillPhrase(x.phrase), en: '' }] : []); if (!A.length) return '';
  return '<ol class="acts">' + A.map(t => '<li>' + esc(LANG === 'en' ? (t.en || t.zh) : (t.zh || t.en)) + (LANG === 'both' && t.en && t.zh ? '<small>' + esc(t.en) + '</small>' : '') + '</li>').join('') + '</ol>'; }
function alertHtml(L, list) {
  return list.map(a => { const x = a.x, ok = acked(L, a), txt = LANG === 'en' ? (x.msgEn || x.msg) : (x.msg || x.msgEn);
    const when = a.state === 'proc' ? a.label : x.kind === 'wac' ? fmtMin(a.min) : a.state === 'in' ? XS('已在区内', 'INSIDE') : a.state === 'near' ? Math.round(a.nm) + ' NM' : fmtMin(a.min) + ' · ' + Math.round(a.nm) + ' NM';
    return '<div class="al ' + esc(x.level) + (ok ? ' ack' : '') + '" data-ak="' + esc(ackKey(L, a)) + '" data-id="' + esc(x.id) + '"><b>' + (x.level === 'warning' ? '⛔ ' : x.level === 'caution' ? '⚠︎ ' : 'ⓘ ') + esc(x.name) + '</b> <span class="aw">' + esc(when) + '</span>'
      + (ok ? '' : '<div class="at">' + esc(txt || '') + (LANG === 'both' && x.msgEn && x.msg ? '<small>' + esc(x.msgEn) + '</small>' : '') + '</div>' + actList(x) + '<div class="am">' + esc(x.kind === 'wac' ? XS('点开看全文', 'tap for details') : /^(crew|tl|rule|proc)$/.test(x.kind) ? '' : (x.fir || '') + ' · ' + flLab(+x.lower || 0) + '–' + flLab(x.upper ? +x.upper : 99999)) + ' <span class="ack-b">✓ ' + XS('确认', 'ACK') + '</span></div>') + '</div>'; }).join('');
}
function fiDetail(id) {
  if (PSEUDO[id] && PSEUDO[id].wac) return wacDetail(PSEUDO[id]);
  const x = PSEUDO[id] || (FIDB && FIDB.items.find(y => y.id === id)); if (!x) return;
  $('sheet').innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">🛰 ' + esc(x.name) + '</b><span style="flex:1"></span><span class="btn" id="sh-x">✕</span></div>'
    + '<div class="nt' + (x.level === 'warning' ? ' red' : '') + '"><div class="zh">' + esc(x.msg || '') + '</div><div>' + esc(x.msgEn || '') + '</div><div class="tm">' + esc(x.type) + ' · ' + esc(x.fir || '') + ' ' + esc(x.firName || '') + ' · ' + flLab(+x.lower || 0) + '–' + flLab(x.upper ? +x.upper : 99999)
    + ' · ' + X('生效 ', 'from ') + esc(x.from ? x.from.slice(0, 16).replace('T', ' ') + 'Z' : '—') + ' ' + X('到 ', 'to ') + esc(x.to ? x.to.slice(0, 16).replace('T', ' ') + 'Z' : 'PERM') + (x.sched ? ' · ' + esc(x.sched) : '') + '</div>'
    + (x.phases ? x.phases.map(p => '<div style="margin-top:8px;font-weight:900' + (PH_NOW[x.id] === p.key ? ';color:var(--red)' : '') + '">' + (PH_NOW[x.id] === p.key ? '▶ ' : '') + esc(LANG === 'en' ? p.en : p.zh) + '</div><ol style="margin:3px 0 0 18px;padding:0">' + p.steps.map(t => '<li style="margin:3px 0">' + esc(LANG === 'en' ? t.en : t.zh) + (LANG === 'both' ? '<div class="en">' + esc(t.en) + '</div>' : '') + '</li>').join('') + '</ol>').join('') : '')
    + actList(x) + (x.notes ? '<div style="margin-top:6px">' + esc(x.notes) + '</div>' : '') + (x.quote ? '<div class="en">“' + esc(x.quote) + '”</div>' : '')
    + '<div class="tm" style="margin-top:6px">📄 ' + esc((x.src && x.src.file) || X('手动', 'manual')) + ' · ver ' + (x.ver || 1) + ' · ' + X('审核 ', 'reviewed ') + (x.rev ? new Date(x.rev.at).toISOString().slice(0, 10) : '—') + ' · DB v' + (FIDB.v || 0) + '</div></div>'
    + '<div class="ok" style="font-size:12px">' + X('仅供辅助，不能替代官方航行情报、公司程序及 ATC 指令', 'Awareness aid only — official AIS, company procedures and ATC prevail') + '</div>';
  $('sheet').style.display = 'block'; $('sh-x').onclick = () => { $('sheet').style.display = 'none'; draw(); };
}
// Draw the reviewed areas near the route on the map (light purple; red when alerting)
function fiDrawMap(g, xy, hot, W, H) {
  if (!FIDB || !FIDB.items) return; const t = NOW();
  // 上传的航路点（放大到 600 海里以内才画，灰色小三角）
  if (W && ZOOM <= 600 && WPTL.length) { const vis = []; for (const w of WPTL) { const q = xy(w.lat, w.lon); if (q[0] > -10 && q[0] < W + 10 && q[1] > -10 && q[1] < H + 10) { vis.push([q, w.name]); if (vis.length > 400) break; } }
    g.fillStyle = '#888'; g.font = '10px sans-serif'; vis.forEach(([q, n]) => { g.beginPath(); g.moveTo(q[0], q[1] - 4); g.lineTo(q[0] + 3.5, q[1] + 2.5); g.lineTo(q[0] - 3.5, q[1] + 2.5); g.closePath(); g.fill(); if (vis.length < 120) g.fillText(n, q[0] + 5, q[1] + 3); }); }
  FIDB.items.forEach(x => { if (!fiUsable(x, t)) return; const G = fiGeom(x); if (!G || ((x.firOnly || BOUNDARY.test(x.type)) && !hot[x.id]) || G.bb[2] - G.bb[0] > 300) return;   // 环绕地球的纬度带（极区）不画
    const h = hot[x.id], big = x.firOnly || BOUNDARY.test(x.type); g.strokeStyle = h ? '#d00000' : '#7a3db8'; g.fillStyle = big ? 'rgba(0,0,0,0)' : h ? 'rgba(208,0,0,.10)' : 'rgba(122,61,184,.08)'; g.lineWidth = big ? 1.3 : h ? 2.5 : 1.6; g.setLineDash(big ? [8, 5] : h ? [] : [5, 3]);   // 整个 FIR 的提醒：只画细虚线边界，不铺颜色
    G.R.forEach(r => { g.beginPath(); r.forEach((p, i) => { const q = xy(p[1], p[0]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.stroke(); });
    g.setLineDash([]); const q = xy(G.R[0][0][1], G.R[0][0][0]); g.fillStyle = h ? '#d00000' : '#7a3db8'; g.font = 'bold 11px sans-serif'; g.fillText(x.name.slice(0, 22), q[0] + 3, q[1] - 3); });
}

fiIndex();
// OFP 里缺坐标的航路点：用上传的航路点数据库补上（同名的取离上一个点最近的）
function wptFill(N, FX) { let prev = null; N.forEach(w => { if (FX[w.id]) { prev = FX[w.id]; return; } const p = wptFix(w.id, prev); if (p && (!prev || gcNm(p, prev) < 600)) { FX[w.id] = p; prev = p; } }); return FX; }
// 上传的 NOTAM（这个机场 / FIR 的）
function fiNotams(loc, t) { return ((FIDB && FIDB.items) || []).filter(x => x.kind === 'notam' && x.loc === loc && fiUsable(x, t)); }

// 程序类（没有区域，按条件出现）：GPS SI —— 起飞 / 目的地机场有 GPS 干扰 NOTAM 时，按阶段提醒；机场类 —— 从这些机场起飞时提醒
const PH_NOW = {};
const GNSS_RE = /\b(GNSS|GPS|RAIM)\b/, GNSS_BAD = /INTERFERENCE|JAMM|SPOOF|UNRELIAB|U\/S|NOT AVBL|OUTAGE|DEGRAD|UNAVBL|DISRUPT/;
function gnssAt(L, icao, t) { return ((L.nt && L.nt[icao]) || []).some(n => GNSS_RE.test(n[1]) && GNSS_BAD.test(n[1]) && !(n[3] && n[3] < t - 60 * MIN) && !(n[2] && n[2] > t + 60 * MIN)); }
// 条件：起飞 / 目的地机场（全名或前缀，例如 K = 美国）、航路经过的管制区
const icaoIn = (c, list) => !!c && (list || []).some(p => c.indexOf(p) === 0);
function procMatch(T, L) {
  if (!T || typeof T !== 'object') return false;
  if (T.dep && !icaoIn(L.dep, T.dep)) return false; if (T.arr && !icaoIn(L.arr, T.arr)) return false;
  if (T.arrExclude && icaoIn(L.arr, T.arrExclude)) return false; if (T.depExclude && icaoIn(L.dep, T.depExclude)) return false;
  if (T.route && !(L.fi || []).some(f => icaoIn(f[1], T.route) || icaoIn(FIRALIAS[f[1]] || '', T.route))) return false;
  return !!(T.dep || T.arr || T.route);
}
// 程序类：按条件和阶段出现。阶段：dep 起飞前（before = STD 前多少分钟开始）、toc 起飞后 1 小时内、dest 落地前（before 分钟，默认 100）
function procAlerts(L, S, off, now) {
  const out = []; if (!FIDB || !FIDB.items) return out;
  FIDB.items.forEach(x => {
    if (x.kind !== 'proc' || x.trigger === 'timeline' || !fiUsable(x, now) || !fiActiveAt(x, now)) return;
    let key = null, lab = '';
    if (x.trigger === 'gnss') { return;   // 改用航班号下面的简短 GPS 干扰提醒（gpscShow）

      const depG = gnssAt(L, L.dep, off), arrG = gnssAt(L, L.arr, off + L.tr * MIN);
      if (depG && (S.ph === 0 || S.el < 15)) { key = 'dep'; lab = XS('起飞机场 GPS 干扰', 'DEP GPS SI'); }
      else if (depG && S.ph === 1 && S.el < 60) { key = 'toc'; lab = XS('TOC 后恢复 GPS', 'At TOC'); }
      else if (arrG && S.ph === 1 && S.el >= L.tr - 100) { key = 'dest'; lab = XS('目的地 GPS 干扰 · TOD 前', 'DEST GPS SI · before TOD'); }
    } else if (procMatch(x.trigger, L)) {
      const P = x.phases || [], toStd = (L.std - now) / MIN;
      const d = P.find(q => q.key === 'dep'), t = P.find(q => q.key === 'toc'), a = P.find(q => q.key === 'dest' || q.key === 'arr');
      if (d && S.ph === 0 && toStd <= (d.before || 9999)) { key = 'dep'; lab = XS('起飞前', 'Before departure'); }
      else if (t && S.ph === 1 && S.el < 60) { key = 'toc'; lab = XS('起飞后', 'After take-off'); }
      else if (a && S.ph === 1 && L.tr - S.el <= (a.before || 100)) { key = a.key; lab = XS('落地前 ', 'Before landing ') + dur(L.tr - S.el); }
    }
    if (!key) return; PH_NOW[x.id] = key;
    const p = (x.phases || []).find(q => q.key === key);
    out.push({ x: Object.assign({}, x, { id: x.id, msg: (p ? p.zh + '：' : '') + x.msg, msgEn: (p ? p.en + ': ' : '') + x.msgEn, actions: p ? p.steps : x.actions }), state: 'proc', label: lab, min: 0, nm: 0 });
  });
  return out;
}
// ---------- 起飞前时间轴（按 STD 倒数）：到点闪出要做的事 ----------
function tlItems(L) {
  const T = FIDB && FIDB.items && FIDB.items.find(x => x.kind === 'proc' && x.trigger === 'timeline' && x.status === 'approved'); if (!T) return [];
  const base = /^OM(DB|DW)$/.test(L.dep), ulr = (L.tr || 0) >= 14 * 60;
  return (T.steps || []).filter(s => !s.base || (s.base === 'base' ? base : s.base === 'ulr' ? !base && ulr : !base && !ulr))
    .map(s => ({ t: L.std - s.min * MIN, min: s.min, zh: s.zh, en: s.en, alert: s.alert !== false, id: T.id + '.' + s.min + '.' + (s.en || s.zh).slice(0, 12) })).sort((a, b) => a.t - b.t);
}
// 到点后 6 分钟内、还没确认的：弹出（卡片闪）
function tlAlerts(L, S, now) {
  if (S.ph !== 0) return []; return tlItems(L).filter(s => s.alert && now >= s.t && now < s.t + 6 * MIN).map(s => {
    const x = { id: 'tl:' + s.id, kind: 'tl', name: '⏱ STD−' + s.min + ' · ' + (LANG === 'en' ? s.en : s.zh), level: 'caution', msg: s.zh, msgEn: s.en, actions: [{ zh: s.zh, en: s.en }], ver: 1 };
    PSEUDO[x.id] = x; return { x, state: 'proc', label: hmZ(s.t) + 'Z', min: 0, nm: 0 }; });
}
function tlHtml(L, now) { const I = tlItems(L); if (!I.length) return '';
  const nx = I.find(s => s.t > now);
  return '<h3>⏱ ' + X('起飞前时间轴', 'Pre-departure timeline') + ' · STD ' + hmZ(L.std) + 'Z</h3><div class="tl">' + I.map(s => '<div class="tli' + (s.t <= now ? ' done' : '') + (s === nx ? ' nx' : '') + '"><b>' + hmZ(s.t) + 'Z</b><i>−' + s.min + '</i><span>' + esc(LANG === 'en' ? s.en : s.zh) + (LANG === 'both' && s.en && s.zh ? ' · ' + esc(s.en) : '') + (s.alert ? '' : ' <small>(' + XS('不弹提醒', 'no alert') + ')</small>') + '</span></div>').join('') + '</div>'; }
// 航路经过的特殊管制区：起飞前就要准备的（MEL、设备、频率……）
function routePrep(L) { if (!FIDB || !FIDB.items) return [];
  return FIDB.items.filter(x => (x.preflight || []).length && fiUsable(x, Date.now()) && (L.fi || []).some(f => f[1] === x.fir || (FIRALIAS[f[1]] || '') === x.fir)); }

// ---------- 国家通告：途经国家的空域应急程序（WAC，公司资料：有网时用口令从后台取一次，存在手机上） ----------
const PSEUDO = {};
let WACD = null; try { WACD = JSON.parse(ls('wac') || 'null'); } catch (e) {}
async function wacSync() {
  if (!navigator.onLine || !ls('key') || (WACD && Date.now() - (WACD.got || 0) < 7 * 864e5)) return;
  try { const j = await postK({ action: 'wac' }); if (j && j.ok && j.d) { WACD = typeof j.d === 'string' ? JSON.parse(j.d) : j.d; WACD.got = Date.now(); WPX = null; ls('wac', JSON.stringify(WACD)); } } catch (e) {}
}
// 「说人话」的中文版（后台 AI 翻；只翻接下来航班经过的国家），存在手机上离线用。键 = 国家名|标题
let WACZ = {}; try { WACZ = JSON.parse(ls('waczh') || '{}'); } catch (e) {}
async function waczhSync() {
  if (!navigator.onLine || !ls('key') || !WACD) return; const now = Date.now(), n = new Set();
  LEGS.filter(l => l.std > now - 12 * HOUR && l.std < now + 48 * HOUR).forEach(l => (l.fi || []).forEach(f => wacCountry(FIRALIAS[f[1]] || f[1]).forEach(c => n.add(c.n))));
  const names = [...n].filter(x => (WACD.c.find(c => c.n === x) || { t: [] }).t.some(t => t.x && !WACZ[x + '|' + t.h])); if (!names.length) return;
  for (let i = 0; i < 4; i++) { try { const j = await postK({ action: 'waczh', names }); if (!j || !j.ok) return; Object.assign(WACZ, j.zh || {}); ls('waczh', JSON.stringify(WACZ)); if (!j.left) return; } catch (e) { return; } }
}
const wacH = (c, t) => { const z = WACZ[c.n + '|' + t.h]; return LANG === 'en' || !z || !z.h ? t.h : LANG === 'zh' ? z.h : z.h + ' · ' + t.h; };
let WPX = null;
function wacExpand(list) { const out = []; let base = ''; list.forEach(p => String(p).split('/').forEach(tok => { const m = /\b([A-Z]{1,2})\b/.exec(tok.trim()); if (!m) return; const t = m[1];
  if (t.length === 2) { out.push(t); base = t[0]; } else if (base && out.length) out.push(base + t); else { out.push(t); base = ''; } })); return out; }
function wacCountry(code) { if (!WACD || !code) return [];
  if (!WPX) { WPX = []; WACD.c.forEach(c => wacExpand(c.px).forEach(p => WPX.push([p, c]))); WPX.sort((a, b) => b[0].length - a[0].length); }
  const hit = WPX.find(p => code.indexOf(p[0]) === 0); if (!hit) return []; return WPX.filter(p => p[0] === hit[0]).map(p => p[1]).filter((c, i, a) => a.indexOf(c) === i); }
// 每个国家：进入它的第一个 FIR 前 25 分钟出现，一直留到进入后 10 分钟
function wacAlerts(L, S, off) {
  const out = []; if (!WACD || !L.fi || S.ph === 2) return out; const seen = {}, el = Math.max(0, S.el);
  L.fi.forEach(f => { const code = FIRALIAS[f[1]] || f[1]; wacCountry(code).forEach(c => { if (seen[c.n]) return; seen[c.n] = 1;
    const dt = f[3] - el; if (dt > 25 || dt < -10 || (S.ph === 0 && f[3] > 25)) return;
    const tops = (c.t || []).filter(t => t.x), id = 'wac:' + c.n;
    const x = { id, kind: 'wac', wac: c, name: '🌐 ' + c.n + XS(' 应急程序', ' contingency'), level: 'info', fir: code,
      msg: tops.length ? tops.map(t => wacH(c, t)).join(' · ') : 'CRAR ' + (c.crar || ''), msgEn: tops.length ? tops.map(t => t.h).join(' · ') : 'CRAR ' + (c.crar || ''), ver: 1 };
    PSEUDO[id] = x; out.push({ x, state: 'ahead', min: Math.max(0, dt), nm: 0, label: '' }); }); });
  return out;
}
function wacDetail(x) { const c = x.wac;
  $('sheet').innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">' + esc(x.name) + '</b><span style="flex:1"></span><span class="btn" id="sh-x">✕</span></div>'
    + (c.t || []).map(t => { const z = WACZ[c.n + '|' + t.h], zx = z && LANG !== 'en' ? '<div style="white-space:pre-line;font-size:16px;font-weight:700;line-height:1.5;margin-top:4px">' + esc(z.x) + '</div>' : (LANG !== 'en' && t.x ? '<div class="tm">' + XS('（中文还在翻译，有网时点 🔄 更新）', '') + '</div>' : ''), ex = LANG === 'zh' && z ? '' : '<div class="en" style="white-space:pre-wrap;font-family:inherit;font-size:' + (LANG === 'en' || !z ? '13.5px;color:#000' : '12px;color:#555') + '">' + esc(t.x) + '</div>';
      return '<div class="nt"><b>' + esc(wacH(c, t)) + '</b>' + (t.x ? zx + ex : '<div class="tm">' + XS('（没有内容，查 CRAR ', '(no text, see CRAR ') + esc(c.crar || '') + '）</div>') + '</div>'; }).join('')
    + '<div class="ok" style="font-size:12px">Worldwide Airspace Contingency Flashcards · CRAR ' + esc(c.crar || '') + ' · ' + X('仅供辅助，以公司资料为准', 'awareness only') + '</div>';
  $('sheet').style.display = 'block'; $('sheet').scrollTop = 0; $('sh-x').onclick = () => { $('sheet').style.display = 'none'; draw(); };
}

// ================= 提醒规则（reminders）：在哪里 / 什么时候 + 一步一步要做的事 =================
// 规则：{ kind:'rule', where:{fir|firs|poly|circle|dep|arr|route|any}, lower, upper, steps:[{when, min, nm, show, zh, en}] }
// when：区域类 before_entry / on_entry / after_entry / every / before_exit / on_exit
//       航班类 before_std / after_takeoff / top_of_climb / before_tod / before_landing / after_landing
const RULE_AREA = /^(before_entry|on_entry|after_entry|every|before_exit|on_exit)$/;
const RULE_PH = { before_std: '起飞前', after_takeoff: '起飞后', top_of_climb: '爬升顶点', before_tod: '下降前', before_landing: '落地前', after_landing: '落地后', before_entry: '进入前', on_entry: '进入时', after_entry: '进入后', every: '区内每', before_exit: '离开前', on_exit: '离开时' };
const RULE_PH_EN = { before_std: 'before STD', after_takeoff: 'after T/O', top_of_climb: 'at TOC', before_tod: 'before TOD', before_landing: 'before landing', after_landing: 'after landing', before_entry: 'before entry', on_entry: 'on entry', after_entry: 'after entry', every: 'every', before_exit: 'before exit', on_exit: 'on exit' };
let RULEG = {};
// 这条航线什么时候进、出这个区域（航路分钟；按高度过滤）。同一个航段只算一次
function ruleSpan(L, x) {
  const ck = L.k + '|' + x.id + '|' + (x.ver || 0); if (RULEG[ck] !== undefined) return RULEG[ck];
  const G = fiGeom(Object.assign({ firOnly: !!(x.fir || (x.firs || []).length) }, x)); let r = null;
  if (G) { const lo = (+x.lower || 0) - 1000, hi = (x.upper ? +x.upper : 99999) + 1000, N = (L.n || []).filter(w => w.length >= 4), cum = cumNm(N); let a = null, b = null;
    const spans = [];   // 一条航线可能几次进出同一个区域：每一次都算
    for (let m = 0; m <= L.tr; m++) { const p = (wpos(L, m) || {}).p, al = altAt(L, 1, m), inn = p && inGeom(G, p[0], p[1]) && al >= lo && al <= hi;
      if (inn && a === null) a = m; if (!inn && a !== null) { spans.push([a, m]); a = null; } }
    if (a !== null) spans.push([a, L.tr]);
    if (spans.length) r = { spans, cum, N }; }
  RULEG[ck] = r; return r;
}
function ruleAlerts(L, S, off, now) {
  const out = []; if (!FIDB || !FIDB.items || L.noOfp) return out; const on = off + L.tr * MIN, tod = on - 30 * MIN, toc = off + 20 * MIN;
  FIDB.items.forEach(x => {
    if (x.kind !== 'rule' || !fiUsable(x, now) || !(x.steps || []).length) return;
    const W = x.where || {}, areaR = W.fir || (W.firs || []).length || (W.poly || []).length >= 3 || W.circle;
    if ((W.dep || W.arr || W.route) && !procMatch({ dep: W.dep, arr: W.arr, route: W.route, arrExclude: W.arrExclude, depExclude: W.depExclude }, L)) return;
    const sp0 = areaR ? ruleSpan(L, { id: x.id, ver: x.ver, fir: W.fir, firs: W.firs, poly: W.poly, circle: W.circle, lower: x.lower, upper: x.upper }) : null;
    if (areaR && !sp0) return;   // 这条航线不经过这个区域
    (sp0 ? sp0.spans : [null]).forEach((ab, si) => { const sp = ab ? { a: ab[0], b: ab[1], cum: sp0.cum, N: sp0.N } : null;
    x.steps.forEach((st, i) => { if (si > 0 && !RULE_AREA.test(st.when)) return;   // 航班类步骤只算一次
      let T = null, show = (st.show || 15) * MIN, tag = '';
      const m = +st.min || 0;
      if (RULE_AREA.test(st.when)) { if (!sp) return; const tA = off + sp.a * MIN, tB = off + sp.b * MIN;
        if (st.when === 'before_entry') { if (st.nm) { const dA = alongNm(sp.N, sp.cum, sp.a); let mm = sp.a; while (mm > 0 && dA - alongNm(sp.N, sp.cum, mm) < st.nm) mm--; T = off + mm * MIN; } else T = tA - m * MIN; }
        else if (st.when === 'on_entry') T = tA; else if (st.when === 'after_entry') T = tA + m * MIN;
        else if (st.when === 'every') { if (now < tA || now > tB || !m) return; const k = Math.floor((now - tA) / (m * MIN)); T = tA + k * m * MIN; show = m * MIN; tag = '.' + k; }
        else if (st.when === 'before_exit') T = tB - m * MIN; else if (st.when === 'on_exit') T = tB;
      } else {
        if (st.when === 'before_std') T = L.std - m * MIN; else if (st.when === 'after_takeoff') T = off + m * MIN; else if (st.when === 'top_of_climb') T = toc + m * MIN;
        else if (st.when === 'before_tod') T = tod - m * MIN; else if (st.when === 'before_landing') T = on - m * MIN; else if (st.when === 'after_landing') T = on + m * MIN; else return;
        if (/^(after_takeoff|top_of_climb|before_tod|before_landing)$/.test(st.when) && S.ph !== 1) return;   // 空中才有的：要真的起飞了
      }
      if (T === null || now < T || now >= T + show) return;
      const lab = XS(RULE_PH[st.when] || st.when, RULE_PH_EN[st.when] || st.when) + (st.when === 'every' ? ' ' + m + ' min' : st.nm ? ' ' + st.nm + ' NM' : m ? ' ' + m + ' min' : '');
      const id = 'rule:' + x.id + '.' + i + (si ? '.s' + si : '') + tag, y = { id, kind: 'rule', name: x.name + ' · ' + lab, level: st.level || x.level || 'caution', fir: W.fir || '', msg: st.zh || st.en, msgEn: st.en || st.zh, actions: (st.do || []).length ? st.do : [{ zh: st.zh, en: st.en }], notes: x.notes, quote: x.quote, src: x.src, ver: x.ver || 1, rev: x.rev };
      PSEUDO[id] = y; out.push({ x: y, state: 'proc', label: hmZ(T) + 'Z', min: 0, nm: 0 });
    });
    });
  });
  return out;
}
