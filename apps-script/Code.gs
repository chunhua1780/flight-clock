/**
 * Flight Clock — Google Apps Script 后端
 *
 * 作用：
 *   1. ?action=flights   读取 Google 日历里的排班，返回航班列表 + 每段航班的实际动态
 *   2. ?action=track     查询 ADS-B 实时位置（浏览器直连会被拦），缓存轨迹，判断起飞/落地
 *   3. 定时器 poll()     每 5 分钟自动查一次正在进行的航班，iPad 关着也能记下起飞/落地时间
 *   4. ?action=photo     从图片库（Pexels 或 Unsplash）找「城市 + 时段 + 天气」的背景照片，每天换一张
 *                        （需要在 项目设置 → 脚本属性 里加 PEXELS_KEY 或 UNSPLASH_KEY）
 *
 * 安装 / 更新：
 *   1. 把本文件全部粘贴进 Apps Script，保存
 *   2. 上方函数选 setup → 点「运行」→ 按提示授权（只需要做一次）
 *   3. 部署 → 管理部署 → ✏️ → 版本选「新版本」→ 部署
 */

// ======== 配置 ========
// 排班所在的日历。'primary' = 你的默认日历；
// 如果排班导入到了单独的日历，在 Google 日历 → 该日历设置 → 「集成日历」里找到「日历 ID」填进来。
// 可以写多个：['primary', 'xxxx@group.calendar.google.com']
const CALENDAR_IDS = ['primary'];

// 可选的访问口令。填了之后，网页设置里的 Token 也要填一样的。留空 = 不检查。
const TOKEN = '';

// 读取范围：过去几天 ~ 未来几天
const DAYS_BACK = 35;   // 月历要显示本月已经飞过的航班
const DAYS_AHEAD = 60;

// 航班号 → ATC 呼号前缀（EK → UAE）
const CALLSIGN_PREFIX = 'UAE';

// 机场坐标和时区（时钟网站上的同一份数据）
const AIRPORTS_URL = 'https://chunhua1780.github.io/flight-cloch/airports.json';

// 只返回「像航班」的日程（标题里有两个三字码，如 89876-CAN-DWC / EK302 DXB-PVG），
// 避免把私人日程暴露到公开网址上。
const FLIGHT_TITLE = /\b[A-Z]{3}\s*(?:-|–|—|\/|>|→|\s)\s*[A-Z]{3}\b/;

// ADS-B 数据源（按顺序尝试）
const ADSB_SOURCES = [
  'https://api.adsb.lol/v2/callsign/',
  'https://opendata.adsb.fi/api/v2/callsign/',
];

const MIN = 60e3, HOUR = 36e5;

// ======== 入口 ========
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (TOKEN && p.token !== TOKEN) return out_({ ok: false, error: 'unauthorized' });
  try {
    if (p.action === 'photo') return out_(photo_(p));
    if (p.action === 'track') {
      const leg = p.o && p.d && p.std ? { origin: p.o, dest: p.d, std: +p.std, sta: +p.sta || 0 } : null;
      return out_(track_(p.cs, leg));
    }
    return out_(flights_());
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ======== 一次性设置：装上每 5 分钟的定时器 ========
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('poll').timeBased().everyMinutes(5).create();
  Logger.log('✅ 定时器已安装：每 5 分钟检查一次正在进行的航班');
  poll();
}

// ======== 日历 ========
function events_(from, to) {
  const list = [], seen = {};
  CALENDAR_IDS.forEach(function (id) {
    const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (!cal) return;
    cal.getEvents(from, to).forEach(function (ev) {
      if (ev.isAllDayEvent()) return;
      const title = (ev.getTitle() || '').trim();
      if (!FLIGHT_TITLE.test(title.toUpperCase())) return;
      const start = ev.getStartTime().toISOString();
      const key = title.toUpperCase() + '|' + start;
      if (seen[key]) return;
      seen[key] = 1;
      list.push({
        title: title,
        start: start,
        end: ev.getEndTime().toISOString(),
        location: ev.getLocation() || '',
        description: legsOnly_(ev.getDescription()),
      });
    });
  });
  list.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  return list;
}

function flights_() {
  const now = new Date();
  const list = events_(new Date(now.getTime() - DAYS_BACK * 864e5), new Date(now.getTime() + DAYS_AHEAD * 864e5));
  // 附上每段航班的实际动态（起飞/落地时间）
  const status = {};
  list.forEach(function (ev) {
    legsOf_(ev).forEach(function (leg) {
      if (leg.std > now.getTime() + HOUR || leg.std < now.getTime() - DAYS_BACK * 864e5) return;
      const st = getStatus_(leg);
      if (st) status[leg.origin + leg.dest + leg.std] = publicStatus_(st);
    });
  });
  return { ok: true, version: 3, generated: now.toISOString(), flights: list, status: status };
}

// 备注里只保留航班号、「机场 - 日期 时间」和呼号这几种行，
// 机组姓名、员工号等不会被发出去。
function legsOnly_(desc) {
  return String(desc || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) {
    return /^(?:(?:DH|DHD|PAX|POS)\s+)?(?:[A-Z]{2}\s?)?\d{1,5}[A-Z]?$/i.test(l) ||
      /^[A-Z]{3}\s*[-–]\s*\d{1,2}\s+[A-Z]{3}/i.test(l) ||
      /^(?:CS|CALLSIGN)\b/i.test(l);
  }).join('\n').slice(0, 3000);
}

// ======== 机场 ========
let AP_MEM = null;
function airport_(code) {
  code = String(code || '').toUpperCase();
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('ap_' + code);
  if (saved) return JSON.parse(saved);
  if (!AP_MEM) {
    try { AP_MEM = JSON.parse(UrlFetchApp.fetch(AIRPORTS_URL, { muteHttpExceptions: true }).getContentText()); } catch (e) { AP_MEM = { ap: {}, tz: [] }; }
  }
  const v = AP_MEM.ap && AP_MEM.ap[code];
  if (!v) return null;
  const a = { lat: v[0], lon: v[1], tz: AP_MEM.tz[v[2]] };
  props.setProperty('ap_' + code, JSON.stringify(a));
  return a;
}

function tzOffsetMin_(tz, t) {
  const z = Utilities.formatDate(new Date(t), tz, 'Z'); // 例如 +0400
  const sign = z[0] === '-' ? -1 : 1;
  return sign * (parseInt(z.substr(1, 2), 10) * 60 + parseInt(z.substr(3, 2), 10));
}
function localToUtc_(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo, d, h, mi);
  let t = guess - tzOffsetMin_(tz, guess) * MIN;
  return guess - tzOffsetMin_(tz, t) * MIN;
}

function dist_(a, b) {
  const r = Math.PI / 180;
  const h = Math.pow(Math.sin((b.lat - a.lat) * r / 2), 2) +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin((b.lon - a.lon) * r / 2), 2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ======== 把日程拆成航班段（和网页的算法一致） ========
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function legsOf_(ev) {
  const legs = [];
  let no = null, pend = null;
  String(ev.description || '').split(/\r?\n/).forEach(function (line) {
    const L = line.trim().toUpperCase();
    if (!L) return;
    const fn = L.match(/^(?:(DH|DHD|PAX|POS)\s+)?(?:[A-Z]{2}\s?)?(\d{1,5})[A-Z]?$/);
    if (fn) { no = fn[2].replace(/^0+/, ''); pend = null; return; }
    const m = L.match(/^([A-Z]{3})\s*[-–]\s*(\d{1,2})\s+([A-Z]{3})[A-Z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!m || MON[m[3]] == null) return;
    const ap = airport_(m[1]);
    if (!ap) return;
    const t = localToUtc_(+m[4], MON[m[3]], +m[2], +m[5], +m[6], ap.tz);
    if (!pend) { pend = { code: m[1], t: t }; return; }
    if (no) legs.push({ digits: no, origin: pend.code, dest: m[1], std: pend.t, sta: t });
    pend = null; no = null;
  });
  if (!legs.length) {
    // 备注里没有分段：标题当单段航班，开始=起飞，结束=到达
    const U = String(ev.title || '').toUpperCase();
    const r = U.match(/([A-Z]{3})\s*(?:-|–|—|\/|>|→)\s*([A-Z]{3})(?![A-Z])/);
    const f = U.match(/(?:^|[^A-Z0-9])(?:[A-Z]{2}\s?)?(\d{1,5})(?=[^0-9]|$)/);
    if (r && f) {
      let d = f[1].replace(/^0+/, '');
      if (d.length === 5 && d[0] === '8') d = d.slice(1);
      legs.push({ digits: d, origin: r[1], dest: r[2], std: new Date(ev.start).getTime(), sta: new Date(ev.end).getTime() });
    }
  }
  const cs = String(ev.description || '').toUpperCase().match(/(?:^|[^A-Z])(?:CS|CALLSIGN)[\s:=]*([A-Z]{3}[0-9][0-9A-Z]{0,3})(?![0-9A-Z])/);
  legs.forEach(function (l) { l.callsign = cs && legs.length === 1 ? cs[1] : CALLSIGN_PREFIX + l.digits; });
  return legs;
}

// ======== 定时器：自动跟踪正在进行的航班 ========
function poll() {
  const now = Date.now();
  const list = events_(new Date(now - 2 * 864e5), new Date(now + 864e5));
  list.forEach(function (ev) {
    legsOf_(ev).forEach(function (leg) {
      if (now < leg.std - 45 * MIN || now > leg.sta + 4 * HOUR) return; // 不在这段航班的时间窗口里
      const st = getStatus_(leg);
      if (st && st.on && now - st.on > 30 * MIN) return;                  // 已经落地很久了
      if (now > leg.sta + 90 * MIN && (!st || !st.off)) return;           // 根本没起飞（取消/换机）就别再查了
      track_(leg.callsign, leg);
    });
  });
  cleanup_();
}

// ======== 实际动态（起飞/落地）存取 ========
function statusKey_(leg) { return 'st_' + leg.origin + leg.dest + leg.std; }
function getStatus_(leg) {
  const s = PropertiesService.getScriptProperties().getProperty(statusKey_(leg));
  return s ? JSON.parse(s) : null;
}
function setStatus_(leg, st) {
  PropertiesService.getScriptProperties().setProperty(statusKey_(leg), JSON.stringify(st));
}
function publicStatus_(st) {
  return { taxi: st.taxi || null, off: st.off || null, on: st.on || null, seen: st.seen || null, reg: st.reg || null };
}
function cleanup_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('st_') !== 0) return;
    const std = +k.slice(9);
    if (std && now - std > 10 * 864e5) props.deleteProperty(k);
  });
}

// 根据一次位置判断：滑行 / 起飞 / 落地
function updateStatus_(leg, pos, now) {
  const O = airport_(leg.origin), D = airport_(leg.dest);
  if (!O || !D) return null;
  const st = getStatus_(leg) || {};
  const before = JSON.stringify(st);
  const total = dist_(O, D);
  if (pos) {
    const p = { lat: pos.lat, lon: pos.lon };
    const dO = dist_(p, O), dD = dist_(p, D);
    if (dO + dD > total * 1.35 + 400) return publicStatus_(st); // 不在这条航线上（可能是同呼号的别的航班）
    if (pos.reg) st.reg = pos.reg;
    if (pos.ground) {
      if (dO < 15 && !st.off && pos.gs >= 5 && !st.taxi) st.taxi = now;
      if (dD < 15 && st.off && !st.on) {
        const la = st.lastAir;
        st.on = la ? Math.min(now, Math.round(la.t + (la.alt || 0) / 900 * MIN)) : now;
      }
    } else if (!st.on) {
      if (!st.off) {
        // 第一次看到飞机在空中：倒推离地时间（按每分钟爬升约 2000 英尺）
        let back = (pos.alt || 0) / 2000 * MIN;
        if (dO > 150 || (pos.alt || 0) > 25000) back = dO / ((pos.gs || 420) * 1.852) * HOUR;
        st.off = Math.max(Math.round(now - back), st.taxi || 0, leg.std - 30 * MIN);
      }
      st.lastAir = { t: now, alt: pos.alt || 0, dD: Math.round(dD) };
    }
  } else if (st.off && !st.on && st.lastAir && st.lastAir.dD < 40 && st.lastAir.alt < 5000 && now - st.lastAir.t > 10 * MIN) {
    // 最后一次信号已经在进近，之后信号消失（地面接收不到）：按落地处理
    st.on = Math.round(st.lastAir.t + st.lastAir.alt / 900 * MIN);
  }
  st.seen = now;
  if (JSON.stringify(st) !== before) setStatus_(leg, st);
  return publicStatus_(st);
}

// ======== 实时位置 + 轨迹缓存 ========
function track_(cs, leg) {
  cs = String(cs || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cs) return { ok: false, error: 'missing cs' };

  let ac = null, source = null;
  for (let i = 0; i < ADSB_SOURCES.length && !ac; i++) {
    try {
      const r = UrlFetchApp.fetch(ADSB_SOURCES[i] + cs, { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) continue;
      const j = JSON.parse(r.getContentText());
      const arr = (j.ac || j.aircraft || []).filter(function (a) { return a.lat != null && a.lon != null; });
      if (arr.length) {
        arr.sort(function (a, b) { return (a.seen_pos || 0) - (b.seen_pos || 0); });
        ac = arr[0];
        source = ADSB_SOURCES[i].split('/')[2];
      }
    } catch (err) { /* 换下一个源 */ }
  }

  const cache = CacheService.getScriptCache();
  const key = 'trail_' + cs;
  let trail = [];
  try { trail = JSON.parse(cache.get(key) || '[]'); } catch (err) { trail = []; }

  let pos = null;
  const now = Date.now();
  if (ac) {
    const ground = ac.alt_baro === 'ground';
    pos = {
      lat: ac.lat, lon: ac.lon,
      alt: ground ? 0 : (typeof ac.alt_baro === 'number' ? ac.alt_baro : (ac.alt_geom || null)),
      gs: ac.gs != null ? Math.round(ac.gs) : null,
      track: ac.track != null ? Math.round(ac.track) : (ac.true_heading != null ? Math.round(ac.true_heading) : null),
      vs: ac.baro_rate != null ? ac.baro_rate : (ac.geom_rate != null ? ac.geom_rate : null),
      ground: ground,
      reg: ac.r || null, type: ac.t || null, hex: ac.hex || null,
      seen: ac.seen_pos != null ? ac.seen_pos : null,
      t: now,
    };
    const last = trail[trail.length - 1];
    // 新航班（距上一个点超过 3 小时）就清空旧轨迹
    if (last && pos.t - last[3] > 3 * HOUR) trail = [];
    if (!last || Math.abs(last[0] - pos.lat) > 0.005 || Math.abs(last[1] - pos.lon) > 0.005) {
      trail.push([+pos.lat.toFixed(4), +pos.lon.toFixed(4), pos.alt || 0, pos.t]);
      if (trail.length > 900) trail = trail.filter(function (_, i) { return i % 2 === 0 || i > trail.length - 100; });
      cache.put(key, JSON.stringify(trail), 21600);
    }
  }

  let status = null;
  if (leg && leg.origin && leg.dest && leg.std) {
    leg.origin = String(leg.origin).toUpperCase(); leg.dest = String(leg.dest).toUpperCase();
    status = updateStatus_(leg, pos, now);
  }
  return { ok: true, callsign: cs, found: !!pos, source: source, pos: pos, trail: trail, status: status };
}

// 在编辑器里点「运行」测试，看「执行记录」里的输出
function test() {
  Logger.log(JSON.stringify(flights_(), null, 2));
}

// ======== 背景照片（Pexels / Unsplash 图片库） ========
// 二选一（都填了优先用 Pexels）：
//   Pexels：  https://www.pexels.com/api/ → 申请 API Key
//   Unsplash：https://unsplash.com/developers → Your apps → New Application → Access Key
// 填到：Apps Script 左侧 ⚙ 项目设置 → 脚本属性 → 添加脚本属性：PEXELS_KEY（或 UNSPLASH_KEY）= 你的 Key
const PHASE_WORD = { dawn: 'sunrise', morning: 'morning', day: '', evening: 'golden hour', dusk: 'sunset', night: 'night' };
const WX_WORD = { rain: 'rain', storm: 'storm', snow: 'snow', fog: 'fog', dust: 'sandstorm', overcast: 'cloudy' };

function hash_(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function unsplashSearch_(q, key) {
  const cache = CacheService.getScriptCache();
  const ck = 'us_' + hash_(q);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const url = 'https://api.unsplash.com/search/photos?orientation=landscape&content_filter=high&per_page=30&query=' + encodeURIComponent(q);
  const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Unsplash ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 120));
  const list = (JSON.parse(r.getContentText()).results || [])
    .filter(function (x) { return x.width >= 2000 && x.width > x.height * 1.2; })
    .map(function (x) {
      return { id: x.id, raw: x.urls.raw, by: x.user && x.user.name, link: x.links.html, dl: x.links.download_location };
    });
  cache.put(ck, JSON.stringify(list), 21600);
  return list;
}

function pexelsSearch_(q, key) {
  const cache = CacheService.getScriptCache();
  const ck = 'px_' + hash_(q);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const url = 'https://api.pexels.com/v1/search?orientation=landscape&size=large&per_page=40&query=' + encodeURIComponent(q);
  const r = UrlFetchApp.fetch(url, { headers: { Authorization: key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Pexels ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 120));
  const list = (JSON.parse(r.getContentText()).photos || [])
    .filter(function (x) { return x.width >= 2000 && x.width > x.height * 1.2; })
    .map(function (x) {
      return { id: x.id, raw: x.src.original.split('?')[0] + '?auto=compress&cs=tinysrgb', by: x.photographer, link: x.url };
    });
  cache.put(ck, JSON.stringify(list), 21600);
  return list;
}

function photo_(p) {
  const props = PropertiesService.getScriptProperties();
  const pexels = props.getProperty('PEXELS_KEY'), unsplash = props.getProperty('UNSPLASH_KEY');
  if (!pexels && !unsplash) return { ok: false, error: 'no UNSPLASH_KEY' };
  const source = pexels ? 'Pexels' : 'Unsplash';
  const key = pexels || unsplash;
  const city = String(p.city || '').replace(/[^\w\s\-À-ž]/g, '').trim().slice(0, 60);
  if (!city) return { ok: false, error: 'missing city' };
  const pw = PHASE_WORD[p.phase] || '', ww = WX_WORD[p.wx] || '';
  const tries = [];
  const add = function (words, wxUsed) { const q = words.filter(Boolean).join(' '); if (q && !tries.some(function (t) { return t.q === q; })) tries.push({ q: q, wx: wxUsed }); };
  if (ww) { add([city, ww, pw === 'night' ? 'night' : ''], true); add([city, ww], true); }
  add([city, pw, 'skyline'], false); add([city, pw], false); add([city, 'skyline'], false); add([city, 'city'], false);
  const day = Utilities.formatDate(new Date(), 'Asia/Dubai', 'yyyyMMdd');
  for (let i = 0; i < tries.length; i++) {
    let list;
    try { list = pexels ? pexelsSearch_(tries[i].q, key) : unsplashSearch_(tries[i].q, key); } catch (e) { return { ok: false, error: String(e) }; }
    if (list.length < 3) continue;
    const ph = list[hash_(day + '|' + tries[i].q) % list.length];
    // Unsplash 规定：用到一张照片时通知它一次（每天每张最多一次）
    const cache = CacheService.getScriptCache();
    if (!pexels && !cache.get('dl_' + ph.id)) {
      try { UrlFetchApp.fetch(ph.dl, { headers: { Authorization: 'Client-ID ' + key }, muteHttpExceptions: true }); } catch (e) {}
      cache.put('dl_' + ph.id, '1', 21600);
    }
    return {
      ok: true, query: tries[i].q, wx: tries[i].wx, source: source,
      url: pexels ? ph.raw + '&w=1920' : ph.raw + (ph.raw.indexOf('?') >= 0 ? '&' : '?') + 'w=1920&q=78&fm=jpg&fit=crop&auto=format',
      by: ph.by, link: pexels ? ph.link : ph.link + '?utm_source=flight_clock&utm_medium=referral'
    };
  }
  return { ok: false, error: 'no photos' };
}
