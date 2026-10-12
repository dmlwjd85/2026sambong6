/**
 * 올림푸스 아이콘 시안 생성기.
 * 색은 src/olympus-tokens.css 변수만 씁니다. 앱 화면에는 넣지 않습니다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const iconsJs = readFileSync(join(root, 'src/olympus-icons.js'), 'utf8');

const ICONS = [
    { id: 'shop', label: '상점', motif: '금화 암포라', plate: 'enamel', slot: '경제 · 상점' },
    { id: 'quest', label: '퀘스트', motif: '두루마리', plate: 'marble', slot: '내비 · 퀘스트' },
    { id: 'rank', label: '순위', motif: '월계관과 메달', plate: 'marble', slot: '밥줄 · 급식 순위' },
    { id: 'bank', label: '은행', motif: '신전 금고', plate: 'marble', slot: '경제 · 은행' },
    { id: 'lunch', label: '급식', motif: '암브로시아 그릇', plate: 'enamel', slot: '내비 · 밥줄' },
    { id: 'wheel', label: '룰렛', motif: '운명의 수레바퀴', plate: 'enamel', slot: '수업 · 돌림판' },
    { id: 'home', label: '홈', motif: '페디먼트 신전', plate: 'marble', slot: '내비 · 홈' },
    { id: 'plaza', label: '광장', motif: '열주', plate: 'enamel', slot: '내비 · 광장' },
    { id: 'literature', label: '문학', motif: '올리브 가지', plate: 'marble', slot: '내비 · 문학' },
    { id: 'jobs', label: '직업', motif: '올리브 관', plate: 'marble', slot: '내비 · 직업' },
    { id: 'economy', label: '경제', motif: '날개 신발', plate: 'enamel', slot: '내비 · 경제' },
    { id: 'challenge', label: '도전', motif: '번개', plate: 'enamel', slot: '내비 · 도전' },
    { id: 'constitution', label: '헌법', motif: '법 석비', plate: 'enamel', slot: '내비 · 헌법' },
    { id: 'classtools', label: '수업', motif: '아테나 올빼미', plate: 'enamel', slot: '내비 · 수업' },
    { id: 'admin', label: '마스터', motif: '번개 홀', plate: 'marble', slot: '내비 · 마스터' },
    { id: 'settings', label: '설정', motif: '메안더 열쇠', plate: 'marble', slot: '내비 · 설정' },
    { id: 'help', label: '도움말', motif: '횃불', plate: 'enamel', slot: '내비 · 도움말' },
    { id: 'more', label: '더보기', motif: '세 기둥', plate: 'enamel', slot: '내비 · 더보기' },
    { id: 'estate', label: '부동산', motif: '기둥 저택과 올리브', plate: 'marble', slot: '경제 · 부동산' },
    { id: 'groupbuy', label: '공동구매', motif: '월계수로 묶은 암포라', plate: 'marble', slot: '경제 · 공동구매' },
];

const TAB = ['home', 'plaza', 'quest', 'economy', 'challenge', 'more'];

function leaf(x, y, rot, s = 1) {
    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(1)}) scale(${s})"><ellipse cx="0" cy="0" rx="3.5" ry="7.4" fill="var(--laurel)"/><ellipse cx="-0.9" cy="-1.6" rx="1.3" ry="3.1" fill="var(--surface)" opacity="0.38"/><path d="M0-6.2v12.4" stroke="var(--gold-text)" stroke-width="0.7" opacity="0.55"/></g>`;
}

function olive(x, y, rot = 20) {
    return `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse cx="0" cy="0" rx="3.3" ry="4.4" fill="var(--laurel)"/><ellipse cx="-0.8" cy="-1.1" rx="1.15" ry="1.7" fill="var(--surface)" opacity="0.45"/></g>`;
}

function arcLeaves(a0, a1, n, r, cx, cy, scale = 0.78) {
    let out = '';
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const a = a0 + (a1 - a0) * t;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const rot = (a * 180) / Math.PI + 90;
        out += leaf(x, y, rot, scale);
    }
    return out;
}

function ground(y = 76, rx = 16) {
    return `<ellipse cx="48" cy="${y}" rx="${rx}" ry="3.1" fill="var(--navy)" opacity="0.16"/>`;
}

function amphoraLocal() {
    return `
      <path d="M16 7h16c1.4 0 2 1.1 2 2.4V17c8 3.2 12 10 12 18.2 0 11.2-7.2 18.2-14.2 20.2V60H16.2v-4.6C9.2 53.4 2 46.4 2 35.2 2 27 6 20.2 14 17V9.4C14 8.1 14.6 7 16 7z" fill="url(#METAL)"/>
      <path d="M18 14c-1.2 10-1 22 2 34" fill="none" stroke="var(--gold-rim-hi)" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>
      <path d="M14 18C5 19 1 29 8 35" fill="none" stroke="var(--gold-rim-lo)" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M34 18c9 1 13 11 6 17" fill="none" stroke="var(--gold-rim-lo)" stroke-width="3.2" stroke-linecap="round"/>
      <ellipse cx="24" cy="8.2" rx="9" ry="2.5" fill="var(--gold-rim-hi)"/>
      <ellipse cx="24" cy="7.4" rx="5" ry="1.2" fill="var(--surface)" opacity="0.55"/>
    `;
}

function amphora(tx, ty, sc) {
    return `<g transform="translate(${tx} ${ty}) scale(${sc})">${amphoraLocal()}</g>`;
}

function coin(cx, cy, r) {
    return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#METAL)"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.68).toFixed(2)}" fill="none" stroke="var(--gold-text)" stroke-width="${Math.max(1, r * 0.12).toFixed(2)}"/><ellipse cx="${cx - r * 0.28}" cy="${cy - r * 0.32}" rx="${r * 0.28}" ry="${r * 0.18}" fill="var(--surface)" opacity="0.7"/></g>`;
}

function column(x, y, w, h) {
    const cap = w + 4;
    return `<rect x="${x - 2}" y="${y}" width="${cap}" height="4" rx="1" fill="var(--gold)"/><rect x="${x}" y="${y + 4}" width="${w}" height="${h - 8}" rx="1" fill="var(--marble)" stroke="var(--gold-text)" stroke-width="0.8"/><rect x="${x - 2}" y="${y + h - 4}" width="${cap}" height="4" rx="1" fill="var(--gold-rim-lo)"/>`;
}

function pediment(x1, y1, cx, top, x2) {
    return `<path d="M${x1} ${y1} L${cx} ${top} L${x2} ${y1} Z" fill="var(--navy)"/><path d="M${x1 + 6} ${y1 - 2} L${cx} ${top + 7} L${x2 - 6} ${y1 - 2} Z" fill="var(--sky)"/><circle cx="${cx}" cy="${top + 1}" r="2.6" fill="var(--gold-rim-hi)"/>`;
}

function bolt(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M22 0 0 28h14L8 52 36 22H20L26 0Z" fill="url(#METAL)"/><path d="M18 6 8 24h8" fill="none" stroke="var(--gold-rim-hi)" stroke-width="2" stroke-linecap="round"/></g>`;
}

const FULL = {
    shop: () => `${ground(78, 18)}${amphora(26, 14, 0.92)}${coin(66, 24, 9)}${coin(74, 36, 6.5)}${coin(58, 34, 5.5)}`,
    quest: () => `
      ${ground(74, 18)}
      <rect x="28" y="28" width="40" height="38" rx="2" fill="var(--gold-light)"/>
      <rect x="28" y="28" width="40" height="38" rx="2" fill="var(--surface)" opacity="0.35"/>
      <path d="M36 40h24M36 48h24M36 56h16" stroke="var(--gold-text)" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="28" cy="47" rx="7" ry="21" fill="url(#METAL)"/>
      <ellipse cx="28" cy="47" rx="2.6" ry="16" fill="var(--gold-rim-lo)"/>
      <ellipse cx="68" cy="47" rx="7" ry="21" fill="url(#METAL)"/>
      <ellipse cx="68" cy="47" rx="2.6" ry="16" fill="var(--gold-text)" opacity="0.45"/>
      <path d="M34 32h28" stroke="var(--surface)" stroke-width="2" opacity="0.7" stroke-linecap="round"/>
    `,
    rank: () => `
      ${arcLeaves(2.2, 4.15, 8, 24, 48, 44, 0.7)}
      ${arcLeaves(0.94, -1.0, 8, 24, 48, 44, 0.7)}
      <circle cx="48" cy="44" r="13" fill="url(#METAL)"/>
      <circle cx="48" cy="44" r="8.5" fill="none" stroke="var(--gold-text)" stroke-width="1.6"/>
      <ellipse cx="44" cy="40" rx="3.4" ry="2.1" fill="var(--surface)" opacity="0.8"/>
      <path d="M38 62l-8 12h8l4-7 4 7h8l-8-12z" fill="var(--wine)"/>
      <path d="M42 64h12" stroke="var(--gold-rim-hi)" stroke-width="1.4" opacity="0.7"/>
    `,
    bank: () => `
      ${ground(78, 16)}
      <circle cx="48" cy="54" r="18" fill="var(--navy)"/>
      <circle cx="48" cy="54" r="14.5" fill="none" stroke="url(#METAL)" stroke-width="3.5"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x = 48 + Math.cos(a) * 14.5;
        const y = 54 + Math.sin(a) * 14.5;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7" fill="var(--gold-rim-hi)"/>`;
    }).join('')}
      <circle cx="48" cy="54" r="4.2" fill="var(--gold)"/>
      <rect x="46.2" y="48" width="3.6" height="12" rx="1.2" fill="var(--gold-rim-hi)"/>
      ${pediment(30, 36, 48, 18, 66)}
      ${column(33, 30, 5, 16)}
      ${column(58, 30, 5, 16)}
    `,
    lunch: () => `
      ${ground(76, 18)}
      <path d="M20 50c-8 1-10 8-3 11" fill="none" stroke="var(--gold-rim-lo)" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M76 50c8 1 10 8 3 11" fill="none" stroke="var(--gold-rim-lo)" stroke-width="3.4" stroke-linecap="round"/>
      <ellipse cx="48" cy="54" rx="26" ry="13" fill="url(#METAL)"/>
      <ellipse cx="48" cy="50" rx="20" ry="7.5" fill="var(--gold-light)"/>
      <ellipse cx="41" cy="48" rx="7" ry="2.4" fill="var(--surface)" opacity="0.72"/>
      <rect x="44" y="64" width="8" height="7" fill="var(--gold)"/>
      <ellipse cx="48" cy="72" rx="12" ry="3.2" fill="var(--gold-rim-lo)"/>
      ${leaf(62, 40, 28, 0.62)}
      <path d="M34 36c1 4 .4 6 .4 6M42 33c1 5 .4 7 .4 7M50 36c1 4 .4 6 .4 6" fill="none" stroke="var(--surface)" stroke-width="1.4" stroke-linecap="round" opacity="0.85"/>
    `,
    wheel: () => {
        const colors = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--wheel-${n})`);
        const cx = 48;
        const cy = 52;
        const r1 = 24;
        const r0 = 8;
        let wedges = '';
        for (let i = 0; i < 8; i++) {
            const a0 = -Math.PI / 2 + (i * Math.PI) / 4;
            const a1 = a0 + Math.PI / 4;
            const p = (r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
            const [x0, y0] = p(r1, a0);
            const [x1, y1] = p(r1, a1);
            const [x2, y2] = p(r0, a1);
            const [x3, y3] = p(r0, a0);
            wedges += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${r1} ${r1} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${r0} ${r0} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z" fill="${colors[i]}"/>`;
        }
        return `
          <path d="M48 12l7 11H41z" fill="var(--wine)"/>
          ${wedges}
          <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="url(#METAL)" stroke-width="4"/>
          <circle cx="${cx}" cy="${cy}" r="8" fill="url(#METAL)"/>
          <circle cx="${cx}" cy="${cy}" r="3.2" fill="var(--navy)"/>
          <ellipse cx="40" cy="44" rx="6" ry="3" fill="var(--surface)" opacity="0.28"/>
        `;
    },
    home: () => `
      ${ground(78, 20)}
      <rect x="20" y="70" width="56" height="5" rx="1" fill="var(--gold-rim-lo)"/>
      <rect x="24" y="66" width="48" height="5" rx="1" fill="var(--marble)" stroke="var(--gold-text)" stroke-width="0.6"/>
      ${column(28, 40, 6, 26)}
      ${column(40, 40, 6, 26)}
      ${column(52, 40, 6, 26)}
      ${column(64, 40, 6, 26)}
      ${pediment(18, 42, 48, 16, 78)}
      <rect x="44" y="52" width="8" height="14" rx="1" fill="var(--navy)"/>
    `,
    plaza: () => `
      <circle cx="70" cy="26" r="7" fill="var(--gold-light)"/>
      <circle cx="67" cy="24" r="2.4" fill="var(--surface)" opacity="0.8"/>
      <rect x="22" y="34" width="52" height="6" rx="1" fill="var(--marble)" stroke="var(--gold)" stroke-width="1"/>
      ${column(26, 40, 8, 32)}
      ${column(44, 40, 8, 32)}
      ${column(62, 40, 8, 32)}
      <rect x="20" y="72" width="56" height="5" rx="1" fill="var(--gold-rim-lo)"/>
    `,
    literature: () => {
        const p0 = { x: 22, y: 70 };
        const p1 = { x: 40, y: 28 };
        const p2 = { x: 76, y: 22 };
        const q = (t) => {
            const u = 1 - t;
            return {
                x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
                y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
            };
        };
        const ang = (t) => {
            const u = 1 - t;
            const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
            const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
            return (Math.atan2(dy, dx) * 180) / Math.PI;
        };
        let leaves = '';
        for (let i = 0; i < 7; i++) {
            const t = 0.12 + i * 0.12;
            const pt = q(t);
            const side = i % 2 === 0 ? 70 : -70;
            leaves += leaf(pt.x, pt.y, ang(t) + side, 0.72);
        }
        const o1 = q(0.28);
        const o2 = q(0.55);
        const o3 = q(0.78);
        return `<path d="M22 70C40 28 52 30 76 22" fill="none" stroke="var(--gold-rim-lo)" stroke-width="3.2" stroke-linecap="round"/>${leaves}${olive(o1.x + 2, o1.y + 6, 15)}${olive(o2.x - 2, o2.y + 7, -10)}${olive(o3.x + 1, o3.y + 6, 25)}`;
    },
    jobs: () => {
        let leaves = '';
        for (let i = 0; i < 9; i++) {
            const a = Math.PI + (i / 8) * Math.PI;
            const x = 48 + Math.cos(a) * 22;
            const y = 50 + Math.sin(a) * 18;
            leaves += leaf(x, y, (a * 180) / Math.PI + 90, 0.78);
        }
        return `${leaves}<path d="M28 58q20 12 40 0" fill="none" stroke="url(#METAL)" stroke-width="5" stroke-linecap="round"/><path d="M32 56q16 8 32 0" fill="none" stroke="var(--gold-rim-hi)" stroke-width="1.6" opacity="0.8"/>`;
    },
    economy: () => `
      <g transform="translate(22 36) rotate(-32)">
        <ellipse cx="0" cy="0" rx="6.5" ry="13" fill="var(--surface)" stroke="var(--sky-deep)" stroke-width="1.3"/>
        <ellipse cx="7" cy="2" rx="5" ry="10" fill="var(--marble)" stroke="var(--sky-deep)" stroke-width="1.1"/>
        <path d="M0-11v22M7-7v16" stroke="var(--sky-deep)" stroke-width="0.8" opacity="0.55"/>
      </g>
      <path d="M24 60c8-18 24-24 40-18 12 3 18 10 18 16 0 5-6 8-14 7H30c-6 0-8-2-6-5z" fill="url(#METAL)"/>
      <path d="M34 52c10-8 22-8 30 0" fill="none" stroke="var(--gold-rim-lo)" stroke-width="3" stroke-linecap="round"/>
      <path d="M32 62c14-8 28-6 40 2" fill="none" stroke="var(--gold-rim-hi)" stroke-width="1.8" stroke-linecap="round"/>
      ${ground(74, 18)}
    `,
    challenge: () => `
      <ellipse cx="46" cy="28" rx="16" ry="8" fill="var(--navy)" opacity="0.18"/>
      ${bolt(30, 18, 1.15)}
    `,
    constitution: () => `
      ${pediment(30, 28, 48, 14, 66)}
      <rect x="32" y="26" width="32" height="52" rx="3" fill="var(--marble)" stroke="var(--gold)" stroke-width="1.4"/>
      <path d="M38 38h20M38 46h20M38 54h14" stroke="var(--gold-text)" stroke-width="2.3" stroke-linecap="round"/>
      <path d="M40 62h6v4h-4v4h6M52 62h6v4h-4v4" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round"/>
    `,
    classtools: () => `
      ${ground(76, 14)}
      <path d="M30 72h36" stroke="var(--laurel)" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="48" cy="58" rx="16" ry="13" fill="var(--navy)"/>
      <ellipse cx="48" cy="60" rx="9" ry="8" fill="var(--sky-deep)"/>
      <circle cx="48" cy="40" r="14" fill="var(--navy)"/>
      <path d="M36 30l5 7M60 30l-5 7" stroke="var(--gold-rim-hi)" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="42" cy="40" r="5" fill="var(--gold-light)"/>
      <circle cx="54" cy="40" r="5" fill="var(--gold-light)"/>
      <circle cx="43.2" cy="40.4" r="2.2" fill="var(--ink)"/>
      <circle cx="55.2" cy="40.4" r="2.2" fill="var(--ink)"/>
      <circle cx="42.4" cy="39.4" r="0.8" fill="var(--surface)"/>
      <circle cx="54.4" cy="39.4" r="0.8" fill="var(--surface)"/>
      <path d="M48 43l-3.2 5h6.4z" fill="var(--gold)"/>
      <ellipse cx="33" cy="56" rx="6" ry="10" fill="var(--sky-deep)"/>
      <ellipse cx="63" cy="56" rx="6" ry="10" fill="var(--sky-deep)"/>
      <path d="M42 70h4M52 70h4" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"/>
    `,
    admin: () => `
      <rect x="44" y="30" width="8" height="46" rx="3" fill="url(#METAL)"/>
      <path d="M46 36v34" stroke="var(--gold-rim-hi)" stroke-width="1.5" opacity="0.75" stroke-linecap="round"/>
      <circle cx="48" cy="28" r="6" fill="var(--gold-light)" stroke="var(--gold-rim-lo)" stroke-width="1.4"/>
      ${bolt(36, 8, 0.62)}
    `,
    settings: () => `
      <circle cx="34" cy="48" r="14" fill="none" stroke="url(#METAL)" stroke-width="6"/>
      <circle cx="34" cy="48" r="5" fill="var(--navy)"/>
      <path d="M34 40v3M34 53v3M26 48h3M39 48h3" stroke="var(--gold-rim-hi)" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="46" y="44" width="30" height="8" rx="2" fill="url(#METAL)"/>
      <path d="M48 46h24" stroke="var(--gold-rim-hi)" stroke-width="1.3" opacity="0.8"/>
      <rect x="62" y="52" width="5" height="8" rx="1" fill="url(#METAL)"/>
      <rect x="70" y="52" width="5" height="6" rx="1" fill="url(#METAL)"/>
    `,
    help: () => `
      ${ground(78, 10)}
      <rect x="44" y="42" width="8" height="32" rx="2" fill="var(--gold-rim-lo)"/>
      <path d="M36 40h24v7H36z" fill="url(#METAL)"/>
      <path d="M48 40c10-4 14-16 2-24-2 7-7 9-9 8 3-9-2-16-8-18 3 9-1 15 3 19-8 2-12 9-4 15z" fill="url(#METAL)"/>
      <ellipse cx="45" cy="24" rx="3.4" ry="6" fill="var(--gold-light)" opacity="0.95"/>
    `,
    more: () => `
      ${column(30, 42, 7, 22)}
      ${column(44, 42, 7, 22)}
      ${column(58, 42, 7, 22)}
      <rect x="24" y="66" width="48" height="5" rx="1" fill="var(--gold-rim-lo)"/>
    `,
    estate: () => `
      ${ground(78, 20)}
      <rect x="16" y="70" width="46" height="5" rx="1" fill="var(--gold-rim-lo)"/>
      <rect x="18" y="66" width="40" height="5" rx="1" fill="var(--marble)"/>
      ${column(24, 42, 6, 24)}
      ${column(42, 42, 6, 24)}
      ${pediment(16, 44, 38, 20, 60)}
      <rect x="34" y="52" width="8" height="14" rx="1" fill="var(--navy)"/>
      <path d="M68 74V58" stroke="var(--gold-rim-lo)" stroke-width="2.4" stroke-linecap="round"/>
      ${leaf(64, 52, -20, 0.7)}
      ${leaf(74, 50, 30, 0.62)}
      ${olive(70, 44, 10)}
    `,
    groupbuy: () => `
      ${ground(78, 20)}
      ${amphora(10, 30, 0.58)}
      ${amphora(44, 30, 0.58)}
      <path d="M16 48h64" stroke="var(--wine)" stroke-width="5" stroke-linecap="round"/>
      <path d="M18 48h60" stroke="var(--gold-rim-hi)" stroke-width="1.4" opacity="0.7"/>
      <ellipse cx="48" cy="48" rx="4.2" ry="3.2" fill="var(--wine)"/>
      <ellipse cx="46.4" cy="47" rx="1.3" ry="0.8" fill="var(--gold-rim-hi)" opacity="0.75"/>
      ${leaf(18, 42, -46, 0.48)}
      ${leaf(78, 42, 46, 0.48)}
    `,
};

const SIMPLE = {
    shop: () => `<path d="M8.2 6.2h5.2c.4 0 .7.4.7.8v2.2c2.4 1 3.6 2.8 3.6 5.2 0 3.2-2 5.4-4 6v1.4H8.4v-1.4c-2-.6-4-2.8-4-6 0-2.4 1.2-4.2 3.6-5.2V7c0-.4.3-.8.8-.8z" fill="url(#METAL)"/><path d="M8 9.2C6.2 10 5.4 12.2 6.6 14M14.2 9.2c1.8.8 2.6 3 1.4 4.8" fill="none" stroke="var(--gold-rim-lo)" stroke-width="1.3" stroke-linecap="round"/>${coin(16.4, 7.2, 2.3)}`,
    quest: () => `<rect x="6.5" y="6.2" width="11" height="11.2" rx="0.8" fill="var(--gold-light)"/><path d="M8.2 9.4h7.4M8.2 12h7.4" stroke="var(--gold-text)" stroke-width="1.1" stroke-linecap="round"/><ellipse cx="6.4" cy="11.8" rx="1.7" ry="4.6" fill="url(#METAL)"/><ellipse cx="17.6" cy="11.8" rx="1.7" ry="4.6" fill="url(#METAL)"/>`,
    rank: () => `<path d="M7.2 16.2c-2.4-2.2-2.6-6.2 0-8.6" fill="none" stroke="var(--laurel)" stroke-width="2" stroke-linecap="round"/><path d="M16.8 16.2c2.4-2.2 2.6-6.2 0-8.6" fill="none" stroke="var(--laurel)" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="11.2" r="3.1" fill="url(#METAL)"/><path d="M10.2 15.2l-1.6 2.6h1.6l1 1.2 1-1.2h1.6l-1.6-2.6z" fill="var(--wine)"/>`,
    bank: () => `<path d="M5.4 10.6 12 5.2l6.6 5.4z" fill="var(--navy)"/><rect x="6.6" y="10.2" width="1.8" height="4" fill="var(--marble)"/><rect x="15.6" y="10.2" width="1.8" height="4" fill="var(--marble)"/><circle cx="12" cy="15" r="3.5" fill="var(--navy)"/><circle cx="12" cy="15" r="2.2" fill="none" stroke="var(--gold)" stroke-width="1.1"/><circle cx="12" cy="15" r="0.9" fill="var(--gold-rim-hi)"/>`,
    lunch: () => `<ellipse cx="12" cy="13.2" rx="6.4" ry="3.2" fill="url(#METAL)"/><ellipse cx="12" cy="12.2" rx="4.6" ry="1.7" fill="var(--gold-light)"/><rect x="10.6" y="15.6" width="2.8" height="2.2" fill="var(--gold)"/><ellipse cx="12" cy="18" rx="3.2" ry="1" fill="var(--gold-rim-lo)"/>`,
    wheel: () => `<path d="M12 4.5 13.6 7.1H10.4z" fill="var(--wine)"/><path d="M12 8a5.2 5.2 0 0 1 5.2 5.2H12Z" fill="var(--gold-light)"/><path d="M17.2 13.2A5.2 5.2 0 0 1 12 18.4V13.2Z" fill="var(--laurel)"/><path d="M12 18.4A5.2 5.2 0 0 1 6.8 13.2H12Z" fill="var(--wine)"/><path d="M6.8 13.2A5.2 5.2 0 0 1 12 8V13.2Z" fill="var(--sky)"/><circle cx="12" cy="13.2" r="5.2" fill="none" stroke="url(#METAL)" stroke-width="1.45"/><circle cx="12" cy="13.2" r="1.7" fill="url(#METAL)"/>`,
    home: () => `<path d="M4.8 11.2 12 5.2l7.2 6z" fill="var(--navy)"/><rect x="6.2" y="11" width="2" height="6.2" fill="var(--marble)"/><rect x="10.8" y="11" width="2.2" height="6.2" fill="var(--marble)"/><rect x="15.4" y="11" width="2" height="6.2" fill="var(--marble)"/><rect x="5.2" y="17.4" width="13.6" height="1.6" rx="0.4" fill="var(--gold-rim-lo)"/>`,
    plaza: () => `<circle cx="17" cy="6.4" r="2" fill="var(--gold-light)"/><rect x="5" y="8.2" width="14" height="1.8" rx="0.4" fill="var(--marble)"/><rect x="6" y="10" width="2.2" height="7" fill="var(--marble)"/><rect x="10.9" y="10" width="2.2" height="7" fill="var(--marble)"/><rect x="15.8" y="10" width="2.2" height="7" fill="var(--marble)"/><rect x="5" y="17.2" width="14" height="1.5" fill="var(--gold)"/>`,
    literature: () => `<path d="M5 18C9 10 13 8 19 6" fill="none" stroke="var(--gold-rim-lo)" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="8" cy="12" rx="1.6" ry="3" transform="rotate(-30 8 12)" fill="var(--laurel)"/><ellipse cx="12" cy="9.5" rx="1.6" ry="3" transform="rotate(20 12 9.5)" fill="var(--laurel)"/><ellipse cx="16" cy="8" rx="1.5" ry="2.8" transform="rotate(-20 16 8)" fill="var(--laurel)"/><ellipse cx="14.5" cy="13" rx="1.5" ry="2" fill="var(--laurel)"/>`,
    jobs: () => `<path d="M5 14c2.2-5 11.6-5 14 0" fill="none" stroke="var(--laurel)" stroke-width="2.4" stroke-linecap="round"/><path d="M6.5 13c2-3.6 8.8-3.6 11 0" fill="none" stroke="var(--laurel)" stroke-width="1.6" stroke-linecap="round"/><path d="M7 15.5q5 3 10 0" fill="none" stroke="url(#METAL)" stroke-width="1.8" stroke-linecap="round"/>`,
    economy: () => `<ellipse cx="7.2" cy="8.5" rx="2.2" ry="3.6" transform="rotate(-30 7.2 8.5)" fill="var(--surface)" stroke="var(--sky-deep)" stroke-width="0.7"/><path d="M5 15.5c2.4-4.6 6.4-6 10.2-4.6 2.6.8 4.2 2.6 4.4 4.2H6.2c-.8 0-1.4-.4-1.2-1z" fill="url(#METAL)"/>`,
    challenge: () => `<path d="M13.2 4.2 6.2 12.2h4.2L8.8 19.8 17.6 10.2h-4.4z" fill="url(#METAL)"/>`,
    constitution: () => `<path d="M6.2 8.2 12 4.4l5.8 3.8z" fill="var(--navy)"/><rect x="7" y="8" width="10" height="11.2" rx="1" fill="var(--marble)" stroke="var(--gold)" stroke-width="0.7"/><path d="M8.6 11.2h6.8M8.6 13.6h6.8M8.6 16h4.4" stroke="var(--gold-text)" stroke-width="1.1" stroke-linecap="round"/>`,
    classtools: () => `<circle cx="12" cy="9.2" r="3.6" fill="var(--navy)"/><circle cx="10.6" cy="9" r="1.3" fill="var(--gold-light)"/><circle cx="13.4" cy="9" r="1.3" fill="var(--gold-light)"/><circle cx="10.8" cy="9.1" r="0.55" fill="var(--ink)"/><circle cx="13.6" cy="9.1" r="0.55" fill="var(--ink)"/><path d="M12 10.2l-.8 1.3h1.6z" fill="var(--gold)"/><ellipse cx="12" cy="15.2" rx="4" ry="3.2" fill="var(--navy)"/>`,
    admin: () => `<rect x="10.6" y="8.4" width="2.8" height="10" rx="1" fill="url(#METAL)"/><circle cx="12" cy="7.6" r="1.8" fill="var(--gold-light)"/><path d="M13.4 3.2 11 6.4h1.6L11.8 9.2 15.4 5.4h-1.6z" fill="var(--gold-rim-hi)"/>`,
    settings: () => `<circle cx="8.2" cy="12" r="3.6" fill="none" stroke="url(#METAL)" stroke-width="2"/><circle cx="8.2" cy="12" r="1.3" fill="var(--navy)"/><rect x="11.2" y="10.6" width="8.2" height="2.8" rx="0.6" fill="url(#METAL)"/><rect x="16.2" y="13.4" width="1.6" height="2.4" fill="url(#METAL)"/><rect x="18.4" y="13.4" width="1.5" height="1.8" fill="url(#METAL)"/>`,
    help: () => `<rect x="10.8" y="11" width="2.4" height="7" rx="0.6" fill="var(--gold-rim-lo)"/><path d="M8.4 10.4h7.2v2H8.4z" fill="url(#METAL)"/><path d="M12 10.6c2.6-.6 3.6-3.6.6-5.4-.4 1.6-1.6 2-2 .8.6-2-.4-3.4-1.6-3.6.6 1.8 0 3 .8 3.8-1.8.4-2.6 1.8-1 3.4z" fill="url(#METAL)"/>`,
    more: () => `<rect x="5.2" y="8.2" width="2.4" height="8.2" fill="var(--marble)" stroke="var(--gold)" stroke-width="0.6"/><rect x="10.8" y="8.2" width="2.4" height="8.2" fill="var(--marble)" stroke="var(--gold)" stroke-width="0.6"/><rect x="16.4" y="8.2" width="2.4" height="8.2" fill="var(--marble)" stroke="var(--gold)" stroke-width="0.6"/><rect x="4.6" y="16.6" width="14.8" height="1.6" rx="0.4" fill="var(--gold-rim-lo)"/>`,
    estate: () => `<path d="M3.6 11.4 9.2 6.2l5.6 5.2z" fill="var(--navy)"/><rect x="5" y="11.2" width="1.8" height="5.4" fill="var(--marble)"/><rect x="11.2" y="11.2" width="1.8" height="5.4" fill="var(--marble)"/><rect x="4.2" y="16.8" width="10" height="1.5" fill="var(--gold)"/><ellipse cx="18" cy="12.4" rx="2.2" ry="2.8" fill="var(--laurel)"/><path d="M18 14.6v3.2" stroke="var(--gold-rim-lo)" stroke-width="1"/>`,
    groupbuy: () => `<path d="M4.6 8.2h3.2v1.2c1.2.4 1.8 1.4 1.8 2.6S8.8 14.6 7.8 15v.8H4.4V15c-1-.4-2.2-1.4-2.2-2.6s.8-2.2 2-2.6V8.2z" fill="url(#METAL)"/><path d="M13.2 8.2h3.2v1.2c1.2.4 1.8 1.4 1.8 2.6s-1 2.6-2 3v.8h-3.4V15c-1-.4-2.2-1.4-2.2-2.6s.8-2.2 2-2.6V8.2z" fill="url(#METAL)"/><path d="M3.4 14.8h17" stroke="var(--wine)" stroke-width="1.6" stroke-linecap="round"/>`,
};

function defs(prefix, plate) {
    const enamel = plate === 'enamel';
    return `<defs>
    <linearGradient id="${prefix}rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--gold-rim-hi)"/>
      <stop offset="0.46" stop-color="var(--gold)"/>
      <stop offset="1" stop-color="var(--gold-rim-lo)"/>
    </linearGradient>
    <linearGradient id="${prefix}metal" x1="0.15" y1="0.05" x2="0.9" y2="1">
      <stop offset="0" stop-color="var(--gold-rim-hi)"/>
      <stop offset="0.42" stop-color="var(--gold)"/>
      <stop offset="1" stop-color="var(--gold-rim-lo)"/>
    </linearGradient>
    <radialGradient id="${prefix}enamel" cx="0.32" cy="0.24" r="0.85">
      <stop offset="0" stop-color="var(--sky)"/>
      <stop offset="1" stop-color="var(--sky-deep)"/>
    </radialGradient>
    <linearGradient id="${prefix}marble" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--surface)"/>
      <stop offset="0.45" stop-color="var(--marble)"/>
      <stop offset="1" stop-color="var(--marble)"/>
    </linearGradient>
    <filter id="${prefix}emboss" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1.2" dy="1.6" stdDeviation="0.45" flood-color="var(--navy)" flood-opacity="0.35"/>
    </filter>
    <filter id="${prefix}glow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="0" stdDeviation="3.2" flood-color="var(--gold-rim-hi)" flood-opacity="0.95"/>
      <feDropShadow dx="0" dy="0" stdDeviation="1.2" flood-color="var(--gold)" flood-opacity="1"/>
    </filter>
    <clipPath id="${prefix}clip"><rect id="${prefix}cliprect" width="10" height="10" rx="4"/></clipPath>
  </defs>`.replaceAll('url(#METAL)', `url(#${prefix}metal)`).replace(enamel ? '___' : '___', '___');
}

function paintMotif(raw, prefix) {
    return raw.replaceAll('url(#METAL)', `url(#${prefix}metal)`);
}

function frame(prefix, plate, box) {
    const { x, y, w, h, rx } = box.outer;
    const inner = box.inner;
    const plateFill = plate === 'enamel' ? `url(#${prefix}enamel)` : `url(#${prefix}marble)`;
    const veins = plate === 'marble'
        ? `<g fill="none" stroke-linecap="round" opacity="0.9">
            <path d="M${inner.x + inner.w * 0.08} ${inner.y + inner.h * 0.22}C${inner.x + inner.w * 0.35} ${inner.y + inner.h * 0.3},${inner.x + inner.w * 0.22} ${inner.y + inner.h * 0.55},${inner.x + inner.w * 0.55} ${inner.y + inner.h * 0.78}" stroke="var(--surface)" stroke-width="${(inner.w * 0.07).toFixed(2)}"/>
            <path d="M${inner.x + inner.w * 0.12} ${inner.y + inner.h * 0.62}C${inner.x + inner.w * 0.4} ${inner.y + inner.h * 0.5},${inner.x + inner.w * 0.62} ${inner.y + inner.h * 0.84},${inner.x + inner.w * 0.9} ${inner.y + inner.h * 0.7}" stroke="var(--ink)" stroke-width="${(inner.w * 0.025).toFixed(2)}" opacity="0.18"/>
            <path d="M${inner.x + inner.w * 0.4} ${inner.y + inner.h * 0.12}C${inner.x + inner.w * 0.7} ${inner.y + inner.h * 0.28},${inner.x + inner.w * 0.5} ${inner.y + inner.h * 0.2},${inner.x + inner.w * 0.86} ${inner.y + inner.h * 0.36}" stroke="var(--gold-text)" stroke-width="${(inner.w * 0.018).toFixed(2)}" opacity="0.28"/>
          </g>`
        : `<ellipse cx="${inner.x + inner.w * 0.36}" cy="${inner.y + inner.h * 0.28}" rx="${inner.w * 0.28}" ry="${inner.h * 0.16}" fill="var(--surface)" opacity="0.38"/>
           <ellipse cx="${inner.x + inner.w * 0.62}" cy="${inner.y + inner.h * 0.78}" rx="${inner.w * 0.32}" ry="${inner.h * 0.12}" fill="var(--navy)" opacity="0.18"/>`;
    const lip = `
      <path d="M${inner.x + inner.w * 0.16} ${inner.y + inner.h * 0.08}H${inner.x + inner.w * 0.78}" stroke="var(--surface)" stroke-width="${(inner.w * 0.035).toFixed(2)}" stroke-linecap="round" opacity="0.8"/>
      <path d="M${inner.x + inner.w * 0.08} ${inner.y + inner.h * 0.2}V${inner.y + inner.h * 0.72}" stroke="var(--surface)" stroke-width="${(inner.w * 0.028).toFixed(2)}" stroke-linecap="round" opacity="0.45"/>
      <path d="M${inner.x + inner.w * 0.18} ${inner.y + inner.h * 0.9}H${inner.x + inner.w * 0.86}" stroke="var(--navy)" stroke-width="${(inner.w * 0.04).toFixed(2)}" stroke-linecap="round" opacity="0.22"/>
      <path d="M${inner.x + inner.w * 0.9} ${inner.y + inner.h * 0.22}V${inner.y + inner.h * 0.82}" stroke="var(--navy)" stroke-width="${(inner.w * 0.03).toFixed(2)}" stroke-linecap="round" opacity="0.16"/>
    `;
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#${prefix}rim)"/>
      <rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" rx="${inner.rx}" fill="${plateFill}"/>
      <g clip-path="url(#${prefix}clip)">${veins}${lip}</g>
    `;
}

function boxes(detail) {
    if (detail === 'simple') {
        return {
            view: 24,
            outer: { x: 0.5, y: 0.5, w: 23, h: 23, rx: 5.5 },
            inner: { x: 1.75, y: 1.75, w: 20.5, h: 20.5, rx: 4.25 },
        };
    }
    return {
        view: 96,
        outer: { x: 2, y: 2, w: 92, h: 92, rx: 22 },
        inner: { x: 7, y: 7, w: 82, h: 82, rx: 17 },
    };
}

function iconMarkup(icon, opts) {
    const detail = opts.detail || 'full';
    const prefix = opts.prefix || 'i';
    const box = boxes(detail);
    const selected = !!opts.selected;
    const bleed = opts.bleed ? box.view * 0.12 : 0;
    const view = box.view + bleed * 2;
    const origin = -bleed;
    const motif = detail === 'simple' ? SIMPLE[icon.id]() : FULL[icon.id]();
    const clip = box.inner;
    const glowOpen = selected ? `<g filter="url(#${prefix}glow)">` : '';
    const glowClose = selected ? '</g>' : '';
    const halo = bleed
        ? `<rect x="${(box.outer.x - bleed * 0.55).toFixed(2)}" y="${(box.outer.y - bleed * 0.55).toFixed(2)}" width="${(box.outer.w + bleed * 1.1).toFixed(2)}" height="${(box.outer.h + bleed * 1.1).toFixed(2)}" rx="${(box.outer.rx + 4).toFixed(2)}" fill="var(--gold-rim-hi)" opacity="0.5"/>`
        : '';
    const body = `
      ${defs(prefix, icon.plate).replace(
        `<rect id="${prefix}cliprect" width="10" height="10" rx="4"/>`,
        `<rect x="${clip.x}" y="${clip.y}" width="${clip.w}" height="${clip.h}" rx="${clip.rx}"/>`,
    )}
      ${halo}
      ${glowOpen}
      ${frame(prefix, icon.plate, box)}
      <g filter="url(#${prefix}emboss)" clip-path="url(#${prefix}clip)">${paintMotif(motif, prefix)}</g>
      ${glowClose}
    `;
    const vb = `${origin} ${origin} ${view} ${view}`;
    const css = opts.standalone
        ? `<style>@import url("../../../src/olympus-tokens.css");</style>`
        : '';
    return { vb, body, css, title: `${icon.label} · ${icon.motif}` };
}

function svgFile(icon, opts) {
    const { vb, body, css, title } = iconMarkup(icon, { ...opts, standalone: true, prefix: 'i', bleed: !!opts.selected });
    const px = opts.size;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${px}" height="${px}" role="img" aria-labelledby="title">${css}<title id="title">${title}</title>${body}</svg>\n`;
}

function inlineSvg(icon, opts) {
    const prefix = opts.prefix;
    const { vb, body, title } = iconMarkup(icon, { ...opts, standalone: false, prefix });
    const px = opts.display || opts.size;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${px}" height="${px}" role="img" aria-label="${title}">${body}</svg>`;
}

function hand(name) {
    const re = new RegExp(`\\b${name}: '([^']*)'`);
    const found = iconsJs.match(re);
    if (!found) throw new Error(`PR #29 아이콘 없음: ${name}`);
    return found[1];
}

const COMPARE = [
    ['홈', 'nav/nav-home.webp', 'home'],
    ['광장', 'nav/nav-plaza.webp', 'plaza'],
    ['퀘스트', 'nav/nav-quests.webp', 'shield'],
    ['문학', 'nav/nav-literature.webp', 'lyre'],
    ['직업', 'nav/nav-jobs.webp', 'crown'],
    ['경제', 'nav/nav-economy.webp', 'sandal'],
    ['밥줄', 'nav/nav-lunch.webp', 'leaf'],
    ['도전', 'nav/nav-challenge.webp', 'torch'],
    ['헌법', 'nav/nav-constitution.webp', 'scroll'],
    ['수업', 'nav/nav-classtools.webp', 'school'],
    ['마스터', 'nav/nav-admin.webp', 'gear'],
    ['설정', 'nav/nav-settings.webp', 'gear'],
    ['도움말', 'nav/nav-help.webp', 'help'],
    ['상점', 'nav/nav-shop.webp', 'cart'],
    ['은행', 'nav/nav-bank.webp', 'bank'],
    ['부동산', 'nav/nav-estate.webp', 'home'],
    ['공동구매', 'nav/nav-groupbuy.webp', 'users'],
    ['캐릭터', 'nav/shop-skin.webp', 'user'],
    ['아이템상점', 'nav/nav-shop.webp', 'cart'],
    ['편의점', 'nav/shop-convenience.webp', 'mark'],
    ['학급 아이템', 'nav/shop-class.webp', 'mark'],
    ['복권상점', 'nav/tool-lottery.webp', 'mark'],
    ['골든벨', 'nav/nav-goldenbell.webp', 'mark'],
    ['스피드퀴즈', 'nav/nav-speedquiz.webp', 'mark'],
    ['퀴즈레이드', 'nav/nav-raid.webp', 'mark'],
    ['시간표', 'nav/tool-timetable.webp', 'mark'],
    ['온도계', 'nav/tool-thermo.webp', 'mark'],
    ['칠판', 'nav/tool-chalk.webp', 'mark'],
    ['타이머', 'nav/tool-timer.webp', 'mark'],
    ['제비뽑기', 'nav/tool-lottery.webp', 'mark'],
    ['학급투표', 'nav/tool-vote.webp', 'mark'],
    ['가위바위보', 'nav/tool-rps.webp', 'mark'],
    ['보드게임', 'nav/tool-boardgames.svg', 'mark'],
    ['돌림판', 'nav/tool-wheel.webp', 'mark'],
    ['비상계엄', 'nav/tool-martial.webp', 'mark'],
    ['아침·공지', 'nav/tool-morning.webp', 'mark'],
    ['생각게시판', 'nav/tool-ideas.webp', 'mark'],
    ['학급게시판', 'nav/tool-notes.webp', 'mark'],
    ['공개수업', 'nav/tool-openlesson.webp', 'mark'],
];

function compareHtml() {
    const cards = COMPARE.map(([label, file, name]) => `
      <article class="card">
        <h3>${label}</h3>
        <div class="pair">
          <figure>
            <img src="../../public/${file}" alt="" width="88" height="88">
            <figcaption>main</figcaption>
          </figure>
          <figure>
            <svg class="oly-icon" viewBox="0 0 24 24" width="88" height="88" aria-hidden="true">${hand(name)}</svg>
            <figcaption>PR #29 · ${name}</figcaption>
          </figure>
        </div>
      </article>`).join('');
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>main 아이콘과 PR #29 아이콘 비교</title>
  <link rel="stylesheet" href="../../src/olympus-tokens.css">
  <link rel="stylesheet" href="../../public/fonts/fonts.css">
  <style>
    html, body { margin: 0; background: var(--bg); color: var(--ink); font-family: Pretendard, sans-serif; }
    .sheet { width: 1240px; padding: 28px 28px 36px; box-sizing: border-box; }
    h1 { font-family: "Gowun Batang", Pretendard, serif; font-size: 32px; margin: 0 0 6px; }
    p.lead { margin: 0 0 18px; font-size: 16px; color: var(--ink-2); line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px 12px; }
    .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 10px 8px 8px; }
    h3 { margin: 0 0 8px; text-align: center; font-size: 14px; }
    .pair { display: flex; justify-content: center; gap: 8px; }
    figure { margin: 0; text-align: center; width: 96px; }
    img { width: 88px; height: 88px; object-fit: cover; border-radius: 18px; display: block; }
    figcaption { font-size: 12px; color: var(--ink-2); margin-top: 4px; }
    .oly-icon .f { fill: var(--sky); }
    .oly-icon .s { fill: none; stroke: var(--ink); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .oly-icon .g { fill: none; stroke: var(--gold-text); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>main 아이콘 · PR #29 아이콘</h1>
    <p class="lead">왼쪽은 main 브랜치의 내비·타일 그림입니다. 오른쪽은 PR #29가 그 자리에 넣은 선 아이콘입니다. 수업도구·도전 타일 여러 개가 같은 mark 로 줄었습니다.</p>
    <div class="grid">${cards}</div>
  </div>
</body>
</html>`;
}

function cell(icon, size, detail, extra = '') {
    const prefix = `${icon.id}${size}${extra || 'a'}`;
    const on = extra === 'on';
    return `<div class="cell${on ? ' is-on' : ''}">${inlineSvg(icon, { detail, size, display: size, prefix, selected: on })}<span>${icon.label}</span><small>${icon.motif}</small></div>`;
}

function draftHtml() {
    const byId = Object.fromEntries(ICONS.map((icon) => [icon.id, icon]));
    const block = (size, detail) => ICONS.map((icon) => cell(icon, size, detail)).join('');
    const states = TAB.map((id) => {
        const icon = byId[id];
        return `<div class="state">${cell(icon, 48, 'full', 'off')}${cell(icon, 48, 'full', 'on')}<em>${icon.label}</em></div>`;
    }).join('');
    const dock = (active) => TAB.map((id) => {
        const icon = byId[id];
        const on = id === active;
        return `<button type="button" class="${on ? 'on' : ''}">${inlineSvg(icon, { detail: 'full', size: 96, display: 48, prefix: `dock${active}${id}`, selected: on })}<span>${icon.label}</span></button>`;
    }).join('');
    const sentence = ['quest', 'shop', 'bank', 'lunch', 'wheel', 'rank'].map((id) => {
        const icon = byId[id];
        return `<span class="chip">${inlineSvg(icon, { detail: 'simple', size: 24, display: 24, prefix: `line${id}` })} ${icon.label}</span>`;
    }).join('');
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>올림푸스 아이콘 시안 20</title>
  <link rel="stylesheet" href="../../src/olympus-tokens.css">
  <link rel="stylesheet" href="../../public/fonts/fonts.css">
  <style>
    html, body { margin: 0; background: var(--bg); color: var(--ink); font-family: Pretendard, sans-serif; }
    .sheet { width: 1280px; padding: 28px 28px 40px; box-sizing: border-box; }
    h1 { font-family: "Gowun Batang", Pretendard, serif; font-size: 32px; margin: 0 0 6px; }
    h2 { font-size: 16px; margin: 22px 0 8px; color: var(--gold-text); }
    p.lead, p.note { margin: 0; font-size: 14px; color: var(--ink-2); line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 10px 8px; }
    .grid.s48 { grid-template-columns: repeat(10, 1fr); }
    .cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .cell span { font-size: 12px; font-weight: 700; }
    .cell small { font-size: 12px; color: var(--ink-2); text-align: center; line-height: 1.3; }
    .cell.is-on svg { filter: drop-shadow(0 0 5px var(--gold-rim-hi)) drop-shadow(0 0 1.5px var(--gold)); }
    .sentence { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; background: var(--surface); border-radius: 14px; padding: 12px 14px; font-size: 16px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; }
    .states { display: flex; gap: 18px; }
    .state { display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--surface); border-radius: 16px; padding: 8px; }
    .state .cell small { display: none; }
    .state em { font-style: normal; font-size: 12px; font-weight: 700; }
    .phones { display: flex; gap: 28px; align-items: flex-start; }
    .phone { width: 390px; background: var(--surface); border: 2px solid var(--navy); border-radius: 28px; overflow: hidden; box-shadow: var(--shadow-card); }
    .phone header { height: 120px; background: linear-gradient(180deg, var(--sky), var(--bg)); padding: 16px; box-sizing: border-box; }
    .phone header strong { display: block; font-family: "Gowun Batang", serif; font-size: 20px; }
    .phone header span { font-size: 12px; color: var(--ink-2); }
    .dock { height: 76px; display: grid; grid-template-columns: repeat(6, 1fr); align-items: center; border-top: 2px solid var(--gold); background: var(--surface); }
    .dock button { appearance: none; border: 0; background: transparent; display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--ink-2); font-family: inherit; font-size: 12px; font-weight: 800; padding: 0; }
    .dock button.on { color: var(--gold-text); }
    .dock svg { filter: drop-shadow(0 2px 2px color-mix(in srgb, var(--navy) 25%, transparent)); }
    .dock button.on svg { filter: drop-shadow(0 0 5px var(--gold-rim-hi)) drop-shadow(0 0 2px var(--gold)); }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>올림푸스 아이콘 시안 20</h1>
    <p class="lead">금색 테두리 #D4A63A → #F3D88A → #A87C1F, 광원은 왼쪽 위, 테두리 두께는 세트에서 같습니다. 96·48은 같은 풀 디테일이고 24만 단순화했습니다. 앱에는 아직 넣지 않은 시안입니다.</p>
    <h2>96px · 풀 디테일</h2>
    <div class="grid">${block(96, 'full')}</div>
    <h2>48px · 타일, 풀 디테일</h2>
    <div class="grid">${block(48, 'full')}</div>
    <h2>24px · 글자 사이, 단순화</h2>
    <div class="grid">${block(24, 'simple')}</div>
    <h2>24px를 문장 사이에 놓으면</h2>
    <p class="sentence">${sentence}</p>
    <h2>탭바 비선택 · 선택</h2>
    <p class="note">각 칸의 왼쪽이 비선택, 오른쪽이 금색 빛을 더한 선택입니다.</p>
    <div class="states">${states}</div>
    <h2>390px 탭바</h2>
    <div class="phones">
      <div class="phone">
        <header><strong>광장 선택</strong><span>가로 390px · 아이콘 48px</span></header>
        <div class="dock">${dock('plaza')}</div>
      </div>
      <div class="phone">
        <header><strong>퀘스트 선택</strong><span>선택 칸만 금색 빛</span></header>
        <div class="dock">${dock('quest')}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

mkdirSync(join(here, 'svg/24'), { recursive: true });
mkdirSync(join(here, 'svg/48'), { recursive: true });
mkdirSync(join(here, 'svg/96'), { recursive: true });
mkdirSync(join(here, 'svg/tab'), { recursive: true });
mkdirSync(join(here, 'sheets'), { recursive: true });

for (const icon of ICONS) {
    writeFileSync(join(here, 'svg/96', `${icon.id}.svg`), svgFile(icon, { detail: 'full', size: 96 }));
    writeFileSync(join(here, 'svg/48', `${icon.id}.svg`), svgFile(icon, { detail: 'full', size: 48 }));
    writeFileSync(join(here, 'svg/24', `${icon.id}.svg`), svgFile(icon, { detail: 'simple', size: 24 }));
    writeFileSync(join(here, 'svg/tab', `${icon.id}.svg`), svgFile(icon, { detail: 'full', size: 48 }));
    writeFileSync(join(here, 'svg/tab', `${icon.id}-selected.svg`), svgFile(icon, { detail: 'full', size: 48, selected: true }));
}

writeFileSync(join(here, 'sheets/compare.html'), compareHtml());
writeFileSync(join(here, 'sheets/draft.html'), draftHtml());
writeFileSync(join(here, 'manifest.json'), JSON.stringify({
    note: '시안 전용. index.html 과 olympus-icons.js 에는 연결하지 않습니다.',
    border: '96px 그림의 테두리는 5, 24px 그림의 테두리는 1.25. 비율은 같습니다.',
    light: '왼쪽 위',
    tokens: ['--gold', '--gold-rim-hi', '--gold-rim-lo', '--marble', '--sky', '--sky-deep'],
    icons: ICONS,
}, null, 2));

console.log(`icons ${ICONS.length} × 5 files`);
