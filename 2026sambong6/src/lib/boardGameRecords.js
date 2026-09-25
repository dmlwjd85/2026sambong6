/**
 * 학생별 보드게임 승패 기록(오목·체스).
 * 학생 문서 `boardGameRecords` 에 두고, 로비·결과 화면에 짧게 보여 줍니다.
 */

import { CHESS_BLACK, CHESS_WHITE, sanitizeChessGame } from './chessGame.js';
import { GOMOKU_BLACK, GOMOKU_WHITE, sanitizeGomokuGame } from './gomokuGame.js';

export const BOARD_GAME_RECORD_TYPES = Object.freeze(['gomoku', 'chess']);

export function emptyBoardGameTypeRecord() {
    return { wins: 0, losses: 0, draws: 0 };
}

export function emptyBoardGameRecords() {
    return {
        gomoku: emptyBoardGameTypeRecord(),
        chess: emptyBoardGameTypeRecord(),
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
        chess: sanitizeTypeRecord(src.chess),
        recentKeys,
    };
}

export function boardGameRecordText(records, gameType = 'gomoku') {
    const rec = sanitizeBoardGameRecords(records);
    const row = rec[gameType] || emptyBoardGameTypeRecord();
    return `${row.wins}승 ${row.losses}패 ${row.draws}무`;
}

/** 이미 반영한 판이면 그대로 두고, 아니면 승/패/무를 하나 더합니다. */
/** 방금 로컬에 올린 전적이 스냅샷에 아직 없을 때, 더 큰 숫자와 최근 키를 남깁니다. */
export function mergeBoardGameRecords(a, b) {
    const left = sanitizeBoardGameRecords(a);
    const right = sanitizeBoardGameRecords(b);
    const seen = new Set();
    const recentKeys = [];
    left.recentKeys.concat(right.recentKeys).forEach((k) => {
        if (!k || seen.has(k)) return;
        seen.add(k);
        recentKeys.push(k);
    });
    return {
        gomoku: {
            wins: Math.max(left.gomoku.wins, right.gomoku.wins),
            losses: Math.max(left.gomoku.losses, right.gomoku.losses),
            draws: Math.max(left.gomoku.draws, right.gomoku.draws),
        },
        chess: {
            wins: Math.max(left.chess.wins, right.chess.wins),
            losses: Math.max(left.chess.losses, right.chess.losses),
            draws: Math.max(left.chess.draws, right.chess.draws),
        },
        recentKeys: recentKeys.slice(-24),
    };
}

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

export function chessRecordResult(game, myColor) {
    const g = sanitizeChessGame(game);
    const mine = myColor === CHESS_BLACK || myColor === CHESS_WHITE ? myColor : '';
    if (!mine) return '';
    if (['stalemate', 'fifty', 'material', 'threefold'].includes(g.endReason)) return 'draw';
    if (!g.winner) return '';
    return g.winner === mine ? 'win' : 'loss';
}

export function chessResultKey(roomOrId, game) {
    const id = typeof roomOrId === 'string' ? roomOrId : String((roomOrId && roomOrId.id) || 'local');
    const g = sanitizeChessGame(game || (roomOrId && roomOrId.game) || {});
    return `${id}:chess:${g.turnStartedAt}:${g.moveCount}:${g.winner}:${g.endReason || ''}`.slice(0, 80);
}

export function gomokuResultKey(roomOrId, game) {
    const id = typeof roomOrId === 'string' ? roomOrId : String((roomOrId && roomOrId.id) || 'local');
    const g = sanitizeGomokuGame(game || (roomOrId && roomOrId.game) || {});
    return `${id}:${g.turnStartedAt}:${g.moveCount}:${g.winner}:${g.endReason || ''}`.slice(0, 80);
}
