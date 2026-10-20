import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    allowLegacyThermometerValues,
    buildThermometerParentPayload,
    clearedLearningThermometerLegacy,
    decideThermometerLockClaim,
    planThermometerSettlement,
    priorRunningThermometerSettlementKey,
    resolveContinuingSettlementValues,
    settlementLockHeld,
    studentSettlementAlreadyApplied,
    thermometerSettlementMarker,
    thermometerStudentGrantPlan,
    thermometerValueSource,
    thermometerVoteIdsToClear,
    thermometerXpIncrement,
} from './learningThermometerSettlement.js';
import { planThermometerLegacyVoteWrites } from './learningThermometerVotes.js';

describe('학습 온도계 정산 값 출처', () => {
    const legacy = { '2': 15, '5': -8 };

    it('표가 없으면 부모 문서가 없을 때 예전 전역 값을 씁니다', () => {
        assert.equal(allowLegacyThermometerValues({ parentExists: false }), true);
        const source = thermometerValueSource({
            voteValues: {},
            parentValues: null,
            legacyValues: legacy,
            allowLegacy: true,
        });
        assert.equal(source.kind, 'legacy');
        assert.equal(source.values['2'], 15);
        assert.equal(source.values['5'], -8);
    });

    it('잠금만 남은 부모 문서는 표가 없어도 예전 전역 값을 봅니다', () => {
        assert.equal(allowLegacyThermometerValues({
            parentExists: true,
            settlementStatus: 'running',
            settledDate: '',
            today: '2026-10-16',
            appliedCount: 0,
            totalDelta: 0,
        }), true);
        const source = thermometerValueSource({
            voteValues: {},
            parentValues: {},
            legacyValues: legacy,
            allowLegacy: true,
        });
        assert.equal(source.kind, 'legacy');
        assert.equal(source.values['2'], 15);
    });

    it('표가 0인 학생은 예전 값으로 되돌리지 않고, 표가 없는 학생은 예전 값을 받습니다', () => {
        const source = thermometerValueSource({
            voteValues: { '2': 0 },
            parentValues: {},
            legacyValues: legacy,
            allowLegacy: true,
        });
        assert.equal(source.kind, 'legacy');
        assert.equal(source.values['2'], 0);
        assert.equal(source.values['5'], -8);
        assert.deepEqual(source.legacyIds, ['5']);
    });

    it('완료된 정산은 예전 값으로 다시 열지 않습니다', () => {
        assert.equal(allowLegacyThermometerValues({
            parentExists: true,
            settlementStatus: 'done',
        }), false);
        assert.equal(allowLegacyThermometerValues({
            parentExists: true,
            settlementStatus: '',
        }), false);
        const source = thermometerValueSource({
            voteValues: {},
            parentValues: {},
            legacyValues: legacy,
            allowLegacy: false,
        });
        assert.equal(source.kind, 'empty');
    });

    it('H1: 이번 정산 키가 있는 학생은 같은 값을 다시 지급하지 않습니다', () => {
        const marker = thermometerSettlementMarker('2026-10-16', 1);
        assert.equal(marker, '2026-10-16#1');
        const first = thermometerStudentGrantPlan({
            alreadyApplied: false,
            delta: 3,
            usedStaleValues: false,
            marker,
        });
        assert.equal(first.action, 'grant');
        assert.equal(first.markers.lastThermometerSettlementKey, marker);
        assert.equal(first.markers.thermometerUsedStaleValues, false);
        assert.equal(studentSettlementAlreadyApplied({ lastThermometerSettlementKey: marker }, marker), true);
        const again = thermometerStudentGrantPlan({
            alreadyApplied: true,
            delta: 3,
            marker,
        });
        assert.equal(again.action, 'skip');
        assert.equal(again.reason, 'already_applied');
        assert.equal(thermometerXpIncrement(10, 13), 3);
        assert.equal(thermometerXpIncrement(10, 0), -10);
        assert.equal(thermometerXpIncrement(10, 10), null);
    });

    it('M1: 예전 값으로 이미 반영한 학생은 건너뛰고, 다음 날에는 예전 값을 열지 않습니다', () => {
        const marker = thermometerSettlementMarker('2026-10-16', 1);
        const plan = thermometerStudentGrantPlan({
            alreadyApplied: false,
            delta: 15,
            usedStaleValues: true,
            marker,
        });
        assert.equal(plan.action, 'grant');
        assert.equal(plan.markers.lastThermometerSettlementKey, marker);
        assert.equal(plan.markers.thermometerUsedStaleValues, true);
        const replay = thermometerStudentGrantPlan({
            alreadyApplied: true,
            delta: 15,
            usedStaleValues: true,
            marker,
        });
        assert.equal(replay.reason, 'already_applied');
        assert.equal(allowLegacyThermometerValues({
            parentExists: true,
            settlementStatus: 'running',
            usedStaleValues: true,
            settlementKey: '2026-10-16',
            today: '2026-10-16',
        }), true);
        assert.equal(allowLegacyThermometerValues({
            parentExists: true,
            settlementStatus: 'running',
            usedStaleValues: true,
            settlementKey: '2026-10-15',
            today: '2026-10-16',
        }), false);
        const resurrected = thermometerValueSource({
            voteValues: {},
            parentValues: {},
            legacyValues: legacy,
            allowLegacy: false,
        });
        assert.equal(resurrected.kind, 'empty');
        assert.equal(studentSettlementAlreadyApplied(
            { lastThermometerSettlementKey: marker },
            thermometerSettlementMarker('2026-10-16', 2),
        ), false);
        const nextDayStale = thermometerStudentGrantPlan({
            alreadyApplied: false,
            alreadyUsedStale: true,
            delta: 15,
            usedStaleValues: true,
            marker: thermometerSettlementMarker('2026-10-17', 1),
        });
        assert.equal(nextDayStale.action, 'skip');
        assert.equal(nextDayStale.reason, 'stale_consumed');
    });

    it('M3: 표가 있는 학생과 예전 값만 있는 학생을 같은 날 정산합니다', () => {
        const plan = planThermometerSettlement({
            activeIds: ['1', '2'],
            voteValues: { '2': 5 },
            parentExists: true,
            parentData: {
                settlementStatus: 'done',
                settledDate: '2026-10-16',
                usedStaleValues: false,
                settlementKey: '2026-10-16',
            },
            legacyThermometer: { values: { '1': 3, '2': 15, '9': 7 } },
            today: '2026-10-17',
            min: -20,
            max: 20,
        });
        assert.equal(plan.legacyAllowed, true);
        assert.equal(plan.pendingValues['1'], 3);
        assert.equal(plan.pendingValues['2'], 5);
        assert.equal(plan.pendingValues['9'], undefined);
        assert.deepEqual(plan.legacyIds, ['1']);
        assert.deepEqual(plan.legacyIdsToClose, ['1', '9']);
        assert.equal(plan.consumeLegacy, true);
        assert.equal(allowLegacyThermometerValues({
            parentExists: true,
            settlementStatus: '',
            settledDate: '',
            today: '2026-10-17',
        }), true);
    });

    it('R1: 예전 값을 소모한 다음 날은 다시 지급하지 않고 시딩도 멈춥니다', () => {
        const day1 = planThermometerSettlement({
            activeIds: ['1'],
            voteValues: {},
            parentExists: true,
            parentData: {
                settlementStatus: 'done',
                settledDate: '2026-10-15',
                usedStaleValues: false,
            },
            legacyThermometer: { min: -20, max: 20, values: { '1': 3 } },
            today: '2026-10-16',
            min: -20,
            max: 20,
        });
        assert.equal(day1.pendingValues['1'], 3);
        assert.equal(day1.consumeLegacy, true);
        const cleared = clearedLearningThermometerLegacy({ min: -20, max: 20, values: { '1': 3 } });
        assert.deepEqual(cleared.values, {});
        assert.equal(cleared.min, -20);

        const day2 = planThermometerSettlement({
            activeIds: ['1', '9'],
            voteValues: {},
            parentExists: true,
            parentData: {
                settlementStatus: 'done',
                settledDate: '2026-10-16',
                usedStaleValues: true,
                settlementKey: '2026-10-16',
            },
            legacyThermometer: { values: { '1': 3, '9': 7 } },
            today: '2026-10-17',
            min: -20,
            max: 20,
        });
        assert.equal(day2.legacyAllowed, false);
        assert.equal(day2.pendingValues['1'], undefined);
        assert.equal(day2.pendingValues['9'], undefined);
        assert.equal(day2.consumeLegacy, true);
        const reactivated = planThermometerSettlement({
            activeIds: ['9'],
            voteValues: { '9': 0 },
            parentExists: true,
            parentData: {
                settlementStatus: 'done',
                settledDate: '2026-10-16',
                usedStaleValues: false,
            },
            legacyThermometer: { values: { '9': 7 } },
            today: '2026-10-17',
            min: -20,
            max: 20,
        });
        assert.equal(reactivated.pendingValues['9'], undefined);
        assert.equal(planThermometerLegacyVoteWrites({
            existingVoteIds: [],
            legacyValues: { '1': 3, '9': 7 },
            activeIds: ['1', '9'],
            allowLegacy: day2.legacyAllowed,
            min: -20,
            max: 20,
        }), null);
        assert.equal(allowLegacyThermometerValues({
            parentExists: true,
            settlementStatus: 'running',
            usedStaleValues: true,
            settlementKey: '2026-10-16',
            settledDate: '2026-10-16',
            today: '2026-10-17',
        }), false);
    });

    it('M2: 임대가 끝났거나 다른 탭이 잠금을 가졌으면 지급하지 않습니다', () => {
        const leaseMs = 5 * 60 * 1000;
        const now = 1_000_000;
        const base = {
            settlementKey: '2026-10-16',
            settlementStatus: 'running',
            settlementStartedAt: now - 1000,
            settlementLockOwner: 'tabA',
            settlementAttempt: 1,
            settledDate: '',
            today: '2026-10-16',
            now,
            leaseMs,
        };
        assert.equal(settlementLockHeld({ ...base, owner: 'tabA' }), true);
        assert.equal(settlementLockHeld({ ...base, owner: 'tabB' }), false);
        assert.equal(settlementLockHeld({
            ...base,
            owner: 'tabA',
            now: base.settlementStartedAt + leaseMs,
        }), false);
        assert.equal(decideThermometerLockClaim({ ...base, owner: 'tabB' }).action, 'locked');
        assert.equal(decideThermometerLockClaim({ ...base, owner: 'tabA' }).action, 'reuse');
        const takeover = decideThermometerLockClaim({
            ...base,
            owner: 'tabB',
            now: base.settlementStartedAt + leaseMs,
        });
        assert.equal(takeover.action, 'claim');
        assert.equal(takeover.attempt, 1);
        const manualAgain = decideThermometerLockClaim({
            ...base,
            settlementStatus: 'done',
            settledDate: '2026-10-16',
            settlementStartedAt: 0,
            settlementLockOwner: '',
            owner: 'tabA',
            manual: true,
            pendingCount: 1,
        });
        assert.equal(manualAgain.action, 'claim');
        assert.equal(manualAgain.attempt, 2);
    });

    it('H2: 어제 키로 running 이면 그 키를 유지한 채 먼저 마무리합니다', () => {
        assert.equal(priorRunningThermometerSettlementKey({
            settlementStatus: 'running',
            settlementKey: '2026-10-16',
            today: '2026-10-17',
        }), '2026-10-16');
        assert.equal(priorRunningThermometerSettlementKey({
            settlementStatus: 'running',
            settlementKey: '2026-10-17',
            today: '2026-10-17',
        }), '');
        assert.equal(priorRunningThermometerSettlementKey({
            settlementStatus: 'done',
            settlementKey: '2026-10-16',
            today: '2026-10-17',
        }), '');
        assert.equal(priorRunningThermometerSettlementKey({
            settlementStatus: 'running',
            settlementKey: '2026-10-18',
            today: '2026-10-17',
        }), '');
        assert.equal(priorRunningThermometerSettlementKey({
            settlementStatus: 'running',
            settlementKey: '',
            today: '2026-10-17',
        }), '');

        const leaseMs = 5 * 60 * 1000;
        const now = 1_000_000;
        const closeYesterday = decideThermometerLockClaim({
            settlementKey: '2026-10-16',
            settlementStatus: 'running',
            settlementStartedAt: now - leaseMs - 1000,
            settlementLockOwner: 'tabA',
            settlementAttempt: 1,
            settledDate: '',
            owner: 'tabB',
            today: '2026-10-16',
            now,
            leaseMs,
        });
        assert.equal(closeYesterday.action, 'claim');
        assert.equal(closeYesterday.attempt, 1);
        assert.equal(thermometerSettlementMarker('2026-10-16', closeYesterday.attempt), '2026-10-16#1');

        const stealAsToday = decideThermometerLockClaim({
            settlementKey: '2026-10-16',
            settlementStatus: 'running',
            settlementStartedAt: now - leaseMs - 1000,
            settlementLockOwner: 'tabA',
            settlementAttempt: 1,
            settledDate: '',
            owner: 'tabB',
            today: '2026-10-17',
            now,
            leaseMs,
        });
        assert.equal(stealAsToday.action, 'claim');
        assert.equal(stealAsToday.attempt, 2);

        const payload = buildThermometerParentPayload({
            date: '2026-10-16',
            min: -20,
            max: 20,
            values: { '2': 5 },
            settledDate: '2026-10-16',
            settlementKey: '2026-10-16',
            settlementStatus: 'done',
            settlementAttempt: 1,
            usedStaleValues: true,
        }, { today: '2026-10-16' });
        assert.equal(payload.usedStaleValues, true);
        assert.equal('values' in payload, false);
        assert.equal('settlementPending' in payload, false);
    });

    it('H3: 잠근 뒤 바꾼 표는 이번 정산에서 지우지 않습니다', () => {
        assert.deepEqual(resolveContinuingSettlementValues({
            continuing: true,
            storedPending: { '2': 5, '3': 4 },
            pendingValues: { '2': 8, '3': 4 },
        }), { '2': 5, '3': 4 });
        assert.deepEqual(resolveContinuingSettlementValues({
            continuing: false,
            storedPending: { '2': 5 },
            pendingValues: { '2': 8 },
        }), { '2': 8 });
        assert.deepEqual(resolveContinuingSettlementValues({
            continuing: true,
            storedPending: null,
            pendingValues: { '2': 8 },
        }), { '2': 8 });

        assert.deepEqual(thermometerVoteIdsToClear({
            snapshot: { '2': 5, '3': 4 },
            currentVotes: { '2': 8, '3': 4 },
            requestedIds: ['2', '3', '9'],
        }), ['3', '9']);
        assert.deepEqual(thermometerVoteIdsToClear({
            snapshot: null,
            currentVotes: { '2': 8 },
            requestedIds: ['2'],
        }), ['2']);

        const payload = buildThermometerParentPayload({
            date: '2026-10-16',
            min: -20,
            max: 20,
            settlementKey: '2026-10-16',
            settlementStatus: 'running',
            settlementPending: { '2': 5, '3': 0, 'bad id': 4 },
        }, { today: '2026-10-16' });
        assert.equal('settlementPending' in payload, false);
    });
});
