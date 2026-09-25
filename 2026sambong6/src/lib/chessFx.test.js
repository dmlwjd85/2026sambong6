import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chessMakePiece, chessSq } from './chessGame.js';
import {
    chessCaptureAction,
    chessTryVibrate,
    chessVibratePattern,
    describeChessFx,
    inferChessCapture,
} from './chessFx.js';

describe('체스 이펙트', () => {
    it('기물마다 액션·진동 패턴이 다르다', () => {
        assert.equal(chessCaptureAction('n'), '도약');
        assert.equal(chessCaptureAction('r'), '돌진');
        assert.notDeepEqual(chessVibratePattern('p'), chessVibratePattern('q'));
        assert.equal(chessTryVibrate('p'), false);
        const fx = describeChessFx({ attackerType: 'q', captured: true, check: false, mate: false });
        assert.match(fx.className, /chess-fx-q/);
        assert.ok(fx.ms <= 1000 && fx.ms >= 400);
    });

    it('이전 칸으로 잡기·앙파상을 알아챈다', () => {
        const cells = new Array(64).fill(0);
        cells[chessSq(4, 4)] = chessMakePiece('w', 'q');
        cells[chessSq(4, 6)] = chessMakePiece('b', 'r');
        const hit = inferChessCapture(cells, { from: chessSq(4, 4), to: chessSq(4, 6) });
        assert.equal(hit.captured, true);
        assert.equal(hit.victim, chessMakePiece('b', 'r'));
        const quiet = inferChessCapture(cells, { from: chessSq(4, 4), to: chessSq(4, 5) });
        assert.equal(quiet.captured, false);
    });
});
