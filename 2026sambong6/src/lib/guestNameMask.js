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

/** 이름 안 빈칸을 빼서 비교·검색용으로 맞춰요. '윤 지아'와 '윤지아'를 같게 봐요. */
export function compactGuestMaskName(raw) {
    return String(raw == null ? '' : raw).trim().replace(/\s+/g, '');
}

/** 성+이름 사이에서 두 글자 이름을 꺼내요. 한글 3글자(성 1+이름 2)·4글자(성 2+이름 2)만 봐요. */
export function givenNameFromFullName(full) {
    const n = compactGuestMaskName(full);
    if (!/^[가-힣]+$/.test(n)) return '';
    if (n.length === 3 || n.length === 4) return n.slice(-2);
    return '';
}

/**
 * 이름만 따로 나왔을 때, 보통 말과 겹치면 잘못 가릴 수 있어서 빼는 두 글자 낱말이에요.
 * (상태메시지에 자주 쓰는 말만 넣었어요.)
 */
export const GIVEN_NAME_DENYLIST = new Set([
    '최고', '오늘', '내일', '어제', '진짜', '대박', '행복', '친구',
    '사랑', '우리', '모두', '같이', '공부', '시험', '학교', '수업',
    '숙제', '점심', '아침', '저녁', '주말', '생일', '축하', '힘내',
    '감사', '미안', '제발', '이제', '다시', '조금', '많이', '너무',
    '완전', '좋은', '기분', '지금', '이번', '다음', '항상', '계속',
    '약속', '지각', '결석', '출석', '운동', '게임',
]);

/** 성+이름 목록에서, 가려도 오탐이 적을 두 글자 이름만 모아요. */
export function givenNamesForMask(fullNames, { staffNames = [] } = {}) {
    const staff = new Set((staffNames || []).map((n) => compactGuestMaskName(n)).filter(Boolean));
    const out = new Set();
    (Array.isArray(fullNames) ? fullNames : []).forEach((full) => {
        const g = givenNameFromFullName(full);
        if (g.length !== 2 || GIVEN_NAME_DENYLIST.has(g) || staff.has(g) || g === '손님') return;
        out.add(g);
    });
    return [...out].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * 글 속에서 찾아 가릴 학생 이름 목록을 만들어요.
 * 명단(roster, 쉬는 학생 포함)·이름표(STUDENT_NAMES)·학생 문서의 name을 모으고,
 * 교사 이름과 '손님', 한 글자 이름, 자리 이름은 빼요. 이름 안 빈칸은 빼고, 긴 이름부터 찾도록 정렬해요.
 */
export function collectGuestMaskNames({ roster = [], nameMap = {}, students = [], staffNames = [] } = {}) {
    const staff = new Set((staffNames || []).map((n) => compactGuestMaskName(n)).filter(Boolean));
    const out = new Set();
    const add = (raw) => {
        const n = compactGuestMaskName(raw);
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

/** 글자 사이에 빈칸이 있어도 찾도록 식을 만들어요. */
function spacedNamePattern(name) {
    return [...name].map(escapeRegExp).join('\\s*');
}

/**
 * 이름 목록으로 찾기 식을 만들어요. 이름이 없으면 null이에요.
 * 성+이름은 글자 사이 빈칸을 허용하고('윤 지아'), 두 글자 이름은 한글 낱말 안에서만 따로 찾아요.
 */
export function buildGuestNameRegExp(names) {
    const list = [...new Set((Array.isArray(names) ? names : [])
        .map((n) => compactGuestMaskName(n))
        .filter((n) => n.length >= 2))];
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => b.length - a.length || a.localeCompare(b));
    const patterns = sorted.map((n) => spacedNamePattern(n));
    const given = givenNamesForMask(sorted).filter((g) => !list.includes(g));
    given.forEach((g) => {
        // 앞뒤에 한글이 이어지면('지아야', '현수막') 보통 말일 수 있어 가리지 않아요.
        patterns.push(`(?<![가-힣])${spacedNamePattern(g)}(?![가-힣])`);
    });
    return new RegExp(patterns.join('|'), 'g');
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
