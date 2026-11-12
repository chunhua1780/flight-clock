/**
 * Flight Clock — Google Apps Script 后端
 *
 * 作用：
 *   1. ?action=flights   读取 Google 日历里的排班，返回航班列表 + 每段航班的实际动态
 *   2. ?action=track     查询 ADS-B 实时位置（浏览器直连会被拦），缓存轨迹，判断起飞/落地
 *   3. 定时器 poll()     每 1 分钟自动查一次正在进行的航班，iPad 关着也能记下起飞/落地时间
 *   6. POST ?k=口令         快捷指令「发给时钟」：复制飞行计划后一点，记下计划飞行时间（TRIP）
 *   5. ?action=ics&url=…  同事用：读他自己 Google 日历的「iCal 私密地址」，返回同样格式的航班列表
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
// 例如：89876-CAN-DWC、416-SYD、EK302 DXB-PVG、DH EK385 DXB-HKG（必须有航班号，避免把人名之类的日程当成航班）
const FLIGHT_TITLE = /^\s*(?:(?:DH|DHD|PAX|POS)\s+)?(?:[A-Z]{2}\s?)?\d{1,5}[A-Z]?\s*[-–—\s]\s*[A-Z]{3}\b/;

// ADS-B 数据源（按顺序尝试）
const ADSB_SOURCES = [
  'https://api.adsb.lol/v2/callsign/',
  'https://opendata.adsb.fi/api/v2/callsign/',
];

const MIN = 60e3, HOUR = 36e5;

// ======== 快捷指令「发给时钟」：复制 OFP 文字后发到这里（POST） ========
// 防止别人乱发：快捷指令网址末尾要带 ?k=这个口令（公开代码里留空 = 关闭这个功能）
const OFP_POST_KEY = '';

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (!OFP_POST_KEY || p.k !== OFP_POST_KEY) return txt_('❌ 口令不对');
  const text = (e.postData && e.postData.contents) || p.text || '';
  // 飞行助手发来的 JSON：航班、计划时间、航路点（坐标 + 计划时间 + 累计距离）、手动输入的起飞时间
  if (/^\s*\{/.test(text)) return txt_(postJson_(text));
  const r = parsePlan_(text);
  if (!r) return txt_('❌ 没认出飞行计划（要包含第一行，例如 EK9876 08NOV OMDW/DWC-ZGGG/CAN）');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('plan_' + r.digits + r.depIata + r.arrIata + r.date, JSON.stringify(r));
  // 清掉 10 天前的
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('plan_') === 0) { try { if (Date.now() - JSON.parse(all[k]).t > 10 * 864e5) props.deleteProperty(k); } catch (x) {} } });
  const hm = function (m) { return Math.floor(m / 60) + 'h' + ('0' + m % 60).slice(-2); };
  return txt_('✅ EK' + r.digits + ' ' + r.date + ' ' + r.depIata + '→' + r.arrIata +
    (r.trip ? ' · 计划飞行 ' + hm(r.trip) : ' · ⚠️ 没找到 TRIP 时间') + (r.taxi ? ' · 滑行 ' + r.taxi + ' 分' : '') + (r.reg ? ' · ' + r.reg : ''));
}
function postJson_(text) {
  let j; try { j = JSON.parse(text); } catch (x) { return '❌ 数据格式不对'; }
  // 翻译（飞行助手把 NOTAM 英文发来，翻成中文存在 iPad 上，飞行中离线也能看）
  if (j.action === 'translate' && Array.isArray(j.texts)) {
    const out = j.texts.slice(0, 80).map(function (t) { try { return LanguageApp.translate(String(t).slice(0, 4500), 'en', j.to || 'zh-CN'); } catch (e) { return null; } });
    return JSON.stringify({ ok: true, out: out });
  }
  // 联网解读：用 Google Gemini（打开 Google 搜索）把 OFP 里的一段用白话讲清楚。Key 放在「项目设置 → 脚本属性」GEMINI_KEY
  if (j.action === 'explain') return JSON.stringify(explain_(j));
  // 学到的东西：所有设备共用（iPad、电脑），下载到设备上离线用
  if (j.action === 'kb') return JSON.stringify(kbGet_());
  // 飞行记录本：云端保存（你自己 Google Drive 里的一个表格）
  if (j.action === 'lbsync') return JSON.stringify(lbSync_(j));
  if (!j.digits || !j.date || !j.depIata || !j.arrIata) return '❌ 缺少航班信息';
  const props = PropertiesService.getScriptProperties();
  const key = 'plan_' + String(j.digits).replace(/^0+/, '') + j.depIata + j.arrIata + j.date;
  let old = {}; try { old = JSON.parse(props.getProperty(key) || '{}'); } catch (x) {}
  const pts = Array.isArray(j.pts) ? j.pts.slice(0, 120).map(function (q) { return [Math.round(q[0] * 1e3) / 1e3, Math.round(q[1] * 1e3) / 1e3, Math.round(q[2]), Math.round(q[3])]; }) : (old.pts || null);
  const r = { digits: String(j.digits).replace(/^0+/, ''), date: j.date, depIata: j.depIata, arrIata: j.arrIata, reg: j.reg || old.reg || null,
    trip: +j.trip || old.trip || null, taxi: +j.taxi || old.taxi || null, gnd: +j.gnd || old.gnd || null, pts: pts,
    atd: j.atd === null ? null : (+j.atd || old.atd || null), t: Date.now() };
  props.setProperty(key, JSON.stringify(r));
  const hm = function (m) { return Math.floor(m / 60) + 'h' + ('0' + m % 60).slice(-2); };
  return '✅ EK' + r.digits + ' ' + r.date + ' ' + r.depIata + '→' + r.arrIata + (r.trip ? ' · ' + hm(r.trip) : '') + (pts ? ' · ' + pts.length + ' 个航路点' : '') +
    (r.atd ? ' · ATD ' + new Date(r.atd).toISOString().slice(11, 16).replace(':', '') + 'Z' : '');
}
function txt_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }

// 从 OFP 里读：航班、日期、起降机场、计划飞行时间（TRIP）、滑行时间（TAXI）、机号
function parsePlan_(text) {
  const T = String(text || '').toUpperCase().replace(/\r/g, '').replace(/[\u00A0\u2000-\u200B\u202F\u3000\t]/g, ' ');
  const h = T.match(/\b(?:EK|UAE)?\s?(\d{1,5})\s+(\d{2}[A-Z]{3})\s+([A-Z]{4})\/([A-Z]{3})\s*-\s*([A-Z]{4})\/([A-Z]{3})(?:\s+\S+\s+([A-Z0-9]{1,2}-[A-Z0-9]{3,5}))?/);
  if (!h) return null;
  const mins = function (v) { return v ? +v.slice(0, 2) * 60 + +v.slice(2) : null; };
  const trip = (T.match(/\bTRIP\s+[A-Z]{4}\s+\d+\s+(\d{4})\b/) || [])[1];
  const taxi = (T.match(/\bTAXI\s+\d+\s+(\d{4})\b/) || [])[1];
  return { digits: h[1].replace(/^0+/, ''), date: h[2], depIata: h[4], arrIata: h[6], reg: h[7] || null,
    trip: mins(trip), taxi: mins(taxi), t: Date.now() };
}
function plans_() {
  const all = PropertiesService.getScriptProperties().getProperties(), out = [];
  Object.keys(all).forEach(function (k) { if (k.indexOf('plan_') === 0) { try { out.push(JSON.parse(all[k])); } catch (e) {} } });
  return out;
}

// ======== 入口 ========
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (TOKEN && p.token !== TOKEN) return out_({ ok: false, error: 'unauthorized' });
  try {
    if (p.action === 'photo') return out_(photo_(p));
    if (p.action === 'ofpcheck') return out_(ofpCheck_());
    if (p.action === 'track') {
      const leg = p.o && p.d && p.std ? { origin: p.o, dest: p.d, std: +p.std, sta: +p.sta || 0 } : null;
      return out_(track_(p.cs, leg));
    }
    if (p.action === 'logtimes') return out_(logTimes_(p));   // 飞行记录本：这一班 ADS-B 判断的滑出 / 起飞 / 落地时间
    if (p.action === 'ics') return out_(flights_(p.url));
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
  ScriptApp.newTrigger('poll').timeBased().everyMinutes(1).create();
  Logger.log('✅ 定时器已安装：每 1 分钟检查一次正在进行的航班');
  poll();
}

// ======== 日历 ========
// 非航班的排班任务（模拟机、地面、备份、休息、休假……）：标题里有这些代码，或者来自 CrewPulse 的日程
const DUTY_CODE = /\b(SIM|FFS|LOFT|LPC|OPC|SBY|STBY|ASBY|HSBY|RSV|GRD|GND|TRG|CRM|SEP|DGR|OFF|DO|RDO|AL|LV|REST)\b/;
const DUTY_WORD = /simulator|stand\s?by|reserve|ground|training|course|classroom|leave|vacation|day off|rest day|medical|visa/i;

// 判断一条日程是航班、排班任务，还是私人日程（私人的不发出去）
function pushEvent_(list, seen, e) {
  const title = String(e.title || '').trim(), desc = String(e.desc || '');
  const isFlight = !e.allDay && FLIGHT_TITLE.test(title.toUpperCase());
  const isDuty = !isFlight && (/crewpulse/i.test(desc) || DUTY_CODE.test(title) || DUTY_WORD.test(title));
  if (!isFlight && !isDuty) return;
  const start = new Date(e.start).toISOString();
  const key = title.toUpperCase() + '|' + start;
  if (seen[key]) return;
  seen[key] = 1;
  list.push({
    title: title.slice(0, 60), start: start, end: new Date(e.end).toISOString(), allDay: !!e.allDay,
    kind: isFlight ? 'flight' : 'duty',
    location: isFlight ? String(e.location || '') : '',
    description: isFlight ? legsOnly_(desc) : '',
  });
}

function events_(from, to) {
  const list = [], seen = {};
  CALENDAR_IDS.forEach(function (id) {
    const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (!cal) return;
    cal.getEvents(from, to).forEach(function (ev) {
      pushEvent_(list, seen, { title: ev.getTitle(), desc: ev.getDescription(), allDay: ev.isAllDayEvent(),
        start: ev.getStartTime(), end: ev.getEndTime(), location: ev.getLocation() });
    });
  });
  list.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  return list;
}

// ======== 同事用：读他自己的日历「iCal 私密地址」 ========
// 同事在时钟设置里粘贴 Google 日历的私密地址（…/basic.ics），时钟通过本脚本读取（浏览器不能直接读）。
// 只允许日历网站的地址，防止被拿去访问别的网站。
const ICS_HOSTS = /^https:\/\/(calendar\.google\.com\/calendar\/ical\/|p\d+-caldav\.icloud\.com\/published\/|outlook\.(office365|live)\.com\/owa\/calendar\/)/i;

function icsList_(url, from, to) {
  url = String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!ICS_HOSTS.test(url)) throw new Error('不是有效的日历地址（需要 Google 日历的「iCal 格式私密地址」）');
  const cache = CacheService.getScriptCache(), ck = 'icsl_' + hash_(url);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('日历地址打不开（' + r.getResponseCode() + '），请重新复制私密地址');
  const text = r.getContentText();
  if (text.indexOf('BEGIN:VCALENDAR') < 0) throw new Error('这个地址不是日历文件');
  const calTz = ((text.match(/^X-WR-TIMEZONE:(.+)$/m) || [])[1] || 'UTC').trim();
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const list = [], seen = {};
  let ev = null;
  lines.forEach(function (ln) {
    if (ln === 'BEGIN:VEVENT') { ev = {}; return; }
    if (ln === 'END:VEVENT') {
      if (ev && ev.start && ev.status !== 'CANCELLED' && ev.start < to.getTime() && (ev.end || ev.start) > from.getTime()) {
        pushEvent_(list, seen, { title: ev.summary, desc: ev.desc, allDay: ev.allDay, start: ev.start, end: ev.end || ev.start, location: ev.location });
      }
      ev = null; return;
    }
    if (!ev) return;
    const i = ln.indexOf(':'); if (i < 0) return;
    const head = ln.slice(0, i), val = ln.slice(i + 1), name = head.split(';')[0].toUpperCase();
    const unesc = function (v) { return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); };
    if (name === 'SUMMARY') ev.summary = unesc(val);
    else if (name === 'DESCRIPTION') ev.desc = unesc(val);
    else if (name === 'LOCATION') ev.location = unesc(val);
    else if (name === 'STATUS') ev.status = val.trim().toUpperCase();
    else if (name === 'DTSTART' || name === 'DTEND') {
      const tz = (head.match(/TZID=([^;:]+)/i) || [])[1];
      const t = icsTime_(val.trim(), tz || calTz);
      if (!t) return;
      if (name === 'DTSTART') { ev.start = t.ms; ev.allDay = t.allDay; } else ev.end = t.ms;
    }
  });
  list.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  const json = JSON.stringify(list);
  if (json.length < 95000) cache.put(ck, json, 300);   // 5 分钟内重复读用缓存
  return list;
}

function icsTime_(v, tz) {
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { allDay: true, ms: safeLocal_(+m[1], +m[2] - 1, +m[3], 0, 0, tz) };
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  if (m[7]) return { allDay: false, ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) };
  return { allDay: false, ms: safeLocal_(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], tz) };
}
function safeLocal_(y, mo, d, h, mi, tz) {
  try { return localToUtc_(y, mo, d, h, mi, tz); } catch (e) { return Date.UTC(y, mo, d, h, mi); }
}

function flights_(icsUrl) {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 864e5), to = new Date(now.getTime() + DAYS_AHEAD * 864e5);
  const list = icsUrl ? icsList_(icsUrl, from, to) : events_(from, to);
  // 附上每段航班的实际动态（起飞/落地时间）
  const status = {};
  list.forEach(function (ev) {
    legsOf_(ev).forEach(function (leg) {
      if (leg.std > now.getTime() + HOUR || leg.std < now.getTime() - DAYS_BACK * 864e5) return;
      const st = getStatus_(leg);
      if (st) status[leg.origin + leg.dest + leg.std] = publicStatus_(st);
    });
  });
  let routes = [];
  let plans = [];
  if (!icsUrl) { try { routes = ofpRoutes_(); } catch (e) {} try { plans = plans_(); } catch (e) {} }   // OFP 只给自己用
  return { ok: true, version: 5, generated: now.toISOString(), flights: list, status: status, routes: routes, plans: plans };
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
  // 日历 10 分钟读一次就够（每分钟都读太浪费额度）
  const cache = CacheService.getScriptCache();
  let list = null;
  try { list = JSON.parse(cache.get('poll_list') || 'null'); } catch (e) {}
  if (!list) { list = events_(new Date(now - 2 * 864e5), new Date(now + 864e5)); cache.put('poll_list', JSON.stringify(list), 600); }
  list.forEach(function (ev) {
    legsOf_(ev).forEach(function (leg) {
      const st = getStatus_(leg);
      const block = leg.sta - leg.std;
      // 跟踪窗口：计划起飞前 45 分钟开始；没起飞的最多跟到计划起飞后 8 小时（延误）；起飞了就跟到落地后 30 分钟
      const until = st && st.off ? st.off + block + 3 * HOUR : leg.std + 8 * HOUR;
      if (now < leg.std - 45 * MIN || now > until) return;
      if (st && st.on && now - st.on > 30 * MIN) return;                  // 已经落地很久了
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
// 也可以直接把 Pexels Key 写在这里（这样就不用去「脚本属性」里设置了）
const PEXELS_KEY_INLINE = '';
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
  const pexels = props.getProperty('PEXELS_KEY') || PEXELS_KEY_INLINE, unsplash = props.getProperty('UNSPLASH_KEY');
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

// ======== 飞行计划（OFP）→ 真实航路 ========
// 把 OFP 文字用邮件发到「你的邮箱 + ofp」（例如 name+ofp@gmail.com），或者邮件主题里带 OFP。
// 脚本从里面找出航班（EK9876 08NOV OMDW/DWC-ZGGG/CAN）和航路（OMDW/30 DCT NOLSU M572 ... ZGGG/01L），
// 再查出每个航路点的坐标（flightplandatabase.com 免费导航数据库，查过的会记住）。
// 找 OFP 邮件：主题里带 ofp（大小写都行，连在别的字中间也行），或者发到「你的邮箱+ofp」
function ofpMessages_() {
  const plus = '+ofp@';   // 发到「任何邮箱+ofp@」的也算（不需要读取账号邮箱的权限）
  const out = [];
  GmailApp.search('newer_than:4d', 0, 60).forEach(function (th) {
    th.getMessages().forEach(function (msg) {
      const subj = msg.getSubject() || '', to = (msg.getTo() || '').toLowerCase();
      if (/ofp/i.test(subj) || to.indexOf(plus) >= 0) out.push(msg);
    });
  });
  return out;
}

function ofpRoutes_() {
  let msgs = [];
  try { msgs = ofpMessages_(); } catch (e) { return []; }   // 还没授权读邮件
  const cache = CacheService.getScriptCache();
  const best = {};
  msgs.forEach(function (msg) {
    const id = 'ofp2_' + msg.getId();
    let r = null;
    const hit = cache.get(id);
    if (hit) r = JSON.parse(hit);
    else {
      r = parseOfp_(ofpText_(msg));
      if (r && r.fixes.length) {
        r.received = msg.getDate().getTime();
        try { r.pts = resolveFixes_(r); } catch (e) { r.pts = []; }
        cache.put(id, JSON.stringify(r), r.pts.length ? 21600 : 600);   // 坐标没查全的 10 分钟后再试
      } else { r = { none: true }; cache.put(id, JSON.stringify(r), 600); }
    }
    if (!r || r.none) return;
    const k = r.digits + r.depIata + r.arrIata + r.date;
    if (!best[k] || best[k].received < r.received) best[k] = r;   // 同一个航班有多份时用最新的
  });
  return Object.keys(best).map(function (k) {
    const r = best[k];
    // fixes：航路点名称（网页查不到坐标时会自己去查）；pts：这里已经查到坐标的点
    return { digits: r.digits, date: r.date, dep: r.dep, arr: r.arr, depIata: r.depIata, arrIata: r.arrIata, route: r.route,
      fixes: r.fixes.map(function (f) { return f.lat != null ? [f.id, f.lat, f.lon] : [f.id]; }), pts: r.pts || [], received: r.received };
  });
}

function ofpText_(msg) {
  let text = msg.getPlainBody() || '';
  msg.getAttachments().forEach(function (a) { if (/^text\//.test(a.getContentType())) text += '\n' + a.getDataAsString(); });
  return text;
}

// 检查用：?action=ofpcheck 看看读到了哪些 OFP 邮件、解析结果怎样（只返回主题和统计，不返回内容）
function ofpCheck_() {
  let msgs;
  try { msgs = ofpMessages_(); } catch (e) { return { ok: false, error: 'Gmail: ' + String(e).slice(0, 160) }; }
  return { ok: true, count: msgs.length, messages: msgs.slice(0, 10).map(function (m) {
    const t = ofpText_(m), r = parseOfp_(t);
    return { subject: (m.getSubject() || '').slice(0, 60), date: m.getDate().toISOString(), bodyLen: t.length,
      header: !!(r && r.digits), flight: r ? r.digits + ' ' + r.date + ' ' + r.depIata + '-' + r.arrIata : null, fixes: r ? r.fixes.length : 0 };
  }) };
}

function parseOfp_(text) {
  // 统一大写；特殊空格（不换行空格、全角空格等）都换成普通空格
  const T = String(text || '').toUpperCase().replace(/\r/g, '').replace(/[\u00A0\u2000-\u200B\u202F\u3000\t]/g, ' ');
  // 第一行：EK9876 08NOV OMDW/DWC-ZGGG/CAN
  const h = T.match(/\b(?:EK|UAE)?\s?(\d{1,5})\s+(\d{2}[A-Z]{3})\s+([A-Z]{4})\/([A-Z]{3})\s*-\s*([A-Z]{4})\/([A-Z]{3})/);
  if (!h) return null;
  const dep = h[3], arr = h[5];
  // 航路：从「OMDW/30」到「ZGGG/01L」
  const re = new RegExp('\\b' + dep + '(?:\\/\\d{2}[LRC]?)?[ \\t]+([\\s\\S]+?)\\s' + arr + '(?:\\/\\d{2}[LRC]?)?(?=\\s|$)');
  const m = T.match(re);
  if (!m) return null;
  const route = m[1].replace(/\s+/g, ' ').trim();
  const fixes = [];
  route.split(' ').forEach(function (t) {
    if (t === 'DCT') return;
    if (/^[A-Z]{2,5}$/.test(t)) { fixes.push({ id: t }); return; }        // 航路点 / 导航台（航路名带数字，会被跳过）
    const ll = latLonToken_(t);
    if (ll) fixes.push({ id: t, lat: ll[0], lon: ll[1] });                // 直接写坐标的点，例如 2500N06000E
  });
  return { digits: h[1].replace(/^0+/, ''), date: h[2], dep: dep, depIata: h[4], arr: arr, arrIata: h[6], route: route.slice(0, 600), fixes: fixes };
}

function latLonToken_(t) {
  let m = t.match(/^(\d{2})(\d{2})?([NS])(\d{3})(\d{2})?([EW])$/);          // 2530N06015E / 25N060E
  if (m) return [(+m[1] + (+m[2] || 0) / 60) * (m[3] === 'S' ? -1 : 1), (+m[4] + (+m[5] || 0) / 60) * (m[6] === 'W' ? -1 : 1)];
  m = t.match(/^([NS])(\d{2})(\d{2}(?:\.\d)?)?([EW])(\d{3})(\d{2}(?:\.\d)?)?$/); // N2530.5E06015.2
  if (m) return [(+m[2] + (+m[3] || 0) / 60) * (m[1] === 'S' ? -1 : 1), (+m[5] + (+m[6] || 0) / 60) * (m[4] === 'W' ? -1 : 1)];
  return null;
}

function fixCandidates_(id) {
  const props = PropertiesService.getScriptProperties();
  const k = 'fix_' + id;
  const saved = props.getProperty(k);
  if (saved) return JSON.parse(saved);
  let list = [];
  try {
    const r = UrlFetchApp.fetch('https://api.flightplandatabase.com/search/nav?q=' + encodeURIComponent(id), { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      list = JSON.parse(r.getContentText())
        .filter(function (x) { return x.ident === id && x.type !== 'APT' && x.type !== 'DME'; })
        .map(function (x) { return [Math.round(x.lat * 1e4) / 1e4, Math.round(x.lon * 1e4) / 1e4]; });
      props.setProperty(k, JSON.stringify(list.slice(0, 12)));
    }
  } catch (e) {}
  return list;
}

// 同名的点（例如 BPL 既是印度博帕尔也是布达佩斯）：选离上一个点近、又朝着目的地方向的那个
function resolveFixes_(r) {
  const A = airport_(r.depIata), B = airport_(r.arrIata);
  if (!A || !B) return [];
  let prev = { lat: A.lat, lon: A.lon };
  const out = [];
  r.fixes.forEach(function (f) {
    let c = f.lat != null ? [[f.lat, f.lon]] : fixCandidates_(f.id);
    if (!c.length) return;
    let bestC = null, bestS = 1e12;
    c.forEach(function (p) {
      const q = { lat: p[0], lon: p[1] };
      const d1 = dist_(prev, q);
      if (d1 > 3500) return;                                         // 离上一个点太远，肯定不是
      const s = d1 + 0.5 * dist_(q, B);
      if (s < bestS) { bestS = s; bestC = q; }
    });
    if (!bestC) return;
    out.push([bestC.lat, bestC.lon, f.id]);
    prev = bestC;
  });
  return out;
}

function testOfp() {
  Logger.log(JSON.stringify(ofpCheck_(), null, 1));
  Logger.log(JSON.stringify(ofpRoutes_(), null, 1));
}

// ======== 联网解读（Gemini + Google 搜索） ========
const GEMINI_KEY_INLINE = '';   // 也可以放在脚本属性 GEMINI_KEY
// 申请免费 Key：https://aistudio.google.com/apikey → 复制 → Apps Script「项目设置 → 脚本属性」添加 GEMINI_KEY
function explain_(j) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_KEY') || GEMINI_KEY_INLINE;
  if (!key) return { ok: false, error: 'no GEMINI_KEY' };
  const text = String(j.text || '').slice(0, 6000), lang = j.lang === 'en' ? 'en' : 'zh';
  if (!text.trim()) return { ok: false, error: 'empty' };
  const cache = CacheService.getScriptCache(), ck = 'ex_' + lang + '_' + hash_(text + '|' + (j.word || ''));
  const hit = cache.get(ck); if (hit) return finish_(hit, j, lang, true);
  const prompt = (lang === 'zh'
    ? '你是一位经验丰富的波音 777 机长兼签派员。下面是阿联酋航空 LIDO 格式 OFP（运行飞行计划）里的一段，所在部分：' + (j.section || '未知') + '。\n'
      + '请先联网搜索确认不认识的缩写、航路点、机场、空域和规定，然后用简体中文「说人话」把这一整段讲清楚：它在说什么、对机组意味着什么、要注意什么。'
      + '数字要读对（例如 236/063 是风向 236° 风速 63 节，-37 是气温零下 37°C，321 这类是高度层）。不要逐字翻译，不要中英混杂，专有名词第一次出现时可以括号注英文。'
      + (j.word ? '机长点的是「' + j.word + '」，先用一句话解释它，再讲整段。' : '') + '只输出解读本身，简洁，分短段。\n\n' + LEARN_ZH_
    : 'You are an experienced Boeing 777 captain and dispatcher. Below is part of an Emirates LIDO-format OFP (section: ' + (j.section || 'unknown') + ').\n'
      + 'Search the web to confirm any abbreviation, waypoint, airport, airspace or rule you are unsure of, then explain the whole passage in plain English: what it says, what it means for the crew, and what to watch out for. '
      + 'Read numbers correctly (e.g. 236/063 = wind 236° at 63 kt, -37 = minus 37 °C, 321 = flight level). Do not translate word by word. '
      + (j.word ? 'The captain tapped "' + j.word + '": explain that in one sentence first, then the whole passage. ' : '') + 'Output only the explanation, concise, short paragraphs.\n\n' + LEARN_EN_)
    + '---\n' + text + '\n---';
  const models = [props.getProperty('GEMINI_MODEL') || 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  const call = function (model, search) {
    const body = { contents: [{ role: 'user', parts: [{ text: prompt + (search ? '' : '\n(No web search available: rely on your aviation knowledge.)') }] }], generationConfig: { temperature: 0.2 } };
    if (search) body.tools = [{ google_search: {} }];
    return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true, payload: JSON.stringify(body) });
  };
  let last = '';
  for (let m = 0; m < models.length; m++) {
    // 先带 Google 搜索；免费额度不含搜索（429）时，不带搜索再试
    let r = call(models[m], true), code = r.getResponseCode(), searched = true;
    if (code === 429 || code === 400 && /search|tool/i.test(r.getContentText())) { r = call(models[m], false); code = r.getResponseCode(); searched = false; }
    if (code === 404 || code === 429 || code === 503 || code === 400 && /not found|not supported/i.test(r.getContentText())) { last = models[m] + ' ' + code; continue; }
    if (code !== 200) return { ok: false, error: 'Gemini ' + code + ' ' + r.getContentText().slice(0, 160) };
    const d = JSON.parse(r.getContentText()), c = d.candidates && d.candidates[0];
    const out = c && c.content && c.content.parts ? c.content.parts.map(function (p) { return p.text || ''; }).join('').trim() : '';
    if (!out) { last = models[m] + ' empty'; continue; }
    try { cache.put(ck, out, 21600); } catch (e) {}
    const res = finish_(out, j, lang, false); res.model = models[m]; res.searched = searched; return res;
  }
  return { ok: false, error: 'no model: ' + last };
}

// ======== 学习：AI 每次解读时顺便整理出「词条」，存在后台；所有设备下载后离线使用 ========
const LEARN_ZH_ = '最后另起一行写 ===LEARN===，后面写一个 JSON 数组，列出这段里值得记住的缩写、代码、航路点、空域、程序名、术语（最多 8 个，被点的词一定要有）：[{"t":"原文写法","zh":"不超过 40 字的中文解释","en":"English, max 20 words"}]。解释要通用（以后别的航班也适用），不要写今天的具体数字。\n\n';
const LEARN_EN_ = 'Finally, on a new line write ===LEARN=== followed by a JSON array of the abbreviations, codes, waypoints, airspace, procedure names and terms worth remembering from this passage (max 8; always include the tapped word): [{"t":"as written","zh":"Chinese, max 40 characters","en":"English, max 20 words"}]. Keep them generic (valid for other flights), no flight-specific numbers.\n\n';
function finish_(raw, j, lang, cached) {
  const parts = String(raw).split(/\n?\s*===LEARN===\s*/);
  const out = parts[0].trim();
  let learn = [];
  if (parts[1]) { try { const m = parts[1].match(/\[[\s\S]*\]/); if (m) learn = JSON.parse(m[0]); } catch (e) {} }
  learn = (Array.isArray(learn) ? learn : []).filter(function (x) { return x && x.t && (x.zh || x.en); }).slice(0, 10)
    .map(function (x) { return { t: String(x.t).toUpperCase().trim().slice(0, 40), zh: String(x.zh || '').slice(0, 120), en: String(x.en || '').slice(0, 200) }; });
  if (!cached) { try { kbSave_(learn, j.key, lang, out); } catch (e) {} }
  return { ok: true, out: out, learn: learn, cached: cached };
}
function kbSave_(learn, k, lang, out) {
  const props = PropertiesService.getScriptProperties(), now = Date.now(), put = {};
  learn.forEach(function (x) { put['kb_' + x.t] = JSON.stringify({ zh: x.zh, en: x.en, t: now }); });
  if (k && /^[\w-]{1,40}$/.test(k)) put['ka_' + k] = JSON.stringify({ o: out.slice(0, 8000), t: now });
  props.setProperties(put, false);
  // 后台空间有限（约 500 KB）：超过 400 KB 时删掉最老的整段解读
  const all = props.getProperties(); let size = 0; const ka = [];
  Object.keys(all).forEach(function (key) { size += key.length + all[key].length; if (key.indexOf('ka_') === 0) { let t = 0; try { t = JSON.parse(all[key]).t; } catch (e) {} ka.push([key, t, all[key].length]); } });
  ka.sort(function (a, b) { return a[1] - b[1]; });
  for (let i = 0; size > 400000 && i < ka.length; i++) { props.deleteProperty(ka[i][0]); size -= ka[i][0].length + ka[i][2]; }
}
function kbGet_() {
  const all = PropertiesService.getScriptProperties().getProperties(), terms = {}, ai = {};
  Object.keys(all).forEach(function (key) {
    try { if (key.indexOf('kb_') === 0) terms[key.slice(3)] = JSON.parse(all[key]); else if (key.indexOf('ka_') === 0) ai[key.slice(3)] = JSON.parse(all[key]); } catch (e) {}
  });
  return { ok: true, terms: terms, ai: ai };
}

// ======== 飞行记录本：按起降机场 + 大约时间，找时钟用 ADS-B 记下的滑出 / 起飞 / 落地时间 ========
function logTimes_(p) {
  const o = String(p.o || '').toUpperCase(), d = String(p.d || '').toUpperCase(), t = +p.t || 0;
  if (!/^[A-Z]{3,4}$/.test(o) || !/^[A-Z]{3,4}$/.test(d) || !t) return { ok: false, error: 'bad params' };
  const all = PropertiesService.getScriptProperties().getProperties(), pre = 'st_' + o + d;
  let best = null, bd = 18 * HOUR;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(pre) !== 0) return; const std = +k.slice(pre.length); if (!std) return;
    const dd = Math.abs(std - t); if (dd < bd) { bd = dd; best = { std: std, st: JSON.parse(all[k]) }; }
  });
  if (!best) return { ok: true, found: false };
  return { ok: true, found: true, std: best.std, status: publicStatus_(best.st) };
}

// ======== 飞行记录本云端：存在你自己 Google Drive 的表格「Flight Logbook (Flight Assist)」里 ========
// 第一次用：在编辑器里选函数 setupLogbook → 运行 → 允许访问（Google 表格）。
function setupLogbook() { const ss = lbBook_(); Logger.log('✅ 飞行记录本表格：' + ss.getUrl()); }
function lbBook_() {
  const props = PropertiesService.getScriptProperties(); let id = props.getProperty('LB_SHEET'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Flight Logbook (Flight Assist)');
    props.setProperty('LB_SHEET', ss.getId());
    const d = ss.getSheets()[0]; d.setName('Logbook');
    ss.insertSheet('data').getRange(1, 1, 1, 4).setValues([['key', 'updated', 'deleted', 'json']]);
    ss.insertSheet('meta').getRange(1, 1, 2, 2).setValues([['settings', '{}'], ['settingsUpdated', 0]]);
  }
  return ss;
}
function lbSync_(j) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = lbBook_(), sh = ss.getSheetByName('data'), meta = ss.getSheetByName('meta');
    const n = sh.getLastRow(), rows = n > 1 ? sh.getRange(2, 1, n - 1, 4).getValues() : [], idx = {};
    rows.forEach(function (r, i) { idx[r[0]] = i; });
    // 收到的修改：比服务器上新的才收
    (j.entries || []).forEach(function (e) {
      if (!e || !e.k) return; const u = +e.u || Date.now(), i = idx[e.k];
      const row = [e.k, u, e.del ? 1 : 0, e.del ? '' : JSON.stringify(e).slice(0, 49000)];
      if (i == null) { idx[e.k] = rows.length; rows.push(row); } else if (u >= +rows[i][1]) rows[i] = row;
    });
    if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
    // 设置
    let set = {}, setU = +meta.getRange(2, 2).getValue() || 0; try { set = JSON.parse(meta.getRange(1, 2).getValue() || '{}'); } catch (e) {}
    if (j.set && +j.setU > setU) { set = j.set; setU = +j.setU; meta.getRange(1, 2, 2, 1).setValues([[JSON.stringify(set)], [setU]]); }
    // 好看的那一页：手机 / 电脑上直接看
    if (Array.isArray(j.table) && j.table.length) {
      const L = ss.getSheetByName('Logbook'); L.clearContents();
      const w = j.table[0].length, t = j.table.map(function (r) { const o = r.slice(0, w); while (o.length < w) o.push(''); return o; });
      L.getRange(1, 1, t.length, w).setValues(t); L.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#eef1f6'); L.setFrozenRows(1);
    }
    const out = []; rows.forEach(function (r) { if (+r[2]) out.push({ k: r[0], u: +r[1], del: true }); else { try { const e = JSON.parse(r[3]); e.u = +r[1]; out.push(e); } catch (x) {} } });
    return { ok: true, entries: out, set: set, setU: setU, url: ss.getUrl(), t: Date.now() };
  } finally { lock.releaseLock(); }
}
