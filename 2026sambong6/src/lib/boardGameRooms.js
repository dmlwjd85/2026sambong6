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

import { alkkagiGameToDoc, emptyAlkkagiGame, sanitizeAlkkagiGame } from './alkkagiGame.js';
import { emptyChessGame, chessGameToDoc, sanitizeChessGame } from './chessGame.js';
import { emptyGomokuGame, gomokuGameToDoc, sanitizeGomokuGame } from './gomokuGame.js';

/** 10분 무활동이면 방을 자동 종료합니다. */
export const BOARD_ROOM_IDLE_TTL_MS = 10 * 60 * 1000;
/**
 * 만든 지(createdAt) 30분이 지난 방은 목록에서 숨기고, 목록을 연 기기가 한 번 지워요.
 * 단, 두는 중(playing)이고 마지막 활동(lastActivityAt)이 10분 안이면 지우지 않아요.
 * firestore.rules 의 boardRoomCleanupDue() 와 같은 기준이에요.
 */
export const BOARD_ROOM_CLEANUP_AGE_MS = 30 * 60 * 1000;
/** 정리한 방을 기기에 기억하는 시간(하루). 지나면 기억을 버려요. */
export const BOARD_ROOM_CLEANED_MEMORY_MS = 24 * 60 * 60 * 1000;
/** 기기에 기억하는 정리한 방 수 상한. */
export const BOARD_ROOM_CLEANED_MEMORY_MAX = 200;
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
    alkkagi: Object.freeze({
        id: 'alkkagi',
        label: '알까기',
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

/** 방 id 시간 부분의 기준(36진수 9자리 최대값). 이 값에서 만든 시각을 빼서 새 방일수록 id가 앞에 와요. */
export const BOARD_ROOM_ID_TIME_MAX = 36 ** 9 - 1;

/**
 * 새 방 id: `bg_0` + (기준 − 만든 시각)을 36진수 9자리로 + 임의 6자.
 * Firestore는 orderBy가 없으면 문서 id 오름차순으로 limit을 자르므로, 새 방일수록 id가 앞에 오게 만들어
 * 정렬·복합 색인 없이도 방이 많을 때 옛 방부터 잘리게 해요.
 * 예전 id(`bg_` + 시각, 맨 앞 글자가 '0'이 아님)보다 항상 앞에 와요.
 */
export function createBoardRoomId(now = Date.now()) {
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const rev = Math.max(0, BOARD_ROOM_ID_TIME_MAX - t).toString(36).padStart(9, '0');
    return `bg_0${rev}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
}

/**
 * 한 사람이 방을 하나만 갖는 게임(지금은 알까기)의 방 문서 id예요.
 * 방장마다 id가 하나로 정해져 있어서, 버튼을 여러 번 눌러도 문서가 하나만 생겨요.
 * 다른 게임은 빈 문자열을 돌려줘요(예전처럼 새 id를 써요).
 */
export function hostBoardRoomId(gameType, hostId) {
    const def = getBoardGameDef(gameType);
    const hid = String(hostId || '').trim().slice(0, 20).replace(/[^A-Za-z0-9_-]/g, '_');
    if (!def || !hid || def.id !== 'alkkagi') return '';
    return `alk_${hid}`;
}

function cleanId(raw) {
    return String(raw || '').trim().slice(0, 20);
}

function cleanUid(raw) {
    return typeof raw === 'string' ? raw.trim().slice(0, 128) : '';
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
    if (gameType === 'alkkagi') return emptyAlkkagiGame({ now });
    return null;
}

function sanitizeGameForType(gameType, raw, now) {
    if (gameType === 'gomoku') return sanitizeGomokuGame(raw, { now });
    if (gameType === 'chess') return sanitizeChessGame(raw, { now });
    if (gameType === 'alkkagi') return sanitizeAlkkagiGame(raw, { now });
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
        hostUid: '',
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
        // 방장 기기의 로그인 uid(규칙이 방장을 알아보는 값). 옛 방에는 없어서 빈 문자열이에요.
        hostUid: cleanUid(raw.hostUid),
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

export function createBoardRoom({ gameType, hostId, hostName, now, timerEnabled = false, id = '', hostUid = '' } = {}) {
    const def = getBoardGameDef(gameType);
    const hid = cleanId(hostId);
    if (!def || !hid) return { ok: false, error: 'bad_create', room: null };
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const room = emptyBoardRoom(def.id, t);
    room.id = String(id || '').trim().slice(0, 40) || createBoardRoomId(t);
    room.hostId = hid;
    room.hostUid = cleanUid(hostUid);
    room.hostName = cleanName(hostName) || hid;
    room.timerEnabled = timerEnabled === true;
    room.members = [{
        id: hid,
        name: room.hostName,
        role: 'host',
        seat: def.id === 'gomoku' || def.id === 'alkkagi' ? 'black' : (def.id === 'chess' ? 'white' : ''),
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

/** 만든 지 30분이 지났는지(createdAt 기준). 목록에서 숨기는 기준이에요. */
export function isBoardRoomPastListAge(room, now) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (!t || !r.createdAt) return false;
    return t - r.createdAt >= BOARD_ROOM_CLEANUP_AGE_MS;
}

/**
 * 30분 정리 대상인지. 만든 지 30분이 지났고, 두는 중이며 10분 안에 활동이 있던 판은 빼요.
 * (규칙과 같은 기준이라, 누가 지워도 규칙이 받아 줘요.)
 */
export function isBoardRoomCleanupAgeDue(room, now) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (!r.id || !isBoardRoomPastListAge(r, t)) return false;
    if (r.status === 'playing' && t - r.lastActivityAt < BOARD_ROOM_IDLE_TTL_MS) return false;
    return true;
}

/**
 * 이 기기가 지워도 되는(규칙이 허락하는) 정리 대상인지 골라요.
 * - 30분 정리 대상(누구나)
 * - 10분 넘게 쉰 방 가운데 내 방(hostUid가 내 uid)이거나, hostUid가 없는 옛 방
 * 남의 새 방(hostUid가 다르고 30분 전)은 10분 쉬어도 지우지 않고 목록에서만 숨겨요.
 */
export function boardRoomCleanupDue(room, { now, uid = '' } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (!r.id || !t) return false;
    if (isBoardRoomCleanupAgeDue(r, t)) return true;
    if (r.status === 'closed' || !isRoomIdleExpired(r, t)) return false;
    const me = cleanUid(uid);
    return !r.hostUid || (!!me && r.hostUid === me);
}

/** 정리한 방을 기기에 기억하는 키. 같은 id를 다시 쓰는 알까기 방도 판마다 따로 기억해요. */
export function boardRoomCleanupKey(room) {
    return boardRoomInstanceKey(room);
}

/** 기기에 저장한 정리 기억을 읽어요. 하루 지난 기억과 깨진 값은 버려요. */
export function parseBoardRoomCleanedMemory(raw, now) {
    const t = Math.max(0, Math.floor(Number(now) || 0));
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (_) { obj = null; }
    }
    const out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    Object.keys(obj).forEach((k) => {
        const at = Math.floor(Number(obj[k]) || 0);
        if (!k || at <= 0) return;
        if (t && t - at >= BOARD_ROOM_CLEANED_MEMORY_MS) return;
        out[k] = at;
    });
    return out;
}

/** 정리 기억에 방을 더해요. 오래된 것부터 버려 상한을 지켜요. */
export function rememberBoardRoomCleaned(memory, key, now) {
    const t = Math.max(0, Math.floor(Number(now) || 0));
    const next = { ...parseBoardRoomCleanedMemory(memory, t) };
    if (key) next[String(key)] = t || 1;
    const keys = Object.keys(next).sort((a, b) => next[a] - next[b]);
    while (keys.length > BOARD_ROOM_CLEANED_MEMORY_MAX) delete next[keys.shift()];
    return next;
}

/** 이번에 지울 방만 골라요. 이미 정리(시도)한 방은 다시 고르지 않아요. */
export function pickBoardRoomsToCleanup(rooms, { now, uid = '', memory = {} } = {}) {
    const t = Math.max(0, Math.floor(Number(now) || 0));
    const mem = parseBoardRoomCleanedMemory(memory, t);
    const seen = new Set();
    return (Array.isArray(rooms) ? rooms : [])
        .map((raw) => sanitizeBoardRoom(raw, t))
        .filter((r) => {
            const key = boardRoomCleanupKey(r);
            if (!key || seen.has(key) || mem[key]) return false;
            seen.add(key);
            return boardRoomCleanupDue(r, { now: t, uid });
        });
}

/** 목록에 올릴 방만 남깁니다. 종료·만료 방, 만든 지 30분이 지난 방은 빠집니다. */
export function listVisibleBoardRooms(rooms, now) {
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    return (Array.isArray(rooms) ? rooms : [])
        .map((raw) => sanitizeBoardRoom(raw, t))
        .filter((room) => room.id && room.status !== 'closed' && !isRoomIdleExpired(room, t) && !isBoardRoomPastListAge(room, t))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 방 목록에 보여 줄 방이에요. 알까기는 끝난 판(결과)을 목록에서 빼요.
 * 끝난 방은 같이 둔 사람만 판 화면에서 결과를 보고, 다른 사람에게는 보이지 않아요.
 */
export function listLobbyBoardRooms(rooms, { gameType, now } = {}) {
    const type = String(gameType || '');
    return listVisibleBoardRooms(rooms, now)
        .filter((room) => !type || room.gameType === type)
        .filter((room) => room.gameType !== 'alkkagi' || room.status !== 'finished');
}

/**
 * 「방 만들기」를 눌렀을 때 할 일을 정해요. existing은 같은 id로 이미 있는 방(없으면 null)이에요.
 * - create: 새 방을 만들어요(없거나, 닫혔거나, 끝났거나, 오래 비어 있던 방).
 * - reuse: 내가 만든 대기 방이 이미 있어요. 새로 만들지 않고 그 방으로 안내해요.
 * - enter: 내가 두고 있는 판이 있어요. 그 판으로 들어가요.
 */
export function decideBoardRoomCreate(existing, { hostId, now } = {}) {
    const hid = cleanId(hostId);
    if (!hid) return { action: 'error', error: 'bad_create' };
    if (!existing) return { action: 'create', error: '' };
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const r = sanitizeBoardRoom(existing, t);
    if (r.status === 'closed' || r.status === 'finished' || isRoomIdleExpired(r, t) || isBoardRoomCleanupAgeDue(r, t)) return { action: 'create', error: '' };
    if (r.status === 'waiting' && isRoomHost(r, hid)) return { action: 'reuse', error: '' };
    if (r.status === 'playing' && isRoomMember(r, hid)) return { action: 'enter', error: '' };
    return { action: 'create', error: '' };
}

/** 방장이 아직 아무도 들어오지 않은(대기) 방을 지워요. 판이 시작된 방은 기권·나가기로 끝내요. */
export function deleteWaitingBoardRoom(room, { actorId, now } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    if (!isRoomHost(r, actorId)) return { ok: false, error: 'host_only', room: r };
    if (r.status === 'closed') return { ok: true, error: '', room: r };
    if (r.status !== 'waiting') return { ok: false, error: 'delete_waiting_only', room: r };
    return { ok: true, error: '', room: touchRoom(r, t, { status: 'closed' }) };
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
    if (room.gameType !== 'gomoku' && room.gameType !== 'chess' && room.gameType !== 'alkkagi') return '';
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
 * 내가 들어 있는 방 가운데 지금 붙잡을 방을 골라요. 두는 중 > 대기 > 결과 순서이고, 같으면 최근 방이에요.
 * (예전에는 문서 순서대로 첫 방을 골라, 끝난 옛 방 때문에 방금 만든 대기 방이 닫힐 수 있었어요.)
 */
export function pickMyActiveBoardRoom(rooms, studentId) {
    const id = cleanId(studentId);
    if (!id) return null;
    const rank = { playing: 0, waiting: 1, finished: 2 };
    const mine = (Array.isArray(rooms) ? rooms : [])
        .map((raw) => sanitizeBoardRoom(raw))
        .filter((r) => r.id && r.status in rank && r.members.some((m) => m.id === id));
    mine.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.updatedAt - a.updatedAt));
    return mine[0] || null;
}

/** 같은 id를 다시 쓰는 방(알까기)도 판마다 구별되게, id와 만든 시각을 함께 써요. */
export function boardRoomInstanceKey(room) {
    const r = sanitizeBoardRoom(room);
    return r.id ? `${r.id}:${r.createdAt}` : '';
}

/** 나온 끝난 방 기억(같은 탭 sessionStorage)에 남기는 최대 개수. */
export const BOARD_LEFT_ROOMS_MAX = 30;

/** 저장해 둔 '나온 방' 목록을 읽어요. 깨진 값은 빈 목록이에요. */
export function parseBoardLeftRooms(raw) {
    let arr = raw;
    if (typeof raw === 'string') {
        try { arr = JSON.parse(raw); } catch (_) { arr = null; }
    }
    if (!Array.isArray(arr)) return [];
    const out = [];
    arr.forEach((k) => {
        const key = typeof k === 'string' ? k.trim().slice(0, 80) : '';
        if (key && !out.includes(key)) out.push(key);
    });
    return out.slice(-BOARD_LEFT_ROOMS_MAX);
}

/** '나온 방' 목록에 하나 더해요. 오래된 것부터 버려 상한을 지켜요. */
export function rememberBoardLeftRoom(list, key) {
    const out = parseBoardLeftRooms(list).filter((k) => k !== key);
    const k = typeof key === 'string' ? key.trim().slice(0, 80) : '';
    if (k) out.push(k);
    return out.slice(-BOARD_LEFT_ROOMS_MAX);
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
    expired: '이 방은 이제 들어갈 수 없어요. 정리됐거나 방장이 지웠어요.',
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
    delete_waiting_only: '벌써 판이 시작돼서 지울 수 없어요. 판에서 「나가기」를 눌러 주세요.',
});

export function boardRoomErrorText(code) {
    return BOARD_ROOM_ERROR_LABEL[String(code || '')] || '처리할 수 없습니다.';
}

/** Firestore에 넣을 방 문서. 오목 판은 중첩 배열 대신 cells 로 넣습니다. */
export function boardRoomToDoc(room) {
    const r = sanitizeBoardRoom(room);
    const game = r.gameType === 'gomoku'
        ? gomokuGameToDoc(r.game)
        : (r.gameType === 'chess' ? chessGameToDoc(r.game) : (r.gameType === 'alkkagi' ? alkkagiGameToDoc(r.game) : r.game));
    return { ...r, game, participantIds: boardRoomParticipantIds(r) };
}

/**
 * 방 문서에 함께 넣는 참가자 id 목록(방장·멤버·대기 중인 참가 신청).
 * members 는 객체 배열이라 Firestore 질의를 못 해서, 이 목록으로 `array-contains` 질의를 해요(단일 필드 색인만 써요).
 */
export function boardRoomParticipantIds(room) {
    const r = room && typeof room === 'object' ? room : {};
    const ids = [];
    const push = (raw) => {
        const id = cleanId(raw);
        if (id && !ids.includes(id)) ids.push(id);
    };
    push(r.hostId);
    (Array.isArray(r.members) ? r.members : []).forEach((m) => push(m && m.id));
    (Array.isArray(r.joinRequests) ? r.joinRequests : []).forEach((j) => {
        if (j && j.status === 'pending') push(j.id);
    });
    return ids;
}

/** 로비 목록 질의 한 번에 받는 방 수 상한. 방 id가 새 방일수록 앞이라(createBoardRoomId) 넘치면 옛 방부터 빠져요. */
export const BOARD_LOBBY_QUERY_LIMIT = 30;
/** 내 방(참가 중·신청 중) 질의 상한. 넘치면 옛 방부터 빠져요(알까기 방장 고정 id alk_ 는 맨 앞). */
export const BOARD_MINE_QUERY_LIMIT = 10;

/** 로비 질의에 넣을 상태. 알까기는 끝난 방을 목록에 보이지 않아서 빼요. */
export function boardLobbyQueryStatuses(gameType) {
    return gameType === 'alkkagi' ? ['waiting', 'playing'] : ['waiting', 'playing', 'finished'];
}

/**
 * 지금 화면에 필요한 방 구독 범위를 정해요(순수 함수).
 * - 보드게임 창이 아니면 아무것도 구독하지 않아요.
 * - 로비가 화면에 보일 때만: 그 게임의 방 목록 + 내 방(다른 게임 방 포함).
 * - 대전 중: 내 방 문서 하나만.
 * @param {{ toolOpen?: boolean, view?: string, gameType?: string, activeRoomId?: string, selfId?: string, lobbyVisible?: boolean, localPlay?: boolean }} [o]
 * @returns {{ lobbyGameType: string, mineId: string, roomId: string }}
 */
export function boardRoomSubscriptionScope(o = {}) {
    const none = { lobbyGameType: '', mineId: '', roomId: '' };
    if (!o || !o.toolOpen) return none;
    if (o.view === 'play') {
        const roomId = o.localPlay ? '' : String(o.activeRoomId || '').trim();
        return { ...none, roomId };
    }
    if (o.view === 'lobby' && o.lobbyVisible && isBoardGameType(o.gameType)) {
        return { lobbyGameType: o.gameType, mineId: cleanId(o.selfId), roomId: '' };
    }
    return none;
}

/** 범위가 같은지 비교할 때 쓰는 키. */
export function boardRoomScopeKey(scope) {
    const s = scope || {};
    return `${s.lobbyGameType || ''}|${s.mineId || ''}|${s.roomId || ''}`;
}
