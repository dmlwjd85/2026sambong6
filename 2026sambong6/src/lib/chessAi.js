/**
 * 체스 클라이언트 AI.
 * 「고수」는 고정 깊이 3 알파베타와 짧은 정지탐색을 씁니다(한 수 약 1초).
 * 「초인」은 반복 심화·전치표·수 정렬로 더 깊게 봅니다(한 수 최대 3초).
 * 「ply1」은 1수 평가로, 강도 비교 검증에만 씁니다.
 */

import {
    CHESS_BLACK,
    CHESS_WHITE,
    applyChessMove,
    applyTrustedChessMove,
    chessPieceColor,
    chessPieceType,
    chessPositionKey,
    emptyChessGame,
    listLegalChessMovesTrusted,
    sanitizeChessGame,
} from './chessGame.js';

export const CHESS_AI_LEVELS = Object.freeze({
    ply1: Object.freeze({ id: 'ply1', label: '한수', timeMs: 80 }),
    gosu: Object.freeze({ id: 'gosu', label: '고수', timeMs: 900, depth: 3 }),
    choin: Object.freeze({ id: 'choin', label: '초인', timeMs: 2600 }),
});

export function sanitizeChessAiLevel(raw) {
    if (raw === 'choin') return 'choin';
    if (raw === 'ply1') return 'ply1';
    return 'gosu';
}

export function chessAiLevelLabel(level) {
    return CHESS_AI_LEVELS[sanitizeChessAiLevel(level)].label;
}

const VAL = Object.freeze({
    p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
});

const PST = Object.freeze({
    p: [
        0, 0, 0, 0, 0, 0, 0, 0,
        5, 10, 10, -20, -20, 10, 10, 5,
        5, -5, -10, 0, 0, -10, -5, 5,
        0, 0, 0, 20, 20, 0, 0, 0,
        5, 5, 10, 25, 25, 10, 5, 5,
        10, 10, 20, 30, 30, 20, 10, 10,
        50, 50, 50, 50, 50, 50, 50, 50,
        0, 0, 0, 0, 0, 0, 0, 0,
    ],
    n: [
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20, 0, 5, 5, 0, -20, -40,
        -30, 5, 10, 15, 15, 10, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30,
        -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 10, 15, 15, 10, 0, -30,
        -40, -20, 0, 0, 0, 0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10, 5, 0, 0, 0, 0, 5, -10,
        -10, 10, 10, 10, 10, 10, 10, -10,
        -10, 0, 10, 10, 10, 10, 0, -10,
        -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 5, 10, 10, 5, 0, -10,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
        0, 0, 5, 10, 10, 5, 0, 0,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        5, 10, 10, 10, 10, 10, 10, 5,
        0, 0, 0, 0, 0, 0, 0, 0,
    ],
    q: [
        -20, -10, -10, -5, -5, -10, -10, -20,
        -10, 0, 5, 0, 0, 0, 0, -10,
        -10, 5, 5, 5, 5, 5, 0, -10,
        0, 0, 5, 5, 5, 5, 0, -5,
        -5, 0, 5, 5, 5, 5, 0, -5,
        -10, 0, 5, 5, 5, 5, 0, -10,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -20, -10, -10, -5, -5, -10, -10, -20,
    ],
    k: [
        20, 30, 10, 0, 0, 10, 30, 20,
        20, 20, 0, 0, 0, 0, 20, 20,
        -10, -20, -20, -20, -20, -20, -20, -10,
        -20, -30, -30, -40, -40, -30, -30, -20,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
    ],
});

function pstAt(type, sq, color) {
    const table = PST[type];
    if (!table) return 0;
    return color === CHESS_WHITE ? table[sq] : table[sq ^ 56];
}

function isDrawReason(endReason) {
    return ['stalemate', 'fifty', 'material', 'threefold'].includes(endReason);
}

function isOverTrusted(game) {
    return !!(game.winner || isDrawReason(game.endReason));
}

export function evaluateChess(game, me) {
    const g = game && game.cells ? game : sanitizeChessGame(game);
    if (g.endReason === 'checkmate') {
        const dist = Math.min(40, g.moveCount || 0);
        return g.winner === me ? (100000 - dist) : -(100000 - dist);
    }
    if (isDrawReason(g.endReason)) return 0;
    let score = 0;
    let enemyK = -1;
    let myBishops = 0;
    let theirBishops = 0;
    const them = me === CHESS_WHITE ? CHESS_BLACK : CHESS_WHITE;
    for (let sq = 0; sq < 64; sq += 1) {
        const p = g.cells[sq];
        if (!p) continue;
        const col = chessPieceColor(p);
        const type = chessPieceType(p);
        const v = (VAL[type] || 0) + pstAt(type, sq, col);
        score += col === me ? v : -v;
        if (type === 'b') {
            if (col === me) myBishops += 1;
            else theirBishops += 1;
        }
        if (type === 'k' && col === them) enemyK = sq;
    }
    if (myBishops >= 2) score += 28;
    if (theirBishops >= 2) score -= 28;
    if (g.inCheck && g.turn !== me) score += 22;
    if (g.inCheck && g.turn === me) score -= 22;
    if (enemyK >= 0) {
        const kf = enemyK & 7;
        const kr = enemyK >> 3;
        for (let sq = 0; sq < 64; sq += 1) {
            const p = g.cells[sq];
            if (!p || chessPieceColor(p) !== me || chessPieceType(p) === 'k') continue;
            const d = Math.abs((sq & 7) - kf) + Math.abs((sq >> 3) - kr);
            score += Math.max(0, 14 - d);
        }
    }
    return score;
}

function evaluateStm(game) {
    return evaluateChess(game, game.turn);
}

function varietyJitter(mv, variety) {
    if (!variety) return 0;
    return ((mv.from * 13 + mv.to * 7 + (mv.promo ? 3 : 0) + variety) % 7) * 0.01;
}

function mvvScore(game, mv) {
    let victim = 0;
    if (mv.ep) victim = VAL.p;
    else if (mv.capture) {
        const hit = game.cells[mv.to];
        victim = VAL[chessPieceType(hit)] || 0;
    }
    if (mv.promo) victim += VAL[mv.promo] || 0;
    const atk = VAL[chessPieceType(game.cells[mv.from])] || 0;
    return victim * 16 - atk;
}

function orderMoves(game, moves, ttMove, killers) {
    return moves.slice().sort((a, b) => {
        const aTt = ttMove && a.from === ttMove.from && a.to === ttMove.to && (a.promo || '') === (ttMove.promo || '') ? 50000 : 0;
        const bTt = ttMove && b.from === ttMove.from && b.to === ttMove.to && (b.promo || '') === (ttMove.promo || '') ? 50000 : 0;
        const aK = killers && killers.some((k) => k && k.from === a.from && k.to === a.to) ? 250 : 0;
        const bK = killers && killers.some((k) => k && k.from === b.from && k.to === b.to) ? 250 : 0;
        return (bTt + bK + mvvScore(game, b)) - (aTt + aK + mvvScore(game, a))
            || a.from - b.from || a.to - b.to;
    });
}

function playMove(game, mv) {
    return applyTrustedChessMove(game, {
        ...mv,
        promo: mv.promo || '',
    }, game.turnStartedAt);
}

function makeTt() {
    return new Map();
}

function ttGet(tt, key, depth, alpha, beta) {
    const hit = tt.get(key);
    if (!hit || hit.depth < depth) return null;
    if (hit.flag === 'exact') return hit;
    if (hit.flag === 'alpha' && hit.val <= alpha) return hit;
    if (hit.flag === 'beta' && hit.val >= beta) return hit;
    return null;
}

function ttSet(tt, key, depth, val, flag, mv) {
    if (tt.size > 24000) {
        const first = tt.keys().next().value;
        if (first !== undefined) tt.delete(first);
    }
    tt.set(key, { depth, val, flag, mv });
}

function quiesce(game, alpha, beta, deadline, qdepth) {
    if (Date.now() >= deadline || qdepth <= 0) return evaluateStm(game);
    if (isOverTrusted(game)) return evaluateStm(game);
    let stand = evaluateStm(game);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const moves = orderMoves(game, listLegalChessMovesTrusted(game).filter((m) => m.capture || m.promo));
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const next = playMove(game, moves[i]);
        const val = -quiesce(next, -beta, -alpha, deadline, qdepth - 1);
        if (val >= beta) return beta;
        if (val > alpha) alpha = val;
    }
    return alpha;
}

function negamax(game, depth, alpha, beta, deadline, useQ, qdepth, tt, killers, ply) {
    if (Date.now() >= deadline) return evaluateStm(game);
    if (isOverTrusted(game)) return evaluateStm(game);
    const key = chessPositionKey(game);
    const cached = ttGet(tt, key, depth, alpha, beta);
    if (cached) return cached.val;
    if (depth <= 0) {
        const q = useQ ? quiesce(game, alpha, beta, deadline, qdepth) : evaluateStm(game);
        ttSet(tt, key, 0, q, 'exact', null);
        return q;
    }
    const ttHit = tt.get(key);
    const moves = orderMoves(game, listLegalChessMovesTrusted(game), ttHit && ttHit.mv, killers[ply]);
    if (!moves.length) return evaluateStm(game);
    let best = -Infinity;
    let bestMv = moves[0];
    let flag = 'alpha';
    const origAlpha = alpha;
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const next = playMove(game, moves[i]);
        const val = -negamax(next, depth - 1, -beta, -alpha, deadline, useQ, qdepth, tt, killers, ply + 1);
        if (val > best) {
            best = val;
            bestMv = moves[i];
        }
        if (val > alpha) {
            alpha = val;
            flag = 'exact';
        }
        if (alpha >= beta) {
            flag = 'beta';
            if (!moves[i].capture) {
                const slot = killers[ply] || (killers[ply] = []);
                slot.unshift(moves[i]);
                if (slot.length > 2) slot.length = 2;
            }
            break;
        }
    }
    if (best === -Infinity) best = evaluateStm(game);
    if (best <= origAlpha) flag = 'alpha';
    ttSet(tt, key, depth, best, flag, bestMv);
    return best;
}

function searchBest(game, depth, deadline, useQ, qdepth, tt, variety) {
    const killers = [];
    const moves = orderMoves(game, listLegalChessMovesTrusted(game), tt.get(chessPositionKey(game))?.mv);
    let best = moves[0] || null;
    let bestVal = -Infinity;
    let completed = 0;
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const next = playMove(game, moves[i]);
        if (next.endReason === 'checkmate' && next.winner === game.turn) {
            return { mv: moves[i], val: 200000, completed: moves.length, total: moves.length };
        }
        const val = -negamax(next, depth - 1, -Infinity, Infinity, deadline, useQ, qdepth, tt, killers, 1);
        const blended = val + varietyJitter(moves[i], variety);
        if (blended > bestVal) {
            bestVal = blended;
            best = moves[i];
        }
        completed += 1;
    }
    return { mv: best, val: bestVal, completed, total: moves.length };
}

function pickPly1Move(game, me, variety) {
    const moves = listLegalChessMovesTrusted(game);
    if (!moves.length) return null;
    let best = moves[0];
    let bestVal = -Infinity;
    for (let i = 0; i < moves.length; i += 1) {
        const next = playMove(game, moves[i]);
        if (next.endReason === 'checkmate' && next.winner === me) return moves[i];
        const val = evaluateChess(next, me) + varietyJitter(moves[i], variety);
        if (val > bestVal) {
            bestVal = val;
            best = moves[i];
        }
    }
    return best;
}

function pickGosuMove(game, timeMs, variety) {
    const moves = listLegalChessMovesTrusted(game);
    if (!moves.length) return null;
    const deadline = Date.now() + Math.max(60, Math.min(1000, Number(timeMs) || CHESS_AI_LEVELS.gosu.timeMs));
    const tt = makeTt();
    const found = searchBest(game, 3, deadline, true, 2, tt, variety);
    return found.mv || pickPly1Move(game, game.turn, variety);
}

function pickChoinMove(game, timeMs, variety) {
    const moves = listLegalChessMovesTrusted(game);
    if (!moves.length) return null;
    const deadline = Date.now() + Math.max(80, Math.min(3000, Number(timeMs) || CHESS_AI_LEVELS.choin.timeMs));
    const tt = makeTt();
    // 고수와 같은 깊이 3을 먼저 끝내 기본 수로 둡니다. 정지탐색은 더 깊게 봅니다.
    let found = searchBest(game, 3, deadline, true, 5, tt, variety);
    let best = found.mv || pickPly1Move(game, game.turn, variety);
    for (let depth = 4; depth <= 5; depth += 1) {
        if (Date.now() >= deadline) break;
        const next = searchBest(game, depth, deadline, true, 5, tt, variety);
        if (next.mv && next.completed === next.total) {
            best = next.mv;
        }
        if (next.val >= 90000) {
            best = next.mv || best;
            break;
        }
    }
    return best;
}

export function pickChessAiMove(game, { color, level, timeMs, variety } = {}) {
    const g = sanitizeChessGame(game);
    const my = color === CHESS_BLACK || color === CHESS_WHITE ? color : g.turn;
    if (g.turn !== my) return null;
    const lv = sanitizeChessAiLevel(level);
    const varN = Math.max(0, Math.floor(Number(variety) || 0));
    let mv;
    if (lv === 'ply1') mv = pickPly1Move(g, my, varN);
    else if (lv === 'choin') mv = pickChoinMove(g, timeMs, varN);
    else mv = pickGosuMove(g, timeMs, varN);
    if (!mv) return null;
    return { from: mv.from, to: mv.to, promo: mv.promo || '' };
}

function lookupLegal(game, mv) {
    const legal = listLegalChessMovesTrusted(game);
    return legal.find((m) => m.from === mv.from && m.to === mv.to && (m.promo || '') === (mv.promo || '')) || null;
}

/** 한 판을 처음부터 끝까지 두고 결과를 돌려줍니다. */
export function playChessAiMatch({
    whiteLevel,
    blackLevel,
    whiteTime,
    blackTime,
    maxMoves = 80,
    now = 1,
    variety = 0,
} = {}) {
    let g = emptyChessGame({ now });
    for (let i = 0; i < maxMoves && !isOverTrusted(g); i += 1) {
        const level = g.turn === CHESS_WHITE ? whiteLevel : blackLevel;
        const timeMs = g.turn === CHESS_WHITE ? whiteTime : blackTime;
        const mv = pickChessAiMove(g, { color: g.turn, level, timeMs, variety });
        if (!mv) break;
        const found = lookupLegal(g, mv);
        if (!found) {
            const placed = applyChessMove(g, { ...mv, color: g.turn, now: now + i });
            if (!placed.ok) break;
            g = placed.game;
            continue;
        }
        g = applyTrustedChessMove(g, found, now + i);
    }
    return {
        winner: g.winner || '',
        endReason: g.endReason || '',
        moveCount: g.moveCount,
        whiteEval: evaluateChess(g, CHESS_WHITE),
    };
}

export function emptyChessAiGame(now = 0) {
    return emptyChessGame({ now });
}
