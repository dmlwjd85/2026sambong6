import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ALKKAGI_DEFAULTS,
    ALKKAGI_DT,
    advanceAlkkagi,
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
