/* Service Worker: la app funciona 100% offline tras la primera visita (PWA). */
const CACHE = 'texplant-v1';
const FILES = ['./', 'index.html', 'css/styles.css', 'js/processing.js', 'js/preview3d.js', 'js/export.js', 'js/app.js', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
