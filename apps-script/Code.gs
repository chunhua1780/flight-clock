/**
 * Flight Clock — Google Apps Script 后端
 *
 * 作用：
 *   1. ?action=flights          读取 Google 日历里的排班，返回航班列表（JSON）
 *   2. ?action=track&cs=UAE9876  服务器端查询 ADS-B 实时位置（浏览器直连会被 CORS 拦），
 *                               并把轨迹点缓存起来，页面就能画出完整轨迹
 *
 * 部署：扩展程序 → Apps Script → 粘贴本文件 → 部署 → 新建部署 → 类型「网页应用」
 *       执行身份：我；谁可以访问：任何人 → 复制 /exec 结尾的网址，填进网页设置里。
 */

// ======== 配置 ========
// 排班所在的日历。'primary' = 你的默认日历；
// 如果排班导入到了单独的日历，在 Google 日历 → 该日历设置 → 「集成日历」里找到「日历 ID」填进来。
// 可以写多个：['primary', 'xxxx@group.calendar.google.com']
const CALENDAR_IDS = ['primary'];

// 可选的访问口令。填了之后，网页设置里的 Token 也要填一样的。留空 = 不检查。
const TOKEN = '';

// 读取范围：过去几天 ~ 未来几天
const DAYS_BACK = 4;
const DAYS_AHEAD = 60;

// 只返回「像航班」的日程（标题里有两个三字码，如 89876-CAN-DWC / EK302 DXB-PVG），
// 避免把私人日程暴露到公开网址上。
const FLIGHT_TITLE = /\b[A-Z]{3}\s*(?:-|–|—|\/|>|→|\s)\s*[A-Z]{3}\b/;

// ADS-B 数据源（按顺序尝试）
const ADSB_SOURCES = [
  'https://api.adsb.lol/v2/callsign/',
  'https://opendata.adsb.fi/api/v2/callsign/',
];

// ======== 入口 ========
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (TOKEN && p.token !== TOKEN) return out_({ ok: false, error: 'unauthorized' });
  try {
    if (p.action === 'track') return out_(track_(p.cs));
    return out_(flights_());
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ======== 航班 ========
function flights_() {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 864e5);
  const to = new Date(now.getTime() + DAYS_AHEAD * 864e5);
  const list = [];
  const seen = {};

  CALENDAR_IDS.forEach(function (id) {
    const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (!cal) return;
    cal.getEvents(from, to).forEach(function (ev) {
      if (ev.isAllDayEvent()) return;
      const title = (ev.getTitle() || '').trim();
      const upper = title.toUpperCase();
      if (!FLIGHT_TITLE.test(upper)) return;
      const start = ev.getStartTime().toISOString();
      const key = upper + '|' + start;
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
  return { ok: true, version: 2, generated: now.toISOString(), flights: list };
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

// ======== 实时位置 + 轨迹缓存 ========
function track_(cs) {
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
      t: Date.now(),
    };
    const last = trail[trail.length - 1];
    // 新航班（距上一个点超过 3 小时）就清空旧轨迹
    if (last && pos.t - last[3] > 3 * 3600e3) trail = [];
    if (!last || Math.abs(last[0] - pos.lat) > 0.005 || Math.abs(last[1] - pos.lon) > 0.005) {
      trail.push([+pos.lat.toFixed(4), +pos.lon.toFixed(4), pos.alt || 0, pos.t]);
      if (trail.length > 900) trail = trail.filter(function (_, i) { return i % 2 === 0 || i > trail.length - 100; });
      cache.put(key, JSON.stringify(trail), 21600);
    }
  }
  return { ok: true, callsign: cs, found: !!pos, source: source, pos: pos, trail: trail };
}

// 在编辑器里点「运行」测试，看「执行记录」里的输出
function test() {
  Logger.log(JSON.stringify(flights_(), null, 2));
}
