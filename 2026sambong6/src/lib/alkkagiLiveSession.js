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

/**
 * @param {{ seat: string, gid: number, now: number,
 *   send: { writeState: (state:object)=>Promise<any>, writeIntent: (intent:{n:number, shot:object})=>Promise<any>, finish: (result:{winner:string,endReason:string,stones:any[],shots:number})=>void } }} opts
 */
export function createLiveSession({ seat, gid, now = 0, send, cooldownMs = ALKKAGI_LIVE_COOLDOWN_MS, writeGapMs = ALKKAGI_LIVE_WRITE_GAP_MS } = {}) {
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
    let pending = null; // 게스트: { n, shot }
    let inflight = false;
    // 상대 샷(표시용 쿨다운)
    let oppLastAt = 0;
    let lastSeenOppShot = '';
    let otherIntent = null; // 호스트: 상대 자리 문서 최신값
    const stats = { stateWrites: 0, intentWrites: 0, stateReads: 0, seatReads: 0, rejected: 0, applied: 0 };
    const notes = [];

    const isHost = () => ready && st.hostSeat === me;

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
            if (st.hostSeat === me) dirty = true; // 첫 스냅샷을 만들어요
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
        pending = { n: myN, shot };
        inflight = true;
        stats.intentWrites += 1;
        const n = myN;
        Promise.resolve()
            .then(() => send.writeIntent({ n, shot }))
            .then(() => { inflight = false; })
            .catch(() => {
                // 규칙(서버 시각 4.5초)이나 연결 때문에 못 보냈어요. 번호를 되돌리고 다시 쏠 수 있게 해요.
                inflight = false;
                if (pending && pending.n === n) pending = null;
                myN = Math.max(0, n - 1);
                myLastAt = 0;
                note('intent_failed', { n });
                events.fails.push({ n, reason: 'send' });
                // 내 화면에만 먼저 굴린 샷을 거둬요: 마지막으로 받은 방장 판으로 돌아가요.
                if (!isHost()) engine.adopt(st.stones, { step: st.step, nowMs: lastTick });
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
        if (wasHost && next.hostSeat === me && next.epoch === st.epoch) return null; // 내가 쓴 것
        // 다른 기기가 호스트를 넘겨받았어요(내가 호스트였다면 이제 게스트예요).
        if (wasHost && next.hostSeat !== me) note('lost_host');
        const lastKey = next.last ? `${next.last.by}:${next.last.n}` : '';
        if (next.last && next.last.by === other && lastKey !== lastSeenOppShot) {
            lastSeenOppShot = lastKey;
            markOppShot(t);
            events.launches.push({ by: other, id: next.last.id, power: 0.6 });
        }
        st = next;
        const res = engine.adopt(next.stones, { step: next.step, nowMs: t });
        if (next.hostSeat !== me) reapplyPending();
        if (next.over) finished = true;
        wasMoving = !engine.isResting();
        return res.before;
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
        if (!isHost() || !dirty || writing) return;
        if (!force && t - lastWriteAt < writeGapMs) return;
        dirty = false;
        lastWriteAt = t;
        writing = true;
        st = { ...curState(), seq: st.seq + 1 };
        stats.stateWrites += 1;
        const snap = st;
        Promise.resolve()
            .then(() => send.writeState(snap))
            .catch((e) => { note('state_write_failed', { msg: String(e && e.message || e).slice(0, 60) }); })
            .then(() => {
                writing = false;
                if (dirty) flush(lastTick, false);
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
                    flush(t, true);
                    if (send.finish) send.finish({ ...verdict, stones: engine.stones(), shots: st.shots });
                }
            }
            wasMoving = moving;
            flush(t);
        } else if (isHost()) {
            flush(t); // 끝난 판의 마지막 스냅샷이 아직 못 나갔으면 보내요
        } else {
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
        isReady: () => ready,
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
