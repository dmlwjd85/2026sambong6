import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    LUNCH_FEE_BONG,
    capBongIncrease,
    isLunchDeductWindow,
    laterLunchDate,
    planServerLunchDeduction,
    seoulDateParts,
    seoulYmdFromMs,
} from './lunchDeduct.js';

const NOON_KST = Date.parse('2026-10-19T03:00:00.000Z');
const BEFORE_NOON_KST = Date.parse('2026-10-19T02:59:00.000Z');
const SATURDAY_NOON_KST = Date.parse('2026-10-17T03:00:00.000Z');
const TODAY = '2026-10-19';
const YESTERDAY = '2026-10-18';

function memoryDoc(initial) {
    let state = { ...initial };
    let version = 0;
    return {
        read() {
            return { ...state };
        },
        async transaction(run) {
            for (;;) {
                const seen = version;
                const snap = { ...state };
                let patch = null;
                await Promise.resolve();
                run(snap, (next) => {
                    patch = next;
                });
                await Promise.resolve();
                if (version !== seen) continue;
                if (patch) state = { ...state, ...patch };
                version += 1;
                return { ...state };
            }
        },
    };
}

function lunchCommit(nowMs, vacationPaused = false) {
    return (snap, write) => {
        const plan = planServerLunchDeduction({
            serverBong: snap.bong,
            serverLunchDate: snap.lastLunchDeductDate,
            nowMs,
            vacationPaused,
        });
        if (!plan.deduct) return;
        write({ bong: plan.bong, lastLunchDeductDate: plan.lastLunchDeductDate });
    };
}

function guardedSave(client, today, maxBongIncrease = 0) {
    return (snap, write) => {
        write({
            bong: capBongIncrease(snap.bong, client.bong, maxBongIncrease),
            lastLunchDeductDate: laterLunchDate(snap.lastLunchDeductDate, client.lastLunchDeductDate, today),
        });
    };
}

function oldLunch(clientBong, today) {
    return (_snap, write) => {
        write({ bong: Math.floor(Number(clientBong) || 0) - LUNCH_FEE_BONG, lastLunchDeductDate: today });
    };
}

function oldSave(client) {
    return (_snap, write) => {
        write({ bong: client.bong, lastLunchDeductDate: client.lastLunchDeductDate });
    };
}

describe('점심값 시각', () => {
    it('서버 시각을 서울 날짜로 읽는다', () => {
        const parts = seoulDateParts(NOON_KST);
        assert.equal(seoulYmdFromMs(NOON_KST), TODAY);
        assert.equal(parts.hour, 12);
        assert.equal(parts.weekday, 1);
        assert.equal(isLunchDeductWindow(parts), true);
        assert.equal(isLunchDeductWindow(seoulDateParts(BEFORE_NOON_KST)), false);
        assert.equal(isLunchDeductWindow(seoulDateParts(SATURDAY_NOON_KST)), false);
    });
});

describe('점심값 한 번', () => {
    it('오늘 기록이 없을 때만 10봉을 빼고 날짜를 같이 적는다', () => {
        const first = planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: YESTERDAY,
            nowMs: NOON_KST,
        });
        assert.equal(first.deduct, true);
        assert.equal(first.bong, 90);
        assert.equal(first.lastLunchDeductDate, TODAY);
        const second = planServerLunchDeduction({
            serverBong: first.bong,
            serverLunchDate: first.lastLunchDeductDate,
            nowMs: NOON_KST,
        });
        assert.equal(second.deduct, false);
        assert.equal(second.bong, 90);
        assert.equal(second.fee, 0);
    });

    it('주말·정오 전·방학에는 빼지 않는다', () => {
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
            nowMs: SATURDAY_NOON_KST,
        }).deduct, false);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
            nowMs: BEFORE_NOON_KST,
        }).deduct, false);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
            nowMs: NOON_KST,
            vacationPaused: true,
        }).deduct, false);
    });

    it('여러 탭이 동시에 써도 점심값은 한 번만 빠진다', async () => {
        for (let round = 0; round < 5; round += 1) {
            const doc = memoryDoc({ bong: 100, lastLunchDeductDate: YESTERDAY });
            const jobs = [];
            for (let i = 0; i < 4; i += 1) jobs.push(doc.transaction(lunchCommit(NOON_KST)));
            for (let i = 0; i < 4; i += 1) {
                jobs.push(doc.transaction(guardedSave({ bong: 100, lastLunchDeductDate: YESTERDAY }, TODAY)));
            }
            await Promise.all(jobs);
            const done = doc.read();
            assert.equal(done.bong, 90, `경합 ${round + 1}회 봉`);
            assert.equal(done.lastLunchDeductDate, TODAY, `경합 ${round + 1}회 날짜`);
        }
    });

    it('예전 저장은 점심 날짜만 오늘로 남기고 봉을 100으로 되돌릴 수 있다', async () => {
        const doc = memoryDoc({ bong: 100, lastLunchDeductDate: YESTERDAY });
        await doc.transaction(oldLunch(100, TODAY));
        await doc.transaction(oldSave({ bong: 100, lastLunchDeductDate: YESTERDAY }));
        await doc.transaction(oldLunch(100, TODAY));
        await doc.transaction(oldSave({ bong: 100, lastLunchDeductDate: TODAY }));
        const lost = doc.read();
        assert.equal(lost.bong, 100);
        assert.equal(lost.lastLunchDeductDate, TODAY);

        const fixed = memoryDoc({ bong: 100, lastLunchDeductDate: YESTERDAY });
        await fixed.transaction(lunchCommit(NOON_KST));
        await fixed.transaction(guardedSave({ bong: 100, lastLunchDeductDate: YESTERDAY }, TODAY));
        await fixed.transaction(lunchCommit(NOON_KST));
        await fixed.transaction(guardedSave({ bong: 100, lastLunchDeductDate: TODAY }, TODAY));
        const kept = fixed.read();
        assert.equal(kept.bong, 90);
        assert.equal(kept.lastLunchDeductDate, TODAY);
    });
});

describe('일반 저장의 봉 상한', () => {
    it('상한을 안 주면 서버보다 봉을 올리지 않는다', () => {
        assert.equal(capBongIncrease(90, 100), 90);
        assert.equal(capBongIncrease(90, 90), 90);
        assert.equal(capBongIncrease(-10, 0), -10);
        assert.equal(capBongIncrease(90, 80), 80);
    });

    it('보상에 적어 둔 증가만 허용한다', () => {
        assert.equal(capBongIncrease(100, 140, 40), 140);
        assert.equal(capBongIncrease(100, 160, 40), 140);
    });
});

describe('점심 날짜', () => {
    it('서버와 클라이언트 중 더 늦은 날을 쓴다', () => {
        assert.equal(laterLunchDate(TODAY, YESTERDAY, TODAY), TODAY);
        assert.equal(laterLunchDate(YESTERDAY, TODAY, TODAY), TODAY);
        assert.equal(laterLunchDate('', YESTERDAY, TODAY), YESTERDAY);
        assert.equal(laterLunchDate('2099-01-01', YESTERDAY, TODAY), '2099-01-01');
        assert.equal(laterLunchDate(YESTERDAY, '2099-01-01', TODAY), YESTERDAY);
    });
});
