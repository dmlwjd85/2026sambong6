/**
 * 편의점 환불 TDZ · 은행 정합 실패 저장 가드
 * sambongWorld.js 소스에서 해당 분기의 선언/조건 순서를 잠급니다.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vm = require('node:vm');

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '../sambongWorld.js'), 'utf8');

function sliceFn(startNeedle, endNeedle) {
    const start = src.indexOf(startNeedle);
    assert.ok(start >= 0, `함수 시작을 찾지 못함: ${startNeedle}`);
    const end = src.indexOf(endNeedle, start + startNeedle.length);
    assert.ok(end > start, `함수 끝을 찾지 못함: ${endNeedle}`);
    return src.slice(start, end);
}

const refundFn = sliceFn(
    'window.refundConvenienceOrder = async function(orderId)',
    'window.saveConvenienceDeliveryFeeAdmin',
);
const refundDecl = refundFn.indexOf('const refundB =');
const refundConfirm = refundFn.indexOf('customConfirm');
assert.ok(refundDecl >= 0, 'refundB 선언이 없습니다');
assert.ok(refundConfirm >= 0, 'customConfirm 호출이 없습니다');
assert.ok(
    refundDecl < refundConfirm,
    'refundB를 customConfirm보다 먼저 계산해야 합니다. const TDZ로 환불 클릭이 ReferenceError가 됩니다.',
);

function normalizeBongValue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.floor(n);
}

function formatBongAmount(v) {
    return `${normalizeBongValue(v)}B`;
}

async function refundConfirmUsesDeclaredAmount(order) {
    const refundB = normalizeBongValue(Number(order.price) || 0);
    const msg = `[${order.itemName}] 주문을 재고 없음으로 환불할까요?\n${order.studentName}에게 ${formatBongAmount(refundB)}가 돌아갑니다.`;
    return { refundB, msg };
}

const sample = await refundConfirmUsesDeclaredAmount({
    itemName: '연필',
    studentName: '홍길동',
    price: 12.7,
});
assert.equal(sample.refundB, 12);
assert.equal(sample.msg.includes('12B'), true);

const tdzSrc = `
'use strict';
function broken(order) {
    const ok = formatBongAmount(refundB);
    const refundB = Number(order.price) || 0;
    return ok;
}
function formatBongAmount(v) { return String(v); }
broken({ price: 10 });
`;
assert.throws(
    () => vm.runInNewContext(tdzSrc),
    (err) => err && err.name === 'ReferenceError',
    '선언 전 refundB 참조는 ReferenceError여야 합니다',
);

const saveFn = sliceFn('async function saveDataToCloud(options = {})', 'window.submitLunchBid');
assert.match(
    saveFn,
    /if \(blockedByServerBalance \|\| blockedByDuplicateQuest \|\| blockedByBankReconcile\)/,
    '은행 정합 거절(blockedByBankReconcile)을 저장 실패로 다루지 않으면 거절된 출금이 성공으로 떨어지고 로컬 봉이 부풀어 이후 저장에 남을 수 있습니다.',
);

console.log('moneyPathGuards.test.mjs ok');
