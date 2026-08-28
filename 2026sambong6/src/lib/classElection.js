/**
 * 학급 임원선거 — 후보 번호 판정·집계·순위 (순수 함수)
 * 화면 연출은 sambongWorld.js에서 이 결과를 사용합니다.
 */

export const ELECTION_PHASES = ['setup', 'vote', 'count', 'result'];
export const NUMERIC_VOTE_TIMEOUT_MS = 700;
export const MAX_CANDIDATES_PER_POSITION = 20;
export const MAX_POSITIONS = 8;
export const MAX_NAME_LEN = 20;

function padId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
}

export function defaultElectionPositions() {
    return [
        { id: 'pos_chair', name: '학급회장', candidates: [] },
        { id: 'pos_vice', name: '부회장', candidates: [] },
    ];
}

export function createElectionState(opts = {}) {
    const positions = Array.isArray(opts.positions) && opts.positions.length
        ? opts.positions
        : defaultElectionPositions();
    return sanitizeElectionState({
        title: opts.title || '학급 임원 선거',
        positions,
        currentPositionIndex: 0,
        phase: 'setup',
        ballots: {},
        expectedVoters: Math.max(0, Math.floor(Number(opts.expectedVoters) || 0)),
        createdAt: Date.now(),
    });
}

export function sanitizeCandidate(raw, index) {
    const name = cleanName(raw && raw.name);
    const number = Math.max(1, Math.floor(Number(raw && raw.number) || (index + 1)));
    const id = String((raw && raw.id) || `cand_${number}`);
    if (!name) return null;
    return { id, name, number };
}

export function sanitizePosition(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const name = cleanName(raw.name) || `직책 ${index + 1}`;
    const id = String(raw.id || `pos_${index + 1}`);
    const seenNumbers = new Set();
    const candidates = [];
    (Array.isArray(raw.candidates) ? raw.candidates : []).forEach((c, i) => {
        const cand = sanitizeCandidate(c, i);
        if (!cand) return;
        if (seenNumbers.has(cand.number)) return;
        seenNumbers.add(cand.number);
        candidates.push(cand);
        if (candidates.length >= MAX_CANDIDATES_PER_POSITION) return;
    });
    candidates.sort((a, b) => a.number - b.number);
    return { id, name, candidates };
}

export function sanitizeElectionState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const positions = [];
    (Array.isArray(src.positions) ? src.positions : defaultElectionPositions()).forEach((p, i) => {
        const pos = sanitizePosition(p, i);
        if (pos) positions.push(pos);
        if (positions.length >= MAX_POSITIONS) return;
    });
    if (!positions.length) positions.push(...defaultElectionPositions());
    const ballots = {};
    positions.forEach((p) => {
        const nums = new Set(p.candidates.map((c) => c.number));
        const list = Array.isArray(src.ballots && src.ballots[p.id]) ? src.ballots[p.id] : [];
        ballots[p.id] = list
            .map((n) => Math.floor(Number(n)))
            .filter((n) => nums.has(n));
    });
    const phase = ELECTION_PHASES.includes(src.phase) ? src.phase : 'setup';
    const currentPositionIndex = Math.max(
        0,
        Math.min(positions.length - 1, Math.floor(Number(src.currentPositionIndex) || 0))
    );
    return {
        title: cleanName(src.title) || '학급 임원 선거',
        positions,
        currentPositionIndex,
        phase,
        ballots,
        expectedVoters: Math.max(0, Math.min(200, Math.floor(Number(src.expectedVoters) || 0))),
        createdAt: Number(src.createdAt) || Date.now(),
    };
}

export function renumberCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : []).map((c, i) => ({
        ...c,
        number: i + 1,
    }));
}

export function addCandidateToPosition(position, name) {
    const n = cleanName(name);
    if (!n || !position) return { ok: false, reason: 'empty' };
    const list = Array.isArray(position.candidates) ? position.candidates.slice() : [];
    if (list.length >= MAX_CANDIDATES_PER_POSITION) return { ok: false, reason: 'full' };
    if (list.some((c) => c.name === n)) return { ok: false, reason: 'duplicate' };
    list.push({
        id: padId('cand'),
        name: n,
        number: list.length + 1,
    });
    return { ok: true, position: { ...position, candidates: renumberCandidates(list) } };
}

export function removeCandidateFromPosition(position, candidateId) {
    if (!position) return position;
    const list = (position.candidates || []).filter((c) => String(c.id) !== String(candidateId));
    return { ...position, candidates: renumberCandidates(list) };
}

export function getPosition(state, index = state && state.currentPositionIndex) {
    if (!state || !Array.isArray(state.positions)) return null;
    return state.positions[index] || null;
}

export function candidateNumbers(position) {
    return (position && Array.isArray(position.candidates) ? position.candidates : []).map((c) => c.number);
}

/**
 * 숫자 키 입력 중간값 판정.
 * unique: 이 숫자로 확정해도 더 긴 번호가 없음 → 즉시 투표
 * pending: 이 숫자로 시작하는 다른 번호가 있어 대기
 * invalid: 어떤 후보 번호와도 접두가 안 맞음
 */
export function resolveNumericVote(digits, numbers) {
    const raw = String(digits || '').replace(/\D/g, '');
    if (!raw) return { status: 'empty' };
    const nums = (Array.isArray(numbers) ? numbers : []).map(Number).filter((n) => n > 0);
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return { status: 'invalid' };
    const exact = nums.includes(n);
    const longerPrefix = nums.some((x) => x !== n && String(x).startsWith(raw));
    const anyPrefix = nums.some((x) => String(x).startsWith(raw));
    if (!anyPrefix) return { status: 'invalid' };
    if (exact && !longerPrefix) return { status: 'cast', number: n };
    return { status: 'pending', number: exact ? n : null, digits: raw };
}

/** 입력 멈춤 후: 지금까지의 숫자가 유효 번호면 투표, 아니면 무효 */
export function resolveNumericVoteOnTimeout(digits, numbers) {
    const raw = String(digits || '').replace(/\D/g, '');
    if (!raw) return { status: 'empty' };
    const nums = (Array.isArray(numbers) ? numbers : []).map(Number).filter((n) => n > 0);
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return { status: 'invalid' };
    if (nums.includes(n)) return { status: 'cast', number: n };
    return { status: 'invalid' };
}

export function appendBallot(state, positionId, number) {
    const next = sanitizeElectionState(state);
    const pos = next.positions.find((p) => p.id === positionId);
    if (!pos) return next;
    const nums = new Set(candidateNumbers(pos));
    const n = Math.floor(Number(number));
    if (!nums.has(n)) return next;
    next.ballots[positionId] = [...(next.ballots[positionId] || []), n];
    return next;
}

export function undoLastBallot(state, positionId) {
    const next = sanitizeElectionState(state);
    const list = [...(next.ballots[positionId] || [])];
    list.pop();
    next.ballots[positionId] = list;
    return next;
}

export function shuffleCopy(list, rng = Math.random) {
    const arr = Array.isArray(list) ? list.slice() : [];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

export function tallyBallots(ballots, candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const counts = {};
    list.forEach((c) => {
        counts[c.number] = 0;
    });
    let valid = 0;
    (Array.isArray(ballots) ? ballots : []).forEach((n) => {
        const num = Math.floor(Number(n));
        if (counts[num] == null) return;
        counts[num] += 1;
        valid += 1;
    });
    const ranked = list
        .map((c) => ({ ...c, votes: counts[c.number] || 0 }))
        .sort((a, b) => b.votes - a.votes || a.number - b.number);
    const top = ranked.length ? ranked[0].votes : 0;
    const winners = ranked.filter((c) => c.votes === top && top > 0);
    return {
        ranked,
        winners,
        total: valid,
        isTie: winners.length > 1,
        isEmpty: valid === 0,
    };
}

export function canStartVoting(state) {
    const st = sanitizeElectionState(state);
    if (!st.positions.length) return { ok: false, reason: '직책을 먼저 만들어 주세요.' };
    const empty = st.positions.find((p) => p.candidates.length < 2);
    if (empty) {
        return { ok: false, reason: `[${empty.name}] 후보를 2명 이상 등록해 주세요.` };
    }
    return { ok: true };
}

export function ballotCount(state, positionId) {
    const list = state && state.ballots && state.ballots[positionId];
    return Array.isArray(list) ? list.length : 0;
}
