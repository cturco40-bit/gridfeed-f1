const CACHE_NAME = 'gridfeed-v19';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS).catch(() => {})))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // API calls: network only
  if (url.hostname.includes('supabase.co') || url.hostname.includes('openf1.org') || url.hostname.includes('jolpi.ca')) {
    event.respondWith(fetch(event.request).catch(() => new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  // Static: cache first, network fallback
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
    if (res.ok && event.request.method === 'GET') {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match('/'))));
});

// Push notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'GridFeed', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'gridfeed-' + Date.now(),
      data: { url: data.url || 'https://gridfeed.co' },
      vibrate: [200, 100, 200],
      actions: data.actions || [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || 'https://gridfeed.co';
  const fullUrl = url.startsWith('http') ? url : 'https://gridfeed.co' + url;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('gridfeed.co') && 'focus' in c) {
          c.navigate(fullUrl);
          return c.focus();
        }
      }
      return clients.openWindow(fullUrl);
    })
  );
});
