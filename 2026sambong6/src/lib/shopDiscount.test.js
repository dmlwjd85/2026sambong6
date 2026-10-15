import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    describeShopDiscountSaveError,
    formatKstDateInput,
    formatRemainingKst,
    formatShopDiscountStatus,
    formatSkinPurchaseCharge,
    getDiscountedPrice,
    getShopDiscountPhase,
    isShopDiscountActive,
    normalizeShopDiscount,
    parseKstDateInput,
    quoteSkinPurchase,
    reconcileBongAfterCommittedSkinPurchase,
    skinFieldsFromServerAfterPurchase,
    skinRefundBong,
} from './shopDiscount.js';

describe('캐릭터 상점 전체 할인', () => {
    const start = parseKstDateInput('2026-10-15', false);
    const end = parseKstDateInput('2026-10-15', true);
    const cfg = { enabled: true, percent: 30, startAt: start, endAt: end, scope: 'skins' };

    it('KST 날짜는 시작 00:00, 종료 23:59:59.999 이다', () => {
        assert.equal(start, Date.parse('2026-10-14T15:00:00.000Z'));
        assert.equal(end, Date.parse('2026-10-15T14:59:59.999Z'));
        assert.equal(end - start, 24 * 60 * 60 * 1000 - 1);
        assert.equal(formatKstDateInput(start), '2026-10-15');
        assert.equal(formatKstDateInput(end), '2026-10-15');
        assert.equal(Number.isNaN(parseKstDateInput('2026-02-31', false)), true);
        assert.equal(Number.isNaN(parseKstDateInput('', true)), true);
        assert.equal(Number.isNaN(parseKstDateInput('2026/10/15', false)), true);
    });

    it('설정을 정규화하고 0~100 정수·시작<종료가 아니면 저장을 거절한다', () => {
        assert.deepEqual(normalizeShopDiscount(null), {
            enabled: false,
            percent: 0,
            startAt: 0,
            endAt: 0,
            scope: 'skins',
        });
        const clamped = normalizeShopDiscount({
            enabled: 1,
            percent: 140,
            startAt: 5.9,
            endAt: 9,
            scope: 'items',
        });
        assert.equal(clamped.enabled, true);
        assert.equal(clamped.percent, 100);
        assert.equal(clamped.startAt, 5);
        assert.equal(clamped.scope, 'skins');
        assert.equal(describeShopDiscountSaveError({ percent: 10.5, startAt: start, endAt: end }), '할인율은 0부터 100까지의 정수로 입력해 주세요.');
        assert.equal(describeShopDiscountSaveError({ percent: 101, startAt: start, endAt: end }).includes('정수'), true);
        assert.equal(describeShopDiscountSaveError({ percent: 10, startAt: NaN, endAt: end }).includes('KST'), true);
        assert.equal(describeShopDiscountSaveError({ percent: 0, startAt: end, endAt: start }), '종료일은 시작일보다 뒤여야 합니다.');
        assert.equal(describeShopDiscountSaveError({ percent: 0, startAt: start, endAt: end }), '');
        assert.equal(describeShopDiscountSaveError({ enabled: false, percent: 30, startAt: NaN, endAt: NaN }), '');
        assert.equal(describeShopDiscountSaveError({ enabled: false, percent: 30, startAt: end, endAt: start }), '');
        assert.equal(describeShopDiscountSaveError({ enabled: false, percent: 10.5, startAt: start, endAt: end }).includes('정수'), true);
        assert.equal(describeShopDiscountSaveError({ enabled: true, percent: 30, startAt: end, endAt: start }), '종료일은 시작일보다 뒤여야 합니다.');
    });

    it('enabled && percent>0 && startAt<=now<endAt 일 때만 활성이다', () => {
        assert.equal(isShopDiscountActive(cfg, start), true);
        assert.equal(isShopDiscountActive(cfg, end - 1), true);
        assert.equal(isShopDiscountActive(cfg, end), false);
        assert.equal(getShopDiscountPhase(cfg, start - 1), 'scheduled');
        assert.equal(formatShopDiscountStatus(cfg, start - 1), '예정');
        assert.equal(isShopDiscountActive({ ...cfg, enabled: false }, start), false);
        assert.equal(isShopDiscountActive({ ...cfg, percent: 0 }, start), false);
        assert.equal(getShopDiscountPhase({ ...cfg, percent: 0 }, start), 'off');
        assert.equal(getDiscountedPrice(200, { ...cfg, percent: 0 }, start), 200);
        assert.equal(getDiscountedPrice(200, cfg, start - 1), 200);
    });

    it('할인가를 반올림하고 0 이상 원가 이하로 유지한다', () => {
        assert.equal(getDiscountedPrice(200, cfg, start), Math.round((200 * 70) / 100));
        assert.equal(getDiscountedPrice(250, { ...cfg, percent: 33 }, start), 168);
        assert.equal(getDiscountedPrice(10, { ...cfg, percent: 25 }, start), 8);
        assert.equal(getDiscountedPrice(1, { ...cfg, percent: 1 }, start), 1);
        assert.equal(getDiscountedPrice(200, { ...cfg, percent: 100 }, start), 0);
        assert.equal(getDiscountedPrice(-5, cfg, start), 0);
        const sale = getDiscountedPrice(200, cfg, start);
        assert.ok(sale >= 0 && sale <= 200);
    });

    it('남은 시간은 일·시간, 1시간 미만은 분으로 보여 준다', () => {
        const now = start;
        assert.equal(formatRemainingKst({ endAt: now + (2 * 24 + 3) * 60 * 60 * 1000 }, now), '2일 3시간 남음');
        assert.equal(formatRemainingKst({ endAt: now + 90 * 60 * 1000 }, now), '0일 1시간 남음');
        assert.equal(formatRemainingKst({ endAt: now + 60 * 60 * 1000 }, now), '0일 1시간 남음');
        assert.equal(formatRemainingKst({ endAt: now + 45 * 60 * 1000 }, now), '45분 남음');
        assert.equal(formatRemainingKst({ endAt: now + 30 * 1000 }, now), '1분 남음');
        assert.equal(formatRemainingKst({ endAt: now }, now), '');
    });

    it('구매 가격을 다시 계산하고, 화면 가격과 다르면 거절한다', () => {
        const matched = quoteSkinPurchase(200, cfg, 140, start);
        assert.deepEqual(matched, { price: 140, changed: false });
        const staleList = quoteSkinPurchase(200, cfg, 200, start);
        assert.equal(staleList.price, 140);
        assert.equal(staleList.changed, true);
        const outside = quoteSkinPurchase(200, cfg, 140, start - 1);
        assert.equal(outside.price, 200);
        assert.equal(outside.changed, true);
        const free = quoteSkinPurchase(200, { ...cfg, percent: 100 }, 0, start);
        assert.deepEqual(free, { price: 0, changed: false });
        assert.equal(formatSkinPurchaseCharge(0, true), '무료');
        assert.equal(formatSkinPurchaseCharge(0, true, (n) => `${n}B`), '무료');
        assert.equal(formatSkinPurchaseCharge(140, true, (n) => `${n}B`), '140B');
        assert.equal(formatSkinPurchaseCharge(0, false, (n) => `${n}B`), '0B');
    });

    it('환불은 결제액의 50%, 기록이 없으면 정가의 50%이다', () => {
        assert.equal(skinRefundBong(200, 140), 70);
        assert.equal(skinRefundBong(200), 100);
        assert.equal(skinRefundBong(200, undefined), 100);
        assert.equal(skinRefundBong(200, null), 100);
        assert.equal(skinRefundBong(200, ''), 100);
        assert.equal(skinRefundBong(200, 0), 0);
        assert.equal(skinRefundBong(200, 999), 100);
        assert.equal(skinRefundBong(250, 168), 84);
        assert.equal(skinRefundBong(1, 1), 0);
        assert.equal(skinRefundBong(200, -5), 100);
    });

    it('구매를 이미 반영한 뒤 저장은 서버 봉과 스킨 보유를 유지한다', () => {
        assert.equal(reconcileBongAfterCommittedSkinPurchase({
            serverBong: 960,
            accruedBong: 860,
            accruedChanged: false,
        }), 960);
        assert.equal(reconcileBongAfterCommittedSkinPurchase({
            serverBong: 600,
            accruedBong: 800,
            accruedChanged: false,
        }), 600);
        assert.equal(reconcileBongAfterCommittedSkinPurchase({
            serverBong: 960,
            accruedBong: 970.9,
            accruedChanged: true,
        }), 970);
        assert.equal(reconcileBongAfterCommittedSkinPurchase({ serverBong: NaN }), 0);
        assert.deepEqual(skinFieldsFromServerAfterPurchase({
            ownedSkins: { a: true, b: true },
            ownedSkinPaid: { a: 140, b: 200 },
            ownedSkinInstances: { a: 'ski_a', b: 'ski_b' },
            equippedSkins: { b: true },
            bong: 600,
        }), {
            ownedSkins: { a: true, b: true },
            ownedSkinPaid: { a: 140, b: 200 },
            ownedSkinInstances: { a: 'ski_a', b: 'ski_b' },
            equippedSkins: { b: true },
        });
        assert.deepEqual(skinFieldsFromServerAfterPurchase({ ownedSkins: { a: true } }), {
            ownedSkins: { a: true },
        });
        assert.deepEqual(skinFieldsFromServerAfterPurchase(null), {});
    });
});
