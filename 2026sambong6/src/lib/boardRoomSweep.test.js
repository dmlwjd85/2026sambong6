import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_ROOM_IDLE_TTL_MS, createBoardRoom } from './boardGameRooms.js';
import { boardRoomSweepKey, createIdleRoomSweeper, createRoomDeleteOnce, pickIdleRoomsToSweep } from './boardRoomSweep.js';

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

describe('정리기 옵션: 고르는 기준·키·한꺼번에 지우기', () => {
    it('parallel이면 기다림이 겹쳐도 방마다 한 번만, 한꺼번에 지워요', async () => {
        const rows = [room('1', { at: OLD }), room('2', { at: OLD }), room('3', { at: OLD })];
        const started = [];
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const sweeper = createIdleRoomSweeper({
            getRooms: () => rows,
            keyOf: (r) => r.id,
            pickRooms: (list) => list.filter((r) => r.id !== 'bg_2'),
            parallel: true,
            removeRoom: async (r) => { started.push(r.id); await gate; },
        });
        const first = sweeper.sweep(T0);
        await tick();
        assert.deepEqual(started, ['bg_1', 'bg_3']); // 앞 방 기다림이 끝나기 전에 둘 다 시작
        const again = sweeper.sweep(T0 + 1000);
        release();
        await Promise.all([first, again]);
        await sweeper.sweep(T0 + 2000);
        assert.deepEqual(started, ['bg_1', 'bg_3']);
        assert.equal(sweeper.handledCount(), 2);
    });
});

describe('#100 권장③ 같은 방 지우기 한 번만', () => {
    it('같은 방 id는 지우는 중(ttl 안)에는 한 번만 시작하고, 풀면 다시 할 수 있어요', () => {
        const once = createRoomDeleteOnce({ ttlMs: 1000 });
        assert.equal(once.tryStart('alkl_1', 0), true);
        assert.equal(once.tryStart('alkl_1', 10), false, '두 번째는 막아요');
        assert.equal(once.tryStart('alkl_2', 10), true, '다른 방은 따로');
        assert.equal(once.tryStart('alkl_1', 1001), true, 'ttl이 지나면 다시 돼요');
        once.release('alkl_2');
        assert.equal(once.tryStart('alkl_2', 20), true);
        assert.equal(once.tryStart('', 0), false);
    });
    it('정리기와 다른 길이 같은 방을 동시에 지우려 해도 지우기 요청은 한 번이에요', async () => {
        const once = createRoomDeleteOnce();
        const sent = [];
        const del = async (id) => { if (!once.tryStart(id)) return false; try { await new Promise((r) => setTimeout(r, 5)); sent.push(id); return true; } finally { once.release(id); } };
        // 키가 다른 같은 방 두 줄(활동 시각만 다름)
        const rooms = [{ id: 'alkl_9', k: 'a' }, { id: 'alkl_9', k: 'b' }];
        const sw = createIdleRoomSweeper({ getRooms: () => rooms, pickRooms: (rs) => rs, keyOf: (r) => `${r.id}|${r.k}`, parallel: true, removeRoom: (r) => del(r.id) });
        await Promise.all([sw.sweep(0), del('alkl_9')]);
        assert.deepEqual(sent, ['alkl_9']);
        // 끝난 뒤(같은 id로 새 방을 만들어 다시 닫는 경우)는 다시 지울 수 있어요
        assert.equal(await del('alkl_9'), true);
    });
});
