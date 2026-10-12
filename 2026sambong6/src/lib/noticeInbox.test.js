import test from 'node:test';
import assert from 'node:assert/strict';
import { markAllRead, pushNotice, unreadCount } from './noticeInbox.js';

test('같은 키의 알림은 한 번만 쌓인다', () => {
    let list = [];
    list = pushNotice(list, { key: 'lotto:1', title: '로또', body: '결과' });
    list = pushNotice(list, { key: 'lotto:1', title: '로또', body: '결과 다시' });
    list = pushNotice(list, { key: 'quest', title: '퀘스트', body: '초기화' });
    assert.equal(list.length, 2);
    assert.equal(list[0].key, 'quest');
    assert.equal(unreadCount(list), 2);
    assert.equal(unreadCount(markAllRead(list)), 0);
});

test('빈 본문은 알림함에 넣지 않는다', () => {
    assert.deepEqual(pushNotice([], { key: 'x', title: '알림', body: '   ' }), []);
});
