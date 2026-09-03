/**
 * 직업 아이콘·색 목록.
 * 기본 직업과 새로 만드는 직업이 같은 모양·같은 색을 쓰지 않도록 고릅니다.
 */

/** 기본 직업 id별 아이콘·색 — 모양과 색이 각각 겹치지 않습니다. */
export const DEFAULT_JOB_LOOKS = [
    { id: 'job_sp', icon: 'fa-crown', color: 'text-amber-400' },
    { id: 'job_svp', icon: 'fa-shield-cat', color: 'text-orange-500' },
    { id: 'job1', icon: 'fa-flag', color: 'text-yellow-300' },
    { id: 'job2', icon: 'fa-star-half-stroke', color: 'text-lime-500' },
    { id: 'job_vac', icon: 'fa-wind', color: 'text-teal-400' },
    { id: 'job3', icon: 'fa-trash-can', color: 'text-stone-400' },
    { id: 'job4', icon: 'fa-glass-water', color: 'text-sky-400' },
    { id: 'job5', icon: 'fa-chalkboard', color: 'text-slate-400' },
    { id: 'job6', icon: 'fa-desktop', color: 'text-cyan-400' },
    { id: 'job7', icon: 'fa-recycle', color: 'text-sb-green' },
    { id: 'job8', icon: 'fa-tablet-screen-button', color: 'text-violet-500' },
    { id: 'job9', icon: 'fa-lightbulb', color: 'text-orange-300' },
    { id: 'job10', icon: 'fa-piggy-bank', color: 'text-pink-500' },
    { id: 'job11', icon: 'fa-leaf', color: 'text-emerald-500' },
    { id: 'job12', icon: 'fa-store', color: 'text-rose-400' },
    { id: 'job_book', icon: 'fa-book-skull', color: 'text-purple-500' },
    { id: 'job_newbie', icon: 'fa-hand-holding-heart', color: 'text-fuchsia-400' },
];

/** 고를 수 있는 아이콘. 기본 직업 모양 + 추가 직업용 여분을 함께 둡니다. */
export const JOB_ICON_CHOICES = [
    { class: 'fa-crown', label: '왕관' },
    { class: 'fa-shield-cat', label: '방패고양이' },
    { class: 'fa-flag', label: '깃발' },
    { class: 'fa-star-half-stroke', label: '반쪽별' },
    { class: 'fa-wind', label: '바람' },
    { class: 'fa-trash-can', label: '쓰레기통' },
    { class: 'fa-glass-water', label: '물잔' },
    { class: 'fa-chalkboard', label: '칠판' },
    { class: 'fa-desktop', label: '컴퓨터' },
    { class: 'fa-recycle', label: '재활용' },
    { class: 'fa-tablet-screen-button', label: '패드' },
    { class: 'fa-lightbulb', label: '전구' },
    { class: 'fa-piggy-bank', label: '저금통' },
    { class: 'fa-leaf', label: '잎사귀' },
    { class: 'fa-store', label: '가게' },
    { class: 'fa-book-skull', label: '마법서' },
    { class: 'fa-hand-holding-heart', label: '하트손' },
    { class: 'fa-star', label: '별' },
    { class: 'fa-chess-knight', label: '나이트' },
    { class: 'fa-wand-magic-sparkles', label: '마법봉' },
    { class: 'fa-hourglass-half', label: '모래시계' },
    { class: 'fa-newspaper', label: '신문' },
    { class: 'fa-book-open', label: '펼친책' },
    { class: 'fa-compass', label: '나침반' },
    { class: 'fa-palette', label: '팔레트' },
    { class: 'fa-user-secret', label: '비밀요원' },
    { class: 'fa-crosshairs', label: '조준' },
    { class: 'fa-scroll', label: '두루마리' },
    { class: 'fa-boxes-stacked', label: '상자' },
    { class: 'fa-briefcase-medical', label: '의료가방' },
    { class: 'fa-graduation-cap', label: '학사모' },
    { class: 'fa-music', label: '음표' },
    { class: 'fa-hammer', label: '망치' },
    { class: 'fa-seedling', label: '새싹' },
    { class: 'fa-sun', label: '해' },
    { class: 'fa-moon', label: '달' },
    { class: 'fa-bolt', label: '번개' },
    { class: 'fa-heart', label: '하트' },
    { class: 'fa-gem', label: '보석' },
    { class: 'fa-key', label: '열쇠' },
    { class: 'fa-trophy', label: '트로피' },
    { class: 'fa-medal', label: '메달' },
    { class: 'fa-dragon', label: '용' },
    { class: 'fa-cat', label: '고양이' },
    { class: 'fa-rocket', label: '로켓' },
    { class: 'fa-anchor', label: '닻' },
    { class: 'fa-bell', label: '종' },
    { class: 'fa-camera', label: '카메라' },
    { class: 'fa-utensils', label: '식기' },
    { class: 'fa-pencil', label: '연필' },
    { class: 'fa-microscope', label: '현미경' },
    { class: 'fa-chess-queen', label: '퀸' },
];

/** 고를 수 있는 색. 서로 다른 빛깔이 한눈에 구분되게 골랐습니다. */
export const JOB_COLOR_CHOICES = [
    { class: 'text-amber-400', label: '금색' },
    { class: 'text-orange-500', label: '진한주황' },
    { class: 'text-yellow-300', label: '노랑' },
    { class: 'text-lime-500', label: '라임' },
    { class: 'text-teal-400', label: '틸' },
    { class: 'text-stone-400', label: '돌색' },
    { class: 'text-sky-400', label: '하늘' },
    { class: 'text-slate-400', label: '슬레이트' },
    { class: 'text-cyan-400', label: '시안' },
    { class: 'text-sb-green', label: '초록' },
    { class: 'text-violet-500', label: '보라' },
    { class: 'text-orange-300', label: '연한주황' },
    { class: 'text-pink-500', label: '분홍' },
    { class: 'text-emerald-500', label: '에메랄드' },
    { class: 'text-rose-400', label: '장미' },
    { class: 'text-purple-500', label: '자주' },
    { class: 'text-fuchsia-400', label: '자홍' },
    { class: 'text-red-500', label: '빨강' },
    { class: 'text-blue-500', label: '파랑' },
    { class: 'text-indigo-400', label: '남색' },
    { class: 'text-lime-300', label: '연한라임' },
    { class: 'text-amber-600', label: '짙은금' },
    { class: 'text-zinc-400', label: '아연' },
    { class: 'text-red-300', label: '연한빨강' },
    { class: 'text-blue-300', label: '연한파랑' },
    { class: 'text-emerald-300', label: '연한에메랄드' },
    { class: 'text-pink-300', label: '연한분홍' },
    { class: 'text-sky-300', label: '연한하늘' },
    { class: 'text-teal-200', label: '연한틸' },
    { class: 'text-violet-300', label: '연한보라' },
];

const JOB_ICON_CLASS_SET = new Set(JOB_ICON_CHOICES.map((item) => item.class));
const JOB_COLOR_CLASS_SET = new Set(JOB_COLOR_CHOICES.map((item) => item.class));
const FA_ICON_RE = /^fa-[a-z0-9-]+$/;
const TEXT_COLOR_RE = /^text-[a-z0-9-]+$/;

function trimStr(value) {
    return String(value == null ? '' : value).trim();
}

/** Font Awesome 클래스만 남깁니다. 목록에 없어도 예전에 쓰던 fa- 값은 유지합니다. */
export function normalizeJobIcon(raw, fallback = 'fa-star') {
    let icon = trimStr(raw).replace(/^fa-solid\s+/i, '');
    if (icon.startsWith('fas ')) icon = icon.slice(4).trim();
    if (JOB_ICON_CLASS_SET.has(icon) || FA_ICON_RE.test(icon)) return icon;
    return fallback;
}

/** Tailwind text-* 색만 남깁니다. 목록에 없어도 예전에 쓰던 text- 값은 유지합니다. */
export function normalizeJobColor(raw, fallback = 'text-blue-500') {
    const color = trimStr(raw);
    if (JOB_COLOR_CLASS_SET.has(color) || TEXT_COLOR_RE.test(color)) return color;
    return fallback;
}

export function lookForDefaultJob(id) {
    const found = DEFAULT_JOB_LOOKS.find((item) => item.id === String(id));
    return found
        ? { icon: found.icon, color: found.color }
        : { icon: 'fa-star', color: 'text-blue-500' };
}

export function jobIconLabel(icon) {
    const found = JOB_ICON_CHOICES.find((item) => item.class === normalizeJobIcon(icon));
    return found ? found.label : '아이콘';
}

export function jobColorLabel(color) {
    const found = JOB_COLOR_CHOICES.find((item) => item.class === normalizeJobColor(color));
    return found ? found.label : '색';
}

/** 수정 중인 직업을 뺀 나머지에서 이미 쓰는 모양·색 */
export function jobLooksInUse(catalog, exceptId) {
    const except = String(exceptId || '');
    const icons = new Set();
    const colors = new Set();
    (catalog || []).forEach((job) => {
        if (!job || String(job.id) === except) return;
        icons.add(normalizeJobIcon(job.icon));
        colors.add(normalizeJobColor(job.color));
    });
    return { icons, colors };
}

/**
 * 다른 직업과 모양 또는 색이 겹치면 충돌 정보를 돌려줍니다.
 * @returns {null | { kind: 'icon' | 'color' | 'both', job: object }}
 */
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
        return `이미 [${name}] 직업이 같은 색을 씁니다. 다른 색을 골라 주세요.`;
    }
    if (conflict.kind === 'both') {
        return `이미 [${name}] 직업이 같은 아이콘과 색을 씁니다. 다른 모양과 색을 골라 주세요.`;
    }
    return `이미 [${name}] 직업이 같은 아이콘을 씁니다. 다른 모양을 골라 주세요.`;
}

/** 아직 안 쓰는 아이콘·색을 하나 고릅니다. */
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

/** 수정 중인 예전 아이콘이 목록에 없으면 맨 앞에 붙여 보여 줍니다. */
export function jobIconChoicesForPicker(currentIcon) {
    const icon = normalizeJobIcon(currentIcon, '');
    return extraChoice(icon, '현재', JOB_ICON_CHOICES, 'class');
}

export function jobColorChoicesForPicker(currentColor) {
    const color = normalizeJobColor(currentColor, '');
    return extraChoice(color && TEXT_COLOR_RE.test(color) ? color : '', '현재', JOB_COLOR_CHOICES, 'class');
}

export function jobLooksAreUnique(jobs) {
    const icons = new Set();
    const colors = new Set();
    for (const job of jobs || []) {
        const icon = normalizeJobIcon(job && job.icon);
        const color = normalizeJobColor(job && job.color);
        if (icons.has(icon) || colors.has(color)) return false;
        icons.add(icon);
        colors.add(color);
    }
    return true;
}
