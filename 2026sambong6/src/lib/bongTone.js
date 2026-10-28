/** 봉이 0보다 작으면 화면에서 빨간색으로 표시합니다. */
export function isNegativeBong(value) {
    const n = Number(value);
    return Number.isFinite(n) && n < 0;
}

export function bongToneClass(value) {
    return isNegativeBong(value) ? 'bong-neg' : '';
}

export function applyBongTone(el, value) {
    if (!el || !el.classList) return;
    el.classList.toggle('bong-neg', isNegativeBong(value));
}
