import test from 'node:test';
import assert from 'node:assert/strict';
import { ALKKAGI_RESUME_MAX_MS, buildAlkkagiResume, parseAlkkagiResume } from './alkkagiResume.js';
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
