import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as P from './petGame.js';

const H = 3600000;
// 한국 시간 2026-11-16(월) 오전 9시. 배고픔은 한국 시간 낮(8~19시)에만 줄어요.
const T0 = Date.UTC(2026, 10, 16, 0);
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
        assert.equal(Object.keys(counts).length, Object.keys(P.PET_SPECIES).length);
        assert.ok(counts.stardrake < counts.emberkit / 2);
        assert.equal(P.rollPetSpecies(() => 0.9999), 'bellpup'); // 새 펫 3종이 맨 뒤에 붙었어요
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
        assert.equal(P.petView(pet({ full: 100 }), T0 + 30 * H, DAY).mood, 'ok'); // 낮 17시간만 지났어요(100 − 68)
        assert.equal(P.petView(pet({ full: 100 }), T0 + 54 * H, DAY).mood, 'starving');
    });

    it('배가 빈 채로 3일이 지나면 가출하고, 10봉으로 데려와요', () => {
        const p = pet({ full: 100, level: 12, enhance: 3 });
        const emptyAt = T0 + 51 * H; // 낮 25시간이 지난 때(셋째 날 낮 12시)
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
        const fri = Date.UTC(2026, 10, 13, 6); // 금요일 오후 3시(한국 시간)
        const mon = Date.UTC(2026, 10, 16, 0); // 월요일 오전 9시
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

    it('최고 레벨은 40이고 넘치는 경험치는 버려요', () => {
        const r = P.feedPet(pet({ level: 39, exp: 240, full: 0 }), { food: 'feast', bong: 9, now: T0, today: DAY });
        assert.equal(r.pet.level, 40);
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
        // 모르는 종(더 새 버전 앱의 펫)은 지우지 않고 'unknown' 으로 감싸 둬요. 이름 모양이 아니면 빈 칸이에요.
        assert.equal(P.sanitizePet({ phase: 'pet', species: 'pikachu' }).phase, 'unknown');
        assert.equal(P.sanitizePet({ phase: 'pet', species: '<b>x' }).phase, 'none');
        assert.equal(P.sanitizePet({ phase: 'pet', species: 'constructor' }).phase, 'none');
        const p = P.sanitizePet({ phase: 'pet', species: 'snowbun', level: 99, stage: 7, enhance: -3, full: 500, name: '<script>' });
        assert.equal(p.level, 40);
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

it('기술: 레벨 1·10·20에 하나씩 배워요', async () => {
    const { petSkills, petSkillCount, PET_SKILL_NAMES, PET_SPECIES } = await import('./petGame.js');
    assert.deepEqual(Object.keys(PET_SKILL_NAMES).sort(), Object.keys(PET_SPECIES).sort());
    assert.deepEqual([petSkillCount(1), petSkillCount(9), petSkillCount(10), petSkillCount(19), petSkillCount(20), petSkillCount(30)], [1, 1, 2, 2, 3, 3]);
    const list = petSkills('dropotter', 12);
    assert.deepEqual(list.map((k) => k.learned), [true, true, false]);
    assert.equal(list[2].level, 20);
    assert.equal(list[1].name, '물대포');
});

describe('펫: 밤에는 배고프지 않아요', () => {
    it('저녁 7시부터 다음 날 아침 8시까지는 배부름이 그대로예요', () => {
        const evening = Date.UTC(2026, 10, 16, 10); // 저녁 7시
        const p = pet({ full: 80, fedAt: evening });
        assert.equal(P.petView(p, evening + 13 * H, DAY).fullNow, 80); // 다음 날 아침 8시
        assert.equal(P.petView(p, evening + 15 * H, DAY).fullNow, 72); // 아침 10시: 낮 2시간
        assert.equal(P.petAwakeHoursBetween(T0, T0 + 24 * H), 11);
        assert.equal(P.petAwakeHoursBetween(T0, T0 + 10 * 24 * H), 110);
        assert.equal(P.petAddAwakeHours(T0 - 9 * H, 12), T0 - 9 * H + 33 * H); // 자정부터 낮 12시간 → 다음 날 오전 9시
    });
    it('마스터가 시간을 바꾸면 그 시간에만 배고파져요', () => {
        assert.deepEqual(P.setPetAwakeHours(9, 15), { start: 9, end: 15 });
        assert.equal(P.petAwakeHoursBetween(T0, T0 + 24 * H), 6);
        assert.deepEqual(P.setPetAwakeHours(20, 3), P.PET_AWAKE_DEFAULT); // 말이 안 되는 값은 기본으로
        assert.deepEqual(P.sanitizePetSettings({ awake: { start: 7, end: 30 }, cageSize: 9 }).awake, { start: 7, end: 24 });
        assert.equal(P.sanitizePetSettings({ cageSize: 9 }).cageSize, P.PET_MAX_CAGE_SIZE);
        assert.equal(P.sanitizePetSettings(null).cageSize, 3);
        P.setPetAwakeHours(8, 19);
    });
});

describe('펫: 케이지·알 보관함·강화 재료', () => {
    const boxOf = (list, extra = {}) => P.sanitizePetBox({ v: 2, slots: list.length, main: 0, list, dex: {}, ...extra });
    const raw = (species, extra = {}) => ({ phase: 'pet', species, stage: 1, level: 5, exp: 0, enhance: 1, full: 60, fedAt: T0, ...extra });

    it('케이지에 넣으면 배고프지 않고, 꺼내면 그때부터 다시 배고파져요', () => {
        const box = boxOf([raw('emberkit'), { phase: 'none' }]);
        const r = P.cagePet(box, 0, { now: T0 + 5 * H, today: DAY });
        assert.equal(r.ok, true);
        assert.equal(r.box.list[0].phase, 'none');
        assert.equal(r.box.cage.length, 1);
        assert.equal(r.box.cage[0].full, 40); // 넣을 때 배부름(60 − 20)
        assert.equal(P.cagePetView(r.box.cage[0], DAY).fullNow, 40); // 며칠이 지나도 그대로
        const out = P.uncagePet(r.box, 0, 1, { now: T0 + 100 * H, today: DAY });
        assert.equal(out.ok, true);
        assert.equal(out.box.cage.length, 0);
        assert.equal(P.petView(out.box.list[1], T0 + 100 * H, DAY).fullNow, 40);
        assert.equal(P.petView(out.box.list[1], T0 + 100 * H, DAY).away, false);
    });
    it('케이지 하나에 3마리, 한 종류는 한 마리씩만', () => {
        let box = boxOf([raw('emberkit')], { cage: [raw('dropotter'), raw('sproutdeer')] });
        assert.equal(P.petCageCapacity(box), 3);
        box = P.cagePet(box, 0, { now: T0, today: DAY }).box;
        assert.equal(box.cage.length, 3);
        const full = P.sanitizePetBox({ ...box, list: [raw('zapowl')] });
        assert.equal(P.cagePet(full, 0, { now: T0, today: DAY }).error, 'cage_full');
        assert.equal(P.petCageCapacity(full, { cageSize: 5 }), 5);
        const dup = boxOf([raw('emberkit')], { cage: [raw('emberkit')] });
        assert.equal(P.cagePet(dup, 0, { now: T0, today: DAY }).error, 'cage_dup');
        assert.equal(P.cagePet(boxOf([{ phase: 'egg', taps: 1 }]), 0, { now: T0 }).error, 'no_pet');
    });
    it('칸에 펫이 있으면 자리를 바꾸고, 알이 있는 칸으로는 못 꺼내요', () => {
        const box = boxOf([raw('emberkit'), { phase: 'egg', taps: 2 }], { cage: [raw('dropotter', { level: 9 })] });
        const sw = P.uncagePet(box, 0, 0, { now: T0 + 2 * H, today: DAY });
        assert.equal(sw.box.list[0].species, 'dropotter');
        assert.equal(sw.box.cage[0].species, 'emberkit');
        assert.equal(sw.box.cage[0].full, 52);
        assert.equal(P.uncagePet(box, 0, 1, { now: T0 }).error, 'slot_busy');
        assert.equal(P.uncagePet(box, 3, 0, { now: T0 }).error, 'cage_empty');
    });
    it('알은 보관함에 넣어 두었다가 빈 칸에 꺼내요', () => {
        let box = boxOf([{ phase: 'egg', taps: 4 }]);
        box = P.storePetEgg(box, 0).box;
        assert.equal(box.eggs, 1);
        assert.equal(box.list[0].phase, 'none');
        box = P.addStoredEggs(box, 2).box; // 선생님 선물
        assert.equal(box.eggs, 3);
        const used = P.useStoredEgg(box, 0, { now: T0 });
        assert.equal(used.box.eggs, 2);
        assert.deepEqual([used.box.list[0].phase, used.box.list[0].taps], ['egg', 0]);
        assert.equal(P.useStoredEgg(used.box, 0).error, 'slot_used');
        assert.equal(P.useStoredEgg(boxOf([{ phase: 'none' }]), 0).error, 'no_stored_egg');
        assert.equal(P.addStoredEggs(box, 999).box.eggs, P.PET_MAX_STORED_EGGS);
    });
    it('이미 가진 종이 태어나면 강화 재료가 되고, 재료로는 반드시 강화돼요', () => {
        const born = P.sanitizePet(raw('emberkit', { level: 1, enhance: 0, shiny: true }));
        const box = boxOf([{ phase: 'egg', taps: 9 }, raw('dropotter')], { cage: [raw('emberkit')] });
        const r = P.settleHatchedPet(box, 0, born);
        assert.equal(r.duplicate, true);
        assert.equal(r.box.list[0].phase, 'none');
        assert.equal(r.box.mats.emberkit, 1);
        assert.equal(r.box.cage[0].shiny, true); // 색다른 중복은 가진 펫을 색다르게
        // 처음 보는 종이면 그대로 펫이 돼요.
        const fresh = P.settleHatchedPet(box, 0, P.sanitizePet(raw('zapowl')));
        assert.equal(fresh.duplicate, false);
        assert.equal(fresh.box.list[0].species, 'zapowl');
        // 재료로 강화
        const withMat = P.uncagePet(r.box, 0, 0, { now: T0 }).box;
        const enh = P.enhancePetWithMat(withMat, 0, { now: T0, today: DAY });
        assert.equal(enh.ok, true);
        assert.equal(enh.cost, 0);
        assert.equal(enh.box.list[0].enhance, 2);
        assert.equal(enh.box.mats.emberkit, 0);
        assert.equal(P.enhancePetWithMat(enh.box, 0, { now: T0 }).error, 'no_mat');
        assert.equal(P.enhancePetWithMat(withMat, 1, { now: T0 }).error, 'no_mat'); // 다른 종의 재료는 못 써요
    });
    it('저장 모양에 케이지·알·재료가 들어가고, 예전 저장값도 읽어요', () => {
        const doc = P.petBoxToDoc(boxOf([raw('emberkit')], { cage: [raw('dropotter')], eggs: 2, mats: { emberkit: 3, nope: 9 } }));
        assert.equal(doc.cage.length, 1);
        assert.equal(doc.eggs, 2);
        assert.equal(doc.mats.emberkit, 3);
        assert.equal(doc.mats.nope, 9); // 모르는 종의 재료도 지우지 않아요
        const old = P.sanitizePetBox({ v: 2, slots: 1, main: 0, list: [raw('emberkit')], dex: {} });
        assert.deepEqual([old.cage.length, old.eggs, old.mats.emberkit], [0, 0, 0]);
    });
});

describe('펫 상점', () => {
    const boxOf = (list, extra = {}) => P.sanitizePetBox({ v: 2, slots: list.length, main: 0, list, dex: {}, ...extra });
    it('값: 일반 50 · 색다름 70 · 별빛룡 500 · 색다른 별빛룡 700, 마스터가 바꿀 수 있어요', () => {
        assert.equal(P.petShopPrice('emberkit', false), 50);
        assert.equal(P.petShopPrice('emberkit', true), 70);
        assert.equal(P.petShopPrice('stardrake', false), 500);
        assert.equal(P.petShopPrice('stardrake', true), 700);
        assert.equal(P.petShopPrice('emberkit', false, { shop: { normal: 40 } }), 40);
        assert.equal(P.petShopPrice('nope', false), 0);
    });
    it('빈 칸에 사서 넣고, 봉이 모자라거나 칸이 차 있으면 못 사요', () => {
        const box = boxOf([{ phase: 'none' }, { phase: 'egg', taps: 1 }]);
        const r = P.buyShopPet(box, 0, { species: 'stardrake', shiny: true, bong: 700, now: T0 });
        assert.equal(r.ok, true);
        assert.equal(r.cost, 700);
        assert.deepEqual([r.box.list[0].species, r.box.list[0].shiny, r.box.list[0].level], ['stardrake', true, 1]);
        assert.equal(r.box.dex.stardrake.shiny, true);
        assert.equal(P.buyShopPet(box, 0, { species: 'stardrake', bong: 499 }).error, 'no_bong');
        assert.equal(P.buyShopPet(box, 1, { species: 'emberkit', bong: 99 }).error, 'slot_used');
    });
    it('이미 가진 종은 못 사고, 일반 펫을 색다른 펫으로는 바꿀 수 있어요', () => {
        const raw = { phase: 'pet', species: 'emberkit', stage: 2, level: 12, enhance: 3, full: 60, fedAt: T0 };
        const box = boxOf([raw, { phase: 'none' }]);
        assert.equal(P.buyShopPet(box, 1, { species: 'emberkit', bong: 999 }).error, 'owned');
        const up = P.buyShopPet(box, 1, { species: 'emberkit', shiny: true, bong: 70 });
        assert.equal(up.upgraded, true);
        assert.deepEqual([up.box.list[0].shiny, up.box.list[0].level, up.box.list[0].enhance, up.box.list[1].phase], [true, 12, 3, 'none']);
        assert.equal(P.buyShopPet(up.box, 1, { species: 'emberkit', shiny: true, bong: 999 }).error, 'owned');
        const caged = boxOf([{ phase: 'none' }], { cage: [raw] });
        assert.equal(P.buyShopPet(caged, 0, { species: 'emberkit', bong: 999 }).error, 'owned');
        assert.equal(P.buyShopPet(caged, 0, { species: 'emberkit', shiny: true, bong: 999 }).box.cage[0].shiny, true);
    });
});

describe('알 선물 받기', () => {
    it('받은 합계를 적어 두어서 같은 선물을 두 번 받지 않아요', () => {
        let box = P.sanitizePetBox({ v: 2, slots: 1, main: 0, list: [{ phase: 'none' }], dex: {} });
        const r = P.receivePetGifts(box, 3);
        assert.deepEqual([r.ok, r.box.eggs, r.box.giftSeen, r.gifted], [true, 3, 3, 3]);
        assert.equal(P.receivePetGifts(r.box, 3).error, 'no_gift');
        const r2 = P.receivePetGifts(r.box, 5);
        assert.deepEqual([r2.box.eggs, r2.box.giftSeen], [5, 5]);
        assert.equal(P.petBoxToDoc(r2.box).giftSeen, 5);
        const full = P.receivePetGifts(P.sanitizePetBox({ ...r2.box, eggs: 29 }), 8);
        assert.deepEqual([full.box.eggs, full.added, full.gifted], [30, 1, 3]);
    });
});

describe('놓아주기 되돌리기', () => {
    const T = new Date(2026, 10, 17, 9).getTime();
    const pet = (species, level = 5) => ({ phase: 'pet', species, stage: 1, level, exp: 2, enhance: 3, full: 80, fedAt: T, name: '테스트', named: true });
    it('놓아준 펫은 7일 안에 빈칸으로 다시 데려올 수 있어요(레벨·강화 그대로)', () => {
        const box = P.sanitizePetBox({ v: 2, slots: 2, main: 0, list: [pet('zapowl', 7), pet('emberkit')], dex: {} });
        const r = P.releaseBoxPet(box, 0, { now: T });
        assert.equal(r.ok, true);
        assert.equal(r.box.list[0].phase, 'none');
        assert.equal(P.petBoxPetCount(r.box), 1);
        const saved = P.sanitizePetBox(JSON.parse(JSON.stringify(P.petBoxToDoc(r.box))));
        assert.equal(P.releasedPetOf(saved, T + 3600000).level, 7);
        assert.equal(P.restoreReleasedPet(saved, 1, { now: T }).error, 'slot_busy');
        const back = P.restoreReleasedPet(saved, 0, { now: T + 3600000 });
        assert.equal(back.ok, true);
        assert.deepEqual([back.box.list[0].species, back.box.list[0].level, back.box.list[0].enhance], ['zapowl', 7, 3]);
        assert.equal(back.box.gone, null);
        assert.equal(P.restoreReleasedPet(back.box, 0, { now: T }).error, 'no_gone');
        assert.equal(P.releasedPetOf(saved, T + P.PET_RELEASE_UNDO_MS + 1), null, '7일이 지나면 못 데려와요');
    });
    it('알을 놓아주면 되돌릴 게 없고, 같은 종을 다시 키우는 중이면 못 데려와요', () => {
        const egg = P.sanitizePetBox({ v: 2, slots: 1, main: 0, list: [{ phase: 'egg', taps: 1 }], dex: {} });
        assert.equal(P.releaseBoxPet(egg, 0, { now: T }).box.gone, null);
        let box = P.releaseBoxPet(P.sanitizePetBox({ v: 2, slots: 2, main: 0, list: [pet('zapowl'), { phase: 'none' }], dex: {} }), 0, { now: T }).box;
        box = { ...box, list: [{ phase: 'none' }, pet('zapowl', 1)] };
        assert.equal(P.restoreReleasedPet(box, 0, { now: T }).error, 'owned');
    });
});

describe('레벨 40 · 회복 기술', () => {
    it('최고 레벨 40, 강화석 없이 전투력은 최대 1150이에요', () => {
        assert.equal(P.sanitizePet({ phase: 'pet', species: 'snowbun', level: 45 }).level, 40);
        const best = P.sanitizePet({ phase: 'pet', species: 'stardrake', shiny: true, stage: 3, level: 40, enhance: 10 });
        assert.equal(P.petPower(best), 1150);
        assert.equal(P.PET_MAX_POWER, 1300); // 강화석(최대 +150)까지 더하면 1300
        const up = P.grantPetExp(pet({ level: 39, exp: 0 }), P.petExpNeed(39));
        assert.equal(up.pet.level, 40);
        assert.equal(up.levelUps, 1);
        const stay = P.grantPetExp(up.pet, 9999);
        assert.equal(stay.pet.level, 40);
        assert.equal(stay.levelUps, 0);
        assert.equal(stay.pet.exp, 0);
    });

    it('회복 기술은 11종 모두 있고 이름이 서로 달라요. Lv.40에 배워요', () => {
        const ids = Object.keys(P.PET_SPECIES);
        assert.equal(ids.length, 11);
        ids.forEach((id) => assert.ok(P.PET_HEAL_SKILLS[id], id));
        assert.equal(new Set(ids.map((id) => P.PET_HEAL_SKILLS[id].name)).size, 11);
        assert.equal(P.petHealSkill('zapowl', 39).learned, false);
        assert.equal(P.petHealSkill('zapowl', 40).learned, true);
        assert.ok(P.petHealText(P.petHealSkill('zapowl', 40)).includes('35%'));
    });
});

describe('펫 상점: 강화석(전투력 +10)', () => {
    const boxOf = (list, extra = {}) => P.sanitizePetBox({ v: 2, slots: list.length, main: 0, list, dex: {}, ...extra });
    const raw = (species, extra = {}) => ({ phase: 'pet', species, stage: 1, level: 5, exp: 0, enhance: 3, full: 60, fedAt: T0, ...extra });

    it('boost 는 10 단위로 내리고 150을 넘지 않아요', () => {
        assert.equal(P.sanitizePet(raw('emberkit', { boost: 37 })).boost, 30);
        assert.equal(P.sanitizePet(raw('emberkit', { boost: 999 })).boost, 150);
        assert.equal(P.sanitizePet(raw('emberkit')).boost, 0);
    });

    it('전투력에 boost 가 더해지고, 최대는 1300이에요', () => {
        assert.equal(P.petPower(P.sanitizePet(raw('emberkit', { boost: 50 }))) - P.petPower(P.sanitizePet(raw('emberkit'))), 50);
        const best = { phase: 'pet', species: 'stardrake', shiny: true, stage: 3, level: 40, enhance: 10, boost: 150 };
        assert.equal(P.petPower(best), 1300);
        assert.equal(P.PET_MAX_POWER, 1300);
    });

    it('강화석 사기: 기본 100봉, 봉이 모자라거나 99개를 넘으면 못 사요', () => {
        assert.equal(P.sanitizePetSettings(null).shop.stone, 100);
        const box = boxOf([raw('emberkit')]);
        const r = P.buyEnhanceStones(box, { count: 5, bong: 600 });
        assert.equal(r.ok, true);
        assert.equal(r.cost, 500);
        assert.equal(r.box.stones, 5);
        assert.equal(P.buyEnhanceStones(box, { count: 5, bong: 499 }).error, 'no_bong');
        assert.equal(P.buyEnhanceStones(boxOf([raw('emberkit')], { stones: 98 }), { count: 2, bong: 9999 }).error, 'stone_full');
        assert.equal(P.buyEnhanceStones(box, { count: 2, bong: 9999, settings: { shop: { stone: 30 } } }).cost, 60);
        assert.equal(P.petErrorText('stone_full'), '강화석은 99개까지 가질 수 있어요.');
    });

    it('강화석 쓰기: 전투력 +10, 강화 단계는 그대로예요', () => {
        const box = boxOf([raw('zapowl'), { phase: 'none' }], { stones: 2 });
        const r = P.useEnhanceStone(box, 0, { now: T0, today: DAY });
        assert.equal(r.ok, true);
        assert.equal(r.box.list[0].boost, 10);
        assert.equal(r.box.stones, 1);
        assert.equal(r.cost, 0);
        assert.equal(r.added, 10);
        assert.equal(r.box.list[0].enhance, 3);
        assert.equal(P.useEnhanceStone(boxOf([raw('zapowl', { boost: 150 })], { stones: 3 }), 0, { now: T0, today: DAY }).error, 'max_boost');
        assert.equal(P.useEnhanceStone(boxOf([raw('zapowl')], { stones: 0 }), 0, { now: T0, today: DAY }).error, 'no_stone');
        const late = T0 + 51 * H + 73 * H;
        assert.equal(P.useEnhanceStone(boxOf([raw('zapowl', { full: 100 })], { stones: 3 }), 0, { now: late, today: DAY }).error, 'away');
        assert.equal(P.useEnhanceStone(box, 1, { now: T0, today: DAY }).error, 'no_pet');
        const max = P.useEnhanceStone(boxOf([raw('zapowl', { enhance: 10 })], { stones: 1 }), 0, { now: T0, today: DAY });
        assert.equal(max.ok, true);
        assert.equal(max.box.list[0].boost, 10);
    });

    it('저장했다 다시 읽어도 강화석과 boost 가 남고, 옛 상자는 둘 다 0이에요', () => {
        const doc = P.petBoxToDoc(boxOf([raw('emberkit', { boost: 40 })], { stones: 7 }));
        const back = P.sanitizePetBox(JSON.parse(JSON.stringify(doc)));
        assert.equal(back.stones, 7);
        assert.equal(back.list[0].boost, 40);
        const old = P.sanitizePetBox({ v: 2, slots: 1, main: 0, list: [raw('emberkit')], dex: {} });
        assert.equal(old.stones, 0);
        assert.equal(old.list[0].boost, 0);
    });

    it('가진 펫을 색다르게 바꿔도 boost 가 그대로예요', () => {
        const r = P.buyShopPet(boxOf([raw('emberkit', { boost: 60 })]), 0, { species: 'emberkit', shiny: true, bong: 9999, now: T0 });
        assert.equal(r.ok, true);
        assert.equal(r.box.list[0].shiny, true);
        assert.equal(r.box.list[0].boost, 60);
    });
});

describe('🔥 불알', async () => {
    const G = await import('./petGame.js');
    it('불알을 깨면 반드시 색다른 펫이 나와요', () => {
        let p = { v: 1, phase: 'egg', taps: G.PET_HATCH_TAPS - 1, fire: true };
        const r = G.warmPetEgg(p, { now: 1, rnd: () => 0.99 });
        assert.equal(r.hatched, true);
        assert.equal(r.pet.shiny, true);
        const n = G.warmPetEgg({ ...p, fire: false }, { now: 1, rnd: () => 0.99 });
        assert.equal(n.pet.shiny, false);
    });
    it('보관함에 넣고 꺼내도 불알은 불알이에요', () => {
        let b = G.sanitizePetBox({ v: 2, slots: 1, list: [{ phase: 'egg', taps: 3, fire: true }] });
        let r = G.storePetEgg(b, 0);
        assert.equal(r.box.fireEggs, 1);
        assert.equal(r.box.eggs, 0);
        r = G.useStoredEgg(G.petBoxToDoc(r.box), 0, { now: 5, fire: true });
        assert.equal(r.ok, true);
        assert.equal(r.box.list[0].fire, true);
        assert.equal(r.box.fireEggs, 0);
        assert.equal(G.useStoredEgg(r.box, 0, { fire: true }).error, 'no_stored_egg');
    });
    it('선물 받기: 일반 알과 불알을 따로 세요', () => {
        const b = G.sanitizePetBox({ v: 2, slots: 1, list: [{}], giftSeen: 2, fireGiftSeen: 0 });
        const r = G.receivePetGifts(b, 4, 1);
        assert.equal(r.box.eggs, 2);
        assert.equal(r.box.fireEggs, 1);
        assert.equal(r.fireGifted, 1);
        assert.equal(G.receivePetGifts(r.box, 4, 1).error, 'no_gift');
        assert.equal(G.receivePetGifts(r.box, 4, 2).box.fireEggs, 2);
    });
    it('선물한 알은 알마다 10% 확률로 불알', () => {
        const seq = [0.05, 0.5, 0.09, 0.1];
        let i = 0;
        assert.equal(G.rollGiftFireEggs(4, () => seq[i++]), 2);
    });
});
