import test from 'node:test';
import assert from 'node:assert/strict';
import { ALKKAGI_RESUME_MAX_MS, buildAlkkagiResume, canResumeAlkkagiRoom, parseAlkkagiResume } from './alkkagiResume.js';
import { applyAlkkagiForfeit, applyAlkkagiShotTurn, emptyAlkkagiGame } from './alkkagiGame.js';
import { alkkagiAiEndText, alkkagiAiResultTitle } from './alkkagiAi.js';
import { serializeAlkkagiShot } from './alkkagiPhysics.js';

const NOW = 1_800_000_000_000;

test('온라인 방은 방 id만 남기고 그대로 돌아와요', () => {
    const raw = buildAlkkagiResume({ roomId: 'room_abc' }, NOW);
    assert.deepEqual(parseAlkkagiResume(raw, NOW + 1000), { kind: 'room', id: 'room_abc' });
});

test('한 화면·AI 판은 판과 난이도를 그대로 돌려줘요', () => {
    let g = emptyAlkkagiGame({ now: NOW });
    g = applyAlkkagiShotTurn(g, { color: 'black', shot: serializeAlkkagiShot({ id: 'b2', angle: -Math.PI / 2, power: 0.5 }), now: NOW }).game;
    const raw = buildAlkkagiResume({ game: g, ai: { level: 'hard', seed: 77 } }, NOW);
    const back = parseAlkkagiResume(raw, NOW + 5000);
    assert.equal(back.kind, 'local');
    assert.deepEqual(back.ai, { level: 'hard', seed: 77 });
    assert.equal(back.game.moveCount, 1);
    assert.equal(back.game.turn, 'white');
    assert.deepEqual(back.game.stones, g.stones);
    const local = parseAlkkagiResume(buildAlkkagiResume({ game: g }, NOW), NOW);
    assert.equal(local.ai, null);
});

test('끝난 판·오래된 값·망가진 값은 버려요', () => {
    const over = applyAlkkagiForfeit(emptyAlkkagiGame(), { color: 'black' }).game;
    assert.equal(buildAlkkagiResume({ game: over }, NOW), '');
    const raw = buildAlkkagiResume({ roomId: 'r1' }, NOW);
    assert.equal(parseAlkkagiResume(raw, NOW + ALKKAGI_RESUME_MAX_MS + 1), null);
    assert.equal(parseAlkkagiResume('{oops', NOW), null);
    assert.equal(parseAlkkagiResume(JSON.stringify({ v: 2, kind: 'room', id: 'x', t: NOW }), NOW), null);
    assert.equal(parseAlkkagiResume(JSON.stringify({ v: 1, kind: 'room', id: '', t: NOW }), NOW), null);
    assert.equal(parseAlkkagiResume(null, NOW), null);
});

test('AI 대전 결과 문구가 자연스러워요', () => {
    const base = emptyAlkkagiGame();
    const humanWin = { ...base, winner: 'black', endReason: 'out' };
    const aiWin = { ...base, winner: 'white', endReason: 'out' };
    const forfeit = { ...base, winner: 'white', endReason: 'forfeit' };
    assert.equal(alkkagiAiEndText(humanWin, { level: 'normal' }), '내가 마지막 알까지 밀어냈어요!');
    assert.equal(alkkagiAiEndText(aiWin, { level: 'normal' }), 'AI 보통이 마지막 알까지 밀어냈어요.');
    assert.equal(alkkagiAiEndText(forfeit, { level: 'hard' }), '기권해서 AI 고수가 이겼어요.');
    assert.equal(alkkagiAiEndText(aiWin, { level: 'easy' }), 'AI 쉬움이 마지막 알까지 밀어냈어요.');
    assert.equal(alkkagiAiResultTitle(humanWin, { level: 'hard' }), '내가 이겼어요!');
    assert.equal(alkkagiAiResultTitle(aiWin, { level: 'hard' }), 'AI 고수 승리!');
    assert.equal(alkkagiAiResultTitle({ ...base, endReason: 'draw' }, {}), '비겼어요');
});

test('#100 새로고침 복귀: 실시간 방은 스위치를 켰을 때 두는 중인 판에만 바로 돌아와요', () => {
    const live = { id: 'alkl_3', gameType: 'alkkagiLive', status: 'playing' };
    const turn = { id: 'alk_3', gameType: 'alkkagi', status: 'playing' };
    // 켬: 내 자리가 있고 스스로 나오지 않은 두는 중 판이면 돌아가요
    assert.equal(canResumeAlkkagiRoom(live, { isMember: true, liveEnabled: true }), true);
    // 끔(지금 배포): 실시간 방으로는 돌아가지 않아요
    assert.equal(canResumeAlkkagiRoom(live, { isMember: true, liveEnabled: false }), false);
    assert.equal(canResumeAlkkagiRoom(live, { isMember: true }), false);
    // 끝난 방·닫힌 방·대기 방으로는 끌려가지 않아요(#88 F1)
    for (const status of ['finished', 'closed', 'waiting']) {
        assert.equal(canResumeAlkkagiRoom({ ...live, status }, { isMember: true, liveEnabled: true }), false, status);
        assert.equal(canResumeAlkkagiRoom({ ...turn, status }, { isMember: true }), false, status);
    }
    // 스스로 나온 방, 내 자리가 없는 방은 아니에요
    assert.equal(canResumeAlkkagiRoom(live, { isMember: true, left: true, liveEnabled: true }), false);
    assert.equal(canResumeAlkkagiRoom(live, { isMember: false, liveEnabled: true }), false);
    // 턴제 알까기 방은 예전처럼(스위치와 상관없이) 돌아가요
    assert.equal(canResumeAlkkagiRoom(turn, { isMember: true }), true);
    assert.equal(canResumeAlkkagiRoom(turn, { isMember: true, liveEnabled: true }), true);
    // 오목·체스·빈 값은 아니에요
    assert.equal(canResumeAlkkagiRoom({ gameType: 'gomoku', status: 'playing' }, { isMember: true, liveEnabled: true }), false);
    assert.equal(canResumeAlkkagiRoom(null, { isMember: true, liveEnabled: true }), false);
    // 실시간 방 id도 저장·읽기가 그대로 돼요
    assert.deepEqual(parseAlkkagiResume(buildAlkkagiResume({ roomId: 'alkl_3' }, NOW), NOW + 1000), { kind: 'room', id: 'alkl_3' });
});
