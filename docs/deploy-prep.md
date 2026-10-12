# 배포 준비

이 문서는 조사와 절차만 적습니다. Firestore 읽기·쓰기, `npm run deploy:firestore`, 머지, GitHub Pages 배포, `git revert` 실행은 하지 않았습니다.

비교 기준은 현재 `main`(`43768747109836e8efaed97f3c9c0740ae6ca4dd`)과 PR #29 헤드(`cursor/olympus-theme-7ab3`, PR #27 `cursor/guest-demo-ui-salary-f1ad`를 포함)입니다. 아이콘 시안 PR #30(`cursor/olympus-icon-drafts`, `2026sambong6/icon-drafts/`)은 넣지 않았습니다.

화면만 옮긴 브랜치는 `cursor/olympus-ui-only`입니다. `firestore.rules`는 `main`과 같습니다. `salaryPaidWeek` 트랜잭션과 `src/lib/weeklySalary.js`, 규칙 테스트, `public/sw.js`는 이 브랜치에 없습니다.

## 1. PR #29(#27 포함)의 규칙·데이터 쓰기

### `2026sambong6/firestore.rules`

`main`에는 없고 #29 쪽에만 있는 변경입니다. 화면 브랜치에는 넣지 않았습니다.

| 함수·매치 | 바뀐 쓰기·읽기 |
| --- | --- |
| `canAccessClassData()` | `signedIn()`과 같습니다. 학생 문서 읽기와 와일드카드 쓰기의 조건으로 씁니다. |
| `pad2(n)`, `salaryYmd(ts)`, `recentSalaryWeekKey()` | 한국 시간 기준 최근 주급 금요일 키 `SALARY_YYYY_MM_DD`를 규칙 안에서 만듭니다. |
| `salaryWeekValueIsRecent()` | `salaryPaidWeek`가 그 최근 키와 같은 문자열일 때만 참입니다. |
| `salaryMarkerIsSafe()` | `salaryPaidWeek`를 바꾸면 최근 키만 허용합니다. 비우거나 다른 주로 바꾸는 갱신은 거절합니다. |
| `salaryPayoutBongIsSafe()` | `salaryPaidWeek`와 `bong`을 같이 바꾸면 봉 증가가 200 이하여야 합니다. |
| `studentCreateIsSafe()` | 기존 `xp >= 0`, `bong >= -2000`에 `xp <= 0`, `bong <= 0`을 더합니다. 첫 문서의 초깃값이 0보다 크면 거절합니다. |
| `studentUpdateIsSafe()` | `salaryMarkerIsSafe()`, `salaryPayoutBongIsSafe()`를 통과해야 합니다. |
| `match /artifacts/{appId}/public/data/students/{studentId}` | 읽기가 `true`에서 `canAccessClassData()`로 바뀝니다. 만들기는 `studentCreateIsSafe()`, 갱신은 `studentUpdateIsSafe()`, 삭제는 그대로 거절입니다. |
| `match /artifacts/{appId}/public/{document=**}` | 삭제합니다. 이 와일드카드 갱신이 학생 경로의 XP 상한을 우회할 수 있었습니다. |
| `match /artifacts/{appId}/public/data/{collection}/{docId}` | 컬렉션 이름이 `students`가 아닐 때만 생성·삭제합니다. 갱신은 거기에 `salaryMarkerIsSafe()`를 더합니다. 읽기는 인증된 요청만입니다. |
| `match /artifacts/{appId}/public/data/{collection}/{docId}/{rest=**}` | 위와 같은 조건으로 하위 경로를 다룹니다. |

학생별 uid 명단은 규칙에 없습니다. 주석도 기기마다 익명 uid가 바뀌기 때문에 두지 않는다고 적혀 있습니다.

### 앱이 Firestore에 쓰는 방식

| 파일 | 함수 | 내용 | 화면 브랜치 |
| --- | --- | --- | --- |
| `2026sambong6/src/lib/weeklySalary.js` | `isSalaryWeekId`, `isSalaryPayWindow`, `salaryWeekId`, `recentSalaryWeekId`, `planStudentSalaryPayment` | 학생 필드를 직접 쓰지 않고, 주급 키와 `skip` / `mark` / `pay`를 계산합니다. 상한은 200입니다. | 제외 |
| `2026sambong6/src/lib/weeklySalary.test.js` | 같은 계산의 단위 테스트 | 프로덕션 쓰기 없음 | 제외 |
| `2026sambong6/src/sambongWorld.js` | `checkAndDistributeSalary` | #29는 트랜잭션에서 학생 문서에 `{ bong: increment(금액), salaryPaidWeek }` 또는 `{ salaryPaidWeek }`를 넣고, 전역 `settings/global.lastSalaryWeek`는 아직 없을 때만 적습니다. `main`은 `lastSalaryWeek`가 같으면 아무것도 쓰지 않고, 지급은 `{ bong: increment(pay) }`만 합니다. | `main`의 쓰기 형태로 되돌림. 데모 세션에서는 이 함수가 바로 반환해 실데이터를 건드리지 않습니다. |
| `2026sambong6/src/sambongWorld.js` | `attemptLogin` | 학생 문서가 없을 때의 `setDoc` 본문은 `main`과 같습니다. `xp: 0`, `bong: 0.0`과 빈 배열·객체입니다. 새 필드 `salaryPaidWeek`는 여기 없습니다. | 유지. 현재 규칙(`xp >= 0`, `bong >= -2000`)에서 허용됩니다. |
| `2026sambong6/src/sambongWorld.js` | `initApp` | `setPersistence(auth, browserLocalPersistence)`. 구경 세션이면 `signInAnonymously` 전에 반환하고, 이미 있으면 `signOut`합니다. | 유지. 아래 2절. |
| `2026sambong6/src/sambongWorld.js` | `ensureAnonAuthReady` | 게스트가 아니면 `signInAnonymously` | 유지 |
| `2026sambong6/src/sambongWorld.js` | `loginAsGuest` | 로컬 데모 상태만 만들고 `signOut`합니다. 학생 `setDoc`은 하지 않습니다. | 유지. 화면용이며 규칙 변경이 필요 없습니다. |
| `2026sambong6/src/sambongWorld.js` | `loginAsSomeoneElse` | `sambong_student_id`, `sambong_student_pin`만 지우고 새로고침합니다. `signOut`은 하지 않습니다. | 유지 |
| `2026sambong6/src/sambongWorld.js` | `isGuestSession`, `maskGuestWriteControls`, `watchGuestWriteControls` | 데모·게스트면 쓰기 버튼을 가리고, 주급·은행 부작용·관리 탭 진입을 막습니다. | 유지. 클라이언트 가드이며 규칙을 바꾸지 않습니다. |
| `2026sambong6/src/lib/guestDemo.js` | `buildGuestDemoRoster`, `buildGuestDemoClassMeta`, `buildGuestDemoStudents`, `buildGuestDemoTeacher`, `buildGuestPlayerState`, `guestMayWrite` | 메모리 속 가짜 학급입니다. `guestMayWrite`는 데모면 거짓입니다. | 유지 |
| `2026sambong6/src/rules/firestore.rules.test.js` | 에뮬레이터 테스트 | 인증 없는 읽기 거절, XP 650, `salaryPaidWeek` 형식, 생성 시 xp·bong 0, 학생 문서가 아닌 설정 갱신을 검사합니다. | 제외. 새 규칙이 없을 때 실패합니다. |
| `2026sambong6/src/lib/noticeInbox.js` | `pushNotice`, `markAllRead`, `unreadCount`, `noticeInboxStorageKey`, `loadNoticeInbox`, `serializeNoticeInbox` | `localStorage` 키 `sambong_notice_inbox_{학급}_{학생}`입니다. Firestore 필드는 아닙니다. | 유지 |
| `2026sambong6/src/lib/jobs.js` | `normalizeJobIcon`, `normalizeJobColor`, `DEFAULT_JOB_LOOKS` | 새 필드는 없습니다. 마스터가 직업을 저장할 때만 기존 `icon`, `color` 문자열이 `fa-*` / Tailwind 색에서 `crown`, `tone-01` 같은 값으로 바뀝니다. | 유지. 화면 아이콘에 필요합니다. |
| `2026sambong6/src/lib/adminDataExport.js`, `quizBank.js` | `loadXlsx`, `downloadAoaWorkbook`, `downloadAdminStudentWorkbook`, `parseQuizBankWorkbook`, `buildQuizBankTemplateWorkbook`, `downloadQuizBankTemplate` | xlsx를 동적 import로 바꿨습니다. 문서 구조는 그대로입니다. | 유지 |

`checkAndDistributeClassXP`, 점심 차감, 상점, 은행 트랜잭션의 필드 구성은 이 비교에서 주급 외에 새 Firestore 필드로 바뀌지 않았습니다.

## 2. 서비스 워커와 로그인 유지

### 서비스 워커

`public/sw.js`와 `navigator.serviceWorker.register`는 이 PR에 없습니다. #29에 있던 캐시 이름은 `mate-cache-v1`이고, 범위는 페이지 경로 `/2026sambong6/`입니다. 운영 Pages는 `main`만 배포하므로 그 파일은 아직 운영에 없습니다. 미리보기나 로컬 빌드를 연 기기는 등록돼 있을 수 있습니다.

그 기기에서 등록과 캐시를 지우는 킬 스위치입니다. `https://dmlwjd85.github.io/2026sambong6/`를 연 뒤 개발자 도구 콘솔에 붙여 넣습니다. 서버에 올리는 코드가 아닙니다.

```javascript
async function clearMateServiceWorker() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}
await clearMateServiceWorker();
location.reload();
```

### 로그인 유지

포함했습니다. 규칙 변경 없이 동작합니다.

- `initApp`의 `setPersistence(auth, browserLocalPersistence)`는 익명 사용자를 이 브라우저 IndexedDB에 남깁니다. 웹 SDK의 기본 지속성과 같고, 규칙을 읽지 않습니다.
- 학생 문서 경로는 `artifacts/{학급}/public/data/students/student_{번호}`입니다. 번호는 `localStorage`의 `sambong_student_id`입니다. `auth.uid`가 문서 id가 아닙니다.
- 현재 `main` 규칙은 학생 갱신에 `request.auth != null`만 보고, uid와 학생 번호의 짝을 검사하지 않습니다. uid가 유지돼도 다른 학생 문서로 연결이 바뀌지 않습니다.
- 예전에 방문마다 익명 uid가 새로 생겨도, 학급·번호·비밀번호가 남아 있으면 같은 학생 문서를 열었습니다. 지속성을 고정하면 그 uid가 더 이상 갈라지지 않을 뿐, 이미 있는 학생 문서의 필드나 id는 바뀌지 않습니다.
- 로그아웃은 학생 번호·비밀번호와 그 밖의 `localStorage`를 지운 뒤 학급 id와 최근 학급 목록만 되돌립니다. `signOut`은 하지 않으므로 익명 uid는 남습니다. “다른 사람으로 로그인”도 번호와 비밀번호만 지웁니다. 같은 기기의 다음 학생도 그 uid로 인증되지만, 데이터는 고른 학생 문서에 붙습니다.
- 첫 로그인 `setDoc`은 지금과 같이 `xp` 0, `bong` 0입니다. 현재 생성 규칙이 허용하는 범위입니다.

그래서 로그인 유지는 화면 브랜치에 두었습니다. `salaryPaidWeek`나 읽기 제한 규칙은 필요 없습니다.

## 3. 현재 배포와 되돌리기

GitHub Pages 주소는 `https://dmlwjd85.github.io/2026sambong6/`입니다. 저장소 Pages의 Build and deployment는 GitHub Actions입니다.

워크플로 파일은 `.github/workflows/deploy-2026sambong6-pages.yml`입니다.

- `main` 또는 `master`에 `2026sambong6/**` 또는 그 워크플로 파일이 푸시되면 실행됩니다.
- `workflow_dispatch`로도 실행됩니다.
- `2026sambong6`에서 `npm ci`와 `npm run build`를 한 뒤 `2026sambong6/dist`를 `actions/deploy-pages@v4`로 올립니다.
- Firestore 규칙은 이 워크플로가 배포하지 않습니다. 규칙 배포 스크립트는 `npm run deploy:firestore`이며 이번 작업에서 실행하지 않았습니다.

현재 운영 커밋은 복구 기준점입니다. 이 커밋 자체를 `git revert`하면 지금 운영 중인 본까지 되돌아갑니다. 되돌릴 대상은 [PR #31](https://github.com/dmlwjd85/2026sambong6/pull/31)을 `main`에 머지할 때 GitHub가 만드는 머지 커밋입니다. 그 SHA는 머지 후에 생깁니다.

기준점:

- SHA: `43768747109836e8efaed97f3c9c0740ae6ca4dd`
- 제목: Merge pull request #24 from dmlwjd85/cursor/praise-midnight-reset-d8a2
- 시각: 2026-10-10T16:26:06Z
- 배포 실행: [38067645070](https://github.com/dmlwjd85/2026sambong6/actions/runs/38067645070)

되돌리기는 `git revert`만 사용합니다. `reset --hard`, force-push, rebase는 쓰지 않습니다. 아래 명령은 기록용이며 실행하지 않았습니다. `main`에 푸시하면 Pages 워크플로가 그 결과를 다시 배포합니다.

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main
git log origin/main --merges --grep '#31' -1 --format='%H %s'
git revert -m 1 <PR31_MERGE_SHA>
git push origin main
```

`<PR31_MERGE_SHA>`에는 위 `git log`가 보여 주는 #31 머지 커밋을 넣습니다. `-m 1`은 그 머지의 첫 번째 부모, 즉 #31이 들어가기 직전의 `main`을 남깁니다. 그 사이에 다른 커밋이 없으면 트리 내용은 기준점 `43768747109836e8efaed97f3c9c0740ae6ca4dd`와 같습니다. 다른 커밋이 있으면 그 커밋은 남고 #31의 변경만 빠집니다.

### 대안으로 기준점 커밋을 다시 배포

`workflow_dispatch`의 `ref`는 브랜치 또는 태그입니다. 커밋 SHA를 넣으면 API가 거절합니다. 워크플로의 `actions/checkout`은 고른 ref의 끝을 빌드하므로, 기준점 SHA에 태그를 달고 그 태그를 실행하면 그 커밋이 다시 Pages에 올라갑니다. `main` 히스토리는 바뀌지 않습니다. 이후 `main`에 `2026sambong6/**`가 푸시되면 워크플로가 그 때의 `main`을 다시 배포합니다. 아래도 기록용이며 실행하지 않았습니다.

```bash
git fetch origin 43768747109836e8efaed97f3c9c0740ae6ca4dd
git tag pages-baseline-4376874 43768747109836e8efaed97f3c9c0740ae6ca4dd
git push origin pages-baseline-4376874
gh workflow run deploy-2026sambong6-pages.yml --ref pages-baseline-4376874
```

## 4. Firestore 읽기 전용 백업

실행하지 않았습니다. 프로젝트 id는 `2026sambong6/.firebaserc`의 `sambong-world-2026`입니다.

### gcloud 내보내기

관리자 권한으로 전체 데이터베이스를 Cloud Storage에 내보냅니다. 앱 코드나 보안 규칙을 거치지 않는 관리자 내보내기입니다. 버킷은 미리 있어야 하고, 계정은 Datastore Import Export 관리자 권한이 필요합니다.

```bash
gcloud firestore export gs://BUCKET/mate-firestore-$(date +%F) \
  --project=sambong-world-2026
```

특정 컬렉션만 받으려면 `--collection-ids=artifacts,classes,inviteCodes`를 더합니다. 복구는 `gcloud firestore import gs://BUCKET/경로 --project=sambong-world-2026`이며, 그것도 이 문서의 실행 범위가 아닙니다.

### 앱과 같은 읽기 권한으로 JSON 받기

현재 운영 규칙은 학생 문서와 `artifacts/{appId}/public/**` 읽기를 인증 없이 허용합니다. 앱은 그래도 익명 로그인을 한 뒤 읽습니다. 아래 초안은 그 경로를 따릅니다. `firebaseConfig`는 `src/sambongWorld.js`의 `initApp` 안에 있는 객체와 같게 넣습니다. 학생 문서 id 규칙도 앱과 같이 `student_` 접두사입니다.

이 파일을 만들어 실행하지 않았습니다. 서비스 계정 키는 쓰지 않습니다.

```javascript
import { writeFile } from 'node:fs/promises';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, getDocs, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  // src/sambongWorld.js initApp 의 firebaseConfig 를 그대로 붙입니다.
};
const classId = process.env.CLASS_ID;
if (!classId) throw new Error('CLASS_ID 가 필요합니다.');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInAnonymously(auth);

async function dump(pathSegments) {
  const snap = await getDocs(collection(db, ...pathSegments));
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
  return rows;
}

const backup = {
  exportedAt: new Date().toISOString(),
  classId,
  students: await dump(['artifacts', classId, 'public', 'data', 'students']),
  settings: await dump(['artifacts', classId, 'public', 'data', 'settings']),
};
await writeFile(`mate-read-backup-${classId}.json`, JSON.stringify(backup, null, 2));
```

익명 로그인은 Authentication에 사용자를 만듭니다. 학생 문서를 만들거나 고치지는 않습니다. 그 사용자 생성을 피하려면, 현재 규칙이 공개 읽기인 동안에는 `signInAnonymously`를 빼도 학생 컬렉션 `getDocs`가 됩니다. #29의 규칙이 나중에 적용되면 인증 없는 읽기는 거절되므로, 그때는 익명 로그인이 있는 초안이 앱의 읽기 경로와 같습니다.

## 화면 브랜치에 들어간 것

올림푸스 색·글자·버튼·아이콘, 로그인 최소 문서, Firebase·앱 모듈 동적 import, 글꼴 preload, 로그인 유지, 구경 화면의 로컬 데모와 쓰기 가드, 알림함의 브라우저 저장입니다.

들어가지 않은 것: `firestore.rules`, `salaryPaidWeek`, `weeklySalary.js`, 규칙 테스트, 서비스 워커, PR #30 아이콘 시안.
