/**
 * 광장 역따봉.
 * 보내는 사람은 5봉을 내고, 이유는 받는 사람에게만 익명으로 보입니다.
 * 받은 횟수는 시즌 동안 쌓이고, 10·20·30… 에 10봉을 한 번씩 깎습니다. 바닥은 -2000봉입니다.
 * 하루에는 한 사람이 3번까지 보낼 수 있고, 한 친구가 3번까지 받을 수 있습니다.
 * 공개 이벤트에는 보낸 사람 번호가 없습니다. 보낸 사람 번호와 로그인 uid는 감사 문서에만 둡니다.
 */

export const REBUKE_COST = 5;
export const REBUKE_THRESHOLD = 10;
export const REBUKE_THRESHOLD_BONG = 10;
export const REBUKE_FLOOR = -2000;
export const REBUKE_SEND_CAP = 3;
export const REBUKE_RECEIVE_CAP = 3;
export const REBUKE_REASON_MIN = 2;
export const REBUKE_REASON_MAX = 80;

const HURT_WORDS = ['바보', '멍청', '병신', '지랄', '시발', '씨발', '개새끼', '좆', '존나'];
const JAMO_HURT = ['ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅈㄹ'];

export function rebukeTodayYmd(nowMs = Date.now()) {
    const kst = new Date(Number(nowMs) + 9 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

export function defaultRebukeConfig() {
    return { enabled: true, epoch: 1, roster: {} };
}

export function rebukeEventId(epoch, rosterEpoch, toId, seq) {
    return `e~${epoch}~${rosterEpoch}~student_${toId}~${seq}`;
}

export function rebukePairId(epoch, ymd, fromId, toId) {
    return `p~${epoch}~${ymd}~${fromId}~${toId}`;
}

export function rebukeSentId(epoch, ymd, fromId, sentN) {
    return `s~${epoch}~${ymd}~${fromId}~${sentN}`;
}

export function rebukeRecvId(epoch, ymd, toId, recvN) {
    return `r~${epoch}~${ymd}~${toId}~${recvN}`;
}

function isSafeId(id) {
    return /^[A-Za-z0-9_-]{1,24}$/.test(String(id || ''));
}

/** 글자 비교용. 사이 공백·기호·숫자·자모는 빼서 "바 보", "바.보", "바1보"를 같은 말로 봅니다. */
export function foldRebukeWords(raw) {
    return String(raw || '').toLowerCase().replace(/[^\uac00-\ud7a3a-z]/g, '');
}

/** 키보드로 친 초성만 모읍니다. */
export function foldRebukeJamo(raw) {
    let out = '';
    const text = String(raw || '');
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code >= 0x3131 && code <= 0x314e) out += ch;
        else if (code >= 0x1100 && code <= 0x1112) out += ch;
    }
    return out;
}

export function rebukeReasonIssue(reason, hiddenNames) {
    const text = String(reason || '').trim();
    if (!text) return 'short';
    if (text.length > REBUKE_REASON_MAX) return 'long';
    const folded = foldRebukeWords(text);
    if (HURT_WORDS.some((word) => folded.includes(word))) return 'hurt';
    const jamo = foldRebukeJamo(text);
    if (JAMO_HURT.some((word) => jamo.includes(word))) return 'hurt';
    if (!/[0-9A-Za-z가-힣]/.test(text)) return 'symbol';
    if (text.length < REBUKE_REASON_MIN) return 'short';
    const names = Array.isArray(hiddenNames) ? hiddenNames : [];
    for (const name of names) {
        const foldedName = foldRebukeWords(name);
        if (foldedName.length >= 2 && folded.includes(foldedName)) return 'name';
    }
    return '';
}

export function rebukeFailMessage(reason) {
    if (reason === 'short') return '이유는 2글자 이상 적어 주세요.';
    if (reason === 'long') return '이유는 80글자까지 적을 수 있어요.';
    if (reason === 'symbol') return '글자나 숫자로 2글자 이상 적어요(ㅋㅋ, ㅠㅠ는 안 돼요).';
    if (reason === 'hurt') return '친구가 상처받을 수 있는 말이 들어 있어요. 고운 말로 행동을 적어 주세요.';
    if (reason === 'name') return '이름 대신, 어떤 행동이었는지 적어 주세요.';
    if (reason === 'self') return '나에게는 역따봉을 보낼 수 없어요.';
    if (reason === 'balance') return '봉이 5개보다 적으면 역따봉을 보낼 수 없어요.';
    if (reason === 'credit') return '신용불량 도장이 있으면 역따봉을 보낼 수 없어요.';
    if (reason === 'off') return '지금은 역따봉을 보낼 수 없어요.';
    if (reason === 'receive') return '이 친구는 오늘 역따봉을 3번 받아서, 오늘은 더 보낼 수 없어요.';
    if (reason === 'send') return '역따봉은 하루에 3번까지 보낼 수 있어요.';
    if (reason === 'pair') return '오늘은 이미 이 친구에게 역따봉을 보냈어요.';
    if (reason === 'who') return '보낼 친구를 찾지 못했어요.';
    return '역따봉을 보내지 못했어요. 오늘은 이미 보냈거나, 보낼 수 있는 횟수를 다 썼을 수 있어요.';
}

export function rebukePenaltyTook(seq, bongBefore) {
    const n = Math.floor(Number(seq) || 0);
    const bong = Math.floor(Number(bongBefore) || 0);
    if (n <= 0 || n % REBUKE_THRESHOLD !== 0) return 0;
    if (bong - REBUKE_THRESHOLD_BONG >= REBUKE_FLOOR) return REBUKE_THRESHOLD_BONG;
    return Math.max(0, bong - REBUKE_FLOOR);
}

export function rebukeRosterEpoch(config, toId) {
    const roster = config && config.roster && typeof config.roster === 'object' ? config.roster : {};
    const value = Math.floor(Number(roster[String(toId)]) || 0);
    return value >= 1 ? value : 1;
}

export function countRebukeReceivedToday(events, toId, ymd, epoch, rosterEpoch) {
    const id = String(toId || '');
    const day = String(ymd || '');
    return (Array.isArray(events) ? events : []).filter((row) => (
        row
        && String(row.toId || '') === id
        && String(row.ymd || '') === day
        && Math.floor(Number(row.epoch) || 0) === Math.floor(Number(epoch) || 0)
        && Math.floor(Number(row.rosterEpoch) || 0) === Math.floor(Number(rosterEpoch) || 0)
    )).length;
}

export function visibleRebukeReasons(events, toId, epoch, rosterEpoch) {
    return (Array.isArray(events) ? events : [])
        .filter((row) => (
            row
            && String(row.toId || '') === String(toId || '')
            && Math.floor(Number(row.epoch) || 0) === Math.floor(Number(epoch) || 0)
            && Math.floor(Number(row.rosterEpoch) || 0) === Math.floor(Number(rosterEpoch) || 0)
            && row.hidden !== true
            && String(row.reason || '').trim()
        ))
        .sort((a, b) => Math.floor(Number(a.seq) || 0) - Math.floor(Number(b.seq) || 0))
        .slice(-30)
        .map((row) => ({
            seq: Math.floor(Number(row.seq) || 0),
            reason: String(row.reason || ''),
            ymd: String(row.ymd || ''),
        }));
}

/** 화면에 올릴 때 보낸 사람 정보가 섞여 있어도 버립니다. */
export function rebukePublicEvent(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        epoch: Math.floor(Number(src.epoch) || 0),
        rosterEpoch: Math.floor(Number(src.rosterEpoch) || 0),
        toId: String(src.toId || ''),
        ymd: String(src.ymd || ''),
        seq: Math.floor(Number(src.seq) || 0),
        reason: src.hidden === true ? '' : String(src.reason || ''),
        hidden: src.hidden === true,
        took: Math.floor(Number(src.took) || 0),
        sentN: Math.floor(Number(src.sentN) || 0),
        recvN: Math.floor(Number(src.recvN) || 0),
    };
}

export function receivedRebukeCount(events, toId, epoch, rosterEpoch) {
    return (Array.isArray(events) ? events : []).filter((row) => (
        row
        && String(row.toId || '') === String(toId || '')
        && Math.floor(Number(row.epoch) || 0) === Math.floor(Number(epoch) || 0)
        && Math.floor(Number(row.rosterEpoch) || 0) === Math.floor(Number(rosterEpoch) || 0)
    )).length;
}

/**
 * 한 번의 역따봉에 쓸 문서 내용.
 * sentN은 1·2·3 중 비어 있는 칸을 호출하는 쪽이 골라 넣습니다. 보낸 횟수는 공개 이벤트에 없습니다.
 */
export function planPeerRebuke({
    config,
    fromId,
    toId,
    reason,
    hiddenNames,
    today,
    senderBong,
    receiverBong,
    receiverSeq,
    receiverEpoch,
    receiverRoster,
    sentN,
    receivedToday,
    creditDefault,
} = {}) {
    const from = String(fromId || '');
    const to = String(toId || '');
    const day = String(today || '');
    if (!isSafeId(from) || !isSafeId(to) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, reason: 'who' };
    if (from === to) return { ok: false, reason: 'self' };
    const cfg = config && typeof config === 'object' ? config : defaultRebukeConfig();
    if (cfg.enabled === false) return { ok: false, reason: 'off' };
    if (creditDefault) return { ok: false, reason: 'credit' };
    const issue = rebukeReasonIssue(reason, hiddenNames);
    if (issue) return { ok: false, reason: issue };
    const wallet = Math.floor(Number(senderBong) || 0);
    if (wallet < REBUKE_COST) return { ok: false, reason: 'balance' };
    const epoch = Math.max(1, Math.floor(Number(cfg.epoch) || 1));
    const rosterEpoch = rebukeRosterEpoch(cfg, to);
    const todayCount = Math.max(0, Math.floor(Number(receivedToday) || 0));
    if (todayCount >= REBUKE_RECEIVE_CAP) return { ok: false, reason: 'receive' };
    const slot = Math.floor(Number(sentN) || 0);
    if (slot < 1 || slot > REBUKE_SEND_CAP) return { ok: false, reason: 'send' };
    const recvN = todayCount + 1;
    const storedEpoch = Math.floor(Number(receiverEpoch) || 0);
    const storedRoster = Math.floor(Number(receiverRoster) || 0);
    const hasEra = storedEpoch >= 1 && storedRoster >= 1;
    const sameEra = hasEra && storedEpoch === epoch && storedRoster === rosterEpoch;
    const prev = sameEra ? Math.max(0, Math.floor(Number(receiverSeq) || 0)) : 0;
    const seq = prev + 1;
    const before = Math.floor(Number(receiverBong) || 0);
    const took = rebukePenaltyTook(seq, before);
    const text = String(reason || '').trim();
    return {
        ok: true,
        eventId: rebukeEventId(epoch, rosterEpoch, to, seq),
        event: {
            epoch,
            rosterEpoch,
            toId: to,
            ymd: day,
            seq,
            reason: text,
            hidden: false,
            took,
            sentN: slot,
            recvN,
            bongBefore: before,
            bongAfter: before - took,
        },
        audit: {
            toId: to,
            fromId: from,
            ymd: day,
            reason: text,
            bongBefore: wallet,
        },
        daily: {
            pairId: rebukePairId(epoch, day, from, to),
            sentId: rebukeSentId(epoch, day, from, slot),
            recvId: rebukeRecvId(epoch, day, to, recvN),
        },
        senderBong: wallet - REBUKE_COST,
        receiverBong: before - took,
        seq,
        took,
    };
}
