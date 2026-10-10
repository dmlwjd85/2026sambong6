import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST_BONG, CHECKLIST_XP, createChecklist, deleteChecklist, toggleChecklistNumber } from './classChecklist.js';

describe('퀘스트 체크리스트', () => {
    it('제목을 달아 만들고 번호를 누르면 제출과 보상이 바뀐다', () => {
        const made = createChecklist([], '  독서 퀴즈  ', 'c1');
        assert.equal(made.ok, true);
        assert.equal(made.items[0].title, '독서 퀴즈');
        const on = toggleChecklistNumber(made.items, 'c1', '4');
        assert.equal(on.marked, true);
        assert.equal(on.xpDelta, CHECKLIST_XP);
        assert.equal(on.bongDelta, CHECKLIST_BONG);
        assert.equal(on.items[0].marks['4'], true);
        const off = toggleChecklistNumber(on.items, 'c1', '4');
        assert.equal(off.marked, false);
        assert.equal(off.xpDelta, -CHECKLIST_XP);
        assert.equal(deleteChecklist(on.items, 'c1').items.length, 0);
        assert.equal(createChecklist([], '   ', 'c2').ok, false);
    });
});
