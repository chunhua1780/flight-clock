/* 飞行助手离线缓存
   · 有网络：每次打开都检查新版本；有新版本就把所有文件下载好、删掉旧版本，然后自动换成新版本
   · 没网络：完全用 iPad 上存好的文件 */
const CACHE = 'fa-v51';
const FILES = ['./', 'index.html', 'ofp.js', 'wx.js', 'ekparse.js', 'brief.js', 'notamx.js', 'decode.js', 'ompack.js', 'logbook.js', 'ofplib.js', 'docread.js', 'rmate.js', 'fir.json', 'manifest.json', 'data/airports.json', 'data/countries.json',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/topojson-client.min.js',
  '../vendor/leaflet/leaflet.js', '../vendor/leaflet/leaflet.css', '../icon-180.png'];
const fill = name => caches.open(name).then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return c.put(f, r); }))));
// 新版本：全部下载好以后立即接管
self.addEventListener('install', e => { e.waitUntil(fill(CACHE).then(() => self.skipWaiting())); });
// 接管后删掉所有旧版本，并让打开着的页面换成新版本
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(cs => cs.forEach(c => { try { c.postMessage('updated'); if (c.navigate) c.navigate(c.url).catch(() => {}); } catch (x) {} })));
});
self.addEventListener('message', e => {
  if (e.data === 'skip') self.skipWaiting();
  if (e.data === 'refresh') e.waitUntil(fill(CACHE).then(() => e.source && e.source.postMessage('refreshed')).catch(err => e.source && e.source.postMessage('refresh-failed:' + err.message)));
});
// 先用缓存（离线可用）；缓存里没有的才上网拿
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r;
  }));
});
