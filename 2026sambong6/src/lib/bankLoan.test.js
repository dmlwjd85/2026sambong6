import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    formatLunchHoldSentence,
    planLoanRepayment,
    planPartialRepay,
    planRepayLoan,
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

    it('다 갚기는 지갑 안에서만 갚고 예금은 쓰지 않는다', () => {
        const loan = planTakeLoan({
            amount: 40, days: 1, ratePercent: 0, limit: 100, todayYmd: '2026-09-14', calendar: cal,
        }).loan;
        const due = loan.principal + loan.interest;
        assert.ok(due > 10);
        const plan = planRepayLoan({ bong: 10, bankRegularSavings: 80, bankLoan: loan });
        assert.equal(plan.ok, true);
        assert.equal(plan.full, false);
        assert.equal(plan.amount, 10);
        assert.equal(plan.bong, 0);
        assert.equal(plan.regular, 80);
        assert.equal(plan.fromRegular, 0);
        assert.ok(plan.bong >= 0);
        assert.equal(planRepayLoan({ bong: 0, bankRegularSavings: 80, bankLoan: loan }).reason, 'funds');
        assert.equal(planRepayLoan({ bong: -3, bankRegularSavings: 80, bankLoan: loan }).reason, 'funds');
        const full = planRepayLoan({ bong: due + 5, bankRegularSavings: 80, bankLoan: loan });
        assert.equal(full.full, true);
        assert.equal(full.loan, null);
        assert.equal(full.bong, 5);
        assert.equal(full.regular, 80);
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
        const plan = planRepayLoan({
            bong: 101, bankLoan: loan, lastLunchDeductDate: '',
        }, { todayYmd: friday, calendar: cal });
        assert.equal(plan.amount, 81);
        assert.equal(plan.left, 20);
        assert.equal(plan.bong, 20);
        assert.deepEqual(plan.lunchParts.map((part) => part.label), ['오늘 점심값', '월요일 점심값']);
        const sentence = formatLunchHoldSentence(plan.lunchParts, 'B');
        assert.equal(sentence, '오늘 점심값 10B, 월요일 점심값 10B를 남겨 둘게요.');
        assert.match(sentence, /월요일 점심값/);
        assert.doesNotMatch(sentence, /내일/);
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

    it('알림 키는 서버에 없는 것만 새로 차지한다', () => {
        const once = claimLoanNoticesForSave([], ['old'], ['auto|a']);
        assert.deepEqual(once.claimed, ['auto|a']);
        assert.deepEqual(once.merged, ['old', 'auto|a']);
        const twice = claimLoanNoticesForSave(once.merged, once.merged, ['auto|a']);
        assert.deepEqual(twice.claimed, []);
        assert.deepEqual(twice.merged, once.merged);
    });
});
