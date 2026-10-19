/**
 * 점심값 경합을 Firestore 에뮬레이터 트랜잭션으로 재현합니다.
 * 실행: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/lunch-race-emulator.mjs
 */
import fs from 'node:fs';
import { doc, getDoc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
    capBongIncrease,
    laterLunchDate,
    planServerLunchDeduction,
} from '../src/lib/lunchDeduct.js';
import { creditJudgedOnFinalBong, walletCreditAfterFinalBong } from '../src/lib/bankLoan.js';

const NOON_KST = Date.parse('2026-10-19T03:30:00.000Z');
const TODAY = '2026-10-19';
const YESTERDAY = '2026-10-18';
const ROUNDS = 5;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        console.error('FIRESTORE_EMULATOR_HOST 가 없습니다.');
        process.exit(1);
    }
    const testEnv = await initializeTestEnvironment({
        projectId: 'demo-sambong',
        firestore: {
            rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        },
    });

    const summary = { fixedFail: 0, oldFail: 0, fixedRounds: [], oldRounds: [], wallet: null };

    try {
        for (let round = 1; round <= ROUNDS; round += 1) {
            summary.fixedRounds.push(await runRound(testEnv, round, 'fixed'));
            if (!summary.fixedRounds.at(-1).ok) summary.fixedFail += 1;
        }
        for (let round = 1; round <= ROUNDS; round += 1) {
            summary.oldRounds.push(await runRound(testEnv, round, 'old'));
            if (!summary.oldRounds.at(-1).ok) summary.oldFail += 1;
        }
        summary.wallet = await runWalletCase(testEnv);
        if (!summary.wallet.ok) summary.fixedFail += 1;
    } finally {
        await testEnv.cleanup();
    }

    console.log(JSON.stringify(summary, null, 2));
    if (summary.fixedFail !== 0) process.exit(1);
}

async function runRound(testEnv, round, mode) {
    await testEnv.clearFirestore();
    const path = `artifacts/sambong-class-2026/public/data/students/student_lunch_${mode}_${round}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), path), {
            pin: '1234',
            xp: 10,
            bong: 100,
            lastLunchDeductDate: YESTERDAY,
            bongChangeLog: [],
            creditDefaultUntilYmd: '',
            bankNegativeSinceYmd: '',
            loanPenaltyUntilYmd: '',
            creditReleasedYmd: '',
            creditReleaseLoanId: '',
            creditWalletRecovered: false,
            loanDueHandledKey: '',
        });
    });

    const db = testEnv.authenticatedContext(`lunch-${mode}-${round}`).firestore();
    const ref = doc(db, path);
    const hist = [];
    const unsub = onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        hist.push(`${data.bong}|${data.lastLunchDeductDate || ''}|${data.creditDefaultUntilYmd || ''}`);
    });
    await sleep(80);

    const jobs = [];
    for (let i = 0; i < 4; i += 1) {
        jobs.push(mode === 'fixed' ? fixedLunch(db, ref) : oldLunch(db, ref));
        jobs.push(mode === 'fixed'
            ? fixedSave(db, ref, { bong: 100, lastLunchDeductDate: YESTERDAY })
            : oldSave(db, ref, { bong: 100, lastLunchDeductDate: i % 2 === 0 ? YESTERDAY : TODAY }));
    }
    const deducted = (await Promise.all(jobs)).filter(Boolean).length;
    await sleep(200);
    unsub();
    const finalSnap = await getDoc(ref);
    const finalData = finalSnap.data() || {};
    const ok = finalData.bong === 90
        && finalData.lastLunchDeductDate === TODAY
        && deducted === 1
        && !hist.some((row) => row.startsWith(`100|${TODAY}|`));
    return {
        round,
        mode,
        ok,
        deducted,
        final: {
            bong: finalData.bong,
            lunch: finalData.lastLunchDeductDate || '',
            until: finalData.creditDefaultUntilYmd || '',
        },
        hist,
    };
}

async function runWalletCase(testEnv) {
    await testEnv.clearFirestore();
    const path = 'artifacts/sambong-class-2026/public/data/students/student_lunch_wallet';
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), path), {
            pin: '1234',
            xp: 1,
            bong: 0,
            lastLunchDeductDate: YESTERDAY,
            creditDefaultUntilYmd: '',
            bankNegativeSinceYmd: '',
            loanDueHandledKey: '',
            creditWalletRecovered: false,
        });
    });
    const db = testEnv.authenticatedContext('lunch-wallet').firestore();
    const ref = doc(db, path);
    await fixedLunch(db, ref);
    await fixedSave(db, ref, { bong: 0, lastLunchDeductDate: YESTERDAY });
    const finalData = (await getDoc(ref)).data() || {};
    const oldDb = testEnv.authenticatedContext('lunch-wallet-old').firestore();
    const oldRef = doc(oldDb, 'artifacts/sambong-class-2026/public/data/students/student_lunch_wallet_old');
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), oldRef.path), {
            bong: -10,
            lastLunchDeductDate: TODAY,
            creditDefaultUntilYmd: '2026-10-20',
            bankNegativeSinceYmd: TODAY,
        });
    });
    await oldSave(oldDb, oldRef, { bong: 0, lastLunchDeductDate: TODAY });
    const oldData = (await getDoc(oldRef)).data() || {};
    return {
        ok: finalData.bong === -10 && finalData.lastLunchDeductDate === TODAY && finalData.creditDefaultUntilYmd === '2026-10-20',
        fixed: {
            bong: finalData.bong,
            lunch: finalData.lastLunchDeductDate || '',
            until: finalData.creditDefaultUntilYmd || '',
        },
        oldOverwrite: {
            bong: oldData.bong,
            lunch: oldData.lastLunchDeductDate || '',
            until: oldData.creditDefaultUntilYmd || '',
        },
    };
}

async function fixedLunch(db, ref) {
    let deducted = false;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const server = snap.data() || {};
        const plan = planServerLunchDeduction({
            serverBong: server.bong,
            serverLunchDate: server.lastLunchDeductDate,
            nowMs: NOON_KST,
        });
        if (!plan.deduct) {
            deducted = false;
            return;
        }
        const credit = walletCreditAfterFinalBong(server, plan.bong, plan.today);
        tx.set(ref, {
            bong: plan.bong,
            lastLunchDeductDate: plan.lastLunchDeductDate,
            ...credit,
        }, { merge: true });
        deducted = true;
    });
    return deducted;
}

async function fixedSave(db, ref, client) {
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const server = snap.data() || {};
        const bong = capBongIncrease(server.bong, client.bong, 0);
        const lastLunchDeductDate = laterLunchDate(server.lastLunchDeductDate, client.lastLunchDeductDate, TODAY);
        const credit = creditJudgedOnFinalBong({
            beforeState: server,
            lifecycle: { ...server, bong: server.bong },
            finalBong: bong,
            todayYmd: TODAY,
        });
        tx.set(ref, { bong, lastLunchDeductDate, ...credit }, { merge: true });
    });
    return false;
}

async function oldLunch(db, ref) {
    let deducted = false;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const server = snap.data() || {};
        if (server.lastLunchDeductDate === TODAY) return;
        tx.set(ref, {
            bong: Math.floor(Number(server.bong) || 0) - 10,
            lastLunchDeductDate: TODAY,
        }, { merge: true });
        deducted = true;
    });
    return deducted;
}

async function oldSave(db, ref, client) {
    await runTransaction(db, async (tx) => {
        await tx.get(ref);
        tx.set(ref, {
            bong: client.bong,
            lastLunchDeductDate: client.lastLunchDeductDate,
        }, { merge: true });
    });
    return false;
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
