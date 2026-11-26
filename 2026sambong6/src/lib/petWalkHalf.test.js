// 산책 보상 반으로(2026-11-27): 받는 순간 ÷2, 내림, 최소 1봉. 탐험 보상은 그대로.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as P from './petGame.js';
import * as R from './petRaid.js';

const T0 = new Date(2026, 10, 27, 9).getTime();
const DAY = '2026-11-27';
const pet = (extra = {}) => P.sanitizePet({ v: 1, phase: 'pet', species: 'emberkit', name: 'x', stage: 1, level: 1, exp: 0, enhance: 0, full: 90, fedAt: T0, bornAt: T0, ...extra });

describe('산책 보상 반으로', () => {
    it('반 계산: 내림, 최소 1, 0은 0', () => {
        assert.deepEqual([0, 1, 2, 3, 4, 5, 9, 15, -3].map(P.halfWalkBong), [0, 1, 1, 1, 2, 2, 4, 7, 0]);
    });
    it('받는 봉은 언제나 설정으로 뽑은 봉의 반(내림, 최소 1)이에요', () => {
        const p = pet({ stage: 3, level: 40, enhance: 10 });
        const raw = P.petWalkRawRange(p);
        for (let k = 0; k <= raw.max - raw.min; k += 1) {
            const rnd = () => (k + 0.5) / (raw.max - raw.min + 1);
            assert.equal(P.walkPet(p, { now: T0, today: DAY, rnd }).gain, P.halfWalkBong(raw.min + k));
        }
    });
    it('마스터가 바꾼 범위에도 반이 적용돼요. 0으로 꺼 둔 산책은 0봉이에요', () => {
        const walk = { min: 10, max: 20, step: 1000, cap: 40 };
        assert.deepEqual(P.petWalkRange(pet(), walk), { min: 5, max: 10 });
        assert.equal(P.walkPet(pet(), { now: T0, today: DAY, walk, rnd: () => 0 }).gain, 5);
        const off = { min: 0, max: 0, step: 1000, cap: 0 };
        assert.equal(P.walkPet(pet(), { now: T0, today: DAY, walk: off, rnd: () => 0.5 }).gain, 0);
    });
    it('오늘 이미 산책한 펫은 다시 못 받고, 예전에 받은 기록(earned)은 그대로예요', () => {
        const done = pet({ walkDate: DAY, earned: 123 });
        const r = P.walkPet(done, { now: T0, today: DAY });
        assert.equal(r.ok, false);
        assert.equal(r.error, 'walked');
        assert.equal(r.gain, 0);
        assert.equal(P.sanitizePet(done).earned, 123);
        const next = P.walkPet(done, { now: T0, today: '2026-11-28', rnd: () => 0.999 });
        assert.equal(next.pet.earned, 123 + next.gain);
    });
    it('화면 예상 범위(petView.walkRange)도 받는 봉과 같아요', () => {
        const p = pet({ stage: 2, level: 15, enhance: 3 });
        const v = P.petView(p, T0, DAY);
        const seen = new Set();
        for (let i = 0; i < 50; i += 1) seen.add(P.walkPet(p, { now: T0, today: DAY, rnd: () => i / 50 }).gain);
        assert.equal(Math.min(...seen), v.walkRange.min);
        assert.equal(Math.max(...seen), v.walkRange.max);
    });
    it('탐험 보상과 규칙 번호는 그대로예요', () => {
        assert.equal(R.RAID_RULES, 6);
        assert.deepEqual(R.RAID_DEFAULT_STAGES.map((s) => s.first).slice(0, 3), [3, 4, 5]);
        assert.equal(R.RAID_DEFAULT_STAGES.reduce((t, s) => t + s.first, 0), 606);
        assert.equal(R.RAID_DEFAULT_STAGES.reduce((t, s) => t + s.repeat, 0), 122);
    });
});
