/**
 * 손님 모드('구경만 하기')에서 학생 실명을 가리는 도구예요.
 *
 * - 화면에는 실명 대신 가린 글자(○○○)를 그리고, CSS로 흐릿하게 보이게 해요.
 * - 로그인한 학생·교사에게는 아무것도 바꾸지 않아요(isGuest가 아닐 때는 그대로 돌려줘요).
 * - 손님 판별은 기존 playerState.isGuest를 그대로 써요.
 */

/** 실명 자리에 그리는 가린 글자예요. */
export const GUEST_NAME_MASK = '○○○';

/** 가린 글자를 감싸는 span의 class예요(흐림 효과는 index.css). */
export const GUEST_NAME_MASK_CLASS = 'guest-name-mask';

/** 학생이 아닌 id(교사·보조 교사·손님)예요. 이 id의 이름은 가리지 않아요. */
const NON_STUDENT_IDS = new Set(['gm', 'gm_a', 'guest']);

/** 기존 손님 판별(playerState.isGuest)을 그대로 써요. */
export function isGuestViewer(state) {
    return !!(state && state.isGuest);
}

export function isStudentNameId(id) {
    const sid = String(id == null ? '' : id).trim();
    return !!sid && !NON_STUDENT_IDS.has(sid);
}

/**
 * 학생 이름 하나를 화면용으로 돌려줘요.
 * 손님이면 학생 id의 이름은 가린 글자로, 아니면 원래 이름 그대로예요.
 */
export function displayStudentNameFor(id, { names = {}, isGuest = false, fallback } = {}) {
    const sid = String(id == null ? '' : id).trim();
    const real = (names && names[sid]) || fallback || sid;
    if (isGuest && isStudentNameId(sid)) return GUEST_NAME_MASK;
    return real;
}

/** '학생 3'처럼 빈 학급의 자리 이름은 실명이 아니라서 글 속에서 찾지 않아요. */
function isPlaceholderName(name) {
    return /^학생\s*\d+$/.test(name) || /^\d+번?$/.test(name);
}

/**
 * 글 속에서 찾아 가릴 학생 이름 목록을 만들어요.
 * 명단(roster, 쉬는 학생 포함)·이름표(STUDENT_NAMES)·학생 문서의 name을 모으고,
 * 교사 이름과 '손님', 한 글자 이름, 자리 이름은 빼요. 긴 이름부터 찾도록 정렬해요.
 */
export function collectGuestMaskNames({ roster = [], nameMap = {}, students = [], staffNames = [] } = {}) {
    const staff = new Set((staffNames || []).map((n) => String(n || '').trim()).filter(Boolean));
    const out = new Set();
    const add = (raw) => {
        const n = String(raw == null ? '' : raw).trim();
        if (n.length < 2 || n === '손님' || staff.has(n) || isPlaceholderName(n)) return;
        out.add(n);
    };
    (Array.isArray(roster) ? roster : []).forEach((r) => {
        if (r && isStudentNameId(r.id)) add(r.name);
    });
    Object.keys(nameMap || {}).forEach((id) => {
        if (isStudentNameId(id)) add(nameMap[id]);
    });
    (Array.isArray(students) ? students : []).forEach((s) => {
        if (s && isStudentNameId(s.id)) add(s.name);
    });
    return [...out].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 이름 목록으로 찾기 식을 만들어요. 이름이 없으면 null이에요. */
export function buildGuestNameRegExp(names) {
    const list = (Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n.length >= 2);
    if (!list.length) return null;
    const sorted = [...new Set(list)].sort((a, b) => b.length - a.length);
    return new RegExp(sorted.map(escapeRegExp).join('|'), 'g');
}

/** 글 속 학생 이름을 가린 글자로 바꿔요(상태메시지·기록 문구 등). */
export function maskNamesInText(text, re) {
    const s = String(text == null ? '' : text);
    if (!re || !s) return s;
    re.lastIndex = 0;
    return s.replace(re, GUEST_NAME_MASK);
}

/** 가린 글자가 든 글을 [보통 글, 가린 글자] 조각으로 나눠요(흐림 span을 씌울 때 써요). */
export function splitMaskedText(text) {
    const s = String(text == null ? '' : text);
    const parts = [];
    let i = 0;
    while (i < s.length) {
        const j = s.indexOf(GUEST_NAME_MASK, i);
        if (j < 0) { parts.push({ mask: false, text: s.slice(i) }); break; }
        if (j > i) parts.push({ mask: false, text: s.slice(i, j) });
        parts.push({ mask: true, text: GUEST_NAME_MASK });
        i = j + GUEST_NAME_MASK.length;
    }
    return parts;
}

/** 이 태그 안의 글은 span으로 나누지 않아요(글자만 바꿔요). */
const NO_WRAP_TAGS = new Set(['OPTION', 'TEXTAREA', 'TITLE', 'SCRIPT', 'STYLE', 'NOSCRIPT']);
/** 이 태그 안은 아예 보지 않아요. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

/**
 * 손님 화면 지킴이: 문서 전체를 훑고, 뒤에 그려지는 것도 지켜봐서
 * 글·속성(title, aria-label, alt 등)·입력값에 남은 학생 실명을 가린 글자로 바꾸고,
 * 가린 글자에는 흐림 span을 씌워요. MutationObserver 콜백은 화면을 그리기 전에 돌아서
 * 실명이 화면에 찍히지 않아요.
 *
 * @param {Document} doc
 * @param {{ getNames: () => string[], isActive: () => boolean }} opts
 * @returns {{ stop: () => void, scan: () => void } | null}
 */
export function installGuestNameShield(doc, { getNames, isActive } = {}) {
    if (!doc || !doc.documentElement || typeof getNames !== 'function') return null;
    const win = doc.defaultView || globalThis;
    const MO = win.MutationObserver;
    const ELEMENT = 1;
    const TEXT = 3;
    let key = '';
    let re = null;
    const refreshNames = () => {
        let names = [];
        try { names = getNames() || []; } catch (_) { names = []; }
        const k = names.join('\u0001');
        if (k !== key) { key = k; re = buildGuestNameRegExp(names); }
    };
    const has = (s) => { if (!re || !s) return false; re.lastIndex = 0; return re.test(s); };

    const inMaskSpan = (el) => !!(el && el.classList && el.classList.contains(GUEST_NAME_MASK_CLASS));
    const skipped = (el) => {
        for (let p = el; p; p = p.parentElement) if (SKIP_TAGS.has(p.tagName)) return true;
        return false;
    };

    const fixText = (node) => {
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return;
        let v = node.nodeValue || '';
        if (has(v)) { v = maskNamesInText(v, re); node.nodeValue = v; }
        if (v.indexOf(GUEST_NAME_MASK) < 0 || inMaskSpan(parent) || NO_WRAP_TAGS.has(parent.tagName)) return;
        const frag = doc.createDocumentFragment();
        splitMaskedText(v).forEach((p) => {
            if (!p.mask) { frag.appendChild(doc.createTextNode(p.text)); return; }
            const span = doc.createElement('span');
            span.className = GUEST_NAME_MASK_CLASS;
            span.setAttribute('aria-label', '가린 이름');
            span.textContent = p.text;
            frag.appendChild(span);
        });
        parent.replaceChild(frag, node);
    };

    const fixAttrs = (el) => {
        if (SKIP_TAGS.has(el.tagName)) return;
        const attrs = el.attributes;
        for (let i = 0; attrs && i < attrs.length; i += 1) {
            const a = attrs[i];
            if (a.name === 'class' || a.name === 'style') continue;
            if (has(a.value)) el.setAttribute(a.name, maskNamesInText(a.value, re));
        }
        if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && has(el.value)) {
            el.value = maskNamesInText(el.value, re);
        }
    };

    const walk = (root) => {
        if (!root) return;
        if (root.nodeType === TEXT) { fixText(root); return; }
        if (root.nodeType !== ELEMENT) return;
        if (skipped(root)) return;
        const texts = [];
        const els = [root];
        const w = doc.createTreeWalker(root, 1 | 4);
        let n = w.nextNode();
        while (n) {
            if (n.nodeType === TEXT) texts.push(n);
            else if (!SKIP_TAGS.has(n.tagName)) els.push(n);
            n = w.nextNode();
        }
        els.forEach(fixAttrs);
        texts.forEach(fixText);
    };

    const active = () => (typeof isActive === 'function' ? !!isActive() : true);
    const scan = () => {
        if (!active()) return;
        refreshNames();
        walk(doc.documentElement);
    };

    let mo = null;
    if (MO) {
        mo = new MO((records) => {
            if (!active()) return;
            refreshNames();
            for (const r of records) {
                if (r.type === 'childList') r.addedNodes.forEach((n) => { if (n.isConnected) walk(n); });
                else if (r.type === 'characterData') { if (r.target.isConnected) fixText(r.target); }
                else if (r.type === 'attributes') { if (r.target.isConnected && r.target.nodeType === ELEMENT) fixAttrs(r.target); }
            }
        });
        mo.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
    }
    scan();
    return {
        scan,
        stop: () => { if (mo) mo.disconnect(); },
    };
}
