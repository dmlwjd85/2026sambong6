/**
 * 메이트 펫 탐험(보스 레이드): 반 친구들의 대표 펫이 모여 보스를 잡는 방치형 전투(순수 모듈, DOM·Firestore 없음).
 *
 * - 2명부터, 많게는 학급 인원(최대 13명)까지 한 팀이 돼요. 스테이지는 10개, 보스마다 속성이 달라요.
 * - 전투는 자동이에요. 같은 팀·같은 보스·같은 씨앗(seed)이면 어느 기기에서 돌려도 결과가 똑같아요.
 *   그래서 방장이 '출발'을 누르면 모두의 화면에서 같은 전투가 펼쳐져요.
 * - 사람이 많을수록 유리해요: 공격이 늘고, 한 명 늘 때마다 팀 전체 공격력이 조금씩(기본 6%) 더 세져요.
 * - 속성 상성: 유리하면 피해 1.5배, 불리하면 0.75배.
 * - 도전은 무제한이에요. 보상은 스테이지 첫 클리어 보상(한 번)과 반복 보상(하루 정해진 횟수까지)이에요.
 * - 스테이지·보상·하루 보상 횟수는 마스터가 고칠 수 있어요(settings/global 의 petSettings.raid).
 */
import { PET_GUARD_LEVEL, PET_GUARD_SKILLS, PET_SKILL_MULTS, PET_SPECIES, PET_TYPES, petPower, petSkillCount, petView, sanitizeRaidProgress } from './petGame.js';

/** 전투 규칙 판: 2부터 막기 기술(공격받을 때 발동)이 들어가요. 예전 전투는 예전 규칙으로 다시 돌려요. */
export const RAID_RULES = 2;

export const RAID_MIN_PARTY = 2;
export const RAID_MAX_PARTY = 13;
export const RAID_STAGE_COUNT = 10;
export const RAID_MAX_ROUNDS = 18;
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
 * 기본 스테이지 10개. art 는 보스 그림(펫 일러스트를 크게·어둡게 써요), 나머지는 마스터가 고칠 수 있어요.
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
});

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
    return {
        id,
        name: cleanText(raw.name, 12) || id,
        petName: cleanText(raw.petName, 8) || sp.names[0],
        species: sp.id,
        stage: int(raw.stage, 1, 3),
        shiny: raw.shiny === true,
        level: int(raw.level, 1, 30),
        enhance: int(raw.enhance, 0, 10),
        type: sp.type,
        power: int(raw.power, 0, 1000),
        ...(raw.ready === true ? { ready: true } : {}), // 방에서 '준비'를 눌렀는지
    };
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
    const p = int(power, 0, 1000);
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
 */
export function simulateRaid(membersRaw, bossRaw, seed, { teamBonus = RAID_DEFAULT_SETTINGS.teamBonus, guard = false } = {}) {
    const members = (Array.isArray(membersRaw) ? membersRaw : []).map(sanitizeMember).filter(Boolean).slice(0, RAID_MAX_PARTY);
    const boss = { type: PET_TYPES[bossRaw && bossRaw.type] ? bossRaw.type : 'grass', hp: int(bossRaw && bossRaw.hp, 1), atk: int(bossRaw && bossRaw.atk), aoe: int(bossRaw && bossRaw.aoe, 0, 100) };
    const rnd = makeRng(seed);
    const teamMult = 1 + (Math.max(0, members.length - 1) * int(teamBonus, 0, 50)) / 100;
    const state = members.map((m) => ({ ...m, ...raidPetStats(m.power), mult: raidTypeMult(m.type, boss.type), def: raidTypeMult(boss.type, m.type), skills: petSkillCount(m.level) }));
    const dealt = {};
    const blocked = {};
    members.forEach((m) => { dealt[m.id] = 0; blocked[m.id] = 0; });
    let bossHp = boss.hp;
    const rounds = [];
    for (let r = 0; r < RAID_MAX_ROUNDS && bossHp > 0; r += 1) {
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
        rounds.push({ hits, bossHp, bossMove, boss: bossHits });
    }
    return {
        win: bossHp <= 0,
        rounds,
        bossHp,
        bossMaxHp: boss.hp,
        dealt,
        blocked,
        alive: state.filter((m) => m.hp > 0).map((m) => m.id),
        teamMult,
    };
}

/* ---------- 탐험 방(Firestore 문서 하나) ---------- */
/*
 * { id(방장 학번), leaderId, leaderName, stage, status: 'open'|'fight', members: [...], createdAt, updatedAt,
 *   run: { id, seed, stage, boss, win, startedAt, memberIds } }  ← 가장 최근에 출발한 전투(보상은 이걸 보고 받아요)
 */

export function sanitizeRaidParty(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const leaderId = cleanId(src.leaderId);
    if (!leaderId) return null;
    const members = [];
    (Array.isArray(src.members) ? src.members : []).forEach((m) => {
        const x = sanitizeMember(m);
        if (x && !members.some((y) => y.id === x.id) && members.length < RAID_MAX_PARTY) members.push(x);
    });
    let run = null;
    const r = src.run && typeof src.run === 'object' ? src.run : null;
    if (r && r.id) {
        const boss = r.boss && typeof r.boss === 'object' ? r.boss : {};
        run = {
            id: String(r.id).slice(0, 60),
            seed: int(r.seed),
            rules: int(r.rules, 0, 99),
            stage: int(r.stage, 1, RAID_STAGE_COUNT),
            boss: { name: cleanText(boss.name, 16), type: PET_TYPES[boss.type] ? boss.type : 'grass', art: String(boss.art || '').replace(/[^a-z0-9_]/g, '').slice(0, 20), hp: int(boss.hp, 1), atk: int(boss.atk), hits: int(boss.hits, 1, RAID_MAX_PARTY), aoe: int(boss.aoe, 0, 100), first: int(boss.first), repeat: int(boss.repeat) },
            teamBonus: int(r.teamBonus, 0, 50),
            win: r.win === true,
            startedAt: int(r.startedAt),
            members: (Array.isArray(r.members) ? r.members : []).map(sanitizeMember).filter(Boolean).slice(0, RAID_MAX_PARTY),
        };
    }
    return {
        id: cleanId(src.id) || leaderId,
        leaderId,
        leaderName: cleanText(src.leaderName, 12) || leaderId,
        stage: int(src.stage, 1, RAID_STAGE_COUNT),
        status: src.status === 'fight' ? 'fight' : 'open',
        members,
        createdAt: int(src.createdAt),
        updatedAt: int(src.updatedAt),
        run,
    };
}

export function isRaidPartyStale(party, now = Date.now()) {
    return !party || int(now) - Math.max(party.updatedAt, party.createdAt) > RAID_PARTY_TTL_MS;
}

const bad = (error, party = null) => ({ ok: false, error, party });

/** 탐험 방 만들기(방장이 첫 팀원) */
export function createRaidParty({ member, stage, unlocked = 1, now = 0 } = {}) {
    const m = sanitizeMember(member);
    if (!m) return bad('no_pet');
    const st = int(stage, 1, RAID_STAGE_COUNT);
    if (st > int(unlocked, 1, RAID_STAGE_COUNT)) return bad('locked_stage');
    return { ok: true, error: '', party: { id: m.id, leaderId: m.id, leaderName: m.name, stage: st, status: 'open', members: [m], createdAt: int(now), updatedAt: int(now), run: null } };
}

export function joinRaidParty(partyRaw, { member, max = RAID_MAX_PARTY, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    const m = sanitizeMember(member);
    if (!party) return bad('no_party');
    if (!m) return bad('no_pet', party);
    if (party.status !== 'open') return bad('fighting', party);
    if (isRaidPartyStale(party, now)) return bad('stale', party);
    // 이미 있으면 펫 정보만 새로 바꿔요(자리는 그대로). 새로 오거나 펫을 바꾸면 다시 준비해야 해요.
    delete m.ready;
    const at = party.members.findIndex((x) => x.id === m.id);
    if (at < 0 && party.members.length >= Math.min(RAID_MAX_PARTY, int(max, RAID_MIN_PARTY))) return bad('full', party);
    const members = at >= 0 ? party.members.map((x, i) => (i === at ? m : x)) : party.members.concat(m);
    return { ok: true, error: '', party: { ...party, members, updatedAt: int(now) } };
}

/** 나가기. 방장이 나가면 방이 사라져요(party: null). */
export function leaveRaidParty(partyRaw, { id, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    const me = cleanId(id);
    if (!party) return bad('no_party');
    if (party.leaderId === me) return { ok: true, error: '', party: null };
    return { ok: true, error: '', party: { ...party, members: party.members.filter((x) => x.id !== me), updatedAt: int(now) } };
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
    return { ok: true, error: '', party: { ...party, stage: st, members, updatedAt: int(now) } };
}

/** 모두 준비했는지 */
export function isRaidAllReady(party) {
    return !!party && party.members.length > 0 && party.members.every((m) => m.ready === true);
}

/** 준비 / 준비 취소 */
export function readyRaidParty(partyRaw, { id, ready = true, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (party.status !== 'open') return bad('fighting', party);
    const me = cleanId(id);
    if (!party.members.some((m) => m.id === me)) return bad('not_member', party);
    const members = party.members.map((m) => { if (m.id !== me) return m; const x = { ...m }; if (ready) x.ready = true; else delete x.ready; return x; });
    const next = { ...party, members, updatedAt: int(now) };
    return { ok: true, error: '', party: next, allReady: isRaidAllReady(next) };
}

/** 출발: 팀원 모두가 '준비'를 누르면 시작해요(마지막으로 준비한 사람의 화면이 출발을 걸어요). 전투를 계산해 결과까지 방에 적어요. */
export function startRaid(partyRaw, { id, settings = null, seed = 1, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (!party.members.some((m) => m.id === cleanId(id))) return bad('not_member', party);
    if (party.status !== 'open') return bad('fighting', party);
    if (!isRaidAllReady(party)) return bad('not_ready', party);
    const cfg = sanitizeRaidSettings(settings);
    if (party.members.length < cfg.minParty) return bad('need_party', party);
    const boss = { ...cfg.stages[party.stage - 1] };
    const s = int(seed) || 1;
    const sim = simulateRaid(party.members, boss, s, { teamBonus: cfg.teamBonus, guard: true });
    const run = { id: `${party.leaderId}_${int(now)}`, seed: s, rules: RAID_RULES, stage: party.stage, boss, teamBonus: cfg.teamBonus, win: sim.win, startedAt: int(now), members: party.members.map((m) => { const x = { ...m }; delete x.ready; return x; }) };
    return { ok: true, error: '', party: { ...party, status: 'fight', run, updatedAt: int(now) }, sim };
}

/** 전투가 끝난 뒤 방장이 같은 팀으로 다시 모아요(마지막 전투 기록은 남겨서 늦게 온 친구도 보상을 받아요). */
export function reopenRaidParty(partyRaw, { id, now = 0 } = {}) {
    const party = sanitizeRaidParty(partyRaw);
    if (!party) return bad('no_party');
    if (party.leaderId !== cleanId(id)) return bad('leader_only', party);
    // 다시 모으면 준비도 처음부터
    return { ok: true, error: '', party: { ...party, status: 'open', members: party.members.map((m) => { const x = { ...m }; delete x.ready; return x; }), updatedAt: int(now) } };
}

/** 방에 적힌 전투를 다시 돌려요(모든 기기에서 같은 결과). */
export function replayRaidRun(run) {
    if (!run) return null;
    return simulateRaid(run.members, run.boss, run.seed, { teamBonus: run.teamBonus, guard: int(run.rules) >= 2 });
}

/* ---------- 보상 ---------- */

/**
 * 전투 하나의 보상을 계산해요(한 전투에 한 번만).
 * - 이기면: 그 스테이지를 처음 깼을 때 첫 보상, 아니면 반복 보상(하루 dailyRewards 번까지)
 * - 지면 봉은 없어요. 펫 경험치는 이기면 스테이지×4, 져도 스테이지×1 — 단, 하루 보상 횟수를 다 쓴 뒤에는 0이에요.
 * @returns {{ ok, error, bong, exp, first, limited, progress }}
 */
export function claimRaidReward(progressRaw, run, { id, today = '', settings = null } = {}) {
    const progress = sanitizeRaidProgress(progressRaw);
    const me = cleanId(id);
    if (!run || !run.id) return { ok: false, error: 'no_run', bong: 0, exp: 0, first: false, limited: false, progress };
    if (!run.members.some((m) => m.id === me)) return { ok: false, error: 'not_member', bong: 0, exp: 0, first: false, limited: false, progress };
    if (progress.claimed.includes(run.id)) return { ok: false, error: 'claimed', bong: 0, exp: 0, first: false, limited: false, progress };
    const cfg = sanitizeRaidSettings(settings);
    const day = String(today || '');
    const dayRewards = progress.day === day ? progress.dayRewards : 0;
    const next = { ...progress, day, dayRewards, claimed: progress.claimed.concat(run.id).slice(-30) };
    // 하루 보상 횟수를 다 쓰면 봉도 경험치도 더 주지 않아요(도전은 계속 할 수 있어요).
    const used = dayRewards >= cfg.dailyRewards;
    if (!run.win) return { ok: true, error: '', bong: 0, exp: used ? 0 : run.stage, first: false, limited: used, progress: next };
    const first = !progress.firsts.includes(run.stage);
    let bong = 0;
    let limited = false;
    if (first) {
        bong = run.boss.first;
        next.firsts = progress.firsts.concat(run.stage).sort((a, b) => a - b);
    } else if (dayRewards < cfg.dailyRewards) {
        bong = run.boss.repeat;
        next.dayRewards = dayRewards + 1;
    } else {
        limited = true;
    }
    return { ok: true, error: '', bong, exp: limited ? 0 : run.stage * 4, first, limited, progress: next };
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
});

export function raidErrorText(code) {
    return RAID_ERROR_TEXT[code] || '할 수 없어요.';
}
