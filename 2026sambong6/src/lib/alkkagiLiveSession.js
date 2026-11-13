/**
 * 실시간 알까기 한 판의 동기화 규칙(순수 모듈). Firestore·DOM은 바깥(alkkagiLiveMode.js)에서 꽂아 줘요.
 *
 * 호스트(판 계산 맡은 기기)
 * - 엔진을 실제 시계에 맞춰 돌리고, 상대 샷 의도(live/{상대 자리})가 오면 받아들일지 정해 판에 넣어요.
 * - 스냅샷(live/state)은 샷을 넣었을 때·알이 모두 멈췄을 때·판이 끝났을 때만 써요(프레임마다 쓰지 않아요).
 *   한꺼번에 몰리면 250ms에 한 번으로 모아요.
 * - 알이 멈추면 승패를 봐요. 상대 알이 0개면 승, 둘 다 0개면 무승부.
 * 게스트
 * - 쏘면 내 화면에 바로 보여 주고(예측) 의도만 보내요. 스냅샷이 오면 그 판으로 맞춰요.
 *   아직 호스트가 넣지 않은 내 샷은 스냅샷 위에 다시 얹어 깜빡이지 않게 해요.
 * 둘 다
 * - 각자 5초에 한 번만 쏴요. 보내는 중인 샷이 있으면 기다려요.
 * 같은 기기에서 창을 여러 개 열었을 때(#100 M1)
 * - 한 판·한 자리는 창 하나만 맡아요(hostRole, alkkagiLiveTabLock.js). 못 맡은 창은 '보기만' 해요:
 *   스냅샷만 따라가고, 쏘지도·판 계산도·판 끝내기도 하지 않아요.
 * - 그래도 다른 기기(같은 계정)가 같은 자리로 스냅샷을 쓸 수 있어요. 그래서 호스트도
 *   · 내가 아는 것보다 seq가 앞선 스냅샷이 오면 그 판을 따라가고(내 판을 버려요),
 *   · 스냅샷 쓰기가 거절되면(규칙: seq는 +1만) 최신 스냅샷을 다시 읽어 따라가요.
 *   · 판 끝(over) 스냅샷이 실제로 저장된 뒤에만 방을 끝내요(send.finish). 저장이 안 되면 끝내지 않아요.
 */

import { createLiveEngine } from './alkkagiLiveEngine.js';
import {
    ALKKAGI_LIVE_COOLDOWN_MS,
    alkkagiLiveOther,
    alkkagiLiveSeat,
    decideLiveIntent,
    emptyLiveState,
    isNewerLiveState,
    judgeLiveStones,
    liveCooldownLeft,
    sanitizeLiveSeatDoc,
    sanitizeLiveState,
} from './alkkagiLiveGame.js';

export const ALKKAGI_LIVE_WRITE_GAP_MS = 250;
/** 샷 의도 쓰기가 거절되면 이만큼 기다렸다가 같은 샷을 한 번 더 보내요(#106). */
export const ALKKAGI_LIVE_INTENT_RETRY_MS = 700;
/**
 * 게스트: 내 샷이 아직 호스트 판에 들어가지 않은 동안에는 호스트의 중간 판으로 되돌리지 않고 기다려요.
 * 예전에는 중간 판마다 내 샷을 다시 얹어서, 같은 알이 다른 자리에서 두세 번 굴러가고 겹쳐 보였어요(#106).
 * 이 시간 안에 내 샷이 든 판이 오지 않으면 그때 한 번만 맞춰요.
 */
export const ALKKAGI_LIVE_PENDING_HOLD_MS = 1200;

/**
 * @param {{ seat: string, gid: number, now: number,
 *   send: { writeState: (state:object)=>Promise<any>, writeIntent: (intent:{n:number, shot:object})=>Promise<any>, finish: (result:{winner:string,endReason:string,stones:any[],shots:number})=>void } }} opts
 */
export function createLiveSession({ seat, gid, now = 0, send, cooldownMs = ALKKAGI_LIVE_COOLDOWN_MS, writeGapMs = ALKKAGI_LIVE_WRITE_GAP_MS, hostRole = true, retryMs = ALKKAGI_LIVE_INTENT_RETRY_MS, holdMs = ALKKAGI_LIVE_PENDING_HOLD_MS, schedule = (fn, ms) => setTimeout(fn, ms) } = {}) {
    const me = alkkagiLiveSeat(seat);
    const other = alkkagiLiveOther(me);
    let st = emptyLiveState({ gid }); // 마지막으로 알고 있는 스냅샷(호스트면 내가 쓰는 값)
    let ready = false;
    let engine = createLiveEngine({ stones: st.stones, now });
    let dirty = false;
    let lastWriteAt = 0;
    let writing = false;
    let wasMoving = false;
    let finished = false;
    let lastTick = Number(now) || 0;
    const events = { hits: [], outs: [], launches: [], fails: [] };
    // 내 샷
    let myN = 0;
    let myLastAt = 0; // 내 시계
    let pending = null; // 게스트: { n, shot, at }
    let held = null; // 게스트: 내 샷을 기다리느라 아직 맞추지 않은 호스트 판(#106)
    let inflight = false;
    // 상대 샷(표시용 쿨다운)
    let oppLastAt = 0;
    let lastSeenOppShot = '';
    let otherIntent = null; // 호스트: 상대 자리 문서 최신값
    const stats = { stateWrites: 0, intentWrites: 0, stateReads: 0, seatReads: 0, rejected: 0, applied: 0, stateWriteFailed: 0, resyncs: 0, foreignStates: 0 };
    const notes = [];
    const heldReleases = []; // tick에서 맞춘 판의 이전 좌표(화면 보정용)
    // #100 M1: 이 창이 이 자리를 맡았는지(같은 기기 창 잠금). false면 보기만 해요.
    let role = hostRole !== false;
    // 마지막으로 저장에 성공한 내 스냅샷 seq(판 끝내기 전 다시 확인할 때 써요)
    let writtenSeq = -1;
    let resyncing = false;
    let finishPending = null; // 판 끝 스냅샷이 저장되면 부를 결과

    const seatIsHost = () => ready && st.hostSeat === me;
    const isHost = () => seatIsHost() && role;

    function note(type, extra = {}) {
        notes.push({ type, ...extra });
        if (notes.length > 20) notes.shift();
    }

    function pushEvents(r) {
        if (!r) return;
        events.hits.push(...r.hits);
        events.outs.push(...r.outs);
    }

    function curState() {
        return { ...st, stones: engine.stones(), step: engine.step(), moving: !engine.isResting() };
    }

    /** 처음 받은 live/state 문서(없으면 null). 호스트 자리면 그대로 이어서 맡아요. */
    function init(stateDoc, { hostSeat, nowMs, seatDoc = null } = {}) {
        const t = Number(nowMs) || 0;
        const sd = stateDoc ? sanitizeLiveState(stateDoc) : null;
        if (sd && sd.gid === gid) {
            st = sd;
            engine = createLiveEngine({ stones: sd.stones, step: sd.step, now: t });
            if (sd.over) finished = true;
        } else {
            st = { ...emptyLiveState({ gid, hostSeat }), seq: 0 };
            engine = createLiveEngine({ stones: st.stones, now: t });
            if (st.hostSeat === me && role) dirty = true; // 첫 스냅샷을 만들어요(이 창이 맡았을 때만)
        }
        const mine = seatDoc ? sanitizeLiveSeatDoc(seatDoc, me) : null;
        if (mine && mine.gid === gid) myN = mine.n;
        if (st.hostSeat === me) myN = Math.max(myN, st.applied[me]);
        ready = true;
        wasMoving = !engine.isResting();
    }

    function cooldownLeft(who, nowMs) {
        const s = alkkagiLiveSeat(who);
        return liveCooldownLeft(s === me ? myLastAt : oppLastAt, nowMs, cooldownMs);
    }

    function canShoot(nowMs) {
        if (!ready || finished || st.over) return { ok: false, error: 'not_ready' };
        if (!role) return { ok: false, error: 'other_tab' };
        if (resyncing) return { ok: false, error: 'sending' };
        if (inflight || pending) return { ok: false, error: 'sending' };
        if (cooldownLeft(me, nowMs) > 0) return { ok: false, error: 'cooldown' };
        if (engine.aliveCount(me) === 0) return { ok: false, error: 'not_alive' };
        return { ok: true, error: '' };
    }

    function markOppShot(nowMs) {
        oppLastAt = nowMs;
    }

    function shoot(shot, nowMs) {
        const t = Number(nowMs) || 0;
        const can = canShoot(t);
        if (!can.ok) return can;
        const applied = engine.applyShot(shot, { color: me, nowMs: t });
        if (!applied.ok) return applied;
        myN += 1;
        myLastAt = t;
        events.launches.push({ by: me, id: applied.id, power: applied.power });
        if (isHost()) {
            st = { ...st, applied: { ...st.applied, [me]: myN }, lastShotAt: { ...st.lastShotAt, [me]: t }, last: { by: me, id: applied.id, n: myN, step: engine.step() }, shots: st.shots + 1 };
            stats.applied += 1;
            dirty = true;
            flush(t, true);
            return { ok: true, error: '' };
        }
        pending = { n: myN, shot, at: t };
        inflight = true;
        stats.intentWrites += 1;
        const n = myN;
        const sendOnce = () => Promise.resolve().then(() => send.writeIntent({ n, shot }));
        // #106: 처음 거절되면(간격·연결) 잠깐 기다렸다가 같은 샷을 한 번 더 보내요. 두 번째도 실패할 때만 알려요.
        const sendWithRetry = () => sendOnce().catch((e) => new Promise((resolve, reject) => {
            if (!pending || pending.n !== n) { reject(e); return; }
            stats.intentRetries = (stats.intentRetries || 0) + 1;
            note('intent_retry', { n });
            schedule(() => {
                if (!pending || pending.n !== n) { reject(e); return; }
                stats.intentWrites += 1;
                sendOnce().then(resolve, reject);
            }, retryMs);
        }));
        sendWithRetry()
            .then(() => { inflight = false; })
            .catch(() => {
                // 다시 보내도 못 보냈어요(규칙·연결). 번호를 되돌리고 다시 쏠 수 있게 해요.
                inflight = false;
                if (pending && pending.n === n) pending = null;
                myN = Math.max(0, n - 1);
                myLastAt = 0;
                note('intent_failed', { n });
                events.fails.push({ n, reason: 'send' });
                // 내 화면에만 먼저 굴린 샷을 거둬요: 마지막으로 받은 방장 판으로 돌아가요.
                if (!isHost()) { held = null; engine.adopt(st.stones, { step: st.step, nowMs: lastTick }); }
            });
        return { ok: true, error: '' };
    }

    /** 게스트: 아직 반영되지 않은 내 샷을 스냅샷 위에 다시 얹어요. */
    function reapplyPending() {
        if (!pending) return;
        if (st.applied[me] >= pending.n) { pending = null; return; }
        if (st.rejected[me] >= pending.n) { events.fails.push({ n: pending.n, reason: 'rejected' }); pending = null; myLastAt = 0; note('rejected', { n: myN }); return; }
        engine.applyShot(pending.shot, { color: me });
    }

    /** live/state 문서를 받았을 때. 화면 보정용 이전 좌표(before)를 돌려줘요. */
    function onStateDoc(doc, nowMs) {
        stats.stateReads += 1;
        const t = Number(nowMs) || 0;
        const next = sanitizeLiveState(doc);
        if (next.gid !== gid) return null;
        if (!isNewerLiveState(next, st) && ready) return null;
        const wasHost = isHost();
        // 내가 쓴 것(seq를 먼저 올리고 쓰므로 내 것은 seq가 지금 값과 같거나 작아요. 그건 위에서 걸러져요).
        // 여기까지 왔으면 같은 자리·같은 epoch인데 seq가 앞선 스냅샷이에요: 다른 창·다른 기기가 썼어요.
        // 내 판을 버리고 그 판을 따라가요(#100 M1). 안 그러면 판 계산이 둘로 갈라져요.
        if (wasHost && next.hostSeat === me && next.epoch === st.epoch) {
            stats.foreignStates += 1;
            note('foreign_state', { seq: next.seq, mine: st.seq });
        }
        // 다른 기기가 호스트를 넘겨받았어요(내가 호스트였다면 이제 게스트예요).
        if (wasHost && next.hostSeat !== me) note('lost_host');
        const lastKey = next.last ? `${next.last.by}:${next.last.n}` : '';
        if (next.last && next.last.by === other && lastKey !== lastSeenOppShot) {
            lastSeenOppShot = lastKey;
            markOppShot(t);
            events.launches.push({ by: other, id: next.last.id, power: 0.6 });
        }
        // #106: 게스트이고 내 샷이 아직 이 판에 없으면, 잠깐 맞추지 않고 들고 있어요(tick에서 시간이 넘으면 맞춰요).
        if (shouldHold(next, t)) {
            held = next;
            stats.held = (stats.held || 0) + 1;
            return null;
        }
        held = null;
        return adoptState(next, t);
    }

    function shouldHold(next, t) {
        if (!pending || next.hostSeat === me || next.over) return false;
        if (next.applied[me] >= pending.n || next.rejected[me] >= pending.n) return false;
        return t - pending.at < holdMs;
    }

    /** 들고 있던 호스트 판을 이제 맞춰요. 화면 보정용 이전 좌표를 돌려줘요. */
    function releaseHeld(t) {
        if (!held) return null;
        const next = held;
        held = null;
        return adoptState(next, t);
    }

    function adoptState(next, t) {
        st = next;
        const res = engine.adopt(next.stones, { step: next.step, nowMs: t });
        if (next.hostSeat !== me) reapplyPending();
        else myN = Math.max(myN, st.applied[me]);
        if (next.over) finished = true;
        else if (finished && !finishPending) finished = false;
        // 맡은 창이면 멈춘 판도 한 번 더 승패를 보게 해요(따라간 판이 이미 끝나 있을 수 있어요).
        wasMoving = isHost() ? true : !engine.isResting();
        // 따라간 판은 이미 저장된 판이에요. 내가 들고 있던 안 보낸 변경은 버려요.
        dirty = false;
        return res.before;
    }

    /**
     * 최신 스냅샷으로 강제로 맞춰요(같은 seq라도). 스냅샷 쓰기가 거절됐을 때·판 끝내기 확인이 어긋났을 때 써요.
     * doc이 없으면(판 시작 전) 아무것도 안 해요.
     */
    function resyncTo(doc, nowMs) {
        const t = Number(nowMs) || lastTick;
        if (!doc) return null;
        const next = sanitizeLiveState(doc);
        if (next.gid !== gid) return null;
        stats.resyncs += 1;
        held = null;
        note('resync', { seq: next.seq, mine: st.seq });
        finishPending = null;
        // 내가 쓴 판 끝이 저장되지 않았으면 판은 아직 안 끝난 거예요.
        if (!next.over) finished = false;
        return adoptState(next, t);
    }

    function startResync() {
        if (resyncing) return;
        if (typeof send.readState !== 'function') return;
        resyncing = true;
        Promise.resolve()
            .then(() => send.readState())
            .then((doc) => { resyncTo(doc, lastTick); })
            .catch((e) => { note('resync_failed', { msg: String(e && e.message || e).slice(0, 60) }); })
            .then(() => { resyncing = false; });
    }

    /**
     * 같은 기기 창 잠금이 바뀌었을 때(#100 M1).
     * - 잃으면: 바로 보기만 해요(쓰기·판 계산·판 끝내기 멈춤). 보내던 판 끝도 취소해요.
     * - 얻으면: 최신 스냅샷을 다시 읽어 맞춘 뒤 이어서 맡아요.
     */
    function setHostRole(on, nowMs) {
        const next = !!on;
        if (next === role) return;
        role = next;
        note(next ? 'role_gained' : 'role_lost');
        if (!next) {
            dirty = false;
            if (finishPending) { finishPending = null; if (!st.over) finished = false; }
            return;
        }
        lastTick = Number(nowMs) || lastTick;
        if (ready) startResync();
        if (seatIsHost()) dirty = true;
    }

    /** 상대 자리 문서(샷 의도·접속 표시). 호스트만 샷을 판에 넣어요. */
    function onSeatDoc(who, doc) {
        stats.seatReads += 1;
        const s = alkkagiLiveSeat(who);
        if (s && s === me) {
            // #100: 내 자리 문서 번호가 내가 아는 것보다 앞서 있으면(다른 기기·같이 하기에서 쓴 샷) 따라가요.
            // 그래야 다음 샷 번호(n+1)가 규칙에 막혀 계속 '전달되지 않았어요'가 나오지 않아요.
            const mine = sanitizeLiveSeatDoc(doc, s);
            if (mine.gid === gid && !inflight && !pending && mine.n > myN) myN = mine.n;
            return;
        }
        if (s !== other) return;
        const d = sanitizeLiveSeatDoc(doc, s);
        if (d.gid !== gid) return;
        otherIntent = d;
    }

    function processIntent(t) {
        const d = otherIntent;
        if (!d || !d.shot) return;
        if (d.n <= st.applied[other] || d.n <= st.rejected[other]) return;
        const verdict = decideLiveIntent(curState(), { seat: other, n: d.n, gid: d.gid, shot: d.shot, now: t });
        if (verdict.accept) {
            const r = engine.applyShot(d.shot, { color: other, nowMs: t });
            if (r.ok) {
                st = { ...st, applied: { ...st.applied, [other]: d.n }, lastShotAt: { ...st.lastShotAt, [other]: t }, last: { by: other, id: r.id, n: d.n, step: engine.step() }, shots: st.shots + 1 };
                markOppShot(t);
                events.launches.push({ by: other, id: r.id, power: r.power });
                stats.applied += 1;
                dirty = true;
                return;
            }
        }
        if (verdict.reject || verdict.accept) {
            st = { ...st, rejected: { ...st.rejected, [other]: d.n } };
            stats.rejected += 1;
            dirty = true;
            note('reject_intent', { reason: verdict.reason || 'not_alive', n: d.n });
        }
    }

    function flush(t, force = false) {
        if (!isHost() || !dirty || writing || resyncing) return;
        if (!force && t - lastWriteAt < writeGapMs) return;
        dirty = false;
        lastWriteAt = t;
        writing = true;
        st = { ...curState(), seq: st.seq + 1 };
        stats.stateWrites += 1;
        const snap = st;
        Promise.resolve()
            .then(() => send.writeState(snap))
            .then(() => {
                writing = false;
                // 내 창이 아직 맡고 있고, 그사이 남의 스냅샷을 따라가지 않았을 때만 '내 판이 저장됐다'고 봐요.
                if (st.seq === snap.seq && st.epoch === snap.epoch) writtenSeq = snap.seq;
                if (finishPending && snap.over && role && writtenSeq === snap.seq) {
                    const r = finishPending;
                    finishPending = null;
                    if (send.finish) send.finish({ ...r, seq: snap.seq, epoch: snap.epoch });
                }
                if (dirty) flush(lastTick, false);
            }, (e) => {
                // 규칙(seq +1만)에 막혔거나 연결 문제예요. 다른 창·기기가 먼저 썼을 수 있어요:
                // 내 판을 믿지 말고 최신 스냅샷을 다시 읽어 맞춰요. 판 끝도 취소해요(저장 안 된 승패는 기록하지 않아요).
                writing = false;
                stats.stateWriteFailed += 1;
                note('state_write_failed', { msg: String(e && e.message || e).slice(0, 60), seq: snap.seq });
                if (finishPending) { finishPending = null; finished = false; st = { ...st, over: null }; }
                wasMoving = true; // 다시 맞춘 뒤 멈춰 있으면 승패를 다시 봐요
                if (typeof send.readState === 'function') startResync();
                else { st = { ...st, seq: Math.max(0, st.seq - 1) }; dirty = true; }
            });
    }

    /** 화면 프레임·타이머마다 불러요. */
    function tick(nowMs) {
        const t = Number(nowMs) || 0;
        lastTick = t;
        if (!ready) return;
        pushEvents(engine.advance(t));
        if (isHost() && !finished) {
            processIntent(t);
            const moving = !engine.isResting();
            if (wasMoving && !moving) {
                dirty = true;
                const verdict = judgeLiveStones(engine.stones());
                if (verdict.endReason) {
                    finished = true;
                    st = { ...st, over: { endReason: verdict.endReason, winner: verdict.winner } };
                    // 판 끝 스냅샷이 저장된 뒤에만 방을 끝내요(flush 성공 쪽에서 send.finish).
                    finishPending = { ...verdict, stones: engine.stones(), shots: st.shots };
                    flush(t, true);
                }
            }
            wasMoving = moving;
            flush(t);
        } else if (isHost()) {
            flush(t); // 끝난 판의 마지막 스냅샷이 아직 못 나갔으면 보내요
        } else {
            if (held && !shouldHold(held, t)) {
                const before = releaseHeld(t);
                if (before) heldReleases.push(before);
            }
            wasMoving = !engine.isResting();
        }
    }

    function drainEvents() {
        const out = { hits: events.hits.splice(0), outs: events.outs.splice(0), launches: events.launches.splice(0), fails: events.fails.splice(0) };
        return out;
    }

    return {
        init,
        tick,
        shoot,
        canShoot,
        cooldownLeft,
        onStateDoc,
        onSeatDoc,
        drainEvents,
        isHost,
        /** 이 자리가 판 계산 자리인데 다른 창이 맡아서 이 창은 보기만 하는지 */
        isViewOnly: () => ready && !role,
        hasRole: () => role,
        setHostRole,
        resyncTo,
        writtenSeq: () => writtenSeq,
        isResyncing: () => resyncing,
        isReady: () => ready,
        /** tick에서 들고 있던 판을 맞췄으면 그 이전 좌표들(화면 보정용)을 꺼내요. */
        drainCorrections: () => heldReleases.splice(0),
        isHolding: () => !!held,
        isFinished: () => finished,
        stones: () => engine.stones(),
        aliveCount: (c) => engine.aliveCount(c),
        isMoving: () => !engine.isResting(),
        state: () => curState(),
        hostSeat: () => st.hostSeat,
        myN: () => myN,
        pending: () => pending,
        stats: () => ({ ...stats }),
        notes: () => notes.slice(),
        // 3단계(승계)에서 써요
        _engine: () => engine,
        _setState: (next) => { st = next; },
        _markDirty: () => { dirty = true; },
        _flush: (t, force) => flush(t, force),
    };
}
