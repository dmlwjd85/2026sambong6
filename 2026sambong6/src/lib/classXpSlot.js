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

/**
 * 지금이 평일 종 시각(분)이면 슬롯 키와 epoch를 돌려줍니다.
 * 주말이나 종 시각이 아니면 null입니다.
 */
export function classXpSlotFromTime(now = new Date()) {
    const wall = kstWallClock(now);
    if (wall.weekday === 0 || wall.weekday === 6) return null;
    const timeStr = `${pad2(wall.hours)}:${pad2(wall.minutes)}`;
    if (!CLASS_XP_END_TIMES.includes(timeStr)) return null;
    const slotMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hours, wall.minutes, 0, 0) - KST_OFFSET_MS;
    return {
        key: `${wall.year}_${pad2(wall.month)}_${pad2(wall.day)}_${timeStr}`,
        slotMs,
        timeStr,
        ymd: `${wall.year}-${pad2(wall.month)}-${pad2(wall.day)}`,
    };
}
