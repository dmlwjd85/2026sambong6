import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { allowBackgroundCloudWrite, shouldAutoSettleLearningThermometer, shouldPersistInviteMapping } from './preLoginGuard.js';

describe('로그인 전 쓰기', () => {
    it('로그인 전에는 날씨·시세 같은 배경 쓰기를 하지 않습니다', () => {
        assert.equal(allowBackgroundCloudWrite(false), false);
        assert.equal(allowBackgroundCloudWrite(undefined), false);
        assert.equal(allowBackgroundCloudWrite(true), true);
    });

    it('이미 이 학급에 연결된 초대 코드는 다시 쓰지 않습니다', () => {
        assert.equal(shouldPersistInviteMapping({
            loggedIn: true,
            exists: true,
            existingClassId: 'sambong-class-2026',
            classId: 'sambong-class-2026',
        }), false);
        assert.equal(shouldPersistInviteMapping({
            loggedIn: false,
            exists: false,
            classId: 'sambong-class-2026',
        }), false);
        assert.equal(shouldPersistInviteMapping({
            loggedIn: true,
            exists: false,
            classId: 'sambong-class-2026',
        }), true);
        assert.equal(shouldPersistInviteMapping({
            loggedIn: true,
            exists: true,
            existingClassId: 'other-class',
            classId: 'sambong-class-2026',
        }), false);
    });
});

describe('학습 온도계 자동 정산', () => {
    it('로그인 전이나 선생님 세션이 없으면 정산하지 않습니다', () => {
        assert.equal(shouldAutoSettleLearningThermometer({ loggedIn: false, isTeacher: false }), false);
        assert.equal(shouldAutoSettleLearningThermometer({ loggedIn: false, isTeacher: true }), false);
        assert.equal(shouldAutoSettleLearningThermometer({ loggedIn: true, isTeacher: false }), false);
        assert.equal(shouldAutoSettleLearningThermometer({}), false);
        assert.equal(shouldAutoSettleLearningThermometer({ loggedIn: true, isTeacher: true }), true);
    });

    it('자동 정산 경로는 선생님 인증 없음 알림을 만들지 않습니다', () => {
        const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const start = src.indexOf('function checkLearningThermometerAutoSettlement()');
        const end = src.indexOf('window.settleLearningThermometerNow', start);
        const body = src.slice(start, end);
        assert.ok(start >= 0 && end > start);
        assert.match(body, /shouldAutoSettleLearningThermometer/);
        assert.equal(body.includes('학습 온도계 자동 정산을 실행하지 못했습니다'), false);
        assert.equal(body.includes('customAlert'), false);
    });
});

describe('게스트 읽기와 마스터 PIN', () => {
    it('게스트는 읽기 구독만 열고 로그인 세션은 켜지 않습니다', () => {
        const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const start = src.indexOf('window.loginAsGuest = function()');
        const end = src.indexOf('function clearLoginStorageKeepingClass', start);
        const body = src.slice(start, end);
        assert.ok(start >= 0 && end > start);
        assert.match(body, /openReadSubscriptions\(auth\.currentUser\)/);
        assert.equal(body.includes('_sambongLoggedIn = true'), false);
    });

    it('마스터 학생 문서의 PIN 쓰기가 거부돼도 로그인을 끝냅니다', () => {
        const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const start = src.indexOf('async function attemptLogin');
        const end = src.indexOf('async function saveDataToCloud', start);
        const body = src.slice(start, end);
        assert.match(body, /writeStoredMasterPin/);
        assert.match(body, /readStoredMasterPin/);
        assert.equal(body.includes('signInWithPopup'), false);
    });

    it('로그인 전 밥줄·수업 탭을 다시 보여 줍니다', () => {
        const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const start = src.indexOf('function syncPublicNavTabs()');
        const end = src.indexOf('function syncLunchRankVisibility()', start);
        const body = src.slice(start, end);
        assert.match(body, /tab-lunch/);
        assert.match(body, /enforceClassToolsAccess/);
    });
});

describe('레벨업 암막', () => {
    it('hidden이 있어도 화면 전체를 덮지 않도록 display를 끕니다', () => {
        const css = fs.readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');
        assert.match(css, /#rankUpCelebrate\.hidden\s*\{[^}]*display:\s*none\s*!important/);
        assert.doesNotMatch(css, /\.rank-up-celebrate\.hidden\s*\{[^}]*display:\s*none\s*!important/);
    });
});
