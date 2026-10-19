/**
 * 마스터 PIN 세션과 유휴 로그아웃.
 * 저장 권한은 gmSessions 문서이고, Google 계정은 요구하지 않습니다.
 */

import { SEED_MASTER_CLASS_ID } from './classCreateRequest.js';

/** GM 화면을 15분 동안 건드리지 않으면 다른 학급은 로그아웃합니다. */
export const GM_IDLE_LOGOUT_MS = 15 * 60 * 1000;

/** 서버 세션 만료. 규칙 상한 12시간보다 짧게 잡아 시계가 조금 빨라도 통과합니다. */
export const GM_SESSION_TTL_MS = 11 * 60 * 60 * 1000;

/** uid당 PIN 시도. 규칙은 15분에 20번입니다. */
export const PIN_ATTEMPT_MAX = 20;
export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * 다음 PIN 시도 문서 값.
 * blocked면 규칙을 호출하지 않습니다. 창이 지나면 count를 1로 다시 시작합니다.
 */
export function planPinAttempt(existing, nowMs) {
    const now = Number(nowMs);
    const windowStartMs = Number(existing && existing.windowStartMs);
    const count = Number(existing && existing.count);
    const windowOpen = Number.isFinite(windowStartMs) && now - windowStartMs < PIN_ATTEMPT_WINDOW_MS;
    if (!windowOpen) return { count: 1, windowStartMs: now, blocked: false };
    if (count >= PIN_ATTEMPT_MAX) return { count, windowStartMs, blocked: true };
    return { count: count + 1, windowStartMs, blocked: false };
}

/**
 * 담임 원래 학급(시드).
 * resolveClassId()가 URL ?class= / ?classId=, localStorage sambong_class_id,
 * window.__app_id 순으로 학급을 정하고, 아무것도 없으면 이 ID를 기본 appId로 씁니다.
 * isDemoSeed 표식만 있는 다른 학급은 여기 포함하지 않습니다.
 */
export const ORIGINAL_HOME_CLASS_ID = SEED_MASTER_CLASS_ID;

export function isOriginalHomeClass(classId) {
    return String(classId == null ? '' : classId).trim() === ORIGINAL_HOME_CLASS_ID;
}

/**
 * GM 유휴 만료.
 * - ignore: GM이 아니라 아무것도 하지 않음
 * - defer: 수업 화면 공유 중이라 타이머만 다시 켬
 * - end-teacher-auth: 원래 학급. 비익명 로그인만 종료. PIN 세션·localStorage·화면 로그인은 유지하고 새로고침하지 않음
 * - full-logout: 다른 학급. 로그인 저장소 삭제, 선생님 세션 종료, 새로고침
 */
export function planGmIdleExpiry({ classId, isAdmin, projectionActive }) {
    if (!isAdmin) return 'ignore';
    if (projectionActive) return 'defer';
    return isOriginalHomeClass(classId) ? 'end-teacher-auth' : 'full-logout';
}

/** 쿼리·테스트 값이 있으면 운영 한도보다 짧게만 유휴 시간을 줄입니다. */
export function resolveGmIdleLogoutMs(override, fallback = GM_IDLE_LOGOUT_MS) {
    if (override == null || override === '') return fallback;
    const n = Number(override);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(Math.floor(n), fallback);
}

export function readGmIdleLogoutOverride(search) {
    try {
        const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
        if (!params.has('gmIdleMs')) return undefined;
        return params.get('gmIdleMs');
    } catch (_) {
        return undefined;
    }
}

/** localhost에서 ?emulator=1 일 때만 로컬 Firebase 에뮬레이터에 붙습니다. */
export function shouldUseLocalFirebaseEmulator({ hostname, search } = {}) {
    const host = String(hostname || '');
    if (host !== 'localhost' && host !== '127.0.0.1') return false;
    try {
        const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
        return params.get('emulator') === '1';
    } catch (_) {
        return false;
    }
}

/** 학생 문서 읽기 전에 선생님 세션을 끊지 못했을 때. PIN은 지우지 않습니다. */
export const TEACHER_SESSION_SIGNOUT_FAILED_MESSAGE = '선생님 인증 세션을 끊지 못해 로그인을 멈췄습니다. 저장된 비밀번호는 그대로 두었습니다. 다시 시도해 주세요.';

/** 원래 학급에서 유휴로 선생님 인증만 풀렸을 때. 화면을 가리지 않는 안내입니다. */
export const HOME_CLASS_IDLE_AUTH_NOTICE = '오래 사용하지 않아 선생님 인증이 풀렸어요. 관리 기능을 쓰려면 다시 인증해 주세요.';

/**
 * 학생 PIN 로그인이 남아 있는 선생님(비익명) 세션을 학생 문서를 읽기 전에 끊을지.
 * gm/gm_a 만 선생님 세션을 유지합니다. 학급과 자동 로그인 여부는 보지 않습니다.
 * 원래 학급의 학생 자동 로그인도 먼저 끊은 뒤 익명으로 다시 들어가 PIN 로그인을 이어 갑니다.
 */
export function shouldSignOutNonAnonymousForPinLogin({ studentId } = {}) {
    const id = String(studentId || '');
    return id !== 'gm' && id !== 'gm_a';
}

export const GM_ONLY_SETTING_KEYS = Object.freeze([
    'shopPrices',
    'customShopItems',
    'convenienceItems',
    'customQuests',
    'deletedQuestIds',
    'customJobs',
    'jobOverrides',
    'deletedJobIds',
    'worldSettings',
    'raidPassword',
    'weekendRaidRewardXp',
    'weekendRaidRewardBong',
    'constitutionItems',
    'bankInterestPercent',
    'bankLoanLimitPerStudent',
    'bankTransferFeeBong',
    'dragonBallFindXp',
    'dragonBallFindBong',
    'dragonBallCompleteXp',
    'dragonBallCompleteBong',
    'convenienceDeliveryFee',
    'announcement',
    'morningActivityNotice',
    'screenNotice',
    'classTimetable',
    'birthdayCelebrations',
    'classModules',
    'externalPortals',
    'weatherRegion',
    'classToolShare',
    'researchJournal',
    'researchSurveyUrl',
    'researchSurveyNote',
    'classWatchOn',
    'curriculumTags',
    'curriculumMapping',
    'applyDefaultTemplatePending',
    'season2StartedAt',
    'season2StartedBy',
    'season2WeaponsClearedAt',
    'season2DragonBallsClearedAt',
    'shieldStockFixedTo5At',
    'season1ItemsRefundedAt',
    'raidPasswordNeedsSetup',
    'learningThermometer',
]);

function providerIds(user) {
    const ids = new Set();
    if (!user || typeof user !== 'object') return ids;
    if (user.providerId && user.providerId !== 'firebase') ids.add(String(user.providerId));
    const list = Array.isArray(user.providerData) ? user.providerData : [];
    list.forEach((entry) => {
        if (entry && entry.providerId) ids.add(String(entry.providerId));
    });
    return ids;
}

/** Google 또는 이메일/비밀번호로 로그인한 계정인지. 익명·빈 사용자는 아닙니다. */
export function isTeacherProvider(user) {
    if (!user || user.isAnonymous) return false;
    const ids = providerIds(user);
    return ids.has('google.com') || ids.has('password');
}

/**
 * 선생님 허용 목록(admins)을 읽는 동안 세션이 바뀌면 그 결과로 배지를 덮지 않습니다.
 * 학생 PIN 로그인이 선생님 세션을 끊은 뒤, 늦게 도착한 "인증됨"이 배지에 남으면 안 됩니다.
 * requestUser 는 읽기를 시작한 사용자, currentUser 는 읽기가 끝난 뒤의 사용자입니다.
 */
export function shouldApplyTeacherBadgeRead(requestUser, currentUser) {
    if (!isTeacherProvider(requestUser)) return true;
    if (!isTeacherProvider(currentUser)) return false;
    return String(requestUser.uid || '') === String(currentUser.uid || '');
}

/**
 * popup_blocked | bad_credentials | network | permission_denied | provider_disabled | unknown
 */
export function classifyAuthError(error) {
    const code = String((error && (error.code || error.message)) || '').toLowerCase();
    if (
        code.includes('popup-blocked')
        || code.includes('popup-closed')
        || code.includes('cancelled-popup')
    ) {
        return 'popup_blocked';
    }
    if (
        code.includes('invalid-credential')
        || code.includes('wrong-password')
        || code.includes('user-not-found')
        || code.includes('invalid-email')
        || code.includes('invalid-login')
        || code.includes('missing-password')
    ) {
        return 'bad_credentials';
    }
    if (code.includes('network')) return 'network';
    if (code.includes('permission-denied') || code.includes('insufficient permissions')) {
        return 'permission_denied';
    }
    if (code.includes('unauthorized-domain') || code.includes('operation-not-allowed')) {
        return 'provider_disabled';
    }
    return 'unknown';
}

/** 화면 배지. 인증됨(이메일) / 권한 없음 / 미인증 */
export function teacherAuthStatusText(state) {
    const current = state || {};
    if (current.allowlisted) {
        return current.email ? `인증됨(${current.email})` : '인증됨';
    }
    if (current.authenticated) return '권한 없음';
    return '미인증';
}

export function teacherAuthFailureMessage(reason) {
    switch (reason) {
        case 'popup_blocked':
            return 'Google 로그인 창이 열리지 않았습니다. 이메일과 비밀번호로 인증해 주세요.';
        case 'bad_credentials':
            return '이메일 또는 비밀번호가 맞지 않습니다.';
        case 'network':
            return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
        case 'not_allowlisted':
            return '권한 없음. 이 계정은 관리자 목록(admins)에 없습니다. 콘솔에서 사용자 UID로 admins 문서를 만든 뒤 다시 시도해 주세요.';
        case 'provider_disabled':
            return '이 로그인 방식이 아직 켜져 있지 않습니다. Firebase 콘솔에서 Google 또는 이메일/비밀번호를 사용 설정해 주세요.';
        case 'permission_denied':
            return '저장이 거부되었습니다. 로그인 세션이 없거나 값 형식이 규칙과 맞지 않습니다.';
        default:
            return '선생님 계정 인증에 실패했습니다. 다시 시도해 주세요.';
    }
}
