/**
 * OX 무제한 도전 '하루 정산'(선생님 요청, 2026-11-26 하루만).
 * 정한 시각(14:40)에 반 학생 모두의 무제한 도전 최고 기록(best)을 보고 봉을 주거나 빼요.
 *   - 31개 이상: +10봉
 *   - 21~30개: -10봉
 *   - 20개 이하(기록이 없으면 0개): -20봉, 그리고 그 학생 화면에 삐에로·팡파레 팝업
 * 화면과 Firestore는 여기 두지 않고, 언제·누구에게·얼마를 계산만 합니다.
 * 하루 한 번: 잠금 문서(oxChallengePayouts/{YYYY-MM-DD})가 있으면 다시 하지 않아요(화면에서 트랜잭션으로 확인).
 * 이 정산은 진짜 우리 반(시드 학급)에서만 켜져요. 다른 학급에서는 돌지 않아요.
 * 기존 'OX 랭킹 보상'(oxRankReward.js, 평일 14:40 1~5등)과는 따로 돌고, 그 기능은 그대로예요.
 */
import { SEED_MASTER_CLASS_ID } from './classCreateRequest.js';

export const OX_CHECK_EVENT = Object.freeze({
    /** 정산하는 날(한국 날짜). 이날이 아니면 아무것도 하지 않아요. */
    ymd: '2026-11-26',
    hour: 14,
    minute: 40,
    /** 이 학급에서만 켜져요(진짜 우리 반). */
    classIds: Object.freeze([SEED_MASTER_CLASS_ID]),
});

export const OX_CHECK_HIGH_MIN = 31;
export const OX_CHECK_MID_MIN = 21;
export const OX_CHECK_HIGH_BONG = 10;
export const OX_CHECK_MID_BONG = -10;
export const OX_CHECK_LOW_BONG = -20;
/** 학생 문서 규칙: 봉은 -2000 아래로 내려가지 못해요. */
export const OX_CHECK_BONG_FLOOR = -2000;
export const OX_CHECK_REASON = 'OX 무제한 도전 정산';
export const OX_CHECK_SOURCE = 'oxChallengeCheck';
export const OX_CHECK_NOTICE_KIND = 'pierrotFanfare';
export const OX_CHECK_LOCK_COLLECTION = 'oxChallengePayouts';

function kst(ms) {
    const d = new Date(Number(ms) + 9 * 3600 * 1000);
    return { ymd: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** 이 학급에서 켜지는지 */
export function oxCheckEnabledFor(appId, ev = OX_CHECK_EVENT) {
    return !!appId && (ev.classIds || []).includes(String(appId));
}

/** 오늘이 정산하는 날인지(시각은 보지 않아요). 마스터 수동 실행 버튼에 써요. */
export function oxCheckIsEventDay(nowMs, ev = OX_CHECK_EVENT) {
    return kst(nowMs).ymd === ev.ymd;
}

/** 자동으로 정산할 차례면 그날 날짜, 아니면 ''. 시각이 지나면 그날 자정 전까지는 늦게 열어도 해요. */
export function oxCheckDueYmd(nowMs, ev = OX_CHECK_EVENT) {
    const k = kst(nowMs);
    if (k.ymd !== ev.ymd) return '';
    return k.minutes >= ev.hour * 60 + ev.minute ? k.ymd : '';
}

/** 정산 시각(+2초)까지 남은 밀리초. 정산 날이 아니거나 이미 지났으면 -1. */
export function oxCheckDelayMs(nowMs, ev = OX_CHECK_EVENT) {
    const k = kst(nowMs);
    if (k.ymd !== ev.ymd) return -1;
    const msOfDay = (Number(nowMs) + 9 * 3600 * 1000) % 86400000;
    const wait = (ev.hour * 60 + ev.minute) * 60000 - msOfDay;
    return wait > 0 ? wait + 2000 : -1;
}

/** 최고 기록 → 구간과 봉 */
export function oxCheckTier(best) {
    const n = Math.max(0, Math.floor(Number(best) || 0));
    if (n >= OX_CHECK_HIGH_MIN) return { best: n, tier: 'high', delta: OX_CHECK_HIGH_BONG, pierrot: false };
    if (n >= OX_CHECK_MID_MIN) return { best: n, tier: 'mid', delta: OX_CHECK_MID_BONG, pierrot: false };
    return { best: n, tier: 'low', delta: OX_CHECK_LOW_BONG, pierrot: true };
}

/**
 * 누구에게 얼마를. rows: [{ id, best }](무제한 도전 학생별 문서), ids: 반 명단에서 활성 학생 학번.
 * 명단에 있는데 기록이 없는 학생은 0개로 봐요. 명단에 없는 학번(선생님·손님·나간 학생)은 빼요.
 */
export function planOxCheck(rows, ids) {
    const bestOf = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        const id = String((r && r.id) || '');
        if (!id) return;
        const b = Math.max(0, Math.floor(Number(r.best) || 0));
        bestOf.set(id, Math.max(bestOf.get(id) || 0, b));
    });
    const seen = new Set();
    const out = [];
    (Array.isArray(ids) ? ids : []).forEach((raw) => {
        const id = String(raw || '');
        if (!id || id === 'gm' || id === 'gm_a' || id === 'guest' || seen.has(id)) return;
        seen.add(id);
        out.push({ id, ...oxCheckTier(bestOf.get(id) || 0) });
    });
    return out;
}

/** 학생 문서에 적힌 이번 정산(표식 또는 봉 기록). 봉이 안 바뀌었으면 null. */
export function oxCheckStamp(data) {
    const src = data && typeof data === 'object' ? data : {};
    const marked = String(src.oxChallengeChecked || '');
    const markedDelta = Math.floor(Number(src.oxChallengeDelta));
    if (/^\d{4}-\d{2}-\d{2}$/.test(marked) && Number.isFinite(markedDelta) && markedDelta !== 0) {
        return { mark: marked, delta: markedDelta };
    }
    const logs = Array.isArray(src.bongChangeLog) ? src.bongChangeLog : [];
    for (let i = logs.length - 1; i >= 0; i -= 1) {
        const entry = logs[i];
        if (!entry || entry.source !== OX_CHECK_SOURCE) continue;
        const mark = String(entry.date || '');
        const delta = Math.floor(Number(entry.delta));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(mark) || !Number.isFinite(delta) || delta === 0) return null;
        return { mark, delta };
    }
    return null;
}

/** 이 화면 데이터가 그 날짜 정산을 이미 알고 있는지(표식 또는 봉 기록). */
export function clientSawOxCheck(data, mark) {
    const date = String(mark || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const src = data && typeof data === 'object' ? data : {};
    if (String(src.oxChallengeChecked || '') === date) return true;
    const logs = Array.isArray(src.bongChangeLog) ? src.bongChangeLog : [];
    return logs.some((entry) => entry && entry.source === OX_CHECK_SOURCE && String(entry.date || '') === date);
}

/**
 * 정산 직후, 아직 정산을 모르는 화면의 저장이 봉을 옛 잔액으로 되돌리지 않게 해요.
 * 정산은 학생 문서에 절대 봉을 적어요. 그 순간 겹친 저장은 화면이 기억한 더 큰 봉을 그대로 써서
 * 깎인 값(또는 31개 이상 +10봉)이 사라져요. 잠금 문서가 있어 다시 정산하지도 않아요.
 * 이 화면이 표식·봉 기록을 아직 모르면, 서버 봉(정산이 반영된 값)에
 * 이번 저장이 일부러 더하거나 뺀 만큼만 올려요. 이미 아는 저장은 손대지 않아요(null).
 * petDelta 가 있으면 펫 저장과 같이 서버 봉에 그 차이만 더해요.
 */
export function reconcileOxCheckBong({
    server,
    client,
    baseBong,
    requestedBong,
    maxIncrease = 0,
    maxDecrease = 0,
    allowDecrease = false,
    petDelta = null,
} = {}) {
    const stamp = oxCheckStamp(server);
    if (!stamp || clientSawOxCheck(client, stamp.mark)) return null;
    const base = Math.floor(Number(baseBong) || 0);
    if (petDelta != null && Number.isFinite(Number(petDelta))) {
        return { bong: base + Math.floor(Number(petDelta)), mark: stamp.mark };
    }
    const pre = base - stamp.delta;
    const requested = Math.floor(Number(requestedBong) || 0);
    let intent = requested - pre;
    if (intent > 0) {
        const rise = Math.max(0, Math.floor(Number(maxIncrease) || 0));
        intent = rise > 0 ? Math.min(rise, intent) : 0;
    } else if (intent < 0) {
        if (!allowDecrease) intent = 0;
        else {
            const cap = Math.max(0, Math.floor(Number(maxDecrease) || 0));
            intent = -Math.min(cap, -intent);
        }
    }
    return { bong: base + intent, mark: stamp.mark };
}

/** 봉 바꾸기. 규칙 바닥(-2000) 아래로는 내리지 않아요(이미 아래면 그대로). 실제로 바뀐 값을 돌려줘요. */
export function applyOxCheckBong(currentBong, delta) {
    const cur = Math.floor(Number(currentBong) || 0);
    const d = Math.floor(Number(delta) || 0);
    let next = cur + d;
    if (d < 0 && next < OX_CHECK_BONG_FLOOR) next = Math.min(cur, OX_CHECK_BONG_FLOOR);
    return { before: cur, after: next, delta: next - cur };
}

/** 봉 기록 사유(학생이 읽는 말) */
export function oxCheckReasonText(best, delta) {
    const d = Math.floor(Number(delta) || 0);
    return `${OX_CHECK_REASON} ${d >= 0 ? '+' : ''}${d}봉 (최고 기록 ${Math.max(0, Math.floor(Number(best) || 0))}개)`;
}

/** 20개 이하 학생 화면 팝업 문구 */
export function oxCheckPierrotText(best, delta) {
    const n = Math.max(0, Math.floor(Number(best) || 0));
    const lost = Math.abs(Math.floor(Number(delta) || 0));
    const rec = n > 0 ? `무제한 도전 최고 기록이 ${n}개예요.` : '아직 무제한 도전 기록이 없어요.';
    const mid = lost > 0 ? `20개 이하라서 ${lost}봉이 빠졌어요.` : '20개 이하지만 봉이 이미 가장 낮아서 더 빠지지 않았어요.';
    return `${rec}\n${mid}\n다음엔 21개를 넘겨 봐요! 삐에로가 응원해요 🎺`;
}

/** 마스터 화면 요약 한 줄 */
export function oxCheckSummary(results) {
    const list = Array.isArray(results) ? results : [];
    const c = { high: 0, mid: 0, low: 0 };
    list.forEach((r) => { if (r && c[r.tier] !== undefined) c[r.tier] += 1; });
    return `31개 이상 +10봉 ${c.high}명 · 21~30개 -10봉 ${c.mid}명 · 20개 이하 -20봉 ${c.low}명`;
}

/** 안내 문구(마스터 화면) */
export function oxCheckNote(ev = OX_CHECK_EVENT) {
    const [y, m, d] = ev.ymd.split('-').map(Number);
    return `${m}월 ${d}일 ${ev.hour}시 ${ev.minute}분에 무제한 도전 최고 기록으로 한 번 정산해요: 31개 이상 +10봉, 21~30개 -10봉, 20개 이하(기록 없음 포함) -20봉과 삐에로 팝업. (${y}년 하루만)`;
}
