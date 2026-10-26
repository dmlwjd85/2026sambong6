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
