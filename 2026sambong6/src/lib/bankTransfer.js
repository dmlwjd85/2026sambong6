/**
 * 삼봉 은행 계좌이체.
 * 학생끼리 지갑에서 보내고, 마스터도 보낼 수 있습니다. 수수료는 교사가 정한 봉입니다.
 */

export const BANK_TRANSFER_FEE_MAX = 50;
export const BANK_TRANSFER_AMOUNT_MAX = 5000;
export const BANK_TRANSFER_FEE_DEFAULT = 0;

function clipInt(v, min, max, fallback) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

export function sanitizeBankTransferFee(raw) {
    return clipInt(raw, 0, BANK_TRANSFER_FEE_MAX, BANK_TRANSFER_FEE_DEFAULT);
}

export function sanitizeBankTransferAmount(raw) {
    return clipInt(raw, 1, BANK_TRANSFER_AMOUNT_MAX, 0);
}

/**
 * 이체 가능 여부.
 * fromId/toId는 학번 또는 gm/gm_a. 자기 자신에게는 보내지 못합니다.
 */
export function canBankTransfer({ fromId, toId, amount, fee, fromBong, isGuest } = {}) {
    if (isGuest) return { ok: false, reason: 'guest' };
    const from = String(fromId || '').trim();
    const to = String(toId || '').trim();
    if (!from || !to) return { ok: false, reason: 'login' };
    if (from === to) return { ok: false, reason: 'self' };
    if (to === 'guest' || from === 'guest') return { ok: false, reason: 'guest' };
    const amt = sanitizeBankTransferAmount(amount);
    if (amt < 1) return { ok: false, reason: 'amount' };
    const feeB = sanitizeBankTransferFee(fee);
    const need = amt + feeB;
    const wallet = Math.floor(Number(fromBong) || 0);
    if (wallet < need) return { ok: false, reason: 'funds', need, wallet };
    return { ok: true, from, to, amount: amt, fee: feeB, need };
}

export function applyBankTransfer({ fromBong, toBong, amount, fee } = {}) {
    const checked = canBankTransfer({
        fromId: 'a',
        toId: 'b',
        amount,
        fee,
        fromBong,
        isGuest: false,
    });
    if (!checked.ok) return { ok: false, reason: checked.reason, fromBong: Math.floor(Number(fromBong) || 0), toBong: Math.floor(Number(toBong) || 0) };
    return {
        ok: true,
        fromBong: Math.floor(Number(fromBong) || 0) - checked.need,
        toBong: Math.floor(Number(toBong) || 0) + checked.amount,
        amount: checked.amount,
        fee: checked.fee,
        need: checked.need,
    };
}

/**
 * 이체 지갑 문서에 쓸 필드.
 * 문서가 없으면 생성 규칙(xp·bong 필수)에 맞게 씨앗을 넣습니다.
 */
export function bankTransferWalletFields({
    exists,
    studentId,
    name,
    number,
    job,
    xp,
    nextBong,
    bongChangeLog,
} = {}) {
    const payload = {
        bong: Math.floor(Number(nextBong) || 0),
        bongChangeLog: Array.isArray(bongChangeLog) ? bongChangeLog : [],
    };
    if (!exists) {
        payload.studentId = String(studentId || '');
        payload.name = String(name || '');
        payload.number = number == null || number === '' ? String(studentId || '') : number;
        payload.job = String(job || '');
        payload.xp = Number.isFinite(Number(xp)) ? Number(xp) : 0;
    }
    return payload;
}

/**
 * 은행 저장 때 지갑 증감.
 * 이체·주기 보너스로 로컬 지갑만 어긋난 경우 서버 지갑을 유지하고,
 * 입출금·적금은 서버 지갑에서 그 금액만 반영합니다.
 */
export function resolveBankSaveBongDelta(validation, targetBong, serverBong) {
    if (validation && validation.keepServerBong) return 0;
    if (validation && Number.isFinite(Number(validation.bongDelta))) {
        return Math.floor(Number(validation.bongDelta));
    }
    return Math.floor(Number(targetBong) || 0) - Math.floor(Number(serverBong) || 0);
}
