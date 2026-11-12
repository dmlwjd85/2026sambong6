/**
 * OX 퀴즈 정답·오답 반응(이펙트·소리·진동). 연습·무제한 도전·함께 풀기가 함께 써요.
 *
 * - 이펙트는 스테이지 위에 잠깐 떴다 사라지는 겹 레이어예요. 화면 내용(body)을 다시 그려도 지워지지 않고,
 *   눌러도 아래 버튼을 막지 않아요(pointer-events: none).
 *   맞히면 초록 O가 톡 튀어나오며 반짝이고, 틀리면 빨간 X와 함께 화면이 짧게 흔들려요.
 * - 소리는 녹음 파일 없이 Web Audio로 만들어요. 맞히면 올라가는 '띠링', 틀리면 낮은 '삐-익'.
 *   함께 풀기 정답 공개처럼 손으로 누르지 않은 때에도 소리가 나도록, 스테이지를 처음 누를 때 소리를 깨워 둬요(unlock).
 * - 진동은 지원하는 기기(주로 안드로이드)에서만 나요. 맞히면 짧게 한 번, 틀리면 두 번.
 * - 움직임 줄이기 설정이면 흔들림·튀어나옴은 빼고 표시만 해요(CSS).
 */

/** 반응 종류: ok(맞힘) | no(틀림) | timeout(시간 초과, 틀림과 같은 소리·진동) */
export const OX_FEEDBACK_KINDS = Object.freeze(['ok', 'no', 'timeout']);

/** 이펙트가 화면에 머무는 시간(ms) */
export const OX_FEEDBACK_SHOW_MS = 700;

/**
 * 종류별 소리·진동·문구(순수 함수, 테스트용).
 * notes: [주파수(Hz), 시작(초), 길이(초), 파형, 세기]
 */
export function oxFeedbackPlan(kind) {
    const k = OX_FEEDBACK_KINDS.includes(kind) ? kind : 'no';
    if (k === 'ok') {
        return {
            kind: k,
            label: '정답!',
            mark: 'O',
            vibrate: [35],
            notes: [
                [880, 0, 0.16, 'triangle', 0.32],
                [1174.66, 0.08, 0.18, 'triangle', 0.3],
                [1567.98, 0.16, 0.32, 'triangle', 0.28],
                [3135.96, 0.16, 0.22, 'sine', 0.06],
            ],
        };
    }
    return {
        kind: k,
        label: k === 'timeout' ? '시간 초과' : '오답',
        mark: 'X',
        vibrate: [90, 60, 90],
        notes: [
            [220, 0, 0.18, 'square', 0.12],
            [164.81, 0.16, 0.3, 'square', 0.12],
            [110, 0, 0.46, 'sine', 0.22],
        ],
    };
}

/**
 * @param {HTMLElement} stage 퀴즈 스테이지(#oxQuizStage)
 */
export function createOxFeedback(stage) {
    let ctx = null;
    let layer = null;
    let hideTimer = 0;

    function audio() {
        if (ctx) return ctx;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) ctx = new AC();
        } catch (_) { ctx = null; }
        return ctx;
    }

    /** 사용자가 누를 때 불러서 소리를 깨워 둬요(브라우저는 누르기 전에는 소리를 막아요). */
    function unlock() {
        const c = audio();
        if (c && c.state === 'suspended') c.resume().catch(() => {});
    }

    function playSound(plan) {
        const c = audio();
        if (!c) return;
        if (c.state === 'suspended') c.resume().catch(() => {});
        try {
            const t0 = c.currentTime + 0.01;
            const master = c.createGain();
            master.gain.value = 0.8;
            master.connect(c.destination);
            for (const [freq, at, dur, type, vol] of plan.notes) {
                const osc = c.createOscillator();
                const g = c.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, t0 + at);
                if (plan.kind !== 'ok') osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t0 + at + dur);
                g.gain.setValueAtTime(0.0001, t0 + at);
                g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
                osc.connect(g);
                g.connect(master);
                osc.start(t0 + at);
                osc.stop(t0 + at + dur + 0.02);
            }
        } catch (_) { /* 소리가 막혀 있으면 조용히 넘어가요 */ }
    }

    function vibrate(pattern) {
        try {
            if (navigator.vibrate) navigator.vibrate(pattern);
        } catch (_) { /* 진동 없는 기기 */ }
    }

    function ensureLayer() {
        if (layer && layer.isConnected) return layer;
        layer = document.createElement('div');
        layer.className = 'ox-fx hidden';
        layer.setAttribute('aria-hidden', 'true');
        stage.appendChild(layer);
        return layer;
    }

    function showEffect(plan) {
        const el = ensureLayer();
        clearTimeout(hideTimer);
        const sparks = plan.kind === 'ok' ? '<span class="ox-fx-sparks"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' : '';
        el.className = `ox-fx is-${plan.kind === 'ok' ? 'ok' : 'no'}`;
        el.innerHTML = `${sparks}<span class="ox-fx-mark">${plan.mark}</span><span class="ox-fx-label">${plan.label}</span>`;
        // 흔들림은 스테이지 몸통에만 줘요(위 막대·닫기 버튼은 그대로).
        const body = stage.querySelector('[data-ox-body]');
        if (body) {
            body.classList.remove('ox-shake', 'ox-glow');
            void body.offsetWidth;
            body.classList.add(plan.kind === 'ok' ? 'ox-glow' : 'ox-shake');
        }
        hideTimer = setTimeout(() => {
            el.classList.add('hidden');
            el.innerHTML = '';
            if (body) body.classList.remove('ox-shake', 'ox-glow');
        }, OX_FEEDBACK_SHOW_MS);
    }

    /** 맞힘·틀림 반응을 한 번 보여 줘요. */
    function play(kind) {
        const plan = oxFeedbackPlan(kind);
        showEffect(plan);
        playSound(plan);
        vibrate(plan.vibrate);
        return plan;
    }

    stage.addEventListener('pointerdown', unlock, { passive: true });

    return { play, unlock };
}
