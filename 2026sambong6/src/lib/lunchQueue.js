/**
 * 밥줄에는 학급 명단의 활성 학생만 올립니다.
 * Firestore에만 남은 문서(비활성·삭제된 번호)는 유령으로 보이지 않게 뺍니다.
 */

export function filterLunchQueueStudents(students, activeIds) {
    const allow = new Set(
        (Array.isArray(activeIds) ? activeIds : [])
            .map((id) => String(id || '').trim())
            .filter((id) => id && id !== 'gm' && id !== 'gm_a' && id !== 'guest'),
    );
    return (Array.isArray(students) ? students : []).filter((s) => allow.has(String(s && s.id || '').trim()));
}

/** 밥줄에 올릴 이름. 명단 이름만 쓰고, 학번만 있는 값은 비웁니다. */
export function lunchQueueDisplayName(student, names) {
    const id = String(student && student.id || '').trim();
    const map = names && typeof names === 'object' ? names : {};
    const fromMap = String(map[id] || '').trim();
    if (fromMap) return fromMap;
    const fromRow = String((student && student.name) || '').trim();
    if (fromRow && fromRow !== id) return fromRow;
    return '';
}
