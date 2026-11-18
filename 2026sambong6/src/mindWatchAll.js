/**
 * 이심전심 「모든 방 한 화면에」 관전판. 방 목록이 받아 둔 방 문서를 그대로 그려요(읽기를 더 쓰지 않아요).
 * 방마다 레벨·생명·수리검·마지막 낸 카드와, 사람마다 가진 카드를 앞면으로 보여 줘요(가장 작은 카드는 밝게).
 * 칸을 누르면 그 방 하나만 크게 관전해요.
 */
import { isMindOver, mindEndText, mindEventText, sanitizeMindGame } from './lib/mindGame.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 보여 줄 방: 진행 중인 방, 그리고 끝난 지 3분 안 된 방(결과를 잠깐 보여 줘요). 진행 중이 먼저예요. */
export function mindWatchRooms(rooms, now = Date.now()) {
    return (Array.isArray(rooms) ? rooms : [])
        .filter((r) => r && r.gameType === 'mind' && (r.status === 'playing' || (r.status === 'finished' && now - (Number(r.updatedAt) || 0) < 180000)))
        .sort((a, b) => (a.status === b.status ? String(a.hostName || '').localeCompare(String(b.hostName || ''), 'ko') : a.status === 'playing' ? -1 : 1));
}

function tileHtml(room) {
    const g = sanitizeMindGame(room.game);
    const nameOf = (id) => {
        const m = (room.members || []).find((x) => x.id === id);
        return m ? m.name : id;
    };
    const over = room.status === 'finished' || isMindOver(g);
    const phase = over ? (g.phase === 'won' ? '🎉 통과!' : '끝') : g.phase === 'focus' ? '마음 모으는 중' : '진행 중';
    const top = g.pile.length ? g.pile[g.pile.length - 1] : null;
    const lives = Array.from({ length: Math.max(g.lives, 0) }, () => '❤').join('') || '0';
    const players = g.players.map((p) => {
        const hand = g.hands[p] || [];
        const flag = g.phase === 'focus' && g.ready.includes(p) ? '<i class="mwa-flag">준비 ✓</i>' : g.starVotes.includes(p) ? '<i class="mwa-flag is-star">✦ 쓰자!</i>' : '';
        const cards = over ? '' : hand.length
            ? hand.map((c, i) => `<span class="mwa-card${i === 0 ? ' is-low' : ''}">${c}</span>`).join('')
            : '<span class="mwa-none">다 냈어요</span>';
        return `<div class="mwa-player${hand.length || over ? '' : ' is-empty'}"><p class="mwa-name"><span>${esc(nameOf(p))}</span>${flag}</p><div class="mwa-cards">${cards}</div></div>`;
    }).join('');
    const ev = over ? mindEndText(g, nameOf) : mindEventText(g, nameOf);
    const evCls = g.event && g.event.type === 'miss' ? ' is-miss' : over && g.phase === 'won' ? ' is-good' : '';
    const pile = top
        ? `<span class="mwa-pile-card"><b>${top.c}</b><em>${esc(nameOf(top.by))}</em></span>`
        : `<span class="mwa-pile-empty">${g.phase === 'focus' ? '카드를 보고 마음을 모으는 중' : '첫 카드를 기다려요'}</span>`;
    // 카드가 많은 레벨은 칸을 넓히고 글자를 줄여, 한 사람 카드가 한두 줄에 들어가게 해요.
    const most = Math.max(0, ...g.players.map((p) => (g.hands[p] || []).length));
    const dense = most >= 7 ? ' is-dense' : most >= 4 ? ' is-mid' : '';
    return `<button type="button" class="mwa-tile${over ? ' is-over' : ''}${dense}" data-mwa-room="${esc(room.id)}" aria-label="${esc(room.hostName)}의 방 크게 보기">
        <span class="mwa-head"><b>${esc(room.hostName)}의 방</b><i>${esc(phase)}</i></span>
        <span class="mwa-stats"><span>레벨 <b>${g.level || 1}</b> / ${g.maxLevel || '-'}</span><span class="mwa-lives">${lives}</span><span class="mwa-stars">✦ <b>${g.stars}</b></span></span>
        <div class="mwa-players">${players}</div>
        <div class="mwa-table">${pile}${ev ? `<span class="mwa-event${evCls}">${esc(ev)}</span>` : ''}</div>
    </button>`;
}

/** 방 수에 따라 화면 나누기: 1개 전체, 2개 양쪽, 3~4개 4분할, 5~6개 6분할, 그보다 많으면 6분할로 내려 보기 */
export function mindWatchLayout(n) {
    if (n <= 1) return 'n1';
    if (n === 2) return 'n2';
    if (n <= 4) return 'n4';
    if (n <= 6) return 'n6';
    return 'nmany';
}

/** 관전판 전체 HTML */
export function mindWatchAllHtml(rooms, now = Date.now()) {
    const list = mindWatchRooms(rooms, now);
    const playing = list.filter((r) => r.status === 'playing').length;
    return `<div class="mwa-bar">
            <p class="mwa-title">👀 이심전심 모든 방 <small>진행 중 ${playing}개</small></p>
            <button type="button" class="boardgame-mini-btn" data-mwa-close>닫기</button>
        </div>
        <p class="mwa-tip">모두의 카드가 보여요. 친구들에게 알려 주면 안 돼요! 방을 누르면 그 방만 크게 봐요.</p>
        ${list.length ? `<div class="mwa-grid is-${mindWatchLayout(list.length)}">${list.map(tileHtml).join('')}</div>` : '<p class="mwa-empty">지금 진행 중인 방이 없어요. 방이 시작되면 여기에 바로 나타나요.</p>'}`;
}
