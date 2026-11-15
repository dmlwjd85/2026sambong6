/**
 * 1~5학년 수학 개념 그림(단원 목록과 그리기 함수).
 * 그림 조각 만들기 도구(kit)는 mathConcept.js 가 넘겨줘요. 여기서는 다른 파일을 불러오지 않아요.
 * 그리기 함수는 { body, caption, steps } 를 돌려줘요(steps: 단계별 설명, 그림 조각은 S(단계, 조각)).
 */

const SINO = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const NATIVE = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
/** 수 읽기(한자어): 0~99999999 */
export function readSino(n) {
    const v = Math.floor(Math.abs(Number(n) || 0));
    if (v === 0) return '영';
    const part = (x) => {
        let out = '';
        [[1000, '천'], [100, '백'], [10, '십'], [1, '']].forEach(([u, name]) => {
            const d = Math.floor(x / u) % 10;
            if (!d) return;
            out += (d === 1 && u > 1 ? '' : SINO[d]) + name;
        });
        return out;
    };
    const man = Math.floor(v / 10000);
    const rest = v % 10000;
    return `${man ? `${man === 1 ? '' : part(man)}만` : ''}${man && rest ? ' ' : ''}${rest ? part(rest) : ''}`;
}
/** 수 읽기(고유어): 1~99 */
export function readNative(n) {
    const v = Math.floor(Number(n) || 0);
    if (v < 1 || v > 99) return '';
    return `${NATIVE_TENS[Math.floor(v / 10)]}${NATIVE[v % 10]}`;
}

/** 수 뒤에 붙는 조사(받침이 있으면 앞의 것) */
const hasBatchim = (n) => [0, 1, 3, 6, 7, 8].includes(Math.abs(Math.round(Number(n))) % 10);
const roJosa = (n) => `${n}${[0, 3, 6].includes(Math.abs(Math.round(Number(n))) % 10) ? '으로' : '로'}`;
export const josa = (n, withB, withoutB) => `${n}${hasBatchim(n) ? withB : withoutB}`;

export function buildLowerUnits(kit) {
    const { C, PALETTE, text, line, rect, poly, frac, fracResult, simplifyFraction, S, P, numText, textWidth, r2, gcd, lcm, isoCube, drawLongDivision, parseGraphItems } = kit;
    const W = kit.MATH_W;
    const circle = (cx, cy, r, { fill = C.blue, stroke = 'none', width = 2, extra = '' } = {}) => `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
    const path = (d, { fill = 'none', stroke = C.line, width = 2, dash = '' } = {}) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    const big = (x, y, s, fill = '#1e3a8a', size = 30) => text(x, y, s, { size, fill, weight: 800 });
    const cross = (x, y, r) => line(x - r, y - r, x + r, y + r, { stroke: C.red, width: 4 }) + line(x - r, y + r, x + r, y - r, { stroke: C.red, width: 4 });
    /** 화살표(끝이 뾰족한 선) */
    const arrow = (x1, y1, x2, y2, color = C.red, width = 3) => {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const h = 10;
        return line(x1, y1, x2, y2, { stroke: color, width }) + poly([[x2, y2], [x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)], [x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)]], { fill: color, stroke: color, width: 1 });
    };

    /* ================= 1학년 ================= */

    /** 10칸 틀에 점 놓기. 돌려주는 값: 틀 그림, 점 좌표들 */
    function tenFrames(n, x0, y0, cell, perRow = 5) {
        const frames = Math.max(1, Math.ceil(n / 10));
        const fw = cell * 5 + 14;
        const fh = cell * 2 + 14;
        let box = '';
        const pts = [];
        for (let f = 0; f < frames; f += 1) {
            const fx = x0 + (f % perRow) * fw;
            const fy = y0 + Math.floor(f / perRow) * fh;
            for (let i = 0; i < 10; i += 1) {
                const cx = fx + (i % 5) * cell;
                const cy = fy + Math.floor(i / 5) * cell;
                box += rect(cx, cy, cell, cell, { fill: '#f8fafc', stroke: '#94a3b8', width: 1.5 });
                if (f * 10 + i < n) pts.push([cx + cell / 2, cy + cell / 2, f]);
            }
            box += rect(fx, fy, cell * 5, cell * 2, { width: 2.5 });
        }
        return { box, pts, fw, fh, frames };
    }

    function drawCount({ n }) {
        const small = n <= 10;
        const cell = small ? 70 : n <= 50 ? 26 : 24;
        const perRow = 5;
        const frames = Math.max(1, Math.ceil(n / 10));
        const fw = cell * 5 + 14;
        const x0 = small ? (W - cell * 5) / 2 : (W - Math.min(frames, perRow) * fw + 14) / 2;
        const tf = tenFrames(n, x0, small ? 100 : 96, cell, perRow);
        const tens = Math.floor(n / 10);
        const ones = n % 10;
        let g = S(1, tf.box);
        let dots = '';
        tf.pts.forEach((p) => { dots += circle(p[0], p[1], cell * 0.36, { fill: p[2] < tens ? C.blue : C.orange }); });
        g += S(2, dots, 'wipe');
        const yTxt = small ? 290 : 96 + Math.ceil(frames / perRow) * (cell * 2 + 14) + 34;
        if (small) {
            g += S(3, big(W / 2, yTxt + 60, String(n), '#1e3a8a', 90) + text(W / 2, yTxt + 100, `${SINO[n % 10] || '십'}${n === 10 ? '' : ''} · ${n === 10 ? '열' : NATIVE[n]}`, { size: 26, fill: C.sub }));
            return { body: g, caption: `${n}: 하나씩 세면 ${n === 10 ? '열' : NATIVE[n]}, 수로 쓰면 ${n}이고 "${n === 10 ? '십' : SINO[n]}"이라고도 읽어요.`, steps: [`물건을 하나씩 세어서 칸에 놓을 거예요.`, `하나씩 세어 보면 모두 ${n === 10 ? '열' : NATIVE[n]}이에요.`, `수로 쓰면 ${n}. "${n === 10 ? '십' : SINO[n]}" 또는 "${n === 10 ? '열' : NATIVE[n]}"이라고 읽어요.`] };
        }
        g += S(3, text(W / 2 - 150, yTxt, `10개씩 묶음 ${tens}개`, { size: 24, fill: C.blue }) + text(W / 2 + 150, yTxt, `낱개 ${ones}개`, { size: 24, fill: '#c2410c' }));
        g += S(4, big(W / 2, yTxt + 70, String(n), '#1e3a8a', 64) + text(W / 2, yTxt + 104, `${readSino(n)}${n < 100 ? ` · ${readNative(n)}` : ''}`, { size: 22, fill: C.sub }));
        return { body: g, caption: `${josa(n, '은', '는')} 10개씩 묶음 ${tens}개와 낱개 ${ones}개예요. "${readSino(n)}"${n < 100 ? ` 또는 "${readNative(n)}"` : ''}이라고 읽어요.`, steps: [
            `10칸짜리 틀에 하나씩 놓으며 세어 봐요.`,
            `틀이 가득 차면 10개예요. 파란색은 10개씩 묶음, 주황색은 낱개예요.`,
            `10개씩 묶음이 ${tens}개, 낱개가 ${ones}개예요.`,
            `그래서 ${n}이에요. "${readSino(n)}"${n < 100 ? ` 또는 "${readNative(n)}"` : ''}이라고 읽어요.`,
        ] };
    }

    function drawShapes3d() {
        const box = poly([[90, 250], [210, 250], [210, 350], [90, 350]], { fill: C.blueL, width: 3 }) + poly([[90, 250], [130, 215], [250, 215], [210, 250]], { fill: '#dbeafe', width: 3 }) + poly([[210, 250], [250, 215], [250, 315], [210, 350]], { fill: '#93c5fd', width: 3 });
        const cyl = path('M 340 240 L 340 340 A 60 20 0 0 0 460 340 L 460 240', { fill: C.orangeL, width: 3 }) + `<ellipse cx="400" cy="240" rx="60" ry="20" fill="#ffedd5" stroke="${C.line}" stroke-width="3"/>`;
        const ball = circle(640, 290, 68, { fill: C.greenL, stroke: C.line, width: 3 }) + path('M 580 300 Q 640 330 700 300', { stroke: '#64748b', dash: '6 5' });
        let g = S(1, box + big(170, 150, '상자 모양', '#1d4ed8', 26) + text(170, 400, '평평한 면 · 뾰족한 곳', { size: 17, fill: C.sub }) + text(170, 424, '잘 쌓을 수 있어요', { size: 17, fill: C.sub }));
        g += S(2, cyl + big(400, 150, '둥근 기둥 모양', '#c2410c', 26) + text(400, 400, '평평한 면 + 둥근 면', { size: 17, fill: C.sub }) + text(400, 424, '세우면 쌓고, 눕히면 굴러요', { size: 17, fill: C.sub }));
        g += S(3, ball + big(640, 150, '공 모양', '#15803d', 26) + text(640, 400, '둥근 면만 있어요', { size: 17, fill: C.sub }) + text(640, 424, '어느 쪽으로도 잘 굴러요', { size: 17, fill: C.sub }));
        g += S(4, text(170, 190, '예: 상자, 주사위', { size: 16, fill: '#1d4ed8' }) + text(400, 190, '예: 캔, 풀', { size: 16, fill: '#c2410c' }) + text(640, 190, '예: 공, 구슬', { size: 16, fill: '#15803d' }));
        return { body: g, caption: '상자 모양은 잘 쌓이고, 공 모양은 잘 굴러요. 둥근 기둥 모양은 쌓을 수도 굴릴 수도 있어요.', steps: [
            '상자 모양이에요. 평평한 면과 뾰족한 곳이 있어서 잘 쌓을 수 있어요.',
            '둥근 기둥 모양이에요. 세우면 쌓을 수 있고, 눕히면 굴러가요.',
            '공 모양이에요. 둥근 면만 있어서 어느 쪽으로도 잘 굴러요.',
            '우리 주변에서 같은 모양을 찾아봐요.',
        ] };
    }

    function dotRow(n, x0, y, r, gap, fill) {
        let s = '';
        for (let i = 0; i < n; i += 1) s += circle(x0 + i * gap, y, r, { fill });
        return s;
    }

    function drawAddDots({ a, b }) {
        const gap = 62;
        const x0 = (W - (a + b - 1) * gap) / 2;
        let g = S(1, dotRow(a, x0, 170, 24, gap, C.blue) + text(x0 + ((a - 1) * gap) / 2, 120, `${a}`, { size: 34, fill: C.blue }));
        g += S(2, dotRow(b, x0 + a * gap, 170, 24, gap, C.orange) + text(x0 + a * gap + ((b - 1) * gap) / 2, 120, `${b}`, { size: 34, fill: '#c2410c' }), 'drop');
        g += S(3, path(`M ${x0 - 24} 210 Q ${W / 2} 262 ${x0 + (a + b - 1) * gap + 24} 210`, { stroke: C.green, width: 4 }) + text(W / 2, 290, `모두 ${a + b}`, { size: 30, fill: '#15803d' }));
        g += S(4, big(W / 2, 390, `${a} + ${b} = ${a + b}`, '#1e3a8a', 60));
        return { body: g, caption: `${a} 더하기 ${b}는 ${a + b}와 같습니다.  ${a} + ${b} = ${a + b}`, steps: [`파란 구슬이 ${a}개 있어요.`, `주황 구슬 ${b}개가 더 왔어요.`, `모두 세어 보면 ${a + b}개예요.`, `식으로 쓰면 ${a} + ${b} = ${a + b}. "${a} 더하기 ${b}는 ${a + b}와 같습니다."`] };
    }

    function drawSubDots({ a, b }) {
        const gap = 62;
        const x0 = (W - (a - 1) * gap) / 2;
        let g = S(1, dotRow(a, x0, 170, 24, gap, C.blue) + text(W / 2, 120, `${a}`, { size: 34, fill: C.blue }));
        let xs = '';
        for (let i = a - b; i < a; i += 1) xs += cross(x0 + i * gap, 170, 22);
        g += S(2, xs + text(x0 + (a - b + (b - 1) / 2) * gap, 232, `${b}개를 덜어 내요`, { size: 20, fill: C.red }));
        g += S(3, (a - b > 0 ? path(`M ${x0 - 24} 204 Q ${x0 + ((a - b - 1) * gap) / 2} 250 ${x0 + (a - b - 1) * gap + 24} 204`, { stroke: C.green, width: 4 }) : '') + text(W / 2, 300, `남은 것 ${a - b}`, { size: 30, fill: '#15803d' }));
        g += S(4, big(W / 2, 390, `${a} − ${b} = ${a - b}`, '#1e3a8a', 60));
        return { body: g, caption: `${a} 빼기 ${b}는 ${a - b}와 같습니다.  ${a} − ${b} = ${a - b}`, steps: [`구슬이 ${a}개 있어요.`, `그중 ${b}개를 덜어 내요.`, `남은 구슬을 세어 보면 ${a - b}개예요.`, `식으로 쓰면 ${a} − ${b} = ${a - b}. "${a} 빼기 ${b}는 ${a - b}와 같습니다."`] };
    }

    function drawCompare({ a, b }) {
        const u = 60;
        const x0 = 110;
        const pencil = (y, n, fill) => rect(x0, y, n * u, 34, { fill, rx: 6 }) + poly([[x0 + n * u, y], [x0 + n * u + 28, y + 17], [x0 + n * u, y + 34]], { fill: '#fde68a' });
        let g = S(1, pencil(130, a, C.blue) + text(x0 - 14, 154, '가', { size: 24, anchor: 'end' }) + pencil(210, b, C.orange) + text(x0 - 14, 234, '나', { size: 24, anchor: 'end' }));
        g += S(2, line(x0, 110, x0, 270, { stroke: C.red, width: 3, dash: '7 5' }) + text(x0, 100, '한쪽 끝을 맞춰요', { size: 17, fill: C.red }), 'drop');
        const longer = a === b ? '' : a > b ? '가' : '나';
        g += S(3, big(W / 2, 320, a === b ? '가와 나의 길이가 같아요' : `${longer}가 더 길어요 · ${longer === '가' ? '나' : '가'}가 더 짧아요`, '#15803d', 28));
        g += S(4, big(W / 2, 400, a === b ? `${a} = ${b}` : `${josa(Math.max(a, b), '은', '는')} ${Math.min(a, b)}보다 큽니다`, '#1e3a8a', 34));
        return { body: g, caption: a === b ? `길이를 비교할 때는 한쪽 끝을 맞춰요. 두 연필의 길이가 같아요.` : `길이를 비교할 때는 한쪽 끝을 맞춰요. ${longer}가 더 길어요. 수로는 ${josa(Math.max(a, b), '이', '가')} ${Math.min(a, b)}보다 커요.`, steps: [
            '연필 두 자루의 길이를 비교해 봐요.',
            '한쪽 끝을 똑같이 맞춰요.',
            a === b ? '반대쪽 끝도 똑같아요. 길이가 같아요.' : `반대쪽 끝이 더 많이 나간 ${longer}가 더 길어요.`,
            a === b ? `수로도 ${a}와 ${b}는 같아요.` : `수로 비교하면 ${josa(Math.max(a, b), '은', '는')} ${Math.min(a, b)}보다 커요.`,
        ] };
    }

    /** 십 모형·일 모형 */
    function rods(tens, ones, x0, y0, fill) {
        let s = '';
        for (let t = 0; t < tens; t += 1) { for (let k = 0; k < 10; k += 1) s += rect(x0 + t * 22, y0 + k * 12, 16, 12, { fill, stroke: '#1e293b', width: 1 }); }
        const ox = x0 + tens * 22 + 14;
        for (let i = 0; i < ones; i += 1) s += rect(ox + (i % 5) * 20, y0 + 96 - Math.floor(i / 5) * 20, 16, 16, { fill, stroke: '#1e293b', width: 1 });
        return s;
    }

    function drawTensOnes({ a, b, op }) {
        const sub = op === 'sub';
        const res = sub ? a - b : a + b;
        const ta = Math.floor(a / 10);
        const oa = a % 10;
        const tb = Math.floor(b / 10);
        const ob = b % 10;
        let g = S(1, rods(ta, oa, 70, 110, C.blueL) + text(170, 260, `${a}`, { size: 30, fill: C.blue }));
        g += S(2, text(360, 180, sub ? '−' : '+', { size: 50 }) + rods(tb, ob, 430, 110, C.orangeL) + text(530, 260, `${b}`, { size: 30, fill: '#c2410c' }));
        const y = 330;
        g += S(3, text(250, y, `낱개끼리: ${oa} ${sub ? '−' : '+'} ${ob} = ${sub ? oa - ob : oa + ob}`, { size: 24, fill: '#c2410c' }));
        g += S(4, text(250, y + 40, `10개씩 묶음끼리: ${ta} ${sub ? '−' : '+'} ${tb} = ${sub ? ta - tb : ta + tb}`, { size: 24, fill: C.blue }));
        g += S(5, big(600, y + 26, `${a} ${sub ? '−' : '+'} ${b} = ${res}`, '#1e3a8a', 40));
        return { body: g, caption: `낱개는 낱개끼리, 10개씩 묶음은 10개씩 묶음끼리 ${sub ? '빼요' : '더해요'}. ${a} ${sub ? '−' : '+'} ${b} = ${res}`, steps: [
            `${josa(a, '은', '는')} 10개씩 묶음 ${ta}개와 낱개 ${oa}개예요.`,
            `${josa(b, '은', '는')} 10개씩 묶음 ${tb}개와 낱개 ${ob}개예요.`,
            `낱개끼리 ${sub ? '빼면' : '더하면'} ${oa} ${sub ? '−' : '+'} ${ob} = ${sub ? oa - ob : oa + ob}`,
            `10개씩 묶음끼리 ${sub ? '빼면' : '더하면'} ${ta} ${sub ? '−' : '+'} ${tb} = ${sub ? ta - tb : ta + tb}`,
            `그래서 ${a} ${sub ? '−' : '+'} ${b} = ${res}`,
        ] };
    }

    function drawShapes2d() {
        const sq = rect(100, 210, 130, 130, { fill: C.blueL, width: 3 });
        const tri = poly([[400, 200], [330, 340], [470, 340]], { fill: C.orangeL, width: 3 });
        const cir = circle(640, 275, 68, { fill: C.greenL, stroke: C.line, width: 3 });
        const dot = (x, y) => circle(x, y, 7, { fill: C.red });
        let g = S(1, sq + big(165, 150, '■ 모양', '#1d4ed8', 28)) + S(2, tri + big(400, 150, '▲ 모양', '#c2410c', 28)) + S(3, cir + big(640, 150, '● 모양', '#15803d', 28));
        g += S(4, dot(100, 210) + dot(230, 210) + dot(100, 340) + dot(230, 340) + text(165, 390, '뾰족한 곳 4군데', { size: 18, fill: C.sub }) + dot(400, 200) + dot(330, 340) + dot(470, 340) + text(400, 390, '뾰족한 곳 3군데', { size: 18, fill: C.sub }) + text(640, 390, '뾰족한 곳이 없어요', { size: 18, fill: C.sub }));
        g += S(5, text(165, 416, '곧은 선 4개', { size: 18, fill: C.sub }) + text(400, 416, '곧은 선 3개', { size: 18, fill: C.sub }) + text(640, 416, '둥근 선', { size: 18, fill: C.sub }));
        return { body: g, caption: '■ 모양은 뾰족한 곳이 4군데, ▲ 모양은 3군데, ● 모양은 뾰족한 곳이 없고 둥글어요.', steps: ['■ 모양이에요. 공책, 창문에서 볼 수 있어요.', '▲ 모양이에요. 삼각자, 옷걸이에서 볼 수 있어요.', '● 모양이에요. 동전, 시계에서 볼 수 있어요.', '뾰족한 곳을 세어 봐요. ■는 4군데, ▲는 3군데, ●는 없어요.', '■와 ▲는 곧은 선으로, ●는 둥근 선으로 되어 있어요.'] };
    }

    function drawClock({ h, m }) {
        const cx = 250;
        const cy = 270;
        const R = 150;
        let face = circle(cx, cy, R, { fill: '#fff', stroke: C.line, width: 5 });
        for (let i = 1; i <= 12; i += 1) { const a = (i / 12) * 2 * Math.PI - Math.PI / 2; face += text(cx + (R - 28) * Math.cos(a), cy + (R - 28) * Math.sin(a) + 9, i, { size: 24 }); }
        for (let i = 0; i < 60; i += 1) { const a = (i / 60) * 2 * Math.PI; face += line(cx + (R - (i % 5 ? 6 : 12)) * Math.sin(a), cy - (R - (i % 5 ? 6 : 12)) * Math.cos(a), cx + R * Math.sin(a), cy - R * Math.cos(a), { width: i % 5 ? 1 : 2.5, stroke: '#64748b' }); }
        let g = S(1, face + circle(cx, cy, 7, { fill: C.ink }));
        const ha = ((h % 12) + m / 60) / 12 * 2 * Math.PI;
        const ma = (m / 60) * 2 * Math.PI;
        g += S(2, line(cx, cy, cx + 78 * Math.sin(ha), cy - 78 * Math.cos(ha), { stroke: C.red, width: 9 }) + text(540, 150, '짧은바늘', { size: 24, fill: C.red }) + text(540, 182, m === 0 ? `${josa(h, '을', '를')} 가리켜요` : `${josa(h, '과', '와')} ${h % 12 + 1} 사이`, { size: 20, fill: C.sub }));
        g += S(3, line(cx, cy, cx + 118 * Math.sin(ma), cy - 118 * Math.cos(ma), { stroke: C.blue, width: 6 }) + text(540, 250, '긴바늘', { size: 24, fill: C.blue }) + text(540, 282, m % 5 === 0 ? `${josa(m === 0 ? 12 : m / 5, '을', '를')} 가리켜요 → ${m}분` : `작은 눈금 ${m}칸 → ${m}분`, { size: 20, fill: C.sub }));
        g += S(4, big(540, 370, m === 0 ? `${h}시` : m === 30 ? `${h}시 30분` : `${h}시 ${m}분`, '#1e3a8a', 50));
        return { body: g, caption: `짧은바늘은 '시', 긴바늘은 '분'을 나타내요. 이 시계는 ${h}시${m ? ` ${m}분` : ''}이에요.`, steps: [
            '시계에는 1부터 12까지의 수와 바늘 두 개가 있어요.',
            m === 0 ? `짧은바늘이 ${josa(h, '을', '를')} 가리켜요. 그래서 ${h}시예요.` : `짧은바늘이 ${josa(h, '과', '와')} ${h % 12 + 1} 사이에 있어요. ${h}시를 지났다는 뜻이에요.`,
            m === 0 ? '긴바늘이 12를 가리키면 정각이에요.' : m % 5 === 0 ? `긴바늘이 ${josa(m / 5, '을', '를')} 가리켜요. 숫자 한 칸이 5분이니까 ${m}분이에요.` : `긴바늘이 작은 눈금 ${m}칸을 지났어요. ${m}분이에요.`,
            `그래서 ${h}시${m ? ` ${m}분` : ''}이에요.`,
        ] };
    }

    function drawMakeTen({ a, b }) {
        const cell = 56;
        const x0 = 90;
        const tf = tenFrames(10, x0, 110, cell);
        const move = 10 - a;
        const rest = b - move;
        let g = S(1, tf.box + tf.pts.slice(0, a).map((p) => circle(p[0], p[1], 20, { fill: C.blue })).join('') + text(x0 + cell * 2.5, 96, `${a}`, { size: 28, fill: C.blue }));
        const bx = 530;
        const bdot = (i) => [bx + (i % 5) * 58, 140 + Math.floor(i / 5) * 58];
        let outside = '';
        for (let i = 0; i < b; i += 1) { const p = bdot(i); outside += circle(p[0], p[1], 20, { fill: i < move ? C.orangeL : C.orange, stroke: '#c2410c', width: 2 }); }
        g += S(2, outside + text(bx + 116, 96, `${b}`, { size: 28, fill: '#c2410c' }));
        g += S(3, tf.pts.slice(a, 10).map((p) => circle(p[0], p[1], 20, { fill: C.orange })).join('') + arrow(bx - 30, 150, x0 + cell * 5 + 12, 150) + text(438, 136, `${move}개 옮기기`, { size: 17, fill: C.red }), 'pop');
        g += S(4, text(x0 + cell * 2.5, 260, '10', { size: 34, fill: '#15803d' }) + text(bx + 116, 290, `남은 ${rest}`, { size: 26, fill: '#c2410c' }));
        g += S(5, big(W / 2, 380, `${a} + ${b} = 10 + ${rest} = ${a + b}`, '#1e3a8a', 44));
        return { body: g, caption: `10을 먼저 만들어요. ${b}를 ${move}와 ${rest}로 가르면 ${a} + ${move} = 10, 10 + ${rest} = ${a + b}`, steps: [
            `10칸 틀에 ${a}개가 있어요. 빈칸은 ${move}칸이에요.`,
            `${b}개를 더하려고 해요.`,
            `${b}개 중 ${move}개를 옮겨 빈칸을 채워요. 10이 됐어요!`,
            `10개와 남은 ${rest}개가 있어요.`,
            `10 + ${rest} = ${a + b}. 그래서 ${a} + ${b} = ${a + b}`,
        ] };
    }

    function drawSubTen({ a, b }) {
        const cell = 56;
        const x0 = 90;
        const tf = tenFrames(10, x0, 110, cell);
        const extra = a - 10;
        let g = S(1, tf.box + tf.pts.map((p) => circle(p[0], p[1], 20, { fill: C.blue })).join('') + text(x0 + cell * 2.5, 96, '10', { size: 28, fill: C.blue }));
        const bx = 470;
        let ex = '';
        for (let i = 0; i < extra; i += 1) ex += circle(bx + (i % 5) * 58, 140 + Math.floor(i / 5) * 58, 20, { fill: C.orange });
        g += S(1, ex + text(bx + 116, 96, `${extra}`, { size: 28, fill: '#c2410c' }));
        g += S(2, big(W / 2, 290, `${a} = 10 + ${extra}`, C.sub, 26));
        g += S(3, tf.pts.slice(10 - b).map((p) => cross(p[0], p[1], 18)).join('') + text(x0 + cell * 2.5, 262, `10에서 ${b}를 빼면 ${10 - b}`, { size: 22, fill: C.red }));
        g += S(4, big(W / 2, 380, `${a} − ${b} = ${10 - b} + ${extra} = ${a - b}`, '#1e3a8a', 44));
        return { body: g, caption: `${a}를 10과 ${extra}로 가르고, 10에서 ${b}를 빼요. 10 − ${b} = ${10 - b}, ${10 - b} + ${extra} = ${a - b}`, steps: [
            `${a}개가 있어요. 10개 한 묶음과 낱개 ${extra}개예요.`,
            `${a}를 10과 ${extra}로 갈라서 생각해요.`,
            `낱개로는 ${b}를 뺄 수 없으니 10에서 ${b}를 빼요. ${10 - b}개가 남아요.`,
            `남은 ${10 - b}개와 낱개 ${extra}개를 더하면 ${a - b}. 그래서 ${a} − ${b} = ${a - b}`,
        ] };
    }

    const PATTERN_UNITS = { AB: [0, 1], AAB: [0, 0, 1], ABB: [0, 1, 1], ABC: [0, 1, 2] };
    function drawPattern({ kind }) {
        const unit = PATTERN_UNITS[kind] || PATTERN_UNITS.AB;
        const shapeAt = (t, x, y) => (t === 0 ? circle(x, y, 26, { fill: C.blue }) : t === 1 ? rect(x - 24, y - 24, 48, 48, { fill: C.orange, stroke: 'none', rx: 4 }) : poly([[x, y - 28], [x - 28, y + 24], [x + 28, y + 24]], { fill: C.green, stroke: 'none' }));
        const names = ['●', '■', '▲'];
        const n = unit.length * 3;
        const gap = Math.min(70, 640 / (n + 1));
        const x0 = (W - n * gap) / 2 + gap / 2 - gap / 2;
        let seq = '';
        for (let i = 0; i < n; i += 1) seq += shapeAt(unit[i % unit.length], x0 + i * gap, 180);
        let g = S(1, seq);
        let boxes = '';
        for (let k = 0; k < 3; k += 1) boxes += rect(x0 + k * unit.length * gap - gap / 2 + 4, 140, unit.length * gap - 8, 80, { stroke: C.red, width: 3, rx: 10, extra: 'stroke-dasharray="8 5"' });
        g += S(2, boxes + text(W / 2, 260, `${unit.map((t) => names[t]).join(' ')} 가 되풀이돼요`, { size: 24, fill: C.red }));
        g += S(3, rect(x0 + n * gap - gap / 2 + 6, 148, gap - 12, 64, { fill: '#fef9c3', stroke: '#eab308', width: 3, rx: 10 }) + text(x0 + n * gap, 192, '?', { size: 34, fill: '#a16207' }) + text(W / 2, 320, '다음에는 무엇이 올까요?', { size: 24 }));
        g += S(4, shapeAt(unit[0], W / 2, 390) + text(W / 2 + 60, 400, `→ ${names[unit[0]]}`, { size: 28, fill: '#15803d', anchor: 'start' }));
        return { body: g, caption: `규칙: ${unit.map((t) => names[t]).join(' ')} 가 되풀이돼요. 그래서 다음에는 ${names[unit[0]]} 가 와요.`, steps: ['모양이 한 줄로 놓여 있어요.', `되풀이되는 부분을 찾아요. ${unit.map((t) => names[t]).join(' ')} 가 계속 나와요.`, '그럼 다음 자리에는 무엇이 올까요?', `되풀이되는 부분의 처음인 ${names[unit[0]]} 가 와요.`] };
    }

    /* ================= 2학년 ================= */

    function drawPlaceValue({ n }) {
        const d = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
        const use4 = n >= 1000;
        const cols = use4 ? [0, 1, 2, 3] : [1, 2, 3];
        const names = ['천', '백', '십', '일'];
        const vals = [1000, 100, 10, 1];
        const fills = ['#ddd6fe', C.greenL, C.blueL, C.orangeL];
        const cw = use4 ? 180 : 230;
        const x0 = (W - cols.length * cw) / 2;
        let g = '';
        let head = '';
        cols.forEach((c, i) => { head += rect(x0 + i * cw, 76, cw, 36, { fill: '#eff6ff', stroke: '#93c5fd' }) + text(x0 + i * cw + cw / 2, 101, `${names[c]}의 자리`, { size: 18, fill: '#1e3a8a' }) + rect(x0 + i * cw, 112, cw, 190, { stroke: '#93c5fd' }); });
        g += S(1, head);
        cols.forEach((c, i) => {
            let blocks = '';
            const bx = x0 + i * cw + 12;
            for (let k = 0; k < d[c]; k += 1) {
                if (c === 0) blocks += rect(bx + (k % 3) * 52, 122 + Math.floor(k / 3) * 58, 46, 46, { fill: fills[0], stroke: '#5b21b6', width: 2 }) + text(bx + (k % 3) * 52 + 23, 151 + Math.floor(k / 3) * 58, '1000', { size: 12, fill: '#5b21b6' });
                else if (c === 1) blocks += rect(bx + (k % (use4 ? 3 : 5)) * (use4 ? 52 : 42), 122 + Math.floor(k / (use4 ? 3 : 5)) * 58, 38, 38, { fill: fills[1], stroke: '#166534', width: 2 }) + text(bx + (k % (use4 ? 3 : 5)) * (use4 ? 52 : 42) + 19, 146 + Math.floor(k / (use4 ? 3 : 5)) * 58, '100', { size: 11, fill: '#166534' });
                else if (c === 2) blocks += rect(bx + k * 17, 122, 12, 110, { fill: fills[2], stroke: '#1d4ed8', width: 1.5 });
                else blocks += rect(bx + (k % 5) * 26, 122 + Math.floor(k / 5) * 26, 20, 20, { fill: fills[3], stroke: '#c2410c', width: 1.5 });
            }
            g += S(2 + i, blocks + text(x0 + i * cw + cw / 2, 290, `${names[c]} 모형 ${d[c]}개`, { size: 16, fill: C.sub }) + big(x0 + i * cw + cw / 2, 350, String(d[c]), '#1e3a8a', 46) + text(x0 + i * cw + cw / 2, 384, `= ${d[c] * vals[c]}`, { size: 20, fill: C.sub }));
        });
        const last = 2 + cols.length;
        g += S(last, big(W / 2, 430, `${n} = ${cols.map((c) => d[c] * vals[c]).join(' + ')}`, '#15803d', 26));
        const steps = ['자리마다 모형을 놓아 수를 알아봐요.'];
        cols.forEach((c) => steps.push(`${names[c]}의 자리 숫자는 ${d[c]}. ${names[c]} 모형이 ${d[c]}개니까 ${josa(d[c] * vals[c], '을', '를')} 나타내요.`));
        steps.push(`모두 더하면 ${n}. "${readSino(n)}"이라고 읽어요.`);
        return { body: g, caption: `${n}(${readSino(n)}) = ${cols.map((c) => `${names[c]} ${d[c]}`).join(', ')} → ${cols.map((c) => d[c] * vals[c]).join(' + ')}`, steps };
    }

    const NGON = { 3: '삼각형', 4: '사각형', 5: '오각형', 6: '육각형', 7: '칠각형', 8: '팔각형' };
    function ngonPts(n, cx, cy, R) { return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n === 4 ? Math.PI / 4 : 0); return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; }); }

    function drawPolygon({ n }) {
        const pts = ngonPts(n, 250, 270, 150);
        let g = S(1, poly(pts, { fill: C.blueL, width: 4 }) + big(580, 130, NGON[n], '#1e3a8a', 40));
        let sides = '';
        pts.forEach((p, i) => { const q = pts[(i + 1) % n]; sides += line(p[0], p[1], q[0], q[1], { stroke: C.orange, width: 7 }) + text((p[0] + q[0]) / 2 + ((p[0] + q[0]) / 2 - 250) * 0.16, (p[1] + q[1]) / 2 + ((p[1] + q[1]) / 2 - 270) * 0.16 + 7, i + 1, { size: 20, fill: '#c2410c' }); });
        g += S(2, sides + text(580, 200, `변: 곧은 선 ${n}개`, { size: 26, fill: '#c2410c' }));
        g += S(3, pts.map((p) => circle(p[0], p[1], 10, { fill: C.red })).join('') + text(580, 250, `꼭짓점: ${n}개`, { size: 26, fill: C.red }));
        g += S(4, text(580, 320, `변이 ${n}개, 꼭짓점이 ${n}개인`, { size: 20, fill: C.sub }) + text(580, 348, `도형을 ${NGON[n]}이라고 해요`, { size: 20, fill: C.sub }));
        return { body: g, caption: `${NGON[n]}: 변이 ${n}개, 꼭짓점이 ${n}개예요.`, steps: [`이 도형의 이름은 ${NGON[n]}이에요.`, `곧은 선을 변이라고 해요. 세어 보면 ${n}개예요.`, `두 변이 만나는 점을 꼭짓점이라고 해요. ${n}개예요.`, `변 ${n}개로 둘러싸인 도형이 ${NGON[n]}이에요.`] };
    }

    function drawCircleShape() {
        let g = S(1, circle(250, 270, 150, { fill: C.greenL, stroke: C.line, width: 4 }) + big(580, 130, '원', '#1e3a8a', 44));
        g += S(2, text(580, 200, '뾰족한 부분이 없어요', { size: 24, fill: C.sub }) + text(580, 236, '곧은 선이 없어요', { size: 24, fill: C.sub }));
        g += S(3, circle(120, 420, 22, { fill: C.blueL, stroke: C.line }) + circle(190, 410, 34, { fill: C.orangeL, stroke: C.line }) + circle(280, 400, 46, { fill: '#fef08a', stroke: C.line }) + text(580, 300, '크기는 달라도', { size: 24, fill: '#15803d' }) + text(580, 336, '모양은 모두 같아요', { size: 24, fill: '#15803d' }));
        return { body: g, caption: '원: 어느 쪽에서 보아도 똑같이 동그란 모양. 뾰족한 부분과 곧은 선이 없어요.', steps: ['동그란 이 도형을 원이라고 해요.', '원에는 뾰족한 부분도, 곧은 선도 없어요.', '원은 크기가 달라도 모양은 모두 같아요.'] };
    }

    /** 세로셈(덧셈·뺄셈). dp: 소수 자릿수 */
    function drawColumn({ a, b, op, dp = 0 }) {
        const sub = op === 'sub';
        const m = 10 ** dp;
        const A = Math.round(a * m);
        const B = Math.round(b * m);
        const R = sub ? A - B : A + B;
        const len = Math.max(String(Math.max(A, R)).length, String(B).length, dp + 1);
        const da = String(A).padStart(len, ' ').split('');
        const db = String(B).padStart(len, ' ').split('');
        const dr = String(R).padStart(len, '0').split('');
        // 앞자리 0 정리(소수점 앞 한 자리는 남겨요)
        for (let i = 0; i < len - dp - 1 && dr[i] === '0'; i += 1) dr[i] = ' ';
        for (let i = 0; i < len; i += 1) { if (da[i] === ' ' && i >= len - dp - 1) da[i] = '0'; if (db[i] === ' ' && i >= len - dp - 1) db[i] = '0'; }
        const cw = 62;
        const x0 = W / 2 - (len * cw) / 2 + 30;
        const col = (i) => x0 + i * cw + cw / 2;
        const yA = 170;
        const yB = 240;
        const yR = 330;
        const pointX = x0 + (len - dp) * cw;
        const dot = (y) => (dp ? circle(pointX, y - 4, 5, { fill: C.red }) : '');
        let g = S(1, da.map((ch, i) => text(col(i), yA, ch, { size: 54 })).join('') + dot(yA) + db.map((ch, i) => text(col(i), yB, ch, { size: 54 })).join('') + dot(yB) + text(x0 - 30, yB, sub ? '−' : '+', { size: 50 }) + line(x0 - 60, yB + 22, x0 + len * cw + 10, yB + 22, { width: 4 }));
        const steps = [`${numText(a)} ${sub ? '−' : '+'} ${numText(b)}를 세로로 써요. ${dp ? '소수점끼리 맞추고 ' : ''}같은 자리끼리 줄을 맞춰요.`];
        const place = (i) => { const p = len - 1 - i - dp; return p >= 0 ? ['일', '십', '백', '천', '만'][p] : ['소수 첫째', '소수 둘째', '소수 셋째'][-p - 1]; };
        let carry = 0;
        let k = 2;
        const top = da.map((ch) => (ch === ' ' ? 0 : Number(ch)));
        const bot = db.map((ch) => (ch === ' ' ? 0 : Number(ch)));
        // 뺄셈: 자리마다 빌려주는지(lend)·빌려오는지(borrow)를 먼저 알아 둬요.
        const lend = new Array(len).fill(0);
        const borrow = new Array(len).fill(0);
        if (sub) { let c = 0; for (let i = len - 1; i >= 0; i -= 1) { lend[i] = c; const t = top[i] - c; borrow[i] = t < bot[i] ? 1 : 0; c = borrow[i]; } }
        const slash = (i) => line(col(i) - 16, yA - 34, col(i) + 16, yA - 6, { stroke: C.red, width: 3 });
        const mark = (i, v) => text(col(i), yA - 50, v, { size: 22, fill: C.red });
        for (let i = len - 1; i >= 0; i -= 1) {
            let note = '';
            let line1 = '';
            if (!sub) {
                const sum = top[i] + bot[i] + carry;
                const out = sum % 10;
                const c2 = Math.floor(sum / 10);
                line1 = `${place(i)}의 자리: ${top[i]} + ${bot[i]}${carry ? ` + ${carry}` : ''} = ${sum}${c2 ? ` → ${out}을 쓰고 ${c2}을 윗자리로 올려요.` : ''}`;
                if (c2 && i > 0) note = text(col(i - 1) + 16, yA - 52, c2, { size: 24, fill: C.red });
                carry = c2;
            } else {
                const t = top[i] - lend[i] + (borrow[i] ? 10 : 0);
                line1 = `${place(i)}의 자리: ${lend[i] ? '아랫자리에 1을 빌려줬어요. ' : ''}${borrow[i] ? `${bot[i]}를 뺄 수 없어 윗자리에서 10을 빌려와요. ${t} − ${bot[i]} = ${t - bot[i]}` : `${t} − ${bot[i]} = ${t - bot[i]}`}`;
                if (borrow[i]) {
                    // 이 자리 위에는 빌려온 뒤의 수(10 또는 10+남은 수), 윗자리는 지우고 1 작은 수를 써요.
                    note = mark(i, lend[i] ? top[i] - 1 + 10 : 10) + (lend[i] ? '' : '');
                    if (i > 0) note += slash(i - 1) + (borrow[i - 1] ? '' : mark(i - 1, top[i - 1] - 1));
                }
            }
            if (dr[i] === ' ' && !note) continue;
            g += S(k, note + text(col(i), yR, dr[i], { size: 54, fill: C.blue }) + (dp && i === len - dp ? dot(yR) : ''), 'drop');
            steps.push(line1);
            k += 1;
        }
        g += S(k, big(W / 2, 420, `${numText(a)} ${sub ? '−' : '+'} ${numText(b)} = ${numText(R / m)}`, '#15803d', 32) + (dp ? dot(yR) : ''));
        steps.push(`답은 ${numText(R / m)}${dp ? '. 소수점을 그대로 내려 찍어요.' : ''}`);
        return { body: g, caption: `같은 자리끼리 ${sub ? '빼요. 뺄 수 없으면 윗자리에서 10을 빌려와요' : '더해요. 10이 넘으면 윗자리로 올려요'}. ${numText(a)} ${sub ? '−' : '+'} ${numText(b)} = ${numText(R / m)}`, steps };
    }

    function drawRuler({ cm }) {
        const u = 40;
        const x0 = (W - 15 * u) / 2;
        const y = 250;
        let ruler = rect(x0 - 16, y, 15 * u + 32, 70, { fill: '#fef9c3', stroke: '#a16207', rx: 6 });
        for (let i = 0; i <= 15; i += 1) ruler += line(x0 + i * u, y, x0 + i * u, y + 26, { width: 2.5 }) + text(x0 + i * u, y + 50, i, { size: 18 });
        for (let i = 0; i < 15; i += 1) ruler += line(x0 + i * u + u / 2, y, x0 + i * u + u / 2, y + 14, { width: 1.2, stroke: '#64748b' });
        let g = S(1, ruler + text(x0 + 15 * u + 10, y + 86, '(cm)', { size: 16, fill: C.sub, anchor: 'end' }));
        g += S(2, rect(x0, y - 50, cm * u, 30, { fill: C.blue, rx: 6 }) + poly([[x0 + cm * u, y - 50], [x0 + cm * u + 22, y - 35], [x0 + cm * u, y - 20]], { fill: '#fde68a' }), 'wipe');
        g += S(3, line(x0, y - 70, x0, y + 30, { stroke: C.red, width: 3, dash: '6 4' }) + text(x0, y - 78, '한쪽 끝을 0에', { size: 18, fill: C.red }));
        g += S(4, line(x0 + cm * u, y - 70, x0 + cm * u, y + 30, { stroke: C.red, width: 3, dash: '6 4' }) + text(x0 + cm * u, y - 78, `다른 끝은 ${cm}`, { size: 18, fill: C.red }));
        g += S(5, big(W / 2, 410, `${cm} cm  (${cm} 센티미터)`, '#1e3a8a', 40));
        return { body: g, caption: `자로 길이를 잴 때: 한쪽 끝을 눈금 0에 맞추고, 다른 끝이 가리키는 눈금을 읽어요. ${cm} cm`, steps: ['자의 큰 눈금 한 칸이 1 cm예요.', '연필의 길이를 재어 봐요.', '연필의 한쪽 끝을 자의 눈금 0에 맞춰요.', `다른 쪽 끝이 가리키는 눈금을 읽어요. ${cm}이에요.`, `연필의 길이는 ${cm} cm예요. "${cm} 센티미터"라고 읽어요.`] };
    }

    function drawMeter({ cm }) {
        const mm = Math.floor(cm / 100);
        const rest = cm % 100;
        const x0 = 60;
        const full = 680;
        const scale = full / (Math.ceil(cm / 100) * 100 || 100);
        let g = S(1, rect(x0, 130, cm * scale, 50, { fill: C.blueL, stroke: C.blue, width: 3 }) + text(x0 + (cm * scale) / 2, 120, `${cm} cm`, { size: 24, fill: C.blue }));
        let cut = '';
        for (let i = 0; i < mm; i += 1) cut += rect(x0 + i * 100 * scale, 220, 100 * scale, 46, { fill: C.orange, stroke: '#fff' }) + text(x0 + (i + 0.5) * 100 * scale, 250, '100 cm = 1 m', { size: Math.min(18, 100 * scale * 0.11), fill: '#fff' });
        g += S(2, cut, 'wipe');
        g += S(3, rest ? rect(x0 + mm * 100 * scale, 220, rest * scale, 46, { fill: C.green, stroke: '#fff' }) + text(x0 + mm * 100 * scale + (rest * scale) / 2, 250, `${rest} cm`, { size: Math.min(18, Math.max(11, rest * scale * 0.3)), fill: '#fff' }) : text(W / 2, 300, '남는 길이가 없어요', { size: 18, fill: C.sub }));
        g += S(4, big(W / 2, 370, `${cm} cm = ${mm} m${rest ? ` ${rest} cm` : ''}`, '#1e3a8a', 44) + text(W / 2, 410, `${mm} 미터${rest ? ` ${rest} 센티미터` : ''}`, { size: 22, fill: C.sub }));
        return { body: g, caption: `100 cm = 1 m.  ${cm} cm = ${mm * 100} cm + ${rest} cm = ${mm} m${rest ? ` ${rest} cm` : ''}`, steps: [`길이가 ${cm} cm예요.`, `100 cm는 1 m와 같아요. 100 cm씩 묶으면 ${mm}묶음, ${mm} m예요.`, rest ? `남은 길이는 ${rest} cm예요.` : '남는 길이 없이 딱 맞아요.', `그래서 ${cm} cm = ${mm} m${rest ? ` ${rest} cm` : ''}`] };
    }

    /** 자료 정리 그래프: kind = classify | circle | picto | bar | line */
    function drawChart({ items, kind, title }) {
        const { items: rows, total } = parseGraphItems(items);
        let g = S(1, text(W / 2, 90, title || '조사한 자료', { size: 22 }));
        if (!rows.length) return { body: g + S(1, text(W / 2, 250, '항목을 "이름:수" 로 적어 주세요 (예: 사과:4, 포도:6)', { size: 20, fill: C.sub })), caption: '항목이 없어요', steps: ['항목을 "이름:수"로 적어 주세요.'] };
        const maxV = Math.max(...rows.map((r) => Math.round(r.value)));
        const vals = rows.map((r) => Math.round(r.value));
        // 표
        const tw = Math.min(110, 560 / (rows.length + 1));
        const tx = (W - tw * (rows.length + 2)) / 2;
        let table = rect(tx, 104, tw, 34, { fill: '#eff6ff', stroke: '#93c5fd' }) + text(tx + tw / 2, 127, '종류', { size: 15 }) + rect(tx, 138, tw, 34, { fill: '#eff6ff', stroke: '#93c5fd' }) + text(tx + tw / 2, 161, '수', { size: 15 });
        rows.forEach((r, i) => { table += rect(tx + (i + 1) * tw, 104, tw, 34, { stroke: '#93c5fd' }) + text(tx + (i + 1.5) * tw, 127, r.label, { size: 15 }) + rect(tx + (i + 1) * tw, 138, tw, 34, { stroke: '#93c5fd' }) + text(tx + (i + 1.5) * tw, 162, vals[i], { size: 18, fill: PALETTE[i] }); });
        table += rect(tx + (rows.length + 1) * tw, 104, tw, 34, { fill: '#fef9c3', stroke: '#93c5fd' }) + text(tx + (rows.length + 1.5) * tw, 127, '합계', { size: 15 }) + rect(tx + (rows.length + 1) * tw, 138, tw, 34, { fill: '#fef9c3', stroke: '#93c5fd' }) + text(tx + (rows.length + 1.5) * tw, 162, vals.reduce((s, x) => s + x, 0), { size: 18 });
        g += S(1, table);
        const steps = [`조사한 것을 표로 정리했어요. 모두 ${numText(total)}이에요.`];
        const gx = 110;
        const gy = 404;
        const gh = 176;
        const colW = Math.min(110, 600 / rows.length);
        const cx = (i) => gx + 30 + i * colW + colW / 2;
        if (kind === 'picto') {
            const bigN = maxV >= 10 ? 10 : 5;
            g += S(2, text(W - 60, 196, `◉ = ${bigN}   ● = 1`, { size: 17, fill: C.sub, anchor: 'end' }));
            steps.push(`큰 그림 하나는 ${bigN}, 작은 그림 하나는 1을 나타내요.`);
            rows.forEach((r, i) => {
                const y = 226 + i * Math.min(44, 190 / rows.length);
                let pic = text(150, y + 8, r.label, { size: 18, anchor: 'end' });
                const bigs = Math.floor(vals[i] / bigN);
                const smalls = vals[i] % bigN;
                for (let b = 0; b < bigs; b += 1) pic += circle(180 + b * 40, y, 16, { fill: PALETTE[i] }) + circle(180 + b * 40, y, 6, { fill: '#fff' });
                for (let s = 0; s < smalls; s += 1) pic += circle(180 + bigs * 40 + s * 22 - 6, y + 4, 8, { fill: PALETTE[i] });
                g += S(3 + i, pic, 'wipe');
                steps.push(`${r.label} ${vals[i]}: 큰 그림 ${bigs}개${smalls ? `, 작은 그림 ${smalls}개` : ''}로 나타내요.`);
            });
            return { body: g, caption: `그림그래프: 조사한 수를 그림의 크기와 개수로 나타낸 그래프. 큰 그림 ${bigN}, 작은 그림 1`, steps };
        }
        const stepV = kind === 'circle' ? 1 : maxV <= 10 ? 1 : maxV <= 20 ? 2 : maxV <= 50 ? 5 : 10;
        const topV = Math.max(stepV, Math.ceil(maxV / stepV) * stepV);
        const yOf = (v) => gy - (v / topV) * gh;
        let axis = line(gx + 30, gy, gx + 30 + rows.length * colW, gy, { width: 2.5 }) + line(gx + 30, gy, gx + 30, gy - gh - 10, { width: 2.5 });
        for (let v = 0; v <= topV; v += stepV) axis += line(gx + 30, yOf(v), gx + 30 + rows.length * colW, yOf(v), { width: 1, stroke: '#cbd5e1' }) + text(gx + 20, yOf(v) + 5, v, { size: 13, fill: C.sub, anchor: 'end' });
        rows.forEach((r, i) => { axis += text(cx(i), gy + 22, r.label, { size: 16 }); });
        g += S(2, axis);
        steps.push(kind === 'line' ? '가로에는 종류(또는 때), 세로에는 수를 나타내는 눈금을 그려요.' : `가로에는 종류, 세로에는 수를 써요. 세로 눈금 한 칸은 ${stepV}이에요.`);
        if (kind === 'line') {
            let pts = '';
            rows.forEach((r, i) => { pts += circle(cx(i), yOf(vals[i]), 7, { fill: C.red }); });
            g += S(3, pts);
            steps.push('수에 맞는 자리에 점을 찍어요.');
            let segs = '';
            for (let i = 1; i < rows.length; i += 1) segs += line(cx(i - 1), yOf(vals[i - 1]), cx(i), yOf(vals[i]), { stroke: C.red, width: 3.5 });
            g += S(4, segs, 'wipe');
            steps.push('점들을 차례로 선분으로 이어요.');
            let biggest = 0;
            for (let i = 2; i < rows.length; i += 1) if (Math.abs(vals[i] - vals[i - 1]) > Math.abs(vals[biggest + 1] - vals[biggest])) biggest = i - 1;
            const up = rows.length > 1 ? vals[biggest + 1] - vals[biggest] : 0;
            g += S(5, rows.length > 1 ? text(W / 2, 200, `선이 가장 많이 기울어진 곳: ${rows[biggest].label} → ${rows[biggest + 1].label} (${up >= 0 ? '+' : ''}${up})`, { size: 17, fill: '#b45309' }) : '');
            steps.push(rows.length > 1 ? `선이 많이 기울수록 변화가 커요. ${rows[biggest].label}에서 ${rows[biggest + 1].label} 사이에 가장 많이 ${up >= 0 ? '늘었어요' : '줄었어요'}.` : '자료가 하나뿐이에요.');
            return { body: g, caption: '꺾은선그래프: 수량을 점으로 찍고 선분으로 이어 변화하는 모양을 알아보기 쉽게 나타낸 그래프', steps };
        }
        rows.forEach((r, i) => {
            let col = '';
            if (kind === 'circle') { for (let v = 1; v <= vals[i]; v += 1) col += circle(cx(i), yOf(v - 0.5), Math.min(11, (gh / topV) * 0.38), { fill: '#fff', stroke: PALETTE[i], width: 3 }); } else col = rect(cx(i) - colW * 0.3, yOf(vals[i]), colW * 0.6, gy - yOf(vals[i]), { fill: PALETTE[i], stroke: '#1e293b', width: 1.5 });
            g += S(3 + i, col, 'rise');
            steps.push(kind === 'circle' ? `${r.label}는 ${vals[i]}이니까 아래에서부터 ○를 ${vals[i]}개 그려요.` : `${r.label}는 ${vals[i]}이니까 눈금 ${vals[i]}까지 막대를 그려요.`);
        });
        const mostI = vals.indexOf(Math.max(...vals));
        g += S(3 + rows.length, text(W / 2, 200, `가장 많은 것: ${rows[mostI].label} (${vals[mostI]})`, { size: 18, fill: '#b45309' }));
        steps.push(`한눈에 비교할 수 있어요. 가장 많은 것은 ${rows[mostI].label}이에요.`);
        return { body: g, caption: kind === 'circle' ? '그래프: 종류별 수를 ○로 나타내면 어느 것이 많은지 한눈에 볼 수 있어요.' : '막대그래프: 조사한 수를 막대의 길이로 나타낸 그래프. 막대가 길수록 수가 커요.', steps };
    }

    function drawClassify({ items }) {
        const { items: rows } = parseGraphItems(items);
        if (!rows.length) return { body: S(1, text(W / 2, 250, '항목을 "이름:수" 로 적어 주세요 (예: 빨강:3, 파랑:5)', { size: 20, fill: C.sub })), caption: '항목이 없어요', steps: ['항목을 "이름:수"로 적어 주세요.'] };
        const vals = rows.map((r) => Math.min(12, Math.round(r.value)));
        // 섞여 있는 모습(정해진 순서로 흩어 놓아요)
        const all = [];
        vals.forEach((v, i) => { for (let k = 0; k < v; k += 1) all.push(i); });
        let mixed = '';
        const stride = [7, 11, 13, 5, 3, 1].find((k) => gcd(k, all.length) === 1);
        all.forEach((t, idx) => { const j = (idx * stride + 3) % all.length; const col = j % 12; const row = Math.floor(j / 12); mixed += circle(110 + col * 52, 120 + row * 46, 17, { fill: PALETTE[t] }); });
        let g = S(1, mixed + text(W / 2, 92, '여러 가지가 섞여 있어요', { size: 20, fill: C.sub }));
        const rowsUsed = Math.ceil(all.length / 12);
        const y0 = 130 + rowsUsed * 46 + 24;
        const cw = Math.min(150, 660 / rows.length);
        const x0 = (W - cw * rows.length) / 2;
        const steps = ['여러 가지가 섞여 있어요. 기준을 정해서 나누어 봐요.'];
        rows.forEach((r, i) => {
            let grp = rect(x0 + i * cw + 6, y0, cw - 12, 150, { fill: '#f8fafc', stroke: PALETTE[i], width: 3, rx: 10 }) + text(x0 + i * cw + cw / 2, y0 + 24, r.label, { size: 18, fill: PALETTE[i] });
            for (let k = 0; k < vals[i]; k += 1) grp += circle(x0 + i * cw + 26 + (k % 4) * ((cw - 52) / 3), y0 + 52 + Math.floor(k / 4) * 30, 11, { fill: PALETTE[i] });
            g += S(2 + i, grp, 'drop');
            steps.push(`${r.label}끼리 모으면 ${vals[i]}개예요.`);
        });
        const most = vals.indexOf(Math.max(...vals));
        g += S(2 + rows.length, text(W / 2, y0 + 180, `${rows.map((r, i) => `${r.label} ${vals[i]}`).join(' · ')}  →  가장 많은 것: ${rows[most].label}`, { size: 19, fill: '#b45309' }));
        steps.push(`기준에 따라 나누어 세면 어느 것이 많은지 쉽게 알 수 있어요. 가장 많은 것은 ${rows[most].label}.`);
        return { body: g, caption: `분류하기: 분명한 기준을 정해 나누고 세어요. ${rows.map((r, i) => `${r.label} ${vals[i]}`).join(', ')}`, steps };
    }

    function drawArray({ a, b }) {
        const gap = Math.min(54, 420 / Math.max(a, 1), 250 / Math.max(b, 1));
        const x0 = 90;
        const y0 = 120;
        let g = '';
        const steps = [];
        for (let r = 0; r < b; r += 1) {
            let row = rect(x0 - 10, y0 + r * gap - gap / 2 + 4, a * gap + 8, gap - 8, { fill: '#f8fafc', stroke: C.orange, width: 2, rx: gap / 3 });
            for (let c = 0; c < a; c += 1) row += circle(x0 + c * gap + gap / 2 - 6, y0 + r * gap, gap * 0.3, { fill: C.blue });
            row += text(x0 + a * gap + 30, y0 + r * gap + 8, a * (r + 1), { size: 22, fill: '#c2410c' });
            g += S(1 + r, row, 'wipe');
            steps.push(r === 0 ? `${a}개씩 한 묶음이에요. ${a}` : `${r + 1}묶음이면 ${Array.from({ length: r + 1 }, () => a).join(' + ')} = ${a * (r + 1)}`);
        }
        g += S(b + 1, text(600, 170, `${a}개씩 ${b}묶음`, { size: 26, fill: C.sub }) + text(600, 214, `${a}의 ${b}배`, { size: 26, fill: C.sub }) + big(600, 300, `${a} × ${b} = ${a * b}`, '#1e3a8a', 46) + text(600, 344, `"${a} 곱하기 ${b}는 ${a * b}와 같습니다"`, { size: 17, fill: C.sub }));
        steps.push(`${a}개씩 ${b}묶음은 ${a}의 ${b}배예요. 곱셈식으로 ${a} × ${b} = ${a * b}`);
        return { body: g, caption: `${a}개씩 ${b}묶음 = ${a}의 ${b}배 = ${a} × ${b} = ${a * b}  (${a}를 ${b}번 더한 것과 같아요)`, steps };
    }

    function drawTimesTable({ dan }) {
        const cell = 34;
        const x0 = 70;
        const y0 = 96;
        let grid = '';
        for (let r = 0; r <= 9; r += 1) for (let c = 0; c <= 9; c += 1) {
            const head = r === 0 || c === 0;
            grid += rect(x0 + c * cell, y0 + r * cell, cell, cell, { fill: head ? '#eff6ff' : '#fff', stroke: '#94a3b8', width: 1 }) + text(x0 + c * cell + cell / 2, y0 + r * cell + 23, r === 0 && c === 0 ? '×' : head ? r + c : r * c, { size: head ? 16 : 14, fill: head ? '#1e3a8a' : C.ink });
        }
        let g = S(1, grid);
        g += S(2, rect(x0, y0 + dan * cell, cell * 10, cell, { fill: C.orange, stroke: '#c2410c', width: 3, extra: 'fill-opacity="0.3"' }) + text(600, 150, `${dan}단`, { size: 34, fill: '#c2410c' }), 'wipe');
        let list = '';
        for (let k = 1; k <= 9; k += 1) list += text(470 + ((k - 1) % 3) * 110, 200 + Math.floor((k - 1) / 3) * 34, `${dan}×${k}=${dan * k}`, { size: 19 });
        g += S(3, list);
        g += S(4, text(600, 330, `오른쪽으로 갈수록 ${dan}씩 커져요`, { size: 20, fill: C.red }) + arrow(x0 + cell * 1.5, y0 + dan * cell - 8, x0 + cell * 9.5, y0 + dan * cell - 8));
        g += S(5, rect(x0 + dan * cell, y0, cell, cell * 10, { fill: C.blue, stroke: C.blue, width: 3, extra: 'fill-opacity="0.2"' }) + text(600, 380, `세로 ${dan}의 줄도 똑같아요`, { size: 20, fill: C.blue }) + text(600, 408, `(곱하는 두 수를 바꿔도 곱은 같아요)`, { size: 16, fill: C.sub }));
        return { body: g, caption: `${dan}단 곱셈구구: ${dan}씩 커져요. 두 수를 바꾸어 곱해도 곱은 같아요 (예: ${dan}×3 = 3×${dan} = ${dan * 3}).`, steps: ['곱셈표예요. 가로 수와 세로 수를 곱한 값이 적혀 있어요.', `${dan}단을 찾아 색칠해요.`, `${dan}단 곱셈구구를 읽어 봐요. ${dan}×1=${dan}, ${dan}×2=${dan * 2}, …`, `오른쪽으로 한 칸 갈 때마다 ${dan}씩 커져요.`, `세로 줄의 ${dan}단도 똑같아요. 곱하는 순서를 바꿔도 곱은 같아요.`] };
    }

    /* ================= 3학년 ================= */

    function drawBasicLines() {
        const pt = (x, y, label) => circle(x, y, 6, { fill: C.red }) + text(x, y - 14, label, { size: 20 });
        let g = S(1, line(140, 130, 420, 130, { width: 5, stroke: C.blue }) + pt(140, 130, 'ㄱ') + pt(420, 130, 'ㄴ') + big(600, 138, '선분 ㄱㄴ', '#1d4ed8', 26) + text(600, 166, '두 점을 곧게 이은 선', { size: 16, fill: C.sub }));
        g += S(2, arrow(140, 230, 470, 230, C.orange, 5) + pt(140, 230, 'ㄱ') + pt(360, 230, 'ㄴ') + big(600, 238, '반직선 ㄱㄴ', '#c2410c', 26) + text(600, 266, '한쪽으로 끝없이 늘인 곧은 선', { size: 16, fill: C.sub }));
        g += S(3, arrow(300, 330, 470, 330, C.green, 5) + arrow(300, 330, 90, 330, C.green, 5) + pt(190, 330, 'ㄱ') + pt(360, 330, 'ㄴ') + big(600, 338, '직선 ㄱㄴ', '#15803d', 26) + text(600, 366, '양쪽으로 끝없이 늘인 곧은 선', { size: 16, fill: C.sub }));
        g += S(4, text(W / 2, 420, '선분은 끝이 2개 · 반직선은 끝이 1개 · 직선은 끝이 없어요', { size: 19, fill: '#b45309' }));
        return { body: g, caption: '선분: 두 점을 곧게 이은 선 · 반직선: 한쪽으로 끝없이 · 직선: 양쪽으로 끝없이 늘인 곧은 선', steps: ['두 점을 곧게 이은 선을 선분이라고 해요.', '한 점에서 시작해 한쪽으로 끝없이 늘인 곧은 선은 반직선이에요.', '양쪽으로 끝없이 늘인 곧은 선은 직선이에요.', '끝이 몇 개인지로 구분할 수 있어요.'] };
    }

    /** 직각 표시(꼭짓점 p 에서 두 방향 단위벡터 d1, d2) */
    const rightMark = (p, d1, d2, k = 20) => path(`M ${r2(p[0] + d1[0] * k)} ${r2(p[1] + d1[1] * k)} L ${r2(p[0] + (d1[0] + d2[0]) * k)} ${r2(p[1] + (d1[1] + d2[1]) * k)} L ${r2(p[0] + d2[0] * k)} ${r2(p[1] + d2[1] * k)}`, { stroke: C.red, width: 3 });

    /** 3학년 평면도형: 값(각도·가로·세로)을 바꾸면 도형도 그만큼 바뀌어요. 길이 1 = 30칸(픽셀) */
    function drawRightShapes({ kind, w = 6, h = 4, deg = 45 }) {
        const U3 = 30;
        const x0 = 110;
        const yb = 400;
        let g = '';
        let steps = [];
        let cap = '';
        if (kind === 'angle') {
            const V = [250, 390];
            const L = 210;
            const a = (deg * Math.PI) / 180;
            const tip = [V[0] + L * Math.cos(a), V[1] - L * Math.sin(a)];
            const rel = deg < 90 ? '직각보다 작은 각' : deg === 90 ? '직각' : '직각보다 큰 각';
            g += S(1, arrow(V[0], V[1], V[0] + L, V[1], C.blue, 5) + arrow(V[0], V[1], tip[0], tip[1], C.blue, 5) + circle(V[0], V[1], 8, { fill: C.red }) + text(V[0] - 10, V[1] + 30, '꼭짓점', { size: 19, fill: C.red }) + text(V[0] + L * 0.6, V[1] + 28, '변', { size: 19, fill: C.blue }) + text(V[0] + (L * 0.6) * Math.cos(a) - 22 * Math.sin(a), V[1] - (L * 0.6) * Math.sin(a) - 22 * Math.cos(a) + 6, '변', { size: 19, fill: C.blue }) + big(630, 140, '각', '#1e3a8a', 40));
            g += S(2, text(630, 190, '한 점에서 그은', { size: 19, fill: C.sub }) + text(630, 216, '두 반직선으로 이루어진 도형', { size: 19, fill: C.sub }));
            g += S(3, line(V[0], V[1], V[0], V[1] - L, { stroke: C.orange, width: 3, dash: '8 6' }) + rightMark(V, [1, 0], [0, -1]) + text(V[0] - 12, V[1] - L + 10, '직각', { size: 19, fill: '#c2410c', anchor: 'end' }) + text(630, 270, '직각: 종이를 반듯하게', { size: 18, fill: '#c2410c' }) + text(630, 296, '두 번 접었을 때 생기는 각', { size: 18, fill: '#c2410c' }), 'drop');
            g += S(4, path(`M ${V[0] + 56} ${V[1]} A 56 56 0 0 0 ${r2(V[0] + 56 * Math.cos(a))} ${r2(V[1] - 56 * Math.sin(a))}`, { stroke: C.green, width: 5 }) + big(630, 370, rel, '#15803d', 28));
            steps = ['한 점에서 그은 두 반직선으로 이루어진 도형이 각이에요.', '만나는 점은 꼭짓점, 두 반직선은 변이라고 해요.', '점선은 직각이에요. 종이를 반듯하게 두 번 접으면 생겨요.', deg === 90 ? '두 변이 직각과 꼭 맞아요. 이 각은 직각이에요.' : `두 변이 벌어진 정도를 직각과 비교하면, 이 각은 ${rel}이에요.`];
            cap = `각: 한 점에서 그은 두 반직선으로 이루어진 도형. 변이 벌어진 정도가 클수록 큰 각이에요. 이 각은 ${rel}.`;
        } else if (kind === 'tri') {
            const A = [x0, yb];
            const B = [x0 + w * U3, yb];
            const Cc = [x0, yb - h * U3];
            g += S(1, poly([A, B, Cc], { fill: C.blueL, width: 4 }) + text((A[0] + B[0]) / 2, yb + 26, `${w}`, { size: 20, fill: C.sub }) + text(x0 - 14, (A[1] + Cc[1]) / 2 + 7, `${h}`, { size: 20, fill: C.sub, anchor: 'end' }) + big(640, 180, '직각삼각형', '#1e3a8a', 34));
            g += S(2, rightMark(A, [1, 0], [0, -1]) + text(640, 240, '한 각이 직각', { size: 24, fill: C.red }));
            g += S(3, text(640, 290, '각 3개 중 1개가 직각인', { size: 20, fill: C.sub }) + text(640, 318, '삼각형이에요', { size: 20, fill: C.sub }));
            steps = [`삼각형이에요. 직각을 낀 두 변의 길이가 ${w}와 ${h}예요.`, '한 각이 직각이에요.', '한 각이 직각인 삼각형을 직각삼각형이라고 해요. 변의 길이가 달라져도 직각이 있으면 직각삼각형이에요.'];
            cap = '직각삼각형: 한 각이 직각인 삼각형';
        } else {
            const sq = kind === 'square';
            const ww = w * U3;
            const hh = (sq ? w : h) * U3;
            const y = yb - hh;
            const name = sq ? '정사각형' : '직사각형';
            g += S(1, rect(x0, y, ww, hh, { fill: C.blueL, width: 4 }) + text(x0 + ww / 2, yb + 26, `${w}`, { size: 20, fill: C.sub }) + text(x0 - 14, y + hh / 2 + 7, `${sq ? w : h}`, { size: 20, fill: C.sub, anchor: 'end' }) + big(650, 170, name, '#1e3a8a', 34));
            g += S(2, rightMark([x0, yb], [1, 0], [0, -1], 16) + rightMark([x0 + ww, yb], [-1, 0], [0, -1], 16) + rightMark([x0, y], [1, 0], [0, 1], 16) + rightMark([x0 + ww, y], [-1, 0], [0, 1], 16) + text(650, 230, '네 각이 모두 직각', { size: 22, fill: C.red }));
            g += S(3, sq ? line(x0, y - 12, x0 + ww, y - 12, { stroke: C.orange, width: 5 }) + line(x0 + ww + 12, y, x0 + ww + 12, yb, { stroke: C.orange, width: 5 }) + text(650, 280, '네 변의 길이가 모두 같아요', { size: 20, fill: '#c2410c' }) + text(650, 310, `(한 변 ${w})`, { size: 18, fill: C.sub }) : line(x0, y - 12, x0 + ww, y - 12, { stroke: C.orange, width: 5 }) + line(x0, yb + 6, x0 + ww, yb + 6, { stroke: C.orange, width: 5 }) + text(650, 280, '마주 보는 변의 길이가 같아요', { size: 20, fill: '#c2410c' }) + text(650, 310, `(가로 ${w}, 세로 ${h})`, { size: 18, fill: C.sub }));
            steps = [sq ? `한 변의 길이가 ${w}인 사각형이에요.` : `가로 ${w}, 세로 ${h}인 사각형이에요.`, '네 각이 모두 직각이에요.', sq ? '네 변의 길이도 모두 같아요. 이런 사각형이 정사각형이에요.' : '네 각이 모두 직각인 사각형이 직사각형이에요. 마주 보는 변의 길이가 같아요.'];
            cap = sq ? '정사각형: 네 각이 모두 직각이고 네 변의 길이가 모두 같은 사각형' : '직사각형: 네 각이 모두 직각인 사각형';
        }
        return { body: g, caption: cap, steps };
    }

    function drawShareDiv({ a, b }) {
        const q = Math.floor(a / b);
        const r = a % b;
        const pw = Math.min(150, 680 / b);
        const x0 = (W - pw * b) / 2;
        let g = S(1, dotRow(a, (W - (a - 1) * Math.min(30, 640 / a)) / 2, 110, Math.min(12, 300 / a), Math.min(30, 640 / a), C.blue) + text(W / 2, 86, `${a}개를 ${b}명(접시)에게 똑같이 나누어요`, { size: 19, fill: C.sub }));
        let plates = '';
        for (let i = 0; i < b; i += 1) plates += `<ellipse cx="${r2(x0 + i * pw + pw / 2)}" cy="270" rx="${r2(pw / 2 - 8)}" ry="70" fill="#fef9c3" stroke="#a16207" stroke-width="2.5"/>`;
        g += S(2, plates);
        const steps = [`${a}개가 있어요.`, `${b}개의 접시에 똑같이 나누어 담을 거예요.`];
        const per = Math.min(4, Math.ceil(Math.sqrt(Math.max(1, q))));
        for (let k = 0; k < q; k += 1) {
            let round = '';
            for (let i = 0; i < b; i += 1) round += circle(x0 + i * pw + pw / 2 - ((per - 1) * 22) / 2 + (k % per) * 22, 240 + Math.floor(k / per) * 22, 9, { fill: C.blue });
            if (q <= 6) { g += S(3 + k, round, 'drop'); steps.push(`한 접시에 하나씩 놓아요. 접시마다 ${k + 1}개씩.`); } else g += S(3, round, 'drop');
        }
        if (q > 6) steps.push(`하나씩 번갈아 놓으면 접시마다 ${q}개씩 담겨요.`);
        if (q === 0) { g += S(3, ''); steps.push('한 접시에 하나씩 놓기에도 모자라요.'); }
        const end = 3 + (q <= 6 ? Math.max(1, q) : 1);
        let rem = '';
        for (let i = 0; i < r; i += 1) rem += circle(W / 2 - ((r - 1) * 26) / 2 + i * 26, 366, 10, { fill: C.orange });
        g += S(end, (r ? rem + text(W / 2, 400, `남은 것 ${r}개`, { size: 18, fill: '#c2410c' }) : '') + big(W / 2, r ? 440 : 410, r ? `${a} ÷ ${b} = ${q} … ${r}` : `${a} ÷ ${b} = ${q}`, '#1e3a8a', r ? 30 : 44));
        steps.push(r ? `한 접시에 ${q}개씩 담고 ${r}개가 남아요. ${a} ÷ ${b} = ${q} … ${r} (몫 ${q}, 나머지 ${r})` : `한 접시에 ${q}개씩이에요. ${a} ÷ ${b} = ${q}. 곱셈으로 확인하면 ${b} × ${q} = ${a}`);
        return { body: g, caption: r ? `${a} ÷ ${b} = ${q} … ${r}  (몫 ${q}, 나머지 ${r}).  확인: ${b} × ${q} + ${r} = ${a}` : `${josa(a, '을', '를')} ${roJosa(b)} 똑같이 나누면 ${q}.  ${a} ÷ ${b} = ${q}  ↔  ${b} × ${q} = ${a}`, steps };
    }

    function drawAreaMul({ a, b }) {
        const split = (v) => [Math.floor(v / 100) * 100, Math.floor((v % 100) / 10) * 10, v % 10].filter((x) => x > 0);
        const cols = split(a);
        const rowsV = split(b);
        const x0 = 110;
        const y0 = 130;
        const Wt = 380;
        const Ht = 230;
        const weight = (v) => (v >= 100 ? 5 : v >= 10 ? 3.2 : 1.8);
        const cSum = cols.reduce((t, v) => t + weight(v), 0);
        const rSum = rowsV.reduce((t, v) => t + weight(v), 0);
        const wOf = (v) => (Wt * weight(v)) / cSum;
        const hOf = (v) => (Ht * weight(v)) / rSum;
        let g = S(1, rect(x0, y0, Wt, Ht, { fill: '#f8fafc', width: 3 }) + text(x0 + Wt / 2, y0 - 34, `${a}`, { size: 26, fill: C.blue }) + text(x0 - 46, y0 + Ht / 2 + 8, `${b}`, { size: 26, fill: '#c2410c', anchor: 'end' }));
        let splitG = '';
        let cx = x0;
        cols.forEach((v) => { if (cols.length > 1) splitG += text(cx + wOf(v) / 2, y0 - 8, v, { size: 18, fill: C.blue }); cx += wOf(v); if (cx < x0 + Wt - 1) splitG += line(cx, y0, cx, y0 + Ht, { width: 2.5, stroke: C.red }); });
        let cy = y0;
        rowsV.forEach((v) => { if (rowsV.length > 1) splitG += text(x0 - 8, cy + hOf(v) / 2 + 7, v, { size: 18, fill: '#c2410c', anchor: 'end' }); cy += hOf(v); if (cy < y0 + Ht - 1) splitG += line(x0, cy, x0 + Wt, cy, { width: 2.5, stroke: C.red }); });
        g += S(2, splitG || line(x0, y0, x0, y0, { width: 0 }), 'wipe');
        const says = [];
        if (cols.length > 1) says.push(`${josa(a, '을', '를')} ${cols.join(', ')}(으)로`);
        if (rowsV.length > 1) says.push(`${josa(b, '을', '를')} ${rowsV.join(', ')}(으)로`);
        const steps = [`${a} × ${josa(b, '을', '를')} 가로 ${a}, 세로 ${b}인 직사각형의 넓이로 생각해요.`, says.length ? `${says.join(', ')} 갈라요.` : '가르지 않고 바로 곱할 수 있어요.'];
        const parts = [];
        let k = 3;
        cy = y0;
        const fills = [C.blueL, C.greenL, C.orangeL, '#fef08a', '#fbcfe8', '#ddd6fe'];
        rowsV.forEach((rv, ri) => {
            cx = x0;
            cols.forEach((cv, ci) => {
                const w = wOf(cv);
                const h = hOf(rv);
                g += S(k, rect(cx, cy, w, h, { fill: fills[(ri * cols.length + ci) % 6], stroke: C.line, width: 1.5 }) + text(cx + w / 2, cy + h / 2 - 2, `${cv}×${rv}`, { size: Math.min(17, w * 0.17), fill: C.sub }) + text(cx + w / 2, cy + h / 2 + 20, cv * rv, { size: Math.min(22, w * 0.2) }));
                steps.push(`${cv} × ${rv} = ${cv * rv}`);
                parts.push(cv * rv);
                k += 1;
                cx += w;
            });
            cy += hOf(rv);
        });
        const sumText = parts.join(' + ');
        g += S(k, text(645, 220, sumText, { size: Math.min(26, 290 / (sumText.length * 0.56)) }) + big(645, 290, `= ${a * b}`, '#1e3a8a', 44) + text(645, 340, `${a} × ${b} = ${a * b}`, { size: 24, fill: '#15803d' }));
        steps.push(`조각의 넓이를 모두 더하면 ${sumText} = ${a * b}`);
        return { body: g, caption: `수를 자리별로 갈라 곱한 뒤 더해요. ${a} × ${b} = ${sumText} = ${a * b}`, steps };
    }

    function drawLongDivInt({ a, b }) {
        const { g, ld, narr } = drawLongDivision(String(a), b, 300, 190, { base: 1, maxExtra: 0, cw: 46 });
        const q = Math.floor(a / b);
        const r = a % b;
        const body = g + S(narr.length + 1, text(620, 200, `몫 ${q}${r ? ` · 나머지 ${r}` : ''}`, { size: 26, fill: '#15803d' }) + text(620, 250, '확인', { size: 18, fill: C.sub }) + text(620, 282, `${b} × ${q}${r ? ` + ${r}` : ''} = ${a}`, { size: 24 }));
        narr[narr.length - 1] = `몫은 ${ld.quotient}${r ? `, 나머지는 ${r}` : ''}. 확인: ${b} × ${q}${r ? ` + ${r}` : ''} = ${a}`;
        return { body, caption: `${a} ÷ ${b} = ${q}${r ? ` … ${r}` : ''}  (높은 자리부터 차례로 나눠요. 나머지는 나누는 수보다 작아야 해요.)`, steps: [`${a} ÷ ${b}를 세로로 써요. 높은 자리부터 나눠요.`, ...narr] };
    }

    function drawTimeUnits({ sec }) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const cx = 220;
        const cy = 270;
        const R = 130;
        let face = circle(cx, cy, R, { fill: '#fff', stroke: C.line, width: 5 });
        for (let i = 0; i < 60; i += 1) { const a = (i / 60) * 2 * Math.PI; face += line(cx + (R - (i % 5 ? 6 : 13)) * Math.sin(a), cy - (R - (i % 5 ? 6 : 13)) * Math.cos(a), cx + R * Math.sin(a), cy - R * Math.cos(a), { width: i % 5 ? 1 : 2.5, stroke: '#64748b' }); }
        for (let i = 1; i <= 12; i += 1) { const a = (i / 12) * 2 * Math.PI - Math.PI / 2; face += text(cx + (R - 30) * Math.cos(a), cy + (R - 30) * Math.sin(a) + 7, i, { size: 19 }); }
        let g = S(1, face + circle(cx, cy, 6, { fill: C.ink }));
        const sa = (s / 60) * 2 * Math.PI;
        g += S(2, line(cx, cy, cx + 112 * Math.sin(sa), cy - 112 * Math.cos(sa), { stroke: C.red, width: 3 }) + text(560, 150, '초바늘이 작은 눈금 한 칸 = 1초', { size: 21, fill: C.red }));
        g += S(3, text(560, 200, '초바늘이 한 바퀴 = 60초 = 1분', { size: 21, fill: C.blue }));
        g += S(4, text(560, 270, `${sec}초 = ${m * 60}초 + ${s}초`, { size: 24 }));
        g += S(5, big(560, 340, `${sec}초 = ${m}분 ${s}초`, '#1e3a8a', 38));
        return { body: g, caption: `1분 = 60초.  ${sec}초 = ${m}분 ${s}초  (60초씩 ${m}번 묶고 ${s}초가 남아요)`, steps: ['시계의 가장 가늘고 빠른 바늘이 초바늘이에요.', '초바늘이 작은 눈금 한 칸을 가는 시간이 1초예요.', '초바늘이 한 바퀴 돌면 60초, 이것이 1분이에요.', `${sec}초에는 60초가 ${m}번 들어 있고 ${s}초가 남아요.`, `그래서 ${sec}초 = ${m}분 ${s}초`] };
    }

    function drawMmKm({ mm }) {
        const cmP = Math.floor(mm / 10);
        const r = mm % 10;
        const u = 10;
        const scale = Math.min(6, 640 / Math.max(mm, 50));
        const x0 = 80;
        const y = 240;
        const len = Math.max(Math.ceil(mm / 10) * 10, 50);
        let ruler = rect(x0 - 10, y, len * scale + 20, 64, { fill: '#fef9c3', stroke: '#a16207', rx: 6 });
        for (let i = 0; i <= len; i += 1) ruler += line(x0 + i * scale, y, x0 + i * scale, y + (i % u === 0 ? 26 : i % 5 === 0 ? 18 : 10), { width: i % u === 0 ? 2 : 1, stroke: '#475569' }) + (i % u === 0 ? text(x0 + i * scale, y + 48, i / u, { size: 15 }) : '');
        let g = S(1, ruler + text(x0 + len * scale + 10, y + 82, '(cm)', { size: 14, fill: C.sub, anchor: 'end' }));
        g += S(2, text(W / 2, 110, '1 cm를 10칸으로 똑같이 나눈 작은 눈금 한 칸 = 1 mm', { size: 20, fill: C.red }));
        g += S(3, rect(x0, y - 44, mm * scale, 26, { fill: C.blue, rx: 5 }), 'wipe');
        g += S(4, text(x0 + (cmP * 10 * scale) / 2, y - 56, `${cmP} cm`, { size: 20, fill: C.blue }) + (r ? text(x0 + cmP * 10 * scale + (r * scale) / 2 + 20, y - 56, `${r} mm`, { size: 20, fill: '#c2410c' }) : ''));
        g += S(5, big(W / 2, 400, `${cmP} cm ${r} mm = ${mm} mm`, '#1e3a8a', 40));
        return { body: g, caption: `1 cm = 10 mm.  ${cmP} cm ${r} mm = ${cmP * 10} mm + ${r} mm = ${mm} mm  (1 km = 1000 m)`, steps: ['자에는 큰 눈금 사이에 작은 눈금이 있어요.', '1 cm를 10칸으로 똑같이 나눈 작은 눈금 한 칸의 길이가 1 mm예요.', '막대의 길이를 재어 봐요.', `큰 눈금으로 ${cmP} cm, 작은 눈금으로 ${r}칸 더 갔어요.`, `${cmP} cm ${r} mm는 ${mm} mm와 같아요.`] };
    }

    /** 분수 막대: n/d */
    function fracBar(x, y, w, h, n, d, fill) {
        let s = '';
        for (let i = 0; i < d; i += 1) s += rect(x + (i * w) / d, y, w / d, h, { fill: i < n ? fill : '#f8fafc', stroke: C.line, width: 1.5 });
        return s + rect(x, y, w, h, { width: 3 });
    }
    function fracPie(cx, cy, R, n, d, fill) {
        let s = circle(cx, cy, R, { fill: '#f8fafc', stroke: C.line, width: 3 });
        for (let i = 0; i < d; i += 1) {
            const a0 = (i / d) * 2 * Math.PI - Math.PI / 2;
            const a1 = ((i + 1) / d) * 2 * Math.PI - Math.PI / 2;
            if (i < n) s += d === 1 ? circle(cx, cy, R, { fill, stroke: C.line, width: 2 }) : path(`M ${cx} ${cy} L ${r2(cx + R * Math.cos(a0))} ${r2(cy + R * Math.sin(a0))} A ${R} ${R} 0 0 1 ${r2(cx + R * Math.cos(a1))} ${r2(cy + R * Math.sin(a1))} Z`, { fill, stroke: C.line, width: 1.5 });
            else if (d > 1) s += line(cx, cy, cx + R * Math.cos(a0), cy + R * Math.sin(a0), { width: 1.5 });
        }
        return s;
    }

    function drawFraction({ n, d }) {
        let g = S(1, circle(210, 250, 120, { fill: '#f8fafc', stroke: C.line, width: 3 }) + rect(420, 200, 300, 70, { fill: '#f8fafc', width: 3 }) + text(W / 2, 92, '전체 1', { size: 20, fill: C.sub }));
        let cut = '';
        for (let i = 0; i < d; i += 1) { const a = (i / d) * 2 * Math.PI - Math.PI / 2; cut += line(210, 250, 210 + 120 * Math.cos(a), 250 + 120 * Math.sin(a), { width: 2 }); if (i) cut += line(420 + (i * 300) / d, 200, 420 + (i * 300) / d, 270, { width: 2 }); }
        g += S(2, cut + text(570, 180, `똑같이 ${d}로 나눠요`, { size: 20, fill: C.sub }));
        g += S(3, fracPie(210, 250, 120, n, d, C.orange) + fracBar(420, 200, 300, 70, n, d, C.orange) + text(570, 300, `${d}칸 중 ${n}칸`, { size: 20, fill: '#c2410c' }));
        g += S(4, frac(520, 370, n, d, { size: 34, fill: '#1e3a8a' }) + text(570, 358, '← 분자', { size: 18, fill: C.sub, anchor: 'start' }) + text(570, 402, '← 분모', { size: 18, fill: C.sub, anchor: 'start' }) + text(210, 420, `"${d}분의 ${n}"`, { size: 26, fill: '#1e3a8a' }));
        return { body: g, caption: `전체를 똑같이 ${d}로 나눈 것 중의 ${n} → ${n}/${d} (${d}분의 ${n}). 아래 수가 분모, 위 수가 분자예요.`, steps: ['전체 1이 있어요.', `전체를 똑같이 ${d}칸으로 나눠요.`, `그중 ${n}칸을 색칠해요.`, `전체를 똑같이 ${d}로 나눈 것 중의 ${n}을 ${n}/${d}이라 쓰고 "${d}분의 ${n}"이라고 읽어요.`] };
    }

    function drawTenths({ n }) {
        const x0 = 90;
        const w = 620;
        let g = S(1, fracBar(x0, 150, w, 70, 0, 10, C.blue) + text(x0, 136, '0', { size: 18 }) + text(x0 + w, 136, '1', { size: 18 }));
        g += S(2, rect(x0, 150, w / 10, 70, { fill: C.blue, stroke: C.line }) + frac(x0 + w / 20, 262, 1, 10, { size: 18 }) + text(x0 + w / 20 + 60, 270, '= 0.1 (영 점 일)', { size: 20, fill: C.blue, anchor: 'start' }));
        g += S(3, fracBar(x0, 150, w, 70, n, 10, C.blue), 'wipe');
        g += S(4, big(W / 2, 370, `0.1이 ${n}개 = 0.${n}`, '#1e3a8a', 40) + text(W / 2, 410, `${n}/10 = 0.${n}  (영 점 ${SINO[n]})`, { size: 24, fill: C.sub }));
        return { body: g, caption: `1/10 = 0.1.  0.1이 ${n}개이면 0.${n} (${n}/10). 0.1, 0.2 같은 수를 소수라고 해요.`, steps: ['전체 1을 똑같이 10칸으로 나눴어요.', '그중 한 칸은 1/10이에요. 이것을 0.1이라 쓰고 "영 점 일"이라고 읽어요.', `${n}칸을 색칠했어요.`, `0.1이 ${n}개니까 0.${n}이에요.`] };
    }

    function drawCircleParts({ r }) {
        const cx = 240;
        const cy = 270;
        const R = 15 * r; // 반지름 1 = 15칸(픽셀)
        let g = S(1, circle(cx, cy, R, { fill: C.blueL, stroke: C.blue, width: 4 }));
        g += S(2, circle(cx, cy, 6, { fill: C.red }) + text(cx + 8, cy + 48, '원의 중심', { size: 16, fill: C.red, anchor: 'start' }) + line(cx + 4, cy + 6, cx + 20, cy + 34, { stroke: C.red, width: 1.5 }) + text(600, 150, '원의 중심: 원의 가장 안쪽에 있는 점', { size: 17, fill: C.sub }));
        g += S(3, line(cx, cy, cx + R * 0.8, cy - R * 0.6, { stroke: C.purple, width: 4 }) + text(cx + R * 0.8 + 10, cy - R * 0.6 - 6, `반지름 ${r}`, { size: 18, fill: C.purple, anchor: 'start' }) + text(600, 200, '반지름: 중심과 원 위의 한 점을 이은 선분', { size: 17, fill: C.sub }), 'wipe');
        g += S(4, line(cx, cy, cx - R * 0.6, cy - R * 0.8, { stroke: C.purple, width: 2, dash: '6 5' }) + line(cx, cy, cx - R * 0.95, cy + R * 0.3, { stroke: C.purple, width: 2, dash: '6 5' }) + text(600, 236, '한 원에서 반지름은 모두 같아요', { size: 17, fill: C.purple }));
        g += S(5, line(cx - R, cy, cx + R, cy, { stroke: '#15803d', width: 4 }) + text(cx - R * 0.45, cy + 24, `지름 ${r * 2}`, { size: 18, fill: '#15803d' }) + text(600, 290, '지름: 중심을 지나도록 원 위의 두 점을 이은 선분', { size: 16, fill: C.sub }), 'wipe');
        g += S(6, big(600, 370, `지름 = 반지름 × 2 = ${r * 2}`, '#1e3a8a', 28));
        return { body: g, caption: `한 원에서 반지름은 모두 같고, 지름은 반지름의 2배예요. 반지름 ${r} → 지름 ${r * 2}`, steps: ['원이에요.', '원의 가장 안쪽 한가운데 점이 원의 중심이에요.', `원의 중심과 원 위의 한 점을 이은 선분이 반지름이에요. 이 원의 반지름은 ${r}`, '반지름은 어디로 그어도 길이가 같아요.', '원의 중심을 지나며 원 위의 두 점을 이은 선분이 지름이에요.', `지름은 반지름의 2배. ${r} × 2 = ${r * 2}`] };
    }

    function drawMixed({ n, d }) {
        const whole = Math.floor(n / d);
        const rest = n % d;
        const pies = Math.ceil(n / d);
        const R = Math.min(70, 300 / pies);
        const gap = R * 2 + 20;
        const x0 = (W - pies * gap) / 2 + gap / 2;
        let g = '';
        for (let i = 0; i < pies; i += 1) g += S(1, fracPie(x0 + i * gap, 190, R, Math.min(d, n - i * d), d, C.orange));
        g += S(1, frac(W / 2, 336, n, d, { size: 28, fill: '#c2410c' }) + text(W / 2 + 60, 346, `(1/${d}이 ${n}개)`, { size: 18, fill: C.sub, anchor: 'start' }));
        let rings = '';
        for (let i = 0; i < whole; i += 1) rings += circle(x0 + i * gap, 190, R + 8, { fill: 'none', stroke: C.blue, width: 4, extra: 'stroke-dasharray="8 5"' }) + text(x0 + i * gap, 190 - R - 16, '1', { size: 22, fill: C.blue });
        g += S(2, rings + text(W / 2, 190 + R + 34, `${d}/${d} = 1 이 ${whole}개`, { size: 19, fill: C.blue }));
        g += S(3, rest ? text(x0 + whole * gap, 190 - R - 16, `${rest}/${d}`, { size: 20, fill: '#c2410c' }) : text(W / 2, 380, '남는 조각이 없어요', { size: 18, fill: C.sub }));
        g += S(4, rest ? `${frac(W / 2 - 110, 414, n, d, { size: 30 })}${text(W / 2 - 50, 424, '=', { size: 34 })}${frac(W / 2 + 30, 414, rest, d, { size: 30, fill: '#1e3a8a', whole })}` : `${frac(W / 2 - 60, 410, n, d, { size: 30 })}${text(W / 2, 420, '=', { size: 34 })}${big(W / 2 + 50, 422, String(whole), '#1e3a8a', 40)}`);
        return { body: g, caption: rest ? `가분수 ${n}/${d} = 자연수 ${whole}와 진분수 ${rest}/${d} → 대분수 ${whole}과 ${rest}/${d}` : `${n}/${d} = ${whole} (분자가 분모의 ${whole}배)`, steps: [`1/${d}이 ${n}개 있어요. ${n}/${d}처럼 분자가 분모와 같거나 큰 분수가 가분수예요.`, `${d}조각이 모이면 1이에요. 1이 ${whole}개 만들어져요.`, rest ? `남은 조각은 ${rest}/${d}이에요.` : '남는 조각이 없어요.', rest ? `그래서 ${n}/${d} = ${whole}과 ${rest}/${d}. 자연수와 진분수로 된 분수가 대분수예요.` : `그래서 ${n}/${d} = ${whole}`] };
    }

    function drawFracOfSet({ total, n, d }) {
        const per = total / d;
        const gap = Math.min(40, 620 / total);
        const x0 = (W - (total - 1) * gap) / 2;
        let g = S(1, dotRow(total, x0, 150, Math.min(15, gap * 0.4), gap, '#cbd5e1') + text(W / 2, 100, `${total}개`, { size: 24 }));
        let boxes = '';
        for (let i = 0; i < d; i += 1) boxes += rect(x0 + i * per * gap - gap / 2 + 3, 122, per * gap - 6, 56, { stroke: C.red, width: 3, rx: 12, extra: 'stroke-dasharray="7 5"' });
        g += S(2, boxes + text(W / 2, 214, `똑같이 ${d}묶음으로 나누면 한 묶음에 ${per}개`, { size: 20, fill: C.red }));
        g += S(3, dotRow(n * per, x0, 150, Math.min(15, gap * 0.4), gap, C.orange) + text(W / 2, 256, `${d}묶음 중 ${n}묶음`, { size: 20, fill: '#c2410c' }));
        g += S(4, `${text(W / 2 - 150, 370, `${total}의`, { size: 34 })}${frac(W / 2 - 60, 358, n, d, { size: 30 })}${text(W / 2 + 60, 370, `는 ${n * per}`, { size: 34, fill: '#1e3a8a' })}` + text(W / 2, 420, `${per} × ${n} = ${n * per}`, { size: 22, fill: C.sub }));
        return { body: g, caption: `${total}를 똑같이 ${d}묶음으로 나누면 한 묶음은 ${per}. ${total}의 ${n}/${d}는 ${n}묶음이므로 ${n * per}`, steps: [`구슬이 ${total}개 있어요.`, `똑같이 ${d}묶음으로 나누면 한 묶음에 ${per}개예요.`, `그중 ${n}묶음을 색칠해요.`, `${total}의 ${n}/${d}는 ${per} × ${n} = ${n * per}`] };
    }

    function drawCapacity({ ml }) {
        const L = Math.floor(ml / 1000);
        const r = ml % 1000;
        const cups = Math.max(1, Math.ceil(ml / 1000));
        const cw = Math.min(120, 560 / cups);
        const x0 = (W - cups * (cw + 20)) / 2;
        let g = '';
        let glass = '';
        for (let i = 0; i < cups; i += 1) {
            const x = x0 + i * (cw + 20);
            glass += rect(x, 110, cw, 200, { fill: '#f8fafc', width: 3 });
            for (let t = 1; t < 10; t += 1) glass += line(x, 310 - t * 20, x + (t === 5 ? 22 : 12), 310 - t * 20, { width: 1.5, stroke: '#64748b' });
            glass += text(x + cw / 2, 102, '1 L', { size: 15, fill: C.sub });
        }
        g += S(1, glass);
        let water = '';
        for (let i = 0; i < cups; i += 1) { const v = Math.min(1000, ml - i * 1000); if (v > 0) water += rect(x0 + i * (cw + 20) + 2, 310 - (v / 1000) * 200, cw - 4, (v / 1000) * 200 - 1, { fill: C.blue, stroke: 'none', extra: 'fill-opacity="0.6"' }); }
        g += S(2, water, 'rise');
        g += S(3, text(W / 2, 350, '1 L = 1000 mL  (눈금 한 칸 = 100 mL)', { size: 20, fill: C.red }));
        g += S(4, big(W / 2, 410, `${ml} mL = ${L} L${r ? ` ${r} mL` : ''}`, '#1e3a8a', 38));
        return { body: g, caption: `들이의 단위: 1 L = 1000 mL.  ${ml} mL = ${L} L${r ? ` ${r} mL` : ''}`, steps: ['1 L 들이 그릇이에요. 눈금 한 칸은 100 mL예요.', `물을 ${ml} mL 부었어요.`, '1 L는 1000 mL와 같아요.', `가득 찬 그릇이 ${L}개${r ? `, 남은 물이 ${r} mL` : ''}. ${ml} mL = ${L} L${r ? ` ${r} mL` : ''}`] };
    }

    function drawWeight({ g: grams }) {
        const kg = Math.floor(grams / 1000);
        const r = grams % 1000;
        const cx = 240;
        const cy = 280;
        const R = 140;
        const maxG = Math.max(2000, Math.ceil(grams / 1000) * 1000);
        let face = circle(cx, cy, R, { fill: '#fff', stroke: C.line, width: 5 });
        const ticks = maxG / 100;
        for (let i = 0; i < ticks; i += 1) { const a = (i / ticks) * 2 * Math.PI; face += line(cx + (R - (i % 10 === 0 ? 20 : i % 5 === 0 ? 14 : 8)) * Math.sin(a), cy - (R - (i % 10 === 0 ? 20 : i % 5 === 0 ? 14 : 8)) * Math.cos(a), cx + R * Math.sin(a), cy - R * Math.cos(a), { width: i % 10 === 0 ? 2.5 : 1, stroke: '#475569' }); if (i % 10 === 0) face += text(cx + (R - 38) * Math.sin(a), cy - (R - 38) * Math.cos(a) + 6, i === 0 ? '0' : `${i / 10}kg`, { size: 15 }); }
        let g = S(1, face + circle(cx, cy, 6, { fill: C.ink }) + text(cx, 116, '저울', { size: 18, fill: C.sub }));
        const a = (grams / maxG) * 2 * Math.PI;
        g += S(2, line(cx, cy, cx + (R - 26) * Math.sin(a), cy - (R - 26) * Math.cos(a), { stroke: C.red, width: 5 }));
        g += S(3, text(570, 180, '1 kg = 1000 g', { size: 26, fill: C.red }) + text(570, 214, '(작은 눈금 한 칸 = 100 g)', { size: 17, fill: C.sub }));
        g += S(4, big(570, 310, `${grams} g`, '#1e3a8a', 40) + big(570, 370, `= ${kg} kg${r ? ` ${r} g` : ''}`, '#1e3a8a', 40));
        return { body: g, caption: `무게의 단위: 1 kg = 1000 g.  ${grams} g = ${kg} kg${r ? ` ${r} g` : ''}  (1 t = 1000 kg)`, steps: ['저울의 큰 눈금은 1 kg, 작은 눈금 한 칸은 100 g이에요.', `물건을 올렸더니 바늘이 ${grams} g을 가리켜요.`, '1 kg은 1000 g과 같아요.', `${grams} g = ${kg} kg${r ? ` ${r} g` : ''}`] };
    }

    /* ================= 4학년 ================= */

    function drawBigNumber({ n }) {
        const s = String(n);
        const groups = [];
        for (let i = s.length; i > 0; i -= 4) groups.unshift(s.slice(Math.max(0, i - 4), i));
        const unitNames = ['', '만', '억', '조'];
        const cw = 44;
        const total = s.length * cw + (groups.length - 1) * 26;
        let x = (W - total) / 2;
        let digits = '';
        let marks = '';
        const steps = ['큰 수를 읽어 봐요.', '일의 자리부터 네 자리씩 끊어요.'];
        const reads = [];
        const centers = [];
        groups.forEach((gr, gi) => {
            const startX = x;
            gr.split('').forEach((ch) => { digits += text(x + cw / 2, 190, ch, { size: 54 }); x += cw; });
            centers.push([(startX + x) / 2, gr, unitNames[groups.length - 1 - gi]]);
            if (gi < groups.length - 1) { marks += line(x + 13, 140, x + 13, 210, { stroke: C.red, width: 3, dash: '6 4' }); x += 26; }
        });
        let g = S(1, digits) + S(2, marks, 'drop');
        centers.forEach(([cx, gr, unit], i) => {
            const v = Number(gr);
            const read = v ? `${readSino(v)}${unit}` : '';
            if (read) reads.push(read);
            g += S(3 + i, rect(cx - (gr.length * cw) / 2 - 4, 222, gr.length * cw + 8, 36, { fill: PALETTE[i % 8], stroke: 'none', rx: 8, extra: 'fill-opacity="0.25"' }) + text(cx, 247, unit ? `${unit}의 자리` : '일의 자리', { size: 16, fill: C.sub }) + text(cx, 300, read || '(0)', { size: Math.min(22, 600 / Math.max(6, (read || '').length * groups.length * 0.6)), fill: '#1e3a8a' }));
            steps.push(v ? `${unit || '일'}의 자리 묶음: ${gr} → "${read}"` : `${unit || '일'}의 자리 묶음은 0이라 읽지 않아요.`);
        });
        const k = 3 + centers.length;
        const fullRead = reads.join(' ') || '영';
        g += S(k, text(W / 2, 390, fullRead, { size: Math.min(30, 700 / Math.max(8, fullRead.length * 0.62)), fill: '#15803d', weight: 800 }));
        steps.push(`이어서 읽으면 "${fullRead}"`);
        return { body: g, caption: `큰 수는 일의 자리부터 네 자리씩 끊어 만, 억, 조를 붙여 읽어요. ${n.toLocaleString('en-US')} → ${fullRead}`, steps };
    }

    function drawAngle({ deg }) {
        const cx = 300;
        const cy = 380;
        const R = 220;
        let pro = path(`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy} Z`, { fill: '#e0f2fe', stroke: '#0369a1', width: 2.5 });
        for (let d = 0; d <= 180; d += 5) { const a = (d * Math.PI) / 180; const len = d % 10 === 0 ? 16 : 9; pro += line(cx + (R - len) * Math.cos(a), cy - (R - len) * Math.sin(a), cx + R * Math.cos(a), cy - R * Math.sin(a), { width: d % 10 === 0 ? 1.8 : 1, stroke: '#0369a1' }); if (d % 30 === 0) pro += text(cx + (R - 32) * Math.cos(a), cy - (R - 32) * Math.sin(a) + 5, d, { size: 14, fill: '#0369a1' }); }
        const a = (deg * Math.PI) / 180;
        let g = S(1, line(cx, cy, cx + R + 40, cy, { width: 5, stroke: C.ink }) + line(cx, cy, cx + (R + 40) * Math.cos(a), cy - (R + 40) * Math.sin(a), { width: 5, stroke: C.ink }) + circle(cx, cy, 7, { fill: C.red }));
        g += S(2, pro + circle(cx, cy, 5, { fill: C.red }) + text(640, 150, '① 각도기의 중심을', { size: 18, fill: C.sub }) + text(640, 176, '각의 꼭짓점에 맞춰요', { size: 18, fill: C.sub }));
        g += S(3, line(cx, cy, cx + R, cy, { width: 6, stroke: C.orange }) + text(640, 222, '② 각도기의 밑금을', { size: 18, fill: C.sub }) + text(640, 248, '각의 한 변에 맞춰요', { size: 18, fill: C.sub }));
        g += S(4, circle(cx + R * Math.cos(a), cy - R * Math.sin(a), 9, { fill: C.red }) + path(`M ${cx + 60} ${cy} A 60 60 0 0 0 ${r2(cx + 60 * Math.cos(a))} ${r2(cy - 60 * Math.sin(a))}`, { stroke: C.red, width: 4 }) + text(640, 294, '③ 다른 변이 만나는', { size: 18, fill: C.sub }) + text(640, 320, '눈금을 읽어요', { size: 18, fill: C.sub }));
        const kind = deg < 90 ? '예각 (직각보다 작은 각)' : deg === 90 ? '직각' : '둔각 (직각보다 크고 180°보다 작은 각)';
        g += S(5, big(640, 390, `${deg}°`, '#1e3a8a', 54) + text(640, 426, kind, { size: 17, fill: '#b45309' }));
        return { body: g, caption: `각의 크기를 각도라고 해요. 직각을 똑같이 90으로 나눈 하나가 1도(1°). 이 각은 ${deg}°, ${kind.split(' ')[0]}이에요.`, steps: ['각의 크기를 재어 봐요.', '각도기의 중심을 각의 꼭짓점에 맞춰요.', '각도기의 밑금을 각의 한 변에 맞춰요.', '각의 다른 변이 가리키는 눈금을 읽어요.', `${deg}°예요. ${kind}이에요.`] };
    }

    function drawTriAngles({ a, b }) {
        const c = 180 - a - b;
        const A = [150, 380];
        const B = [550, 380];
        const ta = Math.tan((a * Math.PI) / 180);
        const tb = Math.tan((b * Math.PI) / 180);
        const x = (400 * tb) / (ta + tb);
        const h = Math.min(280, x * ta);
        const sc = h / (x * ta);
        const Cp = [150 + x * sc + (400 * (1 - sc)) / 2 * 0, 380 - h];
        const Bp = [150 + 400 * sc, 380];
        const arc = (p, a0, a1, color, label, r = 34) => path(`M ${r2(p[0] + r * Math.cos(a0))} ${r2(p[1] - r * Math.sin(a0))} A ${r} ${r} 0 0 0 ${r2(p[0] + r * Math.cos(a1))} ${r2(p[1] - r * Math.sin(a1))}`, { stroke: color, width: 5 }) + text(p[0] + (r + 24) * Math.cos((a0 + a1) / 2), p[1] - (r + 24) * Math.sin((a0 + a1) / 2) + 7, label, { size: 19, fill: color });
        const ra = (a * Math.PI) / 180;
        const rb = (b * Math.PI) / 180;
        let g = S(1, poly([A, Bp, Cp], { fill: '#f8fafc', width: 4 }));
        g += S(2, arc(A, 0, ra, C.blue, `${a}°`) + arc(Bp, Math.PI - rb, Math.PI, C.orange, `${b}°`) + arc(Cp, Math.PI + ra, 2 * Math.PI - rb, C.green, `${c}°`));
        const lx = 560;
        const ly = 200;
        g += S(3, line(lx - 110, ly, lx + 190, ly, { width: 3 }) + text(lx + 40, ly - 86, '세 각을 한 점에 모으면', { size: 18, fill: C.sub }));
        const r3 = 70;
        const seg = (s0, s1, color) => path(`M ${lx + 40} ${ly} L ${r2(lx + 40 + r3 * Math.cos(s0))} ${r2(ly - r3 * Math.sin(s0))} A ${r3} ${r3} 0 0 0 ${r2(lx + 40 + r3 * Math.cos(s1))} ${r2(ly - r3 * Math.sin(s1))} Z`, { fill: color, stroke: C.line, width: 1.5 });
        g += S(4, seg(0, ra, C.blue) + seg(ra, ra + (c * Math.PI) / 180, C.green) + seg(ra + (c * Math.PI) / 180, Math.PI, C.orange) + text(lx + 40, ly + 30, '일직선 = 180°', { size: 20, fill: C.red }));
        g += S(5, big(600, 330, `${a}° + ${b}° + ${c}° = 180°`, '#1e3a8a', 28) + text(600, 366, '삼각형의 세 각의 크기의 합은 180°', { size: 17, fill: '#15803d' }));
        return { body: g, caption: `삼각형의 세 각의 크기의 합은 항상 180°예요.  ${a}° + ${b}° + ${c}° = 180°  (사각형은 360°)`, steps: ['삼각형이 있어요.', `세 각의 크기는 ${a}°, ${b}°, ${c}°예요.`, '세 각을 잘라서 꼭짓점이 한 점에 모이게 붙여 봐요.', '세 각이 딱 맞아 일직선이 돼요. 일직선은 180°예요.', `그래서 삼각형의 세 각의 합은 180°. ${a} + ${b} + ${c} = 180`] };
    }

    function drawMove({ kind }) {
        const u = 34;
        const shape = [[0, 0], [0, 1], [0, 2], [1, 2], [0, 3], [1, 0]]; // F 비슷한 모양(칸 좌표)
        const cells = (pts, ox, oy, fill) => pts.map(([x, y]) => rect(ox + x * u, oy + y * u, u, u, { fill, stroke: C.line, width: 1.5 })).join('');
        const gridBg = (ox, oy, w, h) => { let s = ''; for (let i = 0; i <= w; i += 1) s += line(ox + i * u, oy, ox + i * u, oy + h * u, { width: 1, stroke: '#cbd5e1' }); for (let j = 0; j <= h; j += 1) s += line(ox, oy + j * u, ox + w * u, oy + j * u, { width: 1, stroke: '#cbd5e1' }); return s; };
        const ox = 120;
        const oy = 150;
        let g = S(1, gridBg(60, 110, 20, 8) + cells(shape, ox, oy, C.blue) + text(ox + u, oy - 14, '처음 도형', { size: 17, fill: C.blue }));
        let moved = shape;
        let label = '';
        let steps = [];
        let cap = '';
        const tx = 470;
        if (kind === 'flipH') { moved = shape.map(([x, y]) => [1 - x, y]); label = '오른쪽으로 뒤집기'; steps = ['도형을 오른쪽으로 뒤집어 봐요.', '가운데 세로선이 거울이라고 생각해요.', '왼쪽과 오른쪽이 서로 바뀌어요. 위아래는 그대로예요.']; cap = '오른쪽(왼쪽)으로 뒤집으면 왼쪽과 오른쪽이 서로 바뀌어요.'; } else if (kind === 'flipV') { moved = shape.map(([x, y]) => [x, 3 - y]); label = '아래쪽으로 뒤집기'; steps = ['도형을 아래쪽으로 뒤집어 봐요.', '가운데 가로선이 거울이라고 생각해요.', '위쪽과 아래쪽이 서로 바뀌어요. 왼쪽·오른쪽은 그대로예요.']; cap = '위쪽(아래쪽)으로 뒤집으면 위쪽과 아래쪽이 서로 바뀌어요.'; } else if (kind === 'rot90') { moved = shape.map(([x, y]) => [3 - y, x]); label = '시계 방향으로 90° 돌리기'; steps = ['도형을 시계 방향으로 90° 돌려 봐요.', '직각만큼 오른쪽으로 돌아가요.', '위쪽에 있던 부분이 오른쪽으로 가요.']; cap = '시계 방향으로 90° 돌리면 위쪽 부분이 오른쪽으로 이동해요.'; } else if (kind === 'rot180') { moved = shape.map(([x, y]) => [1 - x, 3 - y]); label = '180° 돌리기'; steps = ['도형을 180° 돌려 봐요.', '반 바퀴 돌아가요.', '위쪽은 아래쪽으로, 왼쪽은 오른쪽으로 가요.']; cap = '180° 돌리면 위쪽 부분이 아래쪽으로, 왼쪽 부분이 오른쪽으로 이동해요.'; } else { label = '오른쪽으로 밀기'; steps = ['도형을 오른쪽으로 밀어 봐요.', '모양과 크기는 그대로예요.', '위치만 바뀌어요.']; cap = '도형을 밀면 모양과 크기는 변하지 않고 위치만 바뀌어요.'; }
        const flip = kind === 'flipH' || kind === 'flipV';
        g += S(2, (kind === 'flipH' ? line(330, 120, 330, 372, { stroke: C.red, width: 3, dash: '8 6' }) : kind === 'flipV' ? line(80, 300, 720, 300, { stroke: C.red, width: 3, dash: '8 6' }) : arrow(ox + 2 * u + 30, oy + 2 * u, tx - 30, oy + 2 * u)) + text(W / 2, 100, label, { size: 22, fill: C.red }));
        g += S(3, kind === 'flipV' ? cells(moved, ox, 310, C.orange) + text(ox + u, 310 + 4 * u + 20, '뒤집은 도형', { size: 17, fill: '#c2410c' }) : cells(moved, tx + (kind === 'flipH' ? -2 * u : 0), oy, C.orange) + text(tx + u, oy - 14, flip ? '뒤집은 도형' : kind === 'push' ? '민 도형' : '돌린 도형', { size: 17, fill: '#c2410c' }), 'pop');
        return { body: g, caption: cap, steps };
    }

    /** 4학년 삼각형: 변의 길이나 각도를 바꾸면 삼각형 모양이 바뀌어요. */
    function drawTriangleKinds({ kind, w = 6, h = 6, a = 60, b = 70 }) {
        const names = { isos: '이등변삼각형', equi: '정삼각형', acute: '예각삼각형', obtuse: '둔각삼각형' };
        const tick = (p, q) => { const mx = (p[0] + q[0]) / 2; const my = (p[1] + q[1]) / 2; const t = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2; return line(mx - 10 * Math.cos(t), my - 10 * Math.sin(t), mx + 10 * Math.cos(t), my + 10 * Math.sin(t), { stroke: C.red, width: 4 }); };
        const yb = 400;
        let pts;
        let angs;
        if (kind === 'isos' || kind === 'equi') {
            const U4 = kind === 'equi' ? 36 : 30;
            const base = w * U4;
            const hh = kind === 'equi' ? (base * Math.sqrt(3)) / 2 : h * U4;
            const cx = 260;
            pts = [[cx, yb - hh], [cx - base / 2, yb], [cx + base / 2, yb]];
            const baseAng = Math.round((Math.atan2(hh, base / 2) * 180) / Math.PI);
            angs = kind === 'equi' ? [60, 60, 60] : [180 - 2 * baseAng, baseAng, baseAng];
        } else {
            // 밑변의 두 각(a, b)으로 삼각형을 만들고 그림 칸에 맞게 줄여요.
            const ra = (a * Math.PI) / 180;
            const rb = (b * Math.PI) / 180;
            const t = Math.sin(rb) / Math.sin(ra + rb);
            const raw = [[t * Math.cos(ra), -t * Math.sin(ra)], [0, 0], [1, 0]];
            const xs = raw.map((q) => q[0]);
            const ys = raw.map((q) => q[1]);
            const sc = Math.min(380 / (Math.max(...xs) - Math.min(...xs)), 270 / (Math.max(...ys) - Math.min(...ys)));
            pts = raw.map((q) => [80 + (q[0] - Math.min(...xs)) * sc, yb + q[1] * sc]);
            angs = [180 - a - b, a, b];
        }
        const cen = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
        const angLabel = (i, color = '#c2410c') => { const dx = cen[0] - pts[i][0]; const dy = cen[1] - pts[i][1]; const len = Math.hypot(dx, dy) || 1; const k = Math.min(46, len * 0.5); return text(pts[i][0] + (dx / len) * k, pts[i][1] + (dy / len) * k + 6, `${angs[i]}°`, { size: 17, fill: color }); };
        const [A, B, Cc] = pts;
        let g = S(1, poly(pts, { fill: C.blueL, width: 4 }));
        let steps;
        let cap;
        if (kind === 'isos') {
            g += S(2, tick(A, B) + tick(A, Cc) + line(A[0], A[1], B[0], B[1], { stroke: C.red, width: 5 }) + line(A[0], A[1], Cc[0], Cc[1], { stroke: C.red, width: 5 }) + text((B[0] + Cc[0]) / 2, yb + 26, `밑변 ${w} · 높이 ${h}`, { size: 17, fill: C.sub }));
            g += S(3, angLabel(1) + angLabel(2));
            steps = ['삼각형이에요.', '두 변의 길이가 같아요.', `길이가 같은 두 변의 아래쪽 두 각의 크기도 같아요. (약 ${angs[1]}°)`, '두 변의 길이가 같은 삼각형이 이등변삼각형이에요. 밑변이나 높이가 달라져도 두 변은 늘 같아요.'];
            cap = '이등변삼각형: 두 변의 길이가 같은 삼각형. 두 각의 크기도 같아요.';
        } else if (kind === 'equi') {
            g += S(2, tick(A, B) + tick(A, Cc) + tick(B, Cc) + poly(pts, { stroke: C.red, width: 5 }) + text((B[0] + Cc[0]) / 2, yb + 26, `한 변 ${w}`, { size: 17, fill: C.sub }));
            g += S(3, angLabel(0) + angLabel(1) + angLabel(2));
            steps = ['삼각형이에요.', `세 변의 길이가 모두 ${w}로 같아요.`, '세 각의 크기도 모두 60°로 같아요.', '세 변의 길이가 같은 삼각형이 정삼각형이에요. 크기가 달라져도 세 각은 늘 60°예요.'];
            cap = '정삼각형: 세 변의 길이가 같은 삼각형. 세 각이 모두 60°예요.';
        } else {
            const big3 = angs.indexOf(Math.max(...angs));
            g += S(2, angLabel(0) + angLabel(1) + angLabel(2));
            g += S(3, kind === 'acute' ? text(600, 300, `${angs.join('°, ')}° 모두 90°보다 작아요`, { size: 19, fill: '#c2410c' }) : circle(pts[big3][0], pts[big3][1], 34, { fill: 'none', stroke: C.red, width: 4 }) + text(600, 300, `${angs[big3]}°는 90°보다 커요 (둔각)`, { size: 19, fill: C.red }));
            steps = kind === 'acute' ? ['삼각형이에요.', `세 각의 크기는 ${angs.join('°, ')}°예요.`, '세 각이 모두 직각보다 작은 예각이에요.', '세 각이 모두 예각인 삼각형이 예각삼각형이에요.'] : ['삼각형이에요.', `세 각의 크기는 ${angs.join('°, ')}°예요.`, `한 각(${angs[big3]}°)이 직각보다 큰 둔각이에요.`, '한 각이 둔각인 삼각형이 둔각삼각형이에요.'];
            cap = kind === 'acute' ? '예각삼각형: 세 각이 모두 예각인 삼각형' : '둔각삼각형: 한 각이 둔각인 삼각형';
        }
        g += S(4, big(610, 200, names[kind], '#1e3a8a', 34) + text(610, 244, cap.split(': ')[1].split('. ')[0], { size: 17, fill: C.sub }));
        return { body: g, caption: cap, steps };
    }

    /** 4학년 사각형: 변의 길이·높이를 바꾸면 모양이 바뀌어요. 길이 1 = 32칸(픽셀) */
    function drawQuad({ kind, w = 8, h = 5, top = 4 }) {
        if (kind === 'perp') {
            let g = S(1, line(110, 300, 430, 300, { width: 5, stroke: C.blue }) + line(270, 150, 270, 390, { width: 5, stroke: C.orange }));
            g += S(2, path('M 270 276 L 294 276 L 294 300', { stroke: C.red, width: 3 }) + big(270, 126, '수직', C.red, 26) + text(270, 424, '만나서 이루는 각이 직각', { size: 16, fill: C.sub }));
            g += S(3, line(480, 200, 740, 200, { width: 5, stroke: C.green }) + line(480, 330, 740, 330, { width: 5, stroke: C.green }));
            g += S(4, big(610, 150, '평행', '#15803d', 26) + text(610, 380, '아무리 늘여도 만나지 않아요', { size: 16, fill: C.sub }) + line(540, 200, 540, 330, { stroke: C.red, width: 2, dash: '5 4' }) + line(680, 200, 680, 330, { stroke: C.red, width: 2, dash: '5 4' }) + text(610, 272, '사이의 거리가 같아요', { size: 15, fill: C.red }));
            return { body: g, caption: '두 직선이 만나서 이루는 각이 직각이면 서로 수직, 서로 만나지 않는 두 직선은 평행이에요.', steps: ['두 직선이 만나고 있어요.', '만나서 이루는 각이 직각이면 두 직선은 서로 수직이에요.', '서로 만나지 않는 두 직선이 있어요.', '아무리 늘여도 만나지 않는 두 직선을 평행하다고 해요. 평행선 사이의 거리는 어디서나 같아요.'] };
        }
        const U4 = 32;
        const x0 = 90;
        const yb = 400;
        let pts;
        let par;
        let name;
        let cap;
        let dims = '';
        const lbl = (x, y, t, anchor = 'middle') => text(x, y, t, { size: 17, fill: C.sub, anchor });
        if (kind === 'trap') {
            const off = ((w - top) * U4) / 3;
            const yt = yb - h * U4;
            pts = [[x0 + off, yt], [x0 + off + top * U4, yt], [x0 + w * U4, yb], [x0, yb]];
            par = [[0, 1, 3, 2]];
            name = '사다리꼴';
            cap = '사다리꼴: 평행한 변이 한 쌍이라도 있는 사각형';
            dims = lbl(x0 + off + (top * U4) / 2, yt - 10, `윗변 ${top}`) + lbl(x0 + (w * U4) / 2, yb + 26, `아랫변 ${w}`);
        } else if (kind === 'para') {
            const sl = 1.5 * U4;
            const yt = yb - h * U4;
            pts = [[x0 + sl, yt], [x0 + sl + w * U4, yt], [x0 + w * U4, yb], [x0, yb]];
            par = [[0, 1, 3, 2], [0, 3, 1, 2]];
            name = '평행사변형';
            cap = '평행사변형: 마주 보는 두 쌍의 변이 서로 평행한 사각형. 마주 보는 변의 길이와 각의 크기가 같아요.';
            dims = lbl(x0 + (w * U4) / 2, yb + 26, `밑변 ${w}`) + line(x0 + sl, yt, x0 + sl, yb, { stroke: C.purple, width: 2, dash: '5 4' }) + text(x0 + sl + 8, (yt + yb) / 2 + 6, `높이 ${h}`, { size: 16, fill: C.purple, anchor: 'start' });
        } else {
            const cx = x0 + (w * U4) / 2;
            const cy = yb - (h * U4) / 2;
            pts = [[cx, cy - (h * U4) / 2], [cx + (w * U4) / 2, cy], [cx, yb], [x0, cy]];
            par = [[0, 1, 3, 2], [0, 3, 1, 2]];
            name = '마름모';
            cap = '마름모: 네 변의 길이가 모두 같은 사각형. 마주 보는 변이 평행해요.';
            dims = line(x0, cy, x0 + w * U4, cy, { stroke: C.purple, width: 2, dash: '5 4' }) + line(cx, cy - (h * U4) / 2, cx, yb, { stroke: C.purple, width: 2, dash: '5 4' }) + lbl(cx, yb + 26, `대각선 ${w} · ${h}`);
        }
        let g = S(1, poly(pts, { fill: C.blueL, width: 4 }) + dims);
        const colors = [C.red, C.orange];
        par.forEach((pr, i) => { g += S(2 + i, line(pts[pr[0]][0], pts[pr[0]][1], pts[pr[1]][0], pts[pr[1]][1], { stroke: colors[i], width: 7 }) + line(pts[pr[2]][0], pts[pr[2]][1], pts[pr[3]][0], pts[pr[3]][1], { stroke: colors[i], width: 7 }) + text(640, 190 + i * 40, i === 0 ? '서로 평행한 변 한 쌍' : '평행한 변이 한 쌍 더!', { size: 20, fill: colors[i] })); });
        const k = 2 + par.length;
        g += S(k, big(640, 320, name, '#1e3a8a', 36) + (kind === 'rhom' ? text(640, 360, '네 변의 길이가 모두 같아요', { size: 18, fill: '#15803d' }) : ''));
        const steps = ['사각형이에요.', '서로 평행한 변 한 쌍을 찾았어요.'];
        if (par.length > 1) steps.push('다른 한 쌍의 변도 서로 평행해요.');
        steps.push(`${cap} 길이를 바꿔도 이 성질은 그대로예요.`);
        return { body: g, caption: cap, steps };
    }

    function drawDiagonals({ n }) {
        const pts = ngonPts(n, 250, 270, 160);
        let g = S(1, poly(pts, { fill: '#f8fafc', width: 4 }) + big(590, 130, `정${NGON[n]}`, '#1e3a8a', 34) + text(590, 166, '변의 길이와 각의 크기가 모두 같은 다각형', { size: 15, fill: C.sub }));
        let one = '';
        for (let j = 2; j < n - 1; j += 1) one += line(pts[0][0], pts[0][1], pts[j][0], pts[j][1], { stroke: C.red, width: 3.5 });
        g += S(2, one + circle(pts[0][0], pts[0][1], 8, { fill: C.red }) + text(590, 226, `한 꼭짓점에서 그을 수 있는 대각선`, { size: 17, fill: C.red }) + text(590, 254, `${n} − 3 = ${n - 3}개`, { size: 22, fill: C.red }));
        let all = '';
        for (let i = 1; i < n; i += 1) for (let j = i + 2; j < n; j += 1) all += line(pts[i][0], pts[i][1], pts[j][0], pts[j][1], { stroke: C.orange, width: 2.5 });
        const cnt = (n * (n - 3)) / 2;
        g += S(3, all + text(590, 310, '모든 꼭짓점에서 그리면', { size: 17, fill: '#c2410c' }));
        g += S(4, big(590, 370, `대각선 ${cnt}개`, '#1e3a8a', 34) + text(590, 404, `${n} × ${n - 3} ÷ 2 = ${cnt}`, { size: 18, fill: C.sub }));
        return { body: g, caption: `대각선: 서로 이웃하지 않는 두 꼭짓점을 이은 선분. ${NGON[n]}의 대각선은 ${cnt}개예요.`, steps: [`정${NGON[n]}이에요. 선분으로만 둘러싸인 도형을 다각형이라고 해요.`, `서로 이웃하지 않는 두 꼭짓점을 이은 선분이 대각선이에요. 한 꼭짓점에서 ${n - 3}개를 그을 수 있어요.`, '모든 꼭짓점에서 대각선을 그려 봐요.', `겹치는 것을 빼면 모두 ${cnt}개예요.`] };
    }

    function drawFracAddSame({ a, b, d, op }) {
        const sub = op === 'sub';
        const res = sub ? a - b : a + b;
        const x0 = 100;
        const w = 420;
        const units = Math.max(1, Math.ceil(Math.max(a, res) / d));
        const cw = w / d;
        const bar = (y, n, fill, startAt = 0) => { let s = ''; for (let u = 0; u < units; u += 1) for (let i = 0; i < d; i += 1) { const idx = u * d + i; s += rect(x0 + u * (w / units + 0) * 1 + (i * cw) / units, y, cw / units, 50, { fill: idx >= startAt && idx < startAt + n ? fill : '#f8fafc', stroke: C.line, width: 1.2 }); } for (let u = 0; u < units; u += 1) s += rect(x0 + (u * w) / units, y, w / units, 50, { width: 3 }); return s; };
        let g = S(1, bar(120, a, C.blue) + frac(600, 146, a, d, { size: 24, fill: C.blue }) + text(660, 154, `1/${d}이 ${a}개`, { size: 17, fill: C.sub, anchor: 'start' }));
        g += S(2, (sub ? bar(200, b, C.red, a - b) : bar(200, b, C.orange, a)) + frac(600, 226, b, d, { size: 24, fill: sub ? C.red : '#c2410c' }) + text(660, 234, sub ? `1/${d}을 ${b}개 덜어요` : `1/${d}이 ${b}개 더`, { size: 17, fill: C.sub, anchor: 'start' }));
        g += S(3, bar(280, res, C.green) + text(660, 314, `1/${d}이 ${res}개`, { size: 17, fill: C.sub, anchor: 'start' }) + frac(600, 306, res, d, { size: 24, fill: '#15803d' }), 'wipe');
        let eq = `${frac(230, 400, a, d, { size: 28 })}${text(280, 410, sub ? '−' : '+', { size: 32 })}${frac(330, 400, b, d, { size: 28 })}${text(380, 410, '=', { size: 32 })}${frac(440, 400, `${a}${sub ? '−' : '+'}${b}`, d, { size: 24 })}${text(500, 410, '=', { size: 32 })}${frac(550, 400, res, d, { size: 28, fill: '#15803d' })}`;
        if (res >= d) eq += text(596, 410, '=', { size: 32 }) + fracResult(650, 400, res, d, { size: 28, fill: '#15803d' });
        g += S(4, eq);
        return { body: g, caption: `분모가 같은 분수는 분모는 그대로 두고 분자끼리 ${sub ? '빼요' : '더해요'}. ${a}/${d} ${sub ? '−' : '+'} ${b}/${d} = ${res}/${d}`, steps: [`${a}/${d}은 1/${d}이 ${a}개예요.`, sub ? `여기서 ${b}/${d}, 곧 1/${d}을 ${b}개 덜어 내요.` : `${b}/${d}은 1/${d}이 ${b}개예요. 이어서 색칠해요.`, `1/${d}이 모두 ${res}개가 됐어요.`, `분모는 그대로, 분자끼리 ${sub ? '빼서' : '더해서'} ${res}/${d}`] };
    }

    function drawHundredths({ n }) {
        const x0 = 90;
        const y0 = 100;
        const s = 28;
        let grid = '';
        for (let i = 0; i < 100; i += 1) grid += rect(x0 + (i % 10) * s, y0 + Math.floor(i / 10) * s, s, s, { fill: '#f8fafc', stroke: '#94a3b8', width: 1 });
        let g = S(1, grid + rect(x0, y0, s * 10, s * 10, { width: 3 }) + text(x0 + s * 5, y0 + s * 10 + 28, '전체 1을 100칸으로', { size: 17, fill: C.sub }));
        g += S(2, rect(x0, y0, s, s, { fill: C.red, stroke: C.line }) + text(560, 130, '한 칸 = 1/100 = 0.01', { size: 24, fill: C.red }) + text(560, 162, '(영 점 영일)', { size: 17, fill: C.sub }));
        const tens = Math.floor(n / 10);
        const ones = n % 10;
        let fillT = '';
        for (let i = 0; i < tens * 10; i += 1) fillT += rect(x0 + Math.floor(i / 10) * s, y0 + (i % 10) * s, s, s, { fill: C.blue, stroke: '#94a3b8', width: 1 });
        let fillO = '';
        for (let i = 0; i < ones; i += 1) fillO += rect(x0 + tens * s, y0 + i * s, s, s, { fill: C.orange, stroke: '#94a3b8', width: 1 });
        g += S(3, fillT + text(560, 222, `0.1이 ${tens}개 → 0.${tens}`, { size: 22, fill: C.blue }), 'wipe');
        g += S(4, fillO + text(560, 262, `0.01이 ${ones}개 → 0.0${ones}`, { size: 22, fill: '#c2410c' }));
        const dec = (n / 100).toFixed(2);
        g += S(5, big(560, 350, dec, '#1e3a8a', 56) + text(560, 392, `${n}/100 · 영 점 ${SINO[tens]}${SINO[ones]}`, { size: 20, fill: C.sub }));
        return { body: g, caption: `1/100 = 0.01.  ${dec}은 0.1이 ${tens}개, 0.01이 ${ones}개인 수예요 (${n}/100).`, steps: ['전체 1을 똑같이 100칸으로 나눴어요.', '한 칸은 1/100, 소수로 0.01이에요.', `세로 한 줄(10칸)은 0.1이에요. ${tens}줄을 색칠했어요.`, `낱개 ${ones}칸을 더 색칠했어요.`, `모두 ${n}칸, ${dec}이에요. 소수점 아래는 숫자를 하나씩 읽어요.`] };
    }

    function drawSequence({ start, step, kind }) {
        const mul = kind === 'mul';
        const vals = [start];
        for (let i = 1; i < 6; i += 1) vals.push(mul ? vals[i - 1] * step : vals[i - 1] + step);
        const gap = 110;
        const x0 = (W - 5 * gap) / 2;
        let g = '';
        g += S(1, vals.slice(0, 5).map((v, i) => rect(x0 + i * gap - 42, 170, 84, 60, { fill: '#eff6ff', stroke: '#93c5fd', rx: 10 }) + text(x0 + i * gap, 210, v, { size: Math.min(28, 150 / String(v).length) })).join('') + rect(x0 + 5 * gap - 42, 170, 84, 60, { fill: '#fef9c3', stroke: '#eab308', rx: 10 }) + text(x0 + 5 * gap, 212, '?', { size: 32, fill: '#a16207' }));
        let jumps = '';
        for (let i = 0; i < 4; i += 1) jumps += path(`M ${x0 + i * gap + 10} 164 Q ${x0 + i * gap + gap / 2} 110 ${x0 + (i + 1) * gap - 10} 164`, { stroke: C.red, width: 3 }) + text(x0 + i * gap + gap / 2, 122, mul ? `×${step}` : `+${step}`, { size: 20, fill: C.red });
        g += S(2, jumps, 'wipe');
        g += S(3, text(W / 2, 290, mul ? `규칙: ${step}씩 곱해져요` : `규칙: ${step}씩 커져요`, { size: 26, fill: '#c2410c' }));
        g += S(4, path(`M ${x0 + 4 * gap + 10} 164 Q ${x0 + 4 * gap + gap / 2} 110 ${x0 + 5 * gap - 10} 164`, { stroke: '#15803d', width: 3 }) + text(x0 + 4 * gap + gap / 2, 122, mul ? `×${step}` : `+${step}`, { size: 20, fill: '#15803d' }) + big(W / 2, 380, `${vals[4]} ${mul ? '×' : '+'} ${step} = ${vals[5]}`, '#1e3a8a', 40));
        return { body: g, caption: `수 배열의 규칙: ${mul ? `${step}씩 곱해져요` : `${step}씩 커져요`}. 그래서 ? = ${vals[5]}`, steps: ['수가 규칙에 따라 놓여 있어요. 빈 곳에 올 수는 무엇일까요?', '이웃한 두 수 사이가 어떻게 변하는지 살펴봐요.', mul ? `수가 ${step}배씩 커지는 규칙이에요.` : `수가 ${step}씩 커지는 규칙이에요.`, `그래서 다음 수는 ${vals[4]} ${mul ? '×' : '+'} ${step} = ${vals[5]}`] };
    }

    /* ================= 5학년 ================= */

    function drawOrder({ a, b, c, kind }) {
        const defs = {
            addmul: { expr: `${a} + ${b} × ${c}`, first: `${b} × ${c}`, v1: b * c, second: `${a} + ${b * c}`, v2: a + b * c, rule: '곱셈을 덧셈보다 먼저 계산해요', hi: [1, 2] },
            paren: { expr: `(${a} + ${b}) × ${c}`, first: `${a} + ${b}`, v1: a + b, second: `${a + b} × ${c}`, v2: (a + b) * c, rule: '( ) 안을 가장 먼저 계산해요', hi: [0, 1] },
            subdiv: { expr: `${a * c + b * c} − ${b * c} ÷ ${c}`, first: `${b * c} ÷ ${c}`, v1: b, second: `${a * c + b * c} − ${b}`, v2: a * c + b * c - b, rule: '나눗셈을 뺄셈보다 먼저 계산해요', hi: [1, 2] },
        };
        const d = defs[kind] || defs.addmul;
        const cx = W / 2;
        let g = S(1, big(cx, 150, d.expr, C.ink, 52));
        const wAll = textWidth(d.expr, 52);
        const wFirst = textWidth(d.first, 52) + (kind === 'paren' ? 40 : 0);
        const fx = kind === 'paren' ? cx - wAll / 2 + wFirst / 2 : cx + wAll / 2 - wFirst / 2;
        g += S(2, rect(fx - wFirst / 2 - 8, 104, wFirst + 16, 62, { stroke: C.red, width: 4, rx: 12 }) + text(fx, 96, '① 먼저', { size: 20, fill: C.red }) + text(cx, 210, d.rule, { size: 20, fill: C.red }));
        g += S(3, arrow(fx, 172, fx, 232) + big(fx, 276, `${d.first} = ${d.v1}`, C.red, 30), 'drop');
        g += S(4, big(cx, 350, `${d.second} = ${d.v2}`, '#1e3a8a', 40) + text(cx - textWidth(`${d.second} = ${d.v2}`, 40) / 2 - 20, 346, '②', { size: 24, fill: C.blue, anchor: 'end' }));
        g += S(5, big(cx, 420, `${d.expr} = ${d.v2}`, '#15803d', 30));
        return { body: g, caption: `혼합 계산의 순서: ( ) 안 → 곱셈·나눗셈 → 덧셈·뺄셈 (같은 종류는 앞에서부터).  ${d.expr} = ${d.v2}`, steps: [`${d.expr}를 계산해 봐요.`, `${d.rule}.`, `먼저 ${d.first} = ${d.v1}`, `그다음 ${d.second} = ${d.v2}`, `그래서 ${d.expr} = ${d.v2}`] };
    }

    function drawFactors({ n }) {
        const pairs = [];
        for (let i = 1; i * i <= n; i += 1) if (n % i === 0) pairs.push([i, n / i]);
        const facs = [...new Set(pairs.flat())].sort((p, q) => p - q);
        let g = S(1, big(W / 2, 110, `${n}의 약수`, '#1e3a8a', 32) + text(W / 2, 142, `${josa(n, '을', '를')} 나누어떨어지게 하는 수`, { size: 18, fill: C.sub }));
        const steps = [`${josa(n, '을', '를')} 나누어떨어지게 하는 수를 ${n}의 약수라고 해요. 곱해서 ${josa(n, '이', '가')} 되는 두 수를 찾아봐요.`];
        const rowH = Math.min(46, 220 / pairs.length);
        pairs.forEach(([p, q], i) => {
            const y = 190 + i * rowH;
            const u = Math.min(22, 300 / q, (rowH - 8) / Math.max(1, Math.min(p, 3)));
            let rc = '';
            if (p <= 3 && q <= 30) { for (let r = 0; r < p; r += 1) for (let c2 = 0; c2 < q; c2 += 1) rc += rect(90 + c2 * u, y - (p * u) / 2 + r * u - 4, u, u, { fill: PALETTE[i % 8], stroke: '#fff', width: 1 }); }
            g += S(2 + i, rc + text(560, y + 6, `${p} × ${q} = ${n}`, { size: 24 }) + text(690, y + 6, `→ ${p}${p !== q ? `, ${q}` : ''}`, { size: 22, fill: PALETTE[i % 8], anchor: 'start' }), 'wipe');
            steps.push(`${p} × ${q} = ${n}. 그래서 ${p !== q ? `${josa(p, '과', '와')} ${josa(q, '은', '는')}` : josa(p, '은', '는')} ${n}의 약수예요.`);
        });
        const k = 2 + pairs.length;
        g += S(k, big(W / 2, 430, `${n}의 약수: ${facs.join(', ')}`, '#15803d', Math.min(28, 700 / (facs.join(', ').length * 0.62 + 6))));
        steps.push(`${n}의 약수는 ${facs.join(', ')}. 모두 ${facs.length}개예요. 1과 자기 자신은 항상 약수예요.`);
        return { body: g, caption: `${n}의 약수: ${facs.join(', ')}  (곱해서 ${josa(n, '이', '가')} 되는 수의 짝을 찾아요)`, steps };
    }

    function drawMultiples({ n }) {
        const cell = 34;
        const x0 = 60;
        const y0 = 96;
        let grid = '';
        for (let i = 1; i <= 100; i += 1) grid += rect(x0 + ((i - 1) % 10) * cell, y0 + Math.floor((i - 1) / 10) * cell, cell, cell, { fill: '#fff', stroke: '#94a3b8', width: 1 }) + text(x0 + ((i - 1) % 10) * cell + cell / 2, y0 + Math.floor((i - 1) / 10) * cell + 22, i, { size: 13 });
        let g = S(1, grid);
        let hi = '';
        for (let i = n; i <= 100; i += n) hi += rect(x0 + ((i - 1) % 10) * cell, y0 + Math.floor((i - 1) / 10) * cell, cell, cell, { fill: C.orange, stroke: '#c2410c', width: 2, extra: 'fill-opacity="0.55"' });
        g += S(2, hi, 'wipe');
        const first = [1, 2, 3, 4, 5].map((k) => n * k);
        g += S(3, big(600, 150, `${n}의 배수`, '#1e3a8a', 30) + first.map((v, i) => text(600, 200 + i * 32, `${n} × ${i + 1} = ${v}`, { size: 20 })).join('') + text(600, 366, '…  끝없이 많아요', { size: 18, fill: C.sub }));
        g += S(4, text(600, 410, `${n}씩 뛰어 세기와 같아요`, { size: 19, fill: '#c2410c' }));
        return { body: g, caption: `${n}의 배수: ${josa(n, '을', '를')} 1배, 2배, 3배 … 한 수 → ${first.join(', ')}, …  (가장 작은 배수는 자기 자신)`, steps: ['1부터 100까지의 수 배열표예요.', `${n}씩 뛰어 세며 색칠해요.`, `${josa(n, '을', '를')} 1배, 2배, 3배 … 한 수가 ${n}의 배수예요.`, `배수는 끝없이 많고, 가장 작은 배수는 ${n} 자신이에요.`] };
    }

    function drawGcdLcm({ a, b }) {
        const g0 = gcd(a, b);
        const l0 = lcm(a, b);
        const fa = [];
        const fb = [];
        for (let i = 1; i <= a; i += 1) if (a % i === 0) fa.push(i);
        for (let i = 1; i <= b; i += 1) if (b % i === 0) fb.push(i);
        const common = fa.filter((x) => fb.includes(x));
        const list = (arr, y, color) => arr.map((v, i) => { const x = 180 + i * Math.min(54, 560 / arr.length); return (common.includes(v) ? '' : '') + text(x, y, v, { size: 22, fill: color }); }).join('');
        let g = S(1, text(70, 122, `${a}의 약수`, { size: 18, fill: C.blue, anchor: 'start' }) + list(fa, 122, C.blue) + text(70, 166, `${b}의 약수`, { size: 18, fill: '#c2410c', anchor: 'start' }) + list(fb, 166, '#c2410c'));
        let marks = '';
        fa.forEach((v, i) => { if (common.includes(v)) marks += circle(180 + i * Math.min(54, 560 / fa.length), 115, 18, { fill: 'none', stroke: C.green, width: 3 }); });
        fb.forEach((v, i) => { if (common.includes(v)) marks += circle(180 + i * Math.min(54, 560 / fb.length), 159, 18, { fill: 'none', stroke: C.green, width: 3 }); });
        g += S(2, marks + text(W / 2, 208, `공약수: ${common.join(', ')}`, { size: 22, fill: '#15803d' }));
        g += S(3, big(W / 2, 252, `최대공약수: ${g0}`, '#15803d', 28));
        const ma = [1, 2, 3, 4, 5, 6].map((k) => a * k);
        const mb = [1, 2, 3, 4, 5, 6].map((k) => b * k);
        const need = Math.max(l0 / a, l0 / b);
        const mlist = (base, y, color) => Array.from({ length: Math.min(10, Math.max(4, need)) }, (_, i) => base * (i + 1)).map((v, i, arr) => text(180 + i * Math.min(60, 560 / arr.length), y, v, { size: v === l0 ? 24 : 19, fill: v === l0 ? C.red : color, weight: v === l0 ? 900 : 700 })).join('');
        g += S(4, text(70, 310, `${a}의 배수`, { size: 18, fill: C.blue, anchor: 'start' }) + mlist(a, 310, C.blue) + text(70, 348, `${b}의 배수`, { size: 18, fill: '#c2410c', anchor: 'start' }) + mlist(b, 348, '#c2410c'));
        g += S(5, big(W / 2, 404, `최소공배수: ${l0}`, C.red, 28));
        void ma; void mb;
        return { body: g, caption: `${josa(a, '과', '와')} ${b}의 공약수: ${common.join(', ')} → 최대공약수 ${g0}.  공배수 중 가장 작은 수 → 최소공배수 ${l0}`, steps: [`${a}의 약수와 ${b}의 약수를 모두 써요.`, `두 수에 공통으로 있는 약수가 공약수예요. ${common.join(', ')}`, `공약수 중 가장 큰 수가 최대공약수예요. ${g0}`, `이번에는 두 수의 배수를 차례로 써요.`, `공통인 배수(공배수) 중 가장 작은 수가 최소공배수예요. ${l0}`] };
    }

    function drawCorrespond({ k }) {
        const n = 5;
        const cw = 96;
        const x0 = (W - (n + 1) * cw) / 2;
        let table = rect(x0, 230, cw, 50, { fill: '#eff6ff', stroke: '#93c5fd' }) + text(x0 + cw / 2, 262, '□ (개)', { size: 18 }) + rect(x0, 280, cw, 50, { fill: '#fff7ed', stroke: '#93c5fd' }) + text(x0 + cw / 2, 312, '△ (개)', { size: 18 });
        for (let i = 1; i <= n; i += 1) table += rect(x0 + i * cw, 230, cw, 50, { stroke: '#93c5fd' }) + text(x0 + i * cw + cw / 2, 263, i, { size: 24, fill: C.blue }) + rect(x0 + i * cw, 280, cw, 50, { stroke: '#93c5fd' });
        let g = S(1, table + text(W / 2, 96, `□ 1개마다 △가 ${k}개씩 필요해요`, { size: 20, fill: C.sub }));
        const steps = [`□가 1개 늘 때마다 △가 ${k}개씩 늘어나요. 표로 정리해 봐요.`];
        for (let i = 1; i <= 3; i += 1) {
            let pic = rect(x0 + i * cw + cw / 2 - 14, 120, 28, 28, { fill: C.blue, stroke: 'none', rx: 4 });
            for (let t = 0; t < k; t += 1) pic += poly([[x0 + i * cw + cw / 2 - ((k - 1) * 9) + t * 18, 164], [x0 + i * cw + cw / 2 - ((k - 1) * 9) + t * 18 - 8, 180], [x0 + i * cw + cw / 2 - ((k - 1) * 9) + t * 18 + 8, 180]], { fill: C.orange, stroke: 'none' });
            g += S(1 + i, (i === 1 ? pic : '') + text(x0 + i * cw + cw / 2, 313, i * k, { size: 24, fill: '#c2410c' }) + (i > 1 ? text(x0 + i * cw + cw / 2, 200, `${i} × ${k}`, { size: 17, fill: C.sub }) : ''));
            steps.push(`□가 ${i}개이면 △는 ${i} × ${k} = ${i * k}개`);
        }
        g += S(5, text(x0 + 4 * cw + cw / 2, 313, 4 * k, { size: 24, fill: '#c2410c' }) + text(x0 + 5 * cw + cw / 2, 313, 5 * k, { size: 24, fill: '#c2410c' }));
        steps.push(`같은 규칙으로 4개이면 ${4 * k}, 5개이면 ${5 * k}`);
        g += S(6, big(W / 2, 400, `△ = □ × ${k}`, '#1e3a8a', 44) + text(W / 2, 440, `(또는 □ = △ ÷ ${k})`, { size: 20, fill: C.sub }));
        steps.push(`두 양 사이의 대응 관계를 식으로 나타내면 △ = □ × ${k}`);
        return { body: g, caption: `한 양이 변할 때 다른 양이 그에 따라 변하는 관계가 대응 관계예요.  △ = □ × ${k}`, steps };
    }

    function drawEquivFrac({ n, d, k }) {
        const x0 = 110;
        const w = 460;
        let g = S(1, fracBar(x0, 112, w, 56, n, d, C.blue) + frac(650, 140, n, d, { size: 28, fill: C.blue }));
        g += S(2, fracBar(x0, 214, w, 56, n * k, d * k, C.orange) + frac(650, 242, n * k, d * k, { size: 28, fill: '#c2410c' }) + text(x0 + w / 2, 198, `한 칸을 ${k}칸으로 더 나눠요`, { size: 18, fill: C.sub }), 'wipe');
        g += S(3, line(x0 + (n * w) / d, 104, x0 + (n * w) / d, 280, { stroke: C.red, width: 3, dash: '7 5' }) + text(x0 + (n * w) / d, 96, '색칠한 크기가 같아요', { size: 18, fill: C.red }));
        g += S(4, `${frac(230, 338, n, d, { size: 28 })}${text(280, 348, '=', { size: 32 })}${frac(360, 338, `${n}×${k}`, `${d}×${k}`, { size: 24 })}${text(440, 348, '=', { size: 32 })}${frac(500, 338, n * k, d * k, { size: 28, fill: '#15803d' })}`);
        g += S(5, text(W / 2, 414, `거꾸로 ${n * k}/${d * k}의 분모와 분자를 ${k}로 나누면 ${n}/${d} (약분)`, { size: 18, fill: '#b45309' }));
        return { body: g, caption: `분모와 분자에 0이 아닌 같은 수를 곱하거나 나누어도 크기는 같아요. ${n}/${d} = ${n * k}/${d * k}`, steps: [`${n}/${d}만큼 색칠했어요.`, `칸마다 ${k}칸으로 더 나누면 ${d * k}칸 중 ${n * k}칸, ${n * k}/${d * k}이에요.`, '색칠한 부분의 크기는 똑같아요.', `분모와 분자에 같은 수 ${k}를 곱해도 크기가 같은 분수가 돼요.`, `분모와 분자를 공약수로 나누어 간단히 하는 것을 약분이라고 해요.`] };
    }

    function drawFracAddDiff({ a, b, c, d, op }) {
        const sub = op === 'sub';
        const L = lcm(b, d);
        const A = (a * L) / b;
        const Cc = (c * L) / d;
        const res = sub ? A - Cc : A + Cc;
        const x0 = 90;
        const w = 360;
        let g = S(1, fracBar(x0, 110, w, 46, a, b, C.blue) + frac(520, 132, a, b, { size: 22, fill: C.blue }) + fracBar(x0, 180, w, 46, c, d, C.orange) + frac(520, 202, c, d, { size: 22, fill: '#c2410c' }) + text(650, 170, '칸의 크기가 달라요', { size: 17, fill: C.red }));
        g += S(2, fracBar(x0, 110, w, 46, A, L, C.blue) + fracBar(x0, 180, w, 46, Cc, L, C.orange) + text(580, 140, `= ${A}/${L}`, { size: 22, fill: C.blue, anchor: 'start' }) + text(580, 210, `= ${Cc}/${L}`, { size: 22, fill: '#c2410c', anchor: 'start' }), 'wipe');
        g += S(3, text(W / 2, 258, `분모를 ${b}와 ${d}의 최소공배수 ${L}로 같게 해요 (통분)`, { size: 18, fill: C.red }));
        const units = Math.max(1, Math.ceil(res / L));
        let resBar = '';
        for (let u = 0; u < units; u += 1) resBar += fracBar(x0 + (u * w) / units, 284, w / units - (units > 1 ? 6 : 0), 46, Math.max(0, Math.min(L, res - u * L)), L, C.green);
        g += S(4, resBar + text(580, 314, `${A} ${sub ? '−' : '+'} ${Cc} = ${res}칸`, { size: 20, fill: '#15803d', anchor: 'start' }), 'wipe');
        let eq = `${frac(150, 400, a, b, { size: 26 })}${text(196, 410, sub ? '−' : '+', { size: 30 })}${frac(242, 400, c, d, { size: 26 })}${text(290, 410, '=', { size: 30 })}${frac(340, 400, A, L, { size: 26 })}${text(388, 410, sub ? '−' : '+', { size: 30 })}${frac(436, 400, Cc, L, { size: 26 })}${text(486, 410, '=', { size: 30 })}${frac(536, 400, res, L, { size: 26, fill: '#15803d' })}`;
        const sres = simplifyFraction(res, L);
        if (res > 0 && (sres.n !== res || sres.whole > 0)) eq += text(586, 410, '=', { size: 30 }) + fracResult(640, 400, res, L, { size: 26, fill: '#15803d' });
        g += S(5, eq);
        return { body: g, caption: `분모가 다르면 통분해서 분모를 같게 한 뒤 분자끼리 ${sub ? '빼요' : '더해요'}. ${a}/${b} ${sub ? '−' : '+'} ${c}/${d} = ${A}/${L} ${sub ? '−' : '+'} ${Cc}/${L} = ${res}/${L}`, steps: [`${a}/${b}과 ${c}/${d}은 칸의 크기가 달라서 바로 ${sub ? '뺄' : '더할'} 수 없어요.`, `두 분수를 모두 ${L}칸으로 나눠요. ${a}/${b} = ${A}/${L}, ${c}/${d} = ${Cc}/${L}`, '이렇게 분모를 같게 만드는 것을 통분이라고 해요.', `이제 칸의 크기가 같으니 ${A} ${sub ? '−' : '+'} ${Cc} = ${res}칸`, `답은 ${res}/${L}${sres.n !== res ? ` = ${sres.n}/${sres.d}` : ''}`] };
    }

    function drawAreaShape({ kind, w, h, top }) {
        const u = 30; // 한 칸(1 cm) = 30칸(픽셀)
        const x0 = 110;
        const y0 = 130;
        const gw = w + (kind === 'para' ? 2 : 0);
        let grid = '';
        for (let i = 0; i <= gw; i += 1) grid += line(x0 + i * u, y0, x0 + i * u, y0 + h * u, { width: 1, stroke: '#cbd5e1' });
        for (let j = 0; j <= h; j += 1) grid += line(x0, y0 + j * u, x0 + gw * u, y0 + j * u, { width: 1, stroke: '#cbd5e1' });
        const P2 = (x, y) => [x0 + x * u, y0 + y * u];
        const tx = 620;
        let g = S(1, grid + text(x0 + gw * u, y0 + h * u + 20, '한 칸 = 1 cm²', { size: 13, fill: C.sub, anchor: 'end' }));
        let steps = [];
        let cap = '';
        const dim = (label, x, y, color = C.red) => text(x, y, label, { size: 18, fill: color });
        if (kind === 'rect') {
            g += S(2, poly([P2(0, 0), P2(w, 0), P2(w, h), P2(0, h)], { fill: C.blueL, width: 3, opacity: 0.8 }) + dim(`가로 ${w}`, x0 + (w * u) / 2, y0 - 10) + dim(`세로 ${h}`, x0 - 12, y0 + (h * u) / 2, C.red).replace('text-anchor="middle"', 'text-anchor="end"'));
            g += S(3, text(tx, 190, `한 줄에 ${w}칸씩 ${h}줄`, { size: 20, fill: C.sub }));
            g += S(4, big(tx, 270, `${w} × ${h} = ${w * h} cm²`, '#1e3a8a', 30) + text(tx, 310, '(직사각형의 넓이) = (가로) × (세로)', { size: 15, fill: '#15803d' }));
            steps = ['넓이가 1 cm²인 칸으로 넓이를 알아봐요.', `가로 ${w} cm, 세로 ${h} cm인 직사각형이에요.`, `1 cm² 칸이 한 줄에 ${w}개씩 ${h}줄 있어요.`, `그래서 넓이는 ${w} × ${h} = ${w * h} cm²`];
            cap = `(직사각형의 넓이) = (가로) × (세로) = ${w} × ${h} = ${w * h} cm²`;
        } else if (kind === 'para') {
            g += S(2, poly([P2(2, 0), P2(w + 2, 0), P2(w, h), P2(0, h)], { fill: C.blueL, width: 3, opacity: 0.8 }) + dim(`밑변 ${w}`, x0 + (w * u) / 2 - 30, y0 + h * u + 26) + line(x0 + 2 * u, y0, x0 + 2 * u, y0 + h * u, { stroke: C.purple, width: 2.5, dash: '5 4' }) + text(x0 + 2 * u + 8, y0 + (h * u) / 2, `높이 ${h}`, { size: 17, fill: C.purple, anchor: 'start' }));
            g += S(3, poly([P2(2, 0), P2(2, h), P2(0, h)], { fill: C.orange, width: 2, opacity: 0.8 }) + text(tx, 170, '왼쪽 삼각형을 잘라서', { size: 19, fill: '#c2410c' }));
            g += S(4, poly([P2(w + 2, 0), P2(w + 2, h), P2(w, h)], { fill: C.orange, width: 2, opacity: 0.8 }) + arrow(x0 + u, y0 - 16, x0 + (w + 1) * u, y0 - 16) + text(tx, 200, '오른쪽에 붙이면 직사각형!', { size: 19, fill: '#c2410c' }), 'pop');
            g += S(5, big(tx, 280, `${w} × ${h} = ${w * h} cm²`, '#1e3a8a', 30) + text(tx, 320, '(평행사변형의 넓이) = (밑변) × (높이)', { size: 15, fill: '#15803d' }));
            steps = ['넓이가 1 cm²인 칸 위에 그려 봐요.', `밑변 ${w} cm, 높이 ${h} cm인 평행사변형이에요.`, '왼쪽 삼각형 부분을 잘라요.', '오른쪽으로 옮겨 붙이면 직사각형이 돼요.', `그래서 넓이는 밑변 × 높이 = ${w} × ${h} = ${w * h} cm²`];
            cap = `(평행사변형의 넓이) = (밑변) × (높이) = ${w} × ${h} = ${w * h} cm²`;
        } else if (kind === 'tri') {
            g += S(2, poly([P2(0, h), P2(w, h), P2(w * 0.35, 0)], { fill: C.blueL, width: 3, opacity: 0.85 }) + dim(`밑변 ${w}`, x0 + (w * u) / 2 - 30, y0 + h * u + 26) + line(x0 + w * 0.35 * u, y0, x0 + w * 0.35 * u, y0 + h * u, { stroke: C.purple, width: 2.5, dash: '5 4' }) + text(x0 + w * 0.35 * u + 8, y0 + (h * u) * 0.6, `높이 ${h}`, { size: 17, fill: C.purple, anchor: 'start' }));
            g += S(3, poly([P2(w, h), P2(w * 0.35, 0), P2(w + w * 0.35, 0)], { fill: C.orange, width: 2, opacity: 0.6 }) + text(tx, 170, '똑같은 삼각형을 뒤집어 붙이면', { size: 18, fill: '#c2410c' }) + text(tx, 198, '평행사변형이 돼요', { size: 18, fill: '#c2410c' }), 'pop');
            g += S(4, text(tx, 240, `평행사변형의 넓이: ${w} × ${h} = ${w * h}`, { size: 18, fill: C.sub }));
            g += S(5, big(tx, 300, `${w} × ${h} ÷ 2 = ${numText((w * h) / 2)} cm²`, '#1e3a8a', 26) + text(tx, 338, '(삼각형의 넓이) = (밑변) × (높이) ÷ 2', { size: 15, fill: '#15803d' }));
            steps = ['넓이가 1 cm²인 칸 위에 그려 봐요.', `밑변 ${w} cm, 높이 ${h} cm인 삼각형이에요.`, '똑같은 삼각형을 하나 더 뒤집어 붙이면 평행사변형이 돼요.', `평행사변형의 넓이는 ${w} × ${h} = ${w * h}`, `삼각형은 그 절반이니까 ${w} × ${h} ÷ 2 = ${numText((w * h) / 2)} cm²`];
            cap = `(삼각형의 넓이) = (밑변) × (높이) ÷ 2 = ${w} × ${h} ÷ 2 = ${numText((w * h) / 2)} cm²`;
        } else if (kind === 'trap') {
            const off = (w - top) / 2;
            g += S(2, poly([P2(off, 0), P2(off + top, 0), P2(w, h), P2(0, h)], { fill: C.blueL, width: 3, opacity: 0.85 }) + dim(`윗변 ${top}`, x0 + (off + top / 2) * u, y0 - 10) + dim(`아랫변 ${w}`, x0 + (w * u) / 2 - 30, y0 + h * u + 26) + line(x0 + off * u, y0, x0 + off * u, y0 + h * u, { stroke: C.purple, width: 2.5, dash: '5 4' }) + text(x0 + off * u + 8, y0 + (h * u) / 2, `높이 ${h}`, { size: 17, fill: C.purple, anchor: 'start' }));
            g += S(3, text(tx, 170, '똑같은 사다리꼴 2개를 붙이면', { size: 18, fill: '#c2410c' }) + text(tx, 198, `밑변이 ${top} + ${w}인 평행사변형`, { size: 18, fill: '#c2410c' }));
            g += S(4, text(tx, 240, `(${top} + ${w}) × ${h} = ${(top + w) * h}`, { size: 20, fill: C.sub }));
            g += S(5, big(tx, 300, `(${top} + ${w}) × ${h} ÷ 2 = ${numText(((top + w) * h) / 2)} cm²`, '#1e3a8a', 22) + text(tx, 338, '(윗변 + 아랫변) × (높이) ÷ 2', { size: 15, fill: '#15803d' }));
            steps = ['넓이가 1 cm²인 칸 위에 그려 봐요.', `윗변 ${top} cm, 아랫변 ${w} cm, 높이 ${h} cm인 사다리꼴이에요.`, `똑같은 사다리꼴을 뒤집어 붙이면 밑변이 ${top + w} cm인 평행사변형이 돼요.`, `그 평행사변형의 넓이는 (${top} + ${w}) × ${h} = ${(top + w) * h}`, `사다리꼴은 절반이니까 ${numText(((top + w) * h) / 2)} cm²`];
            cap = `(사다리꼴의 넓이) = (윗변 + 아랫변) × (높이) ÷ 2 = (${top} + ${w}) × ${h} ÷ 2 = ${numText(((top + w) * h) / 2)} cm²`;
        } else {
            g += S(2, poly([P2(w / 2, 0), P2(w, h / 2), P2(w / 2, h), P2(0, h / 2)], { fill: C.blueL, width: 3, opacity: 0.85 }) + line(x0, y0 + (h * u) / 2, x0 + w * u, y0 + (h * u) / 2, { stroke: C.red, width: 2.5, dash: '5 4' }) + line(x0 + (w * u) / 2, y0, x0 + (w * u) / 2, y0 + h * u, { stroke: C.purple, width: 2.5, dash: '5 4' }) + dim(`대각선 ${w}`, x0 + (w * u) * 0.78, y0 + (h * u) / 2 - 8) + text(x0 + (w * u) / 2 + 8, y0 + 24, `대각선 ${h}`, { size: 17, fill: C.purple, anchor: 'start' }));
            g += S(3, rect(x0, y0, w * u, h * u, { stroke: C.orange, width: 4, extra: 'stroke-dasharray="8 5"' }) + text(tx, 170, '마름모를 둘러싼 직사각형', { size: 18, fill: '#c2410c' }) + text(tx, 198, `${w} × ${h} = ${w * h}`, { size: 20, fill: '#c2410c' }));
            g += S(4, text(tx, 240, '마름모는 그 직사각형의 절반', { size: 18, fill: C.sub }));
            g += S(5, big(tx, 300, `${w} × ${h} ÷ 2 = ${numText((w * h) / 2)} cm²`, '#1e3a8a', 26) + text(tx, 338, '(한 대각선) × (다른 대각선) ÷ 2', { size: 15, fill: '#15803d' }));
            steps = ['넓이가 1 cm²인 칸 위에 그려 봐요.', `두 대각선의 길이가 ${w} cm, ${h} cm인 마름모예요.`, `마름모를 둘러싸는 직사각형을 그리면 넓이는 ${w} × ${h} = ${w * h}`, '마름모의 넓이는 그 직사각형의 절반이에요.', `그래서 ${w} × ${h} ÷ 2 = ${numText((w * h) / 2)} cm²`];
            cap = `(마름모의 넓이) = (한 대각선) × (다른 대각선) ÷ 2 = ${w} × ${h} ÷ 2 = ${numText((w * h) / 2)} cm²`;
        }
        return { body: g, caption: cap, steps };
    }

    function drawRange({ a, b, kind }) {
        const lo = a - 3;
        const hi = b + 3;
        const x0 = 90;
        const w = 620;
        const xOf = (v) => x0 + ((v - lo) / (hi - lo)) * w;
        const y = 250;
        let axis = arrow(x0 - 20, y, x0 + w + 30, y, C.ink, 3);
        for (let v = lo; v <= hi; v += 1) axis += line(xOf(v), y - 10, xOf(v), y + 10, { width: 2 }) + text(xOf(v), y + 38, v, { size: 18 });
        let g = S(1, axis);
        const incA = kind === 'closed' || kind === 'left';
        const incB = kind === 'closed' || kind === 'right';
        const nameA = incA ? '이상' : '초과';
        const nameB = incB ? '이하' : '미만';
        const mark = (v, inc, color) => circle(xOf(v), y, 11, { fill: inc ? color : '#fff', stroke: color, width: 4 });
        g += S(2, mark(a, incA, C.blue) + text(xOf(a), y - 30, `${a} ${nameA}`, { size: 20, fill: C.blue }) + text(xOf(a), y - 56, incA ? `${a}와 같거나 큰 수 (●)` : `${a}보다 큰 수 (○)`, { size: 15, fill: C.sub }));
        g += S(3, mark(b, incB, C.orange) + text(xOf(b), y + 70, `${b} ${nameB}`, { size: 20, fill: '#c2410c' }) + text(xOf(b), y + 94, incB ? `${b}와 같거나 작은 수 (●)` : `${b}보다 작은 수 (○)`, { size: 15, fill: C.sub }));
        g += S(4, line(xOf(a) + 11, y, xOf(b) - 11, y, { stroke: C.green, width: 9 }), 'wipe');
        const list = [];
        for (let v = a + (incA ? 0 : 1); v <= b - (incB ? 0 : 1); v += 1) list.push(v);
        g += S(5, big(W / 2, 410, `${a} ${nameA} ${b} ${nameB}인 자연수: ${list.join(', ') || '없음'}`, '#1e3a8a', Math.min(26, 700 / ((list.join(', ').length + 16) * 0.6))));
        return { body: g, caption: `이상·이하는 그 수를 포함(●), 초과·미만은 포함하지 않아요(○). ${a} ${nameA} ${b} ${nameB}인 자연수: ${list.join(', ') || '없음'}`, steps: ['수직선에 수의 범위를 나타내 봐요.', incA ? `${a} 이상은 ${a}와 같거나 큰 수예요. ${a}를 포함하니까 ●로 표시해요.` : `${a} 초과는 ${a}보다 큰 수예요. ${a}는 포함하지 않으니까 ○로 표시해요.`, incB ? `${b} 이하는 ${b}와 같거나 작은 수예요. ●로 표시해요.` : `${b} 미만은 ${b}보다 작은 수예요. ○로 표시해요.`, '두 점 사이를 선으로 이어요.', `이 범위에 있는 자연수는 ${list.join(', ') || '없어요'}.`] };
    }

    function drawRound({ n, place, kind }) {
        const p = Number(place);
        const low = Math.floor(n / p) * p;
        const high = low + p;
        const digit = Math.floor((n % p) / (p / 10));
        const res = kind === 'up' ? (n % p === 0 ? n : high) : kind === 'down' ? low : digit >= 5 ? high : low;
        const name = kind === 'up' ? '올림' : kind === 'down' ? '버림' : '반올림';
        const placeName = { 10: '십', 100: '백', 1000: '천' }[p];
        const x0 = 110;
        const w = 580;
        const xOf = (v) => x0 + ((v - low) / p) * w;
        const y = 240;
        let axis = line(x0 - 20, y, x0 + w + 20, y, { width: 3 });
        for (let i = 0; i <= 10; i += 1) axis += line(x0 + (i * w) / 10, y - (i % 5 === 0 ? 14 : 8), x0 + (i * w) / 10, y + (i % 5 === 0 ? 14 : 8), { width: 2 });
        axis += text(x0, y + 44, low, { size: 22 }) + text(x0 + w, y + 44, high, { size: 22 }) + text(x0 + w / 2, y + 44, low + p / 2, { size: 16, fill: C.sub });
        let g = S(1, big(W / 2, 120, `${n}을 ${name}하여 ${placeName}의 자리까지 나타내기`, '#1e3a8a', 24) + axis);
        g += S(2, circle(xOf(n), y, 10, { fill: C.red }) + text(xOf(n), y - 24, n, { size: 22, fill: C.red }), 'drop');
        const s = String(n);
        const idx = s.length - String(p).length;
        g += S(3, text(W / 2, 330, kind === 'round' ? `${placeName}의 자리 바로 아래 숫자: ${digit}  →  ${digit >= 5 ? '5 이상이니 올려요' : '5보다 작으니 버려요'}` : kind === 'up' ? `${placeName}의 자리 아래 수(${n % p})를 ${p}으로 봐요` : `${placeName}의 자리 아래 수(${n % p})를 0으로 봐요`, { size: 20, fill: '#c2410c' }));
        g += S(4, arrow(xOf(n), y - 54, xOf(res), y - 54, '#15803d', 4) + circle(xOf(res), y, 13, { fill: 'none', stroke: '#15803d', width: 5 }));
        g += S(5, big(W / 2, 410, `${n}  →  ${res}`, '#15803d', 44));
        void idx;
        return { body: g, caption: `올림: 아래 수를 올려요 · 버림: 아래 수를 버려요 · 반올림: 바로 아래 자리 숫자가 0~4면 버리고 5~9면 올려요.  ${n} → ${res}`, steps: [`${n}을 ${name}하여 ${placeName}의 자리까지 나타내 봐요.`, `${n}은 ${low}과 ${high} 사이에 있어요.`, kind === 'round' ? `${placeName}의 자리 바로 아래 숫자가 ${digit}이에요. ${digit >= 5 ? '5, 6, 7, 8, 9이면 올려요.' : '0, 1, 2, 3, 4이면 버려요.'}` : kind === 'up' ? `올림은 구하려는 자리 아래 수를 올려서 나타내요.` : `버림은 구하려는 자리 아래 수를 버려서 나타내요.`, `${res} 쪽으로 가요.`, `${n}을 ${name}하면 ${res}`] };
    }

    function drawFracMul({ a, b, c, d }) {
        const x0 = 110;
        const y0 = 110;
        const Wt = 300;
        const Ht = 260;
        let g = S(1, rect(x0, y0, Wt, Ht, { fill: '#f8fafc', width: 3 }) + text(x0 + Wt / 2, y0 - 12, '전체 1', { size: 18, fill: C.sub }));
        let colFill = '';
        for (let i = 0; i < b; i += 1) colFill += rect(x0 + (i * Wt) / b, y0, Wt / b, Ht, { fill: i < a ? C.blueL : 'none', stroke: C.line, width: 1.5 });
        g += S(2, colFill + frac(x0 + Wt / 2, y0 + Ht + 34, a, b, { size: 22, fill: C.blue }), 'wipe');
        let rowLines = '';
        for (let j = 1; j < d; j += 1) rowLines += line(x0, y0 + (j * Ht) / d, x0 + Wt, y0 + (j * Ht) / d, { width: 1.5 });
        g += S(3, rowLines + frac(x0 - 32, y0 + Ht / 2, c, d, { size: 22, fill: '#c2410c' }) + rect(x0 - 8, y0, 6, (c * Ht) / d, { fill: C.orange, stroke: 'none' }));
        let both = '';
        for (let i = 0; i < a; i += 1) for (let j = 0; j < c; j += 1) both += rect(x0 + (i * Wt) / b, y0 + (j * Ht) / d, Wt / b, Ht / d, { fill: C.green, stroke: C.line, width: 1.5 });
        g += S(4, both + text(600, 170, `전체 ${b} × ${d} = ${b * d}칸 중`, { size: 20, fill: C.sub }) + text(600, 204, `겹친 칸 ${a} × ${c} = ${a * c}칸`, { size: 20, fill: '#15803d' }));
        let eq = `${frac(490, 300, a, b, { size: 26 })}${text(532, 310, '×', { size: 30 })}${frac(574, 300, c, d, { size: 26 })}${text(618, 310, '=', { size: 30 })}${frac(676, 300, `${a}×${c}`, `${b}×${d}`, { size: 22 })}`;
        eq += text(540, 400, '=', { size: 30 }) + frac(590, 390, a * c, b * d, { size: 26, fill: '#15803d' });
        const s = simplifyFraction(a * c, b * d);
        if (s.n !== a * c) eq += text(640, 400, '=', { size: 30 }) + fracResult(690, 390, a * c, b * d, { size: 26, fill: '#15803d' });
        g += S(5, eq);
        return { body: g, caption: `분수의 곱셈은 분자는 분자끼리, 분모는 분모끼리 곱해요. ${a}/${b} × ${c}/${d} = ${a * c}/${b * d}${s.n !== a * c ? ` = ${s.n}/${s.d}` : ''}`, steps: ['전체 1을 나타내는 정사각형이에요.', `세로로 ${b}칸으로 나누고 ${a}칸을 색칠하면 ${a}/${b}이에요.`, `이번에는 가로로 ${d}칸으로 나누고 그중 ${c}칸(${c}/${d})만 봐요.`, `두 색이 겹친 부분은 전체 ${b * d}칸 중 ${a * c}칸이에요.`, `그래서 ${a}/${b} × ${c}/${d} = ${a * c}/${b * d}. 분자끼리, 분모끼리 곱해요.`] };
    }

    function drawSymmetry({ kind }) {
        const line2 = kind === 'line';
        const half = [[0, -120], [70, -70], [50, 0], [110, 60], [40, 120], [0, 120]];
        const cx = 260;
        const cy = 270;
        let g = '';
        let steps;
        let cap;
        if (line2) {
            const right = half.map(([x, y]) => [cx + x, cy + y]);
            const left = half.slice().reverse().map(([x, y]) => [cx - x, cy + y]);
            g += S(1, poly([...right, ...left], { fill: C.blueL, width: 4 }));
            g += S(2, line(cx, cy - 150, cx, cy + 150, { stroke: C.red, width: 3.5, dash: '9 6' }) + text(cx, cy - 160, '대칭축', { size: 20, fill: C.red }), 'drop');
            g += S(3, poly(right, { fill: C.orange, width: 2, opacity: 0.55 }) + text(590, 200, '대칭축을 따라 접으면', { size: 20, fill: C.sub }) + text(590, 230, '완전히 겹쳐요', { size: 20, fill: '#c2410c' }));
            g += S(4, circle(cx + 110, cy + 60, 8, { fill: C.green }) + circle(cx - 110, cy + 60, 8, { fill: C.green }) + line(cx - 110, cy + 60, cx + 110, cy + 60, { stroke: C.green, width: 2.5, dash: '5 4' }) + path(`M ${cx} ${cy + 46} L ${cx + 14} ${cy + 46} L ${cx + 14} ${cy + 60}`, { stroke: C.green, width: 2.5 }) + text(590, 290, '대응점을 이은 선분은', { size: 18, fill: '#15803d' }) + text(590, 318, '대칭축과 수직으로 만나고', { size: 18, fill: '#15803d' }) + text(590, 346, '대칭축이 똑같이 둘로 나눠요', { size: 18, fill: '#15803d' }));
            steps = ['도형이 있어요.', '한 직선을 따라 접어 봐요. 이 직선이 대칭축이에요.', '접었을 때 완전히 겹치는 도형을 선대칭도형이라고 해요.', '겹치는 점(대응점)을 이은 선분은 대칭축과 수직이고, 대칭축에서 두 점까지의 거리가 같아요.'];
            cap = '선대칭도형: 한 직선(대칭축)을 따라 접었을 때 완전히 겹치는 도형';
        } else {
            const pts = [[-130, -60], [-40, -60], [-40, -110], [60, -20], [130, 60], [40, 60], [40, 110], [-60, 20]].map(([x, y]) => [cx + x, cy + y]);
            g += S(1, poly(pts, { fill: C.blueL, width: 4 }));
            g += S(2, circle(cx, cy, 9, { fill: C.red }) + text(cx + 14, cy - 14, '대칭의 중심', { size: 19, fill: C.red, anchor: 'start' }));
            g += S(3, path(`M ${cx + 150} ${cy - 40} A 156 156 0 0 1 ${cx - 150} ${cy + 40}`, { stroke: C.orange, width: 4, dash: '9 6' }) + text(590, 200, '한 점을 중심으로', { size: 20, fill: C.sub }) + text(590, 230, '180° 돌리면 처음과 겹쳐요', { size: 20, fill: '#c2410c' }));
            g += S(4, circle(pts[0][0], pts[0][1], 8, { fill: C.green }) + circle(pts[4][0], pts[4][1], 8, { fill: C.green }) + line(pts[0][0], pts[0][1], pts[4][0], pts[4][1], { stroke: C.green, width: 2.5, dash: '5 4' }) + text(590, 300, '대응점을 이은 선분은', { size: 18, fill: '#15803d' }) + text(590, 328, '대칭의 중심을 지나고', { size: 18, fill: '#15803d' }) + text(590, 356, '중심이 똑같이 둘로 나눠요', { size: 18, fill: '#15803d' }));
            steps = ['도형이 있어요.', '한가운데 점을 찍어요. 이 점이 대칭의 중심이에요.', '이 점을 중심으로 180° 돌리면 처음 도형과 완전히 겹쳐요. 이런 도형이 점대칭도형이에요.', '대응점을 이은 선분은 대칭의 중심을 지나고, 중심에서 두 점까지의 거리가 같아요.'];
            cap = '점대칭도형: 한 점(대칭의 중심)을 중심으로 180° 돌렸을 때 처음 도형과 완전히 겹치는 도형';
        }
        return { body: g, caption: cap, steps };
    }

    function drawCongruent() {
        const tri = (ox, oy, flip) => [[ox, oy + 160], [ox + (flip ? -1 : 1) * 200, oy + 160], [ox + (flip ? -1 : 1) * 60, oy]];
        const A = tri(110, 150, false);
        const B = tri(700, 150, true);
        let g = S(1, poly(A, { fill: C.blueL, width: 4 }) + poly(B, { fill: C.orangeL, width: 4 }));
        g += S(2, text(W / 2, 110, '모양과 크기가 같아서 포개면 완전히 겹쳐요 → 합동', { size: 20, fill: C.red }));
        const names = ['ㄱ', 'ㄴ', 'ㄷ'];
        const names2 = ['ㄹ', 'ㅁ', 'ㅂ'];
        g += S(3, [2, 0, 1].map((i, k) => circle(A[i][0], A[i][1], 8, { fill: PALETTE[k] }) + text(A[i][0], A[i][1] + (i === 2 ? -14 : 28), names[k], { size: 20 }) + circle(B[i][0], B[i][1], 8, { fill: PALETTE[k] }) + text(B[i][0], B[i][1] + (i === 2 ? -14 : 28), names2[k], { size: 20 })).join('') + text(W / 2, 370, '겹치는 점: 대응점', { size: 20, fill: C.sub }));
        g += S(4, line(A[0][0], A[0][1], A[1][0], A[1][1], { stroke: C.red, width: 7 }) + line(B[0][0], B[0][1], B[1][0], B[1][1], { stroke: C.red, width: 7 }) + text(W / 2, 404, '겹치는 변: 대응변 (길이가 같아요)', { size: 20, fill: C.red }));
        g += S(5, text(W / 2, 438, '겹치는 각: 대응각 (크기가 같아요)', { size: 20, fill: '#15803d' }) + circle(A[0][0] + 26, A[0][1] - 14, 12, { fill: C.green }) + circle(B[0][0] - 26, B[0][1] - 14, 12, { fill: C.green }));
        return { body: g, caption: '합동: 모양과 크기가 같아서 포개었을 때 완전히 겹치는 두 도형. 대응변의 길이와 대응각의 크기가 서로 같아요.', steps: ['두 삼각형이 있어요.', '모양과 크기가 같아서 포개면 완전히 겹쳐요. 이런 두 도형을 서로 합동이라고 해요.', '포개었을 때 겹치는 점을 대응점이라고 해요.', '겹치는 변은 대응변이에요. 대응변의 길이는 서로 같아요.', '겹치는 각은 대응각이에요. 대응각의 크기도 서로 같아요.'] };
    }

    function drawDecMul({ a, b }) {
        const s = 26;
        const x0 = 100;
        const y0 = 110;
        let grid = '';
        for (let i = 0; i <= 10; i += 1) grid += line(x0 + i * s, y0, x0 + i * s, y0 + 10 * s, { width: 1, stroke: '#94a3b8' }) + line(x0, y0 + i * s, x0 + 10 * s, y0 + i * s, { width: 1, stroke: '#94a3b8' });
        let g = S(1, grid + rect(x0, y0, 10 * s, 10 * s, { width: 3 }) + text(x0 + 5 * s, y0 - 12, '전체 1 (한 칸 = 0.01)', { size: 17, fill: C.sub }));
        g += S(2, rect(x0, y0, a * s, 10 * s, { fill: C.blue, stroke: 'none', extra: 'fill-opacity="0.35"' }) + text(x0 + (a * s) / 2, y0 + 10 * s + 26, `0.${a}`, { size: 22, fill: C.blue }), 'wipe');
        g += S(3, rect(x0, y0, 10 * s, b * s, { fill: C.orange, stroke: 'none', extra: 'fill-opacity="0.35"' }) + text(x0 - 14, y0 + (b * s) / 2 + 7, `0.${b}`, { size: 22, fill: '#c2410c', anchor: 'end' }), 'wipe');
        g += S(4, rect(x0, y0, a * s, b * s, { fill: C.green, stroke: '#15803d', width: 3, extra: 'fill-opacity="0.75"' }) + text(590, 170, `겹친 칸: ${a} × ${b} = ${a * b}칸`, { size: 22, fill: '#15803d' }) + text(590, 204, `한 칸이 0.01이니까 ${numText((a * b) / 100)}`, { size: 20, fill: C.sub }));
        g += S(5, big(590, 290, `0.${a} × 0.${b} = ${numText((a * b) / 100)}`, '#1e3a8a', 34) + text(590, 334, `${a} × ${b} = ${a * b} → 소수점 아래 자리 수를 더해 두 자리`, { size: 16, fill: C.sub }) + text(590, 372, `(1/10 × 1/10 = 1/100)`, { size: 17, fill: '#b45309' }));
        return { body: g, caption: `자연수처럼 곱한 뒤, 곱하는 두 수의 소수점 아래 자리 수를 더한 만큼 소수점을 찍어요. 0.${a} × 0.${b} = ${numText((a * b) / 100)}`, steps: ['전체 1을 100칸으로 나눈 모눈이에요. 한 칸은 0.01이에요.', `가로로 0.${a}만큼(세로 줄 ${a}개) 색칠해요.`, `세로로 0.${b}만큼(가로 줄 ${b}개) 색칠해요.`, `겹친 부분은 ${a} × ${b} = ${a * b}칸. 한 칸이 0.01이니까 ${numText((a * b) / 100)}`, `그래서 0.${a} × 0.${b} = ${numText((a * b) / 100)}`] };
    }

    function drawCuboidParts({ w, d, h }) {
        const u = 28; // 길이 1 = 28칸(픽셀)
        const ox = 150;
        const oy = 400;
        const dx = d * u * 0.55;
        const dy = d * u * 0.4;
        const P3 = (x, y, z) => [ox + x * u + (y ? dx : 0), oy - z * u - (y ? dy : 0)];
        const v = { a: P3(0, 0, 0), b: P3(w, 0, 0), c: P3(w, 1, 0), dd: P3(0, 1, 0), e: P3(0, 0, h), f: P3(w, 0, h), gg: P3(w, 1, h), hh: P3(0, 1, h) };
        const ln = (p, q, opt) => line(p[0], p[1], q[0], q[1], opt);
        const solid = { width: 3.5 };
        const dash = { width: 2, dash: '7 6', stroke: '#64748b' };
        let g = S(1, poly([v.a, v.b, v.f, v.e], { fill: C.blueL, stroke: 'none', opacity: 0.9 }) + poly([v.b, v.c, v.gg, v.f], { fill: '#93c5fd', stroke: 'none', opacity: 0.9 }) + poly([v.e, v.f, v.gg, v.hh], { fill: '#dbeafe', stroke: 'none', opacity: 0.9 })
            + ln(v.a, v.b, solid) + ln(v.b, v.f, solid) + ln(v.f, v.e, solid) + ln(v.e, v.a, solid) + ln(v.b, v.c, solid) + ln(v.c, v.gg, solid) + ln(v.gg, v.f, solid) + ln(v.e, v.hh, solid) + ln(v.hh, v.gg, solid)
            + ln(v.a, v.dd, dash) + ln(v.dd, v.c, dash) + ln(v.dd, v.hh, dash) + big(590, 120, '직육면체', '#1e3a8a', 34) + text(590, 152, '직사각형 6개로 둘러싸인 도형', { size: 17, fill: C.sub }));
        g += S(2, poly([v.a, v.b, v.f, v.e], { fill: C.orange, stroke: '#c2410c', width: 3, opacity: 0.5 }) + text(590, 210, '면: 선분으로 둘러싸인 부분 → 6개', { size: 19, fill: '#c2410c' }));
        g += S(3, ln(v.e, v.f, { stroke: '#15803d', width: 8 }) + text(590, 250, '모서리: 면과 면이 만나는 선분 → 12개', { size: 19, fill: '#15803d' }));
        g += S(4, Object.values(v).map((p) => circle(p[0], p[1], 8, { fill: C.red })).join('') + text(590, 290, '꼭짓점: 모서리 3개가 만나는 점 → 8개', { size: 19, fill: C.red }));
        g += S(5, poly([v.dd, v.c, v.gg, v.hh], { fill: C.orange, stroke: '#c2410c', width: 2, opacity: 0.25, dash: '6 5' }) + text(590, 340, '마주 보는 면은 서로 평행하고 합동', { size: 18, fill: '#b45309' }) + text(590, 368, '→ 평행한 면이 3쌍', { size: 18, fill: '#b45309' }));
        g += S(6, text(590, 420, w === d && d === h ? '모든 면이 정사각형이면 정육면체예요' : '보이지 않는 모서리는 점선으로 그려요 (겨냥도)', { size: 16, fill: C.sub }));
        return { body: g, caption: '직육면체: 직사각형 6개로 둘러싸인 도형. 면 6개, 모서리 12개, 꼭짓점 8개. 마주 보는 면 3쌍은 서로 평행해요.', steps: ['직사각형 6개로 둘러싸인 도형을 직육면체라고 해요.', '선분으로 둘러싸인 부분이 면이에요. 모두 6개예요.', '면과 면이 만나는 선분이 모서리예요. 모두 12개예요.', '모서리와 모서리가 만나는 점이 꼭짓점이에요. 모두 8개예요.', '마주 보는 두 면은 서로 평행하고 합동이에요. 이런 면이 3쌍 있어요.', '보이는 모서리는 실선, 보이지 않는 모서리는 점선으로 그린 그림을 겨냥도라고 해요.'] };
    }

    function drawAverage({ items }) {
        const { items: rows } = parseGraphItems(items);
        if (rows.length < 2) return { body: S(1, text(W / 2, 250, '자료를 "이름:수" 로 2개 이상 적어 주세요', { size: 20, fill: C.sub })), caption: '자료가 모자라요', steps: ['자료를 2개 이상 적어 주세요.'] };
        const vals = rows.map((r) => Math.round(r.value));
        const sum = vals.reduce((s, x) => s + x, 0);
        const avg = sum / vals.length;
        const maxV = Math.max(...vals);
        const u = Math.min(28, 185 / maxV);
        const colW = Math.min(100, 560 / rows.length);
        const x0 = (W - colW * rows.length) / 2;
        const base = 372;
        const stack = (heights, fillOf) => rows.map((r, i) => { let s = ''; for (let k = 0; k < heights[i]; k += 1) s += rect(x0 + i * colW + colW * 0.2, base - (k + 1) * u, colW * 0.6, u, { fill: fillOf(i, k), stroke: '#fff', width: 1.5 }); return s + text(x0 + i * colW + colW / 2, base + 24, r.label, { size: 16 }); }).join('');
        let g = S(1, stack(vals, (i) => PALETTE[i % 8]) + line(x0 - 10, base, x0 + rows.length * colW + 10, base, { width: 3 }) + rows.map((r, i) => text(x0 + i * colW + colW / 2, base - vals[i] * u - 8, vals[i], { size: 18 })).join(''));
        g += S(2, text(W / 2, 100, `모두 더하면 ${vals.join(' + ')} = ${sum}`, { size: 20, fill: C.sub }));
        g += S(3, line(x0 - 10, base - avg * u, x0 + rows.length * colW + 10, base - avg * u, { stroke: C.red, width: 3.5, dash: '9 6' }) + text(x0 + rows.length * colW + 16, base - avg * u + 6, `평균 ${numText(avg)}`, { size: 18, fill: C.red, anchor: 'start' }), 'wipe');
        g += S(4, text(W / 2, 132, '많은 쪽에서 적은 쪽으로 옮겨 고르게 하면 모두 같은 높이', { size: 17, fill: '#b45309' }));
        g += S(5, big(W / 2, 434, `${sum} ÷ ${vals.length} = ${numText(avg)}`, '#1e3a8a', 28));
        return { body: g, caption: `(평균) = (자료의 값을 모두 더한 수) ÷ (자료의 수) = ${sum} ÷ ${vals.length} = ${numText(avg)}`, steps: ['자료를 막대로 쌓아 봤어요. 높이가 서로 달라요.', `자료의 값을 모두 더하면 ${sum}이에요.`, `높이를 고르게 맞추면 빨간 선, ${numText(avg)}이 돼요.`, '많은 쪽 것을 적은 쪽으로 옮겨 고르게 한 값이 평균이에요.', `평균 = ${sum} ÷ ${vals.length} = ${numText(avg)}`] };
    }

    function drawChance({ red }) {
        const cx = 230;
        const cy = 250;
        const R = 130;
        let wheel = '';
        for (let i = 0; i < 4; i += 1) { const a0 = (i / 4) * 2 * Math.PI - Math.PI / 2; const a1 = ((i + 1) / 4) * 2 * Math.PI - Math.PI / 2; wheel += path(`M ${cx} ${cy} L ${r2(cx + R * Math.cos(a0))} ${r2(cy + R * Math.sin(a0))} A ${R} ${R} 0 0 1 ${r2(cx + R * Math.cos(a1))} ${r2(cy + R * Math.sin(a1))} Z`, { fill: i < red ? C.red : C.blue, stroke: '#fff', width: 3 }); }
        let g = S(1, wheel + circle(cx, cy, 10, { fill: C.ink }) + arrow(cx, cy, cx + 70, cy - 70, C.ink, 5) + text(cx, cy + R + 34, '회전판을 돌려요', { size: 18, fill: C.sub }));
        const words = ['불가능하다', '~아닐 것 같다', '반반이다', '~일 것 같다', '확실하다'];
        const nums = ['0', '', '1/2', '', '1'];
        g += S(2, text(590, 130, `빨강 ${red}칸 · 파랑 ${4 - red}칸`, { size: 22 }) + text(590, 162, '화살이 빨강에 멈출 가능성은?', { size: 19, fill: C.sub }));
        const x0 = 440;
        const w = 300;
        let scale = line(x0, 250, x0 + w, 250, { width: 4 });
        words.forEach((wd, i) => { scale += line(x0 + (i * w) / 4, 240, x0 + (i * w) / 4, 260, { width: 3 }) + text(x0 + (i * w) / 4, 232, nums[i], { size: 18, fill: '#1e3a8a' }) + text(x0 + (i * w) / 4, 284 + (i % 2) * 20, wd, { size: 13, fill: C.sub }); });
        g += S(3, scale);
        g += S(4, circle(x0 + (red * w) / 4, 250, 12, { fill: C.red }) + arrow(x0 + (red * w) / 4, 208, x0 + (red * w) / 4, 234), 'drop');
        g += S(5, big(590, 380, words[red], '#15803d', 32) + (nums[red] ? text(590, 420, `수로 나타내면 ${nums[red]}`, { size: 22, fill: '#1e3a8a' }) : ''));
        return { body: g, caption: `가능성: 어떤 일이 일어나길 기대할 수 있는 정도. 불가능하다 0 · 반반이다 1/2 · 확실하다 1.  빨강 ${red}칸 → "${words[red]}"`, steps: ['네 칸으로 나뉜 회전판이 있어요.', `빨강이 ${red}칸, 파랑이 ${4 - red}칸이에요. 화살이 빨강에 멈출 가능성을 생각해 봐요.`, '가능성은 불가능하다(0)부터 확실하다(1)까지 나타낼 수 있어요.', `빨강이 4칸 중 ${red}칸이니까 여기쯤이에요.`, `가능성은 "${words[red]}"${nums[red] ? `, 수로는 ${nums[red]}` : ''}이에요.`] };
    }

    /* ================= 단원 목록 ================= */

    const U = (grade, term, no, name, concepts) => ({ id: `${grade}-${term}-${no}`, grade, term, no, name, concepts });
    const POLY34 = [3, 4, 5, 6].map((n) => [String(n), NGON[n]]);
    const POLY58 = [4, 5, 6, 7, 8].map((n) => [String(n), `정${NGON[n]}`]);
    const col = (id, name, aMin, aMax, aDef, bMin, bMax, bDef, op, dp = 0) => ({ id, name, params: dp ? [P.num('a', '첫째 수', aMin, aMax, aDef, dp), P.num('b', '둘째 수', bMin, bMax, bDef, dp)] : [P.int('a', '첫째 수', aMin, aMax, aDef), P.int('b', '둘째 수', bMin, bMax, bDef)], snap: op === 'sub' ? (p) => (p.b > p.a ? { a: p.b, b: p.a } : {}) : undefined, fix: (p) => ({ ...p, op, dp }), draw: drawColumn });
    const chart = (id, name, kind, title, items) => ({ id, name, params: [P.txt('title', '제목', title), P.txt('items', '항목(이름:수, …)', items)], fix: (p) => ({ ...p, kind }), draw: drawChart });

    return [
        U(1, 1, 1, '9까지의 수', [{ id: 'count9', name: '수 세기와 쓰기', params: [P.int('n', '수', 1, 9, 7)], draw: drawCount }]),
        U(1, 1, 2, '여러 가지 모양', [{ id: 'shapes3d', name: '상자·둥근 기둥·공 모양', params: [], draw: drawShapes3d }]),
        U(1, 1, 3, '덧셈과 뺄셈', [
            { id: 'add9', name: '덧셈 (모으기)', params: [P.int('a', '첫째 수', 1, 8, 3), P.int('b', '더하는 수', 1, 8, 4)], snap: (p) => ({ b: Math.min(p.b, 9 - p.a) }), draw: drawAddDots },
            { id: 'sub9', name: '뺄셈 (덜어 내기)', params: [P.int('a', '처음 수', 2, 9, 7), P.int('b', '빼는 수', 1, 8, 3)], snap: (p) => ({ b: Math.min(p.b, p.a - 1) }), draw: drawSubDots },
        ]),
        U(1, 1, 4, '비교하기', [{ id: 'compare', name: '길이·수 비교', params: [P.int('a', '가의 길이', 1, 9, 7), P.int('b', '나의 길이', 1, 9, 4)], draw: drawCompare }]),
        U(1, 1, 5, '50까지의 수', [{ id: 'count50', name: '10개씩 묶음과 낱개', params: [P.int('n', '수', 11, 50, 34)], draw: drawCount }]),
        U(1, 2, 1, '100까지의 수', [{ id: 'count100', name: '10개씩 묶음과 낱개', params: [P.int('n', '수', 51, 100, 76)], draw: drawCount }]),
        U(1, 2, 2, '덧셈과 뺄셈(1)', [
            { id: 'add2d', name: '(몇십몇) + (몇십몇)', params: [P.int('a', '첫째 수', 11, 88, 32), P.int('b', '더하는 수', 11, 88, 25)], snap: (p) => { const oa = p.a % 10; const ta = Math.floor(p.a / 10); const ob = Math.min(p.b % 10, 9 - oa); const tb = Math.max(1, Math.min(Math.floor(p.b / 10), 9 - ta)); return { b: tb * 10 + ob }; }, fix: (p) => ({ ...p, op: 'add' }), draw: drawTensOnes },
            { id: 'sub2d', name: '(몇십몇) − (몇십몇)', params: [P.int('a', '처음 수', 22, 99, 57), P.int('b', '빼는 수', 11, 88, 23)], snap: (p) => { const ob = Math.min(p.b % 10, p.a % 10); const tb = Math.max(1, Math.min(Math.floor(p.b / 10), Math.floor(p.a / 10) - 1)); return { b: tb * 10 + ob }; }, fix: (p) => ({ ...p, op: 'sub' }), draw: drawTensOnes },
        ]),
        U(1, 2, 3, '모양과 시각', [
            { id: 'shapes2d', name: '■ ▲ ● 모양', params: [], draw: drawShapes2d },
            { id: 'clock30', name: '몇 시 · 몇 시 30분', params: [P.int('h', '시', 1, 12, 3), P.sel('m', '분', [['0', '정각'], ['30', '30분']], '30')], fix: (p) => ({ h: p.h, m: Number(p.m) }), draw: drawClock },
        ]),
        U(1, 2, 4, '덧셈과 뺄셈(2)', [{ id: 'maketen', name: '10을 만들어 더하기', params: [P.int('a', '첫째 수', 6, 9, 8), P.int('b', '더하는 수', 2, 9, 5)], snap: (p) => ({ b: Math.max(p.b, 11 - p.a) }), draw: drawMakeTen }]),
        U(1, 2, 5, '규칙 찾기', [{ id: 'pattern', name: '되풀이되는 규칙', params: [P.sel('kind', '규칙', [['AB', '● ■ 되풀이'], ['AAB', '● ● ■ 되풀이'], ['ABB', '● ■ ■ 되풀이'], ['ABC', '● ■ ▲ 되풀이']], 'AB')], draw: drawPattern }]),
        U(1, 2, 6, '덧셈과 뺄셈(3)', [{ id: 'subten', name: '10에서 빼기 (십몇 − 몇)', params: [P.int('a', '처음 수', 11, 18, 13), P.int('b', '빼는 수', 2, 9, 5)], snap: (p) => ({ b: Math.max(p.b, p.a - 9) }), draw: drawSubTen }]),

        U(2, 1, 1, '세 자리 수', [{ id: 'place3', name: '백·십·일 모형', params: [P.int('n', '수', 100, 999, 346)], draw: drawPlaceValue }]),
        U(2, 1, 2, '여러 가지 도형', [
            { id: 'ngon', name: '삼각형·사각형·오각형·육각형', params: [P.sel('n', '도형', POLY34, '3')], fix: (p) => ({ n: Number(p.n) }), draw: drawPolygon },
            { id: 'circle', name: '원', params: [], draw: drawCircleShape },
        ]),
        U(2, 1, 3, '덧셈과 뺄셈', [col('add', '받아올림이 있는 덧셈', 10, 99, 47, 1, 99, 28, 'add'), col('sub', '받아내림이 있는 뺄셈', 10, 99, 53, 1, 98, 27, 'sub')]),
        U(2, 1, 4, '길이 재기', [{ id: 'ruler', name: '자로 길이 재기 (cm)', params: [P.int('cm', '길이(cm)', 1, 15, 8)], draw: drawRuler }]),
        U(2, 1, 5, '분류하기', [{ id: 'classify', name: '기준에 따라 분류하고 세기', params: [P.txt('items', '종류(이름:수, …)', '빨강:5, 파랑:7, 노랑:3')], draw: drawClassify }]),
        U(2, 1, 6, '곱셈', [{ id: 'array', name: '묶어 세기와 곱셈식', params: [P.int('a', '한 묶음의 수', 2, 9, 3), P.int('b', '묶음 수', 1, 5, 4)], draw: drawArray }]),
        U(2, 2, 1, '네 자리 수', [{ id: 'place4', name: '천·백·십·일 모형', params: [P.int('n', '수', 1000, 9999, 2345)], draw: drawPlaceValue }]),
        U(2, 2, 2, '곱셈구구', [
            { id: 'times', name: '곱셈구구 (묶음)', params: [P.int('a', '몇 단', 2, 9, 6), P.int('b', '곱하는 수', 1, 5, 4)], draw: drawArray },
            { id: 'table', name: '곱셈표에서 규칙 찾기', params: [P.int('dan', '몇 단', 2, 9, 6)], draw: drawTimesTable },
        ]),
        U(2, 2, 3, '길이 재기', [{ id: 'meter', name: 'm와 cm', params: [P.int('cm', '길이(cm)', 100, 500, 235)], draw: drawMeter }]),
        U(2, 2, 4, '시각과 시간', [{ id: 'clock', name: '몇 시 몇 분', params: [P.int('h', '시', 1, 12, 7), P.int('m', '분', 0, 59, 25)], draw: drawClock }]),
        U(2, 2, 5, '표와 그래프', [chart('circlegraph', '표와 ○ 그래프', 'circle', '좋아하는 과일', '사과:4, 포도:6, 귤:3, 감:2')]),
        U(2, 2, 6, '규칙 찾기', [{ id: 'table', name: '곱셈표에서 규칙 찾기', params: [P.int('dan', '몇 단', 2, 9, 3)], draw: drawTimesTable }, { id: 'pattern', name: '무늬에서 규칙 찾기', params: [P.sel('kind', '규칙', [['AB', '● ■ 되풀이'], ['AAB', '● ● ■ 되풀이'], ['ABB', '● ■ ■ 되풀이'], ['ABC', '● ■ ▲ 되풀이']], 'ABC')], draw: drawPattern }]),

        U(3, 1, 1, '덧셈과 뺄셈', [col('add', '세 자리 수의 덧셈', 100, 999, 365, 100, 999, 278, 'add'), col('sub', '세 자리 수의 뺄셈', 100, 999, 524, 100, 998, 187, 'sub')]),
        U(3, 1, 2, '평면도형', [
            { id: 'lines', name: '선분·반직선·직선', params: [], draw: drawBasicLines },
            { id: 'angle', name: '각과 직각', params: [P.int('deg', '벌어진 정도(°)', 10, 170, 45)], snap: (p) => ({ deg: Math.round(p.deg / 5) * 5 }), fix: (p) => ({ ...p, kind: 'angle' }), draw: drawRightShapes },
            { id: 'rtri', name: '직각삼각형', params: [P.int('w', '밑변', 3, 12, 8), P.int('h', '높이', 3, 8, 6)], fix: (p) => ({ ...p, kind: 'tri' }), draw: drawRightShapes },
            { id: 'rect', name: '직사각형', params: [P.int('w', '가로', 3, 12, 9), P.int('h', '세로', 3, 8, 5)], fix: (p) => ({ ...p, kind: 'rect' }), draw: drawRightShapes },
            { id: 'square', name: '정사각형', params: [P.int('w', '한 변', 3, 8, 6)], fix: (p) => ({ ...p, kind: 'square' }), draw: drawRightShapes },
        ]),
        U(3, 1, 3, '나눗셈', [{ id: 'share', name: '똑같이 나누기', params: [P.int('a', '전체 수', 2, 40, 12), P.int('b', '나누는 수', 2, 6, 3)], snap: (p) => ({ a: Math.max(p.b, Math.round(p.a / p.b) * p.b) }), draw: drawShareDiv }]),
        U(3, 1, 4, '곱셈', [{ id: 'area', name: '(두 자리 수) × (한 자리 수)', params: [P.int('a', '두 자리 수', 11, 99, 23), P.int('b', '한 자리 수', 2, 9, 4)], draw: drawAreaMul }]),
        U(3, 1, 5, '길이와 시간', [{ id: 'mm', name: 'cm와 mm', params: [P.int('mm', '길이(mm)', 11, 150, 47)], draw: drawMmKm }, { id: 'sec', name: '분과 초', params: [P.int('sec', '시간(초)', 61, 599, 135)], draw: drawTimeUnits }]),
        U(3, 1, 6, '분수와 소수', [
            { id: 'frac', name: '분수 알아보기', params: [P.int('n', '분자', 1, 11, 3), P.int('d', '분모', 2, 12, 4)], snap: (p) => ({ n: Math.min(p.n, p.d) }), draw: drawFraction },
            { id: 'tenths', name: '소수 알아보기 (0.1)', params: [P.int('n', '0.1의 개수', 1, 9, 7)], draw: drawTenths },
        ]),
        U(3, 2, 1, '곱셈', [{ id: 'area2', name: '(두 자리 수) × (두 자리 수)', params: [P.int('a', '첫째 수', 11, 99, 24), P.int('b', '둘째 수', 11, 99, 13)], draw: drawAreaMul }]),
        U(3, 2, 2, '나눗셈', [
            { id: 'rem', name: '나머지가 있는 나눗셈', params: [P.int('a', '전체 수', 3, 40, 14), P.int('b', '나누는 수', 2, 6, 4)], snap: (p) => ({ a: Math.max(p.a, p.b) }), draw: drawShareDiv },
            { id: 'long', name: '나눗셈 세로셈', params: [P.int('a', '나누어지는 수', 10, 999, 86), P.int('b', '나누는 수', 2, 9, 4)], draw: drawLongDivInt },
        ]),
        U(3, 2, 3, '원', [{ id: 'parts', name: '원의 중심·반지름·지름', params: [P.int('r', '반지름', 3, 9, 6)], draw: drawCircleParts }]),
        U(3, 2, 4, '분수', [
            { id: 'ofset', name: '전체의 분수만큼', params: [P.int('total', '전체 수', 4, 24, 12), P.int('n', '분자', 1, 5, 2), P.int('d', '분모', 2, 6, 3)], snap: (p) => { const n = Math.min(p.n, p.d - 1) || 1; return { n, total: Math.max(p.d, Math.min(24, Math.round(p.total / p.d) * p.d)) }; }, draw: drawFracOfSet },
            { id: 'mixed', name: '가분수와 대분수', params: [P.int('n', '분자', 2, 20, 7), P.int('d', '분모', 2, 6, 3)], snap: (p) => ({ n: Math.max(p.d, Math.min(p.n, p.d * 4)) }), draw: drawMixed },
        ]),
        U(3, 2, 5, '들이와 무게', [{ id: 'cap', name: '들이 (L와 mL)', params: [P.int('ml', '들이(mL)', 100, 4000, 2300)], snap: (p) => ({ ml: Math.max(100, Math.round(p.ml / 100) * 100) }), draw: drawCapacity }, { id: 'weight', name: '무게 (kg과 g)', params: [P.int('g', '무게(g)', 100, 3900, 1400)], snap: (p) => ({ g: Math.max(100, Math.round(p.g / 100) * 100) }), draw: drawWeight }]),
        U(3, 2, 6, '자료의 정리', [chart('picto', '그림그래프', 'picto', '마을별 나무 수', '가 마을:23, 나 마을:31, 다 마을:15, 라 마을:42')]),

        U(4, 1, 1, '큰 수', [{ id: 'big', name: '만·억 단위로 읽기', params: [P.int('n', '수', 10000, 99999999, 25480000)], draw: drawBigNumber }]),
        U(4, 1, 2, '각도', [
            { id: 'angle', name: '각도기로 각 재기', params: [P.int('deg', '각도(°)', 10, 170, 60)], snap: (p) => ({ deg: Math.round(p.deg / 5) * 5 }), draw: drawAngle },
            { id: 'trisum', name: '삼각형 세 각의 합', params: [P.int('a', '첫째 각(°)', 20, 110, 60), P.int('b', '둘째 각(°)', 20, 110, 70)], snap: (p) => { const a = Math.round(p.a / 5) * 5; return { a, b: Math.max(20, Math.min(Math.round(p.b / 5) * 5, 160 - a)) }; }, draw: drawTriAngles },
        ]),
        U(4, 1, 3, '곱셈과 나눗셈', [
            { id: 'area3', name: '(세 자리 수) × (두 자리 수)', params: [P.int('a', '세 자리 수', 100, 999, 236), P.int('b', '두 자리 수', 11, 99, 24)], draw: drawAreaMul },
            { id: 'long2', name: '두 자리 수로 나누기', params: [P.int('a', '나누어지는 수', 100, 999, 432), P.int('b', '나누는 수', 11, 99, 18)], draw: drawLongDivInt },
        ]),
        U(4, 1, 4, '평면도형의 이동', [{ id: 'move', name: '밀기·뒤집기·돌리기', params: [P.sel('kind', '움직임', [['push', '밀기'], ['flipH', '오른쪽으로 뒤집기'], ['flipV', '아래쪽으로 뒤집기'], ['rot90', '시계 방향 90° 돌리기'], ['rot180', '180° 돌리기']], 'flipH')], draw: drawMove }]),
        U(4, 1, 5, '막대그래프', [chart('bar', '막대그래프', 'bar', '좋아하는 운동', '축구:9, 피구:7, 줄넘기:4, 달리기:6')]),
        U(4, 1, 6, '규칙 찾기', [{ id: 'seq', name: '수 배열에서 규칙 찾기', params: [P.int('start', '처음 수', 1, 500, 3), P.int('step', '변하는 수', 2, 100, 4), P.sel('kind', '규칙', [['add', '더하기'], ['mul', '곱하기']], 'add')], snap: (p) => (p.kind === 'mul' ? { step: Math.min(p.step, 5), start: Math.min(p.start, 20) } : {}), draw: drawSequence }]),
        U(4, 2, 1, '분수의 덧셈과 뺄셈', [
            { id: 'add', name: '분모가 같은 분수의 덧셈', params: [P.int('a', '첫째 분자', 1, 11, 2), P.int('b', '둘째 분자', 1, 11, 3), P.int('d', '분모', 3, 12, 7)], snap: (p) => { const a = Math.min(p.a, p.d - 1); return { a, b: Math.min(p.b, p.d - 1) }; }, fix: (p) => ({ ...p, op: 'add' }), draw: drawFracAddSame },
            { id: 'sub', name: '분모가 같은 분수의 뺄셈', params: [P.int('a', '첫째 분자', 2, 11, 5), P.int('b', '둘째 분자', 1, 10, 2), P.int('d', '분모', 3, 12, 7)], snap: (p) => { const a = Math.max(2, Math.min(p.a, p.d - 1)); return { a, b: Math.min(p.b, a - 1) }; }, fix: (p) => ({ ...p, op: 'sub' }), draw: drawFracAddSame },
        ]),
        U(4, 2, 2, '삼각형', [
            { id: 'isos', name: '이등변삼각형', params: [P.int('w', '밑변', 3, 12, 6), P.int('h', '높이', 3, 9, 7)], fix: (p) => ({ ...p, kind: 'isos' }), draw: drawTriangleKinds },
            { id: 'equi', name: '정삼각형', params: [P.int('w', '한 변', 3, 8, 6)], fix: (p) => ({ ...p, kind: 'equi' }), draw: drawTriangleKinds },
            { id: 'acute', name: '예각삼각형', params: [P.int('a', '왼쪽 각(°)', 30, 85, 60), P.int('b', '오른쪽 각(°)', 30, 85, 70)], snap: (p) => { const a = Math.round(p.a / 5) * 5; return { a, b: Math.max(Math.round(p.b / 5) * 5, 95 - a) }; }, fix: (p) => ({ ...p, kind: 'acute' }), draw: drawTriangleKinds },
            { id: 'obtuse', name: '둔각삼각형', params: [P.int('a', '둔각(°)', 95, 150, 110), P.int('b', '오른쪽 각(°)', 15, 60, 40)], snap: (p) => { const a = Math.round(p.a / 5) * 5; return { a, b: Math.min(Math.round(p.b / 5) * 5, 165 - a) }; }, fix: (p) => ({ ...p, kind: 'obtuse' }), draw: drawTriangleKinds },
        ]),
        U(4, 2, 3, '소수의 덧셈과 뺄셈', [
            { id: 'hund', name: '소수 두 자리 수 (0.01)', params: [P.int('n', '0.01의 개수', 1, 99, 37)], draw: drawHundredths },
            col('add', '소수의 덧셈', 0.1, 9.99, 1.25, 0.1, 9.99, 0.48, 'add', 2),
            col('sub', '소수의 뺄셈', 0.1, 9.99, 3.42, 0.1, 9.98, 1.57, 'sub', 2),
        ]),
        U(4, 2, 4, '사각형', [
            { id: 'perp', name: '수직과 평행', params: [], fix: () => ({ kind: 'perp' }), draw: drawQuad },
            { id: 'trap', name: '사다리꼴', params: [P.int('top', '윗변', 1, 9, 4), P.int('w', '아랫변', 3, 10, 8), P.int('h', '높이', 3, 8, 5)], snap: (p) => ({ top: Math.min(p.top, p.w - 1) }), fix: (p) => ({ ...p, kind: 'trap' }), draw: drawQuad },
            { id: 'para', name: '평행사변형', params: [P.int('w', '밑변', 3, 9, 7), P.int('h', '높이', 3, 8, 5)], fix: (p) => ({ ...p, kind: 'para' }), draw: drawQuad },
            { id: 'rhom', name: '마름모', params: [P.int('w', '가로 대각선', 4, 12, 10), P.int('h', '세로 대각선', 4, 8, 6)], fix: (p) => ({ ...p, kind: 'rhom' }), draw: drawQuad },
        ]),
        U(4, 2, 5, '꺾은선그래프', [chart('line', '꺾은선그래프', 'line', '교실의 온도', '9시:12, 10시:15, 11시:19, 12시:22, 1시:24')]),
        U(4, 2, 6, '다각형', [{ id: 'diag', name: '정다각형과 대각선', params: [P.sel('n', '도형', POLY58, '5')], fix: (p) => ({ n: Number(p.n) }), draw: drawDiagonals }]),

        U(5, 1, 1, '자연수의 혼합 계산', [{ id: 'order', name: '계산 순서', params: [P.sel('kind', '식의 모양', [['addmul', '덧셈과 곱셈'], ['paren', '( )가 있는 식'], ['subdiv', '뺄셈과 나눗셈']], 'addmul'), P.int('a', '첫째 수', 1, 20, 4), P.int('b', '둘째 수', 1, 20, 6), P.int('c', '셋째 수', 2, 9, 3)], draw: drawOrder }]),
        U(5, 1, 2, '약수와 배수', [
            { id: 'factors', name: '약수', params: [P.int('n', '수', 2, 60, 12)], draw: drawFactors },
            { id: 'multiples', name: '배수 (수 배열표)', params: [P.int('n', '수', 2, 20, 4)], draw: drawMultiples },
            { id: 'gcdlcm', name: '최대공약수와 최소공배수', params: [P.int('a', '첫째 수', 2, 30, 12), P.int('b', '둘째 수', 2, 30, 18)], draw: drawGcdLcm },
        ]),
        U(5, 1, 3, '규칙과 대응', [{ id: 'corr', name: '대응 관계를 식으로', params: [P.int('k', '□ 1개마다 △의 수', 2, 6, 3)], draw: drawCorrespond }]),
        U(5, 1, 4, '약분과 통분', [{ id: 'equiv', name: '크기가 같은 분수', params: [P.int('n', '분자', 1, 5, 2), P.int('d', '분모', 2, 6, 3), P.int('k', '곱하는 수', 2, 4, 2)], snap: (p) => ({ n: Math.min(p.n, p.d - 1) || 1 }), draw: drawEquivFrac }]),
        U(5, 1, 5, '분수의 덧셈과 뺄셈', [
            { id: 'add', name: '분모가 다른 분수의 덧셈', params: [P.int('a', '첫째 분자', 1, 5, 1), P.int('b', '첫째 분모', 2, 6, 2), P.int('c', '둘째 분자', 1, 5, 1), P.int('d', '둘째 분모', 2, 6, 3)], snap: (p) => ({ a: Math.min(p.a, p.b - 1) || 1, c: Math.min(p.c, p.d - 1) || 1 }), fix: (p) => ({ ...p, op: 'add' }), draw: drawFracAddDiff },
            { id: 'sub', name: '분모가 다른 분수의 뺄셈', params: [P.int('a', '첫째 분자', 1, 5, 3), P.int('b', '첫째 분모', 2, 6, 4), P.int('c', '둘째 분자', 1, 5, 1), P.int('d', '둘째 분모', 2, 6, 3)], snap: (p) => { let a = Math.min(p.a, p.b - 1) || 1; let c = Math.min(p.c, p.d - 1) || 1; while (c > 1 && c * p.b > a * p.d) c -= 1; if (c * p.b > a * p.d) a = p.b - 1; if (c * p.b > a * p.d) return { a: p.b - 1, c: 1, d: Math.max(p.d, p.b) }; return { a, c }; }, fix: (p) => ({ ...p, op: 'sub' }), draw: drawFracAddDiff },
        ]),
        U(5, 1, 6, '다각형의 둘레와 넓이', [{ id: 'area', name: '도형의 넓이 구하기', params: [P.sel('kind', '도형', [['rect', '직사각형'], ['para', '평행사변형'], ['tri', '삼각형'], ['trap', '사다리꼴'], ['rhom', '마름모']], 'para'), P.int('w', '가로(밑변·아랫변)', 3, 10, 6), P.int('h', '세로(높이)', 3, 8, 4), P.int('top', '윗변(사다리꼴)', 1, 9, 3)], snap: (p) => { const w = p.kind === 'trap' && (p.w - Math.min(p.top, p.w - 1)) % 2 ? p.w : p.w; let top = Math.min(p.top, w - 1); if (p.kind === 'trap' && (w - top) % 2) top = Math.max(1, top - 1); const even = (v) => (p.kind === 'rhom' && v % 2 ? v + 1 : v); return { w: even(w), h: even(p.h), top: Math.max(1, top) }; }, draw: drawAreaShape }]),
        U(5, 2, 1, '수의 범위와 어림하기', [
            { id: 'range', name: '이상·이하·초과·미만', params: [P.int('a', '작은 수', 1, 90, 5), P.int('b', '큰 수', 2, 99, 9), P.sel('kind', '범위', [['closed', '이상 ~ 이하'], ['left', '이상 ~ 미만'], ['right', '초과 ~ 이하'], ['open', '초과 ~ 미만']], 'closed')], snap: (p) => ({ b: Math.max(p.a + 2, Math.min(p.b, p.a + 10)) }), draw: drawRange },
            { id: 'round', name: '올림·버림·반올림', params: [P.int('n', '수', 11, 9999, 2463), P.sel('place', '나타낼 자리', [['10', '십의 자리'], ['100', '백의 자리'], ['1000', '천의 자리']], '100'), P.sel('kind', '방법', [['up', '올림'], ['down', '버림'], ['round', '반올림']], 'round')], snap: (p) => ({ n: Math.max(p.n, Number(p.place) + 1) }), draw: drawRound },
        ]),
        U(5, 2, 2, '분수의 곱셈', [{ id: 'mul', name: '(진분수) × (진분수)', params: [P.int('a', '첫째 분자', 1, 5, 2), P.int('b', '첫째 분모', 2, 6, 3), P.int('c', '둘째 분자', 1, 5, 3), P.int('d', '둘째 분모', 2, 6, 4)], snap: (p) => ({ a: Math.min(p.a, p.b - 1) || 1, c: Math.min(p.c, p.d - 1) || 1 }), draw: drawFracMul }]),
        U(5, 2, 3, '합동과 대칭', [{ id: 'cong', name: '합동', params: [], draw: drawCongruent }, { id: 'sym', name: '선대칭도형·점대칭도형', params: [P.sel('kind', '대칭', [['line', '선대칭도형'], ['point', '점대칭도형']], 'line')], draw: drawSymmetry }]),
        U(5, 2, 4, '소수의 곱셈', [{ id: 'decmul', name: '(소수) × (소수) 모눈으로', params: [P.int('a', '첫째 수 (0.□)', 1, 9, 6), P.int('b', '둘째 수 (0.□)', 1, 9, 4)], draw: drawDecMul }]),
        U(5, 2, 5, '직육면체', [{ id: 'parts', name: '면·모서리·꼭짓점', params: [P.int('w', '가로', 2, 6, 5), P.int('d', '세로', 2, 6, 3), P.int('h', '높이', 2, 6, 4)], draw: drawCuboidParts }]),
        U(5, 2, 6, '평균과 가능성', [
            { id: 'avg', name: '평균', params: [P.txt('items', '자료(이름:수, …)', '1회:6, 2회:9, 3회:4, 4회:5')], draw: drawAverage },
            { id: 'chance', name: '일이 일어날 가능성', params: [P.int('red', '빨강 칸 수 (4칸 중)', 0, 4, 2)], draw: drawChance },
        ]),
    ];
}
