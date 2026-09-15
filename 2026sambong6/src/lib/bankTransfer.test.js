import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBankSaveBongDelta, walletCoversSpend } from './bankTransfer.js';

describe('은행 예금 잔액 검사', () => {
    it('입금 후 남은 지갑이 아니라 차감 전 지갑으로 부족 여부를 본다', () => {
        assert.equal(walletCoversSpend(100, 80), true);
        assert.equal(walletCoversSpend(100, 100), true);
        assert.equal(walletCoversSpend(40, 80), false);
        // 이미 80을 뺀 뒤 남은 20으로 다시 검사하면 거짓 부족이 됩니다.
        assert.equal(walletCoversSpend(20, 80), false);
        assert.equal(resolveBankSaveBongDelta({ bongDelta: -80 }, 20, 100), -80);
    });
});
