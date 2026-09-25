import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTrustedChessMove, emptyChessGame, listLegalChessMovesTrusted } from './chessGame.js';
import { chessOpeningFamilies, listChessBookMoves, pickChessBookMove } from './chessOpenings.js';

describe('체스 오프닝북', () => {
    it('백·흑 각각 5가지 이상 계열이 있다', () => {
        const fam = chessOpeningFamilies();
        assert.ok(fam.white.length >= 5, String(fam.white));
        assert.ok(fam.black.length >= 5, String(fam.black));
    });

    it('시작 위치와 1.e4 다음에 책이 있다', () => {
        const start = emptyChessGame();
        const first = listChessBookMoves(start);
        assert.ok(first.length >= 2);
        const e4 = listLegalChessMovesTrusted(start).find((m) => m.from === 12 && m.to === 28);
        const after = applyTrustedChessMove(start, e4, 1);
        const replies = listChessBookMoves(after);
        assert.ok(replies.length >= 3);
        const picked = pickChessBookMove(after, () => 0);
        assert.equal(typeof picked.from, 'number');
    });
});
