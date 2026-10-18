import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLASS_XP_END_TIMES,
    classXpCatchupSlot,
    classXpGrantDecision,
    classXpSlotFromTime,
    keepServerClassXpSlot,
    kstWallClock,
    omitClassXpSlot,
} from './classXpSlot.js';

describe('수업 XP 슬롯 (KST)', () => {
    it('기기 시간대와 상관없이 한국 표준시 종 시각만 슬롯이 된다', () => {
        assert.deepEqual(CLASS_XP_END_TIMES, ['09:40', '10:30', '11:20', '12:10', '13:50', '14:40']);
        // 2026-10-15 00:40:30 UTC = 09:40:30 KST, 목요일
        const bell = new Date(Date.UTC(2026, 9, 15, 0, 40, 30));
        const slot = classXpSlotFromTime(bell);
        assert.equal(slot.key, '2026_10_15_09:40');
        assert.equal(slot.timeStr, '09:40');
        assert.equal(slot.ymd, '2026-10-15');
        assert.equal(slot.slotMs, Date.UTC(2026, 9, 15, 0, 40, 0));
        assert.equal(kstWallClock(bell).hours, 9);
        assert.equal(kstWallClock(bell).minutes, 40);

        const early = new Date(Date.UTC(2026, 9, 15, 0, 39, 45));
        assert.equal(classXpSlotFromTime(early), null);

        // 2026-10-17 00:40 UTC = 09:40 KST, 토요일
        assert.equal(classXpSlotFromTime(new Date(Date.UTC(2026, 9, 17, 0, 40, 0))), null);
        assert.equal(classXpSlotFromTime(new Date(Date.UTC(2026, 9, 15, 5, 40, 0))).timeStr, '14:40');
    });

    it('놓친 종은 오늘 가장 최근 시각만 따라잡는다', () => {
        const at = (h, m, s = 0, day = 15) => new Date(Date.UTC(2026, 9, day, h - 9, m, s));
        assert.equal(classXpCatchupSlot(at(9, 39, 45)), null);
        assert.equal(classXpCatchupSlot(at(9, 40)).key, '2026_10_15_09:40');
        assert.equal(classXpCatchupSlot(at(9, 41)).key, '2026_10_15_09:40');
        assert.equal(classXpCatchupSlot(at(9, 41)).slotMs, Date.UTC(2026, 9, 15, 0, 40, 0));
        const mid = classXpCatchupSlot(at(10, 35));
        assert.equal(mid.key, '2026_10_15_10:30');
        assert.notEqual(mid.timeStr, '09:40');
        assert.equal(classXpCatchupSlot(at(15, 0)).key, '2026_10_15_14:40');
        assert.equal(classXpCatchupSlot(at(23, 59)).timeStr, '14:40');
        assert.equal(classXpCatchupSlot(at(9, 40, 0, 17)), null);
        assert.equal(classXpCatchupSlot(at(14, 40, 0, 18)), null);

        const bell = new Date(Date.UTC(2026, 9, 15, 0, 40, 30));
        const wall = kstWallClock(bell);
        const days = Math.floor(Date.UTC(wall.year, wall.month - 1, wall.day) / 86400000);
        assert.equal((days + 4) % 7, wall.weekday);
        const saturday = kstWallClock(new Date(Date.UTC(2026, 9, 17, 0, 40, 0)));
        const satDays = Math.floor(Date.UTC(saturday.year, saturday.month - 1, saturday.day) / 86400000);
        assert.equal((satDays + 4) % 7, 6);
    });

    it('학생 저장에서 수업 XP 슬롯을 빼고, 숫자가 아닌 경험치는 지급하지 않는다', () => {
        const source = { xp: 10, bong: 3, lastClassXpSlot: '2026_10_15_13:50' };
        const saved = omitClassXpSlot(source);
        assert.equal(saved.xp, 10);
        assert.equal(saved.bong, 3);
        assert.equal(Object.prototype.hasOwnProperty.call(saved, 'lastClassXpSlot'), false);
        assert.equal(source.lastClassXpSlot, '2026_10_15_13:50');
        assert.deepEqual(omitClassXpSlot({ xp: 1 }), { xp: 1 });

        assert.equal(classXpGrantDecision('x', '', '2026_10_15_14:40'), 'invalid-xp');
        assert.equal(classXpGrantDecision(undefined, '', '2026_10_15_14:40'), 'invalid-xp');
        assert.equal(classXpGrantDecision(Number.NaN, '', '2026_10_15_14:40'), 'invalid-xp');
        assert.equal(classXpGrantDecision(10, '2026_10_15_14:40', '2026_10_15_14:40'), 'already');
        assert.equal(classXpGrantDecision(10, '2026_10_15_13:50', '2026_10_15_14:40'), 'grant');
        assert.equal(classXpGrantDecision(0, '', '2026_10_15_14:40'), 'grant');
    });

    it('복구 문서는 서버의 수업 XP 슬롯을 지우거나 옛 키로 바꾸지 않는다', () => {
        const backup = { xp: 480, bong: 12, quests: { q1: true } };
        const kept = keepServerClassXpSlot(backup, { xp: 5, lastClassXpSlot: '2026_10_19_09:40' });
        assert.equal(kept.xp, 480);
        assert.equal(kept.bong, 12);
        assert.equal(kept.lastClassXpSlot, '2026_10_19_09:40');
        assert.equal(Object.prototype.hasOwnProperty.call(backup, 'lastClassXpSlot'), false);

        const staleBackup = { xp: 480, lastClassXpSlot: '2026_10_01_14:40' };
        const replaced = keepServerClassXpSlot(staleBackup, { lastClassXpSlot: '2026_10_19_14:40' });
        assert.equal(replaced.lastClassXpSlot, '2026_10_19_14:40');
        assert.equal(staleBackup.lastClassXpSlot, '2026_10_01_14:40');

        const cleared = keepServerClassXpSlot(staleBackup, { xp: 0 });
        assert.equal(Object.prototype.hasOwnProperty.call(cleared, 'lastClassXpSlot'), false);
        assert.equal(cleared.xp, 480);

        const emptySlot = keepServerClassXpSlot(backup, { lastClassXpSlot: '' });
        assert.equal(emptySlot.lastClassXpSlot, '');
    });
});