/**
 * OX 주말 보스레이드 화면. OX 퀴즈 무대(body)를 빌려 써요(탭 「보스레이드」).
 * 규칙은 oxBossRaid.js. 여기는 방 모으기·턴제 전투 화면(옛날 RPG 느낌)·보상·마스터 설정이에요.
 *
 * 방 하나 = 문서 하나(oxBossRaids/{방장 학번}). 차례인 사람이 답하면 그 결과가 문서에 적히고,
 * 모든 팀원 화면이 문서의 last(방금 일어난 일)를 보고 같은 연출을 틀어요.
 * 시간은 기기마다 시계가 달라도 되게, 문제를 화면에 띄운 때부터 각자 재요.
 *
 * api.boss: { watch(cb) → 끄기, tx(roomId, mutator) → Promise, me() → { id, name, gear }, avatar(id) → html,
 *   today() → 'YYYY-MM-DD', settings(), saveSettings(s), progress(), saveProgress(progress, bong, label) → Promise<boolean>, bong(v) → '3봉' }
 */
import '../oxBossRaid.css';
import {
    OXB_MAX_PARTY,
    OXB_PLAYER_HP,
    answerOxbTurn,
    buildOxbDeck,
    claimOxbReward,
    createOxbRoom,
    isOxbOpen,
    isOxbRoomStale,
    joinOxbRoom,
    leaveOxbRoom,
    oxbErrorText,
    oxbMember,
    oxbTurnInfo,
    readyOxbRoom,
    reopenOxbRoom,
    sanitizeOxbProgress,
    sanitizeOxbRoom,
    sanitizeOxbSettings,
    setOxbBoss,
    startOxbFight,
} from './oxBossRaid.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** 다른 팀원의 차례가 이만큼 더 지나도 안 넘어가면(자리를 비웠으면) 대신 시간 초과를 보내요. */
const ABSENT_GRACE_MS = 7000;

export function createOxBossRaid({ stage, body, api, getBank, setMeta, modeTabs, feedback = null }) {
    const boss = api.boss;
    const st = {
        active: false,
        rooms: [],
        unsub: null,
        pick: 0, // 방 만들 때 고른 보스
        busy: false,
        fightId: '', // 지금 화면에 깔린 전투
        seenTurn: -1, // 화면에 반영한 차례 번호
        chain: Promise.resolve(),
        qShownAt: 0,
        timer: 0,
        watchdog: 0,
        sentTurn: -1,
        result: null, // { fight, reward }
        claiming: '',
        done: new Set(), // 결과까지 본 전투
    };
    let actx = null;

    const me = () => String(api.studentId() || '');
    const canPlay = () => !!me() && !api.isGuest();
    const cfg = () => sanitizeOxbSettings(boss.settings());
    const open = () => api.isAdmin() || isOxbOpen(boss.today(), cfg());
    const live = () => st.rooms.filter((r) => !isOxbRoomStale(r, Date.now()));
    // 내가 들어 있는 방은 오래돼도 내 방이에요(안 그러면 '방 없애기'가 먹통이 돼요). 다른 사람에게만 안 보여요.
    const myRoom = () => st.rooms.find((r) => r.members.some((m) => m.id === me())) || null;
    /** 방장이 기다리는 동안 방이 '오래된 방'이 되지 않게 가끔 시간을 새로 적어요. */
    function keepAlive() {
        const r = myRoom();
        if (!st.active || !r || r.leaderId !== me() || r.status !== 'open' || st.busy) return;
        if (Date.now() - Math.max(r.updatedAt, r.createdAt) < 5 * 60000) return;
        void boss.tx(r.id, (cur) => setOxbBoss(cur, { id: me(), bossIdx: r.bossIdx, now: Date.now() })).catch(() => {});
    }
    const myMember = () => { const x = boss.me(); return x ? oxbMember(x) : null; };
    const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- 소리(짧은 효과음을 직접 만들어요) ---------- */
    function tone(notes, { type = 'square', vol = 0.12 } = {}) {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!actx) actx = new AC();
            if (actx.state === 'suspended') actx.resume().catch(() => {});
            const t0 = actx.currentTime + 0.01;
            notes.forEach(([freq, at, dur, to]) => {
                const o = actx.createOscillator();
                const g = actx.createGain();
                o.type = type;
                o.frequency.setValueAtTime(freq, t0 + at);
                if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + at + dur);
                g.gain.setValueAtTime(0.0001, t0 + at);
                g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
                o.connect(g); g.connect(actx.destination);
                o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
            });
        } catch (_) { /* 소리가 막혀 있으면 조용히 */ }
    }
    const sfx = {
        cursor: () => tone([[880, 0, 0.05]], { vol: 0.06 }),
        slash: () => tone([[1400, 0, 0.09, 200]], { type: 'sawtooth', vol: 0.14 }),
        hit: () => tone([[180, 0, 0.14, 60]], { type: 'square', vol: 0.2 }),
        crit: () => tone([[1800, 0, 0.07, 300], [240, 0.06, 0.2, 50]], { type: 'sawtooth', vol: 0.2 }),
        limit: () => tone([[330, 0, 0.1], [440, 0.09, 0.1], [660, 0.18, 0.1], [880, 0.27, 0.28]], { vol: 0.14 }),
        hurt: () => tone([[140, 0, 0.25, 45]], { type: 'sawtooth', vol: 0.22 }),
        miss: () => tone([[700, 0, 0.12, 1300]], { type: 'sine', vol: 0.12 }),
        heal: () => tone([[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.2]], { type: 'sine', vol: 0.14 }),
        rage: () => tone([[110, 0, 0.5, 70], [117, 0, 0.5, 74]], { type: 'sawtooth', vol: 0.2 }),
        win: () => tone([[523, 0, 0.12], [523, 0.13, 0.12], [523, 0.26, 0.12], [659, 0.39, 0.3], [587, 0.7, 0.16], [659, 0.87, 0.16], [784, 1.04, 0.5]], { vol: 0.13 }),
        lose: () => tone([[392, 0, 0.3], [330, 0.3, 0.3], [262, 0.6, 0.3], [196, 0.9, 0.7]], { type: 'triangle', vol: 0.18 }),
    };
    const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* 진동 없는 기기 */ } };

    /* ---------- 구독·저장 ---------- */
    function subscribe() {
        if (st.unsub || !boss.watch) return;
        st.alive = setInterval(keepAlive, 60000);
        st.unsub = boss.watch((list) => {
            st.rooms = (Array.isArray(list) ? list : []).map(sanitizeOxbRoom).filter(Boolean);
            if (st.active) sync();
        });
    }
    function unsubscribe() {
        if (st.unsub) { try { st.unsub(); } catch (_) { /* 무시 */ } }
        if (st.alive) clearInterval(st.alive);
        st.alive = 0;
        st.unsub = null;
    }
    function stopTimers() {
        if (st.timer) clearInterval(st.timer);
        if (st.watchdog) clearTimeout(st.watchdog);
        st.timer = 0;
        st.watchdog = 0;
    }

    async function tx(roomId, mutator, { quiet = false } = {}) {
        if (st.busy && !quiet) return null;
        if (!quiet) st.busy = true;
        try {
            const r = await boss.tx(roomId, mutator);
            if (r && r.ok === false && !quiet) { const t = oxbErrorText(r.error); if (t) void api.alert(t); }
            return r;
        } catch (e) {
            if (!quiet) void api.alert('저장하지 못했어요. 잠시 뒤 다시 해 봐요.');
            return null;
        } finally {
            if (!quiet) st.busy = false;
        }
    }

    /* ---------- 방 ---------- */
    async function create() {
        const m = myMember();
        if (!m) { void api.alert(oxbErrorText('no_member')); return; }
        st.result = null;
        await tx(me(), () => createOxbRoom({ member: m, bossIdx: st.pick, now: Date.now() }));
    }
    async function join(roomId) {
        const m = myMember();
        if (!m) { void api.alert(oxbErrorText('no_member')); return; }
        st.result = null;
        await tx(roomId, (cur) => joinOxbRoom(cur, { member: m, now: Date.now() }));
    }
    async function leave() {
        const r = myRoom();
        if (!r) return;
        if (r.status === 'fight' && r.fight && !r.fight.result && r.leaderId === me()) {
            if (!(await api.confirm('전투를 그만둘까요? 이번 전투는 없던 일이 돼요.'))) return;
            await tx(r.id, (cur) => reopenOxbRoom(cur, { id: me(), now: Date.now() }));
            return;
        }
        await tx(r.id, (cur) => leaveOxbRoom(cur, { id: me(), now: Date.now() }));
    }
    /** 준비 / 준비 취소. 내가 마지막으로 준비해서 모두 준비가 되면(인원도 맞으면) 바로 전투가 시작돼요. */
    async function ready() {
        const r = myRoom();
        if (!r || r.status !== 'open') return;
        const mineNow = r.members.find((m) => m.id === me());
        const want = !(mineNow && mineNow.ready);
        const deck = buildOxbDeck((getBank() || {}).questions);
        if (want && deck.length < 5) { void api.alert(oxbErrorText('no_questions')); return; }
        const seed = Math.floor(Math.random() * 2147483646) + 1;
        const mine = myMember(); // 내 장비는 준비하는 순간의 것으로 새로 고쳐요
        sfx.cursor();
        await tx(r.id, (cur) => {
            const rd = readyOxbRoom(cur, { id: me(), ready: want, member: mine, now: Date.now() });
            if (!rd.ok || !rd.allReady || rd.room.members.length < cfg().minParty) return rd;
            const started = startOxbFight(rd.room, { id: me(), settings: cfg(), deck, seed, now: Date.now() });
            return started.ok ? started : rd;
        });
    }
    async function again() {
        st.result = null;
        const r = myRoom();
        if (r && r.leaderId === me() && r.status === 'fight') await tx(r.id, (cur) => reopenOxbRoom(cur, { id: me(), now: Date.now() }));
        sync();
    }

    /* ---------- 전투 ---------- */
    const $ = (sel) => body.querySelector(sel);
    const heroEl = (id) => body.querySelector(`.oxb-hero[data-id="${CSS.escape(id)}"]`);

    function sceneHtml(f) {
        const heroes = f.members.map((m, i) => `
            <div class="oxb-hero" data-id="${esc(m.id)}" style="--i:${i}">
                <span class="oxb-cursor" aria-hidden="true">▶</span>
                <span class="oxb-avatar">${boss.avatar ? boss.avatar(m.id) : '🧑'}</span>
                <span class="oxb-shadow" aria-hidden="true"></span>
            </div>`).join('');
        const rows = f.members.map((m) => `
            <div class="oxb-row" data-row="${esc(m.id)}">
                <b>${esc(m.name)}${m.id === me() ? ' <em>나</em>' : ''}</b>
                <i class="oxb-gear" title="무기·방패·신발">${esc(m.wIcon || '✊')}${esc(m.sIcon)}${esc(m.fIcon)}</i>
                <span class="oxb-hpnum"><u data-hp>${m.hp}</u>/${OXB_PLAYER_HP}</span>
                <span class="oxb-bar"><i data-hpbar style="width:${m.hp}%"></i></span>
            </div>`).join('');
        return `<div class="oxb-scene" data-fight="${esc(f.id)}">
            <div class="oxb-field">
                <div class="oxb-top">
                    <div class="oxb-win oxb-bossinfo"><b>${esc(f.boss.name)}</b><span class="oxb-bar is-boss"><i data-bosshp></i></span><span class="oxb-bossnum" data-bossnum></span></div>
                    <div class="oxb-win oxb-meter"><span>필살기</span><span class="oxb-bar is-limit"><i data-gauge></i></span><em data-combo></em></div>
                </div>
                <div class="oxb-boss" data-boss><span class="oxb-boss-icon">${esc(f.boss.icon)}</span><span class="oxb-shadow is-boss" aria-hidden="true"></span></div>
                <div class="oxb-party">${heroes}</div>
                <div class="oxb-layer" data-layer aria-hidden="true"></div>
                <p class="oxb-banner" data-banner></p>
            </div>
            <p class="oxb-win oxb-msg" data-msg role="status"></p>
            <div class="oxb-bottom">
                <div class="oxb-win oxb-cmd">
                    <p class="oxb-turn" data-turn></p>
                    <p class="oxb-q" data-q></p>
                    <span class="oxb-bar is-time"><i data-time></i></span>
                    <div class="oxb-ox">
                        <button type="button" class="oxb-pick is-o" data-oxb="pick" data-pick="O" disabled>O</button>
                        <button type="button" class="oxb-pick is-x" data-oxb="pick" data-pick="X" disabled>X</button>
                    </div>
                </div>
                <div class="oxb-win oxb-status">${rows}<button type="button" class="oxb-quit" data-oxb="leave">${f.members[0].id === me() ? '그만두기' : ''}</button></div>
            </div>
        </div>`;
    }

    /** 숫자·막대를 문서 값으로 맞춰요. */
    function paint(f) {
        const hp = $('[data-bosshp]');
        if (!hp) return;
        hp.style.width = `${(f.boss.hp / f.boss.maxHp) * 100}%`;
        $('[data-bossnum]').textContent = `${f.boss.hp.toLocaleString()} / ${f.boss.maxHp.toLocaleString()}`;
        $('[data-gauge]').style.width = `${f.gauge}%`;
        $('[data-gauge]').parentElement.classList.toggle('is-full', f.gauge >= 100);
        $('[data-combo]').textContent = f.combo >= 2 ? `${f.combo} 콤보!` : '';
        const scene = $('.oxb-scene');
        scene.classList.toggle('is-rage', f.rage);
        f.members.forEach((m) => {
            const row = body.querySelector(`[data-row="${CSS.escape(m.id)}"]`);
            if (!row) return;
            row.querySelector('[data-hp]').textContent = m.hp;
            row.querySelector('[data-hpbar]').style.width = `${m.hp}%`;
            row.classList.toggle('is-low', m.hp <= 35);
            const h = heroEl(m.id);
            if (h) h.classList.toggle('is-low', m.hp <= 35);
        });
    }

    function say(text) { const el = $('[data-msg]'); if (el) el.textContent = text; }

    function float(text, target, cls = '') {
        const layer = $('[data-layer]');
        if (!layer || !target) return;
        const a = target.getBoundingClientRect();
        const b = layer.getBoundingClientRect();
        const n = document.createElement('span');
        n.className = `oxb-num ${cls}`;
        n.textContent = text;
        n.style.left = `${a.left - b.left + a.width / 2}px`;
        n.style.top = `${a.top - b.top + a.height * 0.3}px`;
        layer.appendChild(n);
        setTimeout(() => n.remove(), 1300);
    }
    function flash(cls) {
        const scene = $('.oxb-scene');
        if (!scene) return;
        scene.classList.remove(cls); void scene.offsetWidth; scene.classList.add(cls);
        setTimeout(() => scene.classList.remove(cls), 600);
    }
    function pulse(el, cls, ms = 500) {
        if (!el) return;
        el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), ms);
    }
    function slash(n = 1) {
        const bossEl = $('[data-boss]');
        if (!bossEl) return;
        for (let i = 0; i < n; i += 1) {
            setTimeout(() => {
                const s = document.createElement('i');
                s.className = 'oxb-slash';
                s.style.setProperty('--r', `${-55 + Math.random() * 110}deg`);
                bossEl.appendChild(s);
                setTimeout(() => s.remove(), 320);
                pulse(bossEl, 'is-hit', 240);
                sfx.slash();
            }, i * 110);
        }
    }
    async function banner(text, cls, ms) {
        const el = $('[data-banner]');
        if (!el) return;
        el.textContent = text;
        el.className = `oxb-banner is-on ${cls || ''}`;
        await wait(ms);
        el.className = 'oxb-banner';
    }

    /** 방금 일어난 일(last)을 연출해요. before: 이 차례 전의 전투 상태(이름 찾기용) */
    async function play(l, f) {
        const quick = reduce();
        const p = (ms) => wait(quick ? Math.min(ms, 120) : ms);
        const actor = f.members.find((m) => m.id === l.by) || { name: '?' };
        const hero = heroEl(l.by);
        const bossEl = $('[data-boss]');
        body.querySelectorAll('.oxb-hero').forEach((h) => h.classList.remove('is-turn'));
        if (l.ok) {
            say(`⭕ 정답! ${actor.name}의 공격!`);
            if (l.limit) {
                sfx.limit();
                flash('is-limit');
                await banner('합동 필살기!', 'is-limit', quick ? 200 : 900);
            }
            pulse(hero, 'is-attack', 620);
            await p(240);
            slash(l.limit ? 5 : l.crit ? 3 : 1);
            await p(l.limit ? 560 : l.crit ? 340 : 130);
            if (l.crit || l.limit) { sfx.crit(); flash('is-flash'); buzz([30, 30, 60]); } else { sfx.hit(); buzz(25); }
            flash('is-shake');
            float(l.dmg.toLocaleString(), bossEl, l.limit ? 'is-limit' : l.crit ? 'is-crit' : '');
            const tags = [];
            if (l.speed >= 1.6) tags.push('번개 같은 속도!');
            if (l.crit) tags.push('크리티컬!');
            if (l.combo >= 2) tags.push(`${l.combo} 콤보`);
            say(`${actor.name}의 공격! ${tags.join(' ')} ${f.boss.name}에게 ${l.dmg.toLocaleString()} 데미지!`);
            paint({ ...f, members: f.members.map((m) => (m.id === l.healId ? { ...m, hp: m.hp - l.heal } : m)) });
            await p(900);
            if (l.heal > 0) {
                const who = f.members.find((m) => m.id === l.healId);
                sfx.heal();
                pulse(heroEl(l.healId), 'is-heal', 800);
                float(`+${l.heal}`, heroEl(l.healId), 'is-heal');
                say(`콤보의 힘! ${who ? who.name : ''}의 체력이 ${l.heal} 회복됐어요.`);
                paint(f);
                await p(800);
            }
            if (l.rageStart) {
                sfx.rage();
                flash('is-shake');
                say(`${f.boss.name}이(가) 화가 났어요! 공격이 더 아파져요!`);
                await banner('보스 분노!', 'is-rage', quick ? 200 : 900);
            }
        } else {
            say(l.timeout ? `⏰ 시간 초과! 정답은 ${l.answer}${l.explain ? ` — ${l.explain}` : ''}` : `❌ 땡! 정답은 ${l.answer}${l.explain ? ` — ${l.explain}` : ''}`);
            if (feedback && l.by === me()) feedback.play(l.timeout ? 'timeout' : 'no');
            await p(950);
            // 보스는 아무나 한 명을 골라 때려요.
            const victim = f.members.find((m) => m.id === l.target) || actor;
            const vHero = heroEl(victim.id) || hero;
            say(`${f.boss.name}이(가) 노려봐요… 누구를 때릴까?`);
            body.querySelectorAll('.oxb-hero').forEach((h) => pulse(h, 'is-aim', 500));
            await p(520);
            pulse(bossEl, 'is-lunge', 600);
            sfx.rage();
            await p(300);
            if (l.evade) {
                sfx.miss();
                pulse(vHero, 'is-dodge', 600);
                float('MISS', vHero, 'is-miss');
                say(`${f.boss.name}의 공격! ${victim.name}은(는) 신발 덕분에 휙 피했어요!`);
            } else {
                sfx.hurt();
                buzz(victim.id === me() ? [80, 40, 120] : 40);
                pulse(vHero, 'is-hurt', 600);
                flash('is-red');
                flash('is-shake');
                float(`-${l.bossDmg}`, vHero, 'is-hurt');
                if (l.guarded > 0) float(`🛡️${l.guarded} 막음`, vHero, 'is-guard');
                say(`${f.boss.name}의 공격! ${victim.name}에게 ${l.bossDmg} 데미지!${l.guarded > 0 ? ` (방패가 ${l.guarded} 막았어요)` : ''}`);
            }
            paint(f);
            await p(950);
            if (l.down && vHero) vHero.classList.add('is-down');
        }
        paint(f);
    }

    function showQuestion(f) {
        stopTimers();
        const info = oxbTurnInfo(f);
        if (!info) return;
        const mine = info.member.id === me();
        const turn = f.turn;
        body.querySelectorAll('.oxb-hero').forEach((h) => h.classList.toggle('is-turn', h.getAttribute('data-id') === info.member.id));
        body.querySelectorAll('.oxb-row').forEach((r) => r.classList.toggle('is-turn', r.getAttribute('data-row') === info.member.id));
        $('[data-turn]').textContent = mine ? '▶ 내 차례! 빨리 맞힐수록 세요' : `▶ ${info.member.name}의 차례`;
        $('[data-q]').textContent = info.question.p;
        const cmd = $('.oxb-cmd');
        cmd.classList.toggle('is-mine', mine);
        body.querySelectorAll('.oxb-pick').forEach((b) => { b.disabled = !mine; b.classList.remove('is-picked'); });
        if (mine) { sfx.cursor(); buzz(20); }
        st.qShownAt = Date.now();
        const total = f.turnSec * 1000;
        const bar = $('[data-time]');
        const tick = () => {
            const left = Math.max(0, total - (Date.now() - st.qShownAt));
            if (bar) { bar.style.width = `${(left / total) * 100}%`; bar.parentElement.classList.toggle('is-hurry', left < total * 0.3); }
            if (left <= 0) {
                clearInterval(st.timer);
                st.timer = 0;
                if (mine) void submit('', turn);
            }
        };
        tick();
        st.timer = setInterval(tick, 100);
        if (!mine) {
            // 차례인 친구가 자리에 없으면 다른 팀원이 대신 시간 초과로 넘겨요(순서대로 조금씩 늦게 시도).
            const idx = Math.max(0, f.members.findIndex((m) => m.id === me()));
            st.watchdog = setTimeout(() => { void submit('', turn, true); }, total + ABSENT_GRACE_MS + idx * 1500);
        }
    }

    async function submit(pick, turn, forOther = false) {
        const r = myRoom();
        if (!r || !r.fight || r.fight.result || r.fight.turn !== turn || st.sentTurn === turn) return;
        st.sentTurn = turn;
        const ms = Date.now() - st.qShownAt;
        if (!forOther) {
            if (st.timer) { clearInterval(st.timer); st.timer = 0; }
            body.querySelectorAll('.oxb-pick').forEach((b) => { b.disabled = true; b.classList.toggle('is-picked', b.getAttribute('data-pick') === pick); });
            if (feedback) feedback.unlock();
        }
        const res = await tx(r.id, (cur) => answerOxbTurn(cur, { by: me(), turn, pick, ms, now: Date.now() }), { quiet: true });
        if (!res || (res.ok === false && res.error !== 'stale_turn' && res.error !== 'finished')) {
            st.sentTurn = -1; // 저장이 안 됐으면 다시 보낼 수 있게
            if (!forOther && pick) body.querySelectorAll('.oxb-pick').forEach((b) => { b.disabled = false; });
            else st.watchdog = setTimeout(() => { void submit(pick, turn, forOther); }, 2500);
        }
    }

    /** 보상 받기(같은 전투는 한 번만) */
    async function claim(f) {
        if (!canPlay() || st.claiming === f.id) return null;
        st.claiming = f.id;
        try {
            const res = claimOxbReward(boss.progress(), f, { id: me(), today: boss.today(), settings: cfg() });
            if (!res.ok) return null;
            const bong = api.isAdmin() ? 0 : res.bong;
            const saved = await boss.saveProgress(res.progress, bong, `OX 보스레이드 ${f.boss.name} 보상`);
            if (!saved) { void api.alert('보상을 저장하지 못했어요. 보스레이드 화면을 다시 열면 받을 수 있어요.'); return null; }
            return { ...res, bong };
        } finally {
            st.claiming = '';
        }
    }

    async function finish(f) {
        stopTimers();
        body.querySelectorAll('.oxb-pick').forEach((b) => { b.disabled = true; });
        body.querySelectorAll('.oxb-hero').forEach((h) => h.classList.remove('is-turn'));
        const quick = reduce();
        if (f.result === 'win') {
            const bossEl = $('[data-boss]');
            if (bossEl) bossEl.classList.add('is-dead');
            sfx.win();
            buzz([60, 40, 60, 40, 200]);
            body.querySelectorAll('.oxb-hero').forEach((h) => h.classList.add('is-victory'));
            say(`${f.boss.name}을(를) 물리쳤어요!`);
            await banner('승리!', 'is-win', quick ? 400 : 2200);
        } else {
            sfx.lose();
            const scene = $('.oxb-scene');
            if (scene) scene.classList.add('is-over');
            say(f.last && f.last.timeUp ? '너무 오래 걸렸어요…' : '팀원이 쓰러졌어요…');
            await banner('GAME OVER', 'is-lose', quick ? 400 : 2000);
        }
        const reward = await claim(f);
        st.done.add(f.id);
        st.result = { fight: f, reward };
        if (st.active) render();
    }

    /** 문서가 바뀔 때마다: 새 차례면 연출을 줄 세워 틀어요. */
    function advance(f) {
        if (st.fightId !== f.id || !$('.oxb-scene')) {
            // 새 전투(또는 중간에 들어옴): 장면을 깔고 지금 상태에서 시작해요.
            st.fightId = f.id;
            st.sentTurn = -1;
            st.chain = Promise.resolve();
            stage.classList.add('is-play', 'is-boss');
            if (setMeta) setMeta('주말 보스레이드');
            body.innerHTML = sceneHtml(f);
            if (f.turn === 0 && !f.result) {
                st.seenTurn = 0;
                paint(f);
                say(`${f.boss.name}이(가) 나타났어요!`);
                pulse($('[data-boss]'), 'is-appear', 900);
                st.chain = st.chain.then(() => banner(`${f.members.length}명 출전!`, '', reduce() ? 200 : 1100)).then(() => { if (st.fightId === f.id && st.seenTurn === 0) showQuestion(f); });
                return;
            }
            st.seenTurn = f.turn;
            paint(f);
            f.members.forEach((m) => { if (m.hp <= 0) { const h = heroEl(m.id); if (h) h.classList.add('is-down'); } });
            if (f.result) st.chain = st.chain.then(() => finish(f)); else showQuestion(f);
            return;
        }
        if (f.turn <= st.seenTurn) return;
        st.seenTurn = f.turn;
        stopTimers();
        body.querySelectorAll('.oxb-pick').forEach((b) => { b.disabled = true; });
        st.chain = st.chain.then(async () => {
            if (st.fightId !== f.id || !st.active || !$('.oxb-scene')) return;
            if (f.last) await play(f.last, f);
            if (st.fightId !== f.id || !st.active) return;
            if (f.result) { await finish(f); return; }
            if (st.seenTurn === f.turn) showQuestion(f);
        }).catch((e) => console.warn('oxBoss', e));
    }

    /* ---------- 화면 ---------- */
    function sync() {
        const r = myRoom();
        if (r && r.status === 'fight' && r.fight && !st.done.has(r.fight.id)) { advance(r.fight); return; }
        // 방에서 나왔거나 방이 다시 열렸는데, 받지 않은 승리 보상이 남아 있으면 받아요.
        if (!st.result) {
            const claimed = sanitizeOxbProgress(boss.progress()).claimed;
            const pend = st.rooms.find((x) => x.fight && x.fight.result === 'win' && x.fight.members.some((m) => m.id === me()) && !claimed.includes(x.fight.id) && Date.now() - x.fight.startedAt < 24 * 3600000);
            if (pend && !$('.oxb-scene') && canPlay() && st.claiming !== pend.fight.id) {
                void claim(pend.fight).then((reward) => { if (reward) { st.result = { fight: pend.fight, reward }; if (st.active) render(); } });
            }
        }
        if ($('.oxb-scene') && st.fightId && !st.result) {
            // 전투 중에 방이 닫혔어요(방장이 그만둠).
            st.fightId = '';
            stopTimers();
        }
        const a = document.activeElement;
        if (a && a.closest && a.closest('.oxb-admin') && body.contains(a)) return; // 설정 적는 중
        render();
    }

    function bossCard(i, c, on) {
        const b = c.bosses[i];
        return `<button type="button" class="oxb-bosspick${on ? ' is-on' : ''}" data-oxb="boss" data-boss-idx="${i}">
            <span class="oxb-bosspick-icon">${esc(b.icon)}</span>
            <b>${esc(b.name)}</b>
            <i>체력 ${b.hpPer}×인원 · 공격 ${b.atk}</i>
            <em>보상 ${esc(boss.bong(b.bong))}</em>
        </button>`;
    }

    function statLine(m) {
        const w = m.wMax > 0 ? `${m.wIcon || '⚔️'} 무기 +${m.wMin * 4}~${m.wMax * 4}` : '✊ 맨손';
        const s = m.guard > 0 ? ` · ${m.sIcon || '🛡️'} 방어 ${Math.round(m.guard * 100)}%` : '';
        const f = m.evade > 0 ? ` · ${m.fIcon || '👟'} 회피 ${Math.round(m.evade * 100)}%` : '';
        return `${w}${s}${f}`;
    }

    function adminHtml(c) {
        if (!api.isAdmin()) return '';
        const n = (name, value, min, max) => `<input type="number" inputmode="numeric" class="oxb-input" data-oxb-set="${name}" value="${value}" min="${min}" max="${max}">`;
        return `<details class="oxb-admin">
            <summary>⚙️ 보스레이드 마스터 설정 (선생님만 보여요)</summary>
            <div class="oxb-admin-body">
                <label class="oxb-set"><input type="checkbox" data-oxb-set="weekendOnly"${c.weekendOnly ? ' checked' : ''}> 토·일에만 열기 (끄면 평일에도 열려요)</label>
                <label class="oxb-set">출발 최소 인원 ${n('minParty', c.minParty, 1, OXB_MAX_PARTY)} 명 (최대 ${OXB_MAX_PARTY}명)</label>
                <label class="oxb-set">문제 제한 시간 ${n('turnSec', c.turnSec, 5, 60)} 초</label>
                <label class="oxb-set">하루 보상 ${n('dailyRewards', c.dailyRewards, 0, 20)} 번 (도전은 무제한)</label>
                <div class="oxb-admin-table"><table>
                    <thead><tr><th>#</th><th>그림</th><th>보스 이름</th><th>체력(1명당)</th><th>공격력</th><th>보상(봉)</th></tr></thead>
                    <tbody>${c.bosses.map((b, i) => `<tr><td>${i + 1}</td>
                        <td><input type="text" class="oxb-input is-icon" data-oxb-set="icon-${i}" value="${esc(b.icon)}" maxlength="8"></td>
                        <td><input type="text" class="oxb-input is-text" data-oxb-set="name-${i}" value="${esc(b.name)}" maxlength="14"></td>
                        <td>${n(`hpPer-${i}`, b.hpPer, 20, 5000)}</td><td>${n(`atk-${i}`, b.atk, 1, 200)}</td><td>${n(`bong-${i}`, b.bong, 0, 100)}</td></tr>`).join('')}</tbody>
                </table></div>
                <p class="oxc-muted oxb-small">학생 체력은 100이에요. 맞히면 기본 20×속도(1~2배)+무기 보너스, 콤보마다 +10%. 그림 칸에는 이모지를 넣어요.</p>
                <div class="ox-row">
                    <button type="button" class="ox-choice is-on" data-oxb="set-save">설정 저장</button>
                    <button type="button" class="ox-choice" data-oxb="set-reset">기본값으로</button>
                </div>
            </div>
        </details>`;
    }

    function resultHtml() {
        const { fight: f, reward } = st.result;
        const win = f.result === 'win';
        const rows = f.members.map((m) => ({ m, s: f.stats[m.id] || { ok: 0, no: 0, dmg: 0 } })).sort((a, b) => b.s.dmg - a.s.dmg);
        let line = '';
        if (!win) line = '다시 도전해 봐요! 도전은 몇 번이든 할 수 있어요.';
        else if (!reward) line = '보상은 이미 받았어요.';
        else if (api.isAdmin()) line = '선생님은 봉을 받지 않아요.';
        else if (reward.limited) line = '오늘 보상은 이미 다 받았어요. (승리 기록은 남아요)';
        else line = `보상 ${boss.bong(reward.bong)}을 받았어요!`;
        const r = myRoom();
        return `<div class="oxb-win oxb-result ${win ? 'is-win' : 'is-lose'}">
            <p class="oxb-result-title">${win ? '🏆 승리!' : '💀 GAME OVER'}</p>
            <p class="oxb-result-sub">${esc(f.boss.icon)} ${esc(f.boss.name)} · ${f.turn}턴</p>
            <p class="oxb-result-reward">${esc(line)}</p>
            <div class="oxb-result-rows">${rows.map(({ m, s }, i) => `<div class="oxb-result-row${m.id === me() ? ' is-me' : ''}"><b>${win && i === 0 ? '👑 ' : ''}${esc(m.name)}</b><span>⭕ ${s.ok} · ❌ ${s.no}</span><em>${s.dmg.toLocaleString()} 데미지</em></div>`).join('')}</div>
            <button type="button" class="ox-go" data-oxb="again">${r && r.leaderId === me() ? '같은 팀으로 다시 모으기' : '확인'}</button>
        </div>`;
    }

    function roomHtml(r, c) {
        const leader = r.leaderId === me();
        const b = c.bosses[r.bossIdx];
        const enough = r.members.length >= c.minParty;
        const done = r.status === 'fight'; // 전투가 끝났고 방장이 아직 다시 모으지 않았어요
        const readyCount = r.members.filter((m) => m.ready).length;
        const iAmReady = r.members.some((m) => m.id === me() && m.ready);
        return `<div class="oxb-win oxb-room">
            <p class="oxb-room-boss"><span>${esc(b.icon)}</span><b>${esc(b.name)}</b><i>체력 ${(b.hpPer * r.members.length).toLocaleString()} · 공격 ${b.atk} · 보상 ${esc(boss.bong(b.bong))}</i></p>
            ${leader && !done ? `<div class="oxb-bosses">${c.bosses.map((_, i) => bossCard(i, c, i === r.bossIdx)).join('')}</div>` : ''}
            <p class="ox-label">우리 팀 ${r.members.length} / ${OXB_MAX_PARTY}명 · 릴레이 순서</p>
            <div class="oxb-members">${r.members.map((m, i) => `<div class="oxb-member${m.id === me() ? ' is-me' : ''}">
                <span class="oxb-member-no">${i + 1}</span>
                <span class="oxb-member-face">${boss.avatar ? boss.avatar(m.id) : '🧑'}</span>
                <span class="oxb-member-text"><b>${m.id === r.leaderId ? '👑 ' : ''}${esc(m.name)}</b><i>${esc(statLine(m))}</i></span>
                ${done ? '' : `<span class="oxb-ready${m.ready ? ' is-on' : ''}">${m.ready ? '✅ 준비 완료' : '⏳ 준비 중'}</span>`}
            </div>`).join('')}</div>
            ${done ? '<p class="oxc-lead oxc-center">전투가 끝났어요. 방장이 다시 모으면 또 갈 수 있어요.</p>'
                : `<p class="oxc-lead oxc-center">${enough ? `모두 「준비」를 누르면 바로 시작해요! (${readyCount}/${r.members.length}명 준비)` : `${c.minParty}명이 모여야 시작할 수 있어요. 친구를 기다려요! (${readyCount}/${r.members.length}명 준비)`}</p>
                <button type="button" class="ox-go oxb-readybtn${iAmReady ? ' is-on' : ''}" data-oxb="ready">${iAmReady ? '준비 취소' : '⚔️ 준비!'}</button>`}
            ${leader && done ? '<button type="button" class="ox-go" data-oxb="again">같은 팀으로 다시 모으기</button>' : ''}
            <button type="button" class="ox-text-btn oxb-leave" data-oxb="leave">${leader ? '방 없애기' : '팀에서 나가기'}</button>
        </div>`;
    }

    function lobbyHtml(c) {
        const rooms = live().filter((r) => r.status === 'open' && r.members.length > 0);
        const m = myMember();
        const p = sanitizeOxbProgress(boss.progress());
        const today = p.day === boss.today() ? p.dayRewards : 0;
        return `<div class="oxb-win oxb-intro">
            <p class="oxb-title">⚔️ 주말 보스레이드</p>
            <p class="oxb-lead">${OXB_MAX_PARTY}명까지 팀을 만들어 차례대로 OX 문제를 풀어요. 맞히면 보스를 공격하고, 틀리면 보스가 우리 팀 아무나 한 명을 때려요. <b>한 명이라도 쓰러지면 게임 오버!</b></p>
            <ul class="oxb-rules">
                <li>⚡ 빨리 맞힐수록 데미지가 커요(최대 2배)</li>
                <li>⚔️ 무기는 보너스 데미지 · 🛡️ 방패는 데미지 차감 · 👟 신발은 회피</li>
                <li>🔥 연속 정답 콤보 +10%씩 · 게이지가 차면 합동 필살기 3배!</li>
                <li>💚 콤보 5번마다 가장 아픈 친구가 회복돼요</li>
            </ul>
            ${m ? `<p class="oxb-mine">내 장비: ${esc(statLine(m))}</p>` : ''}
            <p class="oxc-muted oxb-small">오늘 보상 ${Math.min(today, c.dailyRewards)} / ${c.dailyRewards}번 받음 · 지금까지 ${p.wins}번 이겼어요 · 도전은 무제한</p>
        </div>
        <div class="oxb-win">
            <p class="ox-label">보스 고르기</p>
            <div class="oxb-bosses">${c.bosses.map((_, i) => bossCard(i, c, i === st.pick)).join('')}</div>
            ${canPlay() ? `<button type="button" class="ox-go" data-oxb="create">🚩 ${esc(c.bosses[st.pick].name)} 레이드 방 만들기</button>` : '<p class="oxc-lead oxc-center">로그인하면 함께할 수 있어요.</p>'}
        </div>
        <div class="oxb-win">
            <p class="ox-label">모이는 중인 방</p>
            ${rooms.length ? rooms.map((r) => `<div class="oxb-roomrow">
                <span class="oxb-roomrow-icon">${esc(c.bosses[r.bossIdx].icon)}</span>
                <span class="oxb-roomrow-text"><b>${esc(r.leaderName)}의 팀</b><i>${esc(c.bosses[r.bossIdx].name)} · ${r.members.length}/${OXB_MAX_PARTY}명</i></span>
                <button type="button" class="ox-choice" data-oxb="join" data-room="${esc(r.id)}"${canPlay() && r.members.length < OXB_MAX_PARTY ? '' : ' disabled'}>함께 가기</button>
            </div>`).join('') : '<p class="oxc-muted oxb-small">아직 모이는 방이 없어요. 방을 만들고 친구를 불러 봐요!</p>'}
        </div>`;
    }

    function render() {
        if (!st.active) return;
        stage.classList.remove('is-play');
        stage.classList.toggle('is-boss', true);
        if (setMeta) setMeta('주말 보스레이드');
        const c = cfg();
        let inner = '';
        if (st.result) inner = resultHtml();
        else if (!open()) {
            inner = `<div class="oxb-win oxb-intro"><p class="oxb-title">⚔️ 주말 보스레이드</p><p class="oxb-closed">🔒</p><p class="oxb-lead oxc-center">보스는 <b>토요일·일요일</b>에만 나타나요.<br>주말에 친구들과 함께 도전해 봐요!</p></div>`;
        } else {
            const r = myRoom();
            inner = r ? roomHtml(r, c) : lobbyHtml(c);
        }
        st.fightId = st.result ? st.fightId : '';
        body.innerHTML = `${modeTabs('boss')}<div class="oxc-scroll oxb-lobby">${inner}${adminHtml(c)}</div>`;
    }

    async function saveSettings(reset) {
        const val = (name) => { const i = body.querySelector(`[data-oxb-set="${name}"]`); return i ? (i.type === 'checkbox' ? i.checked : i.value) : ''; };
        const cur = cfg();
        const next = reset ? sanitizeOxbSettings(null) : sanitizeOxbSettings({
            weekendOnly: val('weekendOnly'),
            minParty: val('minParty'),
            turnSec: val('turnSec'),
            dailyRewards: val('dailyRewards'),
            bosses: cur.bosses.map((_, i) => ({ icon: val(`icon-${i}`), name: val(`name-${i}`), hpPer: val(`hpPer-${i}`), atk: val(`atk-${i}`), bong: val(`bong-${i}`) })),
        });
        try {
            await boss.saveSettings(next);
            await api.alert(reset ? '기본값으로 되돌렸어요.' : '보스레이드 설정을 저장했어요.');
        } catch (e) {
            await api.alert(`저장하지 못했어요: ${e && e.message ? e.message : e}`);
        }
        render();
    }

    function handleClick(event) {
        if (!st.active) return false;
        const t = event.target.closest('[data-oxb]');
        if (!t || t.disabled) return false;
        const act = t.getAttribute('data-oxb');
        if (feedback) feedback.unlock();
        if (act === 'pick') { const r = myRoom(); if (r && r.fight) void submit(t.getAttribute('data-pick'), r.fight.turn); }
        else if (act === 'boss') {
            const idx = Number(t.getAttribute('data-boss-idx')) || 0;
            const r = myRoom();
            sfx.cursor();
            if (r && r.leaderId === me()) void tx(r.id, (cur) => setOxbBoss(cur, { id: me(), bossIdx: idx, now: Date.now() }));
            else { st.pick = idx; render(); }
        }
        else if (act === 'create') void create();
        else if (act === 'join') void join(t.getAttribute('data-room'));
        else if (act === 'leave') void leave();
        else if (act === 'ready') void ready();
        else if (act === 'again') void again();
        else if (act === 'set-save') void saveSettings(false);
        else if (act === 'set-reset') void saveSettings(true);
        return true;
    }

    function enter() {
        st.active = true;
        st.fightId = '';
        subscribe();
        render();
        sync();
    }
    function leaveMode() {
        st.active = false;
        stopTimers();
        unsubscribe();
        st.fightId = '';
        stage.classList.remove('is-boss', 'is-play');
    }

    return { isActive: () => st.active, enter, join, leave: leaveMode, close: leaveMode, render: () => { if (!$('.oxb-scene') || st.result) render(); }, handleClick };
}
