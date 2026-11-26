// 역할 펫 3종(힐러 하뜨·탱커 철뭉·서포트 방울)과 전투 규칙 6 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as P from './petGame.js';
import * as R from './petRaid.js';

const T0 = new Date(2026, 10, 26, 9).getTime();
const OLD8 = ['emberkit', 'dropotter', 'sproutdeer', 'zapowl', 'snowbun', 'pebbletle', 'stardrake', 'punchroo'];
const NEW3 = ['heartail', 'ironpaw', 'bellpup'];
const mem = (id, species, power = 600, level = 40) => ({ id: String(id), name: `학생${id}`, species, stage: 3, level, enhance: 0, power });
const wall = (atk = 120, aoe = 30) => ({ type: 'fight', hp: 99999999, atk, aoe });
const raw = (species, extra = {}) => ({ v: 1, phase: 'pet', species, shiny: false, name: 'x', stage: 1, level: 1, exp: 0, enhance: 0, full: 60, fedAt: T0, bornAt: T0, ...extra });

describe('역할 펫 3종 · 기본 정보', () => {
    it('세 종이 들어가고, 원래 8종의 값은 그대로예요', () => {
        assert.deepEqual(Object.keys(P.PET_SPECIES), [...OLD8, ...NEW3]); // 원래 종이 앞, 새 종이 뒤
        assert.deepEqual(NEW3.map((id) => [P.PET_SPECIES[id].type, P.PET_SPECIES[id].weight, P.petRole(id)]),
            [['heal', 12, 'healer'], ['steel', 12, 'tank'], ['wind', 12, 'support']]);
        OLD8.forEach((id) => assert.equal(P.petRole(id), '', id));
        assert.deepEqual(OLD8.map((id) => P.PET_SPECIES[id].weight), [16, 16, 16, 16, 16, 16, 4, 16]);
        assert.deepEqual(P.PET_SPECIES.heartail.names, ['하뜨', '하트솜', '치유솜']);
        assert.ok(P.PET_TYPES.heal && P.PET_TYPES.steel && P.PET_TYPES.wind);
    });
    it('알에서도 나오고 상점 값은 일반 50봉 · 색다른 70봉이에요', () => {
        const got = new Set();
        let x = 7;
        const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; };
        for (let i = 0; i < 3000; i += 1) got.add(P.rollPetSpecies(rnd));
        NEW3.forEach((id) => assert.ok(got.has(id), id));
        NEW3.forEach((id) => { assert.equal(P.petShopPrice(id, false), 50); assert.equal(P.petShopPrice(id, true), 70); });
        const bought = P.buyShopPet(P.sanitizePetBox({ v: 2, slots: 2, main: 0, list: [], dex: {} }), 0, { species: 'ironpaw', bong: 100, now: T0 });
        assert.ok(!bought.error, bought.error);
        assert.equal(bought.box.list[0].species, 'ironpaw');
    });
    it('전투력 공식은 바뀌지 않아요(종과 무관)', () => {
        const a = P.petPower(P.sanitizePet(raw('emberkit', { stage: 3, level: 30, enhance: 4 })));
        NEW3.forEach((id) => assert.equal(P.petPower(P.sanitizePet(raw(id, { stage: 3, level: 30, enhance: 4 }))), a, id));
    });
    it('기술 이름·막기·회복 기술이 있고, 역할 기술은 정한 레벨에 배워요', () => {
        NEW3.forEach((id) => {
            assert.equal(P.PET_SKILL_NAMES[id].length, 3);
            assert.ok(P.PET_GUARD_SKILLS[id] && P.PET_HEAL_SKILLS[id], id);
        });
        assert.deepEqual(P.petRoleSkills('heartail', 9).map((s) => s.learned), [false]);
        assert.deepEqual(P.petRoleSkills('heartail', 10).map((s) => s.learned), [true]);
        assert.deepEqual(P.petRoleSkills('ironpaw', 4).map((s) => s.learned), [false]);
        assert.deepEqual(P.petRoleSkills('ironpaw', 5).map((s) => s.learned), [true]);
        assert.deepEqual(P.petRoleSkills('bellpup', 10).map((s) => s.learned), [true, false]);
        assert.deepEqual(P.petRoleSkills('bellpup', 20).map((s) => s.learned), [true, true]);
        assert.deepEqual(P.petRoleSkills('emberkit', 40), []);
        P.petRoleSkills('bellpup', 20).forEach((s) => assert.ok(P.petRoleSkillText(s).length > 5));
    });
});

describe('역할 펫 · 탐험 능력치와 상성', () => {
    it('역할 비율은 역할 펫에만 붙어요', () => {
        assert.deepEqual(R.raidRoleStats('emberkit', 600), R.raidPetStats(600));
        assert.deepEqual(R.raidRoleStats('heartail', 600), { hp: 1540, atk: 224 }); // 1400×110%, 320×70%
        assert.deepEqual(R.raidRoleStats('ironpaw', 600), { hp: 1960, atk: 240 });
        assert.deepEqual(R.raidRoleStats('bellpup', 600), { hp: 1260, atk: 256 });
    });
    it('새 속성 상성: 회복→바위·별, 강철→얼음·바위, 바람→풀·물. 격투는 여전히 상성이 없어요', () => {
        assert.ok(R.raidTypeMult('heal', 'rock') > 1 && R.raidTypeMult('heal', 'star') > 1);
        assert.ok(R.raidTypeMult('steel', 'ice') > 1 && R.raidTypeMult('steel', 'rock') > 1);
        assert.ok(R.raidTypeMult('wind', 'grass') > 1 && R.raidTypeMult('wind', 'water') > 1);
        assert.ok(R.raidTypeMult('fire', 'steel') > 1 && R.raidTypeMult('electric', 'wind') > 1);
        ['heal', 'steel', 'wind', ...Object.keys(P.PET_TYPES)].forEach((t) => {
            if (t !== 'fight') { assert.equal(R.raidTypeMult(t, 'fight'), 1, t); assert.equal(R.raidTypeMult('fight', t), 1, t); }
        });
    });
});

describe('역할 기술 · 규칙 6 전투', () => {
    const party = [mem(1, 'heartail'), mem(2, 'ironpaw'), mem(3, 'bellpup'), mem(4, 'emberkit', 400, 15)];
    const count = (roles) => {
        const c = { heal: 0, taunt: 0, buff: 0, shield: 0 };
        for (let seed = 1; seed <= 30; seed += 1) {
            R.simulateRaid(party, wall(), seed, { guard: true, heal: true, roles }).rounds.forEach((rd) => {
                (rd.heals || []).forEach((h) => { if (h.role) c.heal += 1; });
                (rd.boss || []).forEach((b) => { if (b.taunt) c.taunt += 1; });
                if (rd.buff) c.buff += 1;
                if (rd.shield) c.shield += 1;
            });
        }
        return c;
    };
    it('규칙 6에서는 돌봄 하트·대신 맞기·응원 함성·방울 가드가 나와요', () => {
        const c = count(true);
        Object.entries(c).forEach(([k, v]) => assert.ok(v > 0, `${k} ${v}`));
    });
    it('역할을 끄면(규칙 5 이하) 역할 기술이 하나도 안 나와요', () => {
        assert.deepEqual(count(false), { heal: 0, taunt: 0, buff: 0, shield: 0 });
    });
    it('대신 맞기는 탱커가 원래 대상 대신 맞고, 탱커 자신이 대상이면 안 써요', () => {
        let seen = 0;
        for (let seed = 1; seed <= 30; seed += 1) {
            R.simulateRaid(party, wall(), seed, { guard: true, heal: true, roles: true }).rounds.forEach((rd) => {
                (rd.boss || []).filter((b) => b.taunt).forEach((b) => { seen += 1; assert.equal(b.target, '2'); assert.notEqual(b.cover, '2'); assert.ok(b.cover); });
            });
        }
        assert.ok(seen > 0);
    });
    it('응원·가드 수치가 정한 값이고, 겹쳐 쌓이지 않아요', () => {
        for (let seed = 1; seed <= 20; seed += 1) {
            R.simulateRaid(party, wall(), seed, { roles: true }).rounds.forEach((rd) => {
                if (rd.buff) assert.deepEqual(rd.buff, { by: '3', atk: 25 });
                if (rd.shield) assert.deepEqual(rd.shield, { by: '3', def: 25 });
            });
        }
    });
    it('레벨이 모자라면 역할 기술을 못 써요(탱커 Lv.4, 힐러·서포트 Lv.9)', () => {
        const low = [mem(1, 'heartail', 300, 9), mem(2, 'ironpaw', 300, 4), mem(3, 'bellpup', 300, 9), mem(4, 'emberkit', 300, 9)];
        for (let seed = 1; seed <= 20; seed += 1) {
            R.simulateRaid(low, wall(60), seed, { guard: true, heal: true, roles: true }).rounds.forEach((rd) => {
                assert.ok(!rd.buff && !rd.shield);
                (rd.boss || []).forEach((b) => assert.ok(!b.taunt));
                (rd.heals || []).forEach((h) => assert.ok(!h.role));
            });
        }
    });
    it('같은 기록은 몇 번을 다시 봐도 같고, 새 기록은 규칙 6이에요', () => {
        assert.equal(R.RAID_RULES, 6);
        const run = { rules: 6, members: party, boss: { ...R.RAID_DEFAULT_STAGES[5] }, seed: 77, teamBonus: 6, quizEvery: 5, teamUlt: 300, bossUlt: 120, results: [true, false, true, true], log: [] };
        assert.deepEqual(R.replayRaidRun(run), R.replayRaidRun(JSON.parse(JSON.stringify(run))));
    });
    it('역할 펫이 없는 팀은 규칙 5와 규칙 6 결과가 똑같아요', () => {
        const old = OLD8.slice(0, 5).map((sp, i) => mem(i + 1, sp, 300 + i * 80, 10 + i * 7));
        for (let seed = 1; seed <= 15; seed += 1) {
            const run = { members: old, boss: { ...R.RAID_DEFAULT_STAGES[seed % 22] }, seed, teamBonus: 6, quizEvery: 5, teamUlt: 300, bossUlt: 120, results: [true, false, true, true], log: [] };
            assert.deepEqual(R.replayRaidRun({ ...run, rules: 6 }), R.replayRaidRun({ ...run, rules: 5 }));
        }
    });
});

describe('옛 전투 다시보기 지문(규칙 1~5)', () => {
    // 기준 main d47f8d4 에서 만든 지문이에요. 옛 기록 120개를 다시 볼 때 한 글자도 달라지면 안 돼요.
    it('120개 옛 기록의 결과가 기준 코드와 똑같아요', () => {
        let s = 12345;
        const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
        const out = [];
        for (let c = 0; c < 120; c += 1) {
            const n = 2 + Math.floor(rnd() * 8);
            const members = [];
            for (let i = 0; i < n; i += 1) {
                const species = OLD8[Math.floor(rnd() * OLD8.length)];
                const level = 1 + Math.floor(rnd() * 40);
                const stage = level >= 20 ? 3 : level >= 10 ? 2 : 1;
                const enhance = Math.floor(rnd() * 11);
                const power = Math.min(1300, stage * 100 + level * 15 + enhance * 20 + Math.floor(rnd() * 16) * 10);
                members.push({ id: String(i + 1), name: `학생${i + 1}`, petName: 'x', species, stage, shiny: false, level, enhance, type: 'fire', power });
            }
            const st = R.RAID_DEFAULT_STAGES[Math.floor(rnd() * R.RAID_DEFAULT_STAGES.length)];
            const rules = 1 + (c % 5);
            const results = Array.from({ length: 4 }, () => rnd() < 0.6);
            const run = { rules, members, boss: { ...st }, seed: 1 + Math.floor(rnd() * 1e6), teamBonus: 6, quizEvery: 5, teamUlt: 300, bossUlt: 120, results, log: [] };
            out.push(JSON.stringify(R.replayRaidRun(run)));
        }
        const h = crypto.createHash('sha256').update(out.join('\n')).digest('hex');
        assert.equal(h, '6adcb7729087acd264dc559761551910f9f42c2ccbf997a9c401d11930fdebc4');
    });
});

describe('모르는 종(더 새 버전의 펫) 지키기', () => {
    const box = () => P.sanitizePetBox({ v: 2, slots: 3, main: 0, list: [raw('emberkit'), raw('moonfox', { level: 12, secret: 'keep' })], cage: [raw('sunbird')], mats: { emberkit: 2, moonfox: 4 }, dex: { emberkit: { stage: 1 }, moonfox: { stage: 2, shiny: true } }, gone: { pet: raw('starcat'), at: T0 } });
    it('읽고 다시 저장해도 지워지지 않고 원래 값 그대로예요', () => {
        const b = box();
        assert.equal(b.list[1].phase, 'unknown');
        const doc = P.petBoxToDoc(b);
        assert.deepEqual(doc.list[1], raw('moonfox', { level: 12, secret: 'keep' }));
        assert.equal(doc.cage[0].species, 'sunbird');
        assert.equal(doc.mats.moonfox, 4);
        assert.deepEqual(doc.dex.moonfox, { stage: 2, shiny: true });
        assert.equal(doc.gone.pet.species, 'starcat');
        // 두 번 돌려도 같아요
        assert.deepEqual(P.petBoxToDoc(P.sanitizePetBox(doc)), doc);
    });
    it('칸 수는 세고, 내보내기는 막아요', () => {
        const b = box();
        assert.equal(P.petBoxPetCount(b), 3);
        assert.equal(P.releasePet(b.list[1]).error, 'unknown_pet');
        assert.ok(P.petErrorText ? P.petErrorText('unknown_pet').includes('새로') : true);
    });
    it('이상한 이름은 모르는 종으로 보지 않아요', () => {
        ['__proto__', 'toString', 'A-B', '1abc', 'x'.repeat(30)].forEach((sp) => assert.equal(P.sanitizePet(raw(sp)).phase, 'none', sp));
    });
});
