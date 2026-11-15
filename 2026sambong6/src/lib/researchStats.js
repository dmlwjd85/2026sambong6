/**
 * 활용 통계 집계
 * 오늘/이번 주 퀘스트 완료율, XP 증가, 퀘스트 완료 Top 3, 상점 이용 등을 계산합니다.
 */

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toYmd(input) {
    if (input == null || input === '') return '';
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeekMonday(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay(); // 0 Sun
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return x;
}

function addDaysYmd(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return toYmd(dt);
}

function inRange(ymd, start, end) {
    return ymd && start && end && ymd >= start && ymd <= end;
}

function mapTopQuests(entries, resolveQuestName, limit = 3) {
    return [...entries]
        .map(([id, count]) => ({ id, name: resolveQuestName(id), count }))
        .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'ko'))
        .slice(0, limit);
}

/**
 * @param {object} opts
 * @param {any[]} opts.students
 * @param {string[]} opts.studentIds
 * @param {(sid:string)=>string} opts.getName
 * @param {any[]} opts.dailyQuests
 * @param {any[]} [opts.allQuests] 이름 해석용 전체 퀘스트 목록
 * @param {string} [opts.today]
 */
export function computeResearchStats(opts) {
    const today = opts.today || toYmd(new Date());
    const weekStart = toYmd(startOfWeekMonday(new Date()));
    const weekEnd = addDaysYmd(weekStart, 6);
    const dailyQuests = Array.isArray(opts.dailyQuests) ? opts.dailyQuests : [];
    const allQuests = Array.isArray(opts.allQuests) && opts.allQuests.length
        ? opts.allQuests
        : dailyQuests;
    const dailyIds = dailyQuests.map((q) => String(q.id));
    const students = (opts.studentIds || []).map((id) => {
        const sid = String(id);
        const row = (opts.students || []).find((s) => String(s.id) === sid) || { id: sid };
        return row;
    });

    const questCountById = new Map();
    const questCountToday = new Map();
    const questCountWeek = new Map();
    let todayCompletions = 0;
    let weekCompletions = 0;
    let todayStudentDoneSum = 0;
    let weekStudentDoneSum = 0;
    let allClearToday = 0;
    let purchaseCount = 0;
    let purchaseCountWeek = 0;
    let questCancelToday = 0;
    let questCancelWeek = 0;
    let questCancelAll = 0;

    const perStudent = students.map((stu) => {
        const sid = String(stu.id);
        const name = (opts.getName && opts.getName(sid)) || sid;
        const history = Array.isArray(stu.questHistory) ? stu.questHistory : [];
        const todayDone = new Set();
        const weekDone = new Set();
        let xpGainToday = 0;
        let xpGainWeek = 0;
        let bongGainToday = 0;
        let bongGainWeek = 0;
        // 눌렀다가 취소한 퀘스트(#107): 취소로 되돌린 XP는 증가량에서 빼고, 취소 횟수를 따로 보여 줘요.
        let xpBackToday = 0;
        let xpBackWeek = 0;
        const logCancel = { today: 0, week: 0, all: 0 };
        const recCancel = { today: 0, week: 0, all: 0 };
        (Array.isArray(stu.questCancels) ? stu.questCancels : []).forEach((c) => {
            if (!c || !c.id) return;
            const day = c.date || toYmd(c.timestamp);
            recCancel.all += 1;
            if (day === today) recCancel.today += 1;
            if (inRange(day, weekStart, weekEnd)) recCancel.week += 1;
        });

        history.forEach((h) => {
            if (!h) return;
            const day = h.date || toYmd(h.timestamp);
            const qid = String(h.id || '');
            if (!qid) return;
            questCountById.set(qid, (questCountById.get(qid) || 0) + 1);
            if (day === today) {
                todayCompletions += 1;
                todayDone.add(qid);
                questCountToday.set(qid, (questCountToday.get(qid) || 0) + 1);
            }
            if (inRange(day, weekStart, weekEnd)) {
                weekCompletions += 1;
                weekDone.add(qid);
                questCountWeek.set(qid, (questCountWeek.get(qid) || 0) + 1);
            }
        });

        (Array.isArray(stu.xpChangeLog) ? stu.xpChangeLog : []).forEach((log) => {
            if (!log) return;
            const day = toYmd(log.at);
            const delta = Number(log.delta) || 0;
            if (String(log.reason || '').startsWith('퀘스트 취소')) {
                logCancel.all += 1;
                if (day === today) { logCancel.today += 1; xpBackToday += Math.max(0, -delta); }
                if (inRange(day, weekStart, weekEnd)) { logCancel.week += 1; xpBackWeek += Math.max(0, -delta); }
                return;
            }
            if (delta <= 0) return;
            if (day === today) xpGainToday += delta;
            if (inRange(day, weekStart, weekEnd)) xpGainWeek += delta;
        });
        xpGainToday = Math.max(0, xpGainToday - xpBackToday);
        xpGainWeek = Math.max(0, xpGainWeek - xpBackWeek);
        // 취소 기록(questCancels)과 XP 변동 기록 가운데 많은 쪽을 써요(방패가 XP 회수를 막으면 변동 기록이 안 남아요).
        const cancelToday = Math.max(recCancel.today, logCancel.today);
        const cancelWeek = Math.max(recCancel.week, logCancel.week);
        const cancelAll = Math.max(recCancel.all, logCancel.all);
        questCancelToday += cancelToday;
        questCancelWeek += cancelWeek;
        questCancelAll += cancelAll;

        (Array.isArray(stu.bongChangeLog) ? stu.bongChangeLog : []).forEach((log) => {
            if (!log) return;
            const day = toYmd(log.at);
            const delta = Number(log.delta) || 0;
            if (delta <= 0) return;
            if (day === today) bongGainToday += delta;
            if (inRange(day, weekStart, weekEnd)) bongGainWeek += delta;
        });

        const purchases = [
            ...(Array.isArray(stu.conveniencePurchases) ? stu.conveniencePurchases : []),
            ...(Array.isArray(stu.classEventPurchases) ? stu.classEventPurchases : []),
        ];
        purchases.forEach((p) => {
            purchaseCount += 1;
            const day = toYmd(p.at);
            if (inRange(day, weekStart, weekEnd)) purchaseCountWeek += 1;
        });

        const todayDailyDone = dailyIds.filter((id) => todayDone.has(id)).length;
        const weekDailyDone = dailyIds.filter((id) => weekDone.has(id)).length;
        todayStudentDoneSum += todayDailyDone;
        weekStudentDoneSum += weekDailyDone;
        if (dailyIds.length > 0 && todayDailyDone === dailyIds.length) allClearToday += 1;

        return {
            id: sid,
            name,
            xp: Math.max(0, Math.floor(Number(stu.xp) || 0)),
            bong: Number(stu.bong) || 0,
            todayDailyDone,
            weekDailyDone,
            xpGainToday,
            xpGainWeek,
            bongGainToday,
            bongGainWeek,
            cancelToday,
            cancelWeek,
            cancelAll,
            purchaseCount: purchases.length,
            jobs: Array.isArray(stu.jobs) ? stu.jobs.length : 0,
        };
    });

    const n = Math.max(1, students.length);
    const dailyTotalSlots = Math.max(1, dailyIds.length * students.length);
    const todayRate = dailyIds.length ? (todayStudentDoneSum / dailyTotalSlots) * 100 : 0;
    // 주간: 학생×일일퀘스트 대비 주간 unique 완료(느슨한 지표)
    const weekRate = dailyIds.length ? (weekStudentDoneSum / dailyTotalSlots) * 100 : 0;

    const resolveQuestName = (id) => {
        const q = allQuests.find((x) => String(x.id) === String(id))
            || dailyQuests.find((x) => String(x.id) === String(id));
        return (q && q.name) || String(id);
    };

    const topQuests = mapTopQuests(questCountById.entries(), resolveQuestName, 8);
    const topQuestsToday = mapTopQuests(questCountToday.entries(), resolveQuestName, 5);
    const topQuestsWeek = mapTopQuests(questCountWeek.entries(), resolveQuestName, 5);
    const period = opts.period || 'week';
    const topQuestsPeriod = period === 'today'
        ? mapTopQuests(questCountToday.entries(), resolveQuestName, 3)
        : (period === 'all'
            ? mapTopQuests(questCountById.entries(), resolveQuestName, 3)
            : mapTopQuests(questCountWeek.entries(), resolveQuestName, 3));

    const avgXpGainToday = perStudent.reduce((s, r) => s + r.xpGainToday, 0) / n;
    const avgXpGainWeek = perStudent.reduce((s, r) => s + r.xpGainWeek, 0) / n;

    // 은행 이용: 예금·적금 기록 건수
    let bankUseCount = 0;
    students.forEach((stu) => {
        const terms = Array.isArray(stu.bankTermDeposits) ? stu.bankTermDeposits.length : 0;
        const regular = Number(stu.bankRegularSavings) > 0 ? 1 : 0;
        bankUseCount += terms + regular;
    });

    const allRate = dailyIds.length
        ? (todayCompletions > 0 || weekCompletions > 0
            ? Math.round(((weekStudentDoneSum + todayStudentDoneSum) / (dailyTotalSlots * 2)) * 1000) / 10
            : Math.round(weekRate * 10) / 10)
        : 0;

    return {
        generatedAt: new Date().toISOString(),
        today,
        weekStart,
        weekEnd,
        period,
        studentCount: students.length,
        dailyQuestCount: dailyIds.length,
        todayCompletions,
        weekCompletions,
        todayCompletionRate: Math.round(todayRate * 10) / 10,
        weekCompletionRate: Math.round(weekRate * 10) / 10,
        allCompletionRate: allRate,
        allClearToday,
        avgXpGainToday: Math.round(avgXpGainToday * 10) / 10,
        avgXpGainWeek: Math.round(avgXpGainWeek * 10) / 10,
        purchaseCount,
        purchaseCountWeek,
        questCancelToday,
        questCancelWeek,
        questCancelAll,
        bankUseCount,
        topQuests,
        topQuestsToday,
        topQuestsWeek,
        topQuestsPeriod,
        perStudent: perStudent.sort((a, b) => b.xpGainWeek - a.xpGainWeek),
    };
}

export function researchStatsToCsv(stats) {
    const lines = [];
    lines.push('구분,값');
    lines.push(`생성시각,${stats.generatedAt}`);
    lines.push(`오늘,${stats.today}`);
    lines.push(`이번주,${stats.weekStart}~${stats.weekEnd}`);
    lines.push(`학생수,${stats.studentCount}`);
    lines.push(`오늘_일일퀘스트완료율(%),${stats.todayCompletionRate}`);
    lines.push(`이번주_일일퀘스트완료율(%),${stats.weekCompletionRate}`);
    lines.push(`오늘_전부완료_학생수,${stats.allClearToday}`);
    lines.push(`오늘_평균XP증가,${stats.avgXpGainToday}`);
    lines.push(`이번주_평균XP증가,${stats.avgXpGainWeek}`);
    lines.push(`상점_이용건수_전체,${stats.purchaseCount}`);
    lines.push(`상점_이용건수_이번주,${stats.purchaseCountWeek}`);
    lines.push(`퀘스트_눌렀다취소_오늘,${stats.questCancelToday || 0}`);
    lines.push(`퀘스트_눌렀다취소_이번주,${stats.questCancelWeek || 0}`);
    lines.push('');
    lines.push('퀘스트완료_Top3(선택기간),완료수');
    (stats.topQuestsPeriod || []).forEach((q) => lines.push(`"${String(q.name).replace(/"/g, '""')}",${q.count}`));
    lines.push('');
    lines.push('인기퀘스트(누적),완료수');
    (stats.topQuests || []).forEach((q) => lines.push(`"${String(q.name).replace(/"/g, '""')}",${q.count}`));
    lines.push('');
    lines.push('학번,이름,XP,봉,오늘일일완료,주간일일완료,오늘XP증가,주간XP증가,오늘봉증가,주간봉증가,구매건수,직업수,오늘취소,주간취소');
    (stats.perStudent || []).forEach((r) => {
        lines.push([
            r.id,
            `"${String(r.name).replace(/"/g, '""')}"`,
            r.xp,
            r.bong,
            r.todayDailyDone,
            r.weekDailyDone,
            r.xpGainToday,
            r.xpGainWeek,
            r.bongGainToday,
            r.bongGainWeek,
            r.purchaseCount,
            r.jobs,
            r.cancelToday || 0,
            r.cancelWeek || 0,
        ].join(','));
    });
    return lines.join('\n');
}

export function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
