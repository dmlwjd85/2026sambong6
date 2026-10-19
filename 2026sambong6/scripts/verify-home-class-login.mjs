/**
 * 빌드된 앱을 로컬 Firebase 에뮬레이터에 붙여 PIN 자동 로그인을 확인합니다.
 * 사전 조건: Auth 9099, Firestore 8080, vite preview 가 떠 있어야 합니다.
 *   node scripts/verify-home-class-login.mjs
 * playwright 패키지가 없으면 /tmp/pw/node_modules 의 설치본을 사용합니다.
 * npm test 에는 포함되지 않습니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:4173';
const APP_PATH = '/2026sambong6/';
const ARTIFACTS = process.env.ARTIFACTS || '/opt/cursor/artifacts/home-class-login';
const HOME = 'sambong-class-2026';
const OTHER = 'other-class-2026';
const GM_PIN = '2580';
const STUDENT_PIN = '1111';
const TEACHER_EMAIL = 'teacher@school.kr';
const TEACHER_PASSWORD = 'secret12';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const { chromium } = await import('playwright').catch(() => import('/tmp/pw/node_modules/playwright/index.mjs'));
const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
const { doc, setDoc } = await import('firebase/firestore');

fs.mkdirSync(ARTIFACTS, { recursive: true });

function appUrl(params) {
    const url = new URL(APP_PATH, APP_ORIGIN);
    url.searchParams.set('emulator', '1');
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    return url.toString();
}

function masterDoc() {
    const data = studentDoc(GM_PIN);
    delete data.pin;
    return data;
}

function studentDoc(pin) {
    return {
        pin,
        xp: 120,
        bong: 15,
        quests: {},
        unlockedQuests: {},
        jobs: [],
        ownedSkins: {},
        equippedSkins: {},
        inventory: [],
        gearEnhance: {},
        hasShield: false,
        shieldHP: 100,
        lunchBid: { date: '', amount: 0 },
        questHistory: [],
        usedRaidPasswords: [],
        dragonBalls: [],
        dragonBallWeekendKey: '',
        bankRegularSavings: 0,
        bankTermDeposits: [],
        stockInvestments: { kospi: null, kosdaq: null, nasdaq: null },
        stockInvestDaily: { date: '', profit: 0, sells: 0 },
        catBattle: { cleared: 0, friends: [], dailyDate: '', dailyWins: 0 },
    };
}

async function ensureTeacherUid() {
    const signUp = await fetch(
        'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: TEACHER_EMAIL,
                password: TEACHER_PASSWORD,
                returnSecureToken: true,
            }),
        },
    );
    const created = await signUp.json();
    if (created.localId) return created.localId;
    const signIn = await fetch(
        'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: TEACHER_EMAIL,
                password: TEACHER_PASSWORD,
                returnSecureToken: true,
            }),
        },
    );
    const signed = await signIn.json();
    if (!signed.localId) throw new Error('teacher auth user missing: ' + JSON.stringify(signed));
    return signed.localId;
}

async function seed(uid) {
    const env = await initializeTestEnvironment({
        projectId: 'demo-sambong',
        firestore: { host: '127.0.0.1', port: 8080 },
    });
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'admins', uid), {
            role: 'gm',
            email: TEACHER_EMAIL,
            classIds: [HOME, OTHER],
        });
        await setDoc(doc(db, 'secrets', HOME), { pin: GM_PIN });
        await setDoc(doc(db, 'secrets', OTHER), { pin: GM_PIN });
        await setDoc(doc(db, 'artifacts', HOME, 'public', 'data', 'students', 'student_gm'), masterDoc());
        await setDoc(doc(db, 'artifacts', HOME, 'public', 'data', 'students', 'student_1'), studentDoc(STUDENT_PIN));
        await setDoc(doc(db, 'artifacts', OTHER, 'public', 'data', 'students', 'student_gm'), masterDoc());
        await setDoc(doc(db, 'classes', OTHER), {
            classId: OTHER,
            displayName: '다른 학급',
            masterDisplayName: '다른 담임',
            isActive: true,
            inviteCode: 'OTHER1',
        });
    });
    await env.cleanup();
}

async function seedPinOnce(context, entries) {
    await context.addInitScript((data) => {
        if (sessionStorage.getItem('e2e-pin-seeded') === '1') return;
        Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, value));
        sessionStorage.setItem('e2e-pin-seeded', '1');
    }, entries);
}

function attachLogs(page, label) {
    page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error' || /auth|firestore|emulator|permission/i.test(text)) {
            console.log(`[${label}]`, msg.type(), text);
        }
    });
    page.on('pageerror', (err) => console.log(`[${label}] pageerror`, err.message));
}

async function shot(page, name) {
    const file = path.join(ARTIFACTS, name);
    await page.screenshot({ path: file, fullPage: false });
    console.log('screenshot', file);
    return file;
}

async function waitLoggedIn(page, namePart) {
    await page.waitForFunction((part) => {
        const overlay = document.getElementById('loginOverlay');
        const hidden = !!(overlay && overlay.classList.contains('hidden'));
        const player = document.getElementById('playerNameDisplay')?.textContent || '';
        const pin = localStorage.getItem('sambong_student_pin');
        const logout = document.getElementById('navLogoutButton')?.textContent || '';
        return hidden && !!pin && (player.includes(part) || logout.includes('로그아웃'));
    }, namePart, { timeout: 30000 });
}

async function dismissAlerts(page) {
    for (let i = 0; i < 3; i += 1) {
        const ok = page.locator('.js-custom-alert-ok');
        if (await ok.count()) {
            const text = await page.locator('.sambong-custom-modal').first().innerText().catch(() => '');
            console.log('dismiss alert', text.slice(0, 180));
            await ok.first().click();
        } else break;
    }
}

const results = [];
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
}

const uid = await ensureTeacherUid();
await seed(uid);
console.log('seeded teacher', uid);

const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
    // (a) 브라우저를 닫았다 열어도 PIN 자동 로그인
    {
        const context = await browser.newContext();
        await seedPinOnce(context, {
            sambong_class_id: HOME,
            sambong_student_id: 'gm',
            sambong_student_pin: GM_PIN,
        });
        const page = await context.newPage();
        attachLogs(page, 'a1');
        await page.goto(appUrl({ gmIdleMs: 60000 }), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__sambongE2E && window.__sambongE2E.projectId === 'demo-sambong', null, { timeout: 20000 });
        await waitLoggedIn(page, '마스터');
        await dismissAlerts(page);
        await shot(page, 'a-first-open-logged-in.png');
        const state = await context.storageState();
        await context.close();

        const context2 = await browser.newContext({ storageState: state });
        const page2 = await context2.newPage();
        attachLogs(page2, 'a2');
        await page2.goto(appUrl({ gmIdleMs: 60000 }), { waitUntil: 'domcontentloaded' });
        await page2.waitForFunction(() => window.__sambongE2E, null, { timeout: 20000 });
        await waitLoggedIn(page2, '마스터');
        await dismissAlerts(page2);
        const persisted = await page2.evaluate(() => ({
            id: localStorage.getItem('sambong_student_id'),
            pin: localStorage.getItem('sambong_student_pin'),
            classId: localStorage.getItem('sambong_class_id'),
            name: document.getElementById('playerNameDisplay')?.textContent || '',
            overlayHidden: document.getElementById('loginOverlay')?.classList.contains('hidden') === true,
            auth: window.__sambongE2E.authSummary(),
        }));
        await shot(page2, 'a-reopened-still-logged-in.png');
        const ok = persisted.overlayHidden
            && persisted.id === 'gm'
            && persisted.pin === GM_PIN
            && persisted.classId === HOME
            && persisted.name.includes('마스터')
            && persisted.auth.anonymous === true;
        record('a-reopen-autologin', ok, JSON.stringify(persisted));
        await context2.close();
    }

    // (b) 원래 학급 유휴: PIN 로그인과 서버 세션은 유지하고 새로고침하지 않는다
    {
        const context = await browser.newContext();
        await seedPinOnce(context, {
            sambong_class_id: HOME,
            sambong_student_id: 'gm',
            sambong_student_pin: GM_PIN,
        });
        const page = await context.newPage();
        attachLogs(page, 'b');
        let navigations = 0;
        page.on('framenavigated', () => { navigations += 1; });
        await page.goto(appUrl({ gmIdleMs: 3000 }), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__sambongE2E, null, { timeout: 20000 });
        await waitLoggedIn(page, '마스터');
        await dismissAlerts(page);
        await page.evaluate(() => window.switchTab('admin'));
        await page.waitForFunction(() => {
            const el = document.querySelector('#adminSection .teacher-auth-badge');
            return !!el && el.textContent.includes('마스터 PIN');
        }, null, { timeout: 15000 });
        await shot(page, 'b-home-before-idle-authenticated.png');
        const beforeNav = navigations;
        await page.evaluate(() => { window.__stay = 1; window.__sambongGmIdleRuns = 0; window.__sambongE2E.armIdleTimer(); });
        await page.waitForFunction(() => {
            const el = document.querySelector('#adminSection .teacher-auth-badge');
            const auth = window.__sambongE2E.authSummary();
            return (window.__sambongGmIdleRuns || 0) >= 1
                && !!el
                && el.textContent.includes('마스터 PIN')
                && auth.anonymous === true
                && !auth.email;
        }, null, { timeout: 12000 });
        const after = await page.evaluate(() => ({
            stay: window.__stay,
            id: localStorage.getItem('sambong_student_id'),
            pin: localStorage.getItem('sambong_student_pin'),
            classId: localStorage.getItem('sambong_class_id'),
            name: document.getElementById('playerNameDisplay')?.textContent || '',
            overlayHidden: document.getElementById('loginOverlay')?.classList.contains('hidden') === true,
            badge: document.querySelector('#adminSection .teacher-auth-badge')?.textContent?.trim() || '',
            notice: document.getElementById('appToast')?.textContent || '',
            logout: document.getElementById('navLogoutButton')?.textContent || '',
            auth: window.__sambongE2E.authSummary(),
        }));
        await shot(page, 'b-home-after-idle-still-logged-in.png');
        const ok = after.stay === 1
            && navigations === beforeNav
            && after.overlayHidden
            && after.pin === GM_PIN
            && after.id === 'gm'
            && after.classId === HOME
            && after.name.includes('마스터')
            && after.badge.includes('마스터 PIN')
            && after.logout.includes('로그아웃')
            && after.auth.anonymous === true
            && !after.auth.email;
        record('b-home-idle-keeps-pin', ok, JSON.stringify({ ...after, navigations, beforeNav }));
        await context.close();
    }

    // (c) 다른 학급은 저장소를 지우고 새로고침
    {
        const context = await browser.newContext();
        await seedPinOnce(context, {
            sambong_student_id: 'gm',
            sambong_student_pin: GM_PIN,
        });
        const page = await context.newPage();
        attachLogs(page, 'c');
        await page.goto(appUrl({ class: OTHER, gmIdleMs: 3000 }), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__sambongE2E && window.__sambongE2E.appId === 'other-class-2026', null, { timeout: 20000 });
        await waitLoggedIn(page, '담임');
        await dismissAlerts(page);
        await shot(page, 'c-other-class-before-idle-logged-in.png');
        await page.evaluate(() => { window.__stay = 1; window.__sambongE2E.armIdleTimer(); });
        await page.waitForFunction(() => {
            const overlay = document.getElementById('loginOverlay');
            const pin = localStorage.getItem('sambong_student_pin');
            const hidden = overlay && overlay.classList.contains('hidden');
            return !pin && overlay && !hidden;
        }, null, { timeout: 15000 });
        const after = await page.evaluate(() => ({
            stay: window.__stay || 0,
            id: localStorage.getItem('sambong_student_id'),
            pin: localStorage.getItem('sambong_student_pin'),
            classId: localStorage.getItem('sambong_class_id'),
            overlayHidden: document.getElementById('loginOverlay')?.classList.contains('hidden') === true,
            logout: document.getElementById('navLogoutButton')?.textContent || '',
        }));
        await shot(page, 'c-other-class-after-idle-logged-out.png');
        const ok = after.stay === 0
            && !after.pin
            && !after.id
            && after.classId === OTHER
            && after.overlayHidden === false
            && !after.logout.includes('로그아웃');
        record('c-other-class-full-logout', ok, JSON.stringify(after));
        await context.close();
    }

    // 원래 학급 학생 PIN: 새로고침 뒤에도 학생으로 로그인되고 익명 인증을 유지한다
    {
        const context = await browser.newContext();
        await seedPinOnce(context, {
            sambong_class_id: HOME,
            sambong_student_id: '1',
            sambong_student_pin: STUDENT_PIN,
        });
        const page = await context.newPage();
        attachLogs(page, 'd');
        await page.goto(appUrl({ gmIdleMs: 120000 }), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__sambongE2E, null, { timeout: 20000 });
        await waitLoggedIn(page, '김단엘');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__sambongE2E, null, { timeout: 20000 });
        await waitLoggedIn(page, '김단엘');
        await page.waitForFunction(() => {
            const el = document.querySelector('.teacher-auth-badge');
            return !!el && el.textContent.trim() === '학생 화면';
        }, null, { timeout: 15000 });
        const after = await page.evaluate(() => ({
            id: localStorage.getItem('sambong_student_id'),
            pin: localStorage.getItem('sambong_student_pin'),
            classId: localStorage.getItem('sambong_class_id'),
            name: document.getElementById('playerNameDisplay')?.textContent || '',
            overlayHidden: document.getElementById('loginOverlay')?.classList.contains('hidden') === true,
            badge: document.querySelector('.teacher-auth-badge')?.textContent?.trim() || '',
            auth: window.__sambongE2E.authSummary(),
        }));
        await page.evaluate(() => window.switchTab('admin'));
        await shot(page, 'd-home-student-reload-still-logged-in.png');
        const ok = after.overlayHidden
            && after.id === '1'
            && after.pin === STUDENT_PIN
            && after.classId === HOME
            && after.name.includes('김단엘')
            && after.badge === '학생 화면'
            && after.auth.anonymous === true;
        record('d-home-student-reload', ok, JSON.stringify(after));
        await context.close();
    }
} finally {
    await browser.close();
}

const failed = results.filter((item) => !item.ok);
fs.writeFileSync(path.join(ARTIFACTS, 'results.json'), JSON.stringify(results, null, 2));
if (failed.length) {
    console.error(JSON.stringify(results, null, 2));
    process.exit(1);
}
console.log('all browser checks passed');
