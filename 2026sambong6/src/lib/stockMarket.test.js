import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    STOCK_DAILY_PROFIT_CAP,
    STOCK_INVEST_MAX,
    applyBuyStock,
    applySellStock,
    appendStockHistory,
    applyStockBuyFromServer,
    applyStockSellFromServer,
    blendStockBuyIndex,
    canBuyStock,
    canSellStock,
    clampedIndexRatio,
    extractYahooChartJson,
    formatChangePct,
    formatIndexPrice,
    isKoreanStockSession,
    parseYahooChart,
    sanitizeStockInvestments,
    settleStockPosition,
    evaluateStockTradeWindow,
    formatMarketHourSlot,
    isQuoteAdjustmentWindow,
    marketHourSlot,
    shouldFetchLiveMarketQuotes,
    summarizeStudentStockInvest,
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
    it('원금 1000봉까지 추가 매수하고 매수가·수익률을 합산한다', () => {
        assert.equal(canBuyStock({ wallet: 9, amount: 10 }).ok, false);
        assert.equal(canBuyStock({ wallet: 20, amount: 10 }).ok, true);
        assert.equal(canBuyStock({ wallet: 2000, amount: STOCK_INVEST_MAX + 1 }).ok, false);
        const held = canBuyStock({ wallet: 100, amount: 20, existing: { principal: 20, buyIndex: 2500, openedAt: 1 } });
        assert.equal(held.ok, true);
        assert.equal(held.adding, true);
        assert.equal(held.nextPrincipal, 40);
        const bought = applyBuyStock({}, 'kospi', 20, 2500, 1000, '2026-09-02');
        assert.equal(bought.ok, true);
        assert.equal(bought.investments.kospi.principal, 20);
        const added = applyBuyStock(bought.investments, 'kospi', 30, 2800, 2000, '2026-09-03');
        assert.equal(added.ok, true);
        assert.equal(added.added, true);
        assert.equal(added.investments.kospi.principal, 50);
        assert.equal(added.investments.kospi.openedAt, 1000);
        assert.equal(added.investments.kospi.buyIndex, blendStockBuyIndex(20, 2500, 30, 2800));
        const settled = settleStockPosition(added.investments.kospi, 2800, 2000);
        assert.equal(settled.ok, true);
        assert.equal(settled.principal, 50);
        const full = canBuyStock({
            wallet: 2000,
            amount: 10,
            existing: { principal: STOCK_INVEST_MAX, buyIndex: 2500, openedAt: 1 },
        });
        assert.equal(full.ok, false);
        assert.equal(full.reason, 'held_full');
        const over = canBuyStock({
            wallet: 2000,
            amount: 20,
            existing: { principal: STOCK_INVEST_MAX - 10, buyIndex: 2500, openedAt: 1 },
        });
        assert.equal(over.ok, false);
        assert.equal(over.reason, 'over_max');
        assert.equal(applyBuyStock({ kospi: { principal: 995, buyIndex: 2500, openedAt: 1 } }, 'kospi', 10, 2500, 1000, '2026-09-02').ok, false);
    });

    it('등락을 하루 3.5%·전체 12%로 묶고 일일 수익 상한을 둔다', () => {
        assert.equal(clampedIndexRatio(100, 200, 0, 1000), 1.035);
        const week = clampedIndexRatio(100, 200, 0, 8 * 86400000);
        assert.ok(week <= 1.12 + 1e-9);
        const pos = { principal: 100, buyIndex: 1000, openedAt: 0 };
        const up = settleStockPosition(pos, 2000, 1000);
        assert.equal(up.ok, true);
        assert.ok(up.payout <= 104);
        const sold = applySellStock({ kospi: pos }, 'kospi', 2000, { date: '2026-09-02', profit: 7, sells: 0 }, '2026-09-02', 1000, 100);
        assert.equal(sold.ok, true);
        assert.equal(sold.delta, 1);
        assert.equal(sold.payout, 101);
        assert.equal(sold.daily.profit, STOCK_DAILY_PROFIT_CAP);
        assert.equal(sold.investments.kospi, null);
        assert.equal(sold.full, true);
    });

    it('원금 일부를 매도하고 남은 원금·매수가를 지킨다', () => {
        const pos = { principal: 100, buyIndex: 1000, openedAt: 0, openedDate: '2026-09-02' };
        assert.equal(canSellStock({ existing: pos, amount: '' }).ok, false);
        assert.equal(canSellStock({ existing: pos, amount: '' }).reason, 'empty');
        assert.equal(canSellStock({ existing: pos, amount: 0 }).reason, 'empty');
        assert.equal(canSellStock({ existing: pos, amount: null }).reason, 'empty');
        assert.equal(canSellStock({ existing: pos, amount: 9 }).reason, 'min');
        assert.equal(canSellStock({ existing: pos, amount: 40 }).ok, true);
        assert.equal(canSellStock({ existing: pos, amount: 40 }).remaining, 60);
        assert.equal(canSellStock({ existing: pos, amount: 95 }).ok, false);
        assert.equal(canSellStock({ existing: pos, amount: 95 }).reason, 'remainder');
        assert.equal(canSellStock({ existing: pos, amount: 101 }).ok, false);
        const part = applySellStock({ kospi: pos }, 'kospi', 2000, { date: '2026-09-02', profit: 0, sells: 0 }, '2026-09-02', 1000, 40);
        assert.equal(part.ok, true);
        assert.equal(part.principal, 40);
        assert.equal(part.remaining, 60);
        assert.equal(part.full, false);
        assert.equal(part.investments.kospi.principal, 60);
        assert.equal(part.investments.kospi.buyIndex, 1000);
        assert.equal(part.investments.kospi.openedAt, 0);
        assert.ok(part.payout >= 40);
        const rest = applySellStock(part.investments, 'kospi', 2000, part.daily, '2026-09-02', 1000, 60);
        assert.equal(rest.ok, true);
        assert.equal(rest.full, true);
        assert.equal(rest.investments.kospi, null);
        const hist = appendStockHistory([], {
            at: 1000,
            date: '2026-09-02',
            kind: 'sell',
            marketId: 'kospi',
            amount: 40,
            payout: part.payout,
            remaining: 60,
            full: false,
        });
        assert.equal(hist.length, 1);
        assert.equal(hist[0].kind, 'sell');
        assert.equal(hist[0].remaining, 60);
        assert.equal(hist[0].full, false);
        assert.equal(appendStockHistory(hist, { kind: 'nope' }).length, 1);
    });

    it('서버 원금이 없으면 같은 매도를 다시 정산하지 않는다', () => {
        const pos = { principal: 100, buyIndex: 1000, openedAt: 0, openedDate: '2026-09-02' };
        const first = applyStockSellFromServer({
            serverInvestments: { kospi: pos },
            serverDaily: { date: '2026-09-02', profit: 0, sells: 0 },
            serverBong: 50,
            marketId: 'kospi',
            amount: 100,
            currentIndex: 1000,
            today: '2026-09-02',
            nowMs: 1000,
        });
        assert.equal(first.ok, true);
        assert.equal(first.bong, 150);
        assert.equal(first.investments.kospi, null);
        assert.equal(first.history.length, 1);
        assert.equal(first.history[0].kind, 'sell');
        assert.equal(first.history[0].full, true);
        const again = applyStockSellFromServer({
            serverInvestments: first.investments,
            serverDaily: first.daily,
            serverBong: first.bong,
            marketId: 'kospi',
            amount: 100,
            currentIndex: 1000,
            today: '2026-09-02',
            nowMs: 1000,
        });
        assert.equal(again.ok, false);
        assert.equal(again.reason, 'none');
        const overSell = applyStockSellFromServer({
            serverInvestments: { kospi: { principal: 40, buyIndex: 1000, openedAt: 0 } },
            serverDaily: { date: '2026-09-02', profit: 0, sells: 0 },
            serverBong: 10,
            marketId: 'kospi',
            amount: 100,
            currentIndex: 1000,
            today: '2026-09-02',
            nowMs: 1000,
        });
        assert.equal(overSell.ok, false);
        const bought = applyStockBuyFromServer({
            serverInvestments: {},
            serverBong: 50,
            marketId: 'kospi',
            amount: 20,
            buyIndex: 1000,
            today: '2026-09-02',
            nowMs: 1000,
        });
        assert.equal(bought.ok, true);
        assert.equal(bought.bong, 30);
        assert.equal(bought.history[0].kind, 'buy');
        assert.equal(bought.history[0].amount, 20);
        const boughtAgain = applyStockBuyFromServer({
            serverInvestments: bought.investments,
            serverBong: 10,
            marketId: 'kospi',
            amount: 20,
            buyIndex: 1000,
            today: '2026-09-02',
            nowMs: 1000,
        });
        assert.equal(boughtAgain.ok, false);
        assert.equal(boughtAgain.reason, 'wallet');
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
        const ten = Date.parse('2026-09-02T01:00:00.000Z');
        assert.equal(marketHourSlot(ten), '2026-09-02T10');
        assert.equal(shouldFetchLiveMarketQuotes(ten, { hasAnyQuote: true, storedSlot: '2026-09-02T09', cacheAgeMs: 60 * 60 * 1000 }), true);
        assert.equal(shouldFetchLiveMarketQuotes(ten, { hasAnyQuote: true, storedSlot: '2026-09-02T10', force: true }), false);
        assert.equal(shouldFetchLiveMarketQuotes(Date.parse('2026-09-02T07:00:00.000Z'), { hasAnyQuote: true, storedSlot: '2026-09-02T15', cacheAgeMs: 60 * 60 * 1000 }), false);
        assert.equal(shouldFetchLiveMarketQuotes(Date.parse('2026-09-02T07:00:00.000Z'), { hasAnyQuote: false }), true);
        assert.equal(shouldFetchLiveMarketQuotes(ten, { hasAnyQuote: true, storedSlot: '', cacheAgeMs: 10 * 60 * 1000, force: false }), true);
        assert.equal(shouldFetchLiveMarketQuotes(ten, { hasAnyQuote: true, storedSlot: '2026-09-02T10', cacheAgeMs: 10 * 60 * 1000, force: true }), false);
    });

    it('나눠 팔아도 한 번에 팔 때보다 많이 받지 못한다', () => {
        const nowMs = 10 * 86400000;
        const openedAt = 0;
        const prices = [880, 950, 990, 1000, 1020, 1120];
        const plans = [
            [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
            [20, 20, 20, 20, 20],
            [50, 50],
            [10, 20, 30, 40],
            [250, 250, 250, 250],
            [100, 900],
            [10, 990],
        ];
        prices.forEach((price) => {
            plans.forEach((plan) => {
                const total = plan.reduce((sum, n) => sum + n, 0);
                const once = applySellStock(
                    { kospi: { principal: total, buyIndex: 1000, openedAt } },
                    'kospi',
                    price,
                    { date: '2026-09-02', profit: 0, sells: 0 },
                    '2026-09-02',
                    nowMs,
                    total
                );
                assert.equal(once.ok, true);
                let bag = { kospi: { principal: total, buyIndex: 1000, openedAt, openedDate: '2026-09-01' } };
                let daily = { date: '2026-09-02', profit: 0, sells: 0 };
                let sum = 0;
                plan.forEach((amount) => {
                    const sold = applySellStock(bag, 'kospi', price, daily, '2026-09-02', nowMs, amount);
                    assert.equal(sold.ok, true, `price ${price} amount ${amount}`);
                    sum += sold.payout;
                    bag = sold.investments;
                    daily = sold.daily;
                });
                assert.equal(bag.kospi, null);
                assert.ok(sum <= once.payout, `price ${price} plan ${plan.join('+')} split ${sum} one ${once.payout}`);
            });
        });
        const loss = applySellStock(
            { kospi: { principal: 1000, buyIndex: 1000, openedAt } },
            'kospi',
            880,
            { date: '2026-09-02', profit: 0, sells: 0 },
            '2026-09-02',
            nowMs,
            10
        );
        assert.equal(loss.ok, true);
        assert.equal(loss.payout, Math.floor(10 * loss.payout / 10));
        assert.ok(loss.payout <= Math.round(10 * 0.88));
    });

    it('시세 조정 중과 시간대가 바뀐 확인은 거절하고, 정상 시간에는 확인 금액 그대로다', () => {
        const before = Date.parse('2026-09-02T00:59:30.000Z');
        const hour = Date.parse('2026-09-02T01:00:30.000Z');
        const after = Date.parse('2026-09-02T01:02:00.000Z');
        const normal = Date.parse('2026-09-02T01:30:00.000Z');
        assert.equal(isQuoteAdjustmentWindow(before), true);
        assert.equal(isQuoteAdjustmentWindow(hour), true);
        assert.equal(isQuoteAdjustmentWindow(after), false);
        assert.match(formatMarketHourSlot(marketHourSlot(normal)), /10시 시세/);
        const oldSlot = marketHourSlot(before);
        const newSlot = marketHourSlot(after);
        assert.notEqual(oldSlot, newSlot);
        const rejected = evaluateStockTradeWindow({
            nowMs: after,
            confirmSlot: oldSlot,
            confirmPrice: 1000,
            quotes: { hourSlot: newSlot, kospi: { price: 1010 } },
            marketId: 'kospi',
        });
        assert.equal(rejected.ok, false);
        assert.equal(rejected.reason, 'slot');
        const adjusting = evaluateStockTradeWindow({
            nowMs: hour,
            confirmSlot: marketHourSlot(hour),
            confirmPrice: 1000,
            quotes: { hourSlot: marketHourSlot(hour), kospi: { price: 1000 } },
            marketId: 'kospi',
        });
        assert.equal(adjusting.reason, 'adjusting');
        const clientWrong = evaluateStockTradeWindow({
            nowMs: hour,
            confirmSlot: marketHourSlot(normal),
            confirmPrice: 1000,
            quotes: { hourSlot: marketHourSlot(normal), kospi: { price: 1000 } },
            marketId: 'kospi',
        });
        assert.equal(clientWrong.reason, 'adjusting');
        const quotes = { hourSlot: marketHourSlot(normal), kospi: { price: 880 } };
        const preview = applySellStock(
            { kospi: { principal: 100, buyIndex: 1000, openedAt: 0 } },
            'kospi',
            quotes.kospi.price,
            { date: '2026-09-02', profit: 0, sells: 0 },
            '2026-09-02',
            normal,
            10
        );
        const gate = evaluateStockTradeWindow({
            nowMs: normal,
            confirmSlot: quotes.hourSlot,
            confirmPrice: quotes.kospi.price,
            quotes,
            marketId: 'kospi',
        });
        assert.equal(gate.ok, true);
        const filled = applySellStock(
            { kospi: { principal: 100, buyIndex: 1000, openedAt: 0 } },
            'kospi',
            gate.price,
            { date: '2026-09-02', profit: 0, sells: 0 },
            '2026-09-02',
            normal,
            10
        );
        assert.equal(filled.payout, preview.payout);
        assert.equal(filled.principal, 10);
        assert.equal(filled.remaining, 90);
    });

    it('관리용 요약은 시장별 원금·평가를 모은다', () => {
        const stu = {
            stockInvestments: {
                kospi: { principal: 20, buyIndex: 1000, openedAt: 0 },
                nasdaq: { principal: 40, buyIndex: 17000, openedAt: 0 },
            },
        };
        const empty = summarizeStudentStockInvest({}, {}, 1000);
        assert.equal(empty.held, false);
        assert.equal(empty.principal, 0);
        const sum = summarizeStudentStockInvest(stu, { kospi: { price: 1000 } }, 1000);
        assert.equal(sum.held, true);
        assert.equal(sum.principal, 60);
        assert.equal(sum.markets.find((m) => m.id === 'kospi').held, true);
        assert.equal(sum.markets.find((m) => m.id === 'kospi').payout, 20);
        assert.equal(sum.markets.find((m) => m.id === 'kospi').buyIndex, 1000);
        assert.equal(sum.markets.find((m) => m.id === 'kosdaq').held, false);
        assert.equal(sum.markets.find((m) => m.id === 'nasdaq').held, true);
        assert.equal(sum.markets.find((m) => m.id === 'nasdaq').payout, 40);
        assert.equal(sum.markets.find((m) => m.id === 'nasdaq').buyIndex, 17000);
    });
});
