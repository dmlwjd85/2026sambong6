import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSession } from './alkkagiLiveSession.js';
import { emptyLiveState, isNewerLiveState, liveStateToDoc } from './alkkagiLiveGame.js';
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
    it('샷 의도를 못 보내면 내 화면에서 거두고 바로 다시 쏠 수 있어요', async () => {
        const net = makeNet({ failIntent: 1 });
        const start = net.G.stones().map((s) => [s.id, s.x, s.y]);
        assert.equal(net.G.shoot(down('w3', 0.8), net.now()).ok, true);
        await net.run(60);
        assert.notDeepEqual(net.G.stones().map((s) => [s.id, s.x, s.y]), start);
        await net.run(200);
        assert.deepEqual(net.G.stones().map((s) => [s.id, s.x, s.y]), start);
        assert.equal(net.G.drainEvents().fails.length, 1);
        assert.equal(net.G.canShoot(net.now()).ok, true);
        assert.equal(net.G.shoot(down('w3', 0.8), net.now()).ok, true);
        await net.run(4000);
        const a = net.H.stones().map((s) => [s.id, s.alive, s.x, s.y]);
        assert.deepEqual(net.G.stones().map((s) => [s.id, s.alive, s.x, s.y]), a);
        assert.equal(net.H.stats().applied, 1);
    });
});

/**
 * 끊김 시험용 가짜 네트워크: 서버의 live/state를 들고 규칙(epoch·seq가 커져야 함)을 흉내 내요.
 * drop(seat)이면 그 기기는 오프라인: 보내는 것은 쌓아 두고, 받는 것도 못 받아요. restore(seat)이면 쌓인 것을 보내요.
 * 접속 표시는 20초마다 자리 문서를 다시 보내요.
 */
function makeNet2({ latency = 120, gid = 1000, hb = true } = {}) {
    let now = 1000; // 실제 시계처럼 0이 아닌 시각에서 시작해요
    const queue = [];
    const later = (ms, fn) => queue.push({ at: now + ms, fn });
    const finishes = [];
    const off = { black: false, white: false };
    const held = { black: [], white: [] };
    let server = null;
    const seatDocs = { black: { seat: 'black', sid: 'b', gid, n: 0, shot: null }, white: { seat: 'white', sid: 'w', gid, n: 0, shot: null } };
    const lastHb = { black: now, white: now };
    const sessions = {};
    const other = (seat) => (seat === 'black' ? 'white' : 'black');
    const deliver = (seat, fn) => { if (off[seat]) held[seat].push(fn); else later(latency, fn); };
    const toAll = (from, fn) => { for (const s of ['black', 'white']) if (s !== from && !off[s]) fn(sessions[s]); };
    const mk = (seat) => createLiveSession({
        seat,
        gid,
        now,
        send: {
            writeState: (st) => new Promise((res, rej) => {
                const doc = liveStateToDoc(st);
                deliver(seat, () => {
                    if (server && !isNewerLiveState(doc, server)) { rej(new Error('permission-denied')); return; }
                    server = doc;
                    toAll(seat, (o) => o.onStateDoc(doc, now));
                    res();
                });
            }),
            writeIntent: ({ n, shot }) => new Promise((res) => {
                deliver(seat, () => {
                    seatDocs[seat] = { ...seatDocs[seat], n, shot };
                    lastHb[seat] = now;
                    toAll(seat, (o) => o.onSeatDoc(seat, seatDocs[seat], now));
                    res();
                });
            }),
            finish: (r) => finishes.push({ seat, ...r }),
        },
    });
    sessions.black = mk('black');
    sessions.white = mk('white');
    sessions.black.init(null, { hostSeat: 'black', nowMs: now });
    sessions.white.init(null, { hostSeat: 'black', nowMs: now });
    async function run(ms, step = 10) {
        const end = now + ms;
        while (now < end) {
            now += step;
            queue.sort((a, b) => a.at - b.at);
            while (queue.length && queue[0].at <= now) queue.shift().fn();
            for (const s of ['black', 'white']) {
                if (hb && !off[s] && now - lastHb[s] >= 20000) {
                    lastHb[s] = now;
                    later(latency, () => toAll(s, (o) => o.onSeatDoc(s, seatDocs[s], now)));
                }
                sessions[s].tick(now);
            }
            await Promise.resolve();
            await Promise.resolve();
        }
    }
    return {
        B: sessions.black,
        W: sessions.white,
        run,
        finishes,
        now: () => now,
        server: () => server,
        drop(seat) { off[seat] = true; sessions[seat].setConnected(false, now); },
        restore(seat) {
            off[seat] = false;
            sessions[seat].setConnected(true, now);
            held[seat].splice(0).forEach((fn) => later(latency, fn));
            if (server) later(latency * 2, () => sessions[seat].onStateDoc(server, now));
            later(latency * 2, () => sessions[seat].onSeatDoc(other(seat), seatDocs[other(seat)], now));
        },
    };
}

describe('실시간 알까기 끊김·방장 승계(가짜 네트워크)', () => {
    it('접속 표시가 오가면 오래 쉬어도 호스트가 바뀌지 않아요', async () => {
        const net = makeNet2();
        await net.run(120000, 20);
        assert.equal(net.B.isHost(), true);
        assert.equal(net.W.isHost(), false);
        assert.equal(net.finishes.length, 0);
    });

    it('호스트가 45초 조용하면 상대가 넘겨받고, 돌아온 예전 호스트는 게스트가 돼요', async () => {
        const net = makeNet2();
        await net.run(300);
        net.B.shoot(up('b2', 0.5), net.now());
        net.W.shoot(down('w4', 0.5), net.now());
        await net.run(5000);
        assert.deepEqual(net.W.stones(), net.B.stones());
        net.drop('black');
        assert.equal(net.B.canShoot(net.now()).error, 'offline', '내 연결이 끊긴 동안은 못 쏴요');
        await net.run(38000);
        assert.equal(net.W.isHost(), false);
        await net.run(8000);
        assert.equal(net.W.isHost(), true, '45초가 지나 넘겨받아요');
        assert.equal(net.W.drainEvents().net.some((e) => e.type === 'takeover'), true);
        await net.run(500);
        assert.equal(net.server().hostSeat, 'white');
        assert.equal(net.server().epoch, 1);
        // 오프라인인 예전 호스트는 스스로 끊김 무승부를 정하지 않아요
        await net.run(20000);
        assert.equal(net.finishes.length, 0);
        // 넘겨받은 기기가 쏘고, 예전 호스트가 돌아와요
        assert.equal(net.W.shoot(down('w1', 0.7), net.now()).ok, true);
        await net.run(4000);
        net.restore('black');
        await net.run(1000);
        assert.equal(net.B.isHost(), false, '더 높은 epoch를 받아 게스트가 돼요');
        assert.equal(net.B.drainEvents().net.some((e) => e.type === 'lost_host'), true);
        await net.run(3000);
        assert.deepEqual(net.B.stones(), net.W.stones());
        // 예전 호스트가 이제 의도로 쏘면 새 호스트가 넣어요
        assert.equal(net.B.shoot(up('b4', 0.6), net.now()).ok, true);
        await net.run(5000);
        assert.equal(net.W.state().applied.black, 1);
        assert.deepEqual(net.B.stones(), net.W.stones());
        assert.equal(net.finishes.length, 0);
    });

    it('상대가 60초 조용하면 호스트가 연결 끊김 무승부로 끝내요', async () => {
        const net = makeNet2();
        await net.run(300);
        net.drop('white');
        await net.run(58000);
        assert.equal(net.finishes.length, 0);
        await net.run(3000);
        assert.equal(net.finishes.length, 1);
        assert.equal(net.finishes[0].endReason, 'disconnect');
        assert.equal(net.finishes[0].winner, '');
        assert.equal(net.B.isFinished(), true);
        assert.equal(net.server().over.endReason, 'disconnect');
    });

    it('넘겨받은 뒤에도 예전 호스트가 안 돌아오면 60초 뒤 무승부예요', async () => {
        const net = makeNet2();
        await net.run(300);
        net.drop('black');
        await net.run(46000);
        assert.equal(net.W.isHost(), true);
        await net.run(58000);
        assert.equal(net.finishes.length, 0, JSON.stringify(net.W.notes()));
        await net.run(3000);
        assert.equal(net.finishes.length, 1);
        assert.equal(net.finishes[0].seat, 'white');
        assert.equal(net.finishes[0].endReason, 'disconnect');
    });
});
