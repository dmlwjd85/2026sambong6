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

/** 시즌 2 감독·정산은 이 시각 이후 로그만 봅니다. */
export function season2SupervisionSinceMs(stu, season2StartedAt) {
    const settled = Math.max(0, Math.floor(Number(stu && stu.season1SettledAt) || 0));
    const started = Math.max(0, Math.floor(Number(season2StartedAt) || 0));
    const fromDate = Date.parse(SEASON2.startAt);
    const seasonOpen = Number.isFinite(fromDate) ? fromDate : 0;
    return Math.max(settled, started, seasonOpen);
}

export function filterLogsSince(logs, sinceMs) {
    const since = Math.max(0, Math.floor(Number(sinceMs) || 0));
    return (Array.isArray(logs) ? logs : []).filter((row) => {
        if (!row) return false;
        const at = Number(row.at);
        if (!Number.isFinite(at)) return false;
        return at >= since;
    });
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
 * XP·퀘스트·보유 무기를 비웁니다. 지갑·은행·공동구매 봉 필드는 넣지 않아 merge 시 그대로 남습니다.
 * 시즌 1 XP 1만당 100봉은 bongDelta로만 알려, 호출 측이 increment로 더합니다.
 * 금융감독용 로그는 시즌 2 정산분부터만 남깁니다.
 */
export function buildSeason2StudentPatch(stu, nowMs = Date.now()) {
    if (isSeason2Applied(stu)) return { skip: true, patch: null, rewardBong: 0, bongDelta: 0, season1Xp: 0 };
    const season1Xp = Math.max(0, Math.floor(Number(stu && stu.xp) || 0));
    const rewardBong = season1SettlementBong(season1Xp);
    const beforeBong = Number(stu && stu.bong);
    const walletBong = Number.isFinite(beforeBong) ? beforeBong : 0;
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
    const bongLogs = [];
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
            inventory: [],
            equippedWeapon: null,
            itemRefundLedger: [],
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

export function buildXpSupervisionIncidents(stu, todayYmd, expectedXp, sinceMs = 0) {
    if (!stu) return [];
    const today = toYmd(todayYmd);
    const incidents = [];
    const xp = Math.max(0, Math.floor(Number(stu.xp) || 0));
    const logs = filterLogsSince(stu.xpChangeLog, sinceMs);
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

export const SEASON1_ITEM_REFUND_RATE = 0.5;
export const SHIELD_CATALOG_PRICE = 50;
export const DRAGON_BALL_REWARD_MAX = 300;

/** 보유 스킨 id 목록 — 객체/배열 모두 허용 */
export function listOwnedSkinIds(ownedSkins) {
    if (Array.isArray(ownedSkins)) return ownedSkins.map((id) => String(id)).filter(Boolean);
    if (ownedSkins && typeof ownedSkins === 'object') {
        return Object.keys(ownedSkins).filter((id) => !!ownedSkins[id]);
    }
    return [];
}

export function refundBongForPrice(price, rate = SEASON1_ITEM_REFUND_RATE) {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n * rate);
}

/** 이미 시즌 1 아이템 환불을 받은 학생은 다시 스킨을 비우지 않습니다. */
export function studentAlreadyGotSeason1ItemRefund(stu) {
    const ledger = Array.isArray(stu && stu.itemRefundLedger) ? stu.itemRefundLedger : [];
    return ledger.some((row) => row && (row.source === 'season1ItemRefund' || row.kind === 'season1_items'));
}

/**
 * 시즌 1에 산 캐릭터·오라·방패를 50% 환불하고 비우는 패치.
 * 지갑 봉은 increment로 더하도록 refundBong만 반환합니다.
 */
export function buildSeason1ItemRefundPatch(stu, catalog = [], opts = {}) {
    if (studentAlreadyGotSeason1ItemRefund(stu)) {
        return { skip: true, refundBong: 0, items: [], patch: null, alreadyRefunded: true };
    }
    const nowMs = Number(opts.nowMs) || Date.now();
    const shieldPrice = Math.max(0, Number(opts.shieldPrice) || SHIELD_CATALOG_PRICE);
    const items = [];
    let refundBong = 0;
    const byId = new Map((catalog || []).map((s) => [String(s.id), s]));
    listOwnedSkinIds(stu && stu.ownedSkins).forEach((id) => {
        const skin = byId.get(String(id));
        const price = skin ? Number(skin.price) || 0 : 0;
        const refund = refundBongForPrice(price);
        refundBong += refund;
        items.push({
            id,
            name: (skin && skin.name) || id,
            kind: 'skin',
            refundB: refund,
        });
    });
    const hasShield = !!(stu && (stu.hasShield || (Number(stu.shieldHP) || 0) > 0));
    if (hasShield) {
        const refund = refundBongForPrice(shieldPrice);
        refundBong += refund;
        items.push({ id: 'item_shield', name: '절대 방패', kind: 'shield', refundB: refund });
    }
    if (!items.length) {
        return { skip: true, refundBong: 0, items: [], patch: null };
    }
    const prevBong = Number(stu && stu.bong);
    const walletBong = Number.isFinite(prevBong) ? prevBong : 0;
    const names = items.map((it) => it.name);
    const bongLogs = Array.isArray(stu && stu.bongChangeLog) ? stu.bongChangeLog.slice() : [];
    bongLogs.push({
        at: nowMs,
        reason: `시즌 1 아이템 50% 환불 (${names.join(', ')})`,
        before: walletBong,
        after: walletBong + refundBong,
        delta: refundBong,
        source: 'season1ItemRefund',
    });
    const ledger = Array.isArray(stu && stu.itemRefundLedger) ? stu.itemRefundLedger.slice() : [];
    ledger.push({
        at: nowMs,
        kind: 'season1_items',
        refundB: refundBong,
        names,
        source: 'season1ItemRefund',
    });
    return {
        skip: false,
        refundBong,
        items,
        patch: {
            ownedSkins: {},
            equippedSkins: {},
            ownedSkinInstances: {},
            hasShield: false,
            shieldHP: 0,
            bongChangeLog: bongLogs.slice(-80),
            itemRefundLedger: ledger.slice(-80),
        },
    };
}

export const SHIELD_STOCK_DEFAULT = 5;

/** 상점 절대 방패 남은 재고. 값이 없으면 기본 5개를 씁니다. */
export function readShieldStock(settings) {
    if (!settings || settings.shieldStock === undefined || settings.shieldStock === null || settings.shieldStock === '') {
        return SHIELD_STOCK_DEFAULT;
    }
    const n = Math.floor(Number(settings.shieldStock));
    if (!Number.isFinite(n)) return SHIELD_STOCK_DEFAULT;
    return Math.max(0, n);
}

/** 절대 방패 내구도. hasShield(레거시)는 100으로 칩니다. */
export function shieldHpOf(stu) {
    const hp = (Number(stu && stu.shieldHP) || 0) + (stu && stu.hasShield ? 100 : 0);
    return Math.max(0, Math.floor(hp));
}

/**
 * 경험치 차감에만 절대 방패를 씁니다. 봉 차감 경로에서는 호출하지 마세요.
 */
export function applyShieldToXpDeduct(stu, deductAmt) {
    let remainingDeduct = Math.max(0, Math.abs(Math.floor(Number(deductAmt) || 0)));
    let hp = shieldHpOf(stu);
    const updates = {};
    if (stu && stu.hasShield) updates.hasShield = false;
    let absorbed = 0;
    if (hp > 0 && remainingDeduct > 0) {
        if (hp >= remainingDeduct) {
            absorbed = remainingDeduct;
            updates.shieldHP = hp - remainingDeduct;
            remainingDeduct = 0;
        } else {
            absorbed = hp;
            remainingDeduct -= hp;
            updates.shieldHP = 0;
        }
    }
    return { updates, remainingDeduct, absorbed };
}

export function sanitizeDragonBallRewards(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const clamp = (v, fallback) => {
        const n = Math.floor(Number(v));
        if (!Number.isFinite(n)) return fallback;
        return Math.max(0, Math.min(DRAGON_BALL_REWARD_MAX, n));
    };
    return {
        findXp: clamp(src.findXp != null ? src.findXp : src.dragonBallFindXp, DRAGON_BALL_XP),
        findBong: clamp(src.findBong != null ? src.findBong : src.dragonBallFindBong, 0),
        completeXp: clamp(src.completeXp != null ? src.completeXp : src.dragonBallCompleteXp, DRAGON_BALL_COMPLETE_XP),
        completeBong: clamp(src.completeBong != null ? src.completeBong : src.dragonBallCompleteBong, 0),
    };
}

/** 시즌 1 전설 등급 XP (4만). */
export const SEASON1_LEGEND_XP = 40000;

/**
 * 시즌 1 정산 때 빠진 기록.
 * 학번과 이름이 모두 맞을 때만 보정합니다.
 */
export const SEASON1_XP_CORRECTIONS = Object.freeze([
    Object.freeze({ id: '12', name: '황훈태', season1Xp: SEASON1_LEGEND_XP }),
]);

function studentDisplayName(stu, nameMap = {}) {
    const id = String((stu && stu.id) || '');
    return String((nameMap && nameMap[id]) || (stu && stu.name) || '').trim();
}

/** 문서에 저장된 시즌 1 XP. 보정 전 값입니다. */
export function storedSeason1Xp(stu) {
    const n = Math.floor(Number(stu && stu.season1Xp));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 정산 누락분. 다른 학급의 같은 학번은 이름이 다르면 적용하지 않습니다. */
export function season1CorrectionXp(stu, nameMap = {}) {
    const id = String((stu && stu.id) || '');
    if (!id) return 0;
    const name = studentDisplayName(stu, nameMap);
    const hit = SEASON1_XP_CORRECTIONS.find((c) => c.id === id && name === c.name);
    if (!hit) return 0;
    const n = Math.floor(Number(hit.season1Xp));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 시즌 1 정산 XP. 누락 보정이 있으면 더 큰 값을 씁니다. */
export function season1RecordXp(stu, nameMap = {}) {
    return Math.max(storedSeason1Xp(stu), season1CorrectionXp(stu, nameMap));
}

export function isSeason1LegendXp(xp) {
    return Math.floor(Number(xp) || 0) >= SEASON1_LEGEND_XP;
}

/**
 * 빠진 시즌 1 XP를 문서에 채울 패치.
 * 지갑 봉은 건드리지 않습니다.
 */
export function buildSeason1XpCorrectionPatch(stu, nameMap = {}, nowMs = Date.now()) {
    const target = season1CorrectionXp(stu, nameMap);
    if (target <= 0) return { skip: true, patch: null };
    const fromStore = storedSeason1Xp(stu);
    if (fromStore >= target) return { skip: true, patch: null };
    return {
        skip: false,
        patch: {
            season1Xp: target,
            season1SettledAt: (stu && stu.season1SettledAt) ? stu.season1SettledAt : nowMs,
            season1XpCorrectedAt: nowMs,
            season1XpCorrectedFrom: fromStore,
        },
    };
}

/**
 * 시즌 1 명예의 전당 순위.
 * 마스터·게스트는 빼고, 시즌 1 XP 높은 순입니다.
 */
export function buildSeason1HallOfFame(students, nameMap = {}) {
    const list = Array.isArray(students) ? students.slice() : [];
    const seen = new Set(list.map((s) => String((s && s.id) || '')).filter(Boolean));
    SEASON1_XP_CORRECTIONS.forEach((c) => {
        if (seen.has(c.id)) return;
        const mapped = String((nameMap && nameMap[c.id]) || '').trim();
        if (mapped !== c.name) return;
        list.push({ id: c.id, name: c.name, season1Xp: 0 });
    });
    const rows = list
        .filter((s) => {
            const id = String((s && s.id) || '');
            return id && id !== 'gm' && id !== 'gm_a' && id !== 'guest';
        })
        .map((s) => {
            const id = String(s.id);
            const season1Xp = season1RecordXp(s, nameMap);
            return {
                id,
                name: nameMap[id] || s.name || id,
                season1Xp,
                season1BongReward: Math.max(0, Math.floor(Number(s.season1BongReward) || 0)),
                isLegend: isSeason1LegendXp(season1Xp),
            };
        })
        .sort((a, b) => b.season1Xp - a.season1Xp || a.id.localeCompare(b.id, 'ko'));
    return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}
