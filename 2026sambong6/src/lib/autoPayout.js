/**
 * 신용불량 동안 자동으로 들어오는 보상만 막습니다.
 * 학생이 직접 하는 이체·매도·대출 상환은 여기서 막지 않습니다.
 */

import { isStudentCreditDefault } from './bankLoan.js';
import { findCatalogJobForOwned } from './jobs.js';

/** 직업 목록의 주급을 더합니다. 목록에 없는 직업은 0원입니다. */
export function weeklyJobPay(jobs, catalog) {
    const list = Array.isArray(jobs) ? jobs : [];
    const cat = Array.isArray(catalog) ? catalog : [];
    let pay = 0;
    list.forEach((owned) => {
        const job = findCatalogJobForOwned(owned, cat);
        const n = Math.floor(Number(job && job.pay) || 0);
        if (n > 0) pay += n;
    });
    return pay;
}

/**
 * 그 주의 월요일입니다. 금요일을 넘기면 나흘 전, 일요일이면 엿새 전입니다.
 * 규칙은 이 문자열로 같은 주 주급을 한 번만 받습니다.
 */
export function salaryWeekMonday(date) {
    const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - back);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 이번 주 월요일을 아직 안 받은 학생만 에폭을 1 올립니다.
 * 이미 받았거나, 월요일이 더 미래로 적혀 있으면 그 학생만 건너뜁니다.
 * 한 명의 기록이 반 전체 주급을 실패시키지 않게 하기 위해서입니다.
 */
export function salaryClaimFields(student, monday) {
    const week = String(monday || '');
    const prevWeek = String(student && student.salaryWeek || '');
    const prevEpoch = Math.max(0, Math.floor(Number(student && student.salaryEpoch) || 0));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
        return { claim: false, reason: 'no-week', salaryWeek: prevWeek, salaryEpoch: prevEpoch };
    }
    if (prevWeek === week) {
        return { claim: false, reason: 'already', salaryWeek: prevWeek, salaryEpoch: prevEpoch };
    }
    if (prevWeek > week) {
        return { claim: false, reason: 'future-week', salaryWeek: prevWeek, salaryEpoch: prevEpoch };
    }
    return { claim: true, reason: 'claim', salaryWeek: week, salaryEpoch: prevEpoch + 1 };
}

/**
 * 이번 주 주급을 넣을지 정합니다.
 * 신용불량이면 그 주의 자동 주급은 건너뜁니다.
 */
export function weeklySalaryGrantPlan(student, catalog, todayYmd) {
    const pay = weeklyJobPay(student && student.jobs, catalog);
    if (pay <= 0) return { grant: false, reason: 'no-pay', pay: 0 };
    if (isStudentCreditDefault(student, todayYmd)) {
        return { grant: false, reason: 'credit-default', pay };
    }
    return { grant: true, reason: 'grant', pay };
}

/** 예금 주기 보너스(3일마다 1봉)도 자동 지급이라 신용불량 중에는 넣지 않습니다. */
export function bankBonusBlocked(student, todayYmd) {
    return isStudentCreditDefault(student, todayYmd);
}
