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
/** 선생님 화면이 이만큼 진행이 없으면 학생 화면은 '선생님을 기다려요'로 보여요(예정 시간 뒤 여유). */
export const OX_CLASS_STALL_MS = 20000;
/** 이만큼 아무 변화가 없는 판은 버려진 판으로 보고 참여 안내를 숨겨요. */
export const OX_CLASS_ABANDON_MS = 30 * 60 * 1000;

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

/**
 * 그 문제의 답. 정답을 공개할 때 선생님 기기가 판 문서(frozen)에 그때까지 들어온 답을 고정해 두므로,
 * 공개된 문제는 고정된 답만 셉니다(공개 뒤에 들어온 답은 점수에 들어가지 않아요).
 */
function pickOf(doc, index, live) {
    const key = String(index);
    const frozen = live && live.frozen && typeof live.frozen === 'object' ? live.frozen[key] : null;
    const entry = frozen && typeof frozen === 'object'
        ? frozen[String(doc && doc.id)]
        : doc && doc.picks && doc.picks[key];
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
    const limitMs = (Number(live && live.timeSec) || 15) * 1000;
    let correct = 0;
    let wrong = 0;
    let answered = 0;
    let timeMs = 0;
    let outAt = -1;
    for (let i = 0; i < Math.min(upTo, items.length); i += 1) {
        if (i < joinIndex) continue;
        if (outAt >= 0) break;
        const pick = pickOf(doc, i, live);
        if (pick) {
            answered += 1;
            timeMs += Math.max(0, Math.min(limitMs, Number(pick.ms) || 0));
        } else {
            // 고르지 않은 문제는 제한 시간 전부로 쳐요(동점일 때 안 고른 쪽이 유리하지 않게).
            timeMs += limitMs;
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
        const pick = pickOf(p, index, live);
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

export function freezePicks(live, docs) {
    const index = Number(live && live.index) || 0;
    const key = String(index);
    const frozen = {};
    participantsOf(live, docs).forEach((p) => {
        const entry = p.picks && p.picks[key];
        if (entry && (entry.p === 'O' || entry.p === 'X')) {
            frozen[String(p.id).slice(0, 24)] = { p: entry.p, ms: Math.max(0, Math.min(600000, Math.floor(Number(entry.ms) || 0))) };
        }
    });
    return frozen;
}

export function revealPatch(live, docs, now) {
    if (!live || live.status !== 'question') return null;
    const index = Number(live.index) || 0;
    const frozen = { ...(live.frozen && typeof live.frozen === 'object' ? live.frozen : {}), [String(index)]: freezePicks(live, docs) };
    const fixed = { ...live, frozen };
    return { status: 'reveal', revealAt: now, tally: tallyClassQuestion(fixed, docs), frozen, updatedAt: now };
}

/** 학생 화면: 선생님 화면이 멈춘 것 같은지(이 기기가 판 문서를 마지막으로 받은 시각 기준) */
export function classRoundStalled(live, now, lastSeenAt) {
    if (!live || !['question', 'reveal'].includes(live.status)) return false;
    const seen = Number(lastSeenAt) || now;
    let expect;
    if (live.status === 'question') expect = (Number(live.timeSec) || 15) * 1000 + OX_CLASS_GRACE_MS;
    else if (live.advance === 'auto') expect = OX_CLASS_REVEAL_MS;
    else return false; // 선생님이 넘기는 판은 설명하느라 오래 머물 수 있어요.
    return now - seen > expect + OX_CLASS_STALL_MS;
}

/** 오래 아무 변화가 없는 판(선생님이 브라우저를 닫음 등) */
export function isClassRoundAbandoned(live, now) {
    if (!isClassRoundActive(live)) return false;
    const at = Number(live.updatedAt) || Number(live.openedAt) || 0;
    return at > 0 && now - at > OX_CLASS_ABANDON_MS;
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

/**
 * 지금 이 학생이 답을 고를 수 있는지.
 * 공개된 문제는 판 문서의 고정 답(frozen[문제][학번])으로 세므로 학번이 꼭 필요해요.
 * 답 문서에 id가 없으면 studentId로 채워요. 둘 다 없으면 고를 수 없다고 봐요.
 */
export function canPickNow(live, doc, studentId = '') {
    if (!live || live.status !== 'question' || !doc || doc.roundId !== live.roundId) return false;
    const id = String((doc && doc.id) || studentId || '');
    if (!id) return false;
    const me = doc.id ? doc : { ...doc, id };
    const index = Number(live.index) || 0;
    if (index < (Number(me.joinIndex) || 0)) return false;
    if (pickOf(me, index)) return false;
    return !isOutNow(live, me);
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

function intIn(value, min, max, fallback) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function str(value, max) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, max) : '';
}

/**
 * 판 문서는 로그인한 기기라면 쓸 수 있으니 믿지 않아요. 화면에 쓰기 전에 모양과 타입을 맞춥니다.
 * 숫자는 숫자로, 글자는 길이를 자르고, 모르는 칸은 버려요.
 */
export function sanitizeClassLive(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.roundId !== 'string' || !raw.roundId) return null;
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 20)
        .filter((it) => it && typeof it === 'object')
        .map((it) => ({
            id: str(it.id, 20),
            subject: str(it.subject, 40),
            prompt: str(it.prompt, 240),
            answer: it.answer === 'X' ? 'X' : 'O',
            explain: str(it.explain, 240),
        }));
    const status = OX_CLASS_STATUSES.includes(raw.status) ? raw.status : 'off';
    const tallyRaw = raw.tally && typeof raw.tally === 'object' ? raw.tally : null;
    const results = Array.isArray(raw.results) ? raw.results.slice(0, 60)
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({
            id: str(r.id, 24),
            name: str(r.name, 24),
            rank: intIn(r.rank, 1, 999, 0),
            correct: intIn(r.correct, 0, 999, 0),
            answered: intIn(r.answered, 0, 999, 0),
            timeMs: intIn(r.timeMs, 0, 1e8, 0),
            out: r.out === true,
        })) : null;
    const frozen = {};
    if (raw.frozen && typeof raw.frozen === 'object') {
        Object.keys(raw.frozen).slice(0, 20).forEach((k) => {
            const m = raw.frozen[k];
            if (!/^[0-9]{1,2}$/.test(k) || !m || typeof m !== 'object') return;
            const clean = {};
            Object.keys(m).slice(0, 80).forEach((sid) => {
                const e = m[sid];
                if (e && (e.p === 'O' || e.p === 'X')) clean[str(sid, 24)] = { p: e.p, ms: intIn(e.ms, 0, 600000, 0) };
            });
            frozen[k] = clean;
        });
    }
    return {
        roundId: str(raw.roundId, 40),
        status,
        index: intIn(raw.index, 0, Math.max(0, items.length - 1), 0),
        items,
        total: items.length,
        subjects: (Array.isArray(raw.subjects) ? raw.subjects : []).slice(0, 20).map((s) => str(s, 40)),
        timeSec: OX_TIME_CHOICES.includes(Number(raw.timeSec)) ? Number(raw.timeSec) : 15,
        lives: OX_CLASS_LIVES_CHOICES.includes(Number(raw.lives)) ? Number(raw.lives) : 0,
        order: raw.order === 'sheet' ? 'sheet' : 'random',
        advance: raw.advance === 'manual' ? 'manual' : 'auto',
        qStartAt: intIn(raw.qStartAt, 0, 1e14, 0),
        revealAt: intIn(raw.revealAt, 0, 1e14, 0),
        tally: tallyRaw ? { O: intIn(tallyRaw.O, 0, 999, 0), X: intIn(tallyRaw.X, 0, 999, 0), none: intIn(tallyRaw.none, 0, 999, 0) } : null,
        results,
        ...(raw.revealed == null ? {} : { revealed: intIn(raw.revealed, 0, items.length, 0) }),
        frozen,
        openedAt: intIn(raw.openedAt, 0, 1e14, 0),
        updatedAt: intIn(raw.updatedAt, 0, 1e14, 0),
        finishedAt: intIn(raw.finishedAt, 0, 1e14, 0),
    };
}
