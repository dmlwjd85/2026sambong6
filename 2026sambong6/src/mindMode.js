/**
 * 이심전심(더 마인드 규칙) 판 화면(#boardgameMindPlayView).
 * 방 만들기·참가 승인은 보드게임 공통 방(sambongWorld.js)을 그대로 쓰고, 규칙은 lib/mindGame.js 가 맡아요.
 * 카드를 내거나 준비·수리검 동의를 누를 때마다 방 문서를 트랜잭션으로 고쳐요.
 * 두 사람이 거의 같이 눌러도 먼저 닿은 쪽부터 차례로 판정돼요.
 */
import './mindMode.css';
import {
    MIND_REWARDS,
    isMindOver,
    mindCancelStar,
    mindEndText,
    mindEventText,
    mindLeave,
    mindPlay,
    mindReady,
    mindVoteStar,
    sanitizeMindGame,
} from './lib/mindGame.js';
import { createOxFeedback } from './lib/oxQuizFeedback.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * deps: { selfId(), mutateRoom(roomId, mutator, opts), applyRoomGame(room, {game, now, finished}),
 *         continueRoom(room, opts), closeRoom(room, opts), deleteRoom(roomId), markLeft(room),
 *         toLobby(), confirm(text) → Promise<boolean>, alert(text) }
 */
export function createMindMode(deps) {
    const view = () => document.getElementById('boardgameMindPlayView');
    let room = null;
    let busy = false;
    let bound = false;
    let feedback = null;
    let lastKey = '';
    let lastRoomKey = '';

    const me = () => String(deps.selfId() || '');
    const game = () => sanitizeMindGame(room && room.game);
    const nameOf = (id) => {
        if (id === me()) return '나';
        const m = ((room && room.members) || []).find((x) => x.id === id);
        return m ? m.name : id;
    };
    const isHost = () => !!room && room.hostId === me();

    function bind() {
        const el = view();
        if (!el || bound) return;
        bound = true;
        feedback = createOxFeedback(el);
        el.addEventListener('click', (e) => {
            const t = e.target.closest('[data-m]');
            if (!t || !el.contains(t) || t.disabled) return;
            const act = t.getAttribute('data-m');
            if (act === 'play') void play(Number(t.getAttribute('data-c')));
            else if (act === 'ready') void change((g) => mindReady(g, { id: me() }));
            else if (act === 'star') void change((g) => mindVoteStar(g, { id: me(), now: Date.now() }));
            else if (act === 'star-no') void change((g) => mindCancelStar(g, { id: me() }));
            else if (act === 'leave') void leave();
            else if (act === 'again') void again();
            else if (act === 'close') void close();
            else if (act === 'rules') showRules();
            else if (act === 'rules-close') hideRules();
        });
    }

    /** 규칙 함수를 방 문서에 적용해요(트랜잭션). */
    async function change(fn, { extra = null } = {}) {
        if (!room || busy) return null;
        busy = true;
        const id = room.id;
        try {
            return await deps.mutateRoom(id, (cur) => {
                const r = fn(cur.game);
                if (!r.ok) return { ok: false, error: r.error };
                let next = deps.applyRoomGame(cur, { game: r.game, now: Date.now(), finished: isMindOver(r.game) });
                if (extra) next = extra(next);
                return { ok: true, room: next };
            }, { silent: true });
        } finally {
            busy = false;
        }
    }

    async function play(card) {
        const g = game();
        const mine = g.hands[me()] || [];
        if (g.phase !== 'play' || !mine.length || mine[0] !== card) return;
        await change((cur) => mindPlay(cur, { id: me(), card, now: Date.now() }));
    }

    async function leave() {
        if (!room) return;
        const g = game();
        const playing = room.status === 'playing' && !isMindOver(g) && g.players.includes(me());
        if (playing) {
            const ok = await deps.confirm('지금 나가면 우리 팀 도전이 여기서 끝나요.\n그래도 나갈까요?');
            if (!ok || !room) return;
            const r = room;
            const host = isHost();
            // 방장이 아니면 자리도 비워서, 남은 친구들이 다시 할 수 있게 해요.
            await change((cur) => mindLeave(cur, { id: me(), now: Date.now() }), {
                extra: (next) => (host ? next : { ...next, members: next.members.filter((m) => m.id !== me()) }),
            });
            deps.markLeft(r);
        } else if (room.status === 'finished') {
            deps.markLeft(room);
        }
        stop();
        deps.toLobby();
    }

    async function again() {
        if (!room || busy) return;
        busy = true;
        try {
            await deps.mutateRoom(room.id, (cur) => deps.continueRoom(cur, { actorId: me(), now: Date.now() }));
        } finally {
            busy = false;
        }
    }

    async function close() {
        if (!room) return;
        const ok = await deps.confirm('방을 닫을까요? 목록에서도 사라져요.');
        if (!ok || !room) return;
        const id = room.id;
        const closed = await deps.mutateRoom(id, (cur) => deps.closeRoom(cur, { actorId: me(), now: Date.now() }));
        if (closed) await deps.deleteRoom(id);
        stop();
        deps.toLobby();
    }

    function showRules() {
        const el = view();
        if (!el || el.querySelector('.mind-rules')) return;
        const g = game();
        const wrap = document.createElement('div');
        wrap.className = 'mind-rules';
        wrap.innerHTML = `<div class="mind-rules-card">
            <h3>이심전심 규칙</h3>
            <ul>
                <li>모두가 한 팀이에요. <b>말·손짓·표정 신호 없이</b> 해요.</li>
                <li>레벨 N에서는 1~100 카드 중 N장씩 받아요. 내 카드만 볼 수 있어요.</li>
                <li>차례가 없어요. 모두의 카드가 <b>작은 수부터</b> 나오게 한 장씩 내요. 내 손에서는 가장 작은 카드부터 내요.</li>
                <li>누가 낸 카드보다 작은 카드를 다른 사람이 들고 있었으면 실수예요. <b>생명 1개</b>를 잃고, 그보다 작은 카드는 모두 치워요.</li>
                <li>모두의 손이 비면 레벨 통과! ${g.maxLevel || 12}레벨까지 통과하면 이겨요. 생명이 0이 되면 끝나요.</li>
                <li><b>수리검 ✦</b>: 한 사람이 쓰자고 하고 모두 동의하면, 각자 가장 작은 카드 한 장을 보이게 버려요.</li>
                <li>보상: 2·5·8레벨을 통과하면 수리검 +1, 3·6·9레벨을 통과하면 생명 +1 (생명 5개, 수리검 3개까지).</li>
                <li>레벨을 시작할 때는 카드를 본 뒤 모두 「준비됐어요」를 눌러 마음을 모아요.</li>
            </ul>
            <button type="button" class="boardgame-primary-btn" data-m="rules-close">알겠어요</button>
        </div>`;
        el.appendChild(wrap);
    }

    function hideRules() {
        const el = view();
        const r = el && el.querySelector('.mind-rules');
        if (r) r.remove();
    }

    function cardHtml(c, cls = '', attrs = '') {
        return `<span class="mind-card ${cls}" ${attrs}><b>${c}</b></span>`;
    }

    function matesHtml(g, over) {
        return g.players.filter((p) => p !== me()).map((p) => {
            const n = (g.hands[p] || []).length;
            const badge = over ? '' : g.phase === 'focus'
                ? (g.ready.includes(p) ? '<i class="mind-badge is-ready">준비 ✓</i>' : '<i class="mind-badge">카드 보는 중</i>')
                : (g.starVotes.includes(p) ? '<i class="mind-badge is-star">✦ 쓰자!</i>' : '');
            const backs = over ? '' : n ? Array.from({ length: Math.min(n, 12) }, () => '<i class="mind-back"></i>').join('') : '<span class="mind-none">다 냈어요</span>';
            return `<div class="mind-mate${n || over ? '' : ' is-empty'}">
                <p class="mind-mate-name"><span>${esc(nameOf(p))}</span>${badge}</p>
                ${over ? '' : `<div class="mind-backs" aria-label="남은 카드 ${n}장">${backs}<span class="mind-count">${n}장</span></div>`}
            </div>`;
        }).join('');
    }

    function tableHtml(g, over) {
        const ev = g.event;
        // 시작·레벨 통과 알림은 마음 모으기 때만 보여요(시작한 뒤에는 낸 카드 소식만).
        const evText = g.phase === 'play' && ev && (ev.type === 'start' || ev.type === 'level') ? '' : mindEventText(g, nameOf);
        const evCls = ev && ev.type === 'miss' ? ' is-miss' : ev && (ev.type === 'level' || ev.type === 'star') ? ' is-good' : '';
        const top = g.pile.slice(-5);
        const pile = top.length
            ? top.map((x, i) => `<span class="mind-card mind-pile-card${i === top.length - 1 ? ' is-top' : ''}" style="--i:${i - (top.length - 1)}"><b>${x.c}</b>${i === top.length - 1 ? `<em>${esc(nameOf(x.by))}</em>` : ''}</span>`).join('')
            : '<span class="mind-pile-empty">가장 작은 카드를 가진 사람이 먼저 내요</span>';
        let focus = '';
        if (g.phase === 'focus') {
            const iAmReady = g.ready.includes(me());
            const reward = MIND_REWARDS[g.level] ? `<p class="mind-focus-reward">이 레벨을 통과하면 ${MIND_REWARDS[g.level] === 'life' ? '생명 +1' : '수리검 +1'}</p>` : '';
            focus = `<div class="mind-focus">
                <p class="mind-focus-level">레벨 ${g.level}</p>
                <p class="mind-focus-text">내 카드를 보고 마음을 모아요. 모두 준비하면 시작해요.</p>
                ${reward}
                <button type="button" class="boardgame-primary-btn mind-ready-btn" data-m="ready"${iAmReady ? ' disabled' : ''}>${iAmReady ? `친구를 기다려요 (${g.ready.length}/${g.players.length})` : '준비됐어요'}</button>
            </div>`;
        }
        let result = '';
        if (over) {
            const won = g.phase === 'won';
            const canAgain = room.members.length >= 2 && g.leftBy !== room.hostId;
            result = `<div class="mind-result${won ? ' is-won' : ''}">
                <p class="mind-result-title">${won ? '모두 통과! 🎉' : g.phase === 'lost' ? '여기까지!' : '도전이 끝났어요'}</p>
                <p class="mind-result-line">${esc(mindEndText(g, nameOf))}</p>
                ${g.phase === 'lost' && evText ? `<p class="mind-event is-miss">${esc(evText)}</p>` : ''}
                <div class="mind-result-actions">
                    ${canAgain ? '<button type="button" class="boardgame-primary-btn" data-m="again">한 판 더 할래요</button>' : ''}
                    ${isHost() ? '<button type="button" class="boardgame-mini-btn" data-m="close">방 닫을게요</button>' : '<button type="button" class="boardgame-mini-btn" data-m="leave">나갈게요</button>'}
                </div>
            </div>`;
        }
        return `<div class="mind-table">
            ${g.phase === 'focus' || over ? '' : `<div class="mind-pile">${pile}</div>`}
            ${focus}${result}
            ${evText && !over ? `<p class="mind-event${evCls}" role="status">${esc(evText)}</p>` : ''}
        </div>`;
    }

    function handHtml(g, over) {
        const mine = g.hands[me()] || [];
        if (!g.players.includes(me())) return '<p class="mind-tip">구경하고 있어요.</p>';
        if (over) return '';
        if (!mine.length) return '<p class="mind-tip">내 카드를 다 냈어요. 친구들을 믿고 기다려요.</p>';
        const canPlay = g.phase === 'play';
        const cards = mine.map((c, i) => (i === 0
            ? `<button type="button" class="mind-card mind-hand-card is-low" data-m="play" data-c="${c}"${canPlay ? '' : ' disabled'} aria-label="${c} 내기"><b>${c}</b><em>${canPlay ? '내기' : ''}</em></button>`
            : cardHtml(c, 'mind-hand-card'))).join('');
        return `<div class="mind-hand" aria-label="내 카드">${cards}</div>
            <p class="mind-tip">${canPlay ? '지금이다 싶을 때 가장 작은 카드를 눌러서 내요. 말은 하지 않아요!' : '내 카드예요. 가장 작은 수가 얼마쯤인지 느껴 봐요.'}</p>`;
    }

    function starHtml(g, over) {
        if (over || g.phase !== 'play' || !g.players.includes(me())) return '';
        const voted = g.starVotes.includes(me());
        const anyVote = g.starVotes.length > 0;
        if (!anyVote) {
            return `<button type="button" class="boardgame-mini-btn mind-star-btn" data-m="star"${g.stars > 0 ? '' : ' disabled'}>✦ 수리검 쓰자 (${g.stars}개)</button>`;
        }
        const who = g.starVotes.map(nameOf).join(', ');
        return `<div class="mind-star-vote">
            <span>✦ 수리검을 쓸까요? 동의 ${g.starVotes.length}/${g.players.length} (${esc(who)})</span>
            ${voted ? '' : '<button type="button" class="boardgame-primary-btn" data-m="star">동의</button>'}
            <button type="button" class="boardgame-mini-btn" data-m="star-no">${voted ? '취소' : '아니요'}</button>
        </div>`;
    }

    function react(g) {
        const roomKey = `${room.id}:${g.gid}`;
        const ev = g.event;
        const key = `${roomKey}:${g.phase}:${g.level}:${ev ? `${ev.type}:${ev.c}:${ev.cards.length}` : ''}:${g.pile.length}`;
        const first = lastRoomKey !== roomKey;
        lastRoomKey = roomKey;
        if (key === lastKey) return;
        lastKey = key;
        if (first || !feedback) return;
        if (g.phase === 'won') feedback.play('ok');
        else if (g.phase === 'lost' || g.phase === 'left') feedback.play('no');
        else if (ev && (ev.type === 'miss' || ev.prev === 'miss')) feedback.play('no');
        else if (ev && ev.type === 'level') feedback.play('ok');
        else if (ev && ev.type === 'play' && ev.by !== me()) {
            try { if (navigator.vibrate) navigator.vibrate(20); } catch (_) { /* 진동 없는 기기 */ }
        }
    }

    /** 방 문서가 바뀔 때마다 불러요(판 화면에 있을 때). */
    function render(nextRoom) {
        bind();
        room = nextRoom;
        const el = view();
        if (!el || !room) return;
        const g = game();
        const over = room.status === 'finished' || isMindOver(g);
        let body = el.querySelector('[data-ox-body]');
        if (!body) {
            el.innerHTML = '<div class="mind-body" data-ox-body></div>';
            body = el.querySelector('[data-ox-body]');
        }
        const lives = Array.from({ length: Math.max(g.lives, 0) }, () => '❤').join('') || '0';
        body.innerHTML = `
            <div class="mind-top">
                <button type="button" class="boardgame-mini-btn" data-m="leave">나가기</button>
                <h2 class="mind-title">이심전심</h2>
                <button type="button" class="boardgame-mini-btn" data-m="rules">규칙</button>
            </div>
            <div class="mind-stats">
                <span class="mind-stat">레벨 <b>${g.level || 1}</b> / ${g.maxLevel || '-'}</span>
                <span class="mind-stat mind-lives" aria-label="생명 ${g.lives}개">${lives}</span>
                <span class="mind-stat" aria-label="수리검 ${g.stars}개">✦ <b>${g.stars}</b></span>
            </div>
            <div class="mind-mates">${matesHtml(g, over)}</div>
            ${tableHtml(g, over)}
            ${handHtml(g, over)}
            <div class="mind-actions">${starHtml(g, over)}</div>`;
        react(g);
    }

    function stop() {
        hideRules();
        room = null;
        busy = false;
    }

    return { render, stop, leave, isActive: () => !!room };
}
