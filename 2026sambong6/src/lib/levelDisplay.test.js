import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { levelXpForDisplay } from './levelDisplay.js';

const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
const exactLine = src.split('\n').find((l) => l.includes('function calculateExactLevel(xp) {'));
const levelDataSrc = src.slice(src.indexOf('const LEVEL_DATA = ['), src.indexOf('];', src.indexOf('const LEVEL_DATA = [')) + 2);
const gS = src.indexOf('function getLevelInfo(xp) {');
const getLevelInfoSrc = src.slice(gS, src.indexOf('index: LEVEL_DATA.length-1}; \n        }', gS) + 'index: LEVEL_DATA.length-1}; \n        }'.length);
// eslint-disable-next-line no-new-func
const { calculateExactLevel, getLevelInfo } = new Function(`${exactLine}\n${levelDataSrc}\n${getLevelInfoSrc}\nreturn { calculateExactLevel, getLevelInfo };`)();

describe('Lv 표시용 경험치(levelXpForDisplay)', () => {
    it('경험치 계산식은 그대로예요(#79와 같은 식)', () => {
        assert.equal(exactLine.trim(), 'function calculateExactLevel(xp) { return Math.min(100, Math.max(1, Math.floor(1 + Math.sqrt((xp || 0) / 4.04)))); }');
    });

    it('없거나 0 이하이거나 숫자가 아니면 0으로 봐요', () => {
        for (const v of [undefined, null, 0, -0, -50, -1e9, NaN, 'abc', Infinity, -Infinity, {}]) {
            assert.equal(levelXpForDisplay(v), 0, String(v));
        }
    });

    it('양수 경험치는 그대로 넘겨서 Lv가 바뀌지 않아요', () => {
        for (const v of [1, 4, 5, 120, 1499, 1500, 4499, 40000, 999999]) {
            assert.equal(levelXpForDisplay(v), v);
            assert.equal(calculateExactLevel(levelXpForDisplay(v)), calculateExactLevel(v || 0));
            assert.equal(getLevelInfo(levelXpForDisplay(v)).info.ring, getLevelInfo(v || 0).info.ring);
        }
    });

    it('xp가 -50이어도 Lv.1 새내기로 보여요(예전엔 Lv.NaN)', () => {
        assert.ok(Number.isNaN(calculateExactLevel(-50)), '고치기 전 계산은 음수에서 NaN이에요');
        assert.equal(calculateExactLevel(levelXpForDisplay(-50)), 1);
        assert.equal(getLevelInfo(levelXpForDisplay(-50)).info.ring, getLevelInfo(0).info.ring);
        assert.equal(calculateExactLevel(levelXpForDisplay(undefined)), 1);
    });

    it('광장 카드와 대시보드가 같은 표시용 값을 써요', () => {
        assert.match(src, /const lvXp = levelXpForDisplay\(displayData\.xp\);\s*const lv = getLevelInfo\(lvXp\);\s*const exactLv = calculateExactLevel\(lvXp\);/);
        assert.match(src, /const xp = window\.playerState\.xp \|\| 0;\s*const lvXp = levelXpForDisplay\(xp\);\s*const lvInfo = getLevelInfo\(lvXp\);\s*const exactLv = calculateExactLevel\(lvXp\);/);
    });
});
