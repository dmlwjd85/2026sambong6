/**
 * 가벼운 모드 판단(순수 함수). 최근 프레임 시간(ms) 목록을 보고 정해요.
 * - 최근 30프레임 평균이 20ms 이상(약 50fps 아래)이거나
 * - 26ms 넘는 느린 프레임이 20% 이상이면 켜요.
 * 보통 60fps 기기에서 가끔 한두 번 늦는 정도로는 켜지지 않아요.
 */
export const ALKKAGI_PERF_WINDOW = 30;

export function alkkagiShouldGoLight(frameMs, { window = ALKKAGI_PERF_WINDOW, avgMs = 20, slowMs = 26, slowRatio = 0.2 } = {}) {
    if (!Array.isArray(frameMs) || frameMs.length < window) return false;
    const recent = frameMs.slice(-window).map((v) => Math.min(250, Math.max(0, Number(v) || 0)));
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const slow = recent.filter((v) => v > slowMs).length / recent.length;
    return avg >= avgMs || slow >= slowRatio;
}
