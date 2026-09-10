import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterLunchQueueStudents, lunchQueueDisplayName } from './lunchQueue.js';

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
