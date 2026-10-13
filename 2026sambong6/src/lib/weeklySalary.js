/**
 * 금요일 주급: 학생 문서의 salaryPaidWeek 로 같은 주에 한 번만 지급합니다.
 * 예전 전역 lastSalaryWeek 만 있는 주는 돈을 다시 넣지 않고 표식만 채웁니다.
 */

/** 한 학생에게 한 번에 넣을 수 있는 주급 상한. Firestore 규칙과 같은 값입니다. */
export const MAX_WEEKLY_SALARY_BONG = 200;

const SALARY_WEEK_RE = /^SALARY_\d{4}_\d{2}_\d{2}$/;

export function isSalaryWeekId(value) {
    return SALARY_WEEK_RE.test(String(value || ''));
}

export function isSalaryPayWindow(date) {
    const day = date.getDay();
    const hours = date.getHours();
    return (day === 5 && hours >= 15) || day === 6 || day === 0;
}

/** 정산 대상 금요일의 주급 키. 토·일은 직전 금요일. */
export function salaryWeekId(date) {
    const d = new Date(date.getTime());
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1);
    else if (day === 0) d.setDate(d.getDate() - 2);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `SALARY_${y}_${m}_${dayNum}`;
}

/**
 * request.time 에 해당하는 최근 주급 키.
 * 지급 창(금 15시~일, 한국 시간)이면 그 금요일, 그 외에는 이미 열린 직전 금요일.
 */
export function recentSalaryWeekId(date) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const day = kst.getUTCDay();
    const hours = kst.getUTCHours();
    const inWindow = (day === 5 && hours >= 15) || day === 6 || day === 0;
    const friday = new Date(kst.getTime());
    if (inWindow) {
        if (day === 6) friday.setUTCDate(friday.getUTCDate() - 1);
        else if (day === 0) friday.setUTCDate(friday.getUTCDate() - 2);
    } else if (day === 5) {
        friday.setUTCDate(friday.getUTCDate() - 7);
    } else {
        friday.setUTCDate(friday.getUTCDate() - (day + 2));
    }
    const y = friday.getUTCFullYear();
    const m = String(friday.getUTCMonth() + 1).padStart(2, '0');
    const d = String(friday.getUTCDate()).padStart(2, '0');
    return `SALARY_${y}_${m}_${d}`;
}

/**
 * @returns {{ action: 'skip' | 'mark' | 'pay', amount?: number }}
 */
export function planStudentSalaryPayment({ salaryPaidWeek, weekId, legacyWeekSettled, pay }) {
    const id = String(weekId || '');
    if (!id || !isSalaryWeekId(id)) return { action: 'skip' };
    if (salaryPaidWeek && String(salaryPaidWeek) === id) return { action: 'skip' };
    if (legacyWeekSettled) return { action: 'mark' };
    const raw = Math.round(Number(pay) || 0);
    const amount = Math.min(MAX_WEEKLY_SALARY_BONG, raw);
    if (!Number.isFinite(amount) || amount <= 0) return { action: 'mark' };
    return { action: 'pay', amount };
}
