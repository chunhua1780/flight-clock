/* 飞行助手离线缓存：完全离线。只有在页面上按「⟳ 更新」（有网络时）才会重新下载。 */
const CACHE = 'fa-v7';
const FILES = ['./', 'index.html', 'ofp.js', 'wx.js', 'ekparse.js', 'brief.js', 'manifest.json', 'data/airports.json', 'data/countries.json',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/topojson-client.min.js',
  '../vendor/leaflet/leaflet.js', '../vendor/leaflet/leaflet.css', '../icon-180.png'];
const fill = name => caches.open(name).then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return c.put(f, r); }))));
// 新版本先在后台下载好，但不自己接管；等用户按「更新」
self.addEventListener('install', e => { e.waitUntil(fill(CACHE)); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => {
  if (e.data === 'skip') self.skipWaiting();
  if (e.data === 'refresh') e.waitUntil(fill(CACHE).then(() => e.source && e.source.postMessage('refreshed')).catch(err => e.source && e.source.postMessage('refresh-failed:' + err.message)));
});
// 只用缓存；缓存里没有的才上网拿（第一次打开时）
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r;
  }));
});
