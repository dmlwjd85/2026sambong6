import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

assert.match(
  rules,
  /match\s+\/artifacts\/\{appId\}\/public\/data\/students\/\{studentId\}\s*\{/,
  '학생 문서는 전용 안전 규칙 match가 있어야 합니다.',
);

assert.doesNotMatch(
  rules,
  /match\s+\/artifacts\/\{appId\}\/public\/\{document=\*\*\}\s*\{/,
  '넓은 public catch-all은 학생 문서 안전 규칙을 우회시킬 수 있습니다.',
);

assert.match(
  rules,
  /match\s+\/artifacts\/\{appId\}\/public\/data\/\{collectionId\}\/\{document=\*\*\}\s*\{[\s\S]*allow\s+write:\s+if\s+request\.auth\s*!=\s*null\s*&&\s*collectionId\s*!=\s*'students'\s*;/,
  '공개 data catch-all 쓰기는 students 컬렉션을 제외해야 합니다.',
);

console.log('Firestore 규칙 회귀 테스트 통과');
