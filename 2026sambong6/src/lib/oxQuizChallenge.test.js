import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    OX_CHALLENGE_REASON,
    OX_CHALLENGE_RECOVER_MAX_BONG,
    challengeBongFor,
    challengeResultNote,
    challengeTodayNote,
    createChallengeDeck,
    friendlyOxError,
    isRetryableOxError,
    kstDateStr,
    normalizeRankScope,
    planChallengeFinish,
    rankChallengeRows,
    verifyRecoveredRun,
    visibleChallengeRows,
    withOxRetry,
} from './oxQuizChallenge.js';

const Q = (id, answer = 'O') => ({ id, prompt: `문제 ${id}`, answer });
const D = '2026-11-12';

describe('OX 무제한 도전 보상 계산', () => {
    it('맞힌 수를 10으로 나눈 몫만큼 봉이고, 나머지는 버리며 하루 20봉까지예요', () => {
        assert.equal(challengeBongFor(0), 0);
        assert.equal(challengeBongFor(9), 0);
        assert.equal(challengeBongFor(10), 1);
        assert.equal(challengeBongFor(23), 2);
        assert.equal(challengeBongFor(39), 3);
        assert.equal(challengeBongFor(-3), 0);
        assert.equal(challengeBongFor('12'), 1);
        assert.equal(challengeBongFor(999), 20);
        assert.equal(OX_CHALLENGE_REASON, 'OX 무제한 도전');
    });

    it('KST 날짜는 UTC 15시에 바뀌어요', () => {
        assert.equal(kstDateStr(Date.UTC(2026, 10, 12, 14, 59)), '2026-11-12');
        assert.equal(kstDateStr(Date.UTC(2026, 10, 12, 15, 0)), '2026-11-13');
    });
});

describe('OX 무제한 도전 하루 한 번(시작 찜 없이, 그날 처음 끝난 판)', () => {
    it('그날 처음 끝난 판만 봉을 받고, 둘째 판은 기록만 남아요', () => {
        const f1 = planChallengeFinish(null, { studentId: '1', name: '하나', run: { runId: 'r1', correct: 23, elapsedMs: 9000 }, today: D, now: 5 });
        assert.deepEqual([f1.paidNow, f1.bong, f1.newBest], [true, 2, true]);
        assert.deepEqual([f1.entry.dayDate, f1.entry.dayRunId, f1.entry.dayCorrect, f1.entry.dayBong], [D, 'r1', 23, 2]);
        assert.equal(f1.entry.dayRunId, f1.entry.lastRunId, '규칙: 봉 받은 판은 방금 끝난 판이에요');
        assert.equal('points' in f1.entry, false, '포인트는 쌓지 않아요');
        const f2 = planChallengeFinish(f1.entry, { studentId: '1', name: '하나', run: { runId: 'r2', correct: 40, elapsedMs: 1 }, today: D, now: 6 });
        assert.deepEqual([f2.paidNow, f2.bong, f2.newBest], [false, 0, true]);
        assert.equal(f2.entry.best, 40);
        assert.equal(f2.entry.plays, 2);
        assert.equal(f2.entry.dayBong, 2, '오늘 칸은 그대로예요');
        assert.match(challengeResultNote(f2), /이미 했어요/);
        assert.match(challengeResultNote(f1), /2봉/);
    });

    it('먼저 시작했어도 먼저 끝난 판이 봉 받는 판이에요(시작 찜이 없어요)', () => {
        const a = planChallengeFinish(null, { studentId: '1', run: { runId: 'late-start', correct: 12, elapsedMs: 1 }, today: D });
        assert.equal(a.paidNow, true);
        const b = planChallengeFinish(a.entry, { studentId: '1', run: { runId: 'early-start', correct: 30, elapsedMs: 1 }, today: D });
        assert.equal(b.paidNow, false);
    });

    it('날짜가 바뀌면 다시 첫 판이에요(남은 문제 수는 넘어가지 않아요)', () => {
        const prev = { name: '하나', best: 23, plays: 1, lastRunId: 'r1', dayDate: D, dayRunId: 'r1', dayCorrect: 23, dayBong: 2 };
        assert.match(challengeTodayNote(prev, D), /끝났어요\(23개 · 2봉\)/);
        const f = planChallengeFinish(prev, { studentId: '1', run: { runId: 'r9', correct: 7, elapsedMs: 1 }, today: '2026-11-13' });
        assert.deepEqual([f.paidNow, f.bong], [true, 0], '어제 남은 3개와 오늘 7개를 더하지 않아요');
        assert.match(challengeResultNote(f), /봉이 없어요/);
        assert.match(challengeTodayNote(null, '2026-11-13'), /오늘 처음 끝나는 판/);
    });

    it('같은 판을 두 번 보내도(재시도·두 탭) 기록과 봉은 한 번만 들어가요', () => {
        const first = planChallengeFinish(null, { studentId: '1', run: { runId: 'r1', correct: 15, elapsedMs: 3 }, today: D });
        assert.equal(first.bong, 1);
        const again = planChallengeFinish(first.entry, { studentId: '1', run: { runId: 'r1', correct: 15, elapsedMs: 3 }, today: D });
        assert.deepEqual([again.paidNow, again.bong, again.changed], [false, 0, false]);
        assert.equal(again.entry.plays, 1, '같은 판은 한 번만 셉니다');
        assert.match(challengeResultNote(again), /이미 저장/);
    });

    it('복구한 판은 봉을 2봉까지만 줘요', () => {
        const f = planChallengeFinish(null, { studentId: '1', run: { runId: 'r1', correct: 200, elapsedMs: 1 }, today: D, recovered: true });
        assert.equal(f.bong, OX_CHALLENGE_RECOVER_MAX_BONG);
        assert.equal(f.entry.dayBong, 2);
    });
});

describe('OX 무제한 도전 복구 판 검사(기기 저장값을 그대로 믿지 않아요)', () => {
    const bank = [Q('a'), Q('b', 'X'), Q('c')];
    const ok = { correct: 3, ids: ['a', 'b', 'c'], startedAt: 0, touchedAt: 5000 };
    it('맞힌 문제 목록·은행·걸린 시간이 맞으면 그대로 인정해요', () => {
        assert.equal(verifyRecoveredRun(ok, bank), 3);
    });
    it('correct만 고친 판, 은행에 없는 문제, 너무 빠른 판은 0개로 쳐요', () => {
        assert.equal(verifyRecoveredRun({ ...ok, correct: 200 }, bank), 0);
        assert.equal(verifyRecoveredRun({ ...ok, ids: ['a', 'b', 'zz'] }, bank), 0);
        assert.equal(verifyRecoveredRun({ ...ok, touchedAt: 100 }, bank), 0);
        assert.equal(verifyRecoveredRun({ ...ok, ids: undefined }, bank), 0);
        assert.equal(verifyRecoveredRun(null, bank), 0);
    });
});

describe('OX 무제한 도전 랭킹·문제', () => {
    const rows = [
        { id: '1', name: '하나', best: 12, bestMs: 5000 },
        { id: '2', name: '둘', best: 20, bestMs: 9000 },
        { id: '3', name: '셋', best: 12, bestMs: 4000 },
        { id: '4', name: '넷', best: 12, bestMs: 4000 },
        { id: '5', name: '영개', best: 0, bestMs: 1 },
        { id: '6', name: '여섯', best: 3, bestMs: 1 },
        { id: '7', name: '일곱', best: 2, bestMs: 1 },
        { id: '8', name: '꼴찌', best: 1, bestMs: 1 },
    ];

    it('최고 기록 순, 같으면 빨리 푼 순이고 같은 기록은 같은 순위예요. 0개는 빼요', () => {
        assert.deepEqual(rankChallengeRows(rows).map((r) => [r.name, r.rank, r.best]), [
            ['둘', 1, 20], ['넷', 2, 12], ['셋', 2, 12], ['하나', 4, 12], ['여섯', 5, 3], ['일곱', 6, 2], ['꼴찌', 7, 1],
        ]);
    });

    it('학생 화면은 위 5명과 나만 보여 줘요. 숨기기면 내 기록만, 선생님은 전체예요', () => {
        const ranked = rankChallengeRows(rows);
        const v = visibleChallengeRows(ranked, { meId: '8' });
        assert.deepEqual(v.rows.map((r) => r.id), ['2', '4', '3', '1', '6']);
        assert.equal(v.me.id, '8');
        const top = visibleChallengeRows(ranked, { meId: '2' });
        assert.equal(top.me, null, '이미 위 5명 안에 있으면 따로 붙이지 않아요');
        const off = visibleChallengeRows(ranked, { meId: '7', scope: 'off' });
        assert.deepEqual([off.rows.length, off.me.id, off.hidden], [0, '7', true]);
        assert.equal(visibleChallengeRows(ranked, { teacher: true }).rows.length, 7);
        assert.equal(normalizeRankScope('all'), 'top5');
        assert.equal(normalizeRankScope('off'), 'off');
    });

    it('최고 기록은 더 많이(같으면 더 빨리) 맞혔을 때만 바뀌어요', () => {
        const prev = { name: '하나', best: 10, bestMs: 5000, plays: 1, dayDate: D, dayRunId: 'x', lastRunId: 'x' };
        assert.equal(planChallengeFinish(prev, { studentId: '1', run: { runId: 'a', correct: 9, elapsedMs: 1 }, today: D }).newBest, false);
        assert.equal(planChallengeFinish(prev, { studentId: '1', run: { runId: 'b', correct: 10, elapsedMs: 6000 }, today: D }).newBest, false);
        assert.equal(planChallengeFinish(prev, { studentId: '1', run: { runId: 'c', correct: 10, elapsedMs: 4000 }, today: D }).newBest, true);
    });

    it('문제 덱은 은행을 다 쓰면 다시 섞어 끝없이 이어요', () => {
        const deck = createChallengeDeck([Q('a'), Q('b', 'X'), Q('c'), { id: 'bad', prompt: '', answer: 'O' }], () => 0.3);
        assert.equal(deck.size, 3);
        const seen = [];
        for (let i = 0; i < 30; i += 1) seen.push(deck.next().id);
        assert.equal(deck.laps(), 10);
        for (let i = 0; i < 30; i += 3) assert.deepEqual(seen.slice(i, i + 3).sort(), ['a', 'b', 'c']);
        for (let i = 1; i < 30; i += 1) assert.notEqual(seen[i], seen[i - 1], '같은 문제가 연달아 나오지 않아요');
        assert.equal(createChallengeDeck([]).next(), null);
    });
});

describe('OX 오류 문구·다시 시도', () => {
    it('Firestore 원문 대신 학생이 알아듣는 말로 바꿔요', () => {
        const raw = { code: 'failed-precondition', message: 'the stored version (1) does not match the required base version (2)' };
        const text = friendlyOxError(raw);
        assert.doesNotMatch(text, /version|stored|Firestore|precondition/i);
        assert.match(text, /잠시 뒤/);
        assert.match(friendlyOxError({ code: 'unavailable' }), /인터넷/);
        assert.match(friendlyOxError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), /새로고침/);
        assert.match(friendlyOxError(new Error('뭔가')), /잠깐 문제/);
    });

    it('충돌이면 무작위 간격으로 다시 하고, 권한 오류는 바로 멈춰요', async () => {
        assert.equal(isRetryableOxError({ code: 'aborted' }), true);
        assert.equal(isRetryableOxError({ code: 'permission-denied' }), false);
        const waits = [];
        let calls = 0;
        const v = await withOxRetry(async () => {
            calls += 1;
            if (calls < 3) throw Object.assign(new Error('x'), { code: 'aborted' });
            return 'ok';
        }, { rng: () => 0.5, sleep: async (ms) => { waits.push(ms); } });
        assert.equal(v, 'ok');
        assert.equal(calls, 3);
        assert.equal(waits.length, 2);
        assert.ok(waits[1] > waits[0], '간격이 늘어나요');
        let denied = 0;
        await assert.rejects(withOxRetry(async () => {
            denied += 1;
            throw Object.assign(new Error('no'), { code: 'permission-denied' });
        }, { sleep: async () => {} }));
        assert.equal(denied, 1);
        // 같은 학생의 다른 탭이 먼저 저장해 '권한 없음'이 오면, 새로 읽어서 한 번만 더 해요.
        let tabs = 0;
        const v2 = await withOxRetry(async () => {
            tabs += 1;
            if (tabs === 1) throw Object.assign(new Error('no'), { code: 'permission-denied' });
            return 'second';
        }, { deniedRetries: 1, sleep: async () => {} });
        assert.deepEqual([v2, tabs], ['second', 2]);
        let twice = 0;
        await assert.rejects(withOxRetry(async () => {
            twice += 1;
            throw Object.assign(new Error('no'), { code: 'permission-denied' });
        }, { deniedRetries: 1, sleep: async () => {} }));
        assert.equal(twice, 2, '권한 없음은 한 번만 더 해요');
    });
});
