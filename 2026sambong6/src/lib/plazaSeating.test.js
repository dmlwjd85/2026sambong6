import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlazaSeatingPlan, getEstateSeatOccupantId } from './plazaSeating.js';

describe('부동산 자리 → 광장 격자', () => {
    it('구매 주인이 있으면 임시 배치보다 주인을 쓴다', () => {
        assert.equal(getEstateSeatOccupantId({ owner: '3', assignee: '7' }), '3');
        assert.equal(getEstateSeatOccupantId({ owner: null, assignee: '7' }), '7');
        assert.equal(getEstateSeatOccupantId({ hidden: true, owner: '3' }), null);
    });

    it('행·열과 사용 안 함 칸을 교실 격자로 맞춘다', () => {
        const plan = buildPlazaSeatingPlan({
            rows: 2,
            cols: 3,
            activeStudentIds: ['1', '2', '3', '4'],
            seats: [
                { id: 0, owner: '2', hidden: false },
                { id: 1, hidden: true },
                { id: 2, assignee: '1', hidden: false },
                { id: 3, owner: null, assignee: null, hidden: false },
                { id: 4, owner: '3', hidden: false },
                { id: 5, owner: '99', hidden: false },
            ],
        });
        assert.equal(plan.rows, 2);
        assert.equal(plan.cols, 3);
        assert.deepEqual(plan.cells.map((c) => c.type), [
            'student', 'hidden', 'student', 'empty', 'student', 'empty',
        ]);
        assert.equal(plan.cells[0].studentId, '2');
        assert.equal(plan.cells[2].studentId, '1');
        assert.equal(plan.cells[4].studentId, '3');
        assert.deepEqual(plan.unseated, ['4']);
    });

    it('같은 학생이 두 자리에 있으면 앞자리만 쓰고 나머지는 빈 자리로 둔다', () => {
        const plan = buildPlazaSeatingPlan({
            rows: 1,
            cols: 2,
            activeStudentIds: ['5'],
            seats: [
                { id: 0, owner: '5', hidden: false },
                { id: 1, assignee: '5', hidden: false },
            ],
        });
        assert.equal(plan.cells[0].type, 'student');
        assert.equal(plan.cells[1].type, 'empty');
        assert.deepEqual(plan.unseated, []);
    });
});
