/**
 * 캐릭터 상점(SKIN_DATA) 전체 할인.
 * 날짜는 한국 시간(KST, +09:00)으로 입력·표시하고, 종료일은 그날 23:59:59.999까지입니다.
 * 아이템 상점·학급상점·편의점·로또·공동구매에는 쓰지 않습니다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_SHOP_DISCOUNT = Object.freeze({
    enabled: false,
    percent: 0,
    startAt: 0,
    endAt: 0,
    scope: 'skins',
});

function finiteInt(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

/** 저장된 할인 설정을 스킨 상점용 형태로 맞춥니다. */
export function normalizeShopDiscount(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const enabled = src.enabled === true || src.enabled === 'true' || src.enabled === 1;
    let percent = Math.round(Number(src.percent));
    if (!Number.isFinite(percent)) percent = 0;
    percent = Math.max(0, Math.min(100, percent));
    return {
        enabled,
        percent,
        startAt: finiteInt(src.startAt, 0),
        endAt: finiteInt(src.endAt, 0),
        scope: 'skins',
    };
}

/**
 * YYYY-MM-DD 를 KST 시각(ms)으로 바꿉니다.
 * endOfDay 가 아니면 00:00:00.000, 이면 23:59:59.999 입니다.
 * 잘못된 날짜는 NaN.
 */
export function parseKstDateInput(str, endOfDay) {
    const m = String(str == null ? '' : str).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
    const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const check = new Date(utcMidnight);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        return NaN;
    }
    const start = utcMidnight - KST_OFFSET_MS;
    if (!endOfDay) return start;
    return start + DAY_MS - 1;
}

/** 타임스탬프를 KST 달력 날짜(YYYY-MM-DD)로 되돌립니다. */
export function formatKstDateInput(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    const shifted = new Date(n + KST_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * off | scheduled | active | ended
 * 활성은 enabled && percent>0 && startAt<=now<endAt 입니다.
 */
export function getShopDiscountPhase(cfg, nowMs) {
    const c = normalizeShopDiscount(cfg);
    const now = Number(nowMs);
    if (!c.enabled || c.percent <= 0 || !(c.startAt < c.endAt) || !Number.isFinite(now)) return 'off';
    if (now < c.startAt) return 'scheduled';
    if (now < c.endAt) return 'active';
    return 'ended';
}

export function isShopDiscountActive(cfg, nowMs) {
    return getShopDiscountPhase(cfg, nowMs) === 'active';
}

/** 관리 화면 상태. 시작 전이면 '예정'. */
export function formatShopDiscountStatus(cfg, nowMs) {
    const phase = getShopDiscountPhase(cfg, nowMs);
    if (phase === 'scheduled') return '예정';
    if (phase === 'active') {
        const remain = formatRemainingKst(cfg, nowMs);
        return remain ? `진행 중 · ${remain}` : '진행 중';
    }
    if (phase === 'ended') return '종료';
    return '할인 없음';
}

/**
 * 할인가. 비활성이면 원가 그대로.
 * Math.round(price * (100-percent) / 100), 0 이상, 원가를 넘지 않음.
 */
export function getDiscountedPrice(price, cfg, nowMs) {
    const original = Number(price);
    const safeOriginal = Number.isFinite(original) && original > 0 ? original : 0;
    if (!isShopDiscountActive(cfg, nowMs)) return safeOriginal;
    const percent = normalizeShopDiscount(cfg).percent;
    const discounted = Math.round((safeOriginal * (100 - percent)) / 100);
    if (discounted < 0) return 0;
    if (discounted > safeOriginal) return safeOriginal;
    return discounted;
}

/**
 * 종료까지 남은 시간.
 * 1시간 이상: 'N일 N시간 남음', 1시간 미만: 'N분 남음'.
 */
export function formatRemainingKst(cfg, nowMs) {
    const c = normalizeShopDiscount(cfg);
    const now = Number(nowMs);
    if (!Number.isFinite(now) || !Number.isFinite(c.endAt)) return '';
    const remain = c.endAt - now;
    if (remain <= 0) return '';
    if (remain < HOUR_MS) {
        const mins = Math.ceil(remain / 60000);
        if (mins >= 60) return '0일 1시간 남음';
        return `${Math.max(1, mins)}분 남음`;
    }
    const totalHours = Math.floor(remain / HOUR_MS);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}일 ${hours}시간 남음`;
}

/** 저장 거절 사유. 비어 있으면 저장해도 됩니다. */
export function describeShopDiscountSaveError({ percent, startAt, endAt } = {}) {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
        return '할인율은 0부터 100까지의 정수로 입력해 주세요.';
    }
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
        return '시작일과 종료일을 한국 시간(KST)으로 선택해 주세요.';
    }
    if (!(startAt < endAt)) {
        return '종료일은 시작일보다 뒤여야 합니다.';
    }
    return '';
}
