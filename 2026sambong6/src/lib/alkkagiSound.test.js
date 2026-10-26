import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alkkagiHitLevel, alkkagiVoiceGate } from './alkkagiSound.js';

describe('알까기 소리 규칙', () => {
    it('40ms 안에 겹친 충돌음은 하나만 내요', () => {
        const gate = { voices: [], lastHit: -1 };
        assert.equal(alkkagiVoiceGate(gate, 1.0, 0.09), true);
        assert.equal(alkkagiVoiceGate(gate, 1.03, 0.09), false);
        assert.equal(alkkagiVoiceGate(gate, 1.05, 0.09), true);
    });

    it('동시에 4음까지만 내요', () => {
        const gate = { voices: [], lastHit: -1 };
        const ok = [0, 0.001, 0.002, 0.003, 0.004].map((t) => alkkagiVoiceGate(gate, t, 0.5, { kind: 'fall' }));
        assert.deepEqual(ok, [true, true, true, true, false]);
        assert.equal(alkkagiVoiceGate(gate, 0.6, 0.5, { kind: 'fall' }), true);
    });

    it('빠르게 부딪칠수록 세게 나요', () => {
        assert.equal(alkkagiHitLevel(10), 0);
        assert.ok(alkkagiHitLevel(200) < alkkagiHitLevel(800));
        assert.ok(alkkagiHitLevel(5000) <= 1);
    });
});
