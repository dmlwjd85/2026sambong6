/**
 * 점심값은 서버 문서 기준으로 하루 한 번만 뺍니다.
 * 날짜는 서울 시간이고, 호출하는 쪽이 서버 시각을 넘기면 그 시각을 우선합니다.
 */

import { LUNCH_FEE_BONG } from './bankLoan.js';
import { KOREA_2026_FALL_HOLIDAYS } from './season2.js';

export { LUNCH_FEE_BONG };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function isLunchYmd(raw) {
    return YMD_RE.test(String(raw || '').trim());
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

/**
 * 서울 달력의 연월일·시·요일. 요일은 0(일)~6(토).
 * 기기 시간대가 아니라, 넘긴 시각에 9시간을 더한 한국 표준시입니다.
 */
export function seoulDateParts(ms) {
    const stamp = Number(ms);
    if (!Number.isFinite(stamp)) return null;
    const shifted = new Date(stamp + KST_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth() + 1;
    const day = shifted.getUTCDate();
    const ymd = `${year}-${pad2(month)}-${pad2(day)}`;
    return {
        ymd,
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        weekday: shifted.getUTCDay(),
    };
}

export function seoulYmdFromMs(ms) {
    const parts = seoulDateParts(ms);
    return parts ? parts.ymd : '';
}

/** 평일 12시(서울)부터 자정 전까지 점심값을 빼는 시간입니다. */
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

/** 학급이 적어 둔 휴일과 코드의 기본 공휴일을 합칩니다. 어느 쪽에만 있어도 쉽니다. */
export function lunchHolidayDates(classHolidays) {
    const dates = new Set(KOREA_2026_FALL_HOLIDAYS);
    (Array.isArray(classHolidays) ? classHolidays : []).forEach((item) => {
        const raw = typeof item === 'string' ? item : (item && (item.date || item.ymd));
        const ymd = String(raw || '').trim();
        if (isLunchYmd(ymd)) dates.add(ymd);
    });
    return dates;
}

/**
 * 서버 문서를 읽은 뒤 점심값을 뺄지 정합니다.
 * 오늘 이미 빠졌거나 공휴일이면 봉과 날짜를 그대로 둡니다.
 */
export function planServerLunchDeduction({
    serverBong = 0,
    serverLunchDate = '',
    nowMs = Date.now(),
    vacationPaused = false,
    classHolidays,
    fee = LUNCH_FEE_BONG,
} = {}) {
    const parts = seoulDateParts(nowMs);
    const today = parts ? parts.ymd : '';
    const bong = Math.floor(Number(serverBong) || 0);
    const serverDate = isLunchYmd(serverLunchDate) ? String(serverLunchDate).trim() : '';
    const amount = Math.max(0, Math.floor(Number(fee) || 0));
    const holiday = !!(today && lunchHolidayDates(classHolidays).has(today));
    const closed = !parts || vacationPaused || holiday || !isLunchDeductWindow(parts) || amount <= 0;
    if (closed || serverDate === today) {
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
