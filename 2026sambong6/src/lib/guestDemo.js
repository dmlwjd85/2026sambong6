/**
 * 구경만 하기 세션용 가짜 학급.
 * 실명·실잔액·실제 상태문구를 넣지 않습니다.
 */

export const GUEST_DEMO_CLASS_NAME = '데모 반';

const DEMO_GIVEN = ['하늘', '바다', '나무', '별빛', '구름', '노을', '이슬', '바람'];

export function buildGuestDemoRoster() {
    return DEMO_GIVEN.map((name, index) => ({
        id: String(index + 1),
        name: `데모 ${name}`,
        gender: index % 2 === 0 ? 'M' : 'F',
        label: '',
        active: true,
    }));
}

export function buildGuestDemoClassMeta() {
    return {
        classId: 'guest-demo',
        displayName: GUEST_DEMO_CLASS_NAME,
        inviteCode: '',
        isDemoSeed: false,
        isGuestDemo: true,
        roster: buildGuestDemoRoster(),
        staff: [
            {
                id: 'gm',
                name: '데모 선생님',
                gender: 'M',
                role: 'teacher',
                label: '담임',
                optionClass: '',
                emoji: '',
            },
        ],
        schoolName: '',
        masterDisplayName: '데모 선생님',
    };
}

export function buildGuestDemoStudents() {
    return buildGuestDemoRoster().map((row, index) => ({
        id: row.id,
        name: row.name,
        xp: 900 + index * 380,
        bong: 24 + index * 6,
        jobs: index % 3 === 0
            ? [{ id: 'demo-lib', name: '도서부', icon: 'book', color: '', pay: 4 }]
            : [],
        statusMessage: index % 2 === 0 ? '데모 상태' : '',
        ownedSkins: {},
        equippedSkins: {},
        inventory: [],
        quests: {},
        unlockedQuests: {},
        hasShield: false,
        shieldHP: 0,
        lunchBid: { date: '', amount: 0 },
    }));
}

export function buildGuestDemoTeacher() {
    return {
        id: 'gm',
        name: '데모 선생님',
        xp: 12000,
        bong: 0,
        jobs: [],
        statusMessage: '',
        ownedSkins: {},
        equippedSkins: {},
    };
}

export function buildGuestPlayerState() {
    return {
        xp: 2400,
        bong: 80,
        quests: {},
        unlockedQuests: {},
        jobs: [{ name: '구경꾼', icon: 'eye', color: '', pay: 0 }],
        ownedSkins: {},
        equippedSkins: {},
        hasShield: false,
        shieldHP: 0,
        inventory: [],
        equippedWeapon: null,
        equippedShield: null,
        equippedShoes: null,
        gearEnhance: {},
        lunchBid: { date: '', amount: 0 },
        questHistory: [],
        usedRaidPasswords: [],
        dragonBalls: [],
        dragonBallWeekendKey: '',
        bankRegularSavings: 0,
        bankTermDeposits: [],
        bankDailyBonusLastDate: '',
        bankLoan: null,
        creditDefaultUntilYmd: '',
        bankNegativeSinceYmd: '',
        dailyAllClearBonusDate: '',
        stockInvestments: { kospi: null, kosdaq: null, nasdaq: null },
        stockInvestDaily: { date: '', profit: 0, sells: 0 },
        catBattle: { cleared: 0, friends: [], dailyDate: '', dailyWins: 0 },
        statusMessage: '데모 상태',
        isGuest: true,
        isGM: false,
        isGMA: false,
        isAdmin: false,
    };
}

/** 게스트 세션에서는 Firestore 쓰기를 열지 않습니다. */
export function guestMayWrite(playerState, demoActive) {
    if (demoActive) return false;
    return !(playerState && playerState.isGuest);
}
