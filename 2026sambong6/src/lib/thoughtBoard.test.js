import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    THINK_POST_MAX,
    addThoughtPost,
    addThoughtQuestion,
    clearThoughtBoardPosts,
    emptyThoughtBoard,
    empathyCounts,
    glowingThoughtPostIds,
    publishAllThoughtPosts,
    sanitizeDrawingDataUrl,
    sanitizeThoughtBoard,
    setThoughtEmpathyPublic,
    setThoughtFocus,
    setThoughtPostPublic,
    setThoughtPostingOpen,
    thoughtPostExcerpt,
    toggleThoughtEmpathy,
    visibleThoughtPosts,
} from './thoughtBoard.js';

describe('생각게시판 정리', () => {
    it('빈 값과 위험한 그림을 버린다', () => {
        const empty = sanitizeThoughtBoard(null);
        assert.equal(empty.postingOpen, false);
        assert.equal(empty.posts.length, 0);
        assert.equal(sanitizeDrawingDataUrl('javascript:alert(1)'), '');
        assert.equal(sanitizeDrawingDataUrl('data:image/png;base64,aaaa'), '');
        const jpeg = `data:image/jpeg;base64,${'A'.repeat(20)}=`;
        assert.equal(sanitizeDrawingDataUrl(jpeg), jpeg);
        const old = sanitizeThoughtBoard({ posts: [{ id: 'p9', studentId: '1', text: '예전 글' }] });
        assert.equal(old.posts[0].isPublic, false);
    });

    it('게시·공감·최다 공감 빛남을 맞춘다', () => {
        let st = setThoughtPostingOpen(emptyThoughtBoard(), true);
        st = addThoughtQuestion(st, '우리 반의 자랑은?');
        st = addThoughtPost(st, { id: 'p1', studentId: '1', name: '김단엘', text: '사이좋게 지내기', color: 'mint' });
        st = addThoughtPost(st, { id: 'p2', studentId: '2', name: '김라희', text: '운동장에서 놀기', color: 'hack' });
        assert.equal(st.posts.length, 2);
        assert.equal(st.posts[1].color, 'yellow');
        assert.equal(st.posts[0].isPublic, false);
        assert.equal(visibleThoughtPosts(st, { viewerId: '1', isAdmin: false }).map((p) => p.id).join(','), 'p1');
        assert.equal(visibleThoughtPosts(st, { viewerId: '2', isAdmin: false }).map((p) => p.id).join(','), 'p2');
        assert.equal(visibleThoughtPosts(st, { isAdmin: true }).length, 2);
        assert.equal(visibleThoughtPosts(st, { viewerId: '1', follower: true }).length, 0);
        st = setThoughtPostPublic(st, 'p1', true);
        assert.equal(st.posts.find((p) => p.id === 'p1').isPublic, true);
        assert.equal(visibleThoughtPosts(st, { viewerId: '2', isAdmin: false }).map((p) => p.id).join(','), 'p1,p2');
        st = publishAllThoughtPosts(st);
        assert.ok(st.posts.every((p) => p.isPublic));
        assert.equal(visibleThoughtPosts(st, { viewerId: '9', follower: true }).length, 2);
        st = toggleThoughtEmpathy(st, '3', 'p1');
        st = toggleThoughtEmpathy(st, '4', 'p1');
        st = toggleThoughtEmpathy(st, '5', 'p2');
        assert.deepEqual(empathyCounts(st), { p1: 2, p2: 1 });
        assert.deepEqual(glowingThoughtPostIds(st), []);
        st = setThoughtEmpathyPublic(st, true);
        assert.deepEqual(glowingThoughtPostIds(st), ['p1']);
        st = toggleThoughtEmpathy(st, '3', 'p1');
        assert.equal(empathyCounts(st).p1, 1);
        st = setThoughtFocus(st, 'p2');
        assert.equal(st.viewMode, 'post');
        assert.equal(st.focusPostId, 'p2');
        assert.equal(thoughtPostExcerpt({ text: '가'.repeat(50) }).endsWith('…'), true);
        st = clearThoughtBoardPosts(st);
        assert.equal(st.posts.length, 0);
        assert.equal(st.viewMode, 'board');
    });

    it('게시 개수 상한을 지킨다', () => {
        let st = emptyThoughtBoard();
        for (let i = 0; i < THINK_POST_MAX + 5; i++) {
            st = addThoughtPost(st, { id: `p${i}`, studentId: String((i % 13) + 1), text: `생각 ${i}` });
        }
        assert.equal(st.posts.length, THINK_POST_MAX);
        assert.ok(st.posts.some((p) => p.id === `p${THINK_POST_MAX + 4}`));
        assert.equal(st.posts.some((p) => p.id === 'p0'), false);
    });
});
