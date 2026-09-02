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
