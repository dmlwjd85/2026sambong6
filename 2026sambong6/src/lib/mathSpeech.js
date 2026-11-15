/**
 * 수학 개념 그림 「읽어 주기」: 읽을 글 다듬기와 목소리 고르기.
 * 화면·브라우저 기능은 쓰지 않아서 테스트하기 쉬워요.
 */

const UNITS = [[/cm²/g, ' 제곱센티미터'], [/cm³/g, ' 세제곱센티미터'], [/\bcm\b/g, ' 센티미터'], [/\bmm\b/g, ' 밀리미터'], [/\bkm\b/g, ' 킬로미터'], [/\bmL\b/g, ' 밀리리터'], [/\bkg\b/g, ' 킬로그램'], [/(\d)\s*m\b/g, '$1 미터'], [/(\d)\s*L\b/g, '$1 리터'], [/(\d)\s*g\b/g, '$1 그램'], [/(\d)\s*t\b/g, '$1 톤']];

/** 화면 글을 소리 내어 읽기 좋은 글로 바꿔요(기호 → 말). */
export function speechText(line) {
    let s = String(line ?? '');
    s = s.replace(/[“”"'‘’「」]/g, ' ');
    s = s.replace(/(\d+)\s*\/\s*(\d+)/g, '$2분의 $1');
    UNITS.forEach(([re, to]) => { s = s.replace(re, to); });
    s = s.replace(/÷/g, ' 나누기 ').replace(/×/g, ' 곱하기 ').replace(/\+/g, ' 더하기 ').replace(/[−–]/g, ' 빼기 ').replace(/(\d)\s*-\s*(\d)/g, '$1 빼기 $2');
    s = s.replace(/=/g, ' 는 ').replace(/[→↔➜]/g, ', ').replace(/…/g, ', ').replace(/°/g, '도').replace(/%/g, ' 퍼센트');
    s = s.replace(/[■]/g, '네모').replace(/[▲△]/g, '세모').replace(/[●○◉]/g, '동그라미').replace(/□/g, '네모');
    s = s.replace(/[()]/g, ', ').replace(/[·:]/g, ', ');
    return s.replace(/\s+/g, ' ').replace(/(,\s*)+/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
}

/** 목소리 점수: 사람 목소리에 가까운(신경망) 한국어 목소리일수록 높아요. 한국어가 아니면 -1 */
export function voiceScore(v) {
    if (!v || !/^ko([-_]|$)/i.test(String(v.lang || ''))) return -1;
    const name = String(v.name || '');
    let score = 10;
    if (/natural|neural/i.test(name)) score += 60;
    if (/premium|enhanced|고급|프리미엄/i.test(name)) score += 45;
    if (/google/i.test(name)) score += 35;
    if (/online/i.test(name)) score += 20;
    if (/siri/i.test(name)) score += 30;
    if (/sunhi|injoon|yuna|유나/i.test(name)) score += 8;
    if (/compact|espeak/i.test(name)) score -= 8;
    if (v.localService === false) score += 4;
    return score;
}

/** 한국어 목소리만, 자연스러운 순서로 */
export function koreanVoices(voices) {
    return [...(voices || [])].map((v) => ({ v, score: voiceScore(v) })).filter((x) => x.score >= 0).sort((a, b) => b.score - a.score).map((x) => x.v);
}

/** 쓸 목소리: 골라 둔 이름이 있으면 그것, 없으면 가장 자연스러운 것 */
export function pickVoice(voices, preferName = '') {
    const list = koreanVoices(voices);
    return list.find((v) => v.name === preferName) || list[0] || null;
}

/** 읽는 데 걸릴 시간 어림(밀리초). 끝났다는 신호가 안 오는 기기에서 넘어가는 안전장치예요. */
export function speechFallbackMs(text, rate = 1) {
    return Math.round((String(text).length * 330) / Math.max(0.5, rate)) + 6000;
}
