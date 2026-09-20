import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    RPS_CHOOSE_MS,
    applyRpsReveal,
    collectRpsPicksFromStudents,
    emptyRpsGame,
    resolveFreeRpsRound,
    resolveTeacherRpsRound,
    rpsBeats,
    rpsCanReveal,
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

    it('3초 고르기 라운드를 열고, 시간이 지나야 공개한다', () => {
        const started = startRpsRound({
            mode: 'free',
            aliveIds: ['8', '12', '1'],
            now: 1000,
            sessionId: 's1',
        });
        assert.equal(started.phase, 'choose');
        assert.equal(started.chooseUntil, 1000 + RPS_CHOOSE_MS);
        assert.equal(rpsCanReveal(started, 1000 + RPS_CHOOSE_MS), false);
        assert.equal(rpsCanReveal(started, 1000 + RPS_CHOOSE_MS + 400), true);
        const revealed = applyRpsReveal({
            state: started,
            picks: { 8: 'rock', 12: 'scissors' },
            now: 5000,
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
            now: 5000,
        });
        assert.equal(mid.state.phase, 'reveal');
        assert.deepEqual(mid.state.aliveIds, ['8', '12']);
        const again = applyRpsReveal({ state: mid.state, picks: { 8: 'paper' } });
        assert.equal(again.ok, false);
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
        assert.equal(emptyRpsGame().phase, 'idle');
    });
});
