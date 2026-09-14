/**
 * 드래곤볼 보관함이 빈 배열·캐시 스냅샷에 덮여 사라지지 않게 맞춥니다.
 * Firestore merge는 배열을 통째로 바꾸므로, 저장·화면 반영 전에 항상 합칩니다.
 */

/** 1~7 번호만 남기고 중복을 없앱니다. 숫자/문자 섞여 있어도 숫자로 맞춥니다. */
export function sanitizeDragonBallList(list) {
    const src = Array.isArray(list) ? list : [];
    const seen = new Set();
    const out = [];
    src.forEach((raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const id = Math.floor(n);
        if (id < 1 || id > 7 || seen.has(id)) return;
        seen.add(id);
        out.push(id);
    });
    return out.sort((a, b) => a - b);
}

/** 로컬·서버 보관함을 합칩니다. 한쪽이 비어 있어도 있는 쪽을 지킵니다. */
export function mergeDragonBallCollections(local, server) {
    return sanitizeDragonBallList([
        ...(Array.isArray(local) ? local : []),
        ...(Array.isArray(server) ? server : []),
    ]);
}

/**
 * 학생 저장용 보관함.
 * replace가 true면 로컬을 그대로 씁니다(관리자 초기화).
 * 아니면 서버와 합쳐 성구가 줄지 않게 합니다.
 */
export function resolveDragonBallsForSave(local, server, opts = {}) {
    const next = sanitizeDragonBallList(local);
    if (opts && opts.replace) return next;
    return mergeDragonBallCollections(next, server);
}

/**
 * 스냅샷이 성구를 줄이지 않게 고릅니다.
 * 캐시·다른 기기의 빈 배열이 방금 모은 공을 지우지 않습니다.
 */
export function resolveDragonBallsForSnapshot(local, server) {
    return mergeDragonBallCollections(local, server);
}

/** 주말 키는 있는 쪽을 남깁니다. */
export function resolveDragonBallWeekendKey(localKey, serverKey) {
    const local = String(localKey || '').trim();
    const server = String(serverKey || '').trim();
    return local || server || '';
}

/**
 * 홈 보관함 안내 문구. 설정에서 정한 1개·7개 완성 보상을 그대로 보여 줍니다.
 */
export function formatDragonBallHomeRewardHint(rewards, formatBong) {
    const r = rewards && typeof rewards === 'object' ? rewards : {};
    const xp = (n) => Math.max(0, Math.floor(Number(n) || 0));
    const bong = (n) => Math.max(0, Math.floor(Number(n) || 0));
    const fmtB = typeof formatBong === 'function'
        ? formatBong
        : (n) => `${n}봉`;
    const part = (x, b) => {
        const bits = [];
        if (x > 0) bits.push(`${x} XP`);
        if (b > 0) bits.push(fmtB(b));
        return bits.length ? bits.join(' · ') : '보상 없음';
    };
    return `전 서버 주말 단 7개 스폰! 1개 ${part(xp(r.findXp), bong(r.findBong))} · 다 모으면 ${part(xp(r.completeXp), bong(r.completeBong))}`;
}
