/**
 * 체스 배우기 화면(#boardgameChessLearnView). 단원 목록 → 문제 풀이.
 * 방·Firestore 없이 이 기기에서만 돌아요. 진도는 기기(localStorage)에 저장해요.
 * 판 그림은 대국 화면과 같은 클래스(chess-frame·chess-sq·chess-piece)를 써서 똑같이 보여요.
 */
import './chessTutorial.css';
import { chessPieceColor, chessPieceType, listLegalChessMoves } from './lib/chessGame.js';
import { chessPieceHtml } from './lib/chessPieces.js';
import {
    CHESS_LESSONS,
    CHESS_LESSON_STORE_KEY,
    addLessonProgress,
    judgeLessonMove,
    lessonGame,
    lessonSolutions,
    lessonSq,
    lessonWrongText,
    nextLessonIndex,
    parseLessonProgress,
} from './lib/chessLessons.js';
import { createOxFeedback } from './lib/oxQuizFeedback.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 틀린 횟수가 이만큼 되면 정답 칸을 표시해 줘요. */
const SHOW_ANSWER_AFTER = 2;

/**
 * deps: { toLobby(), startAi() }
 */
export function createChessTutorial(deps = {}) {
    const view = () => document.getElementById('boardgameChessLearnView');
    let feedback = null;
    let done = [];
    // 풀이 상태
    let lessonIdx = -1;
    let stepIdx = 0;
    let game = null; // 지금 보여 주는 판
    let selected = null;
    let solved = false;
    let wrongs = 0;
    let message = '';
    let messageKind = '';
    let bound = false;

    function loadProgress() {
        try { done = parseLessonProgress(localStorage.getItem(CHESS_LESSON_STORE_KEY)); } catch (_) { done = []; }
    }

    function saveProgress() {
        try { localStorage.setItem(CHESS_LESSON_STORE_KEY, JSON.stringify(done)); } catch (_) { /* 저장이 막혀 있으면 이번에만 기억해요 */ }
    }

    const lesson = () => CHESS_LESSONS[lessonIdx] || null;
    const step = () => (lesson() ? lesson().steps[stepIdx] : null);

    function bind() {
        const el = view();
        if (!el || bound) return;
        bound = true;
        feedback = createOxFeedback(el);
        el.addEventListener('click', (e) => {
            const t = e.target.closest('[data-cl]');
            if (!t || !el.contains(t)) return;
            const act = t.getAttribute('data-cl');
            if (act === 'lobby') { close(); if (deps.toLobby) deps.toLobby(); }
            else if (act === 'list') showList();
            else if (act === 'lesson') startLesson(Number(t.getAttribute('data-i')));
            else if (act === 'next') nextStep();
            else if (act === 'prev') prevStep();
            else if (act === 'retry') resetStep();
            else if (act === 'sq') pickSquare(Number(t.getAttribute('data-sq')));
            else if (act === 'ai') { close(); if (deps.startAi) deps.startAi(); }
        });
    }

    /* ---------- 단원 목록 ---------- */

    function showList() {
        lessonIdx = -1;
        const el = view();
        if (!el) return;
        const next = nextLessonIndex(done);
        const all = next < 0;
        el.classList.remove('is-lesson');
        el.innerHTML = `
            <div class="boardgame-head">
                <button type="button" class="boardgame-mini-btn" data-cl="lobby">← 체스 방</button>
                <div class="min-w-0">
                    <p class="boardgame-kicker">CHESS SCHOOL</p>
                    <h2 class="boardgame-title">체스 배우기</h2>
                </div>
                <span class="chess-learn-count">${done.length} / ${CHESS_LESSONS.length} 단원</span>
            </div>
            <p class="chess-learn-lead">${all ? '모든 단원을 마쳤어요! 다시 풀어 보거나 AI와 겨뤄 봐요.' : '말을 직접 움직이며 배워요. 처음이라면 1단원부터 차례로 해 봐요.'}</p>
            <div class="chess-learn-list">${CHESS_LESSONS.map((l, i) => `
                <button type="button" class="chess-learn-card${done.includes(l.id) ? ' is-done' : ''}${i === next ? ' is-next' : ''}" data-cl="lesson" data-i="${i}">
                    <span class="chess-learn-num">${done.includes(l.id) ? '✓' : i + 1}</span>
                    <span class="chess-learn-card-text"><b>${esc(l.title)}</b><i>${esc(l.desc)}</i></span>
                    ${i === next ? '<span class="chess-learn-tag">여기부터</span>' : ''}
                </button>`).join('')}
            </div>
            ${all ? '<button type="button" class="boardgame-primary-btn chess-learn-ai" data-cl="ai">AI 고수와 두기</button>' : ''}`;
    }

    /* ---------- 문제 풀이 ---------- */

    function startLesson(i) {
        if (!CHESS_LESSONS[i]) return;
        lessonIdx = i;
        stepIdx = 0;
        resetStep();
    }

    function resetStep() {
        const s = step();
        if (!s) return;
        game = lessonGame(s);
        selected = null;
        solved = !!s.info;
        wrongs = 0;
        message = '';
        messageKind = '';
        renderLesson();
    }

    function nextStep() {
        const l = lesson();
        if (!l || !solved) return;
        if (stepIdx + 1 < l.steps.length) {
            stepIdx += 1;
            resetStep();
            return;
        }
        // 단원 끝
        if (!done.includes(l.id)) {
            done = addLessonProgress(done, l.id);
            saveProgress();
        }
        if (lessonIdx + 1 < CHESS_LESSONS.length) startLesson(lessonIdx + 1);
        else showList();
    }

    function prevStep() {
        if (stepIdx <= 0) return;
        stepIdx -= 1;
        resetStep();
    }

    function pickSquare(sq) {
        const s = step();
        if (!s || s.info || solved || !game) return;
        const piece = game.cells[sq];
        const legal = listLegalChessMoves(game, 'w');
        if (selected != null && legal.some((m) => m.from === selected && m.to === sq)) {
            const res = judgeLessonMove(s, selected, sq);
            selected = null;
            if (res.ok) {
                game = res.game;
                solved = true;
                message = s.ok || '잘했어요!';
                messageKind = 'ok';
                if (feedback) feedback.play('ok');
            } else {
                wrongs += 1;
                message = lessonWrongText(s, res.reason);
                messageKind = 'no';
                if (feedback) feedback.play('no');
            }
            renderLesson();
            return;
        }
        // 내 말을 누르면 고르고, 그 밖의 칸은 고른 것을 풀어요.
        selected = piece && chessPieceColor(piece) === 'w' && sq !== selected ? sq : null;
        renderLesson();
    }

    function boardHtml(s) {
        const legal = solved || s.info ? [] : listLegalChessMoves(game, 'w');
        const dests = selected == null ? [] : legal.filter((m) => m.from === selected);
        const last = game.lastMove;
        const kingInCheck = game.inCheck
            ? game.cells.findIndex((p) => chessPieceType(p) === 'k' && chessPieceColor(p) === game.turn)
            : -1;
        const marks = new Set(solved ? [] : (s.marks || []).map(lessonSq));
        // 두 번 틀리면 정답 말과 칸을 알려 줘요.
        const answer = !solved && !s.info && wrongs >= SHOW_ANSWER_AFTER ? lessonSolutions(s)[0] : null;
        // 아직 말을 고르지 않았으면 움직일 말을 살짝 알려 줘요.
        const nudge = !solved && !s.info && selected == null && s.from ? lessonSq(s.from) : -1;
        const cells = [];
        for (let rank = 7; rank >= 0; rank -= 1) {
            for (let file = 0; file < 8; file += 1) {
                const sq = rank * 8 + file;
                const dest = dests.find((m) => m.to === sq);
                const cls = [
                    'chess-sq',
                    (file + rank) % 2 === 1 ? 'is-light' : 'is-dark',
                    last && (last.from === sq || last.to === sq) ? 'is-last' : '',
                    selected === sq ? 'is-selected' : '',
                    kingInCheck === sq ? 'is-check' : '',
                    dest && dest.capture ? 'is-capture' : '',
                    dest && !dest.capture ? 'is-move' : '',
                    marks.has(sq) ? 'is-star' : '',
                    nudge === sq ? 'is-nudge' : '',
                    answer && (answer.from === sq || answer.to === sq) ? 'is-answer' : '',
                ].filter(Boolean).join(' ');
                const label = `${'abcdefgh'[file]}${rank + 1}`;
                cells.push(`<button type="button" class="${cls}" data-cl="sq" data-sq="${sq}" aria-label="${label}">${chessPieceHtml(game.cells[sq], `l${sq}`)}</button>`);
            }
        }
        return `
            <div class="chess-frame">
                <div class="chess-coord chess-coord-ranks" aria-hidden="true">${[8, 7, 6, 5, 4, 3, 2, 1].map((n) => `<span>${n}</span>`).join('')}</div>
                <div class="chess-board" role="grid" aria-label="체스 배우기 판">${cells.join('')}</div>
                <div class="chess-coord chess-coord-files" aria-hidden="true">${'abcdefgh'.split('').map((c) => `<span>${c}</span>`).join('')}</div>
            </div>`;
    }

    function renderLesson() {
        const el = view();
        const l = lesson();
        const s = step();
        if (!el || !l || !s) return;
        const lastStep = stepIdx + 1 >= l.steps.length;
        const lastLesson = lessonIdx + 1 >= CHESS_LESSONS.length;
        const nextLabel = !lastStep ? '다음 →' : lastLesson ? '마치기 ✓' : '다음 단원 →';
        const status = solved && !s.info
            ? `<p class="chess-learn-msg is-ok" role="status">${esc(message)}</p>`
            : message
                ? `<p class="chess-learn-msg is-no" role="status">${esc(message)}</p>`
                : `<p class="chess-learn-msg">${s.info ? '읽고 「다음」을 눌러요.' : '내 말(흰 말)을 누르고, 갈 칸을 눌러요.'}</p>`;
        el.classList.add('is-lesson');
        // 효과 레이어(ox-fx)는 남겨 두고 내용만 바꿔요.
        let body = el.querySelector('[data-ox-body]');
        if (!body) {
            el.innerHTML = '<div class="chess-learn-body" data-ox-body></div>';
            body = el.querySelector('[data-ox-body]');
        }
        body.innerHTML = `
            <div class="boardgame-head chess-learn-head">
                <button type="button" class="boardgame-mini-btn" data-cl="list">← 단원 목록</button>
                <div class="min-w-0">
                    <p class="boardgame-kicker">${lessonIdx + 1}단원</p>
                    <h2 class="boardgame-title">${esc(l.title)}</h2>
                </div>
                <span class="chess-learn-count">${stepIdx + 1} / ${l.steps.length}</span>
            </div>
            <div class="chess-learn-dots" aria-hidden="true">${l.steps.map((_, i) => `<i class="${i < stepIdx ? 'is-done' : i === stepIdx ? 'is-on' : ''}"></i>`).join('')}</div>
            <p class="chess-learn-text">${esc(s.text)}</p>
            <div class="chess-wrap chess-learn-wrap">${boardHtml(s)}</div>
            ${status}
            <div class="chess-learn-actions">
                <button type="button" class="boardgame-mini-btn" data-cl="prev"${stepIdx <= 0 ? ' disabled' : ''}>← 이전</button>
                ${s.info ? '' : '<button type="button" class="boardgame-mini-btn" data-cl="retry">다시 하기</button>'}
                <button type="button" class="boardgame-primary-btn" data-cl="next"${solved ? '' : ' disabled'}>${nextLabel}</button>
            </div>`;
    }

    function open() {
        bind();
        loadProgress();
        const el = view();
        if (el) el.innerHTML = '';
        showList();
    }

    function close() {
        lessonIdx = -1;
        game = null;
        selected = null;
    }

    return {
        open,
        close,
        isActive: () => lessonIdx >= 0,
        // 테스트·점검용
        _state: () => ({ lessonIdx, stepIdx, solved, wrongs, done: done.slice() }),
    };
}
