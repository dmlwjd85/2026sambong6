/**
 * 학생별 보드게임(오목) 승패 기록.
 * 학생 문서 `boardGameRecords` 에 두고, 로비·결과 화면에 짧게 보여 줍니다.
 */

import { GOMOKU_BLACK, GOMOKU_WHITE, sanitizeGomokuGame } from './gomokuGame.js';

export const BOARD_GAME_RECORD_TYPES = Object.freeze(['gomoku']);

export function emptyBoardGameTypeRecord() {
    return { wins: 0, losses: 0, draws: 0 };
}

export function emptyBoardGameRecords() {
    return {
        gomoku: emptyBoardGameTypeRecord(),
        recentKeys: [],
    };
}

function clampCount(raw) {
    const n = Math.floor(Number(raw) || 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(99999, n);
}

function sanitizeTypeRecord(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        wins: clampCount(src.wins),
        losses: clampCount(src.losses),
        draws: clampCount(src.draws),
    };
}

export function sanitizeBoardGameRecords(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const recentKeys = (Array.isArray(src.recentKeys) ? src.recentKeys : [])
        .map((k) => String(k || '').slice(0, 80))
        .filter(Boolean)
        .slice(-24);
    return {
        gomoku: sanitizeTypeRecord(src.gomoku),
        recentKeys,
    };
}

export function boardGameRecordText(records, gameType = 'gomoku') {
    const rec = sanitizeBoardGameRecords(records);
    const row = rec[gameType] || emptyBoardGameTypeRecord();
    return `${row.wins}승 ${row.losses}패 ${row.draws}무`;
}

/** 이미 반영한 판이면 그대로 두고, 아니면 승/패/무를 하나 더합니다. */
export function applyBoardGameRecord(records, { gameType = 'gomoku', result, key } = {}) {
    const next = sanitizeBoardGameRecords(records);
    const k = String(key || '').slice(0, 80);
    if (k && next.recentKeys.includes(k)) return next;
    const type = BOARD_GAME_RECORD_TYPES.includes(gameType) ? gameType : 'gomoku';
    const row = { ...next[type] };
    if (result === 'win') row.wins += 1;
    else if (result === 'loss') row.losses += 1;
    else if (result === 'draw') row.draws += 1;
    else return next;
    if (k) next.recentKeys = next.recentKeys.concat(k).slice(-24);
    next[type] = row;
    return next;
}

/** 내 돌 색 기준으로 이 판의 승/패/무를 봅니다. */
export function gomokuRecordResult(game, myColor) {
    const g = sanitizeGomokuGame(game);
    const mine = myColor === GOMOKU_WHITE ? GOMOKU_WHITE : (myColor === GOMOKU_BLACK ? GOMOKU_BLACK : 0);
    if (!mine) return '';
    if (g.endReason === 'draw') return 'draw';
    if (!g.winner) return '';
    return g.winner === mine ? 'win' : 'loss';
}

export function gomokuResultKey(roomOrId, game) {
    const id = typeof roomOrId === 'string' ? roomOrId : String((roomOrId && roomOrId.id) || 'local');
    const g = sanitizeGomokuGame(game || (roomOrId && roomOrId.game) || {});
    return `${id}:${g.turnStartedAt}:${g.moveCount}:${g.winner}:${g.endReason || ''}`.slice(0, 80);
}
