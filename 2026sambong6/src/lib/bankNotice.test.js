import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    bankNoticeStorageKey,
    buildBankExecutionNotice,
    dismissBankNotice,
    isBankNoticeDismissed,
} from './bankNotice.js';

describe('은행 안내 다시 보지 않기', () => {
    it('체크하기 전에는 보이고, 저장하면 숨긴다', () => {
        const box = new Map();
        const storage = {
            getItem: (k) => (box.has(k) ? box.get(k) : null),
            setItem: (k, v) => box.set(k, v),
        };
        const key = bankNoticeStorageKey('sambong-class-2026', '3');
        assert.equal(isBankNoticeDismissed(storage, key), false);
        dismissBankNotice(storage, key);
        assert.equal(isBankNoticeDismissed(storage, key), true);
        assert.equal(isBankNoticeDismissed(storage, bankNoticeStorageKey('sambong-class-2026', '1')), false);
    });
});

describe('은행 안내 문구', () => {
    it('만기 입금과 대출 자동이체, 학생의 적금을 같이 적는다', () => {
        const text = buildBankExecutionNotice({
            unit: '봉',
            rate: 10,
            terms: [{ amount: 250, matureOn: '2026-09-26', daysShow: 29 }],
            loan: null,
            events: ['원금 10봉 + 이자 1봉이 지갑으로 들어왔습니다.'],
        });
        assert.match(text, /따로 출금하지 않습니다/);
        assert.match(text, /2026-09-26 만기/);
        assert.match(text, /250봉/);
        assert.match(text, /지갑으로 들어왔습니다/);
        assert.match(text, /이미 갚은 것/);
    });
});
