/** 대시보드 내 카드 한 장에만 쓰는 6등급 꾸밈. 테두리·별·배경은 이미지입니다. */
export const DASH_RANK_SPECS = {
    saenaegi: { stars: 1, star: 'gray', name: 'white', motion: '', art: '', statsGold: false },
    chobo: { stars: 2, star: 'green', name: 'white', motion: '', art: '', statsGold: false },
    jungsu: { stars: 2, star: 'silver', name: 'silver', motion: '', art: '', statsGold: false },
    gosu: { stars: 3, star: 'gold', name: 'gold', motion: 'once', art: '', statsGold: false },
    guardian: { stars: 5, star: 'purple', name: 'rainbow', motion: 'slow', art: 'ranks/dash/holo-foil.jpg', statsGold: false },
    legend: { stars: 6, star: 'gold', name: 'rainbow', motion: 'legend', art: 'ranks/dash/legend-flame-bg.jpg', statsGold: true },
};

export function dashRankSpec(ring) {
    return DASH_RANK_SPECS[ring] || null;
}

export function dashRankFrameSrc(ring) {
    return dashRankSpec(ring) ? `ranks/dash/frame-${ring}.png` : '';
}

export function dashRankStarHtml(ring) {
    const spec = dashRankSpec(ring);
    if (!spec) return '';
    return Array.from({ length: spec.stars }, () => (
        `<img src="ranks/dash/star-${spec.star}.png" alt="" class="dash-rank-star">`
    )).join('');
}
