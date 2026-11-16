/**
 * 메이트 펫 그림(문자열, DOM 없음).
 * 기본 그림은 public/pets/ 의 일러스트(종 × 단계 21장 + 알, WebP)예요. petArtHtml·petEggHtml 이 <img>를 만들어요.
 * 아래 petSvg 는 그림 파일을 못 불러올 때 대신 쓰는 도형 그림이에요. 모든 종 × 세 단계를 도형으로 그려요.
 * 모두 이 앱을 위해 새로 만든 몬스터예요. 종마다 귀·꼬리·머리 장식이 다르고, 단계가 오를수록 몸이 커지고 장식이 늘어요.
 * shiny(색이 다른 펫)는 색만 바꿔요. mood에 따라 눈·입이 달라져요.
 */

const PALETTES = Object.freeze({
    emberkit: { main: '#ff8a3d', dark: '#d9480f', light: '#ffe3b8', accent: '#ffd43b', glow: '#ff6b35' },
    dropotter: { main: '#4dabf7', dark: '#1971c2', light: '#e7f5ff', accent: '#99e9f2', glow: '#74c0fc' },
    sproutdeer: { main: '#8ecf5a', dark: '#4f9a2a', light: '#f4fce3', accent: '#ff8fab', glow: '#b2f2bb' },
    zapowl: { main: '#ffd43b', dark: '#e67700', light: '#fff9db', accent: '#5f3dc4', glow: '#ffe066' },
    snowbun: { main: '#d0ebff', dark: '#74a9d8', light: '#ffffff', accent: '#66d9e8', glow: '#a5d8ff' },
    pebbletle: { main: '#a9b388', dark: '#6b7445', light: '#f1f3e0', accent: '#8d6e63', glow: '#c5cba3' },
    stardrake: { main: '#9775fa', dark: '#5f3dc4', light: '#f3f0ff', accent: '#ffe066', glow: '#d0bfff' },
    punchroo: { main: '#d9a066', dark: '#9c6b3c', light: '#fff1dc', accent: '#e03131', glow: '#ffa8a8' },
});

const SHINY = Object.freeze({
    emberkit: { main: '#5c7cfa', dark: '#364fc7', light: '#edf2ff', accent: '#66d9e8', glow: '#748ffc' },
    dropotter: { main: '#f783ac', dark: '#c2255c', light: '#fff0f6', accent: '#ffdeeb', glow: '#faa2c1' },
    sproutdeer: { main: '#ffa94d', dark: '#d9480f', light: '#fff4e6', accent: '#b197fc', glow: '#ffc078' },
    zapowl: { main: '#63e6be', dark: '#087f5b', light: '#e6fcf5', accent: '#f03e3e', glow: '#96f2d7' },
    snowbun: { main: '#e5dbff', dark: '#9775fa', light: '#ffffff', accent: '#ffa8a8', glow: '#d0bfff' },
    pebbletle: { main: '#ffc9c9', dark: '#c92a2a', light: '#fff5f5', accent: '#495057', glow: '#ffa8a8' },
    stardrake: { main: '#343a40', dark: '#111417', light: '#dee2e6', accent: '#ff6b6b', glow: '#868e96' },
    punchroo: { main: '#868e96', dark: '#495057', light: '#f1f3f5', accent: '#1c7ed6', glow: '#a5d8ff' },
});

export function petPalette(species, shiny = false) {
    return (shiny ? SHINY : PALETTES)[species] || PALETTES.emberkit;
}

const OUT = '#3b2a1a';
const flame = (x, y, s, c, rot = 0) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0C-9-9 3-14-1-25 11-15 11-6 0 0Z" fill="${c}" stroke="${OUT}" stroke-width="${1.6 / s}" stroke-linejoin="round"/>`;
const star = (x, y, r, c) => {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        pts.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${c}" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>`;
};
const drop = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-12C6-4 8 0 8 4A8 8 0 0 1-8 4C-8 0-6-4 0-12Z" fill="${c}" stroke="${OUT}" stroke-width="${1.5 / s}"/>`;
const leaf = (x, y, s, rot, c) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0C-8-6-8-16 0-22 8-16 8-6 0 0Z" fill="${c}" stroke="${OUT}" stroke-width="${1.5 / s}" stroke-linejoin="round"/>`;
const bolt = (x, y, s, rot, c) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M2-14-7 1H0L-3 14 8-3H1Z" fill="${c}" stroke="${OUT}" stroke-width="${1.5 / s}" stroke-linejoin="round"/>`;
const crystal = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-14 6-4 0 6-6-4Z" fill="${c}" stroke="${OUT}" stroke-width="${1.4 / s}" stroke-linejoin="round"/>`;

function face(cx, cy, r, mood, { beak = '', eyeGap = 0.42, eyeR = 0.2 } = {}) {
    const ex = r * eyeGap;
    const er = r * eyeR;
    const ey = cy + r * 0.05;
    let eyes;
    if (mood === 'starving') {
        eyes = [-1, 1].map((d) => `<path d="M${cx + d * ex - er} ${ey - er * 0.6}l${er * 1.6} ${er * 0.7}l${-er * 1.6} ${er * 0.7}" fill="none" stroke="${OUT}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="${d > 0 ? `translate(${2 * (cx + d * ex)} 0) scale(-1 1)` : ''}"/>`).join('');
    } else {
        eyes = [-1, 1].map((d) => {
            const x = cx + d * ex;
            const lid = mood === 'hungry' ? `<path d="M${x - er - 1} ${ey - er * 0.2}h${er * 2 + 2}v${-er - 2}h${-er * 2 - 2}Z" fill="var(--pet-skin)"/><path d="M${x - er - 0.5} ${ey - er * 0.2}h${er * 2 + 1}" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round"/>` : '';
            return `<ellipse cx="${x}" cy="${ey}" rx="${er}" ry="${er * 1.2}" fill="#241a12"/><circle cx="${x - er * 0.3}" cy="${ey - er * 0.45}" r="${er * 0.38}" fill="#fff"/><circle cx="${x + er * 0.35}" cy="${ey + er * 0.4}" r="${er * 0.18}" fill="#fff" opacity="0.8"/>${lid}`;
        }).join('');
    }
    const my = cy + r * 0.42;
    let mouth;
    if (beak) mouth = beak;
    else if (mood === 'happy') mouth = `<path d="M${cx - r * 0.16} ${my}Q${cx} ${my + r * 0.22} ${cx + r * 0.16} ${my}Z" fill="#e8590c" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>`;
    else if (mood === 'ok') mouth = `<path d="M${cx - r * 0.12} ${my}Q${cx} ${my + r * 0.12} ${cx + r * 0.12} ${my}" fill="none" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round"/>`;
    else mouth = `<path d="M${cx - r * 0.14} ${my + r * 0.08}Q${cx - r * 0.07} ${my - r * 0.04} ${cx} ${my + r * 0.06}T${cx + r * 0.14} ${my + r * 0.04}" fill="none" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round"/>`;
    const blush = mood === 'happy' || mood === 'ok'
        ? [-1, 1].map((d) => `<ellipse cx="${cx + d * r * 0.66}" cy="${cy + r * 0.34}" rx="${r * 0.14}" ry="${r * 0.09}" fill="#ff8787" opacity="0.6"/>`).join('')
        : '';
    const tear = mood === 'starving' ? `<path d="M${cx + ex + er} ${ey + er}q3 5 0 8q-3-3 0-8Z" fill="#74c0fc"/>` : '';
    return eyes + blush + mouth + tear;
}

/**
 * @param {{ species: string, stage?: number, shiny?: boolean, mood?: string, uid?: string }} o
 * @returns {string} SVG 문자열(120×120)
 */
export function petSvg({ species = 'emberkit', stage = 1, shiny = false, mood = 'happy' } = {}) {
    const p = petPalette(species, shiny);
    const st = Math.max(1, Math.min(3, Math.floor(stage) || 1));
    const m = ['happy', 'ok', 'hungry', 'starving'].includes(mood) ? mood : 'happy';
    // 단계별 크기: 머리 반지름, 몸통 반지름, 머리·몸 위치
    const hr = [25, 26, 26][st - 1];
    const brx = [17, 22, 27][st - 1];
    const bry = [14, 19, 25][st - 1];
    const by = [88, 84, 80][st - 1];
    const hy = by - bry - hr * [0.62, 0.6, 0.55][st - 1];
    const cx = 60;
    const S = `stroke="${OUT}" stroke-width="2" stroke-linejoin="round"`;
    const back = [];
    const mid = [];
    const front = [];
    let headShape = `<circle cx="${cx}" cy="${hy}" r="${hr}" fill="${p.main}" ${S}/>`;
    let bodyShape = `<ellipse cx="${cx}" cy="${by}" rx="${brx}" ry="${bry}" fill="${p.main}" ${S}/><ellipse cx="${cx}" cy="${by + bry * 0.18}" rx="${brx * 0.62}" ry="${bry * 0.66}" fill="${p.light}"/>`;
    const feet = [-1, 1].map((d) => `<ellipse cx="${cx + d * brx * 0.55}" cy="${by + bry - 1}" rx="${brx * 0.34}" ry="5" fill="${p.dark}" ${S}/>`).join('');
    const arms = [-1, 1].map((d) => `<ellipse cx="${cx + d * (brx - 2)}" cy="${by - bry * 0.1}" rx="5" ry="${6 + st}" fill="${p.main}" ${S} transform="rotate(${d * -22} ${cx + d * (brx - 2)} ${by - bry * 0.1})"/>`).join('');
    let faceOpts = {};

    if (species === 'emberkit') {
        // 불꽃 고양이: 뾰족 귀, 불꽃 꼬리 → 이마 불꽃 → 불꽃 갈기와 줄무늬
        [-1, 1].forEach((d) => {
            back.push(`<path d="M${cx + d * hr * 0.35} ${hy - hr * 0.75}L${cx + d * hr * 0.98} ${hy - hr * 1.35}L${cx + d * hr * 0.95} ${hy - hr * 0.3}Z" fill="${p.main}" ${S}/><path d="M${cx + d * hr * 0.58} ${hy - hr * 0.78}L${cx + d * hr * 0.88} ${hy - hr * 1.1}L${cx + d * hr * 0.86} ${hy - hr * 0.6}Z" fill="${p.accent}"/>`);
        });
        back.push(`<path d="M${cx + brx - 3} ${by + 4}q${14 + st * 3} ${-2} ${12 + st * 3} ${-18 - st * 2}" fill="none" stroke="${OUT}" stroke-width="${8 + st}" stroke-linecap="round"/><path d="M${cx + brx - 3} ${by + 4}q${14 + st * 3} ${-2} ${12 + st * 3} ${-18 - st * 2}" fill="none" stroke="${p.main}" stroke-width="${4 + st}" stroke-linecap="round"/>`);
        // 꼬리에는 줄무늬만 두고, 불꽃은 머리 위에 피워요.
        back.push(`<path d="M${cx + brx + 5 + st * 2} ${by - 1}l4 -3M${cx + brx + 9 + st * 3} ${by - 8 - st}l5 -1" stroke="${p.dark}" stroke-width="2.4" stroke-linecap="round"/>`);
        front.push(flame(cx, hy - hr * 0.86, 0.5 + st * 0.12, p.accent));
        if (st >= 3) {
            [-52, -26, 26, 52].forEach((a) => back.push(flame(cx + Math.sin((a * Math.PI) / 180) * hr * 1.05, hy - Math.cos((a * Math.PI) / 180) * hr * 0.95 + 4, 0.95, p.glow, a)));
            [-1, 1].forEach((d) => front.push(`<path d="M${cx + d * hr * 0.92} ${hy - 2}l${-d * 7} 2M${cx + d * hr * 0.96} ${hy + 5}l${-d * 7} 1" stroke="${p.dark}" stroke-width="2.4" stroke-linecap="round"/>`));
        }
        [-1, 1].forEach((d) => front.push(`<path d="M${cx + d * hr * 0.55} ${hy + hr * 0.36}h${d * 9}M${cx + d * hr * 0.55} ${hy + hr * 0.48}l${d * 8} 3" stroke="${OUT}" stroke-width="1" stroke-linecap="round" opacity="0.6"/>`));
    } else if (species === 'dropotter') {
        // 물방울 수달: 둥근 귀, 납작 꼬리, 머리 위 물방울 → 지느러미 볏 → 물방울 왕관과 물결 목도리
        [-1, 1].forEach((d) => back.push(`<circle cx="${cx + d * hr * 0.78}" cy="${hy - hr * 0.66}" r="${hr * 0.26}" fill="${p.main}" ${S}/><circle cx="${cx + d * hr * 0.78}" cy="${hy - hr * 0.66}" r="${hr * 0.12}" fill="${p.dark}"/>`));
        back.push(`<path d="M${cx + brx - 4} ${by + 6}c${12 + st * 4} 4 ${20 + st * 5} -6 ${22 + st * 5} -16c-8 2 -14 4 -20 4Z" fill="${p.dark}" ${S}/>`);
        headShape += `<ellipse cx="${cx}" cy="${hy + hr * 0.36}" rx="${hr * 0.5}" ry="${hr * 0.36}" fill="${p.light}"/>`;
        if (st === 1) front.push(drop(cx, hy - hr * 1.02, 0.6, p.accent));
        if (st === 2) back.push(`<path d="M${cx - 9} ${hy - hr * 0.86}q9 -22 20 -4q-4 -4 -8 6Z" fill="${p.accent}" ${S}/>`);
        if (st >= 3) {
            [-13, 0, 13].forEach((dx, i) => front.push(drop(cx + dx, hy - hr * (i === 1 ? 1.18 : 1.02), i === 1 ? 0.78 : 0.56, p.accent)));
            mid.push(`<path d="M${cx - brx * 0.9} ${by - bry * 0.78}q${brx * 0.3} 8 ${brx * 0.6} 0t${brx * 0.6} 0t${brx * 0.6} 0v7q${-brx * 0.3} 7 ${-brx * 0.6} 0t${-brx * 0.6} 0t${-brx * 0.6} 0Z" fill="${p.accent}" ${S}/>`);
        }
        front.push(`<ellipse cx="${cx}" cy="${hy + hr * 0.22}" rx="3.4" ry="2.4" fill="${OUT}"/>`);
    } else if (species === 'sproutdeer') {
        // 새싹 사슴: 잎사귀 귀, 머리 새싹 → 작은 뿔 → 꽃 핀 큰 뿔, 몸의 점무늬
        [-1, 1].forEach((d) => back.push(leaf(cx + d * hr * 0.82, hy - hr * 0.3, 0.9, d * 62, p.dark)));
        back.push(`<circle cx="${cx + brx + 2}" cy="${by + 2}" r="${4 + st}" fill="${p.light}" ${S}/>`);
        if (st === 1) { front.push(leaf(cx - 1, hy - hr * 0.92, 0.6, -28, p.dark)); front.push(leaf(cx + 1, hy - hr * 0.92, 0.6, 28, p.dark)); }
        if (st >= 2) {
            const k = st === 2 ? 0.75 : 1.15;
            [-1, 1].forEach((d) => {
                const x0 = cx + d * hr * 0.36;
                const y0 = hy - hr * 0.86;
                back.push(`<path d="M${x0} ${y0}q${d * 3 * k} ${-12 * k} ${d * 11 * k} ${-17 * k}M${x0 + d * 4 * k} ${y0 - 9 * k}q${-d * 1} ${-7 * k} ${-d * 5 * k} ${-11 * k}${st >= 3 ? `M${x0 + d * 8 * k} ${y0 - 14 * k}q${d * 7 * k} ${-1} ${d * 10 * k} ${-7 * k}` : ''}" fill="none" stroke="${OUT}" stroke-width="${5.5}" stroke-linecap="round"/><path d="M${x0} ${y0}q${d * 3 * k} ${-12 * k} ${d * 11 * k} ${-17 * k}M${x0 + d * 4 * k} ${y0 - 9 * k}q${-d * 1} ${-7 * k} ${-d * 5 * k} ${-11 * k}${st >= 3 ? `M${x0 + d * 8 * k} ${y0 - 14 * k}q${d * 7 * k} ${-1} ${d * 10 * k} ${-7 * k}` : ''}" fill="none" stroke="#a1785a" stroke-width="2.6" stroke-linecap="round"/>`);
                if (st === 2) back.push(leaf(x0 + d * 11 * k, y0 - 16 * k, 0.42, d * 30, p.dark));
                if (st >= 3) [[11, -17], [-1, -20], [18, -21]].forEach(([fx, fy]) => front.push(`<circle cx="${x0 + d * fx * k}" cy="${y0 + fy * k}" r="3.6" fill="${p.accent}" stroke="${OUT}" stroke-width="1.2"/><circle cx="${x0 + d * fx * k}" cy="${y0 + fy * k}" r="1.2" fill="#fff3bf"/>`));
            });
        }
        [[-0.45, -0.25], [0.5, -0.05], [-0.2, 0.42]].slice(0, st).forEach(([dx, dy]) => mid.push(`<circle cx="${cx + dx * brx * 1.25}" cy="${by + dy * bry - bry * 0.55}" r="2.6" fill="${p.light}" opacity="0.9"/>`));
        front.push(`<ellipse cx="${cx}" cy="${hy + hr * 0.24}" rx="3" ry="2.2" fill="${OUT}"/>`);
    } else if (species === 'zapowl') {
        // 번개 부엉이: 지그재그 깃, 날개, 부리, 번개 꼬리 → 더 큰 날개 → 번개 왕관
        const wing = 10 + st * 5;
        [-1, 1].forEach((d) => {
            back.push(`<path d="M${cx + d * hr * 0.42} ${hy - hr * 0.8}l${d * 4} ${-13 - st * 2}l${d * 5} 8l${d * 5} ${-9 - st}l${d * 2} ${18 + st}Z" fill="${p.dark}" ${S}/>`);
            back.push(`<path d="M${cx + d * (brx - 3)} ${by - bry * 0.6}q${d * wing} ${-4 - st * 4} ${d * (wing + 4)} ${10}q${-d * 4} ${-2} ${-d * 6} 3q${-d * 3} ${-4} ${-d * 6} 2q${-d * 3} ${-3} ${-d * (wing - 8)} ${2 + st}Z" fill="${p.dark}" ${S}/>`);
        });
        back.push(bolt(cx + brx + 6, by + 4, 0.8 + st * 0.12, 40, p.accent));
        headShape += `<circle cx="${cx - hr * 0.4}" cy="${hy + hr * 0.05}" r="${hr * 0.36}" fill="${p.light}" stroke="${p.dark}" stroke-width="1.5"/><circle cx="${cx + hr * 0.4}" cy="${hy + hr * 0.05}" r="${hr * 0.36}" fill="${p.light}" stroke="${p.dark}" stroke-width="1.5"/>`;
        faceOpts = { eyeGap: 0.4, eyeR: 0.19, beak: `<path d="M${cx - 4.5} ${hy + hr * 0.36}h9l-4.5 8Z" fill="#f08c00" ${S}/>` };
        mid.push(`<path d="M${cx - brx * 0.4} ${by - bry * 0.2}l4 5l4-5l4 5l4-5${st >= 2 ? `M${cx - brx * 0.3} ${by + bry * 0.2}l4 5l4-5l4 5` : ''}" fill="none" stroke="${p.dark}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
        if (st >= 3) [-14, 0, 14].forEach((dx, i) => front.push(bolt(cx + dx, hy - hr * (i === 1 ? 1.22 : 1.02), i === 1 ? 0.85 : 0.62, dx * 1.2, p.accent)));
    } else if (species === 'snowbun') {
        // 눈토끼: 긴 귀(얼음 끝), 솜꼬리 → 눈 목도리 → 얼음 왕관과 반짝임
        const el = hr * (0.95 + st * 0.2);
        [-1, 1].forEach((d) => back.push(`<ellipse cx="${cx + d * hr * 0.42}" cy="${hy - hr * 0.7 - el * 0.5}" rx="${hr * 0.24}" ry="${el * 0.62}" fill="${p.main}" ${S} transform="rotate(${d * (10 + st * 3)} ${cx + d * hr * 0.42} ${hy - hr * 0.6})"/><ellipse cx="${cx + d * hr * 0.42}" cy="${hy - hr * 0.7 - el * 0.5}" rx="${hr * 0.1}" ry="${el * 0.42}" fill="${p.accent}" opacity="0.7" transform="rotate(${d * (10 + st * 3)} ${cx + d * hr * 0.42} ${hy - hr * 0.6})"/>`));
        back.push(`<circle cx="${cx + brx + 1}" cy="${by + 4}" r="${6 + st}" fill="${p.light}" ${S}/>`);
        if (st >= 2) mid.push(`<path d="M${cx - brx * 0.85} ${by - bry * 0.82}q${brx * 0.85} 10 ${brx * 1.7} 0l2 8q${-brx * 0.85} 10 ${-brx * 1.7 - 4} 0Z" fill="${p.accent}" ${S}/><path d="M${cx + brx * 0.35} ${by - bry * 0.5}l5 ${10 + st * 2}l-8-2Z" fill="${p.accent}" ${S}/>`);
        if (st >= 3) {
            [-11, 0, 11].forEach((dx, i) => front.push(crystal(cx + dx, hy - hr * (i === 1 ? 0.98 : 0.84), i === 1 ? 0.95 : 0.7, '#e3fafc')));
            [[-40, -18], [42, 6], [-34, 30]].forEach(([dx, dy]) => front.push(`<path d="M${cx + dx} ${hy + dy - 5}v10M${cx + dx - 5} ${hy + dy}h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`));
        }
        front.push(`<path d="M${cx - 2.6} ${hy + hr * 0.22}h5.2l-2.6 3.4Z" fill="#f783ac" stroke="${OUT}" stroke-width="1"/>`);
    } else if (species === 'pebbletle') {
        // 조약돌 거북: 등껍질 → 뾰족 바위 → 눈 덮인 산
        const sw = brx + 8 + st * 3;
        const sh = bry + 10 + st * 4;
        const sy = by - 4;
        let peaks = '';
        // 등껍질 윗선(타원) 위로 솟게 놓아요.
        const top = (k) => sy + 4 - sh * Math.sqrt(1 - k * k) + 4;
        if (st === 2) peaks = [-0.62, -0.2, 0.25, 0.66].map((k) => `<path d="M${cx + k * sw - 7} ${top(k)}l7 -18l7 18Z" fill="${p.light}" ${S}/>`).join('');
        if (st >= 3) peaks = [[-0.6, 18], [-0.08, 30], [0.5, 20]].map(([k, h]) => `<path d="M${cx + k * sw - 12} ${top(k)}l12 ${-h}l12 ${h}Z" fill="${p.accent}" ${S}/><path d="M${cx + k * sw - 4.8} ${top(k) - h * 0.6}l4.8 ${-h * 0.4}l4.8 ${h * 0.4}l-2.8 2.6l-2-2.4l-2 2.4Z" fill="#fff"/>`).join('');
        back.push(peaks);
        back.push(`<path d="M${cx - sw} ${sy + 4}a${sw} ${sh} 0 0 1 ${sw * 2} 0Z" fill="${p.dark}" ${S}/>`);
        back.push(`<path d="M${cx - sw * 0.5} ${sy - sh * 0.5}l${sw * 0.25} ${sh * 0.3}h${sw * 0.5}l${sw * 0.25} ${-sh * 0.3}M${cx - sw * 0.25} ${sy - sh * 0.2}l${-sw * 0.3} ${sh * 0.2}M${cx + sw * 0.25} ${sy - sh * 0.2}l${sw * 0.3} ${sh * 0.2}M${cx - sw * 0.25} ${sy - sh * 0.2}v${sh * 0.22}M${cx + sw * 0.25} ${sy - sh * 0.2}v${sh * 0.22}" fill="none" stroke="${p.light}" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>`);
        back.push(`<path d="M${cx + sw - 4} ${by + 6}l10 3l-9 4Z" fill="${p.main}" ${S}/>`);
        if (st >= 3) [[-0.75, 0.05], [0.3, -0.45], [0.8, 0.0]].forEach(([k, j]) => mid.push(`<ellipse cx="${cx + k * sw}" cy="${sy + j * sh}" rx="6" ry="3.4" fill="#8ecf5a" stroke="${OUT}" stroke-width="1.2"/>`));
        bodyShape = `<ellipse cx="${cx}" cy="${by + 2}" rx="${brx * 0.86}" ry="${bry * 0.8}" fill="${p.light}" ${S}/>`;
    } else if (species === 'punchroo') {
        // 격투 캥거루: 긴 귀, 굵은 꼬리, 빨간 권투 장갑 → 머리띠 → 챔피언 벨트와 큰 장갑
        [-1, 1].forEach((d) => back.push(`<ellipse cx="${cx + d * hr * 0.5}" cy="${hy - hr * 1.05}" rx="${hr * 0.22}" ry="${hr * 0.55}" fill="${p.main}" ${S} transform="rotate(${d * 14} ${cx + d * hr * 0.5} ${hy - hr * 0.7})"/><ellipse cx="${cx + d * hr * 0.5}" cy="${hy - hr * 1.05}" rx="${hr * 0.1}" ry="${hr * 0.36}" fill="${p.light}" transform="rotate(${d * 14} ${cx + d * hr * 0.5} ${hy - hr * 0.7})"/>`));
        back.push(`<path d="M${cx + brx * 0.5} ${by + bry * 0.6}q${18 + st * 4} 6 ${26 + st * 5} -4" fill="none" stroke="${OUT}" stroke-width="${11 + st}" stroke-linecap="round"/><path d="M${cx + brx * 0.5} ${by + bry * 0.6}q${18 + st * 4} 6 ${26 + st * 5} -4" fill="none" stroke="${p.main}" stroke-width="${7 + st}" stroke-linecap="round"/>`);
        headShape += `<ellipse cx="${cx}" cy="${hy + hr * 0.34}" rx="${hr * 0.46}" ry="${hr * 0.32}" fill="${p.light}"/>`;
        mid.push(`<path d="M${cx - brx * 0.42} ${by + bry * 0.05}q${brx * 0.42} ${bry * 0.5} ${brx * 0.84} 0" fill="none" stroke="${p.dark}" stroke-width="1.8" stroke-linecap="round"/>`);
        const g = 7 + st * 1.6;
        [-1, 1].forEach((d) => front.push(`<circle cx="${cx + d * (brx + 2)}" cy="${by - bry * 0.35}" r="${g}" fill="${p.accent}" ${S}/><path d="M${cx + d * (brx + 2) - g * 0.5} ${by - bry * 0.35 - g * 0.2}q${g * 0.5} ${-g * 0.5} ${g}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/><rect x="${cx + d * (brx + 2) - g * 0.55}" y="${by - bry * 0.35 + g * 0.6}" width="${g * 1.1}" height="${g * 0.5}" rx="1.5" fill="#fff" ${S}/>`));
        if (st >= 2) front.push(`<path d="M${cx - hr * 0.95} ${hy - hr * 0.42}q${hr * 0.95} ${-hr * 0.32} ${hr * 1.9} 0v${hr * 0.22}q${-hr * 0.95} ${-hr * 0.3} ${-hr * 1.9} 0Z" fill="${p.accent}" ${S}/><path d="M${cx + hr * 0.92} ${hy - hr * 0.3}l${8} ${-4}l-2 ${8}Z" fill="${p.accent}" ${S}/>`);
        if (st >= 3) {
            mid.push(`<rect x="${cx - brx * 0.95}" y="${by + bry * 0.1}" width="${brx * 1.9}" height="${bry * 0.34}" rx="3" fill="#f59f00" ${S}/><circle cx="${cx}" cy="${by + bry * 0.27}" r="${bry * 0.26}" fill="#ffe066" ${S}/>`);
            mid.push(star(cx, by + bry * 0.27, bry * 0.16, '#fff3bf'));
        }
        front.push(`<ellipse cx="${cx}" cy="${hy + hr * 0.2}" rx="3.2" ry="2.3" fill="${OUT}"/>`);
    } else {
        // 별빛 용: 뿔, 작은 날개, 이마의 별, 별 꼬리 → 큰 날개와 별 무리
        const ws = 0.7 + st * 0.35;
        [-1, 1].forEach((d) => {
            back.push(`<path d="M${cx + d * (brx - 4)} ${by - bry * 0.5}q${d * 16 * ws} ${-26 * ws} ${d * 30 * ws} ${-14 * ws}q${-d * 4 * ws} ${3 * ws} ${-d * 5 * ws} ${9 * ws}q${-d * 5 * ws} ${-3 * ws} ${-d * 8 * ws} ${4 * ws}q${-d * 5 * ws} ${-3 * ws} ${-d * 9 * ws} ${5 * ws}Z" fill="${p.dark}" ${S}/>`);
            back.push(`<path d="M${cx + d * hr * 0.5} ${hy - hr * 0.72}q${d * 3} ${-12 - st * 3} ${d * (11 + st * 2)} ${-15 - st * 4}q${-d * 1} ${9} ${-d * 2} ${18 + st * 2}Z" fill="${p.accent}" ${S}/>`);
        });
        back.push(`<path d="M${cx + brx - 4} ${by + 6}q${16 + st * 3} 4 ${18 + st * 4} ${-10 - st * 2}" fill="none" stroke="${OUT}" stroke-width="${8 + st}" stroke-linecap="round"/><path d="M${cx + brx - 4} ${by + 6}q${16 + st * 3} 4 ${18 + st * 4} ${-10 - st * 2}" fill="none" stroke="${p.main}" stroke-width="${4 + st}" stroke-linecap="round"/>`);
        back.push(star(cx + brx + 14 + st * 4, by - 6 - st * 2, 6 + st, p.accent));
        front.push(star(cx, hy - hr * 0.52, 4 + st * 0.8, p.accent));
        mid.push(`<path d="M${cx - brx * 0.35} ${by - bry * 0.1}h${brx * 0.7}M${cx - brx * 0.42} ${by + bry * 0.25}h${brx * 0.84}" stroke="${p.glow}" stroke-width="1.8" stroke-linecap="round"/>`);
        if (st >= 3) [[-44, -28, 5], [46, -34, 4], [-48, 14, 3.4], [48, 20, 3]].forEach(([dx, dy, r]) => front.push(star(cx + dx, hy + dy, r, '#fff3bf')));
        front.push(`<path d="M${cx - 3} ${hy + hr * 0.26}q1.4 -1.6 2.4 0M${cx + 0.6} ${hy + hr * 0.26}q1.4 -1.6 2.4 0" fill="none" stroke="${OUT}" stroke-width="1.2" stroke-linecap="round"/>`);
    }

    const glow = st >= 3 ? `<ellipse cx="${cx}" cy="${by - 18}" rx="54" ry="50" fill="${p.glow}" opacity="0.22"/>` : '';
    const shine = shiny ? [[-38, -30], [40, -8], [-30, 22]].map(([dx, dy]) => `<path class="pet-shine" d="M${cx + dx} ${hy + dy - 6}l1.6 4.4l4.4 1.6l-4.4 1.6l-1.6 4.4l-1.6-4.4l-4.4-1.6l4.4-1.6Z" fill="#fff8c4" stroke="#f59f00" stroke-width="0.8"/>`).join('') : '';
    return `<svg class="pet-svg" viewBox="-14 -34 148 154" role="img" aria-hidden="true" style="--pet-skin:${p.main}">
<ellipse cx="60" cy="112" rx="${brx + 12}" ry="5" fill="#000" opacity="0.22"/>
${glow}${back.join('')}${feet}${bodyShape}${arms}${mid.join('')}${headShape}${face(cx, hy, hr, m, faceOpts)}${front.join('')}${shine}
</svg>`;
}

/** 알 그림. taps가 늘수록 금이 가요(0..total). */
export function petEggSvg({ taps = 0, total = 10 } = {}) {
    const k = Math.max(0, Math.min(1, taps / Math.max(1, total)));
    const cracks = [
        'M48 62l8 5l-5 8l9 4',
        'M72 50l-7 7l6 6l-6 7',
        'M40 84l9-3l4 7l8-4',
        'M78 80l-8 2l-3 8',
    ].slice(0, Math.ceil(k * 4)).map((d) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return `<svg class="pet-svg pet-egg-svg" viewBox="0 0 120 120" role="img" aria-hidden="true">
<ellipse cx="60" cy="112" rx="30" ry="5" fill="#000" opacity="0.22"/>
<path d="M60 14C84 14 96 52 96 74A36 34 0 0 1 24 74C24 52 36 14 60 14Z" fill="#fff9e6" stroke="${OUT}" stroke-width="2.4"/>
<path d="M60 14C84 14 96 52 96 74A36 34 0 0 1 60 108C80 100 86 60 60 14Z" fill="#f3e3b3" opacity="0.6"/>
<circle cx="46" cy="48" r="7" fill="#ffa94d"/><circle cx="74" cy="66" r="9" fill="#74c0fc"/><circle cx="50" cy="88" r="6" fill="#8ce99a"/><circle cx="70" cy="36" r="4.5" fill="#b197fc"/><circle cx="82" cy="88" r="4" fill="#ffd43b"/>
<ellipse cx="46" cy="34" rx="7" ry="11" fill="#fff" opacity="0.7" transform="rotate(-24 46 34)"/>
${cracks}
</svg>`;
}

/** 도감용 그림자(아직 못 만난 종) */
export function petSilhouetteSvg() {
    return `<svg class="pet-svg" viewBox="0 0 120 120" role="img" aria-hidden="true"><ellipse cx="60" cy="86" rx="24" ry="20" fill="#334155"/><circle cx="60" cy="52" r="26" fill="#334155"/><text x="60" y="62" text-anchor="middle" font-size="28" font-weight="900" fill="#64748b">?</text></svg>`;
}

/* ---------- 일러스트(그림 파일) ---------- */

const ART_SPECIES = Object.freeze(['emberkit', 'dropotter', 'sproutdeer', 'zapowl', 'snowbun', 'pebbletle', 'stardrake', 'punchroo']);

/** 앱 기준 주소(Vite base). 테스트(node)에서는 상대 경로를 써요. */
function assetBase() {
    try {
        const b = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '';
        return b ? (b.endsWith('/') ? b : `${b}/`) : '';
    } catch (_) {
        return '';
    }
}

const safeSpecies = (species) => (ART_SPECIES.includes(species) ? species : 'emberkit');
const safeStage = (stage) => Math.max(1, Math.min(3, Math.floor(stage) || 1));

/** 펫 그림 파일 주소 */
export function petImageUrl(species, stage = 1, shiny = false) {
    const sp = safeSpecies(species);
    // 색다른 펫은 따로 그린 그림(부분 색 바꾸기·반짝이는 눈·볼 홍조·아우라)을 써요: 종_단계_s.webp
    if (shiny) return `${assetBase()}pets/${sp}_${safeStage(stage)}_s.webp`;
    // 그림을 바꾼 종은 주소에 판 번호를 붙여서 예전 그림이 브라우저에 남지 않게 해요.
    const ver = sp === 'punchroo' ? '?v=2' : '';
    return `${assetBase()}pets/${sp}_${safeStage(stage)}.webp${ver}`;
}

/** 알 그림 파일 주소 */
export function petEggImageUrl() {
    return `${assetBase()}pets/egg.webp`;
}

/**
 * 펫 일러스트 마크업. 그림을 못 불러오면 화면 쪽(petMode)이 data-* 값으로 petSvg 를 대신 넣어요.
 * shiny 는 따로 만든 색다른 그림(종_단계_s.webp)을 써요. silhouette 은 도감의 '아직 못 만난' 그림자예요.
 * @param {{ species: string, stage?: number, shiny?: boolean, mood?: string, eager?: boolean, silhouette?: boolean, alt?: string }} o
 */
export function petArtHtml({ species = 'emberkit', stage = 1, shiny = false, mood = 'happy', eager = false, silhouette = false, alt = '' } = {}) {
    const sp = safeSpecies(species);
    const st = safeStage(stage);
    const m = ['happy', 'ok', 'hungry', 'starving'].includes(mood) ? mood : 'happy';
    const cls = `pet-art sp-${sp} st-${st} mood-${m}${shiny && !silhouette ? ' is-shiny' : ''}${silhouette ? ' is-silhouette' : ''}`;
    const a = String(alt || '').replace(/[<>&"]/g, '');
    return `<span class="${cls}" data-pet-sp="${sp}" data-pet-st="${st}" data-pet-shiny="${shiny ? 1 : 0}" data-pet-mood="${m}"><img class="pet-img" src="${petImageUrl(sp, st, shiny && !silhouette)}" alt="${a}" width="512" height="512" loading="${eager ? 'eager' : 'lazy'}" decoding="async" draggable="false"></span>`;
}

/** 알 일러스트 + 금(taps가 늘수록 늘어요). 금은 그림 위에 SVG로 겹쳐 그려요. */
export function petEggHtml({ taps = 0, total = 10, eager = true } = {}) {
    const k = Math.max(0, Math.min(1, taps / Math.max(1, total)));
    const cracks = [
        'M40 40l7 5l-4 7l8 4',
        'M70 30l-6 6l5 6l-5 7',
        'M34 66l8-3l4 6l7-3',
        'M72 62l-7 2l-3 7',
    ].slice(0, Math.ceil(k * 4)).map((d) => `<path d="${d}" fill="none" stroke="#3b2a1a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff8e1" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(0.8 0.8)" opacity="0.8"/>`).join('');
    return `<span class="pet-art is-egg" data-pet-egg="1" data-pet-taps="${Math.round(k * 100)}"><img class="pet-img" src="${petEggImageUrl()}" alt="" width="512" height="512" loading="${eager ? 'eager' : 'lazy'}" decoding="async" draggable="false">${cracks ? `<svg class="pet-egg-cracks" viewBox="0 0 100 100" aria-hidden="true">${cracks}</svg>` : ''}</span>`;
}
