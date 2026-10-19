/**
 * 광장 역따봉.
 *
 * 따봉이 경험치와 봉을 같이 주지만, 학급 화폐는 봉이다.
 * 보낸 학생은 봉 5개가 빠진다. 봉이 5개보다 적으면 보내지 못한다.
 * 받는 학생의 역따봉 수는 시즌 동안 쌓이고, 자정이 지나도 0으로 돌아가지 않는다.
 * 받은 수가 10, 20, 30…이 되면 받는 학생의 봉이 구간마다 10개씩 한 번만 빠진다.
 * 이미 뺀 구간은 penaltyThrough에 적는다. 같은 구간을 다시 계산해도 봉은 또 빠지지 않는다.
 *
 * 막는 것
 * - 나에게 보내기
 * - 이유가 없음. 앞뒤 공백을 지운 뒤 2~80자이고, 한글·영문·숫자 중 하나는 있어야 한다.
 * - 봉이 5개보다 적음 (보낸 사람 지갑)
 * - 같은 친구에게 하루에 한 번
 * - 한 사람이 하루에 3번
 *
 * 받는 학생에게 보여주는 이유에는 보낸 사람 이름이 없다.
 * 공개 문서(classOps/rebuke)의 이유에는 학번을 넣지 않는다.
 * 보낸 학번은 classOps/rebukeAudit 에만 추가한다. 선생님 화면에서 그 문서를 읽어 이름을 붙인다.
 * 학생당 이유는 최근 30개만 남긴다. 받은 수와 감점 기록은 그때도 지우지 않는다.
 * 받는 학생의 봉은 -2000보다 내려가지 않는다. 더 못 빼도 그 구간은 이미 뺀 것으로 적는다.
 * 하루 횟수 기록만 날짜가 바뀌면 다음 역따봉을 저장할 때 치운다. 받은 수는 치우지 않는다.
 */

export const REBUKE_COST_BONG = 5;
export const REBUKE_THRESHOLD = 10;
export const REBUKE_THRESHOLD_BONG = 10;
export const REBUKE_REASON_MIN = 2;
export const REBUKE_REASON_MAX = 80;
export const REBUKE_DAILY_CAP = 3;
export const REBUKE_REASONS_KEPT = 30;
export const REBUKE_BONG_FLOOR = -2000;

function asId(value) {
    return String(value || '');
}

function asBong(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.floor(n);
}

function isYmd(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function pairKey(fromId, toId) {
    return `${asId(fromId)}>${asId(toId)}`;
}

export function emptyRebukeBoard() {
    return {
        received: {},
        penaltyThrough: {},
        sentDaily: {},
        pairDay: {},
        entries: [],
    };
}

export function normalizeRebukeReason(raw) {
    const text = String(raw || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length < REBUKE_REASON_MIN || text.length > REBUKE_REASON_MAX) return '';
    if (!/[0-9A-Za-z가-힣]/.test(text)) return '';
    return text;
}

function capReasons(entries) {
    const buckets = new Map();
    entries.forEach((entry) => {
        const list = buckets.get(entry.toId) || [];
        list.push(entry);
        buckets.set(entry.toId, list);
    });
    const drop = new Set();
    buckets.forEach((list) => {
        if (list.length <= REBUKE_REASONS_KEPT) return;
        list.slice(0, list.length - REBUKE_REASONS_KEPT).forEach((entry) => drop.add(entry.id));
    });
    return entries.filter((entry) => !drop.has(entry.id));
}

export function sanitizeRebukeBoard(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const board = emptyRebukeBoard();
    const received = src.received && typeof src.received === 'object' ? src.received : {};
    Object.keys(received).forEach((id) => {
        const n = Math.floor(Number(received[id]) || 0);
        if (n > 0) board.received[asId(id)] = n;
    });
    const through = src.penaltyThrough && typeof src.penaltyThrough === 'object' ? src.penaltyThrough : {};
    Object.keys(through).forEach((id) => {
        const n = Math.floor(Number(through[id]) || 0);
        const snapped = Math.floor(n / REBUKE_THRESHOLD) * REBUKE_THRESHOLD;
        if (snapped > 0) board.penaltyThrough[asId(id)] = snapped;
    });
    const sentDaily = src.sentDaily && typeof src.sentDaily === 'object' ? src.sentDaily : {};
    Object.keys(sentDaily).forEach((id) => {
        const row = sentDaily[id];
        const ymd = String(row && row.ymd || '');
        const n = Math.floor(Number(row && row.n) || 0);
        if (!isYmd(ymd) || n <= 0) return;
        board.sentDaily[asId(id)] = { ymd, n: Math.min(n, REBUKE_DAILY_CAP) };
    });
    const pairDay = src.pairDay && typeof src.pairDay === 'object' ? src.pairDay : {};
    Object.keys(pairDay).forEach((key) => {
        const ymd = String(pairDay[key] || '');
        if (!isYmd(ymd) || !key.includes('>')) return;
        board.pairDay[String(key)] = ymd;
    });
    const entries = Array.isArray(src.entries) ? src.entries : [];
    const seen = new Set();
    entries.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const id = asId(row.id);
        const toId = asId(row.toId);
        const fromId = asId(row.fromId);
        const reason = normalizeRebukeReason(row.reason);
        const ymd = String(row.ymd || '');
        if (!id || !toId || !reason || !isYmd(ymd) || seen.has(id)) return;
        seen.add(id);
        const entry = { id, toId, reason, ymd };
        if (fromId) entry.fromId = fromId;
        board.entries.push(entry);
    });
    board.entries = capReasons(board.entries);
    return board;
}

/**
 * 받은 수가 count일 때, 아직 빼지 않은 10·20·30… 구간만 계산한다.
 * appliedThrough를 결과의 through로 다시 넣으면 봉은 0이다.
 */
export function rebukePenaltyForCount(count, appliedThrough) {
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    const through = Math.max(0, Math.floor(Number(appliedThrough) || 0));
    const due = Math.floor(safeCount / REBUKE_THRESHOLD) * REBUKE_THRESHOLD;
    const already = Math.floor(through / REBUKE_THRESHOLD) * REBUKE_THRESHOLD;
    if (due <= already) {
        return { bong: 0, steps: 0, through: already, thresholds: [] };
    }
    const thresholds = [];
    for (let mark = already + REBUKE_THRESHOLD; mark <= due; mark += REBUKE_THRESHOLD) {
        thresholds.push(mark);
    }
    return {
        bong: thresholds.length * REBUKE_THRESHOLD_BONG,
        steps: thresholds.length,
        through: due,
        thresholds,
    };
}

export function applyRebukeBongDelta(current, delta) {
    const before = asBong(current);
    const next = Math.max(REBUKE_BONG_FLOOR, before + asBong(delta));
    return { before, after: next, delta: next - before };
}

function sentTodayCount(board, fromId, today) {
    const row = board.sentDaily[asId(fromId)];
    if (!row || row.ymd !== today) return 0;
    return Math.max(0, Math.floor(Number(row.n) || 0));
}

export function planPeerRebuke(board, {
    fromId,
    toId,
    today,
    reason,
    senderBong,
    receiverBong,
    allowedIds,
} = {}) {
    const from = asId(fromId);
    const to = asId(toId);
    const date = String(today || '');
    if (!from || !to || !isYmd(date)) return { ok: false, reason: 'who' };
    if (from === to) return { ok: false, reason: 'self' };
    if (Array.isArray(allowedIds) && !allowedIds.map(asId).includes(to)) {
        return { ok: false, reason: 'who' };
    }
    const cleanReason = normalizeRebukeReason(reason);
    if (!cleanReason) return { ok: false, reason: 'reason' };
    const senderBefore = asBong(senderBong);
    if (senderBefore < REBUKE_COST_BONG) return { ok: false, reason: 'balance' };

    const src = sanitizeRebukeBoard(board);
    if (sentTodayCount(src, from, date) >= REBUKE_DAILY_CAP) return { ok: false, reason: 'daily' };
    const pair = pairKey(from, to);
    if (src.pairDay[pair] === date) return { ok: false, reason: 'pair' };

    const received = (src.received[to] || 0) + 1;
    const penalty = rebukePenaltyForCount(received, src.penaltyThrough[to] || 0);
    const receiver = applyRebukeBongDelta(receiverBong, -penalty.bong);
    const next = sanitizeRebukeBoard(src);
    Object.keys(next.sentDaily).forEach((id) => {
        if (next.sentDaily[id].ymd !== date) delete next.sentDaily[id];
    });
    Object.keys(next.pairDay).forEach((key) => {
        if (next.pairDay[key] !== date) delete next.pairDay[key];
    });
    next.received[to] = received;
    if (penalty.through > 0) next.penaltyThrough[to] = penalty.through;
    next.sentDaily[from] = { ymd: date, n: sentTodayCount(src, from, date) + 1 };
    next.pairDay[pair] = date;
    const entry = {
        id: `rb_${date}_${to}_${received}`,
        toId: to,
        fromId: from,
        reason: cleanReason,
        ymd: date,
    };
    next.entries.push(entry);
    next.entries = capReasons(next.entries);

    return {
        ok: true,
        board: next,
        entry,
        received,
        senderBong: senderBefore - REBUKE_COST_BONG,
        senderDelta: -REBUKE_COST_BONG,
        receiverBong: receiver.after,
        receiverDelta: receiver.delta,
        penaltyBong: penalty.bong,
        penaltySteps: penalty.steps,
        thresholds: penalty.thresholds,
    };
}

/** 학생 화면에 저장하는 판. 이유에 보낸 학번을 넣지 않는다. */
export function rebukePublicView(board) {
    const src = sanitizeRebukeBoard(board);
    return {
        received: src.received,
        penaltyThrough: src.penaltyThrough,
        sentDaily: src.sentDaily,
        pairDay: src.pairDay,
        entries: src.entries.map(({ id, toId, reason, ymd }) => ({ id, toId, reason, ymd })),
    };
}

/** 새 역따봉 하나의 보낸 사람 기록. 기존 감사 문서에 끼워 넣는다. */
export function rebukeAuditPatch(entry) {
    if (!entry || !entry.id || !entry.fromId) return { entries: {} };
    return {
        entries: {
            [entry.id]: {
                toId: asId(entry.toId),
                fromId: asId(entry.fromId),
                ymd: String(entry.ymd || ''),
            },
        },
    };
}

/** 공개 판에 선생님용 감사 기록의 학번을 붙인다. 감사가 없으면 이유만 남긴다. */
export function attachRebukeAudit(board, auditRaw) {
    const src = sanitizeRebukeBoard(board);
    const bag = auditRaw && auditRaw.entries && typeof auditRaw.entries === 'object' ? auditRaw.entries : {};
    src.entries = src.entries.map((entry) => {
        const extra = bag[entry.id];
        const fromId = asId(entry.fromId || (extra && extra.fromId));
        if (!fromId) return { id: entry.id, toId: entry.toId, reason: entry.reason, ymd: entry.ymd };
        return { ...entry, fromId };
    });
    return src;
}

export function rebukeCountOf(board, studentId) {
    const id = asId(studentId);
    if (!id) return 0;
    return Math.max(0, Math.floor(Number(sanitizeRebukeBoard(board).received[id]) || 0));
}

/** 받는 학생에게 보여주는 이유. 보낸 사람 이름은 넣지 않는다. 최근 것이 앞이다. */
export function anonymousRebukeReasons(board, studentId) {
    const id = asId(studentId);
    return sanitizeRebukeBoard(board).entries
        .filter((entry) => entry.toId === id)
        .map(({ reason, ymd }) => ({ reason, ymd }))
        .reverse();
}

/** 선생님용. 보낸 학번이 있다. 최근 것이 앞이다. */
export function teacherRebukeReasons(board, studentId) {
    const id = asId(studentId);
    return sanitizeRebukeBoard(board).entries
        .filter((entry) => entry.toId === id)
        .map(({ reason, ymd, fromId }) => ({ reason, ymd, fromId }))
        .reverse();
}

export function rebukeFailMessage(reason, unit = '봉') {
    const money = `${REBUKE_COST_BONG}${unit}`;
    if (reason === 'self') return '나에게는 역따봉을 보낼 수 없어요.';
    if (reason === 'reason') return `이유를 ${REBUKE_REASON_MIN}글자 이상 적어야 보낼 수 있어요.`;
    if (reason === 'balance') return `돈이 ${money}보다 적어요. 역따봉은 보낼 수 없어요.`;
    if (reason === 'pair') return '오늘은 이미 이 친구에게 역따봉을 보냈어요.';
    if (reason === 'daily') return `오늘은 역따봉을 ${REBUKE_DAILY_CAP}번 다 썼어요. 내일 다시 보낼 수 있어요.`;
    if (reason === 'who') return '역따봉을 보낼 친구를 찾지 못했어요.';
    return '역따봉을 보내지 못했어요.';
}
