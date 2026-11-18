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
        const flag = g.phase === 'focus' && g.ready.includes(p) ? ' <i class="mwa-flag">준비</i>' : g.starVotes.includes(p) ? ' <i class="mwa-flag is-star">✦</i>' : '';
        const cards = over ? '' : hand.length
            ? hand.map((c, i) => `<span class="mwa-card${i === 0 ? ' is-low' : ''}">${c}</span>`).join('')
            : '<span class="mwa-none">다 냈어요</span>';
        return `<li><span class="mwa-name">${esc(nameOf(p))}${flag}</span><span class="mwa-cards">${cards}</span></li>`;
    }).join('');
    const ev = over ? mindEndText(g, nameOf) : mindEventText(g, nameOf);
    const evCls = g.event && g.event.type === 'miss' ? ' is-miss' : '';
    return `<button type="button" class="mwa-tile${over ? ' is-over' : ''}" data-mwa-room="${esc(room.id)}" aria-label="${esc(room.hostName)}의 방 크게 보기">
        <span class="mwa-head"><b>${esc(room.hostName)}의 방</b><i>${esc(phase)}</i></span>
        <span class="mwa-stats"><span>레벨 <b>${g.level || 1}</b>/${g.maxLevel || '-'}</span><span class="mwa-lives">${lives}</span><span>✦ ${g.stars}</span>${top ? `<span class="mwa-top">${top.c} <small>${esc(nameOf(top.by))}</small></span>` : ''}</span>
        <ul class="mwa-players">${players}</ul>
        ${ev ? `<span class="mwa-event${evCls}">${esc(ev)}</span>` : ''}
    </button>`;
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
        ${list.length ? `<div class="mwa-grid">${list.map(tileHtml).join('')}</div>` : '<p class="mwa-empty">지금 진행 중인 방이 없어요. 방이 시작되면 여기에 바로 나타나요.</p>'}`;
}
