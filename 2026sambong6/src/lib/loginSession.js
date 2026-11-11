/** 이 기기에 남기는 학급·역할·학생 로그인. Firebase Auth 와 따로 둡니다. */

export const LOGIN_ID_KEY = 'sambong_student_id';
export const LOGIN_PIN_KEY = 'sambong_student_pin';
export const LOGIN_ROLE_KEY = 'sambong_login_role';
export const CLASS_ID_KEY = 'sambong_class_id';

export function loginRoleForStudentId(studentId) {
    const id = String(studentId || '');
    if (id === 'gm' || id === 'gm_a') return 'master';
    return 'student';
}

export function readPersistedLogin(storage) {
    if (!storage) return null;
    const studentId = String(storage.getItem(LOGIN_ID_KEY) || '').trim();
    const pin = String(storage.getItem(LOGIN_PIN_KEY) || '').trim();
    if (!studentId || !pin) return null;
    const classId = String(storage.getItem(CLASS_ID_KEY) || '').trim();
    const storedRole = String(storage.getItem(LOGIN_ROLE_KEY) || '').trim();
    const role = storedRole === 'teacher' || storedRole === 'master' || storedRole === 'student'
        ? storedRole
        : loginRoleForStudentId(studentId);
    return { studentId, pin, classId, role };
}

export function writePersistedLogin(storage, { studentId, pin, role, classId } = {}) {
    if (!storage) return;
    const id = String(studentId || '').trim();
    const nextPin = String(pin || '');
    if (!id || !nextPin) return;
    const nextRole = role === 'teacher' || role === 'master' || role === 'student'
        ? role
        : loginRoleForStudentId(id);
    storage.setItem(LOGIN_ID_KEY, id);
    storage.setItem(LOGIN_PIN_KEY, nextPin);
    storage.setItem(LOGIN_ROLE_KEY, nextRole);
    const nextClass = String(classId || '').trim();
    if (nextClass) storage.setItem(CLASS_ID_KEY, nextClass);
}

export function clearPersistedLoginIdentity(storage) {
    if (!storage) return;
    storage.removeItem(LOGIN_ID_KEY);
    storage.removeItem(LOGIN_PIN_KEY);
    storage.removeItem(LOGIN_ROLE_KEY);
}

/**
 * 배포 규칙이 마스터 문서의 pin 필드를 비워 둔 경우에도,
 * 이 기기에 저장해 둔 마스터 세션이면 PIN 창 없이 다시 들어갑니다.
 * 서버에 pin 이 있으면 그 값과 맞는지 기존 비교를 그대로 탑니다.
 */
export function shouldRestoreLoginWithoutServerPin({ isAutoLogin, isAdmin, savedPin } = {}) {
    return isAutoLogin === true && isAdmin === true && String(savedPin || '').length > 0;
}

/** 학급 문서·개설 요청에 저장하는 학생 자동 로그인 설정 이름 */
export const STUDENT_AUTO_LOGIN_FIELD = 'studentAutoLoginEnabled';

/**
 * 값이 없거나 true면 켜짐(지금과 같음). 명시적으로 false일 때만 꺼짐.
 * 기존 학급은 이 필드가 없으니 항상 켜짐으로 봅니다.
 */
export function isStudentAutoLoginEnabled(source) {
    if (typeof source === 'boolean') return source !== false;
    if (source && typeof source === 'object') {
        return source[STUDENT_AUTO_LOGIN_FIELD] !== false;
    }
    return true;
}

/** 저장할 때는 true/false만 남깁니다. 없거나 true면 true. */
export function normalizeStudentAutoLoginEnabled(raw) {
    return raw !== false;
}

/**
 * 앱을 새로 열 때(새로고침·재방문) 이 학급의 자동 로그인이 꺼져 있으면,
 * 이 기기에 남은 그 학급 로그인(학번·PIN·역할)을 지웁니다.
 * PIN 없이 학번만 남아 있어도 지웁니다(꺼진 반은 로그인 중에 학번만 남겨 두니까요).
 * 학급 연결(sambong_class_id)과 다른 학급 로그인은 그대로 둡니다.
 */
export function clearPersistedLoginIfDisabled(storage, { classId, enabled } = {}) {
    if (!storage) return false;
    if (isStudentAutoLoginEnabled(enabled)) return false;
    const savedId = String(storage.getItem(LOGIN_ID_KEY) || '').trim();
    const savedPin = String(storage.getItem(LOGIN_PIN_KEY) || '').trim();
    if (!savedId && !savedPin) return false;
    const savedClass = String(storage.getItem(CLASS_ID_KEY) || '').trim();
    const target = String(classId || '').trim();
    if (target && savedClass && savedClass !== target) return false;
    clearPersistedLoginIdentity(storage);
    return true;
}

/**
 * 자동 로그인을 끈 반에서 로그인했을 때 씁니다.
 * 앱 곳곳(동기화·따봉·주문·송금 등)이 로그인 중에 sambong_student_id 로 '나'를 찾으니
 * 학번·역할은 남기고, 다음에 저절로 들어오는 데 쓰는 PIN만 저장하지 않습니다.
 */
export function writeSessionLoginWithoutPin(storage, { studentId, role, classId } = {}) {
    if (!storage) return;
    const id = String(studentId || '').trim();
    storage.removeItem(LOGIN_PIN_KEY);
    if (!id) return;
    const nextRole = role === 'teacher' || role === 'master' || role === 'student'
        ? role
        : loginRoleForStudentId(id);
    storage.setItem(LOGIN_ID_KEY, id);
    storage.setItem(LOGIN_ROLE_KEY, nextRole);
    const nextClass = String(classId || '').trim();
    if (nextClass) storage.setItem(CLASS_ID_KEY, nextClass);
}

/** 저장된 PIN만 지웁니다. 학번·역할·학급 연결은 그대로라 지금 화면은 계속 쓸 수 있어요. */
export function forgetSavedLoginPin(storage) {
    if (!storage) return false;
    const had = !!String(storage.getItem(LOGIN_PIN_KEY) || '');
    storage.removeItem(LOGIN_PIN_KEY);
    return had;
}

/**
 * 같은 브라우저의 다른 탭이 앱을 새로 열면서 꺼진 반 학번을 지웠을 때,
 * 이미 로그인해 쓰고 있는 탭이 자기 학번을 다시 적어 둡니다(PIN은 적지 않아요).
 */
export function restoreSessionLoginIfCleared(storage, identity) {
    if (!storage || !identity) return false;
    const id = String(identity.studentId || '').trim();
    if (!id) return false;
    if (String(storage.getItem(LOGIN_ID_KEY) || '').trim()) return false;
    writeSessionLoginWithoutPin(storage, { studentId: id, role: identity.role, classId: '' });
    return true;
}

/** '이 반으로 이동' 직후 한 번만 PIN 없이 들어가게 하는 표시(같은 탭 sessionStorage). */
export const AUTO_LOGIN_HANDOFF_KEY = 'sambong_autologin_handoff';

export function markAutoLoginHandoff(session, classId) {
    const id = String(classId || '').trim();
    if (!session || !id) return;
    try { session.setItem(AUTO_LOGIN_HANDOFF_KEY, id); } catch (_) { /* ignore */ }
}

/** 표시는 읽자마자 지웁니다. 이 학급 표시였을 때만 true. */
export function consumeAutoLoginHandoff(session, classId) {
    if (!session) return false;
    let saved = '';
    try {
        saved = String(session.getItem(AUTO_LOGIN_HANDOFF_KEY) || '').trim();
        session.removeItem(AUTO_LOGIN_HANDOFF_KEY);
    } catch (_) { return false; }
    const target = String(classId || '').trim();
    return !!saved && !!target && saved === target;
}

/**
 * 앱을 열 때 저장된 로그인으로 들어갈지 정합니다.
 * - 켜진 반(값 없음 포함): 지금과 같아요. 저장된 로그인이 있으면 들어가요.
 * - 꺼진 반: 저장된 학번·PIN을 지우고 로그인 화면을 보여요.
 *   단, '이 반으로 이동' 직후(같은 탭 표시)에는 한 번만 들어가요.
 */
export function prepareStartupLogin(storage, session, { classId, enabled } = {}) {
    if (isStudentAutoLoginEnabled(enabled)) {
        return { savedLogin: readPersistedLogin(storage), handoff: false };
    }
    const handoff = consumeAutoLoginHandoff(session, classId);
    if (handoff) {
        const savedLogin = readPersistedLogin(storage);
        if (savedLogin) return { savedLogin, handoff: true };
    }
    clearPersistedLoginIfDisabled(storage, { classId, enabled: false });
    return { savedLogin: null, handoff: false };
}

/**
 * 이 탭이 쓰려는 학생 문서(student_학번)가 지금 이 기기에 적힌 학번과 같은지 봅니다.
 * 같은 브라우저 다른 탭에서 다른 학생이 들어오면 학번이 바뀌어요. 그때 낡은 탭이
 * 다른 학생 문서(PIN 포함)를 덮지 않게 저장 전에 씁니다. 학번이 비어 있으면 예전처럼 통과.
 */
export function isOwnStudentDocId(docId, storedStudentId) {
    const id = String(storedStudentId ?? '').trim();
    if (!id) return true;
    return String(docId || '') === 'student_' + id;
}

/** 다른 탭이 이 기기 학번을 '다른 학생'으로 바꿨는지(지운 경우는 아님). */
export function isOtherStudentTakeover(myStudentId, nextStudentId) {
    const mine = String(myStudentId ?? '').trim();
    const next = String(nextStudentId ?? '').trim();
    return !!mine && !!next && mine !== next;
}
