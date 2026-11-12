/**
 * OX 퀴즈 '무제한 도전'. 틀리면 끝나고, 맞힌 개수가 기록이에요.
 * 화면과 Firestore는 여기 두지 않고, 출제·랭킹·하루 한 번 보상 계산만 합니다.
 *
 * 반 랭킹 문서 하나: artifacts/{학급}/public/data/oxQuizBank/challengeBoard
 *   entries.{학번} = { name, best, bestMs, bestAt, plays, dayDate, dayRunId, dayPaid, dayCorrect, dayBong }
 * 보상: 하루(KST)의 첫 판만, 맞힌 수 ÷ 10의 몫만큼 봉(남는 문제 수는 버려요). 포인트는 쌓지 않아요.
 */

export const OX_CHALLENGE_PER_BONG = 10;
export const OX_CHALLENGE_REASON = 'OX 무제한 도전';
export const OX_CHALLENGE_SOURCE = 'oxChallenge';
export const OX_CHALLENGE_BOARD_MAX = 80;

/** 한국 날짜(YYYY-MM-DD). 기기 시각 기준이에요. */
export function kstDateStr(ms = Date.now()) {
    return new Date(Number(ms) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function newChallengeRunId(now = Date.now(), rng = Math.random) {
    return `oxc_${Number(now).toString(36)}_${Math.floor(rng() * 1e8).toString(36)}`;
}

/** 맞힌 수 → 봉. 10문제마다 1봉, 나머지는 버려요(23 → 2). */
export function challengeBongFor(correct) {
    const n = Math.max(0, Math.floor(Number(correct) || 0));
    return Math.floor(n / OX_CHALLENGE_PER_BONG);
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

export function challengeEntries(board) {
    const entries = board && board.entries && typeof board.entries === 'object' ? board.entries : {};
    return entries;
}

/** 오늘 이 학생이 봉 받는 판을 이미 썼는지 */
export function challengeDayUsed(board, studentId, today) {
    const entry = challengeEntries(board)[String(studentId)];
    return !!(entry && entry.dayDate === today);
}

/**
 * 판을 시작할 때: 오늘 첫 판이면 이 판을 보상 판으로 찜해요.
 * 반환: { entry(새 항목), rewardRun(이 판이 보상 판인지), changed }
 */
export function planChallengeStart(board, { studentId, name, runId, today, uid = '' }) {
    const prev = challengeEntries(board)[String(studentId)] || {};
    if (prev.dayDate === today) {
        return { entry: prev, rewardRun: prev.dayRunId === runId && !prev.dayPaid, changed: false };
    }
    const entry = {
        ...prev,
        name: String(name || prev.name || studentId).slice(0, 24),
        dayDate: today,
        dayRunId: runId,
        dayPaid: false,
        dayCorrect: 0,
        dayBong: 0,
        // 오늘 봉 받는 판을 찜한 기기. 규칙은 이 기기만 오늘 봉 지급 표시를 하게 해요.
        dayUid: String(uid || ''),
    };
    return { entry, rewardRun: true, changed: true };
}

function better(correct, ms, entry) {
    if (!entry || !Number.isFinite(Number(entry.best))) return true;
    if (correct !== Number(entry.best)) return correct > Number(entry.best);
    return ms < (Number(entry.bestMs) || Infinity);
}

/**
 * 판이 끝났을 때. 같은 판을 두 번 보내도(재시도·두 탭) 봉은 한 번만 나가요.
 * run: { runId, correct, elapsedMs, date }
 * 반환: { entry, bong, paidNow, newBest, rewardRun }
 */
export function planChallengeFinish(board, { studentId, name, run, now = Date.now() }) {
    const prev = challengeEntries(board)[String(studentId)] || {};
    const correct = Math.max(0, Math.floor(Number(run && run.correct) || 0));
    const ms = Math.max(0, Math.floor(Number(run && run.elapsedMs) || 0));
    const entry = { ...prev, name: String(name || prev.name || studentId).slice(0, 24) };
    const alreadyCounted = prev.lastRunId === run.runId;
    let newBest = false;
    if (!alreadyCounted) {
        entry.plays = (Number(prev.plays) || 0) + 1;
        entry.lastRunId = run.runId;
        if (better(correct, ms, prev)) {
            entry.best = correct;
            entry.bestMs = ms;
            entry.bestAt = now;
            newBest = true;
        }
    }
    const rewardRun = prev.dayRunId === run.runId;
    let bong = 0;
    let paidNow = false;
    if (rewardRun && !prev.dayPaid) {
        bong = challengeBongFor(correct);
        entry.dayPaid = true;
        entry.dayCorrect = correct;
        entry.dayBong = bong;
        entry.dayPaidAt = now;
        paidNow = true;
    }
    return { entry, bong, paidNow, newBest, rewardRun, changed: !alreadyCounted || paidNow };
}

/** 최고 기록 순위. 같은 개수면 더 빨리 푼 쪽이 앞이고, 둘 다 같으면 같은 순위예요. */
export function rankChallengeBoard(board) {
    const rows = Object.entries(challengeEntries(board))
        .filter(([, e]) => e && Number.isFinite(Number(e.best)))
        .map(([id, e]) => ({
            id,
            name: String(e.name || id).slice(0, 24),
            best: Number(e.best) || 0,
            bestMs: Number(e.bestMs) || 0,
        }));
    rows.sort((a, b) => (b.best - a.best) || (a.bestMs - b.bestMs) || a.name.localeCompare(b.name, 'ko'));
    let rank = 0;
    rows.forEach((row, i) => {
        const prev = rows[i - 1];
        if (!prev || prev.best !== row.best || prev.bestMs !== row.bestMs) rank = i + 1;
        row.rank = rank;
    });
    return rows.slice(0, OX_CHALLENGE_BOARD_MAX);
}

/** 보상 안내 문구(시작 화면) */
export function challengeTodayNote(board, studentId, today) {
    const entry = challengeEntries(board)[String(studentId)];
    if (!entry || entry.dayDate !== today) {
        return '오늘 첫 판이에요. 10문제 맞힐 때마다 1봉을 받아요(남는 문제는 봉이 안 돼요).';
    }
    if (entry.dayPaid) {
        return `오늘 봉 받는 판은 끝났어요(${Number(entry.dayCorrect) || 0}개 · ${Number(entry.dayBong) || 0}봉). 지금부터는 기록과 랭킹만 올라가요.`;
    }
    return '오늘 봉 받는 판은 이미 시작했어요. 지금부터는 기록과 랭킹만 올라가요.';
}

/** 끝난 판 보상 문구 */
export function challengeResultNote(plan) {
    if (!plan) return '';
    if (plan.paidNow) {
        if (plan.bong > 0) return `오늘 첫 판이라 ${plan.bong}봉을 받았어요!`;
        return '오늘 첫 판이었어요. 10개를 넘기지 못해 이번엔 봉이 없어요.';
    }
    return '오늘 봉 받는 판은 이미 했어요. 기록과 랭킹에는 들어가요.';
}
