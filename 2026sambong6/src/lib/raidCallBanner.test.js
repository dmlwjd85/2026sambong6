import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickRaidCalls } from '../raidCallBanner.js';

const mem = (id) => ({ id, name: `학생${id}`, petName: '펫', species: 'emberkit', type: 'fire', stage: 1, power: 115 });
const petRoom = (leader, extra = {}) => ({ id: leader, leaderId: leader, leaderName: `학생${leader}`, stage: 2, status: 'open', members: [mem(leader)], createdAt: 1000, updatedAt: 1000, ...extra });
const bossRoom = (leader, extra = {}) => ({ id: leader, leaderId: leader, leaderName: `학생${leader}`, bossIdx: 1, status: 'open', members: [{ id: leader, name: `학생${leader}` }], createdAt: 2000, updatedAt: 2000, ...extra });

describe('도움이 필요합니다 알림', () => {
    it('모이는 중인 남의 방만 알려요(새 방이 먼저)', () => {
        const calls = pickRaidCalls({ pet: [petRoom('2')], boss: [bossRoom('3')], me: '1', now: 3000 });
        assert.deepEqual(calls.map((c) => `${c.kind}:${c.id}`), ['boss:3', 'pet:2']);
        assert.equal(calls[1].stage, 2);
        assert.equal(calls[0].max, 5);
    });
    it('내 방·시작한 방·꽉 찬 방·오래된 방·닫은 알림은 빼요', () => {
        assert.equal(pickRaidCalls({ pet: [petRoom('1')], me: '1', now: 3000 }).length, 0);
        assert.equal(pickRaidCalls({ pet: [petRoom('2', { status: 'fight' })], me: '1', now: 3000 }).length, 0);
        assert.equal(pickRaidCalls({ pet: [petRoom('2', { members: [mem('2'), mem('3')] })], me: '1', now: 3000, petMax: 2 }).length, 0);
        assert.equal(pickRaidCalls({ pet: [petRoom('2')], me: '1', now: 1000 + 31 * 60000 }).length, 0);
        assert.equal(pickRaidCalls({ pet: [petRoom('2')], me: '1', now: 3000, dismissed: ['pet:2:1000'] }).length, 0);
        assert.equal(pickRaidCalls({ boss: [bossRoom('3')], me: '1', now: 3000, bossOpen: false }).length, 0);
    });
});
