import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFeedback, feedbackNewestFirst, FEEDBACK_KEEP, sanitizeFeedbackInbox } from './peerFeedback.js';
import { latestPraiseReason, planPeerPraise, praiseFailMessage } from './peerPraise.js';

describe('peerFeedback 사유함', () => {
    it('사유·실명을 저장하고 최신순으로 돌려준다', () => {
        let box = appendFeedback({}, { kind: 'dislike', fromId: '1', fromName: '김철수', reason: ' 떠들어서 ', date: '2026-11-02' });
        box = appendFeedback(box, { kind: 'praise', fromId: '2', fromName: '이영희', reason: '도와줘서', date: '2026-11-02' });
        const list = feedbackNewestFirst(box);
        assert.equal(list[0].fromName, '이영희');
        assert.equal(list[1].reason, '떠들어서');
        assert.equal(feedbackNewestFirst(box, 'dislike').length, 1);
    });
    it('형식이 틀린 기록은 버리고 최대 개수만 남긴다', () => {
        assert.equal(sanitizeFeedbackInbox({ items: [{ kind: 'x' }, null] }).items.length, 0);
        let box = {};
        for (let i = 0; i < FEEDBACK_KEEP + 5; i += 1) box = appendFeedback(box, { kind: 'praise', fromId: String(i), reason: 'r', date: '2026-11-02' });
        assert.equal(box.items.length, FEEDBACK_KEEP);
        assert.equal(box.items[0].fromId, '5');
        assert.equal(box.items[0].fromName, '5');
    });
});

describe('따봉(추천) 사유', () => {
    it('사유를 넘기면 필수이고 카드용 최근 사유가 남는다', () => {
        assert.equal(planPeerPraise({}, { fromId: '1', toId: '2', today: '2026-11-02', reason: ' ' }).reason, 'empty');
        assert.equal(planPeerPraise({}, { fromId: '1', toId: '2', today: '2026-11-02', reason: '가'.repeat(41) }).reason, 'long');
        const ok = planPeerPraise({}, { fromId: '1', toId: '2', today: '2026-11-02', reason: '청소를 도와줘서' });
        assert.equal(ok.ok, true);
        assert.equal(ok.reasonText, '청소를 도와줘서');
        assert.equal(latestPraiseReason(ok.board, '2'), '청소를 도와줘서');
        assert.match(praiseFailMessage('empty'), /사유/);
    });
    it('사유를 넘기지 않으면 예전처럼 동작한다', () => {
        assert.equal(planPeerPraise({}, { fromId: '1', toId: '2', today: '2026-11-02' }).ok, true);
    });
});
