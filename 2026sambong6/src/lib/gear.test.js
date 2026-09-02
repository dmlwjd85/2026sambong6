import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ALL_GEAR,
    MASTER_GEAR_IDS,
    SHIELD_GEAR,
    SHOE_GEAR,
    WEAPON_GEAR,
    applyXpDeductWithGear,
    collectCosmeticBonuses,
    countGearOfSlot,
    getGear,
    grantMasterGear,
    pickQuestDropId,
    resolveQuestWeaponProc,
    resolveShieldBlock,
    skinStatLabel,
    staffLookStatLabel,
} from './gear.js';

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
        assert.equal(getGear('sh5').block, 0.24);
        assert.equal(getGear('shoe1').procBonus, 0.01);
    });

    it('마스터는 전 장비를 받는다', () => {
        const next = grantMasterGear(['wp1']);
        assert.equal(next.length, 15);
        assert.ok(next.includes('shoe5'));
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
    });

    it('막지 못하면 내구 방패 함수를 쓴다', () => {
        const stu = { inventory: ['sh1'], equippedShield: 'sh1' };
        const r = applyXpDeductWithGear(stu, 5, () => ({ updates: { shieldHP: 1 }, remainingDeduct: 0, absorbed: 5 }), () => 0.99);
        assert.equal(r.blockedByGear, false);
        assert.equal(r.updates.shieldHP, 1);
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
        assert.equal(pickQuestDropId(8, ['wp1', 'sh1', 'shoe1'], () => 0), null);
    });
});
