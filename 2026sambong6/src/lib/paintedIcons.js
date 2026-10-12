/**
 * set41 그림은 화면 표시에만 씁니다.
 * 직업 문서의 icon 문자열과 급여 계산은 이 파일을 거치지 않습니다.
 */
import { isJobIconStorageToken } from './jobs.js';

export const PAINTED_ICON_NAMES = [
    'admin', 'bank', 'boardgames', 'chalk', 'challenge', 'classboard', 'classitem', 'classtools',
    'constitution', 'convenience', 'economy', 'estate', 'goldenbell', 'groupbuy', 'help', 'home',
    'item', 'jobs', 'literature', 'lottery', 'lotto', 'lunch', 'martial', 'more', 'morning',
    'openlesson', 'padlet', 'plaza', 'quest', 'raid', 'rank', 'rps', 'settings', 'shop', 'skin',
    'speedquiz', 'thermo', 'timer', 'timetable', 'vote', 'wheel',
];

const PAINTED = new Set(PAINTED_ICON_NAMES);

/**
 * 앱 화면의 옛 토큰 → set41 파일 이름.
 * 직업 저장 토큰(crown, shield, fa-shield-cat 등)은 넣지 않습니다.
 */
export const APP_ICON_DISPLAY = {
    lyre: 'literature',
    sandal: 'economy',
    torch: 'challenge',
    'building-columns': 'bank',
    campground: 'plaza',
    'chess-rook': 'estate',
    briefcase: 'jobs',
    'circle-question': 'help',
    sliders: 'settings',
    building: 'estate',
    'ranking-star': 'rank',
    brain: 'raid',
    'scale-balanced': 'constitution',
};

function canonIconToken(raw) {
    let name = String(raw || '').trim();
    const prefix = 'fa' + '-';
    if (name.startsWith(prefix)) name = name.slice(prefix.length);
    return name.replace(/[^a-z0-9-]/gi, '');
}

/** set41 파일 이름. 직업 저장 토큰이면 빈 문자열입니다. */
export function paintedIconName(raw) {
    if (isJobIconStorageToken(raw)) return '';
    const name = canonIconToken(raw);
    if (!name || isJobIconStorageToken(name)) return '';
    if (PAINTED.has(name)) return name;
    const aliased = APP_ICON_DISPLAY[name];
    if (aliased && PAINTED.has(aliased)) return aliased;
    return '';
}

/** lazy picture 가 가리킬 주소. 512 원본은 만들지 않습니다. */
export function paintedIconSources(raw, base) {
    const id = paintedIconName(raw);
    if (!id) return null;
    const root = `${String(base || '/').replace(/\/?$/, '/')}icons/set41`;
    return {
        id,
        svg24: `${root}/svg24/${id}.svg`,
        webp: {
            96: `${root}/webp/96/${id}.webp`,
            192: `${root}/webp/192/${id}.webp`,
            288: `${root}/webp/288/${id}.webp`,
        },
    };
}
