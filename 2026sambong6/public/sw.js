/* 롤백용 서비스 워커.
   이미 설치된 설치용 워커(같은 주소의 sw.js)가 이 파일로 갱신되면
   Cache Storage를 비우고 등록을 해제한 뒤, 캐시를 우회해 화면을 한 번만 다시 엽니다.
   새 방문자는 index.html에서 이 워커를 등록하지 않습니다.
   navigate 요청에 RequestInit을 붙이면 iOS가 탐색을 거절하고,
   통제하지 않는 창에 navigate를 호출하면 활성화가 거절됩니다.
   둘 다 설치된 화면이 더 이상 열리지 않게 하므로 여기서 피합니다. */
const SW_CLEAR = '20261019';

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.clients.claim();
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await Promise.all(windows.map(async (client) => {
            try {
                const url = new URL(client.url);
                if (url.searchParams.get('sw-clear') === SW_CLEAR) return;
                url.searchParams.set('sw-clear', SW_CLEAR);
                await client.navigate(url.href);
            } catch {
                /* 이 워커가 창의 활성 워커가 아니면 navigate가 거절됩니다. */
            }
        }));
        await self.registration.unregister();
    })());
});

self.addEventListener('fetch', (event) => {
    if (event.request.mode !== 'navigate') return;
    let target;
    try {
        target = new URL(event.request.url);
    } catch {
        return;
    }
    if (target.searchParams.get('sw-clear') === SW_CLEAR) return;
    event.respondWith((async () => {
        try {
            return await fetch(target.href, { cache: 'reload', credentials: 'same-origin' });
        } catch {
            return fetch(event.request);
        }
    })());
});
