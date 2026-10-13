/**
 * Firestore 에뮬레이터에서만 실행합니다.
 * FIRESTORE_EMULATOR_HOST 가 없으면 건너뜁니다. 실제 학급 데이터에는 접속하지 않습니다.
 *
 *   npx firebase-tools emulators:exec --only auth,firestore --project demo-sambong-attendance \
 *     "node --test src/lib/attendanceWrite.emulator.test.js"
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
    connectFirestoreEmulator,
    doc,
    getDocFromServer,
    getFirestore,
    setDoc,
    terminate,
} from 'firebase/firestore';
import { commitAttendanceMark } from './attendanceCommit.js';

const fsHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
const skip = !fsHost || !authHost;

function splitHost(raw) {
    const [host, port] = String(raw).split(':');
    return { host, port: Number(port) };
}

describe('출석 칸 Firestore 에뮬레이터', { skip: skip ? '에뮬레이터 호스트가 없어 건너뜁니다' : false }, () => {
    /** @type {import('firebase/app').FirebaseApp} */
    let app;
    /** @type {import('firebase/firestore').Firestore} */
    let db;

    before(async () => {
        app = initializeApp({
            apiKey: 'demo',
            authDomain: 'demo.firebaseapp.com',
            projectId: 'demo-sambong-attendance',
        }, 'attendance-emulator');
        const auth = getAuth(app);
        const authAddr = splitHost(authHost);
        connectAuthEmulator(auth, `http://${authAddr.host}:${authAddr.port}`, { disableWarnings: true });
        db = getFirestore(app);
        const fsAddr = splitHost(fsHost);
        connectFirestoreEmulator(db, fsAddr.host, fsAddr.port);
        await signInAnonymously(auth);
    });

    after(async () => {
        if (db) await terminate(db);
        if (app) await deleteApp(app);
    });

    function refs(classId, studentId) {
        return {
            attRef: doc(db, 'artifacts', classId, 'public', 'data', 'classOps', 'attendance'),
            stuRef: doc(db, 'artifacts', classId, 'public', 'data', 'students', 'student_' + studentId),
        };
    }

    async function readAtt(attRef) {
        const snap = await getDocFromServer(attRef);
        return snap.exists() ? (snap.data() || {}) : {};
    }

    it('해제는 merge 로 안 지워지는 칸을 deleteField 로 지우고, 새 탭에서 다시 누르면 보상이 한 번만 나간다', async () => {
        const today = '2026-10-13';
        const classId = 'emulator-demo-unmark';
        const { attRef, stuRef } = refs(classId, '3');
        const other = refs(classId, '7');
        await setDoc(stuRef, { xp: 100, bong: 10 }, { merge: true });
        await setDoc(other.stuRef, { xp: 40, bong: 4 }, { merge: true });

        const marked = await commitAttendanceMark(db, {
            attRef,
            stuRef,
            today,
            studentId: '3',
            requestedStatus: 'present',
            seenStatus: '',
        });
        assert.equal(marked.ok, true);
        assert.equal(marked.noop, false);
        const otherMark = await commitAttendanceMark(db, {
            attRef,
            stuRef: other.stuRef,
            today,
            studentId: '7',
            requestedStatus: 'absent',
            seenStatus: '',
        });
        assert.equal(otherMark.ok, true);

        const beforeClear = await readAtt(attRef);
        assert.equal(beforeClear.days[today]['3'], 'present');
        assert.equal(beforeClear.days[today]['7'], 'absent');

        // set+merge 는 빼 둔 키를 남깁니다. 이 동작 때문에 칸 경로를 deleteField 해야 합니다.
        await setDoc(attRef, { days: { [today]: { '7': 'absent' } } }, { merge: true });
        const merged = await readAtt(attRef);
        assert.equal(merged.days[today]['3'], 'present');

        const cleared = await commitAttendanceMark(db, {
            attRef,
            stuRef,
            today,
            studentId: '3',
            requestedStatus: 'present',
            seenStatus: 'present',
        });
        assert.equal(cleared.ok, true);
        assert.equal(cleared.plan.clearCell, true);

        const afterClear = await readAtt(attRef);
        assert.equal(Object.prototype.hasOwnProperty.call(afterClear.days[today], '3'), false);
        assert.equal(afterClear.days[today]['7'], 'absent');
        const stuClear = await getDocFromServer(stuRef);
        assert.equal(stuClear.data().xp, 100);
        assert.equal(stuClear.data().bong, 10);
        assert.deepEqual(stuClear.data().attendanceMark, { date: '', status: '' });

        const freshTab = await commitAttendanceMark(db, {
            attRef,
            stuRef,
            today,
            studentId: '3',
            requestedStatus: 'present',
            seenStatus: '',
        });
        assert.equal(freshTab.ok, true);
        assert.equal(freshTab.noop, false);
        assert.equal(freshTab.plan.xpDelta, 8);
        const again = await readAtt(attRef);
        assert.equal(again.days[today]['3'], 'present');
        const stuAgain = await getDocFromServer(stuRef);
        assert.equal(stuAgain.data().xp, 108);
        assert.equal(stuAgain.data().bong, 11);
        assert.equal(stuAgain.data().attendanceMark.status, 'present');
        assert.equal(stuAgain.data().attendanceMark.date, today);
    });

    it('두 탭이 같은 상태를 동시에 눌러도 칸과 보상이 한 번만 맞고 비어 있지 않다', async () => {
        const today = '2026-10-13';
        const classId = 'emulator-demo-race';
        const { attRef, stuRef } = refs(classId, '3');
        await setDoc(stuRef, { xp: 100, bong: 10 }, { merge: true });

        const [a, b] = await Promise.all([
            commitAttendanceMark(db, {
                attRef,
                stuRef,
                today,
                studentId: '3',
                requestedStatus: 'present',
                seenStatus: '',
            }),
            commitAttendanceMark(db, {
                attRef,
                stuRef,
                today,
                studentId: '3',
                requestedStatus: 'present',
                seenStatus: '',
            }),
        ]);
        assert.equal(a.ok && b.ok, true);
        const writes = [a, b].filter((row) => !row.noop);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].plan.xpDelta, 8);

        const att = await readAtt(attRef);
        assert.equal(att.days[today]['3'], 'present');
        const stu = await getDocFromServer(stuRef);
        assert.equal(stu.data().xp, 108);
        assert.equal(stu.data().bong, 11);
        assert.equal(stu.data().attendanceMark.status, 'present');
        assert.equal(stu.data().attendanceMark.date, today);
    });
});
