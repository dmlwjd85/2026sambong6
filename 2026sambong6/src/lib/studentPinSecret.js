/**
 * 학생 PIN을 공개 학생 문서가 아니라 학급 비밀 컬렉션에 해시로 둡니다.
 * 클라가 해시를 읽지 않고, pinProbes 쓰기가 규칙에서 해시와 맞는지만 확인합니다.
 */

export const PIN_HASH_PREFIX = 'sambong-pin-v1';
export const PIN_HASH_HEX_LEN = 64;
export const PIN_PROBE_COOLDOWN_MS = 1000;
export const XP_WRITE_COOLDOWN_MS = 2000;
export const PIN_SECRETS_COLLECTION = 'pinSecrets';
export const PIN_PROBES_COLLECTION = 'pinProbes';

export function normalizeStudentPin(raw) {
    const pin = String(raw == null ? '' : raw).trim();
    return /^\d{4}$/.test(pin) ? pin : '';
}

export function studentPinDocId(studentId) {
    const id = String(studentId == null ? '' : studentId).trim();
    if (id === 'student_gm') return 'gm';
    if (id === 'student_gm_a') return 'gm_a';
    return id.replace(/^student_/, '');
}

export function pinHashMaterial({ classId, studentId, pin } = {}) {
    return [
        PIN_HASH_PREFIX,
        String(classId || '').trim(),
        studentPinDocId(studentId),
        normalizeStudentPin(pin),
    ].join('\n');
}

async function sha256Hex(text) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle || typeof subtle.digest !== 'function') {
        throw new Error('sha256_unavailable');
    }
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashStudentPin({ classId, studentId, pin } = {}) {
    const normalized = normalizeStudentPin(pin);
    if (!normalized) return '';
    if (!String(classId || '').trim() || !studentPinDocId(studentId)) return '';
    try {
        return await sha256Hex(pinHashMaterial({ classId, studentId, pin: normalized }));
    } catch (_) {
        return '';
    }
}

export function isValidPinHash(hash) {
    return typeof hash === 'string' && new RegExp(`^[a-f0-9]{${PIN_HASH_HEX_LEN}}$`).test(hash);
}

export function pinSecretSegments(classId, studentId) {
    return ['artifacts', String(classId || '').trim(), PIN_SECRETS_COLLECTION, studentPinDocId(studentId)];
}

export function pinProbeSegments(classId, uid) {
    return ['artifacts', String(classId || '').trim(), PIN_PROBES_COLLECTION, String(uid || '').trim()];
}

export function pinSecretPayload(hash, extra = {}) {
    const row = {
        hash: String(hash || ''),
        updatedAt: extra.updatedAt == null ? 0 : extra.updatedAt,
    };
    if (extra.prevHash) row.prevHash = String(extra.prevHash);
    return row;
}

export function pinProbePayload({ studentId, hash, at = 0 } = {}) {
    return {
        studentId: studentPinDocId(studentId),
        hash: String(hash || ''),
        at,
        ok: true,
    };
}

export function stripPinFromStudentData(raw) {
    const next = raw && typeof raw === 'object' ? { ...raw } : {};
    delete next.pin;
    delete next.pinHash;
    delete next.password;
    return next;
}

/**
 * 로그인 판정. 비밀 문서는 학생이 읽을 수 없으므로
 * probe 성공 / 비밀 생성 성공 / 남은 평문 일치만 구분합니다.
 */
export function classifyPinLogin({
    ownerBypass = false,
    probeOk = false,
    secretCreated = false,
    leftoverPin = '',
    typedPin = '',
    isAutoLogin = false,
} = {}) {
    if (ownerBypass) return { ok: true, via: 'owner', canClaim: false, stripPublicPin: false };
    const typed = String(typedPin == null ? '' : typedPin);
    const leftover = String(leftoverPin == null ? '' : leftoverPin);
    if (probeOk) return { ok: true, via: 'probe', canClaim: true, stripPublicPin: true };
    if (secretCreated) {
        return {
            ok: true,
            via: leftover && leftover === typed ? 'legacy-migrate' : 'first-set',
            canClaim: true,
            stripPublicPin: true,
        };
    }
    if (leftover && leftover === typed) {
        return { ok: true, via: 'legacy-plaintext', canClaim: false, stripPublicPin: false };
    }
    if (!leftover && !isAutoLogin) return { ok: false, reason: 'needs-first-set' };
    return { ok: false, reason: isAutoLogin ? 'auto' : 'mismatch' };
}

export function isFirestorePermissionDenied(err) {
    const code = String(err && err.code || '').toLowerCase();
    return code === 'permission-denied' || code.includes('permission-denied');
}

export function canWriteXpWithCooldown({
    prevXp,
    nextXp,
    isTeacherOfClass = false,
    prevWriteAtMs = 0,
    nowMs = Date.now(),
    maxIncrease = 650,
    cooldownMs = XP_WRITE_COOLDOWN_MS,
} = {}) {
    const before = Number(prevXp);
    const after = Number(nextXp);
    if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
    if (after <= before) return true;
    if (after > before + maxIncrease) return false;
    if (isTeacherOfClass) return true;
    if (!prevWriteAtMs) return true;
    return nowMs > Number(prevWriteAtMs) + cooldownMs;
}
