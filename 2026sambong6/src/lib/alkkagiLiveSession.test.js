import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSession } from './alkkagiLiveSession.js';
import { emptyLiveState, liveStateToDoc } from './alkkagiLiveGame.js';
import { serializeAlkkagiShot } from './alkkagiPhysics.js';

/** 가짜 네트워크: 지연(ms)을 두고 상대에게 전달해요. 시계는 가짜예요. */
function makeNet({ latency = 120, gid = 1000, stateDoc = null, failIntent = 0 } = {}) {
    let now = 0;
    const queue = [];
    const later = (ms, fn) => queue.push({ at: now + ms, fn });
    const finishes = [];
    const log = { stateWrites: 0, intentWrites: 0 };
    const mk = (seat) => {
        const sess = createLiveSession({
            seat,
            gid,
            now,
            // 다시 보내기(#106)도 가짜 시계로 기다려요.
            schedule: (fn, ms) => later(ms, fn),
            send: {
                writeState: (st) => new Promise((res) => {
                    log.stateWrites += 1;
                    const doc = liveStateToDoc(st);
                    later(latency, () => { other(seat).onStateDoc(doc, now); res(); });
                }),
                writeIntent: ({ n, shot }) => new Promise((res, rej) => {
                    log.intentWrites += 1;
                    if (log.intentWrites <= failIntent) { later(latency, () => rej(new Error('permission-denied'))); return; }
                    const doc = { seat, sid: seat, gid, n, shot };
                    later(latency, () => { other(seat).onSeatDoc(seat, doc, now); res(); });
                }),
                finish: (r) => finishes.push({ seat, ...r }),
            },
        });
        return sess;
    };
    const H = mk('black');
    const G = mk('white');
    const other = (seat) => (seat === 'black' ? G : H);
    H.init(stateDoc, { hostSeat: 'black', nowMs: 0 });
    G.init(stateDoc, { hostSeat: 'black', nowMs: 0 });
    async function run(ms, step = 8) {
        const end = now + ms;
        while (now < end) {
            now += step;
            queue.sort((a, b) => a.at - b.at);
            while (queue.length && queue[0].at <= now) queue.shift().fn();
            H.tick(now);
            G.tick(now);
            await Promise.resolve();
            await Promise.resolve();
        }
    }
    return { H, G, run, log, finishes, now: () => now };
}

const up = (id, p = 0.6) => serializeAlkkagiShot({ id, angle: -Math.PI / 2, power: p });
const down = (id, p = 0.6) => serializeAlkkagiShot({ id, angle: Math.PI / 2, power: p });

describe('실시간 알까기 동기화(가짜 네트워크)', () => {
    it('두 사람이 같은 순간에 쏴도 멈춘 뒤 두 화면의 판이 똑같아요', async () => {
        const net = makeNet();
        await net.run(300);
        assert.equal(net.H.isHost(), true);
        assert.equal(net.G.isHost(), false);
        // 같은 순간: 흑 b3은 위로, 백 w3은 아래로(정면 충돌)
        assert.equal(net.H.shoot(up('b3'), net.now()).ok, true);
        assert.equal(net.G.shoot(down('w3'), net.now()).ok, true);
        // 게스트 화면은 바로 움직여요(예측)
        assert.equal(net.G.isMoving(), true);
        await net.run(4000);
        assert.equal(net.H.isMoving(), false);
        assert.equal(net.G.isMoving(), false);
        assert.deepEqual(net.G.stones(), net.H.stones());
        const st = net.H.state();
        assert.equal(st.applied.black, 1);
        assert.equal(st.applied.white, 1);
        assert.equal(st.shots, 2);
        assert.equal(net.G.pending(), null);
        // 프레임마다 쓰지 않아요: 첫 판 + 샷 2번 + 멈춤 정도
        assert.ok(net.log.stateWrites <= 6, `state writes ${net.log.stateWrites}`);
    });

    it('움직이는 중에 들어온 샷도 호스트 한 줄기로 맞춰져요', async () => {
        const net = makeNet({ latency: 200 });
        await net.run(300);
        net.H.shoot(up('b1', 1), net.now());
        await net.run(150);
        net.G.shoot(down('w5', 0.9), net.now());
        await net.run(60);
        net.G.shoot(down('w4', 0.9), net.now()); // 쿨다운이라 안 나가요
        await net.run(5000);
        assert.deepEqual(net.G.stones(), net.H.stones());
        assert.equal(net.H.state().shots, 2);
    });

    it('5초 쿨다운: 남은 시간 동안 막고, 지나면 다시 쏠 수 있어요', async () => {
        const net = makeNet();
        await net.run(100);
        assert.equal(net.G.shoot(down('w1', 0.3), net.now()).ok, true);
        await net.run(1000);
        const left = net.G.cooldownLeft('white', net.now());
        assert.ok(left > 3800 && left <= 4000, `left ${left}`);
        assert.equal(net.G.shoot(down('w2', 0.3), net.now()).error, 'cooldown');
        // 호스트 화면에서도 상대 쿨다운이 보여요
        assert.ok(net.H.cooldownLeft('white', net.now()) > 3000);
        await net.run(4100);
        assert.equal(net.G.cooldownLeft('white', net.now()), 0);
        assert.equal(net.G.shoot(down('w2', 0.3), net.now()).ok, true);
        await net.run(3000);
        assert.equal(net.H.state().applied.white, 2);
    });

    it('규칙을 어긴 빠른 샷(고친 기기)은 호스트가 거절하고, 게스트 화면도 되돌아가요', async () => {
        const net = makeNet();
        await net.run(100);
        net.G.shoot(down('w1', 0.3), net.now());
        await net.run(800);
        // 쿨다운을 무시하고 직접 의도를 보낸 경우
        net.H.onSeatDoc('white', { seat: 'white', sid: 'x', gid: 1000, n: 2, shot: down('w2', 1) });
        await net.run(600);
        const st = net.H.state();
        assert.equal(st.applied.white, 1);
        assert.equal(st.rejected.white, 2);
        await net.run(3000);
        assert.deepEqual(net.G.stones(), net.H.stones());
    });

    it('상대 알을 모두 떨어뜨리면 호스트가 승리로 끝내요', async () => {
        // 백 알 하나만 판 끝에 남기고, 흑 b1을 그 바로 아래에 둬요.
        const st = emptyLiveState({ gid: 1000 });
        st.stones = st.stones.map((s) => {
            if (s.id === 'w1') return { ...s, x: 40, y: 30, alive: true };
            if (s.color === 'white') return { ...s, alive: false };
            if (s.id === 'b1') return { ...s, x: 40, y: 80 };
            return s;
        });
        const net = makeNet({ stateDoc: liveStateToDoc({ ...st, seq: 3 }) });
        await net.run(100);
        net.H.shoot(up('b1', 1), net.now());
        await net.run(4000);
        assert.equal(net.finishes.length, 1);
        assert.equal(net.finishes[0].winner, 'black');
        assert.equal(net.finishes[0].endReason, 'out');
        assert.equal(net.H.isFinished(), true);
        assert.equal(net.G.isFinished(), true);
        assert.equal(net.G.shoot(down('w1'), net.now()).ok, false);
    });

    it('새로고침한 호스트는 저장된 스냅샷에서 이어서 맡아요', () => {
        const st = { ...emptyLiveState({ gid: 1000 }), seq: 7, applied: { black: 3, white: 2 }, shots: 5 };
        const h = createLiveSession({ seat: 'black', gid: 1000, now: 0, send: { writeState: async () => {}, writeIntent: async () => {} } });
        h.init(liveStateToDoc(st), { hostSeat: 'black', nowMs: 0 });
        assert.equal(h.isHost(), true);
        assert.equal(h.myN(), 3);
        assert.equal(h.state().seq, 7);
        // 다른 판(gid)의 스냅샷은 무시하고 새로 시작해요
        const h2 = createLiveSession({ seat: 'black', gid: 2000, now: 0, send: { writeState: async () => {}, writeIntent: async () => {} } });
        h2.init(liveStateToDoc(st), { hostSeat: 'black', nowMs: 0 });
        assert.equal(h2.state().seq, 0);
        assert.equal(h2.state().gid, 2000);
    });
    it('#100 내 자리 번호가 다른 기기 쓰기로 앞서 있으면 따라가서 다음 샷 번호가 막히지 않아요', () => {
        const g = createLiveSession({ seat: 'white', gid: 1000, now: 0, send: { writeState: async () => {}, writeIntent: async () => {} } });
        g.init(liveStateToDoc(emptyLiveState({ gid: 1000 })), { hostSeat: 'black', nowMs: 0 });
        assert.equal(g.myN(), 0);
        g.onSeatDoc('white', { seat: 'white', sid: '5', gid: 1000, n: 2, shot: { v: 1, id: 'w1', a: 0, p: 5000 } }, 10);
        assert.equal(g.myN(), 2);
        // 다른 판·뒤처진 번호는 무시해요
        g.onSeatDoc('white', { seat: 'white', sid: '5', gid: 999, n: 9, shot: null }, 20);
        g.onSeatDoc('white', { seat: 'white', sid: '5', gid: 1000, n: 1, shot: null }, 30);
        assert.equal(g.myN(), 2);
    });
    it('샷 의도를 두 번 다 못 보내면 내 화면에서 거두고 바로 다시 쏠 수 있어요', async () => {
        const net = makeNet({ failIntent: 2 });
        const start = net.G.stones().map((s) => [s.id, s.x, s.y]);
        assert.equal(net.G.shoot(down('w3', 0.8), net.now()).ok, true);
        await net.run(60);
        assert.notDeepEqual(net.G.stones().map((s) => [s.id, s.x, s.y]), start);
        await net.run(1200);
        assert.deepEqual(net.G.stones().map((s) => [s.id, s.x, s.y]), start);
        assert.equal(net.G.drainEvents().fails.length, 1);
        assert.equal(net.G.canShoot(net.now()).ok, true);
        assert.equal(net.G.shoot(down('w3', 0.8), net.now()).ok, true);
        await net.run(4000);
        const a = net.H.stones().map((s) => [s.id, s.alive, s.x, s.y]);
        assert.deepEqual(net.G.stones().map((s) => [s.id, s.alive, s.x, s.y]), a);
        assert.equal(net.H.stats().applied, 1);
    });

    it('#106 한 번 거절된 샷은 잠깐 뒤 다시 보내서, 실패 문구 없이 전달돼요', async () => {
        const net = makeNet({ failIntent: 1 });
        await net.run(100);
        assert.equal(net.G.shoot(down('w3', 0.8), net.now()).ok, true);
        await net.run(4000);
        assert.equal(net.G.drainEvents().fails.length, 0);
        assert.equal(net.H.state().applied.white, 1);
        assert.equal(net.G.stats().intentRetries, 1);
        assert.deepEqual(net.G.stones(), net.H.stones());
    });

    it('#106 내 샷이 든 판이 오기 전의 중간 판으로는 되돌리지 않아요(같은 알이 두 번 굴러가지 않아요)', async () => {
        const net = makeNet({ latency: 300 });
        await net.run(100);
        net.H.shoot(up('b2', 0.9), net.now());
        await net.run(40);
        net.G.shoot(down('w3', 0.8), net.now());
        await net.run(1000);
        assert.ok((net.G.stats().held || 0) >= 1, '중간 판을 들고 있었어요');
        await net.run(5000);
        assert.deepEqual(net.G.stones(), net.H.stones());
        assert.equal(net.G.isHolding(), false);
    });
});
