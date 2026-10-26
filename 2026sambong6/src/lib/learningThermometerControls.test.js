import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    learningThermometerAutoNote,
    learningThermometerStudentControls,
    masterCanEditLearningThermometer,
} from './learningThermometerControls.js';

describe('학습 온도계 편집 권한', () => {
    it('마스터 PIN 로그인이면 선생님 인증 없이 조절한다', () => {
        assert.equal(masterCanEditLearningThermometer({ isAdmin: true }), true);
        assert.equal(masterCanEditLearningThermometer({ isAdmin: false }), false);
        assert.equal(masterCanEditLearningThermometer({}), false);
        const morning = learningThermometerAutoNote({ canEdit: true, hour: 10, autoHour: 15, settledToday: false });
        const afternoon = learningThermometerAutoNote({ canEdit: true, hour: 15, autoHour: 15, settledToday: false });
        const done = learningThermometerAutoNote({ canEdit: true, hour: 16, autoHour: 15, settledToday: true });
        assert.doesNotMatch(morning, /선생님 인증/);
        assert.doesNotMatch(afternoon, /선생님 인증/);
        assert.match(afternoon, /지금 XP 반영/);
        assert.equal(done, '오늘 15시 정산 완료');
        assert.equal(learningThermometerAutoNote({ canEdit: false, hour: 16 }), '');
    });

    it('화면의 편집 판정은 구글 선생님 인증을 보지 않는다', () => {
        const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
        const start = src.indexOf('function canEditLearningThermometer()');
        const end = src.indexOf('function learningThermometerHasUnsavedEdits', start);
        const body = src.slice(start, end);
        assert.ok(start >= 0 && end > start);
        assert.match(body, /masterCanEditLearningThermometer/);
        assert.equal(body.includes('isTeacherProvider'), false);
        const saveStart = src.indexOf('async function saveLearningThermometerState');
        const saveEnd = src.indexOf('function scheduleLearningThermometerSave', saveStart);
        const saveBody = src.slice(saveStart, saveEnd);
        assert.equal(saveBody.includes('isTeacherProvider'), false);
        assert.equal(saveBody.includes('선생님 인증'), false);
        const renderStart = src.indexOf('function renderLearningThermometerPanel()');
        const renderEnd = src.indexOf('async function saveLearningThermometerState', renderStart);
        const renderBody = src.slice(renderStart, renderEnd);
        assert.equal(renderBody.includes('선생님 인증'), false);
    });
});

describe('학습 온도계 슬라이더', () => {
    it('편집할 수 없으면 슬라이더와 버튼을 조작할 수 없다', () => {
        const locked = learningThermometerStudentControls({
            id: '3',
            value: 4,
            min: -20,
            max: 20,
            canEdit: false,
            valueClass: 'text-sky-200',
        });
        assert.match(locked, /type="range"/);
        assert.match(locked, /disabled/);
        assert.match(locked, /aria-disabled="true"/);
        assert.match(locked, /tabindex="-1"/);
        assert.match(locked, /inert/);
        assert.doesNotMatch(locked, /oninput=/);
        assert.doesNotMatch(locked, /onchange=/);
        assert.doesNotMatch(locked, /onclick=/);
        assert.equal((locked.match(/<button/g) || []).length, 3);
    });

    it('편집할 수 있으면 슬라이더와 버튼이 값을 바꾼다', () => {
        const open = learningThermometerStudentControls({
            id: '3',
            value: -2,
            min: -20,
            max: 20,
            canEdit: true,
            valueClass: 'text-rose-200',
        });
        assert.match(open, /oninput="window.updateLearningThermometerStudent\('3'/);
        assert.match(open, /onclick="window.adjustLearningThermometerStudent\('3', -1\)"/);
        assert.doesNotMatch(open, /disabled/);
        assert.doesNotMatch(open, /aria-disabled/);
    });
});