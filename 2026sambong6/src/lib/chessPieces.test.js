import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chessMakePiece } from './chessGame.js';
import { chessPieceHtml, chessPieceSvg } from './chessPieces.js';

describe('체스 기물 SVG', () => {
    it('백·흑 기물이 이모지가 아닌 SVG다', () => {
        const wq = chessPieceSvg(chessMakePiece('w', 'q'), { uid: '1' });
        const bk = chessPieceSvg(chessMakePiece('b', 'k'), { uid: '2' });
        assert.match(wq, /<svg/);
        assert.match(wq, /linearGradient/);
        assert.match(wq, /상아 퀸/);
        assert.match(bk, /흑철 킹/);
        assert.equal(wq.includes('♛') || wq.includes('♕'), false);
        assert.match(chessPieceHtml(chessMakePiece('w', 'p'), 12), /chess-piece-p/);
        assert.equal(chessPieceHtml(0), '');
    });
});
