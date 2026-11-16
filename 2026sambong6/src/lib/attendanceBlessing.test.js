import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyAttendanceDayMark,
    attendanceDimsCard,
    attendanceMarkForToday,
    buildAttendanceSheetRows,
    planAttendanceChange,
    planAttendanceWrite,
    projectAttendanceDays,
} from './attendanceBlessing.js';

describe('출석의 축복', () => {
    it('출석·지각·조퇴·결석 보상을 계산하고 같은 선택은 되돌린다', () => {
        const present = planAttendanceChange('', 'present');
        assert.equal(present.xpDelta, 8);
        assert.equal(present.bongDelta, 1);
        assert.equal(present.dim, false);
        const late = planAttendanceChange('present', 'late');
        assert.equal(late.xpDelta, -13);
        assert.equal(late.bongDelta, -1);
        assert.equal(attendanceDimsCard('early'), true);
        assert.equal(attendanceDimsCard('absent'), true);
        assert.equal(attendanceDimsCard('late'), false);
        const cleared = planAttendanceChange('absent', 'absent');
        assert.equal(cleared.status, '');
        assert.equal(cleared.xpDelta, 10);
        assert.equal(planAttendanceChange('', 'nope').ok, false);
    });

    it('오늘 표시만 광장에 쓰고 엑셀 행을 만든다', () => {
        assert.equal(attendanceMarkForToday({ date: '2026-10-10', status: 'early' }, '2026-10-10'), 'early');
        assert.equal(attendanceMarkForToday({ date: '2026-10-09', status: 'early' }, '2026-10-10'), '');
        const rows = buildAttendanceSheetRows({
            '2026-10-10': { '3': 'present', '7': 'absent' },
        }, [
            { id: '3', number: 3, name: '김삼봉' },
            { id: '7', number: 7, name: '이봉이' },
        ]);
        assert.equal(rows.length, 3);
        assert.equal(rows[1][2], '김삼봉');
        assert.equal(rows[1][3], '출석');
        assert.equal(rows[2][4], -10);
    });

    it('학생을 잇달아 찍어도 양쪽 기록이 남고 오래된 날짜는 잘린다', () => {
        const first = applyAttendanceDayMark({}, '2026-10-10', '3', 'present');
        const second = applyAttendanceDayMark(first.days, '2026-10-10', '7', 'absent');
        assert.equal(second.ok, true);
        assert.equal(second.days['2026-10-10']['3'], 'present');
        assert.equal(second.days['2026-10-10']['7'], 'absent');
        assert.equal(second.plan.xpDelta, -10);
        const again = applyAttendanceDayMark(second.days, '2026-10-10', '3', 'present');
        assert.equal(again.plan.status, '');
        assert.equal(again.days['2026-10-10']['3'], undefined);
        assert.equal(again.days['2026-10-10']['7'], 'absent');

        const dated = {};
        for (let n = 0; n < 121; n += 1) {
            const dt = new Date(Date.UTC(2024, 0, 1 + n));
            dated[dt.toISOString().slice(0, 10)] = { '1': 'present' };
        }
        const trimmed = applyAttendanceDayMark(dated, '2026-10-10', '2', 'late');
        assert.equal(Object.keys(trimmed.days).length, 120);
        assert.equal(trimmed.days['2024-01-01'], undefined);
        assert.equal(trimmed.days['2024-01-02'], undefined);
        assert.equal(trimmed.days['2024-01-03']['1'], 'present');
        assert.equal(trimmed.days['2026-10-10']['2'], 'late');
    });

    it('같은 상태를 빈 칸에서 두 번 눌러도 서버에 이미 있으면 보상을 되돌리지 않는다', () => {
        const first = planAttendanceWrite({
            serverStatus: '',
            requestedStatus: 'present',
            seenStatus: '',
            today: '2026-10-13',
        });
        assert.equal(first.noop, false);
        assert.equal(first.clearCell, false);
        assert.equal(first.status, 'present');
        assert.equal(first.xpDelta, 8);
        assert.equal(first.bongDelta, 1);
        const raced = planAttendanceWrite({
            serverStatus: 'present',
            requestedStatus: 'present',
            seenStatus: '',
            today: '2026-10-13',
        });
        assert.equal(raced.noop, true);
        assert.equal(raced.xpDelta, 0);
        assert.equal(raced.bongDelta, 0);
        assert.equal(raced.status, 'present');
        const days = projectAttendanceDays({ '2026-10-13': { '7': 'absent' } }, '2026-10-13', '3', first);
        assert.equal(days['2026-10-13']['3'], 'present');
        assert.equal(days['2026-10-13']['7'], 'absent');
    });

    it('이 탭이 본 상태를 다시 누르면 그 칸만 지운다', () => {
        const clear = planAttendanceWrite({
            serverStatus: 'present',
            requestedStatus: 'present',
            seenStatus: 'present',
            today: '2026-10-13',
        });
        assert.equal(clear.clearCell, true);
        assert.equal(clear.status, '');
        assert.equal(clear.xpDelta, -8);
        assert.equal(clear.bongDelta, -1);
        assert.deepEqual(clear.attendanceMark, { date: '', status: '' });
        const days = projectAttendanceDays({
            '2026-10-13': { '3': 'present', '7': 'absent' },
        }, '2026-10-13', '3', clear);
        assert.equal(days['2026-10-13']['3'], undefined);
        assert.equal(days['2026-10-13']['7'], 'absent');
        const already = planAttendanceWrite({
            serverStatus: '',
            requestedStatus: 'present',
            seenStatus: 'present',
            today: '2026-10-13',
        });
        assert.equal(already.noop, true);
        assert.equal(already.xpDelta, 0);
    });
});
