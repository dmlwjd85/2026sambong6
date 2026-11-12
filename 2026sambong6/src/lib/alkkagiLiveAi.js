/**
 * 실시간 알까기 AI 대전(순수 모듈, DOM·Firestore 없음).
 *
 * - 판 계산은 실시간 대전과 같은 세션(alkkagiLiveSession.js)을 내 기기에서 방장으로 돌려요.
 *   AI 샷은 상대 자리 문서처럼 세션에 넣어서(onSeatDoc) 5초 쿨다운·살아 있는 알 확인을 그대로 받아요.
 * - 어디에 쏠지는 턴제 AI(alkkagiAi.js)를 그대로 써요. 실시간이라 '언제 쏠지'만 여기서 정해요.
 *   쿨다운이 끝나면 난이도만큼 머뭇거렸다가 쏴요(쉬움은 느리게, 고수는 빠르게).
 *   알이 굴러가는 중이면 조금 더 기다렸다가, 너무 오래 기다리면 그냥 쏴요.
 * - 같은 seed면 늘 같은 머뭇거림이에요(테스트용).
 */
import { alkkagiRng } from './alkkagiAim.js';
import { runAlkkagiAiChunked, sanitizeAlkkagiAiLevel } from './alkkagiAi.js';

/** 난이도별 반응 시간(ms): 쿨다운이 끝난 뒤 [최소, 최대] 만큼 기다려요. moving: 알이 굴러가면 더 기다리는 최대 시간. */
export const ALKKAGI_LIVE_AI_TIMING = Object.freeze({
    easy: Object.freeze({ react: [2600, 4400], moving: 1800 }),
    normal: Object.freeze({ react: [1200, 2400], moving: 1200 }),
    hard: Object.freeze({ react: [300, 900], moving: 600 }),
});

/** 실패(빈 수·거절)했을 때 다시 생각하기까지 기다리는 시간 */
export const ALKKAGI_LIVE_AI_RETRY_MS = 900;

/**
 * @param {{ color: string, level?: string, seed?: number,
 *   submit: (shot: object, info: object) => void,
 *   plan?: (stones: any[], color: string, opts: object) => { promise: Promise<any>, cancel: () => void } }} opts
 */
export function createLiveAiDriver({ color, level = 'normal', seed = 1, submit, plan = runAlkkagiAiChunked } = {}) {
    const lv = sanitizeAlkkagiAiLevel(level);
    const timing = ALKKAGI_LIVE_AI_TIMING[lv];
    const rnd = alkkagiRng(Math.floor(Number(seed) || 1) || 1);
    let readyAt = null;
    let movingFrom = null;
    let job = null;
    let gen = 0;
    let shots = 0;
    let stopped = false;

    function reactMs() {
        const [lo, hi] = timing.react;
        return Math.round(lo + rnd() * (hi - lo));
    }

    /**
     * 화면 타이머마다 불러요.
     * view: { cooldownLeft(ms), moving, over, alive(내 알 수), oppAlive(상대 알 수), stones }
     */
    function tick(nowMs, view = {}) {
        const t = Number(nowMs) || 0;
        if (stopped || job) return 'busy';
        if (view.over || !view.alive || !view.oppAlive) { readyAt = null; return 'idle'; }
        if ((Number(view.cooldownLeft) || 0) > 0) { readyAt = null; movingFrom = null; return 'cooldown'; }
        if (readyAt == null) { readyAt = t + reactMs(); return 'waiting'; }
        if (t < readyAt) return 'waiting';
        if (view.moving) {
            if (movingFrom == null) movingFrom = t;
            if (t - movingFrom < timing.moving) return 'waiting';
        }
        start(t, view.stones || []);
        return 'thinking';
    }

    function start(t, stones) {
        const my = ++gen;
        const n = shots;
        job = plan(stones, color, { level: lv, seed: (Math.floor(Number(seed) || 1) + n * 7919) % 2147483647 || 1 });
        Promise.resolve(job.promise).then((r) => {
            if (my !== gen || stopped) return;
            job = null;
            movingFrom = null;
            if (!r || !r.ok || !r.shot) {
                readyAt = t + ALKKAGI_LIVE_AI_RETRY_MS;
                return;
            }
            shots += 1;
            readyAt = null;
            submit(r.shot, { id: r.id, power: r.power, level: lv });
        }, () => {
            if (my !== gen) return;
            job = null;
            readyAt = t + ALKKAGI_LIVE_AI_RETRY_MS;
        });
    }

    /** 샷이 거절됐을 때(알이 그사이 떨어졌을 때 등) 곧 다시 생각해요. */
    function retrySoon(nowMs) {
        readyAt = (Number(nowMs) || 0) + ALKKAGI_LIVE_AI_RETRY_MS;
    }

    function stop() {
        stopped = true;
        gen += 1;
        if (job && typeof job.cancel === 'function') job.cancel();
        job = null;
    }

    return {
        tick,
        stop,
        retrySoon,
        level: lv,
        shots: () => shots,
        isThinking: () => !!job,
    };
}
