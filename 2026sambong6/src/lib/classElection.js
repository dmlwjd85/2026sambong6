/**
 * 학급 투표(의견 수렴·임원선거) — 선택지 번호 판정·집계·순위 (순수 함수)
 * 화면 연출은 sambongWorld.js에서 이 결과를 사용합니다.
 */

export const ELECTION_PHASES = ['setup', 'vote', 'count', 'result'];
export const NUMERIC_VOTE_TIMEOUT_MS = 700;
export const MAX_CANDIDATES_PER_POSITION = 20;
export const MAX_POSITIONS = 10;
export const MAX_NAME_LEN = 40;

function padId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
}

export function emptyElectionPosition(index = 0) {
    return { id: padId('pos'), name: `항목 ${index + 1}`, candidates: [] };
}

export function defaultElectionPositions() {
    return [{ id: padId('pos'), name: '학급 투표', candidates: [] }];
}

/** 연 1회 임원선거용 회장·부회장 템플릿 */
export function chairElectionPositions() {
    return [
        { id: padId('pos'), name: '회장', candidates: [] },
        { id: padId('pos'), name: '부회장', candidates: [] },
    ];
}

/** 투표 항목 개수를 1~MAX_POSITIONS로 맞춘다 */
export function setPositionCount(state, count) {
    const n = Math.max(1, Math.min(MAX_POSITIONS, Math.round(Number(count) || 1)));
    const next = sanitizeElectionState(state);
    if (next.positions.length > n) {
        next.positions = next.positions.slice(0, n);
    } else {
        while (next.positions.length < n) {
            next.positions.push(emptyElectionPosition(next.positions.length));
        }
    }
    next.currentPositionIndex = Math.max(0, Math.min(next.positions.length - 1, next.currentPositionIndex));
    const ballots = {};
    next.positions.forEach((p) => {
        ballots[p.id] = Array.isArray(next.ballots && next.ballots[p.id]) ? next.ballots[p.id] : [];
    });
    next.ballots = ballots;
    return next;
}

export function createElectionState(opts = {}) {
    const positions = Array.isArray(opts.positions) && opts.positions.length
        ? opts.positions
        : defaultElectionPositions();
    return sanitizeElectionState({
        title: opts.title || '학급 투표',
        positions,
        currentPositionIndex: 0,
        phase: 'setup',
        sessionId: opts.sessionId || '',
        ballots: {},
        expectedVoters: Math.max(0, Math.floor(Number(opts.expectedVoters) || 0)),
        createdAt: Date.now(),
    });
}

export function createElectionSessionId() {
    return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    const name = cleanName(raw.name) || `항목 ${index + 1}`;
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
        title: cleanName(src.title) || '학급 투표',
        positions,
        currentPositionIndex,
        phase,
        sessionId: String(src.sessionId || ''),
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
    if (!st.positions.length) return { ok: false, reason: '투표 항목을 먼저 만들어 주세요.' };
    const empty = st.positions.find((p) => p.candidates.length < 2);
    if (empty) {
        return { ok: false, reason: `[${empty.name}] 선택지를 2개 이상 적어 주세요.` };
    }
    return { ok: true };
}

export function ballotCount(state, positionId) {
    const list = state && state.ballots && state.ballots[positionId];
    return Array.isArray(list) ? list.length : 0;
}

/** 학생 문서에 저장하는 한 사람 표 — 세션이 다르면 버립니다. */
export function sanitizeStudentBallot(raw, positions) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const picks = {};
    const posList = Array.isArray(positions) ? positions : [];
    posList.forEach((p) => {
        const nums = new Set(candidateNumbers(p));
        const n = Math.floor(Number(src.picks && src.picks[p.id]));
        if (nums.has(n)) picks[p.id] = n;
    });
    return {
        sessionId: String(src.sessionId || ''),
        picks,
    };
}

export function recordStudentPick(ballot, sessionId, positionId, number, positions) {
    const next = sanitizeStudentBallot(ballot, positions);
    if (String(sessionId || '') && next.sessionId && next.sessionId !== String(sessionId)) {
        next.picks = {};
    }
    next.sessionId = String(sessionId || '');
    const pos = (Array.isArray(positions) ? positions : []).find((p) => p.id === positionId);
    const n = Math.floor(Number(number));
    if (!pos || !candidateNumbers(pos).includes(n) || !next.sessionId) {
        return { ok: false, ballot: next };
    }
    next.picks = { ...next.picks, [positionId]: n };
    return { ok: true, ballot: next };
}

/**
 * 학생 문서들에서 익명 표 묶음을 만듭니다.
 * 한 학생·한 항목당 마지막 선택만 남습니다.
 */
export function collectBallotsFromStudentRows(students, sessionId, positions) {
    const posList = Array.isArray(positions) ? positions : [];
    const ballots = {};
    const voterIdsByPosition = {};
    posList.forEach((p) => {
        ballots[p.id] = [];
        voterIdsByPosition[p.id] = [];
    });
    const sid = String(sessionId || '');
    const votedStudentIds = [];
    if (!sid) {
        return { ballots, voterIdsByPosition, votedStudentIds };
    }
    (Array.isArray(students) ? students : []).forEach((stu) => {
        const id = String((stu && stu.id) || '');
        if (!id || id === 'gm' || id === 'gm_a') return;
        const ballot = sanitizeStudentBallot(stu && stu.classElectionVote, posList);
        if (ballot.sessionId !== sid) return;
        let any = false;
        posList.forEach((p) => {
            const n = ballot.picks[p.id];
            if (n == null) return;
            ballots[p.id].push(n);
            voterIdsByPosition[p.id].push(id);
            any = true;
        });
        if (any) votedStudentIds.push(id);
    });
    return { ballots, voterIdsByPosition, votedStudentIds };
}

export function mergeBallotLists(studentBallots, extraBallots, positions) {
    const out = {};
    (Array.isArray(positions) ? positions : []).forEach((p) => {
        out[p.id] = [
            ...((studentBallots && studentBallots[p.id]) || []),
            ...((extraBallots && extraBallots[p.id]) || []),
        ];
    });
    return out;
}

/** 학생 화면에 내려줄 공개 상태 — 투표 중에는 선택지별 표를 숨깁니다. */
export function toPublishedElection(state) {
    const st = sanitizeElectionState(state);
    return {
        ...st,
        ballots: st.phase === 'vote'
            ? Object.fromEntries(st.positions.map((p) => [p.id, []]))
            : st.ballots,
    };
}
