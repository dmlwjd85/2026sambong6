/** 대시보드 내 카드 한 장에만 쓰는 6등급 꾸밈. 테두리·보석·오라는 이미지입니다. */
export const DASH_RANK_SPECS = {
    saenaegi: { stars: 1, star: 'gray', name: 'white', motion: '', art: '', aura: '', statsGold: false },
    chobo: { stars: 2, star: 'green', name: 'white', motion: 'soft', art: '', aura: 'ranks/dash/aura-chobo.webp', statsGold: false },
    jungsu: { stars: 2, star: 'silver', name: 'silver', motion: 'halo', art: '', aura: 'ranks/dash/aura-jungsu.webp', statsGold: false },
    gosu: { stars: 3, star: 'gold', name: 'gold', motion: 'rays', art: '', aura: 'ranks/dash/aura-gosu.webp', statsGold: false },
    guardian: { stars: 5, star: 'purple', name: 'rainbow', motion: 'particles', art: 'ranks/dash/holo-foil.jpg', aura: 'ranks/dash/aura-guardian.webp', statsGold: false },
    legend: { stars: 6, star: 'gold', name: 'rainbow', motion: 'flame', art: 'ranks/dash/legend-flame-bg.jpg', aura: 'ranks/dash/aura-legend.webp', statsGold: true },
};

export function dashRankSpec(ring) {
    return DASH_RANK_SPECS[ring] || null;
}

export function dashRankFrameSrc(ring) {
    return dashRankSpec(ring) ? `ranks/dash/frame-${ring}.webp` : '';
}

export function dashRankAuraSrc(ring) {
    const spec = dashRankSpec(ring);
    return spec && spec.aura ? spec.aura : '';
}

export function dashRankStarHtml(ring) {
    const spec = dashRankSpec(ring);
    if (!spec) return '';
    return Array.from({ length: spec.stars }, () => (
        `<img src="ranks/dash/star-${spec.star}.png" alt="" class="dash-rank-star">`
    )).join('');
}
