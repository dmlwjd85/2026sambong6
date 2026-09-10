import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ALL_GEAR,
    MASTER_GEAR_IDS,
    SHIELD_BLOCK_CAP,
    SHIELD_GEAR,
    SHOE_GEAR,
    WEAPON_GEAR,
    applyFullXpDeduct,
    applyQuestGearDrop,
    applyXpDeductWithGear,
    attachXpDeductResult,
    attemptGearEnhance,
    collectCosmeticBonuses,
    countGearOfSlot,
    countOwnedGear,
    countUniqueGearOfSlot,
    enhanceSuccessChance,
    GEAR_ENHANCE_SUCCESS_FROM,
    gearEnhanceOf,
    gearWithEnhance,
    getGear,
    grantMasterGear,
    MASTER_GEAR_COPIES,
    pickQuestDropId,
    resolveQuestWeaponProc,
    resolveShieldBlock,
    sanitizeGearInventory,
    skinStatLabel,
    staffLookStatLabel,
} from './gear.js';
import { applyShieldToXpDeduct } from './season2.js';

describe('장비 목록', () => {
    it('무기·방패·신발이 각 5종이다', () => {
        assert.equal(WEAPON_GEAR.length, 5);
        assert.equal(SHIELD_GEAR.length, 5);
        assert.equal(SHOE_GEAR.length, 5);
        assert.equal(ALL_GEAR.length, 15);
        assert.equal(MASTER_GEAR_IDS.length, 15);
        assert.equal(getGear('wp1').dmgMin, 1);
        assert.equal(getGear('wp1').dmgMax, 2);
        assert.equal(getGear('wp1').proc, 0.10);
        assert.equal(getGear('sh5').block, 0.20);
        assert.equal(getGear('shoe1').procBonus, 0.01);
        assert.ok(WEAPON_GEAR.every((g) => g.img && g.img.startsWith('chars/')));
        assert.ok(SHIELD_GEAR.every((g) => g.img && g.img.startsWith('chars/')));
        assert.ok(SHOE_GEAR.every((g) => g.img && g.img.startsWith('chars/')));
    });

    it('마스터는 전 장비를 10개씩 받는다', () => {
        const next = grantMasterGear(['wp1']);
        assert.equal(countOwnedGear(next, 'wp1'), MASTER_GEAR_COPIES);
        assert.equal(countOwnedGear(next, 'shoe5'), MASTER_GEAR_COPIES);
        assert.equal(next.length, MASTER_GEAR_IDS.length * MASTER_GEAR_COPIES);
        const leftover = grantMasterGear(['wp1', 'wp1', 'wp1'], { wp1: 2 });
        assert.equal(countOwnedGear(leftover, 'wp1'), 3);
        assert.equal(countOwnedGear(leftover, 'sh1'), MASTER_GEAR_COPIES);
        const enhancedOne = grantMasterGear(['wp1'], { wp1: 3 });
        assert.equal(countOwnedGear(enhancedOne, 'wp1'), 1);
        assert.equal(countGearOfSlot(['wp1', 'wp2', 'sh1'], 'weapon'), 2);
    });
});

describe('퀘스트 무기 발동', () => {
    it('나뭇가지는 10%에서 1~2 XP만 준다', () => {
        const stu = { inventory: ['wp1'], equippedWeapon: 'wp1' };
        const miss = resolveQuestWeaponProc(stu, () => 0.99);
        assert.equal(miss.hit, false);
        const hit = resolveQuestWeaponProc(stu, () => 0);
        assert.equal(hit.hit, true);
        assert.ok(hit.extraXp >= 1 && hit.extraXp <= 2);
    });

    it('신발이 발동 확률을 조금 올린다', () => {
        const bare = resolveQuestWeaponProc({ inventory: ['wp1'], equippedWeapon: 'wp1' }, () => 0.105);
        assert.equal(bare.hit, false);
        const shod = resolveQuestWeaponProc({
            inventory: ['wp1', 'shoe1'],
            equippedWeapon: 'wp1',
            equippedShoes: 'shoe1',
        }, () => 0.105);
        assert.equal(shod.hit, true);
    });
});

describe('방패 방어', () => {
    it('드롭 방패는 확률로 차감을 막는다', () => {
        const stu = { inventory: ['sh1'], equippedShield: 'sh1' };
        assert.equal(resolveShieldBlock(stu, () => 0.99).blocked, false);
        assert.equal(resolveShieldBlock(stu, () => 0).blocked, true);
        const blocked = applyXpDeductWithGear(stu, 12, () => ({ updates: { shieldHP: 0 }, remainingDeduct: 12, absorbed: 0 }), () => 0);
        assert.equal(blocked.blockedByGear, true);
        assert.equal(blocked.remainingDeduct, 0);
        assert.equal(blocked.absorbed, 12);
        const capStu = {
            inventory: ['sh5', 'shoe5'],
            equippedShield: 'sh5',
            equippedShoes: 'shoe5',
            isAdmin: true,
            homeLookMode: 'staff',
            staffLookId: 'staff_hera',
        };
        const capped = resolveShieldBlock(capStu, () => 0.199);
        assert.equal(capped.chance, SHIELD_BLOCK_CAP);
        assert.equal(capped.blocked, true);
        assert.equal(resolveShieldBlock(capStu, () => 0.20).blocked, false);
    });

    it('막지 못하면 내구 방패 함수를 쓴다', () => {
        const stu = { inventory: ['sh1'], equippedShield: 'sh1' };
        const r = applyXpDeductWithGear(stu, 5, () => ({ updates: { shieldHP: 1 }, remainingDeduct: 0, absorbed: 5 }), () => 0.99);
        assert.equal(r.blockedByGear, false);
        assert.equal(r.updates.shieldHP, 1);
    });

    it('절대 방패가 차감을 막으면 XP는 그대로 두고 내구만 깎는다', () => {
        const stu = { xp: 40, shieldHP: 100, hasShield: false };
        const r = applyFullXpDeduct(stu, 5, applyShieldToXpDeduct, () => 0.99);
        assert.equal(r.xp, 40);
        assert.equal(r.beforeXp, 40);
        assert.equal(Object.prototype.hasOwnProperty.call(r.updates, 'xp'), false);
        assert.equal(r.updates.shieldHP, 95);
        assert.equal(r.remainingDeduct, 0);
        assert.equal(r.absorbed, 5);
    });

    it('방패가 모자라면 남은 양만 XP에서 뺀다', () => {
        const stu = { xp: 40, shieldHP: 3 };
        const attached = attachXpDeductResult(stu, { updates: { shieldHP: 0 }, remainingDeduct: 7, absorbed: 3 });
        assert.equal(attached.xp, 33);
        assert.equal(attached.updates.xp, 33);
        assert.equal(attached.updates.shieldHP, 0);

        const overflow = applyFullXpDeduct(stu, 10, applyShieldToXpDeduct, () => 0.99);
        assert.equal(overflow.xp, 33);
        assert.equal(overflow.updates.xp, 33);
        assert.equal(overflow.updates.shieldHP, 0);
        assert.equal(overflow.absorbed, 3);
    });
});

describe('스킨 미세 능력', () => {
    it('장착 스킨 문구와 가산이 있다', () => {
        assert.match(skinStatLabel('f_ninja'), /발동/);
        const cosm = collectCosmeticBonuses({ equippedSkins: { f_ninja: true, sk_red: true } });
        assert.ok(cosm.weaponProc > 0 && cosm.weaponProc < 0.02);
        assert.match(staffLookStatLabel('staff_zeus'), /발동/);
    });
});

describe('퀘스트 드롭', () => {
    it('낮은 XP는 1단계 후보만 고른다', () => {
        const id = pickQuestDropId(8, [], () => 0);
        assert.ok(['wp1', 'sh1', 'shoe1'].includes(id));
        const stacked = pickQuestDropId(8, ['wp1', 'sh1', 'shoe1'], () => 0);
        assert.ok(['wp1', 'sh1', 'shoe1'].includes(stacked));
    });

    it('같은 아이템이 나와도 경험치·봉은 주지 않고 갯수만 늘린다', () => {
        const first = applyQuestGearDrop([], 'wp1');
        assert.equal(first.ok, true);
        assert.equal(first.duplicate, false);
        assert.equal(first.extraXp, 0);
        assert.equal(first.extraBong, 0);
        const again = applyQuestGearDrop(first.inventory, 'wp1');
        assert.equal(again.duplicate, true);
        assert.equal(again.count, 2);
        assert.equal(again.extraXp, 0);
        assert.equal(again.extraBong, 0);
        assert.deepEqual(again.inventory, ['wp1', 'wp1']);
    });
});

describe('장비 갯수·강화', () => {
    it('같은 아이템은 갯수로 쌓인다', () => {
        assert.deepEqual(sanitizeGearInventory(['wp1', 'wp1', 'nope', 'sh1']), ['wp1', 'wp1', 'sh1']);
        assert.equal(countOwnedGear(['wp1', 'wp1', 'sh1'], 'wp1'), 2);
        assert.equal(countUniqueGearOfSlot(['wp1', 'wp1', 'wp2'], 'weapon'), 2);
        assert.equal(countGearOfSlot(['wp1', 'wp1', 'sh1'], 'weapon'), 2);
    });

    it('강화 성공률은 1→2 100% · 2→3 50% · 3→4 30% · 4→5 15%이고 5단계는 최대다', () => {
        assert.equal(enhanceSuccessChance(1), 1);
        assert.equal(enhanceSuccessChance(2), 0.5);
        assert.equal(enhanceSuccessChance(3), 0.3);
        assert.equal(enhanceSuccessChance(4), 0.15);
        assert.equal(enhanceSuccessChance(5), 0);
        assert.equal(GEAR_ENHANCE_SUCCESS_FROM[5], 0.10);
    });

    it('1→2 강화는 항상 성공하고 재료 1개를 쓴다', () => {
        const r = attemptGearEnhance({ inventory: ['wp1', 'wp1'] }, 'wp1', () => 0.99);
        assert.equal(r.ok, true);
        assert.equal(r.success, true);
        assert.equal(r.after, 2);
        assert.deepEqual(r.inventory, ['wp1']);
        assert.equal(r.gearEnhance.wp1, 2);
    });

    it('강화 실패면 1단계가 되고 재료는 사라진다', () => {
        const r = attemptGearEnhance({ inventory: ['sh2', 'sh2'], gearEnhance: { sh2: 3 } }, 'sh2', () => 0.99);
        assert.equal(r.ok, true);
        assert.equal(r.success, false);
        assert.equal(r.after, 1);
        assert.deepEqual(r.inventory, ['sh2']);
        assert.equal(r.gearEnhance.sh2, 1);
    });

    it('강화 단계는 소량 보너스를 준다', () => {
        const base = getGear('wp1');
        const boosted = gearWithEnhance(base, 5);
        assert.ok(boosted.proc > base.proc);
        assert.equal(gearEnhanceOf({ gearEnhance: { wp1: 4 } }, 'wp1'), 4);
        const sh = gearWithEnhance(getGear('sh4'), 5);
        assert.ok(sh.block > getGear('sh4').block);
    });
});
