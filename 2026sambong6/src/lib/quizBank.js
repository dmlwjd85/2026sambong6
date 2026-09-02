/**
 * 도전 탭 문제 은행 — 엑셀 일괄 업로드 · 골든벨/스피드퀴즈 보관 · 퀴즈 레이드 출제
 */
import * as XLSX from 'xlsx';

/** 한 학급 문제 은행에 보관할 최대 문항 수 (Firestore 문서 크기 여유) */
export const QUIZ_BANK_MAX = 400;
/** 퀴즈 레이드 기본 출제 수 */
export const QUIZ_RAID_DEFAULT_COUNT = 5;
/** 퀴즈 레이드 한 회차 최대 출제 수 */
export const QUIZ_RAID_MAX_COUNT = 20;
/** 한 문항 제한 시간(ms). 모두 제출하면 더 일찍 넘어갑니다. */
export const QUIZ_RAID_TURN_MS = 40000;
/** 시간 초과·선생님 넘기기로 미제출 처리한 값 */
export const QUIZ_RAID_SKIP_SENTINEL = '__skip__';
/** 객관식으로 인정할 최소 보기 수 */
export const QUIZ_MC_MIN_OPTIONS = 2;
export const QUIZ_MC_MAX_OPTIONS = 4;

/** 엑셀 1행 헤더 (다운로드 서식과 동일) */
export const QUIZ_BANK_HEADERS = [
    '문제',
    '정답',
    '보기1',
    '보기2',
    '보기3',
    '보기4',
    '정답번호',
    '출처',
    '보상XP',
    '보상봉',
];

const HEADER_ALIASES = {
    문제: 'q',
    질문: 'q',
    문항: 'q',
    q: 'q',
    question: 'q',
    정답: 'a',
    답: 'a',
    답안: 'a',
    a: 'a',
    answer: 'a',
    보기1: 'opt1',
    선지1: 'opt1',
    option1: 'opt1',
    보기2: 'opt2',
    선지2: 'opt2',
    option2: 'opt2',
    보기3: 'opt3',
    선지3: 'opt3',
    option3: 'opt3',
    보기4: 'opt4',
    선지4: 'opt4',
    option4: 'opt4',
    정답번호: 'answerNo',
    '정답번호(1-4)': 'answerNo',
    정답인덱스: 'answerNo',
    answerno: 'answerNo',
    answerindex: 'answerNo',
    출처: 'source',
    유형: 'source',
    source: 'source',
    보상xp: 'rewardXp',
    xp: 'rewardXp',
    보상봉: 'rewardBong',
    봉: 'rewardBong',
    bong: 'rewardBong',
};

const SOURCE_ALIASES = {
    골든벨: 'goldenbell',
    goldenbell: 'goldenbell',
    gb: 'goldenbell',
    스피드퀴즈: 'speedquiz',
    스피드: 'speedquiz',
    speedquiz: 'speedquiz',
    sq: 'speedquiz',
    엑셀: 'excel',
    excel: 'excel',
    직접: 'excel',
    수동: 'manual',
    manual: 'manual',
    레이드: 'excel',
    퀴즈레이드: 'excel',
};

/**
 * 골든벨·스피드 퀴즈·퀴즈 레이드 공통: 앞뒤 공백 제거, 연속 공백 축소, 영문 소문자 통일
 * @param {*} s
 * @returns {string}
 */
export function normalizeQuizAnswer(s) {
    if (s == null || s === undefined) return '';
    return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

function cellText(v) {
    if (v == null || v === undefined) return '';
    return String(v).trim();
}

function simpleHash(text) {
    const s = String(text || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

function parseNonNegInt(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.floor(n);
}

function parseNonNegNumber(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
}

function mapSource(raw, fallback = 'excel') {
    const key = normalizeQuizAnswer(raw).replace(/\s+/g, '');
    if (!key) return fallback;
    return SOURCE_ALIASES[key] || fallback;
}

function headerKey(cell) {
    const k = normalizeQuizAnswer(cell).replace(/\s+/g, '').replace(/[_-]/g, '');
    return HEADER_ALIASES[k] || '';
}

/**
 * @param {string} q
 * @returns {string}
 */
export function quizQuestionKey(q) {
    return normalizeQuizAnswer(q);
}

/**
 * 문제 은행 한 문항을 정규화합니다. 유효하지 않으면 null.
 * @param {object} raw
 * @returns {object|null}
 */
export function sanitizeQuizItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const q = cellText(raw.q);
    if (!q) return null;
    const optionsRaw = Array.isArray(raw.options)
        ? raw.options.map(cellText).filter(Boolean).slice(0, QUIZ_MC_MAX_OPTIONS)
        : [];
    const isMc = optionsRaw.length >= QUIZ_MC_MIN_OPTIONS;
    let answerIndex = raw.answerIndex;
    if (answerIndex != null && answerIndex !== '') {
        const n = Number(answerIndex);
        answerIndex = Number.isFinite(n) ? Math.floor(n) : null;
    } else {
        answerIndex = null;
    }
    let a = cellText(raw.a);
    if (isMc) {
        if (answerIndex == null || answerIndex < 0 || answerIndex >= optionsRaw.length) {
            const hit = optionsRaw.findIndex((opt) => normalizeQuizAnswer(opt) === normalizeQuizAnswer(a));
            if (hit < 0) return null;
            answerIndex = hit;
        }
        a = optionsRaw[answerIndex] || a;
    } else if (!a) {
        return null;
    }
    const source = mapSource(raw.source, raw.source ? String(raw.source) : 'excel');
    const id = cellText(raw.id) || `qb_${simpleHash(quizQuestionKey(q))}`;
    const addedAt = Number(raw.addedAt) || Date.now();
    const rewardXp = parseNonNegInt(raw.rewardXp, null);
    const rewardBong = parseNonNegNumber(raw.rewardBong, null);
    const item = {
        id,
        q,
        a,
        options: isMc ? optionsRaw : [],
        answerIndex: isMc ? answerIndex : null,
        type: isMc ? 'mc' : 'short',
        source: ['goldenbell', 'speedquiz', 'excel', 'manual'].includes(source) ? source : 'excel',
        addedAt,
    };
    if (rewardXp != null) item.rewardXp = rewardXp;
    if (rewardBong != null) item.rewardBong = rewardBong;
    return item;
}

/**
 * @param {*} raw
 * @returns {object[]}
 */
export function sanitizeQuizBank(raw) {
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.questions) ? raw.questions : []);
    const out = [];
    const seen = new Set();
    list.forEach((row) => {
        const item = sanitizeQuizItem(row);
        if (!item) return;
        const key = quizQuestionKey(item.q);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(item);
    });
    return out.slice(0, QUIZ_BANK_MAX);
}

/**
 * 기존 은행과 새 문항을 합칩니다. 같은 문제(정규화 키)는 새 문항이 덮어씁니다.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @param {{ max?: number }} [opts]
 */
export function mergeQuizBank(existing, incoming, opts = {}) {
    const max = opts.max != null ? opts.max : QUIZ_BANK_MAX;
    const map = new Map();
    sanitizeQuizBank(existing).forEach((item) => {
        map.set(quizQuestionKey(item.q), item);
    });
    sanitizeQuizBank(incoming).forEach((item) => {
        const key = quizQuestionKey(item.q);
        const prev = map.get(key);
        map.set(key, {
            ...item,
            addedAt: prev && prev.addedAt ? prev.addedAt : (item.addedAt || Date.now()),
            id: prev && prev.id ? prev.id : item.id,
        });
    });
    const merged = Array.from(map.values()).sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0));
    return merged.slice(0, max);
}

/**
 * @param {object[]} bank
 * @returns {{ total: number, goldenbell: number, speedquiz: number, excel: number, manual: number, mc: number, short: number }}
 */
export function countQuizBankBySource(bank) {
    const counts = { total: 0, goldenbell: 0, speedquiz: 0, excel: 0, manual: 0, mc: 0, short: 0 };
    sanitizeQuizBank(bank).forEach((item) => {
        counts.total += 1;
        if (counts[item.source] != null) counts[item.source] += 1;
        if (item.type === 'mc') counts.mc += 1;
        else counts.short += 1;
    });
    return counts;
}

/**
 * @param {Array} arr
 * @param {() => number} [rng]
 */
export function shuffleInPlace(arr, rng = Math.random) {
    const a = arr;
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
}

/**
 * 은행에서 n문항을 무작위로 고릅니다.
 * @param {object[]} bank
 * @param {number} n
 * @param {() => number} [rng]
 */
export function pickRandomQuizQuestions(bank, n, rng = Math.random) {
    const pool = sanitizeQuizBank(bank);
    const want = Math.max(0, Math.min(Math.floor(Number(n) || 0), pool.length, QUIZ_RAID_MAX_COUNT));
    const shuffled = shuffleInPlace(pool.slice(), rng);
    return shuffled.slice(0, want);
}

/**
 * 레이드 세션용 문항으로 변환합니다. 객관식 보기는 순서를 섞습니다.
 * @param {object} item
 * @param {() => number} [rng]
 */
export function toRaidSessionQuestion(item, rng = Math.random) {
    const q = sanitizeQuizItem(item);
    if (!q) return null;
    if (q.type === 'mc') {
        const pairs = q.options.map((text, i) => ({ text, i }));
        shuffleInPlace(pairs, rng);
        const options = pairs.map((p) => p.text);
        const a = pairs.findIndex((p) => p.i === q.answerIndex);
        return {
            q: q.q,
            type: 'mc',
            options,
            a,
            source: q.source,
            bankId: q.id,
        };
    }
    return {
        q: q.q,
        type: 'short',
        options: [],
        a: q.a,
        source: q.source,
        bankId: q.id,
    };
}

/**
 * 미제출(시간 초과·넘기기) 답안인지 봅니다.
 * @param {*} answer
 * @returns {boolean}
 */
export function isQuizRaidSkipAnswer(answer) {
    return answer === QUIZ_RAID_SKIP_SENTINEL;
}

/**
 * 문항 시작 시각 기준 남은 시간(ms). 시작 전이면 제한 시간 전체를 돌려줍니다.
 * @param {number} turnStartTime
 * @param {number} [nowMs]
 * @param {number} [limitMs]
 */
export function quizRaidTurnRemainingMs(turnStartTime, nowMs = Date.now(), limitMs = QUIZ_RAID_TURN_MS) {
    const start = Number(turnStartTime) || 0;
    if (start <= 0) return Math.max(0, Number(limitMs) || 0);
    return Math.max(0, (Number(limitMs) || 0) - (Number(nowMs) - start));
}

export function quizRaidTurnTimedOut(turnStartTime, nowMs = Date.now(), limitMs = QUIZ_RAID_TURN_MS) {
    const start = Number(turnStartTime) || 0;
    if (start <= 0) return false;
    return quizRaidTurnRemainingMs(start, nowMs, limitMs) <= 0;
}

/**
 * @param {Array<{id?: string|number}|null|undefined>} participants
 * @param {Record<string, unknown>} [turnSubs]
 * @returns {string[]}
 */
export function quizRaidUnansweredIds(participants, turnSubs) {
    const subs = turnSubs && typeof turnSubs === 'object' ? turnSubs : {};
    return (Array.isArray(participants) ? participants : [])
        .map((p) => (p && p.id != null ? String(p.id) : ''))
        .filter((id) => id && subs[id] === undefined);
}

/**
 * Firestore merge용 미제출 표시 필드
 * @param {number} turn
 * @param {string[]} unansweredIds
 */
export function buildQuizRaidSkipFields(turn, unansweredIds) {
    const payload = {};
    const t = Math.max(0, Math.floor(Number(turn) || 0));
    (unansweredIds || []).forEach((id) => {
        const key = String(id || '');
        if (!key) return;
        payload[`turnSubmissions.${t}.${key}`] = QUIZ_RAID_SKIP_SENTINEL;
    });
    return payload;
}

/**
 * 전원 제출·시간 초과·선생님 넘기기 중 하나면 다음 문항으로 갑니다.
 * @param {{ unansweredCount: number, timedOut?: boolean, force?: boolean }} args
 */
export function shouldAdvanceQuizRaidTurn(args) {
    const src = args && typeof args === 'object' ? args : {};
    if (src.force) return true;
    if (Number(src.unansweredCount) <= 0) return true;
    return !!src.timedOut;
}

export function gradeQuizRaidAnswer(question, answer) {
    if (!question) return false;
    if (isQuizRaidSkipAnswer(answer)) return false;
    if (question.type === 'mc') {
        return Number(answer) === Number(question.a);
    }
    return normalizeQuizAnswer(answer) === normalizeQuizAnswer(question.a);
}

/**
 * 골든벨 입력/초안 한 줄을 은행 문항으로 바꿉니다.
 * @param {object} row
 * @param {number} [index]
 */
export function questionFromGoldenBell(row, index = 0) {
    if (!row) return null;
    return sanitizeQuizItem({
        q: row.q,
        a: row.a,
        source: 'goldenbell',
        rewardXp: row.rewardXp,
        rewardBong: row.rewardBong,
        addedAt: Date.now() + index,
        id: row.id,
    });
}

/**
 * @param {object} row
 */
export function questionFromSpeedQuiz(row) {
    if (!row) return null;
    return sanitizeQuizItem({
        q: row.question || row.q,
        a: row.answer || row.a,
        source: 'speedquiz',
        rewardXp: row.rewardXp,
        rewardBong: row.rewardBong,
        addedAt: Date.now(),
        id: row.id,
    });
}

/**
 * 예전 협동 레이드(객관식 5문항) 초안을 은행 문항으로 바꿉니다.
 * @param {object} row
 * @param {number} [index]
 */
export function questionFromLegacyRaid(row, index = 0) {
    if (!row) return null;
    return sanitizeQuizItem({
        q: row.q,
        a: row.a,
        options: row.options,
        answerIndex: row.a,
        source: 'excel',
        addedAt: Date.now() + index,
        id: row.id,
    });
}

/**
 * 엑셀 AOA(1행 헤더)를 문항 배열로 파싱합니다.
 * @param {any[][]} aoa
 * @returns {{ questions: object[], errors: string[], skipped: number }}
 */
export function parseQuizBankAoa(aoa) {
    const errors = [];
    const questions = [];
    if (!Array.isArray(aoa) || aoa.length < 2) {
        return { questions, errors: ['엑셀에 헤더와 문항이 필요합니다.'], skipped: 0 };
    }
    const headerRow = (aoa[0] || []).map(cellText);
    const colMap = {};
    headerRow.forEach((h, i) => {
        const key = headerKey(h);
        if (key && colMap[key] == null) colMap[key] = i;
    });
    if (colMap.q == null) {
        return { questions, errors: ['1행에 「문제」 열이 없습니다. 제공된 서식을 사용해 주세요.'], skipped: 0 };
    }
    let skipped = 0;
    for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const get = (key) => (colMap[key] != null ? row[colMap[key]] : '');
        const q = cellText(get('q'));
        const a = cellText(get('a'));
        if (!q && !a) {
            skipped += 1;
            continue;
        }
        if (!q) {
            errors.push(`${r + 1}행: 문제가 비어 있습니다.`);
            continue;
        }
        const options = [get('opt1'), get('opt2'), get('opt3'), get('opt4')].map(cellText);
        const filledOpts = options.filter(Boolean);
        let answerNo = cellText(get('answerNo'));
        let answerIndex = null;
        if (answerNo !== '') {
            const n = Number(answerNo);
            if (Number.isFinite(n) && n >= 1 && n <= 4) answerIndex = n - 1;
            else if (Number.isFinite(n) && n >= 0 && n <= 3) answerIndex = n;
        }
        const item = sanitizeQuizItem({
            q,
            a,
            options: filledOpts.length ? options : [],
            answerIndex,
            source: get('source') || 'excel',
            rewardXp: get('rewardXp'),
            rewardBong: get('rewardBong'),
            addedAt: Date.now() + r,
        });
        if (!item) {
            errors.push(`${r + 1}행: 정답 또는 보기(객관식)를 확인하세요. (${q.slice(0, 24)})`);
            continue;
        }
        questions.push(item);
    }
    return { questions, errors, skipped };
}

/**
 * @param {ArrayBuffer|Uint8Array|string} data
 * @param {{ name?: string }} [meta]
 */
export function parseQuizBankWorkbook(data, meta = {}) {
    const name = String(meta.name || '').toLowerCase();
    let wb;
    try {
        if (typeof data === 'string' || name.endsWith('.csv')) {
            wb = XLSX.read(data, { type: typeof data === 'string' ? 'string' : 'array' });
        } else {
            wb = XLSX.read(data, { type: 'array' });
        }
    } catch (e) {
        return { questions: [], errors: ['엑셀 파일을 읽지 못했습니다. .xlsx 서식 파일을 사용해 주세요.'], skipped: 0 };
    }
            const sheetName = (wb.SheetNames || []).find((n) => n !== '작성안내') || (wb.SheetNames && wb.SheetNames[0]);
    if (!sheetName) {
        return { questions: [], errors: ['시트가 없는 파일입니다.'], skipped: 0 };
    }
    const sheet = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return parseQuizBankAoa(aoa);
}

/** 서식 파일용 예시 행 */
export function quizBankTemplateExampleRows() {
    return [
        QUIZ_BANK_HEADERS,
        ['대한민국의 수도는?', '서울', '', '', '', '', '', '골든벨', 10, 1],
        ['3 + 5 는?', '8', '6', '7', '8', '9', 3, '엑셀', 10, 1],
        ['물의 화학식은?', 'H2O', '', '', '', '', '', '스피드퀴즈', 50, 3],
    ];
}

export function quizBankGuideRows() {
    return [
        ['퀴즈 레이드 문제 은행 서식 안내'],
        [''],
        ['1. 「문제은행」 시트에 문항을 한 행씩 작성하세요.'],
        ['2. 주관식(골든벨·스피드퀴즈와 같음): 문제와 정답만 적으면 됩니다. 보기는 비워 두세요.'],
        ['3. 객관식: 보기1~보기4를 적고, 정답번호에 1~4를 넣거나 정답 칸에 보기 문구를 그대로 적으세요.'],
        ['4. 출처는 골든벨 / 스피드퀴즈 / 엑셀 중 하나를 적으면 됩니다. 비우면 엑셀로 저장됩니다.'],
        ['5. 보상XP·보상봉은 선택입니다. 퀴즈 레이드 보상은 마스터가 레이드 시작 화면에서 따로 정합니다.'],
        ['6. 저장한 파일을 도전 탭 → 퀴즈 레이드에서 한 번에 올리면 문제 은행에 쌓입니다.'],
        ['7. 골든벨 화면에서 같은 파일을 올리면 위 10칸이 채워지고, 나머지 문항도 은행에 저장됩니다.'],
        ['8. 퀴즈 레이드를 시작하면 골든벨·스피드퀴즈·엑셀로 모인 문제가 무작위로 출제됩니다.'],
    ];
}

/**
 * @returns {import('xlsx').WorkBook}
 */
export function buildQuizBankTemplateWorkbook() {
    const wb = XLSX.utils.book_new();
    const dataSheet = XLSX.utils.aoa_to_sheet(quizBankTemplateExampleRows());
    dataSheet['!cols'] = [
        { wch: 36 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, dataSheet, '문제은행');
    const guide = XLSX.utils.aoa_to_sheet(quizBankGuideRows());
    guide['!cols'] = [{ wch: 88 }];
    XLSX.utils.book_append_sheet(wb, guide, '작성안내');
    return wb;
}

/**
 * 브라우저에서 서식 파일을 내려받습니다.
 * @param {string} [fileName]
 */
export function downloadQuizBankTemplate(fileName) {
    const wb = buildQuizBankTemplateWorkbook();
    const name = fileName || '삼봉월드_퀴즈문제_서식.xlsx';
    XLSX.writeFile(wb, name);
    return { fileName: name };
}

/**
 * 골든벨 입력칸(최대 10개)에 넣을 값으로 변환합니다.
 * @param {object[]} questions
 * @param {number} [limit]
 */
export function fillGoldenBellSlotsFromBank(questions, limit = 10) {
    const max = Math.max(0, Math.floor(Number(limit) || 0));
    return sanitizeQuizBank(questions).slice(0, max).map((item, i) => ({
        originalIndex: i,
        q: item.q,
        a: item.a,
        rewardXp: item.rewardXp != null ? item.rewardXp : 10,
        rewardBong: item.rewardBong != null ? item.rewardBong : 1,
    }));
}

/**
 * 퀴즈 레이드 개인 보상 — 정답 비율 × 최대 보상. 무기는 XP에만 소량 가산.
 * @param {{ correct: number, total: number, rewardMaxXp: number, rewardMaxBong: number, weaponBonus?: number }} args
 */
export function computeQuizRaidReward(args) {
    const total = Math.max(0, Math.floor(Number(args && args.total) || 0));
    const correct = Math.max(0, Math.min(total, Math.floor(Number(args && args.correct) || 0)));
    const maxXp = Math.max(0, Math.floor(Number(args && args.rewardMaxXp) || 0));
    const maxBong = Math.max(0, Number(args && args.rewardMaxBong) || 0);
    const ratio = total > 0 ? correct / total : 0;
    let xp = Math.max(0, Math.min(maxXp, Math.floor(ratio * maxXp)));
    const bong = Math.max(0, Math.min(maxBong, Math.round(ratio * maxBong)));
    const weaponBonus = Math.max(0, Number(args && args.weaponBonus) || 0);
    if (weaponBonus > 0 && xp > 0) {
        xp = Math.max(xp, Math.min(maxXp, Math.round(xp * (1 + weaponBonus / 200))));
    }
    return { xp, bong, ratio, correct, total };
}
