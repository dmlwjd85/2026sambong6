import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planPeerPraise, PRAISE_FANFARE_BONG, PRAISE_FANFARE_XP } from './peerPraise.js';

describe('동료 따봉', () => {
    it('하루에 한 번이고 서로 주기는 막으며 10개째에 빵빠레를 준다', () => {
        let board = {};
        const first = planPeerPraise(board, { fromId: '1', toId: '2', today: '2026-10-10' });
        assert.equal(first.ok, true);
        assert.equal(first.fanfare, false);
        assert.equal(first.giver.xp, 10);
        board = first.board;
        assert.equal(planPeerPraise(board, { fromId: '1', toId: '3', today: '2026-10-10' }).reason, 'once');
        assert.equal(planPeerPraise(board, { fromId: '2', toId: '1', today: '2026-10-11' }).reason, 'mutual');
        assert.equal(planPeerPraise(board, { fromId: '2', toId: '2', today: '2026-10-11' }).reason, 'self');
        for (let n = 2; n <= 9; n += 1) {
            const step = planPeerPraise(board, { fromId: `s${n}`, toId: '2', today: `2026-10-${String(n).padStart(2, '0')}` });
            assert.equal(step.ok, true);
            assert.equal(step.fanfare, false);
            board = step.board;
        }
        const tenth = planPeerPraise(board, { fromId: 's10', toId: '2', today: '2026-10-20' });
        assert.equal(tenth.ok, true);
        assert.equal(tenth.fanfare, true);
        assert.equal(tenth.received, 10);
        assert.equal(tenth.receiver.xp, 10 + PRAISE_FANFARE_XP);
        assert.equal(tenth.receiver.bong, 1 + PRAISE_FANFARE_BONG);
        const again = planPeerPraise(tenth.board, { fromId: 's11', toId: '2', today: '2026-10-21' });
        assert.equal(again.fanfare, false);
        assert.equal(again.receiver.xp, 10);
    });
});
