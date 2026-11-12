// #100 M1: 같은 자리(방장)를 맡은 창이 둘일 때 판이 갈라지지 않는지(가짜 서버 + 규칙 seq +1 흉내)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSession } from './alkkagiLiveSession.js';
import { liveStateToDoc, sanitizeLiveState } from './alkkagiLiveGame.js';
import { serializeAlkkagiShot } from './alkkagiPhysics.js';

const GID = 1000;

/**
 * 가짜 서버: live/state 쓰기는 규칙(alkLiveStateNext)처럼 같은 epoch·같은 hostSeat에서 seq +1만 받아요.
 * 받은 문서는 latency 뒤 모든 창에 퍼져요. 자리 문서(샷 의도)도 모든 창에 퍼져요.
 */
function makeWorld({ latency = 60, rejectOver = 0 } = {}) {
    let now = 0;
    const queue = [];
    const later = (ms, fn) => queue.push({ at: now + ms, fn });
    let state = null; // 서버에 있는 live/state
    const finishes = [];
    const log = { accepted: 0, rejected: 0, overRejected: 0 };
    const tabs = [];
    let overRejectLeft = rejectOver;
    function acceptState(d) {
        if (!state) return d.seq <= 1 && d.epoch <= 1;
        if (d.gid !== state.gid) return d.seq <= 1;
        return (d.epoch === state.epoch && d.seq === state.seq + 1 && d.hostSeat === state.hostSeat)
            || (d.epoch === state.epoch + 1 && d.seq <= state.seq + 1);
    }
    function mk(label, seat, { hostRole = true } = {}) {
        const tab = { label, seat };
        tab.s = createLiveSession({
            seat,
            gid: GID,
            now,
            hostRole,
            send: {
                writeState: (st) => new Promise((res, rej) => {
                    const doc = liveStateToDoc(st);
                    later(latency / 2, () => {
                        if (doc.over && overRejectLeft > 0) { overRejectLeft -= 1; log.overRejected += 1; rej(new Error('permission-denied')); return; }
                        if (!acceptState(doc)) { log.rejected += 1; rej(new Error('permission-denied')); return; }
                        log.accepted += 1;
                        state = doc;
                        res();
                        later(latency / 2, () => tabs.forEach((t) => t.s.onStateDoc(doc, now)));
                    });
                }),
                readState: () => new Promise((res) => later(latency, () => res(state ? { ...state } : null))),
                writeIntent: ({ n, shot }) => new Promise((res) => {
                    const doc = { seat, sid: seat, gid: GID, n, shot };
                    later(latency, () => { res(); tabs.forEach((t) => t.s.onSeatDoc(seat, doc, now)); });
                }),
                // 방 끝내기: 실제 앱은 트랜잭션 안에서 live/state를 다시 읽어 seq·승패가 같을 때만 끝내요(alkkagiLiveMode finishFromHost).
                finish: (r) => {
                    const st = state && sanitizeLiveState(state);
                    const ok = !!(st && st.over && st.seq === r.seq && st.epoch === r.epoch && st.over.winner === r.winner && st.over.endReason === r.endReason);
                    finishes.push({ by: label, ok, ...r });
                },
            },
        });
        tab.s.init(state, { hostSeat: 'black', nowMs: now });
        tabs.push(tab);
        return tab;
    }
    async function run(ms, step = 8) {
        const end = now + ms;
        while (now < end) {
            now += step;
            queue.sort((a, b) => a.at - b.at);
            while (queue.length && queue[0].at <= now) queue.shift().fn();
            tabs.forEach((t) => t.s.tick(now));
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        }
    }
    return { mk, run, tabs, finishes, log, now: () => now, server: () => (state ? sanitizeLiveState(state) : null) };
}

const shot = (id, angle, p) => serializeAlkkagiShot({ id, angle, power: p });
const up = (id, p = 1) => shot(id, -Math.PI / 2, p);
const down = (id, p = 1) => shot(id, Math.PI / 2, p);
const pos = (s) => s.stones().map((t) => [t.id, t.alive, Math.round(t.x * 1000), Math.round(t.y * 1000)]);

/** 판이 끝날 때까지 번갈아 쏴요(흑은 두 창 번갈아, 백은 한 창). */
async function playOut(w, A1, A2, B, rounds = 40) {
    const blackIds = ['b1', 'b2', 'b3', 'b4', 'b5'];
    const whiteIds = ['w1', 'w2', 'w3', 'w4', 'w5'];
    for (let r = 0; r < rounds; r += 1) {
        const who = r % 2 ? A2 : A1;
        const bAlive = who.s.stones().filter((t) => t.alive && t.color === 'black').map((t) => t.id);
        const wAlive = B.s.stones().filter((t) => t.alive && t.color === 'white').map((t) => t.id);
        if (bAlive.length) who.s.shoot(up(bAlive[r % bAlive.length], 1), w.now());
        await w.run(300);
        if (wAlive.length) B.s.shoot(down(wAlive[(r * 3) % wAlive.length] || whiteIds[0], 0.9), w.now());
        await w.run(5400);
        if (w.finishes.length || [A1, A2, B].every((t) => t.s.isFinished())) break;
    }
    await w.run(3000);
    return { blackIds, whiteIds };
}

describe('실시간 알까기: 같은 자리를 맡은 창이 둘(#100 M1)', () => {
    it('창 잠금: 새 창이 맡고 앞 창은 보기만 해요. 세 화면의 판과 기록된 승패가 서버 판과 같아요', async () => {
        const w = makeWorld();
        const A1 = w.mk('A1', 'black');
        const B = w.mk('B', 'white');
        await w.run(500);
        assert.equal(A1.s.isHost(), true);
        // 같은 브라우저 새 창: 새 창이 잠금을 가져가요(앞 창은 잃음)
        const A2 = w.mk('A2', 'black', { hostRole: false });
        await w.run(200);
        A1.s.setHostRole(false, w.now());
        A2.s.setHostRole(true, w.now());
        await w.run(500);
        assert.equal(A1.s.isViewOnly(), true);
        assert.equal(A1.s.isHost(), false);
        assert.equal(A2.s.isHost(), true);
        // 보기만 하는 창은 쏘지 못해요
        assert.equal(A1.s.canShoot(w.now()).error, 'other_tab');
        assert.equal(A1.s.shoot(up('b1'), w.now()).ok, false);
        // A2와 B가 판이 끝날 때까지 둬요
        for (let r = 0; r < 40 && !w.finishes.length; r += 1) {
            const bAlive = A2.s.stones().filter((t) => t.alive && t.color === 'black').map((t) => t.id);
            const wAlive = B.s.stones().filter((t) => t.alive && t.color === 'white').map((t) => t.id);
            if (bAlive.length) A2.s.shoot(up(bAlive[r % bAlive.length], 1), w.now());
            await w.run(300);
            if (wAlive.length) B.s.shoot(down(wAlive[(r * 3) % wAlive.length], 0.5), w.now());
            await w.run(5400);
        }
        await w.run(3000);
        const srv = w.server();
        assert.ok(srv.over, '판이 끝나요');
        assert.equal(w.finishes.length, 1, '방 끝내기는 한 번만');
        assert.equal(w.finishes[0].by, 'A2');
        assert.equal(w.finishes[0].ok, true, '기록한 승패가 서버 판과 같아요');
        assert.deepEqual(pos(A1.s), pos(A2.s));
        assert.deepEqual(pos(B.s), pos(A2.s));
        assert.equal(w.log.rejected, 0, '창 잠금이 있으면 거절되는 쓰기가 없어요');
    });

    it('잠금이 없어도(다른 기기·같은 계정) 두 창이 서로 따라가서 틀린 승패를 기록하지 않아요', async () => {
        const w = makeWorld();
        const A1 = w.mk('A1', 'black');
        const B = w.mk('B', 'white');
        await w.run(500);
        const A2 = w.mk('A2', 'black'); // 둘 다 판 계산을 맡는다고 생각해요(최악)
        await w.run(500);
        assert.equal(A2.s.isHost(), true);
        await playOut(w, A1, A2, B);
        const srv = w.server();
        assert.ok(srv.over, '판이 끝나요');
        assert.ok(w.finishes.length >= 1);
        // 기록하려는 결과는 모두 서버에 저장된 마지막 판(over)과 같아요
        for (const f of w.finishes) assert.equal(f.ok, true, `${f.by} seq ${f.seq} ${f.winner}`);
        // 세 화면이 서버 판으로 모여요
        const srvPos = srv.stones.map((t) => [t.id, t.alive, Math.round(t.x * 1000), Math.round(t.y * 1000)]);
        assert.deepEqual(pos(A1.s), srvPos);
        assert.deepEqual(pos(A2.s), srvPos);
        assert.deepEqual(pos(B.s), srvPos);
    });

    it('seq가 뒤처진 창의 쓰기는 거절되고, 그 창은 서버 판을 다시 읽어 따라가요', async () => {
        const w = makeWorld();
        const A1 = w.mk('A1', 'black');
        const B = w.mk('B', 'white');
        await w.run(500);
        const A2 = w.mk('A2', 'black');
        await w.run(300);
        // A1이 쏘고(seq +1) 같은 순간 A2도 쏴요 → 둘 다 같은 seq로 쓰려 해서 하나는 거절돼요
        A1.s.shoot(up('b1', 1), w.now());
        A2.s.shoot(up('b5', 1), w.now());
        await w.run(4000);
        assert.ok(w.log.rejected >= 1, '뒤처진 쓰기는 거절돼요');
        const failed = [A1, A2].filter((t) => t.s.stats().stateWriteFailed > 0);
        assert.ok(failed.length >= 1);
        failed.forEach((t) => assert.ok(t.s.stats().resyncs >= 1, `${t.label} 다시 읽어 맞춰요`));
        await w.run(3000);
        const srvPos = w.server().stones.map((t) => [t.id, t.alive, Math.round(t.x * 1000), Math.round(t.y * 1000)]);
        assert.deepEqual(pos(A1.s), srvPos);
        assert.deepEqual(pos(A2.s), srvPos);
        assert.deepEqual(pos(B.s), srvPos);
    });

    it('판 끝 스냅샷이 저장되지 않으면 방을 끝내지 않아요(다시 맞춘 뒤 다시 봐요)', async () => {
        const w = makeWorld({ rejectOver: 1 });
        const A1 = w.mk('A1', 'black');
        const B = w.mk('B', 'white');
        await w.run(500);
        for (let r = 0; r < 40 && !w.finishes.length; r += 1) {
            const bAlive = A1.s.stones().filter((t) => t.alive && t.color === 'black').map((t) => t.id);
            if (bAlive.length) A1.s.shoot(up(bAlive[r % bAlive.length], 1), w.now());
            await w.run(5600);
        }
        await w.run(3000);
        assert.equal(w.log.overRejected, 1, '첫 판 끝 쓰기는 거절됐어요');
        assert.equal(w.finishes.length, 1, '거절된 판 끝으로는 끝내지 않고, 다시 맞춘 뒤 한 번만 끝내요');
        assert.equal(w.finishes[0].ok, true);
        assert.ok(w.server().over);
        assert.deepEqual(pos(B.s), pos(A1.s));
    });

    it('보기만 하는 창은 스냅샷을 쓰지 않고, 상대 샷도 판에 넣지 않아요', async () => {
        const w = makeWorld();
        const A1 = w.mk('A1', 'black');
        const B = w.mk('B', 'white');
        await w.run(500);
        const before = A1.s.stats().stateWrites;
        A1.s.setHostRole(false, w.now());
        B.s.shoot(down('w3', 0.6), w.now());
        await w.run(3000);
        assert.equal(A1.s.stats().stateWrites, before, '쓰기 없음');
        assert.equal(A1.s.state().applied.white, 0, '상대 샷도 넣지 않아요(맡은 창이 넣어요)');
        // 다시 맡으면 서버 판을 읽어 맞추고 밀린 샷을 넣어요
        A1.s.setHostRole(true, w.now());
        await w.run(3000);
        assert.equal(A1.s.isHost(), true);
        assert.equal(w.server().applied.white, 1);
        assert.deepEqual(pos(B.s), pos(A1.s));
    });
});
