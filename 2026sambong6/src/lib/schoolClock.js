/**
 * 점심값과 대출이 함께 쓰는 서울 날짜.
 * 넘긴 시각은 서버 시각이고, 휴일은 학급 목록과 기본 공휴일을 합친 하나뿐입니다.
 * 기기 시간대는 보지 않습니다.
 */

import { KOREA_2026_FALL_HOLIDAYS } from './season2.js';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function isSchoolYmd(raw) {
    return YMD_RE.test(String(raw || '').trim());
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

/** 서울 달력의 연월일·시·요일. 요일은 0(일)~6(토). */
export function seoulDateParts(ms) {
    const stamp = Number(ms);
    if (!Number.isFinite(stamp)) return null;
    const shifted = new Date(stamp + KST_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth() + 1;
    const day = shifted.getUTCDate();
    return {
        ymd: `${year}-${pad2(month)}-${pad2(day)}`,
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        weekday: shifted.getUTCDay(),
    };
}

export function seoulYmdFromMs(ms) {
    const parts = seoulDateParts(ms);
    return parts ? parts.ymd : '';
}

/** 달력 날짜의 요일. 기기 시간대와 상관없이 0(일)~6(토). */
export function weekdayOfYmd(ymd) {
    const id = String(ymd || '').trim();
    if (!isSchoolYmd(id)) return null;
    const [y, m, d] = id.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 학급이 적어 둔 날과 기본 공휴일을 한 목록으로 합칩니다. */
export function unifiedHolidayDates(classHolidays) {
    const dates = new Set(KOREA_2026_FALL_HOLIDAYS);
    (Array.isArray(classHolidays) ? classHolidays : []).forEach((item) => {
        const raw = typeof item === 'string' ? item : (item && (item.date || item.ymd));
        const ymd = String(raw || '').trim();
        if (isSchoolYmd(ymd)) dates.add(ymd);
    });
    return dates;
}

function vacationCovers(ymd, vacationStart, vacationEnd) {
    const start = String(vacationStart || '');
    const end = String(vacationEnd || '');
    return !!(start && end && ymd >= start && ymd <= end);
}

/**
 * 서버 시각의 서울 날짜로 학교 가는 날과 점심 시간을 정합니다.
 * deviceNowMs가 있어도 쓰지 않습니다. 서버 시각이 없으면 판단하지 않습니다.
 */
export function seoulSchoolDay(serverNowMs, {
    holidays,
    vacationStart = '',
    vacationEnd = '',
    deviceNowMs,
} = {}) {
    void deviceNowMs;
    const parts = seoulDateParts(serverNowMs);
    if (!parts) return null;
    const holiday = unifiedHolidayDates(holidays).has(parts.ymd);
    const weekend = parts.weekday === 0 || parts.weekday === 6;
    const vacation = vacationCovers(parts.ymd, vacationStart, vacationEnd);
    const schoolDay = !holiday && !weekend && !vacation;
    return {
        ...parts,
        holiday,
        weekend,
        vacation,
        schoolDay,
        lunchOpen: schoolDay && parts.hour >= 12,
    };
}

/** 그 날짜가 학교 가는 날인지. 점심을 빼는 쪽과 점심값을 남기는 쪽이 같이 씁니다. */
export function isSchoolDayYmd(ymd, {
    holidays,
    vacationStart = '',
    vacationEnd = '',
} = {}) {
    const id = String(ymd || '').trim();
    const weekday = weekdayOfYmd(id);
    if (weekday == null) return false;
    if (weekday === 0 || weekday === 6) return false;
    if (unifiedHolidayDates(holidays).has(id)) return false;
    if (vacationCovers(id, vacationStart, vacationEnd)) return false;
    return true;
}

/**
 * 서버에 적힌 점심 날짜가 오늘이거나 더 뒤면, 기기 시계가 앞서 적어도 다시 빼지 않습니다.
 */
export function lunchAlreadyRecorded(serverLunchDate, todayYmd) {
    const server = isSchoolYmd(serverLunchDate) ? String(serverLunchDate).trim() : '';
    const today = isSchoolYmd(todayYmd) ? String(todayYmd).trim() : '';
    if (!server || !today) return false;
    return server >= today;
}
