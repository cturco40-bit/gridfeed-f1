const CACHE_NAME = 'gridfeed-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS).catch(() => {})));
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
