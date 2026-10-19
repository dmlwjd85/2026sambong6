/**
 * 삼봉 은행 대출.
 * 적금 만기(30일·설정 이율·반올림)와 연동하되, 상환 이자는 더 세게(1.5배·올림·최소 1봉) 매깁니다.
 * 약정일은 영업일(월~금, 공휴일·방학 제외)입니다.
 */

import { isSchoolDayYmd, lunchAlreadyRecorded, weekdayOfYmd } from './schoolClock.js';
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
 * 기간은 시작할 때 정한 종료일까지이고, 그 안의 점심값으로 늘어나지 않습니다.
 * 종료일이 되면 빚이 남거나 지갑이 마이너스여도 신용불량만 풉니다. 남은 빚은 그대로입니다.
 * 절반을 걷던 규칙은 남은 빚을 그대로 둔다는 결정과 맞지 않아 뺐습니다.
 * 풀린 뒤 같은 대출·같은 마이너스로는 다시 걸리지 않습니다.
 * 다시 걸리는 경우는 둘뿐입니다.
 * 1) 해제 뒤에 새로 받은 대출이 연체될 때
 * 2) 지갑이 0 이상으로 회복했다가 다시 마이너스가 될 때
 * 만기일에는 일반예금을 먼저 쓰고, 그다음 점심값을 남긴 지갑으로 한 번 갚습니다.
 * 점심값을 남기느라 못 갚은 금액은 신용불량으로 세지 않습니다.
 */
export const CREDIT_DEFAULT_UNIT = 30;
/** 신용불량 기간은 달력일 기준이고, 한 번에 60일을 넘기지 않습니다. */
export const CREDIT_DEFAULT_MAX_DAYS = 60;
/** 평일 점심값. 60일 시뮬레이션에서 같은 값을 씁니다. */
export const LUNCH_FEE_BONG = 10;

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
    return Math.min(CREDIT_DEFAULT_MAX_DAYS, Math.ceil(n / CREDIT_DEFAULT_UNIT));
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

/** 월~금이고 공휴일·방학이 아니면 영업일입니다. 휴일은 점심값과 같은 목록입니다. */
export function isBankBusinessDay(ymd, calendar = {}) {
    const cal = calendar || {};
    return isSchoolDayYmd(ymd, {
        holidays: cal.holidays,
        vacationStart: cal.vacationStart,
        vacationEnd: cal.vacationEnd,
    });
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

function releasedYmdOf(state) {
    const ymd = String(state && state.creditReleasedYmd || '').trim();
    return isYmd(ymd) ? ymd : '';
}

function releaseLoanIdOf(state) {
    return String(state && state.creditReleaseLoanId || '').trim();
}

/** 해제 뒤에 지갑이 0 이상으로 올라온 적이 있는지. */
function walletRecoveredSinceRelease(state) {
    return !!(state && state.creditWalletRecovered === true);
}

/**
 * 마이너스가 새 사유인지.
 * 한 번도 풀린 적이 없거나, 풀린 뒤 0 이상으로 회복했다가 다시 내려간 경우입니다.
 * 풀릴 때 이미 마이너스였고 그 뒤로 0을 못 넘겼으면 같은 마이너스입니다.
 */
function negativeIsFreshCause(state) {
    if (!walletIsNegative(state)) return false;
    if (!releasedYmdOf(state)) return true;
    return walletRecoveredSinceRelease(state);
}

/** 만기 처리를 아직 안 했는데, 지갑과 일반예금으로 남은 빚을 다 갚을 수 있는지. */
function unhandledOverdueCanBeCovered(state) {
    const raw = state && state.bankLoan;
    const clean = sanitizeBankLoan(raw);
    if (!clean) return false;
    const id = String(clean.id || '').trim();
    const dueYmd = String(clean.dueYmd || '').trim();
    const handleKey = `${id}|${dueYmd}`;
    if (String(state && state.loanDueHandledKey || '') === handleKey) return false;
    const due = loanDueTotal(clean);
    const wallet = Math.max(0, Math.floor(Number(state && state.bong) || 0));
    const regular = Math.max(0, Math.floor(Number(state && state.bankRegularSavings) || 0));
    return wallet + regular >= due;
}

/** 연체가 새 사유인지. 해제 때 적어 둔 대출과 같은 빚이면 아닙니다. */
function overdueIsFreshCause(state, todayYmd) {
    if (!loanIsOverdue(state, todayYmd)) return false;
    const raw = state && state.bankLoan;
    const clean = sanitizeBankLoan(raw);
    const id = String((clean && clean.id) || (raw && raw.id) || '').trim();
    const releasedId = releaseLoanIdOf(state);
    if (releasedId && id === releasedId) return false;
    if (lunchShieldCoversLoan(state, clean)) return false;
    if (unhandledOverdueCanBeCovered(state)) return false;
    return true;
}

/** 점심값을 남기느라 남은 빚이면 연체로 보지 않습니다. */
export function lunchShieldCoversLoan(state, loan) {
    const clean = loan || sanitizeBankLoan(state && state.bankLoan);
    if (!clean) return false;
    const id = String(clean.id || '').trim();
    const shieldId = String(state && state.loanLunchShieldLoanId || '').trim();
    const shieldAmt = Math.max(0, Math.floor(Number(state && state.loanLunchShieldAmount) || 0));
    if (!shieldId || id !== shieldId || shieldAmt <= 0) return false;
    return loanDueTotal(clean) <= shieldAmt;
}

/**
 * 신용불량 도장이 살아 있거나, 해제 뒤의 새 사유(새 연체·다시 난 마이너스)가 있으면 신용불량입니다.
 * 기간이 끝난 같은 빚·같은 마이너스는 신용불량이 아닙니다.
 */
export function isStudentCreditDefault(state, todayYmd) {
    return isCreditDefaultOn(state, todayYmd)
        || isLoanPenaltyActive(state, todayYmd)
        || negativeIsFreshCause(state)
        || overdueIsFreshCause(state, todayYmd);
}

function creditUntilLine(untilYmd) {
    const until = String(untilYmd || '').trim();
    if (!isYmd(until)) return '';
    const parts = until.split('-').map(Number);
    const month = parts[1];
    const day = parts[2];
    if (!month || !day) return '';
    return `${month}월 ${day}일에 풀려요.`;
}

export function loanPenaltyBlockMessage(untilYmd) {
    const when = creditUntilLine(untilYmd);
    return [
        when ? `신용불량이에요. ${when}` : '신용불량이에요.',
        '밥줄에서는 맨 뒤예요. 주급이랑 수업 점수는 자동으로 안 들어와요.',
        '약속한 날 다 갚지 못해서 그래요. 남은 빚은 그대로예요.',
        '이 빚 때문에 다시 신용불량이 되지는 않아요. 새로 빌린 돈이 약속한 날을 넘기면 다시 걸려요.',
        '빌린 돈을 다 갚고 지갑이 0 이상이면 그 자리에서 풀려요.',
    ].join('\n');
}

export function creditDefaultBlockMessage(untilYmd, unit = 'B') {
    const when = creditUntilLine(untilYmd);
    const shown = String(unit || 'B');
    return [
        when ? `신용불량이에요. ${when}` : '신용불량이에요.',
        '밥줄에서는 맨 뒤예요. 주급이랑 수업 점수는 자동으로 안 들어와요.',
        `지갑이 마이너스라서 그래요. 부족한 30${shown}마다 1일이에요.`,
        '점심값이 더 빠져도 기간은 늘어나지 않아요. 끝나는 날 아침이면 마이너스여도 풀려요.',
        '이 마이너스 때문에 다시 신용불량이 되지는 않아요. 지갑이 0 이상이 됐다가 다시 마이너스가 되면 다시 걸려요.',
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

/**
 * 만기일에 있는 돈만 갚습니다. 지갑을 마이너스로 만들지 않고, 적금은 쓰지 않습니다.
 */
export function collectAvailableRepayment({ bong, regular, due }) {
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
    return {
        bong: wallet,
        regular: reg,
        fromWallet,
        fromRegular,
        paid: fromWallet + fromRegular,
        unpaid: remain,
    };
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
    if (reason === 'settled') return '오늘 빌린 돈을 있는 만큼 갚았어요. 오늘은 새로 빌릴 수 없어요.';
    if (reason === 'date') return '날짜를 몰라서 지금은 빌릴 수 없어요.';
    return '지금은 빌릴 수 없어요.';
}

export function repayLoanFailMessage(reason) {
    if (reason === 'none') return '갚을 대출이 없어요.';
    if (reason === 'amount') return '1 이상, 남은 빚 이하로 적어 주세요.';
    if (reason === 'funds') return '지금 가진 돈으로는 그만큼 갚을 수 없어요.';
    if (reason === 'lunch') return '점심값을 남겨 둘게요. 그래서 지금은 갚을 수 없어요.';
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

const LUNCH_WEEKDAY = ['', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

/** 괄호·문장부호는 건너뛰고, 소리 나는 마지막 글자를 고릅니다. */
function lastSpokenChar(text) {
    const src = String(text || '');
    for (let i = src.length - 1; i >= 0; i -= 1) {
        const ch = src[i];
        if (/[\s()[\]{}.,!?…·'"“”‘’~]/.test(ch)) continue;
        return ch;
    }
    return '';
}

function hangulBatchim(ch) {
    const code = String(ch || '').charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return null;
    return (code - 0xac00) % 28 !== 0;
}

function lunchParticle(unit) {
    const batchim = hangulBatchim(lastSpokenChar(unit || 'B'));
    if (batchim == null) return '를';
    return batchim ? '을' : '를';
}

/** 확인창에 남기는 점심값. 금요일은 월요일 점심값처럼 다음 등교일 이름을 씁니다. */
export function formatLunchHoldSentence(parts, unit = 'B') {
    const list = (Array.isArray(parts) ? parts : []).filter((part) => part && part.amount > 0);
    if (!list.length) return '';
    const shown = String(unit || 'B');
    const body = list.map((part) => `${part.label} ${part.amount}${shown}`).join(', ');
    return `${body}${lunchParticle(shown)} 남겨 둘게요.`;
}

export function koreanTopicParticle(text) {
    return topicParticle(text);
}

/** 날짜 끝소리에 맞춰 '예요' 또는 '이에요'를 붙입니다. 요일 괄호 안 글자도 봅니다. */
export function koreanCopula(text) {
    const batchim = hangulBatchim(lastSpokenChar(text));
    if (batchim == null) return '이에요';
    return batchim ? '이에요' : '예요';
}

function topicParticle(unit) {
    const batchim = hangulBatchim(lastSpokenChar(unit || 'B'));
    if (batchim == null) return '는';
    return batchim ? '은' : '는';
}

/** 지난 약속일을 남은 날처럼 말하지 않습니다. */
export function formatPastPromiseLine(dueLabel) {
    const when = String(dueLabel || '').trim();
    if (!when) return '약속한 날이 지났어요.';
    return `약속한 날이 지났어요. 그날은 ${when}${koreanCopula(when)}.`;
}

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-10-23 → 10월 23일(금). 확인창이 날짜 한가운데서 끊기지 않게 짧게 씁니다. */
export function formatPromiseDay(ymd) {
    const src = String(ymd || '');
    if (!isYmd(src)) return '';
    const parts = src.split('-').map(Number);
    const month = parts[1];
    const day = parts[2];
    const weekday = weekdayOfYmd(src);
    const mark = weekday == null ? '' : `(${WEEKDAY_SHORT[weekday]})`;
    return `${month}월 ${day}일${mark}`;
}

/** 남은 것이 빚이라는 것을 먼저 말합니다. done이면 이미 갚은 뒤의 말투입니다. */
export function formatDebtLeftSentence(left, dueYmd, unit = 'B', opts = {}) {
    const shown = String(unit || 'B');
    const amount = Math.max(0, Math.floor(Number(left) || 0));
    const topic = topicParticle(shown);
    const when = formatPromiseDay(dueYmd);
    const done = !!(opts && opts.done);
    const today = String((opts && opts.todayYmd) || '');
    const past = !!(opts && opts.past) || (!!(today && dueYmd) && today > String(dueYmd));
    const lines = [done ? `이제 빚이 ${amount}${shown} 남았어요.` : `그러면 빚이 ${amount}${shown} 남아요.`];
    if (past) lines.push(formatPastPromiseLine(when));
    else if (when) lines.push(`이 ${amount}${shown}${topic} ${when}까지 갚으면 돼요.`);
    return lines.join('\n');
}

/** 주급에서 점심 빚을 걷었을 때 학생에게 보여주는 문장입니다. */
export function formatSalaryCollectionNotice({ salary = 0, collected = 0, left = 0, unit = 'B' } = {}) {
    const shown = String(unit || 'B');
    const pay = Math.max(0, Math.floor(Number(salary) || 0));
    const took = Math.max(0, Math.floor(Number(collected) || 0));
    const remain = Math.max(0, Math.floor(Number(left) || 0));
    const lines = [];
    if (pay > 0) lines.push(`주급 ${pay}${shown}가 들어왔어요.`);
    if (took > 0 && remain > 0) {
        lines.push(`점심값으로 남겨 둔 빚 ${took}${shown}${lunchParticle(shown)} 주급에서 갚았어요. 남은 빚은 ${remain}${shown}예요.`);
    } else if (took > 0) {
        lines.push(`점심값으로 남겨 둔 빚 ${took}${shown}${lunchParticle(shown)} 주급에서 다 갚았어요.`);
    }
    return lines.join('\n');
}

/**
 * 점심값 때문에 적은 돈보다 덜 갚을 때 이유를 한 줄로 말합니다.
 * 세 번째 값은 적게 갚는 차이이고, 점심값 자체가 아닙니다.
 * 점심값 금액은 lunch에 숫자나 점심 칸 목록으로 넘깁니다.
 */
export function formatWithheldLunchLine(requested, amount, withheld, unit = 'B', lunch) {
    const ask = Math.floor(Number(requested) || 0);
    const pay = Math.floor(Number(amount) || 0);
    const held = Math.max(0, Math.floor(Number(withheld) || 0));
    if (held <= 0 || ask <= pay) return '';
    const shown = String(unit || 'B');
    const parts = (Array.isArray(lunch) ? lunch : []).filter((part) => part && Math.floor(Number(part.amount) || 0) > 0);
    if (parts.length === 1) {
        const only = parts[0];
        const need = Math.floor(Number(only.amount) || 0);
        const label = String(only.label || '점심값').trim() || '점심값';
        return `${label} ${need}${shown}${lunchParticle(shown)} 남기려고 ${pay}${shown}만 갚아요.`;
    }
    if (parts.length > 1) {
        const body = parts.map((part) => `${part.label} ${Math.floor(Number(part.amount) || 0)}${shown}`).join(', ');
        return `${body}${lunchParticle(shown)} 남기려고 ${pay}${shown}만 갚아요.`;
    }
    const need = Math.max(0, Math.floor(Number(lunch) || 0));
    if (need > 0) return `점심값 ${need}${shown}${lunchParticle(shown)} 남기려고 ${pay}${shown}만 갚아요.`;
    return `점심값을 남기려고 ${pay}${shown}만 갚아요.`;
}

/** 확인창용. 남기는 점심값은 지갑에 둔다고 말합니다. done이면 이미 남겨 둔 뒤입니다. */
export function formatLunchWalletSentence(parts, unit = 'B', opts = {}) {
    const list = (Array.isArray(parts) ? parts : []).filter((part) => part && part.amount > 0);
    if (!list.length) return '';
    const shown = String(unit || 'B');
    const verb = opts && opts.done ? '남겨 뒀어요.' : '남겨 둘게요.';
    if (list.length === 1) {
        const only = list[0];
        return `${only.label} ${only.amount}${shown}${topicParticle(shown)} 지갑에 ${verb}`;
    }
    const body = list.map((part) => `${part.label} ${part.amount}${shown}`).join(', ');
    return `${body}${lunchParticle(shown)} 지갑에 ${verb}`;
}

/** 다음 등교일 점심. 전부 갚기 계산에는 쓰지 않고, 경고 문장에만 씁니다. */
export function nextSchoolLunchPart(todayYmd, calendar, lastLunchDeductDate) {
    const parts = schoolLunchParts(todayYmd, calendar, lastLunchDeductDate);
    return parts.find((part) => part && part.kind === 'next') || null;
}

function lunchDayWord(todayYmd, part) {
    if (!part) return '다음 등교일';
    const tomorrow = addCalendarDaysYmd(todayYmd, 1);
    if (tomorrow && part.ymd === tomorrow) return '내일';
    const name = String(part.label || '').replace(/\s*점심값\s*$/, '').trim();
    return name || '다음 등교일';
}

/**
 * 전부 갚은 뒤 지갑으로 오늘(아직 안 냈으면)과 다음 등교일 점심값을 낼 수 있는지 알립니다.
 * 오늘 몫도 모자라면 오늘 점심값만 말하고, 오늘은 되지만 다음 날이 모자라면 둘 다 말합니다.
 * 이미 낸 뒤에는 다음 등교일만 봅니다. 돈이 충분하면 빈 문자열입니다.
 * 날짜와 휴일은 schoolLunchParts가 쓰던 서버 날짜·휴일 목록 그대로입니다.
 */
export function formatClearLunchWarning({
    walletAfter = 0,
    todayYmd = '',
    calendar,
    lastLunchDeductDate,
    nextLunch = null,
    unit = 'B',
} = {}) {
    const parts = schoolLunchParts(todayYmd, calendar, lastLunchDeductDate);
    const todayPart = parts.find((part) => part && part.kind === 'today' && part.amount > 0) || null;
    const foundNext = parts.find((part) => part && part.kind === 'next' && part.amount > 0) || null;
    const nextPart = nextLunch && nextLunch.amount > 0 ? nextLunch : foundNext;
    const todayNeed = todayPart ? Math.floor(Number(todayPart.amount) || 0) : 0;
    const nextNeed = nextPart ? Math.floor(Number(nextPart.amount) || 0) : 0;
    const left = Math.floor(Number(walletAfter) || 0);
    const shown = String(unit || 'B');
    let when = '';
    let need = 0;
    let both = false;
    if (todayNeed > 0 && left < todayNeed) {
        when = '오늘';
        need = todayNeed;
    } else if (todayNeed > 0 && nextNeed > 0 && left < todayNeed + nextNeed) {
        when = `오늘이랑 ${lunchDayWord(todayYmd, nextPart)}`;
        need = todayNeed + nextNeed;
        both = true;
    } else if (nextNeed > 0 && left < nextNeed) {
        when = lunchDayWord(todayYmd, nextPart);
        need = nextNeed;
    }
    if (need <= 0 || !when) return '';
    const walletText = left <= 0
        ? `지갑이 0${shown}가 돼서`
        : `지갑이 ${left}${shown}만 남아서`;
    const all = both ? '다 ' : '';
    return `다 갚으면 ${walletText} ${when} 점심값 ${need}${shown}${lunchParticle(shown)} ${all}못 낼 수 있어요. 걱정되면 '점심값만 남기고 갚기'를 눌러 주세요.`;
}

export function formatClearRepayConfirm(amount, unit = 'B', opts = {}) {
    const shown = String(unit || 'B');
    const pay = Math.max(0, Math.floor(Number(amount) || 0));
    const lines = [
        `지갑에서 ${pay}${shown}${lunchParticle(shown)} 모두 갚을까요?`,
        '빚은 0이 돼요.',
    ];
    const warning = formatClearLunchWarning({ ...(opts || {}), unit: shown });
    if (warning) lines.push(warning);
    else lines.push('다음 점심값은 따로 남겨 두지 않아요.');
    return lines.join('\n');
}

/** 대출이 있을 때 굵은 안내. 점심 빚의 약속일이 지났으면 위 칸과 같은 말로 바꿉니다. */
export function formatExistingLoanPreview(dueYmd, opts = {}) {
    const dueLabel = formatPromiseDay(dueYmd) || String(dueYmd || '');
    const today = String((opts && opts.todayYmd) || '');
    const past = !!(today && dueYmd && today > String(dueYmd));
    if (past && opts && opts.shielded) {
        return `${formatPastPromiseLine(dueLabel)} 주급을 받을 때 조금씩 갚아요. 신용불량은 아니에요.`;
    }
    return `약속한 날 ${dueLabel}. 그날 지갑과 예금에 있는 돈으로 먼저 갚아요. 점심값으로 남겨 둔 빚은 신용불량이 아니고 주급에서 갚아요. 그보다 많이 모자라면 신용불량이 돼요.`;
}

/** 전부 갚기 완료창. 확인창의 「돼요」와 맞춰 「이제」로 말합니다. */
export function formatClearRepayDone(amount, unit = 'B') {
    const shown = String(unit || 'B');
    const pay = Math.max(0, Math.floor(Number(amount) || 0));
    return `${pay}${shown}${lunchParticle(shown)} 모두 갚았어요. 이제 빚은 0이에요.`;
}

export function formatKeepLunchConfirm({
    amount = 0,
    left = 0,
    dueYmd = '',
    todayYmd = '',
    lunchParts = [],
    unit = 'B',
} = {}) {
    const shown = String(unit || 'B');
    const pay = Math.max(0, Math.floor(Number(amount) || 0));
    const remain = Math.max(0, Math.floor(Number(left) || 0));
    const lines = [`${pay}${shown}${lunchParticle(shown)} 갚을까요?`];
    if (remain > 0) lines.push(formatDebtLeftSentence(remain, dueYmd, shown, { todayYmd }));
    else lines.push('빚은 0이 돼요.');
    const hold = formatLunchWalletSentence(lunchParts, shown);
    if (hold) lines.push(hold);
    return lines.join('\n');
}

/** 점심값만 남기고 갚은 뒤. 확인창의 「그러면」 자리에 「이제」를 씁니다. */
export function formatKeepLunchDone({
    amount = 0,
    left = 0,
    dueYmd = '',
    todayYmd = '',
    lunchParts = [],
    unit = 'B',
} = {}) {
    const shown = String(unit || 'B');
    const pay = Math.max(0, Math.floor(Number(amount) || 0));
    const remain = Math.max(0, Math.floor(Number(left) || 0));
    const lines = [`${pay}${shown}${lunchParticle(shown)} 갚았어요.`];
    if (remain > 0) lines.push(formatDebtLeftSentence(remain, dueYmd, shown, { done: true, todayYmd }));
    else lines.push('이제 빚은 0이에요.');
    const hold = formatLunchWalletSentence(lunchParts, shown, { done: true });
    if (hold) lines.push(hold);
    return lines.join('\n');
}

/** 일부 갚기 완료창. */
export function formatPartialRepayDone({
    amount = 0,
    left = 0,
    dueYmd = '',
    todayYmd = '',
    lunchParts = [],
    unit = 'B',
} = {}) {
    const shown = String(unit || 'B');
    const pay = Math.max(0, Math.floor(Number(amount) || 0));
    const remain = Math.max(0, Math.floor(Number(left) || 0));
    const hold = formatLunchWalletSentence(lunchParts, shown, { done: true });
    if (remain <= 0) {
        const head = `${pay}${shown}${lunchParticle(shown)} 모두 갚았어요. 이제 빚은 0이에요.`;
        return hold ? `${head}\n${hold}` : head;
    }
    const lines = [
        `${pay}${shown}${lunchParticle(shown)} 갚았어요.`,
        formatDebtLeftSentence(remain, dueYmd, shown, { done: true, todayYmd }),
    ];
    if (hold) lines.push(hold);
    return lines.join('\n');
}

/** 점심값을 남겨야 해서 일부 갚기가 거절될 때. 금액이 문장에 들어갑니다. */
export function formatLunchRepayBlocked(parts, unit = 'B') {
    const list = (Array.isArray(parts) ? parts : []).filter((part) => part && part.amount > 0);
    const shown = String(unit || 'B');
    if (!list.length) return '점심값을 남겨 둬야 해서, 지금은 갚을 수 없어요.';
    if (list.length === 1) {
        const only = list[0];
        return `${only.label} ${only.amount}${shown}${lunchParticle(shown)} 남겨 둬야 해서, 지금은 갚을 수 없어요.`;
    }
    const body = list.map((part) => `${part.label} ${part.amount}${shown}`).join(', ');
    return `${body}${lunchParticle(shown)} 남겨 둬야 해서, 지금은 갚을 수 없어요.`;
}

/**
 * 만기일에 자동으로 갚았을 때 학생에게 보여주는 문장.
 * 금액은 호출하는 쪽이 넘긴 갚은 돈·남은 빚·남겨 둔 점심값으로 만듭니다.
 */
export function formatDueDayRepaySentence(msg, unit = 'B') {
    const paid = Math.max(0, Math.floor(Number(msg && msg.paid) || 0));
    const unpaid = Math.max(0, Math.floor(Number(msg && msg.unpaid) || 0));
    const shown = String(unit || 'B');
    const parts = (Array.isArray(msg && msg.lunchParts) ? msg.lunchParts : []).filter((part) => part && part.amount > 0);
    const paidText = `${paid}${shown}${lunchParticle(shown)}`;
    if (unpaid <= 0) {
        return `오늘이 갚기로 한 날이라 빌린 돈 ${paidText} 다 갚았어요.`;
    }
    let held = '';
    if (parts.length >= 2 && parts.every((part) => part.amount === parts[0].amount)) {
        const names = parts.map((part) => String(part.label || '점심').replace(/\s*점심값\s*$/, '').trim() || '점심');
        const rest = names.slice(1).join(', ');
        held = `${names[0]}이랑 ${rest} 점심값 ${parts[0].amount}${shown}씩은 남겨 뒀고, `;
    } else if (parts.length === 1) {
        const only = parts[0];
        held = `${only.label} ${only.amount}${shown}${topicParticle(shown)} 남겨 뒀고, `;
    }
    return `오늘이 갚기로 한 날이라 ${paidText} 먼저 갚았어요. ${held}빚은 ${unpaid}${shown} 남았어요.`;
}

/**
 * 오늘 점심값이 아직 안 빠졌으면 그것도 남기고, 다음 등교일 점심값도 남깁니다.
 * 날짜를 모르면 남기지 않습니다.
 */
function schoolLunchParts(todayYmd, calendar, lastLunchDeductDate) {
    const today = String(todayYmd || '');
    if (!isYmd(today)) return [];
    const cal = calendar || {};
    const parts = [];
    const deducted = String(lastLunchDeductDate || '').trim();
    if (isBankBusinessDay(today, cal) && !lunchAlreadyRecorded(deducted, today)) {
        parts.push({ label: '오늘 점심값', amount: LUNCH_FEE_BONG, ymd: today, kind: 'today' });
    }
    for (let i = 1; i <= 7; i += 1) {
        const next = addCalendarDaysYmd(today, i);
        if (next && isBankBusinessDay(next, cal)) {
            const name = LUNCH_WEEKDAY[weekdayMon1(next)] || '다음 등교일';
            parts.push({ label: `${name} 점심값`, amount: LUNCH_FEE_BONG, ymd: next, kind: 'next' });
            break;
        }
    }
    return parts;
}

function repayPlanBase(extra = {}) {
    return {
        ok: false,
        mode: 'full',
        full: false,
        loan: null,
        due: 0,
        amount: 0,
        requested: 0,
        left: 0,
        bong: 0,
        regular: 0,
        fromWallet: 0,
        fromRegular: 0,
        reserveLunch: 0,
        lunchParts: [],
        withheldLunch: false,
        withheld: 0,
        ...extra,
    };
}

/**
 * 빚을 갚는 모든 길.
 * clear: 전부 갚기. 빚을 0으로 만들고, 지갑만 씁니다. 모자라면 갚지 않습니다.
 * keepLunch: 점심값만 남기고 갚기. 오늘 점심을 아직 안 냈으면 오늘과 다음 등교일을, 이미 냈으면 다음 등교일만 지갑에 남깁니다. 예금은 쓰지 않습니다.
 * partial: 일부 갚기. 적어 둔 금액까지, 오늘·다음 점심값을 뺀 지갑을 먼저 쓰고 그다음 일반예금입니다.
 * auto: 만기 자동 상환. 일반예금을 먼저 쓰고, 오늘 점심을 안 냈으면 오늘 것도 남깁니다.
 * 적금은 쓰지 않습니다.
 * 적어 둔 돈보다 남길 점심값 때문에 덜 갚으면, 실제로 갚는 금액을 돌려줍니다.
 */
export function planLoanRepayment(state, opts = {}) {
    const mode = opts.mode === 'partial' || opts.mode === 'auto' || opts.mode === 'clear' || opts.mode === 'keepLunch'
        ? opts.mode
        : 'keepLunch';
    const loan = sanitizeBankLoan(state && state.bankLoan);
    if (!loan) return repayPlanBase({ reason: 'none', mode });
    const due = loanDueTotal(loan);
    const wallet = Math.floor(Number(state && state.bong) || 0);
    const regular = Math.max(0, Math.floor(Number(state && state.bankRegularSavings) || 0));
    const lastLunch = Object.prototype.hasOwnProperty.call(opts, 'lastLunchDeductDate')
        ? opts.lastLunchDeductDate
        : (state && state.lastLunchDeductDate);
    let lunchParts = schoolLunchParts(opts.todayYmd, opts.calendar, lastLunch);
    if (mode === 'clear') lunchParts = [];
    const reserveLunch = lunchParts.reduce((sum, part) => sum + part.amount, 0);
    const spendable = Math.max(0, wallet - reserveLunch);
    const requested = Math.floor(Number(opts.amount) || 0);
    if (mode === 'partial' && (requested <= 0 || requested > due)) {
        return repayPlanBase({
            reason: 'amount', mode, due, left: due, bong: wallet, regular, reserveLunch, lunchParts,
        });
    }
    let fromWallet = 0;
    let fromRegular = 0;
    let pay = 0;
    if (mode === 'clear') {
        if (wallet < due) {
            return repayPlanBase({
                reason: 'funds', mode, due, left: due, bong: wallet, regular, reserveLunch, lunchParts,
            });
        }
        pay = due;
        fromWallet = due;
    } else if (mode === 'auto') {
        fromRegular = Math.min(regular, due);
        fromWallet = Math.min(spendable, due - fromRegular);
        pay = fromRegular + fromWallet;
    } else if (mode === 'keepLunch') {
        pay = Math.min(spendable, due);
        fromWallet = pay;
    } else {
        const capacity = spendable + regular;
        pay = Math.min(requested, capacity, due);
        fromWallet = Math.min(spendable, pay);
        fromRegular = pay - fromWallet;
    }
    if (pay <= 0) {
        return repayPlanBase({
            reason: wallet > 0 && reserveLunch > 0 ? 'lunch' : 'funds',
            mode,
            due,
            left: due,
            bong: wallet,
            regular,
            reserveLunch,
            lunchParts,
        });
    }
    const canIgnoreReserve = Math.min(
        mode === 'partial' ? requested : due,
        Math.max(0, wallet) + (mode === 'keepLunch' || mode === 'clear' ? 0 : regular),
    );
    const withheld = Math.max(0, canIgnoreReserve - pay);
    const full = pay >= due;
    return {
        ok: true,
        mode,
        full,
        loan: full ? null : reduceLoanByPayment(loan, pay),
        due,
        amount: pay,
        requested: mode === 'partial' ? requested : pay,
        left: due - pay,
        bong: wallet - fromWallet,
        regular: regular - fromRegular,
        fromWallet,
        fromRegular,
        reserveLunch,
        lunchParts,
        withheldLunch: withheld > 0,
        withheld,
    };
}

/** 확인창에 보여 준 금액과 서버에서 다시 계산한 금액이 같은지 봅니다. */
export function repayAmountsMatch(confirmed, actual) {
    const left = Math.floor(Number(confirmed));
    const right = Math.floor(Number(actual));
    return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

/** 점심값만 남기고 갚기. 다음 등교일 점심값만 지갑에 둡니다. */
export function planRepayLoan(state, opts = {}) {
    return planLoanRepayment(state, { ...opts, mode: 'keepLunch' });
}

/** 전부 갚기. 빚을 0으로 만들고, 모자라면 갚지 않습니다. */
export function planClearLoan(state, opts = {}) {
    return planLoanRepayment(state, { ...opts, mode: 'clear' });
}

/** 일부 갚기. planLoanRepayment의 partial과 같습니다. */
export function planPartialRepay(state, amount, opts = {}) {
    return planLoanRepayment(state, { ...opts, mode: 'partial', amount });
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
 * 지갑이 0 이상이면 그 자리에서 풉니다.
 * 지갑이 마이너스면 이미 시작된 기간은 유지합니다.
 * 기간이 없고, 마이너스가 새 사유일 때만 새로 시작합니다.
 */
function settleCreditAfterLoanCleared(next, today) {
    next.loanPenaltyUntilYmd = '';
    next.creditReleaseLoanId = '';
    const bong = Math.floor(Number(next.bong) || 0);
    if (bong >= 0) {
        next.creditDefaultUntilYmd = '';
        next.bankNegativeSinceYmd = '';
        next.creditReleasedYmd = String(today || '');
        next.creditWalletRecovered = true;
        return;
    }
    if (!next.bankNegativeSinceYmd) next.bankNegativeSinceYmd = String(today || '');
    if (!creditStillOn(next.creditDefaultUntilYmd, today)) {
        const fresh = !releasedYmdOf(next) || walletRecoveredSinceRelease(next);
        if (!fresh) return;
        const until = creditWindowUntil(today, Math.abs(bong));
        if (until) {
            next.creditDefaultUntilYmd = until;
            next.creditWalletRecovered = false;
            next.msgs.push({
                kind: 'default_start',
                untilYmd: until,
                amount: Math.abs(bong),
                days: creditDefaultDaysFromAmount(Math.abs(bong)),
            });
        }
    }
}

function validYmdOrEmpty(raw) {
    const ymd = String(raw || '').trim();
    return isYmd(ymd) ? ymd : '';
}

/**
 * 신용불량으로 볼 모자람.
 * 오늘 이미 낸 점심값은 지갑에 없어도 남겨 둔 돈이라 다시 더합니다.
 * 계획이 지갑에 남겨 둔 점심값은 wallet 안에 있어서 한 번만 셉니다.
 * reserveLunch는 그 계획이 얼마인지 기록만 하고, 지갑 밖 돈처럼 더하지 않습니다.
 */
function lunchAdjustedShortfall({
    due,
    wallet,
    regular,
    lastLunchDeductDate,
    todayYmd,
    calendar,
    reserveLunch = 0,
} = {}) {
    const today = String(todayYmd || '');
    const already = lunchAlreadyRecorded(lastLunchDeductDate, today) && isBankBusinessDay(today, calendar || {})
        ? LUNCH_FEE_BONG
        : 0;
    void reserveLunch;
    const funds = Math.max(0, Math.floor(Number(wallet) || 0))
        + already
        + Math.max(0, Math.floor(Number(regular) || 0));
    return Math.max(0, Math.floor(Number(due) || 0) - funds);
}

/**
 * 신용불량 하루 치.
 * 1) 종료일이 되면 상환과 따로 신용불량만 풉니다. 빚과 마이너스는 그대로입니다.
 * 2) 만기일이 지난 첫 접속에서 지갑·일반예금으로 한 번 갚습니다. 그다음 신용불량을 봅니다.
 *    신용불량 기간은 접속한 날이 아니라 만기일부터 셉니다.
 * 3) 이미 신용불량인 동안에는 종료일을 다시 밀지 않습니다.
 */
export function applyLoanLifecycle(state, todayYmd, calendar = {}) {
    const today = String(todayYmd || '');
    const rawLoan = state && state.bankLoan;
    let loan = sanitizeBankLoan(rawLoan);
    const opaqueLoan = !loan && loanStillOutstanding(rawLoan);
    let bong = Math.floor(Number(state && state.bong) || 0);
    let regular = Math.max(0, Math.floor(Number(state && state.bankRegularSavings) || 0));
    let defaultUntil = validYmdOrEmpty(state && state.creditDefaultUntilYmd);
    let penaltyUntil = loan ? penaltySnapshot(state) : '';
    let negSince = validYmdOrEmpty(state && state.bankNegativeSinceYmd);
    let releasedYmd = releasedYmdOf(state);
    let releaseLoanId = releaseLoanIdOf(state);
    let walletRecovered = walletRecoveredSinceRelease(state);
    let dueHandledKey = String(state && state.loanDueHandledKey || '');
    let shieldLoanId = String(state && state.loanLunchShieldLoanId || '').trim();
    let shieldAmount = Math.max(0, Math.floor(Number(state && state.loanLunchShieldAmount) || 0));
    const msgs = [];
    let changed = false;
    let openedShortfall = null;

    if (defaultUntil && today && today >= defaultUntil) {
        releasedYmd = today;
        releaseLoanId = loan ? loan.id : '';
        walletRecovered = bong >= 0;
        defaultUntil = '';
        penaltyUntil = '';
        changed = true;
        msgs.push({ kind: 'default_end', releasedYmd: today });
    } else if (penaltyUntil && today && today >= penaltyUntil) {
        releasedYmd = today;
        releaseLoanId = loan ? loan.id : releaseLoanId;
        walletRecovered = bong >= 0;
        penaltyUntil = '';
        changed = true;
        msgs.push({ kind: 'default_end', releasedYmd: today });
    }

    const inDefault = () => creditStillOn(defaultUntil, today) || creditStillOn(penaltyUntil, today);

    if (!opaqueLoan && loan && today && today >= loan.dueYmd) {
        const handleKey = `${loan.id}|${loan.dueYmd}`;
        if (dueHandledKey !== handleKey) {
            const dueBefore = loanDueTotal(loan);
            const walletBefore = bong;
            const regularBefore = regular;
            const serverLunchDate = state && state.lastLunchDeductDate;
            const plan = planLoanRepayment({
                bong,
                bankRegularSavings: regular,
                bankLoan: loan,
                lastLunchDeductDate: serverLunchDate,
            }, { mode: 'auto', todayYmd: today, calendar, lastLunchDeductDate: serverLunchDate });
            openedShortfall = lunchAdjustedShortfall({
                due: dueBefore,
                wallet: walletBefore,
                regular: regularBefore,
                lastLunchDeductDate: serverLunchDate,
                todayYmd: today,
                calendar,
                reserveLunch: plan.reserveLunch,
            });
            if (plan.ok && plan.amount > 0) {
                bong = plan.bong;
                regular = plan.regular;
                loan = plan.loan;
                msgs.push({
                    kind: 'auto_repay',
                    paid: plan.amount,
                    unpaid: plan.left,
                    fromWallet: plan.fromWallet,
                    fromRegular: plan.fromRegular,
                    reserveLunch: plan.reserveLunch,
                    lunchParts: plan.lunchParts,
                    withheldLunch: plan.withheldLunch,
                });
            }
            if (!loan) {
                shieldLoanId = '';
                shieldAmount = 0;
            } else if (openedShortfall <= 0) {
                shieldLoanId = loan.id;
                shieldAmount = loanDueTotal(loan);
            } else {
                shieldLoanId = '';
                shieldAmount = 0;
            }
            dueHandledKey = handleKey;
            changed = true;
            if (!loan && bong >= 0) {
                defaultUntil = '';
                penaltyUntil = '';
                walletRecovered = true;
                releasedYmd = releasedYmd || today;
            }
        }
    }

    if (!opaqueLoan && !inDefault() && loan && today && today >= loan.dueYmd) {
        const sameLoan = !!(releaseLoanId && loan.id === releaseLoanId);
        const shielded = lunchShieldCoversLoan({
            loanLunchShieldLoanId: shieldLoanId,
            loanLunchShieldAmount: shieldAmount,
        }, loan);
        if (!sameLoan && !shielded) {
            const dueLeft = loanDueTotal(loan);
            const shortfall = bong < 0 ? Math.abs(bong) : 0;
            const amount = openedShortfall != null
                ? Math.max(openedShortfall, shortfall)
                : Math.max(dueLeft, shortfall);
            const until = creditWindowUntil(loan.dueYmd, amount);
            const days = creditDefaultDaysFromAmount(amount);
            if (until && today < until) {
                penaltyUntil = until;
                defaultUntil = until;
                changed = true;
                msgs.push({
                    kind: 'penalty_start',
                    untilYmd: until,
                    dueYmd: loan.dueYmd,
                    amount,
                    days,
                });
            } else if (until && today >= until) {
                releasedYmd = today;
                releaseLoanId = loan.id;
                walletRecovered = bong >= 0;
                changed = true;
            }
        }
    }

    if (releasedYmd && !inDefault() && bong >= 0 && !walletRecovered) {
        walletRecovered = true;
        changed = true;
    }

    if (bong < 0) {
        if (!negSince) {
            negSince = today;
            changed = true;
        }
        const freshNegative = !releasedYmd || walletRecovered;
        if (freshNegative && !inDefault()) {
            const until = creditWindowUntil(today, Math.abs(bong));
            if (until) {
                defaultUntil = until;
                walletRecovered = false;
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

    if (!loan) penaltyUntil = '';

    return {
        changed,
        msgs,
        bong,
        bankRegularSavings: regular,
        bankLoan: opaqueLoan ? rawLoan : loan,
        creditDefaultUntilYmd: defaultUntil || '',
        bankNegativeSinceYmd: negSince || '',
        loanPenaltyUntilYmd: loan ? (penaltyUntil || '') : '',
        creditReleasedYmd: releasedYmd || '',
        creditReleaseLoanId: loan ? (releaseLoanId || '') : '',
        creditWalletRecovered: walletRecovered === true,
        loanDueHandledKey: dueHandledKey || '',
        loanLunchShieldLoanId: loan ? (shieldLoanId || '') : '',
        loanLunchShieldAmount: loan ? shieldAmount : 0,
    };
}

function weekdayMon1(ymd) {
    const day = weekdayOfYmd(ymd);
    if (day == null) return 0;
    return day === 0 ? 7 : day;
}

/**
 * 여러 날을 아침마다 넘기며 점심값·주급·대출을 같이 굴립니다.
 * 평일에는 점심값을 빼고, 금요일에는 신용불량이 아니면 주급을 넣습니다.
 */
export function simulateCreditDays({
    startYmd,
    days = 60,
    state,
    calendar = {},
    lunchFee = LUNCH_FEE_BONG,
    salary = 0,
    onMorning,
} = {}) {
    let cur = {
        bong: Math.floor(Number(state && state.bong) || 0),
        bankRegularSavings: Math.max(0, Math.floor(Number(state && state.bankRegularSavings) || 0)),
        bankLoan: state && state.bankLoan ? state.bankLoan : null,
        lastLunchDeductDate: String(state && state.lastLunchDeductDate || ''),
        ...copyCreditFields(state),
    };
    const rows = [];
    const total = Math.max(0, Math.floor(Number(days) || 0));
    for (let i = 0; i < total; i += 1) {
        const ymd = i === 0 ? String(startYmd || '') : addCalendarDaysYmd(startYmd, i);
        if (typeof onMorning === 'function') {
            const patched = onMorning(ymd, cur, i) || cur;
            cur = { ...cur, ...patched };
        }
        const life = applyLoanLifecycle(cur, ymd, calendar);
        cur = {
            ...cur,
            bong: life.bong,
            bankRegularSavings: life.bankRegularSavings,
            bankLoan: life.bankLoan,
            ...copyCreditFields(life),
        };
        const dow = weekdayMon1(ymd);
        let salaryPaid = 0;
        if (dow === 5 && salary > 0 && !isStudentCreditDefault(cur, ymd)) {
            const collected = collectShieldedDebtFromSalary(cur, {
                salary,
                todayYmd: ymd,
                calendar,
            });
            cur.bong = collected.bong;
            cur.bankLoan = collected.bankLoan;
            cur.loanLunchShieldLoanId = collected.loanLunchShieldLoanId;
            cur.loanLunchShieldAmount = collected.loanLunchShieldAmount;
            salaryPaid = salary;
        }
        let lunchPaid = 0;
        if (dow >= 1 && dow <= 5 && lunchFee) {
            cur.bong -= lunchFee;
            cur.lastLunchDeductDate = ymd;
            lunchPaid = lunchFee;
        }
        rows.push({
            ymd,
            bong: cur.bong,
            credit: isStudentCreditDefault(cur, ymd),
            until: cur.creditDefaultUntilYmd || '',
            loanId: cur.bankLoan && cur.bankLoan.id ? cur.bankLoan.id : '',
            salaryPaid,
            lunchPaid,
        });
    }
    return { state: cur, rows };
}

/** 저장·화면에 같이 실어야 하는 신용불량 기록입니다. */
export function copyCreditFields(src) {
    return {
        creditDefaultUntilYmd: String(src && src.creditDefaultUntilYmd || ''),
        bankNegativeSinceYmd: String(src && src.bankNegativeSinceYmd || ''),
        loanPenaltyUntilYmd: String(src && src.loanPenaltyUntilYmd || ''),
        creditReleasedYmd: String(src && src.creditReleasedYmd || ''),
        creditReleaseLoanId: String(src && src.creditReleaseLoanId || ''),
        creditWalletRecovered: !!(src && src.creditWalletRecovered),
        loanDueHandledKey: String(src && src.loanDueHandledKey || ''),
        loanLunchShieldLoanId: String(src && src.loanLunchShieldLoanId || ''),
        loanLunchShieldAmount: Math.max(0, Math.floor(Number(src && src.loanLunchShieldAmount) || 0)),
    };
}

/** 알림 키를 서버 문서에 먼저 적어, 두 기기가 같은 알림을 두 번 띄우지 않게 합니다. */
export function claimLoanNoticesForSave(serverKeys, clientKeys, pendingKeys) {
    const clean = (list) => (Array.isArray(list) ? list.map((key) => String(key || '').trim()).filter(Boolean) : []);
    const server = clean(serverKeys);
    const client = clean(clientKeys);
    const pending = clean(pendingKeys);
    const seen = new Set(server);
    const claimed = pending.filter((key) => !seen.has(key));
    const merged = server.slice();
    client.concat(pending).forEach((key) => {
        if (!merged.includes(key)) merged.push(key);
    });
    return { claimed, merged: merged.slice(-30) };
}

export function loanFieldsFromLifecycle(result) {
    return {
        bong: result.bong,
        bankRegularSavings: result.bankRegularSavings,
        bankLoan: result.bankLoan,
        ...copyCreditFields(result),
    };
}

/**
 * 만기 상환으로 줄어든 지갑을 그 전 잔액으로 되돌리지 않습니다.
 * 상환 키가 생기기 전의 큰 잔액은 버립니다.
 * 같은 키로 나중에 늘어난 잔액은 그대로 둡니다.
 */
export function resolveBongKeepingLoanRepayment({
    clientBong,
    clientKey = '',
    accruedBong,
    accruedKey = '',
    proposedBong,
    serverBong,
    serverKey = '',
} = {}) {
    const client = Math.floor(Number(clientBong) || 0);
    const accrued = Math.floor(Number(accruedBong) || 0);
    const proposed = Number.isFinite(Number(proposedBong)) ? Math.floor(Number(proposedBong)) : client;
    const server = Math.floor(Number(serverBong) || 0);
    const cKey = String(clientKey || '');
    const aKey = String(accruedKey || '');
    const sKey = String(serverKey || '');
    if (aKey && aKey !== cKey) return accrued;
    if (sKey && !cKey && client > server) return server;
    if (cKey && cKey === aKey) return proposed;
    if (cKey && cKey !== sKey && client < proposed) return client;
    return proposed;
}

/**
 * 신용불량은 트랜잭션이 끝난 봉으로 다시 봅니다.
 * 같은 저장 안에서 봉이 신용 판정 뒤에 바뀌면, 순간 마이너스로 걸린 새 신용불량은 버립니다.
 * 서버에 이미 있던 기간은 최종 봉이 0 이상이어도 그날로 지우지 않습니다.
 * 만기 상환 키는 유지해서 갚기를 한 번 더 하지 않습니다.
 */
export function creditJudgedOnFinalBong({
    beforeState,
    lifecycle,
    finalBong,
    todayYmd,
    calendar = {},
} = {}) {
    const final = Math.floor(Number(finalBong) || 0);
    const seen = Math.floor(Number(lifecycle && lifecycle.bong) || 0);
    if (final === seen) return copyCreditFields(lifecycle || beforeState);
    const before = beforeState && typeof beforeState === 'object' ? beforeState : {};
    const life = lifecycle && typeof lifecycle === 'object' ? lifecycle : {};
    const replay = applyLoanLifecycle({
        bong: final,
        bankRegularSavings: Math.max(0, Math.floor(Number(
            life.bankRegularSavings != null ? life.bankRegularSavings : before.bankRegularSavings
        ) || 0)),
        bankLoan: Object.prototype.hasOwnProperty.call(life, 'bankLoan') ? life.bankLoan : (before.bankLoan || null),
        ...copyCreditFields(before),
        loanDueHandledKey: String(life.loanDueHandledKey || before.loanDueHandledKey || ''),
        loanLunchShieldLoanId: String(life.loanLunchShieldLoanId || before.loanLunchShieldLoanId || ''),
        loanLunchShieldAmount: Math.max(
            Math.floor(Number(life.loanLunchShieldAmount) || 0),
            Math.floor(Number(before.loanLunchShieldAmount) || 0),
        ),
        lastLunchDeductDate: before.lastLunchDeductDate,
    }, String(todayYmd || ''), calendar || {});
    return copyCreditFields(replay);
}

/**
 * 점심값처럼 지갑만 바뀐 뒤의 신용입니다.
 * 대출 상환 키와 연체 기간은 서버에 있던 값을 유지합니다.
 */
export function walletCreditAfterFinalBong(state, finalBong, todayYmd) {
    const src = state && typeof state === 'object' ? state : {};
    const kept = copyCreditFields(src);
    const life = applyLoanLifecycle({
        bong: Math.floor(Number(finalBong) || 0),
        bankRegularSavings: 0,
        bankLoan: null,
        creditDefaultUntilYmd: kept.creditDefaultUntilYmd,
        bankNegativeSinceYmd: kept.bankNegativeSinceYmd,
        loanPenaltyUntilYmd: '',
        creditReleasedYmd: kept.creditReleasedYmd,
        creditReleaseLoanId: '',
        creditWalletRecovered: kept.creditWalletRecovered,
        loanDueHandledKey: '',
    }, String(todayYmd || ''), {});
    return {
        ...kept,
        creditDefaultUntilYmd: String(life.creditDefaultUntilYmd || ''),
        bankNegativeSinceYmd: String(life.bankNegativeSinceYmd || ''),
        creditWalletRecovered: life.creditWalletRecovered === true,
        creditReleasedYmd: String(life.creditReleasedYmd || kept.creditReleasedYmd || ''),
    };
}

/**
 * 스냅샷이 만기 상환 전의 지갑으로 로컬 결과를 덮지 않게 합칩니다.
 * 같은 상환 키면 서버에 나중에 늘어난 잔액을 받습니다.
 */
export function mergeStudentDocKeepingLoanRepayment(local, remote) {
    const base = remote && typeof remote === 'object' ? { ...remote } : {};
    if (!local || typeof local !== 'object') return base;
    const localKey = String(local.loanDueHandledKey || '');
    const remoteKey = String(base.loanDueHandledKey || '');
    if (localKey && localKey !== remoteKey) {
        base.bong = Math.floor(Number(local.bong) || 0);
        if (Object.prototype.hasOwnProperty.call(local, 'bankLoan')) base.bankLoan = local.bankLoan;
        if (Object.prototype.hasOwnProperty.call(local, 'bankRegularSavings')) {
            base.bankRegularSavings = Math.max(0, Math.floor(Number(local.bankRegularSavings) || 0));
        }
        Object.assign(base, copyCreditFields(local));
    }
    return base;
}

/**
 * 점심값 때문에 남겨 둔 빚을 주급에서 조금씩 걷습니다.
 * 신용불량으로 보지 않고, 다음 등교일 점심값과 아직 안 낸 오늘 점심값은 지갑에 둡니다.
 * 방패가 없는 빚은 건드리지 않습니다.
 */
export function collectShieldedDebtFromSalary(state, { salary = 0, todayYmd = '', calendar = {} } = {}) {
    const pay = Math.max(0, Math.floor(Number(salary) || 0));
    const start = Math.floor(Number(state && state.bong) || 0);
    const withPay = start + pay;
    const loan = sanitizeBankLoan(state && state.bankLoan);
    const shieldId = String(state && state.loanLunchShieldLoanId || '');
    const shieldAmt = Math.max(0, Math.floor(Number(state && state.loanLunchShieldAmount) || 0));
    const untouched = {
        bong: withPay,
        bankLoan: state && state.bankLoan ? state.bankLoan : null,
        loanLunchShieldLoanId: shieldId,
        loanLunchShieldAmount: shieldAmt,
        collected: 0,
        salaryPaid: pay,
    };
    if (pay <= 0 || !loan || !lunchShieldCoversLoan(state, loan)) return untouched;
    const reserve = schoolLunchParts(todayYmd, calendar, state && state.lastLunchDeductDate)
        .reduce((sum, part) => sum + part.amount, 0);
    const spendable = Math.max(0, withPay - reserve);
    const due = loanDueTotal(loan);
    const collected = Math.min(spendable, due);
    if (collected <= 0) return untouched;
    const nextLoan = collected >= due ? null : reduceLoanByPayment(loan, collected);
    return {
        bong: withPay - collected,
        bankLoan: nextLoan,
        loanLunchShieldLoanId: nextLoan ? nextLoan.id : '',
        loanLunchShieldAmount: nextLoan ? loanDueTotal(nextLoan) : 0,
        collected,
        salaryPaid: pay,
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
        ...copyCreditFields(state),
        loanPenaltyUntilYmd: penaltySnapshot(state) || String(state && state.loanPenaltyUntilYmd || ''),
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
    const hadLoanAtStart = loanStillOutstanding(state && state.bankLoan) || !!opts.blockTakeBecauseLoan;
    const life = applyLoanLifecycle(state, today, calendar);
    const next = {
        ...loanFieldsFromLifecycle(life),
        msgs: life.msgs.slice(),
        changed: life.changed,
    };
    if (!action) return { ok: true, ...next };
    if (action === 'take') {
        // 이 요청이 시작될 때 대출이 있었으면, 만기 상환으로 비워진 뒤에도 같은 요청으로 다시 빌리지 않습니다.
        if (hadLoanAtStart || loanStillOutstanding(next.bankLoan)) {
            const reason = isStudentCreditDefault(next, today)
                ? 'default'
                : loanStillOutstanding(next.bankLoan) ? 'active' : 'settled';
            return { ok: false, reason, ...next };
        }
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
    if (action === 'repay' || action === 'keepLunch' || action === 'clear' || action === 'partial') {
        const handledNow = String(life.loanDueHandledKey || '') !== ''
            && String(life.loanDueHandledKey || '') !== String(state && state.loanDueHandledKey || '');
        if (handledNow) {
            const autoMsg = life.msgs.find((m) => m.kind === 'auto_repay');
            return {
                ok: true,
                ...next,
                due: next.bankLoan ? loanDueTotal(next.bankLoan) : 0,
                amount: autoMsg ? autoMsg.paid : 0,
            };
        }
        const planOpts = {
            todayYmd: today,
            calendar,
            lastLunchDeductDate: state && state.lastLunchDeductDate,
        };
        const plan = action === 'partial'
            ? planPartialRepay(next, opts.amount, planOpts)
            : action === 'clear'
                ? planClearLoan(next, planOpts)
                : planRepayLoan(next, planOpts);
        if (!plan.ok) {
            if (action !== 'partial' && !loanStillOutstanding(next.bankLoan) && life.msgs.some((m) => m.kind === 'auto_repay')) {
                return { ok: true, ...next, due: 0 };
            }
            return {
                ok: false,
                reason: plan.reason,
                ...next,
                lunchParts: plan.lunchParts,
                reserveLunch: plan.reserveLunch,
            };
        }
        if (Math.floor(Number(next.bong) || 0) >= 0) next.creditWalletRecovered = true;
        const paidLoan = sanitizeBankLoan(next.bankLoan);
        const dueBefore = loanDueTotal(paidLoan);
        const walletBefore = Math.floor(Number(next.bong) || 0);
        const regularBefore = Math.max(0, Math.floor(Number(next.bankRegularSavings) || 0));
        const trueShortfall = lunchAdjustedShortfall({
            due: dueBefore,
            wallet: walletBefore,
            regular: regularBefore,
            lastLunchDeductDate: state && state.lastLunchDeductDate,
            todayYmd: today,
            calendar,
            reserveLunch: plan.reserveLunch,
        });
        next.bong = plan.bong;
        next.bankRegularSavings = plan.regular;
        next.bankLoan = plan.loan;
        if (!plan.loan) {
            next.loanLunchShieldLoanId = '';
            next.loanLunchShieldAmount = 0;
            settleCreditAfterLoanCleared(next, today);
        } else if (trueShortfall <= 0 && plan.left > 0) {
            next.loanLunchShieldLoanId = plan.loan.id;
            next.loanLunchShieldAmount = plan.left;
        }
        next.changed = true;
        const early = action === 'repay' || action === 'keepLunch' || action === 'clear';
        next.msgs.push(early ? {
            kind: 'repay_early',
            principal: paidLoan ? paidLoan.principal : 0,
            interest: paidLoan ? paidLoan.interest : 0,
            due: plan.amount,
            left: plan.left,
            requested: plan.requested,
            withheld: plan.withheld,
            fromWallet: plan.fromWallet,
            fromRegular: plan.fromRegular,
            reserveLunch: plan.reserveLunch,
            lunchParts: plan.lunchParts,
        } : {
            kind: 'repay_partial',
            amount: plan.amount,
            left: plan.left,
            requested: plan.requested,
            withheld: plan.withheld,
            fromWallet: plan.fromWallet,
            fromRegular: plan.fromRegular,
            reserveLunch: plan.reserveLunch,
            lunchParts: plan.lunchParts,
        });
        return { ok: true, ...next, due: plan.left, amount: plan.amount };
    }
    return { ok: false, reason: 'action', ...next };
}
