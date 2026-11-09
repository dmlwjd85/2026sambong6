/**
 * 오목·체스 한 화면 전환 탭.
 * AI 판은 바꿀 때 멈춰 두었다가(파킹) 돌아오면 이어 둡니다.
 * 친구와 두는 방(PVP)은 나가면 패배라서, 판이 진행 중이거나 결과 화면이면 바꾸지 않습니다.
 */

export const BOARD_SWITCH_GAMES = Object.freeze(['gomoku', 'chess']);

export function isSwitchableBoardGame(type) {
    return BOARD_SWITCH_GAMES.includes(String(type || ''));
}

/**
 * @param {{ target: string, view: string, current: string, pvpLocked?: boolean, parked?: { gomoku?: any, chess?: any } }} p
 * @returns {{ action: 'none'|'blocked'|'resume'|'lobby', target?: string, park?: string }}
 */
export function planBoardGameSwitch({ target, view, current, pvpLocked = false, parked = {} } = {}) {
    const t = String(target || '');
    if (!isSwitchableBoardGame(t)) return { action: 'none' };
    const cur = String(current || '');
    const v = String(view || '');
    if (v !== 'lobby' && v !== 'play') return { action: 'none' };
    if (t === cur) return { action: 'none' };
    if (v === 'play' && pvpLocked) return { action: 'blocked', target: t };
    const park = v === 'play' && isSwitchableBoardGame(cur) ? cur : '';
    if (parked && parked[t]) return { action: 'resume', target: t, park };
    return { action: 'lobby', target: t, park };
}

/** 탭을 보여 줄지: 오목·체스 방 목록이나 판 화면일 때만 */
export function boardSwitchVisible(view, kind) {
    return (view === 'lobby' || view === 'play') && isSwitchableBoardGame(kind);
}

/** AI 판을 멈춰 둡니다. 생각 중이던 AI 응답은 토큰으로 버리고, 돌아오면 다시 계산합니다. */
export function parkBoardAiSession(session) {
    if (!session || typeof session !== 'object') return null;
    return { ...session, token: (Number(session.token) || 0) + 1, thinking: false };
}
