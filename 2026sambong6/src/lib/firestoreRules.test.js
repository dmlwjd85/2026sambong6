import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deleteDoc, deleteField, doc, getDoc, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
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

describe('firestore rules: PIN 세션과 스키마', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
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
            const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);
            await setDoc(doc(db, 'secrets/class1'), { pin: '2580' });
            await setDoc(doc(db, 'secrets/other-class'), { pin: '7777' });
            await setDoc(doc(db, 'secrets/sambong-class-2026'), { pin: '2580' });
            await setDoc(doc(db, 'gmSessions/teacher1'), { classId: 'class1', expiresAt });
            await setDoc(doc(db, 'gmSessions/teacher-other'), { classId: 'other-class', expiresAt });
            await setDoc(doc(db, 'gmSessions/seed-teacher'), { classId: 'sambong-class-2026', expiresAt });
        });
    });

    function anon() {
        return testEnv.authenticatedContext('anon-student', {
            provider_id: 'anonymous',
            firebase: { sign_in_provider: 'anonymous' },
        });
    }

    function signedOut() {
        return testEnv.unauthenticatedContext();
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

    it('N1: 세션 없는 익명 계정은 할인, 공지, 가격을 바꾸지 못한다', async () => {
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount({ percent: 100 }),
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            announcement: '가짜 공지',
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            shopPrices: { item_a: 1 },
        }, { merge: true }));
        await assertFails(setDoc(doc(signedOut().firestore(), settingsPath), {
            shopDiscount: validDiscount(),
        }, { merge: true }));
        const saved = await getDoc(doc(db, settingsPath));
        assert.equal(saved.data().shopDiscount, undefined);
        assert.equal(saved.data().announcement, undefined);
    });

    it('N2: 다른 학급 세션은 이 학급 설정과 승인 표식을 만들지 못한다', async () => {
        const other = otherTeacher().firestore();
        await assertFails(setDoc(doc(other, settingsPath), {
            bankInterestPercent: 4,
            announcement: '다른 반이 고침',
        }, { merge: true }));
        await assertFails(setDoc(doc(other, 'artifacts/brand-new-class/public/data/settings/global'), {
            raidPassword: '9999',
        }));
        await assertFails(setDoc(doc(anon().firestore(), 'artifacts/evil-class/public/data/settings/global'), {
            raidPassword: '9999',
            announcement: 'evil',
        }));
        await assertFails(setDoc(doc(other, 'artifacts/sambong-class-2026/public/data/approvedClassIds/evil-class'), {
            classId: 'evil-class',
            status: 'approved',
            createdBy: 'teacher-other',
        }));
        await assertFails(setDoc(doc(signedOut().firestore(), 'artifacts/closed-class/public/data/settings/global'), {
            raidPassword: '9999',
        }));
    });

    it('유효한 PIN 세션은 그 학급의 할인과 공지를 저장하고 형식은 그대로 검사한다', async () => {
        const db = teacher().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount(),
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            shopDiscount: { enabled: false, percent: 0 },
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            bankInterestPercent: 3,
            announcement: '오늘 숙제 없음',
            dragonBallFindXp: 40,
        }, { merge: true }));
        const saved = await getDoc(doc(db, settingsPath));
        assert.equal(saved.data().bankInterestPercent, 3);
        assert.equal(saved.data().announcement, '오늘 숙제 없음');
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
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            season1ItemsRefundedAt: 1,
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            season1ItemsRefundedAt: deleteField(),
        }, { merge: true }));
        await assertFails(deleteDoc(doc(db, settingsPath)));
        await assertFails(setDoc(doc(stranger().firestore(), settingsPath), {
            shopDiscount: validDiscount(),
        }, { merge: true }));
    });

    it('수업 XP 공지 문서는 현재 KST 종 시각만 쓰고, 세션 없이도 그 형식이면 통과한다', async () => {
        const db = teacher().firestore();
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
            await assertSucceeds(setDoc(doc(anon().firestore(), path), autoXpPayload(catchup.slotMs)));
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

    it('N3: 세션 없는 계정은 온도계 부모와 다른 학생 표를 바꾸지 못한다', async () => {
        const anonDb = anon().firestore();
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        const vote = `${path}/votes/2`;
        await assertSucceeds(setDoc(doc(teacher().firestore(), path), thermometerPayload()));
        await assertFails(setDoc(doc(anonDb, path), thermometerPayload({ date: '2026-10-20' })));
        await assertFails(setDoc(doc(anonDb, path), {
            settlementStatus: 'done',
            settlementKey: '2026-10-15',
        }, { merge: true }));
        await assertFails(setDoc(doc(anonDb, vote), { value: 1 }));
        await assertFails(setDoc(doc(anonDb, vote), { value: -20 }));
        await assertFails(setDoc(doc(otherTeacher().firestore(), path), thermometerPayload()));
        await assertFails(setDoc(doc(otherTeacher().firestore(), vote), { value: 1 }));
        await assertFails(setDoc(doc(anonDb, `${path}/votes/anon-student`), { value: -3 }));
    });

    it('학습 온도계는 유효한 PIN 세션과 형식 검사가 둘 다 있어야 저장된다', async () => {
        const db = teacher().firestore();
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        const vote = `${path}/votes/2`;
        await assertFails(setDoc(doc(db, path), thermometerPayload({ max: 501 })));
        await assertFails(setDoc(doc(db, path), thermometerPayload({ values: { '2': 20 } })));
        await assertSucceeds(setDoc(doc(db, path), thermometerPayload()));
        await assertSucceeds(setDoc(doc(db, vote), { value: 5 }));
        await assertFails(setDoc(doc(db, vote), { value: 21 }));
        await assertFails(setDoc(doc(db, vote), { value: 5, note: '조작' }));
        await assertSucceeds(setDoc(doc(db, path), {
            settlementStatus: 'done',
            settlementKey: '2026-10-15',
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, path), thermometerPayload({
            max: 30,
            settlementStatus: 'done',
            settlementKey: '2026-10-15',
            settledDate: '2026-10-15',
        })));
        await assertSucceeds(setDoc(doc(db, vote), { value: 21 }));
        await assertFails(setDoc(doc(db, vote), { value: 31 }));
        await assertSucceeds(setDoc(doc(db, path), {
            usedStaleValues: true,
            settlementLockOwner: 'student-tab',
        }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { usedStaleValues: 'yes' }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { settlementLockOwner: 'x'.repeat(81) }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, path), {
            usedStaleValues: true,
            settlementLockOwner: 'tabA',
            settlementAttempt: 2,
        }, { merge: true }));
        await assertFails(deleteDoc(doc(db, path)));
        await assertFails(deleteDoc(doc(signedOut().firestore(), path)));
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
        await assertFails(setDoc(doc(anon().firestore(), path), oldPayload));
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
        await assertFails(updateDoc(doc(anon().firestore(), settingsPath), {
            learningThermometer: { ...stored, values: { '1': 9 } },
        }));
        const blocked = await getDoc(doc(anon().firestore(), settingsPath));
        assert.deepEqual(blocked.data().learningThermometer.values, {});
        await assertSucceeds(updateDoc(doc(db, settingsPath), {
            learningThermometer: { ...stored, values: { '1': 9 } },
        }));
        const rewritten = await getDoc(doc(db, settingsPath));
        assert.equal(rewritten.data().learningThermometer.values['1'], 9);
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

    it('승인 표식은 시드 PIN 세션과 자기 uid만 만들고 새 학급 설정은 그 표식 뒤에만 만든다', async () => {
        const pin = anon().firestore();
        const seed = seedTeacher().firestore();
        const grant = 'artifacts/sambong-class-2026/public/data/approvedClassIds/fresh-class';
        await assertFails(setDoc(doc(pin, grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'anon-student',
        }));
        await assertFails(setDoc(doc(otherTeacher().firestore(), grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'teacher-other',
        }));
        await assertFails(setDoc(doc(seed, grant), {
            classId: 'fresh-class',
            status: 'pending',
            createdBy: 'seed-teacher',
        }));
        await assertSucceeds(setDoc(doc(seed, grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'seed-teacher',
        }));
        await assertFails(updateDoc(doc(seed, grant), { status: 'revoked' }));
        await assertFails(deleteDoc(doc(seed, grant)));
        await assertSucceeds(setDoc(doc(seed, 'artifacts/fresh-class/public/data/settings/global'), {
            raidPassword: '1234',
            shieldStock: 5,
        }));
        await assertFails(setDoc(doc(pin, 'artifacts/fresh-class/public/data/settings/global'), {
            raidPassword: '0000',
        }));
        await assertFails(setDoc(doc(pin, 'artifacts/unowned/public/data/settings/global'), {
            lotto: null,
        }));
        await assertFails(setDoc(doc(seed, 'artifacts/bad-discount/public/data/settings/global'), {
            shopDiscount: validDiscount({ percent: 150 }),
        }));
        await assertFails(setDoc(doc(signedOut().firestore(), grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'seed-teacher',
        }));
    });

    it('로그인한 학생은 로또와 경험치를 저장하고 헌법 항목과 비로그인은 막힌다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            lotto: { round: 2, status: 'open' },
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            constitutionItems: [{ id: 'c1', title: 'x', body: 'y' }],
        }, { merge: true }));
        const studentPath = 'artifacts/class1/public/data/students/student_4';
        await assertSucceeds(setDoc(doc(db, studentPath), { xp: 10, bong: 0 }));
        await assertSucceeds(setDoc(doc(db, studentPath), { xp: 20, bong: 1 }, { merge: true }));
        await assertFails(setDoc(doc(db, studentPath), {
            xp: 25,
            lastClassXpSlot: '2099_01_01_09:40',
        }, { merge: true }));
        await assertFails(setDoc(doc(signedOut().firestore(), studentPath), { xp: 21 }, { merge: true }));
    });

    it('settings/global 삭제와 admins 쓰기, 다른 uid 읽기를 막는다', async () => {
        const teacherDb = teacher().firestore();
        const strangerDb = stranger().firestore();
        await assertFails(deleteDoc(doc(teacherDb, settingsPath)));
        await assertFails(setDoc(doc(teacherDb, 'admins/teacher1'), { role: 'gm' }));
        await assertFails(getDoc(doc(strangerDb, 'admins/teacher1')));
        await assertSucceeds(getDoc(doc(teacherDb, 'admins/teacher1')));
    });

    it('그 학급 PIN 세션만 GM 키가 있는 settings/global 을 만들고 틀린 할인은 거부한다', async () => {
        const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, 'secrets/new-class'), { pin: '2580' });
            await setDoc(doc(db, 'gmSessions/class-owner'), { classId: 'new-class', expiresAt });
        });
        const owner = testEnv.authenticatedContext('class-owner', {
            firebase: { sign_in_provider: 'anonymous' },
        }).firestore();
        await assertFails(setDoc(doc(anon().firestore(), 'artifacts/new-class/public/data/settings/global'), {
            raidPassword: '1234',
            worldSettings: { worldName: 'MATE' },
        }));
        await assertSucceeds(setDoc(doc(owner, 'artifacts/new-class/public/data/settings/global'), {
            raidPassword: '1234',
            worldSettings: { worldName: 'MATE' },
        }));
        await assertFails(setDoc(doc(owner, 'artifacts/new-class/public/data/settings/global'), {
            shopDiscount: validDiscount({ enabled: true, startAt: 9, endAt: 9 }),
        }, { merge: true }));
        await assertFails(setDoc(doc(signedOut().firestore(), 'artifacts/closed-new/public/data/settings/global'), {
            raidPassword: '1234',
        }));
    });

    function anonUid(uid) {
        return testEnv.authenticatedContext(uid, {
            firebase: { sign_in_provider: 'anonymous' },
        });
    }

    function pinExpiresAt(minutesFromNow) {
        return Timestamp.fromMillis(Date.now() + minutesFromNow * 60 * 1000);
    }

    async function commitPinGuess(db, { uid, classId, pin, count, lock = false, expiresAt = null }) {
        const exp = expiresAt || pinExpiresAt(9);
        const batch = writeBatch(db);
        batch.set(doc(db, `gmPinAttempts/${classId}`), {
            count,
            lockedUntil: lock ? Timestamp.fromMillis(Date.now() + 15 * 60 * 1000) : null,
        });
        batch.set(doc(db, `gmPinProofs/${uid}`), { pin, classId, expiresAt: exp });
        await batch.commit();
        return exp;
    }

    it('틀린 PIN, 만료 세션, 남의 uid, secrets 읽기, 세션 없는 교사 쓰기를 거부한다', async () => {
        const uid = 'pin-user';
        const db = anonUid(uid).firestore();
        const expiresAt = pinExpiresAt(9);
        const tooLong = pinExpiresAt(11);
        await assertFails(getDoc(doc(db, 'secrets/class1')));
        await assertFails(getDoc(doc(teacher().firestore(), 'secrets/class1')));
        await assertFails(setDoc(doc(db, 'gmSessions/teacher1'), { classId: 'class1', expiresAt }));
        await assertFails(setDoc(doc(db, `gmSessions/${uid}`), { classId: 'class1', expiresAt }));
        await assertFails(setDoc(doc(db, `gmPinProofs/${uid}`), { pin: '0000', classId: 'class1', expiresAt }));
        await assertFails(setDoc(doc(db, 'gmPinAttempts/class1'), { count: 1, lockedUntil: null }));
        await assertSucceeds(commitPinGuess(db, { uid, classId: 'class1', pin: '0000', count: 1 }));
        await assertFails(commitPinGuess(db, { uid, classId: 'class1', pin: '0000', count: 1 }));
        await deleteDoc(doc(db, `gmPinProofs/${uid}`));
        const matchedExp = pinExpiresAt(9);
        await assertSucceeds(commitPinGuess(db, {
            uid, classId: 'class1', pin: '2580', count: 2, expiresAt: matchedExp,
        }));
        await assertFails(setDoc(doc(db, `gmSessions/${uid}`), { classId: 'class1', expiresAt: tooLong }));
        const open = writeBatch(db);
        open.set(doc(db, `gmSessions/${uid}`), { classId: 'class1', expiresAt: matchedExp });
        open.delete(doc(db, `gmPinProofs/${uid}`));
        open.set(doc(db, 'gmPinAttempts/class1'), { count: 0, lockedUntil: null });
        await assertSucceeds(open.commit());
        const session = await getDoc(doc(db, `gmSessions/${uid}`));
        assert.equal(session.data().classId, 'class1');
        assert.equal('pin' in session.data(), false);
        await assertFails(getDoc(doc(db, `gmPinProofs/${uid}`)));
        await assertFails(getDoc(doc(anon().firestore(), `gmSessions/${uid}`)));
        await assertSucceeds(setDoc(doc(db, settingsPath), { announcement: '세션으로 저장' }, { merge: true }));
        const extended = pinExpiresAt(9);
        await assertSucceeds(updateDoc(doc(db, `gmSessions/${uid}`), { expiresAt: extended }));
        await assertFails(updateDoc(doc(db, `gmSessions/${uid}`), { expiresAt: tooLong }));

        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'gmSessions/expired-user'), {
                classId: 'class1',
                expiresAt: Timestamp.fromMillis(Date.now() - 60 * 1000),
            });
        });
        const expiredDb = anonUid('expired-user').firestore();
        await assertFails(setDoc(doc(expiredDb, settingsPath), { announcement: '만료' }, { merge: true }));
        await assertFails(updateDoc(doc(expiredDb, 'gmSessions/expired-user'), { expiresAt: pinExpiresAt(9) }));
        await assertFails(setDoc(doc(db, 'artifacts/class1/public/data/students/student_gm'), {
            pin: '2580',
            xp: 0,
            bong: 0,
        }));
        await assertSucceeds(setDoc(doc(db, 'artifacts/class1/public/data/students/student_gm'), {
            xp: 0,
            bong: 0,
        }));
        await assertFails(setDoc(doc(anon().firestore(), 'secrets/class1'), { pin: '9999' }));
        await assertFails(setDoc(doc(otherTeacher().firestore(), 'secrets/class1'), { pin: '9999' }));
        await assertSucceeds(setDoc(doc(teacher().firestore(), 'secrets/class1'), { pin: '2599' }));
        await assertFails(getDoc(doc(teacher().firestore(), 'secrets/class1')));
    });

    it('틀린 PIN 200번 뒤에는 학급이 15분 잠기고, 맞는 PIN과 다른 uid도 거절된다', async () => {
        const uid = 'pin-brute';
        const otherUid = 'pin-brute-other';
        const db = anonUid(uid).firestore();
        const otherDb = anonUid(otherUid).firestore();
        const classId = 'class1';
        let accepted = 0;
        for (let n = 1; n <= 200; n += 1) {
            await deleteDoc(doc(db, `gmPinProofs/${uid}`)).catch(() => {});
            const guess = commitPinGuess(db, {
                uid,
                classId,
                pin: String(1000 + (n % 9000)),
                count: n <= 10 ? n : 1,
                lock: n === 10,
            });
            if (n <= 10) {
                await assertSucceeds(guess);
                accepted += 1;
            } else {
                await assertFails(guess);
            }
        }
        assert.equal(accepted, 10);
        const attempt = await getDoc(doc(db, `gmPinAttempts/${classId}`));
        assert.equal(attempt.data().count, 10);
        assert.ok(attempt.data().lockedUntil.toMillis() > Date.now() + 14 * 60 * 1000);

        await deleteDoc(doc(db, `gmPinProofs/${uid}`)).catch(() => {});
        await assertFails(commitPinGuess(db, { uid, classId, pin: '2580', count: 11, lock: true }));
        await assertFails(commitPinGuess(db, { uid, classId, pin: '2580', count: 1 }));
        await assertFails(commitPinGuess(otherDb, { uid: otherUid, classId, pin: '2580', count: 1 }));
        await assertFails(commitPinGuess(otherDb, { uid: otherUid, classId, pin: '2580', count: 11, lock: true }));

        const expiresAt = pinExpiresAt(9);
        const correctAsOther = writeBatch(otherDb);
        correctAsOther.set(doc(otherDb, `gmSessions/${otherUid}`), { classId, expiresAt });
        correctAsOther.set(doc(otherDb, `gmPinAttempts/${classId}`), { count: 0, lockedUntil: null });
        await assertFails(correctAsOther.commit());
        await assertFails(setDoc(doc(db, settingsPath), { announcement: '잠금 우회' }, { merge: true }));
        const plantedExp = pinExpiresAt(9);
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), `gmPinProofs/${uid}`), {
                pin: '2580',
                classId,
                expiresAt: plantedExp,
            });
        });
        const planted = writeBatch(db);
        planted.set(doc(db, `gmSessions/${uid}`), { classId, expiresAt: plantedExp });
        planted.delete(doc(db, `gmPinProofs/${uid}`));
        planted.set(doc(db, `gmPinAttempts/${classId}`), { count: 0, lockedUntil: null });
        await assertFails(planted.commit());

        const still = await getDoc(doc(otherDb, `gmPinAttempts/${classId}`));
        assert.equal(still.data().count, 10);
        assert.ok(still.data().lockedUntil.toMillis() > Date.now());
    });

    function kstTodayString(now = Date.now()) {
        const kst = new Date(now + 9 * 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
    }

    it('세션 없이 자동 정산은 통과하고 N3 위조와 수동 저장은 거부된다', async () => {
        const anonDb = anon().firestore();
        await assertFails(setDoc(doc(anonDb, settingsPath), { announcement: '수동 공지' }, { merge: true }));
        await assertFails(setDoc(doc(anonDb, settingsPath), { shopDiscount: validDiscount() }, { merge: true }));

        const catchup = classXpCatchupSlot(new Date());
        if (catchup) {
            const studentPath = 'artifacts/class1/public/data/students/student_6';
            await testEnv.withSecurityRulesDisabled(async (context) => {
                await setDoc(doc(context.firestore(), studentPath), { xp: 10, bong: 0 });
            });
            await assertSucceeds(setDoc(doc(anonDb, studentPath), {
                xp: 15,
                lastClassXpSlot: catchup.key,
            }, { merge: true }));
            await assertSucceeds(setDoc(doc(anonDb, 'artifacts/class1/public/data/settings/autoXp'), autoXpPayload(catchup.slotMs)));
        }

        await assertSucceeds(setDoc(doc(anonDb, 'artifacts/class1/public/data/students/student_7'), { xp: 1, bong: 3 }));
        await assertSucceeds(setDoc(doc(anonDb, settingsPath), { lastSalaryWeek: 'SALARY_2026_10_16' }, { merge: true }));
        await assertSucceeds(setDoc(doc(anonDb, 'artifacts/class1/public/data/students/student_7'), { bong: 30 }, { merge: true }));

        const thermo = 'artifacts/class1/public/data/settings/learningThermometer';
        const today = kstTodayString();
        const now = Date.now();
        await assertFails(setDoc(doc(anonDb, thermo), thermometerPayload({
            date: today,
            settlementKey: today,
            settledDate: today,
            settlementStatus: 'done',
            settlementLockOwner: 'tabA',
        })));
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), thermo), thermometerPayload({
                date: today,
                settlementKey: today,
                settlementStatus: 'running',
                settlementStartedAt: now - 1000,
                settlementLockOwner: 'tabA',
                settlementAttempt: 1,
            }));
            await setDoc(doc(context.firestore(), settingsPath), {
                learningThermometer: { min: -20, max: 20, date: today, values: { '1': 4 } },
            }, { merge: true });
        });
        await assertFails(setDoc(doc(anonDb, `${thermo}/votes/2`), { value: -20 }));
        await assertFails(setDoc(doc(anonDb, thermo), {
            settlementStatus: 'done',
            settlementKey: '2099-01-01',
            settledDate: '2099-01-01',
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(anonDb, `${thermo}/votes/2`), { value: 0 }));
        await assertSucceeds(setDoc(doc(anonDb, thermo), thermometerPayload({
            date: today,
            min: -20,
            max: 20,
            settledDate: today,
            lastSettlementAt: now,
            settlementKey: today,
            settlementStatus: 'done',
            settlementStartedAt: 0,
            settlementLockOwner: '',
            settlementAttempt: 1,
            usedStaleValues: false,
        })));
        await assertSucceeds(updateDoc(doc(anonDb, settingsPath), {
            learningThermometer: { min: -20, max: 20, date: today, values: {} },
        }));
        await assertFails(updateDoc(doc(anonDb, settingsPath), {
            learningThermometer: { min: -20, max: 20, date: today, values: { '1': 9 } },
        }));
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
