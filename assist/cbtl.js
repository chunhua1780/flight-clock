/* 和手机 Panel 一样的两个起飞前提醒（地图左上角）：
   · 机组简报（STD−83）：前 30 分钟开始倒计时，点「!」看给乘务组的卡片（去程、回程：飞行时间、高度、落地时间、落地天气）
   · 起飞前时间轴（STD−75 起到推出）：现在这一步 −几分 + 下一步还有几分；点开看全部
   全部用 iPad 上存好的 OFP，离线可用。 */
(function () {
  'use strict';
  const CB_MIN = 83;
  const TLS = [
    [60, '上机', 'On board', '机组、乘务组到飞机', 'Flight crew / cabin crew at the aeroplane'],
    [45, '预登机', 'Pre-board', 'PRM / UM 先登机', 'PRM / UM pre-boarding'],
    [40, '登机·舱单', 'Board · LS', '旅客登机；初步舱单（EZFW、重心）。用 ACARS 报最终油量（不行就 VHF），也告诉地面 / 机务', 'Passenger boarding; preliminary loadsheet (EZFW, CG). Final fuel via ACARS (or VHF), and to ground staff / engineer'],
    [20, 'APU', 'APU', '开 APU，断开 GPU / ACU（需要时）', 'Start APU, disconnect GPU / ACU as needed'],
    [15, '卸行李', 'Offload', '卸下没登机旅客的行李', 'Offload missing passenger baggage'],
    [10, '欢迎广播', 'Welcome PA', '欢迎广播', 'Welcome PA'],
    [5, '关门', 'Doors', '尽量关闭所有舱门', 'Close all doors, as possible']];
  const XS = (z, e) => LANG === 'en' ? e : z;   // 短标签：中英模式只写中文
  const css = document.createElement('style');
  css.textContent = '#pdx{position:absolute;left:10px;top:54px;z-index:520;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100% - 20px)}'
    + '#pdx .ch{display:none;align-items:center;gap:7px;background:var(--hud);border:1.5px solid var(--line);border-radius:12px;padding:4px 10px;font-size:15px;font-weight:800;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;box-shadow:0 2px 10px rgba(0,0,0,.35)}'
    + '#pdx .ex{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#e5484d;color:#fff;font-size:15px}'
    + '#pdx .m{font-size:17px}#pdx .neg{color:#ff6b6b}#pdx .nx{font-size:13px;font-weight:600;color:var(--dim);border-left:1px solid var(--line);padding-left:7px}'
    + '#pdsh{position:fixed;inset:0;z-index:3100;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:20px}#pdsh.open{display:flex}'
    + '#pdsh .in{width:min(560px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px}'
    + '#pdsh .hd{display:flex;align-items:center;gap:8px;font-size:19px;font-weight:800;margin-bottom:6px}#pdsh .hd span{flex:1}'
    + '#pdsh .cc{border:1.5px solid var(--line);border-radius:14px;padding:10px 14px;margin:10px 0}#pdsh .cc h4{margin:0 0 6px;font-size:19px}#pdsh .cc h4 small{font-size:13px;color:var(--dim);margin-left:6px;font-weight:600}'
    + '#pdsh .cc.rt2{border-color:#3fcf7f}#pdsh .cc.rt2 h4{color:#3fcf7f}'
    + '#pdsh .pr{display:flex;gap:10px;font-size:18px;font-weight:700;line-height:1.55}#pdsh .pr i{font-style:normal;flex:none;width:5.6em;color:var(--dim);font-weight:600;font-size:15px;white-space:nowrap}#pdsh .pr.bad{color:#ff6b6b}'
    + '#pdchk{position:absolute;left:10px;top:100px;z-index:640;width:min(430px,calc(100% - 20px));background:var(--panel);border:2px solid #3fcf7f;border-radius:16px;padding:10px 12px;box-shadow:0 8px 26px rgba(0,0,0,.45);display:none}'
    + '#pdchk .ch{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:800;margin-bottom:4px}#pdchk .ch span{flex:1}#pdchk .ch small{font-size:13px;color:var(--dim);font-weight:600}'
    + '#pdchk .cols{display:grid;grid-template-columns:1fr 1fr;column-gap:10px}#pdchk .ci{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--line);font-size:17px;font-weight:700;cursor:pointer}'
    + '#pdchk .ci i{flex:none;width:26px;height:26px;border:2px solid var(--dim);border-radius:7px;font-style:normal;text-align:center;line-height:22px;font-size:18px}#pdchk .ci.on{opacity:.45}#pdchk .ci.on i{background:#3fcf7f;border-color:#3fcf7f;color:#04210f}'
    + '#pd-gps{display:none;flex-basis:100%;max-width:420px;background:var(--panel);border:2px solid #f3b13c;border-radius:14px;padding:7px 12px;box-shadow:0 4px 16px rgba(0,0,0,.4)}#pd-gps .gh{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:#f3b13c}#pd-gps .gh span{flex:1}#pd-gps .gh b{cursor:pointer;color:var(--text);font-size:18px;padding:0 4px}#pd-gps .gs{font-size:18px;font-weight:800;line-height:1.45}'
    + '#pdsh .tl div{padding:7px 4px;border-bottom:1px solid var(--line);font-size:16px;font-weight:700}#pdsh .tl b{display:inline-block;width:3.2em}#pdsh .tl small{display:block;font-weight:500;font-size:13px;color:var(--dim);margin-left:3.6em}#pdsh .tl .done{opacity:.45}#pdsh .tl .now{background:rgba(63,207,127,.15)}';
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'pdx'; box.innerHTML = '<span class="ch" id="pd-cb"></span><span class="ch" id="pd-tl"></span><div id="pd-gps"></div>';
  (document.getElementById('mapwrap') || document.body).appendChild(box);
  const ck = document.createElement('div'); ck.id = 'pdchk'; (document.getElementById('mapwrap') || document.body).appendChild(ck);
  const sh = document.createElement('div'); sh.id = 'pdsh'; sh.innerHTML = '<div class="in"></div>'; document.body.appendChild(sh);
  sh.onclick = e => { if (e.target === sh || e.target.closest('.x')) sh.classList.remove('open'); };
  const open = (title, body) => { sh.firstChild.innerHTML = '<div class="hd"><span>' + title + '</span><button class="btn sm x">✕</button></div>' + body; sh.classList.add('open'); };

  const std = o => o.times.std || o.flight.dateUTC;
  const offOf = o => S.atd || std(o) + (o.times.taxi || 15) * MIN;
  const fls = o => { const p = String(o.times.plndFl || '').split(/\s+/).map(x => (/(\d{3})$/.exec(x) || [])[1]).filter(Boolean); if (p.length) return p.map(x => 'FL' + x).join(' / '); return o.times.crzFl || '—'; };
  function cabinWx(o, icao, at) {
    const a = o && o.airports && o.airports[icao]; if (!a) return null;
    const m = (a.metar || []).slice(-1)[0], t = (a.taf || []).slice(-1)[0]; if (!m && !t) return null;
    let w = null; try { const M = m ? WX.metar(m, at) : null, T = t ? WX.taf(String(t).replace(/^\s*TAF\s+((AMD|COR)\s+)?[A-Z]{4}\s+/, ''), at) : null; w = (M || T) ? WX.at(T, M, at) : null; } catch (e) {} if (!w || !w.main) return null;
    const c = w.main, wx = (c.wx || []).join(' '), mw = (w.maybe || []).filter(q => q.g).map(q => ((q.c && q.c.wx) || []).join(' ') + (q.c && q.c.cb ? ' CB' : '')).join(' ');
    const ts = /TS|SQ|FC|GR/.test(wx) || c.cb, mts = !ts && /TS|SQ|FC|GR|CB/.test(mw);
    const zh = ts ? '有雷雨 ⚠' : mts ? '可能有雷雨 ⚠' : /RA|DZ|SH/.test(wx) ? '有雨' : /FG|BR/.test(wx) ? '有雾' : /HZ|DU|SA|FU/.test(wx) ? '霾 / 沙尘' : /RA|DZ|SH/.test(mw) ? '可能有雨' : '天气好';
    const en = ts ? 'thunderstorms ⚠' : mts ? 'possible thunderstorms ⚠' : /RA|DZ|SH/.test(wx) ? 'rain' : /FG|BR/.test(wx) ? 'fog / mist' : /HZ|DU|SA|FU/.test(wx) ? 'haze / dust' : /RA|DZ|SH/.test(mw) ? 'possible rain' : 'fine';
    return { txt: tt(zh, en) + (c.temp != null ? ' · ' + c.temp + '°C' : ''), bad: ts || mts };
  }
  // 同一天的回程：iPad 上存着的 OFP 里，从目的地飞回出发地、36 小时内的那一份
  let BACK = { k: '', o: null };
  async function findBack(o) {
    const k = o.flight.no + o.flight.date; if (BACK.k === k) return BACK.o; BACK = { k, o: null };
    try { const L = (window.OFL && OFL.entries) ? await OFL.entries() : []; const e = L.filter(x => x.dep === o.flight.arr && x.arr === o.flight.dep && x.std > std(o) && x.std < std(o) + 36 * 36e5).sort((a, b) => a.std - b.std)[0];
      if (e && e.text) { const r = OFP.parse(e.text); if (r && r.ok) BACK.o = r; } } catch (e) {}
    return BACK.o;
  }
  function card(o, back, wxSrc) {
    const off = back ? std(o) + (o.times.taxi || 15) * MIN : offOf(o), on = off + (o.times.trip || 0) * MIN, f = o.flight;
    const w = cabinWx(o, f.arr, on) || (wxSrc ? cabinWx(wxSrc, f.arr, on) : null);
    const row = (k, v, bad) => '<div class="pr' + (bad ? ' bad' : '') + '"><i>' + k + '</i><span>' + v + '</span></div>';
    return '<div class="cc' + (back ? ' rt2' : '') + '"><h4>' + (back ? '↩ ' + XS('回程', 'Return') : '✈ ' + XS('去程', 'Outbound')) + ' ' + esc(f.depIata || f.dep) + ' → ' + esc(f.arrIata || f.arr) + '<small>' + esc(f.no) + (back ? ' · STD ' + hmZ(std(o)) : '') + '</small></h4>'
      + row(XS('飞行', 'Flight'), dur(o.times.trip || 0)) + row(XS('高度', 'Level'), esc(fls(o))) + row(XS('落地', 'Landing'), hmZ(on))
      + row(esc(f.arrIata || f.arr) + ' ' + XS('天气', 'wx'), w ? w.txt : '—', w && w.bad) + '</div>';
  }
  async function openCrew() {
    const o = S.ofp; if (!o) return; const b = await findBack(o);
    open('👥 ' + XS('机组简报', 'Crew brief') + ' · ' + esc(o.flight.no) + ' · ' + hmZ(std(o) - CB_MIN * MIN),
      card(o, false) + (b ? card(b, true, o) : '<div class="pr"><span style="color:var(--dim);font-size:15px">' + tt('iPad 上没有当天回程的 OFP（有网时会自动从邮箱取）', 'No return OFP on this iPad yet (fetched from mail when online)') + '</span></div>'));
  }
  function openTl() {
    const o = S.ofp; if (!o) return; const t = now(), s0 = std(o), past = TLS.filter(s => t >= s0 - s[0] * MIN).pop();
    open('⏱ ' + XS('起飞前时间轴', 'Pre-departure timeline') + ' · STD ' + hmZ(s0), '<div class="tl">' + TLS.map(s => '<div class="' + (s === past ? 'now' : t >= s0 - s[0] * MIN ? 'done' : '') + '"><b>−' + s[0] + '</b>' + hmZ(s0 - s[0] * MIN) + ' · ' + esc(XS(s[1], s[2])) + '<small>' + esc(LANG === 'en' ? s[4] : s[3]) + (LANG === 'both' ? ' · ' + esc(s[4]) : '') + '</small></div>').join('') + '</div>');
  }
  document.getElementById('pd-cb').onclick = openCrew; document.getElementById('pd-tl').onclick = openTl;
// GPS 干扰（起飞 / 目的地机场有 GNSS 干扰 NOTAM）：最简短的提醒
  //   起飞前 60～20 分钟：POS GPS OFF · TERR OVRD ON · RADIO NAV ENABLE
  //   起飞后飞出干扰区（进入第一个没有 GNSS 干扰通告的管制区）后 15 分钟内：GPS ON · RADIO NAV ON · TERR OVRD OFF
  //   落地前 60 分钟起：TERR OVRD ON · GPS OFF · RADIO NAV UPDATE ON · RNP APCH / PROGRESS / RNP 1
  const GPS_RE = /\b(GNSS|GPS|RAIM)\b/, GPS_BAD = /INTERFERENCE|JAMM|SPOOF|UNRELIAB|U\/S|NOT AVBL|OUTAGE|DEGRAD|UNAVBL|DISRUPT/;
  const GPS_STEPS = { dep: ['POS GPS — OFF', 'TERR OVRD — ON', 'RADIO NAV — ENABLE'], clr: ['GPS — ON', 'RADIO NAV — ON', 'TERR OVRD — OFF'], arr: ['TERR OVRD — ON', 'GPS — OFF', 'RADIO NAV UPDATE — ON', 'RNP APCH · PROGRESS · RNP 1'] };
  // nts(code) → [{ text, from, to }]；fis → [{ code, t }]（进入这个管制区的分钟数）
  function gpsPlan(nts, dep, arr, fis, off, std, tr, el, ph, t) {
    const bad = (c, at) => (nts(c) || []).some(n => GPS_RE.test(n.text || '') && GPS_BAD.test(n.text || '') && !(n.to && n.to < at - 60 * 6e4) && !(n.from && n.from > at + 60 * 6e4));
    const depG = bad(dep, off), arrG = bad(arr, off + tr * 6e4);
    if (ph === 0 && depG && t >= std - 60 * 6e4 && t < std - 20 * 6e4) return { k: 'dep', at: dep };
    if (ph !== 1) return null;
    if (arrG && tr - el <= 60) return { k: 'arr', at: arr };
    if (depG) { let ex = null, fr = dep;
      for (const f of (fis || []).filter(f => f.t > 0).sort((a, b) => a.t - b.t)) { if (!bad(f.code, off + f.t * 6e4)) { ex = f.t; break; } fr = f.code; }
      ex = Math.min(ex == null ? 45 : ex, Math.max(20, tr - 70));
      if (el >= ex && el < ex + 15) return { k: 'clr', at: fr }; }
    return null;
  }
  function gpsShow() {
    const o = S.ofp, b = document.getElementById('pd-gps'); let h = '';
    if (o && std(o)) { const t = now(), off = offOf(o), el = S.atd ? elAt(t) : (t - off) / MIN, tr = o.times.trip || 0, ph = t < off ? 0 : el < tr ? 1 : 2;
      const P = gpsPlan(c => (o.notams && o.notams[c]) || [], o.flight.dep, o.flight.arr, (o.firs || []).filter(f => f.wp && f.t != null).map(f => ({ code: f.code, t: f.t })), off, std(o), tr, el, ph, t);
      const key = P ? 'fa.gpsx.' + o.flight.no + o.flight.date + '.' + P.k : ''; let x = null; try { x = key && localStorage.getItem(key); } catch (e) {}
      if (P && !x) { const tl = { dep: XS('起飞机场 GPS 干扰 ', 'DEP GPS interference ') + P.at, clr: XS('已飞出 GPS 干扰区 ', 'Clear of GPS interference ') + P.at, arr: XS('目的地 GPS 干扰 ', 'DEST GPS interference ') + P.at };
        h = '<div class="gh"><span>📡 ' + esc(tl[P.k]) + '</span><b data-k="' + esc(key) + '">✕</b></div>' + GPS_STEPS[P.k].map(s => '<div class="gs">' + esc(s) + '</div>').join(''); } }
    if (b.innerHTML !== h) b.innerHTML = h; b.style.display = h ? 'block' : 'none';
  }
  document.getElementById('pd-gps').onclick = e => { const k = e.target.dataset && e.target.dataset.k; if (k) { try { localStorage.setItem(k, '1'); } catch (x) {} gpsShow(); } };
  // 出门检查单：接车前 20 分钟出现（接车 = STD 前 135 分钟），全部勾完就消失；没勾完一直显示到 STD 前 60 分钟。外站短停（人在机场）不显示
  const PICKUP_MIN = 135, CHK = [['📱', '手机', 'Phone'], ['👛', '钱包', 'Wallet'], ['🛂', '护照', 'Passport'], ['🪪', '执照', 'Licence'], ['🩺', '体检合格证', 'Medical'], ['📲', 'iPad', 'iPad'], ['🧢', '帽子', 'Hat'], ['👔', '制服', 'Uniform'], ['👟', '过夜的鞋', 'Overnight shoes'], ['👕', '过夜的衣服', 'Overnight clothes'], ['🥪', '吃的', 'Food']];
  const ckKey = o => 'fa.chk.' + o.flight.no + o.flight.date;
  const ckGet = o => { try { return JSON.parse(localStorage.getItem(ckKey(o)) || '{}'); } catch (e) { return {}; } };
  let TURN = { k: '', v: false };
  async function isTurn(o) { const k = o.flight.no + o.flight.date; if (TURN.k === k) return TURN.v; TURN = { k, v: false };
    try { const L = (window.OFL && OFL.entries) ? await OFL.entries() : []; TURN.v = L.some(x => x.arr === o.flight.dep && x.std < std(o) && x.std + (x.trip || 0) * MIN + 20 * MIN > std(o) - 6 * 36e5); } catch (e) {} return TURN.v; }
  async function ckShow() {
    const o = S.ofp; let h = '';
    if (o && std(o)) { const t = now(), pu = std(o) - PICKUP_MIN * MIN, st = ckGet(o), done = CHK.every((c, i) => st[i]);
      if (t < offOf(o) && !st.x && !done && t >= pu - 20 * MIN && t < std(o) - 60 * MIN && !(await isTurn(o))) {
        const m = Math.ceil((pu - t) / MIN);
        h = '<div class="ch"><span>🧳 ' + XS('出门检查单', 'Leaving checklist') + '</span><small>' + (m > 0 ? XS('接车还有 ' + m + ' 分', 'Pick-up in ' + m + ' min') : XS('接车时间到', 'Pick-up now')) + '</small><button class="btn sm" data-x="1">✕</button></div><div class="cols">'
          + CHK.map((c, i) => '<div class="ci' + (st[i] ? ' on' : '') + '" data-i="' + i + '"><i>' + (st[i] ? '✓' : '') + '</i>' + c[0] + ' ' + esc(XS(c[1], c[2])) + '</div>').join('') + '</div>'; } }
    if (ck.dataset.h !== h) { ck.dataset.h = h; ck.innerHTML = h; } ck.style.display = h ? 'block' : 'none';
  }
  ck.onclick = e => { const o = S.ofp; if (!o) return; const st = ckGet(o), it = e.target.closest('.ci');
    if (e.target.closest('[data-x]')) st.x = 1; else if (it) { const i = +it.dataset.i; st[i] = st[i] ? 0 : 1; } else return;
    try { localStorage.setItem(ckKey(o), JSON.stringify(st)); } catch (x) {} ckShow(); };
  function upd() {
    ckShow(); gpsShow();
    const o = S.ofp, cb = document.getElementById('pd-cb'), tl = document.getElementById('pd-tl'); let hc = '', ht = '';
    if (o && std(o)) {
      const t = now(), s0 = std(o), pre = t < offOf(o), bt = s0 - CB_MIN * MIN;
      if (pre && t >= bt - 30 * MIN && t < s0 - 75 * MIN) { const m = Math.ceil((bt - t) / MIN); hc = '👥 ' + (m > 0 ? XS('机组简报 还有 ' + m + ' 分', 'Crew brief in ' + m + ' min') : XS('机组简报 现在', 'Crew brief now')) + '<span class="ex">!</span>'; }
      if (pre && t >= s0 - 75 * MIN) {
        const m = s => Math.round((t - (s0 - s[0] * MIN)) / MIN), cur = TLS.filter(s => m(s) >= 0).pop(), nx = TLS.find(s => m(s) < 0), lb = s => XS(s[1], s[2]);
        ht = cur ? '⏱ ' + lb(cur) + ' <span class="m neg">−' + m(cur) + '</span>' + (nx ? '<span class="nx">' + lb(nx) + ' ' + (-m(nx)) + XS(' 分', "'") + '</span>' : '') : '⏱ ' + lb(nx) + ' <span class="m">' + XS('还有 ', 'in ') + (-m(nx)) + XS(' 分', ' min') + '</span>';
      }
    }
    if (cb.innerHTML !== hc) cb.innerHTML = hc; cb.style.display = hc ? 'inline-flex' : 'none';
    if (tl.innerHTML !== ht) tl.innerHTML = ht; tl.style.display = ht ? 'inline-flex' : 'none';
  }
  setInterval(upd, 5000); setTimeout(upd, 1500);
  window.PDX = { upd, openCrew, openTl, ckShow };
})();
