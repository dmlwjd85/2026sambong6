import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    holidayLunchRefundAmount,
    isSchoolHolidayYmd,
    monthGrid,
    resolveSchoolHolidays,
    termMaturityYmd,
} from './schoolCalendar.js';

describe('공휴일 달력', () => {
    it('저장값이 없으면 추석을 공휴일로 본다', () => {
        const days = resolveSchoolHolidays({});
        assert.equal(isSchoolHolidayYmd('2026-09-24', days), true);
        assert.equal(isSchoolHolidayYmd('2026-09-25', days), true);
        assert.equal(isSchoolHolidayYmd('2026-09-23', days), false);
    });

    it('선생님이 해제한 날은 공휴일이 아니다', () => {
        const days = resolveSchoolHolidays({ schoolHolidays: ['2026-10-09'] });
        assert.equal(isSchoolHolidayYmd('2026-09-24', days), false);
        assert.equal(isSchoolHolidayYmd('2026-10-09', days), true);
    });

    it('달력 칸은 1일이 요일 위치에 온다', () => {
        const cells = monthGrid(2026, 8);
        const first = cells.find((c) => c);
        assert.equal(first.ymd, '2026-09-01');
        assert.equal(first.dow, 2);
    });
});

describe('적금 만기일', () => {
    it('가입일로부터 30일째가 만기일이다', () => {
        assert.equal(termMaturityYmd('2026-08-27'), '2026-09-26');
        assert.equal(termMaturityYmd('2026-09-01'), '2026-10-01');
    });
});

describe('공휴일 점심값 환급', () => {
    const holidays = ['2026-09-24'];

    it('공휴일에 10봉만 빠졌으면 10봉을 돌려준다', () => {
        const logs = [{ at: Date.parse('2026-09-24T12:00:00+09:00'), delta: -10, reason: '저장', source: 'saveDataToCloud' }];
        assert.equal(holidayLunchRefundAmount(logs, '2026-09-24', holidays), 10);
    });

    it('대출 만기 로그로 10봉이 돌아왔으면 다시 주지 않는다', () => {
        const logs = [
            { at: Date.parse('2026-09-24T13:42:00+09:00'), delta: -10, reason: '저장', source: 'saveDataToCloud' },
            { at: Date.parse('2026-09-24T13:42:10+09:00'), delta: 10, reason: '은행 대출 만기 자동이체', source: 'bankLoanDue' },
        ];
        assert.equal(holidayLunchRefundAmount(logs, '2026-09-24', holidays), 0);
    });

    it('이미 공휴일 환급 로그가 있으면 다시 주지 않는다', () => {
        const logs = [
            { at: Date.parse('2026-09-24T12:00:00+09:00'), delta: -10, reason: '저장', source: 'saveDataToCloud' },
            { at: Date.parse('2026-09-24T15:00:00+09:00'), delta: 10, reason: '공휴일 점심값 환급', source: 'holidayLunchRefund' },
        ];
        assert.equal(holidayLunchRefundAmount(logs, '2026-09-24', holidays), 0);
    });

    it('평일에는 환급하지 않는다', () => {
        const logs = [{ at: Date.parse('2026-09-23T12:00:00+09:00'), delta: -10, reason: '저장' }];
        assert.equal(holidayLunchRefundAmount(logs, '2026-09-23', holidays), 0);
    });
});
