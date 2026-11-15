import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MATH_UNITS, longDivisionSteps, normalizeMathParams, parseBlockGrid, parseGraphItems, renderMathConcept, simplifyFraction } from './mathConcept.js';

describe('6학년 수학 개념 그림', () => {
    it('열두 단원의 모든 개념이 기본값으로 그려져요', () => {
        assert.equal(MATH_UNITS.length, 12);
        let count = 0;
        MATH_UNITS.forEach((u) => u.concepts.forEach((c) => {
            const r = renderMathConcept(u.id, c.id, {});
            assert.ok(r.svg.startsWith('<svg'), `${u.id}/${c.id}`);
            assert.ok(r.svg.trim().endsWith('</svg>'));
            assert.ok(!/NaN|undefined|Infinity/.test(r.svg), `${u.id}/${c.id} 에 잘못된 숫자`);
            assert.ok(r.caption.length > 5);
            count += 1;
        }));
        assert.ok(count >= 20);
    });
    it('범위 끝 값으로도 그려져요', () => {
        MATH_UNITS.forEach((u) => u.concepts.forEach((c) => {
            ['min', 'max'].forEach((edge) => {
                const raw = {};
                c.params.forEach((p) => { if (p.type === 'int' || p.type === 'num') raw[p.key] = p[edge]; else if (p.type === 'select') raw[p.key] = p.options[edge === 'min' ? 0 : p.options.length - 1][0]; });
                const r = renderMathConcept(u.id, c.id, raw);
                assert.ok(!/NaN|undefined|Infinity/.test(r.svg), `${u.id}/${c.id} ${edge}`);
            });
        }));
    });
    it('입력값을 범위 안으로 다듬어요', () => {
        const c = MATH_UNITS[0].concepts[0];
        assert.deepEqual(normalizeMathParams(c, { a: 99, b: 'x' }), { a: 9, b: 4 });
        assert.deepEqual(normalizeMathParams(c, { a: -3, b: 2.6 }), { a: 1, b: 3 });
    });
    it('분수 약분과 대분수', () => {
        assert.deepEqual(simplifyFraction(6, 8), { n: 3, d: 4, whole: 0, rest: 3, isInt: false });
        assert.deepEqual(simplifyFraction(7, 2), { n: 7, d: 2, whole: 3, rest: 1, isInt: false });
        assert.equal(simplifyFraction(8, 4).isInt, true);
        assert.match(renderMathConcept('6-2-1', 'fracdivfrac', { a: 3, b: 4, c: 1, d: 8 }).caption, /= 6 ÷ 1 = 6$/);
    });
    it('세로셈: 몫과 과정', () => {
        const a = longDivisionSteps('8.64', 4);
        assert.equal(a.quotient, '2.16');
        assert.equal(a.remainder, 0);
        assert.deepEqual(a.steps.map((s) => s.sub), [8, 4, 24]);
        assert.equal(longDivisionSteps('8.64', 12).quotient, '0.72');
        assert.equal(longDivisionSteps('7', 4).quotient, '1.75'); // 0을 내려 계산
        assert.equal(longDivisionSteps('6.03', 3).quotient, '2.01');
        assert.match(renderMathConcept('6-1-3', 'decdivnat', { a: 8.64, b: 4 }).caption, /8\.64 ÷ 4 = 2\.16/);
        assert.match(renderMathConcept('6-2-2', 'decdivdec', { a: 1.44, b: 0.6 }).caption, /= 14\.4 ÷ 6 = 2\.4/);
    });
    it('그래프 백분율의 합은 100', () => {
        const g = parseGraphItems('떡볶이:12, 김밥:8, 라면:6, 기타:4');
        assert.equal(g.total, 30);
        assert.equal(g.items.reduce((s, x) => s + x.pct, 0), 100);
        assert.deepEqual(g.items.map((x) => x.pct), [40, 27, 20, 13]);
        assert.equal(parseGraphItems('엉뚱한 글').items.length, 0);
    });
    it('쌓기나무 층수 읽기와 개수', () => {
        assert.deepEqual(parseBlockGrid('3 2 1 / 2 1 / 1'), [[3, 2, 1], [2, 1, 0], [1, 0, 0]]);
        assert.match(renderMathConcept('6-2-3', 'blocks', { grid: '3 2 1 / 2 1 0 / 1 0 0' }).caption, /모두 10개/);
    });
    it('도형·넓이 계산', () => {
        assert.match(renderMathConcept('6-1-2', 'prism', { n: '6' }).caption, /면 8개, 모서리 18개, 꼭짓점 12개/);
        assert.match(renderMathConcept('6-1-2', 'pyramid', { n: '5' }).caption, /면 6개, 모서리 10개, 꼭짓점 6개/);
        assert.match(renderMathConcept('6-1-6', 'volume', { w: 4, d: 3, h: 2 }).caption, /= 24 cm³/);
        assert.match(renderMathConcept('6-1-6', 'net', { w: 4, d: 3, h: 2 }).caption, /= 52 cm²/);
        assert.match(renderMathConcept('6-2-5', 'area', { r: 5, n: '16', pi: '3.14' }).caption, /= 78\.5$/);
        assert.match(renderMathConcept('6-2-5', 'circum', { d: 10, pi: '3.1' }).caption, /= 31$/);
        assert.match(renderMathConcept('6-2-4', 'share', { total: 20, a: 2, b: 3 }).caption, /8 과 12/);
        assert.match(renderMathConcept('6-1-4', 'ratio', { a: 3, b: 4 }).caption, /75 %/);
    });
});
