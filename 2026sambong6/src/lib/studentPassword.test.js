import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    PASSWORD_CHANGE_BONG,
    applyPasswordChangeFromServer,
    normalizeLoginPin,
    planPasswordChange,
} from './studentPassword.js';

describe('학생 비밀번호 변경', () => {
    it('숫자 4자리만 새 비밀번호로 받습니다', () => {
        assert.equal(normalizeLoginPin('1234'), '1234');
        assert.equal(normalizeLoginPin(' 5678 '), '5678');
        assert.equal(normalizeLoginPin('12'), '');
        assert.equal(normalizeLoginPin('abcd'), '');
        assert.equal(normalizeLoginPin('12345'), '');
    });

    it('손님·마스터는 이 경로로 바꾸지 못합니다', () => {
        assert.equal(planPasswordChange({ isGuest: true, currentPin: '1111', inputCurrent: '1111', newPin: '2222', confirmPin: '2222', bong: 20 }).reason, 'guest');
        assert.equal(planPasswordChange({ isAdmin: true, currentPin: '1111', inputCurrent: '1111', newPin: '2222', confirmPin: '2222', bong: 20 }).reason, 'admin');
    });

    it('현재 비밀번호가 맞아야 하고, 확인이 같아야 합니다', () => {
        assert.equal(planPasswordChange({ currentPin: '1111', inputCurrent: '0000', newPin: '2222', confirmPin: '2222', bong: 20 }).reason, 'current');
        assert.equal(planPasswordChange({ currentPin: '1111', inputCurrent: '1111', newPin: '22', confirmPin: '22', bong: 20 }).reason, 'format');
        assert.equal(planPasswordChange({ currentPin: '1111', inputCurrent: '1111', newPin: '2222', confirmPin: '3333', bong: 20 }).reason, 'mismatch');
        assert.equal(planPasswordChange({ currentPin: '1111', inputCurrent: '1111', newPin: '1111', confirmPin: '1111', bong: 20 }).reason, 'same');
    });

    it('수수료 10봉이 모자라면 바꾸지 못합니다', () => {
        const r = planPasswordChange({ currentPin: '1111', inputCurrent: '1111', newPin: '2222', confirmPin: '2222', bong: 9 });
        assert.equal(r.reason, 'funds');
        assert.equal(r.need, PASSWORD_CHANGE_BONG);
    });

    it('바꾸면 새 PIN과 10봉 차감 잔액을 돌려줍니다', () => {
        const r = planPasswordChange({ currentPin: '1111', inputCurrent: '1111', newPin: '9876', confirmPin: '9876', bong: 25 });
        assert.equal(r.ok, true);
        assert.equal(r.pin, '9876');
        assert.equal(r.nextBong, 15);
        assert.equal(r.cost, 10);
    });

    it('서버 PIN·잔액만 바꾸고, 낡은 큰 지갑으로 봉을 늘리지 않습니다', () => {
        const ok = applyPasswordChangeFromServer({
            serverPin: '1111',
            serverBong: 40,
            currentPin: '1111',
            nextPin: '2222',
        });
        assert.equal(ok.ok, true);
        assert.equal(ok.pin, '2222');
        assert.equal(ok.bong, 30);

        const stalePin = applyPasswordChangeFromServer({
            serverPin: '2222',
            serverBong: 30,
            currentPin: '1111',
            nextPin: '3333',
        });
        assert.equal(stalePin.ok, false);
        assert.equal(stalePin.reason, 'current');

        const staleWallet = applyPasswordChangeFromServer({
            serverPin: '1111',
            serverBong: 5,
            currentPin: '1111',
            nextPin: '2222',
        });
        assert.equal(staleWallet.ok, false);
        assert.equal(staleWallet.reason, 'funds');
        // 로컬 지갑이 100이어도 서버 40에서만 10을 뗍니다. 90으로 올리지 않습니다.
        assert.notEqual(ok.bong, 90);
    });
});
