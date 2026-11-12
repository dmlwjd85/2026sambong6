/**
 * 새 학급 온보딩 — 학생 명단 엑셀/CSV를 학급 명단(roster)으로 바꿉니다.
 * 이 파일은 2차원 배열(AOA)만 다룹니다. 엑셀 파일 읽기·쓰기는 rosterWorkbook.js 가 합니다.
 */

/** 학급 명단 최대 인원 (명단 편집 화면과 같음) */
export const ROSTER_MAX = 40;
/** 이름 최대 글자 수 */
export const ROSTER_NAME_MAX = 20;
/** 별칭 최대 글자 수 */
export const ROSTER_LABEL_MAX = 20;

/** 서식 1행 */
export const ROSTER_HEADERS = ['번호', '이름', '성별', '별칭'];

const HEADER_ALIASES = {
    번호: 'id',
    학번: 'id',
    출석번호: 'id',
    no: 'id',
    id: 'id',
    이름: 'name',
    성명: 'name',
    학생: 'name',
    학생이름: 'name',
    name: 'name',
    성별: 'gender',
    gender: 'gender',
    sex: 'gender',
    별칭: 'label',
    메모: 'label',
    label: 'label',
};

const FEMALE = new Set(['여', '여자', '여학생', 'f', 'female', 'w', '2']);
const MALE = new Set(['남', '남자', '남학생', 'm', 'male', '1']);

function cellText(v) {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
}

function headerKey(cell) {
    const k = cellText(cell).toLowerCase().replace(/\s+/g, '').replace(/[_\-()]/g, '');
    return HEADER_ALIASES[k] || '';
}

/**
 * 성별 칸을 'M' / 'F' 로. 비었거나 알 수 없으면 null.
 * @param {*} raw
 */
export function normalizeRosterGender(raw) {
    const k = cellText(raw).toLowerCase();
    if (!k) return null;
    if (FEMALE.has(k)) return 'F';
    if (MALE.has(k)) return 'M';
    return null;
}

/**
 * 번호 칸. 1~99 정수만 받습니다. "3번", "03" 도 3으로 읽습니다.
 * @param {*} raw
 * @returns {string} 비어 있거나 잘못되면 ''
 */
export function normalizeRosterId(raw) {
    const t = cellText(raw).replace(/번$/, '');
    if (!/^\d{1,2}(\.0+)?$/.test(t)) return '';
    const n = Math.floor(Number(t));
    return n >= 1 && n <= 99 ? String(n) : '';
}

/**
 * 1행 헤더가 있는 AOA를 명단으로 바꿉니다.
 * 헤더가 없고 첫 칸이 번호처럼 보이면 [번호, 이름, 성별, 별칭] 순서로 읽습니다.
 * 번호가 비면 앞 번호 다음 번호를 붙입니다.
 * @param {any[][]} aoa
 * @returns {{ roster: {id:string,name:string,gender:'M'|'F',label:string,active:boolean}[], errors: string[], warnings: string[] }}
 */
export function parseRosterAoa(aoa) {
    const errors = [];
    const warnings = [];
    const roster = [];
    const rows = Array.isArray(aoa) ? aoa.filter((r) => Array.isArray(r)) : [];
    if (!rows.length) return { roster, errors: ['명단이 비어 있습니다.'], warnings };

    const first = rows[0].map(headerKey);
    let colMap;
    let start;
    if (first.includes('name')) {
        colMap = {};
        first.forEach((k, i) => {
            if (k && colMap[k] == null) colMap[k] = i;
        });
        start = 1;
    } else {
        colMap = { id: 0, name: 1, gender: 2, label: 3 };
        start = 0;
        if (!normalizeRosterId(rows[0][0])) {
            return { roster, errors: ['1행에 「이름」 열이 없습니다. 명단 서식을 받아 작성해 주세요.'], warnings };
        }
    }

    const seen = new Set();
    let lastNum = 0;
    for (let r = start; r < rows.length; r++) {
        const row = rows[r];
        const get = (k) => (colMap[k] != null ? row[colMap[k]] : '');
        const name = cellText(get('name'));
        const rawId = cellText(get('id'));
        if (!name && !rawId) continue;
        const line = `${r + 1}행`;
        if (!name) {
            errors.push(`${line}: 이름이 비어 있습니다.`);
            continue;
        }
        let id = normalizeRosterId(rawId);
        if (rawId && !id) {
            errors.push(`${line}: 번호 「${rawId}」를 읽지 못했습니다. 1~99 숫자로 적어 주세요.`);
            continue;
        }
        if (!id) {
            let n = lastNum + 1;
            while (seen.has(String(n))) n += 1;
            id = String(n);
            warnings.push(`${line}: 번호가 없어 ${id}번을 붙였습니다.`);
        }
        if (seen.has(id)) {
            errors.push(`${line}: ${id}번이 겹칩니다.`);
            continue;
        }
        if (roster.length >= ROSTER_MAX) {
            errors.push(`${line}: 최대 ${ROSTER_MAX}명까지 올릴 수 있어 나머지는 건너뜁니다.`);
            break;
        }
        let gender = normalizeRosterGender(get('gender'));
        if (!gender) {
            if (cellText(get('gender'))) warnings.push(`${line}: 성별 「${cellText(get('gender'))}」를 몰라 남으로 두었습니다.`);
            gender = 'M';
        }
        if (name.length > ROSTER_NAME_MAX) warnings.push(`${line}: 이름이 길어 ${ROSTER_NAME_MAX}자로 줄였습니다.`);
        seen.add(id);
        lastNum = Math.max(lastNum, Number(id));
        roster.push({
            id,
            name: name.slice(0, ROSTER_NAME_MAX),
            gender,
            label: cellText(get('label')).slice(0, ROSTER_LABEL_MAX),
            active: true,
        });
    }
    roster.sort((a, b) => Number(a.id) - Number(b.id));
    if (!roster.length && !errors.length) errors.push('읽을 수 있는 학생이 없습니다.');
    return { roster, errors, warnings };
}

/**
 * 올린 명단을 기존 명단에 반영할 계획.
 * 기존에 있는데 새 명단에 없는 번호는 지우지 않고 비활성으로 남깁니다(데이터 보존).
 * @param {object[]} current 기존 roster
 * @param {object[]} incoming parseRosterAoa 결과 roster
 */
export function planRosterImport(current, incoming) {
    const cur = Array.isArray(current) ? current : [];
    const next = Array.isArray(incoming) ? incoming : [];
    const byId = new Map(cur.map((r) => [String(r && r.id), r]));
    const nextIds = new Set(next.map((r) => String(r.id)));
    const added = [];
    const renamed = [];
    next.forEach((r) => {
        const prev = byId.get(String(r.id));
        if (!prev) added.push(r.id);
        else if (String(prev.name || '') !== r.name) renamed.push({ id: r.id, from: String(prev.name || ''), to: r.name });
    });
    const deactivated = cur
        .filter((r) => r && !nextIds.has(String(r.id)) && r.active !== false)
        .map((r) => String(r.id));
    const kept = cur
        .filter((r) => r && !nextIds.has(String(r.id)))
        .map((r) => ({ ...r, active: false }));
    const roster = [...next, ...kept].sort((a, b) => Number(a.id) - Number(b.id));
    return { roster, added, renamed, deactivated };
}

/** 서식 시트: 헤더 + 예시 */
export function rosterTemplateRows() {
    return [
        ROSTER_HEADERS,
        [1, '홍길동', '남', ''],
        [2, '김영희', '여', ''],
        [3, '이철수', '남', '반장'],
    ];
}

/** 서식 작성 안내 시트 */
export function rosterGuideRows() {
    return [
        ['학생 명단 서식 안내'],
        [''],
        ['1. 「명단」 시트의 예시 행을 지우고 우리 반 학생을 한 줄씩 적습니다.'],
        ['2. 번호는 1~99 숫자입니다. 비워 두면 앞 번호 다음 번호가 붙습니다. 학생 로그인 번호가 됩니다.'],
        ['3. 성별은 남/여 (M/F)로 적습니다. 캐릭터 기본 모습에 쓰입니다.'],
        ['4. 별칭은 선택입니다. 로그인 목록에서 이름 옆에 함께 보입니다.'],
        [`5. 최대 ${ROSTER_MAX}명까지 올릴 수 있습니다.`],
        ['6. 올린 뒤 화면에서 확인하고 「명단 저장」을 눌러야 반영됩니다.'],
        ['7. 이미 있던 번호가 새 명단에 없으면 지우지 않고 비활성으로 남겨 기록을 보존합니다.'],
        ['※ 이 파일에는 학생 개인정보가 들어가므로 공유 폴더·저장소에 올리지 마세요.'],
    ];
}
