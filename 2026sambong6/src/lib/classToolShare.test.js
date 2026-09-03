import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLASS_TOOL_SHARE_IDS,
    classToolShareShouldClose,
    classToolShareShouldOpen,
    closeClassToolShare,
    isClassToolShareId,
    openClassToolShare,
    sanitizeClassToolShare,
} from './classToolShare.js';

describe('수업도구 창 공유', () => {
    it('허용된 도구만 띄운다', () => {
        assert.ok(CLASS_TOOL_SHARE_IDS.includes('timer'));
        assert.equal(isClassToolShareId('timer'), true);
        assert.equal(isClassToolShareId('unknown'), false);
        assert.equal(openClassToolShare('nope'), null);
        const opened = openClassToolShare('wheel');
        assert.equal(opened.active, true);
        assert.equal(opened.toolId, 'wheel');
        assert.match(opened.sessionId, /^ct_/);
        assert.equal(sanitizeClassToolShare({ active: true, toolId: 'hack', sessionId: 'x' }).active, false);
    });

    it('내리면 비활성이 되고, 세션이 바뀌면 다시 연다', () => {
        const opened = openClassToolShare('lottery');
        const closed = closeClassToolShare(opened);
        assert.equal(closed.active, false);
        assert.equal(classToolShareShouldOpen(opened, ''), true);
        assert.equal(classToolShareShouldOpen(opened, opened.sessionId), false);
        assert.equal(classToolShareShouldClose(closed, opened.sessionId), true);
        assert.equal(classToolShareShouldClose(opened, opened.sessionId), false);
        const next = openClassToolShare('lottery');
        assert.equal(classToolShareShouldOpen(next, opened.sessionId), true);
        assert.equal(classToolShareShouldClose(next, opened.sessionId), true);
    });
});
