import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    GM_IDLE_LOGOUT_MS,
    GM_ONLY_SETTING_KEYS,
    ORIGINAL_HOME_CLASS_ID,
    classifyAuthError,
    isOriginalHomeClass,
    isTeacherProvider,
    planGmIdleExpiry,
    readGmIdleLogoutOverride,
    resolveGmIdleLogoutMs,
    HOME_CLASS_IDLE_AUTH_NOTICE,
    TEACHER_SESSION_SIGNOUT_FAILED_MESSAGE,
    shouldApplyTeacherBadgeRead,
    shouldSignOutNonAnonymousForPinLogin,
    shouldUseLocalFirebaseEmulator,
    teacherAuthFailureMessage,
    teacherAuthStatusText,
} from './adminAuth.js';

describe('선생님 인증 판별', () => {
    it('Google·이메일 계정만 선생님 공급자로 본다', () => {
        assert.equal(isTeacherProvider(null), false);
        assert.equal(isTeacherProvider({ isAnonymous: true, providerData: [] }), false);
        assert.equal(isTeacherProvider({ isAnonymous: false, providerData: [] }), false);
        assert.equal(isTeacherProvider({
            isAnonymous: false,
            providerData: [{ providerId: 'google.com' }],
        }), true);
        assert.equal(isTeacherProvider({
            isAnonymous: false,
            providerId: 'password',
            providerData: [{ providerId: 'password', email: 'teacher@school.kr' }],
        }), true);
        assert.equal(isTeacherProvider({
            isAnonymous: true,
            providerData: [{ providerId: 'google.com' }],
        }), false);
    });

    it('로그인 오류를 화면에서 나눌 수 있게 분류한다', () => {
        assert.equal(classifyAuthError({ code: 'auth/popup-blocked' }), 'popup_blocked');
        assert.equal(classifyAuthError({ code: 'auth/popup-closed-by-user' }), 'popup_blocked');
        assert.equal(classifyAuthError({ code: 'auth/invalid-credential' }), 'bad_credentials');
        assert.equal(classifyAuthError({ code: 'auth/wrong-password' }), 'bad_credentials');
        assert.equal(classifyAuthError({ code: 'auth/network-request-failed' }), 'network');
        assert.equal(classifyAuthError({ code: 'permission-denied' }), 'permission_denied');
        assert.equal(classifyAuthError({ message: 'Missing or insufficient permissions.' }), 'permission_denied');
        assert.equal(classifyAuthError({ code: 'auth/operation-not-allowed' }), 'provider_disabled');
        assert.equal(classifyAuthError({ code: 'auth/too-many-requests' }), 'unknown');
    });

    it('인증 배지 문구를 상태별로 만든다', () => {
        assert.equal(teacherAuthStatusText(null), '미인증');
        assert.equal(teacherAuthStatusText({ authenticated: false }), '미인증');
        assert.equal(teacherAuthStatusText({ authenticated: true, allowlisted: false }), '권한 없음');
        assert.equal(
            teacherAuthStatusText({ authenticated: true, allowlisted: true, email: 'teacher@school.kr' }),
            '인증됨(teacher@school.kr)',
        );
        assert.equal(teacherAuthStatusText({ allowlisted: true, email: '' }), '인증됨');
        assert.match(teacherAuthFailureMessage('popup_blocked'), /이메일/);
        assert.match(teacherAuthFailureMessage('not_allowlisted'), /권한 없음/);
        assert.match(teacherAuthFailureMessage('permission_denied'), /admins/);
    });

    it('규칙의 GM 전용 키 목록과 맞고 updatedBy 검사는 없다', () => {
        const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
        const listed = [...rules.matchAll(/'([A-Za-z0-9_]+)'/g)].map((match) => match[1]);
        GM_ONLY_SETTING_KEYS.forEach((key) => {
            assert.equal(listed.includes(key), true, key);
        });
        assert.equal(GM_IDLE_LOGOUT_MS, 15 * 60 * 1000);
        assert.equal(ORIGINAL_HOME_CLASS_ID, 'sambong-class-2026');
        assert.match(rules, /function isAdmin\(\)/);
        assert.match(rules, /function isAdminForApp\(appId\)/);
        assert.match(rules, /sign_in_provider != 'anonymous'/);
        assert.match(rules, /documents\/admins\/\$\(request\.auth\.uid\)/);
        assert.doesNotMatch(rules, /updatedBy\s*==/);
        assert.doesNotMatch(rules, /\.updatedBy/);
        assert.match(rules, /allow delete: if false;/);
    });
});

describe('원래 학급 PIN 로그인 유지', () => {
    it('시드 학급 ID만 원래 학급으로 본다', () => {
        assert.equal(isOriginalHomeClass('sambong-class-2026'), true);
        assert.equal(isOriginalHomeClass(' sambong-class-2026 '), true);
        assert.equal(isOriginalHomeClass('other-class'), false);
        assert.equal(isOriginalHomeClass(''), false);
        assert.equal(isOriginalHomeClass(null), false);
    });

    it('원래 학급 유휴는 선생님 인증만 끝내고 다른 학급은 통째로 로그아웃한다', () => {
        assert.equal(planGmIdleExpiry({ classId: 'sambong-class-2026', isAdmin: true }), 'end-teacher-auth');
        assert.equal(planGmIdleExpiry({ classId: 'other-class', isAdmin: true }), 'full-logout');
        assert.equal(planGmIdleExpiry({
            classId: 'sambong-class-2026',
            isAdmin: true,
            projectionActive: true,
        }), 'defer');
        assert.equal(planGmIdleExpiry({ classId: 'sambong-class-2026', isAdmin: false }), 'ignore');
        assert.equal(planGmIdleExpiry({ classId: 'other-class', isAdmin: false, projectionActive: true }), 'ignore');
    });

    it('유휴 시간은 운영 한도보다 짧게만 덮어쓴다', () => {
        assert.equal(resolveGmIdleLogoutMs(undefined), GM_IDLE_LOGOUT_MS);
        assert.equal(resolveGmIdleLogoutMs(''), GM_IDLE_LOGOUT_MS);
        assert.equal(resolveGmIdleLogoutMs('nope'), GM_IDLE_LOGOUT_MS);
        assert.equal(resolveGmIdleLogoutMs(-5), GM_IDLE_LOGOUT_MS);
        assert.equal(resolveGmIdleLogoutMs(GM_IDLE_LOGOUT_MS + 1), GM_IDLE_LOGOUT_MS);
        assert.equal(resolveGmIdleLogoutMs(2500), 2500);
        assert.equal(resolveGmIdleLogoutMs(0), 0);
        assert.equal(readGmIdleLogoutOverride('?emulator=1&gmIdleMs=2500'), '2500');
        assert.equal(readGmIdleLogoutOverride(''), undefined);
    });

    it('에뮬레이터 연결은 로컬 ?emulator=1 에서만 연다', () => {
        assert.equal(shouldUseLocalFirebaseEmulator({
            hostname: '127.0.0.1',
            search: '?emulator=1&gmIdleMs=1000',
        }), true);
        assert.equal(shouldUseLocalFirebaseEmulator({
            hostname: 'localhost',
            search: '?emulator=1',
        }), true);
        assert.equal(shouldUseLocalFirebaseEmulator({
            hostname: 'dmlwjd85.github.io',
            search: '?emulator=1',
        }), false);
        assert.equal(shouldUseLocalFirebaseEmulator({
            hostname: '127.0.0.1',
            search: '',
        }), false);
    });

    it('gm이 아닌 PIN 로그인은 학급과 상관없이 학생 문서 전에 선생님 세션을 끊는다', () => {
        assert.equal(shouldSignOutNonAnonymousForPinLogin({
            studentId: 'gm',
            classId: 'sambong-class-2026',
            isAutoLogin: true,
        }), false);
        assert.equal(shouldSignOutNonAnonymousForPinLogin({
            studentId: 'gm_a',
            classId: 'other-class',
            isAutoLogin: false,
        }), false);
        assert.equal(shouldSignOutNonAnonymousForPinLogin({
            studentId: '1',
            classId: 'sambong-class-2026',
            isAutoLogin: true,
        }), true);
        assert.equal(shouldSignOutNonAnonymousForPinLogin({
            studentId: '1',
            classId: 'sambong-class-2026',
            isAutoLogin: false,
        }), true);
        assert.equal(shouldSignOutNonAnonymousForPinLogin({
            studentId: '1',
            classId: 'other-class',
            isAutoLogin: true,
        }), true);
        assert.equal(shouldSignOutNonAnonymousForPinLogin({ studentId: '13' }), true);
        assert.match(TEACHER_SESSION_SIGNOUT_FAILED_MESSAGE, /저장된 비밀번호는 그대로/);
        assert.match(HOME_CLASS_IDLE_AUTH_NOTICE, /선생님 인증이 풀렸어요/);
    });

    it('선생님 허용 목록 조회가 끝난 뒤 세션이 바뀌면 배지에 그리지 않는다', () => {
        const teacher = {
            uid: 'teacher-1',
            isAnonymous: false,
            providerData: [{ providerId: 'password', email: 'teacher@school.kr' }],
        };
        const otherTeacher = {
            uid: 'teacher-2',
            isAnonymous: false,
            providerData: [{ providerId: 'password', email: 'other@school.kr' }],
        };
        const anon = { uid: 'anon-1', isAnonymous: true, providerData: [] };
        assert.equal(shouldApplyTeacherBadgeRead(teacher, teacher), true);
        assert.equal(shouldApplyTeacherBadgeRead(teacher, anon), false);
        assert.equal(shouldApplyTeacherBadgeRead(teacher, null), false);
        assert.equal(shouldApplyTeacherBadgeRead(teacher, otherTeacher), false);
        assert.equal(shouldApplyTeacherBadgeRead(anon, anon), true);
        assert.equal(shouldApplyTeacherBadgeRead(null, anon), true);
    });
});
