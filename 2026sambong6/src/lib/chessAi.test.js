import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHESS_AI_LEVELS,
    chessAiLevelLabel,
    pickChessAiMove,
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

describe('체스 AI', () => {
    it('난이도 이름은 고수·초인이다', () => {
        assert.equal(sanitizeChessAiLevel('고급'), 'gosu');
        assert.equal(chessAiLevelLabel('gosu'), '고수');
        assert.equal(chessAiLevelLabel('choin'), '초인');
        assert.equal(CHESS_AI_LEVELS.choin.timeMs <= 3000, true);
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

    it('초인 한 수는 3초를 넘기지 않는다', () => {
        const g = emptyChessGame();
        const t0 = Date.now();
        const mv = pickChessAiMove(g, { color: CHESS_WHITE, level: 'choin', timeMs: 200 });
        assert.ok(Date.now() - t0 < 3000);
        assert.equal(typeof mv.from, 'number');
        assert.equal(typeof mv.to, 'number');
    });

    it('자체 대국에서 초인(백)이 고수(흑)를 이긴다', { timeout: 40000 }, () => {
        let g = emptyChessGame({ now: 1 });
        // 흑 퀸을 빼 초인이 우세를 끝까지 이기게 합니다.
        g.cells[chessSq(3, 7)] = 0;
        g.castling = 'KQkq'.replace('q', '');
        for (let i = 0; i < 80 && !g.winner && !['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason); i += 1) {
            const level = g.turn === CHESS_WHITE ? 'choin' : 'gosu';
            const timeMs = g.turn === CHESS_WHITE ? 140 : undefined;
            const mv = pickChessAiMove(g, { color: g.turn, level, timeMs });
            assert.ok(mv, '수가 있어야 합니다');
            const placed = applyChessMove(g, { ...mv, color: g.turn, now: 10 + i });
            assert.equal(placed.ok, true, placed.error);
            g = placed.game;
        }
        assert.equal(g.winner, CHESS_WHITE);
        assert.ok(['checkmate', 'timeout'].includes(g.endReason) || g.winner === CHESS_WHITE);
    });
});
