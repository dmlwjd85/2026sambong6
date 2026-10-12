/**
 * 에뮬레이터에서만 돕니다. 초대 코드 → ?class= 새로고침 → 이름 목록 → 로그인.
 * 운영 Firestore와 Auth에는 접속하지 않습니다.
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';

const CLASS_ID = 'e2e-invite-class';
const INVITE = 'E2EQA1';
const FIRESTORE_PORT = 8181;
const AUTH_PORT = 9199;
const VITE_PORT = 5179;
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

const firebaseConfig = {
    apiKey: 'demo-key',
    authDomain: 'localhost',
    projectId: 'sambong-world-2026',
};

const children = [];

const appRoot = fileURLToPath(new URL('..', import.meta.url));

function start(command, args, extraEnv = {}) {
    const child = spawn(command, args, {
        cwd: appRoot,
        env: { ...process.env, ...extraEnv },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stdout.on('data', (buf) => process.stdout.write(buf));
    child.stderr.on('data', (buf) => process.stderr.write(buf));
    return child;
}

async function waitForOk(url, label, tries = 80) {
    for (let i = 0; i < tries; i += 1) {
        try {
            const res = await fetch(url);
            if (res.status < 500) return;
        } catch (_) { /* 아직 안 떠 있습니다. */ }
        await delay(1000);
    }
    throw new Error(`${label}가 열리지 않았습니다: ${url}`);
}

async function seedEmulator() {
    const app = initializeApp(firebaseConfig, 'e2e-seed');
    const auth = getAuth(app);
    const db = getFirestore(app);
    connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', FIRESTORE_PORT);
    await signInAnonymously(auth);
    await setDoc(doc(db, 'classes', CLASS_ID), {
        classId: CLASS_ID,
        displayName: 'E2E 반',
        inviteCode: INVITE,
        isActive: true,
        isDemoSeed: false,
        roster: [
            { id: '1', name: '가나다', gender: 'M', label: '', active: true },
            { id: '2', name: '라마바', gender: 'F', label: '', active: true },
        ],
        staff: [{ id: 'gm', name: '데모 담임', gender: 'M', label: '담임' }],
    });
    await setDoc(doc(db, 'inviteCodes', INVITE), {
        classId: CLASS_ID,
        isActive: true,
    });
    await setDoc(doc(db, 'artifacts', CLASS_ID, 'public', 'data', 'students', 'student_1'), {
        pin: '1234',
        xp: 0,
        bong: 0,
    });
}

async function runBrowser() {
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(`http://127.0.0.1:${VITE_PORT}/2026sambong6/`, { waitUntil: 'networkidle0' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForSelector('#loginClassCode');
        await page.type('#loginClassCode', INVITE);
        await page.click('#btnApplyClass');
        await page.waitForFunction(
            (classId) => new URLSearchParams(location.search).get('class') === classId,
            { timeout: 30000 },
            CLASS_ID,
        );
        await page.waitForFunction(() => {
            const select = document.querySelector('#loginId');
            if (!select) return false;
            return [...select.options].some((option) => option.textContent.includes('가나다'));
        }, { timeout: 30000 });
        const names = await page.$$eval('#loginId option', (options) => options.map((option) => option.textContent));
        if (!names.some((name) => name.includes('가나다')) || !names.some((name) => name.includes('라마바'))) {
            throw new Error(`이름 목록이 비어 있거나 다릅니다: ${names.join(' | ')}`);
        }
        await page.select('#loginId', '1');
        await page.type('#loginPin', '1234');
        await page.click('#btnLogin');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#loginOverlay');
            const name = document.querySelector('#playerNameDisplay');
            return overlay && overlay.classList.contains('is-dismissed')
                && name && name.textContent.includes('가나다');
        }, { timeout: 30000 });
    } finally {
        await browser.close();
    }
}

async function main() {
    start('npx', ['--yes', 'firebase-tools', 'emulators:start', '--only', 'auth,firestore', '--project', 'sambong-world-2026']);
    await waitForOk(`http://127.0.0.1:${FIRESTORE_PORT}/`, 'Firestore 에뮬레이터', 180);
    await waitForOk(`http://127.0.0.1:${AUTH_PORT}/`, 'Auth 에뮬레이터', 180);
    await seedEmulator();
    start('npx', ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
        VITE_USE_FIREBASE_EMULATOR: '1',
    });
    await waitForOk(`http://127.0.0.1:${VITE_PORT}/2026sambong6/`, 'Vite');
    await runBrowser();
    console.log('e2e invite login ok');
}

try {
    await main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    children.forEach((child) => {
        try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { /* 이미 끝난 프로세스입니다. */ }
    });
}
process.exit(process.exitCode || 0);
