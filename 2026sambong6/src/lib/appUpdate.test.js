import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bundleNameFromHtml, bundleNameFromSrc, canReloadNow, isNewBundle } from './appUpdate.js';

describe('새 버전 알아보기', () => {
    it('index.html 과 스크립트 주소에서 앱 묶음 이름을 찾아요', () => {
        const html = '<script type="module" crossorigin src="/2026sambong6/assets/index-AbC_12-x.js"></script><link href="/2026sambong6/assets/index-zz.css">';
        assert.equal(bundleNameFromHtml(html), 'index-AbC_12-x.js');
        assert.equal(bundleNameFromSrc('https://dmlwjd85.github.io/2026sambong6/assets/index-AbC_12-x.js'), 'index-AbC_12-x.js');
        assert.equal(bundleNameFromSrc('/src/main.jsx'), '');
    });
    it('둘 다 알고 다를 때만 새 버전이에요', () => {
        assert.equal(isNewBundle('index-a.js', 'index-b.js'), true);
        assert.equal(isNewBundle('index-a.js', 'index-a.js'), false);
        assert.equal(isNewBundle('', 'index-b.js'), false);
        assert.equal(isNewBundle('index-a.js', ''), false);
    });
    it('가려진 화면은 바로, 보는 화면은 2분 쉬었고 하던 일이 없을 때만 새로 고쳐요', () => {
        assert.equal(canReloadNow({ hidden: true }), true);
        assert.equal(canReloadNow({ hidden: true, busy: true }), false);
        assert.equal(canReloadNow({ idleMs: 119000 }), false);
        assert.equal(canReloadNow({ idleMs: 120000 }), true);
        assert.equal(canReloadNow({ idleMs: 999999, busy: true }), false);
    });
    it('펫 저장이 아직 서버에 안 갔으면 가려진 화면이어도 새로 고치지 않아요', () => {
        assert.equal(canReloadNow({ hidden: true, petPending: true }), false);
        assert.equal(canReloadNow({ idleMs: 999999, petPending: true }), false);
        assert.equal(canReloadNow({ hidden: true, petPending: false }), true);
    });
});
