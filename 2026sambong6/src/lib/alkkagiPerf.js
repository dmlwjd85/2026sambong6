/**
 * 가벼운 모드 판단(순수 함수). 최근 프레임 시간(ms) 목록을 보고 정해요.
 * - 최근 12프레임(60fps면 0.2초) 가운데 가장 느린 한 프레임을 뺀 평균이 21ms 이상(약 48fps 아래)이거나
 * - 26ms 넘는 느린 프레임이 25% 이상이면 켜요.
 * 프레임은 알이 움직일 때뿐 아니라 알을 당기는 동안에도 모아요. 그래서 느린 기기는 첫 샷 전에 바뀌어요.
 * 보통 60fps 기기에서 가끔 한두 번 늦는 정도로는 켜지지 않아요.
 */
export const ALKKAGI_PERF_WINDOW = 12;

export function alkkagiShouldGoLight(frameMs, { window = ALKKAGI_PERF_WINDOW, avgMs = 21, slowMs = 26, slowRatio = 0.25 } = {}) {
    if (!Array.isArray(frameMs) || frameMs.length < window) return false;
    const recent = frameMs.slice(-window).map((v) => Math.min(250, Math.max(0, Number(v) || 0)));
    const sorted = recent.slice().sort((a, b) => a - b);
    const trimmed = sorted.slice(0, -1);
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    const slow = recent.filter((v) => v > slowMs).length / recent.length;
    return avg >= avgMs || slow >= slowRatio;
}

/** 한 번 느렸던 기기는 사흘 동안 처음부터 가벼운 모드로 시작해요. */
export const ALKKAGI_LIGHT_KEY = 'sambong_alk_light_until';
export const ALKKAGI_LIGHT_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

export function alkkagiLightRemembered(raw, now) {
    const until = Number(raw);
    return Number.isFinite(until) && until > now;
}
