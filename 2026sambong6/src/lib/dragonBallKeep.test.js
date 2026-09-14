import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDragonBallHomeRewardHint,
    mergeDragonBallCollections,
    resolveDragonBallWeekendKey,
    resolveDragonBallsForSave,
    resolveDragonBallsForSnapshot,
    sanitizeDragonBallList,
} from './dragonBallKeep.js';

describe('드래곤볼 보관함 유지', () => {
    it('숫자·문자 섞인 성구를 1~7만 남긴다', () => {
        assert.deepEqual(sanitizeDragonBallList(['1', 3, '3', 0, 8, 'x', 2]), [1, 2, 3]);
        assert.deepEqual(sanitizeDragonBallList(null), []);
    });

    it('빈 캐시가 서버 보관함을 지우지 않는다', () => {
        assert.deepEqual(resolveDragonBallsForSave([], [1, 4, 7]), [1, 4, 7]);
        assert.deepEqual(resolveDragonBallsForSave([2], [1, 2, 3]), [1, 2, 3]);
        assert.deepEqual(resolveDragonBallsForSnapshot([1, 5], []), [1, 5]);
        assert.deepEqual(mergeDragonBallCollections([1], ['2', 1]), [1, 2]);
    });

    it('관리자 초기화는 로컬 빈 값을 그대로 쓴다', () => {
        assert.deepEqual(resolveDragonBallsForSave([], [1, 2, 3], { replace: true }), []);
    });

    it('주말 키는 있는 쪽을 남긴다', () => {
        assert.equal(resolveDragonBallWeekendKey('', '2026-09-12'), '2026-09-12');
        assert.equal(resolveDragonBallWeekendKey('2026-09-12', ''), '2026-09-12');
    });

    it('홈 안내는 설정한 완성 보상을 그대로 보여 준다', () => {
        const hint = formatDragonBallHomeRewardHint(
            { findXp: 15, findBong: 2, completeXp: 50, completeBong: 5 },
            (n) => `${n}봉`,
        );
        assert.match(hint, /1개 15 XP · 2봉/);
        assert.match(hint, /다 모으면 50 XP · 5봉/);
        assert.match(formatDragonBallHomeRewardHint({ findXp: 20, findBong: 0, completeXp: 80, completeBong: 0 }), /다 모으면 80 XP/);
    });
});
