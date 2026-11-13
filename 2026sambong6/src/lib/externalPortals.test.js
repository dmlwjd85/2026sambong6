import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    EXTERNAL_PORTAL_MAX,
    appendExternalPortal,
    externalPortalInputMessage,
    resolveExternalPortals,
    usesHomeClassDefaultPortals,
    HOME_CLASS_DEFAULT_PORTALS,
    safeExternalUrl,
    sanitizeExternalPortals,
    validateExternalPortalInput,
} from './externalPortals.js';

describe('외부 세계 링크 — 기본 목록', () => {
    it('저장된 링크가 없으면 빈 목록(하드코딩 링크 없음)', () => {
        assert.deepEqual(resolveExternalPortals(undefined), []);
        assert.deepEqual(resolveExternalPortals(null), []);
        assert.deepEqual(resolveExternalPortals('x'), []);
    });
    it('저장된 링크는 그대로 보여 줌(위험 주소는 뺌)', () => {
        const list = resolveExternalPortals([
            { id: 'a', name: '패드', url: 'https://padlet.com/x' },
            { id: 'b', name: '나쁨', url: 'javascript:alert(1)' },
            { id: 'c', name: '데이터', url: 'data:text/html,hi' },
        ]);
        assert.deepEqual(list.map((r) => r.id), ['a']);
    });
});

describe('safeExternalUrl', () => {
    it('http·https만', () => {
        assert.equal(safeExternalUrl('https://example.com'), 'https://example.com/');
        assert.equal(safeExternalUrl('http://example.com/a?b=1'), 'http://example.com/a?b=1');
        assert.equal(safeExternalUrl('ftp://example.com'), '');
        assert.equal(safeExternalUrl('javascript:alert(1)'), '');
        assert.equal(safeExternalUrl('JAVASCRIPT:alert(1)'), '');
        assert.equal(safeExternalUrl('https://' + 'a'.repeat(400) + '.com'), '');
    });
});

describe('validateExternalPortalInput', () => {
    it('이름·주소 필수', () => {
        assert.equal(validateExternalPortalInput({ name: '', url: 'https://a.com' }).reason, 'name');
        assert.equal(validateExternalPortalInput({ name: '   ', url: 'https://a.com' }).reason, 'name');
        assert.equal(validateExternalPortalInput({ name: '가', url: '' }).reason, 'url');
    });
    it('이름 24자 제한', () => {
        assert.equal(validateExternalPortalInput({ name: '가'.repeat(25), url: 'https://a.com' }).reason, 'name_long');
        assert.equal(validateExternalPortalInput({ name: '가'.repeat(24), url: 'https://a.com' }).ok, true);
    });
    it('스킴 없는 주소는 https를 붙이고, 다른 스킴은 거절', () => {
        assert.equal(validateExternalPortalInput({ name: '가', url: 'example.com/x' }).url, 'https://example.com/x');
        assert.equal(validateExternalPortalInput({ name: '가', url: 'javascript:alert(1)' }).reason, 'scheme');
        assert.equal(validateExternalPortalInput({ name: '가', url: 'ftp://a.com' }).reason, 'scheme');
        assert.equal(validateExternalPortalInput({ name: '가', url: 'mailto:a@b.c' }).reason, 'scheme');
        assert.equal(validateExternalPortalInput({ name: '가', url: 'https://' }).reason, 'url');
    });
    it('안내 문구', () => {
        for (const r of ['name', 'name_long', 'scheme', 'url', 'full', 'dup', 'x']) {
            assert.equal(typeof externalPortalInputMessage(r), 'string');
        }
    });
});

describe('appendExternalPortal', () => {
    it('빈 목록에 추가', () => {
        const r = appendExternalPortal(undefined, { name: '삼봉FC', url: 'https://dmlwjd85.github.io/sambong-FC/' }, { nowMs: 1, rand: () => 0.5 });
        assert.equal(r.ok, true);
        assert.equal(r.list.length, 1);
        assert.equal(r.item.name, '삼봉FC');
        assert.equal(r.item.emoji, '🌐');
        assert.ok(r.item.id);
    });
    it('기존 링크를 지우지 않고 끝에 붙임', () => {
        const base = [{ id: 'a', name: 'A', url: 'https://a.com/' }];
        const r = appendExternalPortal(base, { name: 'B', url: 'https://b.com' }, { nowMs: 2, rand: () => 0.1 });
        assert.deepEqual(r.list.map((x) => x.name), ['A', 'B']);
    });
    it('같은 주소 중복은 거절', () => {
        const base = [{ id: 'a', name: 'A', url: 'https://a.com/' }];
        assert.equal(appendExternalPortal(base, { name: 'A2', url: 'https://a.com' }).reason, 'dup');
    });
    it('12개가 차면 거절', () => {
        const base = Array.from({ length: EXTERNAL_PORTAL_MAX }, (_, i) => ({ id: `x${i}`, name: `n${i}`, url: `https://s${i}.com/` }));
        assert.equal(appendExternalPortal(base, { name: 'new', url: 'https://new.com' }).reason, 'full');
    });
    it('id가 겹치지 않음', () => {
        const first = appendExternalPortal([], { name: 'A', url: 'https://a.com' }, { nowMs: 5, rand: () => 0.3 });
        const second = appendExternalPortal(first.list, { name: 'B', url: 'https://b.com' }, { nowMs: 5, rand: () => 0.3 });
        assert.equal(second.ok, true);
        assert.notEqual(second.item.id, first.item.id);
        assert.equal(sanitizeExternalPortals(second.list).length, 2);
    });
});

describe('6학년 1반(sambong-class-2026)과 신규 학급 구분', () => {
    const HOME = 'sambong-class-2026';
    it('학급 ID로만 판별한다', () => {
        assert.equal(usesHomeClassDefaultPortals(HOME), true);
        assert.equal(usesHomeClassDefaultPortals('class-abc123'), false);
        assert.equal(usesHomeClassDefaultPortals(''), false);
        assert.equal(usesHomeClassDefaultPortals(undefined), false);
    });
    it('6학년 1반은 저장된 목록이 없으면 기존 기본 링크 5개를 그대로 보여 준다', () => {
        const list = resolveExternalPortals(undefined, { classId: HOME });
        assert.deepEqual(list.map((r) => r.name), ['삼봉FC', '가나다 눈치게임', '영켓몬', '지식의 샘', '픽북']);
        assert.deepEqual(list.map((r) => r.url), HOME_CLASS_DEFAULT_PORTALS.map((r) => r.url));
        assert.equal(list[0].emoji, '⚽');
        assert.equal(list[0].desc, '축구 세계로 이동');
    });
    it('신규 학급은 저장된 목록이 없으면 빈 목록', () => {
        assert.deepEqual(resolveExternalPortals(undefined, { classId: 'class-new1' }), []);
        assert.deepEqual(resolveExternalPortals(null, { classId: 'class-new1' }), []);
    });
    it('저장된 배열이 있으면 6학년 1반도 그 배열만 쓴다(마스터가 비운 경우 포함)', () => {
        assert.deepEqual(resolveExternalPortals([], { classId: HOME }), []);
        const one = resolveExternalPortals([{ id: 'a', name: '패들렛', url: 'https://padlet.com/' }], { classId: HOME });
        assert.deepEqual(one.map((r) => r.name), ['패들렛']);
    });
    it('6학년 1반에서 처음 + 로 추가하면 기본 링크 뒤에 붙는다', () => {
        const res = appendExternalPortal(undefined, { name: '우리 반 패들렛', url: 'https://padlet.com/x' }, { classId: HOME, nowMs: 1, rand: () => 0.5 });
        assert.equal(res.ok, true);
        assert.equal(res.list.length, 6);
        assert.equal(res.list[0].name, '삼봉FC');
        assert.equal(res.list[5].name, '우리 반 패들렛');
    });
    it('6학년 1반 기본 링크와 같은 주소는 중복으로 막는다', () => {
        const res = appendExternalPortal(undefined, { name: '픽북2', url: 'https://dmlwjd85.github.io/picbook/' }, { classId: HOME });
        assert.deepEqual(res, { ok: false, reason: 'dup' });
    });
    it('신규 학급에서 처음 추가하면 1개만 저장된다', () => {
        const res = appendExternalPortal(undefined, { name: '패들렛', url: 'https://padlet.com/x' }, { classId: 'class-new1' });
        assert.equal(res.ok, true);
        assert.equal(res.list.length, 1);
    });
    it('기본 링크 상수는 바뀌지 않는다', () => {
        assert.throws(() => { HOME_CLASS_DEFAULT_PORTALS.push({}); });
    });
});
