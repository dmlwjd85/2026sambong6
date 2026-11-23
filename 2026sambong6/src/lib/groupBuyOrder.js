/**
 * 공동구매 주문서(순수 함수).
 * 학생이 공동구매를 실행하면 모금 문서(shopGroupBuy/{상품})에 lastOrder 를 같은 트랜잭션으로 적어요.
 * 마스터 화면은 이미 구독 중인 모금 문서에서 확인하지 않은 주문(lastOrder.id !== lastOrderSeen)을 팝업으로 띄워요(읽기가 늘지 않아요).
 */

const int = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 주문서 만들기. contributions: { 학번: 입금 봉 } */
export function buildGroupBuyOrder({ shopId, shopName, price = 0, contributions = {}, by = '', byName = '', at = 0 } = {}) {
    const list = Object.keys(contributions || {})
        .map((id) => ({ id: String(id), amount: int(contributions[id]) }))
        .filter((x) => x.id && x.amount > 0)
        .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id, 'ko', { numeric: true }));
    const total = list.reduce((s, x) => s + x.amount, 0);
    const when = int(at);
    return {
        id: `${String(shopId || '')}_${when}`,
        shopId: String(shopId || ''),
        shopName: String(shopName || shopId || '').slice(0, 40),
        price: int(price),
        total,
        by: String(by || '').slice(0, 20),
        byName: String(byName || '').slice(0, 20),
        at: when,
        list,
    };
}

/** 아직 확인하지 않은 주문들(오래된 것부터). pools: { 상품: 모금 문서 } */
export function pendingGroupBuyOrders(pools, { now = Date.now(), maxAgeMs = 14 * 86400000 } = {}) {
    const out = [];
    Object.keys(pools || {}).forEach((shopId) => {
        const p = pools[shopId];
        const o = p && p.lastOrder;
        if (!o || typeof o !== 'object' || !o.id) return;
        if (String(p.lastOrderSeen || '') === String(o.id)) return;
        if (maxAgeMs > 0 && now - (Number(o.at) || 0) > maxAgeMs) return;
        out.push({ ...o, list: Array.isArray(o.list) ? o.list : [] });
    });
    return out.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
}

/** 주문서 팝업 안쪽 HTML. nameOf(학번) → 이름, bong(n) → '12봉' 같은 글 */
export function groupBuyOrderHtml(order, { nameOf = (id) => id, bong = (n) => `${n}B`, timeText = (t) => new Date(t).toLocaleString('ko-KR') } = {}) {
    const rows = order.list.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.id)}</td><td>${esc(nameOf(x.id))}</td><td class="gbo-num">${esc(bong(x.amount))}</td></tr>`).join('');
    return `<div class="gbo">
        <p class="gbo-title">🛒 공동구매 주문서</p>
        <p class="gbo-item">${esc(order.shopName)}</p>
        <dl class="gbo-info">
            <dt>성공 시각</dt><dd>${esc(order.at ? timeText(order.at) : '-')}</dd>
            <dt>실행한 학생</dt><dd>${esc(order.byName || nameOf(order.by) || '-')}</dd>
            <dt>상품 가격</dt><dd>${esc(bong(order.price))}</dd>
            <dt>모인 금액</dt><dd>${esc(bong(order.total))} · ${order.list.length}명 참여</dd>
        </dl>
        <div class="gbo-table"><table>
            <thead><tr><th>#</th><th>학번</th><th>이름</th><th>입금</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">입금 내역이 없어요.</td></tr>'}</tbody>
            <tfoot><tr><td colspan="3">합계</td><td class="gbo-num">${esc(bong(order.total))}</td></tr></tfoot>
        </table></div>
    </div>`;
}
