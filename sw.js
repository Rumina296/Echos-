/* Echoes of Echoria service worker.
   Network-first for the game itself (new builds must always land fresh),
   cache-first only for the install assets (icons + manifest), and Supabase
   save traffic always goes straight to the network, never the cache. */
const CACHE_NAME = 'echoria-pwa-v1';
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
    // Network-first: a fresh build must win; fall back to cache only offline.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request))
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
