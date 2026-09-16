import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyNetworkError, isRetryableWriteError, withRetry } from './withRetry.js';

describe('저장 재시도', () => {
    it('트랜잭션 충돌은 다시 시도할 오류로 본다', () => {
        assert.equal(isRetryableWriteError({ code: 'aborted' }), true);
        assert.equal(isRetryableWriteError({ message: 'too much contention' }), true);
        assert.equal(isLikelyNetworkError({ code: 'aborted' }), false);
        assert.equal(isRetryableWriteError({ message: 'permission-denied' }), false);
    });

    it('retryIf로 지정한 오류만 다시 시도한다', async () => {
        let n = 0;
        const out = await withRetry(async () => {
            n += 1;
            if (n < 2) throw Object.assign(new Error('aborted'), { code: 'aborted' });
            return 'ok';
        }, { retries: 2, baseDelayMs: 10, retryIf: isRetryableWriteError });
        assert.equal(out, 'ok');
        assert.equal(n, 2);
    });
});
