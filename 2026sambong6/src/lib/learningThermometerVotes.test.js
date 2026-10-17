import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    pickThermometerDisplayValues,
    planThermometerLegacyVoteWrites,
    resolveThermometerSettlementValue,
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
