/**
 * 받은 추천·비추천 사유함. artifacts/{학급}/peerFeedback/{학번} 문서 하나에 최근 기록을 모읍니다.
 * 광장(public)과 따로 두어 공개 읽기 와일드카드에 걸리지 않습니다.
 * 화면에서는 받은 학생 본인과 선생님(마스터)만 엽니다.
 */

export const FEEDBACK_REASON_MAX = 40;
export const FEEDBACK_KEEP = 50;

function isYmd(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function clean(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function sanitizeFeedbackItem(row) {
    if (!row || typeof row !== 'object') return null;
    const kind = row.kind === 'praise' || row.kind === 'dislike' ? row.kind : '';
    const fromId = clean(row.fromId, 24);
    const fromName = clean(row.fromName, 24);
    const reason = clean(row.reason, FEEDBACK_REASON_MAX);
    const date = String(row.date || '');
    if (!kind || !fromId || !reason || !isYmd(date)) return null;
    return { kind, fromId, fromName: fromName || fromId, reason, date };
}

export function sanitizeFeedbackInbox(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const items = Array.isArray(src.items) ? src.items : [];
    return { items: items.map(sanitizeFeedbackItem).filter(Boolean).slice(-FEEDBACK_KEEP) };
}

/** 새 기록을 뒤에 붙이고 오래된 것은 FEEDBACK_KEEP개까지만 남깁니다. */
export function appendFeedback(raw, entry) {
    const item = sanitizeFeedbackItem(entry);
    const inbox = sanitizeFeedbackInbox(raw);
    if (!item) return inbox;
    return { items: inbox.items.concat([item]).slice(-FEEDBACK_KEEP) };
}

/** 최신순 목록. kind를 주면 그 종류만. */
export function feedbackNewestFirst(raw, kind) {
    const list = sanitizeFeedbackInbox(raw).items.slice().reverse();
    return kind ? list.filter((row) => row.kind === kind) : list;
}

/** 항목별 하위 문서 ID. 같은 사람이 같은 날 같은 종류를 두 번 못 쓰게 규칙에서도 이 ID를 확인합니다. */
export function feedbackItemId(kind, fromId, date) {
    return `${String(date || '')}_${String(kind || '')}_${String(fromId || '')}`;
}

/** 하위 문서에 쓸 값(createdAt은 호출하는 쪽에서 serverTimestamp로 붙입니다). 형식이 틀리면 null. */
export function buildFeedbackItem(entry) {
    const item = sanitizeFeedbackItem(entry);
    if (!item) return null;
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(item.fromId)) return null;
    if ([...String(entry.reason || '').replace(/\s+/g, ' ').trim()].length > FEEDBACK_REASON_MAX) return null;
    return { ...item, id: feedbackItemId(item.kind, item.fromId, item.date) };
}
