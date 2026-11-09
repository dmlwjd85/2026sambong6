/**
 * 외부 세계 차원문 링크. 코드에 박아 둔 기본 링크 없이, 학급마다 마스터가 + 버튼으로 등록합니다.
 * 저장 위치: artifacts/{학급ID}/public/data/settings/global 의 externalPortals 배열.
 */

export const EXTERNAL_PORTAL_MAX = 12;
export const EXTERNAL_PORTAL_NAME_MAX = 24;
export const EXTERNAL_PORTAL_URL_MAX = 300;

const PORTAL_TONES = ['lime', 'cyan', 'red', 'amber', 'fuchsia', 'sky'];

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

/** 저장된 배열만 씁니다. 저장된 링크가 없으면 빈 목록입니다(기본 링크 없음). */
export function resolveExternalPortals(raw) {
    return sanitizeExternalPortals(raw);
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
export function appendExternalPortal(serverList, input, { nowMs = Date.now(), rand = Math.random } = {}) {
    const v = validateExternalPortalInput(input);
    if (!v.ok) return v;
    const list = sanitizeExternalPortals(serverList);
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
