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
    integerIndexPayout,
    isQuoteAdjustmentWindow,
    marketHourSlot,
    seoulYmd,
    msUntilQuoteUiBoundary,
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

describe('서울 날짜', () => {
    it('기기 시각이 아니라 서울 날짜를 쓴다', () => {
        assert.equal(seoulYmd(Date.parse('2026-10-19T14:59:00Z')), '2026-10-19');
        assert.equal(seoulYmd(Date.parse('2026-10-19T15:00:00Z')), '2026-10-20');
        assert.equal(marketHourSlot(Date.parse('2026-10-19T15:30:00Z')), '2026-10-20T00');
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
        const pos = { principal: 100, buyIndex: 1000, openedAt: 0, realizedProfit: 7 };
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

    it('매도 대금은 정수이고 지수 소수 오차가 봉을 바꾸지 않는다', () => {
        const flat = integerIndexPayout(100, 1000, 1000.0000001, 0, 1000, 'floor');
        assert.equal(flat, 100);
        assert.equal(Number.isInteger(flat), true);
        const scaled = integerIndexPayout(33, 1234.56, 1300.01, 0, 86400000, 'round');
        assert.equal(Number.isInteger(scaled), true);
        assert.equal(Number.isNaN(scaled), false);
        const classic = integerIndexPayout(10, 0.1, 0.3, 0, 1000, 'floor');
        assert.equal(classic, 10);
        assert.equal(classic, Number(classic));
    });

    it('날을 나눠 팔아도 같은 보유분의 이익 상한을 넘지 않는다', () => {
        const openedAt = 0;
        const day1 = 2 * 86400000;
        const day2 = 3 * 86400000;
        const price = 2000;
        const once = applySellStock(
            { kospi: { principal: 100, buyIndex: 1000, openedAt } },
            'kospi',
            price,
            { date: '2026-09-03', profit: 0, sells: 0 },
            '2026-09-03',
            day2,
            100
        );
        assert.equal(once.ok, true);
        const first = applySellStock(
            { kospi: { principal: 100, buyIndex: 1000, openedAt, openedDate: '2026-09-01' } },
            'kospi',
            price,
            { date: '2026-09-02', profit: 0, sells: 0 },
            '2026-09-02',
            day1,
            40
        );
        assert.equal(first.ok, true);
        const second = applySellStock(
            first.investments,
            'kospi',
            price,
            { date: '2026-09-03', profit: 0, sells: 0 },
            '2026-09-03',
            day2,
            60
        );
        assert.equal(second.ok, true);
        assert.equal(second.investments.kospi, null);
        const gain = Math.max(0, first.delta) + Math.max(0, second.delta);
        assert.ok(gain <= STOCK_DAILY_PROFIT_CAP, `gain ${gain}`);
        assert.ok(first.payout + second.payout <= once.payout, `split ${first.payout + second.payout} once ${once.payout}`);
        assert.equal(second.daily.date, '2026-09-03');
        assert.equal(second.daily.profit, Math.max(0, second.delta));
        assert.ok(first.investments.kospi.realizedProfit >= Math.max(0, first.delta));
    });

    it('장 밖에는 마지막 시세로 체결하고 정각 전후만 막는다', () => {
        const t1529 = Date.parse('2026-09-02T06:29:00.000Z');
        const t1531 = Date.parse('2026-09-02T06:31:00.000Z');
        const t1802 = Date.parse('2026-09-02T09:02:00.000Z');
        const t1800 = Date.parse('2026-09-02T09:00:30.000Z');
        const t1559 = Date.parse('2026-09-02T06:59:30.000Z');
        const t1600 = Date.parse('2026-09-02T07:00:30.000Z');
        const friEve = Date.parse('2026-09-04T09:02:00.000Z');
        const monBefore = Date.parse('2026-09-06T23:58:00.000Z');
        const monAdjust = Date.parse('2026-09-07T00:00:30.000Z');
        const monOpen = Date.parse('2026-09-07T00:02:00.000Z');
        assert.equal(isKoreanStockSession(t1529), true);
        assert.equal(isKoreanStockSession(t1531), false);
        assert.equal(marketHourSlot(t1529), '2026-09-02T15');
        assert.equal(marketHourSlot(t1531), '2026-09-02T15');
        const q15 = { hourSlot: '2026-09-02T15', kospi: { price: 2500 } };
        const ok1529 = evaluateStockTradeWindow({
            nowMs: t1529, confirmSlot: '2026-09-02T15', confirmPrice: 2500, quotes: q15, marketId: 'kospi',
        });
        assert.equal(ok1529.ok, true);
        assert.equal(ok1529.price, 2500);
        const ok1531 = evaluateStockTradeWindow({
            nowMs: t1531, confirmSlot: '2026-09-02T15', confirmPrice: 2500, quotes: q15, marketId: 'kospi',
        });
        assert.equal(ok1531.ok, true);
        assert.equal(ok1531.slot, '2026-09-02T15');
        const ok1802 = evaluateStockTradeWindow({
            nowMs: t1802, confirmSlot: '2026-09-02T15', confirmPrice: 2500, quotes: q15, marketId: 'kospi',
        });
        assert.equal(ok1802.ok, true);
        assert.equal(ok1802.price, 2500);
        assert.equal(evaluateStockTradeWindow({
            nowMs: t1800, confirmSlot: '2026-09-02T15', confirmPrice: 2500, quotes: q15, marketId: 'kospi',
        }).reason, 'adjusting');
        const badSlot = evaluateStockTradeWindow({
            nowMs: t1802, confirmSlot: '2026-09-02T18', confirmPrice: 2500, quotes: q15, marketId: 'kospi',
        });
        assert.equal(badSlot.reason, 'slot');
        assert.equal(evaluateStockTradeWindow({
            nowMs: t1559, confirmSlot: '2026-09-02T15', confirmPrice: 2500, quotes: q15, marketId: 'kospi',
        }).reason, 'adjusting');
        assert.equal(evaluateStockTradeWindow({
            nowMs: t1600, confirmSlot: '2026-09-02T15', confirmPrice: 2500, quotes: q15, marketId: 'kospi',
        }).reason, 'adjusting');
        const friQ = { hourSlot: '2026-09-04T15', kospi: { price: 2510 } };
        const fri = evaluateStockTradeWindow({
            nowMs: friEve, confirmSlot: '2026-09-04T15', confirmPrice: 2510, quotes: friQ, marketId: 'kospi',
        });
        assert.equal(fri.ok, true);
        assert.equal(fri.slot, '2026-09-04T15');
        assert.equal(fri.price, 2510);
        const monEarly = evaluateStockTradeWindow({
            nowMs: monBefore, confirmSlot: '2026-09-04T15', confirmPrice: 2510, quotes: friQ, marketId: 'kospi',
        });
        assert.equal(monEarly.ok, true);
        assert.equal(monEarly.slot, '2026-09-04T15');
        assert.equal(evaluateStockTradeWindow({
            nowMs: monAdjust,
            confirmSlot: '2026-09-07T09',
            confirmPrice: 2600,
            quotes: { hourSlot: '2026-09-07T09', kospi: { price: 2600 } },
            marketId: 'kospi',
        }).reason, 'adjusting');
        const monOk = evaluateStockTradeWindow({
            nowMs: monOpen,
            confirmSlot: '2026-09-07T09',
            confirmPrice: 2600,
            quotes: { hourSlot: '2026-09-07T09', kospi: { price: 2600 } },
            marketId: 'kospi',
        });
        assert.equal(monOk.ok, true);
        assert.equal(monOk.slot, '2026-09-07T09');
        assert.equal(evaluateStockTradeWindow({
            nowMs: monOpen,
            confirmSlot: '2026-09-04T15',
            confirmPrice: 2510,
            quotes: { hourSlot: '2026-09-07T09', kospi: { price: 2600 } },
            marketId: 'kospi',
        }).reason, 'slot');
        assert.equal(evaluateStockTradeWindow({
            nowMs: monOpen,
            confirmSlot: '2026-09-04T15',
            confirmPrice: 2510,
            quotes: friQ,
            marketId: 'kospi',
        }).reason, 'unavailable');
        const tenPast = Date.parse('2026-09-02T01:02:00.000Z');
        assert.equal(evaluateStockTradeWindow({
            nowMs: tenPast,
            confirmSlot: '2026-09-02T09',
            confirmPrice: 2500,
            quotes: { hourSlot: '2026-09-02T09', kospi: { price: 2500 } },
            marketId: 'kospi',
        }).reason, 'unavailable');
        const ten = Date.parse('2026-09-02T01:00:30.000Z');
        const mid = Date.parse('2026-09-02T01:30:00.000Z');
        const last = Date.parse('2026-09-02T01:59:30.000Z');
        assert.equal(msUntilQuoteUiBoundary(ten), 30 * 1000);
        assert.equal(msUntilQuoteUiBoundary(mid), (59 * 60 - 30 * 60) * 1000);
        assert.equal(msUntilQuoteUiBoundary(last), 30 * 1000);
    });

    it('세 시장과 다시 사기를 합쳐도 하루 이익은 8봉이다', () => {
        const nowMs = 8 * 86400000;
        const today = '2026-09-02';
        const pos = { principal: 1000, buyIndex: 1000, openedAt: 0 };
        let bag = { kospi: { ...pos }, kosdaq: { ...pos }, nasdaq: { ...pos } };
        let daily = { date: today, profit: 0, sells: 0 };
        let gain = 0;
        ['kospi', 'kosdaq', 'nasdaq'].forEach((id) => {
            const sold = applySellStock(bag, id, 2000, daily, today, nowMs, 1000);
            assert.equal(sold.ok, true);
            gain += Math.max(0, sold.delta);
            bag = sold.investments;
            daily = sold.daily;
        });
        assert.equal(gain, STOCK_DAILY_PROFIT_CAP);
        assert.equal(daily.profit, STOCK_DAILY_PROFIT_CAP);
        const bought = applyBuyStock(bag, 'kospi', 100, 1000, nowMs, today);
        assert.equal(bought.ok, true);
        assert.equal(bought.investments.kospi.realizedProfit || 0, 0);
        const again = applySellStock(bought.investments, 'kospi', 2000, daily, today, nowMs, 100);
        assert.equal(again.ok, true);
        assert.equal(again.delta, 0);
        assert.equal(again.payout, 100);
        assert.equal(again.daily.profit, STOCK_DAILY_PROFIT_CAP);
        const dayOnly = applySellStock(
            { nasdaq: { principal: 100, buyIndex: 1000, openedAt: 0, realizedProfit: 0 } },
            'nasdaq',
            2000,
            { date: today, profit: 7, sells: 1 },
            today,
            nowMs,
            100
        );
        assert.equal(dayOnly.delta, 1);
        assert.equal(dayOnly.payout, 101);
    });
});
