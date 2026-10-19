import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLASS_WIDE_CLASS_TOOLS,
    FEATURE_UNLOCK_CATALOG,
    FEATURE_UNLOCK_PRICE,
    MASTER_ONLY_CLASS_TOOLS,
    canOpenClassTool,
    classToolButtonState,
    featureIdForClassTool,
    getFeatureUnlockItem,
    hasUnlockedFeature,
    isClassWideClassTool,
    isMasterOnlyClassTool,
    sanitizeStatusMessage,
    sanitizeUnlockedFeatures,
} from './featureUnlock.js';

describe('기능 잠금해제 카탈로그', () => {
    it('항목당 300봉이고 통계·시간표·칠판·타이머·제비뽑기·돌림판이 있다', () => {
        assert.equal(FEATURE_UNLOCK_PRICE, 300);
        const ids = FEATURE_UNLOCK_CATALOG.map((f) => f.id);
        assert.deepEqual(ids, [
            'stats',
            'tool_timetable',
            'tool_chalk',
            'tool_timer',
            'tool_lottery',
            'tool_wheel',
        ]);
        assert.equal(getFeatureUnlockItem('stats').label, '퀘스트 통계');
        assert.equal(featureIdForClassTool('chalk'), 'tool_chalk');
        assert.equal(featureIdForClassTool('thermo'), '');
    });

    it('온도계·비상계엄·학급투표·아침·공지·공개수업·가위바위보는 마스터 전용이다', () => {
        assert.deepEqual(MASTER_ONLY_CLASS_TOOLS, ['thermo', 'martial', 'vote', 'morning', 'openlesson', 'rps']);
        assert.equal(isMasterOnlyClassTool('openlesson'), true);
        assert.equal(isMasterOnlyClassTool('timer'), false);
        assert.deepEqual(CLASS_WIDE_CLASS_TOOLS, ['padlet', 'classboard', 'boardgames']);
        assert.equal(isClassWideClassTool('padlet'), true);
        assert.equal(isClassWideClassTool('classboard'), true);
        assert.equal(isClassWideClassTool('boardgames'), true);
        assert.equal(isClassWideClassTool('timer'), false);
    });
});

describe('잠금해제 판정', () => {
    it('마스터는 결제 없이 전부 연다', () => {
        const admin = { isAdmin: true, unlockedFeatures: {} };
        assert.equal(hasUnlockedFeature(admin, 'stats'), true);
        assert.equal(canOpenClassTool(admin, 'timer'), true);
        assert.equal(canOpenClassTool(admin, 'thermo'), true);
    });

    it('학생은 산 항목만 연다', () => {
        const stu = { isAdmin: false, unlockedFeatures: { tool_timer: true, junk: true } };
        assert.equal(hasUnlockedFeature(stu, 'stats'), false);
        assert.equal(canOpenClassTool(stu, 'timer'), true);
        assert.equal(canOpenClassTool(stu, 'chalk'), false);
        assert.equal(canOpenClassTool(stu, 'thermo'), false);
        assert.equal(canOpenClassTool(stu, 'padlet'), true);
        assert.equal(canOpenClassTool(stu, 'classboard'), true);
        assert.equal(canOpenClassTool(stu, 'boardgames'), true);
        assert.equal(canOpenClassTool(stu, 'openlesson'), false);
        assert.equal(canOpenClassTool(stu, 'rps'), false);
        assert.equal(canOpenClassTool({ isGuest: true }, 'padlet'), false);
        assert.equal(canOpenClassTool({ isGuest: true }, 'classboard'), false);
        assert.equal(canOpenClassTool({ isGuest: true }, 'boardgames'), false);
        assert.deepEqual(sanitizeUnlockedFeatures(stu.unlockedFeatures), { tool_timer: true });
    });
});

describe('수업 탭 도구 버튼', () => {
    it('마스터는 선생님 인증 전에도 온도계를 본다', () => {
        const master = { isAdmin: true, isGM: true, unlockedFeatures: {} };
        const thermo = classToolButtonState(master, 'thermo', 'timetable');
        assert.equal(thermo.hidden, false);
        assert.equal(thermo.locked, false);
        assert.equal(thermo.active, false);
        MASTER_ONLY_CLASS_TOOLS.forEach((id) => {
            assert.equal(classToolButtonState(master, id).hidden, false);
        });
        assert.equal(classToolButtonState(master, 'thermo', 'thermo').active, true);
    });

    it('학생·게스트는 온도계를 숨기고 나머지 도구는 그대로 둔다', () => {
        const student = { isAdmin: false, isGuest: false, unlockedFeatures: { tool_timer: true } };
        assert.equal(classToolButtonState(student, 'thermo').hidden, true);
        assert.equal(classToolButtonState(student, 'vote').hidden, true);
        assert.equal(classToolButtonState(student, 'timer').hidden, false);
        assert.equal(classToolButtonState(student, 'timer').locked, false);
        assert.equal(classToolButtonState(student, 'chalk').hidden, false);
        assert.equal(classToolButtonState(student, 'chalk').locked, true);
        assert.equal(classToolButtonState(student, 'padlet').hidden, false);
        assert.equal(classToolButtonState(student, 'padlet').locked, false);
        assert.equal(classToolButtonState(student, 'boardgames').locked, false);
        const guest = { isAdmin: false, isGuest: true };
        assert.equal(classToolButtonState(guest, 'thermo').hidden, true);
        assert.equal(classToolButtonState(guest, 'timetable').hidden, false);
        assert.equal(classToolButtonState(guest, 'padlet').locked, true);
    });

    it('관리자 상태가 늦게 확정되면 온도계 숨김이 풀린다', () => {
        const pending = { isAdmin: false, isGM: false };
        const resolved = { isAdmin: true, isGM: true };
        assert.equal(classToolButtonState(pending, 'thermo').hidden, true);
        assert.equal(classToolButtonState(resolved, 'thermo').hidden, false);
        assert.equal(classToolButtonState(null, 'thermo').hidden, true);
        assert.equal(classToolButtonState(undefined, 'chalk').hidden, false);
    });
});

describe('상태 메시지', () => {
    it('앞뒤 공백을 지우고 10글자까지만 남긴다', () => {
        assert.equal(sanitizeStatusMessage('  안녕  '), '안녕');
        assert.equal(sanitizeStatusMessage('abcdefghijk'), 'abcdefghij');
        assert.equal(sanitizeStatusMessage('오늘기분최고예요!'), '오늘기분최고예요!');
        assert.equal(sanitizeStatusMessage('열한글자넘는문구다'), '열한글자넘는문구다'.slice(0, 10));
        assert.equal(Array.from(sanitizeStatusMessage('가나다라마바사아자차카')).length, 10);
    });
});
