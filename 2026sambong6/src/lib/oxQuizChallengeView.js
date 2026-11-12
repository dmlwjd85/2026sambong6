/**
 * OX 퀴즈 '무제한 도전' 화면. 연습 화면과 같은 무대(body)를 빌려 씁니다.
 * - 시작할 때 서버를 기다리지 않아요. 첫 문제가 바로 떠요.
 * - 판이 끝나면 내 학생별 문서(challengeBoard/entries/{학번})에만 저장해요. 반 친구들과 부딪히지 않아요.
 * - 랭킹은 무제한 도전 화면이 열려 있는 동안만 실시간으로 구독해요(학생은 위 15줄 + 내 문서, 선생님은 전체).
 * - 진행 중인 판은 이 기기 localStorage에 남겨, 새로고침·창 닫기 뒤 다시 열면 그 판을 마무리해요.
 *   이때 기기 저장값은 그대로 믿지 않고 검사하며, 봉은 조금만(2봉까지) 줘요.
 */
import { OX_TIME_CHOICES, clampOxChoice } from './oxQuiz.js';
import {
    OX_CHALLENGE_TOP_N,
    challengeResultNote,
    challengeTodayNote,
    createChallengeDeck,
    friendlyOxError,
    kstDateStr,
    newChallengeRunId,
    normalizeRankScope,
    rankChallengeRows,
    verifyRecoveredRun,
    visibleChallengeRows,
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
        rows: [], // 랭킹 줄(학생별 문서)
        rowsLoaded: false,
        mine: null, // 내 학생별 문서
        mineLoaded: false,
        scope: 'top5',
        unsub: [],
        run: null,
        deck: null,
        item: null,
        qStartedAt: 0,
        timer: 0,
        touch: 0,
        result: null,
        lastWrong: null,
        recovering: false,
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

    function rerenderIfIdle() {
        if (st.active && st.mode !== 'play') render();
    }

    // ---------- 구독(화면이 열려 있는 동안만) ----------
    function subscribe() {
        if (st.unsub.length) return;
        const teacher = !!api.isAdmin();
        if (api.watchChallengeBoard) {
            st.unsub.push(api.watchChallengeBoard({ teacher }, (rows) => {
                st.rows = rows || [];
                st.rowsLoaded = true;
                rerenderIfIdle();
            }, (e) => {
                console.warn('ox challenge board', e);
                st.rowsLoaded = true;
                rerenderIfIdle();
            }));
        }
        if (api.watchChallengeSettings) {
            st.unsub.push(api.watchChallengeSettings((settings) => {
                st.scope = normalizeRankScope(settings && settings.rankScope);
                rerenderIfIdle();
            }));
        }
        if (canRecord() && api.watchChallengeMine) {
            st.unsub.push(api.watchChallengeMine(myId(), (entry) => {
                st.mine = entry || null;
                st.mineLoaded = true;
                rerenderIfIdle();
            }, () => {
                st.mineLoaded = true;
                rerenderIfIdle();
            }));
        } else {
            st.mineLoaded = true;
        }
    }

    function unsubscribe() {
        st.unsub.forEach((fn) => { try { fn(); } catch (e) { /* 이미 끊김 */ } });
        st.unsub = [];
        st.rowsLoaded = false;
        st.mineLoaded = false;
    }

    /** 새로고침·창 닫기로 끝나지 못한 내 판을 마무리해요(봉은 판마다 한 번만, 복구 판은 2봉까지). */
    async function recoverStaleRuns() {
        if (!canRecord() || st.recovering) return;
        const questions = (getBank() && getBank().questions) || [];
        if (!questions.length) return; // 문제 은행을 아직 못 읽었으면 다음에 해요.
        const runs = readRuns();
        const mine = Object.values(runs).filter((r) => r && r.studentId === myId()
            && (!api.appKey || r.appKey === api.appKey())
            && (!st.run || r.runId !== st.run.runId)
            && Date.now() - (Number(r.touchedAt) || 0) > STALE_MS);
        if (!mine.length) return;
        st.recovering = true;
        try {
            for (const run of mine) {
                const checked = verifyRecoveredRun(run, questions);
                if (!checked) {
                    // 0개였거나 기기 저장값이 맞지 않는 판은 서버에 보내지 않아요(오늘 봉 받는 판도 쓰지 않아요).
                    dropRunLocal(run.runId);
                    continue;
                }
                const fixed = { ...run, correct: checked, elapsedMs: Math.max(0, (Number(run.touchedAt) || 0) - (Number(run.startedAt) || 0)) };
                try {
                    const res = await api.finishChallenge(myId(), api.studentName(), fixed, { recovered: true });
                    dropRunLocal(run.runId);
                    if (res && res.plan && res.plan.paidNow && res.plan.bong > 0) {
                        await api.alert(`지난번에 끝내지 못한 무제한 도전(${num(checked)}개)을 마무리했어요. ${num(res.plan.bong)}봉을 받았어요.`);
                    }
                } catch (e) {
                    console.warn('ox challenge recover', e);
                }
            }
        } finally {
            st.recovering = false;
        }
    }

    function rankingRows() {
        // 명단에 없는 학번은 빼고, 이름은 명단 이름으로 보여 줘요(문서의 이름 칸은 믿지 않아요).
        const rows = (st.rows || [])
            .filter((r) => !api.rosterName || api.rosterName(r.id))
            .map((r) => (api.rosterName ? { ...r, name: api.rosterName(r.id) } : r));
        return rankChallengeRows(rows);
    }

    function rowHtml(row, id) {
        return `<li class="${row.id === id ? 'is-me' : ''}">
                <span class="oxc-rank">${row.rank ? `${num(row.rank)}등` : '나'}</span>
                <span class="oxc-name">${api.isGuest() ? '○○○' : esc(row.name)}</span>
                <span class="oxc-score">${num(row.best)}개</span>
            </li>`;
    }

    function rankingHtml() {
        if (!st.rowsLoaded) return '<p class="oxc-muted">랭킹을 불러오고 있어요.</p>';
        const id = myId();
        const teacher = !!api.isAdmin();
        const ranked = rankingRows();
        const view = visibleChallengeRows(ranked, { meId: id, scope: st.scope, teacher });
        let mineRow = view.me;
        // 내가 구독한 줄 밖에 있으면 내 문서로 '내 기록'만 보여 줘요(순위는 모르니 숨겨요).
        if (!teacher && !mineRow && !view.rows.some((r) => r.id === id) && st.mine && num(st.mine.best) > 0) {
            mineRow = { id, name: api.rosterName ? api.rosterName(id) || api.studentName() : api.studentName(), best: num(st.mine.best), rank: 0 };
        }
        if (view.hidden) {
            return `<p class="oxc-muted">선생님이 반 랭킹을 숨겼어요.${mineRow ? '' : ' 내 기록을 만들어 보세요!'}</p>${mineRow ? `<ol class="oxc-list oxc-results">${rowHtml(mineRow, id)}</ol>` : ''}`;
        }
        if (!view.rows.length && !mineRow) return '<p class="oxc-muted">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</p>';
        const list = view.rows.map((row) => rowHtml(row, id)).join('');
        const me = mineRow ? `<li class="oxc-gap" aria-hidden="true">⋯</li>${rowHtml(mineRow, id)}` : '';
        const foot = teacher
            ? '<p class="oxc-muted">선생님 화면에만 전체 순위가 보여요. 0개 기록은 순위에 넣지 않아요.</p>'
            : `<p class="oxc-muted">위 ${OX_CHALLENGE_TOP_N}명과 내 기록만 보여요. 친구가 기록을 세우면 바로 바뀌어요.</p>`;
        return `<ol class="oxc-list oxc-results">${list}${me}</ol>${foot}`;
    }

    function scopeHtml() {
        if (!api.isAdmin() || !api.setChallengeRankScope) return '';
        const btn = (key, label) => `<button type="button" class="ox-choice${st.scope === key ? ' is-on' : ''}" data-oxx-scope="${key}">${label}</button>`;
        return `<p class="ox-label">학생 화면 랭킹</p>
            <div class="ox-row">${btn('top5', `위 ${OX_CHALLENGE_TOP_N}명 보여 주기`)}${btn('off', '숨기기(내 기록만)')}</div>`;
    }

    function renderHome() {
        const today = kstDateStr();
        let note;
        if (api.isAdmin()) note = '학생들의 무제한 도전 랭킹이에요. 선생님 기기는 풀어 볼 수만 있고 기록되지 않아요.';
        else if (!canRecord()) note = '손님은 풀어 볼 수만 있어요. 기록과 봉은 내 이름으로 들어와야 남아요.';
        else note = st.mineLoaded ? challengeTodayNote(st.mine, today) : '오늘 기록을 확인하고 있어요.';
        const best = st.mine && Number.isFinite(Number(st.mine.best)) ? num(st.mine.best) : null;
        body.innerHTML = `
            ${modeTabs('challenge')}
            <div class="oxx-home">
                <p class="oxc-lead">틀릴 때까지 끝없이 풀어요. 한 문제 ${num(timeSec())}초예요.</p>
                <p class="oxx-note">${esc(note)}</p>
                ${best !== null && canRecord() ? `<p class="ox-label oxx-best">내 최고 기록 ${best}개</p>` : ''}
                ${scopeHtml()}
                <p class="ox-label">반 랭킹</p>
                ${rankingHtml()}
            </div>
            <button type="button" class="ox-go" data-oxx-action="start">무제한 도전 시작</button>`;
    }

    function renderPlay() {
        const item = st.item;
        const version = typeof window !== 'undefined' && window.APP_VERSION ? window.APP_VERSION : '';
        const rewardHint = canRecord() && st.mineLoaded && !(st.mine && st.mine.dayDate === st.run.date) ? ' · 오늘 첫 판' : '';
        body.innerHTML = `
            <div class="ox-play-top">
                <span class="ox-play-count"><span>${num(st.run.correct) + 1}번째</span>${version ? `<span class="ox-version">${esc(version)}</span>` : ''}</span>
                <span class="oxc-pill">${num(st.run.correct)}개 맞힘${rewardHint}</span>
                <span class="oxx-timer" data-oxx-timer>${num(timeSec())}</span>
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
            <div class="oxx-home">
                <p class="oxc-lead">${num(r.correct)}개 맞혔어요!${r.newBest ? ' 새 최고 기록이에요.' : ''}</p>
                ${note ? `<p class="oxx-note">${esc(note)}</p>` : ''}
                ${wrong ? `<p class="ox-label">${esc(wrong.prompt)} → 정답 ${esc(wrong.answer)} · 내 답 ${wrong.picked ? esc(wrong.picked) : '시간 초과'}${wrong.explain ? ` · ${esc(wrong.explain)}` : ''}</p>` : ''}
                <p class="ox-label">반 랭킹</p>
                ${rankingHtml()}
            </div>
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

    /** 서버를 기다리지 않고 바로 첫 문제를 띄워요. 보상은 판이 끝날 때 정해요. */
    async function start() {
        if (st.mode === 'play') return;
        const deck = createChallengeDeck(getBank().questions);
        if (!deck.size) {
            await api.alert('문제 은행이 비어 있어요. 선생님이 문제를 올리면 도전할 수 있어요.');
            return;
        }
        const runId = newChallengeRunId();
        st.run = { runId, studentId: myId(), date: kstDateStr(), correct: 0, elapsedMs: 0, startedAt: Date.now(), ids: [] };
        st.result = null;
        st.lastWrong = null;
        st.deck = deck;
        st.mode = 'play';
        saveRunLocal();
        if (st.touch) clearInterval(st.touch);
        st.touch = setInterval(saveRunLocal, 5000);
        nextQuestion();
    }

    async function answer(picked) {
        if (st.mode !== 'play' || !st.item) return;
        const item = st.item;
        if (picked && picked === item.answer) {
            st.run.correct += 1;
            st.run.ids.push(String(item.id || ''));
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
        st.run = null;
        st.result = { correct: run.correct, newBest: false, note: canRecord() ? '기록을 저장하고 있어요.' : '' };
        render();
        if (!canRecord()) {
            st.result.note = api.isAdmin() ? '선생님 기기 기록은 랭킹에 들어가지 않아요.' : '손님 기록은 랭킹에 들어가지 않아요.';
            render();
            return;
        }
        try {
            const res = await api.finishChallenge(myId(), api.studentName(), run, { recovered: false });
            dropRunLocal(run.runId);
            if (res && res.entry) st.mine = res.entry;
            st.result = { correct: run.correct, newBest: !!(res && res.plan && res.plan.newBest), note: challengeResultNote(res && res.plan) };
        } catch (e) {
            // 저장에 실패한 판은 localStorage에 남겨 두고, 다음에 OX 화면을 열 때 다시 보내요.
            console.warn('ox challenge finish', e);
            st.result.note = `${friendlyOxError(e)} 기록은 이 기기에 남겨 두었다가 다음에 OX 퀴즈를 열면 다시 저장할게요.`;
        }
        if (st.active) render();
    }

    async function setScope(scope) {
        if (!api.isAdmin() || !api.setChallengeRankScope) return;
        const prev = st.scope;
        st.scope = normalizeRankScope(scope);
        render();
        try {
            await api.setChallengeRankScope(st.scope);
        } catch (e) {
            console.warn('ox challenge scope', e);
            st.scope = prev;
            render();
            await api.alert(`랭킹 공개 설정을 바꾸지 못했어요. ${friendlyOxError(e)}`);
        }
    }

    function handleClick(event) {
        const ans = event.target.closest('[data-oxx-answer]');
        if (ans) {
            void answer(ans.getAttribute('data-oxx-answer'));
            return true;
        }
        const scopeBtn = event.target.closest('[data-oxx-scope]');
        if (scopeBtn) {
            void setScope(scopeBtn.getAttribute('data-oxx-scope'));
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
        subscribe();
        render();
        await recoverStaleRuns();
    }

    function leave() {
        if (st.mode === 'play') void finish();
        st.active = false;
        stopTimers();
        unsubscribe();
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
            leave();
        },
        /** 무대를 열 때 끝나지 못한 판을 조용히 마무리해요. */
        open() {
            void recoverStaleRuns();
        },
    };
}
