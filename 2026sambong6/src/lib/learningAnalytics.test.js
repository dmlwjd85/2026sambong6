import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    NO_UNIT_LABEL,
    aggregateQuizResults,
    buildLearningAnalyticsSheets,
    learningAnalyticsHeadline,
    quizResultDocId,
    summarizeQuizRaidSession,
} from './learningAnalytics.js';

const questions = [
    { q: '대한민국의 수도는?', type: 'short', a: '서울', bankId: 'qb_1', unit: '사회 1단원', source: 'excel' },
    { q: '3+5?', type: 'mc', options: ['6', '8', '9'], a: 1, bankId: 'qb_2', unit: '수학 1단원', source: 'excel' },
    { q: '물의 화학식?', type: 'short', a: 'H2O', bankId: 'qb_3', source: 'speedquiz' },
];

function raidState(startTime, subs) {
    return {
        startTime,
        questions,
        participants: [{ id: '1', name: '가' }, { id: '2', name: '나' }, { id: '3', name: '다' }],
        turnSubmissions: subs,
    };
}

describe('학습 분석 — 레이드 결과 정리', () => {
    it('시작 시각이 없으면 문서 ID도 결과도 없다', () => {
        assert.equal(quizResultDocId({}), '');
        assert.equal(summarizeQuizRaidSession({ questions }), null);
        assert.equal(summarizeQuizRaidSession({ startTime: 5, questions: [] }), null);
        assert.equal(quizResultDocId({ startTime: 1700000000000 }), 'raid_1700000000000');
    });

    it('문항별 정답·오답·미제출과 학생별 점수를 센다', () => {
        const st = raidState(1700000000000, {
            0: { 1: ' 서울 ', 2: '부산', 3: '__skip__' },
            1: { 1: 1, 2: 1, 3: 0 },
            // 2번(마지막) 문항은 아직 3번 학생 미제출 표시 전
            2: { 1: 'h2o', 2: 'H2O' },
        });
        const r = summarizeQuizRaidSession(st, { lastTurnSkips: ['3'], nowMs: 1700000100000 });
        assert.equal(r.id, 'raid_1700000000000');
        assert.equal(r.questionCount, 3);
        assert.deepEqual(r.questions.map((q) => [q.answered, q.correct, q.skipped]), [[2, 1, 1], [3, 2, 0], [2, 2, 1]]);
        assert.deepEqual(r.questions[0].marks, { 1: 1, 2: -1, 3: 0 });
        assert.equal(r.questions[2].unit, '');
        assert.deepEqual(r.students['1'], { correct: 3, answered: 3, skipped: 0 });
        assert.deepEqual(r.students['3'], { correct: 0, answered: 1, skipped: 2 });
    });

    it('turnSubmissions 키가 문자열이어도 읽는다', () => {
        const r = summarizeQuizRaidSession(raidState(9, { '0': { 1: '서울' } }));
        assert.equal(r.questions[0].correct, 1);
    });
});

describe('학습 분석 — 회차 모으기', () => {
    const s1 = summarizeQuizRaidSession(raidState(1700000000000, {
        0: { 1: '서울', 2: '부산', 3: '대구' },
        1: { 1: 1, 2: 1, 3: 1 },
        2: { 1: 'H2O', 2: 'CO2', 3: 'O2' },
    }));
    const s2 = summarizeQuizRaidSession(raidState(1700090000000, {
        0: { 1: '서울', 2: '인천', 3: '__skip__' },
        1: { 1: 1, 2: 0, 3: 1 },
        2: { 1: 'H2O', 2: 'H2O', 3: 'X' },
    }));

    it('문항·단원·학생별 정답률을 낮은 순으로 낸다', () => {
        const agg = aggregateQuizResults([s1, s2, null]);
        assert.equal(agg.sessionCount, 2);
        const capital = agg.questions.find((q) => q.bankId === 'qb_1');
        assert.deepEqual([capital.attempts, capital.correct, capital.skipped, capital.rate], [5, 2, 1, 40]);
        assert.equal(agg.questions[0].bankId, 'qb_1');
        const noUnit = agg.units.find((u) => u.unit === NO_UNIT_LABEL);
        assert.equal(noUnit.rate, 50);
        assert.deepEqual(agg.units.map((u) => u.unit), ['사회 1단원', NO_UNIT_LABEL, '수학 1단원']);
        const st1 = agg.students.find((s) => s.id === '1');
        assert.deepEqual([st1.name, st1.sessions, st1.attempts, st1.correct, st1.rate], ['가', 2, 6, 6, 100]);
        assert.equal(st1.weakestUnit, '');
        const st3 = agg.students.find((s) => s.id === '3');
        assert.equal(st3.skipped, 1);
        assert.equal(st3.weakestUnit, NO_UNIT_LABEL);
        assert.deepEqual(agg.students.map((s) => s.id), ['1', '2', '3']);
    });

    it('다시 다룰 문항은 응답 수와 정답률 기준을 모두 넘어야 한다', () => {
        const agg = aggregateQuizResults([s1, s2]);
        assert.deepEqual(agg.weak.map((q) => q.bankId), ['qb_1', 'qb_3']);
        const strict = aggregateQuizResults([s1, s2], { weakMinAttempts: 10 });
        assert.equal(strict.weak.length, 0);
    });

    it('엑셀 시트 5개를 헤더와 함께 만든다', () => {
        const sheets = buildLearningAnalyticsSheets(aggregateQuizResults([s1, s2]), { getName: (sid) => `학생${sid}` });
        assert.deepEqual(sheets.map((s) => s.name), ['요약', '다시다룰문항', '단원별', '문항별', '학생별']);
        const students = sheets.find((s) => s.name === '학생별').rows;
        assert.equal(students[1][1], '학생1');
        sheets.forEach((sh) => assert.ok(sh.rows.length >= 1));
    });

    it('빈 결과에도 안내 문구를 낸다', () => {
        assert.match(learningAnalyticsHeadline(aggregateQuizResults([])), /아직 저장된/);
        assert.match(learningAnalyticsHeadline(aggregateQuizResults([s1, s2])), /2회.*정답률/);
        assert.equal(buildLearningAnalyticsSheets(null).length, 5);
    });
});
