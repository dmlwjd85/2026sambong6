import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    planServerLunchDeduction,
    capBongIncrease,
    walletSaveBaseline,
    laterLunchDate,
    bongPreservingCommittedLunch,
    settleLunchAndLoan,
    repayBeforeLunch,
} from './lunchDeduct.js';
import {
    CREDIT_DEFAULT_MAX_DAYS,
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
    mergeStudentDocKeepingLoanRepayment,
    LUNCH_FEE_BONG,
    claimLoanNoticesForSave,
    formatDueDayRepaySentence,
    formatLunchHoldSentence,
    planLoanRepayment,
    planPartialRepay,
    planRepayLoan,
    planClearLoan,
    collectShieldedDebtFromSalary,
    formatPromiseDay,
    formatDebtLeftSentence,
    formatSalaryCollectionNotice,
    formatWithheldLunchLine,
    formatLunchWalletSentence,
    formatClearRepayConfirm,
    formatClearRepayDone,
    formatClearLunchWarning,
    formatKeepLunchConfirm,
    formatKeepLunchDone,
    formatPartialRepayDone,
    formatPastPromiseLine,
    formatLunchRepayBlocked,
    koreanTopicParticle,
    koreanCopula,
    repayAmountsMatch,
    creditJudgedOnFinalBong,
    walletCreditAfterFinalBong,
    resolveBongKeepingLoanRepayment,
    collectLoanRepayment,
    computeLoanInterest,
    countBusinessDaysAfter,
    creditDefaultBlockMessage,
    loanPenaltyBlockMessage,
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
        assert.equal(creditDefaultDaysFromAmount(10000), CREDIT_DEFAULT_MAX_DAYS);
        assert.equal(creditDefaultDaysFromAmount(1801), 60);
        assert.equal(CREDIT_DEFAULT_MAX_DAYS, 60);
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
        assert.equal(short.bong, 5);
        assert.equal(short.bankRegularSavings, 0);
        assert.equal(short.bankLoan.principal + short.bankLoan.interest, dueAmt - 10);
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

    it('만기일 다음 접속에서도 상환을 먼저 하고, 기간은 만기일부터 센다', () => {
        const loan = planTakeLoan({
            amount: 100, days: 1, ratePercent: 0, limit: 200, todayYmd: '2026-09-14', calendar: cal,
        }).loan;
        const due = loan.dueYmd;
        const late = addCalendarDaysYmd(due, 2);
        const life = applyLoanLifecycle({
            bong: 5,
            bankRegularSavings: 12,
            bankLoan: loan,
        }, late, cal);
        const kinds = life.msgs.map((m) => m.kind);
        assert.equal(kinds[0], 'auto_repay');
        assert.ok(kinds.indexOf('auto_repay') < kinds.indexOf('penalty_start'));
        assert.equal(life.bong, 5);
        assert.equal(life.bankRegularSavings, 0);
        assert.ok(life.bankLoan);
        const left = loanDueTotal(loan) - 5 - 12;
        const days = creditDefaultDaysFromAmount(left);
        assert.equal(life.creditDefaultUntilYmd, addCalendarDaysYmd(due, days));
        assert.notEqual(life.creditDefaultUntilYmd, addCalendarDaysYmd(late, days));
        assert.equal(isStudentCreditDefault(life, late), true);
        const veryLate = addCalendarDaysYmd(due, 80);
        const missed = applyLoanLifecycle({
            bong: 5,
            bankRegularSavings: 0,
            bankLoan: loan,
        }, veryLate, cal);
        assert.equal(missed.loanDueHandledKey, `${loan.id}|${loan.dueYmd}`);
        assert.equal(missed.bong, 5);
        assert.equal(missed.msgs.some((m) => m.kind === 'penalty_start'), false);
        assert.equal(missed.msgs.some((m) => m.kind === 'default_end'), false);
        assert.equal(missed.creditDefaultUntilYmd, '');
        assert.equal(missed.creditReleaseLoanId, loan.id);
        assert.equal(isStudentCreditDefault(missed, veryLate), false);
        assert.ok(missed.bong >= 0);
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
        assert.equal(isBankBusinessDay('2026-12-24', off), true);
        assert.equal(isBankBusinessDay('2026-12-25', off), false);
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
        assert.equal(isBankBusinessDay('2026-10-05', { holidays: [] }), false);
        assert.equal(isBankBusinessDay('2026-10-09', { holidays: ['2026-11-11'] }), false);
        assert.equal(isBankBusinessDay('2026-11-11', { holidays: ['2026-11-11'] }), false);
        assert.equal(isBankBusinessDay('2026-10-20', { holidays: [] }), true);
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
        assert.equal(broke.ok, true);
        assert.equal(broke.amount, 1);
        assert.equal(broke.bong, 0);
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
            bong: 11,
            bankRegularSavings: 0,
            bankLoan: taken.bankLoan,
            creditDefaultUntilYmd: '2026-09-20',
            lastLunchDeductDate: '2026-09-16',
        }, 'repay', { todayYmd: '2026-09-16', calendar: cal });
        assert.equal(short.ok, true);
        assert.equal(short.bong, 10);
        assert.ok(short.bankLoan);
        assert.equal(loanDueTotal(short.bankLoan), loanDueTotal(taken.bankLoan) - 1);
        assert.equal(short.creditDefaultUntilYmd, '2026-09-20');
        assert.equal(short.loanPenaltyUntilYmd, '');
    });

    it('전부 갚기는 빚을 0으로 만들고, 모자라면 예금도 쓰지 않는다', () => {
        const loan = planTakeLoan({
            amount: 40, days: 1, ratePercent: 0, limit: 100, todayYmd: '2026-09-14', calendar: cal,
        }).loan;
        const due = loan.principal + loan.interest;
        assert.ok(due > 10);
        const short = planClearLoan({ bong: 10, bankRegularSavings: 80, bankLoan: loan });
        assert.equal(short.ok, false);
        assert.equal(short.reason, 'funds');
        assert.equal(short.regular, 80);
        assert.equal(planClearLoan({ bong: 0, bankRegularSavings: 80, bankLoan: loan }).reason, 'funds');
        assert.equal(planClearLoan({ bong: -3, bankRegularSavings: 80, bankLoan: loan }).reason, 'funds');
        const full = planClearLoan({ bong: due + 5, bankRegularSavings: 80, bankLoan: loan });
        assert.equal(full.ok, true);
        assert.equal(full.full, true);
        assert.equal(full.loan, null);
        assert.equal(full.bong, 5);
        assert.equal(full.regular, 80);
        assert.equal(full.fromRegular, 0);
        const keep = planRepayLoan({ bong: 10, bankRegularSavings: 80, bankLoan: loan });
        assert.equal(keep.ok, true);
        assert.equal(keep.full, false);
        assert.equal(keep.amount, 10);
        assert.equal(keep.bong, 0);
        assert.equal(keep.regular, 80);
    });

    it('갚을 수 있는 연체는 접속 전에 신용불량이 아니고, 다 갚기는 점심값을 남긴다', () => {
        const loan = planTakeLoan({
            amount: 100, days: 1, ratePercent: 0, limit: 200, todayYmd: '2026-10-01', calendar: cal,
        }).loan;
        const due = loanDueTotal(loan);
        const today = '2026-10-21';
        assert.ok(due > 90);
        assert.equal(isStudentCreditDefault({ bong: 500, bankRegularSavings: 0, bankLoan: loan }, today), false);
        assert.equal(isStudentCreditDefault({ bong: 60, bankRegularSavings: 50, bankLoan: loan }, today), false);
        assert.equal(isStudentCreditDefault({ bong: 60, bankRegularSavings: 30, bankLoan: loan }, today), true);
        assert.equal(isStudentCreditDefault({ bong: 0, bankLoan: loan }, today), true);
        assert.equal(isStudentCreditDefault({
            bong: -5, bankRegularSavings: 5000, bankLoan: loan,
        }, today), true);
        assert.equal(isStudentCreditDefault({
            bong: 500,
            bankLoan: loan,
            loanPenaltyUntilYmd: '2026-12-19',
        }, today), true);
        const penalty = loanPenaltyBlockMessage('2026-12-19');
        assert.match(penalty, /12월 19일에 풀려요/);
        assert.match(penalty, /약속한 날 다 갚지 못해서/);
        assert.doesNotMatch(penalty, /12-18까지|적힌 날|전날까지/);
        const negative = creditDefaultBlockMessage('2026-12-19');
        assert.match(negative, /12월 19일에 풀려요/);
        assert.match(negative, /밥줄/);
        assert.doesNotMatch(negative, /적힌 날/);

        const keep = planRepayLoan({
            bong: 20, bankLoan: loan, lastLunchDeductDate: '2026-10-21',
        }, { todayYmd: '2026-10-21', calendar: cal });
        assert.equal(keep.ok, true);
        assert.equal(keep.amount, 10);
        assert.equal(keep.bong, 10);
        assert.equal(keep.reserveLunch, 10);
        assert.equal(keep.withheldLunch, true);
        assert.equal(keep.regular, 0);
        assert.equal(keep.lunchParts[0].label, '목요일 점심값');
        const enough = planRepayLoan({
            bong: 200, bankLoan: loan, lastLunchDeductDate: '2026-10-21',
        }, { todayYmd: '2026-10-21', calendar: cal });
        assert.equal(enough.full, true);
        assert.equal(enough.bong, 200 - due);
        assert.equal(enough.withheldLunch, false);
        const blocked = planRepayLoan({
            bong: 8, bankLoan: loan, lastLunchDeductDate: '2026-10-21',
        }, { todayYmd: '2026-10-21', calendar: cal });
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'lunch');
        const friday = planRepayLoan({
            bong: 20, bankLoan: loan, lastLunchDeductDate: '2026-10-16',
        }, { todayYmd: '2026-10-16', calendar: cal });
        assert.equal(friday.reserveLunch, 10);
        assert.equal(friday.bong, 10);
        assert.equal(friday.lunchParts[0].label, '월요일 점심값');
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

describe('신용불량은 트랜잭션 뒤의 봉으로 본다', () => {
    it('순간 -10으로 걸린 하루 신용불량은 최종 지갑이 0이면 없다', () => {
        const today = '2026-10-19';
        const before = {
            bong: 0,
            bankLoan: null,
            bankRegularSavings: 0,
            creditDefaultUntilYmd: '',
            bankNegativeSinceYmd: '',
            loanDueHandledKey: '',
        };
        const dipped = applyLoanLifecycle({ ...before, bong: -10 }, today, {});
        assert.equal(isStudentCreditDefault(dipped, today), true);
        assert.equal(dipped.creditDefaultUntilYmd, addCalendarDaysYmd(today, 1));
        const judged = creditJudgedOnFinalBong({
            beforeState: before,
            lifecycle: dipped,
            finalBong: 0,
            todayYmd: today,
        });
        assert.equal(judged.creditDefaultUntilYmd, '');
        assert.equal(judged.bankNegativeSinceYmd, '');
        assert.equal(isStudentCreditDefault({ ...judged, bong: 0 }, today), false);
    });

    it('최종 봉이 그대로 -10이면 신용불량을 유지한다', () => {
        const today = '2026-10-19';
        const before = { bong: 0, bankLoan: null, creditDefaultUntilYmd: '' };
        const dipped = applyLoanLifecycle({ ...before, bong: -10 }, today, {});
        const judged = creditJudgedOnFinalBong({
            beforeState: before,
            lifecycle: dipped,
            finalBong: -10,
            todayYmd: today,
        });
        assert.equal(judged.creditDefaultUntilYmd, dipped.creditDefaultUntilYmd);
        assert.equal(isStudentCreditDefault({ ...judged, bong: -10 }, today), true);
    });

    it('이미 서버에 있던 신용불량은 최종 봉이 0이어도 그날로 지우지 않는다', () => {
        const today = '2026-10-19';
        const before = {
            bong: -10,
            bankLoan: null,
            creditDefaultUntilYmd: '2026-10-21',
            bankNegativeSinceYmd: '2026-10-19',
            creditWalletRecovered: false,
            loanDueHandledKey: '',
        };
        const life = applyLoanLifecycle(before, today, {});
        const judged = creditJudgedOnFinalBong({
            beforeState: before,
            lifecycle: life,
            finalBong: 0,
            todayYmd: today,
        });
        assert.equal(judged.creditDefaultUntilYmd, '2026-10-21');
        assert.equal(isStudentCreditDefault({ ...judged, bong: 0 }, today), true);
    });

    it('점심값으로 지갑만 -10이 되면 상환 키는 유지하고 하루 신용불량을 시작한다', () => {
        const today = '2026-10-20';
        const state = {
            bong: 0,
            bankLoan: { id: 'L1', principal: 11, interest: 0, days: 1, startYmd: '2026-10-13', dueYmd: '2026-10-20', rateAtStart: 0 },
            loanDueHandledKey: 'L1|2026-10-20',
            creditDefaultUntilYmd: '',
            bankNegativeSinceYmd: '',
        };
        const credit = walletCreditAfterFinalBong(state, -10, today);
        assert.equal(credit.loanDueHandledKey, 'L1|2026-10-20');
        assert.equal(credit.creditDefaultUntilYmd, addCalendarDaysYmd(today, 1));
        assert.equal(isStudentCreditDefault({ ...credit, bong: -10 }, today), true);
        const again = walletCreditAfterFinalBong({ ...state, ...credit, bong: -10 }, -10, today);
        assert.equal(again.creditDefaultUntilYmd, credit.creditDefaultUntilYmd);
        assert.equal(again.loanDueHandledKey, 'L1|2026-10-20');
    });
});

describe('만기 상환 지갑은 나중 저장이 되돌리지 않는다', () => {
    it('상환 전 잔액 100이 상환 후 40을 덮지 않고, 같은 키의 나중 수입은 남긴다', () => {
        const key = 'loan_1|2026-09-16';
        assert.equal(resolveBongKeepingLoanRepayment({
            clientBong: 100,
            clientKey: '',
            accruedBong: 40,
            accruedKey: key,
            proposedBong: 100,
            serverBong: 100,
            serverKey: '',
        }), 40);
        assert.equal(resolveBongKeepingLoanRepayment({
            clientBong: 100,
            clientKey: '',
            accruedBong: 40,
            accruedKey: key,
            proposedBong: 100,
            serverBong: 40,
            serverKey: key,
        }), 40);
        assert.equal(resolveBongKeepingLoanRepayment({
            clientBong: 40,
            clientKey: key,
            accruedBong: 100,
            accruedKey: '',
            proposedBong: 100,
            serverBong: 100,
            serverKey: '',
        }), 40);
        assert.equal(resolveBongKeepingLoanRepayment({
            clientBong: 50,
            clientKey: key,
            accruedBong: 40,
            accruedKey: key,
            proposedBong: 50,
            serverBong: 40,
            serverKey: key,
        }), 50);
        const staleSnap = mergeStudentDocKeepingLoanRepayment(
            { bong: 40, loanDueHandledKey: key, bankLoan: null, bankRegularSavings: 3, name: '로컬' },
            { bong: 100, loanDueHandledKey: '', name: '서버', xp: 7 },
        );
        assert.equal(staleSnap.bong, 40);
        assert.equal(staleSnap.loanDueHandledKey, key);
        assert.equal(staleSnap.bankRegularSavings, 3);
        assert.equal(staleSnap.name, '서버');
        assert.equal(staleSnap.xp, 7);
        const laterGain = mergeStudentDocKeepingLoanRepayment(
            { bong: 40, loanDueHandledKey: key },
            { bong: 50, loanDueHandledKey: key, name: '서버' },
        );
        assert.equal(laterGain.bong, 50);
        assert.equal(laterGain.name, '서버');
    });
});

function loanOf(principal, dueYmd, id) {
    return {
        id,
        principal,
        interest: 0,
        days: 1,
        startYmd: '2026-10-01',
        dueYmd,
        rateAtStart: 0,
    };
}

function morningAfterLunch(state, ymd) {
    const life = applyLoanLifecycle(state, ymd, cal);
    const next = {
        ...state,
        ...copyCreditFields(life),
        bong: life.bong,
        bankRegularSavings: life.bankRegularSavings,
        bankLoan: life.bankLoan,
    };
    if (isBankBusinessDay(ymd, cal)) {
        next.bong -= LUNCH_FEE_BONG;
        next.lastLunchDeductDate = ymd;
    }
    return next;
}

describe('확인창 금액과 서버 상환 금액', () => {
    it('화면이 91이어도 서버 점심 날짜가 어제이면 81이고, 다르면 다시 확인한다', () => {
        const today = '2026-10-21';
        const yesterday = '2026-10-20';
        const loan = loanOf(101, '2026-10-22', 'loan_stale');
        const screen = planPartialRepay({
            bong: 101,
            bankRegularSavings: 0,
            bankLoan: loan,
            lastLunchDeductDate: today,
        }, 101, { todayYmd: today, calendar: cal });
        assert.equal(screen.amount, 91);
        assert.equal(screen.left, 10);

        const serverState = {
            bong: 101,
            bankRegularSavings: 0,
            bankLoan: loan,
            lastLunchDeductDate: yesterday,
        };
        const server = planPartialRepay(serverState, 101, {
            todayYmd: today,
            calendar: cal,
            lastLunchDeductDate: yesterday,
        });
        assert.equal(server.amount, 81);
        assert.equal(server.left, 20);
        assert.equal(server.bong, 20);
        assert.equal(repayAmountsMatch(screen.amount, server.amount), false);
        assert.equal(repayAmountsMatch(81, server.amount), true);

        const acted = applyLoanAction(serverState, 'partial', { amount: 101, todayYmd: today, calendar: cal });
        assert.equal(acted.amount, 81);
        assert.equal(acted.bong, 20);
        assert.equal(loanDueTotal(acted.bankLoan), 20);
        assert.equal(serverState.lastLunchDeductDate, yesterday);
        assert.equal(repayAmountsMatch(screen.amount, acted.amount), false);
    });
});

describe('점심값을 남긴 상환은 다음 날 신용불량이 아니다', () => {
    it('지갑 101, 빚 101에서 101을 일부 갚으면 91만 갚고 다음 날 신용불량이 아니다', () => {
        const today = '2026-10-21';
        const loan = loanOf(101, '2026-10-22', 'loan_n2');
        const state = { bong: 101, bankRegularSavings: 0, bankLoan: loan, lastLunchDeductDate: today };
        const plan = planLoanRepayment(state, {
            mode: 'partial', amount: 101, todayYmd: today, calendar: cal,
        });
        assert.equal(plan.ok, true);
        assert.equal(plan.amount, 91);
        assert.equal(plan.left, 10);
        assert.equal(plan.bong, 10);
        assert.equal(plan.full, false);
        const acted = applyLoanAction(state, 'partial', { amount: 101, todayYmd: today, calendar: cal });
        assert.equal(acted.ok, true);
        assert.equal(acted.amount, 91);
        assert.equal(acted.bong, 10);
        assert.equal(loanDueTotal(acted.bankLoan), 10);
        assert.equal(acted.loanLunchShieldAmount, 10);
        const nextDay = morningAfterLunch(acted, '2026-10-22');
        assert.equal(nextDay.bong, 0);
        assert.equal(isStudentCreditDefault(nextDay, '2026-10-22'), false);
    });

    it('해제 뒤 지갑 20에서 20을 일부 갚으면 점심값을 남기고 다음 날 신용불량이 아니다', () => {
        const today = '2026-10-21';
        const loan = loanOf(101, '2026-10-22', 'loan_n3');
        const state = {
            bong: 20,
            bankRegularSavings: 0,
            bankLoan: loan,
            lastLunchDeductDate: today,
            creditReleasedYmd: '2026-10-20',
            creditReleaseLoanId: loan.id,
            creditWalletRecovered: true,
        };
        const plan = planPartialRepay(state, 20, { todayYmd: today, calendar: cal });
        assert.equal(plan.amount, 10);
        assert.equal(plan.bong, 10);
        assert.equal(plan.left, 91);
        assert.ok(plan.bong >= LUNCH_FEE_BONG);
        const acted = applyLoanAction(state, 'partial', { amount: 20, todayYmd: today, calendar: cal });
        assert.equal(acted.bong, 10);
        const nextDay = morningAfterLunch(acted, '2026-10-22');
        assert.equal(nextDay.bong, 0);
        assert.equal(isStudentCreditDefault(nextDay, '2026-10-22'), false);
    });

    it('지갑 50, 예금 60, 빚 101로 12시 이후 처음 접속하면 예금을 먼저 쓰고 다음 날 신용불량이 아니다', () => {
        const today = '2026-10-21';
        const loan = loanOf(101, today, 'loan_n4a');
        const life = applyLoanLifecycle({
            bong: 50,
            bankRegularSavings: 60,
            bankLoan: loan,
            lastLunchDeductDate: '',
        }, today, cal);
        assert.equal(life.bankRegularSavings, 0);
        assert.equal(life.bong, 20);
        assert.equal(loanDueTotal(life.bankLoan), 11);
        const repay = life.msgs.find((m) => m.kind === 'auto_repay');
        assert.equal(repay.paid, 90);
        assert.equal(repay.fromRegular, 60);
        assert.equal(repay.fromWallet, 30);
        assert.equal(life.loanLunchShieldAmount, 11);
        assert.equal(life.msgs.some((m) => m.kind === 'penalty_start'), false);
        const sameDay = morningAfterLunch({ ...life, lastLunchDeductDate: '' }, today);
        assert.equal(sameDay.bong, 10);
        const nextDay = morningAfterLunch(sameDay, '2026-10-22');
        assert.equal(nextDay.bong, 0);
        assert.equal(isStudentCreditDefault(nextDay, '2026-10-22'), false);
    });

    it('만기일 12시 30분에 지갑 101, 빚 101이면 점심값 20을 남기고 다음 날 신용불량이 아니다', () => {
        const today = '2026-10-21';
        const loan = loanOf(101, today, 'loan_n4b');
        const life = applyLoanLifecycle({
            bong: 101,
            bankRegularSavings: 0,
            bankLoan: loan,
            lastLunchDeductDate: '',
        }, today, cal);
        assert.equal(life.bong, 20);
        assert.equal(loanDueTotal(life.bankLoan), 20);
        assert.equal(life.loanLunchShieldAmount, 20);
        assert.equal(life.msgs.some((m) => m.kind === 'penalty_start'), false);
        const noon = morningAfterLunch({ ...life, lastLunchDeductDate: '' }, today);
        assert.equal(noon.bong, 10);
        assert.equal(isStudentCreditDefault(noon, today), false);
        const nextDay = morningAfterLunch(noon, '2026-10-22');
        assert.equal(nextDay.bong, 0);
        assert.equal(isStudentCreditDefault(nextDay, '2026-10-22'), false);
    });

    it('금요일에는 월요일 점심값이라고 적는다', () => {
        const friday = '2026-10-16';
        const loan = loanOf(101, friday, 'loan_fri');
        const plan = planLoanRepayment({
            bong: 101, bankLoan: loan, lastLunchDeductDate: '',
        }, { mode: 'auto', todayYmd: friday, calendar: cal });
        assert.equal(plan.amount, 81);
        assert.equal(plan.left, 20);
        assert.equal(plan.bong, 20);
        assert.deepEqual(plan.lunchParts.map((part) => part.label), ['오늘 점심값', '월요일 점심값']);
        const keepMonday = planRepayLoan({
            bong: 101, bankLoan: loan, lastLunchDeductDate: '',
        }, { todayYmd: friday, calendar: cal });
        assert.deepEqual(keepMonday.lunchParts.map((part) => part.label), ['오늘 점심값', '월요일 점심값']);
        assert.equal(keepMonday.amount, 81);
        assert.equal(keepMonday.bong, 20);
        const sentence = formatLunchHoldSentence(plan.lunchParts, 'B');
        assert.equal(sentence, '오늘 점심값 10B, 월요일 점심값 10B를 남겨 둘게요.');
        assert.match(sentence, /월요일 점심값/);
        assert.doesNotMatch(sentence, /내일/);
    });

    it('만기일 문장은 갚은 금액과 남겨 둔 점심값으로 만든다', () => {
        const today = '2026-10-20';
        const loan = loanOf(101, today, 'loan_due_sentence');
        const plan = planLoanRepayment({
            bong: 101, bankLoan: loan, lastLunchDeductDate: '2026-10-19',
        }, { mode: 'auto', todayYmd: today, calendar: cal });
        assert.equal(plan.amount, 81);
        assert.equal(plan.left, 20);
        assert.deepEqual(plan.lunchParts.map((part) => part.label), ['오늘 점심값', '수요일 점심값']);
        assert.equal(formatDueDayRepaySentence({
            paid: plan.amount,
            unpaid: plan.left,
            lunchParts: plan.lunchParts,
        }, 'B'), '오늘이 갚기로 한 날이라 81B를 먼저 갚았어요. 오늘이랑 수요일 점심값 10B씩은 남겨 뒀고, 빚은 20B 남았어요.');
        assert.equal(formatDueDayRepaySentence({
            paid: 81,
            unpaid: 20,
            lunchParts: [{ label: '수요일 점심값', amount: 10 }],
        }, 'B'), '오늘이 갚기로 한 날이라 81B를 먼저 갚았어요. 수요일 점심값 10B는 남겨 뒀고, 빚은 20B 남았어요.');
        assert.equal(formatDueDayRepaySentence({
            paid: 101, unpaid: 0, lunchParts: plan.lunchParts,
        }, 'B'), '오늘이 갚기로 한 날이라 빌린 돈 101B를 다 갚았어요.');
    });

    it('만기일에 갚기 버튼을 눌러도 자동 상환 결과가 거절되지 않는다', () => {
        const today = '2026-10-21';
        const loan = loanOf(101, today, 'loan_due_click');
        const acted = applyLoanAction({
            bong: 101,
            bankRegularSavings: 0,
            bankLoan: loan,
            lastLunchDeductDate: '',
        }, 'partial', { amount: 101, todayYmd: today, calendar: cal });
        assert.equal(acted.ok, true);
        assert.equal(acted.bong, 20);
        assert.equal(loanDueTotal(acted.bankLoan), 20);
        assert.equal(acted.loanLunchShieldAmount, 20);
        assert.equal(isStudentCreditDefault(acted, today), false);
    });

    it('만기일 12시 30분 첫 접속은 점심을 한 번만 빼고 다음 날 신용불량이 아니다', () => {
        const today = '2026-10-21';
        const yesterday = '2026-10-20';
        const nextDay = '2026-10-22';
        const noon = Date.parse('2026-10-21T03:30:00.000Z');
        const nextNoon = Date.parse('2026-10-22T03:30:00.000Z');
        const loan = loanOf(101, today, 'loan_first_login');
        const start = {
            bong: 101,
            bankRegularSavings: 0,
            bankLoan: loan,
            lastLunchDeductDate: yesterday,
            loanDueHandledKey: '',
            loanLunchShieldLoanId: '',
            loanLunchShieldAmount: 0,
            creditDefaultUntilYmd: '',
            bankNegativeSinceYmd: '',
        };
        const staleClient = planLoanRepayment({
            ...start,
            lastLunchDeductDate: today,
        }, {
            mode: 'auto',
            todayYmd: today,
            calendar: cal,
            lastLunchDeductDate: start.lastLunchDeductDate,
        });
        assert.equal(staleClient.reserveLunch, 20);
        assert.equal(staleClient.bong, 20);

        const applyLunch = (doc, nowMs) => {
            const plan = planServerLunchDeduction({
                serverBong: doc.bong,
                serverLunchDate: doc.lastLunchDeductDate,
                nowMs,
            });
            if (!plan.deduct) return { ...doc, deducted: false };
            const credit = walletCreditAfterFinalBong(doc, plan.bong, plan.today);
            return {
                ...doc,
                ...credit,
                bong: plan.bong,
                lastLunchDeductDate: plan.lastLunchDeductDate,
                deducted: true,
            };
        };
        const applyRepay = (doc) => {
            const life = applyLoanLifecycle({
                ...doc,
                lastLunchDeductDate: doc.lastLunchDeductDate,
            }, today, cal);
            return {
                ...doc,
                bong: life.bong,
                bankRegularSavings: life.bankRegularSavings,
                bankLoan: life.bankLoan,
                ...copyCreditFields(life),
            };
        };

        ['repay-first', 'lunch-first'].forEach((order) => {
            let doc = { ...start, bankLoan: { ...loan } };
            let lunchCount = 0;
            const repay = () => { doc = applyRepay(doc); };
            const lunch = (nowMs) => {
                const next = applyLunch(doc, nowMs);
                if (next.deducted) lunchCount += 1;
                doc = next;
            };
            if (order === 'repay-first') {
                repay();
                lunch(noon);
            } else {
                lunch(noon);
                repay();
            }
            lunch(noon);
            assert.equal(lunchCount, 1, order);
            assert.equal(doc.bong, 10, order);
            assert.equal(doc.lastLunchDeductDate, today, order);
            assert.equal(loanDueTotal(doc.bankLoan), 20, order);
            assert.equal(doc.loanLunchShieldAmount, 20, order);
            assert.equal(isStudentCreditDefault(doc, today), false, order);
            assert.equal(capBongIncrease(doc.bong, 101, 0), 10, order);
            assert.equal(laterLunchDate(doc.lastLunchDeductDate, yesterday, today), today, order);
            const tomorrow = applyLunch(doc, nextNoon);
            assert.equal(tomorrow.deducted, true, order);
            assert.equal(tomorrow.bong, 0, order);
            assert.equal(tomorrow.lastLunchDeductDate, nextDay, order);
            const judged = creditJudgedOnFinalBong({
                beforeState: start,
                lifecycle: { ...doc, bong: 20 },
                finalBong: doc.bong,
                todayYmd: today,
                calendar: cal,
            });
            assert.equal(isStudentCreditDefault({ ...tomorrow, ...judged, bong: tomorrow.bong }, nextDay), false, order);
        });
    });

    it('알림 키는 서버에 없는 것만 새로 차지한다', () => {
        const once = claimLoanNoticesForSave([], ['old'], ['auto|a']);
        assert.deepEqual(once.claimed, ['auto|a']);
        assert.deepEqual(once.merged, ['old', 'auto|a']);
        const twice = claimLoanNoticesForSave(once.merged, once.merged, ['auto|a']);
        assert.deepEqual(twice.claimed, []);
        assert.deepEqual(twice.merged, once.merged);
    });
});

describe('만기일 점심과 상환은 순서가 달라도 같다', () => {
    const noon = Date.parse('2026-10-21T03:30:00.000Z');
    const nextNoon = Date.parse('2026-10-22T03:30:00.000Z');

    function sameEnd(start, today, nextDay) {
        const opts = { nowMs: noon, todayYmd: today, calendar: cal };
        const lunchFirst = settleLunchAndLoan(start, opts);
        const repayFirst = repayBeforeLunch(start, opts);
        assert.equal(lunchFirst.bong, repayFirst.bong);
        assert.equal(lunchFirst.lastLunchDeductDate, repayFirst.lastLunchDeductDate);
        assert.equal(loanDueTotal(lunchFirst.bankLoan), loanDueTotal(repayFirst.bankLoan));
        assert.equal(lunchFirst.loanLunchShieldAmount, repayFirst.loanLunchShieldAmount);
        assert.equal(isStudentCreditDefault(lunchFirst, today), isStudentCreditDefault(repayFirst, today));
        const nextOpts = { nowMs: nextNoon, todayYmd: nextDay, calendar: cal };
        const nextLunch = settleLunchAndLoan(lunchFirst, nextOpts);
        const nextRepay = settleLunchAndLoan(repayFirst, nextOpts);
        assert.equal(nextLunch.bong, nextRepay.bong);
        return { due: lunchFirst, next: nextLunch };
    }

    it('D: 지갑 101, 빚 101이면 만기일 10, 다음 날 0이고 신용불량이 아니다', () => {
        const today = '2026-10-21';
        const end = sameEnd({
            bong: 101,
            bankRegularSavings: 0,
            bankLoan: loanOf(101, today, 'loan_d'),
            lastLunchDeductDate: '2026-10-20',
        }, today, '2026-10-22');
        assert.equal(end.due.bong, 10);
        assert.equal(loanDueTotal(end.due.bankLoan), 20);
        assert.equal(end.due.loanLunchShieldAmount, 20);
        assert.equal(end.due.lastLunchDeductDate, today);
        assert.equal(isStudentCreditDefault(end.due, today), false);
        assert.equal(end.next.bong, 0);
        assert.equal(isStudentCreditDefault(end.next, '2026-10-22'), false);
    });

    it('C: 지갑 50, 예금 60이면 만기일 10, 다음 날 0이다', () => {
        const today = '2026-10-21';
        const end = sameEnd({
            bong: 50,
            bankRegularSavings: 60,
            bankLoan: loanOf(101, today, 'loan_c'),
            lastLunchDeductDate: '2026-10-20',
        }, today, '2026-10-22');
        assert.equal(end.due.bong, 10);
        assert.equal(end.due.bankRegularSavings, 0);
        assert.equal(loanDueTotal(end.due.bankLoan), 11);
        assert.equal(end.due.loanLunchShieldAmount, 11);
        assert.equal(isStudentCreditDefault(end.due, today), false);
        assert.equal(end.next.bong, 0);
        assert.equal(isStudentCreditDefault(end.next, '2026-10-22'), false);
    });

    it('AD: 금요일 점심이 한 번만 빠져 지갑이 0이고 신용불량이 아니다', () => {
        const friday = '2026-10-23';
        const fridayNoon = Date.parse('2026-10-23T03:30:00.000Z');
        const start = {
            bong: 10,
            bankRegularSavings: 0,
            bankLoan: loanOf(10, friday, 'loan_ad'),
            lastLunchDeductDate: '2026-10-22',
            loanLunchShieldLoanId: 'loan_ad',
            loanLunchShieldAmount: 10,
        };
        const opts = { nowMs: fridayNoon, todayYmd: friday, calendar: cal };
        const lunchFirst = settleLunchAndLoan(start, opts);
        const repayFirst = repayBeforeLunch(start, opts);
        [lunchFirst, repayFirst].forEach((end) => {
            assert.equal(end.bong, 0);
            assert.equal(end.lastLunchDeductDate, friday);
            assert.equal(loanDueTotal(end.bankLoan), 10);
            assert.equal(end.loanLunchShieldAmount, 10);
            assert.equal(isStudentCreditDefault(end, friday), false);
            assert.equal(end.lunchDeducted, true);
        });
        const again = settleLunchAndLoan(lunchFirst, opts);
        assert.equal(again.lunchDeducted, false);
        assert.equal(again.bong, 0);
    });

    it('M1: 점심을 이미 낸 지갑 91, 빚 101은 신용불량이 아니고 방패가 20이다', () => {
        const today = '2026-10-21';
        const start = {
            bong: 91,
            bankRegularSavings: 0,
            bankLoan: loanOf(101, today, 'loan_m1'),
            lastLunchDeductDate: today,
        };
        const life = applyLoanLifecycle(start, today, cal);
        assert.equal(life.bong, 10);
        assert.equal(loanDueTotal(life.bankLoan), 20);
        assert.equal(life.loanLunchShieldAmount, 20);
        assert.equal(life.msgs.some((m) => m.kind === 'penalty_start'), false);
        assert.equal(isStudentCreditDefault(life, today), false);
        const opts = { nowMs: noon, todayYmd: today, calendar: cal };
        const lunchFirst = settleLunchAndLoan(start, opts);
        const repayFirst = repayBeforeLunch(start, opts);
        assert.equal(lunchFirst.bong, 10);
        assert.equal(repayFirst.bong, 10);
        assert.equal(lunchFirst.loanLunchShieldAmount, 20);
        assert.equal(repayFirst.loanLunchShieldAmount, 20);
        assert.equal(isStudentCreditDefault(lunchFirst, today), false);
        assert.equal(isStudentCreditDefault(repayFirst, today), false);
    });

    it('오래된 화면의 20이 점심을 뺀 10을 되돌리지 않는다', () => {
        const today = '2026-10-21';
        assert.equal(bongPreservingCommittedLunch({
            serverBong: 10,
            proposedBong: 20,
            serverLunchDate: today,
            clientLunchDate: '2026-10-20',
            todayYmd: today,
        }), 10);
        assert.equal(bongPreservingCommittedLunch({
            serverBong: 0,
            proposedBong: -10,
            serverLunchDate: '2026-10-23',
            clientLunchDate: '2026-10-22',
            todayYmd: '2026-10-23',
        }), 0);
        assert.equal(bongPreservingCommittedLunch({
            serverBong: 10,
            proposedBong: 20,
            serverLunchDate: today,
            clientLunchDate: today,
            todayYmd: today,
            allowedIncrease: 10,
        }), 20);
    });
});

describe('점심값으로 남긴 빚은 주급에서 조금씩 걷는다', () => {
    it('만기가 지나도 신용불량이 아니고, 주급을 받을 때 다음 점심값은 남긴다', () => {
        const due = '2026-10-21';
        const shielded = applyLoanLifecycle({
            bong: 91,
            bankRegularSavings: 0,
            bankLoan: loanOf(101, due, 'loan_m8'),
            lastLunchDeductDate: due,
        }, due, cal);
        assert.equal(shielded.loanLunchShieldAmount, 20);
        const later = '2026-11-20';
        const still = applyLoanLifecycle({
            ...shielded,
            lastLunchDeductDate: '2026-11-19',
        }, later, cal);
        assert.equal(isStudentCreditDefault(still, later), false);
        assert.equal(loanDueTotal(still.bankLoan), 20);

        const friday = '2026-10-23';
        const small = collectShieldedDebtFromSalary({
            ...shielded,
            bong: 10,
            lastLunchDeductDate: friday,
        }, { salary: 15, todayYmd: friday, calendar: cal });
        assert.equal(small.salaryPaid, 15);
        assert.equal(small.collected, 15);
        assert.equal(small.bong, 10);
        assert.equal(loanDueTotal(small.bankLoan), 5);
        assert.equal(small.loanLunchShieldAmount, 5);
        assert.equal(isStudentCreditDefault({ ...shielded, ...small }, friday), false);

        const done = collectShieldedDebtFromSalary({
            ...shielded,
            bong: 10,
            lastLunchDeductDate: friday,
        }, { salary: 30, todayYmd: friday, calendar: cal });
        assert.equal(done.collected, 20);
        assert.equal(done.bong, 20);
        assert.equal(done.bankLoan, null);
        assert.equal(done.loanLunchShieldAmount, 0);
    });

    it('전부 갚기와 점심값만 남기고 갚기 확인 문장이 다르다', () => {
        const today = '2026-10-20';
        const loan = loanOf(101, '2026-10-23', 'loan_btn');
        const clear = planClearLoan({
            bong: 101, bankLoan: loan, lastLunchDeductDate: today,
        }, { todayYmd: today, calendar: cal });
        assert.equal(clear.amount, 101);
        assert.equal(clear.left, 0);
        assert.equal(clear.bong, 0);
        assert.equal(clear.reserveLunch, 0);
        assert.equal(formatClearRepayConfirm(clear.amount, 'B'), '지갑에서 101B를 모두 갚을까요?\n빚은 0이 돼요.\n다음 점심값은 따로 남겨 두지 않아요.');

        const keep = planRepayLoan({
            bong: 101, bankLoan: loan, lastLunchDeductDate: today,
        }, { todayYmd: today, calendar: cal });
        assert.equal(keep.amount, 91);
        assert.equal(keep.left, 10);
        assert.equal(keep.bong, 10);
        assert.deepEqual(keep.lunchParts.map((part) => part.label), ['수요일 점심값']);
        assert.equal(formatPromiseDay('2026-10-23'), '10월 23일(금)');
        assert.equal(formatKeepLunchConfirm({
            amount: keep.amount,
            left: keep.left,
            dueYmd: '2026-10-23',
            lunchParts: keep.lunchParts,
            unit: 'B',
        }), '91B를 갚을까요?\n그러면 빚이 10B 남아요.\n이 10B는 10월 23일(금)까지 갚으면 돼요.\n수요일 점심값 10B는 지갑에 남겨 둘게요.');
        assert.equal(formatWithheldLunchLine(20, 10, 10, 'B'), '적은 20B 중 점심값 10B는 남기고 10B만 갚아요.');
        assert.equal(formatDebtLeftSentence(10, '2026-10-23', 'B'), '그러면 빚이 10B 남아요.\n이 10B는 10월 23일(금)까지 갚으면 돼요.');
        assert.equal(formatDebtLeftSentence(10, '2026-10-23', 'B', { done: true }), '이제 빚이 10B 남았어요.\n이 10B는 10월 23일(금)까지 갚으면 돼요.');
        assert.equal(formatLunchWalletSentence([{ label: '수요일 점심값', amount: 10 }], 'B'), '수요일 점심값 10B는 지갑에 남겨 둘게요.');

        const beforeLunch = planRepayLoan({
            bong: 101, bankLoan: loan, lastLunchDeductDate: '2026-10-19',
        }, { todayYmd: today, calendar: cal });
        assert.deepEqual(beforeLunch.lunchParts.map((part) => part.label), ['오늘 점심값', '수요일 점심값']);
        assert.equal(beforeLunch.amount, 81);
        assert.equal(beforeLunch.bong, 20);
        assert.equal(beforeLunch.left, 20);
        const noon = Date.parse('2026-10-20T03:30:00.000Z');
        const afterLunch = settleLunchAndLoan({
            bong: beforeLunch.bong,
            bankRegularSavings: 0,
            bankLoan: beforeLunch.loan,
            lastLunchDeductDate: '2026-10-19',
            loanLunchShieldLoanId: beforeLunch.loan && beforeLunch.loan.id,
            loanLunchShieldAmount: beforeLunch.left,
        }, { nowMs: noon, todayYmd: today, calendar: cal });
        assert.equal(afterLunch.bong, 10);
        assert.equal(afterLunch.lastLunchDeductDate, today);
        assert.equal(isStudentCreditDefault(afterLunch, today), false);
        const nextDay = '2026-10-21';
        const next = settleLunchAndLoan(afterLunch, {
            nowMs: Date.parse('2026-10-21T03:30:00.000Z'),
            todayYmd: nextDay,
            calendar: cal,
        });
        assert.equal(next.bong, 0);
        assert.equal(isStudentCreditDefault(next, nextDay), false);
        assert.equal(formatSalaryCollectionNotice({ salary: 12, collected: 2, left: 8, unit: 'B' }), '주급 12B가 들어왔어요.\n점심값으로 남겨 둔 빚 2B를 주급에서 갚았어요. 남은 빚은 8B예요.');
    });
});

describe('갚기 안내 문장', () => {
    it('전부 갚아 지갑이 다음 점심값보다 적으면 경고하고, 충분하면 경고하지 않는다', () => {
        const today = '2026-10-22';
        const loan = loanOf(101, '2026-10-23', 'loan_warn');
        const clear = planClearLoan({
            bong: 101,
            bankLoan: loan,
            lastLunchDeductDate: today,
        }, { todayYmd: today, calendar: cal });
        assert.equal(clear.ok, true);
        assert.equal(clear.amount, 101);
        assert.equal(clear.bong, 0);
        assert.equal(clear.left, 0);
        assert.equal(clear.reserveLunch, 0);
        const warned = formatClearRepayConfirm(clear.amount, 'B', {
            walletAfter: clear.bong,
            todayYmd: today,
            calendar: cal,
            lastLunchDeductDate: today,
        });
        assert.equal(warned, '지갑에서 101B를 모두 갚을까요?\n빚은 0이 돼요.\n다음 점심값은 따로 남겨 두지 않아요.\n다 갚으면 지갑이 0B가 돼서 내일 점심값 10B를 못 낼 수 있어요. 걱정되면 \'점심값만 남기고 갚기\'를 눌러 주세요.');
        const short = formatClearLunchWarning({
            walletAfter: 4,
            todayYmd: today,
            calendar: cal,
            lastLunchDeductDate: today,
            unit: 'B',
        });
        assert.match(short, /지갑이 4B만 남아서 내일 점심값 10B를 못 낼 수 있어요/);
        const safe = formatClearRepayConfirm(80, 'B', {
            walletAfter: 10,
            todayYmd: today,
            calendar: cal,
            lastLunchDeductDate: today,
        });
        assert.equal(safe, '지갑에서 80B를 모두 갚을까요?\n빚은 0이 돼요.\n다음 점심값은 따로 남겨 두지 않아요.');
        const friday = formatClearLunchWarning({
            walletAfter: 0,
            todayYmd: '2026-10-23',
            calendar: cal,
            lastLunchDeductDate: '2026-10-23',
            unit: 'B',
        });
        assert.match(friday, /월요일 점심값 10B를 못 낼 수 있어요/);
        assert.doesNotMatch(friday, /내일/);
    });

    it('일부 갚기가 점심값 때문에 거절되면 금액과 이유를 말한다', () => {
        const today = '2026-10-22';
        const blocked = applyLoanAction({
            bong: 10,
            bankRegularSavings: 0,
            bankLoan: loanOf(50, '2026-10-23', 'loan_block'),
            lastLunchDeductDate: today,
        }, 'partial', { todayYmd: today, calendar: cal, amount: 10 });
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'lunch');
        assert.equal(blocked.bong, 10);
        assert.equal(loanDueTotal(blocked.bankLoan), 50);
        assert.equal(blocked.lunchParts[0].amount, 10);
        assert.equal(formatLunchRepayBlocked(blocked.lunchParts, 'B'), '금요일 점심값 10B를 남겨 둬야 해서, 지금은 갚을 수 없어요.');
        const two = planPartialRepay({
            bong: 15,
            bankLoan: loanOf(50, '2026-10-23', 'loan_two'),
            lastLunchDeductDate: '2026-10-21',
        }, 15, { todayYmd: today, calendar: cal });
        assert.equal(two.ok, false);
        assert.equal(two.reason, 'lunch');
        assert.equal(formatLunchRepayBlocked(two.lunchParts, 'B'), '오늘 점심값 10B, 금요일 점심값 10B를 남겨 둬야 해서, 지금은 갚을 수 없어요.');
    });

    it('완료창은 이제로 말하고, 지난 약속일은 지났다고 말한다', () => {
        assert.equal(formatClearRepayDone(101, 'B'), '101B를 모두 갚았어요. 이제 빚은 0이에요.');
        assert.equal(formatKeepLunchDone({
            amount: 91,
            left: 10,
            dueYmd: '2026-10-23',
            lunchParts: [{ label: '수요일 점심값', amount: 10 }],
            unit: 'B',
        }), '91B를 갚았어요.\n이제 빚이 10B 남았어요.\n이 10B는 10월 23일(금)까지 갚으면 돼요.\n수요일 점심값 10B는 지갑에 남겨 뒀어요.');
        assert.equal(formatPartialRepayDone({
            amount: 10,
            left: 40,
            dueYmd: '2026-10-23',
            unit: 'B',
        }), '10B를 갚았어요.\n이제 빚이 40B 남았어요.\n이 40B는 10월 23일(금)까지 갚으면 돼요.');
        assert.equal(formatPartialRepayDone({ amount: 50, left: 0, unit: 'B' }), '50B를 모두 갚았어요. 이제 빚은 0이에요.');
        assert.equal(formatPastPromiseLine('10월 21일(수)'), '약속한 날이 지났어요. 그날은 10월 21일(수)예요.');
        assert.equal(
            formatDebtLeftSentence(10, '2026-10-21', 'B', { done: true, todayYmd: '2026-10-22' }),
            '이제 빚이 10B 남았어요.\n약속한 날이 지났어요. 그날은 10월 21일(수)예요.',
        );
        assert.doesNotMatch(formatPastPromiseLine('10월 21일(수)'), /까지 갚으면 돼요/);
    });

    it('날짜와 요일 괄호 뒤 조사는 끝소리 받침에 맞춘다', () => {
        assert.equal(formatPromiseDay('2026-10-21'), '10월 21일(수)');
        assert.equal(koreanTopicParticle('10월 21일'), '은');
        assert.equal(koreanTopicParticle('10월 21일(일)'), '은');
        assert.equal(koreanTopicParticle('10월 21일(월)'), '은');
        assert.equal(koreanTopicParticle('10월 21일(화)'), '는');
        assert.equal(koreanTopicParticle('10월 21일(수)'), '는');
        assert.equal(koreanTopicParticle('10월 21일(목)'), '은');
        assert.equal(koreanTopicParticle('10월 23일(금)'), '은');
        assert.equal(koreanTopicParticle('10월 21일(토)'), '는');
        assert.equal(koreanTopicParticle('B'), '는');
        assert.equal(koreanCopula('10월 21일(수)'), '예요');
        assert.equal(koreanCopula('10월 23일(금)'), '이에요');
        assert.equal(koreanCopula('10월 21일'), '이에요');
        assert.equal(koreanCopula('B'), '이에요');
    });
});
