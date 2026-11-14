/* 副屏（海信墨水屏手机）：把这次航班的要点做成二维码，手机扫一下就能离线自己走。
   Safari 网页不能用蓝牙，所以用二维码传：起飞时间改了、ZFW 改了，再扫一次就行。 */
(function () {
  'use strict';
  const URLP = 'https://chunhua1780.github.io/flight-cloch/panel/';
  const r1 = v => Math.round(v * 10) / 10;
  function pkt() {
    const o = S.ofp; if (!o) return null;
    const f = o.flight, t = o.times, W = o.weights || {}, F = o.fuel || {}, N = o.navlog || [], X = o.fixes || {};
    const k = f.no + f.date, za = +lsGet('azfw.' + k) || 0;
    const p = { v: 2, f: f.no, d: f.date, a: f.dep, b: f.arr, ai: f.depIata, bi: f.arrIata, r: f.reg || '', ty: f.type || '',
      s: Math.round(t.std / 6e4), x: S.atd ? Math.round(S.atd / 6e4) : 0, tx: t.taxi || 0, tr: t.trip || 0,
      n: N.map(w => w.id + '.' + w.t).join(' '),
      fi: (o.firs || []).filter(x => x.wp).map(x => [x.name.replace(/ FIR$/, ''), x.code, x.wp, x.t]),
      c: [] };
    if (W.ezfw) { p.z = za || W.ezfw[0]; p.za = za ? 1 : 0; }
    if (W.etow) p.tw = Math.min(W.etow[1], W.rtow || 1e9);
    if (W.elwt) p.lw = Math.min(W.elwt[1], W.rlwt || 1e9);
    p.tf = (F.tof && F.tof.fuel) || (W.etow && W.ezfw ? W.etow[0] - W.ezfw[0] : 0);
    p.tp = (F.trip && F.trip.fuel) || (W.etow && W.elwt ? W.etow[0] - W.elwt[0] : 0);
    // 十几个坐标点就够算白天/黑夜
    const withC = N.filter(w => X[w.id]), step = Math.max(1, Math.ceil(withC.length / 10));
    withC.forEach((w, i) => { if (i % step === 0 || i === withC.length - 1) p.c.push(w.t, r1(X[w.id][0]), r1(X[w.id][1])); });
    return p;
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  async function enc(p) {
    const j = new TextEncoder().encode(JSON.stringify(p));
    if (typeof CompressionStream !== 'undefined') {
      try { return 'z' + b64(new Uint8Array(await new Response(new Blob([j]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())); } catch (e) {}
    }
    return 'j' + b64(j);
  }
  async function show() {
    const p = pkt(); if (!p) { toast(th('先载入 OFP', 'Load an OFP first')); return; }
    const url = URLP + '#' + await enc(p);
    const q = qrcode(0, 'L'); q.addData(url); q.make();
    let box = document.getElementById('pnl');
    if (!box) { box = document.createElement('div'); box.id = 'pnl'; document.body.appendChild(box); }
    box.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center';
    box.onclick = e => { if (e.target === box) box.remove(); };
    const at = S.atd ? 'ATD ' + hmZ(S.atd).slice(0, 4) + 'Z' : th('还没填 ATD：按计划 STD + 滑行', 'No ATD yet — using STD + taxi');
    box.innerHTML = '<div style="background:#fff;color:#111;border-radius:16px;padding:18px 20px;max-width:94vw;text-align:center;font-size:14px">' +
      '<div style="font-weight:700;font-size:17px;margin-bottom:4px">📱 ' + th('副屏：用海信手机扫这个码', 'Side display — scan with the phone') + '</div>' +
      '<div style="color:#555;margin-bottom:10px">' + esc(p.f) + ' · ' + esc(p.a) + '→' + esc(p.b) + ' · ' + at + (p.za ? ' · ZFW ' + (p.z / 1000).toFixed(1) + ' t' : '') + '</div>' +
      '<div style="width:min(70vh,80vw);margin:0 auto">' + q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }) + '</div>' +
      '<div style="color:#555;margin-top:10px;line-height:1.5">' + th('起飞时间或 ZFW 改了，再扫一次。扫完手机就不需要网络。', 'Changed ATD or ZFW? Scan again. The phone needs no network after scanning.') + '</div>' +
      '<div style="margin-top:12px"><span onclick="document.getElementById(\'pnl\').remove()" style="display:inline-block;padding:8px 22px;border:1px solid #999;border-radius:10px;cursor:pointer">✕ ' + th('关闭', 'Close') + '</span></div></div>';
  }
  window.PANEL = { show, pkt, enc };
})();
