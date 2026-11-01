// Service worker della versione dimostrativa: serve solo a installare l'app sul telefono
// e ad aprirla anche senza rete con l'ultima copia scaricata. Niente notifiche push.
const CACHE = 'turni-demo-v2';
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(
    ['./', './index.html', './demo-firebase.js', './demo-data.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png']
      .map((u) => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// Prima Internet, senza rete la copia
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
