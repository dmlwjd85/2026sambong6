/**
 * 학급게시판 — 교사 발문·제한 시간·쪽지 제출·페이지 넘김·함께 보기.
 * 쪽지는 페이지별 맵으로 두어 문서 배열이 통째로 바뀌지 않게 합니다.
 */

export const CLASS_NOTE_TEXT_MAX = 160;
export const CLASS_BOARD_PROMPT_MAX = 120;
export const CLASS_BOARD_PAGE_MAX = 12;
export const CLASS_BOARD_NOTES_PER_PAGE = 40;
export const CLASS_BOARD_TIMER_MAX_SEC = 3600;
export const CLASS_NOTE_COLORS = Object.freeze(['yellow', 'pink', 'mint', 'sky', 'peach']);
export const CLASS_BOARD_CHEER_XP = 10;
export const CLASS_BOARD_CHEER_BONG = 1;

/** 학번(번호)마다 쪽지 색을 고정합니다. 1번부터 색 목록을 반복합니다. */
export function classNoteColorForStudent(studentId) {
    const raw = String(studentId || '').trim();
    const n = parseInt(raw.replace(/^[^\d]*/, ''), 10);
    if (Number.isFinite(n) && n > 0) {
        return CLASS_NOTE_COLORS[(n - 1) % CLASS_NOTE_COLORS.length];
    }
    let h = 0;
    Array.from(raw).forEach((ch) => { h += ch.charCodeAt(0); });
    return CLASS_NOTE_COLORS[Math.abs(h) % CLASS_NOTE_COLORS.length] || 'yellow';
}

const FIRST_PAGE_ID = 'pg_1';

function cleanLine(raw, max) {
    return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function clampInt(raw, min, max, fallback) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function makePage(id, index, prompt = '', now = 0) {
    return {
        id,
        index,
        createdAt: Math.max(0, Math.floor(Number(now) || 0)),
        prompt: cleanLine(prompt, CLASS_BOARD_PROMPT_MAX),
        notes: {},
    };
}

export function emptyClassBoard() {
    return {
        postingOpen: false,
        viewTogether: false,
        prompt: '',
        timerSeconds: 180,
        timerEndsAt: 0,
        currentPageId: FIRST_PAGE_ID,
        viewPageId: FIRST_PAGE_ID,
        focusNoteId: '',
        cheer: null,
        pages: {
            [FIRST_PAGE_ID]: makePage(FIRST_PAGE_ID, 1, '', 0),
        },
    };
}

export function sanitizeClassNote(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const studentId = String(raw.studentId || '').trim().slice(0, 20);
    if (!studentId) return null;
    const text = cleanLine(raw.text, CLASS_NOTE_TEXT_MAX);
    if (!text) return null;
    const id = String(raw.id || '').trim().slice(0, 40) || newId('n');
    const color = classNoteColorForStudent(studentId);
    const createdAt = Math.max(0, Math.floor(Number(raw.createdAt) || 0));
    const updatedAt = Math.max(createdAt, Math.floor(Number(raw.updatedAt) || createdAt));
    const name = cleanLine(raw.name, 24);
    return { id, studentId, name, text, color, createdAt, updatedAt };
}

function sanitizeNotesMap(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    const byStudent = new Map();
    Object.keys(src).forEach((key) => {
        const note = sanitizeClassNote(src[key] && typeof src[key] === 'object' ? { ...src[key], id: src[key].id || key } : null);
        if (!note) return;
        const prev = byStudent.get(note.studentId);
        if (prev && (Number(prev.updatedAt) || 0) >= note.updatedAt) return;
        if (prev) delete out[prev.id];
        byStudent.set(note.studentId, note);
        out[note.id] = note;
    });
    const kept = Object.values(out).sort((a, b) => (a.createdAt - b.createdAt) || String(a.id).localeCompare(String(b.id)));
    const trimmed = kept.slice(-CLASS_BOARD_NOTES_PER_PAGE);
    const map = {};
    trimmed.forEach((n) => { map[n.id] = n; });
    return map;
}

export function sanitizeClassPage(raw, fallbackIndex = 1) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.id || '').trim().slice(0, 40);
    if (!id) return null;
    const index = clampInt(raw.index, 1, CLASS_BOARD_PAGE_MAX, fallbackIndex);
    const createdAt = Math.max(0, Math.floor(Number(raw.createdAt) || 0));
    const prompt = cleanLine(raw.prompt, CLASS_BOARD_PROMPT_MAX);
    const notesSrc = raw.notes && typeof raw.notes === 'object' && !Array.isArray(raw.notes)
        ? raw.notes
        : (Array.isArray(raw.notes)
            ? Object.fromEntries(raw.notes.map((n, i) => [String((n && n.id) || `n${i}`), n]))
            : {});
    return { id, index, createdAt, prompt, notes: sanitizeNotesMap(notesSrc) };
}

function pagesFromRaw(rawPages) {
    const out = {};
    if (Array.isArray(rawPages)) {
        rawPages.forEach((row, i) => {
            const page = sanitizeClassPage(row, i + 1);
            if (page) out[page.id] = page;
        });
        return out;
    }
    const src = rawPages && typeof rawPages === 'object' ? rawPages : {};
    Object.keys(src).forEach((key) => {
        const row = src[key];
        const page = sanitizeClassPage(row && typeof row === 'object' ? { ...row, id: (row && row.id) || key } : null, 1);
        if (page) out[page.id] = page;
    });
    return out;
}

export function classBoardPagesList(state) {
    const board = state && state.pages ? state : sanitizeClassBoard(state);
    return Object.values(board.pages || {}).sort((a, b) => (a.index - b.index) || String(a.id).localeCompare(String(b.id)));
}

function pageHasNotes(page) {
    return !!(page && page.notes && Object.keys(page.notes).length);
}

/** 빈 중간 쪽을 버리고 번호를 1부터 다시 매깁니다. 제출 중인 마지막 빈 쪽만 남깁니다. */
function compactClassBoardPages(pages, currentPageId, viewPageId) {
    const curId = String(currentPageId || '');
    const viewId = String(viewPageId || '');
    const list = Object.values(pages || {}).sort((a, b) => (
        (Number(a.index) - Number(b.index))
        || (Number(a.createdAt) - Number(b.createdAt))
        || String(a.id).localeCompare(String(b.id))
    ));
    if (!list.length) {
        const p = makePage(FIRST_PAGE_ID, 1, '', 0);
        return { pages: { [p.id]: p }, currentPageId: p.id, viewPageId: p.id };
    }
    const kept = [];
    list.forEach((p, i) => {
        const empty = !pageHasNotes(p);
        const isLast = i === list.length - 1;
        if (empty && kept.length) {
            if (!isLast) return;
            if (p.id !== curId && p.id !== viewId) return;
        }
        kept.push(p);
    });
    if (!kept.length) kept.push(list[0]);
    const map = {};
    kept.forEach((p, i) => {
        map[p.id] = { ...p, index: i + 1 };
    });
    const ids = new Set(Object.keys(map));
    const nextCurrent = ids.has(curId) ? curId : kept[kept.length - 1].id;
    const nextView = ids.has(viewId) ? viewId : nextCurrent;
    return { pages: map, currentPageId: nextCurrent, viewPageId: nextView };
}

function ensurePages(pages, prompt = '') {
    if (pages && Object.keys(pages).length) return pages;
    return { [FIRST_PAGE_ID]: makePage(FIRST_PAGE_ID, 1, prompt, 0) };
}

export function sanitizeClassBoard(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    let pages = ensurePages(pagesFromRaw(src.pages), cleanLine(src.prompt, CLASS_BOARD_PROMPT_MAX));
    let list = classBoardPagesList({ pages });
    if (list.length > CLASS_BOARD_PAGE_MAX) {
        list = list.slice(0, CLASS_BOARD_PAGE_MAX);
        const kept = {};
        list.forEach((p) => { kept[p.id] = p; });
        pages = kept;
    }
    if (!list.length) {
        pages = { [FIRST_PAGE_ID]: makePage(FIRST_PAGE_ID, 1, '', 0) };
        list = [pages[FIRST_PAGE_ID]];
    }
    const compacted = compactClassBoardPages(pages, src.currentPageId, src.viewPageId);
    pages = compacted.pages;
    list = classBoardPagesList({ pages });
    const currentPageId = compacted.currentPageId;
    const viewPageId = compacted.viewPageId;
    const viewPage = pages[viewPageId] || pages[currentPageId];
    const noteIds = new Set(Object.keys((viewPage && viewPage.notes) || {}));
    const focusNoteId = noteIds.has(String(src.focusNoteId || '')) ? String(src.focusNoteId) : '';
    const cheerSrc = src.cheer && typeof src.cheer === 'object' && !Array.isArray(src.cheer) ? src.cheer : null;
    const cheerSid = cheerSrc ? String(cheerSrc.studentId || '').trim().slice(0, 20) : '';
    const cheer = cheerSid ? {
        studentId: cheerSid,
        noteId: String(cheerSrc.noteId || '').trim().slice(0, 40),
        at: Math.max(0, Math.floor(Number(cheerSrc.at) || 0)),
        token: String(cheerSrc.token || '').trim().slice(0, 40),
    } : null;
    return {
        postingOpen: src.postingOpen === true,
        viewTogether: src.viewTogether === true,
        prompt: cleanLine(src.prompt, CLASS_BOARD_PROMPT_MAX),
        timerSeconds: clampInt(src.timerSeconds, 0, CLASS_BOARD_TIMER_MAX_SEC, 180),
        timerEndsAt: Math.max(0, Math.floor(Number(src.timerEndsAt) || 0)),
        currentPageId,
        viewPageId,
        focusNoteId,
        cheer,
        pages,
    };
}

export function currentClassBoardPage(state) {
    const board = sanitizeClassBoard(state);
    return board.pages[board.currentPageId] || classBoardPagesList(board)[0] || null;
}

export function viewedClassBoardPage(state) {
    const board = sanitizeClassBoard(state);
    return board.pages[board.viewPageId] || board.pages[board.currentPageId] || null;
}

export function classBoardNotesList(pageOrState) {
    const page = pageOrState && pageOrState.notes
        ? pageOrState
        : viewedClassBoardPage(pageOrState);
    const notes = page && page.notes && typeof page.notes === 'object' ? page.notes : {};
    return Object.values(notes).sort((a, b) => (a.createdAt - b.createdAt) || String(a.id).localeCompare(String(b.id)));
}

export function classBoardPromptForView(state) {
    const board = sanitizeClassBoard(state);
    const page = viewedClassBoardPage(board);
    if (page && page.id !== board.currentPageId && page.prompt) return page.prompt;
    return board.prompt || (page && page.prompt) || '';
}

export function classBoardRemainingMs(state, now = Date.now()) {
    const board = sanitizeClassBoard(state);
    if (!board.timerEndsAt) return board.postingOpen ? Infinity : 0;
    return Math.max(0, board.timerEndsAt - Number(now || 0));
}

export function classBoardCanWrite(state, now = Date.now()) {
    const board = sanitizeClassBoard(state);
    if (!board.postingOpen || board.viewTogether) return false;
    if (!board.timerEndsAt) return true;
    return Number(now || 0) < board.timerEndsAt;
}

export function classBoardNoteExcerpt(note, max = 80) {
    const text = cleanLine(note && note.text, CLASS_NOTE_TEXT_MAX);
    const chars = Array.from(text);
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

export function startClassBoardPrompt(state, { prompt, seconds } = {}, now = Date.now()) {
    const next = sanitizeClassBoard(state);
    const text = cleanLine(prompt, CLASS_BOARD_PROMPT_MAX);
    if (!text) return next;
    const sec = clampInt(seconds, 0, CLASS_BOARD_TIMER_MAX_SEC, next.timerSeconds);
    next.prompt = text;
    next.timerSeconds = sec;
    next.timerEndsAt = sec > 0 ? Math.max(0, Math.floor(Number(now) || 0)) + (sec * 1000) : 0;
    next.postingOpen = true;
    next.viewTogether = false;
    next.focusNoteId = '';
    const page = next.pages[next.currentPageId];
    if (page && Object.keys(page.notes || {}).length === 0) {
        page.prompt = text;
    }
    next.viewPageId = next.currentPageId;
    return next;
}

export function setClassBoardViewTogether(state, on) {
    const next = sanitizeClassBoard(state);
    next.viewTogether = !!on;
    if (next.viewTogether) next.focusNoteId = next.focusNoteId || '';
    return next;
}

export function setClassBoardViewPage(state, pageId) {
    const next = sanitizeClassBoard(state);
    const id = String(pageId || '');
    if (!next.pages[id]) return next;
    next.viewPageId = id;
    if (next.focusNoteId && !next.pages[id].notes[next.focusNoteId]) next.focusNoteId = '';
    return next;
}

export function turnClassBoardPage(state, now = Date.now()) {
    const next = sanitizeClassBoard(state);
    const list = classBoardPagesList(next);
    const last = list[list.length - 1];
    // 마지막 쪽이 비어 있으면 새 번호를 만들지 않고 그 쪽으로 갑니다.
    if (last && !pageHasNotes(last)) {
        last.prompt = next.prompt || last.prompt;
        next.currentPageId = last.id;
        next.viewPageId = last.id;
        next.focusNoteId = '';
        return next;
    }
    if (list.length >= CLASS_BOARD_PAGE_MAX) return next;
    const page = makePage(newId('pg'), list.length + 1, next.prompt, now);
    next.pages[page.id] = page;
    next.currentPageId = page.id;
    next.viewPageId = page.id;
    next.focusNoteId = '';
    return next;
}

export function submitClassNote(state, raw, now = Date.now()) {
    const next = sanitizeClassBoard(state);
    if (!classBoardCanWrite(next, now)) return next;
    const page = next.pages[next.currentPageId];
    if (!page) return next;
    const studentId = String(raw && raw.studentId || '').trim().slice(0, 20);
    if (!studentId) return next;
    const existing = Object.values(page.notes || {}).find((n) => n.studentId === studentId) || null;
    const stamp = Math.max(0, Math.floor(Number(now) || 0));
    const note = sanitizeClassNote({
        ...(existing || {}),
        ...(raw || {}),
        id: existing ? existing.id : (raw && raw.id) || newId('n'),
        studentId,
        createdAt: existing ? existing.createdAt : stamp,
        updatedAt: stamp,
    });
    if (!note) return next;
    const nextNotes = { ...(page.notes || {}) };
    if (existing && existing.id !== note.id) delete nextNotes[existing.id];
    nextNotes[note.id] = note;
    const kept = Object.values(nextNotes)
        .sort((a, b) => (a.createdAt - b.createdAt) || String(a.id).localeCompare(String(b.id)))
        .slice(-CLASS_BOARD_NOTES_PER_PAGE);
    page.notes = {};
    kept.forEach((n) => { page.notes[n.id] = n; });
    next.viewPageId = next.currentPageId;
    return next;
}

export function setClassBoardFocus(state, noteId) {
    const next = sanitizeClassBoard(state);
    const id = String(noteId || '');
    for (const page of classBoardPagesList(next)) {
        if (page.notes && page.notes[id]) {
            next.viewPageId = page.id;
            next.focusNoteId = id;
            return next;
        }
    }
    next.focusNoteId = '';
    return next;
}

export function clearClassBoardFocus(state) {
    const next = sanitizeClassBoard(state);
    next.focusNoteId = '';
    return next;
}

export function closeClassBoardPosting(state) {
    const next = sanitizeClassBoard(state);
    next.postingOpen = false;
    next.viewTogether = false;
    next.timerEndsAt = 0;
    next.focusNoteId = '';
    return next;
}

export function clearClassBoard(state) {
    const prev = sanitizeClassBoard(state);
    const next = emptyClassBoard();
    next.timerSeconds = prev.timerSeconds;
    return next;
}

export function classBoardFocusNote(state) {
    const board = sanitizeClassBoard(state);
    if (!board.focusNoteId) return null;
    const page = viewedClassBoardPage(board);
    return (page && page.notes && page.notes[board.focusNoteId]) || null;
}

/** 따봉: 해당 쪽지 작성자에게 팡파레를 보냅니다. 경험치·봉 지급은 화면에서 이어서 합니다. */
export function cheerClassBoardNote(state, noteId, now = Date.now()) {
    const next = setClassBoardFocus(state, noteId);
    const note = classBoardFocusNote(next);
    if (!note) return next;
    next.cheer = {
        studentId: note.studentId,
        noteId: note.id,
        at: Math.max(0, Math.floor(Number(now) || 0)),
        token: newId('ch'),
    };
    return next;
}
