import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractPadletUrlFromInput,
    padletEmbedUrl,
    sanitizePadletUrl,
} from './padlet.js';

describe('패들렛 주소', () => {
    it('padlet.com·org 보드만 https로 남긴다', () => {
        assert.equal(sanitizePadletUrl('https://padlet.com/teacher/board-1'), 'https://padlet.com/teacher/board-1');
        assert.equal(sanitizePadletUrl('padlet.com/embed/abc123'), 'https://padlet.com/embed/abc123');
        assert.equal(sanitizePadletUrl('https://www.padlet.org/class/notes'), 'https://padlet.org/class/notes');
        assert.equal(sanitizePadletUrl('https://evil.example/padlet.com/x'), '');
        assert.equal(sanitizePadletUrl('javascript:alert(1)'), '');
        assert.equal(sanitizePadletUrl('http://padlet.com/a/b'), '');
        const embed = extractPadletUrlFromInput('<iframe src="https://padlet.com/embed/xyz99" allow="camera"></iframe>');
        assert.equal(embed, 'https://padlet.com/embed/xyz99');
        assert.equal(padletEmbedUrl('https://padlet.com/teacher/board-1'), 'https://padlet.com/teacher/board-1');
    });
});
