/**
 * 오목 클라이언트 AI (학급용).
 * 「고수」는 열린 4·3 차단과 한 수 앞(2-ply)을 봅니다.
 * 「초인」은 위협 수(연속 4)와 더 깊은 탐색을 쓰되, 턴당 시간 상한을 지킵니다.
 */

import {
    GOMOKU_BLACK,
    GOMOKU_EMPTY,
    GOMOKU_SIZE,
    GOMOKU_WHITE,
    gomokuHasFive,
    gomokuIsForbiddenDoubleThree,
    inGomokuBoard,
    sanitizeGomokuGame,
} from './gomokuGame.js';

export const GOMOKU_AI_LEVELS = Object.freeze({
    gosu: Object.freeze({ id: 'gosu', label: '고수', timeMs: 800 }),
    choin: Object.freeze({ id: 'choin', label: '초인', timeMs: 2600 }),
});

export function sanitizeGomokuAiLevel(raw) {
    return raw === 'choin' ? 'choin' : 'gosu';
}

export function gomokuAiLevelLabel(level) {
    return GOMOKU_AI_LEVELS[sanitizeGomokuAiLevel(level)].label;
}

const DIRS = Object.freeze([[1, 0], [0, 1], [1, 1], [1, -1]]);

export const GOMOKU_AI_SCORE = Object.freeze({
    five: 10_000_000,
    live4: 400_000,
    rush4: 50_000,
    double3: 80_000,
    live3: 8_000,
    sleep3: 700,
    live2: 350,
    sleep2: 60,
    one: 12,
});

function opp(color) {
    return color === GOMOKU_BLACK ? GOMOKU_WHITE : GOMOKU_BLACK;
}

function at(board, x, y) {
    if (!inGomokuBoard(x, y, board.length)) return 3;
    return board[y][x];
}

/**
 * (x,y)에 color 를 둔다고 보고 한 방향의 연속·열림·건너뛰기를 셉니다.
 */
export function gomokuDirShape(board, x, y, dx, dy, color) {
    let count = 1;
    let leftOpen = false;
    let rightOpen = false;
    let leftJump = 0;
    let rightJump = 0;

    let i = 1;
    while (at(board, x - dx * i, y - dy * i) === color) {
        count += 1;
        i += 1;
    }
    if (at(board, x - dx * i, y - dy * i) === GOMOKU_EMPTY) {
        leftOpen = true;
        let j = i + 1;
        while (at(board, x - dx * j, y - dy * j) === color) {
            leftJump += 1;
            j += 1;
        }
    }

    i = 1;
    while (at(board, x + dx * i, y + dy * i) === color) {
        count += 1;
        i += 1;
    }
    if (at(board, x + dx * i, y + dy * i) === GOMOKU_EMPTY) {
        rightOpen = true;
        let j = i + 1;
        while (at(board, x + dx * j, y + dy * j) === color) {
            rightJump += 1;
            j += 1;
        }
    }

    const openEnds = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);
    return { count, openEnds, leftJump, rightJump };
}

function shapeScore(shape) {
    const { count, openEnds, leftJump, rightJump } = shape;
    if (count >= 5) return GOMOKU_AI_SCORE.five;
    if (count === 4) {
        if (openEnds === 2) return GOMOKU_AI_SCORE.live4;
        if (openEnds === 1) return GOMOKU_AI_SCORE.rush4;
        return 0;
    }
    const hole = leftJump + rightJump;
    if (count === 3) {
        if (openEnds === 2) return GOMOKU_AI_SCORE.live3;
        // 뛰어넘은 3(X X _ X)은 열린 3에 가깝게 봅니다.
        if (hole >= 1 && openEnds >= 1) return Math.floor(GOMOKU_AI_SCORE.live3 * 0.7);
        if (openEnds === 1) return GOMOKU_AI_SCORE.sleep3;
        return 0;
    }
    if (count === 2 && hole >= 1 && openEnds === 2 && count + hole >= 3) {
        return Math.floor(GOMOKU_AI_SCORE.live3 * 0.75);
    }
    if (count === 2) {
        if (openEnds === 2) return GOMOKU_AI_SCORE.live2;
        if (openEnds === 1) return GOMOKU_AI_SCORE.sleep2;
        return 0;
    }
    if (count === 1 && openEnds === 2) return GOMOKU_AI_SCORE.one;
    return 0;
}

export function gomokuPointAttackScore(board, x, y, color) {
    if (!inGomokuBoard(x, y, board.length) || board[y][x] !== GOMOKU_EMPTY) return 0;
    const dirScores = DIRS.map(([dx, dy]) => shapeScore(gomokuDirShape(board, x, y, dx, dy, color)));
    let live4 = 0;
    let rush4 = 0;
    let live3 = 0;
    dirScores.forEach((s) => {
        if (s >= GOMOKU_AI_SCORE.five) live4 += 0;
        if (s >= GOMOKU_AI_SCORE.five) return;
        if (s >= GOMOKU_AI_SCORE.live4) live4 += 1;
        else if (s >= GOMOKU_AI_SCORE.rush4) rush4 += 1;
        else if (s >= GOMOKU_AI_SCORE.live3) live3 += 1;
    });
    if (dirScores.some((s) => s >= GOMOKU_AI_SCORE.five)) return GOMOKU_AI_SCORE.five;
    if (live4 >= 1) return GOMOKU_AI_SCORE.live4 * 2;
    if (rush4 >= 2 || (rush4 >= 1 && live3 >= 1)) return GOMOKU_AI_SCORE.double3 * 2;
    if (live3 >= 2) return GOMOKU_AI_SCORE.double3;
    return dirScores.reduce((a, b) => a + b, 0);
}

export function gomokuPointScore(board, x, y, myColor) {
    const attack = gomokuPointAttackScore(board, x, y, myColor);
    const defend = gomokuPointAttackScore(board, x, y, opp(myColor));
    if (attack >= GOMOKU_AI_SCORE.five) return GOMOKU_AI_SCORE.five * 10;
    if (defend >= GOMOKU_AI_SCORE.five) return GOMOKU_AI_SCORE.five * 8;
    if (attack >= GOMOKU_AI_SCORE.live4) return attack * 1.15 + defend;
    if (defend >= GOMOKU_AI_SCORE.live4) return defend * 1.05 + attack;
    if (defend >= GOMOKU_AI_SCORE.double3) return defend * 1.12 + attack;
    if (attack >= GOMOKU_AI_SCORE.double3) return attack * 1.1 + defend;
    if (defend >= GOMOKU_AI_SCORE.live3) return defend * 1.25 + attack;
    if (attack >= GOMOKU_AI_SCORE.live3) return attack * 1.18 + defend;
    return attack * 1.08 + defend;
}

export function listGomokuAiCandidates(board, radius = 2) {
    const n = Array.isArray(board) ? board.length : 0;
    const out = [];
    if (!n) return out;
    const seen = new Set();
    let hasStone = false;
    for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
            if (board[y][x] === GOMOKU_EMPTY) continue;
            hasStone = true;
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (!inGomokuBoard(nx, ny, n) || board[ny][nx] !== GOMOKU_EMPTY) continue;
                    const key = ny * n + nx;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push({ x: nx, y: ny });
                }
            }
        }
    }
    if (!hasStone) {
        const c = Math.floor(n / 2);
        return [{ x: c, y: c }];
    }
    return out;
}

function clonePlace(board, x, y, color) {
    const next = board.map((row) => row.slice());
    next[y][x] = color;
    return next;
}

function bestCandidateScore(board, color, candidates) {
    let best = -Infinity;
    for (let i = 0; i < candidates.length; i += 1) {
        const c = candidates[i];
        const s = gomokuPointScore(board, c.x, c.y, color);
        if (s > best) best = s;
    }
    return best;
}

function isLegalAiMove(board, x, y, color) {
    if (!inGomokuBoard(x, y, board.length) || board[y][x] !== GOMOKU_EMPTY) return false;
    return !gomokuIsForbiddenDoubleThree(board, x, y, color);
}

function rankCandidates(board, color, radius = 2) {
    const cands = listGomokuAiCandidates(board, radius).filter((c) => isLegalAiMove(board, c.x, c.y, color));
    return cands.map((c) => ({
        x: c.x,
        y: c.y,
        score: gomokuPointScore(board, c.x, c.y, color),
    })).sort((a, b) => b.score - a.score || (a.x - b.x) || (a.y - b.y));
}

/**
 * 고수: 즉시 승리·상대 5 차단을 최우선하고, 나머지는 상위 후보에 한 수 앞을 봅니다.
 */
function pickGosuMove(game, my) {
    const board = game.board;
    const ranked = rankCandidates(board, my, 2);
    if (!ranked.length) {
        const c = Math.floor((game.size || GOMOKU_SIZE) / 2);
        return { x: c, y: c, score: 0 };
    }

    const top = ranked[0];
    if (top.score >= GOMOKU_AI_SCORE.five * 7) {
        return top;
    }

    const ply = ranked.slice(0, Math.min(10, ranked.length));
    let best = ply[0];
    let bestVal = -Infinity;
    for (let i = 0; i < ply.length; i += 1) {
        const mv = ply[i];
        if (mv.score >= GOMOKU_AI_SCORE.five) return mv;
        const nextBoard = clonePlace(board, mv.x, mv.y, my);
        const replyCands = listGomokuAiCandidates(nextBoard, 2).filter((c) => isLegalAiMove(nextBoard, c.x, c.y, opp(my)));
        const oppBest = bestCandidateScore(nextBoard, opp(my), replyCands);
        if (oppBest >= GOMOKU_AI_SCORE.five * 7) {
            const val = mv.score - GOMOKU_AI_SCORE.five;
            if (val > bestVal) {
                bestVal = val;
                best = mv;
            }
            continue;
        }
        const val = mv.score * 1.05 - oppBest * 0.92;
        if (val > bestVal) {
            bestVal = val;
            best = mv;
        }
    }
    return best;
}

function evaluateBoard(board, me) {
    const cands = listGomokuAiCandidates(board, 2);
    let score = 0;
    for (let i = 0; i < cands.length; i += 1) {
        const c = cands[i];
        score += gomokuPointAttackScore(board, c.x, c.y, me);
        score -= gomokuPointAttackScore(board, c.x, c.y, opp(me));
    }
    return score;
}

/** 연속 4(VCF)로 이길 수 있으면 그 첫 수를 돌려줍니다. */
function searchVcf(board, color, deadline, depth) {
    if (Date.now() >= deadline || depth > 7) return null;
    const ranked = rankCandidates(board, color, 2);
    for (let i = 0; i < ranked.length; i += 1) {
        const mv = ranked[i];
        if (mv.score < GOMOKU_AI_SCORE.rush4) break;
        if (Date.now() >= deadline) return null;
        const next = clonePlace(board, mv.x, mv.y, color);
        if (gomokuHasFive(next, mv.x, mv.y)) return mv;
        const oppCands = rankCandidates(next, opp(color), 2);
        if (oppCands.length && oppCands[0].score >= GOMOKU_AI_SCORE.five) continue;
        const blocks = oppCands.filter((c) => gomokuPointAttackScore(next, c.x, c.y, color) >= GOMOKU_AI_SCORE.five);
        const toBlock = blocks.length ? blocks.slice(0, 3) : oppCands.slice(0, 1);
        let forced = true;
        for (let b = 0; b < toBlock.length; b += 1) {
            const after = clonePlace(next, toBlock[b].x, toBlock[b].y, opp(color));
            if (gomokuHasFive(after, toBlock[b].x, toBlock[b].y)) {
                forced = false;
                break;
            }
            if (!searchVcf(after, color, deadline, depth + 1)) {
                forced = false;
                break;
            }
        }
        if (forced && toBlock.length) return mv;
    }
    return null;
}

function alphaBeta(board, depth, alpha, beta, toMove, me, deadline) {
    if (Date.now() >= deadline) return evaluateBoard(board, me);
    if (depth <= 0) return evaluateBoard(board, me);
    const ranked = rankCandidates(board, toMove, 2).slice(0, depth >= 3 ? 6 : 10);
    if (!ranked.length) return evaluateBoard(board, me);
    if (toMove === me) {
        let best = -Infinity;
        for (let i = 0; i < ranked.length; i += 1) {
            const mv = ranked[i];
            const next = clonePlace(board, mv.x, mv.y, toMove);
            if (gomokuHasFive(next, mv.x, mv.y)) return GOMOKU_AI_SCORE.five * 8;
            const val = alphaBeta(next, depth - 1, alpha, beta, opp(toMove), me, deadline);
            if (val > best) best = val;
            if (best > alpha) alpha = best;
            if (beta <= alpha || Date.now() >= deadline) break;
        }
        return best;
    }
    let best = Infinity;
    for (let i = 0; i < ranked.length; i += 1) {
        const mv = ranked[i];
        const next = clonePlace(board, mv.x, mv.y, toMove);
        if (gomokuHasFive(next, mv.x, mv.y)) return -GOMOKU_AI_SCORE.five * 8;
        const val = alphaBeta(next, depth - 1, alpha, beta, opp(toMove), me, deadline);
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (beta <= alpha || Date.now() >= deadline) break;
    }
    return best;
}

function pickChoinMove(game, my, timeMs) {
    const board = game.board;
    const deadline = Date.now() + Math.max(80, Math.min(3000, Number(timeMs) || GOMOKU_AI_LEVELS.choin.timeMs));
    // 시간이 부족해도 고수 수는 보장합니다. 탐색이 더 좋은 수를 찾으면 바꿉니다.
    const gosu = pickGosuMove(game, my);
    const ranked = rankCandidates(board, my, 3);
    if (!ranked.length) return gosu;
    if (ranked[0].score >= GOMOKU_AI_SCORE.five) return ranked[0];
    if (ranked[0].score >= GOMOKU_AI_SCORE.five * 7) return ranked[0];

    const vcf = searchVcf(board, my, deadline, 0);
    if (vcf) return vcf;

    let best = gosu;
    const gosuNext = clonePlace(board, gosu.x, gosu.y, my);
    if (gomokuHasFive(gosuNext, gosu.x, gosu.y)) return gosu;
    let bestVal = alphaBeta(gosuNext, 1, -Infinity, Infinity, opp(my), my, deadline) + (gosu.score || 0) * 0.02;
    const widths = [12, 8, 6];
    for (let depth = 2; depth <= 4; depth += 1) {
        if (Date.now() >= deadline) break;
        const slice = ranked.slice(0, widths[depth - 2] || 6);
        for (let i = 0; i < slice.length; i += 1) {
            if (Date.now() >= deadline) break;
            const mv = slice[i];
            if (mv.x === gosu.x && mv.y === gosu.y && depth === 2) continue;
            const next = clonePlace(board, mv.x, mv.y, my);
            if (gomokuHasFive(next, mv.x, mv.y)) return mv;
            const val = alphaBeta(next, depth - 1, -Infinity, Infinity, opp(my), my, deadline);
            const blended = val + mv.score * 0.02;
            if (blended > bestVal) {
                bestVal = blended;
                best = mv;
            }
        }
    }
    return best;
}

export function pickGomokuAiMove(game, { color, level, timeMs } = {}) {
    const g = sanitizeGomokuGame(game);
    const my = color === GOMOKU_BLACK || color === GOMOKU_WHITE ? color : (g.turn || GOMOKU_WHITE);
    const lv = sanitizeGomokuAiLevel(level);
    if (lv === 'choin') {
        return pickChoinMove(g, my, timeMs);
    }
    return pickGosuMove(g, my);
}
