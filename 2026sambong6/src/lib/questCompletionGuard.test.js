import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isDailyQuestCompletedToday,
    isWeeklyQuestCompletedThisWeek,
    isQuestCompletedForUi,
    sanitizeDailyQuestFlags,
    sanitizeWeeklyQuestFlags,
    removeLatestQuestHistoryMatch,
    weekRangeMondaySunday,
    didPointerMoveEnough,
    ACCIDENTAL_POINTER_MOVE_PX,
} from './questCompletionGuard.js';

describe('일일 퀘스트 완료 판정', () => {
    it('quests 플래그만 있고 오늘 기록이 없으면 완료로 보지 않는다', () => {
        const state = {
            quests: { q1: true, q8: true },
            lastDailyReset: '2026-08-28',
            questHistory: [
                { id: 'q1', date: '2026-08-27', bong: 1 },
            ],
        };
        assert.equal(isDailyQuestCompletedToday(state, 'q1', '2026-08-28'), false);
        assert.equal(isDailyQuestCompletedToday(state, 'q8', '2026-08-28'), false);
        assert.equal(
            isQuestCompletedForUi(state, { id: 'q1', type: 'daily' }, '2026-08-28'),
            false
        );
    });

    it('오늘 기록이 있으면 플래그가 꺼져 있어도 완료로 본다', () => {
        const state = {
            quests: { q1: false },
            questHistory: [{ id: 'q1', date: '2026-08-28', bong: 1 }],
        };
        assert.equal(isDailyQuestCompletedToday(state, 'q1', '2026-08-28'), true);
        assert.equal(
            isQuestCompletedForUi(state, { id: 'q1', type: 'daily' }, '2026-08-28'),
            true
        );
    });
});

describe('일일 퀘스트 잔존 체크 해제', () => {
    it('오늘 기록이 없는 일일 체크만 끈다', () => {
        const state = {
            quests: { q1: true, q8: true, q2: true },
            questHistory: [{ id: 'q1', date: '2026-08-28' }],
        };
        const changed = sanitizeDailyQuestFlags(state, ['q1', 'q8'], '2026-08-28');
        assert.equal(changed, true);
        assert.equal(state.quests.q1, true);
        assert.equal(state.quests.q8, false);
        assert.equal(state.quests.q2, true);
    });
});

describe('주간 퀘스트 완료 판정', () => {
    it('지난주 기록은 이번 주 완료로 보지 않는다', () => {
        const week = weekRangeMondaySunday(new Date(2026, 7, 28)); // 2026-08-28 금요일
        const state = {
            quests: { q2: true },
            questHistory: [{ id: 'q2', date: '2026-08-21' }],
        };
        assert.equal(
            isWeeklyQuestCompletedThisWeek(state, 'q2', week.start, week.end),
            false
        );
        assert.equal(
            isQuestCompletedForUi(state, { id: 'q2', type: 'weekly' }, '2026-08-28', week),
            false
        );
    });

    it('이번 주 금요 기록이 있으면 완료로 본다', () => {
        const week = weekRangeMondaySunday(new Date(2026, 7, 28));
        const state = {
            quests: { q2: false },
            questHistory: [{ id: 'q2', date: '2026-08-28' }],
        };
        assert.equal(
            isWeeklyQuestCompletedThisWeek(state, 'q2', week.start, week.end),
            true
        );
    });

    it('지난주 체크 잔존을 해제한다', () => {
        const week = weekRangeMondaySunday(new Date(2026, 7, 28));
        const state = {
            quests: { q2: true },
            questHistory: [{ id: 'q2', date: '2026-08-21' }],
        };
        const changed = sanitizeWeeklyQuestFlags(state, ['q2'], week.start, week.end);
        assert.equal(changed, true);
        assert.equal(state.quests.q2, false);
    });

    it('주간 퀘스트 취소는 오늘이 아니어도 이번 주 기록을 뺀다', () => {
        const week = weekRangeMondaySunday(new Date(2026, 7, 28)); // 금
        const history = [
            { id: 'q2', date: '2026-08-21' },
            { id: 'q2', date: '2026-08-24' },
        ];
        const removed = removeLatestQuestHistoryMatch(history, 'q2', {
            type: 'weekly',
            dateStr: '2026-08-28',
            weekStart: week.start,
            weekEnd: week.end,
        });
        assert.equal(removed.changed, true);
        assert.deepEqual(removed.history, [{ id: 'q2', date: '2026-08-21' }]);
        const missed = removeLatestQuestHistoryMatch(history, 'q2', {
            type: 'daily',
            dateStr: '2026-08-28',
        });
        assert.equal(missed.changed, false);
    });
});

describe('오터치 이동 판정', () => {
    it('작은 손떨림은 클릭으로 유지한다', () => {
        assert.equal(didPointerMoveEnough(100, 100, 106, 104), false);
    });

    it('스크롤·스와이프 정도는 오터치로 본다', () => {
        assert.equal(didPointerMoveEnough(100, 100, 100, 100 + ACCIDENTAL_POINTER_MOVE_PX + 1), true);
        assert.equal(didPointerMoveEnough(100, 100, 100 + ACCIDENTAL_POINTER_MOVE_PX + 1, 100), true);
    });
});
