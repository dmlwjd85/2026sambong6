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
