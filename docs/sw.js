// SportSync Service Worker - Controls caching to ensure fresh data
const CACHE_NAME = 'sportsync-v10-cleanup';
const DATA_FILES = [
    '/SportSync/data/events.json',
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
    console.log('SportSync Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SportSync Service Worker: Caching static assets');
            return cache.addAll([
                '/SportSync/',
                '/SportSync/index.html',
                '/SportSync/js/sports-api.js',
                '/SportSync/js/simple-dashboard.js',
                '/SportSync/js/preferences-manager.js',
                '/SportSync/js/settings-ui.js'
            ]);
        })
    );
    self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('SportSync Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('SportSync Service Worker: Deleting old cache:', cacheName);
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
        console.log('SportSync Service Worker: Fetching fresh data for:', url.pathname);
        event.respondWith(
            fetch(event.request, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }).catch(() => {
                console.log('SportSync Service Worker: Network failed for data file, no fallback');
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
                console.log('SportSync Service Worker: Serving from cache:', url.pathname);
                return response;
            }
            
            console.log('SportSync Service Worker: Fetching from network:', url.pathname);
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
        console.log('SportSync Service Worker: Clearing data cache on request');
        // Clear any cached data files
        caches.open(CACHE_NAME).then((cache) => {
            DATA_FILES.forEach(dataFile => {
                cache.delete(dataFile);
            });
        });
    }
});