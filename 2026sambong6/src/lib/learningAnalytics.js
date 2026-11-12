/**
 * 교사용 학습 분석
 * 퀴즈 레이드가 끝날 때 문항별 정답 여부를 한 장의 결과 문서로 남기고,
 * 여러 회차를 모아 문항·단원·학생별 정답률과 다시 다룰 문항을 계산합니다.
 * Firestore·엑셀 파일 쓰기는 하지 않고 데이터만 만듭니다.
 */
import { gradeQuizRaidAnswer, isQuizRaidSkipAnswer } from './quizBank.js';

/** 결과 문서를 모으는 컬렉션 이름 (artifacts/{학급}/quizResults/raid_{시작시각}) */
export const QUIZ_RESULTS_COLLECTION = 'quizResults';
/** 학습 분석에서 읽을 최근 회차 수 */
export const QUIZ_RESULTS_READ_LIMIT = 200;
/** 다시 다룰 문항으로 볼 정답률 기준(이 값 미만) */
export const WEAK_RATE_THRESHOLD = 0.6;
/** 다시 다룰 문항으로 보려면 최소 응답 수 */
export const WEAK_MIN_ATTEMPTS = 3;
/** 단원이 없는 문항을 묶는 이름 */
export const NO_UNIT_LABEL = '(단원 없음)';

const Q_TEXT_MAX = 160;

function rate(correct, attempts) {
    return attempts > 0 ? Math.round((correct / attempts) * 1000) / 10 : 0;
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function ymdOf(ms) {
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 결과 문서 ID. 같은 회차를 여러 기기가 저장해도 한 문서로 덮이게 시작 시각을 씁니다.
 * @param {object} state 레이드 state
 * @returns {string} 비어 있으면 저장하지 않습니다.
 */
export function quizResultDocId(state) {
    const start = Math.floor(Number(state && state.startTime) || 0);
    return start > 0 ? `raid_${start}` : '';
}

/**
 * 끝난(또는 마지막 문항을 정리 중인) 퀴즈 레이드 state를 결과 문서로 바꿉니다.
 * @param {object} state 레이드 state (questions, participants, turnSubmissions)
 * @param {{ lastTurnSkips?: string[], nowMs?: number }} [opts]
 *   lastTurnSkips: 마지막 문항에서 미제출로 처리할 학번 (아직 state에 반영 전인 경우)
 * @returns {object|null}
 */
export function summarizeQuizRaidSession(state, opts = {}) {
    const st = state && typeof state === 'object' ? state : null;
    if (!st) return null;
    const id = quizResultDocId(st);
    const questions = Array.isArray(st.questions) ? st.questions : [];
    if (!id || !questions.length) return null;

    const participants = (Array.isArray(st.participants) ? st.participants : [])
        .map((p) => (p && p.id != null ? { id: String(p.id), name: String(p.name || '') } : null))
        .filter(Boolean);
    const pids = participants.map((p) => p.id);
    const subsAll = st.turnSubmissions && typeof st.turnSubmissions === 'object' ? st.turnSubmissions : {};
    const lastIdx = questions.length - 1;
    const lastSkips = new Set((opts.lastTurnSkips || []).map(String));

    const students = {};
    pids.forEach((pid) => {
        students[pid] = { correct: 0, answered: 0, skipped: 0 };
    });

    const outQs = questions.map((q, idx) => {
        const subs = subsAll[idx] || subsAll[String(idx)] || {};
        const marks = {};
        let answered = 0;
        let correct = 0;
        let skipped = 0;
        pids.forEach((pid) => {
            let ans = subs[pid];
            if (ans === undefined && idx === lastIdx && lastSkips.has(pid)) ans = '__skip__';
            if (ans === undefined || isQuizRaidSkipAnswer(ans)) {
                skipped += 1;
                students[pid].skipped += 1;
                marks[pid] = 0;
                return;
            }
            const ok = gradeQuizRaidAnswer(q, ans);
            answered += 1;
            students[pid].answered += 1;
            if (ok) {
                correct += 1;
                students[pid].correct += 1;
            }
            marks[pid] = ok ? 1 : -1;
        });
        return {
            index: idx,
            bankId: String((q && q.bankId) || ''),
            q: String((q && q.q) || '').slice(0, Q_TEXT_MAX),
            unit: String((q && q.unit) || ''),
            source: String((q && q.source) || ''),
            type: q && q.type === 'mc' ? 'mc' : 'short',
            answered,
            correct,
            skipped,
            // 학번 → 1 정답, -1 오답, 0 미제출
            marks,
        };
    });

    const nowMs = Number(opts.nowMs) || Date.now();
    return {
        id,
        kind: 'quizRaid',
        startedAt: Math.floor(Number(st.startTime) || 0),
        endedAt: nowMs,
        date: ymdOf(Number(st.startTime) || nowMs),
        questionCount: outQs.length,
        participants,
        questions: outQs,
        students,
    };
}

/**
 * 여러 회차 결과를 모읍니다.
 * @param {object[]} sessions summarizeQuizRaidSession 결과 배열
 * @param {{ weakThreshold?: number, weakMinAttempts?: number }} [opts]
 */
export function aggregateQuizResults(sessions, opts = {}) {
    const threshold = opts.weakThreshold != null ? Number(opts.weakThreshold) : WEAK_RATE_THRESHOLD;
    const minAttempts = opts.weakMinAttempts != null ? Number(opts.weakMinAttempts) : WEAK_MIN_ATTEMPTS;
    const list = (Array.isArray(sessions) ? sessions : []).filter((s) => s && Array.isArray(s.questions));

    const byQuestion = new Map();
    const byUnit = new Map();
    const byStudent = new Map();
    const names = new Map();

    list.forEach((s) => {
        (s.participants || []).forEach((p) => {
            if (p && p.id && p.name && !names.has(String(p.id))) names.set(String(p.id), p.name);
        });
        s.questions.forEach((q) => {
            const key = q.bankId || `text:${q.q}`;
            const unit = q.unit || NO_UNIT_LABEL;
            const qa = byQuestion.get(key) || {
                key, bankId: q.bankId || '', q: q.q, unit, source: q.source, type: q.type,
                sessions: 0, attempts: 0, correct: 0, skipped: 0, lastDate: '',
            };
            qa.sessions += 1;
            qa.attempts += Number(q.answered) || 0;
            qa.correct += Number(q.correct) || 0;
            qa.skipped += Number(q.skipped) || 0;
            if (q.unit) qa.unit = q.unit;
            if (s.date && s.date > qa.lastDate) qa.lastDate = s.date;
            byQuestion.set(key, qa);

            const ua = byUnit.get(unit) || { unit, questions: new Set(), attempts: 0, correct: 0 };
            ua.questions.add(key);
            ua.attempts += Number(q.answered) || 0;
            ua.correct += Number(q.correct) || 0;
            byUnit.set(unit, ua);

            Object.entries(q.marks || {}).forEach(([sid, mark]) => {
                const st = byStudent.get(sid) || { id: sid, sessions: new Set(), attempts: 0, correct: 0, skipped: 0, units: new Map() };
                st.sessions.add(s.id);
                if (mark === 0) {
                    st.skipped += 1;
                } else {
                    st.attempts += 1;
                    if (mark === 1) st.correct += 1;
                    const su = st.units.get(unit) || { attempts: 0, correct: 0 };
                    su.attempts += 1;
                    if (mark === 1) su.correct += 1;
                    st.units.set(unit, su);
                }
                byStudent.set(sid, st);
            });
        });
    });

    const questions = [...byQuestion.values()]
        .map((q) => ({ ...q, rate: rate(q.correct, q.attempts) }))
        .sort((a, b) => a.rate - b.rate || b.attempts - a.attempts);

    const units = [...byUnit.values()]
        .map((u) => ({ unit: u.unit, questionCount: u.questions.size, attempts: u.attempts, correct: u.correct, rate: rate(u.correct, u.attempts) }))
        .sort((a, b) => a.rate - b.rate || String(a.unit).localeCompare(String(b.unit), 'ko'));

    const students = [...byStudent.values()]
        .map((s) => {
            let weakestUnit = '';
            let weakestRate = Infinity;
            s.units.forEach((v, unit) => {
                if (v.attempts < 2) return;
                const r = rate(v.correct, v.attempts);
                if (r < weakestRate) {
                    weakestRate = r;
                    weakestUnit = unit;
                }
            });
            return {
                id: s.id,
                name: names.get(s.id) || '',
                sessions: s.sessions.size,
                attempts: s.attempts,
                correct: s.correct,
                skipped: s.skipped,
                rate: rate(s.correct, s.attempts),
                weakestUnit: weakestUnit && weakestRate < 100 ? weakestUnit : '',
            };
        })
        .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0) || String(a.id).localeCompare(String(b.id)));

    const weak = questions.filter((q) => q.attempts >= minAttempts && q.rate < threshold * 100);

    const totalAttempts = questions.reduce((s, q) => s + q.attempts, 0);
    const totalCorrect = questions.reduce((s, q) => s + q.correct, 0);

    return {
        sessionCount: list.length,
        totalAttempts,
        overallRate: rate(totalCorrect, totalAttempts),
        questions,
        units,
        students,
        weak,
    };
}

/**
 * 엑셀 시트 묶음. [{ name, rows }]
 * @param {ReturnType<typeof aggregateQuizResults>} agg
 * @param {{ getName?: (sid:string)=>string }} [opts]
 */
export function buildLearningAnalyticsSheets(agg, opts = {}) {
    const getName = typeof opts.getName === 'function' ? opts.getName : () => '';
    const a = agg || aggregateQuizResults([]);
    const overview = [
        ['항목', '값'],
        ['분석한 퀴즈 레이드 회차', a.sessionCount],
        ['전체 응답 수(미제출 제외)', a.totalAttempts],
        ['전체 정답률(%)', a.overallRate],
        ['다시 다룰 문항 수', a.weak.length],
        [],
        [`※ 다시 다룰 문항: 응답 ${WEAK_MIN_ATTEMPTS}회 이상이고 정답률 ${Math.round(WEAK_RATE_THRESHOLD * 100)}% 미만인 문항`],
        ['※ 단원은 문제 은행 엑셀의 「단원」 열에서 옵니다. 비어 있으면 (단원 없음)으로 묶입니다.'],
    ];
    const weakRows = [['단원', '문제', '정답률(%)', '응답 수', '출제 회차', '최근 출제일']];
    a.weak.forEach((q) => weakRows.push([q.unit, q.q, q.rate, q.attempts, q.sessions, q.lastDate]));

    const unitRows = [['단원', '문항 수', '응답 수', '정답 수', '정답률(%)']];
    a.units.forEach((u) => unitRows.push([u.unit, u.questionCount, u.attempts, u.correct, u.rate]));

    const qRows = [['단원', '문제', '유형', '출처', '출제 회차', '응답 수', '정답 수', '미제출', '정답률(%)', '최근 출제일']];
    a.questions.forEach((q) => qRows.push([
        q.unit, q.q, q.type === 'mc' ? '객관식' : '주관식', q.source, q.sessions, q.attempts, q.correct, q.skipped, q.rate, q.lastDate,
    ]));

    const sRows = [['학번', '이름', '참여 회차', '응답 수', '정답 수', '미제출', '정답률(%)', '가장 어려워한 단원']];
    a.students.forEach((s) => sRows.push([
        s.id, getName(s.id) || s.name || s.id, s.sessions, s.attempts, s.correct, s.skipped, s.rate, s.weakestUnit,
    ]));

    return [
        { name: '요약', rows: overview },
        { name: '다시다룰문항', rows: weakRows },
        { name: '단원별', rows: unitRows },
        { name: '문항별', rows: qRows },
        { name: '학생별', rows: sRows },
    ];
}

/**
 * 화면 알림용 짧은 요약.
 * @param {ReturnType<typeof aggregateQuizResults>} agg
 */
export function learningAnalyticsHeadline(agg) {
    if (!agg || !agg.sessionCount) return '아직 저장된 퀴즈 레이드 결과가 없습니다.\n퀴즈 레이드를 한 번 끝까지 진행하면 결과가 쌓입니다.';
    const lines = [
        `퀴즈 레이드 ${agg.sessionCount}회 · 응답 ${agg.totalAttempts}개 · 전체 정답률 ${agg.overallRate}%`,
    ];
    const units = agg.units.filter((u) => u.unit !== NO_UNIT_LABEL && u.attempts >= WEAK_MIN_ATTEMPTS).slice(0, 3);
    if (units.length) lines.push(`정답률 낮은 단원: ${units.map((u) => `${u.unit}(${u.rate}%)`).join(', ')}`);
    if (agg.weak.length) {
        lines.push(`다시 다룰 문항 ${agg.weak.length}개`);
        agg.weak.slice(0, 3).forEach((q) => lines.push(` · ${q.q.slice(0, 30)} — ${q.rate}%`));
    }
    return lines.join('\n');
}
