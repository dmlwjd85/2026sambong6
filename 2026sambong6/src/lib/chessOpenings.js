/**
 * 초인용 작은 오프닝북.
 * 백·흑 각각 여러 계열을 무작위로 골라, 같은 수가 매번 반복되지 않게 합니다.
 */

import {
    applyTrustedChessMove,
    chessPositionKey,
    emptyChessGame,
    listLegalChessMovesTrusted,
} from './chessGame.js';

const LINES = Object.freeze([
    { name: '이탈리안', side: 'w', uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'] },
    { name: '루이로페스', side: 'w', uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] },
    { name: '퀸스갬빗', side: 'w', uci: ['d2d4', 'd7d5', 'c2c4'] },
    { name: '런던', side: 'w', uci: ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'c1f4'] },
    { name: '잉글리시', side: 'w', uci: ['c2c4'] },
    { name: '시실리안', side: 'b', uci: ['e2e4', 'c7c5'] },
    { name: '프렌치', side: 'b', uci: ['e2e4', 'e7e6'] },
    { name: '카로칸', side: 'b', uci: ['e2e4', 'c7c6'] },
    { name: '오픈게임', side: 'b', uci: ['e2e4', 'e7e5'] },
    { name: '스칸디나비아', side: 'b', uci: ['e2e4', 'd7d5'] },
    { name: '킹즈인디언', side: 'b', uci: ['d2d4', 'g8f6', 'c2c4', 'g7g6'] },
    { name: 'QGD', side: 'b', uci: ['d2d4', 'd7d5', 'c2c4', 'e7e6'] },
]);

function sqOf(name) {
    const file = 'abcdefgh'.indexOf(name[0]);
    const rank = Number(name[1]) - 1;
    return rank * 8 + file;
}

function parseUci(uci) {
    return { from: sqOf(uci.slice(0, 2)), to: sqOf(uci.slice(2, 4)), promo: uci.slice(4, 5) || '' };
}

function buildBook() {
    const map = new Map();
    LINES.forEach((line) => {
        let g = emptyChessGame({ now: 1 });
        line.uci.forEach((uci) => {
            const key = chessPositionKey(g);
            const want = parseUci(uci);
            const legal = listLegalChessMovesTrusted(g).find((m) => m.from === want.from && m.to === want.to && (m.promo || '') === want.promo);
            if (!legal) return;
            const list = map.get(key) || [];
            if (!list.some((m) => m.from === legal.from && m.to === legal.to && (m.promo || '') === (legal.promo || ''))) {
                list.push({ from: legal.from, to: legal.to, promo: legal.promo || '', name: line.name, side: line.side });
                map.set(key, list);
            }
            g = applyTrustedChessMove(g, legal, g.turnStartedAt);
        });
    });
    return map;
}

const BOOK = buildBook();

export function chessOpeningFamilies() {
    const w = new Set(LINES.filter((l) => l.side === 'w').map((l) => l.name));
    const b = new Set(LINES.filter((l) => l.side === 'b').map((l) => l.name));
    return { white: [...w], black: [...b] };
}

export function listChessBookMoves(game) {
    return (BOOK.get(chessPositionKey(game)) || []).slice();
}

export function pickChessBookMove(game, rng = Math.random) {
    const list = listChessBookMoves(game);
    if (!list.length) return null;
    const i = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
    return list[i];
}
