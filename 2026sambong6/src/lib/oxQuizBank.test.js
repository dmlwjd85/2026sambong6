import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OX_QUIZ_BANK_DOC_ID, oxQuizBankCollectionPath, oxQuizBankDocPath } from './oxQuizBank.js';

describe('OX 문제 은행 경로', () => {
    it('규칙과 같은 artifacts/{학급}/public/data/oxQuizBank 를 쓴다', () => {
        const rules = fs.readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
        assert.equal(oxQuizBankCollectionPath('sambong-class-2026'), 'artifacts/sambong-class-2026/public/data/oxQuizBank');
        assert.equal(oxQuizBankDocPath('sambong-class-2026'), 'artifacts/sambong-class-2026/public/data/oxQuizBank/bank');
        assert.equal(OX_QUIZ_BANK_DOC_ID, 'bank');
        assert.match(rules, /match \/artifacts\/\{appId\}\/public\/data\/oxQuizBank\/\{document=\*\*\}/);
        assert.match(rules, /function isOxQuizBankDoc\(\)/);
    });
});