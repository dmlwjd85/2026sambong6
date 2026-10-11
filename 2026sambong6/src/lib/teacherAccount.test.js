import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTeacherProfile,
    isTeacherAuthUser,
    isTeacherSessionActive,
    sanitizeOwnedClassIds,
    teacherAuthErrorMessage,
    teacherOwnsClass,
    teacherSessionFromUser,
    validateTeacherEmail,
    validateTeacherPassword,
    withOwnedClass,
} from './teacherAccount.js';

describe('교사 계정', () => {
    it('익명 사용자는 교사로 보지 않는다', () => {
        assert.equal(isTeacherAuthUser({ uid: 'a1', isAnonymous: true, email: '' }), false);
        assert.equal(isTeacherAuthUser({ uid: 'a1', isAnonymous: false, email: 't@school.kr' }), true);
        assert.equal(isTeacherSessionActive(teacherSessionFromUser({ uid: 'a1', isAnonymous: true })), false);
    });

    it('이메일·비밀번호를 검사한다', () => {
        assert.equal(validateTeacherEmail('bad').ok, false);
        assert.equal(validateTeacherEmail('teacher@school.kr').ok, true);
        assert.equal(validateTeacherPassword('123').ok, false);
        assert.equal(validateTeacherPassword('secret1').ok, true);
    });

    it('소유 학급 ID만 남기고 한 학급을 더한다', () => {
        assert.deepEqual(sanitizeOwnedClassIds(['ok-class', "a';x", 'ok-class']), ['ok-class']);
        const profile = withOwnedClass({ uid: 'u1', ownedClassIds: [] }, 'my-class');
        assert.deepEqual(profile.ownedClassIds, ['my-class']);
        assert.deepEqual(withOwnedClass(profile, 'my-class').ownedClassIds, ['my-class']);
        assert.equal(teacherOwnsClass(profile, 'my-class'), true);
        assert.equal(teacherOwnsClass({ uid: 'u1' }, 'other', { ownerUid: 'u1' }), true);
        assert.equal(teacherOwnsClass({ uid: 'u1' }, 'other', { ownerUid: 'u2' }), false);
    });

    it('교사 프로필을 만들고 오류 문구는 한국어다', () => {
        const built = buildTeacherProfile({ uid: 'u1', email: 't@school.kr', isAnonymous: false, displayName: '김선생' });
        assert.equal(built.ok, true);
        assert.equal(built.profile.email, 't@school.kr');
        assert.equal(teacherAuthErrorMessage('auth/email-already-in-use').includes('이미'), true);
        assert.equal(buildTeacherProfile({ uid: 'anon', isAnonymous: true }).ok, false);
    });
});
