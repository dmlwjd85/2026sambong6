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
