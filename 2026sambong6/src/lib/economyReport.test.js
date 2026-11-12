import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ECONOMY_LEARNING_GOALS,
    buildEconomyFlowRows,
    buildEconomyGoalRows,
    buildEconomyReportRows,
    classifyBongLog,
    describeEconomyHabits,
    summarizeBongFlows,
    summarizeStudentEconomy,
} from './economyReport.js';

const saver = {
    id: '1',
    bong: 40,
    bankRegularSavings: 60,
    bankTermDeposits: [{ amount: 50, startDate: '2026-10-01' }],
    stockInvestments: {
        kospi: { principal: 30, buyIndex: 2500, openedAt: 1, openedDate: '2026-10-02' },
        nasdaq: { principal: 20, buyIndex: 18000, openedAt: 1, openedDate: '2026-10-02' },
    },
    bankLoan: { principal: 10, interest: 1, dueYmd: '2026-11-20' },
    conveniencePurchases: [{ name: '연필', price: 5 }],
    classEventPurchases: [{ name: '신청곡', price: 7 }],
    jobs: ['은행원'],
    questHistory: [{ id: 'q1' }, { id: 'q2' }],
    bongChangeLog: [
        { reason: '퀘스트 완료: 숙제', delta: 10 },
        { reason: '편의점 구매', delta: -5 },
        { reason: '일반예금 입금', delta: -20 },
        { reason: '코스피 매수', delta: -30 },
        { reason: '송금', delta: -3, source: 'bankTransferOut' },
        { reason: '모자 환불', delta: 4, source: 'itemRefund' },
        { reason: '은행 대출', delta: 10, source: 'bankLoanTake' },
        { reason: '알 수 없음', delta: 0 },
    ],
};

describe('경제활동 리포트', () => {
    it('봉 기록을 source 우선, 사유 글자로 분류한다', () => {
        assert.equal(classifyBongLog({ source: 'bankTransferIn', reason: '퀘스트' }), 'transfer');
        assert.equal(classifyBongLog({ source: 'bankLoanRepay' }), 'loan');
        assert.equal(classifyBongLog({ reason: '보물상자 적금 만기' }), 'saving');
        assert.equal(classifyBongLog({ reason: '나스닥 일부 매도' }), 'investing');
        assert.equal(classifyBongLog({ reason: '부동산 구매' }), 'investing');
        assert.equal(classifyBongLog({ reason: '방패 구매' }), 'spending');
        assert.equal(classifyBongLog({ reason: '퀘스트 완료: 청소' }), 'income');
        assert.equal(classifyBongLog({ reason: '저장' }), 'other');
        assert.equal(classifyBongLog(null), 'other');
    });

    it('분류별 들어온·나간 봉을 모으고 0 변동은 건너뛴다', () => {
        const f = summarizeBongFlows(saver.bongChangeLog);
        assert.deepEqual(f.income, { in: 10, out: 0, count: 1 });
        assert.deepEqual(f.spending, { in: 0, out: 5, count: 1 });
        assert.deepEqual(f.saving, { in: 0, out: 20, count: 1 });
        assert.deepEqual(f.investing, { in: 0, out: 30, count: 1 });
        assert.deepEqual(f.transfer, { in: 0, out: 3, count: 1 });
        assert.deepEqual(f.refund, { in: 4, out: 0, count: 1 });
        assert.deepEqual(f.loan, { in: 10, out: 0, count: 1 });
        assert.equal(f.other.count, 0);
    });

    it('before/after만 있는 기록도 변동을 계산한다', () => {
        const f = summarizeBongFlows([{ reason: '퀘스트 완료', before: 5, after: 12 }]);
        assert.equal(f.income.in, 7);
    });

    it('학생 자산·비중·구매를 계산한다', () => {
        const s = summarizeStudentEconomy(saver, { todayYmd: '2026-11-12' });
        assert.equal(s.wallet, 40);
        assert.equal(s.savings, 110);
        assert.equal(s.stockPrincipal, 50);
        assert.equal(s.stockMarkets, 2);
        assert.equal(s.loanOwed, 11);
        assert.equal(s.grossAssets, 200);
        assert.equal(s.netWorth, 189);
        assert.equal(s.savingShare, 55);
        assert.equal(s.investShare, 25);
        assert.equal(s.purchaseCount, 2);
        assert.equal(s.purchaseSpend, 12);
        assert.equal(s.creditLimited, false);
    });

    it('잘못된 투자 포지션과 빈 문서를 안전하게 다룬다', () => {
        const s = summarizeStudentEconomy({ stockInvestments: { kospi: { principal: 99999, buyIndex: 1 } } });
        assert.equal(s.stockPrincipal, 0);
        assert.equal(s.grossAssets, 0);
        assert.equal(s.savingShare, 0);
        const empty = summarizeStudentEconomy(null);
        assert.equal(empty.netWorth, 0);
        assert.deepEqual(describeEconomyHabits(empty), ['기록된 경제활동이 아직 적음']);
    });

    it('신용 제한은 종료일이 오늘 이후일 때만 표시한다', () => {
        assert.equal(summarizeStudentEconomy({ creditDefaultUntilYmd: '2026-11-15' }, { todayYmd: '2026-11-12' }).creditLimited, true);
        assert.equal(summarizeStudentEconomy({ creditDefaultUntilYmd: '2026-11-01' }, { todayYmd: '2026-11-12' }).creditLimited, false);
    });

    it('관찰 문구는 기록된 사실만 말한다', () => {
        const notes = describeEconomyHabits(summarizeStudentEconomy(saver, { todayYmd: '2026-11-12' }));
        assert.ok(notes.includes('자산의 55%를 예금·적금으로 관리함'));
        assert.ok(notes.includes('2개 지수에 나누어 투자함'));
        assert.ok(notes.includes('대출 11B 상환 중'));
        assert.ok(notes.includes('친구와 이체 1건'));
    });

    it('학생별 시트는 헤더 + 명단 순서대로 만든다', () => {
        const rows = buildEconomyReportRows({
            students: [saver, { id: '2', bong: 5 }],
            studentIds: ['2', '1', '3'],
            getName: (sid) => ({ 1: '가', 2: '나' }[sid] || ''),
            todayYmd: '2026-11-12',
        });
        assert.equal(rows.length, 4);
        assert.equal(rows[0][0], '학번');
        assert.equal(rows[0].length, rows[1].length);
        assert.deepEqual(rows.slice(1).map((r) => r[0]), ['2', '1', '3']);
        assert.equal(rows[2][1], '가');
        assert.equal(rows[3][1], '3');
        assert.equal(rows[2][6], 189);
    });

    it('학급 흐름 시트는 분류마다 한 줄', () => {
        const rows = buildEconomyFlowRows({ students: [saver, saver], studentIds: ['1'] });
        const income = rows.find((r) => String(r[0]).startsWith('소득'));
        assert.deepEqual(income.slice(1), [20, 0, 2]);
    });

    it('학습 목표 시트는 성취기준 칸을 비워 둔다', () => {
        const rows = buildEconomyGoalRows();
        assert.equal(rows.length, ECONOMY_LEARNING_GOALS.length + 1);
        rows.slice(1).forEach((r) => assert.equal(r[4], ''));
    });
});
