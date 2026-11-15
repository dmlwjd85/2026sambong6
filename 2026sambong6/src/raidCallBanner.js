/**
 * 화면 맨 위의 작은 알림: 누군가 탐험 방(펫 탐험·OX 보스레이드)을 만들면 "도움이 필요합니다!"가 떠요.
 * 누르면 그 방에 바로 참가해요. ✕를 누르면 그 방 알림만 닫혀요.
 *
 * deps: { canShow() → 로그인했는지, selfId(), watchPet(cb) → 끄기, watchBoss(cb) → 끄기,
 *   petMax() → 펫 탐험 한 팀 최대, bossOpen() → 보스레이드가 열린 날인지, bossName(idx), petStageName(stage),
 *   joinPet(roomId), joinBoss(roomId) }
 */
import { isRaidPartyStale, sanitizeRaidParty } from './lib/petRaid.js';
import { OXB_MAX_PARTY, isOxbRoomStale, sanitizeOxbRoom } from './lib/oxBossRaid.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 알릴 방만 골라요: 모이는 중이고, 자리가 남았고, 내가 아직 안 들어간 방. 새로 만든 방이 먼저예요. */
export function pickRaidCalls({ pet = [], boss = [], me = '', now = Date.now(), petMax = 13, bossOpen = true, dismissed = [] } = {}) {
    const out = [];
    pet.map(sanitizeRaidParty).filter(Boolean).forEach((p) => {
        if (isRaidPartyStale(p, now) || p.status !== 'open' || !p.members.length || p.members.length >= petMax) return;
        if (p.members.some((m) => m.id === me)) return;
        out.push({ kind: 'pet', id: p.id, key: `pet:${p.id}:${p.createdAt}`, leader: p.leaderName, stage: p.stage, count: p.members.length, max: petMax, at: p.createdAt });
    });
    if (bossOpen) {
        boss.map(sanitizeOxbRoom).filter(Boolean).forEach((r) => {
            if (isOxbRoomStale(r, now) || r.status !== 'open' || !r.members.length || r.members.length >= OXB_MAX_PARTY) return;
            if (r.members.some((m) => m.id === me)) return;
            out.push({ kind: 'boss', id: r.id, key: `boss:${r.id}:${r.createdAt}`, leader: r.leaderName, bossIdx: r.bossIdx, count: r.members.length, max: OXB_MAX_PARTY, at: r.createdAt });
        });
    }
    return out.filter((c) => !dismissed.includes(c.key)).sort((a, b) => b.at - a.at);
}

export function createRaidCallBanner(deps) {
    let el = null;
    let pet = [];
    let boss = [];
    let unsub = [];
    const dismissed = [];
    let lastKeys = '';

    function ensure() {
        if (el && el.isConnected) return el;
        el = document.createElement('div');
        el.id = 'raidCallBanner';
        el.className = 'raid-call hidden';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
        el.addEventListener('click', (e) => {
            const t = e.target.closest('[data-call]');
            if (!t) return;
            const key = t.getAttribute('data-key');
            const act = t.getAttribute('data-call');
            if (act === 'close') { dismissed.push(key); render(); return; }
            dismissed.push(key); // 참가를 누른 방 알림은 닫아요
            render();
            if (t.getAttribute('data-kind') === 'pet') deps.joinPet(t.getAttribute('data-room'));
            else deps.joinBoss(t.getAttribute('data-room'));
        });
        return el;
    }

    /** 전투 중이거나 이미 방 목록을 보고 있으면 가리지 않게 숨겨요. */
    function busyScreen() {
        if (document.querySelector('.raid-fx, .oxb-scene')) return true;
        const ox = document.querySelector('.ox-stage.is-boss:not(.hidden)');
        if (ox) return true;
        const petRaid = document.querySelector('#challengePane-pet:not(.hidden) .pet-body.is-tab-raid');
        return !!(petRaid && petRaid.offsetParent);
    }

    function render() {
        const box = ensure();
        const calls = deps.canShow() && !busyScreen()
            ? pickRaidCalls({ pet, boss, me: String(deps.selfId() || ''), now: Date.now(), petMax: deps.petMax(), bossOpen: deps.bossOpen(), dismissed })
            : [];
        if (!calls.length) { box.classList.add('hidden'); box.innerHTML = ''; lastKeys = ''; return; }
        const c = calls[0];
        const what = c.kind === 'pet' ? `펫 탐험 STAGE ${c.stage} ${deps.petStageName(c.stage)}` : `OX 보스레이드 ${deps.bossName(c.bossIdx)}`;
        const keys = `${c.key}:${c.count}:${calls.length}`;
        if (keys === lastKeys && !box.classList.contains('hidden')) return;
        const fresh = !lastKeys.startsWith(c.key);
        lastKeys = keys;
        box.innerHTML = `<button type="button" class="raid-call-main" data-call="join" data-kind="${c.kind}" data-room="${esc(c.id)}" data-key="${esc(c.key)}">
                <span class="raid-call-sos" aria-hidden="true">🆘</span>
                <span class="raid-call-text"><b>도움이 필요합니다!</b><i>${esc(c.leader)} · ${esc(what)} · ${c.count}/${c.max}명${calls.length > 1 ? ` · 외 ${calls.length - 1}방` : ''}</i></span>
                <span class="raid-call-go">참가</span>
            </button>
            <button type="button" class="raid-call-x" data-call="close" data-key="${esc(c.key)}" aria-label="알림 닫기">✕</button>`;
        box.classList.remove('hidden');
        if (fresh) { box.classList.remove('is-new'); void box.offsetWidth; box.classList.add('is-new'); }
    }

    function sync() {
        const on = !!deps.canShow();
        if (on && !unsub.length) {
            unsub = [deps.watchPet((list) => { pet = list || []; render(); }), deps.watchBoss((list) => { boss = list || []; render(); })];
        } else if (!on && unsub.length) {
            unsub.forEach((u) => { try { if (u) u(); } catch (_) { /* 무시 */ } });
            unsub = [];
            pet = [];
            boss = [];
        }
        render();
    }

    setInterval(sync, 4000);
    return { sync, render };
}
