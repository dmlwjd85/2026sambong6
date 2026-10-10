import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    planPeerPraise,
    praiseCountForToday,
    rollPraiseDay,
    PRAISE_FANFARE_BONG,
    PRAISE_FANFARE_XP,
} from './peerPraise.js';

describe('동료 따봉', () => {
    it('하루에 한 번이고 서로 주기는 막으며 10개째에 빵빠레를 준다', () => {
        let board = {};
        const first = planPeerPraise(board, { fromId: '1', toId: '2', today: '2026-10-10' });
        assert.equal(first.ok, true);
        assert.equal(first.fanfare, false);
        assert.equal(first.giver.xp, 10);
        assert.equal(first.board.countDate, '2026-10-10');
        board = first.board;
        assert.equal(planPeerPraise(board, { fromId: '1', toId: '3', today: '2026-10-10' }).reason, 'once');
        assert.equal(planPeerPraise(board, { fromId: '2', toId: '1', today: '2026-10-11' }).reason, 'mutual');
        assert.equal(planPeerPraise(board, { fromId: '2', toId: '2', today: '2026-10-11' }).reason, 'self');
        for (let n = 2; n <= 9; n += 1) {
            const step = planPeerPraise(board, { fromId: `s${n}`, toId: '2', today: '2026-10-10' });
            assert.equal(step.ok, true);
            assert.equal(step.fanfare, false);
            board = step.board;
        }
        const tenth = planPeerPraise(board, { fromId: 's10', toId: '2', today: '2026-10-10' });
        assert.equal(tenth.ok, true);
        assert.equal(tenth.fanfare, true);
        assert.equal(tenth.received, 10);
        assert.equal(tenth.receiver.xp, 10 + PRAISE_FANFARE_XP);
        assert.equal(tenth.receiver.bong, 1 + PRAISE_FANFARE_BONG);
        const again = planPeerPraise(tenth.board, { fromId: 's11', toId: '2', today: '2026-10-10' });
        assert.equal(again.fanfare, false);
        assert.equal(again.receiver.xp, 10);
    });

    it('자정이 지나면 받은 수와 빵빠레만 지우고 서로 준 기록은 남긴다', () => {
        let board = { countDate: '2026-10-10', lastGiven: {}, pairs: {}, received: {}, fanfare: {} };
        for (let n = 1; n <= 10; n += 1) {
            const step = planPeerPraise(board, { fromId: `s${n}`, toId: '2', today: '2026-10-10' });
            assert.equal(step.ok, true);
            board = step.board;
        }
        assert.equal(board.fanfare['2'], true);
        const rolled = rollPraiseDay(board, '2026-10-11');
        assert.equal(rolled.reset, true);
        assert.deepEqual(rolled.board.received, {});
        assert.deepEqual(rolled.board.fanfare, {});
        assert.equal(rolled.board.pairs['s1>2'], '2026-10-10');
        assert.equal(rolled.board.countDate, '2026-10-11');
        assert.equal(praiseCountForToday(board, '2', '2026-10-11'), 0);
        assert.equal(praiseCountForToday(board, '2', '2026-10-10'), 10);
        const nextDay = planPeerPraise(board, { fromId: 's12', toId: '2', today: '2026-10-11' });
        assert.equal(nextDay.ok, true);
        assert.equal(nextDay.received, 1);
        assert.equal(nextDay.fanfare, false);
        assert.equal(planPeerPraise(board, { fromId: '2', toId: 's1', today: '2026-10-11' }).reason, 'mutual');
    });

    it('다음 날 다시 10개를 모으면 빵빠레를 한 번 더 준다', () => {
        let board = {};
        for (let n = 1; n <= 10; n += 1) {
            board = planPeerPraise(board, { fromId: `a${n}`, toId: '9', today: '2026-10-10' }).board;
        }
        board = rollPraiseDay(board, '2026-10-11').board;
        for (let n = 1; n <= 9; n += 1) {
            const step = planPeerPraise(board, { fromId: `b${n}`, toId: '9', today: '2026-10-11' });
            assert.equal(step.fanfare, false);
            board = step.board;
        }
        const tenth = planPeerPraise(board, { fromId: 'b10', toId: '9', today: '2026-10-11' });
        assert.equal(tenth.fanfare, true);
        assert.equal(tenth.received, 10);
    });

    it('날짜 도장이 없어도 오늘 기록은 남기고 어제 기록은 지운다', () => {
        const today = rollPraiseDay({
            lastGiven: { '1': '2026-10-10' },
            pairs: { '1>2': '2026-10-10' },
            received: { '2': 3 },
            fanfare: {},
        }, '2026-10-10');
        assert.equal(today.reset, false);
        assert.equal(today.changed, true);
        assert.equal(today.board.received['2'], 3);
        assert.equal(today.board.countDate, '2026-10-10');

        const yesterday = rollPraiseDay({
            lastGiven: { '1': '2026-10-09' },
            pairs: { '1>2': '2026-10-09' },
            received: { '2': 3 },
            fanfare: { '2': true },
        }, '2026-10-10');
        assert.equal(yesterday.reset, true);
        assert.equal(yesterday.board.received['2'], undefined);
        assert.equal(yesterday.board.fanfare['2'], undefined);
        assert.equal(yesterday.board.pairs['1>2'], '2026-10-09');

        const undated = rollPraiseDay({ received: { '2': 5 }, fanfare: { '2': true } }, '2026-10-10');
        assert.equal(undated.reset, false);
        assert.equal(undated.board.received['2'], 5);
        assert.equal(undated.board.fanfare['2'], true);
        assert.equal(undated.board.countDate, '2026-10-10');

        const same = rollPraiseDay(today.board, '2026-10-10');
        assert.equal(same.changed, false);
        assert.equal(same.reset, false);

        const future = rollPraiseDay({
            countDate: '2026-10-12',
            received: { '2': 4 },
            fanfare: { '2': true },
        }, '2026-10-10');
        assert.equal(future.changed, false);
        assert.equal(future.reset, false);
        assert.equal(future.board.received['2'], 4);
        assert.equal(future.board.countDate, '2026-10-12');

        const bad = rollPraiseDay({ countDate: '2026-10-09', received: { '2': 5 } }, '');
        assert.equal(bad.changed, false);
        assert.equal(bad.board.received['2'], 5);
    });
});
