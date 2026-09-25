import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHESS_AI_LEVELS,
    chessAiLevelLabel,
    chessGameFromUci,
    choinSearchStats,
    pickChessAiMove,
    pickSoftChessMove,
    playChessAiMatch,
    sanitizeChessAiLevel,
} from './chessAi.js';
import {
    CHESS_BLACK,
    CHESS_WHITE,
    applyChessMove,
    chessMakePiece,
    chessSq,
    emptyChessGame,
} from './chessGame.js';

function scoreFor(level, match, whiteLevel, blackLevel) {
    if (match.winner === CHESS_WHITE) return whiteLevel === level ? 1 : 0;
    if (match.winner === CHESS_BLACK) return blackLevel === level ? 1 : 0;
    // 제한 수 안에 안 끝나면 백 평가로 판정합니다. 작은 차이는 무로 둡니다.
    if (match.whiteEval >= 180) return whiteLevel === level ? 1 : 0;
    if (match.whiteEval <= -180) return blackLevel === level ? 1 : 0;
    return 0.5;
}

function runColorSwapSeries(a, b, { aTime, bTime, varieties = [0, 3], maxMoves = 72 } = {}) {
    const rows = [];
    for (const variety of varieties) {
        rows.push({
            whiteLevel: a,
            blackLevel: b,
            ...playChessAiMatch({
                whiteLevel: a,
                blackLevel: b,
                whiteTime: aTime,
                blackTime: bTime,
                maxMoves,
                variety,
                now: 1 + variety,
            }),
        });
        rows.push({
            whiteLevel: b,
            blackLevel: a,
            ...playChessAiMatch({
                whiteLevel: b,
                blackLevel: a,
                whiteTime: bTime,
                blackTime: aTime,
                maxMoves,
                variety,
                now: 11 + variety,
            }),
        });
    }
    const aScore = rows.reduce((sum, row) => sum + scoreFor(a, row, row.whiteLevel, row.blackLevel), 0);
    return { rows, aScore, bScore: rows.length - aScore, games: rows.length };
}

describe('체스 AI', () => {
    it('난이도 이름은 고수·초인이다', () => {
        assert.equal(sanitizeChessAiLevel('고급'), 'gosu');
        assert.equal(sanitizeChessAiLevel('ply1'), 'ply1');
        assert.equal(chessAiLevelLabel('gosu'), '고수');
        assert.equal(chessAiLevelLabel('choin'), '초인');
        assert.equal(CHESS_AI_LEVELS.gosu.timeMs <= 1000, true);
        assert.equal(CHESS_AI_LEVELS.choin.timeMs <= 4000, true);
        assert.equal(CHESS_AI_LEVELS.gosu.depth, 3);
    });

    it('한 수로 체크메이트면 그 수를 둔다', () => {
        const g = emptyChessGame();
        for (let i = 0; i < 64; i += 1) g.cells[i] = 0;
        g.cells[chessSq(0, 0)] = chessMakePiece(CHESS_BLACK, 'k');
        g.cells[chessSq(2, 1)] = chessMakePiece(CHESS_WHITE, 'q');
        g.cells[chessSq(2, 2)] = chessMakePiece(CHESS_WHITE, 'k');
        g.turn = CHESS_WHITE;
        g.castling = '';
        g.hist = [];
        const mv = pickChessAiMove(g, { color: CHESS_WHITE, level: 'gosu' });
        const placed = applyChessMove(g, { ...mv, color: CHESS_WHITE, now: 1 });
        assert.equal(placed.ok, true, placed.error);
        assert.equal(placed.game.endReason, 'checkmate');
        assert.equal(placed.game.winner, CHESS_WHITE);
    });

    it('고수는 1수 탐욕으로 퀸을 내주지 않는다', () => {
        const g = emptyChessGame();
        for (let i = 0; i < 64; i += 1) g.cells[i] = 0;
        g.cells[chessSq(0, 0)] = chessMakePiece(CHESS_WHITE, 'k');
        g.cells[chessSq(7, 4)] = chessMakePiece(CHESS_WHITE, 'q');
        g.cells[chessSq(7, 7)] = chessMakePiece(CHESS_BLACK, 'k');
        g.cells[chessSq(5, 5)] = chessMakePiece(CHESS_BLACK, 'n');
        g.cells[chessSq(7, 6)] = chessMakePiece(CHESS_BLACK, 'p');
        g.turn = CHESS_WHITE;
        g.castling = '';
        g.hist = [];
        const greedy = pickChessAiMove(g, { color: CHESS_WHITE, level: 'ply1' });
        const gosu = pickChessAiMove(g, { color: CHESS_WHITE, level: 'gosu', timeMs: 200 });
        assert.equal(greedy.from, chessSq(7, 4));
        assert.equal(greedy.to, chessSq(7, 6));
        assert.ok(!(gosu.from === chessSq(7, 4) && gosu.to === chessSq(7, 6)), '고수는 보호된 폰을 퀸으로 잡지 않습니다');
    });

    it('고수 한 수는 1초, 초인 한 수는 4초를 넘기지 않는다', () => {
        const g = emptyChessGame();
        const tGosu = Date.now();
        const gosu = pickChessAiMove(g, { color: CHESS_WHITE, level: 'gosu', timeMs: 900 });
        assert.ok(Date.now() - tGosu < 1000);
        assert.equal(typeof gosu.from, 'number');
        const tChoin = Date.now();
        const choin = pickChessAiMove(g, { color: CHESS_WHITE, level: 'choin', timeMs: 3500 });
        assert.ok(Date.now() - tChoin < 4000);
        assert.equal(typeof choin.from, 'number');
    });

    it('압도적 수는 항상 두고, 가까운 수는 나눠 고른다', () => {
        const mate = pickSoftChessMove([
            { mv: { from: 1, to: 2 }, val: 120000 },
            { mv: { from: 3, to: 4 }, val: 10 },
        ], { rng: () => 0.99 });
        assert.equal(mate.from, 1);
        const forced = pickSoftChessMove([
            { mv: { from: 1, to: 2 }, val: 80 },
            { mv: { from: 3, to: 4 }, val: 30 },
        ], { rng: () => 0.99 });
        assert.equal(forced.from, 1);
        const near = pickSoftChessMove([
            { mv: { from: 1, to: 2 }, val: 40 },
            { mv: { from: 3, to: 4 }, val: 29 },
        ], { rng: () => 0.99 });
        assert.equal(near.from, 1);
        const picks = new Set();
        for (let i = 0; i < 20; i += 1) {
            const mv = pickSoftChessMove([
                { mv: { from: 10, to: 20 }, val: 40 },
                { mv: { from: 11, to: 21 }, val: 38 },
                { mv: { from: 12, to: 22 }, val: 37 },
            ], { rng: () => (i + 0.3) / 20 });
            picks.add(`${mv.from}-${mv.to}`);
        }
        assert.ok(picks.size >= 2);
    });

    it('초인 엔진은 합법 수를 두고 한 수 메이트를 고른다', () => {
        const mid = chessGameFromUci(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'd7d6']);
        const mv = pickChessAiMove(mid, { color: CHESS_WHITE, level: 'choin', timeMs: 220 });
        const placed = applyChessMove(mid, { ...mv, color: CHESS_WHITE, now: 1 });
        assert.equal(placed.ok, true, placed.error);
        assert.ok(choinSearchStats.depth >= 3, `깊이 ${choinSearchStats.depth}`);
        const g = chessGameFromUci([]);
        for (let i = 0; i < 64; i += 1) g.cells[i] = 0;
        g.cells[chessSq(0, 0)] = chessMakePiece(CHESS_BLACK, 'k');
        g.cells[chessSq(2, 1)] = chessMakePiece(CHESS_WHITE, 'q');
        g.cells[chessSq(2, 2)] = chessMakePiece(CHESS_WHITE, 'k');
        g.turn = CHESS_WHITE;
        g.castling = '';
        g.hist = [];
        const mate = pickChessAiMove(g, { color: CHESS_WHITE, level: 'choin', timeMs: 80 });
        const done = applyChessMove(g, { ...mate, color: CHESS_WHITE, now: 1 });
        assert.equal(done.ok, true, done.error);
        assert.equal(done.game.endReason, 'checkmate');
        let g2 = emptyChessGame({ now: 1 });
        for (let i = 0; i < 12; i += 1) {
            const ply = pickChessAiMove(g2, { color: g2.turn, level: 'choin', timeMs: 90, variety: i });
            const next = applyChessMove(g2, { ...ply, color: g2.turn, now: 1 + i });
            assert.equal(next.ok, true, `수 ${i} ${JSON.stringify(ply)} ${next.error}`);
            g2 = next.game;
            if (g2.winner || g2.endReason) break;
        }
    });

    it('같은 상대 수열에 초인 응수가 여러 가지다', () => {
        const start = emptyChessGame();
        const first = new Set();
        for (let i = 0; i < 14; i += 1) {
            const mv = pickChessAiMove(start, { color: CHESS_WHITE, level: 'choin', timeMs: 40, rng: () => (i * 0.07) % 1 });
            first.add(`${mv.from}-${mv.to}`);
        }
        assert.ok(first.size >= 2, String([...first]));
        const e4 = applyChessMove(start, { from: chessSq(4, 1), to: chessSq(4, 3), color: CHESS_WHITE, now: 1 });
        assert.equal(e4.ok, true);
        const replies = new Set();
        for (let i = 0; i < 14; i += 1) {
            const mv = pickChessAiMove(e4.game, { color: CHESS_BLACK, level: 'choin', timeMs: 40, rng: () => (i * 0.11) % 1 });
            replies.add(`${mv.from}-${mv.to}`);
        }
        assert.ok(replies.size >= 2, String([...replies]));
    });

    it('초기 배치 자체 대국에서 고수가 1수보다 높다', { timeout: 120000 }, () => {
        const gosuVsPly1 = runColorSwapSeries('gosu', 'ply1', {
            aTime: 70,
            bTime: 8,
            varieties: [0, 4],
            maxMoves: 64,
        });
        // eslint-disable-next-line no-console
        console.log('고수 vs 1수', {
            games: gosuVsPly1.games,
            gosu: gosuVsPly1.aScore,
            ply1: gosuVsPly1.bScore,
            rows: gosuVsPly1.rows.map((r) => ({
                w: r.whiteLevel,
                b: r.blackLevel,
                winner: r.winner || 'draw',
                end: r.endReason,
                moves: r.moveCount,
                eval: r.whiteEval,
            })),
        });
        assert.ok(gosuVsPly1.aScore > gosuVsPly1.bScore, `고수 ${gosuVsPly1.aScore}점 / 1수 ${gosuVsPly1.bScore}점`);
    });
});
