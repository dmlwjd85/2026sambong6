/**
 * 메이트 펫: 봉으로 알을 사서 부화시키고, 먹이 주고·놀아 주고·강화하고·진화시키는 키우기 게임(순수 모듈).
 * 학생 문서의 `pet` 칸 하나에 저장해요. 시간 흐름(배고픔·가출)은 저장하지 않고 볼 때마다 계산해요.
 *
 * 흐름
 * - 알 사기(30봉) → 품어 주기(10번 쓰다듬기) → 부화(일곱 종 가운데 하나, 드물게 색이 다른 펫)
 * - 먹이(1~3봉)로 배를 채우고 경험치를 올려요. 배가 거의 차 있으면 못 먹여요(하루에 올릴 수 있는 양이 정해져요).
 * - 놀아 주기는 공짜, 하루 3번. 레벨 10·20에서 진화해요(최고 레벨 30).
 * - 강화(+10까지)는 봉을 내고 확률로 성공해요. 실패해도 펫은 그대로예요.
 * - 산책은 하루 한 번, 펫이 봉을 조금 벌어 와요(단계·레벨·강화에 따라).
 * - 배가 텅 빈 채로 3일이 지나면 가출해요. 10봉을 내면 다시 데려와요(레벨·강화는 그대로).
 * 값은 아래 상수만 고치면 돼요.
 */

export const PET_EGG_PRICE = 30;
export const PET_HATCH_TAPS = 10;
export const PET_MAX_LEVEL = 30;
export const PET_EVOLVE_LEVELS = Object.freeze([10, 20]); // 1단계→2단계, 2단계→3단계
export const PET_MAX_ENHANCE = 10;
export const PET_PLAY_PER_DAY = 3;
export const PET_PLAY_EXP = 8;
/** 포만감은 한 시간에 이만큼 줄어요(가득 찬 뒤 약 하루면 비어요). */
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
});
/** 색이 다른 펫이 나올 확률 */
export const PET_SHINY_CHANCE = 0.05;

const int = (v, lo = 0, hi = 1e15) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

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
        return { v: 1, phase: 'egg', taps: int(src.taps, 0, PET_HATCH_TAPS), boughtAt: int(src.boughtAt), dex };
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
        full: clamp(src.full, 0, 100),
        fedAt: int(src.fedAt),
        playDate: String(src.playDate || '').slice(0, 10),
        playCount: int(src.playCount, 0, PET_PLAY_PER_DAY),
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

/** 전투력(랭킹 기준): 단계·레벨·강화를 합쳐요. */
export function petPower(pet) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return 0;
    return p.stage * 50 + p.level * 10 + p.enhance * 15 + (p.shiny ? 20 : 0) + (PET_SPECIES[p.species].rare ? 30 : 0);
}

/**
 * 지금 시각 기준 모습(저장하지 않는 계산값).
 * full: 지금 포만감, away: 가출했는지, mood: happy|ok|hungry|starving|away, canEvolve, walkBong 등
 */
export function petView(pet, now = Date.now(), today = '') {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return { ...p, away: false, mood: '', fullNow: 0 };
    const t = int(now);
    const hours = Math.max(0, (t - p.fedAt) / HOUR);
    const fullNow = Math.max(0, Math.round(p.full - hours * PET_HUNGER_PER_HOUR));
    const emptyAt = p.fedAt + (p.full / PET_HUNGER_PER_HOUR) * HOUR;
    const hungryHours = Math.max(0, (t - emptyAt) / HOUR);
    const away = hungryHours >= PET_RUNAWAY_HOURS;
    const mood = away ? 'away' : fullNow >= 60 ? 'happy' : fullNow >= 30 ? 'ok' : fullNow > 0 ? 'hungry' : 'starving';
    const playsLeft = p.playDate === today ? Math.max(0, PET_PLAY_PER_DAY - p.playCount) : PET_PLAY_PER_DAY;
    return {
        ...p,
        fullNow,
        away,
        mood,
        hoursToRunaway: away ? 0 : Math.max(0, PET_RUNAWAY_HOURS - hungryHours),
        playsLeft,
        walked: p.walkDate === today,
        walkBong: petWalkBong(p),
        canEvolve: p.stage < 3 && p.level >= PET_EVOLVE_LEVELS[p.stage - 1],
        expNeed: p.level >= PET_MAX_LEVEL ? 0 : petExpNeed(p.level),
        power: petPower(p),
        enhanceCost: petEnhanceCost(p.enhance),
        enhanceChance: petEnhanceChance(p.enhance),
    };
}

/** 산책 한 번에 벌어 오는 봉 */
export function petWalkBong(pet) {
    const p = pet && pet.phase === 'pet' ? pet : sanitizePet(pet);
    if (p.phase !== 'pet') return 0;
    return 1 + p.stage + Math.floor(p.level / 10) + Math.floor(p.enhance / 4);
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
    const shiny = rnd() < PET_SHINY_CHANCE;
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

/** 놀아 주기(공짜, 하루 3번) */
export function playWithPet(pet, { now = 0, today = '' } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    const v = petView(p, now, today);
    if (v.away) return fail(p, 'away');
    if (v.playsLeft <= 0) return fail(p, 'play_limit');
    const count = (p.playDate === today ? p.playCount : 0) + 1;
    const grown = addExp({ ...p, playDate: today, playCount: count }, PET_PLAY_EXP);
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
export function walkPet(pet, { now = 0, today = '' } = {}) {
    const p = sanitizePet(pet);
    if (p.phase !== 'pet') return fail(p, 'no_pet');
    const v = petView(p, now, today);
    if (v.away) return fail(p, 'away');
    if (!today || v.walked) return fail(p, 'walked');
    if (v.fullNow < PET_WALK_MIN_FULL) return fail(p, 'too_hungry');
    const gain = petWalkBong(p);
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
    no_bong: '봉이 모자라요.',
    no_egg: '품을 알이 없어요.',
    no_pet: '펫이 없어요.',
    bad_food: '그런 먹이는 없어요.',
    away: '펫이 가출했어요. 먼저 데려와요.',
    full: '배가 불러서 더 못 먹어요. 조금 있다가 줘요.',
    play_limit: '오늘은 충분히 놀았어요. 내일 또 놀아요.',
    not_ready: '아직 진화할 수 없어요.',
    max_enhance: '강화를 끝까지 했어요.',
    walked: '오늘은 이미 산책을 다녀왔어요.',
    too_hungry: '배가 고파서 산책을 못 가요. 먼저 먹이를 줘요.',
    not_away: '펫이 집에 있어요.',
    bad_name: '이름을 다시 적어 줘요.',
});

export function petErrorText(code) {
    return PET_ERROR_TEXT[code] || '할 수 없어요.';
}

/** 반 펫 랭킹: 전투력 순. students: [{id, name, pet}] */
export function rankClassPets(students, now = Date.now(), today = '') {
    return (Array.isArray(students) ? students : [])
        .map((s) => ({ id: String(s.id), owner: String(s.name || s.id), view: petView(s.pet, now, today) }))
        .filter((r) => r.view.phase === 'pet')
        .sort((a, b) => b.view.power - a.view.power || b.view.level - a.view.level || a.id.localeCompare(b.id))
        .map((r, i) => ({ ...r, rank: i + 1 }));
}
