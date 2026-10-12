/**
 * 외부 세계 차원문 링크. 시드 학급만 기본 링크를 쓰고, 새 학급은 비웁니다.
 */

export const DEFAULT_SEED_EXTERNAL_PORTALS = [
    { id: 'fc', name: '삼봉FC', url: 'https://dmlwjd85.github.io/sambong-FC/', emoji: '⚽', desc: '축구 세계로 이동', tone: 'lime' },
    { id: 'ncgame', name: '가나다 눈치게임', url: 'https://dmlwjd85.github.io/ncgame/', emoji: 'ㄱㄴㄷ', desc: '눈치게임 세계로 이동', tone: 'cyan' },
    { id: 'englishrpg', name: '영켓몬', url: 'https://joontube82.github.io/English-RPG/', emoji: '🐾', desc: '영어 RPG 세계로 이동', tone: 'red' },
    { id: 'iscream', name: '지식의 샘', url: 'https://www.i-scream.co.kr/', emoji: '📚', desc: '아이스크림 지식 세계로 이동', tone: 'amber' },
    { id: 'picbook', name: '픽북', url: 'https://dmlwjd85.github.io/picbook/', emoji: '📖', desc: 'AI 그림책 세계로 이동', tone: 'fuchsia' },
];

const PORTAL_TONES = ['lime', 'cyan', 'red', 'amber', 'fuchsia', 'sky'];

function clip(raw, max) {
    return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return u.toString();
    } catch (_) {
        return '';
    }
}

export function sanitizeExternalPortal(raw, idx = 0) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const url = safeUrl(src.url);
    const name = clip(src.name, 24);
    if (!url || !name) return null;
    const tone = PORTAL_TONES.includes(src.tone) ? src.tone : PORTAL_TONES[idx % PORTAL_TONES.length];
    return {
        id: clip(src.id, 24) || `portal_${idx}`,
        name,
        url,
        emoji: clip(src.emoji, 8) || '🌐',
        desc: clip(src.desc, 40),
        tone,
    };
}

export function sanitizeExternalPortals(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list.map((row, i) => sanitizeExternalPortal(row, i)).filter(Boolean).slice(0, 12);
}

/**
 * 저장된 배열이 있으면 그대로 씁니다.
 * 시드·예전 학급(기능 해금 기록 없음)은 HTML에 있던 기본 링크를 유지합니다.
 * 새로 만든 반만 빈 목록에서 시작합니다.
 */
export function resolveExternalPortals(raw, { isSeed = false, hasModuleRecord = false } = {}) {
    if (Array.isArray(raw)) return sanitizeExternalPortals(raw);
    if (isSeed || !hasModuleRecord) {
        return DEFAULT_SEED_EXTERNAL_PORTALS.map((row, i) => sanitizeExternalPortal(row, i)).filter(Boolean);
    }
    return [];
}
