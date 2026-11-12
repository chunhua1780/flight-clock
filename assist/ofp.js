/* 飞行助手 · OFP 解析（全部离线，时间一律 UTC）
 * 输入：OFP 包的文字（PDF 提取出来的，或者直接粘贴的）
 * 输出：{ flight, route, times, navlog[], fixes{}, alternates[], airports{ICAO:{roles,metar,taf}}, notams{ICAO:[]} }
 */
(function (root) {
  'use strict';
  const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const hhmm = s => s ? (+s.slice(0, 2)) * 60 + (+s.slice(2, 4)) : null;      // "0752" → 472 分钟
  const ll = s => {                                                          // "N2151.5" / "E11232.8" → 度
    const m = /^([NSEW])(\d{2,3})(\d{2}(?:\.\d+)?)$/.exec(s);
    if (!m) return null;
    const v = +m[2] + (+m[3]) / 60;
    return m[1] === 'S' || m[1] === 'W' ? -v : v;
  };

  // 去掉每页的页眉页脚，统一空白
  function clean(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[  -​ 　\t]/g, ' ')
      .split('\n')
      .filter(l => !/^\s*(?:UAE|EK)\d{1,5}\/\d{2}[A-Za-z]{3}\d{2}\/[A-Z]{3}-[A-Z]{3}\s+\S+\s+OFP:/.test(l) && !/^\s*Page \d+ of \d+\s*$/.test(l))
      .map(l => l.replace(/\s+$/, ''));
  }

  function parse(text) {
    const L = clean(text);
    const T = L.join('\n');
    const out = { ok: false, flight: null, route: '', times: {}, navlog: [], fixes: {}, alternates: [], airports: {}, notams: {}, warnings: [] };

    // ---------- 1. 航班抬头 ----------
    const h = /\b(?:EK|UAE)?\s?(\d{1,5})\s+(\d{2})([A-Z]{3})\s+([A-Z]{4})\/([A-Z]{3})\s*-\s*([A-Z]{4})\/([A-Z]{3})(?:\s+(\S+))?(?:\s+([A-Z0-9]{1,2}-[A-Z0-9]{3,5}))?/.exec(T);
    if (!h) { out.warnings.push('没找到 OFP 抬头（例如 EK9873 11NOV ZGGG/CAN-OMDW/DWC）'); return out; }
    let year = new Date().getUTCFullYear();
    const yh = /\/(\d{2})([A-Z][a-z]{2})(\d{2})\//.exec(text) || /(\d{2})([A-Z][a-z]{2})(20\d{2})/.exec(text);
    if (yh) year = yh[3].length === 2 ? 2000 + (+yh[3]) : +yh[3];
    const dateUTC = Date.UTC(year, MON[h[3]], +h[2]);
    out.flight = { no: 'EK' + h[1], digits: h[1], date: h[2] + h[3], dateUTC, dep: h[4], depIata: h[5], arr: h[6], arrIata: h[7], type: h[8] || '', reg: h[9] || '' };

    // ---------- 2. 时间 / 油量 ----------
    const T1 = T.replace(/[ \t]{2,}/g, ' ');                                   // PDF 提取的文字词之间可能有两个空格
    const g = (re, i = 1) => { const m = re.exec(T1); return m ? m[i] : null; };
    const dep = g(/\bDEP\s+(\d{4})\b/), arr = g(/\bARR\s+(\d{4})\b/);
    const trip = /\bTRIP\s+([A-Z]{4})\s+(\d+)\s+(\d{4})\b/.exec(T);
    const taxi = /\bTAXI\s+(\d+)\s+(\d{4})\b/.exec(T);
    const altn = /\bALTN\s+([A-Z]{4})\s+(\d+)\s+(\d{4})\b/.exec(T);
    const t = out.times;
    if (dep) t.std = dateUTC + hhmm(dep) * 6e4;                                   // 计划撤轮挡 UTC
    if (arr) { t.sta = dateUTC + hhmm(arr) * 6e4; if (t.std && t.sta < t.std) t.sta += 864e5; }
    if (trip) { t.trip = hhmm(trip[3]); out.flight.tripFuel = +trip[2]; }
    if (taxi) t.taxi = hhmm(taxi[2]);
    if (altn) { t.altnTime = hhmm(altn[3]); out.flight.destAltn = altn[1]; }
    t.groundDist = +g(/GND DIST\s+(\d+)/) || null;
    t.airDist = +g(/AIR DIST\s+(\d+)/) || null;
    t.crzFl = g(/CRZ FL\/TEMP\s+(FL\d{3})/);
    t.avgWind = g(/AV W\/C\s+([PM]\d{3})/);
    t.rampFuel = g(/RAMP FUEL\s+([\d.]+)/);
    t.avgTrk = g(/AV TRK\s+(\d{3})/); t.avgIsa = g(/AV ISA\s+([PM]\d{2,3})/);
    t.plndFl = g(/PLND FL:\s*([^\n]+)/); if (t.plndFl) t.plndFl = t.plndFl.trim();
    // 油量表（kg；RAMP 是吨）
    const fl = (re) => { const m = re.exec(T1); return m ? { fuel: +m[1], time: m[2] ? hhmm(m[2]) : null } : null; };
    const fuel = out.fuel = {};
    fuel.trip = trip ? { fuel: +trip[2], time: hhmm(trip[3]) } : null;
    const cm = /\bCONT\s+([^\n]*?)\s+(\d+)\s+(\d{4})\b/.exec(T1);
    fuel.cont = cm ? { label: cm[1].trim(), fuel: +cm[2], time: hhmm(cm[3]) } : null;
    fuel.altn = altn ? { icao: altn[1], fuel: +altn[2], time: hhmm(altn[3]) } : null;
    fuel.frsv = fl(/\bFRSV\s+(\d+)\s+(\d{4})\b/);
    const ex = /\bEXTRA\s*([A-Z ]*?)\s+(\d+)\s+(\d{4})\b/.exec(T1);
    fuel.extra = ex ? { label: ex[1].trim(), fuel: +ex[2], time: hhmm(ex[3]) } : null;
    fuel.tof = fl(/\bT\/O FUEL\s+(\d+)()/);
    fuel.taxi = taxi ? { fuel: +taxi[1], time: hhmm(taxi[2]) } : null;
    const rf = /\bRAMP FUEL\s+([\d.]+)\s+(\d{4})/.exec(T1);
    fuel.ramp = rf ? { fuel: Math.round(+rf[1] * (+rf[1] < 1000 ? 1000 : 1)), time: hhmm(rf[2]) } : null;
    fuel.reason = g(/DISCR FUEL REASON:\s*([^\n]+)/);
    fuel.tanker = g(/\n\s*((?:NO )?TANKERING[^(\n]*)/);
    out.weights = {};
    [['ezfw', /EZFW\s+(\d+)\s+MZFW\s+(\d+)/], ['etow', /ETOW\s+(\d+)\s+MTOW\s+(\d+)/], ['elwt', /ELWT\s+(\d+)\s+MLWT\s+(\d+)/]].forEach(([k, re]) => { const m = re.exec(T1); if (m) out.weights[k] = [+m[1], +m[2]]; });
    // 签派简报 / 释压改航点
    const di = L.findIndex(l => /DISPATCH\s+BRIEFING\s+INFO/.test(l));
    out.dispatch = [];
    if (di >= 0) for (let i = di + 1; i < L.length && !/CREW\s+NOTES/.test(L[i]); i++) { const x = L[i].trim().replace(/\s+/g, ' '); if (!x) continue; if (/^-\s/.test(x)) out.dispatch.push(x.slice(2)); else if (out.dispatch.length) out.dispatch[out.dispatch.length - 1] += ' ' + x; }
    out.dp = [];
    L.forEach((l, i) => { if (/\*\*\*\s*DEPRESSURI[SZ]ATION\s+DIVERSION/.test(l)) out.dp.push([L[i + 1], L[i + 2], L[i + 3]].map(x => (x || '').trim().replace(/\s+/g, ' ')).filter(Boolean)); });

    // ---------- 3. 航路（ATC 放行那一行，可能跨行） ----------
    const rr = new RegExp('\\b' + out.flight.dep + '\\/\\w+\\s+([\\s\\S]+?)\\s' + out.flight.arr + '\\/\\w+').exec(T);
    if (rr) out.route = rr[1].replace(/\s+/g, ' ').trim();
    out.flight.depRwy = g(new RegExp('\\b' + out.flight.dep + '\\/(\\d{2}[LRC]?)\\b'));
    out.flight.arrRwy = g(new RegExp('\\b' + out.flight.arr + '\\/(\\d{2}[LRC]?)\\b'));

    // ---------- 4. 目的地备降场表 ----------
    const ai = L.findIndex(l => /DEST\s+ALTN\s+DIST\s+TRK\s+FL/.test(l));
    if (ai >= 0) {
      for (let i = ai + 1; i < Math.min(L.length, ai + 30); i++) {
        const m = /^\s*([A-Z]{4})\/(\w+)\s+(\d{4})\s+(\d{3})\s+(\d{3})\s+([PM]\d{3})\s+(\d{4})\s+(\d+)/.exec(L[i]);
        if (m) out.alternates.push({ icao: m[1], rwy: m[2], dist: +m[3], trk: +m[4], fl: +m[5], time: hhmm(m[7]), fuel: +m[8] });
        else if (/DISPATCH|CREW NOTES/.test(L[i])) break;
      }
    }

    // ---------- 5. 导航日志：航路点 + 计划累计时间 + 航段距离 ----------
    const ns = L.findIndex(l => /^\s*AWY\s+TRM\s+DIST/.test(l));
    if (ns >= 0) {
      let pendDist = 0, cumDist = 0, eq = false, sepSince = null;
      const pendSep = [];
      out.firs = [];
      for (let i = ns; i < L.length; i++) {
        const l = L[i];
        if (/ROUTE TO DESTINATION ALTERNATE/.test(l)) break;
        const sp = /^-{5,}\s*([A-Z][A-Z ]+?)\s+(FIR|UIR)\/([A-Z]{4})\s*-{5,}$/.exec(l.trim());
        if (sp && sp[2] === 'FIR') { const f = { name: sp[1].trim() + ' FIR', code: sp[3], afterIdx: out.navlog.length }; out.firs.push(f); sepSince = f; continue; }
        if (/^\s*(AWY|WPT)\s/.test(l) || /^-{5,}/.test(l.trim())) continue;
        // 航路点行：名字 … 累计时间 hhmm 后面跟 "...." 两组
        const w = /^\s*([A-Z0-9_]{2,8})(?:\/\w+)?\b.*?\s(\d{4})\s+\.{4}\s+\.{4}/.exec(l);
        const first = /^\s*([A-Z]{4})\/\w+\s+[\d.]+\s*$/.exec(l);                       // 起飞机场那一行（没有时间）
        if (first && !out.navlog.length) { out.navlog.push({ id: first[1], t: 0, dist: 0 }); continue; }
        if (w) {
          cumDist += pendDist; pendDist = 0;
          const mora = /\s(\d{2,3})\s+[PM]\d{3}\b/.exec(l);
          out.navlog.push({ id: w[1], t: hhmm(w[2]), dist: cumDist, mora: mora ? +mora[1] : null, eq });
          eq = false; sepSince = null;
          continue;
        }
        // 航路行：航路名 [=]? [航向]? 距离 风/
        const a = /^\s*(\S+)\s+(?:=\s*)?(?:(\d{3})\s+)?(\d{3})\s+(?:\d{2}\/\d{3}|\d{2}\/[PM]\d{2})/.exec(l);
        if (a) { pendDist += +a[3]; eq = /^\s*\S+\s+=/.test(l); }
      }
      // 最后一行是目的地机场（OMDW/30 … 0752）
      const last = out.navlog[out.navlog.length - 1];
      if (last && last.id === out.flight.arr.slice(0, last.id.length)) last.id = out.flight.arr;
      // 移交点：航路行上有「=」的那个航路点就是 FIR 边界点；对应的 FIR 是它前面或后面最近的分隔线
      out.firs.forEach(f => {
        const N = out.navlog;
        let k = -1;
        if (N[f.afterIdx - 1] && N[f.afterIdx - 1].eq && !(f.afterIdx - 2 >= 0 && out.firs.some(g => g !== f && g.afterIdx === f.afterIdx - 1))) k = f.afterIdx - 1;   // 分隔线在边界点后面
        if (N[f.afterIdx] && N[f.afterIdx].eq) k = f.afterIdx;                         // 分隔线在边界点前面
        if (k < 0) k = Math.min(f.afterIdx, N.length - 1);
        f.wp = N[k] ? N[k].id : null; f.t = N[k] ? N[k].t : null; f.idx = k;
      });
    }

    // ---------- 6. 航路点坐标（高空风表：名字一行、纬度一行、经度一行） ----------
    for (let i = 1; i < L.length - 1; i++) {
      const lats = L[i].match(/\b[NS]\d{4}\.\d\b/g);
      if (!lats) continue;
      const lons = (L[i + 1] || '').match(/\b[EW]\d{5}\.\d\b/g);
      if (!lons || lons.length !== lats.length) continue;
      const names = L[i - 1].trim().split(/\s{2,}|\s(?=[A-Z])/).map(s => s.trim()).filter(s => /^[A-Z0-9_]{2,8}$/.test(s) && s !== 'CLIMB' && s !== 'DESCENT');
      if (names.length !== lats.length) continue;
      names.forEach((n, k) => { out.fixes[n === 'T_O_D' ? 'TOD' : n] = [ll(lats[k]), ll(lons[k])]; });
    }

    // ---------- 7. 天气（METAR=SA/SP，TAF=FT/FC），按机场和角色 ----------
    const ws = L.findIndex(l => /^\s*Weather\s*$/.test(l));
    if (ws >= 0) {
      let role = '', cur = null, buf = null;
      const flush = () => { if (cur && buf) { (buf.k === 'metar' ? cur.metar : cur.taf).push(buf.s.replace(/\s+/g, ' ').replace(/=$/, '').trim()); } buf = null; };
      for (let i = ws + 1; i < L.length; i++) {
        const l = L[i];
        if (/AIRPORTLIST ENDED/.test(l)) { flush(); break; }
        const rh = /^\s*(DEPARTURE AIRPORT|DESTINATION AIRPORT|DESTINATION ALTERNATE|FUEL ENROUTE AIRPORT|ENROUTE AIRPORT\(S\)|ERA|ETOPS[^:]*)\s*:/.exec(l.replace(/\s+/g, ' '));
        if (rh) { flush(); role = { 'DEPARTURE AIRPORT': 'dep', 'DESTINATION AIRPORT': 'dest', 'DESTINATION ALTERNATE': 'destAltn', 'FUEL ENROUTE AIRPORT': 'fuelEnroute', 'ENROUTE AIRPORT(S)': 'enroute' }[rh[1]] || 'enroute'; continue; }
        const ah = /^\s*([A-Z]{4})\s*\/([A-Z0-9]{3})\s+(\S.*)$/.exec(l);
        if (ah && !/^\s*(SA|SP|FT|FC)\s/.test(l)) {
          flush();
          cur = out.airports[ah[1]] || (out.airports[ah[1]] = { icao: ah[1], iata: ah[2], name: ah[3].trim(), roles: [], metar: [], taf: [] });
          if (role && !cur.roles.includes(role)) cur.roles.push(role);
          continue;
        }
        const rp = /^\s*(SA|SP|FT|FC)\s+(.*)$/.exec(l);
        if (rp && cur) { flush(); buf = { k: rp[1] === 'SA' || rp[1] === 'SP' ? 'metar' : 'taf', s: rp[2] }; if (/=\s*$/.test(rp[2])) flush(); continue; }
        if (buf && /^\s{4,}\S/.test(l)) { buf.s += ' ' + l.trim(); if (/=\s*$/.test(l)) flush(); continue; }
        if (/WX NOT AVAILABLE|Period not completely covered/.test(l)) continue;
      }
    }

    // ---------- 8. NOTAM（按机场） ----------
    const nb = L.findIndex(l => /LIDO-NOTAM-BULLETIN/.test(l));
    if (nb >= 0) {
      let cur = null, cat = '', item = null;
      const push = () => { if (cur && item) { item.text = item.text.replace(/\s+/g, ' ').trim(); (out.notams[cur] = out.notams[cur] || []).push(item); } item = null; };
      for (let i = nb + 1; i < L.length; i++) {
        const l = L[i];
        if (/^\s*Crew Information\s*$/.test(l)) break;
        const hd = /^([A-Z]{4})\s*\/([A-Z0-9]{3})\s+\S/.exec(l);
        if (hd && /^-{10,}/.test((L[i + 1] || '').trim())) { push(); cur = hd[1]; cat = ''; continue; }
        const fir = /^([A-Z]{4})\s+([A-Z][A-Z ]+(?:FIR|UIR|CTA|OCA)\b.*)$/.exec(l);
        if (fir && /^-{6,}/.test((L[i + 1] || '').trim())) { push(); cur = fir[1]; cat = 'fir'; continue; }
        const ch = /^\+{5,}\s*([A-Z /]+?)\s*\+{5,}/.exec(l.trim());
        if (ch) { push(); cat = ch[1].trim(); continue; }
        const nt = /^([A-Z0-9]{1,3}\d{1,5}\/\d{2})(?:\s+-\s+[A-Z ]+?)?\s+VALID:\s*(\d{10})\s*-\s*(\d{10}|UFN|PERM)(\s+EST)?/.exec(l.trim());
        if (nt) {
          push();
          const tm = s => /^\d{10}$/.test(s) ? Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10)) : null;
          item = { id: nt[1], cat, from: tm(nt[2]), to: tm(nt[3]), est: !!nt[4], text: '' };
          continue;
        }
        if (item && /^\s{2,}\S/.test(l)) item.text += ' ' + l.trim();
      }
      push();
    }

    // 机场角色补充：目的地备降场表里的也算
    out.alternates.forEach(a => { const x = out.airports[a.icao] || (out.airports[a.icao] = { icao: a.icao, iata: '', name: '', roles: [], metar: [], taf: [] }); if (!x.roles.includes('destAltn')) x.roles.push('destAltn'); });

    out.ok = !!(out.flight && out.navlog.length > 2);
    if (!out.navlog.length) out.warnings.push('没读到导航日志（航路点和时间）');
    if (Object.keys(out.fixes).length < 3) out.warnings.push('没读到航路点坐标（高空风表那几页）');
    return out;
  }

  root.OFP = { parse, clean, hhmm, ll };
  if (typeof module !== 'undefined') module.exports = root.OFP;
})(typeof window !== 'undefined' ? window : globalThis);
