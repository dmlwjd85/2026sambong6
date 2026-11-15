import test from 'node:test';
import assert from 'node:assert/strict';
import {
    OXB_MAX_TURNS,
    OXB_PLAYER_HP,
    answerOxbTurn,
    buildOxbDeck,
    claimOxbReward,
    createOxbRoom,
    isOxbOpen,
    isWeekendYmd,
    joinOxbRoom,
    leaveOxbRoom,
    oxbMember,
    oxbSpeedMult,
    oxbTurnInfo,
    reopenOxbRoom,
    sanitizeOxbSettings,
    startOxbFight,
} from './oxBossRaid.js';

const bank = Array.from({ length: 30 }, (_, i) => ({ prompt: `문제 ${i}`, answer: i % 2 ? 'O' : 'X', explain: `해설 ${i}` }));
const gear = { weapon: { dmgMin: 3, dmgMax: 4, proc: 0.14, emoji: '⚔️' }, shield: { block: 0.16, emoji: '🛡️' }, shoes: { procBonus: 0.02, emoji: '👟' } };
const mem = (id, g = null) => oxbMember({ id, name: `학생${id}`, gear: g });

function room(n = 3, settings = null, g = null) {
    let r = createOxbRoom({ member: mem('1', g), bossIdx: 0, now: 1000 }).room;
    for (let i = 2; i <= n; i += 1) r = joinOxbRoom(r, { member: mem(String(i), g), now: 1000 }).room;
    const s = startOxbFight(r, { id: '1', settings, deck: buildOxbDeck(bank, () => 0.5), seed: 7, now: 2000 });
    assert.equal(s.ok, true);
    return s.room;
}

test('주말에만 열려요(설정으로 끌 수 있어요)', () => {
    assert.equal(isWeekendYmd('2026-11-15'), true); // 일요일
    assert.equal(isWeekendYmd('2026-11-14'), true);
    assert.equal(isWeekendYmd('2026-11-16'), false);
    assert.equal(isOxbOpen('2026-11-16', null), false);
    assert.equal(isOxbOpen('2026-11-16', { weekendOnly: false }), true);
});

test('장비가 능력치가 돼요', () => {
    const m = mem('1', gear);
    assert.deepEqual([m.wMin, m.wMax], [3, 4]);
    assert.equal(m.crit, 0.16);
    assert.equal(m.guard, 0.4);
    assert.equal(m.evade, 0.16);
    const bare = mem('2');
    assert.deepEqual([bare.wMax, bare.crit, bare.guard, bare.evade], [0, 0, 0, 0]);
});

test('방: 5명까지, 인원이 모자라면 출발 못 해요', () => {
    let r = createOxbRoom({ member: mem('1'), now: 1 }).room;
    assert.equal(startOxbFight(r, { id: '1', deck: buildOxbDeck(bank), now: 2 }).error, 'too_few');
    for (let i = 2; i <= 5; i += 1) r = joinOxbRoom(r, { member: mem(String(i)), now: 1 }).room;
    assert.equal(joinOxbRoom(r, { member: mem('6'), now: 1 }).error, 'full');
    assert.equal(startOxbFight(r, { id: '2', deck: buildOxbDeck(bank), now: 2 }).error, 'not_leader');
    assert.equal(startOxbFight(r, { id: '1', deck: [], now: 2 }).error, 'no_questions');
    const s = startOxbFight(r, { id: '1', deck: buildOxbDeck(bank), now: 2 });
    assert.equal(s.room.fight.boss.maxHp, 150 * 5);
    assert.equal(leaveOxbRoom(s.room, { id: '3', now: 3 }).error, 'fighting');
    assert.equal(leaveOxbRoom(s.room, { id: '1', now: 3 }).room, null);
});

test('릴레이: 차례가 돌아가고, 맞히면 보스가 아파요', () => {
    let r = room(3);
    const order = [];
    for (let i = 0; i < 4; i += 1) {
        const { member, question } = oxbTurnInfo(r.fight);
        order.push(member.id);
        const a = answerOxbTurn(r, { by: member.id, turn: r.fight.turn, pick: question.a, ms: 3000, now: 3000 });
        assert.equal(a.ok, true);
        assert.equal(a.last.ok, true);
        r = a.room;
    }
    assert.deepEqual(order, ['1', '2', '3', '1']);
    assert.equal(r.fight.combo, 4);
    assert.ok(r.fight.boss.hp < r.fight.boss.maxHp);
    assert.equal(answerOxbTurn(r, { by: '2', turn: 0, pick: 'O', now: 1 }).error, 'stale_turn');
});

test('빨리 맞힐수록 세요', () => {
    assert.equal(oxbSpeedMult(0, 12), 2);
    assert.equal(oxbSpeedMult(6000, 12), 1.5);
    assert.equal(oxbSpeedMult(99999, 12), 1);
    const r = room(2);
    const q = oxbTurnInfo(r.fight).question;
    const fast = answerOxbTurn(r, { by: '1', turn: 0, pick: q.a, ms: 500, now: 1 }).last.dmg;
    const slow = answerOxbTurn(r, { by: '1', turn: 0, pick: q.a, ms: 11500, now: 1 }).last.dmg;
    assert.ok(fast > slow * 1.7, `${fast} vs ${slow}`);
});

test('무기가 좋으면 더 세요', () => {
    const q = oxbTurnInfo(room(2).fight).question;
    const bare = answerOxbTurn(room(2), { by: '1', turn: 0, pick: q.a, ms: 6000, now: 1 }).last;
    const armed = answerOxbTurn(room(2, null, { weapon: { dmgMin: 5, dmgMax: 6, proc: 0 } }), { by: '1', turn: 0, pick: q.a, ms: 6000, now: 1 }).last;
    assert.equal(bare.dmg, 30);
    assert.ok(armed.dmg >= 50);
});

test('틀리면 보스가 때리고, 체력이 0이면 게임 오버', () => {
    let r = room(2);
    let downs = 0;
    const targets = new Set();
    for (let i = 0; i < 20 && !r.fight.result; i += 1) {
        const { member, question } = oxbTurnInfo(r.fight);
        const wrong = question.a === 'O' ? 'X' : 'O';
        // 1번만 계속 틀려요
        const a = answerOxbTurn(r, { by: member.id, turn: r.fight.turn, pick: member.id === '1' ? wrong : question.a, ms: 4000, now: 1 });
        if (member.id === '1') { assert.equal(a.last.ok, false); assert.ok(a.last.bossDmg > 0); assert.ok(['1', '2'].includes(a.last.target)); targets.add(a.last.target); }
        if (a.last.down) downs += 1;
        r = a.room;
    }
    assert.equal(r.fight.result, 'lose');
    assert.equal(downs, 1);
    assert.equal(targets.size, 2); // 틀린 사람만 맞는 게 아니라 아무나 맞아요
    assert.equal(r.fight.members.filter((m) => m.hp === 0).length, 1);
    assert.equal(answerOxbTurn(r, { by: '2', turn: r.fight.turn, pick: 'O', now: 1 }).error, 'finished');
});

test('방패는 데미지를 깎고 신발은 피해요', () => {
    const wrongOnce = (g, seedRooms = 40) => {
        let total = 0; let evades = 0;
        for (let s = 1; s <= seedRooms; s += 1) {
            let r = createOxbRoom({ member: mem('1', g), now: 1 }).room;
            r = joinOxbRoom(r, { member: mem('2', g), now: 1 }).room;
            r = startOxbFight(r, { id: '1', deck: buildOxbDeck(bank, () => 0.5), seed: s * 31, now: 2 }).room;
            const a = answerOxbTurn(r, { by: '1', turn: 0, pick: '', now: 3 }).last;
            assert.equal(a.timeout, true);
            assert.equal(a.by, '1');
            total += a.bossDmg; if (a.evade) evades += 1;
        }
        return { total, evades };
    };
    const bare = wrongOnce(null);
    const shield = wrongOnce({ shield: { block: 0.2 } });
    const shoes = wrongOnce({ shoes: { procBonus: 0.038 } });
    assert.equal(bare.evades, 0);
    assert.ok(shield.total < bare.total * 0.6);
    assert.ok(shoes.evades > 3);
});

test('차례가 아닌 팀원이 보내면 시간 초과로 처리돼요', () => {
    const r = room(3);
    const a = answerOxbTurn(r, { by: '2', turn: 0, pick: 'O', now: 1 });
    assert.equal(a.ok, true);
    assert.equal(a.last.by, '1');
    assert.equal(a.last.timeout, true);
    assert.equal(answerOxbTurn(r, { by: '9', turn: 0, pick: 'O', now: 1 }).error, 'not_member');
});

test('필살기·콤보 회복·분노', () => {
    let r = room(2, { bosses: [{ hpPer: 400 }] });
    r.fight.members[1].hp = 40;
    let sawLimit = false; let sawHeal = false;
    for (let i = 0; i < 30 && !r.fight.result; i += 1) {
        const { member, question } = oxbTurnInfo(r.fight);
        const a = answerOxbTurn(r, { by: member.id, turn: r.fight.turn, pick: question.a, ms: 1000, now: 1 });
        if (a.last.limit) sawLimit = true;
        if (a.last.heal) { sawHeal = true; assert.equal(a.last.healId, '2'); }
        r = a.room;
    }
    assert.ok(sawLimit);
    assert.ok(sawHeal);
    assert.equal(r.fight.result, 'win');
    // 분노: 체력이 30% 아래로 내려가면 한 번 알려요
    let k = room(5, { bosses: [{ hpPer: 100 }] });
    let rage = 0;
    for (let i = 0; i < 30 && !k.fight.result; i += 1) {
        const { member, question } = oxbTurnInfo(k.fight);
        const a = answerOxbTurn(k, { by: member.id, turn: k.fight.turn, pick: question.a, ms: 11000, now: 1 });
        if (a.last.rageStart) rage += 1;
        k = a.room;
    }
    assert.equal(rage, 1);
});

test('너무 오래 끌면 져요', () => {
    let r = room(2, { bosses: [{ hpPer: 5000, atk: 1 }] });
    for (let i = 0; i < OXB_MAX_TURNS + 5 && !r.fight.result; i += 1) {
        const { member } = oxbTurnInfo(r.fight);
        r = answerOxbTurn(r, { by: member.id, turn: r.fight.turn, pick: '', now: 1 }).room;
    }
    assert.equal(r.fight.result, 'lose');
    assert.ok(r.fight.last.timeUp || r.fight.last.down);
});

test('보상: 같은 전투는 한 번, 하루 횟수 제한', () => {
    let r = room(2);
    while (!r.fight.result) {
        const { member, question } = oxbTurnInfo(r.fight);
        r = answerOxbTurn(r, { by: member.id, turn: r.fight.turn, pick: question.a, ms: 1000, now: 1 }).room;
    }
    const c1 = claimOxbReward(null, r.fight, { id: '1', today: '2026-11-15' });
    assert.deepEqual([c1.ok, c1.bong, c1.win], [true, 2, true]);
    assert.equal(claimOxbReward(c1.progress, r.fight, { id: '1', today: '2026-11-15' }).error, 'claimed');
    assert.equal(claimOxbReward(null, r.fight, { id: '9', today: '2026-11-15' }).error, 'not_member');
    const f2 = { ...r.fight, id: 'other' };
    const c2 = claimOxbReward(c1.progress, f2, { id: '1', today: '2026-11-15' });
    assert.deepEqual([c2.bong, c2.limited], [0, true]);
    assert.equal(claimOxbReward(c1.progress, f2, { id: '1', today: '2026-11-16' }).bong, 2);
    // 다시 모으면 끝난 전투 기록은 남아요
    const again = reopenOxbRoom(r, { id: '1', now: 9 }).room;
    assert.equal(again.status, 'open');
    assert.equal(again.fight.result, 'win');
});

test('설정 고치기', () => {
    const s = sanitizeOxbSettings({ minParty: 9, turnSec: 1, bosses: [{ name: '<b>왕</b>', bong: 999 }] });
    assert.equal(s.minParty, 5);
    assert.equal(s.turnSec, 5);
    assert.equal(s.bosses[0].name, 'b왕/b');
    assert.equal(s.bosses[0].bong, 100);
    assert.equal(s.bosses.length, 5);
    assert.equal(OXB_PLAYER_HP, 100);
});
