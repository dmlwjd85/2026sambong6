import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QUEST_CANCEL_LOG_LIMIT, patchStudentQuestBoardRow, questCancelledOnDate, recordQuestCancel } from './questCompletionGuard.js';
import { computeResearchStats, researchStatsToCsv } from './researchStats.js';

const DAY = '2026-11-15';
const at = (h = 10) => new Date(2026, 10, 15, h).getTime();

describe('눌렀다가 취소한 퀘스트 표시(#107)', () => {
    it('취소 기록을 최근 것만 남겨요', () => {
        let list = [];
        for (let i = 0; i < QUEST_CANCEL_LOG_LIMIT + 5; i += 1) list = recordQuestCancel(list, { id: `q${i}`, name: '독서', date: DAY, timestamp: i });
        assert.equal(list.length, QUEST_CANCEL_LOG_LIMIT);
        assert.equal(list[list.length - 1].id, `q${QUEST_CANCEL_LOG_LIMIT + 4}`);
        assert.deepEqual(recordQuestCancel(null, { id: '', date: DAY }), []);
    });

    it('그날 취소했으면 취소로, 다시 완료하면 완료로 봐요', () => {
        const cancelled = { questHistory: [], questCancels: [{ id: 'q3', date: DAY }] };
        assert.equal(questCancelledOnDate(cancelled, 'q3', DAY), true);
        assert.equal(questCancelledOnDate(cancelled, 'q3', '2026-11-14'), false);
        assert.equal(questCancelledOnDate(cancelled, 'q4', DAY), false);
        const redone = { ...cancelled, questHistory: [{ id: 'q3', date: DAY }] };
        assert.equal(questCancelledOnDate(redone, 'q3', DAY), false);
    });

    it('이 기능이 생기기 전 취소는 XP 변동 기록으로 알아봐요', () => {
        const old = { questHistory: [], xpChangeLog: [{ at: at(), reason: '퀘스트 취소: q2', delta: -10 }] };
        assert.equal(questCancelledOnDate(old, 'q2', DAY), true);
        assert.equal(questCancelledOnDate(old, 'q22', DAY), false);
        assert.equal(questCancelledOnDate({}, 'q2', DAY), false);
    });

    it('현황판에 내 취소 기록이 바로 반영돼요', () => {
        const rows = patchStudentQuestBoardRow([{ id: '5', questHistory: [{ id: 'q1', date: DAY }] }], '5', {
            questHistory: [],
            quests: { q1: false },
            questCancels: [{ id: 'q1', date: DAY }],
        });
        assert.equal(questCancelledOnDate(rows[0], 'q1', DAY), true);
    });
});

describe('퀘스트 통계의 취소 반영(#107)', () => {
    const stats = (students) => computeResearchStats({
        students,
        studentIds: students.map((s) => s.id),
        getName: (id) => `학생${id}`,
        dailyQuests: [{ id: 'q1', name: '독서' }, { id: 'q2', name: '줄넘기' }],
        today: DAY,
        period: 'today',
    });

    it('취소로 되돌린 XP는 증가량에서 빼고, 취소 횟수를 세요', () => {
        const s = stats([{
            id: '1',
            questHistory: [{ id: 'q1', date: DAY, timestamp: at(9) }],
            questCancels: [{ id: 'q2', date: DAY, timestamp: at(10) }],
            xpChangeLog: [
                { at: at(9), reason: '퀘스트 완료: 독서', delta: 10 },
                { at: at(10), reason: '퀘스트 완료: 줄넘기', delta: 10 },
                { at: at(10), reason: '퀘스트 취소: q2', delta: -10 },
            ],
        }]);
        const me = s.perStudent[0];
        assert.equal(me.xpGainToday, 10);
        assert.equal(me.cancelToday, 1);
        assert.equal(me.todayDailyDone, 1);
        assert.equal(s.questCancelToday, 1);
        assert.ok(researchStatsToCsv(s).includes('퀘스트_눌렀다취소_오늘,1'));
    });

    it('방패가 XP 회수를 막아 변동 기록이 없어도 취소 기록으로 세요', () => {
        const s = stats([{ id: '2', questHistory: [], questCancels: [{ id: 'q1', date: DAY }, { id: 'q2', date: DAY }], xpChangeLog: [] }]);
        assert.equal(s.perStudent[0].cancelToday, 2);
    });

    it('취소가 없으면 예전과 같아요', () => {
        const s = stats([{ id: '3', questHistory: [{ id: 'q1', date: DAY }], xpChangeLog: [{ at: at(), reason: '퀘스트 완료: 독서', delta: 10 }, { at: at(), reason: '마스터 직접 XP 수정', delta: -5 }] }]);
        assert.equal(s.perStudent[0].xpGainToday, 10);
        assert.equal(s.perStudent[0].cancelToday, 0);
        assert.equal(s.questCancelToday, 0);
    });
});
