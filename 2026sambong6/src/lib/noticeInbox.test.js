import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNoticeInbox, markAllRead, noticeInboxStorageKey, pushNotice, serializeNoticeInbox, unreadCount } from './noticeInbox.js';

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

test('알림함은 저장 문자열을 다시 읽어도 남는다', () => {
    const key = noticeInboxStorageKey('sambong-class-2026', '3');
    assert.equal(key, 'sambong_notice_inbox_sambong-class-2026_3');
    const saved = serializeNoticeInbox([
        { key: 'lotto:1', title: '로또', body: '결과', at: 10, read: true },
        { key: '', title: '', body: '   ', at: 11, read: false },
    ]);
    const loaded = loadNoticeInbox(saved);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].body, '결과');
    assert.equal(loaded[0].read, true);
    assert.deepEqual(loadNoticeInbox('{'), []);
    assert.deepEqual(loadNoticeInbox(null), []);
});
