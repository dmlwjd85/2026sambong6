import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const emulatorOn = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = 'demo-sambong';

function pad(n) {
    return String(n).padStart(2, '0');
}

function kstParts(now = Date.now()) {
    const kst = new Date(now + 9 * 60 * 60 * 1000);
    return {
        y: kst.getUTCFullYear(),
        m: kst.getUTCMonth() + 1,
        d: kst.getUTCDate(),
        wd: kst.getUTCDay(),
    };
}

function ymdFrom(y, m, d) {
    return `${y}-${pad(m)}-${pad(d)}`;
}

function shiftYmd(y, m, d, delta) {
    const next = new Date(Date.UTC(y, m - 1, d) + delta * 86400000);
    return ymdFrom(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function kstToday(now = Date.now()) {
    const p = kstParts(now);
    return ymdFrom(p.y, p.m, p.d);
}

function kstMonday(now = Date.now()) {
    const p = kstParts(now);
    const back = p.wd === 0 ? 6 : p.wd - 1;
    return shiftYmd(p.y, p.m, p.d, -back);
}

function salaryLockNow(now = Date.now()) {
    const p = kstParts(now);
    let delta = 5 - p.wd;
    if (p.wd === 6) delta = -1;
    else if (p.wd === 0) delta = -2;
    const friday = shiftYmd(p.y, p.m, p.d, delta);
    return `SALARY_${friday.replace(/-/g, '_')}`;
}

function loan(principal, interest = 1) {
    return {
        id: 'loan1',
        principal,
        interest,
        days: 1,
        startYmd: '2026-10-01',
        dueYmd: '2026-10-20',
        rateAtStart: 10,
    };
}

function term(amount, id = 'td1') {
    return [{ id, amount, startDate: '2026-09-01' }];
}

describe('firestore rules: 주급·은행·식 한도', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
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
    });

    function anonDb() {
        return testEnv.authenticatedContext('anon-student', {
            provider_id: 'anonymous',
            firebase: { sign_in_provider: 'anonymous' },
        }).firestore();
    }

    function signedOutDb() {
        return testEnv.unauthenticatedContext().firestore();
    }

    function teacherDb() {
        return testEnv.authenticatedContext('teacher1', {
            email: 'teacher@school.kr',
            firebase: { sign_in_provider: 'password' },
        }).firestore();
    }

    function studentPath(id = '3') {
        return `artifacts/class1/public/data/students/student_${id}`;
    }

    async function seed(id, data) {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), studentPath(id)), data);
        });
    }

    it('학생 자동 로그인에 필요한 문서 만들기와 이어서 고치기는 통과한다', async () => {
        const db = anonDb();
        const path = studentPath('11');
        await assertFails(setDoc(doc(signedOutDb(), path), { xp: 0, bong: 0 }));
        await assertSucceeds(setDoc(doc(db, path), {
            pin: '1234',
            xp: 0,
            bong: 0,
            bankRegularSavings: 0,
            bankTermDeposits: [],
            bankLoan: null,
            stockInvestments: { kospi: null, kosdaq: null, nasdaq: null },
            stockInvestDaily: { date: '', profit: 0, sells: 0 },
        }));
        await assertSucceeds(setDoc(doc(db, path), { statusMessage: '출석' }, { merge: true }));
        const snap = await getDoc(doc(db, path));
        assert.equal(snap.data().pin, '1234');
        assert.equal(snap.data().statusMessage, '출석');
        await assertFails(setDoc(doc(db, studentPath('12')), {
            xp: 0,
            bong: 0,
            bankRegularSavings: 500,
        }));
    });

    it('점심값은 오늘 날짜와 함께 한 번 빠지고, 날짜를 뒤로 돌리지는 못한다', async () => {
        const today = kstToday();
        const yesterday = shiftYmd(...today.split('-').map(Number), -1);
        await seed('3', { xp: 10, bong: 40, lastLunchDeductDate: yesterday });
        const db = anonDb();
        await assertSucceeds(setDoc(doc(db, studentPath()), {
            bong: 30,
            lastLunchDeductDate: today,
        }, { merge: true }));
        const paid = await getDoc(doc(db, studentPath()));
        assert.equal(paid.data().bong, 30);
        assert.equal(paid.data().lastLunchDeductDate, today);
        await assertFails(setDoc(doc(db, studentPath()), {
            lastLunchDeductDate: yesterday,
        }, { merge: true }));
    });

    it('대출은 전부 갚기, 점심값만 남기고 갚기, 일부 갚기가 통과한다', async () => {
        const db = anonDb();
        await seed('3', { xp: 10, bong: 100, bankLoan: loan(40, 10) });
        await assertSucceeds(setDoc(doc(db, studentPath()), {
            bong: 50,
            bankLoan: null,
        }, { merge: true }));

        await seed('4', { xp: 10, bong: 30, bankLoan: loan(40, 0) });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath('4')), {
            bong: 10,
            bankLoan: loan(20, 0),
        }, { merge: true }));

        await seed('5', { xp: 10, bong: 100, bankLoan: loan(80, 5) });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath('5')), {
            bong: 70,
            bankLoan: loan(50, 5),
        }, { merge: true }));
    });

    it('예금 출금과 적금 만기·중도 해지가 통과하고, 돈 없이 잔액을 올리지는 못한다', async () => {
        const db = anonDb();
        await seed('3', { xp: 10, bong: 10, bankRegularSavings: 1200 });
        await assertSucceeds(setDoc(doc(db, studentPath()), {
            bong: 1210,
            bankRegularSavings: 0,
        }, { merge: true }));

        await seed('4', { xp: 10, bong: 20, bankTermDeposits: term(80) });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath('4')), {
            bong: 100,
            bankTermDeposits: [],
        }, { merge: true }));

        await seed('5', { xp: 10, bong: 20, bankTermDeposits: term(80, 'mature') });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath('5')), {
            bong: 180,
            bankTermDeposits: [],
        }, { merge: true }));

        await seed('6', { xp: 10, bong: 80, bankTermDeposits: [] });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath('6')), {
            bong: 30,
            bankTermDeposits: term(50, 'new'),
        }, { merge: true }));

        await seed('7', { xp: 10, bong: 10, bankRegularSavings: 0, bankTermDeposits: [] });
        await assertFails(setDoc(doc(anonDb(), studentPath('7')), {
            bankRegularSavings: 500,
        }, { merge: true }));
        await assertFails(setDoc(doc(anonDb(), studentPath('7')), {
            bankTermDeposits: term(400, 'free'),
        }, { merge: true }));
        await seed('5', { xp: 10, bong: 20, bankTermDeposits: term(80, 'mature') });
        await assertFails(setDoc(doc(anonDb(), studentPath('5')), {
            bong: 20 + 240,
            bankTermDeposits: [],
        }, { merge: true }));
    });

    it('만기일에는 점심값과 상환을 한 번에 적어도 통과한다', async () => {
        const today = kstToday();
        await seed('3', {
            xp: 10,
            bong: 200,
            bankRegularSavings: 20,
            bankTermDeposits: term(400, 'due'),
            bankLoan: loan(50, 10),
            lastLunchDeductDate: '',
        });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath()), {
            bong: 200 - 10 + 800 - 60,
            bankRegularSavings: 20,
            bankTermDeposits: [],
            bankLoan: null,
            lastLunchDeductDate: today,
        }, { merge: true }));
    });

    it('주급과 남겨 둔 빚 회수는 통과하고, 같은 주 두 번째는 거부된다', async () => {
        const monday = kstMonday();
        const db = anonDb();
        await seed('3', {
            xp: 10,
            bong: 20,
            bankLoan: loan(30, 0),
            loanLunchShieldLoanId: 'loan1',
            loanLunchShieldAmount: 30,
        });
        await assertSucceeds(setDoc(doc(db, studentPath()), {
            bong: 12,
            salaryWeek: monday,
            salaryEpoch: 1,
            bankLoan: loan(10, 0),
            loanLunchShieldLoanId: 'loan1',
            loanLunchShieldAmount: 10,
        }, { merge: true }));
        await assertFails(setDoc(doc(db, studentPath()), {
            bong: 24,
            salaryWeek: monday,
            salaryEpoch: 2,
        }, { merge: true }));
        await assertFails(setDoc(doc(db, studentPath()), {
            salaryWeek: '',
            salaryEpoch: 1,
        }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, studentPath()), { bong: 20 }, { merge: true }));

        await seed('8', { xp: 4, bong: 3 });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath('8')), { bong: 15 }, { merge: true }));
        await assertFails(setDoc(doc(anonDb(), studentPath('8')), { bong: 15 + 900 }, { merge: true }));
    });

    it('지수 이익을 임의로 비우거나 원금을 공짜로 늘리지는 못한다', async () => {
        const today = kstToday();
        const held = {
            principal: 100,
            buyIndex: 2500.25,
            openedAt: 10,
            openedDate: '2026-10-01',
            realizedProfit: 0,
        };
        await seed('3', {
            xp: 10,
            bong: 50,
            stockInvestments: { kospi: held, kosdaq: null, nasdaq: null },
            stockInvestDaily: { date: today, profit: 0, sells: 0 },
        });
        const db = anonDb();
        await assertSucceeds(setDoc(doc(db, studentPath()), {
            bong: 158,
            stockInvestments: { kospi: null, kosdaq: null, nasdaq: null },
            stockInvestDaily: { date: today, profit: 8, sells: 1 },
        }, { merge: true }));

        await seed('4', {
            xp: 10,
            bong: 200,
            stockInvestments: { kospi: null, kosdaq: null, nasdaq: null },
            stockInvestDaily: { date: today, profit: 0, sells: 0 },
        });
        await assertSucceeds(setDoc(doc(anonDb(), studentPath('4')), {
            bong: 100,
            stockInvestments: {
                kospi: { principal: 100, buyIndex: 2500.25, openedAt: 11, openedDate: today },
                kosdaq: null,
                nasdaq: null,
            },
        }, { merge: true }));

        await seed('5', {
            xp: 10,
            bong: 80,
            stockInvestments: {
                kospi: { ...held, realizedProfit: 8 },
                kosdaq: null,
                nasdaq: null,
            },
            stockInvestDaily: { date: today, profit: 8, sells: 1 },
        });
        await assertFails(setDoc(doc(anonDb(), studentPath('5')), {
            stockInvestments: {
                kospi: { ...held, realizedProfit: 0 },
                kosdaq: null,
                nasdaq: null,
            },
        }, { merge: true }));
        await assertFails(setDoc(doc(anonDb(), studentPath('5')), {
            stockInvestDaily: { date: today, profit: 0, sells: 1 },
        }, { merge: true }));
        await assertFails(setDoc(doc(anonDb(), studentPath('5')), {
            stockInvestDaily: { date: today, profit: 9, sells: 2 },
        }, { merge: true }));
        await assertFails(setDoc(doc(anonDb(), studentPath('4')), {
            stockInvestments: {
                kospi: { principal: 1500, buyIndex: 2500, openedAt: 12, openedDate: today },
                kosdaq: null,
                nasdaq: null,
            },
        }, { merge: true }));
        await assertFails(setDoc(doc(anonDb(), studentPath('4')), {
            bong: 300,
            bankLoan: loan(2000, 1),
        }, { merge: true }));
    });

    it('역따봉 정산처럼 봉이 조금 줄거나 다시 오르는 쓰기는 통과한다', async () => {
        await seed('1', { xp: 10, bong: 30 });
        const db = anonDb();
        await assertSucceeds(setDoc(doc(db, studentPath('1')), { bong: 25 }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, studentPath('1')), { bong: 30 }, { merge: true }));
    });

    it('학급 주급 잠금은 앞으로만 움직이고, 선생님 세션은 되돌릴 수 있다', async () => {
        const settings = 'artifacts/class1/public/data/settings/global';
        const current = salaryLockNow();
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, settings), { shieldStock: 5 });
            await setDoc(doc(db, 'gmSessions/teacher1'), {
                classId: 'class1',
                expiresAt: Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000),
            });
        });
        const db = anonDb();
        await assertSucceeds(setDoc(doc(db, settings), { lastSalaryWeek: 'SALARY_2026_10_16' }, { merge: true }));
        await assertFails(setDoc(doc(db, settings), { lastSalaryWeek: 'SALARY_2026_10_09' }, { merge: true }));
        await assertFails(setDoc(doc(db, settings), { lastSalaryWeek: 'SALARY_9999_12_31' }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, settings), { lastSalaryWeek: current }, { merge: true }));
        await assertSucceeds(setDoc(doc(teacherDb(), settings), { lastSalaryWeek: 'SALARY_2026_10_16' }, { merge: true }));
    });

    it('필드가 많은 학생 문서의 점심·만기 상환도 식 한도를 넘지 않는다', async () => {
        const today = kstToday();
        const quests = {};
        for (let i = 0; i < 40; i += 1) {
            quests[`quest${i}`] = { done: true, note: `기록 ${i}`, steps: ['가', '나', '다'] };
        }
        const fat = {
            xp: 1200,
            bong: 200,
            bankRegularSavings: 20,
            bankTermDeposits: term(400, 'due'),
            bankLoan: loan(50, 10),
            lastLunchDeductDate: '',
            quests,
            questHistory: Array.from({ length: 25 }, (_, i) => ({ id: `h${i}`, xp: 5, at: i })),
            bongChangeLog: Array.from({ length: 40 }, (_, i) => ({ at: i, reason: '저장', delta: 1, before: i, after: i + 1 })),
            inventory: Array.from({ length: 30 }, (_, i) => `item${i}`),
            stockInvestHistory: Array.from({ length: 30 }, (_, i) => ({
                at: i, date: '2026-10-01', kind: 'buy', marketId: 'kospi', amount: 10, payout: 0, remaining: 10, full: false,
            })),
            ownedSkins: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`skin${i}`, true])),
            statusMessage: '긴 상태 메시지',
        };
        for (let i = 0; i < 80; i += 1) fat[`extra${i}`] = { n: i, label: `칸 ${i}`, nested: { a: i, b: `${i}` } };
        await seed('3', fat);
        await assertSucceeds(setDoc(doc(anonDb(), studentPath()), {
            bong: 200 - 10 + 800 - 60,
            bankTermDeposits: [],
            bankLoan: null,
            lastLunchDeductDate: today,
        }, { merge: true }));
    });
});
