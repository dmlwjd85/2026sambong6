import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rulesPath = resolve(__dirname, '..', 'firestore.rules');
const rules = readFileSync(rulesPath, 'utf8');

function assertRule(condition, message) {
  if (!condition) {
    console.error(`Firestore 규칙 점검 실패: ${message}`);
    process.exitCode = 1;
  }
}

const broadPublicMatch = rules.match(/match\s+\/artifacts\/\{appId\}\/public\/\{document=\*\*\}\s*\{([\s\S]*?)\n\s*\}/);
assertRule(!!broadPublicMatch, 'public 전체 읽기 match가 필요합니다.');
assertRule(
  broadPublicMatch && !/\ballow\s+write\b/.test(broadPublicMatch[1]),
  'public 전체 재귀 match에서 write를 허용하면 students 전용 규칙이 우회됩니다.'
);

const scopedDataMatch = rules.match(/match\s+\/artifacts\/\{appId\}\/public\/data\/\{collectionId\}\/\{document=\*\*\}\s*\{([\s\S]*?)\n\s*\}/);
assertRule(!!scopedDataMatch, 'public/data 컬렉션별 write match가 필요합니다.');
assertRule(
  scopedDataMatch && /collectionId\s*!=\s*['"]students['"]/.test(scopedDataMatch[1]),
  'students 컬렉션은 범용 public/data write 규칙에서 제외되어야 합니다.'
);

const studentsMatch = rules.match(/match\s+\/artifacts\/\{appId\}\/public\/data\/students\/\{studentId\}\s*\{([\s\S]*?)\n\s*\}/);
assertRule(!!studentsMatch, 'students 전용 match가 필요합니다.');
assertRule(
  studentsMatch && /allow\s+delete\s*:\s*if\s+false\s*;/.test(studentsMatch[1]),
  '학생 문서 삭제는 명시적으로 금지되어야 합니다.'
);
assertRule(
  studentsMatch && /allow\s+create\s*:\s*if\s+studentCreateIsSafe\(\)\s*;/.test(studentsMatch[1]),
  '학생 문서 생성은 studentCreateIsSafe()를 통과해야 합니다.'
);
assertRule(
  studentsMatch && /allow\s+update\s*:\s*if\s+studentUpdateIsSafe\(\)\s*;/.test(studentsMatch[1]),
  '학생 문서 수정은 studentUpdateIsSafe()를 통과해야 합니다.'
);

if (!process.exitCode) {
  console.log('Firestore 규칙 점검 통과');
}
