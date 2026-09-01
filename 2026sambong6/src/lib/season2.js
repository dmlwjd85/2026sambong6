/**
 * MATE 시즌 2 — 정산·학사일수·경험치 예산·감시 (순수 함수)
 * 화면 연출·Firestore 쓰기는 sambongWorld.js에서 이 결과를 사용합니다.
 */

export const SEASON2 = {
    number: 2,
    label: '시즌 2',
    theme: '다시 쓰는 2학기',
    nature: 'fall',
    navBadge: 'S2',
    startDate: '2026-09-01',
    startAt: '2026-09-01T08:00:00',
    endAt: '2027-01-07T15:00:00',
    graduationDate: '2027-01-07',
    winterVacationLabel: '겨울 방학',
    winterVacationStart: '2026-12-24',
    winterVacationEnd: '2027-01-06',
    targetXp: 30000,
    questXpBudget: 20000,
    teacherXpBudget: 10000,
    season1XpPerUnit: 10000,
    season1BongPerUnit: 100,
};

/** 2026년 2학기 공휴일(주말 제외 휴업) */
export const KOREA_2026_FALL_HOLIDAYS = [
    '2026-09-24',
    '2026-09-25',
    '2026-10-09',
    '2026-12-25',
    '2027-01-01',
];

export const DAILY_ALL_CLEAR_XP = 25;
export const DAILY_ALL_CLEAR_BONG = 5;
export const DRAGON_BALL_XP = 20;
export const DRAGON_BALL_COMPLETE_XP = 80;
export const XP_PACK_GAIN = 25;
export const XP_PACK_DAILY_LIMIT = 1;
export const CUSTOM_SHOP_XP_MAX = 50;
export const CUSTOM_SHOP_XP_DAILY_LIMIT = 1;
export const CUSTOM_QUEST_XP_MAX = 80;
export const SKIN_REFUND_MAX_PER_SEASON = 3;
export const SKIN_REFUND_MAX_PER_DAY = 1;
export const WEAPON_QUEST_XP_BUFF_RATE = 0;

/** 시즌 2 일일 퀘스트 XP 합(전부 완료 시, 전부완료 보너스 제외) */
export const SEASON2_DAILY_QUEST_XP_SUM = 180;

export function toYmd(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function isYmdInRange(ymd, start, end) {
    if (!ymd || !start || !end) return false;
    return ymd >= start && ymd <= end;
}

/**
 * 평일만 세되, 공휴일·방학은 뺍니다.
 * from/to 포함.
 */
export function countInstructionalWeekdays(fromYmd, untilYmd, holidays = KOREA_2026_FALL_HOLIDAYS, vacationStart = SEASON2.winterVacationStart, vacationEnd = SEASON2.winterVacationEnd) {
    const from = toYmd(fromYmd);
    const to = toYmd(untilYmd);
    if (!from || !to || from > to) return 0;
    const holidaySet = new Set(holidays || []);
    let n = 0;
    const d = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (d <= end) {
        const id = toYmd(d);
        const dow = d.getDay();
        const vac = vacationStart && vacationEnd && isYmdInRange(id, vacationStart, vacationEnd);
        if (dow !== 0 && dow !== 6 && !holidaySet.has(id) && !vac) n += 1;
        d.setDate(d.getDate() + 1);
    }
    return n;
}

export function season2SchoolDaysTotal() {
    return countInstructionalWeekdays(SEASON2.startDate, SEASON2.graduationDate);
}

/** 성실 학생 하루 퀘스트 상한(일일+전부완료). 주간·레이드는 별도. */
export function diligentDailyQuestXp() {
    return SEASON2_DAILY_QUEST_XP_SUM + DAILY_ALL_CLEAR_XP;
}

/**
 * 시즌 2 퀘스트 경로 예상 XP (성실 수행).
 * 일일·전부완료 + 주간 + 잠긴 레이드 1회 + 보스 1회 + 주말 드래곤볼 일부.
 */
export function estimateSeason2QuestXp(schoolDays = season2SchoolDaysTotal()) {
    const days = Math.max(0, Math.floor(Number(schoolDays) || 0));
    const weeks = Math.floor(days / 5);
    const weekends = Math.max(0, Math.round(days / 5));
    const daily = days * diligentDailyQuestXp();
    const weekly = weeks * 40;
    const lockedRaids = 6 * 40;
    const boss = 80;
    const dragon = Math.min(10, weekends) * (DRAGON_BALL_XP * 7 + DRAGON_BALL_COMPLETE_XP);
    return daily + weekly + lockedRaids + boss + dragon;
}

export function season1SettlementBong(xp) {
    const n = Math.max(0, Math.floor(Number(xp) || 0));
    return Math.floor(n / SEASON2.season1XpPerUnit) * SEASON2.season1BongPerUnit;
}

export function uniqueInventory(ids) {
    const seen = new Set();
    const out = [];
    (Array.isArray(ids) ? ids : []).forEach((id) => {
        const k = String(id || '');
        if (!k || seen.has(k)) return;
        seen.add(k);
        out.push(k);
    });
    return out;
}

export function canStartSeason2(todayYmd, alreadyStarted) {
    if (alreadyStarted) return { ok: false, reason: 'already' };
    const today = toYmd(todayYmd);
    if (!today) return { ok: false, reason: 'date' };
    if (today < SEASON2.startDate) return { ok: false, reason: 'before' };
    return { ok: true };
}

export function isSeason2Applied(stu) {
    return Math.floor(Number(stu && stu.seasonNumberApplied) || 0) >= SEASON2.number;
}

/**
 * 시즌 2 시작 시 학생 문서에 쓸 패치.
 * XP만 0으로 되돌립니다. 지갑·은행·공동구매 봉 필드는 넣지 않아 merge 시 그대로 남습니다.
 * 시즌 1 XP 1만당 100봉은 bongDelta로만 알려, 호출 측이 increment로 더합니다.
 */
export function buildSeason2StudentPatch(stu, nowMs = Date.now()) {
    if (isSeason2Applied(stu)) return { skip: true, patch: null, rewardBong: 0, bongDelta: 0, season1Xp: 0 };
    const season1Xp = Math.max(0, Math.floor(Number(stu && stu.xp) || 0));
    const rewardBong = season1SettlementBong(season1Xp);
    const beforeBong = Number(stu && stu.bong);
    const walletBong = Number.isFinite(beforeBong) ? beforeBong : 0;
    const inventory = uniqueInventory(stu && stu.inventory);
    const equipped = inventory.includes(stu && stu.equippedWeapon) ? stu.equippedWeapon : (inventory[0] || null);
    const xpLog = [{
        at: nowMs,
        reason: '시즌 2 시작 · 시즌 1 경험치 정산',
        before: season1Xp,
        after: 0,
        delta: -season1Xp,
        source: 'season2Start',
        season1Xp,
        rewardBong,
    }];
    const bongLogs = Array.isArray(stu && stu.bongChangeLog) ? stu.bongChangeLog.slice(-79) : [];
    if (rewardBong > 0) {
        bongLogs.push({
            at: nowMs,
            reason: `시즌 1 경험치 정산 (${season1Xp.toLocaleString()} XP → +${rewardBong}봉)`,
            before: walletBong,
            after: walletBong + rewardBong,
            delta: rewardBong,
            source: 'season2Start',
        });
    }
    return {
        skip: false,
        rewardBong,
        bongDelta: rewardBong,
        season1Xp,
        patch: {
            seasonNumberApplied: SEASON2.number,
            season1Xp,
            season1SettledAt: nowMs,
            season1BongReward: rewardBong,
            xp: 0,
            quests: {},
            unlockedQuests: {},
            questHistory: [],
            dailyAllClearBonusDate: '',
            earlyBirdCount: 0,
            usedRaidPasswords: [],
            dragonBalls: [],
            dragonBallWeekendKey: '',
            inventory,
            equippedWeapon: equipped,
            seasonSkinRefundCount: 0,
            lastSkinRefundDate: '',
            xpChangeLog: xpLog,
            bongChangeLog: bongLogs,
        },
    };
}

export function worldSettingsForSeason2(prev = {}) {
    return {
        ...prev,
        seasonNumber: SEASON2.number,
        seasonLabel: SEASON2.label,
        seasonName: SEASON2.label,
        seasonTheme: SEASON2.theme,
        seasonNature: SEASON2.nature,
        navBadge: SEASON2.navBadge,
        seasonStartAt: SEASON2.startAt,
        seasonEndAt: SEASON2.endAt,
        semester: 2,
        vacationEnabled: true,
        vacationLabel: SEASON2.winterVacationLabel,
        vacationStartDate: SEASON2.winterVacationStart,
        vacationEndDate: SEASON2.winterVacationEnd,
        vacationPauseLunch: true,
        vacationPauseSalary: true,
        vacationPauseClassXp: true,
        vacationPauseBankBonus: true,
        vacationPauseThermometer: true,
    };
}

export const XP_ANOMALY_DAILY_GAIN_WARN = 400;
export const XP_ANOMALY_SINGLE_DELTA_WARN = 180;
export const XP_ANOMALY_AHEAD_OF_PACE_WARN = 8000;

/** 시즌 시작일부터 오늘까지 성실 퀘스트 페이스 */
export function expectedXpPace(todayYmd) {
    const today = toYmd(todayYmd);
    if (!today || today < SEASON2.startDate) return 0;
    const capped = today > SEASON2.graduationDate ? SEASON2.graduationDate : today;
    const days = countInstructionalWeekdays(SEASON2.startDate, capped);
    return days * diligentDailyQuestXp();
}

export function countSkinRefundsOnDate(ledger, ymd) {
    const day = toYmd(ymd);
    const rows = Array.isArray(ledger) ? ledger : [];
    return rows.filter((row) => row && toYmd(row.at) === day).length;
}

export function canRefundSkinThisSeason(stu, todayYmd) {
    const seasonCount = Math.max(0, Math.floor(Number(stu && stu.seasonSkinRefundCount) || 0));
    if (seasonCount >= SKIN_REFUND_MAX_PER_SEASON) return { ok: false, reason: 'season' };
    const todayCount = countSkinRefundsOnDate(stu && stu.itemRefundLedger, todayYmd);
    if (todayCount >= SKIN_REFUND_MAX_PER_DAY) return { ok: false, reason: 'day' };
    return { ok: true };
}

export function weaponDropMultiplier(inventoryCount) {
    const n = Math.max(0, Math.floor(Number(inventoryCount) || 0));
    if (n <= 0) return 2.0;
    if (n === 1) return 1.0;
    return 0.25;
}

export function catalogQuestRewards(quest, fallbackXp, fallbackBong) {
    const xp = Math.max(0, Math.floor(Number(quest && quest.xp != null ? quest.xp : fallbackXp) || 0));
    const bongRaw = Number(quest && quest.bong != null ? quest.bong : fallbackBong);
    const bong = Number.isFinite(bongRaw) && bongRaw > 0 ? Math.max(0, Math.round(bongRaw)) : 0;
    return { xp, bong };
}

export function buildXpSupervisionIncidents(stu, todayYmd, expectedXp) {
    if (!stu) return [];
    const today = toYmd(todayYmd);
    const incidents = [];
    const xp = Math.max(0, Math.floor(Number(stu.xp) || 0));
    const logs = Array.isArray(stu.xpChangeLog) ? stu.xpChangeLog : [];
    const pace = Math.max(0, Math.floor(Number(expectedXp) || 0));

    if (pace > 0 && xp > pace + XP_ANOMALY_AHEAD_OF_PACE_WARN) {
        incidents.push({
            id: `xp_pace_${today}_${xp}`,
            date: today,
            dateLabel: today,
            category: '페이스 초과',
            action: `보유 XP ${xp.toLocaleString()} (예상 ${pace.toLocaleString()} + 여유 ${XP_ANOMALY_AHEAD_OF_PACE_WARN.toLocaleString()} 초과)`,
        });
    }

    let todayGain = 0;
    const todayRows = [];
    logs.forEach((row) => {
        if (!row || !row.at) return;
        const ds = toYmd(row.at);
        if (ds !== today) return;
        const delta = Math.floor(Number(row.delta) || 0);
        if (delta > 0) {
            todayGain += delta;
            todayRows.push(row);
        }
    });
    if (todayGain >= XP_ANOMALY_DAILY_GAIN_WARN) {
        incidents.push({
            id: `xp_daily_${today}_${todayGain}`,
            date: today,
            dateLabel: today,
            category: '과다 일일 XP',
            action: `당일 누적 +${todayGain.toLocaleString()} XP (기준 ${XP_ANOMALY_DAILY_GAIN_WARN} 초과)`,
            details: todayRows.slice(-8).map((row) => ({
                dateLabel: toYmd(row.at),
                action: `${row.reason || 'XP 변경'} (+${Math.floor(Number(row.delta) || 0)})`,
            })),
        });
    }

    logs.forEach((row, idx) => {
        const delta = Math.floor(Number(row && row.delta) || 0);
        if (delta < XP_ANOMALY_SINGLE_DELTA_WARN) return;
        const ds = row.at ? toYmd(row.at) : today;
        incidents.push({
            id: `xp_single_${row.at || idx}_${delta}`,
            date: ds,
            dateLabel: ds,
            category: '단일 대량 XP',
            action: `${row.reason || 'XP 변경'} — 단일 +${delta.toLocaleString()} (기준 ${XP_ANOMALY_SINGLE_DELTA_WARN} 초과)`,
        });
    });

    return incidents;
}
