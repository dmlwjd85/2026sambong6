import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    anonymousRebukeReasons,
    applyRebukeBongDelta,
    attachRebukeAudit,
    normalizeRebukeReason,
    planPeerRebuke,
    rebukeAuditPatch,
    rebukeCountOf,
    rebukeFailMessage,
    rebukePenaltyForCount,
    rebukeReasonIssue,
    rebukePublicView,
    teacherRebukeReasons,
    REBUKE_BONG_FLOOR,
    REBUKE_COST_BONG,
    REBUKE_DAILY_CAP,
    REBUKE_REASONS_KEPT,
    REBUKE_THRESHOLD_BONG,
} from './peerRebuke.js';

function hasKey(value, key) {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
    if (Object.prototype.hasOwnProperty.call(value, key)) return true;
    return Object.values(value).some((item) => hasKey(item, key));
}

describe('역따봉', () => {
    it('이유가 없으면 보내지 않고 나에게도 보내지 못한다', () => {
        assert.equal(rebukeReasonIssue('  '), 'short');
        assert.equal(rebukeReasonIssue('아'), 'short');
        assert.equal(rebukeReasonIssue('..'), 'symbol');
        assert.equal(rebukeReasonIssue('ㅋㅋ'), 'symbol');
        assert.equal(rebukeReasonIssue('싫어'), '');
        assert.equal(rebukeReasonIssue(`${'가'.repeat(80)}`), '');
        assert.equal(rebukeReasonIssue(`${'가'.repeat(81)}`), 'long');
        assert.equal(rebukeReasonIssue('김라희가 떠들었어요', ['김라희']), 'name');
        assert.equal(rebukeReasonIssue('떠들어서 수업이 멈췄어요', ['김라희']), '');
        assert.equal(normalizeRebukeReason('  \n떠들었어요  '), '떠들었어요');
        assert.equal(normalizeRebukeReason('ㅋㅋ'), '');
        const self = planPeerRebuke({}, {
            fromId: '1',
            toId: '1',
            today: '2026-10-19',
            reason: '내가 싫어',
            senderBong: 20,
            receiverBong: 20,
        });
        assert.equal(self.reason, 'self');
        const blank = planPeerRebuke({}, {
            fromId: '1',
            toId: '2',
            today: '2026-10-19',
            reason: '   ',
            senderBong: 20,
            receiverBong: 20,
        });
        assert.equal(blank.reason, 'short');
        assert.match(rebukeFailMessage('short'), /2글자/);
        assert.match(rebukeFailMessage('symbol'), /ㅋㅋ/);
        assert.match(rebukeFailMessage('name'), /이름/);
        assert.match(rebukeFailMessage('self'), /나/);
    });

    it('봉이 5개보다 적으면 보내지 않고 5개면 보낸 사람만 5가 빠진다', () => {
        const poor = planPeerRebuke({}, {
            fromId: '1',
            toId: '2',
            today: '2026-10-19',
            reason: '떠들어서',
            senderBong: REBUKE_COST_BONG - 1,
            receiverBong: 30,
        });
        assert.equal(poor.ok, false);
        assert.equal(poor.reason, 'balance');
        assert.match(rebukeFailMessage('balance', 'B'), /5B/);

        const src = { received: { '2': 3 } };
        const before = structuredClone(src);
        const paid = planPeerRebuke(src, {
            fromId: '1',
            toId: '2',
            today: '2026-10-19',
            reason: '떠들어서',
            senderBong: 5,
            receiverBong: 30,
        });
        assert.equal(paid.ok, true);
        assert.equal(paid.senderBong, 0);
        assert.equal(paid.senderDelta, -REBUKE_COST_BONG);
        assert.equal(paid.receiverDelta, 0);
        assert.equal(paid.received, 4);
        assert.deepEqual(src, before);
    });

    it('10개, 20개가 될 때 10봉씩 한 번만 빼고 다시 계산하면 0이다', () => {
        assert.deepEqual(rebukePenaltyForCount(9, 0), { bong: 0, steps: 0, through: 0, thresholds: [] });
        assert.deepEqual(rebukePenaltyForCount(10, 0).thresholds, [10]);
        assert.equal(rebukePenaltyForCount(10, 0).bong, REBUKE_THRESHOLD_BONG);
        assert.equal(rebukePenaltyForCount(10, 10).bong, 0);
        assert.equal(rebukePenaltyForCount(19, 10).bong, 0);
        assert.deepEqual(rebukePenaltyForCount(20, 10).thresholds, [20]);
        assert.equal(rebukePenaltyForCount(30, 0).bong, 30);
        assert.equal(rebukePenaltyForCount(30, 30).bong, 0);
        assert.equal(rebukePenaltyForCount(30, 30).through, 30);

        let board = {};
        for (let n = 1; n <= 9; n += 1) {
            const step = planPeerRebuke(board, {
                fromId: `s${n}`,
                toId: '2',
                today: '2026-10-19',
                reason: `이유 ${n}번`,
                senderBong: 10,
                receiverBong: 40,
            });
            assert.equal(step.ok, true);
            assert.equal(step.penaltyBong, 0);
            board = step.board;
        }
        const tenth = planPeerRebuke(board, {
            fromId: 's10',
            toId: '2',
            today: '2026-10-19',
            reason: '이유 10번',
            senderBong: 10,
            receiverBong: 40,
        });
        assert.equal(tenth.ok, true);
        assert.equal(tenth.received, 10);
        assert.equal(tenth.penaltyBong, 10);
        assert.equal(tenth.receiverDelta, -10);
        assert.equal(tenth.receiverBong, 30);
        assert.equal(tenth.board.penaltyThrough['2'], 10);
        assert.equal(rebukePenaltyForCount(tenth.received, tenth.board.penaltyThrough['2']).bong, 0);

        const replay = planPeerRebuke(tenth.board, {
            fromId: 's10',
            toId: '2',
            today: '2026-10-19',
            reason: '이유 10번',
            senderBong: 5,
            receiverBong: 30,
        });
        assert.equal(replay.reason, 'pair');
        assert.equal(rebukeCountOf(tenth.board, '2'), 10);

        const eleventh = planPeerRebuke(tenth.board, {
            fromId: 's11',
            toId: '2',
            today: '2026-10-19',
            reason: '이유 11번',
            senderBong: 10,
            receiverBong: 30,
        });
        assert.equal(eleventh.ok, true);
        assert.equal(eleventh.received, 11);
        assert.equal(eleventh.penaltyBong, 0);
        assert.equal(eleventh.receiverDelta, 0);
        assert.equal(eleventh.board.penaltyThrough['2'], 10);
    });

    it('빠진 구간이 있으면 다음 역따봉 때 아직 안 뺀 구간만 채운다', () => {
        const step = planPeerRebuke({
            received: { '2': 19 },
            penaltyThrough: {},
            entries: [],
        }, {
            fromId: '8',
            toId: '2',
            today: '2026-10-19',
            reason: '늦게 반영',
            senderBong: 12,
            receiverBong: 50,
        });
        assert.equal(step.ok, true);
        assert.equal(step.received, 20);
        assert.deepEqual(step.thresholds, [10, 20]);
        assert.equal(step.penaltyBong, 20);
        assert.equal(step.receiverBong, 30);
        const again = rebukePenaltyForCount(step.received, step.board.penaltyThrough['2']);
        assert.equal(again.bong, 0);
        assert.equal(again.through, 20);
    });

    it('봉이 바닥이면 더 내리지 않고 그 구간은 이미 뺀 것으로 남긴다', () => {
        const moved = applyRebukeBongDelta(-1996, -10);
        assert.equal(moved.after, REBUKE_BONG_FLOOR);
        assert.equal(moved.delta, -4);
        const step = planPeerRebuke({
            received: { '4': 9 },
            penaltyThrough: {},
        }, {
            fromId: '1',
            toId: '4',
            today: '2026-10-19',
            reason: '바닥 시험',
            senderBong: 9,
            receiverBong: -1996,
        });
        assert.equal(step.ok, true);
        assert.equal(step.penaltyBong, 10);
        assert.equal(step.receiverBong, REBUKE_BONG_FLOOR);
        assert.equal(step.receiverDelta, -4);
        assert.equal(step.board.penaltyThrough['4'], 10);
        assert.equal(rebukePenaltyForCount(10, step.board.penaltyThrough['4']).bong, 0);
    });

    it('같은 친구는 하루에 한 번, 한 사람은 하루에 세 번까지다', () => {
        let board = {};
        for (let n = 1; n <= REBUKE_DAILY_CAP; n += 1) {
            const step = planPeerRebuke(board, {
                fromId: '1',
                toId: String(n + 1),
                today: '2026-10-19',
                reason: `오늘 ${n}번째`,
                senderBong: 30,
                receiverBong: 10,
            });
            assert.equal(step.ok, true);
            board = step.board;
        }
        const fourth = planPeerRebuke(board, {
            fromId: '1',
            toId: '9',
            today: '2026-10-19',
            reason: '네 번째',
            senderBong: 30,
            receiverBong: 10,
        });
        assert.equal(fourth.reason, 'daily');
        const same = planPeerRebuke(board, {
            fromId: '3',
            toId: '2',
            today: '2026-10-19',
            reason: '또 보냄',
            senderBong: 30,
            receiverBong: 10,
        });
        assert.equal(same.ok, true);
        const repeat = planPeerRebuke(same.board, {
            fromId: '3',
            toId: '2',
            today: '2026-10-19',
            reason: '같은 날 또',
            senderBong: 30,
            receiverBong: 10,
        });
        assert.equal(repeat.reason, 'pair');
        assert.match(rebukeFailMessage('daily'), /3번/);
        assert.match(rebukeFailMessage('pair'), /이미/);
    });

    it('다음 날에도 받은 수는 남고 어제 보낸 기록만 풀린다', () => {
        const first = planPeerRebuke({}, {
            fromId: '1',
            toId: '2',
            today: '2026-10-19',
            reason: '어제 이유',
            senderBong: 10,
            receiverBong: 10,
        });
        assert.equal(first.board.received['2'], 1);
        const next = planPeerRebuke(first.board, {
            fromId: '1',
            toId: '2',
            today: '2026-10-20',
            reason: '오늘 이유',
            senderBong: 10,
            receiverBong: 10,
        });
        assert.equal(next.ok, true);
        assert.equal(next.received, 2);
        assert.equal(next.board.received['2'], 2);
        assert.equal(next.board.pairDay['1>2'], '2026-10-20');
        assert.equal(next.board.sentDaily['1'].n, 1);
        assert.equal(rebukeCountOf(next.board, '2'), 2);
        const thirdToday = planPeerRebuke({
            received: { '2': 8 },
            penaltyThrough: { '2': 0 },
            sentDaily: { '1': { ymd: '2026-10-19', n: 3 } },
            pairDay: { '1>2': '2026-10-19' },
            entries: [],
        }, {
            fromId: '1',
            toId: '2',
            today: '2026-10-20',
            reason: '새 날',
            senderBong: 10,
            receiverBong: 10,
        });
        assert.equal(thirdToday.ok, true);
        assert.equal(thirdToday.received, 9);
        assert.equal(thirdToday.penaltyBong, 0);
    });

    it('받는 학생은 이유만 보고 선생님은 보낸 학번을 본다', () => {
        const step = planPeerRebuke({}, {
            fromId: '7',
            toId: '2',
            today: '2026-10-19',
            reason: '자리 양보를 안 했어요',
            senderBong: 10,
            receiverBong: 10,
        });
        const hidden = anonymousRebukeReasons(step.board, '2');
        assert.deepEqual(hidden, [{ reason: '자리 양보를 안 했어요', ymd: '2026-10-19' }]);
        assert.equal(hasKey(hidden, 'fromId'), false);
        assert.equal(JSON.stringify(hidden).includes('7'), false);
        const named = teacherRebukeReasons(step.board, '2');
        assert.equal(named[0].fromId, '7');
        assert.equal(named[0].reason, '자리 양보를 안 했어요');

        const pub = rebukePublicView(step.board);
        assert.equal(hasKey(pub.entries, 'fromId'), false);
        assert.equal(JSON.stringify(pub.entries).includes('7'), false);
        const patch = rebukeAuditPatch(step.entry);
        assert.equal(patch.lastId, step.entry.id);
        assert.equal(patch.entries[step.entry.id].fromId, '7');
        assert.deepEqual(Object.keys(patch.entries[step.entry.id]).sort(), ['fromId', 'toId', 'ymd']);
        const joined = attachRebukeAudit(pub, patch);
        assert.equal(teacherRebukeReasons(joined, '2')[0].fromId, '7');
        assert.equal(hasKey(anonymousRebukeReasons(joined, '2'), 'fromId'), false);
        const noAudit = attachRebukeAudit(pub, {});
        assert.equal(teacherRebukeReasons(noAudit, '2')[0].fromId, undefined);
    });

    it('이유가 많아져도 받은 수와 감점 기록은 남는다', () => {
        let board = {};
        let receiverBong = 100;
        for (let day = 1; day <= REBUKE_REASONS_KEPT + 1; day += 1) {
            const today = `2026-10-${String(day).padStart(2, '0')}`;
            const step = planPeerRebuke(board, {
                fromId: '1',
                toId: '2',
                today,
                reason: `이유${day}번입니다`,
                senderBong: 10,
                receiverBong,
            });
            assert.equal(step.ok, true, step.reason);
            receiverBong = step.receiverBong;
            board = step.board;
        }
        assert.equal(board.received['2'], 31);
        assert.equal(board.penaltyThrough['2'], 30);
        assert.equal(board.entries.length, REBUKE_REASONS_KEPT);
        const reasons = anonymousRebukeReasons(board, '2');
        assert.equal(reasons.length, REBUKE_REASONS_KEPT);
        assert.equal(reasons[0].reason, '이유31번입니다');
        assert.equal(reasons.some((row) => row.reason === '이유1번입니다'), false);
        assert.equal(hasKey(reasons, 'fromId'), false);
        assert.equal(rebukePenaltyForCount(31, board.penaltyThrough['2']).bong, 0);
        assert.equal(receiverBong, 70);
    });

    it('명단에 없는 친구와 잘못된 날짜는 거절한다', () => {
        assert.equal(planPeerRebuke({}, {
            fromId: '1',
            toId: '99',
            today: '2026-10-19',
            reason: '없는 번호',
            senderBong: 10,
            allowedIds: ['1', '2'],
        }).reason, 'who');
        assert.equal(planPeerRebuke({}, {
            fromId: '1',
            toId: '2',
            today: '어제',
            reason: '날짜 없음',
            senderBong: 10,
        }).reason, 'who');
        assert.equal(planPeerRebuke({}, {
            fromId: '1>2',
            toId: '3',
            today: '2026-10-19',
            reason: '이상한 번호',
            senderBong: 10,
        }).reason, 'who');
    });

    it('소수 봉은 버림하고 이유에 이름이 있으면 거절하며 같은 번호의 옛 이유는 새 이유로 바뀐다', () => {
        const named = planPeerRebuke({}, {
            fromId: '1',
            toId: '2',
            today: '2026-10-19',
            reason: '김라희가 떠들었어요',
            senderBong: 10,
            hiddenNames: ['김라희', '나'],
        });
        assert.equal(named.reason, 'name');
        const fraction = planPeerRebuke({}, {
            fromId: '1',
            toId: '2',
            today: '2026-10-19',
            reason: '떠들어서 수업이 멈췄어요',
            senderBong: 5.9,
            receiverBong: 8.2,
        });
        assert.equal(fraction.ok, true);
        assert.equal(fraction.senderBong, 0);
        const again = planPeerRebuke({
            received: {},
            entries: [{
                id: 'rb_2026-10-19_2_1',
                toId: '2',
                fromId: '9',
                reason: '옛 이유입니다',
                ymd: '2026-10-19',
            }],
        }, {
            fromId: '1',
            toId: '2',
            today: '2026-10-19',
            reason: '새 이유입니다',
            senderBong: 9.9,
            receiverBong: 8.2,
        });
        assert.equal(again.ok, true);
        assert.equal(again.senderBong, 4);
        const pub = rebukePublicView(again.board);
        const same = pub.entries.filter((row) => row.id === 'rb_2026-10-19_2_1');
        assert.equal(same.length, 1);
        assert.equal(same[0].reason, '새 이유입니다');
        assert.equal(hasKey(same, 'fromId'), false);
    });

    it('한 친구의 이유가 많아도 다른 친구 이유는 남는다', () => {
        let board = {
            received: { '3': 1 },
            entries: [{
                id: 'keep-3',
                toId: '3',
                fromId: '8',
                reason: '다른 친구 이유',
                ymd: '2026-10-01',
            }],
        };
        for (let day = 1; day <= REBUKE_REASONS_KEPT + 1; day += 1) {
            const step = planPeerRebuke(board, {
                fromId: '1',
                toId: '2',
                today: `2026-11-${String(day).padStart(2, '0')}`,
                reason: `이번${day}번째이유`,
                senderBong: 10,
                receiverBong: 100,
            });
            assert.equal(step.ok, true, step.reason);
            board = step.board;
        }
        assert.equal(board.entries.some((row) => row.id === 'keep-3' && row.reason === '다른 친구 이유'), true);
        assert.equal(anonymousRebukeReasons(board, '3')[0].reason, '다른 친구 이유');
        assert.equal(board.received['2'], 31);
    });
});
