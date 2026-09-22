/**
 * 수업도구 가위바위보.
 * 학급 전원 대결은 고른 손끼리 승패를 가르고, 쌤을 이겨라는 선생님만 이긴 학생이 남습니다.
 */

export const RPS_MOVES = Object.freeze(['rock', 'paper', 'scissors']);
export const RPS_MODES = Object.freeze(['free', 'teacher']);
export const RPS_PHASES = Object.freeze(['idle', 'choose', 'reveal', 'done']);
/** 학급 가위바위보에 참여하는 선생님 자리 */
export const RPS_TEACHER_ID = 'teacher';
/** 학생·선생님이 손을 고를 수 있는 기본 시간 */
export const RPS_CHOOSE_MS = 5000;
export const RPS_CHOOSE_SEC = Math.round(RPS_CHOOSE_MS / 1000);
/** 선택 마감 직후, 늦은 손 기록이 도착할 여유 */
export const RPS_REVEAL_GRACE_MS = 400;
export const RPS_NEXT_ROUND_MS = 3500;
const RPS_CHOOSE_MS_MIN = 1000;
const RPS_CHOOSE_MS_MAX = 15000;
export const RPS_MOVE_LABEL = Object.freeze({
    rock: '바위',
    paper: '보',
    scissors: '가위',
});

function cleanId(raw) {
    const id = String(raw || '').trim().slice(0, 20);
    return id && id !== 'gm' && id !== 'gm_a' && id !== 'guest' ? id : '';
}

function uniqueIds(list) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach((raw) => {
        const id = cleanId(raw);
        if (!id || seen.has(id)) return;
        seen.add(id);
        out.push(id);
    });
    return out;
}

/** Firestore Timestamp·초 단위 값도 밀리초 epoch로 맞춥니다. */
export function sanitizeEpochMs(raw) {
    if (raw && typeof raw === 'object' && typeof raw.toMillis === 'function') {
        return Math.max(0, Math.floor(Number(raw.toMillis()) || 0));
    }
    if (raw && typeof raw === 'object' && raw.seconds != null) {
        const sec = Number(raw.seconds);
        const nano = Number(raw.nanoseconds) || 0;
        if (Number.isFinite(sec)) return Math.max(0, Math.floor(sec * 1000 + nano / 1e6));
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    // 10자리면 초 epoch로 보고 밀리초로 바꿉니다.
    if (n > 1e9 && n < 1e12) return Math.floor(n * 1000);
    return Math.max(0, Math.floor(n));
}

export function sanitizeRpsMove(raw) {
    const m = String(raw || '').trim();
    return RPS_MOVES.includes(m) ? m : '';
}

/** 선택 제한 시간을 1~15초 안으로 맞춥니다. 없거나 이상하면 기본 5초입니다. */
export function sanitizeRpsChooseMs(raw) {
    const n = Math.floor(Number(raw) || 0);
    if (n < RPS_CHOOSE_MS_MIN) return RPS_CHOOSE_MS;
    return Math.min(RPS_CHOOSE_MS_MAX, n);
}

export function rpsChooseSeconds(ms = RPS_CHOOSE_MS) {
    return Math.max(1, Math.round(sanitizeRpsChooseMs(ms) / 1000));
}

export function rpsBeats(a, b) {
    const x = sanitizeRpsMove(a);
    const y = sanitizeRpsMove(b);
    if (!x || !y || x === y) return false;
    return (x === 'rock' && y === 'scissors')
        || (x === 'scissors' && y === 'paper')
        || (x === 'paper' && y === 'rock');
}

export function sanitizeRpsPick(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { sessionId: '', round: 0, move: '', at: 0 };
    }
    return {
        sessionId: String(raw.sessionId || '').trim().slice(0, 80),
        round: Math.max(0, Math.floor(Number(raw.round) || 0)),
        move: sanitizeRpsMove(raw.move),
        at: Math.max(0, Math.floor(Number(raw.at) || 0)),
    };
}

function sanitizeHistoryRow(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const round = Math.max(1, Math.floor(Number(raw.round) || 0));
    const kind = String(raw.kind || '').slice(0, 20);
    return {
        round,
        kind,
        winners: uniqueIds(raw.winners),
        losers: uniqueIds(raw.losers),
        timeouts: uniqueIds(raw.timeouts),
        teacherPick: sanitizeRpsMove(raw.teacherPick) || '',
    };
}

export function emptyRpsGame() {
    return {
        sessionId: '',
        mode: 'free',
        phase: 'idle',
        round: 0,
        chooseUntil: 0,
        chooseStartedAt: 0,
        chooseMs: RPS_CHOOSE_MS,
        aliveIds: [],
        winnerId: '',
        teacherPick: '',
        lastResult: null,
        history: [],
        updatedAt: 0,
    };
}

export function createRpsSessionId() {
    return `rps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeRpsLastResult(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const picks = {};
    const src = raw.picks && typeof raw.picks === 'object' && !Array.isArray(raw.picks) ? raw.picks : {};
    Object.keys(src).slice(0, 80).forEach((id) => {
        const sid = cleanId(id);
        const move = sanitizeRpsMove(src[id]);
        if (sid && move) picks[sid] = move;
    });
    return {
        kind: String(raw.kind || '').slice(0, 20),
        winners: uniqueIds(raw.winners),
        losers: uniqueIds(raw.losers),
        timeouts: uniqueIds(raw.timeouts),
        picks,
        teacherPick: sanitizeRpsMove(raw.teacherPick) || '',
        round: Math.max(0, Math.floor(Number(raw.round) || 0)),
    };
}

export function sanitizeRpsGame(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyRpsGame();
    const mode = RPS_MODES.includes(String(raw.mode)) ? String(raw.mode) : 'free';
    const phase = RPS_PHASES.includes(String(raw.phase)) ? String(raw.phase) : 'idle';
    const sessionId = String(raw.sessionId || '').trim().slice(0, 80);
    const aliveIds = uniqueIds(raw.aliveIds);
    const round = Math.max(0, Math.floor(Number(raw.round) || 0));
    const winnerId = cleanId(raw.winnerId);
    const active = !!sessionId && phase !== 'idle';
    const chooseMs = sanitizeRpsChooseMs(raw.chooseMs);
    return {
        sessionId: active ? sessionId : '',
        mode,
        phase: active ? phase : 'idle',
        round: active ? round : 0,
        chooseUntil: active ? sanitizeEpochMs(raw.chooseUntil) : 0,
        chooseStartedAt: active ? sanitizeEpochMs(raw.chooseStartedAt) : 0,
        chooseMs,
        aliveIds: active ? aliveIds : [],
        winnerId: phase === 'done' ? winnerId : '',
        teacherPick: phase === 'reveal' || phase === 'done' ? (sanitizeRpsMove(raw.teacherPick) || '') : '',
        lastResult: active ? sanitizeRpsLastResult(raw.lastResult) : null,
        history: (Array.isArray(raw.history) ? raw.history : []).map(sanitizeHistoryRow).filter(Boolean).slice(-20),
        updatedAt: sanitizeEpochMs(raw.updatedAt),
    };
}

export function collectRpsPicksFromStudents(students, sessionId, round) {
    const sid = String(sessionId || '').trim();
    const rnd = Math.max(0, Math.floor(Number(round) || 0));
    const picks = {};
    (Array.isArray(students) ? students : []).forEach((stu) => {
        const id = cleanId(stu && (stu.id || stu.studentId));
        if (!id) return;
        const pick = sanitizeRpsPick(stu && stu.rpsPick);
        if (pick.sessionId === sid && pick.round === rnd && pick.move) picks[id] = pick.move;
    });
    return picks;
}

/**
 * 고른 손만 모아서 가위바위보 승패를 가릅니다.
 * 세 손이 다 나오면 무승부(고른 사람은 남음). 못 고른 사람은 항상 탈락입니다.
 */
export function resolveFreeRpsRound({ aliveIds, picks } = {}) {
    const alive = uniqueIds(aliveIds);
    const map = picks && typeof picks === 'object' ? picks : {};
    const timeouts = [];
    const picked = [];
    const byMove = { rock: [], paper: [], scissors: [] };
    alive.forEach((id) => {
        const move = sanitizeRpsMove(map[id]);
        if (!move) {
            timeouts.push(id);
            return;
        }
        picked.push(id);
        byMove[move].push(id);
    });
    const used = RPS_MOVES.filter((m) => byMove[m].length);
    let winners = picked.slice();
    let losers = [];
    let kind = 'tie';
    if (!picked.length) {
        winners = [];
        kind = 'timeout_all';
    } else if (used.length === 2) {
        const [a, b] = used;
        const winMove = rpsBeats(a, b) ? a : b;
        const loseMove = winMove === a ? b : a;
        winners = byMove[winMove].slice();
        losers = byMove[loseMove].slice();
        kind = 'win';
    }
    return { kind, winners, losers, timeouts, picks: Object.fromEntries(picked.map((id) => [id, sanitizeRpsMove(map[id])])) };
}

/**
 * 선생님을 이긴 학생만 남깁니다. 비기거나 지면 탈락, 못 고르면 탈락.
 * 선생님 손이 없으면 고른 학생은 남기고 다시 합니다.
 * 이긴 학생이 없으면(전원 패·무) 고른 학생은 남기고 다시 합니다.
 */
export function resolveTeacherRpsRound({ aliveIds, picks, teacherPick } = {}) {
    const alive = uniqueIds(aliveIds);
    const map = picks && typeof picks === 'object' ? picks : {};
    const teacher = sanitizeRpsMove(teacherPick);
    const timeouts = [];
    const picked = [];
    alive.forEach((id) => {
        const move = sanitizeRpsMove(map[id]);
        if (!move) timeouts.push(id);
        else picked.push(id);
    });
    const pickMap = Object.fromEntries(picked.map((id) => [id, sanitizeRpsMove(map[id])]));
    if (!teacher) {
        return {
            kind: 'teacher_miss',
            winners: picked.slice(),
            losers: [],
            timeouts,
            picks: pickMap,
            teacherPick: '',
        };
    }
    const winners = [];
    const losers = [];
    picked.forEach((id) => {
        if (rpsBeats(pickMap[id], teacher)) winners.push(id);
        else losers.push(id);
    });
    if (!winners.length && picked.length) {
        return {
            kind: 'teacher_hold',
            winners: picked.slice(),
            losers: [],
            timeouts,
            picks: pickMap,
            teacherPick: teacher,
        };
    }
    return {
        kind: winners.length ? 'teacher_win' : 'timeout_all',
        winners,
        losers,
        timeouts,
        picks: pickMap,
        teacherPick: teacher,
    };
}

export function startRpsRound({
    mode = 'free',
    aliveIds = [],
    sessionId = '',
    round = 1,
    now = Date.now(),
    history = [],
    chooseMs = RPS_CHOOSE_MS,
} = {}) {
    const ids = uniqueIds(aliveIds);
    const sid = String(sessionId || '').trim().slice(0, 80) || createRpsSessionId();
    const rnd = Math.max(1, Math.floor(Number(round) || 1));
    const ms = sanitizeRpsChooseMs(chooseMs);
    if (ids.length <= 1) {
        return sanitizeRpsGame({
            sessionId: sid,
            mode: RPS_MODES.includes(mode) ? mode : 'free',
            phase: 'done',
            round: rnd,
            aliveIds: ids,
            winnerId: ids[0] || '',
            chooseMs: ms,
            history,
            updatedAt: now,
        });
    }
    return sanitizeRpsGame({
        sessionId: sid,
        mode: RPS_MODES.includes(mode) ? mode : 'free',
        phase: 'choose',
        round: rnd,
        chooseMs: ms,
        chooseStartedAt: now,
        chooseUntil: now + ms,
        aliveIds: ids,
        history,
        updatedAt: now,
    });
}

/** 게시 직전 마감을 다시 잡아, 확인창·인증 대기 시간이 선택 시간을 깎지 않게 합니다. */
export function refreshRpsChooseDeadline(state, now = Date.now()) {
    const g = sanitizeRpsGame(state);
    if (g.phase !== 'choose' || !g.sessionId) return g;
    const ms = sanitizeRpsChooseMs(g.chooseMs);
    return sanitizeRpsGame({
        ...g,
        chooseMs: ms,
        chooseStartedAt: now,
        chooseUntil: now + ms,
        updatedAt: now,
    });
}

export function applyRpsReveal({
    state,
    picks = {},
    teacherPick = '',
    now = Date.now(),
} = {}) {
    const game = sanitizeRpsGame(state);
    if (game.phase !== 'choose' || !game.sessionId) {
        return { ok: false, reason: 'phase', state: game };
    }
    const resolved = game.mode === 'teacher'
        ? resolveTeacherRpsRound({ aliveIds: game.aliveIds, picks, teacherPick })
        : resolveFreeRpsRound({ aliveIds: game.aliveIds, picks });
    const nextAlive = uniqueIds(resolved.winners);
    const lastResult = {
        kind: resolved.kind,
        winners: resolved.winners,
        losers: resolved.losers,
        timeouts: resolved.timeouts,
        picks: resolved.picks,
        teacherPick: resolved.teacherPick || '',
        round: game.round,
    };
    const history = [...(game.history || []), {
        round: game.round,
        kind: resolved.kind,
        winners: resolved.winners,
        losers: resolved.losers,
        timeouts: resolved.timeouts,
        teacherPick: resolved.teacherPick || '',
    }].slice(-20);
    const done = nextAlive.length <= 1;
    const next = sanitizeRpsGame({
        ...game,
        phase: done ? 'done' : 'reveal',
        aliveIds: nextAlive,
        winnerId: nextAlive.length === 1 ? nextAlive[0] : '',
        teacherPick: lastResult.teacherPick,
        lastResult,
        history,
        chooseUntil: 0,
        updatedAt: now,
    });
    return { ok: true, state: next, result: lastResult };
}

function rpsReceivedAt(opts = {}) {
    return Math.max(0, Math.floor(Number(opts && opts.receivedAt) || 0));
}

/**
 * 이 라운드 선택 시작 시각.
 * chooseUntil이 있으면 거기서 역산하고, 없으면 chooseStartedAt·updatedAt을 씁니다.
 */
export function rpsChooseStartedAt(game) {
    const g = sanitizeRpsGame(game);
    const ms = sanitizeRpsChooseMs(g.chooseMs);
    const fromUntil = g.chooseUntil > ms ? g.chooseUntil - ms : 0;
    return Math.max(g.chooseStartedAt || 0, g.updatedAt || 0, fromUntil);
}

/** 손을 고를 수 있는 마감 시각(유예 제외). 낡은 마감은 수신 시각으로 복구합니다. */
export function rpsChooseDeadlineMs(game, now = Date.now(), opts = {}) {
    const g = sanitizeRpsGame(game);
    const ms = sanitizeRpsChooseMs(g.chooseMs);
    const started = rpsChooseStartedAt(g);
    const receivedAt = rpsReceivedAt(opts);
    const wallDeadline = started > 0 ? started + ms : (g.chooseUntil || 0);
    const wallAgeOk = started > 0 && (now - started) < ms + RPS_REVEAL_GRACE_MS + 2000;
    if (wallAgeOk) return wallDeadline;
    if (receivedAt > 0) return receivedAt + ms;
    return wallDeadline;
}

/**
 * 남은 선택 시간.
 * 서버 마감이 이미 지났거나 비어 있으면, 이 화면이 라운드를 받은 뒤부터
 * 설정 시간(기본 5초)을 채워 숫자가 5인데 바로 끝나는 일을 막습니다.
 * 느린 기기 시계로는 설정 시간보다 늘어나지 않게 자릅니다.
 */
export function rpsChooseRemainingMs(game, now = Date.now(), opts = {}) {
    const g = sanitizeRpsGame(game);
    if (g.phase !== 'choose') return 0;
    const ms = sanitizeRpsChooseMs(g.chooseMs);
    const deadline = rpsChooseDeadlineMs(g, now, opts);
    const wallRemain = deadline - now;
    const receivedAt = rpsReceivedAt(opts);
    if (receivedAt > 0) {
        const localRemain = ms - (now - receivedAt);
        if (wallRemain <= 0) return Math.max(0, Math.min(localRemain, ms));
        return Math.max(0, Math.min(wallRemain, localRemain, ms));
    }
    return Math.max(0, Math.min(wallRemain, ms));
}

/** 공개 타이머에 넣을 대기 시간. 낡은 마감이어도 방금 받은 라운드는 약 5초를 지킵니다. */
export function rpsRevealWaitMs(game, now = Date.now(), opts = {}) {
    const g = sanitizeRpsGame(game);
    if (g.phase !== 'choose') return 0;
    const remain = rpsChooseRemainingMs(g, now, opts);
    return Math.max(80, remain + RPS_REVEAL_GRACE_MS);
}

/** 공개 전까지는 남은 시간이 0이어도 손을 받을 수 있습니다(유예 구간). */
export function rpsCanPick(game) {
    const g = sanitizeRpsGame(game);
    return g.phase === 'choose' && !!g.sessionId;
}

export function rpsCanReveal(game, now = Date.now(), opts = {}) {
    const g = sanitizeRpsGame(game);
    if (g.phase !== 'choose') return false;
    if (rpsChooseRemainingMs(g, now, opts) > 0) return false;
    return now >= rpsChooseDeadlineMs(g, now, opts) + RPS_REVEAL_GRACE_MS;
}
