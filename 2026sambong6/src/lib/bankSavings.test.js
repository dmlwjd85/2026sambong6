import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    TERM_DEPOSIT_DAYS,
    computeTermDepositMaturity,
    planManualBankSave,
    sanitizeTermDeposits,
    termDepositDaysLeft,
    termDepositInterest,
    validateManualBankTransition,
    ymdDaysBetween,
} from './bankSavings.js';

const td = (id, amount, startDate) => ({ id, amount, startDate });

describe('ymdDaysBetween', () => {
    it('같은 날 0, 다음 날 1, 월·연 경계', () => {
        assert.equal(ymdDaysBetween('2026-11-09', '2026-11-09'), 0);
        assert.equal(ymdDaysBetween('2026-11-09', '2026-11-10'), 1);
        assert.equal(ymdDaysBetween('2026-10-10', '2026-11-09'), 30);
        assert.equal(ymdDaysBetween('2026-12-31', '2027-01-01'), 1);
        assert.equal(ymdDaysBetween('2028-02-28', '2028-03-01'), 2);
    });
    it('형식이 틀리거나 거꾸로면 0', () => {
        assert.equal(ymdDaysBetween('', '2026-11-09'), 0);
        assert.equal(ymdDaysBetween('2026/11/01', '2026-11-09'), 0);
        assert.equal(ymdDaysBetween('2026-11-10', '2026-11-09'), 0);
    });
});

describe('적금 정규화', () => {
    it('같은 id 중복과 잘못된 항목을 뺍니다', () => {
        const out = sanitizeTermDeposits([
            td('a', 10, '2026-11-01'),
            td('a', 10, '2026-11-01'),
            td('b', 0, '2026-11-01'),
            td('c', -5, '2026-11-01'),
            td('', 5, '2026-11-01'),
            td('d', 5, 'nope'),
            null,
            td('e', 7.9, '2026-11-02'),
        ]);
        assert.deepEqual(out, [td('a', 10, '2026-11-01'), td('e', 7, '2026-11-02')]);
    });
});

describe('적금 이자·만기', () => {
    it('이자는 원금×이율 반올림, 0 이하·이상값은 0', () => {
        assert.equal(termDepositInterest(100, 3), 3);
        assert.equal(termDepositInterest(50, 3), 2); // 1.5 → 2
        assert.equal(termDepositInterest(10, 3), 0); // 0.3 → 0
        assert.equal(termDepositInterest(100, 0), 0);
        assert.equal(termDepositInterest(100, -5), 0);
        assert.equal(termDepositInterest(100, NaN), 0);
        assert.equal(termDepositInterest(100, 500), 100); // 100% 상한
    });
    it('30일째부터 만기, 29일째는 그대로', () => {
        const terms = [td('a', 100, '2026-10-10'), td('b', 50, '2026-10-11')];
        const res = computeTermDepositMaturity(terms, 3, '2026-11-09');
        assert.equal(TERM_DEPOSIT_DAYS, 30);
        assert.equal(res.credit, 103);
        assert.deepEqual(res.left, [td('b', 50, '2026-10-11')]);
        assert.deepEqual(res.matured, [{ id: 'a', principal: 100, interest: 3, total: 103 }]);
    });
    it('같은 적금이 두 번 들어 있어도 한 번만 지급', () => {
        const res = computeTermDepositMaturity([td('a', 100, '2026-10-01'), td('a', 100, '2026-10-01')], 10, '2026-11-09');
        assert.equal(res.credit, 110);
        assert.equal(res.matured.length, 1);
    });
    it('남은 일수', () => {
        assert.equal(termDepositDaysLeft('2026-11-09', '2026-11-09'), 30);
        assert.equal(termDepositDaysLeft('2026-10-01', '2026-11-09'), 0);
    });
});

describe('validateManualBankTransition', () => {
    const base = { bong: 100, bankRegularSavings: 50, bankTermDeposits: [td('a', 20, '2026-11-01')] };
    it('입금·출금', () => {
        assert.equal(validateManualBankTransition(base, { ...base, bong: 70, bankRegularSavings: 80 }).kind, 'deposit');
        assert.equal(validateManualBankTransition(base, { ...base, bong: 150, bankRegularSavings: 0 }).kind, 'withdraw');
    });
    it('예금보다 많이 출금하거나 지갑보다 많이 입금하면 거절', () => {
        assert.equal(validateManualBankTransition(base, { ...base, bankRegularSavings: -10 }).ok, false);
        assert.equal(validateManualBankTransition(base, { ...base, bankRegularSavings: 200 }).ok, false);
    });
    it('적금 가입·중도 해지', () => {
        const opened = validateManualBankTransition(base, { ...base, bankTermDeposits: [...base.bankTermDeposits, td('b', 30, '2026-11-09')] });
        assert.equal(opened.kind, 'term_open');
        assert.equal(opened.bongDelta, -30);
        const early = validateManualBankTransition(base, { ...base, bankTermDeposits: [] });
        assert.equal(early.kind, 'term_early');
        assert.equal(early.bongDelta, 20);
    });
    it('지갑보다 큰 적금은 거절', () => {
        const r = validateManualBankTransition(base, { ...base, bankTermDeposits: [...base.bankTermDeposits, td('b', 101, '2026-11-09')] });
        assert.equal(r.ok, false);
    });
    it('한 번에 두 건 조작은 거절', () => {
        const r = validateManualBankTransition(base, {
            ...base,
            bankTermDeposits: [...base.bankTermDeposits, td('b', 10, '2026-11-09'), td('c', 10, '2026-11-09')],
        });
        assert.equal(r.ok, false);
    });
});

describe('planManualBankSave (저장 트랜잭션)', () => {
    it('가입 중 다른 적금이 서버에서 만기되면 만기 적금을 다시 남기지 않음(중복 지급 방지)', () => {
        const serverTerms = [td('old', 100, '2026-10-01')];
        const accrued = { bong: 210, bankRegularSavings: 0, bankTermDeposits: [] }; // 100+이자10 지급됨
        const target = { bong: 70, bankRegularSavings: 0, bankTermDeposits: [td('old', 100, '2026-10-01'), td('new', 30, '2026-11-09')] };
        const plan = planManualBankSave({ serverTerms, accrued, target });
        assert.equal(plan.ok, true);
        assert.equal(plan.kind, 'term_open');
        assert.equal(plan.bong, 180);
        assert.deepEqual(plan.bankTermDeposits.map((t) => t.id), ['new']);
    });
    it('클라이언트가 먼저 만기 처리한 뒤 가입해도 받아 줌', () => {
        const serverTerms = [td('old', 100, '2026-10-01')];
        const accrued = { bong: 210, bankRegularSavings: 0, bankTermDeposits: [] };
        const target = { bong: 180, bankRegularSavings: 0, bankTermDeposits: [td('new', 30, '2026-11-09')] };
        const plan = planManualBankSave({ serverTerms, accrued, target });
        assert.equal(plan.ok, true);
        assert.equal(plan.bong, 180);
    });
    it('이미 만기 지급된 적금의 중도 해지는 원금을 또 주지 않음', () => {
        const serverTerms = [td('old', 100, '2026-10-01')];
        const accrued = { bong: 210, bankRegularSavings: 0, bankTermDeposits: [] };
        const target = { bong: 200, bankRegularSavings: 0, bankTermDeposits: [] };
        const plan = planManualBankSave({ serverTerms, accrued, target });
        assert.equal(plan.ok, true);
        assert.equal(plan.bong, 210);
        assert.deepEqual(plan.bankTermDeposits, []);
    });
    it('같은 중도 해지를 두 번 저장해도 원금은 한 번만', () => {
        const serverAfterFirst = { bong: 120, bankRegularSavings: 0, bankTermDeposits: [] };
        const staleTarget = { bong: 140, bankRegularSavings: 0, bankTermDeposits: [] };
        const plan = planManualBankSave({ serverTerms: [], accrued: serverAfterFirst, target: staleTarget });
        assert.equal(plan.ok, true);
        assert.equal(plan.bong, 120);
    });
    it('대출 자동이체로 예금이 줄었으면 출금이 예금을 음수로 만들지 못함', () => {
        const accrued = { bong: 0, bankRegularSavings: 10, bankTermDeposits: [] };
        const target = { bong: 50, bankRegularSavings: 0, bankTermDeposits: [] }; // 클라는 50 출금 시도(서버엔 10뿐)
        const plan = planManualBankSave({ serverTerms: [], accrued, target });
        assert.equal(plan.ok, true);
        assert.equal(plan.bankRegularSavings, 0);
        assert.equal(plan.bong, 10);
        const over = planManualBankSave({ serverTerms: [], accrued, target: { bong: 50, bankRegularSavings: -40, bankTermDeposits: [] } });
        assert.equal(over.ok, false);
    });
    it('서버 지갑이 모자라면 적금 가입을 거절(지갑 음수 방지)', () => {
        const accrued = { bong: 20, bankRegularSavings: 0, bankTermDeposits: [] };
        const target = { bong: 70, bankRegularSavings: 0, bankTermDeposits: [td('n', 30, '2026-11-09')] };
        const plan = planManualBankSave({ serverTerms: [], accrued, target });
        assert.equal(plan.ok, false);
        assert.equal(plan.reason, 'wallet');
    });
    it('서버 지갑이 모자라면 입금을 거절', () => {
        const accrued = { bong: 5, bankRegularSavings: 0, bankTermDeposits: [] };
        const plan = planManualBankSave({ serverTerms: [], accrued, target: { bong: 0, bankRegularSavings: 30, bankTermDeposits: [] } });
        assert.equal(plan.ok, false);
    });
    it('예금·적금 그대로면 서버 지갑 유지', () => {
        const accrued = { bong: 77, bankRegularSavings: 3, bankTermDeposits: [td('a', 5, '2026-11-01')] };
        const plan = planManualBankSave({ serverTerms: accrued.bankTermDeposits, accrued, target: { bong: 999, bankRegularSavings: 3, bankTermDeposits: [td('a', 5, '2026-11-01')] } });
        assert.equal(plan.ok, true);
        assert.equal(plan.bong, 77);
    });
});
