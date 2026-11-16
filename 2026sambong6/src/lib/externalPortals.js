/**
 * 외부 세계 차원문 링크. 학급마다 마스터가 + 버튼으로 등록합니다.
 * 저장 위치: artifacts/{학급ID}/public/data/settings/global 의 externalPortals 배열.
 * 원래 학급(6학년 1반, sambong-class-2026)만 저장된 목록이 없을 때 기존 기본 링크를 보여 주고,
 * 새로 만든 학급은 빈 목록에서 시작합니다. 기본 링크는 Firestore에 미리 써 두지 않습니다.
 */
import { SEED_MASTER_CLASS_ID } from './classCreateRequest.js';

export const EXTERNAL_PORTAL_MAX = 12;
export const EXTERNAL_PORTAL_NAME_MAX = 24;
export const EXTERNAL_PORTAL_URL_MAX = 300;

const PORTAL_TONES = ['lime', 'cyan', 'red', 'amber', 'fuchsia', 'sky'];

/** 6학년 1반(원래 학급)에 처음부터 있던 링크 */
export const HOME_CLASS_DEFAULT_PORTALS = Object.freeze([
    { id: 'fc', name: '삼봉FC', url: 'https://dmlwjd85.github.io/sambong-FC/', emoji: '⚽', desc: '축구 세계로 이동', tone: 'lime' },
    { id: 'ncgame', name: '가나다 눈치게임', url: 'https://dmlwjd85.github.io/ncgame/', emoji: 'ㄱㄴㄷ', desc: '눈치게임 세계로 이동', tone: 'cyan' },
    { id: 'englishrpg', name: '영켓몬', url: 'https://joontube82.github.io/English-RPG/', emoji: '🐾', desc: '영어 RPG 세계로 이동', tone: 'red' },
    { id: 'iscream', name: '지식의 샘', url: 'https://www.i-scream.co.kr/', emoji: '📚', desc: '아이스크림 지식 세계로 이동', tone: 'amber' },
    { id: 'picbook', name: '픽북', url: 'https://dmlwjd85.github.io/picbook/', emoji: '📖', desc: 'AI 그림책 세계로 이동', tone: 'fuchsia' },
].map((row) => Object.freeze(row)));

/** 기본 링크를 쓰는 학급인지 — 학급 ID로만 판별합니다(6학년 1반 = sambong-class-2026). */
export function usesHomeClassDefaultPortals(classId) {
    return String(classId || '') === SEED_MASTER_CLASS_ID;
}

function clip(raw, max) {
    return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** http·https 주소만 받습니다. 그 밖(javascript:, data: 등)은 빈 문자열 */
export function safeExternalUrl(raw) {
    const s = String(raw || '').trim();
    if (!s || s.length > EXTERNAL_PORTAL_URL_MAX) return '';
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        if (!u.hostname) return '';
        return u.toString();
    } catch (_) {
        return '';
    }
}

export function sanitizeExternalPortal(raw, idx = 0) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const url = safeExternalUrl(src.url);
    const name = clip(src.name, EXTERNAL_PORTAL_NAME_MAX);
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
    return list.map((row, i) => sanitizeExternalPortal(row, i)).filter(Boolean).slice(0, EXTERNAL_PORTAL_MAX);
}

/**
 * 저장된 배열이 있으면(빈 배열 포함) 그것만 씁니다.
 * 저장된 적이 없으면 6학년 1반은 기본 링크, 그 밖의 학급은 빈 목록입니다.
 */
export function resolveExternalPortals(raw, { classId = '' } = {}) {
    if (Array.isArray(raw)) return sanitizeExternalPortals(raw);
    if (usesHomeClassDefaultPortals(classId)) return sanitizeExternalPortals(HOME_CLASS_DEFAULT_PORTALS);
    return [];
}

/**
 * + 버튼 입력 검사.
 * @returns {{ ok: true, name: string, url: string } | { ok: false, reason: 'name'|'url'|'scheme' }}
 */
export function validateExternalPortalInput({ name, url } = {}) {
    const cleanName = clip(name, 200);
    if (!cleanName) return { ok: false, reason: 'name' };
    if (cleanName.length > EXTERNAL_PORTAL_NAME_MAX) return { ok: false, reason: 'name_long' };
    let rawUrl = String(url || '').trim();
    if (!rawUrl) return { ok: false, reason: 'url' };
    // 주소만 쓰면 https를 붙여 줍니다. 다른 스킴(javascript: 등)은 막습니다.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(rawUrl)) rawUrl = `https://${rawUrl}`;
    if (!/^https?:\/\//i.test(rawUrl)) return { ok: false, reason: 'scheme' };
    const safe = safeExternalUrl(rawUrl);
    if (!safe) return { ok: false, reason: 'url' };
    return { ok: true, name: cleanName, url: safe };
}

export function externalPortalInputMessage(reason) {
    switch (reason) {
        case 'name': return '이름을 입력하세요.';
        case 'name_long': return `이름은 ${EXTERNAL_PORTAL_NAME_MAX}자까지 쓸 수 있어요.`;
        case 'scheme': return 'http:// 또는 https:// 로 시작하는 주소만 등록할 수 있어요.';
        case 'url': return '올바른 인터넷 주소를 입력하세요. 예: https://example.com';
        case 'full': return `링크는 ${EXTERNAL_PORTAL_MAX}개까지 등록할 수 있어요.`;
        case 'dup': return '이미 등록된 주소예요.';
        default: return '링크를 등록하지 못했어요.';
    }
}

/**
 * 서버 목록 끝에 새 링크 1개를 붙입니다(트랜잭션 안에서 호출).
 * @returns {{ ok: true, list: object[], item: object } | { ok: false, reason: string }}
 */
export function appendExternalPortal(serverList, input, { nowMs = Date.now(), rand = Math.random, classId = '' } = {}) {
    const v = validateExternalPortalInput(input);
    if (!v.ok) return v;
    // 6학년 1반에서 처음 추가하면 기본 링크 뒤에 붙여 저장합니다(기본 링크가 사라지지 않게).
    const list = resolveExternalPortals(serverList, { classId });
    if (list.length >= EXTERNAL_PORTAL_MAX) return { ok: false, reason: 'full' };
    if (list.some((row) => row.url === v.url)) return { ok: false, reason: 'dup' };
    const used = new Set(list.map((row) => row.id));
    let id = '';
    for (let i = 0; i < 5 && (!id || used.has(id)); i += 1) {
        id = `p${Math.floor(Number(nowMs) || 0).toString(36)}${Math.floor((rand() || 0) * 1e6).toString(36)}`.slice(0, 24);
    }
    if (used.has(id)) id = `p_${list.length}_${Math.floor(Number(nowMs) || 0) % 100000}`;
    const item = sanitizeExternalPortal({ id, name: v.name, url: v.url, emoji: '🌐', desc: '' }, list.length);
    return { ok: true, list: [...list, item], item };
}
