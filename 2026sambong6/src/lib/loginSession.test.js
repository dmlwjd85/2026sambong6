import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    clearPersistedLoginIdentity,
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
});
