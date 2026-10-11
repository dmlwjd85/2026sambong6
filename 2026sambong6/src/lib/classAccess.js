/**
 * 학급 입장 권한(classAccess) 문서 정리.
 * 학생은 초대 코드로 자기 학급만, 교사는 소유 학급만 엽니다.
 */

export const CLASS_ACCESS_ROLES = Object.freeze(['student', 'teacher', 'guest']);
export const CLASS_ACCESS_INVITE_MAX = 12;
export const CLASS_ACCESS_CLASS_ID_MAX = 80;

export function normalizeInviteCode(raw) {
    return String(raw == null ? '' : raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CLASS_ACCESS_INVITE_MAX);
}

export function isLikelyInviteCode(raw) {
    const code = normalizeInviteCode(raw);
    return code.length >= 4 && code.length <= 10;
}

export function safeClassId(raw) {
    const id = String(raw == null ? '' : raw).trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) return '';
    return id;
}

export function sanitizeClassAccess(raw, uid) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const role = CLASS_ACCESS_ROLES.includes(src.role) ? src.role : 'student';
    return {
        uid: String(uid || src.uid || '').trim().slice(0, 128),
        classId: safeClassId(src.classId),
        inviteCode: normalizeInviteCode(src.inviteCode),
        role,
        updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : 0,
    };
}

export function buildClassAccessPayload({ uid, classId, inviteCode, role = 'student', nowMs = Date.now() }) {
    const row = sanitizeClassAccess({ uid, classId, inviteCode, role, updatedAt: nowMs }, uid);
    if (!row.uid) return { ok: false, reason: 'uid' };
    if (!row.classId) return { ok: false, reason: 'classId' };
    if (!row.inviteCode) return { ok: false, reason: 'inviteCode' };
    return { ok: true, access: row };
}

/** 이 기기에 기억된 최근 학급에서 초대 코드를 찾습니다. */
export function inviteCodeFromRecentClasses(recentEntries, classId) {
    const id = safeClassId(classId);
    if (!id || !Array.isArray(recentEntries)) return '';
    const hit = recentEntries.find((row) => row && safeClassId(row.classId) === id);
    return hit ? normalizeInviteCode(hit.inviteCode) : '';
}

export function classAccessStorageKey() {
    return 'sambong_class_access_invite';
}

export function readStoredClassInvite(storage) {
    try {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        return store ? normalizeInviteCode(store.getItem(classAccessStorageKey())) : '';
    } catch (_) {
        return '';
    }
}

export function writeStoredClassInvite(inviteCode, storage) {
    try {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store) return;
        const next = normalizeInviteCode(inviteCode);
        if (next) store.setItem(classAccessStorageKey(), next);
        else store.removeItem(classAccessStorageKey());
    } catch (_) { /* ignore */ }
}

/**
 * 부팅 시 학급을 열 초대 코드 후보.
 * URL → 기억된 코드 → 최근 학급 순입니다. 시드 학급을 기본값으로 넣지 않습니다.
 */
export function resolveBootInvite({ urlInvite, storedInvite, recentEntries, classId } = {}) {
    const fromUrl = normalizeInviteCode(urlInvite);
    if (fromUrl) return fromUrl;
    const stored = normalizeInviteCode(storedInvite);
    if (stored) return stored;
    return inviteCodeFromRecentClasses(recentEntries, classId);
}

export function canClaimClassOwnership(classMeta, teacherUid) {
    const uid = String(teacherUid || '').trim();
    if (!uid) return false;
    const owner = String(classMeta && classMeta.ownerUid || '').trim();
    if (!owner) return true;
    return owner === uid;
}

export function classOwnerClaimPatch(teacherSession, nowMs = Date.now()) {
    if (!teacherSession || !teacherSession.uid) return null;
    return {
        ownerUid: String(teacherSession.uid),
        ownerEmail: String(teacherSession.email || '').trim().slice(0, 120),
        claimedAt: nowMs,
    };
}
