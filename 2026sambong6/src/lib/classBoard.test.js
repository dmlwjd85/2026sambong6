import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLASS_BOARD_CHEER_BONG,
    CLASS_BOARD_CHEER_XP,
    CLASS_BOARD_NOTES_PER_PAGE,
    CLASS_BOARD_PAGE_MAX,
    CLASS_NOTE_TEXT_MAX,
    classBoardCanWrite,
    classBoardNoteExcerpt,
    classBoardNotesList,
    classBoardPagesList,
    classBoardPromptForView,
    classBoardRemainingMs,
    classBoardStateFromSnaps,
    classNoteColorForStudent,
    cheerClassBoardNote,
    clearClassBoard,
    clearClassBoardFocus,
    closeClassBoardPosting,
    emptyClassBoard,
    planClassBoardCheer,
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
        assert.equal(notes[0].color, 'yellow');
        assert.equal(notes[1].color, 'pink');
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
        assert.equal(classBoardNotesList(st)[0].color, 'yellow');
        st = submitClassNote(st, { studentId: '1', name: '김단엘', text: '고친 답', color: 'sky' }, t0 + 40);
        assert.equal(classBoardNotesList(st).length, 1);
        assert.equal(classBoardNotesList(st)[0].text, '고친 답');
        assert.equal(classBoardNotesList(st)[0].color, 'yellow');
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

    it('학번마다 쪽지 색이 고정되고 따봉 신호를 남긴다', () => {
        const t0 = 1_700_000_400_000;
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '색', seconds: 0 }, t0);
        st = submitClassNote(st, { studentId: '1', text: '노랑' }, t0 + 1);
        st = submitClassNote(st, { studentId: '6', text: '다시 노랑' }, t0 + 2);
        st = submitClassNote(st, { studentId: '3', text: '민트' }, t0 + 3);
        const byId = Object.fromEntries(classBoardNotesList(st).map((n) => [n.studentId, n.color]));
        assert.equal(byId['1'], 'yellow');
        assert.equal(byId['6'], 'yellow');
        assert.equal(byId['3'], 'mint');
        assert.equal(classNoteColorForStudent('2'), 'pink');
        assert.equal(classNoteColorForStudent('4'), 'sky');
        assert.equal(classNoteColorForStudent('5'), 'peach');
        assert.equal(CLASS_BOARD_CHEER_XP, 10);
        assert.equal(CLASS_BOARD_CHEER_BONG, 1);
        const noteId = classBoardNotesList(st).find((n) => n.studentId === '3').id;
        st = cheerClassBoardNote(st, noteId, t0 + 4);
        assert.equal(st.cheer.studentId, '3');
        assert.equal(st.cheer.noteId, noteId);
        assert.ok(st.cheer.token);
    });

    it('빈 2쪽은 재사용하고 번호는 1부터 이어진다', () => {
        const t0 = 1_700_000_500_000;
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '1쪽', seconds: 0 }, t0);
        st = submitClassNote(st, { studentId: '1', text: '첫 쪽' }, t0 + 1);
        st = turnClassBoardPage(st, t0 + 2);
        assert.equal(classBoardPagesList(st).map((p) => p.index).join(','), '1,2');
        st = setClassBoardViewPage(st, classBoardPagesList(st)[0].id);
        st = turnClassBoardPage(st, t0 + 3);
        const afterReuse = classBoardPagesList(st);
        assert.equal(afterReuse.length, 2);
        assert.equal(afterReuse.map((p) => p.index).join(','), '1,2');
        assert.equal(st.pages[st.currentPageId].index, 2);
        assert.equal(st.viewPageId, st.currentPageId);
        st = submitClassNote(st, { studentId: '1', text: '둘째 쪽' }, t0 + 4);
        st = turnClassBoardPage(st, t0 + 5);
        assert.equal(classBoardPagesList(st).map((p) => p.index).join(','), '1,2,3');
        const gapped = sanitizeClassBoard({
            currentPageId: 'pg_c',
            viewPageId: 'pg_c',
            pages: {
                pg_a: { id: 'pg_a', index: 1, notes: { n1: { id: 'n1', studentId: '1', text: '남김' } } },
                pg_b: { id: 'pg_b', index: 2, notes: {} },
                pg_c: { id: 'pg_c', index: 4, notes: { n2: { id: 'n2', studentId: '2', text: '세 번째' } } },
            },
        });
        assert.equal(classBoardPagesList(gapped).map((p) => p.index).join(','), '1,2');
        assert.equal(gapped.pages.pg_c.index, 2);
        assert.equal(Object.keys(gapped.pages).includes('pg_b'), false);
    });

    it('페이지·쪽지 상한과 글자 수를 지킨다', () => {
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '상한', seconds: 0 }, 1);
        for (let i = 0; i < CLASS_BOARD_PAGE_MAX + 3; i++) {
            st = submitClassNote(st, { studentId: '1', text: `쪽 ${i}` }, 10 + i);
            st = turnClassBoardPage(st, 20 + i);
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

    it('onclick에 넣을 수 없는 쪽지·페이지 id는 버린다', () => {
        const dirty = sanitizeClassBoard({
            currentPageId: "pg');alert(1)//",
            viewPageId: "pg');alert(1)//",
            pages: {
                "pg');alert(1)//": {
                    id: "pg');alert(1)//",
                    index: 1,
                    notes: {
                        "n');alert(1)//": {
                            id: "n');alert(1)//",
                            studentId: '1',
                            text: '위험',
                        },
                    },
                },
                pg_ok: {
                    id: 'pg_ok',
                    index: 2,
                    notes: {
                        n_ok: { id: 'n_ok', studentId: '2', text: '안전' },
                    },
                },
            },
        });
        assert.equal(Object.keys(dirty.pages).includes("pg');alert(1)//"), false);
        assert.ok(dirty.pages.pg_ok);
        assert.equal(Object.keys(dirty.pages.pg_ok.notes).includes("n');alert(1)//"), false);
        assert.equal(dirty.pages.pg_ok.notes.n_ok.text, '안전');
        assert.equal(isSafeId(dirty.currentPageId), true);
        assert.equal(isSafeId(dirty.viewPageId), true);
    });

    it('별도 문서가 없으면 전역 설정의 쪽지를 지키고 빈 로컬로 덮지 않는다', () => {
        const t0 = 1_700_000_600_000;
        let saved = startClassBoardPrompt(emptyClassBoard(), { prompt: '오전의 다짐', seconds: 0 }, t0);
        saved = submitClassNote(saved, { studentId: '1', text: '사이좋게' }, t0 + 1);
        const emptyLocal = setClassBoardViewTogether(emptyClassBoard(), true);
        const cur = classBoardStateFromSnaps(null, { classBoard: saved }, emptyLocal);
        assert.equal(classBoardNotesList(cur).length, 1);
        assert.equal(classBoardNotesList(cur)[0].text, '사이좋게');
        const next = setClassBoardViewTogether(cur, true);
        assert.equal(classBoardNotesList(next).length, 1);
        const dedicated = classBoardStateFromSnaps({ classBoard: emptyClassBoard() }, { classBoard: saved }, saved);
        assert.equal(classBoardNotesList(dedicated).length, 0);
    });

    it('없는 쪽지에는 따봉 경험치·봉을 주지 않고, 같은 cheerId는 두 번 주지 않는다', () => {
        const t0 = 1_700_000_700_000;
        let st = startClassBoardPrompt(emptyClassBoard(), { prompt: '따봉', seconds: 0 }, t0);
        st = submitClassNote(st, { studentId: '3', text: '큰 글씨' }, t0 + 1);
        const noteId = classBoardNotesList(st)[0].id;
        const ok = planClassBoardCheer(st, noteId, t0 + 2, 'cheer_once');
        assert.equal(ok.ok, true);
        assert.equal(ok.already, false);
        assert.equal(ok.studentId, '3');
        assert.equal(ok.xp, CLASS_BOARD_CHEER_XP);
        assert.equal(ok.bong, CLASS_BOARD_CHEER_BONG);
        assert.equal(ok.next.cheer.noteId, noteId);
        assert.equal(ok.next.cheer.token, 'cheer_once');
        const retry = planClassBoardCheer(ok.next, noteId, t0 + 3, 'cheer_once');
        assert.equal(retry.ok, true);
        assert.equal(retry.already, true);
        assert.equal(retry.xp, 0);
        assert.equal(retry.bong, 0);
        const miss = planClassBoardCheer(st, 'n_missing', t0 + 4);
        assert.equal(miss.ok, false);
        assert.equal(miss.xp, 0);
        assert.equal(miss.bong, 0);
        assert.equal(miss.studentId, '');
    });
});

function isSafeId(id) {
    return /^[a-zA-Z0-9_-]{1,40}$/.test(String(id || ''));
}
