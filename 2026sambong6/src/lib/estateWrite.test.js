import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ESTATE_BACKUP_KEEP, countEstateOccupants, planEstateBackup, planEstateMerge, pushEstateBackup } from './estateWrite.js';

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

describe('부동산 자리표 사고 막기(#105)', () => {
    const full = Array.from({ length: 16 }, (_, i) => ({ id: i, owner: i < 14 ? String(i + 1) : null, assignee: null, hidden: false }));
    const twoLeft = full.map((s) => ({ ...s, owner: ['12', '13'].includes(s.owner) ? s.owner : null }));

    it('16명 앉은 자리를 2명만 남기고 덮지 않는다', () => {
        const plan = planEstateMerge({ seats: full, layout: { rows: 4, cols: 4 } }, { seats: twoLeft }, { requireSeats: true });
        assert.equal(plan.seatsSkipped, 'would-shrink');
        assert.equal(plan.write, false);
    });

    it('마스터의 전체 초기화는 그대로 된다', () => {
        const plan = planEstateMerge({ seats: full }, { seats: twoLeft }, { requireSeats: true, allowClearOccupants: true });
        assert.equal(plan.write, true);
    });

    it('한두 명이 자리를 비우는 건 된다', () => {
        const next = full.map((s) => (s.id === 0 ? { ...s, owner: null } : s));
        assert.equal(planEstateMerge({ seats: full }, { seats: next }, { requireSeats: true }).write, true);
    });

    it('자리 수·배열이 바뀌는 저장은 마스터 편집에서만 된다', () => {
        const bigger = [...full, { id: 16, owner: null }];
        assert.equal(planEstateMerge({ seats: full }, { seats: bigger }, { requireSeats: true }).seatsSkipped, 'resize');
        const plan = planEstateMerge({ seats: full, layout: { rows: 4, cols: 4 } }, { seats: full, layout: { rows: 2, cols: 8 } }, { requireSeats: true });
        assert.equal(plan.seatsSkipped, 'layout-change');
        assert.equal(plan.patch.layout, undefined);
    });

    it('거래 기록이 짧아지면 기록만 빼고 저장한다', () => {
        const next = full.map((s) => (s.id === 15 ? { ...s, owner: '20' } : s));
        const plan = planEstateMerge(
            { seats: full, purchaseHistory: [{ a: 1 }, { a: 2 }] },
            { seats: next, purchaseHistory: [{ a: 3 }] },
            { requireSeats: true },
        );
        assert.equal(plan.write, true);
        assert.equal(plan.historySkipped, 'would-shrink');
        assert.equal(plan.patch.purchaseHistory, undefined);
    });
});

describe('부동산 자동 백업(#105)', () => {
    const seats = [{ id: 0, owner: '1' }, { id: 1, owner: null }];
    it('자리가 바뀔 때만 직전 상태를 남긴다', () => {
        assert.equal(planEstateBackup({ seats }, seats.map((s) => ({ ...s }))), null);
        const snap = planEstateBackup({ seats, layout: { rows: 1, cols: 2 } }, [{ id: 0, owner: null }, { id: 1, owner: null }], { now: 5, reason: 'x' });
        assert.equal(snap.occupants, 1);
        assert.equal(snap.at, 5);
        assert.deepEqual(snap.layout, { rows: 1, cols: 2 });
    });
    it('빈 판은 백업하지 않는다', () => {
        assert.equal(planEstateBackup({ seats: [{ id: 0, owner: null }] }, []), null);
        assert.equal(planEstateBackup({}, []), null);
    });
    it('최근 것부터 정해진 개수만 남기고 같은 상태는 겹쳐 넣지 않는다', () => {
        let list = [];
        for (let i = 0; i < 20; i += 1) list = pushEstateBackup(list, { at: i, seats: [{ id: 0, owner: String(i) }] });
        assert.equal(list.length, ESTATE_BACKUP_KEEP);
        assert.equal(list[0].at, 19);
        const same = pushEstateBackup(list, { at: 99, seats: [{ id: 0, owner: '19' }] });
        assert.equal(same[0].at, 19);
    });
});
