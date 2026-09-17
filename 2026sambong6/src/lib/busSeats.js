/**
 * 45인승 버스 자리 뽑기.
 * 앞쪽은 2+통로+2, 맨 뒷줄은 5칸입니다. 부동산 자리표와 같이 활성·비활성·고정·랜덤 배치를 둡니다.
 */

export const BUS_SEAT_COUNT = 45;
export const BUS_ROWS = 11;
export const BUS_COLS = 5;

function cleanId(raw) {
    const id = String(raw || '').trim().slice(0, 20);
    return id && id !== 'gm' && id !== 'gm_a' && id !== 'guest' ? id : '';
}

function emptySeat(id) {
    return {
        id,
        assignee: null,
        hidden: false,
        locked: false,
    };
}

export function emptyBusState() {
    return {
        seats: Array.from({ length: BUS_SEAT_COUNT }, (_, i) => emptySeat(i)),
    };
}

export function isBusSeatDisabled(seat) {
    if (!seat) return true;
    return seat.hidden === true;
}

/**
 * 45인승 배치: 1~10열은 창측2 + 통로 + 창측2, 11열(맨 뒤)은 5칸.
 * 칸 순서 왼쪽(창) → 오른쪽(문). 번호는 앞에서부터 1~45.
 */
export function busLayoutCells() {
    const cells = [];
    let n = 0;
    for (let row = 0; row < BUS_ROWS; row += 1) {
        const last = row === BUS_ROWS - 1;
        for (let col = 0; col < BUS_COLS; col += 1) {
            if (!last && col === 2) {
                cells.push({ kind: 'aisle', row, col });
            } else {
                cells.push({ kind: 'seat', row, col, id: n, no: n + 1 });
                n += 1;
            }
        }
    }
    return cells;
}

export function sanitizeBusSeat(raw, fallbackId) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const id = Number.isFinite(Number(src.id)) ? Math.floor(Number(src.id)) : fallbackId;
    if (!Number.isFinite(id) || id < 0 || id >= BUS_SEAT_COUNT) return emptySeat(fallbackId);
    const hidden = src.hidden === true;
    return {
        id,
        assignee: hidden ? null : (cleanId(src.assignee) || null),
        hidden,
        locked: hidden ? true : src.locked === true,
    };
}

export function sanitizeBusState(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const prev = Array.isArray(src.seats) ? src.seats : [];
    const byId = new Map();
    prev.forEach((s, i) => {
        const seat = sanitizeBusSeat(s, i);
        if (seat) byId.set(seat.id, seat);
    });
    const seats = [];
    for (let i = 0; i < BUS_SEAT_COUNT; i += 1) {
        seats.push(byId.get(i) || emptySeat(i));
    }
    return { seats };
}

function shuffleCopy(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor((typeof rng === 'function' ? rng() : Math.random()) * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

/**
 * 고정(잠금+이름) 자리는 남기고, 활성·잠기지 않은 자리에 학생을 무작위로 앉힙니다.
 */
export function shuffleBusAssignees(state, studentIds, rng = Math.random) {
    const next = sanitizeBusState(state);
    const kept = new Set();
    next.seats.forEach((s) => {
        if (s.hidden) {
            s.assignee = null;
            return;
        }
        if (s.locked && s.assignee) {
            kept.add(String(s.assignee));
            return;
        }
        if (!s.locked) s.assignee = null;
    });
    const needing = (Array.isArray(studentIds) ? studentIds : [])
        .map((id) => cleanId(id))
        .filter((id) => id && !kept.has(id));
    const available = next.seats.filter((s) => !s.hidden && !s.locked);
    const students = shuffleCopy(needing, rng);
    const seats = shuffleCopy(available, rng);
    const n = Math.min(students.length, seats.length);
    for (let i = 0; i < n; i += 1) {
        seats[i].assignee = students[i];
    }
    return {
        state: next,
        placed: n,
        leftoverStudents: Math.max(0, students.length - n),
        leftoverSeats: Math.max(0, seats.length - n),
        kept: kept.size,
        available: available.length,
        needing: needing.length,
    };
}

export function resetBusAssignees(state, { keepHidden = true } = {}) {
    const next = sanitizeBusState(state);
    next.seats.forEach((s) => {
        s.assignee = null;
        if (!keepHidden) {
            s.hidden = false;
            s.locked = false;
        } else if (s.hidden) {
            s.locked = true;
        }
    });
    return next;
}

export function busSeatSummary(state) {
    const board = sanitizeBusState(state);
    const active = board.seats.filter((s) => !isBusSeatDisabled(s));
    const filled = active.filter((s) => !!s.assignee).length;
    const locked = active.filter((s) => s.locked).length;
    return {
        total: BUS_SEAT_COUNT,
        active: active.length,
        hidden: board.seats.length - active.length,
        filled,
        locked,
    };
}
