import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    GOMOKU_AI_SCORE,
    gomokuPointAttackScore,
    listGomokuAiCandidates,
    pickGomokuAiMove,
} from './gomokuAi.js';
import {
    GOMOKU_BLACK,
    GOMOKU_SIZE,
    GOMOKU_WHITE,
    emptyGomokuGame,
} from './gomokuGame.js';

describe('오목 AI', () => {
    it('빈 판에서는 한가운데에 둔다', () => {
        const g = emptyGomokuGame();
        const mv = pickGomokuAiMove(g, { color: GOMOKU_BLACK });
        assert.equal(mv.x, Math.floor(GOMOKU_SIZE / 2));
        assert.equal(mv.y, Math.floor(GOMOKU_SIZE / 2));
    });

    it('다섯 목을 만들 수 있으면 그 자리에 둔다', () => {
        const g = emptyGomokuGame();
        g.turn = GOMOKU_WHITE;
        g.board[5][5] = GOMOKU_WHITE;
        g.board[5][6] = GOMOKU_WHITE;
        g.board[5][7] = GOMOKU_WHITE;
        g.board[5][8] = GOMOKU_WHITE;
        g.board[12][12] = GOMOKU_BLACK;
        const mv = pickGomokuAiMove(g, { color: GOMOKU_WHITE });
        assert.equal(mv.y, 5);
        assert.ok(mv.x === 4 || mv.x === 9);
        assert.ok(gomokuPointAttackScore(g.board, mv.x, mv.y, GOMOKU_WHITE) >= GOMOKU_AI_SCORE.five);
    });

    it('상대가 다음 수에 이기면 막는다', () => {
        const g = emptyGomokuGame();
        g.turn = GOMOKU_WHITE;
        g.board[8][2] = GOMOKU_BLACK;
        g.board[8][3] = GOMOKU_BLACK;
        g.board[8][4] = GOMOKU_BLACK;
        g.board[8][5] = GOMOKU_BLACK;
        g.board[1][1] = GOMOKU_WHITE;
        const mv = pickGomokuAiMove(g, { color: GOMOKU_WHITE });
        assert.equal(mv.y, 8);
        assert.ok(mv.x === 1 || mv.x === 6);
    });

    it('후보는 돌 근처만 고른다', () => {
        const g = emptyGomokuGame();
        g.board[10][10] = GOMOKU_BLACK;
        const cands = listGomokuAiCandidates(g.board, 2);
        assert.ok(cands.length > 0);
        assert.ok(cands.length < GOMOKU_SIZE * GOMOKU_SIZE);
        assert.ok(cands.every((c) => Math.abs(c.x - 10) <= 2 && Math.abs(c.y - 10) <= 2));
    });

    it('상대의 열린 4를 막는다', () => {
        const g = emptyGomokuGame();
        g.turn = GOMOKU_WHITE;
        g.board[6][6] = GOMOKU_BLACK;
        g.board[6][7] = GOMOKU_BLACK;
        g.board[6][8] = GOMOKU_BLACK;
        g.board[6][9] = GOMOKU_BLACK;
        g.board[2][2] = GOMOKU_WHITE;
        const mv = pickGomokuAiMove(g, { color: GOMOKU_WHITE });
        assert.equal(mv.y, 6);
        assert.ok(mv.x === 5 || mv.x === 10);
    });

    it('상대의 열린 3을 막는다', () => {
        const g = emptyGomokuGame();
        g.turn = GOMOKU_WHITE;
        g.board[10][8] = GOMOKU_BLACK;
        g.board[10][9] = GOMOKU_BLACK;
        g.board[10][10] = GOMOKU_BLACK;
        g.board[1][1] = GOMOKU_WHITE;
        const mv = pickGomokuAiMove(g, { color: GOMOKU_WHITE });
        assert.equal(mv.y, 10);
        assert.ok(mv.x === 7 || mv.x === 11);
    });

    it('한 수 계산이 1초를 넘기지 않는다', () => {
        const g = emptyGomokuGame();
        for (let i = 6; i < 14; i += 1) {
            g.board[10][i] = i % 2 ? GOMOKU_BLACK : GOMOKU_WHITE;
            g.board[i][10] = i % 2 ? GOMOKU_WHITE : GOMOKU_BLACK;
        }
        g.turn = GOMOKU_WHITE;
        const t0 = Date.now();
        const mv = pickGomokuAiMove(g, { color: GOMOKU_WHITE });
        assert.ok(Date.now() - t0 < 1000);
        assert.equal(typeof mv.x, 'number');
        assert.equal(typeof mv.y, 'number');
    });
});
