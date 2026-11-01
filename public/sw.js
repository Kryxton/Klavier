// Instant start and offline: the app (one HTML file) and its images come from the cache right away
// and are refreshed in the background. When a newer app version arrives, open pages are told so
// they can offer a reload. The piano samples live on another address and never change: they get a
// cache of their own on first use, or the app would be silent offline.
const CACHE = 'klavier-v1'; // bump when cached files like the icons change
const SOUNDS = 'klavier-sounds-v1';
const SAMPLES = 'https://tonejs.github.io/audio/salamander/';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon-32.png', '/favicon-64.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SOUNDS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const notifyUpdate = async () => {
  const windows = await self.clients.matchAll({ type: 'window' });
  windows.forEach(w => w.postMessage({ type: 'update-available' }));
};

// Every address is the same index.html: show the cached copy right away, fetch the current one in
// the background and store it for the next start
const handleNavigation = event => {
  const cachedP = caches.open(CACHE).then(cache => cache.match('/'));
  const networkP = fetch(event.request);
  // The page gets copies: the originals are read below to compare and store (a body can only be read once)
  event.respondWith(cachedP.then(cached => (cached ? cached.clone() : networkP.then(r => r.clone()))));
  event.waitUntil(
    Promise.all([cachedP, networkP])
      .then(async ([cached, response]) => {
        if (!response.ok) return;
        const fresh = await response.clone().text();
        const old = cached ? await cached.text() : null;
        await (await caches.open(CACHE)).put('/', response.clone());
        if (old !== null && old !== fresh) await notifyUpdate();
      })
      .catch(() => {}) // offline: the cached app is all there is
  );
};

// Images, icons, manifest, samples: cache first, fill the cache on first use
const handleAsset = async (request, name) => {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
};

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.href.startsWith(SAMPLES)) return event.respondWith(handleAsset(request, SOUNDS));
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') handleNavigation(event);
  else event.respondWith(handleAsset(request, CACHE));
});
