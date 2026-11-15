/**
 * 수업도구 「수학 개념」: 단원 → 개념 → 숫자를 고르면 개념 그림을 그려 줘요.
 * 그림 만드는 규칙은 lib/mathConcept.js. 여기는 고르는 화면, 단계별 애니메이션(설명 보기), 저장(PNG·SVG)·전체화면이에요.
 *
 * 애니메이션: 그림 조각마다 data-step="n" 이 붙어 있어요. n번째 단계가 되면 그 조각이 나타나고,
 * 아래에 그 단계의 설명 문장이 크게 나와요. 저장하는 그림에는 항상 모든 조각이 들어가요.
 */
import './mathConceptTool.css';
import { MATH_H, MATH_UNITS, MATH_W, findMathConcept, mathGrades, renderMathConcept } from './lib/mathConcept.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KEY = 'sambong_math_concept';
/** 자동 재생에서 한 단계를 보여 주는 시간(ms) */
import { koreanVoices, pickVoice, speechFallbackMs, speechText } from './lib/mathSpeech.js';

const STEP_MS = 2800;
/** 읽어 주기가 끝난 뒤 다음 단계로 넘어가기 전 쉬는 시간 */
const AFTER_SPEECH_MS = 700;

export function createMathConceptTool({ root, toast = () => {} } = {}) {
    const host = () => (typeof root === 'function' ? root() : root);
    const FIRST = MATH_UNITS.find((u) => u.grade === 6) || MATH_UNITS[0];
    const st = { unit: FIRST.id, concept: FIRST.concepts[0].id, params: {}, bound: false, step: 0, playing: false, timer: 0, speak: false, voice: '', sayId: 0, sayTimer: 0 };
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && saved.unit) { st.unit = String(saved.unit); st.concept = String(saved.concept || ''); st.params = saved.params && typeof saved.params === 'object' ? saved.params : {}; st.speak = saved.speak === true; st.voice = typeof saved.voice === 'string' ? saved.voice : ''; }
    } catch (_) { /* 저장값이 없으면 처음 단원부터 */ }
    let last = null;

    const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ unit: st.unit, concept: st.concept, params: st.params, speak: st.speak, voice: st.voice })); } catch (_) { /* 저장 공간이 없으면 넘어가요 */ } };
    const total = () => (last ? last.steps.length : 1);

    function paramHtml(p, value) {
        const id = `mathp-${p.key}`;
        if (p.type === 'select') {
            return `<label class="mathviz-field" for="${id}"><span>${esc(p.label)}</span><select id="${id}" data-math-param="${p.key}">${p.options.map((o) => `<option value="${esc(o[0])}"${String(value) === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
        }
        if (p.type === 'text') {
            return `<label class="mathviz-field is-wide" for="${id}"><span>${esc(p.label)}</span><input id="${id}" type="text" data-math-param="${p.key}" value="${esc(value)}" maxlength="120"></label>`;
        }
        const step = p.type === 'int' ? 1 : 10 ** -(p.dp == null ? 2 : p.dp);
        return `<label class="mathviz-field" for="${id}"><span>${esc(p.label)} <i>${p.min}~${p.max}</i></span>
            <span class="mathviz-stepper">
                <button type="button" data-math="step" data-key="${p.key}" data-d="-${step}" aria-label="${esc(p.label)} 줄이기">−</button>
                <input id="${id}" type="number" inputmode="${p.type === 'int' ? 'numeric' : 'decimal'}" data-math-param="${p.key}" value="${esc(value)}" min="${p.min}" max="${p.max}" step="${step}">
                <button type="button" data-math="step" data-key="${p.key}" data-d="${step}" aria-label="${esc(p.label)} 늘리기">＋</button>
            </span></label>`;
    }

    /* ---------- 단계 애니메이션 ---------- */

    const synthOf = () => { try { return typeof SpeechSynthesisUtterance !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null; } catch (_) { return null; } };
    const voicesNow = () => { const sy = synthOf(); try { return sy ? koreanVoices(sy.getVoices()) : []; } catch (_) { return []; } };

    function hush() {
        st.sayId += 1; // 읽던 문장의 "끝났어요" 신호는 무시해요.
        if (st.sayTimer) clearTimeout(st.sayTimer);
        st.sayTimer = 0;
        try { const sy = synthOf(); if (sy) sy.cancel(); } catch (_) { /* 읽어 주기가 없는 기기 */ }
    }

    function stopPlay() {
        if (st.timer) clearTimeout(st.timer);
        st.timer = 0;
        st.playing = false;
        hush();
    }

    /** 한 문장을 읽어요. 다 읽으면(또는 읽을 수 없으면) onDone 을 꼭 한 번 불러요. 읽기 시작했으면 true */
    function say(line, onDone) {
        const done = () => { if (onDone) onDone(); };
        const sy = st.speak ? synthOf() : null;
        if (!sy) { done(); return false; }
        hush();
        const id = st.sayId;
        let finished = false;
        const finish = () => { if (finished || id !== st.sayId) return; finished = true; if (st.sayTimer) clearTimeout(st.sayTimer); st.sayTimer = 0; done(); };
        try {
            const words = speechText(line);
            const u = new SpeechSynthesisUtterance(words);
            const v = pickVoice(sy.getVoices(), st.voice);
            if (v) u.voice = v;
            u.lang = v ? v.lang : 'ko-KR';
            u.rate = 0.92;
            u.onend = finish;
            u.onerror = finish;
            st.utter = u; // 읽는 동안 지워지지 않게 붙잡아 둬요(일부 브라우저에서 끝 신호가 사라져요).
            sy.speak(u);
            // 끝났다는 신호가 안 오는 기기를 위한 안전장치
            st.sayTimer = setTimeout(finish, speechFallbackMs(words, u.rate));
            return true;
        } catch (_) { finish(); return false; }
    }

    /** 지금 단계까지의 조각만 보여 줘요. 방금 나온 조각은 움직이며 나타나요. */
    function applyStep(animate) {
        const el = host();
        if (!el) return;
        const stage = el.querySelector('[data-math-stage]');
        if (stage) {
            stage.querySelectorAll('[data-step]').forEach((node) => {
                const k = Number(node.getAttribute('data-step')) || 0;
                node.classList.remove('ms-in');
                node.style.visibility = k <= st.step ? 'visible' : 'hidden';
                if (animate && k === st.step) { void node.getBoundingClientRect(); node.classList.add('ms-in'); }
            });
        }
        const all = st.step >= total();
        const talk = el.querySelector('[data-math-talk]');
        if (talk) {
            const line = last && last.steps[st.step - 1];
            talk.innerHTML = line ? `<b>${st.step}</b><span>${esc(line)}</span>` : '<span>▶ 「설명 보기」를 누르면 한 단계씩 차근차근 보여 줘요.</span>';
            talk.classList.toggle('is-idle', !line);
        }
        const dots = el.querySelector('[data-math-dots]');
        if (dots) dots.innerHTML = Array.from({ length: total() }, (_, i) => `<button type="button" class="mathviz-dot${i + 1 === st.step ? ' is-on' : i + 1 < st.step ? ' is-done' : ''}" data-math="goto" data-step-to="${i + 1}" aria-label="${i + 1}단계">${i + 1}</button>`).join('');
        const play = el.querySelector('[data-math="play"]');
        if (play) play.textContent = st.playing ? '⏸ 멈춤' : all || st.step === 0 ? '▶ 설명 보기' : '▶ 이어 보기';
        const prev = el.querySelector('[data-math="prev"]');
        if (prev) prev.disabled = st.step <= 1;
        const next = el.querySelector('[data-math="next"]');
        if (next) next.disabled = all;
    }

    function go(step, { animate = true, speak = true, onSpoken = null } = {}) {
        st.step = Math.max(1, Math.min(total(), step));
        applyStep(animate);
        if (speak && last) return say(last.steps[st.step - 1], onSpoken);
        if (onSpoken) onSpoken();
        return false;
    }

    /** 자동 재생의 한 단계: 그림을 보여 주고, 설명을 끝까지 읽은 뒤(읽어 주기가 꺼져 있으면 정해진 시간 뒤) 다음으로 가요. */
    function showAndWait(step) {
        const started = Date.now();
        let spoke = false;
        let moved = false;
        const next = () => {
            if (moved || !st.playing) return;
            moved = true;
            // 읽기가 아주 짧아도 그림을 볼 시간은 주고, 읽기가 끝나면 조금 쉬었다 넘어가요.
            const wait = Math.max(spoke ? AFTER_SPEECH_MS : 0, STEP_MS - (Date.now() - started));
            st.timer = setTimeout(tick, wait);
        };
        spoke = go(step, { onSpoken: next });
    }

    function tick() {
        if (!st.playing) return;
        if (st.step >= total()) { st.playing = false; applyStep(false); return; }
        showAndWait(st.step + 1);
    }

    function play() {
        if (st.playing) { stopPlay(); applyStep(false); return; }
        st.playing = true;
        if (st.step >= total() || st.step === 0) showAndWait(1); else tick();
        applyStep(false);
    }

    /** 그림만 다시 그려요(숫자 칸에 적는 중에는 칸을 건드리지 않아요). 숫자가 바뀌면 다 보이는 그림으로 돌아가요. */
    function draw() {
        const el = host();
        if (!el) return;
        stopPlay();
        last = renderMathConcept(st.unit, st.concept, st.params);
        const stage = el.querySelector('[data-math-stage]');
        if (stage) stage.innerHTML = last.svg;
        st.step = total();
        applyStep(false);
        const talk = el.querySelector('[data-math-talk]');
        if (talk) { talk.innerHTML = '<span>▶ 「설명 보기」를 누르면 한 단계씩 차근차근 보여 줘요.</span>'; talk.classList.add('is-idle'); }
    }

    /** 목소리 고르기 칸: 한국어 목소리가 둘 이상이고 읽어 주기가 켜져 있을 때만 보여요(자연스러운 순서). */
    function fillVoices() {
        const el = host();
        const sel = el && el.querySelector('[data-math-voice]');
        if (!sel) return;
        const list = voicesNow();
        const cur = pickVoice(list, st.voice);
        sel.hidden = !(st.speak && list.length > 1);
        sel.innerHTML = list.map((v, i) => `<option value="${esc(v.name)}"${cur && v.name === cur.name ? ' selected' : ''}>${i === 0 ? '⭐ ' : ''}${esc(v.name.replace(/^Microsoft\s+|\s*-\s*Korean.*$/gi, ''))}</option>`).join('');
    }

    function render() {
        const el = host();
        if (!el) return;
        bind();
        stopPlay();
        const { unit, concept } = findMathConcept(st.unit, st.concept);
        st.unit = unit.id;
        st.concept = concept.id;
        last = renderMathConcept(st.unit, st.concept, st.params);
        st.params = last.params;
        const grades = mathGrades();
        st.rendering = true;
        el.innerHTML = `<div class="mathviz">
            <div class="mathviz-side">
                ${grades.length > 1 ? `<div class="mathviz-grades" role="tablist">${grades.map((g) => `<button type="button" class="mathviz-grade${g === unit.grade ? ' is-on' : ''}" data-math="grade" data-grade="${g}" role="tab" aria-selected="${g === unit.grade}">${g}학년</button>`).join('')}</div>` : ''}
                <div class="mathviz-terms" role="tablist">${[1, 2].map((t) => `<button type="button" class="mathviz-term${t === unit.term ? ' is-on' : ''}" data-math="term" data-term="${t}" role="tab" aria-selected="${t === unit.term}">${unit.grade}학년 ${t}학기</button>`).join('')}</div>
                <div class="mathviz-units">${MATH_UNITS.filter((u) => u.grade === unit.grade && u.term === unit.term).map((u) => `<button type="button" class="mathviz-unit${u.id === unit.id ? ' is-on' : ''}" data-math="unit" data-unit="${u.id}"><b>${u.no}</b><span>${esc(u.name)}</span></button>`).join('')}</div>
            </div>
            <div class="mathviz-main">
                <div class="mathviz-top">
                    <div class="mathviz-concepts">${unit.concepts.map((c) => `<button type="button" class="mathviz-chip${c.id === concept.id ? ' is-on' : ''}" data-math="concept" data-concept="${c.id}">${esc(c.name)}</button>`).join('')}</div>
                    <button type="button" class="mathviz-btn mathviz-fullbtn" data-math="screen" aria-pressed="${isFull() ? 'true' : 'false'}">${isFull() ? '🗗 전체화면 끄기' : '⛶ 전체화면'}</button>
                </div>
                <div class="mathviz-params">${concept.params.map((p) => paramHtml(p, st.params[p.key])).join('')}
                    <button type="button" class="mathviz-reset" data-math="reset">처음 값으로</button>
                </div>
                <div class="mathviz-stage" data-math-stage>${last.svg}</div>
                <div class="mathviz-player">
                    <p class="mathviz-talk is-idle" data-math-talk role="status" aria-live="polite"><span>▶ 「설명 보기」를 누르면 한 단계씩 차근차근 보여 줘요.</span></p>
                    <div class="mathviz-controls">
                        <button type="button" class="mathviz-btn is-play" data-math="play">▶ 설명 보기</button>
                        <button type="button" class="mathviz-btn" data-math="prev" aria-label="이전 단계">◀ 이전</button>
                        <button type="button" class="mathviz-btn" data-math="next" aria-label="다음 단계">다음 ▶</button>
                        <span class="mathviz-dots" data-math-dots></span>
                        <button type="button" class="mathviz-btn${st.speak ? ' is-on' : ''}" data-math="speak" aria-pressed="${st.speak}">${st.speak ? '🔊 읽어 주기 켬' : '🔈 읽어 주기'}</button>
                        <select class="mathviz-voice" data-math-voice aria-label="읽어 주는 목소리" hidden></select>
                        <button type="button" class="mathviz-btn" data-math="all">전체 그림</button>
                    </div>
                </div>
                <div class="mathviz-actions">
                    <button type="button" class="mathviz-btn is-main" data-math="png">🖼️ 그림(PNG) 저장</button>
                    <button type="button" class="mathviz-btn" data-math="copy">📋 그림 복사</button>
                    <button type="button" class="mathviz-btn" data-math="svg">SVG 저장</button>
                    <button type="button" class="mathviz-btn" data-math="full">🔍 그림만 크게</button>
                </div>
                <p class="mathviz-note">숫자를 바꾸면 그림이 바로 바뀌어요. 그림으로 그릴 수 없는 값은 가까운 값으로 맞춰 줘요. 저장한 그림에는 모든 단계가 들어가요.</p>
            </div>
        </div>`;
        st.rendering = false;
        st.step = total();
        applyStep(false);
        fillVoices();
        // 목소리 목록은 조금 늦게 준비되는 기기가 있어요.
        if (!st.voiceHook) { const sy = synthOf(); if (sy && sy.addEventListener) { st.voiceHook = true; sy.addEventListener('voiceschanged', fillVoices); } }
        remember();
    }

    /** 도구 전체를 전체화면으로(숫자를 바꾸면서 TV에 띄울 때). 전체화면이 안 되는 기기는 화면을 가득 덮어요. */
    const isFull = () => { const el = host(); return !!el && (document.fullscreenElement === el || el.classList.contains('is-full')); };
    async function toggleScreen() {
        const el = host();
        if (!el) return;
        if (document.fullscreenElement === el) { await document.exitFullscreen(); return; }
        if (el.classList.contains('is-full')) { el.classList.remove('is-full'); render(); return; }
        if (document.fullscreenElement) await document.exitFullscreen();
        try {
            if (!el.requestFullscreen) throw new Error('no fullscreen');
            await el.requestFullscreen({ navigationUI: 'hide' });
        } catch (_) {
            el.classList.add('is-full');
            render();
        }
    }

    const fileName = () => `수학개념_${(last ? last.title : '').replace(/[^0-9A-Za-z가-힣\s-]/g, '').trim().replace(/\s+/g, '_')}`;

    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    /** SVG를 2배 크기 PNG로 바꿔요. */
    function toPng() {
        return new Promise((resolve, reject) => {
            if (!last) { reject(new Error('그림이 없어요')); return; }
            const img = new Image();
            const url = URL.createObjectURL(new Blob([last.svg], { type: 'image/svg+xml;charset=utf-8' }));
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = MATH_W * 2;
                    canvas.height = MATH_H * 2;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('그림을 만들지 못했어요'))), 'image/png');
                } catch (e) { reject(e); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('그림을 만들지 못했어요')); };
            img.src = url;
        });
    }

    async function act(kind) {
        try {
            if (kind === 'screen') { await toggleScreen(); return; }
            if (kind === 'svg') { download(new Blob([last.svg], { type: 'image/svg+xml;charset=utf-8' }), `${fileName()}.svg`); return; }
            if (kind === 'png') { download(await toPng(), `${fileName()}.png`); toast('그림을 저장했어요.'); return; }
            if (kind === 'copy') {
                if (!navigator.clipboard || typeof ClipboardItem === 'undefined') { toast('이 기기에서는 복사가 안 돼요. 저장을 눌러 주세요.'); return; }
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng() })]);
                toast('그림을 복사했어요. 붙여넣기 하면 돼요.');
                return;
            }
            if (kind === 'full') {
                const stage = host().querySelector('[data-math-stage]');
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (stage && stage.requestFullscreen) await stage.requestFullscreen();
                else if (stage) stage.classList.toggle('is-zoom');
            }
        } catch (e) {
            toast(`잘 안 됐어요: ${e && e.message ? e.message : e}`);
        }
    }

    /** 칸에 적은 값이 그릴 수 없는 값이라 바뀌었으면 알려 줘요. */
    function noteSnap(key, typed) {
        const now = st.params[key];
        if (typed === '' || typed == null || String(now) === String(typed).trim()) return;
        if (Number(typed) === Number(now)) return;
        toast(`그림으로 그릴 수 있는 값 ${now}(으)로 맞췄어요.`);
    }

    function bind() {
        const el = host();
        if (!el || st.bound) return;
        st.bound = true;
        el.classList.add('mathviz-root');
        // 전체화면에 들어가거나 나오면(Esc 포함) 버튼 글자를 맞춰요.
        document.addEventListener('fullscreenchange', () => {
            const h = host();
            if (!h || !h.isConnected) return;
            const now = document.fullscreenElement === h;
            if (now !== !!st.wasFull) { st.wasFull = now; render(); } // '그림만 크게'일 때는 다시 그리지 않아요
        });
        el.addEventListener('click', (e) => {
            const t = e.target.closest('[data-math]');
            if (!t || !el.contains(t) || t.disabled) return;
            const a = t.getAttribute('data-math');
            const firstOf = (pred) => MATH_UNITS.find(pred);
            if (a === 'grade') { const u = firstOf((x) => x.grade === Number(t.getAttribute('data-grade'))); if (u) { st.unit = u.id; st.concept = ''; st.params = {}; render(); } }
            else if (a === 'term') { const cur = findMathConcept(st.unit, st.concept).unit; const u = firstOf((x) => x.grade === cur.grade && x.term === Number(t.getAttribute('data-term'))); if (u) { st.unit = u.id; st.concept = ''; st.params = {}; render(); } }
            else if (a === 'unit') { st.unit = t.getAttribute('data-unit'); st.concept = ''; st.params = {}; render(); }
            else if (a === 'concept') { st.concept = t.getAttribute('data-concept'); st.params = {}; render(); }
            else if (a === 'reset') { st.params = {}; render(); }
            else if (a === 'step') {
                const key = t.getAttribute('data-key');
                const d = Number(t.getAttribute('data-d')) || 0;
                st.params = { ...st.params, [key]: Math.round(((Number(st.params[key]) || 0) + d) * 1000) / 1000 };
                render();
            }
            else if (a === 'play') play();
            else if (a === 'prev') { stopPlay(); go(st.step - 1, { animate: false }); }
            else if (a === 'next') { stopPlay(); go(st.step >= total() ? 1 : st.step + 1); }
            else if (a === 'goto') { stopPlay(); go(Number(t.getAttribute('data-step-to')) || 1); }
            else if (a === 'all') { stopPlay(); st.step = total(); applyStep(false); const talk = el.querySelector('[data-math-talk]'); if (talk) { talk.innerHTML = `<span>${esc(last.caption)}</span>`; talk.classList.remove('is-idle'); } }
            else if (a === 'speak') { st.speak = !st.speak; if (!st.speak) hush(); fillVoices(); t.classList.toggle('is-on', st.speak); t.textContent = st.speak ? '🔊 읽어 주기 켬' : '🔈 읽어 주기'; t.setAttribute('aria-pressed', String(st.speak)); remember(); if (st.speak && last && st.step >= 1) say(last.steps[Math.min(st.step, total()) - 1]); }
            else void act(a);
        });
        // 적는 동안에는 그림만 바꾸고, 다 적으면(칸을 벗어나면) 그릴 수 있는 값으로 칸도 고쳐요.
        el.addEventListener('input', (e) => {
            const t = e.target.closest('[data-math-param]');
            if (!t) return;
            st.params = { ...st.params, [t.getAttribute('data-math-param')]: t.value };
            draw();
            remember();
        });
        el.addEventListener('change', (e) => {
            const vs = e.target.closest('[data-math-voice]');
            if (vs) { st.voice = vs.value; remember(); if (!st.playing && last && st.step >= 1) say(last.steps[Math.min(st.step, total()) - 1]); return; }
            const t = e.target.closest('[data-math-param]');
            if (!t || st.rendering) return; // 다시 그리는 중에 칸이 사라지며 나는 change 는 무시해요
            const key = t.getAttribute('data-math-param');
            const typed = t.value;
            st.params = { ...st.params, [key]: typed };
            render();
            if (t.type === 'number') noteSnap(key, typed);
        });
    }

    return { open: render, render, stop: stopPlay };
}
