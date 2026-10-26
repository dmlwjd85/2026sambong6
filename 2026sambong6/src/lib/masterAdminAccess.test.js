import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pinMasterCanEditShopPrices, pinMasterSkipsTeacherGoogle } from './masterAdminAccess.js';

describe('PIN 마스터 관리 권한', () => {
    it('상점 가격은 마스터 PIN 에서만 고치고 학생에게는 열지 않는다', () => {
        assert.equal(pinMasterCanEditShopPrices({ isGM: true }), true);
        assert.equal(pinMasterCanEditShopPrices({ isGM: false }), false);
        assert.equal(pinMasterCanEditShopPrices({}), false);
    });

    it('PIN 마스터는 구글 선생님 팝업을 띄우지 않는다', () => {
        assert.equal(pinMasterSkipsTeacherGoogle({ isAdmin: true }), true);
        assert.equal(pinMasterSkipsTeacherGoogle({ isAdmin: false }), false);
        assert.equal(pinMasterSkipsTeacherGoogle({}), false);
    });

    it('화면 저장은 마스터 판별만 보고 구글 팝업을 열지 않는다', () => {
        const world = fs.readFileSync(new URL('../sambongWorld.js', import.meta.url), 'utf8');
        const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
        assert.match(world, /pinMasterCanEditShopPrices/);
        assert.match(world, /pinMasterSkipsTeacherGoogle/);
        assert.match(world, /planEstateMerge/);
        assert.doesNotMatch(world, /signInWithPopup/);
        assert.match(html, /추가 구글 인증은 하지 않습니다/);
    });
});
