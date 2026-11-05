// Driftwood Dock service worker: cache-first for same-origin GET requests, so the game
// works offline after the first visit. Bump VERSION to drop old caches on the next load.
const VERSION = 'driftwood-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon-192.png']))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Pages: network first (so updates arrive), falling back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')).then((r) => r || Response.error())),
    );
    return;
  }
  // Assets: cache first, then network (and remember it).
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});
