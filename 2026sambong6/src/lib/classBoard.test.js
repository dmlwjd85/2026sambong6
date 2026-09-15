import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLASS_BOARD_NOTES_PER_PAGE,
    CLASS_BOARD_PAGE_MAX,
    CLASS_NOTE_TEXT_MAX,
    classBoardCanWrite,
    classBoardNoteExcerpt,
    classBoardNotesList,
    classBoardPagesList,
    classBoardPromptForView,
    classBoardRemainingMs,
    clearClassBoard,
    clearClassBoardFocus,
    closeClassBoardPosting,
    emptyClassBoard,
    sanitizeClassBoard,
    setClassBoardFocus,
    setClassBoardViewPage,
    setClassBoardViewTogether,
    startClassBoardPrompt,
    submitClassNote,
    turnClassBoardPage,
} from './classBoard.js';

describe('학급게시판 정리', () => {
    it('빈 값과 위험한 입력을 버린다', () => {
        const empty = sanitizeClassBoard(null);
        assert.equal(empty.postingOpen, false);
        assert.equal(empty.viewTogether, false);
        assert.equal(classBoardPagesList(empty).length, 1);
        assert.equal(classBoardNotesList(empty).length, 0);
        const dirty = sanitizeClassBoard({
            postingOpen: 'yes',
            prompt: `  <script>  ${'가'.repeat(200)}`,
            timerSeconds: 99999,
            pages: [{ id: 'pg_x', index: 1, notes: [{ id: 'n1', studentId: '', text: '없음' }] }],
        });
        assert.equal(dirty.postingOpen, false);
        assert.ok(dirty.prompt.length <= 120);
        assert.equal(dirty.timerSeconds, 3600);
        assert.equal(classBoardNotesList(dirty).length, 0);
    });

    it('발문을 열고 쪽지를 현재 페이지에 붙인다', () => {
        const t0 = 1_700_000_000_000;
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '오늘의 다짐은?', seconds: 120 }, t0);
        assert.equal(st.postingOpen, true);
        assert.equal(st.viewTogether, false);
        assert.equal(st.timerEndsAt, t0 + 120000);
        assert.equal(classBoardCanWrite(st, t0 + 1000), true);
        st = submitClassNote(st, { studentId: '1', name: '김단엘', text: '사이좋게', color: 'mint' }, t0 + 2000);
        st = submitClassNote(st, { studentId: '2', name: '김라희', text: '열심히', color: 'hack' }, t0 + 3000);
        const notes = classBoardNotesList(st);
        assert.equal(notes.length, 2);
        assert.equal(notes[0].text, '사이좋게');
        assert.equal(notes[1].color, 'yellow');
        assert.equal(classBoardPromptForView(st), '오늘의 다짐은?');
    });

    it('페이지를 넘기면 이전 쪽지는 남고 재제출은 열린 페이지로 간다', () => {
        const t0 = 1_700_000_100_000;
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '1쪽 질문', seconds: 300 }, t0);
        st = submitClassNote(st, { studentId: '1', name: '김단엘', text: '첫 답', color: 'yellow' }, t0 + 10);
        const page1 = st.currentPageId;
        st = turnClassBoardPage(st, t0 + 20);
        assert.notEqual(st.currentPageId, page1);
        assert.equal(classBoardPagesList(st).length, 2);
        assert.equal(classBoardNotesList(st.pages[page1]).length, 1);
        assert.equal(classBoardNotesList(st).length, 0);
        st = submitClassNote(st, { studentId: '1', name: '김단엘', text: '둘째 답', color: 'pink' }, t0 + 30);
        assert.equal(classBoardNotesList(st.pages[page1])[0].text, '첫 답');
        assert.equal(classBoardNotesList(st)[0].text, '둘째 답');
        assert.equal(classBoardNotesList(st)[0].color, 'pink');
        st = submitClassNote(st, { studentId: '1', name: '김단엘', text: '고친 답', color: 'sky' }, t0 + 40);
        assert.equal(classBoardNotesList(st).length, 1);
        assert.equal(classBoardNotesList(st)[0].text, '고친 답');
        assert.equal(classBoardNotesList(st.pages[page1]).length, 1);
    });

    it('함께 보기와 시간 종료에는 작성할 수 없다', () => {
        const t0 = 1_700_000_200_000;
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '발문', seconds: 10 }, t0);
        st = setClassBoardViewTogether(st, true);
        assert.equal(classBoardCanWrite(st, t0 + 1000), false);
        const blocked = submitClassNote(st, { studentId: '1', text: '몰래' }, t0 + 1000);
        assert.equal(classBoardNotesList(blocked).length, 0);
        st = setClassBoardViewTogether(st, false);
        assert.equal(classBoardCanWrite(st, t0 + 1000), true);
        assert.equal(classBoardCanWrite(st, t0 + 11000), false);
        assert.equal(classBoardRemainingMs(st, t0 + 4000), 6000);
        const late = submitClassNote(st, { studentId: '1', text: '지각' }, t0 + 11000);
        assert.equal(classBoardNotesList(late).length, 0);
    });

    it('쪽지 선택·페이지 보기·발문 종료를 맞춘다', () => {
        const t0 = 1_700_000_300_000;
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '함께 보기', seconds: 0 }, t0);
        st = submitClassNote(st, { studentId: '3', name: '이민준', text: '큰 글씨로 봐요', color: 'peach' }, t0 + 1);
        const noteId = classBoardNotesList(st)[0].id;
        st = setClassBoardFocus(st, noteId);
        assert.equal(st.focusNoteId, noteId);
        st = turnClassBoardPage(st, t0 + 2);
        assert.equal(st.focusNoteId, '');
        const page2 = st.currentPageId;
        st = setClassBoardViewPage(st, classBoardPagesList(st)[0].id);
        assert.notEqual(st.viewPageId, page2);
        assert.equal(st.currentPageId, page2);
        st = setClassBoardFocus(st, noteId);
        assert.equal(st.viewPageId, classBoardPagesList(st)[0].id);
        st = clearClassBoardFocus(st);
        assert.equal(st.focusNoteId, '');
        st = closeClassBoardPosting(st);
        assert.equal(st.postingOpen, false);
        assert.equal(classBoardCanWrite(st, t0 + 3), false);
        const excerpt = classBoardNoteExcerpt({ text: '가'.repeat(90) }, 10);
        assert.equal(excerpt.endsWith('…'), true);
        assert.equal(Array.from(excerpt).length, 11);
        st = clearClassBoard(st);
        assert.equal(classBoardPagesList(st).length, 1);
        assert.equal(classBoardNotesList(st).length, 0);
        assert.equal(st.timerSeconds, 0);
    });

    it('페이지·쪽지 상한과 글자 수를 지킨다', () => {
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '상한', seconds: 0 }, 1);
        for (let i = 0; i < CLASS_BOARD_PAGE_MAX + 3; i++) {
            st = turnClassBoardPage(st, 10 + i);
        }
        assert.equal(classBoardPagesList(st).length, CLASS_BOARD_PAGE_MAX);
        for (let i = 0; i < CLASS_BOARD_NOTES_PER_PAGE + 5; i++) {
            st = submitClassNote(st, { studentId: String(i + 1), text: `쪽지 ${i}` }, 100 + i);
        }
        assert.equal(classBoardNotesList(st).length, CLASS_BOARD_NOTES_PER_PAGE);
        const long = submitClassNote(st, { studentId: '99', text: '나'.repeat(CLASS_NOTE_TEXT_MAX + 40) }, 500);
        const mine = classBoardNotesList(long).find((n) => n.studentId === '99');
        assert.equal(Array.from(mine.text).length, CLASS_NOTE_TEXT_MAX);
    });
});
