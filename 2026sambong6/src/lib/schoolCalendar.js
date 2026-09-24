/**
 * 학사 달력의 공휴일.
 * 체크된 날에는 점심값(10봉)을 빼지 않습니다.
 */

import { KOREA_2026_FALL_HOLIDAYS, toYmd } from './season2.js';

export const LUNCH_DEDUCT_BONG = 10;

export function sanitizeHolidayYmds(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const out = [];
    const seen = new Set();
    src.forEach((item) => {
        const ymd = toYmd(item);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || seen.has(ymd)) return;
        seen.add(ymd);
        out.push(ymd);
    });
    out.sort();
    return out;
}

/** 저장값이 없으면 2026년 2학기 공휴일을 씁니다. 빈 배열은 선생님이 전부 해제한 것입니다. */
export function resolveSchoolHolidays(worldSettings) {
    const ws = worldSettings && typeof worldSettings === 'object' ? worldSettings : {};
    if (Array.isArray(ws.schoolHolidays)) return sanitizeHolidayYmds(ws.schoolHolidays);
    return sanitizeHolidayYmds(KOREA_2026_FALL_HOLIDAYS);
}

export function isSchoolHolidayYmd(ymd, holidays) {
    const id = toYmd(ymd);
    if (!id) return false;
    const set = holidays instanceof Set ? holidays : new Set(sanitizeHolidayYmds(holidays));
    return set.has(id);
}

export function monthGrid(year, monthIndex) {
    const y = Math.floor(Number(year));
    const m = Math.floor(Number(monthIndex));
    if (!y || m < 0 || m > 11) return [];
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i += 1) cells.push(null);
    for (let d = 1; d <= days; d += 1) {
        const dt = new Date(y, m, d);
        const pad = (n) => String(n).padStart(2, '0');
        cells.push({
            ymd: `${y}-${pad(m + 1)}-${pad(d)}`,
            day: d,
            dow: dt.getDay(),
        });
    }
    return cells;
}

export function addCalendarDaysYmd(ymd, days) {
    const id = toYmd(ymd);
    const [y, m, d] = id.split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(y, m - 1, d + Number(days || 0));
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** 가입 당일 경과 0, 30일이 되는 날짜가 만기일입니다. */
export function termMaturityYmd(startYmd) {
    return addCalendarDaysYmd(startYmd, 30);
}

function logYmd(row) {
    const at = Number(row && row.at);
    if (!Number.isFinite(at)) return '';
    return toYmd(new Date(at));
}

/**
 * 공휴일에 점심값 10봉이 빠졌다가 되돌려지지 않았으면 10을 돌려줍니다.
 * 대출 만기 로그로 이미 +10이 들어온 경우는 0입니다.
 */
export function holidayLunchRefundAmount(logs, todayYmd, holidays) {
    const today = toYmd(todayYmd);
    if (!today || !isSchoolHolidayYmd(today, holidays)) return 0;
    let net = 0;
    (Array.isArray(logs) ? logs : []).forEach((row) => {
        if (!row || logYmd(row) !== today) return;
        const delta = Number(row.delta);
        if (delta !== LUNCH_DEDUCT_BONG && delta !== -LUNCH_DEDUCT_BONG) return;
        const reason = String(row.reason || '');
        const source = String(row.source || '');
        const lunchLike = reason === '저장'
            || reason.includes('점심')
            || source === 'bankLoanDue'
            || source === 'bankTermMaturity'
            || source === 'holidayLunchRefund';
        if (!lunchLike) return;
        net += delta;
    });
    return net < 0 ? LUNCH_DEDUCT_BONG : 0;
}
