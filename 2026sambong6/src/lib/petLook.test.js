// 색다른 펫 겉모습 바꾸기(그림만 일반 ↔ 색다른) 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as P from './petGame.js';
import * as R from './petRaid.js';
import { petArtHtml } from './petArt.js';

const T0 = new Date(2026, 10, 26, 12).getTime();
const raw = (species, extra = {}) => ({ v: 1, phase: 'pet', species, shiny: false, name: 'x', stage: 2, level: 15, exp: 0, enhance: 3, full: 80, fedAt: T0, bornAt: T0, ...extra });
const boxOf = (list) => P.sanitizePetBox({ v: 2, slots: 3, main: 0, list, dex: {}, cage: [raw('snowbun', { shiny: true, normalLook: true })] });

describe('색다른 펫 겉모습 바꾸기', () => {
    it('색다른 펫은 일반 그림으로 바꾸고 다시 되돌릴 수 있어요(무료)', () => {
        const b = boxOf([raw('emberkit', { shiny: true }), raw('dropotter')]);
        const r = P.setPetLook(b, 0, true);
        assert.equal(r.ok, true);
        assert.equal(r.box.list[0].normalLook, true);
        assert.equal(r.box.list[0].shiny, true);
        assert.equal(P.petShowsShinyArt(r.box.list[0]), false);
        const back = P.setPetLook(r.box, 0, false);
        assert.equal(back.ok, true);
        assert.equal('normalLook' in back.box.list[0], false);
        assert.equal(P.petShowsShinyArt(back.box.list[0]), true);
    });
    it('능력치·전투력·도감은 색다른 펫 그대로예요', () => {
        const b = boxOf([raw('emberkit', { shiny: true })]);
        const before = P.petPower(b.list[0]);
        const r = P.setPetLook(b, 0, true);
        assert.equal(P.petPower(r.box.list[0]), before);
        assert.equal(P.petView(r.box.list[0], T0).power, before);
        assert.deepEqual(r.box.dex, b.dex);
        const m = R.raidMemberFromPet(r.box.list[0], { id: '3', name: '학생3', now: T0 });
        assert.equal(m.shiny, true);
        assert.equal(m.normalLook, true);
        assert.equal(m.power, before);
    });
    it('일반 펫·빈 칸·알은 바꿀 수 없어요', () => {
        const b = boxOf([raw('dropotter'), null, { v: 1, phase: 'egg', taps: 1 }]);
        assert.equal(P.setPetLook(b, 0, true).error, 'not_shiny');
        assert.equal(P.setPetLook(b, 1, true).error, 'no_pet');
        assert.equal(P.setPetLook(b, 2, true).error, 'no_pet');
        assert.equal(P.setPetLook(b, 9, true).error, 'bad_slot');
        assert.ok(P.petErrorText ? P.petErrorText('not_shiny').includes('색다른') : true);
        // 일반 펫에 normalLook 이 붙어 와도 지워요
        assert.equal('normalLook' in P.sanitizePet(raw('dropotter', { normalLook: true })), false);
    });
    it('저장했다 다시 읽어도 유지되고, 필드가 없는 옛 펫은 지금처럼 색다른 그림이에요', () => {
        const r = P.setPetLook(boxOf([raw('emberkit', { shiny: true })]), 0, true);
        const again = P.sanitizePetBox(JSON.parse(JSON.stringify(P.petBoxToDoc(r.box))));
        assert.equal(again.list[0].normalLook, true);
        assert.equal(again.cage[0].normalLook, true); // 케이지에 넣어도 유지
        const old = P.sanitizePet(raw('emberkit', { shiny: true }));
        assert.equal(P.petShowsShinyArt(old), true);
    });
    it('그림: 일반 그림을 골라도 ✨ 표시(is-shiny)는 남고, 파일만 일반 그림이에요', () => {
        const normal = petArtHtml({ species: 'emberkit', stage: 2, shiny: true, normalLook: true });
        assert.ok(normal.includes('is-shiny') && normal.includes('is-normal-look'));
        assert.ok(/emberkit_2\.webp/.test(normal) && !/emberkit_2_s\.webp/.test(normal));
        assert.ok(normal.includes('data-pet-shiny="0"'));
        const shiny = petArtHtml({ species: 'emberkit', stage: 2, shiny: true });
        assert.ok(/emberkit_2_s\.webp/.test(shiny) && !shiny.includes('is-normal-look'));
        const plain = petArtHtml({ species: 'emberkit', stage: 2, normalLook: true });
        assert.ok(!plain.includes('is-shiny') && /emberkit_2\.webp/.test(plain));
    });
    it('탐험 방 정보에도 남고, 일반 펫에는 붙지 않아요', () => {
        const party = R.sanitizeRaidParty({ leaderId: '1', members: [
            { id: '1', species: 'emberkit', stage: 2, level: 15, shiny: true, normalLook: true, power: 400 },
            { id: '2', species: 'dropotter', stage: 2, level: 15, normalLook: true, power: 400 },
        ] });
        assert.equal(party.members[0].normalLook, true);
        assert.equal('normalLook' in party.members[1], false);
    });
});
