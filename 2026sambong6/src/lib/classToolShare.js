/**
 * 수업도구 창을 학급 전체에 띄우거나 내립니다.
 * 마스터가 연 도구 화면을 학생·TV가 같이 보고, 닫으면 같이 닫힙니다.
 */

export const CLASS_TOOL_SHARE_IDS = Object.freeze([
    'timetable',
    'thermo',
    'chalk',
    'timer',
    'lottery',
    'vote',
    'wheel',
    'martial',
    'morning',
]);

export function isClassToolShareId(toolId) {
    return CLASS_TOOL_SHARE_IDS.includes(String(toolId || ''));
}

export function sanitizeClassToolShare(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { active: false, toolId: '', sessionId: '', updatedAt: 0 };
    }
    const toolId = isClassToolShareId(raw.toolId) ? String(raw.toolId) : '';
    const sessionId = String(raw.sessionId || '').trim().slice(0, 80);
    const updatedAt = Math.max(0, Math.floor(Number(raw.updatedAt) || 0));
    const active = raw.active === true && !!toolId && !!sessionId;
    return {
        active,
        toolId: active ? toolId : '',
        sessionId: active ? sessionId : '',
        updatedAt,
    };
}

/** 지금 이 도구 창을 학급에 띄울 때 쓰는 문서 */
export function openClassToolShare(toolId) {
    const id = String(toolId || '');
    if (!isClassToolShareId(id)) return null;
    return sanitizeClassToolShare({
        active: true,
        toolId: id,
        sessionId: `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        updatedAt: Date.now(),
    });
}

export function closeClassToolShare(raw) {
    const cur = sanitizeClassToolShare(raw);
    return {
        active: false,
        toolId: '',
        sessionId: '',
        updatedAt: Date.now() || cur.updatedAt,
    };
}

/** 같은 세션을 이미 따라가고 있으면 창을 다시 열지 않습니다. */
export function classToolShareShouldOpen(share, followedSessionId) {
    const n = sanitizeClassToolShare(share);
    if (!n.active) return false;
    return n.sessionId !== String(followedSessionId || '');
}

export function classToolShareShouldClose(share, followedSessionId) {
    const n = sanitizeClassToolShare(share);
    if (!String(followedSessionId || '')) return false;
    if (!n.active) return true;
    return n.sessionId !== String(followedSessionId || '');
}
