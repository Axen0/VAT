/**
 * VAT Web Service Worker.
 * - Caches the app shell for fast startup.
 * - Holds a Web Lock during downloads to reduce background tab throttling.
 */

const CACHE_NAME = 'vat-web-v1';
const APP_SHELL = ['/', '/index.html', '/src/main.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // HTML: network first, fallback to cache
  if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Web Locks integration: hold a shared lock while a download is active
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'ACQUIRE_LOCK') return;

  const lockName = data.lockName || 'download-lock';
  const duration = data.duration || 60000;

  if (navigator.locks) {
    navigator.locks.request(lockName, { mode: 'shared' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, duration));
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ locked: true });
    });
  } else if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({ locked: false, error: 'Web Locks not supported' });
  }
});