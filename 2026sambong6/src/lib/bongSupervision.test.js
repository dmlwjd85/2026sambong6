import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBongSupervisionExcluded, supervisionCountableDelta } from './bongSupervision.js';

describe('금융감독 획득', () => {
    it('예금 출금과 대출 상환은 획득이 아니다', () => {
        assert.equal(isBongSupervisionExcluded({
            reason: '일반예금 전액 출금', delta: 300, source: 'saveDataToCloud',
        }), true);
        assert.equal(supervisionCountableDelta({
            reason: '일반예금 출금', delta: 300,
        }), 0);
        assert.equal(supervisionCountableDelta({
            reason: '저장', delta: 300, source: 'bankRegular',
        }), 0);
        assert.equal(supervisionCountableDelta({
            reason: '대출 만기 상환', delta: 50, source: 'saveDataToCloud',
        }), 0);
        assert.equal(supervisionCountableDelta({
            reason: '은행 대출 상환', delta: 91, source: 'bankLoanRepay',
        }), 0);
    });

    it('지수에서 돌려받은 원금은 빼고 이익만 센다', () => {
        assert.equal(supervisionCountableDelta({
            reason: '코스피 전부 팔기', delta: 508, source: 'stockSell', principal: 500, profit: 8,
        }), 8);
        assert.equal(supervisionCountableDelta({
            reason: '코스닥 일부 팔기', delta: 500, principal: 500, profit: 0,
        }), 0);
        assert.equal(supervisionCountableDelta({
            reason: '퀘스트 완료', delta: 30, source: 'saveDataToCloud',
        }), 30);
    });
});
