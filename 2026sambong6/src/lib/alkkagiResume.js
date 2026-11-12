/**
 * 새로고침 뒤 하던 알까기로 돌아가기(순수 함수).
 * sessionStorage에 넣을 값만 만들고 읽어요. 같은 탭에서만 남고, 30분이 지나면 버려요.
 * - 온라인 방: { v:1, kind:'room', id, t }
 * - 한 화면 둘이서·AI: { v:1, kind:'local', game, ai:{level,seed}|null, t }
 */
import { isAlkkagiOver, sanitizeAlkkagiGame } from './alkkagiGame.js';
import { sanitizeAlkkagiAiLevel } from './alkkagiAi.js';

export const ALKKAGI_RESUME_KEY = 'sambong_alk_resume';
export const ALKKAGI_RESUME_MAX_MS = 30 * 60 * 1000;

export function buildAlkkagiResume({ roomId = '', game = null, ai = null } = {}, now = Date.now()) {
    const t = Math.floor(Number(now) || 0);
    if (roomId) return JSON.stringify({ v: 1, kind: 'room', id: String(roomId).slice(0, 80), t });
    if (!game || isAlkkagiOver(game)) return '';
    const g = sanitizeAlkkagiGame(game);
    const a = ai ? { level: sanitizeAlkkagiAiLevel(ai.level), seed: Math.floor(Number(ai.seed) || 1) } : null;
    return JSON.stringify({ v: 1, kind: 'local', game: g, ai: a, t });
}

export function parseAlkkagiResume(raw, now = Date.now()) {
    if (!raw || typeof raw !== 'string') return null;
    let d;
    try {
        d = JSON.parse(raw);
    } catch (_) {
        return null;
    }
    if (!d || d.v !== 1) return null;
    const t = Number(d.t);
    if (!Number.isFinite(t) || now - t > ALKKAGI_RESUME_MAX_MS || t - now > 60 * 1000) return null;
    if (d.kind === 'room') {
        const id = typeof d.id === 'string' ? d.id.trim() : '';
        return id ? { kind: 'room', id } : null;
    }
    if (d.kind === 'local') {
        const game = sanitizeAlkkagiGame(d.game);
        if (!game.stones.length || isAlkkagiOver(game)) return null;
        const ai = d.ai && typeof d.ai === 'object'
            ? { level: sanitizeAlkkagiAiLevel(d.ai.level), seed: Math.floor(Number(d.ai.seed) || 1) }
            : null;
        return { kind: 'local', game, ai };
    }
    return null;
}

/**
 * 새로고침 뒤 저장해 둔 온라인 방(kind:'room')으로 바로 돌아가도 되는지 봐요.
 * - 턴제 알까기 방(alkkagi)과, 실시간 입구가 켜져 있을 때의 실시간 방(alkkagiLive)만
 * - 두는 중(playing)인 판만. 끝난(finished)·닫힌 방으로는 끌려가지 않아요(#88 F1과 같은 뜻)
 * - 내가 그 방 자리에 있고(isMember), 스스로 나온 방(left)이 아닐 때만
 */
export function canResumeAlkkagiRoom(room, { isMember = false, left = false, liveEnabled = false } = {}) {
    if (!room || typeof room !== 'object') return false;
    const type = room.gameType;
    if (type !== 'alkkagi' && !(liveEnabled && type === 'alkkagiLive')) return false;
    if (room.status !== 'playing') return false;
    return !!isMember && !left;
}
