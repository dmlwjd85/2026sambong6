/**
 * 새 초인 vs PR #14 초인 장대국.
 * TIME_MS·MAX_MOVES 환경 변수로 조절합니다.
 */
import {
    chessGameFromUci,
    playChessAiMatch,
} from '../src/lib/chessAi.js';
import { CHESS_BLACK, CHESS_WHITE } from '../src/lib/chessGame.js';

const TIME = Math.max(80, Number(process.env.TIME_MS) || 700);
const NEW_TIME = Math.max(80, Number(process.env.NEW_TIME_MS) || TIME);
const OLD_TIME = Math.max(80, Number(process.env.OLD_TIME_MS) || TIME);
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
            whiteTime: newIsWhite ? NEW_TIME : OLD_TIME,
            blackTime: newIsWhite ? OLD_TIME : NEW_TIME,
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
            newTime: Math.round(match.newTime || 0),
            oldTime: Math.round(match.oldTime || 0),
            sec: Math.round((Date.now() - start) / 1000),
        };
        rows.push(row);
        console.log(JSON.stringify(row));
    }
}

const games = rows.length;
const wins = rows.filter((r) => r.choin === 1).length;
const losses = rows.filter((r) => r.choin === 0).length;
const draws = rows.filter((r) => r.choin === 0.5).length;
const choin = rows.reduce((s, r) => s + r.choin, 0);
const summary = {
    games,
    win: wins,
    draw: draws,
    loss: losses,
    score: choin,
    rate: choin / games,
    newDepth: rows.reduce((s, r) => s + r.newDepth, 0) / games,
    oldDepth: rows.reduce((s, r) => s + r.oldDepth, 0) / games,
    newTimeMs: rows.reduce((s, r) => s + r.newTime, 0) / games,
    oldTimeMs: rows.reduce((s, r) => s + r.oldTime, 0) / games,
    newThinkMs: NEW_TIME,
    oldThinkMs: OLD_TIME,
    timeMs: TIME,
    maxMoves: MAX,
};
console.log('SUMMARY', JSON.stringify(summary, null, 2));
if (choin / games < 0.7) process.exitCode = 2;
