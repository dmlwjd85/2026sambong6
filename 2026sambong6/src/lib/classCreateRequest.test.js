import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLASS_CREATE_REQUEST_STORAGE_KEY,
    SEED_MASTER_CLASS_ID,
    applyClassCreateApproval,
    applyClassCreateRejection,
    buildClassCreateRequest,
    canCreateClassImmediately,
    classCreateRequestStatusLabel,
    classCreateWorkspacePayload,
    isSeedMasterViewer,
    pendingClassCreateRequests,
    readStoredClassCreateRequestId,
    sanitizeClassCreateRequest,
    validateClassCreateRequestDraft,
    writeStoredClassCreateRequestId,
} from './classCreateRequest.js';

describe('학급 개설 인증 요청', () => {
    it('시드 마스터만 바로 만들고, 나머지는 요청한다', () => {
        assert.equal(SEED_MASTER_CLASS_ID, 'sambong-class-2026');
        assert.equal(isSeedMasterViewer({ isGM: true }, SEED_MASTER_CLASS_ID), true);
        assert.equal(canCreateClassImmediately({ isGM: true }, SEED_MASTER_CLASS_ID), true);
        assert.equal(canCreateClassImmediately({ isGM: true, isAdmin: true }, 'other-class'), false);
        assert.equal(canCreateClassImmediately({ isGMA: true, isAdmin: true }, SEED_MASTER_CLASS_ID), false);
        assert.equal(canCreateClassImmediately({ isGM: false }, SEED_MASTER_CLASS_ID), false);
    });

    it('로그인 개설은 학급명과 PIN이 있어야 요청된다', () => {
        const noName = validateClassCreateRequestDraft({
            requesterHint: 'login',
            teacherPin: '1234',
        });
        assert.equal(noName.ok, false);
        assert.equal(noName.reason, 'displayName');
        const noPin = validateClassCreateRequestDraft({
            displayName: '해오름 6-2',
            requesterHint: 'login',
        });
        assert.equal(noPin.ok, false);
        assert.equal(noPin.reason, 'teacherPin');
        const built = buildClassCreateRequest({
            displayName: '해오름 6-2',
            schoolName: '해오름초',
            schoolYear: 2026,
            grade: 6,
            homeroom: 2,
            teacherName: '김선생',
            studentCount: 24,
            teacherPin: '4321',
            requesterHint: 'login',
        }, 100);
        assert.equal(built.ok, true);
        assert.equal(built.request.status, 'pending');
        assert.match(built.request.id, /^ccr_/);
        assert.equal(built.request.teacherPin, '4321');
        assert.equal(built.request.requestedAt, 100);
        assert.equal(built.request.newClassId, '');
    });

    it('허락되면 반이 생기고, 거절·중복 처리는 건너뛴다', () => {
        const pending = sanitizeClassCreateRequest({
            id: 'ccr_1',
            displayName: '새 반',
            teacherPin: '1111',
            status: 'pending',
            copyFromClassId: 'src-class',
        });
        const approved = applyClassCreateApproval(
            pending,
            { newClassId: 'new-class', inviteCode: 'ab12' },
            SEED_MASTER_CLASS_ID,
            9,
        );
        assert.equal(approved.skip, false);
        assert.equal(approved.request.status, 'approved');
        assert.equal(approved.request.newClassId, 'new-class');
        assert.equal(approved.request.inviteCode, 'AB12');
        assert.equal(approved.request.reviewedByClassId, SEED_MASTER_CLASS_ID);
        const again = applyClassCreateApproval(approved.request, { newClassId: 'x' }, SEED_MASTER_CLASS_ID, 10);
        assert.equal(again.skip, true);
        const rejected = applyClassCreateRejection(pending, '정보가 부족합니다', SEED_MASTER_CLASS_ID, 11);
        assert.equal(rejected.skip, false);
        assert.equal(rejected.request.status, 'rejected');
        assert.equal(rejected.request.rejectReason, '정보가 부족합니다');
        const rejectAgain = applyClassCreateRejection(rejected.request, '또', SEED_MASTER_CLASS_ID, 12);
        assert.equal(rejectAgain.skip, true);
        const payload = classCreateWorkspacePayload(pending);
        assert.equal(payload.displayName, '새 반');
        assert.equal(payload.copyFromClassId, 'src-class');
        assert.equal(payload.copySettingsFromCurrent, false);
        assert.equal(payload.teacherPin, '1111');
        assert.equal(classCreateRequestStatusLabel('pending'), '승인 대기');
        assert.equal(classCreateRequestStatusLabel('approved'), '허락됨');
        assert.equal(pendingClassCreateRequests([pending, approved.request]).length, 1);
    });

    it('요청 id를 저장하고 다시 읽는다', () => {
        const mem = {
            data: {},
            getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
            setItem(k, v) { this.data[k] = String(v); },
            removeItem(k) { delete this.data[k]; },
        };
        writeStoredClassCreateRequestId('ccr_saved', mem);
        assert.equal(mem.data[CLASS_CREATE_REQUEST_STORAGE_KEY], 'ccr_saved');
        assert.equal(readStoredClassCreateRequestId(mem), 'ccr_saved');
        writeStoredClassCreateRequestId('', mem);
        assert.equal(readStoredClassCreateRequestId(mem), '');
    });
});
