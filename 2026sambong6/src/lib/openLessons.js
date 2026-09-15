/**
 * 공개수업 — 수업 아이디어를 OPEN_LESSONS 배열에 추가하면 목록에 나타납니다.
 * 슬라이드 kind: image(그림+문장) | text(문장만).
 */

export const OPEN_LESSON_SLIDE_MAX = 40;

/** 새 수업은 이 배열 뒤에 객체를 더합니다. */
export const OPEN_LESSONS = Object.freeze([
    {
        id: 'parallel-theory',
        title: '과거와 현재의 평행이론',
        cover: 'lessons/parallel/01.webp',
        slides: Object.freeze([
            {
                kind: 'image',
                image: 'lessons/parallel/01.webp',
                caption: '19세기 산업혁명의 시대, 공장에 노동자들 대신 거대한 기계들이 들어왔습니다.',
            },
            {
                kind: 'image',
                image: 'lessons/parallel/02.webp',
                caption: '노동자들은 기계가 일자리를 뺏을 거라 생각하고 망치로 기계를 부수며 분노했습니다.(러다이트 운동)',
            },
            {
                kind: 'image',
                image: 'lessons/parallel/03.webp',
                caption: '그리고 인공지능이 보편화된 2026년 현재…',
            },
            {
                kind: 'image',
                image: 'lessons/parallel/04.webp',
                caption: '노동자들뿐만 아니라 과학자들과 철학자들이 AI 발전에 대해 경고하고 있습니다.',
            },
            {
                kind: 'image',
                image: 'lessons/parallel/05.webp',
                caption: '200년 전 노동자들과 현재의 과학자들은 왜 새로운 것을 반대하는 것일까요?',
            },
            {
                kind: 'image',
                image: 'lessons/parallel/06.webp',
                caption: '두려움 때문입니다.',
            },
            {
                kind: 'image',
                image: 'lessons/parallel/07.webp',
                caption: '200년 전 기계는 육체적인 힘을 대신했습니다. AI는 지금 무엇을 대신하는 걸까요?',
            },
            {
                kind: 'image',
                image: 'lessons/parallel/08.webp',
                caption: '생각입니다.',
            },
            {
                kind: 'text',
                text: '이제 당신에게는 무엇이 남았나요?',
            },
            {
                kind: 'text',
                text: '오늘의 학습 주제\n직업에 인공지능이 도입될 때 생기는 변화를 살펴보고, 인공지능과 함께하는 미래의 내 모습을 표현해 보자.',
            },
        ]),
    },
]);

function cleanLine(raw, max) {
    return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function openLessonCatalog() {
    return OPEN_LESSONS.slice();
}

export function openLessonById(id) {
    const key = String(id || '').trim();
    return OPEN_LESSONS.find((row) => row.id === key) || null;
}

export function openLessonSlideCount(lesson) {
    const slides = lesson && Array.isArray(lesson.slides) ? lesson.slides : [];
    return Math.min(OPEN_LESSON_SLIDE_MAX, slides.length);
}

export function openLessonSlideAt(lesson, index) {
    const n = openLessonSlideCount(lesson);
    if (!n) return null;
    const i = Math.min(n - 1, Math.max(0, Math.floor(Number(index) || 0)));
    return lesson.slides[i] || null;
}

export function emptyOpenLessonState() {
    return { lessonId: '', slideIndex: 0, updatedAt: 0 };
}

export function sanitizeOpenLessonState(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const lesson = openLessonById(src.lessonId);
    const n = openLessonSlideCount(lesson);
    const slideIndex = n ? Math.min(n - 1, Math.max(0, Math.floor(Number(src.slideIndex) || 0))) : 0;
    return {
        lessonId: lesson ? lesson.id : '',
        slideIndex,
        updatedAt: Math.max(0, Math.floor(Number(src.updatedAt) || 0)),
    };
}

export function startOpenLesson(state, lessonId, now = Date.now()) {
    const lesson = openLessonById(lessonId);
    if (!lesson) return sanitizeOpenLessonState(state);
    return {
        lessonId: lesson.id,
        slideIndex: 0,
        updatedAt: Math.max(0, Math.floor(Number(now) || 0)),
    };
}

export function stepOpenLesson(state, delta, now = Date.now()) {
    const cur = sanitizeOpenLessonState(state);
    const lesson = openLessonById(cur.lessonId);
    const n = openLessonSlideCount(lesson);
    if (!n) return cur;
    const nextIndex = Math.min(n - 1, Math.max(0, cur.slideIndex + Math.trunc(Number(delta) || 0)));
    if (nextIndex === cur.slideIndex) return cur;
    return {
        lessonId: cur.lessonId,
        slideIndex: nextIndex,
        updatedAt: Math.max(0, Math.floor(Number(now) || 0)),
    };
}

export function closeOpenLesson(state, now = Date.now()) {
    const next = emptyOpenLessonState();
    next.updatedAt = Math.max(0, Math.floor(Number(now) || 0));
    return next;
}

export function openLessonTitle(state) {
    const cur = sanitizeOpenLessonState(state);
    const lesson = openLessonById(cur.lessonId);
    return lesson ? cleanLine(lesson.title, 40) : '';
}
