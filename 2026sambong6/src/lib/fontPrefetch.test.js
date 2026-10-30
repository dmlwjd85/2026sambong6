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
});
