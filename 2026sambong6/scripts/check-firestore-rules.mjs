import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

const publicReadOnlyPattern = /match\s+\/artifacts\/\{appId\}\/public\/\{document=\*\*\}\s*\{\s*allow\s+read:\s+if\s+true;\s*\}/m;
const scopedPublicDataWritePattern = /match\s+\/artifacts\/\{appId\}\/public\/data\/\{collectionId\}\/\{document=\*\*\}\s*\{[\s\S]*allow\s+write:\s+if\s+signedIn\(\)\s+&&\s+collectionId\s+!=\s+'students';[\s\S]*\}/m;
const publicCatchAllBlock = rules.match(/match\s+\/artifacts\/\{appId\}\/public\/\{document=\*\*\}\s*\{([\s\S]*?)\n    \}/m);

if (!publicReadOnlyPattern.test(rules)) {
  throw new Error('public catch-all 규칙은 읽기 전용이어야 합니다.');
}

if (!scopedPublicDataWritePattern.test(rules)) {
  throw new Error('public/data 쓰기 규칙은 students 컬렉션을 제외해야 합니다.');
}

if (!publicCatchAllBlock || publicCatchAllBlock[1].includes('allow write:')) {
  throw new Error('public catch-all 쓰기는 학생 문서 보호 규칙을 우회시킬 수 있습니다.');
}
