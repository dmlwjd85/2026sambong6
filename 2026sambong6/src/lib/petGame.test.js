import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as P from './petGame.js';

const H = 3600000;
const T0 = new Date(2026, 10, 16, 9).getTime();
const DAY = '2026-11-16';
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const pet = (extra = {}) => P.sanitizePet({ phase: 'pet', species: 'emberkit', stage: 1, level: 1, exp: 0, enhance: 0, full: 60, fedAt: T0, ...extra });

describe('펫: 알 사기와 부화', () => {
    it('30봉으로 알을 사고, 봉이 모자라거나 이미 있으면 못 사요', () => {
        const r = P.buyPetEgg(null, { bong: 30, now: T0 });
        assert.equal(r.ok, true);
        assert.equal(r.cost, P.PET_EGG_PRICE);
        assert.equal(r.pet.phase, 'egg');
        assert.equal(P.buyPetEgg(null, { bong: 29 }).error, 'no_bong');
        assert.equal(P.buyPetEgg(r.pet, { bong: 99 }).error, 'has_pet');
    });

    it('열 번 품으면 부화하고 도감에 올라가요', () => {
        let p = P.buyPetEgg(null, { bong: 30 }).pet;
        for (let i = 0; i < P.PET_HATCH_TAPS - 1; i += 1) {
            const r = P.warmPetEgg(p, { now: T0, rnd: seq(0) });
            assert.equal(r.pet.phase, 'egg');
            p = r.pet;
        }
        const r = P.warmPetEgg(p, { now: T0, rnd: seq(0, 0.99) });
        assert.equal(r.hatched, true);
        assert.equal(r.pet.phase, 'pet');
        assert.equal(r.pet.species, 'emberkit');
        assert.equal(r.pet.shiny, false);
        assert.equal(r.pet.name, '불냥');
        assert.deepEqual(r.pet.dex, { emberkit: { stage: 1, shiny: false } });
    });

    it('종은 무게대로 나오고, 별빛 용은 드물어요', () => {
        const counts = {};
        let x = 1;
        const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; };
        for (let i = 0; i < 5000; i += 1) { const id = P.rollPetSpecies(rnd); counts[id] = (counts[id] || 0) + 1; }
        assert.equal(Object.keys(counts).length, 7);
        assert.ok(counts.stardrake < counts.emberkit / 2);
        assert.equal(P.rollPetSpecies(() => 0.9999), 'stardrake');
    });
});

describe('펫: 먹이·배고픔·가출', () => {
    it('먹이를 주면 봉이 들고 배가 차고 경험치가 올라요', () => {
        const r = P.feedPet(pet(), { food: 'feast', bong: 10, now: T0, today: DAY });
        assert.equal(r.cost, 3);
        assert.equal(r.pet.full, 100);
        assert.equal(r.pet.level, 2);
        assert.equal(r.pet.exp, 4); // 20 - (10 + 6×1)
        assert.equal(P.feedPet(pet(), { food: 'feast', bong: 2, now: T0 }).error, 'no_bong');
        assert.equal(P.feedPet(pet(), { food: 'pizza', bong: 9, now: T0 }).error, 'bad_food');
    });

    it('배가 부르면 못 먹고, 시간이 지나면 다시 먹일 수 있어요', () => {
        const fullPet = pet({ full: 100 });
        assert.equal(P.feedPet(fullPet, { food: 'kibble', bong: 9, now: T0, today: DAY }).error, 'full');
        assert.equal(P.petView(fullPet, T0 + 5 * H, DAY).fullNow, 80);
        assert.equal(P.feedPet(fullPet, { food: 'kibble', bong: 9, now: T0 + 5 * H, today: DAY }).ok, true);
    });

    it('기분은 포만감을 따라가요', () => {
        assert.equal(P.petView(pet({ full: 100 }), T0, DAY).mood, 'happy');
        assert.equal(P.petView(pet({ full: 40 }), T0, DAY).mood, 'ok');
        assert.equal(P.petView(pet({ full: 10 }), T0, DAY).mood, 'hungry');
        assert.equal(P.petView(pet({ full: 100 }), T0 + 30 * H, DAY).mood, 'starving');
    });

    it('배가 빈 채로 3일이 지나면 가출하고, 10봉으로 데려와요', () => {
        const p = pet({ full: 100, level: 12, enhance: 3 });
        const emptyAt = T0 + 25 * H;
        assert.equal(P.petView(p, emptyAt + 71 * H, DAY).away, false);
        const late = emptyAt + 73 * H;
        assert.equal(P.petView(p, late, DAY).away, true);
        assert.equal(P.feedPet(p, { food: 'kibble', bong: 9, now: late, today: DAY }).error, 'away');
        assert.equal(P.walkPet(p, { now: late, today: DAY }).error, 'away');
        assert.equal(P.bringPetBack(p, { bong: 9, now: late, today: DAY }).error, 'no_bong');
        const back = P.bringPetBack(p, { bong: 10, now: late, today: DAY });
        assert.equal(back.cost, P.PET_RETURN_PRICE);
        assert.equal(back.pet.level, 12);
        assert.equal(back.pet.enhance, 3);
        assert.equal(P.petView(back.pet, late, DAY).away, false);
        assert.equal(P.bringPetBack(back.pet, { bong: 10, now: late, today: DAY }).error, 'not_away');
    });

    it('금요일 오후에 배불리 먹이면 월요일 아침에는 아직 집에 있어요', () => {
        const fri = new Date(2026, 10, 13, 15).getTime();
        const mon = new Date(2026, 10, 16, 9).getTime();
        const v = P.petView(pet({ full: 100, fedAt: fri }), mon, DAY);
        assert.equal(v.away, false);
        assert.equal(v.mood, 'starving');
    });
});

describe('펫: 놀기·레벨·진화', () => {
    it('놀아 주기는 4시간에 한 번, 하루 5번까지예요', () => {
        let p = P.playWithPet(pet(), { now: T0, today: DAY }).pet;
        assert.equal(P.playWithPet(p, { now: T0 + 3 * H, today: DAY }).error, 'play_wait');
        assert.equal(P.petView(p, T0 + 3 * H, DAY).playWaitMs, H);
        assert.equal(P.petView(p, T0 + 3 * H, DAY).canPlay, false);
        // 9시에 시작해 4시간마다: 9·13·17·21시 (네 번) — 다섯 번째는 다음 날 1시라 날짜가 바뀌어요
        for (let i = 1; i <= 3; i += 1) p = P.playWithPet(p, { now: T0 + i * 4 * H, today: DAY }).pet;
        assert.equal(P.petView(p, T0 + 16 * H, DAY).playsLeft, 1);
        p = P.playWithPet(p, { now: T0 + 16 * H, today: DAY }).pet;
        assert.equal(P.playWithPet(p, { now: T0 + 30 * H, today: DAY }).error, 'play_limit');
        assert.equal(P.petView(p, T0 + 30 * H, '2026-11-17').playsLeft, 5);
        assert.equal(P.playWithPet(p, { now: T0 + 30 * H, today: '2026-11-17' }).ok, true);
    });

    it('레벨 10·20에서 진화하고 이름이 바뀌어요(직접 지은 이름은 그대로)', () => {
        assert.equal(P.evolvePet(pet({ level: 9 }), { now: T0, today: DAY }).error, 'not_ready');
        const e1 = P.evolvePet(pet({ level: 10 }), { now: T0, today: DAY });
        assert.equal(e1.pet.stage, 2);
        assert.equal(e1.pet.name, '화르냥');
        assert.equal(e1.pet.dex.emberkit.stage, 2);
        assert.equal(P.evolvePet(e1.pet, { now: T0, today: DAY }).error, 'not_ready');
        const named = P.renamePet(pet({ level: 20, stage: 2 }), { name: '  우리 <b>호랑</b>  ' }).pet;
        assert.equal(named.name, '우리 b호랑/b'.slice(0, P.PET_NAME_MAX));
        const e2 = P.evolvePet(named, { now: T0, today: DAY });
        assert.equal(e2.pet.stage, 3);
        assert.equal(e2.pet.name, named.name);
        assert.equal(P.petView(e2.pet, T0, DAY).canEvolve, false);
    });

    it('최고 레벨은 30이고 넘치는 경험치는 버려요', () => {
        const r = P.feedPet(pet({ level: 29, exp: 180, full: 0 }), { food: 'feast', bong: 9, now: T0, today: DAY });
        assert.equal(r.pet.level, 30);
        assert.equal(r.pet.exp, 0);
        assert.equal(P.petView(r.pet, T0, DAY).expNeed, 0);
    });
});

describe('펫: 강화·산책·랭킹', () => {
    it('강화는 확률로 성공하고, 실패해도 펫은 그대로예요', () => {
        assert.equal(P.petEnhanceCost(0), 5);
        assert.equal(P.petEnhanceCost(9), 32);
        assert.equal(P.petEnhanceChance(0), 0.95);
        assert.equal(P.petEnhanceChance(9), 0.3);
        const ok = P.enhancePet(pet(), { bong: 5, now: T0, today: DAY, rnd: seq(0.5) });
        assert.equal(ok.success, true);
        assert.equal(ok.pet.enhance, 1);
        assert.equal(ok.cost, 5);
        const no = P.enhancePet(pet({ enhance: 9 }), { bong: 99, now: T0, today: DAY, rnd: seq(0.5) });
        assert.equal(no.success, false);
        assert.equal(no.pet.enhance, 9);
        assert.equal(no.cost, 32);
        assert.equal(P.enhancePet(pet({ enhance: 10 }), { bong: 99, now: T0, today: DAY }).error, 'max_enhance');
        assert.equal(P.enhancePet(pet(), { bong: 4, now: T0, today: DAY }).error, 'no_bong');
    });

    it('산책은 하루 한 번이고, 능력치에 따라 정해진 범위에서 랜덤으로 벌어 와요', () => {
        // 갓 태어난 펫(전투력 60): 1~3봉
        assert.deepEqual(P.petWalkRange(pet()), { min: 1, max: 3 });
        // 다 키운 펫(전투력 950): 4~9봉
        assert.deepEqual(P.petWalkRange(pet({ stage: 3, level: 30, enhance: 10 })), { min: 4, max: 9 });
        assert.equal(P.walkPet(pet(), { now: T0, today: DAY, rnd: () => 0 }).gain, 1);
        const r = P.walkPet(pet(), { now: T0, today: DAY, rnd: () => 0.999 });
        assert.equal(r.gain, 3);
        assert.equal(r.pet.earned, 3);
        assert.equal(P.walkPet(r.pet, { now: T0, today: DAY }).error, 'walked');
        assert.equal(P.walkPet(r.pet, { now: T0, today: '2026-11-17' }).ok, true);
        assert.equal(P.walkPet(pet({ full: 20 }), { now: T0, today: DAY }).error, 'too_hungry');
        const seen = new Set();
        let x = 3;
        const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; };
        for (let i = 0; i < 200; i += 1) seen.add(P.rollPetWalkBong(pet({ stage: 3, level: 30, enhance: 10 }), null, rnd));
        assert.deepEqual([...seen].sort((a, b) => a - b), [4, 5, 6, 7, 8, 9]);
    });

    it('산책 보상은 마스터 설정을 따라요(상한 포함)', () => {
        const walk = { min: 2, max: 5, step: 50, cap: 8 };
        assert.deepEqual(P.petWalkRange(pet(), walk), { min: 3, max: 7 });
        assert.deepEqual(P.petWalkRange(pet({ stage: 3, level: 30, enhance: 10 }), walk), { min: 8, max: 8 });
        assert.equal(P.petView(pet(), T0, DAY, { walk }).walkRange.max, 7);
        assert.equal(P.walkPet(pet(), { now: T0, today: DAY, walk, rnd: () => 0.999 }).gain, 7);
    });

    it('놓아주면 도감에 남고 새 알을 살 수 있어요', () => {
        const r = P.releasePet(pet({ stage: 2, level: 15, shiny: true }));
        assert.equal(r.pet.phase, 'none');
        assert.deepEqual(r.pet.dex, { emberkit: { stage: 2, shiny: true } });
        assert.equal(P.buyPetEgg(r.pet, { bong: 30 }).ok, true);
    });

    it('반 랭킹은 전투력 순이고, 알·펫 없는 학생은 빼요', () => {
        const rows = P.rankClassPets([
            { id: '1', name: '하나', pet: pet({ level: 5 }) },
            { id: '2', name: '두리', pet: pet({ level: 12, stage: 2, enhance: 2 }) },
            { id: '3', name: '세찬', pet: { phase: 'egg', taps: 3 } },
            { id: '4', name: '네모' },
        ], T0, DAY);
        assert.deepEqual(rows.map((r) => [r.rank, r.owner]), [[1, '두리'], [2, '하나']]);
        assert.equal(rows[0].view.power, 2 * 100 + 12 * 15 + 2 * 20);
    });

    it('이상한 저장값은 안전한 모양으로 고쳐요', () => {
        assert.equal(P.sanitizePet(null).phase, 'none');
        assert.equal(P.sanitizePet({ phase: 'pet', species: 'pikachu' }).phase, 'none');
        const p = P.sanitizePet({ phase: 'pet', species: 'snowbun', level: 99, stage: 7, enhance: -3, full: 500, name: '<script>' });
        assert.equal(p.level, 30);
        assert.equal(p.stage, 3);
        assert.equal(p.enhance, 0);
        assert.equal(p.full, 100);
        assert.equal(p.name, 'script');
        assert.ok(P.petErrorText('full').includes('배가'));
    });
});

describe('펫 설정(마스터)', () => {
    it('기본값: 두 번째 칸 Lv.35·50봉, 세 번째 칸 Lv.60·100봉', () => {
        const d = P.sanitizePetSettings(null);
        assert.deepEqual(d.slotRules, [{ level: 35, price: 50 }, { level: 60, price: 100 }]);
        assert.deepEqual(d.walk, { min: 1, max: 3, step: 150, cap: 15 });
    });

    it('이상한 값은 범위 안으로 고치고, 빈 값은 기본값을 써요', () => {
        const sset = P.sanitizePetSettings({ slotRules: [{ level: 999, price: -5 }, { level: '', price: 'abc' }], walk: { min: 9, max: 2, step: 1, cap: 0 } });
        assert.deepEqual(sset.slotRules, [{ level: 100, price: 0 }, { level: 60, price: 100 }]);
        assert.deepEqual(sset.walk, { min: 9, max: 9, step: 10, cap: 9 });
    });
});

describe('펫 칸(슬롯)', () => {
    it('예전 저장값(펫 하나)은 첫 칸으로 읽어요', () => {
        const box = P.sanitizePetBox(pet({ level: 7, dex: { emberkit: { stage: 1 } } }));
        assert.equal(box.slots, 1);
        assert.equal(box.list[0].level, 7);
        assert.deepEqual(box.dex, { emberkit: { stage: 1, shiny: false } });
        assert.equal(P.sanitizePetBox(null).list[0].phase, 'none');
        // 저장했다가 읽어도 같아요
        assert.deepEqual(P.sanitizePetBox(JSON.parse(JSON.stringify(P.petBoxToDoc(box)))), box);
    });

    it('레벨과 봉이 되면 칸이 늘고, 세 칸까지예요', () => {
        let box = P.sanitizePetBox(null);
        assert.deepEqual(P.petNextSlotRule(box), { level: 35, price: 50 });
        assert.equal(P.expandPetBox(box, { bong: 999, level: 34 }).error, 'need_level');
        assert.equal(P.expandPetBox(box, { bong: 49, level: 35 }).error, 'no_bong');
        const r1 = P.expandPetBox(box, { bong: 50, level: 35 });
        assert.equal(r1.cost, 50);
        assert.equal(r1.box.slots, 2);
        box = r1.box;
        assert.equal(P.expandPetBox(box, { bong: 999, level: 59 }).error, 'need_level');
        const r2 = P.expandPetBox(box, { bong: 100, level: 60 });
        assert.equal(r2.cost, 100);
        assert.equal(r2.box.slots, 3);
        assert.equal(P.expandPetBox(r2.box, { bong: 999, level: 100 }).error, 'max_slots');
        assert.equal(P.petNextSlotRule(r2.box), null);
    });

    it('칸 늘리기 조건은 마스터 설정을 따라요', () => {
        const settings = { slotRules: [{ level: 10, price: 5 }, { level: 20, price: 7 }] };
        const r = P.expandPetBox(null, { bong: 5, level: 10, settings });
        assert.equal(r.ok, true);
        assert.equal(r.cost, 5);
    });

    it('칸마다 따로 키우고, 도감은 함께 써요', () => {
        let box = P.expandPetBox(null, { bong: 50, level: 35 }).box;
        const egg = P.buyPetEgg(P.petBoxSlot(box, 1), { bong: 30 });
        box = P.petBoxWith(box, 1, egg.pet);
        assert.equal(box.list[0].phase, 'none');
        assert.equal(box.list[1].phase, 'egg');
        box = P.petBoxWith(box, 0, pet({ species: 'snowbun', dex: { snowbun: { stage: 1 } } }));
        box = P.petBoxWith(box, 1, pet({ species: 'zapowl', stage: 2, level: 12, dex: { ...box.dex, zapowl: { stage: 2 } } }));
        assert.deepEqual(Object.keys(box.dex).sort(), ['snowbun', 'zapowl']);
        assert.equal(P.petBoxSlot(box, 2), null);
        assert.equal(P.petBoxSlot(box, 1).dex.snowbun.stage, 1);
    });

    it('대표 펫은 태어난 펫만 고를 수 있고, 랭킹에는 대표 펫이 나와요', () => {
        let box = P.expandPetBox(null, { bong: 50, level: 35 }).box;
        box = P.petBoxWith(box, 0, pet({ species: 'snowbun', level: 3 }));
        box = P.petBoxWith(box, 1, { phase: 'egg', taps: 2 });
        assert.equal(P.setPetBoxMain(box, 1).error, 'not_pet');
        assert.equal(P.setPetBoxMain(box, 5).error, 'bad_slot');
        box = P.petBoxWith(box, 1, pet({ species: 'zapowl', stage: 2, level: 12 }));
        box = P.setPetBoxMain(box, 1).box;
        assert.equal(P.petBoxMain(box).species, 'zapowl');
        const rows = P.rankClassPets([{ id: '1', name: '하나', pet: P.petBoxToDoc(box) }, { id: '2', name: '두리', pet: pet({ level: 5 }) }], T0, DAY);
        assert.deepEqual(rows.map((r) => [r.owner, r.view.species]), [['하나', 'zapowl'], ['두리', 'emberkit']]);
        // 대표로 고른 칸이 비면 다른 펫을 보여 줘요
        const gone = P.petBoxWith(box, 1, P.releasePet(P.petBoxSlot(box, 1)).pet);
        assert.equal(P.petBoxMain(gone).species, 'snowbun');
        assert.equal(P.petBoxMainIndex(P.sanitizePetBox(null)), -1);
    });
});

describe('전투력', () => {
    it('최대 1000이에요(3단계·Lv.30·+10·색다름·희귀)', () => {
        assert.equal(P.petPower(pet({ species: 'stardrake', stage: 3, level: 30, enhance: 10, shiny: true })), 1000);
        assert.equal(P.petPower(pet({ stage: 3, level: 30, enhance: 10 })), 950);
        assert.equal(P.petPower(pet()), 115);
        assert.equal(P.petPower(null), 0);
    });
});

it('경험치 팩: 봉을 내고 경험치를 받아요(마스터가 값·경험치를 고쳐요)', async () => {
    const { buyPetExpPack, sanitizePetSettings, PET_MAX_LEVEL } = await import('./petGame.js');
    const cfg = sanitizePetSettings(null);
    assert.deepEqual(cfg.expPacks, [{ price: 50, exp: 50 }, { price: 100, exp: 110 }, { price: 500, exp: 600 }]);
    const pet = { phase: 'pet', species: 'emberkit', stage: 1, level: 1, exp: 0, enhance: 0, full: 90, fedAt: 1000 };
    assert.equal(buyPetExpPack(pet, { index: 0, packs: cfg.expPacks, bong: 49, now: 1000 }).error, 'no_bong');
    const r = buyPetExpPack(pet, { index: 2, packs: cfg.expPacks, bong: 500, now: 1000 });
    assert.equal(r.ok, true);
    assert.equal(r.cost, 500);
    assert.equal(r.exp, 600);
    assert.ok(r.levelUps > 0 && r.pet.level > 1);
    assert.equal(buyPetExpPack(pet, { index: 7, packs: cfg.expPacks, bong: 999 }).error, 'bad_pack');
    assert.equal(buyPetExpPack({ ...pet, level: PET_MAX_LEVEL }, { index: 0, packs: cfg.expPacks, bong: 999, now: 1000 }).error, 'max_level');
    assert.equal(buyPetExpPack({ phase: 'egg', taps: 1 }, { index: 0, bong: 999 }).error, 'no_pet');
    const custom = sanitizePetSettings({ expPacks: [{ price: 30, exp: 40 }] });
    assert.deepEqual(custom.expPacks[0], { price: 30, exp: 40 });
    assert.deepEqual(custom.expPacks[1], { price: 100, exp: 110 });
});
