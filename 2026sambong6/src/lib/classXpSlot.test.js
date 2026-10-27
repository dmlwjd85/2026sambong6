import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    CLASS_XP_END_TIMES,
    classXpCatchupSlot,
    classXpErrorKind,
    classXpGrantDecision,
    classXpGrantsFromServer,
    CLASS_XP_FIRE_DELAY_MS,
    CLASS_XP_MAX_WAIT_MS,
    classXpChunks,
    classXpGivenOnDevice,
    classXpIssueMessage,
    classXpNextFireMs,
    classXpTimerDelay,
    classXpSlotFromTime,
    classXpTargets,
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
describe('수업 XP 대상 고르기와 알림 문구', () => {
    const slot = '2026_10_27_10:30';

    it('마스터, 빈 id, 이미 받은 학생, 신용 불량 학생은 읽지 않는다', () => {
        const students = [
            { id: 'gm', xp: 0 },
            { id: 'gm_a', xp: 0 },
            { id: '', pin: '0000' },
            { id: '  ', xp: 3 },
            { id: '1', xp: 120, lastClassXpSlot: slot },
            { id: '2', xp: 120, creditDefault: true },
            { id: '3', xp: 120, lastClassXpSlot: '2026_10_27_09:40' },
            { id: '4', xp: 120 },
            { id: '5', xp: '12' },
            null,
        ];
        const { pending, invalidXp } = classXpTargets(students, slot, (s) => !!s.creditDefault);
        assert.deepEqual(pending, ['3', '4']);
        assert.deepEqual(invalidXp, ['5']);
    });

    it('모두 받은 뒤에는 읽을 학생이 없다', () => {
        const students = [{ id: '1', xp: 125, lastClassXpSlot: slot }, { id: '2', xp: 125, lastClassXpSlot: slot }];
        assert.deepEqual(classXpTargets(students, slot), { pending: [], invalidXp: [] });
        assert.deepEqual(classXpTargets(null, slot), { pending: [], invalidXp: [] });
    });

    it('서버에 이미 이번 종이 있으면 화면 목록과 달라도 다시 주지 않는다', () => {
        const docs = [
            { id: '1', exists: true, xp: 130, lastClassXpSlot: slot },
            { id: '2', exists: true, xp: 40, lastClassXpSlot: '2026_10_27_09:40' },
            { id: '3', exists: false, xp: 10, lastClassXpSlot: '' },
            { id: '4', exists: true, xp: '12', lastClassXpSlot: '' },
            { id: '2', exists: true, xp: 40, lastClassXpSlot: '' },
            { id: '5', exists: true, xp: 0 },
        ];
        assert.deepEqual(classXpGrantsFromServer(docs, slot), [
            { id: '2', xp: 40 },
            { id: '5', xp: 0 },
        ]);
        assert.deepEqual(classXpGrantsFromServer(null, slot), []);
    });

    it('지급 저장은 서버 문서를 읽은 뒤에만 이번 종을 더한다', () => {
        const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const start = src.indexOf('window.checkAndDistributeClassXP = async function()');
        const end = src.indexOf('window.checkAndDistributeSalary', start);
        const body = src.slice(start, end);
        assert.ok(start >= 0 && end > start);
        const readAt = body.indexOf('transaction.get(ref)');
        const grantAt = body.indexOf('classXpGrantsFromServer(loaded, slotKey)');
        const writeAt = body.indexOf('transaction.update(refs.get(row.id)');
        assert.ok(readAt >= 0 && grantAt > readAt && writeAt > grantAt);
        assert.equal(body.includes('maxAttempts: 1'), false);
    });

    it('저장 실패를 거절·사용량 초과·기타로 나눈다', () => {
        assert.equal(classXpErrorKind({ code: 'permission-denied' }), 'denied');
        assert.equal(classXpErrorKind({ code: 'firestore/permission-denied' }), 'denied');
        assert.equal(classXpErrorKind({ code: 'resource-exhausted' }), 'quota');
        assert.equal(classXpErrorKind({ code: 'firestore/resource-exhausted' }), 'quota');
        assert.equal(classXpErrorKind({ code: 'unavailable' }), 'other');
        assert.equal(classXpErrorKind(null), 'other');
    });

    it('알림 문구는 해요체이고 빈 이름을 넣지 않는다', () => {
        const quota = classXpIssueMessage('quota', '10:30');
        assert.match(quota, /10:30 수업 종료 경험치를 못 줬어요/);
        assert.match(quota, /이번 종은 건너뛰어요\.$/);
        assert.match(classXpIssueMessage('denied', '10:30'), /한국 시간/);
        assert.match(classXpIssueMessage('other', '10:30'), /이번 종은 건너뛰어요/);
        assert.equal(
            classXpIssueMessage('xp', '10:30', ['3. 홍길동', '', '  ']),
            '⏰ 10:30 수업 종료 경험치를 못 준 학생이 있어요. 경험치 값이 숫자가 아니에요: 3. 홍길동',
        );
        assert.equal(classXpIssueMessage('xp', '10:30', ['']), '');
        const many = classXpIssueMessage('xp', '10:30', ['1. 가', '2. 나', '3. 다', '4. 라', '5. 마', '6. 바', '7. 사']);
        assert.match(many, /5\. 마 외 2명$/);
        for (const text of [quota, many, classXpIssueMessage('denied', '13:50'), classXpIssueMessage('other', '13:50')]) {
            assert.doesNotMatch(text, /습니다|, ,|: ,|다시 시도/);
        }
    });

    it('다음 종 시각 + 20초에 타이머를 한 번 건다', () => {
        const at = (h, m, s = 0, day = 27) => Date.UTC(2026, 9, day, h - 9, m, s);
        assert.equal(CLASS_XP_FIRE_DELAY_MS, 20000);
        // 화요일 08:00 → 09:40:20
        assert.equal(classXpNextFireMs(at(8, 0)), at(9, 40, 20));
        // 종이 친 뒤 20초 안이면 그 종을 기다려요.
        assert.equal(classXpNextFireMs(at(9, 40, 5)), at(9, 40, 20));
        assert.equal(classXpNextFireMs(at(9, 40, 20)), at(10, 30, 20));
        assert.equal(classXpNextFireMs(at(12, 30)), at(13, 50, 20));
        // 마지막 종 뒤에는 다음 평일 첫 종이에요. 금요일 15:00 → 월요일 09:40:20
        assert.equal(classXpNextFireMs(at(15, 0, 0, 30)), Date.UTC(2026, 10, 2, 0, 40, 20));
        assert.equal(classXpNextFireMs(at(15, 0)), at(9, 40, 20, 28));
        assert.equal(classXpNextFireMs(Number.NaN), null);
        // 타이머 대기 시간은 1초~6시간이에요.
        assert.equal(classXpTimerDelay(at(8, 0), at(9, 40, 20)), 100 * 60 * 1000 + 20000);
        assert.equal(classXpTimerDelay(at(15, 0), at(9, 40, 20, 28)), CLASS_XP_MAX_WAIT_MS);
        assert.equal(classXpTimerDelay(at(9, 40, 20), at(9, 40, 20)), 1000);
        assert.equal(classXpTimerDelay(at(8, 0), null), CLASS_XP_MAX_WAIT_MS);
    });

    it('이 기기가 이미 준 종은 다시 주지 않는다', () => {
        assert.equal(classXpGivenOnDevice('2026_10_27_10:30', '2026_10_27_10:30'), true);
        assert.equal(classXpGivenOnDevice('2026_10_27_09:40', '2026_10_27_10:30'), false);
        assert.equal(classXpGivenOnDevice(null, '2026_10_27_10:30'), false);
        assert.equal(classXpGivenOnDevice('', ''), false);
    });

    it('학생을 400명씩 묶어 한 번에 저장한다', () => {
        const ids = Array.from({ length: 25 }, (_, i) => String(i + 1));
        assert.deepEqual(classXpChunks(ids).map((c) => c.length), [25]);
        assert.deepEqual(classXpChunks(Array.from({ length: 801 }, (_, i) => i)).map((c) => c.length), [400, 400, 1]);
        assert.deepEqual(classXpChunks([]), []);
        assert.deepEqual(classXpChunks(null), []);
    });
});
