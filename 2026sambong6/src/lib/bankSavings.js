/**
 * 보물상자 적금(가입·만기·이자·중도해지)과 일반예금 수동 조작 검증.
 * 저장 트랜잭션 안에서 서버 문서 기준으로 계산해 잔액 음수와 중복 지급을 막습니다.
 */

export const TERM_DEPOSIT_DAYS = 30;

function bong(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.floor(n);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD 두 날짜 사이 달력 일수(같은 날=0). 형식이 틀리면 0 */
export function ymdDaysBetween(earlier, later) {
    if (!YMD_RE.test(String(earlier || '')) || !YMD_RE.test(String(later || ''))) return 0;
    const a = Date.UTC(...String(earlier).split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
    const b = Date.UTC(...String(later).split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.floor((b - a) / 86400000));
}

export function sanitizeTermDepositEntry(td) {
    if (!td || typeof td !== 'object') return null;
    const amount = bong(td.amount);
    const startDate = String(td.startDate || '');
    const id = String(td.id || '');
    if (!id || !YMD_RE.test(startDate) || amount <= 0) return null;
    return { id, amount, startDate };
}

/** 잘못된 항목과 같은 id 중복을 뺍니다. 같은 적금이 두 번 만기 지급되지 않게 합니다. */
export function sanitizeTermDeposits(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    arr.forEach((td) => {
        const clean = sanitizeTermDepositEntry(td);
        if (!clean || seen.has(clean.id)) return;
        seen.add(clean.id);
        out.push(clean);
    });
    return out;
}

export function sumTermDeposits(terms) {
    return bong(sanitizeTermDeposits(terms).reduce((s, t) => s + t.amount, 0));
}

export function termDepositMapsEqual(a, b) {
    const sa = sanitizeTermDeposits(a);
    const sb = sanitizeTermDeposits(b);
    if (sa.length !== sb.length) return false;
    const mapB = new Map(sb.map((t) => [t.id, t.amount]));
    return sa.every((t) => mapB.get(t.id) === t.amount);
}

export function findNewTermDeposits(before, after) {
    const beforeIds = new Set(sanitizeTermDeposits(before).map((t) => t.id));
    return sanitizeTermDeposits(after).filter((t) => !beforeIds.has(t.id));
}

export function findRemovedTermDeposits(before, after) {
    const afterIds = new Set(sanitizeTermDeposits(after).map((t) => t.id));
    return sanitizeTermDeposits(before).filter((t) => !afterIds.has(t.id));
}

/** 만기 이자: 원금 × 이율(%) 반올림. 이율이 이상하면 0 */
export function termDepositInterest(principal, ratePercent) {
    const p = bong(principal);
    const r = Number(ratePercent);
    if (p <= 0 || !Number.isFinite(r) || r <= 0) return 0;
    return Math.max(0, Math.round(p * (Math.min(100, r) / 100)));
}

export function termDepositDaysLeft(startDate, todayYmd) {
    return Math.max(0, TERM_DEPOSIT_DAYS - ymdDaysBetween(startDate, todayYmd));
}

/**
 * 만기(가입일부터 30일 이상)된 적금을 원금+이자로 정산합니다.
 * @returns {{ left: object[], credit: number, matured: {id,principal,interest,total}[] }}
 */
export function computeTermDepositMaturity(terms, ratePercent, todayYmd) {
    const left = [];
    const matured = [];
    let credit = 0;
    sanitizeTermDeposits(terms).forEach((td) => {
        if (ymdDaysBetween(td.startDate, todayYmd) >= TERM_DEPOSIT_DAYS) {
            const interest = termDepositInterest(td.amount, ratePercent);
            const total = bong(td.amount + interest);
            credit = bong(credit + total);
            matured.push({ id: td.id, principal: td.amount, interest, total });
        } else {
            left.push(td);
        }
    });
    return { left, credit, matured };
}

/**
 * 수동 은행 조작(입출금·적금 가입/해지) 1건만 허용 — 지갑+예금+적금 원금 합계 보존.
 * base는 서버(만기·자동이체 반영 뒤) 상태, target은 클라이언트가 저장하려는 상태입니다.
 */
export function validateManualBankTransition(base, target) {
    const bReg = bong(base.bankRegularSavings);
    const tReg = bong(target.bankRegularSavings);
    const bBong = bong(base.bong);
    const tBong = bong(target.bong);
    const bTerms = sanitizeTermDeposits(base.bankTermDeposits);
    const tTerms = sanitizeTermDeposits(target.bankTermDeposits);
    const regD = bong(tReg - bReg);
    const bongD = bong(tBong - bBong);
    const bTermSum = sumTermDeposits(bTerms);
    const tTermSum = sumTermDeposits(tTerms);
    const termSumD = bong(tTermSum - bTermSum);
    const totalB = bong(bBong + bReg + bTermSum);
    const totalC = bong(tBong + tReg + tTermSum);
    const conserved = totalC === totalB;
    const exactWalletOp = bongD === -regD && conserved;

    // 예금·적금이 같으면 지갑 차이는 이체·주기 보너스로 보고 서버 지갑을 유지합니다.
    if (regD === 0 && termDepositMapsEqual(bTerms, tTerms)) {
        return { ok: true, kind: bongD === 0 ? 'none' : 'wallet_only', keepServerBong: true };
    }
    if (termDepositMapsEqual(bTerms, tTerms) && regD !== 0) {
        if (regD > 0 && bBong + 0.0001 < regD) return { ok: false, kind: 'invalid', reason: 'wallet' };
        if (regD < 0 && bReg + 0.0001 < -regD) return { ok: false, kind: 'invalid', reason: 'regular' };
        return {
            ok: true,
            kind: regD > 0 ? 'deposit' : 'withdraw',
            bongDelta: -regD,
            exact: exactWalletOp,
            conserved,
        };
    }
    if (regD === 0 && tTerms.length === bTerms.length + 1) {
        const added = findNewTermDeposits(bTerms, tTerms);
        if (added.length === 1 && termSumD === added[0].amount) {
            if (bBong + 0.0001 < added[0].amount) return { ok: false, kind: 'invalid', reason: 'wallet' };
            return { ok: true, kind: 'term_open', bongDelta: -added[0].amount, termId: added[0].id };
        }
    }
    if (regD === 0 && tTerms.length === bTerms.length - 1) {
        const removed = findRemovedTermDeposits(bTerms, tTerms);
        if (removed.length === 1 && termSumD === -removed[0].amount) {
            return { ok: true, kind: 'term_early', bongDelta: removed[0].amount, termId: removed[0].id };
        }
    }
    return { ok: false, kind: 'invalid' };
}

/**
 * 서버 기준 만기 정산 뒤 클라이언트 수동 조작을 얹습니다.
 * - 이번 저장에서 만기 지급된 적금은 클라이언트 목록에 남아 있어도 빼서 다시 지급되지 않게 합니다.
 * - 이미 만기 지급된 적금의 중도 해지는 원금을 한 번 더 주지 않습니다.
 * - 조작 결과 지갑이나 일반예금이 음수가 되면 거절합니다.
 *
 * @param {{ serverTerms: object[], accrued: { bong:number, bankRegularSavings:number, bankTermDeposits:object[] }, target: { bong:number, bankRegularSavings:number, bankTermDeposits:object[] } }} p
 */
export function planManualBankSave({ serverTerms, accrued, target } = {}) {
    const acc = accrued || {};
    const tgt = target || {};
    const accTerms = sanitizeTermDeposits(acc.bankTermDeposits);
    const accIds = new Set(accTerms.map((t) => t.id));
    const maturedIds = new Set(sanitizeTermDeposits(serverTerms).filter((t) => !accIds.has(t.id)).map((t) => t.id));
    const targetTerms = sanitizeTermDeposits(tgt.bankTermDeposits).filter((t) => !maturedIds.has(t.id));
    const base = {
        bong: bong(acc.bong),
        bankRegularSavings: bong(acc.bankRegularSavings),
        bankTermDeposits: accTerms,
    };
    const next = {
        bong: bong(tgt.bong),
        bankRegularSavings: bong(tgt.bankRegularSavings),
        bankTermDeposits: targetTerms,
    };
    const validation = validateManualBankTransition(base, next);
    if (!validation.ok) return { ok: false, reason: validation.reason || 'invalid', validation };
    const bongDelta = validation.keepServerBong ? 0 : bong(validation.bongDelta);
    const regDelta = bong(next.bankRegularSavings - base.bankRegularSavings);
    const outBong = bong(base.bong + bongDelta);
    const outReg = bong(base.bankRegularSavings + regDelta);
    if (bongDelta < 0 && outBong < 0) return { ok: false, reason: 'wallet', validation };
    if (regDelta < 0 && outReg < 0) return { ok: false, reason: 'regular', validation };
    return {
        ok: true,
        kind: validation.kind,
        validation,
        bong: outBong,
        bankRegularSavings: outReg,
        bankTermDeposits: validation.kind === 'none' || validation.kind === 'wallet_only' || validation.kind === 'deposit' || validation.kind === 'withdraw'
            ? accTerms
            : targetTerms,
        maturedIds: [...maturedIds],
    };
}
