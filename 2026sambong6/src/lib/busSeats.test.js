import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BUS_SEAT_COUNT,
    BUS_SEAT_DEFAULT_PRICE,
    applyBusSeatAdminAssign,
    applyBusSeatBulkSettings,
    applyBusSeatPurchase,
    applyBusSeatRelease,
    applyBusSeatWalletChanges,
    busLayoutCells,
    busSeatSummary,
    emptyBusState,
    isBusSeatDisabled,
    minBusSeatBid,
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
                { id: 0, assignee: 'gm', hidden: true, locked: false, owner: 'gm', paid: 9 },
                { id: 1, assignee: '7', hidden: false, locked: true, price: 25, owner: '7', paid: 30 },
                { id: 99, assignee: 'hack' },
            ],
        });
        assert.equal(dirty.seats.length, 45);
        assert.equal(isBusSeatDisabled(dirty.seats[0]), true);
        assert.equal(dirty.seats[0].assignee, null);
        assert.equal(dirty.seats[0].owner, null);
        assert.equal(dirty.seats[0].paid, 0);
        const keptHidden = sanitizeBusState({
            seats: [{ id: 0, hidden: true, owner: '4', paid: 22, price: 10 }],
        });
        assert.equal(keptHidden.seats[0].hidden, true);
        assert.equal(keptHidden.seats[0].owner, '4');
        assert.equal(keptHidden.seats[0].paid, 22);
        assert.equal(dirty.seats[1].assignee, '7');
        assert.equal(dirty.seats[1].owner, '7');
        assert.equal(dirty.seats[1].paid, 30);
        assert.equal(dirty.seats[1].price, 25);
        assert.equal(dirty.seats[1].locked, true);
        assert.equal(dirty.seats[2].assignee, null);
        assert.equal(dirty.seats[2].price, BUS_SEAT_DEFAULT_PRICE);
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

describe('버스 자리 구입·입찰 환불', () => {
    it('빈 자리는 기본가 이상으로 사고, 같은 가격 재입찰은 거절한다', () => {
        const first = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 0,
            buyerId: '1',
            bid: BUS_SEAT_DEFAULT_PRICE,
            buyerBong: 100,
            purchaseId: 'buy-a',
        });
        assert.equal(first.ok, true);
        assert.equal(first.state.seats[0].owner, '1');
        assert.equal(first.state.seats[0].paid, 10);
        assert.equal(first.buyerBong, 90);
        assert.equal(minBusSeatBid(first.state.seats[0]), 11);

        const same = applyBusSeatPurchase({
            state: first.state,
            seatId: 0,
            buyerId: '2',
            bid: 10,
            buyerBong: 50,
            purchaseId: 'buy-b',
        });
        assert.equal(same.ok, false);
        assert.equal(same.reason, 'low');
        assert.equal(same.minBid, 11);
        assert.equal(first.state.seats[0].owner, '1');
    });

    it('더 높은 가격이면 구매자가 바뀌고 기존 구매자는 낸 봉만 돌려받는다', () => {
        const first = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 3,
            buyerId: '1',
            bid: 10,
            buyerBong: 40,
            purchaseId: 'p1',
        });
        const second = applyBusSeatPurchase({
            state: first.state,
            seatId: 3,
            buyerId: '2',
            bid: 18,
            buyerBong: 20,
            purchaseId: 'p2',
        });
        assert.equal(second.ok, true);
        assert.equal(second.state.seats[3].owner, '2');
        assert.equal(second.state.seats[3].paid, 18);
        assert.equal(second.prevOwner, '1');
        assert.deepEqual(second.refunds, [{ studentId: '1', amount: 10, seatId: 3, kind: 'outbid' }]);
        assert.equal(second.buyerBong, 2);

        const wallets = applyBusSeatWalletChanges({
            buyerId: '2',
            buyerBong: 20,
            charge: second.charge,
            refunds: second.refunds,
            otherBongs: { 1: 30 },
        });
        assert.equal(wallets['2'], 2);
        assert.equal(wallets['1'], 40);
        assert.equal(wallets['1'] + wallets['2'], 42);
    });

    it('같은 자리를 다시 사려는 본인과 잔액 부족은 거절한다', () => {
        const owned = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 1,
            buyerId: '5',
            bid: 12,
            buyerBong: 12,
            purchaseId: 'me',
        });
        const self = applyBusSeatPurchase({
            state: owned.state,
            seatId: 1,
            buyerId: '5',
            bid: 20,
            buyerBong: 100,
            purchaseId: 'me2',
        });
        assert.equal(self.ok, false);
        assert.equal(self.reason, 'self');

        const poor = applyBusSeatPurchase({
            state: owned.state,
            seatId: 1,
            buyerId: '8',
            bid: 13,
            buyerBong: 12,
            purchaseId: 'poor',
        });
        assert.equal(poor.ok, false);
        assert.equal(poor.reason, 'funds');
        assert.equal(owned.state.seats[1].owner, '5');
        assert.equal(owned.state.seats[1].paid, 12);
    });

    it('한 학생이 다른 자리를 사면 예전 자리를 비우고 낸 봉을 돌려준다', () => {
        let state = emptyBusState();
        const a = applyBusSeatPurchase({
            state,
            seatId: 0,
            buyerId: '3',
            bid: 10,
            buyerBong: 30,
            purchaseId: 's0',
        });
        const b = applyBusSeatPurchase({
            state: a.state,
            seatId: 2,
            buyerId: '3',
            bid: 15,
            buyerBong: a.buyerBong,
            purchaseId: 's2',
        });
        assert.equal(b.ok, true);
        assert.equal(b.state.seats[0].owner, null);
        assert.equal(b.state.seats[0].paid, 0);
        assert.equal(b.state.seats[2].owner, '3');
        assert.equal(b.state.seats[2].paid, 15);
        assert.equal(b.buyerBong, 15);
        assert.equal(b.refunds.some((r) => r.kind === 'vacate' && r.amount === 10 && r.seatId === 0), true);
    });

    it('같은 구매 번호는 두 번 깎이지 않는다', () => {
        const first = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 4,
            buyerId: '9',
            bid: 10,
            buyerBong: 50,
            purchaseId: 'once',
        });
        const retry = applyBusSeatPurchase({
            state: first.state,
            seatId: 4,
            buyerId: '9',
            bid: 10,
            buyerBong: first.buyerBong,
            purchaseId: 'once',
        });
        assert.equal(retry.ok, true);
        assert.equal(retry.already, true);
        assert.equal(retry.charge, 0);
        assert.equal(retry.buyerBong, 40);
        assert.equal(first.state.seats[4].paid, 10);
    });

    it('비우면 기존 구매자에게 paid만 환불한다', () => {
        const bought = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 6,
            buyerId: '4',
            bid: 22,
            buyerBong: 22,
            purchaseId: 'own',
        });
        const released = applyBusSeatRelease({
            state: bought.state,
            seatId: 6,
            hidden: true,
            refundId: 'rel-1',
        });
        assert.equal(released.ok, true);
        assert.equal(released.state.seats[6].hidden, true);
        assert.equal(released.state.seats[6].owner, null);
        assert.equal(released.state.seats[6].paid, 0);
        assert.deepEqual(released.refunds, [{ studentId: '4', amount: 22, seatId: 6, kind: 'release' }]);
        const again = applyBusSeatRelease({
            state: released.state,
            seatId: 6,
            hidden: true,
            refundId: 'rel-1',
        });
        assert.equal(again.already, true);
        assert.equal(again.refunds.length, 0);
    });

    it('뽑기와 초기화는 구입한 주인을 지우지 않는다', () => {
        const bought = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 0,
            buyerId: '1',
            bid: 10,
            buyerBong: 10,
            purchaseId: 'keep',
        });
        const drawn = shuffleBusAssignees(bought.state, ['1', '2']);
        assert.equal(drawn.state.seats[0].owner, '1');
        assert.equal(drawn.state.seats[0].assignee, '1');
        assert.equal(drawn.state.seats[0].paid, 10);
        assert.equal(drawn.kept, 1);
        const names = drawn.state.seats.map((s) => s.assignee).filter(Boolean).sort();
        assert.deepEqual(names, ['1', '2']);
        const cleared = resetBusAssignees(drawn.state);
        assert.equal(cleared.seats[0].owner, '1');
        assert.equal(cleared.seats[0].assignee, '1');
        assert.equal(cleared.seats[0].paid, 10);
        const sum = busSeatSummary(cleared);
        assert.equal(sum.owned, 1);
    });

    it('한 번에 활성·가격을 맞추고 비활성 자리는 낸 봉을 환불한다', () => {
        const bought = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 1,
            buyerId: '6',
            bid: 20,
            buyerBong: 20,
            purchaseId: 'bulk-own',
        });
        const bulk = applyBusSeatBulkSettings({
            state: bought.state,
            batchId: 'bulk-1',
            updates: [
                { id: 0, hidden: true, price: 7 },
                { id: 1, hidden: true, price: 12 },
                { id: 2, hidden: false, price: 15 },
            ],
        });
        assert.equal(bulk.ok, true);
        assert.equal(bulk.state.seats[0].hidden, true);
        assert.equal(bulk.state.seats[0].price, 7);
        assert.equal(bulk.state.seats[1].owner, null);
        assert.equal(bulk.state.seats[1].paid, 0);
        assert.equal(bulk.state.seats[2].price, 15);
        assert.deepEqual(bulk.refunds, [{ studentId: '6', amount: 20, seatId: 1, kind: 'release' }]);
        const again = applyBusSeatBulkSettings({
            state: bulk.state,
            batchId: 'bulk-1',
            updates: [{ id: 1, hidden: true, price: 12 }],
        });
        assert.equal(again.refunds.length, 0);
    });
});

describe('마스터 버스 자리 비우기·구매자 변경', () => {
    function ownedBoard() {
        const huntae = applyBusSeatPurchase({
            state: emptyBusState(),
            seatId: 11,
            buyerId: '12',
            bid: 18,
            buyerBong: 50,
            purchaseId: 'buy-12',
        });
        return applyBusSeatPurchase({
            state: huntae.state,
            seatId: 7,
            buyerId: '8',
            bid: 14,
            buyerBong: 40,
            purchaseId: 'buy-8',
        });
    }

    it('구매 자리를 비우면 낸 봉만 환불한다', () => {
        const board = ownedBoard();
        const vacated = applyBusSeatAdminAssign({
            state: board.state,
            seatId: 11,
            selectedId: '',
            actionId: 'adm-vacate',
        });
        assert.equal(vacated.ok, true);
        assert.equal(vacated.kind, 'vacate');
        assert.equal(vacated.state.seats[11].owner, null);
        assert.equal(vacated.state.seats[11].paid, 0);
        assert.equal(vacated.state.seats[11].assignee, null);
        assert.equal(vacated.state.seats[7].owner, '8');
        assert.deepEqual(vacated.refunds, [{ studentId: '12', amount: 18, seatId: 11, kind: 'vacate' }]);
        const again = applyBusSeatAdminAssign({
            state: vacated.state,
            seatId: 11,
            selectedId: '',
            actionId: 'adm-vacate',
        });
        assert.equal(again.already, true);
        assert.equal(again.refunds.length, 0);
    });

    it('빈 자리로 옮기면 paid를 가져가고 환불하지 않는다', () => {
        const board = ownedBoard();
        const moved = applyBusSeatAdminAssign({
            state: board.state,
            seatId: 20,
            selectedId: '12',
            actionId: 'adm-move',
        });
        assert.equal(moved.ok, true);
        assert.equal(moved.kind, 'move');
        assert.equal(moved.movedFromSeatId, 11);
        assert.equal(moved.state.seats[20].owner, '12');
        assert.equal(moved.state.seats[20].paid, 18);
        assert.equal(moved.state.seats[20].assignee, '12');
        assert.equal(moved.state.seats[11].owner, null);
        assert.equal(moved.state.seats[11].paid, 0);
        assert.equal(moved.state.seats[7].owner, '8');
        assert.equal(moved.refunds.length, 0);
    });

    it('두 구매자 자리를 맞바꾸면 각자 낸 봉을 들고 간다', () => {
        const board = ownedBoard();
        const swapped = applyBusSeatAdminAssign({
            state: board.state,
            seatId: 11,
            selectedId: '8',
            actionId: 'adm-swap',
        });
        assert.equal(swapped.ok, true);
        assert.equal(swapped.kind, 'swap');
        assert.equal(swapped.state.seats[11].owner, '8');
        assert.equal(swapped.state.seats[11].paid, 14);
        assert.equal(swapped.state.seats[7].owner, '12');
        assert.equal(swapped.state.seats[7].paid, 18);
        assert.equal(swapped.refunds.length, 0);
    });

    it('구입 자리가 없는 학생으로 바꾸면 기존 구매자에게 환불한다', () => {
        const board = ownedBoard();
        const replaced = applyBusSeatAdminAssign({
            state: board.state,
            seatId: 7,
            selectedId: '1',
            actionId: 'adm-replace',
        });
        assert.equal(replaced.ok, true);
        assert.equal(replaced.kind, 'replace');
        assert.equal(replaced.state.seats[7].owner, '1');
        assert.equal(replaced.state.seats[7].paid, 0);
        assert.deepEqual(replaced.refunds, [{ studentId: '8', amount: 14, seatId: 7, kind: 'replace' }]);
        assert.equal(replaced.state.seats[11].owner, '12');
    });

    it('주인이 없는 자리는 뽑기 앉히기만 한다', () => {
        const assigned = applyBusSeatAdminAssign({
            state: emptyBusState(),
            seatId: 3,
            selectedId: '5',
            actionId: 'adm-assign',
        });
        assert.equal(assigned.ok, true);
        assert.equal(assigned.kind, 'assign');
        assert.equal(assigned.state.seats[3].owner, null);
        assert.equal(assigned.state.seats[3].assignee, '5');
        assert.equal(assigned.refunds.length, 0);
    });

    it('비활성 자리를 다시 켜도 구매자와 낸 봉을 유지한다', () => {
        const hiddenKeep = sanitizeBusState({
            seats: [{ id: 0, hidden: true, owner: '12', paid: 18, price: 10 }],
        });
        const opened = applyBusSeatAdminAssign({
            state: hiddenKeep,
            seatId: 0,
            selectedId: '12',
            actionId: 'adm-unhide',
        });
        assert.equal(opened.ok, true);
        assert.equal(opened.kind, 'keep');
        assert.equal(opened.state.seats[0].hidden, false);
        assert.equal(opened.state.seats[0].owner, '12');
        assert.equal(opened.state.seats[0].paid, 18);
        assert.equal(opened.refunds.length, 0);
    });
});
