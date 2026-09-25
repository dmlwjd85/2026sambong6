/**
 * 체스 클라이언트 AI.
 * 「고수」는 2수 앞을 보고, 「초인」은 반복 심화·잡기 정지탐색을 씁니다.
 * 턴당 시간 상한을 지키며, 초인은 고수 수를 기본으로 두고 더 좋은 수를 찾습니다.
 */

import {
    CHESS_BLACK,
    CHESS_WHITE,
    applyChessMove,
    chessIsOver,
    chessPieceColor,
    chessPieceType,
    emptyChessGame,
    listLegalChessMoves,
    sanitizeChessGame,
} from './chessGame.js';

export const CHESS_AI_LEVELS = Object.freeze({
    gosu: Object.freeze({ id: 'gosu', label: '고수', timeMs: 700 }),
    choin: Object.freeze({ id: 'choin', label: '초인', timeMs: 2600 }),
});

export function sanitizeChessAiLevel(raw) {
    return raw === 'choin' ? 'choin' : 'gosu';
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

export function evaluateChess(game, me) {
    const g = sanitizeChessGame(game);
    if (g.endReason === 'checkmate') {
        return g.winner === me ? 100000 : -100000;
    }
    if (['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason)) return 0;
    let score = 0;
    for (let sq = 0; sq < 64; sq += 1) {
        const p = g.cells[sq];
        if (!p) continue;
        const col = chessPieceColor(p);
        const type = chessPieceType(p);
        const v = (VAL[type] || 0) + pstAt(type, sq, col);
        score += col === me ? v : -v;
    }
    if (g.inCheck && g.turn !== me) score += 18;
    if (g.inCheck && g.turn === me) score -= 18;
    let enemyK = -1;
    const them = me === CHESS_WHITE ? CHESS_BLACK : CHESS_WHITE;
    for (let sq = 0; sq < 64; sq += 1) {
        const p = g.cells[sq];
        if (p && chessPieceType(p) === 'k' && chessPieceColor(p) === them) enemyK = sq;
    }
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

function orderMoves(moves) {
    return moves.slice().sort((a, b) => {
        const ap = a.promo === 'q' ? 800 : 0;
        const bp = b.promo === 'q' ? 800 : 0;
        const ac = a.capture ? 400 : 0;
        const bc = b.capture ? 400 : 0;
        return (bp + bc) - (ap + ac) || a.from - b.from || a.to - b.to;
    });
}

function pickDefaultPromo(mv) {
    return mv.promo || (chessNeedsPromo(mv) ? 'q' : '');
}

function chessNeedsPromo(mv) {
    return !!mv.promo;
}

function playMove(game, mv, now) {
    return applyChessMove(game, {
        from: mv.from,
        to: mv.to,
        promo: pickDefaultPromo(mv) || mv.promo,
        color: game.turn,
        now,
    });
}

function quiesce(game, me, alpha, beta, deadline, qdepth) {
    if (Date.now() >= deadline || qdepth <= 0) return evaluateChess(game, me);
    let stand = evaluateChess(game, me);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const captures = orderMoves(listLegalChessMoves(game)).filter((m) => m.capture || m.promo);
    for (let i = 0; i < captures.length && Date.now() < deadline; i += 1) {
        const r = playMove(game, captures[i], game.turnStartedAt);
        if (!r.ok) continue;
        const val = -quiesce(r.game, me, -beta, -alpha, deadline, qdepth - 1);
        if (val >= beta) return beta;
        if (val > alpha) alpha = val;
    }
    return alpha;
}

function negamax(game, me, depth, alpha, beta, deadline, useQ) {
    if (Date.now() >= deadline) return evaluateChess(game, me);
    if (chessIsOver(game)) return evaluateChess(game, me);
    if (depth <= 0) {
        return useQ ? quiesce(game, me, alpha, beta, deadline, 4) : evaluateChess(game, me);
    }
    const moves = orderMoves(listLegalChessMoves(game));
    if (!moves.length) return evaluateChess(game, me);
    let best = -Infinity;
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const r = playMove(game, moves[i], game.turnStartedAt);
        if (!r.ok) continue;
        const val = -negamax(r.game, me, depth - 1, -beta, -alpha, deadline, useQ);
        if (val > best) best = val;
        if (val > alpha) alpha = val;
        if (alpha >= beta) break;
    }
    return best === -Infinity ? evaluateChess(game, me) : best;
}

function searchBest(game, me, depth, deadline, useQ, rootMoves) {
    const moves = orderMoves(rootMoves || listLegalChessMoves(game));
    let best = moves[0] || null;
    let bestVal = -Infinity;
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const r = playMove(game, moves[i], game.turnStartedAt);
        if (!r.ok) continue;
        if (r.game.endReason === 'checkmate' && r.game.winner === me) return { mv: moves[i], val: 200000 };
        const val = -negamax(r.game, me, depth - 1, -Infinity, Infinity, deadline, useQ);
        const blended = val + (moves[i].capture ? 2 : 0) + (moves[i].promo === 'q' ? 4 : 0);
        if (blended > bestVal) {
            bestVal = blended;
            best = moves[i];
        }
    }
    return { mv: best, val: bestVal };
}

function pickGosuMove(game, me) {
    const moves = listLegalChessMoves(game, me);
    if (!moves.length) return null;
    const mate = moves.find((mv) => {
        const r = playMove(game, mv, game.turnStartedAt);
        return r.ok && r.game.endReason === 'checkmate' && r.game.winner === me;
    });
    if (mate) return mate;
    // 고수: 한 수 앞 평가(걸어 둔 말·체크를 놓치지 않음). 초인이 더 깊게 봅니다.
    let best = moves[0];
    let bestVal = -Infinity;
    for (let i = 0; i < moves.length; i += 1) {
        const r = playMove(game, moves[i], game.turnStartedAt);
        if (!r.ok) continue;
        const val = -evaluateChess(r.game, me);
        if (val > bestVal) {
            bestVal = val;
            best = moves[i];
        }
    }
    return best;
}

function pickChoinMove(game, me, timeMs) {
    const moves = listLegalChessMoves(game, me);
    if (!moves.length) return null;
    const gosu = pickGosuMove(game, me);
    const deadline = Date.now() + Math.max(80, Math.min(3000, Number(timeMs) || CHESS_AI_LEVELS.choin.timeMs));
    let best = gosu || moves[0];
    const gosuPlayed = gosu ? playMove(game, gosu, game.turnStartedAt) : null;
    let bestVal = gosuPlayed && gosuPlayed.ok ? -evaluateChess(gosuPlayed.game, me) : -Infinity;
    for (let depth = 2; depth <= 4; depth += 1) {
        if (Date.now() >= deadline) break;
        const found = searchBest(game, me, depth, deadline, true, moves);
        if (found.mv && found.val > bestVal) {
            best = found.mv;
            bestVal = found.val;
        }
        if (found.val >= 90000) break;
    }
    return best;
}

export function pickChessAiMove(game, { color, level, timeMs } = {}) {
    const g = sanitizeChessGame(game);
    const my = color === CHESS_BLACK || color === CHESS_WHITE ? color : g.turn;
    if (g.turn !== my) return null;
    const lv = sanitizeChessAiLevel(level);
    const mv = lv === 'choin' ? pickChoinMove(g, my, timeMs) : pickGosuMove(g, my);
    if (!mv) return null;
    return { from: mv.from, to: mv.to, promo: mv.promo || '' };
}

export function emptyChessAiGame(now = 0) {
    return emptyChessGame({ now });
}
