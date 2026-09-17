import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    OPEN_LESSONS,
    closeOpenLesson,
    emptyOpenLessonState,
    openLessonById,
    openLessonCatalog,
    openLessonSlideAt,
    openLessonSlideCount,
    openLessonStateFromSnaps,
    sanitizeOpenLessonState,
    startOpenLesson,
    stepOpenLesson,
} from './openLessons.js';

describe('공개수업 목록', () => {
    it('수업을 배열로 두고 슬라이드 10장을 맞춘다', () => {
        assert.ok(OPEN_LESSONS.length >= 1);
        const lesson = openLessonById('parallel-theory');
        assert.ok(lesson);
        assert.equal(lesson.title, '과거와 현재의 평행이론');
        assert.equal(openLessonSlideCount(lesson), 10);
        assert.equal(openLessonSlideAt(lesson, 0).kind, 'image');
        assert.ok(openLessonSlideAt(lesson, 0).caption.includes('산업혁명'));
        assert.equal(openLessonSlideAt(lesson, 8).kind, 'text');
        assert.equal(openLessonSlideAt(lesson, 8).text, '이제 당신에게는 무엇이 남았나요?');
        assert.equal(openLessonSlideAt(lesson, 9).kind, 'text');
        assert.ok(openLessonSlideAt(lesson, 9).text.includes('오늘의 학습 주제'));
        assert.equal(openLessonCatalog().length, OPEN_LESSONS.length);
    });

    it('없는 수업·범위를 벗어난 장을 버린다', () => {
        assert.equal(openLessonById('hack'), null);
        const empty = sanitizeOpenLessonState({ lessonId: 'nope', slideIndex: 99 });
        assert.equal(empty.lessonId, '');
        assert.equal(empty.slideIndex, 0);
        const started = startOpenLesson(emptyOpenLessonState(), 'parallel-theory', 100);
        assert.equal(started.lessonId, 'parallel-theory');
        assert.equal(started.slideIndex, 0);
        const next = stepOpenLesson(started, 1, 200);
        assert.equal(next.slideIndex, 1);
        const last = stepOpenLesson(started, 99, 300);
        assert.equal(last.slideIndex, 9);
        const same = stepOpenLesson(last, 1, 400);
        assert.equal(same.slideIndex, 9);
        const back = stepOpenLesson(last, -3, 500);
        assert.equal(back.slideIndex, 6);
        const closed = closeOpenLesson(last, 600);
        assert.equal(closed.lessonId, '');
        assert.equal(closed.slideIndex, 0);
    });

    it('별도 문서가 없으면 전역 설정의 장을 쓰고 이미 넘긴 로컬을 다시 더하지 않는다', () => {
        const global = {
            openLesson: { lessonId: 'parallel-theory', slideIndex: 0, updatedAt: 100 },
        };
        const localStepped = { lessonId: 'parallel-theory', slideIndex: 1, updatedAt: 200 };
        const cur = openLessonStateFromSnaps(null, global, localStepped);
        assert.equal(cur.slideIndex, 0);
        const next = stepOpenLesson(cur, 1, 300);
        assert.equal(next.slideIndex, 1);
        const dedicated = openLessonStateFromSnaps(
            { openLesson: { lessonId: 'parallel-theory', slideIndex: 4, updatedAt: 400 } },
            global,
            localStepped,
        );
        assert.equal(dedicated.slideIndex, 4);
    });
});
