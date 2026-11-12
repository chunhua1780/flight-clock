/* Today Brief：把整个航班总结成一页（可打印 / 存成 PDF）。
   用主页面里的全局函数：S, assess, candidates, catAt, ekHints, th, thb, tt, LANG, hmZ, dur, distNm, posAt, tb, TYPES, typeIdx, catTag, catName, WX, esc, R1, R2, MIN */
'use strict';
function briefFull() {
  const o = S.ofp, f = o.flight, T = o.times, F = o.fuel || {}, W = o.weights || {};
  const T0 = tb(), ETA = atP(T.trip || 0);
  const t1 = n => n == null ? '—' : (n / 1000).toFixed(1) + ' t';
  const mm = m => m == null ? '' : dur(m);
  const C = {}; candidates().forEach(c => { C[c.icao] = c; });
  const rateCls = r => ({ green: 'kg', amber: 'ka', red: 'kr' }[r] || '');
  const rateTxt = r => th({ green: '好', amber: '注意', red: '差', none: '无资料' }[r], { green: 'OK', amber: 'Caution', red: 'Poor', none: 'n/a' }[r]);
  const wxz = (a, lang) => a.w && a.src !== 'none' ? WX.say(a.w, lang) : [lang === 'en' ? 'no forecast for this time' : '没有这个时间的预报'];
  const wxLine = a => thb(esc(wxz(a, 'zh').join('；')), esc(wxz(a, 'en').join('; ')));
  const notes = (a, c, t) => {
    const n = a.notes.filter(x => x.lv !== 'info').map(x => '<span class="' + (x.lv === 'red' ? 'kr' : 'ka') + '">' + th(esc(x.zh), esc(x.en || x.zh)) + '</span>');
    const h = c ? ekHints(c.ek, t).filter(x => x.lv !== 'info').map(x => '<span class="' + (x.lv === 'red' ? 'kr' : 'ka') + '">◆ ' + th(esc(x.zh), esc(x.en)) + '</span>') : [];
    return h.concat(n).join('<br>') || '<span class="small">' + th('无特别', 'nothing special') + '</span>';
  };
  const fl = (T.plndFl || '').split(/\s+/).filter(Boolean).map((x, i) => { const m = /^(?:(\w+)\/)?(\d{3})$/.exec(x); return m ? (m[1] ? m[1] + ' FL' + m[2] : 'FL' + m[2]) : x; });
  const wind = T.avgWind ? { hw: T.avgWind[0] === 'M', v: +T.avgWind.slice(1) } : null;

  // 机场评估
  const ap = (icao, t, rwyPlan) => {
    const c = C[icao]; if (!c) return null;
    const a = assess(c, t), pk = a.rw && a.rw.pick;
    return { c, a, t, rwy: rwyPlan || (pk && pk.id), pk, cat: c.ek ? catAt(c.ek, t) : null };
  };
  const dep = ap(f.dep, T0, f.depRwy), dst = ap(f.arr, ETA, f.arrRwy);
  const alts = o.alternates.map(x => ap(x.icao, ETA + x.time * MIN)).filter(Boolean);

  // 每小时的航路备降场（1 小时圈内）
  const hours = [];
  const usable = c => c.ek ? (c.ek.c[typeIdx()] !== '-') : c.ofp;
  for (let h = 0; h * 60 < (T.trip || 0); h++) {
    const set = {};
    for (let m = h * 60; m <= Math.min((h + 1) * 60, T.trip); m += 10) {
      const q = posAt(m); if (!q) continue;
      candidates().forEach(c => { if (!usable(c) || c.icao === f.dep && h > 0) return; const d = distNm(q.pos, c.pos); if (d <= R1 && (!set[c.icao] || d < set[c.icao].d)) set[c.icao] = { c, d, m }; });
    }
    const WR = { green: 0, amber: 1, none: 2, red: 3 }, CR = { D: 0, A1: 1, A2: 2, CA: 3, EA: 4 };
    const list = Object.values(set).map(x => { const t = atP(x.m), a = assess(x.c, t), cat = x.c.ek ? catAt(x.c.ek, t) : '-'; return Object.assign(x, { t, a, cat, bad: ekHints(x.c.ek, t).some(z => z.lv === 'red') }); })
      .filter(x => x.cat !== '-' || !S.EK)
      .sort((p, q) => (p.bad - q.bad) || (WR[p.a.rate] - WR[q.a.rate]) || ((CR[p.cat] ?? 5) - (CR[q.cat] ?? 5)) || (p.d - q.d));
    hours.push({ h, from: atP(h * 60), to: atP(Math.min((h + 1) * 60, T.trip)), list });
  }
  // 航路天气：离航路 820 nm 以内、经过时天气要注意/差的机场
  const sig = [];
  (S.samp || []).length && candidates().forEach(c => {
    if (!c.ofp) return;
    let best = 1e9, bt = 0; S.samp.forEach(q => { const d = distNm(q.pos, c.pos); if (d < best) { best = d; bt = q.t; } });
    if (best > R2) return;
    const a = assess(c, atP(bt));
    if (a.rate === 'amber' || a.rate === 'red') sig.push({ c, a, t: atP(bt), x: best });
  });
  sig.sort((p, q) => p.t - q.t);

  // ---------- 老机长的口头简报 ----------
  const nm = c => c ? c.icao + (c.iata ? '/' + c.iata : '') : '';
  const sayZ = [], sayE = [];
  sayZ.push('今天我们飞 <b>' + f.no + '</b>，' + f.dep + '/' + f.depIata + ' 到 ' + f.arr + '/' + f.arrIata + '，飞机 ' + f.reg + ' ' + f.type + '。计划 ' + hmZ(T.std) + ' 撤轮挡，' + (S.atd ? '实际 ' + hmZ(S.atd) + ' 起飞' : '大约 ' + hmZ(T0) + ' 起飞') + '，空中 <b>' + mm(T.trip) + '</b>，预计 <b>' + hmZ(ETA) + '</b> 落地（计划到达 ' + hmZ(T.sta) + '）。');
  sayE.push('Today is <b>' + f.no + '</b>, ' + f.dep + '/' + f.depIata + ' to ' + f.arr + '/' + f.arrIata + ', ' + f.reg + ' ' + f.type + '. Off-blocks ' + hmZ(T.std) + ', ' + (S.atd ? 'airborne ' + hmZ(S.atd) : 'takeoff about ' + hmZ(T0)) + ', flight time <b>' + mm(T.trip) + '</b>, landing about <b>' + hmZ(ETA) + '</b> (STA ' + hmZ(T.sta) + ').');
  sayZ.push('航路 ' + (T.groundDist || '—') + ' nm（空中距离 ' + (T.airDist || '—') + '），巡航 ' + (fl.join('，') || T.crzFl || '—') + (wind ? '，平均' + (wind.hw ? '逆风 ' : '顺风 ') + wind.v + ' 节' : '') + (T.avgIsa ? '，ISA ' + T.avgIsa.replace('P', '+').replace('M', '-') : '') + '。');
  sayE.push('Ground distance ' + (T.groundDist || '—') + ' nm (air ' + (T.airDist || '—') + '), cruise ' + (fl.join(', ') || T.crzFl || '—') + (wind ? ', average ' + (wind.hw ? 'headwind ' : 'tailwind ') + wind.v + ' kt' : '') + (T.avgIsa ? ', ISA ' + T.avgIsa.replace('P', '+').replace('M', '-') : '') + '.');
  if (F.ramp) {
    sayZ.push('油量：总油 <b>' + t1(F.ramp.fuel) + '</b>（起飞油 ' + t1(F.tof && F.tof.fuel) + '）。航程油 ' + t1(F.trip && F.trip.fuel) + '，应急油 ' + t1(F.cont && F.cont.fuel) + (F.cont && F.cont.label ? '（' + F.cont.label + '）' : '') + '，备降 ' + (F.altn ? F.altn.icao + ' ' + t1(F.altn.fuel) : '—') + '，最后储备 ' + t1(F.frsv && F.frsv.fuel) + '，<b>额外油 ' + t1(F.extra && F.extra.fuel) + (F.extra ? '（' + (F.extra.label || '') + '，约 ' + F.extra.time + ' 分钟）' : '') + '</b>。可飞时间 ' + mm(F.ramp.time) + '。');
    sayE.push('Fuel: block <b>' + t1(F.ramp.fuel) + '</b> (takeoff ' + t1(F.tof && F.tof.fuel) + '). Trip ' + t1(F.trip && F.trip.fuel) + ', contingency ' + t1(F.cont && F.cont.fuel) + (F.cont && F.cont.label ? ' (' + F.cont.label + ')' : '') + ', alternate ' + (F.altn ? F.altn.icao + ' ' + t1(F.altn.fuel) : '—') + ', final reserve ' + t1(F.frsv && F.frsv.fuel) + ', <b>extra ' + t1(F.extra && F.extra.fuel) + (F.extra ? ' (' + (F.extra.label || '') + ', ~' + F.extra.time + ' min)' : '') + '</b>. Endurance ' + mm(F.ramp.time) + '.');
  }
  if (dep) { sayZ.push('起飞 ' + nm(dep.c) + '：' + wxz(dep.a, 'zh')[0] + '，跑道 ' + (dep.rwy || '—') + '。'); sayE.push('Departure ' + nm(dep.c) + ': ' + wxz(dep.a, 'en')[0] + ', runway ' + (dep.rwy || '—') + '.'); }
  if (dst) {
    const n = dst.a.notes.filter(x => x.lv !== 'info').slice(0, 3);
    sayZ.push('落地 ' + nm(dst.c) + '：' + hmZ(ETA) + ' 时 ' + wxz(dst.a, 'zh').join('；') + '，预计跑道 ' + (dst.rwy || '—') + '。' + (n.length ? '注意：' + n.map(x => x.zh).join('，') + '。' : ''));
    sayE.push('Arrival ' + nm(dst.c) + ' at ' + hmZ(ETA) + ': ' + wxz(dst.a, 'en').join('; ') + ', expect runway ' + (dst.rwy || '—') + '.' + (n.length ? ' Note: ' + n.map(x => x.en || x.zh).join(', ') + '.' : ''));
  }
  if (alts.length) { sayZ.push('目的地备降场：' + alts.map(x => x.c.icao + '（' + rateTxt(x.a.rate).replace(/<[^>]+>.*$/, '') + '）').join('，') + '。'); sayE.push('Destination alternates: ' + alts.map(x => x.c.icao + ' (' + { green: 'OK', amber: 'caution', red: 'poor', none: 'n/a' }[x.a.rate] + ')').join(', ') + '.'); }
  if ((o.firs || []).length) { sayZ.push('航路经过：' + o.firs.map(x => x.name.replace(' FIR', '') + '（' + x.wp + ' ' + hmZ(atP(x.t)) + '）').join(' → ') + '。'); sayE.push('FIRs: ' + o.firs.map(x => x.name.replace(' FIR', '') + ' (' + x.wp + ' ' + hmZ(atP(x.t)) + ')').join(' → ') + '.'); }
  (o.dp || []).forEach(d => { sayZ.push('释压改航点：' + d[0] + '；' + d.slice(1).join('；') + '。'); sayE.push('Depressurisation: ' + d.join('; ') + '.'); });
  // 只说主要危险：雷暴 / CB / 低能见 / 低云 / 大风
  const hz0 = (a, en) => { const c = [a.w.main].concat(a.w.maybe.map(m => m.c)); const k = new Set();
    c.forEach(x => { if (!x) return; const wx = (x.wx || []).join(' '); if (/TS/.test(wx) || x.cb) k.add(en ? 'TS/CB' : '雷暴/CB'); if (x.vis != null && x.vis < 3000) k.add(en ? 'low vis' : '低能见度'); if (x.ceil != null && x.ceil < 1000) k.add(en ? 'low ceiling' : '低云'); if (x.wind && Math.max(x.wind.spd, x.wind.gust || 0) >= 30) k.add(en ? 'strong wind' : '大风'); if (/DU|SA|SS|DS/.test(wx)) k.add(en ? 'dust/sand' : '沙尘'); });
    return [...k].join(en ? ', ' : '、') || (en ? 'caution' : '注意'); };
  const sigW = sig.filter(x => x.a.w);
  sayZ.push(sigW.length ? '航路天气要注意：' + sigW.slice(0, 8).map(x => x.c.icao + ' ' + hmZ(x.t) + ' ' + hz0(x.a)).join('；') + '（详见下面「航路天气」）。' : '航路沿线机场的天气没有明显问题。');
  sayE.push(sigW.length ? 'Enroute weather to watch: ' + sigW.slice(0, 8).map(x => x.c.icao + ' ' + hmZ(x.t) + ' ' + hz0(x.a, 1)).join('; ') + ' (see Enroute weather below).' : 'No significant weather at airports along the route.');
  const hz = hours.map(h => (h.h + 1) + 'h: ' + (h.list.slice(0, 3).map(x => x.c.icao).join('/') || '—'));
  sayZ.push('每个小时最好的航路备降场：' + hz.join('，') + '。'); sayE.push('Best enroute alternates by hour: ' + hz.join(', ') + '.');
  const says = LANG === 'en' ? sayE : LANG === 'zh' ? sayZ : sayZ.map((z, i) => z + '<br><span class="en">' + sayE[i] + '</span>');

  // ---------- 页面 ----------
  let h = '<h1>Today Brief · ' + f.no + ' · ' + f.date + ' ' + new Date(T.std || f.dateUTC).getUTCFullYear() + '</h1>' +
    '<div class="small">' + f.dep + ' → ' + f.arr + ' · ' + f.reg + ' ' + f.type + ' · ' + th('生成时间', 'Generated') + ' ' + hmZ(Date.now()) + ' · ' + th(S.atd ? '按实际起飞时间 ' + hmZ(S.atd) : '按计划起飞时间 ' + hmZ(T0), S.atd ? 'based on ATD ' + hmZ(S.atd) : 'based on planned takeoff ' + hmZ(T0)) + ' · ' + th('所有时间 UTC', 'all times UTC') + '</div>';
  h += '<h2>' + th('机长简报', 'Captain\'s brief') + '</h2><div class="say">' + says.map(x => '<p>' + x + '</p>').join('') + '</div>';
  h += '<h2>' + th('航班', 'Flight') + '</h2><table>' +
    '<tr><th>' + th('航路', 'Route') + '</th><td colspan="3" style="font-family:monospace;font-size:11px">' + f.dep + '/' + (f.depRwy || '') + ' ' + esc(o.route) + ' ' + f.arr + '/' + (f.arrRwy || '') + '</td></tr>' +
    '<tr><th>STD / ' + th('起飞', 'T/O') + '</th><td class="num">' + hmZ(T.std) + ' / ' + hmZ(T0) + '</td><th>ETA / STA</th><td class="num">' + hmZ(ETA) + ' / ' + hmZ(T.sta) + '</td></tr>' +
    '<tr><th>' + th('飞行时间', 'Flight time') + '</th><td class="num"><b>' + mm(T.trip) + '</b> (' + th('滑行', 'taxi') + ' ' + mm(T.taxi) + ')</td><th>' + th('距离', 'Distance') + '</th><td class="num">GND ' + (T.groundDist || '—') + ' / AIR ' + (T.airDist || '—') + ' nm</td></tr>' +
    '<tr><th>' + th('高度', 'Levels') + '</th><td>' + (fl.join(' · ') || T.crzFl || '—') + '</td><th>' + th('平均风 / 温度', 'Avg wind / ISA') + '</th><td class="num">' + (T.avgWind || '—') + ' kt · ISA ' + (T.avgIsa || '—') + ' · TRK ' + (T.avgTrk || '—') + '</td></tr>' +
    (W.ezfw ? '<tr><th>' + th('重量 (计划/最大)', 'Weights (est/max)') + '</th><td colspan="3" class="num">ZFW ' + W.ezfw[0] + ' / ' + W.ezfw[1] + ' · TOW ' + (W.etow || [])[0] + ' / ' + (W.etow || [])[1] + ' · LW ' + (W.elwt || [])[0] + ' / ' + (W.elwt || [])[1] + ' kg</td></tr>' : '') + '</table>';
  if (F.ramp) {
    const row = (a, b, x, bold) => '<tr' + (bold ? ' style="font-weight:700;background:#f4f6fa"' : '') + '><th>' + a + '</th><td>' + (b || '') + '</td><td class="num">' + (x && x.fuel != null ? x.fuel.toLocaleString('en') + ' kg' : '—') + '</td><td class="num">' + (x && x.time != null ? mm(x.time) : '') + '</td></tr>';
    const minReq = [F.trip, F.cont, F.altn, F.frsv].reduce((s, x) => s + (x ? x.fuel : 0), 0);
    h += '<h2>' + th('油量', 'Fuel') + '</h2><table><tr><th></th><th></th><th>' + th('油量', 'Fuel') + '</th><th>' + th('时间', 'Time') + '</th></tr>' +
      row(th('航程油', 'Trip'), f.arr, F.trip) + row(th('应急油', 'Contingency'), F.cont && F.cont.label, F.cont) + row(th('备降油', 'Alternate'), F.altn && F.altn.icao, F.altn) +
      row(th('最后储备', 'Final reserve'), '', F.frsv) + row(th('最低所需', 'Minimum required'), '', { fuel: minReq }, true) +
      row(th('额外油', 'Extra'), F.extra && F.extra.label, F.extra) + row(th('起飞油', 'Takeoff fuel'), '', F.tof, true) + row(th('滑行油', 'Taxi'), '', F.taxi) +
      row(th('总油 (撤轮挡)', 'Block (ramp)'), th('可飞时间', 'endurance'), F.ramp, true) + '</table>' +
      '<div class="small">' + (F.reason ? th('额外油原因', 'Discretionary reason') + '：' + esc(F.reason) + ' · ' : '') + esc(F.tanker || '') + '</div>';
  }
  const apBlock = (title, x, extra) => !x ? '' : '<tr><td><b>' + title + '</b><br>' + catTag(x.cat) + ' <b>' + x.c.icao + '</b> ' + esc(x.c.iata || '') + '<br><span class="small">' + esc((x.c.db && x.c.db[2]) || x.c.name || '') + '</span></td>' +
    '<td class="num">' + hmZ(x.t) + (extra || '') + '</td><td><span class="' + rateCls(x.a.rate) + '">● ' + rateTxt(x.a.rate) + '</span><br>' + wxLine(x.a) + '</td>' +
    '<td>' + (x.rwy ? 'RWY <b>' + esc(x.rwy) + '</b>' + (x.pk && x.pk.head != null && x.pk.id === x.rwy ? '<br><span class="small">H ' + x.pk.head + ' / X ' + x.pk.cross + (x.pk.tail ? ' / T ' + x.pk.tail : '') + '</span>' : '') : '—') + '</td><td>' + notes(x.a, x.c, x.t) + '</td></tr>';
  h += '<h2>' + th('机场', 'Airports') + '</h2><table><tr><th>' + th('机场', 'Airport') + '</th><th>' + th('时间', 'Time') + '</th><th>' + th('天气', 'Weather') + '</th><th>' + th('跑道', 'RWY') + '</th><th>' + th('NOTAM / 公司限制', 'NOTAM / company') + '</th></tr>' +
    apBlock(th('起飞', 'Departure'), dep) + apBlock(th('目的地', 'Destination'), dst) +
    alts.map((x, i) => apBlock(th('目的地备降', 'Dest altn') + ' ' + (i + 1), x, '<br><span class="small">+' + mm(o.alternates[i].time) + ' · ' + o.alternates[i].dist + ' nm · FL' + o.alternates[i].fl + '</span>')).join('') + '</table>';
  if ((o.firs || []).length) h += '<h2>' + th('FIR 移交点', 'FIR boundaries') + '</h2><table><tr><th>' + th('时间', 'Time') + '</th><th>' + th('移交点', 'Point') + '</th><th>' + th('进入', 'Entering') + '</th></tr>' + o.firs.map(x => '<tr><td class="num">' + hmZ(atP(x.t)) + ' <span class="small">+' + mm(x.t) + '</span></td><td><b>' + x.wp + '</b></td><td>' + x.name + ' (' + x.code + ')</td></tr>').join('') + '</table>';
  h += '<h2>' + th('航路备降场（每小时，1 小时 / 410 nm 以内）', 'Enroute alternates by hour (within 1h / 410 nm)') + '</h2><table><tr><th>' + th('时段', 'Period') + '</th><th>' + th('机场（按 天气 → 类别 → 距离）', 'Airports (weather → category → distance)') + '</th></tr>' +
    hours.map(x => '<tr><td class="num" style="white-space:nowrap">' + hmZ(x.from) + '–' + hmZ(x.to) + '<br><span class="small">' + (x.h) + '–' + (x.h + 1) + 'h</span></td><td>' +
      (x.list.length ? x.list.slice(0, 8).map(y => { const hs = ekHints(y.c.ek, y.t).filter(z => z.lv !== 'info').slice(0, 1), nn = y.a.notes.filter(z => z.lv === 'red').slice(0, 1);
        return catTag(y.cat) + ' <b>' + y.c.icao + '</b> <span class="' + rateCls(y.a.rate) + '">●</span> <span class="small">' + Math.round(y.d) + ' nm' + (hs.length ? ' · ' + th(esc(hs[0].zh), esc(hs[0].en)) : '') + (nn.length ? ' · <span class="kr">' + th(esc(nn[0].zh), esc(nn[0].en || nn[0].zh)) + '</span>' : '') + '</span>'; }).join('<br>') : '<span class="kr">' + th('这个时段 1 小时内没有可用机场', 'No usable airport within 1h') + '</span>') + '</td></tr>').join('') + '</table>';
  h += '<h2>' + th('航路天气', 'Enroute weather') + '</h2>' + (sig.length ? '<table>' + sig.map(x => '<tr><td class="num">' + hmZ(x.t) + '</td><td><b>' + x.c.icao + '</b><br><span class="small">' + th('离航路', 'off track') + ' ' + Math.round(x.x) + ' nm</span></td><td><span class="' + rateCls(x.a.rate) + '">● ' + rateTxt(x.a.rate) + '</span> ' + wxLine(x.a) + '</td></tr>').join('') + '</table>' : '<div>' + th('航路沿线机场在经过时间没有明显的天气问题（按 OFP 里的 TAF）。', 'No significant weather at airports along the route at passing times (OFP TAFs).') + '</div>');
  if ((o.dp || []).length || (o.dispatch || []).length) h += '<h2>' + th('释压 / 签派提示', 'Depressurisation / dispatch notes') + '</h2>' + (o.dp || []).map(d => '<div><b>' + esc(d[0]) + '</b><br>' + d.slice(1).map(esc).join('<br>') + '</div>').join('') + '<ul>' + (o.dispatch || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  h += '<p class="small" style="margin-top:18px">' + th('仅供辅助了解情况，不作为运行依据。以公司批准的 OFP / EFB / 签派 / ATC 为准。天气和 NOTAM 来自 OFP 包，NOTAM 要点是按关键词挑出的，以原文为准。', 'Awareness aid only, not for operational use. Company OFP / EFB / dispatch / ATC prevail. Weather and NOTAMs from the OFP package; NOTAM highlights are keyword-based — refer to the original text.') + '</p>';
  return h;
}

/* ---------- 一页版 Today Brief：竖版 A4，表格，言简意赅；主要影响自动上色 ---------- */
const SPECIAL_FIR = {
  OIIX: ['伊朗', 'Iran'], ORBB: ['伊拉克', 'Iraq'], OAKX: ['阿富汗', 'Afghanistan'], OYSC: ['也门', 'Yemen'], OSTT: ['叙利亚', 'Syria'],
  LLLL: ['以色列', 'Israel'], OLBB: ['黎巴嫩', 'Lebanon'], HSSX: ['苏丹', 'Sudan'], HLLL: ['利比亚', 'Libya'], UMMV: ['白俄罗斯', 'Belarus'],
  UKBV: ['乌克兰', 'Ukraine'], UKDV: ['乌克兰', 'Ukraine'], UKLV: ['乌克兰', 'Ukraine'], UKOV: ['乌克兰', 'Ukraine'], UKFV: ['乌克兰', 'Ukraine'],
  ZKKP: ['朝鲜', 'North Korea'], OPKR: ['巴基斯坦', 'Pakistan'], OPLR: ['巴基斯坦', 'Pakistan'], HCSM: ['索马里', 'Somalia'], VYYF: ['缅甸', 'Myanmar']
};
// 机场「已知问题」：从 NOTAM 里自动认出来的 + 机组自己记下的（每个机场一份，存在这台 iPad 上）
const KNOWN = [
  [/BIRD/, '鸟击风险', 'Bird strike risk'], [/WIND\s?SHEAR/, '风切变', 'Wind shear'], [/HOT\s?SPOT|RWY INCURSION|CONFUSION/, '跑道侵入热点', 'Runway incursion hotspots'],
  [/GNSS|GPS/, 'GPS 干扰', 'GNSS interference'], [/FOLLOW-ME|TOWED|TOW\b/, '机坪特殊程序（引导 / 拖行）', 'Special apron procedures'],
  [/TWY[^.]{0,30}CLSD|TAXIWAY[^.]{0,30}CLSD/, '滑行道关闭', 'Taxiway closures'], [/CRANE|OBST/, '障碍物 / 吊车', 'Obstacles / cranes'],
  [/CURFEW|NOISE/, '宵禁 / 噪音限制', 'Curfew / noise'], [/FUEL\b[^.]{0,30}(NOT AVBL|SHORTAGE|LTD)/, '燃油受限', 'Fuel limited'], [/DRONE|UAS|UAV|LASER/, '无人机 / 激光', 'Drones / lasers']
];
const apNote = icao => { try { return localStorage.getItem('fa.apnote.' + icao) || ''; } catch (e) { return ''; } };
function saveApNote(icao, el) { try { localStorage.setItem('fa.apnote.' + icao, el.innerText.trim()); } catch (e) {} }
function saveFlNote(key, el) { try { localStorage.setItem('fa.flnote.' + key, el.innerText.trim()); } catch (e) {} }
const flNote = key => { try { return localStorage.getItem('fa.flnote.' + key) || ''; } catch (e) { return ''; } };

function briefOne() {
  const o = S.ofp, f = o.flight, T = o.times, F = o.fuel || {}, W = o.weights || {};
  const T0 = tb(), ETA = atP(T.trip || 0);
  const L2 = (zh, en) => LANG === 'en' ? en : zh;
  const t1 = n => n == null ? '—' : (n / 1000).toFixed(1) + ' t';
  const mm = m => m == null ? '' : dur(m);
  const C = {}; candidates().forEach(c => { C[c.icao] = c; });
  const fl = (T.plndFl || '').split(/\s+/).filter(Boolean).map(x => { const m = /^(?:(\w+)\/)?(\d{3})$/.exec(x); return m ? m[2] : x; });
  const hz = a => { if (!a || !a.w) return []; const k = new Set();
    [a.w.main].concat(a.w.maybe.map(m => m.c)).forEach(x => { if (!x) return; const wx = (x.wx || []).join(' ');
      if (/TS/.test(wx) || x.cb) k.add(L2('雷暴', 'TS')); if (x.vis != null && x.vis < 3000) k.add(L2('能见度 ', 'vis ') + x.vis + 'm'); if (x.ceil != null && x.ceil < 1000) k.add(L2('云底 ', 'ceiling ') + x.ceil + 'ft');
      if (x.wind && Math.max(x.wind.spd, x.wind.gust || 0) >= 25) k.add(L2('大风 ', 'wind ') + x.wind.spd + (x.wind.gust ? 'G' + x.wind.gust : '') + 'kt'); if (/DU|SA|SS|DS/.test(wx)) k.add(L2('沙尘', 'dust')); if (/FG/.test(wx)) k.add(L2('雾', 'fog')); if (/FZ|SN/.test(wx)) k.add(L2('结冰/雪', 'icing/snow')); });
    return [...k]; };
  const apInfo = (icao, t, rwy) => {
    const c = C[icao]; if (!c) return null;
    const a = assess(c, t), pk = a.rw && a.rw.pick;
    const nt = a.notes.filter(n => n.lv !== 'info').slice(0, 4).map(n => ({ lv: n.lv, s: LANG === 'en' ? (n.en || n.zh) : n.zh }));
    const known = []; KNOWN.forEach(([re, zh, en]) => { if ((o.notams[icao] || []).some(n => re.test(n.text))) known.push(L2(zh, en)); });
    return { c, a, t, rwy: rwy || (pk && pk.id), pk, nt, known, elev: c.db ? c.db[5] : null, wxh: hz(a) };
  };
  const dep = apInfo(f.dep, T0, f.depRwy), dst = apInfo(f.arr, ETA, f.arrRwy);
  const alts = o.alternates.map(x => apInfo(x.icao, ETA + x.time * MIN)).filter(Boolean);

  // 航路上的雷暴 → 颠簸时段（起飞后几小时几分开始、持续多久）
  const hits = [];
  candidates().forEach(c => {
    if (!c.ofp || c.icao === f.dep || c.icao === f.arr) return;
    let best = 1e9, bt = 0; (S.samp || []).forEach(q => { const d = distNm(q.pos, c.pos); if (d < best) { best = d; bt = q.t; } });
    if (best > 250) return;
    const a = assess(c, atP(bt)), h = hz(a);
    if (h.some(x => /雷暴|TS/.test(x))) hits.push({ m: bt, c });
  });
  hits.sort((a, b) => a.m - b.m);
  const wins = [];
  hits.forEach(h => { const w = wins[wins.length - 1]; if (w && h.m - w.to <= 40) { w.to = h.m; w.aps.push(h.c.icao); } else wins.push({ from: h.m, to: h.m, aps: [h.c.icao] }); });
  wins.forEach(w => { w.from = Math.max(0, w.from - 15); w.to = Math.min(T.trip, w.to + 15); });

  // 主要影响（自动上色）
  const chips = [];
  const chip = (lv, zh, en) => chips.push({ lv, s: L2(zh, en) });
  const mg = (k, lab, labE) => { const w = W[k]; if (!w) return; const m = w[1] - w[0], p = m / w[1];
    if (m < 2000 || p < .01) chip('r', lab + ' 接近最大（余 ' + t1(m) + '）', labE + ' near max (' + t1(m) + ' margin)');
    else if (p < .04) chip('a', lab + ' 偏重（余 ' + t1(m) + '）', labE + ' heavy (' + t1(m) + ' margin)'); };
  mg('etow', '起飞重量', 'TOW'); mg('elwt', '落地重量', 'LW'); mg('ezfw', '无油重量', 'ZFW');
  if (W.etow && W.etow[1] - W.etow[0] >= 2000 && (W.etow[1] - W.etow[0]) / W.etow[1] >= .04) chip('g', '起飞重量 ' + t1(W.etow[0]) + '（余 ' + t1(W.etow[1] - W.etow[0]) + '）', 'TOW ' + t1(W.etow[0]) + ' (' + t1(W.etow[1] - W.etow[0]) + ' margin)');
  if (F.extra && F.extra.fuel) chip(F.extra.time >= 30 ? 'b' : 'g', '额外油 ' + t1(F.extra.fuel) + '（' + F.extra.time + ' 分）' + (F.extra.label ? ' ' + F.extra.label : ''), 'Extra ' + t1(F.extra.fuel) + ' (' + F.extra.time + ' min)' + (F.extra.label ? ' ' + F.extra.label : ''));
  [[dep, '起飞', 'DEP'], [dst, '落地', 'ARR']].forEach(([x, z, e]) => { if (!x) return;
    if (x.elev >= 5000) chip('r', z + '机场高原 ' + x.elev + ' ft', e + ' high altitude ' + x.elev + ' ft'); else if (x.elev >= 2500) chip('a', z + '机场标高 ' + x.elev + ' ft', e + ' elevation ' + x.elev + ' ft');
    if (x.wxh.length) chip(x.wxh.some(h => /雷暴|TS|雾|fog|能见度|vis/.test(h)) ? 'r' : 'a', z + '：' + x.wxh.join('、'), e + ': ' + x.wxh.join(', '));
    x.nt.filter(n => n.lv === 'red').slice(0, 2).forEach(n => chip('r', z + '：' + n.s, e + ': ' + n.s));
    if (x.known.length) chip('a', z + '：' + x.known.slice(0, 2).join('、'), e + ': ' + x.known.slice(0, 2).join(', ')); });
  wins.forEach(w => chip('r', '起飞后 ' + mm(w.from) + ' 起约 ' + mm(w.to - w.from) + ' 雷暴区，可能颠簸', 'T/O+' + mm(w.from) + ' for ~' + mm(w.to - w.from) + ': TS area, turbulence likely'));
  const legs = firLegs();
  legs.forEach(l => { const r = firNotams(l.code, l.tIn, l.tOut); if (r.some(x => /冲突|Conflict/.test(x.zh + x.en))) chip('r', l.name.replace(/ (FIR|UIR)$/, '') + '：冲突 / 安全警告', l.name.replace(/ (FIR|UIR)$/, '') + ': conflict / security'); });
  const gn = [...new Set(legs.filter(l => firNotams(l.code, l.tIn, l.tOut).some(x => /GPS/.test(x.zh))).map(l => l.code))];
  if (gn.length) chip('a', 'GPS 干扰：' + gn.join(' '), 'GNSS interference: ' + gn.join(' '));
  const nearSp = Object.keys(o.firNames || {}).filter(k => !legs.some(l => l.code === k) && (SPECIAL_FIR[k] || firNotams(k).some(x => x.lv === 'red')));
  nearSp.forEach(k => chip('r', '附近 ' + (SPECIAL_FIR[k] ? SPECIAL_FIR[k][0] : k) + '（' + k + '）：不要偏航进入', 'Nearby ' + (SPECIAL_FIR[k] ? SPECIAL_FIR[k][1] : k) + ' (' + k + '): do not stray in'));
  const ord = { r: 0, a: 1, b: 2, g: 3 }; chips.sort((a, b) => ord[a.lv] - ord[b.lv]);

  const H = (zh, en) => th(zh, en);
  const key = f.no + f.date;
  let h = '<div class="b1"><div class="b1t">TODAY BRIEF</div><div class="b1f">' + f.no + ' · ' + f.date + ' ' + new Date(T.std || f.dateUTC).getUTCFullYear() + '</div><div class="b1g">UTC · ' + L2('生成', 'gen') + ' ' + hmZ(Date.now()) + '</div></div>';
  // 1. 航班
  h += '<table class="bt"><tr><th>' + H('航班', 'Flight') + '</th><th>' + H('注册号', 'Reg') + '</th><th>' + H('航线', 'Route') + '</th><th>' + H('停机位', 'Bay') + '</th><th>' + H('飞行时间', 'Flight time') + '</th><th>' + H('高度', 'Levels') + '</th></tr>' +
    '<tr class="big"><td>' + f.no + '</td><td>' + f.reg + '<small> ' + f.type + '</small></td><td>' + f.depIata + ' → ' + f.arrIata + '<small> ' + f.dep + '–' + f.arr + '</small></td><td>' + (f.bay || '<span class="blank"></span>') + '</td><td>' + mm(T.trip) + '</td><td>FL' + (fl.join('/') || (T.crzFl || '').replace('FL', '')) + '</td></tr>' +
    '<tr><th>STD</th><th>' + H('起飞', 'T/O') + '</th><th>' + H('落地', 'Land') + '</th><th>STA</th><th>' + H('平均风', 'Avg wind') + '</th><th>' + H('距离', 'Dist') + '</th></tr>' +
    '<tr class="big"><td>' + hmZ(T.std) + '</td><td>' + hmZ(T0) + (S.atd ? '' : '<small> ' + L2('计划', 'plan') + '</small>') + '</td><td>' + hmZ(ETA) + '</td><td>' + hmZ(T.sta) + '</td><td>' + (T.avgWind ? (T.avgWind[0] === 'M' ? 'HW ' : 'TW ') + (+T.avgWind.slice(1)) + ' kt' : '—') + '</td><td>' + (T.groundDist || '—') + ' nm</td></tr></table>';
  // 2. 今天的主要影响
  h += '<div class="bh">' + H('今天的主要影响', 'Key threats today') + '</div><div class="chips2">' + (chips.length ? chips.map(c => '<span class="ch ' + c.lv + '">' + esc(c.s) + '</span>').join('') : '<span class="ch g">' + L2('没有特别影响', 'Nothing significant') + '</span>') + '</div>';
  // 3. 客舱 / 颠簸
  h += '<table class="bt"><tr><th style="width:24%">' + H('客舱简报', 'Cabin brief') + '</th><td>' +
    L2('飞行 <b>' + mm(T.trip) + '</b>，约 <b>' + hmZ(ETA) + '</b> 落地。', 'Flight <b>' + mm(T.trip) + '</b>, landing about <b>' + hmZ(ETA) + '</b>. ') +
    (wins.length ? wins.map(w => L2('<b class="kr">起飞后 ' + mm(w.from) + ' 开始，约 ' + mm(w.to - w.from) + '</b> 经过雷暴区（' + w.aps.slice(0, 3).join('/') + ' 附近），可能颠簸。', '<b class="kr">From T/O+' + mm(w.from) + ' for about ' + mm(w.to - w.from) + '</b> thunderstorm area (' + w.aps.slice(0, 3).join('/') + '), turbulence likely. ')).join('') +
      L2('服务安排在起飞后 ' + mm(wins[0].from) + ' 以前完成或之后再做。', 'Plan service before T/O+' + mm(wins[0].from) + ' or after.') : L2('航路沿线预报没有雷暴。', 'No thunderstorms forecast along the route.')) +
    (dst && dst.wxh.length ? L2(' 下降落地：<b>' + dst.wxh.join('、') + '</b>，可能颠簸。', ' Descent: <b>' + dst.wxh.join(', ') + '</b>, possible bumps.') : '') + '</td></tr></table>';
  // 4. 起飞 / 目的地
  const col = (lab, x) => !x ? '<td></td>' : '<td><div class="ap2">' + lab + ' <b>' + x.c.icao + '</b> ' + catTag(x.c.ek ? catAt(x.c.ek, x.t) : null) + ' <span class="sm">' + hmZ(x.t) + (x.rwy ? ' · RWY ' + esc(x.rwy) : '') + (x.elev != null ? ' · ' + x.elev + ' ft' : '') + '</span></div>' +
    '<div><span class="' + ({ green: 'kg', amber: 'ka', red: 'kr' }[x.a.rate] || '') + '">●</span> ' + esc((x.a.w && x.a.src !== 'none' ? WX.say(x.a.w, LANG === 'en' ? 'en' : 'zh') : [L2('没有预报', 'no forecast')]).join(' · ')) + '</div>' +
    (x.nt.length ? '<div class="sm2">' + x.nt.map(n => '<span class="' + (n.lv === 'red' ? 'kr' : 'ka') + '">▪ ' + esc(n.s) + '</span>').join('<br>') + '</div>' : '') +
    (x.known.length ? '<div class="sm2"><b>' + L2('已知问题', 'Known issues') + '：</b>' + esc(x.known.join('、')) + '</div>' : '') +
    '<div class="note" contenteditable="true" data-ph="' + L2('机组经验（会记住，下次自动出现）', 'Crew notes (remembered for next time)') + '" oninput="saveApNote(\'' + x.c.icao + '\', this)">' + esc(apNote(x.c.icao)) + '</div></td>';
  h += '<table class="bt"><tr><th style="width:50%">' + H('起飞机场', 'Departure') + '</th><th>' + H('目的地机场', 'Destination') + '</th></tr><tr>' + col('DEP', dep) + col('ARR', dst) + '</tr>' +
    '<tr><td colspan="2" class="sm2"><b>' + L2('备降', 'Alternates') + '：</b>' + alts.map(x => x.c.icao + ' <span class="' + ({ green: 'kg', amber: 'ka', red: 'kr' }[x.a.rate] || '') + '">●</span>').join('  ') + '</td></tr></table>';
  // 5. 燃油
  if (F.ramp) {
    const cx = (F.cont ? F.cont.fuel : 0) + (F.extra ? F.extra.fuel : 0), cxm = (F.cont ? F.cont.time || 0 : 0) + (F.extra ? F.extra.time || 0 : 0);
    h += '<table class="bt fuel2"><tr><th>' + H('总油', 'Block') + '</th><th>' + H('航程', 'Trip') + '</th><th class="hl">' + H('应急', 'Cont') + '</th><th class="hl">' + H('额外', 'Extra') + '</th><th>' + H('备降', 'Altn') + '</th><th>' + H('储备', 'FRSV') + '</th><th class="hl">' + H('应急+额外', 'Cont+Extra') + '</th></tr>' +
      '<tr class="big"><td>' + t1(F.ramp.fuel) + '<small> ' + mm(F.ramp.time) + '</small></td><td>' + t1(F.trip && F.trip.fuel) + '</td><td class="hl">' + t1(F.cont && F.cont.fuel) + '<small> ' + (F.cont ? F.cont.time + "'" : '') + '</small></td><td class="hl">' + t1(F.extra && F.extra.fuel) + '<small> ' + (F.extra ? F.extra.time + "'" : '') + '</small></td><td>' + t1(F.altn && F.altn.fuel) + '<small> ' + (F.altn ? F.altn.icao : '') + '</small></td><td>' + t1(F.frsv && F.frsv.fuel) + '</td><td class="hl"><b>' + t1(cx) + '</b><small> ' + cxm + "'</small></td></tr>" +
      (F.reason ? '<tr><td colspan="7" class="sm2">' + L2('额外油原因', 'Extra fuel reason') + '：' + esc(F.reason) + (o.dispatch || []).filter(x => /FUEL|HLDNG|HOLD/i.test(x)).slice(0, 2).map(x => ' · ' + esc(x)).join('') + '</td></tr>' : '') + '</table>';
  }
  // 6. 航路 / 管制区
  h += '<table class="bt"><tr><th style="width:14%">' + H('时间', 'Time') + '</th><th style="width:30%">' + H('管制区', 'FIR') + '</th><th>' + H('重要通告', 'Significant NOTAMs') + '</th></tr>' +
    legs.map(l => { const r = firSummary(firNotams(l.code, l.tIn, l.tOut).filter(x => x.lv !== 'info')); const sp = SPECIAL_FIR[l.code];
      return '<tr' + (r.some(x => x.lv === 'red') || sp ? ' class="rw"' : '') + '><td>' + hmZ(l.tIn) + '<small> +' + mm(l.from) + '</small></td><td><b>' + l.wp + '</b> ▸ ' + esc(l.name.replace(/ (FIR|UIR)$/, '')) + (sp ? ' <span class="kr">' + L2(sp[0], sp[1]) + '</span>' : '') + '</td><td class="sm2">' + (r.map(x => '<span class="' + (x.lv === 'red' ? 'kr' : 'ka') + '">' + L2(x.zh, x.en) + '</span>').join(' · ') || '—') + '</td></tr>'; }).join('') +
    ((o.dp || []).length ? '<tr><td colspan="3" class="sm2"><b>DP</b> ' + esc((o.dp[0][0] || '').replace(/^DP\s+\S+\s+\S+\s+-\s+/, '')) + ' — ' + L2('之前返回 ' + f.dep + '，之后继续 ' + f.arr, 'before: return ' + f.dep + ', after: continue ' + f.arr) + '</td></tr>' : '') + '</table>';
  // 7. 机组补充
  h += '<div class="bh">' + H('机组补充（其他可能的影响）', 'Crew additions (other threats)') + '</div><div class="note big" contenteditable="true" data-ph="' + L2('在这里写今天的其他威胁和对策……', 'Write other threats and mitigations here…') + '" oninput="saveFlNote(\'' + key + '\', this)">' + esc(flNote(key)) + '</div>';
  h += '<div class="foot">' + L2('仅供辅助了解情况，以公司 OFP / EFB / 签派 / ATC 为准 · NOTAM 按关键词挑出，以原文为准', 'Awareness aid only — company OFP / EFB / dispatch / ATC prevail · NOTAM items are keyword-based') + '</div>';
  return h;
}
