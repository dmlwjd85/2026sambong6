import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './mindGame.js';

/** 손패를 정해 둔 play 단계 판 */
function playing(hands, extra = {}) {
    const players = Object.keys(hands);
    return M.sanitizeMindGame({
        mode: 'mind', gid: 1, players, level: 2, lives: players.length, stars: 1, phase: 'play', hands, pile: [], seq: 5, ...extra,
    });
}
const seeded = (seed = 7) => { let x = seed; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; }; };

describe('이심전심 시작·나눠 주기', () => {
    it('6명이 12레벨을 받아도 카드가 모자라지 않고 겹치지 않아요', () => {
        const ids = ['1', '2', '3', '4', '5', '6'];
        const hands = M.dealMindHands(ids, 12, seeded(3));
        const all = ids.flatMap((id) => hands[id]);
        assert.ok(ids.every((id) => hands[id].length === 12));
        assert.equal(new Set(all).size, 72);
        assert.ok(all.every((c) => c >= 1 && c <= 100));
    });
    it('마지막 레벨은 사람 수와 상관없이 12, 생명은 사람 수만큼이에요', () => {
        assert.equal(M.mindMaxLevel(2), 12);
        assert.equal(M.mindMaxLevel(3), 12);
        assert.equal(M.mindMaxLevel(6), 12);
        const g = M.startMindGame({ players: ['1', '2', '3'], now: 100, rnd: seeded() });
        assert.equal(g.lives, 3);
        assert.equal(g.stars, 1);
        assert.equal(g.level, 1);
        assert.equal(g.maxLevel, 12);
        assert.equal(g.phase, 'focus');
    });

    it('레벨 N이면 N장씩, 겹치지 않는 1~100 카드를 정렬해서 줘요', () => {
        const hands = M.dealMindHands(['a', 'b', 'c', 'd'], 8, seeded(3));
        const all = Object.values(hands).flat();
        assert.equal(all.length, 32);
        assert.equal(new Set(all).size, 32);
        assert.ok(all.every((c) => c >= 1 && c <= 100));
        Object.values(hands).forEach((h) => assert.deepEqual(h, [...h].sort((x, y) => x - y)));
    });

    it('한 명으로는 시작하지 않아요', () => {
        assert.equal(M.startMindGame({ players: ['1'] }).phase, 'wait');
    });

    it('모두 준비해야 시작해요', () => {
        let g = M.startMindGame({ players: ['1', '2'], rnd: seeded() });
        assert.equal(M.mindPlay(g, { id: '1' }).error, 'not_play');
        g = M.mindReady(g, { id: '1' }).game;
        assert.equal(g.phase, 'focus');
        g = M.mindReady(g, { id: '2' }).game;
        assert.equal(g.phase, 'play');
    });
});

describe('이심전심 카드 내기', () => {
    it('내 가장 작은 카드가 나가요', () => {
        const r = M.mindPlay(playing({ a: [10, 50], b: [20, 60] }), { id: 'a' });
        assert.equal(r.ok, true);
        assert.deepEqual(r.game.hands.a, [50]);
        assert.deepEqual(r.game.pile.map((x) => x.c), [10]);
        assert.equal(r.game.event.type, 'play');
        assert.equal(r.game.lives, 2);
    });

    it('더 작은 카드를 든 사람이 있으면 생명을 하나만 잃고, 낸 카드보다 작은 카드를 모두 치워요', () => {
        const r = M.mindPlay(playing({ a: [40, 90], b: [12, 30, 70], c: [5, 95] }), { id: 'a' });
        assert.equal(r.game.lives, 2);
        assert.equal(r.game.event.type, 'miss');
        assert.deepEqual(r.game.event.cards.map((x) => x.c), [5, 12, 30]);
        assert.deepEqual(r.game.hands, { a: [90], b: [70], c: [95] });
        assert.equal(r.game.phase, 'play');
    });

    it('생명이 0이 되면 실패로 끝나요', () => {
        const r = M.mindPlay(playing({ a: [40], b: [12] }, { lives: 1 }), { id: 'a' });
        assert.equal(r.game.lives, 0);
        assert.equal(r.game.phase, 'lost');
        assert.equal(M.isMindOver(r.game), true);
    });

    it('화면이 보던 카드와 손패가 달라졌으면 내지 않아요', () => {
        assert.equal(M.mindPlay(playing({ a: [10], b: [20] }), { id: 'a', card: 11 }).error, 'stale');
        assert.equal(M.mindPlay(playing({ a: [], b: [20] }), { id: 'a' }).error, 'no_cards');
        assert.equal(M.mindPlay(playing({ a: [1], b: [2] }), { id: 'zz' }).error, 'not_member');
    });

    it('모두의 손이 비면 다음 레벨로 가고, 보상을 받아요(2레벨 → 수리검)', () => {
        let g = playing({ a: [10], b: [20] });
        g = M.mindPlay(g, { id: 'a' }).game;
        const r = M.mindPlay(g, { id: 'b', rnd: seeded() });
        assert.equal(r.game.level, 3);
        assert.equal(r.game.stars, 2);
        assert.equal(r.game.phase, 'focus');
        assert.equal(r.game.event.type, 'level');
        assert.equal(r.game.event.reward, 'star');
        assert.equal(r.game.hands.a.length, 3);
        assert.deepEqual(r.game.pile, []);
        assert.deepEqual(r.game.ready, []);
    });

    it('3레벨 보상은 생명이고, 6개·3개를 넘지 않아요', () => {
        const life = M.mindPlay(playing({ a: [10], b: [] }, { level: 3 }), { id: 'a', rnd: seeded() }).game;
        assert.equal(life.lives, 3);
        const capLife = M.mindPlay(playing({ a: [10], b: [] }, { level: 9, lives: 6 }), { id: 'a', rnd: seeded() }).game;
        assert.equal(capLife.lives, 6);
        const capStar = M.mindPlay(playing({ a: [10], b: [] }, { level: 8, stars: 3 }), { id: 'a', rnd: seeded() }).game;
        assert.equal(capStar.stars, 3);
        const none = M.mindPlay(playing({ a: [10], b: [] }, { level: 4 }), { id: 'a', rnd: seeded() }).game;
        assert.equal(none.event.reward, '');
    });

    it('마지막 레벨을 통과하면 승리예요', () => {
        const r = M.mindPlay(playing({ a: [10], b: [] }, { level: 12 }), { id: 'a' });
        assert.equal(r.game.phase, 'won');
        assert.ok(M.mindEndText(r.game).includes('12레벨'));
    });

    it('실수로 손이 모두 비어도 생명이 남으면 레벨을 통과해요', () => {
        const r = M.mindPlay(playing({ a: [40], b: [12] }), { id: 'a', rnd: seeded() });
        assert.equal(r.game.lives, 1);
        assert.equal(r.game.level, 3);
        assert.equal(r.game.event.prev, 'miss');
    });
});

describe('이심전심 수리검', () => {
    it('모두 동의해야 쓰고, 각자 가장 작은 카드를 버려요', () => {
        let g = playing({ a: [10, 50], b: [20, 60], c: [] });
        g = M.mindVoteStar(g, { id: 'a' }).game;
        assert.deepEqual(g.starVotes, ['a']);
        assert.equal(g.stars, 1);
        g = M.mindVoteStar(g, { id: 'b' }).game;
        assert.equal(g.stars, 1);
        g = M.mindVoteStar(g, { id: 'c' }).game;
        assert.equal(g.stars, 0);
        assert.deepEqual(g.hands, { a: [50], b: [60], c: [] });
        assert.deepEqual(g.event.cards.map((x) => x.c), [10, 20]);
        assert.deepEqual(g.starVotes, []);
    });

    it('수리검이 없으면 못 쓰고, 누구든 제안을 거둘 수 있어요', () => {
        assert.equal(M.mindVoteStar(playing({ a: [1], b: [2] }, { stars: 0 }), { id: 'a' }).error, 'no_star');
        let g = M.mindVoteStar(playing({ a: [1], b: [2] }), { id: 'a' }).game;
        g = M.mindCancelStar(g, { id: 'b' }).game;
        assert.deepEqual(g.starVotes, []);
    });

    it('카드를 내면 수리검 제안은 사라져요', () => {
        let g = M.mindVoteStar(playing({ a: [1, 9], b: [2, 8] }), { id: 'a' }).game;
        g = M.mindPlay(g, { id: 'a' }).game;
        assert.deepEqual(g.starVotes, []);
    });
});

describe('이심전심 저장 형식·끝내기', () => {
    it('문서에서 읽어도 같은 판이고, 겹친 카드·모르는 사람은 버려요', () => {
        const g = playing({ a: [10, 50], b: [20] });
        assert.deepEqual(M.sanitizeMindGame(JSON.parse(JSON.stringify(M.mindGameToDoc(g)))), g);
        const bad = M.sanitizeMindGame({ mode: 'mind', players: ['a', 'b'], phase: 'play', level: 99, lives: 9, hands: { a: [10, 10, 500, 'x'], b: [10], z: [3] } });
        assert.deepEqual(bad.hands, { a: [10], b: [] });
        assert.equal(bad.lives, 6);
        assert.equal(bad.level, 12);
        assert.equal(M.sanitizeMindGame(null).phase, 'wait');
        assert.equal(M.sanitizeMindGame({ mode: 'chess' }).phase, 'wait');
    });

    it('하다가 나가면 거기서 끝나요', () => {
        const r = M.mindLeave(playing({ a: [1], b: [2] }), { id: 'b', now: 9 });
        assert.equal(r.game.phase, 'left');
        assert.equal(r.game.leftBy, 'b');
        assert.ok(M.mindEndText(r.game, (id) => `이름${id}`).includes('이름b'));
        assert.equal(M.mindLeave(r.game, { id: 'a' }).error, 'already_over');
    });

    it('끝까지 한 판: 늘 가장 작은 카드를 내면 12레벨까지 생명을 잃지 않아요', () => {
        const rnd = seeded(11);
        let g = M.startMindGame({ players: ['1', '2'], rnd });
        let guard = 0;
        while (!M.isMindOver(g) && guard < 2000) {
            guard += 1;
            if (g.phase === 'focus') { g = M.mindReady(M.mindReady(g, { id: '1' }).game, { id: '2' }).game; continue; }
            const who = g.players.filter((p) => g.hands[p].length).sort((x, y) => g.hands[x][0] - g.hands[y][0])[0];
            g = M.mindPlay(g, { id: who, rnd }).game;
        }
        assert.equal(g.phase, 'won');
        // 시작 2 + 3·6·9레벨 보상 3 = 5
        assert.equal(g.lives, 5);
        // 시작 1 + 2·5·8레벨 보상 3 = 4지만 3개까지
        assert.equal(g.stars, 3);
    });
});

describe('이심전심 방', async () => {
    const R = await import('./boardGameRooms.js');
    const host = () => R.createBoardRoom({ gameType: 'mind', hostId: '1', hostName: '하나', now: 1000, hostUid: 'u1' }).room;
    const join = (room, id) => {
        const req = R.requestJoinBoardRoom(room, { studentId: id, studentName: `이름${id}`, now: 2000, uid: `u${id}` }).room;
        return R.approveJoinBoardRoom(req, { hostId: '1', studentId: id, now: 3000 }).room;
    };

    it('2~6명 방이고, 6명이 차면 바로 카드를 나눠 주며 시작해요', () => {
        let room = host();
        assert.equal(room.maxPlayers, 6);
        assert.equal(room.game.phase, 'wait');
        room = join(room, '2');
        assert.equal(room.status, 'waiting');
        room = join(join(join(room, '3'), '4'), '5');
        assert.equal(room.status, 'waiting', '5명이어도 아직 기다려요(방장이 시작할 수 있어요)');
        room = join(room, '6');
        assert.equal(room.status, 'playing');
        assert.deepEqual(room.game.players, ['1', '2', '3', '4', '5', '6']);
        assert.equal(room.game.maxLevel, 12);
        assert.equal(room.game.lives, 6);
        assert.equal(room.game.hands['3'].length, 1);
        assert.deepEqual([2, 3, 4, 5, 6].map(M.mindMaxLevel), [12, 12, 12, 12, 12]);
    });

    it('2명이면 방장이 시작하고, 한 판 더 하면 1레벨부터 다시 나눠 줘요', () => {
        let room = join(host(), '2');
        assert.equal(R.startBoardRoom(room, { hostId: '2', now: 4000 }).error, 'host_only');
        room = R.startBoardRoom(room, { hostId: '1', now: 4000 }).room;
        assert.equal(room.status, 'playing');
        assert.equal(room.game.maxLevel, 12);
        // 문서로 갔다 와도 판이 그대로예요
        const back = R.sanitizeBoardRoom(JSON.parse(JSON.stringify(R.boardRoomToDoc(room))), 5000);
        assert.deepEqual(back.game, room.game);
        const left = M.mindLeave(room.game, { id: '2', now: 6000 }).game;
        const done = R.applyBoardRoomGame(room, { game: left, now: 6000, finished: true });
        assert.equal(done.status, 'finished');
        const again = R.continueBoardRoom(done, { actorId: '2', now: 7000 }).room;
        assert.equal(again.status, 'playing');
        assert.equal(again.game.level, 1);
        assert.equal(again.game.phase, 'focus');
        assert.notEqual(again.game.gid, room.game.gid);
    });
});

describe('이심전심 알림 문구', () => {
    const { mindEventText, mindObj } = M;
    it('숫자 뒤 을/를과 실수 알림', () => {
        assert.equal(mindObj(3), '3을');
        assert.equal(mindObj(52), '52를');
        assert.equal(mindObj(100), '100을');
        const g = M.mindPlay(playing({ a: [40], b: [12, 70] }), { id: 'a' }).game;
        const text = mindEventText(g, (id) => (id === 'a' ? '나' : '두리'));
        assert.ok(text.includes('내가 40을 냈는데'));
        assert.ok(text.includes('두리 12'));
    });
});
