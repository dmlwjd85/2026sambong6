import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHESS_LESSONS,
    addLessonProgress,
    judgeLessonMove,
    lessonCells,
    lessonGame,
    lessonSolutions,
    lessonSq,
    lessonWrongText,
    nextLessonIndex,
    parseLessonProgress,
} from './chessLessons.js';
import { chessIsInCheck, chessPieceColor, chessPieceType, isSquareAttacked, listLegalChessMoves } from './chessGame.js';

const each = (fn) => CHESS_LESSONS.forEach((lesson) => lesson.steps.forEach((step, i) => fn(step, `${lesson.id}#${i + 1}`, lesson)));

describe('체스 배우기 문제', () => {
    it('칸 이름을 번호로 바꿔요', () => {
        assert.equal(lessonSq('a1'), 0);
        assert.equal(lessonSq('h8'), 63);
        assert.equal(lessonSq('e4'), 28);
        assert.equal(lessonSq('z9'), -1);
    });

    it('단원 id는 겹치지 않고, 모든 문제에 설명이 있어요', () => {
        const ids = CHESS_LESSONS.map((l) => l.id);
        assert.equal(new Set(ids).size, ids.length);
        each((step, where) => {
            assert.ok(step.text && step.text.length > 10, `${where} 설명`);
            if (!step.info) {
                assert.ok(step.ok, `${where} 정답 문구`);
                assert.ok(step.hint, `${where} 힌트`);
            }
        });
    });

    it('모든 판에 두 킹이 하나씩 있고, 흑 킹이 이미 잡힐 자리에 있지 않아요', () => {
        each((step, where) => {
            const cells = lessonCells(step.pos);
            const kings = (color) => cells.filter((p) => chessPieceType(p) === 'k' && chessPieceColor(p) === color).length;
            assert.equal(kings('w'), 1, `${where} 백 킹`);
            assert.equal(kings('b'), 1, `${where} 흑 킹`);
            if (step.info) return; // 설명용 판(체크메이트·스테일메이트 보기)은 흑 차례 모양일 수 있어요
            const bk = cells.findIndex((p) => chessPieceType(p) === 'k' && chessPieceColor(p) === 'b');
            assert.equal(isSquareAttacked(cells, bk, 'w'), false, `${where} 백 차례인데 흑 킹이 체크`);
        });
    });

    it('모든 문제에 정답이 있고, 정해 둔 칸은 실제로 둘 수 있어요', () => {
        each((step, where) => {
            if (step.info) return;
            const sols = lessonSolutions(step);
            assert.ok(sols.length >= 1, `${where} 정답 없음`);
            if (Array.isArray(step.to)) {
                step.to.forEach((name) => {
                    assert.ok(sols.some((s) => s.to === lessonSq(name)), `${where} ${name} 로 둘 수 없음`);
                });
            }
            if (step.from) assert.ok(sols.every((s) => s.from === lessonSq(step.from)), `${where} from`);
            (step.marks || []).forEach((m) => assert.ok(lessonSq(m) >= 0, `${where} 별 칸`));
        });
    });

    it('체크메이트 문제는 정답을 두면 판이 끝나요', () => {
        each((step, where) => {
            if (step.goal !== 'mate') return;
            lessonSolutions(step).forEach((s) => {
                const r = judgeLessonMove(step, s.from, s.to);
                assert.equal(r.game.endReason, 'checkmate', where);
                assert.equal(r.game.winner, 'w', where);
            });
        });
    });

    it('설명용 판이 말하는 내용과 맞아요(체크메이트·스테일메이트)', () => {
        const mate = CHESS_LESSONS.find((l) => l.id === 'mate').steps[0];
        const g1 = { ...lessonGame(mate), turn: 'b' };
        assert.equal(chessIsInCheck(g1, 'b'), true);
        assert.equal(listLegalChessMoves(g1, 'b').length, 0);
        const stale = CHESS_LESSONS.find((l) => l.id === 'draw').steps[0];
        const g2 = { ...lessonGame(stale), turn: 'b' };
        assert.equal(chessIsInCheck(g2, 'b'), false);
        assert.equal(listLegalChessMoves(g2, 'b').length, 0);
    });

    it('틀린 수·둘 수 없는 수·다른 말을 가려요', () => {
        const rook = CHESS_LESSONS.find((l) => l.id === 'rook').steps[0];
        assert.equal(judgeLessonMove(rook, lessonSq('d4'), lessonSq('d7')).ok, true);
        assert.equal(judgeLessonMove(rook, lessonSq('d4'), lessonSq('d5')).reason, 'wrong');
        assert.equal(judgeLessonMove(rook, lessonSq('d4'), lessonSq('e5')).reason, 'illegal');
        assert.equal(judgeLessonMove(rook, lessonSq('a1'), lessonSq('a2')).reason, 'piece');
        assert.ok(lessonWrongText(rook, 'wrong').includes('별'));
    });

    it('스테일메이트로 비기는 수는 따로 알려 줘요', () => {
        const step = CHESS_LESSONS.find((l) => l.id === 'draw').steps[1];
        const r = judgeLessonMove(step, lessonSq('c5'), lessonSq('b6'));
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'stalemate');
        assert.ok(lessonWrongText(step, 'stalemate').includes('스테일메이트'));
    });

    it('특별한 수: 승진은 퀸, 캐슬링은 룩이 넘어오고, 앙파상은 옆 폰이 사라져요', () => {
        const promo = CHESS_LESSONS.find((l) => l.id === 'pawn').steps[2];
        const p = judgeLessonMove(promo, lessonSq('b7'), lessonSq('b8'));
        assert.equal(chessPieceType(p.game.cells[lessonSq('b8')]), 'q');
        const [castle, ep] = CHESS_LESSONS.find((l) => l.id === 'special').steps;
        const c = judgeLessonMove(castle, lessonSq('e1'), lessonSq('g1'));
        assert.equal(c.ok, true);
        assert.equal(chessPieceType(c.game.cells[lessonSq('f1')]), 'r');
        const e = judgeLessonMove(ep, lessonSq('e5'), lessonSq('d6'));
        assert.equal(e.ok, true);
        assert.equal(e.game.cells[lessonSq('d5')], 0);
    });
});

describe('체스 배우기 진도', () => {
    it('모르는 값은 버리고 겹치지 않게 저장해요', () => {
        assert.deepEqual(parseLessonProgress('["rook","rook","zzz"]'), ['rook']);
        assert.deepEqual(parseLessonProgress('{bad'), []);
        assert.deepEqual(addLessonProgress(['board'], 'rook'), ['board', 'rook']);
        assert.deepEqual(addLessonProgress(['board'], 'board'), ['board']);
    });

    it('다음에 할 단원을 알려 줘요', () => {
        assert.equal(nextLessonIndex([]), 0);
        assert.equal(nextLessonIndex(['board']), 1);
        assert.equal(nextLessonIndex(CHESS_LESSONS.map((l) => l.id)), -1);
    });
});
