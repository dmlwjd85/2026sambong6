/**
 * 화면에 Lv·등급을 보여 줄 때 쓰는 경험치 값.
 * 경험치가 없거나(undefined·null·숫자 아님) 0 이하이면 0으로 봐요.
 * 경험치 계산식(calculateExactLevel·getLevelInfo)은 그대로 두고, 들어가는 값만 정리해서 Lv.NaN을 막아요.
 * 저장된 경험치 값은 바꾸지 않아요(표시 전용).
 * @param {unknown} xp
 * @returns {number}
 */
export function levelXpForDisplay(xp) {
    const n = typeof xp === 'number' ? xp : Number(xp);
    return Number.isFinite(n) && n > 0 ? n : 0;
}
