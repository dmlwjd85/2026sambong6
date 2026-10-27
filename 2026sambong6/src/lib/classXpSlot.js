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
 * 학생 복구는 문서를 통째로 바꿉니다. 백업에는 수업 XP 슬롯이 없습니다.
 * 서버에 슬롯이 있으면 그 값을 그대로 두어야, 슬롯을 지우는 쓰기로 규칙이 복구를 거절하지 않습니다.
 * 서버에 슬롯이 없으면 백업에 들어 있던 슬롯도 넣지 않습니다.
 */
export function keepServerClassXpSlot(restoreData, serverData) {
    const next = { ...(restoreData && typeof restoreData === 'object' ? restoreData : {}) };
    const server = serverData && typeof serverData === 'object' ? serverData : {};
    if (Object.prototype.hasOwnProperty.call(server, 'lastClassXpSlot')) {
        next.lastClassXpSlot = server.lastClassXpSlot;
    } else {
        delete next.lastClassXpSlot;
    }
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

/**
 * 이번 슬롯에 서버 트랜잭션을 돌릴 학생만 고릅니다.
 * 마스터 계정, 빈 id(예: 'student_' 문서), 이미 이번 슬롯을 받은 학생은 읽지 않습니다.
 * 화면 데이터에서 xp가 숫자가 아닌 학생은 invalidXp로 따로 돌려줍니다.
 * skip(학생 → true)으로 신용 불량처럼 대상이 아닌 학생을 뺍니다.
 * settled(id → true)는 이 기기가 이번 슬롯에 이미 처리했거나 잠시 쉬는 학생이에요(화면 데이터가 늦게 와도 다시 읽지 않아요).
 */
export function classXpTargets(students, slotKey, skip = () => false, settled = () => false) {
    const pending = [];
    const invalidXp = [];
    for (const stu of Array.isArray(students) ? students : []) {
        if (!stu || typeof stu !== 'object') continue;
        const id = String(stu.id == null ? '' : stu.id).trim();
        if (!id || id === 'gm' || id === 'gm_a') continue;
        if (skip(stu)) continue;
        const decision = classXpGrantDecision(stu.xp, stu.lastClassXpSlot, slotKey);
        if (decision === 'already') continue;
        if (decision === 'invalid-xp') invalidXp.push(id);
        else if (settled(id)) continue;
        else pending.push(id);
    }
    return { pending, invalidXp };
}

/** 사용량 초과·거절 뒤 다시 시도하지 않고 쉬는 시간(15분). */
export const CLASS_XP_PAUSE_MS = 15 * 60 * 1000;

/** 쉬기 기록. 새로고침해도 이어지도록 저장소에 JSON으로 넣어요. */
export function classXpPauseRecord(nowMs, kind, ms = CLASS_XP_PAUSE_MS) {
    return { at: nowMs, until: nowMs + ms, kind: String(kind || '') };
}

/**
 * 저장된 쉬기 기록에서 아직 유효한 끝 시각(ms)을 돌려줘요. 쉬지 않으면 0이에요.
 * 끝 시각이 지났거나, 형식이 틀렸거나, 끝 시각이 지금+쉬는 시간보다 멀면(기기 시계를 되돌린 경우) 0이에요.
 */
export function classXpPauseUntil(raw, nowMs, ms = CLASS_XP_PAUSE_MS) {
    let rec = raw;
    if (typeof raw === 'string') {
        try { rec = JSON.parse(raw); } catch (_) { return 0; }
    }
    const until = Number(rec && rec.until);
    if (!Number.isFinite(until) || !Number.isFinite(nowMs)) return 0;
    if (until <= nowMs || until > nowMs + ms) return 0;
    return until;
}

/** 저장 실패를 거절(denied), 사용량 초과(quota), 그 밖(other)으로 나눕니다. */
export function classXpErrorKind(error) {
    const code = String((error && error.code) || '');
    if (code === 'permission-denied' || code.endsWith('/permission-denied')) return 'denied';
    if (code === 'resource-exhausted' || code.endsWith('/resource-exhausted')) return 'quota';
    return 'other';
}

function labelList(labels, max = 5) {
    const list = (Array.isArray(labels) ? labels : []).map((v) => String(v || '').trim()).filter(Boolean);
    if (list.length <= max) return list.join(', ');
    return `${list.slice(0, max).join(', ')} 외 ${list.length - max}명`;
}

/**
 * 선생님 화면에 띄울 짧은 알림 한 줄. 알릴 게 없으면 ''입니다.
 * kind: 'quota' | 'denied' | 'other' | 'xp'
 */
export function classXpIssueMessage(kind, timeStr, labels = []) {
    const when = timeStr ? `${timeStr} ` : '';
    const who = labelList(labels);
    if (kind === 'quota') {
        return `⏰ ${when}수업 종료 경험치를 아직 못 줬어요. 오늘 서버 사용량이 다 차서 저장이 막혔어요. 풀리면 자동으로 다시 줄게요.`;
    }
    if (kind === 'denied') {
        return `⏰ ${when}수업 종료 경험치를 저장하지 못했어요. 이 기기 시계를 한국 시간(서울)으로 자동 설정해 주세요. 15분 뒤 자동으로 다시 시도해요.`;
    }
    if (!who) return '';
    if (kind === 'xp') {
        return `⏰ ${when}수업 종료 경험치를 못 준 학생이 있어요. 경험치 값이 숫자가 아니에요: ${who}`;
    }
    return `⏰ ${when}수업 종료 경험치를 못 받은 학생이 있어요. 잠시 뒤 다시 줄게요: ${who}`;
}
