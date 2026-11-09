import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getKstDateStr } from './kstDate.js';
import { sanitizeStockInvestDaily } from './stockMarket.js';

/** 지수 투자 일일 수익·매도 날짜는 기기 시간대가 아니라 한국 날짜(KST)로 셉니다. */
describe('지수 투자 날짜 — KST', () => {
    it('한국 자정을 넘기면 일일 수익이 새 날로 초기화된다(UTC 15:00 = KST 00:00)', () => {
        const before = getKstDateStr(new Date('2026-11-09T14:59:59Z'));
        const after = getKstDateStr(new Date('2026-11-09T15:00:00Z'));
        assert.equal(before, '2026-11-09');
        assert.equal(after, '2026-11-10');
        const daily = { date: before, profit: 120, sells: 2 };
        assert.deepEqual(sanitizeStockInvestDaily(daily, before), { date: before, profit: 120, sells: 2 });
        assert.deepEqual(sanitizeStockInvestDaily(daily, after), { date: after, profit: 0, sells: 0 });
    });

    it('매수·매도·미리보기·서버 정산 코드는 기기 날짜(getLocalDateStr)를 쓰지 않는다', () => {
        const src = readFileSync(new URL('../sambongWorld.js', import.meta.url), 'utf8');
        const body = (start) => {
            const i = src.indexOf(start);
            assert.ok(i >= 0, start);
            const next = src.indexOf('\n        window.', i + start.length);
            return src.slice(i, next > 0 ? next : undefined);
        };
        for (const start of ['window.buyStockIndex = async function', 'window.sellStockIndex = async function']) {
            const b = body(start);
            assert.ok(!b.includes('getLocalDateStr'), `${start}에 getLocalDateStr가 남아 있음`);
            assert.ok(b.includes('getKstDateStr'), `${start}에 getKstDateStr 없음`);
        }
        const settle = src.slice(src.indexOf('const tradeToday ='), src.indexOf('const tradeToday =') + 120);
        assert.ok(settle.includes('getKstDateStr()'));
        assert.ok(!/previewStockSell\(\{[\s\S]{0,400}?today: getLocalDateStr\(\)/.test(src));
    });
});
