/**
 * MuaSamMini - Service Worker
 * Provides offline app-shell caching with subpath-safe relative paths.
 * Never caches or transmits user list data.
 */

const CACHE_NAME = 'muasammini-shell-v1';
const CACHE_PREFIX = 'muasammini-shell-';

// Static assets forming the offline app shell
// All paths are relative to ensure portability across root and subpath deployments (e.g. GitHub Pages)
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only process GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Only handle requests to the same origin
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).catch(async () => {
        // Fallback for HTML navigations if offline
        if (event.request.mode === 'navigate') {
          const indexFallback = await caches.match('./index.html');
          if (indexFallback) return indexFallback;
          const rootFallback = await caches.match('./');
          if (rootFallback) return rootFallback;
        }

        // Return a valid offline Response instead of undefined
        return new Response('Offline - Nội dung không khả dụng', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain; charset=utf-8'
          })
        });
      });
    })
  );
});
