import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    getCosmeticSlot,
    listCharacterBases,
    listStaffLooks,
    RANK_LOOKS,
    resolveCharacterBase,
    resolveRankLook,
    resolveStaffLook,
    unequipSameSlot,
} from './characterLooks.js';

describe('성별 기본 얼굴', () => {
    it('남·여 각각 3종이다', () => {
        assert.equal(listCharacterBases('M').length, 3);
        assert.equal(listCharacterBases('F').length, 3);
    });

    it('없는 번호면 해당 성별 첫 얼굴을 쓴다', () => {
        assert.equal(resolveCharacterBase('nope', 'F').id, 'base_f1');
        assert.equal(resolveCharacterBase('base_m2', 'M').id, 'base_m2');
    });

    it('id가 있으면 성별과 달라도 그 얼굴을 쓴다', () => {
        assert.equal(resolveCharacterBase('base_f2', 'M').id, 'base_f2');
        assert.equal(resolveCharacterBase('base_m3', 'F').id, 'base_m3');
    });
});

describe('등급 안내', () => {
    it('6개 등급 이름이 있다', () => {
        assert.equal(RANK_LOOKS.length, 6);
        const names = RANK_LOOKS.map((r) => r.name);
        assert.deepEqual(names, ['새내기', '초보', '중수', '고수', '수호자', '전설']);
        assert.equal(resolveRankLook('고수').name, '고수');
        assert.equal(resolveRankLook('없는등급').name, '새내기');
    });
});

describe('마스터 수호 캐릭터', () => {
    it('용·호랑이·현무·해태와 그리스 신화 10종이 있다', () => {
        const looks = listStaffLooks();
        assert.equal(looks.length, 14);
        assert.deepEqual(looks.slice(0, 4).map((l) => l.name), ['용', '호랑이', '현무', '해태']);
        assert.equal(looks.filter((l) => l.masterOnly).length, 10);
        assert.equal(resolveStaffLook('staff_zeus', 'gm').id, 'staff_zeus');
        assert.equal(resolveStaffLook('staff_haetae', 'gm').id, 'staff_haetae');
        assert.equal(resolveStaffLook('', 'gm_a').id, 'staff_tiger');
        assert.equal(resolveStaffLook('', 'gm').id, 'staff_dragon');
    });
});

describe('장식 슬롯', () => {
    it('같은 슬롯은 하나만 남긴다', () => {
        const catalog = [
            { id: 'h1', type: 'overlay', slot: 'hair' },
            { id: 'h2', type: 'overlay', slot: 'hair' },
            { id: 'hat', type: 'overlay', slot: 'head' },
        ];
        const next = unequipSameSlot({ h1: true, hat: true }, catalog, catalog[1]);
        assert.equal(next.h1, false);
        assert.equal(next.h2, false);
        assert.equal(next.hat, true);
        assert.equal(getCosmeticSlot(catalog[0]), 'hair');
    });

    it('얼굴 캐릭터는 하나만 켠다', () => {
        const catalog = [
            { id: 'f_ninja', type: 'face' },
            { id: 'f_king', type: 'face' },
            { id: 'sk_red', type: 'aura' },
        ];
        const next = unequipSameSlot({ f_ninja: true, sk_red: true }, catalog, catalog[1]);
        assert.equal(next.f_ninja, false);
        assert.equal(next.f_king, false);
        assert.equal(next.sk_red, true);
    });
});
