/**
 * 새 펫 3종(힐러·탱커·서포트)의 데이터 표.
 * 기존 8종의 값은 petGame.js 에 그대로 있고, 여기 값은 새 펫에만 쓰여요.
 * 역할 기술은 탐험(보스 레이드) 전투에서만 써요(규칙 판 6부터).
 */

/** 새 속성: 회복·강철·바람 */
export const NEW_PET_TYPES = Object.freeze({
    heal: Object.freeze({ name: '회복', emoji: '💚' }),
    steel: Object.freeze({ name: '강철', emoji: '🛡️' }),
    wind: Object.freeze({ name: '바람', emoji: '🎐' }),
});

/** 새 종: 단계별 이름, 알에서 나올 무게(일반 펫 16보다 조금 낮은 12), 역할 */
export const NEW_PET_SPECIES = Object.freeze({
    heartail: Object.freeze({ id: 'heartail', type: 'heal', names: Object.freeze(['하뜨', '하트솜', '치유솜']), weight: 12, role: 'healer' }),
    ironpaw: Object.freeze({ id: 'ironpaw', type: 'steel', names: Object.freeze(['철뭉', '갑옷뭉', '성벽뭉']), weight: 12, role: 'tank' }),
    bellpup: Object.freeze({ id: 'bellpup', type: 'wind', names: Object.freeze(['방울', '응원방울', '함성방울']), weight: 12, role: 'support' }),
});

/** 공격 기술 이름(레벨 1·10·20에 배워요) */
export const NEW_PET_SKILL_NAMES = Object.freeze({
    heartail: Object.freeze(['하트 톡톡', '솜사탕 펀치', '치유의 빛줄기']),
    ironpaw: Object.freeze(['철 발바닥', '강철 몸통박치기', '성벽 프레스']),
    bellpup: Object.freeze(['방울 딸랑', '바람 회오리', '응원의 폭풍']),
});

/** 막기 기술(레벨 5): chance% 확률로 받는 데미지를 block% 줄여요 */
export const NEW_PET_GUARD_SKILLS = Object.freeze({
    heartail: Object.freeze({ name: '포근한 솜', chance: 30, block: 40, counter: 0 }),
    ironpaw: Object.freeze({ name: '철갑 막기', chance: 40, block: 80, counter: 0 }),
    bellpup: Object.freeze({ name: '바람 피하기', chance: 30, block: 50, counter: 0 }),
});

/** 회복 기술(레벨 40): 기존 펫과 같은 방식 */
export const NEW_PET_HEAL_SKILLS = Object.freeze({
    heartail: Object.freeze({ name: '성심 치유', chance: 30, target: 'all', pct: 12, when: 'any' }),
    ironpaw: Object.freeze({ name: '강철 재생', chance: 30, target: 'self', pct: 30, when: 'any' }),
    bellpup: Object.freeze({ name: '산들바람', chance: 25, target: 'all', pct: 8, when: 'any' }),
});

/** 역할 이름과 설명 */
export const PET_ROLES = Object.freeze({
    healer: Object.freeze({ name: '힐러', emoji: '💚', desc: '다친 친구의 체력을 채워 줘요' }),
    tank: Object.freeze({ name: '탱커', emoji: '🛡️', desc: '보스의 공격을 대신 맞아 줘요' }),
    support: Object.freeze({ name: '서포트', emoji: '🎐', desc: '친구들의 공격이나 방어를 잠깐 올려 줘요' }),
});

/** 탐험 전투에서만 쓰는 체력·공격 비율(%). 랭킹·산책의 전투력은 그대로예요. */
export const PET_ROLE_STATS = Object.freeze({
    healer: Object.freeze({ hp: 110, atk: 70 }),
    tank: Object.freeze({ hp: 140, atk: 75 }),
    support: Object.freeze({ hp: 90, atk: 80 }),
});

/** 역할 기술: heal(돌봄 회복)·taunt(대신 맞기)·buff(공격 응원)·shield(받는 데미지 줄이기) */
export const PET_ROLE_SKILLS = Object.freeze({
    heartail: Object.freeze([Object.freeze({ kind: 'heal', name: '돌봄 하트', level: 10, chance: 35, target: 'lowest', pct: 25 })]),
    ironpaw: Object.freeze([Object.freeze({ kind: 'taunt', name: '대신 맞기', level: 5, chance: 55 })]),
    bellpup: Object.freeze([
        Object.freeze({ kind: 'buff', name: '응원 함성', level: 10, chance: 40, atk: 25 }),
        Object.freeze({ kind: 'shield', name: '방울 가드', level: 20, chance: 40, def: 25 }),
    ]),
});

/** 이 종의 역할 기술(배웠는지 learned 포함). 역할이 없으면 빈 배열 */
export function petRoleSkills(species, level) {
    const list = Object.prototype.hasOwnProperty.call(PET_ROLE_SKILLS, species) ? PET_ROLE_SKILLS[species] : null;
    if (!list) return [];
    return list.map((s) => ({ ...s, learned: Number(level) >= s.level }));
}

/** 역할 기술 설명 한 줄 */
export function petRoleSkillText(s) {
    if (!s) return '';
    if (s.kind === 'heal') return `${s.chance}% 확률로 가장 다친 친구의 체력을 ${s.pct}% 채워요`;
    if (s.kind === 'taunt') return `보스가 한 친구를 때릴 때 ${s.chance}% 확률로 대신 맞아요`;
    if (s.kind === 'buff') return `턴마다 ${s.chance}% 확률로 우리 팀 공격력 +${s.atk}%`;
    if (s.kind === 'shield') return `턴마다 ${s.chance}% 확률로 우리 팀이 받는 데미지 −${s.def}%`;
    return '';
}
