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
