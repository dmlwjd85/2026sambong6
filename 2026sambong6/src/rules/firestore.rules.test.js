import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { MAX_WEEKLY_SALARY_BONG, recentSalaryWeekId } from '../lib/weeklySalary.js';

const STUDENT = 'artifacts/class/public/data/students/student_1';
const SETTINGS = 'artifacts/class/public/data/settings/global';

let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'demo-sambong-rules',
        firestore: {
            rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
        },
    });
});

after(async () => {
    if (testEnv) await testEnv.cleanup();
});

async function seedStudent(extra = {}) {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), STUDENT), { xp: 100, bong: 10, jobs: [], ...extra });
    });
}

function authedDb() {
    return testEnv.authenticatedContext('anon-device').firestore();
}

test('인증이 없으면 학생 문서를 읽지 못한다', async () => {
    await seedStudent();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, STUDENT)));
});

test('학생 XP는 한 번에 650을 넘기면 거절된다', async () => {
    await seedStudent();
    const db = authedDb();
    const ref = doc(db, STUDENT);
    await assertFails(updateDoc(ref, { xp: 751 }));
    await assertSucceeds(updateDoc(ref, { xp: 750 }));
});

test('와일드카드로 학생 문서를 지우거나 상한 없이 덮어쓰지 못한다', async () => {
    await seedStudent();
    const db = authedDb();
    const ref = doc(db, STUDENT);
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(ref, { xp: 5000, bong: 10 }, { merge: true }));
});

test('주급 표식은 최근 키와 상한 안의 봉만 허용한다', async () => {
    await seedStudent();
    const db = authedDb();
    const ref = doc(db, STUDENT);
    const recent = recentSalaryWeekId(new Date());
    await assertFails(updateDoc(ref, { salaryPaidWeek: 'SALARY_1999_01_01', bong: 20 }));
    await assertFails(updateDoc(ref, { salaryPaidWeek: 'SALARY_2026_1_9' }));
    await assertFails(updateDoc(ref, {
        salaryPaidWeek: recent,
        bong: 10 + MAX_WEEKLY_SALARY_BONG + 1,
    }));
    await assertSucceeds(updateDoc(ref, {
        salaryPaidWeek: recent,
        bong: 10 + 12,
    }));
    let saved;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        saved = await getDoc(doc(ctx.firestore(), STUDENT));
    });
    assert.equal(saved.data().salaryPaidWeek, recent);
    assert.equal(saved.data().bong, 22);
});

test('주급 표식 없는 봉 증가는 주급 상한과 따로 둔다', async () => {
    await seedStudent();
    const db = authedDb();
    const ref = doc(db, STUDENT);
    await assertSucceeds(updateDoc(ref, { bong: 10 + MAX_WEEKLY_SALARY_BONG + 50 }));
    await assertSucceeds(updateDoc(ref, { bong: 10 }));
});

test('학생 문서 생성은 앱 기본값인 xp 0, bong 0 이하만 허용한다', async () => {
    await testEnv.clearFirestore();
    const db = authedDb();
    await assertSucceeds(setDoc(doc(db, 'artifacts/class/public/data/students/student_new'), {
        pin: '1234',
        xp: 0,
        bong: 0,
        quests: {},
        jobs: [],
        inventory: [],
    }));
    await assertSucceeds(setDoc(doc(db, 'artifacts/class/public/data/students/student_gm'), {
        pin: '5678',
        xp: 0,
        bong: 0,
        quests: {},
        unlockedQuests: {},
        jobs: [],
        inventory: [],
        questHistory: [],
    }));
    await assertFails(setDoc(doc(db, 'artifacts/class/public/data/students/student_xp'), { xp: 1, bong: 0 }));
    await assertFails(setDoc(doc(db, 'artifacts/class/public/data/students/student_bong'), { xp: 0, bong: 1 }));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, 'artifacts/class/public/data/students/student_anon'), { xp: 0, bong: 0 }));
});

test('인증된 클라이언트는 학생 문서가 아닌 설정을 갱신할 수 있다', async () => {
    await testEnv.clearFirestore();
    const db = authedDb();
    await assertSucceeds(setDoc(doc(db, SETTINGS), { announcement: '안녕' }));
});
