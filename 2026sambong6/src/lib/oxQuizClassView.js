/**
 * OX 퀴즈 '함께 풀기' 화면. 연습 화면(oxQuizView.js)과 같은 무대(body)를 빌려 씁니다.
 * 판 문서 하나(oxQuizBank/live)를 구독하고, 학생은 자기 답 문서만 씁니다.
 * 선생님 기기가 시간 마감·정답 공개·다음 문제를 맡습니다.
 */
import { OX_COUNT_CHOICES, OX_TIME_CHOICES, listOxSubjects } from './oxQuiz.js';
import {
    OX_CLASS_LIVES_CHOICES,
    OX_CLASS_REVEAL_MS,
    buildClassRound,
    canPickNow,
    classConditionSummary,
    classRoundStalled,
    isClassRoundAbandoned,
    sanitizeClassLive,
    classRemainingMs,
    finishPatch,
    isClassRoundActive,
    isClassRoundVisible,
    joinDoc,
    nextPatch,
    normalizeClassConditions,
    participantsOf,
    revealPatch,
    revealedCount,
    scoreClassEntry,
    startPatch,
    tallyClassQuestion,
    teacherShouldAdvance,
    teacherShouldReveal,
} from './oxQuizClass.js';

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 판 문서에서 온 숫자는 숫자로만 씁니다. */
function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function errText(e) {
    return e && e.message ? e.message : String(e);
}

function chips(name, list, selected) {
    return list.map(([value, label]) => {
        const on = String(value) === String(selected) ? ' is-on' : '';
        return `<button type="button" class="ox-choice oxc-chip${on}" data-oxc-cond="${name}" data-value="${esc(value)}">${esc(label)}</button>`;
    }).join('');
}

export function createOxClassRound({ body, api, getBank, getSubjectsOn, setSubjectsOn, onExit, setMeta, modeTabs }) {
    const st = {
        live: null,
        liveLoaded: false,
        answers: [],
        mine: null,
        joined: false,
        conditions: normalizeClassConditions({}),
        seen: {},
        unsubLive: null,
        unsubAnswers: null,
        answersRound: '',
        tick: 0,
        busy: false,
        lastKey: '',
        active: false,
    };

    const isTeacher = () => !!api.isAdmin();
    const myId = () => String(api.studentId() || '');
    // 손님 화면에는 실명을 보이지 않아요(#102와 같은 뜻).
    const shownName = (name) => (api.isGuest() ? '○○○' : esc(name));
    const JOINED_KEY = 'sambong_ox_class_joined';
    const joinedKey = (rid) => `${api.appKey ? api.appKey() : ''}:${rid}:${myId()}`;
    function rememberJoined(rid) {
        try { localStorage.setItem(JOINED_KEY, joinedKey(rid)); } catch (e) { /* 없어도 돼요 */ }
    }
    function wasJoined(rid) {
        try { return localStorage.getItem(JOINED_KEY) === joinedKey(rid); } catch (e) { return false; }
    }
    /** 참여 안내를 보여 줄 판인지(버려진 판은 숨겨요) */
    const visibleNow = (live) => isClassRoundVisible(live) && !isClassRoundAbandoned(live, Date.now());
    const activeNow = (live) => isClassRoundActive(live) && !isClassRoundAbandoned(live, Date.now());

    function seenKey(live) {
        return live ? `${live.roundId}:${live.index}` : '';
    }

    function markSeen(live) {
        if (!live || live.status !== 'question') return;
        const key = seenKey(live);
        if (!st.seen[key]) st.seen[key] = Date.now();
    }

    function stopTick() {
        if (st.tick) clearInterval(st.tick);
        st.tick = 0;
    }

    function startTick() {
        if (st.tick) return;
        st.tick = setInterval(onTick, 250);
    }

    function watchAnswersIfTeacher() {
        const live = st.live;
        const rid = isTeacher() && isClassRoundVisible(live) ? live.roundId : '';
        if (rid === st.answersRound) return;
        if (st.unsubAnswers) st.unsubAnswers();
        st.unsubAnswers = null;
        st.answers = [];
        st.answersRound = rid;
        if (!rid || !api.watchAnswers) return;
        st.unsubAnswers = api.watchAnswers(rid, (docs) => {
            // 명단에 없는 학번(가짜 학번)은 빼고, 이름은 명단 이름으로 써요.
            st.answers = (docs || []).filter((d) => !api.rosterName || api.rosterName(d.id))
                .map((d) => (api.rosterName ? { ...d, name: api.rosterName(d.id) } : d));
            if (st.active) render();
        });
    }

    function onLive(live) {
        const prev = st.live;
        const firstLoad = !st.liveLoaded;
        st.live = sanitizeClassLive(live);
        st.liveLoaded = true;
        st.liveSeenAt = Date.now();
        st.stalledShown = false;
        // 무대를 다시 열면 진행 중인 판으로 바로 돌아갑니다. 선생님은 자동 넘기기를 이어서 맡고,
        // 이 판에 들어왔던 학생은 다시 누르지 않아도 이어서 풀어요.
        if (firstLoad && isTeacher() && activeNow(st.live)) st.active = true;
        if (firstLoad && !isTeacher() && activeNow(st.live) && wasJoined(st.live.roundId) && !st.joining) {
            st.joining = true;
            void join().then((okJoin) => {
                st.joining = false;
                if (okJoin && st.joined) {
                    st.active = true;
                    render();
                }
            });
        }
        markSeen(st.live);
        watchAnswersIfTeacher();
        if (st.joined && (!st.live || (prev && prev.roundId !== st.live.roundId) || st.live.status === 'off')) {
            st.joined = false;
            st.mine = null;
        }
        if (st.active && !isTeacher() && !st.joined && !visibleNow(st.live)) {
            st.active = false;
            stopTick();
            onExit('선생님이 함께 풀기를 닫았어요. 연습은 계속할 수 있어요.');
            return;
        }
        // 결과를 보던 학생은 선생님이 새 판을 열면 그 판에 바로 들어갑니다.
        if (st.active && !isTeacher() && !st.joined && activeNow(st.live) && !st.joining) {
            st.joining = true;
            void join().finally(() => {
                st.joining = false;
                if (st.active) render();
            });
        }
        if (st.active) render();
        else onExit(null, true);
    }

    function subscribe() {
        if (st.unsubLive || !api.watchLive) return;
        st.unsubLive = api.watchLive(onLive, (e) => console.warn('ox live', e));
    }

    function unsubscribeAll() {
        stopTick();
        if (st.unsubLive) st.unsubLive();
        if (st.unsubAnswers) st.unsubAnswers();
        st.unsubLive = null;
        st.unsubAnswers = null;
        st.answersRound = '';
        st.answers = [];
    }

    async function transition(build) {
        const live = st.live;
        if (!live || st.busy) return;
        st.busy = true;
        try {
            await api.updateLive(live.roundId, (latest) => build(latest, st.answers, Date.now()));
        } catch (e) {
            console.warn('ox live update', e);
            if (!/stale/.test(errText(e))) await api.alert('함께 풀기를 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.\n' + errText(e));
        } finally {
            st.busy = false;
        }
    }

    function onTick() {
        if (!st.active) return;
        const live = st.live;
        const now = Date.now();
        const timerEl = body.querySelector('[data-oxc-timer]');
        if (live && live.status === 'question') {
            const left = classRemainingMs(live, now, st.seen[seenKey(live)]);
            if (timerEl) timerEl.textContent = String(Math.ceil(left / 1000));
            if (!isTeacher() && left <= 0) {
                const btns = body.querySelectorAll('[data-oxc-pick]');
                if (btns.length) render();
            }
        }
        // 선생님 화면이 멈추면(닫힘 등) 학생 화면은 기다림 안내로 바꿔요.
        if (!isTeacher() && live && classRoundStalled(live, now, st.liveSeenAt) && !st.stalledShown) render();
        if (live && live.status === 'reveal' && timerEl && live.advance === 'auto') {
            const left = OX_CLASS_REVEAL_MS - (now - (Number(live.revealAt) || now));
            timerEl.textContent = String(Math.max(0, Math.ceil(left / 1000)));
        }
        if (!isTeacher() || st.busy || !live) return;
        const people = participantsOf(live, st.answers);
        if (teacherShouldReveal(live, now, people)) void transition((latest, docs, t) => (
            latest.status === 'question' && latest.index === live.index ? revealPatch(latest, docs, t) : null));
        else if (teacherShouldAdvance(live, now)) void transition((latest, docs, t) => (
            latest.status === 'reveal' && latest.index === live.index ? nextPatch(latest, docs, t) : null));
    }

    // ---------- 그리기 ----------
    function renderTeacherSetup() {
        const bank = getBank();
        const subjects = listOxSubjects(bank.questions);
        const on = getSubjectsOn();
        const c = st.conditions;
        const subjectHtml = subjects.length
            ? subjects.map((subject) => `<button type="button" class="ox-choice oxc-chip${on.includes(subject) ? ' is-on' : ''}" data-oxc-subject="${esc(subject)}">${esc(subject)}</button>`).join('')
            : '<p class="ox-empty">문제 은행이 비어 있어요. 연습 화면에서 문제를 먼저 올려 주세요.</p>';
        body.innerHTML = `
            ${modeTabs('class')}
            <div class="oxc-scroll">
                <p class="oxc-lead">반 전체가 같은 문제를 같은 순서로 함께 풀어요.</p>
                <p class="ox-label">과목</p>
                <div class="ox-row">${subjectHtml}</div>
                <p class="ox-label">문항 수</p>
                <div class="ox-row">${chips('count', OX_COUNT_CHOICES.map((v) => [v, `${v}문제`]), c.count)}</div>
                <p class="ox-label">한 문제 제한 시간</p>
                <div class="ox-row">${chips('timeSec', OX_TIME_CHOICES.map((v) => [v, `${v}초`]), c.timeSec)}</div>
                <p class="ox-label">생명(다 잃으면 구경해요)</p>
                <div class="ox-row">${chips('lives', OX_CLASS_LIVES_CHOICES.map((v) => [v, v ? `${v}개` : '끝까지']), c.lives)}</div>
                <p class="ox-label">문제 순서</p>
                <div class="ox-row">${chips('order', [['random', '무작위'], ['sheet', '올린 순서']], c.order)}</div>
                <p class="ox-label">다음 문제로</p>
                <div class="ox-row">${chips('advance', [['auto', '시간 지나면 자동'], ['manual', '선생님이 넘기기']], c.advance)}</div>
            </div>
            <div class="oxc-foot${st.teacherSetup && isClassRoundVisible(st.live) ? ' oxc-actions' : ''}">
                ${st.teacherSetup && isClassRoundVisible(st.live) ? '<button type="button" class="ox-choice" data-oxc-action="back-result">결과로</button>' : ''}
                <button type="button" class="ox-go" data-oxc-action="open-round">함께 풀기 열기</button>
            </div>`;
    }

    function resultList(results, highlightId) {
        if (!results || !results.length) return '<p class="ox-empty">참여한 학생이 없어요.</p>';
        return `<ol class="oxc-list oxc-results">${results.map((row) => `
            <li class="${row.id === highlightId ? 'is-me' : ''}">
                <span class="oxc-rank">${num(row.rank)}등</span>
                <span class="oxc-name">${shownName(row.name)}${row.out ? ' <small>탈락</small>' : ''}</span>
                <span class="oxc-score">${num(row.correct)}개</span>
            </li>`).join('')}</ol>`;
    }

    function questionTop(live, extra) {
        const version = typeof window !== 'undefined' && window.APP_VERSION ? window.APP_VERSION : '';
        return `<div class="ox-play-top">
            <span class="ox-play-count"><span>${num(live.index) + 1} / ${num(live.items.length)}</span>${version ? `<span class="ox-version">${esc(version)}</span>` : ''}</span>
            ${extra || '<span></span>'}
            <span data-oxc-timer></span>
        </div>`;
    }

    function hearts(live, score) {
        const lives = Math.min(3, Math.max(0, Math.floor(num(live.lives))));
        if (!lives) return '';
        return `<span class="ox-hearts">${Array.from({ length: lives }, (_, i) => `<span class="ox-heart${i < score.livesLeft ? ' is-on' : ''}"></span>`).join('')}</span>`;
    }

    function renderTeacherRoom() {
        const live = st.live;
        const people = participantsOf(live, st.answers);
        const item = live.items[Number(live.index) || 0];
        if (['question', 'reveal'].includes(live.status) && !item) {
            body.innerHTML = `<p class="oxc-lead">판 문서가 이상해요. 끝내고 새 판을 열어 주세요.</p>
                <div class="oxc-actions">
                    <button type="button" class="ox-choice" data-oxc-action="close-round">닫기</button>
                    <button type="button" class="ox-go" data-oxc-action="finish-round">끝내기</button>
                </div>`;
            return;
        }
        if (live.status === 'lobby') {
            body.innerHTML = `
                <p class="oxc-lead">학생들에게 'OX 퀴즈 → 함께 풀기 참여'를 눌러 달라고 해 주세요.</p>
                <p class="ox-label">${esc(classConditionSummary(live))}</p>
                <p class="ox-label">들어온 학생 ${people.length}명</p>
                <ul class="oxc-list oxc-names">${people.map((p) => `<li>${shownName(p.name)}</li>`).join('') || '<li class="oxc-muted">아직 아무도 없어요.</li>'}</ul>
                <div class="oxc-actions">
                    <button type="button" class="ox-choice" data-oxc-action="close-round">닫기</button>
                    <button type="button" class="ox-go" data-oxc-action="start-round">첫 문제 시작</button>
                </div>`;
            return;
        }
        if (live.status === 'question') {
            const active = people.filter((p) => !(p.out && p.outAt < live.index) && (Number(p.joinIndex) || 0) <= live.index);
            const done = active.filter((p) => p.picks && p.picks[String(live.index)]).length;
            body.innerHTML = `
                ${questionTop(live, `<span class="oxc-pill">${num(done)} / ${num(active.length)}명 답함</span>`)}
                <p class="ox-prompt">${esc(item.prompt)}</p>
                <div class="oxc-actions">
                    <button type="button" class="ox-choice" data-oxc-action="finish-round">끝내기</button>
                    <button type="button" class="ox-go" data-oxc-action="reveal">정답 보기</button>
                </div>`;
            onTick();
            return;
        }
        if (live.status === 'reveal') {
            const tally = live.tally || tallyClassQuestion(live, st.answers);
            const last = (Number(live.index) || 0) + 1 >= live.items.length;
            body.innerHTML = `
                ${questionTop(live, live.advance === 'auto' ? '<span class="oxc-pill">곧 다음 문제</span>' : '')}
                <p class="oxc-answer">정답 <b>${esc(item.answer)}</b></p>
                <p class="ox-label oxc-center">O ${num(tally.O)}명 · X ${num(tally.X)}명 · 못 고름 ${num(tally.none)}명</p>
                <p class="ox-explain">${esc(item.explain || item.prompt)}</p>
                <div class="oxc-actions">
                    <button type="button" class="ox-choice" data-oxc-action="finish-round">끝내기</button>
                    <button type="button" class="ox-go" data-oxc-action="next">${last ? '결과 보기' : '다음 문제'}</button>
                </div>`;
            onTick();
            return;
        }
        if (live.status === 'done') {
            body.innerHTML = `
                <p class="oxc-lead">함께 풀기 결과예요. ${num(revealedCount(live))}문제를 풀었어요.</p>
                ${resultList(live.results, '')}
                <div class="oxc-actions">
                    <button type="button" class="ox-choice" data-oxc-action="close-round">닫기</button>
                    <button type="button" class="ox-go" data-oxc-action="new-round">새 판 만들기</button>
                </div>`;
        }
    }

    function renderStudentRoom() {
        const live = st.live;
        if (!live) {
            body.innerHTML = '<p class="ox-prompt">함께 풀기를 기다리고 있어요.</p><button type="button" class="ox-go" data-oxc-action="leave">연습으로 돌아가기</button>';
            return;
        }
        const id = myId();
        const mine = st.mine ? { ...st.mine, id } : null;
        const score = mine ? scoreClassEntry(live, mine) : { livesLeft: 0, correct: 0, out: false };
        const index = Number(live.index) || 0;
        const item = live.items[index];
        const leaveBtn = '<button type="button" class="ox-go" data-oxc-action="leave">연습으로 돌아가기</button>';
        if (isClassRoundAbandoned(live, Date.now())) {
            body.innerHTML = `<p class="ox-prompt">이 함께 풀기는 오랫동안 진행되지 않았어요. 선생님이 새 판을 열면 다시 알려 드려요.</p>${leaveBtn}`;
            return;
        }
        if (['question', 'reveal'].includes(live.status) && (!item || classRoundStalled(live, Date.now(), st.liveSeenAt))) {
            st.stalledShown = true;
            body.innerHTML = `
                ${item ? questionTop(live, hearts(live, score)) : ''}
                <p class="ox-prompt">선생님 화면을 기다리고 있어요.</p>
                <p class="ox-label oxc-center">선생님 화면이 잠시 멈춘 것 같아요. 다시 움직이면 바로 이어서 풀어요.</p>
                ${leaveBtn}`;
            return;
        }
        if (live.status === 'lobby') {
            body.innerHTML = `
                <p class="ox-prompt">선생님이 시작하면 다 같이 풀어요.</p>
                <p class="ox-label oxc-center">${esc(classConditionSummary(live))}</p>
                <button type="button" class="ox-go" data-oxc-action="leave">연습으로 돌아가기</button>`;
            return;
        }
        if (live.status === 'question') {
            markSeen(live);
            const pick = mine && mine.picks && mine.picks[String(index)];
            const left = classRemainingMs(live, Date.now(), st.seen[seenKey(live)]);
            const late = mine && index < (Number(mine.joinIndex) || 0);
            let bottom;
            if (!mine) bottom = '<p class="oxc-wait">구경하고 있어요. 내 이름으로 들어오면 같이 풀 수 있어요.</p>';
            else if (score.out) bottom = '<p class="oxc-wait">생명을 다 썼어요. 끝까지 함께 구경해요.</p>';
            else if (late) bottom = '<p class="oxc-wait">다음 문제부터 같이 풀어요.</p>';
            else if (pick) bottom = `<p class="oxc-wait"><b>${esc(pick.p)}</b>를 골랐어요. 정답 발표를 기다려요.</p>`;
            else if (left <= 0) bottom = '<p class="oxc-wait">시간이 끝났어요. 정답 발표를 기다려요.</p>';
            else bottom = `<div class="ox-answers">
                <button type="button" class="ox-mark" data-oxc-pick="O"><img src="ox/ox-mark-o.jpg" alt="O"></button>
                <button type="button" class="ox-mark" data-oxc-pick="X"><img src="ox/ox-mark-x.jpg" alt="X"></button>
            </div>`;
            body.innerHTML = `
                ${questionTop(live, hearts(live, score))}
                <p class="ox-prompt">${esc(item.prompt)}</p>
                ${bottom}`;
            onTick();
            return;
        }
        if (live.status === 'reveal') {
            // 공개 때 고정된 답(frozen)을 봐요. 공개 뒤 늦게 들어간 답은 맞힌 것으로 치지 않아요.
            const frozenNow = live.frozen && live.frozen[String(index)];
            const pick = frozenNow ? frozenNow[id] : (mine && mine.picks && mine.picks[String(index)]);
            const counted = mine && index >= (Number(mine.joinIndex) || 0);
            let verdict = '';
            if (counted && !(score.out && score.outAt < index)) {
                if (pick && pick.p === item.answer) verdict = '<p class="oxc-verdict is-ok">맞았어요!</p>';
                else verdict = `<p class="oxc-verdict is-no">${pick ? '아쉬워요, 틀렸어요.' : '시간 안에 못 골랐어요.'}</p>`;
            }
            body.innerHTML = `
                ${questionTop(live, hearts(live, score))}
                <p class="oxc-answer">정답 <b>${esc(item.answer)}</b></p>
                ${verdict}
                <p class="ox-explain">${esc(item.explain || item.prompt)}</p>
                <p class="ox-label oxc-center">지금까지 ${num(score.correct)}개 맞혔어요.${live.advance === 'manual' ? ' 선생님이 다음 문제로 넘겨요.' : ''}</p>`;
            onTick();
            return;
        }
        if (live.status === 'done') {
            const meRow = (live.results || []).find((row) => row.id === id);
            body.innerHTML = `
                <p class="oxc-lead">${meRow ? `${num(meRow.rank)}등이에요! ${num(revealedCount(live))}문제 중 ${num(meRow.correct)}개 맞혔어요.` : '함께 풀기 결과예요.'}</p>
                ${resultList(live.results, id)}
                <button type="button" class="ox-go" data-oxc-action="leave">연습으로 돌아가기</button>`;
        }
    }

    function render() {
        if (!st.active) return;
        startTick();
        if (setMeta) setMeta(st.live && isClassRoundVisible(st.live) && st.live.status !== 'done' ? `함께 풀기 · ${num(st.live.items.length)}문제` : '함께 풀기');
        if (isTeacher()) {
            if (isClassRoundVisible(st.live) && !st.teacherSetup) renderTeacherRoom();
            else renderTeacherSetup();
        } else {
            renderStudentRoom();
        }
    }

    // ---------- 동작 ----------
    async function openRound() {
        if (!isTeacher()) return;
        if (activeNow(st.live)) {
            render();
            return;
        }
        const built = buildClassRound({
            questions: getBank().questions,
            subjects: getSubjectsOn(),
            conditions: st.conditions,
        });
        if (built.error) {
            await api.alert(built.error);
            return;
        }
        try {
            await api.createLive(built.live);
            st.live = built.live;
            st.teacherSetup = false;
            watchAnswersIfTeacher();
            render();
        } catch (e) {
            await api.alert('함께 풀기를 열지 못했어요.\n' + errText(e));
        }
    }

    async function join() {
        const id = myId();
        const live = st.live;
        if (!isClassRoundVisible(live)) {
            await api.alert('지금은 열린 함께 풀기가 없어요.');
            return false;
        }
        if (live.status === 'done') {
            st.joined = false;
            st.mine = null;
            return true;
        }
        if (!id || api.isGuest()) {
            await api.alert('손님은 함께 풀기를 구경만 할 수 있어요. 내 이름으로 들어오면 같이 풀 수 있어요.');
            return true;
        }
        try {
            const existing = await api.readAnswer(id);
            if (existing && existing.roundId === live.roundId) {
                st.mine = existing;
            } else {
                const next = joinDoc(live, id, api.studentName());
                await api.writeJoin(id, next);
                st.mine = next;
            }
            st.joined = true;
            rememberJoined(live.roundId);
            return true;
        } catch (e) {
            await api.alert('함께 풀기에 들어가지 못했어요.\n' + errText(e));
            return false;
        }
    }

    async function pick(value) {
        const live = st.live;
        const id = myId();
        if (!st.mine || !canPickNow(live, st.mine)) return;
        const left = classRemainingMs(live, Date.now(), st.seen[seenKey(live)]);
        if (left <= 0) {
            render();
            return;
        }
        const index = String(live.index);
        const seenAt = st.seen[seenKey(live)] || Date.now();
        const entry = { p: value === 'X' ? 'X' : 'O', ms: Math.max(0, Date.now() - seenAt) };
        st.mine = { ...st.mine, picks: { ...(st.mine.picks || {}), [index]: entry } };
        render();
        try {
            await api.writePick(id, live.roundId, index, entry);
        } catch (e) {
            const picks = { ...(st.mine.picks || {}) };
            delete picks[index];
            st.mine = { ...st.mine, picks };
            render();
            // 이미 정답이 공개됐으면(규칙이 늦은 답을 막아요) 조용히 넘어가요.
            if (st.live && st.live.status === 'question' && String(st.live.index) === index) {
                await api.alert('답을 보내지 못했어요. 다시 골라 주세요.\n' + errText(e));
            }
        }
    }

    function handleClick(event) {
        const subjectBtn = event.target.closest('[data-oxc-subject]');
        if (subjectBtn) {
            const subject = subjectBtn.getAttribute('data-oxc-subject');
            const on = getSubjectsOn();
            setSubjectsOn(on.includes(subject) ? on.filter((s) => s !== subject) : on.concat(subject));
            render();
            return true;
        }
        const cond = event.target.closest('[data-oxc-cond]');
        if (cond) {
            const name = cond.getAttribute('data-oxc-cond');
            const raw = cond.getAttribute('data-value');
            const value = ['count', 'timeSec', 'lives'].includes(name) ? Number(raw) : raw;
            st.conditions = normalizeClassConditions({ ...st.conditions, [name]: value });
            render();
            return true;
        }
        const pickBtn = event.target.closest('[data-oxc-pick]');
        if (pickBtn) {
            void pick(pickBtn.getAttribute('data-oxc-pick'));
            return true;
        }
        const actionBtn = event.target.closest('[data-oxc-action]');
        if (!actionBtn) return false;
        const action = actionBtn.getAttribute('data-oxc-action');
        if (action === 'mode-class') void enter();
        else if (action === 'mode-practice' || action === 'leave') leave();
        else if (action === 'join') void enter();
        else if (action === 'open-round') void openRound();
        else if (action === 'start-round') void transition((latest, docs, t) => startPatch(latest, t));
        else if (action === 'reveal') void transition((latest, docs, t) => (
            latest.index === st.live.index ? revealPatch(latest, docs, t) : null));
        else if (action === 'next') void transition((latest, docs, t) => (
            latest.index === st.live.index ? nextPatch(latest, docs, t) : null));
        else if (action === 'back-result') {
            st.teacherSetup = false;
            render();
        }
        else if (action === 'finish-round') void confirmFinish();
        else if (action === 'close-round') void closeRound();
        else if (action === 'new-round') {
            // 결과 화면은 학생에게 그대로 두고, 선생님만 조건 화면으로 갑니다. 새 판을 열면 학생도 바로 따라와요.
            st.teacherSetup = true;
            render();
        }
        return true;
    }

    async function confirmFinish() {
        const ok = api.confirm ? await api.confirm('여기서 끝내고 지금까지 푼 문제로 순위를 보여 줄까요?') : true;
        if (!ok) return;
        await transition((latest, docs, t) => finishPatch(latest, docs, t));
    }

    async function closeRound() {
        const live = st.live;
        if (!live) {
            render();
            return;
        }
        if (isClassRoundActive(live)) {
            const ok = api.confirm ? await api.confirm('함께 풀기를 닫을까요? 학생 화면은 연습으로 돌아가요.') : true;
            if (!ok) return;
        }
        await transition((latest, docs, t) => (latest.status === 'off' ? null : { status: 'off', updatedAt: t }));
        st.teacherSetup = false;
    }

    async function enter() {
        if (!isTeacher()) {
            const ok = await join();
            if (!ok) return;
        }
        st.active = true;
        render();
    }

    function leave() {
        st.active = false;
        stopTick();
        onExit(null);
    }

    return {
        /** 무대를 열 때 판 문서 구독을 시작합니다. 진행 중이면 바로 함께 풀기로 들어갑니다. */
        open() {
            subscribe();
        },
        close() {
            st.active = false;
            st.joined = false;
            st.mine = null;
            st.seen = {};
            // 다시 열 때 첫 스냅샷으로 진행 중인 판에 바로 돌아가도록 되돌려요.
            st.liveLoaded = false;
            st.teacherSetup = false;
            unsubscribeAll();
        },
        isActive: () => st.active,
        render,
        handleClick,
        enter,
        leave,
        live: () => st.live,
        /** 연습 화면 위에 올릴 안내(학생: 참여 버튼, 선생님: 탭) */
        practiceHeader() {
            if (isTeacher()) {
                return activeNow(st.live) ? '<p class="oxc-banner-note">함께 풀기가 열려 있어요. 함께 풀기를 누르면 이어서 진행해요.</p>' : '';
            }
            if (!visibleNow(st.live)) return '';
            const label = st.live.status === 'done' ? '함께 풀기 결과 보기' : '선생님이 함께 풀기를 열었어요 · 참여하기';
            return `<button type="button" class="oxc-banner" data-oxc-action="join">${label}</button>`;
        },
    };
}
