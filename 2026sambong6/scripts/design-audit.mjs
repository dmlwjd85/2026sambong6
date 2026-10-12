/**
 * 검수관과 같은 방식으로 소스 수치를 셉니다.
 * 대상: index.html, src, 루트 설정 js. vendor·fonts·scripts 는 제외합니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) {
            if (['node_modules', 'dist', '.git', 'vendor', 'fonts'].includes(name)) continue;
            walk(p, out);
        } else if (/\.(html|css|js|jsx)$/.test(name)) out.push(p);
    }
    return out;
}

export function collectFiles() {
    const files = [
        ...walk(path.join(root, 'src')),
        path.join(root, 'index.html'),
        path.join(root, 'tailwind.config.js'),
        path.join(root, 'vite.config.js'),
        path.join(root, 'postcss.config.js'),
        path.join(root, 'public', 'ytm-bridge.html'),
    ].filter((p) => fs.existsSync(p));
    return files;
}

function normHex(h) {
    let s = h.toLowerCase();
    if (s.length === 4 || s.length === 5) s = '#' + [...s.slice(1)].map((c) => c + c).join('');
    if (s.length === 9) s = s.slice(0, 7);
    return s;
}

export function auditText(text) {
    const hex = new Map();
    for (const m of text.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) {
        const k = normHex(m[0]);
        hex.set(k, (hex.get(k) || 0) + 1);
    }
    const rgb = new Map();
    for (const m of text.matchAll(/rgba?\([^)]{1,80}\)/gi)) {
        rgb.set(m[0], (rgb.get(m[0]) || 0) + 1);
    }
    const hsl = new Map();
    for (const m of text.matchAll(/hsla?\([^)]{1,80}\)/gi)) {
        hsl.set(m[0], (hsl.get(m[0]) || 0) + 1);
    }
    const tw = new Map();
    const twRe = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|outline|decoration|caret|divide|placeholder|accent)-((?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|sb)-(?:[a-z0-9[\]#.%/-]+)|(?:white|black|transparent|current|inherit))/g;
    for (const m of text.matchAll(twRe)) tw.set(m[0], (tw.get(m[0]) || 0) + 1);

    const sizes = new Map();
    const sizeRe = /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[[^\]]+\])/g;
    for (const m of text.matchAll(sizeRe)) sizes.set(m[0], (sizes.get(m[0]) || 0) + 1);

    const cssSizes = new Map();
    for (const m of text.matchAll(/font-size\s*:\s*([^;}{]+)/g)) {
        const k = m[1].trim();
        cssSizes.set(k, (cssSizes.get(k) || 0) + 1);
    }

    const families = new Set();
    for (const m of text.matchAll(/font-family\s*:\s*([^;}{]+)/g)) families.add(m[1].trim());
    const googleFamilies = [];
    for (const m of text.matchAll(/family=([^"&]+)/g)) {
        googleFamilies.push(...decodeURIComponent(m[1]).split('&family=').join('|').split('|').map((s) => s.split(':')[0].replace(/\+/g, ' ')));
    }

    const fa = new Map();
    const skip = new Set(['solid', 'regular', 'brands', 'spin', 'bounce', 'fw', 'lg', 'xl', '2xl', 'xs', 'sm']);
    for (const m of text.matchAll(/\bfa-([a-z0-9-]+)/g)) {
        if (skip.has(m[1])) continue;
        fa.set(m[1], (fa.get(m[1]) || 0) + 1);
    }

    const emoji = [...text.matchAll(/\p{Extended_Pictographic}/gu)].length;

    const sigs = new Map();
    const buttons = [];
    for (const m of text.matchAll(/<button\b[^>]*class="([^"]*)"/g)) buttons.push(m[1]);
    for (const m of text.matchAll(/<button\b[^>]*class=\\?"([^"\\]+)/g)) buttons.push(m[1]);
    function signature(cls) {
        const tokens = cls.split(/\s+/).filter(Boolean);
        const keep = tokens.filter((t) => {
            if (/^(sm|md|lg|xl|2xl):/.test(t)) return false;
            if (/^(hover|focus|active|disabled|group-hover|aria-\w+):/.test(t)) return false;
            return /^(bg-|text-|border|rounded|shadow|font-|py-|px-|p-|min-h-|from-|to-|via-|outline|ring-)/.test(t);
        });
        keep.sort();
        return keep.join(' ') || '(no visual tokens)';
    }
    buttons.forEach((cls) => {
        const s = signature(cls);
        sigs.set(s, (sigs.get(s) || 0) + 1);
    });

    const under12 = [...sizes.entries()].filter(([k]) => {
        const m = k.match(/text-\[(\d+(?:\.\d+)?)px\]/);
        return m && Number(m[1]) < 12;
    });
    const cssUnder = [...cssSizes.entries()].filter(([k]) => {
        const px = k.match(/^([\d.]+)px/);
        if (px) return Number(px[1]) < 12;
        const rem = k.match(/^([\d.]+)rem/);
        if (rem) return Number(rem[1]) * 16 < 12;
        return false;
    });

    const olyBtn = new Map();
    for (const m of text.matchAll(/\boly-btn-(primary|secondary|reward|danger)\b[^"']{0,40}oly-btn-(sm|md|lg)\b/g)) {
        olyBtn.set(`${m[1]}:${m[2]}`, (olyBtn.get(`${m[1]}:${m[2]}`) || 0) + 1);
    }

    return {
        hex: hex.size,
        rgb: rgb.size,
        hsl: hsl.size,
        hardcoded: hex.size + rgb.size + hsl.size,
        tw: tw.size,
        textSizes: sizes.size,
        textUnder12Kinds: under12.length,
        textUnder12Count: under12.reduce((s, [, n]) => s + n, 0),
        cssFontSizes: cssSizes.size,
        cssUnder12Count: cssUnder.reduce((s, [, n]) => s + n, 0),
        fontFamilies: families.size,
        googleFamilies: [...new Set(googleFamilies)],
        faIcons: fa.size,
        emoji,
        buttonSigs: sigs.size,
        buttonCount: buttons.length,
        olyBtnPairs: olyBtn.size,
        topSizes: [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
}

export function auditFiles(files = collectFiles()) {
    let text = '';
    for (const f of files) text += `\n${fs.readFileSync(f, 'utf8')}`;
    const report = auditText(text);
    report.files = files.length;
    return report;
}

if (process.argv[1] && process.argv[1].endsWith('design-audit.mjs')) {
    const report = auditFiles();
    console.log(JSON.stringify(report, null, 2));
}
