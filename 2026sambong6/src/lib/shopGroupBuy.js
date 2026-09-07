/**
 * 상점 공동구매 모금 정산.
 * 입금은 이미 학생 지갑에서 빠져 있으므로, 구매처리는 환불 없이 모금만 비웁니다.
 */

export function toNaturalContribution(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(1, Math.round(n));
}

export function sumGroupBuyContributions(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return Object.keys(src).reduce((sum, key) => {
        const sid = String(key).trim();
        if (!sid || sid === 'gm' || sid === 'gm_a') return sum;
        return sum + toNaturalContribution(src[key]);
    }, 0);
}

/**
 * 교사가 목표 금액 전에 구매처리할 수 있는지.
 * 모금액이 1 이상이면 가능합니다. 학생 지갑은 건드리지 않습니다.
 */
export function canSettleShopGroupBuy(total) {
    const t = Math.max(0, Math.round(Number(total) || 0));
    if (t <= 0) return { ok: false, reason: 'empty', total: 0 };
    return { ok: true, total: t };
}

/**
 * 구매처리 후 모금 문서에 남길 기록.
 * contributions는 호출 쪽에서 빈 맵으로 덮어씁니다.
 */
export function shopGroupBuySettleExtra(nowMs, total, extra = {}) {
    const t = Math.max(0, Math.round(Number(total) || 0));
    const at = Math.floor(Number(nowMs) || 0);
    return {
        lastSettleAt: at,
        lastSettleOriginalTotal: t,
        lastSettleNote: String(extra.note || '교사 구매처리(환불 없음)'),
        lastSettleBy: String(extra.actor || 'gm'),
        ...(extra.contributions && typeof extra.contributions === 'object'
            ? { lastSettleContributions: extra.contributions }
            : {}),
    };
}
