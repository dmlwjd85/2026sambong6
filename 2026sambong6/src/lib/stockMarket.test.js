import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    STOCK_DAILY_PROFIT_CAP,
    STOCK_INVEST_MAX,
    applyBuyStock,
    applySellStock,
    canBuyStock,
    clampedIndexRatio,
    extractYahooChartJson,
    formatChangePct,
    formatIndexPrice,
    isKoreanStockSession,
    parseYahooChart,
    sanitizeStockInvestments,
    settleStockPosition,
    shouldFetchLiveMarketQuotes,
} from './stockMarket.js';

describe('지수 파싱', () => {
    it('야후 차트 JSON에서 가격과 등락을 읽는다', () => {
        const json = {
            chart: {
                result: [{
                    meta: {
                        currency: 'KRW',
                        symbol: '^KS11',
                        regularMarketPrice: 2650.5,
                        chartPreviousClose: 2600,
                    },
                }],
            },
        };
        const q = parseYahooChart(json, 'kospi');
        assert.equal(q.id, 'kospi');
        assert.equal(q.price, 2650.5);
        assert.ok(q.changePct > 1.9 && q.changePct < 2.0);
        assert.match(formatIndexPrice(2650.5), /2,650/);
        assert.match(formatChangePct(1.5), /\+1\.50%/);
        const wrapped = extractYahooChartJson('Title\n\n{"chart":{"result":[{"meta":{"regularMarketPrice":10,"chartPreviousClose":10}}]}}');
        assert.equal(parseYahooChart(wrapped, 'nasdaq').price, 10);
    });
});

describe('은행 지수 투자', () => {
    it('한 시장에 한 건만 넣고 금액 한도를 지킨다', () => {
        assert.equal(canBuyStock({ wallet: 9, amount: 10 }).ok, false);
        assert.equal(canBuyStock({ wallet: 20, amount: 10 }).ok, true);
        assert.equal(canBuyStock({ wallet: 200, amount: STOCK_INVEST_MAX + 1 }).ok, false);
        const held = canBuyStock({ wallet: 100, amount: 20, existing: { principal: 20, buyIndex: 2500, openedAt: 1 } });
        assert.equal(held.ok, false);
        const bought = applyBuyStock({}, 'kospi', 20, 2500, 1000, '2026-09-02');
        assert.equal(bought.ok, true);
        assert.equal(bought.investments.kospi.principal, 20);
        assert.equal(applyBuyStock(bought.investments, 'kospi', 20, 2500, 1000, '2026-09-02').ok, false);
    });

    it('등락을 하루 3.5%·전체 12%로 묶고 일일 수익 상한을 둔다', () => {
        assert.equal(clampedIndexRatio(100, 200, 0, 1000), 1.035);
        const week = clampedIndexRatio(100, 200, 0, 8 * 86400000);
        assert.ok(week <= 1.12 + 1e-9);
        const pos = { principal: 100, buyIndex: 1000, openedAt: 0 };
        const up = settleStockPosition(pos, 2000, 1000);
        assert.equal(up.ok, true);
        assert.ok(up.payout <= 104);
        const sold = applySellStock({ kospi: pos }, 'kospi', 2000, { date: '2026-09-02', profit: 7, sells: 0 }, '2026-09-02', 1000);
        assert.equal(sold.ok, true);
        assert.equal(sold.delta, 1);
        assert.equal(sold.payout, 101);
        assert.equal(sold.daily.profit, STOCK_DAILY_PROFIT_CAP);
        assert.equal(sold.investments.kospi, null);
    });

    it('코스닥 포지션을 지키고 한국 장중에만 시세를 다시 읽는다', () => {
        const bag = sanitizeStockInvestments({
            kospi: { principal: 20, buyIndex: 2500, openedAt: 1 },
            kosdaq: { principal: 30, buyIndex: 800, openedAt: 1 },
            nasdaq: { principal: 40, buyIndex: 17000, openedAt: 1 },
        });
        assert.equal(bag.kosdaq.principal, 30);
        const bought = applyBuyStock({}, 'kosdaq', 20, 850, 1000, '2026-09-02');
        assert.equal(bought.ok, true);
        assert.equal(bought.investments.kosdaq.principal, 20);
        // 2026-09-02 수요일 10:00 KST = 01:00 UTC
        assert.equal(isKoreanStockSession(Date.parse('2026-09-02T01:00:00.000Z')), true);
        // 08:00 KST
        assert.equal(isKoreanStockSession(Date.parse('2026-09-01T23:00:00.000Z')), false);
        // 15:30 KST 장마감
        assert.equal(isKoreanStockSession(Date.parse('2026-09-02T06:30:00.000Z')), false);
        // 토요일
        assert.equal(isKoreanStockSession(Date.parse('2026-09-05T01:00:00.000Z')), false);
        assert.equal(shouldFetchLiveMarketQuotes(Date.parse('2026-09-02T01:00:00.000Z'), { hasAnyQuote: true, cacheAgeMs: 60 * 60 * 1000 }), true);
        assert.equal(shouldFetchLiveMarketQuotes(Date.parse('2026-09-02T07:00:00.000Z'), { hasAnyQuote: true, cacheAgeMs: 60 * 60 * 1000 }), false);
        assert.equal(shouldFetchLiveMarketQuotes(Date.parse('2026-09-02T07:00:00.000Z'), { hasAnyQuote: false }), true);
        assert.equal(shouldFetchLiveMarketQuotes(Date.parse('2026-09-02T01:00:00.000Z'), { hasAnyQuote: true, cacheAgeMs: 10 * 60 * 1000, force: false }), false);
    });
});
