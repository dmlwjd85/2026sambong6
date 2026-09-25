/**
 * 체스 AI를 워커에서 돌려 UI가 멈추지 않게 합니다.
 */
import { pickChessAiMove } from './chessAi.js';

self.onmessage = (e) => {
    const data = e && e.data ? e.data : {};
    const reqId = data.reqId;
    try {
        const mv = pickChessAiMove(data.game, {
            color: data.color,
            level: data.level,
            timeMs: data.timeMs,
        });
        self.postMessage({ reqId, ok: true, mv });
    } catch (err) {
        self.postMessage({ reqId, ok: false, error: String(err && err.message ? err.message : err) });
    }
};
