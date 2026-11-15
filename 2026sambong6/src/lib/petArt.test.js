import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petArtHtml, petEggHtml, petEggImageUrl, petImageUrl, petSvg } from './petArt.js';
import { PET_SPECIES } from './petGame.js';

test('종·단계마다 그림 파일 주소가 있어요', () => {
    Object.keys(PET_SPECIES).forEach((sp) => {
        [1, 2, 3].forEach((st) => assert.match(petImageUrl(sp, st), new RegExp(`pets/${sp}_${st}\\.webp$`)));
    });
    assert.match(petEggImageUrl(), /pets\/egg\.webp$/);
});

test('이상한 값은 안전한 그림으로 바꿔요', () => {
    assert.match(petImageUrl('nope', 9), /pets\/emberkit_3\.webp$/);
    assert.match(petImageUrl('zapowl', 0), /pets\/zapowl_1\.webp$/);
    const html = petArtHtml({ species: '"><script>', stage: 2, alt: '<b>"x' });
    assert.doesNotMatch(html, /<script|<b>/);
});

test('일러스트 마크업: 지연 로딩·색다름·그림자·대체용 값', () => {
    const lazy = petArtHtml({ species: 'stardrake', stage: 3, shiny: true, mood: 'hungry' });
    assert.match(lazy, /loading="lazy"/);
    assert.match(lazy, /is-shiny/);
    assert.match(lazy, /data-pet-sp="stardrake"/);
    assert.match(lazy, /data-pet-mood="hungry"/);
    assert.match(petArtHtml({ species: 'snowbun', eager: true }), /loading="eager"/);
    const sil = petArtHtml({ species: 'snowbun', stage: 2, shiny: true, silhouette: true });
    assert.match(sil, /is-silhouette/);
    assert.doesNotMatch(sil, /is-shiny/);
});

test('알: 쓰다듬을수록 금이 늘어요', () => {
    const count = (h) => (h.match(/stroke-width="2.4"/g) || []).length;
    assert.equal(count(petEggHtml({ taps: 0, total: 10 })), 0);
    assert.equal(count(petEggHtml({ taps: 5, total: 10 })), 2);
    assert.equal(count(petEggHtml({ taps: 10, total: 10 })), 4);
});

test('대체용 도형 그림은 그대로 그려져요', () => {
    assert.match(petSvg({ species: 'dropotter', stage: 2 }), /^<svg class="pet-svg"/);
});
