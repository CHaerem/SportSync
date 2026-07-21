// Sportivista v2 Service Worker — fresh data always, network-first shell
const CACHE_NAME = 'sportivista-v1-12';
const DATA_PATH_FRAGMENT = '/data/';

const SHELL_FILES = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/favicon.png',
    '/icons/icon-180x180.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/icons/icon.svg',
    '/css/base.css',
    '/css/layout.css',
    '/css/cards.css',
    '/js/shared-constants.js',
    '/js/lens.js',
    '/js/profile-sync.js',
    '/js/assistant.js',
    '/js/sport-icons.js',
    '/js/theme.js',
    '/js/dashboard.js',
    '/js/live.js',
    '/js/detail.js',
    '/js/followed.js',
    '/js/profile-ui.js',
    '/js/news-web.js',
    '/js/chrome.js',
    '/rediger.html',
    '/js/edit.js',
    '/js/icloud-config.js',
    '/js/icloud-sync.js',
    '/js/gate-boot.js',
    '/activity.html',
    '/styleguide.html'
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

    // CloudKit JS + Apple sign-in: never intercept, cache, or clone these — the
    // auth redirect and the api.apple-cloudkit.com calls must go straight to the
    // network, and the cloudkit.js library must always come fresh from Apple's CDN.
    if (url.hostname.endsWith('apple-cloudkit.com') || url.hostname.endsWith('apple.com')) {
        return; // fall through to the browser's default handling
    }

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
