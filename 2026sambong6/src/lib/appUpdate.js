/**
 * 새 버전 알아보기(순수 함수). 화면을 며칠씩 켜 둔 태블릿이 옛 코드로 저장하지 않게, 새로 배포되면 알맞은 때 새로 고쳐요.
 * 배포된 index.html 이 가리키는 앱 묶음 파일 이름(assets/index-해시.js)으로 판단해요. Firestore 읽기를 쓰지 않아요.
 */

/** index.html 글에서 앱 묶음 파일 이름. 없으면 '' */
export function bundleNameFromHtml(html) {
    const m = String(html || '').match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    return m ? m[1] : '';
}

/** 지금 화면이 쓰는 앱 묶음 파일 이름(스크립트 주소에서). 없으면 '' (개발 서버 등) */
export function bundleNameFromSrc(src) {
    const m = String(src || '').match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    return m ? m[1] : '';
}

/** 새 버전인지: 둘 다 알 때만, 다를 때 true */
export function isNewBundle(current, latest) {
    return !!current && !!latest && current !== latest;
}

/**
 * 지금 새로 고쳐도 되는지.
 * - 화면이 가려져 있으면 언제든 돼요(다시 볼 때 새 화면).
 * - 보고 있으면 2분 넘게 손대지 않았고, 하던 일(창·전투·퀴즈·입력)이 없을 때만 돼요.
 * - 펫 먹이·강화처럼 아직 서버에 안 간 일이 있으면 안 돼요. 그 상태로 새로 고치면
 *   화면에만 있던 강화 결과와 봉 차감이 사라져요. 실패한 강화도 봉이 되돌아와
 *   「실패해도 봉은 돌아오지 않아요」와 어긋나요.
 */
export function canReloadNow({ hidden = false, idleMs = 0, busy = false, petPending = false } = {}) {
    if (busy || petPending) return false;
    if (hidden) return true;
    return idleMs >= 120000;
}
