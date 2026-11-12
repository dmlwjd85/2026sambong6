/**
 * OX 퀴즈 '함께 풀기' 판(반 전체가 같은 문제를 같은 순서로 동시에 풉니다).
 * 화면과 Firestore는 여기 두지 않고, 판 문서 모양과 채점만 계산합니다.
 *
 * 판 문서: artifacts/{학급}/public/data/oxQuizBank/live
 *   선생님 기기만 status·index를 바꿉니다(lobby → question ⇄ reveal → done → off).
 * 학생 답: artifacts/{학급}/public/data/oxQuizBank/live/answers/{학번}
 *   학생은 자기 학번 문서에 roundId·이름·들어온 문제 번호·고른 답만 씁니다.
 * 보상(XP·봉)과 최고 기록은 건드리지 않습니다.
 */
import { OX_COUNT_CHOICES, OX_TIME_CHOICES, pickOxRound } from './oxQuiz.js';

/** 0은 '끝까지'(틀려도 탈락하지 않음)입니다. */
export const OX_CLASS_LIVES_CHOICES = [0, 1, 2, 3];
export const OX_CLASS_ORDER_CHOICES = ['random', 'sheet'];
export const OX_CLASS_ADVANCE_CHOICES = ['auto', 'manual'];
/** 자동 넘기기일 때 정답을 보여 주는 시간 */
export const OX_CLASS_REVEAL_MS = 5000;
/** 선생님 기기에서 시간이 끝난 뒤 학생 답이 도착할 틈 */
export const OX_CLASS_GRACE_MS = 800;
export const OX_CLASS_STATUSES = ['lobby', 'question', 'reveal', 'done', 'off'];

function text(value, max) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeClassConditions(raw = {}) {
    const timeSec = OX_TIME_CHOICES.includes(Number(raw.timeSec)) ? Number(raw.timeSec) : 15;
    const count = OX_COUNT_CHOICES.includes(Number(raw.count)) ? Number(raw.count) : 10;
    const lives = OX_CLASS_LIVES_CHOICES.includes(Number(raw.lives)) ? Number(raw.lives) : 0;
    const order = OX_CLASS_ORDER_CHOICES.includes(raw.order) ? raw.order : 'random';
    const advance = OX_CLASS_ADVANCE_CHOICES.includes(raw.advance) ? raw.advance : 'auto';
    return { timeSec, count, lives, order, advance };
}

export function newClassRoundId(now = Date.now(), rng = Math.random) {
    return `oxr_${Number(now).toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`;
}

/**
 * 선생님이 고른 조건으로 판을 엽니다(대기실). 문제 순서는 여기서 정해져 모두 같습니다.
 */
export function buildClassRound({ questions, subjects, conditions, now = Date.now(), rng = Math.random, roundId } = {}) {
    const cond = normalizeClassConditions(conditions);
    const picked = pickOxRound({
        questions,
        subjects,
        count: cond.count,
        random: cond.order === 'random',
        rng,
    });
    if (picked.error) return { live: null, error: picked.error };
    const items = picked.questions.map((item) => ({
        id: text(item.id, 20),
        subject: text(item.subject, 40),
        prompt: text(item.prompt, 240),
        answer: item.answer === 'X' ? 'X' : 'O',
        explain: text(item.explain, 240),
    }));
    const subjectList = (subjects || []).map((s) => text(s, 40)).filter(Boolean);
    return {
        error: '',
        live: {
            roundId: roundId || newClassRoundId(now, rng),
            status: 'lobby',
            index: 0,
            items,
            total: items.length,
            subjects: subjectList.slice(0, 20),
            timeSec: cond.timeSec,
            lives: cond.lives,
            order: cond.order,
            advance: cond.advance,
            qStartAt: 0,
            revealAt: 0,
            tally: null,
            results: null,
            openedAt: now,
            updatedAt: now,
        },
    };
}

export function isClassRoundActive(live) {
    return !!(live && live.roundId && ['lobby', 'question', 'reveal'].includes(live.status));
}

export function isClassRoundVisible(live) {
    return !!(live && live.roundId && ['lobby', 'question', 'reveal', 'done'].includes(live.status));
}

/** 정답이 공개된 문제 수. 채점은 공개된 문제만 합니다. */
export function revealedCount(live) {
    if (!live) return 0;
    const total = Array.isArray(live.items) ? live.items.length : 0;
    const index = Math.max(0, Number(live.index) || 0);
    if (live.status === 'reveal') return Math.min(total, index + 1);
    if (live.status === 'done') return Math.min(total, Number(live.revealed ?? index + 1) || 0);
    if (live.status === 'question') return Math.min(total, index);
    return 0;
}

/**
 * 학생 화면의 남은 시간. 선생님 기기 시계(qStartAt)와 이 기기에서 문제를 처음 본 시각 중
 * 더 넉넉한 쪽을 씁니다. 시계가 빠른 기기도 시간을 덜 받지 않고, 실제 마감은 선생님 기기가 합니다.
 */
export function classRemainingMs(live, now, seenAt) {
    if (!live || live.status !== 'question') return 0;
    const limit = (Number(live.timeSec) || 15) * 1000;
    const byTeacher = limit - (now - (Number(live.qStartAt) || now));
    const bySeen = Number.isFinite(seenAt) && seenAt > 0 ? limit - (now - seenAt) : byTeacher;
    return Math.max(0, Math.min(limit, Math.max(byTeacher, bySeen)));
}

/** 선생님 기기: 지금 정답을 공개할 때인지 */
export function teacherShouldReveal(live, now, participants = []) {
    if (!live || live.status !== 'question') return false;
    const limit = (Number(live.timeSec) || 15) * 1000;
    if (now - (Number(live.qStartAt) || now) >= limit + OX_CLASS_GRACE_MS) return true;
    const active = participants.filter((p) => !p.out);
    if (!active.length) return false;
    const key = String(live.index);
    return active.every((p) => p.picks && p.picks[key] && p.picks[key].p);
}

/** 선생님 기기: 자동 넘기기 판에서 정답을 다 보여 줬는지 */
export function teacherShouldAdvance(live, now) {
    if (!live || live.status !== 'reveal' || live.advance !== 'auto') return false;
    return now - (Number(live.revealAt) || now) >= OX_CLASS_REVEAL_MS;
}

function pickOf(doc, index) {
    const entry = doc && doc.picks && doc.picks[String(index)];
    return entry && (entry.p === 'O' || entry.p === 'X') ? entry : null;
}

/**
 * 한 학생의 점수. 들어오기 전 문제(joinIndex보다 앞)는 틀린 것으로 치지 않습니다.
 * upTo: 채점할 문제 수(공개된 문제 수)
 */
export function scoreClassEntry(live, doc, upTo = revealedCount(live)) {
    const items = (live && Array.isArray(live.items)) ? live.items : [];
    const joinIndex = Math.max(0, Number(doc && doc.joinIndex) || 0);
    const lives = Number(live && live.lives) || 0;
    let correct = 0;
    let wrong = 0;
    let answered = 0;
    let timeMs = 0;
    let outAt = -1;
    for (let i = 0; i < Math.min(upTo, items.length); i += 1) {
        if (i < joinIndex) continue;
        if (outAt >= 0) break;
        const pick = pickOf(doc, i);
        if (pick) {
            answered += 1;
            timeMs += Math.max(0, Math.min(600000, Number(pick.ms) || 0));
        }
        if (pick && pick.p === items[i].answer) correct += 1;
        else {
            wrong += 1;
            if (lives > 0 && wrong >= lives) outAt = i;
        }
    }
    return {
        correct,
        wrong,
        answered,
        timeMs,
        out: outAt >= 0,
        outAt,
        livesLeft: lives > 0 ? Math.max(0, lives - wrong) : 0,
    };
}

/** 지금 문제에서 이미 탈락했는지(지난 공개 문제 기준) */
export function isOutNow(live, doc) {
    return scoreClassEntry(live, doc).out;
}

export function participantsOf(live, docs) {
    const rid = live && live.roundId;
    return (docs || [])
        .filter((d) => d && d.id && d.roundId === rid)
        .map((d) => ({ ...d, ...scoreClassEntry(live, d) }));
}

/** 맞힌 수가 많을수록, 같으면 답한 시간 합이 짧을수록 앞입니다. 같은 점수는 같은 순위입니다. */
export function rankClassRound(live, docs) {
    const rows = participantsOf(live, docs).map((p) => ({
        id: String(p.id).slice(0, 24),
        name: text(p.name, 24) || String(p.id),
        correct: p.correct,
        answered: p.answered,
        timeMs: p.timeMs,
        out: p.out,
    }));
    rows.sort((a, b) => (b.correct - a.correct) || (a.timeMs - b.timeMs) || a.name.localeCompare(b.name, 'ko'));
    let rank = 0;
    rows.forEach((row, i) => {
        const prev = rows[i - 1];
        if (!prev || prev.correct !== row.correct || prev.timeMs !== row.timeMs) rank = i + 1;
        row.rank = rank;
    });
    return rows;
}

export function tallyClassQuestion(live, docs) {
    const index = Number(live && live.index) || 0;
    const tally = { O: 0, X: 0, none: 0 };
    participantsOf(live, docs).forEach((p) => {
        if (index < (Number(p.joinIndex) || 0)) return;
        if (p.out && p.outAt < index) return;
        const pick = pickOf(p, index);
        if (pick) tally[pick.p] += 1;
        else tally.none += 1;
    });
    return tally;
}

/** 다음 상태로 바꾸는 패치. 같은 판·같은 문제일 때만 적용합니다(선생님 기기 두 대 대비). */
export function startPatch(live, now) {
    if (!live || live.status !== 'lobby' || !live.items || !live.items.length) return null;
    return { status: 'question', index: 0, qStartAt: now, revealAt: 0, tally: null, updatedAt: now };
}

export function revealPatch(live, docs, now) {
    if (!live || live.status !== 'question') return null;
    return { status: 'reveal', revealAt: now, tally: tallyClassQuestion(live, docs), updatedAt: now };
}

export function finishPatch(live, docs, now) {
    if (!live || !isClassRoundActive(live)) return null;
    const revealed = revealedCount(live);
    const scored = { ...live, status: 'done', revealed };
    const results = rankClassRound(scored, docs).slice(0, 60);
    return { status: 'done', revealed, results, updatedAt: now, finishedAt: now };
}

export function nextPatch(live, docs, now) {
    if (!live || live.status !== 'reveal') return null;
    const total = Array.isArray(live.items) ? live.items.length : 0;
    const nextIndex = (Number(live.index) || 0) + 1;
    const everyoneOut = Number(live.lives) > 0 && (() => {
        const people = participantsOf(live, docs);
        return people.length > 0 && people.every((p) => p.out);
    })();
    if (nextIndex >= total || everyoneOut) return finishPatch(live, docs, now);
    return { status: 'question', index: nextIndex, qStartAt: now, revealAt: 0, tally: null, updatedAt: now };
}

/** 학생이 처음 들어올 때 쓰는 문서 */
export function joinDoc(live, studentId, name, now = Date.now()) {
    const status = live && live.status;
    const index = Number(live && live.index) || 0;
    // 문제를 푸는 중이면 그 문제부터, 정답 공개 중이면 다음 문제부터 셉니다.
    const joinIndex = status === 'reveal' ? index + 1 : (status === 'question' ? index : 0);
    return {
        roundId: live.roundId,
        name: text(name, 24) || String(studentId),
        joinIndex,
        picks: {},
        joinedAt: now,
        updatedAt: now,
    };
}

/** 지금 이 학생이 답을 고를 수 있는지 */
export function canPickNow(live, doc) {
    if (!live || live.status !== 'question' || !doc || doc.roundId !== live.roundId) return false;
    const index = Number(live.index) || 0;
    if (index < (Number(doc.joinIndex) || 0)) return false;
    if (pickOf(doc, index)) return false;
    return !isOutNow(live, doc);
}

export function classConditionSummary(live) {
    if (!live) return '';
    const parts = [
        `${live.total || (live.items || []).length}문제`,
        `한 문제 ${live.timeSec}초`,
        Number(live.lives) > 0 ? `생명 ${live.lives}개` : '틀려도 끝까지',
        live.advance === 'manual' ? '선생님이 넘겨요' : '자동으로 넘어가요',
    ];
    return parts.join(' · ');
}
