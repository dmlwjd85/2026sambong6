import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BOARD_LEFT_ROOMS_MAX,
    BOARD_LOBBY_QUERY_LIMIT,
    BOARD_MINE_QUERY_LIMIT,
    createBoardRoomId,
    parseBoardLeftRooms,
    rememberBoardLeftRoom,
    boardRoomInstanceKey,
    BOARD_ROOM_IDLE_TTL_MS,
    boardLobbyQueryStatuses,
    boardRoomParticipantIds,
    boardRoomScopeKey,
    boardRoomSubscriptionScope,
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

describe('boardGameRooms subscription scope (읽기 절약)', () => {
    it('boardRoomToDoc 에 방장·멤버·대기 신청 id 를 participantIds 로 넣어요', () => {
        const made = createBoardRoom({ gameType: 'gomoku', hostId: 'h1', hostName: '방장', now: 1000 });
        let room = requestJoinBoardRoom(made.room, { studentId: 's2', studentName: '둘', now: 1100 }).room;
        room = requestJoinBoardRoom(room, { studentId: 's3', studentName: '셋', now: 1200 }).room;
        room = rejectJoinBoardRoom(room, { hostId: 'h1', studentId: 's3', now: 1300 }).room;
        assert.deepEqual(boardRoomParticipantIds(room), ['h1', 's2']);
        assert.deepEqual(boardRoomToDoc(room).participantIds, ['h1', 's2']);
        const approved = approveJoinBoardRoom(room, { hostId: 'h1', studentId: 's2', now: 1400 }).room;
        assert.deepEqual(boardRoomToDoc(approved).participantIds, ['h1', 's2']);
        assert.deepEqual(boardRoomParticipantIds(null), []);
    });

    it('보드게임 창이 아니면 아무 방도 구독하지 않아요', () => {
        const s = boardRoomSubscriptionScope({ toolOpen: false, view: 'lobby', gameType: 'gomoku', selfId: 'a', lobbyVisible: true });
        assert.deepEqual(s, { lobbyGameType: '', mineId: '', roomId: '' });
        assert.deepEqual(boardRoomSubscriptionScope(), { lobbyGameType: '', mineId: '', roomId: '' });
    });

    it('로비가 보일 때만 그 게임 목록과 내 방을 구독해요', () => {
        assert.deepEqual(
            boardRoomSubscriptionScope({ toolOpen: true, view: 'lobby', gameType: 'chess', selfId: 'a', lobbyVisible: true }),
            { lobbyGameType: 'chess', mineId: 'a', roomId: '' },
        );
        assert.deepEqual(
            boardRoomSubscriptionScope({ toolOpen: true, view: 'lobby', gameType: 'chess', selfId: 'a', lobbyVisible: false }),
            { lobbyGameType: '', mineId: '', roomId: '' },
        );
        assert.equal(boardRoomSubscriptionScope({ toolOpen: true, view: 'lobby', gameType: 'nope', selfId: 'a', lobbyVisible: true }).lobbyGameType, '');
        assert.equal(boardRoomSubscriptionScope({ toolOpen: true, view: 'home', gameType: 'gomoku', selfId: 'a', lobbyVisible: true }).lobbyGameType, '');
    });

    it('대전 중에는 내 방 문서 하나만, AI·혼자 하기는 구독하지 않아요', () => {
        assert.deepEqual(
            boardRoomSubscriptionScope({ toolOpen: true, view: 'play', gameType: 'gomoku', activeRoomId: 'r1', selfId: 'a', lobbyVisible: false }),
            { lobbyGameType: '', mineId: '', roomId: 'r1' },
        );
        assert.equal(boardRoomSubscriptionScope({ toolOpen: true, view: 'play', activeRoomId: 'r1', localPlay: true }).roomId, '');
    });

    it('범위 키와 로비 상태 목록', () => {
        assert.equal(boardRoomScopeKey({ lobbyGameType: 'gomoku', mineId: 'a', roomId: '' }), 'gomoku|a|');
        assert.equal(boardRoomScopeKey(null), '||');
        assert.deepEqual(boardLobbyQueryStatuses('alkkagi'), ['waiting', 'playing']);
        assert.deepEqual(boardLobbyQueryStatuses('gomoku'), ['waiting', 'playing', 'finished']);
        assert.ok(BOARD_LOBBY_QUERY_LIMIT >= 20);
    });
});

describe('방 정리(30분·hostUid)', () => {
    const MIN = 60 * 1000;
    const T0 = 1_700_000_000_000;
    function room(extra = {}) {
        const made = createBoardRoom({ gameType: 'gomoku', hostId: '1', hostName: '민준', now: T0, hostUid: 'uid-a', ...extra });
        return made.room;
    }

    it('새 방에 hostUid를 넣고, 정리(sanitize)·문서 변환·수정 뒤에도 남겨요', () => {
        const r = room();
        assert.equal(r.hostUid, 'uid-a');
        assert.equal(sanitizeBoardRoom(boardRoomToDoc(r)).hostUid, 'uid-a');
        const joined = requestJoinBoardRoom(r, { studentId: '2', studentName: '서연', now: T0 + MIN });
        assert.equal(boardRoomToDoc(joined.room).hostUid, 'uid-a');
        const old = sanitizeBoardRoom({ id: 'bg_old', gameType: 'chess', hostId: '3', status: 'waiting', createdAt: T0 });
        assert.equal(old.hostUid, '');
        assert.equal(sanitizeBoardRoom({ ...old, hostUid: 42 }).hostUid, '');
    });

    it('만든 지 30분이 지나면 목록에서 숨겨요(활동이 있어도)', () => {
        const r = touch(room(), T0 + 29 * MIN);
        assert.equal(roomLib.listLobbyBoardRooms([r], { gameType: 'gomoku', now: T0 + 29 * MIN }).length, 1);
        const r2 = touch(room(), T0 + 30 * MIN);
        assert.equal(roomLib.isBoardRoomPastListAge(r2, T0 + 30 * MIN), true);
        assert.equal(roomLib.listLobbyBoardRooms([r2], { gameType: 'gomoku', now: T0 + 30 * MIN }).length, 0);
    });

    function touch(r, t) { return { ...r, lastActivityAt: t, updatedAt: t }; }

    it('30분 지난 대기·끝난 방은 누구나 정리 대상, 두는 중이고 10분 안에 활동한 판은 빼요', () => {
        const now = T0 + 31 * MIN;
        assert.equal(roomLib.boardRoomCleanupDue(room(), { now, uid: 'uid-b' }), true);
        assert.equal(roomLib.boardRoomCleanupDue({ ...room(), status: 'finished' }, { now, uid: 'uid-b' }), true);
        const playingActive = { ...room(), status: 'playing', lastActivityAt: now - 9 * MIN };
        assert.equal(roomLib.boardRoomCleanupDue(playingActive, { now, uid: 'uid-b' }), false);
        const playingIdle = { ...room(), status: 'playing', lastActivityAt: now - 10 * MIN };
        assert.equal(roomLib.boardRoomCleanupDue(playingIdle, { now, uid: 'uid-b' }), true);
    });

    it('30분 전 방은 10분 쉬어도 내 방이거나 hostUid 없는 옛 방일 때만 지워요', () => {
        const now = T0 + 12 * MIN;
        const r = room();
        assert.equal(roomLib.boardRoomCleanupDue(r, { now, uid: 'uid-b' }), false);
        assert.equal(roomLib.boardRoomCleanupDue(r, { now, uid: 'uid-a' }), true);
        assert.equal(roomLib.boardRoomCleanupDue({ ...r, hostUid: '' }, { now, uid: 'uid-b' }), true);
        assert.equal(roomLib.boardRoomCleanupDue(r, { now: T0 + 5 * MIN, uid: 'uid-a' }), false);
    });

    it('정리한 방은 기기에 기억해 다시 고르지 않고, 하루 지난 기억은 버려요', () => {
        const now = T0 + 31 * MIN;
        const a = { ...room(), id: 'bg_a' };
        const b = { ...room(), id: 'bg_b' };
        const first = roomLib.pickBoardRoomsToCleanup([a, b, a], { now, uid: 'x' });
        assert.deepEqual(first.map((r) => r.id), ['bg_a', 'bg_b']);
        let mem = roomLib.rememberBoardRoomCleaned({}, roomLib.boardRoomCleanupKey(a), now);
        assert.deepEqual(roomLib.pickBoardRoomsToCleanup([a, b], { now, uid: 'x', memory: JSON.stringify(mem) }).map((r) => r.id), ['bg_b']);
        // 같은 id라도 새로 만든 방(createdAt이 다름)은 따로 봐요
        const a2 = { ...a, createdAt: T0 + 1 };
        assert.deepEqual(roomLib.pickBoardRoomsToCleanup([a2], { now: now + 1, uid: 'x', memory: mem }).map((r) => r.id), ['bg_a']);
        const later = now + roomLib.BOARD_ROOM_CLEANED_MEMORY_MS;
        assert.deepEqual(roomLib.parseBoardRoomCleanedMemory(mem, later), {});
        assert.deepEqual(roomLib.parseBoardRoomCleanedMemory('깨진값', now), {});
        for (let i = 0; i < roomLib.BOARD_ROOM_CLEANED_MEMORY_MAX + 5; i++) mem = roomLib.rememberBoardRoomCleaned(mem, `k${i}`, now + i);
        assert.equal(Object.keys(mem).length, roomLib.BOARD_ROOM_CLEANED_MEMORY_MAX);
    });

    it('30분 지난 알까기 대기 방은 다시 쓰지 않고 새로 만들어요', () => {
        const made = createBoardRoom({ gameType: 'alkkagi', hostId: '1', hostName: '민준', now: T0, id: 'alk_1', hostUid: 'uid-a' }).room;
        const fresh = touch(made, T0 + 29 * MIN);
        assert.equal(roomLib.decideBoardRoomCreate(fresh, { hostId: '1', now: T0 + 29 * MIN }).action, 'reuse');
        const old = touch(made, T0 + 30 * MIN);
        assert.equal(roomLib.decideBoardRoomCreate(old, { hostId: '1', now: T0 + 30 * MIN }).action, 'create');
    });
});

// Firestore는 orderBy 없이 limit을 걸면 문서 id 오름차순으로 앞에서부터 잘라요(같은 바이트 순서로 흉내 내요).
function firestoreLimit(rooms, pred, n) {
    return rooms.filter(pred).sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0))).slice(0, n);
}

describe('방이 많아도 새 방이 목록에 보여요(정렬·색인 없이)', () => {
    const T0 = Date.UTC(2026, 9, 27, 1, 0, 0);

    it('새 방 id일수록 앞에 오고, 예전 id(bg_+시각)보다도 앞이에요', () => {
        const a = createBoardRoomId(T0);
        const b = createBoardRoomId(T0 + 1);
        const c = createBoardRoomId(T0 + 60 * 60 * 1000);
        assert.match(a, /^bg_0[0-9a-z]{9}_[0-9a-z]{6}$/);
        assert.ok(c < b && b < a);
        const legacy = `bg_${(T0 + 5 * 60 * 60 * 1000).toString(36)}_abcdef`;
        assert.ok(a < legacy, '예전 형식 방은 새 형식 뒤에 와요');
        assert.ok(a.length <= 40);
    });

    it('같은 종류 방이 31개 넘게 있어도 방금 만든 방이 로비 질의(limit)에 들어가요', () => {
        const rooms = [];
        for (let i = 0; i < 35; i++) {
            const st = ['waiting', 'playing', 'finished'][i % 3];
            const made = createBoardRoom({ gameType: 'gomoku', hostId: `h${i}`, hostName: `방장${i}`, now: T0 + i * 1000 }).room;
            rooms.push({ ...made, status: st });
        }
        const fresh = createBoardRoom({ gameType: 'gomoku', hostId: 'new1', hostName: '새방장', now: T0 + 40 * 1000 }).room;
        rooms.push(fresh);
        assert.ok(rooms.length > BOARD_LOBBY_QUERY_LIMIT);
        const statuses = boardLobbyQueryStatuses('gomoku');
        const got = firestoreLimit(rooms, (r) => r.gameType === 'gomoku' && statuses.includes(r.status), BOARD_LOBBY_QUERY_LIMIT);
        assert.equal(got.length, BOARD_LOBBY_QUERY_LIMIT);
        assert.ok(got.some((r) => r.id === fresh.id), '새 방이 보여야 해요');
        // 잘리는 건 가장 옛 방들이에요.
        assert.ok(!got.some((r) => r.hostId === 'h0'));
        assert.ok(listVisibleBoardRooms(got, T0 + 41 * 1000).some((r) => r.id === fresh.id));
    });

    it('내 방이 11개 넘게 있어도 방금 참가 신청한 방이 내 방 질의(limit)에 들어가요', () => {
        const rooms = [];
        for (let i = 0; i < 12; i++) {
            const type = i % 2 ? 'chess' : 'gomoku';
            const made = createBoardRoom({ gameType: type, hostId: `m${i}`, hostName: `방장${i}`, now: T0 + i * 1000 }).room;
            const asked = requestJoinBoardRoom(made, { studentId: 's1', studentName: '나', now: T0 + i * 1000 + 10 }).room;
            rooms.push(boardRoomToDoc(asked));
        }
        const fresh = createBoardRoom({ gameType: 'chess', hostId: 'mx', hostName: '새방장', now: T0 + 60 * 1000 }).room;
        const freshAsked = boardRoomToDoc(requestJoinBoardRoom(fresh, { studentId: 's1', studentName: '나', now: T0 + 61 * 1000 }).room);
        rooms.push(freshAsked);
        assert.ok(rooms.length > BOARD_MINE_QUERY_LIMIT);
        const got = firestoreLimit(rooms, (r) => r.participantIds.includes('s1'), BOARD_MINE_QUERY_LIMIT);
        assert.equal(got.length, BOARD_MINE_QUERY_LIMIT);
        assert.ok(got.some((r) => r.id === fresh.id), '새로 신청한 방이 보여야 해요');
    });
});

describe('나온 끝난 방 기억(sessionStorage)', () => {
    it('저장·읽기와 상한, 깨진 값', () => {
        const room = createBoardRoom({ gameType: 'gomoku', hostId: 'a', hostName: 'A', now: 1000 }).room;
        const key = boardRoomInstanceKey(room);
        const saved = JSON.stringify(rememberBoardLeftRoom([], key));
        assert.deepEqual(parseBoardLeftRooms(saved), [key]);
        assert.deepEqual(parseBoardLeftRooms('{깨짐'), []);
        assert.deepEqual(parseBoardLeftRooms(null), []);
        let list = [];
        for (let i = 0; i < BOARD_LEFT_ROOMS_MAX + 5; i++) list = rememberBoardLeftRoom(list, `r${i}:1`);
        assert.equal(list.length, BOARD_LEFT_ROOMS_MAX);
        assert.equal(list[list.length - 1], `r${BOARD_LEFT_ROOMS_MAX + 4}:1`);
        assert.ok(!list.includes('r0:1'));
        assert.deepEqual(rememberBoardLeftRoom(['x:1', 'y:1'], 'x:1'), ['y:1', 'x:1']);
    });
});

describe('방 규칙 강화에 맞춘 클라이언트(uid·memberUids·활동 시각)', () => {
    const {
        createBoardRoom: mk, requestJoinBoardRoom: join, approveJoinBoardRoom: approve, boardRoomToDoc: toDoc,
        sanitizeBoardRoom: clean, boardRoomCleanupDelayMs, claimBoardRoomHostUid, BOARD_ROOM_CLEANUP_SPREAD_MS,
    } = roomLib;

    it('참가 신청의 uid가 승인 때 자리로 옮겨지고, 문서에 memberUids로 들어가요', () => {
        const made = mk({ gameType: 'gomoku', hostId: '1', hostName: '민준', now: 1000, hostUid: 'uid-h', id: 'bg_a' });
        assert.equal(made.room.members[0].uid, 'uid-h');
        const j = join(made.room, { studentId: '2', studentName: '서연', now: 2000, uid: 'uid-p' });
        assert.equal(j.room.joinRequests[0].uid, 'uid-p');
        const a = approve(j.room, { hostId: '1', studentId: '2', now: 3000 });
        assert.equal(a.ok, true);
        assert.deepEqual(toDoc(a.room).memberUids, ['uid-h', 'uid-p']);
    });

    it('uid가 없는 옛 자리는 그대로 둬요(빈 uid 칸을 새로 넣지 않아요)', () => {
        const r = clean({ id: 'bg_b', gameType: 'gomoku', hostId: '1', members: [{ id: '1', name: '민준', role: 'host', seat: 'black' }] }, 1000);
        assert.equal('uid' in r.members[0], false);
        assert.deepEqual(toDoc(r).memberUids, []);
        // 문서를 다시 읽어 다시 써도 자리 칸이 바뀌지 않아요(규칙의 members 비교가 흔들리지 않게)
        const again = clean(toDoc(r), 2000);
        assert.deepEqual(again.members, r.members);
    });

    it('마지막 활동 시각은 기기 시계가 늦어도 줄지 않아요', () => {
        const made = mk({ gameType: 'gomoku', hostId: '1', hostName: '민준', now: 10_000, hostUid: 'uid-h', id: 'bg_c' });
        const j = join(made.room, { studentId: '2', studentName: '서연', now: 5_000, uid: 'uid-p' });
        assert.equal(j.room.lastActivityAt, 10_000);
        const k = join(made.room, { studentId: '3', studentName: '지우', now: 20_000, uid: 'uid-q' });
        assert.equal(k.room.lastActivityAt, 20_000);
    });

    it('정리 대기 시간: 내 방은 바로, 남의 방은 기기마다 다른 0~9초', () => {
        const room = { id: 'bg_d', createdAt: 1, hostUid: 'uid-h' };
        assert.equal(boardRoomCleanupDelayMs(room, 'uid-h'), 0);
        const waits = ['uid-1', 'uid-2', 'uid-3', 'uid-4', 'uid-5'].map((u) => boardRoomCleanupDelayMs(room, u));
        waits.forEach((w) => assert.ok(w >= 0 && w < BOARD_ROOM_CLEANUP_SPREAD_MS));
        assert.ok(new Set(waits).size >= 4, `기기마다 달라야 해요: ${waits}`);
        assert.equal(boardRoomCleanupDelayMs(room, 'uid-1'), waits[0]);
    });

    it('hostUid가 지워진 내 방은 방장이 다시 쓸 때 내 uid를 되찾고, 남의 방은 건드리지 않아요', () => {
        const wiped = clean({ id: 'alk_1', gameType: 'alkkagi', hostId: '1', members: [{ id: '1', role: 'host' }, { id: '2', uid: 'uid-p' }] }, 1000);
        assert.equal(wiped.hostUid, '');
        const mine = claimBoardRoomHostUid(wiped, { hostId: '1', uid: 'uid-h' });
        assert.equal(mine.hostUid, 'uid-h');
        assert.equal(mine.members[0].uid, 'uid-h');
        assert.equal(mine.members[1].uid, 'uid-p');
        assert.equal(claimBoardRoomHostUid(wiped, { hostId: '2', uid: 'uid-p' }), wiped);
        const owned = { ...wiped, hostUid: 'uid-x' };
        assert.equal(claimBoardRoomHostUid(owned, { hostId: '1', uid: 'uid-h' }), owned);
    });
});

describe('#86 r3: 끝난 방 자동 입장·내 방 나눠 받기·한 판 더 판 번호', () => {
    const m = roomLib;
    function finishedPair(now = 1000) {
        let room = createBoardRoom({ gameType: 'gomoku', hostId: 'a', hostName: '가', now }).room;
        room = requestJoinBoardRoom(room, { studentId: 'b', studentName: '나', now: now + 100 }).room;
        room = approveJoinBoardRoom(room, { hostId: 'a', studentId: 'b', now: now + 200 }).room;
        return finishBoardRoom(room, { game: { ...room.game, winner: 1, endReason: 'five' }, now: now + 300 }).room;
    }

    it('N1: 새 탭에서 처음 받은 끝난 옛 판에는 들어가지 않고, 두는 판에는 들어간다', () => {
        const fin = finishedPair(1000);
        const opts = { selfId: 'b', leftKeys: new Set(), seenLiveKeys: new Set(), sinceMs: 50_000 };
        assert.equal(m.shouldAutoEnterBoardRoom(fin, opts), false);
        const playing = continueBoardRoom(fin, { actorId: 'a', now: 60_000 }).room;
        assert.equal(m.shouldAutoEnterBoardRoom(playing, opts), true);
        assert.equal(m.shouldAutoEnterBoardRoom(playing, { ...opts, selfId: 'z' }), false);
    });

    it('N1: 이 화면에서 두는 걸 봤거나, 화면을 연 뒤에 끝난 판이면 결과로 들어간다', () => {
        const fin = finishedPair(100_000);
        const key = boardRoomInstanceKey(fin);
        assert.equal(m.shouldAutoEnterBoardRoom(fin, { selfId: 'b', seenLiveKeys: new Set([key]), sinceMs: 999_999 }), true);
        assert.equal(m.shouldAutoEnterBoardRoom(fin, { selfId: 'b', sinceMs: 100_000 }), true);
        assert.equal(m.shouldAutoEnterBoardRoom(fin, { selfId: 'b', leftKeys: new Set([key]), sinceMs: 1 }), false);
    });

    it('N1: 끝난 알까기·기다리는 방에는 저절로 들어가지 않는다', () => {
        const fin = { ...finishedPair(100_000), gameType: 'alkkagi', id: 'alk_a' };
        assert.equal(m.shouldAutoEnterBoardRoom(fin, { selfId: 'b', sinceMs: 1 }), false);
        const waiting = createBoardRoom({ gameType: 'gomoku', hostId: 'a', now: 1000 }).room;
        assert.equal(m.shouldAutoEnterBoardRoom(waiting, { selfId: 'a', sinceMs: 1 }), false);
    });

    it('N3: 한 판 더를 누르면 판 번호가 올라 키가 바뀌고, 방 id·만든 시각·방장은 그대로다', () => {
        const fin = finishedPair(1000);
        assert.equal(fin.round, 0);
        const oldKey = boardRoomInstanceKey(fin);
        const next = continueBoardRoom(fin, { actorId: 'a', now: 9000 }).room;
        assert.equal(next.round, 1);
        assert.equal(next.id, fin.id);
        assert.equal(next.createdAt, fin.createdAt);
        assert.equal(next.hostId, fin.hostId);
        assert.notEqual(boardRoomInstanceKey(next), oldKey);
        assert.equal(boardRoomInstanceKey(next), `${fin.id}:${fin.createdAt}:1`);
        // 앞 판에서 나온 B도 새 판에는 다시 들어와요.
        assert.equal(m.shouldAutoEnterBoardRoom(next, { selfId: 'b', leftKeys: new Set([oldKey]), sinceMs: 1 }), true);
        // 문서로 저장했다 다시 읽어도 판 번호가 남아요.
        assert.equal(sanitizeBoardRoom(boardRoomToDoc(next)).round, 1);
        const again = continueBoardRoom(finishBoardRoom(next, { game: next.game, now: 9500 }).room, { actorId: 'b', now: 9600 }).room;
        assert.equal(again.round, 2);
    });

    it('N3: 판 번호가 이상한 값이면 0으로 읽는다(예전 문서 호환)', () => {
        assert.equal(sanitizeBoardRoom({ id: 'x', round: -3 }).round, 0);
        assert.equal(sanitizeBoardRoom({ id: 'x', round: 'abc' }).round, 0);
        assert.equal(sanitizeBoardRoom({ id: 'x' }).round, 0);
        assert.equal(sanitizeBoardRoom({ id: 'x', round: 2.7 }).round, 2);
    });

    it('N2: 상대 12명과 끝난 알까기 방이 있어도 새 오목 방은 오목·체스 내 방 칸에 들어온다', () => {
        const split = m.BOARD_MINE_ID_SPLIT;
        const alk = Array.from({ length: 12 }, (_, i) => `alk_s${String(i).padStart(2, '0')}`);
        const oldBg = Array.from({ length: 3 }, (_, i) => `bg_${(1_700_000_000_000 + i).toString(36)}`);
        const fresh = createBoardRoomId(1_800_000_000_000);
        const all = [...alk, ...oldBg, fresh].sort();
        // 예전 한 질의: id 오름차순으로 10개 → 알까기 방만 와요.
        assert.ok(!all.slice(0, BOARD_MINE_QUERY_LIMIT).includes(fresh));
        // 새 질의: bg_ 부터 10개 + bg_ 앞(알까기) 따로.
        const bgPart = all.filter((id) => id >= split).slice(0, BOARD_MINE_QUERY_LIMIT);
        const other = all.filter((id) => id < split).slice(0, m.BOARD_MINE_OTHER_QUERY_LIMIT);
        assert.equal(bgPart[0], fresh);
        assert.equal(other.length, 12);
        assert.ok(alk.every((id) => id < split));
        assert.ok(m.hostBoardRoomId('alkkagi', 'zzzz') < split);
        assert.ok(createBoardRoomId(0) >= split && createBoardRoomId(Date.now()) >= split);
    });
});
