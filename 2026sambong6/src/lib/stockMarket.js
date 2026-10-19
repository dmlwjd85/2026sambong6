/**
 * 코스피·코스닥·나스닥 시세와 학급 은행 투자.
 * 홈 티커는 코스피·코스닥을 보여주고, 시세는 공개 차트 API를 씁니다.
 * 수익은 인플레이션을 막기 위해 작게 묶습니다.
 */

export const STOCK_MARKETS = [
    { id: 'kospi', name: '코스피', symbol: '^KS11' },
    { id: 'kosdaq', name: '코스닥', symbol: '^KQ11' },
    { id: 'nasdaq', name: '나스닥', symbol: '^IXIC' },
];

/** 홈 실시간 지수 카드에 한 번에 보여줄 시장 */
export const TICKER_MARKETS = STOCK_MARKETS;

/** 장중 1시간마다 네트워크 시세를 다시 읽습니다. */
export const MARKET_REFRESH_MS = 60 * 60 * 1000;
/** 공유·로컬 캐시가 이 시간보다 짧으면 다시 치지 않습니다. */
export const MARKET_CACHE_TTL_MS = 50 * 60 * 1000;
/** 정각 전후 1분은 시세를 맞추는 시간이라 사고팔 수 없습니다. */
export const QUOTE_ADJUST_MS = 60 * 1000;

export const STOCK_INVEST_MIN = 10;
/** 지수 사고팔기 기록은 최근 30건만 남깁니다. */
export const STOCK_HISTORY_LIMIT = 30;
/** 시장별 원금 합계 한도. 추가 매수해도 이 값을 넘지 못합니다. */
export const STOCK_INVEST_MAX = 1000;
export const STOCK_DAILY_PROFIT_CAP = 8;
export const STOCK_MAX_ABS_MOVE_PER_DAY = 0.035;
export const STOCK_MAX_ABS_MOVE_TOTAL = 0.12;

export function getStockMarket(id) {
    return STOCK_MARKETS.find((m) => m.id === String(id || '')) || null;
}

/**
 * 한국 주식 정규장: 평일 09:00~15:30 (Asia/Seoul).
 * 15:30부터는 장마감으로 보고 네트워크 갱신을 멈춥니다.
 */
export function isKoreanStockSession(nowMs = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
    const map = {};
    parts.forEach((p) => {
        if (p.type !== 'literal') map[p.type] = p.value;
    });
    const weekday = String(map.weekday || '');
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const minutes = (Number(map.hour) || 0) * 60 + (Number(map.minute) || 0);
    return minutes >= 9 * 60 && minutes < 15 * 60 + 30;
}

function seoulParts(nowMs) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
    const map = {};
    parts.forEach((p) => {
        if (p.type !== 'literal') map[p.type] = p.value;
    });
    return {
        year: map.year || '',
        month: map.month || '',
        day: map.day || '',
        hour: map.hour || '00',
        minute: Number(map.minute) || 0,
        second: Number(map.second) || 0,
    };
}

/** 서버 시각 기준 정시 시간대. 예: 2026-09-02T10 */
export function marketHourSlot(nowMs) {
    const p = seoulParts(nowMs);
    return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}

/** 학생에게 보여줄 시세 시간. */
export function formatMarketHourSlot(slot) {
    const m = String(slot || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2})$/);
    if (!m) return '이번 시세';
    return `${m[1]} ${Number(m[2])}시 시세`;
}

/** 정각 1분 전과 1분 뒤는 시세 조정 중입니다. */
export function isQuoteAdjustmentWindow(nowMs) {
    const p = seoulParts(nowMs);
    const sec = p.minute * 60 + p.second;
    return sec < QUOTE_ADJUST_MS / 1000 || sec >= 59 * 60;
}

/**
 * 시세는 서버 시간으로 정한 시간대에 한 번만 다시 읽습니다.
 * 같은 시간대 문서는 다시 갱신하지 않습니다.
 * 시세가 하나도 없으면 장 여부와 관계없이 한 번은 가져옵니다.
 * 장 마감 뒤에는 마지막 시세를 유지합니다.
 */
export function shouldFetchLiveMarketQuotes(nowMs, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const hasAnyQuote = !!o.hasAnyQuote;
    const storedSlot = String(o.storedSlot || '');
    const slot = marketHourSlot(nowMs);
    if (hasAnyQuote && storedSlot && storedSlot === slot) return false;
    if (!hasAnyQuote || !storedSlot) return true;
    if (!isKoreanStockSession(nowMs)) return false;
    return storedSlot !== slot;
}

function sameQuotePrice(a, b) {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) < 0.000001;
}

/**
 * 확인창에 보인 시간대·가격이 지금 서버 시세와 같은지 확인합니다.
 * 조정 중이거나 시간대·가격이 다르면 체결하지 않습니다.
 */
export function evaluateStockTradeWindow({
    nowMs,
    confirmSlot,
    confirmPrice,
    quotes,
    marketId,
} = {}) {
    if (isQuoteAdjustmentWindow(nowMs)) return { ok: false, reason: 'adjusting' };
    const slot = marketHourSlot(nowMs);
    const storedSlot = String(quotes && quotes.hourSlot || '');
    const shownSlot = String(confirmSlot || '');
    if (!shownSlot || shownSlot !== slot || storedSlot !== slot) {
        return { ok: false, reason: 'slot' };
    }
    const row = quotes && quotes[marketId];
    const price = Number(row && row.price);
    if (!sameQuotePrice(confirmPrice, price)) return { ok: false, reason: 'price' };
    return { ok: true, reason: '', slot, price };
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

export function sanitizeStockHistoryEntry(raw) {
    const src = raw && typeof raw === 'object' ? raw : null;
    if (!src) return null;
    const kind = src.kind === 'buy' || src.kind === 'sell' ? src.kind : '';
    const marketId = String(src.marketId || '');
    if (!kind || !getStockMarket(marketId)) return null;
    const amount = Math.floor(Number(src.amount) || 0);
    if (amount < 1) return null;
    return {
        at: Math.max(0, Math.floor(Number(src.at) || 0)),
        date: String(src.date || '').slice(0, 10),
        kind,
        marketId,
        amount,
        payout: Math.max(0, Math.floor(Number(src.payout) || 0)),
        remaining: Math.max(0, Math.floor(Number(src.remaining) || 0)),
        full: src.full === true,
    };
}

export function sanitizeStockHistory(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list.map(sanitizeStockHistoryEntry).filter(Boolean).slice(-STOCK_HISTORY_LIMIT);
}

/** 매수·매도 한 건을 기록 뒤에 붙입니다. 일부 매도도 같은 기록에 남습니다. */
export function appendStockHistory(history, entry) {
    const row = sanitizeStockHistoryEntry(entry);
    const base = sanitizeStockHistory(history);
    if (!row) return base;
    return sanitizeStockHistory([...base, row]);
}

export function sanitizeStockInvestments(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        kospi: sanitizeStockPosition(src.kospi),
        kosdaq: sanitizeStockPosition(src.kosdaq),
        nasdaq: sanitizeStockPosition(src.nasdaq),
    };
}

/**
 * 관리 화면용 학생 1명 지수투자 요약.
 * 시세가 없으면 평가는 원금과 같게 둡니다.
 */
export function summarizeStudentStockInvest(stu, quotes = {}, nowMs = Date.now()) {
    const bag = sanitizeStockInvestments(stu && stu.stockInvestments);
    const markets = STOCK_MARKETS.map((m) => {
        const pos = bag[m.id];
        if (!pos) {
            return { id: m.id, name: m.name, held: false, principal: 0, payout: 0, delta: 0, buyIndex: 0 };
        }
        const price = Number(quotes && quotes[m.id] && quotes[m.id].price);
        const settled = Number.isFinite(price) && price > 0
            ? settleStockPosition(pos, price, nowMs)
            : { principal: pos.principal, payout: pos.principal, delta: 0 };
        return {
            id: m.id,
            name: m.name,
            held: true,
            principal: pos.principal,
            payout: Number.isFinite(Number(settled.payout)) ? Number(settled.payout) : pos.principal,
            delta: Number.isFinite(Number(settled.delta)) ? Number(settled.delta) : 0,
            buyIndex: pos.buyIndex,
        };
    });
    const principal = markets.reduce((sum, row) => sum + row.principal, 0);
    const payout = markets.reduce((sum, row) => sum + row.payout, 0);
    return {
        markets,
        principal,
        payout,
        delta: payout - principal,
        held: markets.some((row) => row.held),
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

/** 이미 넣은 원금을 빼고 더 넣을 수 있는 봉 */
export function stockInvestRoom(existing) {
    const held = sanitizeStockPosition(existing);
    if (!held) return STOCK_INVEST_MAX;
    return Math.max(0, STOCK_INVEST_MAX - held.principal);
}

/** 기존 원금과 추가 원금의 가중평균 매수가 */
export function blendStockBuyIndex(oldPrincipal, oldIndex, addPrincipal, addIndex) {
    const p1 = Math.floor(Number(oldPrincipal) || 0);
    const p2 = Math.floor(Number(addPrincipal) || 0);
    const i1 = Number(oldIndex);
    const i2 = Number(addIndex);
    if (p1 <= 0 && p2 <= 0) return 0;
    if (!Number.isFinite(i1) || i1 <= 0) return Number.isFinite(i2) && i2 > 0 ? i2 : 0;
    if (!Number.isFinite(i2) || i2 <= 0 || p2 <= 0) return i1;
    if (p1 <= 0) return i2;
    return ((p1 * i1) + (p2 * i2)) / (p1 + p2);
}

export function canBuyStock({ wallet, amount, existing }) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt < STOCK_INVEST_MIN || amt > STOCK_INVEST_MAX) return { ok: false, reason: 'amount' };
    const held = sanitizeStockPosition(existing);
    const room = held ? stockInvestRoom(held) : STOCK_INVEST_MAX;
    if (held && room < STOCK_INVEST_MIN) return { ok: false, reason: 'held_full', room: 0 };
    if (held && amt > room) return { ok: false, reason: 'over_max', room };
    const w = Number(wallet) || 0;
    if (w + 0.0001 < amt) return { ok: false, reason: 'wallet' };
    return {
        ok: true,
        amount: amt,
        adding: !!held,
        room,
        nextPrincipal: (held ? held.principal : 0) + amt,
    };
}

export function applyBuyStock(investments, marketId, amount, buyIndex, nowMs, today) {
    const market = getStockMarket(marketId);
    if (!market) return { ok: false, reason: 'market' };
    const bag = sanitizeStockInvestments(investments);
    const idx = Number(buyIndex);
    if (!Number.isFinite(idx) || idx <= 0) return { ok: false, reason: 'quote' };
    const amt = Math.floor(Number(amount) || 0);
    if (amt < STOCK_INVEST_MIN || amt > STOCK_INVEST_MAX) return { ok: false, reason: 'amount' };
    const held = bag[market.id];
    if (held) {
        const nextPrincipal = held.principal + amt;
        if (nextPrincipal > STOCK_INVEST_MAX) return { ok: false, reason: 'over_max' };
        bag[market.id] = {
            principal: nextPrincipal,
            buyIndex: blendStockBuyIndex(held.principal, held.buyIndex, amt, idx),
            openedAt: held.openedAt,
            openedDate: held.openedDate,
        };
        return { ok: true, investments: bag, added: true, amount: amt };
    }
    bag[market.id] = {
        principal: amt,
        buyIndex: idx,
        openedAt: Math.floor(Number(nowMs) || Date.now()),
        openedDate: String(today || ''),
    };
    return { ok: true, investments: bag, added: false, amount: amt };
}

/**
 * 원금 중 팔 금액. 빈칸·0은 전액이 아닙니다.
 * 일부만 팔 때는 최소 10봉이고, 남기려면 10봉 이상이어야 합니다.
 * 가진 원금을 그대로 적으면 전부 팝니다.
 */
export function canSellStock({ existing, amount } = {}) {
    const held = sanitizeStockPosition(existing);
    if (!held) return { ok: false, reason: 'none' };
    const blank = amount == null || amount === '';
    if (blank) return { ok: false, reason: 'empty', min: STOCK_INVEST_MIN, max: held.principal };
    const raw = Math.floor(Number(amount) || 0);
    if (!Number.isFinite(raw) || raw <= 0) {
        return { ok: false, reason: 'empty', min: STOCK_INVEST_MIN, max: held.principal };
    }
    if (raw > held.principal) return { ok: false, reason: 'amount', max: held.principal };
    const remaining = held.principal - raw;
    if (remaining > 0 && raw < STOCK_INVEST_MIN) {
        return { ok: false, reason: 'min', min: STOCK_INVEST_MIN, max: held.principal };
    }
    if (remaining > 0 && remaining < STOCK_INVEST_MIN) {
        return { ok: false, reason: 'remainder', remaining, min: STOCK_INVEST_MIN, max: held.principal };
    }
    return { ok: true, amount: raw, remaining, full: remaining === 0 };
}

export function applySellStock(investments, marketId, currentIndex, daily, today, nowMs, amount) {
    const market = getStockMarket(marketId);
    if (!market) return { ok: false, reason: 'market' };
    const bag = sanitizeStockInvestments(investments);
    const held = bag[market.id];
    const gate = canSellStock({ existing: held, amount });
    if (!gate.ok) return { ok: false, reason: gate.reason };
    const ratio = clampedIndexRatio(held.buyIndex, currentIndex, held.openedAt, nowMs);
    const sellPrincipal = gate.amount;
    // 일부 매도는 학생에게 불리하게 내림합니다. 지금 가진 원금을 한 번에 팔 때만 반올림합니다.
    const rawPayout = sellPrincipal * ratio;
    let payout = gate.remaining === 0
        ? Math.max(0, Math.round(rawPayout))
        : Math.max(0, Math.floor(rawPayout));
    let delta = payout - sellPrincipal;
    const uncappedDelta = delta;
    const day = sanitizeStockInvestDaily(daily, today);
    if (delta > 0) {
        const room = Math.max(0, STOCK_DAILY_PROFIT_CAP - day.profit);
        if (delta > room) {
            payout = sellPrincipal + room;
            delta = room;
        }
    }
    if (gate.remaining === 0) {
        bag[market.id] = null;
    } else {
        bag[market.id] = {
            principal: gate.remaining,
            buyIndex: held.buyIndex,
            openedAt: held.openedAt,
            openedDate: held.openedDate,
        };
    }
    return {
        ok: true,
        investments: bag,
        daily: { date: String(today || ''), profit: day.profit + Math.max(0, delta), sells: day.sells + 1 },
        payout,
        delta,
        principal: sellPrincipal,
        remaining: gate.remaining,
        full: gate.full,
        capped: uncappedDelta > delta,
    };
}

/**
 * 서버에 남아 있는 원금만 매도합니다. 같은 포지션을 두 번 정산하지 못하게 합니다.
 */
export function applyStockSellFromServer({
    serverInvestments,
    serverDaily,
    serverBong,
    serverHistory,
    marketId,
    amount,
    currentIndex,
    today,
    nowMs,
} = {}) {
    const sold = applySellStock(
        serverInvestments,
        marketId,
        currentIndex,
        serverDaily,
        today,
        nowMs,
        amount
    );
    if (!sold.ok) return { ok: false, reason: sold.reason || 'none' };
    const history = appendStockHistory(serverHistory, {
        at: Math.floor(Number(nowMs) || Date.now()),
        date: String(today || ''),
        kind: 'sell',
        marketId,
        amount: sold.principal,
        payout: sold.payout,
        remaining: sold.remaining,
        full: sold.full,
    });
    return {
        ...sold,
        bong: Math.floor(Number(serverBong) || 0) + sold.payout,
        history,
    };
}

/**
 * 서버 잔액·원금 한도를 기준으로 매수합니다.
 */
export function applyStockBuyFromServer({
    serverInvestments,
    serverBong,
    serverHistory,
    marketId,
    amount,
    buyIndex,
    today,
    nowMs,
} = {}) {
    const bag = sanitizeStockInvestments(serverInvestments);
    const market = getStockMarket(marketId);
    if (!market) return { ok: false, reason: 'market' };
    const gate = canBuyStock({
        wallet: Math.floor(Number(serverBong) || 0),
        amount,
        existing: bag[market.id],
    });
    if (!gate.ok) return { ok: false, reason: gate.reason };
    const bought = applyBuyStock(bag, market.id, gate.amount, buyIndex, nowMs, today);
    if (!bought.ok) return { ok: false, reason: bought.reason || 'buy' };
    const history = appendStockHistory(serverHistory, {
        at: Math.floor(Number(nowMs) || Date.now()),
        date: String(today || ''),
        kind: 'buy',
        marketId: market.id,
        amount: gate.amount,
        payout: 0,
        remaining: bought.investments[market.id] ? bought.investments[market.id].principal : 0,
        full: false,
    });
    return {
        ok: true,
        investments: bought.investments,
        bong: Math.floor(Number(serverBong) || 0) - gate.amount,
        amount: gate.amount,
        added: !!bought.added,
        history,
    };
}
