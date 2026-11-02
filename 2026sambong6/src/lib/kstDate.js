/** 기기 시간대와 상관없이 한국 날짜(KST, UTC+9) 'YYYY-MM-DD'.
 * 기존에 저장된 날짜(한국 기기의 로컬 날짜)와 같은 형식이라 그대로 비교할 수 있습니다. */
export function getKstDateStr(d = new Date()) {
    return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}
