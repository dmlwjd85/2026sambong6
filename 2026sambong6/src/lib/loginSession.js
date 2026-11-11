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
 * 이 학급의 자동 로그인이 꺼져 있고, 이 기기에 그 학급 로그인이 남아 있으면 지웁니다.
 * 학급 연결(sambong_class_id)과 다른 학급 로그인은 그대로 둡니다.
 */
export function clearPersistedLoginIfDisabled(storage, { classId, enabled } = {}) {
    if (!storage) return false;
    if (isStudentAutoLoginEnabled(enabled)) return false;
    const saved = readPersistedLogin(storage);
    if (!saved) return false;
    const savedClass = String(saved.classId || storage.getItem(CLASS_ID_KEY) || '').trim();
    const target = String(classId || '').trim();
    if (target && savedClass && savedClass !== target) return false;
    clearPersistedLoginIdentity(storage);
    return true;
}

