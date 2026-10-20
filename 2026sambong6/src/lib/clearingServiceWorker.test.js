import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';

const src = fs.readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');

describe('롤백 서비스 워커', () => {
    it('탐색을 가로채지 않고, navigate 완료를 활성화가 기다리지 않습니다', () => {
        assert.equal(src.includes("addEventListener('fetch'"), false);
        assert.equal(src.includes('await client.navigate'), false);
        assert.match(src, /client\.navigate\(url\.href\)\.catch\(\(\) => \{\}\)/);
        assert.match(src, /get\('sw-clear'\) === SW_CLEAR/);
        const navigateAt = src.indexOf('client.navigate');
        const unregisterAt = src.indexOf('self.registration.unregister');
        assert.ok(navigateAt > 0 && unregisterAt > navigateAt);
    });
});
