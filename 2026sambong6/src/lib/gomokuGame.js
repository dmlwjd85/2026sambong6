/**
 * 학급용 오목 (20×20).
 * 흑과 백 모두 3×3 금수입니다. 장목·4-4 금수는 쓰지 않습니다.
 *
 * 3×3
 * - 한 수로 열린 3(활삼)을 두 개 이상 만들면 그 자리는 둘 수 없습니다. 흑·백이 같습니다.
 * - 열린 3은 다음 한 수로 양쪽이 빈 4(직선 4)를 만들 수 있는 3입니다. 한 칸 뛴 3도 포함합니다.
 * - 같은 줄에 열린 3이 두 개여도 금수입니다. 막힌 3, 4(다음 수에 5가 되는 줄)는 세지 않습니다.
 * - 다섯 목(이상)을 만드는 수는 금수보다 우선해 승리입니다.
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

const GOMOKU_LINE_DIRS = Object.freeze([[1, 0], [0, 1], [1, 1], [1, -1]]);

/** 방금 둔 돌 기준으로 5목(이상)인지 봅니다. */
export function gomokuHasFive(board, x, y) {
    if (!board || !inGomokuBoard(x, y, board.length)) return false;
    const color = board[y][x];
    if (color !== GOMOKU_BLACK && color !== GOMOKU_WHITE) return false;
    return GOMOKU_LINE_DIRS.some(([dx, dy]) => 1 + countLine(board, x, y, dx, dy, color) + countLine(board, x, y, -dx, -dy, color) >= GOMOKU_WIN_LEN);
}

/** 이 줄에 두면 바로 5목이 되는 빈 칸이 있는지. 있으면 그 줄은 4라서 3으로 세지 않습니다. */
function lineIsFour(board, x, y, dx, dy, color) {
    const size = board.length;
    for (let start = -4; start <= 0; start += 1) {
        let stones = 0;
        let empties = 0;
        let open = true;
        for (let k = 0; k < GOMOKU_WIN_LEN; k += 1) {
            const nx = x + dx * (start + k);
            const ny = y + dy * (start + k);
            if (!inGomokuBoard(nx, ny, size)) {
                open = false;
                break;
            }
            const v = board[ny][nx];
            if (v === color) stones += 1;
            else if (v === GOMOKU_EMPTY) empties += 1;
            else {
                open = false;
                break;
            }
        }
        if (open && stones === 4 && empties === 1) return true;
    }
    return false;
}

/**
 * (px,py)에 돌을 둔 뒤, 그 점이 포함된 직선 4의 기존 돌 3개 키.
 * 직선 4는 정확히 4개가 이어지고 양 옆이 빈 칸입니다.
 */
function straightFourKey(board, px, py, ox, oy, dx, dy, color) {
    const size = board.length;
    let left = 0;
    let cx = px - dx;
    let cy = py - dy;
    while (inGomokuBoard(cx, cy, size) && board[cy][cx] === color) {
        left += 1;
        cx -= dx;
        cy -= dy;
    }
    let right = 0;
    cx = px + dx;
    cy = py + dy;
    while (inGomokuBoard(cx, cy, size) && board[cy][cx] === color) {
        right += 1;
        cx += dx;
        cy += dy;
    }
    if (left + right + 1 !== 4) return '';
    const lx = px - dx * (left + 1);
    const ly = py - dy * (left + 1);
    const rx = px + dx * (right + 1);
    const ry = py + dy * (right + 1);
    if (!inGomokuBoard(lx, ly, size) || board[ly][lx] !== GOMOKU_EMPTY) return '';
    if (!inGomokuBoard(rx, ry, size) || board[ry][rx] !== GOMOKU_EMPTY) return '';
    const stones = [];
    let includesMove = false;
    for (let i = -left; i <= right; i += 1) {
        const sx = px + dx * i;
        const sy = py + dy * i;
        if (sx === px && sy === py) continue;
        if (sx === ox && sy === oy) includesMove = true;
        stones.push(`${sx},${sy}`);
    }
    if (!includesMove || stones.length !== 3) return '';
    stones.sort();
    return stones.join('|');
}

/**
 * 이미 놓인 돌이 만드는 열린 3의 개수.
 * 같은 3을 양쪽에서 이어 4를 만들 수 있어도 하나는 한 번만 셉니다.
 */
export function gomokuOpenThreeCount(board, x, y, color) {
    if (!board || !inGomokuBoard(x, y, board.length)) return 0;
    if (board[y][x] !== color) return 0;
    let count = 0;
    GOMOKU_LINE_DIRS.forEach(([dx, dy]) => {
        if (lineIsFour(board, x, y, dx, dy, color)) return;
        const keys = new Set();
        for (let t = -4; t <= 4; t += 1) {
            if (t === 0) continue;
            const px = x + dx * t;
            const py = y + dy * t;
            if (!inGomokuBoard(px, py, board.length) || board[py][px] !== GOMOKU_EMPTY) continue;
            board[py][px] = color;
            let key = '';
            try {
                key = straightFourKey(board, px, py, x, y, dx, dy, color);
            } finally {
                board[py][px] = GOMOKU_EMPTY;
            }
            if (key) keys.add(key);
        }
        count += keys.size;
    });
    return count;
}

/** 이 빈 칸에 두면 3×3 금수인지. 흑·백 모두 해당하고, 다섯 목을 만드는 수는 금수가 아닙니다. */
export function gomokuIsDoubleThree(board, x, y, color = GOMOKU_BLACK) {
    const stone = color === GOMOKU_WHITE ? GOMOKU_WHITE : (color === GOMOKU_BLACK ? GOMOKU_BLACK : 0);
    if (!stone) return false;
    const size = Array.isArray(board) ? board.length : 0;
    const px = Math.floor(Number(x));
    const py = Math.floor(Number(y));
    if (!inGomokuBoard(px, py, size) || board[py][px] !== GOMOKU_EMPTY) return false;
    board[py][px] = stone;
    let forbidden = false;
    try {
        if (!gomokuHasFive(board, px, py)) {
            forbidden = gomokuOpenThreeCount(board, px, py, stone) >= 2;
        }
    } finally {
        board[py][px] = GOMOKU_EMPTY;
    }
    return forbidden;
}

/** 지금 둘 색의 3×3 금수 칸. 돌 근처만 봅니다. */
export function listGomokuDoubleThreePoints(board, color = GOMOKU_BLACK) {
    const stone = color === GOMOKU_WHITE ? GOMOKU_WHITE : GOMOKU_BLACK;
    const size = Array.isArray(board) ? board.length : 0;
    const out = [];
    if (!size) return out;
    const seen = new Set();
    for (let y = 0; y < size; y += 1) {
        const row = board[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < size; x += 1) {
            if (row[x] !== GOMOKU_BLACK && row[x] !== GOMOKU_WHITE) continue;
            for (let dy = -4; dy <= 4; dy += 1) {
                for (let dx = -4; dx <= 4; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (!inGomokuBoard(nx, ny, size) || board[ny][nx] !== GOMOKU_EMPTY) continue;
                    const key = ny * size + nx;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    if (gomokuIsDoubleThree(board, nx, ny, stone)) out.push({ x: nx, y: ny });
                }
            }
        }
    }
    return out;
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
    if (!five && gomokuOpenThreeCount(board, px, py, c) >= 2) {
        return { ok: false, error: 'double_three', game: g };
    }
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
    double_three: '3×3 금수입니다. 열린 3을 두 개 동시에 만들 수 없습니다.',
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
