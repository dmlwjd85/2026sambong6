/**
 * 체스 클라이언트 AI.
 * 「고수」는 고정 깊이 3 알파베타와 짧은 정지탐색을 씁니다(한 수 약 1초). 강도는 유지합니다.
 * 「초인」은 강함이 최우선입니다. 오프닝북(건전한 주요 라인)만 다양하고,
 * 북을 벗어나면 최선 수를 둡니다. 동점(약 10cp)일 때만 아주 조금만 섞습니다.
 * 「ply1」은 1수 평가, 「choinOld」는 PR #14 초인으로 검증에만 씁니다.
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
import { pickChessBookMove, pickChessBookMovePr14 } from './chessOpenings.js';
import { choinSearchStats, pickChoinEngineMove, pickSoftChoinMove } from './chessAiChoin.js';
import { choinPr14SearchStats, pickChoinEngineMovePr14, pickSoftChoinMovePr14 } from './chessAiChoinPr14.js';

export { choinSearchStats };

export const CHESS_AI_LEVELS = Object.freeze({
    ply1: Object.freeze({ id: 'ply1', label: '한수', timeMs: 80 }),
    gosu: Object.freeze({ id: 'gosu', label: '고수', timeMs: 900, depth: 3 }),
    choin: Object.freeze({ id: 'choin', label: '초인', timeMs: 3500 }),
    choinOld: Object.freeze({ id: 'choinOld', label: '옛초인', timeMs: 2600 }),
});

export function sanitizeChessAiLevel(raw) {
    if (raw === 'choin') return 'choin';
    if (raw === 'choinOld') return 'choinOld';
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

function pickChoinLegacy(game, timeMs, variety) {
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

const KING_END_PST = Object.freeze([
    -50, -30, -30, -30, -30, -30, -30, -50,
    -30, -10, 0, 0, 0, 0, -10, -30,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, -10, 0, 0, 0, 0, -10, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
]);

function isEndgameCells(cells) {
    let minors = 0;
    let queens = 0;
    for (let i = 0; i < 64; i += 1) {
        const t = chessPieceType(cells[i]);
        if (t === 'q') queens += 1;
        if (t === 'r' || t === 'b' || t === 'n') minors += 1;
    }
    return queens === 0 || (queens <= 1 && minors <= 4);
}

function filePawnMask(cells) {
    const w = [0, 0, 0, 0, 0, 0, 0, 0];
    const b = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let sq = 0; sq < 64; sq += 1) {
        if (chessPieceType(cells[sq]) !== 'p') continue;
        if (chessPieceColor(cells[sq]) === CHESS_WHITE) w[sq & 7] += 1;
        else b[sq & 7] += 1;
    }
    return { w, b };
}

function evaluateChessChoin(game, me) {
    let score = evaluateChess(game, me);
    if (isOverTrusted(game) || Math.abs(score) >= 90000) return score;
    const cells = game.cells;
    const end = isEndgameCells(cells);
    const files = filePawnMask(cells);
    const myW = me === CHESS_WHITE;
    for (let f = 0; f < 8; f += 1) {
        if (files.w[f] > 1) score += myW ? -14 * (files.w[f] - 1) : 14 * (files.w[f] - 1);
        if (files.b[f] > 1) score += myW ? 14 * (files.b[f] - 1) : -14 * (files.b[f] - 1);
        const wIso = files.w[f] && !files.w[f - 1] && !files.w[f + 1];
        const bIso = files.b[f] && !files.b[f - 1] && !files.b[f + 1];
        if (wIso) score += myW ? -10 : 10;
        if (bIso) score += myW ? 10 : -10;
    }
    let myK = -1;
    let theirK = -1;
    for (let sq = 0; sq < 64; sq += 1) {
        if (chessPieceType(cells[sq]) !== 'k') continue;
        if (chessPieceColor(cells[sq]) === me) myK = sq;
        else theirK = sq;
    }
    if (end && myK >= 0) {
        const mine = me === CHESS_WHITE ? KING_END_PST[myK] : KING_END_PST[myK ^ 56];
        const theirs = theirK >= 0
            ? (me === CHESS_WHITE ? KING_END_PST[theirK ^ 56] : KING_END_PST[theirK])
            : 0;
        score += mine - theirs;
    } else if (myK >= 0) {
        const kf = myK & 7;
        const kr = myK >> 3;
        const dir = me === CHESS_WHITE ? 1 : -1;
        let shield = 0;
        for (const df of [-1, 0, 1]) {
            const f = kf + df;
            const r = kr + dir;
            if (f < 0 || f > 7 || r < 0 || r > 7) continue;
            const p = cells[r * 8 + f];
            if (chessPieceType(p) === 'p' && chessPieceColor(p) === me) shield += 12;
        }
        score += shield;
        if ((me === CHESS_WHITE && kr > 1) || (me === CHESS_BLACK && kr < 6)) score -= 16;
    }
    return score;
}

function evaluateChoinStm(game) {
    return evaluateChessChoin(game, game.turn);
}

function makeHistory() {
    const h = new Array(64);
    for (let i = 0; i < 64; i += 1) h[i] = new Array(64).fill(0);
    return h;
}

function orderMovesChoin(game, moves, ttMove, killers, history) {
    return moves.slice().sort((a, b) => {
        const aTt = ttMove && a.from === ttMove.from && a.to === ttMove.to && (a.promo || '') === (ttMove.promo || '') ? 80000 : 0;
        const bTt = ttMove && b.from === ttMove.from && b.to === ttMove.to && (b.promo || '') === (ttMove.promo || '') ? 80000 : 0;
        const aK = killers && killers.some((k) => k && k.from === a.from && k.to === a.to) ? 400 : 0;
        const bK = killers && killers.some((k) => k && k.from === b.from && k.to === b.to) ? 400 : 0;
        const aH = history ? history[a.from][a.to] : 0;
        const bH = history ? history[b.from][b.to] : 0;
        return (bTt + bK + mvvScore(game, b) + bH) - (aTt + aK + mvvScore(game, a) + aH)
            || a.from - b.from || a.to - b.to;
    });
}

function passTurn(game) {
    return {
        ...game,
        turn: game.turn === CHESS_WHITE ? CHESS_BLACK : CHESS_WHITE,
        ep: -1,
    };
}

function choinQuiesce(game, alpha, beta, deadline, qdepth) {
    if (Date.now() >= deadline || qdepth <= 0) return evaluateChoinStm(game);
    if (isOverTrusted(game)) return evaluateChoinStm(game);
    let stand = evaluateChoinStm(game);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const moves = orderMovesChoin(game, listLegalChessMovesTrusted(game).filter((m) => m.capture || m.promo));
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const next = playMove(game, moves[i]);
        const val = -choinQuiesce(next, -beta, -alpha, deadline, qdepth - 1);
        if (val >= beta) return beta;
        if (val > alpha) alpha = val;
    }
    return alpha;
}

function choinNegamax(game, depth, alpha, beta, deadline, tt, killers, history, ply, allowNull) {
    if (Date.now() >= deadline) return evaluateChoinStm(game);
    if (isOverTrusted(game)) return evaluateChoinStm(game);
    const key = chessPositionKey(game);
    const cached = ttGet(tt, key, depth, alpha, beta);
    if (cached) return cached.val;
    if (depth <= 0) {
        const q = choinQuiesce(game, alpha, beta, deadline, 6);
        ttSet(tt, key, 0, q, 'exact', null);
        return q;
    }
    if (allowNull && depth >= 3 && !game.inCheck && ply > 0) {
        const passed = passTurn(game);
        const nm = -choinNegamax(passed, depth - 3, -beta, -beta + 1, deadline, tt, killers, history, ply + 1, false);
        if (nm >= beta) return beta;
    }
    const ttHit = tt.get(key);
    const moves = orderMovesChoin(game, listLegalChessMovesTrusted(game), ttHit && ttHit.mv, killers[ply], history);
    if (!moves.length) return evaluateChoinStm(game);
    let best = -Infinity;
    let bestMv = moves[0];
    let flag = 'alpha';
    const origAlpha = alpha;
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const next = playMove(game, moves[i]);
        const quiet = !moves[i].capture && !moves[i].promo && !next.inCheck;
        let nextDepth = depth - 1;
        if (quiet && depth >= 3 && i >= 3) nextDepth = depth - 2;
        let val = -choinNegamax(next, nextDepth, -beta, -alpha, deadline, tt, killers, history, ply + 1, true);
        if (nextDepth < depth - 1 && val > alpha) {
            val = -choinNegamax(next, depth - 1, -beta, -alpha, deadline, tt, killers, history, ply + 1, true);
        }
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
                history[moves[i].from][moves[i].to] += depth * depth;
            }
            break;
        }
    }
    if (best === -Infinity) best = evaluateChoinStm(game);
    if (best <= origAlpha) flag = 'alpha';
    ttSet(tt, key, depth, best, flag, bestMv);
    return best;
}

function searchChoinRoot(game, depth, deadline, tt, history) {
    const killers = [];
    const moves = orderMovesChoin(game, listLegalChessMovesTrusted(game), tt.get(chessPositionKey(game))?.mv, null, history);
    const rows = [];
    let completed = 0;
    for (let i = 0; i < moves.length; i += 1) {
        if (Date.now() >= deadline) break;
        const next = playMove(game, moves[i]);
        if (next.endReason === 'checkmate' && next.winner === game.turn) {
            return {
                mv: moves[i],
                val: 200000,
                completed: moves.length,
                total: moves.length,
                rows: [{ mv: moves[i], val: 200000 }],
            };
        }
        const val = -choinNegamax(next, depth - 1, -Infinity, Infinity, deadline, tt, killers, history, 1, true);
        rows.push({ mv: moves[i], val });
        completed += 1;
    }
    rows.sort((a, b) => b.val - a.val || a.mv.from - b.mv.from || a.mv.to - b.mv.to);
    return {
        mv: (rows[0] && rows[0].mv) || moves[0] || null,
        val: rows[0] ? rows[0].val : -Infinity,
        completed,
        total: moves.length,
        rows,
    };
}

export function pickSoftChessMove(rows, { rng = Math.random } = {}) {
    const clean = (rows || []).filter((r) => r && r.mv && Number.isFinite(r.val));
    if (!clean.length) return (rows && rows[0] && rows[0].mv) || null;
    const best = clean[0];
    if (best.val >= 90000) return best.mv;
    if (clean.length === 1) return best.mv;
    const gap = best.val - clean[1].val;
    // 동점(약 10cp)이 아니면 항상 최선 수입니다.
    if (gap > 10) return best.mv;
    const pool = clean.filter((r) => best.val - r.val <= 10);
    if (!pool.length) return best.mv;
    let sum = 0;
    const weights = pool.map((r) => {
        const w = Math.exp((r.val - best.val) / 8);
        sum += w;
        return w;
    });
    let pick = (typeof rng === 'function' ? rng() : Math.random()) * (sum || 1);
    for (let i = 0; i < pool.length; i += 1) {
        pick -= weights[i];
        if (pick <= 0) return pool[i].mv;
    }
    return pool[pool.length - 1].mv;
}

export const choinOldSearchStats = { depth: 0 };

function pickChoinPr14(game, timeMs, variety, rng) {
    const moves = listLegalChessMovesTrusted(game);
    if (!moves.length) return null;
    const book = pickChessBookMovePr14(game, rng);
    if (book) return book;
    const found = pickChoinEngineMovePr14(game, { timeMs });
    const rows = (found && found.rows) || [];
    choinOldSearchStats.depth = choinPr14SearchStats.depth;
    if (!rows.length) return (found && found.mv) || pickPly1Move(game, game.turn, variety);
    return pickSoftChoinMovePr14(rows, rng) || found.mv;
}

function pickChoinPr13(game, timeMs, variety, rng) {
    const moves = listLegalChessMovesTrusted(game);
    if (!moves.length) return null;
    const book = pickChessBookMove(game, rng);
    if (book) return book;
    const deadline = Date.now() + Math.max(80, Math.min(3000, Number(timeMs) || CHESS_AI_LEVELS.choin.timeMs));
    const tt = makeTt();
    const history = makeHistory();
    let found = searchChoinRoot(game, 3, deadline, tt, history);
    let rows = found.rows || [];
    let doneDepth = found.completed === found.total ? 3 : 0;
    for (let depth = 4; depth <= 5; depth += 1) {
        if (deadline - Date.now() < 90) break;
        const next = searchChoinRoot(game, depth, deadline, tt, history);
        if (next.completed === next.total && next.rows && next.rows.length) {
            found = next;
            rows = next.rows;
            doneDepth = depth;
        }
        if (next.val >= 90000) {
            found = next;
            rows = next.rows || rows;
            doneDepth = depth;
            break;
        }
    }
    choinOldSearchStats.depth = doneDepth;
    if (!rows.length) return found.mv || pickPly1Move(game, game.turn, variety);
    // PR #13과 같은 넓은 창을 유지해 비교가 공정하게 합니다.
    return pickSoftChessMovePr13(rows, rng) || found.mv;
}

function pickSoftChessMovePr13(rows, rng) {
    const clean = (rows || []).filter((r) => r && r.mv && Number.isFinite(r.val));
    if (!clean.length) return (rows && rows[0] && rows[0].mv) || null;
    const best = clean[0];
    if (best.val >= 90000) return best.mv;
    if (clean.length === 1) return best.mv;
    if (best.val - clean[1].val >= 80) return best.mv;
    const pool = clean.filter((r) => best.val - r.val <= 36);
    if (!pool.length) return best.mv;
    let sum = 0;
    const weights = pool.map((r) => {
        const w = Math.exp((r.val - best.val) / 18);
        sum += w;
        return w;
    });
    let pick = (typeof rng === 'function' ? rng() : Math.random()) * (sum || 1);
    for (let i = 0; i < pool.length; i += 1) {
        pick -= weights[i];
        if (pick <= 0) return pool[i].mv;
    }
    return pool[pool.length - 1].mv;
}

function pickChoinMove(game, timeMs, variety, rng) {
    const moves = listLegalChessMovesTrusted(game);
    if (!moves.length) return null;
    const book = pickChessBookMove(game, rng);
    if (book) return book;
    const found = pickChoinEngineMove(game, { timeMs });
    const rows = (found && found.rows) || [];
    if (!rows.length) return (found && found.mv) || pickPly1Move(game, game.turn, variety);
    // 북을 벗어나면 최선 수. 초반(12수 미만) 동점(약 10cp)만 아주 조금 섞습니다.
    if ((game.moveCount || 0) >= 12) return rows[0].mv;
    return pickSoftChoinMove(rows, rng) || found.mv;
}

export function pickChessAiMove(game, { color, level, timeMs, variety, rng } = {}) {
    const g = sanitizeChessGame(game);
    const my = color === CHESS_BLACK || color === CHESS_WHITE ? color : g.turn;
    if (g.turn !== my) return null;
    const lv = sanitizeChessAiLevel(level);
    const varN = Math.max(0, Math.floor(Number(variety) || 0));
    const roll = typeof rng === 'function' ? rng : Math.random;
    let mv;
    if (lv === 'ply1') mv = pickPly1Move(g, my, varN);
    else if (lv === 'choinOld') mv = pickChoinPr14(g, timeMs, varN, roll);
    else if (lv === 'choin') mv = pickChoinMove(g, timeMs, varN, roll);
    else mv = pickGosuMove(g, timeMs, varN);
    if (!mv) return null;
    return { from: mv.from, to: mv.to, promo: mv.promo || '' };
}

function lookupLegal(game, mv) {
    const legal = listLegalChessMovesTrusted(game);
    return legal.find((m) => m.from === mv.from && m.to === mv.to && (m.promo || '') === (mv.promo || '')) || null;
}

function parseUciMove(uci) {
    const file = (ch) => 'abcdefgh'.indexOf(ch);
    return {
        from: file(uci[0]) + (Number(uci[1]) - 1) * 8,
        to: file(uci[2]) + (Number(uci[3]) - 1) * 8,
        promo: uci.slice(4, 5) || '',
    };
}

/** 오프닝 UCI를 적용한 뒤 대국을 시작합니다. */
export function chessGameFromUci(uciList, now = 1) {
    let g = emptyChessGame({ now });
    (uciList || []).forEach((uci, i) => {
        const want = parseUciMove(uci);
        const found = lookupLegal(g, want);
        if (found) g = applyTrustedChessMove(g, found, now + i);
    });
    return g;
}

/** 한 판을 처음부터(또는 지정 위치에서) 끝까지 두고 결과를 돌려줍니다. */
export function playChessAiMatch({
    whiteLevel,
    blackLevel,
    whiteTime,
    blackTime,
    maxMoves = 80,
    now = 1,
    variety = 0,
    startGame = null,
    rng,
} = {}) {
    let g = startGame ? sanitizeChessGame(startGame) : emptyChessGame({ now });
    let newDepthSum = 0;
    let newDepthN = 0;
    let oldDepthSum = 0;
    let oldDepthN = 0;
    let newTimeSum = 0;
    let newTimeN = 0;
    let oldTimeSum = 0;
    let oldTimeN = 0;
    for (let i = 0; i < maxMoves && !isOverTrusted(g); i += 1) {
        const level = g.turn === CHESS_WHITE ? whiteLevel : blackLevel;
        const timeMs = g.turn === CHESS_WHITE ? whiteTime : blackTime;
        const t0 = Date.now();
        const mv = pickChessAiMove(g, { color: g.turn, level, timeMs, variety, rng });
        const spent = Date.now() - t0;
        if (level === 'choin') {
            newTimeSum += spent;
            newTimeN += 1;
            if (choinSearchStats.depth) {
                newDepthSum += choinSearchStats.depth;
                newDepthN += 1;
            }
        }
        if (level === 'choinOld') {
            oldTimeSum += spent;
            oldTimeN += 1;
            if (choinOldSearchStats.depth) {
                oldDepthSum += choinOldSearchStats.depth;
                oldDepthN += 1;
            }
        }
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
        newDepth: newDepthN ? newDepthSum / newDepthN : 0,
        oldDepth: oldDepthN ? oldDepthSum / oldDepthN : 0,
        newTime: newTimeN ? newTimeSum / newTimeN : 0,
        oldTime: oldTimeN ? oldTimeSum / oldTimeN : 0,
    };
}

export function emptyChessAiGame(now = 0) {
    return emptyChessGame({ now });
}
