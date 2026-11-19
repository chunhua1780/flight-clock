/* Logbook on the Panel: the same records as the logbook in Flight Assist (cloud = your own Google Drive spreadsheet via your Apps Script).
   Readable and editable offline; changes are queued and synced when online (newest change wins, same as the iPad).
   Uses globals from index.html: ls, X, esc, MIN, postK, hmZ, dmZ, CUR, offOf, csOf */
'use strict';
let LBK = []; try { LBK = JSON.parse(ls('lb') || '[]'); } catch (e) {}
let LBQ = {}; try { LBQ = JSON.parse(ls('lbq') || '{}'); } catch (e) {}   // changes not yet uploaded
const lbSave = () => { ls('lb', JSON.stringify(LBK)); ls('lbq', JSON.stringify(LBQ)); };
let lbMsg = '';
async function lbSync() {
  if (!navigator.onLine || !ls('key')) { lbMsg = '📵 ' + X('离线：显示手机里保存的记录，改动有网时再同步', 'Offline — showing saved records; changes sync when online'); return; }
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
async function openLog() {
  const sh = $('sheet'); sh.style.display = 'block'; sh.scrollTop = 0;
  const paint = () => {
    const L = CUR, have = L && !L.noOfp && LBK.some(x => x.k === String(L.k).replace(/[^\w.-]/g, ''));
    const tot = LBK.reduce((s, e) => s + (e.onB && e.offB && e.onB > e.offB ? (e.onB - e.offB) / MIN : 0), 0);
    sh.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">📒 ' + X('飞行记录本', 'Logbook') + '</b><span style="flex:1"></span><span class="btn" id="lb-x">✕</span></div>'
      + '<div class="ok">' + esc(lbMsg) + (Object.keys(LBQ).length ? ' · ' + Object.keys(LBQ).length + X(' 条改动等有网同步', ' change(s) waiting for network') : '') + '</div>'
      + (L && !L.noOfp && !have ? '<span class="btn" id="lb-add">＋ ' + X('记下这班 ', 'Log this flight ') + esc(L.no) + ' ' + esc(L.ai) + '→' + esc(L.bi) + '</span>' : '')
      + '<div class="ok">' + XS('共 ' + LBK.length + ' 条 · 飞行时间 ' + lbHm(tot) + ' · 点时间可以改（UTC，4 位）', LBK.length + ' entries · block ' + lbHm(tot) + ' · tap a time to edit (UTC, 4 digits)') + '</div>'
      + LBK.slice(0, 60).map(e => { const blk = e.onB && e.offB && e.onB > e.offB ? (e.onB - e.offB) / MIN : 0, air = e.ldg && e.to && e.ldg > e.to ? (e.ldg - e.to) / MIN : 0;
        return '<div class="nt" data-k="' + esc(e.k) + '"><b>' + esc(e.flt) + '</b> · ' + esc(new Date(e.offB || e.date).toISOString().slice(0, 10)) + ' · ' + esc(e.depI || e.dep) + '→' + esc(e.arrI || e.arr) + ' · ' + esc(e.type || '') + ' ' + esc(e.reg || '')
          + (LBQ[e.k] ? ' <span class="tm">⏳</span>' : '') + '<div class="lbr">' + ['offB', 'to', 'ldg', 'onB'].map(f => '<span class="lbt" data-f="' + f + '"><i>' + ({ offB: XS('撤轮挡', 'OFF'), to: XS('起飞', 'T/O'), ldg: XS('落地', 'LDG'), onB: XS('挡轮挡', 'ON') })[f] + '</i>' + lbT(e[f]) + (e.src && e.src[f] === 'plan' ? '<sup>P</sup>' : '') + '</span>').join('')
          + '</div><div class="tm">' + XS('飞行 ', 'Block ') + lbHm(blk) + ' · ' + XS('空中 ', 'Air ') + lbHm(air) + (e.rmk ? ' · ' + esc(e.rmk) : '') + '</div></div>'; }).join('')
      + '<div class="ok" style="font-size:12px">' + X('P = 计划时间（ADS-B / 手改后会替换）。夜航、起落次数、导出在 iPad 的记录本里。', 'P = planned time. Night time, landings and export are in the Flight Assist logbook.') + '</div>';
    $('lb-x').onclick = () => { sh.style.display = 'none'; draw(); };
    if ($('lb-add')) $('lb-add').onclick = () => { lbFromLeg(CUR); lbMsg = '✅ ' + X('已记下（有网时同步到所有设备）', 'Logged (syncs when online)'); paint(); lbSync().then(paint); };
    sh.querySelectorAll('.lbt').forEach(el => el.onclick = () => { const k = el.closest('[data-k]').dataset.k, f = el.dataset.f, e = LBK.find(x => x.k === k); if (!e) return;
      const v = prompt(e.flt + ' ' + el.querySelector('i').textContent + ' (UTC hhmm)', e[f] ? hmZ(e[f]) : ''); if (v === null || !/^\d{4}$/.test(v.trim())) return;
      const ref = e[f] || e.std || e.date, d0 = Date.UTC(new Date(ref).getUTCFullYear(), new Date(ref).getUTCMonth(), new Date(ref).getUTCDate()) + (+v.slice(0, 2) * 60 + +v.slice(2)) * MIN;
      const y = JSON.parse(JSON.stringify(e)); y[f] = [d0 - 864e5, d0, d0 + 864e5].sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref))[0]; y.src = y.src || {}; y.src[f] = 'man'; lbPut(y); paint(); lbSync().then(paint); });
  };
  lbMsg = '⏳ ' + X('同步中…', 'Syncing…'); paint(); try { await lbSync(); } catch (e) { lbMsg = '⚠️ ' + e.message; } paint();
}
