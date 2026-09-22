import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    RPS_CHOOSE_MS,
    RPS_CHOOSE_SEC,
    RPS_REVEAL_GRACE_MS,
    applyRpsReveal,
    collectRpsPicksFromStudents,
    emptyRpsGame,
    refreshRpsChooseDeadline,
    resolveFreeRpsRound,
    resolveTeacherRpsRound,
    rpsBeats,
    rpsCanPick,
    rpsCanReveal,
    rpsChooseRemainingMs,
    rpsChooseSeconds,
    rpsRevealWaitMs,
    sanitizeEpochMs,
    sanitizeRpsChooseMs,
    sanitizeRpsGame,
    startRpsRound,
} from './rpsGame.js';

describe('가위바위보 승패', () => {
    it('바위는 가위를 이기고, 같은 손은 이기지 않는다', () => {
        assert.equal(rpsBeats('rock', 'scissors'), true);
        assert.equal(rpsBeats('scissors', 'paper'), true);
        assert.equal(rpsBeats('paper', 'rock'), true);
        assert.equal(rpsBeats('rock', 'rock'), false);
        assert.equal(rpsBeats('rock', 'paper'), false);
        assert.equal(rpsBeats('hack', 'rock'), false);
    });
});

describe('학급 전원 가위바위보', () => {
    it('못 고른 사람은 패배하고, 두 손이면 이긴 손만 남긴다', () => {
        const r = resolveFreeRpsRound({
            aliveIds: ['8', '12', '1', '2'],
            picks: { 8: 'rock', 12: 'scissors', 1: 'rock' },
        });
        assert.equal(r.kind, 'win');
        assert.deepEqual(r.winners, ['8', '1']);
        assert.deepEqual(r.losers, ['12']);
        assert.deepEqual(r.timeouts, ['2']);
    });

    it('세 손이 다 나오면 고른 사람은 남기고 다시 한다', () => {
        const r = resolveFreeRpsRound({
            aliveIds: ['1', '2', '3', '4'],
            picks: { 1: 'rock', 2: 'paper', 3: 'scissors' },
        });
        assert.equal(r.kind, 'tie');
        assert.deepEqual(r.winners, ['1', '2', '3']);
        assert.deepEqual(r.timeouts, ['4']);
        assert.deepEqual(r.losers, []);
    });

    it('학급 가위바위보에서 선생님도 고른 손끼리 승패에 들어간다', () => {
        const r = resolveFreeRpsRound({
            aliveIds: ['8', 'teacher', '1'],
            picks: { 8: 'rock', teacher: 'rock', 1: 'scissors' },
        });
        assert.equal(r.kind, 'win');
        assert.deepEqual(r.winners, ['8', 'teacher']);
        assert.deepEqual(r.losers, ['1']);
    });

    it('모두 못 고르면 전원 시간초과다', () => {
        const r = resolveFreeRpsRound({ aliveIds: ['1', '2'], picks: {} });
        assert.equal(r.kind, 'timeout_all');
        assert.deepEqual(r.winners, []);
        assert.deepEqual(r.timeouts, ['1', '2']);
    });
});

describe('쌤을 이겨라', () => {
    it('선생님을 이긴 학생만 남긴다', () => {
        const r = resolveTeacherRpsRound({
            aliveIds: ['8', '12', '1', '2'],
            picks: { 8: 'paper', 12: 'rock', 1: 'scissors' },
            teacherPick: 'rock',
        });
        assert.equal(r.kind, 'teacher_win');
        assert.deepEqual(r.winners, ['8']);
        assert.deepEqual(r.losers, ['12', '1']);
        assert.deepEqual(r.timeouts, ['2']);
        assert.equal(r.teacherPick, 'rock');
    });

    it('선생님 손이 없으면 고른 학생은 남긴다', () => {
        const r = resolveTeacherRpsRound({
            aliveIds: ['8', '12'],
            picks: { 8: 'rock' },
            teacherPick: '',
        });
        assert.equal(r.kind, 'teacher_miss');
        assert.deepEqual(r.winners, ['8']);
        assert.deepEqual(r.timeouts, ['12']);
    });

    it('이긴 학생이 없으면 고른 학생은 다시 한다', () => {
        const r = resolveTeacherRpsRound({
            aliveIds: ['8', '12'],
            picks: { 8: 'rock', 12: 'scissors' },
            teacherPick: 'rock',
        });
        assert.equal(r.kind, 'teacher_hold');
        assert.deepEqual(r.winners, ['8', '12']);
        assert.deepEqual(r.losers, []);
    });
});

describe('라운드 진행', () => {
    it('학생 문서에서 이번 라운드 손만 모은다', () => {
        const picks = collectRpsPicksFromStudents([
            { id: '8', rpsPick: { sessionId: 's1', round: 2, move: 'paper' } },
            { id: '12', rpsPick: { sessionId: 's1', round: 1, move: 'rock' } },
            { id: 'gm', rpsPick: { sessionId: 's1', round: 2, move: 'scissors' } },
            { id: '1', rpsPick: { sessionId: 'other', round: 2, move: 'rock' } },
        ], 's1', 2);
        assert.deepEqual(picks, { 8: 'paper' });
    });

    it('5초 고르기 라운드를 열고, 시간이 지나야 공개한다', () => {
        assert.equal(RPS_CHOOSE_MS, 5000);
        assert.equal(RPS_CHOOSE_SEC, 5);
        const started = startRpsRound({
            mode: 'free',
            aliveIds: ['8', '12', '1'],
            now: 1000,
            sessionId: 's1',
        });
        assert.equal(started.phase, 'choose');
        assert.equal(started.chooseMs, 5000);
        assert.equal(started.chooseUntil, 1000 + RPS_CHOOSE_MS);
        assert.equal(started.chooseStartedAt, 1000);
        assert.equal(rpsChooseRemainingMs(started, 1000), 5000);
        assert.equal(rpsRevealWaitMs(started, 1000), 5000 + RPS_REVEAL_GRACE_MS);
        assert.equal(rpsCanPick(started), true);
        assert.equal(rpsCanReveal(started, 1000 + RPS_CHOOSE_MS), false);
        assert.equal(rpsCanReveal(started, 1000 + RPS_CHOOSE_MS + RPS_REVEAL_GRACE_MS), true);
        assert.equal(rpsCanPick(started), true);
        const revealed = applyRpsReveal({
            state: started,
            picks: { 8: 'rock', 12: 'scissors' },
            now: 7000,
        });
        assert.equal(revealed.ok, true);
        assert.equal(revealed.state.phase, 'done');
        assert.equal(revealed.state.winnerId, '8');
        assert.deepEqual(revealed.state.aliveIds, ['8']);
        assert.deepEqual(revealed.result.timeouts, ['1']);
        const mid = applyRpsReveal({
            state: startRpsRound({
                mode: 'free',
                aliveIds: ['8', '12', '1'],
                now: 1000,
                sessionId: 's2',
            }),
            picks: { 8: 'rock', 12: 'rock', 1: 'scissors' },
            now: 7000,
        });
        assert.equal(mid.state.phase, 'reveal');
        assert.deepEqual(mid.state.aliveIds, ['8', '12']);
        const again = applyRpsReveal({ state: mid.state, picks: { 8: 'paper' } });
        assert.equal(again.ok, false);
        assert.equal(rpsCanPick(mid.state), false);
    });

    it('게시 직전 마감을 다시 잡고, 느린 시계로 카운트가 늘어나지 않는다', () => {
        const started = startRpsRound({
            mode: 'free',
            aliveIds: ['8', '12'],
            now: 1000,
            sessionId: 's1',
        });
        const armed = refreshRpsChooseDeadline(started, 1800);
        assert.equal(armed.chooseUntil, 1800 + RPS_CHOOSE_MS);
        assert.equal(armed.updatedAt, 1800);
        assert.equal(rpsChooseRemainingMs(started, 1000), 5000);
        // 시계가 느려도 수신 시각 기준으로 줄어들어, 카운트가 5초에 멈추지 않습니다.
        assert.equal(rpsChooseRemainingMs(started, 0, { receivedAt: 1 }), 5000);
        assert.equal(rpsChooseRemainingMs(started, 1000, { receivedAt: 1 }), 4001);
        // 스냅샷이 1초 늦게 도착하면 교사 마감에 맞춰 4초가 남습니다.
        assert.equal(rpsChooseRemainingMs(started, 2000, { receivedAt: 2000 }), 4000);
        assert.equal(sanitizeRpsChooseMs(0), 5000);
        assert.equal(sanitizeRpsChooseMs(999), 5000);
        assert.equal(sanitizeRpsChooseMs(8000), 8000);
        assert.equal(sanitizeRpsChooseMs(99999), 15000);
        assert.equal(rpsChooseSeconds(), 5);
        const idle = refreshRpsChooseDeadline(emptyRpsGame(), 2000);
        assert.equal(idle.phase, 'idle');
        assert.equal(idle.chooseUntil, 0);
    });

    it('마감이 비어 있거나 이미 지났어도 받은 뒤 5초를 채운 다음에만 공개한다', () => {
        const stale = sanitizeRpsGame({
            sessionId: 's1',
            phase: 'choose',
            aliveIds: ['8', '12'],
            chooseUntil: 0,
            chooseMs: 5000,
            updatedAt: 0,
            round: 1,
        });
        assert.equal(rpsChooseRemainingMs(stale, 9000, { receivedAt: 9000 }), 5000);
        assert.equal(rpsCanReveal(stale, 9000, { receivedAt: 9000 }), false);
        assert.equal(rpsRevealWaitMs(stale, 9000, { receivedAt: 9000 }), 5000 + RPS_REVEAL_GRACE_MS);
        assert.equal(rpsCanReveal(stale, 9000 + RPS_CHOOSE_MS, { receivedAt: 9000 }), false);
        assert.equal(rpsCanReveal(stale, 9000 + RPS_CHOOSE_MS + RPS_REVEAL_GRACE_MS, { receivedAt: 9000 }), true);
        const expiredUntil = sanitizeRpsGame({
            sessionId: 's1',
            phase: 'choose',
            aliveIds: ['8', '12'],
            chooseUntil: 100,
            chooseStartedAt: 0,
            chooseMs: 5000,
            updatedAt: 50,
            round: 1,
        });
        assert.equal(rpsChooseRemainingMs(expiredUntil, 8000, { receivedAt: 8000 }), 5000);
        assert.equal(rpsCanReveal(expiredUntil, 8100, { receivedAt: 8000 }), false);
        assert.equal(sanitizeEpochMs({ seconds: 10, nanoseconds: 0 }), 10000);
        assert.equal(sanitizeEpochMs(1_700_000_000), 1_700_000_000_000);
    });

    it('위험한 학번과 빈 값을 버린다', () => {
        const dirty = sanitizeRpsGame({
            sessionId: 's1',
            mode: 'hack',
            phase: 'choose',
            aliveIds: ['gm', '8', 'guest'],
            teacherPick: 'rock',
        });
        assert.equal(dirty.mode, 'free');
        assert.deepEqual(dirty.aliveIds, ['8']);
        assert.equal(dirty.teacherPick, '');
        assert.equal(dirty.chooseMs, 5000);
        assert.equal(emptyRpsGame().phase, 'idle');
    });
});
