// Basit önbellek: uygulama kabuğu çevrimdışı da açılsın; veri her zaman canlı alınır.
const AD = 'sb-kokpit-v3';
const FN = 'https://yajzvvvygskkhbvxghrc.supabase.co/functions/v1/push';
const IKON = 'https://soforbey.com/static/img/ikon.png';

// Telefon bildirimi: itme içeriksiz gelir, metin buluttan (yalnızca kayıtlı aboneye) okunur
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let metin = 'Şoför Bey: yeni uyarı var';
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch(FN + '?islem=son&e=' + encodeURIComponent(sub.endpoint), { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); if (j.metin) metin = j.metin; }
      }
    } catch (x) { /* genel metinle göster */ }
    const satir = metin.split('\n').filter(Boolean);
    await self.registration.showNotification((satir[0] || 'Şoför Bey').slice(0, 90), {
      body: (satir.slice(1).join('\n') || 'Kokpit\'i açmak için dokun').slice(0, 240),
      icon: IKON, badge: IKON, tag: 'sb-kokpit', renotify: true, requireInteraction: true
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => {
    const acik = l.find((c) => c.url.includes('/kokpit'));
    return acik ? acik.focus() : self.clients.openWindow('./');
  }));
});
const KABUK = ['./', 'index.html', 'app.js', 'config.js', 'manifest.webmanifest',
  'kutuphane/leaflet.markercluster-1.5.3.js', 'kutuphane/MarkerCluster-1.5.3.css', 'kutuphane/chart-4.6.1.umd.min.js',
  'kutuphane/dayjs-1.11.23.min.js', 'kutuphane/dayjs-1.11.23-relativeTime.js', 'kutuphane/dayjs-1.11.23-tr.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(AD).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== AD).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // bulut istekleri önbelleğe alınmaz
  // Önce ağ (güncel sürüm), ağ yoksa önbellek
  // cache: 'no-cache' → tarayıcının HTTP önbelleğine güvenme, sunucuya sor (yeni sürüm hemen gelsin)
  // Sunucu hata verirse (GitHub kesintisi gibi) önbellekteki son sağlam sürümü göster; hata sayfası saklanmaz
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const kopya = r.clone(); caches.open(AD).then((c) => c.put(e.request, kopya)); return r; }
    return caches.match(e.request).then((k) => k || r);
  }).catch(() => caches.match(e.request)));
});
