/**
 * OX 무제한 도전 랭킹 보상: 평일 정해진 시각(기본 14:40)에 최고 기록 상위 5등까지 경험치와 봉을 줘요.
 * 화면과 Firestore는 여기 두지 않고, 설정 정리·순위·지급할 날 계산만 합니다.
 *
 * - 순위는 최고 기록(맞힌 개수)만 봐요. 개수가 같으면 같은 등수이고 둘 다 받아요(1, 1, 3, 4, 5 …).
 * - 5등 안에 동점이 걸리면 그 사람들 모두 받아요. 0개 기록은 순위에 넣지 않아요.
 * - 하루에 한 번만 줘요. 지급 기록 문서(oxRankRewards/{YYYY-MM-DD})가 있으면 다시 주지 않아요.
 * - 주말·공휴일·방학에는 주지 않아요. 마스터가 시각과 등수별 보상을 고칠 수 있어요(settings/global 의 oxRankReward).
 */

export const OX_RANK_REWARD_PLACES = 5;
export const OX_RANK_REWARD_REASON = 'OX 랭킹 보상';
export const OX_RANK_REWARD_SOURCE = 'oxRankReward';

export const OX_RANK_REWARD_DEFAULT = Object.freeze({
    enabled: true,
    /** 지급 시각(한국 시각, 24시간) */
    hour: 14,
    minute: 40,
    /** 1등부터 5등까지 */
    prizes: Object.freeze([
        Object.freeze({ xp: 100, bong: 10 }),
        Object.freeze({ xp: 80, bong: 8 }),
        Object.freeze({ xp: 60, bong: 6 }),
        Object.freeze({ xp: 40, bong: 4 }),
        Object.freeze({ xp: 20, bong: 2 }),
    ]),
});

const num = (v, def, lo, hi) => {
    const n = Math.floor(Number(v));
    return v !== null && v !== '' && v !== undefined && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};

/** 마스터 설정 정리. 빈 값은 기본값, 범위 밖은 범위 안으로 맞춰요. 학생 문서 규칙(경험치 한 번에 650까지)에 맞게 경험치는 500까지예요. */
export function sanitizeOxRankReward(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const d = OX_RANK_REWARD_DEFAULT;
    const list = Array.isArray(src.prizes) ? src.prizes : [];
    return {
        enabled: src.enabled === undefined ? d.enabled : src.enabled !== false,
        hour: num(src.hour, d.hour, 0, 23),
        minute: num(src.minute, d.minute, 0, 59),
        prizes: d.prizes.map((def, i) => {
            const p = list[i] && typeof list[i] === 'object' ? list[i] : {};
            return { xp: num(p.xp, def.xp, 0, 500), bong: num(p.bong, def.bong, 0, 500) };
        }),
    };
}

/** 한국 날짜·요일·분 */
export function kstParts(ms) {
    const d = new Date(Number(ms) + 9 * 3600 * 1000);
    return {
        ymd: d.toISOString().slice(0, 10),
        weekday: d.getUTCDay(),
        minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
}

/**
 * 오늘 지급할 차례인지. 차례면 그날 날짜(YYYY-MM-DD), 아니면 ''.
 * offDay(ymd) → true 이면 공휴일·방학이라 건너뛰어요. 지급 시각이 지나면 그날 자정 전까지는 늦게 열어도 줘요.
 */
export function oxRankRewardDueYmd(nowMs, cfgRaw, { offDay = () => false } = {}) {
    const cfg = sanitizeOxRankReward(cfgRaw);
    if (!cfg.enabled) return '';
    const k = kstParts(nowMs);
    if (k.weekday === 0 || k.weekday === 6) return '';
    if (k.minutes < cfg.hour * 60 + cfg.minute) return '';
    if (offDay(k.ymd)) return '';
    return k.ymd;
}

/** 다음 지급 시각(+2초)까지 남은 밀리초. 주말인지는 시각이 되면 다시 봐요. */
export function oxRankRewardDelayMs(nowMs, cfgRaw) {
    const cfg = sanitizeOxRankReward(cfgRaw);
    const target = cfg.hour * 60 + cfg.minute;
    const msOfDay = (Number(nowMs) + 9 * 3600 * 1000) % 86400000;
    let wait = target * 60000 - msOfDay;
    if (wait <= 0) wait += 86400000;
    return wait + 2000;
}

/**
 * 보상 받을 사람. rows: [{ id, best }] (학생별 최고 기록). ids 를 주면 그 학번만 봐요(명단에 있는 학생).
 * @returns [{ id, best, place, xp, bong }] 등수 순
 */
export function oxRankRewardWinners(rows, cfgRaw, { ids = null } = {}) {
    const cfg = sanitizeOxRankReward(cfgRaw);
    const allow = ids ? new Set(ids.map(String)) : null;
    const list = [];
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        const id = String((r && r.id) || '');
        const best = Math.floor(Number(r && r.best)) || 0;
        if (!id || best <= 0 || (allow && !allow.has(id)) || list.some((x) => x.id === id)) return;
        list.push({ id, best });
    });
    list.sort((a, b) => b.best - a.best || a.id.localeCompare(b.id, 'ko', { numeric: true }));
    const out = [];
    list.forEach((row, i) => {
        const place = i > 0 && list[i - 1].best === row.best ? out[i - 1].place : i + 1;
        out.push({ ...row, place });
    });
    return out
        .filter((r) => r.place <= OX_RANK_REWARD_PLACES)
        .map((r) => ({ ...r, xp: cfg.prizes[r.place - 1].xp, bong: cfg.prizes[r.place - 1].bong }));
}

/** 보상 안내 한 줄 */
export function oxRankRewardNote(cfgRaw) {
    const cfg = sanitizeOxRankReward(cfgRaw);
    if (!cfg.enabled) return '';
    const time = `${cfg.hour}시${cfg.minute ? ` ${cfg.minute}분` : ''}`;
    const prizes = cfg.prizes.map((p, i) => `${i + 1}등 ${p.xp}XP·${p.bong}봉`).join(', ');
    return `평일 ${time}에 랭킹 상위 ${OX_RANK_REWARD_PLACES}등까지 보상을 줘요(동점은 모두): ${prizes}`;
}
