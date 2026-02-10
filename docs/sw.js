// SportSync Service Worker - Controls caching to ensure fresh data
const CACHE_NAME = 'sportsync-v14-editorial';
const DATA_FILES = [
    '/SportSync/data/events.json',
    '/SportSync/data/featured.json',
    '/SportSync/data/football.json',
    '/SportSync/data/golf.json',
    '/SportSync/data/tennis.json',
    '/SportSync/data/f1.json',
    '/SportSync/data/chess.json',
    '/SportSync/data/esports.json',
    '/SportSync/data/meta.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/SportSync/',
                '/SportSync/index.html',
                '/SportSync/js/sport-config.js',
                '/SportSync/js/asset-maps.js',
                '/SportSync/js/sports-api.js',
                '/SportSync/js/preferences-manager.js',
                '/SportSync/js/dashboard.js',
                '/SportSync/js/dashboard-helpers.js'
            ]);
        })
    );
    self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Take control immediately
});

// Fetch event - control caching strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Always fetch data files fresh (no cache)
    if (DATA_FILES.some(dataFile => url.pathname.includes(dataFile.replace('/SportSync', '')))) {
        event.respondWith(
            fetch(event.request, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }).catch(() => {
                return new Response('{"error": "Network unavailable"}', {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // For other requests, use cache-first strategy
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }

            return fetch(event.request).then((response) => {
                // Don't cache non-successful responses
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // Clone response for caching
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            });
        })
    );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_DATA_CACHE') {
        // Clear any cached data files
        caches.open(CACHE_NAME).then((cache) => {
            DATA_FILES.forEach(dataFile => {
                cache.delete(dataFile);
            });
        });
    }
});
