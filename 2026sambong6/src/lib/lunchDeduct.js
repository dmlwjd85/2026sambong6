/**
 * 점심값은 서버 문서 기준으로 하루 한 번만 뺍니다.
 * 날짜는 서울 시간이고, 호출하는 쪽이 서버 시각을 넘기면 그 시각을 우선합니다.
 */

import { LUNCH_FEE_BONG } from './bankLoan.js';

export { LUNCH_FEE_BONG };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLunchYmd(raw) {
    return YMD_RE.test(String(raw || '').trim());
}

/** 서울 달력의 연월일·시·요일. 요일은 0(일)~6(토). */
export function seoulDateParts(ms) {
    const stamp = Number(ms);
    if (!Number.isFinite(stamp)) return null;
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
    const bag = {};
    fmt.formatToParts(new Date(stamp)).forEach((part) => {
        if (part.type !== 'literal') bag[part.type] = part.value;
    });
    const year = bag.year;
    const month = bag.month;
    const day = bag.day;
    if (!year || !month || !day) return null;
    let hour = Number(bag.hour);
    if (!Number.isFinite(hour)) hour = 0;
    if (hour === 24) hour = 0;
    const ymd = `${year}-${month}-${day}`;
    const [y, m, d] = ymd.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return {
        ymd,
        hour,
        minute: Number(bag.minute) || 0,
        weekday,
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

/**
 * 서버 문서를 읽은 뒤 점심값을 뺄지 정합니다.
 * 오늘 이미 빠졌으면 봉과 날짜를 그대로 둡니다.
 */
export function planServerLunchDeduction({
    serverBong = 0,
    serverLunchDate = '',
    nowMs = Date.now(),
    vacationPaused = false,
    fee = LUNCH_FEE_BONG,
} = {}) {
    const parts = seoulDateParts(nowMs);
    const today = parts ? parts.ymd : '';
    const bong = Math.floor(Number(serverBong) || 0);
    const serverDate = isLunchYmd(serverLunchDate) ? String(serverLunchDate).trim() : '';
    const amount = Math.max(0, Math.floor(Number(fee) || 0));
    const closed = !parts || vacationPaused || !isLunchDeductWindow(parts) || amount <= 0;
    if (closed || serverDate === today) {
        return {
            deduct: false,
            bong,
            lastLunchDeductDate: serverDate,
            today,
            fee: 0,
        };
    }
    return {
        deduct: true,
        bong: bong - amount,
        lastLunchDeductDate: today,
        today,
        fee: amount,
    };
}
