import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';

const src = fs.readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');
const indexHtml = fs.readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const manifest = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../public/manifest.webmanifest', import.meta.url)), 'utf8'));
function readPublic(name) {
    return fs.readFileSync(fileURLToPath(new URL(`../../public/${name}`, import.meta.url)));
}

function pngSize(buf) {
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('설치용 서비스 워커', () => {
    it('네트워크만 보고, navigate 완료를 활성화가 기다리지 않습니다', () => {
        assert.match(src, /addEventListener\('fetch'/);
        assert.equal(src.includes('await client.navigate'), false);
        assert.equal(src.includes('self.registration.unregister'), false);
        assert.equal(src.includes("cache: 'reload'"), false);
        assert.equal(src.includes('caches.open'), false);
        assert.equal(src.includes('caches.put'), false);
        assert.equal(/localStorage/.test(src), false);
        assert.equal(/indexedDB/.test(src), false);
        assert.match(src, /client\.navigate\(url\.href\)\.catch\(\(\) => \{\}\)/);
        assert.match(src, /get\('sw-clear'\) === SW_CLEAR/);
        assert.match(src, /const SW_CLEAR = '20261019'/);
        assert.match(src, /replaceExistingWorker = !!self\.registration\.active/);
        assert.match(src, /if \(!replaceExistingWorker\) return/);
        assert.match(src, /fetch\(event\.request\)/);
        const clearGuard = src.indexOf("get('sw-clear') === SW_CLEAR");
        const respondWith = src.indexOf('event.respondWith');
        assert.ok(clearGuard > 0 && respondWith > clearGuard);
        const fetchAt = src.indexOf("addEventListener('fetch'");
        assert.equal(src.slice(fetchAt).includes('client.navigate'), false);
        assert.equal(src.slice(fetchAt).includes('unregister'), false);
        const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
        assert.match(head, /mate-sw-clear-once/);
        assert.match(head, /getRegistrations\(\)/);
        assert.match(head, /\.unregister\(\)/);
        assert.match(head, /caches\.delete\(key\)/);
        assert.match(head, /location\.reload\(\)/);
        assert.match(head, /sessionStorage\.getItem\(onceKey\) !== SW_CLEAR/);
        const recoveryAt = head.indexOf("params.get('sw-clear') === SW_CLEAR");
        const registerAt = head.indexOf('function registerWorker');
        assert.ok(recoveryAt > 0 && registerAt > 0 && recoveryAt < head.indexOf('location.reload()'));
    });
});

describe('설치 매니페스트', () => {
    it('파일 매니페스트와 PR #30 홈 그림 PNG를 연결합니다', () => {
        assert.equal(manifest.name, 'MATE');
        assert.equal(manifest.short_name, 'MATE');
        assert.equal(manifest.start_url, '/2026sambong6/');
        assert.equal(manifest.scope, '/2026sambong6/');
        assert.equal(manifest.display, 'standalone');
        assert.equal(manifest.id, '/2026sambong6/');
        const bySize = Object.fromEntries(manifest.icons.map((icon) => [icon.sizes, icon]));
        assert.equal(bySize['192x192'].type, 'image/png');
        assert.equal(bySize['512x512'].type, 'image/png');
        assert.equal(bySize['192x192'].src.includes('data:'), false);
        assert.equal(bySize['512x512'].src.includes('data:'), false);
        assert.deepEqual(pngSize(readPublic(bySize['192x192'].src)), { width: 192, height: 192 });
        assert.deepEqual(pngSize(readPublic(bySize['512x512'].src)), { width: 512, height: 512 });
        assert.deepEqual(pngSize(readPublic('apple-touch-icon.png')), { width: 180, height: 180 });
        const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
        assert.match(head, /rel="manifest" href="%BASE_URL%manifest\.webmanifest"/);
        assert.match(head, /rel="apple-touch-icon"/);
        assert.match(head, /serviceWorker\.register\('%BASE_URL%sw\.js'/);
        assert.equal(head.includes('document.write'), false);
        assert.equal(head.includes('data:image/svg+xml'), false);
    });
});
