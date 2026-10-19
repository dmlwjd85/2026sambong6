import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    countRebukeReceivedToday,
    defaultRebukeConfig,
    planPeerRebuke,
    planRebukeDue,
    rebukeFailMessage,
    rebukePenaltyTook,
    rebukePublicEvent,
    rebukeReasonFold,
    rebukeReasonIssue,
    receivedRebukeCount,
    visibleRebukeReasons,
} from './peerRebuke.js';

const names = ['김단엘', '김민지', '김라희', '박하율', '손님', '마스터 J'];

function plan(extra = {}) {
    return planPeerRebuke({
        config: { ...defaultRebukeConfig(), enabled: true },
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
        assert.equal(rebukeReasonIssue('김민지가 떠들었다', names), 'name');
        assert.equal(rebukeReasonIssue('김라희가 밀쳤어요', names), 'name');
        assert.equal(rebukeReasonIssue('라희가 밀쳤어요', names), 'name');
        assert.equal(rebukeReasonIssue('손님 응대를 잘했어요', names), '');
        assert.equal(rebukeReasonIssue('떠들어서 수업이 멈췄어요', names), '');
        assert.match(rebukeFailMessage('symbol'), /ㅋㅋ/);
        assert.match(rebukeFailMessage('hurt'), /고운 말/);
    });

    it('띄어쓰기와 영타, 초성, 비하 표현을 거절한다', () => {
        const blocked = [
            '바 보', '바1보', 'ㅂ ㅅ', '멍.청.이', 'ㅄ아', 'qkqh', 'tlqkf',
            'QKQH', '죽어', '꺼져 돼지야', '찐따', '개새기',
            '바.보', '멍청이', '좆같아', '시1발놈', 'ㅅ ㅂ',
            '미친놈', '씨바', '시바', '18놈', 'ㅅ1ㅂ', 'fuck', 'rjwu', '닥쳐', '등신', '또라이',
            'ｆｕｃｋ', '미 친놈', '씨1바', 'FUCK',
        ];
        blocked.forEach((text) => {
            assert.equal(rebukeReasonIssue(text, names), 'hurt', text);
        });
        assert.equal(rebukeReasonFold('qkqh'), '바보');
        assert.equal(rebukeReasonFold('tlqkf'), '시발');
        assert.equal(rebukeReasonFold('ㅄ아'), 'ㅂㅅ아');
        assert.equal(rebukeReasonFold('바 보'), '바보');
        assert.equal(rebukeReasonFold('바1보'), '바1보');
    });
});

describe('역따봉 정산 장부', () => {
    it('기기가 바뀌면 안 낸 빚이 있을 때 더 보내지 못하고, 낸 뒤에는 다시 쌓인다', () => {
        const blocked = planRebukeDue({
            fromId: '1',
            epoch: 1,
            owed: 5,
            openYmd: '2026-10-18',
            n: 1,
            payerUid: 'old-device',
            lastPaidYmd: '',
            eventId: 'e1',
            settled: false,
        }, {
            fromId: '1',
            epoch: 1,
            ymd: '2026-10-19',
            payerUid: 'new-device',
            eventId: 'e2',
        });
        assert.equal(blocked.reason, 'due');
        const sameDay = planRebukeDue({
            fromId: '1',
            epoch: 1,
            owed: 5,
            openYmd: '2026-10-19',
            n: 1,
            payerUid: 'old-device',
            lastPaidYmd: '',
            eventId: 'e1',
            settled: false,
        }, {
            fromId: '1',
            epoch: 1,
            ymd: '2026-10-19',
            payerUid: 'new-device',
            eventId: 'e2',
        });
        assert.equal(sameDay.reason, 'due');
        const again = planRebukeDue({
            fromId: '1',
            epoch: 1,
            owed: 0,
            openYmd: '',
            n: 0,
            payerUid: 'new-device',
            lastPaidYmd: '2026-10-18',
            eventId: 'e1',
            settled: true,
        }, {
            fromId: '1',
            epoch: 1,
            ymd: '2026-10-19',
            payerUid: 'new-device',
            eventId: 'e2',
        });
        assert.equal(again.ok, true);
        assert.equal(again.due.owed, 5);
        assert.equal(again.due.n, 1);
        assert.equal(again.due.openYmd, '2026-10-19');
        assert.equal(again.id, '1~1');
    });
});

describe('역따봉 계획', () => {
    it('기본은 꺼져 있고, 켠 뒤에만 보낸다', () => {
        assert.equal(defaultRebukeConfig().enabled, false);
        assert.equal(planPeerRebuke({
            config: defaultRebukeConfig(),
            fromId: '1',
            toId: '2',
            reason: '떠들어서 수업이 멈췄어요',
            today: '2026-10-19',
            senderBong: 20,
            receiverBong: 30,
            sentN: 1,
        }).reason, 'off');
    });

    it('이벤트에 보낸 사람 번호가 없고 5봉은 나중에 정산한다', () => {
        const made = plan();
        assert.equal(made.ok, true);
        assert.equal(made.event.fromId, undefined);
        assert.equal(made.event.authUid, undefined);
        assert.equal(made.audit.fromId, '1');
        assert.equal(made.senderBong, 20);
        assert.equal(made.charge.amount, 5);
        assert.equal(made.charge.fromId, '1');
        assert.equal(made.event.reasonFold, '떠들어서수업이멈췄어요');
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

    it('소수 봉도 받을 수 있다', () => {
        const made = plan({ receiverBong: 100.5 });
        assert.equal(made.ok, true);
        assert.equal(made.event.bongBefore, 100.5);
        assert.equal(made.receiverBong, 100.5);
        const tenth = plan({
            receiverBong: 100.5,
            receiverSeq: 9,
            receiverEpoch: 1,
            receiverRoster: 1,
        });
        assert.equal(tenth.took, 10);
        assert.equal(tenth.receiverBong, 90.5);
    });

    it('선생님에게 보내거나 선생님 이름으로 보내지 않는다', () => {
        assert.equal(plan({ toId: 'gm' }).reason, 'staff');
        assert.equal(plan({ fromId: 'gm' }).reason, 'staff');
        assert.equal(plan({ toId: 'gm_a' }).reason, 'staff');
        assert.equal(plan({ fromId: 'gm_a' }).reason, 'staff');
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
        assert.equal(plan({ senderBong: 10, sentN: 3 }).reason, 'balance');
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
