import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { serializeAlkkagiShot, verifyAlkkagiReplay } from './alkkagiPhysics.js';
import {
    alkkagiAliveCount,
    alkkagiEndText,
    alkkagiErrorText,
    alkkagiGameToDoc,
    alkkagiPhysicsState,
    alkkagiWinnerSeat,
    applyAlkkagiForfeit,
    applyAlkkagiShotTurn,
    applyAlkkagiTimeout,
    emptyAlkkagiGame,
    sanitizeAlkkagiGame,
    simulateAlkkagiTurn,
} from './alkkagiGame.js';

const up = (id, power = 1) => serializeAlkkagiShot({ id, angle: -Math.PI / 2, power });

describe('알까기 판 상태', () => {
    it('흑 5개 아래, 백 5개 위에서 흑 차례로 시작해요', () => {
        const g = emptyAlkkagiGame({ now: 1000 });
        assert.equal(g.turn, 'black');
        assert.equal(alkkagiAliveCount(g, 'black'), 5);
        assert.equal(alkkagiAliveCount(g, 'white'), 5);
        const b = g.stones.filter((s) => s.color === 'black');
        const w = g.stones.filter((s) => s.color === 'white');
        assert.ok(b.every((s) => s.y > 300));
        assert.ok(w.every((s) => s.y < 100));
        assert.equal(g.turnStartedAt, 1000);
    });

    it('이상한 문서는 버리고 색은 id로 정해요', () => {
        const g = sanitizeAlkkagiGame({ stones: [{ id: 'b1', color: 'white', x: 10, y: 20 }, { id: 'x', x: 1, y: 1 }, { id: 'b1', x: 3, y: 3 }], winner: 'nobody', turn: '??' });
        assert.equal(g.stones.length, 1);
        assert.equal(g.stones[0].color, 'black');
        assert.equal(g.winner, '');
        assert.equal(g.turn, 'black');
    });

    it('문서로 바꿔도 다시 읽으면 같아요', () => {
        const g = emptyAlkkagiGame({ now: 5 });
        const r = applyAlkkagiShotTurn(g, { color: 'black', shot: up('b3', 0.3), now: 10 });
        assert.ok(r.ok);
        const doc = alkkagiGameToDoc(r.game);
        assert.deepEqual(sanitizeAlkkagiGame(JSON.parse(JSON.stringify(doc))), sanitizeAlkkagiGame(doc));
        assert.ok(!JSON.stringify(doc).includes('[['), '중첩 배열 없음');
    });
});

describe('알까기 샷 반영', () => {
    it('차례가 아니거나 상대 알이면 거절해요', () => {
        const g = emptyAlkkagiGame();
        assert.equal(applyAlkkagiShotTurn(g, { color: 'white', shot: up('w1') }).error, 'not_turn');
        assert.equal(applyAlkkagiShotTurn(g, { color: 'black', shot: up('w1') }).error, 'not_your_stone');
        assert.equal(applyAlkkagiShotTurn(g, { color: 'black', shot: { v: 1, id: 'b1', a: 0, p: 0 } }).error, 'bad_shot');
        assert.ok(alkkagiErrorText('not_turn'));
    });

    it('친 뒤 상대 차례로 넘어가고 직전 좌표와 샷을 남겨요', () => {
        const g = emptyAlkkagiGame({ now: 0 });
        const shot = up('b3', 0.4);
        const r = applyAlkkagiShotTurn(g, { color: 'black', shot, now: 2000, replayMs: 1500 });
        assert.ok(r.ok);
        assert.equal(r.game.turn, 'white');
        assert.equal(r.game.moveCount, 1);
        assert.equal(r.game.turnStartedAt, 3500);
        assert.deepEqual(r.game.lastShot.from, g.stones);
        assert.equal(r.game.lastShot.seq, 1);
        assert.equal(r.game.lastShot.by, 'black');
    });

    it('친 사람이 확정한 좌표를 그대로 정답으로 쓰고, 상대 재생과 같아요', () => {
        const g = emptyAlkkagiGame();
        const shot = up('b3', 0.9);
        const sim = simulateAlkkagiTurn(g, shot);
        const r = applyAlkkagiShotTurn(g, { color: 'black', shot, finalStones: sim.finalStones });
        assert.ok(r.ok);
        assert.deepEqual(r.game.stones, sanitizeAlkkagiGame({ stones: sim.finalStones }).stones);
        const replay = verifyAlkkagiReplay(alkkagiPhysicsState(r.game.lastShot.from), r.game.lastShot.shot, r.game.stones);
        assert.ok(replay.ok, replay.mismatches.join(','));
    });

    it('정답 좌표에서 빠진 알을 되살리거나 알 수를 바꾸면 막아요', () => {
        const g = sanitizeAlkkagiGame({ ...emptyAlkkagiGame(), stones: emptyAlkkagiGame().stones.map((s) => (s.id === 'w1' ? { ...s, alive: false } : s)) });
        const fin = g.stones.map((s) => ({ ...s, alive: true }));
        const r = applyAlkkagiShotTurn(g, { color: 'black', shot: up('b3', 0.2), finalStones: fin });
        assert.ok(r.ok);
        assert.equal(r.game.stones.find((s) => s.id === 'w1').alive, false);
        assert.equal(applyAlkkagiShotTurn(g, { color: 'black', shot: up('b3', 0.2), finalStones: fin.slice(1) }).error, 'bad_final');
    });

    it('상대 알이 모두 빠지면 친 사람이 이겨요', () => {
        const base = emptyAlkkagiGame();
        const stones = base.stones.map((s) => (s.color === 'white' && s.id !== 'w3' ? { ...s, alive: false } : s));
        const g = { ...base, stones };
        const fin = stones.map((s) => (s.id === 'w3' ? { ...s, y: -30, alive: false } : s));
        const r = applyAlkkagiShotTurn(g, { color: 'black', shot: up('b3'), finalStones: fin });
        assert.equal(r.game.winner, 'black');
        assert.equal(r.game.endReason, 'out');
        assert.equal(alkkagiWinnerSeat(r.game), 'black');
        assert.match(alkkagiEndText(r.game, { blackName: '하늘', whiteName: '바다' }), /하늘/);
        assert.equal(applyAlkkagiShotTurn(r.game, { color: 'white', shot: up('w3') }).error, 'already_over');
    });

    it('양쪽 마지막 알이 함께 빠지면 비겨요', () => {
        const base = emptyAlkkagiGame();
        const stones = base.stones.map((s) => (s.id !== 'w3' && s.id !== 'b3' ? { ...s, alive: false } : s));
        const fin = stones.map((s) => ({ ...s, alive: false }));
        const r = applyAlkkagiShotTurn({ ...base, stones }, { color: 'black', shot: up('b3'), finalStones: fin });
        assert.equal(r.game.endReason, 'draw');
        assert.equal(alkkagiWinnerSeat(r.game), '');
        assert.match(alkkagiEndText(r.game), /비겼어요/);
    });

    it('내 알만 다 빠지면 상대가 이겨요', () => {
        const base = emptyAlkkagiGame();
        const stones = base.stones.map((s) => (s.color === 'black' && s.id !== 'b3' ? { ...s, alive: false } : s));
        const fin = stones.map((s) => (s.id === 'b3' ? { ...s, y: -40, alive: false } : s));
        const r = applyAlkkagiShotTurn({ ...base, stones }, { color: 'black', shot: up('b3'), finalStones: fin });
        assert.equal(r.game.winner, 'white');
    });

    it('정답 좌표가 없으면 직접 시뮬레이션해요', () => {
        const g = emptyAlkkagiGame();
        const shot = up('b3', 1);
        const r = applyAlkkagiShotTurn(g, { color: 'black', shot });
        const sim = simulateAlkkagiTurn(g, shot);
        assert.deepEqual(r.game.stones, sanitizeAlkkagiGame({ stones: sim.finalStones }).stones);
        // 정면으로 세게 치면 가운데 백 알(w3)이 밀려 나가요.
        assert.equal(r.game.stones.find((s) => s.id === 'w3').alive, false);
    });
});

describe('알까기 기권·시간 초과', () => {
    it('기권하면 상대가 이겨요', () => {
        const r = applyAlkkagiForfeit(emptyAlkkagiGame(), { color: 'white', now: 9 });
        assert.equal(r.game.winner, 'black');
        assert.equal(r.game.endReason, 'forfeit');
        assert.match(alkkagiEndText(r.game, { blackName: 'A', whiteName: 'B' }), /B님이 기권/);
        assert.equal(applyAlkkagiForfeit(r.game, { color: 'black' }).error, 'already_over');
        assert.equal(applyAlkkagiForfeit(emptyAlkkagiGame(), { color: '' }).error, 'bad_color');
    });

    it('시간이 다 되면 지금 차례가 져요', () => {
        const r = applyAlkkagiTimeout(emptyAlkkagiGame(), { now: 1 });
        assert.equal(r.game.winner, 'white');
        assert.equal(r.game.endReason, 'timeout');
    });
});
