/**
 * 실시간 알까기(동시 대전) 규칙 — 순수 모듈(DOM·Firestore 없음).
 *
 * 기존 알까기(턴제·한 화면 둘이서·AI)는 alkkagiGame.js를 그대로 쓰고, 이 모듈은 건드리지 않아요.
 * 물리는 alkkagiPhysics.js 함수를 읽기만 해서 다시 써요.
 *
 * - 차례가 없어요. 두 사람이 동시에 쏘고, 각자 5초에 한 번만 쏠 수 있어요.
 * - 판 계산은 방장 기기(호스트) 한 곳에서만 해요. 상대는 샷(의도)만 보내요.
 * - 상대 알을 모두 떨어뜨리면 이겨요. 둘 다 0개가 되면 비겨요. 나가면(기권) 져요.
 * - 연결이 끊긴 채로 오래 지나면 비겨요(disconnect).
 *
 * 저장 위치
 * - 방 문서 game: 로비·결과용 요약(시작 시각, 승패, 끝난 판 좌표)
 * - 하위 문서 live/state: 호스트가 쓰는 판 스냅샷(좌표+속도, seq)
 * - 하위 문서 live/black · live/white: 각자 쓰는 샷 의도와 접속 표시
 */

import { ALKKAGI_BLACK, ALKKAGI_CONFIG, ALKKAGI_WHITE, initialAlkkagiStones } from './alkkagiGame.js';
import { parseAlkkagiShot } from './alkkagiPhysics.js';

export const ALKKAGI_LIVE_TYPE = 'alkkagiLive';
/**
 * 실시간 입구 스위치. #99에서는 꺼 두었고, #100(2단계, 발사)에서 켜요.
 * 꺼져 있으면 '실시간 방 만들기' 버튼·로비의 실시간 방·'둘이 동시에 쏘고' 안내가 보이지 않아요.
 * 급하게 끌 때는 이 한 줄을 false로 바꾸고(테스트 alkkagiLiveGame.test.js의 스위치 확인 한 줄도 함께) 앱만 다시 배포하면 돼요. 규칙은 그대로 둬도 돼요.
 * (화면 문구·새로고침 복귀 함수는 enabled/liveEnabled 인자로 켬·끔 둘 다 단위 테스트해요.)
 */
export const ALKKAGI_LIVE_ENABLED = true;
/** 기권 방식: 기권 버튼(resign)인지 판에서 나가서(left)인지. 결과 문구만 달라요. */
export const ALKKAGI_LIVE_FORFEIT_HOWS = Object.freeze(['resign', 'left']);
/** 한 사람이 다시 쏘기까지 기다리는 시간 */
export const ALKKAGI_LIVE_COOLDOWN_MS = 5000;

/** 판 시작 전 카운트다운(ms). 이 시간 동안은 아무도 쏠 수 없어요(사람끼리·AI 대전 모두). */
export const ALKKAGI_LIVE_COUNTDOWN_MS = 3000;

/**
 * 사람끼리 할 때 카운트다운이 끝나는 시각(이 기기 시계).
 * 판 시작 시각(startedAt)은 다른 기기 시계로 찍혀서 몇 초~몇 분 어긋날 수 있어요.
 * 그래서 이 기기가 판을 처음 받은 때(seenAt)부터 최대 3초만 세요. 시작한 지 오래된 판(새로고침)은 바로 시작해요.
 */
export function liveCountdownEndAt({ startedAt = 0, seenAt = 0, countdownMs = ALKKAGI_LIVE_COUNTDOWN_MS } = {}) {
    const seen = Number(seenAt) || 0;
    const left = Math.max(0, Math.min(countdownMs, (Number(startedAt) || 0) + countdownMs - seen));
    return left > 0 ? seen + left : 0;
}
/** 호스트가 받는 쪽에서 허용하는 최소 간격(도착 시간 흔들림 여유). 규칙은 서버 시각으로 4.5초를 봐요. */
export const ALKKAGI_LIVE_HOST_MIN_GAP_MS = 4000;
export const ALKKAGI_LIVE_RULE_GAP_MS = 4500;
export const ALKKAGI_LIVE_END_REASONS = Object.freeze(['out', 'forfeit', 'draw', 'disconnect']);
export const ALKKAGI_LIVE_SEATS = Object.freeze([ALKKAGI_BLACK, ALKKAGI_WHITE]);
/**
 * 샷 의도 숫자 범위(규칙 firestore.rules alkLiveShotOk와 같아요). 앱이 실제로 낼 수 있는 값만이에요.
 * - 힘 p: 당긴 정도 0.05(판 MIN_POWER)~1(ALKKAGI_MAX_POWER) × 10000
 * - 방향 a: (-π, π] 라디안 × 10000
 */
export const ALKKAGI_LIVE_SHOT_MIN_P = 500;
export const ALKKAGI_LIVE_SHOT_MAX_P = 10000;
export const ALKKAGI_LIVE_SHOT_MAX_A = 31416;

function int(raw, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const n = Math.floor(Number(raw) || 0);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function epochMs(raw) {
    if (raw && typeof raw === 'object' && typeof raw.toMillis === 'function') return int(raw.toMillis());
    if (raw && typeof raw === 'object' && raw.seconds != null) return int(Number(raw.seconds) * 1000 + Number(raw.nanoseconds || 0) / 1e6);
    return int(raw);
}

export function alkkagiLiveSeat(raw) {
    return raw === ALKKAGI_BLACK || raw === ALKKAGI_WHITE ? raw : '';
}

export function alkkagiLiveOther(seat) {
    return seat === ALKKAGI_WHITE ? ALKKAGI_BLACK : ALKKAGI_WHITE;
}

const lim = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) * 1e6) / 1e6));

/** 좌표+속도까지 담은 알 목록. id 순으로 정렬해요. */
export function sanitizeLiveStones(raw) {
    const seen = new Set();
    const list = [];
    (Array.isArray(raw) ? raw : []).forEach((s) => {
        if (!s || typeof s !== 'object') return;
        const id = String(s.id || '').slice(0, 4);
        if (!/^[bw][1-5]$/.test(id) || seen.has(id)) return;
        const x = Number(s.x);
        const y = Number(s.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const alive = s.alive !== false;
        const vx = alive && Number.isFinite(Number(s.vx)) ? lim(s.vx, -3000, 3000) : 0;
        const vy = alive && Number.isFinite(Number(s.vy)) ? lim(s.vy, -3000, 3000) : 0;
        seen.add(id);
        list.push({ id, color: id[0] === 'b' ? ALKKAGI_BLACK : ALKKAGI_WHITE, x: lim(x, -200, 600), y: lim(y, -200, 600), vx, vy, alive });
    });
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return list;
}

export function initialLiveStones() {
    return initialAlkkagiStones().map((s) => ({ ...s, vx: 0, vy: 0 }));
}

export function liveAliveCount(stones, color) {
    return sanitizeLiveStones(stones).filter((s) => s.alive && s.color === color).length;
}

/* ---------- 방 문서 game(요약) ---------- */

export function emptyAlkkagiLiveGame({ now = 0 } = {}) {
    const t = int(now);
    return {
        mode: 'live',
        gid: t,
        startedAt: t,
        turnStartedAt: t, // 공통 방 코드가 쓰는 칸(타이머는 쓰지 않아요)
        stones: initialLiveStones().map(({ vx, vy, ...s }) => s),
        winner: '',
        endReason: '',
        shots: 0,
        endedAt: 0,
        forfeitHow: '',
    };
}

export function sanitizeAlkkagiLiveGame(raw, { now = 0 } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyAlkkagiLiveGame({ now });
    const endReason = ALKKAGI_LIVE_END_REASONS.includes(String(raw.endReason || '')) ? String(raw.endReason) : '';
    const winner = endReason && endReason !== 'draw' && endReason !== 'disconnect' ? alkkagiLiveSeat(raw.winner) : '';
    const stones = sanitizeLiveStones(raw.stones).map(({ vx, vy, ...s }) => s);
    const startedAt = epochMs(raw.startedAt) || epochMs(raw.gid) || int(now);
    const fin = (endReason === 'out' || endReason === 'forfeit') && !winner ? '' : endReason;
    return {
        mode: 'live',
        gid: epochMs(raw.gid) || startedAt,
        startedAt,
        turnStartedAt: epochMs(raw.turnStartedAt) || startedAt,
        stones: stones.length === 10 ? stones : initialLiveStones().map(({ vx, vy, ...s }) => s),
        winner,
        // 승자가 없는 out/forfeit은 잘못된 값이라 진행 중으로 봐요.
        endReason: (endReason === 'out' || endReason === 'forfeit') && !winner ? '' : endReason,
        shots: int(raw.shots, 0, 100000),
        endedAt: epochMs(raw.endedAt),
        forfeitHow: fin === 'forfeit' && ALKKAGI_LIVE_FORFEIT_HOWS.includes(String(raw.forfeitHow || '')) ? String(raw.forfeitHow) : '',
    };
}

export function alkkagiLiveGameToDoc(game) {
    const g = sanitizeAlkkagiLiveGame(game);
    return { ...g, stones: g.stones.map((s) => ({ ...s })) };
}

export function isAlkkagiLiveOver(game) {
    const g = sanitizeAlkkagiLiveGame(game);
    return !!g.endReason;
}

/** 멈춘 판을 보고 승패를 정해요. 아직이면 빈 결과예요. */
export function judgeLiveStones(stones) {
    const b = liveAliveCount(stones, ALKKAGI_BLACK);
    const w = liveAliveCount(stones, ALKKAGI_WHITE);
    if (b === 0 && w === 0) return { winner: '', endReason: 'draw' };
    if (w === 0) return { winner: ALKKAGI_BLACK, endReason: 'out' };
    if (b === 0) return { winner: ALKKAGI_WHITE, endReason: 'out' };
    return { winner: '', endReason: '' };
}

/** 끝난 판을 방 문서 game으로 만들어요. 이미 끝났으면 그대로 둬요(먼저 끝난 결과가 이겨요). */
export function finishAlkkagiLiveGame(game, { winner = '', endReason = '', stones = null, shots = null, now = 0, forfeitHow = '' } = {}) {
    const g = sanitizeAlkkagiLiveGame(game, { now });
    if (g.endReason) return { ok: false, error: 'already_over', game: g };
    if (!ALKKAGI_LIVE_END_REASONS.includes(endReason)) return { ok: false, error: 'bad_reason', game: g };
    const w = endReason === 'draw' || endReason === 'disconnect' ? '' : alkkagiLiveSeat(winner);
    if ((endReason === 'out' || endReason === 'forfeit') && !w) return { ok: false, error: 'bad_color', game: g };
    const fin = stones ? sanitizeLiveStones(stones) : null;
    return {
        ok: true,
        error: '',
        game: sanitizeAlkkagiLiveGame({
            ...g,
            stones: fin && fin.length === 10 ? fin : g.stones,
            shots: shots == null ? g.shots : shots,
            winner: w,
            endReason,
            endedAt: int(now),
            forfeitHow: endReason === 'forfeit' ? forfeitHow : '',
        }),
    };
}

/** how: 'resign'(기권 버튼) | 'left'(판에서 나가기). 전적은 똑같이 패예요. */
export function applyAlkkagiLiveForfeit(game, { color, stones = null, now = 0, how = 'left' } = {}) {
    const loser = alkkagiLiveSeat(color);
    if (!loser) return { ok: false, error: 'bad_color', game: sanitizeAlkkagiLiveGame(game, { now }) };
    const forfeitHow = ALKKAGI_LIVE_FORFEIT_HOWS.includes(how) ? how : 'left';
    return finishAlkkagiLiveGame(game, { winner: alkkagiLiveOther(loser), endReason: 'forfeit', stones, now, forfeitHow });
}

/** 전적: 'win' | 'loss' | 'draw' | '' */
export function alkkagiLiveRecordResult(game, myColor) {
    const g = sanitizeAlkkagiLiveGame(game);
    const me = alkkagiLiveSeat(myColor);
    if (!g.endReason || !me) return '';
    if (g.endReason === 'draw' || g.endReason === 'disconnect') return 'draw';
    return g.winner === me ? 'win' : 'loss';
}

/** 전적 중복 방지 키(같은 방 id를 다시 써도 판마다 달라요). */
export function alkkagiLiveResultKey(room, game) {
    const g = sanitizeAlkkagiLiveGame(game);
    const id = String((room && room.id) || '').slice(0, 30);
    return `alkl:${id}:${g.gid}`.slice(0, 80);
}

export function alkkagiLiveEndText(game, { blackName = '흑', whiteName = '백' } = {}) {
    const g = sanitizeAlkkagiLiveGame(game);
    if (!g.endReason) return '';
    if (g.endReason === 'draw') return '마지막 알이 함께 떨어졌어요. 비겼어요.';
    if (g.endReason === 'disconnect') return '연결이 오래 끊겨서 비긴 걸로 했어요.';
    const win = g.winner === ALKKAGI_BLACK ? blackName : whiteName;
    const lose = g.winner === ALKKAGI_BLACK ? whiteName : blackName;
    if (g.endReason === 'forfeit') return g.forfeitHow === 'resign' ? `${lose}님이 기권해서 ${win}님이 이겼어요.` : `${lose}님이 나가서 ${win}님이 이겼어요.`;
    return `${win}님이 상대 알을 모두 밀어냈어요!`;
}

export function alkkagiLiveResultTitle(game, { blackName = '흑', whiteName = '백' } = {}) {
    const g = sanitizeAlkkagiLiveGame(game);
    if (!g.endReason) return '';
    if (g.endReason === 'draw' || g.endReason === 'disconnect') return '비겼어요';
    return `${g.winner === ALKKAGI_BLACK ? blackName : whiteName} 승리!`;
}

/* ---------- 쿨다운 ---------- */

/** 남은 쿨다운(ms). lastShotAt이 0이면 바로 쏠 수 있어요. */
export function liveCooldownLeft(lastShotAt, now, cooldownMs = ALKKAGI_LIVE_COOLDOWN_MS) {
    const last = int(lastShotAt);
    if (!last) return 0;
    return Math.max(0, last + cooldownMs - int(now));
}

/** 화면 표시용: '3.2초' 같은 한 자리 소수. 0이면 빈 문자열. */
export function liveCooldownLabel(leftMs) {
    const ms = int(leftMs);
    if (ms <= 0) return '';
    return `${(Math.ceil(ms / 100) / 10).toFixed(1)}초`;
}

/* ---------- 샷 의도(live/{seat}) ---------- */

/** 이 자리 사람이 이 샷을 보낼 수 있는지(형식만). 쿨다운은 따로 봐요. */
export function checkLiveShotShape(shot, seat) {
    const s = alkkagiLiveSeat(seat);
    if (!s) return { ok: false, error: 'bad_color' };
    if (!shot || typeof shot !== 'object') return { ok: false, error: 'bad_shot' };
    const keys = Object.keys(shot);
    if (keys.some((k) => !['v', 'id', 'a', 'p'].includes(k))) return { ok: false, error: 'bad_shot' };
    if (typeof shot.id !== 'string' || !new RegExp(`^${s === ALKKAGI_BLACK ? 'b' : 'w'}[1-5]$`).test(shot.id)) return { ok: false, error: 'not_your_stone' };
    const parsed = parseAlkkagiShot(shot);
    if (!parsed.ok) return { ok: false, error: 'bad_shot' };
    // 규칙과 같은 범위: 앱이 내지 않는 아주 약한 힘(0.05 미만)은 받지 않아요.
    if (shot.p < ALKKAGI_LIVE_SHOT_MIN_P || shot.p > ALKKAGI_LIVE_SHOT_MAX_P || Math.abs(shot.a) > ALKKAGI_LIVE_SHOT_MAX_A) return { ok: false, error: 'bad_shot' };
    return { ok: true, error: '' };
}

/**
 * 판 위 안내 두 줄(상단 알약 line, 아래 안내 tip)을 지금 화면 상태에 맞게 골라요.
 * 두 줄이 서로 다른 말을 하지 않게(예: '판을 준비하고 있어요'인데 '둘이 동시에 쏘고…') 한곳에서 정해요.
 * tip은 글자만 돌려줘요(HTML 아님). who는 어느 화면 판이 기준인지 알려 주는 짧은 말이에요.
 * viewOnly: 같은 기기 다른 창이 이 판을 맡아서 이 창은 보기만 할 때(#100 M1).
 * @param {{ enabled?: boolean, over?: boolean, seat?: string, connected?: boolean, ready?: boolean, isHost?: boolean, viewOnly?: boolean, recordText?: string }} o
 */
export function alkkagiLiveGuide({ enabled = ALKKAGI_LIVE_ENABLED, over = false, seat = '', connected = false, ready = false, isHost = false, viewOnly = false, recordText = '' } = {}) {
    if (over) return { line: '판이 끝났어요', tip: `내 알까기 전적 ${recordText}`.trim(), who: '', phase: 'over' };
    if (!enabled) return { line: '실시간 대전은 준비하고 있어요', tip: '지금은 쏠 수 없어요. 열리면 여기에서 바로 할 수 있어요.', who: '', phase: 'off' };
    if (!alkkagiLiveSeat(seat)) return { line: '구경하고 있어요', tip: '두 사람이 차례 없이 동시에 쏘는 판이에요.', who: '', phase: 'watch' };
    if (!connected || !ready) return { line: '판에 연결하는 중이에요', tip: '연결되면 바로 쏠 수 있어요. 차례 없이 둘이 동시에 쏘고, 한 번 쏘면 5초 쉬어요.', who: '', phase: 'connecting' };
    if (viewOnly) {
        return {
            line: '다른 창에서 두고 있어요',
            tip: '이 창은 보기만 해요. 여기서 두려면 이 창을 새로고침해요.',
            who: '',
            phase: 'other_tab',
        };
    }
    return {
        line: '지금 쏠 수 있어요',
        tip: '알을 꾹 잡고 반대쪽으로 당겼다 놓아요. 한 번 쏘면 5초 쉬어요.',
        who: isHost ? '내가 방장이라 내 화면 판이 기준이에요.' : '방장 화면 판이 기준이에요.',
        phase: 'play',
    };
}

/**
 * 판을 끝내기 전에 다시 읽은 live/state가 내가 저장한 판 끝과 같은지(#100 M1).
 * 같은 판(gid)·같은 epoch·같은 seq이고, 판 끝(over) 승패가 같아야 해요. 하나라도 다르면 끝내지 않아요.
 * @param {object|null} stateDoc 다시 읽은 live/state(없으면 null)
 * @param {{ gid:number, seq:number, epoch:number, winner:string, endReason:string, hostSeat?:string }} mine
 */
export function liveFinishMatches(stateDoc, { gid, seq, epoch, winner = '', endReason = '', hostSeat = '' } = {}) {
    if (!stateDoc || typeof stateDoc !== 'object') return false;
    const st = sanitizeLiveState(stateDoc);
    if (!st.over) return false;
    if (st.gid !== int(gid) || st.seq !== int(seq) || st.epoch !== int(epoch)) return false;
    if (hostSeat && st.hostSeat !== hostSeat) return false;
    return st.over.endReason === String(endReason || '') && st.over.winner === (alkkagiLiveSeat(winner) || '');
}

/**
 * 당기던 중에 상대 샷 때문에 내 알이 밀리거나 떨어져서 샷이 안 나갔는지(#100 권장①).
 * 조용히 취소되면 학생이 '왜 안 나가지?' 하므로 짧게 알려 줘요.
 * - 'gone': 잡고 있던 알이 판 밖으로 떨어졌어요.
 * - 'pushed': 제대로 당겼었는데(maxPull ≥ 최소 힘) 알이 밀려나 당김이 풀렸어요.
 * - '': 학생이 스스로 취소했거나(화면 밖에서 놓음·살짝만 당김) 정상 발사예요.
 */
export function alkkagiAimLostReason({ alive = true, startX = 0, startY = 0, x = 0, y = 0, maxPull = 0, pull = 0, outside = false, minPower = 0.05, moveDist = ALKKAGI_CONFIG.radius * 0.6 } = {}) {
    if (outside) return '';
    if (!alive) return Number(maxPull) >= minPower ? 'gone' : '';
    if (Number(maxPull) < minPower || Number(pull) >= minPower) return '';
    const moved = Math.hypot(Number(x) - Number(startX), Number(y) - Number(startY));
    return moved > moveDist ? 'pushed' : '';
}

export const ALKKAGI_LIVE_AIM_LOST_TEXT = Object.freeze({
    pushed: '상대 알에 밀려서 다시 겨눠요',
    gone: '잡은 알이 떨어졌어요. 다른 알로 겨눠요',
});

export function sanitizeLiveSeatDoc(raw, seat) {
    const s = alkkagiLiveSeat(seat || (raw && raw.seat));
    const src = raw && typeof raw === 'object' ? raw : {};
    const shot = src.shot && checkLiveShotShape(src.shot, s).ok
        ? { v: src.shot.v, id: src.shot.id, a: src.shot.a, p: src.shot.p }
        : null;
    return {
        seat: s,
        sid: String(src.sid || '').slice(0, 20),
        gid: epochMs(src.gid),
        n: int(src.n, 0, 1e6),
        shot,
        shotAt: epochMs(src.shotAt),
        seenAt: epochMs(src.seenAt),
    };
}

/* ---------- 호스트 스냅샷(live/state) ---------- */

export function emptyLiveState({ gid = 0, hostSeat = ALKKAGI_BLACK } = {}) {
    return {
        gid: int(gid),
        seq: 0,
        epoch: 0,
        hostSeat: alkkagiLiveSeat(hostSeat) || ALKKAGI_BLACK,
        step: 0,
        moving: false,
        stones: initialLiveStones(),
        applied: { black: 0, white: 0 },
        rejected: { black: 0, white: 0 },
        lastShotAt: { black: 0, white: 0 },
        last: null,
        shots: 0,
        over: null,
    };
}

function seatMap(raw, max = 1e6) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return { black: int(src.black, 0, max), white: int(src.white, 0, max) };
}

export function sanitizeLiveState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyLiveState();
    const stones = sanitizeLiveStones(raw.stones);
    const last = raw.last && typeof raw.last === 'object' && alkkagiLiveSeat(raw.last.by)
        ? { by: raw.last.by, id: String(raw.last.id || '').slice(0, 4), n: int(raw.last.n), step: int(raw.last.step) }
        : null;
    const over = raw.over && typeof raw.over === 'object' && ALKKAGI_LIVE_END_REASONS.includes(String(raw.over.endReason || ''))
        ? { endReason: String(raw.over.endReason), winner: alkkagiLiveSeat(raw.over.winner) }
        : null;
    return {
        gid: epochMs(raw.gid),
        seq: int(raw.seq),
        epoch: int(raw.epoch),
        hostSeat: alkkagiLiveSeat(raw.hostSeat) || ALKKAGI_BLACK,
        step: int(raw.step),
        moving: raw.moving === true,
        stones: stones.length === 10 ? stones : initialLiveStones(),
        applied: seatMap(raw.applied),
        rejected: seatMap(raw.rejected),
        lastShotAt: seatMap(raw.lastShotAt, Number.MAX_SAFE_INTEGER),
        last,
        shots: int(raw.shots, 0, 100000),
        over,
    };
}

/**
 * Firestore에 넣을 스냅샷(중첩 배열 없음).
 * 좌표·속도는 물리 모듈이 이미 소수 6자리로 맞춘 값을 그대로 넣어요. 더 줄이면 게스트가 이어서 돌린 판이 호스트와 어긋나요.
 */
export function liveStateToDoc(state) {
    const s = sanitizeLiveState(state);
    return {
        ...s,
        stones: s.stones.map((t) => ({ id: t.id, color: t.color, x: t.x, y: t.y, vx: t.vx, vy: t.vy, alive: t.alive })),
    };
}

/**
 * 호스트가 받은 샷을 받아들일지 정해요(판에 넣는 건 엔진이 해요).
 * - 같은 판(gid)이어야 하고, 아직 넣지 않은 번호(n)여야 해요.
 * - 쿨다운: 호스트 시계로 마지막으로 받은 때부터 minGap 이상 지나야 해요.
 * - 내 알이고 살아 있어야 해요.
 */
export function decideLiveIntent(state, { seat, n, gid, shot, now, minGapMs = ALKKAGI_LIVE_HOST_MIN_GAP_MS } = {}) {
    const st = sanitizeLiveState(state);
    const s = alkkagiLiveSeat(seat);
    if (!s) return { accept: false, reason: 'bad_color' };
    if (st.over) return { accept: false, reason: 'already_over' };
    if (int(gid) !== st.gid) return { accept: false, reason: 'old_game' };
    const num = int(n);
    if (num <= st.applied[s] || num <= st.rejected[s]) return { accept: false, reason: 'seen' };
    const shape = checkLiveShotShape(shot, s);
    if (!shape.ok) return { accept: false, reason: shape.error, reject: true };
    const stone = st.stones.find((t) => t.id === shot.id);
    if (!stone || !stone.alive) return { accept: false, reason: 'not_alive', reject: true };
    const last = st.lastShotAt[s];
    if (last && int(now) - last < minGapMs) return { accept: false, reason: 'cooldown', reject: true };
    return { accept: true, reason: '' };
}

/* ---------- 접속·방장 승계 ---------- */

export const ALKKAGI_LIVE_HEARTBEAT_MS = 20000;
/** 호스트가 이만큼 조용하면 상대가 판 계산을 넘겨받아요. */
export const ALKKAGI_LIVE_HOST_SILENT_MS = 45000;
/** 상대가 이만큼 조용하면(넘겨받은 뒤에도) 연결 끊김 무승부예요. */
export const ALKKAGI_LIVE_PEER_SILENT_MS = 60000;

/**
 * 지금 할 일을 정해요.
 * - takeover: 호스트가 조용해서 내가 판 계산을 넘겨받아요(내가 게스트일 때).
 * - disconnect: 상대가 너무 오래 조용해서 무승부로 끝내요(내가 호스트일 때).
 * - '': 기다려요.
 * lastHeardAt: 상대한테서 마지막으로 무언가(스냅샷·접속 표시)를 받은 내 시계 시각.
 * since: 이 역할을 맡은 때(판 시작·승계). 시작하자마자 끊김으로 보지 않게 해요.
 */
export function decideLivePresence({ amHost, lastHeardAt, since, now, hostSilentMs = ALKKAGI_LIVE_HOST_SILENT_MS, peerSilentMs = ALKKAGI_LIVE_PEER_SILENT_MS } = {}) {
    const t = int(now);
    const heard = Math.max(int(lastHeardAt), int(since));
    if (!heard) return '';
    const quiet = t - heard;
    if (amHost) return quiet >= peerSilentMs ? 'disconnect' : '';
    return quiet >= hostSilentMs ? 'takeover' : '';
}

/** 승계할 때 쓸 새 스냅샷: 내 자리로 호스트를 바꾸고 epoch·seq를 올려요. stones는 내 화면의 판이에요. */
export function takeoverLiveState(state, { seat, stones = null, step = null } = {}) {
    const st = sanitizeLiveState(state);
    const s = alkkagiLiveSeat(seat);
    if (!s) return { ok: false, error: 'bad_color', state: st };
    if (st.over) return { ok: false, error: 'already_over', state: st };
    if (st.hostSeat === s) return { ok: false, error: 'already_host', state: st };
    const fin = stones ? sanitizeLiveStones(stones) : st.stones;
    return {
        ok: true,
        error: '',
        state: { ...st, hostSeat: s, epoch: st.epoch + 1, seq: st.seq + 1, stones: fin.length === 10 ? fin : st.stones, step: step == null ? st.step : int(step) },
    };
}

/** 스냅샷을 받아들일지: 같은 판이고 더 새로운 것만(epoch 먼저, 그다음 seq). */
export function isNewerLiveState(next, cur) {
    const a = sanitizeLiveState(next);
    if (!cur) return true;
    const b = sanitizeLiveState(cur);
    if (a.gid !== b.gid) return a.gid > b.gid;
    if (a.epoch !== b.epoch) return a.epoch > b.epoch;
    return a.seq > b.seq;
}

export const ALKKAGI_LIVE_ERROR_LABEL = Object.freeze({
    cooldown: '조금만 기다렸다가 쏴요.',
    not_your_stone: '내 알만 쏠 수 있어요.',
    bad_shot: '샷을 보내지 못했어요.',
    already_over: '이미 끝난 판이에요.',
    not_alive: '이미 떨어진 알이에요.',
    bad_color: '이 판의 사람만 할 수 있어요.',
    other_tab: '다른 창에서 두고 있어요.',
});

export function alkkagiLiveErrorText(code) {
    return ALKKAGI_LIVE_ERROR_LABEL[String(code || '')] || '지금은 할 수 없어요.';
}

export { ALKKAGI_CONFIG };
