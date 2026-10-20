/**
 * 다른 학급 개설은 원래 마스터(시드 학급 GM) 허락 뒤에만 반이 만들어집니다.
 * 시드 마스터가 설정에서 직접 만들 때는 바로 생성합니다.
 */

export const SEED_MASTER_CLASS_ID = 'sambong-class-2026';
/** 시드 학급 artifacts 아래. 기존 규칙으로 익명 인증 쓰기가 됩니다. */
export const CLASS_CREATE_REQUEST_COLLECTION = 'classCreateRequests';

export function classCreateRequestPath(requestId) {
    const base = ['artifacts', SEED_MASTER_CLASS_ID, 'public', 'data', CLASS_CREATE_REQUEST_COLLECTION];
    const id = String(requestId || '').trim();
    return id ? [...base, id] : base;
}
export const CLASS_CREATE_REQUEST_STORAGE_KEY = 'sambong_class_create_request_id';
export const CLASS_CREATE_REQUEST_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
/** 로그인 화면에서 개설 폼을 열려면 필요한 코드. 시드 학급 문서에 저장합니다. */
export const CLASS_CREATE_UNLOCK_FIELD = 'classCreateUnlockCode';
export const CLASS_CREATE_UNLOCK_STORAGE_KEY = 'sambong_class_create_unlocked';
export const CLASS_CREATE_NOTIFY_STORAGE_KEY = 'sambong_class_create_notified_sig';
const UNLOCK_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function clipText(raw, max) {
    const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, max).join('');
}

function clampInt(v, min, max, fallback) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

/** 원래 마스터(시드 학급 담임)인지 */
export function isSeedMasterViewer(viewer, classId) {
    return !!(viewer && viewer.isGM && String(classId || '') === SEED_MASTER_CLASS_ID);
}

/** 시드 마스터만 승인 없이 바로 학급을 만들 수 있습니다. */
export function canCreateClassImmediately(viewer, classId) {
    return isSeedMasterViewer(viewer, classId);
}

export function sanitizeClassCreateRequest(raw, nowMs = Date.now()) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const status = CLASS_CREATE_REQUEST_STATUSES.includes(src.status) ? src.status : 'pending';
    const pin = String(src.teacherPin || '').trim();
    const yearFallback = Number.isFinite(Number(nowMs)) ? new Date(nowMs).getFullYear() : new Date().getFullYear();
    return {
        id: String(src.id || '').trim().slice(0, 80),
        displayName: clipText(src.displayName, 40),
        schoolName: clipText(src.schoolName, 40),
        schoolYear: clampInt(src.schoolYear, 2020, 2100, yearFallback),
        grade: clampInt(src.grade, 1, 6, 6),
        homeroom: clampInt(src.homeroom, 1, 20, 1),
        teacherName: clipText(src.teacherName, 20) || '담임 선생님',
        studentCount: clampInt(src.studentCount, 1, 40, 24),
        teacherPin: /^\d{4}$/.test(pin) ? pin : '',
        seasonLabel: clipText(src.seasonLabel, 30) || '시즌 1',
        seasonTheme: clipText(src.seasonTheme, 60) || '우리 반 모험',
        applyDefaultTemplate: src.applyDefaultTemplate !== false,
        copyFromClassId: clipText(src.copyFromClassId, 80),
        requesterHint: clipText(src.requesterHint, 20),
        sourceClassId: clipText(src.sourceClassId, 80),
        status,
        requestedAt: Number.isFinite(Number(src.requestedAt)) ? Number(src.requestedAt) : nowMs,
        reviewedAt: Number.isFinite(Number(src.reviewedAt)) ? Number(src.reviewedAt) : 0,
        reviewedByClassId: clipText(src.reviewedByClassId, 80),
        rejectReason: clipText(src.rejectReason, 120),
        newClassId: clipText(src.newClassId, 80),
        inviteCode: clipText(src.inviteCode, 20).toUpperCase(),
    };
}

export function validateClassCreateRequestDraft(raw) {
    const request = sanitizeClassCreateRequest(raw);
    if (!request.displayName) return { ok: false, reason: 'displayName' };
    if (request.requesterHint === 'login' && !request.teacherPin) {
        return { ok: false, reason: 'teacherPin' };
    }
    return { ok: true, request };
}

export function newClassCreateRequestId(nowMs = Date.now()) {
    return `ccr_${Number(nowMs).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildClassCreateRequest(raw, nowMs = Date.now()) {
    const checked = validateClassCreateRequestDraft(raw);
    if (!checked.ok) return checked;
    const id = String(raw && raw.id ? raw.id : '').trim() || newClassCreateRequestId(nowMs);
    return {
        ok: true,
        request: {
            ...checked.request,
            id,
            status: 'pending',
            requestedAt: nowMs,
            reviewedAt: 0,
            reviewedByClassId: '',
            rejectReason: '',
            newClassId: '',
            inviteCode: '',
        },
    };
}

export function applyClassCreateApproval(request, created, reviewerClassId, nowMs = Date.now()) {
    const cur = sanitizeClassCreateRequest(request, nowMs);
    if (cur.status !== 'pending') return { skip: true, request: cur };
    const made = created && typeof created === 'object' ? created : {};
    return {
        skip: false,
        request: {
            ...cur,
            status: 'approved',
            reviewedAt: nowMs,
            reviewedByClassId: clipText(reviewerClassId, 80),
            newClassId: clipText(made.newClassId || made.classId, 80),
            inviteCode: clipText(made.inviteCode, 20).toUpperCase(),
        },
    };
}

export function applyClassCreateRejection(request, reason, reviewerClassId, nowMs = Date.now()) {
    const cur = sanitizeClassCreateRequest(request, nowMs);
    if (cur.status !== 'pending') return { skip: true, request: cur };
    return {
        skip: false,
        request: {
            ...cur,
            status: 'rejected',
            reviewedAt: nowMs,
            reviewedByClassId: clipText(reviewerClassId, 80),
            rejectReason: clipText(reason, 120),
        },
    };
}

export function pendingClassCreateRequests(rows) {
    return (Array.isArray(rows) ? rows : [])
        .filter((r) => r && r.status === 'pending')
        .sort((a, b) => (Number(a.requestedAt) || 0) - (Number(b.requestedAt) || 0));
}

export function classCreateRequestStatusLabel(status) {
    if (status === 'approved') return '허락됨';
    if (status === 'rejected') return '거절됨';
    return '승인 대기';
}

/** 승인 후 createClassWorkspace에 넘길 값 */
export function classCreateWorkspacePayload(request) {
    const r = sanitizeClassCreateRequest(request);
    return {
        displayName: r.displayName,
        schoolName: r.schoolName,
        schoolYear: r.schoolYear,
        grade: r.grade,
        homeroom: r.homeroom,
        teacherName: r.teacherName,
        studentCount: r.studentCount,
        teacherPin: r.teacherPin,
        seasonLabel: r.seasonLabel,
        seasonTheme: r.seasonTheme,
        applyDefaultTemplate: r.applyDefaultTemplate,
        copySettingsFromCurrent: false,
        copyFromClassId: r.copyFromClassId,
    };
}

export function readStoredClassCreateRequestId(storage) {
    try {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        return store ? String(store.getItem(CLASS_CREATE_REQUEST_STORAGE_KEY) || '').trim() : '';
    } catch (_) {
        return '';
    }
}

export function writeStoredClassCreateRequestId(id, storage) {
    try {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store) return;
        const next = String(id || '').trim();
        if (next) store.setItem(CLASS_CREATE_REQUEST_STORAGE_KEY, next);
        else store.removeItem(CLASS_CREATE_REQUEST_STORAGE_KEY);
    } catch (_) { /* ignore */ }
}

/** 개설 코드는 대문자·숫자 6자리. 0/O, 1/I는 쓰지 않습니다. */
export function normalizeClassCreateUnlockCode(raw) {
    return String(raw == null ? '' : raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function isValidClassCreateUnlockCode(raw) {
    return /^[A-HJ-NP-Z2-9]{6}$/.test(normalizeClassCreateUnlockCode(raw));
}

export function generateClassCreateUnlockCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += UNLOCK_CODE_CHARS.charAt(Math.floor(Math.random() * UNLOCK_CODE_CHARS.length));
    }
    return code;
}

export function matchesClassCreateUnlockCode(input, stored) {
    const a = normalizeClassCreateUnlockCode(input);
    const b = normalizeClassCreateUnlockCode(stored);
    return isValidClassCreateUnlockCode(a) && a === b;
}

export function readClassCreateUnlockFromClassData(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return normalizeClassCreateUnlockCode(src[CLASS_CREATE_UNLOCK_FIELD]);
}

export function readClassCreateUnlockSession(storage) {
    try {
        const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        return !!(store && store.getItem(CLASS_CREATE_UNLOCK_STORAGE_KEY) === '1');
    } catch (_) {
        return false;
    }
}

export function writeClassCreateUnlockSession(unlocked, storage) {
    try {
        const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        if (!store) return;
        if (unlocked) store.setItem(CLASS_CREATE_UNLOCK_STORAGE_KEY, '1');
        else store.removeItem(CLASS_CREATE_UNLOCK_STORAGE_KEY);
    } catch (_) { /* ignore */ }
}

/** 같은 대기 요청이면 접속할 때마다 알림을 반복하지 않습니다. */
export function classCreatePendingSignature(rows) {
    return pendingClassCreateRequests(rows).map((r) => String(r.id || '')).filter(Boolean).sort().join('|');
}

export function readClassCreateNotifySignature(storage) {
    try {
        const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        return store ? String(store.getItem(CLASS_CREATE_NOTIFY_STORAGE_KEY) || '') : '';
    } catch (_) {
        return '';
    }
}

export function writeClassCreateNotifySignature(sig, storage) {
    try {
        const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        if (!store) return;
        const next = String(sig || '');
        if (next) store.setItem(CLASS_CREATE_NOTIFY_STORAGE_KEY, next);
        else store.removeItem(CLASS_CREATE_NOTIFY_STORAGE_KEY);
    } catch (_) { /* ignore */ }
}
