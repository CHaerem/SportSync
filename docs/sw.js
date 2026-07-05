// SportSync v2 Service Worker — fresh data always, network-first shell
const CACHE_NAME = 'sportsync-v2-9';
const DATA_PATH_FRAGMENT = '/data/';

const SHELL_FILES = [
    '/SportSync/',
    '/SportSync/index.html',
    '/SportSync/manifest.webmanifest',
    '/SportSync/favicon.png',
    '/SportSync/icons/icon-180x180.png',
    '/SportSync/icons/icon-192x192.png',
    '/SportSync/icons/icon-512x512.png',
    '/SportSync/icons/icon.svg',
    '/SportSync/css/base.css',
    '/SportSync/css/layout.css',
    '/SportSync/css/cards.css',
    '/SportSync/js/shared-constants.js',
    '/SportSync/js/sport-config.js',
    '/SportSync/js/asset-maps.js',
    '/SportSync/js/dashboard.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.map((name) => (name !== CACHE_NAME ? caches.delete(name) : undefined)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Data files: always fresh from network
    if (url.pathname.includes(DATA_PATH_FRAGMENT)) {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' }).catch(
                () => new Response('{"error": "Network unavailable"}', {
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    // Shell: network-first with cache fallback (offline support)
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
