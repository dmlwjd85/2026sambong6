import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DASH_RANK_SPECS, dashRankFrameSrc, dashRankSpec, dashRankStarHtml } from './dashRank.js';

describe('대시보드 등급 카드', () => {
    it('여섯 등급의 별 개수와 이름 색, 움직임이 정해져 있습니다', () => {
        assert.equal(DASH_RANK_SPECS.saenaegi.stars, 1);
        assert.equal(DASH_RANK_SPECS.saenaegi.name, 'white');
        assert.equal(DASH_RANK_SPECS.saenaegi.motion, '');
        assert.equal(DASH_RANK_SPECS.chobo.stars, 2);
        assert.equal(DASH_RANK_SPECS.jungsu.stars, 2);
        assert.equal(DASH_RANK_SPECS.jungsu.name, 'silver');
        assert.equal(DASH_RANK_SPECS.gosu.stars, 3);
        assert.equal(DASH_RANK_SPECS.gosu.motion, 'once');
        assert.equal(DASH_RANK_SPECS.guardian.stars, 5);
        assert.equal(DASH_RANK_SPECS.guardian.name, 'rainbow');
        assert.equal(DASH_RANK_SPECS.guardian.motion, 'slow');
        assert.equal(DASH_RANK_SPECS.legend.stars, 6);
        assert.equal(DASH_RANK_SPECS.legend.statsGold, true);
        assert.equal(DASH_RANK_SPECS.legend.motion, 'legend');
        assert.equal(dashRankSpec('missing'), null);
    });

    it('테두리와 별은 그린 도형이 아니라 이미지 파일입니다', () => {
        assert.equal(dashRankFrameSrc('legend'), 'ranks/dash/frame-legend.png');
        const stars = dashRankStarHtml('guardian');
        assert.equal((stars.match(/<img /g) || []).length, 5);
        assert.match(stars, /star-purple\.png/);
        assert.equal(dashRankStarHtml(''), '');
    });
});
