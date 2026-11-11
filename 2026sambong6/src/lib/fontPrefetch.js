// 글꼴 미리 받기를 해도 되는 망인지 봐요.
// 데이터 절약 모드이거나 2G·느린 2G면 미리 받지 않아요(알까기에 들어갈 때 받아요).
// navigator.connection이 없는 브라우저(Safari 등)는 알 수 없으니 미리 받아요.
export function isSlowConnection(nav) {
    const c = nav && nav.connection;
    if (!c) return false;
    if (c.saveData === true) return true;
    return c.effectiveType === '2g' || c.effectiveType === 'slow-2g';
}
