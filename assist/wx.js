/* 飞行助手 · 天气 / 跑道 / NOTAM 解读（离线，UTC）
 * WX.metar(str, refUTC)       → 当前实况
 * WX.taf(str, refUTC)         → 预报（分段）
 * WX.at(taf, metar, t)        → 时间 t 的主要情况 + 可能出现的更差情况
 * WX.rate(cond)               → 'red' | 'amber' | 'green'
 * WX.say(cond)                → 一句大白话
 * WX.runway(runways, wind, closed) → 推荐跑道 + 逆风/侧风/顺风
 * WX.notams(list, t)          → 影响落地的 NOTAM（大白话）
 */
(function (root) {
  'use strict';
  const KT_PER_MPS = 1.94384;
  const WXZH = {
    TS: '雷暴', TSRA: '雷雨', SHRA: '阵雨', RA: '雨', DZ: '毛毛雨', SN: '雪', SHSN: '阵雪', FZRA: '冻雨', FZDZ: '冻毛毛雨', FZFG: '冻雾',
    FG: '雾', MIFG: '浅雾', BCFG: '碎雾', PRFG: '部分雾', BR: '轻雾', HZ: '霾', FU: '烟', DU: '浮尘', BLDU: '扬尘', SA: '沙', BLSA: '扬沙',
    SS: '沙暴', DS: '尘暴', SQ: '飑', GR: '冰雹', GS: '小冰雹', VA: '火山灰', FC: '龙卷', PL: '冰粒', SG: '米雪', IC: '冰晶', UP: '未知降水'
  };
  const wxzh = c => {
    const m = /^([+-]|VC)?([A-Z]+)$/.exec(c); if (!m) return c;
    let base = WXZH[m[2]] || WXZH[m[2].slice(-2)] || m[2];
    if (m[2].startsWith('TS') && m[2] !== 'TS') base = '雷暴伴' + (WXZH[m[2].slice(2)] || m[2].slice(2));
    if (m[2].startsWith('SH') && !WXZH[m[2]]) base = '阵性' + (WXZH[m[2].slice(2)] || m[2].slice(2));
    return (m[1] === '+' ? '强' : m[1] === '-' ? '弱' : m[1] === 'VC' ? '附近有' : '') + base;
  };

  // ---------- 单组要素解析（METAR 和 TAF 共用） ----------
  function fields(tokens) {
    const c = {};
    for (const tk of tokens) {
      let m;
      if ((m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(tk))) {
        const f = m[4] === 'MPS' ? KT_PER_MPS : 1;
        c.wind = { dir: m[1] === 'VRB' ? null : +m[1], spd: Math.round(+m[2] * f), gust: m[3] ? Math.round(+m[3] * f) : null };
      } else if (/^\d{3}V\d{3}$/.test(tk)) { if (c.wind) c.wind.var = tk; }
      else if (tk === 'CAVOK') { c.vis = 10000; c.cavok = true; c.ceil = null; c.clouds = []; c.wx = []; }
      else if (/^\d{4}$/.test(tk) && c.vis == null) c.vis = +tk === 9999 ? 10000 : +tk;
      else if ((m = /^(\d+)?(?:\s?(\d)\/(\d))?SM$/.exec(tk))) c.vis = Math.round(((+m[1] || 0) + (m[2] ? m[2] / m[3] : 0)) * 1609);
      else if ((m = /^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/.exec(tk))) {
        (c.clouds = c.clouds || []).push({ amt: m[1], h: +m[2] * 100, cb: m[3] || '' });
        if ((m[1] === 'BKN' || m[1] === 'OVC' || m[1] === 'VV') && (c.ceil == null || +m[2] * 100 < c.ceil)) c.ceil = +m[2] * 100;
        if (m[3]) c.cb = true;
      } else if (/^(NSC|NCD|SKC|CLR)$/.test(tk)) { c.clouds = []; }
      else if (tk === 'NSW') c.wx = [];
      else if ((m = /^(M?\d{2})\/(M?\d{2})$/.exec(tk))) { c.temp = +m[1].replace('M', '-'); c.dew = +m[2].replace('M', '-'); }
      else if ((m = /^Q(\d{4})$/.exec(tk))) c.qnh = +m[1];
      else if ((m = /^A(\d{4})$/.exec(tk))) c.qnh = Math.round(+m[1] / 100 * 33.8639);
      else if (/^R\d{2}[LRC]?\//.test(tk)) (c.rvr = c.rvr || []).push(tk);
      else if (/^([+-]|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*$/.test(tk) && tk.length >= 2 && !/^\d/.test(tk)) {
        if (/^(TS|[+-]?(TS|SH|FZ|MI|BC|BL|DR)?(RA|DZ|SN|FG|BR|HZ|FU|DU|SA|SS|DS|SQ|GR|GS|VA|FC|PL|SG|IC|UP)+)$/.test(tk.replace(/^VC/, ''))) (c.wx = c.wx || []).push(tk);
      }
    }
    return c;
  }

  // 日时间 ddhh 或 ddhhmm → UTC 毫秒（月份按参考时间推）
  function dt(s, ref) {
    const r = new Date(ref);
    let y = r.getUTCFullYear(), mo = r.getUTCMonth();
    const d = +s.slice(0, 2), h = +s.slice(2, 4), mi = s.length >= 6 ? +s.slice(4, 6) : 0;
    let t = Date.UTC(y, mo, d, h, mi);
    if (t - ref > 20 * 864e5) t = Date.UTC(y, mo - 1, d, h, mi);
    if (ref - t > 20 * 864e5) t = Date.UTC(y, mo + 1, d, h, mi);
    return t;
  }

  function metar(s, ref) {
    if (!s) return null;
    const tk = s.replace(/=$/, '').trim().split(/\s+/);
    const tm = /^(\d{6})Z?$/.exec(tk[0]);
    const cut = tk.findIndex(x => /^(NOSIG|BECMG|TEMPO|RMK)$/.test(x));
    const c = fields((tm ? tk.slice(1) : tk).slice(0, cut >= 0 ? cut - (tm ? 1 : 0) : undefined));
    c.time = tm ? dt(tm[1], ref) : null;
    c.raw = s;
    return c;
  }

  function taf(s, ref) {
    if (!s) return null;
    const tk = s.replace(/=$/, '').trim().split(/\s+/);
    let i = 0;
    const out = { raw: s, issued: null, from: null, to: null, groups: [] };
    if (/^\d{6}Z?$/.test(tk[i])) { out.issued = dt(tk[i].slice(0, 6), ref); i++; }
    if (/^\d{4}\/\d{4}$/.test(tk[i])) { out.from = dt(tk[i].slice(0, 4), ref); out.to = dt(tk[i].slice(5), ref); if (out.to <= out.from) out.to += 864e5 * 0; i++; }
    let cur = { type: 'BASE', from: out.from, to: out.to, prob: null, tk: [] };
    const push = () => { cur.c = fields(cur.tk.filter(x => !/^T[XN]M?\d{2}\/\d{4}Z$/.test(x))); out.groups.push(cur); };
    for (; i < tk.length; i++) {
      const x = tk[i];
      let m;
      if (/^(BECMG|TEMPO|INTER)$/.test(x) || /^PROB\d{2}$/.test(x) || /^FM\d{6}$/.test(x)) {
        push();
        cur = { type: x, from: null, to: null, prob: null, tk: [] };
        if ((m = /^PROB(\d{2})$/.exec(x))) { cur.prob = +m[1]; cur.type = 'PROB'; if (tk[i + 1] === 'TEMPO') { cur.type = 'TEMPO'; i++; } }
        if ((m = /^FM(\d{6})$/.exec(x))) { cur.type = 'FM'; cur.from = dt(m[1], ref); cur.to = out.to; }
        if (/^\d{4}\/\d{4}$/.test(tk[i + 1] || '')) { i++; cur.from = dt(tk[i].slice(0, 4), ref); cur.to = dt(tk[i].slice(5), ref); }
        continue;
      }
      if (/^\d{4}\/\d{4}$/.test(x) && cur.from == null) { cur.from = dt(x.slice(0, 4), ref); cur.to = dt(x.slice(5), ref); continue; }
      cur.tk.push(x);
    }
    push();
    return out;
  }

  const merge = (a, b) => {
    const r = Object.assign({}, a);
    for (const k in b) if (b[k] != null) r[k] = b[k];
    if (b.clouds && !('ceil' in b)) r.ceil = null;                 // 新的云组里没有云底 → 没有低云
    if (b.cavok) { r.wx = []; r.ceil = null; }
    return r;
  };

  // 某时刻的天气：主要情况 + 可能出现的情况（TEMPO / PROB / 正在 BECMG）
  function at(T, M, t) {
    let main = {}, maybe = [], src = 'none';
    if (T && T.from != null && t >= T.from - 3600e3 && t <= T.to) {
      src = 'taf';
      for (const g of T.groups) {
        if (g.type === 'BASE') main = merge({}, g.c);
        else if (g.type === 'FM' && t >= g.from) main = merge({}, g.c);
        else if (g.type === 'BECMG') {
          if (t >= g.to) main = merge(main, g.c);
          else if (t >= g.from) maybe.push({ g, c: merge(main, g.c), why: '转变中 BECMG', whyEn: 'BECMG in progress' });
        } else if ((g.type === 'TEMPO' || g.type === 'PROB' || g.type === 'INTER') && t >= g.from && t < g.to) {
          { const why = (g.prob ? 'PROB' + g.prob + ' ' : '') + (g.type === 'PROB' ? '' : g.type); maybe.push({ g, c: merge(main, g.c), why, whyEn: why }); }
        }
      }
    } else if (M) { src = 'metar'; main = merge({}, M); }
    // 离实况时间 2 小时以内，也参考实况
    if (M && M.time && Math.abs(t - M.time) < 2 * 3600e3 && src === 'taf') maybe.push({ c: merge(main, M), why: '实况 METAR', whyEn: 'actual METAR' });
    return { main, maybe, src };
  }

  function rateOne(c) {
    if (!c) return 'green';
    const vis = c.vis == null ? 10000 : c.vis, ceil = c.ceil == null ? 99999 : c.ceil;
    const wx = (c.wx || []).join(' ');
    const g = c.wind ? Math.max(c.wind.spd || 0, c.wind.gust || 0) : 0;
    if (vis < 800 || ceil < 200 || /FG(?!U)|\+TS|SS|DS|FC|VA|GR/.test(wx) && vis < 1500) return 'red';
    if (vis < 3000 || ceil < 1000 || /TS|CB/.test(wx) || c.cb || g >= 35 || /FZ/.test(wx)) return 'amber';
    return 'green';
  }
  const ORDER = { green: 0, amber: 1, red: 2 };
  function rate(w) {
    let r = rateOne(w.main);
    for (const m of w.maybe) { const x = rateOne(m.c); if (ORDER[x] > ORDER[r]) r = x === 'red' ? 'amber+' : x; }
    return r === 'amber+' ? 'amber' : r;
  }

  const visTxt = v => v == null ? '' : v >= 10000 ? '能见度 10 公里以上' : v >= 5000 ? '能见度 ' + Math.round(v / 1000) + ' 公里' : '能见度 ' + v + ' 米';
  const visEn = v => v == null ? '' : v >= 10000 ? 'vis 10 km+' : v >= 5000 ? 'vis ' + Math.round(v / 1000) + ' km' : 'vis ' + v + ' m';
  function sayEn(c) {
    if (!c) return '';
    const p = [];
    if (c.wind) { const w = c.wind; p.push(w.spd <= 2 ? 'calm' : (w.dir == null ? 'VRB' : String(w.dir).padStart(3, '0') + '°') + '/' + w.spd + ' kt' + (w.gust ? ' G' + w.gust : '')); }
    if (c.cavok) p.push('CAVOK');
    else {
      if (c.vis != null) p.push(visEn(c.vis));
      if (c.wx && c.wx.length) p.push(c.wx.join(' '));
      if (c.ceil != null) p.push('ceiling ' + c.ceil + ' ft');
      else if (c.clouds && c.clouds.length) p.push('cloud ' + Math.min(...c.clouds.map(x => x.h)) + ' ft+, no ceiling');
      if (c.cb) p.push('CB');
    }
    if (c.temp != null) p.push(c.temp + '°C');
    if (c.qnh) p.push('QNH ' + c.qnh);
    return p.join(', ');
  }
  function sayOne(c, lang) {
    if (lang === 'en') return sayEn(c);
    if (!c) return '';
    const p = [];
    if (c.wind) {
      const w = c.wind;
      p.push(w.spd <= 2 ? '静风' : (w.dir == null ? '风向不定' : '风 ' + String(w.dir).padStart(3, '0') + '°') + ' ' + w.spd + ' 节' + (w.gust ? '，阵风 ' + w.gust : ''));
    }
    if (c.cavok) p.push('天气很好（CAVOK）');
    else {
      if (c.vis != null) p.push(visTxt(c.vis));
      if (c.wx && c.wx.length) p.push(c.wx.map(wxzh).join('、'));
      if (c.ceil != null) p.push('云底 ' + c.ceil + ' 英尺');
      else if (c.clouds && c.clouds.length) p.push('云高 ' + Math.min(...c.clouds.map(x => x.h)) + ' 英尺以上，不成云底');
      if (c.cb) p.push('有积雨云 CB');
    }
    if (c.temp != null) p.push(c.temp + '°C');
    if (c.qnh) p.push('QNH ' + c.qnh);
    return p.join('，');
  }
  const hhmmZ = t => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + 'Z'; };
  function say(w, lang) {
    const en = lang === 'en';
    const lines = [sayOne(w.main, lang)];
    w.maybe.forEach(m => {
      const diff = ['vis', 'ceil', 'wx', 'wind', 'cb'].some(k => JSON.stringify(m.c[k]) !== JSON.stringify(w.main[k]));
      if (!diff) return;
      const when = (m.g ? ' ' + hhmmZ(m.g.from) + '–' + hhmmZ(m.g.to) : '');
      lines.push(en ? 'Possible (' + (m.whyEn || m.why).trim() + when + '): ' + sayEn(m.c) : '可能（' + m.why.trim() + when + '）：' + sayOne(m.c));
    });
    return lines.filter(Boolean);
  }

  // ---------- 跑道：逆风最大的那条；顺风/侧风分量 ----------
  function runway(rwys, wind, closed, preferred) {
    if (!rwys || !rwys.length) return null;
    const ends = [];
    rwys.forEach(r => {
      const add = (id, hdg) => { if (!id) return; if (hdg == null) hdg = (parseInt(id, 10) || 0) * 10; ends.push({ id, hdg, len: r[4] }); };
      add(r[0], r[1]); add(r[2], r[3]);
    });
    let open = ends.filter(e => !(closed || []).some(c => c === e.id));
    let allLimited = false;
    if (!open.length) { open = ends; allLimited = true; }            // 每条跑道都有限制：照样按风推荐，但提醒看 NOTAM
    if (!wind || wind.spd == null) return { pick: preferred && open.find(e => e.id === preferred) || open.slice().sort((a, b) => b.len - a.len)[0], all: open, note: '没有风的资料', allLimited };
    const comp = e => {
      if (wind.dir == null) return { head: 0, cross: wind.spd, tail: 0 };
      const a = (wind.dir - e.hdg) * Math.PI / 180, s = Math.max(wind.spd, wind.gust || 0);
      const head = Math.round(wind.spd * Math.cos(a)), cross = Math.round(Math.abs(s * Math.sin(a)));
      return { head: Math.max(0, head), tail: Math.max(0, -head), cross };
    };
    open.forEach(e => Object.assign(e, comp(e)));
    let pick;
    if (wind.spd < 5 || wind.dir == null) pick = (preferred && open.find(e => e.id === preferred)) || open.sort((a, b) => b.len - a.len)[0];
    else pick = open.slice().sort((a, b) => (b.head - b.tail) - (a.head - a.tail) || b.len - a.len)[0];
    return { pick, all: open, calm: wind.spd < 5, allLimited };
  }

  // ---------- NOTAM：只挑影响落地/备降的，翻成大白话 ----------
  const EN = {
    '机场关闭': 'Aerodrome closed', '燃油供应受限': 'Fuel limited', '有开放时间/宵禁限制': 'Operating hours / curfew',
    'GPS 可能受干扰': 'GPS interference possible', '公司规定：除紧急情况外不能用作备降': 'Not for diversion except emergency',
    '鸟情活动': 'Bird activity', '跑道/进近灯光部分不可用': 'Rwy/approach lights partly U/S', '下滑道 不可用': 'GP U/S', '航向道 不可用': 'LOC U/S',
    '二类运行不可用': 'CAT II not available', '三类运行不可用': 'CAT III not available'
  };
  function toEn(zh) {
    if (EN[zh]) return EN[zh];
    let m;
    if ((m = /^跑道 (\S+) 关闭$/.exec(zh))) return 'RWY ' + m[1] + ' closed';
    if ((m = /^跑道 (\S+) 不可用$/.exec(zh))) return 'RWY ' + m[1] + ' not available';
    if ((m = /^ILS ?(\S*) 不可用$/.exec(zh))) return ('ILS ' + m[1]).trim() + ' U/S';
    if ((m = /^消防等级降为 (\d+) 级$/.exec(zh))) return 'RFF reduced to CAT ' + m[1];
    if ((m = /^(\S+) 不可用$/.exec(zh))) return m[1] + ' U/S';
    return zh;
  }
  const RULES = [
    [/\bAD\s+CLSD\b|AERODROME\s+CLOSED|AIRPORT\s+CLOSED/, 'red', () => '机场关闭'],
    [/\bRWY\s*(\d{2}[LRC]?(?:\/\d{2}[LRC]?)?)\s+(?:IS\s+)?CLSD\b/, 'red', m => '跑道 ' + m[1] + ' 关闭'],
    [/\bRWY\s*(\d{2}[LRC]?(?:\/\d{2}[LRC]?)?)\s+NOT\s+AVBL/, 'red', m => '跑道 ' + m[1] + ' 不可用'],
    [/\bILS\b[^.]{0,40}?\b(?:RWY\s*)?(\d{2}[LRC]?)?[^.]{0,30}?\b(U\/S|NOT AVBL|UNSERVICEABLE|WITHDRAWN)/, 'amber', m => 'ILS' + (m[1] ? ' ' + m[1] : '') + ' 不可用'],
    [/\b(LOC|GP|GS|GLIDE\s?PATH|LOCALIZER)\b[^.]{0,40}?\b(U\/S|NOT AVBL|UNSERVICEABLE)/, 'amber', m => (/G/.test(m[1]) ? '下滑道' : '航向道') + ' 不可用'],
    [/\bCAT\s*(?:\(ROMAN\)\s*)?(II|III|IIIA|IIIB|2|3)\b[^.]{0,50}?\b(NOT AVBL|U\/S|SUSPENDED|NOT AUTH)/, 'amber', m => (/II|2/.test(m[1]) && !/III|3/.test(m[1]) ? '二类' : '三类') + '运行不可用'],
    [/\b(PAPI|VASI)\b[^.]{0,30}?\b(U\/S|NOT AVBL)/, 'info', m => m[1] + ' 不可用'],
    [/\b(ALS|APCH\s+LGT|APPROACH\s+LIGHT|RCLL|TDZ|HIRL|RWY\s+EDGE\s+LGT)\b[^.]{0,40}?\b(U\/S|NOT AVBL)/, 'amber', m => '跑道/进近灯光部分不可用'],
    [/\b(VOR|DME|NDB)\b[^.]{0,30}?\b(U\/S|NOT AVBL)/, 'info', m => m[1] + ' 不可用'],
    [/\b(RFF|RFFS|FIRE\s+FIGHTING|FIRE\s+CAT)\b[^.]{0,40}?\bCAT\s*(\d{1,2})/, 'amber', m => '消防等级降为 ' + m[2] + ' 级'],
    [/\bFUEL\b[^.]{0,40}?\b(NOT AVBL|UNAVBL|NIL|SHORTAGE)/, 'amber', () => '燃油供应受限'],
    [/\b(CURFEW|AD\s+HR|OPR\s+HR|HOURS\s+OF\s+OPERATION)\b/, 'amber', () => '有开放时间/宵禁限制'],
    [/\b(GPS|GNSS)\b[^.]{0,60}?\b(INTERFERENCE|JAMMING|SPOOFING|U\/S|UNRELIABLE)/, 'amber', () => 'GPS 可能受干扰'],
    [/\bDIVERSION\b[^.]{0,60}?\b(NOT|SHALL NOT|EXCEPT IN AN EMERGENCY)/, 'red', () => '公司规定：除紧急情况外不能用作备降'],
    [/\bBIRD/, 'info', () => '鸟情活动'],
  ];
  function notams(list, t) {
    const out = [], seen = {};
    (list || []).forEach(n => {
      const valid = (n.from == null || n.from <= t + 3 * 3600e3) && (n.to == null || n.to >= t - 3600e3);
      if (!valid) return;
      const tx = n.text;
      for (const [re, lv, fn] of RULES) {
        const m = re.exec(tx);
        if (!m) continue;
        // 「ON RWY 19L NOT AVBL」「TO RWY…」这种说的是滑行/转弯，不是跑道本身
        if (re.source.indexOf('\\bRWY') === 0 && /\b(ON|TO|FM|FROM|VIA|ONTO|INTO|CROSSING)\s*$/.test(tx.slice(Math.max(0, m.index - 8), m.index))) continue;
        if (re.source.indexOf('\\bRWY') === 0 && /TAKE\s?OFF|TKOF/.test(tx.slice(Math.max(0, m.index - 16), m.index))) continue;
        const zh = fn(m);
        const key = zh;
        if (seen[key]) { seen[key].ids.push(n.id); return; }
        const sched = /\b(MON|TUE|WED|THU|FRI|SAT|SUN|DAILY|\d{4}-\d{4})\b/.test(tx.slice(0, 60));
        const item = { lv, zh: zh + (sched ? '（有时段）' : ''), en: toEn(zh) + (sched ? ' (scheduled)' : ''), ids: [n.id], raw: tx, cat: n.cat };
        seen[key] = item; out.push(item);
        return;
      }
    });
    const ord = { red: 0, amber: 1, info: 2 };
    return out.sort((a, b) => ord[a.lv] - ord[b.lv]);
  }
  // NOTAM 里关闭的跑道（推荐跑道时排除）
  function closedRwys(list, t) {
    const out = [];
    (list || []).forEach(n => {
      if (!((n.from == null || n.from <= t + 3600e3) && (n.to == null || n.to >= t))) return;
      // 有时段的也算进去（保守）；「ON RWY xx NOT AVBL」这种滑行限制不算
      const re = /\bRWY\s*(\d{2}[LRC]?)(?:\/(\d{2}[LRC]?))?\s+(?:IS\s+)?(?:CLSD|NOT\s+AVBL)/g;
      let m; while ((m = re.exec(n.text))) {
        if (/\b(ON|TO|FM|FROM|VIA|ONTO|INTO)\s*$/.test(n.text.slice(Math.max(0, m.index - 8), m.index))) continue;
        if (/TAKE\s?OFF|TKOF|DEP(ARTURE)?S?\s*$/.test(n.text.slice(Math.max(0, m.index - 16), m.index))) continue;   // 只限起飞的不影响落地
        out.push(m[1]); if (m[2]) out.push(m[2]);
      }
    });
    return out;
  }

  root.WX = { metar, taf, at, rate, say, sayOne, runway, notams, closedRwys, hhmmZ, wxzh };
  if (typeof module !== 'undefined') module.exports = root.WX;
})(typeof window !== 'undefined' ? window : globalThis);
