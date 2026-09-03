import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLASS_BELL_PERIODS,
    classBellAnnounceText,
    classBellFiredKey,
    isClassBellEnabled,
    isClassBellWeekday,
    matchClassBell,
    melodyForClassBell,
    parseHhmmToMinutes,
} from './classBell.js';

describe('수업 종', () => {
    it('평일 교시 시작·종료 분에 맞춘다', () => {
        assert.equal(CLASS_BELL_PERIODS.length, 6);
        assert.equal(parseHhmmToMinutes('09:00'), 540);
        assert.equal(parseHhmmToMinutes('14:40'), 880);
        // 2026-09-03 목요일 09:00
        const start = matchClassBell(new Date(2026, 8, 3, 9, 0, 12));
        assert.equal(start.kind, 'start');
        assert.equal(start.periodId, 1);
        assert.match(classBellAnnounceText(start), /1교시 시작/);
        const end = matchClassBell(new Date(2026, 8, 3, 9, 40, 5));
        assert.equal(end.kind, 'end');
        assert.equal(end.periodId, 1);
        assert.match(classBellAnnounceText(end), /1교시 종료/);
        assert.equal(matchClassBell(new Date(2026, 8, 3, 9, 1, 0)), null);
        // 토요일은 울리지 않음
        assert.equal(isClassBellWeekday(new Date(2026, 8, 5, 9, 0, 0)), false);
        assert.equal(matchClassBell(new Date(2026, 8, 5, 9, 0, 0)), null);
    });

    it('같은 교시는 하루에 한 번만 울리게 키를 만든다', () => {
        const ev = matchClassBell(new Date(2026, 8, 3, 14, 0, 0));
        assert.equal(ev.periodId, 6);
        assert.equal(classBellFiredKey(new Date(2026, 8, 3, 14, 0, 0), ev), 'sambong_class_bell_2026-09-03_6_start');
        assert.equal(isClassBellEnabled('1'), true);
        assert.equal(isClassBellEnabled(false), false);
        assert.ok(melodyForClassBell('start').length >= 4);
        assert.ok(melodyForClassBell('end').length >= 4);
        assert.notEqual(melodyForClassBell('start')[0][0], melodyForClassBell('end')[0][0]);
    });
});
