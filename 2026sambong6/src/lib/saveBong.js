/**
 * 저장할 봉.
 * 올라가는 한도가 0이면 서버보다 높은 로컬 봉을 서버 값으로 되돌립니다.
 * 퀘스트처럼 한도를 넘기면 그 한도까지는 올라갑니다.
 * 장비 드롭은 이 저장과 따로 저장하지 않습니다. 먼저 저장하면 퀘스트 봉이 사라집니다.
 */

export const QUEST_DROP_SAVES_SEPARATELY = false;

export function resolveSavedBong({
    serverBong,
    nextBong,
    maxBongIncrease = 0,
    allowBongDecrease = false,
    maxBongDecrease = 0,
} = {}) {
    const server = Number(serverBong);
    const next = Number(nextBong);
    if (!Number.isFinite(server)) return Number.isFinite(next) ? next : 0;
    if (!Number.isFinite(next)) return server;
    const maxRise = Math.max(0, Number(maxBongIncrease) || 0);
    const maxDrop = Math.max(0, Number(maxBongDecrease) || 0);
    let value = next;
    if (value < server) {
        value = allowBongDecrease ? Math.max(value, server - maxDrop) : server;
    }
    if (value > server + maxRise + 0.0001) value = server + maxRise;
    return value;
}
