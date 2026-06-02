const CACHE_NAME = 'qore-cache-v1';
const assets = [
  '/',
  '/style.css',
  '/client.js',
  '/manifest.json',
  '/foto.png'
];

// Kurulum ve Dosyaları Önbelleğe Alma
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assets);
    }).then(() => self.skipWaiting()) // Yeni versiyonu anında devreye al
  );
});

// Aktivasyon
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Çevrimdışı Mod Desteği
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
