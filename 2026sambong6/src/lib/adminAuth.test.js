import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    GM_IDLE_LOGOUT_MS,
    GM_ONLY_SETTING_KEYS,
    classifyAuthError,
    isTeacherProvider,
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
        assert.match(rules, /function isAdmin\(\)/);
        assert.match(rules, /function isAdminForApp\(appId\)/);
        assert.match(rules, /sign_in_provider != 'anonymous'/);
        assert.match(rules, /documents\/admins\/\$\(request\.auth\.uid\)/);
        assert.doesNotMatch(rules, /updatedBy\s*==/);
        assert.doesNotMatch(rules, /\.updatedBy/);
        assert.match(rules, /allow delete: if false;/);
    });
});
