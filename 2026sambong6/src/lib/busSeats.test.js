import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BUS_SEAT_COUNT,
    busLayoutCells,
    busSeatSummary,
    emptyBusState,
    isBusSeatDisabled,
    resetBusAssignees,
    sanitizeBusState,
    shuffleBusAssignees,
} from './busSeats.js';

describe('45인승 버스 자리', () => {
    it('앞 10열은 4칸+통로, 맨 뒤는 5칸으로 45석을 맞춘다', () => {
        const cells = busLayoutCells();
        const seats = cells.filter((c) => c.kind === 'seat');
        const aisles = cells.filter((c) => c.kind === 'aisle');
        assert.equal(seats.length, BUS_SEAT_COUNT);
        assert.equal(aisles.length, 10);
        assert.equal(seats[0].no, 1);
        assert.equal(seats[seats.length - 1].no, 45);
        const lastRow = cells.filter((c) => c.row === 10);
        assert.equal(lastRow.filter((c) => c.kind === 'seat').length, 5);
        assert.equal(emptyBusState().seats.length, 45);
    });

    it('비활성 자리와 위험한 학번을 버린다', () => {
        const dirty = sanitizeBusState({
            seats: [
                { id: 0, assignee: 'gm', hidden: true, locked: false },
                { id: 1, assignee: '7', hidden: false, locked: true },
                { id: 99, assignee: 'hack' },
            ],
        });
        assert.equal(dirty.seats.length, 45);
        assert.equal(isBusSeatDisabled(dirty.seats[0]), true);
        assert.equal(dirty.seats[0].assignee, null);
        assert.equal(dirty.seats[1].assignee, '7');
        assert.equal(dirty.seats[1].locked, true);
        assert.equal(dirty.seats[2].assignee, null);
    });

    it('고정 자리는 남기고 나머지만 랜덤 뽑기한다', () => {
        const base = emptyBusState();
        base.seats[0].locked = true;
        base.seats[0].assignee = '1';
        base.seats[1].hidden = true;
        base.seats[1].locked = true;
        let i = 0;
        const rng = () => {
            i += 1;
            return (i % 10) / 10;
        };
        const drawn = shuffleBusAssignees(base, ['1', '2', '3'], rng);
        assert.equal(drawn.state.seats[0].assignee, '1');
        assert.equal(drawn.state.seats[1].assignee, null);
        assert.equal(drawn.kept, 1);
        assert.equal(drawn.placed, 2);
        const names = drawn.state.seats.map((s) => s.assignee).filter(Boolean).sort();
        assert.deepEqual(names, ['1', '2', '3']);
        const cleared = resetBusAssignees(drawn.state);
        assert.equal(cleared.seats[0].assignee, null);
        assert.equal(cleared.seats[1].hidden, true);
        const sum = busSeatSummary(cleared);
        assert.equal(sum.total, 45);
        assert.equal(sum.hidden, 1);
        assert.equal(sum.active, 44);
    });
});
