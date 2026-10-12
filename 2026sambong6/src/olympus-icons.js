/** 직접 그린 올림푸스 아이콘. 색은 currentColor 와 CSS 변수만 씁니다. set41 은 그림 파일로만 바꿉니다. */
import { paintedIconSources } from './lib/paintedIcons.js';

const HAND = {
    home: '<path class="f" d="M4 11 12 4l8 7"/><path class="s" d="M6 10.5V20h12V10.5"/><path class="g" d="M10 20v-5h4v5"/>',
    plaza: '<path class="f" d="M4 18h16V9H4z"/><path class="s" d="M7 18V9M12 18V9M17 18V9M3 9h18M8 9V6h8v3"/><path class="g" d="M12 6V4"/>',
    shield: '<path class="f" d="M12 3.5 19 6.2v6.1c0 3.7-2.9 6.5-7 8.2-4.1-1.7-7-4.5-7-8.2V6.2z"/><path class="s" d="M12 3.5 19 6.2v6.1c0 3.7-2.9 6.5-7 8.2-4.1-1.7-7-4.5-7-8.2V6.2z"/><path class="g" d="M12 8v6"/>',
    lyre: '<path class="s" d="M8 16c0-4 1.5-8 4-10 2.5 2 4 6 4 10"/><path class="f" d="M7 16h10v2a5 5 0 0 1-10 0z"/><path class="g" d="M9 12h6M9.5 9.5h5"/>',
    scroll: '<path class="f" d="M7 5h10v14H7z"/><path class="s" d="M7 5h10v14H7zM6 7c-1.2 0-2 .8-2 2s.8 2 2 2M18 15c1.2 0 2 .8 2 2s-.8 2-2 2"/><path class="g" d="M9 9h6M9 12h6"/>',
    torch: '<path class="s" d="M12 22V11"/><path class="f" d="M12 11c2.5-2 4-3.2 4-5.2C16 3.6 14.2 2 12 3.2 9.8 2 8 3.6 8 5.8 8 7.8 9.5 9 12 11z"/><path class="g" d="M12 8.2c.8-.7 1.4-1.2 1.4-2"/>',
    sandal: '<path class="f" d="M4 15c2-6 6-8 10-7 3 .6 5 2 6 4l1 4H4z"/><path class="s" d="M8 12c2-4 5-5 8-3M6 15h14"/><path class="g" d="M14 8c2-2 4-2 5 0"/>',
    bank: '<path class="f" d="M4 10h16v2H4z"/><path class="s" d="M6 12v6M10 12v6M14 12v6M18 12v6M4 18h16M12 4 3 10h18z"/><path class="g" d="M12 4v6"/>',
    coin: '<circle class="f" cx="12" cy="12" r="7"/><circle class="s" cx="12" cy="12" r="7"/><path class="g" d="M12 8v8M10 10h3a1.5 1.5 0 0 1 0 3h-2"/>',
    user: '<circle class="f" cx="12" cy="8" r="3"/><path class="s" d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19"/><circle class="s" cx="12" cy="8" r="3"/>',
    bell: '<path class="f" d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path class="s" d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path class="g" d="M10 19a2 2 0 0 0 4 0"/>',
    gear: '<circle class="f" cx="12" cy="12" r="3"/><path class="s" d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/><circle class="s" cx="12" cy="12" r="3"/>',
    map: '<path class="f" d="M4 6.5 9 4l6 2.5L20 4v13.5L15 20l-6-2.5L4 20z"/><path class="s" d="M9 4v13.5M15 6.5V20"/>',
    heart: '<path class="f" d="M12 19s-7-4.2-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.8-7 9-7 9z"/><path class="s" d="M12 19s-7-4.2-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.8-7 9-7 9z"/>',
    book: '<path class="f" d="M5 5h6.5a3 3 0 0 1 3 3V20H8a3 3 0 0 0-3 3z"/><path class="s" d="M12.5 8a3 3 0 0 1 3-3H19v15h-6.5"/><path class="g" d="M8 9h3"/>',
    key: '<circle class="f" cx="8" cy="10" r="3.2"/><path class="s" d="M11 11.2 20 16v3h-3v-2"/><circle class="s" cx="8" cy="10" r="3.2"/>',
    check: '<circle class="f" cx="12" cy="12" r="8"/><path class="g" d="M8 12.2 11 15l5-6"/>',
    star: '<path class="f" d="m12 3 2.2 5.2L20 9l-4 3.6L17.2 19 12 16.2 6.8 19 8 12.6 4 9l5.8-.8z"/><path class="s" d="m12 3 2.2 5.2L20 9l-4 3.6L17.2 19 12 16.2 6.8 19 8 12.6 4 9l5.8-.8z"/>',
    flag: '<path class="s" d="M6 21V4"/><path class="f" d="M6 5h11l-2 3.5L17 12H6z"/><path class="g" d="M6 5h11"/>',
    sun: '<circle class="f" cx="12" cy="12" r="4"/><path class="g" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/>',
    moon: '<path class="f" d="M15 3.5A8 8 0 1 0 20.5 14 6.5 6.5 0 0 1 15 3.5z"/>',
    bolt: '<path class="f" d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
    help: '<circle class="f" cx="12" cy="12" r="8"/><path class="g" d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14"/><circle class="g" cx="12" cy="17" r=".8"/>',
    logout: '<path class="s" d="M10 5H6v14h4"/><path class="g" d="M11 12h8M16 9l3 3-3 3"/>',
    eye: '<path class="s" d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle class="f" cx="12" cy="12" r="2.4"/>',
    hourglass: '<path class="s" d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8s8 4 8 8"/><path class="g" d="M10 16h4"/>',
    chevron: '<path class="s" d="M6 9l6 6 6-6"/>',
    xmark: '<path class="s" d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path class="s" d="M12 6v12M6 12h12"/>',
    search: '<circle class="s" cx="11" cy="11" r="6"/><path class="g" d="M15.5 15.5 20 20"/>',
    play: '<path class="f" d="M8 6v12l10-6z"/>',
    pause: '<path class="f" d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
    lock: '<rect class="f" x="6" y="11" width="12" height="9" rx="2"/><path class="s" d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    cart: '<path class="s" d="M4 6h2l2 10h10l2-7H8"/><circle class="g" cx="10" cy="19" r="1.3"/><circle class="g" cx="17" cy="19" r="1.3"/>',
    list: '<path class="s" d="M8 7h11M8 12h11M8 17h11"/><path class="g" d="M4 7h.1M4 12h.1M4 17h.1"/>',
    clock: '<circle class="s" cx="12" cy="12" r="8"/><path class="g" d="M12 8v5l3 2"/>',
    users: '<circle class="f" cx="9" cy="9" r="2.4"/><circle class="f" cx="16" cy="10" r="2"/><path class="s" d="M3.5 18c.8-2.4 2.6-3.5 5.5-3.5s4.7 1.1 5.5 3.5M13 14.6c1.8-.2 3.4.4 4.5 1.9"/>',
    chart: '<path class="s" d="M4 19h16"/><path class="f" d="M7 16v-4h3v4zM12 16V7h3v9zM17 16v-6h3v6z"/>',
    table: '<path class="s" d="M4 6h16v12H4zM4 10h16M10 6v12"/>',
    file: '<path class="f" d="M7 3h7l4 4v14H7z"/><path class="g" d="M14 3v5h5"/>',
    megaphone: '<path class="f" d="M4 10v4l12 3V7z"/><path class="s" d="M16 9.5a3 3 0 0 1 0 5"/><path class="g" d="M7 14.5 8.2 19"/>',
    gift: '<rect class="f" x="4" y="10" width="16" height="9"/><path class="s" d="M4 10h16M12 10v9"/><path class="g" d="M12 10c-2-4-6-4-6-1.5S10 10 12 10c2-4 6-4 6-1.5S14 10 12 10"/>',
    dragon: '<path class="s" d="M4 16c3-1 4-4 6-4s2 3 5 3 4-2 5-4"/><path class="f" d="M16 8l3-2v4z"/><circle class="g" cx="15" cy="9" r="1"/>',
    school: '<path class="f" d="M3 11 12 6l9 5-9 5z"/><path class="s" d="M7 13v4c2 1.4 8 1.4 10 0v-4"/><path class="g" d="M19 11v6"/>',
    crown: '<path class="f" d="M4 16 6 8l6 4 6-4 2 8z"/><path class="g" d="M5 18h14"/>',
    music: '<path class="s" d="M9 17V7l10-2v10"/><circle class="f" cx="7" cy="17" r="2.2"/><circle class="f" cx="17" cy="15" r="2.2"/>',
    leaf: '<path class="f" d="M5 19C5 10 12 4 20 4 20 14 14 20 5 19z"/><path class="g" d="M9 15c2-2 5-4 8-6"/>',
    trophy: '<path class="f" d="M8 4h8v6a4 4 0 0 1-8 0z"/><path class="s" d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v3M9 20h6"/>',
    mark: '<rect class="f" x="4" y="4" width="16" height="16" rx="4"/><path class="g" d="M8 12h8"/>',
};

function autoIcon(name) {
    let h = 0;
    for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const x = 6 + (h % 6);
    const y = 7 + ((h >> 3) % 5);
    return `<rect class="f" x="4" y="4" width="16" height="16" rx="4"/><path class="s" d="M${x} ${y}h${3 + (h % 5)}M8 15h${4 + (h % 4)}"/><circle class="g" cx="${8 + (h % 8)}" cy="${8 + ((h >> 5) % 4)}" r="1.5"/>`;
}

export function canonIconName(raw) {
    let name = String(raw || 'mark').trim();
    const prefix = 'fa' + '-';
    if (name.startsWith(prefix)) name = name.slice(prefix.length);
    name = name.replace(/[^a-z0-9-]/gi, '') || 'mark';
    return name;
}

function svgInner(name) {
    return HAND[name] || autoIcon(name);
}

function paintedMarkup(name, extraClass = '') {
    const base = import.meta.env.BASE_URL || '/2026sambong6/';
    const sources = paintedIconSources(name, base);
    if (!sources) return '';
    const cls = ['oly-icon', extraClass].filter(Boolean).join(' ');
    const srcset = [96, 192, 288].map((size) => `${sources.webp[size]} ${size}w`).join(', ');
    return `<picture class="${cls}" data-oly="${sources.id}" data-oly-svg="${sources.svg24}"><source type="image/webp" srcset="${srcset}" sizes="48px"><img src="${sources.webp[96]}" alt="" width="96" height="96" loading="lazy" decoding="async"></picture>`;
}

export function iconSvg(name, extraClass = '') {
    const painted = paintedMarkup(name, extraClass);
    if (painted) return painted;
    const id = canonIconName(name);
    const cls = ['oly-icon', extraClass].filter(Boolean).join(' ');
    return `<svg class="${cls}" data-oly="${id}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${svgInner(id)}</svg>`;
}

export function paintIcon(node) {
    if (!node || node.dataset.olyReady === '1') return;
    const raw = node.getAttribute('data-oly') || 'mark';
    const painted = paintedMarkup(raw, '');
    if (painted && node.tagName === 'svg') {
        const holder = document.createElement('template');
        holder.innerHTML = painted;
        const picture = holder.content.firstElementChild;
        const prev = (node.getAttribute('class') || '').split(/\s+/).filter((item) => item && item !== 'oly-icon');
        prev.forEach((item) => picture.classList.add(item));
        picture.dataset.olyReady = '1';
        node.replaceWith(picture);
        return;
    }
    if (node.tagName !== 'svg') return;
    const name = canonIconName(raw);
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    if (!node.getAttribute('class')?.includes('oly-icon')) node.classList.add('oly-icon');
    node.innerHTML = svgInner(name);
    node.dataset.olyReady = '1';
}

export function paintTree(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('svg[data-oly]').forEach(paintIcon);
    if (root && root.matches && root.matches('svg[data-oly]')) paintIcon(root);
}

export function olyPaint(token) {
    if (typeof document === 'undefined') return '';
    const name = String(token || '').startsWith('--') ? token : `--${token}`;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function boot() {
    window.olyIcon = iconSvg;
    window.olyPaint = olyPaint;
    const run = () => paintTree(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
    const obs = new MutationObserver((records) => {
        for (const rec of records) {
            rec.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                paintTree(node);
            });
        }
    });
    const start = () => obs.observe(document.body, { childList: true, subtree: true });
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
}

boot();
