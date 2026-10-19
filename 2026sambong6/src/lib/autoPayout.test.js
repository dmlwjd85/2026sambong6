import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bankBonusBlocked, weeklyJobPay, weeklySalaryGrantPlan } from './autoPayout.js';

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
    });
});
