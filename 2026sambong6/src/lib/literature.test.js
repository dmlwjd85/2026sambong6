import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    LITERATURE_DEFAULT_REWARD_XP,
    LITERATURE_THOUGHT_MIN,
    applyReadingLogReview,
    canApproveReadingLog,
    canViewDiary,
    countApprovedReadingLogs,
    diariesVisibleTo,
    diaryDocId,
    pendingReadingLogs,
    readingLogDocId,
    readingLogSubmitState,
    sanitizeDiaryEntry,
    sanitizeLiteratureRewards,
    sanitizeReadingLog,
    validateDiaryDraft,
    validateReadingLogDraft,
} from './literature.js';

describe('독서기록장', () => {
    it('제목·지은이·출판사·생각이 있어야 제출한다', () => {
        const bad = validateReadingLogDraft({
            studentId: '12',
            date: '2026-09-02',
            title: '책',
            author: '작가',
            publisher: '출판',
            thought: '짧음',
        });
        assert.equal(bad.ok, false);
        assert.equal(bad.reason, 'thought');
        const thought = '이 책을 읽고 친구에게 더 잘해 줘야겠다고 생각했어요.';
        assert.ok(Array.from(thought).length >= LITERATURE_THOUGHT_MIN);
        const ok = validateReadingLogDraft({
            studentId: '12',
            date: '2026-09-02',
            title: '책',
            author: '작가',
            publisher: '출판',
            thought,
        });
        assert.equal(ok.ok, true);
        assert.equal(ok.log.status, 'pending');
    });

    it('하루에 대기·승인이 있으면 또 내지 못한다', () => {
        const logs = [
            sanitizeReadingLog({ studentId: '12', date: '2026-09-02', status: 'pending', title: 'A' }),
        ];
        const blocked = readingLogSubmitState(logs, '12', '2026-09-02');
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'pending');
        const otherDay = readingLogSubmitState(logs, '12', '2026-09-03');
        assert.equal(otherDay.ok, true);
        const rejected = readingLogSubmitState([
            sanitizeReadingLog({ studentId: '12', date: '2026-09-02', status: 'rejected', title: 'A' }),
        ], '12', '2026-09-02');
        assert.equal(rejected.ok, true);
        assert.equal(rejected.reason, 'resubmit');
    });

    it('교사가 확인하면 미리 정한 보상을 지급한다', () => {
        const log = sanitizeReadingLog({ studentId: '12', date: '2026-09-02', status: 'pending', thought: 'x'.repeat(20) });
        assert.equal(canApproveReadingLog(log), true);
        const reviewed = applyReadingLogReview(log, 'approve', '', { readingRewardXp: 30, readingRewardBong: 4 }, 1);
        assert.equal(reviewed.skip, false);
        assert.equal(reviewed.log.status, 'approved');
        assert.equal(reviewed.log.rewarded, true);
        assert.equal(reviewed.grantXp, 30);
        assert.equal(reviewed.grantBong, 4);
        const again = applyReadingLogReview(reviewed.log, 'approve', '', { readingRewardXp: 30, readingRewardBong: 4 }, 2);
        assert.equal(again.skip, true);
        assert.equal(sanitizeLiteratureRewards({}).readingRewardXp, LITERATURE_DEFAULT_REWARD_XP);
        assert.equal(countApprovedReadingLogs([reviewed.log], '12'), 1);
        assert.equal(pendingReadingLogs([log]).length, 1);
        assert.equal(readingLogDocId('12', '2026-09-02'), 'rlog_12_2026-09-02');
    });
});

describe('일기장', () => {
    it('교사만 다른 학생 일기를 본다', () => {
        const entry = sanitizeDiaryEntry({
            studentId: '12',
            date: '2026-09-02',
            weather: 'rain',
            mood: 'happy',
            body: '오늘 비가 왔다.',
            strokes: [{ color: '#111', width: 2, pts: [0.1, 0.1, 0.2, 0.2, 0.3, 0.25] }],
        });
        assert.equal(entry.weather, 'rain');
        assert.equal(canViewDiary({ id: '12' }, entry), true);
        assert.equal(canViewDiary({ id: '1' }, entry), false);
        assert.equal(canViewDiary({ isAdmin: true, id: 'gm' }, entry), true);
        const visible = diariesVisibleTo({ id: '1' }, [entry]);
        assert.equal(visible.length, 0);
        assert.equal(diaryDocId('12', '2026-09-02'), 'diary_12_2026-09-02');
        const empty = validateDiaryDraft({ studentId: '12', date: '2026-09-02', body: '', strokes: [] });
        assert.equal(empty.ok, false);
        const ok = validateDiaryDraft({ studentId: '12', date: '2026-09-02', body: '오늘 하루' });
        assert.equal(ok.ok, true);
    });
});
