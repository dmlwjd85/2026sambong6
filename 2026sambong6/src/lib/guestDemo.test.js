import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildGuestDemoClassMeta,
    buildGuestDemoRoster,
    buildGuestDemoStudents,
    buildGuestPlayerState,
    guestMayWrite,
} from './guestDemo.js';

const REAL_NAMES = ['김단엘', '김라희', '석서영', '황훈태', '마스터 J'];

test('데모 명단은 실명을 쓰지 않는다', () => {
    const roster = buildGuestDemoRoster();
    assert.ok(roster.length >= 6);
    roster.forEach((row) => {
        assert.match(row.name, /^데모 /);
        REAL_NAMES.forEach((real) => {
            assert.equal(row.name.includes(real), false);
        });
    });
    const meta = buildGuestDemoClassMeta();
    assert.equal(meta.isGuestDemo, true);
    assert.equal(meta.inviteCode, '');
    assert.equal(meta.displayName, '데모 반');
});

test('데모 학생 잔액·상태문구는 가짜 값이다', () => {
    const students = buildGuestDemoStudents();
    assert.equal(students.length, buildGuestDemoRoster().length);
    students.forEach((stu) => {
        assert.equal(typeof stu.xp, 'number');
        assert.equal(typeof stu.bong, 'number');
        assert.ok(stu.statusMessage === '' || stu.statusMessage === '데모 상태');
    });
});

test('게스트 플레이어는 쓰기가 막힌 상태다', () => {
    const player = buildGuestPlayerState();
    assert.equal(player.isGuest, true);
    assert.equal(player.isAdmin, false);
    assert.equal(player.isGM, false);
    assert.equal(guestMayWrite(player, false), false);
    assert.equal(guestMayWrite({ isGuest: false }, true), false);
    assert.equal(guestMayWrite({ isGuest: false }, false), true);
});
