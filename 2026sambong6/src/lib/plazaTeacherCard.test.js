import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('선생님 광장 카드', () => {
    it('봉 조절판을 얼굴 아래 한 줄로 두어 얼굴을 가리지 않는다', () => {
        const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
        assert.match(css, /\.plaza-card-core-gm\s*\{[^}]*flex-direction:\s*column/);
        assert.match(css, /\.plaza-card-core-gm \.plaza-gm-side\s*\{[^}]*width:\s*100%/);
        assert.match(css, /\.plaza-card-core-gm \.plaza-card-face\s*\{[^}]*z-index:\s*3/);
    });
});
