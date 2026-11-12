import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    OX_CLASS_GRACE_MS,
    OX_CLASS_ABANDON_MS,
    OX_CLASS_REVEAL_MS,
    OX_CLASS_STALL_MS,
    buildClassRound,
    classRoundStalled,
    isClassRoundAbandoned,
    sanitizeClassLive,
    canPickNow,
    classConditionSummary,
    classRemainingMs,
    finishPatch,
    isClassRoundActive,
    isClassRoundVisible,
    joinDoc,
    nextPatch,
    normalizeClassConditions,
    rankClassRound,
    revealPatch,
    revealedCount,
    scoreClassEntry,
    startPatch,
    tallyClassQuestion,
    teacherShouldAdvance,
    teacherShouldReveal,
} from './oxQuizClass.js';

const BANK = [
    { id: 'L2', subject: '과학', prompt: '물은 100도에 끓는다.', answer: 'O', explain: '1기압' },
    { id: 'L3', subject: '과학', prompt: '해는 서쪽에서 뜬다.', answer: 'X', explain: '동쪽' },
    { id: 'L4', subject: '사회', prompt: '수도는 부산이다.', answer: 'X', explain: '서울' },
    { id: 'L5', subject: '과학', prompt: '얼음은 물보다 가볍다.', answer: 'O', explain: '' },
    { id: 'L6', subject: '과학', prompt: '달은 스스로 빛난다.', answer: 'X', explain: '반사' },
    { id: 'L7', subject: '과학', prompt: '식물은 광합성을 한다.', answer: 'O', explain: '' },
];

function apply(live, patch) {
    assert.ok(patch, 'patch가 있어야 해요');
    return { ...live, ...patch };
}

function sheetRound(extra = {}) {
    const { live, error } = buildClassRound({
        questions: BANK,
        subjects: ['과학'],
        conditions: { count: 5, timeSec: 10, order: 'sheet', ...extra },
        now: 1000,
        roundId: 'oxr_t',
    });
    assert.equal(error, '');
    return live;
}

describe('OX 함께 풀기 조건', () => {
    it('모르는 값은 기본 조건으로 바꿔요', () => {
        assert.deepEqual(normalizeClassConditions({ timeSec: 7, count: 3, lives: 9, order: 'x', advance: 'y' }),
            { timeSec: 15, count: 10, lives: 0, order: 'random', advance: 'auto' });
        assert.deepEqual(normalizeClassConditions({ timeSec: 20, count: 5, lives: 2, order: 'sheet', advance: 'manual' }),
            { timeSec: 20, count: 5, lives: 2, order: 'sheet', advance: 'manual' });
    });

    it('고른 과목·문항 수·순서대로 모두 같은 문제 목록을 만들어요', () => {
        const live = sheetRound();
        assert.equal(live.status, 'lobby');
        assert.deepEqual(live.items.map((i) => i.id), ['L2', 'L3', 'L5', 'L6', 'L7']);
        assert.equal(live.total, 5);
        assert.equal(live.timeSec, 10);
        assert.equal(classConditionSummary(live), '5문제 · 한 문제 10초 · 틀려도 끝까지 · 자동으로 넘어가요');
        const r = buildClassRound({ questions: BANK, subjects: ['과학'], conditions: { count: 5, order: 'random' }, rng: () => 0, roundId: 'a' });
        assert.equal(r.live.items.length, 5);
        assert.ok(r.live.items.every((i) => i.subject === '과학'));
    });

    it('과목을 안 고르면 판을 열지 않아요', () => {
        const r = buildClassRound({ questions: BANK, subjects: [], conditions: {} });
        assert.equal(r.live, null);
        assert.match(r.error, /과목/);
    });
});

describe('OX 함께 풀기 진행', () => {
    it('대기실 → 문제 → 정답 → 다음 문제 → 결과 순서로 가요', () => {
        let live = sheetRound();
        assert.equal(isClassRoundActive(live), true);
        assert.equal(revealedCount(live), 0);
        assert.equal(nextPatch(live, [], 0), null);
        live = apply(live, startPatch(live, 2000));
        assert.equal(live.status, 'question');
        assert.equal(live.index, 0);
        assert.equal(startPatch(live, 2000), null, '이미 시작한 판은 다시 시작하지 않아요');
        assert.equal(revealedCount(live), 0);
        for (let i = 0; i < 5; i += 1) {
            live = apply(live, revealPatch(live, [], 3000 + i));
            assert.equal(live.status, 'reveal');
            assert.equal(revealedCount(live), i + 1);
            live = apply(live, nextPatch(live, [], 4000 + i));
        }
        assert.equal(live.status, 'done');
        assert.equal(live.revealed, 5);
        assert.equal(isClassRoundActive(live), false);
        assert.equal(isClassRoundVisible(live), true);
    });

    it('시간이 끝나면(여유 시간 포함) 선생님 기기가 정답을 공개해요', () => {
        let live = sheetRound();
        live = apply(live, startPatch(live, 10000));
        assert.equal(teacherShouldReveal(live, 10000 + 10000, []), false);
        assert.equal(teacherShouldReveal(live, 10000 + 10000 + OX_CLASS_GRACE_MS, []), true);
    });

    it('참여한 학생이 모두 고르면 시간 전에 공개해요', () => {
        let live = sheetRound();
        live = apply(live, startPatch(live, 0));
        const a = { id: '1', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: 1 } } };
        const b = { id: '2', roundId: 'oxr_t', joinIndex: 0, picks: {} };
        assert.equal(teacherShouldReveal(live, 100, [a, b]), false);
        assert.equal(teacherShouldReveal(live, 100, [a, { ...b, picks: { 0: { p: 'X', ms: 1 } } }]), true);
        assert.equal(teacherShouldReveal(live, 100, []), false, '아무도 없으면 시간까지 기다려요');
    });

    it('자동 넘기기는 정답을 잠깐 보여 준 뒤 넘기고, 선생님이 넘기기는 기다려요', () => {
        let live = sheetRound();
        live = apply(live, startPatch(live, 0));
        live = apply(live, revealPatch(live, [], 1000));
        assert.equal(teacherShouldAdvance(live, 1000 + OX_CLASS_REVEAL_MS - 1), false);
        assert.equal(teacherShouldAdvance(live, 1000 + OX_CLASS_REVEAL_MS), true);
        const manual = { ...live, advance: 'manual' };
        assert.equal(teacherShouldAdvance(manual, 1000 + OX_CLASS_REVEAL_MS * 10), false);
    });

    it('학생 남은 시간은 선생님 시계와 처음 본 시각 중 넉넉한 쪽이에요', () => {
        const live = { status: 'question', timeSec: 10, qStartAt: 100000 };
        assert.equal(classRemainingMs(live, 104000, 104000), 10000, '시계가 4초 빠른 기기도 10초를 받아요');
        assert.equal(classRemainingMs(live, 103000, 101000), 8000);
        assert.equal(classRemainingMs(live, 90000, 90000), 10000, '시계가 느려도 제한 시간보다 길지 않아요');
        assert.equal(classRemainingMs({ ...live, status: 'reveal' }, 101000, 101000), 0);
    });
});

describe('OX 함께 풀기 채점', () => {
    const base = () => {
        let live = sheetRound();
        live = apply(live, startPatch(live, 0));
        return live;
    };

    it('늦게 들어온 학생은 지금 문제부터 같이 풀고, 앞 문제는 틀린 것으로 치지 않아요', () => {
        let live = base();
        live = apply(live, revealPatch(live, [], 1));
        live = apply(live, nextPatch(live, [], 2)); // 1번 문제(index 1)
        const late = joinDoc(live, '3', '데모학생3', 5);
        assert.equal(late.joinIndex, 1);
        assert.equal(canPickNow(live, late, '3'), true);
        assert.equal(canPickNow(live, late), false, '학번을 모르면 고를 수 없다고 봐요');
        const inReveal = joinDoc({ ...live, status: 'reveal' }, '4', '넷', 5);
        assert.equal(inReveal.joinIndex, 2, '정답 공개 중에 들어오면 다음 문제부터예요');
        const picked = { ...late, id: '3', picks: { 1: { p: 'X', ms: 900 } } };
        assert.equal(canPickNow(live, picked), false, '한 문제에 한 번만 골라요');
        live = apply(live, revealPatch(live, [picked], 3));
        const s = scoreClassEntry(live, picked);
        assert.deepEqual([s.correct, s.wrong, s.answered], [1, 0, 1]);
    });

    it('생명을 다 쓰면 탈락하고 더 고르지 못해요', () => {
        let live = sheetRound({ lives: 1 });
        live = apply(live, startPatch(live, 0));
        const me = { id: '1', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'X', ms: 10 } } };
        const other = { ...me, id: '2', picks: { 0: { p: 'O', ms: 1 } } };
        live = apply(live, revealPatch(live, [me, other], 1));
        assert.equal(scoreClassEntry(live, me).out, true);
        live = apply(live, nextPatch(live, [other, me], 2));
        assert.equal(live.status, 'question');
        assert.equal(canPickNow(live, me), false);
    });

    it('모두 탈락하면 바로 결과로 가요', () => {
        let live = sheetRound({ lives: 1 });
        live = apply(live, startPatch(live, 0));
        const me = { id: '1', roundId: 'oxr_t', joinIndex: 0, picks: {} };
        live = apply(live, revealPatch(live, [me], 1));
        live = apply(live, nextPatch(live, [me], 2));
        assert.equal(live.status, 'done');
        assert.equal(live.revealed, 1);
    });

    it('맞힌 수, 같으면 답한 시간 합으로 순위를 매기고 다른 판 답은 빼요', () => {
        let live = base();
        const docs = [
            { id: '1', name: '하나', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: 3000 }, 1: { p: 'X', ms: 3000 } } },
            { id: '2', name: '둘', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: 1000 }, 1: { p: 'X', ms: 1000 } } },
            { id: '3', name: '셋', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'X', ms: 500 }, 1: { p: 'X', ms: 500 } } },
            { id: '4', name: '옛판', roundId: 'old', joinIndex: 0, picks: { 0: { p: 'O', ms: 1 }, 1: { p: 'X', ms: 1 } } },
            { id: '5', name: '같음', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: 1000 }, 1: { p: 'X', ms: 1000 } } },
        ];
        live = apply(live, revealPatch(live, docs, 1));
        assert.deepEqual(live.tally, { O: 3, X: 1, none: 0 });
        live = apply(live, nextPatch(live, docs, 2));
        live = apply(live, revealPatch(live, docs, 3));
        const done = apply(live, finishPatch(live, docs, 4));
        assert.equal(done.status, 'done');
        assert.equal(done.revealed, 2);
        assert.deepEqual(done.results.map((r) => [r.name, r.rank, r.correct]), [
            ['같음', 1, 2], ['둘', 1, 2], ['하나', 3, 2], ['셋', 4, 1],
        ]);
        assert.deepEqual(rankClassRound(done, []), []);
    });

    it('중간에 끝내면 공개된 문제까지만 채점해요', () => {
        let live = base();
        const me = { id: '1', name: '하나', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: 10 }, 1: { p: 'X', ms: 10 } } };
        live = apply(live, revealPatch(live, [me], 1));
        live = apply(live, nextPatch(live, [me], 2));
        const done = apply(live, finishPatch(live, [me], 3));
        assert.equal(done.revealed, 1);
        assert.equal(done.results[0].correct, 1);
        assert.equal(tallyClassQuestion(live, [me]).X, 1);
    });

    it('정답 공개 뒤에는 고를 수 없어요', () => {
        let live = base();
        const me = joinDoc(live, '1', '하나', 0);
        live = apply(live, revealPatch(live, [me], 1));
        assert.equal(canPickNow(live, me), false);
        assert.equal(canPickNow(base(), { ...me, roundId: 'other' }), false);
    });
});

describe('OX 함께 풀기 검수 보완', () => {
    const base = () => {
        let live = sheetRound();
        live = apply(live, startPatch(live, 0));
        return live;
    };

    it('정답 공개 뒤에 들어온 답은 점수와 집계에 넣지 않아요', () => {
        let live = base();
        const ontime = { id: '1', name: '하나', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: 900 } } };
        const late = { id: '2', name: '둘', roundId: 'oxr_t', joinIndex: 0, picks: {} };
        live = apply(live, revealPatch(live, [ontime, late], 1));
        assert.deepEqual(Object.keys(live.frozen['0']), ['1']);
        const lateNow = { ...late, picks: { 0: { p: 'O', ms: 50 } } }; // 공개 뒤에 써진 답
        assert.equal(scoreClassEntry(live, lateNow).correct, 0);
        assert.deepEqual(tallyClassQuestion(live, [ontime, lateNow]), { O: 1, X: 0, none: 1 });
        const done = apply(live, finishPatch(live, [ontime, lateNow], 2));
        assert.deepEqual(done.results.map((r) => [r.name, r.rank, r.correct]), [['하나', 1, 1], ['둘', 2, 0]]);
    });

    it('동점이면 안 고른 문제는 그 문제 제한 시간 전부로 쳐요', () => {
        let live = base();
        const limit = live.timeSec * 1000;
        const fast = { id: '1', name: '하나', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: limit - 1000 }, 1: { p: 'O', ms: 500 } } };
        const skip = { id: '2', name: '둘', roundId: 'oxr_t', joinIndex: 0, picks: { 0: { p: 'O', ms: 100 } } };
        live = apply(live, revealPatch(live, [fast, skip], 1));
        live = apply(live, nextPatch(live, [fast, skip], 2));
        live = apply(live, revealPatch(live, [fast, skip], 3));
        assert.equal(scoreClassEntry(live, skip).timeMs, 100 + limit);
        assert.equal(scoreClassEntry(live, fast).timeMs, limit - 1000 + 500);
        const slowDoc = { ...fast, id: '9', picks: { 0: { p: 'O', ms: 999999 } } };
        let one = base();
        one = apply(one, revealPatch(one, [slowDoc], 1));
        assert.equal(scoreClassEntry(one, slowDoc).timeMs, limit, '고른 시간도 제한 시간까지만 쳐요');
        const done = apply(live, finishPatch(live, [fast, skip], 4));
        assert.deepEqual(done.results.map((r) => r.name), ['하나', '둘'], '둘 다 1개 맞혔고, 안 고른 쪽이 더 느린 것으로 쳐져요');
    });

    it('오래 진행이 없으면 멈춘 판으로 보고, 30분이 지나면 버려진 판이에요', () => {
        const live = { ...base(), updatedAt: 1000, timeSec: 10 };
        const seen = 1000;
        assert.equal(classRoundStalled(live, seen + 10000 + OX_CLASS_GRACE_MS + OX_CLASS_STALL_MS, seen), false);
        assert.equal(classRoundStalled(live, seen + 10000 + OX_CLASS_GRACE_MS + OX_CLASS_STALL_MS + 1, seen), true);
        assert.equal(classRoundStalled({ ...live, status: 'reveal', advance: 'manual' }, seen + 3600000, seen), false, '선생님이 넘기는 정답 화면은 기다려요');
        assert.equal(isClassRoundAbandoned(live, 1000 + OX_CLASS_ABANDON_MS), false);
        assert.equal(isClassRoundAbandoned(live, 1000 + OX_CLASS_ABANDON_MS + 1), true);
        assert.equal(isClassRoundAbandoned({ ...live, status: 'done' }, 1e13), false);
    });

    it('판 문서의 이상한 값은 숫자·정해진 값으로 바꿔서 화면에 넘겨요', () => {
        const evil = '<img src=x onerror=alert(1)>';
        const raw = {
            ...base(),
            status: evil,
            index: evil,
            timeSec: evil,
            lives: 99,
            tally: { O: evil, X: '3', none: null },
            results: [{ id: evil, name: evil, rank: evil, correct: evil, timeMs: '12' }],
            items: [...base().items, ...Array.from({ length: 40 }, () => base().items[0])],
        };
        const s = sanitizeClassLive(raw);
        assert.equal(s.status, 'off');
        assert.equal(s.index, 0);
        assert.equal(s.timeSec, 15);
        assert.equal(s.lives, 0);
        assert.ok(s.items.length <= 20);
        assert.deepEqual(s.tally, { O: 0, X: 3, none: 0 });
        assert.equal(s.results[0].rank, 0);
        assert.equal(s.results[0].correct, 0);
        assert.equal(typeof s.results[0].name, 'string');
        assert.equal(sanitizeClassLive(null), null);
    });
});

describe('OX 함께 풀기 r3: 생명 판에서도 끝까지 고를 수 있어요 (M1 회귀)', () => {
    const BIG = Array.from({ length: 10 }, (_, i) => ({ id: `B${i}`, subject: '과학', prompt: `문제 ${i}`, answer: i % 2 ? 'X' : 'O', explain: '' }));
    const round = (lives) => {
        const { live, error } = buildClassRound({
            questions: BIG, subjects: ['과학'], conditions: { count: 10, timeSec: 10, order: 'sheet', lives }, now: 1000, roundId: 'oxr_m1',
        });
        assert.equal(error, '');
        return live;
    };

    for (const lives of [0, 1, 2, 3, 5]) {
        it(`생명 ${lives}: 모두 맞히는 학생은 10문제 내내 고를 수 있고, 판이 끝까지 가요`, () => {
            let live = round(lives);
            assert.equal(live.lives, lives === 5 ? 0 : lives, '고를 수 없는 생명 수(5)는 끝까지로 바꿔요');
            live = apply(live, startPatch(live, 0));
            // 화면이 들고 있는 내 답 문서에는 id가 없어요(답 문서 자체에는 학번 칸이 없음).
            let mine = joinDoc(live, '7', '일곱', 0);
            let friend = { ...joinDoc(live, '8', '여덟', 0), id: '8' };
            for (let i = 0; i < 10; i += 1) {
                assert.equal(live.status, 'question', `${i + 1}번 문제가 열려야 해요`);
                assert.equal(canPickNow(live, mine, '7'), true, `${i + 1}번에서 고를 수 있어야 해요`);
                assert.equal(canPickNow(live, { ...mine, id: '7' }), true);
                const ans = BIG[i].answer;
                mine = { ...mine, picks: { ...mine.picks, [i]: { p: ans, ms: 500 } } };
                friend = { ...friend, picks: { ...friend.picks, [i]: { p: ans, ms: 600 } } };
                assert.equal(canPickNow(live, mine, '7'), false, '한 문제에 한 번만 골라요');
                const docs = [{ ...mine, id: '7' }, friend];
                live = apply(live, revealPatch(live, docs, 10 + i));
                assert.equal(scoreClassEntry(live, { ...mine, id: '7' }).out, false);
                live = apply(live, nextPatch(live, docs, 20 + i));
            }
            assert.equal(live.status, 'done');
            assert.equal(live.revealed, 10);
            assert.deepEqual(live.results.map((r) => [r.id, r.correct, r.out]), [['7', 10, false], ['8', 10, false]]);
        });
    }

    it('생명 2: 두 번 틀리면 그때 탈락하고, 그 전까지는 고를 수 있어요', () => {
        let live = round(2);
        live = apply(live, startPatch(live, 0));
        let mine = joinDoc(live, '7', '일곱', 0);
        const wrongAt = new Set([1, 3]);
        for (let i = 0; i < 4; i += 1) {
            assert.equal(canPickNow(live, mine, '7'), true, `${i + 1}번`);
            const ans = BIG[i].answer;
            const p = wrongAt.has(i) ? (ans === 'O' ? 'X' : 'O') : ans;
            mine = { ...mine, picks: { ...mine.picks, [i]: { p, ms: 100 } } };
            const other = { id: '8', roundId: 'oxr_m1', joinIndex: 0, picks: Object.fromEntries(Array.from({ length: i + 1 }, (_, k) => [k, { p: BIG[k].answer, ms: 1 }])) };
            live = apply(live, revealPatch(live, [{ ...mine, id: '7' }, other], 10 + i));
            live = apply(live, nextPatch(live, [{ ...mine, id: '7' }, other], 20 + i));
        }
        assert.equal(live.status, 'question');
        assert.equal(canPickNow(live, mine, '7'), false, '생명 2개를 다 쓰면 못 골라요');
        assert.equal(scoreClassEntry(live, { ...mine, id: '7' }).out, true);
    });
});
