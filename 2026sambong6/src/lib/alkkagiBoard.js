/**
 * 알까기 판 그리기·입력·손맛 연출(브라우저 전용).
 *
 * - 판은 원목(비자나무 곧은결) 느낌으로 한 번 구워 두고, 프레임마다 알·효과만 그려요.
 * - 입력은 pointer events. 내 알을 꾹 잡고 쏠 반대쪽으로 당겼다 놓으면 바로 나가요.
 *   당긴 거리만큼 힘이 들어가고(상한 있음), 알 가까이로 돌아와 놓거나 pointercancel이면 취소예요.
 * - 조준선·힘 게이지·예상 경로·숫자는 그리지 않아요.
 * - 손맛: 눌림 스쿼시, 끝까지 당기면 떨림, 부딪칠 때 파동·판 흔들림, 판 밖으로 떨어지는 알.
 * - prefers-reduced-motion이면 떨림·흔들림·파동을 줄이고, 프레임이 계속 늦으면 가벼운 모드로 바꿔요.
 */

import { ALKKAGI_DT, ALKKAGI_MAX_STEPS, applyAlkkagiShot, isAlkkagiResting, parseAlkkagiShot, stepAlkkagi } from './alkkagiPhysics.js';
import { ALKKAGI_CONFIG, alkkagiPhysicsState, simulateAlkkagiTurn } from './alkkagiGame.js';
import { alkkagiHitLevel, createAlkkagiSound } from './alkkagiSound.js';
import { ALKKAGI_LIGHT_KEEP_MS, ALKKAGI_LIGHT_KEY, alkkagiLightRemembered, alkkagiShouldGoLight } from './alkkagiPerf.js';
import { alkkagiFinalShot, alkkagiIsTrembling } from './alkkagiAim.js';
import { alkkagiPointInside, alkkagiGestureCancel, alkkagiGestureDown, alkkagiGestureMove, alkkagiGestureUp, createAlkkagiGestureState } from './alkkagiGesture.js';

const W = ALKKAGI_CONFIG.width;
const PULL_MAX = 120; // 물리 단위. 이만큼 당기면 힘이 가득 차요.
const MIN_POWER = 0.05;
const FALL_SEC = 0.62;

function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
}

/* ---------- 판 윗면(곧은결 원목) ---------- */
function bakeFace(BW, dpr) {
    const cv = makeCanvas(BW * dpr, BW * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const rnd = rng(20261026);
    const px = 1 / dpr; // 기기 1픽셀
    // 바탕: 꿀빛 비자나무. 왼쪽 위가 조금 밝아요.
    const base = g.createLinearGradient(0, 0, BW, BW * 0.4);
    base.addColorStop(0, '#eabd7c');
    base.addColorStop(0.45, '#dfab63');
    base.addColorStop(1, '#d39a52');
    g.fillStyle = base;
    g.fillRect(0, 0, BW, BW);
    const flow = (x0, y, ph) => x0 + Math.sin(y * 0.011 + ph) * 2.2 + Math.sin(y * 0.037 + ph * 1.7) * 0.7 + y * 0.022;
    // 큰 흐름: 넓은 밝고 어두운 띠(작은 화면에서도 결이 보이게 하는 낮은 주파수 대비)
    for (let i = 0; i < 16; i += 1) {
        const x0 = rnd() * BW * 1.08 - 12;
        const w = 5 + rnd() * 18;
        const dark = rnd() < 0.62;
        const a = dark ? 0.07 + rnd() * 0.09 : 0.06 + rnd() * 0.07;
        const ph = rnd() * 6.28;
        const grad = g.createLinearGradient(x0, 0, x0 + w, 0);
        const col = dark ? `rgba(150,84,28,${a})` : `rgba(255,232,186,${a})`;
        const clear = dark ? 'rgba(150,84,28,0)' : 'rgba(255,232,186,0)';
        grad.addColorStop(0, clear);
        grad.addColorStop(0.5, col);
        grad.addColorStop(1, clear);
        g.fillStyle = grad;
        g.beginPath();
        for (let y = -6; y <= BW + 6; y += 6) g.lineTo(flow(x0, y, ph), y);
        for (let y = BW + 6; y >= -6; y -= 6) g.lineTo(flow(x0, y, ph) + w, y);
        g.closePath();
        g.fill();
    }
    // 곧은결: 가늘고 촘촘한 줄. 진하기·굵기가 고르지 않아요.
    for (let i = 0; i < 230; i += 1) {
        const x0 = rnd() * BW * 1.1 - 12;
        const a = 0.06 + Math.pow(rnd(), 1.6) * 0.2;
        const w = Math.max(px, 0.35 + rnd() * 0.9);
        const ph = rnd() * 6.28;
        g.strokeStyle = `rgba(${(112 + rnd() * 28) | 0},${(58 + rnd() * 20) | 0},${(20 + rnd() * 12) | 0},${a})`;
        g.lineWidth = w;
        g.beginPath();
        for (let y = -4; y <= BW + 4; y += 4) {
            const x = flow(x0, y, ph) + Math.sin(y * 0.09 + ph) * 0.25;
            if (y < 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.stroke();
    }
    // 늦재: 또렷한 진한 줄 + 한쪽으로 번지는 그늘(나이테가 세로로 선 모양)
    for (let i = 0; i < 13; i += 1) {
        const x0 = rnd() * BW * 1.04 - 6;
        const ph = rnd() * 6.28;
        const fade = 3 + rnd() * 6;
        const shade = g.createLinearGradient(x0, 0, x0 + fade, 0);
        shade.addColorStop(0, `rgba(128,66,20,${0.16 + rnd() * 0.08})`);
        shade.addColorStop(1, 'rgba(128,66,20,0)');
        g.fillStyle = shade;
        g.beginPath();
        for (let y = -6; y <= BW + 6; y += 6) g.lineTo(flow(x0, y, ph), y);
        for (let y = BW + 6; y >= -6; y -= 6) g.lineTo(flow(x0, y, ph) + fade, y);
        g.closePath();
        g.fill();
        g.strokeStyle = `rgba(104,50,14,${0.28 + rnd() * 0.12})`;
        g.lineWidth = Math.max(px, 0.7 + rnd() * 0.5);
        g.beginPath();
        for (let y = -4; y <= BW + 4; y += 4) {
            const x = flow(x0, y, ph);
            if (y < 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.stroke();
    }
    // 물관 자국(아주 작은 세로 점)
    for (let i = 0; i < 1100; i += 1) {
        g.fillStyle = `rgba(100,52,16,${0.06 + rnd() * 0.1})`;
        g.fillRect(rnd() * BW, rnd() * BW, Math.max(px, 0.45), 0.8 + rnd() * 1.8);
    }
    // 윤기: 칠한 면에 비친 넓은 빛(사선) + 왼쪽 위 은은한 광
    g.save();
    g.translate(BW * 0.5, BW * 0.5);
    g.rotate(-0.62);
    const sheen = g.createLinearGradient(0, -BW * 0.62, 0, BW * 0.62);
    sheen.addColorStop(0, 'rgba(255,250,236,0)');
    sheen.addColorStop(0.24, 'rgba(255,250,236,0.05)');
    sheen.addColorStop(0.33, 'rgba(255,250,236,0.26)');
    sheen.addColorStop(0.38, 'rgba(255,250,236,0.12)');
    sheen.addColorStop(0.46, 'rgba(255,250,236,0.03)');
    sheen.addColorStop(0.62, 'rgba(255,250,236,0)');
    sheen.addColorStop(1, 'rgba(255,250,236,0)');
    g.fillStyle = sheen;
    g.fillRect(-BW, -BW, BW * 2, BW * 2);
    g.restore();
    const glow = g.createRadialGradient(BW * 0.22, BW * 0.18, 0, BW * 0.22, BW * 0.18, BW * 0.75);
    glow.addColorStop(0, 'rgba(255,244,214,0.20)');
    glow.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, BW, BW);
    // 가장자리로 갈수록 살짝 깊은 색
    const vig = g.createRadialGradient(BW * 0.45, BW * 0.4, BW * 0.35, BW * 0.5, BW * 0.5, BW * 0.78);
    vig.addColorStop(0, 'rgba(90,44,10,0)');
    vig.addColorStop(1, 'rgba(90,44,10,0.16)');
    g.fillStyle = vig;
    g.fillRect(0, 0, BW, BW);
    // 먹줄 13줄(번짐 한 번 + 본선)
    const m = BW * (22 / 328);
    const sp = (BW - 2 * m) / 12;
    const lw = Math.max(px, BW / 328 * 0.8);
    for (let pass = 0; pass < 2; pass += 1) {
        g.strokeStyle = pass ? 'rgba(34,18,6,0.78)' : 'rgba(34,18,6,0.09)';
        for (let i = 0; i < 13; i += 1) {
            const p = m + i * sp;
            const k = i === 0 || i === 12 ? 1.4 : 1;
            for (let s = 0; s < 12; s += 1) {
                g.globalAlpha = pass ? 0.8 + rnd() * 0.2 : 1;
                g.lineWidth = (pass ? lw : lw * 2.6) * k;
                g.beginPath();
                g.moveTo(m + s * sp, p);
                g.lineTo(m + (s + 1) * sp + 0.2, p);
                g.stroke();
                g.beginPath();
                g.moveTo(p, m + s * sp);
                g.lineTo(p, m + (s + 1) * sp + 0.2);
                g.stroke();
            }
        }
    }
    g.globalAlpha = 1;
    for (const [i, j] of [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]]) {
        const r = BW / 328 * 2.6;
        g.fillStyle = 'rgba(36,20,8,0.18)';
        g.beginPath();
        g.arc(m + i * sp, m + j * sp, r * 1.4, 0, 7);
        g.fill();
        g.fillStyle = 'rgba(36,20,8,0.88)';
        g.beginPath();
        g.arc(m + i * sp, m + j * sp, r, 0, 7);
        g.fill();
    }
    return cv;
}

/* ---------- 알 ---------- */
function bakeStone(color, R, dpr, variant) {
    const pad = 2;
    const size = (R + pad) * 2;
    const cv = makeCanvas(size * dpr, size * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.translate(size / 2, size / 2);
    const r = R;
    const rnd = rng(911 + variant * 131 + (color === 'black' ? 7 : 0));
    c.save();
    c.beginPath();
    c.arc(0, 0, r, 0, 7);
    c.clip();
    if (color === 'black') {
        const g = c.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.05, 0, 0, r * 1.05);
        g.addColorStop(0, '#5f636a');
        g.addColorStop(0.42, '#2c2e33');
        g.addColorStop(1, '#111214');
        c.fillStyle = g;
        c.fillRect(-r, -r, 2 * r, 2 * r);
        // 무광 점묘(기기 픽셀 단위)
        const d = 1 / dpr;
        for (let i = 0; i < r * r * 3.2; i += 1) {
            c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
            c.fillRect((rnd() * 2 - 1) * r, (rnd() * 2 - 1) * r, d, d);
        }
        const h = c.createRadialGradient(-r * 0.32, -r * 0.38, 0, -r * 0.32, -r * 0.38, r * 0.62);
        h.addColorStop(0, 'rgba(222,228,238,0.32)');
        h.addColorStop(1, 'rgba(222,228,238,0)');
        c.fillStyle = h;
        c.fillRect(-r, -r, 2 * r, 2 * r);
    } else {
        const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
        g.addColorStop(0, '#fffefb');
        g.addColorStop(0.55, '#f2ede3');
        g.addColorStop(1, '#cfc7b6');
        c.fillStyle = g;
        c.fillRect(-r, -r, 2 * r, 2 * r);
        // 조개결: 돌 밖 먼 중심을 둔 가늘고 촘촘한 동심 호. 아주 옅게, 굵기는 고르게.
        const th = variant * 1.37 + 0.4;
        const cx = Math.cos(th) * r * 3.4;
        const cy = Math.sin(th) * r * 3.4;
        const base = Math.sqrt(cx * cx + cy * cy);
        const step = r * 0.085;
        const lw = Math.max(1 / dpr, r * 0.022);
        for (let k = -15; k <= 15; k += 1) {
            const rad = base + k * step;
            const a = (k % 3 === 0 ? 0.06 : 0.035) * (0.85 + rnd() * 0.3);
            c.strokeStyle = `rgba(150,136,112,${a})`;
            c.lineWidth = lw;
            c.beginPath();
            c.arc(cx, cy, rad, 0, Math.PI * 2);
            c.stroke();
        }
        // 결 사이 아주 옅은 반투명 띠(조개 특유의 층)
        for (let k = -4; k <= 4; k += 1) {
            c.strokeStyle = 'rgba(176,170,160,0.025)';
            c.lineWidth = step * 1.6;
            c.beginPath();
            c.arc(cx, cy, base + k * step * 3.3 + step, 0, Math.PI * 2);
            c.stroke();
        }
        const h = c.createRadialGradient(-r * 0.38, -r * 0.44, 0, -r * 0.38, -r * 0.44, r * 0.34);
        h.addColorStop(0, 'rgba(255,255,255,0.95)');
        h.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = h;
        c.fillRect(-r, -r, 2 * r, 2 * r);
    }
    const e = c.createRadialGradient(-r * 0.15, -r * 0.25, r * 0.6, 0, 0, r * 1.02);
    e.addColorStop(0, 'rgba(0,0,0,0)');
    e.addColorStop(1, color === 'black' ? 'rgba(0,0,0,0.55)' : 'rgba(110,90,60,0.38)');
    c.fillStyle = e;
    c.fillRect(-r, -r, 2 * r, 2 * r);
    c.restore();
    c.strokeStyle = color === 'black' ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.75)';
    c.lineWidth = Math.max(1 / dpr, 0.8);
    c.beginPath();
    c.arc(0, 0, r - 0.5, Math.PI * 1.05, Math.PI * 1.7);
    c.stroke();
    return { cv, size };
}

function bakeShadow(R, dpr, soft) {
    const size = R * (soft ? 4 : 2.6);
    const cv = makeCanvas(size * dpr, size * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const g = c.createRadialGradient(size / 2, size / 2, soft ? R * 0.3 : R * 0.78, size / 2, size / 2, size / 2);
    g.addColorStop(0, soft ? 'rgba(40,20,5,0.26)' : 'rgba(30,14,2,0.5)');
    g.addColorStop(soft ? 0.55 : 0.4, soft ? 'rgba(40,20,5,0.12)' : 'rgba(30,14,2,0.18)');
    g.addColorStop(1, 'rgba(40,20,5,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    return { cv, size };
}

/* ---------- 판 전체(그림자·옆면·윗면) ---------- */
function bakeBoardLayer(L, face, dpr) {
    const cv = makeCanvas(L.cssW * dpr, L.cssH * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const { BX, BY, BW, SIDE } = L;
    c.save();
    c.shadowColor = 'rgba(60,32,10,0.42)';
    c.shadowBlur = 16;
    c.shadowOffsetY = 8;
    rr(c, BX + 6, BY + 14, BW - 12, BW + SIDE - 14, 8);
    c.fillStyle = '#7f5126';
    c.fill();
    c.restore();
    // 옆면(두께)과 마구리 결
    c.save();
    rr(c, BX, BY + 6, BW, BW + SIDE - 6, 7);
    const sg = c.createLinearGradient(0, BY + BW, 0, BY + BW + SIDE);
    sg.addColorStop(0, '#b47b40');
    sg.addColorStop(1, '#7a4c22');
    c.fillStyle = sg;
    c.fill();
    c.clip();
    for (let i = 0; i < 46; i += 1) {
        c.strokeStyle = `rgba(70,36,10,${0.08 + ((i * 37) % 10) / 70})`;
        c.lineWidth = 0.7;
        c.beginPath();
        const x = BX + (i * BW) / 46 + ((i * 13) % 5);
        c.moveTo(x, BY + BW);
        c.lineTo(x + 2, BY + BW + SIDE);
        c.stroke();
    }
    c.fillStyle = 'rgba(255,230,190,0.25)';
    c.fillRect(BX, BY + BW, BW, 1);
    c.restore();
    // 윗면
    c.save();
    rr(c, BX, BY, BW, BW, 7);
    c.clip();
    c.drawImage(face, BX, BY, BW, BW);
    c.strokeStyle = 'rgba(255,240,210,0.6)';
    c.lineWidth = 1.2;
    rr(c, BX + 0.6, BY + 0.6, BW - 1.2, BW - 1.2, 6.5);
    c.stroke();
    c.restore();
    return cv;
}

function stoneVariant(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return h % 4;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onShot?: Function, onEvent?: Function, onBusyChange?: Function }} opts
 */
export function createAlkkagiBoard(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let L = null; // 배치
    let dpr = 1;
    let face = null;
    let layer = null;
    let sprites = null;
    let view = { stones: [], flip: false, myColor: '', canShoot: false };
    let display = alkkagiPhysicsState([]); // 지금 그리는 상태
    let anim = null; // { state, prev, acc, final, onDone, log, t0 }
    let drag = null;
    const fx = { ripples: [], shakes: [], falls: [] };
    let raf = 0;
    let lastFrame = 0;
    let frameTimes = [];
    let idlePending = false;
    let light = readLightMemory();
    let sound = null;
    let destroyed = false;
    let lastVib = 0;
    const log = [];

    const nowSec = () => performance.now() / 1000;

    function readLightMemory() {
        try {
            return alkkagiLightRemembered(localStorage.getItem(ALKKAGI_LIGHT_KEY), Date.now());
        } catch (_) {
            return false;
        }
    }

    function goLight() {
        light = true; // 가벼운 모드: 흔들림·빛결·가루를 줄여요
        try {
            localStorage.setItem(ALKKAGI_LIGHT_KEY, String(Date.now() + ALKKAGI_LIGHT_KEEP_MS));
        } catch (_) { /* 무시 */ }
        emit({ type: 'light' });
    }

    function ensureSound() {
        if (sound) {
            sound.resume();
            return sound;
        }
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            sound = createAlkkagiSound(new AC({ latencyHint: 'interactive' }));
            sound.resume();
        } catch (_) {
            sound = null;
        }
        return sound;
    }

    function vibrate(pattern, gap = 70) {
        const t = performance.now();
        if (t - lastVib < gap) return;
        lastVib = t;
        try {
            if (navigator.vibrate) navigator.vibrate(pattern);
        } catch (_) { /* 무시 */ }
    }

    function emit(e) {
        log.push({ ...e, t: anim ? nowSec() - anim.t0 : 0 });
        if (log.length > 400) log.shift();
        if (typeof opts.onEvent === 'function') opts.onEvent(e);
    }

    function layout() {
        const rect = canvas.getBoundingClientRect();
        const cssW = Math.max(200, Math.round(rect.width || canvas.clientWidth || 360));
        const maxBW = Number(canvas.dataset.maxBoard) || 9999;
        // 화면 높이가 모자라면(가로 화면·작은 폰) 판을 줄여서 아래 버튼이 밀려나지 않게 해요.
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
        face = bakeFace(L.BW, dpr);
        layer = bakeBoardLayer(L, face, dpr);
        sprites = {
            black: [0, 1, 2, 3].map((v) => bakeStone('black', L.R, dpr, v)),
            white: [0, 1, 2, 3].map((v) => bakeStone('white', L.R, dpr, v)),
            soft: bakeShadow(L.R, dpr, true),
            hard: bakeShadow(L.R, dpr, false),
        };
        kick();
    }

    // 판 좌표(물리) → 화면 좌표(CSS px)
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

    function drawShadow(x, y, k, lift) {
        const { soft, hard } = sprites;
        const R = L.R;
        ctx.globalAlpha = Math.min(1, k) * (1 - lift * 0.4);
        const s1 = soft.size * (1 + lift * 0.5);
        ctx.drawImage(soft.cv, x - s1 / 2 + R * 0.18 + lift * R * 0.3, y - s1 / 2 + R * 0.3 + lift * R * 0.45, s1, s1);
        ctx.globalAlpha = Math.min(1, k) * (1 - lift);
        ctx.drawImage(hard.cv, x - hard.size / 2 + R * 0.07, y - hard.size / 2 + R * 0.12, hard.size, hard.size);
        ctx.globalAlpha = 1;
    }

    function drawStone(s, x, y, o = {}) {
        const sq = o.sq || 0;
        const press = o.press || 0;
        const ang = o.ang || 0;
        const alpha = o.alpha == null ? 1 : o.alpha;
        const lift = o.lift || 0;
        const scale = o.scale || 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        drawShadow(x, y, (1 + sq * 0.9 + press * 0.3) * alpha, lift);
        if (press > 0 && !lift) {
            // 판에 꾹 눌린 자국: 알 바로 아래 진한 접촉 그림자
            const R0 = L.R;
            const g = ctx.createRadialGradient(x, y + R0 * 0.08, R0 * 0.7, x, y + R0 * 0.08, R0 * 1.12);
            g.addColorStop(0, `rgba(48,24,6,${0.42 * press})`);
            g.addColorStop(1, 'rgba(48,24,6,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y + R0 * 0.08, R0 * 1.12, 0, 7);
            ctx.fill();
        }
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        // 눌림: 전체가 살짝 낮아지고, 당긴 축으로 납작해져요.
        const p = 1 - press * 0.09;
        ctx.rotate(ang);
        ctx.scale((1 - sq * 0.13) * p * scale, (1 + sq * 0.05) * p * scale);
        ctx.rotate(-ang);
        const set = sprites[s.color === 'white' ? 'white' : 'black'];
        const sp = set[stoneVariant(s.id)];
        ctx.drawImage(sp.cv, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        ctx.restore();
    }

    function shakeOffset(t) {
        let ox = 0;
        let oy = 0;
        if (reduce || light) return [0, 0];
        for (const e of fx.shakes) {
            const a = t - e.t0;
            if (a < 0 || a > 0.14) continue;
            const k = e.k * (1 - a / 0.14);
            ox += Math.sin(a * 170) * k;
            oy += Math.cos(a * 130) * k * 0.6;
        }
        return [ox, oy];
    }

    // 판 밖으로 나간 알: 가던 쪽으로 조금 더 미끄러지다가, 작아지고 흐려지며 바닥으로 떨어져요.
    function drawFalls(t, ox, oy) {
        const R = L.R;
        for (const f of fx.falls) {
            const a = t - f.t0;
            if (a < 0 || a > FALL_SEC) continue;
            const q = a / FALL_SEC;
            const [x, y] = toScreen(f.x, f.y);
            const vx = (view.flip ? -f.vx : f.vx) * L.U;
            const vy = (view.flip ? -f.vy : f.vy) * L.U;
            const sp = Math.sqrt(vx * vx + vy * vy) || 1;
            // 처음엔 빠르게, 점점 느리게 (가장자리를 넘어가는 느낌)
            const dl = Math.min(R * 0.95, sp * 0.12) * (1 - (1 - q) * (1 - q));
            const fx2 = x + (vx / sp) * dl + ox;
            const fy2 = y + (vy / sp) * dl + oy + (reduce ? 0 : R * 0.35 * q * q);
            const tip = reduce ? 0 : Math.min(1, q * 1.4);
            drawStone(f, fx2, fy2, {
                lift: Math.min(1, q * 2.2),
                alpha: reduce ? 1 - q : 1 - q * q * q,
                scale: 1 - q * (reduce ? 0.1 : 0.55),
                sq: tip * 0.9,
                ang: Math.atan2(vy, vx),
            });
        }
    }

    function frame() {
        raf = 0;
        if (destroyed || !L) return;
        const tNow = performance.now();
        const frameSec = lastFrame ? Math.min(0.25, (tNow - lastFrame) / 1000) : 1 / 60;
        // 프레임이 이어서 돌 때(알을 당기는 동안·굴러가는 동안)마다 재요. 그래서 첫 샷 전에도 알아채요.
        if (lastFrame) {
            frameTimes.push(tNow - lastFrame);
            if (frameTimes.length > 60) frameTimes.shift();
            if (!light && alkkagiShouldGoLight(frameTimes)) goLight();
        }
        lastFrame = tNow;
        const t = nowSec();
        if (drag && drag.ai) stepAiDrag();
        if (anim) stepAnim(frameSec, t);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, L.cssW, L.cssH);
        const [ox, oy] = shakeOffset(t);
        ctx.drawImage(layer, ox, oy, L.cssW, L.cssH);
        const R = L.R;
        // 빛결: 빠르게 미끄러지는 알 뒤로 아주 옅은 빛
        if (!light) {
            for (const s of display.stones) {
                if (!s.alive) continue;
                const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
                if (sp < 60) continue;
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
        }
        // 파동: 부딪힌 자리에 짧은 빛, 부드럽게 퍼지는 빛 고리 두 겹, 사방으로 튀는 나무 가루
        for (const e of fx.ripples) {
            const a = t - e.t0;
            if (a < 0 || a > 0.5) continue;
            const [x, y] = toScreen(e.x, e.y);
            const k = e.k;
            const cx = x + ox;
            const cy = y + oy;
            if (a < 0.1 && !reduce) {
                const f = 1 - a / 0.1;
                const rr0 = R * (0.8 + k * 0.6);
                const fl = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr0);
                fl.addColorStop(0, `rgba(255,251,236,${0.9 * f * (0.5 + k * 0.5)})`);
                fl.addColorStop(1, 'rgba(255,251,236,0)');
                ctx.fillStyle = fl;
                ctx.beginPath();
                ctx.arc(cx, cy, rr0, 0, 7);
                ctx.fill();
            }
            const rings = reduce || light ? 1 : 2;
            for (let j = 0; j < rings; j += 1) {
                const aa = a - j * 0.08;
                if (aa < 0) continue;
                const q = Math.min(1, aa / 0.42);
                const ease = 1 - (1 - q) ** 3;
                const rad = R * 0.6 + ease * R * (reduce ? 1.4 : 3.2) * (0.55 + k * 0.45);
                const al = (1 - q) * (1 - q * 0.5) * (0.5 + 0.5 * k) * (reduce ? 0.6 : 1) * (j ? 0.55 : 1);
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
            if (!reduce && !light) {
                for (let j = 0; j < 7; j += 1) {
                    const h = Math.sin((j + 1) * 12.9898 + e.seed * 78.233) * 43758.5453;
                    const rnd = h - Math.floor(h);
                    const th = j * 0.9 + e.seed + rnd * 0.7;
                    const far = 0.6 + rnd * 0.8;
                    const q = Math.min(1, a / 0.38);
                    const d = R * 0.8 + (1 - (1 - q) ** 2) * R * 3.4 * far * (0.5 + k * 0.5);
                    const al = (1 - q) * 0.85;
                    ctx.fillStyle = j % 3 === 0 ? `rgba(255,243,212,${al})` : `rgba(112,66,24,${al * 0.8})`;
                    ctx.beginPath();
                    ctx.arc(cx + Math.cos(th) * d, cy + Math.sin(th) * d, (0.9 + rnd * 1.1) * (1 - q * 0.5), 0, 7);
                    ctx.fill();
                }
            }
        }
        // 알
        for (const s of display.stones) {
            if (!s.alive) continue;
            let [x, y] = toScreen(s.x, s.y);
            if (drag && drag.id === s.id) {
                const press = Math.min(1, (performance.now() - drag.t0) / 90);
                const pull = drag.pull;
                const va = drag.viewAngle;
                let jx = 0;
                let jy = 0;
                if (alkkagiIsTrembling(pull)) {
                    // 가득 당기면 바들바들 떨려요
                    const amp = R * (reduce ? 0.025 : light ? 0.07 : 0.13);
                    jx = Math.sin(t * 131) * amp + Math.sin(t * 57) * amp * 0.4;
                    jy = Math.cos(t * 109) * amp * 0.7;
                }
                x += -Math.cos(va) * pull * R * 0.18 + jx;
                y += -Math.sin(va) * pull * R * 0.18 + jy;
                // 잡은 알 아래 은은한 빛(조준선은 아니에요)
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
        }
        drawFalls(t, ox, oy);
        // 다 끝난 효과 정리
        fx.ripples = fx.ripples.filter((e) => t - e.t0 < 0.52);
        fx.shakes = fx.shakes.filter((e) => t - e.t0 < 0.16);
        fx.falls = fx.falls.filter((e) => t - e.t0 < FALL_SEC + 0.02);
        // 차례 알림은 알과 탈락·파동 연출이 다 끝난 뒤에 바꿔요.
        if (idlePending && !anim && !fx.falls.length && !fx.ripples.length) {
            idlePending = false;
            if (typeof opts.onBusyChange === 'function') opts.onBusyChange(false);
        }
        if (anim || drag || idlePending || fx.ripples.length || fx.shakes.length || fx.falls.length) kick();
        else lastFrame = 0; // 쉬었다 다시 그릴 때의 빈 시간은 재지 않아요
    }

    function kick() {
        if (!raf && !destroyed) raf = requestAnimationFrame(frame);
    }

    function stepAnim(frameSec, t) {
        anim.acc += frameSec;
        let n = 0;
        let slideLevel = 0;
        while (anim.acc >= ALKKAGI_DT && n < 40) {
            n += 1;
            anim.acc -= ALKKAGI_DT;
            if (isAlkkagiResting(anim.state) || anim.state.step >= anim.maxStep) break;
            const before = anim.state;
            const r = stepAlkkagi(before, ALKKAGI_DT);
            anim.state = r.state;
            const vb = new Map(before.stones.map((s) => [s.id, s]));
            for (const [ia, ib] of r.hits) {
                const a = vb.get(ia);
                const b = vb.get(ib);
                if (!a || !b) continue;
                const dvx = a.vx - b.vx;
                const dvy = a.vy - b.vy;
                const rel = Math.sqrt(dvx * dvx + dvy * dvy);
                const lv = alkkagiHitLevel(rel);
                if (lv <= 0) continue;
                const na = r.state.stones.find((s) => s.id === ia);
                const nb = r.state.stones.find((s) => s.id === ib);
                const cx = (na.x + nb.x) / 2;
                const cy = (na.y + nb.y) / 2;
                fx.ripples.push({ x: cx, y: cy, t0: t, k: lv, seed: (r.state.step % 7) * 0.9 });
                fx.shakes.push({ t0: t, k: Math.min(1, rel / 900) * 1.6 });
                if (sound) sound.hit(rel);
                vibrate(Math.round(6 + lv * 14));
                emit({ type: 'hit', speed: rel, level: lv, step: r.state.step });
            }
            for (const id of r.outs) {
                const s = vb.get(id);
                const ns = r.state.stones.find((x) => x.id === id);
                if (!s || !ns) continue;
                fx.falls.push({ id, color: s.color, x: ns.x, y: ns.y, vx: s.vx, vy: s.vy, t0: t });
                // 가장자리에 톡 걸리는 작은 먼지
                fx.ripples.push({ x: ns.x, y: ns.y, t0: t + 0.05, k: 0.2, seed: 0.4 });
                const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
                const lv = Math.min(1, sp / 700);
                if (sound) {
                    const ac = sound.context;
                    sound.fall(0.5 + lv * 0.5, ac.currentTime + 0.32);
                }
                vibrate([10, 40, 16], 0);
                emit({ type: 'out', id, level: lv, step: r.state.step });
            }
        }
        if (anim.acc > ALKKAGI_DT * 4) anim.acc = 0;
        for (const s of anim.state.stones) {
            if (!s.alive) continue;
            slideLevel += Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        }
        const lvSlide = Math.min(1, slideLevel / 1200);
        if (sound) sound.slide(lvSlide);
        if (!anim.lastSlide || Math.abs(anim.lastSlide - lvSlide) > 0.04) {
            anim.lastSlide = lvSlide;
            emit({ type: 'slide', level: lvSlide, step: anim.state.step });
        }
        display = anim.state;
        if (isAlkkagiResting(anim.state) || anim.state.step >= anim.maxStep) finishAnim();
    }

    function finishAnim() {
        const a = anim;
        anim = null;
        if (sound) sound.slide(0);
        emit({ type: 'slide', level: 0, step: a.state.step });
        emit({ type: 'rest', step: a.state.step });
        display = a.final ? alkkagiPhysicsState(a.final) : a.state;
        idlePending = true;
        kick();
        if (typeof a.onDone === 'function') a.onDone();
        if (pendingView) {
            const v = pendingView;
            pendingView = null;
            setView(v);
        }
    }

    let pendingView = null;

    /** 저장된 판으로 맞춰요. 재생 중이면 끝난 뒤에 맞춰요. */
    function setView(next) {
        const merged = { ...view, ...next };
        if (anim) {
            view = { ...merged, stones: view.stones };
            pendingView = next;
            return;
        }
        view = merged;
        if (Array.isArray(next.stones)) display = alkkagiPhysicsState(next.stones);
        if (!view.canShoot && drag && !drag.ai) cancelDrag();
        kick();
    }

    /** from 좌표에서 shot(직렬화)을 재생해요. final이 오면 끝난 뒤 그 좌표를 정답으로 써요. */
    function playShot({ from, shot, final = null, onDone = null, own = false } = {}) {
        const start = alkkagiPhysicsState(from);
        const parsed = parseAlkkagiShot(shot, { state: start });
        if (!parsed.ok) {
            if (final) setView({ stones: final });
            if (onDone) onDone();
            return false;
        }
        const applied = applyAlkkagiShot(start, parsed.shot);
        log.length = 0;
        anim = { state: applied.state, acc: 0, final, onDone, t0: nowSec(), maxStep: ALKKAGI_MAX_STEPS, own };
        display = applied.state;
        if (sound) sound.launch(parsed.shot.power);
        emit({ type: 'launch', power: parsed.shot.power, step: 0 });
        vibrate(10, 0);
        idlePending = false;
        if (typeof opts.onBusyChange === 'function') opts.onBusyChange(true);
        lastFrame = 0;
        kick();
        return true;
    }

    /* ---------- AI 차례: 사람처럼 당겼다 놓기 ---------- */
    function stepAiDrag() {
        const d = drag;
        const el = performance.now() - d.t0;
        const q = Math.min(1, el / d.pullMs);
        const ease = 1 - (1 - q) * (1 - q) * (1 - q);
        // 끝으로 갈수록 천천히, 아주 살짝 손이 흔들리는 듯이 당겨요.
        d.pull = d.target * ease * (q < 1 ? 1 + Math.sin(el / 70) * 0.015 : 1);
        if (el >= d.pullMs + d.holdMs) releaseAiDrag();
    }

    function releaseAiDrag() {
        const d = drag;
        drag = null;
        const from = display.stones.map((s) => ({ id: s.id, color: s.color, x: s.x, y: s.y, alive: s.alive }));
        const sim = simulateAlkkagiTurn({ stones: from }, d.shot);
        if (!sim.ok) {
            if (typeof d.onRelease === 'function') d.onRelease({ ok: false, error: sim.error });
            return;
        }
        playShot({ from, shot: d.shot, final: sim.finalStones, own: true });
        if (typeof d.onRelease === 'function') d.onRelease({ ok: true, shot: d.shot, finalStones: sim.finalStones, steps: sim.steps, from });
    }

    /**
     * AI 샷을 사람처럼 보여 줘요: 알을 잡고 천천히 당겼다가(세면 떨려요) 놓아요.
     * aim은 AI가 노린 방향(그림용), shot은 떨림 오차까지 들어간 최종 샷이에요.
     */
    function playAiShot({ shot, aim = null } = {}, { pullMs = 900, holdMs = 380, onRelease = null } = {}) {
        if (anim || !L) return false;
        const parsed = parseAlkkagiShot(shot, { state: display });
        if (!parsed.ok) return false;
        const s = display.stones.find((x) => x.id === parsed.shot.id);
        if (!s || !s.alive) return false;
        const angle = aim && Number.isFinite(aim.angle) ? aim.angle : parsed.shot.angle;
        const target = Math.max(0.15, Math.min(1, aim && Number.isFinite(aim.power) ? aim.power : parsed.shot.power));
        drag = {
            ai: true, id: s.id, pointerId: null, sx: s.x, sy: s.y, pull: 0, angle,
            viewAngle: view.flip ? angle + Math.PI : angle, t0: performance.now(),
            full: false, outside: false, target, pullMs: Math.max(120, pullMs * (0.6 + target * 0.5)), holdMs, shot, onRelease,
        };
        ensureSound();
        kick();
        return true;
    }

    /** 진행 중인 AI 당기기를 쏘지 않고 멈춰요(나가기·새 판). */
    function cancelAiShot() {
        if (drag && drag.ai) {
            drag = null;
            kick();
        }
    }

    /* ---------- 입력 ---------- */
    function localPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }

    let gst = createAlkkagiGestureState();
    const CANCEL_DIST = ALKKAGI_CONFIG.radius * 1.1; // 알 가까이로 돌아와 놓으면 취소(약 12px)

    function insideRelease(e) {
        const x = e.clientX;
        const y = e.clientY;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!alkkagiPointInside(x, y, { left: 0, top: 0, right: vw - 1, bottom: vh - 1 })) return false;
        const area = opts.boundsEl || null;
        if (area && typeof area.getBoundingClientRect === 'function') {
            const r = area.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && !alkkagiPointInside(x, y, r)) return false;
        }
        return true;
    }

    function pickStone(e) {
        if (e.target !== canvas || !view.canShoot || anim || !L) return null;
        const [px, py] = localPoint(e);
        const [u, v] = toBoard(px, py);
        let best = null;
        let bestD = (ALKKAGI_CONFIG.radius * 1.9) ** 2;
        for (const s of display.stones) {
            if (!s.alive || s.color !== view.myColor) continue;
            const d = (s.x - u) ** 2 + (s.y - v) ** 2;
            if (d < bestD) {
                bestD = d;
                best = s;
            }
        }
        return best;
    }

    function onDown(e) {
        if (e.target === canvas) ensureSound();
        // 새로 닿은 첫 손가락이면 혹시 남은 기록을 비워요(놓친 pointerup 대비)
        if (e.isPrimary && !gst.drag && e.pointerType === 'touch') gst = createAlkkagiGestureState();
        const best = pickStone(e);
        const r = alkkagiGestureDown(gst, { pointerId: e.pointerId, canStart: !!best });
        gst = r.state;
        if (r.action === 'cancel') {
            cancelDrag();
            return;
        }
        if (r.action !== 'start' || (drag && drag.ai)) return;
        e.preventDefault();
        try {
            canvas.setPointerCapture(e.pointerId);
        } catch (_) { /* 무시 */ }
        drag = { id: best.id, pointerId: e.pointerId, sx: best.x, sy: best.y, pull: 0, angle: 0, viewAngle: 0, t0: performance.now(), full: false, outside: false };
        canvas.classList.add('is-dragging');
        vibrate(5, 0);
        kick();
    }

    function updateDrag(e) {
        const [px, py] = localPoint(e);
        const [u, v] = toBoard(px, py);
        const dx = drag.sx - u;
        const dy = drag.sy - v;
        const dist = Math.sqrt(dx * dx + dy * dy);
        drag.dist = Number.isFinite(dist) ? dist : 0;
        drag.outside = !insideRelease(e);
        // 밖으로 나가 있으면 힘을 풀어 보여 줘요(놓으면 취소예요). 돌아오면 다시 살아나요.
        drag.pull = drag.outside || drag.dist < CANCEL_DIST ? 0 : Math.min(1, drag.dist / PULL_MAX);
        drag.angle = Math.atan2(dy, dx);
        drag.viewAngle = view.flip ? drag.angle + Math.PI : drag.angle;
        if (alkkagiIsTrembling(drag.pull) && !drag.full) {
            drag.full = true;
            vibrate(8, 0);
        } else if (drag.pull < 0.9) drag.full = false;
    }

    function onMove(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        e.preventDefault();
        updateDrag(e);
        gst = alkkagiGestureMove(gst, { pointerId: e.pointerId, inside: !drag.outside }).state;
        kick();
    }

    function cancelDrag() {
        if (drag && drag.ai) return; // AI 당기기는 손가락으로 끊기지 않아요
        drag = null;
        canvas.classList.remove('is-dragging');
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
        if (r.action !== 'fire' || d.pull < MIN_POWER) return; // 취소: 알은 제자리에 있어요
        // 끝까지 당겨 떨리고 있으면 조금 빗나가요. 여기서 한 번만 정해서 보내고, 받는 쪽은 그대로 재생해요.
        const shot = alkkagiFinalShot({ id: d.id, angle: d.angle, power: d.pull });
        if (!shot) return;
        const from = display.stones.map((s) => ({ id: s.id, color: s.color, x: s.x, y: s.y, alive: s.alive }));
        const sim = simulateAlkkagiTurn({ stones: from }, shot);
        if (!sim.ok) return;
        // 손을 놓는 순간 바로 출발하고, 저장은 같은 때 따로 해요.
        playShot({ from, shot, final: sim.finalStones, own: true });
        if (typeof opts.onShot === 'function') opts.onShot({ shot, finalStones: sim.finalStones, steps: sim.steps, from });
    }

    function onCancel(e) {
        // pointercancel은 손가락이 빠진 것, lostpointercapture는 끌던 손가락만 취소해요.
        const release = e.type === 'pointercancel';
        const r = alkkagiGestureCancel(gst, { pointerId: e.pointerId, release });
        gst = r.state;
        if (r.action === 'cancel' && drag && drag.pointerId === e.pointerId) cancelDrag();
    }

    function onLeave(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        let captured = false;
        try {
            captured = canvas.hasPointerCapture(e.pointerId);
        } catch (_) { /* 무시 */ }
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
    }
    else window.addEventListener('resize', resize);

    return {
        resize,
        setView,
        playShot,
        playAiShot,
        cancelAiShot,
        ensureSound,
        isBusy: () => !!anim,
        isSettling: () => !!anim || idlePending,
        isDragging: () => !!drag,
        isAiPulling: () => !!(drag && drag.ai),
        eventLog: () => log.slice(),
        isLight: () => light,
        /** 확인용: 알의 화면 위치(CSS px, 캔버스 기준) */
        stonePoints: () => (L ? (anim ? anim.state : display).stones.map((s) => {
            const [x, y] = toScreen(s.x, s.y);
            return { id: s.id, color: s.color, alive: s.alive, x, y, r: L.R };
        }) : []),
        aliveCount: (color) => (anim ? anim.state : display).stones.filter((s) => s.alive && s.color === color).length,
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onCancel, true);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerleave', onLeave);
            canvas.removeEventListener('pointercancel', onCancel);
            canvas.removeEventListener('lostpointercapture', onCancel);
            if (ro) ro.disconnect();
        },
    };
}
