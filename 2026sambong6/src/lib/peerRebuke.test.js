import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    countRebukeReceivedToday,
    defaultRebukeConfig,
    planPeerRebuke,
    rebukeFailMessage,
    rebukePenaltyTook,
    rebukePublicEvent,
    rebukeReasonIssue,
    receivedRebukeCount,
    visibleRebukeReasons,
} from './peerRebuke.js';

const names = ['김단엘', '김민지', '박하율'];

function plan(extra = {}) {
    return planPeerRebuke({
        config: defaultRebukeConfig(),
        fromId: '1',
        toId: '2',
        reason: '떠들어서 수업이 멈췄어요',
        hiddenNames: names,
        today: '2026-10-19',
        senderBong: 20,
        receiverBong: 30,
        sentN: 1,
        receivedToday: 0,
        ...extra,
    });
}

describe('역따봉 이유', () => {
    it('짧은 말, 기호만, 이름, 욕을 거절한다', () => {
        assert.equal(rebukeReasonIssue('아', names), 'short');
        assert.equal(rebukeReasonIssue('ㅋㅋ', names), 'symbol');
        assert.equal(rebukeReasonIssue('ㅠㅠ', names), 'symbol');
        assert.equal(rebukeReasonIssue('바 보', names), 'hurt');
        assert.equal(rebukeReasonIssue('바.보', names), 'hurt');
        assert.equal(rebukeReasonIssue('바1보', names), 'hurt');
        assert.equal(rebukeReasonIssue('ㅅㅂ', names), 'hurt');
        assert.equal(rebukeReasonIssue('ㅅ ㅂ', names), 'hurt');
        assert.equal(rebukeReasonIssue('ㅂㅅ', names), 'hurt');
        assert.equal(rebukeReasonIssue('ㅆㅂ', names), 'hurt');
        assert.equal(rebukeReasonIssue('ㅈㄹ', names), 'hurt');
        assert.equal(rebukeReasonIssue('김민지가 떠들었다', names), 'name');
        assert.equal(rebukeReasonIssue('떠들어서 수업이 멈췄어요', names), '');
        assert.match(rebukeFailMessage('symbol'), /ㅋㅋ/);
        assert.match(rebukeFailMessage('hurt'), /고운 말/);
    });
});

describe('역따봉 계획', () => {
    it('이벤트에 보낸 사람 번호가 없고 5봉을 낸다', () => {
        const made = plan();
        assert.equal(made.ok, true);
        assert.equal(made.event.fromId, undefined);
        assert.equal(made.event.authUid, undefined);
        assert.equal(made.audit.fromId, '1');
        assert.equal(made.senderBong, 15);
        assert.equal(made.took, 0);
        assert.equal(made.receiverBong, 30);
        assert.equal(made.event.seq, 1);
        assert.equal(made.eventId, 'e~1~1~student_2~1');
        const pub = rebukePublicEvent({ ...made.event, fromId: '1', authUid: 'abc' });
        assert.equal(pub.fromId, undefined);
        assert.equal(pub.authUid, undefined);
    });

    it('10번째에만 10봉을 깎고 -2000 아래로는 내려가지 않는다', () => {
        assert.equal(rebukePenaltyTook(9, 100), 0);
        assert.equal(rebukePenaltyTook(10, 100), 10);
        assert.equal(rebukePenaltyTook(20, -1995), 5);
        assert.equal(rebukePenaltyTook(10, -2000), 0);
        const tenth = plan({
            receiverSeq: 9,
            receiverEpoch: 1,
            receiverRoster: 1,
            receiverBong: 4,
        });
        assert.equal(tenth.seq, 10);
        assert.equal(tenth.took, 10);
        assert.equal(tenth.receiverBong, -6);
        const floored = plan({
            receiverSeq: 9,
            receiverEpoch: 1,
            receiverRoster: 1,
            receiverBong: -1996,
        });
        assert.equal(floored.took, 4);
        assert.equal(floored.receiverBong, -2000);
    });

    it('시즌이나 학생이 바뀌면 횟수를 1부터 다시 센다', () => {
        const next = plan({
            config: { enabled: true, epoch: 2, roster: { 2: 3 } },
            receiverSeq: 15,
            receiverEpoch: 1,
            receiverRoster: 1,
        });
        assert.equal(next.seq, 1);
        assert.equal(next.event.epoch, 2);
        assert.equal(next.event.rosterEpoch, 3);
        assert.equal(next.took, 0);
    });

    it('하루 3번을 넘기면 거절하고, 끄면 보내지 않는다', () => {
        assert.equal(plan({ receivedToday: 3 }).reason, 'receive');
        assert.equal(plan({ sentN: 4 }).reason, 'send');
        assert.equal(plan({ fromId: '2' }).reason, 'self');
        assert.equal(plan({ senderBong: 4 }).reason, 'balance');
        assert.equal(plan({ creditDefault: true }).reason, 'credit');
        assert.equal(plan({ config: { enabled: false, epoch: 1, roster: {} } }).reason, 'off');
    });

    it('받은 이유는 최근 30개만, 숨긴 글은 빼서 보여 준다', () => {
        const events = [];
        for (let seq = 1; seq <= 32; seq += 1) {
            events.push({
                epoch: 1,
                rosterEpoch: 1,
                toId: '2',
                ymd: '2026-10-19',
                seq,
                reason: `이유${seq}`,
                hidden: seq === 31,
            });
        }
        events.push({ epoch: 1, rosterEpoch: 1, toId: '9', seq: 1, reason: '다른 아이', hidden: false, ymd: '2026-10-19' });
        const shown = visibleRebukeReasons(events, '2', 1, 1);
        assert.equal(shown.length, 30);
        assert.equal(shown[0].seq, 2);
        assert.equal(shown.some((row) => row.seq === 31), false);
        assert.equal(countRebukeReceivedToday(events, '2', '2026-10-19', 1, 1), 32);
        assert.equal(receivedRebukeCount(events, '2', 1, 1), 32);
    });
});
