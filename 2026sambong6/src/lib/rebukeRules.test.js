import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const emulatorOn = !!process.env.FIRESTORE_EMULATOR_HOST;

const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const begin = rules.indexOf('// REBUKE_RULES_BEGIN');
const end = rules.indexOf('// REBUKE_RULES_END');
const block = begin >= 0 && end > begin ? rules.slice(begin, end) : '';

describe('역따봉 규칙 분리', () => {
    it('역따봉 함수와 match는 한 블록 안에만 있다', () => {
        assert.ok(begin > 0);
        assert.ok(end > begin);
        assert.match(block, /function rebukeBoardPath\(\)/);
        assert.match(block, /function rebukeAuditPath\(\)/);
        assert.match(block, /function rebukePublicReadOk\(\)/);
        assert.match(block, /function rebukeKeptOutOfPublicWildcard\(\)/);
        assert.match(block, /function rebukeAuditReadable\(appId\)/);
        assert.match(block, /match \/artifacts\/\{appId\}\/public\/data\/classOps\/rebuke \{/);
        assert.match(block, /match \/artifacts\/\{appId\}\/public\/data\/classOps\/rebukeAudit \{/);
        assert.equal(rules.indexOf('function rebukeBoardPath()'), rules.lastIndexOf('function rebukeBoardPath()'));
    });

    it('PIN, 오답 횟수, 온도계, settings/global 함수를 부르지 않는다', () => {
        assert.doesNotMatch(block, /isPinMaster\(/);
        assert.doesNotMatch(block, /isAdmin\(/);
        assert.doesNotMatch(block, /isAdminForApp\(/);
        assert.doesNotMatch(block, /isSettingsGlobalDoc\(/);
        assert.doesNotMatch(block, /isLearningThermometer/);
        assert.doesNotMatch(block, /pinAttempt/);
        assert.doesNotMatch(block, /gmPin/);
        assert.doesNotMatch(block, /thermometer/);
        assert.doesNotMatch(block, /settings\/global/);
    });

    it('공개 와일드카드는 역따봉 함수 한 줄씩만 호출한다', () => {
        assert.match(rules, /allow read: if rebukePublicReadOk\(\);/);
        assert.match(rules, /&& rebukeKeptOutOfPublicWildcard\(\);/);
        assert.match(rules, /&& !isSettingsGlobalDoc\(\)/);
        assert.match(rules, /&& !isLearningThermometerDoc\(\)/);
        assert.match(rules, /&& !isLearningThermometerVoteDoc\(\)/);
        const outside = rules.slice(0, begin) + rules.slice(end);
        assert.doesNotMatch(outside, /function rebuke/);
        assert.doesNotMatch(outside, /classOps\/rebuke/);
    });
});

function publicEntry(id, toId, reason = '떠들어서 방해했어요') {
    return { id, toId, reason, ymd: '2026-10-19' };
}

function boardDoc(entry, received, extra = {}) {
    return {
        received,
        penaltyThrough: {},
        sentDaily: {},
        pairDay: {},
        entries: [entry],
        ...extra,
    };
}

describe('역따봉 규칙 동작', { skip: emulatorOn ? false : 'FIRESTORE_EMULATOR_HOST 없음' }, () => {
    /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment | null} */
    let testEnv = null;
    const boardPath = 'artifacts/class1/public/data/classOps/rebuke';
    const auditPath = 'artifacts/class1/public/data/classOps/rebukeAudit';

    before(async () => {
        testEnv = await initializeTestEnvironment({
            projectId: 'demo-sambong',
            firestore: { rules },
        });
    });

    after(async () => {
        if (testEnv) await testEnv.cleanup();
    });

    beforeEach(async () => {
        await testEnv.clearFirestore();
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, 'admins/teacher1'), {
                role: 'gm',
                classIds: ['class1'],
            });
            await setDoc(doc(db, 'admins/teacher-other'), {
                role: 'gm',
                classIds: ['other-class'],
            });
        });
    });

    function anon() {
        return testEnv.authenticatedContext('anon-student', {
            firebase: { sign_in_provider: 'anonymous' },
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

    it('학생은 공개 판을 만들고 받은 수를 1만 올릴 수 있다', async () => {
        const db = anon().firestore();
        const first = publicEntry('rb_2026-10-19_2_1', '2');
        await assertSucceeds(setDoc(doc(db, boardPath), boardDoc(first, { 2: 1 })));
        const second = publicEntry('rb_2026-10-19_2_2', '2', '숙제를 베꼈어요');
        await assertSucceeds(setDoc(doc(db, boardPath), boardDoc(second, { 2: 2 }, {
            entries: [first, second],
        })));
        await assertFails(setDoc(doc(db, boardPath), boardDoc(
            publicEntry('rb_2026-10-19_2_4', '2', '또 떠들었어요'),
            { 2: 4 },
            { entries: [first, second, publicEntry('rb_2026-10-19_2_4', '2', '또 떠들었어요')] },
        )));
    });

    it('공개 이유에 보낸 학번을 넣지 못한다', async () => {
        const db = anon().firestore();
        await assertFails(setDoc(doc(db, boardPath), boardDoc(
            { ...publicEntry('rb_2026-10-19_2_1', '2'), fromId: '7' },
            { 2: 1 },
        )));
    });

    it('감사 기록은 학생은 못 읽고 그 학급 선생님만 읽는다', async () => {
        const entry = { toId: '2', fromId: '7', ymd: '2026-10-19' };
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), auditPath), {
                lastId: 'rb1',
                entries: { rb1: entry },
            });
        });
        await assertFails(getDoc(doc(anon().firestore(), auditPath)));
        await assertFails(getDoc(doc(otherTeacher().firestore(), auditPath)));
        await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), auditPath)));
        const seen = await assertSucceeds(getDoc(doc(teacher().firestore(), auditPath)));
        assert.equal(seen.data().entries.rb1.fromId, '7');
    });

    it('PIN 세션이 있는 선생님도 감사 기록을 읽는다', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, auditPath), {
                lastId: 'rb1',
                entries: { rb1: { toId: '2', fromId: '7', ymd: '2026-10-19' } },
            });
            await setDoc(doc(db, 'gmSessions/pin-teacher'), {
                classId: 'class1',
                expiresAt: Timestamp.fromMillis(Date.now() + 60 * 1000),
            });
        });
        const pinTeacher = testEnv.authenticatedContext('pin-teacher', {
            firebase: { sign_in_provider: 'anonymous' },
        });
        const seen = await assertSucceeds(getDoc(doc(pinTeacher.firestore(), auditPath)));
        assert.equal(seen.data().entries.rb1.fromId, '7');
    });

    it('감사 기록은 한 칸씩만 늘어나고 지우지 못한다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, auditPath), {
            lastId: 'rb1',
            entries: { rb1: { toId: '2', fromId: '7', ymd: '2026-10-19' } },
        }));
        await assertSucceeds(setDoc(doc(db, auditPath), {
            lastId: 'rb2',
            entries: {
                rb1: { toId: '2', fromId: '7', ymd: '2026-10-19' },
                rb2: { toId: '3', fromId: '8', ymd: '2026-10-19' },
            },
        }, { merge: true }));
        await assertFails(setDoc(doc(db, auditPath), {
            lastId: 'rb2',
            entries: { rb2: { toId: '3', fromId: '8', ymd: '2026-10-19' } },
        }));
        await assertFails(deleteDoc(doc(db, boardPath)));
        await assertFails(deleteDoc(doc(db, auditPath)));
    });

    it('다른 학급 운영 문서와 학급 설정은 이 블록 때문에 풀리거나 막히지 않는다', async () => {
        const db = anon().firestore();
        await assertSucceeds(setDoc(doc(db, 'artifacts/class1/public/data/classOps/praise'), { days: {} }));
        await assertFails(setDoc(doc(db, 'artifacts/class1/public/data/settings/global'), { shieldStock: 1 }));
    });
});
