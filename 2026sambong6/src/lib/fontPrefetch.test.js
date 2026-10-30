import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isSlowConnection } from './fontPrefetch.js';

describe('알까기 제목 글꼴 미리 받기 망 판단', () => {
    it('데이터 절약 모드면 미리 받지 않아요', () => {
        assert.equal(isSlowConnection({ connection: { saveData: true, effectiveType: '4g' } }), true);
    });
    it('2g·slow-2g면 미리 받지 않아요', () => {
        assert.equal(isSlowConnection({ connection: { effectiveType: '2g' } }), true);
        assert.equal(isSlowConnection({ connection: { effectiveType: 'slow-2g', saveData: false } }), true);
    });
    it('3g·4g면 미리 받아요', () => {
        assert.equal(isSlowConnection({ connection: { effectiveType: '3g', saveData: false } }), false);
        assert.equal(isSlowConnection({ connection: { effectiveType: '4g' } }), false);
    });
    it('connection이 없는 브라우저(Safari 등)는 미리 받아요', () => {
        assert.equal(isSlowConnection({}), false);
        assert.equal(isSlowConnection(undefined), false);
        assert.equal(isSlowConnection({ connection: null }), false);
    });
    it('미리 받기 함수가 맨 앞에서 망 판단을 해요', () => {
        const src = fs.readFileSync(new URL('../sambongWorld.js', import.meta.url), 'utf8');
        assert.match(src, /import \{ isSlowConnection \} from '\.\/lib\/fontPrefetch\.js';/);
        assert.match(src, /function prefetchAlkkagiTitleOnce\(\) \{\s*if \(isSlowConnection\(window\.navigator\)\) return;\s*if \(prefetchAlkkagiTitleOnce\.queued\) return;/);
    });
    it('대체 글꼴 크기를 쨈 글꼴과 맞추고 제목 높이를 고정해 글꼴이 바뀌어도 화면이 밀리지 않아요', () => {
        const css = fs.readFileSync(new URL('../alkkagi.css', import.meta.url), 'utf8');
        // 기기에 있는 글꼴(local)만 써서 따로 받는 파일이 없어요
        const faces = css.match(/@font-face \{[^}]*\}/g) || [];
        assert.equal(faces.length, 6);
        for (const f of faces) {
            assert.match(f, /font-family: 'JJAEM (Body|Title) Fit( N)?'/);
            assert.doesNotMatch(f, /url\(/);
            assert.match(f, /ascent-override: [\d.]+%; descent-override: [\d.]+%; line-gap-override: 0%;/);
        }
        assert.match(css, /font-family: 'JJAEM Title Fit'; src: local\('Noto Sans CJK KR'\)[^}]*size-adjust: 102\.17%; ascent-override: 98\.37%; descent-override: 23\.98%;/);
        assert.match(css, /font-family: 'JJAEM Body Fit N'; font-weight: 400; src: local\('NanumGothic'\)[^}]*size-adjust: 97\.87%;/);
        // 제목은 쨈 제목 → 대체 글꼴 순서이고 높이를 고정해요
        assert.match(css, /\.alk-title \{[^}]*font-family: 'JJAEM Title', 'JJAEM Title Fit', 'JJAEM Title Fit N', 'JJAEM Title Flat', 'JJAEM Body', sans-serif;[^}]*line-height: 1;[^}]*height: 1em;[^}]*white-space: nowrap;/);
        // 입체 제목 @font-face 두 줄은 따로 나눈 파일에 있고, 알까기 글꼴 CSS와 겹치지 않아요
        const fontsCss = fs.readFileSync(new URL('../alkkagiFonts.css', import.meta.url), 'utf8');
        const titleCss = fs.readFileSync(new URL('../alkkagiTitleFont.css', import.meta.url), 'utf8');
        assert.equal((titleCss.match(/@font-face\{font-family:'JJAEM Title';/g) || []).length, 2);
        assert.equal((fontsCss.match(/@font-face\{font-family:'JJAEM Title';/g) || []).length, 0);
        assert.equal((fontsCss.match(/@font-face\{font-family:'JJAEM (Body|Title Flat)';/g) || []).length, 6);
        assert.equal(css.split("font-family: 'JJAEM Body', 'JJAEM Body Fit', 'JJAEM Body Fit N', 'Pretendard'").length - 1, 2);
        // 낮은 화면(640px 이하)도 입체 제목 40px이에요(평면으로 바꾸지 않아요)
        assert.match(css, /@media \(max-height: 640px\) \{[^}]*\.alk-title \{ font-size: 40px; \}/);
    });
});
