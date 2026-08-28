import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    addCandidateToPosition,
    appendBallot,
    canStartVoting,
    collectBallotsFromStudentRows,
    createElectionState,
    mergeBallotLists,
    recordStudentPick,
    resolveNumericVote,
    resolveNumericVoteOnTimeout,
    sanitizeElectionState,
    sanitizeStudentBallot,
    shuffleCopy,
    tallyBallots,
    toPublishedElection,
    undoLastBallot,
} from './classElection.js';

describe('후보 번호 즉시 투표', () => {
    it('1~9만 있으면 한 자리 입력으로 바로 투표한다', () => {
        assert.deepEqual(resolveNumericVote('2', [1, 2, 3]), { status: 'cast', number: 2 });
    });

    it('1과 10이 함께 있으면 1은 대기한다', () => {
        const r = resolveNumericVote('1', [1, 10]);
        assert.equal(r.status, 'pending');
        assert.equal(r.number, 1);
    });

    it('10을 모두 입력하면 즉시 투표한다', () => {
        assert.deepEqual(resolveNumericVote('10', [1, 10]), { status: 'cast', number: 10 });
    });

    it('없는 번호 접두면 무효다', () => {
        assert.equal(resolveNumericVote('9', [1, 2, 3]).status, 'invalid');
    });

    it('입력 멈춤 후에는 1을 1번 표로 확정한다', () => {
        assert.deepEqual(resolveNumericVoteOnTimeout('1', [1, 10]), { status: 'cast', number: 1 });
        assert.equal(resolveNumericVoteOnTimeout('9', [1, 10]).status, 'invalid');
    });
});

describe('집계와 동점', () => {
    const cands = [
        { id: 'a', name: '김단엘', number: 1 },
        { id: 'b', name: '백시율', number: 2 },
        { id: 'c', name: '박하율', number: 3 },
    ];

    it('표를 세고 1등을 가린다', () => {
        const t = tallyBallots([2, 1, 2, 2, 3], cands);
        assert.equal(t.total, 5);
        assert.equal(t.ranked[0].name, '백시율');
        assert.equal(t.ranked[0].votes, 3);
        assert.equal(t.isTie, false);
        assert.equal(t.winners[0].number, 2);
    });

    it('최고표가 같으면 동점이다', () => {
        const t = tallyBallots([1, 2, 1, 2], cands);
        assert.equal(t.isTie, true);
        assert.equal(t.winners.length, 2);
    });

    it('표가 없으면 빈 결과다', () => {
        const t = tallyBallots([], cands);
        assert.equal(t.isEmpty, true);
        assert.equal(t.winners.length, 0);
    });
});

describe('선거 상태', () => {
    it('후보 2명 미만이면 투표를 시작하지 않는다', () => {
        const st = createElectionState();
        assert.equal(canStartVoting(st).ok, false);
        const added = addCandidateToPosition(st.positions[0], '김단엘');
        st.positions[0] = added.position;
        assert.equal(canStartVoting(st).ok, false);
    });

    it('표 추가·직전 취소가 동작한다', () => {
        let st = createElectionState({
            positions: [{
                id: 'pos_chair',
                name: '학급회장',
                candidates: [
                    { id: 'a', name: '김단엘', number: 1 },
                    { id: 'b', name: '백시율', number: 2 },
                ],
            }],
        });
        st = appendBallot(st, 'pos_chair', 1);
        st = appendBallot(st, 'pos_chair', 2);
        assert.deepEqual(st.ballots.pos_chair, [1, 2]);
        st = undoLastBallot(st, 'pos_chair');
        assert.deepEqual(st.ballots.pos_chair, [1]);
    });

    it('0은 후보 번호가 될 수 없다', () => {
        assert.equal(resolveNumericVote('0', [1, 2, 3]).status, 'invalid');
    });

    it('같은 이름 후보는 거절한다', () => {
        const pos = { id: 'p', name: '회장', candidates: [] };
        const a = addCandidateToPosition(pos, '김단엘');
        const b = addCandidateToPosition(a.position, '김단엘');
        assert.equal(b.ok, false);
        assert.equal(b.reason, 'duplicate');
    });

    it('저장본에서 없는 번호 표는 버린다', () => {
        const st = sanitizeElectionState({
            positions: [{
                id: 'p',
                name: '회장',
                candidates: [{ name: 'A', number: 1 }, { name: 'B', number: 2 }],
            }],
            ballots: { p: [1, 9, 2, 0] },
            phase: 'vote',
        });
        assert.deepEqual(st.ballots.p, [1, 2]);
    });
});

describe('개표 순서 섞기', () => {
    it('원본 배열을 바꾸지 않고 같은 원소를 유지한다', () => {
        const src = [1, 2, 2, 3];
        const out = shuffleCopy(src, () => 0.2);
        assert.deepEqual(src, [1, 2, 2, 3]);
        assert.equal(out.length, 4);
        assert.deepEqual([...out].sort(), [1, 2, 2, 3]);
    });
});

describe('학생별 비밀 투표', () => {
    const positions = [{
        id: 'pos_chair',
        name: '학급회장',
        candidates: [
            { id: 'a', name: '김단엘', number: 1 },
            { id: 'b', name: '백시율', number: 2 },
        ],
    }];

    it('같은 학생은 마지막 선택만 남긴다', () => {
        let ballot = { sessionId: '', picks: {} };
        ballot = recordStudentPick(ballot, 'el_1', 'pos_chair', 1, positions).ballot;
        ballot = recordStudentPick(ballot, 'el_1', 'pos_chair', 2, positions).ballot;
        assert.equal(ballot.picks.pos_chair, 2);
        const collected = collectBallotsFromStudentRows(
            [{ id: '6', classElectionVote: ballot }],
            'el_1',
            positions
        );
        assert.deepEqual(collected.ballots.pos_chair, [2]);
        assert.deepEqual(collected.voterIdsByPosition.pos_chair, ['6']);
    });

    it('다른 세션 표는 버린다', () => {
        const collected = collectBallotsFromStudentRows(
            [{ id: '6', classElectionVote: { sessionId: 'old', picks: { pos_chair: 1 } } }],
            'el_1',
            positions
        );
        assert.deepEqual(collected.ballots.pos_chair, []);
    });

    it('없는 후보 번호는 저장하지 않는다', () => {
        const r = recordStudentPick({ sessionId: '', picks: {} }, 'el_1', 'pos_chair', 9, positions);
        assert.equal(r.ok, false);
        assert.deepEqual(sanitizeStudentBallot({ sessionId: 'el_1', picks: { pos_chair: 9 } }, positions).picks, {});
    });

    it('학생 표와 현장 추가표를 합친다', () => {
        const merged = mergeBallotLists({ pos_chair: [1, 2] }, { pos_chair: [1] }, positions);
        assert.deepEqual(merged.pos_chair, [1, 2, 1]);
    });

    it('투표 중 공개본에는 득표를 넣지 않는다', () => {
        const pub = toPublishedElection({
            phase: 'vote',
            sessionId: 'el_1',
            positions,
            ballots: { pos_chair: [1, 2, 2] },
        });
        assert.deepEqual(pub.ballots.pos_chair, []);
        const counted = toPublishedElection({
            phase: 'count',
            sessionId: 'el_1',
            positions,
            ballots: { pos_chair: [1, 2, 2] },
        });
        assert.deepEqual(counted.ballots.pos_chair, [1, 2, 2]);
    });
});
