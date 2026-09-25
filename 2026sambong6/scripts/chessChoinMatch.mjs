/**
 * 새 초인 vs PR #13 초인 장대국.
 * TIME_MS·MAX_MOVES·GAMES 환경 변수로 조절합니다.
 */
import {
    chessGameFromUci,
    playChessAiMatch,
} from '../src/lib/chessAi.js';
import { CHESS_BLACK, CHESS_WHITE } from '../src/lib/chessGame.js';

const TIME = Math.max(80, Number(process.env.TIME_MS) || 700);
const MAX = Math.max(20, Number(process.env.MAX_MOVES) || 120);
const OPENINGS = [
    { name: '시작', uci: [] },
    { name: '오픈게임', uci: ['e2e4', 'e7e5'] },
    { name: '시실리안', uci: ['e2e4', 'c7c5'] },
    { name: '프렌치', uci: ['e2e4', 'e7e6'] },
    { name: '카로칸', uci: ['e2e4', 'c7c6'] },
    { name: '퀸스폰', uci: ['d2d4', 'd7d5'] },
];

function scoreFor(level, match, whiteLevel, blackLevel) {
    if (match.winner === CHESS_WHITE) return whiteLevel === level ? 1 : 0;
    if (match.winner === CHESS_BLACK) return blackLevel === level ? 1 : 0;
    if (match.whiteEval >= 180) return whiteLevel === level ? 1 : 0;
    if (match.whiteEval <= -180) return blackLevel === level ? 1 : 0;
    return 0.5;
}

const rows = [];
let i = 0;
for (const open of OPENINGS) {
    for (const newIsWhite of [true, false]) {
        i += 1;
        const whiteLevel = newIsWhite ? 'choin' : 'choinOld';
        const blackLevel = newIsWhite ? 'choinOld' : 'choin';
        const start = Date.now();
        const match = playChessAiMatch({
            whiteLevel,
            blackLevel,
            whiteTime: TIME,
            blackTime: TIME,
            maxMoves: MAX,
            now: 100 + i,
            variety: i,
            startGame: chessGameFromUci(open.uci, 100 + i),
        });
        const choinScore = scoreFor('choin', match, whiteLevel, blackLevel);
        const row = {
            n: i,
            open: open.name,
            white: whiteLevel,
            black: blackLevel,
            winner: match.winner || 'draw',
            end: match.endReason || 'limit',
            moves: match.moveCount,
            eval: match.whiteEval,
            choin: choinScore,
            newDepth: Number(match.newDepth.toFixed(2)),
            oldDepth: Number(match.oldDepth.toFixed(2)),
            sec: Math.round((Date.now() - start) / 1000),
        };
        rows.push(row);
        console.log(JSON.stringify(row));
    }
}

const games = rows.length;
const choin = rows.reduce((s, r) => s + r.choin, 0);
const newDepth = rows.reduce((s, r) => s + r.newDepth, 0) / games;
const oldDepth = rows.reduce((s, r) => s + r.oldDepth, 0) / games;
const summary = {
    games,
    choin,
    old: games - choin,
    rate: choin / games,
    newDepth,
    oldDepth,
    timeMs: TIME,
    maxMoves: MAX,
};
console.log('SUMMARY', JSON.stringify(summary, null, 2));
if (choin / games < 0.7) process.exitCode = 2;
