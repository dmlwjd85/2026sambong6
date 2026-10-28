import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createAlkkagiGestureState, alkkagiGestureDown, alkkagiGestureMove, alkkagiGestureUp, alkkagiGestureCancel, alkkagiPointInside,
} from './alkkagiGesture.js';

const C = 14;
const start = () => alkkagiGestureDown(createAlkkagiGestureState(), { pointerId: 1, canStart: true });

test('한 손가락으로 당겨서 안에서 놓으면 발사', () => {
    const a = start();
    assert.equal(a.action, 'start');
    const b = alkkagiGestureUp(a.state, { pointerId: 1, inside: true, dist: 80, cancelDist: C });
    assert.equal(b.action, 'fire');
    assert.equal(b.state.drag, null);
});

test('알 가까이(12px 안)로 돌아와 놓으면 취소', () => {
    const b = alkkagiGestureUp(start().state, { pointerId: 1, inside: true, dist: 6, cancelDist: C });
    assert.equal(b.action, 'cancel');
});

test('화면이나 판 밖에서 놓으면 취소, 돌아와서 놓으면 발사', () => {
    let s = start().state;
    s = alkkagiGestureMove(s, { pointerId: 1, inside: false }).state;
    assert.equal(s.drag.outside, true);
    assert.equal(alkkagiGestureUp(s, { pointerId: 1, inside: false, dist: 200, cancelDist: C }).action, 'cancel');
    s = alkkagiGestureMove(s, { pointerId: 1, inside: true }).state;
    assert.equal(s.drag.outside, false);
    assert.equal(alkkagiGestureUp(s, { pointerId: 1, inside: true, dist: 90, cancelDist: C }).action, 'fire');
});

test('좌표가 이상하면(NaN) 안전하게 취소', () => {
    assert.equal(alkkagiGestureUp(start().state, { pointerId: 1, inside: true, dist: NaN, cancelDist: C }).action, 'cancel');
    assert.equal(alkkagiPointInside(NaN, 3, { left: 0, top: 0, right: 10, bottom: 10 }), false);
    assert.equal(alkkagiPointInside(10, 10, { left: 0, top: 0, right: 10, bottom: 10 }), true);
    assert.equal(alkkagiPointInside(11, 5, { left: 0, top: 0, right: 10, bottom: 10 }), false);
});

test('pointercancel / lostpointercapture면 취소', () => {
    const b = alkkagiGestureCancel(start().state, { pointerId: 1 });
    assert.equal(b.action, 'cancel');
    assert.equal(b.state.pointers.length, 0);
    assert.equal(b.state.locked, false);
});

test('끄는 중 두 번째 손가락이 닿으면 취소하고 다 뗄 때까지 잠금', () => {
    let s = start().state;
    const d2 = alkkagiGestureDown(s, { pointerId: 2, canStart: true });
    assert.equal(d2.action, 'cancel');
    s = d2.state;
    assert.equal(s.locked, true);
    // 첫 손가락을 떼도 발사하지 않아요
    let u = alkkagiGestureUp(s, { pointerId: 1, inside: true, dist: 90, cancelDist: C });
    assert.equal(u.action, 'none');
    s = u.state;
    assert.equal(s.locked, true);
    // 아직 한 손가락이 남아 있으면 새 끌기 안 받음
    assert.equal(alkkagiGestureDown(s, { pointerId: 3, canStart: true }).action, 'none');
    u = alkkagiGestureUp(s, { pointerId: 2, inside: true, dist: 0, cancelDist: C });
    s = u.state;
    assert.equal(s.locked, false);
    assert.equal(s.pointers.length, 0);
    assert.equal(alkkagiGestureDown(s, { pointerId: 4, canStart: true }).action, 'start');
});

test('두 손가락이 동시에 닿으면 끌기를 시작하지 않음', () => {
    let s = createAlkkagiGestureState();
    s = alkkagiGestureDown(s, { pointerId: 1, canStart: false }).state; // 첫 손가락은 알 밖
    const d = alkkagiGestureDown(s, { pointerId: 2, canStart: true });
    assert.equal(d.action, 'none');
    assert.equal(d.state.drag, null);
    assert.equal(d.state.locked, true);
});

test('두 번째 손가락이 pointercancel로 빠져도 첫 손가락 떼기 전까지 잠금 유지', () => {
    let s = start().state;
    s = alkkagiGestureDown(s, { pointerId: 2, canStart: true }).state;
    s = alkkagiGestureCancel(s, { pointerId: 2 }).state;
    assert.equal(s.locked, true);
    s = alkkagiGestureUp(s, { pointerId: 1, inside: true, dist: 90, cancelDist: C }).state;
    assert.equal(s.locked, false);
});

test('다른 손가락 이벤트는 끌기에 영향 없음', () => {
    const s = start().state;
    assert.equal(alkkagiGestureMove(s, { pointerId: 9, inside: false }).action, 'none');
    assert.equal(alkkagiGestureCancel(s, { pointerId: 9, release: false }).action, 'none');
});
