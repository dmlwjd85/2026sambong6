/**
 * 학습 온도계 값을 학생별 표로 옮길 때, 예전 settings/global 값을 빼먹지 않게 고릅니다.
 * 표 문서가 없다는 것은 0이 아니라 "아직 옮기지 않음"입니다.
 */

function clampVote(raw, min, max) {
    let value = Math.round(Number(raw) || 0);
    const lo = Math.round(Number(min));
    const hi = Math.round(Number(max));
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo < hi) {
        value = Math.max(lo, Math.min(hi, value));
    }
    return value;
}

/** 표 문서가 하나라도 있을 때만 화면 값을 표로 바꿉니다. 빈 목록은 예전 값을 지우지 않습니다. */
export function thermometerVotesShouldReplaceValues(docCount) {
    return Math.max(0, Math.floor(Number(docCount) || 0)) > 0;
}

/**
 * 부모 문서에 values가 없으면 화면에 남아 있는 예전 값을 유지합니다.
 * 표 스냅샷을 이미 반영한 뒤에는 그 값을 유지합니다.
 */
export function pickThermometerDisplayValues({ votesSeen, parentValues, previousValues } = {}) {
    const previous = previousValues && typeof previousValues === 'object' ? previousValues : {};
    if (votesSeen) return { ...previous };
    const parent = parentValues && typeof parentValues === 'object' ? parentValues : null;
    if (parent && Object.keys(parent).some((sid) => Math.round(Number(parent[sid]) || 0) !== 0)) {
        return { ...parent };
    }
    return { ...previous };
}

/**
 * 오늘 정산이 끝났거나 진행 중이면 예전 global 값을 다시 넣지 않습니다.
 * 부모 문서만 있고 아직 정산 전이면, 표가 없는 학생은 global 값을 볼 수 있습니다.
 */
export function allowGlobalThermometerLegacy({ parentExists, settlementStatus, settledDate, today } = {}) {
    if (!parentExists) return true;
    if (String(settlementStatus || '') === 'running') return false;
    if (today && String(settledDate || '') === String(today)) return false;
    return true;
}

/**
 * 표 문서가 없는 학생만 예전 값으로 채웁니다.
 * 이미 있는 표(0 포함)와 이번 저장에서 직접 바꾼 학생은 그대로 둡니다.
 * 쓸 값이 없으면 null입니다.
 */
export function planThermometerLegacyVoteWrites({
    existingVoteIds,
    legacyValues,
    explicitIds,
    min,
    max,
} = {}) {
    const existing = new Set((existingVoteIds || []).map((id) => String(id)));
    const explicit = new Set((explicitIds || []).map((id) => String(id)));
    const legacy = legacyValues && typeof legacyValues === 'object' ? legacyValues : {};
    const out = {};
    Object.keys(legacy).forEach((sid) => {
        const id = String(sid);
        if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) return;
        if (existing.has(id) || explicit.has(id)) return;
        const value = clampVote(legacy[sid], min, max);
        if (value === 0) return;
        out[id] = value;
    });
    return Object.keys(out).length ? out : null;
}

/**
 * 정산할 값. 표 문서가 있으면 0도 그 값을 쓰고, 문서가 없을 때만 부모·예전 global을 봅니다.
 */
export function resolveThermometerSettlementValue({
    voteExists,
    voteValue,
    parentValue,
    globalValue,
    allowGlobalLegacy,
    min,
    max,
} = {}) {
    let source = null;
    if (voteExists) source = voteValue;
    else if (parentValue != null && parentValue !== '') source = parentValue;
    else if (allowGlobalLegacy) source = globalValue;
    return clampVote(source, min, max);
}
