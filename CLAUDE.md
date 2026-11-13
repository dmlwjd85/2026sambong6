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
