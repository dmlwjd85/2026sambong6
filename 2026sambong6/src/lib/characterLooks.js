/**
 * 시즌 2 캐릭터 외형 — 성별 기본 얼굴 3종 + 장식 슬롯.
 * 초상은 스티커북 코디용 단순 얼굴이고, 화면 렌더는 sambongWorld.js에서 이 목록을 사용합니다.
 */

export const CHARACTER_BASES = [
    { id: 'base_m1', gender: 'M', name: '견습 기사', desc: '방패를 든 초보 모험가', img: 'chars/base-m1.webp' },
    { id: 'base_m2', gender: 'M', name: '숲의 견습', desc: '활시위를 익히는 정찰대', img: 'chars/base-m2.webp' },
    { id: 'base_m3', gender: 'M', name: '마법 견습', desc: '세계수의 불꽃을 배우는 견습생', img: 'chars/base-m3.webp' },
    { id: 'base_f1', gender: 'F', name: '견습 기사', desc: '방패를 든 초보 모험가', img: 'chars/base-f1.webp' },
    { id: 'base_f2', gender: 'F', name: '숲의 견습', desc: '활시위를 익히는 정찰대', img: 'chars/base-f2.webp' },
    { id: 'base_f3', gender: 'F', name: '마법 견습', desc: '세계수의 불꽃을 배우는 견습생', img: 'chars/base-f3.webp' },
];

export const STAFF_PORTRAITS = {
    gm: { img: 'chars/staff-master.webp', emoji: '🐉', label: '세계수 용왕' },
    gm_a: { img: 'chars/staff-pirate.webp', emoji: '🏴‍☠️', label: '해적섬 두목' },
};

/** 등급별 기본 착장·표정. 레벨(경험치 구간)이 오르면 자동으로 겹칩니다. */
export const RANK_LOOKS = [
    { name: '새내기', img: 'chars/rank-look-saenaegi.webp', hint: '수줍은 미소 · 회색 조끼' },
    { name: '초보', img: 'chars/rank-look-chobo.webp', hint: '활짝 웃는 얼굴 · 초록 스카프' },
    { name: '중수', img: 'chars/rank-look-jungsu.webp', hint: '다부진 미소 · 파란 망토' },
    { name: '고수', img: 'chars/rank-look-gosu.webp', hint: '자신감 있는 웃음 · 금색 망토' },
    { name: '수호자', img: 'chars/rank-look-guardian.webp', hint: '차분한 미소 · 보라 별 망토' },
    { name: '전설', img: 'chars/rank-look-legend.webp', hint: '전설의 웃음 · 붉은 불꽃 망토' },
];

export function resolveRankLook(rankName) {
    const name = String(rankName || '');
    return RANK_LOOKS.find((r) => r.name === name) || RANK_LOOKS[0];
}

export function normalizeGender(raw) {
    return String(raw || '').toUpperCase() === 'F' ? 'F' : 'M';
}

export function listCharacterBases(gender) {
    const g = normalizeGender(gender);
    return CHARACTER_BASES.filter((b) => b.gender === g);
}

export function resolveCharacterBase(baseFaceId, gender) {
    const g = normalizeGender(gender);
    const list = listCharacterBases(g);
    const found = list.find((b) => b.id === String(baseFaceId || ''));
    return found || list[0] || CHARACTER_BASES[0];
}

/** 같은 슬롯은 하나만 착용 — 나중에 헤어/모자/안경을 겹쳐 꾸밀 수 있게 합니다. */
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
