/**
 * 다른 학급·데모 화면에 실명 명단이 실리지 않도록 일반 이름만 만듭니다.
 * 시드 교실의 실제 명단은 Firestore 문서에만 두고, 배포 JS에는 넣지 않습니다.
 */

export function buildGenericDemoRoster(count = 24) {
    const n = Math.max(1, Math.min(40, Math.floor(Number(count) || 24)));
    return Array.from({ length: n }, (_, i) => ({
        id: String(i + 1),
        name: `학생 ${i + 1}`,
        gender: i % 2 === 0 ? 'M' : 'F',
        label: '',
        active: true,
    }));
}

export function genericStudentNameMap(count = 24) {
    const names = { gm: '담임 선생님', guest: '손님' };
    buildGenericDemoRoster(count).forEach((row) => {
        names[row.id] = row.name;
    });
    return names;
}

export function genericStudentGenderMap(count = 24) {
    const genders = { gm: 'M', guest: 'M' };
    buildGenericDemoRoster(count).forEach((row) => {
        genders[row.id] = row.gender;
    });
    return genders;
}
