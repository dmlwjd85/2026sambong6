/**
 * 화면의 음수 금액은 같은 클래스(money-negative)로 빨갛게 표시합니다.
 * 알림 문장은 글자만 쓰고, 화면 HTML은 formatMoneyHtml 또는 splitNegativeMoney를 씁니다.
 */

export const MONEY_NEGATIVE_CLASS = 'money-negative';

export function isNegativeMoney(value) {
    const n = Number(value);
    return Number.isFinite(n) && n < 0;
}

/** 음수면 money-negative, 아니면 빈 문자열입니다. */
export function moneyToneClass(value) {
    return isNegativeMoney(value) ? MONEY_NEGATIVE_CLASS : '';
}

function escapeRegExp(text) {
    return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 문장 안의 "-12봉" 같은 토큰을 나눕니다.
 * 단위가 바로 붙어 있는 음수 금액만 잡고, 자리 번호(-1번)는 그대로 둡니다.
 */
export function splitNegativeMoney(text, unit) {
    const raw = String(text ?? '');
    const u = String(unit ?? '');
    if (!u) return [{ text: raw, negative: false }];
    const re = new RegExp(`-\\d+${escapeRegExp(u)}`, 'g');
    const out = [];
    let last = 0;
    let match = re.exec(raw);
    while (match) {
        if (match.index > last) out.push({ text: raw.slice(last, match.index), negative: false });
        out.push({ text: match[0], negative: true });
        last = match.index + match[0].length;
        match = re.exec(raw);
    }
    if (last < raw.length || out.length === 0) out.push({ text: raw.slice(last), negative: false });
    return out;
}

/** 화면 HTML에 넣을 때 단위 글자가 태그가 되지 않게 바꿉니다. */
export function escapeMoneyText(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 음수 금액 글자를 빨간 클래스로 감쌉니다. 0 이상은 그대로 둡니다. */
export function formatMoneyHtml(amountText, value) {
    const text = escapeMoneyText(amountText);
    if (!isNegativeMoney(value)) return text;
    return `<span class="${MONEY_NEGATIVE_CLASS}">${text}</span>`;
}
