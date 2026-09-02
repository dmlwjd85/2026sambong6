/**
 * 냥코 원정 — 자기 캐릭터와 친구(최대 2명)로 스테이지를 자동 전투합니다.
 * 친구를 넣을수록 적 체력·공격이 더 커져 난이도가 올라갑니다.
 * 보상은 경험치·봉을 아주 작게 줍니다.
 */

export const CAT_STAGE_COUNT = 12;
export const CAT_MAX_FRIENDS = 2;
export const CAT_DAILY_WIN_LIMIT = 4;
export const CAT_CASTLE_HP = 100;

export function sanitizeCatFriends(ids, myId) {
    const mine = String(myId || '');
    const seen = new Set();
    const out = [];
    (Array.isArray(ids) ? ids : []).forEach((id) => {
        const k = String(id || '');
        if (!k || k === mine || k === 'gm' || k === 'gm_a' || k === 'guest') return;
        if (seen.has(k)) return;
        seen.add(k);
        out.push(k);
    });
    return out.slice(0, CAT_MAX_FRIENDS);
}

export function sanitizeCatBattle(raw, myId) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        cleared: Math.max(0, Math.min(CAT_STAGE_COUNT, Math.floor(Number(src.cleared) || 0))),
        friends: sanitizeCatFriends(src.friends, myId),
        dailyDate: String(src.dailyDate || ''),
        dailyWins: Math.max(0, Math.floor(Number(src.dailyWins) || 0)),
    };
}

export function catDailyWins(state, today) {
    const row = state && typeof state === 'object' ? state : {};
    if (String(row.dailyDate || '') !== String(today || '')) return 0;
    return Math.max(0, Math.floor(Number(row.dailyWins) || 0));
}

export function stageRewards(stage) {
    const n = Math.max(1, Math.min(CAT_STAGE_COUNT, Math.floor(Number(stage) || 1)));
    return {
        xp: 2 + Math.floor((n - 1) / 4),
        bong: n % 5 === 0 ? 1 : 0,
    };
}

export function unitAtk(level, isSelf) {
    const lv = Math.max(1, Math.min(100, Math.floor(Number(level) || 1)));
    if (isSelf) return 9 + Math.floor(lv / 8);
    return 5 + Math.floor(lv / 10);
}

export function enemyStats(stage, friendCount) {
    const n = Math.max(1, Math.min(CAT_STAGE_COUNT, Math.floor(Number(stage) || 1)));
    const f = Math.max(0, Math.min(CAT_MAX_FRIENDS, Math.floor(Number(friendCount) || 0)));
    const hp = Math.round((48 + n * 20) * (1 + 0.22 * f));
    const dps = (6 + n * 1.35) * (1 + 0.14 * f);
    return { hp, dps, friendCount: f };
}

export function canStartCatStage(state, stage, today) {
    const st = sanitizeCatBattle(state);
    const n = Math.floor(Number(stage) || 0);
    if (n < 1 || n > CAT_STAGE_COUNT) return { ok: false, reason: 'stage' };
    if (n > st.cleared + 1) return { ok: false, reason: 'locked' };
    if (catDailyWins(st, today) >= CAT_DAILY_WIN_LIMIT) return { ok: false, reason: 'daily' };
    return { ok: true };
}

export function simulateCatBattle({ stage, selfLevel, friendLevels } = {}) {
    const n = Math.max(1, Math.min(CAT_STAGE_COUNT, Math.floor(Number(stage) || 1)));
    const friends = (Array.isArray(friendLevels) ? friendLevels : []).slice(0, CAT_MAX_FRIENDS);
    const playerDps = unitAtk(selfLevel, true) + friends.reduce((s, lv) => s + unitAtk(lv, false), 0);
    const enemy = enemyStats(n, friends.length);
    let eHp = enemy.hp;
    let pHp = CAT_CASTLE_HP;
    let ticks = 0;
    const maxTicks = 36;
    while (ticks < maxTicks && eHp > 0 && pHp > 0) {
        ticks += 1;
        const ramp = Math.min(1, ticks / 3);
        eHp -= playerDps * ramp;
        pHp -= enemy.dps * ramp;
    }
    const win = eHp <= 0 && pHp > 0;
    return {
        win,
        ticks,
        playerDps,
        playerHp: Math.max(0, pHp),
        enemyHp: enemy.hp,
        enemyHpLeft: Math.max(0, eHp),
        enemyDps: enemy.dps,
        friendCount: friends.length,
    };
}

export function applyCatWin(state, stage, today) {
    const st = sanitizeCatBattle(state);
    const n = Math.max(1, Math.min(CAT_STAGE_COUNT, Math.floor(Number(stage) || 1)));
    const wins = catDailyWins(st, today);
    const pay = stageRewards(n);
    return {
        ...st,
        cleared: Math.max(st.cleared, n),
        dailyDate: String(today || ''),
        dailyWins: wins + 1,
        reward: pay,
    };
}
