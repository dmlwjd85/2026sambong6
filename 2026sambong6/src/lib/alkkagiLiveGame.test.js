import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './alkkagiLiveGame.js';
import * as R from './boardGameRooms.js';
import { alkkagiFinalShot } from './alkkagiAim.js';
import { quantizeAlkkagiShot } from './alkkagiPhysics.js';

describe('실시간 알까기 방', () => {
    it('카탈로그·방장별 고정 id(alkl_)·흑 자리로 만들어요', () => {
        assert.equal(R.getBoardGameDef('alkkagiLive').label, '실시간 알까기');
        assert.equal(R.hostBoardRoomId('alkkagiLive', '7'), 'alkl_7');
        assert.equal(R.hostBoardRoomId('alkkagi', '7'), 'alk_7');
        assert.equal(R.hostBoardRoomId('gomoku', '7'), '');
        const made = R.createBoardRoom({ gameType: 'alkkagiLive', hostId: '7', hostName: '칠', now: 1000, id: 'alkl_7' });
        assert.equal(made.ok, true);
        assert.equal(made.room.members[0].seat, 'black');
        assert.equal(made.room.game.mode, 'live');
        assert.equal(made.room.game.stones.length, 10);
    });

    it('참가 승인하면 백 자리로 바로 시작하고, 판 요약이 문서로 저장돼요', () => {
        let room = R.createBoardRoom({ gameType: 'alkkagiLive', hostId: '7', hostName: '칠', now: 1000, id: 'alkl_7' }).room;
        room = R.requestJoinBoardRoom(room, { studentId: '9', studentName: '구', now: 1100 }).room;
        const ap = R.approveJoinBoardRoom(room, { hostId: '7', studentId: '9', now: 1200 });
        assert.equal(ap.ok, true);
        assert.equal(ap.room.status, 'playing');
        assert.equal(ap.room.members.find((m) => m.id === '9').seat, 'white');
        assert.equal(ap.room.game.gid, 1200);
        const docRoom = R.boardRoomToDoc(ap.room);
        assert.equal(docRoom.gameType, 'alkkagiLive');
        assert.equal(docRoom.game.mode, 'live');
        assert.equal(Array.isArray(docRoom.game.stones), true);
        assert.equal(docRoom.timerEnabled, false);
        const back = R.sanitizeBoardRoom({ id: 'alkl_7', ...docRoom }, 1300);
        assert.deepEqual(back.game, ap.room.game);
    });

    it('끝난 실시간 방은 로비 목록에서 빠지고, 알까기 목록과는 따로 걸러져요', () => {
        const a = R.createBoardRoom({ gameType: 'alkkagiLive', hostId: '1', now: 1000, id: 'alkl_1' }).room;
        const b = { ...R.createBoardRoom({ gameType: 'alkkagiLive', hostId: '2', now: 1000, id: 'alkl_2' }).room, status: 'finished' };
        const c = R.createBoardRoom({ gameType: 'alkkagi', hostId: '3', now: 1000, id: 'alk_3' }).room;
        const live = R.listLobbyBoardRooms([a, b, c], { gameType: 'alkkagiLive', now: 2000 });
        assert.deepEqual(live.map((r) => r.id), ['alkl_1']);
        const turn = R.listLobbyBoardRooms([a, b, c], { gameType: 'alkkagi', now: 2000 });
        assert.deepEqual(turn.map((r) => r.id), ['alk_3']);
    });

    it('다시 하기는 새 gid로 판을 새로 시작해요', () => {
        let room = R.createBoardRoom({ gameType: 'alkkagiLive', hostId: '7', now: 1000, id: 'alkl_7' }).room;
        room = R.requestJoinBoardRoom(room, { studentId: '9', now: 1100 }).room;
        room = R.approveJoinBoardRoom(room, { hostId: '7', studentId: '9', now: 1200 }).room;
        const fin = L.applyAlkkagiLiveForfeit(room.game, { color: 'white', now: 1500 });
        room = R.applyBoardRoomGame(room, { game: fin.game, now: 1500, finished: true });
        assert.equal(room.status, 'finished');
        const again = R.continueBoardRoom(room, { actorId: '9', now: 2000 });
        assert.equal(again.ok, true);
        assert.equal(again.room.status, 'playing');
        assert.equal(again.room.game.gid, 2000);
        assert.equal(again.room.game.endReason, '');
    });
});

describe('실시간 알까기 판 요약', () => {
    it('나가면 기권패, 이미 끝난 판은 다시 바꾸지 않아요', () => {
        const g = L.emptyAlkkagiLiveGame({ now: 10 });
        const f = L.applyAlkkagiLiveForfeit(g, { color: 'black', now: 20 });
        assert.equal(f.ok, true);
        assert.equal(f.game.winner, 'white');
        assert.equal(f.game.endReason, 'forfeit');
        assert.equal(L.isAlkkagiLiveOver(f.game), true);
        const again = L.finishAlkkagiLiveGame(f.game, { winner: 'black', endReason: 'out', now: 30 });
        assert.equal(again.ok, false);
        assert.equal(again.error, 'already_over');
        assert.equal(L.applyAlkkagiLiveForfeit(g, { color: 'red' }).ok, false);
    });

    it('멈춘 판 판정: 상대 알 0개면 승, 둘 다 0개면 무승부', () => {
        const s = L.initialLiveStones();
        assert.deepEqual(L.judgeLiveStones(s), { winner: '', endReason: '' });
        const noWhite = s.map((t) => (t.color === 'white' ? { ...t, alive: false } : t));
        assert.deepEqual(L.judgeLiveStones(noWhite), { winner: 'black', endReason: 'out' });
        const none = s.map((t) => ({ ...t, alive: false }));
        assert.deepEqual(L.judgeLiveStones(none), { winner: '', endReason: 'draw' });
    });

    it('전적: 승·패·무, 연결 끊김은 무승부', () => {
        const g = L.emptyAlkkagiLiveGame({ now: 1 });
        const w = L.finishAlkkagiLiveGame(g, { winner: 'black', endReason: 'out', now: 2 }).game;
        assert.equal(L.alkkagiLiveRecordResult(w, 'black'), 'win');
        assert.equal(L.alkkagiLiveRecordResult(w, 'white'), 'loss');
        const d = L.finishAlkkagiLiveGame(g, { endReason: 'disconnect', winner: 'black', now: 2 }).game;
        assert.equal(d.winner, '');
        assert.equal(L.alkkagiLiveRecordResult(d, 'white'), 'draw');
        assert.equal(L.alkkagiLiveRecordResult(g, 'white'), '');
        assert.equal(L.alkkagiLiveResultKey({ id: 'alkl_7' }, g), 'alkl:alkl_7:1');
    });

    it('끝 문구는 학생 이름으로 보여 줘요', () => {
        const g = L.emptyAlkkagiLiveGame({ now: 1 });
        const f = L.applyAlkkagiLiveForfeit(g, { color: 'white', now: 2 }).game;
        assert.equal(L.alkkagiLiveEndText(f, { blackName: '가', whiteName: '나' }), '나님이 나가서 가님이 이겼어요.');
        assert.equal(L.alkkagiLiveResultTitle(f, { blackName: '가', whiteName: '나' }), '가 승리!');
        const d = L.finishAlkkagiLiveGame(g, { endReason: 'draw', now: 2 }).game;
        assert.equal(L.alkkagiLiveResultTitle(d), '비겼어요');
    });

    it('기권 버튼으로 지면 「기권해서」, 판에서 나가면 「나가서」라고 보여 줘요(전적은 둘 다 패)', () => {
        const g = L.emptyAlkkagiLiveGame({ now: 1 });
        const names = { blackName: '가', whiteName: '나' };
        const resign = L.applyAlkkagiLiveForfeit(g, { color: 'white', now: 2, how: 'resign' }).game;
        assert.equal(resign.forfeitHow, 'resign');
        assert.equal(L.alkkagiLiveEndText(resign, names), '나님이 기권해서 가님이 이겼어요.');
        assert.equal(L.alkkagiLiveRecordResult(resign, 'white'), 'loss');
        const left = L.applyAlkkagiLiveForfeit(g, { color: 'white', now: 2, how: 'left' }).game;
        assert.equal(left.forfeitHow, 'left');
        assert.equal(L.alkkagiLiveEndText(left, names), '나님이 나가서 가님이 이겼어요.');
        // 이상한 값·예전 문서(칸 없음)는 「나가서」로 보여요. 기권이 아닌 끝에는 칸이 비어요.
        assert.equal(L.applyAlkkagiLiveForfeit(g, { color: 'white', now: 2, how: 'hack' }).game.forfeitHow, 'left');
        assert.equal(L.sanitizeAlkkagiLiveGame({ ...resign, forfeitHow: 'x' }).forfeitHow, '');
        assert.equal(L.finishAlkkagiLiveGame(g, { winner: 'black', endReason: 'out', now: 2, forfeitHow: 'resign' }).game.forfeitHow, '');
        assert.equal(L.alkkagiLiveGameToDoc(resign).forfeitHow, 'resign');
    });

    it('1단계에서는 실시간 입구 스위치가 꺼져 있어요(#100에서 켜요)', () => {
        assert.equal(L.ALKKAGI_LIVE_ENABLED, false);
    });

    it('잘못된 값은 걸러요(알 id·좌표·승자 없는 out)', () => {
        const g = L.sanitizeAlkkagiLiveGame({ stones: [{ id: 'x1', x: 1, y: 1 }], endReason: 'out', winner: '' });
        assert.equal(g.stones.length, 10);
        assert.equal(g.endReason, '');
        const st = L.sanitizeLiveStones([{ id: 'b1', x: 1, y: 2, vx: 5000, vy: 'a' }, { id: 'b1', x: 9, y: 9 }]);
        assert.equal(st.length, 1);
        assert.equal(st[0].vx, 3000);
        assert.equal(st[0].vy, 0);
    });
});

describe('실시간 알까기 쿨다운·샷 의도', () => {
    it('5초 쿨다운 남은 시간과 표시', () => {
        assert.equal(L.liveCooldownLeft(0, 5000), 0);
        assert.equal(L.liveCooldownLeft(1000, 3000), 3000);
        assert.equal(L.liveCooldownLeft(1000, 7000), 0);
        assert.equal(L.liveCooldownLabel(3000), '3.0초');
        assert.equal(L.liveCooldownLabel(2010), '2.1초');
        assert.equal(L.liveCooldownLabel(0), '');
    });

    it('샷 형식: 내 색 알만, 정수 각도·힘', () => {
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'b1', a: 0, p: 500 }, 'black').ok, true);
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'w1', a: 0, p: 500 }, 'black').error, 'not_your_stone');
        // #100: 규칙과 같은 범위(힘 500~10000, 방향 ±31416)
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'b1', a: 0, p: 100 }, 'black').ok, false);
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'b1', a: 31416, p: 10000 }, 'black').ok, true);
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'b1', a: 0, p: 10001 }, 'black').ok, false);
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'b1', a: -31417, p: 5000 }, 'black').ok, false);
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'b1', a: 0, p: 0 }, 'black').ok, false);
        assert.equal(L.checkLiveShotShape({ v: 1, id: 'b1', a: 0, p: 10, x: 1 }, 'black').ok, false);
    });

    it('호스트가 받을 샷 고르기: 새 번호·같은 판·살아 있는 내 알·간격', () => {
        const st = { ...L.emptyLiveState({ gid: 100 }), applied: { black: 0, white: 2 }, lastShotAt: { black: 0, white: 10000 } };
        const shot = { v: 1, id: 'w1', a: 0, p: 5000 };
        assert.equal(L.decideLiveIntent(st, { seat: 'white', n: 3, gid: 100, shot, now: 15000 }).accept, true);
        assert.equal(L.decideLiveIntent(st, { seat: 'white', n: 2, gid: 100, shot, now: 15000 }).reason, 'seen');
        assert.equal(L.decideLiveIntent(st, { seat: 'white', n: 3, gid: 99, shot, now: 15000 }).reason, 'old_game');
        const cd = L.decideLiveIntent(st, { seat: 'white', n: 3, gid: 100, shot, now: 12000 });
        assert.equal(cd.reason, 'cooldown');
        assert.equal(cd.reject, true);
        const dead = { ...st, stones: st.stones.map((s) => (s.id === 'w1' ? { ...s, alive: false } : s)) };
        assert.equal(L.decideLiveIntent(dead, { seat: 'white', n: 3, gid: 100, shot, now: 15000 }).reason, 'not_alive');
        assert.equal(L.decideLiveIntent(st, { seat: 'white', n: 3, gid: 100, shot: { ...shot, id: 'b1' }, now: 15000 }).reason, 'not_your_stone');
        const over = { ...st, over: { endReason: 'out', winner: 'black' } };
        assert.equal(L.decideLiveIntent(over, { seat: 'white', n: 3, gid: 100, shot, now: 15000 }).reason, 'already_over');
    });

    it('스냅샷 문서: 물리 값(소수 6자리)을 그대로 담고 되읽어도 같아요', () => {
        const st = L.emptyLiveState({ gid: 5 });
        st.stones[0].vx = 12.345678;
        const d = L.liveStateToDoc(st);
        assert.equal(d.stones[0].vx, 12.345678);
        const back = L.sanitizeLiveState(d);
        assert.equal(back.gid, 5);
        assert.equal(back.stones.length, 10);
    });
});

describe('실시간 알까기 #100: 샷 범위·판 안내 문구', () => {
    it('앱이 낼 수 있는 샷은 모두 규칙 범위(힘 500~10000, 방향 ±31416) 안이에요', () => {
        // 판(alkkagiLiveBoard)은 당긴 정도 0.05(MIN_POWER) 미만이면 쏘지 않고, 최대 1이에요.
        for (const power of [0.05, 0.0500001, 0.3, 0.77, 1, 1.5]) {
            for (const angle of [-Math.PI, -Math.PI + 1e-9, -1, 0, 1, Math.PI - 1e-9, Math.PI, 7, -7]) {
                const shot = alkkagiFinalShot({ id: 'b1', angle, power }, () => 0.5);
                assert.ok(shot, `${power} ${angle}`);
                assert.ok(shot.p >= L.ALKKAGI_LIVE_SHOT_MIN_P && shot.p <= L.ALKKAGI_LIVE_SHOT_MAX_P, `p=${shot.p}`);
                assert.ok(Math.abs(shot.a) <= L.ALKKAGI_LIVE_SHOT_MAX_A, `a=${shot.a}`);
                assert.equal(L.checkLiveShotShape(shot, 'black').ok, true);
            }
        }
        // 끝값 확인: 최대 힘은 10000, 0.05는 500
        assert.equal(quantizeAlkkagiShot({ id: 'b1', angle: 0, power: 1 }).pi, 10000);
        assert.equal(quantizeAlkkagiShot({ id: 'b1', angle: 0, power: 0.05 }).pi, 500);
        assert.equal(quantizeAlkkagiShot({ id: 'b1', angle: Math.PI, power: 1 }).ai, 31416);
    });

    it('판 안내: 알약과 아래 안내가 같은 상태를 말해요(스위치 켬·끔 모두)', () => {
        const all = (g) => `${g.line} ${g.tip} ${g.who}`;
        // 스위치를 끈 배포: '동시에 쏘고' 같은 말을 하지 않아요
        const off = L.alkkagiLiveGuide({ enabled: false, seat: 'black' });
        assert.equal(off.phase, 'off');
        assert.ok(!/동시에|5초/.test(all(off)));
        // 켠 경우: 연결 전에는 '연결하는 중'이고, 쏠 수 있다고 말하지 않아요
        const conn = L.alkkagiLiveGuide({ enabled: true, seat: 'black', connected: false });
        assert.equal(conn.phase, 'connecting');
        assert.equal(conn.line, '판에 연결하는 중이에요');
        assert.ok(!/준비하고 있어요/.test(all(conn)));
        assert.ok(/연결되면/.test(conn.tip));
        assert.equal(L.alkkagiLiveGuide({ enabled: true, seat: 'white', connected: true, ready: false }).phase, 'connecting');
        // 연결되면 쏘는 법과 판 계산 기기 안내
        const host = L.alkkagiLiveGuide({ enabled: true, seat: 'black', connected: true, ready: true, isHost: true });
        assert.equal(host.phase, 'play');
        assert.equal(host.line, '지금 쏠 수 있어요');
        assert.ok(/당겼다 놓아요/.test(host.tip));
        assert.equal(host.who, '판 계산은 내 기기가 맡고 있어요.');
        assert.equal(L.alkkagiLiveGuide({ enabled: true, seat: 'white', connected: true, ready: true }).who, '판 계산은 방장 기기가 해요.');
        // 자리가 없으면 구경, 끝났으면 전적(스위치와 상관없이)
        assert.equal(L.alkkagiLiveGuide({ enabled: true, seat: '' }).phase, 'watch');
        const over = L.alkkagiLiveGuide({ enabled: false, over: true, seat: 'black', recordText: '1승 0패' });
        assert.equal(over.line, '판이 끝났어요');
        assert.equal(over.tip, '내 알까기 전적 1승 0패');
        // 기본값은 지금 스위치(꺼짐)를 따라요
        assert.equal(L.ALKKAGI_LIVE_ENABLED, false);
        assert.equal(L.alkkagiLiveGuide({ seat: 'black', connected: true, ready: true }).phase, 'off');
    });
});
