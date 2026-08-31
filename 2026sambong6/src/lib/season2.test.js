import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SEASON2,
    SEASON2_DAILY_QUEST_XP_SUM,
    DAILY_ALL_CLEAR_XP,
    buildSeason2StudentPatch,
    buildXpSupervisionIncidents,
    canRefundSkinThisSeason,
    canStartSeason2,
    collectSeason2TargetIds,
    CUSTOM_QUEST_XP_MAX,
    CUSTOM_SHOP_XP_MAX,
    catalogQuestRewards,
    countInstructionalWeekdays,
    estimateSeason2QuestXp,
    expectedXpPace,
    season1SettlementBong,
    season2SchoolDaysTotal,
    uniqueInventory,
    weaponDropMultiplier,
    worldSettingsForSeason2,
} from './season2.js';

describe('시즌 2 학사·경험치 예산', () => {
    it('9월 1일~1월 7일 수업일수는 약 80일이다', () => {
        const days = season2SchoolDaysTotal();
        assert.equal(days, 80);
    });

    it('성실 퀘스트 경로 XP는 약 2만이다', () => {
        const xp = estimateSeason2QuestXp(80);
        assert.ok(xp >= 18000 && xp <= 22000, `got ${xp}`);
        assert.equal(SEASON2_DAILY_QUEST_XP_SUM + DAILY_ALL_CLEAR_XP, 205);
        assert.equal(SEASON2.questXpBudget, 20000);
        assert.equal(SEASON2.teacherXpBudget, 10000);
        assert.equal(SEASON2.targetXp, 30000);
        assert.equal(CUSTOM_SHOP_XP_MAX, 50);
        assert.equal(CUSTOM_QUEST_XP_MAX, 80);
    });

    it('주말·방학은 수업일에서 뺀다', () => {
        assert.equal(countInstructionalWeekdays('2026-09-05', '2026-09-06'), 0);
        assert.equal(countInstructionalWeekdays('2026-12-24', '2027-01-06'), 0);
        assert.equal(countInstructionalWeekdays('2026-09-24', '2026-09-25'), 0);
    });
});

describe('시즌 1 정산', () => {
    it('경험치 1만당 100봉이다', () => {
        assert.equal(season1SettlementBong(0), 0);
        assert.equal(season1SettlementBong(9999), 0);
        assert.equal(season1SettlementBong(10000), 100);
        assert.equal(season1SettlementBong(39999), 300);
        assert.equal(season1SettlementBong(40000), 400);
    });

    it('시즌 2 패치는 XP를 0으로 돌리고 봉을 더한다', () => {
        const r = buildSeason2StudentPatch({
            xp: 25400,
            bong: 80,
            inventory: ['wp1', 'wp1', 'wp3'],
            equippedWeapon: 'wp1',
            questHistory: [{ id: 'q1', xp: 10 }],
        });
        assert.equal(r.skip, false);
        assert.equal(r.season1Xp, 25400);
        assert.equal(r.rewardBong, 200);
        assert.equal(r.patch.xp, 0);
        assert.equal(r.patch.bong, 280);
        assert.deepEqual(r.patch.inventory, ['wp1', 'wp3']);
        assert.equal(r.patch.equippedWeapon, 'wp1');
        assert.deepEqual(r.patch.questHistory, []);
        assert.equal(r.patch.seasonNumberApplied, 2);
    });

    it('이미 시즌 2가 적용된 학생은 건너뛴다', () => {
        const r = buildSeason2StudentPatch({ xp: 10000, seasonNumberApplied: 2 });
        assert.equal(r.skip, true);
    });

    it('정산 금액은 넘긴 문서의 XP·봉을 따른다 (캐시가 아니라 서버 값이어야 함)', () => {
        const fromStaleCache = buildSeason2StudentPatch({ xp: 10000, bong: 50 });
        const fromServer = buildSeason2StudentPatch({ xp: 25400, bong: 80 });
        assert.equal(fromStaleCache.rewardBong, 100);
        assert.equal(fromStaleCache.patch.bong, 150);
        assert.equal(fromServer.rewardBong, 200);
        assert.equal(fromServer.patch.bong, 280);
    });

    it('정산 대상은 명단과 서버 학번을 합치고 마스터는 뺀다', () => {
        assert.deepEqual(
            collectSeason2TargetIds(['1', '2', 'gm'], ['student_2', '3', 'gm_a', '']),
            ['1', '2', '3']
        );
    });

    it('9월 1일 전에는 시즌 2를 시작하지 않는다', () => {
        assert.equal(canStartSeason2('2026-08-30', false).ok, false);
        assert.equal(canStartSeason2('2026-09-01', false).ok, true);
        assert.equal(canStartSeason2('2026-09-01', true).ok, false);
    });

    it('월드 설정이 시즌 2·겨울방학으로 바뀐다', () => {
        const ws = worldSettingsForSeason2({ worldName: 'MATE' });
        assert.equal(ws.seasonNumber, 2);
        assert.equal(ws.navBadge, 'S2');
        assert.equal(ws.vacationStartDate, '2026-12-24');
        assert.equal(ws.semester, 2);
    });
});

describe('시즌 2 악용 가드', () => {
    it('무기는 종류당 1개만 남긴다', () => {
        assert.deepEqual(uniqueInventory(['wp5', 'wp5', 'wp2', '']), ['wp5', 'wp2']);
    });

    it('무기 드랍 배율은 0개 2배·2개 이상 0.25배로 묶는다', () => {
        assert.equal(weaponDropMultiplier(0), 2);
        assert.equal(weaponDropMultiplier(1), 1);
        assert.equal(weaponDropMultiplier(4), 0.25);
    });

    it('퀘스트 보상은 카탈로그 값을 따른다', () => {
        assert.deepEqual(catalogQuestRewards({ xp: 16, bong: 3 }, 999, 99), { xp: 16, bong: 3 });
        assert.deepEqual(catalogQuestRewards(null, 10, 0.5), { xp: 10, bong: 1 });
    });

    it('스킨 환불은 하루 1회·시즌 3회로 막는다', () => {
        assert.equal(canRefundSkinThisSeason({ seasonSkinRefundCount: 3 }, '2026-09-02').ok, false);
        assert.equal(canRefundSkinThisSeason({
            seasonSkinRefundCount: 1,
            itemRefundLedger: [{ at: Date.parse('2026-09-02T08:00:00') }],
        }, '2026-09-02').ok, false);
        assert.equal(canRefundSkinThisSeason({ seasonSkinRefundCount: 1, itemRefundLedger: [] }, '2026-09-02').ok, true);
    });

    it('경험치 감시가 과다 일일 획득을 잡는다', () => {
        const today = '2026-09-02';
        const incidents = buildXpSupervisionIncidents({
            xp: 500,
            xpChangeLog: [{ at: Date.parse('2026-09-02T10:00:00'), delta: 450, reason: '비정상' }],
        }, today, expectedXpPace(today));
        assert.ok(incidents.some((i) => i.category === '과다 일일 XP'));
    });
});
