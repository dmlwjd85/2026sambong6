import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startAppUpdateWatch } from '../appUpdateWatch.js';

function delay(ms) { return new Promise((ok) => setTimeout(ok, ms)); }

function installBrowser({ bundle = 'index-old.js', latest = 'index-new.js' } = {}) {
    const docListeners = {};
    const winListeners = {};
    const add = (map) => (type, fn) => { (map[type] ||= []).push(fn); };
    const fire = (map, type) => { for (const fn of map[type] || []) fn(); };

    const script = { getAttribute: () => `https://example.test/2026sambong6/assets/${bundle}` };
    let visibilityState = 'visible';
    let active = { tagName: 'BODY', isContentEditable: false };
    let modal = false;
    const order = [];
    const reloads = [];

    globalThis.document = {
        querySelectorAll: (sel) => (String(sel).includes('script') ? [script] : []),
        querySelector: () => (modal ? { className: 'sambong-custom-modal' } : null),
        get activeElement() { return active; },
        get visibilityState() { return visibilityState; },
        addEventListener: add(docListeners),
    };
    globalThis.window = {
        addEventListener: add(winListeners),
        showToast: () => { order.push('toast'); },
    };
    globalThis.location = {
        reload: () => { order.push('reload'); reloads.push(Date.now()); },
    };
    globalThis.fetch = async () => ({
        ok: true,
        text: async () => `<script type="module" crossorigin src="/2026sambong6/assets/${latest}"></script>`,
    });

    return {
        order,
        reloads,
        hideThenShow() {
            visibilityState = 'hidden';
            fire(docListeners, 'visibilitychange');
            visibilityState = 'visible';
            fire(docListeners, 'visibilitychange');
        },
        setModal(v) { modal = v; },
        pointer() { fire(winListeners, 'pointerdown'); },
        setReload(fn) { globalThis.location.reload = fn; },
    };
}

/** flush와 petSavesPending을 함께 붙입니다. 끝나기 전에는 pending true. */
function attachFlush(browser, { delayMs, hang = false, fail = false, manual = false } = {}) {
    let pending = true;
    let resolveFn;
    let rejectFn;
    const manualPromise = new Promise((ok, err) => { resolveFn = ok; rejectFn = err; });
    globalThis.window.flushPetSaves = () => {
        browser.order.push('flush-start');
        if (fail) {
            return Promise.reject(new Error('flush failed'));
        }
        if (hang) return new Promise(() => {});
        if (manual) {
            return manualPromise.then(() => {
                pending = false;
                browser.order.push('flush-done');
            });
        }
        return new Promise((ok) => setTimeout(() => {
            pending = false;
            browser.order.push('flush-done');
            ok();
        }, delayMs ?? 40));
    };
    globalThis.window.petSavesPending = () => pending;
    return {
        resolve() {
            pending = false;
            browser.order.push('flush-done');
            resolveFn();
        },
        reject(err) { rejectFn(err || new Error('flush failed')); },
        get pending() { return pending; },
    };
}

async function startStale(env) {
    const hooks = startAppUpdateWatch({ flushWaitMs: 200 });
    await hooks.check();
    return hooks;
}

describe('appUpdateWatch', () => {
    let browser;
    let hooks;

    beforeEach(() => {
        browser = installBrowser();
        hooks = null;
    });

    afterEach(() => {
        if (hooks && typeof hooks.stop === 'function') hooks.stop();
        delete globalThis.document;
        delete globalThis.window;
        delete globalThis.location;
        delete globalThis.fetch;
    });

    it('저장 훅이 없으면 탭이 다시 보일 때 바로 새로고침해요', async () => {
        hooks = await startStale(browser);
        browser.hideThenShow();
        assert.ok(browser.order.includes('reload'));
    });

    it('저장이 제한 시간보다 짧게 끝나면 저장 뒤에 새로고침해요', async () => {
        hooks = await startStale(browser);
        attachFlush(browser, { delayMs: 40 });
        browser.hideThenShow();
        await delay(150);
        assert.deepEqual(
            browser.order.filter((x) => x !== 'toast'),
            ['flush-start', 'flush-done', 'reload'],
        );
        assert.equal(browser.reloads.length, 1);
    });

    it('제한 시간 안에 저장이 안 끝나면 바로 새로고침하지 않아요', async () => {
        hooks = await startStale(browser);
        attachFlush(browser, { manual: true });
        browser.hideThenShow();
        await delay(280);
        assert.ok(browser.order.includes('flush-start'));
        assert.ok(!browser.order.includes('reload'), `너무 이르게 새로고침됨: ${browser.order}`);
    });

    it('R1: 저장이 제한보다 늦게 끝나도 탭을 다시 가리지 않아도 바로 새로고침해요', async () => {
        hooks = await startStale(browser);
        const flush = attachFlush(browser, { manual: true });
        browser.hideThenShow();
        await delay(280);
        assert.ok(!browser.order.includes('reload'), `제한 직후에 새로고침되면 안 됨: ${browser.order}`);
        flush.resolve();
        await delay(50);
        assert.ok(browser.order.includes('flush-done'));
        assert.equal(browser.reloads.length, 1, `늦은 저장 끝 뒤 새로고침 없음: ${browser.order}`);
    });

    it('저장이 끝까지 안 끝나면 새로고침하지 않아요', async () => {
        hooks = await startStale(browser);
        attachFlush(browser, { hang: true });
        browser.hideThenShow();
        await delay(300);
        assert.ok(!browser.order.includes('reload'));
    });

    it('확인 창이 열려 있으면 숨겼다 보여도 새로고침하지 않아요', async () => {
        hooks = await startStale(browser);
        browser.setModal(true);
        browser.hideThenShow();
        assert.ok(!browser.order.includes('reload'));
    });

    it('보고 있는 화면은 방금 손대면 새로고침하지 않아요', async () => {
        hooks = await startStale(browser);
        browser.pointer();
        hooks.tryReload();
        await delay(40);
        assert.ok(!browser.order.includes('reload'));
    });

    it('flush가 거절되고 저장이 남아 있으면 새로고침하지 않아요', async () => {
        hooks = await startStale(browser);
        attachFlush(browser, { fail: true });
        browser.hideThenShow();
        await delay(100);
        assert.ok(!browser.order.includes('reload'));
        await delay(200);
        assert.ok(!browser.order.includes('reload'), `거절 후 반복 새로고침: ${browser.order}`);
    });

    it('동시에 두 번 요청해도 새로고침은 한 번만 해요', async () => {
        hooks = await startStale(browser);
        const flush = attachFlush(browser, { manual: true });
        const a = hooks.reloadIfSafe({ hidden: true });
        const b = hooks.reloadIfSafe({ hidden: true });
        await delay(20);
        assert.equal(browser.order.filter((x) => x === 'flush-start').length, 1, `flush 횟수 ${browser.order}`);
        flush.resolve();
        await Promise.all([a, b]);
        await delay(20);
        assert.equal(browser.reloads.length, 1);
    });

    it('R3: reload가 실패해도 다음 시도가 가능해요', async () => {
        hooks = await startStale(browser);
        let shouldThrow = true;
        browser.setReload(() => {
            if (shouldThrow) {
                shouldThrow = false;
                throw new Error('reload failed');
            }
            browser.order.push('reload');
            browser.reloads.push(Date.now());
        });
        await hooks.reloadIfSafe({ hidden: true });
        assert.equal(browser.reloads.length, 0, '첫 실패는 성공 횟수에 안 넣음');
        await hooks.reloadIfSafe({ hidden: true });
        assert.equal(browser.reloads.length, 1, `두 번째 시도가 막힘: ${browser.order}`);
    });
});
