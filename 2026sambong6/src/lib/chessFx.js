/**
 * 체스 잡기·체크 연출과 진동.
 * 게임 진행을 막지 않고, 짧게(0.5~1초)만 보여 줍니다.
 */

const VIBRATE = Object.freeze({
    p: [18, 24, 18],
    n: [12, 16, 28, 16, 12],
    b: [30, 18, 18],
    r: [46],
    q: [22, 14, 36, 14, 22],
    k: [16, 20, 16, 20, 40],
    check: [20, 30, 20],
    mate: [40, 30, 50, 30, 70],
});

export function chessCaptureAction(type) {
    if (type === 'n') return '도약';
    if (type === 'b') return '대각빛';
    if (type === 'r') return '돌진';
    if (type === 'q') return '섬광';
    if (type === 'k') return '위엄';
    return '찌르기';
}

export function chessVibratePattern(kind) {
    return (VIBRATE[kind] || VIBRATE.p).slice();
}

export function prefersChessReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

export function chessTryVibrate(kind) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    try {
        return !!navigator.vibrate(chessVibratePattern(kind));
    } catch {
        return false;
    }
}

export function inferChessCapture(prevCells, lastMove) {
    if (!lastMove || !prevCells) return { captured: false, attacker: '', victim: '', ep: false };
    const from = lastMove.from;
    const to = lastMove.to;
    const attacker = prevCells[from] || 0;
    const onTo = prevCells[to] || 0;
    if (onTo) {
        return { captured: true, attacker, victim: onTo, ep: false };
    }
    const atkType = attacker & 7;
    const df = Math.abs((to & 7) - (from & 7));
    if (atkType === 1 && df === 1 && !onTo) {
        const dir = (attacker >= 9) ? 8 : -8;
        const capSq = to + dir;
        const vic = prevCells[capSq] || 0;
        if (vic && ((attacker >= 9) !== (vic >= 9))) {
            return { captured: true, attacker, victim: vic, ep: true };
        }
    }
    return { captured: false, attacker, victim: 0, ep: false };
}

export function describeChessFx({ attackerType, captured, check, mate }) {
    const cls = ['chess-fx'];
    if (captured) cls.push(`chess-fx-hit chess-fx-${attackerType || 'p'}`);
    if (check) cls.push('chess-fx-check');
    if (mate) cls.push('chess-fx-mate');
    return {
        className: cls.join(' '),
        action: captured ? chessCaptureAction(attackerType) : '',
        ms: mate ? 900 : captured ? 720 : check ? 520 : 0,
    };
}

function pieceTypeOf(p) {
    const t = p & 7;
    return t === 1 ? 'p' : t === 2 ? 'n' : t === 3 ? 'b' : t === 4 ? 'r' : t === 5 ? 'q' : t === 6 ? 'k' : '';
}

export function playChessBoardFx(layerEl, {
    fromBtn,
    toBtn,
    wrapEl,
    attackerType,
    captured,
    check,
    mate,
} = {}) {
    if (!layerEl) return 0;
    const reduced = prefersChessReducedMotion();
    const info = describeChessFx({ attackerType, captured, check, mate });
    if (!info.ms) return 0;
    const ms = reduced ? Math.min(280, info.ms) : info.ms;
    layerEl.innerHTML = '';
    layerEl.className = `chess-fx-layer ${info.className}${reduced ? ' is-reduced' : ''}`;
    if (captured && toBtn && wrapEl) {
        const wr = wrapEl.getBoundingClientRect();
        const tr = toBtn.getBoundingClientRect();
        const fr = fromBtn ? fromBtn.getBoundingClientRect() : tr;
        const cx = tr.left + tr.width / 2 - wr.left;
        const cy = tr.top + tr.height / 2 - wr.top;
        const burst = document.createElement('div');
        burst.className = `chess-fx-burst chess-fx-${attackerType || 'p'}`;
        burst.style.left = `${cx}px`;
        burst.style.top = `${cy}px`;
        const n = reduced ? 4 : (attackerType === 'q' ? 14 : 9);
        for (let i = 0; i < n; i += 1) {
            const dot = document.createElement('i');
            const ang = (Math.PI * 2 * i) / n;
            dot.style.setProperty('--dx', `${Math.cos(ang) * (reduced ? 16 : 28)}px`);
            dot.style.setProperty('--dy', `${Math.sin(ang) * (reduced ? 16 : 28)}px`);
            burst.appendChild(dot);
        }
        layerEl.appendChild(burst);
        if (fromBtn && !reduced) {
            const streak = document.createElement('div');
            streak.className = `chess-fx-streak chess-fx-${attackerType || 'p'}`;
            const x1 = fr.left + fr.width / 2 - wr.left;
            const y1 = fr.top + fr.height / 2 - wr.top;
            const len = Math.hypot(cx - x1, cy - y1);
            const rot = Math.atan2(cy - y1, cx - x1);
            streak.style.left = `${x1}px`;
            streak.style.top = `${y1}px`;
            streak.style.width = `${len}px`;
            streak.style.transform = `rotate(${rot}rad)`;
            layerEl.appendChild(streak);
        }
        if (toBtn) toBtn.classList.add('is-shatter');
    }
    if (check || mate) {
        const flash = document.createElement('div');
        flash.className = mate ? 'chess-fx-flash is-mate' : 'chess-fx-flash';
        layerEl.appendChild(flash);
    }
    chessTryVibrate(mate ? 'mate' : captured ? (attackerType || 'p') : 'check');
    window.setTimeout(() => {
        layerEl.innerHTML = '';
        layerEl.className = 'chess-fx-layer';
        if (toBtn) toBtn.classList.remove('is-shatter');
    }, ms);
    return ms;
}

export function chessAttackerType(p) {
    return pieceTypeOf(p);
}
