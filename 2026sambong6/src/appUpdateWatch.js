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
    const a = document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
}

export function startAppUpdateWatch() {
    const mine = currentBundle();
    if (!mine || typeof fetch !== 'function') return;
    let stale = false;
    let lastCheck = 0;
    let lastInput = Date.now();
    let told = false;
    const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));

    const reload = () => {
        try { location.reload(); } catch (_) { /* 무시 */ }
    };
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
        if (canReloadNow({ hidden: false, idleMs: Date.now() - lastInput, busy: busyNow() })) reload();
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        // 다른 앱에 갔다 돌아왔을 때: 새 버전이면 하던 일이 없을 때 바로 새로 고쳐요.
        if (stale && !busyNow()) { reload(); return; }
        if (Date.now() - lastCheck > CHECK_MS / 2) void check();
    });
    setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastCheck >= CHECK_MS) void check();
        tryReload();
    }, 60000);
    setTimeout(() => { void check(); }, 30000);
}
