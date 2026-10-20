import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';

const src = fs.readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');

describe('롤백 서비스 워커', () => {
    it('navigate 요청 객체에 RequestInit을 붙이지 않습니다', () => {
        assert.equal(src.includes('fetch(event.request,'), false);
        assert.match(src, /fetch\(target\.href,\s*\{\s*cache:\s*'reload'/);
    });

    it('캐시를 지운 주소는 다시 열지 않고, navigate 거부는 기다렸다가 삼킵니다', () => {
        assert.match(src, /get\('sw-clear'\) === SW_CLEAR/);
        assert.match(src, /await client\.navigate\(url\.href\)/);
        assert.match(src, /await self\.clients\.claim\(\)/);
        const navigateAt = src.indexOf('await client.navigate');
        const unregisterAt = src.indexOf('self.registration.unregister');
        assert.ok(navigateAt > 0 && unregisterAt > navigateAt);
    });
});
