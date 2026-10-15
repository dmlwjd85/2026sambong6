/**
 * 선생님 계정 인증 판별.
 * Firestore 규칙의 isAdmin() 과 맞춥니다. 익명 로그인은 선생님이 아닙니다.
 */

/** GM 화면을 15분 동안 건드리지 않으면 선생님 세션을 끊습니다. */
export const GM_IDLE_LOGOUT_MS = 15 * 60 * 1000;

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
    'lastAutoXpTime',
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
            return '저장이 거부되었습니다. 선생님 계정 인증, admins 문서, classIds에 이 학급 ID가 있는지 확인해 주세요.';
        default:
            return '선생님 계정 인증에 실패했습니다. 다시 시도해 주세요.';
    }
}
