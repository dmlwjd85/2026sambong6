import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { jobIconDisplayToken, isJobIconStorageToken } from './jobs.js';
import { APP_ICON_DISPLAY, PAINTED_ICON_NAMES, paintedIconName, paintedIconSources } from './paintedIcons.js';

test('set41 표시 이름은 41개이고 직업 저장 토큰과 겹치지 않는다', () => {
    assert.equal(PAINTED_ICON_NAMES.length, 41);
    assert.equal(new Set(PAINTED_ICON_NAMES).size, 41);
    for (const name of PAINTED_ICON_NAMES) {
        assert.equal(isJobIconStorageToken(name), false, name);
        assert.equal(paintedIconName(name), name);
    }
    for (const key of Object.keys(APP_ICON_DISPLAY)) {
        assert.equal(isJobIconStorageToken(key), false, key);
        assert.equal(paintedIconName(key), APP_ICON_DISPLAY[key]);
    }
});

test('직업 아이콘 문자열은 파일 경로로 바뀌지 않는다', () => {
    assert.equal(jobIconDisplayToken('fa' + '-shield-cat'), 'shield');
    assert.equal(jobIconDisplayToken('crown'), 'crown');
    assert.equal(jobIconDisplayToken('fa' + '-piggy-bank'), 'piggy');
    assert.equal(paintedIconName('crown'), '');
    assert.equal(paintedIconName('shield'), '');
    assert.equal(paintedIconName('fa' + '-shield-cat'), '');
    assert.equal(paintedIconName('piggy'), '');
    assert.equal(paintedIconName('fa' + '-piggy-bank'), '');
    for (const token of ['crown', 'shield', 'fa' + '-shield-cat', 'piggy']) {
        const shown = jobIconDisplayToken(token);
        assert.equal(shown.includes('/'), false);
        assert.equal(shown.includes('webp'), false);
        assert.equal(paintedIconSources(token, '/2026sambong6/'), null);
    }
});

test('화면 주소는 webp 96·192·288과 svg24만 가리킨다', () => {
    const sources = paintedIconSources('home', '/2026sambong6/');
    assert.equal(sources.id, 'home');
    assert.equal(sources.webp[96], '/2026sambong6/icons/set41/webp/96/home.webp');
    assert.equal(sources.webp[192], '/2026sambong6/icons/set41/webp/192/home.webp');
    assert.equal(sources.webp[288], '/2026sambong6/icons/set41/webp/288/home.webp');
    assert.equal(sources.svg24, '/2026sambong6/icons/set41/svg24/home.svg');
    assert.equal(JSON.stringify(sources).includes('512'), false);
    assert.equal(paintedIconSources('lyre', '/2026sambong6/').id, 'literature');
});

test('앱 껍질이 set41 이름 또는 표시 별칭을 쓴다', () => {
    const html = readFileSync(new URL('../app-shell.html', import.meta.url), 'utf8');
    for (const name of PAINTED_ICON_NAMES) {
        const direct = html.includes(`data-oly="${name}"`);
        const via = Object.entries(APP_ICON_DISPLAY).some(([token, file]) => file === name && html.includes(`data-oly="${token}"`));
        assert.equal(direct || via, true, name);
    }
    assert.equal(html.includes('icon-drafts'), false);
    assert.equal(html.includes('/512/'), false);
});
