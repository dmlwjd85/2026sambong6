import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_XP_END_TIMES, classXpSlotFromTime, kstWallClock } from './classXpSlot.js';

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
});