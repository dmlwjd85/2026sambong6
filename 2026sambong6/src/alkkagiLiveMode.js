/**
 * 실시간 알까기 화면(방 안). 로비·방 만들기·참가 승인은 보드게임 공통 방(sambongWorld.js)을 그대로 써요.
 * 기존 알까기(턴제·한 화면 둘이서·AI) 화면과 코드는 건드리지 않고, 이 파일과 #boardgameAlkLivePlayView 만 써요.
 */
import './alkkagiLive.css';
import { ALKKAGI_BLACK, ALKKAGI_STONES_PER_SIDE, ALKKAGI_WHITE } from './lib/alkkagiGame.js';
import {
    ALKKAGI_LIVE_ENABLED,
    alkkagiLiveEndText,
    alkkagiLiveResultTitle,
    alkkagiLiveSeat,
    applyAlkkagiLiveForfeit,
    isAlkkagiLiveOver,
    liveAliveCount,
    sanitizeAlkkagiLiveGame,
} from './lib/alkkagiLiveGame.js';
import { createAlkkagiLiveBoard } from './lib/alkkagiLiveBoard.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * deps: {
 *   selfId(), memberName(room, seat), roomMember seat lookup(room, id) → seat,
 *   mutateRoom(roomId, mutator) → Promise<room|null>, applyRoomGame(room, {game, now, finished}),
 *   continueRoom(room, {actorId, now}), closeRoom(room, {actorId, now}), deleteRoom(roomId),
 *   recordResult(room), myRecordText(), loadFonts(), toLobby(), isPlayView()
 * }
 */
export function createAlkkagiLiveMode(deps) {
    let board = null;
    let room = null;
    let shownStones = [];
    const dialogs = new Set();

    const $ = (id) => document.getElementById(id);
    const me = () => String(deps.selfId() || '');
    const mySeat = (r = room) => (r ? alkkagiLiveSeat(deps.seatOf(r, me())) : '');
    const game = () => sanitizeAlkkagiLiveGame(room && room.game);
    const nameOf = (seat) => deps.memberName(room, seat);

    function ensureBoard() {
        if (board) return board;
        const canvas = $('alkLiveCanvas');
        if (!canvas) return null;
        if (deps.loadFonts) deps.loadFonts();
        board = createAlkkagiLiveBoard(canvas, {
            boundsEl: $('boardgameAlkLivePlayView'),
            frame: () => ({ stones: shownStones }),
            onShot: () => {},
        });
        const view = $('boardgameAlkLivePlayView');
        if (view) view.addEventListener('pointerdown', () => { if (board) board.ensureSound(); }, { passive: true });
        if (window.__sambongE2E) window.__alkLiveQA = { board: () => board, state: () => ({ room, stones: shownStones }) };
        return board;
    }

    function renderDots(el, alive, cls) {
        if (!el) return;
        let html = '';
        for (let i = 0; i < ALKKAGI_STONES_PER_SIDE; i += 1) html += `<i class="alk-mini ${cls}${i < alive ? '' : ' gone'}"></i>`;
        el.innerHTML = html;
    }

    function chrome() {
        if (!room) return;
        const g = game();
        const seat = mySeat();
        const over = room.status === 'finished' || isAlkkagiLiveOver(g);
        const aliveB = liveAliveCount(shownStones, ALKKAGI_BLACK);
        const aliveW = liveAliveCount(shownStones, ALKKAGI_WHITE);
        [['Black', ALKKAGI_BLACK, aliveB, 'b'], ['White', ALKKAGI_WHITE, aliveW, 'w']].forEach(([k, color, alive, cls]) => {
            const card = $(`alkLiveCard${k}`);
            const nameEl = $(`alkLiveName${k}`);
            if (card) {
                card.classList.toggle('on', !over && seat === color);
                card.classList.toggle('is-win', over && g.winner === color);
            }
            if (nameEl) {
                nameEl.textContent = nameOf(color);
                const badge = nameEl.parentElement && nameEl.parentElement.querySelector('.alk-me');
                if (seat === color && !badge) nameEl.insertAdjacentHTML('afterend', '<span class="alk-me">나</span>');
                if (seat !== color && badge) badge.remove();
            }
            const left = $(`alkLiveLeft${k}`);
            if (left) left.textContent = `${alive}개`;
            renderDots($(`alkLiveDots${k}`), alive, cls);
            const cool = $(`alkLiveCool${k}`);
            if (cool) {
                cool.style.setProperty('--k', '1');
                cool.classList.toggle('is-ready', !over);
            }
        });
        const pill = $('alkLivePill');
        const pillText = $('alkLivePillText');
        const pillDot = $('alkLivePillDot');
        const tip = $('alkLiveTip');
        let line = '판을 준비하고 있어요';
        // 실시간 입구가 꺼져 있으면(1단계) '둘이 동시에 쏘고' 안내를 보이지 않아요.
        let tipHtml = ALKKAGI_LIVE_ENABLED ? '차례가 없어요. 둘이 동시에 쏘고, 한 번 쏘면 5초 쉬어요.' : '실시간 대전은 준비하고 있어요.';
        if (over) {
            line = '판이 끝났어요';
            tipHtml = `내 알까기 전적 ${esc(deps.myRecordText())}`;
        }
        if (pill) {
            pill.classList.toggle('is-end', over);
            pill.classList.toggle('is-ready', false);
            pill.classList.toggle('is-wait', !over);
        }
        if (pillText) pillText.textContent = line;
        if (pillDot) pillDot.className = `alk-mini ${(over ? g.winner || seat : seat) === ALKKAGI_WHITE ? 'w' : 'b'}`;
        if (tip) tip.innerHTML = tipHtml;
        const res = $('alkLiveResult');
        if (res) {
            res.classList.toggle('hidden', !over);
            if (over) {
                const draw = !g.winner;
                const key = `${room.id}:${g.gid}:${g.endReason}`;
                if (res.dataset.key !== key) {
                    res.dataset.key = key;
                    const card = res.querySelector('.alk-result-card');
                    if (card) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
                }
                res.classList.toggle('is-draw', draw);
                const names = { blackName: nameOf(ALKKAGI_BLACK), whiteName: nameOf(ALKKAGI_WHITE) };
                const stone = $('alkLiveResultStone');
                if (stone) stone.className = `alk-result-stone ${draw ? 'draw' : g.winner === ALKKAGI_WHITE ? 'w' : 'b'}`;
                const title = $('alkLiveResultTitle');
                if (title) title.textContent = alkkagiLiveResultTitle(g, names);
                const lineEl = $('alkLiveResultLine');
                if (lineEl) lineEl.textContent = alkkagiLiveEndText(g, names);
                const leftEl = $('alkLiveResultLeft');
                if (leftEl) leftEl.textContent = `남은 알 ${names.blackName} ${aliveB}개 · ${names.whiteName} ${aliveW}개`;
            }
        }
        const play = $('alkLivePlayActions');
        const result = $('alkLiveResultActions');
        if (play) play.classList.toggle('hidden', over);
        if (result) result.classList.toggle('hidden', !over);
        if (board) board.setView({ flip: seat === ALKKAGI_WHITE, myColor: seat, canShoot: false, cooldown: 0, active: !over });
    }

    /** 방 문서가 바뀔 때마다 불러요(판 화면에 있을 때). */
    function render(nextRoom) {
        room = nextRoom;
        const b = ensureBoard();
        const g = game();
        shownStones = g.stones.map((s) => ({ ...s, vx: 0, vy: 0 }));
        if (b) { b.resize(); b.kick(); }
        if (room.status === 'finished') deps.recordResult(room);
        chrome();
    }

    function stop() {
        closeDialogs();
        room = null;
    }

    function closeDialogs() {
        Array.from(dialogs).forEach((close) => close());
    }

    function dialog(message, buttons, title = '') {
        return new Promise((resolve) => {
            const host = $('boardgameAlkLivePlayView') || document.body;
            const cancelBtn = buttons.find((b) => b.cancel) || buttons[buttons.length - 1];
            const wrap = document.createElement('div');
            wrap.className = 'alk-modal';
            wrap.setAttribute('role', 'dialog');
            wrap.setAttribute('aria-modal', 'true');
            wrap.innerHTML = `<div class="alk-modal-card alk-hanji">
                ${title ? `<p class="alk-modal-title">${esc(title)}</p>` : ''}
                <div class="alk-modal-text">${message}</div>
                <div class="alk-btns">${buttons.map((b, i) => `<button type="button" class="alk-btn ${b.main ? 'main' : b.danger ? 'sub danger alk-hanji' : 'sub alk-hanji'}" data-i="${i}"><span>${esc(b.label)}</span></button>`).join('')}</div>
            </div>`;
            host.appendChild(wrap);
            let done = false;
            const onKey = (e) => {
                if (done || e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                finish(cancelBtn.value);
            };
            const finish = (v) => {
                if (done) return;
                done = true;
                dialogs.delete(cancel);
                window.removeEventListener('keydown', onKey, true);
                wrap.remove();
                resolve(v);
            };
            const cancel = () => finish(cancelBtn.value);
            dialogs.add(cancel);
            window.addEventListener('keydown', onKey, true);
            wrap.querySelectorAll('[data-i]').forEach((btn) => btn.addEventListener('click', () => finish(buttons[Number(btn.getAttribute('data-i'))].value)));
            const first = wrap.querySelector(`.alk-btn[data-i="${Math.max(0, buttons.indexOf(cancelBtn))}"]`);
            if (first) first.focus({ preventScroll: true });
        });
    }

    /** how: 'resign'(기권 버튼) | 'left'(나가기). 결과 문구만 달라요. */
    async function forfeitNow(how = 'left') {
        if (!room) return null;
        const seat = mySeat();
        const id = room.id;
        return deps.mutateRoom(id, (cur) => {
            const done = applyAlkkagiLiveForfeit(cur.game, { color: seat, stones: shownStones, now: Date.now(), how });
            if (!done.ok) return { ok: false, error: done.error };
            return { ok: true, room: deps.applyRoomGame(cur, { game: done.game, now: Date.now(), finished: true }) };
        });
    }

    async function forfeit() {
        if (!room || room.status !== 'playing') return;
        const ok = await dialog('기권하면 지는 걸로 기록돼요.<br>정말 기권할까요?', [
            { label: '계속할래요', value: false, main: true, cancel: true },
            { label: '기권할게요', value: true, danger: true },
        ]);
        if (ok) await forfeitNow('resign');
    }

    /** 나가기: 두는 중이면 기권하고 방 목록으로 가요. true를 돌려주면 처리 끝. */
    async function leave() {
        if (!room) return false;
        if (room.status === 'playing' && !isAlkkagiLiveOver(room.game)) {
            const ok = await dialog('지금 나가면 지는 걸로 기록돼요.<br>그래도 나갈까요?', [
                { label: '계속할래요', value: false, main: true, cancel: true },
                { label: '나갈게요', value: true, danger: true },
            ]);
            if (!ok) return true;
            const r = room;
            await forfeitNow('left');
            deps.markLeft(r);
        }
        stop();
        deps.toLobby();
        return true;
    }

    async function continueGame() {
        if (!room) return;
        await deps.mutateRoom(room.id, (cur) => deps.continueRoom(cur, { actorId: me(), now: Date.now() }));
    }

    async function close() {
        if (!room) return;
        const ok = await dialog('방을 닫을까요?<br>목록에서도 사라져요.', [
            { label: '그대로 둘래요', value: false, main: true, cancel: true },
            { label: '닫을게요', value: true, danger: true },
        ]);
        if (!ok || !room) return;
        const id = room.id;
        const closed = await deps.mutateRoom(id, (cur) => deps.closeRoom(cur, { actorId: me(), now: Date.now() }));
        if (closed) await deps.deleteRoom(id);
        stop();
        deps.toLobby();
    }

    function showRules() {
        if (!ALKKAGI_LIVE_ENABLED) {
            return dialog('실시간 대전은 준비하고 있어요.<br>열리면 여기에서 규칙을 알려 드릴게요.', [{ label: '알겠어요', value: true, main: true }], '실시간 규칙');
        }
        return dialog(
            '차례가 없어요. 두 사람이 동시에 쏴요.<br>한 번 쏘면 5초 동안 쉬어요. 카드 아래 막대와 알 둘레 고리가 다 차면 다시 쏠 수 있어요.<br>'
            + '내 알을 꾹 잡고 반대쪽으로 당겼다가 놓으면 튕겨 나가요. 알이 움직이는 중에도 쏠 수 있어요.<br>'
            + '상대 알을 먼저 모두 떨어뜨리면 이겨요. 마지막 알이 함께 떨어지면 비겨요.<br>판 계산은 방장 기기가 해요.',
            [{ label: '알겠어요', value: true, main: true }],
            '실시간 규칙',
        );
    }

    function refresh() { if (room) chrome(); }

    return { render, refresh, stop, leave, forfeit, continueGame, close, showRules, closeDialogs, isActive: () => !!room };
}
