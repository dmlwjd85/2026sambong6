import test from 'node:test';
import assert from 'node:assert/strict';
import { alkkagiAiLevelLabel, planAlkkagiAiShot, runAlkkagiAiChunked, sanitizeAlkkagiAiLevel, scoreAlkkagiOutcome } from './alkkagiAi.js';
import { emptyAlkkagiGame, simulateAlkkagiTurn, alkkagiPhysicsState } from './alkkagiGame.js';
import { parseAlkkagiShot } from './alkkagiPhysics.js';

function stone(id, color, x, y) {
    return { id, color, x, y, alive: true };
}
/** 흰 알 하나 바로 앞에 판 가장자리 가까운 검은 알 하나: 밀어내기 좋은 판 */
function easyPushBoard() {
    return [
        stone('w0', 'white', 200, 250),
        stone('b0', 'black', 200, 80),
        stone('b1', 'black', 70, 330),
        stone('w1', 'white', 330, 340),
    ];
}

test('난이도 이름과 기본값', () => {
    assert.equal(sanitizeAlkkagiAiLevel('hard'), 'hard');
    assert.equal(sanitizeAlkkagiAiLevel('???'), 'normal');
    assert.equal(alkkagiAiLevelLabel('easy'), 'AI 쉬움');
    assert.equal(alkkagiAiLevelLabel('normal'), 'AI 보통');
    assert.equal(alkkagiAiLevelLabel('hard'), 'AI 고수');
});

test('같은 판·같은 seed면 늘 같은 샷이에요(결정적)', () => {
    const g = emptyAlkkagiGame();
    for (const level of ['easy', 'normal', 'hard']) {
        const a = planAlkkagiAiShot(g.stones, 'white', { level, seed: 11 });
        const b = planAlkkagiAiShot(JSON.parse(JSON.stringify(g.stones)), 'white', { level, seed: 11 });
        assert.ok(a.ok, level);
        assert.deepEqual(a.shot, b.shot, level);
        assert.ok(parseAlkkagiShot(a.shot, { state: alkkagiPhysicsState(g.stones), color: 'white' }).ok);
        assert.ok(a.id.startsWith('w'), '자기 알만 쏴요');
    }
});

test('나눠 계산해도 한 번에 계산한 것과 똑같아요', async () => {
    const g = emptyAlkkagiGame();
    const sync = planAlkkagiAiShot(g.stones, 'white', { level: 'hard', seed: 5 });
    let fake = 0;
    const job = runAlkkagiAiChunked(g.stones, 'white', { level: 'hard', seed: 5 }, {
        budgetMs: 3,
        now: () => (fake += 1), // 매 후보마다 1ms가 지난 척
        schedule: (fn) => setImmediate(fn),
    });
    const r = await job.promise;
    assert.deepEqual(r.shot, sync.shot);
    assert.ok(r.chunks > 10, `여러 번 나눠 돌았어요(${r.chunks})`);
});

test('나눠 계산은 중간에 멈출 수 있어요', async () => {
    const g = emptyAlkkagiGame();
    const job = runAlkkagiAiChunked(g.stones, 'white', { level: 'hard', seed: 5 }, { budgetMs: 0, schedule: (fn) => setImmediate(fn) });
    job.cancel();
    const r = await job.promise;
    assert.equal(r.ok, false);
    assert.equal(r.error, 'cancelled');
});

test('상대 알을 밀어내고 내 알은 지키는 수를 좋아해요', () => {
    const before = alkkagiPhysicsState(easyPushBoard()).stones;
    const pushOut = before.map((s) => (s.id === 'b0' ? { ...s, alive: false } : s));
    const loseOwn = before.map((s) => (s.id === 'w0' ? { ...s, alive: false } : s));
    assert.ok(scoreAlkkagiOutcome(before, pushOut, 'white') > scoreAlkkagiOutcome(before, before, 'white'));
    assert.ok(scoreAlkkagiOutcome(before, loseOwn, 'white') < scoreAlkkagiOutcome(before, before, 'white'));
    const trade = before.map((s) => (s.id === 'w0' || s.id === 'b0' ? { ...s, alive: false } : s));
    assert.ok(scoreAlkkagiOutcome(before, trade, 'white') < scoreAlkkagiOutcome(before, before, 'white'), '맞바꾸기는 손해예요');

    // 고수·보통은 늘 b0을 밀어내는 수를 골라요(빗나가는 건 난이도만큼).
    for (const level of ['hard', 'normal']) {
        for (let seed = 1; seed <= 6; seed += 1) {
            const r = planAlkkagiAiShot(easyPushBoard(), 'white', { level, seed });
            assert.ok(r.score >= 100, `${level} seed ${seed}: 점수 ${r.score}`);
        }
    }
    // 실제로 밀어내는 횟수는 고수가 쉬움보다 많아요.
    const pushedOf = (level) => {
        let pushed = 0;
        for (let seed = 1; seed <= 24; seed += 1) {
            const r = planAlkkagiAiShot(easyPushBoard(), 'white', { level, seed });
            const game = { ...emptyAlkkagiGame(), stones: easyPushBoard(), turn: 'white' };
            const after = simulateAlkkagiTurn(game, r.shot).finalStones;
            const blackAlive = after.filter((s) => s.alive && s.color === 'black').length;
            const whiteAlive = after.filter((s) => s.alive && s.color === 'white').length;
            if (blackAlive < 2 && whiteAlive === 2) pushed += 1;
        }
        return pushed;
    };
    const hardPushed = pushedOf('hard');
    const easyPushed = pushedOf('easy');
    assert.ok(hardPushed > easyPushed * 2, `hard ${hardPushed}/24, easy ${easyPushed}/24`);
});

test('쉬움은 일부러 크게 빗나가고, 고수는 덜 빗나가요', () => {
    const g = emptyAlkkagiGame();
    const errOf = (level) => {
        let sum = 0;
        for (let seed = 1; seed <= 12; seed += 1) sum += Math.abs(planAlkkagiAiShot(g.stones, 'white', { level, seed }).errAngle);
        return sum / 12;
    };
    const easy = errOf('easy');
    const hard = errOf('hard');
    assert.ok(easy > 0.08, `easy 평균 오차 ${easy}`);
    assert.ok(hard < 0.1, `hard 평균 오차 ${hard}`);
    assert.ok(easy > hard * 1.4, `easy ${easy}, hard ${hard}`);
});

test('쏠 알이 없으면 쏘지 않아요', () => {
    const r = planAlkkagiAiShot([stone('b0', 'black', 100, 100)], 'white', { level: 'hard', seed: 1 });
    assert.equal(r.ok, false);
});

test('고수 한 수 계산량이 정해져 있어요(느린 기기에서도 같은 결과)', () => {
    const g = emptyAlkkagiGame();
    const r = planAlkkagiAiShot(g.stones, 'white', { level: 'hard', seed: 2 });
    assert.ok(r.sims <= 520, `sims ${r.sims}`);
});
