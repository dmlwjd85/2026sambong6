import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupBuyOrder, groupBuyOrderHtml, pendingGroupBuyOrders } from './groupBuyOrder.js';

describe('공동구매 주문서', () => {
    it('입금이 많은 순으로 정리하고 합계를 내요', () => {
        const o = buildGroupBuyOrder({ shopId: 's4', shopName: '체육시간', price: 100, contributions: { 3: 20, 1: 50, 2: 30, 9: 0 }, by: '2', byName: '철수', at: 1000 });
        assert.equal(o.id, 's4_1000');
        assert.deepEqual(o.list.map((x) => x.id), ['1', '2', '3']);
        assert.equal(o.total, 100);
    });
    it('확인하지 않은 주문만, 오래된 것부터 보여 줘요', () => {
        const now = 20 * 86400000;
        const pools = {
            a: { lastOrder: { id: 'a_2', at: now - 2 }, lastOrderSeen: '' },
            b: { lastOrder: { id: 'b_1', at: now - 5 } },
            c: { lastOrder: { id: 'c_1', at: now - 1 }, lastOrderSeen: 'c_1' },
            d: { lastOrder: { id: 'd_1', at: 1 } },
            e: { contributions: {} },
        };
        assert.deepEqual(pendingGroupBuyOrders(pools, { now }).map((x) => x.id), ['b_1', 'a_2']);
    });
    it('이름과 금액을 표로 그리고 글자를 안전하게 바꿔요', () => {
        const o = buildGroupBuyOrder({ shopId: 's', shopName: '<b>간식</b>', price: 10, contributions: { 7: 10 }, at: 5 });
        const html = groupBuyOrderHtml(o, { nameOf: () => '영희', bong: (n) => `${n}봉`, timeText: () => 't' });
        assert.ok(html.includes('영희'));
        assert.ok(html.includes('10봉'));
        assert.ok(html.includes('&lt;b&gt;간식'));
    });
});
