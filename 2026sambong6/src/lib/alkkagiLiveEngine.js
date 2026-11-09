/**
 * 실시간 알까기 판 엔진(순수 모듈, DOM·Firestore 없음).
 *
 * - 고정 dt(alkkagiPhysics의 1/120초) 스텝을 실제 시계에 맞춰 돌려요. 화면 프레임 수와 상관없이 결과가 같아요.
 * - 알이 움직이는 중에도 샷을 넣을 수 있어요(그 알의 속도만 새로 정해요).
 * - 호스트는 이 엔진 하나가 판의 정답이에요. 게스트는 같은 엔진으로 예측하고, 호스트 스냅샷이 오면 그대로 맞춰요(adopt).
 * 물리 함수는 alkkagiPhysics.js를 읽어서 쓰기만 해요.
 */

import { ALKKAGI_DT, applyAlkkagiShot, createAlkkagiState, isAlkkagiResting, parseAlkkagiShot, stepAlkkagi } from './alkkagiPhysics.js';
import { ALKKAGI_CONFIG } from './alkkagiGame.js';
import { sanitizeLiveStones } from './alkkagiLiveGame.js';

export const ALKKAGI_LIVE_DT_MS = ALKKAGI_DT * 1000;
/** 한 번에 따라잡는 최대 스텝(약 2초). 탭이 오래 멈췄다 돌아오면 남은 시간은 버려요. */
export const ALKKAGI_LIVE_MAX_CATCHUP = 240;

function toState(stones, step) {
    const st = createAlkkagiState({ stones: sanitizeLiveStones(stones), config: ALKKAGI_CONFIG });
    st.step = Math.max(0, Math.floor(Number(step) || 0));
    return st;
}

export function liveStonesOf(state) {
    return state.stones.map((s) => ({ id: s.id, color: s.color, x: s.x, y: s.y, vx: s.vx, vy: s.vy, alive: s.alive }));
}

export function createLiveEngine({ stones, step = 0, now = 0 } = {}) {
    let state = toState(stones, step);
    let simMs = Number(now) || 0;

    function advance(nowMs, { maxCatchup = ALKKAGI_LIVE_MAX_CATCHUP } = {}) {
        const t = Number(nowMs) || 0;
        const hits = [];
        const outs = [];
        let rested = false;
        if (isAlkkagiResting(state)) {
            simMs = Math.max(simMs, t);
            return { hits, outs, rested, steps: 0, moving: false };
        }
        let n = Math.floor((t - simMs) / ALKKAGI_LIVE_DT_MS);
        if (n <= 0) return { hits, outs, rested, steps: 0, moving: true };
        if (n > maxCatchup) {
            simMs = t - maxCatchup * ALKKAGI_LIVE_DT_MS;
            n = maxCatchup;
        }
        let done = 0;
        for (let i = 0; i < n; i += 1) {
            const before = state;
            const r = stepAlkkagi(before, ALKKAGI_DT);
            state = r.state;
            simMs += ALKKAGI_LIVE_DT_MS;
            done += 1;
            if (r.hits.length || r.outs.length) {
                const vb = new Map(before.stones.map((s) => [s.id, s]));
                for (const [ia, ib] of r.hits) {
                    const a = vb.get(ia);
                    const b = vb.get(ib);
                    const na = state.stones.find((s) => s.id === ia);
                    const nb = state.stones.find((s) => s.id === ib);
                    if (!a || !b || !na || !nb) continue;
                    const dvx = a.vx - b.vx;
                    const dvy = a.vy - b.vy;
                    hits.push({ a: ia, b: ib, x: (na.x + nb.x) / 2, y: (na.y + nb.y) / 2, rel: Math.sqrt(dvx * dvx + dvy * dvy), step: state.step });
                }
                for (const id of r.outs) {
                    const s = vb.get(id);
                    const ns = state.stones.find((x) => x.id === id);
                    if (s && ns) outs.push({ id, color: s.color, x: ns.x, y: ns.y, vx: s.vx, vy: s.vy, step: state.step });
                }
            }
            if (isAlkkagiResting(state)) {
                rested = true;
                simMs = t;
                break;
            }
        }
        return { hits, outs, rested, steps: done, moving: !isAlkkagiResting(state) };
    }

    /** 샷(serializeAlkkagiShot 결과)을 지금 판에 넣어요. color를 주면 그 색 알만 돼요. */
    function applyShot(rawShot, { color = '', nowMs = null } = {}) {
        if (nowMs != null) advance(nowMs);
        const parsed = parseAlkkagiShot(rawShot, { state, color });
        if (!parsed.ok) return { ok: false, error: parsed.error === 'not-your-stone' ? 'not_your_stone' : 'not_alive' };
        const wasResting = isAlkkagiResting(state);
        const r = applyAlkkagiShot(state, parsed.shot);
        if (!r.ok) return { ok: false, error: 'not_alive' };
        state = r.state;
        if (wasResting && nowMs != null) simMs = Number(nowMs) || simMs;
        return { ok: true, error: '', power: parsed.shot.power, id: parsed.shot.id };
    }

    /** 호스트 스냅샷으로 맞춰요. 화면 보정용으로 바뀌기 전 좌표와 새로 빠진 알을 돌려줘요. */
    function adopt(stones, { step = null, nowMs = 0 } = {}) {
        const before = new Map(state.stones.map((s) => [s.id, s]));
        state = toState(stones, step == null ? state.step : step);
        simMs = Number(nowMs) || simMs;
        const fell = [];
        const revived = [];
        for (const s of state.stones) {
            const b = before.get(s.id);
            if (!b) continue;
            if (b.alive && !s.alive) fell.push({ id: s.id, color: s.color, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
            if (!b.alive && s.alive) revived.push(s.id);
        }
        return { before, fell, revived };
    }

    return {
        advance,
        applyShot,
        adopt,
        stones: () => liveStonesOf(state),
        state: () => state,
        step: () => state.step,
        isResting: () => isAlkkagiResting(state),
        aliveCount: (color) => state.stones.filter((s) => s.alive && s.color === color).length,
        simMs: () => simMs,
    };
}
