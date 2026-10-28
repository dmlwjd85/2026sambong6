/* 설치용 최소 서비스 워커.
   화면은 저장하지 않고, 페이지를 열 때만 네트워크를 먼저 봅니다.
   이미 설치된 워커가 이 파일로 바뀌면 Cache Storage만 비우고,
   ?sw-clear=20261019 가 없는 창을 한 번만 다시 엽니다.
   그 주소가 이미 있으면 다시 열지 않아 새로고침이 반복되지 않습니다.
   처음 설치에는 창을 다시 열지 않습니다.
   로그인 저장소와 인증 저장소는 지우지 않습니다.
   activate 안에서 navigate를 기다리지 않습니다.
   fetch는 탐색을 네트워크로만 받고, 등록을 해제하거나 navigate하지 않습니다.
   ?sw-clear 문서는 가로채지 않습니다.
   그 주소의 등록 해제·캐시 삭제·한 번만 새로고침은 페이지가 합니다.
   fetch 안에서 등록을 해제하면 그 문서가 끝나지 않습니다. */
const SW_CLEAR = '20261019';
const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연결 없음</title><p style="font-family:sans-serif;text-align:center;padding:2rem">인터넷에 연결되어 있지 않아요. 연결을 확인한 뒤 다시 열어 주세요.</p>';

let replaceExistingWorker = false;

self.addEventListener('install', (event) => {
    replaceExistingWorker = !!self.registration.active;
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.clients.claim();
        if (!replaceExistingWorker) return;
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        windows.forEach((client) => {
            try {
                const url = new URL(client.url);
                if (url.searchParams.get('sw-clear') === SW_CLEAR) return;
                url.searchParams.set('sw-clear', SW_CLEAR);
                client.navigate(url.href).catch(() => {});
            } catch {
                /* 이 워커가 창의 활성 워커가 아니면 navigate가 거절됩니다. */
            }
        });
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
    event.respondWith(
        fetch(event.request).catch(
            () => new Response(OFFLINE_HTML, {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }),
        ),
    );
});
