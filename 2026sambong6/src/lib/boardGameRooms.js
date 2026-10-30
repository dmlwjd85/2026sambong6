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

/**
 * 같은 학번이 다른 기기(uid)에서 알까기 방을 만들 때 쓰는 두 번째 id예요(#88 r3 R2-2).
 * 규칙은 hostUid가 있는 방을 같은 학번만으로 덮어쓰지 못하게 해요. 그래서 기기(uid)마다 정해진 id를 따로 써요.
 * alk_ 로 시작해서 '내 방' 질의(bg_ 앞쪽)에도 그대로 잡혀요. 같은 기기에서 여러 번 눌러도 id는 하나예요.
 */
export function hostBoardRoomFallbackId(gameType, hostId, uid) {
    const base = hostBoardRoomId(gameType, hostId);
    const me = typeof uid === 'string' ? uid.trim() : '';
    if (!base || !me) return '';
    let h = 2166136261;
    for (let i = 0; i < me.length; i += 1) {
        h ^= me.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return `${base}_${h.toString(36).padStart(6, '0').slice(-6)}`;
}

/**
 * 세 번째 id예요(#88 r4 ①). 정해진 id와 두 번째 id는 학번·uid로 정해져서 남이 미리 차지할 수 있어요.
 * 둘 다 막혔을 때만 이 기기에서 뽑은, 미리 알 수 없는 id로 만들어요. alk_학번_ 로 시작해서 '내 방' 질의에도 잡혀요.
 * @param {() => number} [rand] 시험용. 없으면 crypto 난수를 써요.
 */
export function hostBoardRoomRandomId(gameType, hostId, rand) {
    const base = hostBoardRoomId(gameType, hostId);
    if (!base) return '';
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let bytes = null;
    if (typeof rand !== 'function' && typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    }
    let out = '';
    for (let i = 0; i < 8; i += 1) {
        const n = bytes ? bytes[i] : Math.floor((Number((rand || Math.random)()) || 0) * 256);
        out += abc[Math.abs(n) % abc.length];
    }
    return `${base}_r${out}`;
}

/**
 * 이 기기(uid)가 연, 아직 살아 있는 내 알까기 방을 골라요(#88 r4 ①).
 * 정해진 id·두 번째 id가 남에게 막혔을 때 세 번째 id 방을 또 만들지 않고 이 방을 다시 써요.
 */
export function pickMyHostAlkRoom(rooms, { hostId, uid, now } = {}) {
    const hid = cleanId(hostId);
    const me = cleanUid(uid);
    const base = hostBoardRoomId('alkkagi', hid);
    if (!hid || !me || !base) return null;
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const mine = (Array.isArray(rooms) ? rooms : [])
        .map((raw) => sanitizeBoardRoom(raw, t))
        .filter((r) => r.id && r.gameType === 'alkkagi'
            && (r.id === base || r.id.startsWith(`${base}_`))
            && r.hostId === hid && cleanUid(r.hostUid) === me
            && (r.status === 'waiting' || r.status === 'playing')
            && !isRoomIdleExpired(r, t) && !isBoardRoomCleanupAgeDue(r, t));
    mine.sort((a, b) => b.updatedAt - a.updatedAt);
    return mine[0] || null;
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
    // uid(그 학생 기기의 로그인 uid)는 있을 때만 넣어요. 없던 칸에 빈 값을 넣으면 문서가 바뀌어 규칙이 막아요.
    const uid = cleanUid(raw.uid);
    return {
        id,
        name: cleanName(raw.name) || id,
        role,
        seat,
        ...(uid ? { uid } : {}),
    };
}

function sanitizeJoinRequest(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = cleanId(raw.id);
    if (!id) return null;
    const status = BOARD_JOIN_STATUSES.includes(String(raw.status)) ? String(raw.status) : 'pending';
    const uid = cleanUid(raw.uid);
    return {
        id,
        name: cleanName(raw.name) || id,
        status,
        at: sanitizeEpochMs(raw.at),
        ...(uid ? { uid } : {}),
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
        round: 0,
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
        round: sanitizeBoardRoomRound(raw.round),
        game: sanitizeGameForType(def.id, raw.game, t || updatedAt),
    };
}

/** '한 판 더'를 누를 때마다 1씩 올리는 판 번호예요. 0 이상의 정수만 받아요. */
function sanitizeBoardRoomRound(raw) {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 0;
}

function touchRoom(room, now, extra = {}) {
    const t = Math.max(0, Math.floor(Number(now) || 0));
    // 마지막 활동 시각은 줄이지 않아요(규칙이 줄어드는 쓰기를 막아요. 기기 시계가 조금 늦어도 안전).
    const prev = Math.max(0, Math.floor(Number(room && room.lastActivityAt) || 0));
    return {
        ...room,
        ...extra,
        lastActivityAt: Math.max(prev, t),
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
        ...(room.hostUid ? { uid: room.hostUid } : {}),
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

/** 닫힌 방을 참가자가 지우기 전 기다리는 시간(r4 ②). */
export const BOARD_ROOM_CLOSED_GRACE_MS = 60 * 1000;

/**
 * 이 기기가 지워도 되는(규칙이 허락하는) 정리 대상인지 골라요.
 * - 30분 정리 대상(누구나)
 * - 10분 넘게 쉰 방 가운데 내 방(hostUid가 내 uid)이거나, hostUid가 없는 옛 방
 * - r4 ②: 내가 참가자인 닫힌 방(1분 뒤)·끝난 방(10분 쉰 뒤)
 * 남의 새 방(hostUid가 다르고 30분 전)은 10분 쉬어도 지우지 않고 목록에서만 숨겨요.
 */
export function boardRoomCleanupDue(room, { now, uid = '' } = {}) {
    const r = sanitizeBoardRoom(room, now);
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (!r.id || !t) return false;
    if (isBoardRoomCleanupAgeDue(r, t)) return true;
    const me = cleanUid(uid);
    // r4 ②: 내가 방장·참가자(자리 uid)인 방은 닫힌 지 1분이 지나면, 끝난 판은 10분 쉬면 지워요(규칙과 같은 기준).
    // (닫힌 방 1분은 판 화면에 남은 친구가 '방이 닫혔어요'를 볼 시간이에요.)
    const party = !!me && (cleanUid(r.hostUid) === me || r.members.some((m) => cleanUid(m.uid) === me));
    if (r.status === 'closed') return party && t - (Number(r.updatedAt) || 0) >= BOARD_ROOM_CLOSED_GRACE_MS;
    if (!isRoomIdleExpired(r, t)) return false;
    if (r.status === 'finished' && party) return true;
    return !r.hostUid || (!!me && r.hostUid === me);
}

/** 여러 기기가 같은 방을 한꺼번에 지우지 않게, 기기(uid)·방마다 다르게 기다리는 최대 시간. */
export const BOARD_ROOM_CLEANUP_SPREAD_MS = 9000;

/**
 * 정리 전에 기다릴 시간(ms). 내 방은 바로(0), 남의 방은 uid·방으로 정해지는 0~9초예요.
 * 기다린 뒤 실시간 목록에 방이 그대로 있을 때만 지우면, 먼저 지운 기기가 있을 때 나머지는 건너뛰어요(읽기·쓰기 추가 없음).
 */
export function boardRoomCleanupDelayMs(room, uid = '') {
    const r = room && typeof room === 'object' ? room : {};
    const me = cleanUid(uid);
    if (me && cleanUid(r.hostUid) === me) return 0;
    const key = `${me}|${boardRoomInstanceKey(r)}`;
    let h = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h % BOARD_ROOM_CLEANUP_SPREAD_MS;
}

/**
 * hostUid가 비어 있는 방(옛 방, 또는 옛 화면이 hostUid 없이 덮어쓴 방)에 방장 본인이 쓸 때 내 uid를 다시 적어요.
 * 남의 방이거나 이미 hostUid가 있으면 그대로 돌려줘요.
 */
export function claimBoardRoomHostUid(room, { hostId, uid } = {}) {
    const me = cleanUid(uid);
    const hid = cleanId(hostId);
    if (!room || typeof room !== 'object' || !me || !hid) return room;
    if (cleanUid(room.hostUid) || cleanId(room.hostId) !== hid) {
        // r4 ④: 대국 중에 규칙이 바뀌어 내 자리(학번이 나인 자리 하나) uid가 비어 있으면, 이번 쓰기에 함께 채워요.
        // 규칙은 자리 칸에서 uid만 바뀐 쓰기를 '참가자 쓰기'로 받아 줘요. 다른 사람 자리·채워진 자리는 건드리지 않아요.
        // (방 상태는 쓰기 전 상태로 규칙이 봐요. 이번 쓰기로 판이 끝나도 채워요.)
        return claimBoardRoomSeatUid(room, { studentId: hid, uid: me, anyStatus: true }) || room;
    }
    const members = (Array.isArray(room.members) ? room.members : []).map((m) => (
        m && m.id === hid && !m.uid ? { ...m, uid: me } : m
    ));
    return { ...room, hostUid: me, members };
}

/**
 * 정해진 id(alk_학번)에 다른 기기가 만든 방이 아직 살아 있으면, 이 기기는 두 번째 id로 만들어야 해요(#88 r3 R2-2).
 * 30분 정리 대상이면 누구나 덮어쓸 수 있어서 그대로 써요. hostUid가 없는 옛 방도 그대로 써요.
 */
export function needsHostBoardRoomFallback(existing, { uid = '', now } = {}) {
    if (!existing || typeof existing !== 'object') return false;
    const me = cleanUid(uid);
    const owner = cleanUid(existing.hostUid);
    if (!me || !owner || owner === me) return false;
    return !isBoardRoomCleanupAgeDue(existing, now);
}

/**
 * 승인될 때 uid가 비어 있던 내 자리(섞인 버전 화면에서 승인된 자리)에 이 기기 uid를 채워요(#88 r3 R2-4).
 * 규칙은 이 채우기만 따로 받아요(다른 칸은 그대로). 채울 필요가 없으면 null이에요.
 */
export function claimBoardRoomSeatUid(room, { studentId, uid, anyStatus = false } = {}) {
    const me = cleanUid(uid);
    const id = cleanId(studentId);
    if (!room || typeof room !== 'object' || !me || !id) return null;
    if (cleanUid(room.hostUid) === me) return null;
    const members = Array.isArray(room.members) ? room.members : [];
    if (members.some((m) => m && cleanUid(m.uid) === me)) return null;
    const idx = members.findIndex((m) => m && cleanId(m.id) === id);
    if (idx < 0 || cleanUid(members[idx].uid)) return null;
    // 방장 자리는 hostUid 기기 몫이에요. 다른 기기가 방장 학번 자리를 채우지 않아요.
    if (cleanId(room.hostId) === id && cleanUid(room.hostUid)) return null;
    // 규칙은 대기·두는 중인 방에서만 자리 채우기를 받아요.
    if (!anyStatus && room.status && room.status !== 'waiting' && room.status !== 'playing') return null;
    const next = members.map((m, i) => (i === idx ? { ...m, uid: me } : m));
    return { ...room, members: next };
}

/** 기기 시계가 이만큼 넘게 틀리면 규칙(서버 시각 ±10분)에 막힐 수 있다고 안내해요. */
export const BOARD_ROOM_CLOCK_WARN_MS = 9 * 60 * 1000;

/**
 * 서버 응답의 Date 머리글로 기기 시계가 얼마나 틀렸는지 재요(양수면 기기가 빨라요).
 * 머리글이 없거나 깨졌으면 null이에요.
 */
export function boardRoomClockSkewMs(dateHeader, { sentAt, receivedAt } = {}) {
    const server = Date.parse(String(dateHeader || ''));
    const a = Number(sentAt);
    const b = Number(receivedAt);
    if (!Number.isFinite(server) || !Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    return Math.round((a + b) / 2 - server);
}

/**
 * 규칙이 방 쓰기를 막았을 때 왜 막혔는지 골라요(#88 r3 R2-4·R2-5).
 * - clock: 기기 시계가 9분 넘게 틀려요.
 * - other_device: 내 자리(또는 방장 자리)는 다른 기기 uid로 적혀 있어요.
 * - stale: 그 밖(옛 화면 등). 예전처럼 새로고침 안내를 띄워요.
 */
export function boardRoomDeniedReason({ room = null, studentId = '', uid = '', skewMs = null } = {}) {
    if (typeof skewMs === 'number' && Math.abs(skewMs) > BOARD_ROOM_CLOCK_WARN_MS) return 'clock';
    if (boardRoomSeatOnOtherDevice(room, { studentId, uid })) return 'other_device';
    return 'stale';
}

/**
 * 내 학번 자리(방장 자리 포함)가 다른 기기 uid로 적혀 있는지(#88 r4 ①).
 * 남이 내 학번으로 만든 방(알까기 id 선점 등)이면 true라서, 그 방에 저절로 들어가거나 내 방으로 붙잡지 않아요.
 */
export function boardRoomSeatOnOtherDevice(room, { studentId = '', uid = '' } = {}) {
    const me = cleanUid(uid);
    const id = cleanId(studentId);
    if (!room || typeof room !== 'object' || !me || !id) return false;
    if (cleanId(room.hostId) === id && cleanUid(room.hostUid) && cleanUid(room.hostUid) !== me) return true;
    const seat = (Array.isArray(room.members) ? room.members : []).find((m) => m && cleanId(m.id) === id);
    return !!(seat && cleanUid(seat.uid) && cleanUid(seat.uid) !== me);
}

/** 막힌 까닭에 맞는 안내 문구예요(stale은 화면 쪽 새로고침 안내를 그대로 써요). */
export function boardRoomDeniedText(reason, { skewMs = 0, host = false } = {}) {
    if (reason === 'clock') {
        const min = Math.max(1, Math.round(Math.abs(Number(skewMs) || 0) / 60000));
        const way = Number(skewMs) > 0 ? '빠르게' : '느리게';
        return `기기 시계가 약 ${min}분 ${way} 맞춰져 있어서 저장하지 못했어요.<br>기기 설정에서 날짜·시간을 '자동'으로 맞춘 뒤 다시 해 주세요.`;
    }
    if (reason === 'other_device') {
        return host
            ? '이 방은 처음 만든 기기에서만 바꿀 수 있어요.<br>그 기기로 이어서 하거나, 이 방을 두고 새 방을 만들어 주세요.'
            : '이 자리는 처음 들어간 기기에 묶여 있어요.<br>그 기기로 이어서 하거나, 방장에게 판을 끝내 달라고 해 주세요.';
    }
    return '';
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
export function decideBoardRoomCreate(existing, { hostId, now, uid = '' } = {}) {
    const hid = cleanId(hostId);
    if (!hid) return { action: 'error', error: 'bad_create' };
    if (!existing) return { action: 'create', error: '' };
    const t = Math.max(0, Math.floor(Number(now) || Date.now()));
    const r = sanitizeBoardRoom(existing, t);
    if (r.status === 'closed' || r.status === 'finished' || isRoomIdleExpired(r, t) || isBoardRoomCleanupAgeDue(r, t)) return { action: 'create', error: '' };
    if (r.status === 'waiting' && isRoomHost(r, hid)) return { action: 'reuse', error: '' };
    // r4 ①: 내 학번 자리가 다른 기기 uid로 적힌 판(남이 내 학번으로 미리 만든 방)에는 들어가지 않아요.
    if (r.status === 'playing' && isRoomMember(r, hid) && !boardRoomSeatOnOtherDevice(r, { studentId: hid, uid })) return { action: 'enter', error: '' };
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

export function requestJoinBoardRoom(room, { studentId, studentName, now, uid = '' } = {}) {
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
    const myUid = cleanUid(uid);
    const nextReq = { id, name: cleanName(studentName) || id, status: 'pending', at: t, ...(myUid ? { uid: myUid } : {}) };
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
    const members = r.members.concat([{ id: req.id, name: req.name, role: 'player', seat, ...(req.uid ? { uid: req.uid } : {}) }]);
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
export function pickMyActiveBoardRoom(rooms, studentId, { uid = '' } = {}) {
    const id = cleanId(studentId);
    if (!id) return null;
    const rank = { playing: 0, waiting: 1, finished: 2 };
    // r4 ①: 내 학번 자리가 다른 기기 uid로 적힌 방은 고르지 않아요(남이 내 학번으로 만든 방 때문에 내 방이 닫히지 않게).
    const mine = (Array.isArray(rooms) ? rooms : [])
        .map((raw) => sanitizeBoardRoom(raw))
        .filter((r) => r.id && r.status in rank && r.members.some((m) => m.id === id)
            && !boardRoomSeatOnOtherDevice(r, { studentId: id, uid }));
    mine.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.updatedAt - a.updatedAt));
    return mine[0] || null;
}

/**
 * 같은 id를 다시 쓰는 방(알까기)도 판마다 구별되게, id와 만든 시각을 함께 써요.
 * '한 판 더'로 새 판이 되면 판 번호(round)가 붙어서, 앞 판에서 나온 사람도 새 판에는 다시 들어와요.
 * 판 번호가 0이면 예전 키(`id:만든 시각`) 그대로라, 이미 저장해 둔 '나온 방' 기억과 맞아요.
 */
export function boardRoomInstanceKey(room) {
    const r = sanitizeBoardRoom(room);
    if (!r.id) return '';
    return r.round > 0 ? `${r.id}:${r.createdAt}:${r.round}` : `${r.id}:${r.createdAt}`;
}

/**
 * 방 목록 화면에서 이 방으로 저절로 들어갈지 정해요(순수 함수).
 * - 내가 앉은 방만, 스스로 나온 판(leftKeys)은 빼요.
 * - 두는 중인 판은 들어가요.
 * - 끝난 판(알까기 제외)은 이 화면에서 두는 중이거나 기다리는 모습을 본 판(seenLiveKeys)이거나,
 *   이 화면을 연 뒤(sinceMs 이후)에 끝난 판일 때만 들어가요. 새 탭·다른 기기에서 예전에 끝난 결과로 끌려가지 않게 해요.
 * @param {object} room
 * @param {{ selfId?: string, uid?: string, leftKeys?: Set<string>, seenLiveKeys?: Set<string>, sinceMs?: number }} [o]
 */
export function shouldAutoEnterBoardRoom(room, o = {}) {
    const r = sanitizeBoardRoom(room);
    if (!r.id || !isRoomMember(r, o.selfId)) return false;
    if (boardRoomSeatOnOtherDevice(r, { studentId: o.selfId, uid: o.uid })) return false;
    const key = boardRoomInstanceKey(r);
    if (o.leftKeys && o.leftKeys.has(key)) return false;
    if (r.status === 'playing') return true;
    if (r.status !== 'finished' || r.gameType === 'alkkagi') return false;
    if (o.seenLiveKeys && o.seenLiveKeys.has(key)) return true;
    const since = Number(o.sinceMs) || 0;
    return since > 0 && r.updatedAt >= since;
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
export function collectBoardRoomVacateActions(rooms, { studentId, exceptRoomId = '', uid = '' } = {}) {
    const id = cleanId(studentId);
    const me = cleanUid(uid);
    const except = String(exceptRoomId || '').trim();
    const closeHostIds = [];
    const cancelJoinIds = [];
    if (!id) return { closeHostIds, cancelJoinIds };
    (Array.isArray(rooms) ? rooms : []).forEach((raw) => {
        const r = sanitizeBoardRoom(raw);
        if (!r.id || r.id === except || r.status === 'closed') return;
        // 다른 기기(uid)가 연 내 학번 방은 이 기기가 닫지 못해요(규칙). 괜히 막힌 쓰기를 보내지 않아요.
        if (r.status === 'waiting' && r.hostId === id && !(me && r.hostUid && r.hostUid !== me)) closeHostIds.push(r.id);
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
        // 방 id·만든 시각은 그대로 두고 판 번호만 올려요(#88 규칙: hostUid·createdAt 바꾸지 않기).
        room: touchRoom(r, t, { status: 'playing', game, round: r.round + 1 }),
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
    return { ...r, game, participantIds: boardRoomParticipantIds(r), memberUids: boardRoomMemberUids(r) };
}

/** 참가자 기기 uid 목록. 규칙이 '방장·참가자만' 판을 끝내거나 방을 닫게 할 때 써요. */
export function boardRoomMemberUids(room) {
    const r = room && typeof room === 'object' ? room : {};
    const out = [];
    (Array.isArray(r.members) ? r.members : []).forEach((m) => {
        const uid = cleanUid(m && m.uid);
        if (uid && !out.includes(uid)) out.push(uid);
    });
    return out;
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
/** 내 방(참가 중·신청 중) 중 `bg_`로 시작하는 방(오목·체스) 질의 상한. 넘치면 옛 방부터 빠져요. */
export const BOARD_MINE_QUERY_LIMIT = 10;
/**
 * 내 방 질의를 문서 id로 둘로 나누는 경계예요. 알까기 방(`alk_<방장>`)은 id가 이보다 앞이라 따로 받아요.
 * 끝난 알까기 방이 오목·체스 '내 방' 칸을 채워 새 대전에 못 들어가던 문제를 막아요(복합 색인 없이 id 범위만 써요).
 */
export const BOARD_MINE_ID_SPLIT = 'bg_';
/** 알까기 등 `bg_` 앞 id 방의 '내 방' 질의 상한. 알까기 방은 방장마다 하나라 반 인원 정도면 충분해요. */
export const BOARD_MINE_OTHER_QUERY_LIMIT = 20;

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
