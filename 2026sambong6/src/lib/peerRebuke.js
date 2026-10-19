/**
 * 광장 역따봉.
 * 보내는 사람은 5봉을 내지만, 그 봉은 보낸 순간에 빼지 않습니다.
 * 다음 날 처음 저장할 때 건마다 정산해서, 받는 문서와 같은 시각에 보낸 사람 문서가 바뀌지 않게 합니다.
 * 이유는 받는 사람과 선생님 화면에서만 보이고, 받은 횟수는 시즌 동안 쌓입니다.
 * 10·20·30… 번째에 10봉을 한 번씩 깎습니다. 바닥은 -2000봉입니다.
 * 하루에는 한 사람이 3번까지 보낼 수 있고, 한 친구가 3번까지 받을 수 있습니다.
 * 공개 이벤트에는 보낸 사람 번호가 없습니다. 보낸 사람 번호와 로그인 uid는 감사 문서에만 둡니다.
 * 기본은 꺼져 있고, 선생님이 켜야 보낼 수 있습니다.
 */

export const REBUKE_COST = 5;
export const REBUKE_THRESHOLD = 10;
export const REBUKE_THRESHOLD_BONG = 10;
export const REBUKE_FLOOR = -2000;
export const REBUKE_SEND_CAP = 3;
export const REBUKE_RECEIVE_CAP = 3;
export const REBUKE_REASON_MIN = 2;
export const REBUKE_REASON_MAX = 80;

const HURT_WORDS = [
    '바보', '멍청', '병신', '지랄', '시발', '씨발', '개새끼', '좆', '존나',
    '개새기', '돼지', '찐따', '죽어', '꺼져',
    'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅈㄹ', 'ㅄ',
];
const STAFF_IDS = new Set(['gm', 'gm_a']);
const NAME_ROLE = /^(손님|마스터|게스트|관리자|선생님)/;

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const CONS = {
    q: 7, w: 12, e: 3, r: 0, t: 9, a: 6, s: 2, d: 11, f: 5, g: 18, z: 15, x: 16, c: 14, v: 17,
    Q: 8, W: 13, E: 4, R: 1, T: 10,
};
const VOW = {
    k: 0, o: 1, i: 2, O: 3, j: 4, p: 5, u: 6, P: 7, h: 8, y: 12, n: 13, b: 17, m: 18, l: 20,
};
const JONG_OF = { 0: 1, 1: 2, 2: 4, 3: 7, 5: 8, 6: 16, 7: 17, 9: 19, 10: 20, 11: 21, 12: 22, 14: 23, 15: 24, 16: 25, 17: 26, 18: 27 };
const COMPOUND_JUNG = { '8,0': 9, '8,1': 10, '8,20': 11, '13,4': 14, '13,5': 15, '13,20': 16, '18,20': 19 };
const COMPOUND_JONG = { '1,9': 3, '4,12': 5, '4,18': 6, '8,0': 9, '8,6': 10, '8,7': 11, '8,9': 12, '8,16': 13, '8,17': 14, '8,18': 15, '17,9': 18 };
const SPLIT_JONG = {
    3: { keep: 1, next: 9 },
    5: { keep: 4, next: 12 },
    6: { keep: 4, next: 18 },
    9: { keep: 8, next: 0 },
    10: { keep: 8, next: 6 },
    11: { keep: 8, next: 7 },
    12: { keep: 8, next: 9 },
    13: { keep: 8, next: 16 },
    14: { keep: 8, next: 17 },
    15: { keep: 8, next: 18 },
    18: { keep: 17, next: 9 },
};
const JONG_TO_CHO = { 1: 0, 2: 1, 4: 2, 7: 3, 8: 5, 16: 6, 17: 7, 19: 9, 20: 10, 21: 11, 22: 12, 23: 14, 24: 15, 25: 16, 26: 17, 27: 18 };

export function rebukeTodayYmd(nowMs = Date.now()) {
    const kst = new Date(Number(nowMs) + 9 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

export function defaultRebukeConfig() {
    return { enabled: false, epoch: 1, roster: {} };
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

export function isRebukeStaffId(id) {
    return STAFF_IDS.has(String(id || ''));
}

/** 두벌식 영타를 한글로 바꿉니다. qkqh → 바보, tlqkf → 시발. */
export function composeEnglishHangul(raw) {
    let out = '';
    let cho = -1;
    let jung = -1;
    let jong = 0;
    const syllable = () => {
        if (cho < 0) return '';
        if (jung < 0) return CHO[cho];
        return String.fromCharCode(0xac00 + ((cho * 21 + jung) * 28) + jong);
    };
    const commit = () => {
        if (cho >= 0) out += syllable();
        cho = -1;
        jung = -1;
        jong = 0;
    };
    for (const ch of String(raw || '')) {
        const isCons = Object.prototype.hasOwnProperty.call(CONS, ch);
        const isVow = Object.prototype.hasOwnProperty.call(VOW, ch);
        if (!isCons && !isVow) {
            commit();
            out += ch;
            continue;
        }
        if (isVow) {
            const v = VOW[ch];
            if (cho < 0) {
                out += JUNG[v];
                continue;
            }
            if (jung < 0) {
                jung = v;
                continue;
            }
            if (jong === 0) {
                const combo = COMPOUND_JUNG[`${jung},${v}`];
                if (combo != null) {
                    jung = combo;
                    continue;
                }
                commit();
                out += JUNG[v];
                continue;
            }
            const split = SPLIT_JONG[jong] || { keep: 0, next: JONG_TO_CHO[jong] };
            jong = split.keep;
            out += syllable();
            cho = split.next;
            jung = v;
            jong = 0;
            continue;
        }
        const c = CONS[ch];
        if (cho < 0 || jung < 0) {
            commit();
            cho = c;
            continue;
        }
        if (jong === 0) {
            const asJong = JONG_OF[c];
            if (asJong) {
                jong = asJong;
                continue;
            }
            commit();
            cho = c;
            continue;
        }
        const combo = COMPOUND_JONG[`${jong},${c}`];
        if (combo) {
            jong = combo;
            continue;
        }
        commit();
        cho = c;
    }
    commit();
    return out;
}

/** 글자 비교용. 사이 공백·기호·숫자·자모는 빼서 "바 보", "바.보", "바1보"를 같은 말로 봅니다. */
export function foldRebukeWords(raw) {
    return String(raw || '').toLowerCase().replace(/[^\uac00-\ud7a3a-z]/g, '');
}

/** 화면이 저장하는 정규화 본문. 영타를 한글로 바꾼 뒤 공백·기호를 뺍니다. */
export function rebukeReasonFold(raw) {
    const composed = composeEnglishHangul(String(raw || '')).replace(/\u3144/g, 'ㅂㅅ');
    return composed.toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]/g, '');
}

export function rebukeNameNeedles(hiddenNames) {
    const out = [];
    const seen = new Set();
    const push = (needle) => {
        if (needle.length >= 2 && !seen.has(needle) && !NAME_ROLE.test(needle)) {
            seen.add(needle);
            out.push(needle);
        }
    };
    (Array.isArray(hiddenNames) ? hiddenNames : []).forEach((name) => {
        const folded = foldRebukeWords(name);
        if (!folded || NAME_ROLE.test(folded)) return;
        push(folded);
        if (folded.length >= 3) push(folded.slice(1));
    });
    return out;
}

export function rebukeReasonIssue(reason, hiddenNames) {
    const text = String(reason || '').trim();
    if (!text) return 'short';
    if (text.length > REBUKE_REASON_MAX) return 'long';
    const latin = text.toLowerCase().replace(/[^a-z]/g, '');
    if (latin.includes('qkqh') || latin.includes('tlqkf')) return 'hurt';
    const fold = rebukeReasonFold(text);
    const hangul = fold.replace(/[^가-힣]/g, '');
    if (HURT_WORDS.some((word) => fold.includes(word) || hangul.includes(word))) return 'hurt';
    if (!/[0-9A-Za-z가-힣]/.test(text)) return 'symbol';
    if (text.length < REBUKE_REASON_MIN) return 'short';
    const needles = rebukeNameNeedles(hiddenNames);
    if (needles.some((name) => hangul.includes(name) || fold.includes(name))) return 'name';
    return '';
}

export function rebukeFailMessage(reason) {
    if (reason === 'short') return '이유는 2글자 이상 적어 주세요.';
    if (reason === 'long') return '이유는 80글자까지 적을 수 있어요.';
    if (reason === 'symbol') return '글자나 숫자로 2글자 이상 적어요(ㅋㅋ, ㅠㅠ는 안 돼요).';
    if (reason === 'hurt') return '친구가 상처받을 수 있는 말이 들어 있어요. 고운 말로 행동을 적어 주세요.';
    if (reason === 'name') return '이름 대신, 어떤 행동이었는지 적어 주세요.';
    if (reason === 'self') return '나에게는 역따봉을 보낼 수 없어요.';
    if (reason === 'staff') return '선생님에게는 역따봉을 보내거나, 선생님 이름으로 보낼 수 없어요.';
    if (reason === 'balance') return '보낼 봉이 모자랍니다. 아직 정산 전인 역따봉까지 5봉씩 있어야 해요.';
    if (reason === 'credit') return '신용불량 도장이 있으면 역따봉을 보낼 수 없어요.';
    if (reason === 'loan') return '대출 연체 도장이 있으면 역따봉을 보낼 수 없어요.';
    if (reason === 'off') return '지금은 역따봉을 보낼 수 없어요.';
    if (reason === 'receive') return '이 친구는 오늘 역따봉을 3번 받아서, 오늘은 더 보낼 수 없어요.';
    if (reason === 'send') return '역따봉은 하루에 3번까지 보낼 수 있어요.';
    if (reason === 'pair') return '오늘은 이미 이 친구에게 역따봉을 보냈어요.';
    if (reason === 'who') return '보낼 친구를 찾지 못했어요.';
    return '역따봉을 보내지 못했어요. 오늘은 이미 보냈거나, 보낼 수 있는 횟수를 다 썼을 수 있어요.';
}

export function roundRebukeBong(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 1000) / 1000;
}

export function rebukePenaltyTook(seq, bongBefore) {
    const n = Math.floor(Number(seq) || 0);
    const bong = Number(bongBefore);
    if (!Number.isFinite(bong) || n <= 0 || n % REBUKE_THRESHOLD !== 0) return 0;
    if (bong - REBUKE_THRESHOLD_BONG >= REBUKE_FLOOR) return REBUKE_THRESHOLD_BONG;
    const took = roundRebukeBong(bong - REBUKE_FLOOR);
    return took > 0 ? took : 0;
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
        took: roundRebukeBong(src.took),
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
 * 보낸 사람 봉은 이 배치에서 바꾸지 않습니다. charge는 다음 날 정산할 5봉입니다.
 * sentN은 1·2·3 중 비어 있는 칸을 호출하는 쪽이 골라 넣습니다.
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
    if (isRebukeStaffId(from) || isRebukeStaffId(to)) return { ok: false, reason: 'staff' };
    if (from === to) return { ok: false, reason: 'self' };
    const cfg = config && typeof config === 'object' ? config : defaultRebukeConfig();
    if (cfg.enabled !== true) return { ok: false, reason: 'off' };
    if (creditDefault) return { ok: false, reason: 'credit' };
    const issue = rebukeReasonIssue(reason, hiddenNames);
    if (issue) return { ok: false, reason: issue };
    const wallet = roundRebukeBong(senderBong);
    const slot = Math.floor(Number(sentN) || 0);
    if (slot < 1 || slot > REBUKE_SEND_CAP) return { ok: false, reason: 'send' };
    if (wallet < REBUKE_COST * slot) return { ok: false, reason: 'balance' };
    const epoch = Math.max(1, Math.floor(Number(cfg.epoch) || 1));
    const rosterEpoch = rebukeRosterEpoch(cfg, to);
    const todayCount = Math.max(0, Math.floor(Number(receivedToday) || 0));
    if (todayCount >= REBUKE_RECEIVE_CAP) return { ok: false, reason: 'receive' };
    const recvN = todayCount + 1;
    const storedEpoch = Math.floor(Number(receiverEpoch) || 0);
    const storedRoster = Math.floor(Number(receiverRoster) || 0);
    const hasEra = storedEpoch >= 1 && storedRoster >= 1;
    const sameEra = hasEra && storedEpoch === epoch && storedRoster === rosterEpoch;
    const prev = sameEra ? Math.max(0, Math.floor(Number(receiverSeq) || 0)) : 0;
    const seq = prev + 1;
    const before = roundRebukeBong(receiverBong);
    const took = rebukePenaltyTook(seq, before);
    const after = roundRebukeBong(before - took);
    const text = String(reason || '').trim();
    const reasonFold = rebukeReasonFold(text);
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
            reasonFold,
            hidden: false,
            took,
            sentN: slot,
            recvN,
            bongBefore: before,
            bongAfter: after,
        },
        audit: {
            toId: to,
            fromId: from,
            ymd: day,
            reason: text,
            reasonFold,
            bongBefore: wallet,
        },
        charge: {
            fromId: from,
            toId: to,
            ymd: day,
            amount: REBUKE_COST,
            epoch,
        },
        daily: {
            pairId: rebukePairId(epoch, day, from, to),
            sentId: rebukeSentId(epoch, day, from, slot),
            recvId: rebukeRecvId(epoch, day, to, recvN),
        },
        senderBong: wallet,
        receiverBong: after,
        seq,
        took,
    };
}
