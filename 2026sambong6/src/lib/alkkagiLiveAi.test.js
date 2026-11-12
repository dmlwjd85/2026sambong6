import test from 'node:test';
import assert from 'node:assert/strict';
import { ALKKAGI_LIVE_AI_TIMING, createLiveAiDriver } from './alkkagiLiveAi.js';
import { planAlkkagiAiShot } from './alkkagiAi.js';
import { createLiveSession } from './alkkagiLiveSession.js';
import { ALKKAGI_BLACK, ALKKAGI_WHITE } from './alkkagiGame.js';

// 바로 끝나는 계획(테스트에서는 나눠 돌릴 필요가 없어요)
const syncPlan = (stones, color, opts) => ({ promise: Promise.resolve(planAlkkagiAiShot(stones, color, opts)), cancel() {} });
const flush = () => new Promise((r) => setImmediate(r));

function localGame({ level = 'normal', seed = 7 } = {}) {
    const gid = 1700000000000;
    let finished = null;
    const session = createLiveSession({
        seat: ALKKAGI_BLACK,
        gid,
        now: 0,
        send: { writeState: () => Promise.resolve(), writeIntent: () => Promise.resolve(), finish: (r) => { finished = r; } },
    });
    session.init(null, { hostSeat: ALKKAGI_BLACK, nowMs: 0 });
    let n = 0;
    const submitted = [];
    const driver = createLiveAiDriver({
        color: ALKKAGI_WHITE,
        level,
        seed,
        plan: syncPlan,
        submit: (shot) => {
            n += 1;
            submitted.push(shot);
            session.onSeatDoc(ALKKAGI_WHITE, { seat: ALKKAGI_WHITE, gid, n, shot });
        },
    });
    const view = (t) => ({
        cooldownLeft: session.cooldownLeft(ALKKAGI_WHITE, t),
        moving: session.isMoving(),
        over: session.isFinished(),
        alive: session.aliveCount(ALKKAGI_WHITE),
        oppAlive: session.aliveCount(ALKKAGI_BLACK),
        stones: session.stones(),
    });
    return { session, driver, view, submitted, finished: () => finished };
}

test('AI는 쿨다운이 끝나고 반응 시간만큼 기다렸다가 쏴요', async () => {
    const g = localGame({ level: 'hard' });
    assert.equal(g.driver.tick(0, g.view(0)), 'waiting');
    // 고수 최대 반응 시간 전에는 안 쏴요
    const [lo] = ALKKAGI_LIVE_AI_TIMING.hard.react;
    assert.equal(g.driver.tick(lo - 1, g.view(lo - 1)), 'waiting');
    let t = 0;
    while (!g.submitted.length && t < 3000) {
        t += 50;
        g.driver.tick(t, g.view(t));
        await flush();
    }
    assert.equal(g.submitted.length, 1);
    g.session.tick(t);
    assert.equal(g.session.cooldownLeft(ALKKAGI_WHITE, t) > 0, true, '세션이 AI 샷을 받아들여 쿨다운이 걸려요');
});

test('AI 샷은 5초 쿨다운을 지켜요', async () => {
    const g = localGame({ level: 'hard', seed: 3 });
    const shotTimes = [];
    let t = 0;
    while (t < 20000 && !g.session.isFinished()) {
        t += 50;
        g.session.tick(t);
        const before = g.submitted.length;
        g.driver.tick(t, g.view(t));
        await flush();
        if (g.submitted.length > before) shotTimes.push(t);
    }
    assert.ok(shotTimes.length >= 2, `여러 번 쏴요(${shotTimes.length})`);
    for (let i = 1; i < shotTimes.length; i += 1) assert.ok(shotTimes[i] - shotTimes[i - 1] >= 5000, '5초 안에 다시 쏘지 않아요');
});

test('사람이 가만히 있으면 AI가 결국 이겨요(판 끝은 방장 세션이 정해요)', async () => {
    const g = localGame({ level: 'hard', seed: 11 });
    let t = 0;
    while (t < 240000 && !g.finished()) {
        t += 50;
        g.session.tick(t);
        g.driver.tick(t, g.view(t));
        await flush();
    }
    assert.ok(g.finished(), '판이 끝나요');
    assert.equal(g.finished().winner, ALKKAGI_WHITE);
});

test('멈추면 더 쏘지 않아요', async () => {
    let calls = 0;
    const d = createLiveAiDriver({ color: ALKKAGI_WHITE, level: 'easy', plan: (...a) => { calls += 1; return syncPlan(...a); }, submit() {} });
    d.stop();
    d.tick(0, { alive: 5, oppAlive: 5, stones: [] });
    d.tick(10000, { alive: 5, oppAlive: 5, stones: [] });
    assert.equal(calls, 0);
});

test('같은 seed면 같은 반응 시간이에요', () => {
    const a = createLiveAiDriver({ color: ALKKAGI_WHITE, level: 'normal', seed: 5, plan: syncPlan, submit() {} });
    const b = createLiveAiDriver({ color: ALKKAGI_WHITE, level: 'normal', seed: 5, plan: syncPlan, submit() {} });
    const v = { alive: 5, oppAlive: 5, stones: [] };
    a.tick(0, v); b.tick(0, v);
    for (let t = 0; t < 3000; t += 10) {
        assert.equal(a.tick(t, v), b.tick(t, v));
    }
});
