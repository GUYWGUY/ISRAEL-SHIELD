// Israel Shield - Service Worker
const CACHE_NAME = 'israel-shield-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Check if it's a request for our assets or a navigation request
  if (event.request.mode === 'navigate' || ASSETS_TO_CACHE.some(asset => event.request.url.includes(asset))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});

