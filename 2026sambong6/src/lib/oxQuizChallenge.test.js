import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    OX_CHALLENGE_REASON,
    challengeBongFor,
    challengeDayUsed,
    challengeResultNote,
    challengeTodayNote,
    createChallengeDeck,
    kstDateStr,
    planChallengeFinish,
    planChallengeStart,
    rankChallengeBoard,
} from './oxQuizChallenge.js';

const Q = (id, answer = 'O') => ({ id, prompt: `문제 ${id}`, answer });

function boardWith(id, entry) {
    return { entries: { [id]: entry } };
}

function merge(board, id, entry) {
    return { ...board, entries: { ...(board.entries || {}), [id]: entry } };
}

describe('OX 무제한 도전 보상 계산', () => {
    it('맞힌 수를 10으로 나눈 몫만큼 봉이고, 나머지는 버려요', () => {
        assert.equal(challengeBongFor(0), 0);
        assert.equal(challengeBongFor(9), 0);
        assert.equal(challengeBongFor(10), 1);
        assert.equal(challengeBongFor(23), 2);
        assert.equal(challengeBongFor(39), 3);
        assert.equal(challengeBongFor(-3), 0);
        assert.equal(challengeBongFor('12'), 1);
        assert.equal(OX_CHALLENGE_REASON, 'OX 무제한 도전');
    });

    it('KST 날짜는 UTC 15시에 바뀌어요', () => {
        assert.equal(kstDateStr(Date.UTC(2026, 10, 12, 14, 59)), '2026-11-12');
        assert.equal(kstDateStr(Date.UTC(2026, 10, 12, 15, 0)), '2026-11-13');
    });
});

describe('OX 무제한 도전 하루 한 번', () => {
    it('그날 첫 판만 보상 판으로 찜하고, 둘째 판은 기록만 남아요', () => {
        let board = {};
        const a = planChallengeStart(board, { studentId: '1', name: '하나', runId: 'r1', today: '2026-11-12' });
        assert.equal(a.rewardRun, true);
        board = merge(board, '1', a.entry);
        assert.equal(challengeDayUsed(board, '1', '2026-11-12'), true);
        const b = planChallengeStart(board, { studentId: '1', name: '하나', runId: 'r2', today: '2026-11-12' });
        assert.equal(b.rewardRun, false);
        assert.equal(b.changed, false);

        const f1 = planChallengeFinish(board, { studentId: '1', name: '하나', run: { runId: 'r1', correct: 23, elapsedMs: 9000 }, now: 5 });
        assert.deepEqual([f1.paidNow, f1.bong, f1.newBest], [true, 2, true]);
        assert.equal(f1.entry.dayPaid, true);
        assert.equal(f1.entry.dayBong, 2);
        assert.equal('points' in f1.entry, false, '포인트는 쌓지 않아요');
        board = merge(board, '1', f1.entry);

        const f2 = planChallengeFinish(board, { studentId: '1', name: '하나', run: { runId: 'r2', correct: 40, elapsedMs: 1 }, now: 6 });
        assert.deepEqual([f2.paidNow, f2.bong, f2.newBest], [false, 0, true]);
        assert.equal(f2.entry.best, 40);
        assert.equal(f2.entry.plays, 2);
        assert.match(challengeResultNote(f2), /이미 했어요/);
        assert.match(challengeResultNote(f1), /2봉/);
    });

    it('날짜가 바뀌면 다시 첫 판이에요(남은 문제 수는 넘어가지 않아요)', () => {
        let board = boardWith('1', { name: '하나', best: 23, dayDate: '2026-11-12', dayRunId: 'r1', dayPaid: true, dayCorrect: 23, dayBong: 2 });
        assert.match(challengeTodayNote(board, '1', '2026-11-12'), /끝났어요\(23개 · 2봉\)/);
        const s = planChallengeStart(board, { studentId: '1', name: '하나', runId: 'r9', today: '2026-11-13' });
        assert.equal(s.rewardRun, true);
        assert.equal(s.entry.dayPaid, false);
        board = merge(board, '1', s.entry);
        const f = planChallengeFinish(board, { studentId: '1', run: { runId: 'r9', correct: 7, elapsedMs: 1 } });
        assert.deepEqual([f.paidNow, f.bong], [true, 0], '어제 남은 3개와 오늘 7개를 더하지 않아요');
        assert.match(challengeResultNote(f), /봉이 없어요/);
        assert.match(challengeTodayNote({}, '1', '2026-11-13'), /오늘 첫 판/);
    });

    it('같은 판을 두 번 보내거나(재시도·두 탭) 늦게 보내도 봉은 한 번만 나가요', () => {
        let board = {};
        board = merge(board, '1', planChallengeStart(board, { studentId: '1', runId: 'r1', today: 'D' }).entry);
        const first = planChallengeFinish(board, { studentId: '1', run: { runId: 'r1', correct: 15, elapsedMs: 3 } });
        assert.equal(first.bong, 1);
        const after = merge(board, '1', first.entry);
        const again = planChallengeFinish(after, { studentId: '1', run: { runId: 'r1', correct: 15, elapsedMs: 3 } });
        assert.deepEqual([again.paidNow, again.bong, again.changed], [false, 0, false]);
        assert.equal(again.entry.plays, 1, '같은 판은 한 번만 셉니다');
        // 다른 탭의 판(찜하지 못한 판)은 봉이 없어요
        const other = planChallengeFinish(after, { studentId: '1', run: { runId: 'r2', correct: 30, elapsedMs: 3 } });
        assert.deepEqual([other.paidNow, other.bong], [false, 0]);
    });

    it('찜하지 못한 판(시작 저장 실패)은 봉이 없고 기록만 남아요', () => {
        const f = planChallengeFinish({}, { studentId: '5', name: '다섯', run: { runId: 'rx', correct: 12, elapsedMs: 1 } });
        assert.deepEqual([f.paidNow, f.bong, f.newBest, f.entry.best], [false, 0, true, 12]);
    });
});

describe('OX 무제한 도전 랭킹·문제', () => {
    it('최고 기록 순, 같으면 빨리 푼 순이고 같은 기록은 같은 순위예요', () => {
        const board = { entries: {
            1: { name: '하나', best: 12, bestMs: 5000 },
            2: { name: '둘', best: 20, bestMs: 9000 },
            3: { name: '셋', best: 12, bestMs: 4000 },
            4: { name: '넷', best: 12, bestMs: 4000 },
            5: { name: '기록없음', dayDate: 'D' },
        } };
        assert.deepEqual(rankChallengeBoard(board).map((r) => [r.name, r.rank, r.best]), [
            ['둘', 1, 20], ['넷', 2, 12], ['셋', 2, 12], ['하나', 4, 12],
        ]);
    });

    it('최고 기록은 더 많이(같으면 더 빨리) 맞혔을 때만 바뀌어요', () => {
        const board = boardWith('1', { name: '하나', best: 10, bestMs: 5000, plays: 1 });
        assert.equal(planChallengeFinish(board, { studentId: '1', run: { runId: 'a', correct: 9, elapsedMs: 1 } }).newBest, false);
        assert.equal(planChallengeFinish(board, { studentId: '1', run: { runId: 'b', correct: 10, elapsedMs: 6000 } }).newBest, false);
        assert.equal(planChallengeFinish(board, { studentId: '1', run: { runId: 'c', correct: 10, elapsedMs: 4000 } }).newBest, true);
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

describe('OX 무제한 도전 기기 묶기', () => {
    it('오늘 봉 받는 판을 찜한 기기(uid)를 랭킹 칸에 남겨요', () => {
        const a = planChallengeStart({}, { studentId: '1', name: '하나', runId: 'r1', today: '2026-11-12', uid: 'u-abc' });
        assert.equal(a.rewardRun, true);
        assert.equal(a.entry.dayUid, 'u-abc');
        assert.equal(a.entry.dayPaid, false);
        assert.equal(a.entry.dayBong, 0);
    });
});

