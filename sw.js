const APP_VERSION = 'v1.0.5';
const CACHE_NAME = 'expense-' + APP_VERSION;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './images/logo.png',
  './images/rotate.png',
  './images/setting-lines.png',
  './images/image-gallery.png'
];

// Install: cache core assets, activate immediately
self.addEventListener('install', e => {
  console.log('[SW] Install:', APP_VERSION);
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches, claim clients
self.addEventListener('activate', e => {
  console.log('[SW] Activate:', APP_VERSION);
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first, fallback to cache
self.addEventListener('fetch', e => {
  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Respond with version when asked
self.addEventListener('message', e => {
  if (e.data === 'GET_VERSION') {
    e.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});
