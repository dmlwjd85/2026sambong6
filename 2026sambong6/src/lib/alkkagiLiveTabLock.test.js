import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alkkagiLiveTabLockName, createLiveTabLock, decideTabLease, parseTabLease } from './alkkagiLiveTabLock.js';

/** 브라우저 Web Locks 흉내: steal·줄 서기·signal 취소만 */
function fakeLocks() {
    const held = new Map();
    const queues = new Map();
    const abortErr = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
    function grant(name, e) {
        held.set(name, e);
        Promise.resolve()
            .then(() => e.cb({ name }))
            .then((v) => {
                if (held.get(name) === e) { held.delete(name); next(name); }
                e.resolve(v);
            });
    }
    function next(name) {
        const q = queues.get(name) || [];
        const e = q.shift();
        if (e) grant(name, e);
    }
    return {
        held,
        request(name, opts, cb) {
            return new Promise((resolve, reject) => {
                const e = { cb, resolve, reject };
                if (opts && opts.steal) {
                    const h = held.get(name);
                    if (h) { held.delete(name); h.reject(abortErr()); }
                    grant(name, e);
                    return;
                }
                if (!held.has(name)) { grant(name, e); return; }
                const q = queues.get(name) || [];
                q.push(e);
                queues.set(name, q);
                if (opts && opts.signal) {
                    opts.signal.addEventListener('abort', () => {
                        const i = q.indexOf(e);
                        if (i >= 0) { q.splice(i, 1); reject(abortErr()); }
                    });
                }
            });
        },
    };
}

const flush = async (n = 10) => { for (let i = 0; i < n; i += 1) await Promise.resolve(); };

function fakeStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

describe('실시간 알까기 창 잠금(#100 M1)', () => {
    it('잠금 이름은 방·판·자리마다 달라요', () => {
        const a = alkkagiLiveTabLockName({ roomId: 'alkl_2', gid: 100, seat: 'black' });
        assert.notEqual(a, alkkagiLiveTabLockName({ roomId: 'alkl_2', gid: 100, seat: 'white' }));
        assert.notEqual(a, alkkagiLiveTabLockName({ roomId: 'alkl_2', gid: 101, seat: 'black' }));
        assert.notEqual(a, alkkagiLiveTabLockName({ roomId: 'alkl_3', gid: 100, seat: 'black' }));
    });

    it('Web Locks: 새 창이 맡고 앞 창은 보기만 해요. 새 창을 닫으면 앞 창이 다시 맡아요', async () => {
        const locks = fakeLocks();
        const seen = { a: [], b: [] };
        const name = 'L';
        const a = createLiveTabLock({ name, locks, onChange: (v) => seen.a.push(v) });
        await flush();
        assert.equal(a.kind, 'locks');
        assert.equal(a.held(), true);
        const b = createLiveTabLock({ name, locks, onChange: (v) => seen.b.push(v) });
        await flush();
        assert.equal(b.held(), true);
        assert.equal(a.held(), false, '앞 창은 잃어요');
        // 한 번에 맡은 창은 하나뿐
        assert.equal([a, b].filter((x) => x.held()).length, 1);
        b.release();
        await flush();
        assert.equal(a.held(), true, '맡던 창이 닫히면 앞 창이 다시 맡아요');
        assert.deepEqual(seen.a, [true, false, true]);
        assert.deepEqual(seen.b, [true, false]);
        a.release();
        await flush();
        assert.equal(locks.held.size, 0);
    });

    it('Web Locks: 세 창을 차례로 열어도 맡은 창은 언제나 하나예요', async () => {
        const locks = fakeLocks();
        const tabs = [];
        for (let i = 0; i < 3; i += 1) { tabs.push(createLiveTabLock({ name: 'L3', locks })); await flush(); }
        assert.deepEqual(tabs.map((t) => t.held()), [false, false, true]);
        tabs[2].release();
        await flush();
        assert.equal(tabs.filter((t) => t.held()).length, 1);
        tabs.forEach((t) => t.release());
        await flush();
        assert.equal(locks.held.size, 0);
    });

    it('하트비트 판단: 비었거나 내 것이면 맡고, 남의 것은 4초 넘게 조용할 때만 넘겨받아요', () => {
        assert.equal(decideTabLease(null, { me: 'a', now: 10 }), true);
        assert.equal(decideTabLease({ id: 'a', at: 0 }, { me: 'a', now: 10 }), true);
        assert.equal(decideTabLease({ id: 'b', at: 9000 }, { me: 'a', now: 10000 }), false);
        assert.equal(decideTabLease({ id: 'b', at: 5000 }, { me: 'a', now: 10000 }), true);
        assert.equal(decideTabLease({ id: 'b', at: 99999 }, { me: 'a', now: 10000 }), true, '미래 시각(시계 바뀜)은 낡은 것으로 봐요');
        assert.equal(parseTabLease('망가짐'), null);
        assert.equal(parseTabLease('{"id":""}'), null);
        assert.deepEqual(parseTabLease('{"id":"x","at":5}'), { id: 'x', at: 5 });
    });

    it('Web Locks가 없으면 localStorage 하트비트로 대신해요', () => {
        let now = 1000;
        const storage = fakeStorage();
        const timers = [];
        const common = { locks: null, storage, now: () => now, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: (i) => { timers[i - 1] = null; }, addStorageListener: () => () => {} };
        const beat = () => timers.forEach((f) => f && f());
        const a = createLiveTabLock({ ...common, name: 'S', tabId: 'A' });
        assert.equal(a.kind, 'storage');
        assert.equal(a.held(), true);
        now += 500;
        const b = createLiveTabLock({ ...common, name: 'S', tabId: 'B' });
        beat();
        assert.equal(b.held(), true, '새 창이 맡아요');
        assert.equal(a.held(), false, '앞 창은 보기만 해요');
        // 새 창이 멈추면(하트비트 없음) 4초 뒤 앞 창이 넘겨받아요
        b.release();
        now += 100;
        beat();
        assert.equal(a.held(), true, '닫히면 바로 다시 맡아요(값을 지워요)');
        a.release();
        assert.equal(storage.getItem('S'), null);
    });

    it('localStorage: 맡은 창이 멈추면(값은 남음) 4초 뒤 넘겨받아요', () => {
        let now = 0;
        const storage = fakeStorage();
        storage.setItem('T', JSON.stringify({ id: 'ghost', at: 0 }));
        const timers = [];
        const lock = createLiveTabLock({ name: 'T', tabId: 'me', locks: null, storage, now: () => now, setTimer: (fn) => { timers.push(fn); return 1; }, clearTimer: () => {}, addStorageListener: () => () => {} });
        // 새 창은 바로 맡아요
        assert.equal(lock.held(), true);
        // 다른 창(ghost)이 다시 쓰고 살아 있으면 잃어요
        now = 1000;
        storage.setItem('T', JSON.stringify({ id: 'ghost', at: 1000 }));
        timers[0]();
        assert.equal(lock.held(), false);
        now = 6000;
        timers[0]();
        assert.equal(lock.held(), true);
        lock.release();
    });

    it('잠금 장치가 하나도 없으면 이 창이 맡아요', () => {
        const lock = createLiveTabLock({ name: 'N', locks: null, storage: null });
        assert.equal(lock.kind, 'none');
        assert.equal(lock.held(), true);
        lock.release();
        assert.equal(lock.held(), false);
    });
});
