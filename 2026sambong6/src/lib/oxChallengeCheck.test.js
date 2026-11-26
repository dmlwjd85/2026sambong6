import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './oxChallengeCheck.js';

const kst = (ymd, hh, mm, ss = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+09:00`);

describe('OX 무제한 도전 하루 정산', () => {
    it('구간: 0·20은 -20봉+삐에로, 21·30은 -10봉, 31 이상은 +10봉', () => {
        const t = (b) => { const r = C.oxCheckTier(b); return [r.best, r.tier, r.delta, r.pierrot]; };
        assert.deepEqual(t(0), [0, 'low', -20, true]);
        assert.deepEqual(t(undefined), [0, 'low', -20, true]);
        assert.deepEqual(t(-5), [0, 'low', -20, true]);
        assert.deepEqual(t(20), [20, 'low', -20, true]);
        assert.deepEqual(t(21), [21, 'mid', -10, false]);
        assert.deepEqual(t(30), [30, 'mid', -10, false]);
        assert.deepEqual(t(30.9), [30, 'mid', -10, false]);
        assert.deepEqual(t(31), [31, 'high', 10, false]);
        assert.deepEqual(t(500), [500, 'high', 10, false]);
    });

    it('명단의 활성 학생 모두: 기록이 없으면 0개, 명단 밖·선생님·손님은 빼요', () => {
        const rows = [{ id: '1', best: 31 }, { id: '2', best: 30 }, { id: '3', best: 21 }, { id: '4', best: 20 }, { id: '9', best: 99 }, { id: 'gm', best: 50 }];
        const plan = C.planOxCheck(rows, ['1', '2', '3', '4', '5', 'gm', 'guest', '1']);
        assert.deepEqual(plan.map((p) => [p.id, p.best, p.delta, p.pierrot]), [
            ['1', 31, 10, false], ['2', 30, -10, false], ['3', 21, -10, false], ['4', 20, -20, true], ['5', 0, -20, true],
        ]);
        assert.deepEqual(C.planOxCheck(null, null), []);
    });

    it('정산 날·시각: 11-26 14:40부터 그날 자정 전까지만, 다른 날은 없어요', () => {
        assert.equal(C.oxCheckDueYmd(kst('2026-11-26', 14, 39, 59)), '');
        assert.equal(C.oxCheckDueYmd(kst('2026-11-26', 14, 40)), '2026-11-26');
        assert.equal(C.oxCheckDueYmd(kst('2026-11-26', 23, 59)), '2026-11-26');
        assert.equal(C.oxCheckDueYmd(kst('2026-11-27', 14, 40)), '');
        assert.equal(C.oxCheckDueYmd(kst('2026-11-25', 15, 0)), '');
        assert.equal(C.oxCheckIsEventDay(kst('2026-11-26', 0, 1)), true);
        assert.equal(C.oxCheckIsEventDay(kst('2026-11-27', 0, 1)), false);
    });

    it('타이머: 정산 시각 2초 뒤, 지났거나 다른 날이면 -1', () => {
        assert.equal(C.oxCheckDelayMs(kst('2026-11-26', 14, 30)), 10 * 60000 + 2000);
        assert.equal(C.oxCheckDelayMs(kst('2026-11-26', 14, 40, 1)), -1);
        assert.equal(C.oxCheckDelayMs(kst('2026-11-25', 14, 30)), -1);
    });

    it('진짜 우리 반(시드 학급)에서만 켜져요', () => {
        assert.equal(C.oxCheckEnabledFor('sambong-class-2026'), true);
        assert.equal(C.oxCheckEnabledFor('qa-class'), false);
        assert.equal(C.oxCheckEnabledFor(''), false);
    });

    it('봉: 음수 잔액도 그대로 빼고, 규칙 바닥 -2000 아래로는 내리지 않아요', () => {
        assert.deepEqual(C.applyOxCheckBong(5, -20), { before: 5, after: -15, delta: -20 });
        assert.deepEqual(C.applyOxCheckBong(-30, -10), { before: -30, after: -40, delta: -10 });
        assert.deepEqual(C.applyOxCheckBong(-1990, -20), { before: -1990, after: -2000, delta: -10 });
        assert.deepEqual(C.applyOxCheckBong(-2100, -20), { before: -2100, after: -2100, delta: 0 });
        assert.deepEqual(C.applyOxCheckBong(-2100, 10), { before: -2100, after: -2090, delta: 10 });
        assert.deepEqual(C.applyOxCheckBong('abc', 10), { before: 0, after: 10, delta: 10 });
    });

    it('문구: 기록 사유와 팝업, 요약', () => {
        assert.equal(C.oxCheckReasonText(31, 10), 'OX 무제한 도전 정산 +10봉 (최고 기록 31개)');
        assert.equal(C.oxCheckReasonText(0, -20), 'OX 무제한 도전 정산 -20봉 (최고 기록 0개)');
        assert.match(C.oxCheckPierrotText(0, -20), /아직 무제한 도전 기록이 없어요[\s\S]*20봉/);
        assert.match(C.oxCheckPierrotText(12, -20), /최고 기록이 12개/);
        assert.match(C.oxCheckPierrotText(3, 0), /더 빠지지 않았어요/);
        assert.doesNotMatch(C.oxCheckPierrotText(3, 0), /0봉이 빠졌어요/);
        assert.equal(C.oxCheckSummary([{ tier: 'high' }, { tier: 'low' }, { tier: 'low' }, { tier: 'mid' }]),
            '31개 이상 +10봉 1명 · 21~30개 -10봉 1명 · 20개 이하 -20봉 2명');
        assert.match(C.oxCheckNote(), /11월 26일 14시 40분/);
    });

    const serverPenalty = {
        bong: 80,
        oxChallengeChecked: '2026-11-26',
        oxChallengeDelta: -20,
        bongChangeLog: [{ source: 'oxChallengeCheck', date: '2026-11-26', delta: -20, before: 100, after: 80 }],
        teacherNotice: { id: 'oxcheck_2026-11-26_4', kind: 'pierrotFanfare', text: '빠졌어요' },
    };
    it('정산을 모르는 저장은 옛 봉으로 되돌리지 않아요', () => {
        const stale = { bong: 100, bongChangeLog: [] };
        const kept = C.reconcileOxCheckBong({ server: serverPenalty, client: stale, baseBong: 80, requestedBong: 100 });
        assert.deepEqual(kept, { bong: 80, mark: '2026-11-26' });
        const quest = C.reconcileOxCheckBong({
            server: serverPenalty, client: stale, baseBong: 80, requestedBong: 110, maxIncrease: 10,
        });
        assert.equal(quest.bong, 90);
        const lunch = C.reconcileOxCheckBong({
            server: serverPenalty, client: stale, baseBong: 80, requestedBong: 90, allowDecrease: true, maxDecrease: 10,
        });
        assert.equal(lunch.bong, 70);
        const bonus = C.reconcileOxCheckBong({
            server: { oxChallengeChecked: '2026-11-26', oxChallengeDelta: 10, bong: 110 },
            client: stale, baseBong: 110, requestedBong: 100,
        });
        assert.equal(bonus.bong, 110);
        const pet = C.reconcileOxCheckBong({
            server: serverPenalty, client: stale, baseBong: 80, requestedBong: 100, petDelta: -2,
        });
        assert.equal(pet.bong, 78);
    });

    it('정산을 이미 아는 화면과 표식 없는 문서는 봉을 다시 계산하지 않아요', () => {
        const seen = { oxChallengeChecked: '2026-11-26', bong: 80 };
        assert.equal(C.reconcileOxCheckBong({
            server: serverPenalty, client: seen, baseBong: 80, requestedBong: 90, maxIncrease: 10,
        }), null);
        const seenByLog = { bongChangeLog: [{ source: 'oxChallengeCheck', date: '2026-11-26', delta: -20 }] };
        assert.equal(C.reconcileOxCheckBong({
            server: { bongChangeLog: seenByLog.bongChangeLog, bong: 80 },
            client: seenByLog, baseBong: 80, requestedBong: 90, maxIncrease: 10,
        }), null);
        assert.equal(C.reconcileOxCheckBong({
            server: { bong: 80 }, client: { bong: 100 }, baseBong: 80, requestedBong: 100,
        }), null);
        // 표식 없이 봉 기록만 있어도, 아직 그 기록을 모르는 저장은 깎인 봉을 지켜요.
        const fromLog = C.reconcileOxCheckBong({
            server: { bong: 80, bongChangeLog: serverPenalty.bongChangeLog },
            client: { bong: 100, bongChangeLog: [] },
            baseBong: 80,
            requestedBong: 100,
        });
        assert.equal(fromLog.bong, 80);
    });
});
