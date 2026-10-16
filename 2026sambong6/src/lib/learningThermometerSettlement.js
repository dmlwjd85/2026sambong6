/**
 * 학습 온도계 정산이 어느 맵의 값을 쓸지 고릅니다.
 * 표(votes)가 하나라도 있으면 표만 봅니다. 없는 학생은 0이고, 0으로 지운 표를 옛 값으로 되돌리지 않습니다.
 * 표도 없고 부모 문서의 values도 없을 때만, allowLegacy 일 때 예전 settings/global 값을 봅니다.
 */
import { increment, runTransaction } from 'firebase/firestore';
import { isCreditDefaultOn, isLoanPenaltyActive } from './bankLoan.js';
import { applyFullXpDeduct } from './gear.js';
import { applyShieldToXpDeduct } from './season2.js';

export const THERMOMETER_XP_LOG_LIMIT = 40;
export const THERMOMETER_LOCK_CLOCK_SKEW_MS = 15000;

export function thermometerValueSource({ voteValues, parentValues, legacyValues, allowLegacy } = {}) {
    const votes = voteValues && typeof voteValues === 'object' ? voteValues : {};
    if (Object.keys(votes).length > 0) return { kind: 'votes', values: votes };
    const parent = parentValues && typeof parentValues === 'object' ? parentValues : null;
    if (parent && Object.keys(parent).length > 0) return { kind: 'parent', values: parent };
    const legacy = legacyValues && typeof legacyValues === 'object' ? legacyValues : null;
    if (allowLegacy && legacy && Object.keys(legacy).length > 0) return { kind: 'legacy', values: legacy };
    return { kind: 'empty', values: {} };
}

/**
 * 부모 문서가 생긴 뒤에도 옛 값을 볼 수 있는 경우.
 * - 부모 문서가 아직 없음
 * - 잠금만 커밋되고(running) 표는 아직 없음
 * 이미 done 인 기록은 다시 열지 않습니다.
 * 예전 값으로 한 번이라도 지급했다면(usedStaleValues) 그날의 running 재시도만 남기고,
 * 다음 날 running 에서는 되살리지 않습니다. 같은 날 재시도의 중복 지급은 학생별 표식이 막습니다.
 */
export function allowLegacyThermometerValues({
    parentExists,
    settlementStatus,
    usedStaleValues,
    settlementKey,
    today,
} = {}) {
    if (!parentExists) return true;
    if (settlementStatus !== 'running') return false;
    if (usedStaleValues === true) {
        if (!today || String(settlementKey || '') !== String(today)) return false;
    }
    return true;
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
    delta,
    blockedPositive = false,
    usedStaleValues = false,
    marker,
} = {}) {
    if (alreadyApplied) return { action: 'skip', reason: 'already_applied' };
    const amount = Math.round(Number(delta) || 0);
    if (!amount) return { action: 'skip', reason: 'zero' };
    if (amount > 0 && blockedPositive) return { action: 'skip', reason: 'credit_default' };
    return {
        action: 'grant',
        delta: amount,
        markers: {
            lastThermometerSettlementKey: String(marker || ''),
            thermometerUsedStaleValues: usedStaleValues === true,
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
