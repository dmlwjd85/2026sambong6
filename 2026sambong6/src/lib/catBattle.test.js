import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CAT_DAILY_WIN_LIMIT,
    CAT_MAX_FRIENDS,
    applyCatWin,
    canStartCatStage,
    enemyStats,
    sanitizeCatFriends,
    simulateCatBattle,
    stageRewards,
    unitAtk,
} from './catBattle.js';

describe('냥코 원정', () => {
    it('친구는 최대 2명이고 나는 넣을 수 없다', () => {
        assert.deepEqual(sanitizeCatFriends(['12', '12', 'gm', '3', '4'], '12'), ['3', '4']);
        assert.equal(sanitizeCatFriends(['1', '2', '3'], '9').length, CAT_MAX_FRIENDS);
    });

    it('보상은 작고 5스테이지마다 1봉이다', () => {
        assert.deepEqual(stageRewards(1), { xp: 2, bong: 0 });
        assert.deepEqual(stageRewards(5), { xp: 3, bong: 1 });
        assert.ok(stageRewards(12).xp <= 5);
    });

    it('친구를 넣을수록 적 체력과 공격이 커진다', () => {
        const solo = enemyStats(4, 0);
        const duo = enemyStats(4, 2);
        assert.ok(duo.hp > solo.hp);
        assert.ok(duo.dps > solo.dps);
        assert.ok(unitAtk(40, true) > unitAtk(40, false));
    });

    it('1스테이지 혼자서는 이기고, 잠긴 스테이지·일일 한도를 막는다', () => {
        const easy = simulateCatBattle({ stage: 1, selfLevel: 8, friendLevels: [] });
        assert.equal(easy.win, true);
        const hard = simulateCatBattle({ stage: 12, selfLevel: 8, friendLevels: [] });
        assert.equal(hard.win, false);
        assert.equal(canStartCatStage({ cleared: 0 }, 2, '2026-09-02').ok, false);
        assert.equal(canStartCatStage({ cleared: 0 }, 1, '2026-09-02').ok, true);
        const full = canStartCatStage({ cleared: 5, dailyDate: '2026-09-02', dailyWins: CAT_DAILY_WIN_LIMIT }, 3, '2026-09-02');
        assert.equal(full.ok, false);
        const won = applyCatWin({ cleared: 0, friends: ['3'] }, 1, '2026-09-02');
        assert.equal(won.cleared, 1);
        assert.equal(won.dailyWins, 1);
        assert.equal(won.reward.xp, 2);
    });
});
