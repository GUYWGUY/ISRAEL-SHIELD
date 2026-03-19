// Israel Shield - Service Worker (minimal, for PWA install prompt only)
const CACHE_NAME = 'israel-shield-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Network-first strategy: always try network, fallback to cache
self.addEventListener('fetch', (event) => {
  // Only handle same-origin and navigation requests for caching
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
  }
});
