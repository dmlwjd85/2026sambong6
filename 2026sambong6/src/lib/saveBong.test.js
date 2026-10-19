import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QUEST_DROP_SAVES_SEPARATELY, resolveSavedBong } from './saveBong.js';

describe('봉 저장 한도', () => {
    it('한도가 없으면 올라간 봉을 서버 값으로 되돌린다', () => {
        assert.equal(resolveSavedBong({ serverBong: 20, nextBong: 24, maxBongIncrease: 0 }), 20);
    });

    it('퀘스트 한도 안에서는 오른 봉을 남긴다', () => {
        assert.equal(resolveSavedBong({ serverBong: 20, nextBong: 24, maxBongIncrease: 9 }), 24);
    });

    it('장비 드롭은 퀘스트 저장과 따로 저장하지 않는다', () => {
        assert.equal(QUEST_DROP_SAVES_SEPARATELY, false);
    });
});
