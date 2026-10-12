import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const world = readFileSync(join(root, 'src/sambongWorld.js'), 'utf8');
const jobs = readFileSync(join(root, 'src/lib/jobs.js'), 'utf8');

const slots = {
    'nav-home': 'home',
    'nav-plaza': 'plaza',
    'nav-quests': 'quest',
    'tool-ideas': 'padlet',
    'tool-notes': 'classboard',
    'shop-class': 'classitem',
};

test('기존 아이콘 자리가 set41 webp와 svg24를 가리킨다', () => {
    for (const [oldName, id] of Object.entries(slots)) {
        assert.equal(html.includes(`nav/${oldName}.webp`), false, oldName);
        assert.equal(html.includes(`icons/set41/svg24/${id}.svg`), true, id);
        for (const size of [96, 192, 288]) {
            assert.equal(html.includes(`icons/set41/webp/${size}/${id}.webp`), true, `${id}-${size}`);
            assert.equal(existsSync(join(root, 'public/icons/set41/webp', String(size), `${id}.webp`)), true);
        }
        assert.equal(existsSync(join(root, 'public/icons/set41/svg24', `${id}.svg`)), true);
    }
    assert.equal(world.includes('nav/thumbs-up.svg'), true);
    assert.equal(world.includes('icons/set41'), false);
    assert.equal(existsSync(join(root, 'public/icons/set41/webp/512')), false);
});

test('직업 icon 저장 문자열은 그대로다', () => {
    assert.match(jobs, /icon: 'fa-crown'/);
    assert.match(jobs, /icon: 'fa-shield-cat'/);
    assert.equal(jobs.includes('icons/set41'), false);
    assert.equal(jobs.includes('paintedIcon'), false);
});
