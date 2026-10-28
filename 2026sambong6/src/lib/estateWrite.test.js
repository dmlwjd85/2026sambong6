import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countEstateOccupants, planEstateMerge } from './estateWrite.js';

const occupied = [
    { id: 0, owner: '2', assignee: null, hidden: false },
    { id: 1, owner: null, assignee: '5', hidden: false },
    { id: 2, owner: null, assignee: null, hidden: true },
];

describe('부동산 자리 부분 저장', () => {
    it('앉은 학생만 센다', () => {
        assert.equal(countEstateOccupants(occupied), 2);
        assert.equal(countEstateOccupants([]), 0);
        assert.equal(countEstateOccupants(null), 0);
    });

    it('빈 좌석 배열은 기존 자리를 덮지 않는다', () => {
        const plan = planEstateMerge(
            { seats: occupied, purchaseHistory: [{ studentId: '2' }] },
            { seats: [], purchaseHistory: [] },
            { requireSeats: true },
        );
        assert.equal(plan.write, false);
        assert.equal(plan.seatsSkipped, 'empty');
        assert.deepEqual(plan.patch, {});
    });

    it('값이 없는 좌석은 빈 자리로 만들지 않는다', () => {
        const plan = planEstateMerge(
            { seats: occupied },
            { layout: { rows: 4, cols: 4 } },
            { requireSeats: true },
        );
        assert.equal(plan.write, false);
        assert.equal(plan.seatsSkipped, 'missing');
    });

    it('서버 자리를 모르면 기본 빈 교실을 쓰지 않는다', () => {
        const blank = occupied.map((seat) => ({ ...seat, owner: null, assignee: null }));
        const plan = planEstateMerge({}, { seats: blank }, { requireSeats: true });
        assert.equal(plan.seatsSkipped, 'missing-previous');
        assert.equal(plan.write, false);
    });

    it('앉은 학생이 있는 자리를 전원 빈 값으로 덮지 않는다', () => {
        const blank = occupied.map((seat) => ({ ...seat, owner: null, assignee: null }));
        const plan = planEstateMerge({ seats: occupied }, { seats: blank, layout: { rows: 1, cols: 3 } }, { requireSeats: true });
        assert.equal(plan.seatsSkipped, 'would-clear');
        assert.equal(plan.write, false);
    });

    it('한 자리 주인 변경은 좌석 배열만 병합한다', () => {
        const next = occupied.map((seat) => (seat.id === 0 ? { ...seat, owner: '9' } : seat));
        const plan = planEstateMerge({ seats: occupied }, { seats: next }, { requireSeats: true });
        assert.equal(plan.write, true);
        assert.equal(plan.seatsSkipped, '');
        assert.equal(plan.patch.seats[0].owner, '9');
        assert.equal(plan.patch.layout, undefined);
    });

    it('마스터가 확인한 초기화만 빈 주인을 쓴다', () => {
        const blank = occupied.map((seat) => ({ ...seat, owner: null, assignee: null }));
        const plan = planEstateMerge(
            { seats: occupied },
            { seats: blank },
            { allowClearOccupants: true, requireSeats: true },
        );
        assert.equal(plan.write, true);
        assert.equal(countEstateOccupants(plan.patch.seats), 0);
    });

    it('문서가 없을 때만 새 좌석을 만든다', () => {
        const plan = planEstateMerge({}, { seats: occupied, layout: { rows: 1, cols: 3 } }, { allowCreateSeats: true, requireSeats: true });
        assert.equal(plan.write, true);
        assert.equal(plan.patch.seats.length, 3);
        assert.deepEqual(plan.patch.layout, { rows: 1, cols: 3 });
    });
});
