import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SEASON2,
    SEASON2_DAILY_QUEST_XP_SUM,
    DAILY_ALL_CLEAR_XP,
    DRAGON_BALL_COMPLETE_XP,
    DRAGON_BALL_XP,
    buildSeason1ItemRefundPatch,
    buildSeason2StudentPatch,
    buildXpSupervisionIncidents,
    canRefundSkinThisSeason,
    canStartSeason2,
    filterLogsSince,
    season2SupervisionSinceMs,
    CUSTOM_QUEST_XP_MAX,
    CUSTOM_SHOP_XP_MAX,
    catalogQuestRewards,
    countInstructionalWeekdays,
    estimateSeason2QuestXp,
    expectedXpPace,
    season1SettlementBong,
    season2SchoolDaysTotal,
    studentAlreadyGotSeason1ItemRefund,
    sanitizeDragonBallRewards,
    season1RecordXp,
    buildSeason1HallOfFame,
    uniqueInventory,
    collectSeason2TargetIds,
    weaponDropMultiplier,
    worldSettingsForSeason2,
    applyShieldToXpDeduct,
    readShieldStock,
    SHIELD_STOCK_DEFAULT,
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

    it('시즌 2 패치는 XP만 0으로 돌리고 지갑·은행 봉 필드는 넣지 않는다', () => {
        const r = buildSeason2StudentPatch({
            xp: 25400,
            bong: 80.5,
            bankRegularSavings: 300,
            bankTermDeposits: [{ id: 't1', amount: 50 }],
            bankDailyBonusLastDate: '2026-08-31',
            jobs: [{ id: 'farmer' }],
            ownedSkins: ['skin1'],
            inventory: ['wp1', 'wp1', 'wp3'],
            equippedWeapon: 'wp1',
            questHistory: [{ id: 'q1', xp: 10 }],
        });
        assert.equal(r.skip, false);
        assert.equal(r.season1Xp, 25400);
        assert.equal(r.rewardBong, 200);
        assert.equal(r.bongDelta, 200);
        assert.equal(r.patch.xp, 0);
        assert.equal(Object.prototype.hasOwnProperty.call(r.patch, 'bong'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(r.patch, 'bankRegularSavings'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(r.patch, 'bankTermDeposits'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(r.patch, 'bankDailyBonusLastDate'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(r.patch, 'jobs'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(r.patch, 'ownedSkins'), false);
        assert.deepEqual(r.patch.inventory, []);
        assert.equal(r.patch.equippedWeapon, null);
        assert.deepEqual(r.patch.itemRefundLedger, []);
        assert.deepEqual(r.patch.questHistory, []);
        assert.equal(r.patch.seasonNumberApplied, 2);
        assert.equal(r.patch.xpChangeLog.length, 1);
        assert.equal(r.patch.bongChangeLog.length, 1);
    });

    it('이미 시즌 2가 적용된 학생은 건너뛴다', () => {
        const r = buildSeason2StudentPatch({ xp: 10000, seasonNumberApplied: 2 });
        assert.equal(r.skip, true);
    });

    it('금융감독은 시즌 2 시작 이후 로그만 남긴다', () => {
        const since = season2SupervisionSinceMs({ season1SettledAt: Date.parse('2026-09-01T09:00:00') }, Date.parse('2026-09-01T08:00:00'));
        assert.ok(since >= Date.parse('2026-09-01T08:00:00'));
        const logs = filterLogsSince([
            { at: Date.parse('2026-08-20T10:00:00'), delta: 500 },
            { at: Date.parse('2026-09-01T10:00:00'), delta: 10 },
        ], since);
        assert.equal(logs.length, 1);
        assert.equal(logs[0].delta, 10);
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

    it('시즌 2 정산 대상은 명단·서버 학번을 합치고 마스터는 뺀다', () => {
        assert.deepEqual(
            collectSeason2TargetIds(['1', '2', 'gm'], ['student_2', '3', 'gm_a', 'guest']),
            ['1', '2', '3']
        );
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

describe('시즌 1 아이템 50% 환불', () => {
    it('보유 스킨과 방패를 반액 환불하고 비운다', () => {
        const r = buildSeason1ItemRefundPatch({
            bong: 10,
            ownedSkins: { f_ninja: true, f_king: true },
            equippedSkins: { f_ninja: true },
            hasShield: true,
            shieldHP: 40,
            bongChangeLog: [],
            itemRefundLedger: [],
        }, [
            { id: 'f_ninja', name: '닌자', price: 200 },
            { id: 'f_king', name: '국왕', price: 400 },
        ]);
        assert.equal(r.skip, false);
        assert.equal(r.refundBong, 100 + 200 + 25);
        assert.deepEqual(r.patch.ownedSkins, {});
        assert.deepEqual(r.patch.equippedSkins, {});
        assert.equal(r.patch.hasShield, false);
        assert.equal(r.patch.shieldHP, 0);
        assert.equal(Object.prototype.hasOwnProperty.call(r.patch, 'bong'), false);
    });

    it('보유가 없으면 건너뛴다', () => {
        const r = buildSeason1ItemRefundPatch({ ownedSkins: {}, hasShield: false });
        assert.equal(r.skip, true);
        assert.equal(r.refundBong, 0);
    });

    it('이미 환불받은 학생은 스킨을 다시 비우지 않는다', () => {
        const r = buildSeason1ItemRefundPatch({
            ownedSkins: { f_ninja: true },
            itemRefundLedger: [{ kind: 'season1_items', source: 'season1ItemRefund' }],
        }, [{ id: 'f_ninja', name: '닌자', price: 200 }]);
        assert.equal(r.skip, true);
        assert.equal(r.alreadyRefunded, true);
        assert.equal(studentAlreadyGotSeason1ItemRefund({
            itemRefundLedger: [{ source: 'season1ItemRefund' }],
        }), true);
    });
});

describe('드래곤볼 보상 입력', () => {
    it('직접 입력값을 0~300으로 맞춘다', () => {
        const r = sanitizeDragonBallRewards({ dragonBallFindXp: 15, dragonBallFindBong: 2, dragonBallCompleteXp: 50, dragonBallCompleteBong: 5 });
        assert.equal(r.findXp, 15);
        assert.equal(r.findBong, 2);
        assert.equal(r.completeXp, 50);
        assert.equal(r.completeBong, 5);
        assert.equal(sanitizeDragonBallRewards({ findXp: -3, completeXp: 9999 }).findXp, 0);
        assert.equal(sanitizeDragonBallRewards({ completeXp: 9999 }).completeXp, 300);
        assert.equal(sanitizeDragonBallRewards(null).findXp, DRAGON_BALL_XP);
        assert.equal(sanitizeDragonBallRewards(null).completeXp, DRAGON_BALL_COMPLETE_XP);
    });
});

describe('절대 방패', () => {
    it('재고가 없으면 5개, 있으면 그 값을 쓴다', () => {
        assert.equal(SHIELD_STOCK_DEFAULT, 5);
        assert.equal(readShieldStock(null), 5);
        assert.equal(readShieldStock({}), 5);
        assert.equal(readShieldStock({ shieldStock: 3 }), 3);
        assert.equal(readShieldStock({ shieldStock: 0 }), 0);
    });

    it('경험치 차감은 방패가 막고 남은 양만 돌려준다', () => {
        const full = applyShieldToXpDeduct({ hasShield: true, shieldHP: 40 }, 5);
        assert.equal(full.remainingDeduct, 0);
        assert.equal(full.absorbed, 5);
        assert.equal(full.updates.shieldHP, 135);
        assert.equal(full.updates.hasShield, false);

        const overflow = applyShieldToXpDeduct({ hasShield: false, shieldHP: 3 }, 10);
        assert.equal(overflow.remainingDeduct, 7);
        assert.equal(overflow.absorbed, 3);
        assert.equal(overflow.updates.shieldHP, 0);
    });

    it('방패가 없으면 경험치 차감 전부를 남긴다', () => {
        const r = applyShieldToXpDeduct({ hasShield: false, shieldHP: 0 }, 5);
        assert.equal(r.remainingDeduct, 5);
        assert.equal(r.absorbed, 0);
        assert.equal(Object.prototype.hasOwnProperty.call(r.updates, 'shieldHP'), false);
    });
});

describe('시즌 1 명예의 전당', () => {
    it('시즌 1 XP 높은 순으로 순위를 매긴다', () => {
        const rows = buildSeason1HallOfFame([
            { id: '12', season1Xp: 12000, season1BongReward: 100 },
            { id: '1', season1Xp: 40000, season1BongReward: 400 },
            { id: 'gm', season1Xp: 99999 },
            { id: 'gm_a', season1Xp: 88888 },
            { id: 'guest', season1Xp: 77777 },
            { id: '6', season1Xp: 40000, season1BongReward: 400 },
        ], { 1: '김단엘', 6: '박소윤', 12: '황훈태' });
        assert.equal(rows.length, 3);
        assert.equal(rows[0].id, '1');
        assert.equal(rows[0].rank, 1);
        assert.equal(rows[0].name, '김단엘');
        assert.equal(rows[1].id, '6');
        assert.equal(rows[2].id, '12');
        assert.equal(season1RecordXp({ season1Xp: '25400' }), 25400);
        assert.equal(season1RecordXp({}), 0);
    });
});
