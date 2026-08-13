const CACHE = 'eem-sanal-lab-stable-v13';

const SHELL = [
  './',
  'index.html',
  'assets/css/styles.css',
  'assets/js/app.js?v=13',
  'data/catalog.json',
  'assets/images/icon.svg',
  'assets/images/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname.toLowerCase();
  const isCatalog = path.endsWith('/data/catalog.json');
  const isGLB = path.endsWith('.glb');
  const isUSDZ = path.endsWith('.usdz');

  // Büyük 3B model dosyaları Cache Storage'a kopyalanmaz.
  if (isGLB || isUSDZ) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Katalog güncel olmalı.
  if (isCatalog) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Poster ve diğer statik kaynaklar cache-first.
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached ||
      fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
    )
  );
});
