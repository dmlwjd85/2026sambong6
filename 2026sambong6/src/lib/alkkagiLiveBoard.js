/**
 * 실시간 알까기 판 그리기·입력(브라우저 전용).
 *
 * - 판·알 그림은 기존 알까기(alkkagiBoard.js)에서 구운 것을 그대로 써요(그 파일 동작은 바꾸지 않아요).
 * - 기존 판과 달리 알이 움직이는 중에도 내 알을 잡아 쏠 수 있어요(동시 대전).
 * - 판 계산은 이 파일이 하지 않아요. 프레임마다 opts.frame(nowMs)로 엔진 결과(알·부딪힘·탈락)를 받아 그려요.
 * - 조준선·힘 게이지·예상 경로·숫자는 그리지 않아요(선생님 요청). 쿨다운 동안은 내 알에 옅은 시계 고리만 그려요.
 */

import { ALKKAGI_CONFIG } from './alkkagiGame.js';
import { bakeAlkkagiBoardLayer, bakeAlkkagiFace, bakeAlkkagiShadow, bakeAlkkagiStone, alkkagiStoneVariant } from './alkkagiBoard.js';
import { alkkagiHitLevel, createAlkkagiSound } from './alkkagiSound.js';
import { alkkagiFinalShot, alkkagiIsTrembling } from './alkkagiAim.js';
import { alkkagiPointInside, alkkagiGestureCancel, alkkagiGestureDown, alkkagiGestureMove, alkkagiGestureUp, createAlkkagiGestureState } from './alkkagiGesture.js';

const W = ALKKAGI_CONFIG.width;
const PULL_MAX = 120;
const MIN_POWER = 0.05;
const FALL_SEC = 0.62;
const SMOOTH_SEC = 0.16;
const SNAP_DIST = 70; // 이보다 크게 어긋나면 미끄러뜨리지 않고 바로 맞춰요

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ frame?: (nowMs:number)=>{stones:any[], hits?:any[], outs?:any[]}, onShot?: Function, boundsEl?: Element }} opts
 */
export function createAlkkagiLiveBoard(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let L = null;
    let dpr = 1;
    let layer = null;
    let sprites = null;
    let view = { flip: false, myColor: '', canShoot: false, cooldown: 0, active: true };
    let stones = [];
    const offsets = new Map(); // id → { dx, dy, t0 } 스냅샷 보정 미끄러짐
    const fx = { ripples: [], shakes: [], falls: [] };
    let drag = null;
    let raf = 0;
    let destroyed = false;
    let sound = null;
    let lastVib = 0;
    let lastSlide = -1;
    const nowSec = () => performance.now() / 1000;

    function ensureSound() {
        if (sound) { sound.resume(); return sound; }
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            sound = createAlkkagiSound(new AC({ latencyHint: 'interactive' }));
            sound.resume();
        } catch (_) { sound = null; }
        return sound;
    }

    function vibrate(pattern, gap = 70) {
        const t = performance.now();
        if (t - lastVib < gap) return;
        lastVib = t;
        try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) { /* 무시 */ }
    }

    function layout() {
        const rect = canvas.getBoundingClientRect();
        const cssW = Math.max(200, Math.round(rect.width || canvas.clientWidth || 360));
        const maxBW = Number(canvas.dataset.maxBoard) || 9999;
        const fit = canvas.dataset.fitEl ? document.getElementById(canvas.dataset.fitEl) : null;
        const fitH = fit ? fit.clientHeight : 0;
        const byH = fitH > 120 ? fitH / 1.195 : 9999;
        const BW = Math.floor(Math.max(160, Math.min(cssW - 32, maxBW, byH)));
        const SIDE = Math.round(BW * 0.04);
        const BY = Math.round(BW * 0.085);
        const BX = Math.round((cssW - BW) / 2);
        const cssH = BY + BW + SIDE + Math.round(BW * 0.07);
        return { cssW, cssH, BW, BX, BY, SIDE, U: BW / W, R: ALKKAGI_CONFIG.radius * (BW / W) };
    }

    function resize() {
        const next = layout();
        dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
        if (L && next.cssW === L.cssW && next.BW === L.BW && canvas.width === Math.round(next.cssW * dpr)) return;
        L = next;
        canvas.style.height = `${L.cssH}px`;
        canvas.width = Math.round(L.cssW * dpr);
        canvas.height = Math.round(L.cssH * dpr);
        layer = bakeAlkkagiBoardLayer(L, bakeAlkkagiFace(L.BW, dpr), dpr);
        sprites = {
            black: [0, 1, 2, 3].map((v) => bakeAlkkagiStone('black', L.R, dpr, v)),
            white: [0, 1, 2, 3].map((v) => bakeAlkkagiStone('white', L.R, dpr, v)),
            soft: bakeAlkkagiShadow(L.R, dpr, true),
            hard: bakeAlkkagiShadow(L.R, dpr, false),
        };
        kick();
    }

    function toScreen(u, v) {
        const x = view.flip ? W - u : u;
        const y = view.flip ? W - v : v;
        return [L.BX + x * L.U, L.BY + y * L.U];
    }
    function toBoard(px, py) {
        const x = (px - L.BX) / L.U;
        const y = (py - L.BY) / L.U;
        return view.flip ? [W - x, W - y] : [x, y];
    }

    function drawStone(s, x, y, o = {}) {
        const sq = o.sq || 0;
        const press = o.press || 0;
        const ang = o.ang || 0;
        const alpha = o.alpha == null ? 1 : o.alpha;
        const lift = o.lift || 0;
        const scale = o.scale || 1;
        const R = L.R;
        ctx.save();
        ctx.globalAlpha = alpha;
        const { soft, hard } = sprites;
        const k = (1 + sq * 0.9 + press * 0.3) * alpha;
        ctx.globalAlpha = Math.min(1, k) * (1 - lift * 0.4);
        const s1 = soft.size * (1 + lift * 0.5);
        ctx.drawImage(soft.cv, x - s1 / 2 + R * 0.18 + lift * R * 0.3, y - s1 / 2 + R * 0.3 + lift * R * 0.45, s1, s1);
        ctx.globalAlpha = Math.min(1, k) * (1 - lift);
        ctx.drawImage(hard.cv, x - hard.size / 2 + R * 0.07, y - hard.size / 2 + R * 0.12, hard.size, hard.size);
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        const p = 1 - press * 0.09;
        ctx.rotate(ang);
        ctx.scale((1 - sq * 0.13) * p * scale, (1 + sq * 0.05) * p * scale);
        ctx.rotate(-ang);
        const set = sprites[s.color === 'white' ? 'white' : 'black'];
        const sp = set[alkkagiStoneVariant(s.id)];
        ctx.drawImage(sp.cv, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        ctx.restore();
    }

    function shakeOffset(t) {
        let ox = 0;
        let oy = 0;
        if (reduce) return [0, 0];
        for (const e of fx.shakes) {
            const a = t - e.t0;
            if (a < 0 || a > 0.14) continue;
            const k = e.k * (1 - a / 0.14);
            ox += Math.sin(a * 170) * k;
            oy += Math.cos(a * 130) * k * 0.6;
        }
        return [ox, oy];
    }

    function addFx(res, t) {
        for (const h of res.hits || []) {
            const lv = alkkagiHitLevel(h.rel);
            if (lv <= 0) continue;
            fx.ripples.push({ x: h.x, y: h.y, t0: t, k: lv, seed: ((h.step || 0) % 7) * 0.9 });
            fx.shakes.push({ t0: t, k: Math.min(1, h.rel / 900) * 1.6 });
            if (sound) sound.hit(h.rel);
            vibrate(Math.round(6 + lv * 14));
        }
        for (const o of res.outs || []) addFall(o, t);
    }

    function addFall(o, t) {
        if (fx.falls.some((f) => f.id === o.id && t - f.t0 < FALL_SEC)) return;
        fx.falls.push({ id: o.id, color: o.color, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, t0: t });
        fx.ripples.push({ x: o.x, y: o.y, t0: t + 0.05, k: 0.2, seed: 0.4 });
        const sp = Math.sqrt((o.vx || 0) ** 2 + (o.vy || 0) ** 2);
        if (sound) sound.fall(0.5 + Math.min(1, sp / 700) * 0.5, sound.context.currentTime + 0.32);
        vibrate([10, 40, 16], 0);
    }

    function drawFx(t, ox, oy) {
        const R = L.R;
        for (const e of fx.ripples) {
            const a = t - e.t0;
            if (a < 0 || a > 0.5) continue;
            const [x, y] = toScreen(e.x, e.y);
            const cx = x + ox;
            const cy = y + oy;
            const rings = reduce ? 1 : 2;
            for (let j = 0; j < rings; j += 1) {
                const aa = a - j * 0.08;
                if (aa < 0) continue;
                const q = Math.min(1, aa / 0.42);
                const ease = 1 - (1 - q) ** 3;
                const rad = R * 0.6 + ease * R * (reduce ? 1.4 : 3.2) * (0.55 + e.k * 0.45);
                const al = (1 - q) * (1 - q * 0.5) * (0.5 + 0.5 * e.k) * (reduce ? 0.6 : 1) * (j ? 0.55 : 1);
                const w = R * (0.38 - 0.22 * q);
                const g = ctx.createRadialGradient(cx, cy, Math.max(0, rad - w), cx, cy, rad + w * 0.6);
                g.addColorStop(0, 'rgba(255,248,228,0)');
                g.addColorStop(0.62, `rgba(255,248,228,${al * 0.95})`);
                g.addColorStop(0.8, `rgba(110,62,22,${al * 0.32})`);
                g.addColorStop(1, 'rgba(110,62,22,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(cx, cy, rad + w * 0.6, 0, 7);
                ctx.fill();
            }
        }
        for (const f of fx.falls) {
            const a = t - f.t0;
            if (a < 0 || a > FALL_SEC) continue;
            const q = a / FALL_SEC;
            const [x, y] = toScreen(f.x, f.y);
            const vx = (view.flip ? -f.vx : f.vx) * L.U;
            const vy = (view.flip ? -f.vy : f.vy) * L.U;
            const sp = Math.sqrt(vx * vx + vy * vy) || 1;
            const dl = Math.min(R * 0.95, sp * 0.12) * (1 - (1 - q) * (1 - q));
            drawStone(f, x + (vx / sp) * dl + ox, y + (vy / sp) * dl + oy + (reduce ? 0 : R * 0.35 * q * q), {
                lift: Math.min(1, q * 2.2),
                alpha: reduce ? 1 - q : 1 - q * q * q,
                scale: 1 - q * (reduce ? 0.1 : 0.55),
                sq: reduce ? 0 : Math.min(1, q * 1.4) * 0.9,
                ang: Math.atan2(vy, vx),
            });
        }
    }

    // 쿨다운: 내 알 둘레에 옅은 시계 고리(남은 만큼). 숫자는 판 밖 알림줄에 보여 줘요.
    function drawCooldownRing(x, y) {
        const k = Math.max(0, Math.min(1, view.cooldown || 0));
        if (k <= 0) return;
        const R = L.R;
        ctx.save();
        ctx.lineWidth = Math.max(2, R * 0.16);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,248,228,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, R * 1.32, 0, 7);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(150,84,28,0.78)';
        ctx.beginPath();
        ctx.arc(x, y, R * 1.32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        ctx.stroke();
        ctx.restore();
    }

    function frame() {
        raf = 0;
        if (destroyed || !L) return;
        const t = nowSec();
        const res = typeof opts.frame === 'function' ? opts.frame(performance.now()) : null;
        if (res) {
            const prev = new Map(stones.map((s) => [s.id, s]));
            stones = res.stones || stones;
            addFx(res, t);
            // 화면에서 안 보던 탈락(스냅샷으로 알게 된 것)도 떨어지는 연출을 줘요.
            for (const s of stones) {
                const p = prev.get(s.id);
                if (p && p.alive && !s.alive && !(res.outs || []).some((o) => o.id === s.id)) addFall({ ...p, vx: p.vx || 0, vy: p.vy || 0 }, t);
            }
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, L.cssW, L.cssH);
        const [ox, oy] = shakeOffset(t);
        ctx.drawImage(layer, ox, oy, L.cssW, L.cssH);
        const R = L.R;
        let slide = 0;
        let moving = false;
        for (const s of stones) {
            if (!s.alive) continue;
            const sp = Math.sqrt((s.vx || 0) ** 2 + (s.vy || 0) ** 2);
            if (sp > 0) moving = true;
            slide += sp;
            if (sp < 60 || reduce) continue;
            const [x, y] = toScreen(s.x, s.y);
            const nx = (view.flip ? -s.vx : s.vx) / sp;
            const ny = (view.flip ? -s.vy : s.vy) / sp;
            const g = ctx.createLinearGradient(x, y, x - nx * R * 3, y - ny * R * 3);
            g.addColorStop(0, `rgba(255,246,225,${Math.min(0.3, sp / 2400)})`);
            g.addColorStop(1, 'rgba(255,246,225,0)');
            ctx.strokeStyle = g;
            ctx.lineWidth = R * 1.4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x + ox, y + oy);
            ctx.lineTo(x - nx * R * 3 + ox, y - ny * R * 3 + oy);
            ctx.stroke();
        }
        if (sound) {
            const lv = Math.min(1, slide / 1200);
            if (Math.abs(lv - lastSlide) > 0.04) { lastSlide = lv; sound.slide(lv); }
        }
        drawFx(t, ox, oy);
        for (const s of stones) {
            if (!s.alive) continue;
            let [x, y] = toScreen(s.x, s.y);
            const off = offsets.get(s.id);
            if (off) {
                const q = (t - off.t0) / SMOOTH_SEC;
                if (q >= 1) offsets.delete(s.id);
                else {
                    const k = (1 - q) * (1 - q);
                    x += off.dx * k;
                    y += off.dy * k;
                }
            }
            const mine = s.color === view.myColor && view.active;
            if (drag && drag.id === s.id) {
                const press = Math.min(1, (performance.now() - drag.t0) / 90);
                const pull = drag.pull;
                const va = drag.viewAngle;
                let jx = 0;
                let jy = 0;
                if (alkkagiIsTrembling(pull)) {
                    const amp = R * (reduce ? 0.025 : 0.13);
                    jx = Math.sin(t * 131) * amp + Math.sin(t * 57) * amp * 0.4;
                    jy = Math.cos(t * 109) * amp * 0.7;
                }
                x += -Math.cos(va) * pull * R * 0.18 + jx;
                y += -Math.sin(va) * pull * R * 0.18 + jy;
                const halo = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * 1.9);
                halo.addColorStop(0, `rgba(255,236,190,${0.3 + pull * 0.2})`);
                halo.addColorStop(1, 'rgba(255,236,190,0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(x, y, R * 1.9, 0, 7);
                ctx.fill();
                drawStone(s, x, y, { sq: pull, press, ang: va });
                continue;
            }
            drawStone(s, x + ox, y + oy);
            if (mine) drawCooldownRing(x + ox, y + oy);
        }
        fx.ripples = fx.ripples.filter((e) => t - e.t0 < 0.52);
        fx.shakes = fx.shakes.filter((e) => t - e.t0 < 0.16);
        fx.falls = fx.falls.filter((e) => t - e.t0 < FALL_SEC + 0.02);
        if (moving || drag || offsets.size || fx.ripples.length || fx.shakes.length || fx.falls.length || view.cooldown > 0 || view.keepAlive) kick();
        else if (sound && lastSlide !== 0) { lastSlide = 0; sound.slide(0); }
    }

    function kick() {
        if (!raf && !destroyed) raf = requestAnimationFrame(frame);
    }

    function setView(next) {
        view = { ...view, ...next };
        if (!view.canShoot && drag) cancelDrag();
        kick();
    }

    /** 스냅샷으로 판이 바뀌기 전 좌표(before Map)를 주면, 작은 어긋남은 부드럽게 따라가요. */
    function correct(before) {
        if (!L || !before) return;
        const t = nowSec();
        for (const s of stones) {
            const b = before.get(s.id);
            if (!b || !b.alive || !s.alive) continue;
            const du = b.x - s.x;
            const dv = b.y - s.y;
            const d = Math.sqrt(du * du + dv * dv);
            if (d < 0.5 || d > SNAP_DIST || reduce) { offsets.delete(s.id); continue; }
            offsets.set(s.id, { dx: (view.flip ? -du : du) * L.U, dy: (view.flip ? -dv : dv) * L.U, t0: t });
        }
        kick();
    }

    /** 샷이 나갈 때 소리·떨림(내 샷·상대 샷 모두). */
    function launched(power) {
        if (sound) sound.launch(Math.max(0.05, Math.min(1, Number(power) || 0.5)));
        vibrate(10, 0);
        kick();
    }

    /* ---------- 입력 ---------- */
    let gst = createAlkkagiGestureState();
    const CANCEL_DIST = ALKKAGI_CONFIG.radius * 1.1;

    function localPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }

    function insideRelease(e) {
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!alkkagiPointInside(e.clientX, e.clientY, { left: 0, top: 0, right: vw - 1, bottom: vh - 1 })) return false;
        const area = opts.boundsEl || null;
        if (area && typeof area.getBoundingClientRect === 'function') {
            const r = area.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && !alkkagiPointInside(e.clientX, e.clientY, r)) return false;
        }
        return true;
    }

    function pickStone(e) {
        if (e.target !== canvas || !view.canShoot || !L) return null;
        const [px, py] = localPoint(e);
        const [u, v] = toBoard(px, py);
        let best = null;
        // 움직이는 알도 잡을 수 있게 조금 넓게 봐요.
        let bestD = (ALKKAGI_CONFIG.radius * 2.1) ** 2;
        for (const s of stones) {
            if (!s.alive || s.color !== view.myColor) continue;
            const d = (s.x - u) ** 2 + (s.y - v) ** 2;
            if (d < bestD) { bestD = d; best = s; }
        }
        return best;
    }

    function cancelDrag() {
        drag = null;
        canvas.classList.remove('is-dragging');
        kick();
    }

    function currentStone(id) {
        return stones.find((s) => s.id === id && s.alive) || null;
    }

    function onDown(e) {
        if (e.target === canvas) ensureSound();
        if (e.isPrimary && !gst.drag && e.pointerType === 'touch') gst = createAlkkagiGestureState();
        const best = pickStone(e);
        const r = alkkagiGestureDown(gst, { pointerId: e.pointerId, canStart: !!best });
        gst = r.state;
        if (r.action === 'cancel') { cancelDrag(); return; }
        if (r.action !== 'start') return;
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
        drag = { id: best.id, pointerId: e.pointerId, pull: 0, angle: 0, viewAngle: 0, t0: performance.now(), full: false, outside: false, dist: 0 };
        canvas.classList.add('is-dragging');
        vibrate(5, 0);
        kick();
    }

    function updateDrag(e) {
        const s = currentStone(drag.id);
        if (!s) { drag.pull = 0; return; }
        const [px, py] = localPoint(e);
        const [u, v] = toBoard(px, py);
        const dx = s.x - u;
        const dy = s.y - v;
        const dist = Math.sqrt(dx * dx + dy * dy);
        drag.dist = Number.isFinite(dist) ? dist : 0;
        drag.outside = !insideRelease(e);
        drag.pull = drag.outside || drag.dist < CANCEL_DIST ? 0 : Math.min(1, drag.dist / PULL_MAX);
        drag.angle = Math.atan2(dy, dx);
        drag.viewAngle = view.flip ? drag.angle + Math.PI : drag.angle;
        if (alkkagiIsTrembling(drag.pull) && !drag.full) { drag.full = true; vibrate(8, 0); }
        else if (drag.pull < 0.9) drag.full = false;
    }

    function onMove(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        e.preventDefault();
        updateDrag(e);
        gst = alkkagiGestureMove(gst, { pointerId: e.pointerId, inside: !drag.outside }).state;
        kick();
    }

    function onUp(e) {
        const mine = drag && e.pointerId === drag.pointerId;
        if (mine) updateDrag(e);
        const r = alkkagiGestureUp(gst, { pointerId: e.pointerId, inside: mine ? !drag.outside : true, dist: mine ? drag.dist : 0, cancelDist: CANCEL_DIST });
        gst = r.state;
        if (!mine) return;
        e.preventDefault();
        const d = drag;
        cancelDrag();
        if (r.action !== 'fire' || d.pull < MIN_POWER || !view.canShoot) return;
        if (!currentStone(d.id)) return;
        const shot = alkkagiFinalShot({ id: d.id, angle: d.angle, power: d.pull });
        if (!shot) return;
        if (typeof opts.onShot === 'function') opts.onShot(shot, { power: d.pull });
    }

    function onCancel(e) {
        const r = alkkagiGestureCancel(gst, { pointerId: e.pointerId, release: e.type === 'pointercancel' });
        gst = r.state;
        if (r.action === 'cancel' && drag && drag.pointerId === e.pointerId) cancelDrag();
    }

    function onLeave(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        let captured = false;
        try { captured = canvas.hasPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
        if (!captured) onCancel({ type: 'lostpointercapture', pointerId: e.pointerId });
    }

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('lostpointercapture', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    if (ro) {
        ro.observe(canvas);
        const fitEl = canvas.dataset.fitEl ? document.getElementById(canvas.dataset.fitEl) : null;
        if (fitEl) ro.observe(fitEl);
    } else window.addEventListener('resize', resize);

    return {
        resize,
        setView,
        correct,
        launched,
        kick,
        ensureSound,
        isDragging: () => !!drag,
        /** 확인용: 알의 화면 위치(CSS px, 캔버스 기준) */
        stonePoints: () => (L ? stones.map((s) => {
            const [x, y] = toScreen(s.x, s.y);
            return { id: s.id, color: s.color, alive: s.alive, x, y, r: L.R };
        }) : []),
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onCancel, true);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerleave', onLeave);
            canvas.removeEventListener('lostpointercapture', onCancel);
            if (ro) ro.disconnect();
        },
    };
}
