/**
 * 퀘스트 장비 — 무기·방패·신발과 스킨 미세 능력치.
 * 경험치 인플레이션을 막기 위해 수치를 작게 둡니다.
 */

export const WEAPON_GEAR = [
    { id: 'wp1', slot: 'weapon', name: '나뭇가지', emoji: '🌿', img: 'chars/wp1.webp', dmgMin: 1, dmgMax: 2, proc: 0.10, raidBonus: 1, desc: '데미지 1~2 · 발동 10%' },
    { id: 'wp2', slot: 'weapon', name: '낡은 단검', emoji: '🗡️', img: 'chars/wp2.webp', dmgMin: 2, dmgMax: 3, proc: 0.12, raidBonus: 2, desc: '데미지 2~3 · 발동 12%' },
    { id: 'wp3', slot: 'weapon', name: '기사의 검', emoji: '⚔️', img: 'chars/wp3.webp', dmgMin: 3, dmgMax: 4, proc: 0.14, raidBonus: 3, desc: '데미지 3~4 · 발동 14%' },
    { id: 'wp4', slot: 'weapon', name: '마법 지팡이', emoji: '🪄', img: 'chars/wp4.webp', dmgMin: 4, dmgMax: 5, proc: 0.16, raidBonus: 4, desc: '데미지 4~5 · 발동 16%' },
    { id: 'wp5', slot: 'weapon', name: '화염의 성검', emoji: '🔥', img: 'chars/wp5.webp', dmgMin: 5, dmgMax: 6, proc: 0.18, raidBonus: 5, desc: '데미지 5~6 · 발동 18%' },
];

export const SHIELD_GEAR = [
    { id: 'sh1', slot: 'shield', name: '나무 방패', emoji: '🪵', img: 'chars/sh1.webp', block: 0.08, desc: '경험치 차감 방어 8%' },
    { id: 'sh2', slot: 'shield', name: '가죽 방패', emoji: '🟤', img: 'chars/sh2.webp', block: 0.12, desc: '경험치 차감 방어 12%' },
    { id: 'sh3', slot: 'shield', name: '철 방패', emoji: '🛡️', img: 'chars/sh3.webp', block: 0.16, desc: '경험치 차감 방어 16%' },
    { id: 'sh4', slot: 'shield', name: '기사 방패', emoji: '🏰', img: 'chars/sh4.webp', block: 0.20, desc: '경험치 차감 방어 20%' },
    { id: 'sh5', slot: 'shield', name: '용린 방패', emoji: '🐉', img: 'chars/sh5.webp', block: 0.20, desc: '경험치 차감 방어 20%' },
];

/** 광장·학급온도계 경험치 차감에서 드롭 방패가 막을 확률 상한 */
export const SHIELD_BLOCK_CAP = 0.20;
export const GEAR_ENHANCE_MIN = 1;
export const GEAR_ENHANCE_MAX = 5;
/**
 * 현재 단계에서 다음 단계로 올릴 때 성공률.
 * 1→2 100%, 2→3 50%, 3→4 30%, 4→5 15%. 5단계는 최대라 시도하지 않으며 목록의 10%는 5단계 표시용입니다.
 */
export const GEAR_ENHANCE_SUCCESS_FROM = Object.freeze({
    1: 1.00,
    2: 0.50,
    3: 0.30,
    4: 0.15,
    5: 0.10,
});

/** 강화 성공률 안내 문구 (1→2부터 5단계 최대까지) */
export const GEAR_ENHANCE_RATE_LABEL = '100% · 50% · 30% · 15% · 10%';

export const SHOE_GEAR = [
    { id: 'shoe1', slot: 'shoes', name: '짚신', emoji: '🌾', img: 'chars/shoe1.webp', procBonus: 0.010, desc: '무기·방패 발동 +1%p' },
    { id: 'shoe2', slot: 'shoes', name: '가죽 장화', emoji: '🥾', img: 'chars/shoe2.webp', procBonus: 0.015, desc: '무기·방패 발동 +1.5%p' },
    { id: 'shoe3', slot: 'shoes', name: '여행 신발', emoji: '👟', img: 'chars/shoe3.webp', procBonus: 0.020, desc: '무기·방패 발동 +2%p' },
    { id: 'shoe4', slot: 'shoes', name: '바람 장화', emoji: '🎐', img: 'chars/shoe4.webp', procBonus: 0.025, desc: '무기·방패 발동 +2.5%p' },
    { id: 'shoe5', slot: 'shoes', name: '헤르메스 신발', emoji: '🪽', img: 'chars/shoe5.webp', procBonus: 0.030, desc: '무기·방패 발동 +3%p' },
];

export const ALL_GEAR = [...WEAPON_GEAR, ...SHIELD_GEAR, ...SHOE_GEAR];
export const MASTER_GEAR_IDS = ALL_GEAR.map((g) => g.id);
/** 마스터가 강화 연습을 할 수 있도록 종류마다 채워 주는 갯수 */
export const MASTER_GEAR_COPIES = 10;

/** 스킨·오라 미세 보너스. 값은 확률 가산(0.002 = 0.2%p). */
export const SKIN_GEAR_STATS = {
    f_ninja: { weaponProc: 0.003, shieldBlock: 0, label: '무기 발동 +0.3%p' },
    f_fairy: { weaponProc: 0, shieldBlock: 0.003, label: '방패 방어 +0.3%p' },
    f_astroM: { weaponProc: 0.002, shieldBlock: 0.001, label: '발동 +0.2%p · 방어 +0.1%p' },
    f_vamp: { weaponProc: 0.003, shieldBlock: 0.001, label: '발동 +0.3%p · 방어 +0.1%p' },
    f_mer: { weaponProc: 0.001, shieldBlock: 0.003, label: '발동 +0.1%p · 방어 +0.3%p' },
    f_king: { weaponProc: 0.004, shieldBlock: 0.002, label: '발동 +0.4%p · 방어 +0.2%p' },
    f_queen: { weaponProc: 0.002, shieldBlock: 0.004, label: '발동 +0.2%p · 방어 +0.4%p' },
    f_knight: { weaponProc: 0.001, shieldBlock: 0.004, label: '방패 방어 +0.4%p' },
    f_mage: { weaponProc: 0.004, shieldBlock: 0.001, label: '무기 발동 +0.4%p' },
    f_archer: { weaponProc: 0.003, shieldBlock: 0, label: '무기 발동 +0.3%p' },
    f_pirate: { weaponProc: 0.003, shieldBlock: 0.001, label: '발동 +0.3%p' },
    f_dokkaebi: { weaponProc: 0.002, shieldBlock: 0.002, label: '발동·방어 +0.2%p' },
    f_robot: { weaponProc: 0.002, shieldBlock: 0.002, label: '발동·방어 +0.2%p' },
    f_chef: { weaponProc: 0.001, shieldBlock: 0.002, label: '방어 +0.2%p' },
    f_wolf: { weaponProc: 0.003, shieldBlock: 0.001, label: '발동 +0.3%p' },
    f_phoenix: { weaponProc: 0.004, shieldBlock: 0.002, label: '발동 +0.4%p · 방어 +0.2%p' },
    f_scholar: { weaponProc: 0.002, shieldBlock: 0.002, label: '발동·방어 +0.2%p' },
    f_staff_dragon: { weaponProc: 0.005, shieldBlock: 0.003, label: '발동 +0.5%p · 방어 +0.3%p' },
    f_staff_tiger: { weaponProc: 0.005, shieldBlock: 0.003, label: '발동 +0.5%p · 방어 +0.3%p' },
    f_staff_hyunmu: { weaponProc: 0.003, shieldBlock: 0.005, label: '발동 +0.3%p · 방어 +0.5%p' },
    f_staff_haetae: { weaponProc: 0.004, shieldBlock: 0.004, label: '발동·방어 +0.4%p' },
    sk_red: { weaponProc: 0.002, shieldBlock: 0, label: '무기 발동 +0.2%p' },
    sk_yel: { weaponProc: 0.001, shieldBlock: 0.001, label: '발동·방어 +0.1%p' },
    sk_blu: { weaponProc: 0, shieldBlock: 0.002, label: '방패 방어 +0.2%p' },
};

export const STAFF_LOOK_STATS = {
    staff_dragon: { weaponProc: 0.005, shieldBlock: 0.003 },
    staff_tiger: { weaponProc: 0.005, shieldBlock: 0.003 },
    staff_hyunmu: { weaponProc: 0.003, shieldBlock: 0.005 },
    staff_haetae: { weaponProc: 0.004, shieldBlock: 0.004 },
    staff_zeus: { weaponProc: 0.006, shieldBlock: 0.003 },
    staff_hera: { weaponProc: 0.003, shieldBlock: 0.006 },
    staff_poseidon: { weaponProc: 0.004, shieldBlock: 0.004 },
    staff_hades: { weaponProc: 0.005, shieldBlock: 0.004 },
    staff_athena: { weaponProc: 0.004, shieldBlock: 0.005 },
    staff_apollo: { weaponProc: 0.005, shieldBlock: 0.003 },
    staff_artemis: { weaponProc: 0.005, shieldBlock: 0.003 },
    staff_ares: { weaponProc: 0.006, shieldBlock: 0.002 },
    staff_hermes: { weaponProc: 0.004, shieldBlock: 0.003 },
    staff_aphrodite: { weaponProc: 0.003, shieldBlock: 0.005 },
};

function clamp01(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(0.45, x));
}

function clampShieldChance(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(SHIELD_BLOCK_CAP, x));
}

export function clampGearEnhance(level) {
    const n = Math.floor(Number(level) || 0);
    if (!Number.isFinite(n) || n < GEAR_ENHANCE_MIN) return GEAR_ENHANCE_MIN;
    return Math.min(GEAR_ENHANCE_MAX, n);
}

export function enhanceSuccessChance(currentLevel) {
    const lv = clampGearEnhance(currentLevel);
    if (lv >= GEAR_ENHANCE_MAX) return 0;
    const rate = GEAR_ENHANCE_SUCCESS_FROM[lv];
    return Number.isFinite(rate) ? rate : 0;
}

/** 유효한 장비 id만 남깁니다. 같은 아이템은 갯수로 쌓입니다. */
export function sanitizeGearInventory(ids) {
    const out = [];
    (Array.isArray(ids) ? ids : []).forEach((id) => {
        const k = String(id || '');
        if (!k || !getGear(k)) return;
        out.push(k);
    });
    return out;
}

export function countOwnedGear(inventory, gearId) {
    const id = String(gearId || '');
    if (!id) return 0;
    return sanitizeGearInventory(inventory).filter((x) => x === id).length;
}

export function consumeOwnedGear(inventory, gearId) {
    const id = String(gearId || '');
    const next = sanitizeGearInventory(inventory);
    const idx = next.lastIndexOf(id);
    if (idx < 0) return next;
    next.splice(idx, 1);
    return next;
}

export function sanitizeGearEnhance(raw, inventory) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const owned = new Set(sanitizeGearInventory(inventory));
    const out = {};
    owned.forEach((id) => {
        out[id] = src[id] != null ? clampGearEnhance(src[id]) : GEAR_ENHANCE_MIN;
    });
    return out;
}

export function gearEnhanceOf(stu, gearId) {
    const id = String(gearId || '');
    if (!id) return GEAR_ENHANCE_MIN;
    const map = stu && stu.gearEnhance && typeof stu.gearEnhance === 'object' ? stu.gearEnhance : {};
    if (map[id] == null) return GEAR_ENHANCE_MIN;
    return clampGearEnhance(map[id]);
}

/** 강화 단계에 따른 소량 보너스. 1단계는 기본값입니다. */
export function gearWithEnhance(gear, level) {
    if (!gear) return null;
    const lv = clampGearEnhance(level);
    const steps = Math.max(0, lv - GEAR_ENHANCE_MIN);
    const copy = { ...gear, enhance: lv };
    if (gear.slot === 'weapon') {
        copy.proc = (Number(gear.proc) || 0) + steps * 0.004;
        copy.dmgMin = Number(gear.dmgMin) || 0;
        copy.dmgMax = (Number(gear.dmgMax) || 0) + (steps >= 4 ? 1 : 0);
        copy.desc = `데미지 ${copy.dmgMin}~${copy.dmgMax} · 발동 ${Math.round((copy.proc || 0) * 1000) / 10}%`;
    } else if (gear.slot === 'shield') {
        copy.block = (Number(gear.block) || 0) + steps * 0.004;
        copy.desc = `경험치 차감 방어 ${Math.round(Math.min(SHIELD_BLOCK_CAP, copy.block) * 1000) / 10}%`;
    } else if (gear.slot === 'shoes') {
        copy.procBonus = (Number(gear.procBonus) || 0) + steps * 0.002;
        copy.desc = `무기·방패 발동 +${((copy.procBonus || 0) * 100).toFixed(1)}%p`;
    }
    return copy;
}

export function attemptGearEnhance(stu, gearId, rng = Math.random) {
    const id = String(gearId || '');
    const gear = getGear(id);
    if (!gear) return { ok: false, reason: 'unknown' };
    const inventory = sanitizeGearInventory(stu && stu.inventory);
    const count = countOwnedGear(inventory, id);
    if (count < 2) return { ok: false, reason: 'need_fodder', count };
    const enhance = sanitizeGearEnhance(stu && stu.gearEnhance, inventory);
    const current = enhance[id] != null ? clampGearEnhance(enhance[id]) : GEAR_ENHANCE_MIN;
    if (current >= GEAR_ENHANCE_MAX) return { ok: false, reason: 'max', level: current, count };
    const chance = enhanceSuccessChance(current);
    const roll = typeof rng === 'function' ? rng() : Math.random();
    const nextInv = consumeOwnedGear(inventory, id);
    const nextEnhance = { ...enhance };
    const success = roll < chance;
    nextEnhance[id] = success ? current + 1 : GEAR_ENHANCE_MIN;
    if (!nextInv.includes(id)) delete nextEnhance[id];
    return {
        ok: true,
        success,
        chance,
        before: current,
        after: nextEnhance[id] != null ? nextEnhance[id] : GEAR_ENHANCE_MIN,
        inventory: nextInv,
        gearEnhance: nextEnhance,
        gear,
    };
}

function randInt(min, max, rng) {
    const a = Math.floor(Number(min) || 0);
    const b = Math.floor(Number(max) || 0);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi <= lo) return lo;
    const r = typeof rng === 'function' ? rng() : Math.random();
    return lo + Math.floor(r * (hi - lo + 1));
}

export function getGear(id) {
    return ALL_GEAR.find((g) => g.id === String(id || '')) || null;
}

export function listGearBySlot(slot) {
    return ALL_GEAR.filter((g) => g.slot === slot);
}

export function countGearOfSlot(inventory, slot) {
    return sanitizeGearInventory(inventory).filter((id) => {
        const g = getGear(id);
        return g && g.slot === slot;
    }).length;
}

/** 드롭 배율용 — 같은 아이템 여러 개는 종류 1개로 칩니다. */
export function countUniqueGearOfSlot(inventory, slot) {
    const seen = new Set();
    sanitizeGearInventory(inventory).forEach((id) => {
        const g = getGear(id);
        if (g && g.slot === slot) seen.add(id);
    });
    return seen.size;
}

/**
 * 마스터 인벤토리를 맞춥니다.
 * 없거나(또는 예전처럼 1개만 있고 아직 강화 전)이면 종류당 10개를 채워 강화를 연습할 수 있게 합니다.
 * 이미 2개 이상이면 강화로 재료를 쓴 갯수를 그대로 둡니다.
 */
export function grantMasterGear(inventory, enhanceMap) {
    const next = sanitizeGearInventory(inventory);
    const enhance = sanitizeGearEnhance(enhanceMap, next);
    MASTER_GEAR_IDS.forEach((id) => {
        const have = countOwnedGear(next, id);
        if (have >= 2) return;
        const lv = enhance[id] != null ? clampGearEnhance(enhance[id]) : GEAR_ENHANCE_MIN;
        if (have === 1 && lv > GEAR_ENHANCE_MIN) return;
        for (let i = have; i < MASTER_GEAR_COPIES; i++) next.push(id);
    });
    return next;
}

/**
 * 퀘스트 장비 드롭. 같은 아이템이 나와도 갯수만 늘리고 경험치·봉은 주지 않습니다.
 */
export function applyQuestGearDrop(inventory, gearId) {
    const id = String(gearId || '');
    const bag = sanitizeGearInventory(inventory);
    if (!getGear(id)) return { ok: false, reason: 'unknown', inventory: bag, extraXp: 0, extraBong: 0 };
    const had = countOwnedGear(bag, id);
    return {
        ok: true,
        inventory: bag.concat([id]),
        gearId: id,
        duplicate: had > 0,
        count: had + 1,
        extraXp: 0,
        extraBong: 0,
    };
}

export function skinStatLabel(skinId) {
    const row = SKIN_GEAR_STATS[String(skinId || '')];
    return row && row.label ? row.label : '';
}

/** 마스터 수호 캐릭터의 미세 발동·방어 문구 */
export function staffLookStatLabel(lookId) {
    const row = STAFF_LOOK_STATS[String(lookId || '')];
    if (!row) return '';
    const bits = [];
    if (row.weaponProc) bits.push(`발동 +${(Number(row.weaponProc) * 100).toFixed(1)}%p`);
    if (row.shieldBlock) bits.push(`방어 +${(Number(row.shieldBlock) * 100).toFixed(1)}%p`);
    return bits.join(' · ');
}

export function collectCosmeticBonuses(stu) {
    const out = { weaponProc: 0, shieldBlock: 0 };
    const equipped = (stu && stu.equippedSkins) || {};
    Object.keys(equipped).forEach((id) => {
        if (!equipped[id]) return;
        const row = SKIN_GEAR_STATS[id];
        if (!row) return;
        out.weaponProc += Number(row.weaponProc) || 0;
        out.shieldBlock += Number(row.shieldBlock) || 0;
    });
    if (stu && (stu.isAdmin || stu.homeLookMode === 'staff') && stu.staffLookId) {
        const look = STAFF_LOOK_STATS[String(stu.staffLookId)];
        if (look) {
            out.weaponProc += Number(look.weaponProc) || 0;
            out.shieldBlock += Number(look.shieldBlock) || 0;
        }
    }
    return out;
}

export function equippedGearOf(stu, slot) {
    const id = slot === 'weapon'
        ? (stu && stu.equippedWeapon)
        : slot === 'shield'
            ? (stu && stu.equippedShield)
            : (stu && stu.equippedShoes);
    const gear = getGear(id);
    if (!gear || gear.slot !== slot) return null;
    const inv = sanitizeGearInventory(stu && stu.inventory);
    if (!(stu && stu.isAdmin) && !inv.includes(gear.id)) return null;
    return gearWithEnhance(gear, gearEnhanceOf(stu, gear.id));
}

export function resolveQuestWeaponProc(stu, rng = Math.random) {
    const weapon = equippedGearOf(stu, 'weapon');
    if (!weapon) return { hit: false, extraXp: 0, chance: 0 };
    const shoes = equippedGearOf(stu, 'shoes');
    const cosm = collectCosmeticBonuses(stu);
    const chance = clamp01((Number(weapon.proc) || 0) + (shoes ? Number(shoes.procBonus) || 0 : 0) + cosm.weaponProc);
    const roll = typeof rng === 'function' ? rng() : Math.random();
    if (roll >= chance) return { hit: false, extraXp: 0, chance, weapon };
    const extraXp = randInt(weapon.dmgMin, weapon.dmgMax, rng);
    return { hit: true, extraXp, chance, weapon };
}

export function resolveShieldBlock(stu, rng = Math.random) {
    const shield = equippedGearOf(stu, 'shield');
    if (!shield) return { blocked: false, chance: 0 };
    const shoes = equippedGearOf(stu, 'shoes');
    const cosm = collectCosmeticBonuses(stu);
    const chance = clampShieldChance((Number(shield.block) || 0) + (shoes ? Number(shoes.procBonus) || 0 : 0) + cosm.shieldBlock);
    const roll = typeof rng === 'function' ? rng() : Math.random();
    return { blocked: roll < chance, chance, shield };
}

/**
 * 경험치 차감: 드롭 방패가 막으면 내구 방패는 쓰지 않습니다.
 * 막지 못하면 기존 절대 방패(내구)가 이어 받습니다.
 */
export function applyXpDeductWithGear(stu, deductAmt, applyDurability, rng = Math.random) {
    const amount = Math.max(0, Math.abs(Math.floor(Number(deductAmt) || 0)));
    const gear = resolveShieldBlock(stu, rng);
    if (gear.blocked) {
        return { updates: {}, remainingDeduct: 0, absorbed: amount, blockedByGear: true, chance: gear.chance };
    }
    const durable = typeof applyDurability === 'function'
        ? applyDurability(stu, amount)
        : { updates: {}, remainingDeduct: amount, absorbed: 0 };
    return { ...durable, blockedByGear: false, chance: gear.chance };
}

/**
 * 차감 결과에 실제 XP를 붙입니다. 방패가 다 막으면 xp 필드는 넣지 않습니다.
 */
export function attachXpDeductResult(stu, deductResult) {
    const beforeXp = Math.max(0, Math.floor(Number(stu && stu.xp) || 0));
    const remaining = Math.max(0, Math.floor(Number(deductResult && deductResult.remainingDeduct) || 0));
    const xp = Math.max(0, beforeXp - remaining);
    const updates = { ...((deductResult && deductResult.updates) || {}) };
    if (xp !== beforeXp) updates.xp = xp;
    return {
        ...(deductResult || {}),
        beforeXp,
        xp,
        remainingDeduct: remaining,
        updates,
    };
}

/** 장착 방패(확률) → 절대 방패(내구) → 남은 XP 차감까지 한 번에 계산합니다. */
export function applyFullXpDeduct(stu, deductAmt, applyDurability, rng = Math.random) {
    return attachXpDeductResult(stu, applyXpDeductWithGear(stu, deductAmt, applyDurability, rng));
}

export function pickQuestDropId(xp, inventory, rng = Math.random) {
    const n = Math.floor(Number(xp) || 0);
    const pool = n >= 80
        ? ['wp5', 'sh5', 'shoe5', 'wp4', 'sh4', 'shoe4']
        : n >= 30
            ? ['wp3', 'sh3', 'shoe3', 'wp2', 'sh2', 'shoe2']
            : n >= 16
                ? ['wp2', 'sh2', 'shoe2', 'wp1', 'sh1', 'shoe1']
                : ['wp1', 'sh1', 'shoe1'];
    const owned = sanitizeGearInventory(inventory);
    // 이미 가진 아이템도 강화 재료로 다시 나옵니다. 중복이어도 경험치·봉은 주지 않습니다.
    const available = pool.slice();
    if (!available.length) return null;
    const ownedMin = Math.min(
        countUniqueGearOfSlot(owned, 'weapon'),
        countUniqueGearOfSlot(owned, 'shield'),
        countUniqueGearOfSlot(owned, 'shoes'),
    );
    const mul = ownedMin <= 0 ? 2 : ownedMin === 1 ? 1 : 0.25;
    const base = n >= 80 ? 6 : n >= 30 ? 3.5 : n >= 16 ? 2.5 : 0.8;
    const roll = (typeof rng === 'function' ? rng() : Math.random()) * 100;
    if (roll >= base * mul) return null;
    const pickRoll = typeof rng === 'function' ? rng() : Math.random();
    return available[Math.floor(pickRoll * available.length)] || null;
}

export function gearSlotLabel(slot) {
    if (slot === 'shield') return '방패';
    if (slot === 'shoes') return '신발';
    return '무기';
}
