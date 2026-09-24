/**
 * 적금·대출이 어떻게 실행되는지 학생에게 보여주는 안내.
 * 다시 보지 않기는 학생·학급마다 브라우저에 저장합니다.
 */

export function bankNoticeStorageKey(classId, studentId) {
    const cid = String(classId || 'class');
    const sid = String(studentId || 'student');
    return `sambong_bank_notice_v1_${cid}_${sid}`;
}

export function isBankNoticeDismissed(storage, key) {
    if (!key || !storage || typeof storage.getItem !== 'function') return false;
    return storage.getItem(key) === '1';
}

export function dismissBankNotice(storage, key) {
    if (!key || !storage || typeof storage.setItem !== 'function') return;
    storage.setItem(key, '1');
}

/**
 * @param {{
 *   unit?: string,
 *   rate?: number,
 *   terms?: Array<{ amount: number, startDate: string, matureOn?: string, daysShow?: number }>,
 *   loan?: { principal: number, interest: number, due: number, dueYmd: string } | null,
 *   events?: string[],
 * }} input
 */
export function buildBankExecutionNotice(input = {}) {
    const unit = String(input.unit || 'B');
    const rate = Number(input.rate);
    const rateText = Number.isFinite(rate) ? `${rate}%` : '설정된 이율';
    const money = (n) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return `0${unit}`;
        return `${v}${unit}`;
    };
    const lines = [
        '적금과 대출은 앱이 알아서 처리합니다. 따로 출금하지 않습니다.',
        '',
        '[적금]',
        '· 가입한 날부터 30일이 되는 날이 만기입니다.',
        `· 만기일에 접속하면 원금과 이자(지금 ${rateText}, 반올림)가 바로 지갑으로 들어옵니다.`,
        '· 일반예금으로 가지 않습니다. 만기 통장에서 다시 빼는 단계가 없습니다.',
        '· 만기 전에 해지하면 원금만 지갑으로 돌아오고 이자는 없습니다.',
        '',
        '[대출]',
        '· 빌리면 원금이 바로 지갑에 들어옵니다.',
        '· 약정일이 되면 접속하는 순간, 지갑에서 먼저 빼고 모자라면 일반예금에서 원금과 이자를 갚습니다.',
        '· 그러면 대출 칸이 비고, 화면에는 이미 갚은 것으로 나옵니다.',
        '· 적금에 잠긴 돈은 대출을 갚는 데 쓰지 않습니다.',
    ];
    const terms = Array.isArray(input.terms) ? input.terms : [];
    if (terms.length) {
        lines.push('', '[지금 가입 중인 적금]');
        terms.forEach((td, i) => {
            const when = td.matureOn ? `${td.matureOn} 만기` : '만기일 확인 중';
            const day = td.daysShow ? ` · ${td.daysShow}/30일` : '';
            lines.push(`· ${i + 1}번 원금 ${money(td.amount)} · ${when}${day}`);
        });
    }
    const loan = input.loan;
    if (loan && loan.dueYmd) {
        lines.push('', '[지금 진행 중인 대출]');
        lines.push(`· 원금 ${money(loan.principal)} + 이자 ${money(loan.interest)} = ${money(loan.due)}`);
        lines.push(`· 약정일 ${loan.dueYmd}에 자동으로 갚습니다.`);
    }
    const events = (Array.isArray(input.events) ? input.events : []).map((s) => String(s || '').trim()).filter(Boolean);
    if (events.length) {
        lines.push('', '[방금 처리된 내용]');
        events.forEach((row) => lines.push(`· ${row}`));
    }
    return lines.join('\n');
}
