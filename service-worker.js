const CACHE_NAME = 'cryptkeeper-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './crypto.js',
  './app.js',
  './manifest.json',
  './icon.png'
];

// Install Service Worker and Cache Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event (Cleanup Old Caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Request Interception
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached asset if exists, otherwise load from network
      return cachedResponse || fetch(event.request);
    })
  );
});
