/**
 * 수업도구 「수학 개념」: 6학년 수학 단원 → 개념 → 숫자를 고르면 개념 그림을 그려 줘요.
 * 그림 만드는 규칙은 lib/mathConcept.js. 여기는 고르는 화면과 저장(PNG·SVG)·크게 보기예요.
 */
import './mathConceptTool.css';
import { MATH_H, MATH_UNITS, MATH_W, findMathConcept, renderMathConcept } from './lib/mathConcept.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KEY = 'sambong_math_concept';

export function createMathConceptTool({ root, toast = () => {} } = {}) {
    const host = () => (typeof root === 'function' ? root() : root);
    const st = { unit: MATH_UNITS[0].id, concept: MATH_UNITS[0].concepts[0].id, params: {}, bound: false };
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && saved.unit) { st.unit = String(saved.unit); st.concept = String(saved.concept || ''); st.params = saved.params && typeof saved.params === 'object' ? saved.params : {}; }
    } catch (_) { /* 저장값이 없으면 처음 단원부터 */ }
    let last = null;

    const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ unit: st.unit, concept: st.concept, params: st.params })); } catch (_) { /* 저장 공간이 없으면 넘어가요 */ } };

    function paramHtml(p, value) {
        const id = `mathp-${p.key}`;
        if (p.type === 'select') {
            return `<label class="mathviz-field" for="${id}"><span>${esc(p.label)}</span><select id="${id}" data-math-param="${p.key}">${p.options.map((o) => `<option value="${esc(o[0])}"${String(value) === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
        }
        if (p.type === 'text') {
            return `<label class="mathviz-field is-wide" for="${id}"><span>${esc(p.label)}</span><input id="${id}" type="text" data-math-param="${p.key}" value="${esc(value)}" maxlength="120"></label>`;
        }
        const step = p.type === 'int' ? 1 : 0.1;
        return `<label class="mathviz-field" for="${id}"><span>${esc(p.label)}</span>
            <span class="mathviz-stepper">
                <button type="button" data-math="step" data-key="${p.key}" data-d="-${step}" aria-label="${esc(p.label)} 줄이기">−</button>
                <input id="${id}" type="number" inputmode="decimal" data-math-param="${p.key}" value="${esc(value)}" min="${p.min}" max="${p.max}" step="${p.type === 'int' ? 1 : 'any'}">
                <button type="button" data-math="step" data-key="${p.key}" data-d="${step}" aria-label="${esc(p.label)} 늘리기">＋</button>
            </span></label>`;
    }

    /** 그림과 설명만 다시 그려요(숫자 칸에 적는 중에는 칸을 건드리지 않아요). */
    function draw() {
        const el = host();
        if (!el) return;
        last = renderMathConcept(st.unit, st.concept, st.params);
        const stage = el.querySelector('[data-math-stage]');
        if (stage) stage.innerHTML = last.svg;
    }

    function render() {
        const el = host();
        if (!el) return;
        bind();
        const { unit, concept } = findMathConcept(st.unit, st.concept);
        st.unit = unit.id;
        st.concept = concept.id;
        last = renderMathConcept(st.unit, st.concept, st.params);
        st.params = last.params;
        const term = unit.term;
        st.rendering = true;
        el.innerHTML = `<div class="mathviz">
            <div class="mathviz-side">
                <div class="mathviz-terms" role="tablist">${[1, 2].map((t) => `<button type="button" class="mathviz-term${t === term ? ' is-on' : ''}" data-math="term" data-term="${t}" role="tab" aria-selected="${t === term}">6학년 ${t}학기</button>`).join('')}</div>
                <div class="mathviz-units">${MATH_UNITS.filter((u) => u.term === term).map((u) => `<button type="button" class="mathviz-unit${u.id === unit.id ? ' is-on' : ''}" data-math="unit" data-unit="${u.id}"><b>${u.no}</b><span>${esc(u.name)}</span></button>`).join('')}</div>
            </div>
            <div class="mathviz-main">
                <div class="mathviz-concepts">${unit.concepts.map((c) => `<button type="button" class="mathviz-chip${c.id === concept.id ? ' is-on' : ''}" data-math="concept" data-concept="${c.id}">${esc(c.name)}</button>`).join('')}</div>
                <div class="mathviz-params">${concept.params.map((p) => paramHtml(p, st.params[p.key])).join('')}
                    <button type="button" class="mathviz-reset" data-math="reset">처음 값으로</button>
                </div>
                <div class="mathviz-stage" data-math-stage>${last.svg}</div>
                <div class="mathviz-actions">
                    <button type="button" class="mathviz-btn is-main" data-math="png">🖼️ 그림(PNG) 저장</button>
                    <button type="button" class="mathviz-btn" data-math="copy">📋 그림 복사</button>
                    <button type="button" class="mathviz-btn" data-math="svg">SVG 저장</button>
                    <button type="button" class="mathviz-btn" data-math="full">🔍 크게 보기</button>
                </div>
                <p class="mathviz-note">숫자를 바꾸면 그림이 바로 바뀌어요. 저장한 그림은 학습지·발표 자료에 붙여 쓸 수 있어요.</p>
            </div>
        </div>`;
        st.rendering = false;
        remember();
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

    function bind() {
        const el = host();
        if (!el || st.bound) return;
        st.bound = true;
        el.addEventListener('click', (e) => {
            const t = e.target.closest('[data-math]');
            if (!t || !el.contains(t)) return;
            const a = t.getAttribute('data-math');
            if (a === 'term') { const u = MATH_UNITS.find((x) => x.term === Number(t.getAttribute('data-term'))); if (u) { st.unit = u.id; st.concept = ''; st.params = {}; render(); } }
            else if (a === 'unit') { st.unit = t.getAttribute('data-unit'); st.concept = ''; st.params = {}; render(); }
            else if (a === 'concept') { st.concept = t.getAttribute('data-concept'); st.params = {}; render(); }
            else if (a === 'reset') { st.params = {}; render(); }
            else if (a === 'step') {
                const key = t.getAttribute('data-key');
                const d = Number(t.getAttribute('data-d')) || 0;
                st.params = { ...st.params, [key]: Math.round(((Number(st.params[key]) || 0) + d) * 1000) / 1000 };
                render();
            } else void act(a);
        });
        // 적는 동안에는 그림만 바꾸고, 다 적으면(칸을 벗어나면) 범위에 맞춘 값으로 칸도 고쳐요.
        el.addEventListener('input', (e) => {
            const t = e.target.closest('[data-math-param]');
            if (!t) return;
            st.params = { ...st.params, [t.getAttribute('data-math-param')]: t.value };
            draw();
            remember();
        });
        el.addEventListener('change', (e) => {
            const t = e.target.closest('[data-math-param]');
            if (!t || st.rendering) return; // 다시 그리는 중에 칸이 사라지며 나는 change 는 무시해요
            st.params = { ...st.params, [t.getAttribute('data-math-param')]: t.value };
            render();
        });
    }

    return { open: render, render };
}
