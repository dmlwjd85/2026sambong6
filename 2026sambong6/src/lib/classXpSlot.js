/** 수업 종료 자동 XP 시각. 기기 시간대와 무관하게 한국 표준시로 계산합니다. */
export const CLASS_XP_END_TIMES = Object.freeze(['09:40', '10:30', '11:20', '12:10', '13:50', '14:40']);

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad2(n) {
    return String(n).padStart(2, '0');
}

export function kstWallClock(now = new Date()) {
    const shifted = new Date(now.getTime() + KST_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hours: shifted.getUTCHours(),
        minutes: shifted.getUTCMinutes(),
        seconds: shifted.getUTCSeconds(),
        weekday: shifted.getUTCDay(),
    };
}

function slotFromWall(wall, timeStr) {
    const [hours, minutes] = timeStr.split(':').map((part) => Number(part));
    const slotMs = Date.UTC(wall.year, wall.month - 1, wall.day, hours, minutes, 0, 0) - KST_OFFSET_MS;
    return {
        key: `${wall.year}_${pad2(wall.month)}_${pad2(wall.day)}_${timeStr}`,
        slotMs,
        timeStr,
        ymd: `${wall.year}-${pad2(wall.month)}-${pad2(wall.day)}`,
    };
}

/**
 * 지금이 평일 종 시각(분)이면 슬롯 키와 epoch를 돌려줍니다.
 * 주말이나 종 시각이 아니면 null입니다.
 */
export function classXpSlotFromTime(now = new Date()) {
    const wall = kstWallClock(now);
    if (wall.weekday === 0 || wall.weekday === 6) return null;
    const timeStr = `${pad2(wall.hours)}:${pad2(wall.minutes)}`;
    if (!CLASS_XP_END_TIMES.includes(timeStr)) return null;
    return slotFromWall(wall, timeStr);
}

/**
 * 오늘(한국 표준시, 평일) 이미 지난 종 가운데 가장 최근 것.
 * 09:40 이전, 주말, 또는 아직 아무 종도 안 쳤으면 null입니다.
 * 그 시각의 1분이 지나도 다음 종 전까지는 같은 슬롯을 돌려줍니다.
 * 더 이전 종은 다시 지급하지 않습니다.
 */
export function classXpCatchupSlot(now = new Date()) {
    const wall = kstWallClock(now);
    if (wall.weekday === 0 || wall.weekday === 6) return null;
    const minutes = wall.hours * 60 + wall.minutes;
    let timeStr = '';
    for (const bell of CLASS_XP_END_TIMES) {
        const [hours, mins] = bell.split(':').map((part) => Number(part));
        if (hours * 60 + mins <= minutes) timeStr = bell;
    }
    if (!timeStr) return null;
    return slotFromWall(wall, timeStr);
}

/** 학생 저장이 서버의 수업 XP 슬롯을 덮지 않도록 필드만 뺍니다. */
export function omitClassXpSlot(data) {
    if (!data || typeof data !== 'object') return data;
    if (!Object.prototype.hasOwnProperty.call(data, 'lastClassXpSlot')) return data;
    const next = { ...data };
    delete next.lastClassXpSlot;
    return next;
}

/**
 * 한 학생 문서에 이번 슬롯을 쓸지 판단합니다.
 * xp가 유한한 숫자가 아니면 grant가 아닙니다. 문자열을 0으로 바꾸지 않습니다.
 */
export function classXpGrantDecision(xp, lastSlot, slotKey) {
    if (typeof xp !== 'number' || !Number.isFinite(xp)) return 'invalid-xp';
    if (String(lastSlot || '') === String(slotKey || '')) return 'already';
    return 'grant';
}
