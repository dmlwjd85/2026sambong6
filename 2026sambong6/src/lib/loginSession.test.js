import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    AUTO_LOGIN_HANDOFF_KEY,
    STUDENT_AUTO_LOGIN_FIELD,
    clearPersistedLoginIfDisabled,
    consumeAutoLoginHandoff,
    forgetSavedLoginPin,
    isOtherStudentTakeover,
    isOwnStudentDocId,
    markAutoLoginHandoff,
    prepareStartupLogin,
    restoreSessionLoginIfCleared,
    writeSessionLoginWithoutPin,
    clearPersistedLoginIdentity,
    isStudentAutoLoginEnabled,
    normalizeStudentAutoLoginEnabled,
    readPersistedLogin,
    shouldRestoreLoginWithoutServerPin,
    writePersistedLogin,
} from './loginSession.js';

function memoryStorage(seed = {}) {
    const data = { ...seed };
    return {
        getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem(key, value) { data[key] = String(value); },
        removeItem(key) { delete data[key]; },
        dump() { return { ...data }; },
    };
}

describe('로그인 유지', () => {
    it('학급·역할·학생을 저장하고 다시 읽습니다', () => {
        const storage = memoryStorage({ sambong_class_id: 'sambong-class-2026' });
        writePersistedLogin(storage, { studentId: '1', pin: '1357', role: 'student' });
        assert.deepEqual(readPersistedLogin(storage), {
            studentId: '1',
            pin: '1357',
            classId: 'sambong-class-2026',
            role: 'student',
        });
        writePersistedLogin(storage, { studentId: 'gm', pin: '2468', role: 'teacher' });
        assert.equal(readPersistedLogin(storage).role, 'teacher');
        assert.equal(readPersistedLogin(storage).studentId, 'gm');
    });

    it('역할 기록이 없으면 학번으로 학생·마스터를 나눕니다', () => {
        const storage = memoryStorage({
            sambong_student_id: 'gm_a',
            sambong_student_pin: '2468',
        });
        assert.equal(readPersistedLogin(storage).role, 'master');
    });

    it('아이디나 PIN이 없으면 자동 로그인을 열지 않습니다', () => {
        assert.equal(readPersistedLogin(memoryStorage({ sambong_student_id: '1' })), null);
        assert.equal(readPersistedLogin(memoryStorage({ sambong_student_pin: '1357' })), null);
    });

    it('로그아웃은 학급 키를 남기고 로그인 신원만 지웁니다', () => {
        const storage = memoryStorage();
        writePersistedLogin(storage, { studentId: '1', pin: '1357' });
        storage.setItem('sambong_class_id', 'sambong-class-2026');
        clearPersistedLoginIdentity(storage);
        assert.equal(readPersistedLogin(storage), null);
        assert.equal(storage.getItem('sambong_class_id'), 'sambong-class-2026');
    });

    it('서버에 PIN이 없는 마스터 자동 로그인만 저장 세션으로 통과합니다', () => {
        assert.equal(shouldRestoreLoginWithoutServerPin({
            isAutoLogin: true, isAdmin: true, savedPin: '2468',
        }), true);
        assert.equal(shouldRestoreLoginWithoutServerPin({
            isAutoLogin: false, isAdmin: true, savedPin: '2468',
        }), false);
        assert.equal(shouldRestoreLoginWithoutServerPin({
            isAutoLogin: true, isAdmin: false, savedPin: '1357',
        }), false);
        assert.equal(shouldRestoreLoginWithoutServerPin({
            isAutoLogin: true, isAdmin: true, savedPin: '',
        }), false);
    });

    it('인증은 브라우저를 닫아도 남고, 서비스 워커는 로그인 저장소를 지우지 않습니다', () => {
        const app = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const sw = fs.readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');
        assert.match(app, /setPersistence\(auth, browserLocalPersistence\)/);
        assert.equal(app.includes('browserSessionPersistence'), false);
        assert.match(app, /readPersistedLogin\(localStorage\)/);
        assert.match(app, /shouldRestoreLoginWithoutServerPin/);
        assert.equal(/localStorage\.clear\(/.test(sw), false);
        assert.equal(/indexedDB/.test(sw), false);
        assert.match(sw, /get\('sw-clear'\) === SW_CLEAR/);
    });

    it('학급 설정이 없으면 자동 로그인은 켜짐이고, false일 때만 꺼집니다', () => {
        assert.equal(STUDENT_AUTO_LOGIN_FIELD, 'studentAutoLoginEnabled');
        assert.equal(isStudentAutoLoginEnabled(undefined), true);
        assert.equal(isStudentAutoLoginEnabled(null), true);
        assert.equal(isStudentAutoLoginEnabled({}), true);
        assert.equal(isStudentAutoLoginEnabled({ studentAutoLoginEnabled: true }), true);
        assert.equal(isStudentAutoLoginEnabled({ studentAutoLoginEnabled: false }), false);
        assert.equal(isStudentAutoLoginEnabled(true), true);
        assert.equal(isStudentAutoLoginEnabled(false), false);
        assert.equal(normalizeStudentAutoLoginEnabled(undefined), true);
        assert.equal(normalizeStudentAutoLoginEnabled(true), true);
        assert.equal(normalizeStudentAutoLoginEnabled(false), false);
    });

    it('꺼진 학급의 저장된 로그인만 지우고, 다른 학급 로그인은 남깁니다', () => {
        const storage = memoryStorage();
        writePersistedLogin(storage, { studentId: '1', pin: '1357', role: 'student', classId: 'class-a' });
        assert.equal(clearPersistedLoginIfDisabled(storage, { classId: 'class-a', enabled: true }), false);
        assert.equal(readPersistedLogin(storage).studentId, '1');
        assert.equal(clearPersistedLoginIfDisabled(storage, { classId: 'class-b', enabled: false }), false);
        assert.equal(readPersistedLogin(storage).studentId, '1');
        assert.equal(clearPersistedLoginIfDisabled(storage, { classId: 'class-a', enabled: false }), true);
        assert.equal(readPersistedLogin(storage), null);
        assert.equal(storage.getItem('sambong_class_id'), 'class-a');
    });

    it('PIN 없이 학번만 남아 있어도, 앱을 새로 열 때 꺼진 학급이면 지웁니다', () => {
        const storage = memoryStorage({ sambong_class_id: 'class-a', sambong_student_id: '2', sambong_login_role: 'student' });
        assert.equal(clearPersistedLoginIfDisabled(storage, { classId: 'class-a', enabled: false }), true);
        assert.equal(storage.getItem('sambong_student_id'), null);
        assert.equal(storage.getItem('sambong_login_role'), null);
        assert.equal(storage.getItem('sambong_class_id'), 'class-a');
        assert.equal(clearPersistedLoginIfDisabled(storage, { classId: 'class-a', enabled: false }), false);
    });

    it('M1: 꺼진 학급에서 로그인하면 학번·역할은 남고 PIN만 저장하지 않습니다', () => {
        const storage = memoryStorage({ sambong_class_id: 'class-a', sambong_student_pin: '9999' });
        writeSessionLoginWithoutPin(storage, { studentId: '2', role: 'student', classId: 'class-a' });
        // 로그인 중: 앱 곳곳이 읽는 sambong_student_id 가 그대로 있어요(동기화·따봉·주문·송금).
        assert.equal(storage.getItem('sambong_student_id'), '2');
        assert.equal(storage.getItem('sambong_login_role'), 'student');
        assert.equal(storage.getItem('sambong_student_pin'), null);
        // PIN이 없으니 저장된 로그인으로는 들어갈 수 없어요.
        assert.equal(readPersistedLogin(storage), null);
        // 마스터도 같아요.
        const m = memoryStorage();
        writeSessionLoginWithoutPin(m, { studentId: 'gm', classId: 'class-a' });
        assert.equal(m.getItem('sambong_student_id'), 'gm');
        assert.equal(m.getItem('sambong_login_role'), 'master');
        assert.equal(m.getItem('sambong_student_pin'), null);
    });

    it('M1: 설정에서 끄고 저장하면 PIN만 지우고 마스터 학번은 남깁니다', () => {
        const storage = memoryStorage();
        writePersistedLogin(storage, { studentId: 'gm', pin: '9999', role: 'master', classId: 'class-a' });
        assert.equal(forgetSavedLoginPin(storage), true);
        assert.equal(storage.getItem('sambong_student_id'), 'gm');
        assert.equal(storage.getItem('sambong_login_role'), 'master');
        assert.equal(storage.getItem('sambong_class_id'), 'class-a');
        assert.equal(readPersistedLogin(storage), null);
        assert.equal(forgetSavedLoginPin(storage), false);
    });

    it('M1: 앱을 새로 열면 켜진 반은 지금처럼 들어가고, 꺼진 반은 로그인 화면이 나옵니다', () => {
        const on = memoryStorage();
        writePersistedLogin(on, { studentId: '1', pin: '1111', role: 'student', classId: 'class-a' });
        for (const enabled of [undefined, null, {}, { studentAutoLoginEnabled: true }]) {
            const r = prepareStartupLogin(on, memoryStorage(), { classId: 'class-a', enabled });
            assert.equal(r.savedLogin.studentId, '1');
            assert.equal(r.handoff, false);
        }
        assert.equal(on.getItem('sambong_student_pin'), '1111');
        // 꺼진 반: 로그인 중 남겨 둔 학번(PIN 없음)도 지우고 들어가지 않아요.
        const off = memoryStorage({ sambong_class_id: 'class-a' });
        writeSessionLoginWithoutPin(off, { studentId: '2', role: 'student', classId: 'class-a' });
        const r2 = prepareStartupLogin(off, memoryStorage(), { classId: 'class-a', enabled: { studentAutoLoginEnabled: false } });
        assert.equal(r2.savedLogin, null);
        assert.equal(off.getItem('sambong_student_id'), null);
        assert.equal(off.getItem('sambong_class_id'), 'class-a');
        // 예전 판이 남긴 PIN까지 있는 경우도 지워요.
        const old = memoryStorage();
        writePersistedLogin(old, { studentId: '3', pin: '3333', role: 'student', classId: 'class-a' });
        assert.equal(prepareStartupLogin(old, memoryStorage(), { classId: 'class-a', enabled: false }).savedLogin, null);
        assert.equal(old.getItem('sambong_student_pin'), null);
    });

    it('M1: 다른 탭이 꺼진 반 학번을 지우면, 로그인한 탭이 자기 학번을 다시 적습니다(PIN은 안 적어요)', () => {
        const storage = memoryStorage({ sambong_class_id: 'class-a' });
        assert.equal(restoreSessionLoginIfCleared(storage, { studentId: '2', role: 'student' }), true);
        assert.equal(storage.getItem('sambong_student_id'), '2');
        assert.equal(storage.getItem('sambong_student_pin'), null);
        // 이미 누가 적혀 있으면 건드리지 않아요.
        assert.equal(restoreSessionLoginIfCleared(storage, { studentId: '5', role: 'student' }), false);
        assert.equal(storage.getItem('sambong_student_id'), '2');
        assert.equal(restoreSessionLoginIfCleared(memoryStorage(), null), false);
    });

    it("권장②: '이 반으로 이동' 직후에는 꺼진 반이어도 한 번만 PIN 없이 들어갑니다", () => {
        const local = memoryStorage();
        const session = memoryStorage();
        writePersistedLogin(local, { studentId: 'gm', pin: '4321', role: 'master', classId: 'new-class' });
        markAutoLoginHandoff(session, 'new-class');
        assert.equal(session.getItem(AUTO_LOGIN_HANDOFF_KEY), 'new-class');
        const first = prepareStartupLogin(local, session, { classId: 'new-class', enabled: false });
        assert.equal(first.handoff, true);
        assert.equal(first.savedLogin.studentId, 'gm');
        assert.equal(session.getItem(AUTO_LOGIN_HANDOFF_KEY), null);
        // 두 번째로 열 때는 표시가 없으니 로그인 화면이에요.
        const second = prepareStartupLogin(local, session, { classId: 'new-class', enabled: false });
        assert.equal(second.handoff, false);
        assert.equal(second.savedLogin, null);
        // 다른 반 표시는 쓰지 않고 지워요.
        markAutoLoginHandoff(session, 'other');
        assert.equal(consumeAutoLoginHandoff(session, 'new-class'), false);
        assert.equal(session.getItem(AUTO_LOGIN_HANDOFF_KEY), null);
    });

    it('앱은 꺼진 학급에서 학번은 남기고 PIN만 저장하지 않으며, 시작할 때만 지웁니다', () => {
        const app = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        assert.match(app, /isStudentAutoLoginEnabled/);
        assert.match(app, /normalizeStudentAutoLoginEnabled/);
        assert.match(app, /prepareStartupLogin\(localStorage, sessionStorage/);
        assert.match(app, /writeSessionLoginWithoutPin\(localStorage, \{ studentId, role: storedRole, classId: appId \}\)/);
        assert.match(app, /markAutoLoginHandoff\(sessionStorage, req\.newClassId\)/);
        // 로그인 중(로그인 처리·설정 저장·마스터 PIN 변경)에는 학번을 지우는 clearPersistedLoginIfDisabled 를 쓰지 않아요.
        assert.equal(/clearPersistedLoginIfDisabled/.test(app), false);
        const login = app.slice(app.indexOf('async function attemptLogin('));
        const loginBody = login.slice(0, login.indexOf('currentStudentDocRef = docRef;'));
        const offBranch = loginBody.slice(loginBody.lastIndexOf('if (isStudentAutoLoginEnabled(window.classMeta))'));
        assert.equal(/clearPersistedLoginIdentity/.test(offBranch), false);
    });

    it('M3: 기기 학번과 다른 학생 문서에는 저장하지 않아요(학번이 비면 예전처럼 통과)', () => {
        assert.equal(isOwnStudentDocId('student_2', '2'), true);
        assert.equal(isOwnStudentDocId('student_gm', 'gm'), true);
        // 다른 탭에서 학생3이 들어와 학번이 3이 됐는데, 이 탭은 학생2 문서를 들고 있음
        assert.equal(isOwnStudentDocId('student_2', '3'), false);
        assert.equal(isOwnStudentDocId('student_gm', '2'), false);
        assert.equal(isOwnStudentDocId('student_12', '1'), false);
        // 학번이 비어 있으면(다른 탭 로그아웃 등) 막지 않아요: main 과 같아요
        assert.equal(isOwnStudentDocId('student_2', null), true);
        assert.equal(isOwnStudentDocId('student_2', ''), true);
    });

    it('M3: 다른 학생으로 바뀐 것만 나가기 대상이고, 같은 학생·지운 경우는 아니에요', () => {
        assert.equal(isOtherStudentTakeover('2', '3'), true);
        assert.equal(isOtherStudentTakeover('2', '2'), false);
        assert.equal(isOtherStudentTakeover('2', null), false);
        assert.equal(isOtherStudentTakeover('', '3'), false);
        assert.equal(isOtherStudentTakeover(null, '3'), false);
    });

    it('M3: 앱은 저장 전·스냅샷 반영 전에 학번을 대조하고, 나가기는 끈 반에서만 해요', () => {
        const app = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const save = app.slice(app.indexOf('async function saveDataToCloud('));
        const head = save.slice(0, save.indexOf('const opts = {'));
        assert.match(head, /isOwnStudentDocId\(currentStudentDocRef\.id, localStorage\.getItem\('sambong_student_id'\)\)/);
        assert.match(head, /return false;/);
        assert.equal((app.match(/&& studentSnapshotBelongsToThisTab\(myId\)/g) || []).length, 2);
        const listener = app.slice(app.indexOf("window.addEventListener('storage', (e) => {"));
        const body = listener.slice(0, listener.indexOf('});'));
        const enabledReturn = body.indexOf('if (isStudentAutoLoginEnabled(window.classMeta)) return;');
        const takeover = body.indexOf('isOtherStudentTakeover(');
        assert.ok(enabledReturn > 0 && takeover > enabledReturn, '켜진 반은 storage 이벤트에서 먼저 빠져요');
    });
});
