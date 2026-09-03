import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SCREEN_NOTICE_MAX_LEN,
    buildScreenNotice,
    closeScreenNotice,
    readDismissedScreenNoticeId,
    sanitizeScreenNotice,
    screenNoticeShouldShow,
    writeDismissedScreenNoticeId,
} from './screenNotice.js';

describe('화면 공지 팝업', () => {
    it('빈 값은 비활성 공지로 맞춘다', () => {
        const empty = sanitizeScreenNotice(null);
        assert.equal(empty.active, false);
        assert.equal(empty.text, '');
        assert.equal(sanitizeScreenNotice({ active: true, id: '', text: '안녕' }).active, false);
    });

    it('띄울 공지는 id와 시각을 넣고, 긴 글은 자른다', () => {
        const notice = buildScreenNotice({ text: '  조용히 책을 펴세요.  ', source: 'morning' });
        assert.ok(notice);
        assert.equal(notice.active, true);
        assert.equal(notice.source, 'morning');
        assert.equal(notice.title, '아침안내');
        assert.equal(notice.text, '조용히 책을 펴세요.');
        assert.match(notice.id, /^n_/);
        assert.ok(notice.postedAt > 0);
        const long = buildScreenNotice({ text: '가'.repeat(SCREEN_NOTICE_MAX_LEN + 40) });
        assert.equal(long.text.length, SCREEN_NOTICE_MAX_LEN);
        assert.equal(buildScreenNotice({ text: '   ' }), null);
    });

    it('같은 공지를 닫았으면 다시 띄우지 않고, 새 id면 띄운다', () => {
        const notice = buildScreenNotice({ text: '조회 시간입니다', title: '공지' });
        assert.equal(screenNoticeShouldShow(notice, ''), true);
        assert.equal(screenNoticeShouldShow(notice, notice.id), false);
        assert.equal(screenNoticeShouldShow(closeScreenNotice(notice), ''), false);
        const store = new Map();
        const fake = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        };
        writeDismissedScreenNoticeId(notice.id, fake);
        assert.equal(readDismissedScreenNoticeId(fake), notice.id);
        assert.equal(screenNoticeShouldShow(notice, readDismissedScreenNoticeId(fake)), false);
    });
});
