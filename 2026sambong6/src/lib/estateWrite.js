/**
 * 부동산 자리표 저장.
 * seats 가 없거나 비어 있으면 기존 자리를 빈 배열로 덮지 않습니다.
 * 서버에 앉은 학생이 있는데 이번 값이 전원 빈 자리면, 명시적 초기화가 아니면 좌석 필드를 빼니다.
 * Firestore 에는 바뀐 필드만 merge 합니다.
 */

export function countEstateOccupants(seats) {
    if (!Array.isArray(seats)) return 0;
    let n = 0;
    seats.forEach((seat) => {
        if (!seat || seat.hidden === true) return;
        const owner = seat.owner != null ? String(seat.owner).trim() : '';
        const assignee = seat.assignee != null ? String(seat.assignee).trim() : '';
        if (owner || assignee) n += 1;
    });
    return n;
}

/** 앉은 학생이 이만큼 이상일 때, 한 번에 절반 넘게 사라지는 저장은 막아요(#105). */
export const ESTATE_SHRINK_MIN_PREV = 3;

function sameLayout(a, b) {
    if (!a || !b) return true;
    return Number(a.rows) === Number(b.rows) && Number(a.cols) === Number(b.cols);
}

/**
 * @returns {{ patch: object, seatsSkipped: string, historySkipped: string, write: boolean }}
 *
 * 막는 저장(마스터의 전체 초기화·배열 편집처럼 allowClearOccupants 를 준 때만 통과):
 * - empty: 빈 좌석 배열
 * - missing-previous: 서버 자리를 모르는데 새로 만들려 함(allowCreateSeats 필요)
 * - would-clear: 앉은 학생이 있는데 전원 빈 자리로 덮음
 * - would-shrink: 앉은 학생 3명 이상인데 한 번에 절반 넘게 사라짐(#105: 16명 → 2명으로 덮인 사고)
 * - resize: 자리 수가 바뀜
 * - layout-change: 행·열 배열이 바뀜
 * 거래 기록(purchaseHistory)이 서버보다 짧아지면 기록 필드만 빼고 저장해요(historySkipped: 'would-shrink').
 */
export function planEstateMerge(previous, patch, { allowClearOccupants = false, allowCreateSeats = false, requireSeats = false } = {}) {
    const prev = previous && typeof previous === 'object' ? previous : {};
    const src = patch && typeof patch === 'object' ? patch : {};
    const out = {};
    Object.keys(src).forEach((key) => {
        if (key === 'seats') return;
        if (src[key] !== undefined) out[key] = src[key];
    });

    let seatsSkipped = '';
    if (Object.prototype.hasOwnProperty.call(src, 'seats')) {
        const seats = src.seats;
        const prevSeats = prev.seats;
        const prevKnown = Array.isArray(prevSeats) && prevSeats.length > 0;
        if (!Array.isArray(seats) || seats.length === 0) {
            seatsSkipped = 'empty';
        } else if (!prevKnown && !allowCreateSeats) {
            seatsSkipped = 'missing-previous';
        } else if (prevKnown && !allowClearOccupants) {
            const before = countEstateOccupants(prevSeats);
            const after = countEstateOccupants(seats);
            if (before > 0 && after === 0) seatsSkipped = 'would-clear';
            else if (before >= ESTATE_SHRINK_MIN_PREV && after < Math.ceil(before / 2)) seatsSkipped = 'would-shrink';
            else if (seats.length !== prevSeats.length) seatsSkipped = 'resize';
            else if (src.layout && !sameLayout(prev.layout, src.layout)) seatsSkipped = 'layout-change';
            else out.seats = seats;
        } else {
            out.seats = seats;
        }
    }
    // 자리를 막았으면 같이 온 배열(layout)도 쓰지 않아요.
    if (seatsSkipped && Object.prototype.hasOwnProperty.call(out, 'layout')) delete out.layout;

    let historySkipped = '';
    const prevHist = prev.purchaseHistory;
    if (
        Array.isArray(out.purchaseHistory)
        && Array.isArray(prevHist)
        && out.purchaseHistory.length < prevHist.length
        && !allowClearOccupants
    ) {
        delete out.purchaseHistory;
        historySkipped = 'would-shrink';
    }

    if (requireSeats && !Object.prototype.hasOwnProperty.call(out, 'seats')) {
        return { patch: {}, seatsSkipped: seatsSkipped || 'missing', historySkipped, write: false };
    }
    return { patch: out, seatsSkipped, historySkipped, write: Object.keys(out).length > 0 };
}

/* ---------- 자동 백업(#105) ---------- */

/** 백업은 최근 몇 개까지 남길지 */
export const ESTATE_BACKUP_KEEP = 12;
/** 같은 상태를 너무 자주 남기지 않게: 직전 백업과 자리가 같으면 건너뛰어요. */

function seatKey(seats) {
    return JSON.stringify((Array.isArray(seats) ? seats : []).map((s) => [
        s && s.id, s && s.owner ? String(s.owner) : '', s && s.assignee ? String(s.assignee) : '', !!(s && s.hidden), !!(s && s.locked),
    ]));
}

/**
 * 자리를 저장하기 직전, 서버에 있던 자리표를 백업할지 정해요(순수 함수).
 * 앉은 학생이 없는 판이거나 이번 저장이 자리를 바꾸지 않으면 백업하지 않아요.
 * @returns {null | { at:number, reason:string, occupants:number, seats:object[], layout:object|null }}
 */
export function planEstateBackup(previous, nextSeats, { now = Date.now(), reason = '' } = {}) {
    const prev = previous && typeof previous === 'object' ? previous : {};
    if (!Array.isArray(prev.seats) || !prev.seats.length) return null;
    const occupants = countEstateOccupants(prev.seats);
    if (occupants === 0) return null;
    if (Array.isArray(nextSeats) && seatKey(nextSeats) === seatKey(prev.seats)) return null;
    return {
        at: Math.floor(Number(now) || 0),
        reason: String(reason || '').slice(0, 60),
        occupants,
        seats: prev.seats.map((s) => ({ ...s })),
        layout: prev.layout && typeof prev.layout === 'object' ? { rows: Number(prev.layout.rows) || 0, cols: Number(prev.layout.cols) || 0 } : null,
    };
}

/** 백업 목록 맨 앞에 새 백업을 넣고 오래된 것은 버려요. 직전 백업과 자리가 같으면 그대로 둬요. */
export function pushEstateBackup(list, snap, keep = ESTATE_BACKUP_KEEP) {
    const cur = Array.isArray(list) ? list.filter((x) => x && Array.isArray(x.seats)) : [];
    if (!snap) return cur.slice(0, keep);
    if (cur.length && seatKey(cur[0].seats) === seatKey(snap.seats)) return cur.slice(0, keep);
    return [snap, ...cur].slice(0, keep);
}
