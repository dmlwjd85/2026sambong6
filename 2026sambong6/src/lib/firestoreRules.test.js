import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deleteDoc, deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
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

    function autoXpPayload(slotMs, key = '2026_10_15_09:40') {
        return {
            lastAutoXpTime: key,
            announcement: '[09:40] 수업 종료! 모든 학생에게 경험치 +5XP가 자동 지급되었습니다.',
            slotMs,
        };
    }

    function thermometerPayload(extra = {}) {
        return {
            date: '2026-10-15',
            min: -20,
            max: 20,
            values: { '2': 3 },
            settledDate: '',
            lastSettlementAt: 0,
            settlementKey: '',
            settlementStatus: '',
            settlementStartedAt: 0,
            settlementAppliedCount: 0,
            settlementTotalDelta: 0,
            ...extra,
        };
    }

    it('익명 세션은 admins에 있어도 updatedBy를 gm으로 넣어도 할인을 저장하지 못한다', async () => {
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount({ updatedBy: 'gm' }),
        }, { merge: true }));
    });

    it('admins에 없는 이메일 계정은 할인과 GM 전용 키를 바꾸지 못한다', async () => {
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, settingsPath), {
            shopDiscount: validDiscount(),
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
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

    it('익명 학생은 이자율처럼 GM 전용 경제 키를 저장하지 못한다', async () => {
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, settingsPath), {
            bankInterestPercent: 1000,
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            announcement: '학생 공지',
            dragonBallFindXp: 9999,
        }, { merge: true }));
    });

    it('허용된 선생님은 자기 학급 이자율만 저장한다', async () => {
        const own = teacher().firestore();
        await assertSucceeds(setDoc(doc(own, settingsPath), {
            bankInterestPercent: 3,
        }, { merge: true }));
        const other = otherTeacher().firestore();
        await assertFails(setDoc(doc(other, settingsPath), {
            bankInterestPercent: 1000,
        }, { merge: true }));
        await assertFails(setDoc(doc(other, 'artifacts/brand-new-class/public/data/settings/global'), {
            raidPassword: '9999',
        }));
    });

    it('시즌1 환불 표식은 학생이 바꾸거나 지우지 못한다', async () => {
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, settingsPath), {
            season1ItemsRefundedAt: 1,
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            season1ItemsRefundedAt: deleteField(),
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
            raidPasswordNeedsSetup: false,
        }, { merge: true }));
    });

    it('수업 XP 표식은 현재 시각 근처에서만, 그리고 이전보다 늦게만 저장된다', async () => {
        const db = anon().firestore();
        const path = 'artifacts/class1/public/data/settings/autoXp';
        const now = Date.now();
        await assertSucceeds(setDoc(doc(db, path), autoXpPayload(now)));
        await assertFails(setDoc(doc(db, path), autoXpPayload(now - 60 * 60 * 1000, '2026_10_15_10:30')));
        await assertFails(setDoc(doc(db, path), autoXpPayload(now + 60 * 1000, '2026_10_15_10:30')));
        await assertFails(deleteDoc(doc(db, path)));
    });

    it('학습 온도계는 범위 안의 문서만 저장한다', async () => {
        const db = anon().firestore();
        const path = 'artifacts/class1/public/data/settings/learningThermometer';
        await assertSucceeds(setDoc(doc(db, path), thermometerPayload()));
        await assertFails(setDoc(doc(db, path), thermometerPayload({ min: 10, max: 20 })));
        await assertFails(setDoc(doc(db, path), thermometerPayload({ max: 900 })));
        await assertFails(deleteDoc(doc(db, path)));
    });

    it('시드 학급 선생님의 승인 표식이 있으면 새 학급 설정을 만들 수 있다', async () => {
        const seed = seedTeacher().firestore();
        const grant = 'artifacts/sambong-class-2026/public/data/approvedClassIds/fresh-class';
        await assertFails(setDoc(doc(otherTeacher().firestore(), grant), {
            classId: 'fresh-class',
            status: 'approved',
        }));
        await assertSucceeds(setDoc(doc(seed, grant), {
            classId: 'fresh-class',
            status: 'approved',
        }));
        await assertSucceeds(setDoc(doc(seed, 'artifacts/fresh-class/public/data/settings/global'), {
            raidPassword: '1234',
            shieldStock: 5,
        }));
        await assertFails(setDoc(doc(anon().firestore(), 'artifacts/unowned/public/data/settings/global'), {
            lotto: null,
        }));
    });

    it('로그인한 학생은 로또 같은 일반 키는 저장하고 GM 전용 키는 저장하지 못한다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, settingsPath), {
            lotto: { round: 2, status: 'open' },
        }, { merge: true }));
        await assertFails(setDoc(doc(db, settingsPath), {
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

    it('GM 전용 키가 들어간 settings/global 생성은 선생님만 할 수 있다', async () => {
        const fresh = 'artifacts/new-class/public/data/settings/global';
        await assertFails(setDoc(doc(anon().firestore(), fresh), {
            raidPassword: '1234',
            worldSettings: { worldName: 'MATE' },
        }));
        await assertFails(setDoc(doc(anon().firestore(), 'artifacts/plain/public/data/settings/global'), {
            lotto: null,
            musicTimeQueue: [],
        }));
        await assertSucceeds(setDoc(doc(teacher().firestore(), fresh), {
            raidPassword: '1234',
            shieldStock: 5,
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
