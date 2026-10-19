import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    LUNCH_FEE_BONG,
    capBongIncrease,
    walletSaveBaseline,
    isLunchDeductWindow,
    laterLunchDate,
    lunchHolidayDates,
    lunchAlreadyRecorded,
    planServerLunchDeduction,
    lunchAlertStorageKey,
    claimLunchAlertShown,
    claimLunchAlertShownOnce,
    seoulDateParts,
    seoulSchoolDay,
    seoulYmdFromMs,
} from './lunchDeduct.js';
import { isBankBusinessDay } from './bankLoan.js';
import { KOREA_2026_FALL_HOLIDAYS } from './season2.js';

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

function guardedSave(client, _today, maxBongIncrease = 0) {
    return (snap, write) => {
        write({
            bong: capBongIncrease(snap.bong, client.bong, maxBongIncrease),
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

    it('점심을 빼지 않은 저장은 날짜를 오늘로 바꾸지 않아 그날 점심값이 남는다', async () => {
        const doc = memoryDoc({ bong: 20, lastLunchDeductDate: YESTERDAY });
        await doc.transaction(guardedSave({ bong: 20, lastLunchDeductDate: TODAY }, TODAY));
        assert.equal(doc.read().bong, 20);
        assert.equal(doc.read().lastLunchDeductDate, YESTERDAY);
        await doc.transaction(lunchCommit(NOON_KST));
        assert.equal(doc.read().bong, 10);
        assert.equal(doc.read().lastLunchDeductDate, TODAY);
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
        const stick = (baseline, next, { allowDecrease = false, maxDrop = 0, maxRise = 0 } = {}) => {
            let bong = next;
            if (next < baseline) {
                bong = allowDecrease ? Math.max(next, baseline - maxDrop) : baseline;
            }
            return capBongIncrease(baseline, bong, maxRise);
        };
        const repayBaseline = walletSaveBaseline({
            serverBong: 101, proposedBong: 10, manualBank: true,
        });
        assert.equal(repayBaseline, 10);
        assert.equal(stick(repayBaseline, 10, { allowDecrease: true, maxDrop: 0 }), 10);
        const withdrawBaseline = walletSaveBaseline({
            serverBong: 100, proposedBong: 150, manualBank: true,
        });
        assert.equal(withdrawBaseline, 150);
        assert.equal(stick(withdrawBaseline, 150), 150);
        const lunchBaseline = walletSaveBaseline({
            serverBong: 20, proposedBong: 20, accruedBong: 10, lunchDeducted: true,
        });
        assert.equal(lunchBaseline, 10);
        assert.equal(stick(lunchBaseline, 20), 10);
        assert.equal(capBongIncrease(100, 140, 40), 140);
        assert.equal(capBongIncrease(100, 160, 40), 140);
    });
});

describe('공휴일에는 점심값을 빼지 않는다', () => {
    const HOLIDAYS = [
        ['2026-01-01', '신정'],
        ['2026-02-16', '설날 연휴'],
        ['2026-02-17', '설날'],
        ['2026-02-18', '설날 연휴'],
        ['2026-03-01', '삼일절'],
        ['2026-03-02', '삼일절 대체공휴일'],
        ['2026-05-01', '노동절'],
        ['2026-05-05', '어린이날'],
        ['2026-05-24', '부처님오신날'],
        ['2026-05-25', '부처님오신날 대체공휴일'],
        ['2026-06-03', '전국동시지방선거'],
        ['2026-06-06', '현충일'],
        ['2026-07-17', '제헌절'],
        ['2026-08-15', '광복절'],
        ['2026-08-17', '광복절 대체공휴일'],
        ['2026-09-24', '추석 연휴'],
        ['2026-09-25', '추석'],
        ['2026-09-26', '추석 연휴'],
        ['2026-10-03', '개천절'],
        ['2026-10-05', '개천절 대체공휴일'],
        ['2026-10-09', '한글날'],
        ['2026-12-25', '성탄절'],
        ['2027-01-01', '신정'],
    ];

    HOLIDAYS.forEach(([ymd, name]) => {
        it(`${ymd} ${name} 정오에는 봉과 점심 날짜를 그대로 둔다`, () => {
            const noon = Date.parse(`${ymd}T03:00:00.000Z`);
            const plan = planServerLunchDeduction({
                serverBong: 100,
                serverLunchDate: '',
                nowMs: noon,
                classHolidays: [],
            });
            assert.equal(plan.deduct, false, name);
            assert.equal(plan.bong, 100, name);
            assert.equal(plan.lastLunchDeductDate, '', name);
            assert.equal(plan.holiday || !isLunchDeductWindow(seoulDateParts(noon)), true, name);
        });
    });

    it('학급 목록에만 있는 날도 빼고, 비운 학급 목록은 기본 공휴일을 남긴다', () => {
        const schoolDay = planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: YESTERDAY,
            nowMs: NOON_KST,
            classHolidays: ['2026-10-19'],
        });
        assert.equal(schoolDay.deduct, false);
        assert.equal(schoolDay.bong, 100);
        assert.equal(schoolDay.lastLunchDeductDate, YESTERDAY);

        const cleared = planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
            nowMs: Date.parse('2026-10-09T03:00:00.000Z'),
            classHolidays: [],
        });
        assert.equal(cleared.deduct, false);
        assert.equal(cleared.holiday, true);

        const oldClassList = planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
            nowMs: Date.parse('2026-10-05T03:00:00.000Z'),
            classHolidays: ['2026-09-24'],
        });
        assert.equal(oldClassList.deduct, false);
        assert.equal(lunchHolidayDates(['2026-11-11']).has('2026-11-11'), true);
        assert.equal(lunchHolidayDates([]).has('2026-10-05'), true);
        assert.equal(KOREA_2026_FALL_HOLIDAYS.includes('2026-10-05'), true);
    });
});

describe('점심 요일은 서버 시각의 한국 표준시다', () => {
    it('UTC 금요일 저녁은 서울 토요일이라 점심값을 빼지 않는다', () => {
        const fridayEveningUtc = Date.parse('2026-10-23T15:30:00.000Z');
        const saturday = seoulDateParts(fridayEveningUtc);
        assert.equal(new Date(fridayEveningUtc).getUTCDay(), 5);
        assert.equal(saturday.ymd, '2026-10-24');
        assert.equal(saturday.weekday, 6);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
            nowMs: fridayEveningUtc,
        }).deduct, false);

        const saturdayAfternoon = Date.parse('2026-10-24T03:30:00.000Z');
        const afternoon = seoulDateParts(saturdayAfternoon);
        assert.equal(afternoon.ymd, '2026-10-24');
        assert.equal(afternoon.weekday, 6);
        assert.equal(afternoon.hour, 12);
        assert.equal(isLunchDeductWindow(afternoon), false);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '2026-10-23',
            nowMs: saturdayAfternoon,
        }).deduct, false);
    });

    it('서버가 화요일이면 기기 달력과 상관없이 그 날짜로 뺀다', () => {
        const serverTuesday = Date.parse('2026-10-20T03:30:00.000Z');
        const deviceSaturday = Date.parse('2026-10-24T03:30:00.000Z');
        const serverParts = seoulDateParts(serverTuesday);
        assert.equal(serverParts.ymd, '2026-10-20');
        assert.equal(serverParts.weekday, 2);
        assert.equal(seoulDateParts(deviceSaturday).weekday, 6);
        const plan = planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '2026-10-19',
            nowMs: serverTuesday,
        });
        assert.equal(plan.deduct, true);
        assert.equal(plan.bong, 90);
        assert.equal(plan.lastLunchDeductDate, '2026-10-20');
        assert.notEqual(plan.today, seoulYmdFromMs(deviceSaturday));
    });

    it('자정을 넘기면 서울 날짜가 바뀌고 점심 시간은 닫힌다', () => {
        const before = Date.parse('2026-10-20T14:59:59.000Z');
        const after = Date.parse('2026-10-20T15:00:00.000Z');
        const tueNight = seoulSchoolDay(before, { holidays: [] });
        const wedStart = seoulSchoolDay(after, { holidays: [] });
        assert.equal(tueNight.ymd, '2026-10-20');
        assert.equal(tueNight.hour, 23);
        assert.equal(tueNight.lunchOpen, true);
        assert.equal(wedStart.ymd, '2026-10-21');
        assert.equal(wedStart.hour, 0);
        assert.equal(wedStart.lunchOpen, false);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '2026-10-19',
            serverNowMs: before,
            deviceNowMs: after,
        }).deduct, true);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '2026-10-20',
            serverNowMs: after,
            deviceNowMs: before,
        }).deduct, false);
    });

    it('금요일 밤에서 토요일로 넘어가면 점심값을 빼지 않는다', () => {
        const fridayNight = Date.parse('2026-10-23T14:59:59.000Z');
        const saturdayStart = Date.parse('2026-10-23T15:00:00.000Z');
        const friday = seoulSchoolDay(fridayNight, { holidays: [] });
        const saturday = seoulSchoolDay(saturdayStart, { holidays: [] });
        assert.equal(friday.ymd, '2026-10-23');
        assert.equal(friday.weekday, 5);
        assert.equal(friday.lunchOpen, true);
        assert.equal(saturday.ymd, '2026-10-24');
        assert.equal(saturday.weekday, 6);
        assert.equal(saturday.lunchOpen, false);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '2026-10-22',
            nowMs: fridayNight,
        }).lastLunchDeductDate, '2026-10-23');
        assert.equal(planServerLunchDeduction({
            serverBong: 90,
            serverLunchDate: '2026-10-23',
            nowMs: saturdayStart,
        }).deduct, false);
    });

    it('기기 시계가 하루 앞서 있어도 이미 적힌 날짜면 다시 빼지 않는다', () => {
        const serverTuesday = Date.parse('2026-10-20T03:30:00.000Z');
        const ahead = planServerLunchDeduction({
            serverBong: 80,
            serverLunchDate: '2026-10-21',
            serverNowMs: serverTuesday,
            deviceNowMs: Date.parse('2026-10-21T03:30:00.000Z'),
        });
        assert.equal(lunchAlreadyRecorded('2026-10-21', '2026-10-20'), true);
        assert.equal(ahead.deduct, false);
        assert.equal(ahead.bong, 80);
        assert.equal(ahead.lastLunchDeductDate, '2026-10-21');
        assert.equal(ahead.today, '2026-10-20');
    });

    it('기기 시계가 늦어도 서버 시각이 점심 시간이면 한 번 뺀다', () => {
        const serverTuesday = Date.parse('2026-10-20T03:30:00.000Z');
        const behind = planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '2026-10-19',
            serverNowMs: serverTuesday,
            deviceNowMs: Date.parse('2026-10-19T01:00:00.000Z'),
        });
        assert.equal(behind.deduct, true);
        assert.equal(behind.bong, 90);
        assert.equal(behind.lastLunchDeductDate, '2026-10-20');
        assert.equal(seoulSchoolDay(serverTuesday, {
            holidays: [],
            deviceNowMs: Date.parse('2026-10-24T03:30:00.000Z'),
        }).ymd, '2026-10-20');
    });

    it('서버 시각을 모르면 기기 시계로 빼지 않는다', () => {
        const skipped = planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
        });
        assert.equal(skipped.deduct, false);
        assert.equal(skipped.bong, 100);
        assert.equal(skipped.today, '');
    });

    it('기기 시간대와 달라도 서울 날짜는 같다', () => {
        const cross = Date.parse('2026-10-20T15:30:00.000Z');
        const seoul = seoulYmdFromMs(cross);
        assert.equal(seoul, '2026-10-21');
        assert.equal(seoulDateParts(cross).weekday, 3);
        const local = new Date(cross);
        const localYmd = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
        if (new Date().getTimezoneOffset() !== -540) {
            assert.notEqual(localYmd, seoul);
        }
        assert.equal(isBankBusinessDay('2026-10-05', { holidays: [] }), false);
        assert.equal(planServerLunchDeduction({
            serverBong: 100,
            serverLunchDate: '',
            nowMs: Date.parse('2026-10-05T03:30:00.000Z'),
            classHolidays: [],
        }).deduct, false);
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

describe('점심값 알림은 학생·날짜마다 한 번', () => {
    function memoryStorage() {
        const box = new Map();
        return {
            getItem(key) { return box.has(key) ? box.get(key) : null; },
            setItem(key, value) { box.set(key, String(value)); },
        };
    }

    it('같은 학생이 같은 날 알림을 두 번 가져가지 않는다', async () => {
        const storage = memoryStorage();
        const key = lunchAlertStorageKey('class1', '13', '2026-10-22');
        assert.equal(await claimLunchAlertShownOnce(storage, key), true);
        assert.equal(await claimLunchAlertShownOnce(storage, key), false);
        assert.equal(claimLunchAlertShown(storage, key), false);
        assert.equal(await claimLunchAlertShownOnce(storage, lunchAlertStorageKey('class1', '14', '2026-10-22')), true);
        assert.equal(await claimLunchAlertShownOnce(storage, lunchAlertStorageKey('class1', '13', '2026-10-23')), true);
    });

    it('학생을 모르면 알림을 막지 않는다', () => {
        assert.equal(lunchAlertStorageKey('class1', '', '2026-10-22'), '');
        assert.equal(claimLunchAlertShown(memoryStorage(), ''), true);
    });
});
