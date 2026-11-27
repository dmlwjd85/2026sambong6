import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bankHistoryHtml, bankHistoryRows, bankHistoryStart, groupBankHistory } from './bankHistory.js';

const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi).getTime();

describe('은행 사용 기록', () => {
    const now = at(2026, 11, 27, 14, 0);
    const logs = [
        { at: at(2026, 11, 24, 9, 0), reason: '나흘 전', before: 0, after: 5, delta: 5 },
        { at: at(2026, 11, 25, 8, 30), reason: '퀘스트 완료: 출석', before: 0, after: 1, delta: 1 },
        { at: at(2026, 11, 26, 10, 38), reason: '은행 대출 상환', before: 0, after: -205, delta: -205, source: 'bankLoanRepay' },
        { at: at(2026, 11, 26, 10, 39), reason: '은행 대출', before: -205, after: -5, delta: 200, source: 'bankLoanTake' },
        { at: at(2026, 11, 27, 9, 0), reason: '변화 없음', before: 3, after: 3, delta: 0 },
        { at: at(2026, 11, 27, 9, 5), reason: '봉황 캐릭터 구매', before: 21, after: 2, source: 'skinPurchase' },
    ];
    it('오늘 포함 3일(25일 자정부터)만, 새것부터', () => {
        assert.equal(bankHistoryStart(now), at(2026, 11, 25, 0, 0));
        const rows = bankHistoryRows(logs, { nowMs: now });
        assert.deepEqual(rows.map((r) => r.reason), ['봉황 캐릭터 구매', '은행 대출', '은행 대출 상환', '퀘스트 완료: 출석']);
        assert.equal(rows[0].delta, -19);
        assert.equal(rows[1].categoryLabel, '대출');
        assert.equal(rows[0].categoryLabel, '소비');
    });
    it('날짜별 들어온·나간 합계', () => {
        const g = groupBankHistory(bankHistoryRows(logs, { nowMs: now }));
        assert.deepEqual(g.map((x) => x.ymd), ['2026-11-27', '2026-11-26', '2026-11-25']);
        assert.equal(g[1].in, 200);
        assert.equal(g[1].out, 205);
    });
    it('글자를 안전하게 그리고, 없으면 안내', () => {
        const html = bankHistoryHtml([{ at: now - 1000, reason: '<b>x</b>', before: 0, after: 1, delta: 1 }], { nowMs: now, fmt: (n) => `${n}봉` });
        assert.ok(html.includes('&lt;b&gt;x'));
        assert.ok(html.includes('+1봉'));
        assert.ok(bankHistoryHtml([], { nowMs: now }).includes('기록이 없어요'));
    });
});
