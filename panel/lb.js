/* Logbook on the Panel: the same records as the logbook in Flight Assist (cloud = your own Google Drive spreadsheet via your Apps Script).
   Readable and editable offline; changes are queued and synced when online (newest change wins, same as the iPad).
   Uses globals from index.html: ls, X, esc, MIN, postK, hmZ, dmZ, CUR, offOf, csOf */
'use strict';
let LBK = []; try { LBK = JSON.parse(ls('lb') || '[]'); } catch (e) {}
let LBQ = {}; try { LBQ = JSON.parse(ls('lbq') || '{}'); } catch (e) {}   // changes not yet uploaded
const lbSave = () => { ls('lb', JSON.stringify(LBK)); ls('lbq', JSON.stringify(LBQ)); };
let lbMsg = '';
// 家里时钟用 ADS-B 判断的起降时间（和 iPad 一样）。等级：手改 > ADS-B > 估算 > 计划；手改的不动
const LBRK = { man: 3, adsb: 2, est: 1.5, fa: 1, plan: 0 };
async function lbAdsb(e) {
  if (!e || !navigator.onLine) return false;
  try {
    const j = await (await fetch(API + '?action=logtimes&o=' + encodeURIComponent(e.depI || '') + '&d=' + encodeURIComponent(e.arrI || '') + '&t=' + (e.std || e.date) + '&reg=' + encodeURIComponent(e.reg || '') + '&_=' + Date.now(), { cache: 'no-store' })).json();
    if (!j || !j.ok || !j.found || !j.status || !(j.status.off || j.status.on)) return false;
    const st = j.status, y = JSON.parse(JSON.stringify(e)); y.src = y.src || {}; let ch = false;
    const put = (f, v, src) => { if (v && (LBRK[src] || 0) >= (LBRK[y.src[f]] || 0) && y.src[f] !== 'man' && (y[f] !== v || y.src[f] !== src)) { y[f] = v; y.src[f] = src; ch = true; } };
    put('to', st.off, 'adsb'); put('ldg', st.on, 'adsb');
    const ok1 = v => v && st.off && st.off - v > 0 && st.off - v < 180 * MIN, mv = ok1(st.move) ? st.move : ok1(st.taxi) ? st.taxi - 2 * MIN : null;
    if (mv) put('offB', mv, 'adsb'); else if (st.off) put('offB', st.off - Math.min(30, e.taxiP || 15) * MIN, 'est');
    const ib = st.in && st.on && st.in - st.on > 0 && st.in - st.on < 180 * MIN ? st.in : null, lg = st.lastGnd && st.on && st.lastGnd > st.on && st.lastGnd - st.on < 180 * MIN ? st.lastGnd + MIN : 0;
    if (ib) put('onB', ib, 'adsb'); else if (st.on) put('onB', Math.max(st.on + 10 * MIN, lg), 'est');
    if (st.reg && !y.reg) { y.reg = st.reg; ch = true; }
    if (ch) lbPut(y); return ch;
  } catch (x) { return false; }
}
// 最近 3 天落地了、时间还不是 ADS-B / 手改的记录：自动去取
async function lbAutoAdsb() { const now = Date.now(); let n = 0;
  for (const e of LBK.filter(x => x.std > now - 3 * 864e5 && now > (x.ldg || 0) + 20 * MIN && ['to', 'ldg', 'offB', 'onB'].some(f => !x.src || (LBRK[x.src[f]] || 0) < 2)).slice(0, 4)) { if (await lbAdsb(e)) n++; }
  return n; }
async function lbSync() {
  if (!navigator.onLine || !ls('key')) { lbMsg = '📵 ' + X('离线：显示手机里保存的记录，改动有网时再同步', 'Offline — showing saved records; changes sync when online'); return; }
  try { await lbAutoAdsb(); } catch (x) {}
  const send = Object.keys(LBQ).map(k => LBQ[k]);
  const j = await postK({ action: 'lbsync', entries: send, set: null, setU: 0, table: null });
  if (!j || !j.ok) { lbMsg = '⚠️ ' + ((j && j.error) || '?'); return; }
  LBQ = {}; LBK = (j.entries || []).filter(e => !e.del).sort((a, b) => (b.offB || b.date) - (a.offB || a.date)); if (j.set) ls('lbset', JSON.stringify(j.set)); lbSave();
  lbMsg = '✅ ' + XS('已同步 ' + LBK.length + ' 条', 'Synced ' + LBK.length + ' entries');
}
function lbPut(e) { e.u = Date.now(); LBQ[e.k] = e; const i = LBK.findIndex(x => x.k === e.k); if (i >= 0) LBK[i] = e; else LBK.unshift(e); lbSave(); }
const lbHm = m => m > 0 ? Math.floor(m / 60) + ':' + String(Math.round(m % 60)).padStart(2, '0') : '—';
const lbT = t => t ? hmZ(t) : '—';
// A new record for the current flight, in the same format Flight Assist uses (it then works out night time etc.)
function lbFromLeg(L) {
  const k = String(L.k).replace(/[^\w.-]/g, ''); let e = LBK.find(x => x.k === k); if (e) return e;
  let set = {}; try { set = JSON.parse(ls('lbset') || '{}'); } catch (x) {}
  const N = (L.n || []).filter(w => w.length >= 4), to = offOf(L), tx = Math.min(30, L.tx || 15) * MIN;
  e = { k, flt: L.no, cs: csOf(L), date: L.std, dep: L.dep || L.ai, arr: L.arr || L.bi, depI: L.ai, arrI: L.bi, type: (typeof OFP !== 'undefined' && OFP.normType) ? OFP.normType(L.ty || '') : (L.ty || ''), reg: (typeof OFP !== 'undefined' && OFP.normReg) ? OFP.normReg(L.reg || '') : (L.reg || ''),
    role: set.role || 'CAPT', pf: false, pic: '', rmk: '', src: { offB: 'plan', to: 'plan', ldg: 'plan', onB: 'plan' }, std: L.std, taxiP: Math.round(tx / MIN),
    dp: N.length ? [N[0][2], N[0][3]] : null, ap: N.length ? [N[N.length - 1][2], N[N.length - 1][3]] : null, pts: N.filter((w, i) => i === 0 || i === N.length - 1 || i % Math.ceil(N.length / 120) === 0).map(w => [w[2], w[3], w[1]]),
    to, offB: to - tx, ldg: to + L.tr * MIN, onB: to + L.tr * MIN + 8 * MIN };
  if (atdOf(L)) Object.keys(e.src).forEach(f => e.src[f] = 'fa');
  lbPut(e); return e;
}
// ---------- 和 iPad 一样的计算：总时间、空中、夜航（太阳高度）、起降昼夜、机长 / 副驾驶 ----------
const lbSet = () => { let S = {}; try { S = JSON.parse(ls('lbset') || '{}'); } catch (e) {} if (ls('lbfmt')) S.fmt = ls('lbfmt'); return Object.assign({ fmt: 'caac', role: 'CAPT', name: '', lic: '', night: 'auto', bf: {} }, S); };
const lbThr = S => S.night === 'sun' ? -0.833 : S.night === 'civil' ? -6 : S.fmt === 'caac' ? -0.833 : -6;   // 中国民航：日落到日出；EASA/ICAO：昏影终到晨光始
function lbPos(e, t) { if (t <= e.to || !e.pts || e.pts.length < 2) return t <= e.to || !e.pts ? e.dp : e.ap; if (t >= e.ldg) return e.ap;
  const P = e.pts, plan = P[P.length - 1][2] || 1, m = (t - e.to) / Math.max(MIN, e.ldg - e.to) * plan;
  for (let i = 1; i < P.length; i++) if (P[i][2] >= m) { const a = P[i - 1], b = P[i], f = (m - a[2]) / Math.max(.01, b[2] - a[2]); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; } return e.ap; }
const lbPf = e => [e.pfTo != null ? !!e.pfTo : !!e.pf, e.pfLdg != null ? !!e.pfLdg : !!e.pf];
function lbCalc(e, S) {
  const ok = e.offB && e.to && e.ldg && e.onB && e.onB > e.offB, th = lbThr(S), night = (p, t) => p && sunEl(t, p[0], p[1]) < th;
  const r = { blk: ok ? Math.round((e.onB - e.offB) / MIN) : 0, air: e.to && e.ldg && e.ldg > e.to ? Math.round((e.ldg - e.to) / MIN) : 0, night: 0 };
  r.block = S.ftime === 'air' ? r.air : r.blk; if (!ok) return r;
  const t0 = S.ftime === 'air' ? e.to : e.offB, t1 = S.ftime === 'air' ? e.ldg : e.onB;
  for (let t = t0 + 30e3; t < t1; t += MIN) if (night(lbPos(e, t), t)) r.night++;
  const toN = night(e.dp, e.to), ldN = night(e.ap, e.ldg), pf = lbPf(e), cap = (e.role || S.role) === 'CAPT';
  return Object.assign(r, { pic: cap ? r.block : 0, cop: cap ? 0 : r.block, ifr: r.block, toD: pf[0] && !toN ? 1 : 0, toNn: pf[0] && toN ? 1 : 0, ldD: pf[1] && !ldN ? 1 : 0, ldNn: pf[1] && ldN ? 1 : 0 });
}
const z2 = n => String(n).padStart(2, '0'), lbHC = t => t ? z2(new Date(t).getUTCHours()) + ':' + z2(new Date(t).getUTCMinutes()) : '', lbH = m => m ? Math.floor(m / 60) + ':' + z2(m % 60) : '';
const lbD = t => { if (!t) return ''; const d = new Date(t); return d.getUTCFullYear() + '-' + z2(d.getUTCMonth() + 1) + '-' + z2(d.getUTCDate()); }, lbDs = t => { if (!t) return ''; const d = new Date(t); return z2(d.getUTCDate()) + '/' + z2(d.getUTCMonth() + 1) + '/' + String(d.getUTCFullYear()).slice(2); };
const LBF = ['block', 'air', 'pic', 'cop', 'night', 'ifr', 'toD', 'toNn', 'ldD', 'ldNn'];
// 表格：中国民航（CCAR-61）或 Jeppesen（EASA / ICAO）——和 iPad 上一样的栏目
function lbTable(S) {
  const R = LBK.slice().sort((a, b) => (a.offB || a.date) - (b.offB || b.date)).map(e => [e, lbCalc(e, S)]); if (!R.length) return '<div class="ok">' + XS('还没有记录', 'No records') + '</div>';
  const tot = k => R.reduce((s, x) => s + (x[1][k] || 0), 0), bf = k => k === 'air' ? 0 : ((S.bf || {})[k] || 0), hasBf = LBF.some(k => (S.bf || {})[k]);
  const tc = (e, f) => '<td class="lbt" data-k="' + esc(e.k) + '" data-f="' + f + '">' + lbHC(e[f]) + (e.src && { plan: '<sup>P</sup>', est: '<sup>E</sup>', adsb: '<sup>A</sup>', man: '<sup>✎</sup>' }[e.src[f]] || '') + '</td>';
  if (S.fmt === 'caac') {
    const H = '<tr><th rowspan="2">日期</th><th rowspan="2">航班号</th><th rowspan="2">型别</th><th rowspan="2">登记号</th><th colspan="2">航段</th><th colspan="4">时刻（UTC）</th><th colspan="2">飞行时间</th><th colspan="2">资格时间</th><th rowspan="2">夜航</th><th rowspan="2">仪表</th><th colspan="2">起飞</th><th colspan="2">着陆</th><th rowspan="2">备注</th></tr>'
      + '<tr><th>起飞地点</th><th>着陆地点</th><th>撤轮挡</th><th>起飞</th><th>着陆</th><th>挡轮挡</th><th>总时间</th><th>空中</th><th>机长</th><th>副驾驶</th><th>昼</th><th>夜</th><th>昼</th><th>夜</th></tr>';
    const B = R.map(([e, r]) => '<tr' + (LBQ[e.k] ? ' class="q"' : '') + '><td>' + lbD(e.offB || e.date) + '</td><td>' + esc(e.flt) + '</td><td>' + esc(e.type || '') + '</td><td>' + esc(e.reg || '') + '</td><td>' + esc(e.dep) + '</td><td>' + esc(e.arr) + '</td>' + tc(e, 'offB') + tc(e, 'to') + tc(e, 'ldg') + tc(e, 'onB')
      + '<td class="b">' + lbH(r.block) + '</td><td>' + lbH(r.air) + '</td><td>' + lbH(r.pic) + '</td><td>' + lbH(r.cop) + '</td><td>' + lbH(r.night) + '</td><td>' + lbH(r.ifr) + '</td><td>' + (r.toD || '') + '</td><td>' + (r.toNn || '') + '</td><td>' + (r.ldD || '') + '</td><td>' + (r.ldNn || '') + '</td><td>' + esc(e.rmk || '') + '</td></tr>').join('');
    const fr = (lab, g, c) => '<tr class="' + c + '"><td colspan="10">' + lab + '</td><td class="b">' + lbH(g('block')) + '</td><td>' + lbH(g('air')) + '</td><td>' + lbH(g('pic')) + '</td><td>' + lbH(g('cop')) + '</td><td>' + lbH(g('night')) + '</td><td>' + lbH(g('ifr')) + '</td><td>' + g('toD') + '</td><td>' + g('toNn') + '</td><td>' + g('ldD') + '</td><td>' + g('ldNn') + '</td><td></td></tr>';
    return '<div class="lbh">飞行经历记录本</div><div class="tm">驾驶员：' + esc(S.name || '—') + ' · 执照号：' + esc(S.lic || '—') + ' · UTC · 夜间：' + (lbThr(S) < -3 ? '昏影终至晨光始' : '日落至日出') + '</div><div class="lbw"><table class="lbx">' + H + B + fr('本册合计（' + R.length + ' 段）', tot, 'tot') + (hasBf ? fr('以前累计（承前）', bf, 'bf') + fr('总计', k => tot(k) + bf(k), 'tot') : '') + '</table></div>';
  }
  const H = '<tr><th rowspan="2">DATE</th><th colspan="2">DEPARTURE</th><th colspan="2">ARRIVAL</th><th colspan="2">AIRCRAFT</th><th rowspan="2">MULTI-PILOT</th><th rowspan="2">TOTAL TIME</th><th rowspan="2">NAME PIC</th><th colspan="2">LANDINGS</th><th colspan="2">CONDITION</th><th colspan="2">FUNCTION</th><th rowspan="2">REMARKS</th></tr>'
    + '<tr><th>PLACE</th><th>TIME</th><th>PLACE</th><th>TIME</th><th>MODEL</th><th>REG</th><th>DAY</th><th>NIGHT</th><th>NIGHT</th><th>IFR</th><th>PIC</th><th>CO-PILOT</th></tr>';
  const B = R.map(([e, r]) => '<tr' + (LBQ[e.k] ? ' class="q"' : '') + '><td>' + lbDs(e.offB || e.date) + '</td><td>' + esc(e.dep) + '</td>' + tc(e, 'offB') + '<td>' + esc(e.arr) + '</td>' + tc(e, 'onB') + '<td>' + esc(e.type || '') + '</td><td>' + esc(e.reg || '') + '</td><td>' + lbH(r.block) + '</td><td class="b">' + lbH(r.block) + '</td><td>' + esc((e.role || S.role) === 'CAPT' ? 'SELF' : (e.pic || '')) + '</td><td>' + (r.ldD || '') + '</td><td>' + (r.ldNn || '') + '</td><td>' + lbH(r.night) + '</td><td>' + lbH(r.ifr) + '</td><td>' + lbH(r.pic) + '</td><td>' + lbH(r.cop) + '</td><td>' + esc([e.flt, e.rmk].filter(Boolean).join(' · ')) + '</td></tr>').join('');
  const fr = (lab, g, c) => '<tr class="' + c + '"><td colspan="7">' + lab + '</td><td>' + lbH(g('block')) + '</td><td class="b">' + lbH(g('block')) + '</td><td></td><td>' + g('ldD') + '</td><td>' + g('ldNn') + '</td><td>' + lbH(g('night')) + '</td><td>' + lbH(g('ifr')) + '</td><td>' + lbH(g('pic')) + '</td><td>' + lbH(g('cop')) + '</td><td></td></tr>';
  return '<div class="lbh">PILOT LOGBOOK</div><div class="tm">' + esc(S.name || '—') + ' · ' + esc(S.lic || '') + ' · UTC · night: ' + (lbThr(S) < -3 ? 'civil twilight' : 'sunset–sunrise') + '</div><div class="lbw"><table class="lbx">' + H + B + fr('TOTAL THIS BOOK (' + R.length + ')', tot, 'tot') + (hasBf ? fr('TOTAL FROM PREVIOUS PAGES', bf, 'bf') + fr('TOTAL TIME', k => tot(k) + bf(k), 'tot') : '') + '</table></div>';
}
async function openLog() {
  const sh = $('sheet'); sh.style.display = 'block'; sh.scrollTop = 0;
  const paint = () => {
    const L = CUR, S = lbSet(), have = L && !L.noOfp && LBK.some(x => x.k === String(L.k).replace(/[^\w.-]/g, ''));
    sh.innerHTML = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:17px">📒 ' + XS('飞行记录本', 'Logbook') + '</b><span style="flex:1"></span>'
      + '<span class="btn sg' + (S.fmt === 'caac' ? ' on' : '') + '" data-fmt="caac">中国民航</span><span class="btn sg' + (S.fmt !== 'caac' ? ' on' : '') + '" data-fmt="jepp">Jeppesen</span><span class="btn" id="lb-a">📡 ADS-B</span><span class="btn" id="lb-x">✕</span></div>'
      + '<div class="ok">' + esc(lbMsg) + (Object.keys(LBQ).length ? ' · ' + Object.keys(LBQ).length + XS(' 条改动等有网同步', ' change(s) waiting') : '') + '</div>'
      + (L && !L.noOfp && !have ? '<span class="btn" id="lb-add">＋ ' + XS('记下这班 ', 'Log this flight ') + esc(L.no) + ' ' + esc(L.ai) + '→' + esc(L.bi) + '</span>' : '')
      + lbTable(S) + '<div class="ok" style="font-size:12px">' + XS('表格可以左右滑动（手机横过来看更舒服）。点时刻可以改（UTC，4 位）。P = 计划、E = 估算、A = ADS-B、✎ = 手改；等级高的为准（手改 > ADS-B > 估算 > 计划），同一等级用最后改的。导出、承前数据、个人信息在 iPad 记录本里设置，这里自动同步。', 'Tap a time to edit (UTC). P = planned. Export and settings are on the iPad.') + '</div>';
    $('lb-x').onclick = () => { sh.style.display = 'none'; draw(); };
    $('lb-a').onclick = async () => { lbMsg = '⏳ ' + XS('取 ADS-B 起降时间…', 'Loading ADS-B times…'); paint(); let n = 0; for (const e of LBK.filter(x => x.std > Date.now() - 7 * 864e5)) { if (await lbAdsb(e)) n++; } lbMsg = n ? '✅ ' + XS('更新了 ' + n + ' 条（手改的不动）', n + ' updated (edited times kept)') : XS('没有新的 ADS-B 时间', 'No new ADS-B times'); paint(); lbSync().then(paint); };
    sh.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { ls('lbfmt', b.dataset.fmt); paint(); });
    if ($('lb-add')) $('lb-add').onclick = () => { lbFromLeg(CUR); lbMsg = '✅ ' + XS('已记下（有网时同步到所有设备）', 'Logged (syncs when online)'); paint(); lbSync().then(paint); };
    sh.querySelectorAll('td.lbt').forEach(el => el.onclick = () => { const k = el.dataset.k, f = el.dataset.f, e = LBK.find(x => x.k === k); if (!e) return;
      const v = prompt(e.flt + ' ' + ({ offB: XS('撤轮挡', 'OFF'), to: XS('起飞', 'T/O'), ldg: XS('落地', 'LDG'), onB: XS('挡轮挡', 'ON') })[f] + ' (UTC hhmm)', e[f] ? hmZ(e[f]) : ''); if (v === null || !/^\d{4}$/.test(v.trim())) return;
      const ref = e[f] || e.std || e.date, d0 = Date.UTC(new Date(ref).getUTCFullYear(), new Date(ref).getUTCMonth(), new Date(ref).getUTCDate()) + (+v.slice(0, 2) * 60 + +v.slice(2)) * MIN;
      const y = JSON.parse(JSON.stringify(e)); y[f] = [d0 - 864e5, d0, d0 + 864e5].sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref))[0]; y.src = y.src || {}; y.src[f] = 'man'; lbPut(y); paint(); lbSync().then(paint); });
  };
  lbMsg = '⏳ ' + XS('同步中…', 'Syncing…'); paint(); try { await lbSync(); } catch (e) { lbMsg = '⚠️ ' + e.message; } paint();
}
