import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHESS_AI_LEVELS,
    chessAiLevelLabel,
    pickChessAiMove,
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
        assert.equal(CHESS_AI_LEVELS.choin.timeMs <= 3000, true);
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

    it('고수 한 수는 1초, 초인 한 수는 3초를 넘기지 않는다', () => {
        const g = emptyChessGame();
        const tGosu = Date.now();
        const gosu = pickChessAiMove(g, { color: CHESS_WHITE, level: 'gosu', timeMs: 900 });
        assert.ok(Date.now() - tGosu < 1000);
        assert.equal(typeof gosu.from, 'number');
        const tChoin = Date.now();
        const choin = pickChessAiMove(g, { color: CHESS_WHITE, level: 'choin', timeMs: 2600 });
        assert.ok(Date.now() - tChoin < 3000);
        assert.equal(typeof choin.from, 'number');
    });

    it('초기 배치 자체 대국에서 고수가 1수보다, 초인이 고수보다 높다', { timeout: 180000 }, () => {
        const gosuVsPly1 = runColorSwapSeries('gosu', 'ply1', {
            aTime: 70,
            bTime: 8,
            varieties: [0, 4],
            maxMoves: 64,
        });
        const choinVsGosu = runColorSwapSeries('choin', 'gosu', {
            aTime: 160,
            bTime: 55,
            varieties: [1, 5],
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
        // eslint-disable-next-line no-console
        console.log('초인 vs 고수', {
            games: choinVsGosu.games,
            choin: choinVsGosu.aScore,
            gosu: choinVsGosu.bScore,
            rows: choinVsGosu.rows.map((r) => ({
                w: r.whiteLevel,
                b: r.blackLevel,
                winner: r.winner || 'draw',
                end: r.endReason,
                moves: r.moveCount,
                eval: r.whiteEval,
            })),
        });
        assert.ok(gosuVsPly1.aScore > gosuVsPly1.bScore, `고수 ${gosuVsPly1.aScore}점 / 1수 ${gosuVsPly1.bScore}점`);
        assert.ok(choinVsGosu.aScore > choinVsGosu.bScore, `초인 ${choinVsGosu.aScore}점 / 고수 ${choinVsGosu.bScore}점`);
    });
});
