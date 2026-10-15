import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { learningThermometerStudentControls } from './learningThermometerControls.js';

describe('학습 온도계 슬라이더', () => {
    it('선생님 인증 전에는 슬라이더와 버튼을 조작할 수 없다', () => {
        const locked = learningThermometerStudentControls({
            id: '3',
            value: 4,
            min: -20,
            max: 20,
            canEdit: false,
            valueClass: 'text-sky-200',
        });
        assert.match(locked, /type="range"/);
        assert.match(locked, /disabled/);
        assert.match(locked, /aria-disabled="true"/);
        assert.match(locked, /tabindex="-1"/);
        assert.match(locked, /inert/);
        assert.doesNotMatch(locked, /oninput=/);
        assert.doesNotMatch(locked, /onchange=/);
        assert.doesNotMatch(locked, /onclick=/);
        assert.equal((locked.match(/<button/g) || []).length, 3);
    });

    it('선생님 인증 후에는 슬라이더와 버튼이 값을 바꾼다', () => {
        const open = learningThermometerStudentControls({
            id: '3',
            value: -2,
            min: -20,
            max: 20,
            canEdit: true,
            valueClass: 'text-rose-200',
        });
        assert.match(open, /oninput="window.updateLearningThermometerStudent\('3'/);
        assert.match(open, /onclick="window.adjustLearningThermometerStudent\('3', -1\)"/);
        assert.doesNotMatch(open, /disabled/);
        assert.doesNotMatch(open, /aria-disabled/);
    });
});