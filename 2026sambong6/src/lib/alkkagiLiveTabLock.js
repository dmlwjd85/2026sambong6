/**
 * 실시간 알까기: 같은 기기(같은 브라우저)에서 한 판·한 자리는 창(탭) 하나만 맡아요(#100 M1).
 *
 * 왜 필요해요?
 * - 방장이 같은 브라우저에서 새 창을 열면 두 창이 모두 '판 계산 기기'가 되어 판이 둘로 갈라졌어요.
 *   그러다 한 창이 혼자 계산한 결과로 방을 끝내서 틀린 승패가 기록됐어요.
 * 어떻게 해요?
 * - 가장 나중에 연 창이 맡아요(학생이 지금 보고 있는 창). 앞 창은 '보기만' 하고, 맡은 창이 닫히면 다시 맡아요.
 * - Web Locks(navigator.locks)가 있으면 그것을 써요(창이 닫히거나 멈추면 브라우저가 알아서 풀어 줘요).
 * - 없으면 localStorage에 '누가 맡았는지 + 마지막 확인 시각'을 적어 1초마다 확인해요(4초 넘게 조용하면 넘겨받아요).
 * - 둘 다 없으면(시험 환경 등) 이 창이 맡아요.
 * DOM·Firestore가 없는 순수 모듈이라 단위 테스트로 확인해요.
 */

export const ALKKAGI_LIVE_TAB_BEAT_MS = 1000;
export const ALKKAGI_LIVE_TAB_STALE_MS = 4000;

/** 잠금 이름: 같은 방·같은 판·같은 자리만 서로 막아요. */
export function alkkagiLiveTabLockName({ roomId = '', gid = 0, seat = '' } = {}) {
    return `sambong-alk-live:${String(roomId).slice(0, 60)}:${Math.floor(Number(gid) || 0)}:${String(seat).slice(0, 8)}`;
}

let tabSerial = 0;
function newTabId() {
    tabSerial += 1;
    return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${tabSerial}`;
}

/**
 * localStorage 값 읽기(망가진 값은 없는 것으로 봐요).
 * @returns {{ id: string, at: number } | null}
 */
export function parseTabLease(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !v.id) return null;
        const at = Number(v.at);
        return { id: v.id.slice(0, 40), at: Number.isFinite(at) ? at : 0 };
    } catch (_) {
        return null;
    }
}

/**
 * 하트비트 판단(순수): 지금 이 창이 맡아도 되는지.
 * - 비어 있거나 내 것이면 맡아요.
 * - 남의 것이라도 staleMs 넘게 조용하면(창이 닫힘·멈춤) 넘겨받아요.
 * - 남의 것이 살아 있으면 못 맡아요.
 */
export function decideTabLease(lease, { me, now, staleMs = ALKKAGI_LIVE_TAB_STALE_MS } = {}) {
    if (!lease) return true;
    if (lease.id === me) return true;
    const t = Number(now) || 0;
    return t - (Number(lease.at) || 0) > staleMs || lease.at > t + staleMs; // 시계가 크게 뒤로 간 값도 낡은 것으로 봐요
}

/**
 * @param {{ name: string, onChange: (held: boolean) => void,
 *   locks?: any, storage?: any, now?: () => number,
 *   setTimer?: (fn: Function, ms: number) => any, clearTimer?: (id: any) => void,
 *   addStorageListener?: (fn: Function) => (() => void), tabId?: string, beatMs?: number, staleMs?: number }} o
 * @returns {{ held: () => boolean, kind: string, release: () => void }}
 */
export function createLiveTabLock({
    name,
    onChange = () => {},
    locks = (typeof navigator !== 'undefined' && navigator && navigator.locks) || null,
    storage = (() => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } })(),
    now = () => Date.now(),
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = (id) => clearInterval(id),
    addStorageListener = (fn) => {
        if (typeof window === 'undefined' || !window.addEventListener) return () => {};
        window.addEventListener('storage', fn);
        return () => window.removeEventListener('storage', fn);
    },
    tabId = newTabId(),
    beatMs = ALKKAGI_LIVE_TAB_BEAT_MS,
    staleMs = ALKKAGI_LIVE_TAB_STALE_MS,
} = {}) {
    let held = false;
    let released = false;
    const set = (v) => {
        if (released || held === v) return;
        held = v;
        try { onChange(v); } catch (_) { /* 화면 쪽 오류가 잠금을 깨지 않게 해요 */ }
    };

    /* ---------- 1) Web Locks ---------- */
    if (locks && typeof locks.request === 'function') {
        let releaseHeld = null; // 잡고 있는 동안 풀어 줄 함수
        let waitAbort = null; // 줄 서서 기다리는 요청 취소
        const grantedBody = () => new Promise((resolve) => {
            if (released) { resolve(); return; }
            releaseHeld = resolve;
            set(true);
        });
        const queue = () => {
            // 빼앗긴 뒤에는 줄을 서요. 맡은 창이 닫히면 브라우저가 이 창에 넘겨줘요.
            if (released) return;
            const ac = typeof AbortController === 'function' ? new AbortController() : null;
            waitAbort = ac;
            const p = locks.request(name, ac ? { signal: ac.signal } : {}, grantedBody);
            p.then(() => { if (!released) { set(false); queue(); } }, (e) => onLost(e));
        };
        const onLost = (e) => {
            releaseHeld = null;
            set(false);
            if (released) return;
            if (e && e.name === 'AbortError' && waitAbort && waitAbort.signal && waitAbort.signal.aborted) return;
            queue();
        };
        // 가장 나중에 연 창이 맡아요(steal). 앞 창의 잠금 몸통은 AbortError로 끝나요.
        Promise.resolve()
            .then(() => locks.request(name, { steal: true }, grantedBody))
            .then(() => { if (!released) { set(false); queue(); } }, (e) => onLost(e));
        return {
            held: () => held,
            kind: 'locks',
            release() {
                if (released) return;
                set(false);
                released = true;
                if (releaseHeld) { const r = releaseHeld; releaseHeld = null; r(); }
                if (waitAbort) { try { waitAbort.abort(); } catch (_) { /* 무시 */ } }
            },
        };
    }

    /* ---------- 2) localStorage 하트비트 ---------- */
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
        const read = () => { try { return parseTabLease(storage.getItem(name)); } catch (_) { return null; } };
        const write = () => { try { storage.setItem(name, JSON.stringify({ id: tabId, at: now() })); return true; } catch (_) { return false; } };
        const beat = () => {
            if (released) return;
            const cur = read();
            if (decideTabLease(cur, { me: tabId, now: now(), staleMs })) {
                if (write()) {
                    // 같은 순간 두 창이 썼으면 마지막에 쓴 창만 맡아요.
                    const after = read();
                    set(!!after && after.id === tabId);
                    return;
                }
                set(true); // 저장소가 꽉 찼으면 이 창만 있다고 봐요
                return;
            }
            set(false);
        };
        write(); // 새 창이 바로 맡아요(가장 나중에 연 창)
        beat();
        const timer = setTimer(beat, beatMs);
        const off = addStorageListener((e) => { if (!e || e.key === name) beat(); });
        return {
            held: () => held,
            kind: 'storage',
            release() {
                if (released) return;
                set(false);
                released = true;
                clearTimer(timer);
                try { off(); } catch (_) { /* 무시 */ }
                const cur = read();
                if (cur && cur.id === tabId) { try { storage.removeItem(name); } catch (_) { /* 무시 */ } }
            },
        };
    }

    /* ---------- 3) 둘 다 없음 ---------- */
    set(true);
    return { held: () => held, kind: 'none', release() { if (!released) { set(false); released = true; } } };
}
