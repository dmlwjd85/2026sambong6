import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getKstDateStr } from './kstDate.js';
import { planPeerPraise, praiseCountForToday, rollPraiseDay } from './peerPraise.js';
import { planPeerDislike } from './peerDislike.js';

describe('KST 날짜(따봉·비추천 하루 1회)', () => {
    it('기기 시간대와 상관없이 UTC+9 날짜를 준다(자정 경계 포함)', () => {
        assert.equal(getKstDateStr(new Date('2026-11-01T14:59:59Z')), '2026-11-01');
        assert.equal(getKstDateStr(new Date('2026-11-01T15:00:00Z')), '2026-11-02');
        // LA 23:01(11-01) = KST 11-02 16:01
        assert.equal(getKstDateStr(new Date('2026-11-01T23:01:00-08:00')), '2026-11-02');
        assert.equal(getKstDateStr(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
    });

    it('기존에 한국 기기로 저장된 보드 날짜와 그대로 호환된다', () => {
        const today = getKstDateStr(new Date('2026-11-01T23:30:00-08:00')); // LA 기기, KST 11-02
        const board = { date: '2026-11-02', counts: { '5': 1 }, given: { '4': ['5'] } };
        assert.equal(praiseCountForToday(board, '5', today), praiseCountForToday(board, '5', '2026-11-02'));
        assert.deepEqual(rollPraiseDay(board, today), rollPraiseDay(board, '2026-11-02'));
    });

    it('같은 KST 날에는 기기 날짜가 바뀌어도 두 번째 추천·비추천이 막힌다', () => {
        const first = planPeerPraise({}, { fromId: '4', toId: '5', today: getKstDateStr(new Date('2026-11-01T23:00:00-08:00')), reason: '고마워' });
        assert.equal(first.ok, true);
        const second = planPeerPraise(first.board, { fromId: '4', toId: '5', today: getKstDateStr(new Date('2026-11-02T00:30:00-08:00')), reason: '또' });
        assert.equal(second.ok, false);
        const d1 = planPeerDislike({}, { fromId: '4', toId: '5', today: getKstDateStr(new Date('2026-11-01T23:00:00-08:00')), reason: '떠듦' });
        assert.equal(d1.ok, true);
        const d2 = planPeerDislike(d1.board, { fromId: '4', toId: '5', today: getKstDateStr(new Date('2026-11-02T00:30:00-08:00')), reason: '또' });
        assert.equal(d2.ok, false);
    });
});
