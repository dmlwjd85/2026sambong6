/**
 * 알까기 소리(Web Audio 합성). 녹음 파일 없이 '딱' 소리를 만들어요.
 *
 * - AudioContext·OfflineAudioContext 모두에서 같은 코드가 돌아요(영상 소리도 이 코드로 렌더해요).
 * - 동시에 최대 4음, 40ms 안에 겹친 충돌음은 무시해요.
 * - 모든 음은 짧은 엔벨로프(빠른 어택·지수 감쇠)를 쓰고, 마스터에 컴프레서+리미터를 둬요.
 * - 충돌음은 부딪친 속도에 따라 크기와 높이가 달라져요.
 */

export const ALKKAGI_SOUND_MAX_VOICES = 4;
export const ALKKAGI_SOUND_DEDUPE_SEC = 0.04;

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** 부딪친 속도(px/s) → 0..1 세기. 아주 약한 스침은 0이에요. */
export function alkkagiHitLevel(speed) {
    const s = Number(speed) || 0;
    if (s < 25) return 0;
    return clamp01(Math.pow((s - 25) / 1000, 0.7));
}

/** 소리 낼지 정하는 순수 함수. gate: { voices: number[](끝나는 시각), lastHit: number } */
export function alkkagiVoiceGate(gate, when, dur, { kind = 'hit', maxVoices = ALKKAGI_SOUND_MAX_VOICES, dedupe = ALKKAGI_SOUND_DEDUPE_SEC } = {}) {
    gate.voices = gate.voices.filter((end) => end > when);
    if (kind === 'hit' && when - gate.lastHit < dedupe) return false;
    if (gate.voices.length >= maxVoices) return false;
    gate.voices.push(when + dur);
    if (kind === 'hit') gate.lastHit = when;
    return true;
}

function makeNoise(ctx, seconds = 1) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let x = 22222; // 고정 씨앗: 실시간·오프라인 소리가 같아요
    for (let i = 0; i < len; i += 1) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (x / 0x3fffffff) - 1;
    }
    return buf;
}

export function createAlkkagiSound(ctx, { volume = 0.9 } = {}) {
    const master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    master.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);

    const noise = makeNoise(ctx, 1);
    const gate = { voices: [], lastHit: -1 };
    let slide = null;

    function env(g, t, peak, attack, decay) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    function tone(t, freq, type, peak, decay, dest = master, glide = 0) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + decay);
        const g = ctx.createGain();
        env(g, t, peak, 0.0015, decay);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + decay + 0.02);
    }

    function burst(t, { freq, q = 1, type = 'bandpass', peak, decay, offset = 0 }) {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        env(g, t, peak, 0.001, decay);
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start(t, offset % 0.9);
        src.stop(t + decay + 0.02);
    }

    const now = (when) => (when == null ? ctx.currentTime : when);

    return {
        context: ctx,
        /** 알끼리 '딱'. speed는 부딪친 상대 속도(px/s). */
        hit(speed, when) {
            const t = now(when);
            const lv = alkkagiHitLevel(speed);
            if (lv <= 0) return false;
            if (!alkkagiVoiceGate(gate, t, 0.09, { kind: 'hit' })) return false;
            const pitch = 2300 + 1100 * lv;
            const peak = 0.12 + 0.62 * lv;
            tone(t, pitch, 'sine', peak * 0.55, 0.035 + 0.025 * lv, master, 0.92);
            tone(t, pitch * 1.52, 'triangle', peak * 0.22, 0.022);
            burst(t, { freq: 3200 + 900 * lv, q: 1.4, peak: peak * 0.9, decay: 0.018 + 0.01 * lv, offset: lv * 0.37 });
            tone(t, 620 + 140 * lv, 'sine', peak * 0.18, 0.05);
            return true;
        },
        /** 손가락으로 튕기는 '톡'. power 0..1 */
        launch(power, when) {
            const t = now(when);
            const p = clamp01(power);
            if (!alkkagiVoiceGate(gate, t, 0.08, { kind: 'launch' })) return false;
            burst(t, { freq: 1500 + 700 * p, q: 0.9, peak: 0.18 + 0.32 * p, decay: 0.03, offset: 0.11 });
            tone(t, 440 + 220 * p, 'sine', 0.12 + 0.16 * p, 0.045, master, 0.8);
            return true;
        },
        /** 판 밖으로 떨어진 알이 바닥에 닿는 '톡-'. */
        fall(level, when) {
            const t = now(when);
            const lv = clamp01(level);
            if (!alkkagiVoiceGate(gate, t, 0.14, { kind: 'fall' })) return false;
            tone(t, 210 + 60 * lv, 'sine', 0.22 + 0.2 * lv, 0.12, master, 0.7);
            burst(t, { freq: 700, q: 0.7, type: 'lowpass', peak: 0.2 + 0.15 * lv, decay: 0.06, offset: 0.53 });
            return true;
        },
        /** 판 위를 미끄러지는 '스스'. level 0..1 (모든 알의 빠르기 합) */
        slide(level, when) {
            const t = now(when);
            if (!slide) {
                const src = ctx.createBufferSource();
                src.buffer = noise;
                src.loop = true;
                const bp = ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 1100;
                bp.Q.value = 0.6;
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = 2400;
                const g = ctx.createGain();
                g.gain.value = 0;
                src.connect(bp);
                bp.connect(lp);
                lp.connect(g);
                g.connect(master);
                src.start(t);
                slide = { g, bp };
            }
            const lv = clamp01(level);
            slide.g.gain.setTargetAtTime(lv * lv * 0.09, t, 0.04);
            slide.bp.frequency.setTargetAtTime(800 + 700 * lv, t, 0.05);
        },
        resume() {
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') return ctx.resume().catch(() => {});
            return Promise.resolve();
        },
    };
}
