/**
 * 알까기 손가락(포인터) 판단. 화면과 상관없는 순수 함수예요.
 *
 * - 한 손가락으로만 끌 수 있어요. 끄는 중 두 번째 손가락이 닿거나 처음부터 두 손가락이면
 *   그 끌기는 취소하고, 모든 손가락을 뗄 때까지 새 끌기를 받지 않아요.
 * - 화면(또는 판 영역) 밖에서 놓으면 취소예요. 밖으로 나가 있는 동안은 outside로 표시해요.
 * - 알 가까이(cancelDist 안)로 돌아와 놓으면 취소예요.
 * - pointercancel / lostpointercapture / 캡처 없는 pointerleave도 취소예요.
 */

export function createAlkkagiGestureState() {
    return { pointers: [], drag: null, locked: false };
}

function without(list, id) {
    return list.filter((p) => p !== id);
}

/** 점이 사각형 안인지(경계 포함). rect: {left, top, right, bottom} */
export function alkkagiPointInside(x, y, rect) {
    if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * 손가락이 닿았을 때.
 * @param {{pointerId:number|string, canStart?:boolean}} ev canStart: 이 손가락이 내 알을 잡았는지
 * @returns {{state, action:'start'|'cancel'|'none'}}
 */
export function alkkagiGestureDown(state, ev) {
    const id = ev.pointerId;
    const pointers = state.pointers.includes(id) ? state.pointers : [...state.pointers, id];
    if (pointers.length > 1) {
        // 두 손가락: 끌던 게 있으면 취소하고, 다 뗄 때까지 잠가요.
        const had = !!state.drag;
        return { state: { pointers, drag: null, locked: true }, action: had ? 'cancel' : 'none' };
    }
    if (state.locked || state.drag || !ev.canStart) return { state: { ...state, pointers }, action: 'none' };
    return { state: { pointers, drag: { pointerId: id, outside: false }, locked: false }, action: 'start' };
}

/** 끄는 중 움직임. inside: 놓아도 되는 영역 안인지 */
export function alkkagiGestureMove(state, ev) {
    if (!state.drag || ev.pointerId !== state.drag.pointerId) return { state, action: 'none' };
    const outside = !ev.inside;
    if (outside === state.drag.outside) return { state, action: 'none' };
    return { state: { ...state, drag: { ...state.drag, outside } }, action: 'update' };
}

/**
 * 손가락을 뗐을 때.
 * @param {{pointerId, inside:boolean, dist:number, cancelDist:number}} ev
 * @returns {{state, action:'fire'|'cancel'|'none'}}
 */
export function alkkagiGestureUp(state, ev) {
    const pointers = without(state.pointers, ev.pointerId);
    const locked = pointers.length ? state.locked : false;
    if (!state.drag || ev.pointerId !== state.drag.pointerId) return { state: { pointers, drag: state.drag, locked }, action: 'none' };
    const next = { pointers, drag: null, locked };
    if (!ev.inside) return { state: next, action: 'cancel' };
    if (!(Number(ev.dist) >= Number(ev.cancelDist))) return { state: next, action: 'cancel' };
    return { state: next, action: 'fire' };
}

/** pointercancel·lostpointercapture·캡처 없는 pointerleave: 끌던 손가락이면 취소해요. */
export function alkkagiGestureCancel(state, ev) {
    const pointers = ev.release === false ? state.pointers : without(state.pointers, ev.pointerId);
    const locked = pointers.length ? state.locked : false;
    if (!state.drag || ev.pointerId !== state.drag.pointerId) return { state: { pointers, drag: state.drag, locked }, action: 'none' };
    return { state: { pointers, drag: null, locked }, action: 'cancel' };
}
