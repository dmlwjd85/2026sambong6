import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyBongTone, bongToneClass, isNegativeBong } from './bongTone.js';

describe('마이너스 봉 색', () => {
    it('0보다 작을 때만 빨간 클래스를 붙입니다', () => {
        assert.equal(isNegativeBong(-1), true);
        assert.equal(isNegativeBong(0), false);
        assert.equal(isNegativeBong(12), false);
        assert.equal(isNegativeBong('x'), false);
        assert.equal(bongToneClass(-3), 'bong-neg');
        assert.equal(bongToneClass(3), '');
    });

    it('요소가 있으면 클래스를 켜고 끕니다', () => {
        const el = { classList: { on: false, toggle(name, force) { this.on = name === 'bong-neg' && force; } } };
        applyBongTone(el, -8);
        assert.equal(el.classList.on, true);
        applyBongTone(el, 8);
        assert.equal(el.classList.on, false);
        applyBongTone(null, -1);
    });
});