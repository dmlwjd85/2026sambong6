import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildClassAccessPayload,
    canClaimClassOwnership,
    classOwnerClaimPatch,
    inviteCodeFromRecentClasses,
    isLikelyInviteCode,
    normalizeInviteCode,
    resolveBootInvite,
    safeClassId,
} from './classAccess.js';
import { buildGenericDemoRoster, genericStudentNameMap } from './demoRoster.js';

describe('학급 입장 권한', () => {
    it('초대 코드와 학급 ID를 정리한다', () => {
        assert.equal(normalizeInviteCode(' ab12 '), 'AB12');
        assert.equal(isLikelyInviteCode('A3K9MP'), true);
        assert.equal(isLikelyInviteCode('no'), false);
        assert.equal(safeClassId('sambong-2026-6-1-ab12'), 'sambong-2026-6-1-ab12');
        assert.equal(safeClassId('../x'), '');
    });

    it('초대 코드가 있어야 입장 문서를 만든다', () => {
        const miss = buildClassAccessPayload({ uid: 'u1', classId: 'c1', inviteCode: '' });
        assert.equal(miss.ok, false);
        const ok = buildClassAccessPayload({ uid: 'u1', classId: 'c1', inviteCode: 'ab12cd' });
        assert.equal(ok.ok, true);
        assert.equal(ok.access.inviteCode, 'AB12CD');
        assert.equal(ok.access.role, 'student');
    });

    it('최근 학급·URL에서 초대 코드를 찾고 시드를 기본값으로 쓰지 않는다', () => {
        const recent = [{ classId: 'c1', inviteCode: 'aa11bb' }];
        assert.equal(inviteCodeFromRecentClasses(recent, 'c1'), 'AA11BB');
        assert.equal(resolveBootInvite({ recentEntries: recent, classId: 'c1' }), 'AA11BB');
        assert.equal(resolveBootInvite({ urlInvite: 'zz99yy', classId: 'c1' }), 'ZZ99YY');
        assert.equal(resolveBootInvite({ classId: 'sambong-class-2026' }), '');
    });

    it('주인 없는 학급은 gm PIN을 맞힌 교사만 가져갈 수 있다', () => {
        assert.equal(canClaimClassOwnership({}, 'uid-1'), false);
        assert.equal(canClaimClassOwnership({ ownerUid: '' }, 'uid-1'), false);
        assert.equal(canClaimClassOwnership({ ownerUid: '' }, 'uid-1', { gmPinVerified: true }), true);
        assert.equal(canClaimClassOwnership({ ownerUid: 'uid-1' }, 'uid-1'), true);
        assert.equal(canClaimClassOwnership({ ownerUid: 'uid-2' }, 'uid-1', { gmPinVerified: true }), false);
        const patch = classOwnerClaimPatch({ uid: 'uid-1', email: 't@school.kr' }, 10);
        assert.equal(patch.ownerUid, 'uid-1');
        assert.equal(patch.ownerEmail, 't@school.kr');
    });
});

describe('데모 명단', () => {
    it('실명 없이 학생 N 형식으로만 만든다', () => {
        const roster = buildGenericDemoRoster(3);
        assert.equal(roster[0].name, '학생 1');
        assert.equal(roster[2].name, '학생 3');
        const names = Object.values(genericStudentNameMap(2)).join(' ');
        assert.equal(names.includes('김'), false);
        assert.equal(names.includes('황'), false);
    });
});
