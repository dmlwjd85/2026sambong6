/**
 * 학급 단위 기능 해금. 시드·예전 학급은 기록이 없으면 전부 켠 것으로 봅니다.
 * 새로 만든 반만 기본 기능만 켜 두고 교사가 하나씩 엽니다.
 */

export const CLASS_MODULE_CATALOG = [
    { id: 'home', label: '홈·캐릭터', basic: true, hint: '출석·캐릭터·퀘스트 장비가 있는 기본 화면입니다.' },
    { id: 'plaza', label: '광장', basic: true, hint: '학급 친구들을 한눈에 보는 자리입니다.' },
    { id: 'quests', label: '퀘스트', basic: true, hint: '일일·주간 과제를 주고받습니다.' },
    { id: 'jobs', label: '직업', basic: true, hint: '1인 1역과 주급을 다룹니다.' },
    { id: 'constitution', label: '헌법', basic: true, hint: '우리 반 약속을 읽고 고칩니다.' },
    { id: 'help', label: '도움말', basic: true, hint: '사용 안내와 개인정보 안내입니다.' },
    { id: 'literature', label: '문학', basic: false, hint: '읽기 기록과 일기를 엽니다. 저학년은 천천히 켜 주세요.' },
    { id: 'economy', label: '경제', basic: false, hint: '상점·은행·부동산·공동구매를 엽니다.' },
    { id: 'lunch', label: '밥줄', basic: false, hint: '점심 우선권 투자를 엽니다.' },
    { id: 'challenge', label: '도전', basic: false, hint: '골든벨·스피드퀴즈·레이드를 엽니다.' },
    { id: 'classtools', label: '수업도구', basic: false, hint: '시간표·칠판·타이머·돌림판 등을 엽니다.' },
    { id: 'portal', label: '외부 세계', basic: false, hint: '차원문 링크를 엽니다. 링크는 이 학급에만 따로 넣습니다.' },
    { id: 'hof', label: '명예의 전당', basic: false, hint: '시즌 기록 도서관을 맵에 보여 줍니다.' },
];

export const BASIC_CLASS_MODULE_IDS = CLASS_MODULE_CATALOG.filter((m) => m.basic).map((m) => m.id);

/** 하단 탭 → 기능 해금 id. 없는 탭(마스터·설정)은 잠그지 않습니다. */
export const TAB_CLASS_MODULE = Object.freeze({
    dashboard: 'home',
    plaza: 'plaza',
    quests: 'quests',
    literature: 'literature',
    jobs: 'jobs',
    economy: 'economy',
    shop: 'economy',
    bank: 'economy',
    estate: 'economy',
    lunch: 'lunch',
    challenge: 'challenge',
    goldenbell: 'challenge',
    constitution: 'constitution',
    classtools: 'classtools',
    help: 'help',
});

export function classModuleForTab(tabId) {
    return TAB_CLASS_MODULE[String(tabId || '')] || null;
}

export const NEW_CLASS_CONSTITUTION_ITEMS = [
    { id: 'nc1', type: 'chapter', text: '제1장 우리 반 약속' },
    { id: 'nc1_a1', type: 'clause', text: '제1조 서로를 존중한다. 말과 행동으로 친구의 마음을 다치게 하지 않는다.' },
    { id: 'nc1_a2', type: 'clause', text: '제2조 정직하게 참여한다. 퀘스트·상점·은행은 있는 그대로 기록한다.' },
    { id: 'nc1_a3', type: 'clause', text: '제3조 함께 돕는다. 도움이 필요한 친구를 외면하지 않는다.' },
    { id: 'nc2', type: 'chapter', text: '제2장 고치기' },
    { id: 'nc2_a1', type: 'clause', text: '제4조 이 헌법은 우리 반에 맞게 선생님이 고칠 수 있다.' },
];

export function classModuleById(id) {
    return CLASS_MODULE_CATALOG.find((m) => m.id === String(id || '')) || null;
}

export function hasClassModuleRecord(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.classModules : raw;
    return !!(src && typeof src === 'object' && !Array.isArray(src) && Object.keys(src).length);
}

function allEnabledMap() {
    const out = {};
    CLASS_MODULE_CATALOG.forEach((m) => { out[m.id] = true; });
    return out;
}

/** mode 'new' = 기본만 켬. 'full' = 전부 켬. 그 외는 저장값을 따름. */
export function sanitizeClassModules(raw, { mode = 'saved' } = {}) {
    if (mode === 'full' || (mode === 'saved' && !hasClassModuleRecord({ classModules: raw }))) {
        return allEnabledMap();
    }
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    CLASS_MODULE_CATALOG.forEach((m) => {
        if (mode === 'new') {
            out[m.id] = !!m.basic;
            return;
        }
        if (m.basic) out[m.id] = src[m.id] !== false;
        else out[m.id] = src[m.id] === true;
    });
    return out;
}

export function newClassModules() {
    return sanitizeClassModules({}, { mode: 'new' });
}

export function isClassModuleEnabled(settingsOrModules, moduleId, { isSeed = false } = {}) {
    if (isSeed) return true;
    const raw = settingsOrModules && settingsOrModules.classModules
        ? settingsOrModules.classModules
        : settingsOrModules;
    if (!hasClassModuleRecord({ classModules: raw })) return true;
    const map = sanitizeClassModules(raw, { mode: 'saved' });
    return !!map[String(moduleId || '')];
}

export function unlockClassModule(settingsOrModules, moduleId) {
    const item = classModuleById(moduleId);
    const current = settingsOrModules && settingsOrModules.classModules
        ? settingsOrModules.classModules
        : settingsOrModules;
    const map = sanitizeClassModules(current, { mode: hasClassModuleRecord({ classModules: current }) ? 'saved' : 'new' });
    if (item) map[item.id] = true;
    return map;
}
