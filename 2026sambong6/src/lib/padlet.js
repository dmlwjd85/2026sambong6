/**
 * 패들렛 보드 주소 정리.
 * padlet.com / padlet.org 만 받고, iframe에 넣을 https 주소로 맞춥니다.
 */

export const PADLET_URL_MAX = 400;

const PADLET_HOSTS = new Set([
    'padlet.com',
    'www.padlet.com',
    'padlet.org',
    'www.padlet.org',
]);

function hostCanonical(host) {
    const h = String(host || '').toLowerCase();
    if (h === 'www.padlet.com') return 'padlet.com';
    if (h === 'www.padlet.org') return 'padlet.org';
    return h;
}

/** iframe src="..." 또는 주소만 붙여 넣어도 보드 URL을 뽑습니다. */
export function extractPadletUrlFromInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const iframeSrc = s.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (iframeSrc && iframeSrc[1]) return sanitizePadletUrl(iframeSrc[1]);
    return sanitizePadletUrl(s);
}

export function sanitizePadletUrl(raw) {
    const s = String(raw || '').trim();
    if (!s || s.length > PADLET_URL_MAX * 2) return '';
    if (/[\u0000-\u001F<>]/.test(s)) return '';
    let href = s;
    if (!/^https?:\/\//i.test(href)) href = `https://${href.replace(/^\/+/, '')}`;
    let u;
    try {
        u = new URL(href);
    } catch {
        return '';
    }
    if (u.protocol !== 'https:') return '';
    const host = hostCanonical(u.hostname);
    if (!PADLET_HOSTS.has(u.hostname.toLowerCase()) && !PADLET_HOSTS.has(host)) return '';
    if (u.username || u.password) return '';
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/') return '';
    if (!/^\/[A-Za-z0-9._~%-]+(\/[A-Za-z0-9._~%-]+)*$/.test(path)) return '';
    const search = u.search && u.search.length <= 120 ? u.search : '';
    const clean = `https://${host}${path}${search}`;
    if (clean.length > PADLET_URL_MAX) return '';
    return clean;
}

/** iframe에 넣을 주소. /embed/ 가 아니면 보드 URL을 그대로 씁니다. */
export function padletEmbedUrl(raw) {
    return sanitizePadletUrl(raw);
}
