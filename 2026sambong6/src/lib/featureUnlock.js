/**
 * 학생 기능 잠금해제 — 퀘스트 통계·수업도구를 항목당 300봉에 엽니다.
 * 마스터(isAdmin)는 결제 없이 전부 사용할 수 있습니다.
 * 온도계·비상계엄·학급투표·아침·공지는 마스터 전용입니다.
 */

export const FEATURE_UNLOCK_PRICE = 300;

/** 마스터만 쓰는 수업도구 (학생 잠금해제 대상이 아님) */
export const MASTER_ONLY_CLASS_TOOLS = ['thermo', 'martial', 'vote', 'morning'];

export const FEATURE_UNLOCK_CATALOG = [
    { id: 'stats', kind: 'stats', label: '퀘스트 통계' },
    { id: 'tool_timetable', kind: 'classtool', toolId: 'timetable', label: '시간표' },
    { id: 'tool_chalk', kind: 'classtool', toolId: 'chalk', label: '칠판' },
    { id: 'tool_timer', kind: 'classtool', toolId: 'timer', label: '타이머' },
    { id: 'tool_lottery', kind: 'classtool', toolId: 'lottery', label: '제비뽑기' },
    { id: 'tool_wheel', kind: 'classtool', toolId: 'wheel', label: '돌림판' },
];

export function featureIdForClassTool(toolId) {
    const id = String(toolId || '');
    const row = FEATURE_UNLOCK_CATALOG.find((f) => f.kind === 'classtool' && f.toolId === id);
    return row ? row.id : '';
}

export function getFeatureUnlockItem(featureId) {
    return FEATURE_UNLOCK_CATALOG.find((f) => f.id === String(featureId || '')) || null;
}

export function isMasterOnlyClassTool(toolId) {
    return MASTER_ONLY_CLASS_TOOLS.includes(String(toolId || ''));
}

/** Firestore에 넣을 잠금해제 맵만 남깁니다. */
export function sanitizeUnlockedFeatures(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    FEATURE_UNLOCK_CATALOG.forEach((item) => {
        if (src[item.id] === true) out[item.id] = true;
    });
    return out;
}

export function hasUnlockedFeature(playerState, featureId) {
    if (!featureId) return false;
    if (playerState && playerState.isAdmin) return true;
    const map = sanitizeUnlockedFeatures(playerState && playerState.unlockedFeatures);
    return !!map[featureId];
}

export function canOpenClassTool(playerState, toolId) {
    const id = String(toolId || '');
    if (!id) return false;
    if (playerState && playerState.isAdmin) return true;
    if (isMasterOnlyClassTool(id)) return false;
    const fid = featureIdForClassTool(id);
    if (!fid) return false;
    return hasUnlockedFeature(playerState, fid);
}

/** 광장 프로필용 상태 문구 — 공백 정리 후 10글자. */
export function sanitizeStatusMessage(raw) {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, 10).join('');
}
