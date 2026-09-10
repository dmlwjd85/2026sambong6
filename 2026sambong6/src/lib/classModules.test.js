import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BASIC_CLASS_MODULE_IDS,
    CLASS_MODULE_CATALOG,
    NEW_CLASS_CONSTITUTION_ITEMS,
    classModuleForTab,
    hasClassModuleRecord,
    isClassModuleEnabled,
    newClassModules,
    sanitizeClassModules,
    unlockClassModule,
} from './classModules.js';
import {
    DEFAULT_SEED_EXTERNAL_PORTALS,
    resolveExternalPortals,
    sanitizeExternalPortals,
} from './externalPortals.js';
import { gearEnhanceRingClass } from './gear.js';

describe('학급 기능 해금', () => {
    it('새 학급은 기본 기능만 켜고, 기록이 없으면 예전 학급처럼 전부 연다', () => {
        const neu = newClassModules();
        assert.equal(neu.quests, true);
        assert.equal(neu.constitution, true);
        assert.equal(neu.economy, false);
        assert.equal(neu.portal, false);
        assert.equal(neu.challenge, false);
        assert.deepEqual(BASIC_CLASS_MODULE_IDS.includes('jobs'), true);
        assert.equal(hasClassModuleRecord({ classModules: neu }), true);
        assert.equal(isClassModuleEnabled({}, 'portal'), true);
        assert.equal(isClassModuleEnabled({ classModules: neu }, 'portal'), false);
        assert.equal(isClassModuleEnabled({ classModules: neu }, 'portal', { isSeed: true }), true);
        const unlocked = unlockClassModule({ classModules: neu }, 'economy');
        assert.equal(unlocked.economy, true);
        assert.equal(unlocked.portal, false);
        assert.equal(CLASS_MODULE_CATALOG.length >= 10, true);
        assert.equal(sanitizeClassModules({}, { mode: 'full' }).literature, true);
        assert.equal(classModuleForTab('literature'), 'literature');
        assert.equal(classModuleForTab('bank'), 'economy');
        assert.equal(classModuleForTab('settings'), null);
    });

    it('새 학급 헌법은 짧게 두고 고칠 수 있게 시작한다', () => {
        assert.equal(NEW_CLASS_CONSTITUTION_ITEMS[0].type, 'chapter');
        assert.match(NEW_CLASS_CONSTITUTION_ITEMS.map((x) => x.text).join(' '), /우리 반/);
    });
});

describe('외부 세계 링크', () => {
    it('시드는 기본 링크를 쓰고, 새 학급은 비운다', () => {
        assert.equal(DEFAULT_SEED_EXTERNAL_PORTALS.length >= 3, true);
        assert.equal(resolveExternalPortals(undefined, { isSeed: true }).length, DEFAULT_SEED_EXTERNAL_PORTALS.length);
        assert.deepEqual(resolveExternalPortals(undefined, { isSeed: false, hasModuleRecord: true }), []);
        assert.equal(resolveExternalPortals(undefined, { isSeed: false, hasModuleRecord: false }).length, DEFAULT_SEED_EXTERNAL_PORTALS.length);
        assert.deepEqual(resolveExternalPortals([], { isSeed: true }), []);
        const cleaned = sanitizeExternalPortals([
            { name: '우리 반 패드', url: 'https://example.com/pad', emoji: '📌' },
            { name: '나쁜곳', url: 'javascript:alert(1)' },
        ]);
        assert.equal(cleaned.length, 1);
        assert.equal(cleaned[0].url, 'https://example.com/pad');
    });
});

describe('강화 테두리', () => {
    it('1~5강 클래스가 서로 다르다', () => {
        assert.equal(gearEnhanceRingClass(1), 'gear-enhance-lv1');
        assert.equal(gearEnhanceRingClass(5), 'gear-enhance-lv5');
        assert.notEqual(gearEnhanceRingClass(2), gearEnhanceRingClass(4));
        assert.equal(gearEnhanceRingClass(99), 'gear-enhance-lv5');
    });
});
