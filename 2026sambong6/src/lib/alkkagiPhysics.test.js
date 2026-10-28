import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ALKKAGI_DEFAULTS,
    ALKKAGI_DT,
    advanceAlkkagi,
    alkkagiKineticEnergy,
    alkkagiStateToDoc,
    parseAlkkagiShot,
    serializeAlkkagiShot,
    verifyAlkkagiReplay,
    applyAlkkagiShot,
    clampAlkkagiPower,
    createAlkkagiRunner,
    createAlkkagiState,
    interpolateAlkkagi,
    isAlkkagiResting,
    simulateAlkkagiShot,
    stepAlkkagi,
} from './alkkagiPhysics.js';

const find = (st, id) => st.stones.find((s) => s.id === id);

function rack() {
    return createAlkkagiState({
        stones: [
            { id: 'b1', color: 'black', x: 120, y: 320 },
            { id: 'b2', color: 'black', x: 200, y: 330 },
            { id: 'b3', color: 'black', x: 280, y: 320 },
            { id: 'w1', color: 'white', x: 110, y: 90 },
            { id: 'w2', color: 'white', x: 190, y: 80 },
            { id: 'w3', color: 'white', x: 210, y: 140 },
            { id: 'w4', color: 'white', x: 300, y: 100 },
        ],
    });
}

describe('alkkagiPhysics', () => {
    it('마찰로 감속하다가 멈춰요 (쿨롱식 거리 v²/2a 근처)', () => {
        const st = createAlkkagiState({ stones: [{ id: 'a', x: 50, y: 200 }], config: { width: 2000 } });
        const r = simulateAlkkagiShot(st, { id: 'a', angle: 0, power: 0.4 });
        assert.equal(r.ok, true);
        assert.equal(isAlkkagiResting(r.state), true);
        assert.equal(r.capped, false);
        const v = 0.4 * ALKKAGI_DEFAULTS.maxShotSpeed;
        const expected = (v * v) / (2 * ALKKAGI_DEFAULTS.frictionDecel);
        const moved = find(r.state, 'a').x - 50;
        assert.ok(Math.abs(moved - expected) < 5, `moved ${moved} expected ${expected}`);
    });

    it('힘은 상한으로 잘려요', () => {
        assert.equal(clampAlkkagiPower(5), 1);
        assert.equal(clampAlkkagiPower(-1), 0);
        const st = createAlkkagiState({ stones: [{ id: 'a', x: 10, y: 10 }] });
        const s = find(applyAlkkagiShot(st, { id: 'a', angle: 0, power: 99 }).state, 'a');
        assert.equal(s.vx, ALKKAGI_DEFAULTS.maxShotSpeed);
    });

    it('같은 질량·e=1 정면 충돌이면 속도가 바뀌어요', () => {
        let st = createAlkkagiState({
            stones: [
                { id: 'a', x: 100, y: 200, vx: 600 },
                { id: 'b', x: 160, y: 200 },
            ],
            config: { restitution: 1, frictionDecel: 0, stopSpeed: 0 },
        });
        for (let i = 0; i < 20; i += 1) st = stepAlkkagi(st).state;
        assert.ok(Math.abs(find(st, 'a').vx) < 1e-6);
        assert.ok(Math.abs(find(st, 'b').vx - 600) < 1e-6);
        assert.equal(find(st, 'b').vy, 0);
    });

    it('비스듬히 맞으면 법선 방향(30°)으로 튀어요', () => {
        const r = ALKKAGI_DEFAULTS.radius;
        let st = createAlkkagiState({
            stones: [
                { id: 'a', x: 100, y: 200, vx: 300 },
                { id: 'b', x: 200, y: 200 - r },
            ],
            config: { restitution: 1, frictionDecel: 0, stopSpeed: 0 },
        });
        for (let i = 0; i < 120; i += 1) st = stepAlkkagi(st).state;
        const a = find(st, 'a');
        const b = find(st, 'b');
        const angB = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;
        const angA = (Math.atan2(a.vy, a.vx) * 180) / Math.PI;
        assert.ok(Math.abs(angB - -30) < 0.5, `b ${angB}`);
        assert.ok(Math.abs(angA - 60) < 0.5, `a ${angA}`);
        assert.ok(Math.abs(Math.hypot(a.vx, a.vy) ** 2 + Math.hypot(b.vx, b.vy) ** 2 - 300 ** 2) < 1);
    });

    it('아주 빨라도 다른 알을 뚫고 지나가지 않아요', () => {
        let st = createAlkkagiState({
            stones: [
                { id: 'a', x: 20, y: 200, vx: 50000 },
                { id: 'b', x: 200, y: 200, radius: 4 },
            ],
            config: { width: 100000, frictionDecel: 0, stopSpeed: 0 },
        });
        st = stepAlkkagi(st).state;
        const a = find(st, 'a');
        const b = find(st, 'b');
        assert.ok(a.x < b.x, `a ${a.x} b ${b.x}`);
        assert.ok(b.vx > 0);
    });

    it('판 밖으로 나가면 탈락해요', () => {
        const st = createAlkkagiState({ stones: [{ id: 'a', x: 380, y: 200 }, { id: 'b', x: 100, y: 100 }] });
        const r = simulateAlkkagiShot(st, { id: 'a', angle: 0, power: 1 });
        assert.deepEqual(r.outs, ['a']);
        assert.equal(find(r.state, 'a').alive, false);
        assert.equal(find(r.state, 'b').alive, true);
    });

    it('같은 입력을 두 번 돌리면 결과가 완전히 같아요', () => {
        const shot = { id: 'b2', angle: -Math.PI / 2 - 0.05, power: 0.9 };
        const r1 = simulateAlkkagiShot(rack(), shot);
        const r2 = simulateAlkkagiShot(rack(), shot);
        assert.ok(r1.hits > 0);
        assert.deepEqual(r1, r2);
    });

    it('프레임 간격이 달라도 결과가 같아요', () => {
        const shot = { id: 'b2', angle: -Math.PI / 2 - 0.05, power: 0.9 };
        const ref = simulateAlkkagiShot(rack(), shot).state;
        const start = applyAlkkagiShot(rack(), shot).state;
        for (const frames of [[1 / 60], [1 / 144], [1 / 30, 1 / 90, 0.007], [0.3]]) {
            let run = createAlkkagiRunner(start);
            let i = 0;
            while (!isAlkkagiResting(run.state) && i < 100000) {
                run = advanceAlkkagi(run, frames[i % frames.length]);
                i += 1;
            }
            assert.deepEqual(run.state, ref);
        }
    });

    it('보간 좌표는 이전과 현재 사이예요', () => {
        let run = createAlkkagiRunner(applyAlkkagiShot(rack(), { id: 'b1', angle: 0, power: 0.5 }).state);
        run = advanceAlkkagi(run, ALKKAGI_DT * 1.5);
        const p = interpolateAlkkagi(run.prev, run.state, run.alpha).find((s) => s.id === 'b1');
        assert.ok(p.x > find(run.prev, 'b1').x && p.x < find(run.state, 'b1').x);
    });
});

const R = ALKKAGI_DEFAULTS.radius;
const noFric = { restitution: 1, frictionDecel: 0, stopSpeed: 0, width: 100000, height: 100000 };

function maxOverlap(st) {
    let m = 0;
    const a = st.stones.filter((s) => s.alive);
    for (let i = 0; i < a.length; i += 1) {
        for (let j = i + 1; j < a.length; j += 1) {
            const d = Math.sqrt((a[i].x - a[j].x) ** 2 + (a[i].y - a[j].y) ** 2);
            m = Math.max(m, a[i].radius + a[j].radius - d);
        }
    }
    return m;
}
const momentum = (st) => st.stones.reduce((p, s) => [p[0] + s.mass * s.vx, p[1] + s.mass * s.vy], [0, 0]);

describe('alkkagiPhysics 여러 알 충돌', () => {
    it('일렬로 띄워 놓은 알은 연쇄로 밀려 마지막 알이 가장 빨라요', () => {
        let st = createAlkkagiState({
            stones: [0, 1, 2, 3, 4].map((i) => ({ id: `s${i}`, x: 100 + i * (2 * R + 6), y: 500, vx: i === 0 ? 800 : 0 })),
            config: noFric,
        });
        for (let i = 0; i < 120; i += 1) st = stepAlkkagi(st).state;
        const v = st.stones.map((s) => s.vx);
        assert.ok(Math.abs(v[4] - 800) < 1e-3, `last ${v[4]}`);
        for (let i = 0; i < 4; i += 1) assert.ok(Math.abs(v[i]) < 1e-3, `s${i} ${v[i]}`);
        assert.ok(Math.abs(momentum(st)[0] - 800) < 1e-3);
    });

    it('서로 붙어 있는 알 묶음을 쳐도 운동량이 보존되고 겹침이 남지 않아요', () => {
        let st = createAlkkagiState({
            stones: [
                { id: 'a', x: 100, y: 500, vx: 900 },
                { id: 'b', x: 300, y: 500 },
                { id: 'c', x: 300 + 2 * R, y: 500 },
                { id: 'd', x: 300 + R, y: 500 - Math.sqrt(3) * R },
                { id: 'e', x: 300 + R, y: 500 + Math.sqrt(3) * R },
            ],
            config: { ...noFric, restitution: 0.9 },
        });
        const e0 = alkkagiKineticEnergy(st);
        for (let i = 0; i < 240; i += 1) st = stepAlkkagi(st).state;
        const [px, py] = momentum(st);
        assert.ok(Math.abs(px - 900) < 1e-2 && Math.abs(py) < 1e-2, `p ${px},${py}`);
        assert.ok(alkkagiKineticEnergy(st) <= e0 + 1e-6);
        assert.ok(maxOverlap(st) < 0.05, `overlap ${maxOverlap(st)}`);
        assert.ok(st.stones.every((s) => s.vx !== 0 || s.vy !== 0));
    });
});

describe('alkkagiPhysics 터널링', () => {
    for (const deg of [0, 17, 45, 90, 133, 180, 225, 271, 314]) {
        it(`최대 힘 ${deg}° 방향으로 쳐도 앞 알을 뚫지 않아요`, () => {
            const ang = (deg * Math.PI) / 180;
            const st = createAlkkagiState({
                stones: [
                    { id: 'a', x: 1000, y: 1000 },
                    { id: 'b', x: 1000 + Math.cos(ang) * (2 * R + 1), y: 1000 + Math.sin(ang) * (2 * R + 1), radius: R },
                ],
                config: { width: 100000, height: 100000 },
            });
            const r = simulateAlkkagiShot(st, { id: 'a', angle: ang, power: 1 });
            const a = find(r.state, 'a');
            const b = find(r.state, 'b');
            const proj = (s) => (s.x - 1000) * Math.cos(ang) + (s.y - 1000) * Math.sin(ang);
            assert.ok(r.hits > 0);
            assert.ok(proj(a) < proj(b), `a ${proj(a)} b ${proj(b)}`);
        });
    }

    it('알 지름보다 좁은 틈으로 최대 힘을 써도 겹쳐 지나가지 않고 양쪽 알을 밀어내요', () => {
        const gap = 2 * R - 2; // 두 알 사이 빈틈(지름보다 2px 좁음)
        let st = applyAlkkagiShot(createAlkkagiState({
            stones: [
                { id: 'a', x: 200, y: 500 },
                { id: 'l', x: 600, y: 500 - R - gap / 2 },
                { id: 'r', x: 600, y: 500 + R + gap / 2 },
            ],
            config: { width: 100000, height: 100000 },
        }), { id: 'a', angle: 0, power: 1 }).state;
        let worst = 0;
        let hits = 0;
        for (let k = 0; k < 400 && !isAlkkagiResting(st); k += 1) {
            const r = stepAlkkagi(st);
            st = r.state;
            hits += r.hits.length;
            worst = Math.max(worst, maxOverlap(st));
        }
        assert.ok(hits >= 2, `hits ${hits}`);
        assert.ok(worst < 0.5, `overlap ${worst}`);
        assert.ok(find(st, 'l').vy <= 0 && find(st, 'l').y < 500 - R - gap / 2);
        assert.ok(find(st, 'r').y > 500 + R + gap / 2);
    });
});

describe('alkkagiPhysics 에너지', () => {
    const layouts = [
        [{ id: 'a', x: 100, y: 200, vx: 1400 }, { id: 'b', x: 200, y: 205 }],
        [{ id: 'a', x: 100, y: 200, vx: 900, vy: 300 }, { id: 'b', x: 180, y: 230 }, { id: 'c', x: 200, y: 260 }],
        [{ id: 'a', x: 50, y: 50, vx: 1000, vy: 1000 }, { id: 'b', x: 150, y: 150 }, { id: 'c', x: 150 + 2 * R, y: 150 }, { id: 'd', x: 150, y: 150 + 2 * R }],
        [{ id: 'a', x: 100, y: 300, vx: 700 }, { id: 'b', x: 400, y: 300, vx: -700 }, { id: 'c', x: 250, y: 100, vy: 500 }],
    ];
    for (const [i, stones] of layouts.entries()) {
        for (const restitution of [1, 0.9, 0.5]) {
            it(`배치 ${i + 1}, e=${restitution}: 어떤 스텝에서도 운동에너지가 늘지 않아요`, () => {
                let st = createAlkkagiState({ stones, config: { width: 100000, height: 100000, restitution } });
                let prev = alkkagiKineticEnergy(st);
                let hits = 0;
                for (let k = 0; k < 600 && !isAlkkagiResting(st); k += 1) {
                    const r = stepAlkkagi(st);
                    st = r.state;
                    hits += r.hits.length;
                    const e = alkkagiKineticEnergy(st);
                    assert.ok(e <= prev * (1 + 1e-9) + 1e-6, `step ${k}: ${e} > ${prev}`);
                    prev = e;
                }
                assert.ok(hits > 0);
            });
        }
    }
});

describe('alkkagiPhysics 결정성·프레임', () => {
    const shot = { id: 'b2', angle: -Math.PI / 2 - 0.05, power: 0.9 };

    it('여러 샷을 이어 쳐도 두 번 돌린 결과가 비트 단위로 같아요', () => {
        const play = () => {
            let st = rack();
            for (const s of [shot, { id: 'w2', angle: 1.4, power: 1 }, { id: 'b3', angle: -2.2, power: 0.7 }]) {
                st = simulateAlkkagiShot(st, s).state;
            }
            return JSON.stringify(st);
        };
        assert.equal(play(), play());
    });

    it('각도·힘은 1/10000 단위로 맞춰져서 아주 작은 차이는 같은 결과가 돼요', () => {
        const a = simulateAlkkagiShot(rack(), shot).state;
        const b = simulateAlkkagiShot(rack(), { ...shot, angle: shot.angle + 1e-7, power: shot.power - 1e-7 }).state;
        assert.deepEqual(a, b);
    });

    it('2초씩 끊겨도, 프레임 상한에 걸려도 최종 결과가 같아요', () => {
        const ref = simulateAlkkagiShot(rack(), shot).state;
        const start = applyAlkkagiShot(rack(), shot).state;
        for (const frames of [[2], [0.5, 0.001], [1 / 240]]) {
            let run = createAlkkagiRunner(start);
            for (let i = 0; i < 200000 && !isAlkkagiResting(run.state); i += 1) run = advanceAlkkagi(run, frames[i % frames.length]);
            assert.deepEqual(run.state, ref);
        }
        const one = advanceAlkkagi(createAlkkagiRunner(start), 10);
        assert.ok(one.state.step <= 30, `한 프레임 스텝 ${one.state.step}`);
    });
});

describe('alkkagiPhysics 대전 동기화', () => {
    const shot = { id: 'b2', angle: -Math.PI / 2 - 0.05, power: 0.9 };

    it('샷을 직렬화하면 JSON으로 오가도 같은 값이에요', () => {
        const raw = serializeAlkkagiShot(shot);
        assert.deepEqual(raw, { v: 1, id: 'b2', a: -16208, p: 9000 });
        const back = parseAlkkagiShot(JSON.parse(JSON.stringify(raw)), { state: rack(), color: 'black' });
        assert.equal(back.ok, true);
        assert.deepEqual(back.shot, { id: 'b2', angle: -1.6208, power: 0.9 });
        assert.equal(serializeAlkkagiShot({ id: 'b2', angle: 7 * Math.PI, power: 3 }).p, 10000);
        assert.equal(serializeAlkkagiShot({ id: '', angle: 0, power: 1 }), null);
    });

    it('잘못된 샷은 거절해요', () => {
        const st = rack();
        const ok = serializeAlkkagiShot(shot);
        assert.equal(parseAlkkagiShot(null).error, 'invalid-shot');
        assert.equal(parseAlkkagiShot({ ...ok, v: 2 }).error, 'invalid-version');
        assert.equal(parseAlkkagiShot({ ...ok, a: 1.5 }).error, 'invalid-angle');
        assert.equal(parseAlkkagiShot({ ...ok, a: 99999 }).error, 'invalid-angle');
        assert.equal(parseAlkkagiShot({ ...ok, p: 0 }).error, 'invalid-power');
        assert.equal(parseAlkkagiShot({ ...ok, p: 10001 }).error, 'invalid-power');
        assert.equal(parseAlkkagiShot({ ...ok, id: 'zz' }, { state: st }).error, 'invalid-stone');
        assert.equal(parseAlkkagiShot(ok, { state: st, color: 'white' }).error, 'not-your-stone');
        const dead = simulateAlkkagiShot(createAlkkagiState({ stones: [{ id: 'a', x: 390, y: 10 }] }), { id: 'a', angle: 0, power: 1 }).state;
        assert.equal(parseAlkkagiShot({ ...ok, id: 'a' }, { state: dead }).error, 'invalid-stone');
    });

    it('같은 시작 상태와 샷으로 재생하면 친 사람의 확정 좌표와 같아요', () => {
        const raw = serializeAlkkagiShot(shot);
        const confirmed = alkkagiStateToDoc(simulateAlkkagiShot(rack(), parseAlkkagiShot(raw).shot).state);
        const v = verifyAlkkagiReplay(rack(), JSON.parse(JSON.stringify(raw)), JSON.parse(JSON.stringify(confirmed)));
        assert.equal(v.ok, true);
        assert.deepEqual(v.mismatches, []);
    });

    it('확정 좌표가 다르면 어긋난 알을 알려 줘요', () => {
        const raw = serializeAlkkagiShot(shot);
        const confirmed = alkkagiStateToDoc(simulateAlkkagiShot(rack(), parseAlkkagiShot(raw).shot).state);
        confirmed.find((d) => d.id === 'w3').x += 0.001;
        const v = verifyAlkkagiReplay(rack(), raw, confirmed);
        assert.equal(v.ok, false);
        assert.deepEqual(v.mismatches, ['w3']);
        assert.equal(verifyAlkkagiReplay(rack(), raw, confirmed, { tolerance: 0.01 }).ok, true);
    });
});
