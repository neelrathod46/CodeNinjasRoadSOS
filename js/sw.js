const CACHE_NAME = 'crashsafe-cache-v1';
const ASSETS_TO_CACHE = [
  'index.html',
  'css/styles.css',
  'js/storage.js',
  'js/geolocation.js',
  'js/crash-detection.js',
  'js/nearby-services.js',
  'js/app.js',
  'manifest.json'
];

// Perform install setup and cache fundamental asset requirements
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Clear out stale variations of old cache configurations
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-falling-back-to-cache standard approach strategy
self.addEventListener('fetch', (event) => {
  // Only handle standard local requests (ignore external analytics, maps API, etc.)
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If request succeeds, refresh stored cache clone copy dynamically
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback state management matching
          return caches.match(event.request);
        })
    );
  }
});