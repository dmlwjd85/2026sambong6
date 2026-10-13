/**
 * 교사 계정(이메일·구글)과 소유 학급 목록을 정리합니다.
 * 익명 로그인은 학생용이며, 학급 개설·소유는 교사 계정만 가능합니다.
 */

export const TEACHER_OWNED_CLASS_LIMIT = 40;
export const TEACHER_EMAIL_MAX = 120;
export const TEACHER_NAME_MAX = 40;

function clipText(raw, max) {
    const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, max).join('');
}

/** Firebase Auth 사용자가 교사 계정인지 (익명 아님 + 이메일 있음) */
export function isTeacherAuthUser(user) {
    if (!user || typeof user !== 'object') return false;
    if (user.isAnonymous) return false;
    const email = String(user.email || '').trim();
    return !!user.uid && email.includes('@');
}

export function teacherSessionFromUser(user) {
    if (!isTeacherAuthUser(user)) return null;
    return {
        uid: String(user.uid),
        email: String(user.email || '').trim().slice(0, TEACHER_EMAIL_MAX),
        displayName: clipText(user.displayName || '', TEACHER_NAME_MAX),
        emailVerified: !!user.emailVerified,
        isAnonymous: false,
    };
}

export function isTeacherSessionActive(session) {
    return !!(session && session.uid && String(session.email || '').includes('@') && session.isAnonymous === false);
}

export function sanitizeOwnedClassIds(raw) {
    const seen = new Set();
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const item of list) {
        const id = String(item || '').trim();
        if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        if (out.length >= TEACHER_OWNED_CLASS_LIMIT) break;
    }
    return out;
}

export function sanitizeTeacherProfile(raw, uid) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const id = String(uid || src.uid || '').trim().slice(0, 128);
    return {
        uid: id,
        email: clipText(src.email, TEACHER_EMAIL_MAX),
        displayName: clipText(src.displayName, TEACHER_NAME_MAX) || '선생님',
        ownedClassIds: sanitizeOwnedClassIds(src.ownedClassIds),
        createdAt: Number.isFinite(Number(src.createdAt)) ? Number(src.createdAt) : 0,
        updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : 0,
    };
}

export function buildTeacherProfile(user, extra = {}) {
    const session = teacherSessionFromUser(user);
    if (!session) return { ok: false, reason: 'not_teacher' };
    const now = Number.isFinite(Number(extra.nowMs)) ? Number(extra.nowMs) : Date.now();
    return {
        ok: true,
        profile: sanitizeTeacherProfile({
            uid: session.uid,
            email: session.email,
            displayName: extra.displayName || session.displayName || '선생님',
            ownedClassIds: extra.ownedClassIds || [],
            createdAt: extra.createdAt || now,
            updatedAt: now,
        }, session.uid),
    };
}

export function withOwnedClass(profile, classId) {
    const cur = sanitizeTeacherProfile(profile, profile && profile.uid);
    const id = String(classId || '').trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) return cur;
    if (cur.ownedClassIds.includes(id)) return cur;
    if (cur.ownedClassIds.length >= TEACHER_OWNED_CLASS_LIMIT) return cur;
    return { ...cur, ownedClassIds: [...cur.ownedClassIds, id] };
}

export function teacherOwnsClass(profileOrSession, classId, classMeta) {
    const id = String(classId || '').trim();
    if (!id) return false;
    if (classMeta && String(classMeta.ownerUid || '') === String(profileOrSession && profileOrSession.uid || '')) {
        return true;
    }
    const owned = sanitizeOwnedClassIds(profileOrSession && profileOrSession.ownedClassIds);
    return owned.includes(id);
}

/** 비밀번호는 6자 이상. Firebase Email/Password 기본과 같습니다. */
export function validateTeacherPassword(raw) {
    const pw = String(raw == null ? '' : raw);
    if (pw.length < 6) return { ok: false, reason: 'short' };
    if (pw.length > 80) return { ok: false, reason: 'long' };
    return { ok: true };
}

export function validateTeacherEmail(raw) {
    const email = String(raw == null ? '' : raw).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'format' };
    if (email.length > TEACHER_EMAIL_MAX) return { ok: false, reason: 'long' };
    return { ok: true, email };
}

export function teacherAuthErrorMessage(code) {
    const key = String(code || '');
    if (key === 'auth/email-already-in-use') return '이미 가입된 이메일입니다. 로그인하세요.';
    if (key === 'auth/invalid-email') return '이메일 형식을 확인해 주세요.';
    if (key === 'auth/weak-password') return '비밀번호는 6자 이상으로 만들어 주세요.';
    if (key === 'auth/user-not-found' || key === 'auth/wrong-password' || key === 'auth/invalid-credential') {
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    if (key === 'auth/popup-closed-by-user') return '구글 로그인 창이 닫혔습니다.';
    if (key === 'auth/unauthorized-domain') return '이 주소는 아직 구글 로그인 허용 목록에 없습니다.';
    if (key === 'auth/operation-not-allowed') return '이메일 가입이 아직 켜져 있지 않습니다. 선생님께 알려 주세요.';
    if (key === 'auth/network-request-failed') return '네트워크를 확인한 뒤 다시 시도해 주세요.';
    if (key === 'auth/too-many-requests') return '잠시 후 다시 시도해 주세요.';
    return '로그인에 실패했습니다. 다시 시도해 주세요.';
}
