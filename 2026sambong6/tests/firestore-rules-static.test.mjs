import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = await readFile(join(__dirname, '..', 'firestore.rules'), 'utf8');

// 학생 문서는 전용 match만 쓰기 허용해야 삭제 금지와 수치 하락 방어가 실제로 적용됩니다.
assert.match(
  rules,
  /match\s+\/artifacts\/\{appId\}\/public\/data\/students\/\{studentId\}\s*\{[\s\S]*?allow\s+delete:\s+if\s+false;/,
  '학생 문서 삭제 금지 규칙이 필요합니다.',
);

assert.doesNotMatch(
  rules,
  /match\s+\/artifacts\/\{appId\}\/public\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+write:\s+if\s+(?:request\.auth\s*!=\s*null|signedIn\(\))/,
  'public 전체 catch-all 쓰기는 학생 문서 전용 규칙을 우회시킵니다.',
);

assert.match(
  rules,
  /match\s+\/artifacts\/\{appId\}\/public\/data\/\{collectionId\}\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+write:\s+if\s+signedIn\(\)\s*&&\s*collectionId\s*!=\s*'students';/,
  'public/data catch-all 쓰기는 students 컬렉션을 제외해야 합니다.',
);
