/**
 * 메이트 펫 탐험(보스 레이드): 반 친구들의 대표 펫이 모여 보스를 잡는 방치형 전투(순수 모듈, DOM·Firestore 없음).
 *
 * - 2명부터, 많게는 학급 인원(최대 13명)까지 한 팀이 돼요. 스테이지는 22개(12~22는 색다른 보스), 보스마다 속성이 달라요.
 * - 전투는 자동이에요. 같은 팀·같은 보스·같은 씨앗(seed)이면 어느 기기에서 돌려도 결과가 똑같아요.
 *   그래서 방장이 '출발'을 누르면 모두의 화면에서 같은 전투가 펼쳐져요.
 * - 사람이 많을수록 유리해요: 공격이 늘고, 한 명 늘 때마다 팀 전체 공격력이 조금씩(기본 6%) 더 세져요.
 * - 속성 상성: 유리하면 피해 1.5배, 불리하면 0.75배.
 * - 도전은 무제한이에요. 보상은 스테이지 첫 클리어 보상(한 번)과 반복 보상(하루 정해진 횟수까지)이에요.
 * - 스테이지·보상·하루 보상 횟수는 마스터가 고칠 수 있어요(settings/global 의 petSettings.raid).
 * - 펫 더 데려가기: 한 사람이 자기 펫을 더(기본 2마리까지) 데려갈 수 있어요. 출발할 때 한 마리에 2봉씩 내요(보상 받을 때 같이 계산해요).
 * - 혼자 있는 방은 1분 뒤 없애고, 모두 준비했는데 한 명만 10초 넘게 준비하지 않으면 내보내요(화면 쪽에서 시간을 재요).
 * - 5턴마다 OX 퀴즈: 참가자의 반 이상이 맞히면 합동 필살기, 아니면 보스 필살기를 맞아요.
 */
import { PET_GUARD_LEVEL, PET_GUARD_SKILLS, PET_HEAL_LEVEL, PET_HEAL_LOW_PCT, PET_HEAL_SKILLS, PET_MAX_LEVEL, PET_MAX_POWER, PET_SKILL_MULTS, PET_SPECIES, PET_TYPES, petPower, petSkillCount, petView, sanitizeRaidProgress } from './petGame.js';

/** 전투 규칙 판: 2부터 막기 기술(공격받을 때 발동)이 들어가요. 예전 전투는 예전 규칙으로 다시 돌려요. */
/** 3부터 OX 퀴즈(합동 필살기·보스 필살기)가 들어가요. */
/** 4부터 회복 기술(Lv.40)이 들어가요. 예전 전투는 예전 규칙으로 다시 돌려요. */
/** 5부터 전투가 최대 20턴이에요(4까지는 18턴). 예전 전투는 예전 턴 수로 다시 돌려요. */
export const RAID_RULES = 5;

export const RAID_MIN_PARTY = 2;
export const RAID_MAX_PARTY = 13;
export const RAID_STAGE_COUNT = 22;
export const RAID_MAX_ROUNDS = 20;
/** 규칙 판 4까지의 최대 턴 수(지난 전투 기록을 그대로 다시 보여 주려고 남겨 둬요). */
export const RAID_OLD_MAX_ROUNDS = 18;
/** 규칙 판에 맞는 최대 턴 수. */
export const raidMaxRounds = (rules) => (int(rules) >= 5 ? RAID_MAX_ROUNDS : RAID_OLD_MAX_ROUNDS);
/** 열어 둔 채 이만큼 지난 탐험 방은 지난 방으로 봐요(30분). */
export const RAID_PARTY_TTL_MS = 30 * 60 * 1000;

/** 속성 상성: 왼쪽이 오른쪽에게 강해요. */
export const RAID_STRONG = Object.freeze({
    fire: ['grass', 'ice'],
    water: ['fire', 'rock'],
    grass: ['water', 'rock'],
    electric: ['water'],
    ice: ['grass', 'star'],
    rock: ['fire', 'electric'],
    star: ['electric'],
    fight: [], // 격투는 상성이 없어요
});

/** 공격하는 쪽 속성이 받는 쪽에게 주는 배수 */
export function raidTypeMult(attacker, defender) {
    if ((RAID_STRONG[attacker] || []).includes(defender)) return 1.5;
    if ((RAID_STRONG[defender] || []).includes(attacker)) return 0.75;
    return 1;
}

/**
 * 기본 스테이지 22개(12~22는 1~11 보스의 색다른 판). 11스테이지 챔피루는 격투(상성 없음)라 누구나 같은 데미지로 싸워요. art 는 보스 그림(펫 일러스트를 크게·어둡게 써요), 나머지는 마스터가 고칠 수 있어요.
 * hp·atk: 보스 체력·공격력, aoe: 전체 공격을 쓸 확률(%), first: 첫 클리어 봉, repeat: 반복 클리어 봉
 * (hits 는 예전 규칙에서 쓰던 값이라 남겨만 둬요.)
 */
export const RAID_DEFAULT_STAGES = Object.freeze([
    { name: '숲속의 큰 싹록', type: 'grass', art: 'sproutdeer_1', hp: 1500, atk: 45, hits: 1, aoe: 20, first: 3, repeat: 1 },
    { name: '웅덩이 대장 몽달', type: 'water', art: 'dropotter_1', hp: 3200, atk: 70, hits: 1, aoe: 25, first: 4, repeat: 1 },
    { name: '성난 화르냥', type: 'fire', art: 'emberkit_2', hp: 6000, atk: 110, hits: 2, aoe: 30, first: 5, repeat: 1 },
    { name: '폭풍의 번쩍부엉', type: 'electric', art: 'zapowl_2', hp: 10000, atk: 150, hits: 2, aoe: 30, first: 6, repeat: 2 },
    { name: '눈보라 서리토', type: 'ice', art: 'snowbun_2', hp: 16000, atk: 200, hits: 2, aoe: 35, first: 8, repeat: 2 },
    { name: '절벽의 바위북', type: 'rock', art: 'pebbletle_2', hp: 25000, atk: 260, hits: 2, aoe: 35, first: 10, repeat: 2 },
    { name: '고대 숲의 숲왕록', type: 'grass', art: 'sproutdeer_3', hp: 38000, atk: 330, hits: 3, aoe: 40, first: 12, repeat: 3 },
    { name: '깊은 바다 해달왕', type: 'water', art: 'dropotter_3', hp: 55000, atk: 420, hits: 3, aoe: 40, first: 15, repeat: 3 },
    { name: '화산의 염호랑', type: 'fire', art: 'emberkit_3', hp: 90000, atk: 520, hits: 3, aoe: 45, first: 18, repeat: 4 },
    { name: '암흑 성룡', type: 'star', art: 'stardrake_3', hp: 125000, atk: 540, hits: 4, aoe: 50, first: 25, repeat: 5 },
    { name: '전설의 챔피루', type: 'fight', art: 'punchroo_3', hp: 200000, atk: 650, hits: 4, aoe: 50, first: 30, repeat: 6 },
    { name: '빛나는 큰 싹록', type: 'grass', art: 'sproutdeer_1_s', hp: 230000, atk: 680, hits: 4, aoe: 50, first: 32, repeat: 6 },
    { name: '빛나는 몽달 대장', type: 'water', art: 'dropotter_1_s', hp: 250000, atk: 700, hits: 4, aoe: 50, first: 34, repeat: 6 },
    { name: '빛나는 화르냥', type: 'fire', art: 'emberkit_2_s', hp: 270000, atk: 720, hits: 4, aoe: 50, first: 36, repeat: 7 },
    { name: '빛나는 번쩍부엉', type: 'electric', art: 'zapowl_2_s', hp: 290000, atk: 740, hits: 4, aoe: 50, first: 38, repeat: 7 },
    { name: '빛나는 서리토', type: 'ice', art: 'snowbun_2_s', hp: 310000, atk: 760, hits: 4, aoe: 50, first: 40, repeat: 8 },
    { name: '빛나는 바위북', type: 'rock', art: 'pebbletle_2_s', hp: 330000, atk: 780, hits: 4, aoe: 50, first: 42, repeat: 8 },
    { name: '빛나는 숲왕록', type: 'grass', art: 'sproutdeer_3_s', hp: 350000, atk: 800, hits: 4, aoe: 50, first: 44, repeat: 9 },
    { name: '빛나는 해달왕', type: 'water', art: 'dropotter_3_s', hp: 365000, atk: 820, hits: 4, aoe: 50, first: 46, repeat: 9 },
    { name: '빛나는 염호랑', type: 'fire', art: 'emberkit_3_s', hp: 380000, atk: 840, hits: 4, aoe: 50, first: 48, repeat: 10 },
    { name: '빛나는 챔피루', type: 'fight', art: 'punchroo_3_s', hp: 400000, atk: 860, hits: 4, aoe: 55, first: 50, repeat: 10 },
    { name: '빛나는 암흑 성룡', type: 'star', art: 'stardrake_3_s', hp: 480000, atk: 900, hits: 4, aoe: 55, first: 60, repeat: 12 },
].map((x) => Object.freeze(x)));

export const RAID_DEFAULT_SETTINGS = Object.freeze({
    /** 하루에 보상을 받을 수 있는 횟수(도전 자체는 무제한) */
    dailyRewards: 3,
    /** 출발할 수 있는 가장 적은 인원 */
    minParty: 2,
    /** 한 팀 최대 인원(0이면 학급 인원에 맞춰요, 최대 13) */
    maxParty: 0,
    /** 한 명 늘 때마다 팀 공격력이 이만큼(%) 세져요 */
    teamBonus: 6,
    /** 한 사람이 더 데려갈 수 있는 펫 수(0이면 끔, 최대 2) */
    extraMax: 2,
    /** 더 데려가는 펫 한 마리 값(봉). 출발할 때 내요. */
    extraFee: 2,
    /** 아무도 오지 않은 방을 없애는 시간(초, 0이면 끔) */
    soloSec: 60,
    /** 모두 준비했는데 한 명만 준비하지 않을 때 내보내는 시간(초, 0이면 끔) */
    idleSec: 10,
    /** 몇 턴마다 OX 퀴즈를 낼지(0이면 끔) */
    quizEvery: 5,
    /** 퀴즈 푸는 시간(초) */
    quizSec: 10,
    /** 합동 필살기: 살아 있는 펫마다 공격력의 이만큼(%) */
    teamUlt: 300,
    /** 보스 필살기: 살아 있는 모두에게 보스 공격력의 이만큼(%) */
    bossUlt: 120,
    /** 첫 클리어 보상 시즌. 1 올리면 모두 첫 보상을 다시 받을 수 있어요. */
    rewardSeason: 1,
});

/** 한 사람이 더 데려갈 수 있는 펫의 최대(설정으로 더 줄일 수 있어요) */
export const RAID_MAX_EXTRA = 2;

/** 퀴즈 은행에서 문제를 못 받았을 때 쓰는 문제 */
export const RAID_FALLBACK_QUIZ = Object.freeze([
    ['1분은 60초예요.', 'O'],
    ['1km는 1000m예요.', 'O'],
    ['삼각형의 세 각의 크기를 더하면 180도예요.', 'O'],
    ['지구는 태양 둘레를 돌아요.', 'O'],
    ['거미는 곤충이에요.', 'X'],
    ['고래는 물고기예요.', 'X'],
    ['물은 100도에서 얼어요.', 'X'],
    ['일주일은 8일이에요.', 'X'],
].map(([q, a]) => Object.freeze({ q, a })));

const int = (v, lo = 0, hi = 1e15) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};
const num = (v, def, lo, hi) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && v !== null && v !== '' && v !== undefined ? Math.max(lo, Math.min(hi, n)) : def;
};
const cleanId = (v) => String(v ?? '').trim().slice(0, 20);
const cleanText = (v, max) => String(v ?? '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function sanitizeRaidSettings(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const list = Array.isArray(src.stages) ? src.stages : [];
    const stages = RAID_DEFAULT_STAGES.map((def, i) => {
        const r = list[i] && typeof list[i] === 'object' ? list[i] : {};
        return {
            name: cleanText(r.name, 16) || def.name,
            type: PET_TYPES[r.type] ? r.type : def.type,
            art: def.art,
            hp: num(r.hp, def.hp, 100, 5000000),
            atk: num(r.atk, def.atk, 0, 100000),
            hits: num(r.hits, def.hits, 1, RAID_MAX_PARTY),
            aoe: num(r.aoe, def.aoe, 0, 100),
            first: num(r.first, def.first, 0, 1000),
            repeat: num(r.repeat, def.repeat, 0, 1000),
        };
    });
    const d = RAID_DEFAULT_SETTINGS;
    return {
        stages,
        dailyRewards: num(src.dailyRewards, d.dailyRewards, 0, 99),
        minParty: num(src.minParty, d.minParty, 1, RAID_MAX_PARTY),
        maxParty: num(src.maxParty, d.maxParty, 0, RAID_MAX_PARTY),
        teamBonus: num(src.teamBonus, d.teamBonus, 0, 50),
        extraMax: num(src.extraMax, d.extraMax, 0, RAID_MAX_EXTRA),
        extraFee: num(src.extraFee, d.extraFee, 0, 100),
        soloSec: num(src.soloSec, d.soloSec, 0, 600),
        idleSec: num(src.idleSec, d.idleSec, 0, 120),
        quizEvery: num(src.quizEvery, d.quizEvery, 0, 9),
        quizSec: num(src.quizSec, d.quizSec, 5, 60),
        teamUlt: num(src.teamUlt, d.teamUlt, 0, 1000),
        bossUlt: num(src.bossUlt, d.bossUlt, 0, 500),
        rewardSeason: num(src.rewardSeason, d.rewardSeason, 1, 999),
    };
}

/** 한 팀 최대 인원: 설정값이 없으면 학급 인원(2~13) */
export function raidMaxParty(settings, classSize = RAID_MAX_PARTY) {
    const s = sanitizeRaidSettings(settings);
    const byClass = Math.max(RAID_MIN_PARTY, Math.min(RAID_MAX_PARTY, int(classSize) || RAID_MAX_PARTY));
    const max = s.maxParty >= RAID_MIN_PARTY ? Math.min(s.maxParty, RAID_MAX_PARTY) : byClass;
    return Math.max(max, s.minParty);
}

/** 내가 도전할 수 있는 가장 높은 스테이지(앞 스테이지를 깨야 다음이 열려요). 1부터예요. */
export function raidUnlockedStage(progress) {
    const p = sanitizeRaidProgress(progress);
    let n = 1;
    while (n < RAID_STAGE_COUNT && p.firsts.includes(n)) n += 1;
    return n;
}

/** 이번 보상 시즌 기준으로 첫 보상을 받은 스테이지 목록(시즌이 바뀌었으면 빈 목록) */
export function raidPaidFirsts(progressRaw, settings = null) {
    const p = sanitizeRaidProgress(progressRaw);
    const cfg = sanitizeRaidSettings(settings);
    return p.season === cfg.rewardSeason ? p.paid : [];
}

/* ---------- 팀원 ---------- */

/** 대표 펫으로 팀원 정보를 만들어요. 펫이 없거나 가출했으면 null */
export function raidMemberFromPet(pet, { id, name, now = Date.now(), today = '' } = {}) {
    const v = petView(pet, now, today);
    const sid = cleanId(id);
    if (!sid || v.phase !== 'pet' || v.away) return null;
    return {
        id: sid,
        name: cleanText(name, 12) || sid,
        petName: cleanText(v.name, 8),
        species: v.species,
        stage: v.stage,
        shiny: v.shiny === true,
        level: v.level,
        enhance: v.enhance,
        type: PET_SPECIES[v.species].type,
        power: petPower(v),
    };
}

function sanitizeMember(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const sp = PET_SPECIES[String(raw.species || '')];
    const id = cleanId(raw.id);
    if (!sp || !id) return null;
    const owner = cleanId(raw.owner);
    return {
        id,
        ...(owner && owner !== id ? { owner } : {}), // 더 데려온 펫이면 주인 학번
        name: cleanText(raw.name, 12) || id,
        petName: cleanText(raw.petName, 8) || sp.names[0],
        species: sp.id,
        stage: int(raw.stage, 1, 3),
        shiny: raw.shiny === true,
        level: int(raw.level, 1, PET_MAX_LEVEL),
        enhance: int(raw.enhance, 0, 10),
        type: sp.type,
        power: int(raw.power, 0, PET_MAX_POWER),
        ...(raw.ready === true ? { ready: true } : {}), // 방에서 '준비'를 눌렀는지
    };
}

/** 이 펫의 주인(더 데려온 펫은 owner, 아니면 자기 id) */
export const raidOwner = (m) => (m && (m.owner || m.id)) || '';

/** 팀에 있는 사람들(학번, 들어온 순서) */
export function raidOwners(members) {
    const out = [];
    (Array.isArray(members) ? members : []).forEach((m) => { const o = raidOwner(m); if (o && !out.includes(o)) out.push(o); });
    return out;
}

/* ---------- 전투(자동) ---------- */

function makeRng(seed) {
    let a = (int(seed) ^ 0x9e3779b9) >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 펫의 체력·공격력 */
export function raidPetStats(power) {
    const p = int(power, 0, PET_MAX_POWER);
    return { hp: 200 + p * 2, atk: 20 + Math.round(p * 0.5) };
}

/** 보스의 단일 공격은 한 마리에게 공격력의 1.5배, 전체 공격은 모두에게 공격력의 절반이에요. */
export const RAID_BOSS_SINGLE_MULT = 1.5;
export const RAID_BOSS_ALL_MULT = 0.5;

/**
 * 전투를 끝까지 돌려요.
 * - 펫은 배운 기술(레벨 1·10·20) 가운데 하나를 무작위로 써요. 센 기술일수록 데미지가 커요.
 * - 보스는 턴마다 단일 공격(한 마리에게 세게)이나 전체 공격(모두에게 약하게) 중 하나를 써요.
 * @returns {{ win: boolean, rounds: Array, bossHp: number, bossMaxHp: number, dealt: Record<string, number>, alive: string[], teamMult: number }}
 *   rounds[i] = { hits: [{ by, dmg, crit, mult, skill }], bossHp, bossMove: 'single'|'all'|'', boss: [{ target, dmg, faint, raw, blocked, guard, counter }] }
 * - guard(규칙 2): 공격받은 펫이 레벨 5 이상이면 막기 기술이 확률로 발동해 데미지를 줄이고(blocked), 되받아쳐요(counter).
 *   blocked[id]: 막은 데미지 합계, dealt[id]: 입힌 데미지 합계(되받아치기 포함)
 * - quiz(규칙 3): { every, results, teamUlt, bossUlt }. every 턴마다 퀴즈를 내요. results[k] 가 true 면 합동 필살기, false 면 보스 필살기,
 *   아직 없으면 거기서 멈추고 pending: true 로 돌려줘요(답이 모이면 results 를 채워 처음부터 다시 돌려요. 앞부분은 똑같이 나와요).
 *   퀴즈 결과는 rounds 에 { quiz: k, ok, hits, bossHp, bossMove: ''|'ult', boss } 로 끼워 넣어요. turns 는 퀴즈를 뺀 진짜 턴 수예요.
 * - heal(규칙 4): 보스 공격 뒤 Lv.40 펫이 회복 기술을 확률로 써요. 그 라운드에 heals: [{ by, target, amount }] 가 붙어요(퀴즈 라운드에는 없어요).
 *   healed[id]: 그 펫이 회복 기술로 채운 체력 합계
 */
export function simulateRaid(membersRaw, bossRaw, seed, { teamBonus = RAID_DEFAULT_SETTINGS.teamBonus, guard = false, quiz = null, heal = false, maxRounds = RAID_MAX_ROUNDS } = {}) {
    const limit = Math.max(1, Math.min(RAID_MAX_ROUNDS, Math.floor(Number(maxRounds)) || RAID_MAX_ROUNDS));
    const members = (Array.isArray(membersRaw) ? membersRaw : []).map(sanitizeMember).filter(Boolean).slice(0, RAID_MAX_PARTY);
    const boss = { type: PET_TYPES[bossRaw && bossRaw.type] ? bossRaw.type : 'grass', hp: int(bossRaw && bossRaw.hp, 1), atk: int(bossRaw && bossRaw.atk), aoe: int(bossRaw && bossRaw.aoe, 0, 100) };
    const rnd = makeRng(seed);
    const teamMult = 1 + (Math.max(0, members.length - 1) * int(teamBonus, 0, 50)) / 100;
    const state = members.map((m) => ({ ...m, ...raidPetStats(m.power), max: raidPetStats(m.power).hp, mult: raidTypeMult(m.type, boss.type), def: raidTypeMult(boss.type, m.type), skills: petSkillCount(m.level) }));
    const dealt = {};
    const blocked = {};
    const healed = {};
    members.forEach((m) => { dealt[m.id] = 0; blocked[m.id] = 0; healed[m.id] = 0; });
    let bossHp = boss.hp;
    const rounds = [];
    const every = quiz ? int(quiz.every, 0, 9) : 0;
    const results = quiz && Array.isArray(quiz.results) ? quiz.results : [];
    let pending = false;
    let turns = 0;
    for (let r = 0; r < limit && bossHp > 0; r += 1) {
        const alive = state.filter((m) => m.hp > 0);
        if (!alive.length) break;
        const hits = [];
        for (const m of alive) {
            const skill = Math.min(m.skills - 1, Math.floor(rnd() * m.skills));
            const crit = rnd() < 0.12;
            const dmg = Math.max(1, Math.round(m.atk * PET_SKILL_MULTS[skill] * m.mult * teamMult * (0.85 + rnd() * 0.3) * (crit ? 1.8 : 1)));
            bossHp = Math.max(0, bossHp - dmg);
            dealt[m.id] += dmg;
            hits.push({ by: m.id, dmg, crit, mult: m.mult, skill });
            if (bossHp <= 0) break;
        }
        const bossHits = [];
        let bossMove = '';
        if (bossHp > 0) {
            bossMove = rnd() * 100 < boss.aoe ? 'all' : 'single';
            const targets = bossMove === 'all' ? alive : [alive[Math.floor(rnd() * alive.length)]];
            const power = bossMove === 'all' ? RAID_BOSS_ALL_MULT : RAID_BOSS_SINGLE_MULT;
            for (const t of targets) {
                const raw = Math.max(1, Math.round(boss.atk * power * t.def * (0.85 + rnd() * 0.3)));
                let dmg = raw;
                let save = 0;
                let counter = 0;
                let used = false;
                const g = PET_GUARD_SKILLS[t.species];
                if (guard && g && t.level >= PET_GUARD_LEVEL && rnd() * 100 < g.chance) {
                    used = true;
                    save = Math.min(raw, Math.round((raw * g.block) / 100));
                    dmg = raw - save;
                    if (g.counter) counter = Math.max(1, Math.round((t.atk * g.counter * t.mult) / 100));
                }
                t.hp = Math.max(0, t.hp - dmg);
                blocked[t.id] += save;
                if (counter) { bossHp = Math.max(0, bossHp - counter); dealt[t.id] += counter; }
                bossHits.push(used ? { target: t.id, dmg, faint: t.hp <= 0, raw, blocked: save, guard: true, counter } : { target: t.id, dmg, faint: t.hp <= 0 });
                if (bossHp <= 0) break;
            }
        }
        const heals = [];
        if (heal && bossHp > 0) {
            for (const m of state) {
                if (m.hp <= 0 || m.level < PET_HEAL_LEVEL) continue;
                const h = PET_HEAL_SKILLS[m.species];
                if (!h) continue;
                if (h.when === 'low' && m.hp > (m.max * PET_HEAL_LOW_PCT) / 100) continue; // 조건이 안 되면 주사위를 굴리지 않아요
                if (rnd() * 100 >= h.chance) continue;
                const alive = state.filter((x) => x.hp > 0);
                let targets;
                if (h.target === 'self') targets = [m];
                else if (h.target === 'all') targets = alive;
                else targets = [alive.reduce((lo, x) => (x.hp / x.max < lo.hp / lo.max ? x : lo), alive[0])]; // 같으면 앞 사람
                for (const t of targets) {
                    const amount = Math.min(t.max - t.hp, Math.round((t.max * h.pct) / 100));
                    if (amount <= 0) continue;
                    t.hp += amount;
                    healed[m.id] += amount;
                    heals.push({ by: m.id, target: t.id, amount });
                }
            }
        }
        rounds.push({ hits, bossHp, bossMove, boss: bossHits, ...(heals.length ? { heals } : {}) });
        turns += 1;
        // OX 퀴즈: 정해진 턴마다(마지막 턴 뒤에는 안 내요)
        if (every > 0 && bossHp > 0 && (r + 1) % every === 0 && r + 1 < limit) {
            const left = state.filter((m) => m.hp > 0);
            if (!left.length) break;
            const k = (r + 1) / every - 1;
            if (results[k] !== true && results[k] !== false) { pending = true; break; }
            if (results[k]) {
                // 합동 필살기: 살아 있는 펫이 모두 함께 크게 때려요.
                const ult = [];
                for (const m of left) {
                    const dmg = Math.max(1, Math.round((m.atk * int(quiz.teamUlt, 0, 1000) * m.mult * teamMult) / 100));
                    bossHp = Math.max(0, bossHp - dmg);
                    dealt[m.id] += dmg;
                    ult.push({ by: m.id, dmg, crit: false, mult: m.mult, skill: 2, ult: true });
                    if (bossHp <= 0) break;
                }
                rounds.push({ quiz: k, ok: true, hits: ult, bossHp, bossMove: '', boss: [] });
            } else {
                // 보스 필살기: 살아 있는 모두가 크게 맞아요(막기 기술도 안 통해요).
                const smash = [];
                for (const t of left) {
                    const dmg = Math.max(1, Math.round((boss.atk * int(quiz.bossUlt, 0, 500) * t.def) / 100));
                    t.hp = Math.max(0, t.hp - dmg);
                    smash.push({ target: t.id, dmg, faint: t.hp <= 0 });
                }
                rounds.push({ quiz: k, ok: false, hits: [], bossHp, bossMove: 'ult', boss: smash });
            }
        }
    }
    return {
        win: !pending && bossHp <= 0,
        pending,
        turns,
        rounds,
        bossHp,
        bossMaxHp: boss.hp,
        dealt,
        blocked,
        healed,
        alive: state.filter((m) => m.hp > 0).map((m) => m.id),
        teamMult,
    };
}

/* ---------- 탐험 방(Firestore 문서 하나) ---------- */
/*
 * { id(방 문서 이름 = 처음 방장 학번), leaderId, leaderName, stage, status: 'open'|'fight', members: [...], createdAt, updatedAt,
 *   soloAt(혼자 남은 때, 아니면 0), waitId·waitAt(한 명만 준비하지 않았을 때 그 사람과 그때),
 *   run: { id, seed, rules, stage, boss, win, startedAt, members, extraFee, quizEvery, teamUlt, bossUlt,
 *          results: [퀴즈마다 성공 여부], log: [{ r: 맞힌 사람, t: 참가자, a: 정답 }], pending(퀴즈를 기다리는 중), quiz: { n, q, a, answers: { 학번: 'O'|'X' } } } }
 */

const cleanQuiz = (raw) => {
    const q = cleanText(raw && raw.q, 200);
    const a = raw && (raw.a === 'O' || raw.a === 'X') ? raw.a : '';
    return q && a ? { q, a } : null;
};

function sanitizeRun(r) {
    if (!r || typeof r !== 'object' || !r.id) return null;
    const boss = r.boss && typeof r.boss === 'object' ? r.boss : {};
    const members = [];
    (Array.isArray(r.members) ? r.members : []).forEach((m) => {
        const x = sanitizeMember(m);
        if (x && !members.some((y) => y.id === x.id) && members.length < RAID_MAX_PARTY) { delete x.ready; members.push(x); }
    });
    const results = (Array.isArray(r.results) ? r.results : []).slice(0, RAID_MAX_ROUNDS).map((x) => x === true);
    const log = (Array.isArray(r.log) ? r.log : []).slice(0, RAID_MAX_ROUNDS).map((x) => ({ r: int(x && x.r, 0, RAID_MAX_PARTY), t: int(x && x.t, 0, RAID_MAX_PARTY), a: x && x.a === 'X' ? 'X' : 'O' }));
    let quiz = null;
    const pending = r.pending === true;
    if (pending) {
        const src = r.quiz && typeof r.quiz === 'object' ? r.quiz : {};
        const qa = cleanQuiz(src) || RAID_FALLBACK_QUIZ[(int(r.seed) + results.length) % RAID_FALLBACK_QUIZ.length];
        const answers = {};
        const owners = raidOwners(members);
        Object.entries(src.answers && typeof src.answers === 'object' ? src.answers : {}).forEach(([k, v]) => {
            const id = cleanId(k);
            if (owners.includes(id) && (v === 'O' || v === 'X')) answers[id] = v;
        });
        quiz = { n: results.length, q: qa.q, a: qa.a, answers };
    }
    return {
        id: String(r.id).slice(0, 60),
        seed: int(r.seed),
        rules: int(r.rules, 0, 99),
        stage: int(r.stage, 1, RAID_STAGE_COUNT),
        boss: { name: cleanText(boss.name, 16), type: PET_TYPES[boss.type] ? boss.type : 'grass', art: String(boss.art || '').replace(/[^a-z0-9_]/g, '').slice(0, 20), hp: int(boss.hp, 1), atk: int(boss.atk), hits: int(boss.hits, 1, RAID_MAX_PARTY), aoe: int(boss.aoe, 0, 100), first: int(boss.first), repeat: int(boss.repeat) },
        teamBonus: int(r.teamBonus, 0, 50),
        win: !pending && r.win === true,
        startedAt: int(r.startedAt),
        members,
        extraFee: int(r.extraFee, 0, 100),
        quizEvery: int(r.quizEvery, 0, 9),
        teamUlt: int(r.teamUlt, 0, 1000),
        bossUlt: int(r.bossUlt, 0, 500),
        results,
        log,
        pending,
        quiz,
    };
}

export function sanitizeRaidParty(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const leaderId = cleanId(src.leaderId);
    if (!leaderId) return null;
    const members = [];
    (Array.isArray(src.members) ? src.members : []).forEach((m) => {
        const x = sanitizeMember(m);
        if (x && !members.some((y) => y.id === x.id) && members.length < RAID_MAX_PARTY) members.push(x);
    });
    return {
        id: cleanId(src.id) || leaderId,
        leaderId,
        leaderName: cleanText(src.leaderName, 12) || leaderId,
        stage: int(src.stage, 1, RAID_STAGE_COUNT),
        status: src.status === 'fight' ? 'fight' : 'open',
        members,
        createdAt: int(src.createdAt),
        updatedAt: int(src.updatedAt),
        soloAt: int(src.soloAt),
        waitId: cleanId(src.waitId),
        waitAt: int(src.waitAt),
        run: sanitizeRun(src.run),
    };
}

export function isRaidPartyStale(party, now = Date.now()) {
    return !party || int(now) - Math.max(party.updatedAt, party.createdAt) > RAID_PARTY_TTL_MS;
}

const bad = (error, party = null) => ({ ok: false, error, party });

/** 아직 준비하지 않은 사람들 */
export function raidUnready(party) {
    if (!party) return [];
    return raidOwners(party.members).filter((o) => !party.members.some((m) => m.id === o && m.ready === true));
}

/**
 * 방이 바뀔 때마다 시간표를 다시 적어요.
 * - soloAt: 모으는 중인데 한 사람뿐이면 그렇게 된 때(계속 혼자면 처음 때를 지켜요)
 * - waitId·waitAt: 두 명 이상인데 딱 한 명만 준비하지 않았으면 그 사람과 그렇게 된 때(같은 사람이면 처음 때를 지켜요)
 */
function stamp(next, prev, now) {
    const out = { ...next, soloAt: 0, waitId: '', waitAt: 0 };
    if (next.status !== 'open') return out;
    const owners = raidOwners(next.members);
    if (owners.length === 1) out.soloAt = prev && prev.status === 'open' && prev.soloAt > 0 && raidOwners(prev.members).length === 1 ? prev.soloAt : int(now);
    const lazy = raidUnready(next);
    if (owners.length >= 2 && lazy.length === 1) {
        out.waitId = lazy[0];
        out.waitAt = prev && prev.status === 'open' && prev.waitId === lazy[0] && prev.waitAt > 0 ? prev.waitAt : int(now);
    }
    return out;
}

/** 탐험 방 만들기(방장이 첫 팀원) */
export function createRaidParty({ member, stage, unlocked = 1, now = 0 } = {}) {
    const m = sanitizeMember(member);
    if (!m) return bad('no_pet');
    delete m.owner;
    delete m.ready;
    const st = int(stage, 1, RAID_STAGE_COUNT);
    if (st > int(unlocked, 1, RAID_STAGE_COUNT)) return bad('locked_stage');
    return { ok: true, error: '', party: stamp({ id: m.id, leaderId: m.id, leaderName: m.name, stage: st, status: 'open', members: [m], createdAt: int(now), updatedAt: int(now), run: null }, null, now) };
}

/**
 * 방에 들어가거나, 이미 있으면 내 펫들을 새로 바꿔요(자리는 그대로). 새로 오거나 펫을 바꾸면 다시 준비해야 해요.
 * extras: 더 데려갈 내 펫들(maxExtra 마리까지). 봉은 출발할 때 내요.
 * 펫이 13마리로 꽉 찼을 때 새 사람이 오면, 마지막에 더 데려온 펫 한 마리가 자리를 비켜 줘요(사람이 먼저예요).
 */
export function joinRaidParty(partyRaw, { member, extras = [], max = RAID_MAX_PARTY, maxExtra = 0, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    const m = sanitizeMember(member);
    if (!party) return bad('no_party');
    if (!m) return bad('no_pet', party);
    if (party.status !== 'open') return bad('fighting', party);
    if (isRaidPartyStale(party, now)) return bad('stale', party);
    delete m.ready;
    delete m.owner;
    const mine = [m];
    const limit = int(maxExtra, 0, RAID_MAX_EXTRA);
    (Array.isArray(extras) ? extras : []).forEach((raw) => {
        const x = sanitizeMember(raw);
        if (!x || mine.length > limit || mine.some((y) => y.species === x.species)) return;
        delete x.ready;
        mine.push({ ...x, id: `${m.id}~${mine.length}`, owner: m.id, name: m.name });
    });
    const at = party.members.findIndex((x) => x.id === m.id);
    const notMine = (x) => raidOwner(x) !== m.id;
    let before = (at >= 0 ? party.members.slice(0, at) : party.members).filter(notMine);
    let after = (at >= 0 ? party.members.slice(at) : []).filter(notMine);
    if (at < 0) {
        if (raidOwners(party.members).length >= Math.min(RAID_MAX_PARTY, int(max, RAID_MIN_PARTY))) return bad('full', party);
        if (before.length >= RAID_MAX_PARTY) {
            let drop = -1;
            before.forEach((x, i) => { if (x.owner) drop = i; });
            if (drop < 0) return bad('full', party);
            before = before.filter((_, i) => i !== drop);
        }
    }
    if (before.length + after.length + mine.length > RAID_MAX_PARTY) return bad('full_pets', party);
    return { ok: true, error: '', party: stamp({ ...party, members: before.concat(mine, after), updatedAt: int(now) }, party, now) };
}

/** 나가기. 방장이 나가면 방이 사라져요(party: null). 더 데려온 내 펫도 함께 나가요. */
export function leaveRaidParty(partyRaw, { id, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    const me = cleanId(id);
    if (!party) return bad('no_party');
    if (party.leaderId === me) return { ok: true, error: '', party: null };
    return { ok: true, error: '', party: stamp({ ...party, members: party.members.filter((x) => raidOwner(x) !== me), updatedAt: int(now) }, party, now) };
}

/** 방장이 스테이지를 바꿔요. */
export function setRaidStage(partyRaw, { id, stage, unlocked = 1, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (party.leaderId !== cleanId(id)) return bad('leader_only', party);
    if (party.status !== 'open') return bad('fighting', party);
    const st = int(stage, 1, RAID_STAGE_COUNT);
    if (st > int(unlocked, 1, RAID_STAGE_COUNT)) return bad('locked_stage', party);
    // 스테이지가 바뀌면 모두 다시 준비해야 해요.
    const members = st === party.stage ? party.members : party.members.map((m) => { const x = { ...m }; delete x.ready; return x; });
    return { ok: true, error: '', party: stamp({ ...party, stage: st, members, updatedAt: int(now) }, party, now) };
}

/** 모두 준비했는지(더 데려온 펫은 주인이 준비하면 돼요) */
export function isRaidAllReady(party) {
    return !!party && party.members.length > 0 && raidUnready(party).length === 0;
}

/** 준비 / 준비 취소 */
export function readyRaidParty(partyRaw, { id, ready = true, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (party.status !== 'open') return bad('fighting', party);
    const me = cleanId(id);
    if (!party.members.some((m) => m.id === me)) return bad('not_member', party);
    const members = party.members.map((m) => { if (m.id !== me) return m; const x = { ...m }; if (ready) x.ready = true; else delete x.ready; return x; });
    const next = stamp({ ...party, members, updatedAt: int(now) }, party, now);
    return { ok: true, error: '', party: next, allReady: isRaidAllReady(next) };
}

/**
 * 모두 준비했는데 한 명만 준비하지 않을 때 그 사람을 내보내요(시간은 화면에서 재요).
 * waitId·waitAt 이 내가 본 것과 같을 때만 해요(그 사이 준비했거나 다른 친구가 먼저 내보냈으면 아무 일도 없어요).
 * 방장이 나가게 되면 다음 사람이 방장이 돼요.
 */
export function kickRaidIdle(partyRaw, { id, waitId, waitAt, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (party.status !== 'open') return bad('fighting', party);
    const me = cleanId(id);
    const out = cleanId(waitId);
    if (!out || party.waitId !== out || party.waitAt !== int(waitAt) || party.waitAt <= 0) return bad('changed', party);
    if (me === out || !party.members.some((m) => m.id === me)) return bad('not_member', party);
    const members = party.members.filter((x) => raidOwner(x) !== out);
    const head = members.find((x) => !x.owner);
    if (!head) return bad('changed', party);
    const lead = party.leaderId === out ? { leaderId: head.id, leaderName: head.name } : {};
    const next = stamp({ ...party, ...lead, members, updatedAt: int(now) }, party, now);
    return { ok: true, error: '', party: next, kicked: out, allReady: isRaidAllReady(next) };
}

const pickQuiz = (question, seed, n) => cleanQuiz(question) || RAID_FALLBACK_QUIZ[(int(seed) + int(n)) % RAID_FALLBACK_QUIZ.length];

/** 방에 적힌 전투를 다시 돌려요(모든 기기에서 같은 결과). 퀴즈를 기다리는 중이면 거기까지만 나와요(pending). */
export function replayRaidRun(run) {
    if (!run) return null;
    const rules = int(run.rules);
    const quiz = rules >= 3 && int(run.quizEvery) > 0 ? { every: run.quizEvery, results: run.results || [], teamUlt: run.teamUlt, bossUlt: run.bossUlt } : null;
    return simulateRaid(run.members, run.boss, run.seed, { teamBonus: run.teamBonus, guard: rules >= 2, quiz, heal: rules >= 4, maxRounds: raidMaxRounds(rules) });
}

/**
 * 출발: 팀원 모두가 '준비'를 누르면 시작해요(마지막으로 준비한 사람의 화면이 출발을 걸어요).
 * 퀴즈가 없으면 전투를 끝까지 계산해 결과를 적고, 있으면 첫 퀴즈 앞까지 계산해 문제(question: { q, a })를 적어요.
 */
export function startRaid(partyRaw, { id, settings = null, seed = 1, now = 0, question = null } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (!party.members.some((m) => m.id === cleanId(id))) return bad('not_member', party);
    if (party.status !== 'open') return bad('fighting', party);
    if (!isRaidAllReady(party)) return bad('not_ready', party);
    const cfg = sanitizeRaidSettings(settings);
    if (raidOwners(party.members).length < cfg.minParty) return bad('need_party', party);
    const boss = { ...cfg.stages[party.stage - 1] };
    const s = int(seed) || 1;
    const run = {
        id: `${party.leaderId}_${int(now)}`, seed: s, rules: RAID_RULES, stage: party.stage, boss, teamBonus: cfg.teamBonus, win: false, startedAt: int(now),
        members: party.members.map((m) => { const x = { ...m }; delete x.ready; return x; }),
        extraFee: cfg.extraFee, quizEvery: cfg.quizEvery, teamUlt: cfg.teamUlt, bossUlt: cfg.bossUlt, results: [], log: [], pending: false, quiz: null,
    };
    const sim = replayRaidRun(run);
    if (sim.pending) { run.pending = true; run.quiz = { n: 0, ...pickQuiz(question, s, 0), answers: {} }; } else run.win = sim.win;
    return { ok: true, error: '', party: stamp({ ...party, status: 'fight', run, updatedAt: int(now) }, party, now), sim };
}

/** 퀴즈 하나를 마감해요: 참가자의 반 이상이 맞혔으면 합동 필살기(true), 아니면 보스 필살기(false). 다음 퀴즈가 있으면 문제를 새로 적어요. */
function settleQuiz(party, question, now) {
    const run = party.run;
    const owners = raidOwners(run.members);
    const right = owners.filter((o) => run.quiz.answers[o] === run.quiz.a).length;
    const okQuiz = right * 2 >= owners.length;
    const next = { ...run, results: run.results.concat(okQuiz), log: run.log.concat({ r: right, t: owners.length, a: run.quiz.a }), pending: false, quiz: null };
    const sim = replayRaidRun(next);
    if (sim.pending) { next.pending = true; next.quiz = { n: next.results.length, ...pickQuiz(question, run.seed, next.results.length), answers: {} }; } else next.win = sim.win;
    return { ok: true, error: '', party: { ...party, run: next, updatedAt: int(now) }, settled: true, quizOk: okQuiz, sim };
}

const openQuiz = (party, runId, n) => !!(party && party.run && party.run.id === String(runId) && party.run.pending && party.run.quiz && party.run.quiz.n === int(n));

/**
 * 퀴즈에 답해요(한 사람 한 번). 참가자가 모두 답하면 바로 마감해요.
 * next: 다음 퀴즈로 쓸 문제({ q, a }) — 내가 마지막으로 답해 마감할 때만 쓰여요.
 */
export function answerRaidQuiz(partyRaw, { id, runId, n, answer, next = null, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (!openQuiz(party, runId, n)) return bad('quiz_closed', party);
    const me = cleanId(id);
    const owners = raidOwners(party.run.members);
    if (!owners.includes(me)) return bad('not_member', party);
    if (answer !== 'O' && answer !== 'X') return bad('bad_answer', party);
    if (party.run.quiz.answers[me]) return bad('answered', party);
    const answers = { ...party.run.quiz.answers, [me]: answer };
    const withAnswer = { ...party, run: { ...party.run, quiz: { ...party.run.quiz, answers } }, updatedAt: int(now) };
    if (owners.every((o) => answers[o])) return settleQuiz(withAnswer, next, now);
    return { ok: true, error: '', party: withAnswer, settled: false };
}

/** 시간이 다 되면 답하지 않은 사람은 틀린 것으로 치고 마감해요. */
export function closeRaidQuiz(partyRaw, { id, runId, n, next = null, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (!openQuiz(party, runId, n)) return bad('quiz_closed', party);
    if (!raidOwners(party.run.members).includes(cleanId(id))) return bad('not_member', party);
    return settleQuiz(party, next, now);
}

/** 퀴즈를 기다리다 멈춘 전투는 이만큼 지나면 방장이 다시 모을 수 있어요. */
export const RAID_STUCK_MS = 5 * 60 * 1000;

/** 전투가 끝난 뒤 방장이 같은 팀으로 다시 모아요(마지막 전투 기록은 남겨서 늦게 온 친구도 보상을 받아요). */
export function reopenRaidParty(partyRaw, { id, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (party.leaderId !== cleanId(id)) return bad('leader_only', party);
    if (party.status === 'fight' && party.run && party.run.pending && int(now) - party.run.startedAt < RAID_STUCK_MS) return bad('fighting', party);
    // 다시 모으면 준비도 처음부터
    return { ok: true, error: '', party: stamp({ ...party, status: 'open', members: party.members.map((m) => { const x = { ...m }; delete x.ready; return x; }), updatedAt: int(now) }, party, now) };
}

/* ---------- 보상 ---------- */

/**
 * 전투 하나의 보상을 계산해요(한 전투에 한 번만).
 * - 이기면: 그 스테이지를 처음 깼을 때 첫 보상, 아니면 반복 보상(하루 dailyRewards 번까지)
 * - 지면 봉은 없어요. 펫 경험치는 이기면 스테이지×4, 져도 스테이지×1 — 단, 하루 보상 횟수를 다 쓴 뒤에는 0이에요.
 * - fee: 더 데려간 내 펫 값(한 마리에 run.extraFee 봉). 이기든 지든 출발했으면 내요.
 * - 퀴즈를 기다리는 전투(pending)는 아직 받을 수 없어요.
 * @returns {{ ok, error, bong, exp, first, limited, fee, progress }}
 */
export function claimRaidReward(progressRaw, run, { id, today = '', settings = null } = {}) {
    const progress = sanitizeRaidProgress(progressRaw);
    const me = cleanId(id);
    const no = (error) => ({ ok: false, error, bong: 0, exp: 0, first: false, limited: false, fee: 0, progress });
    if (!run || !run.id) return no('no_run');
    if (!run.members.some((m) => m.id === me)) return no('not_member');
    if (run.pending) return no('pending');
    if (progress.claimed.includes(run.id)) return no('claimed');
    const fee = run.members.filter((m) => m.owner === me).length * int(run.extraFee, 0, 100);
    const cfg = sanitizeRaidSettings(settings);
    const day = String(today || '');
    const dayRewards = progress.day === day ? progress.dayRewards : 0;
    const paidNow = raidPaidFirsts(progress, cfg);
    const next = { ...progress, day, dayRewards, claimed: progress.claimed.concat(run.id).slice(-30), season: cfg.rewardSeason, paid: paidNow.slice() };
    // 하루 보상 횟수를 다 쓰면 봉도 경험치도 더 주지 않아요(도전은 계속 할 수 있어요).
    const used = dayRewards >= cfg.dailyRewards;
    if (!run.win) return { ok: true, error: '', bong: 0, exp: used ? 0 : run.stage, first: false, limited: used, fee, progress: next };
    const first = !paidNow.includes(run.stage);
    let bong = 0;
    let limited = false;
    if (first) {
        bong = run.boss.first;
        next.paid = paidNow.concat(run.stage).sort((a, b) => a - b);
        if (!progress.firsts.includes(run.stage)) next.firsts = progress.firsts.concat(run.stage).sort((a, b) => a - b);
    } else {
        // 옛 데이터 보호: 깬 스테이지 기록에 없으면 넣어 줘요.
        if (!progress.firsts.includes(run.stage)) next.firsts = progress.firsts.concat(run.stage).sort((a, b) => a - b);
        if (dayRewards < cfg.dailyRewards) {
            bong = run.boss.repeat;
            next.dayRewards = dayRewards + 1;
        } else {
            limited = true;
        }
    }
    return { ok: true, error: '', bong, exp: limited ? 0 : run.stage * 4, first, limited, fee, progress: next };
}

export const RAID_ERROR_TEXT = Object.freeze({
    no_pet: '대표 펫이 있어야 탐험을 떠날 수 있어요. (가출한 펫은 못 가요)',
    locked_stage: '앞 스테이지를 먼저 깨야 해요.',
    no_party: '탐험 방이 사라졌어요.',
    fighting: '이미 출발한 팀이에요.',
    stale: '오래된 방이에요. 새로 만들어요.',
    full: '팀이 가득 찼어요.',
    leader_only: '방장만 할 수 있어요.',
    not_ready: '아직 준비하지 않은 친구가 있어요.',
    not_member: '이 팀이 아니에요.',
    need_party: '사람이 더 모여야 출발할 수 있어요.',
    full_pets: '팀에 펫 자리가 없어요. (한 팀에 13마리까지)',
    changed: '그 사이 방이 바뀌었어요.',
    quiz_closed: '이미 끝난 퀴즈예요.',
    answered: '이미 답했어요.',
    bad_answer: 'O나 X를 골라 줘요.',
    pending: '아직 전투가 끝나지 않았어요.',
});

export function raidErrorText(code) {
    return RAID_ERROR_TEXT[code] || '할 수 없어요.';
}
