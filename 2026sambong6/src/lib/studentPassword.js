/**
 * 홈 캐릭터 화면의 학생 비밀번호(PIN) 변경.
 * 변경 성공 시 지갑에서 고정 수수료를 뗍니다.
 */

/** 비밀번호 변경 수수료(봉) */
export const PASSWORD_CHANGE_BONG = 10;

/** 로그인과 같이 숫자 4자리만 새 비밀번호로 받습니다. */
export function normalizeLoginPin(raw) {
    const pin = String(raw == null ? '' : raw).trim();
    return /^\d{4}$/.test(pin) ? pin : '';
}

/**
 * 학생이 자기 비밀번호를 바꿀 수 있는지와, 저장할 pin·다음 잔액을 계산합니다.
 */
export function planPasswordChange({
    isGuest,
    isAdmin,
    currentPin,
    inputCurrent,
    newPin,
    confirmPin,
    bong,
    cost = PASSWORD_CHANGE_BONG,
} = {}) {
    if (isGuest) return { ok: false, reason: 'guest' };
    if (isAdmin) return { ok: false, reason: 'admin' };

    const stored = String(currentPin == null ? '' : currentPin);
    const typedCurrent = String(inputCurrent == null ? '' : inputCurrent).trim();
    if (!stored || typedCurrent !== stored) return { ok: false, reason: 'current' };

    const nextPin = normalizeLoginPin(newPin);
    if (!nextPin) return { ok: false, reason: 'format' };
    if (nextPin !== String(confirmPin == null ? '' : confirmPin).trim()) {
        return { ok: false, reason: 'mismatch' };
    }
    if (nextPin === stored) return { ok: false, reason: 'same' };

    const fee = Math.max(0, Math.floor(Number(cost) || 0));
    const wallet = Math.floor(Number(bong) || 0);
    if (wallet < fee) return { ok: false, reason: 'funds', need: fee, wallet };

    return { ok: true, pin: nextPin, nextBong: wallet - fee, cost: fee };
}

/**
 * 서버에 저장된 PIN·잔액만 바꿉니다. 낡은 탭의 지갑으로 봉이 늘어나거나
 * 이미 바뀐 비밀번호를 다시 덮어쓰지 못하게 합니다.
 */
export function applyPasswordChangeFromServer({
    serverPin,
    serverBong,
    currentPin,
    nextPin,
    cost = PASSWORD_CHANGE_BONG,
} = {}) {
    const stored = String(serverPin == null ? '' : serverPin);
    const typed = String(currentPin == null ? '' : currentPin);
    if (!stored || typed !== stored) return { ok: false, reason: 'current' };

    const pin = normalizeLoginPin(nextPin);
    if (!pin) return { ok: false, reason: 'format' };
    if (pin === stored) return { ok: false, reason: 'same' };

    const fee = Math.max(0, Math.floor(Number(cost) || 0));
    const wallet = Math.floor(Number(serverBong) || 0);
    if (wallet < fee) return { ok: false, reason: 'funds', need: fee, wallet };

    return { ok: true, pin, bong: wallet - fee, cost: fee };
}
