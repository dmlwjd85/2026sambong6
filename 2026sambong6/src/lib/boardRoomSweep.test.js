import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_ROOM_IDLE_TTL_MS, createBoardRoom } from './boardGameRooms.js';
import { boardRoomSweepKey, createIdleRoomSweeper, pickIdleRoomsToSweep } from './boardRoomSweep.js';

const T0 = 1_800_000_000_000;
function room(hostId, { at = T0, gameType = 'gomoku' } = {}) {
    const r = createBoardRoom({ gameType, hostId, hostName: `방장${hostId}`, now: at }).room;
    return { ...r, id: `bg_${hostId}` };
}
const OLD = T0 - BOARD_ROOM_IDLE_TTL_MS - 60_000;
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('오래 쉰 방 정리: 중복 삭제 막기', () => {
    it('오래 쉰 방만 고르고, 이미 시도한 방은 빼요', () => {
        const rows = [room('1', { at: OLD }), room('2', { at: T0 - 1000 }), room('3', { at: OLD })];
        const due = pickIdleRoomsToSweep(rows, T0);
        assert.deepEqual(due.map((r) => r.id), ['bg_1', 'bg_3']);
        const handled = new Set([boardRoomSweepKey(rows[0])]);
        assert.deepEqual(pickIdleRoomsToSweep(rows, T0, handled).map((r) => r.id), ['bg_3']);
    });

    it('같은 방이 목록에 두 번 있어도 한 번만 골라요', () => {
        const a = room('1', { at: OLD });
        assert.equal(pickIdleRoomsToSweep([a, { ...a }], T0).length, 1);
    });

    it('스냅샷마다 정리를 불러도 방 하나당 지우기는 한 번뿐이에요', async () => {
        let rows = Array.from({ length: 30 }, (_, i) => room(String(i + 1), { at: OLD }));
        const calls = [];
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const sweeper = createIdleRoomSweeper({
            getRooms: () => rows,
            removeRoom: async (r) => {
                calls.push(r.id);
                await gate; // 서버 응답이 늦어 목록에 방이 아직 남아 있는 상황
                rows = rows.filter((x) => x.id !== r.id);
            },
        });
        // 지우는 동안 스냅샷이 계속 와서 정리를 20번 더 불러요(예전에는 부를 때마다 남은 방을 처음부터 다시 지웠어요).
        const runs = [sweeper.sweep(T0)];
        for (let i = 0; i < 20; i += 1) { runs.push(sweeper.sweep(T0)); await tick(); }
        release();
        await Promise.all(runs);
        // 방이 다 지워진 뒤에도 더 불러 봐요.
        for (let i = 0; i < 5; i += 1) await sweeper.sweep(T0 + 1000);
        assert.equal(calls.length, 30);
        assert.equal(new Set(calls).size, 30);
        assert.equal(rows.length, 0);
        assert.equal(sweeper.isRunning(), false);
    });

    it('지우기가 실패해도 같은 방을 다시 지우려고 하지 않아요', async () => {
        const rows = [room('1', { at: OLD })];
        let n = 0;
        const errors = [];
        const sweeper = createIdleRoomSweeper({
            getRooms: () => rows,
            removeRoom: async () => { n += 1; throw new Error('permission-denied'); },
            onError: (e) => errors.push(e.message),
        });
        for (let i = 0; i < 5; i += 1) await sweeper.sweep(T0);
        assert.equal(n, 1);
        assert.deepEqual(errors, ['permission-denied']);
    });

    it('다시 활동한 뒤 또 오래 쉬면 그때는 새로 정리해요', async () => {
        let rows = [room('1', { at: OLD })];
        const calls = [];
        const sweeper = createIdleRoomSweeper({ getRooms: () => rows, removeRoom: async (r) => { calls.push(r.lastActivityAt); } });
        await sweeper.sweep(T0);
        rows = [room('1', { at: T0 })];
        await sweeper.sweep(T0 + 1000);
        await sweeper.sweep(T0 + BOARD_ROOM_IDLE_TTL_MS + 1000);
        assert.equal(calls.length, 2);
        assert.notEqual(calls[0], calls[1]);
    });

    it('도는 중에 새 방이 오래 쉬게 되면 끝난 뒤 한 번 더 봐요', async () => {
        let rows = [room('1', { at: OLD })];
        const calls = [];
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const sweeper = createIdleRoomSweeper({ getRooms: () => rows, removeRoom: async (r) => { calls.push(r.id); if (r.id === 'bg_1') await gate; } });
        const first = sweeper.sweep(T0);
        await tick();
        rows = [...rows, room('2', { at: OLD })];
        const second = sweeper.sweep(T0);
        release();
        await Promise.all([first, second]);
        assert.deepEqual(calls, ['bg_1', 'bg_2']);
    });
});
