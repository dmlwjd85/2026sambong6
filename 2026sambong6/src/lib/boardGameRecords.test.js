import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyBoardGameRecord,
    boardGameRecordText,
    gomokuRecordResult,
    gomokuResultKey,
    sanitizeBoardGameRecords,
} from './boardGameRecords.js';
import { GOMOKU_BLACK, GOMOKU_WHITE, applyGomokuForfeit, emptyGomokuGame } from './gomokuGame.js';

describe('보드게임 승패 기록', () => {
    it('빈 기록은 0승 0패 0무다', () => {
        const rec = sanitizeBoardGameRecords(null);
        assert.equal(rec.gomoku.wins, 0);
        assert.equal(boardGameRecordText(rec), '0승 0패 0무');
    });

    it('같은 판은 두 번 세지 않는다', () => {
        let rec = applyBoardGameRecord(null, { result: 'win', key: 'g1' });
        rec = applyBoardGameRecord(rec, { result: 'win', key: 'g1' });
        rec = applyBoardGameRecord(rec, { result: 'loss', key: 'g2' });
        assert.equal(rec.gomoku.wins, 1);
        assert.equal(rec.gomoku.losses, 1);
        assert.equal(boardGameRecordText(rec), '1승 1패 0무');
    });

    it('오목 결과에서 내 색 기준으로 승패를 본다', () => {
        const g = emptyGomokuGame();
        g.winner = GOMOKU_WHITE;
        g.endReason = 'forfeit';
        assert.equal(gomokuRecordResult(g, GOMOKU_BLACK), 'loss');
        assert.equal(gomokuRecordResult(g, GOMOKU_WHITE), 'win');
        const draw = emptyGomokuGame();
        draw.endReason = 'draw';
        assert.equal(gomokuRecordResult(draw, GOMOKU_BLACK), 'draw');
        assert.match(gomokuResultKey({ id: 'r1', game: g }), /^r1:/);
    });
});

describe('오목 나가기 패배', () => {
    it('나가면 나간 색이 지고 상대가 이긴다', () => {
        const g = emptyGomokuGame({ now: 10 });
        const r = applyGomokuForfeit(g, { color: GOMOKU_BLACK, now: 20 });
        assert.equal(r.ok, true);
        assert.equal(r.game.endReason, 'forfeit');
        assert.equal(r.game.winner, GOMOKU_WHITE);
        const again = applyGomokuForfeit(r.game, { color: GOMOKU_WHITE, now: 30 });
        assert.equal(again.ok, false);
    });
});
