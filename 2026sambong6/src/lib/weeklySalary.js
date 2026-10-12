/**
 * 금요일 주급: 학생 문서의 salaryPaidWeek 로 같은 주에 한 번만 지급합니다.
 * 예전 전역 lastSalaryWeek 만 있는 주는 돈을 다시 넣지 않고 표식만 채웁니다.
 */

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
 * @returns {{ action: 'skip' | 'mark' | 'pay', amount?: number }}
 */
export function planStudentSalaryPayment({ salaryPaidWeek, weekId, legacyWeekSettled, pay }) {
    const id = String(weekId || '');
    if (!id) return { action: 'skip' };
    if (salaryPaidWeek && String(salaryPaidWeek) === id) return { action: 'skip' };
    if (legacyWeekSettled) return { action: 'mark' };
    const amount = Math.round(Number(pay) || 0);
    if (!Number.isFinite(amount) || amount <= 0) return { action: 'mark' };
    return { action: 'pay', amount };
}
