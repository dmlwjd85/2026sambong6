import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BOARD_ROOM_IDLE_TTL_MS,
    approveJoinBoardRoom,
    closeBoardRoom,
    continueBoardRoom,
    createBoardRoom,
    expireIdleBoardRoom,
    isRoomHost,
    isRoomIdleExpired,
    isTurnTimedOut,
    listVisibleBoardRooms,
    rejectJoinBoardRoom,
    remainingSeats,
    requestJoinBoardRoom,
    cancelJoinBoardRoom,
    collectBoardRoomVacateActions,
    sanitizeBoardRoom,
    setBoardRoomTimer,
    startBoardRoom,
    turnRemainingMs,
    boardRoomToDoc,
} from './boardGameRooms.js';
import { GOMOKU_BLACK, placeGomokuStone } from './gomokuGame.js';
import { applyBoardRoomGame, finishBoardRoom } from './boardGameRooms.js';
import * as roomLib from './boardGameRooms.js';

function makeRoom(now = 1000) {
    const created = createBoardRoom({
        gameType: 'gomoku',
        hostId: '1',
        hostName: '민준',
        now,
    });
    assert.equal(created.ok, true);
    return created.room;
}

describe('보드게임 방 만들기', () => {
    it('오목 방은 방장이 흑으로 들어가고 정원은 2명이다', () => {
        const room = makeRoom();
        assert.equal(room.gameType, 'gomoku');
        assert.equal(room.status, 'waiting');
        assert.equal(room.maxPlayers, 2);
        assert.equal(room.members.length, 1);
        assert.equal(room.members[0].seat, 'black');
        assert.equal(isRoomHost(room, '1'), true);
        assert.equal(isRoomHost(room, '2'), false);
        assert.equal(remainingSeats(room), 1);
        assert.match(room.id, /^bg_/);
        const doc = boardRoomToDoc(room);
        assert.ok(Array.isArray(doc.game.cells));
        assert.equal(doc.game.cells.length, 400);
        assert.equal(doc.game.board, undefined);
    });

    it('알 수 없는 게임은 만들지 않는다', () => {
        const bad = createBoardRoom({ gameType: 'xyz', hostId: '1', hostName: '민준', now: 1 });
        assert.equal(bad.ok, false);
        assert.equal(sanitizeBoardRoom({ gameType: 'hack', status: 'nope' }).gameType, 'gomoku');
    });

    it('체스 방은 방장이 백(선공)으로 들어간다', () => {
        const created = createBoardRoom({ gameType: 'chess', hostId: '1', hostName: '민준', now: 1 });
        assert.equal(created.ok, true);
        assert.equal(created.room.gameType, 'chess');
        assert.equal(created.room.members[0].seat, 'white');
        assert.equal(created.room.game.turn, 'w');
        const asked = requestJoinBoardRoom(created.room, { studentId: '7', studentName: '서연', now: 2 });
        const approved = approveJoinBoardRoom(asked.room, { hostId: '1', studentId: '7', now: 3 });
        assert.equal(approved.ok, true);
        assert.equal(approved.room.members[1].seat, 'black');
        assert.equal(approved.room.status, 'playing');
    });
    it('알까기 방은 방장이 흑(먼저 치기)이고, 좌표가 문서로 저장된다', () => {
        const created = createBoardRoom({ gameType: 'alkkagi', hostId: '1', hostName: '민준', now: 1 });
        assert.equal(created.ok, true);
        assert.equal(created.room.members[0].seat, 'black');
        assert.equal(created.room.game.turn, 'black');
        const asked = requestJoinBoardRoom(created.room, { studentId: '7', studentName: '서연', now: 2 });
        const approved = approveJoinBoardRoom(asked.room, { hostId: '1', studentId: '7', now: 3 });
        assert.equal(approved.room.members[1].seat, 'white');
        assert.equal(approved.room.status, 'playing');
        const doc = boardRoomToDoc(approved.room);
        assert.equal(doc.game.stones.length, 10);
        assert.equal(sanitizeBoardRoom(JSON.parse(JSON.stringify(doc))).game.stones.length, 10);
    });
});

describe('참가 신청·방장 승인', () => {
    it('다른 학생이 신청하면 방장만 승인·거절한다', () => {
        const room = makeRoom();
        const asked = requestJoinBoardRoom(room, { studentId: '7', studentName: '서연', now: 1100 });
        assert.equal(asked.ok, true);
        assert.equal(asked.room.joinRequests[0].status, 'pending');

        const notHost = approveJoinBoardRoom(asked.room, { hostId: '7', studentId: '7', now: 1200 });
        assert.equal(notHost.ok, false);
        assert.equal(notHost.error, 'host_only');

        const rejected = rejectJoinBoardRoom(asked.room, { hostId: '1', studentId: '7', now: 1200 });
        assert.equal(rejected.ok, true);
        assert.equal(rejected.room.joinRequests[0].status, 'rejected');
        assert.equal(rejected.room.members.length, 1);
    });

    it('오목은 승인으로 정원이 차면 바로 대국을 시작한다', () => {
        const room = makeRoom();
        const asked = requestJoinBoardRoom(room, { studentId: '7', studentName: '서연', now: 1100 });
        const approved = approveJoinBoardRoom(asked.room, { hostId: '1', studentId: '7', now: 1200 });
        assert.equal(approved.ok, true);
        assert.equal(approved.room.members.length, 2);
        assert.equal(approved.room.members[1].seat, 'white');
        assert.equal(approved.room.status, 'playing');
        assert.equal(approved.room.game.turn, GOMOKU_BLACK);
    });

    it('같은 학생이 두 번 신청하거나 가득 찬 방은 거절한다', () => {
        const room = makeRoom();
        const first = requestJoinBoardRoom(room, { studentId: '7', studentName: '서연', now: 1100 });
        const again = requestJoinBoardRoom(first.room, { studentId: '7', studentName: '서연', now: 1110 });
        assert.equal(again.ok, false);
        assert.equal(again.error, 'already_requested');
        const hostJoin = requestJoinBoardRoom(room, { studentId: '1', studentName: '민준', now: 1100 });
        assert.equal(hostJoin.ok, false);
        assert.equal(hostJoin.error, 'already_in');
    });

    it('다른 방에 들어가면 내 대기 방과 다른 참가 대기를 정리한다', () => {
        const mine = makeRoom(1000);
        const other = createBoardRoom({ gameType: 'gomoku', hostId: '2', hostName: '서연', now: 1100 }).room;
        const asked = requestJoinBoardRoom(other, { studentId: '1', studentName: '민준', now: 1200 });
        assert.equal(asked.ok, true);
        const actions = collectBoardRoomVacateActions([mine, asked.room], { studentId: '1', exceptRoomId: 'bg_other' });
        assert.deepEqual(actions.closeHostIds, [mine.id]);
        assert.deepEqual(actions.cancelJoinIds, [asked.room.id]);
        const cancelled = cancelJoinBoardRoom(asked.room, { studentId: '1', now: 1300 });
        assert.equal(cancelled.ok, true);
        assert.equal(cancelled.room.joinRequests.length, 0);
    });
});

describe('30초 타이머와 종료 후 흐름', () => {
    it('방장만 타이머를 켜고 끌 수 있다', () => {
        const room = makeRoom();
        const guest = setBoardRoomTimer(room, { hostId: '7', enabled: true, now: 1300 });
        assert.equal(guest.ok, false);
        const on = setBoardRoomTimer(room, { hostId: '1', enabled: true, now: 1300 });
        assert.equal(on.ok, true);
        assert.equal(on.room.timerEnabled, true);
        assert.equal(on.room.timerSec, 30);
    });

    it('타이머가 켜진 대국은 30초가 지나면 시간 초과다', () => {
        let room = makeRoom(1000);
        room = requestJoinBoardRoom(room, { studentId: '7', studentName: '서연', now: 1100 }).room;
        room = approveJoinBoardRoom(room, { hostId: '1', studentId: '7', now: 2000 }).room;
        room = setBoardRoomTimer(room, { hostId: '1', enabled: true, now: 2000 }).room;
        assert.equal(isTurnTimedOut(room, 2000 + 29_000), false);
        assert.equal(isTurnTimedOut(room, 2000 + 30_000), true);
        assert.equal(turnRemainingMs(room, 2000 + 10_000), 20_000);
    });

    it('끝나면 같은 자리에서 재대국하거나 방을 닫을 수 있다', () => {
        let room = makeRoom(1000);
        room = requestJoinBoardRoom(room, { studentId: '7', studentName: '서연', now: 1100 }).room;
        room = approveJoinBoardRoom(room, { hostId: '1', studentId: '7', now: 1200 }).room;
        const moved = placeGomokuStone(room.game, { x: 7, y: 7, color: GOMOKU_BLACK, now: 1300 });
        room = applyBoardRoomGame(room, { game: moved.game, now: 1300, finished: false });
        room = finishBoardRoom(room, { game: { ...room.game, winner: GOMOKU_BLACK, endReason: 'five' }, now: 1400 }).room;
        assert.equal(room.status, 'finished');

        const rematch = continueBoardRoom(room, { actorId: '7', now: 1500 });
        assert.equal(rematch.ok, true);
        assert.equal(rematch.room.status, 'playing');
        assert.equal(rematch.room.members[0].id, '1');
        assert.equal(rematch.room.game.moveCount, 0);

        const ended = closeBoardRoom(rematch.room, { actorId: '1', now: 1600 });
        assert.equal(ended.ok, true);
        assert.equal(ended.room.status, 'closed');
    });
});

describe('10분 방치 정리', () => {
    it('10분이 지난 방은 만료되어 목록에서 빠진다', () => {
        const room = makeRoom(1_000);
        assert.equal(isRoomIdleExpired(room, 1_000 + BOARD_ROOM_IDLE_TTL_MS - 1), false);
        assert.equal(isRoomIdleExpired(room, 1_000 + BOARD_ROOM_IDLE_TTL_MS), true);
        const expired = expireIdleBoardRoom(room, 1_000 + BOARD_ROOM_IDLE_TTL_MS);
        assert.equal(expired.ok, true);
        assert.equal(expired.room.status, 'closed');
        const visible = listVisibleBoardRooms([room, expired.room], 1_000 + BOARD_ROOM_IDLE_TTL_MS);
        assert.equal(visible.length, 0);
    });

    it('활동이 있으면 만료되지 않고, 종료 방은 목록에 안 보인다', () => {
        const fresh = makeRoom(50_000);
        const closed = closeBoardRoom(makeRoom(40_000), { actorId: '1', now: 41_000 }).room;
        const visible = listVisibleBoardRooms([fresh, closed], 50_000);
        assert.equal(visible.length, 1);
        assert.equal(visible[0].id, fresh.id);
        assert.equal(startBoardRoom(fresh, { hostId: '1', now: 51_000 }).error, 'need_players');
    });
});

describe('알까기 방 하나만 만들기(중복 방 막기)', () => {
    const m = roomLib;
    function alkRoom(now = 1000, hostId = '1') {
        const made = m.createBoardRoom({ gameType: 'alkkagi', hostId, hostName: '민준', now, id: m.hostBoardRoomId('alkkagi', hostId) });
        assert.equal(made.ok, true);
        return made.room;
    }

    it('알까기 방 id는 방장마다 하나로 정해지고, 오목·체스는 예전처럼 새 id를 쓴다', () => {
        assert.equal(m.hostBoardRoomId('alkkagi', '1'), 'alk_1');
        assert.equal(m.hostBoardRoomId('alkkagi', ' 1 '), 'alk_1');
        assert.equal(m.hostBoardRoomId('alkkagi', 'a/b'), 'alk_a_b');
        assert.equal(m.hostBoardRoomId('alkkagi', ''), '');
        assert.equal(m.hostBoardRoomId('gomoku', '1'), '');
        assert.equal(m.hostBoardRoomId('chess', '1'), '');
        const r = alkRoom(1000);
        assert.equal(r.id, 'alk_1');
        const g = createBoardRoom({ gameType: 'gomoku', hostId: '1', hostName: '민준', now: 1000 });
        assert.match(g.room.id, /^bg_/);
    });

    it('같은 id 방이 없으면 만들고, 내 대기 방이 있으면 새로 만들지 않고 안내한다', () => {
        assert.equal(m.decideBoardRoomCreate(null, { hostId: '1', now: 1000 }).action, 'create');
        const waiting = alkRoom(1000);
        assert.equal(m.decideBoardRoomCreate(waiting, { hostId: '1', now: 2000 }).action, 'reuse');
        // 두 번째, 세 번째로 눌러도 같은 결과예요.
        assert.equal(m.decideBoardRoomCreate(waiting, { hostId: '1', now: 2100 }).action, 'reuse');
        assert.equal(m.decideBoardRoomCreate(waiting, { hostId: '', now: 2000 }).action, 'error');
    });

    it('두는 중인 내 방이 있으면 그 판으로 들어가고, 끝났거나 닫혔거나 오래된 방은 새 방으로 바꾼다', () => {
        const waiting = alkRoom(1000);
        const asked = requestJoinBoardRoom(waiting, { studentId: '2', studentName: '서연', now: 1100 });
        const playing = approveJoinBoardRoom(asked.room, { hostId: '1', studentId: '2', now: 1200 }).room;
        assert.equal(playing.status, 'playing');
        assert.equal(m.decideBoardRoomCreate(playing, { hostId: '1', now: 1300 }).action, 'enter');
        const finished = finishBoardRoom(playing, { game: playing.game, now: 1400 }).room;
        assert.equal(m.decideBoardRoomCreate(finished, { hostId: '1', now: 1500 }).action, 'create');
        const closed = closeBoardRoom(waiting, { actorId: '1', now: 1500 }).room;
        assert.equal(m.decideBoardRoomCreate(closed, { hostId: '1', now: 1600 }).action, 'create');
        assert.equal(m.decideBoardRoomCreate(waiting, { hostId: '1', now: 1000 + BOARD_ROOM_IDLE_TTL_MS }).action, 'create');
    });

    it('새로 만든 방은 만든 시각이 달라서, 예전 판에서 나간 기록과 섞이지 않는다', () => {
        const first = alkRoom(1000);
        const again = alkRoom(5000);
        assert.equal(first.id, again.id);
        assert.notEqual(m.boardRoomInstanceKey(first), m.boardRoomInstanceKey(again));
        // 한 판 더(같은 방에서 계속)는 같은 판 묶음으로 봐요.
        assert.equal(m.boardRoomInstanceKey(first), `alk_1:1000`);
    });

    it('내 방을 고를 때 끝난 옛 방보다 방금 만든 대기 방을 먼저 고른다', () => {
        const old = makeRoom(1000);
        old.id = 'bg_aaa';
        old.gameType = 'alkkagi';
        const asked = requestJoinBoardRoom(old, { studentId: '2', studentName: '서연', now: 1100 });
        const playing = approveJoinBoardRoom(asked.room, { hostId: '1', studentId: '2', now: 1200 }).room;
        const finished = finishBoardRoom(playing, { game: playing.game, now: 1300 }).room;
        const fresh = alkRoom(2000);
        const picked = m.pickMyActiveBoardRoom([finished, fresh], '1');
        assert.equal(picked.id, fresh.id);
        const vacate = collectBoardRoomVacateActions([finished, fresh], { studentId: '1', exceptRoomId: picked.id });
        assert.deepEqual(vacate.closeHostIds, []);
        // 두는 중인 방이 있으면 그 방이 먼저예요.
        assert.equal(m.pickMyActiveBoardRoom([fresh, playing], '1').id, playing.id);
        assert.equal(m.pickMyActiveBoardRoom([fresh], '9'), null);
        assert.equal(m.pickMyActiveBoardRoom([fresh], ''), null);
    });

    it('알까기 방 목록에서 끝난 판은 빠지고, 오목·체스는 그대로 보인다', () => {
        const waiting = alkRoom(1000);
        const other = alkRoom(1000, '2');
        const asked = requestJoinBoardRoom(other, { studentId: '3', studentName: '지호', now: 1100 });
        const playing = approveJoinBoardRoom(asked.room, { hostId: '2', studentId: '3', now: 1200 }).room;
        const finished = finishBoardRoom(playing, { game: playing.game, now: 1300 }).room;
        const gomokuDone = finishBoardRoom(makeRoom(1000), { game: makeRoom(1000).game, now: 1300 }).room;
        const list = m.listLobbyBoardRooms([waiting, finished, gomokuDone], { gameType: 'alkkagi', now: 2000 });
        assert.deepEqual(list.map((r) => r.id), ['alk_1']);
        const gomoku = m.listLobbyBoardRooms([waiting, finished, gomokuDone], { gameType: 'gomoku', now: 2000 });
        assert.equal(gomoku.length, 1);
        assert.equal(gomoku[0].status, 'finished');
        // 10분 넘게 비어 있던 방도 빠져요.
        assert.deepEqual(m.listLobbyBoardRooms([waiting], { gameType: 'alkkagi', now: 1000 + BOARD_ROOM_IDLE_TTL_MS }), []);
    });
});

describe('알까기 방 지우기', () => {
    const mod = roomLib;
    function alkWaiting(now = 1000) {
        return mod.createBoardRoom({ gameType: 'alkkagi', hostId: '1', hostName: '민준', now, id: mod.hostBoardRoomId('alkkagi', '1') }).room;
    }

    it('방장은 대기 중인 자기 방을 지울 수 있다(참가 신청이 와 있어도)', () => {
        const waiting = alkWaiting();
        const asked = requestJoinBoardRoom(waiting, { studentId: '2', studentName: '서연', now: 1100 }).room;
        const out = mod.deleteWaitingBoardRoom(asked, { actorId: '1', now: 1200 });
        assert.equal(out.ok, true);
        assert.equal(out.room.status, 'closed');
        assert.equal(listVisibleBoardRooms([out.room], 1300).length, 0);
    });

    it('방장이 아니면 지울 수 없다', () => {
        const waiting = alkWaiting();
        const out = mod.deleteWaitingBoardRoom(waiting, { actorId: '2', now: 1200 });
        assert.equal(out.ok, false);
        assert.equal(out.error, 'host_only');
        assert.equal(mod.deleteWaitingBoardRoom(waiting, { actorId: '', now: 1200 }).error, 'host_only');
    });

    it('판이 시작됐거나 끝난 방은 지우지 않고 기권·나가기로 끝낸다', () => {
        const waiting = alkWaiting();
        const asked = requestJoinBoardRoom(waiting, { studentId: '2', studentName: '서연', now: 1100 });
        const playing = approveJoinBoardRoom(asked.room, { hostId: '1', studentId: '2', now: 1200 }).room;
        const out = mod.deleteWaitingBoardRoom(playing, { actorId: '1', now: 1300 });
        assert.equal(out.ok, false);
        assert.equal(out.error, 'delete_waiting_only');
        assert.match(mod.boardRoomErrorText('delete_waiting_only'), /나가기/);
        const finished = finishBoardRoom(playing, { game: playing.game, now: 1400 }).room;
        assert.equal(mod.deleteWaitingBoardRoom(finished, { actorId: '1', now: 1500 }).error, 'delete_waiting_only');
    });

    it('이미 닫힌 방을 또 지워도 문제없이 끝난다', () => {
        const waiting = alkWaiting();
        const closed = mod.deleteWaitingBoardRoom(waiting, { actorId: '1', now: 1200 }).room;
        const again = mod.deleteWaitingBoardRoom(closed, { actorId: '1', now: 1300 });
        assert.equal(again.ok, true);
        assert.equal(again.room.status, 'closed');
    });
});
