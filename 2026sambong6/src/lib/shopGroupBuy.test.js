import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    canSettleShopGroupBuy,
    shopGroupBuySettleExtra,
    sumGroupBuyContributions,
    toNaturalContribution,
} from './shopGroupBuy.js';

describe('공동구매 구매처리', () => {
    it('모금액이 있으면 목표 전이라도 구매처리할 수 있다', () => {
        assert.equal(toNaturalContribution(12.4), 12);
        assert.equal(sumGroupBuyContributions({ '1': 20, '2': 15, gm: 9 }), 35);
        assert.equal(canSettleShopGroupBuy(0).ok, false);
        assert.equal(canSettleShopGroupBuy(120).ok, true);
        assert.equal(canSettleShopGroupBuy(120).total, 120);
        const extra = shopGroupBuySettleExtra(1700000000000, 120, {
            note: '체육시간 이미 구매',
            actor: 'migration',
            contributions: { '1': 80, '2': 40 },
        });
        assert.equal(extra.lastSettleOriginalTotal, 120);
        assert.equal(extra.lastSettleBy, 'migration');
        assert.equal(extra.lastSettleContributions['1'], 80);
    });
});
