/**
 * 원격 화면 공지 팝업.
 * 마스터가 띄우면 Firestore 설정이 바뀌고, 접속 중인 모든 화면에 같은 팝업이 뜹니다.
 * 아침활동 광장 전환과는 별도입니다.
 */

export const SCREEN_NOTICE_MAX_LEN = 400;
export const SCREEN_NOTICE_TITLE_MAX = 20;
export const SCREEN_NOTICE_DISMISS_KEY = 'sambong_screen_notice_dismissed';

function trimStr(value) {
    return String(value == null ? '' : value).trim();
}

export function sanitizeScreenNotice(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { id: '', text: '', title: '공지', postedAt: 0, active: false, source: 'notice' };
    }
    const id = trimStr(raw.id).slice(0, 80);
    const text = trimStr(raw.text).slice(0, SCREEN_NOTICE_MAX_LEN);
    const title = trimStr(raw.title).slice(0, SCREEN_NOTICE_TITLE_MAX) || '공지';
    const postedAt = Math.max(0, Math.floor(Number(raw.postedAt) || 0));
    const source = raw.source === 'morning' ? 'morning' : 'notice';
    const active = raw.active === true && !!id && !!text;
    return { id, text, title, postedAt, active, source };
}

/** 새로 띄울 공지 문서를 만듭니다. 내용이 없으면 null. */
export function buildScreenNotice({ text, title, source } = {}) {
    const body = trimStr(text).slice(0, SCREEN_NOTICE_MAX_LEN);
    if (!body) return null;
    const src = source === 'morning' ? 'morning' : 'notice';
    return sanitizeScreenNotice({
        id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        text: body,
        title: src === 'morning' ? (trimStr(title) || '아침안내') : (trimStr(title) || '공지'),
        postedAt: Date.now(),
        active: true,
        source: src,
    });
}

export function closeScreenNotice(raw) {
    const notice = sanitizeScreenNotice(raw);
    return { ...notice, active: false };
}

/** 이 기기에서 아직 안 닫은 활성 공지면 팝업을 띄웁니다. */
export function screenNoticeShouldShow(notice, dismissedId) {
    const n = sanitizeScreenNotice(notice);
    if (!n.active || !n.id || !n.text) return false;
    return String(dismissedId || '') !== String(n.id);
}

export function readDismissedScreenNoticeId(storage) {
    try {
        const bag = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        return bag ? String(bag.getItem(SCREEN_NOTICE_DISMISS_KEY) || '') : '';
    } catch (e) {
        return '';
    }
}

export function writeDismissedScreenNoticeId(id, storage) {
    try {
        const bag = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        if (!bag) return;
        const key = String(id || '');
        if (!key) bag.removeItem(SCREEN_NOTICE_DISMISS_KEY);
        else bag.setItem(SCREEN_NOTICE_DISMISS_KEY, key);
    } catch (e) {
        /* 비공개 모드 등 */
    }
}
