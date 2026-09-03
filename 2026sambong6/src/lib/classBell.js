/**
 * 컴퓨터 로컬 시간 기준 수업 시작·종료 종.
 * 평일 1~6교시 시각에만 울리고, 이 컴퓨터에서 켜고 끌 수 있습니다.
 */

export const CLASS_BELL_PERIODS = Object.freeze([
    { id: 1, label: '1교시', start: '09:00', end: '09:40' },
    { id: 2, label: '2교시', start: '09:50', end: '10:30' },
    { id: 3, label: '3교시', start: '10:40', end: '11:20' },
    { id: 4, label: '4교시', start: '11:30', end: '12:10' },
    { id: 5, label: '5교시', start: '13:10', end: '13:50' },
    { id: 6, label: '6교시', start: '14:00', end: '14:40' },
]);

export const CLASS_BELL_STORAGE_KEY = 'sambong_class_bell_on';
export const CLASS_BELL_FIRED_PREFIX = 'sambong_class_bell_';
export const CLASS_BELL_CHECK_MS = 15 * 1000;
/** 시작·종료 팝업이 종소리와 함께 떠 있는 시간 */
export const CLASS_BELL_POPUP_MS = 10 * 1000;
/** 원래 멜로디 길이를 이 배율로 늘립니다. */
export const CLASS_BELL_MELODY_TIME_SCALE = 2;

const NOTE = Object.freeze({
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.00,
    A4: 440.00,
    C5: 523.25,
    E5: 659.25,
    G5: 783.99,
});

function scaleMelodyTimes(notes, scale = CLASS_BELL_MELODY_TIME_SCALE) {
    const mul = Number(scale);
    const s = Number.isFinite(mul) && mul > 0 ? mul : 1;
    return (Array.isArray(notes) ? notes : []).map((row) => {
        const freq = Number(row && row[0]) || 0;
        const start = Number(row && row[1]) || 0;
        const dur = Number(row && row[2]) || 0;
        return [freq, start * s, dur * s];
    });
}

/** 수업 시작 — 학교종 앞소절(올라가며 여는 소리). 시간은 2배로 늘린 값입니다. */
export const CLASS_BELL_START_MELODY = Object.freeze(scaleMelodyTimes([
    [NOTE.C5, 0.00, 0.28],
    [NOTE.C5, 0.32, 0.28],
    [NOTE.G4, 0.64, 0.28],
    [NOTE.G4, 0.96, 0.28],
    [NOTE.A4, 1.28, 0.28],
    [NOTE.A4, 1.60, 0.28],
    [NOTE.G4, 1.92, 0.70],
]));

/** 수업 종료 — 학교종 뒷소절(내려가며 닫는 소리). 시간은 2배로 늘린 값입니다. */
export const CLASS_BELL_END_MELODY = Object.freeze(scaleMelodyTimes([
    [NOTE.F4, 0.00, 0.28],
    [NOTE.F4, 0.32, 0.28],
    [NOTE.E4, 0.64, 0.28],
    [NOTE.E4, 0.96, 0.28],
    [NOTE.D4, 1.28, 0.28],
    [NOTE.D4, 1.60, 0.28],
    [NOTE.C4, 1.92, 0.80],
]));

export function classBellMelodyDurationSec(notes) {
    let end = 0;
    (Array.isArray(notes) ? notes : []).forEach((row) => {
        const start = Number(row && row[1]) || 0;
        const dur = Number(row && row[2]) || 0;
        end = Math.max(end, start + dur);
    });
    return end;
}

export function parseHhmmToMinutes(hhmm) {
    const parts = String(hhmm || '').split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
}

export function localMinutesOfDay(now = new Date()) {
    return now.getHours() * 60 + now.getMinutes();
}

export function isClassBellWeekday(now = new Date()) {
    const d = now.getDay();
    return d >= 1 && d <= 5;
}

export function classBellEvents() {
    const out = [];
    CLASS_BELL_PERIODS.forEach((p) => {
        out.push({
            key: `${p.id}_start`,
            kind: 'start',
            periodId: p.id,
            label: p.label,
            time: p.start,
            minutes: parseHhmmToMinutes(p.start),
        });
        out.push({
            key: `${p.id}_end`,
            kind: 'end',
            periodId: p.id,
            label: p.label,
            time: p.end,
            minutes: parseHhmmToMinutes(p.end),
        });
    });
    return out;
}

export function matchClassBell(now = new Date()) {
    if (!isClassBellWeekday(now)) return null;
    const minutes = localMinutesOfDay(now);
    return classBellEvents().find((e) => e.minutes === minutes) || null;
}

export function classBellFiredKey(now, event) {
    if (!event || !event.key) return '';
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${CLASS_BELL_FIRED_PREFIX}${y}-${mo}-${d}_${event.key}`;
}

export function isClassBellEnabled(raw) {
    return raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on';
}

export function melodyForClassBell(kind) {
    return kind === 'end' ? CLASS_BELL_END_MELODY : CLASS_BELL_START_MELODY;
}

export function classBellAnnounceText(event) {
    if (!event) return '';
    if (event.kind === 'end') {
        return `${event.label} 종료 (${event.time})`;
    }
    return `${event.label} 시작 (${event.time})`;
}
