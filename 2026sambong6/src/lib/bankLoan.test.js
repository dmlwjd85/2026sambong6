import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CREDIT_DEFAULT_UNIT,
    LOAN_LIMIT_DEFAULT,
    LOAN_MIN_INTEREST,
    LOAN_MIN_UNIT,
    addBusinessDaysYmd,
    addCalendarDaysYmd,
    applyLoanAction,
    applyLoanLifecycle,
    copyCreditFields,
    creditDefaultDaysFromAmount,
    simulateCreditDays,
    isLoanPenaltyActive,
    isStudentCreditDefault,
    personalLoanLimit,
    planPartialRepay,
    collectLoanRepayment,
    computeLoanInterest,
    countBusinessDaysAfter,
    creditDefaultBlockMessage,
    getLoanCalendarFromWorld,
    isBankBusinessDay,
    isCreditDefaultOn,
    loanDueTotal,
    loanStillOutstanding,
    planTakeLoan,
    sanitizeLoanAmount,
    sanitizeLoanLimit,
    takeLoanFailMessage,
} from './bankLoan.js';

const cal = { holidays: ['2026-10-09'], vacationStart: '2026-12-24', vacationEnd: '2027-01-06' };

describe('대출 한도·금액', () => {
    it('10봉 단위로 맞추고 한도는 0~500이다', () => {
        assert.equal(sanitizeLoanAmount(25), 20);
        assert.equal(sanitizeLoanAmount(9), 0);
        assert.equal(sanitizeLoanAmount(10), 10);
        assert.equal(sanitizeLoanLimit(null), LOAN_LIMIT_DEFAULT);
        assert.equal(sanitizeLoanLimit(-1), 0);
        assert.equal(sanitizeLoanLimit(9999), 500);
        assert.equal(personalLoanLimit({
            baseLimit: 50,
            regularSavings: 20,
            termSavings: 30,
            indexValue: 15.9,
        }), 115);
        assert.equal(personalLoanLimit({
            baseLimit: 9999,
            regularSavings: -4,
            termSavings: 10,
            indexValue: 0,
        }), 510);
        assert.equal(creditDefaultDaysFromAmount(0), 0);
        assert.equal(creditDefaultDaysFromAmount(30), 1);
        assert.equal(creditDefaultDaysFromAmount(31), 2);
        assert.equal(creditDefaultDaysFromAmount(1), 1);
        assert.equal(creditDefaultDaysFromAmount(-61), Math.ceil(61 / CREDIT_DEFAULT_UNIT));
        assert.equal(isCreditDefaultOn({ creditDefaultUntilYmd: '곧' }, '2026-10-19'), false);
        assert.equal(isStudentCreditDefault({ bong: -1 }, '2026-10-19'), true);
        assert.equal(isStudentCreditDefault({ bong: '아님' }, '2026-10-19'), false);
        assert.equal(isStudentCreditDefault({
            bong: 3,
            bankLoan: { id: 'x', principal: 10, interest: 1, days: 1, startYmd: '2026-10-01', dueYmd: '2026-10-19' },
        }, '2026-10-19'), true);
        assert.equal(isStudentCreditDefault({
            bong: 3,
            bankLoan: { id: 'x', principal: 10, interest: 1, days: 1, startYmd: '2026-10-01', dueYmd: '2026-10-20' },
        }, '2026-10-19'), false);
    });
});

describe('대출 이자', () => {
    it('적금 30일 이율과 연동하고 1.5배·올림·최소 1봉이다', () => {
        assert.equal(computeLoanInterest(10, 1, 0), LOAN_MIN_INTEREST);
        // 100 × 10% × 5/30 × 1.5 = 2.5 → 3
        assert.equal(computeLoanInterest(100, 5, 10), 3);
        // 금액·기간이 늘면 이자도 는다
        assert.ok(computeLoanInterest(200, 5, 10) > computeLoanInterest(100, 5, 10));
        assert.ok(computeLoanInterest(100, 5, 10) >= computeLoanInterest(100, 1, 10));
    });
});

describe('영업일', () => {
    it('주말·공휴일·방학은 빼고 약정일을 센다', () => {
        assert.equal(isBankBusinessDay('2026-09-18', cal), true); // 금
        assert.equal(isBankBusinessDay('2026-09-19', cal), false); // 토
        assert.equal(isBankBusinessDay('2026-10-09', cal), false); // 한글날
        assert.equal(isBankBusinessDay('2026-12-25', cal), false); // 방학
        assert.equal(addBusinessDaysYmd('2026-09-14', 5, cal), '2026-09-21'); // 월+5영업일=다음 월
        assert.equal(countBusinessDaysAfter('2026-09-14', '2026-09-21', cal), 5);
    });
});

describe('대출 실행', () => {
    it('한도·중복·신용불량을 막는다', () => {
        const today = '2026-09-15';
        const ok = planTakeLoan({
            amount: 40, days: 3, ratePercent: 10, limit: 50, todayYmd: today, calendar: cal,
        });
        assert.equal(ok.ok, true);
        assert.equal(ok.loan.principal, 40);
        assert.equal(ok.loan.dueYmd, addBusinessDaysYmd(today, 3, cal));
        assert.equal(planTakeLoan({ ...ok, existingLoan: ok.loan, amount: 10, days: 1, ratePercent: 10, limit: 50, todayYmd: today }).ok, false);
        assert.equal(planTakeLoan({
            existingLoan: { principal: 20, dueYmd: '2026-10-20' },
            amount: 10, days: 1, ratePercent: 10, limit: 50, todayYmd: today,
        }).reason, 'active');
        assert.equal(loanStillOutstanding(null), false);
        assert.equal(loanStillOutstanding({}), false);
        assert.equal(planTakeLoan({ inDefault: true, amount: 10, days: 1, ratePercent: 10, limit: 50, todayYmd: today }).reason, 'default');
        assert.equal(planTakeLoan({ amount: 80, days: 1, ratePercent: 10, limit: 50, todayYmd: today }).reason, 'limit');
        assert.equal(planTakeLoan({ amount: 10, days: 1, ratePercent: 10, limit: 0, todayYmd: today }).reason, 'disabled');
    });
});

describe('자동이체·신용불량', () => {
    it('지갑 다음 일반예금에서 갚고 모자라면 마이너스다', () => {
        const paid = collectLoanRepayment({ bong: 20, regular: 5, due: 40 });
        assert.equal(paid.bong, -15);
        assert.equal(paid.regular, 0);
        assert.equal(paid.fromWallet, 35);
        assert.equal(paid.fromRegular, 5);
    });

    it('약정일에는 있는 돈만 한 번 갚고, 모자라면 신용불량이 된다', () => {
        const loan = planTakeLoan({
            amount: 20, days: 1, ratePercent: 0, limit: 50, todayYmd: '2026-09-14', calendar: cal,
        }).loan;
        const dueAmt = loan.principal + loan.interest;
        const short = applyLoanLifecycle({
            bong: 5,
            bankRegularSavings: 10,
            bankLoan: loan,
        }, loan.dueYmd, cal);
        assert.equal(short.bong, 0);
        assert.equal(short.bankRegularSavings, 0);
        assert.equal(short.bankLoan.principal + short.bankLoan.interest, dueAmt - 15);
        assert.equal(short.bankLoan.dueYmd, loan.dueYmd);
        const days = creditDefaultDaysFromAmount(dueAmt - 15);
        assert.equal(short.creditDefaultUntilYmd, addCalendarDaysYmd(loan.dueYmd, days));
        assert.equal(isStudentCreditDefault(short, loan.dueYmd), true);
        assert.ok(short.msgs.some((m) => m.kind === 'auto_repay'));
        assert.ok(short.msgs.some((m) => m.kind === 'penalty_start'));
        const again = applyLoanLifecycle(short, loan.dueYmd, cal);
        assert.equal(again.bong, short.bong);
        assert.equal(again.bankRegularSavings, short.bankRegularSavings);
        assert.equal(again.bankLoan.principal, short.bankLoan.principal);
        assert.equal(again.creditDefaultUntilYmd, short.creditDefaultUntilYmd);
        assert.equal(again.msgs.filter((m) => m.kind === 'auto_repay').length, 0);
        assert.equal(again.msgs.filter((m) => m.kind === 'penalty_start').length, 0);
    });

    it('만기일에 돈이 충분하면 대출이 끝나고 신용불량이 되지 않는다', () => {
        const loan = planTakeLoan({
            amount: 20, days: 1, ratePercent: 0, limit: 50, todayYmd: '2026-09-14', calendar: cal,
        }).loan;
        const dueAmt = loan.principal + loan.interest;
        const paid = applyLoanLifecycle({
            bong: 100,
            bankRegularSavings: 0,
            bankLoan: loan,
        }, loan.dueYmd, cal);
        assert.equal(paid.bankLoan, null);
        assert.equal(paid.bong, 100 - dueAmt);
        assert.equal(paid.creditDefaultUntilYmd, '');
        assert.equal(isStudentCreditDefault(paid, loan.dueYmd), false);
        const twice = applyLoanLifecycle(paid, loan.dueYmd, cal);
        assert.equal(twice.bong, paid.bong);
        assert.equal(twice.bankLoan, null);
    });

    it('마이너스가 되면 바로 신용불량이 되고, 기간 중에는 날짜를 다시 밀지 않는다', () => {
        const start = '2026-09-14';
        const hit = applyLoanLifecycle({
            bong: -31,
            bankRegularSavings: 0,
            bankLoan: null,
        }, start, cal);
        assert.equal(isCreditDefaultOn(hit, start), true);
        assert.equal(hit.creditDefaultUntilYmd, addCalendarDaysYmd(start, 2));
        assert.match(creditDefaultBlockMessage(hit.creditDefaultUntilYmd), /밥줄/);
        const stay = applyLoanLifecycle({ ...hit, bong: -90 }, '2026-09-15', cal);
        assert.equal(stay.creditDefaultUntilYmd, hit.creditDefaultUntilYmd);
        const ended = applyLoanLifecycle({ ...hit, bong: -100 }, hit.creditDefaultUntilYmd, cal);
        assert.equal(ended.creditDefaultUntilYmd, '');
        assert.equal(ended.bong, -100);
        assert.equal(isStudentCreditDefault(ended, hit.creditDefaultUntilYmd), false);
        assert.equal(ended.creditWalletRecovered, false);
        const recovered = applyLoanLifecycle({
            bong: 10,
            bankRegularSavings: 0,
            bankNegativeSinceYmd: start,
        }, '2026-09-15', cal);
        assert.equal(recovered.bankNegativeSinceYmd, '');
        assert.equal(isCreditDefaultOn(recovered, '2026-09-15'), false);
        const kept = applyLoanLifecycle({
            bong: 10,
            creditDefaultUntilYmd: '2026-09-20',
        }, '2026-09-15', cal);
        assert.equal(kept.creditDefaultUntilYmd, '2026-09-20');
        assert.equal(isStudentCreditDefault(kept, '2026-09-15'), true);
    });

    it('연체와 마이너스가 같은 날이면 더 큰 금액으로 기간을 정한다', () => {
        const loan = planTakeLoan({
            amount: 20, days: 1, ratePercent: 0, limit: 50, todayYmd: '2026-09-14', calendar: cal,
        }).loan;
        const started = applyLoanLifecycle({
            bong: -90,
            bankRegularSavings: 0,
            bankLoan: loan,
        }, loan.dueYmd, cal);
        assert.equal(started.creditDefaultUntilYmd, addCalendarDaysYmd(loan.dueYmd, creditDefaultDaysFromAmount(90)));
        assert.equal(started.loanPenaltyUntilYmd, started.creditDefaultUntilYmd);
    });
});

describe('대출 실행·달력', () => {
    it('월드 방학이 꺼져 있으면 방학 날짜를 영업일에서 빼지 않는다', () => {
        const off = getLoanCalendarFromWorld({
            vacationEnabled: false,
            vacationStartDate: '2026-12-24',
            vacationEndDate: '2027-01-06',
        }, ['2026-10-09']);
        assert.equal(off.vacationStart, '');
        assert.equal(isBankBusinessDay('2026-12-25', off), true);
        const on = getLoanCalendarFromWorld({
            vacationEnabled: true,
            vacationStartDate: '2026-12-24',
            vacationEndDate: '2027-01-06',
        }, ['2026-10-09']);
        assert.equal(isBankBusinessDay('2026-12-25', on), false);
        const fromWorld = getLoanCalendarFromWorld({
            vacationEnabled: false,
            holidays: [{ date: '2026-10-09', name: '한글날' }],
        });
        assert.deepEqual(fromWorld.holidays, ['2026-10-09']);
        assert.equal(isBankBusinessDay('2026-10-09', fromWorld), false);
    });

    it('서버 기준으로만 대출을 실행하고 신용불량 안내를 준다', () => {
        const taken = applyLoanAction({ bong: 0, bankRegularSavings: 0 }, 'take', {
            amount: 20, days: 2, ratePercent: 10, limit: 50, todayYmd: '2026-09-15', calendar: cal, nowMs: 1,
        });
        assert.equal(taken.ok, true);
        assert.equal(taken.bong, 20);
        assert.equal(taken.bankLoan.principal, 20);
        assert.match(takeLoanFailMessage('default'), /신용불량/);
        const blocked = applyLoanAction({ ...taken, creditDefaultUntilYmd: '2026-09-20' }, 'take', {
            amount: 10, days: 1, ratePercent: 10, limit: 50, todayYmd: '2026-09-15', calendar: cal,
        });
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'default');
        assert.equal(blocked.bankLoan.dueYmd, taken.bankLoan.dueYmd);
    });

    it('갚을 대출이 있으면 새 대출로 약정일을 밀지 않는다', () => {
        const first = applyLoanAction({ bong: 0, bankRegularSavings: 0 }, 'take', {
            amount: 20, days: 2, ratePercent: 10, limit: 50, todayYmd: '2026-09-15', calendar: cal, nowMs: 1,
        });
        const due = first.bankLoan.dueYmd;
        const again = applyLoanAction({
            bong: first.bong,
            bankRegularSavings: 0,
            bankLoan: first.bankLoan,
        }, 'take', {
            amount: 40, days: 5, ratePercent: 10, limit: 50, todayYmd: '2026-09-16', calendar: cal, nowMs: 2,
        });
        assert.equal(again.ok, false);
        assert.equal(again.reason, 'active');
        assert.equal(again.bankLoan.dueYmd, due);
        assert.equal(again.bankLoan.principal, 20);
        assert.equal(again.bong, first.bong);

        const onDue = applyLoanAction({
            bong: 100,
            bankRegularSavings: 0,
            bankLoan: first.bankLoan,
        }, 'take', {
            amount: 40, days: 5, ratePercent: 10, limit: 50, todayYmd: due, calendar: cal, nowMs: 3,
        });
        assert.equal(onDue.ok, false);
        assert.equal(onDue.reason, 'settled');
        assert.equal(onDue.bankLoan, null);
        assert.ok(onDue.bong < 100);
        assert.equal(onDue.creditDefaultUntilYmd, '');
        const onDueAgain = applyLoanAction(onDue, 'take', {
            amount: 40, days: 5, ratePercent: 10, limit: 50, todayYmd: due, calendar: cal, nowMs: 4,
            blockTakeBecauseLoan: true,
        });
        assert.equal(onDueAgain.ok, false);
        assert.equal(onDueAgain.bong, onDue.bong);

        const partial = { principal: 20, dueYmd: '2026-10-20' };
        const broken = applyLoanAction({ bong: 5, bankRegularSavings: 0, bankLoan: partial }, 'take', {
            amount: 10, days: 1, ratePercent: 10, limit: 50, todayYmd: '2026-09-15', calendar: cal, nowMs: 4,
        });
        assert.equal(broken.ok, false);
        assert.equal(broken.reason, 'active');
        assert.equal(broken.bankLoan.dueYmd, '2026-10-20');
        assert.equal(broken.bong, 5);

        const repaid = applyLoanAction({
            bong: 100,
            bankRegularSavings: 0,
            bankLoan: first.bankLoan,
        }, 'repay', {
            todayYmd: '2026-09-15', calendar: cal,
        });
        assert.equal(repaid.ok, true);
        assert.equal(repaid.bankLoan, null);
        assert.ok(repaid.bong < 100);
    });

    it('일부만 갚으면 남은 빚과 약정일을 유지한다', () => {
        const taken = applyLoanAction({ bong: 30, bankRegularSavings: 0 }, 'take', {
            amount: 20, days: 2, ratePercent: 10, limit: 50, todayYmd: '2026-09-15', calendar: cal, nowMs: 9,
        });
        const part = planPartialRepay(taken, 5);
        assert.equal(part.ok, true);
        assert.equal(part.left, loanDueTotal(taken.bankLoan) - 5);
        assert.equal(part.loan.dueYmd, taken.bankLoan.dueYmd);
        const saved = applyLoanAction(taken, 'partial', {
            amount: 5, todayYmd: '2026-09-16', calendar: cal,
        });
        assert.equal(saved.ok, true);
        assert.equal(saved.bankLoan.dueYmd, taken.bankLoan.dueYmd);
        assert.equal(saved.bong, taken.bong - 5);
        const broke = planPartialRepay({ ...taken, bong: 1, bankRegularSavings: 0 }, 5);
        assert.equal(broke.reason, 'funds');
        const overdue = applyLoanLifecycle({ ...saved, bong: 0 }, saved.bankLoan.dueYmd, cal);
        assert.equal(isLoanPenaltyActive(overdue, saved.bankLoan.dueYmd), true);
        const cleared = applyLoanAction({
            ...overdue,
            bong: 100,
        }, 'repay', { todayYmd: saved.bankLoan.dueYmd, calendar: cal });
        assert.equal(cleared.ok, true);
        assert.equal(cleared.bankLoan, null);
        assert.equal(cleared.loanPenaltyUntilYmd, '');
        assert.equal(cleared.creditDefaultUntilYmd, '');
        assert.equal(planTakeLoan({
            amount: 40, days: 1, ratePercent: 10, limit: personalLoanLimit({
                baseLimit: 50, regularSavings: 20, termSavings: 0, indexValue: 0,
            }), todayYmd: '2026-09-15', calendar: cal,
        }).ok, true);
        const short = applyLoanAction({
            bong: 1,
            bankRegularSavings: 0,
            bankLoan: taken.bankLoan,
            creditDefaultUntilYmd: '2026-09-20',
        }, 'repay', { todayYmd: '2026-09-16', calendar: cal });
        assert.equal(short.ok, true);
        assert.equal(short.bankLoan, null);
        assert.ok(short.bong < 0);
        assert.equal(short.creditDefaultUntilYmd, '2026-09-20');
        assert.equal(short.loanPenaltyUntilYmd, '');
    });
});

describe('신용불량 해제 뒤 같은 이유로는 다시 걸리지 않는다', () => {
    it('지갑이 -100인 채로 기간이 끝나면 풀리고, 점심값이 더 빠져도 다시 걸리지 않는다', () => {
        const start = '2026-09-16';
        const sim = simulateCreditDays({
            startYmd: start,
            days: 60,
            state: { bong: -100, bankRegularSavings: 0, bankLoan: null },
            calendar: cal,
            lunchFee: 10,
            salary: 30,
        });
        const until = addCalendarDaysYmd(start, creditDefaultDaysFromAmount(100));
        const endRow = sim.rows.find((row) => row.ymd === until);
        assert.ok(endRow);
        assert.equal(endRow.credit, false);
        assert.equal(endRow.until, '');
        const after = sim.rows.filter((row) => row.ymd >= until);
        assert.ok(after.length > 40);
        assert.equal(after.some((row) => row.credit), false);
        assert.ok(after.some((row) => row.lunchPaid === 10));
        assert.ok(sim.state.bong < -100);
        const during = sim.rows.filter((row) => row.ymd < until);
        assert.equal(during.every((row) => row.credit), true);
        assert.equal(during.some((row) => row.salaryPaid > 0), false);
        assert.ok(sim.rows.some((row) => row.ymd > until && row.salaryPaid === 30));
    });

    it('해제 뒤 새 대출이 연체되면 다시 걸리고, 같은 대출은 다시 걸리지 않는다', () => {
        const start = '2026-09-14';
        const loan = planTakeLoan({
            amount: 30, days: 1, ratePercent: 0, limit: 50, todayYmd: '2026-09-01', calendar: cal, nowMs: 11,
        }).loan;
        const ended = applyLoanLifecycle({
            bong: -100,
            bankLoan: loan,
            creditDefaultUntilYmd: start,
            loanPenaltyUntilYmd: start,
        }, start, cal);
        assert.equal(isStudentCreditDefault(ended, start), false);
        assert.equal(ended.bankLoan.id, loan.id);
        assert.equal(ended.creditReleaseLoanId, loan.id);
        const next = applyLoanLifecycle(ended, addCalendarDaysYmd(start, 3), cal);
        assert.equal(isStudentCreditDefault(next, addCalendarDaysYmd(start, 3)), false);
        const freshLoan = planTakeLoan({
            amount: 20, days: 1, ratePercent: 0, limit: 50, todayYmd: addCalendarDaysYmd(start, 3), calendar: cal, nowMs: 99,
        }).loan;
        const overdue = applyLoanLifecycle({
            ...copyCreditFields(next),
            bong: next.bong,
            bankRegularSavings: 0,
            bankLoan: { ...freshLoan, dueYmd: addCalendarDaysYmd(start, 4) },
        }, addCalendarDaysYmd(start, 4), cal);
        assert.equal(isStudentCreditDefault(overdue, addCalendarDaysYmd(start, 4)), true);
        assert.ok(overdue.creditDefaultUntilYmd > addCalendarDaysYmd(start, 4));
    });

    it('지갑이 0 이상이 됐다가 다시 마이너스가 되면 새로 걸린다', () => {
        const start = '2026-09-14';
        const ended = applyLoanLifecycle({
            bong: -100,
            creditDefaultUntilYmd: start,
        }, start, cal);
        assert.equal(isStudentCreditDefault(ended, start), false);
        const healed = applyLoanLifecycle({ ...ended, bong: 5 }, addCalendarDaysYmd(start, 1), cal);
        assert.equal(healed.creditWalletRecovered, true);
        assert.equal(isStudentCreditDefault(healed, addCalendarDaysYmd(start, 1)), false);
        const dipped = applyLoanLifecycle({ ...healed, bong: -15 }, addCalendarDaysYmd(start, 2), cal);
        assert.equal(isStudentCreditDefault(dipped, addCalendarDaysYmd(start, 2)), true);
        assert.equal(dipped.creditDefaultUntilYmd, addCalendarDaysYmd(addCalendarDaysYmd(start, 2), 1));
        const stayed = applyLoanLifecycle({ ...dipped, bong: -40 }, addCalendarDaysYmd(start, 2), cal);
        assert.equal(stayed.creditDefaultUntilYmd, dipped.creditDefaultUntilYmd);
        const endedAgain = applyLoanLifecycle({ ...stayed, bong: -40 }, dipped.creditDefaultUntilYmd, cal);
        assert.equal(endedAgain.creditDefaultUntilYmd, '');
        assert.equal(isStudentCreditDefault(endedAgain, dipped.creditDefaultUntilYmd), false);
    });
});
