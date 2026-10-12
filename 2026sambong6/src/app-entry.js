/**
 * 로그인 이후에만 불러오는 앱. CSS·Firebase·본문은 이 청크에 있습니다.
 */
import './olympus-tokens.css';
import './index.css';
import './olympus.css';
import './olympus-icons.js';
import './sambongWorld.js';

const fontBase = import.meta.env.BASE_URL || '/2026sambong6/';
function addFontSheet(href) {
    if (document.querySelector(`link[data-oly-font="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.olyFont = href;
    document.head.appendChild(link);
}
addFontSheet(`${fontBase}fonts/fonts.css`);
addFontSheet(`${fontBase}fonts/gowun.css`);
addFontSheet('https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&display=swap');

document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (event.target && event.target.isContentEditable)) return;
    const dock = document.getElementById('appNavDock');
    if (!dock) return;
    const items = [...dock.querySelectorAll('button.app-nav-item')].filter((btn) => {
        if (btn.classList.contains('hidden') || btn.hidden) return false;
        return btn.getClientRects().length > 0;
    });
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (index < 0) {
        items[0].focus();
        event.preventDefault();
        return;
    }
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const next = items[(index + (forward ? 1 : items.length - 1)) % items.length];
    next.focus();
    event.preventDefault();
});
