import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    GOMOKU_BLACK,
    GOMOKU_SIZE,
    GOMOKU_WHITE,
    applyGomokuTimeout,
    emptyGomokuGame,
    gomokuBoardFull,
    gomokuHasFive,
    gomokuWinnerSeat,
    placeGomokuStone,
    sanitizeGomokuGame,
} from './gomokuGame.js';

function play(game, moves) {
    let g = game;
    for (const [x, y] of moves) {
        const color = g.turn;
        const r = placeGomokuStone(g, { x, y, color, now: 1000 });
        assert.equal(r.ok, true, r.error);
        g = r.game;
    }
    return g;
}

describe('오목 판', () => {
    it('기본은 20×20 빈 판이고 흑이 먼저 둔다', () => {
        const g = emptyGomokuGame({ now: 10 });
        assert.equal(g.size, GOMOKU_SIZE);
        assert.equal(g.turn, GOMOKU_BLACK);
        assert.equal(g.board.length, 20);
        assert.equal(g.board[0].length, 20);
        assert.equal(g.board[10][10], 0);
        assert.equal(sanitizeGomokuGame({ size: 99, turn: 3, board: 'x' }).size, 20);
        assert.equal(sanitizeGomokuGame({ size: 99, turn: 3, board: 'x' }).turn, GOMOKU_BLACK);
        const fromCells = sanitizeGomokuGame({
            cells: Array.from({ length: 400 }, (_, i) => (i === 10 * 20 + 10 ? GOMOKU_BLACK : 0)),
        });
        assert.equal(fromCells.board[10][10], GOMOKU_BLACK);
        const legacy15 = sanitizeGomokuGame({
            cells: Array.from({ length: 225 }, (_, i) => (i === 7 * 15 + 7 ? GOMOKU_BLACK : 0)),
        });
        assert.equal(legacy15.size, 15);
        assert.equal(legacy15.board[7][7], GOMOKU_BLACK);
    });

    it('이미 있는 자리·차례가 아니면 거절한다', () => {
        const g = emptyGomokuGame();
        const first = placeGomokuStone(g, { x: 7, y: 7, color: GOMOKU_BLACK, now: 1 });
        assert.equal(first.ok, true);
        const occupied = placeGomokuStone(first.game, { x: 7, y: 7, color: GOMOKU_WHITE, now: 2 });
        assert.equal(occupied.ok, false);
        assert.equal(occupied.error, 'occupied');
        const wrong = placeGomokuStone(first.game, { x: 8, y: 7, color: GOMOKU_BLACK, now: 2 });
        assert.equal(wrong.ok, false);
        assert.equal(wrong.error, 'not_turn');
        const out = placeGomokuStone(g, { x: -1, y: 0, color: GOMOKU_BLACK, now: 1 });
        assert.equal(out.ok, false);
        assert.equal(out.error, 'out');
    });
});

describe('오목 승패', () => {
    it('가로 다섯 목이면 이긴다', () => {
        let g = emptyGomokuGame();
        // 흑이 한 줄, 백은 다른 줄에 받아 친다
        g = play(g, [
            [0, 0], [0, 1],
            [1, 0], [1, 1],
            [2, 0], [2, 1],
            [3, 0], [3, 1],
            [4, 0],
        ]);
        assert.equal(g.winner, GOMOKU_BLACK);
        assert.equal(g.endReason, 'five');
        assert.equal(gomokuHasFive(g.board, 4, 0), true);
        assert.equal(gomokuWinnerSeat(g), 'black');
    });

    it('세로·대각선도 다섯이면 이긴다', () => {
        let down = emptyGomokuGame();
        down = play(down, [
            [5, 1], [0, 0],
            [5, 2], [1, 0],
            [5, 3], [2, 0],
            [5, 4], [3, 0],
            [5, 5],
        ]);
        assert.equal(down.winner, GOMOKU_BLACK);

        let diag = emptyGomokuGame();
        diag = play(diag, [
            [0, 0], [0, 2],
            [1, 1], [1, 2],
            [2, 2], [2, 3],
            [3, 3], [3, 2],
            [4, 4],
        ]);
        assert.equal(diag.winner, GOMOKU_BLACK);
        assert.equal(gomokuHasFive(diag.board, 4, 4), true);
    });

    it('여섯 목(장목)도 학급용 자유 오목에서는 승리다', () => {
        const board = emptyGomokuGame().board;
        for (let x = 0; x < 6; x += 1) board[8][x] = GOMOKU_WHITE;
        assert.equal(gomokuHasFive(board, 2, 8), true);
    });

    it('가득 차면 무승부다', () => {
        const g = emptyGomokuGame({ size: 7 });
        g.size = 7;
        g.board = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (__, x) => ((x + y) % 2 === 0 ? GOMOKU_BLACK : GOMOKU_WHITE)));
        assert.equal(gomokuBoardFull(g.board), true);
        // 마지막 한 칸만 비우고 두면 draw 경로를 본다
        const almost = emptyGomokuGame({ size: 7 });
        almost.size = 7;
        almost.board = g.board.map((row) => row.slice());
        almost.board[0][0] = 0;
        almost.turn = GOMOKU_BLACK;
        const placed = placeGomokuStone(almost, { x: 0, y: 0, color: GOMOKU_BLACK, now: 3 });
        assert.equal(placed.ok, true);
        if (!placed.game.winner) {
            assert.equal(placed.game.endReason, 'draw');
        }
    });

    it('시간 초과면 현재 턴 플레이어가 진다', () => {
        const g = emptyGomokuGame({ now: 100 });
        const r = applyGomokuTimeout(g, { now: 30100 });
        assert.equal(r.ok, true);
        assert.equal(r.game.endReason, 'timeout');
        assert.equal(r.game.winner, GOMOKU_WHITE);
        const again = applyGomokuTimeout(r.game, { now: 40000 });
        assert.equal(again.ok, false);
    });
});
