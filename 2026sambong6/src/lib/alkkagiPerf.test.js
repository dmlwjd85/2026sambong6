import test from 'node:test';
import assert from 'node:assert/strict';
import { alkkagiShouldGoLight } from './alkkagiPerf.js';

const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('보통 60fps는 켜지지 않아요(가끔 늦은 프레임 포함)', () => {
    assert.equal(alkkagiShouldGoLight(rep(60, () => 16.7)), false);
    assert.equal(alkkagiShouldGoLight(rep(60, (i) => (i % 15 === 0 ? 34 : 16.7))), false);
    assert.equal(alkkagiShouldGoLight(rep(60, () => 8.3)), false); // 120Hz
});

test('16/33ms가 번갈아 나오는 기기(평균 46fps, 최대 117ms)는 켜져요', () => {
    const f = rep(60, (i) => (i % 4 === 0 ? 33.4 : 16.7));
    f[40] = 117;
    assert.equal(alkkagiShouldGoLight(f), true);
});

test('계속 느리면 켜지고, 프레임 수가 적으면 아직 판단하지 않아요', () => {
    assert.equal(alkkagiShouldGoLight(rep(30, () => 22)), true);
    assert.equal(alkkagiShouldGoLight(rep(10, () => 50)), false);
    assert.equal(alkkagiShouldGoLight(null), false);
});
