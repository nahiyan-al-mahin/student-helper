// =====================================================================
//  Service worker: makes the website installable as an app (PWA) and
//  lets the pages open quickly / offline. API calls (/api/...) are NEVER
//  cached, so data is always fresh from the server.
//  Change VERSION when you want every phone to drop its old copy.
// =====================================================================
const VERSION = 'sh-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([
    '/', '/app/today.html', '/css/style.css', '/js/config.js', '/js/icons.js', '/js/api.js', '/js/shell.js',
    '/img/logo.svg', '/img/icons/icon-192.png',
  ])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Pages, CSS and JS: show the saved copy at once, and fetch a fresh one in the background.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const saved = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => saved);
    return saved || fresh;
  }));
});

// Tapping an alarm notification opens (or focuses) the Today page
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const open = list.find((c) => c.url.includes('/app/'));
    return open ? open.focus() : self.clients.openWindow('/app/today.html');
  }));
});
