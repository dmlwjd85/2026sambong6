/**
 * 수업도구 보드게임 공통 방 API.
 *
 * 다음 보드게임을 추가할 때 이 모듈을 그대로 쓰세요.
 * 1) BOARD_GAME_CATALOG 에 게임 한 줄을 넣습니다 (id, 인원, 타이머).
 * 2) 승패·착수 등 게임 고유 로직은 별도 모듈(예: gomokuGame.js)에 둡니다.
 * 3) 방 문서는 Firestore `artifacts/{학급}/public/data/boardGameRooms/{roomId}` 입니다.
 * 4) 방장 승인·30초 타이머 권한·10분 방치 종료는 게임과 무관하게 여기서 처리합니다.
 *
 * 학급용 규칙 요약
 * - 방장만 참가 신청을 승인/거절하고, 턴 타이머를 켜고 끌 수 있습니다.
 * - 10분 동안 lastActivityAt 이 갱신되지 않으면 방은 만료되어 목록에서 빠집니다.
 * - 종료(closed) 또는 만료된 방은 목록에 보이지 않습니다.
 */

import { emptyChessGame, chessGameToDoc, sanitizeChessGame } from './chessGame.js';
import { emptyGomokuGame, gomokuGameToDoc, sanitizeGomokuGame } from './gomokuGame.js';

/** 10분 무활동이면 방을 자동 종료합니다. */
export const BOARD_ROOM_IDLE_TTL_MS = 10 * 60 * 1000;
export const BOARD_ROOM_DEFAULT_TIMER_SEC = 30;
export const BOARD_ROOM_STATUSES = Object.freeze(['waiting', 'playing', 'finished', 'closed']);
export const BOARD_JOIN_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);

/**
 * 등록된 보드게임. 새 게임은 여기에만 추가하면 로비·정원·타이머 기본값이 따라갑니다.
 * @type {Readonly<Record<string, { id: string, label: string, minPlayers: number, maxPlayers: number, timerSec: number }>>}
 */
export const BOARD_GAME_CATALOG = Object.freeze({
    gomoku: Object.freeze({
        id: 'gomoku',
        label: '오목',
        minPlayers: 2,
        maxPlayers: 2,
        timerSec: BOARD_ROOM_DEFAULT_TIMER_SEC,
    }),
    chess: Object.freeze({
        id: 'chess',
        label: '체스',
        minPlayers: 2,
        maxPlayers: 2,
        timerSec: BOARD_ROOM_DEFAULT_TIMER_SEC,
    }),
});

export function isBoardGameType(raw) {
    return Object.prototype.hasOwnProperty.call(BOARD_GAME_CATALOG, String(raw || ''));
}

export function getBoardGameDef(gameType) {
    return BOARD_GAME_CATALOG[String(gameType || '')] || null;
}

export function boardRoomStatusLabel(status) {
    const map = {
        waiting: '대기',
        playing: '대국 중',
        finished: '결과',
        closed: '종료',
    };
    return map[String(status || '')] || '대기';
}

export function createBoardRoomId() {
    return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanId(raw) {
    return String(raw || '').trim().slice(0, 20);
}

function cleanName(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

function sanitizeEpochMs(raw) {
    if (raw && typeof raw === 'object' && typeof raw.toMillis === 'function') {
        return Math.max(0, Math.floor(Number(raw.toMillis()) || 0));
    }
    if (raw && typeof raw === 'object' && raw.seconds != null) {
        const sec = Number(raw.seconds);
        const nano = Number(raw.nanoseconds) || 0;
        if (Number.isFinite(sec)) return Math.max(0, Math.floor(sec * 1000 + nano / 1e6));
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 1e9 && n < 1e12) return Math.floor(n * 1000);
    return Math.max(0, Math.floor(n));
}

function sanitizeTimerSec(raw, fallback = BOARD_ROOM_DEFAULT_TIMER_SEC) {
    const n = Math.floor(Number(raw) || 0);
    if (n < 5) return fallback;
    return Math.min(180, n);
}

function sanitizeMember(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    const role = raw.role === 'host' ? 'host' : 'player';
    const seat = raw.seat === 'black' || raw.seat === 'white' ? raw.seat : '';
    return {
        id,
        name: cleanName(raw.name) || id,
        role,
        seat,
    };
}

function sanitizeJoinRequest(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    const status = BOARD_JOIN_STATUSES.includes(String(raw.status)) ? String(raw.status) : 'pending';
    return {
        id,
        name: cleanName(raw.name) || id,
        status,
        at: sanitizeEpochMs(raw.at),
    };
}

function uniqueById(list) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
        if (!item || !item.id || seen.has(item.id)) return;
        seen.add(item.id);
        out.push(item);
    });
    return out;
}

function emptyGameForType(gameType, now) {
    if (gameType === 'gomoku') return emptyGomokuGame({ now });
    if (gameType === 'chess') return emptyChessGame({ now });
    return null;
}

function sanitizeGameForType(gameType, raw, now) {
    if (gameType === 'gomoku') return sanitizeGomokuGame(raw, { now });
    if (gameType === 'chess') return sanitizeChessGame(raw, { now });
    return raw && typeof raw === 'object' ? raw : null;
}

export function emptyBoardRoom(gameType = 'gomoku', now = 0) {
    const def = getBoardGameDef(gameType) || BOARD_GAME_CATALOG.gomoku;
    const t = Math.max(0, Math.floor(Number(now) || 0));
    return {
        id: '',
        gameType: def.id,
        status: 'waiting',
        hostId: '',
        hostName: '',
        minPlayers: def.minPlayers,
        maxPlayers: def.maxPlayers,
        members: [],
        joinRequests: [],
        timerEnabled: false,
        timerSec: def.timerSec,
        lastActivityAt: t,
        createdAt: t,
        updatedAt: t,
        game: emptyGameForType(def.id, t),
    };
}

export function sanitizeBoardRoom(raw, now = 0) {
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyBoardRoom('gomoku', t);
    const def = getBoardGameDef(raw.gameType) || BOARD_GAME_CATALOG.gomoku;
    const status = BOARD_ROOM_STATUSES.includes(String(raw.status)) ? String(raw.status) : 'waiting';
    const hostId = cleanId(raw.hostId);
    const members = uniqueById((Array.isArray(raw.members) ? raw.members : []).map(sanitizeMember).filter(Boolean)).slice(0, 8);
    const joinRequests = uniqueById((Array.isArray(raw.joinRequests) ? raw.joinRequests : []).map(sanitizeJoinRequest).filter(Boolean)).slice(0, 40);
    const createdAt = sanitizeEpochMs(raw.createdAt) || t;
    const updatedAt = sanitizeEpochMs(raw.updatedAt) || createdAt;
    const lastActivityAt = sanitizeEpochMs(raw.lastActivityAt) || updatedAt || createdAt;
    return {
        id: String(raw.id || '').trim().slice(0, 40),
        gameType: def.id,
        status,
        hostId,
        hostName: cleanName(raw.hostName) || hostId,
        minPlayers: def.minPlayers,
        maxPlayers: def.maxPlayers,
        members,
        joinRequests,
        timerEnabled: raw.timerEnabled === true,
        timerSec: sanitizeTimerSec(raw.timerSec, def.timerSec),
        lastActivityAt,
        createdAt,
        updatedAt,
        game: sanitizeGameForType(def.id, raw.game, t || updatedAt),
    };
}

function touchRoom(room, now, extra = {}) {
    const t = Math.max(0, Math.floor(Number(now) || 0));
    return {
        ...room,
        ...extra,
        lastActivityAt: t,
        updatedAt: t,
    };
}

export function createBoardRoom({ gameType, hostId, hostName, now, timerEnabled = false } = {}) {
    const def = getBoardGameDef(gameType);
    const hid = cleanId(hostId);
    if (!def || !hid) return { ok: false, error: 'bad_create', room: null };
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const room = emptyBoardRoom(def.id, t);
    room.id = createBoardRoomId();
    room.hostId = hid;
    room.hostName = cleanName(hostName) || hid;
    room.timerEnabled = timerEnabled === true;
    room.members = [{
        id: hid,
        name: room.hostName,
        role: 'host',
        seat: def.id === 'gomoku' ? 'black' : (def.id === 'chess' ? 'white' : ''),
    }];
    return { ok: true, error: '', room };
}

export function isRoomHost(room, studentId) {
    const r = sanitizeBoardRoom(room);
    return !!r.hostId && r.hostId === cleanId(studentId);
}

export function isRoomMember(room, studentId) {
    const id = cleanId(studentId);
    if (!id) return false;
    return sanitizeBoardRoom(room).members.some((m) => m.id === id);
}

export function roomMemberSeat(room, studentId) {
    const id = cleanId(studentId);
    const m = sanitizeBoardRoom(room).members.find((row) => row.id === id);
    return m ? m.seat : '';
}

export function approvedCount(room) {
    return sanitizeBoardRoom(room).members.length;
}

export function remainingSeats(room) {
    const r = sanitizeBoardRoom(room);
    return Math.max(0, r.maxPlayers - r.members.length);
}

export function isRoomIdleExpired(room, now) {
    const r = sanitizeBoardRoom(room, now);
    if (!r.id || r.status === 'closed') return true;
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (!t || !r.lastActivityAt) return false;
    return t - r.lastActivityAt >= BOARD_ROOM_IDLE_TTL_MS;
}

/** 목록에 올릴 방만 남깁니다. 종료·만료 방은 빠집니다. */
export function listVisibleBoardRooms(rooms, now) {
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    return (Array.isArray(rooms) ? rooms : [])
        .map((raw) => sanitizeBoardRoom(raw, t))
        .filter((room) => room.id && room.status !== 'closed' && !isRoomIdleExpired(room, t))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function closeBoardRoom(room, { actorId, now, force = false } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (r.status === 'closed') return { ok: true, error: '', room: r };
    if (!force && !isRoomHost(r, actorId) && !isRoomIdleExpired(r, t) && !isRoomMember(r, actorId)) {
        return { ok: false, error: 'not_allowed', room: r };
    }
    return {
        ok: true,
        error: '',
        room: touchRoom(r, t, { status: 'closed' }),
    };
}

export function expireIdleBoardRoom(room, now) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (!isRoomIdleExpired(r, t)) return { ok: false, error: 'not_idle', room: r };
    return closeBoardRoom(r, { now: t, force: true });
}

export function requestJoinBoardRoom(room, { studentId, studentName, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const id = cleanId(studentId);
    if (!id) return { ok: false, error: 'need_login', room: r };
    if (r.status !== 'waiting') return { ok: false, error: 'not_waiting', room: r };
    if (isRoomIdleExpired(r, t)) return { ok: false, error: 'expired', room: r };
    if (isRoomMember(r, id)) return { ok: false, error: 'already_in', room: r };
    if (remainingSeats(r) <= 0) return { ok: false, error: 'full', room: r };
    const existing = r.joinRequests.find((row) => row.id === id);
    if (existing && existing.status === 'pending') return { ok: false, error: 'already_requested', room: r };
    const nextReq = { id, name: cleanName(studentName) || id, status: 'pending', at: t };
    const joinRequests = r.joinRequests.filter((row) => row.id !== id).concat(nextReq).slice(-40);
    return {
        ok: true,
        error: '',
        room: touchRoom(r, t, { joinRequests }),
    };
}

function nextSeatForGame(room) {
    if (room.gameType !== 'gomoku' && room.gameType !== 'chess') return '';
    const used = new Set(room.members.map((m) => m.seat).filter(Boolean));
    if (room.gameType === 'chess') {
        if (!used.has('black')) return 'black';
        if (!used.has('white')) return 'white';
        return '';
    }
    if (!used.has('white')) return 'white';
    if (!used.has('black')) return 'black';
    return '';
}

export function approveJoinBoardRoom(room, { hostId, studentId, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (!isRoomHost(r, hostId)) return { ok: false, error: 'host_only', room: r };
    if (r.status !== 'waiting') return { ok: false, error: 'not_waiting', room: r };
    const id = cleanId(studentId);
    const req = r.joinRequests.find((row) => row.id === id && row.status === 'pending');
    if (!req) return { ok: false, error: 'no_request', room: r };
    if (remainingSeats(r) <= 0) return { ok: false, error: 'full', room: r };
    const seat = nextSeatForGame(r);
    const members = r.members.concat([{ id: req.id, name: req.name, role: 'player', seat }]);
    const joinRequests = r.joinRequests.map((row) => (row.id === id ? { ...row, status: 'approved' } : row));
    let next = touchRoom(r, t, { members, joinRequests });
    if (members.length >= next.minPlayers && members.length >= next.maxPlayers) {
        const started = startBoardRoom(next, { hostId, now: t, auto: true });
        if (started.ok) next = started.room;
    }
    return { ok: true, error: '', room: next };
}

/** 신청한 학생이 대기 중인 참가 신청을 직접 취소합니다. */
export function cancelJoinBoardRoom(room, { studentId, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const id = cleanId(studentId);
    if (!id) return { ok: false, error: 'need_login', room: r };
    if (!r.joinRequests.some((row) => row.id === id && row.status === 'pending')) {
        return { ok: true, error: '', room: r };
    }
    const joinRequests = r.joinRequests.filter((row) => !(row.id === id && row.status === 'pending'));
    return { ok: true, error: '', room: touchRoom(r, t, { joinRequests }) };
}

/**
 * 다른 방에 들어가거나 방을 새로 만들 때 정리할 대상.
 * 내가 방장으로 열어 둔 대기 방, 다른 방에 넣어 둔 참가 대기만 모읍니다.
 */
export function collectBoardRoomVacateActions(rooms, { studentId, exceptRoomId = '' } = {}) {
    const id = cleanId(studentId);
    const except = String(exceptRoomId || '').trim();
    const closeHostIds = [];
    const cancelJoinIds = [];
    if (!id) return { closeHostIds, cancelJoinIds };
    (Array.isArray(rooms) ? rooms : []).forEach((raw) => {
        const r = sanitizeBoardRoom(raw);
        if (!r.id || r.id === except || r.status === 'closed') return;
        if (r.status === 'waiting' && r.hostId === id) closeHostIds.push(r.id);
        if ((r.joinRequests || []).some((row) => row.id === id && row.status === 'pending')) {
            cancelJoinIds.push(r.id);
        }
    });
    return { closeHostIds, cancelJoinIds };
}

export function rejectJoinBoardRoom(room, { hostId, studentId, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (!isRoomHost(r, hostId)) return { ok: false, error: 'host_only', room: r };
    const id = cleanId(studentId);
    if (!r.joinRequests.some((row) => row.id === id && row.status === 'pending')) {
        return { ok: false, error: 'no_request', room: r };
    }
    const joinRequests = r.joinRequests.map((row) => (row.id === id ? { ...row, status: 'rejected' } : row));
    return { ok: true, error: '', room: touchRoom(r, t, { joinRequests }) };
}

export function canStartBoardRoom(room) {
    const r = sanitizeBoardRoom(room);
    return r.status === 'waiting' && r.members.length >= r.minPlayers;
}

export function startBoardRoom(room, { hostId, now, auto = false } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (!auto && !isRoomHost(r, hostId)) return { ok: false, error: 'host_only', room: r };
    if (!canStartBoardRoom(r) && r.status !== 'waiting') return { ok: false, error: 'cannot_start', room: r };
    if (r.members.length < r.minPlayers) return { ok: false, error: 'need_players', room: r };
    const game = emptyGameForType(r.gameType, t);
    if (game && typeof game === 'object') game.turnStartedAt = t;
    return {
        ok: true,
        error: '',
        room: touchRoom(r, t, { status: 'playing', game }),
    };
}

export function setBoardRoomTimer(room, { hostId, enabled, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (!isRoomHost(r, hostId)) return { ok: false, error: 'host_only', room: r };
    if (r.status === 'closed') return { ok: false, error: 'closed', room: r };
    const timerEnabled = enabled === true;
    const game = r.game && typeof r.game === 'object'
        ? { ...r.game, turnStartedAt: r.status === 'playing' ? t : (r.game.turnStartedAt || 0) }
        : r.game;
    return {
        ok: true,
        error: '',
        room: touchRoom(r, t, { timerEnabled, game }),
    };
}

export function finishBoardRoom(room, { game, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    return {
        ok: true,
        error: '',
        room: touchRoom(r, t, { status: 'finished', game: game || r.game }),
    };
}

export function continueBoardRoom(room, { actorId, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (r.status !== 'finished') return { ok: false, error: 'not_finished', room: r };
    if (!isRoomMember(r, actorId)) return { ok: false, error: 'member_only', room: r };
    const game = emptyGameForType(r.gameType, t);
    if (game && typeof game === 'object') game.turnStartedAt = t;
    return {
        ok: true,
        error: '',
        room: touchRoom(r, t, { status: 'playing', game }),
    };
}

export function applyBoardRoomGame(room, { game, now, finished = false } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    return touchRoom(r, t, {
        status: finished ? 'finished' : (r.status === 'closed' ? 'closed' : 'playing'),
        game: sanitizeGameForType(r.gameType, game, t),
    });
}

export function turnDeadlineMs(room) {
    const r = sanitizeBoardRoom(room);
    if (!r.timerEnabled || r.status !== 'playing') return 0;
    const started = Number(r.game && r.game.turnStartedAt) || 0;
    if (!started) return 0;
    return started + r.timerSec * 1000;
}

export function turnRemainingMs(room, now) {
    const deadline = turnDeadlineMs(room);
    if (!deadline) return 0;
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    return Math.max(0, deadline - t);
}

export function isTurnTimedOut(room, now) {
    const r = sanitizeBoardRoom(room, now);
    if (!r.timerEnabled || r.status !== 'playing') return false;
    return turnRemainingMs(r, now) <= 0 && !!(r.game && r.game.turnStartedAt);
}

export const BOARD_ROOM_ERROR_LABEL = Object.freeze({
    bad_create: '방을 만들지 못했습니다.',
    need_login: '로그인한 학생만 참가할 수 있습니다.',
    not_waiting: '지금 참가할 수 없는 방입니다.',
    expired: '오래 비어 있어 방이 닫혔습니다.',
    already_in: '이미 이 방에 있습니다.',
    full: '방이 가득 찼습니다.',
    already_requested: '이미 참가 신청을 보냈습니다.',
    host_only: '방장만 할 수 있습니다.',
    no_request: '대기 중인 신청이 없습니다.',
    cannot_start: '지금은 시작할 수 없습니다.',
    need_players: '인원이 부족합니다.',
    closed: '이미 종료된 방입니다.',
    not_finished: '아직 한 판이 끝나지 않았습니다.',
    member_only: '이 방 사람만 할 수 있습니다.',
    not_allowed: '권한이 없습니다.',
    not_idle: '아직 방치된 방이 아닙니다.',
});

export function boardRoomErrorText(code) {
    return BOARD_ROOM_ERROR_LABEL[String(code || '')] || '처리할 수 없습니다.';
}

/** Firestore에 넣을 방 문서. 오목 판은 중첩 배열 대신 cells 로 넣습니다. */
export function boardRoomToDoc(room) {
    const r = sanitizeBoardRoom(room);
    const game = r.gameType === 'gomoku'
        ? gomokuGameToDoc(r.game)
        : (r.gameType === 'chess' ? chessGameToDoc(r.game) : r.game);
    return { ...r, game };
}
