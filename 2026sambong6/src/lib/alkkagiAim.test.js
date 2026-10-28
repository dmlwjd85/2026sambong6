import test from 'node:test';
import assert from 'node:assert/strict';
import { ALKKAGI_AIM_SPREAD, ALKKAGI_TREMBLE_PULL, alkkagiAimAngle, alkkagiAimSpread, alkkagiFinalShot, alkkagiIsTrembling, alkkagiRng } from './alkkagiAim.js';
import { parseAlkkagiShot } from './alkkagiPhysics.js';
import { emptyAlkkagiGame, simulateAlkkagiTurn } from './alkkagiGame.js';

const UP = -Math.PI / 2;

test('약하게 당기면(떨리지 않으면) 오차가 없어요', () => {
    for (const p of [0.05, 0.3, 0.7, 0.9, ALKKAGI_TREMBLE_PULL]) {
        assert.equal(alkkagiIsTrembling(p), false);
        assert.equal(alkkagiAimSpread(p), 0);
        assert.equal(alkkagiAimAngle(UP, p, () => 0.99), UP);
    }
    const shot = alkkagiFinalShot({ id: 'b3', angle: UP, power: 0.6 }, () => 0);
    assert.equal(parseAlkkagiShot(shot).shot.angle, Math.round(UP * 10000) / 10000);
});

test('떨리는 구간에서만, 힘에 비례해서 빗나가요', () => {
    assert.equal(alkkagiIsTrembling(0.96), true);
    assert.ok(alkkagiAimSpread(0.96) > 0);
    assert.ok(alkkagiAimSpread(1) > alkkagiAimSpread(0.96));
    assert.ok(Math.abs(alkkagiAimSpread(1) / alkkagiAimSpread(0.96) - 1 / 0.96) < 1e-9);
    assert.equal(alkkagiAimSpread(1), ALKKAGI_AIM_SPREAD);
    // 끝쪽 난수면 끝까지, 가운데 난수면 그대로
    assert.ok(Math.abs(alkkagiAimAngle(UP, 1, () => 1) - (UP + ALKKAGI_AIM_SPREAD)) < 1e-12);
    assert.ok(Math.abs(alkkagiAimAngle(UP, 1, () => 0) - (UP - ALKKAGI_AIM_SPREAD)) < 1e-12);
    assert.equal(alkkagiAimAngle(UP, 1, () => 0.5), UP);
});

test('오차는 늘 정한 폭 안이고, 여러 번 쏘면 실제로 흩어져요', () => {
    const rnd = alkkagiRng(7);
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) {
        const a = alkkagiAimAngle(UP, 1, rnd);
        assert.ok(Math.abs(a - UP) <= ALKKAGI_AIM_SPREAD + 1e-12);
        seen.add(Math.round((a - UP) * 1000));
    }
    assert.ok(seen.size > 20);
});

test('같은 seed면 같은 수열이에요', () => {
    const a = alkkagiRng(42);
    const b = alkkagiRng(42);
    const c = alkkagiRng(43);
    const xa = Array.from({ length: 5 }, a);
    assert.deepEqual(xa, Array.from({ length: 5 }, b));
    assert.notDeepEqual(xa, Array.from({ length: 5 }, c));
    assert.ok(xa.every((v) => v >= 0 && v < 1));
});

test('쏘는 쪽이 정한 각도가 샷에 들어가고, 받는 쪽은 다시 뽑지 않아도 같은 결과예요', () => {
    const game = emptyAlkkagiGame();
    const shot = alkkagiFinalShot({ id: 'b3', angle: UP, power: 1 }, alkkagiRng(3));
    const parsed = parseAlkkagiShot(shot);
    assert.ok(parsed.ok);
    assert.notEqual(parsed.shot.angle, Math.round(UP * 10000) / 10000, '오차가 실렸어요');
    // 받는 쪽: 같은 직렬화 샷을 두 번 돌려도 똑같아요
    const a = simulateAlkkagiTurn(game, JSON.parse(JSON.stringify(shot)));
    const b = simulateAlkkagiTurn(game, shot);
    assert.deepEqual(a.finalStones, b.finalStones);
    assert.equal(a.steps, b.steps);
});
