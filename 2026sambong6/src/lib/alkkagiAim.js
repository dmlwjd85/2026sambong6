/**
 * 세게 당길 때의 흔들림(순수 함수).
 *
 * - 끝까지 당겨 알이 떨리는 구간(힘 0.95 초과)에서만 각도가 조금 빗나가요.
 * - 빗나가는 폭은 힘에 비례해요. 약하게 당기면 오차가 없어요.
 * - 쏘는 사람 기기에서 한 번만 정해서 serializeAlkkagiShot에 넣어 보내요.
 *   받는 쪽은 그 샷을 그대로 재생하고 다시 뽑지 않아요(그래서 두 화면 결과가 같아요).
 * - AI도 같은 규칙을 써요.
 */
import { serializeAlkkagiShot } from './alkkagiPhysics.js';

/** 이 힘을 넘으면 알이 떨려요(화면 떨림과 같은 기준). */
export const ALKKAGI_TREMBLE_PULL = 0.95;
/** 힘 1일 때 최대로 빗나가는 각도(라디안). 약 3.4도. */
export const ALKKAGI_AIM_SPREAD = 0.06;

export function alkkagiIsTrembling(power) {
    const p = Number(power);
    return Number.isFinite(p) && p > ALKKAGI_TREMBLE_PULL;
}

/** 이 힘에서 빗나갈 수 있는 최대 각도. 떨리지 않으면 0이에요. */
export function alkkagiAimSpread(power) {
    if (!alkkagiIsTrembling(power)) return 0;
    return ALKKAGI_AIM_SPREAD * Math.min(1, Number(power));
}

/**
 * 최종 각도. rnd는 0~1 난수 함수(기본 Math.random).
 * 두 번 뽑아 더해서 가운데에 더 자주 가고 끝으로 갈수록 드물어요.
 */
export function alkkagiAimAngle(angle, power, rnd = Math.random) {
    const a = Number(angle);
    const spread = alkkagiAimSpread(power);
    if (!spread || !Number.isFinite(a)) return a;
    const r = (Number(rnd()) || 0) + (Number(rnd()) || 0) - 1; // -1~1, 삼각 분포
    return a + Math.max(-1, Math.min(1, r)) * spread;
}

/** 쏘는 쪽에서 쓰는 최종 샷(직렬화). 떨림 오차가 이미 들어 있어요. */
export function alkkagiFinalShot({ id, angle, power } = {}, rnd = Math.random) {
    return serializeAlkkagiShot({ id, angle: alkkagiAimAngle(angle, power, rnd), power });
}

/** 같은 seed면 같은 수열이 나오는 난수(mulberry32). AI·테스트용이에요. */
export function alkkagiRng(seed = 1) {
    let s = (Math.floor(Number(seed)) || 0) >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
