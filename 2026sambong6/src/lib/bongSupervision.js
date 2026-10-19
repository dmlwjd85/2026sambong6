/** 금융감독에서 획득으로 세지 않는 은행 흐름입니다. */
export const BONG_SUPERVISION_EXCLUDED_SOURCES = new Set([
    'bankTermMaturity',
    'bankTermEarly',
    'bankLoanTake',
    'bankLoanDue',
    'bankLoanRepay',
    'bankRegular',
    'bankRegularWithdraw',
    'bankRegularDeposit',
]);

export function isBongSupervisionExcluded(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.source && BONG_SUPERVISION_EXCLUDED_SOURCES.has(String(row.source))) return true;
    const reason = String(row.reason || '');
    return /보물상자 적금 만기|적금 만기|보물상자 적금 중도 해지|대출|일반예금/.test(reason);
}

/**
 * 경고에 넣을 증가분.
 * 예금 출금, 대출 상환, 지수에서 돌려받은 원금은 획득이 아닙니다.
 * 지수 매도는 이익만 셉니다.
 */
export function supervisionCountableDelta(row) {
    if (!row || typeof row !== 'object') return 0;
    if (isBongSupervisionExcluded(row)) return 0;
    const delta = Number(row.delta) || 0;
    const reason = String(row.reason || '');
    const isSell = String(row.source || '') === 'stockSell' || /팔기/.test(reason);
    if (isSell) {
        if (row.profit != null && Number.isFinite(Number(row.profit))) {
            return Math.max(0, Number(row.profit) || 0);
        }
        if (row.principal != null) {
            return Math.max(0, delta - Math.max(0, Number(row.principal) || 0));
        }
    }
    return delta > 0 ? delta : 0;
}
