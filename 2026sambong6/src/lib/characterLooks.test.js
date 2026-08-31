import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    getCosmeticSlot,
    listCharacterBases,
    RANK_LOOKS,
    resolveCharacterBase,
    resolveRankLook,
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
});

describe('등급 착장', () => {
    it('6개 등급마다 다른 레이어가 있다', () => {
        assert.equal(RANK_LOOKS.length, 6);
        const names = RANK_LOOKS.map((r) => r.name);
        assert.deepEqual(names, ['새내기', '초보', '중수', '고수', '수호자', '전설']);
        assert.equal(resolveRankLook('고수').name, '고수');
        assert.equal(resolveRankLook('없는등급').name, '새내기');
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
});
