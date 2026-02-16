// SportSync Service Worker - Controls caching to ensure fresh data
const CACHE_NAME = 'sportsync-v26';
const DATA_FILES = [
    '/SportSync/data/events.json',
    '/SportSync/data/featured.json',
    '/SportSync/data/watch-plan.json',
    '/SportSync/data/insights.json',
    '/SportSync/data/standings.json',
    '/SportSync/data/rss-digest.json',
    '/SportSync/data/meta.json',
    '/SportSync/data/autonomy-report.json',
    '/SportSync/data/health-report.json',
    '/SportSync/data/autopilot-log.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/SportSync/',
                '/SportSync/index.html',
                '/SportSync/status.html',
                '/SportSync/js/sport-config.js',
                '/SportSync/js/asset-maps.js',
                '/SportSync/js/preferences-manager.js',
                '/SportSync/js/dashboard.js'
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

    // For static assets, use network-first with cache fallback
    event.respondWith(
        fetch(event.request).then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
            });

            return response;
        }).catch(() => {
            return caches.match(event.request);
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
