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
    PET_MAX_STONES,
    PET_MAX_BOOST,
    PET_STONE_POWER,
    PET_NAME_MAX,
    PET_PLAY_EXP,
    PET_PLAY_PER_DAY,
    PET_SKILL_LEVELS,
    PET_RETURN_PRICE,
    PET_SPECIES,
    PET_TYPES,
    addStoredEggs,
    receivePetGifts,
    buyShopPet,
    buyEnhanceStones,
    useEnhanceStone,
    petBoxOwnedSpecies,
    petShopPrice,
    bringPetBack,
    cagePet,
    cagePetView,
    enhancePetWithMat,
    petCageCapacity,
    setPetAwakeHours,
    settleHatchedPet,
    storePetEgg,
    uncagePet,
    useStoredEgg,
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
    petGuardSkill,
    petGuardText,
    petHealSkill,
    petHealText,
    petRoleSkills,
    petRoleSkillText,
    PET_ROLES,
    petSkills,
    petView,
    playWithPet,
    rankClassPets,
    releaseBoxPet,
    releasedPetOf,
    restoreReleasedPet,
    renamePet,
    sanitizePetBox,
    sanitizePetSettings,
    setPetBoxMain,
    walkPet,
    warmPetEgg,
    rollGiftFireEggs,
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
/** 그림 파일 대신 도형 그림: 앱에서 한 번만 달아요. */
let artFallbackBound = false;
function bindArtFallback() {
    if (artFallbackBound || typeof document === 'undefined') return;
    artFallbackBound = true;
    // 그림 파일을 못 불러오면 같은 자리에 도형 그림을 넣어요(error 는 거품이 안 올라와서 capture 로 받아요).
    // 탐험 전투 화면·광장 카드처럼 펫 화면 밖의 그림도 받도록 문서 전체에서 들어요(그림 파일이 아직 없는 새 펫 3종).
    document.addEventListener('error', (e) => {
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
}

export function createPetMode(deps) {
    bindArtFallback();
    const root = () => document.getElementById('challengePane-pet');
    let tab = 'mine';
    let busy = false;
    let bound = false;
    let feedback = null;
    let fx = null; // { text, kind, at } 잠깐 띄우는 글자
    let timer = 0;
    let talk = null; // { text, at, kind } 펫이 방금 한 말
    let shopOpen = null; // 펫 상점을 펼쳤는지(null 이면 빈 칸일 때만 펼쳐요)
    let slot = 0; // 보고 있는 칸(0~2). 아직 안 열린 칸이면 '칸 늘리기' 화면이에요.

    const now = () => Date.now();
    const today = () => deps.today();
    const myBox = () => sanitizePetBox(deps.state() && deps.state().pet);
    /** 보고 있는 칸의 펫(안 열린 칸이면 빈 펫) */
    const myPet = () => petBoxSlot(myBox(), slot) || { v: 1, phase: 'none', dex: myBox().dex };
    /** 선생님(마스터)은 봉·레벨 조건 없이 키워요. 봉을 쓰지도 벌지도 않아요. */
    const free = () => !!(deps.isAdmin && deps.isAdmin());
    // 저장하는 동안에는 시작할 때의 봉으로 계산해요(화면에서 먼저 뺀 봉으로 다시 계산하면 '봉이 모자라요'가 나와요).
    let bongAt = null;
    const myBong = () => (free() ? 1e9 : bongAt != null ? bongAt : Number(deps.state() && deps.state().bong) || 0);
    /** 마스터 설정. 배고파지는 시간대(낮)도 여기서 규칙에 알려 줘요. */
    const settings = () => { const cfg = sanitizePetSettings(deps.settings ? deps.settings() : null); setPetAwakeHours(cfg.awake.start, cfg.awake.end); return cfg; };
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
        flush: () => flush(),
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
        el.addEventListener('click', (e) => {
            const t = e.target.closest('[data-p]');
            if (!t || !el.contains(t) || t.disabled) return;
            const act = t.getAttribute('data-p');
            if (raid.handle(act, t)) return;
            if (act === 'tab') { void flush(); tab = t.getAttribute('data-tab') || 'mine'; if (tab === 'raid') raid.start(); else raid.stop(); render(); if (tab === 'raid') void raid.maybePlay(); }
            else if (act === 'slot') { talk = null; slot = Math.max(0, Math.min(PET_MAX_SLOTS - 1, Number(t.getAttribute('data-slot')) || 0)); fx = null; render(); }
            else if (act === 'expand') void expand();
            else if (act === 'main') { const at = slot; void runBox('대표 펫 정하기', (b) => setPetBoxMain(b, at), () => { react('main'); show('대표 펫으로 정했어요! 광장 카드와 반 펫 랭킹에 보여요.', 'good'); }, { batch: true }); }
            else if (act === 'settings-save') void saveSettings();
            else if (act === 'buy') void run('펫 알 사기', (p, o) => buyPetEgg(p, o));
            else if (act === 'warm') void warm();
            else if (act === 'feed') void feed(t.getAttribute('data-food'));
            else if (act === 'play') void run('펫과 놀기', (p, o) => playWithPet(p, o), { batch: true, after: (r) => { react('play'); grew(r, '신나게 놀았어요!'); } });
            else if (act === 'walk') void run('펫 산책 보상', (p, o) => walkPet(p, o), { after: (r) => { react('walk'); show(free() ? '산책을 다녀왔어요! (선생님은 봉을 받지 않아요)' : `산책에서 ${deps.bong(r.gain)}을 벌어 왔어요!`, r.gain > 0 ? 'good' : ''); if (feedback && r.gain > 0) feedback.play('ok'); } });
            else if (act === 'pack') void pack(Number(t.getAttribute('data-pack')) || 0);
            else if (act === 'enhance') void enhance();
            else if (act === 'evolve') void evolve();
            else if (act === 'back') void run('펫 데려오기', (p, o) => bringPetBack(p, o), { after: () => { react('back'); show('집으로 돌아왔어요! 이제 잘 챙겨 줘요.', 'good'); } });
            else if (act === 'rename') void rename();
            else if (act === 'pet-tap') { const v = petView(myPet(), now(), today(), settings()); react(v.mood === 'hungry' || v.mood === 'starving' ? 'hungry' : 'tap'); try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) { /* 진동 없는 기기 */ } render(); }
            else if (act === 'release') void release();
            else if (act === 'unrelease') void unrelease();
            else if (act === 'cage') void cage();
            else if (act === 'uncage') void uncage(Number(t.getAttribute('data-cage')) || 0);
            else if (act === 'egg-store') { delete eggTaps[slot]; void runBox('알 보관하기', (b) => storePetEgg(b, slot), (r) => show(r.fire ? '🔥 불알을 보관함에 넣었어요. 빈 칸에서 다시 꺼낼 수 있어요.' : '알을 보관함에 넣었어요. 빈 칸에서 다시 꺼낼 수 있어요.', '')); }
            else if (act === 'egg-use') void runBox('보관한 알 꺼내기', (b) => useStoredEgg(b, slot, { now: now() }), () => show('알을 꺼냈어요! 쓰다듬어서 품어 줘요.', 'good'));
            else if (act === 'egg-use-fire') void runBox('불알 꺼내기', (b) => useStoredEgg(b, slot, { now: now(), fire: true }), () => show('🔥 불알을 꺼냈어요! 깨면 반드시 색다른 펫이 나와요.', 'good'));
            else if (act === 'enhance-mat') void enhanceMat();
            else if (act === 'gift') void gift();
            else if (act === 'shop-buy') void shopBuy(t.getAttribute('data-sp'), t.getAttribute('data-shiny') === '1');
            else if (act === 'shop-stone') void shopStone(Number(t.getAttribute('data-n')) || 1);
            else if (act === 'use-stone') void useStone();
        });
        el.addEventListener('change', (e) => raid.onChange(e));
        // 펫 상점을 펼치거나 접은 상태는 다시 그려도 그대로 둬요(toggle 은 거품이 안 올라와서 capture 로 받아요).
        el.addEventListener('toggle', (e) => { if (e.target && e.target.classList && e.target.classList.contains('pet-shop-box')) shopOpen = e.target.open; }, true);
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
            // 레벨이 올라 새 기술을 배웠으면 알려 줘요.
            const before = r.pet.level - r.levelUps;
            const gotLv = PET_SKILL_LEVELS.filter((lv) => before < lv && r.pet.level >= lv).pop();
            const got = gotLv ? petSkills(r.pet.species, r.pet.level).find((k) => k.level === gotLv) : null;
            show(got ? `레벨 업! Lv.${r.pet.level} · 새 기술 「${got.name}」을(를) 배웠어요!` : `레벨 업! Lv.${r.pet.level}`, 'good');
            if (feedback) feedback.play('ok');
        } else {
            show(`${text} +${r.exp} 경험치`, '');
        }
    }

    /** 같은 결과를 다시 만들 수 있게 미리 굴려 둔 주사위(서버 값에 다시 적용할 때 같은 운이 나와요) */
    const makeDice = () => { const rolls = Array.from({ length: 12 }, () => Math.random()); return () => { let i = 0; return () => rolls[i++ % rolls.length]; }; };

    /*
     * 펫 저장 모으기: 먹이·놀이·경험치 팩·강화·이름·대표 펫처럼 자주 하는 일은 바로 저장하지 않고
     * 화면에만 먼저 보여 준 뒤, 15초 동안 모아서 한 번에 저장해요(8번이 쌓이면 바로).
     * 저장할 때는 서버의 최신 펫 상자에 모아 둔 일을 순서대로 다시 적용해요. 봉도 같은 저장에서 함께 빠져요.
     * 화면을 떠나거나 다른 앱으로 가면 바로 저장해요. 실패하면 모아 둔 일을 모두 되돌려요.
     */
    const BATCH_MS = 15000;
    const BATCH_MAX = 8;
    let queue = [];
    let queueBefore = null; // 모으기 시작하기 전 펫 상자(되돌리기용)
    let queueState = null; // 모으기 시작한 playerState
    let queueTimer = 0;
    let flushing = null;

    /** 저장 옵션: 모아 둔 일(items)을 서버 상자에 다시 적용해요. */
    function saveOptsFor(items, label) {
        const cost = items.reduce((t, x) => t + x.cost, 0);
        const gain = items.reduce((t, x) => t + x.gain, 0);
        return {
            ...(cost > 0 ? { allowBongDecrease: true, maxBongDecrease: cost, requireServerBongBalance: true } : {}),
            ...(gain > 0 ? { maxBongIncrease: gain } : {}),
            // 봉은 화면 값이 아니라 서버 봉에 이만큼 더하고 빼요. 모으는 사이 반 친구 저장으로 화면 봉이 서버 값으로 바뀌어도 값을 제대로 내요.
            petBongDelta: gain - cost,
            operationLabel: label,
            quietFail: true,
            petAllowLoss: items.some((x) => x.allowLoss),
            petMutator: (serverPet) => {
                let box = sanitizePetBox(serverPet);
                for (const it of items) {
                    bongAt = it.bong;
                    const rr = it.mutate(box);
                    if (!rr || !rr.ok) { bongAt = null; return { ok: false, error: (rr && rr.error) || 'changed' }; }
                    // 봉이 걸린 일은 서버 값으로 해도 값이 같아야 해요.
                    if ((rr.cost || 0) !== it.rawCost || (rr.gain || 0) !== it.rawGain) { bongAt = null; return { ok: false, error: 'changed' }; }
                    box = rr.box;
                }
                bongAt = null;
                return { ok: true, pet: petBoxToDoc(box) };
            },
        };
    }

    /** 저장이 실패했을 때 화면을 되돌리고 알려 줘요. */
    function failSave(st, before, items, why) {
        if (deps.state() === st) {
            st.pet = before;
            const net = items.reduce((t, x) => t + x.gain - x.cost, 0);
            if (net) deps.applyBong(-net);
        }
        const code = /resource-exhausted|quota/i.test(why) ? 'quota' : why.startsWith('net:') ? '' : why;
        deps.toast(code ? petErrorText(code) : `저장하지 못했어요. 인터넷 연결을 확인하고 다시 해 봐요.${why ? ` (${why.replace(/^net:/, '').slice(0, 40)})` : ''}`);
        render();
    }

    /** 저장 한 번(연결이 잠깐 끊기면 한 번 더) */
    async function saveItems(items, label) {
        const opts = saveOptsFor(items, label);
        let saved = await deps.save(opts);
        let why = deps.lastSaveError ? deps.lastSaveError() : '';
        if (!saved && why.startsWith('net:') && !/resource-exhausted|quota/i.test(why)) {
            await new Promise((ok) => setTimeout(ok, 700));
            saved = await deps.save(opts);
            why = deps.lastSaveError ? deps.lastSaveError() : '';
        }
        return { saved: !!saved, why };
    }

    /** 모아 둔 펫 저장을 지금 해요. 저장할 게 없으면 바로 끝나요. */
    function flush() {
        if (flushing) return flushing;
        if (queueTimer) { clearTimeout(queueTimer); queueTimer = 0; }
        if (!queue.length) return Promise.resolve(true);
        const items = queue;
        const before = queueBefore;
        const st = queueState;
        queue = [];
        queueBefore = null;
        queueState = null;
        const label = items.length === 1 ? items[0].label : `${items[0].label} 외 ${items.length - 1}건`;
        flushing = (async () => {
            busy = true;
            try {
                const { saved, why } = await saveItems(items, label);
                if (!saved) { failSave(st, before, items, why); return false; }
                return true;
            } finally {
                busy = false;
                flushing = null;
            }
        })();
        return flushing;
    }

    // 화면을 떠나거나 다른 앱으로 가면 모아 둔 저장을 바로 해요.
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
        window.addEventListener('pagehide', () => { void flush(); });
    }
    // 새 버전 새로고침(appUpdateWatch)이 이 저장이 끝나기 전에 화면을 지우지 않게 알려 줘요.
    if (typeof window !== 'undefined') {
        window.petSavesPending = () => queue.length > 0 || !!flushing;
        window.flushPetSaves = () => flush();
    }

    /**
     * 펫 상자를 바꾸고 저장해요. mutate(box) → { ok, error, box, cost, gain, ... }
     * batch: true 이면 모았다가 저장해요(결과는 화면에 바로 보여 줘요). 아니면 모아 둔 것과 함께 바로 저장해요.
     */
    async function commit(label, mutate, { after = null, allowLoss = false, batch = false } = {}) {
        if (busy) return null;
        if (!deps.canPlay()) { deps.toast('로그인해야 펫을 키울 수 있어요.'); return null; }
        const st = deps.state();
        // 모으는 중에 화면 상태가 통째로 바뀌었으면(서버에서 새로 받음) 모아 둔 것부터 저장해요.
        if (queue.length && queueState !== st) { await flush(); if (busy) return null; }
        const before = petBoxToDoc(myBox());
        bongAt = null;
        const bongNow = myBong();
        bongAt = bongNow;
        const r = mutate(myBox());
        bongAt = null;
        if (!r || !r.ok) { deps.toast(petErrorText(r && r.error)); return null; }
        const rawCost = r.cost || 0;
        const rawGain = r.gain || 0;
        const item = { label, mutate, rawCost, rawGain, cost: free() ? 0 : rawCost, gain: free() ? 0 : rawGain, bong: bongNow, allowLoss };
        st.pet = petBoxToDoc(r.box);
        if (item.cost || item.gain) deps.applyBong(item.gain - item.cost);
        if (!queue.length) { queueBefore = before; queueState = st; }
        queue.push(item);
        if (batch && queue.length < BATCH_MAX) {
            // 화면에는 바로 보여 주고, 저장은 잠시 뒤에 모아서 해요.
            if (!queueTimer) queueTimer = setTimeout(() => { queueTimer = 0; void flush(); }, BATCH_MS);
            if (after) after(r);
            else render();
            return r;
        }
        render();
        const ok = await flush();
        if (!ok) return null;
        if (after) after(r);
        else render();
        return r;
    }

    /** 보고 있는 칸의 펫에게 규칙 함수를 적용하고 저장해요. */
    function run(label, fn, { after = null, allowLoss = false, batch = false } = {}) {
        const at = slot;
        const t = now();
        const day = today();
        const dice = makeDice();
        const walk = settings().walk;
        return commit(label, (b) => {
            const cur = petBoxSlot(b, at);
            if (!cur) return { ok: false, error: 'bad_slot' };
            const r = fn(cur, { bong: myBong(), now: t, today: day, rnd: dice(), walk });
            if (!r.ok) return r;
            return { ...r, box: petBoxWith(b, at, r.pet) };
        }, { after, allowLoss, batch });
    }

    /** 상자(칸·대표 펫·케이지) 쪽 일을 적용하고 저장해요. fn(box) → { ok, error, box, cost } */
    function runBox(label, fn, after = null, { batch = false } = {}) {
        return commit(label, fn, { after, batch });
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
            shop: { normal: val('shop-normal'), shiny: val('shop-shiny'), rare: val('shop-rare'), rareShiny: val('shop-rareShiny'), stone: val('shop-stone') },
            cageSize: val('cage-size'),
            awake: { start: val('awake-start'), end: val('awake-end') },
        });
        try {
            await deps.saveSettings(next);
            deps.toast('펫 설정을 저장했어요.');
        } catch (e) {
            deps.toast(`저장하지 못했어요: ${e && e.message ? e.message : e}`);
        }
        render();
    }

    /** 알 품기: 부화할 때만 저장해요(그 전에는 이 화면에서만 세요). 품은 횟수는 화면을 다시 그려도 기억해요. */
    const eggTaps = {};
    const tapsOf = (i, p) => Math.max(p && p.phase === 'egg' ? p.taps : 0, eggTaps[i] || 0);
    async function warm() {
        if (busy || !deps.canPlay()) return;
        const at = slot;
        const cur = petBoxSlot(myBox(), at);
        if (!cur || cur.phase !== 'egg') return;
        const r = warmPetEgg({ ...cur, taps: tapsOf(at, cur) }, { now: now(), rnd: Math.random });
        if (!r.ok) return;
        if (!r.hatched) {
            eggTaps[at] = r.pet.taps;
            try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* 진동 없는 기기 */ }
            render();
            const egg = root() && root().querySelector('.pet-egg-btn');
            if (egg) { egg.classList.remove('is-tap'); void egg.offsetWidth; egg.classList.add('is-tap'); }
            return;
        }
        delete eggTaps[at];
        // 이미 가진 종이 나오면 펫 대신 강화 재료가 돼요.
        await runBox('펫 부화', (b) => (b.list[at] && b.list[at].phase === 'egg' ? settleHatchedPet(b, at, r.pet) : { ok: false, error: 'no_egg' }), (res) => {
            const sp = PET_SPECIES[r.pet.species];
            if (res.duplicate) {
                show(`${sp.names[0]}은(는) 이미 있어요! 💎 ${sp.names[0]} 강화 재료 1개로 바뀌었어요.${res.shinyShared ? ' ✨ 색다른 빛은 가진 펫에게 옮겨 갔어요!' : ''}`, 'good');
            } else {
                show(`${r.pet.shiny ? '✨ 색이 다른 ' : ''}${sp.names[0]}${sp.rare ? ' (희귀!)' : ''}이(가) 태어났어요!`, 'good');
                const stage = root() && root().querySelector('.pet-stage');
                if (stage) stage.classList.add('is-hatch');
            }
            if (feedback) feedback.play('ok');
        });
    }

    /** 펫 상점에서 사기 */
    async function shopBuy(species, shiny) {
        const sp = PET_SPECIES[species];
        if (!sp) return;
        const price = petShopPrice(species, shiny, settings());
        const owned = petBoxOwnedSpecies(myBox()).has(species);
        const name = `${shiny ? '✨ 색다른 ' : ''}${sp.names[0]}`;
        const ok = await deps.confirm(owned
            ? `가지고 있는 ${sp.names[0]}을(를) 색다른 모습으로 바꿀까요?${free() ? '' : `\n${deps.bong(price)}이 들어요.`} 레벨과 강화는 그대로예요.`
            : `${name}을(를) ${slot + 1}번 칸에 데려올까요?${free() ? '' : `\n${deps.bong(price)}이 들어요.`}`);
        if (!ok) return;
        await runBox(owned ? '펫 상점: 색다른 모습' : '펫 상점에서 사기', (b) => buyShopPet(b, slot, { species, shiny, bong: myBong(), now: now(), settings: settings() }), (r) => {
            react('main');
            show(r.upgraded ? `✨ ${sp.names[0]}이(가) 색다른 모습이 되었어요!` : `${name}이(가) 왔어요! 잘 키워 줘요.`, 'good');
            if (feedback) feedback.play('ok');
        });
    }

    /** 강화석 사기 */
    async function shopStone(n) {
        const price = settings().shop.stone * n;
        const ok = await deps.confirm(`💠 강화석 ${n}개를 살까요?${free() ? '' : `\n${deps.bong(price)}이 들어요.`}\n펫에게 쓰면 전투력이 영구로 +${PET_STONE_POWER} 올라요.`);
        if (!ok) return;
        await runBox('펫 상점: 강화석', (b) => buyEnhanceStones(b, { count: n, bong: myBong(), settings: settings() }), (r) => {
            show(`💠 강화석 ${r.count}개를 샀어요!`, 'good');
            if (feedback) feedback.play('ok');
        });
    }

    /** 강화석 쓰기(보고 있는 칸의 펫) */
    async function useStone() {
        const p = myPet();
        if (p.phase !== 'pet') return;
        const ok = await deps.confirm(`💠 강화석 1개를 써서 ${p.name}의 전투력을 +${PET_STONE_POWER} 올릴까요?\n(강화석 ${myBox().stones}개 있어요 · 이 펫에 지금 +${p.boost} / +${PET_MAX_BOOST})`);
        if (!ok) return;
        await runBox('펫 강화석 쓰기', (b) => useEnhanceStone(b, slot, { now: now(), today: today() }), (r) => { react('enhanceOk'); show(`전투력 +${r.added}! (강화석 +${r.pet.boost})`, 'good'); if (feedback) feedback.play('ok'); });
    }

    /** 보고 있는 칸의 펫을 케이지에 넣어요. */
    async function cage() {
        const p = myPet();
        if (p.phase !== 'pet') return;
        const ok = await deps.confirm(`${p.name}을(를) 케이지에서 쉬게 할까요?\n쉬는 동안에는 배고프지 않아요. 대신 꺼내기 전까지 산책·놀이·탐험은 못 해요.`);
        if (!ok) return;
        await runBox('펫 케이지에 넣기', (b) => cagePet(b, slot, { now: now(), today: today(), settings: settings() }), () => show(`${p.name} 케이지에서 쉬어요. 💤`, ''));
    }

    /** 케이지의 펫을 보고 있는 칸으로 꺼내요(칸에 펫이 있으면 자리를 바꿔요). */
    async function uncage(cageIdx) {
        const box = myBox();
        const out = box.cage[cageIdx];
        if (!out) return;
        if (slot >= box.slots) { deps.toast('먼저 위에서 열려 있는 펫 칸을 골라 줘요.'); return; }
        const cur = box.list[slot];
        if (cur.phase === 'egg') { deps.toast(petErrorText('slot_busy')); return; }
        const ok = await deps.confirm(cur.phase === 'pet'
            ? `${out.name}을(를) 꺼내고, 지금 칸의 ${cur.name}을(를) 대신 케이지에 넣을까요?`
            : `${out.name}을(를) ${slot + 1}번 칸으로 꺼낼까요?\n꺼내면 다시 배가 고파지기 시작해요.`);
        if (!ok) return;
        await runBox('펫 케이지에서 꺼내기', (b) => uncagePet(b, cageIdx, slot, { now: now(), today: today() }), () => { react('back'); show(`${out.name} 나왔어요!`, 'good'); });
    }

    /** 강화 재료로 강화(봉 없이 반드시 성공) */
    async function enhanceMat() {
        const p = myPet();
        if (p.phase !== 'pet') return;
        const have = myBox().mats[p.species] || 0;
        const ok = await deps.confirm(`💎 ${PET_SPECIES[p.species].names[0]} 강화 재료 1개를 써서 +${p.enhance} → +${p.enhance + 1}로 강화할까요?\n봉이 들지 않고 반드시 성공해요. (재료 ${have}개 있음)`);
        if (!ok) return;
        await runBox('펫 재료 강화', (b) => enhancePetWithMat(b, slot, { now: now(), today: today() }), (r) => { react('enhanceOk'); show(`강화 성공! +${r.pet.enhance}`, 'good'); if (feedback) feedback.play('ok'); });
    }

    /* ---------- 선생님의 알 선물 ---------- */

    let giftUnsub = null;
    let giftTotal = 0; // 선물함에 쌓인 합계(늘기만 해요)
    let giftFireTotal = 0; // 선물함에 쌓인 불알 합계(늘기만 해요)
    let giftTryAt = 0;
    /** 아직 안 받은 선물이 있으면 알 보관함에 넣어요. 실패해도 선물함은 그대로라 다음에 다시 받아요(1분에 한 번만 시도). */
    async function takeGifts() {
        if (busy || !deps.canPlay()) return;
        if (giftTotal <= myBox().giftSeen && giftFireTotal <= myBox().fireGiftSeen) return;
        if (now() - giftTryAt < 60000) return;
        giftTryAt = now();
        const total = giftTotal;
        const fireTotal = giftFireTotal;
        await runBox('알 선물 받기', (b) => receivePetGifts(b, total, fireTotal), (res) => {
            const all = res.gifted + res.fireGifted;
            const got = res.added + res.fireAdded;
            show(`🎁 선생님이 알 ${all}개를 선물했어요!${res.fireGifted ? ` 그중 🔥 불알이 ${res.fireGifted}개! (깨면 반드시 색다른 펫)` : ''} 알 보관함에 넣었어요.${got < all ? ` (보관함이 꽉 차서 ${got}개만 들어갔어요)` : ''}`, 'good');
            if (feedback) feedback.play('ok');
        });
    }

    /** 마스터: 알 선물하기 */
    async function gift() {
        const el = root();
        if (!el || !deps.isAdmin || !deps.isAdmin() || !deps.giftEggs) return;
        const who = (el.querySelector('[data-pet-gift="who"]') || {}).value || 'all';
        const count = Math.max(1, Math.min(10, Math.floor(Number((el.querySelector('[data-pet-gift="count"]') || {}).value) || 1)));
        const fireOnly = (el.querySelector('[data-pet-gift="kind"]') || {}).value === 'fire';
        const targets = giftTargets();
        const ids = who === 'all' ? targets.map((x) => x.id) : targets.filter((x) => x.id === who).map((x) => x.id);
        if (!ids.length) { deps.toast('선물할 학생이 없어요.'); return; }
        const name = who === 'all' ? `우리 반 모두(${ids.length}명)` : (targets.find((x) => x.id === who) || {}).name;
        const ok = await deps.confirm(fireOnly
            ? `${name}에게 🔥 불알 ${count}개씩 선물할까요?\n불알을 깨면 반드시 색다른 펫이 나와요.`
            : `${name}에게 알 ${count}개씩 선물할까요?\n알마다 10% 확률로 🔥 불알이 돼요. 받은 알은 알 보관함에 들어가요.`);
        if (!ok) return;
        // 불알은 선물하는 이 화면에서 굴려 선물함에 따로 적어요(학생 화면은 받기만 해요).
        const fire = {};
        ids.forEach((id) => { fire[id] = fireOnly ? count : rollGiftFireEggs(count); });
        const lucky = Object.values(fire).reduce((s, n) => s + n, 0);
        try {
            await deps.giftEggs(ids, count, fire);
            deps.toast(fireOnly ? `🔥 ${name}에게 불알 ${count}개씩 선물했어요.` : `🎁 ${name}에게 알 ${count}개씩 선물했어요.${lucky ? ` (그중 🔥 불알 ${lucky}개)` : ''}`);
        } catch (e) {
            deps.toast(`선물하지 못했어요: ${e && e.message ? e.message : e}`);
        }
    }
    const giftTargets = () => (deps.students ? deps.students() : []).filter((x) => !/^gm/.test(String(x.id))).map((x) => ({ id: String(x.id), name: String(x.name || x.id) }));

    async function feed(foodId) {
        const f = PET_FOODS[foodId];
        if (!f) return;
        await run(`펫 먹이: ${f.name}`, (p, o) => feedPet(p, { ...o, food: foodId }), { batch: true, after: (r) => { react('feed'); grew(r, `${f.emoji} 냠냠!`); } });
    }

    /** 경험치 팩 사기 */
    async function pack(index) {
        const pk = settings().expPacks[index];
        if (!pk) return;
        if (!free()) {
            const ok = await deps.confirm(`경험치 팩을 살까요?\n${deps.bong(pk.price)}을 내고 경험치 ${pk.exp}을 받아요.`);
            if (!ok) return;
        }
        await run('펫 경험치 팩', (p, o) => buyPetExpPack(p, { ...o, index, packs: settings().expPacks }), { batch: true, after: (r) => { react('pack'); grew(r, '📦 경험치 팩!'); } });
    }

    async function enhance() {
        const v = petView(myPet(), now(), today(), settings());
        if (v.phase !== 'pet') return;
        const ok = await deps.confirm(`강화 +${v.enhance} → +${v.enhance + 1}\n${deps.bong(v.enhanceCost)}이 들고, 성공 확률은 ${Math.round(v.enhanceChance * 100)}%예요.\n실패해도 펫은 그대로지만 봉은 돌아오지 않아요. 할까요?`);
        if (!ok) return;
        await run('펫 강화', (p, o) => enhancePet(p, o), {
            batch: true,
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
        await run('펫 이름 짓기', (p) => renamePet(p, { name }), { batch: true, after: () => { react('rename'); render(); } });
    }

    async function release() {
        const p = myPet();
        if (p.phase === 'none') return;
        const ok = await deps.confirm(p.phase === 'egg'
            ? '알을 놓아줄까요?\n알 값은 돌아오지 않아요.'
            : `${p.name}을(를) 자연으로 보내 줄까요?\n도감에는 남지만 레벨과 강화는 사라지고, 새 알을 사야 해요.`);
        if (!ok) return;
        // 실수로 누르지 않게 한 번 더: 글자를 직접 적어야 놓아줘요.
        const typed = await deps.prompt(`정말 놓아주려면 아래 칸에 「놓아주기」라고 적어 줘요.${p.phase === 'pet' ? `\n(${p.name} · Lv.${p.level})` : ''}`);
        if (typed == null) return;
        if (String(typed).replace(/\s/g, '') !== '놓아주기') { deps.toast('「놓아주기」라고 적지 않아서 놓아주지 않았어요.'); return; }
        const at = slot;
        const t = now();
        await commit('펫 놓아주기', (b) => releaseBoxPet(b, at, { now: t }), {
            allowLoss: true,
            after: () => show(p.phase === 'pet' ? '잘 가! 도감에 기록했어요. 7일 안에는 다시 데려올 수 있어요.' : '알을 놓아줬어요.', ''),
        });
    }

    /** 놓아준 펫을 보고 있는 빈칸으로 다시 데려와요. */
    async function unrelease() {
        const g = releasedPetOf(myBox(), now());
        if (!g) return;
        const at = slot;
        const t = now();
        await commit('놓아준 펫 다시 데려오기', (b) => restoreReleasedPet(b, at, { now: t }), {
            after: () => { react('main'); show(`${g.name}이(가) 돌아왔어요!`, 'good'); if (feedback) feedback.play('ok'); },
        });
    }

    /* ---------- 그리기 ---------- */

    const bar = (label, value, max, cls, text) => `
        <div class="pet-bar ${cls}">
            <span class="pet-bar-label">${label}</span>
            <span class="pet-bar-track"><i style="width:${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 100}%"></i></span>
            <span class="pet-bar-num">${text}</span>
        </div>`;

    const waitText = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`; };
    /** 역할 표시(힐러·탱커·서포트). 역할 없는 펫은 빈 문자열 */
    const roleBadge = (sp) => (sp && sp.role && PET_ROLES[sp.role] ? `<span class="pet-chip pet-role is-${sp.role}" title="${esc(PET_ROLES[sp.role].desc)}">${PET_ROLES[sp.role].emoji} ${esc(PET_ROLES[sp.role].name)}</span>` : '');
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
                    : p.phase === 'egg' ? petEggHtml({ taps: p.taps, total: PET_HATCH_TAPS, eager: false, fire: !!p.fire })
                        : '<span class="pet-slot-plus" aria-hidden="true">＋</span>';
                const label = p.phase === 'pet' ? `${esc(p.name)} <em>Lv.${p.level}</em>` : p.phase === 'egg' ? (p.fire ? '🔥 불알' : '알') : p.phase === 'unknown' ? '새 펫 · 새로고침' : '빈 칸';
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
        return `<div class="pet-slots" role="group" aria-label="펫 칸">${cells.join('')}</div>${keepHtml(box)}`;
    }

    /** 펫 상점: 종마다 일반·색다른 펫 */
    function shopHtml() {
        const box = myBox();
        const owned = petBoxOwnedSpecies(box);
        const shinyOwned = new Set([...box.list, ...box.cage].filter((p) => p.phase === 'pet' && p.shiny).map((p) => p.species));
        const empty = slot < box.slots && box.list[slot].phase === 'none';
        const btn = (sp, shiny) => {
            const price = petShopPrice(sp.id, shiny, settings());
            const have = owned.has(sp.id);
            // 가진 종은 색다른 모습으로 바꾸기만 돼요. 새로 사려면 빈 칸이 필요해요.
            const can = have ? shiny && !shinyOwned.has(sp.id) : empty;
            const label = have ? (shiny ? (shinyOwned.has(sp.id) ? '✨ 있어요' : '✨ 색다르게') : '있어요') : shiny ? '✨ 색다른' : '일반';
            return `<button type="button" class="pet-shop-buy${shiny ? ' is-shiny' : ''}" data-p="shop-buy" data-sp="${sp.id}" data-shiny="${shiny ? 1 : 0}"${can && myBong() >= price ? '' : ' disabled'}><b>${label}</b><i>${free() ? '무료' : esc(deps.bong(price))}</i></button>`;
        };
        const rows = Object.values(PET_SPECIES).map((sp) => `<div class="pet-shop-row type-${sp.type}${sp.rare ? ' is-rare' : ''}">
            <span class="pet-shop-art">${petArtHtml({ species: sp.id, stage: 1, alt: sp.names[0] })}</span>
            <span class="pet-shop-name"><b>${esc(sp.names[0])}</b>${typeBadge(sp.type)}${roleBadge(sp)}${sp.rare ? '<em>희귀</em>' : ''}</span>
            ${btn(sp, false)}${btn(sp, true)}
        </div>`).join('');
        const stoneBtn = (n) => {
            const price = settings().shop.stone * n;
            return `<button type="button" class="pet-shop-buy" data-p="shop-stone" data-n="${n}"${(!free() && myBong() < price) || box.stones + n > PET_MAX_STONES ? ' disabled' : ''}><b>${n}개</b><i>${free() ? '무료' : esc(deps.bong(price))}</i></button>`;
        };
        return `<details class="pet-shop-box"${(shopOpen == null ? empty : shopOpen) ? ' open' : ''}>
            <summary>🛒 펫 상점 <i>펫과 강화석을 사요</i></summary>
            <p class="pet-note">${empty ? `${slot + 1}번 칸에 데려와요.` : '새 펫은 빈 칸을 고른 뒤 살 수 있어요.'} 같은 종류는 한 마리씩만 가질 수 있고, 가진 펫은 색다른 모습으로 바꿀 수 있어요(레벨·강화 그대로).</p>
            <div class="pet-shop-list">${rows}</div>
            <div class="pet-shop-row pet-shop-stone">
                <span class="pet-shop-art pet-stone-icon" aria-hidden="true">💠</span>
                <span class="pet-shop-name"><b>강화석</b><em>내 강화석 ${box.stones}개</em></span>
                ${stoneBtn(1)}${stoneBtn(5)}
            </div>
            <p class="pet-note">💠 강화석: 펫 하나의 전투력을 영구로 +${PET_STONE_POWER} 올려요. 한 펫에 ${PET_MAX_BOOST / PET_STONE_POWER}개(+${PET_MAX_BOOST})까지, 보관은 ${PET_MAX_STONES}개까지예요.</p>
        </details>`;
    }

    /** 케이지(쉬는 펫)·알 보관함·강화 재료 */
    function keepHtml(box) {
        const cap = petCageCapacity(box, settings());
        const size = settings().cageSize;
        const cells = [];
        for (let i = 0; i < cap; i += 1) {
            const p = box.cage[i];
            // 케이지 하나(칸 하나)마다 size 마리씩 묶어 보여요.
            const first = i % size === 0 ? ' is-first' : '';
            if (p && p.phase === 'unknown') {
                // 새 버전에서 온 펫: 지우지 않고 자리만 보여 줘요.
                cells.push(`<span class="pet-cage-cell${first}"><span class="pet-cage-art">🆕</span><span class="pet-cage-label">새 펫 · 새로고침</span></span>`);
            } else if (p) {
                const v = cagePetView(p, today(), settings());
                cells.push(`<button type="button" class="pet-cage-cell type-${PET_SPECIES[p.species].type}${first}" data-p="uncage" data-cage="${i}" aria-label="${esc(p.name)} 꺼내기">
                    <span class="pet-cage-art">${petArtHtml({ species: p.species, stage: p.stage, shiny: p.shiny, alt: p.name })}</span>
                    <span class="pet-cage-label">${esc(p.name)} <em>Lv.${p.level}</em></span><i class="pet-cage-zz" aria-hidden="true">💤 ${v.fullNow}</i>
                </button>`);
            } else {
                cells.push(`<span class="pet-cage-cell is-empty${first}" aria-hidden="true"><span class="pet-cage-art">·</span><span class="pet-cage-label">빈 자리</span></span>`);
            }
        }
        const mats = Object.keys(box.mats).filter((id) => box.mats[id] > 0 && PET_SPECIES[id]).map((id) => `<span class="pet-chip type-${PET_SPECIES[id].type}">💎 ${esc(PET_SPECIES[id].names[0])} ×${box.mats[id]}</span>`).join('');
        return `<div class="pet-keep">
            <p class="pet-keep-head"><b>🏠 케이지</b><span>${box.cage.length} / ${cap}마리 · 쉬는 동안은 배고프지 않아요 · 누르면 꺼내요</span></p>
            <div class="pet-cage" style="--n:${Math.min(cap, size * 2)}">${cells.join('')}</div>
            <p class="pet-keep-items"><span class="pet-chip${box.eggs > 0 ? ' is-ok' : ''}">🥚 보관한 알 ${box.eggs}개</span>${box.fireEggs > 0 ? `<span class="pet-chip is-ok is-fire">🔥 불알 ${box.fireEggs}개</span>` : ''}${mats || '<span class="pet-chip">💎 강화 재료 없음</span>'}<span class="pet-chip${box.stones > 0 ? ' is-ok' : ''}">💠 강화석 ${box.stones}개</span></p>
        </div>`;
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
                <p class="pet-sub">펫 상점 값</p>
                <label class="pet-set-row"><span>일반 펫</span>${num('shop-normal', cfg.shop.normal, 1, 100000)} 봉 · 색다른 ${num('shop-shiny', cfg.shop.shiny, 1, 100000)} 봉</label>
                <label class="pet-set-row"><span>강화석</span>1개 ${num('shop-stone', cfg.shop.stone, 1, 100000)} 봉</label>
                <label class="pet-set-row"><span>별빛룡(희귀)</span>${num('shop-rare', cfg.shop.rare, 1, 100000)} 봉 · 색다른 ${num('shop-rareShiny', cfg.shop.rareShiny, 1, 100000)} 봉</label>
                <p class="pet-sub">케이지와 배고픔</p>
                <label class="pet-set-row"><span>케이지 크기</span>케이지 하나에 ${num('cage-size', cfg.cageSize, 1, 5)} 마리 (펫 칸마다 케이지 하나)</label>
                <label class="pet-set-row"><span>배고픈 시간</span>${num('awake-start', cfg.awake.start, 0, 23)} 시부터 ${num('awake-end', cfg.awake.end, 1, 24)} 시까지 (그 밖의 시간에는 배고프지 않아요)</label>
                <p class="pet-note">지금 설정: 갓 태어난 펫 ${baby.min}~${baby.max}봉 · 다 키운 펫(전투력 ${PET_MAX_POWER}) ${grown.min}~${grown.max}봉. 최소는 전투력 ${w.step * 2}마다 +1이에요.</p>
                <button type="button" class="pet-btn is-main" data-p="settings-save">설정 저장</button>
                ${deps.giftEggs ? `<p class="pet-sub">🎁 알 선물하기</p>
                <label class="pet-set-row"><span>받는 사람</span><select class="pet-set-input pet-gift-who" data-pet-gift="who"><option value="all">우리 반 모두</option>${giftTargets().map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
                <label class="pet-set-row"><span>알 종류</span><select class="pet-set-input" data-pet-gift="kind"><option value="normal">🥚 알 (10% 확률로 🔥 불알)</option><option value="fire">🔥 불알 (반드시 색다른 펫)</option></select></label>
                <label class="pet-set-row"><span>알 개수</span><input type="number" inputmode="numeric" class="pet-set-input" data-pet-gift="count" value="1" min="1" max="10"> 개씩</label>
                <p class="pet-note">선물한 알은 학생의 알 보관함에 들어가요. 학생이 펫 화면을 열면 받아요.</p>
                <button type="button" class="pet-btn" data-p="gift">🎁 알 선물하기</button>` : ''}
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
            <p class="pet-lead">알을 품으면 여러 종 가운데 하나가 태어나요. 아주 드물게 별빛 용이나 색이 다른 펫도 나와요!</p>
            <div class="pet-lineup">${lineup}</div>
            <button type="button" class="pet-btn is-main" data-p="buy"${can ? '' : ' disabled'}>🥚 알 사기 · ${esc(deps.bong(PET_EGG_PRICE))}</button>
            ${can ? '' : `<p class="pet-note">봉이 ${esc(deps.bong(PET_EGG_PRICE - myBong()))} 모자라요. 퀘스트로 모아 봐요.</p>`}
            ${myBox().fireEggs > 0 ? `<button type="button" class="pet-btn is-fire-egg" data-p="egg-use-fire">🔥 불알 꺼내기 (${myBox().fireEggs}개 · 반드시 색다른 펫!)</button>` : ''}
            ${myBox().eggs > 0 ? `<button type="button" class="pet-btn is-evolve" data-p="egg-use">🥚 보관한 알 꺼내기 (${myBox().eggs}개 있어요)</button>` : ''}
            ${(() => { const g = releasedPetOf(myBox(), now()); return g ? `<button type="button" class="pet-btn" data-p="unrelease">↩️ 놓아준 ${esc(g.name)}(Lv.${g.level}) 다시 데려오기</button><p class="pet-note">놓아준 지 7일 안에는 다시 데려올 수 있어요.</p>` : ''; })()}
            <p class="pet-note">이미 가진 종이 태어나면 그 종의 💎 강화 재료가 돼요.</p>
        </div>`;
    }

    function eggHtml(p0) {
        const p = { ...p0, taps: tapsOf(slot, p0) };
        return `<div class="pet-card is-egg-card${p.fire ? ' is-fire-egg' : ''}">
            <button type="button" class="pet-stage is-egg pet-egg-btn" data-p="warm" aria-label="알 품기">${ground}<span class="pet-sprite is-egg">${petEggHtml({ taps: p.taps, total: PET_HATCH_TAPS, fire: !!p.fire })}</span>${fxHtml()}</button>
            <h3 class="pet-title">${p.fire ? '🔥 불알을 품어 줘요' : '알을 품어 줘요'}</h3>
            <p class="pet-lead">알을 톡톡 쓰다듬어요. ${PET_HATCH_TAPS}번이면 태어나요!${p.fire ? ' 불알에서는 반드시 ✨ 색다른 펫이 나와요!' : ''}</p>
            ${bar('품기', p.taps, PET_HATCH_TAPS, 'is-exp', `${p.taps} / ${PET_HATCH_TAPS}`)}
            <button type="button" class="pet-btn is-main" data-p="warm">🤲 쓰다듬기</button>
            <button type="button" class="pet-link" data-p="egg-store">알 보관함에 넣어 두기${p.taps > 0 ? ' (품은 횟수는 처음부터)' : ''}</button>
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
                ${typeBadge(sp.type)}${roleBadge(sp)}
                <span class="pet-chip">No.${dexNo(sp.id)} ${esc(sp.names[v.stage - 1])} · ${v.stage}단계</span>
                <span class="pet-chip is-lv">Lv.${v.level}</span>
                ${v.enhance ? `<span class="pet-chip is-enh">+${v.enhance}</span>` : ''}
                <span class="pet-chip">전투력 ${v.power}${v.boost > 0 ? ` <small>(💠+${v.boost})</small>` : ''}</span>
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
            <p class="pet-sub">기술 <em>(공격 기술은 무작위로, 🛡️ 막기 기술은 공격받을 때, 💚 회복 기술은 보스 공격 뒤에 확률로 써요)</em></p>
            <div class="pet-skills">${petSkills(v.species, v.level).map((k) => `<span class="pet-skill${k.learned ? ' is-on' : ''} type-${sp.type}"><b>${k.learned ? '' : '🔒 '}${esc(k.name)}</b><i>${k.learned ? `세기 ×${k.mult}` : `Lv.${k.level}에 배워요`}</i></span>`).join('')}${(() => { const g = petGuardSkill(v.species, v.level); return `<span class="pet-skill is-guard${g.learned ? ' is-on' : ''} type-${sp.type}"><b>${g.learned ? '🛡️ ' : '🔒 '}${esc(g.name)}</b><i>${g.learned ? `공격받을 때 ${g.chance}% · ${esc(petGuardText(g))}` : `Lv.${g.level}에 배워요 · 공격받을 때 저절로 써요`}</i></span>`; })()}${(() => { const h = petHealSkill(v.species, v.level); return h.learned ? `<span class="pet-skill is-on is-heal type-${sp.type}"><b>💚 ${esc(h.name)}</b><i>${esc(petHealText(h))}</i></span>` : `<span class="pet-skill is-heal type-${sp.type}"><b>🔒 💚 ${esc(h.name)}</b><i>Lv.40에 배워요</i></span>`; })()}${petRoleSkills(v.species, v.level).map((k) => `<span class="pet-skill is-role${k.learned ? ' is-on' : ''} type-${sp.type}"><b>${k.learned ? '' : '🔒 '}${PET_ROLES[sp.role].emoji} ${esc(k.name)}</b><i>${k.learned ? esc(petRoleSkillText(k)) : `Lv.${k.level}에 배워요 · ${esc(petRoleSkillText(k))}`}</i></span>`).join('')}</div>
            ${sp.role ? `<p class="pet-note">${PET_ROLES[sp.role].emoji} ${esc(PET_ROLES[sp.role].name)}: ${esc(PET_ROLES[sp.role].desc)}. 역할 기술은 탐험 전투에서만 써요.</p>` : ''}
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
                ${(myBox().mats[v.species] || 0) > 0 && !maxEnh ? `<button type="button" class="pet-btn is-mat" data-p="enhance-mat"><b>💎 재료로 강화 +${v.enhance} → +${v.enhance + 1}</b><i>재료 ${myBox().mats[v.species]}개 · 봉 없이 반드시 성공</i></button>` : ''}
                ${myBox().stones > 0 && v.boost < PET_MAX_BOOST ? `<button type="button" class="pet-btn is-mat is-stone" data-p="use-stone"><b>💠 강화석 쓰기 · 전투력 +${PET_STONE_POWER}</b><i>이 펫 +${v.boost} / +${PET_MAX_BOOST} · 강화석 ${myBox().stones}개</i></button>` : ''}
                <button type="button" class="pet-btn" data-p="cage"><b>🏠 케이지에서 쉬게 하기</b><i>쉬는 동안은 배고프지 않아요</i></button>
            </div>
            <p class="pet-note">지금까지 벌어 온 봉 ${esc(deps.bong(v.earned))} · 배는 ${settings().awake.start}시~${settings().awake.end}시에만 고파져요(밤에는 그대로) · 텅 빈 채 3일이 지나면 가출해요.</p>
            <button type="button" class="pet-link" data-p="release">놓아주기</button>
        </div>`;
    }

    function mineHtml() {
        if (!deps.canPlay()) return '<div class="pet-card"><p class="pet-lead">로그인하면 펫을 키울 수 있어요. 「반 펫」에서 친구들 펫을 구경해요.</p></div>';
        if (slot >= myBox().slots) return `${slotBarHtml()}${lockedHtml()}${adminHtml()}`;
        const p = myPet();
        const card = p.phase === 'egg' ? eggHtml(p) : p.phase === 'pet' ? petHtml(petView(p, now(), today(), settings()))
            : p.phase === 'unknown' ? '<div class="pet-card"><p class="pet-lead">🆕 새 버전에서 온 펫이 이 칸에 있어요. 화면을 새로 고치면 만날 수 있어요. (펫은 안전하게 그대로 있어요)</p></div>' : noneHtml();
        return `${slotBarHtml()}${card}${shopHtml()}${adminHtml()}`;
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
        }).join('')}</div><p class="pet-note">전투력 = 단계·레벨·강화·강화석을 합친 점수예요. 가장 높으면 ${PET_MAX_POWER}이에요.</p>`;
    }

    function dexHtml() {
        const dex = myBox().dex || {};
        const found = Object.keys(dex).filter((id) => PET_SPECIES[id]).length;
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
        // 선생님이 선물한 알이 있으면 받아요.
        if (!giftUnsub && deps.giftWatch && deps.canPlay()) giftUnsub = deps.giftWatch((total, fireTotal) => { giftTotal = Math.max(giftTotal, Math.floor(Number(total)) || 0); giftFireTotal = Math.max(giftFireTotal, Math.floor(Number(fireTotal)) || 0); if (isOpen()) void takeGifts(); });
        void takeGifts();
        if (!timer) {
            timer = setInterval(() => {
                const el = root();
                if (!el || el.classList.contains('hidden') || !el.offsetParent) return;
                // 마스터가 설정 칸에 적는 중이면 다시 그리지 않아요.
                if (!busy && !fx && !(el.querySelector('.pet-admin[open]'))) render();
                if (tab === 'raid') { void raid.maybePlay(); raid.keepAlive(); }
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

    return { joinRaid, open, render, flush, showsClass: () => tab === 'class' && !busy, isOpen, close: () => { raid.stop(); void flush(); } };
}
