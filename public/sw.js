// Service Worker (sw.js)

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installed');
  // Pre-cache essential assets if needed, but for this chat app, we'll focus on push notifications.
  // event.waitUntil(
  //   caches.open('my-pwa-cache').then(cache => {
  //     return cache.addAll([
  //       '/',
  //       '/index.html',
  //       '/styles.css', // If you have a separate CSS file
  //       '/app.js'     // If you have a separate JS file
  //     ]);
  //   })
  // );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated');
  // Clean up old caches if necessary
  event.waitUntil(clients.claim()); // Become the active service worker
});

// Listen for push events
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');

  const data = event.data ? JSON.parse(event.data.text()) : {};
  const title = data.title || 'Yeni Mesaj Var!';
  const message = data.message || 'Bilinmiyor';
  const options = {
    body: message,
    icon: '/icon-192x192.png', // Ensure you have these icons in your public folder
    badge: '/badge-icon.png', // Optional badge icon
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Optional: Listen for notification clicks
self.addEventListener('notificationclick', (event) => {
  const clickedNotification = event.notification;
  clickedNotification.close();

  console.log('Notification clicked:', clickedNotification.title);

  // Open the app and navigate to the chat if it's not already open
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url && client.url.includes('/#/' || '/index.html')) { // Adjust URL if needed
          client.focus();
          return;
        }
      }
      // If no client is open, open a new one
      if (clickedNotification.data && clickedNotification.data.url) {
          return clients.openWindow(clickedNotification.data.url);
      } else {
          return clients.openWindow('/'); // Default to homepage
      }
    })
  );
});
