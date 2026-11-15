/**
 * 6학년 수학 개념 그림 만들기(화면 없이 SVG 글자만 만들어요).
 * 단원 → 개념 → 숫자를 고르면 그 숫자에 맞는 그림(SVG)이 나와요.
 * 그림은 흰 바탕이라 TV에 띄우거나 학습지에 붙이기 좋아요.
 *
 * renderMathConcept(unitId, conceptId, params) → { svg, title, caption, params }
 */

export const MATH_W = 800;
export const MATH_H = 520;
const FONT = "'Pretendard','Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif";
const C = Object.freeze({ ink: '#0f172a', sub: '#475569', line: '#334155', blue: '#3b82f6', blueL: '#bfdbfe', orange: '#f97316', orangeL: '#fed7aa', green: '#22c55e', greenL: '#bbf7d0', pink: '#ec4899', pinkL: '#fbcfe8', purple: '#8b5cf6', purpleL: '#ddd6fe', yellow: '#facc15', yellowL: '#fef08a', gray: '#e2e8f0', red: '#ef4444' });
const PALETTE = ['#3b82f6', '#f97316', '#22c55e', '#ec4899', '#8b5cf6', '#eab308', '#14b8a6', '#94a3b8'];

const r2 = (x) => Math.round(x * 100) / 100;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a, b) => (a / gcd(a, b)) * b;
/** 소수 계산 오차를 없앤 숫자 글자(최대 4자리) */
const numText = (x) => String(Math.round(x * 10000) / 10000);

function text(x, y, s, { size = 20, anchor = 'middle', fill = C.ink, weight = 700, extra = '' } = {}) {
    return `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}" ${extra}>${esc(s)}</text>`;
}
const line = (x1, y1, x2, y2, { stroke = C.line, width = 2, dash = '' } = {}) => `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const rect = (x, y, w, h, { fill = 'none', stroke = C.line, width = 2, rx = 0, extra = '' } = {}) => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" rx="${rx}" ${extra}/>`;
const poly = (pts, { fill = 'none', stroke = C.line, width = 2, dash = '', opacity = 1 } = {}) => `<polygon points="${pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" fill-opacity="${opacity}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

/** 분수 그리기: 가운데 x, 가로줄 y. whole 이 있으면 대분수 */
function frac(x, y, n, d, { size = 26, fill = C.ink, whole = '' } = {}) {
    const w = Math.max(String(n).length, String(d).length) * size * 0.62 + 8;
    let g = '';
    let cx = x;
    if (whole !== '') {
        cx = x + (String(whole).length * size * 0.7) / 2;
        g += text(cx - w / 2 - 4, y + size * 0.4, whole, { size: size * 1.15, fill, anchor: 'end' });
    }
    return `${g}${text(cx, y - 7, n, { size, fill })}${line(cx - w / 2, y, cx + w / 2, y, { stroke: fill, width: 2.5 })}${text(cx, y + size * 0.92, d, { size, fill })}`;
}
/** 분수를 약분하고, 가분수면 대분수로도 알려 줘요. */
export function simplifyFraction(n, d) {
    const g = gcd(n, d) || 1;
    const a = n / g;
    const b = d / g;
    return { n: a, d: b, whole: Math.floor(a / b), rest: a % b, isInt: b === 1 };
}
const fracWords = (n, d) => { const s = simplifyFraction(n, d); return s.isInt ? `${s.n}` : s.whole > 0 ? `${s.whole}과 ${s.d}분의 ${s.rest}` : `${s.d}분의 ${s.n}`; };
/** 결과 분수(약분·대분수) 그리기. 오른쪽 끝 x 를 돌려줘요. */
function fracResult(x, y, n, d, opt = {}) {
    const s = simplifyFraction(n, d);
    if (s.isInt) return text(x, y + 9, s.n, { size: (opt.size || 26) * 1.15, fill: opt.fill || C.ink });
    return s.whole > 0 ? frac(x, y, s.rest, s.d, { ...opt, whole: s.whole }) : frac(x, y, s.n, s.d, opt);
}

/** 글자 폭 어림(한글은 글자 크기만큼, 영문·숫자는 절반쯤) */
const textWidth = (str, size) => Array.from(String(str)).reduce((w, ch) => w + (/[\u1100-\uffdc]/.test(ch) ? size : size * 0.56), 0);

/** 아래 설명 글: 길면 두 줄로 나누고, 그래도 넘치면 글자를 줄여요. */
function captionLines(caption, maxW = MATH_W - 70) {
    const str = String(caption || '');
    if (textWidth(str, 21) <= maxW) return { lines: [str], size: 21 };
    const mid = str.length / 2;
    let cut = -1;
    // 가운데에 가까운 띄어쓰기에서 나누되, 문장이 끝나는 곳(. , :)이면 조금 멀어도 거기서 나눠요.
    const score = (i) => Math.abs(i - mid) - ('.,:'.includes(str[i - 1]) ? str.length * 0.22 : 0);
    for (let i = 1; i < str.length; i += 1) if (str[i] === ' ' && (cut < 0 || score(i) < score(cut))) cut = i;
    const lines = cut > 0 ? [str.slice(0, cut), str.slice(cut + 1)] : [str];
    let size = 18;
    while (size > 12 && lines.some((l) => textWidth(l, size) > maxW)) size -= 1;
    return { lines, size };
}

function frame(title, body, caption) {
    const cap = captionLines(caption);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MATH_W} ${MATH_H}" width="${MATH_W}" height="${MATH_H}" font-family="${FONT}" role="img" aria-label="${esc(title)}">
<rect width="${MATH_W}" height="${MATH_H}" fill="#ffffff"/>
<rect x="0" y="0" width="${MATH_W}" height="54" fill="#eff6ff"/>
${text(24, 35, title, { size: 22, anchor: 'start', fill: '#1e3a8a', weight: 800 })}
${body}
<rect x="20" y="${MATH_H - 70}" width="${MATH_W - 40}" height="54" rx="12" fill="#fefce8" stroke="#fde047" stroke-width="2"/>
${cap.lines.length > 1
        ? `${text(MATH_W / 2, MATH_H - 47, cap.lines[0], { size: cap.size, fill: '#713f12' })}${text(MATH_W / 2, MATH_H - 25, cap.lines[1], { size: cap.size, fill: '#713f12' })}`
        : text(MATH_W / 2, MATH_H - 36, cap.lines[0], { size: cap.size, fill: '#713f12' })}
</svg>`;
}

/* ============ 6-1-1 분수의 나눗셈 ============ */

function drawNatDiv({ a, b }) {
    const barW = Math.min(150, (MATH_W - 120) / a - 16);
    const total = a * barW + (a - 1) * 16;
    const x0 = (MATH_W - total) / 2;
    let g = text(MATH_W / 2, 92, `띠 ${a}개를 ${b}명이 똑같이 나누어 가져요`, { size: 20, fill: C.sub });
    for (let i = 0; i < a; i += 1) {
        const x = x0 + i * (barW + 16);
        for (let k = 0; k < b; k += 1) g += rect(x + (k * barW) / b, 116, barW / b, 64, { fill: k === 0 ? C.blue : '#f8fafc', stroke: C.line });
        g += text(x + barW / 2, 204, '1', { size: 18, fill: C.sub });
    }
    g += text(MATH_W / 2, 250, `한 명이 가지는 양 (파란 칸): 1/${b} 이 ${a}개`, { size: 20, fill: C.blue });
    // 결과 띠
    const rw = Math.min(520, 80 * Math.max(a, b));
    const rx = (MATH_W - rw) / 2;
    const cells = Math.max(b, a);
    for (let k = 0; k < cells; k += 1) g += rect(rx + (k * rw) / cells, 274, rw / cells, 56, { fill: k < a ? C.blue : '#f8fafc' });
    if (a > b) g += line(rx + (b * rw) / cells, 266, rx + (b * rw) / cells, 338, { stroke: C.red, width: 3, dash: '6 4' }) + text(rx + (b * rw) / cells, 356, '1', { size: 18, fill: C.red });
    g += `${text(MATH_W / 2 - 96, 408, `${a} ÷ ${b} =`, { size: 28 })}${frac(MATH_W / 2 + 4, 398, a, b, { size: 24, fill: C.blue })}`;
    const s = simplifyFraction(a, b);
    if (s.n !== a || s.whole > 0) g += text(MATH_W / 2 + 44, 408, '=', { size: 28 }) + fracResult(MATH_W / 2 + 96, 398, a, b, { size: 24, fill: C.blue });
    return { body: g, caption: `(자연수) ÷ (자연수)의 몫은 나누어지는 수를 분자, 나누는 수를 분모로 하는 분수예요. ${a} ÷ ${b} = ${a}/${b}` };
}

function drawFracDivNat({ n, d, k }) {
    const W = 420;
    const H = 250;
    const x0 = 70;
    const y0 = 96;
    let g = '';
    for (let i = 0; i < d; i += 1) {
        for (let j = 0; j < k; j += 1) {
            const fill = i < n ? (j === 0 ? C.orange : C.orangeL) : '#f8fafc';
            g += rect(x0 + (i * W) / d, y0 + (j * H) / k, W / d, H / k, { fill, stroke: C.line, width: 1.5 });
        }
    }
    g += rect(x0, y0, W, H, { width: 3 });
    g += text(x0 + W / 2, y0 + H + 28, `세로로 ${d}칸 중 ${n}칸 → ${n}/${d}`, { size: 18, fill: C.sub });
    g += text(x0 - 14, y0 + H / (2 * k) + 6, '①', { size: 20, fill: C.orange, anchor: 'end' });
    g += text(x0 + W / 2, y0 - 12, `가로로 ${k}등분 → 그중 한 줄`, { size: 18, fill: C.orange });
    const tx = 640;
    g += `${frac(tx - 96, 170, n, d, { size: 26 })}${text(tx - 40, 180, `÷ ${k}`, { size: 28 })}${text(tx - 96, 250, '=', { size: 28 })}${frac(tx - 24, 240, n, `${d}×${k}`, { size: 24 })}${text(tx - 96, 320, '=', { size: 28 })}${frac(tx - 40, 310, n, d * k, { size: 26, fill: C.orange })}`;
    const s = simplifyFraction(n, d * k);
    if (s.n !== n) g += text(tx + 14, 320, '=', { size: 28 }) + fracResult(tx + 60, 310, n, d * k, { size: 26, fill: C.orange });
    return { body: g, caption: `전체를 ${d}×${k}=${d * k}칸으로 나눈 것 중 ${n}칸 → ${n}/${d} ÷ ${k} = ${n}/${d * k}${s.n !== n ? ` = ${s.n}/${s.d}` : ''}` };
}

/* ============ 6-1-2 각기둥과 각뿔 ============ */

const POLY_NAMES = { 3: '삼', 4: '사', 5: '오', 6: '육', 7: '칠', 8: '팔' };

function drawSolid({ n, kind }) {
    const prism = kind !== 'pyramid';
    const cx = 250;
    const cy = 370;
    const R = 140;
    const k = 0.34;
    const H = prism ? 210 : 250;
    const rot = n === 4 ? 0.35 : n % 2 ? Math.PI / 2 : Math.PI / 2 + Math.PI / n + 0.2;
    const base = Array.from({ length: n }, (_, i) => { const t = rot + (i * 2 * Math.PI) / n; return { x: cx + R * Math.cos(t), y: cy + R * k * Math.sin(t), s: Math.sin(t) }; });
    const minX = Math.min(...base.map((p) => p.x));
    const maxX = Math.max(...base.map((p) => p.x));
    const hiddenV = base.map((p) => p.s < -0.02 && p.x > minX + 1 && p.x < maxX - 1);
    const top = base.map((p) => ({ x: p.x, y: p.y - H }));
    const apex = { x: cx, y: cy - H };
    let back = '';
    let front = '';
    // 면 색(앞쪽 옆면)
    for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        const mid = (base[i].s + base[j].s) / 2;
        if (mid > 0.02 || (!hiddenV[i] && !hiddenV[j] && mid > -0.3)) {
            const pts = prism ? [[base[i].x, base[i].y], [base[j].x, base[j].y], [top[j].x, top[j].y], [top[i].x, top[i].y]] : [[base[i].x, base[i].y], [base[j].x, base[j].y], [apex.x, apex.y]];
            front += poly(pts, { fill: i % 2 ? '#dbeafe' : '#bfdbfe', stroke: 'none', opacity: 0.9 });
        }
    }
    if (prism) front += poly(top.map((p) => [p.x, p.y]), { fill: '#fde68a', stroke: 'none', opacity: 0.95 });
    for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        const hid = hiddenV[i] || hiddenV[j] || (base[i].s + base[j].s) / 2 < -0.5;
        const seg = line(base[i].x, base[i].y, base[j].x, base[j].y, hid ? { dash: '7 6', stroke: '#64748b' } : { width: 3 });
        if (hid) back += seg; else front += seg;
        const lat = prism ? line(base[i].x, base[i].y, top[i].x, top[i].y, hiddenV[i] ? { dash: '7 6', stroke: '#64748b' } : { width: 3 }) : line(base[i].x, base[i].y, apex.x, apex.y, hiddenV[i] ? { dash: '7 6', stroke: '#64748b' } : { width: 3 });
        if (hiddenV[i]) back += lat; else front += lat;
        if (prism) front += line(top[i].x, top[i].y, top[j].x, top[j].y, { width: 3 });
    }
    let g = back + front;
    // 이름표
    const leader = (x1, y1, x2, y2, label, color) => `${line(x1, y1, x2, y2, { stroke: color, width: 1.5 })}<circle cx="${r2(x1)}" cy="${r2(y1)}" r="4" fill="${color}"/>${text(x2 + (x2 > x1 ? 6 : -6), y2 + 6, label, { size: 18, fill: color, anchor: x2 > x1 ? 'start' : 'end' })}`;
    const fi = base.reduce((best, p, i) => (p.s > base[best].s ? i : best), 0);
    const fj = (fi + 1) % n;
    if (prism) {
        g += leader(cx, cy - H, cx - 190, cy - H - 26, '밑면', '#b45309');
        g += leader(cx, cy + R * k * 0.5, cx - 200, cy + 60, '밑면', '#b45309');
        g += leader((base[fi].x + base[fj].x) / 2, (base[fi].y + base[fj].y) / 2 - H / 2, 440, cy - H / 2 - 30, '옆면', '#1d4ed8');
        g += leader(top[fi].x, top[fi].y, 440, cy - H - 30, '꼭짓점', C.red);
        g += leader((base[fi].x + top[fi].x) / 2, (base[fi].y + top[fi].y) / 2 + 40, 440, cy - 40, '모서리', '#15803d');
        g += line(minX - 24, cy, minX - 24, cy - H, { stroke: C.purple, width: 2.5 }) + text(minX - 32, cy - H / 2 + 6, '높이', { size: 18, fill: C.purple, anchor: 'end' });
    } else {
        g += line(apex.x, apex.y, cx, cy, { stroke: C.purple, width: 2.5, dash: '5 5' }) + text(cx - 8, cy - H * 0.22, '높이', { size: 18, fill: C.purple, anchor: 'end' });
        g += leader(apex.x, apex.y, 440, apex.y + 6, '각뿔의 꼭짓점', C.red);
        g += leader(cx - 30, cy + R * k * 0.4, cx - 200, cy + 60, '밑면', '#b45309');
        g += leader((base[fi].x + base[fj].x + apex.x) / 3, (base[fi].y + base[fj].y + apex.y) / 3, 440, cy - H / 2, '옆면', '#1d4ed8');
        g += leader((base[fi].x + apex.x) / 2, (base[fi].y + apex.y) / 2 + 50, 440, cy - 50, '모서리', '#15803d');
    }
    const name = `${POLY_NAMES[n]}각${prism ? '기둥' : '뿔'}`;
    const faces = prism ? n + 2 : n + 1;
    const edges = prism ? 3 * n : 2 * n;
    const verts = prism ? 2 * n : n + 1;
    // 표
    const tx = 560;
    const rows = [['밑면의 모양', `${POLY_NAMES[n]}각형`], ['옆면의 모양', prism ? '직사각형' : '삼각형'], ['면의 수', `${faces}개`], ['모서리의 수', `${edges}개`], ['꼭짓점의 수', `${verts}개`]];
    g += text(tx + 100, 96, name, { size: 30, fill: '#1e3a8a', weight: 800 });
    rows.forEach((row, i) => {
        const y = 116 + i * 44;
        g += rect(tx, y, 110, 44, { fill: '#eff6ff', stroke: '#93c5fd', width: 1.5 }) + rect(tx + 110, y, 100, 44, { fill: '#fff', stroke: '#93c5fd', width: 1.5 });
        g += text(tx + 55, y + 28, row[0], { size: 16, fill: C.sub }) + text(tx + 160, y + 29, row[1], { size: 19 });
    });
    g += text(tx + 105, 364, prism ? `면 ${n}+2 · 모서리 ${n}×3 · 꼭짓점 ${n}×2` : `면 ${n}+1 · 모서리 ${n}×2 · 꼭짓점 ${n}+1`, { size: 15, fill: C.sub });
    return { body: g, caption: prism ? `${name}: 밑면 2개가 서로 평행하고 합동이에요. 면 ${faces}개, 모서리 ${edges}개, 꼭짓점 ${verts}개` : `${name}: 밑면이 1개이고 옆면은 모두 삼각형이에요. 면 ${faces}개, 모서리 ${edges}개, 꼭짓점 ${verts}개`, title: name };
}

/* ============ 세로셈(소수의 나눗셈) ============ */

/** 세로셈 계산 과정. dividend 는 '8.64' 같은 글자, divisor 는 자연수 */
export function longDivisionSteps(dividendText, divisor, maxExtra = 3) {
    const [ip, fp = ''] = String(dividendText).split('.');
    const digits = (ip + fp).split('').map(Number);
    const point = ip.length;
    const steps = [];
    let rem = 0;
    let extra = 0;
    for (let i = 0; i < digits.length || (rem !== 0 && extra < maxExtra); i += 1) {
        if (i >= digits.length) { digits.push(0); extra += 1; }
        const cur = rem * 10 + digits[i];
        const q = Math.floor(cur / divisor);
        rem = cur - q * divisor;
        steps.push({ i, cur, q, sub: q * divisor, rem });
    }
    const qDigits = steps.map((s) => s.q);
    const qText = `${qDigits.slice(0, point).join('').replace(/^0+(?=\d)/, '') || '0'}${qDigits.length > point ? `.${qDigits.slice(point).join('')}` : ''}`;
    return { digits, point, steps, extra, quotient: qText, remainder: rem };
}

function drawLongDivision(dividendText, divisor, x0, y0, { cw = 38, rh: rhMax = 44 } = {}) {
    const ld = longDivisionSteps(dividendText, divisor);
    const { digits, point, steps } = ld;
    // 계산 줄이 많으면 줄 간격과 글자를 줄여 그림 안에 넣어요.
    const rowsNeeded = steps.filter((s) => s.q > 0).length * 2;
    const rh = Math.min(rhMax, (MATH_H - 96 - y0) / Math.max(1, rowsNeeded));
    const fs = Math.max(15, Math.min(28, rh * 0.74));
    const col = (i) => x0 + i * cw + cw / 2;
    let g = '';
    const orig = digits.length - ld.extra;
    digits.forEach((dg, i) => { g += text(col(i), y0, dg, { size: 30, fill: i >= orig ? '#94a3b8' : C.ink }); });
    if (point < digits.length) g += `<circle cx="${r2(x0 + point * cw)}" cy="${r2(y0 - 2)}" r="3.5" fill="${C.red}"/>`;
    // 나누는 수와 나눗셈 기호
    g += text(x0 - 22, y0, divisor, { size: 30, anchor: 'end' });
    g += `<path d="M ${r2(x0 - 12)} ${r2(y0 + 10)} Q ${r2(x0 + 2)} ${r2(y0 - 12)} ${r2(x0 - 10)} ${r2(y0 - 34)} L ${r2(x0 + digits.length * cw + 8)} ${r2(y0 - 34)}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>`;
    // 몫
    const firstShown = Math.min(steps.findIndex((s) => s.q > 0) < 0 ? point - 1 : steps.findIndex((s) => s.q > 0), Math.max(0, point - 1));
    steps.forEach((s) => { if (s.i >= firstShown) g += text(col(s.i), y0 - 46, s.q, { size: 30, fill: C.blue }); });
    if (point < digits.length) g += `<circle cx="${r2(x0 + point * cw)}" cy="${r2(y0 - 48)}" r="3.5" fill="${C.red}"/>`;
    // 계산 과정
    let row = 1;
    const active = steps.filter((s) => s.q > 0);
    active.forEach((s, idx) => {
        const y = y0 + row * rh;
        g += text(col(s.i) + cw / 2 - 6, y, s.sub, { size: fs, anchor: 'end', fill: C.orange });
        g += line(col(s.i) - (String(s.sub).length + 0.4) * cw + cw / 2, y + rh * 0.26, col(s.i) + cw / 2, y + rh * 0.26, { width: 2.5 });
        const next = active[idx + 1];
        const last = steps[steps.length - 1];
        const show = next ? { val: next.cur, at: next.i } : s.i === last.i ? { val: s.rem, at: s.i } : { val: last.cur === 0 ? 0 : last.cur, at: last.i };
        g += text(col(show.at) + cw / 2 - 6, y + rh, show.val, { size: fs, anchor: 'end', fill: next ? C.ink : C.green });
        row += 2;
    });
    return { g, ld, height: row * rh, width: digits.length * cw };
}

function drawDecDivNat({ a, b }) {
    const aText = numText(a);
    const { g, ld } = drawLongDivision(aText, b, 150, 170);
    let body = g;
    const tx = 560;
    const scale = 10 ** ((aText.split('.')[1] || '').length);
    body += text(tx, 120, '자연수의 나눗셈과 비교해요', { size: 18, fill: C.sub });
    body += text(tx, 170, `${Math.round(a * scale)} ÷ ${b} = ${numText((a * scale) / b)}`, { size: 24 });
    body += text(tx, 206, `↓ 1/${scale}배        ↓ 1/${scale}배`, { size: 16, fill: C.red });
    body += text(tx, 246, `${aText} ÷ ${b} = ${ld.quotient}`, { size: 26, fill: C.blue });
    body += text(tx, 300, '몫의 소수점은 나누어지는 수의', { size: 17, fill: C.sub }) + text(tx, 324, '소수점 자리에 맞추어 찍어요', { size: 17, fill: C.sub });
    return { body, caption: `${aText} ÷ ${b} = ${ld.quotient}${ld.remainder ? ' …' : ''}  (빨간 점: 소수점을 올려 찍어요)` };
}

function drawDecDivDec({ a, b }) {
    const aText = numText(a);
    const bText = numText(b);
    const shift = (bText.split('.')[1] || '').length;
    const m = 10 ** shift;
    const a2 = numText(a * m);
    const b2 = Math.round(b * m);
    let body = text(400, 100, `${aText} ÷ ${bText}`, { size: 34 });
    body += text(400, 136, shift ? `나누는 수가 자연수가 되도록 두 수의 소수점을 오른쪽으로 ${shift}칸씩 옮겨요 (×${m})` : '나누는 수가 자연수예요', { size: 17, fill: C.red });
    body += text(400, 176, `= ${a2} ÷ ${b2}`, { size: 32, fill: C.blue });
    const { g, ld } = drawLongDivision(a2, b2, 330, 268, { cw: 36, rh: 38 });
    body += g;
    return { body, caption: `나누는 수와 나누어지는 수에 같은 수를 곱해도 몫은 같아요. ${aText} ÷ ${bText} = ${a2} ÷ ${b2} = ${ld.quotient}${ld.remainder ? ' …' : ''}` };
}

/* ============ 6-1-4 비와 비율 ============ */

function drawRatio({ a, b }) {
    let g = '';
    const cell = Math.min(34, 330 / Math.max(a, b));
    const x0 = 60;
    g += text(x0, 100, '비교하는 양', { size: 18, anchor: 'start', fill: C.blue });
    for (let i = 0; i < a; i += 1) g += rect(x0 + i * (cell + 3), 110, cell, cell, { fill: C.blue, stroke: '#1d4ed8', rx: 5 });
    g += text(x0 + a * (cell + 3) + 12, 110 + cell * 0.7, a, { size: 24, anchor: 'start', fill: C.blue });
    g += text(x0, 190, '기준량', { size: 18, anchor: 'start', fill: C.orange });
    for (let i = 0; i < b; i += 1) g += rect(x0 + i * (cell + 3), 200, cell, cell, { fill: C.orange, stroke: '#c2410c', rx: 5 });
    g += text(x0 + b * (cell + 3) + 12, 200 + cell * 0.7, b, { size: 24, anchor: 'start', fill: C.orange });
    g += text(x0 + 150, 300, `${a} : ${b}`, { size: 44 });
    g += text(x0 + 150, 334, `"${a} 대 ${b}" · "${b}에 대한 ${a}의 비"`, { size: 17, fill: C.sub });
    const pct = (a / b) * 100;
    g += `${text(x0 + 40, 396, '비율 =', { size: 24 })}${frac(x0 + 116, 386, a, b, { size: 22 })}${text(x0 + 160, 396, `= ${numText(a / b)}`, { size: 24, anchor: 'start' })}`;
    // 100칸
    const gx = 500;
    const gy = 90;
    const s = 24;
    const shade = Math.min(100, Math.round(pct));
    for (let i = 0; i < 100; i += 1) g += rect(gx + (i % 10) * s, gy + Math.floor(i / 10) * s, s, s, { fill: i < shade ? C.green : '#f8fafc', stroke: '#94a3b8', width: 1 });
    g += rect(gx, gy, s * 10, s * 10, { width: 2.5 });
    g += text(gx + s * 5, gy + s * 10 + 34, `백분율: ${numText(pct)} %`, { size: 26, fill: '#15803d' });
    g += text(gx + s * 5, gy + s * 10 + 60, pct > 100 ? '100 %보다 커요(기준량보다 많아요)' : '기준량을 100으로 볼 때의 비율', { size: 16, fill: C.sub });
    return { body: g, caption: `비율 = (비교하는 양) ÷ (기준량) = ${a} ÷ ${b} = ${numText(a / b)},  백분율 = 비율 × 100 = ${numText(pct)} %` };
}

/* ============ 6-1-5 여러 가지 그래프 ============ */

export function parseGraphItems(textRaw) {
    const items = String(textRaw || '').split(/[,\n]/).map((p) => {
        const m = p.split(/[:：]/);
        return { label: String(m[0] || '').trim().slice(0, 8), value: Math.max(0, Number(String(m[1] || '').replace(/[^\d.]/g, '')) || 0) };
    }).filter((x) => x.label && x.value > 0).slice(0, 8);
    const total = items.reduce((s, x) => s + x.value, 0);
    // 백분율은 합이 100이 되게 큰 나머지부터 올려요.
    const raw = items.map((x) => (total ? (x.value / total) * 100 : 0));
    const pct = raw.map(Math.floor);
    let left = 100 - pct.reduce((s, x) => s + x, 0);
    raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((p, q) => q.f - p.f).forEach((o) => { if (left > 0 && items.length) { pct[o.i] += 1; left -= 1; } });
    return { items: items.map((x, i) => ({ ...x, pct: pct[i] })), total };
}

function drawGraph({ items, kind, title }) {
    const { items: rows, total } = parseGraphItems(items);
    let g = text(MATH_W / 2, 92, title || '좋아하는 간식', { size: 22 });
    if (!rows.length) return { body: g + text(MATH_W / 2, 250, '항목을 "이름:수" 로 적어 주세요 (예: 떡볶이:12, 김밥:8)', { size: 20, fill: C.sub }), caption: '항목이 없어요' };
    if (kind === 'pie') {
        const cx = 280;
        const cy = 264;
        const R = 132;
        let acc = 0;
        rows.forEach((row, i) => {
            const a0 = (acc / 100) * 2 * Math.PI - Math.PI / 2;
            acc += row.pct;
            const a1 = (acc / 100) * 2 * Math.PI - Math.PI / 2;
            const large = row.pct > 50 ? 1 : 0;
            g += rows.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${PALETTE[i]}" stroke="#fff" stroke-width="2"/>`
                : `<path d="M ${cx} ${cy} L ${r2(cx + R * Math.cos(a0))} ${r2(cy + R * Math.sin(a0))} A ${R} ${R} 0 ${large} 1 ${r2(cx + R * Math.cos(a1))} ${r2(cy + R * Math.sin(a1))} Z" fill="${PALETTE[i]}" stroke="#fff" stroke-width="2"/>`;
            const am = (a0 + a1) / 2;
            if (row.pct >= 6) g += text(cx + R * 0.62 * Math.cos(am), cy + R * 0.62 * Math.sin(am) - 4, row.label, { size: 16, fill: '#fff' }) + text(cx + R * 0.62 * Math.cos(am), cy + R * 0.62 * Math.sin(am) + 16, `${row.pct}%`, { size: 15, fill: '#fff' });
        });
        for (let t = 0; t < 20; t += 1) { const a = (t / 20) * 2 * Math.PI - Math.PI / 2; g += line(cx + (R + 2) * Math.cos(a), cy + (R + 2) * Math.sin(a), cx + (R + (t % 5 ? 8 : 14)) * Math.cos(a), cy + (R + (t % 5 ? 8 : 14)) * Math.sin(a), { width: 1.5, stroke: '#64748b' }); }
        [0, 25, 50, 75].forEach((v) => { const a = (v / 100) * 2 * Math.PI - Math.PI / 2; g += text(cx + (R + 30) * Math.cos(a), cy + (R + 30) * Math.sin(a) + 6, v, { size: 15, fill: C.sub }); });
    } else {
        const x0 = 70;
        const W = 660;
        const y = 190;
        let acc = 0;
        rows.forEach((row, i) => {
            const x = x0 + (acc / 100) * W;
            const w = (row.pct / 100) * W;
            acc += row.pct;
            g += rect(x, y, w, 80, { fill: PALETTE[i], stroke: '#fff' });
            if (row.pct >= 7) g += text(x + w / 2, y + 36, row.label, { size: 17, fill: '#fff' }) + text(x + w / 2, y + 60, `(${row.pct}%)`, { size: 15, fill: '#fff' });
        });
        g += rect(x0, y, W, 80, { width: 2.5 });
        for (let t = 0; t <= 100; t += 5) g += line(x0 + (t / 100) * W, y - (t % 10 ? 8 : 14), x0 + (t / 100) * W, y, { width: 1.5, stroke: '#64748b' }) + (t % 10 ? '' : text(x0 + (t / 100) * W, y - 20, t, { size: 14, fill: C.sub }));
        g += text(x0 + W + 14, y - 20, '(%)', { size: 14, fill: C.sub, anchor: 'start' });
    }
    // 범례·표
    const lx = kind === 'pie' ? 500 : 90;
    const ly = kind === 'pie' ? 130 : 310;
    rows.forEach((row, i) => {
        const x = kind === 'pie' ? lx : lx + (i % 4) * 165;
        const yy = kind === 'pie' ? ly + i * 34 : ly + Math.floor(i / 4) * 34;
        g += rect(x, yy, 20, 20, { fill: PALETTE[i], stroke: 'none', rx: 4 }) + text(x + 28, yy + 16, `${row.label} ${numText(row.value)} (${row.pct}%)`, { size: 16, anchor: 'start' });
    });
    return { body: g, caption: `${kind === 'pie' ? '원그래프' : '띠그래프'}: 전체(${numText(total)})에 대한 각 부분의 비율을 ${kind === 'pie' ? '원' : '띠'} 모양에 나타낸 그래프예요. 백분율의 합은 100 %` };
}

/* ============ 쌓기나무·직육면체(비스듬히 본 그림) ============ */

/** 쌓기나무 하나(등각 투영). gx: 오른쪽, gy: 앞쪽, gz: 위 */
function isoCube(ox, oy, s, gx, gy, gz, colors) {
    const px = (x, y, z) => [ox + (x - y) * s * 0.866, oy + (x + y) * s * 0.5 - z * s];
    const p = (x, y, z) => px(gx + x, gy + y, gz + z);
    const topF = [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)];
    const left = [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)];
    const right = [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)];
    return poly(left, { fill: colors[1], stroke: '#1e293b', width: 1.5 }) + poly(right, { fill: colors[2], stroke: '#1e293b', width: 1.5 }) + poly(topF, { fill: colors[0], stroke: '#1e293b', width: 1.5 });
}

function drawCuboidVolume({ w, d, h }) {
    const s = Math.min(46, 300 / Math.max(w + d, h + (w + d) / 2));
    const ox = 250 + ((d - w) * s * 0.866) / 2;
    const oy = 150 + h * s * 0.5 + 20;
    let g = '';
    for (let y = 0; y < d; y += 1) for (let x = 0; x < w; x += 1) for (let z = 0; z < h; z += 1) g += isoCube(ox, oy, s, x, y, z, ['#bfdbfe', '#60a5fa', '#3b82f6']);
    const tx = 600;
    g += text(tx, 120, '부피가 1 cm³인 쌓기나무', { size: 17, fill: C.sub });
    g += text(tx, 170, `가로 ${w}개 × 세로 ${d}개`, { size: 22 }) + text(tx, 200, `→ 한 층에 ${w * d}개`, { size: 22, fill: C.blue });
    g += text(tx, 250, `높이 ${h}층`, { size: 22 }) + text(tx, 280, `→ 모두 ${w * d * h}개`, { size: 22, fill: C.blue });
    g += text(tx, 340, `${w} × ${d} × ${h} = ${w * d * h} (cm³)`, { size: 24, fill: '#1e3a8a' });
    g += text(250, 420, `가로 ${w} cm · 세로 ${d} cm · 높이 ${h} cm`, { size: 18, fill: C.sub });
    return { body: g, caption: `(직육면체의 부피) = (가로) × (세로) × (높이) = ${w} × ${d} × ${h} = ${w * d * h} cm³` };
}

function drawCuboidNet({ w, d, h }) {
    const totalW = 2 * d + 2 * w;
    const totalH = 2 * d + h;
    const s = Math.min(460 / totalW, 320 / totalH);
    const x0 = 50;
    const y0 = 90 + (320 - totalH * s) / 2;
    const face = (x, y, fw, fh, fill, label) => rect(x0 + x * s, y0 + y * s, fw * s, fh * s, { fill, stroke: C.line, width: 2 }) + text(x0 + (x + fw / 2) * s, y0 + (y + fh / 2) * s + 6, label, { size: Math.min(17, fw * s * 0.3, fh * s * 0.5 + 6), fill: C.ink });
    let g = '';
    g += face(d, 0, w, d, C.yellowL, `${w}×${d}`);
    g += face(0, d, d, h, C.greenL, `${d}×${h}`);
    g += face(d, d, w, h, C.blueL, `${w}×${h}`);
    g += face(d + w, d, d, h, C.greenL, `${d}×${h}`);
    g += face(2 * d + w, d, w, h, C.blueL, `${w}×${h}`);
    g += face(d, d + h, w, d, C.yellowL, `${w}×${d}`);
    const tx = 660;
    const A = w * d;
    const B = w * h;
    const D = d * h;
    g += text(tx, 110, '합동인 면이 3쌍', { size: 18, fill: C.sub });
    [[C.yellowL, `${w} × ${d} = ${A}`], [C.blueL, `${w} × ${h} = ${B}`], [C.greenL, `${d} × ${h} = ${D}`]].forEach((row, i) => {
        g += rect(tx - 110, 132 + i * 44, 26, 26, { fill: row[0] }) + text(tx - 74, 152 + i * 44, row[1], { size: 20, anchor: 'start' });
    });
    g += text(tx, 290, `(${A} + ${B} + ${D}) × 2`, { size: 22 }) + text(tx, 326, `= ${(A + B + D) * 2} (cm²)`, { size: 26, fill: '#1e3a8a' });
    return { body: g, caption: `(직육면체의 겉넓이) = (한 꼭짓점에서 만나는 세 면의 넓이의 합) × 2 = (${A} + ${B} + ${D}) × 2 = ${(A + B + D) * 2} cm²` };
}

/* ============ 6-2-1 분수의 나눗셈 ============ */

function drawFracDivFrac({ a, b, c, d }) {
    const L = lcm(b, d);
    const A = (a * L) / b;
    const Cn = (c * L) / d;
    const cells = Math.max(A, L);
    const W = 660;
    const x0 = 70;
    const cw = W / cells;
    let g = text(MATH_W / 2, 90, `${a}/${b} 안에 ${c}/${d} 이 몇 번 들어갈까요?`, { size: 20, fill: C.sub });
    for (let i = 0; i < cells; i += 1) g += rect(x0 + i * cw, 130, cw, 60, { fill: i < A ? C.blueL : '#f8fafc', stroke: '#64748b', width: 1.2 });
    g += rect(x0, 130, A * cw, 60, { stroke: C.blue, width: 3.5 });
    g += text(x0 + (A * cw) / 2, 122, `${a}/${b} = ${A}/${L}`, { size: 18, fill: C.blue });
    if (L <= cells) g += line(x0 + L * cw, 112, x0 + L * cw, 200, { stroke: C.red, width: 2, dash: '5 4' }) + text(x0 + L * cw, 108, '1', { size: 16, fill: C.red });
    // 묶음
    const full = Math.floor(A / Cn);
    const rest = A - full * Cn;
    for (let k = 0; k < full; k += 1) {
        const x = x0 + k * Cn * cw;
        g += rect(x + 3, 206, Cn * cw - 6, 34, { fill: C.orange, stroke: '#c2410c', rx: 8 }) + text(x + (Cn * cw) / 2, 230, `${k + 1}번`, { size: Math.min(17, Cn * cw * 0.4), fill: '#fff' });
    }
    if (rest > 0) {
        const x = x0 + full * Cn * cw;
        g += rect(x + 3, 206, rest * cw - 6, 34, { fill: C.orangeL, stroke: '#c2410c', rx: 8 }) + text(x + (rest * cw) / 2, 229, `${rest}/${Cn}`, { size: Math.min(15, rest * cw * 0.34 + 4), fill: '#9a3412' });
    }
    g += text(x0, 266, `주황 한 묶음 = ${c}/${d}${d === L ? '' : ` = ${Cn}/${L}`} (${Cn}칸)`, { size: 17, anchor: 'start', fill: '#c2410c' });
    const y = 350;
    g += `${frac(150, y, a, b)}${text(190, y + 10, '÷', { size: 28 })}${frac(230, y, c, d)}${text(272, y + 10, '=', { size: 28 })}${frac(316, y, A, L)}${text(358, y + 10, '÷', { size: 28 })}${frac(400, y, Cn, L)}${text(446, y + 10, '=', { size: 28 })}${text(506, y + 10, `${A} ÷ ${Cn}`, { size: 28 })}${text(574, y + 10, '=', { size: 28 })}${fracResult(630, y, A, Cn, { fill: C.orange })}`;
    g += text(MATH_W / 2, 420, `곱셈으로:  ${a}/${b} × ${d}/${c} = ${a * d}/${b * c}${simplifyFraction(a * d, b * c).n === a * d ? '' : ` = ${fracWords(a * d, b * c)}`}`, { size: 19, fill: C.sub });
    return { body: g, caption: `분모를 같게 통분하면 분자끼리 나누면 돼요. ${a}/${b} ÷ ${c}/${d} = ${A} ÷ ${Cn} = ${fracWords(A, Cn)}` };
}

/* ============ 6-2-3 공간과 입체(쌓기나무) ============ */

export function parseBlockGrid(textRaw) {
    const rows = String(textRaw || '').split(/[\/\n]/).map((r) => r.trim().split(/[\s,]+/).filter((x) => x !== '').map((x) => Math.max(0, Math.min(5, Math.floor(Number(x)) || 0))).slice(0, 5)).filter((r) => r.length).slice(0, 5);
    const w = Math.max(0, ...rows.map((r) => r.length));
    return rows.map((r) => r.concat(Array(w - r.length).fill(0)));
}

function drawBlocks({ grid }) {
    const rows = parseBlockGrid(grid);
    if (!rows.length) return { body: text(MATH_W / 2, 250, '층수를 "3 2 1 / 2 1 0" 처럼 적어 주세요', { size: 20, fill: C.sub }), caption: '쌓기나무가 없어요' };
    const d = rows.length;
    const w = rows[0].length;
    const maxH = Math.max(1, ...rows.flat());
    const s = Math.min(44, 250 / Math.max(w + d, maxH + (w + d) / 2));
    const ox = 210 + ((d - w) * s * 0.866) / 2;
    const oy = 130 + maxH * s;
    let g = '';
    let total = 0;
    for (let y = 0; y < d; y += 1) for (let x = 0; x < w; x += 1) for (let z = 0; z < rows[y][x]; z += 1) { g += isoCube(ox, oy, s, x, y, z, ['#fde68a', '#f59e0b', '#d97706']); total += 1; }
    g += text(210, oy + (w + d) * s * 0.5 + 62, `쌓기나무 ${total}개`, { size: 20, fill: '#b45309' });
    // 앞(왼쪽 아래)·옆(오른쪽 아래) 방향 표시
    g += text(ox + ((w - 2 * d) * s * 0.866) / 2 - 26, oy + ((w + 2 * d) * s * 0.5) / 2 + 30, '↗ 앞', { size: 16, fill: C.sub }) + text(ox + ((2 * w - d) * s * 0.866) / 2 + 30, oy + ((2 * w + d) * s * 0.5) / 2 + 30, '옆 ↖', { size: 16, fill: C.sub });
    // 위·앞·옆에서 본 모양
    const cs = Math.min(30, 150 / Math.max(w, d, maxH));
    const view = (x0, y0, cols, rws, filled, label, numbers) => {
        let v = text(x0 + (cols * cs) / 2, y0 - 12, label, { size: 17, fill: '#1e3a8a' });
        for (let r = 0; r < rws; r += 1) for (let c = 0; c < cols; c += 1) {
            if (!filled(r, c)) continue;
            v += rect(x0 + c * cs, y0 + r * cs, cs, cs, { fill: '#dbeafe', stroke: C.line, width: 1.5 });
            if (numbers) v += text(x0 + c * cs + cs / 2, y0 + r * cs + cs * 0.68, numbers(r, c), { size: cs * 0.55, fill: '#1d4ed8' });
        }
        return v;
    };
    const frontH = Array.from({ length: w }, (_, x) => Math.max(...rows.map((r) => r[x])));
    const sideH = Array.from({ length: d }, (_, y) => Math.max(...rows[d - 1 - y]));
    const vx = 470;
    g += view(vx, 120, w, d, (r, c) => rows[r][c] > 0, '위에서 본 모양 (수: 층수)', (r, c) => rows[r][c]);
    g += view(vx, 120 + d * cs + 60, w, maxH, (r, c) => frontH[c] >= maxH - r, '앞에서 본 모양');
    g += view(vx + Math.max(w, 3) * cs + 70, 120 + d * cs + 60, d, maxH, (r, c) => sideH[c] >= maxH - r, '옆에서 본 모양');
    return { body: g, caption: `위·앞·옆에서 본 모양을 보면 쌓은 모양과 개수를 알 수 있어요. 쌓기나무는 모두 ${total}개 (층수의 합)`, total };
}

/* ============ 6-2-4 비례식과 비례배분 ============ */

function drawProportion({ a, b, k }) {
    const c = a * k;
    const d = b * k;
    const cx = 400;
    const y = 220;
    const xs = [cx - 210, cx - 90, cx + 90, cx + 210];
    let g = '';
    [a, b, c, d].forEach((v, i) => { g += text(xs[i], y, v, { size: 54, fill: i === 0 || i === 3 ? C.blue : C.orange }); });
    g += text(cx - 150, y - 6, ':', { size: 50 }) + text(cx + 150, y - 6, ':', { size: 50 }) + text(cx, y - 4, '=', { size: 50 });
    g += `<path d="M ${xs[0]} ${y - 62} Q ${cx} ${y - 150} ${xs[3]} ${y - 62}" fill="none" stroke="${C.blue}" stroke-width="3"/>` + text(cx, y - 116, `외항의 곱  ${a} × ${d} = ${a * d}`, { size: 20, fill: C.blue });
    g += `<path d="M ${xs[1]} ${y + 22} Q ${cx} ${y + 84} ${xs[2]} ${y + 22}" fill="none" stroke="${C.orange}" stroke-width="3"/>` + text(cx, y + 86, `내항의 곱  ${b} × ${c} = ${b * c}`, { size: 20, fill: '#c2410c' });
    g += text(cx, y + 150, `전항과 후항에 ${k}을(를) 곱해도 비율은 같아요`, { size: 18, fill: C.sub });
    g += text(cx, y + 180, `${a} : ${b} 의 비율 ${numText(a / b)}  =  ${c} : ${d} 의 비율 ${numText(c / d)}`, { size: 18, fill: C.sub });
    return { body: g, caption: `비례식에서 외항의 곱과 내항의 곱은 같아요. ${a} × ${d} = ${b} × ${c} = ${a * d}` };
}

function drawShare({ total, a, b }) {
    const sum = a + b;
    const unit = total / sum;
    const W = 640;
    const x0 = 80;
    const cw = W / sum;
    let g = text(MATH_W / 2, 92, `${numText(total)}을(를) ${a} : ${b} 로 나누기`, { size: 22 });
    for (let i = 0; i < sum; i += 1) g += rect(x0 + i * cw, 130, cw, 70, { fill: i < a ? C.blue : C.orange, stroke: '#fff', width: 2 }) + text(x0 + i * cw + cw / 2, 172, numText(unit), { size: Math.min(20, cw * 0.36), fill: '#fff' });
    g += rect(x0, 130, W, 70, { width: 2.5 });
    g += `<path d="M ${x0} 120 Q ${x0 + W / 2} 96 ${x0 + W} 120" fill="none" stroke="${C.sub}" stroke-width="2"/>`;
    g += text(x0 + (a * cw) / 2, 232, `${a}칸`, { size: 18, fill: C.blue }) + text(x0 + a * cw + (b * cw) / 2, 232, `${b}칸`, { size: 18, fill: '#c2410c' });
    const y = 310;
    g += `${text(150, y + 10, `${numText(total)} ×`, { size: 26 })}${frac(232, y, a, `${a}+${b}`, { size: 22, fill: C.blue })}${text(292, y + 10, `= ${numText(unit * a)}`, { size: 28, fill: C.blue, anchor: 'start' })}`;
    g += `${text(500, y + 10, `${numText(total)} ×`, { size: 26 })}${frac(582, y, b, `${a}+${b}`, { size: 22, fill: C.orange })}${text(642, y + 10, `= ${numText(unit * b)}`, { size: 28, fill: '#c2410c', anchor: 'start' })}`;
    g += text(MATH_W / 2, 400, `한 칸 = ${numText(total)} ÷ ${sum} = ${numText(unit)}`, { size: 19, fill: C.sub });
    return { body: g, caption: `비례배분: 전체를 주어진 비로 나누는 것. ${numText(total)} → ${numText(unit * a)} 과 ${numText(unit * b)} (합 ${numText(total)})` };
}

/* ============ 6-2-5 원의 넓이 ============ */

function drawCircumference({ d, pi }) {
    const R = 70;
    const cx = 130;
    const cy = 170;
    let g = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${C.blueL}" stroke="${C.blue}" stroke-width="4"/>` + line(cx - R, cy, cx + R, cy, { stroke: C.red, width: 3 }) + text(cx, cy - 10, `지름 ${numText(d)}`, { size: 17, fill: C.red });
    g += text(cx, cy + R + 30, '원주 (원의 둘레)', { size: 17, fill: C.blue });
    // 펼친 원주
    const x0 = 250;
    const y = 330;
    const dia = 2 * R;
    const full = Math.min(pi, 3.3);
    g += text(x0, y - 70, '원을 한 바퀴 굴려 원주를 곧게 펴면', { size: 18, anchor: 'start', fill: C.sub });
    for (let i = 0; i < 3; i += 1) g += rect(x0 + i * dia, y - 44, dia, 30, { fill: '#fee2e2', stroke: C.red, width: 2 }) + text(x0 + i * dia + dia / 2, y - 23, `지름 ${i + 1}`, { size: 16, fill: C.red });
    g += rect(x0 + 3 * dia, y - 44, dia * (full - 3), 30, { fill: '#fecaca', stroke: C.red, width: 2 });
    g += line(x0, y, x0 + dia * full, y, { stroke: C.blue, width: 6 }) + text(x0 + (dia * full) / 2, y + 30, `원주 = 지름의 약 ${pi}배`, { size: 20, fill: C.blue });
    g += text(540, 130, '(원주율) = (원주) ÷ (지름)', { size: 21 }) + text(540, 166, `= 3.14159…  → ${pi} 로 계산`, { size: 19, fill: C.sub });
    g += text(540, 216, `${numText(d)} × ${pi} = ${numText(d * pi)}`, { size: 26, fill: '#1e3a8a' });
    return { body: g, caption: `(원주) = (지름) × (원주율) = ${numText(d)} × ${pi} = ${numText(d * pi)}` };
}

function drawCircleArea({ r, n, pi }) {
    const R = 100;
    const cx = 150;
    const cy = 200;
    let g = '';
    const sector = (x, y, a0, a1, fill) => `<path d="M ${r2(x)} ${r2(y)} L ${r2(x + R * Math.cos(a0))} ${r2(y + R * Math.sin(a0))} A ${R} ${R} 0 0 1 ${r2(x + R * Math.cos(a1))} ${r2(y + R * Math.sin(a1))} Z" fill="${fill}" stroke="#1e293b" stroke-width="1"/>`;
    const step = (2 * Math.PI) / n;
    for (let i = 0; i < n; i += 1) g += sector(cx, cy, i * step - Math.PI / 2, (i + 1) * step - Math.PI / 2, i < n / 2 ? C.blue : C.orange);
    g += line(cx, cy, cx + R, cy, { stroke: '#fff', width: 3 }) + text(cx + R / 2, cy - 8, '반지름', { size: 15, fill: '#fff' });
    g += text(cx, cy + R + 30, `원을 ${n}조각으로 잘라요`, { size: 17, fill: C.sub });
    g += text(278, cy + 10, '➜', { size: 30, fill: C.sub });
    // 엇갈려 붙이기
    const chord = 2 * R * Math.sin(step / 2);
    const total = (n / 2) * chord;
    const sx = 340 + (400 - total) / 2;
    const top = 150;
    for (let i = 0; i < n / 2; i += 1) {
        const bx = sx + i * chord + chord / 2;
        // 아래로 뾰족(파랑): 꼭짓점이 아래
        g += sector(bx, top + R, -Math.PI / 2 - step / 2, -Math.PI / 2 + step / 2, C.blue);
        // 위로 뾰족(주황): 꼭짓점이 위
        g += sector(bx + chord / 2, top + R * (1 - Math.cos(step / 2)), Math.PI / 2 - step / 2, Math.PI / 2 + step / 2, C.orange);
    }
    g += line(sx, top + R + 22, sx + total, top + R + 22, { stroke: C.red, width: 3 }) + text(sx + total / 2, top + R + 46, '(원주) × 1/2', { size: 18, fill: C.red });
    g += line(sx - 14, top, sx - 14, top + R, { stroke: C.purple, width: 3 }) + text(sx - 22, top + R / 2 + 6, '반지름', { size: 16, fill: C.purple, anchor: 'end' });
    g += text(540, 320, '잘게 자를수록 직사각형에 가까워져요', { size: 17, fill: C.sub });
    g += text(MATH_W / 2, 386, `(원의 넓이) = (원주)×1/2 × (반지름) = (반지름)×(반지름)×(원주율)`, { size: 19 });
    g += text(MATH_W / 2, 424, `${numText(r)} × ${numText(r)} × ${pi} = ${numText(r * r * pi)}`, { size: 24, fill: '#1e3a8a' });
    return { body: g, caption: `(원의 넓이) = (반지름) × (반지름) × (원주율) = ${numText(r)} × ${numText(r)} × ${pi} = ${numText(r * r * pi)}` };
}

/* ============ 6-2-6 원기둥, 원뿔, 구 ============ */

function drawRound({ shape, r, h, pi }) {
    let g = '';
    const cx = 200;
    const rx = 110;
    const ry = 34;
    if (shape === 'cone') {
        const by = 380;
        const ay = 120;
        g += `<path d="M ${cx - rx} ${by} L ${cx} ${ay} L ${cx + rx} ${by} A ${rx} ${ry} 0 0 1 ${cx - rx} ${by} Z" fill="${C.orangeL}" stroke="${C.line}" stroke-width="3"/>`;
        g += `<path d="M ${cx - rx} ${by} A ${rx} ${ry} 0 0 1 ${cx + rx} ${by}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="7 6"/>`;
        g += line(cx, ay, cx, by, { stroke: C.purple, width: 2.5, dash: '6 5' }) + text(cx + 8, (ay + by) / 2, `높이 ${numText(h)}`, { size: 17, fill: C.purple, anchor: 'start' });
        g += line(cx, by, cx + rx, by, { stroke: C.red, width: 2.5 }) + text(cx + rx / 2, by + 22, `반지름 ${numText(r)}`, { size: 16, fill: C.red });
        g += text(cx + rx / 2 + 34, (ay + by) / 2 - 40, '모선', { size: 18, fill: '#15803d', anchor: 'start' });
        g += text(cx, ay - 12, '원뿔의 꼭짓점', { size: 17, fill: C.red });
        g += text(cx - rx - 8, by + 34, '밑면', { size: 17, fill: '#b45309', anchor: 'end' }) + text(cx - 70, (ay + by) / 2 + 30, '옆면', { size: 17, fill: '#1d4ed8', anchor: 'end' });
        const tx = 580;
        [['밑면', '원 1개'], ['옆면', '굽은 면'], ['꼭짓점', '1개'], ['모선', '꼭짓점과 밑면 둘레의 한 점을 이은 선분'], ['높이', '꼭짓점에서 밑면에 수직인 선분의 길이']].forEach((row, i) => {
            g += text(tx - 170, 130 + i * 52, row[0], { size: 20, anchor: 'start', fill: '#1e3a8a' }) + text(tx - 170, 154 + i * 52, row[1], { size: 15, anchor: 'start', fill: C.sub });
        });
        return { body: g, caption: '원뿔: 평평한 면이 원이고 옆을 둘러싼 면이 굽은 면인 뿔 모양의 입체도형' };
    }
    if (shape === 'sphere') {
        const R = 130;
        const cy = 250;
        g += `<circle cx="${cx + 30}" cy="${cy}" r="${R}" fill="${C.greenL}" stroke="${C.line}" stroke-width="3"/>`;
        g += `<ellipse cx="${cx + 30}" cy="${cy}" rx="${R}" ry="${R * 0.3}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="7 6"/>`;
        g += `<circle cx="${cx + 30}" cy="${cy}" r="5" fill="${C.red}"/>` + text(cx + 30, cy - 12, '구의 중심', { size: 17, fill: C.red });
        g += line(cx + 30, cy, cx + 30 + R, cy, { stroke: C.purple, width: 3 }) + text(cx + 30 + R / 2, cy + 24, `반지름 ${numText(r)}`, { size: 17, fill: C.purple });
        const tx = 580;
        g += text(tx, 170, '구', { size: 34, fill: '#1e3a8a' });
        g += text(tx, 220, '어느 방향에서 보아도 원 모양', { size: 18, fill: C.sub });
        g += text(tx, 256, '구의 중심: 가장 안쪽에 있는 점', { size: 18, fill: C.sub });
        g += text(tx, 292, '구의 반지름: 중심에서 겉면의', { size: 18, fill: C.sub }) + text(tx, 316, '한 점을 이은 선분 (모두 같아요)', { size: 18, fill: C.sub });
        return { body: g, caption: `구: 공 모양의 입체도형. 반지름 ${numText(r)}, 지름 ${numText(r * 2)}` };
    }
    // 원기둥 + 전개도
    const ty = 130;
    const by = 360;
    g += `<path d="M ${cx - rx} ${ty} L ${cx - rx} ${by} A ${rx} ${ry} 0 0 0 ${cx + rx} ${by} L ${cx + rx} ${ty}" fill="${C.blueL}" stroke="${C.line}" stroke-width="3"/>`;
    g += `<ellipse cx="${cx}" cy="${ty}" rx="${rx}" ry="${ry}" fill="${C.yellowL}" stroke="${C.line}" stroke-width="3"/>`;
    g += `<path d="M ${cx - rx} ${by} A ${rx} ${ry} 0 0 1 ${cx + rx} ${by}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="7 6"/>`;
    g += line(cx, ty, cx + rx, ty, { stroke: C.red, width: 2.5 }) + text(cx + rx / 2, ty - 6, `반지름 ${numText(r)}`, { size: 15, fill: C.red });
    g += line(cx + rx + 16, ty, cx + rx + 16, by, { stroke: C.purple, width: 2.5 }) + text(cx + rx + 24, (ty + by) / 2, `높이 ${numText(h)}`, { size: 16, fill: C.purple, anchor: 'start' });
    g += text(cx - 50, ty + 12, '밑면', { size: 16, fill: '#b45309' }) + text(cx, (ty + by) / 2 + 20, '옆면', { size: 17, fill: '#1d4ed8' }) + text(cx, by + ry + 22, '밑면', { size: 16, fill: '#b45309' });
    // 전개도
    const nx = 440;
    const rw = 300;
    const rh = 120;
    const cr = 42;
    const ny = 200;
    g += text(nx + rw / 2, 96, '원기둥의 전개도', { size: 19, fill: '#1e3a8a' });
    g += `<circle cx="${nx + 70}" cy="${ny - cr}" r="${cr}" fill="${C.yellowL}" stroke="${C.line}" stroke-width="2.5"/>`;
    g += rect(nx, ny, rw, rh, { fill: C.blueL, width: 2.5 });
    g += `<circle cx="${nx + 70}" cy="${ny + rh + cr}" r="${cr}" fill="${C.yellowL}" stroke="${C.line}" stroke-width="2.5"/>`;
    g += text(nx + rw / 2, ny + rh / 2 - 4, '옆면 (직사각형)', { size: 17, fill: '#1d4ed8' });
    g += text(nx + rw / 2, ny + rh / 2 + 22, `가로 = 밑면의 둘레 = ${numText(r * 2)}×${pi} = ${numText(r * 2 * pi)}`, { size: 15, fill: C.red });
    g += text(nx + rw / 2, ny + rh / 2 + 44, `세로 = 높이 = ${numText(h)}`, { size: 15, fill: C.purple });
    return { body: g, caption: `원기둥: 서로 평행하고 합동인 원 2개가 밑면. 전개도에서 옆면의 가로 = 밑면의 둘레 = ${numText(r * 2 * pi)}, 세로 = 높이 = ${numText(h)}` };
}

/* ============ 단원 목록 ============ */

const P = {
    int: (key, label, min, max, def) => ({ key, label, type: 'int', min, max, def }),
    num: (key, label, min, max, def) => ({ key, label, type: 'num', min, max, def }),
    sel: (key, label, options, def) => ({ key, label, type: 'select', options, def }),
    txt: (key, label, def) => ({ key, label, type: 'text', def }),
};
const PI_OPT = [['3.14', '3.14'], ['3.1', '3.1'], ['3', '3']];
const POLY_OPT = [3, 4, 5, 6, 7, 8].map((n) => [String(n), `${POLY_NAMES[n]}각형`]);

export const MATH_UNITS = Object.freeze([
    { id: '6-1-1', term: 1, no: 1, name: '분수의 나눗셈', concepts: [
        { id: 'natdiv', name: '(자연수) ÷ (자연수)', params: [P.int('a', '나누어지는 수', 1, 9, 3), P.int('b', '나누는 수', 2, 9, 4)], draw: drawNatDiv },
        { id: 'fracdivnat', name: '(분수) ÷ (자연수)', params: [P.int('n', '분자', 1, 11, 3), P.int('d', '분모', 2, 12, 4), P.int('k', '나누는 수', 2, 6, 2)], fix: (p) => ({ ...p, n: Math.min(p.n, p.d) }), draw: drawFracDivNat },
    ] },
    { id: '6-1-2', term: 1, no: 2, name: '각기둥과 각뿔', concepts: [
        { id: 'prism', name: '각기둥', params: [P.sel('n', '밑면의 모양', POLY_OPT, '5')], fix: (p) => ({ n: Number(p.n), kind: 'prism' }), draw: drawSolid },
        { id: 'pyramid', name: '각뿔', params: [P.sel('n', '밑면의 모양', POLY_OPT, '4')], fix: (p) => ({ n: Number(p.n), kind: 'pyramid' }), draw: drawSolid },
    ] },
    { id: '6-1-3', term: 1, no: 3, name: '소수의 나눗셈', concepts: [
        { id: 'decdivnat', name: '(소수) ÷ (자연수) 세로셈', params: [P.num('a', '나누어지는 수', 0.01, 999, 8.64), P.int('b', '나누는 수', 2, 99, 4)], draw: drawDecDivNat },
    ] },
    { id: '6-1-4', term: 1, no: 4, name: '비와 비율', concepts: [
        { id: 'ratio', name: '비 · 비율 · 백분율', params: [P.int('a', '비교하는 양', 1, 20, 3), P.int('b', '기준량', 1, 20, 4)], draw: drawRatio },
    ] },
    { id: '6-1-5', term: 1, no: 5, name: '여러 가지 그래프', concepts: [
        { id: 'band', name: '띠그래프', params: [P.txt('title', '제목', '좋아하는 간식'), P.txt('items', '항목(이름:수, …)', '떡볶이:12, 김밥:8, 라면:6, 기타:4')], fix: (p) => ({ ...p, kind: 'band' }), draw: drawGraph },
        { id: 'pie', name: '원그래프', params: [P.txt('title', '제목', '좋아하는 운동'), P.txt('items', '항목(이름:수, …)', '축구:14, 피구:10, 줄넘기:6, 달리기:6, 기타:4')], fix: (p) => ({ ...p, kind: 'pie' }), draw: drawGraph },
    ] },
    { id: '6-1-6', term: 1, no: 6, name: '직육면체의 부피와 겉넓이', concepts: [
        { id: 'volume', name: '부피 (쌓기나무)', params: [P.int('w', '가로', 1, 6, 4), P.int('d', '세로', 1, 6, 3), P.int('h', '높이', 1, 6, 2)], draw: drawCuboidVolume },
        { id: 'net', name: '겉넓이 (전개도)', params: [P.int('w', '가로', 1, 12, 4), P.int('d', '세로', 1, 12, 3), P.int('h', '높이', 1, 12, 2)], draw: drawCuboidNet },
    ] },
    { id: '6-2-1', term: 2, no: 1, name: '분수의 나눗셈', concepts: [
        { id: 'fracdivfrac', name: '(분수) ÷ (분수)', params: [P.int('a', '나누어지는 수 분자', 1, 12, 3), P.int('b', '나누어지는 수 분모', 2, 8, 4), P.int('c', '나누는 수 분자', 1, 7, 1), P.int('d', '나누는 수 분모', 2, 8, 8)], fix: (p) => ({ ...p, c: Math.min(p.c, p.d) }), draw: drawFracDivFrac },
    ] },
    { id: '6-2-2', term: 2, no: 2, name: '소수의 나눗셈', concepts: [
        { id: 'decdivdec', name: '(소수) ÷ (소수) 소수점 옮기기', params: [P.num('a', '나누어지는 수', 0.01, 999, 1.44), P.num('b', '나누는 수', 0.1, 99, 0.6)], draw: drawDecDivDec },
    ] },
    { id: '6-2-3', term: 2, no: 3, name: '공간과 입체', concepts: [
        { id: 'blocks', name: '쌓기나무와 위·앞·옆 모양', params: [P.txt('grid', '층수 (뒤→앞 줄을 / 로 나눠요)', '3 2 1 / 2 1 0 / 1 0 0')], draw: drawBlocks },
    ] },
    { id: '6-2-4', term: 2, no: 4, name: '비례식과 비례배분', concepts: [
        { id: 'proportion', name: '비례식 (외항·내항)', params: [P.int('a', '전항', 1, 20, 2), P.int('b', '후항', 1, 20, 3), P.int('k', '곱하는 수', 2, 9, 4)], draw: drawProportion },
        { id: 'share', name: '비례배분', params: [P.num('total', '전체', 1, 10000, 20), P.int('a', '비 (앞)', 1, 9, 2), P.int('b', '비 (뒤)', 1, 9, 3)], draw: drawShare },
    ] },
    { id: '6-2-5', term: 2, no: 5, name: '원의 넓이', concepts: [
        { id: 'circum', name: '원주와 원주율', params: [P.num('d', '지름', 1, 100, 10), P.sel('pi', '원주율', PI_OPT, '3.14')], fix: (p) => ({ ...p, pi: Number(p.pi) }), draw: drawCircumference },
        { id: 'area', name: '원의 넓이 (잘라 붙이기)', params: [P.num('r', '반지름', 1, 100, 5), P.sel('n', '조각 수', [['8', '8조각'], ['16', '16조각'], ['32', '32조각']], '16'), P.sel('pi', '원주율', PI_OPT, '3.14')], fix: (p) => ({ ...p, n: Number(p.n), pi: Number(p.pi) }), draw: drawCircleArea },
    ] },
    { id: '6-2-6', term: 2, no: 6, name: '원기둥, 원뿔, 구', concepts: [
        { id: 'cylinder', name: '원기둥과 전개도', params: [P.num('r', '밑면의 반지름', 1, 50, 3), P.num('h', '높이', 1, 50, 8), P.sel('pi', '원주율', PI_OPT, '3.14')], fix: (p) => ({ ...p, shape: 'cylinder', pi: Number(p.pi) }), draw: drawRound },
        { id: 'cone', name: '원뿔', params: [P.num('r', '밑면의 반지름', 1, 50, 3), P.num('h', '높이', 1, 50, 4)], fix: (p) => ({ ...p, shape: 'cone', pi: 3.14 }), draw: drawRound },
        { id: 'sphere', name: '구', params: [P.num('r', '반지름', 1, 50, 5)], fix: (p) => ({ ...p, shape: 'sphere', h: 0, pi: 3.14 }), draw: drawRound },
    ] },
]);

export function findMathConcept(unitId, conceptId) {
    const unit = MATH_UNITS.find((u) => u.id === unitId) || MATH_UNITS[0];
    const concept = unit.concepts.find((c) => c.id === conceptId) || unit.concepts[0];
    return { unit, concept };
}

/** 입력값을 범위 안의 값으로 다듬어요. */
export function normalizeMathParams(concept, raw = {}) {
    const out = {};
    concept.params.forEach((p) => {
        const v = raw[p.key];
        if (p.type === 'int' || p.type === 'num') {
            let n = Number(v);
            if (v === '' || v == null || !Number.isFinite(n)) n = p.def;
            n = Math.max(p.min, Math.min(p.max, n));
            out[p.key] = p.type === 'int' ? Math.round(n) : Math.round(n * 1000) / 1000;
        } else if (p.type === 'select') {
            out[p.key] = p.options.some((o) => o[0] === String(v)) ? String(v) : p.def;
        } else {
            out[p.key] = v == null ? p.def : String(v).slice(0, 120);
        }
    });
    return out;
}

/** 그림 만들기 */
export function renderMathConcept(unitId, conceptId, rawParams = {}) {
    const { unit, concept } = findMathConcept(unitId, conceptId);
    const params = normalizeMathParams(concept, rawParams);
    const drawn = concept.draw(concept.fix ? concept.fix(params) : params);
    const title = `6-${unit.term} ${unit.no}단원 ${unit.name} · ${concept.name}`;
    return { svg: frame(title, drawn.body, drawn.caption), title, caption: drawn.caption, params, unit, concept };
}
