import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8')

assert(
  rules.includes('match /artifacts/{appId}/public/data/students/{studentId}'),
  '학생 문서 전용 규칙이 있어야 합니다.',
)

assert(
  !rules.includes('match /artifacts/{appId}/public/{document=**}'),
  'public 전체 재귀 쓰기 규칙은 학생 문서 제한을 우회하므로 사용하면 안 됩니다.',
)

assert(
  /match\s+\/artifacts\/\{appId\}\/public\/data\/\{collectionId\}\/\{document=\*\*\}[\s\S]*allow write: if request\.auth != null && collectionId != 'students';/.test(
    rules,
  ),
  '광범위 public/data 쓰기는 students 컬렉션을 반드시 제외해야 합니다.',
)

console.log('Firestore 규칙 정적 검증 통과')
