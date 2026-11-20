/* 飞行助手离线缓存
   · 有网络：每次打开都检查新版本；有新版本就把所有文件下载好、删掉旧版本，然后自动换成新版本
   · 没网络：完全用 iPad 上存好的文件 */
const CACHE = 'fa-v99';
const FILES = ['./', 'index.html', 'ofp.js', 'demotrip.js', 'vendor/qrcode.js', 'panelqr.js', 'wx.js', 'live.js', 'wac.js', 'aibrief.js', 'cloud.js', 'ivdb.js', 'data/iv.enc.json', 'ekparse.js', 'brief.js', 'notamx.js', 'decode.js', 'ompack.js', 'logbook.js', 'ofplib.js', 'cbtl.js', 'docread.js', 'rmate.js', 'fir.json', 'fi.html', 'data.html', 'manifest.json', 'data/airports.json', 'data/countries.json',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/topojson-client.min.js',
  '../vendor/leaflet/leaflet.js', '../vendor/leaflet/leaflet.css', '../icon-180.png'];
// 一个一个存：某个文件一时下载失败，其他文件照样存好（以前一个失败就整个不存，离线时地图、航路都出不来）；失败的再试两次
const CORE = ['./', 'index.html', 'ofp.js', 'data/countries.json', 'data/airports.json', '../vendor/leaflet/leaflet.js', '../vendor/leaflet/leaflet.css', 'vendor/topojson-client.min.js', 'fir.json'];
const get1 = (c, f, n) => fetch(new Request(f, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return c.put(f, r); }).catch(e => n > 0 ? new Promise(ok => setTimeout(ok, 1500)).then(() => get1(c, f, n - 1)) : Promise.reject(e));
const fill = name => caches.open(name).then(c => Promise.allSettled(FILES.map(f => get1(c, f, 2))).then(rs => { const bad = FILES.filter((f, i) => rs[i].status === 'rejected'); if (bad.some(f => CORE.includes(f))) throw new Error('missing ' + bad.join(', ')); }));
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
