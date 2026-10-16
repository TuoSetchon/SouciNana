// BonPro — service worker : interface disponible hors ligne + notifications
const CACHE = 'bonpro-v2';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/logo.svg', '/offline.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // réseau d'abord, cache en secours (l'application reste à jour)
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/index.html').then((i) => i || caches.match('/offline.html')) : undefined)))
  );
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'BonPro', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'BonPro', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', data: { link: d.link || '#/notifications' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = '/' + (e.notification.data && e.notification.data.link || '#/notifications');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
