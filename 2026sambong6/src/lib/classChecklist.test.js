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

    it('서버에 있는 목록을 더하거나 지워도 다른 목록의 제출 표시는 남는다', () => {
        const server = {
            items: [
                { id: 'c1', title: '독서', marks: { '4': true, '8': true } },
                { id: 'c2', title: '숙제', marks: { '1': true } },
            ],
        };
        const extra = createChecklist(server, '발표', 'c3');
        assert.equal(extra.ok, true);
        assert.equal(extra.items.length, 3);
        assert.equal(extra.items[0].marks['4'], true);
        assert.equal(extra.items[0].marks['8'], true);
        assert.equal(extra.items[1].marks['1'], true);
        const removed = deleteChecklist(extra.items, 'c3');
        assert.equal(removed.items.length, 2);
        assert.equal(removed.items[0].marks['4'], true);
        assert.equal(removed.items[1].marks['1'], true);
        const dup = createChecklist(extra.items, '다른 제목', 'c1');
        assert.equal(dup.ok, false);
        assert.equal(dup.reason, 'id');
    });
});
