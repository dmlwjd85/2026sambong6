/**
 * 메이트 펫 화면(#challengePane-pet). 규칙은 lib/petGame.js, 그림은 lib/petArt.js 가 맡아요.
 * 내 펫 / 반 펫 / 도감 세 화면이에요. 그림은 public/pets/ 일러스트이고, 못 불러오면 도형 그림(petSvg)으로 바꿔 끼워요. 봉을 쓰거나 버는 일은 학생 저장(saveDataToCloud)을 그대로 써요.
 */
import './petMode.css';
import {
    PET_EGG_PRICE,
    PET_EVOLVE_LEVELS,
    PET_FOODS,
    PET_HATCH_TAPS,
    PET_MAX_ENHANCE,
    PET_MAX_LEVEL,
    PET_MAX_POWER,
    PET_MAX_SLOTS,
    PET_NAME_MAX,
    PET_PLAY_EXP,
    PET_PLAY_PER_DAY,
    PET_RETURN_PRICE,
    PET_SPECIES,
    PET_TYPES,
    bringPetBack,
    buyPetExpPack,
    buyPetEgg,
    enhancePet,
    evolvePet,
    expandPetBox,
    feedPet,
    petBoxMainIndex,
    petBoxSlot,
    petBoxToDoc,
    petBoxWith,
    petErrorText,
    petNextSlotRule,
    petView,
    playWithPet,
    rankClassPets,
    releasePet,
    renamePet,
    sanitizePetBox,
    sanitizePetSettings,
    setPetBoxMain,
    walkPet,
    warmPetEgg,
} from './lib/petGame.js';
import { petArtHtml, petEggHtml, petEggSvg, petSvg } from './lib/petArt.js';
import { createOxFeedback } from './lib/oxQuizFeedback.js';
import { createPetRaidView } from './petRaidView.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 펫이 하는 말: 돌봐 줄 때마다 고마워하거나 애교를 부려요. */
const PET_TALK = Object.freeze({
    feed: ['냠냠! 고마워요 💕', '배불러서 행복해요~', '역시 주인님이 최고!', '맛있어요! 또 주세요 🥰', '잘 먹었습니다아~'],
    play: ['꺄르르! 더 놀아요!', '놀아 줘서 고마워요 ♪', '주인님이랑 노는 게 제일 좋아!', '한 번 더! 한 번 더!', '신난다아~ 💫'],
    walk: ['다녀왔어요! 칭찬해 줘요 🐾', '주인님 주려고 모아 왔어요!', '산책 최고! 고마워요~', '헤헤, 나 잘했죠?'],
    pack: ['우와, 힘이 솟아요! 💪', '선물 고마워요! 쑥쑥 클게요', '몸이 반짝반짝해요 ✨', '더 강해진 것 같아요!'],
    enhanceOk: ['반짝반짝! 고마워요 ✨', '나 더 멋있어졌죠?', '주인님 덕분에 세졌어요!'],
    enhanceNo: ['괜찮아요, 다음엔 될 거예요!', '힝… 그래도 고마워요', '주인님 잘못 아니에요 🥺'],
    evolve: ['짜잔! 나 어때요? 🌟', '주인님 덕분에 컸어요!', '이제 내가 지켜 줄게요!'],
    rename: ['이름 마음에 들어요! 💕', '헤헤, 불러 줘요 불러 줘요', '예쁜 이름 고마워요~'],
    main: ['내가 대표라니! 열심히 할게요 ⭐', '주인님 옆에 꼭 붙어 있을게요!', '광장에서 만나요~'],
    back: ['보고 싶었어요… 🥺', '다시는 안 나갈게요!', '찾아 줘서 고마워요 💕'],
    tap: ['헤헤, 간지러워요~', '쓰담쓰담 좋아요 💕', '주인님 좋아!', '더 만져 줘요~ 🥰', '뀨?', '오늘도 같이 있어 줘서 고마워요'],
    hungry: ['배고파요… 밥 주세요 🍚', '꼬르륵… 주인님~', '쓰다듬는 것도 좋지만 밥이 더…'],
});
const pickTalk = (kind) => { const list = PET_TALK[kind] || PET_TALK.tap; return list[Math.floor(Math.random() * list.length)]; };

const MOOD_TEXT = Object.freeze({
    happy: '기분이 아주 좋아요!',
    ok: '잘 지내고 있어요.',
    hungry: '배가 고파요…',
    starving: '배가 텅 비었어요! 밥을 줘요.',
});

/**
 * deps: { state() → playerState, canPlay() → boolean, today() → 'YYYY-MM-DD',
 *   applyBong(delta), save(opts) → Promise<boolean>, students() → [{id, name, pet}],
 *   selfId(), bong(v) → '12봉', confirm(text), prompt(text), toast(text),
 *   level() → 내 레벨(칸 늘리기 조건), settings() → 마스터 설정(petSettings), isAdmin(), saveSettings(settings) → Promise }
 */
export function createPetMode(deps) {
    const root = () => document.getElementById('challengePane-pet');
    let tab = 'mine';
    let busy = false;
    let bound = false;
    let feedback = null;
    let fx = null; // { text, kind, at } 잠깐 띄우는 글자
    let timer = 0;
    let talk = null; // { text, at, kind } 펫이 방금 한 말
    let slot = 0; // 보고 있는 칸(0~2). 아직 안 열린 칸이면 '칸 늘리기' 화면이에요.

    const now = () => Date.now();
    const today = () => deps.today();
    const myBox = () => sanitizePetBox(deps.state() && deps.state().pet);
    /** 보고 있는 칸의 펫(안 열린 칸이면 빈 펫) */
    const myPet = () => petBoxSlot(myBox(), slot) || { v: 1, phase: 'none', dex: myBox().dex };
    /** 선생님(마스터)은 봉·레벨 조건 없이 키워요. 봉을 쓰지도 벌지도 않아요. */
    const free = () => !!(deps.isAdmin && deps.isAdmin());
    const myBong = () => (free() ? 1e9 : Number(deps.state() && deps.state().bong) || 0);
    const settings = () => sanitizePetSettings(deps.settings ? deps.settings() : null);
    const myLevel = () => (free() ? 100 : Math.floor(Number(deps.level ? deps.level() : 0)) || 0);

    /** 탐험(보스 레이드) 탭. 방 목록은 탐험 탭을 볼 때만 받아요. */
    const raid = createPetRaidView({
        root,
        deps,
        now,
        today,
        free,
        isRaidTab: () => tab === 'raid' && isOpen(),
        feedback: () => feedback,
        render: () => {
            if (tab !== 'raid') return;
            // 마스터가 탐험 설정 칸에 적는 중이면 다시 그리지 않아요.
            const el = root();
            const a = document.activeElement;
            if (el && a && a.closest && a.closest('.raid-admin') && el.contains(a)) return;
            render();
        },
    });

    function isOpen() { const el = root(); return !!(el && !el.classList.contains('hidden')); }

    function bind() {
        const el = root();
        if (!el || bound) return;
        bound = true;
        feedback = createOxFeedback(el);
        // 그림 파일을 못 불러오면 같은 자리에 도형 그림을 넣어요(error 는 거품이 안 올라와서 capture 로 받아요).
        el.addEventListener('error', (e) => {
            const img = e.target;
            if (!img || img.tagName !== 'IMG' || !img.classList.contains('pet-img')) return;
            const box = img.closest('.pet-art');
            if (!box || box.classList.contains('is-fallback')) return;
            box.classList.add('is-fallback');
            if (box.getAttribute('data-pet-egg')) {
                img.replaceWith(document.createRange().createContextualFragment(petEggSvg({ taps: Number(box.getAttribute('data-pet-taps')) || 0, total: 100 })));
                const cracks = box.querySelector('.pet-egg-cracks');
                if (cracks) cracks.remove();
                return;
            }
            img.replaceWith(document.createRange().createContextualFragment(petSvg({
                species: box.getAttribute('data-pet-sp'),
                stage: Number(box.getAttribute('data-pet-st')) || 1,
                shiny: box.getAttribute('data-pet-shiny') === '1',
                mood: box.getAttribute('data-pet-mood') || 'happy',
            })));
        }, true);
        el.addEventListener('click', (e) => {
            const t = e.target.closest('[data-p]');
            if (!t || !el.contains(t) || t.disabled) return;
            const act = t.getAttribute('data-p');
            if (raid.handle(act, t)) return;
            if (act === 'tab') { tab = t.getAttribute('data-tab') || 'mine'; if (tab === 'raid') raid.start(); else raid.stop(); render(); if (tab === 'raid') void raid.maybePlay(); }
            else if (act === 'slot') { talk = null; slot = Math.max(0, Math.min(PET_MAX_SLOTS - 1, Number(t.getAttribute('data-slot')) || 0)); fx = null; render(); }
            else if (act === 'expand') void expand();
            else if (act === 'main') void runBox('대표 펫 정하기', (b) => setPetBoxMain(b, slot), () => { react('main'); show('대표 펫으로 정했어요! 광장 카드와 반 펫 랭킹에 보여요.', 'good'); });
            else if (act === 'settings-save') void saveSettings();
            else if (act === 'buy') void run('펫 알 사기', (p, o) => buyPetEgg(p, o));
            else if (act === 'warm') void warm();
            else if (act === 'feed') void feed(t.getAttribute('data-food'));
            else if (act === 'play') void run('펫과 놀기', (p, o) => playWithPet(p, o), { after: (r) => { react('play'); grew(r, '신나게 놀았어요!'); } });
            else if (act === 'walk') void run('펫 산책 보상', (p, o) => walkPet(p, o), { after: (r) => { react('walk'); show(free() ? '산책을 다녀왔어요! (선생님은 봉을 받지 않아요)' : `산책에서 ${deps.bong(r.gain)}을 벌어 왔어요!`, r.gain > 0 ? 'good' : ''); if (feedback && r.gain > 0) feedback.play('ok'); } });
            else if (act === 'pack') void pack(Number(t.getAttribute('data-pack')) || 0);
            else if (act === 'enhance') void enhance();
            else if (act === 'evolve') void evolve();
            else if (act === 'back') void run('펫 데려오기', (p, o) => bringPetBack(p, o), { after: () => { react('back'); show('집으로 돌아왔어요! 이제 잘 챙겨 줘요.', 'good'); } });
            else if (act === 'rename') void rename();
            else if (act === 'pet-tap') { const v = petView(myPet(), now(), today(), settings()); react(v.mood === 'hungry' || v.mood === 'starving' ? 'hungry' : 'tap'); try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) { /* 진동 없는 기기 */ } render(); }
            else if (act === 'release') void release();
        });
        el.addEventListener('change', (e) => raid.onChange(e));
    }

    /** 펫이 고마워하거나 애교를 부려요(말풍선 + 폴짝 + 하트). */
    function react(kind) {
        const at = now();
        talk = { text: pickTalk(kind), at, kind };
        setTimeout(() => { if (talk && talk.at === at) { talk = null; if (!busy && tab === 'mine') render(); } }, 2600);
    }

    function show(text, kind = '') {
        fx = { text, kind, at: now() };
        render();
        setTimeout(() => { if (fx && now() - fx.at >= 2300) { fx = null; render(); } }, 2400);
    }

    function grew(r, text) {
        if (r.levelUps > 0) {
            show(`레벨 업! Lv.${r.pet.level}`, 'good');
            if (feedback) feedback.play('ok');
        } else {
            show(`${text} +${r.exp} 경험치`, '');
        }
    }

    /**
     * 규칙 함수를 적용하고 저장해요. 봉이 들거나 생기면 저장 옵션에 그만큼만 허용해요.
     * 저장에 실패하면 저장 함수가 서버 값으로 되돌려요.
     */
    async function run(label, fn, { after = null, rnd = Math.random } = {}) {
        if (busy) return null;
        if (!deps.canPlay()) { deps.toast('로그인해야 펫을 키울 수 있어요.'); return null; }
        const st = deps.state();
        const box = myBox();
        const cur = petBoxSlot(box, slot);
        if (!cur) return null;
        const r = fn(cur, { bong: myBong(), now: now(), today: today(), rnd, walk: settings().walk });
        if (!r.ok) { deps.toast(petErrorText(r.error)); return null; }
        if (free()) { r.cost = 0; r.gain = 0; }
        busy = true;
        try {
            st.pet = petBoxToDoc(petBoxWith(box, slot, r.pet));
            if (r.cost || r.gain) deps.applyBong((r.gain || 0) - (r.cost || 0));
            render();
            const saved = await deps.save({
                ...(r.cost > 0 ? { allowBongDecrease: true, maxBongDecrease: r.cost, requireServerBongBalance: true } : {}),
                ...(r.gain > 0 ? { maxBongIncrease: r.gain } : {}),
                operationLabel: label,
            });
            if (!saved) {
                deps.toast('저장하지 못했어요. 잠시 뒤 다시 해 봐요.');
                render();
                return null;
            }
            if (after) after(r);
            else render();
            return r;
        } finally {
            busy = false;
        }
    }

    /** 상자(칸·대표 펫) 쪽 일을 적용하고 저장해요. fn(box) → { ok, error, box, cost } */
    async function runBox(label, fn, after = null) {
        if (busy) return null;
        if (!deps.canPlay()) { deps.toast('로그인해야 펫을 키울 수 있어요.'); return null; }
        const st = deps.state();
        const r = fn(myBox());
        if (!r.ok) { deps.toast(petErrorText(r.error)); return null; }
        if (free()) r.cost = 0;
        busy = true;
        try {
            st.pet = petBoxToDoc(r.box);
            if (r.cost) deps.applyBong(-r.cost);
            render();
            const saved = await deps.save({
                ...(r.cost > 0 ? { allowBongDecrease: true, maxBongDecrease: r.cost, requireServerBongBalance: true } : {}),
                operationLabel: label,
            });
            if (!saved) { deps.toast('저장하지 못했어요. 잠시 뒤 다시 해 봐요.'); render(); return null; }
            if (after) after(r);
            else render();
            return r;
        } finally {
            busy = false;
        }
    }

    /** 칸 늘리기 */
    async function expand() {
        const rule = petNextSlotRule(myBox(), settings());
        if (!rule) return;
        const ok = await deps.confirm(free() ? '펫 칸을 하나 더 열까요?' : `펫 칸을 하나 더 열까요?\n${deps.bong(rule.price)}이 들어요. 열면 알을 하나 더 키울 수 있어요.`);
        if (!ok) return;
        await runBox('펫 칸 늘리기', (b) => expandPetBox(b, { bong: myBong(), level: myLevel(), settings: settings() }), (r) => {
            slot = r.box.slots - 1;
            show('새 칸이 열렸어요! 알을 사서 키워 봐요.', 'good');
            if (feedback) feedback.play('ok');
        });
    }

    /** 마스터: 칸 늘리기 조건과 산책 보상을 저장해요. */
    async function saveSettings() {
        const el = root();
        if (!el || !deps.isAdmin || !deps.isAdmin() || !deps.saveSettings) return;
        const val = (name) => { const i = el.querySelector(`[data-pet-set="${name}"]`); return i ? i.value : ''; };
        const next = sanitizePetSettings({
            raid: ((deps.settings && deps.settings()) || {}).raid, // 탐험 설정은 그대로 둬요
            slotRules: [{ level: val('s2-level'), price: val('s2-price') }, { level: val('s3-level'), price: val('s3-price') }],
            walk: { min: val('walk-min'), max: val('walk-max'), step: val('walk-step'), cap: val('walk-cap') },
            expPacks: [0, 1, 2].map((i) => ({ price: val(`pack${i}-price`), exp: val(`pack${i}-exp`) })),
        });
        try {
            await deps.saveSettings(next);
            deps.toast('펫 설정을 저장했어요.');
        } catch (e) {
            deps.toast(`저장하지 못했어요: ${e && e.message ? e.message : e}`);
        }
        render();
    }

    /** 알 품기: 부화할 때만 저장해요(그 전에는 이 화면에서만 세요). */
    async function warm() {
        if (busy || !deps.canPlay()) return;
        const st = deps.state();
        const box = myBox();
        const cur = petBoxSlot(box, slot);
        if (!cur) return;
        const r = warmPetEgg(cur, { now: now(), rnd: Math.random });
        if (!r.ok) return;
        if (!r.hatched) {
            st.pet = petBoxToDoc(petBoxWith(box, slot, r.pet));
            try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* 진동 없는 기기 */ }
            render();
            const egg = root() && root().querySelector('.pet-egg-btn');
            if (egg) { egg.classList.remove('is-tap'); void egg.offsetWidth; egg.classList.add('is-tap'); }
            return;
        }
        await run('펫 부화', () => r, {
            after: (res) => {
                const sp = PET_SPECIES[res.pet.species];
                show(`${res.pet.shiny ? '✨ 색이 다른 ' : ''}${sp.names[0]}${sp.rare ? ' (희귀!)' : ''}이(가) 태어났어요!`, 'good');
                if (feedback) feedback.play('ok');
                const stage = root() && root().querySelector('.pet-stage');
                if (stage) stage.classList.add('is-hatch');
            },
        });
    }

    async function feed(foodId) {
        const f = PET_FOODS[foodId];
        if (!f) return;
        await run(`펫 먹이: ${f.name}`, (p, o) => feedPet(p, { ...o, food: foodId }), { after: (r) => { react('feed'); grew(r, `${f.emoji} 냠냠!`); } });
    }

    /** 경험치 팩 사기 */
    async function pack(index) {
        const pk = settings().expPacks[index];
        if (!pk) return;
        if (!free()) {
            const ok = await deps.confirm(`경험치 팩을 살까요?\n${deps.bong(pk.price)}을 내고 경험치 ${pk.exp}을 받아요.`);
            if (!ok) return;
        }
        await run('펫 경험치 팩', (p, o) => buyPetExpPack(p, { ...o, index, packs: settings().expPacks }), { after: (r) => { react('pack'); grew(r, '📦 경험치 팩!'); } });
    }

    async function enhance() {
        const v = petView(myPet(), now(), today(), settings());
        if (v.phase !== 'pet') return;
        const ok = await deps.confirm(`강화 +${v.enhance} → +${v.enhance + 1}\n${deps.bong(v.enhanceCost)}이 들고, 성공 확률은 ${Math.round(v.enhanceChance * 100)}%예요.\n실패해도 펫은 그대로지만 봉은 돌아오지 않아요. 할까요?`);
        if (!ok) return;
        await run('펫 강화', (p, o) => enhancePet(p, o), {
            after: (r) => {
                if (r.success) { react('enhanceOk'); show(`강화 성공! +${r.pet.enhance}`, 'good'); if (feedback) feedback.play('ok'); }
                else { react('enhanceNo'); show('강화 실패… 다음에 다시 해 봐요.', 'bad'); if (feedback) feedback.play('no'); }
            },
        });
    }

    async function evolve() {
        await run('펫 진화', (p, o) => evolvePet(p, o), {
            after: (r) => {
                react('evolve');
                show(`진화했어요! ${PET_SPECIES[r.pet.species].names[r.pet.stage - 1]}`, 'good');
                if (feedback) feedback.play('ok');
                const stage = root() && root().querySelector('.pet-stage');
                if (stage) stage.classList.add('is-evolve');
            },
        });
    }

    async function rename() {
        const name = await deps.prompt(`펫 이름을 지어 줘요. (${PET_NAME_MAX}글자까지)\n친구들에게도 보이니 고운 이름으로 지어요.`);
        if (name == null) return;
        await run('펫 이름 짓기', (p) => renamePet(p, { name }), { after: () => { react('rename'); render(); } });
    }

    async function release() {
        const p = myPet();
        if (p.phase === 'none') return;
        const ok = await deps.confirm(p.phase === 'egg'
            ? '알을 놓아줄까요?\n알 값은 돌아오지 않아요.'
            : `${p.name}을(를) 자연으로 보내 줄까요?\n도감에는 남지만 레벨과 강화는 사라지고, 새 알을 사야 해요.`);
        if (!ok) return;
        await run('펫 놓아주기', (pet) => releasePet(pet), { after: () => show('잘 가! 도감에 기록했어요.', '') });
    }

    /* ---------- 그리기 ---------- */

    const bar = (label, value, max, cls, text) => `
        <div class="pet-bar ${cls}">
            <span class="pet-bar-label">${label}</span>
            <span class="pet-bar-track"><i style="width:${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 100}%"></i></span>
            <span class="pet-bar-num">${text}</span>
        </div>`;

    const waitText = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`; };
    const typeBadge = (typeId) => `<span class="pet-type type-${typeId}">${PET_TYPES[typeId].emoji} ${esc(PET_TYPES[typeId].name)}</span>`;
    const dexNo = (id) => String(Object.keys(PET_SPECIES).indexOf(id) + 1).padStart(3, '0');
    const ground = '<span class="pet-ground" aria-hidden="true"></span>';

    function tabsHtml() {
        return `<div class="pet-tabs" role="tablist">${[['mine', '🐾 내 펫'], ['raid', '⚔️ 탐험'], ['class', '🏆 반 펫'], ['dex', '📖 도감']].map(([k, l]) => (
            `<button type="button" class="pet-tab${tab === k ? ' is-on' : ''}" data-p="tab" data-tab="${k}" role="tab" aria-selected="${tab === k}">${l}</button>`
        )).join('')}<span class="pet-wallet">${free() ? '선생님은 <b>무료</b>' : `내 봉 <b>${esc(deps.bong(myBong()))}</b>`}</span></div>`;
    }

    function fxHtml() {
        return fx ? `<p class="pet-fx ${fx.kind ? `is-${fx.kind}` : ''}" role="status">${esc(fx.text)}</p>` : '';
    }

    /** 칸 고르기 줄: 열린 칸은 펫·알·빈칸, 잠긴 칸은 자물쇠 */
    function slotBarHtml() {
        const box = myBox();
        const mainIdx = petBoxMainIndex(box);
        const rules = settings().slotRules;
        const cells = [];
        for (let i = 0; i < PET_MAX_SLOTS; i += 1) {
            const on = slot === i ? ' is-on' : '';
            if (i < box.slots) {
                const p = box.list[i];
                const art = p.phase === 'pet' ? petArtHtml({ species: p.species, stage: p.stage, shiny: p.shiny, alt: p.name })
                    : p.phase === 'egg' ? petEggHtml({ taps: p.taps, total: PET_HATCH_TAPS, eager: false })
                        : '<span class="pet-slot-plus" aria-hidden="true">＋</span>';
                const label = p.phase === 'pet' ? `${esc(p.name)} <em>Lv.${p.level}</em>` : p.phase === 'egg' ? '알' : '빈 칸';
                cells.push(`<button type="button" class="pet-slot${on}${p.phase === 'pet' ? ` type-${PET_SPECIES[p.species].type}` : ''}" data-p="slot" data-slot="${i}" aria-pressed="${slot === i}">
                    ${mainIdx === i ? '<span class="pet-slot-main" title="대표 펫">⭐</span>' : ''}
                    <span class="pet-slot-art">${art}</span><span class="pet-slot-label">${label}</span>
                </button>`);
            } else {
                const rule = rules[i - 1];
                cells.push(`<button type="button" class="pet-slot is-locked${on}" data-p="slot" data-slot="${i}" aria-pressed="${slot === i}">
                    <span class="pet-slot-art"><span class="pet-slot-lock" aria-hidden="true">🔒</span></span>
                    <span class="pet-slot-label">Lv.${rule.level} · ${esc(deps.bong(rule.price))}</span>
                </button>`);
            }
        }
        return `<div class="pet-slots" role="group" aria-label="펫 칸">${cells.join('')}</div>`;
    }

    /** 아직 안 열린 칸을 골랐을 때 */
    function lockedHtml() {
        const box = myBox();
        const rules = settings().slotRules;
        const rule = rules[slot - 1];
        const isNext = slot === box.slots;
        const lvOk = myLevel() >= rule.level;
        const bongOk = myBong() >= rule.price;
        return `<div class="pet-card pet-locked">
            <div class="pet-stage is-locked"><span class="pet-away-note">🔒</span>${fxHtml()}</div>
            <h3 class="pet-title">${slot + 1}번째 펫 칸</h3>
            <p class="pet-lead">칸을 열면 펫을 한 마리 더 키울 수 있어요.</p>
            <p class="pet-chips">
                <span class="pet-chip${lvOk ? ' is-ok' : ' is-no'}">내 레벨 ${rule.level} 이상 ${lvOk ? '✓' : `(지금 Lv.${myLevel()})`}</span>
                <span class="pet-chip${bongOk ? ' is-ok' : ' is-no'}">${esc(deps.bong(rule.price))} ${bongOk ? '✓' : '모자라요'}</span>
            </p>
            ${isNext
                ? `<button type="button" class="pet-btn is-main" data-p="expand"${lvOk && bongOk ? '' : ' disabled'}>🔓 칸 열기 · ${esc(deps.bong(rule.price))}</button>`
                : '<p class="pet-note">앞 칸을 먼저 열어야 해요.</p>'}
        </div>`;
    }

    /** 마스터 설정(칸 늘리기 조건·산책 보상) */
    function adminHtml() {
        if (!deps.isAdmin || !deps.isAdmin()) return '';
        const cfg = settings();
        const num = (name, value, min, max) => `<input type="number" inputmode="numeric" class="pet-set-input" data-pet-set="${name}" value="${value}" min="${min}" max="${max}">`;
        const w = cfg.walk;
        const baby = { min: Math.min(w.cap, w.min), max: Math.min(w.cap, w.max) };
        const grown = { max: Math.min(w.cap, w.max + Math.floor(PET_MAX_POWER / w.step)), min: 0 };
        grown.min = Math.min(grown.max, w.min + Math.floor(PET_MAX_POWER / (w.step * 2)));
        return `<details class="pet-admin">
            <summary>⚙️ 마스터 설정 (선생님만 보여요)</summary>
            <div class="pet-admin-body">
                <p class="pet-sub">칸 늘리기</p>
                <label class="pet-set-row"><span>2번째 칸</span>내 레벨 ${num('s2-level', cfg.slotRules[0].level, 1, 100)} 이상 · ${num('s2-price', cfg.slotRules[0].price, 0, 5000)} 봉</label>
                <label class="pet-set-row"><span>3번째 칸</span>내 레벨 ${num('s3-level', cfg.slotRules[1].level, 1, 100)} 이상 · ${num('s3-price', cfg.slotRules[1].price, 0, 5000)} 봉</label>
                <p class="pet-sub">산책으로 벌어 오는 봉 (하루 한 번, 범위 안에서 랜덤)</p>
                <label class="pet-set-row"><span>기본 범위</span>${num('walk-min', w.min, 0, 100)} ~ ${num('walk-max', w.max, 0, 100)} 봉</label>
                <label class="pet-set-row"><span>능력치 보너스</span>전투력 ${num('walk-step', w.step, 10, 1000)} 마다 최대 +1봉</label>
                <label class="pet-set-row"><span>하루 상한</span>${num('walk-cap', w.cap, 0, 500)} 봉</label>
                <p class="pet-sub">경험치 팩</p>
                ${cfg.expPacks.map((pk, i) => `<label class="pet-set-row"><span>${i + 1}번 팩</span>${num(`pack${i}-price`, pk.price, 1, 5000)} 봉 → 경험치 ${num(`pack${i}-exp`, pk.exp, 1, 100000)}</label>`).join('')}
                <p class="pet-note">지금 설정: 갓 태어난 펫 ${baby.min}~${baby.max}봉 · 다 키운 펫(전투력 ${PET_MAX_POWER}) ${grown.min}~${grown.max}봉. 최소는 전투력 ${w.step * 2}마다 +1이에요.</p>
                <button type="button" class="pet-btn is-main" data-p="settings-save">설정 저장</button>
            </div>
        </details>`;
    }

    function noneHtml() {
        const lineup = Object.values(PET_SPECIES).map((sp) => (
            `<span class="pet-lineup-item type-${sp.type}${sp.rare ? ' is-rare' : ''}" title="${esc(PET_TYPES[sp.type].name)}">${petArtHtml({ species: sp.id, stage: 1, alt: sp.names[0] })}<i>${PET_TYPES[sp.type].emoji}</i></span>`
        )).join('');
        const can = myBong() >= PET_EGG_PRICE;
        return `<div class="pet-card pet-shop is-egg-card">
            <div class="pet-stage is-egg">${ground}<span class="pet-sprite is-egg">${petEggHtml({ taps: 0 })}</span>${fxHtml()}</div>
            <h3 class="pet-title">신비한 알</h3>
            <p class="pet-lead">알을 품으면 일곱 종 가운데 하나가 태어나요. 아주 드물게 별빛 용이나 색이 다른 펫도 나와요!</p>
            <div class="pet-lineup">${lineup}</div>
            <button type="button" class="pet-btn is-main" data-p="buy"${can ? '' : ' disabled'}>🥚 알 사기 · ${esc(deps.bong(PET_EGG_PRICE))}</button>
            ${can ? '' : `<p class="pet-note">봉이 ${esc(deps.bong(PET_EGG_PRICE - myBong()))} 모자라요. 퀘스트로 모아 봐요.</p>`}
        </div>`;
    }

    function eggHtml(p) {
        return `<div class="pet-card is-egg-card">
            <button type="button" class="pet-stage is-egg pet-egg-btn" data-p="warm" aria-label="알 품기">${ground}<span class="pet-sprite is-egg">${petEggHtml({ taps: p.taps, total: PET_HATCH_TAPS })}</span>${fxHtml()}</button>
            <h3 class="pet-title">알을 품어 줘요</h3>
            <p class="pet-lead">알을 톡톡 쓰다듬어요. ${PET_HATCH_TAPS}번이면 태어나요!</p>
            ${bar('품기', p.taps, PET_HATCH_TAPS, 'is-exp', `${p.taps} / ${PET_HATCH_TAPS}`)}
            <button type="button" class="pet-btn is-main" data-p="warm">🤲 쓰다듬기</button>
        </div>`;
    }

    function petHtml(v) {
        const sp = PET_SPECIES[v.species];
        const type = PET_TYPES[sp.type];
        const head = `<div class="pet-name-row">
                <h3 class="pet-title">${esc(v.name)}${v.shiny ? ' <span class="pet-chip is-shiny">✨ 색다름</span>' : ''}</h3>
                <button type="button" class="pet-mini" data-p="rename" aria-label="이름 바꾸기">✏️</button>
            </div>
            <p class="pet-chips">
                ${typeBadge(sp.type)}
                <span class="pet-chip">No.${dexNo(sp.id)} ${esc(sp.names[v.stage - 1])} · ${v.stage}단계</span>
                <span class="pet-chip is-lv">Lv.${v.level}</span>
                ${v.enhance ? `<span class="pet-chip is-enh">+${v.enhance}</span>` : ''}
                <span class="pet-chip">전투력 ${v.power}</span>
            </p>
            ${petBoxMainIndex(myBox()) === slot
                ? '<p class="pet-main-row"><span class="pet-chip is-main">⭐ 대표 펫</span><i>광장 카드와 반 펫 랭킹에 보여요</i></p>'
                : '<p class="pet-main-row"><button type="button" class="pet-mini-btn" data-p="main">⭐ 대표 펫으로 정하기</button></p>'}`;
        if (v.away) {
            const can = myBong() >= PET_RETURN_PRICE;
            return `<div class="pet-card type-${sp.type}">
                <div class="pet-stage type-${sp.type} is-away">${ground}<span class="pet-away-note">🏠💨</span>${fxHtml()}</div>
                ${head}
                <p class="pet-lead is-warn">오랫동안 밥을 못 먹어서 ${esc(v.name)}이(가) 집을 나갔어요…<br>데려오면 레벨과 강화는 그대로예요.</p>
                <button type="button" class="pet-btn is-main" data-p="back"${can ? '' : ' disabled'}>🔍 찾아서 데려오기 · ${esc(deps.bong(PET_RETURN_PRICE))}</button>
                <button type="button" class="pet-link" data-p="release">놓아주기</button>
            </div>`;
        }
        const nextEvo = v.stage < 3 ? PET_EVOLVE_LEVELS[v.stage - 1] : 0;
        const warn = v.mood === 'starving'
            ? `앞으로 ${Math.max(1, Math.ceil(v.hoursToRunaway))}시간 안에 밥을 안 주면 가출해요!`
            : '';
        const foods = Object.values(PET_FOODS).map((f) => (
            `<button type="button" class="pet-btn is-food" data-p="feed" data-food="${f.id}"${v.fullNow > 90 || myBong() < f.price ? ' disabled' : ''}>
                <b>${f.emoji} ${f.name}</b><i>${esc(deps.bong(f.price))} · 배 +${f.full} · 경험치 +${f.exp}</i>
            </button>`
        )).join('');
        const maxEnh = v.enhance >= PET_MAX_ENHANCE;
        const bubble = v.mood === 'starving' ? '<span class="pet-bubble is-bad" aria-hidden="true">💦</span>'
            : v.mood === 'hungry' ? '<span class="pet-bubble" aria-hidden="true">🍚?</span>'
                : v.mood === 'happy' ? '<span class="pet-bubble is-good" aria-hidden="true">♪</span>' : '';
        const talking = !!(talk && now() - talk.at < 2600);
        return `<div class="pet-card type-${sp.type}">
            <div class="pet-stage type-${sp.type} mood-${v.mood}${v.shiny ? ' is-shiny' : ''}">
                ${ground}
                <button type="button" class="pet-sprite pet-sprite-btn stage-${v.stage}${talking ? ' is-react' : ''}" data-p="pet-tap" aria-label="${esc(v.name)} 쓰다듬기">${petArtHtml({ species: v.species, stage: v.stage, shiny: v.shiny, mood: v.mood, eager: true, alt: sp.names[v.stage - 1] })}</button>
                ${talking ? `<span class="pet-talk" role="status">${esc(talk.text)}</span><span class="pet-hearts" aria-hidden="true"><i>💕</i><i>💗</i><i>✨</i></span>` : bubble}
                ${fxHtml()}
            </div>
            ${head}
            <p class="pet-mood${v.mood === 'hungry' || v.mood === 'starving' ? ' is-warn' : ''}">${MOOD_TEXT[v.mood] || ''} ${esc(warn)}</p>
            ${v.level >= PET_MAX_LEVEL
                ? bar('경험치', 1, 1, 'is-exp', '최고 레벨!')
                : bar('경험치', v.exp, v.expNeed, 'is-exp', `${v.exp} / ${v.expNeed}`)}
            ${bar('배부름', v.fullNow, 100, v.fullNow < 30 ? 'is-full is-low' : 'is-full', `${v.fullNow} / 100`)}
            ${v.canEvolve
                ? '<button type="button" class="pet-btn is-evolve" data-p="evolve">🌟 진화하기!</button>'
                : (nextEvo ? `<p class="pet-note">Lv.${nextEvo}이 되면 진화할 수 있어요.</p>` : '<p class="pet-note">마지막 단계까지 진화했어요!</p>')}
            <p class="pet-sub">먹이 주기 ${v.fullNow > 90 ? '<em>(배가 불러요. 조금 있다가 줘요)</em>' : ''}</p>
            <div class="pet-foods">${foods}</div>
            ${v.level >= PET_MAX_LEVEL ? '' : `<p class="pet-sub">경험치 팩</p>
            <div class="pet-foods">${settings().expPacks.map((pk, i) => `<button type="button" class="pet-btn is-food is-pack" data-p="pack" data-pack="${i}"${myBong() < pk.price ? ' disabled' : ''}>
                <b>📦 경험치 +${pk.exp}</b><i>${esc(deps.bong(pk.price))}</i>
            </button>`).join('')}</div>`}
            <div class="pet-actions">
                <button type="button" class="pet-btn" data-p="play"${v.canPlay ? '' : ' disabled'}><b>🎾 놀아 주기</b><i>${v.playsLeft <= 0 ? `오늘 ${PET_PLAY_PER_DAY}번 다 놀았어요` : v.playWaitMs > 0 ? `${waitText(v.playWaitMs)} 뒤에 또 놀 수 있어요 · 오늘 ${v.playsLeft}번 남음` : `공짜 · 경험치 +${PET_PLAY_EXP} · 4시간에 한 번 · 오늘 ${v.playsLeft}/${PET_PLAY_PER_DAY}번 남음`}</i></button>
                <button type="button" class="pet-btn" data-p="walk"${v.walked || v.fullNow < 30 ? ' disabled' : ''}><b>🐾 산책 보내기</b><i>${v.walked ? '오늘은 다녀왔어요' : v.fullNow < 30 ? '배고파서 못 가요' : `하루 한 번 · ${v.walkRange.min === v.walkRange.max ? esc(deps.bong(v.walkRange.max)) : `${v.walkRange.min}~${esc(deps.bong(v.walkRange.max))}`} 벌어 와요`}</i></button>
                <button type="button" class="pet-btn" data-p="enhance"${maxEnh || myBong() < v.enhanceCost ? ' disabled' : ''}><b>🔨 강화 ${maxEnh ? '끝!' : `+${v.enhance} → +${v.enhance + 1}`}</b><i>${maxEnh ? '끝까지 강화했어요' : `${esc(deps.bong(v.enhanceCost))} · 성공 ${Math.round(v.enhanceChance * 100)}%`}</i></button>
            </div>
            <p class="pet-note">지금까지 벌어 온 봉 ${esc(deps.bong(v.earned))} · 배가 텅 빈 채 3일이 지나면 가출해요.</p>
            <button type="button" class="pet-link" data-p="release">놓아주기</button>
        </div>`;
    }

    function mineHtml() {
        if (!deps.canPlay()) return '<div class="pet-card"><p class="pet-lead">로그인하면 펫을 키울 수 있어요. 「반 펫」에서 친구들 펫을 구경해요.</p></div>';
        if (slot >= myBox().slots) return `${slotBarHtml()}${lockedHtml()}${adminHtml()}`;
        const p = myPet();
        const card = p.phase === 'egg' ? eggHtml(p) : p.phase === 'pet' ? petHtml(petView(p, now(), today(), settings())) : noneHtml();
        return `${slotBarHtml()}${card}${adminHtml()}`;
    }

    function classHtml() {
        const rows = rankClassPets(deps.students(), now(), today());
        const me = String(deps.selfId() || '');
        if (!rows.length) return '<div class="pet-card"><p class="pet-lead">아직 펫을 키우는 친구가 없어요. 첫 번째가 되어 봐요!</p></div>';
        const medal = ['🥇', '🥈', '🥉'];
        return `<div class="pet-rank">${rows.map((r) => {
            const sp = PET_SPECIES[r.view.species];
            return `<div class="pet-rank-row type-${sp.type}${r.id === me ? ' is-me' : ''}${r.view.away ? ' is-away' : ''}">
                <span class="pet-rank-no">${medal[r.rank - 1] || r.rank}</span>
                <span class="pet-rank-art">${r.view.away ? '<span class="pet-away-mini">🏠💨</span>' : petArtHtml({ species: r.view.species, stage: r.view.stage, shiny: r.view.shiny, mood: r.view.mood })}</span>
                <span class="pet-rank-text">
                    <b>${esc(r.view.name)}${r.view.shiny ? ' ✨' : ''}${r.view.enhance ? ` <em>+${r.view.enhance}</em>` : ''}</b>
                    ${typeBadge(sp.type)}
                    <i>${esc(r.owner)} · ${esc(sp.names[r.view.stage - 1])} · Lv.${r.view.level}${r.view.away ? ' · 가출 중' : ''}</i>
                </span>
                <span class="pet-rank-power"><small>전투력</small>${r.view.power}</span>
            </div>`;
        }).join('')}</div><p class="pet-note">전투력 = 단계·레벨·강화를 합친 점수예요. 가장 높으면 ${PET_MAX_POWER}이에요.</p>`;
    }

    function dexHtml() {
        const dex = myBox().dex || {};
        const found = Object.keys(dex).length;
        const total = Object.keys(PET_SPECIES).length;
        return `<div class="pet-dex-head"><b>📖 메이트 도감</b><span>만난 펫 <em>${found}</em> / ${total}종</span><i style="--p:${Math.round((found / total) * 100)}%"></i></div>
        <p class="pet-note">진화시킨 단계까지 기록돼요. 아직 못 만난 모습은 그림자로 보여요.</p>
        <div class="pet-dex">${Object.values(PET_SPECIES).map((sp) => {
            const d = dex[sp.id];
            const cells = [1, 2, 3].map((stage) => (d && d.stage >= stage
                ? `<span class="pet-dex-cell">${petArtHtml({ species: sp.id, stage, shiny: d.shiny, alt: sp.names[stage - 1] })}<i>${esc(sp.names[stage - 1])}</i></span>`
                : `<span class="pet-dex-cell is-unknown">${petArtHtml({ species: sp.id, stage, silhouette: true })}<i>???</i></span>`)).join('<span class="pet-dex-arrow" aria-hidden="true">▸</span>');
            return `<div class="pet-dex-row type-${sp.type}${d ? ' is-found' : ''}">
                <span class="pet-dex-type"><b>No.${dexNo(sp.id)}</b>${typeBadge(sp.type)}${sp.rare ? '<em>희귀</em>' : ''}${d && d.shiny ? '<em>✨ 색다름</em>' : ''}</span>
                <span class="pet-dex-line">${cells}</span>
            </div>`;
        }).join('')}</div>`;
    }

    function render() {
        bind();
        const el = root();
        if (!el) return;
        if (raid.isPlaying()) return; // 전투 연출 중에는 화면을 갈아엎지 않아요
        let body = el.querySelector('[data-ox-body]');
        if (!body) {
            el.innerHTML = '<div class="pet-body" data-ox-body></div>';
            body = el.querySelector('[data-ox-body]');
        }
        body.className = `pet-body is-tab-${tab}`;
        body.innerHTML = `${tabsHtml()}${tab === 'class' ? classHtml() : tab === 'dex' ? dexHtml() : tab === 'raid' ? raid.html() : mineHtml()}`;
    }

    /** 펫 화면을 열 때 불러요. 보는 동안 1분마다 배고픔을 다시 계산해요. */
    function open() {
        render();
        if (tab === 'raid') { raid.start(); void raid.maybePlay(); }
        if (!timer) {
            timer = setInterval(() => {
                const el = root();
                if (!el || el.classList.contains('hidden') || !el.offsetParent) return;
                // 마스터가 설정 칸에 적는 중이면 다시 그리지 않아요.
                if (!busy && !fx && !(el.querySelector('.pet-admin[open]'))) render();
                if (tab === 'raid') void raid.maybePlay();
            }, 60000);
        }
    }

    /** 위쪽 알림에서 '참가'를 누르면: 탐험 탭을 열고 그 방에 들어가요. */
    function joinRaid(partyId) {
        tab = 'raid';
        raid.start();
        render();
        void raid.join(String(partyId));
    }

    return { joinRaid, open, render, showsClass: () => tab === 'class' && !busy, isOpen, close: () => raid.stop() };
}
