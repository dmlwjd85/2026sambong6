import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FEATURE_UNLOCK_CATALOG,
    FEATURE_UNLOCK_PRICE,
    MASTER_ONLY_CLASS_TOOLS,
    canOpenClassTool,
    featureIdForClassTool,
    getFeatureUnlockItem,
    hasUnlockedFeature,
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

    it('온도계·비상계엄·학급투표·아침안내는 마스터 전용이다', () => {
        assert.deepEqual(MASTER_ONLY_CLASS_TOOLS, ['thermo', 'martial', 'vote', 'morning']);
        assert.equal(isMasterOnlyClassTool('vote'), true);
        assert.equal(isMasterOnlyClassTool('timer'), false);
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
        assert.deepEqual(sanitizeUnlockedFeatures(stu.unlockedFeatures), { tool_timer: true });
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
