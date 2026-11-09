import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    EXTERNAL_PORTAL_MAX,
    appendExternalPortal,
    externalPortalInputMessage,
    resolveExternalPortals,
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
