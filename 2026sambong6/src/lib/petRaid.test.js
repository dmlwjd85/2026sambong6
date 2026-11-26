import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as R from './petRaid.js';
import { sanitizePet } from './petGame.js';

const T0 = new Date(2026, 10, 16, 9).getTime();
const DAY = '2026-11-16';
const SP = ['emberkit', 'dropotter', 'sproutdeer', 'zapowl', 'snowbun', 'pebbletle', 'stardrake'];
const member = (i, power = 300, species = SP[i % 7]) => ({ id: String(i + 1), name: `학생${i + 1}`, species, stage: 2, level: 10, enhance: 0, power });
const team = (n, power) => Array.from({ length: n }, (_, i) => member(i, power));
const winRate = (n, power, stage, tries = 60) => {
    let w = 0;
    for (let s = 1; s <= tries; s += 1) w += R.simulateRaid(team(n, power), R.RAID_DEFAULT_STAGES[stage - 1], s * 7919).win ? 1 : 0;
    return w / tries;
};

describe('탐험 설정', () => {
    it('기본 스테이지는 22개이고, 뒤로 갈수록 세고 보상이 커요', () => {
        const s = R.sanitizeRaidSettings(null);
        assert.equal(s.stages.length, 22);
        assert.deepEqual([s.stages[10].name, s.stages[10].type, s.stages[10].art], ['전설의 챔피루', 'fight', 'punchroo_3']);
        assert.deepEqual([s.stages[20].art, s.stages[21].art], ['punchroo_3_s', 'stardrake_3_s']);
        for (let i = 1; i < 22; i += 1) {
            assert.ok(s.stages[i].hp > s.stages[i - 1].hp);
            assert.ok(s.stages[i].first >= s.stages[i - 1].first);
        }
        assert.ok(new Set(s.stages.map((x) => x.type)).size >= 6, '보스 속성이 다양해요');
        assert.equal(s.dailyRewards, 3);
        // 보상을 너무 많이 주지 않아요: 첫 보상을 다 모아도 620봉 안쪽(1~11: 135, 12~22: 470)
        assert.ok(s.stages.reduce((sum, x) => sum + x.first, 0) <= 620);
    });

    it('마스터가 고친 값은 범위 안으로 맞추고, 빈 값은 기본값을 써요', () => {
        const s = R.sanitizeRaidSettings({ stages: [{ name: ' <b>대왕</b> ', type: 'ice', hp: 50, atk: -3, first: 9999, repeat: '' }], dailyRewards: 200, maxParty: 5, teamBonus: 99 });
        assert.equal(s.stages[0].name, 'b대왕/b');
        assert.equal(s.stages[0].type, 'ice');
        assert.equal(s.stages[0].hp, 100);
        assert.equal(s.stages[0].atk, 0);
        assert.equal(s.stages[0].first, 1000);
        assert.equal(s.stages[0].repeat, 1);
        assert.equal(s.stages[1].name, R.RAID_DEFAULT_STAGES[1].name);
        assert.equal(s.dailyRewards, 99);
        assert.equal(s.teamBonus, 50);
    });

    it('한 팀 최대 인원은 학급 인원에 맞추고 13명을 넘지 않아요', () => {
        assert.equal(R.raidMaxParty(null, 13), 13);
        assert.equal(R.raidMaxParty(null, 25), 13);
        assert.equal(R.raidMaxParty(null, 8), 8);
        assert.equal(R.raidMaxParty(null, 1), 2);
        assert.equal(R.raidMaxParty({ maxParty: 5 }, 25), 5);
    });
});

describe('탐험 전투', () => {
    it('속성 상성: 유리하면 1.5배, 불리하면 0.75배', () => {
        assert.equal(R.raidTypeMult('water', 'fire'), 1.5);
        assert.equal(R.raidTypeMult('fire', 'water'), 0.75);
        assert.equal(R.raidTypeMult('fire', 'electric'), 1);
    });

    it('같은 팀·같은 씨앗이면 어디서 돌려도 결과가 똑같아요', () => {
        const a = R.simulateRaid(team(4, 400), R.RAID_DEFAULT_STAGES[3], 12345);
        const b = R.simulateRaid(JSON.parse(JSON.stringify(team(4, 400))), { ...R.RAID_DEFAULT_STAGES[3] }, 12345);
        assert.deepEqual(a, b);
        assert.notDeepEqual(a.rounds, R.simulateRaid(team(4, 400), R.RAID_DEFAULT_STAGES[3], 54321).rounds);
    });

    it('사람이 많을수록 유리해요', () => {
        assert.ok(winRate(2, 400, 5) < 0.2);
        assert.ok(winRate(6, 400, 5) > 0.9);
        const two = R.simulateRaid(team(2, 400), R.RAID_DEFAULT_STAGES[4], 7);
        const six = R.simulateRaid(team(6, 400), R.RAID_DEFAULT_STAGES[4], 7);
        assert.ok(six.teamMult > two.teamMult);
    });

    it('난이도: 갓 태어난 두 마리가 1스테이지를 깨고, 마지막 보스는 잘 키운 여럿이 모여야 해요', () => {
        assert.equal(winRate(2, 115, 1), 1);
        assert.equal(winRate(2, 115, 3), 0);
        assert.equal(winRate(6, 950, 10), 0);
        assert.ok(winRate(13, 950, 10) > 0.9);
    });

    it('전투 기록: 라운드마다 공격과 보스 반격이 있고, 보스 체력은 줄기만 해요', () => {
        const r = R.simulateRaid(team(5, 500), R.RAID_DEFAULT_STAGES[5], 99);
        assert.ok(r.rounds.length >= 2 && r.rounds.length <= R.RAID_MAX_ROUNDS);
        let hp = r.bossMaxHp;
        r.rounds.forEach((round) => {
            assert.ok(round.hits.length >= 1);
            assert.ok(round.bossHp <= hp);
            hp = round.bossHp;
            round.boss.forEach((h) => assert.ok(h.dmg > 0));
        });
        assert.equal(Object.values(r.dealt).reduce((a, b) => a + b, 0) >= r.bossMaxHp - r.bossHp, true);
    });
});

describe('탐험 방', () => {
    const pet = (extra = {}) => sanitizePet({ phase: 'pet', species: 'emberkit', stage: 2, level: 12, enhance: 1, full: 80, fedAt: T0, ...extra });

    it('대표 펫으로 팀원이 되고, 가출한 펫·알은 못 가요', () => {
        const m = R.raidMemberFromPet(pet(), { id: '3', name: '세찬', now: T0, today: DAY });
        assert.equal(m.type, 'fire');
        assert.equal(m.power, 200 + 180 + 20);
        assert.equal(R.raidMemberFromPet(pet({ full: 0, fedAt: T0 - 100 * 3600000 }), { id: '3', now: T0 }), null);
        assert.equal(R.raidMemberFromPet({ phase: 'egg' }, { id: '3', now: T0 }), null);
    });

    it('방 만들기 → 참가 → 출발 → 다시 모으기', () => {
        const made = R.createRaidParty({ member: member(0), stage: 1, unlocked: 1, now: T0 });
        assert.equal(made.ok, true);
        assert.equal(R.createRaidParty({ member: member(0), stage: 2, unlocked: 1 }).error, 'locked_stage');
        assert.equal(R.startRaid(made.party, { id: '1', seed: 5, now: T0 }).error, 'not_ready');
        assert.equal(R.startRaid(allReady(made.party), { id: '1', seed: 5, now: T0 }).error, 'need_party');
        let party = R.joinRaidParty(made.party, { member: member(1), max: 13, now: T0 }).party;
        // 같은 사람이 다시 들어오면 정보만 바뀌어요
        party = R.joinRaidParty(party, { member: { ...member(1), power: 500 }, max: 13, now: T0 }).party;
        assert.equal(party.members.length, 2);
        assert.equal(party.members[1].power, 500);
        assert.equal(R.joinRaidParty(party, { member: member(2), max: 2, now: T0 }).error, 'full');
        assert.equal(R.joinRaidParty(party, { member: member(2), max: 13, now: T0 + R.RAID_PARTY_TTL_MS + 1 }).error, 'stale');
        assert.equal(R.startRaid(party, { id: '2', seed: 5, now: T0 }).error, 'not_ready');
        party = allReady(party);
        assert.equal(R.startRaid(party, { id: '9', seed: 5, now: T0 }).error, 'not_member');
        const started = R.startRaid(party, { id: '2', seed: 5, now: T0 + 1000 }); // 방장이 아니어도 모두 준비되면 출발해요
        assert.equal(started.party.run.members.some((m) => m.ready), false);
        assert.equal(started.party.status, 'fight');
        assert.equal(started.party.run.win, started.sim.win);
        assert.equal(R.joinRaidParty(started.party, { member: member(2), now: T0 }).error, 'fighting');
        // 문서로 갔다 와도 같은 전투가 다시 나와요
        const back = R.sanitizeRaidParty(JSON.parse(JSON.stringify(started.party)));
        assert.deepEqual(R.replayRaidRun(back.run), started.sim);
        const again = R.reopenRaidParty(back, { id: '1', now: T0 + 2000 }).party;
        assert.equal(again.status, 'open');
        assert.equal(again.run.id, started.party.run.id);
        assert.equal(R.leaveRaidParty(again, { id: '2' }).party.members.length, 1);
        assert.equal(R.leaveRaidParty(again, { id: '1' }).party, null);
    });
});

describe('탐험 보상', () => {
    const run = (extra = {}) => ({ id: 'r1', stage: 2, win: true, boss: { first: 4, repeat: 1 }, members: [member(0), member(1)], ...extra });

    it('첫 클리어는 첫 보상, 그다음은 반복 보상(하루 3번), 도전은 계속할 수 있어요', () => {
        const NOCAP = { maxClears: 0 }; // 하루 횟수만 보려고 이기기 횟수 제한은 꺼요
        let r = R.claimRaidReward(null, run(), { id: '1', today: DAY, settings: NOCAP });
        assert.equal(r.bong, 4);
        assert.equal(r.first, true);
        assert.deepEqual(r.progress.firsts, [2]);
        assert.equal(R.claimRaidReward(r.progress, run(), { id: '1', today: DAY, settings: NOCAP }).error, 'claimed');
        let p = r.progress;
        for (let i = 2; i <= 4; i += 1) {
            r = R.claimRaidReward(p, run({ id: `r${i}` }), { id: '1', today: DAY, settings: NOCAP });
            assert.equal(r.bong, 1);
            p = r.progress;
        }
        r = R.claimRaidReward(p, run({ id: 'r5' }), { id: '1', today: DAY, settings: NOCAP });
        assert.equal(r.ok, true);
        assert.equal(r.bong, 0);
        assert.equal(r.limited, true);
        assert.equal(r.exp, 0); // 하루 횟수를 넘기면 경험치도 없어요
        // 다음 날에는 다시 받아요
        assert.equal(R.claimRaidReward(r.progress, run({ id: 'r6' }), { id: '1', today: '2026-11-17', settings: NOCAP }).bong, 1);
    });

    it('지면 봉은 없고, 팀원이 아니면 못 받아요', () => {
        const lose = R.claimRaidReward(null, run({ win: false }), { id: '1', today: DAY });
        assert.equal(lose.bong, 0);
        assert.deepEqual(lose.progress.firsts, []);
        assert.equal(R.claimRaidReward(null, run(), { id: '9', today: DAY }).error, 'not_member');
    });

    it('앞 스테이지를 깨야 다음이 열려요', () => {
        assert.equal(R.raidUnlockedStage(null), 1);
        assert.equal(R.raidUnlockedStage({ firsts: [1, 2] }), 3);
        assert.equal(R.raidUnlockedStage({ firsts: [1, 3] }), 2);
        assert.equal(R.raidUnlockedStage({ firsts: [1, 2, 3, 4, 5, 6, 7, 8, 9] }), 10);
        assert.equal(R.raidUnlockedStage({ firsts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }), 11);
        assert.equal(R.raidUnlockedStage({ firsts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }), 12);
        const upTo = (n) => Array.from({ length: n }, (_, i) => i + 1);
        assert.equal(R.raidUnlockedStage({ firsts: upTo(21) }), 22);
        assert.equal(R.raidUnlockedStage({ firsts: upTo(22) }), 22);
    });
});

describe('최소 인원 설정', () => {
    it('마스터가 정한 인원부터 출발해요(기본 2명)', () => {
        const pet = { phase: 'pet', species: 'emberkit', stage: 1, level: 5, exp: 0, enhance: 0, full: 90, fedAt: 1000 };
        const m = (id) => R.raidMemberFromPet(pet, { id, name: `학생${id}`, now: 1000, today: '2026-11-16' });
        let party = R.createRaidParty({ member: m('1'), stage: 1, unlocked: 1, now: 1000 }).party;
        assert.equal(R.sanitizeRaidSettings(null).minParty, 2);
        party = allReady(party);
        assert.equal(R.startRaid(party, { id: '1', seed: 5, now: 1000 }).error, 'need_party');
        assert.equal(R.startRaid(party, { id: '1', settings: { minParty: 1 }, seed: 5, now: 1000 }).ok, true);
        party = R.joinRaidParty(party, { member: m('2'), max: 13, now: 1000 }).party;
        assert.equal(R.startRaid(allReady(party), { id: '1', settings: { minParty: 3 }, seed: 5, now: 1000 }).error, 'need_party');
        assert.equal(R.raidMaxParty({ minParty: 5, maxParty: 3 }, 13), 5);
    });
});

describe('기술과 보스 공격 방식', () => {
    const pet = (species, level) => ({ phase: 'pet', species, stage: 1, level, exp: 0, enhance: 0, full: 90, fedAt: 1000 });
    const m = (id, level) => R.raidMemberFromPet(pet('emberkit', level), { id, name: `학생${id}`, now: 1000, today: '2026-11-16' });
    it('배운 기술만 무작위로 써요(Lv.1 한 가지, Lv.10 두 가지, Lv.20 세 가지)', () => {
        const used = (level) => {
            const set = new Set();
            for (let seed = 1; seed <= 40; seed += 1) R.simulateRaid([m('1', level), m('2', level)], { type: 'grass', hp: 999999, atk: 1, aoe: 0 }, seed).rounds.forEach((rd) => rd.hits.forEach((h) => set.add(h.skill)));
            return [...set].sort();
        };
        assert.deepEqual(used(1), [0]);
        assert.deepEqual(used(10), [0, 1]);
        assert.deepEqual(used(25), [0, 1, 2]);
    });
    it('보스는 단일 공격과 전체 공격을 섞어 써요', () => {
        const team = [m('1', 20), m('2', 20), m('3', 20), m('4', 20)];
        const moves = { single: 0, all: 0 };
        for (let seed = 1; seed <= 30; seed += 1) {
            R.simulateRaid(team, { type: 'rock', hp: 999999, atk: 10, aoe: 50 }, seed).rounds.forEach((rd) => {
                moves[rd.bossMove] += 1;
                const alive = rd.boss.length;
                if (rd.bossMove === 'single') assert.equal(alive, 1);
                else assert.ok(alive >= 2);
            });
        }
        assert.ok(moves.single > 50 && moves.all > 50, JSON.stringify(moves));
        // 확률 0이면 단일 공격만, 100이면 전체 공격만
        assert.ok(R.simulateRaid(team, { type: 'rock', hp: 999999, atk: 10, aoe: 0 }, 3).rounds.every((rd) => rd.bossMove === 'single'));
        assert.ok(R.simulateRaid(team, { type: 'rock', hp: 999999, atk: 10, aoe: 100 }, 3).rounds.every((rd) => rd.bossMove === 'all'));
        assert.equal(R.sanitizeRaidSettings(null).stages[9].aoe, 50);
    });
});

/** 팀원 모두 '준비'를 누른 방 */
function allReady(party) {
    let x = party;
    party.members.forEach((m) => { x = R.readyRaidParty(x, { id: m.id, ready: true, now: 1000 }).party; });
    return x;
}

describe('준비 버튼', () => {
    const pet = (species) => ({ phase: 'pet', species, stage: 1, level: 5, exp: 0, enhance: 0, full: 90, fedAt: 1000 });
    const m = (id, species = 'emberkit') => R.raidMemberFromPet(pet(species), { id, name: `학생${id}`, now: 1000, today: '2026-11-16' });
    it('모두 준비해야 출발하고, 펫을 바꾸거나 스테이지가 바뀌면 다시 준비해요', () => {
        let party = R.createRaidParty({ member: m('1'), stage: 1, unlocked: 3, now: 1000 }).party;
        party = R.joinRaidParty(party, { member: m('2'), max: 13, now: 1000 }).party;
        let r = R.readyRaidParty(party, { id: '1', now: 1000 });
        assert.deepEqual([r.ok, r.allReady], [true, false]);
        r = R.readyRaidParty(r.party, { id: '2', now: 1000 });
        assert.equal(r.allReady, true);
        assert.equal(R.readyRaidParty(r.party, { id: '9', now: 1000 }).error, 'not_member');
        assert.equal(R.readyRaidParty(r.party, { id: '2', ready: false, now: 1000 }).allReady, false);
        // 펫을 바꾸면(다시 들어오면) 그 사람만 준비가 풀리고 자리는 그대로예요
        const swapped = R.joinRaidParty(r.party, { member: m('1', 'dropotter'), max: 13, now: 1000 }).party;
        assert.deepEqual(swapped.members.map((x) => [x.id, x.species, !!x.ready]), [['1', 'dropotter', false], ['2', 'emberkit', true]]);
        // 스테이지를 바꾸면 모두 다시 준비, 같은 스테이지면 그대로
        assert.equal(R.setRaidStage(r.party, { id: '1', stage: 2, unlocked: 3, now: 1000 }).party.members.some((x) => x.ready), false);
        assert.equal(R.setRaidStage(r.party, { id: '1', stage: 1, unlocked: 3, now: 1000 }).party.members.every((x) => x.ready), true);
        // 전투 뒤 다시 모으면 준비도 처음부터
        const fought = R.startRaid(r.party, { id: '2', seed: 3, now: 2000 }).party;
        assert.equal(R.reopenRaidParty(fought, { id: '1', now: 3000 }).party.members.some((x) => x.ready), false);
    });
});

describe('막기 기술과 격투 펫', () => {
    const mk = (sp, lv, id) => R.raidMemberFromPet({ phase: 'pet', species: sp, stage: 2, level: lv, exp: 0, enhance: 2, full: 90, fedAt: Date.now() }, { id, name: id, now: Date.now(), today: '2026-11-16' });
    it('규칙 2에서는 공격받을 때 막기 기술이 발동하고, 예전 전투는 예전대로 다시 돌아가요', () => {
        const ms = [mk('punchroo', 24, 'a'), mk('dropotter', 15, 'b'), mk('stardrake', 20, 'c')];
        const boss = R.sanitizeRaidSettings(null).stages[4];
        const g = R.simulateRaid(ms, boss, 7, { teamBonus: 6, guard: true });
        const hits = g.rounds.flatMap((r) => r.boss);
        assert.ok(hits.some((h) => h.guard && h.blocked > 0));
        hits.filter((h) => h.guard).forEach((h) => assert.equal(h.raw - h.blocked, h.dmg));
        assert.ok(Object.values(g.blocked).reduce((t, x) => t + x, 0) > 0);
        const old = R.replayRaidRun({ members: ms, boss, seed: 7, teamBonus: 6 });
        assert.ok(old.rounds.flatMap((r) => r.boss).every((h) => !h.guard));
        assert.equal(R.replayRaidRun({ members: ms, boss, seed: 7, teamBonus: 6, rules: 2 }).win, g.win);
    });
    it('격투는 상성이 없어요', () => {
        ['fire', 'water', 'grass', 'electric', 'ice', 'rock', 'star'].forEach((t) => {
            assert.equal(R.raidTypeMult('fight', t), 1);
            assert.equal(R.raidTypeMult(t, 'fight'), 1);
        });
    });
});

describe('펫 더 데려가기 · 방 정리 · OX 퀴즈', () => {
    const cfg = { minParty: 2 };
    const room = () => {
        let p = R.createRaidParty({ member: member(0), stage: 1, now: T0 }).party;
        p = R.joinRaidParty(p, { member: member(1), now: T0 + 1000 }).party;
        return p;
    };
    const readyAll = (p, now = T0 + 5000) => R.raidOwners(p.members).reduce((acc, id) => R.readyRaidParty(acc, { id, now }).party, p);

    it('내 펫을 2마리까지 더 데려가요(같은 종은 한 번만). 준비는 주인만 하면 돼요', () => {
        let p = room();
        const r = R.joinRaidParty(p, { member: member(1), extras: [member(5, 200, 'zapowl'), member(6, 200, 'zapowl'), member(7, 200, 'snowbun'), member(8, 200, 'pebbletle')], maxExtra: 2, now: T0 + 2000 });
        assert.equal(r.ok, true);
        p = r.party;
        assert.deepEqual(p.members.map((m) => m.id), ['1', '2', '2~1', '2~2']);
        assert.deepEqual(p.members.slice(2).map((m) => [m.owner, m.species, m.name]), [['2', 'zapowl', '학생2'], ['2', 'snowbun', '학생2']]);
        assert.deepEqual(R.raidOwners(p.members), ['1', '2']);
        // 설정에서 끄면 못 데려가요
        assert.equal(R.joinRaidParty(room(), { member: member(1), extras: [member(5, 200, 'zapowl')], maxExtra: 0, now: T0 }).party.members.length, 2);
        p = readyAll(p);
        assert.equal(R.isRaidAllReady(p), true);
        // 펫을 바꾸면 내 준비가 풀리고, 더 데려온 펫을 빼면 사라져요
        p = R.joinRaidParty(p, { member: member(1), extras: [], maxExtra: 2, now: T0 + 6000 }).party;
        assert.deepEqual(p.members.map((m) => m.id), ['1', '2']);
        assert.deepEqual(R.raidUnready(p), ['2']);
        // 나가면 내 펫이 모두 나가요
        p = R.joinRaidParty(p, { member: member(1), extras: [member(5, 200, 'zapowl')], maxExtra: 2, now: T0 + 7000 }).party;
        assert.deepEqual(R.leaveRaidParty(p, { id: '2', now: T0 + 8000 }).party.members.map((m) => m.id), ['1']);
    });

    it('펫이 13마리로 꽉 차도 새 친구는 들어와요(더 데려온 펫이 비켜 줘요)', () => {
        let p = R.createRaidParty({ member: member(0), stage: 1, now: T0 }).party;
        p = R.joinRaidParty(p, { member: member(0), extras: [member(20, 100, 'zapowl'), member(21, 100, 'snowbun')], maxExtra: 2, now: T0 }).party;
        for (let i = 1; i <= 10; i += 1) p = R.joinRaidParty(p, { member: member(i), now: T0 }).party;
        assert.equal(p.members.length, 13);
        const r = R.joinRaidParty(p, { member: member(11), now: T0 });
        assert.equal(r.ok, true);
        assert.equal(r.party.members.length, 13);
        assert.equal(r.party.members.filter((m) => m.owner).length, 1);
        assert.equal(R.joinRaidParty(r.party, { member: member(1), extras: [member(22, 100, 'zapowl'), member(23, 100, 'snowbun')], maxExtra: 2, now: T0 }).error, 'full_pets');
    });

    it('더 데려간 펫 값은 출발한 전투에서 한 마리에 2봉씩이에요', () => {
        let p = R.joinRaidParty(room(), { member: member(1), extras: [member(5, 200, 'zapowl'), member(7, 200, 'snowbun')], maxExtra: 2, now: T0 }).party;
        p = readyAll(p);
        const st = R.startRaid(p, { id: '1', settings: { ...cfg, quizEvery: 0 }, seed: 5, now: T0 + 9000 });
        assert.equal(st.ok, true);
        assert.equal(st.party.run.extraFee, 2);
        assert.equal(st.party.run.pending, false);
        assert.equal(R.claimRaidReward(null, st.party.run, { id: '2', today: DAY }).fee, 4);
        assert.equal(R.claimRaidReward(null, st.party.run, { id: '1', today: DAY }).fee, 0);
    });

    it('혼자 있는 방은 soloAt 이 적히고, 친구가 오면 지워져요', () => {
        let p = R.createRaidParty({ member: member(0), stage: 1, now: T0 }).party;
        assert.equal(p.soloAt, T0);
        p = R.setRaidStage(p, { id: '1', stage: 1, now: T0 + 30000 }).party;
        assert.equal(p.soloAt, T0, '계속 혼자면 처음 때를 지켜요');
        p = R.joinRaidParty(p, { member: member(1), now: T0 + 40000 }).party;
        assert.equal(p.soloAt, 0);
        p = R.leaveRaidParty(p, { id: '2', now: T0 + 50000 }).party;
        assert.equal(p.soloAt, T0 + 50000);
    });

    it('한 명만 준비하지 않으면 waitId 가 적히고, 그 사람을 내보낼 수 있어요', () => {
        let p = R.joinRaidParty(room(), { member: member(2), now: T0 }).party;
        p = R.readyRaidParty(p, { id: '1', now: T0 + 1000 }).party;
        assert.equal(p.waitId, '');
        p = R.readyRaidParty(p, { id: '3', now: T0 + 2000 }).party;
        assert.deepEqual([p.waitId, p.waitAt], ['2', T0 + 2000]);
        // 펫을 바꿔도 기다린 시간은 그대로예요
        p = R.joinRaidParty(p, { member: member(1, 500), now: T0 + 5000 }).party;
        assert.deepEqual([p.waitId, p.waitAt], ['2', T0 + 2000]);
        assert.equal(R.kickRaidIdle(p, { id: '2', waitId: '2', waitAt: p.waitAt }).ok, false);
        assert.equal(R.kickRaidIdle(p, { id: '1', waitId: '2', waitAt: p.waitAt + 1 }).error, 'changed');
        const k = R.kickRaidIdle(p, { id: '1', waitId: '2', waitAt: p.waitAt, now: T0 + 13000 });
        assert.equal(k.ok, true);
        assert.deepEqual(k.party.members.map((m) => m.id), ['1', '3']);
        assert.equal(k.allReady, true);
        assert.equal(R.startRaid(k.party, { id: '1', settings: cfg, seed: 3, now: T0 + 13000 }).ok, true);
        // 방장이 준비하지 않으면 다음 사람이 방장이 돼요
        let q = R.joinRaidParty(room(), { member: member(2), now: T0 }).party;
        q = R.readyRaidParty(R.readyRaidParty(q, { id: '2', now: T0 }).party, { id: '3', now: T0 + 1 }).party;
        const k2 = R.kickRaidIdle(q, { id: '3', waitId: '1', waitAt: q.waitAt, now: T0 + 12000 });
        assert.deepEqual([k2.party.leaderId, k2.party.id, k2.party.members.length], ['2', '1', 2]);
    });

    it('5턴마다 퀴즈: 맞히면 합동 필살기, 틀리면 보스 필살기. 앞부분 전투는 그대로예요', () => {
        const boss = { type: 'grass', hp: 5000000, atk: 30, aoe: 30 };
        const base = (results) => R.simulateRaid(team(4, 400), boss, 77, { guard: true, quiz: { every: 5, results, teamUlt: 300, bossUlt: 120 } });
        const a = base([]);
        assert.equal(a.pending, true);
        assert.equal(a.win, false);
        assert.equal(a.rounds.length, 5);
        const good = base([true]);
        const badly = base([false]);
        assert.deepEqual(good.rounds.slice(0, 5), a.rounds);
        assert.deepEqual(badly.rounds.slice(0, 5), a.rounds);
        assert.equal(good.rounds[5].quiz, 0);
        assert.equal(good.rounds[5].ok, true);
        assert.equal(good.rounds[5].hits.length, 4);
        assert.ok(good.rounds[5].hits.every((h) => h.ult && h.dmg > 0));
        assert.equal(badly.rounds[5].bossMove, 'ult');
        assert.equal(badly.rounds[5].boss.length, 4);
        assert.ok(good.rounds[5].bossHp < a.bossHp);
        assert.equal(good.pending, true, '10턴에 또 내요');
        const end = base([true, false, true]);
        assert.equal(end.pending, false);
        assert.equal(end.turns, R.RAID_MAX_ROUNDS);
        assert.equal(end.rounds.filter((r) => r.quiz !== undefined).length, 3);
        // 퀴즈가 없던 예전 전투는 그대로
        assert.deepEqual(R.simulateRaid(team(4, 400), boss, 77, { guard: true }).rounds.slice(0, 5), a.rounds);
    });

    it('퀴즈: 참가자의 반 이상이 맞히면 성공이고, 모두 답하면 바로 다음으로 가요', () => {
        const hard = { ...cfg, stages: [{ hp: 5000000, atk: 1 }] };
        let p = R.joinRaidParty(room(), { member: member(2), now: T0 }).party;
        p = R.joinRaidParty(p, { member: member(2), extras: [member(9, 100, 'zapowl')], maxExtra: 2, now: T0 }).party;
        p = readyAll(p);
        const st = R.startRaid(p, { id: '1', settings: hard, seed: 9, now: T0 + 9000, question: { q: '1+1=2', a: 'O' } });
        p = st.party;
        assert.equal(p.run.pending, true);
        assert.deepEqual([p.run.quiz.n, p.run.quiz.q, p.run.quiz.a], [0, '1+1=2', 'O']);
        assert.equal(R.claimRaidReward(null, p.run, { id: '1', today: DAY }).error, 'pending');
        assert.equal(R.reopenRaidParty(p, { id: '1', now: T0 + 20000 }).error, 'fighting');
        let r = R.answerRaidQuiz(p, { id: '1', runId: p.run.id, n: 0, answer: 'O' });
        assert.deepEqual([r.ok, r.settled], [true, false]);
        assert.equal(R.answerRaidQuiz(r.party, { id: '1', runId: p.run.id, n: 0, answer: 'X' }).error, 'answered');
        assert.equal(R.answerRaidQuiz(r.party, { id: '9', runId: p.run.id, n: 0, answer: 'X' }).error, 'not_member');
        r = R.answerRaidQuiz(r.party, { id: '2', runId: p.run.id, n: 0, answer: 'X' });
        r = R.answerRaidQuiz(r.party, { id: '3', runId: p.run.id, n: 0, answer: 'O', next: { q: '고래는 물고기', a: 'X' } });
        assert.deepEqual([r.settled, r.quizOk], [true, true]); // 3명 중 2명
        assert.deepEqual(r.party.run.results, [true]);
        assert.deepEqual(r.party.run.log, [{ r: 2, t: 3, a: 'O' }]);
        assert.deepEqual([r.party.run.quiz.n, r.party.run.quiz.q, r.party.run.quiz.a], [1, '고래는 물고기', 'X']);
        assert.equal(R.answerRaidQuiz(r.party, { id: '1', runId: p.run.id, n: 0, answer: 'O' }).error, 'quiz_closed');
        // 시간이 다 되면 답하지 않은 사람은 틀린 것으로: 3명 중 1명 → 보스 필살기
        r = R.answerRaidQuiz(r.party, { id: '1', runId: p.run.id, n: 1, answer: 'X' });
        r = R.closeRaidQuiz(r.party, { id: '2', runId: p.run.id, n: 1 });
        assert.deepEqual([r.settled, r.quizOk], [true, false]);
        assert.equal(r.party.run.quiz.q.length > 0, true, '문제를 못 받으면 준비된 문제를 써요');
        r = R.closeRaidQuiz(r.party, { id: '2', runId: p.run.id, n: 2 });
        assert.equal(r.party.run.pending, false);
        assert.equal(r.party.run.quiz, null);
        assert.equal(R.claimRaidReward(null, r.party.run, { id: '1', today: DAY }).ok, true);
        // 방에 적힌 것만으로 모든 기기가 같은 전투를 봐요
        assert.deepEqual(R.replayRaidRun(R.sanitizeRaidParty(JSON.parse(JSON.stringify(r.party))).run), r.sim);
        // 반반이면 성공(반 이상)
        let two = readyAll(room());
        two = R.startRaid(two, { id: '1', settings: hard, seed: 4, now: T0 }).party;
        two = R.answerRaidQuiz(two, { id: '1', runId: two.run.id, n: 0, answer: two.run.quiz.a }).party;
        assert.equal(R.closeRaidQuiz(two, { id: '1', runId: two.run.id, n: 0 }).quizOk, true);
    });

    it('예전 규칙(2)으로 적힌 전투는 퀴즈 없이 그대로 다시 돌려요', () => {
        const old = { id: 'x', seed: 11, rules: 2, stage: 1, boss: R.RAID_DEFAULT_STAGES[0], teamBonus: 6, win: true, startedAt: T0, members: team(3, 300) };
        const run = R.sanitizeRaidParty({ leaderId: '1', run: old }).run;
        assert.deepEqual(R.replayRaidRun(run).rounds, R.simulateRaid(team(3, 300), R.RAID_DEFAULT_STAGES[0], 11, { guard: true }).rounds);
        assert.equal(R.claimRaidReward(null, run, { id: '1', today: DAY }).fee, 0);
    });
});

describe('색다른 보스 12~22 · 보상 시즌 · 회복 기술', () => {
    const SP8 = ['emberkit', 'dropotter', 'sproutdeer', 'zapowl', 'snowbun', 'pebbletle', 'stardrake', 'punchroo'];
    const squad = (n, level, power) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `학생${i + 1}`, species: SP8[i % 8], stage: 3, level, enhance: 10, power }));
    const QUIZ = (results) => ({ every: 5, results, teamUlt: 300, bossUlt: 120 });
    const rate = (team, stage, results) => {
        let w = 0;
        for (let s = 1; s <= 60; s += 1) w += R.simulateRaid(team, R.RAID_DEFAULT_STAGES[stage - 1], s, { guard: true, heal: true, quiz: QUIZ(results) }).win ? 1 : 0;
        return w / 60;
    };

    it('색다른 보스(12~22)는 모두 11스테이지보다 세고, 뒤로 갈수록 체력이 커요', () => {
        const s = R.sanitizeRaidSettings(null).stages;
        for (let i = 11; i < 22; i += 1) {
            assert.ok(s[i].hp > 200000, `${i + 1} 체력`);
            assert.ok(s[i].atk > 650, `${i + 1} 공격력`);
            if (i > 11) assert.ok(s[i].hp > s[i - 1].hp, `${i + 1} 체력 증가`);
        }
    });

    it('보상 시즌: 시즌이 바뀌면 첫 클리어 보상을 다시 받아요(깬 기록은 그대로)', () => {
        const run = (id) => ({ id, stage: 1, win: true, boss: { first: 3, repeat: 1 }, members: [member(0), member(1)] });
        const r = R.claimRaidReward({ firsts: [1, 2, 3], paid: [] }, run('a1'), { id: '1', today: DAY });
        assert.equal(r.first, true);
        assert.equal(r.bong, 3);
        assert.equal(r.progress.season, 1);
        assert.ok(r.progress.paid.includes(1));
        assert.deepEqual(r.progress.firsts, [1, 2, 3]);
        const again = R.claimRaidReward(r.progress, run('a2'), { id: '1', today: DAY });
        assert.equal(again.first, false);
        assert.equal(again.bong, 1);
        const s2 = R.claimRaidReward(again.progress, run('a3'), { id: '1', today: DAY, settings: { rewardSeason: 2 } });
        assert.equal(s2.first, true);
        assert.equal(s2.bong, 3);
        assert.equal(s2.progress.season, 2);
        assert.deepEqual(s2.progress.paid, [1]);
        assert.deepEqual(R.raidPaidFirsts(again.progress, null), [1]);
        assert.deepEqual(R.raidPaidFirsts(again.progress, { rewardSeason: 2 }), []);
        assert.equal(R.sanitizeRaidSettings(null).rewardSeason, 1);
    });

    it('Lv.39 팀은 회복을 켜도 전투가 똑같아요(주사위를 더 굴리지 않아요)', () => {
        const boss = { type: 'star', hp: 480000, atk: 900, aoe: 55 };
        for (let seed = 1; seed <= 10; seed += 1) {
            const on = R.simulateRaid(squad(8, 39, 1135), boss, seed, { guard: true, heal: true });
            const off = R.simulateRaid(squad(8, 39, 1135), boss, seed, { guard: true, heal: false });
            assert.deepEqual(on.rounds, off.rounds);
        }
    });

    it('Lv.40 팀은 보스 공격 뒤 회복 기술을 쓰고, 체력은 최대를 넘지 않아요', () => {
        const boss = { type: 'star', hp: 480000, atk: 900, aoe: 55 };
        const team8 = squad(8, 40, 1150);
        const max = R.raidPetStats(1150).hp;
        let count = 0;
        for (let seed = 1; seed <= 30; seed += 1) {
            const sim = R.simulateRaid(team8, boss, seed, { guard: true, heal: true });
            const left = {};
            team8.forEach((m) => { left[m.id] = max; });
            sim.rounds.forEach((rd) => {
                rd.boss.forEach((h) => { left[h.target] = h.faint ? 0 : Math.max(0, left[h.target] - h.dmg); });
                (rd.heals || []).forEach((h) => {
                    count += 1;
                    assert.ok(h.amount > 0);
                    assert.ok(left[h.target] > 0, '쓰러진 펫은 회복하지 않아요');
                    left[h.target] += h.amount;
                    assert.ok(left[h.target] <= max, '최대 체력을 넘지 않아요');
                });
            });
            const sum = Object.values(sim.healed).reduce((a, b) => a + b, 0);
            assert.equal(sum, sim.rounds.reduce((t, rd) => t + (rd.heals || []).reduce((x, h) => x + h.amount, 0), 0));
        }
        assert.ok(count >= 1);
    });

    it('예전 규칙(3)으로 적힌 전투는 Lv.40 팀이어도 회복이 없어요', () => {
        const boss = { ...R.RAID_DEFAULT_STAGES[21] };
        const base = { id: 'h', seed: 3, stage: 22, boss, teamBonus: 6, win: false, startedAt: T0, members: squad(8, 40, 1150), quizEvery: 0 };
        let healsNew = 0;
        for (let seed = 1; seed <= 10; seed += 1) {
            assert.ok(R.replayRaidRun({ ...base, seed, rules: 3 }).rounds.every((rd) => !rd.heals));
            healsNew += R.replayRaidRun({ ...base, seed, rules: 4 }).rounds.filter((rd) => rd.heals).length;
        }
        assert.ok(healsNew >= 1);
        assert.equal(R.RAID_RULES, 6);
    });

    it('균형: 12스테이지는 Lv.40 13마리면 거의 이기고, 22스테이지는 퀴즈를 맞혀야 해요', () => {
        const T = [true, true, true];
        const F = [false, false, false];
        const lv40 = squad(13, 40, 1150);
        const lv30 = squad(13, 30, 1000);
        const r12 = rate(lv40, 12, T);
        const r22ok = rate(lv40, 22, T);
        const r22no = rate(lv40, 22, F);
        const r22lv30 = rate(lv30, 22, T);
        assert.ok(r12 >= 0.9, `12스테이지 ${r12}`);
        assert.ok(r22ok >= 0.5 && r22ok <= 1, `22스테이지 퀴즈 성공 ${r22ok}`);
        assert.ok(r22no <= 0.1, `22스테이지 퀴즈 실패 ${r22no}`);
        assert.ok(r22lv30 <= 0.1, `22스테이지 Lv.30 ${r22lv30}`);
    });
});

describe('강화석과 탐험', () => {
    it('대표 펫의 전투력이 강화석만큼 커지고, 팀원 전투력은 1300까지 받아요', () => {
        const base = { phase: 'pet', species: 'emberkit', stage: 3, level: 40, enhance: 10, full: 90, fedAt: T0 };
        const a = R.raidMemberFromPet(base, { id: '1', name: 'a', now: T0, today: DAY });
        const b = R.raidMemberFromPet({ ...base, boost: 150 }, { id: '1', name: 'a', now: T0, today: DAY });
        assert.equal(b.power - a.power, 150);
        const party = R.sanitizeRaidParty({ leaderId: '1', members: [{ ...b, power: 1300 }, { ...b, id: '2', power: 5000 }] });
        assert.deepEqual(party.members.map((m) => m.power), [1300, 1300]);
    });
});

describe('전투 최대 턴 수(규칙 판 5부터 20턴)', () => {
    const tank = team(2, 100);
    const wall = { type: 'rock', hp: 99999999, atk: 0, aoe: 0 };
    it('새 전투는 20턴까지 싸워요', () => {
        assert.equal(R.RAID_MAX_ROUNDS, 20);
        assert.equal(R.RAID_RULES, 6);
        const sim = R.replayRaidRun({ members: tank, boss: wall, seed: 3, rules: R.RAID_RULES, teamBonus: 0 });
        assert.equal(sim.rounds.length, 20);
        assert.equal(sim.win, false);
    });
    it('예전 규칙(4 이하) 전투 기록은 그대로 18턴으로 다시 보여요', () => {
        [0, 2, 3, 4].forEach((rules) => {
            const sim = R.replayRaidRun({ members: tank, boss: wall, seed: 3, rules, teamBonus: 0 });
            assert.equal(sim.rounds.length, 18);
        });
        const a = R.replayRaidRun({ members: tank, boss: wall, seed: 9, rules: 4, teamBonus: 0 });
        const b = R.replayRaidRun({ members: tank, boss: wall, seed: 9, rules: 5, teamBonus: 0 });
        assert.deepEqual(b.rounds.slice(0, 18).map((r) => r.bossHp), a.rounds.map((r) => r.bossHp));
    });
});

describe('같은 보스 이기기 횟수 제한', async () => {
    const R = await import('./petRaid.js');
    const cfg = R.sanitizeRaidSettings({ maxClears: 3 });
    const mem = (id) => ({ id, name: id, petName: 'p', species: 'emberkit', stage: 1, level: 5, enhance: 0, type: 'fire', power: 200 });
    const winRun = (id, n) => ({ id: `r${n}`, stage: 2, win: true, pending: false, members: [mem(id)], boss: cfg.stages[1], extraFee: 0 });
    it('기본값은 3번, 0이면 제한 없음', () => {
        assert.equal(R.sanitizeRaidSettings(null).maxClears, 3);
        assert.equal(R.raidMaxedStages({ season: 1, wins: { 2: 9 } }, { maxClears: 0 }).length, 0);
    });
    it('3번 이기면 그 보스는 방·참가·준비·스테이지 바꾸기가 막히고, 4번째 승리는 보상이 없어요', () => {
        let prog = {};
        for (let i = 1; i <= 3; i += 1) {
            const r = R.claimRaidReward(prog, winRun('a', i), { id: 'a', today: 'd', settings: cfg });
            assert.equal(r.ok, true);
            assert.ok(r.bong > 0);
            prog = r.progress;
            assert.equal(R.raidClearCount(prog, cfg, 2), i);
        }
        const maxed = R.raidMaxedStages(prog, cfg);
        assert.deepEqual(maxed, [2]);
        assert.equal(R.createRaidParty({ member: mem('a'), stage: 2, unlocked: 3, maxed }).error, 'max_clears');
        assert.equal(R.createRaidParty({ member: mem('a'), stage: 1, unlocked: 3, maxed }).ok, true);
        const party = R.createRaidParty({ member: mem('b'), stage: 2, unlocked: 3 }).party;
        assert.equal(R.joinRaidParty(party, { member: mem('a'), maxed }).error, 'max_clears');
        const p1 = R.createRaidParty({ member: mem('b'), stage: 1, unlocked: 3 }).party;
        const joined = R.joinRaidParty(p1, { member: mem('a'), maxed }).party;
        const moved = R.setRaidStage(joined, { id: 'b', stage: 2, unlocked: 3 }).party;
        assert.equal(R.readyRaidParty(moved, { id: 'a', maxed }).error, 'max_clears');
        assert.equal(R.readyRaidParty(moved, { id: 'a', ready: false, maxed }).ok, true);
        assert.equal(R.setRaidStage(p1, { id: 'b', stage: 2, unlocked: 3, maxed: [2] }).error, 'max_clears');
        const r4 = R.claimRaidReward(prog, winRun('a', 4), { id: 'a', today: 'd', settings: cfg });
        assert.equal(r4.maxed, true);
        assert.equal(r4.bong, 0);
        assert.equal(r4.exp, 0);
    });
    it('예전에 첫 보상을 받은 스테이지는 1번 이긴 것으로 세고, 보상 시즌이 바뀌면 0부터 다시 세요', () => {
        const old = { season: 1, paid: [2], firsts: [1, 2] };
        assert.equal(R.raidClearCount(old, cfg, 2), 1);
        const r = R.claimRaidReward(old, winRun('a', 1), { id: 'a', today: 'd', settings: cfg });
        assert.equal(R.raidClearCount(r.progress, cfg, 2), 2);
        assert.equal(R.raidClearCount(r.progress, { ...cfg, rewardSeason: 2 }, 2), 0);
    });
});

describe('이긴 횟수는 매주 월요일에 새로 세요(2026-11-30부터)', async () => {
    const R = await import('./petRaid.js');
    const cfg = R.sanitizeRaidSettings({ maxClears: 3 });
    const mem = { id: 'a', name: 'a', petName: 'p', species: 'emberkit', stage: 1, level: 5, enhance: 0, type: 'fire', power: 200 };
    const run = (n) => ({ id: `w${n}`, stage: 2, win: true, pending: false, members: [mem], boss: cfg.stages[1], extraFee: 0 });
    it('주 이름: 11-30 전은 한 묶음, 그 뒤는 그 주 월요일', () => {
        assert.equal(R.raidWeekKey('2026-11-25'), 'pre');
        assert.equal(R.raidWeekKey('2026-11-29'), 'pre');
        assert.equal(R.raidWeekKey('2026-11-30'), '2026-11-30');
        assert.equal(R.raidWeekKey('2026-12-06'), '2026-11-30');
        assert.equal(R.raidWeekKey('2026-12-07'), '2026-12-07');
        assert.equal(R.raidWeekKey(''), 'pre');
    });
    it('이번 주 3번을 다 써도 다음 주 월요일에는 다시 보상을 받아요', () => {
        let prog = { season: 1, paid: [2], firsts: [1, 2], wins: { 2: 3 } };
        assert.deepEqual(R.raidMaxedStages(prog, cfg, '2026-11-27'), [2]);
        assert.equal(R.claimRaidReward(prog, run(1), { id: 'a', today: '2026-11-27', settings: cfg }).maxed, true);
        assert.deepEqual(R.raidMaxedStages(prog, cfg, '2026-11-30'), []);
        const r = R.claimRaidReward(prog, run(2), { id: 'a', today: '2026-11-30', settings: { ...cfg, dailyRewards: 9 } });
        assert.ok(r.bong > 0);
        assert.equal(r.progress.winsWeek, '2026-11-30');
        assert.equal(R.raidClearCount(r.progress, cfg, 2, '2026-12-01'), 1);
        assert.equal(R.raidClearCount(r.progress, cfg, 2, '2026-12-07'), 0);
    });
});
