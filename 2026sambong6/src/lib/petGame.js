/**
 * 메이트 펫: 봉으로 알을 사서 부화시키고, 먹이 주고·놀아 주고·강화하고·진화시키는 키우기 게임(순수 모듈).
 * 학생 문서의 `pet` 칸 하나에 저장해요. 시간 흐름(배고픔·가출)은 저장하지 않고 볼 때마다 계산해요.
 *
 * 흐름
 * - 알 사기(30봉) → 품어 주기(10번 쓰다듬기) → 부화(일곱 종 가운데 하나, 드물게 색이 다른 펫)
 * - 먹이(1~3봉)로 배를 채우고 경험치를 올려요. 배가 거의 차 있으면 못 먹여요(하루에 올릴 수 있는 양이 정해져요).
 * - 놀아 주기는 공짜, 4시간에 한 번·하루 5번까지. 레벨 10·20에서 진화해요(최고 레벨 40).
 * - 강화(+10까지)는 봉을 내고 확률로 성공해요. 실패해도 펫은 그대로예요.
 * - 산책은 하루 한 번, 펫이 봉을 조금 벌어 와요(단계·레벨·강화에 따라).
 * - 배가 텅 빈 채로 3일이 지나면 가출해요. 10봉을 내면 다시 데려와요(레벨·강화는 그대로).
 * 값은 아래 상수만 고치면 돼요.
 */

export const PET_EGG_PRICE = 30;
export const PET_HATCH_TAPS = 10;
export const PET_MAX_LEVEL = 40;
export const PET_EVOLVE_LEVELS = Object.freeze([10, 20]); // 1단계→2단계, 2단계→3단계
export const PET_MAX_ENHANCE = 10;
/** 강화석: 하나에 전투력 +10, 한 펫에 15개(+150)까지, 보관은 99개까지 */
export const PET_STONE_POWER = 10;
export const PET_MAX_BOOST = 150;
export const PET_MAX_STONES = 99;
export const PET_PLAY_PER_DAY = 5;
/** 놀아 주기는 한 번 하면 이만큼 기다려야 다시 할 수 있어요(4시간). */
export const PET_PLAY_COOLDOWN_MS = 4 * 3600000;
export const PET_PLAY_EXP = 8;
/** 포만감은 깨어 있는 시간(기본 오전 8시~저녁 7시) 한 시간에 이만큼 줄어요. 밤에는 줄지 않아요. */
export const PET_HUNGER_PER_HOUR = 4;
/** 포만감이 이보다 많으면 더 못 먹여요. */
export const PET_FEED_BLOCK_AT = 90;
/** 배가 빈 뒤 이 시간이 지나면 가출해요. */
export const PET_RUNAWAY_HOURS = 72;
export const PET_RETURN_PRICE = 10;
/** 산책을 보내려면 포만감이 이만큼은 있어야 해요. */
export const PET_WALK_MIN_FULL = 30;
export const PET_NAME_MAX = 8;
const HOUR = 3600000;
const DAY_MS = 24 * HOUR;
/** 한국 시간(UTC+9) 기준으로 낮·밤을 나눠요. 기기 시간대가 달라도 같은 결과가 나와요. */
const KST_MS = 9 * HOUR;

/* ---------- 배고픔 시계: 낮(깨어 있는 시간)에만 배가 고파져요 ---------- */

export const PET_AWAKE_DEFAULT = Object.freeze({ start: 8, end: 19 });
let awake = { ...PET_AWAKE_DEFAULT };
/** 배가 고파지는 시간대를 정해요(마스터 설정). start시부터 end시까지. */
export function setPetAwakeHours(start, end) {
    const s = Math.max(0, Math.min(23, Math.floor(Number(start))));
    const e = Math.max(1, Math.min(24, Math.floor(Number(end))));
    awake = Number.isFinite(s) && Number.isFinite(e) && e > s ? { start: s, end: e } : { ...PET_AWAKE_DEFAULT };
    return { ...awake };
}
export function petAwakeHours() { return { ...awake }; }

/** from~to 사이에 깨어 있던 시간(시간 단위). 밤은 세지 않아요. */
export function petAwakeHoursBetween(from, to) {
    const a = Number(from) || 0;
    const b = Number(to) || 0;
    if (!(b > a)) return 0;
    const perDay = (awake.end - awake.start) * HOUR;
    let day = Math.floor((a + KST_MS) / DAY_MS);
    const lastDay = Math.floor((b + KST_MS) / DAY_MS);
    let total = 0;
    // 아주 오래 지났으면 가운데 날들은 한꺼번에 세요.
    if (lastDay - day > 3) {
        const firstEnd = (day + 1) * DAY_MS - KST_MS;
        return petAwakeHoursBetween(a, firstEnd) + ((lastDay - day - 1) * perDay) / HOUR + petAwakeHoursBetween(lastDay * DAY_MS - KST_MS, b);
    }
    for (; day <= lastDay; day += 1) {
        const dayStart = day * DAY_MS - KST_MS;
        const lo = Math.max(a, dayStart + awake.start * HOUR);
        const hi = Math.min(b, dayStart + awake.end * HOUR);
        if (hi > lo) total += hi - lo;
    }
    return total / HOUR;
}

/** from 부터 깨어 있는 시간으로 hours 만큼 지난 때(시각) */
export function petAddAwakeHours(from, hours) {
    let t = Number(from) || 0;
    let left = Math.max(0, Number(hours) || 0) * HOUR;
    const perDay = (awake.end - awake.start) * HOUR;
    for (let guard = 0; guard < 4000; guard += 1) {
        const dayStart = Math.floor((t + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
        const lo = Math.max(t, dayStart + awake.start * HOUR);
        const hi = dayStart + awake.end * HOUR;
        if (hi > lo) {
            if (left <= hi - lo) return lo + left;
            left -= hi - lo;
        }
        t = dayStart + DAY_MS;
        if (left > perDay * 3) { const skip = Math.floor(left / perDay) - 1; left -= skip * perDay; t += skip * DAY_MS; }
    }
    return t;
}

export const PET_FOODS = Object.freeze({
    kibble: Object.freeze({ id: 'kibble', name: '사료', emoji: '🍚', price: 1, full: 20, exp: 5 }),
    snack: Object.freeze({ id: 'snack', name: '간식', emoji: '🍪', price: 2, full: 10, exp: 12 }),
    feast: Object.freeze({ id: 'feast', name: '특식', emoji: '🍖', price: 3, full: 40, exp: 20 }),
});

/** 속성: 이름·색(밝은색, 진한색, 배경) */
export const PET_TYPES = Object.freeze({
    fire: Object.freeze({ name: '불꽃', emoji: '🔥' }),
    water: Object.freeze({ name: '물', emoji: '💧' }),
    grass: Object.freeze({ name: '풀', emoji: '🌿' }),
    electric: Object.freeze({ name: '번개', emoji: '⚡' }),
    ice: Object.freeze({ name: '얼음', emoji: '❄️' }),
    rock: Object.freeze({ name: '바위', emoji: '🪨' }),
    star: Object.freeze({ name: '별빛', emoji: '⭐' }),
    /** 격투: 상성이 없어요(누구에게나 보통 데미지를 주고받아요). */
    fight: Object.freeze({ name: '격투', emoji: '🥊' }),
});

/** 종: 단계별 이름(1·2·3단계), 알에서 나올 무게(weight) */
export const PET_SPECIES = Object.freeze({
    emberkit: Object.freeze({ id: 'emberkit', type: 'fire', names: ['불냥', '화르냥', '염호랑'], weight: 16 }),
    dropotter: Object.freeze({ id: 'dropotter', type: 'water', names: ['몽달', '물보달', '해달왕'], weight: 16 }),
    sproutdeer: Object.freeze({ id: 'sproutdeer', type: 'grass', names: ['싹록', '잎사록', '숲왕록'], weight: 16 }),
    zapowl: Object.freeze({ id: 'zapowl', type: 'electric', names: ['찌릿부', '번쩍부엉', '뇌신부엉'], weight: 16 }),
    snowbun: Object.freeze({ id: 'snowbun', type: 'ice', names: ['눈토', '서리토', '빙설토'], weight: 16 }),
    pebbletle: Object.freeze({ id: 'pebbletle', type: 'rock', names: ['돌북', '바위북', '산악북'], weight: 16 }),
    stardrake: Object.freeze({ id: 'stardrake', type: 'star', names: ['별룡이', '은하룡', '삼봉성룡'], weight: 4, rare: true }),
    punchroo: Object.freeze({ id: 'punchroo', type: 'fight', names: ['펀치루', '권투루', '챔피루'], weight: 16 }),
});
/**
 * 펫마다 공격 기술이 3가지 있어요. 레벨이 오르면 하나씩 배우고, 탐험 전투에서 배운 기술 중 하나를 무작위로 써요.
 * 배우는 레벨: 1 · 10 · 20, 세기: 1배 · 1.3배 · 1.7배
 */
export const PET_SKILL_LEVELS = Object.freeze([1, 10, 20]);
export const PET_SKILL_MULTS = Object.freeze([1, 1.3, 1.7]);
export const PET_SKILL_NAMES = Object.freeze({
    emberkit: Object.freeze(['불씨 톡톡', '화염 돌진', '대폭발 화르르']),
    dropotter: Object.freeze(['물방울 퐁', '물대포', '해일 소용돌이']),
    sproutdeer: Object.freeze(['잎사귀 날리기', '덩굴 채찍', '숲의 분노']),
    zapowl: Object.freeze(['찌릿 부리', '번개 깃털', '천둥 폭풍']),
    snowbun: Object.freeze(['눈뭉치 던지기', '얼음 발차기', '눈보라 대행진']),
    pebbletle: Object.freeze(['조약돌 던지기', '바위 굴리기', '대지 흔들기']),
    stardrake: Object.freeze(['별가루 뿌리기', '혜성 꼬리치기', '은하수 브레스']),
    punchroo: Object.freeze(['잽 잽', '원투 스트레이트', '챔피언 어퍼컷']),
});
/**
 * 막기 기술: 공격을 받을 때 chance% 확률로 저절로 써요(레벨 5에 배워요).
 * block: 받는 데미지를 몇 % 줄이는지(100이면 완전히 피해요), counter: 내 공격력의 몇 %로 보스에게 되받아치는지.
 */
export const PET_GUARD_LEVEL = 5;
export const PET_GUARD_SKILLS = Object.freeze({
    emberkit: Object.freeze({ name: '불꽃 반격', chance: 30, block: 30, counter: 60 }),
    dropotter: Object.freeze({ name: '물의 장막', chance: 35, block: 60, counter: 0 }),
    sproutdeer: Object.freeze({ name: '덩굴 방패', chance: 35, block: 50, counter: 20 }),
    zapowl: Object.freeze({ name: '번개 회피', chance: 25, block: 100, counter: 0 }),
    snowbun: Object.freeze({ name: '얼음 갑옷', chance: 35, block: 60, counter: 0 }),
    pebbletle: Object.freeze({ name: '단단한 등껍질', chance: 30, block: 75, counter: 0 }),
    stardrake: Object.freeze({ name: '별빛 반사', chance: 30, block: 40, counter: 80 }),
    punchroo: Object.freeze({ name: '가드 올리기', chance: 35, block: 45, counter: 40 }),
});
/** 막기 기술(배웠는지 포함) */
export function petGuardSkill(species, level) {
    const g = PET_GUARD_SKILLS[species] || PET_GUARD_SKILLS.emberkit;
    return { ...g, level: PET_GUARD_LEVEL, learned: Number(level) >= PET_GUARD_LEVEL };
}
/** 막기 기술 설명 한 줄 */
export function petGuardText(g) {
    const what = g.block >= 100 ? '공격을 완전히 피해요' : `받는 데미지 −${g.block}%`;
    return `${what}${g.counter ? ` · 되받아치기(공격력 ${g.counter}%)` : ''}`;
}

/**
 * 회복 기술: Lv.40에 배워요. 탐험 전투에서 보스가 공격한 뒤, 살아 있으면 chance% 확률로 저절로 써요.
 * target: 'self'(나) · 'all'(살아 있는 우리 팀 모두) · 'lowest'(체력 비율이 가장 낮은 친구 하나)
 * pct: 대상 최대 체력의 몇 %를 채우는지, when: 'any'(언제나) · 'low'(내 체력이 35% 이하일 때만)
 */
export const PET_HEAL_LEVEL = 40;
export const PET_HEAL_LOW_PCT = 35;
export const PET_HEAL_SKILLS = Object.freeze({
    emberkit: Object.freeze({ name: '불사조의 숨결', chance: 20, target: 'self', pct: 40, when: 'any' }),
    dropotter: Object.freeze({ name: '치유의 샘', chance: 25, target: 'all', pct: 10, when: 'any' }),
    sproutdeer: Object.freeze({ name: '생명의 숲', chance: 30, target: 'lowest', pct: 35, when: 'any' }),
    zapowl: Object.freeze({ name: '번개 재충전', chance: 50, target: 'self', pct: 50, when: 'low' }),
    snowbun: Object.freeze({ name: '눈꽃 치유', chance: 25, target: 'all', pct: 8, when: 'any' }),
    pebbletle: Object.freeze({ name: '대지의 숨결', chance: 30, target: 'self', pct: 30, when: 'any' }),
    stardrake: Object.freeze({ name: '별빛 축복', chance: 20, target: 'all', pct: 12, when: 'any' }),
    punchroo: Object.freeze({ name: '투지의 회복', chance: 60, target: 'self', pct: 45, when: 'low' }),
});
/** 회복 기술(배웠는지 포함) */
export function petHealSkill(species, level) {
    const h = PET_HEAL_SKILLS[species] || PET_HEAL_SKILLS.emberkit;
    return { ...h, level: PET_HEAL_LEVEL, learned: Number(level) >= PET_HEAL_LEVEL };
}
/** 회복 기술 설명 한 줄 */
export function petHealText(h) {
    const who = h.target === 'self' ? '내 체력' : h.target === 'all' ? '우리 팀 모두의 체력' : '가장 다친 친구의 체력';
    const when = h.when === 'low' ? `체력 ${PET_HEAL_LOW_PCT}% 이하일 때 ` : '';
    return `${when}${h.chance}% 확률로 ${who}을 ${h.pct}% 채워요`;
}

/** 이 레벨에서 배운 기술 수(1~3) */
export function petSkillCount(level) {
    return Math.max(1, PET_SKILL_LEVELS.filter((lv) => Number(level) >= lv).length);
}
/** 기술 목록: [{ index, name, level(배우는 레벨), mult, learned }] */
export function petSkills(species, level) {
    const names = PET_SKILL_NAMES[species] || PET_SKILL_NAMES.emberkit;
    return names.map((name, index) => ({ index, name, level: PET_SKILL_LEVELS[index], mult: PET_SKILL_MULTS[index], learned: Number(level) >= PET_SKILL_LEVELS[index] }));
}

/** 색이 다른 펫이 나올 확률 */
export const PET_SHINY_CHANCE = 0.05;

const int = (v, lo = 0, hi = 1e15) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

/* ---------- 마스터가 고칠 수 있는 설정(settings/global 의 petSettings) ---------- */

export const PET_MAX_SLOTS = 3;
/** 케이지 하나에 넣을 수 있는 펫 수(마스터 설정)의 가장 큰 값 */
export const PET_MAX_CAGE_SIZE = 5;
export const PET_DEFAULT_SETTINGS = Object.freeze({
    /** 칸 늘리기: [두 번째 칸, 세 번째 칸] — 필요한 내 레벨과 값(봉) */
    slotRules: Object.freeze([Object.freeze({ level: 35, price: 50 }), Object.freeze({ level: 60, price: 100 })]),
    /** 산책 보상: 기본 최소·최대 봉, 전투력 step마다 최대 +1(전투력은 최대 1150), 하루 상한 cap */
    walk: Object.freeze({ min: 1, max: 3, step: 150, cap: 15 }),
    /** 경험치 팩: 봉으로 사서 바로 경험치를 줘요(비쌀수록 조금 이득) */
    expPacks: Object.freeze([Object.freeze({ price: 50, exp: 50 }), Object.freeze({ price: 100, exp: 110 }), Object.freeze({ price: 500, exp: 600 })]),
    /** 케이지 하나에 쉬게 할 수 있는 펫 수(펫 칸 하나마다 케이지가 하나씩 있어요) */
    cageSize: 3,
    /** 배가 고파지는 시간: start시부터 end시까지(밤에는 배고프지 않아요) */
    awake: PET_AWAKE_DEFAULT,
    /** 펫 상점(봉으로 바로 사기): 일반 펫·색다른 펫, 희귀(별빛룡)·희귀 색다른 */
    shop: Object.freeze({ normal: 50, shiny: 70, rare: 500, rareShiny: 700, stone: 100 }),
});

export function sanitizePetSettings(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const d = PET_DEFAULT_SETTINGS;
    const num = (v, def, lo, hi) => {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, n)) : def;
    };
    const rules = Array.isArray(src.slotRules) ? src.slotRules : [];
    const slotRules = d.slotRules.map((def, i) => {
        const r = rules[i] && typeof rules[i] === 'object' ? rules[i] : {};
        return { level: num(r.level, def.level, 1, 100), price: num(r.price, def.price, 0, 5000) };
    });
    const w = src.walk && typeof src.walk === 'object' ? src.walk : {};
    const min = num(w.min, d.walk.min, 0, 100);
    const max = Math.max(min, num(w.max, d.walk.max, 0, 100));
    const cap = Math.max(max, num(w.cap, d.walk.cap, 0, 500));
    // 탐험(보스 레이드) 설정은 petRaid.js 의 sanitizeRaidSettings 가 다듬어요. 여기서는 그대로 넘겨요.
    const raid = src.raid && typeof src.raid === 'object' && !Array.isArray(src.raid) ? src.raid : null;
    const packs = Array.isArray(src.expPacks) ? src.expPacks : [];
    const expPacks = d.expPacks.map((def, i) => {
        const r = packs[i] && typeof packs[i] === 'object' ? packs[i] : {};
        return { price: num(r.price, def.price, 1, 5000), exp: num(r.exp, def.exp, 1, 100000) };
    });
    const aw = src.awake && typeof src.awake === 'object' ? src.awake : {};
    const start = num(aw.start, d.awake.start, 0, 23);
    const end = Math.max(start + 1, num(aw.end, d.awake.end, 1, 24));
    const sh = src.shop && typeof src.shop === 'object' ? src.shop : {};
    const shop = { normal: num(sh.normal, d.shop.normal, 1, 100000), shiny: num(sh.shiny, d.shop.shiny, 1, 100000), rare: num(sh.rare, d.shop.rare, 1, 100000), rareShiny: num(sh.rareShiny, d.shop.rareShiny, 1, 100000), stone: num(sh.stone, d.shop.stone, 1, 100000) };
    return { slotRules, walk: { min, max, step: num(w.step, d.walk.step, 10, 1000), cap }, expPacks, shop, cageSize: num(src.cageSize, d.cageSize, 1, PET_MAX_CAGE_SIZE), awake: { start, end }, ...(raid ? { raid } : {}) };
}

export function emptyPet() {
    return { v: 1, phase: 'none', dex: {} };
}

function sanitizeDex(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(PET_SPECIES).forEach((id) => {
        const d = raw[id];
        if (!d || typeof d !== 'object') return;
        out[id] = { stage: int(d.stage, 1, 3), shiny: d.shiny === true };
    });
    return out;
}

export function sanitizePetName(raw, fallback = '') {
    const s = String(raw ?? '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, PET_NAME_MAX);
    return s || fallback;
}

/** 저장된 값을 안전한 모양으로. phase: none(펫 없음) | egg(알) | pet */
export function sanitizePet(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const dex = sanitizeDex(src.dex);
    if (src.phase === 'egg') {
        const egg = { v: 1, phase: 'egg', taps: int(src.taps, 0, PET_HATCH_TAPS), boughtAt: int(src.boughtAt), dex };
        // 🔥 불알: 깨면 반드시 색다른 펫이 나와요.
        if (src.fire === true) egg.fire = true;
        return egg;
    }
    const sp = PET_SPECIES[String(src.species || '')];
    if (src.phase !== 'pet' || !sp) return { v: 1, phase: 'none', dex };
    const level = int(src.level, 1, PET_MAX_LEVEL);
    const stage = int(src.stage, 1, 3);
    return {
        v: 1,
        phase: 'pet',
        species: sp.id,
        shiny: src.shiny === true,
        name: sanitizePetName(src.name, sp.names[stage - 1]),
        named: src.named === true,
        stage,
        level,
        exp: level >= PET_MAX_LEVEL ? 0 : int(src.exp, 0, petExpNeed(level) - 1),
        enhance: int(src.enhance, 0, PET_MAX_ENHANCE),
        /** 강화석으로 올린 전투력(10씩, 최대 150) */
        boost: Math.floor(int(src.boost, 0, PET_MAX_BOOST) / PET_STONE_POWER) * PET_STONE_POWER,
        full: clamp(src.full, 0, 100),
        fedAt: int(src.fedAt),
        playDate: String(src.playDate || '').slice(0, 10),
        playCount: int(src.playCount, 0, PET_PLAY_PER_DAY),
        playAt: int(src.playAt),
        walkDate: String(src.walkDate || '').slice(0, 10),
        bornAt: int(src.bornAt),
        earned: int(src.earned, 0, 1e7),
        dex,
    };
}

/** 다음 레벨까지 필요한 경험치 */
export function petExpNeed(level) {
    return 10 + 6 * int(level, 1, PET_MAX_LEVEL);
}

export function petSpeciesName(pet) {
    const p = pet && pet.phase === 'pet' ? pet : null;
    const sp = p && PET_SPECIES[p.species];
    return sp ? sp.names[p.stage - 1] : '';
}

/** 전투력의 최댓값 */
export const PET_MAX_POWER = 1300;

/**
 * 전투력(랭킹·탐험 기준): 단계·레벨·강화·강화석을 합쳐요. 최대 1300이에요.
 * 단계 100씩(300) + 레벨 15씩(600) + 강화 20씩(200) + 색다름 20 + 희귀 30 + 강화석 최대 150 = 1300
 */
export function petPower(pet) {
    const p = pet && pet.phase === 'pet' && PET_SPECIES[pet.species] ? pet : sanitizePet(pet);
    if (p.phase !== 'pet') return 0;
    return Math.min(PET_MAX_POWER, p.stage * 100 + p.level * 15 + p.enhance * 20 + (p.shiny ? 20 : 0) + (PET_SPECIES[p.species].rare ? 30 : 0) + (Math.max(0, Math.min(PET_MAX_BOOST, Math.floor(Number(p.boost) || 0)))));
}

/**
 * 지금 시각 기준 모습(저장하지 않는 계산값).
 * full: 지금 포만감, away: 가출했는지, mood: happy|ok|hungry|starving|away, canEvolve, walkBong 등
 */
export function petView(pet, now = Date.now(), today = '', settings = null) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return { ...p, away: false, mood: '', fullNow: 0 };
    const t = int(now);
    // 낮(깨어 있는 시간)에만 배가 고파져요.
    const hours = petAwakeHoursBetween(p.fedAt, t);
    const fullNow = Math.max(0, Math.round(p.full - hours * PET_HUNGER_PER_HOUR));
    const emptyAt = petAddAwakeHours(p.fedAt, p.full / PET_HUNGER_PER_HOUR);
    const hungryHours = Math.max(0, (t - emptyAt) / HOUR);
    const away = hungryHours >= PET_RUNAWAY_HOURS;
    const mood = away ? 'away' : fullNow >= 60 ? 'happy' : fullNow >= 30 ? 'ok' : fullNow > 0 ? 'hungry' : 'starving';
    const playsLeft = p.playDate === today ? Math.max(0, PET_PLAY_PER_DAY - p.playCount) : PET_PLAY_PER_DAY;
    const playWaitMs = Math.max(0, p.playAt + PET_PLAY_COOLDOWN_MS - t);
    return {
        ...p,
        fullNow,
        away,
        mood,
        hoursToRunaway: away ? 0 : Math.max(0, PET_RUNAWAY_HOURS - hungryHours),
        playsLeft,
        playWaitMs,
        canPlay: !away && playsLeft > 0 && playWaitMs <= 0,
        walked: p.walkDate === today,
        walkRange: petWalkRange(p, settings && settings.walk),
        canEvolve: p.stage < 3 && p.level >= PET_EVOLVE_LEVELS[p.stage - 1],
        expNeed: p.level >= PET_MAX_LEVEL ? 0 : petExpNeed(p.level),
        power: petPower(p),
        enhanceCost: petEnhanceCost(p.enhance),
        enhanceChance: petEnhanceChance(p.enhance),
    };
}

/**
 * 산책 한 번에 벌어 올 수 있는 봉의 범위. 전투력(단계·레벨·강화)이 높을수록 많이 벌어요.
 * 최소 = 기본 최소 + 전투력 (2×step)마다 1, 최대 = 기본 최대 + 전투력 step마다 1 (상한 cap).
 * 이 범위 안에서 그날그날 다르게(랜덤) 벌어 와요. 숫자는 마스터가 고칠 수 있어요(PET_DEFAULT_SETTINGS.walk).
 */
export function petWalkRange(pet, walkCfg = null) {
    const p = pet && pet.phase === 'pet' ? pet : sanitizePet(pet);
    if (p.phase !== 'pet') return { min: 0, max: 0 };
    const w = sanitizePetSettings({ walk: walkCfg }).walk;
    const power = petPower(p);
    const max = Math.min(w.cap, w.max + Math.floor(power / w.step));
    const min = Math.min(max, w.min + Math.floor(power / (w.step * 2)));
    return { min, max };
}

/** 범위 안에서 하나를 뽑아요. */
export function rollPetWalkBong(pet, walkCfg = null, rnd = Math.random) {
    const { min, max } = petWalkRange(pet, walkCfg);
    return min + Math.floor(rnd() * (max - min + 1));
}

export function petEnhanceCost(enhance) {
    return 5 + 3 * int(enhance, 0, PET_MAX_ENHANCE);
}

/** 강화 성공 확률(0~1): +0→95%, 한 단계마다 8%씩 줄고 30% 밑으로는 안 내려가요. */
export function petEnhanceChance(enhance) {
    return Math.max(30, 95 - 8 * int(enhance, 0, PET_MAX_ENHANCE)) / 100;
}

const fail = (pet, error) => ({ ok: false, error, pet, cost: 0, gain: 0 });
const done = (pet, extra = {}) => ({ ok: true, error: '', pet, cost: 0, gain: 0, ...extra });

function withDex(p) {
    const cur = p.dex[p.species];
    const stage = Math.max(p.stage, cur ? cur.stage : 0);
    return { ...p.dex, [p.species]: { stage, shiny: p.shiny || !!(cur && cur.shiny) } };
}

/** 경험치를 더하고 레벨을 올려요(진화는 따로 눌러서 해요). */
function addExp(p, amount) {
    let level = p.level;
    let exp = p.exp + int(amount);
    let ups = 0;
    while (level < PET_MAX_LEVEL && exp >= petExpNeed(level)) {
        exp -= petExpNeed(level);
        level += 1;
        ups += 1;
    }
    if (level >= PET_MAX_LEVEL) exp = 0;
    return { pet: { ...p, level, exp }, ups };
}

/** 펫에게 경험치를 줘요(탐험 보상 등). 가출한 펫·알은 그대로예요. */
export function grantPetExp(pet, amount) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return { pet: p, levelUps: 0 };
    const grown = addExp(p, amount);
    return { pet: grown.pet, levelUps: grown.ups };
}

/** 알 사기 */
export function buyPetEgg(pet, { bong = 0, now = 0 } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'none') return fail(p, 'has_pet');
    if (Number(bong) < PET_EGG_PRICE) return fail(p, 'no_bong');
    return done({ v: 1, phase: 'egg', taps: 0, boughtAt: int(now), dex: p.dex }, { cost: PET_EGG_PRICE });
}

/** 알에서 어떤 종이 나올지(무게에 따라) */
export function rollPetSpecies(rnd = Math.random) {
    const list = Object.values(PET_SPECIES);
    const total = list.reduce((s, x) => s + x.weight, 0);
    let r = rnd() * total;
    for (const sp of list) {
        r -= sp.weight;
        if (r < 0) return sp.id;
    }
    return list[0].id;
}

/** 알 품기 한 번. 다 품으면 부화해요. */
export function warmPetEgg(pet, { now = 0, rnd = Math.random } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'egg') return fail(p, 'no_egg');
    const taps = p.taps + 1;
    if (taps < PET_HATCH_TAPS) return done({ ...p, taps });
    const species = rollPetSpecies(rnd);
    const shiny = rnd() < PET_SHINY_CHANCE || p.fire === true;
    const born = {
        v: 1,
        phase: 'pet',
        species,
        shiny,
        name: PET_SPECIES[species].names[0],
        named: false,
        stage: 1,
        level: 1,
        exp: 0,
        enhance: 0,
        full: 60,
        fedAt: int(now),
        playDate: '',
        playCount: 0,
        playAt: 0,
        walkDate: '',
        bornAt: int(now),
        earned: 0,
        dex: p.dex,
    };
    born.dex = withDex(born);
    return done(born, { hatched: true });
}

/** 먹이 주기 */
export function feedPet(pet, { food, bong = 0, now = 0, today = '' } = {}) {
    const p = sanitizePet(pet);
    const f = PET_FOODS[String(food || '')];
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    if (!f) return fail(p, 'bad_food');
    const v = petView(p, now, today);
    if (v.away) return fail(p, 'away');
    if (v.fullNow > PET_FEED_BLOCK_AT) return fail(p, 'full');
    if (Number(bong) < f.price) return fail(p, 'no_bong');
    const grown = addExp({ ...p, full: Math.min(100, v.fullNow + f.full), fedAt: int(now) }, f.exp);
    return done(grown.pet, { cost: f.price, levelUps: grown.ups, exp: f.exp });
}

/** 경험치 팩 사기: packs 는 설정의 expPacks, index 는 몇 번째 팩인지 */
export function buyPetExpPack(pet, { index = 0, packs = PET_DEFAULT_SETTINGS.expPacks, bong = 0, now = 0, today = '' } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    const pack = Array.isArray(packs) ? packs[int(index, 0, 99)] : null;
    if (!pack || !(pack.price > 0) || !(pack.exp > 0)) return fail(p, 'bad_pack');
    if (petView(p, now, today).away) return fail(p, 'away');
    if (p.level >= PET_MAX_LEVEL) return fail(p, 'max_level');
    if (Number(bong) < pack.price) return fail(p, 'no_bong');
    const grown = addExp(p, pack.exp);
    return done(grown.pet, { cost: pack.price, levelUps: grown.ups, exp: pack.exp });
}

/** 놀아 주기(공짜, 4시간에 한 번·하루 5번까지) */
export function playWithPet(pet, { now = 0, today = '' } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    const v = petView(p, now, today);
    if (v.away) return fail(p, 'away');
    if (v.playsLeft <= 0) return fail(p, 'play_limit');
    if (v.playWaitMs > 0) return fail(p, 'play_wait');
    const count = (p.playDate === today ? p.playCount : 0) + 1;
    const grown = addExp({ ...p, playDate: today, playCount: count, playAt: int(now) }, PET_PLAY_EXP);
    return done(grown.pet, { levelUps: grown.ups, exp: PET_PLAY_EXP });
}

/** 진화(레벨 10·20) */
export function evolvePet(pet, { now = 0, today = '' } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    const v = petView(p, now, today);
    if (v.away) return fail(p, 'away');
    if (!v.canEvolve) return fail(p, 'not_ready');
    const sp = PET_SPECIES[p.species];
    const stage = p.stage + 1;
    const next = { ...p, stage, name: p.named ? p.name : sp.names[stage - 1] };
    next.dex = withDex(next);
    return done(next, { evolved: true });
}

/** 강화: 봉을 내고 확률로 +1. 실패해도 펫은 그대로예요. */
export function enhancePet(pet, { bong = 0, now = 0, today = '', rnd = Math.random } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    if (petView(p, now, today).away) return fail(p, 'away');
    if (p.enhance >= PET_MAX_ENHANCE) return fail(p, 'max_enhance');
    const cost = petEnhanceCost(p.enhance);
    if (Number(bong) < cost) return fail(p, 'no_bong');
    const success = rnd() < petEnhanceChance(p.enhance);
    return done(success ? { ...p, enhance: p.enhance + 1 } : p, { cost, success });
}

/** 산책: 하루 한 번 봉을 벌어 와요. */
export function walkPet(pet, { now = 0, today = '', rnd = Math.random, walk = null } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    const v = petView(p, now, today);
    if (v.away) return fail(p, 'away');
    if (!today || v.walked) return fail(p, 'walked');
    if (v.fullNow < PET_WALK_MIN_FULL) return fail(p, 'too_hungry');
    const gain = rollPetWalkBong(p, walk, rnd);
    return done({ ...p, walkDate: today, earned: p.earned + gain }, { gain });
}

/** 가출한 펫 데려오기(10봉). 배를 반쯤 채워서 돌아와요. */
export function bringPetBack(pet, { bong = 0, now = 0, today = '' } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    if (!petView(p, now, today).away) return fail(p, 'not_away');
    if (Number(bong) < PET_RETURN_PRICE) return fail(p, 'no_bong');
    return done({ ...p, full: 50, fedAt: int(now) }, { cost: PET_RETURN_PRICE });
}

/** 이름 바꾸기 */
export function renamePet(pet, { name } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    const next = sanitizePetName(name);
    if (!next) return fail(p, 'bad_name');
    return done({ ...p, name: next, named: true });
}

/** 놓아주기: 도감에는 남고, 새 알을 살 수 있어요. */
export function releasePet(pet) {
    const p = sanitizePet(pet);
    if (p.phase === 'none') return fail(p, 'no_pet');
    return done({ v: 1, phase: 'none', dex: p.phase === 'pet' ? withDex(p) : p.dex });
}

export const PET_ERROR_TEXT = Object.freeze({
    has_pet: '이미 펫이나 알이 있어요.',
    no_gone: '다시 데려올 펫이 없어요.',
    no_bong: '봉이 모자라요.',
    no_egg: '품을 알이 없어요.',
    no_pet: '펫이 없어요.',
    bad_food: '그런 먹이는 없어요.',
    away: '펫이 가출했어요. 먼저 데려와요.',
    full: '배가 불러서 더 못 먹어요. 조금 있다가 줘요.',
    play_limit: '오늘은 충분히 놀았어요. 내일 또 놀아요.',
    play_wait: '방금 놀아서 쉬는 중이에요. 조금 있다가 또 놀아요.',
    bad_pack: '그런 경험치 팩은 없어요.',
    max_level: '이미 최고 레벨이에요.',
    not_ready: '아직 진화할 수 없어요.',
    max_enhance: '강화를 끝까지 했어요.',
    walked: '오늘은 이미 산책을 다녀왔어요.',
    max_slots: '칸을 끝까지 늘렸어요.',
    need_level: '내 레벨이 아직 모자라요.',
    bad_slot: '그 칸은 쓸 수 없어요.',
    not_pet: '태어난 펫만 대표로 정할 수 있어요.',
    too_hungry: '배가 고파서 산책을 못 가요. 먼저 먹이를 줘요.',
    not_away: '펫이 집에 있어요.',
    bad_name: '이름을 다시 적어 줘요.',
    cage_full: '케이지가 꽉 찼어요.',
    cage_dup: '케이지에 같은 종류가 이미 있어요. 한 종류씩만 넣을 수 있어요.',
    cage_empty: '케이지의 그 자리에는 펫이 없어요.',
    slot_busy: '그 칸에는 알이 있어요. 빈 칸이나 펫이 있는 칸을 골라 줘요.',
    slot_used: '빈 칸이 아니에요.',
    no_stored_egg: '보관한 알이 없어요.',
    egg_store_full: '알 보관함이 꽉 찼어요.',
    no_mat: '이 펫에게 쓸 강화 재료가 없어요.',
    no_stone: '강화석이 없어요.',
    stone_full: '강화석은 99개까지 가질 수 있어요.',
    max_boost: '이 펫은 강화석을 15개(전투력 +150) 다 썼어요.',
    no_gift: '받을 선물이 없어요.',
    quota: '오늘 학급 서버 사용량이 다 찼어요. 오후 5시가 지나면 다시 저장돼요.',
    bad_species: '그런 펫은 없어요.',
    changed: '다른 화면에서 펫이 바뀌었어요. 최신 모습으로 맞췄으니 다시 해 봐요.',
    pet_loss: '펫이 사라질 수 있는 저장이라 막았어요. 화면을 새로 고쳐 주세요.',
    owned: '이미 가진 펫이에요. 같은 종류는 한 마리씩만 살 수 있어요.',
});

export function petErrorText(code) {
    return PET_ERROR_TEXT[code] || '할 수 없어요.';
}

/** 반 펫 랭킹: 전투력 순. 학생마다 대표 펫 하나를 봐요. students: [{id, name, pet}] */
export function rankClassPets(students, now = Date.now(), today = '') {
    return (Array.isArray(students) ? students : [])
        .map((s) => ({ id: String(s.id), owner: String(s.name || s.id), view: petView(petBoxMain(sanitizePetBox(s.pet)), now, today) }))
        .filter((r) => r.view.phase === 'pet')
        .sort((a, b) => b.view.power - a.view.power || b.view.level - a.view.level || a.id.localeCompare(b.id))
        .map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ---------- 펫 칸(슬롯) ---------- */
/*
 * 학생 문서의 pet 칸은 '펫 상자'예요: { v:2, slots, main, list:[펫…], dex }.
 * - slots: 열린 칸 수(1~3). list 의 각 칸은 위의 펫 하나(phase none|egg|pet)예요.
 * - main: 대표 펫 칸 번호. 광장 카드와 반 펫 랭킹에 이 펫이 보여요.
 * 예전 저장값(펫 하나짜리)은 첫 칸으로 읽어요.
 */

const stripDex = (p) => { const { dex, ...rest } = p; return rest; };
/** 보관할 수 있는 알 수 */
export const PET_MAX_STORED_EGGS = 30;
/** 🔥 불알(깨면 반드시 색다른 펫) 보관함 크기 */
export const PET_MAX_FIRE_EGGS = 30;
/** 선생님이 알을 선물할 때 한 알이 불알이 될 확률 */
export const PET_FIRE_GIFT_CHANCE = 0.1;

/** 선물할 알 count 개 가운데 불알이 몇 개인지 굴려요(알마다 10%). */
export function rollGiftFireEggs(count, rnd = Math.random) {
    let n = 0;
    for (let i = 0; i < Math.max(0, Math.floor(Number(count) || 0)); i += 1) if (rnd() < PET_FIRE_GIFT_CHANCE) n += 1;
    return n;
}
/** 종마다 모아 둘 수 있는 강화 재료 수 */
export const PET_MAX_MATS = 99;

/**
 * 탐험(보스 레이드) 진행 기록: 깬 스테이지(firsts: 첫 보상을 받은 스테이지 번호),
 * 오늘 보상 받은 횟수(day·dayRewards), 이미 보상을 받은 탐험 번호(claimed, 최근 30개).
 */
export function sanitizeRaidProgress(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const firsts = [];
    (Array.isArray(src.firsts) ? src.firsts : []).forEach((n) => {
        const v = int(n, 0, 99);
        if (v >= 1 && !firsts.includes(v)) firsts.push(v);
    });
    const paid = [];
    (Array.isArray(src.paid) ? src.paid : []).forEach((n) => {
        const v = int(n, 0, 99);
        if (v >= 1 && !paid.includes(v)) paid.push(v);
    });
    /** 스테이지마다 이긴 횟수(이번 보상 시즌 것) { '3': 2 } */
    const wins = {};
    const w = src.wins && typeof src.wins === 'object' && !Array.isArray(src.wins) ? src.wins : {};
    Object.keys(w).forEach((k) => {
        const s = int(k, 0, 99);
        const c = int(w[k], 0, 999);
        if (s >= 1 && c > 0) wins[String(s)] = c;
    });
    return {
        firsts: firsts.sort((a, b) => a - b).slice(0, 40),
        wins,
        /** wins 를 센 주(그 주 월요일, 2026-11-30 전은 'pre') */
        winsWeek: String(src.winsWeek || '').slice(0, 10),
        day: String(src.day || '').slice(0, 10),
        dayRewards: int(src.dayRewards, 0, 999),
        claimed: (Array.isArray(src.claimed) ? src.claimed : []).map((x) => String(x || '').slice(0, 60)).filter(Boolean).slice(-30),
        /** 이번 보상 시즌에 첫 클리어 보상을 받은 스테이지 */
        paid: paid.sort((a, b) => a - b).slice(0, 40),
        /** paid 가 어느 보상 시즌 것인지(0 = 시즌 기능 전) */
        season: int(src.season, 0, 999),
    };
}

export function sanitizePetBox(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (int(src.v) >= 2 && Array.isArray(src.list)) {
        const slots = int(src.slots, 1, PET_MAX_SLOTS);
        const list = [];
        for (let i = 0; i < slots; i += 1) list.push(stripDex(sanitizePet(src.list[i])));
        return { v: 2, slots, main: int(src.main, 0, slots - 1), list, dex: sanitizeDex(src.dex), raid: sanitizeRaidProgress(src.raid), ...sanitizeKeep(src, slots) };
    }
    const one = sanitizePet(src);
    return { v: 2, slots: 1, main: 0, list: [stripDex(one)], dex: one.dex, raid: sanitizeRaidProgress(src.raid), ...sanitizeKeep(src, 1) };
}

/** 케이지(쉬는 펫)·보관한 알·강화 재료 */
function sanitizeKeep(src, slots) {
    const cage = [];
    (Array.isArray(src.cage) ? src.cage : []).forEach((raw) => {
        const p = sanitizePet(raw);
        if (p.phase === 'pet' && cage.length < slots * PET_MAX_CAGE_SIZE) cage.push(stripDex(p));
    });
    const mats = {};
    const rawMats = src.mats && typeof src.mats === 'object' && !Array.isArray(src.mats) ? src.mats : {};
    Object.keys(PET_SPECIES).forEach((id) => { mats[id] = int(rawMats[id], 0, PET_MAX_MATS); });
    // 방금 놓아준 펫(되돌리기용). 한 마리만 기억해요.
    let gone = null;
    const g = src.gone && typeof src.gone === 'object' ? src.gone : null;
    if (g && g.pet) {
        const gp = sanitizePet(g.pet);
        if (gp.phase === 'pet') gone = { pet: stripDex(gp), at: int(g.at) };
    }
    return { cage, eggs: int(src.eggs, 0, PET_MAX_STORED_EGGS), mats, giftSeen: int(src.giftSeen, 0, 1e7), gone, stones: int(src.stones, 0, PET_MAX_STONES),
        fireEggs: int(src.fireEggs, 0, PET_MAX_FIRE_EGGS), fireGiftSeen: int(src.fireGiftSeen, 0, 1e7) };
}

/** 저장용(일반 객체) */
export function petBoxToDoc(box) {
    const b = sanitizePetBox(box);
    return { v: 2, slots: b.slots, main: b.main, list: b.list.map((p) => ({ ...p })), dex: { ...b.dex }, raid: { ...b.raid, wins: { ...b.raid.wins }, firsts: b.raid.firsts.slice(), claimed: b.raid.claimed.slice(), paid: b.raid.paid.slice() }, cage: b.cage.map((p) => ({ ...p })), eggs: b.eggs, mats: { ...b.mats }, giftSeen: b.giftSeen, fireEggs: b.fireEggs, fireGiftSeen: b.fireGiftSeen, gone: b.gone ? { pet: { ...b.gone.pet }, at: b.gone.at } : null, stones: b.stones };
}

/** i번째 칸의 펫(규칙 함수에 그대로 넘길 수 있게 도감을 붙여요). 없는 칸이면 null */
export function petBoxSlot(box, i) {
    const b = sanitizePetBox(box);
    const idx = Math.floor(Number(i));
    if (!(idx >= 0 && idx < b.slots)) return null;
    return { ...b.list[idx], dex: b.dex };
}

/** i번째 칸을 바꾼 새 상자(펫에 붙어 온 도감은 상자 도감이 돼요). */
export function petBoxWith(box, i, pet) {
    const b = sanitizePetBox(box);
    const idx = Math.floor(Number(i));
    if (!(idx >= 0 && idx < b.slots)) return b;
    const p = sanitizePet(pet);
    const list = b.list.map((cur, k) => (k === idx ? stripDex(p) : cur));
    return { ...b, list, dex: { ...b.dex, ...p.dex } };
}

/** 대표 펫 칸 번호. 고른 칸에 펫이 없으면 태어난 펫이 있는 첫 칸, 하나도 없으면 -1 */
export function petBoxMainIndex(box) {
    const b = sanitizePetBox(box);
    if (b.list[b.main] && b.list[b.main].phase === 'pet') return b.main;
    return b.list.findIndex((p) => p.phase === 'pet');
}

/** 대표 펫(없으면 빈 펫) */
export function petBoxMain(box) {
    const b = sanitizePetBox(box);
    const i = petBoxMainIndex(b);
    return i >= 0 ? { ...b.list[i], dex: b.dex } : { v: 1, phase: 'none', dex: b.dex };
}

/** 다음 칸을 열 때의 조건({ level, price }). 더 못 늘리면 null */
export function petNextSlotRule(box, settings = null) {
    const b = sanitizePetBox(box);
    if (b.slots >= PET_MAX_SLOTS) return null;
    return sanitizePetSettings(settings).slotRules[b.slots - 1];
}

/** 칸 늘리기: 내 레벨이 되고 봉을 내면 한 칸 열려요. */
export function expandPetBox(box, { bong = 0, level = 0, settings = null } = {}) {
    const b = sanitizePetBox(box);
    const rule = petNextSlotRule(b, settings);
    if (!rule) return { ok: false, error: 'max_slots', box: b, cost: 0 };
    if (int(level) < rule.level) return { ok: false, error: 'need_level', box: b, cost: 0 };
    if (Number(bong) < rule.price) return { ok: false, error: 'no_bong', box: b, cost: 0 };
    return { ok: true, error: '', box: { ...b, slots: b.slots + 1, list: b.list.concat({ v: 1, phase: 'none' }) }, cost: rule.price };
}

/** 대표 펫 정하기(태어난 펫만) */
export function setPetBoxMain(box, i) {
    const b = sanitizePetBox(box);
    const idx = Math.floor(Number(i));
    if (!(idx >= 0 && idx < b.slots)) return { ok: false, error: 'bad_slot', box: b };
    if (b.list[idx].phase !== 'pet') return { ok: false, error: 'not_pet', box: b };
    return { ok: true, error: '', box: { ...b, main: idx } };
}

/* ---------- 케이지(쉬는 곳)·알 보관함·강화 재료 ---------- */
/*
 * 펫 칸(list)에 있는 펫은 밖에서 활동해요(배고파지고, 산책·놀이·탐험을 해요).
 * 케이지(cage)에 넣은 펫은 쉬어요: 배고프지 않고, 꺼내기 전까지 아무것도 하지 않아요.
 * - 펫 칸 하나마다 케이지가 하나씩 있고, 케이지 하나에 cageSize(기본 3)마리까지 들어가요.
 * - 케이지에는 한 종류(종)를 한 마리씩만 넣을 수 있어요.
 * 알에서 이미 가진 종이 나오면 펫 대신 그 종의 '강화 재료'가 돼요(mats).
 * 안 쓴 알은 알 보관함(eggs)에 넣어 둘 수 있어요. 선생님이 선물한 알도 여기로 와요.
 */

const boxFail = (box, error) => ({ ok: false, error, box, cost: 0 });
const boxDone = (box, extra = {}) => ({ ok: true, error: '', box, cost: 0, ...extra });
const slotIndex = (b, i) => { const idx = Math.floor(Number(i)); return idx >= 0 && idx < b.slots ? idx : -1; };

/** 상자 안 펫 수(칸 + 케이지). 펫이 사라지는 저장을 막을 때 써요. */
export function petBoxPetCount(box) {
    if (box == null) return 0;
    const b = sanitizePetBox(box);
    return b.list.filter((p) => p.phase === 'pet').length + b.cage.length;
}

/** 케이지에 넣을 수 있는 펫 수 */
export function petCageCapacity(box, settings = null) {
    return sanitizePetBox(box).slots * sanitizePetSettings(settings).cageSize;
}

/** 내가 가진 종(칸에 있는 펫 + 케이지). exceptSlot 칸은 빼고 봐요. */
export function petBoxOwnedSpecies(box, exceptSlot = -1) {
    const b = sanitizePetBox(box);
    const out = new Set();
    b.list.forEach((p, i) => { if (i !== exceptSlot && p.phase === 'pet') out.add(p.species); });
    b.cage.forEach((p) => out.add(p.species));
    return out;
}

/** 칸의 펫을 케이지에 넣어요. 지금 배부름 그대로 멈춰요. */
/** 놓아준 펫을 다시 데려올 수 있는 시간(7일) */
export const PET_RELEASE_UNDO_MS = 7 * 24 * 3600 * 1000;

/** i번째 칸의 펫(또는 알)을 놓아줘요. 펫은 되돌릴 수 있게 상자에 한 마리 기억해 둬요(gone). */
export function releaseBoxPet(box, i, { now = 0 } = {}) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    const cur = b.list[idx];
    const r = releasePet({ ...cur, dex: b.dex });
    if (!r.ok) return boxFail(b, r.error);
    const next = petBoxWith(b, idx, r.pet);
    if (cur.phase === 'pet') next.gone = { pet: { ...cur }, at: int(now) };
    return boxDone(next, { released: cur });
}

/** 놓아준 펫을 지금 볼 수 있는지(7일 안) */
export function releasedPetOf(box, now = 0) {
    const b = sanitizePetBox(box);
    if (!b.gone || int(now) - b.gone.at > PET_RELEASE_UNDO_MS) return null;
    return b.gone.pet;
}

/** 놓아준 펫을 i번째 빈칸으로 다시 데려와요. 같은 종을 이미 키우면 못 데려와요. */
export function restoreReleasedPet(box, i, { now = 0 } = {}) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    const pet = releasedPetOf(b, now);
    if (!pet) return boxFail(b, 'no_gone');
    if (b.list[idx].phase !== 'none') return boxFail(b, 'slot_busy');
    if (petBoxOwnedSpecies(b).has(pet.species)) return boxFail(b, 'owned');
    const back = { ...pet, fedAt: int(now) };
    const list = b.list.map((x, k) => (k === idx ? back : x));
    return boxDone({ ...b, list, gone: null }, { pet: back });
}

export function cagePet(box, i, { now = 0, today = '', settings = null } = {}) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    const p = b.list[idx];
    if (p.phase !== 'pet') return boxFail(b, 'no_pet');
    const v = petView(p, now, today);
    if (v.away) return boxFail(b, 'away');
    if (b.cage.length >= petCageCapacity(b, settings)) return boxFail(b, 'cage_full');
    if (b.cage.some((c) => c.species === p.species)) return boxFail(b, 'cage_dup');
    const resting = { ...p, full: v.fullNow, fedAt: int(now) };
    const list = b.list.map((cur, k) => (k === idx ? { v: 1, phase: 'none' } : cur));
    return boxDone({ ...b, list, cage: b.cage.concat(resting) }, { pet: resting });
}

/** 케이지의 펫을 칸으로 꺼내요. 칸에 펫이 있으면 서로 자리를 바꿔요. 배부름은 넣을 때 그대로예요. */
export function uncagePet(box, cageIdx, i, { now = 0, today = '' } = {}) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    const c = Math.floor(Number(cageIdx));
    const out = b.cage[c];
    if (!out) return boxFail(b, 'cage_empty');
    const cur = b.list[idx];
    if (cur.phase === 'egg') return boxFail(b, 'slot_busy');
    let cage = b.cage.filter((_, k) => k !== c);
    let swapped = null;
    if (cur.phase === 'pet') {
        const v = petView(cur, now, today);
        if (v.away) return boxFail(b, 'away');
        if (cage.some((x) => x.species === cur.species)) return boxFail(b, 'cage_dup');
        swapped = { ...cur, full: v.fullNow, fedAt: int(now) };
        cage = cage.slice(0, c).concat(swapped, cage.slice(c));
    }
    const woke = { ...out, fedAt: int(now) };
    const list = b.list.map((x, k) => (k === idx ? woke : x));
    return boxDone({ ...b, list, cage }, { pet: woke, swapped });
}

/** 케이지에서 쉬는 펫의 모습(배부름이 멈춰 있어요) */
export function cagePetView(pet, today = '', settings = null) {
    const p = sanitizePet(pet);
    return petView(p, p.fedAt, today, settings);
}

/** 보관함에 알을 더해요(선물 받기 등). 넘치는 알은 버려져요. */
export function addStoredEggs(box, count) {
    const b = sanitizePetBox(box);
    const n = int(count, 0, PET_MAX_STORED_EGGS);
    if (n <= 0) return boxFail(b, 'no_stored_egg');
    const eggs = Math.min(PET_MAX_STORED_EGGS, b.eggs + n);
    return boxDone({ ...b, eggs }, { added: eggs - b.eggs });
}

/** 칸의 알(아직 안 깐 알)을 보관함에 넣어요. 품은 횟수는 처음으로 돌아가요. */
export function storePetEgg(box, i) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    if (b.list[idx].phase !== 'egg') return boxFail(b, 'no_egg');
    const list = b.list.map((cur, k) => (k === idx ? { v: 1, phase: 'none' } : cur));
    if (b.list[idx].fire) {
        if (b.fireEggs >= PET_MAX_FIRE_EGGS) return boxFail(b, 'egg_store_full');
        return boxDone({ ...b, list, fireEggs: b.fireEggs + 1 }, { fire: true });
    }
    if (b.eggs >= PET_MAX_STORED_EGGS) return boxFail(b, 'egg_store_full');
    return boxDone({ ...b, list, eggs: b.eggs + 1 });
}

/** 보관한 알을 빈 칸에 꺼내요. */
export function useStoredEgg(box, i, { now = 0, fire = false } = {}) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    if ((fire ? b.fireEggs : b.eggs) <= 0) return boxFail(b, 'no_stored_egg');
    if (b.list[idx].phase !== 'none') return boxFail(b, 'slot_used');
    const egg = { v: 1, phase: 'egg', taps: 0, boughtAt: int(now) };
    if (fire) egg.fire = true;
    const list = b.list.map((cur, k) => (k === idx ? egg : cur));
    return boxDone(fire ? { ...b, list, fireEggs: b.fireEggs - 1 } : { ...b, list, eggs: b.eggs - 1 }, { fire: !!fire });
}

/**
 * 방금 태어난 펫(born)을 칸에 넣어요. 이미 가진 종이면 펫 대신 그 종의 강화 재료 1개가 되고 칸은 비어요.
 * (색이 다른 펫이 중복으로 나오면, 가지고 있던 같은 종 펫이 색다른 펫이 돼요.)
 */
export function settleHatchedPet(box, i, born) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    const p = sanitizePet(born);
    if (p.phase !== 'pet') return boxFail(b, 'no_pet');
    if (!petBoxOwnedSpecies(b, idx).has(p.species)) return boxDone(petBoxWith(b, idx, p), { duplicate: false, pet: p });
    const shine = (x) => (p.shiny && x.phase === 'pet' && x.species === p.species ? { ...x, shiny: true } : x);
    let shared = false;
    const list = b.list.map((cur, k) => { if (k === idx) return { v: 1, phase: 'none' }; if (!shared && shine(cur) !== cur) { shared = true; return shine(cur); } return cur; });
    const cage = b.cage.map((cur) => { if (!shared && shine(cur) !== cur) { shared = true; return shine(cur); } return cur; });
    const mats = { ...b.mats, [p.species]: Math.min(PET_MAX_MATS, (b.mats[p.species] || 0) + 1) };
    return boxDone({ ...b, list, cage, mats, dex: { ...b.dex, ...p.dex } }, { duplicate: true, species: p.species, shiny: p.shiny, shinyShared: shared });
}

/** 강화 재료로 강화: 같은 종의 재료 1개를 쓰면 봉 없이 반드시 +1 */
export function enhancePetWithMat(box, i, { now = 0, today = '' } = {}) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    const p = b.list[idx];
    if (p.phase !== 'pet') return boxFail(b, 'no_pet');
    if (petView(p, now, today).away) return boxFail(b, 'away');
    if (p.enhance >= PET_MAX_ENHANCE) return boxFail(b, 'max_enhance');
    if (!(b.mats[p.species] > 0)) return boxFail(b, 'no_mat');
    const pet = { ...p, enhance: p.enhance + 1 };
    const list = b.list.map((cur, k) => (k === idx ? pet : cur));
    return boxDone({ ...b, list, mats: { ...b.mats, [p.species]: b.mats[p.species] - 1 } }, { pet, success: true });
}

/** 펫 상점: 강화석 사기(count개, 봉은 cost 로 돌려줘요) */
export function buyEnhanceStones(box, { count = 1, bong = 0, settings = null } = {}) {
    const b = sanitizePetBox(box);
    const n = int(count, 1, PET_MAX_STONES);
    if (b.stones + n > PET_MAX_STONES) return boxFail(b, 'stone_full');
    const cost = sanitizePetSettings(settings).shop.stone * n;
    if (Number(bong) < cost) return boxFail(b, 'no_bong');
    return boxDone({ ...b, stones: b.stones + n }, { cost, count: n });
}

/** 강화석 쓰기: i번째 칸 펫의 전투력 +10(영구). 봉은 들지 않아요. */
export function useEnhanceStone(box, i, { now = 0, today = '' } = {}) {
    const b = sanitizePetBox(box);
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    const p = b.list[idx];
    if (p.phase !== 'pet') return boxFail(b, 'no_pet');
    if (petView(p, now, today).away) return boxFail(b, 'away');
    if (p.boost >= PET_MAX_BOOST) return boxFail(b, 'max_boost');
    if (!(b.stones > 0)) return boxFail(b, 'no_stone');
    const pet = { ...p, boost: p.boost + PET_STONE_POWER };
    const list = b.list.map((cur, k) => (k === idx ? pet : cur));
    return boxDone({ ...b, list, stones: b.stones - 1 }, { pet, added: PET_STONE_POWER });
}

/* ---------- 펫 상점: 봉으로 펫을 바로 사요 ---------- */

/** 이 펫(종·색다름)의 값 */
export function petShopPrice(species, shiny, settings = null) {
    const sp = PET_SPECIES[species];
    if (!sp) return 0;
    const shop = sanitizePetSettings(settings).shop;
    return sp.rare ? (shiny ? shop.rareShiny : shop.rare) : (shiny ? shop.shiny : shop.normal);
}

/** 갓 태어난 모습의 펫 */
function newbornPet(species, shiny, now) {
    return { v: 1, phase: 'pet', species, shiny: !!shiny, name: PET_SPECIES[species].names[0], named: false, stage: 1, level: 1, exp: 0, enhance: 0, full: 60, fedAt: int(now), playDate: '', playCount: 0, playAt: 0, walkDate: '', bornAt: int(now), earned: 0 };
}

/**
 * 빈 칸에 펫을 사서 넣어요. 이미 가진 종(칸·케이지)은 못 사요.
 * 단, 일반 펫을 가지고 있을 때 같은 종의 색다른 펫은 살 수 있어요(가진 펫이 색다른 펫이 돼요, 칸은 그대로).
 */
export function buyShopPet(box, i, { species = '', shiny = false, bong = 0, now = 0, settings = null } = {}) {
    const b = sanitizePetBox(box);
    const sp = PET_SPECIES[String(species)];
    if (!sp) return boxFail(b, 'bad_species');
    const price = petShopPrice(sp.id, shiny, settings);
    const owned = [...b.list.map((p, k) => ({ p, where: 'list', k })), ...b.cage.map((p, k) => ({ p, where: 'cage', k }))].find((x) => x.p.phase === 'pet' && x.p.species === sp.id);
    if (owned) {
        // 색다른 모습으로 바꾸기만 할 수 있어요.
        if (!shiny || owned.p.shiny) return boxFail(b, 'owned');
        if (Number(bong) < price) return boxFail(b, 'no_bong');
        const up = { ...owned.p, shiny: true };
        const next = owned.where === 'list' ? { ...b, list: b.list.map((p, k) => (k === owned.k ? up : p)) } : { ...b, cage: b.cage.map((p, k) => (k === owned.k ? up : p)) };
        return boxDone({ ...next, dex: withDex({ ...up, dex: b.dex }) }, { cost: price, pet: up, upgraded: true });
    }
    const idx = slotIndex(b, i);
    if (idx < 0) return boxFail(b, 'bad_slot');
    if (b.list[idx].phase !== 'none') return boxFail(b, 'slot_used');
    if (Number(bong) < price) return boxFail(b, 'no_bong');
    const pet = newbornPet(sp.id, shiny, now);
    const list = b.list.map((p, k) => (k === idx ? pet : p));
    return boxDone({ ...b, list, dex: withDex({ ...pet, dex: b.dex }) }, { cost: price, pet, upgraded: false });
}

/**
 * 선생님이 선물한 알 받기. total 은 지금까지 받은 선물의 합계(선물함 문서의 eggs, 늘기만 해요).
 * 상자에 이미 받은 합계(giftSeen)를 적어 두어서, 같은 선물을 두 번 받지 않고 실패해도 다음에 그대로 받아요.
 */
export function receivePetGifts(box, total, fireTotal = 0) {
    const b = sanitizePetBox(box);
    const t = int(total, 0, 1e7);
    const ft = int(fireTotal, 0, 1e7);
    const n = Math.max(0, t - b.giftSeen);
    const f = Math.max(0, ft - b.fireGiftSeen);
    if (n <= 0 && f <= 0) return boxFail(b, 'no_gift');
    const eggs = Math.min(PET_MAX_STORED_EGGS, b.eggs + n);
    const fireEggs = Math.min(PET_MAX_FIRE_EGGS, b.fireEggs + f);
    return boxDone({ ...b, eggs, giftSeen: Math.max(t, b.giftSeen), fireEggs, fireGiftSeen: Math.max(ft, b.fireGiftSeen) },
        { added: eggs - b.eggs, gifted: n, fireAdded: fireEggs - b.fireEggs, fireGifted: f });
}
