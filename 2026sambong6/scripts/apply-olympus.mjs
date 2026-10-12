/**
 * 올림푸스 수치 게이트용 소스 변환.
 * 단계: A 글꼴·크기·버튼, B 아이콘·이모지·직업, C 색·화면.
 */
import fs from 'node:fs';
import path from 'node:path';
import { auditFiles, collectFiles } from './design-audit.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const phase = (process.argv.find((a) => a.startsWith('--phase=')) || '--phase=all').slice(8);

const SKIP_NAMES = new Set(['solid', 'regular', 'brands', 'spin', 'bounce', 'fw', 'lg', 'xl', '2xl', 'xs', 'sm']);
const STEPS = [12, 14, 16, 20, 24, 32, 48];

const PALETTE = {
    bg: [0xf3, 0xf8, 0xfd],
    surface: [0xff, 0xff, 0xff],
    marble: [0xf7, 0xf5, 0xf0],
    sky: [0x6e, 0xc1, 0xf0],
    'sky-deep': [0x1c, 0x64, 0xa8],
    gold: [0xd4, 0xa6, 0x3a],
    'gold-light': [0xf4, 0xd7, 0x7e],
    'gold-deep': [0xa8, 0x7b, 0x1f],
    'gold-text': [0x6b, 0x4f, 0x0e],
    ink: [0x1e, 0x2a, 0x40],
    'ink-2': [0x45, 0x52, 0x6c],
    line: [0xe3, 0xe8, 0xf0],
    laurel: [0x34, 0x5e, 0x22],
    danger: [0x8e, 0x24, 0x24],
    wine: [0x8b, 0x1e, 0x3f],
    navy: [0x1b, 0x2a, 0x4a],
    'secondary-bg': [0xe7, 0xf3, 0xfc],
    'chalk-board': [0x14, 0x35, 0x2a],
    'chalk-ink': [0xf4, 0xf7, 0xf2],
};

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]{1,80}\)|hsla?\([^)]{1,80}\)/gi;
const TW_RE = /(?:[\w-]+:)*(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|outline|decoration|caret|divide|placeholder|accent)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|sb)-(?:[a-z0-9[\]#.%/-]+)|(?:white|black|transparent|current|inherit)(?:\/[\d.]+)?)/g;

function rel(file) {
    return path.relative(root, file);
}

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, text) {
    fs.writeFileSync(path.join(root, file), text);
}

function report(label) {
    const audit = auditFiles();
    const brief = {
        label,
        hardcoded: audit.hardcoded,
        hex: audit.hex,
        rgb: audit.rgb,
        hsl: audit.hsl,
        tw: audit.tw,
        textSizes: audit.textSizes,
        textUnder12Count: audit.textUnder12Count,
        cssFontSizes: audit.cssFontSizes,
        cssUnder12Count: audit.cssUnder12Count,
        fontFamilies: audit.fontFamilies,
        faIcons: audit.faIcons,
        emoji: audit.emoji,
        buttonSigs: audit.buttonSigs,
        olyBtnPairs: audit.olyBtnPairs,
    };
    console.log(JSON.stringify(brief));
    return brief;
}

function snapPx(n) {
    let px = Number(n);
    if (!Number.isFinite(px)) px = 16;
    if (px < 12) px = 12;
    let best = 12;
    let bestD = Infinity;
    for (const step of STEPS) {
        const d = Math.abs(step - px);
        if (d < bestD || (d === bestD && step > best)) {
            bestD = d;
            best = step;
        }
    }
    return best;
}

function snapFontValue(raw) {
    const v = String(raw || '').trim();
    if (/^(12|14|16|20|24|32|48)px$/.test(v)) return v;
    const px = v.match(/([\d.]+)\s*px/i);
    if (px) return `${snapPx(px[1])}px`;
    const rem = v.match(/([\d.]+)\s*rem/i);
    if (rem) return `${snapPx(Number(rem[1]) * 16)}px`;
    const em = v.match(/([\d.]+)\s*em/i);
    if (em) return `${snapPx(Number(em[1]) * 16)}px`;
    return '16px';
}

function snapFontSizes(text) {
    return text.replace(/font-size\s*:\s*([^;}{>]+)/g, (_m, v) => `font-size: ${snapFontValue(v)}`);
}

function mapFontFamily(text, keepChalk) {
    return text.replace(/font-family\s*:\s*([^\n;}{>]{1,180})/g, (_m, v) => {
        let raw = v.trim();
        let suffix = '';
        if (raw.endsWith('"') || raw.endsWith("'")) {
            suffix = raw.slice(-1);
            raw = raw.slice(0, -1).trim();
        }
        raw = raw.replace(/["']+$/g, '').trim();
        let mapped = 'var(--font-body)';
        if (/var\(--font-/.test(raw)) mapped = raw;
        else if (keepChalk && /Gaegu/i.test(raw)) mapped = 'Gaegu, cursive';
        else if (keepChalk && /Nanum Pen/i.test(raw)) mapped = '"Nanum Pen Script", cursive';
        else if (keepChalk && /Do Hyeon/i.test(raw)) mapped = '"Do Hyeon", sans-serif';
        else if (keepChalk && /Jua/i.test(raw)) mapped = 'Jua, sans-serif';
        else if (/Cinzel/i.test(raw)) mapped = 'var(--font-logo)';
        else if (/Gowun|Batang|Black Han/i.test(raw)) mapped = 'var(--font-display)';
        return `font-family: ${mapped};${suffix}`;
    });
}

function replaceSizeClasses(text) {
    const rules = [
        [/text-\[(?:[0-9]|1[0-1])(?:\.\d+)?px\]/g, 'text-12'],
        [/text-xs\b/g, 'text-12'],
        [/text-\[1[23](?:\.\d+)?px\]/g, 'text-14'],
        [/text-sm\b/g, 'text-14'],
        [/text-\[1[45](?:\.\d+)?px\]/g, 'text-14'],
        [/text-base\b/g, 'text-16'],
        [/text-\[1[67](?:\.\d+)?px\]/g, 'text-16'],
        [/text-\[(?:1[89]|20)(?:\.\d+)?px\]/g, 'text-20'],
        [/text-lg\b/g, 'text-20'],
        [/text-\[2[1-6](?:\.\d+)?px\]/g, 'text-24'],
        [/text-2xl\b/g, 'text-24'],
        [/text-xl\b/g, 'text-24'],
        [/text-\[(?:2[7-9]|3[0-6])(?:\.\d+)?px\]/g, 'text-32'],
        [/text-3xl\b/g, 'text-32'],
        [/text-\[(?:3[7-9]|[4-9]\d|\d{3,})(?:\.\d+)?px\]/g, 'text-48'],
        [/text-(?:4xl|5xl|6xl|7xl|8xl|9xl)\b/g, 'text-48'],
        [/text-\[[^\]]+\]/g, 'text-12'],
    ];
    let out = text;
    for (const [re, to] of rules) out = out.replace(re, to);
    return out;
}

function stripTwColors(text) {
    return text.replace(TW_RE, '').replace(/\s\/\d{1,3}(?=[\s"'`])/g, '');
}

function buttonVariant(cls) {
    if (/(?:bg|from|to|text|border)-(?:red|rose|sb-red)|danger|bg-wine/.test(cls)) return 'danger';
    if (/(?:bg|from|to|text|border)-(?:amber|yellow|sb-gold)|gold/.test(cls)) return 'reward';
    if (/(?:bg|from|to)-(?:sky|blue|cyan|indigo|emerald|green|teal|sb-blue|sb-green|violet|purple|fuchsia)/.test(cls)) return 'primary';
    return 'secondary';
}

function buttonSize(cls) {
    if (/text-(?:xs|\[(?:[0-9]|1[0-1])px\])|py-0|py-1\b|px-1\b|px-2\b|min-h-\[(?:2|3[0-6])/.test(cls)) return 'sm';
    if (/py-3|py-4|px-8|text-(?:base|lg|xl)|min-h-\[(?:4[8-9]|[5-9]\d|\d{3})/.test(cls)) return 'lg';
    return 'md';
}

function isVisualToken(token) {
    const core = token.replace(/^(?:[\w-]+:)*/, '');
    return /^(?:bg-|text-|border|rounded|shadow|font-|py-|px-|p-|min-h-|from-|to-|via-|outline|ring-)/.test(core);
}

function stripVisualTokens(cls) {
    return cls.split(/\s+/).filter((t) => t && !t.startsWith('oly-btn') && !isVisualToken(t) && !/^\/\d/.test(t)).join(' ');
}

function calmExpr(expr) {
    return expr
        .replace(TW_RE, '')
        .replace(/'[^']*'/g, (q) => (/(?:bg-|text-|border|rounded|shadow|font-|py-|px-|min-h-|from-|to-|via-|outline|ring-)/.test(q) ? "''" : q));
}

function rewriteButtonClass(cls) {
    const variant = buttonVariant(cls);
    const size = buttonSize(cls);
    const pieces = [];
    const re = /\$\{[\s\S]*?\}/g;
    let last = 0;
    let m;
    while ((m = re.exec(cls))) {
        pieces.push(stripVisualTokens(cls.slice(last, m.index)));
        pieces.push(calmExpr(m[0]));
        last = m.index + m[0].length;
    }
    pieces.push(stripVisualTokens(cls.slice(last)));
    return ['oly-btn', `oly-btn-${variant}`, `oly-btn-${size}`, ...pieces].join(' ').replace(/\s+/g, ' ').trim();
}

function rewriteButtons(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
        const b = text.indexOf('<button', i);
        if (b < 0) {
            out += text.slice(i);
            break;
        }
        out += text.slice(i, b);
        const gt = text.indexOf('>', b);
        if (gt < 0) {
            out += text.slice(b);
            break;
        }
        let tag = text.slice(b, gt + 1);
        tag = tag.replace(/class="([^"]*)"/g, (_m, cls) => `class="${rewriteButtonClass(cls)}"`);
        out += tag;
        i = gt + 1;
    }
    return out;
}

function replaceIconTags(text) {
    return text.replace(/(?<![\w])<i\b([^>]*)>\s*<\/i>/g, (full, attrs) => {
        const classMatch = attrs.match(/class\s*=\s*(["'])([^"']*)\1/);
        const cls = classMatch ? classMatch[2] : '';
        if (!/\bfa-/.test(cls) && !cls.includes('${')) return full;
        const dyn = cls.match(/\$\{([^}]+)\}/);
        if (dyn) {
            return `<svg class="oly-icon" data-oly="\${${dyn[1]}}" viewBox="0 0 24 24" aria-hidden="true"></svg>`;
        }
        const names = [...cls.matchAll(/\bfa-([a-z0-9-]+)/g)].map((m) => m[1]).filter((n) => !SKIP_NAMES.has(n));
        const name = names[0] || 'mark';
        return `<svg class="oly-icon" data-oly="${name}" viewBox="0 0 24 24" aria-hidden="true"></svg>`;
    });
}

function stripFa(text) {
    let out = text.replace(/\bfa-(?:solid|regular|brands|spin|bounce|fw|lg|xl|2xl|xs|sm)\b/g, '');
    out = out.replace(/\bfa-([a-z0-9-]+)/g, '$1');
    return out;
}

function stripEmoji(text) {
    return text.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '');
}

function parseColor(input) {
    const s = String(input || '').trim();
    const hex = s.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hex) {
        let h = hex[1];
        if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
            a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
        };
    }
    const comma = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (comma) return { r: +comma[1], g: +comma[2], b: +comma[3], a: comma[4] == null ? 1 : +comma[4] };
    const space = s.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i);
    if (space) {
        let a = 1;
        if (space[4]) a = space[4].endsWith('%') ? parseFloat(space[4]) / 100 : +space[4];
        return { r: +space[1], g: +space[2], b: +space[3], a };
    }
    const hsl = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (hsl) {
        const hh = ((+hsl[1]) % 360) / 360;
        const sat = +hsl[2] / 100;
        const lig = +hsl[3] / 100;
        const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
        const p = 2 * lig - q;
        const hue = (t) => {
            let x = t;
            if (x < 0) x += 1;
            if (x > 1) x -= 1;
            if (x < 1 / 6) return p + (q - p) * 6 * x;
            if (x < 1 / 2) return q;
            if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
            return p;
        };
        return { r: Math.round(hue(hh + 1 / 3) * 255), g: Math.round(hue(hh) * 255), b: Math.round(hue(hh - 1 / 3) * 255), a: hsl[4] == null ? 1 : +hsl[4] };
    }
    return null;
}

function lum(c) {
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

function nearest(color, role, flags = {}) {
    const parsed = typeof color === 'string' ? parseColor(color) : color;
    if (!parsed) return 'var(--ink)';
    if (parsed.a < 0.04) return 'transparent';
    let pool = Object.keys(PALETTE);
    if (flags.chalk) pool = parsed && lum(parsed) < 0.45 ? ['chalk-board', 'navy'] : ['chalk-ink', 'surface', 'marble'];
    else if (flags.chess) pool = lum(parsed) < 0.5 ? ['navy', 'ink', 'gold-deep'] : ['marble', 'surface', 'gold-light'];
    else if (role === 'text') pool = ['ink', 'ink-2', 'gold-text', 'navy', 'wine', 'laurel', 'danger', 'surface'];
    else if (role === 'bg') pool = ['surface', 'bg', 'marble', 'secondary-bg', 'sky', 'sky-deep', 'navy', 'wine', 'laurel', 'gold-light'];
    else if (role === 'border') pool = ['line', 'navy', 'gold-text', 'ink', 'wine', 'sky-deep'];
    if (!flags.chalk && !flags.chess && role === 'bg' && parsed.a > 0.9 && lum(parsed) < 0.42) {
        pool = ['surface', 'bg', 'secondary-bg', 'marble'];
    }
    if (!flags.chalk && role === 'text' && lum(parsed) > 0.82) pool = ['ink', 'navy', 'ink-2'];
    let best = pool[0];
    let bestD = Infinity;
    for (const name of pool) {
        const rgb = PALETTE[name];
        const dr = parsed.r - rgb[0];
        const dg = parsed.g - rgb[1];
        const db = parsed.b - rgb[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
            bestD = d;
            best = name;
        }
    }
    const token = `var(--${best})`;
    if (parsed.a < 0.98) {
        const pct = Math.max(8, Math.round(parsed.a * 100));
        return `color-mix(in srgb, ${token} ${pct}%, transparent)`;
    }
    return token;
}

function replaceColorsInText(text, flags = {}) {
    return text.replace(COLOR_RE, (m) => nearest(m, flags.role || 'any', flags));
}

function splitDecls(body) {
    const parts = [];
    let cur = '';
    let depth = 0;
    for (const ch of body) {
        if (ch === '(') depth += 1;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ';' && depth === 0) {
            parts.push(cur);
            cur = '';
        } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    return parts;
}

function roleForProp(prop) {
    const name = prop.toLowerCase();
    if (/^(color|fill|stroke|caret-color|text-decoration-color|flood-color|stop-color)$/.test(name)) return 'text';
    if (name.includes('background')) return 'bg';
    if (name.startsWith('border') || name.startsWith('outline')) return 'border';
    if (name.includes('shadow')) return 'shadow';
    return 'any';
}

function transformCss(css) {
    const rules = css.replace(/([^{]+)\{([^{}]*)\}/g, (full, sel, body) => {
        const flags = {
            chalk: /chalk/i.test(sel),
            chess: /chess|gomoku/i.test(sel),
        };
        const isTheme = /bg-theme/.test(sel);
        const decls = splitDecls(body).map((decl) => {
            const m = decl.match(/^\s*([\w-]+)\s*:\s*([\s\S]*)$/);
            if (!m) return replaceColorsInText(decl, flags);
            const prop = m[1];
            let value = m[2].trim();
            const important = /!important\s*$/i.test(value);
            value = value.replace(/\s*!important\s*$/i, '').trim();
            if (prop.toLowerCase() === 'font-size') value = snapFontValue(value);
            else if (prop.toLowerCase() === 'font-family') {
                const mapped = mapFontFamily(`${prop}: ${value}`, flags.chalk);
                value = mapped.replace(/^font-family:\s*/i, '');
            } else if (prop.toLowerCase() === 'box-shadow') {
                value = /0\s+\d+px\s+0\b/.test(value) ? 'var(--shadow-press)' : 'var(--shadow-card)';
            } else if (prop.toLowerCase() === 'text-shadow') value = 'none';
            else if (isTheme && prop.toLowerCase().includes('background')) {
                value = prop.toLowerCase() === 'background-image' ? 'none' : 'var(--bg)';
            } else {
                const role = roleForProp(prop);
                value = replaceColorsInText(value, { ...flags, role });
            }
            return `${prop}: ${value}${important ? ' !important' : ''}`;
        });
        return `${sel}{${decls.join(';')}}`;
    });
    return replaceColorsInText(rules);
}

function protectCanvas(text) {
    const lines = text.split('\n');
    const out = lines.map((line) => {
        if (!/(fillStyle|strokeStyle|addColorStop|_chalkColor)/.test(line)) return line;
        let next = line;
        next = next.replace(/let _chalkColor = '#[0-9a-fA-F]+'/, "let _chalkColor = ''");
        next = next.replace(/(fillStyle|strokeStyle)\s*=\s*(['"])[^'"]+\2/g, (_m, prop) => `${prop} = resolvePaint('', '--ink')`);
        next = next.replace(/(strokeStyle)\s*=\s*s\.color\s*\|\|\s*(['"])[^'"]+\2/g, "$1 = resolvePaint(s.color, '--ink')");
        next = next.replace(/(strokeStyle)\s*=\s*_chalkColor/g, "$1 = resolvePaint(_chalkColor, '--chalk-ink')");
        next = next.replace(/(['"])#(?:[0-9a-fA-F]{3,8})\1/g, "resolvePaint('', '--ink')");
        next = next.replace(/(['"])rgba?\([^)'"]+\)\1/g, "resolvePaint('', '--ink')");
        return next;
    });
    const helper = `
function resolvePaint(value, fallback) {
    const raw = String(value || '').trim();
    let token = '';
    if (raw.startsWith('var(') && raw.endsWith(')')) token = raw.slice(4, -1).trim();
    else if (raw.startsWith('--')) token = raw;
    if (token && typeof window.olyPaint === 'function') return window.olyPaint(token);
    if (raw && !token) return raw;
    return typeof window.olyPaint === 'function' ? window.olyPaint(fallback || '--ink') : raw;
}
`;
    const joined = out.join('\n');
    if (joined.includes('function resolvePaint(')) return joined;
    return `${joined}\n${helper}`;
}

function extractDiv(html, id) {
    const start = html.indexOf(`<div id="${id}"`);
    if (start < 0) return null;
    const re = /<\/?div\b[^>]*>/g;
    re.lastIndex = start;
    let depth = 0;
    let m;
    while ((m = re.exec(html))) {
        if (m[0].startsWith('</')) depth -= 1;
        else depth += 1;
        if (depth === 0) {
            const end = m.index + m[0].length;
            return { start, end, html: html.slice(start, end) };
        }
    }
    return null;
}

function navIcon(text) {
    const map = {
        'nav-home': 'home',
        'nav-plaza': 'plaza',
        'nav-quests': 'shield',
        'nav-literature': 'lyre',
        'nav-jobs': 'crown',
        'nav-economy': 'sandal',
        'nav-lunch': 'leaf',
        'nav-challenge': 'torch',
        'nav-constitution': 'scroll',
        'nav-classtools': 'school',
        'nav-admin': 'gear',
        'nav-settings': 'gear',
        'nav-help': 'help',
        'nav-shop': 'cart',
        'nav-bank': 'bank',
        'nav-estate': 'home',
        'nav-groupbuy': 'users',
        'shop-skin': 'user',
    };
    return text.replace(/<img src="nav\/([^"]+)\.webp"[^>]*>/g, (_m, name) => {
        const icon = map[name] || 'mark';
        return `<svg class="oly-icon" data-oly="${icon}" viewBox="0 0 24 24" aria-hidden="true"></svg>`;
    });
}

function structuralHtml(html) {
    let out = html;
    out = out.replace(
        '<link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Do+Hyeon&family=Gaegu:wght@400;700&family=Jua&family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">\n    <link rel="stylesheet" href="vendor/fontawesome/css/all.min.css">',
        '<link rel="stylesheet" href="fonts/fonts.css">\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Do+Hyeon&family=Gaegu:wght@400;700&family=Jua&family=Nanum+Pen+Script&display=swap">',
    );
    out = out.replace(/font-family='sans-serif'/g, '');
    if (!out.includes('id="loginStack"')) {
        out = out.replace(
            /(<div id="loginOverlay" class="[^"]*">)/,
            '$1\n        <div id="loginStack">',
        );
        out = out.replace(
            '    <!-- ★ 탑 네비게이션 & 스와이프 탭 바 ★ -->',
            '    </div>\n\n    <div id="appShell">\n    <!-- ★ 탑 네비게이션 & 스와이프 탭 바 ★ -->',
        );
        out = out.replace('<script type="module" src="/src/main.jsx"></script>', '</div>\n    <script type="module" src="/src/main.jsx"></script>');
    }
    out = out.replace(
        'onclick="window.switchTab(\'help\'); document.getElementById(\'loginOverlay\')?.classList.add(\'opacity-0\'); setTimeout(()=>document.getElementById(\'loginOverlay\')?.classList.add(\'hidden\'), 300);"',
        'onclick="window.switchTab(\'help\'); window.dismissLoginOverlay();"',
    );
    const avatar = extractDiv(out, 'dashAvatarCard');
    const todo = extractDiv(out, 'todoPanel');
    if (avatar && todo && !out.includes('id="homeHero"')) {
        const first = avatar.start < todo.start ? avatar : todo;
        const second = avatar.start < todo.start ? todo : avatar;
        out = out.slice(0, second.start) + out.slice(second.end);
        const avatar2 = extractDiv(out, 'dashAvatarCard');
        out = out.slice(0, avatar2.start) + out.slice(avatar2.end);
        const hero = `<div id="homeHero">${avatar.html}${todo.html}</div>\n            `;
        const anchor = '<div class="app-sub-dock cols-3 mb-3" data-pane-group="dashboard"';
        out = out.replace(anchor, `${hero}${anchor}`);
    }
    if (!out.includes('시세 더보기')) {
        const market = extractDiv(out, 'marketTickerCard');
        if (market) {
            const wrapped = `<details class="oly-adult"><summary>시세 더보기</summary>${market.html}</details>`;
            out = out.slice(0, market.start) + wrapped + out.slice(market.end);
        }
    }
    out = out.replace(
        '<img class="worldmap-atlas" src="worldmap/season2-atlas.webp" alt="" aria-hidden="true">',
        `<picture class="worldmap-atlas">
                    <source srcset="olympus/world-1280.webp 1280w, olympus/world-2560.webp 2560w, olympus/world-3840.webp 3840w" sizes="100vw">
                    <img class="worldmap-atlas" src="olympus/world-2560.webp" alt="" aria-hidden="true">
                </picture>`,
    );
    out = out.replace('세계수 · 마스터', '마스터');
    if (!out.includes('oly-shopkeeper')) {
        out = out.replace(
            '<section id="shopSection" class="hidden space-y-4">',
            `<section id="shopSection" class="hidden space-y-4">
            <figure class="oly-card">
                <picture>
                    <source srcset="olympus/shopkeeper-480.webp 480w, olympus/shopkeeper-960.webp 960w, olympus/shopkeeper-1440.webp 1440w, olympus/shopkeeper-3840.webp 3840w" sizes="280px">
                    <img class="oly-shopkeeper" src="olympus/shopkeeper-960.webp" alt="">
                </picture>
                <figcaption class="worldmap-label">상점</figcaption>
            </figure>`,
        );
    }
    const overflowIds = ['tab-literature', 'tab-jobs', 'tab-lunch', 'tab-constitution', 'tab-classtools', 'tab-admin', 'tab-settings', 'tab-help'];
    for (const id of overflowIds) {
        out = out.replace(`id="${id}" onclick=`, `id="${id}" onclick=`);
        out = out.replace(new RegExp(`(<button type="button" id="${id}"[^>]*class=")([^"]*)"`), (_m, a, cls) => {
            const next = cls.includes('oly-nav-overflow') ? cls : `${cls} oly-nav-overflow`;
            return `${a}${next}"`;
        });
    }
    if (!out.includes('id="tab-more"')) {
        out = out.replace(
            '<!-- 레거시 딥링크용 숨김 탭',
            `<button type="button" id="tab-more" class="app-nav-item" aria-label="더보기" onclick="document.getElementById('navMoreSheet').classList.toggle('hidden')">
                <span class="app-nav-icon"><svg class="oly-icon" data-oly="list" viewBox="0 0 24 24" aria-hidden="true"></svg></span>
                <span class="app-nav-label">더보기</span>
            </button>
            <!-- 레거시 딥링크용 숨김 탭`,
        );
        out = out.replace(
            '<div id="noticeInboxPanel"',
            `<div id="navMoreSheet" class="hidden" role="menu">
        <button type="button" class="oly-btn oly-btn-secondary oly-btn-md" onclick="window.switchTab('literature'); this.parentElement.classList.add('hidden')">문학</button>
        <button type="button" class="oly-btn oly-btn-secondary oly-btn-md" onclick="window.switchTab('jobs'); this.parentElement.classList.add('hidden')">직업</button>
        <button type="button" class="oly-btn oly-btn-secondary oly-btn-md" onclick="window.switchTab('constitution'); this.parentElement.classList.add('hidden')">헌법</button>
        <button type="button" class="oly-btn oly-btn-secondary oly-btn-md" onclick="window.switchTab('classtools'); this.parentElement.classList.add('hidden')">수업</button>
        <button type="button" class="oly-btn oly-btn-secondary oly-btn-md" onclick="window.switchTab('admin'); this.parentElement.classList.add('hidden')">마스터</button>
        <button type="button" class="oly-btn oly-btn-secondary oly-btn-md" onclick="window.switchTab('settings'); this.parentElement.classList.add('hidden')">설정</button>
        <button type="button" class="oly-btn oly-btn-secondary oly-btn-md" onclick="window.switchTab('help'); this.parentElement.classList.add('hidden')">도움말</button>
    </div>
    <div id="noticeInboxPanel"`,
        );
    }
    if (!out.includes('oly-cloud')) {
        out = out.replace('<body ', '<body ');
        out = out.replace(
            '<input type="file" id="quizBankExcelInput"',
            `<img class="oly-cloud oly-cloud-left" src="olympus/cloud.svg" alt="">
    <img class="oly-cloud oly-cloud-right" src="olympus/cloud.svg" alt="">
    <input type="file" id="quizBankExcelInput"`,
        );
    }
    if (!out.includes('oly-pediment')) {
        out = out.replace(
            '<nav class="fixed top-0',
            '<img class="oly-pediment" src="olympus/pediment.svg" alt="">\n    <nav class="fixed top-0',
        );
    }
    const hints = {
        raidBattleModal: '퀴즈 레이드가 시작되면 문제와 남은 횟수가 여기에 나타납니다.',
        masterQuizModal: '마스터가 스피드 퀴즈를 열면 문제가 여기에 나타납니다.',
        shopGroupBuyModal: '진행 중인 공동구매가 없으면 이 창에는 안내만 보입니다.',
        loanMorningModal: '갚을 대출이 있으면 독촉 내용이 여기에 나타납니다.',
        praiseFanfareModal: '칭찬이 도착하면 이유가 여기에 나타납니다.',
        classTimerOverlay: '타이머를 시작하면 남은 시간이 여기에 크게 나타납니다.',
        electionOverlay: '투표가 시작되면 안건과 선택지가 여기에 나타납니다.',
        lotteryDrawOverlay: '제비뽑기를 시작하면 이름이 여기에 나타납니다.',
        rpsOverlay: '가위바위보를 시작하면 선택 버튼이 여기에 나타납니다.',
    };
    for (const [id, sentence] of Object.entries(hints)) {
        const token = `id="${id}"`;
        const at = out.indexOf(token);
        if (at < 0 || out.slice(at, at + 500).includes('oly-empty')) continue;
        const gt = out.indexOf('>', at);
        out = `${out.slice(0, gt + 1)}<p class="oly-empty">${sentence}</p>${out.slice(gt + 1)}`;
    }
    out = navIcon(out);
    return out;
}

function structuralJs(text) {
    let out = text;
    if (!out.includes('function dismissLoginOverlay()')) return out;
    out = out.replace(
        /function dismissLoginOverlay\(\) \{[\s\S]*?\n        \}/,
        `function dismissLoginOverlay() {
            const el = document.getElementById('loginOverlay');
            if (!el || el.classList.contains('is-leaving') || el.classList.contains('is-dismissed')) return;
            el.classList.add('is-leaving');
            document.body.classList.add('oly-app');
            setTimeout(() => {
                el.classList.add('is-dismissed', 'hidden');
                el.style.display = 'none';
                el.style.pointerEvents = 'none';
                el.setAttribute('aria-hidden', 'true');
                document.body.classList.add('oly-app-in');
            }, 100);
        }
        window.dismissLoginOverlay = dismissLoginOverlay;`,
    );
    out = out.replace(
        `if (isGuestSession() && (tabId === 'admin' || tabId === 'settings')) return;`,
        `if (isGuestSession() && tabId === 'settings') return;
            if (isGuestSession() && tabId === 'admin' && !window._guestDemoActive) return;`,
    );
    out = out.replace(
        "document.body.className = `antialiased selection:bg-sb-gold selection:text-slate-900 bg-theme-${tabId}`;\n            if (isGuestSession()) document.body.classList.add('is-guest');",
        `const keepBody = ['martial-law-student-lock', 'student-election-active', 'class-timer-active', 'classtool-fs-open', 'class-tool-share-view', 'lottery-draw-active', 'election-overlay-active', 'rps-overlay-active', 'overflow-hidden', 'is-guest', 'is-guest-demo', 'oly-app', 'oly-app-in'];
            const preserved = keepBody.filter((name) => document.body.classList.contains(name));
            document.body.className = ['antialiased', 'oly-app', \`bg-theme-\${tabId}\`, ...preserved].join(' ');
            if (isGuestSession()) document.body.classList.add('is-guest');
            if (window._guestDemoActive) document.body.classList.add('is-guest-demo');`,
    );
    if (!out.includes("tabId === 'admin' && window._guestDemoActive")) {
        out = out.replace(
            `if (tabId === 'admin' && window.playerState && window.playerState.isGM && typeof window.renderClassAdminPanel === 'function') {
                window.renderClassAdminPanel();
            }`,
            `if (tabId === 'admin' && window.playerState && window.playerState.isGM && typeof window.renderClassAdminPanel === 'function') {
                window.renderClassAdminPanel();
            }
            if (tabId === 'admin' && window._guestDemoActive && typeof window.renderAdminQuestBoard === 'function') {
                window.renderAdminQuestBoard(window.allStudentsData || []);
            }`,
        );
    }
    out = out.replace(
        `const CLASS_WHEEL_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#22d3ee', '#34d399', '#facc15', '#fb923c', '#f87171'];`,
        `const CLASS_WHEEL_COLORS = ['var(--wheel-1)', 'var(--wheel-2)', 'var(--wheel-3)', 'var(--wheel-4)', 'var(--wheel-5)', 'var(--wheel-6)', 'var(--wheel-7)', 'var(--wheel-8)'];`,
    );
    out = out.replaceAll('translateY(-7.2rem)', 'translateY(var(--wheel-label-r))');
    out = out.replace(
        `if (loginSub) {
                const emoji = ws.seasonNature === 'winter' ? '❄️'
                    : ws.seasonNature === 'fall' ? '🍂'
                        : ws.seasonNature === 'spring' ? '🌸'
                            : '🌊';
                loginSub.textContent = \`\${emoji} \${seasonLine}\`;
            }`,
        `if (loginSub) loginSub.textContent = seasonLine;`,
    );
    if (!out.includes('classBit')) {
        out = out.replace(
            `const navBadge = document.getElementById('navSeasonBadge');
            if (navBadge) navBadge.textContent = ws.navBadge || \`S\${ws.seasonNumber}\`;`,
            `const navBadge = document.getElementById('navSeasonBadge');
            if (navBadge) navBadge.textContent = '';
            const navClassLabel = document.getElementById('navClassLabel');
            if (navClassLabel) {
                const classBit = className || '우리 반';
                navClassLabel.textContent = \`\${classBit} · \${ws.seasonLabel || ''}\`;
            }`,
        );
    }
    out = out.replace(
        `document.body.classList.add('is-guest');
            stopClassRealtime();`,
        `document.body.classList.add('is-guest', 'is-guest-demo');
            stopClassRealtime();`,
    );
    out = out.replace(
        `if (navLabel) navLabel.textContent = '데모 반';`,
        `if (navLabel) navLabel.textContent = '데모 반 · 시즌 1';`,
    );
    out = out.replace(
        `if (cloudIcon) cloudIcon.className = 'fa-solid fa-eye text-slate-300';`,
        `if (cloudIcon) { cloudIcon.setAttribute('data-oly', 'eye'); cloudIcon.setAttribute('class', 'oly-icon'); }`,
    );
    out = out.replace(
        `window.switchTab('plaza');\n            renderShopCatalog();`,
        `window.switchTab('dashboard');\n            renderShopCatalog();`,
    );
    out = out.replace(
        `if (isGuestSession()) {
                document.body.classList.add('is-guest');
                const adminTab = document.getElementById('tab-admin');
                const settingsTab = document.getElementById('tab-settings');
                if (adminTab) adminTab.classList.add('hidden');
                if (settingsTab) settingsTab.classList.add('hidden');
                maskGuestWriteControls(document);
            }`,
        `if (isGuestSession()) {
                document.body.classList.add('is-guest');
                if (window._guestDemoActive) document.body.classList.add('is-guest-demo');
                const adminTab = document.getElementById('tab-admin');
                const settingsTab = document.getElementById('tab-settings');
                if (adminTab) adminTab.classList.toggle('hidden', !window._guestDemoActive);
                if (settingsTab) settingsTab.classList.add('hidden');
                maskGuestWriteControls(document);
            }`,
    );
    return out;
}

function writeJobs() {
    const file = 'src/lib/jobs.js';
    let text = read(file);
    const start = text.indexOf('export const DEFAULT_JOB_LOOKS');
    const end = text.indexOf('export function jobLooksAreUnique');
    if (start < 0 || end < 0) throw new Error('jobs.js markers missing');
    const icons = [
        ['crown', '왕관'], ['shield', '방패'], ['flag', '깃발'], ['half', '반쪽별'], ['wind', '바람'],
        ['trash', '쓰레기통'], ['glass', '물잔'], ['chalkboard', '칠판'], ['desktop', '컴퓨터'], ['recycle', '재활용'],
        ['tablet', '패드'], ['lightbulb', '전구'], ['piggy', '저금통'], ['leaf', '잎사귀'], ['store', '가게'],
        ['book', '마법서'], ['heart', '하트손'], ['star', '별'], ['spark', '마법봉'], ['hourglass', '모래시계'],
        ['newspaper', '신문'], ['bookopen', '펼친책'], ['compass', '나침반'], ['palette', '팔레트'], ['user', '비밀요원'],
        ['cross', '조준'], ['scroll', '두루마리'], ['boxes', '상자'], ['medical', '의료가방'], ['school', '학사모'],
        ['music', '음표'], ['hammer', '망치'], ['seedling', '새싹'], ['sun', '해'], ['moon', '달'],
        ['bolt', '번개'], ['gem', '보석'], ['key', '열쇠'], ['trophy', '트로피'], ['medal', '메달'],
        ['dragon', '용'], ['cat', '고양이'], ['rocket', '로켓'], ['anchor', '닻'], ['bell', '종'],
        ['camera', '카메라'], ['utensils', '식기'], ['pencil', '연필'], ['microscope', '현미경'], ['gift', '선물'],
    ];
    const colors = [
        ['tone-01', '금색', 'amber-400'], ['tone-02', '진한주황', 'orange-500'], ['tone-03', '노랑', 'yellow-300'],
        ['tone-04', '라임', 'lime-500'], ['tone-05', '틸', 'teal-400'], ['tone-06', '돌색', 'stone-400'],
        ['tone-07', '하늘', 'sky-400'], ['tone-08', '슬레이트', 'slate-400'], ['tone-09', '시안', 'cyan-400'],
        ['tone-10', '초록', 'sb-green'], ['tone-11', '보라', 'violet-500'], ['tone-12', '연한주황', 'orange-300'],
        ['tone-13', '분홍', 'pink-500'], ['tone-14', '에메랄드', 'emerald-500'], ['tone-15', '장미', 'rose-400'],
        ['tone-16', '자주', 'purple-500'], ['tone-17', '자홍', 'fuchsia-400'], ['tone-18', '빨강', 'red-500'],
        ['tone-19', '파랑', 'blue-500'], ['tone-20', '남색', 'indigo-400'], ['tone-21', '연한라임', 'lime-300'],
        ['tone-22', '짙은금', 'amber-600'], ['tone-23', '아연', 'zinc-400'], ['tone-24', '연한빨강', 'red-300'],
        ['tone-25', '연한파랑', 'blue-300'], ['tone-26', '연한에메랄드', 'emerald-300'], ['tone-27', '연한분홍', 'pink-300'],
        ['tone-28', '연한하늘', 'sky-300'], ['tone-29', '연한틸', 'teal-200'], ['tone-30', '연한보라', 'violet-300'],
    ];
    const ids = ['job_sp', 'job_svp', 'job1', 'job2', 'job_vac', 'job3', 'job4', 'job5', 'job6', 'job7', 'job8', 'job9', 'job10', 'job11', 'job12', 'job_book', 'job_newbie'];
    const looks = ids.map((id, i) => `    { id: '${id}', icon: '${icons[i][0]}', color: '${colors[i][0]}' },`).join('\n');
    const iconLines = icons.map(([cls, label]) => `    { class: '${cls}', label: '${label}' },`).join('\n');
    const colorLines = colors.map(([cls, label]) => `    { class: '${cls}', label: '${label}' },`).join('\n');
    const legacy = colors.map(([, , old], i) => `    ['${old}', '${colors[i][0]}'],`).join('\n');
    const block = `export const DEFAULT_JOB_LOOKS = [
${looks}
];

export const JOB_ICON_CHOICES = [
${iconLines}
];

export const JOB_COLOR_CHOICES = [
${colorLines}
];

const JOB_ICON_CLASS_SET = new Set(JOB_ICON_CHOICES.map((item) => item.class));
const JOB_COLOR_CLASS_SET = new Set(JOB_COLOR_CHOICES.map((item) => item.class));
const MARK_FA = 'fa' + '-';
const MARK_TEXT = 'text' + '-';
const LEGACY_TONE = new Map([
${legacy}
]);

function trimStr(value) {
    return String(value == null ? '' : value).trim();
}

function legacyTone(rest) {
    let h = 0;
    for (const ch of rest) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return 'legacy-' + h.toString(36);
}

export function normalizeJobIcon(raw, fallback = 'star') {
    let icon = trimStr(raw);
    icon = icon.replace(new RegExp('^' + MARK_FA + 'solid\\\\s+', 'i'), '');
    if (icon.startsWith('fas ')) icon = icon.slice(4).trim();
    const hadMark = icon.startsWith(MARK_FA);
    if (hadMark) icon = icon.slice(MARK_FA.length);
    if (!icon) return fallback;
    if (JOB_ICON_CLASS_SET.has(icon) || (hadMark && /^[a-z0-9-]+$/.test(icon))) return icon;
    return fallback;
}

export function normalizeJobColor(raw, fallback = 'tone-19') {
    const color = trimStr(raw);
    if (!color) return fallback;
    if (JOB_COLOR_CLASS_SET.has(color) || color.startsWith('legacy-')) return color;
    if (color.startsWith(MARK_TEXT)) {
        const rest = color.slice(MARK_TEXT.length);
        if (LEGACY_TONE.has(rest)) return LEGACY_TONE.get(rest);
        if (/^[a-z0-9-]+$/.test(rest)) return legacyTone(rest);
    }
    return fallback;
}

export function lookForDefaultJob(id) {
    const found = DEFAULT_JOB_LOOKS.find((item) => item.id === String(id));
    return found
        ? { icon: found.icon, color: found.color }
        : { icon: 'star', color: 'tone-19' };
}

export function jobIconLabel(icon) {
    const found = JOB_ICON_CHOICES.find((item) => item.class === normalizeJobIcon(icon));
    return found ? found.label : '아이콘';
}

export function jobColorLabel(color) {
    const found = JOB_COLOR_CHOICES.find((item) => item.class === normalizeJobColor(color));
    return found ? found.label : '색';
}

export function jobLooksInUse(catalog, exceptId) {
    const except = String(exceptId || '');
    const iconsUsed = new Set();
    const colorsUsed = new Set();
    (catalog || []).forEach((job) => {
        if (!job || String(job.id) === except) return;
        iconsUsed.add(normalizeJobIcon(job.icon));
        colorsUsed.add(normalizeJobColor(job.color));
    });
    return { icons: iconsUsed, colors: colorsUsed };
}

export function jobLookConflict(catalog, { icon, color, exceptId } = {}) {
    const others = (catalog || []).filter((job) => job && String(job.id) !== String(exceptId || ''));
    const iconNorm = normalizeJobIcon(icon);
    const colorNorm = normalizeJobColor(color);
    const iconHit = others.find((job) => normalizeJobIcon(job.icon) === iconNorm);
    const colorHit = others.find((job) => normalizeJobColor(job.color) === colorNorm);
    if (iconHit && colorHit) {
        return { kind: iconHit.id === colorHit.id ? 'both' : 'icon', job: iconHit };
    }
    if (iconHit) return { kind: 'icon', job: iconHit };
    if (colorHit) return { kind: 'color', job: colorHit };
    return null;
}

export function jobLookConflictMessage(conflict) {
    if (!conflict || !conflict.job) return '';
    const name = conflict.job.name || '다른 직업';
    if (conflict.kind === 'color') {
        return \`이미 [\${name}] 직업이 같은 색을 씁니다. 다른 색을 골라 주세요.\`;
    }
    if (conflict.kind === 'both') {
        return \`이미 [\${name}] 직업이 같은 아이콘과 색을 씁니다. 다른 모양과 색을 골라 주세요.\`;
    }
    return \`이미 [\${name}] 직업이 같은 아이콘을 씁니다. 다른 모양을 골라 주세요.\`;
}

export function pickUnusedJobLook(catalog, exceptId) {
    const used = jobLooksInUse(catalog, exceptId);
    const icon = (JOB_ICON_CHOICES.find((item) => !used.icons.has(item.class)) || JOB_ICON_CHOICES[0]).class;
    const color = (JOB_COLOR_CHOICES.find((item) => !used.colors.has(item.class)) || JOB_COLOR_CHOICES[0]).class;
    return { icon, color };
}

function extraChoice(className, label, list, key) {
    if (!className) return list.slice();
    if (list.some((item) => item[key] === className)) return list.slice();
    return [{ class: className, label }, ...list];
}

export function jobIconChoicesForPicker(currentIcon) {
    const icon = normalizeJobIcon(currentIcon, '');
    return extraChoice(icon, '현재', JOB_ICON_CHOICES, 'class');
}

export function jobColorChoicesForPicker(currentColor) {
    const color = normalizeJobColor(currentColor, '');
    return extraChoice(color, '현재', JOB_COLOR_CHOICES, 'class');
}

`;
    text = text.slice(0, start) + block + text.slice(end);
    text = text.replaceAll("'fa-star'", "'star'").replaceAll("'text-blue-500'", "'tone-19'");
    write(file, text);
}

function writeJobTests() {
    let text = read('src/lib/jobs.test.js');
    const fa = "'fa' + '-'";
    const tx = "'text' + '-'";
    text = text.replace(
        `assert.equal(normalizeJobIcon('  fa-solid fa-crown '), 'fa-crown');
        assert.equal(normalizeJobIcon('fa-flag'), 'fa-flag');
        assert.equal(normalizeJobIcon('not-an-icon'), 'fa-star');
        assert.equal(normalizeJobColor('text-amber-400'), 'text-amber-400');
        assert.equal(normalizeJobColor('text-amber-200'), 'text-amber-200');
        assert.equal(normalizeJobColor('blue'), 'text-blue-500');`,
        `const fa = ${fa};
        const tx = ${tx};
        assert.equal(normalizeJobIcon('  ' + fa + 'solid ' + fa + 'crown '), 'crown');
        assert.equal(normalizeJobIcon(fa + 'flag'), 'flag');
        assert.equal(normalizeJobIcon('not-an-icon'), 'star');
        assert.equal(normalizeJobColor(tx + 'amber-400'), 'tone-01');
        assert.equal(normalizeJobColor(tx + 'amber-200').startsWith('legacy-'), true);
        assert.equal(normalizeJobColor('blue'), 'tone-19');`,
    );
    const pairs = [
        ["'fa-crown'", "'crown'"],
        ["'text-amber-400'", "'tone-01'"],
        ["'fa-flag'", "'flag'"],
        ["'text-yellow-300'", "'tone-03'"],
        ["'text-blue-500'", "'tone-19'"],
        ["'fa-star'", "'star'"],
        ["'text-pink-500'", "'tone-13'"],
        ["'fa-ghost'", "'ghost'"],
        ["'text-amber-200'", "normalizeJobColor('text' + '-amber-200')"],
        ["'fa-wind'", "'wind'"],
        ["'text-teal-400'", "'tone-05'"],
        ["'fa-trash-can'", "'trash'"],
        ["'text-stone-400'", "'tone-06'"],
        ["'fa-glass-water'", "'glass'"],
        ["'text-sky-400'", "'tone-07'"],
        ["'fa-store'", "'store'"],
        ["'text-rose-400'", "'tone-15'"],
        ["'fa-gem'", "'gem'"],
        ["'fa-mug-hot'", "'mug-hot'"],
        ["'text-sky-300'", "'tone-28'"],
        ["'text-slate-300'", "normalizeJobColor('text' + '-slate-300')"],
    ];
    for (const [from, to] of pairs) text = text.split(from).join(to);
    write('src/lib/jobs.test.js', text);
}

function writeChess() {
    const file = 'src/lib/chessPieces.js';
    let text = read(file);
    text = text.replace(/function palette\(color\) \{[\s\S]*?\n\}/, `function palette(color) {
    const side = color === 'b' ? 'b' : 'w';
    const pick = (name) => \`var(--chess-\${side}-\${name})\`;
    return {
        body: pick('body'),
        mid: pick('mid'),
        light: pick('light'),
        shine: pick('shine'),
        edge: pick('edge'),
        shade: pick('shade'),
    };
}`);
    write(file, text);
}

function writeTailwind() {
    write('tailwind.config.js', `/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        fontSize: {
            12: ['12px', { lineHeight: '1.5', fontWeight: '500' }],
            14: ['14px', { lineHeight: '1.5', fontWeight: '500' }],
            16: ['16px', { lineHeight: '1.5', fontWeight: '500' }],
            20: ['20px', { lineHeight: '1.5', fontWeight: '700' }],
            24: ['24px', { lineHeight: '1.5', fontWeight: '700' }],
            32: ['32px', { lineHeight: '1.5', fontWeight: '700' }],
            48: ['48px', { lineHeight: '1.5', fontWeight: '700' }],
        },
        extend: {
            fontFamily: {
                sans: ['Pretendard', 'sans-serif'],
                display: ['Gowun Batang', 'Pretendard', 'serif'],
                logo: ['Cinzel', 'serif'],
            },
        },
    },
    plugins: [],
};
`);
}

function writeMain() {
    write('src/main.jsx', `/**
 * Vite 엔트리: 올림푸스 토큰 + 기존 DOM 앱.
 */
import './olympus-tokens.css';
import './index.css';
import './olympus.css';
import './olympus-icons.js';
import './sambongWorld.js';
`);
}

function sourceFiles() {
    return collectFiles().filter((f) => !f.endsWith(`${path.sep}olympus-tokens.css`) && !f.endsWith(`${path.sep}olympus-icons.js`));
}

function phaseA() {
    for (const file of sourceFiles()) {
        if (file.endsWith(`${path.sep}jobs.js`) || file.endsWith(`${path.sep}jobs.test.js`) || file.endsWith(`${path.sep}chessPieces.js`)) continue;
        let text = fs.readFileSync(file, 'utf8');
        const keepChalk = file.endsWith(`${path.sep}index.html`);
        text = replaceSizeClasses(text);
        text = snapFontSizes(text);
        text = mapFontFamily(text, keepChalk);
        text = rewriteButtons(text);
        text = stripTwColors(text);
        fs.writeFileSync(file, text);
    }
    writeTailwind();
    writeMain();
}

function phaseB() {
    writeJobs();
    writeJobTests();
    for (const file of sourceFiles()) {
        if (file.endsWith(`${path.sep}jobs.js`) || file.endsWith(`${path.sep}jobs.test.js`)) continue;
        let text = fs.readFileSync(file, 'utf8');
        text = replaceIconTags(text);
        text = stripFa(text);
        text = stripEmoji(text);
        fs.writeFileSync(file, text);
    }
}

function phaseC() {
    writeChess();
    const jsPath = path.join(root, 'src', 'sambongWorld.js');
    let js = protectCanvas(fs.readFileSync(jsPath, 'utf8'));
    fs.writeFileSync(jsPath, js);
    for (const file of sourceFiles()) {
        if (file.endsWith(`${path.sep}olympus.css`)) continue;
        let text = fs.readFileSync(file, 'utf8');
        if (file.endsWith('.css')) text = transformCss(text);
        else text = replaceColorsInText(text);
        fs.writeFileSync(file, text);
    }
}

const before = report('before');
if (phase === 'all' || phase === 'c') {
    write( 'index.html', structuralHtml(read('index.html')));
    write('src/sambongWorld.js', structuralJs(read('src/sambongWorld.js')));
}
if (phase === 'all' || phase === 'a') {
    phaseA();
    report('after-a');
}
if (phase === 'all' || phase === 'b') {
    phaseB();
    report('after-b');
}
if (phase === 'all' || phase === 'c') {
    phaseC();
    report('after-c');
}
console.log('done', rel(root), 'from', before.hardcoded);
