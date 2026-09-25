/**
 * 학급용 체스 (8×8, 정식 규칙).
 * 캐슬링·앙파상·프로모션·체크/체크메이트/스테일메이트,
 * 50수·기물 부족·3회 반복 무승부를 씁니다.
 * 초등 6학년이 읽기 쉽게 말 이름과 안내 문구는 한국어입니다.
 */

export const CHESS_SIZE = 8;
export const CHESS_WHITE = 'w';
export const CHESS_BLACK = 'b';

export const CHESS_COLOR_LABEL = Object.freeze({
    w: '백',
    b: '흑',
});

export const CHESS_PIECE_LABEL = Object.freeze({
    p: '폰',
    n: '나이트',
    b: '비숍',
    r: '룩',
    q: '퀸',
    k: '킹',
});

export const CHESS_END_REASONS = Object.freeze([
    '', 'checkmate', 'stalemate', 'fifty', 'material', 'threefold', 'timeout', 'forfeit',
]);

const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
const BP = 9, BN = 10, BB = 11, BR = 12, BQ = 13, BK = 14;

const START_CELLS = Object.freeze([
    WR, WN, WB, WQ, WK, WB, WN, WR,
    WP, WP, WP, WP, WP, WP, WP, WP,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    BP, BP, BP, BP, BP, BP, BP, BP,
    BR, BN, BB, BQ, BK, BB, BN, BR,
]);

function sanitizeEpochMs(raw) {
    if (raw && typeof raw === 'object' && typeof raw.toMillis === 'function') {
        return Math.max(0, Math.floor(Number(raw.toMillis()) || 0));
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 1e9 && n < 1e12) return Math.floor(n * 1000);
    return Math.max(0, Math.floor(n));
}

export function chessPieceColor(p) {
    if (!p) return '';
    return p >= 9 ? CHESS_BLACK : CHESS_WHITE;
}

export function chessPieceType(p) {
    const t = p & 7;
    return t === 1 ? 'p' : t === 2 ? 'n' : t === 3 ? 'b' : t === 4 ? 'r' : t === 5 ? 'q' : t === 6 ? 'k' : '';
}

export function chessMakePiece(color, type) {
    const base = type === 'p' ? 1 : type === 'n' ? 2 : type === 'b' ? 3 : type === 'r' ? 4 : type === 'q' ? 5 : type === 'k' ? 6 : 0;
    if (!base) return 0;
    return color === CHESS_BLACK ? base + 8 : base;
}

export function chessSq(file, rank) {
    return rank * 8 + file;
}

export function chessFile(sq) {
    return sq & 7;
}

export function chessRank(sq) {
    return sq >> 3;
}

export function inChessBoardSq(sq) {
    return sq >= 0 && sq < 64;
}

export function chessGlyph(p) {
    const map = {
        1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔',
        9: '♟', 10: '♞', 11: '♝', 12: '♜', 13: '♛', 14: '♚',
    };
    return map[p] || '';
}

function opp(color) {
    return color === CHESS_WHITE ? CHESS_BLACK : CHESS_WHITE;
}

function cloneCells(cells) {
    return cells.slice();
}

function sanitizeCells(raw) {
    const out = new Array(64).fill(0);
    if (typeof raw === 'string' && raw.length === 64) {
        for (let i = 0; i < 64; i += 1) {
            const v = raw.charCodeAt(i) - 48;
            out[i] = (v >= 0 && v <= 14) ? v : 0;
        }
        return out;
    }
    if (!Array.isArray(raw)) return START_CELLS.slice();
    for (let i = 0; i < 64; i += 1) {
        const v = Math.floor(Number(raw[i]) || 0);
        out[i] = (v >= 0 && v <= 14) ? v : 0;
    }
    return out;
}

function sanitizeCastling(raw) {
    const s = String(raw || '');
    let out = '';
    if (s.includes('K')) out += 'K';
    if (s.includes('Q')) out += 'Q';
    if (s.includes('k')) out += 'k';
    if (s.includes('q')) out += 'q';
    return out;
}

function sanitizeEp(raw) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > 63) return -1;
    return n;
}

function sanitizeLastMove(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const from = Math.floor(Number(raw.from));
    const to = Math.floor(Number(raw.to));
    if (!inChessBoardSq(from) || !inChessBoardSq(to)) return null;
    const promo = 'qrbn'.includes(String(raw.promo || '')) ? String(raw.promo) : '';
    return { from, to, promo };
}

function positionKey(cells, turn, castling, ep) {
    let board = '';
    for (let i = 0; i < 64; i += 1) board += String.fromCharCode(48 + (cells[i] || 0));
    return `${board}|${turn}|${castling}|${ep}`;
}

export function emptyChessGame({ now = 0 } = {}) {
    const t = Math.max(0, Math.floor(Number(now) || 0));
    const cells = START_CELLS.slice();
    const turn = CHESS_WHITE;
    const castling = 'KQkq';
    const ep = -1;
    return {
        cells,
        turn,
        castling,
        ep,
        halfmove: 0,
        fullmove: 1,
        winner: '',
        endReason: '',
        lastMove: null,
        inCheck: false,
        hist: [positionKey(cells, turn, castling, ep)],
        turnStartedAt: t,
        moveCount: 0,
    };
}

export function sanitizeChessGame(raw, { now = 0 } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyChessGame({ now });
    const cells = sanitizeCells(raw.cells);
    const turn = raw.turn === CHESS_BLACK ? CHESS_BLACK : CHESS_WHITE;
    const castling = sanitizeCastling(raw.castling);
    const ep = sanitizeEp(raw.ep);
    const winner = raw.winner === CHESS_WHITE || raw.winner === CHESS_BLACK ? raw.winner : '';
    const endReason = CHESS_END_REASONS.includes(String(raw.endReason || '')) ? String(raw.endReason || '') : '';
    const hist = (Array.isArray(raw.hist) ? raw.hist : [])
        .map((k) => String(k || '').slice(0, 80))
        .filter(Boolean)
        .slice(-240);
    const key = positionKey(cells, turn, castling, ep);
    return {
        cells,
        turn,
        castling,
        ep,
        halfmove: Math.max(0, Math.floor(Number(raw.halfmove) || 0)),
        fullmove: Math.max(1, Math.floor(Number(raw.fullmove) || 1)),
        winner,
        endReason: winner || ['stalemate', 'fifty', 'material', 'threefold'].includes(endReason)
            ? (endReason || (winner ? 'checkmate' : ''))
            : '',
        lastMove: sanitizeLastMove(raw.lastMove),
        inCheck: raw.inCheck === true || isSquareAttacked(cells, findKing(cells, turn), opp(turn)),
        hist: hist.length ? hist : [key],
        turnStartedAt: sanitizeEpochMs(raw.turnStartedAt),
        moveCount: Math.max(0, Math.floor(Number(raw.moveCount) || 0)),
    };
}

function findKing(cells, color) {
    const k = color === CHESS_WHITE ? WK : BK;
    for (let i = 0; i < 64; i += 1) if (cells[i] === k) return i;
    return -1;
}

export function isSquareAttacked(cells, sq, byColor) {
    if (!inChessBoardSq(sq)) return false;
    const f = chessFile(sq);
    const r = chessRank(sq);
    const pawn = byColor === CHESS_WHITE ? WP : BP;
    const pawnDr = byColor === CHESS_WHITE ? -1 : 1;
    for (const df of [-1, 1]) {
        const pf = f + df;
        const pr = r + pawnDr;
        if (pf >= 0 && pf < 8 && pr >= 0 && pr < 8 && cells[chessSq(pf, pr)] === pawn) return true;
    }
    const knight = byColor === CHESS_WHITE ? WN : BN;
    const kD = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
    for (let i = 0; i < kD.length; i += 1) {
        const nf = f + kD[i][0];
        const nr = r + kD[i][1];
        if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && cells[chessSq(nf, nr)] === knight) return true;
    }
    const king = byColor === CHESS_WHITE ? WK : BK;
    for (let df = -1; df <= 1; df += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
            if (!df && !dr) continue;
            const nf = f + df;
            const nr = r + dr;
            if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && cells[chessSq(nf, nr)] === king) return true;
        }
    }
    const bishop = byColor === CHESS_WHITE ? WB : BB;
    const rook = byColor === CHESS_WHITE ? WR : BR;
    const queen = byColor === CHESS_WHITE ? WQ : BQ;
    const rays = [
        [1, 0, 'r'], [-1, 0, 'r'], [0, 1, 'r'], [0, -1, 'r'],
        [1, 1, 'b'], [1, -1, 'b'], [-1, 1, 'b'], [-1, -1, 'b'],
    ];
    for (let i = 0; i < rays.length; i += 1) {
        const df = rays[i][0];
        const dr = rays[i][1];
        const kind = rays[i][2];
        let nf = f + df;
        let nr = r + dr;
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
            const p = cells[chessSq(nf, nr)];
            if (p) {
                if (p === queen || (kind === 'r' && p === rook) || (kind === 'b' && p === bishop)) return true;
                break;
            }
            nf += df;
            nr += dr;
        }
    }
    return false;
}

function addMove(out, from, to, extra = {}) {
    out.push({
        from,
        to,
        promo: extra.promo || '',
        capture: extra.capture === true,
        ep: extra.ep === true,
        castle: extra.castle || '',
    });
}

function genPseudo(cells, color, ep) {
    const out = [];
    for (let from = 0; from < 64; from += 1) {
        const p = cells[from];
        if (!p || chessPieceColor(p) !== color) continue;
        const type = chessPieceType(p);
        const f = chessFile(from);
        const r = chessRank(from);
        if (type === 'p') {
            const dir = color === CHESS_WHITE ? 1 : -1;
            const start = color === CHESS_WHITE ? 1 : 6;
            const last = color === CHESS_WHITE ? 7 : 0;
            const one = chessSq(f, r + dir);
            if (r + dir >= 0 && r + dir < 8 && !cells[one]) {
                if (r + dir === last) {
                    'qrbn'.split('').forEach((promo) => addMove(out, from, one, { promo }));
                } else {
                    addMove(out, from, one);
                    const two = chessSq(f, r + dir * 2);
                    if (r === start && !cells[two]) addMove(out, from, two);
                }
            }
            for (const df of [-1, 1]) {
                const cf = f + df;
                const cr = r + dir;
                if (cf < 0 || cf > 7 || cr < 0 || cr > 7) continue;
                const to = chessSq(cf, cr);
                const hit = cells[to];
                if (hit && chessPieceColor(hit) === opp(color)) {
                    if (cr === last) 'qrbn'.split('').forEach((promo) => addMove(out, from, to, { promo, capture: true }));
                    else addMove(out, from, to, { capture: true });
                } else if (to === ep) {
                    addMove(out, from, to, { capture: true, ep: true });
                }
            }
            continue;
        }
        if (type === 'n') {
            const jumps = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
            jumps.forEach(([df, dr]) => {
                const nf = f + df;
                const nr = r + dr;
                if (nf < 0 || nf > 7 || nr < 0 || nr > 7) return;
                const to = chessSq(nf, nr);
                const hit = cells[to];
                if (!hit) addMove(out, from, to);
                else if (chessPieceColor(hit) === opp(color)) addMove(out, from, to, { capture: true });
            });
            continue;
        }
        if (type === 'k') {
            for (let df = -1; df <= 1; df += 1) {
                for (let dr = -1; dr <= 1; dr += 1) {
                    if (!df && !dr) continue;
                    const nf = f + df;
                    const nr = r + dr;
                    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
                    const to = chessSq(nf, nr);
                    const hit = cells[to];
                    if (!hit) addMove(out, from, to);
                    else if (chessPieceColor(hit) === opp(color)) addMove(out, from, to, { capture: true });
                }
            }
            continue;
        }
        const rays = type === 'b'
            ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
            : type === 'r'
                ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
                : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        rays.forEach(([df, dr]) => {
            let nf = f + df;
            let nr = r + dr;
            while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
                const to = chessSq(nf, nr);
                const hit = cells[to];
                if (!hit) addMove(out, from, to);
                else {
                    if (chessPieceColor(hit) === opp(color)) addMove(out, from, to, { capture: true });
                    break;
                }
                nf += df;
                nr += dr;
            }
        });
    }
    return out;
}

function genCastles(cells, color, castling) {
    const out = [];
    const kingSq = color === CHESS_WHITE ? 4 : 60;
    const them = opp(color);
    if (isSquareAttacked(cells, kingSq, them)) return out;
    const canK = color === CHESS_WHITE ? castling.includes('K') : castling.includes('k');
    const canQ = color === CHESS_WHITE ? castling.includes('Q') : castling.includes('q');
    if (canK) {
        const mid = kingSq + 1;
        const dest = kingSq + 2;
        const rook = kingSq + 3;
        if (!cells[mid] && !cells[dest] && chessPieceType(cells[rook]) === 'r' && chessPieceColor(cells[rook]) === color) {
            if (!isSquareAttacked(cells, mid, them) && !isSquareAttacked(cells, dest, them)) {
                addMove(out, kingSq, dest, { castle: 'K' });
            }
        }
    }
    if (canQ) {
        const mid = kingSq - 1;
        const dest = kingSq - 2;
        const far = kingSq - 3;
        const rook = kingSq - 4;
        if (!cells[mid] && !cells[dest] && !cells[far]
            && chessPieceType(cells[rook]) === 'r' && chessPieceColor(cells[rook]) === color) {
            if (!isSquareAttacked(cells, mid, them) && !isSquareAttacked(cells, dest, them)) {
                addMove(out, kingSq, dest, { castle: 'Q' });
            }
        }
    }
    return out;
}

function applyRaw(cells, castling, ep, mv) {
    const next = cloneCells(cells);
    const piece = next[mv.from];
    const color = chessPieceColor(piece);
    let nextCastle = castling;
    let nextEp = -1;
    let captured = mv.ep ? (color === CHESS_WHITE ? next[mv.to - 8] : next[mv.to + 8]) : next[mv.to];
    if (mv.ep) {
        const capSq = color === CHESS_WHITE ? mv.to - 8 : mv.to + 8;
        next[capSq] = 0;
        captured = color === CHESS_WHITE ? BP : WP;
    }
    next[mv.to] = piece;
    next[mv.from] = 0;
    if (mv.promo) next[mv.to] = chessMakePiece(color, mv.promo);
    if (mv.castle === 'K') {
        next[mv.to - 1] = next[mv.to + 1];
        next[mv.to + 1] = 0;
    } else if (mv.castle === 'Q') {
        next[mv.to + 1] = next[mv.to - 2];
        next[mv.to - 2] = 0;
    }
    const type = chessPieceType(piece);
    if (type === 'k') {
        nextCastle = color === CHESS_WHITE
            ? nextCastle.replace('K', '').replace('Q', '')
            : nextCastle.replace('k', '').replace('q', '');
    }
    if (mv.from === 0 || mv.to === 0) nextCastle = nextCastle.replace('Q', '');
    if (mv.from === 7 || mv.to === 7) nextCastle = nextCastle.replace('K', '');
    if (mv.from === 56 || mv.to === 56) nextCastle = nextCastle.replace('q', '');
    if (mv.from === 63 || mv.to === 63) nextCastle = nextCastle.replace('k', '');
    if (type === 'p' && Math.abs(chessRank(mv.to) - chessRank(mv.from)) === 2) {
        nextEp = (mv.from + mv.to) >> 1;
    }
    const reset = type === 'p' || !!captured || mv.ep;
    return { cells: next, castling: nextCastle, ep: nextEp, captured: !!captured, reset };
}

function kingSafeAfter(cells, castling, ep, color, mv) {
    const applied = applyRaw(cells, castling, ep, mv);
    const king = findKing(applied.cells, color);
    return king >= 0 && !isSquareAttacked(applied.cells, king, opp(color));
}

/** 지금 둘 수 있는 합법 수. 자기 킹을 체크에 두는 수는 빠집니다. */
export function listLegalChessMoves(game, color) {
    const g = sanitizeChessGame(game);
    const side = color === CHESS_BLACK || color === CHESS_WHITE ? color : g.turn;
    if (g.winner || g.endReason === 'stalemate' || g.endReason === 'fifty' || g.endReason === 'material' || g.endReason === 'threefold') {
        return [];
    }
    const pseudo = genPseudo(g.cells, side, g.ep).concat(genCastles(g.cells, side, g.castling));
    return pseudo.filter((mv) => kingSafeAfter(g.cells, g.castling, g.ep, side, mv));
}

export function chessIsInCheck(game, color) {
    const g = sanitizeChessGame(game);
    const side = color === CHESS_BLACK || color === CHESS_WHITE ? color : g.turn;
    const king = findKing(g.cells, side);
    return king >= 0 && isSquareAttacked(g.cells, king, opp(side));
}

function countPieces(cells) {
    const c = { w: { n: 0, b: 0, r: 0, q: 0, p: 0, k: 0, bishops: [] }, b: { n: 0, b: 0, r: 0, q: 0, p: 0, k: 0, bishops: [] } };
    for (let i = 0; i < 64; i += 1) {
        const p = cells[i];
        if (!p) continue;
        const col = chessPieceColor(p);
        const t = chessPieceType(p);
        c[col][t] += 1;
        if (t === 'b') c[col].bishops.push((chessFile(i) + chessRank(i)) % 2);
    }
    return c;
}

export function chessInsufficientMaterial(cells) {
    const c = countPieces(cells);
    if (c.w.p + c.b.p + c.w.r + c.b.r + c.w.q + c.b.q) return false;
    const wMin = c.w.n + c.w.b;
    const bMin = c.b.n + c.b.b;
    if (wMin === 0 && bMin === 0) return true;
    if ((wMin === 1 && bMin === 0 && c.w.n + c.w.b === 1) || (bMin === 1 && wMin === 0 && c.b.n + c.b.b === 1)) return true;
    if (c.w.n === 0 && c.b.n === 0 && c.w.b === 1 && c.b.b === 1 && c.w.bishops[0] === c.b.bishops[0]) return true;
    return false;
}

function finishIfNeeded(g) {
    if (g.winner || ['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason)) return g;
    if (chessInsufficientMaterial(g.cells)) {
        return { ...g, winner: '', endReason: 'material', inCheck: false };
    }
    if (g.halfmove >= 100) {
        return { ...g, winner: '', endReason: 'fifty', inCheck: false };
    }
    const key = positionKey(g.cells, g.turn, g.castling, g.ep);
    const reps = g.hist.filter((h) => h === key).length;
    if (reps >= 3) {
        return { ...g, winner: '', endReason: 'threefold', inCheck: false };
    }
    const moves = listLegalChessMoves(g, g.turn);
    const check = chessIsInCheck(g, g.turn);
    if (!moves.length) {
        if (check) {
            return { ...g, winner: opp(g.turn), endReason: 'checkmate', inCheck: true };
        }
        return { ...g, winner: '', endReason: 'stalemate', inCheck: false };
    }
    return { ...g, inCheck: check };
}

function movesEqual(a, b) {
    return a.from === b.from && a.to === b.to && (a.promo || '') === (b.promo || '');
}

export function applyChessMove(game, { from, to, promo, color, now } = {}) {
    const g = sanitizeChessGame(game, { now });
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (g.winner || ['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason)) {
        return { ok: false, error: 'already_over', game: g };
    }
    const side = color === CHESS_BLACK || color === CHESS_WHITE ? color : '';
    if (!side) return { ok: false, error: 'bad_color', game: g };
    if (side !== g.turn) return { ok: false, error: 'not_turn', game: g };
    const fr = Math.floor(Number(from));
    const tr = Math.floor(Number(to));
    if (!inChessBoardSq(fr) || !inChessBoardSq(tr)) return { ok: false, error: 'out', game: g };
    const promoRaw = String(promo || '');
    const wantPromo = promoRaw && 'qrbn'.includes(promoRaw) ? promoRaw : '';
    const legal = listLegalChessMoves(g, side);
    const piece = g.cells[fr];
    const needPromo = chessPieceType(piece) === 'p' && (chessRank(tr) === 0 || chessRank(tr) === 7);
    if (needPromo && !wantPromo) return { ok: false, error: 'need_promo', game: g };
    const found = legal.find((mv) => movesEqual(mv, { from: fr, to: tr, promo: wantPromo }));
    if (!found) return { ok: false, error: 'illegal', game: g };
    const applied = applyRaw(g.cells, g.castling, g.ep, found);
    const nextTurn = opp(side);
    const key = positionKey(applied.cells, nextTurn, applied.castling, applied.ep);
    const next = finishIfNeeded({
        ...g,
        cells: applied.cells,
        turn: nextTurn,
        castling: applied.castling,
        ep: applied.ep,
        halfmove: applied.reset ? 0 : g.halfmove + 1,
        fullmove: side === CHESS_BLACK ? g.fullmove + 1 : g.fullmove,
        lastMove: { from: fr, to: tr, promo: wantPromo },
        hist: g.hist.concat(key).slice(-240),
        turnStartedAt: t,
        moveCount: g.moveCount + 1,
        winner: '',
        endReason: '',
    });
    return { ok: true, error: '', game: next };
}

export function applyChessForfeit(game, { color, now } = {}) {
    const g = sanitizeChessGame(game, { now });
    if (g.winner || ['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason)) {
        return { ok: false, error: 'already_over', game: g };
    }
    const loser = color === CHESS_BLACK || color === CHESS_WHITE ? color : '';
    if (!loser) return { ok: false, error: 'bad_color', game: g };
    return {
        ok: true,
        error: '',
        game: {
            ...g,
            winner: opp(loser),
            endReason: 'forfeit',
            turnStartedAt: Math.max(0, Math.floor(Number(now) || g.turnStartedAt || 0)),
        },
    };
}

export function applyChessTimeout(game, { now } = {}) {
    const g = sanitizeChessGame(game, { now });
    if (g.winner || ['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason)) {
        return { ok: false, error: 'already_over', game: g };
    }
    return {
        ok: true,
        error: '',
        game: {
            ...g,
            winner: opp(g.turn),
            endReason: 'timeout',
            turnStartedAt: Math.max(0, Math.floor(Number(now) || g.turnStartedAt || 0)),
        },
    };
}

export function chessSeatColor(seat) {
    if (seat === 'white') return CHESS_WHITE;
    if (seat === 'black') return CHESS_BLACK;
    return '';
}

export function chessIsOver(game) {
    const g = sanitizeChessGame(game);
    return !!(g.winner || ['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason));
}

export function chessGameToDoc(game) {
    const g = sanitizeChessGame(game);
    return {
        cells: g.cells.slice(),
        turn: g.turn,
        castling: g.castling,
        ep: g.ep,
        halfmove: g.halfmove,
        fullmove: g.fullmove,
        winner: g.winner,
        endReason: g.endReason,
        lastMove: g.lastMove,
        inCheck: g.inCheck,
        hist: g.hist.slice(-240),
        turnStartedAt: g.turnStartedAt,
        moveCount: g.moveCount,
    };
}

export const CHESS_ERROR_LABEL = Object.freeze({
    already_over: '이미 끝난 판입니다.',
    bad_color: '말 색이 올바르지 않습니다.',
    not_turn: '지금 둘 차례가 아닙니다.',
    out: '판 밖에 둘 수 없습니다.',
    illegal: '그 수는 둘 수 없습니다. 자기 킹이 체크에 빠지거나 규칙에 맞지 않습니다.',
    need_promo: '마지막 줄에서는 퀸·룩·비숍·나이트 중 하나로 바꿔야 합니다.',
});

export function chessErrorText(code) {
    return CHESS_ERROR_LABEL[String(code || '')] || '둘 수 없습니다.';
}

export function chessEndText(game, { whiteName = '백', blackName = '흑' } = {}) {
    const g = sanitizeChessGame(game);
    if (g.endReason === 'stalemate') return '스테일메이트(둘 곳이 없음)로 무승부입니다.';
    if (g.endReason === 'fifty') return '50수 규칙으로 무승부입니다.';
    if (g.endReason === 'material') return '기물이 부족해 무승부입니다.';
    if (g.endReason === 'threefold') return '같은 모습이 세 번 나와 무승부입니다.';
    const winnerName = g.winner === CHESS_BLACK ? blackName : whiteName;
    if (g.endReason === 'timeout') return `시간 초과! ${winnerName}의 승리입니다.`;
    if (g.endReason === 'forfeit') return `기권! ${winnerName}의 승리입니다.`;
    if (g.endReason === 'checkmate') return `체크메이트! ${winnerName}의 승리입니다.`;
    if (g.winner) return `${winnerName}의 승리입니다.`;
    return '';
}

export function chessStatusText(game) {
    const g = sanitizeChessGame(game);
    if (chessIsOver(g)) return chessEndText(g);
    if (g.inCheck) return `${CHESS_COLOR_LABEL[g.turn]} 킹이 체크입니다.`;
    return `${CHESS_COLOR_LABEL[g.turn]} 차례입니다.`;
}

export function chessSqName(sq) {
    if (!inChessBoardSq(sq)) return '';
    return `${'abcdefgh'[chessFile(sq)]}${chessRank(sq) + 1}`;
}
