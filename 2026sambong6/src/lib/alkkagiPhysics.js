/**
 * 알까기 순수 물리 모듈 (DOM·Math.random 없음).
 *
 * - 고정 dt(기본 1/120초) 스텝. 화면은 advanceAlkkagi(누산기) + interpolateAlkkagi(보간)로 그립니다.
 * - 마찰: 쿨롱식 일정 감속(|v| -= decel·dt), stopSpeed 미만이면 정지.
 * - 충돌: 원-원 충격량(질량·반발계수) + 겹침 위치 보정.
 * - 터널링 방지: 한 서브스텝 최대 이동량이 가장 작은 반지름의 절반 이하가 되도록 서브스텝을 나눕니다.
 * - 판 밖: 알 중심이 판(0..width, 0..height)을 벗어나면 탈락(alive=false).
 * - 결정성: id 순 처리, 매 스텝 결과를 ALKKAGI_DECIMALS 자리로 반올림, 샷은 1/10000 정수로 양자화.
 *   기기마다 결과가 다를 수 있는 Math.hypot은 쓰지 않습니다(sqrt는 IEEE로 정확히 반올림됨).
 *   cos/sin의 마지막 자리 차이는 반올림으로 흡수하고, 그래도 다르면 친 사람이 확정한 좌표를 정답으로 씁니다.
 *
 * 입력은 shot(id, angle, power)입니다. power는 0..1, 상한 ALKKAGI_MAX_POWER로 잘립니다.
 * 선생님 요청에 따라 조준선·힘 게이지·예상 경로·숫자는 화면에 표시하지 않습니다.
 * (각도와 힘은 손가락을 당긴 방향·거리에서 계산해 이 모듈에만 넘깁니다.)
 */

export const ALKKAGI_DT = 1 / 120;
export const ALKKAGI_DECIMALS = 6;
export const ALKKAGI_MAX_POWER = 1;
export const ALKKAGI_MAX_STEPS = 120 * 30; // 30초 상한
export const ALKKAGI_MAX_FRAME_SEC = 0.25; // 누산기 상한: 큰 끊김은 버리고(시간이 늦게 흐름) 결과는 그대로
export const ALKKAGI_MAX_STEPS_PER_FRAME = 30; // 한 프레임에 도는 스텝 상한(화면은 프레임을 떨어뜨려도 됨)
export const ALKKAGI_SHOT_SCALE = 10000; // 각도(라디안)·힘을 1/10000 단위 정수로 맞춤
export const ALKKAGI_SHOT_VERSION = 1;

export const ALKKAGI_DEFAULTS = Object.freeze({
    width: 400,
    height: 400,
    radius: 14,
    mass: 1,
    restitution: 0.9,
    frictionDecel: 260, // px/s², μ·g
    stopSpeed: 2, // px/s
    maxShotSpeed: 1400, // power=1 일 때 px/s
    slop: 0.01,
    correction: 0.8,
    iterations: 2,
});

const P = 10 ** ALKKAGI_DECIMALS;
const round = (v) => {
    const r = Math.round(v * P) / P;
    return Object.is(r, -0) ? 0 : r;
};
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function cfgOf(state) {
    return state.config;
}

/** 새 판 상태를 만듭니다. stones: [{ id, x, y, color, radius?, mass? }] */
export function createAlkkagiState({ stones = [], config = {} } = {}) {
    const c = Object.freeze({ ...ALKKAGI_DEFAULTS, ...config });
    const list = stones
        .map((s) => ({
            id: String(s.id),
            color: s.color || '',
            x: round(Number(s.x) || 0),
            y: round(Number(s.y) || 0),
            vx: round(Number(s.vx) || 0),
            vy: round(Number(s.vy) || 0),
            radius: Number(s.radius) > 0 ? Number(s.radius) : c.radius,
            mass: Number(s.mass) > 0 ? Number(s.mass) : c.mass,
            alive: s.alive !== false,
        }))
        .sort(byId);
    return { config: c, stones: list, step: 0 };
}

export function cloneAlkkagiState(state) {
    return { config: state.config, stones: state.stones.map((s) => ({ ...s })), step: state.step };
}

export function clampAlkkagiPower(power) {
    const p = Number(power);
    if (!Number.isFinite(p) || p <= 0) return 0;
    return Math.min(p, ALKKAGI_MAX_POWER);
}

/** 각도를 (-π, π]로 맞추고 각도·힘을 1/ALKKAGI_SHOT_SCALE 단위로 반올림합니다. 양쪽 기기가 같은 값을 쓰게 합니다. */
export function quantizeAlkkagiShot({ id, angle, power } = {}) {
    let a = Number(angle);
    if (!Number.isFinite(a)) return null;
    const TAU = 2 * Math.PI;
    a = ((a % TAU) + TAU) % TAU;
    if (a > Math.PI) a -= TAU;
    const ai = Math.round(a * ALKKAGI_SHOT_SCALE);
    const pi = Math.round(clampAlkkagiPower(power) * ALKKAGI_SHOT_SCALE);
    return { id: String(id), angle: ai / ALKKAGI_SHOT_SCALE, power: pi / ALKKAGI_SHOT_SCALE, ai, pi };
}

/** 알 하나에 초기 속도를 줍니다. angle은 라디안(0=+x, y축은 화면 아래가 +). */
export function applyAlkkagiShot(state, { id, angle, power } = {}) {
    const next = cloneAlkkagiState(state);
    const s = next.stones.find((t) => t.id === String(id));
    if (!s || !s.alive) return { state: next, ok: false, error: 'invalid-stone' };
    const q = quantizeAlkkagiShot({ id, angle, power });
    if (!q) return { state: next, ok: false, error: 'invalid-angle' };
    const a = q.angle;
    const speed = q.power * cfgOf(next).maxShotSpeed;
    s.vx = round(Math.cos(a) * speed);
    s.vy = round(Math.sin(a) * speed);
    return { state: next, ok: true, error: '' };
}

export function isAlkkagiResting(state) {
    return state.stones.every((s) => !s.alive || (s.vx === 0 && s.vy === 0));
}

function substepCount(stones, dt) {
    let maxSpeed = 0;
    let minR = Infinity;
    for (const s of stones) {
        if (!s.alive) continue;
        maxSpeed = Math.max(maxSpeed, Math.sqrt(s.vx * s.vx + s.vy * s.vy));
        minR = Math.min(minR, s.radius);
    }
    if (!Number.isFinite(minR) || maxSpeed === 0) return 1;
    return Math.max(1, Math.ceil((maxSpeed * dt) / (minR * 0.5)));
}

function applyFriction(s, h, c) {
    const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (sp === 0) return;
    const ns = sp - c.frictionDecel * h;
    if (ns < c.stopSpeed) {
        s.vx = 0;
        s.vy = 0;
        return;
    }
    const k = ns / sp;
    s.vx *= k;
    s.vy *= k;
}

/** 겹친 상태에서 상대속도로 접촉 순간까지 되돌려 본 충돌 법선(연속 충돌 근사). */
function contactNormal(dx, dy, rvx, rvy, rr, h, fx, fy) {
    const vv = rvx * rvx + rvy * rvy;
    if (vv === 0) return [fx, fy];
    const dv = dx * rvx + dy * rvy;
    const disc = dv * dv - vv * (dx * dx + dy * dy - rr * rr);
    if (disc < 0) return [fx, fy];
    const t = Math.min((dv + Math.sqrt(disc)) / vv, h);
    if (!(t > 0)) return [fx, fy];
    const cx = dx - rvx * t;
    const cy = dy - rvy * t;
    const cl = Math.sqrt(cx * cx + cy * cy);
    return cl > 0 ? [cx / cl, cy / cl] : [fx, fy];
}

function resolvePair(a, b, c, h) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const rr = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    let d = Math.sqrt(d2);
    let nx;
    let ny;
    if (d === 0) {
        nx = 1;
        ny = 0;
        d = 0;
    } else {
        nx = dx / d;
        ny = dy / d;
    }
    const ia = 1 / a.mass;
    const ib = 1 / b.mass;
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    let hit = false;
    if (rvx * nx + rvy * ny < 0) {
        const [cx, cy] = contactNormal(dx, dy, rvx, rvy, rr, h, nx, ny);
        const vn = rvx * cx + rvy * cy;
        const j = vn < 0 ? (-(1 + c.restitution) * vn) / (ia + ib) : 0;
        a.vx -= j * ia * cx;
        a.vy -= j * ia * cy;
        b.vx += j * ib * cx;
        b.vy += j * ib * cy;
        hit = true;
    }
    const pen = rr - d;
    const corr = (Math.max(pen - c.slop, 0) / (ia + ib)) * c.correction;
    a.x -= corr * ia * nx;
    a.y -= corr * ia * ny;
    b.x += corr * ib * nx;
    b.y += corr * ib * ny;
    return hit;
}

/** 고정 dt 한 스텝. 새 상태와 이번 스텝 이벤트(hits, outs)를 돌려줍니다. */
export function stepAlkkagi(state, dt = ALKKAGI_DT) {
    const next = cloneAlkkagiState(state);
    const c = cfgOf(next);
    const stones = next.stones; // id 순 정렬 유지
    const n = substepCount(stones, dt);
    const h = dt / n;
    const hits = [];
    const outs = [];
    for (let k = 0; k < n; k += 1) {
        for (const s of stones) {
            if (!s.alive) continue;
            applyFriction(s, h, c);
            s.x += s.vx * h;
            s.y += s.vy * h;
        }
        for (let it = 0; it < c.iterations; it += 1) {
            for (let i = 0; i < stones.length; i += 1) {
                const a = stones[i];
                if (!a.alive) continue;
                for (let j = i + 1; j < stones.length; j += 1) {
                    const b = stones[j];
                    if (!b.alive) continue;
                    if (resolvePair(a, b, c, h) && it === 0) hits.push([a.id, b.id]);
                }
            }
        }
        for (const s of stones) {
            if (!s.alive) continue;
            if (s.x < 0 || s.x > c.width || s.y < 0 || s.y > c.height) {
                s.alive = false;
                s.vx = 0;
                s.vy = 0;
                outs.push(s.id);
            }
        }
    }
    for (const s of stones) {
        s.x = round(s.x);
        s.y = round(s.y);
        s.vx = round(s.vx);
        s.vy = round(s.vy);
    }
    next.step = state.step + 1;
    return { state: next, hits, outs };
}

/** shot을 넣고 멈출 때까지(또는 maxSteps) 돌립니다. */
export function simulateAlkkagiShot(state, shot, { maxSteps = ALKKAGI_MAX_STEPS, dt = ALKKAGI_DT } = {}) {
    const res = applyAlkkagiShot(state, shot);
    if (!res.ok) return { state: res.state, steps: 0, outs: [], hits: 0, ok: false, error: res.error, capped: false };
    let cur = res.state;
    const outs = [];
    let hits = 0;
    let steps = 0;
    while (steps < maxSteps && !isAlkkagiResting(cur)) {
        const r = stepAlkkagi(cur, dt);
        cur = r.state;
        outs.push(...r.outs);
        hits += r.hits.length;
        steps += 1;
    }
    return { state: cur, steps, outs, hits, ok: true, error: '', capped: !isAlkkagiResting(cur) };
}

/** 화면 루프용 누산기. sim: { state, prev, acc }. frameSec만큼 고정 dt 스텝을 돌립니다. */
export function createAlkkagiRunner(state) {
    return { state, prev: state, acc: 0, outs: [], hits: 0 };
}

export function advanceAlkkagi(runner, frameSec, { dt = ALKKAGI_DT, maxSteps = ALKKAGI_MAX_STEPS, maxStepsPerFrame = ALKKAGI_MAX_STEPS_PER_FRAME } = {}) {
    let acc = runner.acc + Math.min(Math.max(Number(frameSec) || 0, 0), ALKKAGI_MAX_FRAME_SEC);
    let { state, prev } = runner;
    const outs = [...runner.outs];
    let { hits } = runner;
    let n = 0;
    while (acc >= dt) {
        if (n >= maxStepsPerFrame) {
            acc = 0; // 남은 시간은 버려요. 결과는 고정 스텝 수로만 정해져서 달라지지 않아요.
            break;
        }
        n += 1;
        if (isAlkkagiResting(state) || state.step >= maxSteps) {
            acc = 0;
            prev = state;
            break;
        }
        prev = state;
        const r = stepAlkkagi(state, dt);
        state = r.state;
        outs.push(...r.outs);
        hits += r.hits.length;
        acc -= dt;
    }
    return { state, prev, acc, outs, hits, alpha: acc / dt, resting: isAlkkagiResting(state) };
}

/** 이전·현재 상태를 alpha(0..1)로 섞은 그리기용 좌표. */
export function interpolateAlkkagi(prev, cur, alpha = 1) {
    const t = Math.min(Math.max(Number(alpha) || 0, 0), 1);
    const map = new Map(prev.stones.map((s) => [s.id, s]));
    return cur.stones.map((s) => {
        const p = map.get(s.id) || s;
        return { id: s.id, color: s.color, alive: s.alive, radius: s.radius, x: p.x + (s.x - p.x) * t, y: p.y + (s.y - p.y) * t };
    });
}

/** 저장·전송용 요약(좌표만). */
export function alkkagiStateToDoc(state) {
    return state.stones.map((s) => ({ id: s.id, color: s.color, x: s.x, y: s.y, alive: s.alive }));
}

export function alkkagiKineticEnergy(state) {
    let e = 0;
    for (const s of state.stones) if (s.alive) e += 0.5 * s.mass * (s.vx * s.vx + s.vy * s.vy);
    return e;
}

/* ---------- 대전 동기화 ---------- */

/** 샷을 전송용 객체로 만듭니다. { v, id, a, p } (a·p는 1/10000 단위 정수) */
export function serializeAlkkagiShot(shot) {
    const q = quantizeAlkkagiShot(shot || {});
    if (!q || !q.id) return null;
    return { v: ALKKAGI_SHOT_VERSION, id: q.id, a: q.ai, p: q.pi };
}

/** 받은 샷을 검증합니다. state를 주면 살아 있는 알인지, color를 주면 차례 색인지도 봅니다. */
export function parseAlkkagiShot(raw, { state = null, color = '' } = {}) {
    const fail = (error) => ({ ok: false, error, shot: null });
    if (!raw || typeof raw !== 'object') return fail('invalid-shot');
    if (raw.v !== ALKKAGI_SHOT_VERSION) return fail('invalid-version');
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 32) return fail('invalid-stone');
    const maxA = Math.round(Math.PI * ALKKAGI_SHOT_SCALE);
    if (!Number.isInteger(raw.a) || raw.a < -maxA || raw.a > maxA) return fail('invalid-angle');
    if (!Number.isInteger(raw.p) || raw.p <= 0 || raw.p > ALKKAGI_MAX_POWER * ALKKAGI_SHOT_SCALE) return fail('invalid-power');
    if (state) {
        const s = state.stones.find((t) => t.id === raw.id);
        if (!s || !s.alive) return fail('invalid-stone');
        if (color && s.color !== color) return fail('not-your-stone');
    }
    return { ok: true, error: '', shot: { id: raw.id, angle: raw.a / ALKKAGI_SHOT_SCALE, power: raw.p / ALKKAGI_SHOT_SCALE } };
}

/** 같은 시작 상태와 샷으로 다시 돌려, 친 사람이 확정한 최종 위치(alkkagiStateToDoc 결과)와 같은지 봅니다. */
export function verifyAlkkagiReplay(startState, rawShot, confirmedDoc, { tolerance = 0 } = {}) {
    const parsed = parseAlkkagiShot(rawShot, { state: startState });
    if (!parsed.ok) return { ok: false, error: parsed.error, mismatches: [], state: null };
    const sim = simulateAlkkagiShot(startState, parsed.shot);
    const mine = alkkagiStateToDoc(sim.state);
    const theirs = new Map((Array.isArray(confirmedDoc) ? confirmedDoc : []).map((d) => [String(d.id), d]));
    const mismatches = [];
    for (const m of mine) {
        const t = theirs.get(m.id);
        if (!t || t.alive !== m.alive || Math.abs(t.x - m.x) > tolerance || Math.abs(t.y - m.y) > tolerance) mismatches.push(m.id);
        theirs.delete(m.id);
    }
    for (const id of theirs.keys()) mismatches.push(id);
    return { ok: mismatches.length === 0, error: mismatches.length ? 'replay-mismatch' : '', mismatches, state: sim.state };
}
