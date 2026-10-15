import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deleteDoc, deleteField, doc, getDoc, increment, setDoc } from 'firebase/firestore';
import { classXpCatchupSlot } from './classXpSlot.js';
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
                lastClassXpSlot: '2000_01_03_09:40',
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
        await assertFails(setDoc(doc(anonDb, path), thermometerPayload()));
        await assertFails(setDoc(doc(anonDb, path), thermometerPayload({ max: 100 })));
        await assertFails(setDoc(doc(anonDb, path), thermometerPayload({ values: { '2': 20 } })));
        await assertSucceeds(setDoc(doc(teacherDb, path), thermometerPayload()));
        await assertFails(setDoc(doc(anonDb, vote), { value: 5 }));
        await assertSucceeds(setDoc(doc(teacherDb, vote), { value: 5 }));
        await assertFails(setDoc(doc(teacherDb, vote), { value: 21 }));
        await assertFails(setDoc(doc(teacherDb, vote), { value: 5, note: '조작' }));
        await assertSucceeds(setDoc(doc(anonDb, `${path}/votes/anon-student`), { value: -3 }));
        await assertFails(setDoc(doc(otherTeacher().firestore(), vote), { value: 1 }));
        await assertFails(setDoc(doc(anonDb, path), {
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
        await assertFails(deleteDoc(doc(anonDb, path)));
    });

    it('시드 학급 선생님의 승인 표식은 그 선생님 uid로만 새 학급 설정을 만든다', async () => {
        const seed = seedTeacher().firestore();
        const grant = 'artifacts/sambong-class-2026/public/data/approvedClassIds/fresh-class';
        await assertFails(setDoc(doc(otherTeacher().firestore(), grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'teacher-other',
        }));
        await assertFails(setDoc(doc(seed, grant), {
            classId: 'fresh-class',
            status: 'approved',
        }));
        await assertSucceeds(setDoc(doc(seed, grant), {
            classId: 'fresh-class',
            status: 'approved',
            createdBy: 'seed-teacher',
        }));
        await assertSucceeds(setDoc(doc(seed, 'artifacts/fresh-class/public/data/settings/global'), {
            raidPassword: '1234',
            shieldStock: 5,
        }));
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'artifacts/sambong-class-2026/public/data/approvedClassIds/stolen-class'), {
                classId: 'stolen-class',
                status: 'approved',
                createdBy: 'teacher-other',
            });
        });
        await assertFails(setDoc(doc(seed, 'artifacts/stolen-class/public/data/settings/global'), {
            shieldStock: 5,
        }));
        await assertSucceeds(setDoc(doc(otherTeacher().firestore(), 'artifacts/stolen-class/public/data/settings/global'), {
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

    function studentResetPayload(pin = '1111') {
        return {
            pin,
            xp: 0,
            xpChangeLog: [],
            bong: 0.0,
            quests: {},
            unlockedQuests: {},
            jobs: [],
            ownedSkins: {},
            equippedSkins: {},
            hasShield: false,
            shieldHP: 0,
            condition: null,
            statusMessage: '',
            unlockedFeatures: {},
            homeLookMode: '',
            dragonBalls: [],
            dragonBallWeekendKey: '',
            earlyBirdCount: 0,
            inventory: [],
            equippedWeapon: null,
            equippedShield: null,
            equippedShoes: null,
            gearEnhance: {},
            lunchBid: { date: '', amount: 0 },
            lastLunchDeductDate: '',
            questHistory: [],
            usedRaidPasswords: [],
            bankRegularSavings: 0,
            bankTermDeposits: [],
            bankDailyBonusLastDate: '',
            bankLoan: null,
            creditDefaultUntilYmd: '',
            bankNegativeSinceYmd: '',
            loanPenaltyUntilYmd: '',
            attendanceMark: null,
            praiseCount: 0,
            dailyAllClearBonusDate: '',
            stockInvestments: { kospi: null, kosdaq: null, nasdaq: null },
            stockInvestDaily: { date: '', profit: 0, sells: 0 },
            catBattle: { cleared: 0, friends: [], dailyDate: '', dailyWins: 0 },
            classEventPurchases: [],
            conveniencePurchases: [],
            lottoTickets: [],
        };
    }

    async function seedStudent(path, data) {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), path), data);
        });
    }

    it('익명 클라이언트는 다른 학생의 봉·경험치를 조작하거나 문서를 지우지 못한다', async () => {
        const path = 'artifacts/class1/public/data/students/student_4';
        await seedStudent(path, { xp: 40, bong: 80, pin: '2222', quests: { q1: true } });
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, path), { bong: 999999, xp: 'x' }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { xp: 'x' }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { bong: 'lots' }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { xp: 99999 }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { bong: 999999 }, { merge: true }));
        await assertFails(setDoc(doc(db, 'artifacts/class1/public/data/students/student_new'), {
            xp: 'x',
            bong: 0,
        }));
        await assertFails(deleteDoc(doc(db, path)));
        await assertFails(deleteDoc(doc(teacher().firestore(), path)));
        await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), path), { xp: 1 }, { merge: true }));
        await assertFails(setDoc(doc(db, `${path}/notes/secret`), { text: 'x' }));
        await assertSucceeds(setDoc(doc(db, path), { pin: '3333' }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, 'artifacts/class1/public/data/shopGroupBuy/s4'), {
            contributions: { '4': 30 },
        }));
    });

    it('같은 종 슬롯에 경험치 +5를 반복하지 못하고, 첫 지급과 퀘스트 저장은 된다', async () => {
        const path = 'artifacts/class1/public/data/students/student_5';
        const catchup = classXpCatchupSlot(new Date());
        await seedStudent(path, { xp: 10, bong: 3, lastClassXpSlot: '2000_01_03_09:40' });
        const db = anon().firestore();
        if (!catchup) {
            await assertFails(setDoc(doc(db, path), {
                xp: 15,
                lastClassXpSlot: '2026_10_15_14:40',
            }, { merge: true }));
            await assertSucceeds(setDoc(doc(db, path), { xp: 15 }, { merge: true }));
            return;
        }
        await assertSucceeds(setDoc(doc(db, path), {
            xp: increment(5),
            lastClassXpSlot: catchup.key,
        }, { merge: true }));
        await assertFails(setDoc(doc(db, path), { xp: 20 }, { merge: true }));
        await assertFails(setDoc(doc(db, path), {
            xp: increment(5),
            lastClassXpSlot: catchup.key,
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(teacher().firestore(), path), { xp: 25 }, { merge: true }));
        await assertFails(setDoc(doc(otherTeacher().firestore(), path), { xp: 30 }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, path), {
            xp: 41,
            bong: 6,
            quests: { q6: true },
            questHistory: [{ id: 'q6', name: '다리 근력', xp: 16, bong: 3 }],
        }, { merge: true }));
    });

    it('잔액이 5050을 넘어도 초기화 모양이면 봉 0을 허용하고, 일부만 0으로 덮는 것은 막는다', async () => {
        const path = 'artifacts/class1/public/data/students/student_6';
        await seedStudent(path, {
            xp: 400,
            bong: 8000,
            pin: '1111',
            quests: { q1: true },
            lastClassXpSlot: '2000_01_03_09:40',
            bankRegularSavings: 50,
        });
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, path), { xp: 0, bong: 0 }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, path), studentResetPayload('1111')));
        const snap = await getDoc(doc(db, path));
        assert.equal(snap.data().xp, 0);
        assert.equal(snap.data().bong, 0);
        assert.equal(snap.data().lastClassXpSlot, undefined);
    });

    it('선생님은 한 번에 650을 넘는 경험치를 고치고, 익명 세션은 고치지 못한다', async () => {
        const path = 'artifacts/class1/public/data/students/student_7';
        await seedStudent(path, { xp: 10, bong: 20 });
        await assertFails(setDoc(doc(anon().firestore(), path), { xp: 5000 }, { merge: true }));
        await assertFails(setDoc(doc(otherTeacher().firestore(), path), { xp: 5000 }, { merge: true }));
        await assertSucceeds(setDoc(doc(teacher().firestore(), path), { xp: 5000 }, { merge: true }));
    });

    it('저장된 경험치가 숫자가 아니면 숫자로 고치는 저장을 허용한다', async () => {
        const path = 'artifacts/class1/public/data/students/student_11';
        await seedStudent(path, { xp: 'x', bong: 7, quests: {} });
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, path), { xp: 'still-bad' }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, path), { xp: 250, quests: { q1: true } }, { merge: true }));
        await seedStudent(path, { xp: 250, bong: 'bad' });
        await assertFails(setDoc(doc(db, path), { bong: 'worse' }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, path), { bong: 12 }, { merge: true }));
    });

    it('시즌 2 병합은 경험치를 0으로 되돌리고 정산 봉만 더한다', async () => {
        const path = 'artifacts/class1/public/data/students/student_12';
        await seedStudent(path, {
            xp: 20000,
            bong: 80,
            lastClassXpSlot: '2000_01_03_14:40',
            quests: { q1: true },
            inventory: ['sword'],
        });
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, path), {
            seasonNumberApplied: 2,
            season1Xp: 20000,
            season1SettledAt: Date.now(),
            season1BongReward: 200,
            xp: 0,
            quests: {},
            unlockedQuests: {},
            questHistory: [],
            dailyAllClearBonusDate: '',
            earlyBirdCount: 0,
            usedRaidPasswords: [],
            dragonBalls: [],
            dragonBallWeekendKey: '',
            inventory: [],
            equippedWeapon: null,
            equippedShield: null,
            equippedShoes: null,
            gearEnhance: {},
            itemRefundLedger: [],
            seasonSkinRefundCount: 0,
            lastSkinRefundDate: '',
            xpChangeLog: [{ at: 1, reason: '시즌 2 시작', before: 20000, after: 0, delta: -20000 }],
            bong: increment(200),
        }, { merge: true }));
        const snap = await getDoc(doc(db, path));
        assert.equal(snap.data().xp, 0);
        assert.equal(snap.data().bong, 280);
        assert.equal(snap.data().lastClassXpSlot, '2000_01_03_14:40');
    });

    it('주급 증가, 공동구매, 은행, 상점, 퀘스트 저장을 허용한다', async () => {
        const salary = 'artifacts/class1/public/data/students/student_13';
        const buyer = 'artifacts/class1/public/data/students/student_14';
        const payer = 'artifacts/class1/public/data/students/student_15';
        const payee = 'artifacts/class1/public/data/students/student_16';
        const shopper = 'artifacts/class1/public/data/students/student_17';
        const quester = 'artifacts/class1/public/data/students/student_18';
        await seedStudent(salary, { xp: 10, bong: 4 });
        await seedStudent(buyer, { xp: 10, bong: 100 });
        await seedStudent(payer, { xp: 10, bong: 3000, bankRegularSavings: 0 });
        await seedStudent(payee, { xp: 10, bong: 20 });
        await seedStudent(shopper, { xp: 20, bong: 400, ownedSkins: {} });
        await seedStudent(quester, { xp: 30, bong: 15, quests: {}, questHistory: [] });
        const db = anon().firestore();

        await assertSucceeds(setDoc(doc(db, salary), { bong: increment(12) }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, buyer), { bong: 70 }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, buyer), { bong: increment(27) }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, 'artifacts/class1/public/data/shopGroupBuy/item_random'), {
            contributions: { '14': 30 },
            updatedAt: Date.now(),
        }));

        await assertSucceeds(setDoc(doc(db, payer), {
            bong: 1000,
            bankRegularSavings: 2000,
            bongChangeLog: [{ reason: '계좌이체', before: 3000, after: 1000, delta: -2000 }],
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, payee), {
            bong: 2020,
            bongChangeLog: [{ reason: '계좌이체', before: 20, after: 2020, delta: 2000 }],
        }, { merge: true }));

        await assertSucceeds(setDoc(doc(db, shopper), {
            bong: 100,
            ownedSkins: { f_king: true },
            shopDailyPurchase: { date: '2026-10-15', item_xp_pack: 1 },
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, shopper), {
            xp: 45,
            bong: 50,
        }, { merge: true }));

        await assertSucceeds(setDoc(doc(db, quester), {
            xp: 46,
            bong: 18,
            quests: { q6: true },
            questHistory: [{ id: 'q6', name: '다리 근력', xp: 16, bong: 3 }],
        }, { merge: true }));

        const paid = await getDoc(doc(db, salary));
        assert.equal(paid.data().bong, 16);
        const pooled = await getDoc(doc(db, buyer));
        assert.equal(pooled.data().bong, 97);
    });

    it('선생님 복구는 큰 경험치·봉과 슬롯 삭제를 허용하고 익명 세션은 막는다', async () => {
        const path = 'artifacts/class1/public/data/students/student_19';
        await seedStudent(path, {
            xp: 10,
            bong: 9000,
            pin: '4444',
            lastClassXpSlot: '2000_01_03_14:40',
            quests: {},
        });
        const restored = {
            pin: '4444',
            xp: 8000,
            bong: 120,
            quests: { q1: true },
            questHistory: [{ id: 'q1', xp: 8 }],
            inventory: ['wand'],
            jobs: [{ id: 'job1' }],
            bankRegularSavings: 40,
        };
        await assertFails(setDoc(doc(anon().firestore(), path), restored));
        await assertSucceeds(setDoc(doc(teacher().firestore(), path), restored));
        const snap = await getDoc(doc(teacher().firestore(), path));
        assert.equal(snap.data().xp, 8000);
        assert.equal(snap.data().bong, 120);
        assert.equal(snap.data().lastClassXpSlot, undefined);
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
