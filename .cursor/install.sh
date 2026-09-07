#!/usr/bin/env bash
# Cloud Agent 의존성 설치 스크립트.
# 두 개의 Vite(React) 앱 의존성을 각각 설치한다.
# - 2026sambong6: package-lock.json 이 있으므로 `npm ci`(없으면 `npm install`).
# - All-in-One-Home: 잠금 파일이 없으므로 `npm install`.
# 재실행해도 안전하도록(idempotent) 각 앱 폴더에서만 설치를 수행한다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 2026sambong6 의존성 설치"
cd "$ROOT_DIR/2026sambong6"
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

echo "==> All-in-One-Home 의존성 설치"
cd "$ROOT_DIR/All-in-One-Home"
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

echo "==> 설치 완료"
