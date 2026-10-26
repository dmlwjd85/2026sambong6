import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { allowBackgroundCloudWrite, shouldAutoSettleLearningThermometer, shouldPersistInviteMapping, shouldRunPraiseMidnightRoll, runPraiseMidnightRollOnce } from './preLoginGuard.js';

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

it('자정 칭찬 판 넘김: 로그인 전에는 쓰지 않고, 로그인 후 하루 한 번만', () => {
    assert.equal(shouldRunPraiseMidnightRoll({ loggedIn: false, lastRollDate: null, today: '2026-10-27' }), false);
    assert.equal(shouldRunPraiseMidnightRoll({ loggedIn: true, lastRollDate: null, today: '2026-10-27' }), true);
    assert.equal(shouldRunPraiseMidnightRoll({ loggedIn: true, lastRollDate: '2026-10-27', today: '2026-10-27' }), false);
    assert.equal(shouldRunPraiseMidnightRoll({ loggedIn: true, lastRollDate: '2026-10-27', today: '2026-10-28' }), true);
    assert.equal(shouldRunPraiseMidnightRoll({ loggedIn: true, lastRollDate: null, today: '' }), false);
});

describe('runPraiseMidnightRollOnce', () => {
    it('성공한 뒤에만 날짜를 기록하고, 실패하면 같은 날 다시 시도한다', async () => {
        const st = { running: false, lastRollDate: null };
        await assert.rejects(runPraiseMidnightRollOnce(st, { loggedIn: true, today: '2026-10-27' }, async () => { throw new Error('x'); }));
        assert.equal(st.lastRollDate, null);
        assert.equal(st.running, false);
        assert.equal(await runPraiseMidnightRollOnce(st, { loggedIn: true, today: '2026-10-27', now: Date.now() + 60000 }, async () => {}), true);
        assert.equal(st.lastRollDate, '2026-10-27');
        let n = 0;
        assert.equal(await runPraiseMidnightRollOnce(st, { loggedIn: true, today: '2026-10-27' }, async () => { n++; }), false);
        assert.equal(n, 0);
    });
    it('동시에 두 번 실행되지 않고, 로그인 전에는 쓰지 않는다', async () => {
        const st = { running: false, lastRollDate: null };
        let n = 0; let release;
        const gate = new Promise((r) => { release = r; });
        const a = runPraiseMidnightRollOnce(st, { loggedIn: true, today: '2026-10-28' }, async () => { n++; await gate; });
        assert.equal(await runPraiseMidnightRollOnce(st, { loggedIn: true, today: '2026-10-28' }, async () => { n++; }), false);
        release(); assert.equal(await a, true); assert.equal(n, 1);
        assert.equal(await runPraiseMidnightRollOnce({}, { loggedIn: false, today: '2026-10-28' }, async () => { n++; }), false);
        assert.equal(n, 1);
    });
});

describe('runPraiseMidnightRollOnce 재시도 제한', () => {
    const fail = async () => { throw new Error('x'); };
    it('1→2→4→8분 간격으로 하루 최대 5번만 다시 시도한다', async () => {
        const st = {}; const day = '2026-10-28'; const M = 60000;
        let t = 0; let calls = 0;
        const tryAt = async (at) => { try { return await runPraiseMidnightRollOnce(st, { loggedIn: true, today: day, now: at }, async () => { calls++; throw new Error('x'); }); } catch { return 'failed'; } };
        assert.equal(await tryAt(t), 'failed'); // 첫 시도
        assert.equal(await tryAt(t + 0.5 * M), false); // 1분 전에는 안 함
        const gaps = [1, 2, 4, 8, 8];
        for (const g of gaps) { assert.equal(await tryAt(t + g * M - 1), false); t += g * M; assert.equal(await tryAt(t), 'failed'); }
        assert.equal(calls, 6); // 첫 시도 + 재시도 5번
        assert.equal(await tryAt(t + 60 * M), false);
        assert.equal(calls, 6);
    });
    it('다음 날이나 다시 로그인하면 다시 시도한다', async () => {
        const st = {}; let calls = 0;
        const w = async () => { calls++; throw new Error('x'); };
        for (let k = 0; k < 6; k++) await runPraiseMidnightRollOnce(st, { loggedIn: true, today: 'd1', now: k * 3600000 }, w).catch(() => {});
        assert.equal(calls, 6);
        assert.equal(await runPraiseMidnightRollOnce(st, { loggedIn: true, today: 'd1', now: 99e6 }, w).catch(() => 'f'), false);
        await runPraiseMidnightRollOnce(st, { loggedIn: false, today: 'd1', now: 99e6 }, w);
        assert.equal(await runPraiseMidnightRollOnce(st, { loggedIn: true, today: 'd1', now: 99e6 }, w).catch(() => 'f'), 'f');
        assert.equal(calls, 7);
        for (let k = 0; k < 6; k++) await runPraiseMidnightRollOnce(st, { loggedIn: true, today: 'd1', now: 1e9 + k * 3600000 }, w).catch(() => {});
        assert.equal(await runPraiseMidnightRollOnce(st, { loggedIn: true, today: 'd2', now: 2e9 }, async () => {}), true);
        assert.equal(st.lastRollDate, 'd2');
    });
});
