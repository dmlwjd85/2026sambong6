/**
 * 학습 온도계 값을 학생별 표로 옮길 때, 예전 settings/global 값을 빼먹지 않게 고릅니다.
 * 표 문서가 없다는 것은 0이 아니라 "아직 옮기지 않음"입니다.
 * 예전 값을 한 번 정산에 쓴 뒤에는 allowLegacy 가 false 여야 하고, 시딩도 그걸 따릅니다.
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

/** 학생 표 값. 키가 없거나 숫자가 아니면 0입니다. */
export function thermometerVoteValue(values, sid, min, max) {
    const map = values && typeof values === 'object' ? values : {};
    return clampVote(map[String(sid)], min, max);
}

/**
 * 방금 서버에 쓴 값과 화면 값이 같을 때만 대기 목록에서 뺍니다.
 * 저장 요청이 네트워크를 기다리는 동안 움직인 학생은 남겨, 복사해 둔 옛 값으로 끝내지 않습니다.
 */
export function retainThermometerPendingIds({ pendingIds, writtenValues, currentValues, min, max } = {}) {
    const written = writtenValues && typeof writtenValues === 'object' ? writtenValues : {};
    const current = currentValues && typeof currentValues === 'object' ? currentValues : {};
    const keep = [];
    const seen = new Set();
    (pendingIds || []).forEach((sid) => {
        const id = String(sid);
        if (!id || seen.has(id)) return;
        seen.add(id);
        if (!Object.prototype.hasOwnProperty.call(written, id)) {
            keep.push(id);
            return;
        }
        const wrote = clampVote(written[id], min, max);
        const now = thermometerVoteValue(current, id, min, max);
        if (wrote !== now) keep.push(id);
    });
    return keep;
}

/**
 * 예전 값을 화면에 얹습니다. 이미 있는 학생 값(저장 중에 바꾼 값)은 그대로 둡니다.
 */
export function applyThermometerLegacySeeds(currentValues, seeds) {
    const current = currentValues && typeof currentValues === 'object' ? { ...currentValues } : {};
    const extra = seeds && typeof seeds === 'object' ? seeds : {};
    Object.keys(extra).forEach((sid) => {
        const id = String(sid);
        if (Object.prototype.hasOwnProperty.call(current, id)) return;
        current[id] = extra[sid];
    });
    return current;
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
 * 학생 한 명의 정산 출처. 표(0 포함)가 부모 값보다, 부모 값이 예전 global 보다 우선입니다.
 * 고르지 못하면 null 입니다.
 */
export function pickThermometerSettlementEntry({
    voteExists,
    voteValue,
    parentValue,
    globalValue,
    allowLegacy,
} = {}) {
    if (voteExists) return { kind: 'vote', value: voteValue };
    if (parentValue != null && parentValue !== '') return { kind: 'parent', value: parentValue };
    if (allowLegacy && globalValue !== undefined) return { kind: 'legacy', value: globalValue };
    return null;
}

/**
 * 정산할 숫자. 표 문서가 있으면 0도 그 값을 쓰고, 문서가 없을 때만 부모·예전 global을 봅니다.
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
    const picked = pickThermometerSettlementEntry({
        voteExists,
        voteValue,
        parentValue,
        globalValue: allowGlobalLegacy ? globalValue : undefined,
        allowLegacy: allowGlobalLegacy === true,
    });
    return clampVote(picked ? picked.value : 0, min, max);
}

/**
 * 표 문서가 없는 활성 학생만 예전 값으로 채웁니다.
 * allowLegacy 가 false 이면(소모 표식·오늘 정산 완료) 아무것도 쓰지 않습니다.
 * 이미 있는 표(0 포함), 이번 저장에서 직접 바꾼 학생, 비활성 학생은 그대로 둡니다.
 * 쓸 값이 없으면 null입니다.
 */
export function planThermometerLegacyVoteWrites({
    existingVoteIds,
    legacyValues,
    explicitIds,
    activeIds,
    allowLegacy = true,
    min,
    max,
} = {}) {
    if (allowLegacy === false) return null;
    const existing = new Set((existingVoteIds || []).map((id) => String(id)));
    const explicit = new Set((explicitIds || []).map((id) => String(id)));
    const active = Array.isArray(activeIds) ? new Set(activeIds.map((id) => String(id))) : null;
    const legacy = legacyValues && typeof legacyValues === 'object' ? legacyValues : {};
    const out = {};
    Object.keys(legacy).forEach((sid) => {
        const id = String(sid);
        if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) return;
        if (active && !active.has(id)) return;
        if (existing.has(id) || explicit.has(id)) return;
        const value = clampVote(legacy[sid], min, max);
        if (value === 0) return;
        out[id] = value;
    });
    return Object.keys(out).length ? out : null;
}
