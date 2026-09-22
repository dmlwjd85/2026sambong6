/**
 * 오목 강한 클라이언트 AI (학급용).
 * Firestore 방 없이 혼자 두기에서 씁니다. 턴당 대략 1초 안에 끝나게, 후보만 보고
 * 열린 4·3 차단과 한 수 앞(2-ply)을 봅니다.
 */

import {
    GOMOKU_BLACK,
    GOMOKU_EMPTY,
    GOMOKU_SIZE,
    GOMOKU_WHITE,
    inGomokuBoard,
    sanitizeGomokuGame,
} from './gomokuGame.js';

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

/**
 * 강한 한 단계. 즉시 승리·상대 5 차단을 최우선하고, 나머지는 상위 후보에 한 수 앞을 봅니다.
 */
export function pickGomokuAiMove(game, { color } = {}) {
    const g = sanitizeGomokuGame(game);
    const my = color === GOMOKU_BLACK || color === GOMOKU_WHITE ? color : (g.turn || GOMOKU_WHITE);
    const board = g.board;
    const cands = listGomokuAiCandidates(board, 2);
    if (!cands.length) {
        const c = Math.floor((g.size || GOMOKU_SIZE) / 2);
        return { x: c, y: c, score: 0 };
    }

    const ranked = cands.map((c) => ({
        x: c.x,
        y: c.y,
        score: gomokuPointScore(board, c.x, c.y, my),
    })).sort((a, b) => b.score - a.score || (a.x - b.x) || (a.y - b.y));

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
        const replyCands = listGomokuAiCandidates(nextBoard, 2);
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
