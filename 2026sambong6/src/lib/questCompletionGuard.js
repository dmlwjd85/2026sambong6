/**
 * 퀘스트 완료 판정은 quests 플래그가 아니라 완료 기록(questHistory)을 기준으로 합니다.
 * 어제 체크가 남거나, 스크롤·스와이프 오터치로 플래그만 켜진 경우를 걸러냅니다.
 */

function pad2(n) {
    return String(n).padStart(2, '0');
}

export function toLocalYmd(input = new Date()) {
    if (input == null || input === '') return '';
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysYmd(ymd, days) {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(y, m - 1, d + days);
    return toLocalYmd(dt);
}

/** 월요일 시작 주(월~일) — 활용 통계와 동일 */
export function startOfWeekMondayYmd(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return toLocalYmd(x);
}

export function weekRangeMondaySunday(d = new Date()) {
    const start = startOfWeekMondayYmd(d);
    return { start, end: addDaysYmd(start, 6) };
}

export function questHistoryHasOnDate(history, qId, dateStr) {
    if (!qId || !dateStr || !Array.isArray(history)) return false;
    const id = String(qId);
    return history.some((h) => h && String(h.id) === id && h.date === dateStr);
}

export function questHistoryHasInRange(history, qId, startStr, endStr) {
    if (!qId || !startStr || !endStr || !Array.isArray(history)) return false;
    const id = String(qId);
    return history.some((h) => {
        if (!h || String(h.id) !== id || !h.date) return false;
        return h.date >= startStr && h.date <= endStr;
    });
}

/** 오늘 일일 퀘스트 실제 완료 — 기록 날짜가 오늘인 경우만 */
export function isDailyQuestCompletedToday(state, qId, todayStr) {
    return questHistoryHasOnDate(state && state.questHistory, qId, todayStr);
}

/** 이번 주 주간 퀘스트 실제 완료 — 월~일 구간에 기록이 있는 경우만 */
export function isWeeklyQuestCompletedThisWeek(state, qId, weekStart, weekEnd) {
    return questHistoryHasInRange(state && state.questHistory, qId, weekStart, weekEnd);
}

/**
 * 화면/관리자 보드용 완료 여부.
 * 일일·주간은 기록을 우선하고, quests 플래그만 켜진 잔존 체크는 완료로 보지 않습니다.
 */
export function isQuestCompletedForUi(state, quest, todayStr, weekRange) {
    if (!state || !quest) return false;
    const qId = quest.id;
    if (quest.type === 'daily') {
        return isDailyQuestCompletedToday(state, qId, todayStr);
    }
    if (quest.type === 'weekly') {
        const range = weekRange || weekRangeMondaySunday();
        return isWeeklyQuestCompletedThisWeek(state, qId, range.start, range.end);
    }
    return !!(state.quests && state.quests[qId]);
}

/**
 * 오늘 기록이 없는 일일 퀘스트 체크를 해제합니다.
 * @returns {boolean} 변경 여부
 */
export function sanitizeDailyQuestFlags(state, dailyQuestIds, gameDateStr) {
    if (!state || !gameDateStr) return false;
    const ids = Array.isArray(dailyQuestIds) ? dailyQuestIds : [];
    const idSet = new Set(ids.map(String));
    const history = Array.isArray(state.questHistory) ? state.questHistory : [];
    const doneToday = new Set(
        history
            .filter((q) => q && q.date === gameDateStr && idSet.has(String(q.id)))
            .map((q) => String(q.id))
    );
    const quests = { ...(state.quests || {}) };
    let changed = false;
    ids.forEach((qId) => {
        const key = String(qId);
        if (quests[key] && !doneToday.has(key)) {
            quests[key] = false;
            changed = true;
        }
    });
    if (changed) state.quests = quests;
    return changed;
}

/**
 * 이번 주 기록이 없는 주간 퀘스트 체크를 해제합니다.
 * @returns {boolean} 변경 여부
 */
export function sanitizeWeeklyQuestFlags(state, weeklyQuestIds, weekStart, weekEnd) {
    if (!state || !weekStart || !weekEnd) return false;
    const ids = Array.isArray(weeklyQuestIds) ? weeklyQuestIds : [];
    const history = Array.isArray(state.questHistory) ? state.questHistory : [];
    const quests = { ...(state.quests || {}) };
    let changed = false;
    ids.forEach((qId) => {
        const key = String(qId);
        if (quests[key] && !questHistoryHasInRange(history, key, weekStart, weekEnd)) {
            quests[key] = false;
            changed = true;
        }
    });
    if (changed) state.quests = quests;
    return changed;
}

/** 스크롤·스와이프 후 따라오는 클릭을 무시할 픽셀 임계값 */
export const ACCIDENTAL_POINTER_MOVE_PX = 12;
export const ACCIDENTAL_POINTER_SUPPRESS_MS = 450;

export function didPointerMoveEnough(startX, startY, endX, endY, threshold = ACCIDENTAL_POINTER_MOVE_PX) {
    return Math.abs(endX - startX) > threshold || Math.abs(endY - startY) > threshold;
}
