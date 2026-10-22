import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
    OX_HEADERS,
    buildOxTemplateWorkbook,
    chooseOxRecord,
    listOxSubjects,
    mergeOxQuestions,
    normalizeOxAnswer,
    OX_TEMPLATE_CSV,
    OX_TEMPLATE_XLSX,
    parseOxQuizAoa,
    parseOxQuizFile,
    parseOxQuizWorkbook,
    pickOxRound,
} from './oxQuiz.js';
import { readFileSync } from 'node:fs';

describe('OX 문제 은행', () => {
    it('잘못된 행은 시트 행 번호로 알리고 문제를 갈아 끼우지 않습니다', () => {
        const parsed = parseOxQuizAoa([
            OX_HEADERS,
            ['과학', '물은 100도에 끓는다.', 'O', '1기압', '상태', '하'],
            ['', '빈 과목', 'O', '', '', ''],
            ['사회', '', '예', '', '', ''],
        ]);
        assert.deepEqual(parsed.questions, []);
        assert.match(parsed.errors.join('\n'), /3행: 과목/);
        assert.match(parsed.errors.join('\n'), /4행: 문제/);
        assert.match(parsed.errors.join('\n'), /4행: 정답/);
    });

    it('빈 행은 건너뛰고 O/X 문제를 읽습니다', () => {
        const parsed = parseOxQuizAoa([
            OX_HEADERS,
            ['과학', '물은 100도에 끓는다.', 'o', '', '', ''],
            ['', '', '', '', '', ''],
            ['사회', '수도는 부산이다.', '✕', '서울', '우리나라', '하'],
        ]);
        assert.equal(parsed.errors.length, 0);
        assert.equal(parsed.questions.length, 2);
        assert.equal(parsed.questions[0].answer, 'O');
        assert.equal(parsed.questions[1].answer, 'X');
        assert.equal(parsed.questions[1].id, 'L4');
    });

    it('양식의 문제 시트를 같은 규칙으로 읽습니다', () => {
        const wb = buildOxTemplateWorkbook();
        assert.ok(wb.SheetNames.includes('문제'));
        assert.ok(wb.SheetNames.includes('작성안내'));
        const parsed = parseOxQuizWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'buffer');
        assert.equal(parsed.errors.length, 0);
        assert.deepEqual(listOxSubjects(parsed.questions), ['과학', '사회']);
        assert.equal(normalizeOxAnswer('맞음'), 'O');
        assert.equal(normalizeOxAnswer(''), '');
    });

    it('과목을 고르지 않으면 출제하지 않고 고른 과목만 무작위로 뽑습니다', () => {
        const questions = [
            { id: '1', subject: '과학', prompt: 'a', answer: 'O' },
            { id: '2', subject: '사회', prompt: 'b', answer: 'X' },
            { id: '3', subject: '과학', prompt: 'c', answer: 'O' },
        ];
        const none = pickOxRound({ questions, subjects: [], count: 5 });
        assert.equal(none.questions.length, 0);
        assert.match(none.error, /과목/);
        const round = pickOxRound({
            questions,
            subjects: ['과학'],
            count: 5,
            random: true,
            rng: () => 0,
        });
        assert.equal(round.error, '');
        assert.ok(round.questions.every((item) => item.subject === '과학'));
        assert.equal(round.questions.length, 2);
    });

    it('추가는 기존 문제를 남기고 id가 겹치지 않게 붙입니다', () => {
        const merged = mergeOxQuestions(
            [{ id: 'L2', subject: '과학', prompt: '기존', answer: 'O' }],
            [{ id: 'L2', subject: '사회', prompt: '추가', answer: 'X' }],
        );
        assert.equal(merged.error, '');
        assert.equal(merged.questions.length, 2);
        assert.equal(merged.questions[0].prompt, '기존');
        assert.equal(merged.questions[0].id, 'L2');
        assert.notEqual(merged.questions[1].id, 'L2');
        assert.equal(merged.questions[1].prompt, '추가');
    });

    it('양식 받기는 public/ox 파일을 가리키고 그 파일을 그대로 읽습니다', () => {
        assert.equal(OX_TEMPLATE_XLSX, 'ox/ox-quiz-template.xlsx');
        assert.equal(OX_TEMPLATE_CSV, 'ox/ox-quiz-template.csv');
        const xlsx = readFileSync(new URL('../../public/ox/ox-quiz-template.xlsx', import.meta.url));
        const csv = readFileSync(new URL('../../public/ox/ox-quiz-template.csv', import.meta.url));
        const fromXlsx = parseOxQuizFile(xlsx, 'ox-quiz-template.xlsx');
        const fromCsv = parseOxQuizFile(csv, 'ox-quiz-template.csv');
        assert.equal(fromXlsx.errors.length, 0);
        assert.equal(fromCsv.errors.length, 0);
        assert.ok(fromXlsx.questions.length >= 1);
        assert.equal(fromCsv.questions[0].answer, fromXlsx.questions[0].answer);
    });

    it('최고 기록은 맞힌 수가 우선이고 같으면 더 짧은 시간입니다', () => {
        const slow = { correct: 4, elapsedMs: 9000 };
        const fast = { correct: 4, elapsedMs: 4000 };
        const more = { correct: 5, elapsedMs: 20000 };
        assert.equal(chooseOxRecord(slow, fast), fast);
        assert.equal(chooseOxRecord(fast, more), more);
        assert.equal(chooseOxRecord(more, fast), more);
    });
});
