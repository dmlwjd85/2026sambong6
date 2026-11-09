import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boardSwitchVisible, isSwitchableBoardGame, parkBoardAiSession, planBoardGameSwitch } from './boardGameSwitch.js';

describe('오목·체스 전환 탭', () => {
    it('오목·체스만 전환 대상(알까기 제외)', () => {
        assert.equal(isSwitchableBoardGame('gomoku'), true);
        assert.equal(isSwitchableBoardGame('chess'), true);
        assert.equal(isSwitchableBoardGame('alkkagi'), false);
        assert.equal(isSwitchableBoardGame(''), false);
    });
    it('탭은 오목·체스 방 목록·판 화면에서만 보임', () => {
        assert.equal(boardSwitchVisible('lobby', 'gomoku'), true);
        assert.equal(boardSwitchVisible('play', 'chess'), true);
        assert.equal(boardSwitchVisible('home', 'gomoku'), false);
        assert.equal(boardSwitchVisible('play', 'alkkagi'), false);
    });
    it('같은 게임이면 아무것도 안 함', () => {
        assert.equal(planBoardGameSwitch({ target: 'gomoku', view: 'lobby', current: 'gomoku' }).action, 'none');
    });
    it('방 목록에서 바꾸면 다른 게임 방 목록으로', () => {
        assert.deepEqual(planBoardGameSwitch({ target: 'chess', view: 'lobby', current: 'gomoku' }), { action: 'lobby', target: 'chess', park: '' });
    });
    it('AI 판 중에 바꾸면 지금 판을 멈춰 두고 이동', () => {
        assert.deepEqual(planBoardGameSwitch({ target: 'chess', view: 'play', current: 'gomoku' }), { action: 'lobby', target: 'chess', park: 'gomoku' });
    });
    it('멈춰 둔 판이 있으면 이어 두기', () => {
        assert.deepEqual(
            planBoardGameSwitch({ target: 'gomoku', view: 'play', current: 'chess', parked: { gomoku: { game: {} } } }),
            { action: 'resume', target: 'gomoku', park: 'chess' },
        );
        assert.equal(planBoardGameSwitch({ target: 'gomoku', view: 'lobby', current: 'chess', parked: { gomoku: {} } }).action, 'resume');
    });
    it('친구와 두는 판(PVP) 중에는 바꾸지 않음(나가면 패배라서)', () => {
        assert.equal(planBoardGameSwitch({ target: 'chess', view: 'play', current: 'gomoku', pvpLocked: true }).action, 'blocked');
    });
    it('잘못된 대상·화면은 무시', () => {
        assert.equal(planBoardGameSwitch({ target: 'alkkagi', view: 'lobby', current: 'gomoku' }).action, 'none');
        assert.equal(planBoardGameSwitch({ target: 'chess', view: 'home', current: 'gomoku' }).action, 'none');
    });
});

describe('AI 판 멈춰 두기', () => {
    it('토큰을 올려 생각 중이던 응답을 버리고, 판은 그대로', () => {
        const game = { cells: [1, 2, 3], turn: 'w' };
        const parked = parkBoardAiSession({ game, thinking: true, token: 4, level: 'gosu' });
        assert.equal(parked.token, 5);
        assert.equal(parked.thinking, false);
        assert.equal(parked.game, game);
        assert.equal(parked.level, 'gosu');
    });
    it('없으면 null', () => {
        assert.equal(parkBoardAiSession(null), null);
    });
});
