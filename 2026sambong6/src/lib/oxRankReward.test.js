import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as R from './oxRankReward.js';

// 2026-11-17(화) 한국 시각
const kst = (ymd, hh, mm) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);

describe('OX 랭킹 보상', () => {
    it('기본값: 평일 14:40, 1~5등 100/80/60/40/20 XP와 10/8/6/4/2봉', () => {
        const c = R.sanitizeOxRankReward(null);
        assert.deepEqual([c.enabled, c.hour, c.minute], [true, 14, 40]);
        assert.deepEqual(c.prizes, [{ xp: 100, bong: 10 }, { xp: 80, bong: 8 }, { xp: 60, bong: 6 }, { xp: 40, bong: 4 }, { xp: 20, bong: 2 }]);
        const m = R.sanitizeOxRankReward({ enabled: false, hour: 30, minute: '', prizes: [{ xp: 9999, bong: -3 }] });
        assert.deepEqual([m.enabled, m.hour, m.minute, m.prizes[0].xp, m.prizes[0].bong, m.prizes[1].xp], [false, 23, 40, 500, 0, 80]);
    });

    it('동점은 같은 등수로 모두 받고, 5등 안에 걸친 동점도 모두 받아요', () => {
        const rows = [
            { id: '12', best: 201 }, { id: '3', best: 114 }, { id: '1', best: 21 }, { id: '8', best: 17 },
            { id: '6', best: 10 }, { id: '9', best: 10 }, { id: '11', best: 8 }, { id: '2', best: 0 }, { id: 'gm', best: 300 },
        ];
        const w = R.oxRankRewardWinners(rows, null, { ids: ['1', '2', '3', '6', '8', '9', '11', '12'] });
        assert.deepEqual(w.map((x) => [x.id, x.place, x.xp, x.bong]), [
            ['12', 1, 100, 10], ['3', 2, 80, 8], ['1', 3, 60, 6], ['8', 4, 40, 4], ['6', 5, 20, 2], ['9', 5, 20, 2],
        ]);
        const tie = R.oxRankRewardWinners([{ id: 'a', best: 9 }, { id: 'b', best: 9 }, { id: 'c', best: 5 }], null);
        assert.deepEqual(tie.map((x) => [x.id, x.place, x.bong]), [['a', 1, 10], ['b', 1, 10], ['c', 3, 6]]);
    });

    it('지급할 날: 평일 정해진 시각 뒤 그날 자정 전까지, 주말·쉬는 날·끈 때는 없어요', () => {
        assert.equal(R.oxRankRewardDueYmd(kst('2026-11-17', 14, 39), null), '');
        assert.equal(R.oxRankRewardDueYmd(kst('2026-11-17', 14, 40), null), '2026-11-17');
        assert.equal(R.oxRankRewardDueYmd(kst('2026-11-17', 23, 59), null), '2026-11-17');
        assert.equal(R.oxRankRewardDueYmd(kst('2026-11-21', 15, 0), null), '', '토요일');
        assert.equal(R.oxRankRewardDueYmd(kst('2026-11-17', 15, 0), null, { offDay: (d) => d === '2026-11-17' }), '');
        assert.equal(R.oxRankRewardDueYmd(kst('2026-11-17', 15, 0), { enabled: false }), '');
        assert.equal(R.oxRankRewardDueYmd(kst('2026-11-17', 9, 0), { hour: 9, minute: 0 }), '2026-11-17');
    });

    it('타이머: 다음 지급 시각 2초 뒤', () => {
        assert.equal(R.oxRankRewardDelayMs(kst('2026-11-17', 14, 30), null), 10 * 60000 + 2000);
        assert.equal(R.oxRankRewardDelayMs(kst('2026-11-17', 14, 41), null), (24 * 60 - 1) * 60000 + 2000);
    });
});
