/**
 * 초인 전용 빠른 탐색.
 * 배열 판을 제자리에서 두고 되돌리며(make/unmake), 약 3.5초(최대 4초) 안에 더 깊게 봅니다.
 */

const MG_VAL = [0, 82, 337, 365, 477, 1025, 0];
const EG_VAL = [0, 94, 281, 297, 512, 936, 0];
const SEE_VAL = [0, 100, 325, 335, 500, 975, 20000];

// PeSTO 공식 표(a8=0). 우리 판은 a1=0이라 백은 sq^56으로 읽습니다.
const MG_PST = [
    null,
    [0, 0, 0, 0, 0, 0, 0, 0, 98, 134, 61, 95, 68, 126, 34, -11, -6, 7, 26, 31, 65, 56, 25, -20, -14, 13, 6, 21, 23, 12, 17, -23, -27, -2, -5, 12, 17, 6, 10, -25, -26, -4, -4, -10, 3, 3, 33, -12, -35, -1, -20, -23, -15, 24, 38, -22, 0, 0, 0, 0, 0, 0, 0, 0],
    [-167, -89, -34, -49, 61, -97, -15, -107, -73, -41, 72, 36, 23, 62, 7, -17, -47, 60, 37, 65, 84, 129, 73, 44, -9, 17, 19, 53, 37, 69, 18, 22, -13, 4, 16, 13, 28, 19, 21, -8, -23, -9, 12, 10, 19, 17, 25, -16, -29, -53, -12, -3, -1, 18, -14, -19, -105, -21, -58, -33, -17, -28, -19, -23],
    [-29, 4, -82, -37, -25, -42, 7, -8, -26, 16, -18, -13, 30, 59, 18, -47, -16, 37, 43, 40, 35, 50, 37, -2, -4, 5, 19, 50, 37, 37, 7, -2, -6, 13, 13, 26, 34, 12, 10, 4, 0, 15, 15, 15, 14, 27, 18, 10, 4, 15, 16, 0, 7, 21, 33, 1, -33, -3, -14, -21, -13, -12, -39, -21],
    [32, 42, 32, 51, 63, 9, 31, 43, 27, 32, 58, 62, 80, 67, 26, 44, -5, 19, 26, 36, 17, 45, 61, 16, -24, -11, 7, 26, 24, 35, -8, -20, -36, -26, -12, -1, 9, -7, 6, -23, -45, -25, -16, -17, 3, 0, -5, -33, -44, -16, -20, -9, -1, 11, -6, -71, -19, -13, 1, 17, 16, 7, -37, -26],
    [-28, 0, 29, 12, 59, 44, 43, 45, -24, -39, -5, 1, -16, 57, 28, 54, -13, -17, 7, 8, 29, 56, 47, 57, -27, -27, -16, -16, -1, 17, -2, 1, -9, -26, -9, -10, -2, -4, 3, -3, -14, 2, -11, -2, -5, 2, 14, 5, -35, -8, 11, 2, 8, 15, -3, 1, -1, -18, -9, 10, -15, -25, -31, -50],
    [-65, 23, 16, -15, -56, -34, 2, 13, 29, -1, -20, -7, -8, -4, -38, -29, -9, 24, 2, -16, -20, 6, 22, -22, -17, -20, -12, -27, -30, -25, -14, -36, -49, -1, -27, -39, -46, -44, -33, -51, -14, -14, -22, -46, -44, -30, -15, -27, 1, 7, -8, -64, -43, -16, 9, 8, -15, 36, 12, -54, 8, -28, 24, 14],
];

const EG_PST = [
    null,
    [0, 0, 0, 0, 0, 0, 0, 0, 178, 173, 158, 134, 147, 132, 165, 187, 94, 100, 85, 67, 56, 53, 82, 84, 32, 24, 13, 5, -2, 4, 17, 17, 13, 9, -3, -7, -7, -8, 3, -1, 4, 7, -6, 1, 0, -5, -1, -8, 13, 8, 8, 10, 13, 0, 2, -7, 0, 0, 0, 0, 0, 0, 0, 0],
    [-58, -38, -13, -28, -31, -27, -63, -99, -25, -8, -25, -2, -9, -25, -24, -52, -24, -20, 10, 9, -1, -9, -19, -41, -17, 3, 22, 22, 22, 11, 8, -18, -18, -6, 16, 25, 16, 17, 4, -18, -23, -3, -1, 15, 10, -3, -20, -22, -42, -20, -10, -5, -2, -20, -23, -44, -29, -51, -23, -15, -22, -18, -50, -64],
    [-14, -21, -11, -8, -7, -9, -17, -24, -8, -4, 7, -12, -3, -13, -4, -14, 2, -8, 0, -1, -2, 6, 0, 4, -3, 9, 12, 9, 14, 10, 3, 2, -6, 3, 13, 19, 7, 10, -3, -9, -12, -3, 8, 10, 13, 3, -7, -15, -14, -18, -7, -1, 4, -9, -15, -27, -23, -9, -23, -5, -9, -16, -5, -17],
    [13, 10, 18, 15, 12, 12, 8, 5, 11, 13, 13, 11, -3, 3, 8, 3, 7, 7, 7, 5, 4, -3, -5, -3, 4, 3, 13, 1, 2, 1, -1, 2, 3, 5, 8, 4, -5, -6, -8, -11, -4, 0, -5, -1, -7, -12, -8, -16, -6, -6, 0, 2, -9, -9, -11, -3, -9, 2, 3, -1, -5, -13, 4, -20],
    [-9, 22, 22, 27, 27, 19, 10, 20, -17, 20, 32, 41, 58, 25, 30, 0, -20, 6, 9, 49, 47, 35, 19, 9, 3, 22, 24, 45, 57, 40, 57, 36, -18, 28, 19, 47, 31, 34, 39, 23, -16, -27, 15, 6, 9, 17, 10, 5, -22, -23, -30, -16, -16, -23, -36, -32, -33, -28, -22, -43, -5, -32, -20, -41],
    [-74, -35, -18, -18, -11, 15, 4, -17, -12, 17, 14, 17, 17, 38, 23, 11, 10, 17, 23, 15, 20, 45, 44, 13, -8, 22, 24, 27, 26, 33, 26, 3, -18, -4, 21, 24, 27, 23, 9, -11, -19, -3, 11, 21, 23, 16, 7, -9, -27, -11, 4, 13, 14, 4, -5, -17, -53, -34, -21, -11, -28, -14, -24, -43],
];

const PHASE_W = [0, 0, 1, 1, 2, 4, 0];
// 0x88 나이트/킹 한 칸 오프셋입니다.
const N_DEL = [33, 31, 18, 14, -14, -18, -31, -33];
const K_DEL = [1, -1, 16, -16, 15, 17, -15, -17];

function mix(seed) {
    return function next() {
        seed = (seed + 0x9e3779b9) >>> 0;
        let z = seed;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
        return (z ^ (z >>> 16)) >>> 0;
    };
}

const rnd = mix(0xC0FFEE);
const Z_PIECE = new Uint32Array(15 * 64);
const Z_CASTLE = new Uint32Array(16);
const Z_EP = new Uint32Array(8);
const Z_SIDE = rnd();
for (let i = 0; i < Z_PIECE.length; i += 1) Z_PIECE[i] = rnd();
for (let i = 0; i < 16; i += 1) Z_CASTLE[i] = rnd();
for (let i = 0; i < 8; i += 1) Z_EP[i] = rnd();

const TT_BITS = 17;
const TT_MASK = (1 << TT_BITS) - 1;
const ttKey = new Uint32Array(1 << TT_BITS);
const ttDepth = new Int8Array(1 << TT_BITS);
const ttFlag = new Uint8Array(1 << TT_BITS);
const ttVal = new Int32Array(1 << TT_BITS);
const ttFrom = new Uint8Array(1 << TT_BITS);
const ttTo = new Uint8Array(1 << TT_BITS);
const ttPromo = new Uint8Array(1 << TT_BITS);

function ttClear() {
    ttKey.fill(0);
    ttDepth.fill(0);
}

function ttProbe(hash, depth, alpha, beta) {
    const i = hash & TT_MASK;
    if (ttKey[i] !== hash || ttDepth[i] < depth) return null;
    const flag = ttFlag[i];
    const val = ttVal[i];
    if (flag === 1) return { val, mv: { from: ttFrom[i], to: ttTo[i], promo: ttPromo[i] ? String.fromCharCode(ttPromo[i]) : '' } };
    if (flag === 2 && val <= alpha) return { val, mv: null };
    if (flag === 3 && val >= beta) return { val, mv: null };
    return null;
}

function ttStore(hash, depth, val, flag, mv) {
    const i = hash & TT_MASK;
    ttKey[i] = hash;
    ttDepth[i] = depth;
    ttVal[i] = val;
    ttFlag[i] = flag;
    if (mv) {
        ttFrom[i] = mv.from;
        ttTo[i] = mv.to;
        ttPromo[i] = mv.promo ? mv.promo.charCodeAt(0) : 0;
    }
}

function on88(sq) {
    return ((sq & 7) << 0) | ((sq >> 3) << 4);
}

function from88(x) {
    return (x & 7) + ((x >> 4) << 3);
}

function typeOf(p) {
    return p & 7;
}

function isWhite(p) {
    return p > 0 && p < 9;
}

function pstMg(p, sq) {
    const t = typeOf(p);
    return isWhite(p) ? MG_PST[t][sq ^ 56] : MG_PST[t][sq];
}

function pstEg(p, sq) {
    const t = typeOf(p);
    return isWhite(p) ? EG_PST[t][sq ^ 56] : EG_PST[t][sq];
}

function addPieceScore(s, p, sq, sign) {
    const t = typeOf(p);
    const w = isWhite(p) ? 1 : -1;
    s.mg += sign * w * (MG_VAL[t] + pstMg(p, sq));
    s.eg += sign * w * (EG_VAL[t] + pstEg(p, sq));
    s.phase += sign * PHASE_W[t];
}

function xorPiece(s, p, sq) {
    s.hash ^= Z_PIECE[p * 64 + sq];
}

export const choinSearchStats = {
    depth: 0,
    nodes: 0,
};

function attacked(s, sq, byWhite) {
    const file = sq & 7;
    const rank = sq >> 3;
    const pawn = byWhite ? 1 : 9;
    const pr = byWhite ? rank - 1 : rank + 1;
    if (pr >= 0 && pr < 8) {
        if (file > 0 && s.c[pr * 8 + file - 1] === pawn) return true;
        if (file < 7 && s.c[pr * 8 + file + 1] === pawn) return true;
    }
    const kn = byWhite ? 2 : 10;
    const base = on88(sq);
    for (let i = 0; i < 8; i += 1) {
        const t = base + N_DEL[i];
        if (t & 0x88) continue;
        if (s.c[from88(t)] === kn) return true;
    }
    const kg = byWhite ? 6 : 14;
    for (let i = 0; i < 8; i += 1) {
        const t = base + K_DEL[i];
        if (t & 0x88) continue;
        if (s.c[from88(t)] === kg) return true;
    }
    const bish = byWhite ? 3 : 11;
    const rook = byWhite ? 4 : 12;
    const queen = byWhite ? 5 : 13;
    const rays = [1, -1, 16, -16, 15, 17, -15, -17];
    for (let r = 0; r < 8; r += 1) {
        const d = rays[r];
        const slider = r < 4;
        let t = base + d;
        while (!(t & 0x88)) {
            const p = s.c[from88(t)];
            if (p) {
                if (p === queen || (slider && p === rook) || (!slider && p === bish)) return true;
                break;
            }
            t += d;
        }
    }
    return false;
}

function inCheck(s, white) {
    return attacked(s, white ? s.wk : s.bk, !white);
}

function seeNonNeg(s, from, to) {
    const hit = s.c[to];
    if (!hit) return true;
    const atk = s.c[from];
    const gain = SEE_VAL[typeOf(hit)] - SEE_VAL[typeOf(atk)];
    if (gain >= 0) return true;
    // 값싼 기물로 되잡지 못하면 이득입니다.
    return !attacked(s, to, isWhite(atk) === false);
}

function genMoves(s, capturesOnly) {
    const out = [];
    const white = s.turn === 0;
    const meMin = white ? 1 : 9;
    const meMax = white ? 6 : 14;
    const dir = white ? 1 : -1;
    const start = white ? 1 : 6;
    const last = white ? 7 : 0;
    for (let from = 0; from < 64; from += 1) {
        const p = s.c[from];
        if (p < meMin || p > meMax) continue;
        const t = typeOf(p);
        const f = from & 7;
        const r = from >> 3;
        if (t === 1) {
            const one = from + dir * 8;
            if (!capturesOnly && one >= 0 && one < 64 && !s.c[one]) {
                if ((one >> 3) === last) {
                    out.push({ from, to: one, promo: 'q', cap: 0, ep: 0, castle: 0 });
                    out.push({ from, to: one, promo: 'n', cap: 0, ep: 0, castle: 0 });
                } else {
                    out.push({ from, to: one, promo: '', cap: 0, ep: 0, castle: 0 });
                    const two = from + dir * 16;
                    if (r === start && !s.c[two]) out.push({ from, to: two, promo: '', cap: 0, ep: 0, castle: 0 });
                }
            }
            for (const df of [-1, 1]) {
                const nf = f + df;
                const nr = r + dir;
                if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
                const to = nr * 8 + nf;
                const hit = s.c[to];
                if (hit && isWhite(hit) !== white) {
                    if (nr === last) out.push({ from, to, promo: 'q', cap: hit, ep: 0, castle: 0 });
                    else out.push({ from, to, promo: '', cap: hit, ep: 0, castle: 0 });
                } else if (to === s.ep) {
                    out.push({ from, to, promo: '', cap: white ? 9 : 1, ep: 1, castle: 0 });
                }
            }
            continue;
        }
        if (t === 2) {
            const base = on88(from);
            for (let i = 0; i < 8; i += 1) {
                const x = base + N_DEL[i];
                if (x & 0x88) continue;
                const to = from88(x);
                const hit = s.c[to];
                if (!hit) {
                    if (!capturesOnly) out.push({ from, to, promo: '', cap: 0, ep: 0, castle: 0 });
                } else if (isWhite(hit) !== white) out.push({ from, to, promo: '', cap: hit, ep: 0, castle: 0 });
            }
            continue;
        }
        if (t === 6) {
            const base = on88(from);
            for (let i = 0; i < 8; i += 1) {
                const x = base + K_DEL[i];
                if (x & 0x88) continue;
                const to = from88(x);
                const hit = s.c[to];
                if (!hit) {
                    if (!capturesOnly) out.push({ from, to, promo: '', cap: 0, ep: 0, castle: 0 });
                } else if (isWhite(hit) !== white) out.push({ from, to, promo: '', cap: hit, ep: 0, castle: 0 });
            }
            continue;
        }
        const rays = t === 3
            ? [15, 17, -15, -17]
            : t === 4
                ? [1, -1, 16, -16]
                : [1, -1, 16, -16, 15, 17, -15, -17];
        const base = on88(from);
        for (let i = 0; i < rays.length; i += 1) {
            let x = base + rays[i];
            while (!(x & 0x88)) {
                const to = from88(x);
                const hit = s.c[to];
                if (!hit) {
                    if (!capturesOnly) out.push({ from, to, promo: '', cap: 0, ep: 0, castle: 0 });
                } else {
                    if (isWhite(hit) !== white) out.push({ from, to, promo: '', cap: hit, ep: 0, castle: 0 });
                    break;
                }
                x += rays[i];
            }
        }
    }
    if (!capturesOnly && !inCheck(s, white)) {
        const king = white ? 4 : 60;
        const crK = white ? 1 : 4;
        const crQ = white ? 2 : 8;
        const them = !white;
        if ((s.cr & crK) && !s.c[king + 1] && !s.c[king + 2]
            && !attacked(s, king + 1, them) && !attacked(s, king + 2, them)) {
            out.push({ from: king, to: king + 2, promo: '', cap: 0, ep: 0, castle: 1 });
        }
        if ((s.cr & crQ) && !s.c[king - 1] && !s.c[king - 2] && !s.c[king - 3]
            && !attacked(s, king - 1, them) && !attacked(s, king - 2, them)) {
            out.push({ from: king, to: king - 2, promo: '', cap: 0, ep: 0, castle: 2 });
        }
    }
    return out;
}

function make(s, mv) {
    const white = s.turn === 0;
    const p = s.c[mv.from];
    const undo = {
        from: mv.from,
        to: mv.to,
        p,
        cap: mv.cap,
        epCap: 0,
        promo: mv.promo,
        castle: mv.castle,
        cr: s.cr,
        ep: s.ep,
        wk: s.wk,
        bk: s.bk,
        phase: s.phase,
        mg: s.mg,
        eg: s.eg,
        hash: s.hash,
    };
    s.hash ^= Z_SIDE;
    if (s.ep >= 0) s.hash ^= Z_EP[s.ep & 7];
    s.hash ^= Z_CASTLE[s.cr];
    xorPiece(s, p, mv.from);
    addPieceScore(s, p, mv.from, -1);
    s.c[mv.from] = 0;
    if (mv.ep) {
        const capSq = white ? mv.to - 8 : mv.to + 8;
        undo.epCap = capSq;
        const vic = s.c[capSq];
        xorPiece(s, vic, capSq);
        addPieceScore(s, vic, capSq, -1);
        s.c[capSq] = 0;
    } else if (mv.cap) {
        xorPiece(s, mv.cap, mv.to);
        addPieceScore(s, mv.cap, mv.to, -1);
    }
    let placed = p;
    if (mv.promo) {
        const t = mv.promo === 'q' ? 5 : mv.promo === 'r' ? 4 : mv.promo === 'b' ? 3 : 2;
        placed = white ? t : t + 8;
    }
    s.c[mv.to] = placed;
    xorPiece(s, placed, mv.to);
    addPieceScore(s, placed, mv.to, 1);
    if (typeOf(p) === 6) {
        if (white) s.wk = mv.to;
        else s.bk = mv.to;
        s.cr &= white ? ~3 : ~12;
    }
    if (mv.castle === 1) {
        const rf = mv.to + 1;
        const rt = mv.to - 1;
        const rook = s.c[rf];
        xorPiece(s, rook, rf);
        addPieceScore(s, rook, rf, -1);
        s.c[rf] = 0;
        s.c[rt] = rook;
        xorPiece(s, rook, rt);
        addPieceScore(s, rook, rt, 1);
    } else if (mv.castle === 2) {
        const rf = mv.to - 2;
        const rt = mv.to + 1;
        const rook = s.c[rf];
        xorPiece(s, rook, rf);
        addPieceScore(s, rook, rf, -1);
        s.c[rf] = 0;
        s.c[rt] = rook;
        xorPiece(s, rook, rt);
        addPieceScore(s, rook, rt, 1);
    }
    if (mv.from === 0 || mv.to === 0) s.cr &= ~2;
    if (mv.from === 7 || mv.to === 7) s.cr &= ~1;
    if (mv.from === 56 || mv.to === 56) s.cr &= ~8;
    if (mv.from === 63 || mv.to === 63) s.cr &= ~4;
    s.ep = -1;
    if (typeOf(p) === 1 && Math.abs((mv.to >> 3) - (mv.from >> 3)) === 2) s.ep = (mv.from + mv.to) >> 1;
    if (s.ep >= 0) s.hash ^= Z_EP[s.ep & 7];
    s.hash ^= Z_CASTLE[s.cr];
    s.turn ^= 1;
    s.undo.push(undo);
    return !inCheck(s, white);
}

function unmake(s) {
    const u = s.undo.pop();
    s.turn ^= 1;
    s.c[u.from] = u.p;
    s.c[u.to] = u.epCap ? 0 : u.cap;
    if (u.epCap) s.c[u.epCap] = u.cap;
    if (u.castle === 1) {
        s.c[u.to + 1] = s.c[u.to - 1];
        s.c[u.to - 1] = 0;
    } else if (u.castle === 2) {
        s.c[u.to - 2] = s.c[u.to + 1];
        s.c[u.to + 1] = 0;
    }
    s.cr = u.cr;
    s.ep = u.ep;
    s.wk = u.wk;
    s.bk = u.bk;
    s.phase = u.phase;
    s.mg = u.mg;
    s.eg = u.eg;
    s.hash = u.hash;
}

function pawnTerms(s) {
    let mg = 0;
    let eg = 0;
    const wFile = [0, 0, 0, 0, 0, 0, 0, 0];
    const bFile = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let sq = 0; sq < 64; sq += 1) {
        const p = s.c[sq];
        if (typeOf(p) !== 1) continue;
        if (isWhite(p)) wFile[sq & 7] += 1;
        else bFile[sq & 7] += 1;
    }
    for (let f = 0; f < 8; f += 1) {
        if (wFile[f] > 1) {
            mg -= 12 * (wFile[f] - 1);
            eg -= 18 * (wFile[f] - 1);
        }
        if (bFile[f] > 1) {
            mg += 12 * (bFile[f] - 1);
            eg += 18 * (bFile[f] - 1);
        }
        const wIso = wFile[f] && !wFile[f - 1] && !wFile[f + 1];
        const bIso = bFile[f] && !bFile[f - 1] && !bFile[f + 1];
        if (wIso) { mg -= 9; eg -= 14; }
        if (bIso) { mg += 9; eg += 14; }
    }
    for (let sq = 0; sq < 64; sq += 1) {
        const p = s.c[sq];
        if (typeOf(p) !== 1) continue;
        const white = isWhite(p);
        const file = sq & 7;
        const rank = sq >> 3;
        let passed = true;
        const dir = white ? 1 : -1;
        for (let r = rank + dir; r >= 0 && r <= 7; r += dir) {
            for (let f = file - 1; f <= file + 1; f += 1) {
                if (f < 0 || f > 7) continue;
                const hit = s.c[r * 8 + f];
                if (typeOf(hit) === 1 && isWhite(hit) !== white) {
                    passed = false;
                    break;
                }
            }
            if (!passed) break;
        }
        if (passed) {
            const adv = white ? rank : 7 - rank;
            const bonus = [0, 4, 10, 18, 30, 50, 80, 0][adv];
            const sign = white ? 1 : -1;
            mg += sign * bonus;
            eg += sign * (bonus + adv * 8);
        }
        // 같은 줄 옆 폰이 있으면 연결 보너스를 줍니다.
        if ((sq & 7) < 7 && typeOf(s.c[sq + 1]) === 1 && isWhite(s.c[sq + 1]) === white) {
            const sign = white ? 1 : -1;
            mg += sign * 3;
            eg += sign * 5;
        }
    }
    return { mg, eg };
}

function kingShield(s, ksq, white) {
    const file = ksq & 7;
    const rank = ksq >> 3;
    const dir = white ? 1 : -1;
    let v = 0;
    for (const df of [-1, 0, 1]) {
        const f = file + df;
        const r = rank + dir;
        if (f < 0 || f > 7 || r < 0 || r > 7) continue;
        const p = s.c[r * 8 + f];
        if (typeOf(p) === 1 && isWhite(p) === white) v += 14;
    }
    if ((white && rank > 1) || (!white && rank < 6)) v -= 18;
    return v;
}

function mobility(s) {
    let w = 0;
    let b = 0;
    for (let sq = 0; sq < 64; sq += 1) {
        const p = s.c[sq];
        const t = typeOf(p);
        if (t < 2 || t > 5) continue;
        const white = isWhite(p);
        const base = on88(sq);
        let n = 0;
        if (t === 2) {
            for (let i = 0; i < 8; i += 1) {
                const x = base + N_DEL[i];
                if (!(x & 0x88) && (!s.c[from88(x)] || isWhite(s.c[from88(x)]) !== white)) n += 1;
            }
        } else {
            const rays = t === 3 ? [15, 17, -15, -17] : t === 4 ? [1, -1, 16, -16] : [1, -1, 16, -16, 15, 17, -15, -17];
            for (let i = 0; i < rays.length; i += 1) {
                let x = base + rays[i];
                while (!(x & 0x88)) {
                    const hit = s.c[from88(x)];
                    if (!hit) n += 1;
                    else {
                        if (isWhite(hit) !== white) n += 1;
                        break;
                    }
                    x += rays[i];
                }
            }
        }
        if (white) w += n;
        else b += n;
    }
    return w - b;
}

function rookFiles(s) {
    let mg = 0;
    let eg = 0;
    const wP = [0, 0, 0, 0, 0, 0, 0, 0];
    const bP = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let sq = 0; sq < 64; sq += 1) {
        if (typeOf(s.c[sq]) !== 1) continue;
        if (isWhite(s.c[sq])) wP[sq & 7] += 1;
        else bP[sq & 7] += 1;
    }
    for (let sq = 0; sq < 64; sq += 1) {
        const t = typeOf(s.c[sq]);
        if (t !== 4 && t !== 5) continue;
        const file = sq & 7;
        const open = !wP[file] && !bP[file];
        const semi = isWhite(s.c[sq]) ? !wP[file] : !bP[file];
        const add = t === 5 ? 0.55 : 1;
        if (open) {
            mg += (isWhite(s.c[sq]) ? 1 : -1) * (16 * add);
            eg += (isWhite(s.c[sq]) ? 1 : -1) * (10 * add);
        } else if (semi) {
            mg += (isWhite(s.c[sq]) ? 1 : -1) * (8 * add);
            eg += (isWhite(s.c[sq]) ? 1 : -1) * (5 * add);
        }
    }
    return { mg, eg };
}

function bishopPairAndKingEg(s) {
    let wb = 0;
    let bb = 0;
    let queens = 0;
    for (let sq = 0; sq < 64; sq += 1) {
        const t = typeOf(s.c[sq]);
        if (t === 5) queens += 1;
        if (t !== 3) continue;
        if (isWhite(s.c[sq])) wb += 1;
        else bb += 1;
    }
    let mg = 0;
    let eg = 0;
    if (wb >= 2) { mg += 28; eg += 42; }
    if (bb >= 2) { mg -= 28; eg -= 42; }
    // 퀸이 없으면 킹을 가운데로 보냅니다. 퀸이 남은 중반 킹워크는 금지합니다.
    if (queens === 0 && s.wk >= 0 && s.bk >= 0) {
        const wC = Math.abs((s.wk & 7) - 3.5) + Math.abs((s.wk >> 3) - 3.5);
        const bC = Math.abs((s.bk & 7) - 3.5) + Math.abs((s.bk >> 3) - 3.5);
        eg += (bC - wC) * 10;
        const kd = Math.abs((s.wk & 7) - (s.bk & 7)) + Math.abs((s.wk >> 3) - (s.bk >> 3));
        eg += (14 - kd);
    }
    return { mg, eg };
}

function evaluate(s) {
    const extra = pawnTerms(s);
    const rooks = rookFiles(s);
    const extra2 = bishopPairAndKingEg(s);
    const mob = mobility(s);
    const shield = kingShield(s, s.wk, true) - kingShield(s, s.bk, false);
    let mg = s.mg + extra.mg + extra2.mg + rooks.mg + shield + mob * 2;
    let eg = s.eg + extra.eg + extra2.eg + rooks.eg + mob;
    const ph = Math.max(0, Math.min(24, s.phase));
    let score = ((mg * ph) + (eg * (24 - ph))) / 24;
    if (s.turn === 1) score = -score;
    return score | 0;
}

function order(s, moves, ttMv, killers, history, ply) {
    return moves.slice().sort((a, b) => {
        const aTt = ttMv && a.from === ttMv.from && a.to === ttMv.to && a.promo === (ttMv.promo || '') ? 90000 : 0;
        const bTt = ttMv && b.from === ttMv.from && b.to === ttMv.to && b.promo === (ttMv.promo || '') ? 90000 : 0;
        const aK = killers[ply] && killers[ply].some((k) => k && k.from === a.from && k.to === a.to) ? 700 : 0;
        const bK = killers[ply] && killers[ply].some((k) => k && k.from === b.from && k.to === b.to) ? 700 : 0;
        const aS = (a.cap ? SEE_VAL[typeOf(a.cap)] * 16 - SEE_VAL[typeOf(s.c[a.from])] : 0) + (history[a.from * 64 + a.to] || 0);
        const bS = (b.cap ? SEE_VAL[typeOf(b.cap)] * 16 - SEE_VAL[typeOf(s.c[b.from])] : 0) + (history[b.from * 64 + b.to] || 0);
        return (bTt + bK + bS) - (aTt + aK + aS) || a.from - b.from || a.to - b.to;
    });
}

function timedOut(s) {
    if ((s.nodes & 127) === 0 && Date.now() >= s.deadline) s.stop = true;
    return s.stop;
}

function qsearch(s, alpha, beta, qdepth) {
    s.nodes += 1;
    if (timedOut(s) || qdepth <= 0) return evaluate(s);
    const check = inCheck(s, s.turn === 0);
    const stand = evaluate(s);
    if (!check) {
        if (stand >= beta) return beta;
        if (stand > alpha) alpha = stand;
    }
    const moves = order(s, genMoves(s, !check), null, s.killers, s.history, 0);
    let legal = 0;
    for (let i = 0; i < moves.length; i += 1) {
        if (timedOut(s)) break;
        if (!check && moves[i].cap && !seeNonNeg(s, moves[i].from, moves[i].to)) continue;
        if (!check && moves[i].cap && stand + SEE_VAL[typeOf(moves[i].cap)] + 70 < alpha) continue;
        if (!make(s, moves[i])) {
            unmake(s);
            continue;
        }
        legal += 1;
        const val = -qsearch(s, -beta, -alpha, qdepth - 1);
        unmake(s);
        if (val >= beta) return beta;
        if (val > alpha) alpha = val;
    }
    if (check && !legal && !s.stop) return -20000 + (s.undo ? s.undo.length : 0);
    return alpha;
}

function search(s, depth, alpha, beta, ply, allowNull) {
    s.nodes += 1;
    if (timedOut(s)) return evaluate(s);
    const hit = ttProbe(s.hash, depth, alpha, beta);
    if (hit && ply) return hit.val;
    if (depth <= 0) return qsearch(s, alpha, beta, 8);
    const check = inCheck(s, s.turn === 0);
    if (allowNull && !check && depth >= 3 && s.phase >= 6 && ply) {
        s.hash ^= Z_SIDE;
        if (s.ep >= 0) s.hash ^= Z_EP[s.ep & 7];
        const savedEp = s.ep;
        s.ep = -1;
        s.turn ^= 1;
        const nm = -search(s, depth - 3, -beta, -beta + 1, ply + 1, false);
        s.turn ^= 1;
        s.ep = savedEp;
        if (s.ep >= 0) s.hash ^= Z_EP[s.ep & 7];
        s.hash ^= Z_SIDE;
        if (nm >= beta) return beta;
    }
    const ttMv = hit && hit.mv ? hit.mv : (ttKey[s.hash & TT_MASK] === s.hash ? { from: ttFrom[s.hash & TT_MASK], to: ttTo[s.hash & TT_MASK], promo: ttPromo[s.hash & TT_MASK] ? String.fromCharCode(ttPromo[s.hash & TT_MASK]) : '' } : null);
    const moves = order(s, genMoves(s, false), ttMv, s.killers, s.history, ply);
    const stand = (!check && depth <= 2) ? evaluate(s) : 0;
    let legal = 0;
    let best = -30000;
    let bestMv = null;
    let flag = 2;
    const origAlpha = alpha;
    for (let i = 0; i < moves.length; i += 1) {
        if (timedOut(s)) break;
        const maybeQuiet = !moves[i].cap && !moves[i].promo;
        if (maybeQuiet && !check && depth <= 2 && stand + 110 < alpha) continue;
        if (!make(s, moves[i])) {
            unmake(s);
            continue;
        }
        legal += 1;
        const givesCheck = inCheck(s, s.turn === 0);
        let ext = givesCheck ? 1 : 0;
        const quiet = maybeQuiet && !givesCheck;
        let next = depth - 1 + ext;
        if (quiet && depth >= 3 && i >= 3 && !check) {
            const red = (i >= 6 && depth >= 5) ? 2 : 1;
            next = depth - 1 - red + ext;
        }
        let val = -search(s, next, -beta, -alpha, ply + 1, true);
        if (next < depth - 1 + ext && val > alpha) val = -search(s, depth - 1 + ext, -beta, -alpha, ply + 1, true);
        unmake(s);
        if (val > best) {
            best = val;
            bestMv = moves[i];
        }
        if (val > alpha) {
            alpha = val;
            flag = 1;
        }
        if (alpha >= beta) {
            flag = 3;
            if (quiet) {
                const slot = s.killers[ply] || (s.killers[ply] = []);
                slot.unshift(moves[i]);
                if (slot.length > 2) slot.length = 2;
                s.history[moves[i].from * 64 + moves[i].to] += depth * depth;
            }
            break;
        }
    }
    if (!legal) return check ? -20000 + ply : 0;
    if (best <= origAlpha) flag = 2;
    ttStore(s.hash, depth, best, flag, bestMv);
    return best;
}

function fromGame(game) {
    const s = {
        c: new Uint8Array(64),
        turn: game.turn === 'b' ? 1 : 0,
        cr: 0,
        ep: Number(game.ep),
        wk: -1,
        bk: -1,
        phase: 0,
        mg: 0,
        eg: 0,
        hash: 0,
        nodes: 0,
        deadline: 0,
        stop: false,
        undo: [],
        killers: [],
        history: new Int32Array(64 * 64),
    };
    if (!Number.isFinite(s.ep) || s.ep < 0 || s.ep > 63) s.ep = -1;
    const cas = String(game.castling || '');
    if (cas.includes('K')) s.cr |= 1;
    if (cas.includes('Q')) s.cr |= 2;
    if (cas.includes('k')) s.cr |= 4;
    if (cas.includes('q')) s.cr |= 8;
    for (let sq = 0; sq < 64; sq += 1) {
        const p = game.cells[sq] || 0;
        s.c[sq] = p;
        if (!p) continue;
        xorPiece(s, p, sq);
        addPieceScore(s, p, sq, 1);
        if (p === 6) s.wk = sq;
        if (p === 14) s.bk = sq;
    }
    s.hash ^= Z_CASTLE[s.cr];
    if (s.ep >= 0) s.hash ^= Z_EP[s.ep & 7];
    if (s.turn) s.hash ^= Z_SIDE;
    // 빈 칸 해시 0과 겹치지 않게 소금을 넣습니다.
    s.hash ^= 0xa5a5a5a5;
    return s;
}

function searchRoot(s, depth, alpha0, beta0) {
    const moves = order(s, genMoves(s, false), ttKey[s.hash & TT_MASK] === s.hash ? { from: ttFrom[s.hash & TT_MASK], to: ttTo[s.hash & TT_MASK], promo: ttPromo[s.hash & TT_MASK] ? String.fromCharCode(ttPromo[s.hash & TT_MASK]) : '' } : null, s.killers, s.history, 0);
    const rows = [];
    let alpha = alpha0;
    for (let i = 0; i < moves.length; i += 1) {
        if (timedOut(s)) break;
        if (!make(s, moves[i])) {
            unmake(s);
            continue;
        }
        const ext = inCheck(s, s.turn === 0) ? 1 : 0;
        // 루트는 모든 수를 같은 창으로 봐 실제 점수 차이를 남깁니다. PVS 실패낮음은 최선 수를 가립니다.
        const val = -search(s, depth - 1 + ext, -beta0, -alpha0, 1, true);
        unmake(s);
        rows.push({ mv: { from: moves[i].from, to: moves[i].to, promo: moves[i].promo || '' }, val });
        if (val > alpha) alpha = val;
        if (alpha >= beta0) break;
    }
    rows.sort((a, b) => b.val - a.val || a.mv.from - b.mv.from || a.mv.to - b.mv.to);
    return {
        rows,
        completed: !s.stop && rows.length > 0,
        mv: rows[0] ? rows[0].mv : null,
        val: rows[0] ? rows[0].val : -30000,
    };
}

export function pickChoinEngineMove(game, { timeMs = 3500 } = {}) {
    const s = fromGame(game);
    s.deadline = Date.now() + Math.max(80, Math.min(4000, Number(timeMs) || 3500));
    ttClear();
    let found = { rows: [], mv: null, val: -30000, completed: false };
    let doneDepth = 0;
    let lastScore = 0;
    for (let depth = 2; depth <= 14; depth += 1) {
        if (s.deadline - Date.now() < 80) break;
        s.stop = false;
        const prev = found;
        let alpha = -30000;
        let beta = 30000;
        // 깊이 4부터 aspiration. 실패하면 전체 창으로 다시 봅니다.
        if (depth >= 4 && Number.isFinite(lastScore)) {
            alpha = lastScore - 48;
            beta = lastScore + 48;
        }
        let next = searchRoot(s, depth, alpha, beta);
        if (!s.stop && next.rows.length && (next.val <= alpha || next.val >= beta)) {
            s.stop = false;
            next = searchRoot(s, depth, -30000, 30000);
        }
        if (next.rows && next.rows.length && (next.completed || !prev.rows.length)) {
            found = next;
            lastScore = next.val;
            if (next.completed) doneDepth = depth;
        }
        if (next.val >= 19000) break;
    }
    choinSearchStats.depth = doneDepth;
    choinSearchStats.nodes = s.nodes;
    return found;
}

export function pickSoftChoinMove(rows, rng) {
    const clean = (rows || []).filter((r) => r && r.mv && Number.isFinite(r.val));
    if (!clean.length) return null;
    const best = clean[0];
    if (best.val >= 18000) return best.mv;
    if (clean.length === 1) return best.mv;
    // 동점(약 10cp)이 아니면 항상 최선 수. 같은 점수가 많이 쌓이면 실패낮음으로 보고 최선만 둡니다.
    if (best.val - clean[1].val > 10) return best.mv;
    const tied = clean.filter((r) => r.val === best.val);
    if (tied.length >= 3) return best.mv;
    const pool = clean.filter((r) => best.val - r.val <= 10).slice(0, 2);
    if (pool.length < 2) return best.mv;
    const roll = typeof rng === 'function' ? rng() : Math.random();
    return roll < 0.72 ? pool[0].mv : pool[1].mv;
}
