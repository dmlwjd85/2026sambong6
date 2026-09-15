/**
 * 삼봉 은행 대출.
 * 적금 만기(30일·설정 이율·반올림)와 연동하되, 상환 이자는 더 세게(1.5배·올림·최소 1봉) 매깁니다.
 * 약정일은 영업일(월~금, 공휴일·방학 제외)입니다.
 */

import { KOREA_2026_FALL_HOLIDAYS, toYmd } from './season2.js';

export const LOAN_MIN_UNIT = 10;
export const LOAN_MIN_INTEREST = 1;
export const LOAN_MAX_BUSINESS_DAYS = 5;
export const LOAN_INTEREST_MULT = 1.5;
export const SAVINGS_PERIOD_DAYS = 30;
export const LOAN_LIMIT_DEFAULT = 50;
export const LOAN_LIMIT_MAX = 500;
export const NEGATIVE_BUSINESS_DAYS_BEFORE_DEFAULT = 5;
export const CREDIT_DEFAULT_CALENDAR_DAYS = 3;

function pad2(n) {
    return String(n).padStart(2, '0');
}

export function ymdFromDate(d = new Date()) {
    return toYmd(d);
}

export function addCalendarDaysYmd(ymd, days) {
    const src = String(ymd || '');
    const [y, m, d] = src.split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(y, m - 1, d + Number(days || 0));
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function sanitizeLoanLimit(raw) {
    if (raw == null || raw === '') return LOAN_LIMIT_DEFAULT;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return LOAN_LIMIT_DEFAULT;
    return Math.max(0, Math.min(LOAN_LIMIT_MAX, n));
}

export function sanitizeLoanAmount(raw) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < LOAN_MIN_UNIT) return 0;
    return Math.floor(n / LOAN_MIN_UNIT) * LOAN_MIN_UNIT;
}

export function sanitizeLoanDays(raw) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return 0;
    return Math.max(1, Math.min(LOAN_MAX_BUSINESS_DAYS, n));
}

function holidaySet(holidays) {
    return new Set((Array.isArray(holidays) ? holidays : KOREA_2026_FALL_HOLIDAYS).map(String));
}

/** 월~금이고 공휴일·방학이 아니면 영업일입니다. */
export function isBankBusinessDay(ymd, calendar = {}) {
    const id = String(ymd || '');
    const [y, m, d] = id.split('-').map(Number);
    if (!y || !m || !d) return false;
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) return false;
    if (holidaySet(calendar.holidays).has(id)) return false;
    const vs = String(calendar.vacationStart || '');
    const ve = String(calendar.vacationEnd || '');
    if (vs && ve && id >= vs && id <= ve) return false;
    return true;
}

/** start 다음날부터 end까지(포함) 영업일 수. 같은 날이면 0. */
export function countBusinessDaysAfter(startYmd, endYmd, calendar = {}) {
    const start = String(startYmd || '');
    const end = String(endYmd || '');
    if (!start || !end || end <= start) return 0;
    let n = 0;
    let cur = addCalendarDaysYmd(start, 1);
    let guard = 0;
    while (cur && cur <= end && guard < 400) {
        if (isBankBusinessDay(cur, calendar)) n += 1;
        cur = addCalendarDaysYmd(cur, 1);
        guard += 1;
    }
    return n;
}

/** 오늘이 영업일이 아니면 다음 영업일부터 셉니다. days영업일 뒤 날짜. */
export function addBusinessDaysYmd(startYmd, days, calendar = {}) {
    const n = sanitizeLoanDays(days);
    let cur = String(startYmd || '');
    let added = 0;
    let guard = 0;
    while (added < n && guard < 400) {
        cur = addCalendarDaysYmd(cur, 1);
        if (isBankBusinessDay(cur, calendar)) added += 1;
        guard += 1;
    }
    return cur;
}

/**
 * 적금 30일 만기 이율과 연동한 대출 이자.
 * (원금 × 이율 × 영업일/30 × 1.5)를 올리고, 최소 1봉입니다.
 */
export function computeLoanInterest(principal, businessDays, ratePercent) {
    const p = sanitizeLoanAmount(principal);
    const d = sanitizeLoanDays(businessDays);
    const rate = Math.max(0, Number(ratePercent) || 0);
    if (p <= 0) return 0;
    const raw = p * (rate / 100) * (d / SAVINGS_PERIOD_DAYS) * LOAN_INTEREST_MULT;
    return Math.max(LOAN_MIN_INTEREST, Math.ceil(raw - 1e-9));
}

export function sanitizeBankLoan(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const principal = sanitizeLoanAmount(raw.principal);
    const days = sanitizeLoanDays(raw.days);
    const startYmd = String(raw.startYmd || '');
    const dueYmd = String(raw.dueYmd || '');
    const interest = Math.max(LOAN_MIN_INTEREST, Math.floor(Number(raw.interest) || 0));
    const id = String(raw.id || '').trim();
    if (!principal || !days || !/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(dueYmd) || !id) {
        return null;
    }
    return {
        id,
        principal,
        interest,
        days,
        startYmd,
        dueYmd,
        rateAtStart: Math.max(0, Number(raw.rateAtStart) || 0),
    };
}

export function loanDueTotal(loan) {
    const clean = sanitizeBankLoan(loan);
    if (!clean) return 0;
    return clean.principal + clean.interest;
}

export function isCreditDefaultOn(state, todayYmd) {
    const until = String(state && state.creditDefaultUntilYmd || '').trim();
    const today = String(todayYmd || '');
    return !!(until && today && today < until);
}

export function creditDefaultBlockMessage(untilYmd) {
    const until = String(untilYmd || '');
    const last = until ? addCalendarDaysYmd(until, -1) : '';
    return last
        ? `신용불량 상태입니다 (${last}까지).\n퀘스트와 추가 경험치를 받을 수 없습니다.`
        : '신용불량 상태입니다.\n퀘스트와 추가 경험치를 받을 수 없습니다.';
}

/**
 * 지갑 → 일반예금 순으로 갚고, 모자라면 지갑을 마이너스로 둡니다.
 * 적금(잠금)은 건드리지 않습니다.
 */
export function collectLoanRepayment({ bong, regular, due }) {
    let wallet = Math.floor(Number(bong) || 0);
    let reg = Math.max(0, Math.floor(Number(regular) || 0));
    let remain = Math.max(0, Math.floor(Number(due) || 0));
    let fromWallet = 0;
    let fromRegular = 0;
    if (remain > 0 && wallet > 0) {
        fromWallet = Math.min(wallet, remain);
        wallet -= fromWallet;
        remain -= fromWallet;
    }
    if (remain > 0 && reg > 0) {
        fromRegular = Math.min(reg, remain);
        reg -= fromRegular;
        remain -= fromRegular;
    }
    if (remain > 0) {
        wallet -= remain;
        fromWallet += remain;
        remain = 0;
    }
    return { bong: wallet, regular: reg, fromWallet, fromRegular };
}

export function takeLoanFailMessage(reason, { limit, unit = 'B' } = {}) {
    const cap = sanitizeLoanLimit(limit);
    if (reason === 'default') return '신용불량 기간에는 대출을 받을 수 없습니다.';
    if (reason === 'active') return '이미 진행 중인 대출이 있습니다. 갚은 뒤에 다시 신청하세요.';
    if (reason === 'disabled') return '현재 학급에서는 대출이 닫혀 있습니다.';
    if (reason === 'amount') return `대출은 ${LOAN_MIN_UNIT}${unit} 단위이며 최소 ${LOAN_MIN_UNIT}${unit}입니다.`;
    if (reason === 'limit') return `1인당 대출 한도는 ${cap}${unit}입니다.`;
    if (reason === 'days') return `대출 기간은 1~${LOAN_MAX_BUSINESS_DAYS}영업일입니다.`;
    if (reason === 'date') return '날짜를 확인할 수 없어 대출을 진행하지 못했습니다.';
    return '대출을 진행할 수 없습니다.';
}

export function repayLoanFailMessage(reason) {
    if (reason === 'none') return '갚을 대출이 없습니다.';
    return '대출을 갚을 수 없습니다.';
}

/** 월드 방학·공휴일을 대출 영업일 달력으로 바꿉니다. */
export function getLoanCalendarFromWorld(worldSettings, holidays = KOREA_2026_FALL_HOLIDAYS) {
    const ws = worldSettings && typeof worldSettings === 'object' ? worldSettings : {};
    const vacationOn = !!ws.vacationEnabled;
    return {
        holidays: Array.isArray(holidays) ? holidays : KOREA_2026_FALL_HOLIDAYS,
        vacationStart: vacationOn ? String(ws.vacationStartDate || '') : '',
        vacationEnd: vacationOn ? String(ws.vacationEndDate || '') : '',
    };
}

export function planTakeLoan({
    existingLoan,
    inDefault,
    amount,
    days,
    ratePercent,
    limit,
    todayYmd,
    calendar,
    nowMs,
} = {}) {
    if (inDefault) return { ok: false, reason: 'default' };
    if (sanitizeBankLoan(existingLoan)) return { ok: false, reason: 'active' };
    const cap = sanitizeLoanLimit(limit);
    if (cap < LOAN_MIN_UNIT) return { ok: false, reason: 'disabled' };
    const principal = sanitizeLoanAmount(amount);
    if (!principal) return { ok: false, reason: 'amount' };
    if (principal > cap) return { ok: false, reason: 'limit' };
    const businessDays = sanitizeLoanDays(days);
    if (!businessDays) return { ok: false, reason: 'days' };
    const today = String(todayYmd || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, reason: 'date' };
    const dueYmd = addBusinessDaysYmd(today, businessDays, calendar);
    const interest = computeLoanInterest(principal, businessDays, ratePercent);
    const stamp = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const loan = {
        id: `loan_${today}_${principal}_${businessDays}_${stamp.toString(36)}`,
        principal,
        interest,
        days: businessDays,
        startYmd: today,
        dueYmd,
        rateAtStart: Math.max(0, Number(ratePercent) || 0),
    };
    return { ok: true, loan, due: principal + interest };
}

export function planRepayLoan(state) {
    const loan = sanitizeBankLoan(state && state.bankLoan);
    if (!loan) return { ok: false, reason: 'none' };
    const due = loanDueTotal(loan);
    const collected = collectLoanRepayment({
        bong: state && state.bong,
        regular: state && state.bankRegularSavings,
        due,
    });
    return { ok: true, loan, due, ...collected };
}

/**
 * 만기 자동이체 + 마이너스 5영업일 → 3일 신용불량.
 */
export function applyLoanLifecycle(state, todayYmd, calendar = {}) {
    const today = String(todayYmd || '');
    const loan0 = sanitizeBankLoan(state && state.bankLoan);
    let bong = Math.floor(Number(state && state.bong) || 0);
    let regular = Math.max(0, Math.floor(Number(state && state.bankRegularSavings) || 0));
    let loan = loan0;
    let defaultUntil = String(state && state.creditDefaultUntilYmd || '').trim();
    let negSince = String(state && state.bankNegativeSinceYmd || '').trim();
    if (negSince && !/^\d{4}-\d{2}-\d{2}$/.test(negSince)) negSince = '';
    if (defaultUntil && !/^\d{4}-\d{2}-\d{2}$/.test(defaultUntil)) defaultUntil = '';
    const msgs = [];
    let changed = false;

    if (loan && today && today >= loan.dueYmd) {
        const due = loanDueTotal(loan);
        const paid = collectLoanRepayment({ bong, regular, due });
        bong = paid.bong;
        regular = paid.regular;
        msgs.push({
            kind: 'repay',
            principal: loan.principal,
            interest: loan.interest,
            due,
            fromWallet: paid.fromWallet,
            fromRegular: paid.fromRegular,
            dueYmd: loan.dueYmd,
        });
        loan = null;
        changed = true;
    }

    if (defaultUntil && today && today >= defaultUntil) {
        defaultUntil = '';
        changed = true;
        msgs.push({ kind: 'default_end' });
    }

    const inDefault = !!(defaultUntil && today && today < defaultUntil);
    if (bong < 0) {
        if (!inDefault) {
            if (!negSince) {
                negSince = today;
                changed = true;
            }
            const elapsed = countBusinessDaysAfter(negSince, today, calendar);
            if (elapsed >= NEGATIVE_BUSINESS_DAYS_BEFORE_DEFAULT) {
                defaultUntil = addCalendarDaysYmd(today, CREDIT_DEFAULT_CALENDAR_DAYS);
                negSince = '';
                changed = true;
                msgs.push({ kind: 'default_start', untilYmd: defaultUntil });
            }
        }
    } else if (negSince) {
        negSince = '';
        changed = true;
    }

    return {
        changed,
        msgs,
        bong,
        bankRegularSavings: regular,
        bankLoan: loan,
        creditDefaultUntilYmd: defaultUntil || '',
        bankNegativeSinceYmd: negSince || '',
    };
}

export function loanFieldsFromLifecycle(result) {
    return {
        bong: result.bong,
        bankRegularSavings: result.bankRegularSavings,
        bankLoan: result.bankLoan,
        creditDefaultUntilYmd: result.creditDefaultUntilYmd || '',
        bankNegativeSinceYmd: result.bankNegativeSinceYmd || '',
    };
}

/**
 * 만기 자동이체 뒤에 대출 실행/중도상환을 서버 기준으로 적용합니다.
 * 클라이언트가 보낸 bankLoan 객체는 믿지 않습니다.
 */
export function applyLoanAction(state, action, opts = {}) {
    const today = String(opts.todayYmd || '');
    const calendar = opts.calendar || {};
    const life = applyLoanLifecycle(state, today, calendar);
    const next = {
        ...loanFieldsFromLifecycle(life),
        msgs: life.msgs.slice(),
        changed: life.changed,
    };
    if (!action) return { ok: true, ...next };
    if (action === 'take') {
        const plan = planTakeLoan({
            existingLoan: next.bankLoan,
            inDefault: isCreditDefaultOn(next, today),
            amount: opts.amount,
            days: opts.days,
            ratePercent: opts.ratePercent,
            limit: opts.limit,
            todayYmd: today,
            calendar,
            nowMs: opts.nowMs,
        });
        if (!plan.ok) return { ok: false, reason: plan.reason, ...next };
        next.bong = Math.floor(Number(next.bong) || 0) + plan.loan.principal;
        next.bankLoan = plan.loan;
        next.changed = true;
        next.msgs.push({ kind: 'take', principal: plan.loan.principal, interest: plan.loan.interest, dueYmd: plan.loan.dueYmd });
        return { ok: true, ...next, loan: plan.loan, due: plan.due };
    }
    if (action === 'repay') {
        const plan = planRepayLoan(next);
        if (!plan.ok) return { ok: false, reason: plan.reason, ...next };
        next.bong = plan.bong;
        next.bankRegularSavings = plan.regular;
        next.bankLoan = null;
        next.changed = true;
        next.msgs.push({
            kind: 'repay_early',
            principal: plan.loan.principal,
            interest: plan.loan.interest,
            due: plan.due,
            fromWallet: plan.fromWallet,
            fromRegular: plan.fromRegular,
        });
        return { ok: true, ...next, due: plan.due };
    }
    return { ok: false, reason: 'action', ...next };
}
