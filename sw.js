// Basit önbellek: uygulama kabuğu çevrimdışı da açılsın; veri her zaman canlı alınır.
const AD = 'sb-kokpit-v1';
const KABUK = ['./', 'index.html', 'app.js', 'config.js', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(AD).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== AD).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // bulut istekleri önbelleğe alınmaz
  // Önce ağ (güncel sürüm), ağ yoksa önbellek
  e.respondWith(fetch(e.request).then((r) => {
    const kopya = r.clone();
    caches.open(AD).then((c) => c.put(e.request, kopya));
    return r;
  }).catch(() => caches.match(e.request)));
});
