/**
 * 메이트 펫 탐험(보스 레이드) 화면. petMode.js 의 「⚔️ 탐험」 탭이 이 모듈을 불러 써요.
 * 규칙·전투 계산은 lib/petRaid.js 가 맡고, 여기는 화면(스테이지 고르기·팀 모으기·전투 연출·보상·마스터 설정)이에요.
 *
 * 탐험 방은 Firestore 문서 하나(petRaids/{방장 학번})예요. 방장이 '출발'을 누르면 전투 결과가 문서에 적히고,
 * 팀원 화면마다 같은 씨앗으로 같은 전투를 다시 돌려 연출을 보여 준 뒤, 각자 자기 보상을 받아요.
 */
import './petRaid.css';
import { PET_SKILL_NAMES, PET_SPECIES, PET_TYPES, grantPetExp, petBoxMainIndex, petBoxToDoc, petBoxWith, petPower, petView, sanitizePetBox } from './lib/petGame.js';
import { petArtHtml, petImageUrl } from './lib/petArt.js';
import {
    RAID_MAX_PARTY,
    RAID_MIN_PARTY,
    RAID_STAGE_COUNT,
    RAID_STRONG,
    claimRaidReward,
    createRaidParty,
    isRaidPartyStale,
    joinRaidParty,
    leaveRaidParty,
    raidErrorText,
    raidMaxParty,
    raidMemberFromPet,
    raidPetStats,
    raidTypeMult,
    raidUnlockedStage,
    readyRaidParty,
    reopenRaidParty,
    replayRaidRun,
    sanitizeRaidParty,
    sanitizeRaidSettings,
    setRaidStage,
    startRaid,
} from './lib/petRaid.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PET_SPECIES_TYPE = (species) => (PET_SPECIES[species] ? PET_SPECIES[species].type : 'fire');
const TYPE_COLOR = Object.freeze({ fire: '#fb923c', water: '#38bdf8', grass: '#4ade80', electric: '#facc15', ice: '#a5f3fc', rock: '#d6b98c', star: '#c4b5fd' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ctx: { root(), deps, now(), today(), free(), render(), show(text, kind), feedback() }
 * deps 에는 petMode 의 deps 에 더해 raidWatch(cb) → 끄기 함수, raidTx(partyId, mutator) → Promise, classSize() 가 있어요.
 */
export function createPetRaidView(ctx) {
    const { deps } = ctx;
    let parties = [];
    let unsub = null;
    let pickedStage = 0; // 방 만들 때 고른 스테이지(0이면 열린 가장 높은 스테이지)
    let busy = false;
    let playing = ''; // 지금 연출 중인 전투 번호
    const shown = new Set(); // 이 화면에서 이미 연출한 전투 번호
    let lastResult = null; // { run, sim, reward } 마지막 결과 카드

    const me = () => String(deps.selfId() || '');
    const box = () => sanitizePetBox(deps.state() && deps.state().pet);
    const raidCfg = () => sanitizeRaidSettings((deps.settings && deps.settings() && deps.settings().raid) || null);
    const maxParty = () => raidMaxParty(raidCfg(), deps.classSize ? deps.classSize() : RAID_MAX_PARTY);
    let pickSlot = -1; // 탐험에 데려갈 펫 칸(-1이면 대표 펫)
    /** 데려갈 펫 칸: 고른 칸이 없거나 못 가는 펫이면 대표 펫 */
    const raidSlot = () => {
        const b = box();
        const ok = (i) => i >= 0 && i < b.slots && b.list[i] && b.list[i].phase === 'pet' && !petView(b.list[i], ctx.now(), ctx.today()).away;
        return ok(pickSlot) ? pickSlot : petBoxMainIndex(b);
    };
    const myMember = () => { const b = box(); const i = raidSlot(); return raidMemberFromPet(i >= 0 ? b.list[i] : null, { id: me(), name: deps.selfName ? deps.selfName() : me(), now: ctx.now(), today: ctx.today() }); };
    const unlocked = () => (ctx.free() ? RAID_STAGE_COUNT : raidUnlockedStage(box().raid));
    const liveParties = () => parties.filter((p) => !isRaidPartyStale(p, ctx.now()));
    // 내가 들어 있는 방은 오래돼도 내 방이에요(오래됐다고 안 보이면 '방 없애기'가 먹통이 돼요). 다른 사람에게만 안 보여요.
    const myParty = () => parties.find((p) => p.members.some((m) => m.id === me())) || null;
    /** 방장이 방을 열어 두고 기다리는 동안 방이 '오래된 방'이 되지 않게 가끔 시간을 새로 적어요. */
    function keepAlive() {
        const p = myParty();
        if (!p || p.leaderId !== me() || p.status !== 'open' || busy || playing) return;
        if (ctx.now() - Math.max(p.updatedAt, p.createdAt) < 5 * 60000) return;
        void deps.raidTx(p.id, (cur) => setRaidStage(cur, { id: me(), stage: p.stage, unlocked: RAID_STAGE_COUNT, now: ctx.now() })).catch(() => {});
    }
    /** 아직 보상을 안 받은 내 전투(방에서 나왔거나 방이 다시 열렸어도 남아 있어요) */
    const pendingRun = () => {
        const claimed = box().raid.claimed;
        const p = parties.find((x) => x.run && x.run.members.some((m) => m.id === me()) && !claimed.includes(x.run.id) && ctx.now() - x.run.startedAt < 24 * 3600000);
        return p ? p.run : null;
    };

    function start() {
        if (unsub || !deps.raidWatch) return;
        unsub = deps.raidWatch((list) => {
            parties = (Array.isArray(list) ? list : []).map(sanitizeRaidParty).filter(Boolean);
            if (!playing) ctx.render();
            void maybePlay();
        });
    }

    function stop() {
        if (unsub) { try { unsub(); } catch (_) { /* 무시 */ } }
        unsub = null;
    }

    async function tx(partyId, mutator) {
        if (busy) return null;
        if (!deps.canPlay()) { deps.toast('로그인해야 탐험을 떠날 수 있어요.'); return null; }
        busy = true;
        try {
            const r = await deps.raidTx(partyId, mutator);
            if (r && r.ok === false) deps.toast(raidErrorText(r.error));
            return r;
        } catch (e) {
            deps.toast('저장하지 못했어요. 잠시 뒤 다시 해 봐요.');
            return null;
        } finally {
            busy = false;
        }
    }

    /* ---------- 행동 ---------- */

    async function create() {
        const m = myMember();
        if (!m) { deps.toast(raidErrorText('no_pet')); return; }
        const stage = Math.min(pickedStage || unlocked(), unlocked());
        lastResult = null;
        await tx(me(), (cur) => {
            const old = sanitizeRaidParty(cur);
            const made = createRaidParty({ member: m, stage, unlocked: unlocked(), now: ctx.now() });
            // 내 지난 방의 마지막 전투 기록은 남겨요(늦게 온 친구의 보상용).
            if (made.ok && old && old.run) made.party.run = old.run;
            return made;
        });
    }

    async function join(partyId) {
        const m = myMember();
        if (!m) { deps.toast(raidErrorText('no_pet')); return; }
        lastResult = null;
        await tx(partyId, (cur) => joinRaidParty(cur, { member: m, max: maxParty(), now: ctx.now() }));
    }

    async function leave() {
        const p = myParty();
        if (!p) return;
        await tx(p.id, (cur) => {
            const r = leaveRaidParty(cur, { id: me(), now: ctx.now() });
            // 방장이 나가도 마지막 전투 기록이 있으면 문서는 남겨요(빈 방으로).
            if (r.ok && r.party === null) {
                const old = sanitizeRaidParty(cur);
                if (old && old.run) return { ok: true, party: { ...old, status: 'open', members: [], updatedAt: 0, createdAt: 0 } };
            }
            return r;
        });
    }

    async function changeStage(stage) {
        const p = myParty();
        if (!p) return;
        await tx(p.id, (cur) => setRaidStage(cur, { id: me(), stage, unlocked: unlocked(), now: ctx.now() }));
    }

    /** 준비 / 준비 취소. 내가 마지막으로 준비해서 모두 준비가 되면(인원도 맞으면) 바로 출발해요. */
    async function ready() {
        const p = myParty();
        if (!p || p.status !== 'open') return;
        const mine = p.members.find((m) => m.id === me());
        const want = !(mine && mine.ready);
        const seed = Math.floor(Math.random() * 2147483646) + 1;
        await tx(p.id, (cur) => {
            const rd = readyRaidParty(cur, { id: me(), ready: want, now: ctx.now() });
            if (!rd.ok || !rd.allReady || rd.party.members.length < raidCfg().minParty) return rd;
            const started = startRaid(rd.party, { id: me(), settings: raidCfg(), seed, now: ctx.now() });
            return started.ok ? started : rd;
        });
    }

    /** 데려갈 펫 바꾸기(방 안에서도 돼요. 바꾸면 내 준비가 풀려요) */
    async function swapPet(slotIndex) {
        pickSlot = slotIndex;
        const p = myParty();
        const m = myMember();
        if (!p || p.status !== 'open' || !m) { ctx.render(); return; }
        await tx(p.id, (cur) => joinRaidParty(cur, { member: m, max: maxParty(), now: ctx.now() }));
        ctx.render();
    }

    async function again() {
        const p = myParty();
        lastResult = null;
        if (!p) { ctx.render(); return; }
        if (p.leaderId === me()) await tx(p.id, (cur) => reopenRaidParty(cur, { id: me(), now: ctx.now() }));
        ctx.render();
    }

    /** 보상 받기: 봉은 내 지갑에, 경험치는 대표 펫에게. 같은 전투는 한 번만 받아요. */
    async function claim(run) {
        const st = deps.state();
        const b = box();
        const res = claimRaidReward(b.raid, run, { id: me(), today: ctx.today(), settings: raidCfg() });
        if (!res.ok) return null;
        let next = { ...b, raid: res.progress };
        // 경험치는 전투에 나간 펫이 받아요(그 펫을 못 찾으면 대표 펫).
        const fought = run.members.find((m) => m.id === me());
        const foughtIdx = fought ? next.list.findIndex((pp, i) => i < next.slots && pp.phase === 'pet' && pp.species === fought.species && pp.level === fought.level && pp.enhance === fought.enhance) : -1;
        const idx = foughtIdx >= 0 ? foughtIdx : petBoxMainIndex(next);
        let levelUps = 0;
        if (idx >= 0 && res.exp > 0) {
            const grown = grantPetExp({ ...next.list[idx], dex: next.dex }, res.exp);
            levelUps = grown.levelUps;
            next = petBoxWith(next, idx, grown.pet);
            next.raid = res.progress;
        }
        const bong = ctx.free() ? 0 : res.bong;
        st.pet = petBoxToDoc(next);
        if (bong > 0) deps.applyBong(bong);
        const saved = await deps.save({ ...(bong > 0 ? { maxBongIncrease: bong } : {}), operationLabel: `펫 탐험 ${run.stage}스테이지 보상` });
        if (!saved) { deps.toast('보상을 저장하지 못했어요. 탐험 화면을 다시 열면 받을 수 있어요.'); shown.delete(run.id); return null; }
        return { ...res, bong, levelUps };
    }

    /** 새로 출발한(아직 못 본) 내 전투가 있으면 연출을 틀고 보상을 받아요. */
    async function maybePlay() {
        if (playing || !ctx.isRaidTab()) return;
        const run = pendingRun();
        if (!run || shown.has(run.id)) return;
        playing = run.id;
        shown.add(run.id);
        const sim = replayRaidRun(run);
        try {
            await playBattle(run, sim);
        } catch (e) {
            console.warn('petRaid battle', e);
        }
        const reward = await claim(run);
        lastResult = { run, sim, reward };
        playing = '';
        const fb = ctx.feedback();
        if (fb) fb.play(run.win ? 'ok' : 'no');
        ctx.render();
    }

    /* ---------- 전투 연출 ---------- */

    function bossArtUrl(art) {
        const [sp, st] = String(art || 'sproutdeer_1').split('_');
        return petImageUrl(sp, Number(st) || 1);
    }

    async function playBattle(run, sim) {
        // 전투는 화면 전체를 덮어요(되는 기기에서는 진짜 전체 화면으로 바꿔요).
        const host = document.body;
        // 기기에서 '움직임 줄이기'를 켜 두어도 전투는 같은 속도로 보여 줘요(화면 흔들림만 CSS에서 꺼요).
        const reduce = false;
        const color = TYPE_COLOR[run.boss.type] || '#fff';
        const el = document.createElement('div');
        el.className = `raid-fx type-${run.boss.type}`;
        el.style.setProperty('--boss', color);
        el.innerHTML = `
            <div class="raid-fx-bg" aria-hidden="true"><i></i><i></i></div>
            <button type="button" class="raid-fx-skip">건너뛰기 ▸▸</button>
            <div class="raid-fx-top">
                <p class="raid-fx-stage">STAGE ${run.stage}</p>
                <p class="raid-fx-name">${PET_TYPES[run.boss.type].emoji} ${esc(run.boss.name)}</p>
                <div class="raid-fx-hp"><i style="width:100%"></i><span>${run.boss.hp.toLocaleString()}</span></div>
            </div>
            <div class="raid-fx-boss"><img src="${bossArtUrl(run.boss.art)}" alt="" draggable="false"></div>
            <div class="raid-fx-layer" aria-hidden="true"></div>
            <div class="raid-fx-team">${run.members.map((m) => `
                <span class="raid-fx-pet type-${m.type}" data-id="${esc(m.id)}" style="--c:${TYPE_COLOR[m.type]}">
                    ${petArtHtml({ species: m.species, stage: m.stage, shiny: m.shiny, eager: true })}
                    <b>${esc(m.name)}</b>
                    <em data-dmg></em>
                </span>`).join('')}</div>
            <div class="raid-fx-hpside">${run.members.map((m) => `
                <p class="raid-fx-hprow${m.id === me() ? ' is-me' : ''}" data-hp-id="${esc(m.id)}"><b>${esc(m.name)}</b><span><i style="width:100%"></i></span><em>${raidPetStats(m.power).hp}</em></p>`).join('')}</div>
            <p class="raid-fx-phase"></p>
            <div class="raid-fx-feed" aria-hidden="true"></div>
            <p class="raid-fx-banner" aria-live="polite"></p>`;
        // 흔들림·번쩍임 때 뒤 화면이 비치지 않게, 움직이지 않는 어두운 바탕(wrap) 안에서만 전투 화면을 흔들어요.
        const wrap = document.createElement('div');
        wrap.className = 'raid-fx-wrap';
        wrap.appendChild(el);
        host.appendChild(wrap);
        try { if (wrap.requestFullscreen) wrap.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (_) { /* 전체 화면이 안 되는 기기 */ }
        // 참가자 체력: 화면 가장자리에 한 줄씩 보여 줘요.
        const maxHpOf = {};
        const hpOf = {};
        run.members.forEach((m) => { maxHpOf[m.id] = raidPetStats(m.power).hp; hpOf[m.id] = maxHpOf[m.id]; });
        const setMemberHp = (id, hpNow) => {
            hpOf[id] = Math.max(0, hpNow);
            const row = el.querySelector(`[data-hp-id="${CSS.escape(id)}"]`);
            if (!row) return;
            const ratio = hpOf[id] / (maxHpOf[id] || 1);
            row.querySelector('i').style.width = `${ratio * 100}%`;
            row.querySelector('em').textContent = hpOf[id] > 0 ? hpOf[id] : '쓰러짐';
            row.classList.toggle('is-low', ratio > 0 && ratio <= 0.35);
            row.classList.toggle('is-out', hpOf[id] <= 0);
        };
        let skipped = false;
        el.querySelector('.raid-fx-skip').addEventListener('click', () => { skipped = true; });
        const pause = (ms) => (skipped || reduce ? Promise.resolve() : wait(ms));
        const bossEl = el.querySelector('.raid-fx-boss');
        const layer = el.querySelector('.raid-fx-layer');
        const hpBar = el.querySelector('.raid-fx-hp i');
        const hpText = el.querySelector('.raid-fx-hp span');
        const banner = el.querySelector('.raid-fx-banner');
        const petEl = (id) => el.querySelector(`.raid-fx-pet[data-id="${CSS.escape(id)}"]`);
        const center = (node) => {
            const a = node.getBoundingClientRect();
            const b = el.getBoundingClientRect();
            return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
        };
        const pop = (node, cls, ms = 400) => { if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };
        /** 떠오르는 숫자. who 를 주면 누가 때렸는지 이름표가 같이 떠요. */
        const float = (text, x, y, cls, who = '') => {
            if (skipped) return;
            const n = document.createElement('span');
            n.className = `raid-fx-num ${cls || ''}`;
            if (who) { const w = document.createElement('small'); w.textContent = who; n.appendChild(w); }
            const b = document.createElement('b');
            b.textContent = text;
            n.appendChild(b);
            n.style.left = `${x}px`;
            n.style.top = `${y}px`;
            layer.appendChild(n);
            setTimeout(() => n.remove(), 1250);
        };
        const setHp = (hp) => {
            hpBar.style.width = `${Math.max(0, (hp / sim.bossMaxHp) * 100)}%`;
            hpText.textContent = Math.max(0, hp).toLocaleString();
        };
        const say = async (text, cls, ms) => {
            banner.textContent = text;
            banner.className = `raid-fx-banner is-on ${cls || ''}`;
            await pause(ms);
            banner.className = 'raid-fx-banner';
        };
        const phase = el.querySelector('.raid-fx-phase');
        const feed = el.querySelector('.raid-fx-feed');
        const nameOf = {};
        const total = {};
        const skillOf = {};
        run.members.forEach((m) => { nameOf[m.id] = m.name; total[m.id] = 0; skillOf[m.id] = PET_SKILL_NAMES[m.species] || []; });
        /** 오른쪽 위 기록: 누가 얼마를 때렸는지 최근 4줄 */
        const log = (who, dmg, cls) => {
            const row = document.createElement('p');
            row.className = `raid-fx-feed-row ${cls || ''}`;
            const a = document.createElement('b'); a.textContent = who;
            const d = document.createElement('i'); d.textContent = dmg;
            row.append(a, d);
            feed.prepend(row);
            while (feed.children.length > 4) feed.lastChild.remove();
        };

        try {
            await pause(250);
            await say(`${run.members.length}마리 출격!`, '', 900);
            let hp = sim.bossMaxHp;
            let slot = 0;
            let watching = false;
            for (let r = 0; r < sim.rounds.length; r += 1) {
                const round = sim.rounds[r];
                if (skipped) break;
                // 우리 팀 공격: 차례로 속성 빛줄기를 쏴요. 숫자는 자리를 바꿔 가며 띄워 겹치지 않게 해요.
                phase.textContent = `${r + 1}턴 · 우리 팀 공격!`;
                phase.className = 'raid-fx-phase is-team';
                const gap = Math.max(130, Math.min(220, 1900 / round.hits.length));
                const bc = center(bossEl);
                const br = bossEl.getBoundingClientRect();
                round.hits.forEach((h, i) => {
                    setTimeout(() => {
                        if (skipped) return;
                        const pe = petEl(h.by);
                        if (!pe) return;
                        const pc = center(pe);
                        pop(pe, 'is-attack', 320);
                        const shot = document.createElement('i');
                        const sk = Math.max(0, Math.min(2, Number(h.skill) || 0));
                        shot.className = `raid-fx-shot is-s${sk}${h.crit ? ' is-crit' : ''}`;
                        if (sk >= 1) {
                            // 두 번째·세 번째 기술은 빛줄기가 함께 나가요.
                            const beam = document.createElement('i');
                            beam.className = `raid-fx-beam is-s${sk}`;
                            beam.style.setProperty('--c', pe.style.getPropertyValue('--c'));
                            beam.style.left = `${pc.x}px`;
                            beam.style.top = `${pc.y}px`;
                            beam.style.width = `${Math.hypot(bc.x - pc.x, bc.y - pc.y)}px`;
                            beam.style.transform = `rotate(${Math.atan2(bc.y - pc.y, bc.x - pc.x)}rad)`;
                            layer.appendChild(beam);
                            setTimeout(() => beam.remove(), 360);
                        }
                        shot.style.setProperty('--c', pe.style.getPropertyValue('--c'));
                        shot.style.left = `${pc.x}px`;
                        shot.style.top = `${pc.y}px`;
                        layer.appendChild(shot);
                        const anim = shot.animate([
                            { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 1 },
                            { transform: `translate(calc(-50% + ${bc.x - pc.x}px), calc(-50% + ${bc.y - pc.y}px)) scale(${h.crit ? 1.9 : 1.2})`, opacity: 1 },
                        ], { duration: 210, easing: 'cubic-bezier(.5,0,.9,.5)' });
                        anim.onfinish = () => {
                            shot.remove();
                            if (skipped) return;
                            hp = Math.max(0, hp - h.dmg);
                            setHp(hp);
                            // 보스가 맞는 모션: 하얗게 번쩍이며 뒤로 밀려요(치명타는 더 크게).
                            pop(bossEl, h.crit ? 'is-hit-crit' : 'is-hit', h.crit ? 420 : 260);
                            const hx = bc.x + (Math.random() * 0.5 - 0.25) * br.width;
                            const hy = bc.y + (Math.random() * 0.4 - 0.2) * br.height;
                            const burst = document.createElement('i');
                            burst.className = `raid-fx-burst${h.crit || sk === 2 ? ' is-crit' : ''}`;
                            burst.style.setProperty('--c', pe.style.getPropertyValue('--c'));
                            burst.style.left = `${hx}px`;
                            burst.style.top = `${hy}px`;
                            layer.appendChild(burst);
                            setTimeout(() => burst.remove(), 420);
                            const cut = document.createElement('i');
                            cut.className = `raid-fx-cut${h.crit ? ' is-crit' : ''}`;
                            cut.style.left = `${hx}px`;
                            cut.style.top = `${hy}px`;
                            cut.style.setProperty('--r', `${Math.floor(Math.random() * 120 - 60)}deg`);
                            layer.appendChild(cut);
                            setTimeout(() => cut.remove(), 300);
                            // 누가 얼마를 때렸는지: 보스 양옆으로 번갈아 띄워요.
                            const col = slot % 4;
                            slot += 1;
                            // 왼쪽 가장자리에는 체력 줄이 있어서, 숫자는 보스 위쪽과 오른쪽에 띄워요.
                            const fx = bc.x + br.width * [-0.1, 0.3, 0.1, 0.42][col];
                            const fy = bc.y - br.height * [0.4, 0.3, 0.16, 0.06][col];
                            const cls = h.crit ? 'is-crit' : h.mult > 1 ? 'is-strong' : h.mult < 1 ? 'is-weak' : '';
                            const skName = skillOf[h.by] && skillOf[h.by][sk] ? skillOf[h.by][sk] : '';
                            float(`${h.crit ? '💥' : ''}${h.dmg.toLocaleString()}`, fx, fy, cls, `${nameOf[h.by] || ''}${skName ? ` · ${skName}` : ''}`);
                            log(`${nameOf[h.by] || ''}${skName ? ` ${skName}` : ''}`, `${h.crit ? '치명타 ' : ''}${h.dmg.toLocaleString()}`, cls);
                            if (sk === 2) pop(el, 'is-shake', 320);
                            total[h.by] = (total[h.by] || 0) + h.dmg;
                            const sum = pe.querySelector('[data-dmg]');
                            if (sum) { sum.textContent = total[h.by].toLocaleString(); pop(sum, 'is-up', 300); }
                            if (h.crit) pop(el, 'is-shake', 320);
                        };
                    }, i * gap);
                });
                await pause(round.hits.length * gap + 420);
                setHp(round.bossHp);
                hp = round.bossHp;
                // 보스의 공격: 몸을 웅크렸다가 덮치고, 화면이 빨갛게 번쩍여요.
                if (round.boss.length && !skipped) {
                    const all = round.bossMove === 'all' || (!round.bossMove && round.boss.length > 1);
                    phase.textContent = `${run.boss.name}의 ${all ? '전체 공격!' : '단일 공격!'}`;
                    if (!all && round.boss[0]) {
                        // 단일 공격: 누구를 노리는지 먼저 표시해요.
                        const tp = petEl(round.boss[0].target);
                        if (tp) { const c0 = center(tp); const mark = document.createElement('i'); mark.className = 'raid-fx-target'; mark.style.left = `${c0.x}px`; mark.style.top = `${c0.y}px`; layer.appendChild(mark); setTimeout(() => mark.remove(), 900); }
                    }
                    phase.className = 'raid-fx-phase is-boss';
                    pop(bossEl, 'is-windup', 380);
                    await pause(360);
                    pop(bossEl, 'is-strike', 520);
                    await pause(170);
                    if (!skipped) {
                        const red = document.createElement('i');
                        red.className = `raid-fx-red${all ? '' : ' is-single'}`;
                        el.appendChild(red);
                        setTimeout(() => red.remove(), 620);
                        if (all) {
                            // 전체 공격: 팀 전체를 할퀴고 충격파가 퍼져요.
                            const claw = document.createElement('i');
                            claw.className = 'raid-fx-claw';
                            const tr = el.querySelector('.raid-fx-team').getBoundingClientRect();
                            const er = el.getBoundingClientRect();
                            claw.style.top = `${tr.top - er.top + tr.height / 2}px`;
                            layer.appendChild(claw);
                            setTimeout(() => claw.remove(), 480);
                            const wave = document.createElement('i');
                            wave.className = 'raid-fx-wave';
                            const bc2 = center(bossEl);
                            wave.style.left = `${bc2.x}px`;
                            wave.style.top = `${bc2.y}px`;
                            layer.appendChild(wave);
                            setTimeout(() => wave.remove(), 600);
                        } else if (round.boss[0]) {
                            // 단일 공격: 한 마리에게 큰 충격이 꽂혀요.
                            const tp = petEl(round.boss[0].target);
                            if (tp) { const c1 = center(tp); const hit = document.createElement('i'); hit.className = 'raid-fx-smash'; hit.style.left = `${c1.x}px`; hit.style.top = `${c1.y}px`; layer.appendChild(hit); setTimeout(() => hit.remove(), 460); }
                        }
                        pop(el, 'is-quake', 420);
                        try { if (navigator.vibrate) navigator.vibrate([40, 30, 80]); } catch (_) { /* 진동 없는 기기 */ }
                    }
                    round.boss.forEach((h) => {
                        const pe = petEl(h.target);
                        if (!pe) return;
                        const pc = center(pe);
                        pop(pe, 'is-hurt', 460);
                        setMemberHp(h.target, hpOf[h.target] - h.dmg);
                        float(`-${h.dmg.toLocaleString()}`, pc.x, pc.y - 30, all ? 'is-hurt' : 'is-hurt is-big');
                        if (h.faint && h.target === me()) { watching = true; }
                        if (h.faint) { pe.classList.add('is-faint'); log(nameOf[h.target] || '', '쓰러짐', 'is-hurt'); }
                    });
                    await pause(560);
                    // 내 펫이 쓰러져도 전투는 끝까지 지켜봐요.
                    if (watching && !skipped) { phase.textContent = '내 펫이 쓰러졌어요 · 끝까지 응원해요!'; phase.className = 'raid-fx-phase is-boss'; await pause(500); }
                }
            }
            // 건너뛰었으면 체력도 마지막 값으로 맞춰요.
            {
                const left = {};
                run.members.forEach((m) => { left[m.id] = maxHpOf[m.id]; });
                sim.rounds.forEach((rd) => rd.boss.forEach((h) => { left[h.target] = h.faint ? 0 : left[h.target] - h.dmg; }));
                run.members.forEach((m) => setMemberHp(m.id, left[m.id]));
            }
            // 건너뛰었으면 마지막 모습으로 맞춰요.
            setHp(sim.bossHp);
            run.members.forEach((m) => { const pe = petEl(m.id); if (pe && !sim.alive.includes(m.id)) pe.classList.add('is-faint'); });
            skipped = false;
            if (sim.win) {
                bossEl.classList.add('is-down');
                el.classList.add('is-win');
                for (let i = 0; i < 28; i += 1) {
                    const c = document.createElement('i');
                    c.className = 'raid-fx-confetti';
                    c.style.left = `${Math.random() * 100}%`;
                    c.style.setProperty('--d', `${Math.random() * 0.5}s`);
                    c.style.setProperty('--h', `${Math.floor(Math.random() * 360)}`);
                    layer.appendChild(c);
                }
                await say('승리!', 'is-win', reduce ? 600 : 1700);
            } else {
                el.classList.add('is-lose');
                await say(sim.alive.length ? '시간 초과…' : '모두 쓰러졌어요…', 'is-lose', reduce ? 600 : 1500);
            }
        } finally {
            try { if (document.fullscreenElement === wrap && document.exitFullscreen) await document.exitFullscreen(); } catch (_) { /* 무시 */ }
            wrap.remove();
        }
    }

    /* ---------- 그리기 ---------- */

    const typeBadge = (t) => `<span class="pet-type type-${t}">${PET_TYPES[t].emoji} ${esc(PET_TYPES[t].name)}</span>`;

    function memberChip(m, bossType, leaderId, showReady = false) {
        const mult = raidTypeMult(m.type, bossType);
        return `<div class="raid-member type-${m.type}${m.id === me() ? ' is-me' : ''}">
            <span class="raid-member-art">${petArtHtml({ species: m.species, stage: m.stage, shiny: m.shiny })}</span>
            <span class="raid-member-text"><b>${m.id === leaderId ? '👑 ' : ''}${esc(m.name)}</b><i>${esc(m.petName)} · ${m.power}</i></span>
            ${mult > 1 ? '<em class="raid-eff is-good">유리 ▲</em>' : mult < 1 ? '<em class="raid-eff is-bad">불리 ▼</em>' : ''}
            ${showReady ? `<em class="raid-ready${m.ready ? ' is-on' : ''}">${m.ready ? '✅' : '⏳'}</em>` : ''}
        </div>`;
    }

    function bossCard(stage, cfg, { small = false } = {}) {
        const s = cfg.stages[stage - 1];
        const firsts = box().raid.firsts;
        return `<div class="raid-boss type-${s.type}${small ? ' is-small' : ''}" style="--boss:${TYPE_COLOR[s.type]}">
            <span class="raid-boss-art"><img src="${bossArtUrl(s.art)}" alt="" loading="lazy" draggable="false"></span>
            <span class="raid-boss-text">
                <i>STAGE ${stage}${firsts.includes(stage) ? ' · 깼어요 ✓' : ''}</i>
                <b>${esc(s.name)}</b>
                <span>${typeBadge(s.type)} <em>체력 ${s.hp.toLocaleString()}</em></span>
                <span class="raid-boss-reward">첫 보상 ${esc(deps.bong(s.first))} · 반복 ${esc(deps.bong(s.repeat))}</span>
            </span>
        </div>`;
    }

    function resultHtml() {
        const { run, sim, reward } = lastResult;
        const top = Object.entries(sim.dealt).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const nameOf = (id) => { const m = run.members.find((x) => x.id === id); return m ? m.name : id; };
        let line = '';
        if (!reward) line = '보상은 이미 받았어요.';
        else if (!run.win) line = reward.exp > 0 ? `다음엔 친구를 더 모아 봐요! 대표 펫 경험치 +${reward.exp}` : '다음엔 친구를 더 모아 봐요!';
        else if (reward.limited) line = `오늘 반복 보상 ${raidCfg().dailyRewards}번을 다 받았어요. 내일 또 받을 수 있어요.`;
        else if (ctx.free()) line = `대표 펫 경험치 +${reward.exp} (선생님은 봉을 받지 않아요)`;
        else if (reward.first) line = `첫 클리어 보상 ${deps.bong(reward.bong)} · 대표 펫 경험치 +${reward.exp}`;
        else line = `보상 ${deps.bong(reward.bong)} · 대표 펫 경험치 +${reward.exp}`;
        const p = myParty();
        const leader = p && p.leaderId === me();
        return `<div class="pet-card raid-result ${run.win ? 'is-win' : 'is-lose'}">
            <p class="raid-result-title">${run.win ? '🏆 탐험 성공!' : '💦 탐험 실패'}</p>
            <p class="pet-lead">STAGE ${run.stage} · ${esc(run.boss.name)} · ${sim.rounds.length}턴${run.win ? '' : ` · 보스 체력 ${sim.bossHp.toLocaleString()} 남음`}</p>
            <p class="raid-result-reward">${esc(line)}${reward && reward.levelUps ? ' · 레벨 업!' : ''}</p>
            <div class="raid-mvp">${top.map(([id, dmg], i) => `<span>${['🥇', '🥈', '🥉'][i]} ${esc(nameOf(id))} <b>${dmg.toLocaleString()}</b></span>`).join('')}</div>
            <button type="button" class="pet-btn is-main" data-p="raid-again">${leader ? '같은 팀으로 다시 모으기' : '확인'}</button>
        </div>`;
    }

    /** 데려갈 펫 고르기: 내 펫이 두 마리 이상일 때만 보여요. */
    function petPickHtml(bossType) {
        const b = box();
        const cur = raidSlot();
        const list = [];
        for (let i = 0; i < b.slots; i += 1) {
            const pp = b.list[i];
            if (!pp || pp.phase !== 'pet') continue;
            const v = petView(pp, ctx.now(), ctx.today());
            if (v.away) continue;
            list.push({ i, v });
        }
        if (list.length < 2) return '';
        return `<p class="pet-sub">데려갈 펫 바꾸기 <em>(바꾸면 다시 준비해야 해요)</em></p>
            <div class="raid-petpick">${list.map(({ i, v }) => {
                const type = PET_SPECIES_TYPE(v.species);
                const mult = bossType ? raidTypeMult(type, bossType) : 1;
                return `<button type="button" class="raid-petpick-item type-${type}${i === cur ? ' is-on' : ''}" data-p="raid-pet" data-slot="${i}" aria-pressed="${i === cur}">
                    <span class="raid-member-art">${petArtHtml({ species: v.species, stage: v.stage, shiny: v.shiny })}</span>
                    <b>${esc(v.name)}</b><i>전투력 ${petPower(v)}${mult > 1 ? ' · 유리 ▲' : mult < 1 ? ' · 불리 ▼' : ''}</i>
                </button>`;
            }).join('')}</div>`;
    }

    function partyHtml(p, cfg) {
        const readyCount = p.members.filter((m) => m.ready).length;
        const iAmReady = p.members.some((m) => m.id === me() && m.ready);
        const leader = p.leaderId === me();
        const max = maxParty();
        const total = p.members.reduce((s, m) => s + m.power, 0);
        const stageOpts = Array.from({ length: unlocked() }, (_, i) => `<option value="${i + 1}"${p.stage === i + 1 ? ' selected' : ''}>STAGE ${i + 1} · ${esc(cfg.stages[i].name)}</option>`).join('');
        const waiting = p.status === 'fight';
        return `<div class="pet-card raid-party">
            ${bossCard(p.stage, cfg)}
            ${leader && !waiting ? `<label class="raid-stage-pick">스테이지 <select data-raid-stage>${stageOpts}</select></label>` : ''}
            <p class="pet-sub">우리 팀 ${p.members.length} / ${max}명 · 전투력 합 ${total.toLocaleString()}</p>
            <div class="raid-members">${p.members.map((m) => memberChip(m, cfg.stages[p.stage - 1].type, p.leaderId, !waiting)).join('')}</div>
            ${waiting ? '' : petPickHtml(cfg.stages[p.stage - 1].type)}
            <p class="pet-note">사람이 많을수록 유리해요. 한 명 늘 때마다 팀 공격력이 ${cfg.teamBonus}%씩 세져요. 전투는 자동이에요.</p>
            ${waiting ? '<p class="pet-lead">전투가 끝났어요. 방장이 다시 모으면 또 갈 수 있어요.</p>'
                : `<p class="pet-lead">${p.members.length >= cfg.minParty ? `모두 「준비」를 누르면 바로 출발해요! (${readyCount}/${p.members.length}명 준비)` : `${cfg.minParty}명이 모여야 출발할 수 있어요. 친구를 기다려요! (${readyCount}/${p.members.length}명 준비)`}</p>
                    <button type="button" class="pet-btn ${iAmReady ? '' : 'is-main'}" data-p="raid-ready">${iAmReady ? '준비 취소' : '⚔️ 준비!'}</button>`}
            ${leader && waiting ? '<button type="button" class="pet-btn is-main" data-p="raid-again">같은 팀으로 다시 모으기</button>' : ''}
            <button type="button" class="pet-link" data-p="raid-leave">${leader ? '방 없애기' : '팀에서 나가기'}</button>
        </div>`;
    }

    function lobbyHtml(cfg) {
        const open = liveParties().filter((p) => p.status === 'open' && p.members.length > 0);
        const un = unlocked();
        const sel = Math.min(pickedStage || un, un);
        const m = myMember();
        const stages = cfg.stages.map((s, i) => {
            const n = i + 1;
            const locked = n > un;
            const done = box().raid.firsts.includes(n);
            return `<button type="button" class="raid-stage type-${s.type}${sel === n ? ' is-on' : ''}${locked ? ' is-locked' : ''}${done ? ' is-done' : ''}" data-p="raid-pick" data-stage="${n}"${locked ? ' disabled' : ''} style="--boss:${TYPE_COLOR[s.type]}">
                <span class="raid-stage-art"><img src="${bossArtUrl(s.art)}" alt="" loading="lazy" draggable="false"></span>
                <b>${n}</b><i>${locked ? '🔒' : done ? '✓' : PET_TYPES[s.type].emoji}</i>
            </button>`;
        }).join('');
        const day = box().raid.day === ctx.today() ? box().raid.dayRewards : 0;
        return `<div class="pet-card raid-lobby">
            <h3 class="pet-title">⚔️ 보스 탐험</h3>
            <p class="pet-lead">친구들의 대표 펫과 팀을 만들어 보스를 잡아요. ${cfg.minParty}명부터 ${maxParty()}명까지, 도전은 몇 번이든 할 수 있어요.</p>
            <div class="raid-stages">${stages}</div>
            ${bossCard(sel, cfg)}
            <p class="pet-note">오늘 반복 보상 ${Math.min(day, cfg.dailyRewards)} / ${cfg.dailyRewards}번 받음 · 첫 클리어 보상은 따로 받아요. 방은 내가 깬 다음 스테이지까지 만들 수 있고, 친구 방에는 어느 스테이지든 참가할 수 있어요.</p>
            ${petPickHtml(cfg.stages[sel - 1].type)}
            ${m ? `<button type="button" class="pet-btn is-main" data-p="raid-create">🚩 STAGE ${sel} 탐험 방 만들기</button>`
                : `<p class="pet-lead is-warn">${esc(raidErrorText('no_pet'))}</p>`}
        </div>
        <div class="pet-card">
            <p class="pet-sub">모이는 중인 탐험 방</p>
            ${open.length ? open.map((p) => `<div class="raid-room type-${cfg.stages[p.stage - 1].type}">
                <span class="raid-room-text"><b>${esc(p.leaderName)}의 탐험대</b><i>STAGE ${p.stage} · ${esc(cfg.stages[p.stage - 1].name)} · ${p.members.length}/${maxParty()}명</i></span>
                <button type="button" class="pet-btn is-food" data-p="raid-join" data-party="${esc(p.id)}"${m && p.members.length < maxParty() ? '' : ' disabled'}>함께 가기</button>
            </div>`).join('') : '<p class="pet-note">아직 모이는 방이 없어요. 방을 만들고 친구를 불러 봐요!</p>'}
        </div>`;
    }

    /** 속성 상성표: 누가 누구에게 강하고 약한지 */
    function chartHtml() {
        const types = Object.keys(PET_TYPES);
        const rows = types.map((t) => {
            const strong = RAID_STRONG[t] || [];
            const weak = types.filter((x) => (RAID_STRONG[x] || []).includes(t));
            const chips = (list) => (list.length ? list.map((x) => typeBadge(x)).join(' ') : '<i class="raid-chart-none">없음</i>');
            return `<tr><th>${typeBadge(t)}</th><td>${chips(strong)}</td><td>${chips(weak)}</td></tr>`;
        }).join('');
        return `<details class="pet-card raid-chart">
            <summary>📊 속성 상성표 보기</summary>
            <table>
                <thead><tr><th>내 펫</th><th>강해요 (데미지 1.5배)</th><th>약해요 (데미지 0.75배)</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="pet-note">강한 상대에게는 더 세게 때리고 덜 아프게 맞아요. 약한 상대에게는 그 반대예요. 보스 속성을 보고 팀을 짜 봐요!</p>
        </details>`;
    }

    /** 마스터 설정: 스테이지·보상·하루 보상 횟수 */
    function adminHtml(cfg) {
        if (!deps.isAdmin || !deps.isAdmin()) return '';
        const n = (name, value, min, max, cls = '') => `<input type="number" inputmode="numeric" class="pet-set-input ${cls}" data-raid-set="${name}" value="${value}" min="${min}" max="${max}">`;
        const rows = cfg.stages.map((s, i) => `<tr>
            <td>${i + 1}</td>
            <td><input type="text" class="pet-set-input is-text" data-raid-set="name-${i}" value="${esc(s.name)}" maxlength="16"></td>
            <td><select class="pet-set-input is-sel" data-raid-set="type-${i}">${Object.keys(PET_TYPES).map((t) => `<option value="${t}"${s.type === t ? ' selected' : ''}>${PET_TYPES[t].emoji}${PET_TYPES[t].name}</option>`).join('')}</select></td>
            <td>${n(`hp-${i}`, s.hp, 100, 5000000, 'is-wide')}</td>
            <td>${n(`atk-${i}`, s.atk, 0, 100000)}</td>
            <td>${n(`aoe-${i}`, s.aoe, 0, 100, 'is-narrow')}</td>
            <td>${n(`first-${i}`, s.first, 0, 1000, 'is-narrow')}</td>
            <td>${n(`repeat-${i}`, s.repeat, 0, 1000, 'is-narrow')}</td>
        </tr>`).join('');
        return `<details class="pet-admin raid-admin">
            <summary>⚙️ 탐험 마스터 설정 (선생님만 보여요)</summary>
            <div class="pet-admin-body">
                <label class="pet-set-row"><span>하루 보상 횟수</span>${n('dailyRewards', cfg.dailyRewards, 0, 99)} 번 (도전은 무제한)</label>
                <label class="pet-set-row"><span>출발 최소</span>${n('minParty', cfg.minParty, 1, RAID_MAX_PARTY)} 명</label>
                <label class="pet-set-row"><span>한 팀 최대</span>${n('maxParty', cfg.maxParty, 0, RAID_MAX_PARTY)} 명 (0 = 학급 인원, 최대 13)</label>
                <label class="pet-set-row"><span>인원 보너스</span>한 명 늘 때마다 공격력 +${n('teamBonus', cfg.teamBonus, 0, 50)} %</label>
                <div class="raid-admin-table"><table>
                    <thead><tr><th>#</th><th>보스 이름</th><th>속성</th><th>체력</th><th>공격력</th><th>전체 공격 %</th><th>첫 보상</th><th>반복 보상</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>
                <p class="pet-note">펫 한 마리: 체력 200 + 전투력×2, 공격력 20 + 전투력×0.5 (전투력은 최대 1000). 전투는 최대 18턴이에요.</p>
                <p class="pet-note">보스는 턴마다 「전체 공격 %」 확률로 모두에게 공격력의 절반을, 아니면 한 마리에게 공격력의 1.5배를 줘요. 펫은 배운 기술(Lv.1·10·20, 1배·1.3배·1.7배) 중 하나를 무작위로 써요.</p>
                <div class="pet-foods">
                    <button type="button" class="pet-btn is-main" data-p="raid-settings-save">탐험 설정 저장</button>
                    <button type="button" class="pet-btn" data-p="raid-settings-reset">기본값으로</button>
                </div>
            </div>
        </details>`;
    }

    function html() {
        if (!deps.canPlay()) return '<div class="pet-card"><p class="pet-lead">로그인하면 탐험을 떠날 수 있어요.</p></div>';
        const cfg = raidCfg();
        if (lastResult) return `${resultHtml()}${adminHtml(cfg)}`;
        const p = myParty();
        return `${p ? partyHtml(p, cfg) : lobbyHtml(cfg)}${chartHtml()}${adminHtml(cfg)}`;
    }

    async function saveSettings(reset) {
        const el = ctx.root();
        if (!el || !deps.isAdmin || !deps.isAdmin() || !deps.saveSettings) return;
        const val = (name) => { const i = el.querySelector(`[data-raid-set="${name}"]`); return i ? i.value : ''; };
        const raid = reset ? sanitizeRaidSettings(null) : sanitizeRaidSettings({
            dailyRewards: val('dailyRewards'),
            minParty: val('minParty'),
            maxParty: val('maxParty'),
            teamBonus: val('teamBonus'),
            stages: Array.from({ length: RAID_STAGE_COUNT }, (_, i) => ({ name: val(`name-${i}`), type: val(`type-${i}`), hp: val(`hp-${i}`), atk: val(`atk-${i}`), aoe: val(`aoe-${i}`), first: val(`first-${i}`), repeat: val(`repeat-${i}`) })),
        });
        try {
            const cur = (deps.settings && deps.settings()) || {};
            await deps.saveSettings({ ...cur, raid });
            deps.toast(reset ? '탐험 설정을 기본값으로 되돌렸어요.' : '탐험 설정을 저장했어요.');
        } catch (e) {
            deps.toast(`저장하지 못했어요: ${e && e.message ? e.message : e}`);
        }
        ctx.render();
    }

    /** petMode 가 넘겨주는 버튼 동작. 처리했으면 true */
    function handle(act, t) {
        if (act === 'raid-pick') { pickedStage = Number(t.getAttribute('data-stage')) || 0; ctx.render(); return true; }
        if (act === 'raid-create') { void create(); return true; }
        if (act === 'raid-join') { void join(t.getAttribute('data-party')); return true; }
        if (act === 'raid-leave') { void leave(); return true; }
        if (act === 'raid-ready') { void ready(); return true; }
        if (act === 'raid-pet') { void swapPet(Number(t.getAttribute('data-slot')) || 0); return true; }
        if (act === 'raid-again') { void again(); return true; }
        if (act === 'raid-settings-save') { void saveSettings(false); return true; }
        if (act === 'raid-settings-reset') { void saveSettings(true); return true; }
        return false;
    }

    function onChange(e) {
        const sel = e.target && e.target.closest ? e.target.closest('[data-raid-stage]') : null;
        if (sel) void changeStage(Number(sel.value) || 1);
    }

    return { start, stop, html, handle, onChange, maybePlay, keepAlive, join, isPlaying: () => !!playing, _playBattle: playBattle };
}
