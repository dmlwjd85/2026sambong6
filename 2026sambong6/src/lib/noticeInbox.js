/**
 * 로그인 전에 쌓인 자동 알림을 팝업 대신 알림함에 넣습니다.
 */

export function pushNotice(list, notice) {
    const items = Array.isArray(list) ? list.slice() : [];
    const key = String((notice && notice.key) || '');
    if (key && items.some((row) => row && row.key === key)) return items;
    const title = String((notice && notice.title) || '알림').trim().slice(0, 40) || '알림';
    const body = String((notice && notice.body) || '').trim().slice(0, 800);
    if (!body) return items;
    items.unshift({
        key,
        title,
        body,
        at: Number(notice && notice.at) || Date.now(),
        read: false,
    });
    return items.slice(0, 40);
}

export function markAllRead(list) {
    return (Array.isArray(list) ? list : []).map((row) => ({ ...row, read: true }));
}

export function unreadCount(list) {
    return (Array.isArray(list) ? list : []).filter((row) => row && !row.read).length;
}
