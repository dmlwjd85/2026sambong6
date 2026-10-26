/**
 * 알까기 판 규칙(순수 모듈, DOM 없음).
 *
 * - 흑(방장)은 아래, 백(참가자)은 위에서 알 5개씩으로 시작해요. 흑이 먼저 쳐요.
 * - 한 번에 내 알 하나를 튕겨요. 판 밖으로 나간 알은 빠져요.
 * - 상대 알이 모두 빠지면 이겨요. 한 번에 양쪽이 모두 빠지면 비겨요.
 * - 대전: 친 사람이 샷(serializeAlkkagiShot)과 시뮬레이션으로 얻은 최종 좌표를 함께 저장해요.
 *   상대는 lastShot.from 에서 샷을 다시 돌려 보여 주고, 끝나면 저장된 최종 좌표(stones)를 정답으로 써요.
 */

import {
    alkkagiStateToDoc,
    createAlkkagiState,
    parseAlkkagiShot,
    simulateAlkkagiShot,
} from './alkkagiPhysics.js';

export const ALKKAGI_BLACK = 'black';
export const ALKKAGI_WHITE = 'white';
export const ALKKAGI_STONES_PER_SIDE = 5;
export const ALKKAGI_END_REASONS = Object.freeze(['out', 'forfeit', 'timeout', 'draw']);

/** 판 400×400(물리 단위). 화면 판의 13줄 먹선 칸에 맞춘 값이에요. */
export const ALKKAGI_CONFIG = Object.freeze({
    width: 400,
    height: 400,
    radius: 16,
    frictionDecel: 900,
    restitution: 0.88,
});

/** 먹선(13줄) 교차점 좌표. 화면도 같은 값을 써서 알이 줄 위에 놓여요. */
export const ALKKAGI_GRID_MARGIN = 400 * (22 / 328);
export const ALKKAGI_GRID_STEP = (400 - 2 * ALKKAGI_GRID_MARGIN) / 12;

function gridPos(i) {
    return Math.round((ALKKAGI_GRID_MARGIN + ALKKAGI_GRID_STEP * i) * 1000) / 1000;
}

function sanitizeEpochMs(raw) {
    if (raw && typeof raw === 'object' && typeof raw.toMillis === 'function') {
        return Math.max(0, Math.floor(Number(raw.toMillis()) || 0));
    }
    if (raw && typeof raw === 'object' && raw.seconds != null) {
        return Math.max(0, Math.floor(Number(raw.seconds) * 1000 + Number(raw.nanoseconds || 0) / 1e6));
    }
    return Math.max(0, Math.floor(Number(raw) || 0));
}

export function alkkagiOtherColor(color) {
    return color === ALKKAGI_WHITE ? ALKKAGI_BLACK : ALKKAGI_WHITE;
}

export function alkkagiSeatColor(seat) {
    return seat === ALKKAGI_WHITE || seat === ALKKAGI_BLACK ? seat : '';
}

/** 처음 배치: 흑은 아래 10번째 줄, 백은 위 2번째 줄, 가운데를 기준으로 한 칸씩 띄워 5개. */
export function initialAlkkagiStones() {
    const cols = [2, 4, 6, 8, 10];
    const list = [];
    cols.forEach((c, i) => list.push({ id: `b${i + 1}`, color: ALKKAGI_BLACK, x: gridPos(c), y: gridPos(10), alive: true }));
    cols.forEach((c, i) => list.push({ id: `w${i + 1}`, color: ALKKAGI_WHITE, x: gridPos(c), y: gridPos(2), alive: true }));
    return list;
}

function sanitizeStone(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').slice(0, 8);
    if (!/^[bw][0-9]{1,2}$/.test(id)) return null;
    const color = id[0] === 'b' ? ALKKAGI_BLACK : ALKKAGI_WHITE;
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const lim = (v) => Math.max(-200, Math.min(600, Math.round(v * 1e6) / 1e6));
    return { id, color, x: lim(x), y: lim(y), alive: raw.alive !== false };
}

export function sanitizeAlkkagiStones(raw) {
    const seen = new Set();
    const list = [];
    (Array.isArray(raw) ? raw : []).forEach((s) => {
        const c = sanitizeStone(s);
        if (!c || seen.has(c.id)) return;
        seen.add(c.id);
        list.push(c);
    });
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return list.slice(0, 2 * ALKKAGI_STONES_PER_SIDE);
}

function sanitizeShotDoc(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const shot = raw.shot && typeof raw.shot === 'object' ? raw.shot : null;
    if (!shot) return null;
    const by = alkkagiSeatColor(raw.by);
    if (!by) return null;
    const from = sanitizeAlkkagiStones(raw.from);
    if (!from.length) return null;
    const out = { v: Number(shot.v) || 0, id: String(shot.id || '').slice(0, 8), a: Math.trunc(Number(shot.a) || 0), p: Math.trunc(Number(shot.p) || 0) };
    return { by, seq: Math.max(0, Math.floor(Number(raw.seq) || 0)), shot: out, from };
}

export function emptyAlkkagiGame({ now = 0 } = {}) {
    return {
        stones: initialAlkkagiStones(),
        turn: ALKKAGI_BLACK,
        winner: '',
        endReason: '',
        lastShot: null,
        turnStartedAt: Math.max(0, Math.floor(Number(now) || 0)),
        moveCount: 0,
    };
}

export function sanitizeAlkkagiGame(raw, { now = 0 } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyAlkkagiGame({ now });
    const stones = sanitizeAlkkagiStones(raw.stones);
    const endReason = ALKKAGI_END_REASONS.includes(String(raw.endReason || '')) ? String(raw.endReason) : '';
    const winner = alkkagiSeatColor(raw.winner);
    return {
        stones: stones.length ? stones : initialAlkkagiStones(),
        turn: raw.turn === ALKKAGI_WHITE ? ALKKAGI_WHITE : ALKKAGI_BLACK,
        winner: endReason === 'draw' ? '' : winner,
        endReason: winner || endReason === 'draw' ? (endReason || 'out') : '',
        lastShot: sanitizeShotDoc(raw.lastShot),
        turnStartedAt: sanitizeEpochMs(raw.turnStartedAt),
        moveCount: Math.max(0, Math.floor(Number(raw.moveCount) || 0)),
    };
}

export function isAlkkagiOver(game) {
    const g = sanitizeAlkkagiGame(game);
    return !!g.winner || g.endReason === 'draw';
}

export function alkkagiAliveCount(game, color) {
    const g = sanitizeAlkkagiGame(game);
    return g.stones.filter((s) => s.alive && s.color === color).length;
}

/** 판 문서 좌표 → 물리 상태 */
export function alkkagiPhysicsState(stones) {
    return createAlkkagiState({ stones: sanitizeAlkkagiStones(stones), config: ALKKAGI_CONFIG });
}

/** 친 사람 기기에서: 샷(serializeAlkkagiShot 결과)을 끝까지 돌려 최종 좌표를 얻어요. */
export function simulateAlkkagiTurn(game, shot) {
    const g = sanitizeAlkkagiGame(game);
    const start = alkkagiPhysicsState(g.stones);
    const parsed = parseAlkkagiShot(shot, { state: start });
    if (!parsed.ok) return { ok: false, error: parsed.error, steps: 0, finalStones: alkkagiStateToDoc(start), outs: [] };
    const sim = simulateAlkkagiShot(start, parsed.shot);
    return { ok: sim.ok, error: sim.error, steps: sim.steps, finalStones: alkkagiStateToDoc(sim.state), outs: sim.outs };
}

function judge(stones, shooter) {
    const alive = (c) => stones.filter((s) => s.alive && s.color === c).length;
    const mine = alive(shooter);
    const theirs = alive(alkkagiOtherColor(shooter));
    if (mine === 0 && theirs === 0) return { winner: '', endReason: 'draw' };
    if (theirs === 0) return { winner: shooter, endReason: 'out' };
    if (mine === 0) return { winner: alkkagiOtherColor(shooter), endReason: 'out' };
    return { winner: '', endReason: '' };
}

/**
 * 한 수 반영. shot은 serializeAlkkagiShot 결과, finalStones는 친 사람이 확정한 최종 좌표.
 * finalStones가 없으면 여기서 직접 시뮬레이션해요.
 * replayMs: 상대 화면 재생 시간만큼 다음 차례 시계를 늦춰요(최대 6초).
 */
export function applyAlkkagiShotTurn(game, { color, shot, finalStones = null, now = 0, replayMs = 0 } = {}) {
    const g = sanitizeAlkkagiGame(game, { now });
    if (g.winner || g.endReason === 'draw') return { ok: false, error: 'already_over', game: g };
    const me = alkkagiSeatColor(color);
    if (!me) return { ok: false, error: 'bad_color', game: g };
    if (g.turn !== me) return { ok: false, error: 'not_turn', game: g };
    const start = alkkagiPhysicsState(g.stones);
    const parsed = parseAlkkagiShot(shot, { state: start, color: me });
    if (!parsed.ok) return { ok: false, error: parsed.error === 'not-your-stone' ? 'not_your_stone' : 'bad_shot', game: g };
    let next;
    if (finalStones) {
        const fin = sanitizeAlkkagiStones(finalStones);
        const before = new Map(g.stones.map((s) => [s.id, s]));
        if (fin.length !== g.stones.length || fin.some((s) => !before.has(s.id))) {
            return { ok: false, error: 'bad_final', game: g };
        }
        // 빠진 알은 다시 살아날 수 없어요.
        next = fin.map((s) => (before.get(s.id).alive ? s : { ...before.get(s.id), alive: false }));
    } else {
        next = alkkagiStateToDoc(simulateAlkkagiShot(start, parsed.shot).state);
    }
    const verdict = judge(next, me);
    const t = Math.max(0, Math.floor(Number(now) || 0));
    const delay = Math.max(0, Math.min(6000, Math.floor(Number(replayMs) || 0)));
    return {
        ok: true,
        error: '',
        game: {
            stones: next,
            turn: verdict.endReason ? me : alkkagiOtherColor(me),
            winner: verdict.winner,
            endReason: verdict.endReason,
            lastShot: { by: me, seq: g.moveCount + 1, shot: { v: shot.v, id: shot.id, a: shot.a, p: shot.p }, from: g.stones },
            turnStartedAt: t + delay,
            moveCount: g.moveCount + 1,
        },
    };
}

export function applyAlkkagiForfeit(game, { color, now } = {}) {
    const g = sanitizeAlkkagiGame(game, { now });
    if (g.winner || g.endReason === 'draw') return { ok: false, error: 'already_over', game: g };
    const loser = alkkagiSeatColor(color);
    if (!loser) return { ok: false, error: 'bad_color', game: g };
    return {
        ok: true,
        error: '',
        game: { ...g, winner: alkkagiOtherColor(loser), endReason: 'forfeit', turnStartedAt: Math.max(0, Math.floor(Number(now) || g.turnStartedAt || 0)) },
    };
}

export function applyAlkkagiTimeout(game, { now } = {}) {
    const g = sanitizeAlkkagiGame(game, { now });
    if (g.winner || g.endReason === 'draw') return { ok: false, error: 'already_over', game: g };
    return {
        ok: true,
        error: '',
        game: { ...g, winner: alkkagiOtherColor(g.turn), endReason: 'timeout', turnStartedAt: Math.max(0, Math.floor(Number(now) || g.turnStartedAt || 0)) },
    };
}

export function alkkagiWinnerSeat(game) {
    const g = sanitizeAlkkagiGame(game);
    return g.endReason === 'draw' ? '' : g.winner;
}

/** Firestore 저장용(중첩 배열 없음). */
export function alkkagiGameToDoc(game) {
    const g = sanitizeAlkkagiGame(game);
    return {
        stones: g.stones.map((s) => ({ id: s.id, color: s.color, x: s.x, y: s.y, alive: s.alive })),
        turn: g.turn,
        winner: g.winner,
        endReason: g.endReason,
        lastShot: g.lastShot
            ? { by: g.lastShot.by, seq: g.lastShot.seq, shot: { ...g.lastShot.shot }, from: g.lastShot.from.map((s) => ({ ...s })) }
            : null,
        turnStartedAt: g.turnStartedAt,
        moveCount: g.moveCount,
    };
}

export const ALKKAGI_ERROR_LABEL = Object.freeze({
    already_over: '이미 끝난 판이에요.',
    bad_color: '내 알 색을 찾지 못했어요.',
    not_turn: '지금은 상대 차례예요.',
    not_your_stone: '내 알만 튕길 수 있어요.',
    bad_shot: '알을 다시 튕겨 주세요.',
    bad_final: '판 상태가 맞지 않아요. 다시 해 볼까요?',
});

export function alkkagiErrorText(code) {
    return ALKKAGI_ERROR_LABEL[String(code || '')] || '';
}

export function alkkagiEndText(game, { blackName = '흑', whiteName = '백' } = {}) {
    const g = sanitizeAlkkagiGame(game);
    if (g.endReason === 'draw') return '마지막 알이 함께 떨어졌어요. 비겼어요.';
    if (!g.winner) return '';
    const win = g.winner === ALKKAGI_BLACK ? blackName : whiteName;
    const lose = g.winner === ALKKAGI_BLACK ? whiteName : blackName;
    if (g.endReason === 'forfeit') return `${lose}님이 기권해서 ${win}님이 이겼어요.`;
    if (g.endReason === 'timeout') return `${lose}님 시간이 다 돼서 ${win}님이 이겼어요.`;
    return `${win}님이 마지막 알까지 밀어냈어요!`;
}
