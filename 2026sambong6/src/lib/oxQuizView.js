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
    oxUploadBlockReason,
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
        uploadMode: 'append',
        bankReady: false,
        loadGen: 0,
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
        stage.classList.toggle('is-play', state.mode === 'play');
        if (state.mode === 'play') renderPlay();
        else if (state.mode === 'review') renderReview();
        else renderSetup();
    }

    async function persistSettings() {
        if (!api.isAdmin()) return;
        const settings = { timeSec: state.timeSec, count: state.count, lives: state.lives };
        try {
            await api.saveSettings(settings);
            state.bank.settings = settings;
        } catch (e) {
            await api.alert('설정 저장 실패: ' + (e && e.message ? e.message : String(e)));
        }
    }

    function renderSetup() {
        const subjects = listOxSubjects(state.bank.questions);
        const subjectHtml = !state.bankReady
            ? '<p class="ox-empty">문제 은행을 불러오지 못했습니다. 연결을 확인한 뒤 다시 열어 주세요.</p>'
            : subjects.length
            ? subjects.map((subject) => {
                const on = state.subjectsOn.includes(subject) ? ' is-on' : '';
                return `<button type="button" class="ox-choice${on}" data-ox-subject="${esc(subject)}">${esc(subject)}</button>`;
            }).join('')
            : '<p class="ox-empty">문제 은행이 비어 있습니다. 양식을 받아 채워 올리세요.</p>';
        const appendOn = state.uploadMode !== 'replace' ? ' is-on' : '';
        const replaceOn = state.uploadMode === 'replace' ? ' is-on' : '';
        const admin = api.isAdmin()
            ? `<p class="ox-label">문제 은행</p>
               <div class="ox-row">
                <button type="button" class="ox-choice${appendOn}" data-ox-upload-mode="append">추가</button>
                <button type="button" class="ox-choice${replaceOn}" data-ox-upload-mode="replace">전체 바꾸기</button>
               </div>
               <div class="ox-row">
                <button type="button" class="ox-choice" data-ox-action="template">양식 받기</button>
                <button type="button" class="ox-choice" data-ox-action="csv">CSV 양식</button>
                <button type="button" class="ox-choice" data-ox-action="upload">문제 올리기</button>
                <button type="button" class="ox-choice" data-ox-action="reset-records">최고기록 초기화</button>
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
        const version = typeof window !== 'undefined' && window.APP_VERSION ? window.APP_VERSION : '';
        body.innerHTML = `
            <div class="ox-play-top">
                <span class="ox-play-count"><span>${state.index + 1} / ${state.round.length}</span>${version ? `<span class="ox-version">${esc(version)}</span>` : ''}</span>
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

    async function selectUploadMode(mode) {
        if (mode === 'replace' && state.uploadMode !== 'replace') {
            const ok = api.confirm
                ? await api.confirm('전체 바꾸기로 올리면 지금 있는 문제가 모두 삭제됩니다. 이 방식으로 올릴까요?')
                : false;
            if (!ok) return;
        }
        state.uploadMode = mode === 'replace' ? 'replace' : 'append';
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
        const replacing = state.uploadMode === 'replace';
        const blocked = oxUploadBlockReason(state.bankReady);
        if (blocked) {
            await api.alert(blocked);
            return;
        }
        // 추가분은 서버 문제 뒤에 붙입니다. 이 화면의 목록으로 은행을 통째로 바꾸지 않습니다.
        const saved = await api.saveQuestions(parsed.questions, replacing ? 'replace' : 'append');
        const next = Array.isArray(saved) ? saved : [];
        state.bank.questions = next;
        state.subjectsOn = listOxSubjects(next);
        state.mode = 'setup';
        render();
        await api.alert(replacing
            ? `${parsed.questions.length}문제로 바꿨습니다.`
            : `${parsed.questions.length}문제를 추가했습니다.`);
    }

    async function resetRecords() {
        if (!api.isAdmin()) return;
        const ok = api.confirm
            ? await api.confirm('모든 학생의 최고 기록을 지울까요? 지운 기록은 되돌릴 수 없습니다.')
            : false;
        if (!ok) return;
        try {
            await api.clearRecords();
            state.bank.records = {};
            render();
        } catch (e) {
            await api.alert('최고 기록 초기화 실패: ' + (e && e.message ? e.message : String(e)));
        }
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
        const modeBtn = event.target.closest('[data-ox-upload-mode]');
        if (modeBtn) {
            void selectUploadMode(modeBtn.getAttribute('data-ox-upload-mode'));
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
            void persistSettings();
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
        if (action === 'reset-records') void resetRecords();
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
        stage.classList.remove('is-play');
        stage.classList.add('hidden');
    });

    return {
        async open() {
            const gen = ++state.loadGen;
            stage.classList.remove('hidden');
            try {
                const loaded = await api.load();
                if (gen !== state.loadGen) return;
                state.bank = {
                    questions: Array.isArray(loaded.questions) ? loaded.questions : [],
                    settings: loaded.settings || {},
                    records: loaded.records || {},
                };
                state.bankReady = true;
            } catch (e) {
                if (gen !== state.loadGen) return;
                console.warn('ox load', e);
            }
            if (gen !== state.loadGen) return;
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
            stage.classList.remove('is-play');
            stage.classList.add('hidden');
        },
    };
}
