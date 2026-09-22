/**
 * 학급용 자유 오목 (20×20).
 * 렌주 금수(장목·3-3·4-4)는 쓰지 않습니다. 초등 6학년 수업에서 규칙이 단순해야 하기 때문입니다.
 *
 * 승패
 * - 가로·세로·대각선으로 같은 색 돌이 5개 이상 이어지면 승리합니다.
 * - 보드가 가득 차면 무승부입니다.
 * - 30초 턴 타이머가 켜진 방에서 시간을 넘기면 그 턴 플레이어가 집니다. (패스 없음)
 *
 * 보드게임 공통 방(boardGameRooms.js) 위에 붙는 첫 게임입니다.
 * 혼자 하기(AI)는 Firestore 방 없이 gomokuAi.js 를 씁니다.
 */

export const GOMOKU_SIZE = 20;
export const GOMOKU_SIZE_MIN = 7;
export const GOMOKU_SIZE_MAX = 20;
export const GOMOKU_EMPTY = 0;
export const GOMOKU_BLACK = 1;
export const GOMOKU_WHITE = 2;
export const GOMOKU_WIN_LEN = 5;

export const GOMOKU_COLOR_LABEL = Object.freeze({
    1: '흑',
    2: '백',
});

export const GOMOKU_END_REASONS = Object.freeze(['', 'five', 'draw', 'timeout']);

function clampBoardSize(raw, fallback = GOMOKU_SIZE) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < GOMOKU_SIZE_MIN || n > GOMOKU_SIZE_MAX) return fallback;
    return n;
}

/** 진행 중인 15×15 방 문서도 읽히게, cells 길이로 판 크기를 맞춥니다. */
export function resolveGomokuSize(raw, fallback = GOMOKU_SIZE) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const fromField = Math.floor(Number(raw.size));
        if (fromField >= GOMOKU_SIZE_MIN && fromField <= GOMOKU_SIZE_MAX) return fromField;
        if (Array.isArray(raw.cells) && raw.cells.length) {
            const n = Math.round(Math.sqrt(raw.cells.length));
            if (n >= GOMOKU_SIZE_MIN && n <= GOMOKU_SIZE_MAX && n * n === raw.cells.length) return n;
        }
        if (Array.isArray(raw.board) && raw.board.length) {
            const n = raw.board.length;
            if (n >= GOMOKU_SIZE_MIN && n <= GOMOKU_SIZE_MAX) return n;
        }
    }
    return clampBoardSize(raw, fallback);
}

function sanitizeEpochMs(raw) {
    if (raw && typeof raw === 'object' && typeof raw.toMillis === 'function') {
        return Math.max(0, Math.floor(Number(raw.toMillis()) || 0));
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 1e9 && n < 1e12) return Math.floor(n * 1000);
    return Math.max(0, Math.floor(n));
}

export function emptyGomokuBoard(size = GOMOKU_SIZE) {
    const n = clampBoardSize(size, GOMOKU_SIZE);
    return Array.from({ length: n }, () => Array(n).fill(GOMOKU_EMPTY));
}

export function flattenGomokuBoard(board, size = GOMOKU_SIZE) {
    const n = clampBoardSize(size, GOMOKU_SIZE);
    const out = [];
    for (let y = 0; y < n; y += 1) {
        const row = Array.isArray(board) && Array.isArray(board[y]) ? board[y] : [];
        for (let x = 0; x < n; x += 1) {
            const v = Math.floor(Number(row[x]) || 0);
            out.push((v === GOMOKU_BLACK || v === GOMOKU_WHITE) ? v : GOMOKU_EMPTY);
        }
    }
    return out;
}

export function inflateGomokuBoard(cells, size = GOMOKU_SIZE) {
    const n = clampBoardSize(size, GOMOKU_SIZE);
    const out = emptyGomokuBoard(n);
    if (!Array.isArray(cells)) return out;
    for (let i = 0; i < n * n; i += 1) {
        const v = Math.floor(Number(cells[i]) || 0);
        out[Math.floor(i / n)][i % n] = (v === GOMOKU_BLACK || v === GOMOKU_WHITE) ? v : GOMOKU_EMPTY;
    }
    return out;
}

export function sanitizeGomokuBoard(raw, size = GOMOKU_SIZE) {
    const n = clampBoardSize(size, GOMOKU_SIZE);
    if (Array.isArray(raw) && raw.length === n * n && !Array.isArray(raw[0])) {
        return inflateGomokuBoard(raw, n);
    }
    const out = emptyGomokuBoard(n);
    if (!Array.isArray(raw)) return out;
    for (let y = 0; y < n; y += 1) {
        const row = Array.isArray(raw[y]) ? raw[y] : [];
        for (let x = 0; x < n; x += 1) {
            const v = Math.floor(Number(row[x]) || 0);
            out[y][x] = (v === GOMOKU_BLACK || v === GOMOKU_WHITE) ? v : GOMOKU_EMPTY;
        }
    }
    return out;
}

export function emptyGomokuGame({ now = 0, size = GOMOKU_SIZE } = {}) {
    const n = clampBoardSize(size, GOMOKU_SIZE);
    const t = Math.max(0, Math.floor(Number(now) || 0));
    return {
        size: n,
        board: emptyGomokuBoard(n),
        turn: GOMOKU_BLACK,
        lastMove: null,
        winner: 0,
        endReason: '',
        turnStartedAt: t,
        moveCount: 0,
    };
}

function sanitizeLastMove(raw, size) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const x = Math.floor(Number(raw.x));
    const y = Math.floor(Number(raw.y));
    const color = Math.floor(Number(raw.color) || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    if (color !== GOMOKU_BLACK && color !== GOMOKU_WHITE) return null;
    return { x, y, color };
}

export function sanitizeGomokuGame(raw, { now = 0 } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyGomokuGame({ now });
    const size = resolveGomokuSize(raw, GOMOKU_SIZE);
    const turn = raw.turn === GOMOKU_WHITE ? GOMOKU_WHITE : GOMOKU_BLACK;
    const winner = raw.winner === GOMOKU_BLACK || raw.winner === GOMOKU_WHITE ? raw.winner : 0;
    const endReason = GOMOKU_END_REASONS.includes(String(raw.endReason || '')) ? String(raw.endReason || '') : '';
    const board = Array.isArray(raw.cells) && raw.cells.length
        ? inflateGomokuBoard(raw.cells, size)
        : sanitizeGomokuBoard(raw.board, size);
    return {
        size,
        board,
        turn: winner ? turn : turn,
        lastMove: sanitizeLastMove(raw.lastMove, size),
        winner,
        endReason: winner || endReason === 'draw' ? (endReason || (winner ? 'five' : '')) : '',
        turnStartedAt: sanitizeEpochMs(raw.turnStartedAt),
        moveCount: Math.max(0, Math.floor(Number(raw.moveCount) || 0)),
    };
}

export function inGomokuBoard(x, y, size = GOMOKU_SIZE) {
    return x >= 0 && y >= 0 && x < size && y < size;
}

export function countLine(board, x, y, dx, dy, color) {
    const size = board.length;
    let n = 0;
    let cx = x + dx;
    let cy = y + dy;
    while (inGomokuBoard(cx, cy, size) && board[cy][cx] === color) {
        n += 1;
        cx += dx;
        cy += dy;
    }
    return n;
}

/** 방금 둔 돌 기준으로 5목(이상)인지 봅니다. */
export function gomokuHasFive(board, x, y) {
    if (!board || !inGomokuBoard(x, y, board.length)) return false;
    const color = board[y][x];
    if (color !== GOMOKU_BLACK && color !== GOMOKU_WHITE) return false;
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    return dirs.some(([dx, dy]) => 1 + countLine(board, x, y, dx, dy, color) + countLine(board, x, y, -dx, -dy, color) >= GOMOKU_WIN_LEN);
}

export function gomokuBoardFull(board) {
    if (!Array.isArray(board)) return false;
    return board.every((row) => Array.isArray(row) && row.every((cell) => cell === GOMOKU_BLACK || cell === GOMOKU_WHITE));
}

export function gomokuSeatColor(seat) {
    if (seat === 'white') return GOMOKU_WHITE;
    if (seat === 'black') return GOMOKU_BLACK;
    return 0;
}

export function placeGomokuStone(game, { x, y, color, now } = {}) {
    const g = sanitizeGomokuGame(game, { now });
    const t = Math.max(0, Math.floor(Number(now) || 0));
    if (g.winner || g.endReason === 'draw') return { ok: false, error: 'already_over', game: g };
    const px = Math.floor(Number(x));
    const py = Math.floor(Number(y));
    const c = color === GOMOKU_WHITE ? GOMOKU_WHITE : (color === GOMOKU_BLACK ? GOMOKU_BLACK : 0);
    if (!c) return { ok: false, error: 'bad_color', game: g };
    if (!inGomokuBoard(px, py, g.size)) return { ok: false, error: 'out', game: g };
    if (c !== g.turn) return { ok: false, error: 'not_turn', game: g };
    if (g.board[py][px] !== GOMOKU_EMPTY) return { ok: false, error: 'occupied', game: g };
    const board = g.board.map((row) => row.slice());
    board[py][px] = c;
    const five = gomokuHasFive(board, px, py);
    const full = gomokuBoardFull(board);
    const winner = five ? c : 0;
    const endReason = five ? 'five' : (full ? 'draw' : '');
    return {
        ok: true,
        error: '',
        game: {
            ...g,
            board,
            turn: winner || endReason ? c : (c === GOMOKU_BLACK ? GOMOKU_WHITE : GOMOKU_BLACK),
            lastMove: { x: px, y: py, color: c },
            winner,
            endReason,
            turnStartedAt: t,
            moveCount: g.moveCount + 1,
        },
    };
}

/**
 * 시간 초과 시 현재 턴 플레이어가 집니다.
 * 학급용으로 패스 없이 바로 패배로 처리해 다음 판을 빨리 시작합니다.
 */
export function applyGomokuTimeout(game, { now } = {}) {
    const g = sanitizeGomokuGame(game, { now });
    if (g.winner || g.endReason === 'draw') return { ok: false, error: 'already_over', game: g };
    const loser = g.turn;
    const winner = loser === GOMOKU_BLACK ? GOMOKU_WHITE : GOMOKU_BLACK;
    return {
        ok: true,
        error: '',
        game: {
            ...g,
            winner,
            endReason: 'timeout',
            turnStartedAt: Math.max(0, Math.floor(Number(now) || g.turnStartedAt || 0)),
        },
    };
}

export function gomokuWinnerSeat(game) {
    const g = sanitizeGomokuGame(game);
    if (g.endReason === 'draw' || !g.winner) return '';
    return g.winner === GOMOKU_BLACK ? 'black' : 'white';
}

export const GOMOKU_ERROR_LABEL = Object.freeze({
    already_over: '이미 끝난 판입니다.',
    bad_color: '돌 색이 올바르지 않습니다.',
    out: '판 밖에 둘 수 없습니다.',
    not_turn: '지금 둘 차례가 아닙니다.',
    occupied: '이미 돌이 있는 자리입니다.',
});

/** Firestore는 중첩 배열을 받지 않으므로 판은 1차원 cells 로 저장합니다. */
export function gomokuGameToDoc(game) {
    const g = sanitizeGomokuGame(game);
    return {
        size: g.size,
        cells: flattenGomokuBoard(g.board, g.size),
        turn: g.turn,
        lastMove: g.lastMove,
        winner: g.winner,
        endReason: g.endReason,
        turnStartedAt: g.turnStartedAt,
        moveCount: g.moveCount,
    };
}

export function gomokuErrorText(code) {
    return GOMOKU_ERROR_LABEL[String(code || '')] || '둘 수 없습니다.';
}

export function gomokuEndText(game, { blackName = '흑', whiteName = '백' } = {}) {
    const g = sanitizeGomokuGame(game);
    if (g.endReason === 'draw') return '가득 차서 무승부입니다.';
    const winnerName = g.winner === GOMOKU_WHITE ? whiteName : blackName;
    if (g.endReason === 'timeout') return `시간 초과! ${winnerName}의 승리입니다.`;
    if (g.winner) return `${winnerName}이(가) 다섯 목을 만들었습니다!`;
    return '';
}
