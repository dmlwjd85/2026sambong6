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
    { id: 'sh1', slot: 'shield', name: '나무 방패', emoji: '🪵', block: 0.08, desc: '경험치 차감 방어 8%' },
    { id: 'sh2', slot: 'shield', name: '가죽 방패', emoji: '🟤', block: 0.12, desc: '경험치 차감 방어 12%' },
    { id: 'sh3', slot: 'shield', name: '철 방패', emoji: '🛡️', block: 0.16, desc: '경험치 차감 방어 16%' },
    { id: 'sh4', slot: 'shield', name: '기사 방패', emoji: '🏰', block: 0.20, desc: '경험치 차감 방어 20%' },
    { id: 'sh5', slot: 'shield', name: '용린 방패', emoji: '🐉', block: 0.24, desc: '경험치 차감 방어 24%' },
];

export const SHOE_GEAR = [
    { id: 'shoe1', slot: 'shoes', name: '짚신', emoji: '🌾', procBonus: 0.010, desc: '무기·방패 발동 +1%p' },
    { id: 'shoe2', slot: 'shoes', name: '가죽 장화', emoji: '🥾', procBonus: 0.015, desc: '무기·방패 발동 +1.5%p' },
    { id: 'shoe3', slot: 'shoes', name: '여행 신발', emoji: '👟', procBonus: 0.020, desc: '무기·방패 발동 +2%p' },
    { id: 'shoe4', slot: 'shoes', name: '바람 장화', emoji: '🎐', procBonus: 0.025, desc: '무기·방패 발동 +2.5%p' },
    { id: 'shoe5', slot: 'shoes', name: '헤르메스 신발', emoji: '🪽', procBonus: 0.030, desc: '무기·방패 발동 +3%p' },
];

export const ALL_GEAR = [...WEAPON_GEAR, ...SHIELD_GEAR, ...SHOE_GEAR];
export const MASTER_GEAR_IDS = ALL_GEAR.map((g) => g.id);

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
    const ids = Array.isArray(inventory) ? inventory : [];
    return ids.filter((id) => {
        const g = getGear(id);
        return g && g.slot === slot;
    }).length;
}

export function grantMasterGear(inventory) {
    const next = Array.isArray(inventory) ? inventory.slice() : [];
    MASTER_GEAR_IDS.forEach((id) => {
        if (!next.includes(id)) next.push(id);
    });
    return next;
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
    const inv = Array.isArray(stu && stu.inventory) ? stu.inventory : [];
    if (stu && stu.isAdmin) return gear;
    if (!inv.includes(gear.id)) return null;
    return gear;
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
    const chance = clamp01((Number(shield.block) || 0) + (shoes ? Number(shoes.procBonus) || 0 : 0) + cosm.shieldBlock);
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

export function pickQuestDropId(xp, inventory, rng = Math.random) {
    const n = Math.floor(Number(xp) || 0);
    const pool = n >= 80
        ? ['wp5', 'sh5', 'shoe5', 'wp4', 'sh4', 'shoe4']
        : n >= 30
            ? ['wp3', 'sh3', 'shoe3', 'wp2', 'sh2', 'shoe2']
            : n >= 16
                ? ['wp2', 'sh2', 'shoe2', 'wp1', 'sh1', 'shoe1']
                : ['wp1', 'sh1', 'shoe1'];
    const owned = Array.isArray(inventory) ? inventory : [];
    const available = pool.filter((id) => !owned.includes(id));
    if (!available.length) return null;
    const ownedMin = Math.min(
        countGearOfSlot(owned, 'weapon'),
        countGearOfSlot(owned, 'shield'),
        countGearOfSlot(owned, 'shoes'),
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
