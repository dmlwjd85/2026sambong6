import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MONEY_NEGATIVE_CLASS,
    formatMoneyHtml,
    isNegativeMoney,
    moneyToneClass,
    splitNegativeMoney,
} from './moneyFormat.js';

describe('음수 금액 표시', () => {
    it('0보다 작은 금액만 음수로 보고 같은 클래스를 씁니다', () => {
        assert.equal(isNegativeMoney(-1), true);
        assert.equal(isNegativeMoney(-0.2), true);
        assert.equal(isNegativeMoney(0), false);
        assert.equal(isNegativeMoney(12), false);
        assert.equal(isNegativeMoney('x'), false);
        assert.equal(moneyToneClass(-3), MONEY_NEGATIVE_CLASS);
        assert.equal(moneyToneClass(3), '');
        assert.equal(formatMoneyHtml('-3B', -3), `<span class="${MONEY_NEGATIVE_CLASS}">-3B</span>`);
        assert.equal(formatMoneyHtml('3B', 3), '3B');
    });

    it('문장 안의 음수 금액만 나누고 다른 글자는 그대로 둡니다', () => {
        const parts = splitNegativeMoney('지갑 -12봉 · 예금 4봉 · -1번', '봉');
        assert.deepEqual(parts, [
            { text: '지갑 ', negative: false },
            { text: '-12봉', negative: true },
            { text: ' · 예금 4봉 · -1번', negative: false },
        ]);
        assert.deepEqual(splitNegativeMoney('잔액 0B', 'B'), [{ text: '잔액 0B', negative: false }]);
    });
});
