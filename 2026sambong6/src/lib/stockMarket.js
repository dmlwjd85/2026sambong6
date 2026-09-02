/**
 * 코스피·나스닥 시세와 학급 은행 투자.
 * 시세는 공개 차트 API를 쓰고, 수익은 인플레이션을 막기 위해 작게 묶습니다.
 */

export const STOCK_MARKETS = [
    { id: 'kospi', name: '코스피', symbol: '^KS11' },
    { id: 'nasdaq', name: '나스닥', symbol: '^IXIC' },
];

export const STOCK_INVEST_MIN = 10;
export const STOCK_INVEST_MAX = 150;
export const STOCK_DAILY_PROFIT_CAP = 8;
export const STOCK_MAX_ABS_MOVE_PER_DAY = 0.035;
export const STOCK_MAX_ABS_MOVE_TOTAL = 0.12;

export function getStockMarket(id) {
    return STOCK_MARKETS.find((m) => m.id === String(id || '')) || null;
}

export function yahooChartUrl(symbol) {
    const s = encodeURIComponent(String(symbol || ''));
    return `https://query2.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=2d`;
}

/** 브라우저 CORS를 피하기 위한 읽기 전용 프록시 */
export function yahooChartProxyUrl(symbol) {
    return `https://r.jina.ai/${yahooChartUrl(symbol).replace('https://', 'http://')}`;
}

export function extractYahooChartJson(text) {
    const raw = String(text || '');
    const start = raw.indexOf('{"chart"');
    if (start < 0) return null;
    const sliced = raw.slice(start);
    try {
        return JSON.parse(sliced);
    } catch (e) {
        const end = sliced.lastIndexOf('}');
        if (end < 1) return null;
        try {
            return JSON.parse(sliced.slice(0, end + 1));
        } catch (e2) {
            return null;
        }
    }
}

export function parseYahooChart(json, marketId) {
    const result = json && json.chart && Array.isArray(json.chart.result) ? json.chart.result[0] : null;
    if (!result || !result.meta) return null;
    const meta = result.meta;
    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose || meta.previousClose);
    if (!Number.isFinite(price) || price <= 0) return null;
    const prevOk = Number.isFinite(prev) && prev > 0 ? prev : price;
    return {
        id: String(marketId || ''),
        price,
        prev: prevOk,
        changePct: prevOk ? ((price - prevOk) / prevOk) * 100 : 0,
        currency: String(meta.currency || ''),
        fetchedAt: Date.now(),
    };
}

export function formatIndexPrice(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return x.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatChangePct(pct) {
    const x = Number(pct);
    if (!Number.isFinite(x)) return '—';
    const sign = x > 0 ? '+' : '';
    return `${sign}${x.toFixed(2)}%`;
}

export function sanitizeStockPosition(raw) {
    const src = raw && typeof raw === 'object' ? raw : null;
    if (!src) return null;
    const principal = Math.floor(Number(src.principal) || 0);
    const buyIndex = Number(src.buyIndex);
    const openedAt = Math.floor(Number(src.openedAt) || 0);
    if (principal < STOCK_INVEST_MIN || principal > STOCK_INVEST_MAX) return null;
    if (!Number.isFinite(buyIndex) || buyIndex <= 0) return null;
    return {
        principal,
        buyIndex,
        openedAt,
        openedDate: String(src.openedDate || '').slice(0, 10),
    };
}

export function sanitizeStockInvestments(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        kospi: sanitizeStockPosition(src.kospi),
        nasdaq: sanitizeStockPosition(src.nasdaq),
    };
}

export function sanitizeStockInvestDaily(raw, today) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const date = String(src.date || '');
    if (date !== String(today || '')) {
        return { date: String(today || ''), profit: 0, sells: 0 };
    }
    return {
        date,
        profit: Math.max(0, Number(src.profit) || 0),
        sells: Math.max(0, Math.floor(Number(src.sells) || 0)),
    };
}

export function clampedIndexRatio(buyIndex, currentIndex, openedAt, nowMs) {
    const buy = Number(buyIndex);
    const cur = Number(currentIndex);
    if (!Number.isFinite(buy) || buy <= 0 || !Number.isFinite(cur) || cur <= 0) return 1;
    const raw = cur / buy;
    const days = Math.max(1, Math.ceil((Math.max(0, Number(nowMs) || 0) - Math.max(0, Number(openedAt) || 0)) / 86400000));
    const cap = Math.min(STOCK_MAX_ABS_MOVE_TOTAL, days * STOCK_MAX_ABS_MOVE_PER_DAY);
    const lo = 1 - cap;
    const hi = 1 + cap;
    return Math.max(lo, Math.min(hi, raw));
}

export function settleStockPosition(pos, currentIndex, nowMs = Date.now()) {
    const row = sanitizeStockPosition(pos);
    if (!row) return { ok: false, reason: 'none' };
    const ratio = clampedIndexRatio(row.buyIndex, currentIndex, row.openedAt, nowMs);
    const payout = Math.max(0, Math.round(row.principal * ratio));
    const delta = payout - row.principal;
    return { ok: true, principal: row.principal, payout, delta, ratio };
}

export function canBuyStock({ wallet, amount, existing }) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt < STOCK_INVEST_MIN || amt > STOCK_INVEST_MAX) return { ok: false, reason: 'amount' };
    if (sanitizeStockPosition(existing)) return { ok: false, reason: 'held' };
    const w = Number(wallet) || 0;
    if (w + 0.0001 < amt) return { ok: false, reason: 'wallet' };
    return { ok: true, amount: amt };
}

export function applyBuyStock(investments, marketId, amount, buyIndex, nowMs, today) {
    const market = getStockMarket(marketId);
    if (!market) return { ok: false, reason: 'market' };
    const bag = sanitizeStockInvestments(investments);
    if (bag[market.id]) return { ok: false, reason: 'held' };
    const idx = Number(buyIndex);
    if (!Number.isFinite(idx) || idx <= 0) return { ok: false, reason: 'quote' };
    const amt = Math.floor(Number(amount) || 0);
    bag[market.id] = {
        principal: amt,
        buyIndex: idx,
        openedAt: Math.floor(Number(nowMs) || Date.now()),
        openedDate: String(today || ''),
    };
    return { ok: true, investments: bag };
}

export function applySellStock(investments, marketId, currentIndex, daily, today, nowMs) {
    const market = getStockMarket(marketId);
    if (!market) return { ok: false, reason: 'market' };
    const bag = sanitizeStockInvestments(investments);
    const settled = settleStockPosition(bag[market.id], currentIndex, nowMs);
    if (!settled.ok) return { ok: false, reason: 'none' };
    const day = sanitizeStockInvestDaily(daily, today);
    let payout = settled.payout;
    let delta = settled.delta;
    if (delta > 0) {
        const room = Math.max(0, STOCK_DAILY_PROFIT_CAP - day.profit);
        if (delta > room) {
            payout = settled.principal + room;
            delta = room;
        }
    }
    bag[market.id] = null;
    return {
        ok: true,
        investments: bag,
        daily: { date: String(today || ''), profit: day.profit + Math.max(0, delta), sells: day.sells + 1 },
        payout,
        delta,
        principal: settled.principal,
        capped: settled.delta > delta,
    };
}
