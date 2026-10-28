/**
 * 광장 비추천. 같은 친구에게는 하루에 한 번, 사유는 필수입니다.
 * 누른 사람의 경험치만 10 줄어듭니다. 받은 사람은 경험치가 줄지 않습니다.
 * 자정이 지나면 오늘 받은 수만 0이 되고, 최근 사유와 기록은 남습니다.
 */

export const DISLIKE_XP_COST = 10;
export const DISLIKE_REASON_MAX = 40;
export const DISLIKE_LOG_MAX = 80;

function pairKey(fromId, toId) {
    return `${String(fromId || '')}>${String(toId || '')}`;
}

function isYmd(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function cleanReason(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function emptyDislikeBoard() {
    return { countDate: '', received: {}, latestReason: {}, once: {}, log: [] };
}

export function sanitizeDislikeBoard(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const board = emptyDislikeBoard();
    board.countDate = isYmd(src.countDate) ? String(src.countDate) : '';
    const received = src.received && typeof src.received === 'object' ? src.received : {};
    Object.keys(received).forEach((id) => {
        const n = Math.floor(Number(received[id]) || 0);
        if (n > 0) board.received[String(id)] = n;
    });
    const latest = src.latestReason && typeof src.latestReason === 'object' ? src.latestReason : {};
    Object.keys(latest).forEach((id) => {
        const reason = cleanReason(latest[id]).slice(0, DISLIKE_REASON_MAX);
        if (reason) board.latestReason[String(id)] = reason;
    });
    const once = src.once && typeof src.once === 'object' ? src.once : {};
    Object.keys(once).forEach((id) => {
        const ymd = String(once[id] || '');
        if (isYmd(ymd)) board.once[String(id)] = ymd;
    });
    const log = Array.isArray(src.log) ? src.log : [];
    board.log = log.slice(-DISLIKE_LOG_MAX).map((row) => {
        if (!row || typeof row !== 'object') return null;
        const reason = cleanReason(row.reason).slice(0, DISLIKE_REASON_MAX);
        const from = String(row.from || '');
        const to = String(row.to || '');
        const date = String(row.date || '');
        if (!from || !to || !reason || !isYmd(date)) return null;
        return { from, to, reason, date };
    }).filter(Boolean);
    return board;
}

/** 날짜가 바뀌면 오늘 받은 수만 비웁니다. 사유와 하루 한 번 기록은 남깁니다. */
export function rollDislikeDay(board, today) {
    const date = String(today || '');
    const src = sanitizeDislikeBoard(board);
    if (!isYmd(date)) return { board: src, changed: false, reset: false };
    if (!src.countDate) {
        const next = sanitizeDislikeBoard(src);
        next.countDate = date;
        return { board: next, changed: true, reset: false };
    }
    if (src.countDate === date) return { board: src, changed: false, reset: false };
    if (src.countDate > date) return { board: src, changed: false, reset: false };
    const next = sanitizeDislikeBoard(src);
    next.countDate = date;
    next.received = {};
    return { board: next, changed: true, reset: true };
}

export function dislikeCountForToday(board, studentId, today) {
    const id = String(studentId || '');
    if (!id) return 0;
    const rolled = rollDislikeDay(board, today);
    return Math.max(0, Math.floor(Number(rolled.board.received[id]) || 0));
}

export function latestDislikeReason(board, studentId) {
    const id = String(studentId || '');
    if (!id) return '';
    const src = sanitizeDislikeBoard(board);
    return String(src.latestReason[id] || '');
}

export function planPeerDislike(board, { fromId, toId, today, reason } = {}) {
    const from = String(fromId || '');
    const to = String(toId || '');
    const date = String(today || '');
    const reasonText = cleanReason(reason);
    if (!from || !to || !isYmd(date)) return { ok: false, reason: 'who' };
    if (from === to) return { ok: false, reason: 'self' };
    if (!reasonText) return { ok: false, reason: 'empty' };
    if ([...reasonText].length > DISLIKE_REASON_MAX) return { ok: false, reason: 'long' };
    const src = rollDislikeDay(board, date).board;
    const pair = pairKey(from, to);
    if (src.once[pair] === date) return { ok: false, reason: 'once' };
    const received = (src.received[to] || 0) + 1;
    const next = sanitizeDislikeBoard(src);
    next.received[to] = received;
    next.latestReason[to] = reasonText;
    next.once[pair] = date;
    next.log = next.log.concat([{ from, to, reason: reasonText, date }]).slice(-DISLIKE_LOG_MAX);
    return {
        ok: true,
        board: next,
        received,
        xpCost: DISLIKE_XP_COST,
        reasonText,
    };
}

export function dislikeFailMessage(reason) {
    if (reason === 'self') return '나에게는 비추천할 수 없습니다.';
    if (reason === 'empty') return '비추천 사유를 적어 주세요.';
    if (reason === 'long') return `비추천 사유는 ${DISLIKE_REASON_MAX}자까지 적을 수 있습니다.`;
    if (reason === 'once') return '이 친구에게는 오늘 이미 비추천했습니다.';
    if (reason === 'xp') return '경험치가 10 미만이면 비추천할 수 없습니다.';
    return '비추천을 남기지 못했습니다.';
}
