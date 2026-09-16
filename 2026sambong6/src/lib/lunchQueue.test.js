import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    filterLunchQueueStudents,
    isLunchBidOpen,
    isLunchRankVisible,
    lunchBidClosedReason,
    lunchQueueDisplayName,
} from './lunchQueue.js';

describe('밥줄 명단', () => {
    it('활성 명단에 없는 유령 문서와 마스터·손님을 뺀다', () => {
        const rows = [
            { id: '1', name: '김단엘' },
            { id: '99', name: '' },
            { id: 'gm' },
            { id: 'gm_a' },
            { id: 'guest' },
            { id: '12', name: '황훈태' },
        ];
        const visible = filterLunchQueueStudents(rows, ['1', '12', 'gm']);
        assert.deepEqual(visible.map((s) => s.id), ['1', '12']);
    });

    it('명단 이름이 있으면 그걸 쓰고, 없으면 빈 이름으로 둔다', () => {
        assert.equal(lunchQueueDisplayName({ id: '12' }, { 12: '황훈태' }), '황훈태');
        assert.equal(lunchQueueDisplayName({ id: '99' }, {}), '');
        assert.equal(lunchQueueDisplayName({ id: '7', name: '7' }, {}), '');
        assert.equal(lunchQueueDisplayName({ id: '7', name: '박하율' }, {}), '박하율');
    });
});

describe('밥줄 투자 마감 시각', () => {
    it('점심 이후·주말에도 투자는 열어 둔다', () => {
        assert.equal(isLunchBidOpen(new Date(2026, 8, 16, 11, 59, 0)), true);
        assert.equal(isLunchBidOpen(new Date(2026, 8, 16, 12, 0, 0)), true);
        assert.equal(isLunchBidOpen(new Date(2026, 8, 16, 12, 10, 0)), true);
        assert.equal(isLunchBidOpen(new Date(2026, 8, 19, 10, 0, 0)), true);
        assert.equal(lunchBidClosedReason(new Date(2026, 8, 16, 12, 1, 0)), '');
        assert.equal(lunchBidClosedReason(new Date(2026, 8, 19, 10, 0, 0)), '');
    });

    it('순위는 12시 10분부터 학생에게 보이고 선생님은 항상 본다', () => {
        assert.equal(isLunchRankVisible(new Date(2026, 8, 16, 12, 9, 0), false), false);
        assert.equal(isLunchRankVisible(new Date(2026, 8, 16, 12, 10, 0), false), true);
        assert.equal(isLunchRankVisible(new Date(2026, 8, 16, 11, 0, 0), true), true);
    });
});
