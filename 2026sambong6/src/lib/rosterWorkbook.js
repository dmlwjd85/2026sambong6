/**
 * 학생 명단 엑셀/CSV 읽기와 서식 내려받기 (SheetJS).
 */
import * as XLSX from 'xlsx';
import { parseRosterAoa, rosterGuideRows, rosterTemplateRows } from './rosterImport.js';

/**
 * @param {ArrayBuffer|Uint8Array|string} data CSV는 문자열로 넘깁니다.
 */
export function parseRosterWorkbook(data) {
    let wb;
    try {
        wb = XLSX.read(data, { type: typeof data === 'string' ? 'string' : 'array' });
    } catch (e) {
        return { roster: [], errors: ['파일을 읽지 못했습니다. 명단 서식(.xlsx)이나 CSV를 사용해 주세요.'], warnings: [] };
    }
    const sheetName = (wb.SheetNames || []).find((n) => n !== '작성안내') || (wb.SheetNames && wb.SheetNames[0]);
    if (!sheetName) return { roster: [], errors: ['시트가 없는 파일입니다.'], warnings: [] };
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
    return parseRosterAoa(aoa);
}

export function buildRosterTemplateWorkbook() {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rosterTemplateRows());
    sheet['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, sheet, '명단');
    const guide = XLSX.utils.aoa_to_sheet(rosterGuideRows());
    guide['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, guide, '작성안내');
    return wb;
}

export function downloadRosterTemplate(fileName = '삼봉월드_학생명단_서식.xlsx') {
    XLSX.writeFile(buildRosterTemplateWorkbook(), fileName);
    return { fileName };
}
