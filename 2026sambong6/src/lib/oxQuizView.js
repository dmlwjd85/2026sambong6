/**
 * OX 퀴즈 전체화면. 선택지는 버튼만 쓰고, 스테이지는 스크롤하지 않습니다.
 */
import {
    OX_COUNT_CHOICES,
    OX_LIVES_CHOICES,
    OX_TIME_CHOICES,
    chooseOxRecord,
    clampOxChoice,
    downloadOxCsvTemplate,
    downloadOxTemplate,
    listOxSubjects,
    parseOxQuizFile,
    pickOxRound,
} from './oxQuiz.js';

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function choiceButtons(name, choices, selected, suffix) {
    return choices.map((value) => {
        const on = value === selected ? ' is-on' : '';
        return `<button type="button" class="ox-choice${on}" data-ox-choice="${name}" data-value="${value}">${value}${suffix}</button>`;
    }).join('');
}

export function bindOxQuiz(stage, api) {
    if (!stage || stage.dataset.oxBound === '1') return;
    stage.dataset.oxBound = '1';
    const body = stage.querySelector('[data-ox-body]');
    const meta = stage.querySelector('[data-ox-meta]');
    const fileInput = stage.querySelector('[data-ox-file]');
    const state = {
        bank: { questions: [], settings: {}, records: {} },
        subjectsOn: [],
        timeSec: 15,
        count: 10,
        lives: 3,
        mode: 'setup',
        round: [],
        index: 0,
        livesLeft: 3,
        correct: 0,
        wrongs: [],
        reviewAt: 0,
        startedAt: 0,
        questionStartedAt: 0,
        elapsedMs: 0,
        timer: 0,
    };

    function myRecord() {
        const id = api.studentId();
        const records = state.bank.records || {};
        return id ? records[id] : null;
    }

    function stopTimer() {
        if (state.timer) clearInterval(state.timer);
        state.timer = 0;
    }

    function render() {
        stopTimer();
        if (meta) {
            const record = myRecord();
            meta.textContent = record
                ? `최고 ${record.correct}문제 · ${Math.round((record.elapsedMs || 0) / 1000)}초`
                : '최고 기록 없음';
        }
        if (state.mode === 'play') renderPlay();
        else if (state.mode === 'review') renderReview();
        else renderSetup();
    }

    function renderSetup() {
        const subjects = listOxSubjects(state.bank.questions);
        const subjectHtml = subjects.length
            ? subjects.map((subject) => {
                const on = state.subjectsOn.includes(subject) ? ' is-on' : '';
                return `<button type="button" class="ox-choice${on}" data-ox-subject="${esc(subject)}">${esc(subject)}</button>`;
            }).join('')
            : '<p class="ox-empty">문제 은행이 비어 있습니다. 양식을 받아 채워 올리세요.</p>';
        const admin = api.isAdmin()
            ? `<div class="ox-row">
                <button type="button" class="ox-choice" data-ox-action="template">양식 받기</button>
                <button type="button" class="ox-choice" data-ox-action="csv">CSV 양식</button>
                <button type="button" class="ox-choice" data-ox-action="upload">문제 올리기</button>
               </div>`
            : '';
        body.innerHTML = `
            <p class="ox-label">과목</p>
            <div class="ox-row">${subjectHtml}</div>
            <p class="ox-label">제한 시간</p>
            <div class="ox-row">${choiceButtons('time', OX_TIME_CHOICES, state.timeSec, '초')}</div>
            <p class="ox-label">문항 수</p>
            <div class="ox-row">${choiceButtons('count', OX_COUNT_CHOICES, state.count, '문제')}</div>
            <p class="ox-label">생명</p>
            <div class="ox-row">${choiceButtons('lives', OX_LIVES_CHOICES, state.lives, '')}</div>
            ${admin}
            <button type="button" class="ox-go" data-ox-action="start">시작</button>`;
    }

    function renderPlay() {
        const item = state.round[state.index];
        if (!item) {
            finishRound();
            return;
        }
        const hearts = Array.from({ length: state.lives }, (_, i) => (
            `<span class="ox-heart${i < state.livesLeft ? ' is-on' : ''}"></span>`
        )).join('');
        body.innerHTML = `
            <div class="ox-play-top">
                <span>${state.index + 1} / ${state.round.length}</span>
                <span class="ox-hearts">${hearts}</span>
                <span data-ox-timer>${state.timeSec}</span>
            </div>
            <p class="ox-prompt">${esc(item.prompt)}</p>
            <div class="ox-answers">
                <button type="button" class="ox-mark" data-ox-answer="O"><img src="ox/ox-mark-o.jpg" alt="O"></button>
                <button type="button" class="ox-mark" data-ox-answer="X"><img src="ox/ox-mark-x.jpg" alt="X"></button>
            </div>`;
        state.questionStartedAt = Date.now();
        const timerEl = body.querySelector('[data-ox-timer]');
        state.timer = setInterval(() => {
            const left = state.timeSec - (Date.now() - state.questionStartedAt) / 1000;
            if (timerEl) timerEl.textContent = String(Math.max(0, Math.ceil(left)));
            if (left <= 0) {
                stopTimer();
                markAnswer('');
            }
        }, 200);
    }

    function renderReview() {
        if (!state.wrongs.length) {
            body.innerHTML = `<p class="ox-prompt">모두 맞혔습니다.</p><p class="ox-label">${state.correct}문제 · ${Math.round(state.elapsedMs / 1000)}초</p><button type="button" class="ox-go" data-ox-action="setup">처음으로</button>`;
            return;
        }
        const item = state.wrongs[state.reviewAt];
        const last = state.reviewAt >= state.wrongs.length - 1;
        body.innerHTML = `
            <p class="ox-label">틀린 문제 ${state.reviewAt + 1} / ${state.wrongs.length}</p>
            <p class="ox-prompt">${esc(item.prompt)}</p>
            <p class="ox-label">정답 ${esc(item.answer)} · 내 답 ${item.picked ? esc(item.picked) : '시간 초과'}</p>
            <p class="ox-explain">${esc(item.explain || '해설이 없습니다.')}</p>
            <button type="button" class="ox-go" data-ox-action="next-review">${last ? '처음으로' : '다음 해설'}</button>`;
    }

    async function finishRound() {
        stopTimer();
        state.elapsedMs = Date.now() - state.startedAt;
        state.mode = 'review';
        state.reviewAt = 0;
        const record = { correct: state.correct, elapsedMs: state.elapsedMs, total: state.round.length, at: Date.now() };
        const id = api.studentId();
        if (!api.isGuest() && id) {
            const prev = myRecord();
            if (chooseOxRecord(prev, record) === record) {
                try {
                    await api.saveRecord(id, record);
                    state.bank.records = { ...(state.bank.records || {}), [id]: record };
                } catch (e) {
                    await api.alert('최고 기록 저장 실패: ' + (e && e.message ? e.message : String(e)));
                }
            }
        }
        render();
    }

    function markAnswer(picked) {
        const item = state.round[state.index];
        if (!item || state.mode !== 'play') return;
        state.mode = 'lock';
        stopTimer();
        const ok = picked && picked === item.answer;
        if (ok) state.correct += 1;
        else {
            state.livesLeft -= 1;
            state.wrongs.push({ ...item, picked });
        }
        state.index += 1;
        if (!ok && state.livesLeft <= 0) {
            void finishRound();
            return;
        }
        if (state.index >= state.round.length) {
            void finishRound();
            return;
        }
        state.mode = 'play';
        render();
    }

    async function startRound() {
        const picked = pickOxRound({
            questions: state.bank.questions,
            subjects: state.subjectsOn,
            count: state.count,
            random: true,
        });
        if (picked.error) {
            await api.alert(picked.error);
            return;
        }
        state.round = picked.questions;
        state.index = 0;
        state.livesLeft = state.lives;
        state.correct = 0;
        state.wrongs = [];
        state.startedAt = Date.now();
        state.mode = 'play';
        if (api.isAdmin()) {
            try {
                await api.saveSettings({ timeSec: state.timeSec, count: state.count, lives: state.lives });
                state.bank.settings = { timeSec: state.timeSec, count: state.count, lives: state.lives };
            } catch (e) {
                console.warn('ox settings', e);
            }
        }
        render();
    }

    async function uploadFile(file) {
        if (!file || !api.isAdmin()) return;
        const buffer = await file.arrayBuffer();
        const parsed = parseOxQuizFile(buffer, file.name);
        if (parsed.errors.length) {
            await api.alert(parsed.errors.slice(0, 8).join('\n'));
            return;
        }
        await api.saveQuestions(parsed.questions);
        state.bank.questions = parsed.questions;
        state.subjectsOn = listOxSubjects(parsed.questions);
        state.mode = 'setup';
        render();
        await api.alert(`${parsed.questions.length}문제를 올렸습니다.`);
    }

    body.addEventListener('click', (event) => {
        const subjectBtn = event.target.closest('[data-ox-subject]');
        if (subjectBtn) {
            const subject = subjectBtn.getAttribute('data-ox-subject');
            if (state.subjectsOn.includes(subject)) state.subjectsOn = state.subjectsOn.filter((item) => item !== subject);
            else state.subjectsOn = state.subjectsOn.concat(subject);
            render();
            return;
        }
        const choice = event.target.closest('[data-ox-choice]');
        if (choice) {
            const name = choice.getAttribute('data-ox-choice');
            const value = Number(choice.getAttribute('data-value'));
            if (name === 'time') state.timeSec = clampOxChoice(value, OX_TIME_CHOICES, state.timeSec);
            if (name === 'count') state.count = clampOxChoice(value, OX_COUNT_CHOICES, state.count);
            if (name === 'lives') state.lives = clampOxChoice(value, OX_LIVES_CHOICES, state.lives);
            render();
            return;
        }
        const answer = event.target.closest('[data-ox-answer]');
        if (answer) {
            markAnswer(answer.getAttribute('data-ox-answer'));
            return;
        }
        const actionBtn = event.target.closest('[data-ox-action]');
        if (!actionBtn) return;
        const action = actionBtn.getAttribute('data-ox-action');
        if (action === 'template') downloadOxTemplate();
        if (action === 'csv') downloadOxCsvTemplate();
        if (action === 'upload' && fileInput) fileInput.click();
        if (action === 'start') void startRound();
        if (action === 'setup') {
            state.mode = 'setup';
            render();
        }
        if (action === 'next-review') {
            if (state.reviewAt >= state.wrongs.length - 1) state.mode = 'setup';
            else state.reviewAt += 1;
            render();
        }
    });

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            void uploadFile(file).catch((e) => api.alert('올리기 실패: ' + (e && e.message ? e.message : String(e))));
        });
    }

    stage.querySelector('[data-ox-close]')?.addEventListener('click', () => {
        stopTimer();
        stage.classList.add('hidden');
    });

    return {
        async open() {
            stage.classList.remove('hidden');
            try {
                const loaded = await api.load();
                state.bank = {
                    questions: Array.isArray(loaded.questions) ? loaded.questions : [],
                    settings: loaded.settings || {},
                    records: loaded.records || {},
                };
            } catch (e) {
                console.warn('ox load', e);
            }
            const settings = state.bank.settings || {};
            state.timeSec = clampOxChoice(Number(settings.timeSec), OX_TIME_CHOICES, 15);
            state.count = clampOxChoice(Number(settings.count), OX_COUNT_CHOICES, 10);
            state.lives = clampOxChoice(Number(settings.lives), OX_LIVES_CHOICES, 3);
            if (!state.subjectsOn.length) state.subjectsOn = listOxSubjects(state.bank.questions);
            state.mode = 'setup';
            render();
        },
        close() {
            stopTimer();
            stage.classList.add('hidden');
        },
    };
}
