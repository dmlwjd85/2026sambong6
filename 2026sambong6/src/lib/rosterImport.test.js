import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ROSTER_MAX,
    normalizeRosterGender,
    normalizeRosterId,
    parseRosterAoa,
    planRosterImport,
    rosterTemplateRows,
} from './rosterImport.js';

describe('학생 명단 올리기', () => {
    it('성별·번호 칸을 읽는다', () => {
        assert.equal(normalizeRosterGender('여'), 'F');
        assert.equal(normalizeRosterGender(' F '), 'F');
        assert.equal(normalizeRosterGender('남학생'), 'M');
        assert.equal(normalizeRosterGender('?'), null);
        assert.equal(normalizeRosterId('03'), '3');
        assert.equal(normalizeRosterId('12번'), '12');
        assert.equal(normalizeRosterId('7.0'), '7');
        assert.equal(normalizeRosterId('0'), '');
        assert.equal(normalizeRosterId('100'), '');
        assert.equal(normalizeRosterId('가'), '');
    });

    it('서식 예시를 그대로 읽는다', () => {
        const { roster, errors } = parseRosterAoa(rosterTemplateRows());
        assert.deepEqual(errors, []);
        assert.deepEqual(roster.map((r) => [r.id, r.name, r.gender, r.label, r.active]), [
            ['1', '홍길동', 'M', '', true],
            ['2', '김영희', 'F', '', true],
            ['3', '이철수', 'M', '반장', true],
        ]);
    });

    it('헤더 이름이 달라도 열 순서와 무관하게 읽는다', () => {
        const { roster } = parseRosterAoa([
            ['성명', '비고', '학번', '성별'],
            ['가나', '', '2', 'F'],
            ['다라', '', '1', 'M'],
        ]);
        assert.deepEqual(roster.map((r) => [r.id, r.name, r.gender]), [['1', '다라', 'M'], ['2', '가나', 'F']]);
    });

    it('헤더 없이 번호부터 시작하는 표도 읽는다', () => {
        const { roster, errors } = parseRosterAoa([[1, '가', '여'], [2, '나', '남']]);
        assert.deepEqual(errors, []);
        assert.equal(roster.length, 2);
        assert.equal(roster[0].gender, 'F');
        assert.match(parseRosterAoa([['아무거나', 'x']]).errors[0], /이름/);
    });

    it('번호가 없으면 다음 번호를 붙이고, 겹치거나 잘못된 번호·빈 이름은 오류로 낸다', () => {
        const { roster, errors, warnings } = parseRosterAoa([
            ['번호', '이름', '성별'],
            ['1', '가', ''],
            ['', '나', '몰라'],
            ['1', '다', ''],
            ['x', '라', ''],
            ['5', '', ''],
            ['', '', ''],
        ]);
        assert.deepEqual(roster.map((r) => r.id), ['1', '2']);
        assert.equal(roster[1].gender, 'M');
        assert.equal(errors.length, 3);
        assert.ok(warnings.some((w) => /2번을 붙였습니다/.test(w)));
        assert.ok(warnings.some((w) => /몰라/.test(w)));
    });

    it(`최대 ${ROSTER_MAX}명까지만 받는다`, () => {
        const rows = [['번호', '이름']];
        for (let i = 1; i <= ROSTER_MAX + 3; i++) rows.push([i, `학생${i}`]);
        const { roster, errors } = parseRosterAoa(rows);
        assert.equal(roster.length, ROSTER_MAX);
        assert.equal(errors.length, 1);
    });

    it('이름은 공백을 정리하고 길이를 줄인다', () => {
        const { roster } = parseRosterAoa([['번호', '이름'], [1, '  김   가나  '], [2, '가'.repeat(30)]]);
        assert.equal(roster[0].name, '김 가나');
        assert.equal(roster[1].name.length, 20);
    });

    it('기존 명단에 반영할 때 빠진 학생은 지우지 않고 비활성으로 남긴다', () => {
        const current = [
            { id: '1', name: '학생 1', gender: 'M', label: '', active: true },
            { id: '2', name: '철수', gender: 'M', label: '', active: true },
            { id: '9', name: '전학생', gender: 'F', label: '', active: false },
        ];
        const incoming = parseRosterAoa([['번호', '이름'], [1, '영희'], [3, '민수']]).roster;
        const plan = planRosterImport(current, incoming);
        assert.deepEqual(plan.added, ['3']);
        assert.deepEqual(plan.renamed, [{ id: '1', from: '학생 1', to: '영희' }]);
        assert.deepEqual(plan.deactivated, ['2']);
        assert.deepEqual(plan.roster.map((r) => [r.id, r.name, r.active]), [
            ['1', '영희', true],
            ['2', '철수', false],
            ['3', '민수', true],
            ['9', '전학생', false],
        ]);
    });
});
