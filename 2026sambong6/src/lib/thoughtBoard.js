/**
 * 생각게시판 — 학급 포스트잇 게시·질문카드·비공개 공감.
 * 그림은 JPEG data URL만 짧게 받습니다(문서 크기 보호).
 */

export const THINK_TEXT_MAX = 280;
export const THINK_QUESTION_MAX = 80;
export const THINK_POST_MAX = 40;
export const THINK_QUESTION_LIST_MAX = 8;
export const THINK_DRAW_MAX = 24000;
export const THINK_NOTE_COLORS = Object.freeze(['yellow', 'pink', 'mint', 'sky', 'peach']);

function cleanLine(raw, max) {
    return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyThoughtBoard() {
    return {
        postingOpen: false,
        empathyPublic: false,
        viewMode: 'board',
        focusPostId: '',
        questions: [],
        activeQuestionId: '',
        posts: [],
        empathy: {},
    };
}

export function sanitizeDrawingDataUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.length > THINK_DRAW_MAX) return '';
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(s)) return '';
    return s;
}

export function sanitizeThoughtQuestion(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const text = cleanLine(raw.text, THINK_QUESTION_MAX);
    if (!text) return null;
    const id = String(raw.id || '').trim().slice(0, 40) || newId('q');
    const createdAt = Math.max(0, Math.floor(Number(raw.createdAt) || 0));
    return { id, text, createdAt };
}

export function sanitizeThoughtPost(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const studentId = String(raw.studentId || '').trim().slice(0, 20);
    if (!studentId) return null;
    const text = cleanLine(raw.text, THINK_TEXT_MAX);
    const drawing = sanitizeDrawingDataUrl(raw.drawing);
    if (!text && !drawing) return null;
    const id = String(raw.id || '').trim().slice(0, 40) || newId('p');
    const color = THINK_NOTE_COLORS.includes(raw.color) ? raw.color : 'yellow';
    const questionId = String(raw.questionId || '').trim().slice(0, 40);
    const createdAt = Math.max(0, Math.floor(Number(raw.createdAt) || 0));
    const name = cleanLine(raw.name, 24);
    /** 붙일 때는 비공개. 선생님이 개별·전체 공개해야 반에 보입니다. */
    const isPublic = raw.isPublic === true;
    return { id, studentId, name, text, drawing, color, questionId, createdAt, isPublic };
}

function sanitizeEmpathyMap(raw, postIds) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const allowed = new Set(postIds);
    const out = {};
    Object.keys(src).forEach((voter) => {
        const sid = String(voter || '').trim().slice(0, 20);
        const postId = String(src[voter] || '').trim().slice(0, 40);
        if (!sid || !postId || !allowed.has(postId)) return;
        out[sid] = postId;
    });
    return out;
}

export function sanitizeThoughtBoard(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const questions = [];
    const qSeen = new Set();
    const questionRows = Array.isArray(src.questions) ? src.questions : [];
    for (let i = 0; i < questionRows.length; i++) {
        const q = sanitizeThoughtQuestion(questionRows[i]);
        if (!q || qSeen.has(q.id)) continue;
        qSeen.add(q.id);
        questions.push(q);
        if (questions.length >= THINK_QUESTION_LIST_MAX) break;
    }
    const posts = [];
    const pSeen = new Set();
    (Array.isArray(src.posts) ? src.posts : []).forEach((row) => {
        const p = sanitizeThoughtPost(row);
        if (!p || pSeen.has(p.id)) return;
        pSeen.add(p.id);
        posts.push(p);
    });
    posts.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    const kept = posts.slice(-THINK_POST_MAX);
    const postIds = kept.map((p) => p.id);
    const activeQuestionId = questions.some((q) => q.id === String(src.activeQuestionId || ''))
        ? String(src.activeQuestionId)
        : '';
    const viewMode = src.viewMode === 'post' ? 'post' : 'board';
    const focusPostId = postIds.includes(String(src.focusPostId || '')) ? String(src.focusPostId) : '';
    return {
        postingOpen: src.postingOpen === true,
        empathyPublic: src.empathyPublic === true,
        viewMode: viewMode === 'post' && focusPostId ? 'post' : 'board',
        focusPostId: viewMode === 'post' ? focusPostId : '',
        questions,
        activeQuestionId,
        posts: kept,
        empathy: sanitizeEmpathyMap(src.empathy, postIds),
    };
}

export function thoughtPostExcerpt(post, max = 42) {
    const text = cleanLine(post && post.text, THINK_TEXT_MAX);
    if (text) {
        const chars = Array.from(text);
        return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
    }
    return post && post.drawing ? '그림' : '';
}

export function empathyCounts(state) {
    const board = sanitizeThoughtBoard(state);
    const counts = {};
    board.posts.forEach((p) => { counts[p.id] = 0; });
    Object.values(board.empathy).forEach((postId) => {
        if (counts[postId] !== undefined) counts[postId] += 1;
    });
    return counts;
}

/** 공감이 공개되고 1표 이상일 때 최다 공감 카드 id */
export function glowingThoughtPostIds(state) {
    const board = sanitizeThoughtBoard(state);
    if (!board.empathyPublic) return [];
    const counts = empathyCounts(board);
    let max = 0;
    Object.values(counts).forEach((n) => { if (n > max) max = n; });
    if (max < 1) return [];
    return board.posts.filter((p) => counts[p.id] === max).map((p) => p.id);
}

export function setThoughtPostingOpen(state, open) {
    const next = sanitizeThoughtBoard(state);
    next.postingOpen = !!open;
    return next;
}

export function setThoughtEmpathyPublic(state, on) {
    const next = sanitizeThoughtBoard(state);
    next.empathyPublic = !!on;
    return next;
}

export function setThoughtFocus(state, postId) {
    const next = sanitizeThoughtBoard(state);
    const id = String(postId || '');
    if (!id || !next.posts.some((p) => p.id === id)) {
        next.viewMode = 'board';
        next.focusPostId = '';
        return next;
    }
    next.viewMode = 'post';
    next.focusPostId = id;
    return next;
}

export function clearThoughtFocus(state) {
    const next = sanitizeThoughtBoard(state);
    next.viewMode = 'board';
    next.focusPostId = '';
    return next;
}

export function addThoughtQuestion(state, text) {
    const next = sanitizeThoughtBoard(state);
    const q = sanitizeThoughtQuestion({ id: newId('q'), text, createdAt: Date.now() });
    if (!q) return next;
    next.questions = [...next.questions, q].slice(-THINK_QUESTION_LIST_MAX);
    next.activeQuestionId = q.id;
    return next;
}

export function setActiveThoughtQuestion(state, questionId) {
    const next = sanitizeThoughtBoard(state);
    next.activeQuestionId = next.questions.some((q) => q.id === String(questionId || ''))
        ? String(questionId)
        : '';
    return next;
}

export function addThoughtPost(state, raw) {
    const next = sanitizeThoughtBoard(state);
    const post = sanitizeThoughtPost({
        ...raw,
        id: raw && raw.id ? raw.id : newId('p'),
        createdAt: raw && raw.createdAt ? raw.createdAt : Date.now(),
        // 새로 붙인 글은 항상 비공개. 선생님이 개별·전체 공개합니다.
        isPublic: false,
    });
    if (!post) return next;
    next.posts = [...next.posts.filter((p) => p.id !== post.id), post].slice(-THINK_POST_MAX);
    return next;
}

/** 한 장만 공개하거나 다시 가립니다. */
export function setThoughtPostPublic(state, postId, isPublic) {
    const next = sanitizeThoughtBoard(state);
    const id = String(postId || '');
    next.posts = next.posts.map((p) => (p.id === id ? { ...p, isPublic: !!isPublic } : p));
    return next;
}

/** 붙여 둔 생각을 모두 반에 공개합니다. */
export function publishAllThoughtPosts(state) {
    const next = sanitizeThoughtBoard(state);
    next.posts = next.posts.map((p) => ({ ...p, isPublic: true }));
    return next;
}

/**
 * 학생은 공개된 글과 자기 글만 보고, 선생님은 비공개 글도 봅니다.
 * 전체화면 공유(TV)는 공개된 글만 보여 반 전체가 같은 화면을 봅니다.
 */
export function visibleThoughtPosts(state, { viewerId, isAdmin, follower } = {}) {
    const board = sanitizeThoughtBoard(state);
    const sid = String(viewerId || '').trim();
    return board.posts.filter((p) => {
        if (p.isPublic) return true;
        if (follower) return false;
        if (isAdmin) return true;
        return !!(sid && p.studentId === sid);
    });
}

/** 한 학생은 공감 1표. 같은 카드를 다시 누르면 취소. */
export function toggleThoughtEmpathy(state, voterId, postId) {
    const next = sanitizeThoughtBoard(state);
    const sid = String(voterId || '').trim().slice(0, 20);
    const pid = String(postId || '').trim().slice(0, 40);
    if (!sid || !next.posts.some((p) => p.id === pid)) return next;
    if (next.empathy[sid] === pid) delete next.empathy[sid];
    else next.empathy[sid] = pid;
    return next;
}

export function clearThoughtBoardPosts(state) {
    const next = sanitizeThoughtBoard(state);
    next.posts = [];
    next.empathy = {};
    next.viewMode = 'board';
    next.focusPostId = '';
    return next;
}

export function activeThoughtQuestion(state) {
    const board = sanitizeThoughtBoard(state);
    return board.questions.find((q) => q.id === board.activeQuestionId) || null;
}
