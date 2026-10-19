import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bankBonusBlocked, salaryClaimFields, salaryWeekMonday, weeklyJobPay, weeklySalaryGrantPlan } from './autoPayout.js';

const catalog = [
    { id: 'job1', name: '청소', pay: 6, icon: 'fa-broom', color: 'text-sky-400' },
    { id: 'job2', name: '은행', pay: 4, icon: 'fa-piggy-bank', color: 'text-pink-500' },
];

describe('신용불량 자동 지급', () => {
    it('직업 주급을 더하고, 신용불량이면 이번 주 주급을 넣지 않습니다', () => {
        const jobs = [{ id: 'job1', name: '청소' }, { id: 'job2' }];
        assert.equal(weeklyJobPay(jobs, catalog), 10);
        assert.equal(weeklyJobPay([{ id: '없는직업' }], catalog), 0);
        const open = weeklySalaryGrantPlan({ jobs, bong: 3 }, catalog, '2026-10-16');
        assert.equal(open.grant, true);
        assert.equal(open.pay, 10);
        const blocked = weeklySalaryGrantPlan({
            jobs,
            bong: -5,
            creditDefaultUntilYmd: '2026-10-20',
        }, catalog, '2026-10-16');
        assert.equal(blocked.grant, false);
        assert.equal(blocked.reason, 'credit-default');
        assert.equal(blocked.pay, 10);
        assert.equal(weeklySalaryGrantPlan({ jobs: [] }, catalog, '2026-10-16').reason, 'no-pay');
        const minusOnly = weeklySalaryGrantPlan({ jobs, bong: -5 }, catalog, '2026-10-16');
        assert.equal(minusOnly.grant, false);
        assert.equal(minusOnly.reason, 'credit-default');
        const loan = {
            id: 'loan_cover',
            principal: 100,
            interest: 1,
            days: 1,
            startYmd: '2026-10-01',
            dueYmd: '2026-10-02',
        };
        const canRepay = weeklySalaryGrantPlan({
            jobs,
            bong: 500,
            bankRegularSavings: 0,
            bankLoan: loan,
        }, catalog, '2026-10-21');
        assert.equal(canRepay.grant, true);
        assert.equal(canRepay.reason, 'grant');
        const cannot = weeklySalaryGrantPlan({
            jobs,
            bong: 0,
            bankLoan: loan,
        }, catalog, '2026-10-21');
        assert.equal(cannot.grant, false);
        assert.equal(cannot.reason, 'credit-default');
    });

    it('주급 슬롯은 그 주 월요일이고, 같은 주는 다시 받지 않습니다', () => {
        const friday = new Date(2026, 9, 23);
        assert.equal(salaryWeekMonday(friday), '2026-10-19');
        assert.equal(salaryWeekMonday(new Date(2026, 9, 25)), '2026-10-19');
        const first = salaryClaimFields({ bong: 10 }, '2026-10-19');
        assert.equal(first.claim, true);
        assert.equal(first.salaryWeek, '2026-10-19');
        assert.equal(first.salaryEpoch, 1);
        const again = salaryClaimFields({ salaryWeek: '2026-10-19', salaryEpoch: 1 }, '2026-10-19');
        assert.equal(again.claim, false);
        assert.equal(again.reason, 'already');
        const future = salaryClaimFields({ salaryWeek: '2026-10-26', salaryEpoch: 2 }, '2026-10-19');
        assert.equal(future.claim, false);
        assert.equal(future.reason, 'future-week');
        assert.equal(salaryClaimFields({}, '').claim, false);
    });

    it('예금 주기 보너스도 신용불량 중에는 막습니다', () => {
        assert.equal(bankBonusBlocked({ bong: 10 }, '2026-10-16'), false);
        assert.equal(bankBonusBlocked({
            bong: 10,
            loanPenaltyUntilYmd: '2026-10-18',
        }, '2026-10-16'), true);
        assert.equal(bankBonusBlocked({
            loanPenaltyUntilYmd: '2026-10-18',
        }, '2026-10-18'), false);
        assert.equal(bankBonusBlocked({ bong: -2 }, '2026-10-16'), true);
    });
});
