/**
 * 45인승 버스 자리 뽑기·구입.
 * 앞쪽은 2+통로+2, 맨 뒷줄은 5칸입니다. 부동산 자리표와 같이 활성·비활성·고정·랜덤 배치를 둡니다.
 * 자리마다 기본 가격을 두고, 더 높은 가격을 내면 구매자가 바뀌며 기존 구매자는 낸 봉만 돌려받습니다.
 */

export const BUS_SEAT_COUNT = 45;
export const BUS_ROWS = 11;
export const BUS_COLS = 5;
export const BUS_SEAT_DEFAULT_PRICE = 10;
export const BUS_SEAT_PRICE_MAX = 5000;
export const BUS_PURCHASE_HISTORY_LIMIT = 40;

function cleanId(raw) {
    const id = String(raw || '').trim().slice(0, 20);
    return id && id !== 'gm' && id !== 'gm_a' && id !== 'guest' ? id : '';
}

function clipInt(v, min, max, fallback) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

export function sanitizeBusSeatPrice(raw, fallback = BUS_SEAT_DEFAULT_PRICE) {
    return clipInt(raw, 0, BUS_SEAT_PRICE_MAX, fallback);
}

export function sanitizeBusPaid(raw) {
    return clipInt(raw, 0, BUS_SEAT_PRICE_MAX, 0);
}

function emptySeat(id) {
    return {
        id,
        assignee: null,
        hidden: false,
        locked: false,
        price: BUS_SEAT_DEFAULT_PRICE,
        owner: null,
        paid: 0,
    };
}

export function emptyBusState() {
    return {
        seats: Array.from({ length: BUS_SEAT_COUNT }, (_, i) => emptySeat(i)),
        purchaseHistory: [],
    };
}

export function isBusSeatDisabled(seat) {
    if (!seat) return true;
    return seat.hidden === true;
}

/**
 * 45인승 배치: 1~10열은 창측2 + 통로 + 창측2, 11열(맨 뒤)은 5칸.
 * 칸 순서 왼쪽(창) → 오른쪽(문). 번호는 앞에서부터 1~45.
 */
export function busLayoutCells() {
    const cells = [];
    let n = 0;
    for (let row = 0; row < BUS_ROWS; row += 1) {
        const last = row === BUS_ROWS - 1;
        for (let col = 0; col < BUS_COLS; col += 1) {
            if (!last && col === 2) {
                cells.push({ kind: 'aisle', row, col });
            } else {
                cells.push({ kind: 'seat', row, col, id: n, no: n + 1 });
                n += 1;
            }
        }
    }
    return cells;
}

export function sanitizeBusSeat(raw, fallbackId) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const id = Number.isFinite(Number(src.id)) ? Math.floor(Number(src.id)) : fallbackId;
    if (!Number.isFinite(id) || id < 0 || id >= BUS_SEAT_COUNT) return emptySeat(fallbackId);
    const hidden = src.hidden === true;
    // 비활성이어도 owner·paid는 남겨 환불이 빠지지 않게 합니다.
    const owner = cleanId(src.owner) || null;
    const paid = owner ? sanitizeBusPaid(src.paid) : 0;
    return {
        id,
        assignee: hidden ? null : (cleanId(src.assignee) || owner || null),
        hidden,
        locked: hidden ? true : src.locked === true,
        price: sanitizeBusSeatPrice(src.price, BUS_SEAT_DEFAULT_PRICE),
        owner,
        paid,
    };
}

function sanitizeHistoryEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const seatId = Math.floor(Number(raw.seatId));
    if (!Number.isFinite(seatId) || seatId < 0 || seatId >= BUS_SEAT_COUNT) return null;
    const id = String(raw.id || '').trim().slice(0, 80);
    const studentId = cleanId(raw.studentId);
    const kind = String(raw.kind || 'buy').slice(0, 20);
    return {
        id,
        studentId,
        seatId,
        price: sanitizeBusPaid(raw.price),
        prevOwner: cleanId(raw.prevOwner) || null,
        kind: kind || 'buy',
        at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : 0,
    };
}

export function sanitizeBusPurchaseHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(sanitizeHistoryEntry)
        .filter(Boolean)
        .slice(-BUS_PURCHASE_HISTORY_LIMIT);
}

export function sanitizeBusState(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const prev = Array.isArray(src.seats) ? src.seats : [];
    const byId = new Map();
    prev.forEach((s, i) => {
        const seat = sanitizeBusSeat(s, i);
        if (seat) byId.set(seat.id, seat);
    });
    const seats = [];
    for (let i = 0; i < BUS_SEAT_COUNT; i += 1) {
        seats.push(byId.get(i) || emptySeat(i));
    }
    return {
        seats,
        purchaseHistory: sanitizeBusPurchaseHistory(src.purchaseHistory),
    };
}

function shuffleCopy(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor((typeof rng === 'function' ? rng() : Math.random()) * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

function pushHistory(board, entry) {
    const next = sanitizeBusPurchaseHistory([...(board.purchaseHistory || []), entry]);
    board.purchaseHistory = next;
}

function historyHasId(board, purchaseId) {
    const id = String(purchaseId || '').trim();
    if (!id) return false;
    return (board.purchaseHistory || []).some((h) => h && h.id === id);
}

/** 빈 자리는 기본가 이상, 주인이 있으면 낸 금액보다 커야 합니다. */
export function minBusSeatBid(seat) {
    if (!seat || seat.hidden) return 0;
    if (seat.owner) return sanitizeBusPaid(seat.paid) + 1;
    return Math.max(0, sanitizeBusSeatPrice(seat.price, BUS_SEAT_DEFAULT_PRICE));
}

function findOwnedSeats(seats, studentId) {
    const id = cleanId(studentId);
    if (!id) return [];
    return seats.filter((s) => s && String(s.owner || '') === id);
}

/**
 * 버스 자리 구입·입찰을 한 번에 계산합니다.
 * 환불액은 자리의 paid만 쓰고, 같은 학생이 다른 자리를 갖고 있으면 그 자리도 비우고 낸 봉을 돌려줍니다.
 */
export function applyBusSeatPurchase({
    state,
    seatId,
    buyerId,
    bid,
    buyerBong,
    purchaseId = '',
} = {}) {
    const board = sanitizeBusState(state);
    const buyer = cleanId(buyerId);
    if (!buyer) return { ok: false, reason: 'login', state: board };
    const sid = Math.floor(Number(seatId));
    if (!Number.isFinite(sid) || sid < 0 || sid >= BUS_SEAT_COUNT) {
        return { ok: false, reason: 'missing', state: board };
    }
    const pid = String(purchaseId || '').trim().slice(0, 80);
    if (pid && historyHasId(board, pid)) {
        const seat = board.seats[sid];
        return {
            ok: true,
            already: true,
            reason: 'already',
            state: board,
            buyerBong: Math.floor(Number(buyerBong) || 0),
            charge: 0,
            refunds: [],
            prevOwner: seat && seat.owner !== buyer ? (seat.owner || null) : null,
            seatId: sid,
            vacatedSeatIds: [],
            purchaseId: pid,
        };
    }
    const seat = board.seats[sid];
    if (!seat || seat.hidden) return { ok: false, reason: 'hidden', state: board };
    if (seat.locked) return { ok: false, reason: 'locked', state: board };

    const bidN = Math.floor(Number(bid));
    if (!Number.isFinite(bidN) || bidN < 0 || bidN > BUS_SEAT_PRICE_MAX) {
        return { ok: false, reason: 'bid', state: board, max: BUS_SEAT_PRICE_MAX };
    }
    const prevOwner = seat.owner || null;
    const prevPaid = prevOwner ? sanitizeBusPaid(seat.paid) : 0;
    if (prevOwner === buyer) {
        return {
            ok: false,
            reason: 'self',
            state: board,
            minBid: prevPaid + 1,
            currentPaid: prevPaid,
        };
    }
    const minBid = minBusSeatBid(seat);
    if (bidN < minBid) {
        return {
            ok: false,
            reason: 'low',
            state: board,
            minBid,
            currentPaid: prevPaid,
            listPrice: seat.price,
        };
    }

    const vacates = [];
    board.seats.forEach((s) => {
        if (s.id === sid) return;
        if (String(s.owner || '') === buyer) {
            const paid = sanitizeBusPaid(s.paid);
            vacates.push({ studentId: buyer, amount: paid, seatId: s.id, kind: 'vacate' });
            s.owner = null;
            s.paid = 0;
            if (String(s.assignee || '') === buyer) s.assignee = null;
        } else if (String(s.assignee || '') === buyer) {
            s.assignee = null;
        }
    });

    const vacateCredit = vacates.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
    const wallet = Math.floor(Number(buyerBong) || 0);
    const nextBuyerBong = wallet + vacateCredit - bidN;
    if (nextBuyerBong < 0) {
        return {
            ok: false,
            reason: 'funds',
            state: sanitizeBusState(state),
            need: bidN,
            credit: vacateCredit,
            wallet,
        };
    }

    const refunds = [];
    if (prevOwner && prevPaid > 0) {
        refunds.push({ studentId: prevOwner, amount: prevPaid, seatId: sid, kind: 'outbid' });
    }
    vacates.forEach((v) => {
        if (v.amount > 0) refunds.push(v);
    });

    seat.owner = buyer;
    seat.paid = bidN;
    seat.assignee = buyer;
    if (pid) {
        pushHistory(board, {
            id: pid,
            studentId: buyer,
            seatId: sid,
            price: bidN,
            prevOwner,
            kind: 'buy',
            at: Date.now(),
        });
    }

    return {
        ok: true,
        already: false,
        state: board,
        buyerBong: nextBuyerBong,
        charge: bidN,
        refunds,
        prevOwner,
        minBid,
        seatId: sid,
        vacatedSeatIds: vacates.map((v) => v.seatId),
        purchaseId: pid,
    };
}

/**
 * 구입 결과를 지갑 잔액에 반영합니다.
 * 구매자는 차감(charge) 후 자기 자리 환불(vacate)을 받고, 이전 주인은 paid만 받습니다.
 */
export function applyBusSeatWalletChanges({
    buyerId,
    buyerBong,
    charge,
    refunds,
    otherBongs = {},
} = {}) {
    const next = {};
    const buyer = cleanId(buyerId);
    if (buyer) {
        next[buyer] = Math.floor(Number(buyerBong) || 0) - Math.max(0, Math.floor(Number(charge) || 0));
    }
    (Array.isArray(refunds) ? refunds : []).forEach((row) => {
        const id = cleanId(row && row.studentId);
        const amt = Math.max(0, Math.floor(Number(row && row.amount) || 0));
        if (!id || amt <= 0) return;
        if (next[id] == null) {
            next[id] = Math.floor(Number(otherBongs[id]) || 0);
        }
        next[id] += amt;
    });
    Object.keys(next).forEach((id) => {
        next[id] = Math.floor(Number(next[id]) || 0);
    });
    return next;
}

/**
 * 비활성·환불: 주인이 낸 paid만 돌려주고 자리를 비웁니다.
 */
export function applyBusSeatRelease({
    state,
    seatId,
    hidden = true,
    refundId = '',
} = {}) {
    const board = sanitizeBusState(state);
    const sid = Math.floor(Number(seatId));
    if (!Number.isFinite(sid) || sid < 0 || sid >= BUS_SEAT_COUNT) {
        return { ok: false, reason: 'missing', state: board, refunds: [] };
    }
    const rid = String(refundId || '').trim().slice(0, 80);
    if (rid && historyHasId(board, rid)) {
        return { ok: true, already: true, state: board, refunds: [], seatId: sid, refundId: rid };
    }
    const seat = board.seats[sid];
    const owner = seat.owner || null;
    const paid = owner ? sanitizeBusPaid(seat.paid) : 0;
    const refunds = owner && paid > 0
        ? [{ studentId: owner, amount: paid, seatId: sid, kind: 'release' }]
        : [];
    seat.owner = null;
    seat.paid = 0;
    seat.assignee = null;
    if (hidden) {
        seat.hidden = true;
        seat.locked = true;
    }
    if (rid) {
        pushHistory(board, {
            id: rid,
            studentId: owner || '',
            seatId: sid,
            price: paid,
            prevOwner: owner,
            kind: 'release',
            at: Date.now(),
        });
    }
    return {
        ok: true,
        already: false,
        state: board,
        refunds,
        prevOwner: owner,
        paid,
        seatId: sid,
        refundId: rid,
    };
}

/**
 * 고정(잠금+이름) 자리와 구입한 자리는 남기고, 활성·잠기지 않은 자리에 학생을 무작위로 앉힙니다.
 */
export function shuffleBusAssignees(state, studentIds, rng = Math.random) {
    const next = sanitizeBusState(state);
    const kept = new Set();
    next.seats.forEach((s) => {
        if (s.hidden) {
            s.assignee = null;
            if (s.owner) kept.add(String(s.owner));
            return;
        }
        if (s.owner) {
            s.assignee = s.owner;
            kept.add(String(s.owner));
            return;
        }
        if (s.locked && s.assignee) {
            kept.add(String(s.assignee));
            return;
        }
        if (!s.locked) s.assignee = null;
    });
    const needing = (Array.isArray(studentIds) ? studentIds : [])
        .map((id) => cleanId(id))
        .filter((id) => id && !kept.has(id));
    const available = next.seats.filter((s) => !s.hidden && !s.locked && !s.owner);
    const students = shuffleCopy(needing, rng);
    const seats = shuffleCopy(available, rng);
    const n = Math.min(students.length, seats.length);
    for (let i = 0; i < n; i += 1) {
        seats[i].assignee = students[i];
    }
    return {
        state: next,
        placed: n,
        leftoverStudents: Math.max(0, students.length - n),
        leftoverSeats: Math.max(0, seats.length - n),
        kept: kept.size,
        available: available.length,
        needing: needing.length,
    };
}

export function resetBusAssignees(state, { keepHidden = true } = {}) {
    const next = sanitizeBusState(state);
    next.seats.forEach((s) => {
        if (s.owner) {
            s.assignee = s.owner;
        } else {
            s.assignee = null;
        }
        if (!keepHidden) {
            s.hidden = false;
            s.locked = false;
        } else if (s.hidden) {
            s.locked = true;
        }
    });
    return next;
}

export function busSeatSummary(state) {
    const board = sanitizeBusState(state);
    const active = board.seats.filter((s) => !isBusSeatDisabled(s));
    const filled = active.filter((s) => !!s.assignee).length;
    const locked = active.filter((s) => s.locked).length;
    const owned = active.filter((s) => !!s.owner).length;
    return {
        total: BUS_SEAT_COUNT,
        active: active.length,
        hidden: board.seats.length - active.length,
        filled,
        locked,
        owned,
    };
}

export function busSeatOwnerOf(state, studentId) {
    const id = cleanId(studentId);
    if (!id) return null;
    const board = sanitizeBusState(state);
    return findOwnedSeats(board.seats, id)[0] || null;
}
