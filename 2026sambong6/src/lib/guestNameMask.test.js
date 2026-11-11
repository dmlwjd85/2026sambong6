import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    GUEST_NAME_MASK,
    buildGuestNameRegExp,
    collectGuestMaskNames,
    displayStudentNameFor,
    givenNameFromFullName,
    givenNamesForMask,
    installGuestNameShield,
    isGuestViewer,
    isStudentNameId,
    maskNamesInText,
    splitMaskedText,
} from './guestNameMask.js';

const names = { 1: '홍길동', 2: '김철수', gm: '마스터 J', gm_a: '마스터 A', guest: '손님' };

describe('손님 이름 가리기: 이름 하나 그리기', () => {
    it('손님에게는 학생 이름 대신 가린 글자를 줘요', () => {
        assert.equal(displayStudentNameFor('1', { names, isGuest: true }), GUEST_NAME_MASK);
        assert.equal(displayStudentNameFor(2, { names, isGuest: true }), GUEST_NAME_MASK);
        assert.equal(GUEST_NAME_MASK, '○○○');
    });
    it('로그인한 학생·교사에게는 원래 이름 그대로예요', () => {
        assert.equal(displayStudentNameFor('1', { names, isGuest: false }), '홍길동');
        assert.equal(displayStudentNameFor('9', { names, isGuest: false, fallback: '뒤 이름' }), '뒤 이름');
        assert.equal(displayStudentNameFor('9', { names, isGuest: false }), '9');
    });
    it('교사·보조 교사·손님 이름은 손님에게도 그대로 보여요', () => {
        assert.equal(displayStudentNameFor('gm', { names, isGuest: true }), '마스터 J');
        assert.equal(displayStudentNameFor('gm_a', { names, isGuest: true }), '마스터 A');
        assert.equal(displayStudentNameFor('guest', { names, isGuest: true }), '손님');
    });
    it('손님 판별은 playerState.isGuest만 봐요', () => {
        assert.equal(isGuestViewer({ isGuest: true }), true);
        assert.equal(isGuestViewer({ isGuest: false, isAdmin: true }), false);
        assert.equal(isGuestViewer(null), false);
        assert.equal(isStudentNameId('3'), true);
        assert.equal(isStudentNameId('gm'), false);
        assert.equal(isStudentNameId(''), false);
    });
});

describe('손님 이름 가리기: 글 속 이름 찾기', () => {
    it('명단·이름표·학생 문서 이름을 모으고 교사·손님·자리 이름은 빼요', () => {
        const list = collectGuestMaskNames({
            roster: [{ id: '1', name: '홍길동' }, { id: '2', name: '김철수', active: false }, { id: '3', name: '학생 3' }, { id: 'gm', name: '마스터 J' }],
            nameMap: names,
            students: [{ id: '4', name: '남궁민수' }, { id: '5', name: '이' }],
            staffNames: ['마스터 J', '마스터 A', '담임 선생님'],
        });
        assert.deepEqual(list, ['남궁민수', '김철수', '홍길동']);
    });
    it('상태메시지 속 실명을 가린 글자로 바꿔요(긴 이름부터)', () => {
        const re = buildGuestNameRegExp(['홍길동', '남궁민수', '김철수']);
        assert.equal(maskNamesInText('홍길동이랑 남궁민수, 김철수 같이 놀자', re), '○○○이랑 ○○○, ○○○ 같이 놀자');
        assert.equal(maskNamesInText('홍길동홍길동', re), '○○○○○○');
        assert.equal(maskNamesInText('오늘도 화이팅', re), '오늘도 화이팅');
        // 같은 식을 여러 번 써도 결과가 같아요(lastIndex).
        assert.equal(maskNamesInText('김철수', re), '○○○');
        assert.equal(maskNamesInText('김철수', re), '○○○');
    });
    it('특수 문자가 든 이름도 안전하게 찾아요', () => {
        const re = buildGuestNameRegExp(['A.B(1)', '홍길동']);
        assert.equal(maskNamesInText('A.B(1) 와 AxB(1)', re), '○○○ 와 AxB(1)');
    });
    it('이름이 없으면 찾기 식이 없고 글은 그대로예요', () => {
        assert.equal(buildGuestNameRegExp([]), null);
        assert.equal(buildGuestNameRegExp(['이']), null);
        assert.equal(maskNamesInText('홍길동', null), '홍길동');
        assert.equal(maskNamesInText(null, null), '');
    });
    it('가린 글자를 흐림 span 조각으로 나눠요', () => {
        assert.deepEqual(splitMaskedText('1. ○○○'), [{ mask: false, text: '1. ' }, { mask: true, text: '○○○' }]);
        assert.deepEqual(splitMaskedText('○○○이랑 ○○○'), [
            { mask: true, text: '○○○' }, { mask: false, text: '이랑 ' }, { mask: true, text: '○○○' },
        ]);
        assert.deepEqual(splitMaskedText('없어요'), [{ mask: false, text: '없어요' }]);
    });
    it('지킴이는 문서가 없으면 아무것도 하지 않아요', () => {
        assert.equal(installGuestNameShield(null, { getNames: () => [] }), null);
        assert.equal(installGuestNameShield({ documentElement: {} }, {}), null);
    });
});

describe('손님 이름 가리기: 띄어 쓴 이름과 이름만 쓴 경우', () => {
    it('명단에 빈칸이 있는 성+이름도 빈칸 없는 이름으로 모아요', () => {
        const list = collectGuestMaskNames({
            roster: [{ id: '1', name: '윤 지아' }, { id: '2', name: '강서준' }],
        });
        assert.deepEqual(list, ['강서준', '윤지아']);
    });
    it('세 글자·네 글자 한글 이름에서 두 글자 이름을 꺼내요', () => {
        assert.equal(givenNameFromFullName('윤지아'), '지아');
        assert.equal(givenNameFromFullName('윤 지아'), '지아');
        assert.equal(givenNameFromFullName('강서준'), '서준');
        assert.equal(givenNameFromFullName('남궁하린'), '하린');
        assert.equal(givenNameFromFullName('제갈민호'), '민호');
        assert.equal(givenNameFromFullName('이'), '');
        assert.equal(givenNameFromFullName('지아'), '');
    });
    it('띄어 쓴 성+이름을 가린 글자로 바꿔요', () => {
        const re = buildGuestNameRegExp(['윤지아', '강서준']);
        assert.equal(maskNamesInText('윤 지아 고마워', re), '○○○ 고마워');
        assert.equal(maskNamesInText('윤지아 고마워', re), '○○○ 고마워');
        assert.equal(maskNamesInText('강서준 고마워', re), '○○○ 고마워');
        assert.equal(maskNamesInText('강 서 준 최고', re), '○○○ 최고');
    });
    it('두 글자 이름은 한글이 앞뒤에 이어지지 않을 때만 가려요', () => {
        const re = buildGuestNameRegExp(['윤지아', '강서준', '한도윤', '김현수']);
        assert.deepEqual(givenNamesForMask(['윤지아', '강서준', '한도윤', '김현수']), ['도윤', '서준', '지아', '현수']);
        assert.equal(maskNamesInText('지아 서준 도윤', re), '○○○ ○○○ ○○○');
        assert.equal(maskNamesInText('지아', re), '○○○');
        // 호칭·다른 낱말 속에서는 가리지 않아요.
        assert.equal(maskNamesInText('지아야', re), '지아야');
        assert.equal(maskNamesInText('현수막', re), '현수막');
        assert.equal(maskNamesInText('현수 최고', re), '○○○ 최고');
    });
    it('보통 말로 자주 쓰는 두 글자 이름은 가리지 않아요', () => {
        const re = buildGuestNameRegExp(['박최고', '김오늘', '이친구']);
        assert.deepEqual(givenNamesForMask(['박최고', '김오늘', '이친구']), []);
        assert.equal(maskNamesInText('오늘 최고', re), '오늘 최고');
        assert.equal(maskNamesInText('친구 최고', re), '친구 최고');
        assert.equal(maskNamesInText('박최고 최고', re), '○○○ 최고');
    });
});

describe('손님 이름 가리기: 앱 연결', () => {
    const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
    it('구경만 하기에서 첫 화면 전에 지킴이를 켜고, 로그인 세션은 켜지 않아요', () => {
        const start = src.indexOf('window.loginAsGuest = function()');
        const end = src.indexOf('function clearLoginStorageKeepingClass', start);
        const body = src.slice(start, end);
        assert.ok(body.indexOf('startGuestNameShield()') > 0);
        assert.ok(body.indexOf('startGuestNameShield()') < body.indexOf('updateUI()'));
        assert.equal(body.includes('_sambongLoggedIn = true'), false);
    });
    it('지킴이는 손님일 때만 돌아요', () => {
        const start = src.indexOf('function startGuestNameShield()');
        const body = src.slice(start, src.indexOf('function getActiveStudentIds', start));
        assert.match(body, /isActive: isGuestNameMaskOn/);
        assert.match(body, /!isGuestNameMaskOn\(\)\) return/);
    });
    it('광장 카드 번호 줄·상태메시지·퀘스트 표·명예의 전당이 이름 함수를 거쳐요', () => {
        assert.match(src, /isGuestNameMaskOn\(\) && isStudentNameId\(sid\)\)\s*\n\s*\? GUEST_NAME_MASK/);
        assert.match(src, /guestSafeText\(sanitizeStatusMessage\(data && data\.statusMessage\)\)/);
        assert.match(src, /displayStudentName\(sid\) : '-'/);
        assert.match(src, /displayStudentName\(s\.id, s\.name\)/);
    });
});
