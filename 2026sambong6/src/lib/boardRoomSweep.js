// 오래 쉰 게임방 정리(sweep)가 같은 방을 여러 번 지우지 않게 하는 도우미예요.
// 스냅샷이 올 때마다 정리가 새로 시작되면, 아직 목록에 남아 있는 방을 또 지워서 삭제 쓰기가 끝없이 늘어났어요.
// - 한 번에 정리 하나만 돌아요. 도는 중에 또 부르면 끝난 뒤 한 번만 다시 봐요.
// - 이 화면에서 이미 지우기를 시도한 방(같은 활동 시각)은 다시 지우지 않아요.
import { expireIdleBoardRoom, isRoomIdleExpired, sanitizeBoardRoom } from './boardGameRooms.js';

/** 방이 마지막으로 움직인 시각까지 넣은 정리 키예요. 다시 활동한 방은 새 키가 돼요. */
export function boardRoomSweepKey(room) {
    const r = sanitizeBoardRoom(room);
    return `${r.id}|${r.lastActivityAt || 0}`;
}

/** 지금 정리할 방만 골라요. 닫힌 방·아직 쉬는 시간이 안 지난 방·이미 시도한 방은 빼요. */
export function pickIdleRoomsToSweep(rooms, now, handledKeys = new Set()) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(rooms) ? rooms : []) {
        const room = sanitizeBoardRoom(raw, now);
        if (!room.id || room.status === 'closed') continue;
        if (!isRoomIdleExpired(room, now)) continue;
        if (!expireIdleBoardRoom(room, now).ok) continue;
        const key = boardRoomSweepKey(room);
        if (handledKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push(room);
    }
    return out;
}

/**
 * 정리 실행기를 만들어요.
 * getRooms(): 지금 화면이 아는 방 목록, removeRoom(room): 방 하나 지우기(트랜잭션 권장).
 */
export function createIdleRoomSweeper({ getRooms, removeRoom, onError = () => {} } = {}) {
    const handled = new Set();
    let running = false;
    let again = false;
    let againAt = 0;
    async function sweep(now = Date.now()) {
        if (running) { again = true; againAt = Math.max(againAt, Number(now) || 0); return; }
        running = true;
        try {
            let t = now;
            do {
                again = false;
                againAt = 0;
                const due = pickIdleRoomsToSweep(getRooms(), t, handled);
                for (const room of due) {
                    // 지우기 전에 먼저 적어 둬요. 실패해도 이 화면은 같은 방을 다시 지우지 않아요.
                    handled.add(boardRoomSweepKey(room));
                    try {
                        await removeRoom(room);
                    } catch (e) {
                        onError(e, room);
                    }
                }
                t = Math.max(t, againAt);
            } while (again);
        } finally {
            running = false;
        }
    }
    return { sweep, handledCount: () => handled.size, isRunning: () => running };
}
