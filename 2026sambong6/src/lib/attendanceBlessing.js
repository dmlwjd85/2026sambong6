/**
 * 출석의 축복. 교사가 하루 한 상태를 고르면 경험치·봉이 달라집니다.
 * 같은 상태를 다시 고르면 그 날 기록을 지우고 보상을 되돌립니다.
 */

export const ATTENDANCE_REWARDS = {
    present: { label: '출석', xp: 8, bong: 1, dim: false },
    late: { label: '지각', xp: -5, bong: 0, dim: false },
    early: { label: '조퇴', xp: -5, bong: 0, dim: true },
    absent: { label: '결석', xp: -10, bong: 0, dim: true },
};

export function attendanceReward(status) {
    return ATTENDANCE_REWARDS[String(status || '')] || null;
}

export function attendanceDimsCard(status) {
    const row = attendanceReward(status);
    return !!(row && row.dim);
}

const ATTENDANCE_DAY_KEEP = 120;

/** 이전 상태를 다음 상태로 바꿀 때 지갑에 더할 값. 같은 상태면 해제입니다. */
export function planAttendanceChange(prevStatus, nextStatus) {
    const nextKey = String(nextStatus || '');
    const prevKey = String(prevStatus || '');
    if (!attendanceReward(nextKey)) return { ok: false, reason: 'status' };
    const clearing = prevKey === nextKey;
    const prev = attendanceReward(prevKey) || { xp: 0, bong: 0 };
    const next = clearing ? { xp: 0, bong: 0, dim: false, label: '' } : attendanceReward(nextKey);
    return {
        ok: true,
        status: clearing ? '' : nextKey,
        xpDelta: next.xp - prev.xp,
        bongDelta: next.bong - prev.bong,
        dim: !clearing && !!next.dim,
        label: clearing ? '' : next.label,
    };
}

/**
 * 서버에 있는 출석부를 기준으로 학생 한 명의 오늘 상태만 바꿉니다.
 * 로컬에 들고 있던 출석부 전체를 덮어쓰면 방금 찍힌 다른 학생 기록이 사라집니다.
 */
export function applyAttendanceDayMark(days, todayYmd, studentId, status) {
    const today = String(todayYmd || '');
    const sid = String(studentId || '');
    const book = {};
    const src = days && typeof days === 'object' ? days : {};
    Object.keys(src).forEach((ymd) => {
        const marks = src[ymd];
        book[ymd] = marks && typeof marks === 'object' ? { ...marks } : {};
    });
    if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        return { ok: false, reason: 'who', days: book };
    }
    const todayMarks = { ...(book[today] || {}) };
    const plan = planAttendanceChange(todayMarks[sid] || '', status);
    if (!plan.ok) return { ok: false, reason: plan.reason, days: book };
    if (plan.status) todayMarks[sid] = plan.status;
    else delete todayMarks[sid];
    book[today] = todayMarks;
    const keys = Object.keys(book).sort();
    keys.slice(0, Math.max(0, keys.length - ATTENDANCE_DAY_KEEP)).forEach((key) => {
        delete book[key];
    });
    return { ok: true, plan, days: book };
}

export function attendanceMarkForToday(mark, todayYmd) {
    if (!mark || typeof mark !== 'object') return '';
    if (String(mark.date || '') !== String(todayYmd || '')) return '';
    return attendanceReward(mark.status) ? String(mark.status) : '';
}

/** 엑셀 한 시트. days 는 { 'YYYY-MM-DD': { studentId: status } } */
export function buildAttendanceSheetRows(days, students) {
    const header = ['날짜', '번호', '이름', '상태', '경험치', '봉'];
    const rows = [header];
    const list = Array.isArray(students) ? students : [];
    const book = days && typeof days === 'object' ? days : {};
    Object.keys(book).sort().forEach((ymd) => {
        const marks = book[ymd] && typeof book[ymd] === 'object' ? book[ymd] : {};
        list.forEach((stu, index) => {
            const sid = String(stu && (stu.id != null ? stu.id : stu) || '');
            if (!sid) return;
            const status = String(marks[sid] || '');
            const reward = attendanceReward(status);
            if (!reward) return;
            rows.push([
                ymd,
                stu.number != null && stu.number !== '' ? stu.number : index + 1,
                stu.name || sid,
                reward.label,
                reward.xp,
                reward.bong,
            ]);
        });
    });
    return rows;
}
