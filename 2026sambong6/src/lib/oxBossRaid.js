/**
 * OX 주말 보스레이드 규칙(화면·Firestore 없이 계산만).
 *
 * - 최대 5명이 한 팀이 되어 차례대로(릴레이) OX 문제를 풀어요.
 * - 맞히면 보스에게 데미지. 빨리 맞힐수록 세고, 무기가 좋을수록 보너스가 붙어요.
 * - 틀리거나 시간이 끝나면 보스가 팀원 가운데 아무나 한 명을 때려요. 방패는 데미지를 깎고, 신발은 피하게 해 줘요.
 * - 한 명이라도 체력이 0이 되면 게임 오버예요.
 * - 재미 규칙: 연속 정답 콤보(데미지 +10%씩), 합동 필살기 게이지(가득 차면 다음 정답 3배),
 *   콤보 5번마다 가장 아픈 친구 회복, 보스 체력 30% 아래에서 분노(공격 1.5배).
 *
 * 방 하나가 문서 하나예요(oxBossRaids/{방장 학번}). 답을 낼 때마다 이 파일의 함수로 다음 상태를 만들어 저장해요.
 */

export const OXB_MAX_PARTY = 5;
export const OXB_PLAYER_HP = 100;
export const OXB_DECK_SIZE = 60;
export const OXB_MAX_TURNS = 80;
export const OXB_ROOM_TTL_MS = 30 * 60 * 1000;
export const OXB_BASE_DAMAGE = 20;
export const OXB_WEAPON_UNIT = 4;
export const OXB_COMBO_STEP = 0.1;
export const OXB_COMBO_MAX = 10;
export const OXB_LIMIT_MULT = 3;
export const OXB_HEAL_EVERY = 5;
export const OXB_HEAL_AMOUNT = 20;
export const OXB_RAGE_AT = 0.3;
export const OXB_RAGE_MULT = 1.5;

export const OXB_DEFAULT_BOSSES = Object.freeze([
    Object.freeze({ name: '개구리 대왕', icon: '🐸', hpPer: 150, atk: 20, bong: 2 }),
    Object.freeze({ name: '박쥐 백작', icon: '🦇', hpPer: 210, atk: 26, bong: 3 }),
    Object.freeze({ name: '바위 골렘', icon: '🗿', hpPer: 280, atk: 32, bong: 4 }),
    Object.freeze({ name: '화염 드래곤', icon: '🐉', hpPer: 360, atk: 38, bong: 5 }),
    Object.freeze({ name: '퀴즈 마왕', icon: '👹', hpPer: 450, atk: 45, bong: 6 }),
]);

export const OXB_DEFAULT_SETTINGS = Object.freeze({
    weekendOnly: true, // 토·일에만 열어요
    minParty: 2, // 출발할 수 있는 가장 적은 인원
    turnSec: 12, // 한 문제 제한 시간
    dailyRewards: 1, // 하루에 보상을 받는 승리 횟수(도전은 무제한)
});

function int(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}
function frac(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}
function text(v, max) {
    return String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function cleanId(v) {
    return String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
}
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** 씨앗으로 만드는 난수(같은 씨앗이면 같은 결과) */
export function oxbRng(seed) {
    let a = (int(seed) || 1) >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function sanitizeOxbSettings(raw) {
    const src = obj(raw);
    const d = OXB_DEFAULT_SETTINGS;
    const list = Array.isArray(src.bosses) ? src.bosses : [];
    const bosses = OXB_DEFAULT_BOSSES.map((b, i) => {
        const x = obj(list[i]);
        return {
            name: text(x.name, 14) || b.name,
            icon: text(x.icon, 8) || b.icon,
            hpPer: x.hpPer == null || x.hpPer === '' ? b.hpPer : int(x.hpPer, 20, 5000),
            atk: x.atk == null || x.atk === '' ? b.atk : int(x.atk, 1, 200),
            bong: x.bong == null || x.bong === '' ? b.bong : int(x.bong, 0, 100),
        };
    });
    return {
        weekendOnly: src.weekendOnly == null ? d.weekendOnly : src.weekendOnly !== false && src.weekendOnly !== 'false',
        minParty: src.minParty == null || src.minParty === '' ? d.minParty : int(src.minParty, 1, OXB_MAX_PARTY),
        turnSec: src.turnSec == null || src.turnSec === '' ? d.turnSec : int(src.turnSec, 5, 60),
        dailyRewards: src.dailyRewards == null || src.dailyRewards === '' ? d.dailyRewards : int(src.dailyRewards, 0, 20),
        bosses,
    };
}

/** 'YYYY-MM-DD'(우리나라 날짜)가 토·일인지 */
export function isWeekendYmd(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return false;
    const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
    return day === 0 || day === 6;
}

export function isOxbOpen(ymd, settings) {
    return !sanitizeOxbSettings(settings).weekendOnly || isWeekendYmd(ymd);
}

/**
 * 장비로 전투 능력치를 만들어요. gear: { weapon, shield, shoes } (강화가 반영된 장비 또는 null)
 * - 무기: 보너스 데미지 (dmgMin~dmgMax)×4, 크리티컬 확률 = 발동률
 * - 방패: 받는 데미지를 방어율×2.5 만큼 깎아요(최대 50%)
 * - 신발: 회피 확률 = 보너스×8 (최대 35%), 크리티컬 확률도 조금 올려요
 */
export function oxbMember({ id, name, gear = null } = {}) {
    const mid = cleanId(id);
    if (!mid) return null;
    const g = obj(gear);
    const w = obj(g.weapon);
    const s = obj(g.shield);
    const f = obj(g.shoes);
    const wMin = int(w.dmgMin, 0, 20);
    return {
        id: mid,
        name: text(name, 12) || mid,
        wMin,
        wMax: Math.max(wMin, int(w.dmgMax, 0, 20)),
        crit: Math.round(frac((Number(w.proc) || 0) + (Number(f.procBonus) || 0), 0, 0.5) * 1000) / 1000,
        guard: Math.round(frac((Number(s.block) || 0) * 2.5, 0, 0.5) * 1000) / 1000,
        evade: Math.round(frac((Number(f.procBonus) || 0) * 8, 0, 0.35) * 1000) / 1000,
        wIcon: text(w.emoji, 4),
        sIcon: text(s.emoji, 4),
        fIcon: text(f.emoji, 4),
    };
}

function sanitizeMember(raw) {
    const m = obj(raw);
    const id = cleanId(m.id);
    if (!id) return null;
    const wMin = int(m.wMin, 0, 20);
    const out = {
        id,
        name: text(m.name, 12) || id,
        wMin,
        wMax: Math.max(wMin, int(m.wMax, 0, 20)),
        crit: frac(m.crit, 0, 0.5),
        guard: frac(m.guard, 0, 0.5),
        evade: frac(m.evade, 0, 0.35),
        wIcon: text(m.wIcon, 4),
        sIcon: text(m.sIcon, 4),
        fIcon: text(m.fIcon, 4),
    };
    if (m.hp != null) out.hp = int(m.hp, 0, OXB_PLAYER_HP);
    return out;
}

function sanitizeFight(raw) {
    const f = obj(raw);
    if (!f.id) return null;
    const b = obj(f.boss);
    const maxHp = int(b.maxHp, 1);
    const members = (Array.isArray(f.members) ? f.members : []).map(sanitizeMember).filter(Boolean).slice(0, OXB_MAX_PARTY)
        .map((m) => ({ ...m, hp: m.hp == null ? OXB_PLAYER_HP : m.hp }));
    const deck = (Array.isArray(f.deck) ? f.deck : []).slice(0, OXB_DECK_SIZE)
        .map((q) => ({ p: text(obj(q).p, 240), a: obj(q).a === 'X' ? 'X' : 'O', e: text(obj(q).e, 120) }))
        .filter((q) => q.p);
    if (!members.length || !deck.length) return null;
    const l = f.last ? obj(f.last) : null;
    const stats = {};
    members.forEach((m) => {
        const s = obj(obj(f.stats)[m.id]);
        stats[m.id] = { ok: int(s.ok), no: int(s.no), dmg: int(s.dmg) };
    });
    return {
        id: String(f.id).slice(0, 60),
        seed: int(f.seed),
        bossIdx: int(f.bossIdx, 0, OXB_DEFAULT_BOSSES.length - 1),
        boss: { name: text(b.name, 14), icon: text(b.icon, 8), hp: int(b.hp, 0, maxHp), maxHp, atk: int(b.atk, 1, 200), bong: int(b.bong, 0, 100) },
        members,
        deck,
        turn: int(f.turn, 0, OXB_MAX_TURNS),
        turnSec: int(f.turnSec, 5, 60),
        combo: int(f.combo, 0, 999),
        gauge: int(f.gauge, 0, 100),
        rage: f.rage === true,
        result: f.result === 'win' || f.result === 'lose' ? f.result : '',
        startedAt: int(f.startedAt),
        stats,
        last: l ? {
            turn: int(l.turn), by: cleanId(l.by), pick: l.pick === 'O' || l.pick === 'X' ? l.pick : '', answer: l.answer === 'X' ? 'X' : 'O', explain: text(l.explain, 120),
            ok: l.ok === true, timeout: l.timeout === true, dmg: int(l.dmg), crit: l.crit === true, limit: l.limit === true, speed: frac(l.speed, 1, 2), combo: int(l.combo),
            healId: cleanId(l.healId), heal: int(l.heal), rageStart: l.rageStart === true,
            target: cleanId(l.target) || cleanId(l.by), bossDmg: int(l.bossDmg), evade: l.evade === true, guarded: int(l.guarded), down: l.down === true, timeUp: l.timeUp === true,
        } : null,
    };
}

export function sanitizeOxbRoom(raw) {
    const src = obj(raw);
    const leaderId = cleanId(src.leaderId);
    if (!leaderId) return null;
    const members = [];
    (Array.isArray(src.members) ? src.members : []).forEach((m) => {
        const x = sanitizeMember(m);
        if (x && !members.some((y) => y.id === x.id) && members.length < OXB_MAX_PARTY) { delete x.hp; members.push(x); }
    });
    return {
        id: cleanId(src.id) || leaderId,
        leaderId,
        leaderName: text(src.leaderName, 12) || leaderId,
        bossIdx: int(src.bossIdx, 0, OXB_DEFAULT_BOSSES.length - 1),
        status: src.status === 'fight' ? 'fight' : 'open',
        members,
        createdAt: int(src.createdAt),
        updatedAt: int(src.updatedAt),
        fight: sanitizeFight(src.fight),
    };
}

export function isOxbRoomStale(room, now = Date.now()) {
    return !room || int(now) - Math.max(room.updatedAt, room.createdAt) > OXB_ROOM_TTL_MS;
}

const fail = (error) => ({ ok: false, error });

export function createOxbRoom({ member, bossIdx = 0, now = 0 } = {}) {
    const m = sanitizeMember(member);
    if (!m) return fail('no_member');
    delete m.hp;
    return { ok: true, room: { id: m.id, leaderId: m.id, leaderName: m.name, bossIdx: int(bossIdx, 0, OXB_DEFAULT_BOSSES.length - 1), status: 'open', members: [m], createdAt: int(now), updatedAt: int(now), fight: null } };
}

export function joinOxbRoom(raw, { member, now = 0 } = {}) {
    const room = sanitizeOxbRoom(raw);
    const m = sanitizeMember(member);
    if (!room || isOxbRoomStale(room, now) || !room.members.length) return fail('no_room');
    if (!m) return fail('no_member');
    if (room.status !== 'open') return fail('started');
    delete m.hp;
    const at = room.members.findIndex((x) => x.id === m.id);
    if (at >= 0) room.members[at] = m; // 다시 들어오면 장비만 새로 고쳐요
    else if (room.members.length >= OXB_MAX_PARTY) return fail('full');
    else room.members.push(m);
    room.updatedAt = int(now);
    return { ok: true, room };
}

/** 방장이 나가면 방이 없어져요(room: null). 전투 중에는 나갈 수 없어요(방장이 그만둘 수 있어요). */
export function leaveOxbRoom(raw, { id, now = 0 } = {}) {
    const room = sanitizeOxbRoom(raw);
    if (!room) return { ok: true, room: null };
    const me = cleanId(id);
    if (room.status === 'fight' && room.fight && !room.fight.result && me !== room.leaderId) return fail('fighting');
    if (me === room.leaderId) return { ok: true, room: null };
    room.members = room.members.filter((m) => m.id !== me);
    room.updatedAt = int(now);
    return { ok: true, room };
}

export function setOxbBoss(raw, { id, bossIdx, now = 0 } = {}) {
    const room = sanitizeOxbRoom(raw);
    if (!room) return fail('no_room');
    if (cleanId(id) !== room.leaderId) return fail('not_leader');
    if (room.status !== 'open') return fail('started');
    room.bossIdx = int(bossIdx, 0, OXB_DEFAULT_BOSSES.length - 1);
    room.updatedAt = int(now);
    return { ok: true, room };
}

/** 문제 은행에서 이번 전투에 쓸 문제 묶음을 섞어 뽑아요. */
export function buildOxbDeck(questions, rnd = Math.random) {
    const pool = (Array.isArray(questions) ? questions : [])
        .map((q) => ({ p: text(obj(q).prompt, 240), a: String(obj(q).answer).toUpperCase() === 'X' ? 'X' : String(obj(q).answer).toUpperCase() === 'O' ? 'O' : '', e: text(obj(q).explain, 120) }))
        .filter((q) => q.p && q.a);
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, OXB_DECK_SIZE);
}

export function startOxbFight(raw, { id, settings = null, deck = [], seed = 1, now = 0 } = {}) {
    const room = sanitizeOxbRoom(raw);
    if (!room) return fail('no_room');
    if (cleanId(id) !== room.leaderId) return fail('not_leader');
    if (room.status === 'fight' && room.fight && !room.fight.result) return fail('started');
    const cfg = sanitizeOxbSettings(settings);
    if (room.members.length < cfg.minParty) return fail('too_few');
    if (!Array.isArray(deck) || deck.length < 5) return fail('no_questions');
    const b = cfg.bosses[room.bossIdx];
    const maxHp = b.hpPer * room.members.length;
    const stats = {};
    room.members.forEach((m) => { stats[m.id] = { ok: 0, no: 0, dmg: 0 }; });
    room.status = 'fight';
    room.updatedAt = int(now);
    room.fight = sanitizeFight({
        id: `${room.leaderId}_${int(now)}`,
        seed: int(seed) || 1,
        bossIdx: room.bossIdx,
        boss: { name: b.name, icon: b.icon, hp: maxHp, maxHp, atk: b.atk, bong: b.bong },
        members: room.members.map((m) => ({ ...m, hp: OXB_PLAYER_HP })),
        deck,
        turn: 0,
        turnSec: cfg.turnSec,
        combo: 0,
        gauge: 0,
        rage: false,
        result: '',
        startedAt: int(now),
        stats,
        last: null,
    });
    return { ok: true, room };
}

/** 지금 답할 차례인 사람과 문제 */
export function oxbTurnInfo(fight) {
    if (!fight || !fight.members.length) return null;
    const member = fight.members[fight.turn % fight.members.length];
    const q = fight.deck[fight.turn % fight.deck.length];
    return { member, question: q };
}

/** 빨리 맞힐수록 1배 → 2배 */
export function oxbSpeedMult(ms, turnSec) {
    const left = 1 - frac(Number(ms) / (Math.max(1, turnSec) * 1000), 0, 1);
    return Math.round((1 + left) * 100) / 100;
}

/**
 * 한 차례를 처리해요.
 * by: 답을 보낸 사람, turn: 그 사람이 본 차례 번호(어긋나면 무시), pick: 'O'|'X'|''(시간 초과), ms: 걸린 시간
 * 차례가 아닌 팀원이 보내면(차례인 친구가 자리에 없을 때) 시간 초과로 처리해요.
 */
export function answerOxbTurn(raw, { by, turn, pick = '', ms = 0, now = 0 } = {}) {
    const room = sanitizeOxbRoom(raw);
    if (!room || !room.fight || room.status !== 'fight') return fail('no_fight');
    const f = room.fight;
    if (f.result) return fail('finished');
    if (int(turn) !== f.turn) return fail('stale_turn');
    const who = cleanId(by);
    if (!f.members.some((m) => m.id === who)) return fail('not_member');
    const { member: m, question: q } = oxbTurnInfo(f);
    const rnd = oxbRng(f.seed + f.turn * 7919 + 13);
    const answered = who === m.id && (pick === 'O' || pick === 'X');
    const ok = answered && pick === q.a;
    const last = {
        turn: f.turn, by: m.id, pick: answered ? pick : '', answer: q.a, explain: q.e, ok, timeout: !answered,
        dmg: 0, crit: false, limit: false, speed: 1, combo: 0, healId: '', heal: 0, rageStart: false,
        target: '', bossDmg: 0, evade: false, guarded: 0, down: false, timeUp: false,
    };
    if (ok) {
        const speed = oxbSpeedMult(ms, f.turnSec);
        const weapon = m.wMax > 0 ? (m.wMin + Math.floor(rnd() * (m.wMax - m.wMin + 1))) * OXB_WEAPON_UNIT : 0;
        const crit = rnd() < m.crit;
        const limit = f.gauge >= 100;
        const comboMult = 1 + OXB_COMBO_STEP * Math.min(f.combo, OXB_COMBO_MAX);
        const dmg = Math.max(1, Math.round((OXB_BASE_DAMAGE * speed + weapon) * comboMult * (crit ? 2 : 1) * (limit ? OXB_LIMIT_MULT : 1)));
        f.combo += 1;
        f.gauge = limit ? 0 : Math.min(100, f.gauge + (speed >= 1.6 ? 25 : 15));
        f.boss.hp = Math.max(0, f.boss.hp - dmg);
        f.stats[m.id].ok += 1;
        f.stats[m.id].dmg += dmg;
        Object.assign(last, { dmg, crit, limit, speed, combo: f.combo });
        if (f.boss.hp <= 0) f.result = 'win';
        else {
            if (f.combo % OXB_HEAL_EVERY === 0) {
                const hurt = f.members.filter((x) => x.hp < OXB_PLAYER_HP).sort((a, b) => a.hp - b.hp)[0];
                if (hurt) {
                    const heal = Math.min(OXB_HEAL_AMOUNT, OXB_PLAYER_HP - hurt.hp);
                    hurt.hp += heal;
                    last.healId = hurt.id;
                    last.heal = heal;
                }
            }
            if (!f.rage && f.boss.hp <= f.boss.maxHp * OXB_RAGE_AT) { f.rage = true; last.rageStart = true; }
        }
    } else {
        f.combo = 0;
        f.stats[m.id].no += 1;
        // 보스는 팀원 가운데 아무나 한 명을 때려요(틀린 사람이 아닐 수도 있어요). 방패·신발은 맞는 사람 것을 써요.
        const t = f.members[Math.floor(rnd() * f.members.length)] || m;
        const evade = rnd() < t.evade;
        const rawDmg = Math.max(1, Math.round(f.boss.atk * (f.rage ? OXB_RAGE_MULT : 1) * (0.9 + rnd() * 0.2)));
        const guarded = evade ? 0 : Math.round(rawDmg * t.guard);
        const bossDmg = evade ? 0 : rawDmg - guarded;
        t.hp = Math.max(0, t.hp - bossDmg);
        Object.assign(last, { target: t.id, evade, guarded, bossDmg, down: t.hp <= 0 });
        if (t.hp <= 0) f.result = 'lose';
    }
    f.turn += 1;
    if (!f.result && f.turn >= OXB_MAX_TURNS) { f.result = 'lose'; last.timeUp = true; }
    f.last = last;
    room.updatedAt = int(now);
    return { ok: true, room, last };
}

/** 방장이 전투를 그만두거나, 끝난 뒤 같은 팀으로 다시 모아요. 마지막 전투 기록은 남겨요(보상용). */
export function reopenOxbRoom(raw, { id, now = 0 } = {}) {
    const room = sanitizeOxbRoom(raw);
    if (!room) return fail('no_room');
    if (cleanId(id) !== room.leaderId) return fail('not_leader');
    if (room.fight && !room.fight.result) room.fight = null; // 하다 만 전투는 버려요
    room.status = 'open';
    room.updatedAt = int(now);
    return { ok: true, room };
}

/* ---------- 내 기록·보상 ---------- */

export function sanitizeOxbProgress(raw) {
    const src = obj(raw);
    return {
        day: /^\d{4}-\d{2}-\d{2}$/.test(String(src.day || '')) ? String(src.day) : '',
        dayRewards: int(src.dayRewards, 0, 99),
        wins: int(src.wins, 0, 99999),
        claimed: (Array.isArray(src.claimed) ? src.claimed : []).map((x) => String(x).slice(0, 60)).filter(Boolean).slice(-10),
    };
}

/** 이긴 전투의 보상. 같은 전투는 한 번만, 봉은 하루 dailyRewards 번까지만 받아요. */
export function claimOxbReward(progressRaw, fight, { id, today = '', settings = null } = {}) {
    const p = sanitizeOxbProgress(progressRaw);
    const f = sanitizeFight(fight);
    if (!f || !f.result) return fail('no_fight');
    if (!f.members.some((m) => m.id === cleanId(id))) return fail('not_member');
    if (p.claimed.includes(f.id)) return fail('claimed');
    const cfg = sanitizeOxbSettings(settings);
    if (p.day !== today) { p.day = today; p.dayRewards = 0; }
    let bong = 0;
    let limited = false;
    if (f.result === 'win') {
        p.wins += 1;
        if (p.dayRewards < cfg.dailyRewards) { bong = f.boss.bong; p.dayRewards += 1; } else limited = true;
    }
    p.claimed = p.claimed.concat(f.id).slice(-10);
    return { ok: true, bong, limited, win: f.result === 'win', progress: p };
}

export const OXB_ERROR_TEXT = Object.freeze({
    no_member: '로그인해야 함께할 수 있어요.',
    no_room: '방이 없어졌어요.',
    started: '이미 전투가 시작됐어요.',
    full: `한 팀은 ${OXB_MAX_PARTY}명까지예요.`,
    not_leader: '방장만 할 수 있어요.',
    too_few: '사람이 모자라요. 친구를 더 불러요.',
    no_questions: 'OX 문제가 5개보다 적어요. 선생님이 문제를 올려 주셔야 해요.',
    fighting: '전투 중에는 나갈 수 없어요.',
    no_fight: '전투가 없어요.',
    finished: '전투가 끝났어요.',
    stale_turn: '',
    not_member: '이 팀이 아니에요.',
    claimed: '보상은 이미 받았어요.',
});

export function oxbErrorText(code) {
    return OXB_ERROR_TEXT[code] ?? '잠시 뒤 다시 해 봐요.';
}
