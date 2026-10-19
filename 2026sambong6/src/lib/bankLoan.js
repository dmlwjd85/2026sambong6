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
/**
 * 신용불량 기간(달력일) = ceil(부족액 또는 연체액 / 30).
 * 예전에는 연체 후 5영업일 정지, 마이너스는 5영업일이 지난 뒤 3일이었습니다.
 * 지금은 연체나 마이너스가 보이는 그 순간부터 이 공식으로 바로 셉니다.
 * 이미 신용불량인 동안에는 날짜를 다시 밀지 않습니다.
 * 기간이 끝난 뒤에도 이유가 남아 있으면 그날 금액으로 다시 시작합니다.
 * 연체 정지가 끝나면 예전처럼 남은 빚의 50%를 걷고 약정일을 5영업일 뒤로 미룹니다.
 */
export const CREDIT_DEFAULT_UNIT = 30;

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

/** 선생님 기본 한도는 0~500. 학생 한도는 그 위에 예금·적금·지수 가치를 더하므로 500을 넘을 수 있습니다. */
export function normalizeLoanCap(raw) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

/**
 * 대출 한도 = 선생님이 정한 기본값 + 일반예금 + 적금 원금 + 지수 투자 지금 가치.
 * 기본값만 0~500으로 맞추고, 예금·적금·지수 가치의 음수는 0으로 봅니다.
 */
export function personalLoanLimit({
    baseLimit,
    regularSavings = 0,
    termSavings = 0,
    indexValue = 0,
} = {}) {
    const base = sanitizeLoanLimit(baseLimit);
    const deposits = Math.max(0, Math.floor(Number(regularSavings) || 0));
    const savings = Math.max(0, Math.floor(Number(termSavings) || 0));
    const index = Math.max(0, Math.floor(Number(indexValue) || 0));
    return base + deposits + savings + index;
}

/** 부족액·연체액을 30으로 나눈 뒤 올림한 날수. 0 이하면 0일입니다. */
export function creditDefaultDaysFromAmount(amount) {
    const n = Math.abs(Math.floor(Number(amount) || 0));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.ceil(n / CREDIT_DEFAULT_UNIT);
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

/** 이미 빌린 원금은 부분 납입·50% 차감으로 10봉 단위가 깨질 수 있습니다. */
function sanitizeStoredPrincipal(raw) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

export function sanitizeBankLoan(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const principal = sanitizeStoredPrincipal(raw.principal);
    const days = sanitizeLoanDays(raw.days);
    const startYmd = String(raw.startYmd || '');
    const dueYmd = String(raw.dueYmd || '');
    const interest = Math.max(0, Math.floor(Number(raw.interest) || 0));
    const id = String(raw.id || '').trim();
    if ((principal <= 0 && interest <= 0) || !days || !/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(dueYmd) || !id) {
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

/**
 * 갚을 대출 기록이 남아 있는지.
 * 형식이 깨져 정규 대출로 읽히지 않아도, 원금·이자·약정일·아이디가 있으면 남은 대출로 봅니다.
 * 빈 값은 대출이 없는 상태입니다.
 */
export function loanStillOutstanding(raw) {
    if (sanitizeBankLoan(raw)) return true;
    if (!raw || typeof raw !== 'object') return false;
    const principal = Math.floor(Number(raw.principal));
    const interest = Math.floor(Number(raw.interest));
    const due = String(raw.dueYmd || '').trim();
    const id = String(raw.id || '').trim();
    if (Number.isFinite(principal) && principal > 0) return true;
    if (Number.isFinite(interest) && interest > 0) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return true;
    if (id) return true;
    return false;
}

export function loanDueTotal(loan) {
    const clean = sanitizeBankLoan(loan);
    if (!clean) return 0;
    return clean.principal + clean.interest;
}

function isYmd(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

export function isCreditDefaultOn(state, todayYmd) {
    const until = String(state && state.creditDefaultUntilYmd || '').trim();
    const today = String(todayYmd || '');
    return !!(isYmd(until) && isYmd(today) && today < until);
}

/** 대출 연체로 시작한 신용불량입니다. today < until 인 동안 유지됩니다. */
export function isLoanPenaltyActive(state, todayYmd) {
    const until = String(state && state.loanPenaltyUntilYmd || '').trim();
    const today = String(todayYmd || '');
    return !!(until && /^\d{4}-\d{2}-\d{2}$/.test(until) && today && today < until);
}

function walletIsNegative(state) {
    const n = Number(state && state.bong);
    return Number.isFinite(n) && Math.floor(n) < 0;
}

/** 도장이 없어도, 약속한 날이 된 대출은 신용불량으로 봅니다. */
function loanIsOverdue(state, todayYmd) {
    const today = String(todayYmd || '');
    if (!isYmd(today)) return false;
    const raw = state && state.bankLoan;
    if (!loanStillOutstanding(raw)) return false;
    const clean = sanitizeBankLoan(raw);
    const due = String((clean && clean.dueYmd) || (raw && raw.dueYmd) || '').trim();
    return isYmd(due) && today >= due;
}

/**
 * 연체 도장, 마이너스 도장, 지갑 마이너스, 약속한 날이 된 대출 중 하나면 신용불량입니다.
 * 도장이 저장되기 전에도 밥줄과 자동 지급이 같은 기준으로 움직입니다.
 */
export function isStudentCreditDefault(state, todayYmd) {
    return isCreditDefaultOn(state, todayYmd)
        || isLoanPenaltyActive(state, todayYmd)
        || walletIsNegative(state)
        || loanIsOverdue(state, todayYmd);
}

function creditUntilLine(untilYmd) {
    const until = String(untilYmd || '').trim();
    if (!isYmd(until)) return '';
    const last = addCalendarDaysYmd(until, -1);
    return last ? `${last}까지예요.` : '';
}

export function loanPenaltyBlockMessage(untilYmd) {
    const when = creditUntilLine(untilYmd);
    return [
        when ? `신용불량이에요. ${when}` : '신용불량이에요.',
        '빌린 돈을 약속한 날까지 갚지 않아서 그래요.',
        '밥줄에서는 맨 뒤예요. 주급이랑 수업 점수는 자동으로 안 들어와요.',
        '빌린 돈을 다 갚고 지갑이 0 이상이면 바로 풀려요.',
    ].join('\n');
}

export function creditDefaultBlockMessage(untilYmd) {
    const when = creditUntilLine(untilYmd);
    return [
        when ? `신용불량이에요. ${when}` : '신용불량이에요.',
        '지갑이 마이너스이거나, 빌린 돈을 제때 갚지 않았어요.',
        '밥줄에서는 맨 뒤예요. 주급이랑 수업 점수는 자동으로 안 들어와요.',
        '지갑이 다시 0 이상이어도, 적힌 날까지는 신용불량이에요.',
    ].join('\n');
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
    if (reason === 'default') return '신용불량인 동안에는 빌릴 수 없어요.';
    if (reason === 'penalty') return loanPenaltyBlockMessage();
    if (reason === 'active') return '아직 갚지 않은 대출이 있어요. 다 갚은 뒤에 또 빌릴 수 있어요.';
    if (reason === 'disabled') return '지금은 빌릴 수 있는 돈이 없어요.';
    if (reason === 'amount') return `${LOAN_MIN_UNIT}${unit}씩만 빌릴 수 있어요.`;
    if (reason === 'limit') {
        const shown = normalizeLoanCap(limit);
        return `지금 빌릴 수 있는 돈은 ${shown}${unit}예요.\n기본 한도에 예금, 적금, 지수 투자를 더한 값이에요.`;
    }
    if (reason === 'days') return `기간은 학교 가는 날 1일에서 ${LOAN_MAX_BUSINESS_DAYS}일이에요.`;
    if (reason === 'date') return '날짜를 몰라서 지금은 빌릴 수 없어요.';
    return '지금은 빌릴 수 없어요.';
}

export function repayLoanFailMessage(reason) {
    if (reason === 'none') return '갚을 대출이 없어요.';
    if (reason === 'amount') return '1봉 이상, 남은 빚 이하로 적어 주세요.';
    if (reason === 'funds') return '지갑이랑 예금을 합쳐도 그 돈보다 적어요. 있는 만큼만 적어 주세요.';
    return '지금은 갚을 수 없어요.';
}

/** 이자를 먼저 줄이고, 남으면 원금을 줄입니다. 둘 다 0이면 대출이 끝납니다. */
export function reduceLoanByPayment(loan, paidAmount) {
    const clean = sanitizeBankLoan(loan);
    if (!clean) return null;
    let cut = Math.max(0, Math.floor(Number(paidAmount) || 0));
    let interest = clean.interest;
    let principal = clean.principal;
    const fromInterest = Math.min(interest, cut);
    interest -= fromInterest;
    cut -= fromInterest;
    principal = Math.max(0, principal - cut);
    if (principal <= 0 && interest <= 0) return null;
    return { ...clean, principal, interest };
}

function penaltySnapshot(state) {
    const until = String(state && state.loanPenaltyUntilYmd || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : '';
}

/** 월드 방학·공휴일을 대출 영업일 달력으로 바꿉니다. */
export function getLoanCalendarFromWorld(worldSettings, holidays) {
    const ws = worldSettings && typeof worldSettings === 'object' ? worldSettings : {};
    const vacationOn = !!ws.vacationEnabled;
    const fromWorld = Array.isArray(ws.holidays)
        ? ws.holidays.map((h) => (typeof h === 'string' ? h : (h && h.date) || '')).filter(Boolean)
        : KOREA_2026_FALL_HOLIDAYS;
    return {
        holidays: Array.isArray(holidays) ? holidays : fromWorld,
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
    if (loanStillOutstanding(existingLoan)) return { ok: false, reason: 'active' };
    const cap = normalizeLoanCap(limit);
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

/** 가진 돈(지갑+일반예금) 안에서만 일부를 갚습니다. 남은 빚 이상이면 전액입니다. */
export function planPartialRepay(state, amount) {
    const loan = sanitizeBankLoan(state && state.bankLoan);
    if (!loan) return { ok: false, reason: 'none' };
    const due = loanDueTotal(loan);
    const pay = Math.floor(Number(amount) || 0);
    if (pay <= 0 || pay > due) return { ok: false, reason: 'amount' };
    if (pay >= due) {
        const full = planRepayLoan(state);
        if (!full.ok) return full;
        return { ...full, amount: due, left: 0, loan: null, full: true };
    }
    const wallet = Math.floor(Number(state && state.bong) || 0);
    const regular = Math.max(0, Math.floor(Number(state && state.bankRegularSavings) || 0));
    if (Math.max(0, wallet) + regular < pay) return { ok: false, reason: 'funds' };
    const collected = collectLoanRepayment({ bong: wallet, regular, due: pay });
    return {
        ok: true,
        full: false,
        loan: reduceLoanByPayment(loan, pay),
        amount: pay,
        left: due - pay,
        bong: collected.bong,
        regular: collected.regular,
        fromWallet: collected.fromWallet,
        fromRegular: collected.fromRegular,
    };
}

function creditWindowUntil(today, amount) {
    const days = creditDefaultDaysFromAmount(amount);
    if (!days || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return '';
    return addCalendarDaysYmd(today, days);
}

function creditStillOn(until, today) {
    return !!(until && today && today < until);
}

/**
 * 대출을 전부 갚은 뒤의 신용불량.
 * 지갑이 0 이상이면 그 자리에서 끝내, 연체 도장은 갚으면 풀린다는 약속을 지킵니다.
 * 지갑이 아직 마이너스면 기간을 유지하고, 기간이 이미 끝났으면 부족액으로 다시 시작합니다.
 */
function settleCreditAfterLoanCleared(next, today) {
    next.loanPenaltyUntilYmd = '';
    const bong = Math.floor(Number(next.bong) || 0);
    if (bong >= 0) {
        next.creditDefaultUntilYmd = '';
        next.bankNegativeSinceYmd = '';
        return;
    }
    if (!next.bankNegativeSinceYmd) next.bankNegativeSinceYmd = String(today || '');
    if (!creditStillOn(next.creditDefaultUntilYmd, today)) {
        const until = creditWindowUntil(today, Math.abs(bong));
        if (until) {
            next.creditDefaultUntilYmd = until;
            next.msgs.push({
                kind: 'default_start',
                untilYmd: until,
                amount: Math.abs(bong),
                days: creditDefaultDaysFromAmount(Math.abs(bong)),
            });
        }
    }
}

/**
 * 신용불량 시작: 대출 약정일을 넘겼거나 지갑이 마이너스인 그 순간.
 * 기간은 ceil(연체액 또는 부족액 / 30) 달력일입니다. 둘 다이면 더 큰 금액으로 셉니다.
 * 이미 신용불량인 동안에는 시계를 다시 돌리지 않습니다.
 * 연체로 시작한 정지가 끝나면 남은 빚의 50%를 걷고, 약정일은 5영업일 뒤로 미룹니다.
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

    let penaltyUntil = penaltySnapshot(state);
    if (!loan) penaltyUntil = '';

    if (defaultUntil && today && today >= defaultUntil) {
        defaultUntil = '';
        changed = true;
        msgs.push({ kind: 'default_end' });
    }

    if (loan && today && today >= loan.dueYmd) {
        const inFreeze = !!(penaltyUntil && today < penaltyUntil);
        const freezeEnded = !!(penaltyUntil && today >= penaltyUntil);
        if (inFreeze) {
            // 신용불량 기간입니다. 빚과 약정일은 그대로 둡니다.
        } else if (freezeEnded) {
            const due = loanDueTotal(loan);
            const charge = Math.ceil(due / 2);
            const paid = collectLoanRepayment({ bong, regular, due: charge });
            bong = paid.bong;
            regular = paid.regular;
            const left = reduceLoanByPayment(loan, charge);
            const nextDue = addBusinessDaysYmd(today, 5, calendar);
            msgs.push({
                kind: 'penalty_half',
                due,
                charge,
                fromWallet: paid.fromWallet,
                fromRegular: paid.fromRegular,
                nextDue,
            });
            loan = left ? { ...left, dueYmd: nextDue, days: 5 } : null;
            penaltyUntil = '';
            changed = true;
        } else {
            const due = loanDueTotal(loan);
            const shortfall = bong < 0 ? Math.abs(bong) : 0;
            const amount = Math.max(due, shortfall);
            const until = creditWindowUntil(today, amount);
            if (until) {
                penaltyUntil = until;
                defaultUntil = until;
                msgs.push({
                    kind: 'penalty_start',
                    untilYmd: until,
                    dueYmd: loan.dueYmd,
                    amount,
                    days: creditDefaultDaysFromAmount(amount),
                });
                changed = true;
            }
        }
    }

    if (loan && creditStillOn(penaltyUntil, today) && (!defaultUntil || defaultUntil < penaltyUntil)) {
        defaultUntil = penaltyUntil;
        changed = true;
    }

    if (bong < 0) {
        if (!negSince) {
            negSince = today;
            changed = true;
        }
        if (!creditStillOn(defaultUntil, today)) {
            const until = creditWindowUntil(today, Math.abs(bong));
            if (until) {
                defaultUntil = until;
                changed = true;
                msgs.push({
                    kind: 'default_start',
                    untilYmd: until,
                    amount: Math.abs(bong),
                    days: creditDefaultDaysFromAmount(Math.abs(bong)),
                });
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
        loanPenaltyUntilYmd: loan ? (penaltyUntil || '') : '',
    };
}

export function loanFieldsFromLifecycle(result) {
    return {
        bong: result.bong,
        bankRegularSavings: result.bankRegularSavings,
        bankLoan: result.bankLoan,
        creditDefaultUntilYmd: result.creditDefaultUntilYmd || '',
        bankNegativeSinceYmd: result.bankNegativeSinceYmd || '',
        loanPenaltyUntilYmd: result.loanPenaltyUntilYmd || '',
    };
}

/** 거절할 때 약정일과 잔액을 그대로 둡니다. */
function rejectLoanAction(state, reason) {
    return {
        ok: false,
        reason,
        changed: false,
        msgs: [],
        bong: Math.floor(Number(state && state.bong) || 0),
        bankRegularSavings: Math.max(0, Math.floor(Number(state && state.bankRegularSavings) || 0)),
        bankLoan: state && state.bankLoan ? state.bankLoan : null,
        creditDefaultUntilYmd: String(state && state.creditDefaultUntilYmd || ''),
        bankNegativeSinceYmd: String(state && state.bankNegativeSinceYmd || ''),
        loanPenaltyUntilYmd: penaltySnapshot(state),
    };
}

/**
 * 만기 자동이체 뒤에 대출 실행/중도상환을 서버 기준으로 적용합니다.
 * 클라이언트가 보낸 bankLoan 객체는 믿지 않습니다.
 * 갚을 대출이 있으면 새 대출로 약정일을 바꾸지 않습니다.
 */
export function applyLoanAction(state, action, opts = {}) {
    const today = String(opts.todayYmd || '');
    const calendar = opts.calendar || {};
    // 약정일 자동이체가 대출을 지운 뒤에 같은 요청으로 다시 빌리면 납부일이 밀립니다.
    if (action === 'take' && loanStillOutstanding(state && state.bankLoan)) {
        const reason = isStudentCreditDefault(state, today) ? 'default' : 'active';
        return rejectLoanAction(state, reason);
    }
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
            inDefault: isStudentCreditDefault(next, today),
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
        settleCreditAfterLoanCleared(next, today);
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
    if (action === 'partial') {
        const plan = planPartialRepay(next, opts.amount);
        if (!plan.ok) return { ok: false, reason: plan.reason, ...next };
        next.bong = plan.bong;
        next.bankRegularSavings = plan.regular;
        next.bankLoan = plan.loan;
        if (!plan.loan) settleCreditAfterLoanCleared(next, today);
        next.changed = true;
        next.msgs.push({
            kind: 'repay_partial',
            amount: plan.amount,
            left: plan.left,
            fromWallet: plan.fromWallet,
            fromRegular: plan.fromRegular,
        });
        return { ok: true, ...next, due: plan.left, amount: plan.amount };
    }
    return { ok: false, reason: 'action', ...next };
}
