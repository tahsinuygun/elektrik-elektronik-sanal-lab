const CACHE = 'eem-sanal-lab-clean-v21';

self.addEventListener('install', () => {
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
  if (url.origin !== self.location.origin) return;

  const path = url.pathname.toLowerCase();
  const isModel = path.endsWith('.glb') || path.endsWith('.usdz');

  // 3B dosyaları SW cache'ine alınmaz; normal browser cache kullanılabilir.
  if (isModel) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isFreshCode =
    event.request.mode === 'navigate' ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('/data/catalog.json');

  if (isFreshCode) {
    event.respondWith(
      fetch(event.request, {cache:'no-store'})
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request));
});
