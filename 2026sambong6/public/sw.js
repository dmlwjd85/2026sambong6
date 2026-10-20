/* 롤백용 서비스 워커.
   이미 설치된 설치용 워커(같은 주소의 sw.js)가 이 파일로 갱신되면
   Cache Storage만 비우고 등록을 해제한 뒤, 캐시를 우회해 화면을 한 번만 다시 엽니다.
   로그인 저장소와 인증 저장소는 지우지 않습니다.
   ?sw-clear 가 이미 있으면 다시 열지 않고, 등록 해제 후에는 이 정리가 반복되지 않습니다.
   새 방문자는 index.html에서 이 워커를 등록하지 않습니다.
   activate 안에서 navigate를 기다리면 그 탐색이 활성화가 끝나기를 기다려 멈춥니다.
   fetch에서 navigate를 가로채다 등록을 해제하면 ?sw-clear 문서가 끝나지 않습니다. */
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
        await self.registration.unregister();
    })());
});
