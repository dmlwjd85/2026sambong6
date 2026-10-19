import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deleteDoc, doc, getDoc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { defaultRebukeConfig, planPeerRebuke, rebukeTodayYmd } from './peerRebuke.js';

const emulatorOn = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = 'demo-sambong';
const today = () => rebukeTodayYmd(Date.now());

function studentPath(id) {
    return `artifacts/class1/public/data/students/student_${id}`;
}

function eventPath(id) {
    return `artifacts/class1/public/data/classOps/rebukeEvents/items/${id}`;
}

function auditPath(id) {
    return `artifacts/class1/public/data/classOps/rebukeAudit/items/${id}`;
}

function dailyPath(id) {
    return `artifacts/class1/public/data/classOps/rebukeDaily/items/${id}`;
}

function refundPath(id) {
    return `artifacts/class1/public/data/classOps/rebukeRefunds/items/${id}`;
}

function chargePath(id) {
    return `artifacts/class1/public/data/classOps/rebukeCharges/items/${id}`;
}

function duePath(id) {
    return `artifacts/class1/public/data/classOps/rebukeDue/items/${id}`;
}

function settlementPath(id) {
    return `artifacts/class1/public/data/classOps/rebukeSettlements/items/${id}`;
}

function waiverPath(id) {
    return `artifacts/class1/public/data/classOps/rebukeWaivers/items/${id}`;
}

function paybackPath(id) {
    return `artifacts/class1/public/data/classOps/rebukePaybacks/items/${id}`;
}

const configPath = 'artifacts/class1/public/data/classOps/rebukeConfig';

describe('firestore rules: 역따봉', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
    /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment | null} */
    let testEnv = null;

    before(async () => {
        testEnv = await initializeTestEnvironment({
            projectId,
            firestore: {
                rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
            },
        });
    });

    after(async () => {
        if (testEnv) await testEnv.cleanup();
    });

    beforeEach(async () => {
        await testEnv.clearFirestore();
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);
            await setDoc(doc(db, 'gmSessions/teacher1'), { classId: 'class1', expiresAt });
            await setDoc(doc(db, 'admins/teacher1'), {
                role: 'gm',
                email: 'teacher@school.kr',
                classIds: ['class1'],
            });
            await setDoc(doc(db, configPath), { ...defaultRebukeConfig(), enabled: true });
        });
    });

    function anon() {
        return testEnv.authenticatedContext('anon-student', {
            provider_id: 'anonymous',
            firebase: { sign_in_provider: 'anonymous' },
        }).firestore();
    }

    function teacher() {
        return testEnv.authenticatedContext('teacher1', {
            email: 'teacher@school.kr',
            firebase: { sign_in_provider: 'password' },
        }).firestore();
    }

    function signedOut() {
        return testEnv.unauthenticatedContext().firestore();
    }

    function other() {
        return testEnv.authenticatedContext('other-student', {
            provider_id: 'anonymous',
            firebase: { sign_in_provider: 'anonymous' },
        }).firestore();
    }

    async function seedStudent(id, extra = {}) {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), studentPath(id)), {
                xp: 10,
                bong: 50,
                ...extra,
            });
        });
    }

    function commitSend(db, made, uid = 'anon-student') {
        const batch = writeBatch(db);
        batch.set(doc(db, eventPath(made.eventId)), made.event);
        batch.set(doc(db, auditPath(made.eventId)), { ...made.audit, authUid: uid });
        batch.set(doc(db, chargePath(made.eventId)), { ...made.charge, authUid: uid });
        batch.set(doc(db, duePath(`${made.event.epoch}~${made.charge.fromId}`)), {
            fromId: made.charge.fromId,
            epoch: made.event.epoch,
            owed: 5,
            openYmd: made.event.ymd,
            n: 1,
            payerUid: uid,
            lastPaidYmd: '',
            eventId: made.eventId,
            settled: false,
        });
        batch.set(doc(db, dailyPath(made.daily.pairId)), { eventId: made.eventId });
        batch.set(doc(db, dailyPath(made.daily.sentId)), { eventId: made.eventId });
        batch.set(doc(db, dailyPath(made.daily.recvId)), { eventId: made.eventId });
        batch.set(doc(db, studentPath(made.event.toId)), {
            bong: made.receiverBong,
            rebukeSeq: made.seq,
            rebukeEpoch: made.event.epoch,
            rebukeRoster: made.event.rosterEpoch,
        }, { merge: true });
        return batch.commit();
    }

    function makePlan(extra = {}) {
        return planPeerRebuke({
            config: { ...defaultRebukeConfig(), enabled: true },
            fromId: '1',
            toId: '2',
            reason: '떠들어서 수업이 멈췄어요',
            today: today(),
            senderBong: 50,
            receiverBong: 50,
            sentN: 1,
            receivedToday: 0,
            ...extra,
        });
    }

    it('평소 보내기는 되고, 학생과 로그아웃은 감사 문서를 읽지 못한다', async () => {
        await seedStudent('1');
        await seedStudent('2');
        const made = makePlan();
        assert.equal(made.ok, true);
        await assertSucceeds(commitSend(anon(), made));
        await assertFails(getDoc(doc(anon(), auditPath(made.eventId))));
        await assertFails(getDoc(doc(signedOut(), auditPath(made.eventId))));
        await assertFails(getDoc(doc(signedOut(), eventPath(made.eventId))));
        const audit = await assertSucceeds(getDoc(doc(teacher(), auditPath(made.eventId))));
        assert.equal(audit.data().fromId, '1');
        assert.equal(audit.data().authUid, 'anon-student');
        const event = await getDoc(doc(anon(), eventPath(made.eventId)));
        assert.equal(event.data().fromId, undefined);
        assert.equal(event.data().reason, '떠들어서 수업이 멈췄어요');
        const sender = await getDoc(doc(anon(), studentPath('1')));
        assert.equal(sender.data().bong, 50);
        await assertSucceeds(getDoc(doc(anon(), chargePath(made.eventId))));
        await assertFails(getDoc(doc(other(), chargePath(made.eventId))));
        await assertSucceeds(getDoc(doc(teacher(), chargePath(made.eventId))));
    });

    it('감사 문서와 하루 제한 문서는 고치거나 지울 수 없다', async () => {
        await seedStudent('1');
        await seedStudent('2');
        const made = makePlan();
        await assertSucceeds(commitSend(anon(), made));
        await assertFails(setDoc(doc(anon(), auditPath(made.eventId)), { fromId: '9' }, { merge: true }));
        await assertFails(setDoc(doc(teacher(), auditPath(made.eventId)), { reason: '' }, { merge: true }));
        await assertFails(setDoc(doc(teacher(), dailyPath(made.daily.pairId)), { eventId: 'other' }));
        await assertFails(deleteDoc(doc(anon(), dailyPath(made.daily.sentId))));
        await assertFails(deleteDoc(doc(teacher(), dailyPath(made.daily.recvId))));
        await assertFails(deleteDoc(doc(teacher(), auditPath(made.eventId))));
    });

    it('역따봉 문서 없이 받은 횟수와 감점을 올리지 못한다', async () => {
        await seedStudent('2', { bong: 40 });
        await assertFails(setDoc(doc(anon(), studentPath('2')), {
            bong: 30,
            rebukeSeq: 10,
            rebukeEpoch: 1,
            rebukeRoster: 1,
        }, { merge: true }));
        await assertFails(setDoc(doc(anon(), studentPath('2')), {
            rebukeSeq: 1,
            rebukeEpoch: 1,
            rebukeRoster: 1,
        }, { merge: true }));
        const kept = await getDoc(doc(anon(), studentPath('2')));
        assert.equal(kept.data().bong, 40);
        assert.equal(kept.data().rebukeSeq, undefined);
    });

    it('빈 이유와 감점만 있는 쓰기는 거절한다', async () => {
        await seedStudent('1');
        await seedStudent('2');
        const made = makePlan();
        made.event.reason = '';
        made.audit.reason = '';
        await assertFails(commitSend(anon(), made));
        const penalty = makePlan({
            receiverSeq: 9,
            receiverEpoch: 1,
            receiverRoster: 1,
            receiverBong: 40,
        });
        penalty.event.took = 10;
        penalty.receiverBong = 30;
        delete penalty.event;
        await assertFails(setDoc(doc(anon(), studentPath('2')), {
            bong: 30,
            rebukeSeq: 10,
            rebukeEpoch: 1,
            rebukeRoster: 1,
        }, { merge: true }));
    });

    it('같은 날 네 번째 받기와 기능이 꺼진 보내기는 거절한다', async () => {
        await seedStudent('9', { bong: 80 });
        for (let n = 1; n <= 3; n += 1) {
            await seedStudent(String(n), { bong: 50 });
            const made = makePlan({
                fromId: String(n),
                toId: '9',
                senderBong: 50,
                receiverBong: 80,
                receiverSeq: n - 1,
                receiverEpoch: n === 1 ? undefined : 1,
                receiverRoster: n === 1 ? undefined : 1,
                receivedToday: n - 1,
                sentN: 1,
            });
            assert.equal(made.ok, true, made.reason);
            await assertSucceeds(commitSend(anon(), made));
        }
        await seedStudent('4');
        const fourth = makePlan({
            fromId: '4',
            toId: '9',
            receiverSeq: 3,
            receiverEpoch: 1,
            receiverRoster: 1,
            receivedToday: 2,
            sentN: 1,
        });
        fourth.event.recvN = 4;
        fourth.daily.recvId = fourth.daily.recvId.replace(/~3$/, '~4');
        await assertFails(commitSend(anon(), fourth));
        const again = makePlan({
            fromId: '4',
            toId: '9',
            receiverSeq: 3,
            receiverEpoch: 1,
            receiverRoster: 1,
            receivedToday: 2,
            sentN: 1,
        });
        await assertFails(commitSend(anon(), again));
        await assertSucceeds(setDoc(doc(teacher(), configPath), {
            enabled: false,
            epoch: 1,
            roster: {},
        }));
        await assertFails(setDoc(doc(anon(), configPath), { enabled: false }, { merge: true }));
        const blocked = makePlan({ fromId: '4', toId: '8' });
        await seedStudent('8');
        await assertFails(commitSend(anon(), blocked));
    });

    it('학생은 숨기기와 환불을 못 하고, 선생님 세션만 할 수 있다', async () => {
        await seedStudent('1', { bong: 50 });
        await seedStudent('2', {
            bong: 40,
            rebukeSeq: 9,
            rebukeEpoch: 1,
            rebukeRoster: 1,
        });
        const made = makePlan({
            receiverSeq: 9,
            receiverEpoch: 1,
            receiverRoster: 1,
            receiverBong: 40,
        });
        assert.equal(made.took, 10);
        await assertSucceeds(commitSend(anon(), made));
        await assertFails(setDoc(doc(anon(), eventPath(made.eventId)), {
            hidden: true,
            reason: '',
            reasonFold: '',
        }, { merge: true }));
        const anonDb = anon();
        const studentRefund = writeBatch(anonDb);
        studentRefund.set(doc(anonDb, refundPath(made.eventId)), { amount: 10, beforeBong: 30, afterBong: 40 });
        studentRefund.set(doc(anonDb, studentPath('2')), { bong: 40 }, { merge: true });
        await assertFails(studentRefund.commit());
        await assertSucceeds(setDoc(doc(teacher(), eventPath(made.eventId)), {
            hidden: true,
            reason: '',
            reasonFold: '',
        }, { merge: true }));
        const hidden = await getDoc(doc(anon(), eventPath(made.eventId)));
        assert.equal(hidden.data().reason, '');
        assert.equal(hidden.data().hidden, true);
        const teacherDb = teacher();
        const refund = writeBatch(teacherDb);
        refund.set(doc(teacherDb, refundPath(made.eventId)), { amount: 10, beforeBong: 30, afterBong: 40 });
        refund.set(doc(teacherDb, studentPath('2')), { bong: 40 }, { merge: true });
        await assertSucceeds(refund.commit());
        const refundAgain = writeBatch(teacherDb);
        refundAgain.set(doc(teacherDb, refundPath(made.eventId)), { amount: 10, beforeBong: 40, afterBong: 50 });
        refundAgain.set(doc(teacherDb, studentPath('2')), { bong: 50 }, { merge: true });
        await assertFails(refundAgain.commit());
    });

    it('선생님 세대 변경 없이 받은 횟수를 0으로 되돌리지 못한다', async () => {
        await seedStudent('2', { bong: 15, rebukeSeq: 4, rebukeEpoch: 1, rebukeRoster: 1 });
        const teacherDb = teacher();
        await assertFails(setDoc(doc(teacherDb, studentPath('2')), {
            rebukeSeq: 0,
            rebukeEpoch: 1,
            rebukeRoster: 1,
        }, { merge: true }));
        const batch = writeBatch(teacherDb);
        batch.set(doc(teacherDb, configPath), {
            enabled: true,
            epoch: 2,
            roster: {},
        });
        batch.set(doc(teacherDb, studentPath('2')), {
            rebukeSeq: 0,
            rebukeEpoch: 2,
            rebukeRoster: 1,
        }, { merge: true });
        await assertSucceeds(batch.commit());
        await assertSucceeds(setDoc(doc(anon(), studentPath('2')), { bong: 15 }, { merge: true }));
    });

    it('받은 횟수가 있는 학생 문서를 만들 수 없고, 봉만 바꾸는 저장은 된다', async () => {
        await assertFails(setDoc(doc(anon(), studentPath('7')), {
            xp: 0,
            bong: 0,
            rebukeSeq: 9,
            rebukeEpoch: 1,
            rebukeRoster: 1,
        }));
        await seedStudent('7', { bong: 12, rebukeSeq: 2, rebukeEpoch: 1, rebukeRoster: 1 });
        await assertSucceeds(setDoc(doc(anon(), studentPath('7')), { bong: 11 }, { merge: true }));
        const saved = await getDoc(doc(anon(), studentPath('7')));
        assert.equal(saved.data().rebukeSeq, 2);
        assert.equal(saved.data().bong, 11);
    });

    it('기본으로 꺼져 있고, 학생은 켜지 못한다', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await deleteDoc(doc(context.firestore(), configPath));
        });
        await assertFails(setDoc(doc(anon(), configPath), { enabled: true, epoch: 1, roster: {} }));
        await assertSucceeds(setDoc(doc(anon(), configPath), defaultRebukeConfig()));
        await seedStudent('1');
        await seedStudent('2');
        await assertFails(commitSend(anon(), makePlan()));
        const teacherDb = teacher();
        await assertSucceeds(setDoc(doc(teacherDb, configPath), { enabled: true, epoch: 1, roster: {} }));
        await assertSucceeds(commitSend(anon(), makePlan()));
    });

    it('금칙어는 화면 정규화와 원문 둘 다에서 거절한다', async () => {
        await seedStudent('1');
        await seedStudent('2');
        const samples = [
            '바 보', '바.보', '바1보', '멍청이', '좆같아', '시1발놈', 'ㅅ ㅂ', 'qkqh', 'tlqkf', '꺼져 돼지야',
            '미친놈', '씨바', '시바', '18놈', 'ㅅ1ㅂ', 'fuck', 'rjwu', '닥쳐', '등신', '또라이', 'ｆｕｃｋ', '미 친놈', '씨1바', 'FUCK',
        ];
        for (const reason of samples) {
            const made = makePlan();
            made.event.reason = reason;
            made.event.reasonFold = '수업좋아요';
            made.audit.reason = reason;
            made.audit.reasonFold = '수업좋아요';
            await assertFails(commitSend(anon(), made));
        }
    });

    it('소수 봉도 역따봉을 받을 수 있다', async () => {
        await seedStudent('1', { bong: 100.5 });
        await seedStudent('2', { bong: 100.5 });
        const made = makePlan({ senderBong: 100.5, receiverBong: 100.5 });
        assert.equal(made.ok, true);
        assert.equal(made.receiverBong, 100.5);
        await assertSucceeds(commitSend(anon(), made));
        const receiver = await getDoc(doc(anon(), studentPath('2')));
        assert.equal(receiver.data().bong, 100.5);
    });

    it('선생님에게 보내거나 선생님 이름으로 보내지 못한다', async () => {
        await seedStudent('1');
        await seedStudent('2');
        await seedStudent('gm', { bong: 50 });
        const asTeacher = makePlan();
        asTeacher.audit.fromId = 'gm';
        asTeacher.charge.fromId = 'gm';
        await assertFails(commitSend(anon(), asTeacher));
        const toTeacher = makePlan();
        toTeacher.event.toId = 'gm';
        toTeacher.eventId = 'e~1~1~student_gm~1';
        toTeacher.audit.toId = 'gm';
        toTeacher.charge.toId = 'gm';
        toTeacher.daily.pairId = 'p~1~' + today() + '~1~gm';
        toTeacher.daily.recvId = 'r~1~' + today() + '~gm~1';
        await assertFails(commitSend(anon(), toTeacher));
    });

    it('감점 뒤에 봉이 바뀌어도 지금 값에 더해 되돌린다', async () => {
        await seedStudent('1');
        await seedStudent('2', { bong: 40, rebukeSeq: 9, rebukeEpoch: 1, rebukeRoster: 1 });
        const made = makePlan({
            receiverSeq: 9,
            receiverEpoch: 1,
            receiverRoster: 1,
            receiverBong: 40,
        });
        await assertSucceeds(commitSend(anon(), made));
        await assertSucceeds(setDoc(doc(anon(), studentPath('2')), { bong: 41 }, { merge: true }));
        const teacherDb = teacher();
        const refund = writeBatch(teacherDb);
        refund.set(doc(teacherDb, refundPath(made.eventId)), { amount: 10, beforeBong: 41, afterBong: 51 });
        refund.set(doc(teacherDb, studentPath('2')), { bong: 51 }, { merge: true });
        await assertSucceeds(refund.commit());
        const saved = await getDoc(doc(teacherDb, studentPath('2')));
        assert.equal(saved.data().bong, 51);
    });

    it('같은 날에는 5봉을 빼지 않고 다음 날에만 정산한다', async () => {
        await seedStudent('1', { bong: 50 });
        await seedStudent('2');
        const made = makePlan();
        await assertSucceeds(commitSend(anon(), made));
        const senderDb = anon();
        const todaySettle = writeBatch(senderDb);
        todaySettle.set(doc(senderDb, settlementPath(`due~1~1~${today()}`)), {
            amount: 5,
            bongBefore: 50,
            bongAfter: 45,
            authUid: 'anon-student',
            epoch: 1,
            fromId: '1',
        });
        todaySettle.update(doc(senderDb, duePath('1~1')), {
            owed: 0,
            n: 0,
            openYmd: '',
            settled: true,
            payerUid: 'anon-student',
        });
        todaySettle.set(doc(senderDb, studentPath('1')), { bong: 45 }, { merge: true });
        await assertFails(todaySettle.commit());
        const kept = await getDoc(doc(anon(), studentPath('1')));
        assert.equal(kept.data().bong, 50);
        await assertFails(getDoc(doc(other(), duePath('1~1'))));
    });

    it('로그인 기기가 바뀌어도 지난 5봉은 학생 번호로 정산하고, 내기 전에는 더 보내지 못한다', async () => {
        await seedStudent('1', {
            bong: 30,
            pin: '1234',
            quests: {},
            questHistory: [],
            inventory: [],
            ownedSkins: {},
            equippedSkins: {},
            bankLoan: null,
            bankTermDeposits: [],
            dragonBalls: [],
            shopDailyPurchase: { date: '2026-10-19', item_xp_pack: 0 },
            lunchBid: { date: '', amount: 0 },
            bongChangeLog: [{ at: 1, reason: '저장', delta: 0 }],
            statusMessage: '',
            unlockedFeatures: {},
        });
        await seedStudent('2');
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, duePath('1~1')), {
                fromId: '1',
                epoch: 1,
                owed: 5,
                openYmd: '2000-01-01',
                n: 1,
                payerUid: 'old-device',
                lastPaidYmd: '',
                eventId: 'old-event',
                settled: false,
            });
            await setDoc(doc(db, chargePath('old-fee')), {
                fromId: '1',
                toId: '2',
                authUid: 'old-device',
                ymd: '2000-01-01',
                amount: 5,
                epoch: 1,
            });
        });
        await assertFails(getDoc(doc(other(), duePath('1~1'))));
        await assertFails(getDoc(doc(other(), chargePath('old-fee'))));
        await assertFails(commitSend(other(), makePlan({ senderBong: 30 })));

        const fresh = other();
        const settle = writeBatch(fresh);
        settle.set(doc(fresh, settlementPath(`due~1~1~${today()}`)), {
            amount: 5,
            bongBefore: 30,
            bongAfter: 25,
            authUid: 'other-student',
            epoch: 1,
            fromId: '1',
        });
        settle.update(doc(fresh, duePath('1~1')), {
            owed: 0,
            n: 0,
            openYmd: '',
            settled: true,
            payerUid: 'other-student',
        });
        settle.update(doc(fresh, studentPath('1')), { bong: 25 });
        await assertSucceeds(settle.commit());
        const paid = await getDoc(doc(other(), studentPath('1')));
        assert.equal(paid.data().bong, 25);
        await assertSucceeds(getDoc(doc(other(), duePath('1~1'))));

        const teacherDb = teacher();
        const payback = writeBatch(teacherDb);
        payback.set(doc(teacherDb, paybackPath('old-fee')), {
            amount: 5,
            beforeBong: 25,
            afterBong: 30,
            authUid: 'old-device',
        });
        payback.update(doc(teacherDb, studentPath('1')), { bong: 30 });
        await assertSucceeds(payback.commit());
    });

    it('정산 전에 면제하면 5봉을 빼지 않는다', async () => {
        await seedStudent('1', { bong: 20 });
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), chargePath('waived')), {
                fromId: '1',
                toId: '2',
                authUid: 'anon-student',
                ymd: '2000-01-01',
                amount: 5,
                epoch: 1,
            });
        });
        const teacherDb = teacher();
        await assertSucceeds(setDoc(doc(teacherDb, waiverPath('waived')), {
            authUid: 'anon-student',
            fromId: '1',
        }));
        const blockedDb = anon();
        const blocked = writeBatch(blockedDb);
        blocked.set(doc(blockedDb, settlementPath('waived')), {
            amount: 5,
            bongBefore: 20,
            bongAfter: 15,
            authUid: 'anon-student',
        });
        blocked.set(doc(blockedDb, studentPath('1')), { bong: 15 }, { merge: true });
        await assertFails(blocked.commit());
        const kept = await getDoc(doc(anon(), studentPath('1')));
        assert.equal(kept.data().bong, 20);
    });

    it('시즌이 바뀌면 옛 이유를 비운다', async () => {
        await seedStudent('1');
        await seedStudent('2');
        const made = makePlan();
        await assertSucceeds(commitSend(anon(), made));
        await assertFails(setDoc(doc(anon(), eventPath(made.eventId)), {
            reason: '',
            reasonFold: '',
        }, { merge: true }));
        const teacherDb = teacher();
        await assertSucceeds(setDoc(doc(teacherDb, configPath), { enabled: true, epoch: 2, roster: {} }));
        await assertSucceeds(setDoc(doc(teacherDb, eventPath(made.eventId)), {
            reason: '',
            reasonFold: '',
        }, { merge: true }));
        const cleared = await getDoc(doc(anon(), eventPath(made.eventId)));
        assert.equal(cleared.data().reason, '');
        assert.equal(cleared.data().reasonFold, '');
    });
});
