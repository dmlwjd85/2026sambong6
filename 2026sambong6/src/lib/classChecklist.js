/**
 * 퀘스트 체크리스트. 제목을 달아 만들고, 번호 칸을 누르면 제출로 바뀝니다.
 */

export const CHECKLIST_XP = 20;
export const CHECKLIST_BONG = 2;

function cleanTitle(title) {
    return String(title || '').trim().slice(0, 40);
}

export function sanitizeChecklists(raw) {
    const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
    return items.map((item) => {
        const id = String(item && item.id || '').trim();
        const title = cleanTitle(item && item.title);
        if (!id || !title) return null;
        const marks = {};
        const src = item && item.marks && typeof item.marks === 'object' ? item.marks : {};
        Object.keys(src).forEach((sid) => {
            if (src[sid]) marks[String(sid)] = true;
        });
        return { id, title, marks };
    }).filter(Boolean).slice(0, 30);
}

export function createChecklist(items, title, id) {
    const name = cleanTitle(title);
    const nextId = String(id || '').trim();
    if (!name) return { ok: false, reason: 'title' };
    if (!nextId) return { ok: false, reason: 'id' };
    const list = sanitizeChecklists(items);
    if (list.length >= 30) return { ok: false, reason: 'limit' };
    list.push({ id: nextId, title: name, marks: {} });
    return { ok: true, items: list };
}

export function deleteChecklist(items, id) {
    const key = String(id || '');
    const list = sanitizeChecklists(items).filter((item) => item.id !== key);
    return { ok: true, items: list };
}

/** 번호를 누르면 제출 완료. 다시 누르면 제출을 취소하고 보상을 되돌립니다. */
export function toggleChecklistNumber(items, checklistId, studentId) {
    const list = sanitizeChecklists(items);
    const id = String(checklistId || '');
    const sid = String(studentId || '');
    const idx = list.findIndex((item) => item.id === id);
    if (idx < 0 || !sid) return { ok: false, reason: 'missing' };
    const item = list[idx];
    const marks = { ...item.marks };
    const marked = !marks[sid];
    if (marked) marks[sid] = true;
    else delete marks[sid];
    list[idx] = { ...item, marks };
    return {
        ok: true,
        items: list,
        marked,
        xpDelta: marked ? CHECKLIST_XP : -CHECKLIST_XP,
        bongDelta: marked ? CHECKLIST_BONG : -CHECKLIST_BONG,
    };
}
