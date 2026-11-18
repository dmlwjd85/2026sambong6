/**
 * 이심전심: 말 없이 작은 수부터 내는 협동 카드 게임(순수 모듈, DOM·Firestore 없음).
 * 시중 보드게임 「더 마인드」와 같은 규칙이에요.
 *
 * 규칙
 * - 2~6명이 한 팀이에요. 1~100 카드 100장을 섞어, 레벨 N에서는 한 사람에게 N장씩 나눠 줘요.
 * - 차례가 없어요. 말이나 신호 없이, 모두의 카드가 작은 수부터 차례로 나오게 한 장씩 내요.
 *   자기 손에서는 가장 작은 카드부터 내요.
 * - 누가 낸 카드보다 작은 카드를 다른 사람이 들고 있었다면 실수예요. 생명을 하나 잃고,
 *   낸 카드보다 작은 카드는 모두 옆으로 치운 뒤 그 레벨을 이어 가요.
 * - 모두의 손이 비면 레벨 통과. 마지막 레벨까지 통과하면 승리, 생명이 0이 되면 실패예요.
 * - 레벨 수: 사람 수와 상관없이 12레벨까지예요(6명이어도 12장씩 72장이라 카드 100장으로 충분해요). 시작 생명은 사람 수만큼, 수리검은 1개.
 * - 보상(그 레벨을 통과하면): 2·5·8레벨 수리검 +1, 3·6·9레벨 생명 +1. 생명은 5개, 수리검은 3개까지.
 * - 수리검: 누가 쓰자고 하고 모두 동의하면, 각자 가장 작은 카드 한 장을 보이게 버려요.
 * - 레벨을 시작할 때는 카드를 보고 모두 「준비」를 눌러 마음을 모은 뒤 시작해요.
 *
 * 손패(hands)는 방 문서에 함께 들어 있고, 화면은 자기 손패만 보여 줘요.
 */

export const MIND_MIN_PLAYERS = 2;
export const MIND_MAX_PLAYERS = 6;
export const MIND_MAX_CARD = 100;
/** 생명은 사람 수만큼 시작하니 6명일 때도 담기게 6개까지예요. */
export const MIND_MAX_LIVES = 6;
export const MIND_MAX_STARS = 3;
/** 사람 수별 마지막 레벨 */
export const MIND_LEVELS = Object.freeze({ 2: 12, 3: 12, 4: 12, 5: 12, 6: 12 });
/** 그 레벨을 통과하면 받는 보상 */
export const MIND_REWARDS = Object.freeze({ 2: 'star', 3: 'life', 5: 'star', 6: 'life', 8: 'star', 9: 'life' });
export const MIND_PHASES = Object.freeze(['wait', 'focus', 'play', 'won', 'lost', 'left']);

const int = (v, lo = 0, hi = 1e15) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};
const cleanId = (v) => String(v ?? '').trim().slice(0, 20);
const card = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 && n <= MIND_MAX_CARD ? n : 0;
};

export function mindMaxLevel(playerCount) {
    return MIND_LEVELS[int(playerCount, MIND_MIN_PLAYERS, MIND_MAX_PLAYERS)];
}

export function emptyMindGame({ now = 0 } = {}) {
    const t = int(now);
    return {
        mode: 'mind',
        gid: t,
        players: [],
        level: 0,
        maxLevel: 0,
        lives: 0,
        stars: 0,
        phase: 'wait',
        hands: {},
        pile: [],
        ready: [],
        starVotes: [],
        event: null,
        seq: 0,
        leftBy: '',
        startedAt: t,
        endedAt: 0,
        turnStartedAt: t, // 공통 방 코드가 쓰는 칸(타이머는 쓰지 않아요)
    };
}

function sanitizeEvent(raw, players) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const type = ['play', 'miss', 'star', 'level', 'start'].includes(raw.type) ? raw.type : '';
    if (!type) return null;
    const by = players.includes(cleanId(raw.by)) ? cleanId(raw.by) : '';
    const cards = (Array.isArray(raw.cards) ? raw.cards : [])
        .map((x) => ({ c: card(x && x.c), by: cleanId(x && x.by) }))
        .filter((x) => x.c && players.includes(x.by))
        .slice(0, 60);
    return {
        type,
        by,
        c: card(raw.c),
        cards,
        level: int(raw.level, 0, 12),
        reward: raw.reward === 'life' || raw.reward === 'star' ? raw.reward : '',
        // 레벨 통과(level)일 때, 그 레벨을 끝낸 마지막 일이 무엇이었는지
        prev: ['play', 'miss', 'star'].includes(raw.prev) ? raw.prev : '',
    };
}

export function sanitizeMindGame(raw, { now = 0 } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.mode !== 'mind') return emptyMindGame({ now });
    const players = [];
    (Array.isArray(raw.players) ? raw.players : []).forEach((p) => {
        const id = cleanId(p);
        if (id && !players.includes(id) && players.length < MIND_MAX_PLAYERS) players.push(id);
    });
    const phase = MIND_PHASES.includes(raw.phase) ? raw.phase : 'wait';
    if (players.length < MIND_MIN_PLAYERS || phase === 'wait') return { ...emptyMindGame({ now }), gid: int(raw.gid) || int(now) };
    const seen = new Set();
    const hands = {};
    const src = raw.hands && typeof raw.hands === 'object' && !Array.isArray(raw.hands) ? raw.hands : {};
    players.forEach((id) => {
        const list = [];
        (Array.isArray(src[id]) ? src[id] : []).forEach((v) => {
            const c = card(v);
            if (c && !seen.has(c)) { seen.add(c); list.push(c); }
        });
        hands[id] = list.sort((a, b) => a - b).slice(0, 12);
    });
    const only = (list) => {
        const out = [];
        (Array.isArray(list) ? list : []).forEach((p) => {
            const id = cleanId(p);
            if (players.includes(id) && !out.includes(id)) out.push(id);
        });
        return out;
    };
    const maxLevel = mindMaxLevel(players.length);
    const startedAt = int(raw.startedAt) || int(now);
    return {
        mode: 'mind',
        gid: int(raw.gid) || startedAt,
        players,
        level: int(raw.level, 1, maxLevel),
        maxLevel,
        lives: int(raw.lives, 0, MIND_MAX_LIVES),
        stars: int(raw.stars, 0, MIND_MAX_STARS),
        phase,
        hands,
        pile: (Array.isArray(raw.pile) ? raw.pile : [])
            .map((x) => ({ c: card(x && x.c), by: cleanId(x && x.by) }))
            .filter((x) => x.c && players.includes(x.by))
            .slice(-60),
        ready: only(raw.ready),
        starVotes: only(raw.starVotes),
        event: sanitizeEvent(raw.event, players),
        seq: int(raw.seq, 0, 1e9),
        leftBy: players.includes(cleanId(raw.leftBy)) ? cleanId(raw.leftBy) : '',
        startedAt,
        endedAt: int(raw.endedAt),
        turnStartedAt: int(raw.turnStartedAt) || startedAt,
    };
}

export function mindGameToDoc(game) {
    const g = sanitizeMindGame(game);
    return { ...g, hands: Object.fromEntries(Object.entries(g.hands).map(([k, v]) => [k, v.slice()])), pile: g.pile.map((x) => ({ ...x })) };
}

export function isMindOver(game) {
    const g = game && game.mode === 'mind' ? game : sanitizeMindGame(game);
    return g.phase === 'won' || g.phase === 'lost' || g.phase === 'left';
}

/** 1~100을 섞어 한 사람에게 level장씩 나눠요. */
export function dealMindHands(players, level, rnd = Math.random) {
    const deck = Array.from({ length: MIND_MAX_CARD }, (_, i) => i + 1);
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const hands = {};
    players.forEach((id, k) => {
        hands[id] = deck.slice(k * level, (k + 1) * level).sort((a, b) => a - b);
    });
    return hands;
}

/** 방이 시작될 때: 참가자 순서대로 1레벨을 나눠 주고 '마음 모으기'부터 해요. */
export function startMindGame({ players, now = 0, rnd = Math.random } = {}) {
    const ids = [];
    (Array.isArray(players) ? players : []).forEach((p) => {
        const id = cleanId(p);
        if (id && !ids.includes(id) && ids.length < MIND_MAX_PLAYERS) ids.push(id);
    });
    if (ids.length < MIND_MIN_PLAYERS) return emptyMindGame({ now });
    const t = int(now);
    return {
        ...emptyMindGame({ now: t }),
        players: ids,
        level: 1,
        maxLevel: mindMaxLevel(ids.length),
        lives: ids.length,
        stars: 1,
        phase: 'focus',
        hands: dealMindHands(ids, 1, rnd),
        event: { type: 'start', by: '', c: 0, cards: [], level: 1, reward: '', prev: '' },
        seq: 1,
    };
}

const fail = (game, error) => ({ ok: false, error, game });
const handsEmpty = (g) => g.players.every((id) => (g.hands[id] || []).length === 0);

/** 손이 모두 비었으면 레벨을 넘겨요(마지막 레벨이면 승리). */
function afterCards(g, now, rnd) {
    if (g.lives <= 0) return { ...g, phase: 'lost', starVotes: [], endedAt: int(now) };
    if (!handsEmpty(g)) return g;
    if (g.level >= g.maxLevel) return { ...g, phase: 'won', starVotes: [], endedAt: int(now) };
    const reward = MIND_REWARDS[g.level] || '';
    const level = g.level + 1;
    return {
        ...g,
        level,
        lives: reward === 'life' ? Math.min(MIND_MAX_LIVES, g.lives + 1) : g.lives,
        stars: reward === 'star' ? Math.min(MIND_MAX_STARS, g.stars + 1) : g.stars,
        phase: 'focus',
        hands: dealMindHands(g.players, level, rnd),
        pile: [],
        ready: [],
        starVotes: [],
        // 마지막에 낸 카드·실수는 화면이 seq로 한 번 보여 주고, 이어서 레벨 통과를 알려요.
        event: { type: 'level', by: g.event ? g.event.by : '', c: g.event ? g.event.c : 0, cards: g.event ? g.event.cards : [], level: g.level, reward, prev: g.event ? g.event.type : '' },
    };
}

/** 마음 모으기: 모두 준비하면 시작해요. */
export function mindReady(game, { id } = {}) {
    const g = sanitizeMindGame(game);
    const me = cleanId(id);
    if (!g.players.includes(me)) return fail(g, 'not_member');
    if (g.phase !== 'focus') return fail(g, 'not_focus');
    if (g.ready.includes(me)) return { ok: true, error: '', game: g };
    const ready = g.ready.concat(me);
    const all = g.players.every((p) => ready.includes(p));
    return { ok: true, error: '', game: { ...g, ready, phase: all ? 'play' : 'focus', seq: g.seq + 1 } };
}

/** 내 가장 작은 카드를 내요. */
export function mindPlay(game, { id, card: want = 0, now = 0, rnd = Math.random } = {}) {
    const g = sanitizeMindGame(game);
    const me = cleanId(id);
    if (!g.players.includes(me)) return fail(g, 'not_member');
    if (g.phase !== 'play') return fail(g, 'not_play');
    const mine = g.hands[me] || [];
    if (!mine.length) return fail(g, 'no_cards');
    const c = mine[0];
    // 화면이 보던 카드와 다르면(그사이 수리검·실수로 손패가 바뀜) 내지 않아요.
    if (want && card(want) !== c) return fail(g, 'stale');
    const missed = [];
    const hands = {};
    g.players.forEach((p) => {
        const list = p === me ? mine.slice(1) : (g.hands[p] || []);
        hands[p] = list.filter((x) => {
            if (x < c) { missed.push({ c: x, by: p }); return false; }
            return true;
        });
    });
    missed.sort((a, b) => a.c - b.c);
    const miss = missed.length > 0;
    const next = {
        ...g,
        hands,
        pile: g.pile.concat({ c, by: me }).slice(-60),
        lives: miss ? Math.max(0, g.lives - 1) : g.lives,
        starVotes: [],
        event: { type: miss ? 'miss' : 'play', by: me, c, cards: missed, level: g.level, reward: '', prev: '' },
        seq: g.seq + 1,
        turnStartedAt: int(now) || g.turnStartedAt,
    };
    return { ok: true, error: '', game: afterCards(next, now, rnd) };
}

/** 수리검을 쓰자고 하거나(처음), 동의해요. 모두 동의하면 각자 가장 작은 카드를 버려요. */
export function mindVoteStar(game, { id, now = 0, rnd = Math.random } = {}) {
    const g = sanitizeMindGame(game);
    const me = cleanId(id);
    if (!g.players.includes(me)) return fail(g, 'not_member');
    if (g.phase !== 'play') return fail(g, 'not_play');
    if (g.stars <= 0) return fail(g, 'no_star');
    if (g.starVotes.includes(me)) return { ok: true, error: '', game: g };
    const starVotes = g.starVotes.concat(me);
    if (!g.players.every((p) => starVotes.includes(p))) {
        return { ok: true, error: '', game: { ...g, starVotes, seq: g.seq + 1 } };
    }
    const dropped = [];
    const hands = {};
    g.players.forEach((p) => {
        const list = g.hands[p] || [];
        if (list.length) dropped.push({ c: list[0], by: p });
        hands[p] = list.slice(1);
    });
    dropped.sort((a, b) => a.c - b.c);
    const next = {
        ...g,
        hands,
        stars: g.stars - 1,
        starVotes: [],
        event: { type: 'star', by: g.starVotes[0] || me, c: 0, cards: dropped, level: g.level, reward: '', prev: '' },
        seq: g.seq + 1,
    };
    return { ok: true, error: '', game: afterCards(next, now, rnd) };
}

/** 수리검 제안을 거두거나 거절해요(누구든). */
export function mindCancelStar(game, { id } = {}) {
    const g = sanitizeMindGame(game);
    if (!g.players.includes(cleanId(id))) return fail(g, 'not_member');
    if (!g.starVotes.length) return { ok: true, error: '', game: g };
    return { ok: true, error: '', game: { ...g, starVotes: [], seq: g.seq + 1 } };
}

/** 하다가 나가면 팀 도전이 거기서 끝나요. */
export function mindLeave(game, { id, now = 0 } = {}) {
    const g = sanitizeMindGame(game);
    const me = cleanId(id);
    if (!g.players.includes(me)) return fail(g, 'not_member');
    if (isMindOver(g)) return fail(g, 'already_over');
    return { ok: true, error: '', game: { ...g, phase: 'left', leftBy: me, starVotes: [], endedAt: int(now), seq: g.seq + 1 } };
}

/** 결과 한 줄 */
export function mindEndText(game, nameOf = (id) => id) {
    const g = sanitizeMindGame(game);
    if (g.phase === 'won') return `${g.maxLevel}레벨까지 모두 통과했어요! 마음이 통했어요.`;
    if (g.phase === 'lost') return `${g.level}레벨에서 생명을 모두 잃었어요.`;
    if (g.phase === 'left') return `${nameOf(g.leftBy)} 님이 나가서 ${g.level}레벨에서 끝났어요.`;
    return '';
}

/** 같은 판 결과를 한 번만 다루게 하는 키 */
export function mindResultKey(room, game) {
    const g = sanitizeMindGame(game);
    return `mind:${String((room && room.id) || '').slice(0, 40)}:${g.gid}:${g.phase}`;
}

/** 숫자 뒤에 붙는 을/를(읽는 소리의 받침에 맞춰요: 3을, 52를, 100을) */
export function mindObj(n) {
    return `${n}${[0, 1, 3, 6, 7, 8].includes(Math.abs(Number(n)) % 10) ? '을' : '를'}`;
}

/** 이번에 일어난 일을 한 줄로(순수 함수). nameOf(id) → 이름 */
export function mindEventText(game, nameOf = (id) => id) {
    const g = sanitizeMindGame(game);
    const ev = g.event;
    if (!ev) return '';
    const list = (cards) => cards.map((x) => `${nameOf(x.by)} ${x.c}`).join(', ');
    if (ev.type === 'start') return '1레벨을 시작해요. 카드를 보고 준비를 눌러요.';
    const who = (id) => (nameOf(id) === '나' ? '내가' : `${nameOf(id)} 님이`);
    if (ev.type === 'play') return `${who(ev.by)} ${mindObj(ev.c)} 냈어요.`;
    if (ev.type === 'miss') return `앗! ${who(ev.by)} ${mindObj(ev.c)} 냈는데 더 작은 카드가 있었어요(${list(ev.cards)}). 생명 -1`;
    if (ev.type === 'star') return `수리검! 각자 가장 작은 카드를 버렸어요(${list(ev.cards)}).`;
    if (ev.type === 'level') {
        const reward = ev.reward === 'life' ? ' 보상: 생명 +1' : ev.reward === 'star' ? ' 보상: 수리검 +1' : '';
        const miss = ev.prev === 'miss' ? ' (마지막에 실수로 생명 -1)' : '';
        return `${ev.level}레벨 통과!${reward}${miss}`;
    }
    return '';
}

