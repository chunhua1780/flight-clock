/**
 * Flight backend — loader (paste this ONCE into the "Code" file, replacing everything there).
 * The real program is downloaded from your website on every run (kept in cache for 1 hour),
 * so the backend is always up to date: no more pasting code, no Apps Script API, no redeploying.
 * Your passwords and keys stay in the separate file Secrets.gs — this loader never touches them.
 */
var LOADER_URL = 'https://chunhua1780.github.io/flight-cloch/apps-script/Code.txt';
var LOADER_VER = 1;
var __APP = null;

function app_() {
  if (__APP) return __APP;
  var c = CacheService.getScriptCache(), src = null, t = +(c.get('src_t') || 0), n = +(c.get('src_n') || 0);
  if (n) { var ks = []; for (var i = 0; i < n; i++) ks.push('src_' + i); var got = c.getAll(ks), parts = [];
    for (var i = 0; i < n; i++) { if (got['src_' + i] == null) { parts = null; break; } parts.push(got['src_' + i]); }
    if (parts) src = parts.join(''); }
  if (!src || Date.now() - t > 3600e3) {   // older than 1 hour: fetch the newest version (keep the old one if the website can't be reached)
    try {
      var r = UrlFetchApp.fetch(LOADER_URL + '?_=' + Date.now(), { muteHttpExceptions: true });
      var s = r.getResponseCode() === 200 ? r.getContentText('UTF-8') : '';
      if (/function doPost\(/.test(s) && /function doGet\(/.test(s) && /自动更新/.test(s) && !/�/.test(s)) {
        src = s; var m = {}, k = 0; for (var p = 0; p < s.length; p += 30000) m['src_' + (k++)] = s.slice(p, p + 30000);
        m.src_n = String(k); m.src_t = String(Date.now()); c.putAll(m, 21600);
      }
    } catch (e) { }
  }
  if (!src) throw new Error('Cannot load the backend program from ' + LOADER_URL);
  globalThis.__LOADER = LOADER_VER;
  __APP = new Function(src + '\n;return { doGet: doGet, doPost: doPost, poll: poll, setup: setup, setupLogbook: setupLogbook, setupAutoUpdate: setupAutoUpdate };')();
  return __APP;
}
function doGet(e) { return app_().doGet(e); }
function doPost(e) { return app_().doPost(e); }
function poll() { return app_().poll(); }
function setup() { return app_().setup(); }
function setupLogbook() { return app_().setupLogbook(); }
/** Run this once after pasting: it loads the program and shows which version is running. */
function setupAutoUpdate() { CacheService.getScriptCache().remove('src_n'); __APP = null; var a = app_(); Logger.log('✅ 后台已连上网站，自动更新：' + LOADER_URL); return a.setupAutoUpdate(); }
