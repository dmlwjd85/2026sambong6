import { applyAlkkagiShot, cloneAlkkagiState, createAlkkagiState, stepAlkkagi } from './alkkagiPhysics.js';
import { initialAlkkagiStones } from './alkkagiGame.js';

/**
 * 가벼운 모드 판단(순수 함수). 프레임 시간(ms) 묶음 하나를 보고 '느린 묶음'인지 정해요.
 * - 12프레임(60fps면 0.2초) 가운데 가장 느린 한 프레임을 뺀 평균이 21ms 이상(약 48fps 아래)이거나
 * - 26ms 넘는 느린 프레임이 25% 이상이면 느린 묶음이에요.
 * 실제로 켜는 건 createAlkkagiLightProbe가 정해요(느린 묶음이 연달아 두 번일 때만).
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

/**
 * 판을 처음 띄운 뒤 '가만히 있는 판'의 프레임만 잠깐 재서 가벼운 모드를 정해요.
 * - 알이 굴러가거나 당기는 중인 프레임은 넣지 않아요(그 묶음은 버리고 다시 모아요).
 * - 처음 몇 프레임과 탭을 다시 열거나 크기가 바뀐 바로 뒤 몇 프레임은 튀는 값이라 건너뛰어요.
 * - 가만히 있는 판은 그리는 일이 적어 느린 기기도 화면 간격만으로는 티가 안 나요.
 *   그래서 잴 때마다 알 굴리기 계산을 정해진 만큼(alkkagiProbeWork) 해 보고 걸린 시간(workMs)도 봐요.
 *   묶음은 화면 간격이 느리거나(alkkagiShouldGoLight) 계산 시간의 평균(가장 느린 하나 뺌)이 5ms 이상이면 느린 묶음이에요.
 * - 12프레임 묶음이 연달아 두 번 느릴 때만 켜요. 묶음을 정해진 만큼 다 재면 더 재지 않아요.
 * - 결과는 기억해 두지 않아요(그 판·그 화면에서만 써요).
 * push(ms, { busy, workMs }) → 'light'(지금 켜요) | null
 * measuring: 건너뛰는 프레임이 끝나 실제로 모으는 중인지
 */
export const ALKKAGI_PROBE_WARMUP = 6;
export const ALKKAGI_PROBE_WINDOWS = 4;
export const ALKKAGI_PROBE_NEED = 2;
export const ALKKAGI_PROBE_WORK_MS = 5;
export const ALKKAGI_PROBE_STEPS = 1500;

function trimmedAvg(list) {
    const sorted = list.map((v) => Math.min(250, Math.max(0, Number(v) || 0))).sort((a, b) => a - b).slice(0, -1);
    return sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
}

let probeBase = null;
/** 기기 빠르기를 재는 정해진 계산: 첫 배치에서 한가운데 알을 세게 쏜 장면을 steps걸음 굴려요. 걸린 ms를 돌려줘요. */
export function alkkagiProbeWork(steps = ALKKAGI_PROBE_STEPS) {
    const t0 = performance.now();
    if (!probeBase) probeBase = createAlkkagiState({ stones: initialAlkkagiStones() });
    let s = null;
    let left = 0;
    for (let i = 0; i < steps; i += 1) {
        if (!s || left <= 0) {
            s = cloneAlkkagiState(probeBase);
            applyAlkkagiShot(s, { id: 'b3', angle: -Math.PI / 2, power: 0.9 });
            left = 240;
        }
        stepAlkkagi(s);
        left -= 1;
    }
    return performance.now() - t0;
}

export function createAlkkagiLightProbe({
    window = ALKKAGI_PERF_WINDOW,
    warmup = ALKKAGI_PROBE_WARMUP,
    windows = ALKKAGI_PROBE_WINDOWS,
    need = ALKKAGI_PROBE_NEED,
    workMs: workSlowMs = ALKKAGI_PROBE_WORK_MS,
} = {}) {
    let skip = warmup;
    let cur = [];
    let work = [];
    let left = windows;
    let streak = 0;
    let done = false;
    return {
        get done() { return done; },
        get measuring() { return !done && skip <= 0; },
        /** 탭 전환·크기 바뀜 뒤: 튀는 프레임을 건너뛰고 모으던 묶음을 버려요. */
        settle() {
            if (done) return;
            skip = warmup;
            cur = [];
            work = [];
            streak = 0;
        },
        push(ms, { busy = false, workMs = null } = {}) {
            if (done) return null;
            if (busy) { cur = []; work = []; return null; }
            if (skip > 0) { skip -= 1; return null; }
            cur.push(ms);
            if (Number.isFinite(workMs)) work.push(workMs);
            if (cur.length < window) return null;
            const slow = alkkagiShouldGoLight(cur, { window })
                || (work.length >= window && trimmedAvg(work) >= workSlowMs);
            cur = [];
            work = [];
            left -= 1;
            streak = slow ? streak + 1 : 0;
            if (streak >= need) { done = true; return 'light'; }
            if (left <= 0) done = true;
            return null;
        },
    };
}

/** 예전에 쓰던 '사흘 기억' 키예요. 이제 읽지 않고 남아 있으면 지우기만 해요. */
export const ALKKAGI_OLD_LIGHT_KEY = 'sambong_alk_light_until';
