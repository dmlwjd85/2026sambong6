/**
 * 문학 탭: 독서기록장·일기장.
 * 보상은 교사가 미리 정한 XP·봉이며, 독서기록은 하루 1회만 제출할 수 있습니다.
 */

export const LITERATURE_REWARD_XP_MAX = 80;
export const LITERATURE_REWARD_BONG_MAX = 50;
export const LITERATURE_DEFAULT_REWARD_XP = 20;
export const LITERATURE_DEFAULT_REWARD_BONG = 5;
export const LITERATURE_THOUGHT_MIN = 20;
export const LITERATURE_THOUGHT_MAX = 800;
export const LITERATURE_TITLE_MAX = 40;
export const LITERATURE_AUTHOR_MAX = 30;
export const LITERATURE_PUBLISHER_MAX = 30;
export const LITERATURE_QUOTE_MAX = 120;
export const LITERATURE_DIARY_MAX = 800;
export const LITERATURE_TEACHER_NOTE_MAX = 120;
export const READING_LOG_DAILY_LIMIT = 1;
export const DIARY_STROKE_MAX = 60;
export const DIARY_STROKE_POINTS_MAX = 160;

export const READING_GENRES = Object.freeze([
    '동화', '소설', '시', '그림책', '지식', '만화', '위인전', '기타',
]);

export const DIARY_WEATHER = Object.freeze([
    { id: 'sunny', label: '맑음', emoji: '☀️' },
    { id: 'cloudy', label: '흐림', emoji: '☁️' },
    { id: 'rain', label: '비', emoji: '🌧️' },
    { id: 'snow', label: '눈', emoji: '❄️' },
    { id: 'wind', label: '바람', emoji: '💨' },
]);

export const DIARY_MOODS = Object.freeze([
    { id: 'happy', label: '기쁨', emoji: '😊' },
    { id: 'calm', label: '평온', emoji: '😌' },
    { id: 'excited', label: '설렘', emoji: '🤩' },
    { id: 'tired', label: '피곤', emoji: '😪' },
    { id: 'sad', label: '슬픔', emoji: '😢' },
    { id: 'angry', label: '화남', emoji: '😠' },
]);

function clipText(raw, max) {
    const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, max).join('');
}

function clipMultiline(raw, max) {
    const s = String(raw == null ? '' : raw).replace(/\r\n/g, '\n').trim();
    return Array.from(s).slice(0, max).join('');
}

function clampInt(v, min, max, fallback) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

export function readingLogDocId(studentId, dateStr) {
    return `rlog_${String(studentId || '').trim()}_${String(dateStr || '').trim()}`;
}

export function diaryDocId(studentId, dateStr) {
    return `diary_${String(studentId || '').trim()}_${String(dateStr || '').trim()}`;
}

export function sanitizeLiteratureRewards(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        readingRewardXp: clampInt(
            src.readingRewardXp != null ? src.readingRewardXp : src.literatureRewardXp,
            0,
            LITERATURE_REWARD_XP_MAX,
            LITERATURE_DEFAULT_REWARD_XP,
        ),
        readingRewardBong: clampInt(
            src.readingRewardBong != null ? src.readingRewardBong : src.literatureRewardBong,
            0,
            LITERATURE_REWARD_BONG_MAX,
            LITERATURE_DEFAULT_REWARD_BONG,
        ),
    };
}

export function sanitizeReadingLog(raw, nowMs = Date.now()) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const genre = READING_GENRES.includes(src.genre) ? src.genre : '기타';
    const stars = clampInt(src.stars, 1, 5, 3);
    const status = ['pending', 'approved', 'rejected'].includes(src.status) ? src.status : 'pending';
    return {
        id: String(src.id || ''),
        studentId: String(src.studentId || '').trim(),
        date: String(src.date || '').trim(),
        title: clipText(src.title, LITERATURE_TITLE_MAX),
        author: clipText(src.author, LITERATURE_AUTHOR_MAX),
        publisher: clipText(src.publisher, LITERATURE_PUBLISHER_MAX),
        genre,
        stars,
        quote: clipText(src.quote, LITERATURE_QUOTE_MAX),
        thought: clipMultiline(src.thought, LITERATURE_THOUGHT_MAX),
        status,
        teacherNote: clipText(src.teacherNote, LITERATURE_TEACHER_NOTE_MAX),
        rewardXp: clampInt(src.rewardXp, 0, LITERATURE_REWARD_XP_MAX, 0),
        rewardBong: clampInt(src.rewardBong, 0, LITERATURE_REWARD_BONG_MAX, 0),
        rewarded: src.rewarded === true,
        submittedAt: Number.isFinite(Number(src.submittedAt)) ? Number(src.submittedAt) : nowMs,
        reviewedAt: Number.isFinite(Number(src.reviewedAt)) ? Number(src.reviewedAt) : 0,
    };
}

export function validateReadingLogDraft(raw) {
    const log = sanitizeReadingLog(raw);
    if (!log.studentId) return { ok: false, reason: 'login' };
    if (!log.date) return { ok: false, reason: 'date' };
    if (!log.title) return { ok: false, reason: 'title' };
    if (!log.author) return { ok: false, reason: 'author' };
    if (!log.publisher) return { ok: false, reason: 'publisher' };
    if (Array.from(log.thought).length < LITERATURE_THOUGHT_MIN) return { ok: false, reason: 'thought' };
    return { ok: true, log };
}

/**
 * 오늘 제출 가능 여부.
 * 대기·승인이 있으면 막습니다. 반려된 같은 날짜 기록은 고쳐 다시 낼 수 있습니다.
 */
export function readingLogSubmitState(logs, studentId, dateStr) {
    const sid = String(studentId || '');
    const date = String(dateStr || '');
    const mine = (Array.isArray(logs) ? logs : []).filter((l) => String(l.studentId) === sid && String(l.date) === date);
    const pending = mine.find((l) => l.status === 'pending');
    const approved = mine.find((l) => l.status === 'approved');
    const rejected = mine.find((l) => l.status === 'rejected');
    if (approved) return { ok: false, reason: 'already', existing: approved };
    if (pending) return { ok: false, reason: 'pending', existing: pending };
    if (rejected) return { ok: true, reason: 'resubmit', existing: rejected };
    return { ok: true, reason: 'new', existing: null };
}

export function canApproveReadingLog(log) {
    return !!(log && log.status === 'pending' && !log.rewarded);
}

export function applyReadingLogReview(log, action, note, rewards, nowMs = Date.now()) {
    const cur = sanitizeReadingLog(log, nowMs);
    if (cur.status !== 'pending') return { skip: true, log: cur, grantXp: 0, grantBong: 0 };
    const pay = sanitizeLiteratureRewards(rewards);
    const next = { ...cur, teacherNote: clipText(note, LITERATURE_TEACHER_NOTE_MAX), reviewedAt: nowMs };
    if (action === 'reject') {
        return { skip: false, log: { ...next, status: 'rejected' }, grantXp: 0, grantBong: 0 };
    }
    return {
        skip: false,
        log: {
            ...next,
            status: 'approved',
            rewarded: true,
            rewardXp: pay.readingRewardXp,
            rewardBong: pay.readingRewardBong,
        },
        grantXp: pay.readingRewardXp,
        grantBong: pay.readingRewardBong,
    };
}

export function countApprovedReadingLogs(logs, studentId) {
    const sid = String(studentId || '');
    return (Array.isArray(logs) ? logs : []).filter((l) => String(l.studentId) === sid && l.status === 'approved').length;
}

export function pendingReadingLogs(logs) {
    return (Array.isArray(logs) ? logs : [])
        .filter((l) => l && l.status === 'pending')
        .sort((a, b) => (Number(a.submittedAt) || 0) - (Number(b.submittedAt) || 0));
}

export function sanitizeDiaryStrokes(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const s of raw.slice(0, DIARY_STROKE_MAX)) {
        if (!s || typeof s !== 'object') continue;
        const color = String(s.color || '#334155').slice(0, 16);
        const width = clampInt(s.width, 1, 10, 3);
        const ptsRaw = Array.isArray(s.pts) ? s.pts : [];
        const pts = [];
        for (let i = 0; i < ptsRaw.length && pts.length < DIARY_STROKE_POINTS_MAX * 2; i += 1) {
            const n = Number(ptsRaw[i]);
            if (!Number.isFinite(n)) continue;
            pts.push(Math.max(0, Math.min(1, n)));
        }
        if (pts.length < 4) continue;
        if (pts.length % 2 === 1) pts.pop();
        out.push({ color, width, pts });
    }
    return out;
}

export function weatherMeta(id) {
    return DIARY_WEATHER.find((w) => w.id === id) || DIARY_WEATHER[0];
}

export function moodMeta(id) {
    return DIARY_MOODS.find((m) => m.id === id) || DIARY_MOODS[0];
}

export function sanitizeDiaryEntry(raw, nowMs = Date.now()) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const weather = DIARY_WEATHER.some((w) => w.id === src.weather) ? src.weather : 'sunny';
    const mood = DIARY_MOODS.some((m) => m.id === src.mood) ? src.mood : 'calm';
    return {
        id: String(src.id || ''),
        studentId: String(src.studentId || '').trim(),
        date: String(src.date || '').trim(),
        weather,
        mood,
        body: clipMultiline(src.body, LITERATURE_DIARY_MAX),
        strokes: sanitizeDiaryStrokes(src.strokes),
        updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : nowMs,
        teacherNote: clipText(src.teacherNote, LITERATURE_TEACHER_NOTE_MAX),
        teacherNoteAt: Number.isFinite(Number(src.teacherNoteAt)) ? Number(src.teacherNoteAt) : 0,
    };
}

export function validateDiaryDraft(raw) {
    const entry = sanitizeDiaryEntry(raw);
    if (!entry.studentId) return { ok: false, reason: 'login' };
    if (!entry.date) return { ok: false, reason: 'date' };
    if (!entry.body && entry.strokes.length === 0) return { ok: false, reason: 'empty' };
    return { ok: true, entry };
}

/** 학생은 자기 일기만, 교사는 전부 볼 수 있습니다. */
export function canViewDiary(viewer, entry) {
    if (!entry) return false;
    if (viewer && viewer.isAdmin) return true;
    const vid = String((viewer && (viewer.id || viewer.studentId)) || '');
    return vid && vid === String(entry.studentId);
}

export function diariesVisibleTo(viewer, entries) {
    return (Array.isArray(entries) ? entries : []).filter((e) => canViewDiary(viewer, e));
}

export function readingLogStatusLabel(status) {
    if (status === 'approved') return '확인 완료';
    if (status === 'rejected') return '다시 쓰기';
    return '확인 대기';
}
