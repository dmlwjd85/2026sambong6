/**
 * 시즌 2 캐릭터 외형 — 성별 기본 얼굴 3종 + 통짜 캐릭터(얼굴 스킨).
 * 화면 렌더는 sambongWorld.js에서 이 목록을 사용합니다.
 */

export const CHARACTER_BASES = [
    { id: 'base_m1', gender: 'M', name: '동양 백성', desc: '기운 저고리를 입은 평범한 아이', img: 'chars/base-m1.webp' },
    { id: 'base_m2', gender: 'M', name: '서양 백성', desc: '기운 튜닉을 입은 평범한 아이', img: 'chars/base-m2.webp' },
    { id: 'base_m3', gender: 'M', name: '초원 백성', desc: '가죽옷을 입은 평범한 아이', img: 'chars/base-m3.webp' },
    { id: 'base_f1', gender: 'F', name: '동양 백성', desc: '기운 저고리를 입은 평범한 아이', img: 'chars/base-f1.webp' },
    { id: 'base_f2', gender: 'F', name: '서양 백성', desc: '기운 튜닉을 입은 평범한 아이', img: 'chars/base-f2.webp' },
    { id: 'base_f3', gender: 'F', name: '초원 백성', desc: '가죽옷을 입은 평범한 아이', img: 'chars/base-f3.webp' },
];

/** 마스터 홈에서 고르는 수호 캐릭터 4종 */
export const STAFF_LOOKS = [
    { id: 'staff_dragon', name: '용', desc: '세계수를 지키는 용왕', img: 'chars/staff-dragon.webp', emoji: '🐉' },
    { id: 'staff_tiger', name: '호랑이', desc: '산을 지키는 호랑이', img: 'chars/staff-tiger.webp', emoji: '🐯' },
    { id: 'staff_hyunmu', name: '현무', desc: '북쪽을 지키는 현무', img: 'chars/staff-hyunmu.webp', emoji: '🐢' },
    { id: 'staff_haetae', name: '해태', desc: '정의를 지키는 해태', img: 'chars/staff-haetae.webp', emoji: '🦁' },
];

export const STAFF_PORTRAITS = {
    gm: { img: 'chars/staff-dragon.webp', emoji: '🐉', label: '세계수 용왕', lookId: 'staff_dragon' },
    gm_a: { img: 'chars/staff-tiger.webp', emoji: '🐯', label: '산군 호랑이', lookId: 'staff_tiger' },
};

/** 등급 안내 문구 — 착장은 통짜 캐릭터로 바꾸고, 등급은 이름·배지로 표현합니다. */
export const RANK_LOOKS = [
    { name: '새내기', hint: '모험의 첫걸음' },
    { name: '초보', hint: '숲길을 익히는 중' },
    { name: '중수', hint: '실력이 자리 잡았어요' },
    { name: '고수', hint: '반에서 든든한 선배' },
    { name: '수호자', hint: '학급을 지키는 수호자' },
    { name: '전설', hint: '전설이 되었어요' },
];

export function resolveRankLook(rankName) {
    const name = String(rankName || '');
    return RANK_LOOKS.find((r) => r.name === name) || RANK_LOOKS[0];
}

export function listStaffLooks() {
    return STAFF_LOOKS.slice();
}

export function resolveStaffLook(staffLookId, studentId) {
    const found = STAFF_LOOKS.find((l) => l.id === String(staffLookId || ''));
    if (found) return found;
    const fallbackId = String(studentId) === 'gm_a' ? 'staff_tiger' : 'staff_dragon';
    return STAFF_LOOKS.find((l) => l.id === fallbackId) || STAFF_LOOKS[0];
}

export function normalizeGender(raw) {
    return String(raw || '').toUpperCase() === 'F' ? 'F' : 'M';
}

export function listCharacterBases(gender) {
    const g = normalizeGender(gender);
    return CHARACTER_BASES.filter((b) => b.gender === g);
}

/** 마스터 미리보기용 — 남·여 기본 얼굴 전부 */
export function listAllCharacterBases() {
    return CHARACTER_BASES.slice();
}

export function resolveCharacterBase(baseFaceId, gender) {
    const foundAll = CHARACTER_BASES.find((b) => b.id === String(baseFaceId || ''));
    if (foundAll) return foundAll;
    const g = normalizeGender(gender);
    const list = listCharacterBases(g);
    return list[0] || CHARACTER_BASES[0];
}

/** 같은 슬롯은 하나만 착용 — 얼굴 캐릭터·오라는 종류별로 하나만 켭니다. */
export function getCosmeticSlot(skin) {
    if (!skin) return '';
    if (skin.slot) return String(skin.slot);
    if (skin.type === 'face' || skin.type === 'aura') return String(skin.type);
    if (skin.type === 'overlay') return `overlay:${skin.id}`;
    return String(skin.type || skin.id || '');
}

export function unequipSameSlot(equippedSkins, catalog, incomingSkin) {
    const next = { ...(equippedSkins || {}) };
    const slot = getCosmeticSlot(incomingSkin);
    if (!slot) return next;
    (catalog || []).forEach((s) => {
        if (s && getCosmeticSlot(s) === slot) next[s.id] = false;
    });
    return next;
}
