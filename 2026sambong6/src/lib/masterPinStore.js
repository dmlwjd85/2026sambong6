/**
 * 마스터 PIN은 공개 학생 문서에 둘 수 없습니다.
 * 배포된 규칙은 users/{본인 uid} 만 그 사용자가 읽고 쓰게 합니다.
 */

export function masterPinUserPayload({ pin, classId, studentId } = {}) {
    return {
        sambongMasterPin: String(pin || ''),
        sambongMasterClassId: String(classId || ''),
        sambongMasterStudentId: String(studentId || ''),
    };
}

export function masterPinRecordFromUserData(data, { classId, studentId } = {}) {
    if (!data || typeof data !== 'object') return null;
    const pin = String(data.sambongMasterPin || '');
    if (!/^\d{4}$/.test(pin)) return null;
    const savedClass = String(data.sambongMasterClassId || '');
    const savedStudent = String(data.sambongMasterStudentId || '');
    if (classId && savedClass && savedClass !== String(classId)) return null;
    if (studentId && savedStudent && savedStudent !== String(studentId)) return null;
    return { pin, classId: savedClass, studentId: savedStudent };
}

export function isMasterPinStudentId(studentId) {
    const id = String(studentId || '');
    return id === 'gm' || id === 'gm_a';
}
