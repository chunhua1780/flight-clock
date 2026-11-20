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
    + '#pdsh .tl div{padding:7px 4px;border-bottom:1px solid var(--line);font-size:16px;font-weight:700}#pdsh .tl b{display:inline-block;width:3.2em}#pdsh .tl small{display:block;font-weight:500;font-size:13px;color:var(--dim);margin-left:3.6em}#pdsh .tl .done{opacity:.45}#pdsh .tl .now{background:rgba(63,207,127,.15)}';
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'pdx'; box.innerHTML = '<span class="ch" id="pd-cb"></span><span class="ch" id="pd-tl"></span>';
  (document.getElementById('mapwrap') || document.body).appendChild(box);
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
  function upd() {
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
  window.PDX = { upd, openCrew, openTl };
})();
