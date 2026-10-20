/* 롤백용 서비스 워커.
   이미 설치된 설치용 워커(같은 주소의 sw.js)가 이 파일로 갱신되면
   Cache Storage를 비우고 등록을 해제한 뒤, 캐시를 우회해 화면을 다시 엽니다.
   새 방문자는 index.html에서 이 워커를 등록하지 않습니다. */
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await self.registration.unregister();
        await Promise.all(windows.map((client) => {
            try {
                const url = new URL(client.url);
                url.searchParams.set('sw-clear', '20261019');
                return client.navigate(url.href);
            } catch {
                return undefined;
            }
        }));
    })());
});

self.addEventListener('fetch', (event) => {
    if (event.request.mode !== 'navigate') return;
    event.respondWith(fetch(event.request, { cache: 'reload' }));
});
