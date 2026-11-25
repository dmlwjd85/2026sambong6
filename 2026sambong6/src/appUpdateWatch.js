/**
 * 새로 배포되면 켜 둔 화면을 알맞은 때 새로 고쳐요(appUpdate.js 규칙).
 * 며칠씩 켜 둔 태블릿이 옛 코드로 지갑·은행을 저장하면 다른 화면에서 한 일이 덮일 수 있어서예요.
 * 10분마다 index.html 만 받아 봐요(Firestore 읽기 없음). 개발 서버에서는 아무것도 하지 않아요.
 */
import { bundleNameFromHtml, bundleNameFromSrc, canReloadNow, isNewBundle } from './lib/appUpdate.js';

const CHECK_MS = 10 * 60 * 1000;

function currentBundle() {
    const scripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
    for (const s of scripts) {
        const name = bundleNameFromSrc(s.getAttribute('src'));
        if (name) return name;
    }
    return '';
}

/** 하던 일이 있는지: 확인 창, 펫 전투·퀴즈, OX 풀이, 글 입력 */
function busyNow() {
    if (document.querySelector('.sambong-custom-modal, .raid-fx-wrap, .raid-fx-quiz, .ox-play-top')) return true;
    // 쓰는 중인 독서기록·일기가 있으면 새로 고치지 않아요(글이 끊기지 않게).
    try { if (typeof window.literatureHasUnsavedWork === 'function' && window.literatureHasUnsavedWork()) return true; } catch (_) { /* 무시 */ }
    const a = document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
}

/** 모아 둔 펫 저장(먹이·강화·봉)이 아직 서버에 안 갔는지 */
function petQueuePending() {
    try {
        return typeof window.petSavesPending === 'function' && !!window.petSavesPending();
    } catch (_) { return false; }
}

export function startAppUpdateWatch(options = {}) {
    const mine = currentBundle();
    if (!mine || typeof fetch !== 'function') return {};

    const flushWaitMs = options.flushWaitMs ?? 8000;
    let stale = false;
    let lastCheck = 0;
    let lastInput = Date.now();
    let told = false;
    const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));

    const reload = () => {
        try { location.reload(); } catch (_) { reloading = false; }
    };
    let reloading = false;
    /**
     * 새 버전으로 바꾸기 전에 모아 둔 펫 저장을 끝내요.
     * 태블릿이 잠깐 다른 앱에 갔다 오면(화면이 가려졌다 다시 보임) 바로 새로 고치는데,
     * 그때 15초짜리 펫 저장이 아직이면 강화 성공과 봉 차감이 같이 사라져요.
     */
    async function reloadIfSafe({ hidden = false } = {}) {
        if (!stale || reloading) return;
        if (busyNow()) return;
        const idleMs = Date.now() - lastInput;
        if (!canReloadNow({ hidden, idleMs, busy: false })) return;

        reloading = true;
        let flushPromise = null;
        let flushDone = false;
        let tracked = null;
        try {
            if (typeof window.flushPetSaves === 'function') {
                flushPromise = Promise.resolve(window.flushPetSaves());
                tracked = flushPromise.finally(() => { flushDone = true; });
                await Promise.race([
                    tracked,
                    new Promise((ok) => setTimeout(ok, flushWaitMs)),
                ]);
            }
        } catch (_) { /* 저장이 거절돼도 아래에서 아직 남은 일이 있는지 다시 봐요 */ }

        if (
            !stale
            || busyNow()
            || !canReloadNow({ hidden, idleMs: Date.now() - lastInput, busy: false, petPending: petQueuePending() })
        ) {
            reloading = false;
            // 아직 저장이 끝나지 않았을 때만 끝나면 바로 다시 시도해요. 이미 실패한 약속에 다시 걸면 무한 반복이 돼요.
            if (!flushDone && tracked && petQueuePending()) {
                void tracked.finally(() => {
                    if (!reloading) void reloadIfSafe({ hidden });
                });
            }
            return;
        }
        reload();
    }

    async function check() {
        if (stale) return;
        lastCheck = Date.now();
        try {
            const res = await fetch(`${base}index.html?update-check=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return;
            const latest = bundleNameFromHtml(await res.text());
            if (!isNewBundle(mine, latest)) return;
            stale = true;
            if (!told && typeof window.showToast === 'function') {
                told = true;
                window.showToast('새 버전이 나왔어요. 잠시 쉬는 동안 화면을 새로 고칠게요.', 6000);
            }
        } catch (_) { /* 연결이 없으면 다음에 다시 봐요 */ }
    }

    function tryReload() {
        if (!stale) return;
        void reloadIfSafe({ hidden: false });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        // 다른 앱에 갔다 돌아왔을 때: 새 버전이면 하던 일이 없을 때 바로 새로 고쳐요.
        // 펫 저장이 남아 있으면 reloadIfSafe 가 저장을 끝낸 뒤에 고쳐요.
        if (stale && !busyNow()) { void reloadIfSafe({ hidden: true }); return; }
        if (Date.now() - lastCheck > CHECK_MS / 2) void check();
    });

    const intervalId = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastCheck >= CHECK_MS) void check();
        tryReload();
    }, 60000);
    if (intervalId && typeof intervalId.unref === 'function') intervalId.unref();

    const firstTimeout = setTimeout(() => { void check(); }, 30000);
    if (firstTimeout && typeof firstTimeout.unref === 'function') firstTimeout.unref();

    function stop() {
        clearInterval(intervalId);
        clearTimeout(firstTimeout);
    }

    return { check, reloadIfSafe, tryReload, stop };
}
