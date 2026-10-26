import test from 'node:test';
import assert from 'node:assert/strict';
import { ALKKAGI_OLD_LIGHT_KEY, alkkagiProbeWork, createAlkkagiLightProbe, alkkagiShouldGoLight } from './alkkagiPerf.js';

const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('보통 60fps는 켜지지 않아요(가끔 늦은 프레임 포함)', () => {
    assert.equal(alkkagiShouldGoLight(rep(60, () => 16.7)), false);
    assert.equal(alkkagiShouldGoLight(rep(60, (i) => (i % 15 === 0 ? 34 : 16.7))), false);
    assert.equal(alkkagiShouldGoLight(rep(60, () => 8.3)), false); // 120Hz
});

test('가비지 정리처럼 두 번 툭 끊기는 건 켜지지 않아요', () => {
    const f = rep(12, () => 16.7);
    f[3] = 50;
    f[9] = 50;
    assert.equal(alkkagiShouldGoLight(f), false);
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

test('CPU 4배 느린 기기(프레임 30~45ms)는 12프레임 한 묶음이면 느린 묶음이에요', () => {
    assert.equal(alkkagiShouldGoLight(rep(12, (i) => 30 + (i % 4) * 5)), true);
    assert.equal(alkkagiShouldGoLight(rep(11, (i) => 30 + (i % 4) * 5)), false);
});

/** 프레임 목록을 차례로 넣고 몇 번째 프레임에서 켜졌는지(안 켜지면 -1) 돌려줘요. */
function runProbe(frames, busyAt = () => false, probe = createAlkkagiLightProbe()) {
    for (let i = 0; i < frames.length; i += 1) {
        if (probe.push(frames[i], { busy: busyAt(i) }) === 'light') return i;
    }
    return -1;
}

test('가만히 있는 판: 느린 묶음이 연달아 두 번이어야 켜져요', () => {
    // 4배 느린 기기(30~45ms): 처음 6프레임 건너뛰고 12+12프레임 뒤에 켜져요.
    assert.equal(runProbe(rep(60, (i) => 30 + (i % 4) * 5)), 6 + 24 - 1);
    // 1배(16.7ms)는 끝까지 안 켜지고, 정한 묶음을 다 재면 더 재지 않아요.
    const p = createAlkkagiLightProbe();
    assert.equal(runProbe(rep(200, () => 16.7), undefined, p), -1);
    assert.equal(p.done, true);
    // 한 묶음만 느리고(예: 처음 그림 그릴 때) 그다음이 보통이면 안 켜져요.
    assert.equal(runProbe([...rep(6, () => 16.7), ...rep(12, () => 40), ...rep(60, () => 16.7)]), -1);
});

test('처음 몇 프레임·탭 전환 뒤 튀는 프레임은 세지 않아요', () => {
    // 처음 6프레임이 200ms로 튀어도 안 켜져요.
    assert.equal(runProbe([...rep(6, () => 200), ...rep(60, () => 16.7)]), -1);
    // 묶음 하나가 느린 뒤 탭을 다시 열면 연달아 센 것도 처음부터예요.
    const p = createAlkkagiLightProbe();
    assert.equal(runProbe([...rep(6, () => 16.7), ...rep(12, () => 40)], undefined, p), -1);
    p.settle();
    assert.equal(runProbe([...rep(6, () => 200), ...rep(12, () => 40), ...rep(60, () => 16.7)], undefined, p), -1);
});

test('알이 굴러가거나 당기는 중인 프레임은 넣지 않아요', () => {
    // 샷 애니메이션(busy) 동안 50ms가 이어져도 안 켜져요.
    assert.equal(runProbe(rep(120, (i) => (i < 100 ? 50 : 16.7)), (i) => i < 100), -1);
});

test('화면 간격은 60fps여도 정해진 계산이 계속 느리면(5ms 이상) 켜지고, 빠르면 안 켜져요', () => {
    const slow = createAlkkagiLightProbe();
    let at = -1;
    for (let i = 0; i < 80 && at < 0; i += 1) if (slow.push(16.7, { workMs: slow.measuring ? 7 : null }) === 'light') at = i;
    assert.equal(at, 6 + 24 - 1);
    const fast = createAlkkagiLightProbe();
    for (let i = 0; i < 80; i += 1) assert.equal(fast.push(16.7, { workMs: fast.measuring ? (i % 10 === 0 ? 30 : 2) : null }), null);
    assert.equal(fast.done, true);
    assert.equal(fast.measuring, false);
});

test('정해진 계산은 실제로 돌고 걸린 시간을 돌려줘요', () => {
    const ms = alkkagiProbeWork(300);
    assert.ok(Number.isFinite(ms) && ms >= 0);
});

test('예전 사흘 기억 키 이름(지우기만 해요)', () => {
    assert.equal(ALKKAGI_OLD_LIGHT_KEY, 'sambong_alk_light_until');
});
