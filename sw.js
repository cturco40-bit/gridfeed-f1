self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'New draft ready for review',
    icon: data.icon || '/favicon.png',
    badge: data.badge || '/favicon.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/gf-admin-drafts' },
    actions: [
      { action: 'review', title: 'Review Draft' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'GridFeed', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/gf-admin-drafts';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes('gf-admin-drafts') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('https://gridfeed.co' + url);
    })
  );
});
