/**
 * 학습 온도계 정산이 학생마다 어느 값을 쓸지 고릅니다.
 * 표 문서가 있으면 그 값(0 포함)만 씁니다. 표가 없는 학생만 부모 값, 그다음 예전 settings/global 값을 봅니다.
 * 표가 하나 있다고 해서 표가 없는 다른 학생의 예전 값을 버리지 않습니다.
 */
import { getDoc, increment, runTransaction, updateDoc } from 'firebase/firestore';
import { isCreditDefaultOn, isLoanPenaltyActive } from './bankLoan.js';
import { applyFullXpDeduct } from './gear.js';
import { applyShieldToXpDeduct } from './season2.js';
import { pickThermometerSettlementEntry } from './learningThermometerVotes.js';

export const THERMOMETER_XP_LOG_LIMIT = 40;
export const THERMOMETER_LOCK_CLOCK_SKEW_MS = 15000;
const THERMOMETER_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 어제(또는 그 이전) 키로 running 인 정산이 있으면 그 키를 돌려줍니다.
 * 같은 날, 이미 끝난 정산, 오늘보다 앞선 키는 여기서 마무리하지 않습니다.
 */
export function priorRunningThermometerSettlementKey({ settlementStatus, settlementKey, today } = {}) {
    const key = String(settlementKey || '');
    const day = String(today || '');
    if (String(settlementStatus || '') !== 'running') return '';
    if (!THERMOMETER_DAY.test(key) || !THERMOMETER_DAY.test(day)) return '';
    if (key >= day) return '';
    return key;
}

/** 화면과 정산이 같이 쓰는 부모 문서 모양입니다. 날짜가 오늘이 아니면 값은 비웁니다. */
export function sanitizeThermometerParentState(raw, { today = '', minDefault = -20, maxDefault = 20 } = {}) {
    const src = raw && typeof raw === 'object' ? raw : {};
    let min = Math.floor(Number(src.min));
    let max = Math.floor(Number(src.max));
    if (!Number.isFinite(min)) min = minDefault;
    if (!Number.isFinite(max)) max = maxDefault;
    min = Math.max(-500, Math.min(0, min));
    max = Math.min(500, Math.max(0, max));
    if (min >= max) {
        min = minDefault;
        max = maxDefault;
    }

    const values = {};
    const rawValues = src.values && typeof src.values === 'object' ? src.values : {};
    Object.keys(rawValues).forEach((sid) => {
        const id = String(sid);
        const val = Math.max(min, Math.min(max, Math.round(Number(rawValues[id]) || 0)));
        if (val !== 0) values[id] = val;
    });

    const stateDate = src.date ? String(src.date) : today;
    return {
        date: stateDate,
        min,
        max,
        values: stateDate === today ? values : {},
        settledDate: src.settledDate ? String(src.settledDate) : '',
        lastSettlementAt: Number(src.lastSettlementAt) || 0,
        settlementKey: src.settlementKey ? String(src.settlementKey) : '',
        settlementStatus: src.settlementStatus ? String(src.settlementStatus) : '',
        settlementStartedAt: Number(src.settlementStartedAt) || 0,
        settlementLockOwner: src.settlementLockOwner ? String(src.settlementLockOwner).slice(0, 80) : '',
        settlementAttempt: Math.max(0, Math.min(1000000, Math.floor(Number(src.settlementAttempt) || 0))),
        usedStaleValues: src.usedStaleValues === true,
        settlementAppliedCount: Math.max(0, Math.floor(Number(src.settlementAppliedCount) || 0)),
        settlementTotalDelta: Math.floor(Number(src.settlementTotalDelta) || 0),
    };
}

/** 규칙이 허용하는 부모 문서 필드만 남깁니다. values 는 학생별 표 문서에 있습니다. */
export function buildThermometerParentPayload(state, options = {}) {
    const today = options.today ? String(options.today) : '';
    const safe = sanitizeThermometerParentState(state, options);
    return {
        date: String(safe.date || today).slice(0, 10),
        min: safe.min,
        max: safe.max,
        settledDate: String(safe.settledDate || '').slice(0, 10),
        lastSettlementAt: Math.floor(Number(safe.lastSettlementAt) || 0),
        settlementKey: String(safe.settlementKey || '').slice(0, 12),
        settlementStatus: String(safe.settlementStatus || '').slice(0, 20),
        settlementStartedAt: Math.floor(Number(safe.settlementStartedAt) || 0),
        settlementLockOwner: String(safe.settlementLockOwner || '').slice(0, 80),
        settlementAttempt: Math.max(0, Math.min(1000000, Math.floor(Number(safe.settlementAttempt) || 0))),
        usedStaleValues: safe.usedStaleValues === true,
        settlementAppliedCount: Math.max(0, Math.min(40, Math.floor(Number(safe.settlementAppliedCount) || 0))),
        settlementTotalDelta: Math.max(-20000, Math.min(20000, Math.floor(Number(safe.settlementTotalDelta) || 0))),
    };
}

function legacyMap(values) {
    return values && typeof values === 'object' ? values : null;
}

export function thermometerValueSource({ voteValues, parentValues, legacyValues, allowLegacy } = {}) {
    const votes = voteValues && typeof voteValues === 'object' ? voteValues : {};
    const parent = legacyMap(parentValues);
    const legacy = legacyMap(legacyValues);
    const ids = new Set([
        ...Object.keys(votes),
        ...(parent ? Object.keys(parent) : []),
        ...(allowLegacy && legacy ? Object.keys(legacy) : []),
    ]);
    const values = {};
    const legacyIds = [];
    let sawVote = false;
    let sawParent = false;
    ids.forEach((id) => {
        const voteExists = Object.prototype.hasOwnProperty.call(votes, id);
        const parentValue = parent && Object.prototype.hasOwnProperty.call(parent, id) ? parent[id] : undefined;
        const hasLegacy = !!(allowLegacy && legacy && Object.prototype.hasOwnProperty.call(legacy, id));
        const picked = pickThermometerSettlementEntry({
            voteExists,
            voteValue: voteExists ? votes[id] : undefined,
            parentValue,
            globalValue: hasLegacy ? legacy[id] : undefined,
            allowLegacy: hasLegacy,
        });
        if (!picked) return;
        values[id] = picked.value;
        if (picked.kind === 'vote') sawVote = true;
        else if (picked.kind === 'parent') sawParent = true;
        else if (picked.kind === 'legacy') legacyIds.push(String(id));
    });
    let kind = 'empty';
    if (legacyIds.length) kind = 'legacy';
    else if (sawVote) kind = 'votes';
    else if (sawParent) kind = 'parent';
    return { kind, values, legacyIds };
}

function legacyHasNonZero(legacyValues) {
    const legacy = legacyMap(legacyValues);
    if (!legacy) return false;
    return Object.keys(legacy).some((sid) => Math.round(Number(legacy[sid]) || 0) !== 0);
}

/**
 * 예전 settings/global 값을 학생 표에 보충할 수 있는지.
 * 허용은 둘 중 하나입니다.
 * - 정산 중이 아니고, 오늘 아직 끝나지 않았고, usedStaleValues 로 소모하지 않음
 * - 같은 날 running 재시도 (한번 소모했더라도 그 날의 잠금 재시도만)
 * 날짜를 모르면 부모 문서가 있는 비-running 상태는 열지 않습니다.
 * 소모된 값은 다음 날 running 에서도 열지 않습니다.
 */
export function allowLegacyThermometerValues({
    parentExists,
    settlementStatus,
    usedStaleValues,
    settlementKey,
    settledDate,
    today,
} = {}) {
    if (!parentExists) return true;
    const status = String(settlementStatus || '');
    const consumed = usedStaleValues === true;
    const day = today ? String(today) : '';
    const running = status === 'running';
    const sameDayRunning = running && day !== '' && String(settlementKey || '') === day;
    if (sameDayRunning) return true;
    if (running) {
        if (consumed) return false;
        return true;
    }
    if (!day) return false;
    if (String(settledDate || '') === day) return false;
    if (consumed) return false;
    return true;
}

/**
 * 활성 학생의 정산 값과, 예전 global 값을 이번 시도 뒤에 닫을지.
 * legacyIds 는 표가 없어 예전 값으로 지급하는 활성 학생입니다.
 * consumeLegacy 는 비활성 학생의 남은 값까지 포함해, 다음 날과 시딩이 다시 주지 않게 합니다.
 */
export function planThermometerSettlement({
    activeIds,
    voteValues,
    parentExists,
    parentData,
    legacyThermometer,
    today,
    min,
    max,
} = {}) {
    const parent = parentData && typeof parentData === 'object' ? parentData : {};
    const legacyAllowed = allowLegacyThermometerValues({
        parentExists: !!parentExists,
        settlementStatus: parent.settlementStatus,
        usedStaleValues: parent.usedStaleValues === true,
        settlementKey: parent.settlementKey,
        settledDate: parent.settledDate,
        today,
    });
    const legacyValues = legacyThermometer && typeof legacyThermometer === 'object'
        ? legacyThermometer.values
        : null;
    const source = thermometerValueSource({
        voteValues,
        parentValues: parentExists ? parent.values : null,
        legacyValues,
        allowLegacy: legacyAllowed,
    });
    const lo = Number.isFinite(Number(min)) ? Math.round(Number(min)) : -20;
    const hi = Number.isFinite(Number(max)) ? Math.round(Number(max)) : 20;
    const legacyIdSet = new Set(source.legacyIds || []);
    const pendingValues = {};
    const legacyIds = [];
    (activeIds || []).forEach((sid) => {
        const id = String(sid);
        if (!Object.prototype.hasOwnProperty.call(source.values, id)) return;
        let value = Math.round(Number(source.values[id]) || 0);
        if (lo < hi) value = Math.max(lo, Math.min(hi, value));
        if (!value) return;
        pendingValues[id] = value;
        if (legacyIdSet.has(id)) legacyIds.push(id);
    });
    const leftover = legacyHasNonZero(legacyValues);
    const consumeLegacy = leftover && (legacyAllowed || parent.usedStaleValues === true);
    const votes = voteValues && typeof voteValues === 'object' ? voteValues : {};
    const legacyIdsToClose = [];
    const legacy = legacyMap(legacyValues);
    if (legacy) {
        Object.keys(legacy).forEach((sid) => {
            const id = String(sid);
            if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) return;
            if (Object.prototype.hasOwnProperty.call(votes, id)) return;
            if (Math.round(Number(legacy[id]) || 0) === 0) return;
            legacyIdsToClose.push(id);
        });
    }
    return {
        legacyAllowed,
        sourceKind: source.kind,
        pendingValues,
        legacyIds,
        legacyIdsToClose: consumeLegacy ? legacyIdsToClose : [],
        consumeLegacy,
    };
}

/** settings/global 의 learningThermometer.values 를 비웁니다. 다른 필드는 유지합니다. */
export function clearedLearningThermometerLegacy(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const values = raw.values && typeof raw.values === 'object' ? raw.values : null;
    if (!values || !Object.keys(values).length) return null;
    return { ...raw, values: {} };
}

/** 이 탭이 잠금을 다시 알아보도록 세션 동안 고정하는 소유 토큰입니다. */
export function createThermometerLockOwner(rand = Math.random, now = Date.now()) {
    const n = Math.floor(Number(rand()) * 1e9).toString(36);
    const t = Math.floor(Number(now) || 0).toString(36);
    return `tab_${n}_${t}`.slice(0, 80);
}

export function settlementLockAgeOk(startedAt, now, leaseMs) {
    const started = Number(startedAt);
    const t = Number(now);
    const lease = Number(leaseMs);
    if (!Number.isFinite(started) || !Number.isFinite(t) || !Number.isFinite(lease) || lease <= 0) return false;
    if (started > t + THERMOMETER_LOCK_CLOCK_SKEW_MS) return false;
    return t - started < lease;
}

/**
 * 지급 직전에 잠금 소유자와 임대(lease)가 아직 이 탭인지 확인합니다.
 * 다른 탭이 오래된 잠금을 인계받았거나, 임대가 끝났으면 false 입니다.
 */
export function settlementLockHeld({
    settlementKey,
    settlementStatus,
    settlementStartedAt,
    settlementLockOwner,
    owner,
    today,
    now,
    leaseMs,
} = {}) {
    if (!owner || !today) return false;
    if (String(settlementStatus || '') !== 'running') return false;
    if (String(settlementKey || '') !== String(today)) return false;
    if (String(settlementLockOwner || '') !== String(owner)) return false;
    return settlementLockAgeOk(settlementStartedAt, now, leaseMs);
}

/**
 * 잠금을 새로 잡을지, 내 임대를 이어 쓸지, 다른 탭에 양보할지 고릅니다.
 * running 인 같은 날 인계는 시도 번호를 유지해서, 이미 지급한 학생을 다시 주지 않습니다.
 */
export function decideThermometerLockClaim({
    settlementKey,
    settlementStatus,
    settlementStartedAt,
    settlementLockOwner,
    settlementAttempt,
    settledDate,
    owner,
    today,
    now,
    leaseMs,
    manual = false,
    pendingCount = 0,
} = {}) {
    const ownedByUs = settlementLockHeld({
        settlementKey,
        settlementStatus,
        settlementStartedAt,
        settlementLockOwner,
        owner,
        today,
        now,
        leaseMs,
    });
    const fresh = String(settlementKey || '') === String(today || '')
        && String(settlementStatus || '') === 'running'
        && settlementLockAgeOk(settlementStartedAt, now, leaseMs)
        && String(settlementLockOwner || '') !== '';
    if (!ownedByUs && fresh) return { action: 'locked' };
    if (String(settledDate || '') === String(today || '') && String(settlementStatus || '') !== 'running') {
        if (!manual || !(Number(pendingCount) > 0)) return { action: 'already_done' };
    }
    const continuing = String(settlementStatus || '') === 'running' && String(settlementKey || '') === String(today || '');
    const prev = Math.max(0, Math.floor(Number(settlementAttempt) || 0));
    const attempt = continuing ? Math.max(1, prev || 1) : Math.min(1000000, prev + 1);
    if (ownedByUs) return { action: 'reuse', attempt };
    return { action: 'claim', attempt };
}

/** 학생 문서에 남기는 이번 시도의 정산 키. 같은 날 다시 정산하면 시도 번호만 올라갑니다. */
export function thermometerSettlementMarker(today, attempt) {
    const day = String(today || '').slice(0, 10);
    const n = Math.max(1, Math.min(1000000, Math.floor(Number(attempt) || 1)));
    return `${day}#${n}`;
}

export function studentSettlementAlreadyApplied(student, marker) {
    if (!marker) return false;
    return String(student && student.lastThermometerSettlementKey || '') === String(marker);
}

/**
 * 지급할지 건너뛸지와, 같은 쓰기에 넣을 표식을 정합니다.
 * 이미 이번 키가 있으면 경험치를 다시 주지 않습니다.
 */
export function thermometerStudentGrantPlan({
    alreadyApplied,
    alreadyUsedStale = false,
    delta,
    blockedPositive = false,
    usedStaleValues = false,
    marker,
} = {}) {
    if (alreadyApplied) return { action: 'skip', reason: 'already_applied' };
    if (usedStaleValues === true && alreadyUsedStale === true) {
        return { action: 'skip', reason: 'stale_consumed' };
    }
    const amount = Math.round(Number(delta) || 0);
    if (!amount) return { action: 'skip', reason: 'zero' };
    if (amount > 0 && blockedPositive) return { action: 'skip', reason: 'credit_default' };
    return {
        action: 'grant',
        delta: amount,
        markers: {
            lastThermometerSettlementKey: String(marker || ''),
            thermometerUsedStaleValues: usedStaleValues === true || alreadyUsedStale === true,
        },
    };
}

/** 경험치는 읽은 값으로 덮지 않고, 차이만큼 increment 합니다. */
export function thermometerXpIncrement(beforeXp, afterXp) {
    const before = Math.max(0, Math.floor(Number(beforeXp) || 0));
    const after = Math.max(0, Math.floor(Number(afterXp) || 0));
    const amount = after - before;
    if (!amount) return null;
    return amount;
}

function appendThermometerXpLog(stu, entry) {
    const logs = Array.isArray(stu && stu.xpChangeLog) ? stu.xpChangeLog.slice(-(THERMOMETER_XP_LOG_LIMIT - 1)) : [];
    logs.push(entry);
    return logs;
}

/**
 * 학생 한 명의 경험치와 표식을 한 트랜잭션으로 커밋합니다.
 * 커밋 직전에 잠금 소유자와 임대가 이 탭인지 다시 읽고, 이미 적용된 키면 건너뜁니다.
 */
export async function grantThermometerStudentXp(db, {
    studentRef,
    thermometerRef,
    delta,
    today,
    owner,
    leaseMs,
    now,
    usedStaleValues = false,
} = {}) {
    return runTransaction(db, async (tx) => {
        const t = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const parentSnap = await tx.get(thermometerRef);
        const parent = parentSnap.exists() ? (parentSnap.data() || {}) : {};
        const held = settlementLockHeld({
            settlementKey: parent.settlementKey,
            settlementStatus: parent.settlementStatus,
            settlementStartedAt: parent.settlementStartedAt,
            settlementLockOwner: parent.settlementLockOwner,
            owner,
            today,
            now: t,
            leaseMs,
        });
        if (!held) return { status: 'lock_lost' };

        const stuSnap = await tx.get(studentRef);
        if (!stuSnap.exists()) return { status: 'skipped', reason: 'missing_student' };
        const stu = stuSnap.data() || {};
        const attempt = Math.max(1, Math.floor(Number(parent.settlementAttempt) || 1));
        const marker = thermometerSettlementMarker(parent.settlementKey || today, attempt);
        const blocked = isCreditDefaultOn(stu, today) || isLoanPenaltyActive(stu, today);
        const plan = thermometerStudentGrantPlan({
            alreadyApplied: studentSettlementAlreadyApplied(stu, marker),
            alreadyUsedStale: stu.thermometerUsedStaleValues === true,
            delta,
            blockedPositive: blocked,
            usedStaleValues,
            marker,
        });
        if (plan.action === 'skip') return { status: 'skipped', reason: plan.reason, marker };

        const beforeXp = Math.max(0, Math.floor(Number(stu.xp) || 0));
        let afterXp = beforeXp;
        let absorbed = 0;
        const shieldUpdates = {};
        if (plan.delta > 0) {
            afterXp = beforeXp + plan.delta;
        } else {
            const shielded = applyFullXpDeduct(stu, -plan.delta, applyShieldToXpDeduct);
            afterXp = Math.max(0, Math.floor(Number(shielded.xp) || 0));
            absorbed = Math.max(0, Math.floor(Number(shielded.absorbed) || 0));
            Object.assign(shieldUpdates, shielded.updates || {});
            delete shieldUpdates.xp;
        }
        const actualDelta = afterXp - beforeXp;
        const payload = { ...plan.markers, ...shieldUpdates };
        const xpAmount = thermometerXpIncrement(beforeXp, afterXp);
        if (xpAmount) payload.xp = increment(xpAmount);
        if (actualDelta !== 0 || absorbed) {
            payload.xpChangeLog = appendThermometerXpLog(stu, {
                at: t,
                reason: '학습 온도계 15시 정산',
                before: beforeXp,
                after: afterXp,
                delta: actualDelta,
                source: 'learningThermometer',
                rawDelta: plan.delta,
                settledDate: String(today || ''),
                absorbed,
                settlementKey: marker,
            });
        }
        tx.set(studentRef, payload, { merge: true });
        if (usedStaleValues === true && parent.usedStaleValues !== true) {
            tx.set(thermometerRef, { usedStaleValues: true }, { merge: true });
        }
        return { status: 'granted', actualDelta, marker };
    });
}

/**
 * 표 정리와 완료 기록도 잠금이 아직 내 것일 때만 합니다.
 * 깨어난 예전 탭이 인계된 정산의 표를 지우지 못하게 합니다.
 */
export async function finishThermometerSettlement(db, {
    thermometerRef,
    voteRefs = [],
    owner,
    today,
    leaseMs,
    now,
    parentPayload,
} = {}) {
    return runTransaction(db, async (tx) => {
        const t = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const snap = await tx.get(thermometerRef);
        if (!snap.exists()) return { status: 'lock_lost' };
        const parent = snap.data() || {};
        const held = settlementLockHeld({
            settlementKey: parent.settlementKey,
            settlementStatus: parent.settlementStatus,
            settlementStartedAt: parent.settlementStartedAt,
            settlementLockOwner: parent.settlementLockOwner,
            owner,
            today,
            now: t,
            leaseMs,
        });
        if (!held) return { status: 'lock_lost' };
        voteRefs.forEach((ref) => tx.set(ref, { value: 0 }));
        tx.set(thermometerRef, {
            ...parentPayload,
            usedStaleValues: parent.usedStaleValues === true || parentPayload.usedStaleValues === true,
            settlementAttempt: Math.max(0, Math.floor(Number(parent.settlementAttempt ?? parentPayload.settlementAttempt) || 0)),
        });
        return { status: 'done' };
    });
}

function settlementClock(now) {
    return Number.isFinite(Number(now)) ? () => Number(now) : () => Date.now();
}

async function clearStoredThermometerLegacy(globalSettingsRef) {
    const snap = await getDoc(globalSettingsRef);
    if (!snap.exists()) return false;
    const cleared = clearedLearningThermometerLegacy((snap.data() || {}).learningThermometer);
    if (!cleared) return false;
    await updateDoc(globalSettingsRef, { learningThermometer: cleared });
    return true;
}

/**
 * 하루 정산을 잠그고, 학생별 표식을 지키며 지급한 뒤 표를 닫습니다.
 * today 가 부모의 running 키보다 뒤면 쓰지 않고 prior_running 만 돌려줍니다.
 */
export async function runThermometerSettlementPass(db, {
    thermometerRef,
    globalSettingsRef,
    activeIds,
    voteRefFor,
    studentRefFor,
    today,
    owner,
    leaseMs,
    now,
    manual = false,
    minDefault = -20,
    maxDefault = 20,
} = {}) {
    const settlementDay = String(today || '');
    const readNow = settlementClock(now);
    const shape = { today: settlementDay, minDefault, maxDefault };
    const claimed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(thermometerRef);
        const parentData = snap.exists() ? (snap.data() || {}) : {};
        const priorKey = priorRunningThermometerSettlementKey({
            settlementStatus: parentData.settlementStatus,
            settlementKey: parentData.settlementKey,
            today: settlementDay,
        });
        if (priorKey) return { status: 'prior_running', priorKey };

        const ids = (activeIds || []).map((sid) => String(sid));
        const voteValues = {};
        for (const id of ids) {
            const voteSnap = await tx.get(voteRefFor(id));
            if (voteSnap.exists() && voteSnap.data() && Object.prototype.hasOwnProperty.call(voteSnap.data(), 'value')) {
                voteValues[id] = voteSnap.data().value;
            }
        }
        const legacyAllowed = allowLegacyThermometerValues({
            parentExists: snap.exists(),
            settlementStatus: parentData.settlementStatus,
            usedStaleValues: parentData.usedStaleValues === true,
            settlementKey: parentData.settlementKey,
            settledDate: parentData.settledDate,
            today: settlementDay,
        });
        const readLegacy = !snap.exists() || legacyAllowed || parentData.usedStaleValues === true;
        const legacySnap = readLegacy && globalSettingsRef ? await tx.get(globalSettingsRef) : null;
        const legacyThermometer = legacySnap && legacySnap.exists()
            ? (legacySnap.data() || {}).learningThermometer
            : null;
        const raw = snap.exists() ? parentData : (legacyThermometer || {});
        const state = sanitizeThermometerParentState(raw, shape);
        const plan = planThermometerSettlement({
            activeIds: ids,
            voteValues,
            parentExists: snap.exists(),
            parentData,
            legacyThermometer,
            today: settlementDay,
            min: state.min,
            max: state.max,
        });
        const pendingValues = plan.pendingValues;
        const startedAt = readNow();
        const decision = decideThermometerLockClaim({
            settlementKey: state.settlementKey,
            settlementStatus: state.settlementStatus,
            settlementStartedAt: state.settlementStartedAt,
            settlementLockOwner: state.settlementLockOwner,
            settlementAttempt: state.settlementAttempt,
            settledDate: state.settledDate,
            owner,
            today: settlementDay,
            now: startedAt,
            leaseMs,
            manual,
            pendingCount: Object.keys(pendingValues).length,
        });
        if (decision.action === 'already_done') return { status: 'already_done', state };
        if (decision.action === 'locked') return { status: 'locked', state };
        const nextState = {
            ...state,
            values: pendingValues,
            settlementAttempt: decision.attempt,
            settlementLockOwner: owner,
        };
        if (decision.action !== 'reuse') {
            tx.set(thermometerRef, buildThermometerParentPayload({
                ...nextState,
                date: settlementDay,
                settlementKey: settlementDay,
                settlementStatus: 'running',
                settlementStartedAt: startedAt,
            }, shape));
        }
        return {
            status: 'claimed',
            state: nextState,
            legacyIds: plan.legacyIds,
            legacyIdsToClose: plan.legacyIdsToClose,
            consumeLegacy: plan.consumeLegacy === true,
        };
    });

    if (!claimed || claimed.status !== 'claimed') return claimed || { status: 'not_claimed' };

    const values = claimed.state.values || {};
    const entries = Object.entries(values).filter(([, value]) => Number(value) !== 0);
    const legacyIdSet = new Set((claimed.legacyIds || []).map((id) => String(id)));
    let appliedCount = 0;
    let totalDelta = 0;
    let skippedApplied = 0;
    for (const [sid, deltaRaw] of entries) {
        const granted = await grantThermometerStudentXp(db, {
            studentRef: studentRefFor(sid),
            thermometerRef,
            delta: deltaRaw,
            today: settlementDay,
            owner,
            leaseMs,
            now: readNow(),
            usedStaleValues: legacyIdSet.has(String(sid)),
        });
        if (!granted || granted.status === 'lock_lost') {
            return { status: 'lock_lost', appliedCount, totalDelta, skippedApplied };
        }
        if (granted.status === 'granted') {
            appliedCount += 1;
            totalDelta += granted.actualDelta || 0;
        } else if (granted.reason === 'already_applied' || granted.reason === 'stale_consumed') {
            skippedApplied += 1;
        }
    }

    const finishedAt = readNow();
    const resetState = {
        ...claimed.state,
        values: {},
        date: settlementDay,
        settledDate: settlementDay,
        lastSettlementAt: finishedAt,
        settlementKey: settlementDay,
        settlementStatus: 'done',
        settlementStartedAt: 0,
        settlementLockOwner: '',
        settlementAppliedCount: appliedCount,
        settlementTotalDelta: totalDelta,
        usedStaleValues: claimed.state.usedStaleValues === true || claimed.consumeLegacy === true,
    };
    const voteIds = [...new Set([
        ...entries.map(([sid]) => String(sid)),
        ...((claimed.legacyIdsToClose || []).map((sid) => String(sid))),
    ])];
    const finished = await finishThermometerSettlement(db, {
        thermometerRef,
        voteRefs: voteIds.map((sid) => voteRefFor(sid)),
        owner,
        today: settlementDay,
        leaseMs,
        now: finishedAt,
        parentPayload: buildThermometerParentPayload(resetState, shape),
    });
    if (!finished || finished.status !== 'done') {
        return { status: 'lock_lost', appliedCount, totalDelta, skippedApplied };
    }

    let legacyClearError = null;
    if (resetState.usedStaleValues && globalSettingsRef) {
        try {
            await clearStoredThermometerLegacy(globalSettingsRef);
        } catch (err) {
            legacyClearError = err;
        }
    }
    return {
        status: 'done',
        appliedCount,
        totalDelta,
        skippedApplied,
        state: resetState,
        legacyClearError,
    };
}

function withPriorSettlement(todayResult, closed) {
    if (!closed || closed.status !== 'done') return todayResult;
    const priorApplied = closed.appliedCount || 0;
    const priorDelta = closed.totalDelta || 0;
    const priorSkipped = closed.skippedApplied || 0;
    return {
        ...todayResult,
        prior: {
            status: closed.status,
            appliedCount: priorApplied,
            totalDelta: priorDelta,
            skippedApplied: priorSkipped,
            settlementKey: closed.state ? closed.state.settlementKey : '',
        },
        appliedCount: (todayResult.appliedCount || 0) + priorApplied,
        totalDelta: (todayResult.totalDelta || 0) + priorDelta,
        skippedApplied: (todayResult.skippedApplied || 0) + priorSkipped,
        legacyClearError: todayResult.legacyClearError || closed.legacyClearError || null,
    };
}

/**
 * running 인 정산 키가 오늘이 아니면 그 키로 먼저 마무리합니다.
 * 이미 지급한 학생은 lastThermometerSettlementKey 로 건너뛰고, 남은 학생만 지급한 뒤 오늘 정산을 시작합니다.
 * 어제 잠금이 아직 다른 탭 것이면 오늘 정산으로 넘어가지 않습니다.
 */
export async function settleThermometerResolvingPrior(db, args = {}) {
    const opened = await runThermometerSettlementPass(db, args);
    if (!opened || opened.status !== 'prior_running') return opened;
    const closed = await runThermometerSettlementPass(db, { ...args, today: opened.priorKey });
    if (!closed || (closed.status !== 'done' && closed.status !== 'already_done')) return closed;
    const todayResult = await runThermometerSettlementPass(db, args);
    return withPriorSettlement(todayResult, closed);
}
