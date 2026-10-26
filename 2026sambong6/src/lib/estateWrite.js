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

/**
 * @returns {{ patch: object, seatsSkipped: string, write: boolean }}
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
        } else if (
            prevKnown
            && countEstateOccupants(prevSeats) > 0
            && countEstateOccupants(seats) === 0
            && !allowClearOccupants
        ) {
            seatsSkipped = 'would-clear';
        } else {
            out.seats = seats;
        }
    }

    if (requireSeats && !Object.prototype.hasOwnProperty.call(out, 'seats')) {
        return { patch: {}, seatsSkipped: seatsSkipped || 'missing', write: false };
    }
    return { patch: out, seatsSkipped, write: Object.keys(out).length > 0 };
}
