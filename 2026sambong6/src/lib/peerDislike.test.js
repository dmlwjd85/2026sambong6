import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DISLIKE_XP_COST,
    dislikeCountForToday,
    latestDislikeReason,
    planPeerDislike,
    rollDislikeDay,
} from './peerDislike.js';

describe('광장 비추천', () => {
    it('사유가 있어야 하고 누른 사람만 경험치 10을 잃는다', () => {
        const missing = planPeerDislike({}, { fromId: '1', toId: '2', today: '2026-10-21', reason: '   ' });
        assert.equal(missing.ok, false);
        assert.equal(missing.reason, 'empty');
        const long = planPeerDislike({}, {
            fromId: '1',
            toId: '2',
            today: '2026-10-21',
            reason: '가'.repeat(41),
        });
        assert.equal(long.reason, 'long');
        const ok = planPeerDislike({}, { fromId: '1', toId: '2', today: '2026-10-21', reason: ' 떠들어서 ' });
        assert.equal(ok.ok, true);
        assert.equal(ok.reasonText, '떠들어서');
        assert.equal(ok.xpCost, DISLIKE_XP_COST);
        assert.equal(ok.xpCost, 10);
        assert.equal(ok.received, 1);
        assert.equal(ok.board.latestReason['2'], '떠들어서');
        assert.equal(ok.board.log[0].from, '1');
        assert.equal(ok.board.once['1>2'], '2026-10-21');
        assert.equal(planPeerDislike(ok.board, { fromId: '1', toId: '2', today: '2026-10-21', reason: '또' }).reason, 'once');
        assert.equal(planPeerDislike(ok.board, { fromId: '1', toId: '1', today: '2026-10-21', reason: '나' }).reason, 'self');
    });

    it('자정이 지나면 받은 수만 지우고 사유는 카드에 남긴다', () => {
        const made = planPeerDislike({}, { fromId: '3', toId: '4', today: '2026-10-20', reason: '떠듦' });
        const rolled = rollDislikeDay(made.board, '2026-10-21');
        assert.equal(rolled.reset, true);
        assert.equal(dislikeCountForToday(made.board, '4', '2026-10-21'), 0);
        assert.equal(latestDislikeReason(rolled.board, '4'), '떠듦');
        const again = planPeerDislike(made.board, { fromId: '3', toId: '4', today: '2026-10-21', reason: '또 떠듦' });
        assert.equal(again.ok, true);
        assert.equal(again.received, 1);
        assert.equal(again.board.latestReason['4'], '또 떠듦');
    });
});
