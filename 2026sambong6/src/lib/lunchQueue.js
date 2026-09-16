/**
 * 밥줄에는 학급 명단의 활성 학생만 올립니다.
 * Firestore에만 남은 문서(비활성·삭제된 번호)는 유령으로 보이지 않게 뺍니다.
 */

export function filterLunchQueueStudents(students, activeIds) {
    const allow = new Set(
        (Array.isArray(activeIds) ? activeIds : [])
            .map((id) => String(id || '').trim())
            .filter((id) => id && id !== 'gm' && id !== 'gm_a' && id !== 'guest'),
    );
    return (Array.isArray(students) ? students : []).filter((s) => allow.has(String(s && s.id || '').trim()));
}

/** 밥줄에 올릴 이름. 명단 이름만 쓰고, 학번만 있는 값은 비웁니다. */
export function lunchQueueDisplayName(student, names) {
    const id = String(student && student.id || '').trim();
    const map = names && typeof names === 'object' ? names : {};
    const fromMap = String(map[id] || '').trim();
    if (fromMap) return fromMap;
    const fromRow = String((student && student.name) || '').trim();
    if (fromRow && fromRow !== id) return fromRow;
    return '';
}

/** 밥줄 투자는 평일 낮 12시(정오) 직전까지. 순위는 12시 10분에 공개합니다. */
export const LUNCH_BID_CLOSE_HOUR = 12;
export const LUNCH_BID_CLOSE_MINUTE = 0;
export const LUNCH_RANK_REVEAL_HOUR = 12;
export const LUNCH_RANK_REVEAL_MINUTE = 10;

function asDate(now) {
    if (now instanceof Date) return now;
    const d = new Date(now);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function minutesOfDay(now) {
    const d = asDate(now);
    return d.getHours() * 60 + d.getMinutes();
}

function isWeekday(now) {
    const day = asDate(now).getDay();
    return day >= 1 && day <= 5;
}

/** 평일 낮 12시까지 밥줄 투자가 열려 있는지. */
export function isLunchBidOpen(now = new Date()) {
    if (!isWeekday(now)) return false;
    return minutesOfDay(now) < (LUNCH_BID_CLOSE_HOUR * 60 + LUNCH_BID_CLOSE_MINUTE);
}

/** 학생에게 급식 순위를 보여줄 시각인지. 선생님은 항상 봅니다. */
export function isLunchRankVisible(now = new Date(), isAdmin = false) {
    if (isAdmin) return true;
    return minutesOfDay(now) >= (LUNCH_RANK_REVEAL_HOUR * 60 + LUNCH_RANK_REVEAL_MINUTE);
}

export function lunchBidClosedReason(now = new Date()) {
    if (isLunchBidOpen(now)) return '';
    if (!isWeekday(now)) return '주말에는 밥줄 투자를 할 수 없어요. 평일 낮 12시까지 투자하세요.';
    return '밥줄 투자는 평일 낮 12시까지입니다. 지금은 마감됐어요.';
}
