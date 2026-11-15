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
    PET_NAME_MAX,
    PET_PLAY_EXP,
    PET_PLAY_PER_DAY,
    PET_RETURN_PRICE,
    PET_SPECIES,
    PET_TYPES,
    bringPetBack,
    buyPetEgg,
    enhancePet,
    evolvePet,
    feedPet,
    petErrorText,
    petView,
    playWithPet,
    rankClassPets,
    releasePet,
    renamePet,
    sanitizePet,
    walkPet,
    warmPetEgg,
} from './lib/petGame.js';
import { petArtHtml, petEggHtml, petEggSvg, petSvg } from './lib/petArt.js';
import { createOxFeedback } from './lib/oxQuizFeedback.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MOOD_TEXT = Object.freeze({
    happy: '기분이 아주 좋아요!',
    ok: '잘 지내고 있어요.',
    hungry: '배가 고파요…',
    starving: '배가 텅 비었어요! 밥을 줘요.',
});

/**
 * deps: { state() → playerState, canPlay() → boolean, today() → 'YYYY-MM-DD',
 *   applyBong(delta), save(opts) → Promise<boolean>, students() → [{id, name, pet}],
 *   selfId(), bong(v) → '12봉', confirm(text), prompt(text), toast(text) }
 */
export function createPetMode(deps) {
    const root = () => document.getElementById('challengePane-pet');
    let tab = 'mine';
    let busy = false;
    let bound = false;
    let feedback = null;
    let fx = null; // { text, kind, at } 잠깐 띄우는 글자
    let timer = 0;

    const now = () => Date.now();
    const today = () => deps.today();
    const myPet = () => sanitizePet(deps.state() && deps.state().pet);
    const myBong = () => Number(deps.state() && deps.state().bong) || 0;

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
            if (act === 'tab') { tab = t.getAttribute('data-tab') || 'mine'; render(); }
            else if (act === 'buy') void run('펫 알 사기', (p, o) => buyPetEgg(p, o));
            else if (act === 'warm') void warm();
            else if (act === 'feed') void feed(t.getAttribute('data-food'));
            else if (act === 'play') void run('펫과 놀기', (p, o) => playWithPet(p, o), { after: (r) => grew(r, '신나게 놀았어요!') });
            else if (act === 'walk') void run('펫 산책 보상', (p, o) => walkPet(p, o), { after: (r) => { show(`산책에서 ${deps.bong(r.gain)}을 벌어 왔어요!`, 'good'); if (feedback) feedback.play('ok'); } });
            else if (act === 'enhance') void enhance();
            else if (act === 'evolve') void evolve();
            else if (act === 'back') void run('펫 데려오기', (p, o) => bringPetBack(p, o), { after: () => show('집으로 돌아왔어요! 이제 잘 챙겨 줘요.', 'good') });
            else if (act === 'rename') void rename();
            else if (act === 'release') void release();
        });
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
        if (!deps.canPlay()) { deps.toast('학생으로 들어와야 펫을 키울 수 있어요.'); return null; }
        const st = deps.state();
        const r = fn(st.pet, { bong: myBong(), now: now(), today: today(), rnd });
        if (!r.ok) { deps.toast(petErrorText(r.error)); return null; }
        busy = true;
        try {
            st.pet = r.pet;
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

    /** 알 품기: 부화할 때만 저장해요(그 전에는 이 화면에서만 세요). */
    async function warm() {
        if (busy || !deps.canPlay()) return;
        const st = deps.state();
        const r = warmPetEgg(st.pet, { now: now(), rnd: Math.random });
        if (!r.ok) return;
        if (!r.hatched) {
            st.pet = r.pet;
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
        await run(`펫 먹이: ${f.name}`, (p, o) => feedPet(p, { ...o, food: foodId }), { after: (r) => grew(r, `${f.emoji} 냠냠!`) });
    }

    async function enhance() {
        const v = petView(myPet(), now(), today());
        if (v.phase !== 'pet') return;
        const ok = await deps.confirm(`강화 +${v.enhance} → +${v.enhance + 1}\n${deps.bong(v.enhanceCost)}이 들고, 성공 확률은 ${Math.round(v.enhanceChance * 100)}%예요.\n실패해도 펫은 그대로지만 봉은 돌아오지 않아요. 할까요?`);
        if (!ok) return;
        await run('펫 강화', (p, o) => enhancePet(p, o), {
            after: (r) => {
                if (r.success) { show(`강화 성공! +${r.pet.enhance}`, 'good'); if (feedback) feedback.play('ok'); }
                else { show('강화 실패… 다음에 다시 해 봐요.', 'bad'); if (feedback) feedback.play('no'); }
            },
        });
    }

    async function evolve() {
        await run('펫 진화', (p, o) => evolvePet(p, o), {
            after: (r) => {
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
        await run('펫 이름 짓기', (p) => renamePet(p, { name }));
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

    const typeBadge = (typeId) => `<span class="pet-type type-${typeId}">${PET_TYPES[typeId].emoji} ${esc(PET_TYPES[typeId].name)}</span>`;
    const dexNo = (id) => String(Object.keys(PET_SPECIES).indexOf(id) + 1).padStart(3, '0');
    const ground = '<span class="pet-ground" aria-hidden="true"></span>';

    function tabsHtml() {
        return `<div class="pet-tabs" role="tablist">${[['mine', '🐾 내 펫'], ['class', '🏆 반 펫'], ['dex', '📖 도감']].map(([k, l]) => (
            `<button type="button" class="pet-tab${tab === k ? ' is-on' : ''}" data-p="tab" data-tab="${k}" role="tab" aria-selected="${tab === k}">${l}</button>`
        )).join('')}<span class="pet-wallet">내 봉 <b>${esc(deps.bong(myBong()))}</b></span></div>`;
    }

    function fxHtml() {
        return fx ? `<p class="pet-fx ${fx.kind ? `is-${fx.kind}` : ''}" role="status">${esc(fx.text)}</p>` : '';
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
            </p>`;
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
        return `<div class="pet-card type-${sp.type}">
            <div class="pet-stage type-${sp.type} mood-${v.mood}${v.shiny ? ' is-shiny' : ''}">
                ${ground}
                <span class="pet-sprite stage-${v.stage}">${petArtHtml({ species: v.species, stage: v.stage, shiny: v.shiny, mood: v.mood, eager: true, alt: sp.names[v.stage - 1] })}</span>
                ${bubble}
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
            <div class="pet-actions">
                <button type="button" class="pet-btn" data-p="play"${v.playsLeft > 0 ? '' : ' disabled'}><b>🎾 놀아 주기</b><i>공짜 · 경험치 +${PET_PLAY_EXP} · 오늘 ${v.playsLeft}/${PET_PLAY_PER_DAY}번 남음</i></button>
                <button type="button" class="pet-btn" data-p="walk"${v.walked || v.fullNow < 30 ? ' disabled' : ''}><b>🐾 산책 보내기</b><i>${v.walked ? '오늘은 다녀왔어요' : v.fullNow < 30 ? '배고파서 못 가요' : `하루 한 번 · ${esc(deps.bong(v.walkBong))} 벌어 와요`}</i></button>
                <button type="button" class="pet-btn" data-p="enhance"${maxEnh || myBong() < v.enhanceCost ? ' disabled' : ''}><b>🔨 강화 ${maxEnh ? '끝!' : `+${v.enhance} → +${v.enhance + 1}`}</b><i>${maxEnh ? '끝까지 강화했어요' : `${esc(deps.bong(v.enhanceCost))} · 성공 ${Math.round(v.enhanceChance * 100)}%`}</i></button>
            </div>
            <p class="pet-note">지금까지 벌어 온 봉 ${esc(deps.bong(v.earned))} · 배가 텅 빈 채 3일이 지나면 가출해요.</p>
            <button type="button" class="pet-link" data-p="release">놓아주기</button>
        </div>`;
    }

    function mineHtml() {
        if (!deps.canPlay()) return '<div class="pet-card"><p class="pet-lead">학생으로 들어오면 펫을 키울 수 있어요. 「반 펫」에서 친구들 펫을 구경해요.</p></div>';
        const p = myPet();
        if (p.phase === 'egg') return eggHtml(p);
        if (p.phase === 'pet') return petHtml(petView(p, now(), today()));
        return noneHtml();
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
        }).join('')}</div><p class="pet-note">전투력 = 단계·레벨·강화를 합친 점수예요.</p>`;
    }

    function dexHtml() {
        const dex = myPet().dex || {};
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
        let body = el.querySelector('[data-ox-body]');
        if (!body) {
            el.innerHTML = '<div class="pet-body" data-ox-body></div>';
            body = el.querySelector('[data-ox-body]');
        }
        body.className = `pet-body is-tab-${tab}`;
        body.innerHTML = `${tabsHtml()}${tab === 'class' ? classHtml() : tab === 'dex' ? dexHtml() : mineHtml()}`;
    }

    /** 펫 화면을 열 때 불러요. 보는 동안 1분마다 배고픔을 다시 계산해요. */
    function open() {
        render();
        if (!timer) {
            timer = setInterval(() => {
                const el = root();
                if (!el || el.classList.contains('hidden') || !el.offsetParent) return;
                if (!busy && !fx) render();
            }, 60000);
        }
    }

    return { open, render, showsClass: () => tab === 'class' && !busy, isOpen: () => { const el = root(); return !!(el && !el.classList.contains('hidden')); } };
}
