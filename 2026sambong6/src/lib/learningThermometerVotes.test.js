import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyThermometerLegacySeeds,
    pickThermometerDisplayValues,
    planThermometerLegacyVoteWrites,
    resolveThermometerSettlementValue,
    retainThermometerPendingIds,
    thermometerVoteValue,
    thermometerVotesShouldReplaceValues,
} from './learningThermometerVotes.js';

describe('학습 온도계 예전 값', () => {
    it('표 문서가 없으면 화면의 예전 값을 0으로 바꾸지 않는다', () => {
        assert.equal(thermometerVotesShouldReplaceValues(0), false);
        assert.equal(thermometerVotesShouldReplaceValues(undefined), false);
        assert.equal(thermometerVotesShouldReplaceValues(2), true);
    });

    it('부모 문서에 값이 없으면 화면에 있던 값을 유지한다', () => {
        const kept = pickThermometerDisplayValues({
            votesSeen: false,
            parentValues: {},
            previousValues: { '1': 15, '2': -8 },
        });
        assert.deepEqual(kept, { '1': 15, '2': -8 });
    });

    it('표를 이미 봤으면 부모 문서의 빈 값이 화면을 덮지 않는다', () => {
        const kept = pickThermometerDisplayValues({
            votesSeen: true,
            parentValues: { '1': 15 },
            previousValues: { '4': 3 },
        });
        assert.deepEqual(kept, { '4': 3 });
    });

    it('한 학생만 바꿔 저장해도 표가 없는 다른 활성 학생의 예전 값을 같이 쓴다', () => {
        const seeds = planThermometerLegacyVoteWrites({
            existingVoteIds: [],
            legacyValues: { '1': 15, '2': -8, '4': 20, 'bad id': 9 },
            explicitIds: ['4'],
            min: -20,
            max: 20,
        });
        assert.deepEqual(seeds, { '1': 15, '2': -8 });
    });

    it('이미 0으로 적힌 표와 이번 저장에서 지운 학생은 예전 값으로 되돌리지 않는다', () => {
        const seeds = planThermometerLegacyVoteWrites({
            existingVoteIds: ['1'],
            legacyValues: { '1': 15, '2': -8 },
            explicitIds: ['2'],
            min: -20,
            max: 20,
        });
        assert.equal(seeds, null);
    });

    it('R1: 소모된 예전 값은 시딩하지 않고, 비활성 학생은 표로 옮기지 않는다', () => {
        assert.equal(planThermometerLegacyVoteWrites({
            existingVoteIds: [],
            legacyValues: { '1': 3, '9': 7 },
            allowLegacy: false,
            activeIds: ['1', '9'],
            min: -20,
            max: 20,
        }), null);
        const activeOnly = planThermometerLegacyVoteWrites({
            existingVoteIds: [],
            legacyValues: { '1': 3, '9': 7 },
            allowLegacy: true,
            activeIds: ['1'],
            min: -20,
            max: 20,
        });
        assert.deepEqual(activeOnly, { '1': 3 });
    });

    it('표가 없으면 예전 값을 정산하고, 0인 표는 0으로 둔다', () => {
        const shared = { allowGlobalLegacy: true, min: -20, max: 20, globalValue: 15 };
        assert.equal(resolveThermometerSettlementValue({
            ...shared,
            voteExists: false,
            parentValue: undefined,
        }), 15);
        assert.equal(resolveThermometerSettlementValue({
            ...shared,
            voteExists: true,
            voteValue: 0,
        }), 0);
        assert.equal(resolveThermometerSettlementValue({
            ...shared,
            voteExists: false,
            allowGlobalLegacy: false,
            globalValue: 15,
        }), 0);
        assert.equal(resolveThermometerSettlementValue({
            voteExists: false,
            parentValue: 4,
            globalValue: 15,
            allowGlobalLegacy: true,
            min: -20,
            max: 20,
        }), 4);
    });
});

describe('학습 온도계 저장 대기', () => {
    it('서버에 쓴 값과 화면 값이 같으면 대기에서 뺀다', () => {
        assert.deepEqual(retainThermometerPendingIds({
            pendingIds: ['4', '7'],
            writtenValues: { '4': 5, '7': 8 },
            currentValues: { '4': 5, '7': 8 },
            min: -20,
            max: 20,
        }), []);
    });

    it('저장 중에 바뀐 학생과 아직 안 쓴 학생은 대기에 남긴다', () => {
        assert.deepEqual(retainThermometerPendingIds({
            pendingIds: ['4', '7', '9'],
            writtenValues: { '4': 5 },
            currentValues: { '4': 12, '7': 8 },
            min: -20,
            max: 20,
        }), ['4', '7', '9']);
        assert.equal(thermometerVoteValue({ '7': 8 }, '7', -20, 20), 8);
        assert.equal(thermometerVoteValue({}, '9', -20, 20), 0);
    });

    it('예전 시드는 저장 중에 이미 있는 학생 값을 덮지 않는다', () => {
        assert.deepEqual(applyThermometerLegacySeeds(
            { '4': 12 },
            { '4': 5, '7': 8 },
        ), { '4': 12, '7': 8 });
    });
});
