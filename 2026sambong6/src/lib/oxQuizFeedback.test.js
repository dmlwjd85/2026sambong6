import test from 'node:test';
import assert from 'node:assert/strict';
import { oxFeedbackPlan } from './oxQuizFeedback.js';

test('맞히면 O·정답!·짧은 진동 한 번이에요', () => {
    const p = oxFeedbackPlan('ok');
    assert.equal(p.mark, 'O');
    assert.equal(p.label, '정답!');
    assert.deepEqual(p.vibrate, [35]);
    // 소리가 점점 높아져요(띠링)
    const main = p.notes.filter((n) => n[3] === 'triangle').map((n) => n[0]);
    assert.deepEqual(main, [...main].sort((a, b) => a - b));
});

test('틀리면 X·오답·두 번 진동이에요', () => {
    const p = oxFeedbackPlan('no');
    assert.equal(p.mark, 'X');
    assert.equal(p.label, '오답');
    assert.equal(p.vibrate.filter((_, i) => i % 2 === 0).length, 2);
});

test('시간 초과는 틀림과 같은 소리·진동에 문구만 달라요', () => {
    const a = oxFeedbackPlan('timeout');
    const b = oxFeedbackPlan('no');
    assert.equal(a.label, '시간 초과');
    assert.deepEqual(a.vibrate, b.vibrate);
    assert.deepEqual(a.notes, b.notes);
});

test('모르는 종류는 틀림으로 봐요', () => {
    assert.equal(oxFeedbackPlan('??').mark, 'X');
});
