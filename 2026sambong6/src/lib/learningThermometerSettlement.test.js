import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    allowLegacyThermometerValues,
    thermometerValueSource,
} from './learningThermometerSettlement.js';

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

    it('표가 있으면 0인 학생을 예전 값으로 되돌리지 않습니다', () => {
        const source = thermometerValueSource({
            voteValues: { '2': 0 },
            parentValues: {},
            legacyValues: legacy,
            allowLegacy: true,
        });
        assert.equal(source.kind, 'votes');
        assert.equal(source.values['2'], 0);
        assert.equal(source.values['5'], undefined);
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
});
