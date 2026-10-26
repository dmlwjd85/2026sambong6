/**
 * PIN 마스터의 교사용 저장.
 * 학급 온도계와 같이 isAdmin / isGM 이면 추가 구글 인증을 요구하지 않습니다.
 * 학생 계정(isAdmin·isGM 아님)에는 열지 않습니다.
 */

export function pinMasterCanEditShopPrices({ isGM } = {}) {
    return isGM === true;
}

export function pinMasterSkipsTeacherGoogle({ isAdmin } = {}) {
    return isAdmin === true;
}
