const CACHE = 'mate-cache-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    const hashed = url.pathname.includes('/assets/')
        || url.pathname.includes('/fonts/')
        || /\.(?:woff2|svg|webp|png|css|js)$/.test(url.pathname);
    if (hashed) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const hit = await cache.match(request);
            if (hit) return hit;
            const response = await fetch(request);
            if (response.ok) cache.put(request, response.clone());
            return response;
        })());
        return;
    }
    const shell = url.pathname.endsWith('/') || url.pathname.endsWith('.html');
    if (!shell) return;
    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            if (response.ok) {
                const cache = await caches.open(CACHE);
                cache.put(request, response.clone());
            }
            return response;
        } catch (_) {
            const hit = await caches.match(request);
            if (hit) return hit;
            throw _;
        }
    })());
});
