/* Echoes of Echoria service worker.
   Stale-while-revalidate for the game itself: repeat visits open instantly
   from the cached copy while a fresh build downloads in the background.
   When the background refresh lands a NEWER build (Last-Modified moved),
   open pages get an ECHORIA_UPDATE_READY message and show a
   "new version available — reload" prompt. Cache-first only for the
   install assets (icons + manifest), and Supabase save traffic always
   goes straight to the network, never the cache. */
const CACHE_NAME = 'echoria-pwa-v2';
const INSTALL_ASSETS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
  'icons/icon-maskable-512.png',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(INSTALL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Supabase (account saves, gift codes): never cache, always network.
  if (url.hostname.indexOf('supabase.co') !== -1) return;

  const isNavigation = event.request.mode === 'navigate';
  const isIndex = url.pathname === '/Echos-/' || url.pathname.endsWith('/index.html');
  const isInstallAsset = INSTALL_ASSETS.some((a) => url.pathname.endsWith('/' + a));

  if (isNavigation || isIndex) {
    // Stale-while-revalidate: serve the cached copy at once; refresh it
    // in the background. First visit has no cache, so the network wins.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              return cache.match(event.request).then((old) => {
                const oldStamp = old ? old.headers.get('last-modified') : null;
                const newStamp = res.headers.get('last-modified');
                return cache.put(event.request, copy).then(() => {
                  // A newer build landed (and one was already cached):
                  // tell open pages a reload is waiting.
                  if (old && oldStamp && newStamp && oldStamp !== newStamp) {
                    return self.clients.matchAll({ type: 'window' }).then((clients) => {
                      clients.forEach((client) => client.postMessage({ type: 'ECHORIA_UPDATE_READY' }));
                    });
                  }
                });
              });
            }).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (isInstallAsset) {
    // Cache-first: icons and manifest rarely change.
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Everything else (fonts, etc.): straight to the network, no caching.
});
