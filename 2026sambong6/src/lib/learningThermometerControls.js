function escapeHtmlAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * 선생님 인증 전에는 range와 +/- 가 포커스·포인터로 값을 바꾸지 못합니다.
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
