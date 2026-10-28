/**
 * OX 퀴즈 문제 은행 파싱, 출제, 최고 기록.
 * 화면과 Firestore 쓰기는 여기 두지 않습니다.
 */
import * as XLSX from 'xlsx';

export const OX_HEADERS = ['과목', '문제', '정답(O/X)', '해설', '단원', '난이도'];
export const OX_TIME_CHOICES = [10, 15, 20, 30];
export const OX_COUNT_CHOICES = [5, 10, 15, 20];
export const OX_LIVES_CHOICES = [1, 2, 3, 5];
export const OX_BANK_MAX = 400;

const HEADER_FIELDS = {
    과목: 'subject',
    문제: 'prompt',
    '정답(o/x)': 'answer',
    정답: 'answer',
    해설: 'explain',
    단원: 'unit',
    난이도: 'level',
};

function cellText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function headerKey(value) {
    return cellText(value).replace(/\s/g, '').toLowerCase();
}

/** O/X만 정답으로 받습니다. 빈 값과 다른 글자는 거절합니다. */
export function normalizeOxAnswer(raw) {
    const text = cellText(raw).toUpperCase();
    if (text === 'O' || text === '○' || text === '⭕' || text === 'Y' || text === 'TRUE' || text === '맞음') return 'O';
    if (text === 'X' || text === '✕' || text === '✗' || text === '❌' || text === 'N' || text === 'FALSE' || text === '틀림') return 'X';
    return '';
}

function mapHeader(row) {
    const map = {};
    (row || []).forEach((cell, index) => {
        const field = HEADER_FIELDS[headerKey(cell)];
        if (field && map[field] == null) map[field] = index;
    });
    return map;
}

function rowIsBlank(row) {
    return !(row || []).some((cell) => cellText(cell));
}

/**
 * 첫 행은 헤더(1행)입니다. 오류의 line은 스프레드시트 행 번호입니다.
 * 빈 행은 건너뜁니다. 잘못된 행이 하나라도 있으면 questions는 비웁니다.
 */
export function parseOxQuizAoa(aoa) {
    const rows = Array.isArray(aoa) ? aoa : [];
    const errors = [];
    if (!rows.length) {
        return { questions: [], errors: ['1행: 헤더(과목, 문제, 정답(O/X), 해설, 단원, 난이도)가 없습니다.'] };
    }
    const header = mapHeader(rows[0]);
    ['subject', 'prompt', 'answer'].forEach((field) => {
        if (header[field] == null) {
            const label = field === 'subject' ? '과목' : field === 'prompt' ? '문제' : '정답(O/X)';
            errors.push(`1행: ${label} 열이 없습니다.`);
        }
    });
    if (errors.length) return { questions: [], errors };

    const questions = [];
    rows.slice(1).forEach((row, index) => {
        const line = index + 2;
        if (rowIsBlank(row)) return;
        const subject = cellText(row[header.subject]).slice(0, 40);
        const prompt = cellText(row[header.prompt]).slice(0, 240);
        const answer = normalizeOxAnswer(row[header.answer]);
        const explain = cellText(header.explain == null ? '' : row[header.explain]).slice(0, 240);
        const unit = cellText(header.unit == null ? '' : row[header.unit]).slice(0, 40);
        const level = cellText(header.level == null ? '' : row[header.level]).slice(0, 20);
        if (!subject) errors.push(`${line}행: 과목이 비어 있습니다.`);
        if (!prompt) errors.push(`${line}행: 문제가 비어 있습니다.`);
        if (!answer) errors.push(`${line}행: 정답은 O 또는 X 여야 합니다.`);
        if (subject && prompt && answer) {
            questions.push({
                id: `L${line}`,
                subject,
                prompt,
                answer,
                explain,
                unit,
                level,
            });
        }
    });
    if (!questions.length && !errors.length) {
        errors.push('2행: 올릴 문제가 없습니다.');
    }
    if (questions.length > OX_BANK_MAX) {
        errors.push(`문제가 ${OX_BANK_MAX}개를 넘습니다. 나눠 올려 주세요.`);
    }
    if (errors.length) return { questions: [], errors };
    return { questions, errors: [] };
}

function workbookSheet(wb) {
    const names = wb.SheetNames || [];
    const preferred = names.find((name) => name === '문제')
        || names.find((name) => name !== '작성안내');
    return preferred ? wb.Sheets[preferred] : null;
}

export function parseOxQuizWorkbook(data, type) {
    const wb = XLSX.read(data, { type, cellDates: false });
    const sheet = workbookSheet(wb);
    if (!sheet) return { questions: [], errors: ['문제 시트가 없습니다.'] };
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return parseOxQuizAoa(aoa);
}

export function parseOxQuizFile(buffer, fileName) {
    const name = String(fileName || '').toLowerCase();
    if (name.endsWith('.csv')) {
        const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
        return parseOxQuizWorkbook(text, 'string');
    }
    return parseOxQuizWorkbook(buffer, 'array');
}

export function oxTemplateRows() {
    return [
        OX_HEADERS,
        ['과학', '물은 표준 기압에서 100도에 끓는다.', 'O', '1기압 기준입니다.', '물질의 상태', '하'],
        ['사회', '대한민국의 수도는 부산이다.', 'X', '수도는 서울입니다.', '우리나라', '하'],
    ];
}

export function oxGuideRows() {
    return [
        ['OX 퀴즈 작성 안내'],
        [''],
        ['1. 「문제」 시트 1행 헤더는 그대로 두세요. 과목, 문제, 정답(O/X), 해설, 단원, 난이도'],
        ['2. 2행부터 한 문제씩 적습니다. 빈 행은 건너뜁니다.'],
        ['3. 정답은 O 또는 X만 적습니다. 다른 글자는 그 행 번호와 함께 거절됩니다.'],
        ['4. 과목과 문제는 비우지 마세요. 해설, 단원, 난이도는 비워도 됩니다.'],
        ['5. 올리기 기본은 추가입니다. 전체 바꾸기는 확인 후에만 문제 은행을 이 파일로 바꿉니다. 최고 기록은 유지됩니다.'],
        ['6. 예시 두 줄은 지우고 학급 문제로 바꾸세요.'],
    ];
}

export function buildOxTemplateWorkbook() {
    const wb = XLSX.utils.book_new();
    const problem = XLSX.utils.aoa_to_sheet(oxTemplateRows());
    problem['!cols'] = [{ wch: 12 }, { wch: 42 }, { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, problem, '문제');
    const guide = XLSX.utils.aoa_to_sheet(oxGuideRows());
    guide['!cols'] = [{ wch: 72 }];
    XLSX.utils.book_append_sheet(wb, guide, '작성안내');
    return wb;
}

/** 양식 받기는 생성하지 않고 public/ox 파일을 그대로 내려받습니다. */
export const OX_TEMPLATE_XLSX = 'ox/ox-quiz-template.xlsx';
export const OX_TEMPLATE_CSV = 'ox/ox-quiz-template.csv';

export function downloadOxPublicFile(href, filename) {
    const link = document.createElement('a');
    link.href = href;
    if (filename) link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

export function downloadOxTemplate() {
    downloadOxPublicFile(OX_TEMPLATE_XLSX, 'ox-quiz-template.xlsx');
}

export function downloadOxCsvTemplate() {
    downloadOxPublicFile(OX_TEMPLATE_CSV, 'ox-quiz-template.csv');
}

export function oxTemplateCsv() {
    return oxTemplateRows().map((row) => row.map((cell) => {
        const text = String(cell);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(',')).join('\n');
}

/**
 * 문제 은행 저장 계획.
 * 추가는 이 화면이 가진 목록이 아니라 서버에 있는 문제 뒤에 붙입니다.
 * 화면이 빈 목록을 들고 있어도 서버 문제를 지우지 않습니다.
 */
export function planOxQuestionWrite(existing, incoming, mode) {
    if (mode === 'replace') {
        const questions = (incoming || []).filter((item) => item && item.prompt && item.answer);
        if (!questions.length) return { questions: [], error: '올릴 문제가 없습니다.' };
        if (questions.length > OX_BANK_MAX) {
            return { questions: [], error: `문제가 ${OX_BANK_MAX}개를 넘습니다. 나눠 올려 주세요.` };
        }
        return { questions, error: '' };
    }
    return mergeOxQuestions(existing, incoming);
}

/** 은행을 아직 읽지 못했으면 빈 화면 기준으로 올리기를 막습니다. */
export function oxUploadBlockReason(bankReady) {
    if (bankReady) return '';
    return '문제 은행을 불러오지 못했습니다. 연결을 확인한 뒤 다시 열어 주세요.';
}

/** 추가 업로드. 기존 문제 id와 겹치지 않게 새 id를 붙입니다. */
export function mergeOxQuestions(existing, incoming) {
    const base = (existing || []).filter((item) => item && item.prompt && item.answer);
    const used = new Set(base.map((item) => String(item.id || '')));
    const added = [];
    (incoming || []).forEach((item, index) => {
        if (!item || !item.prompt || !item.answer) return;
        let n = index + 1;
        let id = `A${n}`;
        while (used.has(id)) {
            n += 1;
            id = `A${n}`;
        }
        used.add(id);
        added.push({ ...item, id });
    });
    const questions = base.concat(added);
    if (questions.length > OX_BANK_MAX) {
        return { questions: [], error: `문제가 ${OX_BANK_MAX}개를 넘습니다. 나눠 올려 주세요.` };
    }
    return { questions, error: '' };
}

export function listOxSubjects(questions) {
    const seen = [];
    (questions || []).forEach((item) => {
        const subject = cellText(item && item.subject);
        if (subject && !seen.includes(subject)) seen.push(subject);
    });
    return seen;
}

function shuffle(list, rng) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const swap = next[i];
        next[i] = next[j];
        next[j] = swap;
    }
    return next;
}

/** 과목을 하나 이상 고르고, 기본은 그 과목 안에서 무작위입니다. */
export function pickOxRound({ questions, subjects, count, random = true, rng = Math.random } = {}) {
    const selected = (subjects || []).map((item) => cellText(item)).filter(Boolean);
    if (!selected.length) return { questions: [], error: '과목을 하나 이상 고르세요.' };
    const pool = (questions || []).filter((item) => selected.includes(cellText(item.subject)));
    if (!pool.length) return { questions: [], error: '고른 과목에 문제가 없습니다.' };
    const size = OX_COUNT_CHOICES.includes(count) ? count : OX_COUNT_CHOICES[0];
    const ordered = random ? shuffle(pool, rng) : pool.slice();
    return { questions: ordered.slice(0, size), error: '' };
}

export function isBetterOxRecord(next, prev) {
    if (!next || !Number.isFinite(next.correct)) return false;
    if (!prev || !Number.isFinite(prev.correct)) return true;
    if (next.correct !== prev.correct) return next.correct > prev.correct;
    const nextMs = Number(next.elapsedMs) || 0;
    const prevMs = Number(prev.elapsedMs) || 0;
    return nextMs < prevMs;
}

export function chooseOxRecord(prev, next) {
    return isBetterOxRecord(next, prev) ? next : prev;
}

export function clampOxChoice(value, choices, fallback) {
    return choices.includes(value) ? value : fallback;
}
