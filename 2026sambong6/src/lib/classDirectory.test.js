import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_MASTER_CLASS_ID } from './classCreateRequest.js';
import {
    canArchiveManagedClass,
    canResetManagedClass,
    classDirectoryStatusLabel,
    mergeClassDirectory,
    safeManagedClassId,
    sanitizeClassDirectoryEntry,
    shouldRotateMasterPinOnReset,
    sortClassDirectory,
} from './classDirectory.js';

describe('학급 관리 목록', () => {
    it('학급 ID는 영숫자·점·밑줄·하이픈만 통과한다', () => {
        assert.equal(safeManagedClassId('sambong-class-2026'), 'sambong-class-2026');
        assert.equal(safeManagedClassId("a';alert(1)"), '');
        assert.equal(safeManagedClassId(''), '');
    });

    it('시드 마스터는 다른 반도 초기화·보관할 수 있다', () => {
        const gm = { isGM: true };
        assert.equal(canResetManagedClass(gm, SEED_MASTER_CLASS_ID, 'test-class'), true);
        assert.equal(canArchiveManagedClass(gm, SEED_MASTER_CLASS_ID, 'test-class'), true);
        assert.equal(canArchiveManagedClass(gm, SEED_MASTER_CLASS_ID, SEED_MASTER_CLASS_ID), false);
        assert.equal(shouldRotateMasterPinOnReset('test-class'), true);
        assert.equal(shouldRotateMasterPinOnReset(SEED_MASTER_CLASS_ID), false);
    });

    it('다른 반 마스터는 지금 반만 초기화한다', () => {
        const gm = { isGM: true };
        assert.equal(canResetManagedClass(gm, 'test-class', 'test-class'), true);
        assert.equal(canResetManagedClass(gm, 'test-class', 'other-class'), false);
        assert.equal(canResetManagedClass({ isGM: false }, SEED_MASTER_CLASS_ID, 'test-class'), false);
    });

    it('운영·보관 상태를 붙이고 지금 반을 앞에 둔다', () => {
        const seed = sanitizeClassDirectoryEntry({ displayName: '시드', isDemoSeed: true, isActive: true }, SEED_MASTER_CLASS_ID);
        const archived = sanitizeClassDirectoryEntry({ displayName: '시험반', inviteCode: 'abc12', isActive: false }, 'test-class');
        assert.equal(classDirectoryStatusLabel(seed), '시드');
        assert.equal(classDirectoryStatusLabel(archived), '보관됨');
        assert.equal(archived.inviteCode, 'ABC12');
        const sorted = sortClassDirectory([archived, seed], 'test-class');
        assert.equal(sorted[0].classId, 'test-class');
        assert.equal(sorted[1].classId, SEED_MASTER_CLASS_ID);
    });

    it('서버 목록과 최근 학급을 학급 ID로 합친다', () => {
        const merged = mergeClassDirectory(
            [{ classId: 'a', displayName: '서버이름', inviteCode: 'AAAAAA' }],
            [{ classId: 'a', displayName: '예전이름' }, { classId: 'b', displayName: '최근만' }],
            { classId: 'c', displayName: '지금' },
        );
        const ids = merged.map((r) => r.classId).sort();
        assert.deepEqual(ids, ['a', 'b', 'c']);
        assert.equal(merged.find((r) => r.classId === 'a').displayName, '서버이름');
    });
});
