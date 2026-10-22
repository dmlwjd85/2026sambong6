function escapeHtmlAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * 마스터 PIN 로그인이면 구글·선생님 계정 없이 온도계를 조절합니다.
 * 학생·게스트(isAdmin 아님)는 조절하지 못합니다.
 */
export function masterCanEditLearningThermometer({ isAdmin } = {}) {
    return isAdmin === true;
}

/**
 * 상태 줄. 로그인한 마스터에게 선생님 인증을 요구하지 않습니다.
 */
export function learningThermometerAutoNote({ canEdit, hour, autoHour = 15, settledToday = false } = {}) {
    if (!canEdit) return '';
    if (Number(hour) >= autoHour) {
        return settledToday
            ? '오늘 15시 정산 완료'
            : '15시 이후입니다. 로그인한 마스터 화면에서 자동 정산되고, 지금 XP 반영으로도 바로 반영할 수 있습니다.';
    }
    return '15:00 이후 로그인한 마스터 화면에서 자동 정산됩니다. 그 전에는 지금 XP 반영을 누르세요.';
}

/**
 * canEdit가 아니면 range와 +/- 가 포커스·포인터로 값을 바꾸지 못합니다.
 * canEdit가 아닐 때 oninput/onclick을 넣지 않습니다.
 */
export function learningThermometerStudentControls({ id, value, min, max, canEdit, valueClass }) {
    const sid = escapeHtmlAttr(id);
    const safeClass = String(valueClass || '').replace(/[^a-zA-Z0-9_\- ]/g, '');
    const n = Math.round(Number(value) || 0);
    const lo = Math.round(Number(min) || 0);
    const hi = Math.round(Number(max) || 0);
    const shown = `${n >= 0 ? '+' : ''}${n}`;
    const valueHtml = `<div id="lt_value_${sid}" class="learning-thermometer-value ${safeClass}">${shown}</div>`;
    if (!canEdit) {
        return `<input type="range" min="${lo}" max="${hi}" step="1" value="${n}" disabled aria-disabled="true" tabindex="-1" class="learning-thermometer-slider" />${valueHtml}<div class="learning-thermometer-stepper" inert><button type="button" disabled tabindex="-1" aria-disabled="true">-</button><button type="button" disabled tabindex="-1" aria-disabled="true">0</button><button type="button" disabled tabindex="-1" aria-disabled="true">+</button></div>`;
    }
    return `<input type="range" min="${lo}" max="${hi}" step="1" value="${n}" class="learning-thermometer-slider" onpointerdown="window.beginLearningThermometerEdit()" onpointerup="window.endLearningThermometerEdit()" onpointercancel="window.endLearningThermometerEdit()" ontouchstart="window.beginLearningThermometerEdit()" ontouchend="window.endLearningThermometerEdit()" oninput="window.updateLearningThermometerStudent('${sid}', this.value, { save: false })" onchange="window.updateLearningThermometerStudent('${sid}', this.value, { save: true })" />${valueHtml}<div class="learning-thermometer-stepper"><button type="button" onclick="window.adjustLearningThermometerStudent('${sid}', -1)">-</button><button type="button" onclick="window.setLearningThermometerStudent('${sid}', 0)">0</button><button type="button" onclick="window.adjustLearningThermometerStudent('${sid}', 1)">+</button></div>`;
}
