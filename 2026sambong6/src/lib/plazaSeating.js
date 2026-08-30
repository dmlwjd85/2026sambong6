/**
 * 광장 학생 카드를 부동산 자리표(행·열·주인·임시 배치)와 같은 교실 격자로 만듭니다.
 */

/** 자리의 실제 앉은 학생 — 구매 주인(owner)이 있으면 우선, 없으면 임시 배치(assignee) */
export function getEstateSeatOccupantId(seat) {
    if (!seat || seat.hidden === true) return null;
    const owner = seat.owner != null ? String(seat.owner).trim() : '';
    if (owner) return owner;
    const assignee = seat.assignee != null ? String(seat.assignee).trim() : '';
    return assignee || null;
}

/**
 * 부동산 좌석 배열을 광장 셀 목록으로 변환합니다.
 * @returns {{ rows: number, cols: number, cells: Array<{type: string, studentId?: string, seatId: number}>, unseated: string[] }}
 */
export function buildPlazaSeatingPlan({ seats = [], rows, cols, activeStudentIds = [] } = {}) {
    const r = Math.max(1, Math.floor(Number(rows) || 1));
    const c = Math.max(1, Math.floor(Number(cols) || 1));
    const list = Array.isArray(seats) ? seats : [];
    const active = [...new Set((activeStudentIds || []).map((id) => String(id)).filter(Boolean))];
    const activeSet = new Set(active);
    const placed = new Set();
    const cells = [];
    const expected = r * c;

    for (let i = 0; i < expected; i++) {
        const fromList = list.find((s) => s && Number(s.id) === i) || list[i];
        const seat = fromList && typeof fromList === 'object' ? fromList : { id: i, hidden: true };
        const seatId = Number.isFinite(Number(seat.id)) ? Number(seat.id) : i;

        if (seat.hidden === true) {
            cells.push({ type: 'hidden', seatId });
            continue;
        }

        const occ = getEstateSeatOccupantId(seat);
        if (occ && activeSet.has(occ) && !placed.has(occ)) {
            placed.add(occ);
            cells.push({ type: 'student', studentId: occ, seatId });
        } else {
            cells.push({ type: 'empty', seatId });
        }
    }

    const unseated = active.filter((id) => !placed.has(id));
    return { rows: r, cols: c, cells, unseated };
}
