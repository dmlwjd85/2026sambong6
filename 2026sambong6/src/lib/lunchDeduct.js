/**
 * 점심값은 서버 문서 기준으로 하루 한 번만 뺍니다.
 * 날짜와 휴일은 schoolClock 한 곳을 쓰고, 넘긴 시각은 서버 시각입니다.
 */

import { LUNCH_FEE_BONG, applyLoanLifecycle, copyCreditFields } from './bankLoan.js';
import {
    isSchoolYmd,
    lunchAlreadyRecorded,
    seoulDateParts,
    seoulSchoolDay,
    seoulYmdFromMs,
    unifiedHolidayDates,
} from './schoolClock.js';

export { LUNCH_FEE_BONG };
export {
    lunchAlreadyRecorded,
    seoulDateParts,
    seoulSchoolDay,
    seoulYmdFromMs,
};

export function isLunchYmd(raw) {
    return isSchoolYmd(raw);
}

/** 평일 12시(서울)부터 자정 전까지 점심값을 빼는 시간입니다. 휴일은 따로 봅니다. */
export function isLunchDeductWindow(parts) {
    if (!parts || !isLunchYmd(parts.ymd)) return false;
    if (parts.weekday < 1 || parts.weekday > 5) return false;
    return parts.hour >= 12;
}

/**
 * 서버에 적힌 점심 날짜와 클라이언트가 들고 온 날짜 중 더 늦은 날.
 * 오늘보다 앞선 클라이언트 날짜는 점심을 통째로 건너뛰지 않게 무시합니다.
 */
export function laterLunchDate(serverDate, clientDate, todayYmd) {
    const server = isLunchYmd(serverDate) ? String(serverDate).trim() : '';
    let client = isLunchYmd(clientDate) ? String(clientDate).trim() : '';
    const today = isLunchYmd(todayYmd) ? String(todayYmd).trim() : '';
    if (client && today && client > today) client = '';
    if (!server) return client;
    if (!client) return server;
    return server >= client ? server : client;
}

/**
 * 일반 저장이 서버 잔액보다 봉을 올리지 못하게 막습니다.
 * maxBongIncrease 를 넘기지 않으면 0이라, 보상처럼 허용한 증가만 통과합니다.
 */
export function capBongIncrease(serverBong, proposedBong, maxBongIncrease = 0) {
    const server = Number(serverBong);
    const proposed = Number(proposedBong);
    if (!Number.isFinite(server) || !Number.isFinite(proposed)) {
        return Number.isFinite(proposed) ? Math.floor(proposed) : 0;
    }
    const rise = Math.max(0, Number(maxBongIncrease) || 0);
    if (proposed > server + rise + 0.0001) return Math.floor(server + rise);
    return Math.floor(proposed);
}

/** 학급이 적어 둔 휴일과 기본 공휴일을 합칩니다. 어느 쪽에만 있어도 쉽니다. */
export function lunchHolidayDates(classHolidays) {
    return unifiedHolidayDates(classHolidays);
}

/**
 * 서버 문서를 읽은 뒤 점심값을 뺄지 정합니다.
 * nowMs·serverNowMs는 서버 시각입니다. 기기 시각(deviceNowMs)은 쓰지 않습니다.
 * 서버 시각이 없거나, 오늘이거나 더 뒤 날짜가 이미 적혀 있으면 빼지 않습니다.
 */
export function planServerLunchDeduction({
    serverBong = 0,
    serverLunchDate = '',
    nowMs,
    serverNowMs,
    deviceNowMs,
    vacationPaused = false,
    vacationStart = '',
    vacationEnd = '',
    classHolidays,
    fee = LUNCH_FEE_BONG,
} = {}) {
    void deviceNowMs;
    const stamp = Number.isFinite(Number(serverNowMs)) ? Number(serverNowMs) : Number(nowMs);
    const day = seoulSchoolDay(stamp, {
        holidays: classHolidays,
        vacationStart,
        vacationEnd,
        deviceNowMs,
    });
    const bong = Math.floor(Number(serverBong) || 0);
    const serverDate = isLunchYmd(serverLunchDate) ? String(serverLunchDate).trim() : '';
    const amount = Math.max(0, Math.floor(Number(fee) || 0));
    if (!day) {
        return {
            deduct: false,
            bong,
            lastLunchDeductDate: serverDate,
            today: '',
            fee: 0,
            holiday: false,
        };
    }
    const today = day.ymd;
    const holiday = day.holiday;
    const closed = vacationPaused || !day.lunchOpen || amount <= 0;
    if (closed || lunchAlreadyRecorded(serverDate, today)) {
        return {
            deduct: false,
            bong,
            lastLunchDeductDate: serverDate,
            today,
            fee: 0,
            holiday,
        };
    }
    return {
        deduct: true,
        bong: bong - amount,
        lastLunchDeductDate: today,
        today,
        fee: amount,
        holiday: false,
    };
}

/**
 * 서버에 오늘 점심이 이미 적혀 있는데, 그 전 화면의 잔액으로 덮지 않습니다.
 * 허용한 증가(보상·입금)만 서버 잔액 위로 올라갑니다.
 * 오래된 화면이 점심값을 한 번 더 뺀 값이면 서버 잔액을 유지합니다.
 */
export function bongPreservingCommittedLunch({
    serverBong,
    proposedBong,
    serverLunchDate = '',
    clientLunchDate = '',
    todayYmd = '',
    allowedIncrease = 0,
    fee = LUNCH_FEE_BONG,
} = {}) {
    const server = Math.floor(Number(serverBong) || 0);
    let proposed = Number.isFinite(Number(proposedBong)) ? Math.floor(Number(proposedBong)) : server;
    const serverLunch = isLunchYmd(serverLunchDate) ? String(serverLunchDate).trim() : '';
    const clientLunch = isLunchYmd(clientLunchDate) ? String(clientLunchDate).trim() : '';
    const today = isLunchYmd(todayYmd) ? String(todayYmd).trim() : '';
    const staleScreen = !!(today && serverLunch >= today && (!clientLunch || clientLunch < serverLunch));
    if (!staleScreen) return proposed;
    const room = Math.max(0, Math.floor(Number(allowedIncrease) || 0));
    if (proposed > server) return Math.min(proposed, server + room);
    const lunch = Math.max(0, Math.floor(Number(fee) || 0));
    if (lunch > 0 && server - proposed === lunch) return server;
    return proposed;
}

/**
 * 만기일 저장은 점심값과 대출 상환을 같은 계산으로 끝냅니다.
 * 점심을 먼저 뺀 뒤 남은 돈으로 갚습니다.
 */
export function settleLunchAndLoan(state, {
    nowMs,
    serverNowMs,
    todayYmd = '',
    calendar = {},
    classHolidays,
    vacationPaused = false,
} = {}) {
    const src = state && typeof state === 'object' ? state : {};
    const lunch = planServerLunchDeduction({
        serverBong: src.bong,
        serverLunchDate: src.lastLunchDeductDate,
        serverNowMs: Number.isFinite(Number(serverNowMs)) ? Number(serverNowMs) : nowMs,
        vacationPaused,
        classHolidays,
    });
    const today = String(todayYmd || lunch.today || '');
    const afterLunch = {
        ...src,
        bong: lunch.deduct ? lunch.bong : Math.floor(Number(src.bong) || 0),
        lastLunchDeductDate: lunch.deduct ? lunch.lastLunchDeductDate : (src.lastLunchDeductDate || ''),
    };
    const life = applyLoanLifecycle(afterLunch, today, calendar || {});
    return {
        bong: life.bong,
        bankRegularSavings: life.bankRegularSavings,
        bankLoan: life.bankLoan,
        lastLunchDeductDate: String(afterLunch.lastLunchDeductDate || ''),
        ...copyCreditFields(life),
        lunchDeducted: !!lunch.deduct,
        lunchFee: Math.max(0, Math.floor(Number(lunch.fee) || 0)),
        loanMsgs: life.msgs || [],
        changed: !!lunch.deduct || !!life.changed,
    };
}

/**
 * 상환을 먼저 하고 점심을 나중에 빼도, 같은 날의 최종 봉·빚·점심 날짜를 비교할 때 씁니다.
 */
export function repayBeforeLunch(state, opts = {}) {
    const src = state && typeof state === 'object' ? state : {};
    const probe = planServerLunchDeduction({
        serverBong: src.bong,
        serverLunchDate: src.lastLunchDeductDate,
        serverNowMs: Number.isFinite(Number(opts.serverNowMs)) ? Number(opts.serverNowMs) : opts.nowMs,
        vacationPaused: opts.vacationPaused,
        classHolidays: opts.classHolidays,
    });
    const today = String(opts.todayYmd || probe.today || '');
    const life = applyLoanLifecycle(src, today, opts.calendar || {});
    const lunch = planServerLunchDeduction({
        serverBong: life.bong,
        serverLunchDate: src.lastLunchDeductDate,
        serverNowMs: Number.isFinite(Number(opts.serverNowMs)) ? Number(opts.serverNowMs) : opts.nowMs,
        vacationPaused: opts.vacationPaused,
        classHolidays: opts.classHolidays,
    });
    const bong = lunch.deduct ? lunch.bong : life.bong;
    const lastLunchDeductDate = lunch.deduct ? lunch.lastLunchDeductDate : (src.lastLunchDeductDate || '');
    const replay = applyLoanLifecycle({
        ...life,
        bong,
        lastLunchDeductDate,
        bankLoan: life.bankLoan,
        bankRegularSavings: life.bankRegularSavings,
    }, today, opts.calendar || {});
    return {
        bong: replay.bong,
        bankRegularSavings: replay.bankRegularSavings,
        bankLoan: replay.bankLoan,
        lastLunchDeductDate: String(lastLunchDeductDate || ''),
        ...copyCreditFields(replay),
        lunchDeducted: !!lunch.deduct,
        lunchFee: Math.max(0, Math.floor(Number(lunch.fee) || 0)),
        loanMsgs: life.msgs || [],
        changed: !!lunch.deduct || !!life.changed,
    };
}
