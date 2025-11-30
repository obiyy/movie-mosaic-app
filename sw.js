const CACHE_NAME = 'face-mosaic-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icon.png',
    'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
