import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHESS_BLACK,
    CHESS_WHITE,
    applyChessForfeit,
    applyChessMove,
    applyChessTimeout,
    chessIsInCheck,
    chessIsOver,
    chessMakePiece,
    chessSq,
    emptyChessGame,
    listLegalChessMoves,
} from './chessGame.js';

function play(game, moves) {
    let g = game;
    for (const [from, to, promo] of moves) {
        const r = applyChessMove(g, { from, to, promo, color: g.turn, now: 1000 });
        assert.equal(r.ok, true, r.error);
        g = r.game;
    }
    return g;
}

describe('체스 기본', () => {
    it('시작 위치는 백 차례이고 합법 수가 20이다', () => {
        const g = emptyChessGame();
        assert.equal(g.turn, CHESS_WHITE);
        assert.equal(listLegalChessMoves(g).length, 20);
        assert.equal(g.inCheck, false);
    });

    it('자기 킹을 체크에 두는 수는 거절한다', () => {
        const g = emptyChessGame();
        for (let i = 0; i < 64; i += 1) g.cells[i] = 0;
        g.cells[chessSq(4, 0)] = chessMakePiece(CHESS_WHITE, 'k');
        g.cells[chessSq(0, 7)] = chessMakePiece(CHESS_BLACK, 'k');
        g.cells[chessSq(4, 4)] = chessMakePiece(CHESS_BLACK, 'r');
        g.castling = '';
        const bad = applyChessMove(g, { from: chessSq(4, 0), to: chessSq(4, 1), color: CHESS_WHITE, now: 1 });
        assert.equal(bad.ok, false);
        assert.equal(bad.error, 'illegal');
    });

    it('캐슬링(킹사이드)이 된다', () => {
        let g = emptyChessGame();
        g.cells[chessSq(5, 0)] = 0;
        g.cells[chessSq(6, 0)] = 0;
        const r = applyChessMove(g, { from: chessSq(4, 0), to: chessSq(6, 0), color: CHESS_WHITE, now: 1 });
        assert.equal(r.ok, true, r.error);
        assert.equal(r.game.cells[chessSq(6, 0)], chessMakePiece(CHESS_WHITE, 'k'));
        assert.equal(r.game.cells[chessSq(5, 0)], chessMakePiece(CHESS_WHITE, 'r'));
        assert.equal(r.game.cells[chessSq(7, 0)], 0);
    });

    it('앙파상이 된다', () => {
        let g = emptyChessGame();
        g = play(g, [
            [chessSq(4, 1), chessSq(4, 3)],
            [chessSq(0, 6), chessSq(0, 5)],
            [chessSq(4, 3), chessSq(4, 4)],
            [chessSq(3, 6), chessSq(3, 4)],
        ]);
        const ep = applyChessMove(g, { from: chessSq(4, 4), to: chessSq(3, 5), color: CHESS_WHITE, now: 2 });
        assert.equal(ep.ok, true, ep.error);
        assert.equal(ep.game.cells[chessSq(3, 4)], 0);
        assert.equal(ep.game.cells[chessSq(3, 5)], chessMakePiece(CHESS_WHITE, 'p'));
    });

    it('프로모션은 선택해야 하고 퀸으로 바꿀 수 있다', () => {
        const g = emptyChessGame();
        for (let i = 0; i < 64; i += 1) g.cells[i] = 0;
        g.cells[chessSq(0, 6)] = chessMakePiece(CHESS_WHITE, 'p');
        g.cells[chessSq(4, 0)] = chessMakePiece(CHESS_WHITE, 'k');
        g.cells[chessSq(4, 7)] = chessMakePiece(CHESS_BLACK, 'k');
        g.castling = '';
        const need = applyChessMove(g, { from: chessSq(0, 6), to: chessSq(0, 7), color: CHESS_WHITE, now: 1 });
        assert.equal(need.ok, false);
        assert.equal(need.error, 'need_promo');
        const ok = applyChessMove(g, { from: chessSq(0, 6), to: chessSq(0, 7), promo: 'q', color: CHESS_WHITE, now: 1 });
        assert.equal(ok.ok, true, ok.error);
        assert.equal(ok.game.cells[chessSq(0, 7)], chessMakePiece(CHESS_WHITE, 'q'));
    });
});

describe('체스 승패', () => {
    it('바보메이트는 흑 체크메이트다', () => {
        let g = emptyChessGame();
        g = play(g, [
            [chessSq(5, 1), chessSq(5, 2)],
            [chessSq(4, 6), chessSq(4, 4)],
            [chessSq(6, 1), chessSq(6, 3)],
            [chessSq(3, 7), chessSq(7, 3)],
        ]);
        assert.equal(g.endReason, 'checkmate');
        assert.equal(g.winner, CHESS_BLACK);
        assert.equal(chessIsInCheck(g, CHESS_WHITE), true);
        assert.equal(chessIsOver(g), true);
    });

    it('대국 중 나가면 나간 쪽이 진다', () => {
        const g = emptyChessGame({ now: 10 });
        const r = applyChessForfeit(g, { color: CHESS_WHITE, now: 20 });
        assert.equal(r.ok, true);
        assert.equal(r.game.endReason, 'forfeit');
        assert.equal(r.game.winner, CHESS_BLACK);
    });

    it('시간 초과면 현재 턴이 진다', () => {
        const g = emptyChessGame({ now: 10 });
        const r = applyChessTimeout(g, { now: 40 });
        assert.equal(r.ok, true);
        assert.equal(r.game.endReason, 'timeout');
        assert.equal(r.game.winner, CHESS_BLACK);
    });
});
