/** 로그인 전 첫 화면은 익명 세션으로 설정을 다시 쓰지 않습니다. */
export function allowBackgroundCloudWrite(loggedIn) {
    return loggedIn === true;
}

/**
 * 학습 온도계 자동 정산은 로그인한 선생님 세션에서만 실행합니다.
 * 로그인 전이거나 선생님 계정이 아니면 정산도 알림도 하지 않습니다.
 */
export function shouldAutoSettleLearningThermometer({ loggedIn, isTeacher } = {}) {
    return loggedIn === true && isTeacher === true;
}

/**
 * 초대 코드 문서를 쓸지 결정합니다.
 * 로그인 전, 또는 같은 학급으로 이미 연결된 코드는 updatedAt만 갈아 쓰지 않습니다.
 * 다른 학급이 가진 코드는 여기서 덮지 않습니다.
 */
export function shouldPersistInviteMapping({ loggedIn, exists, existingClassId, classId } = {}) {
    if (loggedIn !== true) return false;
    const next = String(classId || '').trim();
    if (!next) return false;
    if (!exists) return true;
    const prev = String(existingClassId || '').trim();
    if (prev === next) return false;
    if (prev && prev !== next) return false;
    return true;
}

/**
 * 자정 칭찬 판 넘김 쓰기는 로그인한 세션에서 하루 한 번만 합니다.
 * @param {{ loggedIn: boolean, lastRollDate?: string|null, today: string }} p
 */
export function shouldRunPraiseMidnightRoll({ loggedIn, lastRollDate, today }) {
    if (!allowBackgroundCloudWrite(loggedIn)) return false;
    if (!today) return false;
    return lastRollDate !== today;
}

export const PRAISE_ROLL_MAX_RETRIES = 5;
const PRAISE_ROLL_BACKOFF_MIN = [1, 2, 4, 8];

/**
 * 자정 칭찬 판 넘김을 한 번에 하나만 실행하고, 쓰기가 성공한 뒤에만 그날 날짜를 기록합니다.
 * 실패하면 1→2→4→8분(이후 8분) 간격으로 하루 최대 5번까지만 다시 시도합니다.
 * 날짜가 바뀌거나 로그아웃(다시 로그인) 하면 실패 횟수를 초기화합니다.
 * @param {{ running?: boolean, lastRollDate?: string|null, failDate?: string|null, failCount?: number, nextAt?: number }} state
 * @param {{ loggedIn: boolean, today: string, now?: number }} p
 * @param {() => Promise<unknown>} write
 * @returns {Promise<boolean>} 이번 호출에서 쓰기가 성공했는지
 */
export async function runPraiseMidnightRollOnce(state, { loggedIn, today, now = Date.now() }, write) {
    if (!loggedIn || state.failDate !== today) {
        state.failDate = null;
        state.failCount = 0;
        state.nextAt = 0;
    }
    if (state.running) return false;
    if (!shouldRunPraiseMidnightRoll({ loggedIn, lastRollDate: state.lastRollDate, today })) return false;
    if (state.failCount > PRAISE_ROLL_MAX_RETRIES) return false;
    if (state.failCount > 0 && now < (state.nextAt || 0)) return false;
    state.running = true;
    try {
        await write();
        state.lastRollDate = today;
        state.failCount = 0;
        state.nextAt = 0;
        return true;
    } catch (e) {
        state.failDate = today;
        state.failCount = (state.failCount || 0) + 1;
        const m = PRAISE_ROLL_BACKOFF_MIN[Math.min(state.failCount, PRAISE_ROLL_BACKOFF_MIN.length) - 1];
        state.nextAt = now + m * 60000;
        throw e;
    } finally {
        state.running = false;
    }
}
