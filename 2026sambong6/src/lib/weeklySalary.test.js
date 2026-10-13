import test from 'node:test';
import assert from 'node:assert/strict';
import { isSalaryPayWindow, MAX_WEEKLY_SALARY_BONG, planStudentSalaryPayment, recentSalaryWeekId, salaryWeekId } from './weeklySalary.js';

test('금요일 15시 이후와 주말에만 주급 창이 열린다', () => {
    assert.equal(isSalaryPayWindow(new Date(2026, 9, 9, 14, 59)), false);
    assert.equal(isSalaryPayWindow(new Date(2026, 9, 9, 15, 0)), true);
    assert.equal(isSalaryPayWindow(new Date(2026, 9, 10, 9, 0)), true);
    assert.equal(isSalaryPayWindow(new Date(2026, 9, 11, 9, 0)), true);
    assert.equal(isSalaryPayWindow(new Date(2026, 9, 12, 9, 0)), false);
});

test('토·일은 직전 금요일 키를 쓴다', () => {
    const friday = salaryWeekId(new Date(2026, 9, 9, 16, 0));
    assert.equal(friday, 'SALARY_2026_10_09');
    assert.equal(salaryWeekId(new Date(2026, 9, 10, 11, 0)), friday);
    assert.equal(salaryWeekId(new Date(2026, 9, 11, 11, 0)), friday);
});

test('같은 주 표식이 있으면 다시 지급하지 않는다', () => {
    const weekId = 'SALARY_2026_10_09';
    assert.deepEqual(
        planStudentSalaryPayment({ salaryPaidWeek: weekId, weekId, legacyWeekSettled: false, pay: 12 }),
        { action: 'skip' },
    );
});

test('예전 전역 정산만 된 주는 금액 없이 표식만 남긴다', () => {
    assert.deepEqual(
        planStudentSalaryPayment({
            salaryPaidWeek: '',
            weekId: 'SALARY_2026_10_09',
            legacyWeekSettled: true,
            pay: 12,
        }),
        { action: 'mark' },
    );
});

test('최근 주급 키는 한국 시간 지급 창의 금요일이다', () => {
    assert.equal(recentSalaryWeekId(new Date('2026-10-12T00:00:00+09:00')), 'SALARY_2026_10_09');
    assert.equal(recentSalaryWeekId(new Date('2026-10-16T14:59:00+09:00')), 'SALARY_2026_10_09');
    assert.equal(recentSalaryWeekId(new Date('2026-10-16T15:00:00+09:00')), 'SALARY_2026_10_16');
    assert.equal(recentSalaryWeekId(new Date('2026-10-17T09:00:00+09:00')), 'SALARY_2026_10_16');
    assert.equal(recentSalaryWeekId(new Date('2026-10-18T21:00:00+09:00')), 'SALARY_2026_10_16');
});

test('주급은 상한을 넘기지 않는다', () => {
    assert.deepEqual(
        planStudentSalaryPayment({ salaryPaidWeek: '', weekId: 'SALARY_2026_10_09', legacyWeekSettled: false, pay: 999 }),
        { action: 'pay', amount: MAX_WEEKLY_SALARY_BONG },
    );
    assert.deepEqual(
        planStudentSalaryPayment({ salaryPaidWeek: '', weekId: 'not-a-week', legacyWeekSettled: false, pay: 10 }),
        { action: 'skip' },
    );
});

test('새 주에는 양수 주급만 지급한다', () => {
    assert.deepEqual(
        planStudentSalaryPayment({ salaryPaidWeek: 'SALARY_2026_10_02', weekId: 'SALARY_2026_10_09', legacyWeekSettled: false, pay: 8.2 }),
        { action: 'pay', amount: 8 },
    );
    assert.deepEqual(
        planStudentSalaryPayment({ salaryPaidWeek: '', weekId: 'SALARY_2026_10_09', legacyWeekSettled: false, pay: 0 }),
        { action: 'mark' },
    );
});
