import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    PIN_HASH_HEX_LEN,
    XP_WRITE_COOLDOWN_MS,
    canWriteXpWithCooldown,
    classifyPinLogin,
    hashStudentPin,
    isValidPinHash,
    normalizeStudentPin,
    pinHashMaterial,
    pinProbePayload,
    pinProbeSegments,
    pinSecretPayload,
    pinSecretSegments,
    stripPinFromStudentData,
    studentPinDocId,
} from './studentPinSecret.js';

describe('학생 PIN 비밀 저장', () => {
    it('학번·마스터 id를 비밀 문서 id로 정리한다', () => {
        assert.equal(studentPinDocId('student_gm'), 'gm');
        assert.equal(studentPinDocId('student_12'), '12');
        assert.equal(studentPinDocId('gm_a'), 'gm_a');
        assert.equal(normalizeStudentPin(' 4280 '), '4280');
        assert.equal(normalizeStudentPin('12'), '');
    });

    it('같은 PIN이어도 학급·학번이 다르면 해시 재료가 다르다', () => {
        const a = pinHashMaterial({ classId: 'c1', studentId: '12', pin: '1234' });
        const b = pinHashMaterial({ classId: 'c2', studentId: '12', pin: '1234' });
        const c = pinHashMaterial({ classId: 'c1', studentId: '13', pin: '1234' });
        assert.notEqual(a, b);
        assert.notEqual(a, c);
        assert.match(a, /sambong-pin-v1/);
    });

    it('SHA-256 헥스 해시를 만들고 경로를 학급 밖으로 두지 않는다', async () => {
        const hash = await hashStudentPin({ classId: 'c1', studentId: 'gm', pin: '4280' });
        assert.equal(hash.length, PIN_HASH_HEX_LEN);
        assert.equal(isValidPinHash(hash), true);
        const other = await hashStudentPin({ classId: 'c1', studentId: 'gm', pin: '4281' });
        assert.notEqual(hash, other);
        assert.deepEqual(pinSecretSegments('c1', 'student_gm'), ['artifacts', 'c1', 'pinSecrets', 'gm']);
        assert.deepEqual(pinProbeSegments('c1', 'uid-1'), ['artifacts', 'c1', 'pinProbes', 'uid-1']);
        const secret = pinSecretPayload(hash, { prevHash: 'abc', updatedAt: 9 });
        assert.equal(secret.hash, hash);
        assert.equal(secret.prevHash, 'abc');
        const probe = pinProbePayload({ studentId: 'student_12', hash, at: 3 });
        assert.equal(probe.studentId, '12');
        assert.equal(probe.ok, true);
    });

    it('공개 학생 문서에서 pin 필드를 뺀다', () => {
        const next = stripPinFromStudentData({ pin: '1111', xp: 10, password: 'x' });
        assert.equal('pin' in next, false);
        assert.equal('password' in next, false);
        assert.equal(next.xp, 10);
    });

    it('probe·비밀 생성이 있어야 청구 가능하고, 남은 평문만으로는 청구하지 않는다', () => {
        assert.equal(classifyPinLogin({ ownerBypass: true }).via, 'owner');
        assert.equal(classifyPinLogin({ ownerBypass: true }).canClaim, false);
        assert.equal(classifyPinLogin({ probeOk: true }).via, 'probe');
        assert.equal(classifyPinLogin({ probeOk: true }).canClaim, true);
        assert.equal(classifyPinLogin({ secretCreated: true, leftoverPin: '1111', typedPin: '1111' }).via, 'legacy-migrate');
        assert.equal(classifyPinLogin({ leftoverPin: '1111', typedPin: '1111' }).via, 'legacy-plaintext');
        assert.equal(classifyPinLogin({ leftoverPin: '1111', typedPin: '1111' }).canClaim, false);
        assert.equal(classifyPinLogin({ leftoverPin: '1111', typedPin: '0000' }).reason, 'mismatch');
        assert.equal(classifyPinLogin({ isAutoLogin: true }).reason, 'auto');
        assert.equal(classifyPinLogin({}).reason, 'needs-first-set');
    });

    it('XP는 +650과 2초 쿨다운을 지키고 교사는 쿨다운을 건너뛴다', () => {
        assert.equal(canWriteXpWithCooldown({ prevXp: 10, nextXp: 660 }), true);
        assert.equal(canWriteXpWithCooldown({ prevXp: 10, nextXp: 661 }), false);
        assert.equal(canWriteXpWithCooldown({
            prevXp: 10,
            nextXp: 20,
            prevWriteAtMs: 1000,
            nowMs: 1000 + XP_WRITE_COOLDOWN_MS,
        }), false);
        assert.equal(canWriteXpWithCooldown({
            prevXp: 10,
            nextXp: 20,
            prevWriteAtMs: 1000,
            nowMs: 1001 + XP_WRITE_COOLDOWN_MS,
        }), true);
        assert.equal(canWriteXpWithCooldown({
            prevXp: 10,
            nextXp: 20,
            isTeacherOfClass: true,
            prevWriteAtMs: 1000,
            nowMs: 1001,
        }), true);
    });
});
