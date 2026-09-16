/**
 * 네트워크/비동기 작업 재시도 유틸
 * Firestore·저장 실패 시 지수 백오프로 몇 회 재시도합니다.
 */

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isLikelyNetworkError(err) {
    if (!err) return false;
    const code = String(err.code || '').toLowerCase();
    const msg = String(err.message || err || '').toLowerCase();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return (
        code.includes('unavailable')
        || code.includes('deadline')
        || code.includes('network')
        || msg.includes('network')
        || msg.includes('offline')
        || msg.includes('failed to fetch')
        || msg.includes('timeout')
    );
}

/** 동시 쓰기·잠깐 끊김으로 트랜잭션이 깨진 경우도 다시 시도합니다. */
export function isRetryableWriteError(err) {
    if (isLikelyNetworkError(err)) return true;
    const code = String(err.code || '').toLowerCase();
    const msg = String(err.message || err || '').toLowerCase();
    return (
        code.includes('aborted')
        || code.includes('failed-precondition')
        || msg.includes('aborted')
        || msg.includes('contention')
        || msg.includes('too much contention')
    );
}

/**
 * @param {() => Promise<any>} fn
 * @param {{ retries?: number, baseDelayMs?: number, label?: string, onRetry?: (n, err) => void }} [opts]
 */
export async function withRetry(fn, opts = {}) {
    const retries = Math.max(0, Number(opts.retries) || 2);
    const baseDelayMs = Math.max(100, Number(opts.baseDelayMs) || 500);
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const retryIf = typeof opts.retryIf === 'function' ? opts.retryIf : isLikelyNetworkError;
            const canRetry = attempt < retries && retryIf(err);
            if (!canRetry) throw err;
            if (typeof opts.onRetry === 'function') opts.onRetry(attempt + 1, err);
            await sleep(baseDelayMs * (attempt + 1));
        }
    }
    throw lastErr;
}
