/**
 * 실시간 알까기 화면(방 안). 로비·방 만들기·참가 승인은 보드게임 공통 방(sambongWorld.js)을 그대로 써요.
 * 기존 알까기(턴제·한 화면 둘이서·AI) 화면과 코드는 건드리지 않고, 이 파일과 #boardgameAlkLivePlayView 만 써요.
 */
import './alkkagiLive.css';
import { ALKKAGI_BLACK, ALKKAGI_STONES_PER_SIDE, ALKKAGI_WHITE } from './lib/alkkagiGame.js';
import {
    ALKKAGI_LIVE_COOLDOWN_MS,
    ALKKAGI_LIVE_HEARTBEAT_MS,
    ALKKAGI_LIVE_HOST_SILENT_MS,
    alkkagiLiveEndText,
    alkkagiLiveOther,
    alkkagiLiveResultTitle,
    alkkagiLiveSeat,
    applyAlkkagiLiveForfeit,
    finishAlkkagiLiveGame,
    isAlkkagiLiveOver,
    liveCooldownLabel,
    liveStateToDoc,
    liveAliveCount,
    sanitizeAlkkagiLiveGame,
} from './lib/alkkagiLiveGame.js';
import { createAlkkagiLiveBoard } from './lib/alkkagiLiveBoard.js';
import { createLiveSession } from './lib/alkkagiLiveSession.js';

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
    const stats = { stateWrites: 0, intentWrites: 0, seatWrites: 0, heartbeats: 0, roomWrites: 0, liveReads: 0, roomReads: 0, games: 0, takeovers: 0, lostHost: 0 };
    let flashUntil = 0;
    let failUntil = 0;
    let netMsg = null; // { text, until }
    const buf = { hits: [], outs: [] };
    const NET_TEXT = {
        takeover: '내 기기가 판을 이어 맡았어요',
        lost_host: '다시 연결됐어요',
    };

    const $ = (id) => document.getElementById(id);
    const me = () => String(deps.selfId() || '');
    const mySeat = (r = room) => (r ? alkkagiLiveSeat(deps.seatOf(r, me())) : '');
    const game = () => sanitizeAlkkagiLiveGame(room && room.game);
    const nameOf = (seat) => deps.memberName(room, seat);

    function ensureBoard() {
        if (board) return board;
        const canvas = $('alkLiveCanvas');
        if (!canvas) return null;
        if (deps.loadFonts) deps.loadFonts();
        board = createAlkkagiLiveBoard(canvas, {
            boundsEl: $('boardgameAlkLivePlayView'),
            frame: () => frameForBoard(),
            onShot: (shot) => onBoardShot(shot),
        });
        const view = $('boardgameAlkLivePlayView');
        if (view) view.addEventListener('pointerdown', () => { if (board) board.ensureSound(); }, { passive: true });
        if (window.__sambongE2E) {
            window.__alkLiveQA = {
                board: () => board,
                state: () => ({ room, stones: shownStones }),
                session: () => (live ? live.session : null),
                stats: () => ({ ...stats, session: live ? live.session.stats() : null }),
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

    /** 세션을 한 번 돌리고 사건을 모아요(화면 프레임과 타이머가 함께 불러요). */
    function pump() {
        if (!live || !live.session.isReady()) return;
        const s = live.session;
        const t = Date.now();
        s.tick(t);
        const ev = s.drainEvents();
        for (const l of ev.launches) if (board) board.launched(l.power);
        if (ev.fails.length) failUntil = t + 2200;
        buf.hits.push(...ev.hits);
        buf.outs.push(...ev.outs);
        for (const n of ev.net) {
            if (NET_TEXT[n.type]) netMsg = { text: NET_TEXT[n.type], until: t + 4500, type: n.type };
            if (n.type === 'takeover' || n.type === 'lost_host') {
                stats[n.type === 'takeover' ? 'takeovers' : 'lostHost'] += 1;
                if (board) board.kick();
            }
        }
        shownStones = s.stones();
    }

    function frameForBoard() {
        if (live && live.session.isReady()) {
            pump();
            const out = { stones: shownStones, hits: buf.hits.splice(0), outs: buf.outs.splice(0) };
            return out;
        }
        return { stones: shownStones };
    }

    function onBoardShot(shot) {
        if (!live || !room || room.status !== 'playing') return { ok: false, error: 'not_ready' };
        const r = live.session.shoot(shot, Date.now());
        if (!r.ok && r.error === 'cooldown') flashUntil = Date.now() + 700;
        if (board) board.kick();
        liveChrome();
        return r;
    }

    function stopLive() {
        if (!live) return;
        try { if (live.unsub) live.unsub(); } catch (_) { /* 무시 */ }
        if (live.timer) clearInterval(live.timer);
        live = null;
    }

    /** 두는 중인 판이면 live 하위 문서에 붙어요. 판(gid)이 바뀌면 새로 붙어요. */
    function ensureLive() {
        const g = game();
        const seat = mySeat();
        const key = `${room.id}:${g.gid}:${seat}`;
        if (live && live.key === key) return;
        stopLive();
        if (!seat || room.status !== 'playing' || isAlkkagiLiveOver(g)) return;
        const { doc, setDoc, onSnapshot, serverTimestamp } = fsDeps();
        if (!doc || !onSnapshot) return;
        const roomId = room.id;
        const col = liveCol(roomId);
        const sid = me();
        const gid = g.gid;
        const hostSeat = room.hostId && deps.seatOf(room, room.hostId) ? alkkagiLiveSeat(deps.seatOf(room, room.hostId)) || ALKKAGI_BLACK : ALKKAGI_BLACK;
        let cur = null;
        const session = createLiveSession({
            seat,
            gid,
            now: Date.now(),
            send: {
                writeState: (st) => { stats.stateWrites += 1; cur.wroteAt = Date.now(); return setDoc(doc(col, 'state'), { ...liveStateToDoc(st), at: serverTimestamp() }); },
                writeIntent: ({ n, shot }) => { stats.intentWrites += 1; cur.wroteAt = Date.now(); return setDoc(doc(col, seat), { seat, sid, gid, n, shot, shotAt: serverTimestamp(), seenAt: serverTimestamp() }); },
                finish: (r) => { void finishFromHost(roomId, gid, r); },
            },
        });
        // send는 init 뒤에만 불려서 그때는 cur가 채워져 있어요.
        cur = { key, roomId, gid, seat, session: null, unsub: null, timer: null, col, first: true, wroteAt: Date.now(), seatOk: false };
        cur.session = session;
        live = cur;
        stats.games += 1;
        // includeMetadataChanges: 내가 오프라인인지(fromCache) 알아야 승계·끊김을 잘못 정하지 않아요. 메타데이터만 바뀐 건 읽기로 치지 않아요.
        cur.unsub = onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
            if (live !== cur) return;
            const t = Date.now();
            session.setConnected(!snap.metadata.fromCache, t);
            const changes = snap.docChanges().filter((ch) => !ch.doc.metadata.hasPendingWrites);
            if (!snap.metadata.fromCache) stats.liveReads += changes.length;
            if (cur.first) {
                cur.first = false;
                let stateDoc = null;
                let mine = null;
                snap.forEach((d) => {
                    if (d.id === 'state') stateDoc = d.data();
                    if (d.id === seat) mine = d.data();
                });
                session.init(stateDoc, { hostSeat, nowMs: t, seatDoc: mine });
                snap.forEach((d) => { if (d.id === alkkagiLiveOther(seat)) session.onSeatDoc(d.id, d.data(), t); });
                // 내 자리 문서를 이번 판으로 만들어 둬요(번호 0). 같은 판을 새로고침한 거면 그대로 써요.
                if (!mine || Number(mine.gid) !== gid) {
                    stats.seatWrites += 1;
                    cur.wroteAt = t;
                    setDoc(doc(col, seat), { seat, sid, gid, n: 0, shot: null, shotAt: serverTimestamp(), seenAt: serverTimestamp() })
                        .then(() => { cur.seatOk = true; })
                        .catch((e) => console.warn('alkLive seat', e));
                } else {
                    cur.seatOk = true;
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
                } else if (id === alkkagiLiveOther(seat)) {
                    session.onSeatDoc(id, data, t);
                }
            });
            if (board) board.kick();
        }, (e) => console.warn('alkLive snapshot', e));
        cur.timer = setInterval(() => {
            if (live !== cur) return;
            const t = Date.now();
            pump();
            // 접속 표시: 20초 동안 내가 아무것도 안 썼으면 자리 문서의 seenAt만 다시 써요(샷 번호·시각은 그대로).
            if (cur.seatOk && session.isReady() && !session.isFinished() && t - cur.wroteAt >= ALKKAGI_LIVE_HEARTBEAT_MS) {
                cur.wroteAt = t;
                stats.heartbeats += 1;
                setDoc(doc(col, seat), { seenAt: serverTimestamp() }, { merge: true }).catch((e) => console.warn('alkLive heartbeat', e));
            }
            liveChrome();
            if (board && (session.isMoving() || session.cooldownLeft(seat, t) > 0)) board.kick();
        }, TICK_MS);
    }

    async function finishFromHost(roomId, gid, r) {
        stats.roomWrites += 1;
        await deps.mutateRoom(roomId, (cur) => {
            const g = sanitizeAlkkagiLiveGame(cur.game);
            if (g.gid !== gid || cur.status !== 'playing') return { ok: false, error: 'stale' };
            const done = finishAlkkagiLiveGame(cur.game, { winner: r.winner, endReason: r.endReason, stones: r.stones, shots: r.shots, now: Date.now() });
            if (!done.ok) return done;
            return { ok: true, room: deps.applyRoomGame(cur, { game: done.game, now: Date.now(), finished: true }) };
        }, { silent: true });
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
            const net = $('alkLiveNet');
            if (net) net.hidden = true;
            return;
        }
        const left = s.cooldownLeft(seat, t);
        const can = s.canShoot(t);
        let line = '지금 쏠 수 있어요';
        let cls = 'is-ready';
        if (!s.isReady()) { line = '판에 연결하는 중이에요'; cls = 'is-wait'; }
        else if (can.error === 'offline') { line = '연결되면 다시 쏠 수 있어요'; cls = 'is-wait'; }
        else if (s.aliveCount(seat) === 0) { line = '남은 알이 없어요'; cls = 'is-wait'; }
        else if (can.error === 'sending') { line = '샷을 보내는 중이에요'; cls = 'is-wait'; }
        else if (left > 0) { line = `다시 쏘기까지 ${liveCooldownLabel(left)}`; cls = 'is-wait'; }
        if (flashUntil > t) cls = 'is-end';
        if (failUntil > t) { line = '샷이 전달되지 않았어요. 다시 쏴 주세요'; cls = 'is-end'; }
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
            const who = s.isHost() ? '판 계산은 내 기기가 맡고 있어요.' : '판 계산은 방장 기기가 해요.';
            const html = `알을 꾹 잡고 반대쪽으로 당겼다 놓아요. 한 번 쏘면 5초 쉬어요.<span class="alk-guide">${who}</span>`;
            if (tip.innerHTML !== html) tip.innerHTML = html;
        }
        renderNet(s, t);
        if (board) board.setView({ canShoot: can.ok, cooldown: left / ALKKAGI_LIVE_COOLDOWN_MS });
    }

    /** 상단 오른쪽 연결 알림: 내 연결 끊김 · 승계/재연결 알림 · 상대(방장)가 오래 조용할 때 */
    function renderNet(s, t) {
        const el = $('alkLiveNet');
        if (!el) return;
        let text = '';
        let tone = '';
        const offline = !s.isConnected() || (typeof navigator !== 'undefined' && navigator.onLine === false);
        if (offline) { text = '연결 끊김 · 다시 잇는 중'; tone = 'bad'; }
        else if (netMsg && netMsg.until > t) { text = netMsg.text; tone = 'ok'; }
        else {
            const quiet = s.quietMs(t);
            if (quiet >= 25000) {
                if (s.isHost()) { text = '상대 연결 기다리는 중'; tone = 'wait'; }
                else {
                    const sec = Math.max(1, Math.ceil((ALKKAGI_LIVE_HOST_SILENT_MS - quiet) / 1000));
                    text = `방장 연결 약함 · ${sec}초 뒤 이어 맡기`;
                    tone = 'wait';
                }
            }
        }
        if (el.textContent !== text) el.textContent = text;
        el.hidden = !text;
        el.dataset.tone = tone;
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
        let line = '판을 준비하고 있어요';
        let tipHtml = '차례가 없어요. 둘이 동시에 쏘고, 한 번 쏘면 5초 쉬어요.';
        if (over) {
            line = '판이 끝났어요';
            tipHtml = `내 알까기 전적 ${esc(deps.myRecordText())}`;
        }
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
        if (room.status === 'finished') deps.recordResult(room);
        chrome();
    }

    function stop() {
        closeDialogs();
        stopLive();
        room = null;
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

    async function forfeitNow() {
        if (!room) return null;
        const seat = mySeat();
        const id = room.id;
        return deps.mutateRoom(id, (cur) => {
            const done = applyAlkkagiLiveForfeit(cur.game, { color: seat, stones: live ? live.session.stones() : shownStones, now: Date.now() });
            if (!done.ok) return { ok: false, error: done.error };
            return { ok: true, room: deps.applyRoomGame(cur, { game: done.game, now: Date.now(), finished: true }) };
        });
    }

    async function forfeit() {
        if (!room || room.status !== 'playing') return;
        const ok = await dialog('기권하면 지는 걸로 기록돼요.<br>정말 기권할까요?', [
            { label: '계속할래요', value: false, main: true, cancel: true },
            { label: '기권할게요', value: true, danger: true },
        ]);
        if (ok) await forfeitNow();
    }

    /** 나가기: 두는 중이면 기권하고 방 목록으로 가요. true를 돌려주면 처리 끝. */
    async function leave() {
        if (!room) return false;
        if (room.status === 'playing' && !isAlkkagiLiveOver(room.game)) {
            const ok = await dialog('지금 나가면 지는 걸로 기록돼요.<br>그래도 나갈까요?', [
                { label: '계속할래요', value: false, main: true, cancel: true },
                { label: '나갈게요', value: true, danger: true },
            ]);
            if (!ok) return true;
            const r = room;
            await forfeitNow();
            deps.markLeft(r);
        }
        stop();
        deps.toLobby();
        return true;
    }

    /** 방을 닫을 때 live 하위 문서(state·black·white)도 지워요. 못 지워도 다음 판은 새 gid라 섞이지 않아요. */
    async function deleteLiveDocs(roomId) {
        const { doc, deleteDoc } = fsDeps();
        if (!doc || !deleteDoc) return;
        const col = liveCol(roomId);
        await Promise.all(['state', ALKKAGI_BLACK, ALKKAGI_WHITE].map((id) => deleteDoc(doc(col, id)).catch(() => {})));
    }

    async function continueGame() {
        if (!room) return;
        await deps.mutateRoom(room.id, (cur) => deps.continueRoom(cur, { actorId: me(), now: Date.now() }));
    }

    async function close() {
        if (!room) return;
        const ok = await dialog('방을 닫을까요?<br>목록에서도 사라져요.', [
            { label: '그대로 둘래요', value: false, main: true, cancel: true },
            { label: '닫을게요', value: true, danger: true },
        ]);
        if (!ok || !room) return;
        const id = room.id;
        const closed = await deps.mutateRoom(id, (cur) => deps.closeRoom(cur, { actorId: me(), now: Date.now() }));
        if (closed) {
            stopLive();
            await deleteLiveDocs(id);
            await deps.deleteRoom(id);
        }
        stop();
        deps.toLobby();
    }

    function showRules() {
        return dialog(
            '차례가 없어요. 두 사람이 동시에 쏴요.<br>한 번 쏘면 5초 동안 쉬어요. 카드 아래 막대와 알 둘레 고리가 다 차면 다시 쏠 수 있어요.<br>'
            + '내 알을 꾹 잡고 반대쪽으로 당겼다가 놓으면 튕겨 나가요. 알이 움직이는 중에도 쏠 수 있어요.<br>'
            + '상대 알을 먼저 모두 떨어뜨리면 이겨요. 마지막 알이 함께 떨어지면 비겨요.<br>판 계산은 방장 기기가 해요.',
            [{ label: '알겠어요', value: true, main: true }],
            '실시간 규칙',
        );
    }

    function refresh() { if (room) chrome(); }

    return { stats: () => ({ ...stats }), render, refresh, stop, leave, forfeit, continueGame, close, showRules, closeDialogs, isActive: () => !!room };
}
