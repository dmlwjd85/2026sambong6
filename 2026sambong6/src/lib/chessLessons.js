/**
 * 체스 배우기: 단원·문제 목록과 정답 판정(순수 모듈, DOM 없음).
 *
 * - 학생은 늘 흰 말(백)이에요. 문제마다 작은 판(pos)을 주고, 한 수를 직접 둬 보게 해요.
 * - 둘 수 있는 수와 체크·체크메이트 판정은 실제 대국과 같은 chessGame.js 를 그대로 써요.
 * - 문제 종류
 *   · info: 읽고 「다음」을 누르는 설명
 *   · to: 정해진 칸으로 가면 정답(예: ['e4'])
 *   · goal: 'any'(둘 수 있는 아무 수) | 'check'(체크) | 'mate'(체크메이트)
 *   · from 이 있으면 그 말로 둬야 해요.
 * - 폰이 끝줄에 닿으면 배우기에서는 늘 퀸으로 바꿔요.
 */
import {
    CHESS_WHITE,
    CHESS_BLACK,
    applyChessMove,
    chessMakePiece,
    chessPieceType,
    chessRank,
    listLegalChessMoves,
    sanitizeChessGame,
} from './chessGame.js';

const START = 'wRa1 wNb1 wBc1 wQd1 wKe1 wBf1 wNg1 wRh1 wPa2 wPb2 wPc2 wPd2 wPe2 wPf2 wPg2 wPh2 '
    + 'bRa8 bNb8 bBc8 bQd8 bKe8 bBf8 bNg8 bRh8 bPa7 bPb7 bPc7 bPd7 bPe7 bPf7 bPg7 bPh7';

/** 'e4' → 칸 번호(0..63), 잘못된 이름이면 -1 */
export function lessonSq(name) {
    const s = String(name || '');
    const f = 'abcdefgh'.indexOf(s[0]);
    const r = Number(s[1]) - 1;
    if (s.length !== 2 || f < 0 || !(r >= 0 && r < 8)) return -1;
    return r * 8 + f;
}

/** 'wRa1 bKe8' → 64칸 배열 */
export function lessonCells(pos) {
    const cells = new Array(64).fill(0);
    String(pos || '').split(/\s+/).filter(Boolean).forEach((tok) => {
        const color = tok[0] === 'b' ? CHESS_BLACK : CHESS_WHITE;
        const sq = lessonSq(tok.slice(2));
        const piece = chessMakePiece(color, tok[1].toLowerCase());
        if (sq >= 0 && piece) cells[sq] = piece;
    });
    return cells;
}

export const CHESS_LESSONS = Object.freeze([
    {
        id: 'board',
        title: '체스판과 말',
        desc: '판 모양과 여섯 가지 말',
        steps: [
            { info: true, pos: START, text: '체스는 가로 8칸, 세로 8칸 판에서 둘이 겨뤄요. 흰 말(백)이 먼저 두고, 한 번씩 번갈아 둬요.' },
            { info: true, pos: START, text: '말은 여섯 가지예요. 앞줄 8개는 폰, 뒷줄은 왼쪽부터 룩·나이트·비숍·퀸·킹·비숍·나이트·룩이에요.' },
            { info: true, pos: START, text: '말마다 힘이 달라요. 폰 1, 나이트 3, 비숍 3, 룩 5, 퀸 9점쯤으로 쳐요. 킹은 잡히면 지니까 점수를 매기지 않아요.' },
            { info: true, pos: START, text: '상대 킹이 도망갈 곳 없이 공격받게 만들면 이겨요. 이걸 체크메이트라고 해요.' },
            { pos: START, from: 'e2', to: ['e4'], marks: ['e4'], text: '직접 둬 봐요. 킹 앞의 폰(e2)을 누르고, 별이 있는 칸(e4)을 눌러요.', ok: '좋아요! 말을 누르면 갈 수 있는 칸에 노란 점이 보여요.', hint: 'e2에 있는 폰을 먼저 누르고, 두 칸 앞 e4를 눌러요.' },
        ],
    },
    {
        id: 'rook',
        title: '룩',
        desc: '가로·세로로 쭉',
        steps: [
            { pos: 'wRd4 wKa1 bKh8', from: 'd4', to: ['d7'], marks: ['d7'], text: '룩은 가로와 세로로, 막히지 않으면 몇 칸이든 가요. 룩을 별 칸으로 보내요.', ok: '맞아요. 룩은 곧게 달려요.', hint: '룩을 누르면 노란 점이 십자(+) 모양으로 보여요. 별 칸을 눌러요.' },
            { pos: 'wRa1 wKh1 bPa6 bKh8', from: 'a1', to: ['a6'], text: '가는 길에 상대 말이 있으면 그 칸으로 가서 잡을 수 있어요. 빨간 고리가 잡을 수 있는 말이에요. 폰을 잡아요.', ok: '잡았어요! 잡은 말 자리에 내 말이 서요.', hint: '룩을 누르고 빨간 고리가 있는 a6 폰을 눌러요.' },
            { pos: 'wRa1 wPa2 wKh3 bNf1 bKh8', from: 'a1', to: ['f1'], text: '룩은 다른 말을 뛰어넘지 못해요. 위는 내 폰이 막고 있어요. 옆으로 가서 나이트를 잡아요.', ok: '좋아요. 막힌 쪽은 못 가고, 열린 쪽으로 가요.', hint: '위쪽은 내 폰 때문에 못 가요. 오른쪽 f1의 나이트를 잡아요.' },
        ],
    },
    {
        id: 'bishop',
        title: '비숍',
        desc: '대각선으로 쭉',
        steps: [
            { pos: 'wBc1 wKe1 bKe8', from: 'c1', to: ['g5'], marks: ['g5'], text: '비숍은 대각선으로, 막히지 않으면 몇 칸이든 가요. 별 칸으로 보내요.', ok: '맞아요. 비숍은 비스듬히 달려요.', hint: '비숍을 누르고 오른쪽 위 대각선의 별 칸(g5)을 눌러요.' },
            { pos: 'wBf1 wKg1 bRa6 bKg8', from: 'f1', to: ['a6'], text: '비숍도 가는 길의 상대 말을 잡아요. 멀리 있는 룩을 잡아요.', ok: '멋져요! 3점짜리 비숍으로 5점짜리 룩을 잡았어요.', hint: '비숍에서 왼쪽 위로 대각선을 따라가면 a6에 룩이 있어요.' },
            { info: true, pos: 'wBc1 wBf1 wKe1 bKe8', text: '비숍은 처음 선 칸의 색으로만 다녀요. 그래서 밝은 칸 비숍 하나, 어두운 칸 비숍 하나를 가지고 시작해요.' },
        ],
    },
    {
        id: 'queen',
        title: '퀸',
        desc: '룩 + 비숍, 가장 센 말',
        steps: [
            { pos: 'wQd1 wKe1 bPd7 bPh5 bKg8', from: 'd1', to: ['d7', 'h5'], text: '퀸은 룩처럼도, 비숍처럼도 가요. 가로·세로·대각선 모두요. 폰 하나를 골라 잡아요.', ok: '좋아요. 퀸은 한 번에 여러 곳을 노릴 수 있어요.', hint: '퀸을 누르면 빨간 고리가 두 개 보여요. 하나를 눌러요.' },
            { pos: 'wQa1 wKh1 bKe8', from: 'a1', goal: 'check', text: '퀸으로 상대 킹을 공격해 봐요. 킹을 공격하는 것을 체크라고 해요.', ok: '체크! 상대는 꼭 이 공격에서 벗어나야 해요.', hint: '상대 킹(e8)과 같은 줄이나 같은 대각선으로 퀸을 보내요. 예: a8, e1, a4.' },
        ],
    },
    {
        id: 'knight',
        title: '나이트',
        desc: 'ㄴ자로 뛰는 말',
        steps: [
            { pos: 'wNb1 wKe1 bKe8', from: 'b1', to: ['c3'], marks: ['c3'], text: '나이트는 ㄴ자로 뛰어요. 곧게 두 칸 가고 옆으로 한 칸이에요. 별 칸으로 보내요.', ok: '맞아요. 두 칸 + 한 칸!', hint: '나이트(b1)를 누르고 위로 두 칸, 오른쪽 한 칸인 c3를 눌러요.' },
            { pos: START, from: 'g1', to: ['f3'], marks: ['f3'], text: '나이트만 다른 말을 뛰어넘을 수 있어요. 폰들이 앞을 막고 있어도 나갈 수 있어요. g1 나이트를 별 칸으로 보내요.', ok: '폰을 훌쩍 넘었어요!', hint: '오른쪽 나이트(g1)를 누르고 f3를 눌러요.' },
            { pos: 'wNe4 wKa1 bRd6 bKh8', from: 'e4', to: ['d6'], text: '나이트는 뛰어서 내린 칸의 말을 잡아요. 룩을 잡아요.', ok: '잡았어요! 나이트는 엉뚱한 곳에서 튀어나와요.', hint: '나이트에서 위로 두 칸, 왼쪽 한 칸이 d6예요.' },
        ],
    },
    {
        id: 'king',
        title: '킹',
        desc: '한 칸씩, 가장 소중한 말',
        steps: [
            { pos: 'wKe1 bKe8', from: 'e1', goal: 'any', text: '킹은 어느 방향이든 한 칸만 가요. 킹을 아무 칸으로나 옮겨 봐요.', ok: '좋아요. 킹은 느리지만 가장 소중해요.', hint: '킹을 누르고 노란 점이 있는 칸을 눌러요.' },
            { pos: 'wKe1 bRd8 bKh8', from: 'e1', goal: 'any', text: '킹은 상대 말이 노리는 칸으로는 갈 수 없어요. 상대 룩이 d줄을 지키고 있어요. 킹을 눌러 갈 수 있는 칸을 확인하고 옮겨요.', ok: '맞아요. d1, d2에는 점이 없었죠? 룩이 노리는 칸이라서예요.', hint: '노란 점이 있는 칸만 갈 수 있어요.' },
        ],
    },
    {
        id: 'pawn',
        title: '폰',
        desc: '앞으로 한 칸, 잡을 때는 대각선',
        steps: [
            { pos: 'wPe2 wKe1 bKe8', from: 'e2', to: ['e3', 'e4'], text: '폰은 앞으로만 한 칸 가요. 뒤로는 못 가요. 처음 자리에서는 두 칸도 갈 수 있어요. 폰을 앞으로 보내요.', ok: '좋아요. 한 번 움직인 폰은 그다음부터 한 칸씩만 가요.', hint: '폰을 누르고 e3 또는 e4를 눌러요.' },
            { pos: 'wPd4 wKa1 bPd5 bPe5 bKh8', from: 'd4', to: ['e5'], text: '폰은 앞이 막히면 못 가요. 그리고 잡을 때만 대각선 앞으로 한 칸 가요. 대각선에 있는 폰을 잡아요.', ok: '맞아요. 가는 길과 잡는 길이 다른 말은 폰뿐이에요.', hint: '바로 앞 d5는 막혀 있어요. 오른쪽 대각선 앞 e5의 폰을 잡아요.' },
            { pos: 'wPb7 wKa1 bKg5', from: 'b7', to: ['b8'], text: '폰이 맨 끝줄에 닿으면 다른 말로 변신해요. 이걸 승진이라고 해요. 보통 가장 센 퀸으로 바꿔요. 폰을 끝줄로 보내요.', ok: '퀸이 됐어요! 그래서 폰을 끝까지 밀면 큰 힘이 돼요.', hint: '폰을 누르고 한 칸 앞 b8을 눌러요.' },
        ],
    },
    {
        id: 'check',
        title: '체크와 벗어나기',
        desc: '킹이 공격받으면',
        steps: [
            { pos: 'wRa1 wKg1 bKe8', from: 'a1', goal: 'check', text: '상대 킹을 공격하면 체크예요. 룩으로 체크해 봐요.', ok: '체크! 이제 상대는 다른 수를 둘 수 없고, 체크부터 풀어야 해요.', hint: '룩을 상대 킹과 같은 줄로 보내요. a8 또는 e1이에요.' },
            { pos: 'wKe1 bRe8 bKa8', from: 'e1', goal: 'any', text: '이번엔 내 킹이 체크를 받았어요(빨간 테두리). 벗어나는 방법은 세 가지예요. 첫째, 킹이 피해요. 킹을 안전한 칸으로 옮겨요.', ok: '피했어요! e줄만 벗어나면 안전해요.', hint: '킹을 누르고 노란 점이 있는 칸으로 옮겨요.' },
            { pos: 'wKe1 wBc1 bRe8 bKa8', from: 'c1', to: ['e3'], text: '둘째, 길을 막아요. 비숍을 킹과 룩 사이에 놓아 체크를 막아요.', ok: '막았어요! 다만 나이트의 체크는 뛰어넘으니 막을 수 없어요.', hint: '비숍(c1)을 누르고 e줄 위의 e3를 눌러요.' },
            { pos: 'wKe1 wNc7 bRe8 bKh5', from: 'c7', to: ['e8'], text: '셋째, 체크하는 말을 잡아요. 나이트로 룩을 잡아요.', ok: '잡았어요! 피하기·막기·잡기, 세 가지를 기억해요.', hint: '나이트(c7)를 누르고 빨간 고리가 있는 e8 룩을 눌러요.' },
        ],
    },
    {
        id: 'mate',
        title: '체크메이트',
        desc: '이기는 방법',
        steps: [
            { info: true, pos: 'wRa8 wKg1 bKg8 bPf7 bPg7 bPh7', text: '체크인데 피할 수도, 막을 수도, 잡을 수도 없으면 체크메이트예요. 판이 끝나고 공격한 쪽이 이겨요. 지금 흑 킹은 자기 폰에 갇혀서 도망갈 곳이 없어요.' },
            { pos: 'wRa1 wKg1 bKg8 bPf7 bPg7 bPh7', goal: 'mate', text: '직접 해 봐요. 한 수로 체크메이트를 만들어요.', ok: '체크메이트! 킹이 자기 폰 뒤에 갇혔어요. 이런 모양을 조심해요.', hint: '룩을 맨 윗줄(a8)로 보내요.' },
            { pos: 'wRa7 wRb1 wKg1 bKh8', goal: 'mate', text: '룩 두 개로 사다리를 만들어요. 한 룩이 윗줄 바로 아래를 막고 있어요. 한 수로 체크메이트를 만들어요.', ok: '체크메이트! 룩 둘이 한 줄씩 막으며 킹을 몰아요.', hint: '아래에 있는 룩(b1)을 맨 윗줄 b8로 보내요.' },
            { pos: 'wQa7 wKg6 bKh8', goal: 'mate', text: '퀸과 킹이 힘을 합쳐요. 내 킹이 퀸을 지켜 주면 상대 킹이 퀸을 못 잡아요. 한 수로 체크메이트를 만들어요.', ok: '체크메이트! 퀸 혼자서는 못 하고, 킹이 도와줘야 해요.', hint: '퀸을 내 킹이 지켜 주는 칸(g7 또는 h7)으로 보내요.' },
        ],
    },
    {
        id: 'draw',
        title: '비기는 경우',
        desc: '스테일메이트를 조심해요',
        steps: [
            { info: true, pos: 'wQb6 wKc7 bKa8', text: '체크가 아닌데 둘 수 있는 수가 하나도 없으면 스테일메이트예요. 이기던 판도 비겨요. 지금 흑 킹은 공격받지 않지만 갈 수 있는 칸이 없어요. 흑 차례라면 비겨요.' },
            { pos: 'wQc5 wKc7 bKa8', goal: 'mate', text: '거의 다 이긴 판이에요. 스테일메이트가 되지 않게, 꼭 체크하면서 끝내요. 한 수로 체크메이트를 만들어요.', ok: '체크메이트! 마지막 한 수는 꼭 체크인지 확인해요.', hint: '퀸을 a줄(a5 또는 a3)로 보내 체크해요. b6로 가면 비겨요.' },
            { info: true, pos: 'wKe1 bKe8', text: '그 밖에도 킹만 남았을 때, 같은 모양이 세 번 나왔을 때, 50수 동안 아무것도 잡지 않고 폰도 안 움직였을 때 비겨요.' },
        ],
    },
    {
        id: 'special',
        title: '특별한 수',
        desc: '캐슬링과 앙파상',
        steps: [
            { pos: 'wKe1 wRh1 wPf2 wPg2 wPh2 bKe8', castling: 'K', from: 'e1', to: ['g1'], marks: ['g1'], text: '캐슬링은 킹을 안전하게 숨기는 수예요. 킹이 룩 쪽으로 두 칸 가고, 룩이 킹을 넘어와 옆에 서요. 킹을 누르고 별 칸을 눌러요.', ok: '캐슬링! 킹과 그 룩이 한 번도 안 움직였고, 사이가 비어 있고, 체크가 아닐 때만 할 수 있어요.', hint: '킹(e1)을 누르고 두 칸 옆 g1을 눌러요.' },
            { pos: 'wPe5 wKe1 bPd5 bKe8', ep: 'd6', last: ['d7', 'd5'], from: 'e5', to: ['d6'], text: '앙파상은 폰만의 특별한 잡기예요. 상대 폰이 방금 두 칸을 뛰어 내 폰 옆에 섰어요. 바로 다음 수에만, 한 칸 간 것처럼 대각선으로 잡을 수 있어요.', ok: '앙파상! 내 폰은 대각선으로 가고, 옆에 있던 폰이 사라져요.', hint: '내 폰(e5)을 누르고 왼쪽 대각선 앞 d6를 눌러요.' },
        ],
    },
    {
        id: 'final',
        title: '마무리 문제',
        desc: '배운 것을 써 봐요',
        steps: [
            {
                pos: 'wRa1 wNb1 wBc1 wKe1 wNg1 wRh1 wQh5 wBc4 wPa2 wPb2 wPc2 wPd2 wPe4 wPf2 wPg2 wPh2 '
                    + 'bRa8 bBc8 bQd8 bKe8 bBf8 bRh8 bNc6 bNf6 bPa7 bPb7 bPc7 bPd7 bPe5 bPf7 bPg7 bPh7',
                goal: 'mate',
                text: '실제 대국에서 자주 나오는 함정이에요. 퀸과 비숍이 같은 칸을 노리고 있어요. 한 수로 체크메이트를 만들어요.',
                ok: '체크메이트! 4수 만에 끝나는 「학자의 메이트」예요. 내가 당하지 않으려면 킹 옆 f줄 폰을 잘 지켜요.',
                hint: '퀸(h5)과 비숍(c4)이 함께 노리는 f7 폰을 퀸으로 잡아요.',
            },
            { pos: 'wRd1 wKg1 wPf2 wPg2 wPh2 bRa2 bKg8 bPf7 bPg7 bPh7', goal: 'mate', text: '두 킹 모두 폰 뒤에 숨어 있어요. 내 차례예요. 먼저 치는 쪽이 이겨요. 한 수로 체크메이트를 만들어요.', ok: '체크메이트! 내 킹도 같은 모양이라, 한 수 늦었으면 내가 졌을 거예요.', hint: '룩을 맨 윗줄 d8로 보내요.' },
            { info: true, pos: START, text: '체스 배우기를 모두 마쳤어요! 이제 AI나 친구와 진짜 대국을 해 봐요. 처음에는 가운데 폰을 내고, 나이트와 비숍을 꺼내고, 캐슬링으로 킹을 숨기면 좋아요.' },
        ],
    },
]);

/** 문제의 판을 실제 대국과 같은 game 으로 만들어요(백 차례). */
export function lessonGame(step) {
    const s = step || {};
    const last = Array.isArray(s.last) ? { from: lessonSq(s.last[0]), to: lessonSq(s.last[1]) } : null;
    return sanitizeChessGame({
        cells: lessonCells(s.pos),
        turn: CHESS_WHITE,
        castling: s.castling || '',
        ep: s.ep ? lessonSq(s.ep) : -1,
        lastMove: last,
    });
}

/**
 * 학생이 둔 수를 판정해요.
 * @returns {{ ok: boolean, reason: ''|'info'|'illegal'|'piece'|'wrong'|'stalemate', game: object|null }}
 *   game: 수를 둔 뒤의 판(둘 수 없는 수면 null)
 */
export function judgeLessonMove(step, from, to) {
    if (!step || step.info) return { ok: false, reason: 'info', game: null };
    const game = lessonGame(step);
    const fr = Math.floor(Number(from));
    const tr = Math.floor(Number(to));
    const needPromo = chessPieceType(game.cells[fr]) === 'p' && chessRank(tr) === 7;
    const res = applyChessMove(game, { from: fr, to: tr, promo: needPromo ? 'q' : '', color: CHESS_WHITE, now: 0 });
    if (!res.ok) return { ok: false, reason: 'illegal', game: null };
    const next = res.game;
    if (step.from && lessonSq(step.from) !== fr) return { ok: false, reason: 'piece', game: next };
    let ok;
    if (Array.isArray(step.to)) ok = step.to.some((name) => lessonSq(name) === tr);
    else if (step.goal === 'mate') ok = next.endReason === 'checkmate';
    else if (step.goal === 'check') ok = next.inCheck === true || next.endReason === 'checkmate';
    else ok = step.goal === 'any';
    if (ok) return { ok: true, reason: '', game: next };
    return { ok: false, reason: next.endReason === 'stalemate' ? 'stalemate' : 'wrong', game: next };
}

/** 이 문제의 정답 수 목록({from,to}). 힌트 표시와 테스트에 써요. */
export function lessonSolutions(step) {
    if (!step || step.info) return [];
    const game = lessonGame(step);
    const seen = new Set();
    const out = [];
    listLegalChessMoves(game, CHESS_WHITE).forEach((mv) => {
        const key = `${mv.from}-${mv.to}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (judgeLessonMove(step, mv.from, mv.to).ok) out.push({ from: mv.from, to: mv.to });
    });
    return out;
}

/** 틀렸을 때 보여 줄 말 */
export function lessonWrongText(step, reason) {
    if (reason === 'stalemate') return '앗, 스테일메이트예요. 체크가 아닌데 상대가 둘 수 있는 수가 없어서 비겨요. 다시 해 봐요.';
    if (reason === 'piece') return `이번에는 다른 말로 둬 봐요. ${step && step.hint ? step.hint : ''}`.trim();
    if (reason === 'illegal') return '그 칸으로는 갈 수 없어요. 말을 누르면 갈 수 있는 칸에 노란 점이 보여요.';
    return step && step.hint ? step.hint : '다시 해 봐요.';
}

/* ---------- 진도(기기에 저장) ---------- */

export const CHESS_LESSON_STORE_KEY = 'sambong_chess_learn_v1';

/** 저장된 글자를 끝낸 단원 id 목록으로 바꿔요(모르는 id는 버려요). */
export function parseLessonProgress(raw) {
    let list = [];
    try {
        const v = JSON.parse(String(raw || '[]'));
        if (Array.isArray(v)) list = v;
    } catch (_) { list = []; }
    const known = new Set(CHESS_LESSONS.map((l) => l.id));
    return [...new Set(list.map((x) => String(x)).filter((id) => known.has(id)))];
}

export function addLessonProgress(done, id) {
    return parseLessonProgress(JSON.stringify([...(Array.isArray(done) ? done : []), id]));
}

/** 아직 안 끝낸 첫 단원 번호(모두 끝냈으면 -1) */
export function nextLessonIndex(done) {
    const set = new Set(Array.isArray(done) ? done : []);
    return CHESS_LESSONS.findIndex((l) => !set.has(l.id));
}
