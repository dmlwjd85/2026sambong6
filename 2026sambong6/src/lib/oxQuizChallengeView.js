/**
 * OX 퀴즈 '무제한 도전' 화면. 연습 화면과 같은 무대(body)를 빌려 씁니다.
 * 랭킹 문서는 화면을 열 때와 판이 끝날 때만 읽어요(구독하지 않아요).
 * 진행 중인 판은 이 기기 localStorage에 남겨, 새로고침·창 닫기 뒤 다시 열면 그 판을 마무리해요.
 */
import { OX_TIME_CHOICES, clampOxChoice } from './oxQuiz.js';
import {
    challengeResultNote,
    challengeTodayNote,
    createChallengeDeck,
    kstDateStr,
    newChallengeRunId,
    rankChallengeBoard,
} from './oxQuizChallenge.js';

const RUN_KEY = 'sambong_ox_challenge_runs';
/** 다른 탭이 아직 풀고 있는 판은 건드리지 않아요. 이만큼 손이 안 닿은 판만 마무리해요. */
const STALE_MS = 45000;

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function errText(e) {
    return e && e.message ? e.message : String(e);
}

function readRuns() {
    try {
        const raw = JSON.parse(localStorage.getItem(RUN_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
        return {};
    }
}

function writeRuns(runs) {
    try {
        localStorage.setItem(RUN_KEY, JSON.stringify(runs));
    } catch (e) {
        /* 저장 공간이 없으면 마무리 복구만 빠져요 */
    }
}

export function createOxChallenge({ body, api, getBank, onExit, setMeta, modeTabs }) {
    const st = {
        active: false,
        mode: 'home', // home | play | over
        board: null,
        boardLoaded: false,
        run: null,
        deck: null,
        item: null,
        qStartedAt: 0,
        timer: 0,
        touch: 0,
        rewardRun: false,
        result: null,
        lastWrong: null,
        busy: false,
    };

    const myId = () => String(api.studentId() || '');
    const canRecord = () => !!myId() && !api.isGuest() && !api.isAdmin();
    const timeSec = () => clampOxChoice(Number((getBank().settings || {}).timeSec), OX_TIME_CHOICES, 15);

    function stopTimers() {
        if (st.timer) clearInterval(st.timer);
        if (st.touch) clearInterval(st.touch);
        st.timer = 0;
        st.touch = 0;
    }

    function saveRunLocal() {
        if (!st.run || !canRecord()) return;
        const runs = readRuns();
        runs[st.run.runId] = { ...st.run, appKey: api.appKey ? api.appKey() : '', touchedAt: Date.now() };
        writeRuns(runs);
    }

    function dropRunLocal(runId) {
        const runs = readRuns();
        delete runs[runId];
        writeRuns(runs);
    }

    async function loadBoard() {
        try {
            st.board = await api.loadChallengeBoard();
        } catch (e) {
            console.warn('ox challenge board', e);
        }
        st.boardLoaded = true;
    }

    /** 새로고침·창 닫기로 끝나지 못한 내 판을 마무리해요(봉은 판마다 한 번만). */
    async function recoverStaleRuns() {
        if (!canRecord()) return;
        const runs = readRuns();
        const mine = Object.values(runs).filter((r) => r && r.studentId === myId()
            && (!api.appKey || r.appKey === api.appKey())
            && Date.now() - (Number(r.touchedAt) || 0) > STALE_MS);
        for (const run of mine) {
            try {
                const res = await api.finishChallenge(myId(), api.studentName(), run);
                if (res && res.board) st.board = res.board;
                dropRunLocal(run.runId);
                if (res && res.plan && res.plan.paidNow && res.plan.bong > 0) {
                    await api.alert(`지난번에 끝내지 못한 무제한 도전(${num(run.correct)}개)을 마무리했어요. ${num(res.plan.bong)}봉을 받았어요.`);
                }
            } catch (e) {
                console.warn('ox challenge recover', e);
            }
        }
    }

    function rankingHtml(limit) {
        // 명단에 없는 학번은 빼고, 이름은 명단 이름으로 보여 줘요(랭킹 문서의 이름 칸은 믿지 않아요).
        const rows = rankChallengeBoard(st.board)
            .filter((r) => !api.rosterName || api.rosterName(r.id))
            .map((r) => (api.rosterName ? { ...r, name: api.rosterName(r.id) } : r));
        // 같은 기록은 같은 순위(빠진 줄이 있어도 다시 매겨요)
        rows.forEach((row, i) => {
            const prev = rows[i - 1];
            row.rank = (!prev || prev.best !== row.best || prev.bestMs !== row.bestMs) ? i + 1 : prev.rank;
        });
        if (!rows.length) return '<p class="oxc-muted">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</p>';
        const id = myId();
        const shown = rows.slice(0, limit || rows.length);
        const meRow = rows.find((r) => r.id === id);
        if (meRow && !shown.includes(meRow)) shown.push(meRow);
        return `<ol class="oxc-list oxc-results">${shown.map((row) => `
            <li class="${row.id === id ? 'is-me' : ''}">
                <span class="oxc-rank">${num(row.rank)}등</span>
                <span class="oxc-name">${api.isGuest() ? '○○○' : esc(row.name)}</span>
                <span class="oxc-score">${num(row.best)}개</span>
            </li>`).join('')}</ol>`;
    }

    function renderHome() {
        const today = kstDateStr();
        const entry = st.board && st.board.entries ? st.board.entries[myId()] : null;
        let note;
        if (api.isAdmin()) note = '학생들의 무제한 도전 랭킹이에요. 선생님 기기는 풀어 볼 수만 있고 기록되지 않아요.';
        else if (!canRecord()) note = '손님은 풀어 볼 수만 있어요. 기록과 봉은 내 이름으로 들어와야 남아요.';
        else note = st.boardLoaded ? challengeTodayNote(st.board, myId(), today) : '오늘 기록을 확인하고 있어요.';
        body.innerHTML = `
            ${modeTabs('challenge')}
            <p class="oxc-lead">틀릴 때까지 끝없이 풀어요. 한 문제 ${num(timeSec())}초예요.</p>
            <p class="oxx-note">${esc(note)}</p>
            ${entry && Number.isFinite(Number(entry.best)) ? `<p class="ox-label">내 최고 기록 ${num(entry.best)}개</p>` : ''}
            <p class="ox-label">반 랭킹</p>
            ${st.boardLoaded ? rankingHtml() : '<p class="oxc-muted">랭킹을 불러오고 있어요.</p>'}
            <button type="button" class="ox-go" data-oxx-action="start">무제한 도전 시작</button>`;
    }

    function renderPlay() {
        const item = st.item;
        const version = typeof window !== 'undefined' && window.APP_VERSION ? window.APP_VERSION : '';
        body.innerHTML = `
            <div class="ox-play-top">
                <span class="ox-play-count"><span>${num(st.run.correct) + 1}번째</span>${version ? `<span class="ox-version">${esc(version)}</span>` : ''}</span>
                <span class="oxc-pill">${num(st.run.correct)}개 맞힘${st.rewardRun ? ' · 봉 받는 판' : ''}</span>
                <span data-oxx-timer>${num(timeSec())}</span>
            </div>
            <p class="ox-prompt">${esc(item.prompt)}</p>
            <div class="ox-answers">
                <button type="button" class="ox-mark" data-oxx-answer="O"><img src="ox/ox-mark-o.jpg" alt="O"></button>
                <button type="button" class="ox-mark" data-oxx-answer="X"><img src="ox/ox-mark-x.jpg" alt="X"></button>
            </div>`;
        const timerEl = body.querySelector('[data-oxx-timer]');
        if (st.timer) clearInterval(st.timer);
        st.timer = setInterval(() => {
            const left = timeSec() - (Date.now() - st.qStartedAt) / 1000;
            if (timerEl) timerEl.textContent = String(Math.max(0, Math.ceil(left)));
            if (left <= 0) void answer('');
        }, 200);
    }

    function renderOver() {
        const r = st.result || {};
        const wrong = st.lastWrong;
        const note = r.note || '';
        body.innerHTML = `
            <p class="oxc-lead">${num(r.correct)}개 맞혔어요!${r.newBest ? ' 새 최고 기록이에요.' : ''}</p>
            ${note ? `<p class="oxx-note">${esc(note)}</p>` : ''}
            ${wrong ? `<p class="ox-label">${esc(wrong.prompt)} → 정답 ${esc(wrong.answer)} · 내 답 ${wrong.picked ? esc(wrong.picked) : '시간 초과'}${wrong.explain ? ` · ${esc(wrong.explain)}` : ''}</p>` : ''}
            <p class="ox-label">반 랭킹</p>
            ${rankingHtml()}
            <div class="oxc-actions">
                <button type="button" class="ox-choice" data-oxx-action="home">처음으로</button>
                <button type="button" class="ox-go" data-oxx-action="start">다시 도전</button>
            </div>`;
    }

    function render() {
        if (!st.active) return;
        if (setMeta) setMeta(st.mode === 'play' ? '무제한 도전' : '무제한 도전 · 랭킹');
        if (st.mode === 'play') renderPlay();
        else if (st.mode === 'over') renderOver();
        else renderHome();
    }

    function nextQuestion() {
        st.item = st.deck.next();
        st.qStartedAt = Date.now();
        render();
    }

    async function start() {
        if (st.busy) return;
        const deck = createChallengeDeck(getBank().questions);
        if (!deck.size) {
            await api.alert('문제 은행이 비어 있어요. 선생님이 문제를 올리면 도전할 수 있어요.');
            return;
        }
        st.busy = true;
        const runId = newChallengeRunId();
        const today = kstDateStr();
        st.run = { runId, studentId: myId(), date: today, correct: 0, elapsedMs: 0, startedAt: Date.now() };
        st.rewardRun = false;
        st.result = null;
        st.lastWrong = null;
        if (canRecord()) {
            saveRunLocal();
            try {
                const res = await api.startChallenge(myId(), api.studentName(), runId, today);
                st.rewardRun = !!(res && res.rewardRun);
                if (res && res.board) st.board = res.board;
            } catch (e) {
                console.warn('ox challenge start', e);
            }
        }
        st.busy = false;
        st.deck = deck;
        st.mode = 'play';
        if (st.touch) clearInterval(st.touch);
        st.touch = setInterval(saveRunLocal, 5000);
        nextQuestion();
    }

    async function answer(picked) {
        if (st.mode !== 'play' || !st.item) return;
        const item = st.item;
        if (picked && picked === item.answer) {
            st.run.correct += 1;
            st.run.elapsedMs = Date.now() - st.run.startedAt;
            saveRunLocal();
            nextQuestion();
            return;
        }
        st.lastWrong = { ...item, picked };
        await finish();
    }

    async function finish() {
        if (st.mode !== 'play' || !st.run) return;
        stopTimers();
        st.mode = 'over';
        const run = { ...st.run, elapsedMs: Date.now() - st.run.startedAt };
        st.result = { correct: run.correct, newBest: false, note: canRecord() ? '기록을 저장하고 있어요.' : '' };
        render();
        if (!canRecord()) {
            st.result.note = api.isAdmin() ? '선생님 기기 기록은 랭킹에 들어가지 않아요.' : '손님 기록은 랭킹에 들어가지 않아요.';
            render();
            return;
        }
        try {
            const res = await api.finishChallenge(myId(), api.studentName(), run);
            if (res && res.board) st.board = res.board;
            dropRunLocal(run.runId);
            st.result = { correct: run.correct, newBest: !!(res && res.plan && res.plan.newBest), note: challengeResultNote(res && res.plan) };
        } catch (e) {
            // 저장에 실패한 판은 localStorage에 남겨 두고, 다음에 OX 화면을 열 때 다시 보내요.
            st.result.note = '기록을 저장하지 못했어요. 다음에 OX 퀴즈를 열면 다시 보내요.\n' + errText(e);
        }
        if (st.active) render();
    }

    function handleClick(event) {
        const ans = event.target.closest('[data-oxx-answer]');
        if (ans) {
            void answer(ans.getAttribute('data-oxx-answer'));
            return true;
        }
        const btn = event.target.closest('[data-oxx-action]');
        if (!btn) return false;
        const action = btn.getAttribute('data-oxx-action');
        if (action === 'start') void start();
        if (action === 'home') {
            st.mode = 'home';
            render();
        }
        return true;
    }

    async function enter() {
        st.active = true;
        st.mode = st.mode === 'play' ? 'play' : 'home';
        // 들어올 때마다 새 랭킹을 읽어요. 그 전에는 지난 안내(어제 봉 받은 판 등)를 보여 주지 않아요.
        if (st.mode !== 'play') st.boardLoaded = false;
        render();
        await recoverStaleRuns();
        await loadBoard();
        if (st.active && st.mode !== 'play') render();
    }

    function leave() {
        if (st.mode === 'play') void finish();
        st.active = false;
        stopTimers();
        st.mode = 'home';
    }

    return {
        isActive: () => st.active,
        render,
        handleClick,
        enter,
        leave,
        /** 무대를 닫을 때: 풀던 판은 거기까지로 마무리해요. */
        close() {
            if (st.mode === 'play') void finish();
            st.active = false;
            stopTimers();
            st.mode = 'home';
        },
        /** 무대를 열 때 끝나지 못한 판을 조용히 마무리해요. */
        open() {
            void recoverStaleRuns();
        },
    };
}
