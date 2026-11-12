/**
 * OX 퀴즈 '무제한 도전'. 틀리면 끝나고, 맞힌 개수가 기록이에요.
 * 화면과 Firestore는 여기 두지 않고, 출제·랭킹·하루 한 번 보상 계산만 합니다.
 *
 * 학생별 문서: artifacts/{학급}/public/data/oxQuizBank/challengeBoard/entries/{학번}
 *   { name, best, bestMs, bestAt, plays, lastRunId, dayDate, dayRunId, dayCorrect, dayBong, dayPaidAt, updatedAt }
 *   반 전체가 동시에 써도 서로 부딪히지 않게 학생마다 문서를 나눠요. 랭킹은 이 컬렉션을 읽어 만들어요.
 * 랭킹 공개 설정: artifacts/{학급}/public/data/oxQuizBank/challengeBoard  { rankScope: 'top5' | 'off' }
 * 보상: 그날(KST) 처음으로 '끝난' 판 하나만, 맞힌 수 ÷ 10의 몫만큼 봉(남는 문제 수는 버려요). 포인트는 쌓지 않아요.
 *   시작할 때 찜하지 않아요. 끝날 때 학생 문서에 그날 날짜(dayDate)를 적으면 그날 보상은 끝이에요.
 */

export const OX_CHALLENGE_PER_BONG = 10;
export const OX_CHALLENGE_DAY_MAX_BONG = 20;
export const OX_CHALLENGE_REASON = 'OX 무제한 도전';
export const OX_CHALLENGE_SOURCE = 'oxChallenge';
export const OX_CHALLENGE_BOARD_MAX = 80;
/** 학생 화면 랭킹: 위에서 몇 명까지 보여 줄지 */
export const OX_CHALLENGE_TOP_N = 5;
/** 학생 화면이 구독하는 랭킹 줄 수(명단에 없는 학번을 빼도 5명이 남도록 넉넉히) */
export const OX_CHALLENGE_WATCH_LIMIT = 15;
/** 새로고침·창 닫기 뒤 복구한 판은 봉을 이만큼까지만 줘요(기기 저장값은 고칠 수 있어서). */
export const OX_CHALLENGE_RECOVER_MAX_BONG = 2;
/** 한 문제를 이보다 빨리 맞힐 수는 없다고 봐요(복구 판 검사). */
export const OX_CHALLENGE_MIN_MS_PER_Q = 400;
export const OX_RANK_SCOPES = ['top5', 'off'];

/** 한국 날짜(YYYY-MM-DD). 기기 시각 기준이에요(규칙은 서버 시각으로 다시 확인해요). */
export function kstDateStr(ms = Date.now()) {
    return new Date(Number(ms) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function newChallengeRunId(now = Date.now(), rng = Math.random) {
    return `oxc_${Number(now).toString(36)}_${Math.floor(rng() * 1e8).toString(36)}`;
}

/** 맞힌 수 → 봉. 10문제마다 1봉, 나머지는 버려요(23 → 2). 하루 20봉까지예요. */
export function challengeBongFor(correct) {
    const n = Math.max(0, Math.floor(Number(correct) || 0));
    return Math.min(OX_CHALLENGE_DAY_MAX_BONG, Math.floor(n / OX_CHALLENGE_PER_BONG));
}

export function normalizeRankScope(value) {
    return OX_RANK_SCOPES.includes(value) ? value : 'top5';
}

function shuffle(list, rng) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
}

/**
 * 끝없이 이어지는 문제 덱. 은행을 다 쓰면 다시 섞어서 이어요.
 * 다시 섞을 때 바로 앞 문제가 첫 문제로 또 나오지 않게 해요(문제가 2개 이상일 때).
 */
export function createChallengeDeck(questions, rng = Math.random) {
    const pool = (questions || []).filter((q) => q && q.prompt && (q.answer === 'O' || q.answer === 'X'));
    let queue = [];
    let last = null;
    let laps = 0;
    return {
        size: pool.length,
        laps: () => laps,
        next() {
            if (!pool.length) return null;
            if (!queue.length) {
                queue = shuffle(pool, rng);
                if (last && queue.length > 1 && queue[0] === last) {
                    [queue[0], queue[queue.length - 1]] = [queue[queue.length - 1], queue[0]];
                }
                laps += 1;
            }
            last = queue.shift();
            return last;
        },
    };
}

function better(correct, ms, entry) {
    if (!entry || !Number.isFinite(Number(entry.best))) return true;
    if (correct !== Number(entry.best)) return correct > Number(entry.best);
    return ms < (Number(entry.bestMs) || Infinity);
}

/**
 * 복구한 판(기기 저장값)을 그대로 믿지 않아요.
 * - 맞힌 문제 목록(ids)의 길이가 맞힌 수와 같아야 하고, 모두 지금 문제 은행에 있는 문제여야 해요.
 * - 한 문제에 0.4초보다 빨리 맞힐 수는 없어요.
 * 맞지 않으면 그 판은 0개로 쳐요. 봉은 OX_CHALLENGE_RECOVER_MAX_BONG까지만 줘요.
 */
export function verifyRecoveredRun(run, questions) {
    const correct = Math.max(0, Math.floor(Number(run && run.correct) || 0));
    if (!correct) return 0;
    const ids = Array.isArray(run && run.ids) ? run.ids.map(String) : null;
    if (!ids || ids.length !== correct) return 0;
    const bankIds = new Set((questions || []).map((q) => String(q && q.id)));
    if (!ids.every((id) => bankIds.has(id))) return 0;
    const spent = (Number(run.touchedAt) || 0) - (Number(run.startedAt) || 0);
    if (!(spent >= correct * OX_CHALLENGE_MIN_MS_PER_Q)) return 0;
    return correct;
}

/**
 * 판이 끝났을 때 학생 문서(entries/{학번})를 어떻게 바꿀지.
 * 같은 판을 두 번 보내도(재시도·두 탭) 기록과 봉은 한 번만 들어가요.
 * 그날 처음 끝난 판이면(dayDate가 오늘이 아니면) 봉을 줘요.
 * run: { runId, correct, elapsedMs }, today: 'YYYY-MM-DD'(KST), recovered: 복구한 판인지
 * 반환: { entry, bong, paidNow, newBest, alreadyCounted, changed }
 */
export function planChallengeFinish(prevEntry, { studentId, name, run, today, now = Date.now(), recovered = false }) {
    const prev = prevEntry && typeof prevEntry === 'object' ? prevEntry : {};
    const correct = Math.max(0, Math.min(2000, Math.floor(Number(run && run.correct) || 0)));
    const ms = Math.max(0, Math.floor(Number(run && run.elapsedMs) || 0));
    const entry = { ...prev, name: String(name || prev.name || studentId).slice(0, 24) };
    const alreadyCounted = !!run && (prev.lastRunId === run.runId || prev.dayRunId === run.runId);
    let newBest = false;
    let bong = 0;
    let paidNow = false;
    if (!alreadyCounted) {
        entry.plays = (Number(prev.plays) || 0) + 1;
        entry.lastRunId = String(run.runId);
        if (better(correct, ms, prev)) {
            entry.best = correct;
            entry.bestMs = ms;
            entry.bestAt = now;
            newBest = true;
        }
        if (prev.dayDate !== today) {
            bong = challengeBongFor(correct);
            if (recovered) bong = Math.min(bong, OX_CHALLENGE_RECOVER_MAX_BONG);
            entry.dayDate = today;
            entry.dayRunId = String(run.runId);
            entry.dayCorrect = correct;
            entry.dayBong = bong;
            entry.dayPaidAt = now;
            paidNow = true;
        }
        entry.updatedAt = now;
    }
    return { entry, bong, paidNow, newBest, alreadyCounted, changed: !alreadyCounted };
}

/**
 * 최고 기록 순위. 같은 개수면 더 빨리 푼 쪽이 앞이고, 둘 다 같으면 같은 순위예요.
 * rows: [{ id, name, best, bestMs }] (학생별 문서 목록). 0개 기록은 순위에 넣지 않아요.
 */
export function rankChallengeRows(rows) {
    const list = (rows || [])
        .filter((e) => e && e.id && Number.isFinite(Number(e.best)) && Number(e.best) > 0)
        .map((e) => ({
            id: String(e.id).slice(0, 24),
            name: String(e.name || e.id).slice(0, 24),
            best: Math.floor(Number(e.best)) || 0,
            bestMs: Math.floor(Number(e.bestMs)) || 0,
        }));
    list.sort((a, b) => (b.best - a.best) || (a.bestMs - b.bestMs) || a.name.localeCompare(b.name, 'ko'));
    list.forEach((row, i) => {
        const prev = list[i - 1];
        row.rank = (!prev || prev.best !== row.best || prev.bestMs !== row.bestMs) ? i + 1 : prev.rank;
    });
    return list.slice(0, OX_CHALLENGE_BOARD_MAX);
}

/**
 * 학생 화면에 보여 줄 줄. 상위 5명과 나만 보여 주고, 그 밖의 순위(꼴찌 등)는 보여 주지 않아요.
 * scope 'off'면 다른 학생 순위는 숨기고 내 기록만 보여 줘요. 선생님 화면은 전체예요.
 */
export function visibleChallengeRows(ranked, { meId = '', scope = 'top5', teacher = false } = {}) {
    const rows = ranked || [];
    if (teacher) return { rows, me: null, hidden: false };
    const me = rows.find((r) => r.id === String(meId)) || null;
    if (normalizeRankScope(scope) === 'off') return { rows: [], me, hidden: true };
    const top = rows.filter((r) => r.rank <= OX_CHALLENGE_TOP_N).slice(0, OX_CHALLENGE_TOP_N);
    return { rows: top, me: me && !top.includes(me) ? me : null, hidden: false };
}

/** 보상 안내 문구(시작 화면) */
export function challengeTodayNote(entry, today) {
    if (!entry || entry.dayDate !== today) {
        return '오늘 처음 끝나는 판에서 10문제 맞힐 때마다 1봉을 받아요(남는 문제는 봉이 안 돼요).';
    }
    return `오늘 봉 받는 판은 끝났어요(${Number(entry.dayCorrect) || 0}개 · ${Number(entry.dayBong) || 0}봉). 지금부터는 기록과 랭킹만 올라가요.`;
}

/** 끝난 판 보상 문구 */
export function challengeResultNote(plan) {
    if (!plan) return '';
    if (plan.paidNow) {
        if (plan.bong > 0) return `오늘 첫 판이라 ${plan.bong}봉을 받았어요!`;
        return '오늘 첫 판이었어요. 10개를 넘기지 못해 이번엔 봉이 없어요.';
    }
    if (plan.alreadyCounted) return '이 판은 이미 저장했어요.';
    return '오늘 봉 받는 판은 이미 했어요. 기록과 랭킹에는 들어가요.';
}

/** Firestore·네트워크 오류를 학생이 알아듣는 말로 바꿔요(원문은 콘솔에만 남겨요). */
export function friendlyOxError(e) {
    const code = String((e && e.code) || '').replace(/^firestore\//, '');
    const msg = String((e && e.message) || '');
    if (code === 'unavailable' || code === 'deadline-exceeded' || /network|offline|Failed to fetch/i.test(msg)) {
        return '인터넷 연결이 잠깐 불안정해요. 잠시 뒤 다시 해 주세요.';
    }
    if (code === 'permission-denied') return '지금은 저장할 수 없어요. 화면을 새로고침한 뒤 다시 해 주세요.';
    if (code === 'aborted' || code === 'failed-precondition' || /stored version|base version|contention/i.test(msg)) {
        return '친구들이 한꺼번에 저장하고 있어요. 잠시 뒤 다시 저장할게요.';
    }
    if (/인증/.test(msg)) return '로그인을 확인하지 못했어요. 화면을 새로고침해 주세요.';
    return '잠깐 문제가 생겼어요. 잠시 뒤 다시 해 주세요.';
}

/** 다시 시도해도 될 오류인지(충돌·일시 장애) */
export function isRetryableOxError(e) {
    const code = String((e && e.code) || '').replace(/^firestore\//, '');
    const msg = String((e && e.message) || '');
    return ['aborted', 'failed-precondition', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal'].includes(code)
        || /stored version|base version|contention/i.test(msg);
}

/**
 * 무작위 간격을 두고 다시 시도해요(같은 순간에 몰린 학생들이 다시 한꺼번에 부딪히지 않게).
 * 기본 4번까지, 간격은 250~900ms에서 시작해 두 배씩 늘려요.
 */
export async function withOxRetry(fn, {
    tries = 4, baseMs = 250, rng = Math.random, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), deniedRetries = 0,
} = {}) {
    let lastErr = null;
    let deniedLeft = deniedRetries;
    for (let i = 0; i < tries; i += 1) {
        try {
            return await fn(i);
        } catch (e) {
            lastErr = e;
            // 같은 학생의 다른 탭이 먼저 저장하면, 서버가 충돌 대신 '권한 없음'으로 거절할 때가 있어요.
            // 이때는 새로 읽어서 한 번 더 계산하면 맞는 값으로 저장돼요(규칙을 피하는 게 아니라 최신 값으로 다시 써요).
            const denied = String((e && e.code) || '').replace(/^firestore\//, '') === 'permission-denied';
            const again = isRetryableOxError(e) || (denied && deniedLeft > 0);
            if (denied && deniedLeft > 0) deniedLeft -= 1;
            if (i === tries - 1 || !again) break;
            const wait = Math.round((baseMs + rng() * baseMs * 2.6) * (2 ** i));
            await sleep(wait);
        }
    }
    throw lastErr;
}
