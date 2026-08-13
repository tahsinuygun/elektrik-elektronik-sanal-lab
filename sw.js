const CACHE = 'eem-sanal-lab-clean-v20';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Harici CDN kaynaklarına dokunma.
  if (url.origin !== self.location.origin) return;

  const path = url.pathname.toLowerCase();
  const isModel = path.endsWith('.glb') || path.endsWith('.usdz');

  // Büyük 3B modelleri Service Worker cache'ine alma.
  if (isModel) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML / JS / CSS / catalog daima ağdan güncel gelsin.
  const isFreshCode =
    event.request.mode === 'navigate' ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('/data/catalog.json');

  if (isFreshCode) {
    event.respondWith(
      fetch(event.request, {cache: 'no-store'})
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Küçük statik dosyalar normal ağ isteğiyle gelsin.
  event.respondWith(fetch(event.request));
});
