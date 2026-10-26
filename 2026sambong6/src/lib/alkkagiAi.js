/**
 * 알까기 AI(순수 함수, 브라우저·node 공용).
 *
 * - alkkagiPhysics.js로 후보 샷을 실제로 굴려 보고 점수를 매겨요.
 *   상대 알을 판 밖으로 밀어내면 크게 더하고, 내 알이 떨어지면 크게 빼요.
 *   판 가장자리에 걸린 상대 알은 조금 더하고, 내 알이 가장자리에 남으면 조금 빼요.
 * - 난이도: easy(쉬움)는 후보가 적고 크게 빗나가며, 좋은 수 몇 개 중에서 아무거나 골라요.
 *   normal(보통)은 후보가 더 많지만 꽤 빗나가요. hard(고수)는 후보가 많고, 조금 빗나가도 괜찮은 수를 골라요.
 * - 값은 모의 학생(각도 오차 sd 0.12, 120판)이 쉬움 약 75%·보통 약 50%·고수 약 25% 이기도록 맞췄어요.
 * - 끝까지 당기는 샷(힘 0.95 초과)은 사람과 같이 떨림 오차가 붙어요(alkkagiAim.js).
 * - 같은 판·같은 seed면 늘 같은 샷이에요. 시간 제한으로 끊지 않고 후보 수로 정해서
 *   기기가 느려도 결과가 같아요. 화면이 멈추지 않게 조금씩 나눠 계산할 수 있어요(runAlkkagiAiChunked).
 */
import { simulateAlkkagiShot, serializeAlkkagiShot, parseAlkkagiShot } from './alkkagiPhysics.js';
import { ALKKAGI_CONFIG, alkkagiOtherColor, alkkagiPhysicsState, sanitizeAlkkagiStones } from './alkkagiGame.js';
import { alkkagiAimAngle, alkkagiIsTrembling, alkkagiRng } from './alkkagiAim.js';

export const ALKKAGI_AI_LEVELS = Object.freeze(['easy', 'normal', 'hard']);

const LEVEL = Object.freeze({
    easy: { label: 'AI 쉬움', offsets: [0], powers: [0.62, 0.8, 0.94], pickTop: 6, angleErr: 0.22, powerErr: 0.22, robust: 0 },
    normal: { label: 'AI 보통', offsets: [0, -0.07, 0.07], powers: [0.6, 0.78, 0.94, 1], pickTop: 4, angleErr: 0.225, powerErr: 0.1, robust: 0 },
    hard: { label: 'AI 고수', offsets: [0, -0.05, 0.05, -0.11, 0.11], powers: [0.6, 0.8, 0.94, 1], pickTop: 2, angleErr: 0.11, powerErr: 0.06, robust: 6 },
});

export function sanitizeAlkkagiAiLevel(level) {
    return ALKKAGI_AI_LEVELS.includes(level) ? level : 'normal';
}

export function alkkagiAiLevelLabel(level) {
    return LEVEL[sanitizeAlkkagiAiLevel(level)].label;
}

function edgeDanger(s) {
    const W = ALKKAGI_CONFIG.width;
    const H = ALKKAGI_CONFIG.height;
    const d = Math.min(s.x, s.y, W - s.x, H - s.y);
    return Math.max(0, Math.min(1, 1 - d / 70));
}

/** 굴린 뒤 판을 보고 매기는 점수(쏜 색 기준). */
export function scoreAlkkagiOutcome(before, after, color) {
    const other = alkkagiOtherColor(color);
    const alive = (st, c) => st.filter((s) => s.alive && s.color === c).length;
    const oppOut = alive(before, other) - alive(after, other);
    const ownOut = alive(before, color) - alive(after, color);
    let score = oppOut * 100 - ownOut * 130;
    for (const s of after) {
        if (!s.alive) continue;
        if (s.color === other) score += edgeDanger(s) * 8;
        else score -= edgeDanger(s) * 10;
    }
    if (alive(after, other) === 0 && alive(after, color) > 0) score += 1000; // 이기는 수
    if (alive(after, color) === 0 && alive(after, other) > 0) score -= 1000; // 지는 수
    return score;
}

function simulate(start, cand) {
    const sim = simulateAlkkagiShot(start, cand);
    return sim.state.stones;
}

function listCandidates(stones, color, cfg) {
    const mine = stones.filter((s) => s.alive && s.color === color);
    const theirs = stones.filter((s) => s.alive && s.color !== color);
    const out = [];
    for (const s of mine) {
        for (const t of theirs) {
            const base = Math.atan2(t.y - s.y, t.x - s.x);
            for (const off of cfg.offsets) {
                for (const power of cfg.powers) out.push({ id: s.id, angle: base + off, power });
            }
        }
    }
    return out;
}

/**
 * 계산 본체(제너레이터). 후보를 하나 굴릴 때마다 yield해서 나눠 돌릴 수 있어요.
 * 돌려주는 값: { ok, shot(직렬화), id, angle, power, aim:{angle,power}, score, sims }
 */
export function* alkkagiAiSearch(stonesRaw, color, { level = 'normal', seed = 1 } = {}) {
    const lv = sanitizeAlkkagiAiLevel(level);
    const cfg = LEVEL[lv];
    const stones = sanitizeAlkkagiStones(stonesRaw);
    const start = alkkagiPhysicsState(stones);
    const before = start.stones;
    const rnd = alkkagiRng(seed);
    const cands = listCandidates(before, color, cfg);
    if (!cands.length) return { ok: false, error: 'no-move', sims: 0 };
    let sims = 0;
    const scored = [];
    for (let i = 0; i < cands.length; i += 1) {
        const c = cands[i];
        const after = simulate(start, c);
        sims += 1;
        scored.push({ ...c, i, score: scoreAlkkagiOutcome(before, after, color) });
        yield sims;
    }
    // 점수가 같으면 먼저 나온 후보(작은 i)를 써요.
    scored.sort((a, b) => b.score - a.score || a.i - b.i);
    if (cfg.robust > 0) {
        // 고수: 상위 몇 개를 조금 비틀어 굴려 보고, 흔들려도 괜찮은 수를 골라요.
        const top = scored.slice(0, cfg.robust);
        for (const c of top) {
            const spread = alkkagiIsTrembling(c.power) ? 0.04 : 0.02;
            let sum = c.score;
            for (const d of [-spread, spread]) {
                sum += scoreAlkkagiOutcome(before, simulate(start, { ...c, angle: c.angle + d }), color);
                sims += 1;
                yield sims;
            }
            c.robustScore = sum / 3;
        }
        top.sort((a, b) => b.robustScore - a.robustScore || a.i - b.i);
        scored.splice(0, top.length, ...top);
    }
    const pool = scored.slice(0, Math.max(1, Math.min(cfg.pickTop, scored.length)));
    const pick = pool[Math.floor(rnd() * pool.length) % pool.length];
    // 난이도만큼 사람처럼 빗나가요.
    const angle = pick.angle + (rnd() * 2 - 1) * cfg.angleErr;
    const power = Math.max(0.2, Math.min(1, pick.power * (1 + (rnd() * 2 - 1) * cfg.powerErr)));
    // 끝까지 당기면 사람과 같은 떨림 오차가 붙어요.
    const finalAngle = alkkagiAimAngle(angle, power, rnd);
    const shot = serializeAlkkagiShot({ id: pick.id, angle: finalAngle, power });
    const parsed = parseAlkkagiShot(shot, { state: start, color });
    if (!parsed.ok) return { ok: false, error: parsed.error, sims };
    return {
        ok: true,
        shot,
        id: pick.id,
        angle: parsed.shot.angle,
        power: parsed.shot.power,
        aim: { angle, power },
        /** 고른 수에서 실제로 빗나간 각도(난이도 오차 + 떨림 오차) */
        errAngle: parsed.shot.angle - pick.angle,
        score: pick.robustScore != null ? pick.robustScore : pick.score,
        sims,
        level: lv,
    };
}

/** 한 번에 끝까지 계산해요(테스트·node용). */
export function planAlkkagiAiShot(stones, color, opts = {}) {
    const it = alkkagiAiSearch(stones, color, opts);
    for (;;) {
        const r = it.next();
        if (r.done) return r.value;
    }
}

/**
 * 화면이 멈추지 않게 budgetMs씩 나눠 계산해요. 결과는 planAlkkagiAiShot과 똑같아요.
 * 돌려주는 값: { promise, cancel }
 */
export function runAlkkagiAiChunked(stones, color, opts = {}, {
    budgetMs = 6,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    schedule = (fn) => setTimeout(fn, 0),
} = {}) {
    const it = alkkagiAiSearch(stones, color, opts);
    let cancelled = false;
    let chunks = 0;
    const promise = new Promise((resolve) => {
        const run = () => {
            if (cancelled) return resolve({ ok: false, error: 'cancelled', chunks });
            chunks += 1;
            const t0 = now();
            for (;;) {
                const r = it.next();
                if (r.done) return resolve({ ...r.value, chunks });
                if (now() - t0 >= budgetMs) break;
            }
            schedule(run);
        };
        schedule(run);
    });
    return { promise, cancel: () => { cancelled = true; } };
}

/** AI 대전이 끝났을 때 한 줄 설명(나·AI 이름으로 자연스럽게). */
export function alkkagiAiEndText(game, { humanColor = 'black', level = 'normal' } = {}) {
    const g = game || {};
    const ai = alkkagiAiLevelLabel(level);
    const aiSubj = `${ai}${/[가-힣]$/.test(ai) && (ai.charCodeAt(ai.length - 1) - 0xac00) % 28 ? '이' : '가'}`;
    if (g.endReason === 'draw') return '마지막 알이 함께 떨어졌어요. 비겼어요.';
    if (!g.winner) return '';
    const iWon = g.winner === humanColor;
    if (g.endReason === 'forfeit') return iWon ? `${aiSubj} 기권해서 내가 이겼어요.` : `기권해서 ${aiSubj} 이겼어요.`;
    if (g.endReason === 'timeout') return iWon ? '시간이 다 돼서 내가 이겼어요.' : `시간이 다 돼서 ${aiSubj} 이겼어요.`;
    return iWon ? '내가 마지막 알까지 밀어냈어요!' : `${aiSubj} 마지막 알까지 밀어냈어요.`;
}

/** 결과 카드 제목 */
export function alkkagiAiResultTitle(game, { humanColor = 'black', level = 'normal' } = {}) {
    const g = game || {};
    if (g.endReason === 'draw') return '비겼어요';
    if (!g.winner) return '';
    return g.winner === humanColor ? '내가 이겼어요!' : `${alkkagiAiLevelLabel(level)} 승리!`;
}
