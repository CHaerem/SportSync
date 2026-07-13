// Zenji v2 Service Worker — fresh data always, network-first shell
const CACHE_NAME = 'sportsync-v2-17';
const DATA_PATH_FRAGMENT = '/data/';

const SHELL_FILES = [
    '/zenji/',
    '/zenji/index.html',
    '/zenji/manifest.webmanifest',
    '/zenji/favicon.png',
    '/zenji/icons/icon-180x180.png',
    '/zenji/icons/icon-192x192.png',
    '/zenji/icons/icon-512x512.png',
    '/zenji/icons/icon.svg',
    '/zenji/css/base.css',
    '/zenji/css/layout.css',
    '/zenji/css/cards.css',
    '/zenji/js/shared-constants.js',
    '/zenji/js/sport-config.js',
    '/zenji/js/asset-maps.js',
    '/zenji/js/dashboard.js',
    '/zenji/rediger.html',
    '/zenji/js/edit.js'
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

    // Data files: fresh from network when online; cache the last-good copy and
    // fall back to it offline so the agenda still opens with no signal. Keyed
    // without the ?t= cache-buster so the fallback matches the next load.
    if (url.pathname.includes(DATA_PATH_FRAGMENT)) {
        const key = url.origin + url.pathname;
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then((response) => {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(key).then((cached) =>
                    cached || new Response('{"error":"offline"}', {
                        headers: { 'Content-Type': 'application/json' }
                    })
                ))
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
