import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
    QUIZ_BANK_HEADERS,
    QUIZ_BANK_MAX,
    QUIZ_RAID_DEFAULT_COUNT,
    QUIZ_RAID_MAX_COUNT,
    buildQuizBankTemplateWorkbook,
    computeQuizRaidReward,
    countQuizBankBySource,
    fillGoldenBellSlotsFromBank,
    gradeQuizRaidAnswer,
    mergeQuizBank,
    normalizeQuizAnswer,
    parseQuizBankAoa,
    parseQuizBankWorkbook,
    pickRandomQuizQuestions,
    questionFromGoldenBell,
    questionFromLegacyRaid,
    questionFromSpeedQuiz,
    quizBankTemplateExampleRows,
    sanitizeQuizBank,
    toRaidSessionQuestion,
} from './quizBank.js';

describe('문제 은행 정규화', () => {
    it('골든벨·스피드퀴즈와 같이 공백·대소문자를 무시한다', () => {
        assert.equal(normalizeQuizAnswer('  Hello   World  '), 'hello world');
    });

    it('주관식·객관식을 걸러 저장한다', () => {
        const bank = sanitizeQuizBank([
            { q: '수도는?', a: '서울', source: 'goldenbell' },
            { q: '1+1', a: '2', options: ['1', '2', '3', '4'], answerIndex: 1, source: 'excel' },
            { q: '', a: '없음' },
            { q: '보기만 있음', options: ['가'] },
        ]);
        assert.equal(bank.length, 2);
        assert.equal(bank[0].type, 'short');
        assert.equal(bank[1].type, 'mc');
        assert.equal(bank[1].a, '2');
    });

    it('같은 문제는 나중에 올린 정답으로 덮어 쓴다', () => {
        const merged = mergeQuizBank(
            [{ q: '수도는?', a: '부산', source: 'excel', addedAt: 1 }],
            [{ q: '수도는?', a: '서울', source: 'goldenbell', addedAt: 2 }],
        );
        assert.equal(merged.length, 1);
        assert.equal(merged[0].a, '서울');
        assert.equal(merged[0].source, 'goldenbell');
        assert.equal(merged[0].addedAt, 1);
    });

    it('출처별 개수를 센다', () => {
        const c = countQuizBankBySource([
            questionFromGoldenBell({ q: 'Q1', a: 'A1' }),
            questionFromSpeedQuiz({ question: 'Q2', answer: 'A2' }),
            { q: 'Q3', a: 'A3', source: 'excel' },
        ]);
        assert.equal(c.total, 3);
        assert.equal(c.goldenbell, 1);
        assert.equal(c.speedquiz, 1);
        assert.equal(c.excel, 1);
    });
});

describe('엑셀 서식 파싱', () => {
    it('서식 헤더와 예시 행이 파싱된다', () => {
        const parsed = parseQuizBankAoa(quizBankTemplateExampleRows());
        assert.equal(parsed.errors.length, 0);
        assert.equal(parsed.questions.length, 3);
        assert.equal(parsed.questions[0].type, 'short');
        assert.equal(parsed.questions[0].source, 'goldenbell');
        assert.equal(parsed.questions[1].type, 'mc');
        assert.equal(parsed.questions[1].a, '8');
        assert.equal(parsed.questions[1].answerIndex, 2);
        assert.equal(parsed.questions[2].source, 'speedquiz');
    });

    it('xlsx 워크북 왕복이 된다', () => {
        const wb = buildQuizBankTemplateWorkbook();
        assert.ok(wb.SheetNames.includes('문제은행'));
        assert.ok(wb.SheetNames.includes('작성안내'));
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const parsed = parseQuizBankWorkbook(buf, { name: '서식.xlsx' });
        assert.equal(parsed.questions.length, 3);
        assert.deepEqual(QUIZ_BANK_HEADERS.slice(0, 2), ['문제', '정답']);
    });

    it('문제 열이 없으면 오류를 낸다', () => {
        const parsed = parseQuizBankAoa([['정답'], ['서울']]);
        assert.equal(parsed.questions.length, 0);
        assert.ok(parsed.errors[0].includes('문제'));
    });
});

describe('퀴즈 레이드 출제·채점', () => {
    it('은행에서 무작위로 n문항을 고른다', () => {
        const bank = [
            { q: 'A?', a: '1' },
            { q: 'B?', a: '2' },
            { q: 'C?', a: '3' },
        ];
        const seq = [0.9, 0.1, 0.5];
        let i = 0;
        const rng = () => seq[i++ % seq.length];
        const picked = pickRandomQuizQuestions(bank, 2, rng);
        assert.equal(picked.length, 2);
        const all = pickRandomQuizQuestions(bank, 99, rng);
        assert.equal(all.length, 3);
        assert.ok(QUIZ_RAID_DEFAULT_COUNT <= QUIZ_RAID_MAX_COUNT);
        assert.ok(QUIZ_BANK_MAX >= 3);
    });

    it('객관식 보기 순서를 섞고 정답 인덱스를 맞춘다', () => {
        const item = {
            q: '1+1',
            a: '2',
            options: ['1', '2', '3', '4'],
            answerIndex: 1,
            source: 'excel',
        };
        const seq = [0, 0, 0, 0];
        let i = 0;
        const rng = () => seq[i++ % seq.length];
        const session = toRaidSessionQuestion(item, rng);
        assert.equal(session.type, 'mc');
        assert.equal(session.options[session.a], '2');
        assert.equal(gradeQuizRaidAnswer(session, session.a), true);
        assert.equal(gradeQuizRaidAnswer(session, (session.a + 1) % 4), false);
    });

    it('주관식은 정규화해서 채점한다', () => {
        const session = toRaidSessionQuestion({ q: '수도?', a: '서울', source: 'goldenbell' });
        assert.equal(session.type, 'short');
        assert.equal(gradeQuizRaidAnswer(session, '  서울  '), true);
        assert.equal(gradeQuizRaidAnswer(session, '부산'), false);
    });

    it('예전 레이드 객관식 초안을 은행 문항으로 바꾼다', () => {
        const item = questionFromLegacyRaid({
            q: '색?',
            options: ['빨강', '파랑', '노랑', '초록'],
            a: 1,
        });
        assert.equal(item.type, 'mc');
        assert.equal(item.a, '파랑');
        assert.equal(item.answerIndex, 1);
    });

    it('정답 비율로 보상을 계산하고 무기는 XP만 가산한다', () => {
        const r = computeQuizRaidReward({ correct: 4, total: 5, rewardMaxXp: 100, rewardMaxBong: 20 });
        assert.equal(r.xp, 80);
        assert.equal(r.bong, 16);
        const armed = computeQuizRaidReward({
            correct: 4, total: 5, rewardMaxXp: 100, rewardMaxBong: 20, weaponBonus: 50,
        });
        assert.equal(armed.xp, 100);
        assert.equal(armed.bong, 16);
    });

    it('골든벨 입력칸은 앞에서 10문항만 채운다', () => {
        const many = Array.from({ length: 12 }, (_, i) => ({ q: `Q${i + 1}`, a: `A${i + 1}`, rewardXp: 7 }));
        const slots = fillGoldenBellSlotsFromBank(many, 10);
        assert.equal(slots.length, 10);
        assert.equal(slots[0].q, 'Q1');
        assert.equal(slots[0].rewardXp, 7);
        assert.equal(slots[9].originalIndex, 9);
    });
});
