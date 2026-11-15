/* ===== 自动更新 =====
   这个文件（Code）会自己从 GitHub 更新（每小时检查一次）。私人的口令、Key 和公司资料放在另一个文件 Secrets.gs 里，自动更新不会碰它。 */
const BACKEND_VER = '2026-11-17a';
['OFP_POST_KEY', 'PEXELS_KEY_INLINE', 'GEMINI_KEY_INLINE', 'GITHUB_TOKEN_INLINE', 'WAC_GZ', 'DEEPSEEK_KEY'].forEach(function (k) {
  Object.defineProperty(globalThis, k, { configurable: true, get: function () { return (typeof SECRETS === 'object' && SECRETS && SECRETS[k]) || ''; } });
});

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
// OFP_POST_KEY：在 Secrets.gs 里

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
  if (j.action === 'translate' && Array.isArray(j.texts)) return JSON.stringify(translate_(j));
  // 整份 OFP 交给 Gemini：按阶段列出关键影响，每条都要引用 OFP 原文（iPad 会核对原文）
  if (j.action === 'ofpbrief') return JSON.stringify(ofpBrief_(j));
  // 云端：解析好的 OFP 原文存到你的 GitHub 私有仓库（flight-box/ofpdata），手机和 iPad 有网时自动下载
  if (j.action === 'ofpsave') return JSON.stringify(ofpSave_(j));
  // 联网解读：用 Google Gemini（打开 Google 搜索）把 OFP 里的一段用白话讲清楚。Key 放在「项目设置 → 脚本属性」GEMINI_KEY
  if (j.action === 'explain') return JSON.stringify(explain_(j));
  // 学到的东西：所有设备共用（iPad、电脑），下载到设备上离线用
  if (j.action === 'kb') return JSON.stringify(kbGet_());
  // 飞行记录本：云端保存（你自己 Google Drive 里的一个表格）
  if (j.action === 'lbsync') return JSON.stringify(lbSync_(j));
  // 邮箱里的 OFP PDF：列出最近的附件 + 排班上的航段；按需下载
  // 诊断：飞行助手把「粘贴时剪贴板里有什么」报上来，方便远程排查（只存最近 30 条，没有 OFP 内容）
  if (j.action === 'diag') { const pr = PropertiesService.getScriptProperties(); let L = []; try { L = JSON.parse(pr.getProperty('diag_log') || '[]'); } catch (e) {} L.push({ t: Date.now(), r: String(JSON.stringify(j.r || {})).slice(0, 3000) }); pr.setProperty('diag_log', JSON.stringify(L.slice(-30))); return JSON.stringify({ ok: true }); }
  if (j.action === 'diagget') return JSON.stringify({ ok: true, log: JSON.parse(PropertiesService.getScriptProperties().getProperty('diag_log') || '[]') });
  if (j.action === 'ofpmail') return JSON.stringify(ofpMail_(j));
  if (j.action === 'live') return JSON.stringify(live_(j));
  if (j.action === 'selfupdate') return JSON.stringify(selfUpdate_(true));
  if (j.action === 'backendver') return JSON.stringify({ ok: true, v: BACKEND_VER });
  if (j.action === 'wac') return JSON.stringify(WAC_GZ ? { ok: true, d: Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(WAC_GZ), 'application/x-gzip')).getDataAsString('UTF-8') } : { ok: false, error: 'no data' });
  if (j.action === 'ofpget') return JSON.stringify(ofpGet_(j));
  if (j.action === 'relay') return JSON.stringify(relay_(true));
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
  // 查后台版本和自动更新情况（不需要口令，不含任何私人资料）
  if (p.action === 'ver') { let u = null; try { u = JSON.parse(PropertiesService.getScriptProperties().getProperty('upd_last') || 'null'); } catch (x) {} return out_({ ok: true, v: BACKEND_VER, lastCheck: u }); }
  try {
    if (p.action === 'photo') return out_(photo_(p));
    if (p.action === 'ofpcheck') return out_(ofpCheck_());
    if (p.action === 'track') {
      const leg = p.o && p.d && p.std ? { origin: p.o, dest: p.d, std: +p.std, sta: +p.sta || 0 } : null;
      return out_(track_(p.cs, leg));
    }
    // 时钟的自动诊断（背景状态等技术信息）：存最近 30 条
    if (p.action === 'cdiag') { const pr = PropertiesService.getScriptProperties(); let L = []; try { L = JSON.parse(pr.getProperty('diag_log') || '[]'); } catch (e) {} L.push({ t: Date.now(), r: JSON.stringify({ ev: 'clock', d: String(p.d || '').slice(0, 1800) }) }); pr.setProperty('diag_log', JSON.stringify(L.slice(-30))); return out_({ ok: true }); }
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
  try { autoUpdate_(); } catch (e) {}   // 每小时看一次 GitHub 上有没有新版本
  try { rwWatch_(); } catch (e) {}   // 飞行助手要的机场：看实际起降方向
  // 日历 10 分钟读一次就够（每分钟都读太浪费额度）
  const cache = CacheService.getScriptCache();
  let list = null;
  try { list = JSON.parse(cache.get('poll_list') || 'null'); } catch (e) {}
  if (!list) { list = events_(new Date(now - 2 * 864e5), new Date(now + 864e5)); cache.put('poll_list', JSON.stringify(list), 600); }
  list.forEach(function (ev) {
    legsOf_(ev).forEach(function (leg) {
      const st = getStatus_(leg);
      const block = leg.sta - leg.std;
      // 跟踪窗口：计划起飞前 1 小时开始（抓推出）；没起飞的最多跟到计划起飞后 8 小时（延误）；
      // 落地后一直跟，直到在停机位停稳 15 分钟（抓挡轮挡），最多落地后 2 小时（滑行可能很久）
      const until = st && st.off ? st.off + block + 4 * HOUR : leg.std + 8 * HOUR;
      if (now < leg.std - 60 * MIN || now > until) return;
      if (st && st.on && (now - st.on > 2 * HOUR || (st.in && now - st.in > 15 * MIN))) return;
      track_(leg.callsign, leg);
    });
  });
  cleanup_();
  try { relay_(false); } catch (e) {}   // 把邮箱里的 OFP 复制到 GitHub 私有仓库（中国能连）
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
  return { move: st.move || null, taxi: st.taxi || null, off: st.off || null, on: st.on || null, in: st.in || null, lastGnd: st.lastGnd || null, seen: st.seen || null, reg: st.reg || null };
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
      if (dO < 15 && !st.off && pos.gs != null && pos.gs >= 1.5 && !st.move) st.move = now;   // 第一次在地面动（推出）＝撤轮挡
      if (dO < 15 && !st.off && pos.gs >= 5 && !st.taxi) st.taxi = now;
      // 落地后在目的地滑行：最后一次停下来的时间＝挡轮挡（中途停下等待、再动，会重新算）
      if (dD < 15 && st.on && pos.gs != null) { st.lastGnd = now; if (pos.gs >= 3) { st.inMove = now; st.in = null; } else if (pos.gs < 1 && !st.in && now - st.on > 2 * MIN) st.in = now; }
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
  if (pos) st.seen = now;   // 只有真的收到 ADS-B 才算「在跟踪」；收不到时时钟按计划时间推进
  st.polled = now;
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
// PEXELS_KEY_INLINE：在 Secrets.gs 里
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
// GEMINI_KEY_INLINE：在 Secrets.gs 里（也可以放在脚本属性 GEMINI_KEY）
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
      + '请先联网搜索确认不认识的缩写、航路点、机场、空域和规定，然后用简体中文「说人话」把这一整段讲清楚：它在说什么、对机组意味着什么、要注意什么。' + AVZ_
      + '数字要读对（例如 236/063 是风向 236° 风速 63 节，-37 是气温零下 37°C，321 这类是高度层）。不要逐字翻译，不要中英混杂，专有名词第一次出现时可以括号注英文。'
      + (j.word ? '机长点的是「' + j.word + '」，先用一句话解释它，再讲整段。' : '') + '只输出解读本身，简洁，分短段。\n\n' + LEARN_ZH_
    : 'You are an experienced Boeing 777 captain and dispatcher. Below is part of an Emirates LIDO-format OFP (section: ' + (j.section || 'unknown') + ').\n'
      + 'Search the web to confirm any abbreviation, waypoint, airport, airspace or rule you are unsure of, then explain the whole passage in plain English: what it says, what it means for the crew, and what to watch out for. ' + AVE_
      + 'Read numbers correctly (e.g. 236/063 = wind 236° at 63 kt, -37 = minus 37 °C, 321 = flight level). Do not translate word by word. '
      + (j.word ? 'The captain tapped "' + j.word + '": explain that in one sentence first, then the whole passage. ' : '') + 'Output only the explanation, concise, short paragraphs.\n\n' + LEARN_EN_)
    + '---\n' + text + '\n---';
  const models = [props.getProperty('GEMINI_MODEL') || 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  const call = function (model, search) {
    const body = { contents: [{ role: 'user', parts: [{ text: prompt + (search ? '' : '\n(No web search available: rely on your aviation knowledge.)') }] }], generationConfig: { temperature: 0.1 } };
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
    // DeepSeek 复核这段解读（对照原文）：一致就标一下，有错就把它指出的问题附在后面
    if (dsKey_()) { try {
      const parts0 = out.split(/\n?\s*===LEARN===\s*/), rv = deepseek_('You are a senior Boeing 777 captain. Check another AI\'s explanation of an OFP / NOTAM passage against the original text. ' + AVE_ + 'Return JSON {"ok":true|false,"why":"if not ok: the specific errors, in ' + (lang === 'zh' ? 'Simplified Chinese' : 'English') + ', max 3 short sentences"}.',
        JSON.stringify({ original: text, explanation: parts0[0] }));
      if (rv.ok && rv.json) out = parts0[0] + (rv.json.ok === false ? '\n\n⚠️ ' + (lang === 'zh' ? dsName_() + ' 复核指出：' : dsName_() + ' review: ') + (rv.json.why || '') : '\n\n✓✓ ' + (lang === 'zh' ? dsName_() + ' 复核：一致' : dsName_() + ' review: agrees')) + (parts0[1] ? '\n===LEARN===\n' + parts0[1] : '');
    } catch (e) {} }
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
  learn.forEach(function (x) { if (!kbLocal_(x.t)) put['kb_' + x.t] = JSON.stringify({ zh: x.zh, en: x.en, t: now }); });
  if (k && /^[\w-]{1,40}$/.test(k)) put['ka_' + k] = JSON.stringify({ o: out.slice(0, 8000), t: now });
  props.setProperties(put, false);
  // 后台空间有限（约 500 KB）：超过 400 KB 时删掉最老的整段解读
  const all = props.getProperties(); let size = 0; const ka = [];
  Object.keys(all).forEach(function (key) { size += key.length + all[key].length; if (key.indexOf('ka_') === 0) { let t = 0; try { t = JSON.parse(all[key]).t; } catch (e) {} ka.push([key, t, all[key].length]); } });
  ka.sort(function (a, b) { return a[1] - b[1]; });
  for (let i = 0; size > 400000 && i < ka.length; i++) { props.deleteProperty(ka[i][0]); size -= ka[i][0].length + ka[i][2]; }
}
function kbGet_() {
  const props = PropertiesService.getScriptProperties(), all = props.getProperties(), terms = {}, ai = {};
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('kb_') === 0 && kbLocal_(key.slice(3))) { try { props.deleteProperty(key); } catch (e) {} return; }   // 清掉以前学错的机场代号（L9、06R 这种）
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

// ======== 邮箱里的 OFP（PDF）：飞行助手来取，在 iPad 上读 ========
// 在 Lido 里把 OFP 的 PDF 用邮件发给自己（发到这个 Google 账号）就行。
function ofpMail_(j) {
  const days = Math.min(400, Math.max(1, +j.days || 4)), out = [];   // 「全部日期」时最多看 400 天
  GmailApp.search('has:attachment {filename:pdf filename:docx filename:doc filename:rtf filename:txt filename:odt} newer_than:' + days + 'd', 0, days > 10 ? 100 : 30).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      m.getAttachments({ includeInlineImages: false }).forEach(function (a, i) {
        const name = a.getName() || '';
        if (!/\.(pdf|docx?|rtf|txt|odt)$/i.test(name) && !/pdf|word|rtf|text\/plain|opendocument/i.test(a.getContentType())) return;
        if (a.getSize() > 15e6) return;
        out.push({ id: m.getId() + ':' + i, name: name, subject: String(m.getSubject() || '').slice(0, 120), t: m.getDate().getTime(), size: a.getSize() });
      });
    });
  });
  out.sort(function (a, b) { return b.t - a.t; });
  // 排班上前后几天的航段（航班号、起降机场、计划起飞）：让 iPad 判断这份 OFP 是不是我的
  const now = Date.now(), legs = [];
  try { events_(new Date(now - 2 * 864e5), new Date(now + 4 * 864e5)).forEach(function (ev) { legsOf_(ev).forEach(function (l) { legs.push({ digits: l.digits, origin: l.origin, dest: l.dest, std: l.std, sta: l.sta }); }); }); } catch (e) {}
  // 顺便把 GitHub 同步码交给 iPad（只有带对口令的请求能拿到）：在中国 Google 连不上时，iPad 自动改从 GitHub 收
  const pr = PropertiesService.getScriptProperties(), tok = pr.getProperty('GITHUB_TOKEN') || (typeof GITHUB_TOKEN_INLINE !== 'undefined' ? GITHUB_TOKEN_INLINE : '');
  return { ok: true, files: out.slice(0, days > 10 ? 80 : 20), legs: legs, gh: tok ? { tok: tok, repo: pr.getProperty('GITHUB_REPO') || GITHUB_REPO_INLINE } : null };
}
function ofpGet_(j) {
  const p = String(j.id || '').split(':'), m = GmailApp.getMessageById(p[0]);
  if (!m) return { ok: false, error: 'not found' };
  const a = m.getAttachments({ includeInlineImages: false })[+p[1] || 0];
  if (!a) return { ok: false, error: 'no attachment' };
  return { ok: true, name: a.getName(), b64: Utilities.base64Encode(a.getBytes()) };
}

// ======== 中国也能拿到 OFP：后台每 10 分钟把邮箱里（最近 6 天、排班上的）OFP 复制到你的 GitHub 私有仓库 ========
// 设置：脚本属性 GITHUB_TOKEN = 只给 flight-box 仓库「Contents 读写」权限的 token；GITHUB_REPO = 你的用户名/flight-box
const GITHUB_REPO_INLINE = 'chunhua1780/flight-box';   // GITHUB_TOKEN_INLINE：在 Secrets.gs 里
function gh_(method, path, body) {
  const pr = PropertiesService.getScriptProperties(), tok = pr.getProperty('GITHUB_TOKEN') || GITHUB_TOKEN_INLINE, repo = pr.getProperty('GITHUB_REPO') || GITHUB_REPO_INLINE;
  if (!tok) return null;
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, { method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, payload: body ? JSON.stringify(body) : undefined });
  return { code: r.getResponseCode(), j: (function () { try { return JSON.parse(r.getContentText()); } catch (e) { return null; } })() };
}
function relay_(force) {
  const pr = PropertiesService.getScriptProperties(); if (!(pr.getProperty('GITHUB_TOKEN') || GITHUB_TOKEN_INLINE)) return { ok: false, error: 'no GITHUB_TOKEN' };
  const cache = CacheService.getScriptCache(); if (!force && cache.get('relay_t')) return { ok: true, skipped: true }; cache.put('relay_t', '1', 600);
  const LIDO = /EK\.?\s?(\d{3,4})\.(\d{2}[A-Za-z]{3}\d{4})\.([A-Z]{3})\.([A-Z]{3})/, l4 = function (d) { return String(d || '').replace(/\D/g, '').slice(-4).replace(/^0+/, ''); };
  const m = ofpMail_({ days: 6 }), legs = m.legs || [];
  const cur = gh_('get', 'ofp/index.json'); if (cur && cur.code === 401) return { ok: false, error: 'GitHub token wrong' };
  let idx = [], sha = null; if (cur && cur.code === 200 && cur.j) { sha = cur.j.sha; try { idx = JSON.parse(Utilities.newBlob(Utilities.base64Decode(cur.j.content)).getDataAsString()); } catch (e) { idx = []; } }
  const have = {}; idx.forEach(function (x) { have[x.name + '|' + x.size] = 1; });
  let added = 0;
  m.files.forEach(function (f) {
    const mm = LIDO.exec(f.name || ''); if (!mm && !/\bOFP\b/i.test((f.name || '') + ' ' + (f.subject || ''))) return;
    if (mm && legs.length && !legs.some(function (l) { return l4(l.digits) === l4(mm[1]) && l.dest === mm[4]; })) return;   // 只要排班上的
    if (have[f.name + '|' + f.size] || added >= 4) return;
    const a = ofpGet_({ id: f.id }); if (!a.ok) return;
    const path = 'ofp/' + f.t + '-' + String(f.name).replace(/[^\w.\-]/g, '_');
    const put = gh_('put', path, { message: 'OFP ' + f.name, content: a.b64 });
    if (put && (put.code === 200 || put.code === 201)) { idx.push({ name: f.name, subject: f.subject, t: f.t, size: f.size, path: path }); have[f.name + '|' + f.size] = 1; added++; }
  });
  // 10 天前的删掉
  const keep = [], now = Date.now();
  idx.forEach(function (x) { if (now - x.t > 10 * 864e5) { const g = gh_('get', x.path); if (g && g.code === 200) gh_('delete', x.path, { message: 'old', sha: g.j.sha }); } else keep.push(x); });
  if (added || keep.length !== idx.length || !sha) {
    const body = { message: 'index', content: Utilities.base64Encode(JSON.stringify(keep.concat([]).sort(function (a, b) { return b.t - a.t; })), Utilities.Charset.UTF_8) }; if (sha) body.sha = sha;
    gh_('put', 'ofp/index.json', body);
  }
  return { ok: true, added: added, total: keep.length };
}

/* ---------- 实时天气 + D-ATIS（飞行助手收到 OFP 后用）----------
   METAR / TAF：aviationweather.gov（全球）；ATIS：atis.info（只有美国大机场有 D-ATIS）。缓存 5 分钟。 */
function live_(j) {
  const ids = (j.icaos || []).map(function (x) { return String(x).toUpperCase(); }).filter(function (x) { return /^[A-Z]{4}$/.test(x); }).slice(0, 12);
  if (!ids.length) return { ok: false, error: 'no airports' };
  const cache = CacheService.getScriptCache(), ck = 'live:' + ids.join(','), hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const q = ids.join(','), reqs = [
    { url: 'https://aviationweather.gov/api/data/metar?format=json&hours=3&ids=' + q, muteHttpExceptions: true },
    { url: 'https://aviationweather.gov/api/data/taf?format=json&ids=' + q, muteHttpExceptions: true }
  ].concat(ids.map(function (i) { return { url: 'https://atis.info/api/' + i, muteHttpExceptions: true, followRedirects: true }; }));
  let rs = []; try { rs = UrlFetchApp.fetchAll(reqs); } catch (e) { return { ok: false, error: String(e) }; }
  const out = {}; ids.forEach(function (i) { out[i] = { m: null, mt: 0, t: null, tt: 0, atis: null }; });
  try { JSON.parse(rs[0].getContentText()).forEach(function (m) { const o = out[m.icaoId]; if (o && m.rawOb && m.obsTime * 1000 > o.mt) { o.m = m.rawOb; o.mt = m.obsTime * 1000; } }); } catch (e) {}
  try { JSON.parse(rs[1].getContentText()).forEach(function (t) { const o = out[t.icaoId], it = Date.parse(t.issueTime) || 0; if (o && t.rawTAF && it >= o.tt) { o.t = t.rawTAF; o.tt = it; } }); } catch (e) {}
  ids.forEach(function (i, k) { try { const r = rs[2 + k]; if (!r || r.getResponseCode() !== 200) return; const a = JSON.parse(r.getContentText());
    if (Array.isArray(a) && a.length && a[0].datis) out[i].atis = a.map(function (x) { return { type: x.type, code: x.code, text: x.datis, time: x.time }; }); } catch (e) {} });
  // 实际在用跑道：看 ADS-B 上正在起降的飞机（全球有 ADS-B 覆盖的地方都行）。之后 3 小时每几分钟自动再看
  const pos = j.pos || {}, W = rwW_();
  ids.forEach(function (i) { if (pos[i]) W[i] = { p: pos[i], exp: Date.now() + 3 * 3600e3 }; });
  rwWsave_(W);
  ids.forEach(function (i) { if (pos[i]) { try { rwSample_(i, pos[i]); } catch (e) {} } out[i].tr = rwHist_(i); });
  const res = { ok: true, t: Date.now(), ap: out };
  try { cache.put(ck, JSON.stringify(res), 120); } catch (e) {}
  return res;
}

/* ---------- 实际在用跑道（ADS-B 观察）----------
   机场 12 海里内、4000 英尺以下：下降的 = 正在落地，上升的 = 刚起飞；记下它们的航迹方向，保留 40 分钟。 */
function rwW_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('rw_watch') || '{}'); } catch (e) { return {}; } }
function rwWsave_(W) { const now = Date.now(); Object.keys(W).forEach(function (k) { if (W[k].exp < now) delete W[k]; }); PropertiesService.getScriptProperties().setProperty('rw_watch', JSON.stringify(W)); }
function rwHist_(icao) { try { return JSON.parse(CacheService.getScriptCache().get('rwh:' + icao) || '{"a":[],"d":[]}'); } catch (e) { return { a: [], d: [] }; } }
function rwBrg_(la1, lo1, la2, lo2) { const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r), x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r); return (Math.atan2(y, x) / r + 360) % 360; }
function rwDif_(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
function rwSample_(icao, p) {
  const r = UrlFetchApp.fetch('https://api.adsb.lol/v2/point/' + p[0] + '/' + p[1] + '/12', { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return;
  const now = Date.now(), H = rwHist_(icao), keep = function (L) { const seen = {}; return L.filter(function (x) { return now - x.t < 40 * 60e3; }).sort(function (a, b) { return b.t - a.t; }).filter(function (x) { if (seen[x.h]) return false; seen[x.h] = 1; return true; }).slice(0, 40); };
  (JSON.parse(r.getContentText()).ac || []).forEach(function (x) {
    const alt = x.alt_baro, rate = x.baro_rate != null ? x.baro_rate : x.geom_rate, trk = x.track;
    if (typeof alt !== 'number' || alt > 4000 || alt < 50 || trk == null || rate == null || (x.gs || 0) < 100) return;
    if (x.lat == null) return;
    // 只算对准跑道的：落地的要朝着机场飞（不是在三边），起飞的要离机场而去
    if (rate < -300 && rwDif_(rwBrg_(x.lat, x.lon, p[0], p[1]), trk) < 30) H.a.push({ h: x.hex, t: now, k: Math.round(trk) });
    else if (rate > 300 && rwDif_(rwBrg_(p[0], p[1], x.lat, x.lon), trk) < 40) H.d.push({ h: x.hex, t: now, k: Math.round(trk) });
  });
  H.a = keep(H.a); H.d = keep(H.d);
  CacheService.getScriptCache().put('rwh:' + icao, JSON.stringify(H), 3600);
}
// 每分钟由 poll() 调用：轮流看 1–2 个机场（每个机场大约 3–5 分钟看一次）
function rwWatch_() {
  const W = rwW_(), ks = Object.keys(W).filter(function (k) { return W[k].exp > Date.now(); }); if (!ks.length) return;
  const pr = PropertiesService.getScriptProperties(), n = (+pr.getProperty('rw_rr') || 0) % ks.length; pr.setProperty('rw_rr', String(n + 2));
  [ks[n], ks[(n + 1) % ks.length]].filter(function (k, i, a) { return a.indexOf(k) === i; }).forEach(function (k) { try { rwSample_(k, W[k].p); } catch (e) {} });
}


/* ======== 航空用语规则：翻译 / 解读 / 整份 OFP 都用（避免把滑行道说成跑道这类错误） ======== */
const AVZ_ = '\n【必须遵守】TWY/TAXIWAY=滑行道；RET/RAPID EXIT (TWY)=快速脱离道（是滑行道，不是跑道）；RWY=跑道；APRON=机坪；STAND/STD=停机位；TWY 后面的 L9、B、K2 这类是滑行道名字，绝不能说成跑道。只有 RWY 后面的 02L、24R、12/30 才是跑道。'
  + '所有代号（滑行道名、跑道号、航路点、频率、时间、高度、坐标）一个字符都不能改、不能漏、不能自己补；原文没说的不要推测；看不懂就说看不懂。\n';
const AVE_ = '\nRULES: TWY/TAXIWAY = taxiway; RET / RAPID EXIT (TWY) = rapid exit taxiway (a taxiway, never a runway); RWY = runway; APRON = apron; STAND = parking stand. Identifiers after TWY (L9, B, K2) are taxiway names and must never be called runways; only designators after RWY (02L, 24R, 12/30) are runways. '
  + 'Copy every identifier (taxiway, runway, waypoint, frequency, time, level, coordinate) exactly; never invent or infer anything the text does not say; if unclear, say so.\n';
function kbLocal_(t) { return /^[A-Z]{1,2}\d{1,2}[LRC]?$/.test(t) || /^\d{1,2}[LRC]?(\/\d{1,2}[LRC]?)?$/.test(t); }   // 机场里的滑行道 / 跑道代号：不当成通用词条

function gemini_(prompt, json, temp) {
  const props = PropertiesService.getScriptProperties(), key = props.getProperty('GEMINI_KEY') || GEMINI_KEY_INLINE;
  if (!key) return { ok: false, error: 'no GEMINI_KEY' };
  const models = [props.getProperty('GEMINI_MODEL') || 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  let last = '';
  for (let m = 0; m < models.length; m++) {
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: temp == null ? 0 : temp } };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[m] + ':generateContent', { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true, payload: JSON.stringify(body) });
    const code = r.getResponseCode();
    if (code !== 200) { last = models[m] + ' ' + code; continue; }
    const d = JSON.parse(r.getContentText()), c = d.candidates && d.candidates[0];
    const out = c && c.content && c.content.parts ? c.content.parts.map(function (p) { return p.text || ''; }).join('').trim() : '';
    if (out) return { ok: true, out: out, model: models[m] };
    last = models[m] + ' empty';
  }
  return { ok: false, error: last };
}
// 原文里的代号（跑道、滑行道、频率、时间…）翻译后必须都还在；滑行道不能变成跑道
function trOk_(src, zh) {
  if (!zh) return false;
  const ids = (String(src).match(/\b(?:\d{2}[LRC]?\/\d{2}[LRC]?|\d{2}[LRC]|[A-Z]{1,2}\d{1,3}|\d{3}\.\d{1,3}|\d{4,})\b/g) || []);
  if (ids.some(function (x) { return zh.indexOf(x) < 0; })) return false;
  const tw = String(src).match(/\b(?:TAXIWAY|TWY|RET)\s+([A-Z]{1,2}\d{0,2})\b/gi) || [];
  return !tw.some(function (x) { const id = x.split(/\s+/).pop(); return new RegExp('(跑道\\s*' + id + '(?![A-Z0-9])|(?<![A-Z0-9/])' + id + '\\s*号?跑道)').test(zh); });
}
function translate_(j) {
  const texts = j.texts.slice(0, 80).map(function (t) { return String(t).slice(0, 4500); }), to = j.to || 'zh-CN';
  const cache = CacheService.getScriptCache(), out = texts.map(function (t) { return cache.get('tr3_' + hash_(t)); });
  const need = []; out.forEach(function (o, i) { if (o == null) need.push(i); });
  for (let k = 0; k < need.length; k += 25) {
    const part = need.slice(k, k + 25);
    const g = gemini_('你是民航翻译。把下面每一条航行通告（NOTAM，缩写已展开成英文）准确翻成简体中文，供机长阅读。' + AVZ_
      + '只翻译，不解释、不增减内容、不改格式。输出 JSON 字符串数组，顺序和条数与输入完全一样。\n输入：\n' + JSON.stringify(part.map(function (i) { return texts[i]; })), true, 0);
    let arr = null; if (g.ok) { try { arr = JSON.parse(g.out); } catch (e) {} }
    part.forEach(function (i, n) {
      let zh = arr && arr.length === part.length ? String(arr[n] || '') : '';
      if (!trOk_(texts[i], zh)) { try { const gg = gemini_('把这条航行通告准确翻成简体中文，只输出译文。' + AVZ_ + '\n' + texts[i], false, 0); zh = gg.ok ? gg.out : ''; } catch (e) { zh = ''; } }
      if (!trOk_(texts[i], zh)) { try { zh = LanguageApp.translate(texts[i], 'en', to); } catch (e) { zh = null; } }
      out[i] = zh;
    });
    // DeepSeek 复核：逐条对照英文原文检查译文；改正的也要通过代号检查才采用
    if (dsKey_()) {
      const rv = deepseek_('You are a senior airline captain checking Chinese translations of NOTAMs. For each pair, check the Chinese against the English source: runway vs taxiway vs rapid exit taxiway, identifiers, times, frequencies, levels, closures/limitations, nothing added or missing. ' + AVE_
        + 'Return JSON {"r":[{"ok":true|false,"zh":"corrected Chinese translation if not ok, else empty","why":"short reason in Chinese if not ok"}]} with exactly one entry per pair, in order.',
        JSON.stringify(part.map(function (i) { return { en: texts[i], zh: out[i] || '' }; })));
      const r = rv.ok && rv.json && rv.json.r;
      if (r && r.length === part.length) part.forEach(function (i, n) {
        const x = r[n] || {}; if (x.ok !== false) return;
        if (x.zh && trOk_(texts[i], x.zh)) out[i] = '【复核修正】' + x.zh + (x.why ? '（' + x.why + '）' : '');
        else out[i] = '⚠️【两个 AI 理解不一致，请看英文原文】' + (out[i] || '') + (x.why ? '（' + dsName_() + '：' + x.why + '）' : '');
      });
    }
    part.forEach(function (i) { if (out[i]) try { cache.put('tr3_' + hash_(texts[i]), out[i], 21600); } catch (e) {} });
  }
  return { ok: true, out: out, v: 3, ds: dsName_() };
}
function ofpBrief_(j) {
  const text = String(j.text || '').slice(0, 400000); if (text.length < 500) return { ok: false, error: 'no OFP text' };
  const win = String(j.win || '').slice(0, 3000), cache = CacheService.getScriptCache(), ck = 'ob4_' + hash_(text + '|' + win); const hit = cache.get(ck);
  if (hit) { const items0 = JSON.parse(hit); if (j.k) briefStore_(j.k, items0); return { ok: true, items: items0, cached: true }; }
  const prompt = 'You are an experienced Boeing 777 captain and dispatcher reviewing a complete Emirates LIDO OFP package (flight plan, weather, NOTAMs, company notes). '
    + 'List the KEY operational impacts for THIS flight that the crew must know: availability of runways, rapid exit taxiways, ILS/approaches and lighting at departure, destination and alternates during the relevant times; weather at departure time, ETA and alternate ETA (thunderstorms, low visibility, strong/gusty crosswind or tailwind, dust, wind shear); en-route airspace restrictions, conflict zones, GNSS interference, ATC contingencies; fuel, weight and MEL/dispatch notes. Ignore trivial items (single stands, minor taxiways far from use, obstacle lights) unless they matter. '
    + AVE_ + AVZ_
    + 'Return JSON: {"items":[{"ph":"dep|enr|arr|altn|gen","lv":"red|amber|info","icao":"ICAO or FIR code or empty","zh":"简体中文一句话","en":"one English sentence","src":"EXACT quote copied character-for-character from the OFP (max 160 characters) that this item is based on"}]}. '
    + 'Maximum 18 items, most important first. Every item MUST have a src that appears verbatim in the OFP; if you cannot quote it, leave the item out.\n'
    + 'TIME RULE (very important): read EVERY NOTAM completely, including its validity period (from/to) and any schedule (e.g. DAILY 2200-0400, EV TUE THU SAT 1130-1430, MON-FRI). Report a NOTAM ONLY if it is in force during the relevant time window of THIS flight listed below (departure airport: around departure; destination: ETA ±1 h; each alternate: its ETA ±1 h; en-route FIRs/routes: while we are in that FIR ±1 h). If it is not in force during that window, leave it out. In each statement say when it applies (UTC).\n'
    + (win ? '=== OUR TIME WINDOWS (UTC) ===\n' + win + '\n' : '') + '=== OFP ===\n' + text;
  const g = gemini_(prompt, true, 0); if (!g.ok) return g;
  let items = []; try { const d = JSON.parse(g.out); items = (d.items || d || []).filter(function (x) { return x && x.zh && x.src; }).slice(0, 18); } catch (e) { return { ok: false, error: 'bad JSON' }; }
  // DeepSeek 复核：每条给它原句前后约 700 字的 OFP 原文，判断结论对不对
  if (dsKey_() && items.length) {
    const U = text.toUpperCase().replace(/\s+/g, ' '), ctx = function (q) { const k = U.indexOf(String(q).toUpperCase().replace(/\s+/g, ' ')); return k < 0 ? '' : U.slice(Math.max(0, k - 350), k + 350); };
    // 每次 6 条（小模型一次看太多会漏）；只报错的那几条
    let got = false;
    for (let k0 = 0; k0 < items.length; k0 += 6) {
      const part = items.slice(k0, k0 + 6);
      const rv = deepseek_('You are a strict senior Boeing 777 captain auditing another AI\'s briefing items from an Emirates LIDO OFP. For EACH item check: does the SOURCE quote and its CONTEXT actually say what the STATEMENT says? '
        + 'Flag the item if the statement adds anything not in the source, names the wrong airport, runway, taxiway, time, day or phase, calls a taxiway / rapid exit taxiway a runway, or exaggerates / understates the impact. ' + AVE_
        + 'Return JSON {"bad":[{"i":item number,"zh":"corrected Chinese sentence","en":"corrected English sentence","why":"short reason in Chinese"}]} listing ONLY the wrong items ("bad":[] if all are correct).',
        part.map(function (x, n) { return 'ITEM ' + n + '\nSTATEMENT: ' + x.zh + ' / ' + x.en + '\nSOURCE: ' + x.src + '\nCONTEXT: ' + ctx(x.src); }).join('\n\n'));
      const bad = rv.ok && rv.json && (rv.json.bad || (rv.json.r && rv.json.r.filter(function (y) { return y && y.ok === false; })));
      if (!Array.isArray(bad)) { part.forEach(function (x) { x.v = 'na'; }); continue; }
      got = true; part.forEach(function (x) { x.v = 'ok'; });
      bad.forEach(function (y) { const x = part[+y.i]; if (!x) return; x.g = { zh: x.zh, en: x.en }; x.why = y.why || ''; if (y.zh) { x.v = 'fix'; x.zh = y.zh; x.en = y.en || x.en; } else x.v = 'dis'; });
    }
  }
  try { cache.put(ck, JSON.stringify(items), 21600); } catch (e) {}
  if (j.k) briefStore_(j.k, items);
  return { ok: true, items: items, model: g.model, ds: dsKey_() ? dsName_() : '' };
}

/* ======== 自动更新：从 GitHub Pages 取最新的 Code.gs，换掉这个文件，建新版本，更新网页部署 ========
   需要：① 在 script.google.com/home/usersettings 打开「Google Apps Script API」；② appsscript.json 里有 script.projects 和 script.deployments 权限。 */
const UPDATE_URL = 'https://chunhua1780.github.io/flight-cloch/apps-script/Code.txt';   // .txt：网站会标明 UTF-8，中文不会变乱码
function autoUpdate_() {
  const pr = PropertiesService.getScriptProperties(), last = +pr.getProperty('upd_check') || 0;
  if (Date.now() - last < 3600e3) return; pr.setProperty('upd_check', String(Date.now()));
  const r = selfUpdate_(false); pr.setProperty('upd_last', JSON.stringify({ t: Date.now(), r: r }).slice(0, 2000));
}
function selfUpdate_(force) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    const g = UrlFetchApp.fetch(UPDATE_URL + '?_=' + Date.now(), { muteHttpExceptions: true });
    if (g.getResponseCode() !== 200) return { ok: false, error: 'GitHub ' + g.getResponseCode() };
    const src = g.getContentText('UTF-8'), m = /const BACKEND_VER = '([^']+)'/.exec(src);
    if (/[\u00c0-\u00ff]{3,}|\ufffd/.test(src) || !/自动更新/.test(src)) return { ok: false, error: 'downloaded code has broken characters' };   // 中文乱码的不要
    if (!m || !/function doPost\(/.test(src) || !/function doGet\(/.test(src) || !/function selfUpdate_\(/.test(src)) return { ok: false, error: 'downloaded code looks wrong' };
    if (m[1] === BACKEND_VER && !force) return { ok: true, same: true, v: BACKEND_VER };
    if (m[1] <= BACKEND_VER && !force) return { ok: true, same: true, v: BACKEND_VER };
    const id = ScriptApp.getScriptId(), H = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, base = 'https://script.googleapis.com/v1/projects/' + id;
    const call = function (method, path, body) {
      const r = UrlFetchApp.fetch(base + path, { method: method, contentType: 'application/json', headers: H, muteHttpExceptions: true, payload: body ? JSON.stringify(body) : undefined });
      const c = r.getResponseCode(); if (c >= 300) throw new Error(method + ' ' + path + ' ' + c + ' ' + r.getContentText().slice(0, 200)); return JSON.parse(r.getContentText() || '{}');
    };
    const cur = call('get', '/content');
    const code = cur.files.find(function (f) { return f.name === 'Code'; }); if (!code) return { ok: false, error: 'no Code file' };
    if (code.source === src) return { ok: true, same: true, v: m[1] };
    code.source = src;
    call('put', '/content', { files: cur.files });
    const ver = call('post', '/versions', { description: 'auto ' + m[1] });
    const deps = (call('get', '/deployments').deployments || []).filter(function (d) { return d.deploymentConfig && d.deploymentConfig.versionNumber && (d.entryPoints || []).some(function (e) { return e.entryPointType === 'WEB_APP'; }); });
    deps.forEach(function (d) { call('put', '/deployments/' + d.deploymentId, { deploymentConfig: { scriptId: id, versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: 'auto ' + m[1] } }); });
    return { ok: true, updated: true, from: BACKEND_VER, to: m[1], version: ver.versionNumber, deployments: deps.length };
  } catch (e) { return { ok: false, error: String(e).slice(0, 300) }; }
  finally { lock.releaseLock(); }
}
// 第一次设置时在编辑器里运行一次（授权 + 测试）
function setupAutoUpdate() {
  const r = selfUpdate_(false);
  Logger.log(JSON.stringify(r));
  return r;
}

/* ======== 第二个 AI（复核 Gemini）。在「项目设置 → 脚本属性」里填其中一个 Key 就行，按这个顺序选：
   ZHIPU_KEY（智谱 GLM，免费）· GROQ_KEY（Groq，免费档）· DEEPSEEK_KEY（DeepSeek，收费）· OPENROUTER_KEY（OpenRouter，免费模型）
   想换模型：脚本属性 REVIEW_MODEL。都没填：只用 Gemini。 ======== */
function reviewer_() {
  const P = PropertiesService.getScriptProperties(), m = P.getProperty('REVIEW_MODEL');
  const L = [
    ['ZHIPU_KEY', '智谱 GLM', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4.5-flash'],
    ['GROQ_KEY', 'Groq', 'https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile'],
    ['DEEPSEEK_KEY', 'DeepSeek', 'https://api.deepseek.com/chat/completions', 'deepseek-chat'],
    ['OPENROUTER_KEY', 'OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', 'deepseek/deepseek-chat:free']
  ];
  for (let i = 0; i < L.length; i++) { const k = P.getProperty(L[i][0]) || (L[i][0] === 'DEEPSEEK_KEY' ? DEEPSEEK_KEY : ''); if (k) return { key: k, name: L[i][1], url: L[i][2], model: m || L[i][3] }; }
  return null;
}
function dsKey_() { return !!reviewer_() && PropertiesService.getScriptProperties().getProperty('REVIEW') === '1'; }   // 第二个 AI 比较慢：脚本属性 REVIEW=1 才用
function dsName_() { const r = reviewer_(); return r ? r.name : ''; }
function deepseek_(system, user) {
  const R = reviewer_(); if (!R) return { ok: false, error: 'no reviewer key' };
  const body = { model: R.model, temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system + ' Output JSON only.' }, { role: 'user', content: user }] };
  try {
    let r = UrlFetchApp.fetch(R.url, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + R.key }, muteHttpExceptions: true, payload: JSON.stringify(body) });
    if (r.getResponseCode() === 400) { delete body.response_format; r = UrlFetchApp.fetch(R.url, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + R.key }, muteHttpExceptions: true, payload: JSON.stringify(body) }); }
    if (r.getResponseCode() !== 200) return { ok: false, error: R.name + ' ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 160) };
    const t = JSON.parse(r.getContentText()).choices[0].message.content; let j = null;
    try { j = JSON.parse(t); } catch (e) { const mm = String(t).match(/\{[\s\S]*\}/); if (mm) try { j = JSON.parse(mm[0]); } catch (x) {} }
    // 有的模型会多包一层 [ {...} ]，或直接给数组：统一成 { r: [...] }
    if (Array.isArray(j)) j = j.length && j[0] && ('i' in j[0]) ? { bad: j } : j.length === 1 && j[0] && typeof j[0] === 'object' && !('ok' in j[0]) ? j[0] : { r: j };
    if (j && !Array.isArray(j) && j.bad && !Array.isArray(j.bad)) j.bad = [j.bad];
    return { ok: !!j, json: j, raw: t, name: R.name };
  } catch (e) { return { ok: false, error: String(e).slice(0, 200) }; }
}

/* ======== 云端 OFP（GitHub 私有仓库 flight-box/ofpdata，不公开）========
   哪台设备先读出 OFP 就上传原文；另一台有网时直接下载原文（不用再下 PDF、再慢慢解析）。AI 解读结果也存一份。 */
function cloudIdx_() {
  const cur = gh_('get', 'ofpdata/index.json'); let idx = [], sha = null;
  if (cur && cur.code === 200 && cur.j) { sha = cur.j.sha; try { idx = JSON.parse(Utilities.newBlob(Utilities.base64Decode(cur.j.content)).getDataAsString('UTF-8')); } catch (e) { idx = []; } }
  return { idx: idx, sha: sha };
}
function cloudIdxSave_(c, upd) {
  const now = Date.now(); let idx = c.idx.filter(function (x) { return now - (x.t || 0) < 30 * 864e5; });
  const i = idx.findIndex(function (x) { return x.k === upd.k; }); if (i >= 0) idx[i] = Object.assign(idx[i], upd); else idx.push(upd);
  const body = { message: 'index', content: Utilities.base64Encode(JSON.stringify(idx), Utilities.Charset.UTF_8) }; if (c.sha) body.sha = c.sha;
  const r = gh_('put', 'ofpdata/index.json', body);
  if (r && r.code === 409) { const c2 = cloudIdx_(); return cloudIdxSave_({ idx: c2.idx, sha: c2.sha }, upd); }   // 同时有人改：重读再写
  return r;
}
function ghPut_(path, b64, msg) { const cur = gh_('get', path); const body = { message: msg, content: b64 }; if (cur && cur.code === 200 && cur.j && cur.j.sha) body.sha = cur.j.sha; return gh_('put', path, body); }
function ofpSave_(j) {
  const k = String(j.k || '').replace(/[^\w.-]/g, ''); if (!k || !j.text || String(j.text).length < 1000) return { ok: false, error: 'no data' };
  if (!(PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') || GITHUB_TOKEN_INLINE)) return { ok: false, error: 'no GITHUB_TOKEN' };
  const gz = Utilities.gzip(Utilities.newBlob(String(j.text), 'text/plain', k + '.txt'));
  const r = ghPut_('ofpdata/' + k + '.txt.gz', Utilities.base64Encode(gz.getBytes()), 'ofp ' + k);
  if (!r || (r.code !== 200 && r.code !== 201)) return { ok: false, error: 'GitHub ' + (r && r.code) };
  cloudIdxSave_(cloudIdx_(), { k: k, meta: j.meta || {}, t: Date.now(), len: String(j.text).length });
  return { ok: true, k: k };
}
function briefStore_(k, items) {
  try { k = String(k).replace(/[^\w.-]/g, ''); if (!k) return;
    ghPut_('ofpdata/' + k + '.brief.json', Utilities.base64Encode(JSON.stringify({ t: Date.now(), items: items }), Utilities.Charset.UTF_8), 'brief ' + k);
    cloudIdxSave_(cloudIdx_(), { k: k, brief: Date.now() }); } catch (e) {}
}

