import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classXpCatchupSlot, classXpNextFireMs } from './classXpSlot.js';
import {
    CLASS_XP_ABORT_RETRIES,
    CLASS_XP_DENIED_FALLBACK_WAIT_MS,
    CLASS_XP_DENIED_SETTLE_MS,
    classXpAbortBackoffMs,
    classXpDeniedWaitMs,
    classXpSkewFromDateHeader,
    classXpStoredSkew,
    runClassXpGrant,
} from './classXpGrant.js';

// 2026-10-27(화) KST 시각 → epoch ms
const at = (h, m, s = 0, day = 27) => Date.UTC(2026, 9, day, h - 9, m, s);
const err = (code) => Object.assign(new Error(code), { code });

/**
 * 가짜 서버 하나. firestore.rules의 classXpSlotWriteOk + autoXp(40분 간격) 규칙을 흉내 내요.
 * 묶음은 원자적이에요: 하나라도 거절되면 아무것도 안 들어가요.
 */
function makeServer(startMs, students = 22) {
    const server = {
        nowMs: startMs,
        students: new Map(),
        autoXp: null,
        commits: [],
        writes: 0,
        script: [], // 앞에서부터 하나씩 꺼내 강제로 던질 오류 코드
    };
    for (let i = 1; i <= students; i += 1) server.students.set(String(i), { id: String(i), xp: 100, lastClassXpSlot: '' });
    server.commit = async (slot, ids, withAutoXp) => {
        server.commits.push({ at: server.nowMs, key: slot.key, n: ids.length, withAutoXp });
        const forced = server.script.shift();
        if (forced) throw err(forced);
        const serverSlot = classXpCatchupSlot(new Date(server.nowMs));
        const serverKey = serverSlot ? serverSlot.key : '';
        if (slot.key !== serverKey) throw err('permission-denied');
        if (withAutoXp && server.autoXp && !(slot.slotMs >= server.autoXp.slotMs + 2400000)) throw err('permission-denied');
        for (const sid of ids) {
            const stu = server.students.get(sid);
            stu.xp += 5;
            stu.lastClassXpSlot = slot.key;
        }
        if (withAutoXp) server.autoXp = { lastAutoXpTime: slot.key, slotMs: slot.slotMs };
        server.writes += ids.length + (withAutoXp ? 1 : 0);
    };
    return server;
}

/** 기기 하나. 화면 데이터는 서버 스냅샷(리스너)을 본다고 보고, 표시·토스트·시계 차이를 기록해요. */
function makeDevice(server, { skewMs = 0, storage = new Map(), listener = true } = {}) {
    const dev = {
        storage,
        learnedSkew: 0,
        sleeps: [],
        notices: [],
        log: [],
        measured: 0,
    };
    const snapshotStudents = () => [...server.students.values()].map((s) => ({ ...s }));
    dev.deps = {
        now: () => server.nowMs + skewMs - dev.learnedSkew,
        students: () => (listener ? snapshotStudents() : dev.staleStudents),
        lastAutoXpKey: () => (listener && server.autoXp ? server.autoXp.lastAutoXpTime : ''),
        isGiven: (key) => storage.get('given') === key,
        markGiven: (key) => { dev.log.push(`mark:${key}`); storage.set('given', key); },
        isPaused: () => false,
        skipStudent: () => false,
        commit: async (slot, ids, withAutoXp) => {
            dev.log.push(`commit:${slot.key}`);
            await server.commit(slot, ids, withAutoXp);
            dev.log.push(`ok:${slot.key}`);
        },
        measureSkew: async () => { dev.measured += 1; return skewMs; },
        setSkew: (ms) => { dev.learnedSkew = ms; },
        sleep: async (ms) => { dev.sleeps.push(ms); server.nowMs += ms; },
        notify: (kind, slot, ids) => dev.notices.push({ kind, key: slot.key, ids }),
        random: () => 0,
    };
    dev.staleStudents = snapshotStudents();
    return dev;
}

describe('수업 XP 지급 흐름 (classXpGrant)', () => {
    it('정상: 요청 1번, 쓰기 23건(학생 22 + autoXp 1), 표시는 저장이 끝난 뒤에 남긴다', async () => {
        const server = makeServer(at(10, 30, 20));
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'granted');
        assert.equal(r.granted, 22);
        assert.equal(server.commits.length, 1);
        assert.equal(server.writes, 23);
        assert.deepEqual(dev.log, ['commit:2026_10_27_10:30', 'ok:2026_10_27_10:30', 'mark:2026_10_27_10:30']);
        assert.equal(dev.notices.length, 0);
        // 같은 기기에서 다시 열면 요청 0번
        const again = await runClassXpGrant(dev.deps);
        assert.equal(again.status, 'given-here');
        assert.equal(server.commits.length, 1);
    });

    it('C-1: 저장 중에 화면이 닫히면 표시가 남지 않아, 다시 열 때 이어서 준다(중복 없음)', async () => {
        const server = makeServer(at(12, 10, 20));
        const storage = new Map();
        const dev = makeDevice(server, { storage });
        let release;
        dev.deps.commit = (slot) => { dev.log.push(`commit:${slot.key}`); return new Promise((resolve) => { release = resolve; }); };
        const pending = runClassXpGrant(dev.deps);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(storage.get('given'), undefined, '저장 응답 전에는 표시가 없어요');
        // 새로고침: 이전 실행은 버려지고, 새 화면이 같은 저장소로 다시 시작해요.
        void pending; void release;
        const dev2 = makeDevice(server, { storage });
        const r = await runClassXpGrant(dev2.deps);
        assert.equal(r.status, 'granted');
        assert.equal(server.students.get('1').xp, 105);
        assert.equal(storage.get('given'), '2026_10_27_12:10');
    });

    it('C-1: 저장은 성공했는데 표시 직전에 닫혀도, 다시 열면 화면 데이터로 걸러져 중복이 없다', async () => {
        const server = makeServer(at(12, 10, 20));
        const dev = makeDevice(server);
        await server.commit(classXpCatchupSlot(new Date(server.nowMs)), [...server.students.keys()], true);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'given-elsewhere');
        assert.equal(server.commits.length, 1);
        assert.equal(server.students.get('1').xp, 105);
    });

    it('C-1: 리스너가 아직 못 따라왔어도 autoXp 규칙이 두 번째 저장을 통째로 막는다', async () => {
        const server = makeServer(at(12, 10, 20));
        await server.commit(classXpCatchupSlot(new Date(server.nowMs)), [...server.students.keys()], true);
        const dev = makeDevice(server, { listener: false });
        dev.staleStudents = dev.staleStudents.map((s) => ({ ...s, xp: 100, lastClassXpSlot: '' }));
        const r = await runClassXpGrant(dev.deps);
        assert.equal(server.students.get('1').xp, 105, '두 번 들어가지 않아요');
        assert.equal(r.granted, 0);
        assert.ok(server.commits.length <= 3);
    });

    it('기기 두 대가 같은 종에 동시에 줘도 한 번만 들어간다', async () => {
        const server = makeServer(at(13, 50, 20));
        const a = makeDevice(server);
        const b = makeDevice(server);
        const [ra, rb] = await Promise.all([runClassXpGrant(a.deps), runClassXpGrant(b.deps)]);
        for (const stu of server.students.values()) assert.equal(stu.xp, 105);
        assert.equal(ra.granted + rb.granted, 22);
        // 늦은 기기는 403 → 서버 시각 확인 → 리스너로 이미 준 걸 보고 끝나요. 토스트 없이요.
        assert.deepEqual([...a.notices, ...b.notices], []);
        assert.ok(server.commits.length <= 2);
    });

    it('B-1: 기기 시계가 60초 빠르면 403 → 표시 되돌림 → 서버 시각 기준으로 딱 한 번 다시 보내 지급한다', async () => {
        // 서버 10:29:20, 기기 10:30:20
        const server = makeServer(at(10, 29, 20));
        const dev = makeDevice(server, { skewMs: 60000 });
        // 이전 종(09:40)은 이미 받았다고 해요.
        for (const stu of server.students.values()) stu.lastClassXpSlot = '2026_10_27_09:40';
        server.autoXp = { lastAutoXpTime: '2026_10_27_09:40', slotMs: at(9, 40) };
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'granted');
        assert.deepEqual(r.kinds, ['denied']);
        assert.equal(server.commits.length, 2, '요청은 2번이에요(거절 1 + 다시 1)');
        assert.equal(dev.measured, 1);
        assert.equal(dev.learnedSkew, 60000);
        // 서버 10:30:20이 될 때까지 기다렸다가 보내요.
        assert.equal(server.commits[1].at, at(10, 30, 20));
        assert.equal(server.students.get('1').xp, 105);
        // 표시는 거절 때 남기지 않고, 성공한 뒤에만 남겨요.
        assert.deepEqual(dev.log.filter((l) => l.startsWith('mark')), ['mark:2026_10_27_10:30']);
        assert.equal(dev.log.indexOf('mark:2026_10_27_10:30'), dev.log.length - 1);
        assert.deepEqual(dev.notices, []);
        // 배운 시계 차이로 다음 종 타이머는 서버 기준 11:20:20에 걸려요(다시 403 안 나요).
        assert.equal(classXpNextFireMs(dev.deps.now()), at(11, 20, 20));
        server.nowMs = at(11, 20, 20);
        const next = await runClassXpGrant(dev.deps);
        assert.equal(next.status, 'granted');
        assert.equal(server.commits.length, 3);
        assert.deepEqual(next.kinds, []);
    });

    it('B-1: 다시 보내도 403이면 더 보내지 않고 표시한 뒤 안내를 한 번 띄운다', async () => {
        const server = makeServer(at(10, 30, 20));
        server.script = ['permission-denied', 'permission-denied', 'permission-denied'];
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'denied');
        assert.equal(server.commits.length, 2);
        assert.deepEqual(dev.sleeps, [CLASS_XP_DENIED_SETTLE_MS]);
        assert.deepEqual(dev.notices.map((n) => n.kind), ['denied']);
        assert.equal(dev.storage.get('given'), '2026_10_27_10:30');
    });

    it('B-1: 서버 시각을 못 재면 40초 기다렸다 한 번만 다시 보낸다', async () => {
        const server = makeServer(at(10, 29, 50));
        const dev = makeDevice(server, { skewMs: 30000 });
        dev.deps.measureSkew = async () => null;
        const r = await runClassXpGrant(dev.deps);
        assert.deepEqual(dev.sleeps, [CLASS_XP_DENIED_FALLBACK_WAIT_MS]);
        assert.equal(server.commits.length, 2);
        assert.equal(r.status, 'granted');
    });

    it('C-2: 409면 잠깐 기다렸다 최대 2번 더 보낸다', async () => {
        const server = makeServer(at(11, 20, 20));
        server.script = ['aborted', 'aborted'];
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'granted');
        assert.equal(server.commits.length, 3);
        assert.deepEqual(dev.sleeps, [800, 1600]);
        assert.equal(server.students.get('1').xp, 105);
        assert.equal(dev.notices.length, 0);
    });

    it('C-2: 409가 세 번 이어지면 멈추고 그 종은 건너뛴다', async () => {
        const server = makeServer(at(11, 20, 20));
        server.script = ['aborted', 'aborted', 'aborted', 'aborted'];
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'aborted');
        assert.equal(server.commits.length, 1 + CLASS_XP_ABORT_RETRIES);
        assert.deepEqual(dev.notices.map((n) => n.kind), ['other']);
        assert.equal(dev.storage.get('given'), '2026_10_27_11:20');
    });

    it('C-2: 429는 더 보내지 않고 그 종을 건너뛴다(기다리지도 않아요)', async () => {
        const server = makeServer(at(13, 50, 20));
        server.script = ['resource-exhausted'];
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'quota');
        assert.equal(server.commits.length, 1);
        assert.deepEqual(dev.sleeps, []);
        assert.equal(dev.measured, 0);
        assert.deepEqual(dev.notices.map((n) => n.kind), ['quota']);
        // 다시 열어도 그 종은 다시 보내지 않아요.
        await runClassXpGrant(dev.deps);
        assert.equal(server.commits.length, 1);
    });

    it('409 뒤 429면 거기서 멈춘다', async () => {
        const server = makeServer(at(13, 50, 20));
        server.script = ['aborted', 'resource-exhausted'];
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'quota');
        assert.equal(server.commits.length, 2);
    });

    it('xp가 숫자가 아닌 학생은 빼고 주고, 이유 xp로 알린다', async () => {
        const server = makeServer(at(11, 20, 20));
        server.students.get('23') || server.students.set('23', { id: '23', xp: '12', lastClassXpSlot: '' });
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.granted, 22);
        assert.deepEqual(dev.notices, [{ kind: 'xp', key: '2026_10_27_11:20', ids: ['23'] }]);
    });

    it('자정: 마지막 종 뒤 날짜가 바뀌면 어제 종을 따라잡지 않고, 다음 평일 첫 종을 기다린다', async () => {
        // 화요일 14:40을 놓친 채 자정을 넘김
        const server = makeServer(at(0, 10, 0, 28));
        const dev = makeDevice(server);
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'idle');
        assert.equal(server.commits.length, 0);
        assert.equal(classXpNextFireMs(at(23, 59, 59)), at(9, 40, 20, 28));
        assert.equal(classXpNextFireMs(at(14, 40, 20)), at(9, 40, 20, 28));
        // 금요일(30일) 마지막 종 뒤 → 월요일(11/2) 09:40:20
        assert.equal(classXpNextFireMs(at(14, 40, 21, 30)), Date.UTC(2026, 10, 2, 0, 40, 20));
        // 수요일 09:40:20에 따라잡기는 오늘 첫 종만
        server.nowMs = at(9, 40, 20, 28);
        const r2 = await runClassXpGrant(dev.deps);
        assert.equal(r2.slotKey, '2026_10_28_09:40');
        assert.equal(r2.status, 'granted');
        assert.equal(server.students.get('1').xp, 105);
    });

    it('자정: 403 뒤 기다리는 사이 날짜가 바뀌면 더 보내지 않고 거절로 마무리한다', async () => {
        const server = makeServer(at(14, 40, 20));
        server.script = ['permission-denied'];
        const dev = makeDevice(server);
        dev.deps.sleep = async (ms) => { dev.sleeps.push(ms); server.nowMs = at(0, 0, 5, 28); };
        const r = await runClassXpGrant(dev.deps);
        assert.equal(r.status, 'denied');
        assert.equal(server.commits.length, 1);
        assert.deepEqual(dev.notices.map((n) => n.kind), ['denied']);
        assert.equal(dev.storage.get('given'), '2026_10_27_14:40');
    });

    it('종 직후 20초 안이나 주말에는 아무것도 보내지 않는다', async () => {
        const server = makeServer(at(10, 30, 5));
        const dev = makeDevice(server);
        assert.equal((await runClassXpGrant(dev.deps)).status, 'idle');
        server.nowMs = Date.UTC(2026, 9, 31, 2, 0, 0); // 토요일 11:00
        assert.equal((await runClassXpGrant(dev.deps)).status, 'idle');
        assert.equal(server.commits.length, 0);
    });
});

describe('수업 XP 서버 시각', () => {
    it('Date 헤더로 기기 시계 차이를 잰다(작은 오차는 0)', () => {
        const server = Date.UTC(2026, 9, 27, 1, 29, 20);
        const header = new Date(server).toUTCString();
        assert.equal(classXpSkewFromDateHeader(header, server + 60000, server + 60200), 60000 + 100 - 500);
        assert.equal(classXpSkewFromDateHeader(header, server + 300, server + 500), 0);
        assert.equal(classXpSkewFromDateHeader('', 1, 2), null);
        assert.equal(classXpSkewFromDateHeader('엉뚱한 값', 1, 2), null);
    });

    it('저장한 시계 차이는 12시간만 쓴다', () => {
        const now = at(10, 0);
        assert.equal(classXpStoredSkew(JSON.stringify({ skew: 60000, at: now - 1000 }), now), 60000);
        assert.equal(classXpStoredSkew(JSON.stringify({ skew: 60000, at: now - 13 * 3600 * 1000 }), now), 0);
        assert.equal(classXpStoredSkew('깨진 값', now), 0);
        assert.equal(classXpStoredSkew(null, now), 0);
    });

    it('403 뒤 기다릴 시간: 서버가 종 +20초 전이면 그때까지, 지났으면 3초', () => {
        assert.equal(classXpDeniedWaitMs(at(10, 30), at(10, 29, 20)), 60000);
        assert.equal(classXpDeniedWaitMs(at(10, 30), at(10, 31)), CLASS_XP_DENIED_SETTLE_MS);
        assert.equal(classXpDeniedWaitMs(at(10, 30), NaN), CLASS_XP_DENIED_FALLBACK_WAIT_MS);
        assert.equal(classXpDeniedWaitMs(at(10, 30), at(10, 30, 19)), CLASS_XP_DENIED_SETTLE_MS);
    });

    it('409 뒤 기다리는 시간은 0.8초·1.6초에 조금 흔든다', () => {
        assert.equal(classXpAbortBackoffMs(1, () => 0), 800);
        assert.equal(classXpAbortBackoffMs(2, () => 0), 1600);
        assert.equal(classXpAbortBackoffMs(1, () => 1), 1200);
    });
});
