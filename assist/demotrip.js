/* 联动演示：EK287 LHR→SFO，layover，EK288 SFO→LHR。一分钟走完；和时钟 ?demo=trip 按同一张时间表走（都从下一个整分钟开始）。 */
(function () {
  'use strict';
  const WP = [["EGLL",51.478,-0.462,0],["D257C",51.477,-0.545,2],["D280G",51.51,-0.65,2],["BUR",51.518,-0.677,3],["D356D",51.583,-0.685,4],["UMLAT",51.672,-0.695,4],["WOBUN",52.02,-0.733,8],["WELIN",52.247,-0.852,10],["AKUPA",52.487,-1.092,12],["TIMPO",52.558,-1.163,13],["ELVOS",52.7,-1.307,14],["TNT",53.053,-1.67,18],["RODOL",53.238,-1.862,19],["TENSO",53.6,-2.208,22],["BELOX",53.888,-3.49,28],["BELZU",54.662,-6.23,42],["NINEX",58.855,-9.5,76],["BALIX",59.0,-10.0,78],["61N015W",61.0,-15.0,102],["N64W020",64.0,-20.0,131],["N66W030",66.0,-30.0,166],["N67W040",67.0,-40.0,197],["N67W050",67.0,-50.0,227],["DARUB",67.0,-60.0,256],["N65W072",65.0,-72.0,296],["N63W080",63.0,-80.0,327],["N59W090",59.0,-90.0,375],["N54W100",54.0,-100.0,432],["N50W107",50.0,-107.0,478],["GTF",47.45,-111.412,507],["REO",42.59,-117.868,558],["HOLLR",41.442,-118.83,569],["LEGGS",39.337,-121.095,590],["PYLLE",38.453,-122.428,604],["BGGLO",38.225,-122.768,608],["LOZIT",37.9,-122.673,611],["BDEGA",37.823,-122.592,613],["CORKK",37.733,-122.498,614],["BRIXX",37.618,-122.375,616],["KSFO",37.618,-122.375,624]];
  const V0 = Date.UTC(2026, 10, 13, 7, 0), K = [[0, 0], [4, .8], [7, 1.5], [19, 11.4], [23, 12.7], [30, 35.6], [34, 36.5], [46, 46.4], [50, 47.4], [60, 50]];
  function V(r) { r = Math.max(0, Math.min(60, r)); for (let i = 1; i < K.length; i++) if (r <= K[i][0]) { const a = K[i - 1], b = K[i]; return V0 + (a[1] + (b[1] - a[1]) * (r - a[0]) / (b[0] - a[0])) * 36e5; } }
  const p2 = n => String(n).padStart(2, '0'), hm = m => p2(Math.floor(m / 60) % 24) + p2(m % 60);
  const dm = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, x = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return Math.round(3440 * 2 * Math.asin(Math.sqrt(x))); };
  const ll = (v, P, N, w) => { const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return (v < 0 ? N : P) + String(d).padStart(w, '0') + m.toFixed(1).padStart(4, '0'); };
  function text(back) {
    const tot = WP[WP.length - 1][3], w = back ? WP.slice().reverse().map(x => [x[0], x[1], x[2], tot - x[3]]) : WP;
    const a = w[0][0], b = w[w.length - 1][0], ia = { EGLL: 'LHR', KSFO: 'SFO' };
    const out = [(back ? 'EK288 14NOV ' : 'EK287 13NOV ') + a + '/' + ia[a] + '-' + b + '/' + ia[b] + ' B77W A6-EGX  ' + (back ? '14Nov2026' : '13Nov2026'),
      'DEP ' + (back ? '1900' : '0800') + ' ARR ' + hm((back ? 1140 : 480) + 15 + tot), 'TRIP ' + b + ' 73800 ' + hm(tot), 'TAXI 800 0015',
      'EZFW 203839 MZFW 237683', 'ETOW 287504 MTOW 351535', 'ELWT 213823 MLWT 251290', 'AWY TRM DIST', a + '/27L 0.0'];
    for (let i = 1; i < w.length; i++) out.push('DCT ' + String(Math.min(999, dm(w[i - 1][1], w[i - 1][2], w[i][1], w[i][2]))).padStart(3, '0') + ' 27/050', w[i][0] + ' ' + hm(w[i][3]) + ' .... ....');
    out.push('ROUTE TO DESTINATION ALTERNATE');
    w.forEach(x => out.push(x[0], ll(x[1], 'N', 'S', 2), ll(x[2], 'E', 'W', 3)));
    return out.join('\n');
  }
  let D = null;
  function stop() {
    if (!D) return; clearInterval(D.iv); const k = D.keep; D = null;
    Object.assign(S, { ofp: k.ofp, atd: k.atd, sim: k.sim, fix: k.fix, lastFir: k.lastFir, demo: null });
    $('demo').style.display = 'none'; S.follow = true; drawRoute(); lastList = 0; S.userScroll = 0; tick();
  }
  function step() {
    const r = (Date.now() - D.r0) / 1000, v = V(r), o = v < V0 + 24 * 36e5 ? D.o1 : D.o2, t = o.times;
    if (S.ofp !== o) { S.ofp = o; S.fix = null; S.lastFir = undefined; S.follow = true; drawRoute(); lastList = 0; if (typeof fitRing === 'function') fitRing(); }
    S.atd = t.std + (t.taxi || 15) * 6e4; S.sim = v - Date.now();
    const off = S.atd, on = off + t.trip * 6e4, b = th;
    const ph = r < 0 ? b('整分钟开始 · ', 'Starts in ') + Math.ceil(-r) + 's' : o === D.o1 ? (v < off ? b('🏠 伦敦家里 · 准备出发', '🏠 Home — London') : v < on ? b('✈️ EK287 飞往旧金山', '✈️ EK287 to San Francisco') : b('🏨 旧金山 Layover', '🏨 Layover — San Francisco'))
      : (v < off ? b('🏨 旧金山 Layover', '🏨 Layover — San Francisco') : v < on ? b('✈️ EK288 返回伦敦', '✈️ EK288 back to London') : b('🏠 到家', '🏠 Home'));
    $('demo').innerHTML = '<div class="dr"><b style="color:var(--green)">🎬 ' + ph + '</b><span class="sp" onclick="TRIP.stop()">✕</span></div>';
    if (Date.now() - D.l > 900) { D.l = Date.now(); lastList = 0; S.userScroll = 0; }
    tick();
  }
  function start() {
    if (D) { stop(); return; }
    if (S.demo) demoStop();
    const o1 = OFP.parse(text(false)), o2 = OFP.parse(text(true));
    D = { o1, o2, keep: { ofp: S.ofp, atd: S.atd, sim: S.sim || 0, fix: S.fix, lastFir: S.lastFir }, r0: Math.ceil((Date.now() + 3000) / 6e4) * 6e4, l: 0 };
    S.demo = { trip: 1 }; S.userScroll = 0; $('load').classList.remove('open');
    $('demo').style.display = 'block'; rcOn(true); step(); D.iv = setInterval(step, 200);
  }
  window.TRIP = { start, stop, text, V };
})();
