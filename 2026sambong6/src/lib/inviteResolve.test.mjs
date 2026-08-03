import assert from 'node:assert/strict';
import { resolveInviteCodeToClassId } from './inviteResolve.js';

function ok(classId, displayName) {
    return { classId, displayName };
}

// 정상: classes 조회 1건이 권위
assert.deepEqual(
    resolveInviteCodeToClassId({
        code: 'ABC123',
        mapped: { classId: 'evil', isActive: true },
        classHits: [{ id: 'victim', inviteCode: 'ABC123', isActive: true, displayName: '6학년1반' }],
        mappedClassMeta: { inviteCode: 'ZZZZZZ', isActive: true },
    }),
    ok('victim', '6학년1반')
);

// 오염된 매핑(isActive:false) + 정상 학급 → 입장 허용
assert.deepEqual(
    resolveInviteCodeToClassId({
        code: 'ABC123',
        mapped: { classId: 'victim', isActive: false },
        classHits: [{ id: 'victim', inviteCode: 'ABC123', isActive: true }],
        mappedClassMeta: { inviteCode: 'ABC123', isActive: true },
    }),
    ok('victim')
);

// 매핑만 있고 대상 학급 inviteCode 불일치 → 거부
assert.deepEqual(
    resolveInviteCodeToClassId({
        code: 'ABC123',
        mapped: { classId: 'evil', isActive: true },
        classHits: [],
        mappedClassMeta: { inviteCode: 'OTHER1', isActive: true },
    }),
    { error: 'invite_not_found' }
);

// 매핑 + 대상 학급이 코드를 실제로 소유 → 허용
assert.deepEqual(
    resolveInviteCodeToClassId({
        code: 'ABC123',
        mapped: { classId: 'real', isActive: true },
        classHits: [],
        mappedClassMeta: { inviteCode: 'ABC123', isActive: true, displayName: '실반' },
    }),
    ok('real', '실반')
);

// 다수 학급이 동일 코드 주장 → 충돌(임의 선택 금지)
assert.deepEqual(
    resolveInviteCodeToClassId({
        code: 'ABC123',
        mapped: { classId: 'evil', isActive: true },
        classHits: [
            { id: 'victim', inviteCode: 'ABC123', isActive: true },
            { id: 'evil', inviteCode: 'ABC123', isActive: true },
        ],
        mappedClassMeta: { inviteCode: 'ABC123', isActive: true },
    }),
    { error: 'invite_conflict' }
);

// 보관된 학급만 존재
assert.deepEqual(
    resolveInviteCodeToClassId({
        code: 'ABC123',
        mapped: null,
        classHits: [{ id: 'old', inviteCode: 'ABC123', isActive: false }],
        mappedClassMeta: null,
    }),
    { error: 'class_archived' }
);

console.log('inviteResolve.test.mjs: all assertions passed');
