const CACHE_NAME = 'qore-cache-v1';
const assets = [
  '/',
  '/index.html',
  '/style.css',
  '/client.js',
  '/manifest.json'
];

// Kurulum ve Dosyaları Önbelleğe Alma
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assets);
    })
  );
});

// Çevrimdışı Mod Desteği
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
