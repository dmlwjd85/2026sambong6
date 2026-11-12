/**
 * 실시간 알까기 화면(방 안). 로비·방 만들기·참가 승인은 보드게임 공통 방(sambongWorld.js)을 그대로 써요.
 * 기존 알까기(턴제·한 화면 둘이서·AI) 화면과 코드는 건드리지 않고, 이 파일과 #boardgameAlkLivePlayView 만 써요.
 */
import './alkkagiLive.css';
import { ALKKAGI_BLACK, ALKKAGI_STONES_PER_SIDE, ALKKAGI_WHITE } from './lib/alkkagiGame.js';
import {
    ALKKAGI_LIVE_AIM_LOST_TEXT,
    ALKKAGI_LIVE_COOLDOWN_MS,
    ALKKAGI_LIVE_ENABLED,
    alkkagiLiveEndText,
    alkkagiLiveGuide,
    alkkagiLiveOther,
    alkkagiLiveResultTitle,
    alkkagiLiveSeat,
    ALKKAGI_LIVE_COUNTDOWN_MS,
    liveCountdownEndAt,
    applyAlkkagiLiveForfeit,
    emptyAlkkagiLiveGame,
    finishAlkkagiLiveGame,
    isAlkkagiLiveOver,
    liveCooldownLabel,
    liveFinishMatches,
    liveStateToDoc,
    liveAliveCount,
    sanitizeAlkkagiLiveGame,
} from './lib/alkkagiLiveGame.js';
import { createAlkkagiLiveBoard } from './lib/alkkagiLiveBoard.js';
import { createLiveSession } from './lib/alkkagiLiveSession.js';
import { alkkagiLiveTabLockName, createLiveTabLock } from './lib/alkkagiLiveTabLock.js';
import { alkkagiAiLevelLabel, sanitizeAlkkagiAiLevel } from './lib/alkkagiAi.js';
import { createLiveAiDriver } from './lib/alkkagiLiveAi.js';

/** AI 대전 판의 방 id(Firestore에 쓰지 않는 내 기기 전용 판이에요) */
export const ALKKAGI_LIVE_AI_ROOM_ID = 'alkkagi-live-ai';

const TICK_MS = 50;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * deps: {
 *   selfId(), memberName(room, seat), roomMember seat lookup(room, id) → seat,
 *   mutateRoom(roomId, mutator) → Promise<room|null>, applyRoomGame(room, {game, now, finished}),
 *   continueRoom(room, {actorId, now}), closeRoom(room, {actorId, now}), deleteRoom(roomId),
 *   recordResult(room), myRecordText(), loadFonts(), toLobby(), isPlayView()
 * }
 */
export function createAlkkagiLiveMode(deps) {
    let board = null;
    let room = null;
    let shownStones = [];
    const dialogs = new Set();
    // 지금 두는 판의 실시간 연결: { key, roomId, gid, seat, session, unsub, timer, liveCol }
    let live = null;
    const stats = { stateWrites: 0, intentWrites: 0, seatWrites: 0, roomWrites: 0, liveReads: 0, roomReads: 0, games: 0 };
    let flashUntil = 0;
    let failUntil = 0;
    let aimLostUntil = 0;
    let aimLostText = '';
    // AI 대전 중이면 { level, seed }. 방 문서·Firestore 없이 내 기기에서만 돌아요. 나는 검은 알(판 계산), AI는 흰 알이에요.
    let ai = null;

    const $ = (id) => document.getElementById(id);
    const me = () => String(deps.selfId() || '');
    const mySeat = (r = room) => (r ? (ai ? ALKKAGI_BLACK : alkkagiLiveSeat(deps.seatOf(r, me()))) : '');
    const game = () => sanitizeAlkkagiLiveGame(room && room.game);
    const aiName = () => (ai ? alkkagiAiLevelLabel(ai.level) : '');
    const nameOf = (seat) => (ai ? (seat === ALKKAGI_WHITE ? aiName() : '나') : deps.memberName(room, seat));
    /** 'AI 고수' → 'AI 고수가'(받침 따라 이/가) */
    const hasBatchim = (n) => {
        const last = n.charCodeAt(n.length - 1) - 0xac00;
        return last >= 0 && last < 11172 && last % 28 !== 0;
    };
    const aiSubject = () => `${aiName()}${hasBatchim(aiName()) ? '이' : '가'}`;
    const aiWith = () => `${aiName()}${hasBatchim(aiName()) ? '과' : '와'}`;

    function ensureBoard() {
        if (board) return board;
        const canvas = $('alkLiveCanvas');
        if (!canvas) return null;
        if (deps.loadFonts) deps.loadFonts();
        board = createAlkkagiLiveBoard(canvas, {
            boundsEl: $('boardgameAlkLivePlayView'),
            frame: () => frameForBoard(),
            onShot: (shot) => onBoardShot(shot),
            // #100 권장①: 당기던 알이 상대 샷에 밀리거나 떨어지면 짧게 알려 줘요.
            onAimLost: (reason) => {
                aimLostText = ALKKAGI_LIVE_AIM_LOST_TEXT[reason] || '';
                aimLostUntil = aimLostText ? Date.now() + 1800 : 0;
                liveChrome();
            },
        });
        const view = $('boardgameAlkLivePlayView');
        if (view) view.addEventListener('pointerdown', () => { if (board) board.ensureSound(); }, { passive: true });
        if (window.__sambongE2E) {
            window.__alkLiveQA = {
                board: () => board,
                state: () => ({ room, stones: shownStones }),
                session: () => (live ? live.session : null),
                stats: () => ({ ...stats, session: live ? live.session.stats() : null, lock: live && live.lock ? { kind: live.lock.kind, held: live.lock.held() } : null }),
                shoot: (shot) => onBoardShot(shot),
            };
        }
        return board;
    }

    function fsDeps() {
        return deps.fs || {};
    }

    function liveCol(roomId) {
        const { collection } = fsDeps();
        return collection(deps.roomRef(roomId), 'live');
    }

    function frameForBoard() {
        if (live && live.session.isReady()) {
            const s = live.session;
            s.tick(Date.now());
            const ev = s.drainEvents();
            for (const l of ev.launches) if (board) board.launched(l.power);
            if (ev.fails.length) failUntil = Date.now() + 2200;
            shownStones = s.stones();
            return { stones: shownStones, hits: ev.hits, outs: ev.outs };
        }
        return { stones: shownStones };
    }

    function onBoardShot(shot) {
        if (!live || !room || room.status !== 'playing') return { ok: false, error: 'not_ready' };
        if (countdownLeft() > 0) return { ok: false, error: 'not_ready' };
        const r = live.session.shoot(shot, Date.now());
        if (!r.ok && r.error === 'cooldown') flashUntil = Date.now() + 700;
        if (board) board.kick();
        liveChrome();
        return r;
    }

    function stopLive() {
        const cd = $('alkLiveCountdown');
        if (cd) cd.classList.add('hidden');
        if (!live) return;
        try { if (live.unsub) live.unsub(); } catch (_) { /* 무시 */ }
        try { if (live.lock) live.lock.release(); } catch (_) { /* 무시 */ }
        if (live.timer) clearInterval(live.timer);
        if (live.driver) live.driver.stop();
        live = null;
    }

    /** 두는 중인 판이면 live 하위 문서에 붙어요. 판(gid)이 바뀌면 새로 붙어요. */
    function ensureLive() {
        if (ai) { ensureAiLive(); return; }
        const g = game();
        const seat = mySeat();
        const key = `${room.id}:${g.gid}:${seat}`;
        if (live && live.key === key) return;
        stopLive();
        if (!seat || room.status !== 'playing' || isAlkkagiLiveOver(g)) return;
        const { doc, setDoc, onSnapshot, serverTimestamp, getDocFromServer } = fsDeps();
        if (!doc || !onSnapshot) return;
        const roomId = room.id;
        const col = liveCol(roomId);
        const sid = me();
        const gid = g.gid;
        const hostSeat = room.hostId && deps.seatOf(room, room.hostId) ? alkkagiLiveSeat(deps.seatOf(room, room.hostId)) || ALKKAGI_BLACK : ALKKAGI_BLACK;
        const session = createLiveSession({
            seat,
            gid,
            now: Date.now(),
            // #100 M1: 같은 기기 창 잠금을 얻기 전까지는 보기만 해요(아래 lock).
            hostRole: false,
            send: {
                writeState: (st) => { stats.stateWrites += 1; return setDoc(doc(col, 'state'), { ...liveStateToDoc(st), at: serverTimestamp() }); },
                writeIntent: ({ n, shot }) => { stats.intentWrites += 1; return setDoc(doc(col, seat), { seat, sid, gid, n, shot, shotAt: serverTimestamp(), seenAt: serverTimestamp() }); },
                // 스냅샷 쓰기가 거절됐을 때·창을 다시 맡았을 때 서버의 최신 판을 읽어 맞춰요(캐시 말고 서버).
                readState: getDocFromServer
                    ? () => { stats.liveReads += 1; return getDocFromServer(doc(col, 'state')).then((d) => (d.exists() ? d.data() : null)); }
                    : undefined,
                finish: (r) => { void finishFromHost(roomId, gid, seat, r); },
            },
        });
        const cur = { key, roomId, gid, seat, session, unsub: null, timer: null, col, first: true, lock: null, startAt: liveCountdownEndAt({ startedAt: g.startedAt, seenAt: Date.now() }) };
        live = cur;
        // #100 M1: 같은 기기(브라우저)에서는 한 판·한 자리를 창 하나만 맡아요. 가장 나중에 연 창이 맡고, 앞 창은 보기만 해요.
        cur.lock = createLiveTabLock({
            name: alkkagiLiveTabLockName({ roomId, gid, seat }),
            onChange: (held) => {
                if (live !== cur) return;
                session.setHostRole(held, Date.now());
                if (board) board.kick();
                liveChrome();
            },
        });
        stats.games += 1;
        cur.unsub = onSnapshot(col, (snap) => {
            if (live !== cur) return;
            const t = Date.now();
            const changes = snap.docChanges();
            stats.liveReads += changes.length;
            if (cur.first) {
                cur.first = false;
                let stateDoc = null;
                let mine = null;
                snap.forEach((d) => {
                    if (d.id === 'state') stateDoc = d.data();
                    if (d.id === seat) mine = d.data();
                });
                session.init(stateDoc, { hostSeat, nowMs: t, seatDoc: mine });
                // 이미 누가 쏜 판이면(새로고침·늦게 들어옴) 카운트다운 없이 바로 이어 해요.
                if (session.state().shots > 0) cur.startAt = 0;
                snap.forEach((d) => { if (d.id === alkkagiLiveOther(seat)) session.onSeatDoc(d.id, d.data(), t); });
                // 내 자리 문서를 이번 판으로 만들어 둬요(번호 0). 같은 판을 새로고침한 거면 그대로 써요.
                if (!mine || Number(mine.gid) !== gid) {
                    stats.seatWrites += 1;
                    setDoc(doc(col, seat), { seat, sid, gid, n: 0, shot: null, shotAt: serverTimestamp(), seenAt: serverTimestamp() })
                        .catch((e) => console.warn('alkLive seat', e));
                }
                session.tick(t);
                if (board) board.kick();
                liveChrome();
                return;
            }
            changes.forEach((ch) => {
                if (ch.type === 'removed') return;
                const id = ch.doc.id;
                const data = ch.doc.data();
                if (id === 'state') {
                    const before = session.onStateDoc(data, t);
                    if (before && board) { shownStones = session.stones(); board.correct(before); }
                } else if (id === alkkagiLiveOther(seat) || id === seat) {
                    // 내 자리 문서도 넘겨서 샷 번호가 어긋나면 맞춰요(#100).
                    session.onSeatDoc(id, data, t);
                }
            });
            if (board) board.kick();
        }, (e) => console.warn('alkLive snapshot', e));
        cur.timer = setInterval(() => {
            if (live !== cur) return;
            session.tick(Date.now());
            renderCountdown(Date.now());
            liveChrome();
            if (board && (session.isMoving() || session.cooldownLeft(seat, Date.now()) > 0)) board.kick();
        }, TICK_MS);
    }

    /**
     * AI 대전: 같은 실시간 세션을 내 기기에서 방장으로 돌리고, AI 샷은 상대 자리 문서처럼 넣어요.
     * 쿨다운·살아 있는 알 확인·판 끝 판정이 사람끼리 할 때와 똑같아요. 아무것도 서버에 쓰지 않아요.
     */
    function ensureAiLive() {
        const g = game();
        const key = `ai:${room.id}:${g.gid}`;
        if (room.status !== 'playing' || isAlkkagiLiveOver(g)) { stopLive(); return; }
        if (live && live.key === key) return;
        stopLive();
        const gid = g.gid;
        const seat = ALKKAGI_BLACK;
        const aiSeat = ALKKAGI_WHITE;
        const session = createLiveSession({
            seat,
            gid,
            now: Date.now(),
            hostRole: true,
            send: {
                writeState: () => Promise.resolve(),
                writeIntent: () => Promise.resolve(),
                finish: (r) => finishAi(gid, r),
            },
        });
        const cur = { key, roomId: room.id, gid, seat, session, unsub: null, timer: null, lock: null, driver: null, aiN: 0, startAt: Date.now() + ALKKAGI_LIVE_COUNTDOWN_MS };
        live = cur;
        session.init(null, { hostSeat: seat, nowMs: Date.now() });
        cur.driver = createLiveAiDriver({
            color: aiSeat,
            level: ai.level,
            seed: ai.seed,
            submit: (shot) => {
                if (live !== cur) return;
                cur.aiN += 1;
                session.onSeatDoc(aiSeat, { seat: aiSeat, gid, n: cur.aiN, shot });
                session.tick(Date.now());
                if (board) board.kick();
            },
        });
        stats.games += 1;
        cur.timer = setInterval(() => {
            if (live !== cur) return;
            const t = Date.now();
            session.tick(t);
            renderCountdown(t);
            if (t < cur.startAt) { liveChrome(); return; }
            cur.driver.tick(t, {
                cooldownLeft: session.cooldownLeft(aiSeat, t),
                moving: session.isMoving(),
                over: session.isFinished(),
                alive: session.aliveCount(aiSeat),
                oppAlive: session.aliveCount(seat),
                stones: session.stones(),
            });
            liveChrome();
            if (board && (session.isMoving() || session.cooldownLeft(seat, t) > 0)) board.kick();
        }, TICK_MS);
    }

    /** 판 시작 카운트다운이 몇 ms 남았는지(끝났거나 없으면 0). */
    function countdownLeft(t = Date.now()) {
        if (!live || !live.startAt) return 0;
        return Math.max(0, live.startAt - t);
    }

    /** 판 가운데 3 → 2 → 1 → 시작! 을 보여 줘요. '시작!'은 0.6초 동안 남겨요. */
    function renderCountdown(t = Date.now()) {
        const el = $('alkLiveCountdown');
        if (!el) return;
        const left = countdownLeft(t);
        const showGo = live && live.startAt && left <= 0 && t - live.startAt < 600;
        const text = left > 0 ? String(Math.ceil(left / 1000)) : (showGo ? '시작!' : '');
        el.classList.toggle('hidden', !text);
        const num = el.querySelector('.alk-countdown-num');
        if (num && num.textContent !== text) {
            num.textContent = text;
            num.classList.toggle('is-go', !(left > 0));
            // 숫자가 바뀔 때마다 톡 튀어나오게 애니메이션을 다시 시작해요.
            num.style.animation = 'none';
            void num.offsetWidth;
            num.style.animation = '';
        }
    }

    /** AI 대전 판이 끝났어요(세션이 알이 멈춘 판을 보고 정한 결과). */
    function finishAi(gid, r) {
        if (!ai || !room || !live || live.gid !== gid || room.status !== 'playing') return;
        const done = finishAlkkagiLiveGame(room.game, { winner: r.winner, endReason: r.endReason, stones: r.stones, shots: r.shots, now: Date.now() });
        if (!done.ok) return;
        render({ ...room, status: 'finished', game: done.game });
    }

    /** AI와 실시간으로 하기. level: easy | normal | hard */
    function startAi(level) {
        stop();
        ai = { level: sanitizeAlkkagiAiLevel(level), seed: (Date.now() % 2147483646) + 1 };
        const now = Date.now();
        room = { id: ALKKAGI_LIVE_AI_ROOM_ID, gameType: 'alkkagiLive', status: 'playing', hostId: me(), game: emptyAlkkagiLiveGame({ now }) };
        return room;
    }

    /**
     * 판 계산 창이 판 끝 스냅샷을 저장한 뒤 방을 끝내요.
     * #100 M1: 같은 트랜잭션 안에서 live/state를 다시 읽어, 내가 저장한 판 끝(seq·epoch·승패)과 같을 때만 끝내요.
     * 그사이 다른 창·기기가 더 앞선 판을 썼으면 끝내지 않고 그 판을 따라가요(틀린 승패 기록 막기).
     */
    async function finishFromHost(roomId, gid, seat, r) {
        const { doc } = fsDeps();
        const cur0 = live;
        if (!cur0 || cur0.roomId !== roomId || cur0.gid !== gid || !cur0.session.hasRole()) return;
        const stateRef = doc(liveCol(roomId), 'state');
        let staleDoc;
        stats.roomWrites += 1;
        await deps.mutateRoom(roomId, (cur) => {
            const g = sanitizeAlkkagiLiveGame(cur.game);
            if (g.gid !== gid || cur.status !== 'playing') return { ok: false, error: 'stale' };
            const done = finishAlkkagiLiveGame(cur.game, { winner: r.winner, endReason: r.endReason, stones: r.stones, shots: r.shots, now: Date.now() });
            if (!done.ok) return done;
            return { ok: true, room: deps.applyRoomGame(cur, { game: done.game, now: Date.now(), finished: true }) };
        }, {
            silent: true,
            txCheck: async (tx) => {
                staleDoc = undefined;
                // 이 창이 그사이 잠금을 잃었으면 끝내지 않아요(맡은 창이 끝내요).
                if (live !== cur0 || !cur0.session.hasRole()) return false;
                const snap = await tx.get(stateRef);
                const data = snap.exists() ? snap.data() : null;
                if (liveFinishMatches(data, { gid, seq: r.seq, epoch: r.epoch, winner: r.winner, endReason: r.endReason, hostSeat: seat })) return true;
                staleDoc = data;
                return false;
            },
        });
        if (staleDoc !== undefined && live === cur0) {
            console.warn('alkLive finish skipped: live/state moved on');
            cur0.session.resyncTo(staleDoc, Date.now());
            if (board) board.kick();
        }
    }

    /** AI 대전이면 안내 문구를 AI에 맞게 바꿔요(방장·전적 말은 빼요). */
    function aiGuide(guide) {
        if (!ai) return guide;
        if (guide.phase === 'over') return { ...guide, tip: `${aiWith()} 한 판 더 할 수 있어요. 전적에는 들어가지 않아요.` };
        if (guide.phase === 'play') return { ...guide, tip: `${aiName()}도 5초마다 쏴요. 알을 꾹 잡고 반대쪽으로 당겼다 놓아요.`, who: '' };
        return { ...guide, who: '' };
    }

    /** 쿨다운·연결 상태처럼 자주 바뀌는 부분만 다시 그려요. */
    function liveChrome() {
        if (!room) return;
        const g = game();
        const seat = mySeat();
        const over = room.status === 'finished' || isAlkkagiLiveOver(g);
        const s = live && live.session;
        const t = Date.now();
        const pill = $('alkLivePill');
        const pillText = $('alkLivePillText');
        const pillDot = $('alkLivePillDot');
        if (over || !s) {
            if (board) board.setView({ canShoot: false, cooldown: 0 });
            return;
        }
        const left = s.cooldownLeft(seat, t);
        const can = s.canShoot(t);
        const guide = aiGuide(alkkagiLiveGuide({ enabled: ALKKAGI_LIVE_ENABLED, over: false, seat, connected: true, ready: s.isReady(), isHost: s.isHost(), viewOnly: s.isViewOnly() }));
        const playable = guide.phase === 'play';
        let line = guide.line;
        let cls = playable ? 'is-ready' : 'is-wait';
        if (!playable) { /* 스위치 꺼짐·연결 중·구경: 안내 그대로 */ }
        else if (countdownLeft(t) > 0) { line = `${Math.ceil(countdownLeft(t) / 1000)}초 뒤에 시작해요`; cls = 'is-wait'; }
        else if (s.aliveCount(seat) === 0) { line = '남은 알이 없어요'; cls = 'is-wait'; }
        else if (can.error === 'sending') { line = '샷을 보내는 중이에요'; cls = 'is-wait'; }
        else if (left > 0) { line = `다시 쏘기까지 ${liveCooldownLabel(left)}`; cls = 'is-wait'; }
        if (flashUntil > t) cls = 'is-end';
        if (failUntil > t) { line = '샷이 전달되지 않았어요. 다시 쏴 주세요'; cls = 'is-end'; }
        if (playable && aimLostUntil > t && aimLostText) { line = aimLostText; cls = 'is-end'; }
        if (pill) {
            pill.classList.toggle('is-ready', cls === 'is-ready');
            pill.classList.toggle('is-wait', cls === 'is-wait');
            pill.classList.toggle('is-end', cls === 'is-end');
        }
        if (pillText && pillText.textContent !== line) pillText.textContent = line;
        if (pillDot) pillDot.className = `alk-mini ${seat === ALKKAGI_WHITE ? 'w' : 'b'}`;
        [['Black', ALKKAGI_BLACK], ['White', ALKKAGI_WHITE]].forEach(([k, color]) => {
            const cool = $(`alkLiveCool${k}`);
            if (!cool) return;
            const l = s.cooldownLeft(color, t);
            cool.style.setProperty('--k', String(Math.max(0, Math.min(1, 1 - l / ALKKAGI_LIVE_COOLDOWN_MS))));
            cool.classList.toggle('is-ready', l <= 0);
            const leftEl = $(`alkLiveLeft${k}`);
            const alive = s.aliveCount(color);
            if (leftEl && leftEl.textContent !== `${alive}개`) {
                leftEl.textContent = `${alive}개`;
                renderDots($(`alkLiveDots${k}`), alive, color === ALKKAGI_WHITE ? 'w' : 'b');
            }
        });
        const tip = $('alkLiveTip');
        if (tip) {
            const html = `${esc(guide.tip)}${guide.who ? `<span class="alk-guide">${esc(guide.who)}</span>` : ''}`;
            if (tip.innerHTML !== html) tip.innerHTML = html;
        }
        if (board) board.setView({ canShoot: playable && can.ok && countdownLeft(t) <= 0, cooldown: left / ALKKAGI_LIVE_COOLDOWN_MS });
    }

    function renderDots(el, alive, cls) {
        if (!el) return;
        let html = '';
        for (let i = 0; i < ALKKAGI_STONES_PER_SIDE; i += 1) html += `<i class="alk-mini ${cls}${i < alive ? '' : ' gone'}"></i>`;
        el.innerHTML = html;
    }

    function chrome() {
        if (!room) return;
        const g = game();
        const seat = mySeat();
        const over = room.status === 'finished' || isAlkkagiLiveOver(g);
        const aliveB = liveAliveCount(shownStones, ALKKAGI_BLACK);
        const aliveW = liveAliveCount(shownStones, ALKKAGI_WHITE);
        [['Black', ALKKAGI_BLACK, aliveB, 'b'], ['White', ALKKAGI_WHITE, aliveW, 'w']].forEach(([k, color, alive, cls]) => {
            const card = $(`alkLiveCard${k}`);
            const nameEl = $(`alkLiveName${k}`);
            if (card) {
                card.classList.toggle('on', !over && seat === color);
                card.classList.toggle('is-win', over && g.winner === color);
            }
            if (nameEl) {
                nameEl.textContent = nameOf(color);
                const badge = nameEl.parentElement && nameEl.parentElement.querySelector('.alk-me');
                if (seat === color && !badge) nameEl.insertAdjacentHTML('afterend', '<span class="alk-me">나</span>');
                if (seat !== color && badge) badge.remove();
            }
            const left = $(`alkLiveLeft${k}`);
            if (left) left.textContent = `${alive}개`;
            renderDots($(`alkLiveDots${k}`), alive, cls);
            const cool = $(`alkLiveCool${k}`);
            if (cool) {
                cool.style.setProperty('--k', '1');
                cool.classList.toggle('is-ready', !over);
            }
        });
        const pill = $('alkLivePill');
        const pillText = $('alkLivePillText');
        const pillDot = $('alkLivePillDot');
        const tip = $('alkLiveTip');
        // 상단 알약과 아래 안내가 같은 상태를 말하게 한곳(alkkagiLiveGuide)에서 골라요.
        // 연결이 붙으면 liveChrome()이 같은 함수로 '지금 쏠 수 있어요'·쿨다운 안내로 바꿔요.
        const s = live && live.session;
        const guide = aiGuide(alkkagiLiveGuide({
            enabled: ALKKAGI_LIVE_ENABLED,
            over,
            seat,
            connected: !!s,
            ready: !!(s && s.isReady()),
            isHost: !!(s && s.isHost()),
            viewOnly: !!(s && s.isViewOnly()),
            recordText: over && !ai ? deps.myRecordText() : '',
        }));
        const line = guide.line;
        const tipHtml = `${esc(guide.tip)}${guide.who ? `<span class="alk-guide">${esc(guide.who)}</span>` : ''}`;
        if (pill) {
            pill.classList.toggle('is-end', over);
            pill.classList.toggle('is-ready', false);
            pill.classList.toggle('is-wait', !over);
        }
        if (pillText) pillText.textContent = line;
        if (pillDot) pillDot.className = `alk-mini ${(over ? g.winner || seat : seat) === ALKKAGI_WHITE ? 'w' : 'b'}`;
        if (tip) tip.innerHTML = tipHtml;
        const res = $('alkLiveResult');
        if (res) {
            res.classList.toggle('hidden', !over);
            if (over) {
                const draw = !g.winner;
                const key = `${room.id}:${g.gid}:${g.endReason}`;
                if (res.dataset.key !== key) {
                    res.dataset.key = key;
                    const card = res.querySelector('.alk-result-card');
                    if (card) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
                }
                res.classList.toggle('is-draw', draw);
                const names = { blackName: nameOf(ALKKAGI_BLACK), whiteName: nameOf(ALKKAGI_WHITE) };
                const stone = $('alkLiveResultStone');
                if (stone) stone.className = `alk-result-stone ${draw ? 'draw' : g.winner === ALKKAGI_WHITE ? 'w' : 'b'}`;
                const title = $('alkLiveResultTitle');
                if (title) title.textContent = alkkagiLiveResultTitle(g, names);
                const lineEl = $('alkLiveResultLine');
                if (lineEl) lineEl.textContent = alkkagiLiveEndText(g, names);
                const leftEl = $('alkLiveResultLeft');
                if (leftEl) leftEl.textContent = `남은 알 ${names.blackName} ${aliveB}개 · ${names.whiteName} ${aliveW}개`;
            }
        }
        const play = $('alkLivePlayActions');
        const result = $('alkLiveResultActions');
        // AI 대전에는 닫을 방이 없어서 '그만할래요'로 보여요.
        const closeLabel = result && result.querySelector('.alk-btn.sub span');
        const closeText = ai ? '그만할래요' : '방 닫을게요';
        if (closeLabel && closeLabel.textContent !== closeText) closeLabel.textContent = closeText;
        const badge = document.querySelector('#boardgameAlkLivePlayView .alk-live-badge');
        const badgeText = ai ? `실시간 · ${aiName()}` : '실시간';
        if (badge && badge.textContent !== badgeText) badge.textContent = badgeText;
        if (play) play.classList.toggle('hidden', over);
        if (result) result.classList.toggle('hidden', !over);
        if (board) board.setView({ flip: seat === ALKKAGI_WHITE, myColor: seat, canShoot: false, cooldown: 0, active: !over });
        liveChrome();
    }

    /** 방 문서가 바뀔 때마다 불러요(판 화면에 있을 때). */
    function render(nextRoom) {
        room = nextRoom;
        stats.roomReads += 1;
        const b = ensureBoard();
        const g = game();
        ensureLive();
        // 실시간 판이 붙어 있으면 그 판을, 아니면(시작 전·끝난 판) 방 문서의 좌표를 보여 줘요.
        if (!live || !live.session.isReady()) shownStones = g.stones.map((s) => ({ ...s, vx: 0, vy: 0 }));
        if (b) { b.resize(); b.kick(); }
        if (room.status === 'finished' && !ai) deps.recordResult(room);
        chrome();
    }

    function stop() {
        closeDialogs();
        stopLive();
        room = null;
        ai = null;
    }

    function closeDialogs() {
        Array.from(dialogs).forEach((close) => close());
    }

    function dialog(message, buttons, title = '') {
        return new Promise((resolve) => {
            const host = $('boardgameAlkLivePlayView') || document.body;
            const cancelBtn = buttons.find((b) => b.cancel) || buttons[buttons.length - 1];
            const wrap = document.createElement('div');
            wrap.className = 'alk-modal';
            wrap.setAttribute('role', 'dialog');
            wrap.setAttribute('aria-modal', 'true');
            wrap.innerHTML = `<div class="alk-modal-card alk-hanji">
                ${title ? `<p class="alk-modal-title">${esc(title)}</p>` : ''}
                <div class="alk-modal-text">${message}</div>
                <div class="alk-btns">${buttons.map((b, i) => `<button type="button" class="alk-btn ${b.main ? 'main' : b.danger ? 'sub danger alk-hanji' : 'sub alk-hanji'}" data-i="${i}"><span>${esc(b.label)}</span></button>`).join('')}</div>
            </div>`;
            host.appendChild(wrap);
            let done = false;
            const onKey = (e) => {
                if (done || e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                finish(cancelBtn.value);
            };
            const finish = (v) => {
                if (done) return;
                done = true;
                dialogs.delete(cancel);
                window.removeEventListener('keydown', onKey, true);
                wrap.remove();
                resolve(v);
            };
            const cancel = () => finish(cancelBtn.value);
            dialogs.add(cancel);
            window.addEventListener('keydown', onKey, true);
            wrap.querySelectorAll('[data-i]').forEach((btn) => btn.addEventListener('click', () => finish(buttons[Number(btn.getAttribute('data-i'))].value)));
            const first = wrap.querySelector(`.alk-btn[data-i="${Math.max(0, buttons.indexOf(cancelBtn))}"]`);
            if (first) first.focus({ preventScroll: true });
        });
    }

    /** how: 'resign'(기권 버튼) | 'left'(나가기). 결과 문구만 달라요. */
    async function forfeitNow(how = 'left') {
        if (!room) return null;
        const seat = mySeat();
        const id = room.id;
        if (ai) {
            const done = applyAlkkagiLiveForfeit(room.game, { color: seat, stones: live ? live.session.stones() : shownStones, now: Date.now(), how });
            if (!done.ok) return null;
            const next = { ...room, status: 'finished', game: done.game };
            render(next);
            return next;
        }
        return deps.mutateRoom(id, (cur) => {
            const done = applyAlkkagiLiveForfeit(cur.game, { color: seat, stones: live ? live.session.stones() : shownStones, now: Date.now(), how });
            if (!done.ok) return { ok: false, error: done.error };
            return { ok: true, room: deps.applyRoomGame(cur, { game: done.game, now: Date.now(), finished: true }) };
        });
    }

    async function forfeit() {
        if (!room || room.status !== 'playing') return;
        const ok = await dialog(ai ? `기권하면 ${esc(aiSubject())} 이겨요.<br>정말 기권할까요?` : '기권하면 지는 걸로 기록돼요.<br>정말 기권할까요?', [
            { label: '계속할래요', value: false, main: true, cancel: true },
            { label: '기권할게요', value: true, danger: true },
        ]);
        if (ok) await forfeitNow('resign');
    }

    /** 나가기: 두는 중이면 기권하고 방 목록으로 가요. true를 돌려주면 처리 끝. */
    async function leave() {
        if (!room) return false;
        if (ai) {
            if (room.status === 'playing' && !isAlkkagiLiveOver(room.game)) {
                const ok = await dialog('지금 나가면 이 판은 끝나요.<br>그래도 나갈까요?', [
                    { label: '계속할래요', value: false, main: true, cancel: true },
                    { label: '나갈게요', value: true, danger: true },
                ]);
                if (!ok) return true;
            }
            stop();
            deps.toLobby();
            return true;
        }
        if (room.status === 'playing' && !isAlkkagiLiveOver(room.game)) {
            const ok = await dialog('지금 나가면 지는 걸로 기록돼요.<br>그래도 나갈까요?', [
                { label: '계속할래요', value: false, main: true, cancel: true },
                { label: '나갈게요', value: true, danger: true },
            ]);
            if (!ok) return true;
            const r = room;
            await forfeitNow('left');
            deps.markLeft(r);
        }
        stop();
        deps.toLobby();
        return true;
    }

    async function continueGame() {
        if (!room) return;
        if (ai) {
            const level = ai.level;
            render(startAi(level));
            return;
        }
        await deps.mutateRoom(room.id, (cur) => deps.continueRoom(cur, { actorId: me(), now: Date.now() }));
    }

    async function close() {
        if (!room) return;
        if (ai) {
            stop();
            deps.toLobby();
            return;
        }
        const ok = await dialog('방을 닫을까요?<br>목록에서도 사라져요.', [
            { label: '그대로 둘래요', value: false, main: true, cancel: true },
            { label: '닫을게요', value: true, danger: true },
        ]);
        if (!ok || !room) return;
        const id = room.id;
        const closed = await deps.mutateRoom(id, (cur) => deps.closeRoom(cur, { actorId: me(), now: Date.now() }));
        if (closed) {
            stopLive();
            // 방 문서를 먼저 지우면 deps.deleteRoom(deleteBoardRoomDoc)이 live 하위 문서(state·black·white)도 지워요.
            // 규칙은 방이 남아 있는 동안 live 지우기를 막아요(되감기 방지).
            await deps.deleteRoom(id);
        }
        stop();
        deps.toLobby();
    }

    function showRules() {
        if (!ALKKAGI_LIVE_ENABLED) {
            return dialog('실시간 대전은 준비하고 있어요.<br>열리면 여기에서 규칙을 알려 드릴게요.', [{ label: '알겠어요', value: true, main: true }], '실시간 규칙');
        }
        return dialog(
            '차례가 없어요. 두 사람이 동시에 쏴요. 시작할 때 3초를 센 뒤에 쏠 수 있어요.<br>한 번 쏘면 5초 동안 쉬어요. 카드 아래 막대와 알 둘레 고리가 다 차면 다시 쏠 수 있어요.<br>'
            + '내 알을 꾹 잡고 반대쪽으로 당겼다가 놓으면 튕겨 나가요. 알이 움직이는 중에도 쏠 수 있어요.<br>'
            + '상대 알을 먼저 모두 떨어뜨리면 이겨요. 마지막 알이 함께 떨어지면 비겨요.<br>'
            + (ai ? `${esc(aiSubject())} 흰 알이에요. AI도 5초에 한 번 쏴요. AI와 한 판은 전적에 들어가지 않아요.` : '방장 화면 판이 기준이에요. 한 기기에서는 창 하나로만 둘 수 있어요.'),
            [{ label: '알겠어요', value: true, main: true }],
            '실시간 규칙',
        );
    }

    function refresh() { if (room) chrome(); }

    return {
        stats: () => ({ ...stats }),
        render,
        refresh,
        stop,
        leave,
        forfeit,
        continueGame,
        close,
        showRules,
        closeDialogs,
        isActive: () => !!room,
        /** AI 대전 중인지(방 문서 없이 내 기기에서 도는 판) */
        isAi: () => !!(room && ai),
        startAi,
    };
}
