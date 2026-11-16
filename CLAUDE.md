# 작업 메모 (Claude용)

## 배포
- 앱: `main`에 푸시하면 GitHub Actions가 GitHub Pages로 배포해요(`deploy-2026sambong6-pages.yml`).
- **Firestore 규칙(`2026sambong6/firestore.rules`)을 바꾸면 항상 배포까지 해요.** (선생님 요청, 2026-11-13)
  - 저장소에 `FIREBASE_SERVICE_ACCOUNT` 시크릿이 없어서 `deploy-firestore-rules.yml`은 테스트만 하고 배포는 건너뛰어요.
  - 그래서 Google Cloud 콘솔 → Firestore → 보안 규칙(`console.cloud.google.com/firestore/databases/-default-/security/rules?project=sambong-world-2026`)에서
    새 규칙 세트에 저장소의 `firestore.rules` 전체를 그대로 붙여 넣고 게시해요. 콘솔 규칙과 저장소 파일이 늘 같아야 해요.
  - 시크릿이 등록되면 워크플로가 자동으로 배포하니 콘솔 작업은 필요 없어요.

## 데이터 안전
- 이 프로젝트는 무료 요금제라 Firestore 시점 복구(PITR)·예약 백업이 없어요. 예전 값은 최대 1시간만 남아요.
- 부동산 자리표는 바뀌기 직전 상태를 `estate/history`에 자동 백업하고, 마스터 화면 「자리표 되돌리기」로 되돌려요(#105).
- 무료 요금제 하루 한도(읽기 5만·쓰기 2만)가 다 차면 오후 5시(한국 시간, 태평양 자정)까지 모든 저장·읽기가 `RESOURCE_EXHAUSTED`(Quota exceeded)로 실패해요.
  공개 읽기 REST(`firestore.googleapis.com/v1/projects/sambong-world-2026/.../documents/...`)가 429를 주면 한도 초과예요(2026-11-16 확인).
  실패한 저장을 자동으로 되풀이하는 코드(되돌리고 다시 쓰기, 1분 미만 재시도 루프)는 만들지 않아요.
- 읽기 줄이기(v1.83): 학생 문서 저장 한 번 = 접속한 반 전체가 그 문서를 한 번씩 읽어요. 그래서 펫의 잦은 일(먹이·놀이·경험치 팩·강화·이름·대표 펫)은
  `petMode.js`의 `commit(..., { batch: true })`로 15초(최대 8건)씩 모아 한 번에 저장해요. 탐험·보스 방 목록 알림(`raidCallBanner`)은 도전 탭을 볼 때만 구독해요.
