/**
 * 광장 따봉. 하루에 한 번, 서로 주고받는 따봉은 없습니다.
 * 받은 따봉이 10개가 되면 빵빠레 보상을 한 번 더 줍니다.
 */

export const PRAISE_XP = 10;
export const PRAISE_BONG = 1;
export const PRAISE_FANFARE_AT = 10;
export const PRAISE_FANFARE_XP = 50;
export const PRAISE_FANFARE_BONG = 5;

function pairKey(fromId, toId) {
    return `${String(fromId || '')}>${String(toId || '')}`;
}

export function emptyPraiseBoard() {
    return { lastGiven: {}, pairs: {}, received: {}, fanfare: {} };
}

export function sanitizePraiseBoard(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const board = emptyPraiseBoard();
    ['lastGiven', 'pairs'].forEach((key) => {
        const bag = src[key] && typeof src[key] === 'object' ? src[key] : {};
        Object.keys(bag).forEach((id) => {
            const ymd = String(bag[id] || '');
            if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) board[key][String(id)] = ymd;
        });
    });
    const received = src.received && typeof src.received === 'object' ? src.received : {};
    Object.keys(received).forEach((id) => {
        const n = Math.floor(Number(received[id]) || 0);
        if (n > 0) board.received[String(id)] = n;
    });
    const fanfare = src.fanfare && typeof src.fanfare === 'object' ? src.fanfare : {};
    Object.keys(fanfare).forEach((id) => {
        if (fanfare[id]) board.fanfare[String(id)] = true;
    });
    return board;
}

export function planPeerPraise(board, { fromId, toId, today } = {}) {
    const from = String(fromId || '');
    const to = String(toId || '');
    const date = String(today || '');
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: 'who' };
    if (from === to) return { ok: false, reason: 'self' };
    const src = sanitizePraiseBoard(board);
    if (src.lastGiven[from] === date) return { ok: false, reason: 'once' };
    if (src.pairs[pairKey(to, from)]) return { ok: false, reason: 'mutual' };
    const received = (src.received[to] || 0) + 1;
    const fanfare = received >= PRAISE_FANFARE_AT && !src.fanfare[to];
    const next = sanitizePraiseBoard(src);
    next.lastGiven[from] = date;
    next.pairs[pairKey(from, to)] = date;
    next.received[to] = received;
    if (fanfare) next.fanfare[to] = true;
    return {
        ok: true,
        board: next,
        fanfare,
        received,
        giver: { xp: PRAISE_XP, bong: PRAISE_BONG },
        receiver: {
            xp: PRAISE_XP + (fanfare ? PRAISE_FANFARE_XP : 0),
            bong: PRAISE_BONG + (fanfare ? PRAISE_FANFARE_BONG : 0),
        },
    };
}

export function praiseFailMessage(reason) {
    if (reason === 'self') return '나에게는 따봉을 줄 수 없습니다.';
    if (reason === 'once') return '따봉은 하루에 한 번만 줄 수 있습니다.';
    if (reason === 'mutual') return '서로 따봉은 줄 수 없습니다. 이미 그 친구가 나에게 따봉을 주었습니다.';
    return '따봉을 보내지 못했습니다.';
}
