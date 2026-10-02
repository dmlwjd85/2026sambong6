import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CREDIT_DEFAULT_CALENDAR_DAYS,
    LOAN_LIMIT_DEFAULT,
    LOAN_MIN_INTEREST,
    LOAN_MIN_UNIT,
    addBusinessDaysYmd,
    addCalendarDaysYmd,
    applyLoanAction,
    applyLoanLifecycle,
    collectLoanRepayment,
    computeLoanInterest,
    countBusinessDaysAfter,
    creditDefaultBlockMessage,
    getLoanCalendarFromWorld,
    isBankBusinessDay,
    isCreditDefaultOn,
    bongAfterAccrualWithIntent,
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

    it('약정일이 되면 대출을 지우고 자동이체한다', () => {
        const loan = planTakeLoan({
            amount: 20, days: 1, ratePercent: 0, limit: 50, todayYmd: '2026-09-14', calendar: cal,
        }).loan;
        const due = applyLoanLifecycle({
            bong: 5,
            bankRegularSavings: 10,
            bankLoan: loan,
        }, loan.dueYmd, cal);
        assert.equal(due.bankLoan, null);
        assert.equal(due.bankRegularSavings, 0);
        assert.ok(due.bong <= 0);
        assert.ok(due.msgs.some((m) => m.kind === 'repay'));
    });

    it('마이너스 5영업일이 지나면 3일 신용불량이 된다', () => {
        const start = '2026-09-14';
        const fifth = addBusinessDaysYmd(start, 5, cal);
        const hit = applyLoanLifecycle({
            bong: -3,
            bankRegularSavings: 0,
            bankLoan: null,
            bankNegativeSinceYmd: start,
        }, fifth, cal);
        assert.equal(isCreditDefaultOn(hit, fifth), true);
        assert.equal(hit.creditDefaultUntilYmd, addCalendarDaysYmd(fifth, CREDIT_DEFAULT_CALENDAR_DAYS));
        assert.match(creditDefaultBlockMessage(hit.creditDefaultUntilYmd), /신용불량/);
        const recovered = applyLoanLifecycle({
            bong: 10,
            bankRegularSavings: 0,
            bankNegativeSinceYmd: start,
        }, '2026-09-15', cal);
        assert.equal(recovered.bankNegativeSinceYmd, '');
        assert.equal(isCreditDefaultOn(recovered, '2026-09-15'), false);
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
    });
});

describe('정산 뒤 지갑 증감', () => {
    it('예금 보너스가 붙어도 점심값 10봉은 정산 잔액에서 빠진다', () => {
        assert.equal(bongAfterAccrualWithIntent(101, 90, 100, {
            allowDecrease: true,
            maxDecrease: 10,
        }), 91);
    });

    it('상한이 있는 환급은 정산 잔액 위에 올라간다', () => {
        assert.equal(bongAfterAccrualWithIntent(101, 110, 100, {
            maxIncrease: 10,
        }), 111);
    });

    it('이번 저장이 깎거나 올리지 않으면 정산 잔액만 남긴다', () => {
        assert.equal(bongAfterAccrualWithIntent(101, 140, 100, {
            allowDecrease: true,
            maxDecrease: 10,
        }), 101);
        assert.equal(bongAfterAccrualWithIntent(80, 90, 100, {
            maxIncrease: 0,
        }), 80);
    });
});
