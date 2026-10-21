import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    isMasterPinStudentId,
    masterPinRecordFromUserData,
    masterPinUserPayload,
} from './masterPinStore.js';

describe('마스터 PIN 개인 문서', () => {
    it('4자리 PIN만 같은 학급·계정으로 읽습니다', () => {
        const payload = masterPinUserPayload({ pin: '4321', classId: 'sambong-class-2026', studentId: 'gm' });
        assert.deepEqual(masterPinRecordFromUserData(payload, {
            classId: 'sambong-class-2026',
            studentId: 'gm',
        }), { pin: '4321', classId: 'sambong-class-2026', studentId: 'gm' });
        assert.equal(masterPinRecordFromUserData(payload, { classId: 'other', studentId: 'gm' }), null);
        assert.equal(masterPinRecordFromUserData({ sambongMasterPin: '12' }), null);
        assert.equal(isMasterPinStudentId('gm'), true);
        assert.equal(isMasterPinStudentId('1'), false);
    });

    it('화면 로그인은 Google 팝업을 열지 않습니다', () => {
        const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        assert.equal(src.includes('signInWithPopup'), false);
        assert.equal(src.includes('GoogleAuthProvider'), false);
        assert.match(src, /writeStoredMasterPin/);
        assert.match(src, /students', 'student_' \+ studentId/);
        assert.match(src, /pin: pinText/);
    });
});
