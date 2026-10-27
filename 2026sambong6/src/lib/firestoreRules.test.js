import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deleteDoc, deleteField, doc, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { classXpCatchupSlot } from './classXpSlot.js';
import {
    clearedLearningThermometerLegacy,
    finishThermometerSettlement,
    grantThermometerStudentXp,
    planThermometerSettlement,
    settleThermometerResolvingPrior,
} from './learningThermometerSettlement.js';
import { planThermometerLegacyVoteWrites } from './learningThermometerVotes.js';
import {
    applyBoardRoomGame,
    approveJoinBoardRoom,
    boardRoomToDoc,
    closeBoardRoom,
    continueBoardRoom,
    createBoardRoom,
    finishBoardRoom,
    requestJoinBoardRoom,
} from './boardGameRooms.js';
import { GOMOKU_BLACK, placeGomokuStone } from './gomokuGame.js';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const emulatorOn = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = 'demo-sambong';
const settingsPath = 'artifacts/class1/public/data/settings/global';

function validDiscount(extra = {}) {
    return {
        enabled: true,
        percent: 20,
        startAt: 1000,
        endAt: 2000,
        scope: 'skins',
        ...extra,
    };
}

describe('firestore rules: admins 허용목록', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
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
            await setDoc(doc(db, settingsPath), {
                shieldStock: 5,
                lotto: { round: 1 },
                season1ItemsRefundedAt: 1700000000000,
            });
            await setDoc(doc(db, 'admins/teacher1'), {
                role: 'gm',
                email: 'teacher@school.kr',
                classIds: ['class1', 'new-class'],
            });
            await setDoc(doc(db, 'admins/teacher-other'), {
                role: 'gm',
                email: 'other@school.kr',
                classIds: ['other-class'],
            });
            await setDoc(doc(db, 'admins/seed-teacher'), {
                role: 'gm',
                email: 'seed@school.kr',
                classIds: ['sambong-class-2026'],
            });
            await setDoc(doc(db, 'admins/anon-student'), {
                role: 'gm',
                email: 'anon@school.kr',
                classIds: ['class1'],
            });
        });
    });

    function anon() {
        return testEnv.authenticatedContext('anon-student', {
            provider_id: 'anonymous',
            firebase: { sign_in_provider: 'anonymous' },
        });
    }

    function stranger() {
        return testEnv.authenticatedContext('stranger', {
            email: 'stranger@school.kr',
            firebase: { sign_in_provider: 'password' },
        });
    }

    function teacher() {
        return testEnv.authenticatedContext('teacher1', {
            email: 'teacher@school.kr',
            firebase: { sign_in_provider: 'password' },
        });
    }

    function otherTeacher() {
        return testEnv.authenticatedContext('teacher-other', {
            email: 'other@school.kr',
            firebase: { sign_in_provider: 'password' },
        });
    }

    function seedTeacher() {
        return testEnv.authenticatedContext('seed-teacher', {
            email: 'seed@school.kr',
            firebase: { sign_in_provider: 'password' },
        });
    }

    function autoXpKey(slotMs) {
        const kst = new Date(slotMs + 9 * 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        return `${kst.getUTCFullYear()}_${pad(kst.getUTCMonth() + 1)}_${pad(kst.getUTCDate())}_${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
    }

    function kstSlot(year, month, day, hour, minute) {
        return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - 9 * 60 * 60 * 1000;
    }

    function shiftKstDate(year, month, day, deltaDays) {
        const shifted = new Date(Date.UTC(year, month - 1, day) + deltaDays * 86400000);
        return [shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()];
    }

    function classEndSlotsAround(nowMs) {
        const kst = new Date(nowMs + 9 * 60 * 60 * 1000);
        const bells = [[9, 40], [10, 30], [11, 20], [12, 10], [13, 50], [14, 40]];
        const slots = [];
        for (let day = -2; day <= 2; day += 1) {
            const [year, month, date] = shiftKstDate(kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate(), day);
            bells.forEach(([hour, minute]) => slots.push(kstSlot(year, month, date, hour, minute)));
        }
        return slots.sort((a, b) => a - b);
    }

    function autoXpPayload(slotMs, key = autoXpKey(slotMs)) {
        return {
            lastAutoXpTime: key,
            slotMs,
        };
    }

    function thermometerPayload(extra = {}) {
        return {
            date: '2026-10-15',
            min: -20,
            max: 20,
            settledDate: '',
            lastSettlementAt: 0,
            settlementKey: '',
            settlementStatus: '',
            settlementStartedAt: 0,
            settlementLockOwner: '',
            settlementAttempt: 0,
            usedStaleValues: false,
            settlementAppliedCount: 0,
            settlementTotalDelta: 0,
            ...extra,
        };
    }

    it('익명 세션은 updatedBy가 있어도 할인을 저장한다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount({ updatedBy: 'gm' }),
        }, { merge: true }));
    });

    it('허용목록에 없는 로그인 계정도 할인과 GM 전용 키를 저장한다', async () => {
        const db = stranger().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount(),
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            shopPrices: { item_a: 10 },
        }, { merge: true }));
    });

    it('admins에 있는 계정은 updatedBy 없이 할인을 저장한다', async () => {
        const db = teacher().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount(),
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            shopDiscount: { enabled: false, percent: 0 },
        }, { merge: true }));
    });

    it('할인 형식 검사를 유지한다', async () => {
        const db = teacher().firestore();
        await assertFails(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount({ percent: 101 }),
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount({ percent: -1 }),
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount({ percent: 12.5 }),
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount({ startAt: 5000, endAt: 5000 }),
        }, { merge: true }));
    });

    it('익명 로그인은 이자율과 공지 같은 GM 전용 키를 저장한다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            bankInterestPercent: 1000,
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            announcement: '학생 공지',
            dragonBallFindXp: 9999,
        }, { merge: true }));
    });

    it('로그인한 사용자는 다른 학급 이자율과 새 학급 설정도 저장한다', async () => {
        const own = teacher().firestore();
        await assertSucceeds(setDoc(doc(own, settingsPath), {
            bankInterestPercent: 3,
        }, { merge: true }));
        const other = otherTeacher().firestore();
        await assertSucceeds(setDoc(doc(other, settingsPath), {
            bankInterestPercent: 1000,
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(other, 'artifacts/brand-new-class/public/data/settings/global'), {
            raidPassword: '9999',
        }));
    });

    it('익명 로그인은 시즌1 환불 표식과 레이드 준비 키를 저장한다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            season1ItemsRefundedAt: 1,
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            season1ItemsRefundedAt: deleteField(),
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            raidPasswordNeedsSetup: false,
        }, { merge: true }));
    });

    it('수업 XP 공지 문서는 현재 KST 종 시각이 아니면 쓰지 못한다', async () => {
        const db = anon().firestore();
        const path = 'artifacts/class1/public/data/settings/autoXp';
        const now = Date.now();
        const slots = classEndSlotsAround(now);
        const recent = Math.max(...slots.filter((slot) => slot <= now + 15000));
        const prev = Math.max(...slots.filter((slot) => slot < recent));
        const future = Math.min(...slots.filter((slot) => slot > now + 15000));
        assert.ok(recent >= prev + 2400000);
        await assertFails(setDoc(doc(db, path), autoXpPayload(prev, '2026_01_01_09:40')));
        await assertFails(setDoc(doc(db, path), { ...autoXpPayload(prev), announcement: '선생님: 오늘 숙제 없음' }));
        await assertFails(setDoc(doc(db, path), autoXpPayload(prev + 1000)));
        await assertFails(setDoc(doc(db, path), autoXpPayload(future)));
        const catchup = classXpCatchupSlot(new Date());
        if (catchup) {
            await assertFails(setDoc(doc(db, path), autoXpPayload(prev)));
            if (recent !== catchup.slotMs) {
                await assertFails(setDoc(doc(db, path), autoXpPayload(recent)));
            }
            await assertSucceeds(setDoc(doc(db, path), autoXpPayload(catchup.slotMs)));
            await assertFails(setDoc(doc(db, path), autoXpPayload(catchup.slotMs)));
        } else {
            await assertFails(setDoc(doc(db, path), autoXpPayload(prev)));
            await assertFails(setDoc(doc(db, path), autoXpPayload(recent)));
        }
        await assertFails(deleteDoc(doc(db, path)));
    });

    it('수업 XP 슬롯 키는 현재 종 시각의 +5와 함께만 학생 문서에 기록된다', async () => {
        const studentPath = 'artifacts/class1/public/data/students/student_3';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), studentPath), {
                xp: 10,
                bong: 0,
                lastClassXpSlot: '2026_10_15_09:40',
            });
        });
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, 'artifacts/class1/public/data/students/student_9'), {
            xp: 0,
            bong: 0,
        }));
        await assertFails(setDoc(doc(db, 'artifacts/class1/public/data/students/student_8'), {
            xp: 5,
            bong: 0,
            lastClassXpSlot: '2026_10_15_09:40',
        }));
        await assertSucceeds(setDoc(doc(db, studentPath), { xp: 12 }, { merge: true }));
        await assertFails(setDoc(doc(db, studentPath), {
            lastClassXpSlot: '2099_01_01_09:40',
        }, { merge: true }));
        await assertFails(setDoc(doc(db, studentPath), {
            xp: 17,
            lastClassXpSlot: '2099_01_01_09:40',
        }, { merge: true }));
        const catchup = classXpCatchupSlot(new Date());
        await assertFails(setDoc(doc(db, 'artifacts/class1/public/data/students/student_9'), {
            xp: 'x',
            lastClassXpSlot: catchup ? catchup.key : '2026_10_15_14:40',
        }, { merge: true }));
        if (catchup) {
            await assertFails(setDoc(doc(db, studentPath), {
                xp: 16,
                lastClassXpSlot: catchup.key,
            }, { merge: true }));
            await assertSucceeds(setDoc(doc(db, studentPath), {
                xp: 17,
                lastClassXpSlot: catchup.key,
            }, { merge: true }));
            if (catchup.timeStr !== '09:40') {
                await assertFails(setDoc(doc(db, studentPath), {
                    xp: 22,
                    lastClassXpSlot: catchup.key.replace(/\d{2}:\d{2}$/, '09:40'),
                }, { merge: true }));
            }
            await assertFails(setDoc(doc(db, studentPath), {
                xp: 22,
                lastClassXpSlot: '2099_01_01_14:40',
            }, { merge: true }));
        } else {
            await assertFails(setDoc(doc(db, studentPath), {
                xp: 17,
                lastClassXpSlot: '2026_10_15_14:40',
            }, { merge: true }));
        }
        await assertFails(setDoc(doc(db, studentPath), {
            lastClassXpSlot: deleteField(),
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, studentPath), {
            xp: 0,
            bong: 0,
            lastClassXpSlot: deleteField(),
        }, { merge: true }));
    });

    it('학습 온도계 값은 학생 문서에만, 정산 필드는 선생님만 저장한다', async () => {
        const anonDb = anon().firestore();
        const teacherDb = teacher().firestore();
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        const vote = `${path}/votes/2`;
        await assertFails(setDoc(doc(anonDb, vote), { value: 1 }));
        await assertSucceeds(setDoc(doc(anonDb, path), thermometerPayload()));
        await assertSucceeds(setDoc(doc(anonDb, path), thermometerPayload({ max: 100 })));
        await assertFails(setDoc(doc(anonDb, path), thermometerPayload({ values: { '2': 20 } })));
        await assertSucceeds(setDoc(doc(teacherDb, path), thermometerPayload()));
        await assertSucceeds(setDoc(doc(anonDb, vote), { value: 5 }));
        await assertSucceeds(setDoc(doc(teacherDb, vote), { value: 5 }));
        await assertFails(setDoc(doc(teacherDb, vote), { value: 21 }));
        await assertFails(setDoc(doc(teacherDb, vote), { value: 5, note: '조작' }));
        await assertSucceeds(setDoc(doc(anonDb, `${path}/votes/anon-student`), { value: -3 }));
        await assertSucceeds(setDoc(doc(otherTeacher().firestore(), vote), { value: 1 }));
        await assertSucceeds(setDoc(doc(anonDb, path), {
            settlementStatus: 'done',
            settlementKey: '2026-10-15',
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(teacherDb, path), thermometerPayload({
            max: 30,
            settlementStatus: 'done',
            settlementKey: '2026-10-15',
            settledDate: '2026-10-15',
        })));
        await assertSucceeds(setDoc(doc(teacherDb, vote), { value: 21 }));
        await assertFails(setDoc(doc(teacherDb, vote), { value: 31 }));
        await assertSucceeds(setDoc(doc(anonDb, path), {
            usedStaleValues: true,
            settlementLockOwner: 'student-tab',
        }, { merge: true }));
        await assertFails(setDoc(doc(teacherDb, path), { usedStaleValues: 'yes' }, { merge: true }));
        await assertFails(setDoc(doc(teacherDb, path), { settlementLockOwner: 'x'.repeat(81) }, { merge: true }));
        await assertSucceeds(setDoc(doc(teacherDb, path), {
            usedStaleValues: true,
            settlementLockOwner: 'tabA',
            settlementAttempt: 2,
        }, { merge: true }));
        await assertFails(deleteDoc(doc(anonDb, path)));
    });

    function oldThermometerPayload(extra = {}) {
        const payload = thermometerPayload(extra);
        delete payload.settlementLockOwner;
        delete payload.settlementAttempt;
        delete payload.usedStaleValues;
        return payload;
    }

    it('D1: 예전 클라이언트 정산 쓰기는 새 필드 없이도 통과하고, 새 필드는 있을 때만 검사한다', async () => {
        const teacherDb = teacher().firestore();
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        const oldPayload = oldThermometerPayload({
            date: '2026-10-16',
            settlementKey: '2026-10-16',
            settlementStatus: 'running',
            settlementStartedAt: 1800000000000,
        });
        assert.equal('settlementLockOwner' in oldPayload, false);
        assert.equal('settlementAttempt' in oldPayload, false);
        assert.equal('usedStaleValues' in oldPayload, false);
        await assertSucceeds(setDoc(doc(anon().firestore(), path), oldPayload));
        await assertSucceeds(setDoc(doc(teacherDb, path), oldPayload));
        const created = await getDoc(doc(teacherDb, path));
        assert.equal(created.data().settlementStatus, 'running');
        assert.equal('settlementLockOwner' in created.data(), false);
        assert.equal('settlementAttempt' in created.data(), false);
        assert.equal('usedStaleValues' in created.data(), false);

        await assertSucceeds(setDoc(doc(teacherDb, path), thermometerPayload({
            date: '2026-10-16',
            settlementKey: '2026-10-16',
            settlementStatus: 'running',
            settlementStartedAt: 1800000000000,
            settlementLockOwner: 'tabA',
            settlementAttempt: 1,
            usedStaleValues: false,
        })));
        await assertSucceeds(setDoc(doc(teacherDb, path), oldPayload));
        const overwritten = await getDoc(doc(teacherDb, path));
        assert.equal(overwritten.data().settlementStatus, 'running');
        assert.equal('settlementLockOwner' in overwritten.data(), false);

        await assertSucceeds(setDoc(doc(teacherDb, path), {
            max: 25,
        }, { merge: true }));
        await assertFails(setDoc(doc(teacherDb, path), { settlementLockOwner: 1 }, { merge: true }));
        await assertFails(setDoc(doc(teacherDb, path), { settlementAttempt: 1.5 }, { merge: true }));
        await assertFails(setDoc(doc(teacherDb, path), { settlementAttempt: -1 }, { merge: true }));
        await assertFails(setDoc(doc(teacherDb, path), { usedStaleValues: 'yes' }, { merge: true }));
        await assertSucceeds(setDoc(doc(teacherDb, path), {
            settlementLockOwner: 'tabB',
            settlementAttempt: 3,
            usedStaleValues: true,
        }, { merge: true }));
        const upgraded = await getDoc(doc(teacherDb, path));
        assert.equal(upgraded.data().settlementLockOwner, 'tabB');
        assert.equal(upgraded.data().settlementAttempt, 3);
        assert.equal(upgraded.data().usedStaleValues, true);
        assert.equal(upgraded.data().max, 25);
    });

    function grantArgs(db, { studentId, owner, now, delta, usedStaleValues = false }) {
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        return {
            studentRef: doc(db, `artifacts/class1/public/data/students/student_${studentId}`),
            thermometerRef: doc(db, path),
            delta,
            today: '2026-10-16',
            owner,
            leaseMs: 5 * 60 * 1000,
            now,
            usedStaleValues,
        };
    }

    async function seedRunningSettlement({ owner = 'tabA', now = 1_800_000_000_000, attempt = 1, usedStaleValues = false, students = [] } = {}) {
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, path), thermometerPayload({
                date: '2026-10-16',
                settlementKey: '2026-10-16',
                settlementStatus: 'running',
                settlementStartedAt: now - 1000,
                settlementLockOwner: owner,
                settlementAttempt: attempt,
                usedStaleValues,
            }));
            for (const stu of students) {
                await setDoc(doc(db, `artifacts/class1/public/data/students/student_${stu.id}`), {
                    xp: stu.xp,
                    bong: stu.bong ?? 0,
                    shieldHP: stu.shieldHP ?? 0,
                });
            }
        });
    }

    it('H1: 경험치를 준 뒤 완료 기록 전에 끊기면 재시도는 다시 주지 않는다', async () => {
        const now = 1_800_000_000_000;
        await seedRunningSettlement({
            now,
            students: [{ id: '1', xp: 10, bong: 4 }],
        });
        const db = teacher().firestore();
        const args = grantArgs(db, { studentId: '1', owner: 'tabA', now, delta: 3 });
        const first = await grantThermometerStudentXp(db, args);
        assert.equal(first.status, 'granted');
        assert.equal(first.actualDelta, 3);
        const second = await grantThermometerStudentXp(db, { ...args, delta: 3 });
        assert.equal(second.status, 'skipped');
        assert.equal(second.reason, 'already_applied');
        const snap = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'));
        assert.equal(snap.data().xp, 13);
        assert.equal(snap.data().bong, 4);
        assert.equal(snap.data().lastThermometerSettlementKey, '2026-10-16#1');
        assert.equal(snap.data().thermometerUsedStaleValues, false);
        const parent = await getDoc(doc(db, 'artifacts/class1/public/data/settings/learningThermometer'));
        assert.equal(parent.data().settlementStatus, 'running');
        assert.equal(parent.data().usedStaleValues, false);

        await seedRunningSettlement({
            now,
            students: [{ id: '3', xp: 10, bong: 1, shieldHP: 5 }],
        });
        const negative = grantArgs(db, { studentId: '3', owner: 'tabA', now, delta: -3 });
        const cut = await grantThermometerStudentXp(db, negative);
        assert.equal(cut.status, 'granted');
        assert.equal(cut.actualDelta, 0);
        const again = await grantThermometerStudentXp(db, negative);
        assert.equal(again.reason, 'already_applied');
        const shielded = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_3'));
        assert.equal(shielded.data().xp, 10);
        assert.equal(shielded.data().shieldHP, 2);
        assert.equal(shielded.data().lastThermometerSettlementKey, '2026-10-16#1');
    });

    it('M1: 예전 값으로 지급한 뒤 끊기면 같은 학생을 다시 주지 않고 표식만 남긴다', async () => {
        const now = 1_800_000_000_000;
        await seedRunningSettlement({
            now,
            students: [{ id: '1', xp: 10 }, { id: '2', xp: 5 }],
        });
        const db = teacher().firestore();
        const firstArgs = grantArgs(db, { studentId: '1', owner: 'tabA', now, delta: 4, usedStaleValues: true });
        const first = await grantThermometerStudentXp(db, firstArgs);
        assert.equal(first.status, 'granted');
        const replay = await grantThermometerStudentXp(db, { ...firstArgs, delta: 100 });
        assert.equal(replay.status, 'skipped');
        assert.equal(replay.reason, 'already_applied');
        const stu = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'));
        assert.equal(stu.data().xp, 14);
        assert.equal(stu.data().thermometerUsedStaleValues, true);
        assert.equal(stu.data().lastThermometerSettlementKey, '2026-10-16#1');
        const parent = await getDoc(doc(db, 'artifacts/class1/public/data/settings/learningThermometer'));
        assert.equal(parent.data().usedStaleValues, true);
        assert.equal(parent.data().settlementStatus, 'running');

        const second = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '2', owner: 'tabA', now, delta: 2, usedStaleValues: true,
        }));
        assert.equal(second.status, 'granted');
        const stu2 = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_2'));
        assert.equal(stu2.data().xp, 7);
        const stu2Again = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '2', owner: 'tabA', now, delta: 2, usedStaleValues: true,
        }));
        assert.equal(stu2Again.reason, 'already_applied');
        const stu2Final = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_2'));
        assert.equal(stu2Final.data().xp, 7);
    });

    it('M2: 잠금을 잃은 탭은 지급하거나 완료하지 못하고, 인계한 탭만 한 번 지급한다', async () => {
        const now = 1_800_000_000_000;
        const leaseMs = 5 * 60 * 1000;
        await seedRunningSettlement({
            now,
            owner: 'tabA',
            students: [{ id: '1', xp: 10 }],
        });
        const db = teacher().firestore();
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        const stalled = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabA', now: now + leaseMs, delta: 6,
        }));
        assert.equal(stalled.status, 'lock_lost');
        const early = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'));
        assert.equal(early.data().xp, 10);

        const other = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabB', now, delta: 6,
        }));
        assert.equal(other.status, 'lock_lost');

        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), path), {
                settlementLockOwner: 'tabB',
                settlementStartedAt: now - 500,
            }, { merge: true });
        });
        const woken = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabA', now, delta: 6,
        }));
        assert.equal(woken.status, 'lock_lost');
        const wokenFinish = await finishThermometerSettlement(db, {
            thermometerRef: doc(db, path),
            voteRefs: [doc(db, `${path}/votes/1`)],
            owner: 'tabA',
            today: '2026-10-16',
            leaseMs,
            now,
            parentPayload: thermometerPayload({
                date: '2026-10-16',
                settledDate: '2026-10-16',
                settlementKey: '2026-10-16',
                settlementStatus: 'done',
                settlementStartedAt: 0,
                settlementLockOwner: '',
                settlementAttempt: 1,
            }),
        });
        assert.equal(wokenFinish.status, 'lock_lost');
        const stillRunning = await getDoc(doc(db, path));
        assert.equal(stillRunning.data().settlementStatus, 'running');
        assert.equal(stillRunning.data().settlementLockOwner, 'tabB');

        const taken = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabB', now, delta: 6,
        }));
        assert.equal(taken.status, 'granted');
        assert.equal(taken.actualDelta, 6);
        const takenAgain = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabB', now, delta: 6,
        }));
        assert.equal(takenAgain.reason, 'already_applied');
        const paid = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'));
        assert.equal(paid.data().xp, 16);
        const stillA = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabA', now, delta: 6,
        }));
        assert.equal(stillA.status, 'lock_lost');
        const finalXp = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'));
        assert.equal(finalXp.data().xp, 16);
    });

    it('M3: 표가 있는 학생과 예전 값만 있는 학생을 한 번씩 지급한다', async () => {
        const now = 1_800_000_000_000;
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, settingsPath), {
                learningThermometer: { min: -20, max: 20, values: { '1': 3, '2': 15, '9': 7 } },
            }, { merge: true });
            await setDoc(doc(db, path), thermometerPayload({
                date: '2026-10-16',
                settledDate: '2026-10-15',
                settlementKey: '2026-10-15',
                settlementStatus: 'done',
                usedStaleValues: false,
            }));
            await setDoc(doc(db, `${path}/votes/2`), { value: 5 });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_1'), { xp: 10 });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_2'), { xp: 10 });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_9'), { xp: 10 });
        });
        const plan = planThermometerSettlement({
            activeIds: ['1', '2'],
            voteValues: { '2': 5 },
            parentExists: true,
            parentData: {
                settlementStatus: 'done',
                settledDate: '2026-10-15',
                settlementKey: '2026-10-15',
                usedStaleValues: false,
            },
            legacyThermometer: { values: { '1': 3, '2': 15, '9': 7 } },
            today: '2026-10-16',
            min: -20,
            max: 20,
        });
        assert.equal(plan.pendingValues['1'], 3);
        assert.equal(plan.pendingValues['2'], 5);
        assert.equal(plan.pendingValues['9'], undefined);
        assert.deepEqual(plan.legacyIds, ['1']);

        await seedRunningSettlement({
            now,
            students: [],
        });
        const db = teacher().firestore();
        const legacyGrant = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabA', now, delta: plan.pendingValues['1'], usedStaleValues: true,
        }));
        const voteGrant = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '2', owner: 'tabA', now, delta: plan.pendingValues['2'], usedStaleValues: false,
        }));
        assert.equal(legacyGrant.status, 'granted');
        assert.equal(voteGrant.status, 'granted');
        const stu1 = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'));
        const stu2 = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_2'));
        const inactive = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_9'));
        assert.equal(stu1.data().xp, 13);
        assert.equal(stu1.data().thermometerUsedStaleValues, true);
        assert.equal(stu2.data().xp, 15);
        assert.equal(stu2.data().thermometerUsedStaleValues, false);
        assert.equal(inactive.data().xp, 10);
        const parent = await getDoc(doc(db, path));
        assert.equal(parent.data().usedStaleValues, true);
    });

    it('R1: 예전 값 지급 뒤 다음 날은 다시 주지 않고 global 값을 비운다', async () => {
        const now = 1_800_000_000_000;
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        const stored = { min: -20, max: 20, date: '2026-10-15', values: { '1': 3 } };
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, settingsPath), { learningThermometer: stored }, { merge: true });
        });
        await seedRunningSettlement({
            now,
            students: [{ id: '1', xp: 10 }],
        });
        const db = teacher().firestore();
        const first = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabA', now, delta: 3, usedStaleValues: true,
        }));
        assert.equal(first.status, 'granted');
        assert.equal((await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'))).data().xp, 13);

        const day1Plan = planThermometerSettlement({
            activeIds: ['1'],
            voteValues: {},
            parentExists: true,
            parentData: {
                settlementStatus: 'running',
                settlementKey: '2026-10-16',
                usedStaleValues: true,
            },
            legacyThermometer: stored,
            today: '2026-10-16',
            min: -20,
            max: 20,
        });
        assert.equal(day1Plan.legacyAllowed, true);
        assert.equal(day1Plan.pendingValues['1'], 3);
        const replay = await grantThermometerStudentXp(db, grantArgs(db, {
            studentId: '1', owner: 'tabA', now, delta: 3, usedStaleValues: true,
        }));
        assert.equal(replay.reason, 'already_applied');

        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), path), {
                date: '2026-10-17',
                settlementKey: '2026-10-17',
                settlementStatus: 'running',
                settlementStartedAt: now - 1000,
                settlementLockOwner: 'tabA',
                settlementAttempt: 1,
                usedStaleValues: true,
            }, { merge: true });
        });
        const day2Plan = planThermometerSettlement({
            activeIds: ['1'],
            voteValues: {},
            parentExists: true,
            parentData: {
                settlementStatus: 'running',
                settlementKey: '2026-10-16',
                settledDate: '2026-10-16',
                usedStaleValues: true,
            },
            legacyThermometer: stored,
            today: '2026-10-17',
            min: -20,
            max: 20,
        });
        assert.equal(day2Plan.legacyAllowed, false);
        assert.equal(day2Plan.pendingValues['1'], undefined);
        assert.equal(planThermometerLegacyVoteWrites({
            existingVoteIds: [],
            legacyValues: stored.values,
            activeIds: ['1'],
            allowLegacy: day2Plan.legacyAllowed,
            min: -20,
            max: 20,
        }), null);
        const nextDay = await grantThermometerStudentXp(db, {
            ...grantArgs(db, { studentId: '1', owner: 'tabA', now, delta: 3, usedStaleValues: true }),
            today: '2026-10-17',
        });
        assert.equal(nextDay.status, 'skipped');
        assert.equal(nextDay.reason, 'stale_consumed');
        assert.equal((await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'))).data().xp, 13);

        const cleared = clearedLearningThermometerLegacy(stored);
        await assertSucceeds(updateDoc(doc(db, settingsPath), { learningThermometer: cleared }));
        const globalSnap = await getDoc(doc(db, settingsPath));
        assert.deepEqual(globalSnap.data().learningThermometer.values, {});
        assert.equal(globalSnap.data().learningThermometer.min, -20);
        await assertSucceeds(updateDoc(doc(anon().firestore(), settingsPath), {
            learningThermometer: { ...stored, values: { '1': 9 } },
        }));
    });

    function settlementRefs(db) {
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        return {
            path,
            args: {
                thermometerRef: doc(db, path),
                globalSettingsRef: doc(db, settingsPath),
                voteRefFor: (sid) => doc(db, `${path}/votes/${sid}`),
                studentRefFor: (sid) => doc(db, `artifacts/class1/public/data/students/student_${sid}`),
                leaseMs: 5 * 60 * 1000,
                minDefault: -20,
                maxDefault: 20,
            },
        };
    }

    it('H2: 어제 running 으로 남은 정산은 어제 키로 마무리하고 같은 표를 다시 지급하지 않는다', async () => {
        const now = 1_800_000_000_000;
        const leaseMs = 5 * 60 * 1000;
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, settingsPath), {
                learningThermometer: { min: -20, max: 20, values: { '1': 3, '9': 7 } },
            }, { merge: true });
            await setDoc(doc(db, path), thermometerPayload({
                date: '2026-10-16',
                settlementKey: '2026-10-16',
                settlementStatus: 'running',
                settlementStartedAt: now - leaseMs - 1000,
                settlementLockOwner: 'tabA',
                settlementAttempt: 1,
                usedStaleValues: false,
                settledDate: '',
            }));
            await setDoc(doc(db, `${path}/votes/2`), { value: 5 });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_1'), { xp: 10, bong: 0 });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_2'), {
                xp: 15,
                bong: 0,
                lastThermometerSettlementKey: '2026-10-16#1',
                thermometerUsedStaleValues: false,
            });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_9'), { xp: 10, bong: 0 });
        });

        const db = teacher().firestore();
        const { args } = settlementRefs(db);
        const result = await settleThermometerResolvingPrior(db, {
            ...args,
            activeIds: ['1', '2'],
            today: '2026-10-17',
            owner: 'tabB',
            now,
            manual: false,
        });
        assert.equal(result.status, 'done');
        assert.equal(result.appliedCount, 1);
        assert.equal(result.totalDelta, 3);
        assert.equal(result.skippedApplied, 1);
        assert.equal(result.prior.appliedCount, 1);
        assert.equal(result.prior.skippedApplied, 1);

        const stu1 = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'));
        const stu2 = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_2'));
        const stu9 = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_9'));
        assert.equal(stu1.data().xp, 13);
        assert.equal(stu1.data().lastThermometerSettlementKey, '2026-10-16#1');
        assert.equal(stu1.data().thermometerUsedStaleValues, true);
        assert.equal(stu2.data().xp, 15);
        assert.equal(stu2.data().lastThermometerSettlementKey, '2026-10-16#1');
        assert.equal(stu2.data().thermometerUsedStaleValues, false);
        assert.equal(stu9.data().xp, 10);
        assert.equal(stu9.data().lastThermometerSettlementKey, undefined);

        const parent = await getDoc(doc(db, path));
        assert.equal(parent.data().settlementStatus, 'done');
        assert.equal(parent.data().settledDate, '2026-10-17');
        assert.equal(parent.data().settlementKey, '2026-10-17');
        assert.equal(parent.data().usedStaleValues, true);
        assert.equal(parent.data().settlementAttempt, 2);
        assert.equal((await getDoc(doc(db, `${path}/votes/2`))).data().value, 0);
        const globalSnap = await getDoc(doc(db, settingsPath));
        assert.deepEqual(globalSnap.data().learningThermometer.values, {});

        const again = await settleThermometerResolvingPrior(db, {
            ...args,
            activeIds: ['1', '2', '9'],
            today: '2026-10-17',
            owner: 'tabB',
            now,
            manual: false,
        });
        assert.equal(again.status, 'already_done');
        assert.equal((await getDoc(doc(db, 'artifacts/class1/public/data/students/student_1'))).data().xp, 13);
        assert.equal((await getDoc(doc(db, 'artifacts/class1/public/data/students/student_2'))).data().xp, 15);
        assert.equal((await getDoc(doc(db, 'artifacts/class1/public/data/students/student_9'))).data().xp, 10);
    });

    it('H2: 어제 잠금이 아직 유효하면 오늘 정산으로 넘어가 다시 지급하지 않는다', async () => {
        const now = 1_800_000_000_000;
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, path), thermometerPayload({
                date: '2026-10-16',
                settlementKey: '2026-10-16',
                settlementStatus: 'running',
                settlementStartedAt: now - 1000,
                settlementLockOwner: 'tabA',
                settlementAttempt: 1,
            }));
            await setDoc(doc(db, `${path}/votes/2`), { value: 5 });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_2'), {
                xp: 15,
                bong: 0,
                lastThermometerSettlementKey: '2026-10-16#1',
            });
        });
        const db = teacher().firestore();
        const { args } = settlementRefs(db);
        const result = await settleThermometerResolvingPrior(db, {
            ...args,
            activeIds: ['2'],
            today: '2026-10-17',
            owner: 'tabB',
            now,
        });
        assert.equal(result.status, 'locked');
        const parent = await getDoc(doc(db, path));
        assert.equal(parent.data().settlementStatus, 'running');
        assert.equal(parent.data().settlementKey, '2026-10-16');
        assert.equal(parent.data().settlementLockOwner, 'tabA');
        assert.equal((await getDoc(doc(db, 'artifacts/class1/public/data/students/student_2'))).data().xp, 15);
        assert.equal((await getDoc(doc(db, `${path}/votes/2`))).data().value, 5);
    });

    it('H1: 같은 날 오케스트레이션 재시도도 이미 지급한 학생을 다시 주지 않는다', async () => {
        const now = 1_800_000_000_000;
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, path), thermometerPayload({
                date: '2026-10-16',
                settlementKey: '2026-10-16',
                settlementStatus: 'running',
                settlementStartedAt: now - 1000,
                settlementLockOwner: 'tabA',
                settlementAttempt: 1,
            }));
            await setDoc(doc(db, `${path}/votes/2`), { value: 5 });
            await setDoc(doc(db, 'artifacts/class1/public/data/students/student_2'), {
                xp: 15,
                bong: 0,
                lastThermometerSettlementKey: '2026-10-16#1',
            });
        });
        const db = teacher().firestore();
        const { args } = settlementRefs(db);
        const result = await settleThermometerResolvingPrior(db, {
            ...args,
            activeIds: ['2'],
            today: '2026-10-16',
            owner: 'tabA',
            now,
        });
        assert.equal(result.status, 'done');
        assert.equal(result.appliedCount, 0);
        assert.equal(result.skippedApplied, 1);
        assert.equal(result.prior, undefined);
        const stu2 = await getDoc(doc(db, 'artifacts/class1/public/data/students/student_2'));
        assert.equal(stu2.data().xp, 15);
        assert.equal(stu2.data().lastThermometerSettlementKey, '2026-10-16#1');
        const parent = await getDoc(doc(db, path));
        assert.equal(parent.data().settlementStatus, 'done');
        assert.equal(parent.data().settledDate, '2026-10-16');
        assert.equal(parent.data().settlementAttempt, 1);
        assert.equal((await getDoc(doc(db, `${path}/votes/2`))).data().value, 0);
    });

    it('로그인한 사용자는 자기 uid로 승인 표식을 만들고 새 학급 설정을 저장한다', async () => {
        const seed = seedTeacher().firestore();
        const grant = 'artifacts/sambong-class-2026/public/data/approvedClassIds/fresh-class';
        await assertFails(setDoc(doc(seed, grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'teacher-other',
        }));
        await assertFails(setDoc(doc(seed, grant), {
            classId: 'fresh-class',
            status: 'approved',
        }));
        await assertSucceeds(setDoc(doc(otherTeacher().firestore(), grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'teacher-other',
        }));
        await assertSucceeds(setDoc(doc(anon().firestore(), 'artifacts/unowned/public/data/settings/global'), {
            lotto: null,
        }));
        await assertSucceeds(setDoc(doc(seed, 'artifacts/fresh-class/public/data/settings/global'), {
            raidPassword: '1234',
            shieldStock: 5,
        }));
        const guest = testEnv.unauthenticatedContext().firestore();
        await assertFails(setDoc(doc(guest, 'artifacts/sambong-class-2026/public/data/approvedClassIds/guest-class'), {
            classId: 'guest-class',
            status: 'approved',
            createdBy: 'guest',
        }));
    });

    it('로그인한 학생은 로또와 GM 전용 키를 저장한다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            lotto: { round: 2, status: 'open' },
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            constitutionItems: [{ id: 'c1', title: 'x', body: 'y' }],
        }, { merge: true }));
    });

    it('settings/global 삭제와 admins 쓰기, 다른 uid 읽기를 막는다', async () => {
        const teacherDb = teacher().firestore();
        const strangerDb = stranger().firestore();
        await assertFails(deleteDoc(doc(teacherDb, settingsPath)));
        await assertFails(setDoc(doc(teacherDb, 'admins/teacher1'), { role: 'gm' }));
        await assertFails(getDoc(doc(strangerDb, 'admins/teacher1')));
        await assertSucceeds(getDoc(doc(teacherDb, 'admins/teacher1')));
    });

    it('GM 전용 키가 들어간 settings/global 생성은 로그인한 사용자가 할 수 있다', async () => {
        const fresh = 'artifacts/new-class/public/data/settings/global';
        await assertSucceeds(setDoc(doc(anon().firestore(), fresh), {
            raidPassword: '1234',
            worldSettings: { worldName: 'MATE' },
        }));
        await assertSucceeds(setDoc(doc(anon().firestore(), 'artifacts/plain/public/data/settings/global'), {
            lotto: null,
            musicTimeQueue: [],
        }));
        await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), fresh), {
            announcement: '손님',
        }));
    });

    it('자리표는 빈 좌석으로 덮거나 지우지 못하고, 좌석이 있으면 부분 저장은 된다', async () => {
        const path = 'artifacts/class1/public/data/estate/state';
        const seats = [
            { id: 0, owner: '2', assignee: null, hidden: false, price: 500 },
            { id: 1, owner: null, assignee: '5', hidden: false, price: 500 },
        ];
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), path), {
                seats,
                layout: { rows: 1, cols: 2 },
                purchaseHistory: [{ studentId: '2' }],
            });
        });
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, path), {
            seats: [
                { id: 0, owner: '2', assignee: null, hidden: false, price: 500 },
                { id: 1, owner: '9', assignee: null, hidden: false, price: 500 },
            ],
        }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { seats: [] }, { merge: true }));
        await assertFails(updateDoc(doc(db, path), { seats: [] }));
        await assertFails(deleteDoc(doc(db, path)));
        await assertSucceeds(setDoc(doc(db, path), {
            layout: { rows: 1, cols: 2 },
        }, { merge: true }));
        await assertFails(setDoc(doc(db, 'artifacts/class2/public/data/estate/state'), {
            seats: [],
            layout: { rows: 1, cols: 1 },
        }));
        await assertSucceeds(setDoc(doc(db, 'artifacts/class2/public/data/estate/state'), {
            seats,
            layout: { rows: 1, cols: 2 },
        }));
        const guest = testEnv.unauthenticatedContext().firestore();
        await assertFails(setDoc(doc(guest, path), { seats }, { merge: true }));
    });

    it('익명 로그인은 OX 문제 은행과 마스터 PIN을 저장하고, 로그인 없으면 저장하지 못한다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, 'artifacts/class1/public/data/oxQuizBank/bank'), {
            questions: [{ q: '맞나요', answer: true }],
        }));
        await assertSucceeds(setDoc(doc(db, 'artifacts/class1/public/data/students/student_gm'), {
            pin: '2468',
        }));
        const guest = testEnv.unauthenticatedContext().firestore();
        await assertFails(setDoc(doc(guest, 'artifacts/class1/public/data/oxQuizBank/bank'), {
            questions: [],
        }));
        await assertFails(setDoc(doc(guest, 'artifacts/class1/public/data/students/student_gm'), {
            pin: '2468',
        }));
    });
});

describe('firestore rules: 보드게임 방 정리(hostUid·30분)', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
    /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment | null} */
    let testEnv = null;
    const MIN = 60 * 1000;
    const roomPath = (id) => `artifacts/class1/public/data/boardGameRooms/${id}`;

    before(async () => {
        testEnv = await initializeTestEnvironment({
            projectId,
            firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
        });
    });
    after(async () => { if (testEnv) await testEnv.cleanup(); });
    beforeEach(async () => { await testEnv.clearFirestore(); });

    const host = () => testEnv.authenticatedContext('uid-host', { firebase: { sign_in_provider: 'anonymous' } });
    const other = () => testEnv.authenticatedContext('uid-other', { firebase: { sign_in_provider: 'anonymous' } });
    const nobody = () => testEnv.unauthenticatedContext();

    function makeRoom({ id = 'bg_r1', ageMin = 1, hostUid = 'uid-host', gameType = 'gomoku', hostId = '1' } = {}) {
        const now = Date.now() - ageMin * MIN;
        const made = createBoardRoom({ gameType, hostId, hostName: '민준', now, hostUid, id });
        assert.equal(made.ok, true);
        const doc0 = boardRoomToDoc(made.room);
        if (!hostUid) delete doc0.hostUid;
        return doc0;
    }

    async function seed(data, id = 'bg_r1') {
        await testEnv.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), roomPath(id)), data); });
    }

    it('방은 내 uid를 hostUid로 적어야 만들 수 있고, 로그인 없이는 못 만들어요', async () => {
        await assertSucceeds(setDoc(doc(host().firestore(), roomPath('bg_r1')), makeRoom()));
        await assertFails(setDoc(doc(other().firestore(), roomPath('bg_r2')), makeRoom({ id: 'bg_r2' })));
        await assertFails(setDoc(doc(other().firestore(), roomPath('bg_r3')), makeRoom({ id: 'bg_r3', hostUid: '' })));
        await assertFails(setDoc(doc(nobody().firestore(), roomPath('bg_r4')), makeRoom({ id: 'bg_r4' })));
    });

    it('방장은 만든 지 얼마 안 된 내 방을 언제든 지워요', async () => {
        await seed(makeRoom({ ageMin: 1 }));
        await assertSucceeds(deleteDoc(doc(host().firestore(), roomPath('bg_r1'))));
    });

    it('남의 새 방(30분 전)은 지우거나 hostUid를 바꿔 덮어쓰지 못해요', async () => {
        await seed(makeRoom({ ageMin: 12 }));
        await assertFails(deleteDoc(doc(other().firestore(), roomPath('bg_r1'))));
        await assertFails(setDoc(doc(other().firestore(), roomPath('bg_r1')), makeRoom({ hostUid: 'uid-other', hostId: '2' })));
        // createdAt을 옛날로 바꿔 30분 정리를 앞당기지도 못해요
        const cur = makeRoom({ ageMin: 12 });
        await assertFails(setDoc(doc(other().firestore(), roomPath('bg_r1')), { ...cur, createdAt: cur.createdAt - 60 * MIN }));
    });

    it('만든 지 30분이 지난 방은 로그인한 누구나 지우고 새 방으로 덮어써요', async () => {
        await seed(makeRoom({ ageMin: 31 }));
        await assertSucceeds(deleteDoc(doc(other().firestore(), roomPath('bg_r1'))));
        await seed(makeRoom({ ageMin: 31 }));
        await assertSucceeds(setDoc(doc(other().firestore(), roomPath('bg_r1')), makeRoom({ hostUid: 'uid-other', hostId: '2', ageMin: 0 })));
    });

    it('30분이 지나도 두는 중이고 10분 안에 활동한 판은 남이 지우지 못해요', async () => {
        const base = makeRoom({ ageMin: 40 });
        await seed({ ...base, status: 'playing', lastActivityAt: Date.now() - 2 * MIN });
        await assertFails(deleteDoc(doc(other().firestore(), roomPath('bg_r1'))));
        await assertSucceeds(deleteDoc(doc(host().firestore(), roomPath('bg_r1'))));
        await seed({ ...base, status: 'playing', lastActivityAt: Date.now() - 11 * MIN });
        await assertSucceeds(deleteDoc(doc(other().firestore(), roomPath('bg_r1'))));
    });

    it('hostUid가 없는 옛 방은 예전처럼 로그인한 누구나 지워요', async () => {
        await seed(makeRoom({ ageMin: 1, hostUid: '' }));
        await assertSucceeds(deleteDoc(doc(other().firestore(), roomPath('bg_r1'))));
    });

    it('로그인하지 않으면 새 방·옛 방·30분 지난 방 모두 지우거나 덮어쓰지 못해요', async () => {
        for (const data of [makeRoom({ ageMin: 1 }), makeRoom({ ageMin: 1, hostUid: '' }), makeRoom({ ageMin: 31 })]) {
            await seed(data);
            await assertFails(deleteDoc(doc(nobody().firestore(), roomPath('bg_r1'))));
            await assertFails(setDoc(doc(nobody().firestore(), roomPath('bg_r1')), { ...data, status: 'closed' }));
            await assertFails(updateDoc(doc(nobody().firestore(), roomPath('bg_r1')), { status: 'closed' }));
        }
        // 공개 와일드카드로도 방 아래에 쓰지 못해요
        await assertFails(setDoc(doc(nobody().firestore(), `${roomPath('bg_r1')}/x/y`), { a: 1 }));
    });

    it('참가 신청·승인·두기·나가기(hostUid·createdAt 그대로)는 예전처럼 돼요', async () => {
        const made = createBoardRoom({ gameType: 'gomoku', hostId: '1', hostName: '민준', now: Date.now(), hostUid: 'uid-host', id: 'bg_r1' });
        await assertSucceeds(setDoc(doc(host().firestore(), roomPath('bg_r1')), boardRoomToDoc(made.room)));
        const joined = requestJoinBoardRoom(made.room, { studentId: '2', studentName: '서연', now: Date.now(), uid: 'uid-other' });
        assert.equal(joined.ok, true);
        await assertSucceeds(setDoc(doc(other().firestore(), roomPath('bg_r1')), boardRoomToDoc(joined.room)));
        const ok = approveJoinBoardRoom(joined.room, { hostId: '1', studentId: '2', now: Date.now() });
        assert.equal(ok.ok, true);
        await assertSucceeds(setDoc(doc(host().firestore(), roomPath('bg_r1')), boardRoomToDoc(ok.room)));
        const placed = placeGomokuStone(ok.room.game, { x: 9, y: 9, color: GOMOKU_BLACK, now: Date.now() });
        assert.equal(placed.ok, true);
        const moved = applyBoardRoomGame(ok.room, { game: placed.game, now: Date.now() });
        await assertSucceeds(setDoc(doc(host().firestore(), roomPath('bg_r1')), boardRoomToDoc(moved)));
        // 승인받은 참가자(memberUids에 든 기기)는 판을 끝내고 방을 닫고 지울 수 있어요
        const done = finishBoardRoom(moved, { now: Date.now() });
        await assertSucceeds(setDoc(doc(other().firestore(), roomPath('bg_r1')), boardRoomToDoc(done.room)));
        const again = continueBoardRoom(done.room, { actorId: '2', now: Date.now() });
        assert.equal(again.ok, true);
        await assertSucceeds(setDoc(doc(other().firestore(), roomPath('bg_r1')), boardRoomToDoc(again.room)));
        const closed = closeBoardRoom(again.room, { actorId: '2', now: Date.now() });
        assert.equal(closed.ok, true);
        await assertSucceeds(setDoc(doc(other().firestore(), roomPath('bg_r1')), boardRoomToDoc(closed.room)));
        await assertSucceeds(deleteDoc(doc(other().firestore(), roomPath('bg_r1'))));
    });

    it('R2-2: 같은 학번이라도 다른 기기(uid)는 hostUid가 있는 알까기 방을 덮어쓰지 못하고, 다른 id로 새로 만들어요', async () => {
        await seed(makeRoom({ id: 'alk_1', gameType: 'alkkagi', ageMin: 12 }), 'alk_1');
        await assertFails(setDoc(doc(other().firestore(), roomPath('alk_1')), makeRoom({ id: 'alk_1', gameType: 'alkkagi', ageMin: 0, hostUid: 'uid-other' })));
        await assertSucceeds(setDoc(doc(other().firestore(), roomPath('alk_1_ab12cd')), makeRoom({ id: 'alk_1_ab12cd', gameType: 'alkkagi', ageMin: 0, hostUid: 'uid-other' })));
        // 30분이 지나면 누구나 덮어써요(정리 대상)
        await seed(makeRoom({ id: 'alk_1', gameType: 'alkkagi', ageMin: 31 }), 'alk_1');
        await assertSucceeds(setDoc(doc(other().firestore(), roomPath('alk_1')), makeRoom({ id: 'alk_1', gameType: 'alkkagi', ageMin: 0, hostUid: 'uid-other' })));
    });
});

describe('firestore rules 테스트 준비', () => {
    it('에뮬레이터 없이 돌릴 때는 규칙 시험을 건너뛴다', () => {
        if (!emulatorOn) {
            assert.equal(process.env.FIRESTORE_EMULATOR_HOST || '', '');
        } else {
            assert.match(process.env.FIRESTORE_EMULATOR_HOST, /:\d+$/);
        }
    });
});

// QA rules88.mjs(#88 2차 점검) 45건을 그대로 옮겼어요. 기대값은 QA 표와 같아요.
describe('firestore rules: 보드게임 방 쪼개 쓰기 막기(QA rules88 45건)', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
    /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment | null} */
    let testEnv = null;
    const RP = 'artifacts/sambong-class-2026/public/data/boardGameRooms';
    const M = 60000;

    before(async () => {
        testEnv = await initializeTestEnvironment({
            projectId,
            firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
        });
    });
    after(async () => { if (testEnv) await testEnv.cleanup(); });
    beforeEach(async () => { await testEnv.clearFirestore(); });

    function ctx() {
        const now = Date.now();
        const host = testEnv.authenticatedContext('uid-host').firestore();
        const other = testEnv.authenticatedContext('uid-other').firestore();
        const anon = testEnv.unauthenticatedContext().firestore();
        // r3: 새 방 모양(R2-1)에 맞게 방장 자리에 uid와 memberUids를 넣어요.
        const room = (o = {}) => ({ gameType: 'alkkagi', hostId: '1', hostUid: 'uid-host', status: 'waiting', members: [{ id: '1', uid: 'uid-host' }], memberUids: ['uid-host'], joinRequests: [], createdAt: now, updatedAt: now, lastActivityAt: now, ...o });
        const noHost = (r) => { const { hostUid, ...rest } = r; return rest; };
        const seed = (id, d) => testEnv.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `${RP}/${id}`), d));
        const R = (id) => doc(other, `${RP}/${id}`);
        const H = (id) => doc(host, `${RP}/${id}`);
        const A = (id) => doc(anon, `${RP}/${id}`);
        const t = async (name, allow, p) => {
            try {
                if (allow) await assertSucceeds(p); else await assertFails(p);
            } catch (e) {
                throw new Error(`${name}: ${allow ? '허용' : '거부'}이어야 해요 (${e && (e.code || e.message)})`);
            }
        };
        return { now, host, other, anon, room, noHost, seed, R, H, A, t };
    }

    it('83 제안 1~17', async () => {
        const { now, host, anon, room, noHost, seed, R, H, t } = ctx();
        await t('1 방장 만들기(hostUid=내 uid)', true, setDoc(H('alk_1'), room()));
        await t('2 hostUid 없이 만들기(옛 화면)', false, setDoc(H('bg_x'), noHost(room())));
        await t('3 남의 uid로 만들기', false, setDoc(R('alk_2'), room({ hostId: '2' })));
        await t('4 비로그인 만들기', false, setDoc(doc(anon, `${RP}/alk_3`), room()));
        await t('5 남이 참가 신청(내 uid)', true, updateDoc(R('alk_1'), { joinRequests: [{ id: '2', status: 'pending', uid: 'uid-other' }], updatedAt: now + 1 }));
        await t('5b 남이 uid 없이 참가 신청(r3 R2-3에서 막음)', false, updateDoc(R('alk_1'), { joinRequests: [{ id: '2', status: 'pending', uid: 'uid-other' }, { id: '3', status: 'pending' }], updatedAt: now + 1 }));
        await t('6 남이 승인 없이 playing으로 시작(r3 R2-3에서 막음)', false, updateDoc(R('alk_1'), { status: 'playing', updatedAt: now + 2 }));
        await t('7 남이 닫기(status=closed)', false, updateDoc(R('alk_1'), { status: 'closed' }));
        await seed('alk_1', room());
        await t('8 남이 hostUid 바꿔치기', false, updateDoc(R('alk_1'), { hostUid: 'uid-other' }));
        await t('9 남이 지우기', false, deleteDoc(R('alk_1')));
        await t('10 방장 닫기', true, updateDoc(H('alk_1'), { status: 'closed' }));
        await seed('alk_1', room());
        await t('11 방장 지우기', true, deleteDoc(H('alk_1')));
        await seed('alk_5', room({ hostUid: 'uid-x', lastActivityAt: now - 11 * M }));
        await t('12 10분 멈춘 남의 방 닫기(정리)', true, updateDoc(R('alk_5'), { status: 'closed' }));
        await seed('bg_old', { gameType: 'alkkagi', hostId: '9', status: 'waiting', lastActivityAt: now });
        await t('13 hostUid 없는 옛 방 지우기', true, deleteDoc(R('bg_old')));
        await seed('alk_1', room({ status: 'finished' }));
        await t('14 같은 기기 방장이 끝난 방 다시 쓰기(tx.set)', true, runTransaction(host, async (tx) => { await tx.get(H('alk_1')); tx.set(H('alk_1'), room()); }));
        await seed('alk_1', room({ hostUid: 'uid-hostTablet' }));
        await t('15 방장 다른 기기(uid)로 대기 방 다시 쓰기', false, runTransaction(host, async (tx) => { await tx.get(H('alk_1')); tx.set(H('alk_1'), room()); }));
        await t('16 비로그인 public/data 임의 문서', false, setDoc(doc(anon, 'artifacts/sambong-class-2026/public/data/zzz/x'), { a: 1 }));
        await t('17 로그인 와일드카드로 hostId 없이 방 만들기', false, setDoc(R('zz'), { foo: 1 }));
    });

    it('공격 a1~a16: 남의 방 빼앗기·괴롭히기', async () => {
        const { now, room, seed, R, A, t } = ctx();
        await seed('t1', room({ status: 'playing', members: [{ id: '1' }, { id: '2' }] }));
        await t('a1 남이 진행 중 방을 finished로 바꾸기', false, updateDoc(R('t1'), { status: 'finished' }));
        await t('a2 (이어서) 끝난 방을 내 hostUid로 덮어쓰기', false, setDoc(R('t1'), room({ hostUid: 'uid-other', hostId: '2' })));
        await seed('t2', room());
        await t('a3 남이 lastActivityAt을 0으로', false, updateDoc(R('t2'), { lastActivityAt: 0 }));
        await t('a4 (이어서) 같은 hostId로 내 hostUid 덮어쓰기', false, setDoc(R('t2'), room({ hostUid: 'uid-other' })));
        await seed('t3', room({ status: 'playing', createdAt: now - 40 * M, lastActivityAt: now - 2 * M }));
        await t('a5 40분 된 진행 중 판(2분 전 활동) 남이 지우기', false, deleteDoc(R('t3')));
        await t('a6 (같은 판) 남이 status=waiting으로', false, updateDoc(R('t3'), { status: 'waiting' }));
        await t('a7 (이어서) 남이 지우기', false, deleteDoc(R('t3')));
        await seed('t4', room({ status: 'playing', createdAt: now - 40 * M, lastActivityAt: now - 2 * M }));
        await t('a8 남이 lastActivityAt을 20분 전으로', false, updateDoc(R('t4'), { lastActivityAt: now - 20 * M }));
        await t('a9 (이어서) 지우기', false, deleteDoc(R('t4')));
        const { createdAt, ...noCreated } = room();
        await seed('t5', noCreated);
        await t('a10 createdAt 없는 방에 남이 createdAt=1 넣기', false, updateDoc(R('t5'), { createdAt: 1 }));
        await t('a11 (이어서) 지우기', false, deleteDoc(R('t5')));
        await seed('t6', room());
        await t('a12 남이 members 비우기(내보내기)', false, updateDoc(R('t6'), { members: [] }));
        await t('a13 남이 hostUid 필드 지우기', false, updateDoc(R('t6'), { hostUid: deleteField() }));
        await t('a14 비로그인 지우기', false, deleteDoc(A('t6')));
        await t('a15 비로그인 고치기', false, updateDoc(A('t6'), { status: 'waiting' }));
        await t('a16 남이 hostUid 숫자로 바꾸기', false, updateDoc(R('t6'), { hostUid: 123 }));
    });

    it('경계 b1~b7: 30분·10분', async () => {
        const { now, room, seed, R, t } = ctx();
        await seed('b1', room({ createdAt: now - 29.5 * M, lastActivityAt: now - 29.5 * M }));
        await t('b1 29.5분 대기 방 남이 지우기', false, deleteDoc(R('b1')));
        await seed('b2', room({ createdAt: now - 30.5 * M, lastActivityAt: now - 1 * M }));
        await t('b2 30.5분 대기 방(1분 전 활동) 남이 지우기', true, deleteDoc(R('b2')));
        await seed('b3', room({ status: 'playing', createdAt: now - 31 * M, lastActivityAt: now - 9.5 * M }));
        await t('b3 31분 진행 중 9.5분 전 활동 지우기', false, deleteDoc(R('b3')));
        await seed('b4', room({ status: 'playing', createdAt: now - 31 * M, lastActivityAt: now - 10.5 * M }));
        await t('b4 31분 진행 중 10.5분 전 활동 지우기', true, deleteDoc(R('b4')));
        await seed('b5', room({ status: 'playing', createdAt: now - 31 * M, lastActivityAt: now - 9.5 * M }));
        await t('b5 31분 진행 중을 남이 덮어쓰기(새 방)', false, setDoc(R('b5'), room({ hostUid: 'uid-other', hostId: '2' })));
        await seed('b6', room({ status: 'finished', createdAt: now - 31 * M }));
        await t('b6 31분 끝난 방 남이 지우기', true, deleteDoc(R('b6')));
        await seed('b7', room({ status: 'playing', createdAt: now - 31 * M, lastActivityAt: 'x' }));
        await t('b7 lastActivityAt 문자열인 진행 판 지우기', false, deleteDoc(R('b7')));
    });

    it('옛 화면 o1~o5: 앱 배포와 규칙 게시 사이', async () => {
        const { room, noHost, seed, R, t } = ctx();
        await seed('o1', room());
        // r3 R2-3: 남(비참가자)의 신청은 내 uid가 든 신청만 받아요. 옛 화면(v1.47)은 tx.set으로 hostUid도 지워서 원래 막혀 있었어요.
        await t('o1 옛 화면 참가 신청(uid 없음, r3에서 막음)', false, updateDoc(R('o1'), { joinRequests: [{ id: '2' }] }));
        await t('o1b 새 화면 참가 신청(내 uid)', true, updateDoc(R('o1'), { joinRequests: [{ id: '2', status: 'pending', uid: 'uid-other' }] }));
        await t('o2 옛 화면이 hostUid 있는 방 위에 tx.set(hostUid 없음)', false, setDoc(R('o1'), noHost(room({ hostId: '2' }))));
        await seed('o3', noHost(room()));
        await t('o3 옛 방(hostUid 없음)에 옛 화면 tx.set', true, setDoc(R('o3'), noHost(room({ hostId: '2' }))));
        await t('o4 옛 방을 새 화면이 내 hostUid로 덮어쓰기', true, setDoc(R('o3'), room({ hostUid: 'uid-other', hostId: '2' })));
        await t('o5 옛 화면 새 방 만들기(hostUid 없음)', false, setDoc(R('o5'), noHost(room())));
    });

    it('상태는 정해진 방향으로만 바뀌어요(끝난 방 → 대기 금지, 닫힌 방은 그대로)', async () => {
        const { room, seed, R, H, t } = ctx();
        const two = { members: [{ id: '1', uid: 'uid-host' }, { id: '2', uid: 'uid-other' }], memberUids: ['uid-host', 'uid-other'] };
        await seed('s1', room({ status: 'finished', ...two }));
        await t('방장도 finished → waiting은 못 해요', false, updateDoc(H('s1'), { status: 'waiting' }));
        await t('참가자 finished → playing(다시 두기)', true, updateDoc(R('s1'), { status: 'playing' }));
        await t('방장도 playing → waiting은 못 해요', false, updateDoc(H('s1'), { status: 'waiting' }));
        await t('참가자 playing → finished', true, updateDoc(R('s1'), { status: 'finished' }));
        await t('참가자 finished → closed', true, updateDoc(R('s1'), { status: 'closed' }));
        await t('closed → playing 금지', false, updateDoc(H('s1'), { status: 'playing' }));
        await t('참가자가 닫은 방 지우기', true, deleteDoc(R('s1')));
        await seed('s2', room({ status: 'finished' }));
        await t('남이 끝난 방 다시 두기(finished → playing) 금지', false, updateDoc(R('s2'), { status: 'playing' }));
        await t('남이 이상한 상태로 바꾸기 금지', false, updateDoc(R('s2'), { status: 'zzz' }));
    });

    it('members는 방장이 바꾸거나, 참가자가 자기 자리만 넣고 빼요', async () => {
        const { room, seed, R, H, t } = ctx();
        const hostSeat = { id: '1', uid: 'uid-host' };
        const mySeat = { id: '2', uid: 'uid-other' };
        await seed('m1', room({ members: [hostSeat], memberUids: ['uid-host'], maxPlayers: 2 }));
        await t('남의 uid로 자리 넣기 금지', false, updateDoc(R('m1'), { members: [hostSeat, { id: '2', uid: 'uid-x' }], memberUids: ['uid-host', 'uid-x'] }));
        await t('자리는 안 넣고 memberUids에만 나 넣기 금지', false, updateDoc(R('m1'), { memberUids: ['uid-host', 'uid-other'] }));
        await t('방장 자리를 빼며 내 자리 넣기 금지', false, updateDoc(R('m1'), { members: [mySeat], memberUids: ['uid-other'] }));
        // r3 R2-3: 자리는 방장 승인으로만 생겨요(앱도 스스로 자리를 넣지 않아요).
        await t('대기 방에 내 자리 하나 넣기(승인 없이, r3에서 막음)', false, updateDoc(R('m1'), { members: [hostSeat, mySeat], memberUids: ['uid-host', 'uid-other'] }));
        await seed('m1', room({ members: [hostSeat, mySeat], memberUids: ['uid-host', 'uid-other'], maxPlayers: 2 }));
        await t('내 자리 빼기', true, updateDoc(R('m1'), { members: [hostSeat], memberUids: ['uid-host'] }));
        await seed('m2', room({ status: 'playing', members: [hostSeat], memberUids: ['uid-host'] }));
        await t('두는 중인 판에 끼어들기 금지', false, updateDoc(R('m2'), { members: [hostSeat, mySeat], memberUids: ['uid-host', 'uid-other'] }));
        await seed('m3', room({ members: [hostSeat, mySeat], memberUids: ['uid-host', 'uid-other'] }));
        await t('참가자가 방장 자리 빼기 금지', false, updateDoc(R('m3'), { members: [mySeat], memberUids: ['uid-other'] }));
        await t('방장은 참가자 자리를 정리할 수 있어요', true, updateDoc(H('m3'), { members: [hostSeat], memberUids: ['uid-host'] }));
        await t('방 만든 시각은 방장도 못 바꿔요', false, updateDoc(H('m3'), { createdAt: 5 }));
        await t('방장 학번(hostId) 바꾸기 금지', false, updateDoc(H('m3'), { hostId: '7' }));
    });

    it('lastActivityAt은 줄지 않고 서버 시각 근처여야 해요', async () => {
        const { now, room, seed, R, H, t } = ctx();
        await seed('l1', room({ lastActivityAt: now - 5 * M }));
        await t('방장이 지금 시각으로 올리기', true, updateDoc(H('l1'), { lastActivityAt: Date.now() }));
        await t('남(비참가자)이 올리기만 하기(r3 R2-3에서 막음)', false, updateDoc(R('l1'), { lastActivityAt: Date.now() }));
        await t('한 시간 뒤로 미리 올리기 금지', false, updateDoc(H('l1'), { lastActivityAt: Date.now() + 60 * M }));
        await t('문자열로 바꾸기 금지', false, updateDoc(H('l1'), { lastActivityAt: 'x' }));
        await t('그대로 두고 다른 칸만 쓰기', true, updateDoc(H('l1'), { updatedAt: Date.now() }));
    });
});

// #88 r3: QA r2 R2-1~R2-4 공격(rules88b c1~c13 + 추가)을 옮겼어요. 거부여야 하는 건 모두 거부돼야 해요.
describe('firestore rules: 보드게임 방 QA r2 공격(R2-1~R2-4)', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
    /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment | null} */
    let testEnv = null;
    const RP = 'artifacts/sambong-class-2026/public/data/boardGameRooms';
    const M = 60000;
    before(async () => {
        testEnv = await initializeTestEnvironment({
            projectId,
            firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
        });
    });
    after(async () => { if (testEnv) await testEnv.cleanup(); });
    beforeEach(async () => { await testEnv.clearFirestore(); });

    function ctx() {
        const now = Date.now();
        const fs0 = (uid) => testEnv.authenticatedContext(uid).firestore();
        const A = fs0('uid-A'); // 방장(학번 1)
        const B = fs0('uid-B'); // 참가자(학번 2)
        const C = fs0('uid-C'); // 남(학번 3)
        const D = (db, id) => doc(db, `${RP}/${id}`);
        const seed = (id, d) => testEnv.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `${RP}/${id}`), d));
        const fresh = (o = {}) => ({
            id: 'x', gameType: 'gomoku', status: 'waiting', hostId: '1', hostUid: 'uid-A', hostName: '민준',
            minPlayers: 2, maxPlayers: 2, members: [{ id: '1', name: '민준', role: 'host', seat: 0, uid: 'uid-A' }],
            joinRequests: [], timerEnabled: false, timerSec: 30, lastActivityAt: now, createdAt: now, updatedAt: now,
            round: 0, game: { board: [], winner: '' }, participantIds: ['1'], memberUids: ['uid-A'], ...o,
        });
        const playing = (o = {}) => fresh({
            status: 'playing', createdAt: now - 5 * M, lastActivityAt: now - 1 * M,
            members: [{ id: '1', name: '민준', role: 'host', seat: 0, uid: 'uid-A' }, { id: '2', name: '서연', role: 'player', seat: 1, uid: 'uid-B' }],
            participantIds: ['1', '2'], memberUids: ['uid-A', 'uid-B'], ...o,
        });
        const t = async (name, allow, p) => {
            try {
                if (allow) await assertSucceeds(p); else await assertFails(p);
            } catch (e) {
                throw new Error(`${name}: ${allow ? '허용' : '거부'}이어야 해요 (${e && (e.code || e.message)})`);
            }
        };
        return { now, A, B, C, D, seed, fresh, playing, t };
    }

    it('R2-1 만들기: 시각 ±10분·대기·방장 혼자일 때만', async () => {
        const { now, A, D, fresh, t } = ctx();
        await t('지금 시각 새 방', true, setDoc(D(A, 'r_ok'), fresh()));
        await t('c7 createdAt 1년 뒤로 만들기', false, setDoc(D(A, 'r1'), fresh({ createdAt: now + 365 * 24 * 60 * M, lastActivityAt: now + 365 * 24 * 60 * M })));
        await t('createdAt 11분 뒤', false, setDoc(D(A, 'r2'), fresh({ createdAt: now + 11 * M })));
        await t('createdAt 11분 전', false, setDoc(D(A, 'r3'), fresh({ createdAt: now - 11 * M })));
        await t('lastActivityAt 11분 뒤', false, setDoc(D(A, 'r4'), fresh({ lastActivityAt: now + 11 * M })));
        await t('c8 createdAt=1·playing으로 만들기', false, setDoc(D(A, 'r5'), fresh({ createdAt: 1, status: 'playing' })));
        await t('playing으로 만들기', false, setDoc(D(A, 'r6'), fresh({ status: 'playing' })));
        await t('finished로 만들기', false, setDoc(D(A, 'r7'), fresh({ status: 'finished' })));
        await t('남을 넣은 채 만들기(2명)', false, setDoc(D(A, 'r8'), fresh({ members: [{ id: '1', uid: 'uid-A' }, { id: '2', uid: 'uid-B' }], memberUids: ['uid-A', 'uid-B'], participantIds: ['1', '2'] })));
        await t('방장 자리 uid가 남', false, setDoc(D(A, 'r9'), fresh({ members: [{ id: '1', uid: 'uid-B' }] })));
        await t('memberUids에 남 끼우기', false, setDoc(D(A, 'r10'), fresh({ memberUids: ['uid-A', 'uid-B'] })));
        await t('participantIds에 남 끼우기', false, setDoc(D(A, 'r11'), fresh({ participantIds: ['1', '7'] })));
        await t('신청을 미리 넣어 만들기', false, setDoc(D(A, 'r12'), fresh({ joinRequests: [{ id: '7', status: 'approved' }] })));
        await t('자리 id가 방장 학번이 아님', false, setDoc(D(A, 'r13'), fresh({ members: [{ id: '9', uid: 'uid-A' }] })));
    });

    it('R2-1 덮어쓰기: 정리된 자리에 새로 쓸 때도 같은 모양만', async () => {
        const { now, A, C, D, seed, fresh, t } = ctx();
        const due = fresh({ hostUid: 'uid-X', createdAt: now - 31 * M, lastActivityAt: now - 31 * M });
        await seed('o1', due);
        await t('30분 지난 방 덮어쓰기(미래 createdAt)', false, setDoc(D(C, 'o1'), fresh({ hostId: '3', hostUid: 'uid-C', members: [{ id: '3', uid: 'uid-C' }], memberUids: ['uid-C'], participantIds: ['3'], createdAt: now + 60 * M })));
        await t('30분 지난 방 덮어쓰기(playing)', false, setDoc(D(C, 'o1'), fresh({ hostId: '3', hostUid: 'uid-C', members: [{ id: '3', uid: 'uid-C' }], memberUids: ['uid-C'], participantIds: ['3'], status: 'playing' })));
        await t('30분 지난 방 덮어쓰기(정상)', true, setDoc(D(C, 'o1'), fresh({ hostId: '3', hostUid: 'uid-C', members: [{ id: '3', uid: 'uid-C' }], memberUids: ['uid-C'], participantIds: ['3'] })));
        const { hostUid, ...legacy } = fresh({ createdAt: now - 2 * M });
        await seed('o2', legacy);
        await t('옛 방(hostUid 없음) 차지하며 createdAt 미래로', false, setDoc(D(C, 'o2'), { ...legacy, hostUid: 'uid-C', createdAt: now + 60 * M }));
        await seed('o3', fresh({ status: 'finished' }));
        await t('내 끝난 방 다시 쓰기(미래 시각)', false, setDoc(D(A, 'o3'), fresh({ createdAt: now + 60 * M, lastActivityAt: now + 60 * M })));
        await t('내 끝난 방 다시 쓰기(정상)', true, setDoc(D(A, 'o3'), fresh()));
    });

    it('R2-2: 같은 hostId만으로는 hostUid 있는 방을 못 덮어써요', async () => {
        const { now, A, C, D, seed, fresh, t } = ctx();
        const spoof = fresh({ hostUid: 'uid-C', members: [{ id: '1', uid: 'uid-C' }], memberUids: ['uid-C'] });
        await seed('alk_1', fresh({ gameType: 'alkkagi', status: 'finished' }));
        await t('c6 끝난 방을 같은 hostId·내 uid로 덮어쓰기', false, setDoc(D(C, 'alk_1'), { ...spoof, gameType: 'alkkagi' }));
        await seed('alk_1', fresh({ gameType: 'alkkagi', status: 'closed' }));
        await t('c6b 닫힌 방', false, setDoc(D(C, 'alk_1'), { ...spoof, gameType: 'alkkagi' }));
        await seed('alk_1', fresh({ gameType: 'alkkagi', lastActivityAt: now - 11 * M, createdAt: now - 12 * M }));
        await t('c6c 10분 멈춘 대기 방', false, setDoc(D(C, 'alk_1'), { ...spoof, gameType: 'alkkagi' }));
        await t('다른 id(alk_1_xxxxxx)로는 만들어요', true, setDoc(D(C, 'alk_1_ab12cd'), { ...spoof, gameType: 'alkkagi' }));
        await t('같은 기기 방장은 10분 멈춘 내 방 다시 써요', true, setDoc(D(A, 'alk_1'), fresh({ gameType: 'alkkagi' })));
    });

    it('R2-3: 남(비참가자)은 판·신청·자리·정리 시각을 못 바꿔요', async () => {
        const { now, A, B, C, D, seed, fresh, playing, t } = ctx();
        await seed('p', playing());
        await t('c1 남이 수 바꾸기', false, updateDoc(D(C, 'p'), { game: { board: [1], winner: '' } }));
        await t('c1c 남이 승자 정하기', false, updateDoc(D(C, 'p'), { game: { board: [], winner: 'white' }, status: 'finished' }));
        await t('c5 남이 진행 판 lastActivityAt 밀기', false, updateDoc(D(C, 'p'), { lastActivityAt: Date.now() }));
        await t('c13 남이 큰 칸 붙이기', false, updateDoc(D(C, 'p'), { junk: 'x'.repeat(1000) }));
        await t('참가자는 수를 둬요', true, updateDoc(D(B, 'p'), { game: { board: [1], winner: '' }, lastActivityAt: Date.now() }));
        const reqB = { id: '2', name: '서연', status: 'pending', at: now, uid: 'uid-B' };
        await seed('w', fresh({ joinRequests: [reqB], participantIds: ['1', '2'] }));
        await t('c2 남이 남의 신청 지우기', false, updateDoc(D(C, 'w'), { joinRequests: [], participantIds: ['1'] }));
        await t('c2c 남이 남의 신청 승인하기', false, updateDoc(D(C, 'w'), { joinRequests: [{ ...reqB, status: 'approved' }] }));
        await t('남이 남 uid로 신청 넣기', false, updateDoc(D(C, 'w'), { joinRequests: [reqB, { id: '3', status: 'pending', uid: 'uid-X' }] }));
        await t('남이 승인된 신청 넣기', false, updateDoc(D(C, 'w'), { joinRequests: [reqB, { id: '3', status: 'approved', uid: 'uid-C' }] }));
        await t('c3 남이 participantIds에 다른 학번 넣기', false, updateDoc(D(C, 'w'), { participantIds: ['1', '2', '7'] }));
        await t('c3b 내 신청과 함께 다른 학번도 넣기', false, updateDoc(D(C, 'w'), { joinRequests: [reqB, { id: '3', status: 'pending', uid: 'uid-C' }], participantIds: ['1', '2', '3', '7'] }));
        await t('c4 승인 없이 자리 차지', false, updateDoc(D(C, 'w'), { members: [{ id: '1', uid: 'uid-A' }, { id: '3', uid: 'uid-C' }], memberUids: ['uid-A', 'uid-C'] }));
        await t('c4c 남이 시작하기', false, updateDoc(D(C, 'w'), { status: 'playing' }));
        await t('c4d 남이 인원 바꾸기', false, updateDoc(D(C, 'w'), { maxPlayers: 9 }));
        await t('남이 대기 방 lastActivityAt만 밀기', false, updateDoc(D(C, 'w'), { lastActivityAt: Date.now() }));
        await t('남이 내 신청 넣기(정상)', true, updateDoc(D(C, 'w'), { joinRequests: [reqB, { id: '3', status: 'pending', at: now, uid: 'uid-C' }], participantIds: ['1', '2', '3'], lastActivityAt: Date.now() }));
        await t('남이 내 신청 취소(정상)', true, updateDoc(D(C, 'w'), { joinRequests: [reqB], participantIds: ['1', '2'], lastActivityAt: Date.now() }));
        await t('방장은 승인해요', true, updateDoc(D(A, 'w'), { joinRequests: [{ ...reqB, status: 'approved' }], members: [{ id: '1', uid: 'uid-A' }, { id: '2', uid: 'uid-B' }], memberUids: ['uid-A', 'uid-B'] }));
        await seed('idle', fresh({ lastActivityAt: now - 11 * M, createdAt: now - 12 * M }));
        await t('10분 멈춘 방 남이 닫기(정리, #83 #7 유지)', true, updateDoc(D(C, 'idle'), { status: 'closed' }));
        await seed('busy', fresh());
        await t('#83 #7 활동 중인 방 남이 닫기', false, updateDoc(D(C, 'busy'), { status: 'closed' }));
    });

    it('R2-4: uid 없이 승인된 자리는 내 uid만 채우고 끝내거나 나가요', async () => {
        const { B, C, D, seed, playing, t } = ctx();
        const noUid = playing({ members: [{ id: '1', uid: 'uid-A' }, { id: '2', name: '서연', role: 'player', seat: 1 }], memberUids: ['uid-A'] });
        const claimed = { members: [{ id: '1', uid: 'uid-A' }, { id: '2', name: '서연', role: 'player', seat: 1, uid: 'uid-B' }], memberUids: ['uid-A', 'uid-B'], lastActivityAt: Date.now() };
        await seed('q', noUid);
        await t('uid 채우면서 판도 바꾸기', false, updateDoc(D(B, 'q'), { ...claimed, game: { board: [9], winner: '' } }));
        await t('uid 채우면서 자리 이름 바꾸기', false, updateDoc(D(B, 'q'), { ...claimed, members: [claimed.members[0], { ...claimed.members[1], name: '가짜' }] }));
        await t('uid 채우기(자리 차지)', true, updateDoc(D(B, 'q'), claimed));
        await t('이미 uid 있는 자리를 남이 다시 차지', false, updateDoc(D(C, 'q'), { members: [claimed.members[0], { ...claimed.members[1], uid: 'uid-C' }], memberUids: ['uid-A', 'uid-C'] }));
        await t('채운 뒤 끝내기', true, updateDoc(D(B, 'q'), { status: 'finished', lastActivityAt: Date.now() }));
        await t('채운 뒤 내 자리 빼고 나가기', true, updateDoc(D(B, 'q'), { members: [claimed.members[0]], memberUids: ['uid-A'] }));
    });
});
