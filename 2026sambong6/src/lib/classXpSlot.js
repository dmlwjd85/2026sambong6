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
 * 이번 종에 경험치를 줄 학생만 고릅니다. 서버를 읽지 않고 화면 데이터만 봐요.
 * 마스터 계정, 빈 id(예: 'student_' 문서), 화면 데이터에서 이미 이번 종을 받은 학생은 뺍니다.
 * 화면 데이터에서 xp가 숫자가 아닌 학생은 invalidXp로 따로 돌려줍니다(묶음 저장 전체가 거절되지 않게요).
 * skip(학생 → true)으로 신용 불량처럼 대상이 아닌 학생을 뺍니다.
 */
export function classXpTargets(students, slotKey, skip = () => false) {
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
        else pending.push(id);
    }
    return { pending, invalidXp };
}

/** 종이 친 뒤 주기까지 기다리는 시간(20초). 기기 시계가 조금 빨라도 서버 규칙이 같은 종으로 보게 여유를 둬요. */
export const CLASS_XP_FIRE_DELAY_MS = 20 * 1000;

/** 타이머를 한 번에 거는 최대 시간(6시간). 기기가 잠들었다 깨거나 시계가 바뀌어도 다시 계산해요. */
export const CLASS_XP_MAX_WAIT_MS = 6 * 60 * 60 * 1000;

/** 한 번에 묶어 저장할 학생 수. Firestore 한 번 저장 한도(500)보다 넉넉히 작게 둬요. */
export const CLASS_XP_CHUNK = 400;

/**
 * 다음에 경험치를 줄 시각(ms): 평일 다음 종 시각 + 20초. 일주일 안에 없으면 null이에요.
 * 종 시각은 지났지만 20초가 아직 안 지났으면 그 종을 돌려줘요.
 */
export function classXpNextFireMs(nowMs, delayMs = CLASS_XP_FIRE_DELAY_MS) {
    if (!Number.isFinite(nowMs)) return null;
    for (let d = 0; d < 8; d += 1) {
        const wall = kstWallClock(new Date(nowMs + d * 86400000));
        if (wall.weekday === 0 || wall.weekday === 6) continue;
        for (const bell of CLASS_XP_END_TIMES) {
            const fireMs = slotFromWall(wall, bell).slotMs + delayMs;
            if (fireMs > nowMs) return fireMs;
        }
    }
    return null;
}

/** 타이머 대기 시간(ms). 최소 1초, 최대 6시간이에요. */
export function classXpTimerDelay(nowMs, fireMs, maxMs = CLASS_XP_MAX_WAIT_MS) {
    if (!Number.isFinite(fireMs) || !Number.isFinite(nowMs)) return maxMs;
    return Math.max(1000, Math.min(fireMs - nowMs, maxMs));
}

/** 이 기기가 이 종을 이미 줬는지(또는 주려고 했는지). 저장소 값은 마지막으로 준 종 키예요. */
export function classXpGivenOnDevice(raw, slotKey) {
    return !!slotKey && String(raw == null ? '' : raw) === String(slotKey);
}

/** 학생 id 목록을 묶음 크기로 나눠요. */
export function classXpChunks(ids, size = CLASS_XP_CHUNK) {
    const list = Array.isArray(ids) ? ids : [];
    const step = Math.max(1, Math.floor(size) || 1);
    const out = [];
    for (let i = 0; i < list.length; i += step) out.push(list.slice(i, i + step));
    return out;
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
        return `⏰ ${when}수업 종료 경험치를 못 줬어요. 오늘 서버 사용량이 다 차서 이번 종은 건너뛰어요.`;
    }
    if (kind === 'denied') {
        return `⏰ ${when}수업 종료 경험치를 저장하지 못해 이번 종은 건너뛰어요. 이 기기 시계를 한국 시간(서울)으로 자동 설정해 주세요.`;
    }
    if (kind === 'other') {
        return `⏰ ${when}수업 종료 경험치를 저장하지 못해 이번 종은 건너뛰어요. 다음 종에는 다시 줄게요.`;
    }
    if (!who) return '';
    return `⏰ ${when}수업 종료 경험치를 못 준 학생이 있어요. 경험치 값이 숫자가 아니에요: ${who}`;
}
