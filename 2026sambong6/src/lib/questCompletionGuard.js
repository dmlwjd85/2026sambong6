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

/* ---------- 눌렀다가 취소한 퀘스트(#107) ---------- */

/** 취소 기록은 최근 몇 개까지 남길지 */
export const QUEST_CANCEL_LOG_LIMIT = 60;
/** 퀘스트 취소 때 XP 변동 기록(xpChangeLog)에 남는 사유의 앞머리 */
export const QUEST_CANCEL_REASON_PREFIX = '퀘스트 취소';

/** 취소 기록 목록에 하나를 더해요(최근 것만 남겨요). */
export function recordQuestCancel(list, { id, name = '', date = '', timestamp = 0 } = {}, limit = QUEST_CANCEL_LOG_LIMIT) {
    const cur = (Array.isArray(list) ? list : []).filter((c) => c && c.id && c.date);
    const qid = String(id || '').trim();
    if (!qid || !date) return cur.slice(-limit);
    return cur.concat({ id: qid, name: String(name || qid).slice(0, 60), date: String(date), timestamp: Math.max(0, Math.floor(Number(timestamp) || 0)) }).slice(-limit);
}

/**
 * 그날 이 퀘스트를 눌렀다가 취소했는지. 취소한 뒤 다시 완료했으면 false예요(완료가 이겨요).
 * 취소 기록(questCancels)을 보고, 이 기능이 생기기 전 취소는 XP 변동 기록의 '퀘스트 취소: {id}'로 알아봐요.
 */
export function questCancelledOnDate(state, qId, dateStr) {
    const s = state && typeof state === 'object' ? state : {};
    const id = String(qId || '');
    if (!id || !dateStr) return false;
    if (questHistoryHasOnDate(s.questHistory, id, dateStr)) return false;
    if ((Array.isArray(s.questCancels) ? s.questCancels : []).some((c) => c && String(c.id) === id && c.date === dateStr)) return true;
    const reason = `${QUEST_CANCEL_REASON_PREFIX}: ${id}`;
    return (Array.isArray(s.xpChangeLog) ? s.xpChangeLog : []).some((log) => log && log.reason === reason && toLocalYmd(new Date(Number(log.at) || 0)) === dateStr);
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
export const ACCIDENTAL_POINTER_SUPPRESS_MS = 700;

export function didPointerMoveEnough(startX, startY, endX, endY, threshold = ACCIDENTAL_POINTER_MOVE_PX) {
    return Math.abs(endX - startX) > threshold || Math.abs(endY - startY) > threshold;
}

/** 오늘 완료된 퀘스트를 id|날짜 키로 모읍니다. */
export function todayQuestHistoryKeys(history, dateStr) {
    const date = String(dateStr || '');
    if (!date || !Array.isArray(history)) return [];
    const keys = [];
    const seen = new Set();
    history.forEach((h) => {
        if (!h || !h.id || String(h.date) !== date) return;
        const key = `${h.id}|${h.date}`;
        if (seen.has(key)) return;
        seen.add(key);
        keys.push(key);
    });
    return keys;
}

/** 이 기기에서 누르지 않은 오늘 완료가 새로 생겼는지 봅니다. */
export function unexpectedQuestCompletions(prevKeys, nextKeys, localKeys) {
    const prev = new Set(Array.isArray(prevKeys) ? prevKeys : []);
    const local = new Set(localKeys instanceof Set ? localKeys : (Array.isArray(localKeys) ? localKeys : []));
    return (Array.isArray(nextKeys) ? nextKeys : []).filter((key) => !prev.has(key) && !local.has(key));
}

export function questCompleteConfirmMessage(questName) {
    const name = String(questName || '').trim() || '이 퀘스트';
    return `[${name}] 퀘스트를 완료할까요?\n본인이 직접 한 일만 완료해 주세요.`;
}

/**
 * 신용불량 중에도 퀘스트 완료 저장의 경험치 상승은 허용합니다.
 * 상점·퀴즈 등 다른 저장은 이 표식이 없어 기존처럼 막습니다.
 */
export function creditDefaultAllowsQuestXpGain(opts) {
    if (!opts || typeof opts !== 'object') return false;
    return !!(opts.questCompletionId || opts.allowCreditDefaultQuestXp);
}

/**
 * 현황판용 학생 명단에 지금 플레이어의 퀘스트 기록을 바로 반영합니다.
 * 서버 스냅샷이 오기 전에 취소·완료가 ✓에 나타나게 합니다.
 */
export function patchStudentQuestBoardRow(students, studentId, patch) {
    const sid = String(studentId || '').trim();
    const rows = Array.isArray(students) ? students.slice() : [];
    if (!sid || !patch || typeof patch !== 'object') return rows;
    const idx = rows.findIndex((s) => String(s && s.id) === sid);
    const prev = idx >= 0 && rows[idx] && typeof rows[idx] === 'object' ? rows[idx] : {};
    const next = {
        ...prev,
        ...patch,
        id: sid,
        questHistory: Array.isArray(patch.questHistory)
            ? patch.questHistory.slice()
            : (Array.isArray(prev.questHistory) ? prev.questHistory.slice() : []),
        quests: { ...(prev.quests || {}), ...(patch.quests || {}) },
    };
    if (idx >= 0) rows[idx] = next;
    else rows.push(next);
    return rows;
}
