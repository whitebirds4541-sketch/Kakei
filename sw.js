// オフラインでも開けるようにするための最小限のService Worker
const CACHE = 'kakei-v2';
const FILES = ['./', 'index.html', 'style.css', 'parser.js', 'app.js', 'pdfimport.js', 'vendor/pdf-lib.min.js', 'vendor/glyphs.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // ネット優先、失敗したらキャッシュ(更新がすぐ反映されるように)
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
