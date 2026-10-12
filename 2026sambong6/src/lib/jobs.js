/**
 * 직업 아이콘·색 목록.
 * 기본 직업과 새로 만드는 직업이 같은 모양·같은 색을 쓰지 않도록 고릅니다.
 */

/** 기본 직업 id별 아이콘·색 — 모양과 색이 각각 겹치지 않습니다. */
export const DEFAULT_JOB_LOOKS = [
    { id: 'job_sp', icon: 'crown', color: 'tone-01' },
    { id: 'job_svp', icon: 'shield', color: 'tone-02' },
    { id: 'job1', icon: 'flag', color: 'tone-03' },
    { id: 'job2', icon: 'half', color: 'tone-04' },
    { id: 'job_vac', icon: 'wind', color: 'tone-05' },
    { id: 'job3', icon: 'trash', color: 'tone-06' },
    { id: 'job4', icon: 'glass', color: 'tone-07' },
    { id: 'job5', icon: 'chalkboard', color: 'tone-08' },
    { id: 'job6', icon: 'desktop', color: 'tone-09' },
    { id: 'job7', icon: 'recycle', color: 'tone-10' },
    { id: 'job8', icon: 'tablet', color: 'tone-11' },
    { id: 'job9', icon: 'lightbulb', color: 'tone-12' },
    { id: 'job10', icon: 'piggy', color: 'tone-13' },
    { id: 'job11', icon: 'leaf', color: 'tone-14' },
    { id: 'job12', icon: 'store', color: 'tone-15' },
    { id: 'job_book', icon: 'book', color: 'tone-16' },
    { id: 'job_newbie', icon: 'heart', color: 'tone-17' },
];

export const JOB_ICON_CHOICES = [
    { class: 'crown', label: '왕관' },
    { class: 'shield', label: '방패' },
    { class: 'flag', label: '깃발' },
    { class: 'half', label: '반쪽별' },
    { class: 'wind', label: '바람' },
    { class: 'trash', label: '쓰레기통' },
    { class: 'glass', label: '물잔' },
    { class: 'chalkboard', label: '칠판' },
    { class: 'desktop', label: '컴퓨터' },
    { class: 'recycle', label: '재활용' },
    { class: 'tablet', label: '패드' },
    { class: 'lightbulb', label: '전구' },
    { class: 'piggy', label: '저금통' },
    { class: 'leaf', label: '잎사귀' },
    { class: 'store', label: '가게' },
    { class: 'book', label: '마법서' },
    { class: 'heart', label: '하트손' },
    { class: 'star', label: '별' },
    { class: 'spark', label: '마법봉' },
    { class: 'hourglass', label: '모래시계' },
    { class: 'newspaper', label: '신문' },
    { class: 'bookopen', label: '펼친책' },
    { class: 'compass', label: '나침반' },
    { class: 'palette', label: '팔레트' },
    { class: 'user', label: '비밀요원' },
    { class: 'cross', label: '조준' },
    { class: 'scroll', label: '두루마리' },
    { class: 'boxes', label: '상자' },
    { class: 'medical', label: '의료가방' },
    { class: 'school', label: '학사모' },
    { class: 'music', label: '음표' },
    { class: 'hammer', label: '망치' },
    { class: 'seedling', label: '새싹' },
    { class: 'sun', label: '해' },
    { class: 'moon', label: '달' },
    { class: 'bolt', label: '번개' },
    { class: 'gem', label: '보석' },
    { class: 'key', label: '열쇠' },
    { class: 'trophy', label: '트로피' },
    { class: 'medal', label: '메달' },
    { class: 'dragon', label: '용' },
    { class: 'cat', label: '고양이' },
    { class: 'rocket', label: '로켓' },
    { class: 'anchor', label: '닻' },
    { class: 'bell', label: '종' },
    { class: 'camera', label: '카메라' },
    { class: 'utensils', label: '식기' },
    { class: 'pencil', label: '연필' },
    { class: 'microscope', label: '현미경' },
    { class: 'gift', label: '선물' },
];

export const JOB_COLOR_CHOICES = [
    { class: 'tone-01', label: '금색' },
    { class: 'tone-02', label: '진한주황' },
    { class: 'tone-03', label: '노랑' },
    { class: 'tone-04', label: '라임' },
    { class: 'tone-05', label: '틸' },
    { class: 'tone-06', label: '돌색' },
    { class: 'tone-07', label: '하늘' },
    { class: 'tone-08', label: '슬레이트' },
    { class: 'tone-09', label: '시안' },
    { class: 'tone-10', label: '초록' },
    { class: 'tone-11', label: '보라' },
    { class: 'tone-12', label: '연한주황' },
    { class: 'tone-13', label: '분홍' },
    { class: 'tone-14', label: '에메랄드' },
    { class: 'tone-15', label: '장미' },
    { class: 'tone-16', label: '자주' },
    { class: 'tone-17', label: '자홍' },
    { class: 'tone-18', label: '빨강' },
    { class: 'tone-19', label: '파랑' },
    { class: 'tone-20', label: '남색' },
    { class: 'tone-21', label: '연한라임' },
    { class: 'tone-22', label: '짙은금' },
    { class: 'tone-23', label: '아연' },
    { class: 'tone-24', label: '연한빨강' },
    { class: 'tone-25', label: '연한파랑' },
    { class: 'tone-26', label: '연한에메랄드' },
    { class: 'tone-27', label: '연한분홍' },
    { class: 'tone-28', label: '연한하늘' },
    { class: 'tone-29', label: '연한틸' },
    { class: 'tone-30', label: '연한보라' },
];

const JOB_ICON_CLASS_SET = new Set(JOB_ICON_CHOICES.map((item) => item.class));
const JOB_COLOR_CLASS_SET = new Set(JOB_COLOR_CHOICES.map((item) => item.class));
const MARK_FA = 'fa' + '-';
const MARK_TEXT = 'text' + '-';
const LEGACY_TONE = new Map([
    ['amber-400', 'tone-01'],
    ['orange-500', 'tone-02'],
    ['yellow-300', 'tone-03'],
    ['lime-500', 'tone-04'],
    ['teal-400', 'tone-05'],
    ['stone-400', 'tone-06'],
    ['sky-400', 'tone-07'],
    ['slate-400', 'tone-08'],
    ['cyan-400', 'tone-09'],
    ['sb-green', 'tone-10'],
    ['violet-500', 'tone-11'],
    ['orange-300', 'tone-12'],
    ['pink-500', 'tone-13'],
    ['emerald-500', 'tone-14'],
    ['rose-400', 'tone-15'],
    ['purple-500', 'tone-16'],
    ['fuchsia-400', 'tone-17'],
    ['red-500', 'tone-18'],
    ['blue-500', 'tone-19'],
    ['indigo-400', 'tone-20'],
    ['lime-300', 'tone-21'],
    ['amber-600', 'tone-22'],
    ['zinc-400', 'tone-23'],
    ['red-300', 'tone-24'],
    ['blue-300', 'tone-25'],
    ['emerald-300', 'tone-26'],
    ['pink-300', 'tone-27'],
    ['sky-300', 'tone-28'],
    ['teal-200', 'tone-29'],
    ['violet-300', 'tone-30'],
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
    icon = icon.replace(new RegExp('^' + MARK_FA + 'solid\\s+', 'i'), '');
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
        return `이미 [${name}] 직업이 같은 색을 씁니다. 다른 색을 골라 주세요.`;
    }
    if (conflict.kind === 'both') {
        return `이미 [${name}] 직업이 같은 아이콘과 색을 씁니다. 다른 모양과 색을 골라 주세요.`;
    }
    return `이미 [${name}] 직업이 같은 아이콘을 씁니다. 다른 모양을 골라 주세요.`;
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

/** 학생 jobs 배열 항목에서 직업 이름 추출 (문자열/객체 모두 지원) */
export function getJobEntryName(job) {
    if (!job) return '';
    if (typeof job === 'string') return job.trim();
    if (typeof job === 'object' && job.name != null) return String(job.name).trim();
    return String(job).trim();
}

export function studentHasJobName(jobs, jobName) {
    const name = String(jobName || '').trim();
    if (!name) return false;
    return (Array.isArray(jobs) ? jobs : []).some((job) => getJobEntryName(job) === name);
}

/** 학생 스냅샷 한 칸과 카탈로그(또는 직업 카드)가 같은 직업인지 봅니다. id → 이름 → 모양·색 순입니다. */
export function ownedJobMatchesSpec(owned, jobSpec) {
    if (!owned || !jobSpec) return false;
    const ownedId = owned.id != null && owned.id !== '' ? String(owned.id) : '';
    const specId = jobSpec.id != null && jobSpec.id !== '' ? String(jobSpec.id) : '';
    if (ownedId && specId && ownedId === specId) return true;
    const ownedName = getJobEntryName(owned);
    const specName = String(jobSpec.name || '').trim();
    if (ownedName && specName && ownedName === specName) return true;
    if (owned.icon && jobSpec.icon) {
        const sameIcon = normalizeJobIcon(owned.icon) === normalizeJobIcon(jobSpec.icon);
        const sameColor = normalizeJobColor(owned.color) === normalizeJobColor(jobSpec.color);
        if (sameIcon && sameColor) return true;
    }
    return false;
}

/** 카탈로그에서 학생 스냅샷과 같은 직업을 찾습니다. */
export function findCatalogJobForOwned(owned, catalog) {
    const cat = Array.isArray(catalog) ? catalog : [];
    if (!owned) return null;
    if (typeof owned === 'string') {
        const name = owned.trim();
        return name ? cat.find((job) => String(job.name || '').trim() === name) || null : null;
    }
    const ownedId = owned.id != null && owned.id !== '' ? String(owned.id) : '';
    if (ownedId) {
        const byId = cat.find((job) => String(job.id) === ownedId);
        if (byId) return byId;
    }
    const name = getJobEntryName(owned);
    if (name) {
        const byName = cat.find((job) => String(job.name || '').trim() === name);
        if (byName) return byName;
    }
    if (owned.icon) {
        const icon = normalizeJobIcon(owned.icon);
        const color = normalizeJobColor(owned.color);
        const byLook = cat.find((job) =>
            normalizeJobIcon(job.icon) === icon && normalizeJobColor(job.color) === color);
        if (byLook) return byLook;
    }
    return null;
}

/**
 * 학생에게 저장된 직업 스냅샷을 지금 카탈로그 이름·아이콘·색으로 바꿉니다.
 * 직업 관리에서 모양이나 이름을 바꿔도 광장·홈 뱃지가 따라가게 합니다.
 */
export function resolveStudentJobsFromCatalog(jobs, catalog) {
    const list = Array.isArray(jobs) ? jobs : [];
    const cat = Array.isArray(catalog) ? catalog : [];
    return list.map((owned) => {
        const match = findCatalogJobForOwned(owned, cat);
        if (match) {
            return {
                id: match.id,
                name: match.name,
                icon: match.icon,
                color: match.color,
            };
        }
        if (typeof owned === 'string') {
            const name = owned.trim();
            return name ? { name, icon: 'star', color: 'tone-19' } : null;
        }
        const name = getJobEntryName(owned);
        const ownedId = owned && owned.id != null && owned.id !== '' ? String(owned.id) : '';
        if (!name && !ownedId) return null;
        return {
            ...(ownedId ? { id: ownedId } : {}),
            name,
            icon: String((owned && owned.icon) || 'star'),
            color: String((owned && owned.color) || 'tone-19'),
        };
    }).filter(Boolean);
}

/** 학생 문서에 저장된 직업 목록을 카탈로그 주급으로 합산합니다. */
export function sumCatalogPayForJobs(jobs, catalog) {
    const cat = Array.isArray(catalog) ? catalog : [];
    return resolveStudentJobsFromCatalog(jobs, cat).reduce((sum, owned) => {
        const match = findCatalogJobForOwned(owned, cat);
        const pay = Math.max(0, Math.round(Number(match && match.pay) || 0));
        return sum + pay;
    }, 0);
}

/** id가 있으면 id로, 없으면 이름·모양으로 장착 여부를 봅니다. 카탈로그가 있으면 먼저 동기화합니다. */
export function studentHasJob(jobs, jobSpec, catalog = []) {
    if (!jobSpec) return false;
    const source = Array.isArray(catalog) && catalog.length > 0
        ? resolveStudentJobsFromCatalog(jobs, catalog)
        : (Array.isArray(jobs) ? jobs : []);
    return source.some((owned) => ownedJobMatchesSpec(owned, jobSpec));
}

/** 같은 직업을 이미 쓰면 빼고, 없으면 기존 직업 옆에 하나 더 답니다. 1인 다역입니다. */
export function toggleJobAssignment(jobs, jobSpec, catalog = []) {
    const list = Array.isArray(jobs) ? jobs.slice() : [];
    if (!jobSpec || (!jobSpec.name && !jobSpec.id)) return list;
    const idx = list.findIndex((job) => {
        const resolved = Array.isArray(catalog) && catalog.length > 0
            ? (resolveStudentJobsFromCatalog([job], catalog)[0] || job)
            : job;
        return ownedJobMatchesSpec(resolved, jobSpec);
    });
    if (idx > -1) {
        list.splice(idx, 1);
        return list;
    }
    const name = String((jobSpec && jobSpec.name) || '').trim();
    if (!name) return list;
    const entry = {
        name,
        icon: String((jobSpec && jobSpec.icon) || 'star'),
        color: String((jobSpec && jobSpec.color) || 'tone-19'),
    };
    if (jobSpec.id != null && jobSpec.id !== '') entry.id = String(jobSpec.id);
    return list.concat([entry]);
}
