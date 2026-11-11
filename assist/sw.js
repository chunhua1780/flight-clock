/* 飞行助手离线缓存：第一次联网打开时把所有文件存下来，之后没网也能用 */
const CACHE = 'fa-v2';
const FILES = ['./', 'index.html', 'ofp.js', 'wx.js', 'manifest.json', 'data/airports.json', 'data/countries.json',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/topojson-client.min.js',
  '../vendor/leaflet/leaflet.js', '../vendor/leaflet/leaflet.css', '../icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// 先用缓存（离线也快），同时在后台更新缓存
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
