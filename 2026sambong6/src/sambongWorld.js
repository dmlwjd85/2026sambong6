import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    getDocFromServer,
    updateDoc,
    collection,
    onSnapshot,
    getDocs,
    getDocsFromServer,
    writeBatch,
    increment,
    runTransaction,
    arrayUnion,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

/** 마스터 지급 등: 로컬 캐시가 아닌 서버 최신 문서를 읽어 합산(캐시 기준 덮어쓰기로 새로고침 후 수치가 되돌아가는 현상 방지) */
async function readStudentDocPreferServer(ref) {
    try {
        return await getDocFromServer(ref);
    } catch (e) {
        return await getDoc(ref);
    }
}

/**
 * 광장 일괄 지급 등 배치 저장 직후, 스냅샷보다 먼저 화면에 반영하기 위해 학생 컬렉션을 서버 기준으로 다시 읽습니다.
 * (onSnapshot과 로직을 맞춤 — 문서 id 기준 id 필드 복구)
 */
async function refreshStudentsCacheFromServer() {
    if (!db) return;
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
    let snap;
    try {
        snap = await getDocsFromServer(colRef);
    } catch (e) {
        console.warn('refreshStudentsCacheFromServer getDocsFromServer', e);
        snap = await getDocs(colRef);
    }
    const students = [];
    let gmD = null;
    let gmaD = null;
    snap.forEach((d) => {
        const row = d.data();
        if (d.id === 'student_gm') {
            gmD = { ...row, id: 'gm' };
        } else if (d.id === 'student_gm_a') {
            gmaD = { ...row, id: 'gm_a' };
        } else {
            students.push({ ...row, id: String(d.id.replace('student_', '')) });
        }
    });
    window.allStudentsData = students;
    window.gmData = gmD;
    window.gmaData = gmaD;

    const myId = localStorage.getItem('sambong_student_id');
    if (myId && window.playerState && !window.playerState.isGuest) {
        const myData = myId === 'gm' ? gmD : myId === 'gm_a' ? gmaD : students.find((s) => String(s.id) === String(myId));
        if (myData) {
            window.playerState = {
                ...myData,
                isGuest: false,
                isGM: myId === 'gm',
                isGMA: myId === 'gm_a',
                isAdmin: myId === 'gm' || myId === 'gm_a',
            };
            if (window.playerState.bong != null) window.playerState.bong = normalizeBongValue(window.playerState.bong);
            _prevXpFromSnapshot = Number(window.playerState.xp) || 0;
            updateUI();
        }
    }

    if (window.playerState && window.playerState.isAdmin) {
        window.renderAdminTable(students);
        window.renderAdminQuestBoard(students);
    }
    window.renderPlaza(students, gmD, gmaD);
    window.renderHallOfFame(students);
    window.renderLunchQueue(students);
}

/** quickReward 직후 단일 학생 문서를 캐시에 반영해 광장 카드 수치가 즉시 바뀌게 함 */
function mergeStudentDocIntoPlazaCache(sid, raw) {
    if (!raw) return;
    const id = String(sid);
    const row = {
        ...raw,
        bong: raw.bong != null ? normalizeBongValue(raw.bong) : raw.bong,
    };
    if (id === 'gm') {
        window.gmData = { ...window.gmData, ...row, id: 'gm' };
        return;
    }
    if (id === 'gm_a') {
        window.gmaData = { ...window.gmaData, ...row, id: 'gm_a' };
        return;
    }
    const list = window.allStudentsData;
    if (!list || !list.length) return;
    const i = list.findIndex((s) => String(s.id) === id);
    if (i < 0) return;
    list[i] = { ...list[i], ...row, id: String(list[i].id) };
}

function redrawPlazaGrantsUi() {
    if (!window.playerState || !window.playerState.isAdmin) return;
    window.renderPlaza(window.allStudentsData, window.gmData, window.gmaData);
    if (window.renderAdminTable) window.renderAdminTable(window.allStudentsData);
}

// ==========================================
        // ★ 웹 오디오 API 효과음 로직 ★
        // ==========================================
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        function playSfx(type, isPositive) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            const now = audioCtx.currentTime;
            
            if (type === 'xp') {
                osc.type = 'sine';
                if (isPositive) {
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
                    gainNode.gain.setValueAtTime(0.3, now);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                } else {
                    osc.frequency.setValueAtTime(300, now);
                    osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
                    gainNode.gain.setValueAtTime(0.3, now);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                }
            } else if (type === 'bong') {
                if (isPositive) {
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.setValueAtTime(900, now + 0.05);
                    gainNode.gain.setValueAtTime(0.1, now);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                } else {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, now);
                    gainNode.gain.setValueAtTime(0.2, now);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                }
            }
        }

        // ==========================================
        // ★ 시즌 타이머 로직 ★
        // ==========================================
        function updateSeasonTimer() {
            const timerEl = document.getElementById('seasonTimerDisplay');
            if (!timerEl) return;
            const seasonEnd = new Date('2027-01-06T00:00:00'); 
            const now = new Date();
            const diff = seasonEnd - now;

            if (diff <= 0) {
                timerEl.innerText = "시즌 종료!";
                timerEl.classList.replace('text-emerald-400', 'text-sb-red');
                return;
            }
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / 1000 / 60) % 60);
            timerEl.innerText = `${d}일 ${h}시간 ${m}분`;
        }
        setInterval(updateSeasonTimer, 60000); 
        updateSeasonTimer(); 

        // ==========================================
        // ★ 환경 설정 및 데이터 정의 ★
        // ==========================================
        const BASE_BOSS_HP = 500;
        const RAID_REWARD = { xp: 500, bong: 50 };
        const RAID_TURN_MS = 20000;
        const RAID_CRITICAL_MS = 10000;
        const RAID_SUCCESS_REWARD_XP = 150;
        const RAID_SUCCESS_REWARD_BONG = 30;

        const EMOTIONS = [
            { id: 'e1', icon: '😄', label: '기쁨', color: 'text-yellow-400' }, { id: 'e2', icon: '😊', label: '평온', color: 'text-emerald-400' },
            { id: 'e3', icon: '😢', label: '슬픔', color: 'text-blue-400' }, { id: 'e4', icon: '😡', label: '화남', color: 'text-red-400' },
            { id: 'e5', icon: '🥱', label: '피곤', color: 'text-slate-400' }, { id: 'e6', icon: '🤒', label: '아픔', color: 'text-purple-400' }
        ];
        
        const BODY_STATES = [
            { val: 1, label: '방전', icon: 'fa-battery-empty', color: 'text-red-500' }, { val: 2, label: '피로', icon: 'fa-battery-quarter', color: 'text-orange-400' },
            { val: 3, label: '보통', icon: 'fa-battery-half', color: 'text-yellow-400' }, { val: 4, label: '쌩쌩', icon: 'fa-battery-three-quarters', color: 'text-green-400' },
            { val: 5, label: '최상', icon: 'fa-battery-full', color: 'text-emerald-500' }
        ];

        const WEAPON_DATA = [
            { id: 'wp1', name: '나뭇가지', desc: '데미지 +10', bonus: 10, emoji: '🌿', border: 'border-amber-700', bg: 'bg-amber-900/40' },
            { id: 'wp2', name: '낡은 단검', desc: '데미지 +20', bonus: 20, emoji: '🗡️', border: 'border-slate-500', bg: 'bg-slate-700/40' },
            { id: 'wp3', name: '기사의 검', desc: '데미지 +35', bonus: 35, emoji: '⚔️', border: 'border-blue-400', bg: 'bg-blue-900/40' },
            { id: 'wp4', name: '마법 지팡이', desc: '데미지 +50', bonus: 50, emoji: '🪄', border: 'border-purple-500', bg: 'bg-purple-900/40' },
            { id: 'wp5', name: '화염의 성검', desc: '데미지 +80', bonus: 80, emoji: '🔥', border: 'border-red-500', bg: 'bg-red-900/40' }
        ];

        const JOB_DATA = [
            { id: 'job_sp', name: '학생회 연합대장', sub: '(전교회장)', icon: 'fa-crown', color: 'text-amber-400', pay: 15, desc: '학교의 평화 리더' },
            { id: 'job_svp', name: '학생회 부대장', sub: '(전교부회장)', icon: 'fa-shield-cat', color: 'text-amber-200', pay: 12, desc: '학교의 든든한 방패' },
            { id: 'job1', name: '길드 마스터', sub: '(학급회장)', icon: 'fa-flag', color: 'text-yellow-300', pay: 12, desc: '길드 통솔, 회의 진행' },
            { id: 'job2', name: '길드 매니저', sub: '(학급부회장)', icon: 'fa-star-half-stroke', color: 'text-yellow-100', pay: 10, desc: '규칙 수호 및 보조' },
            { id: 'job_vac', name: '블랙홀 마스터', sub: '(청소기)', icon: 'fa-wind', color: 'text-teal-400', pay: 8, desc: '강력한 흡입 마법' },
            { id: 'job3', name: '심연의 청소부', sub: '(일반쓰레기)', icon: 'fa-trash-can', color: 'text-stone-400', pay: 7, desc: '일반 쓰레기 정화' },
            { id: 'job4', name: '체력물약 보급관', sub: '(우유 배식)', icon: 'fa-glass-water', color: 'text-blue-400', pay: 6, desc: '매일 아침 우유 보급' },
            { id: 'job5', name: '역사 기록관', sub: '(칠판 관리)', icon: 'fa-chalkboard', color: 'text-slate-400', pay: 5, desc: '칠판 지우기 및 정돈' },
            { id: 'job6', name: '시스템 매니저', sub: '(기기 관리)', icon: 'fa-desktop', color: 'text-cyan-400', pay: 6, desc: '메인 서버/스크린 관리' },
            { id: 'job7', name: '자원 연금술사', sub: '(분리수거)', icon: 'fa-recycle', color: 'text-sb-green', pay: 7, desc: '철저한 분리수거' },
            { id: 'job8', name: '마나 충전소', sub: '(스마트패드)', icon: 'fa-tablet-screen-button', color: 'text-purple-400', pay: 6, desc: '패드 충전 및 정리' },
            { id: 'job9', name: '빛의 파수꾼', sub: '(소등 관리)', icon: 'fa-lightbulb', color: 'text-yellow-400', pay: 5, desc: '교실 불 끄기 및 절전' },
            { id: 'job10', name: '삼봉은행', sub: '(금융 관리)', icon: 'fa-piggy-bank', color: 'text-pink-400', pay: 6, desc: '화폐 관리 및 세금' },
            { id: 'job11', name: '생명의 수호자', sub: '(식물/환기)', icon: 'fa-leaf', color: 'text-emerald-500', pay: 5, desc: '화분 물주기, 환기' },
            { id: 'job12', name: '편의점 매니저', sub: '(비품 관리)', icon: 'fa-store', color: 'text-orange-400', pay: 6, desc: '상점 및 비품 정리' }
            ,{ id: 'job_book', name: '마법서 관리관', sub: '(교과서 세팅)', icon: 'fa-book-skull', color: 'text-purple-300', pay: 6, desc: '선생님 교과서/자료 세팅 도우미' }
            ,{ id: 'job_newbie', name: '뉴비 매니저', sub: '(전담 마크)', icon: 'fa-hand-holding-heart', color: 'text-pink-300', pay: 6, desc: '도움이 필요한 친구 전담 도우미' }
        ];

        const QUEST_DATA = [
            { id: 'q1', type: 'daily', name: '출석의 축복', desc: '8:40 전 등교', xp: 10, bong: 0.5, icon: 'fa-sun', color: 'text-yellow-200' },
            { id: 'q4', type: 'daily', name: '뉴비 도우미', desc: '라온반/친구 지원', xp: 50, bong: 7.0, icon: 'fa-hands-holding-child', color: 'text-pink-300' },
            { id: 'q6', type: 'daily', name: '다리 근력', desc: '스쿼트 50회', xp: 20, bong: 5.0, icon: 'fa-dumbbell', color: 'text-blue-300' },
            { id: 'q7', type: 'daily', name: '밸런스 강화', desc: '밸런스 보드 30초', xp: 20, bong: 5.0, icon: 'fa-person-snowboarding', color: 'text-emerald-300' },
            { id: 'q10', type: 'daily', name: '팔 근력', desc: '팔굽혀펴기 20회', xp: 20, bong: 5.0, icon: 'fa-child-reaching', color: 'text-orange-300' },
            { id: 'q8', type: 'daily', name: '잔반 제로', desc: '급식 다 먹기', xp: 20, bong: 2.0, icon: 'fa-utensils', color: 'text-orange-300' },
            { id: 'q9', type: 'daily', name: '클린 스위퍼', desc: '쓰레기 줍기(3개)', xp: 30, bong: 3.0, icon: 'fa-broom', color: 'text-teal-300' },
            { id: 'q_tooth', type: 'daily', name: '양치하기', desc: '아침·저녁 양치', xp: 10, bong: 0.5, icon: 'fa-tooth', color: 'text-cyan-200' },
            { id: 'q_bb_adv', type: 'daily', name: '밸런스 보드 (고급)', desc: '고급 코스 1세트', xp: 25, bong: 5.5, icon: 'fa-gauge-high', color: 'text-emerald-400' },
            { id: 'q_bb_sq', type: 'daily', name: '밸런스 + 스쿼트', desc: '밸런스 보드 후 스쿼트 20회', xp: 25, bong: 6.0, icon: 'fa-fire', color: 'text-orange-400' },
            { id: 'q2', type: 'weekly', name: '연속 등교 보너스', desc: '일주일 무단결석 X', xp: 50, bong: 2.0, icon: 'fa-calendar-check', color: 'text-white' },
            { id: 'q_sci', type: 'locked', name: '던전 레이드(과학)', desc: '과학 전담 완벽 공략', xp: 100, bong: 5.0, icon: 'fa-flask', color: 'text-purple-300' },
            { id: 'q_prac', type: 'locked', name: '던전 레이드(실과)', desc: '실과 전담 완벽 공략', xp: 100, bong: 5.0, icon: 'fa-hammer', color: 'text-purple-300' },
            { id: 'q_eng', type: 'locked', name: '던전 레이드(영어)', desc: '영어 전담 완벽 공략', xp: 100, bong: 5.0, icon: 'fa-language', color: 'text-purple-300' },
            { id: 'q_dan', type: 'locked', name: '던전 레이드(단소)', desc: '단소 시간 완벽 공략', xp: 100, bong: 5.0, icon: 'fa-music', color: 'text-purple-300' },
            { id: 'q_the', type: 'locked', name: '던전 레이드(연극)', desc: '연극 시간 완벽 공략', xp: 100, bong: 5.0, icon: 'fa-masks-theater', color: 'text-purple-300' },
            { id: 'q_teacher', type: 'locked', name: '일일교사 레이드', desc: '담임·전담 교사 시간 완벽 공략', xp: 100, bong: 5.0, icon: 'fa-person-chalkboard', color: 'text-amber-300' },
            { id: 'q5', type: 'locked', name: '보스전 (평가)', desc: '평가 성적 향상', xp: 500, bong: 20.0, icon: 'fa-scroll', color: 'text-red-300' }
        ];

        const SKIN_DATA = [
            { id: 'f_ninja', type: 'face', name: '닌자', desc: '어둠의 암살자', price: 200, emoji: '🥷' },
            { id: 'f_fairy', type: 'face', name: '요정', desc: '숲의 신비', price: 250, emoji: '🧚‍♀️' },
            { id: 'f_astroM', type: 'face', name: '우주탐험가', desc: '미지의 세계', price: 250, emoji: '👨‍🚀' },
            { id: 'f_vamp', type: 'face', name: '뱀파이어', desc: '밤의 지배자', price: 300, emoji: '🧛‍♂️' },
            { id: 'f_mer', type: 'face', name: '인어', desc: '심해의 여왕', price: 300, emoji: '🧜‍♀️' },
            { id: 'f_king', type: 'face', name: '국왕', desc: '왕국 통치자', price: 400, emoji: '🤴' },
            { id: 'f_queen', type: 'face', name: '여왕', desc: '우아한 통치자', price: 400, emoji: '👸' },
            { id: 'sk1', type: 'overlay', name: '마법사 모자', desc: '지능 상승', price: 100, emoji: '🎩', overlayClass: 'top-[-0.6em] right-[-0.2em] text-[0.8em] rotate-[15deg]' },
            { id: 'sk2', type: 'overlay', name: '선글라스', desc: '인싸 아이템', price: 100, emoji: '🕶️', overlayClass: 'top-[0.25em] left-[-0.05em] text-[1.1em]' },
            { id: 'sk3', type: 'overlay', name: '귀걸이', desc: '매력 스탯', price: 100, emoji: '💎', overlayClass: 'bottom-[0.1em] right-[-0.2em] text-[0.5em]' },
            { id: 'sk_red', type: 'aura', name: '레드 오라', desc: '열정 테두리', price: 100, emoji: '🔴', border: 'border-red-500', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.7)]' },
            { id: 'sk_yel', type: 'aura', name: '옐로우 오라', desc: '빛 테두리', price: 100, emoji: '🟡', border: 'border-yellow-400', glow: 'shadow-[0_0_15px_rgba(250,204,21,0.7)]' },
            { id: 'sk_blu', type: 'aura', name: '블루 오라', desc: '바다 테두리', price: 100, emoji: '🔵', border: 'border-blue-500', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.7)]' }
        ];

        const SHOP_DATA = [
            { id: 'item_random', name: '랜덤 박스', desc: '50B로 0~100B 행운을!', price: 50, icon: 'fa-box-open', iconColor: 'text-yellow-400', isConsumable: true },
            { id: 'item_xp_pack', name: '경험치 팩', desc: '20B로 즉시 100 XP 획득', price: 20, icon: 'fa-bolt', iconColor: 'text-amber-400', isConsumable: true },
            { id: 'item_mystery_dice', name: '미스테리 박스(주사위)', desc: '1~6 숫자에 투자! 맞추면 투자금의 5배!', price: 0, icon: 'fa-dice-six', iconColor: 'text-emerald-400', isConsumable: true },
            { id: 'item_shield', name: '절대 방패', desc: '차감 방어(내구100)', price: 50, icon: 'fa-shield-halved', iconColor: 'text-indigo-400', isConsumable: true },
            { id: 's1', name: '뮤직 타임', desc: '신청곡 틀기', price: 15, icon: 'fa-music', iconColor: 'text-pink-400' },
            { id: 's2', name: '보드게임시간', desc: '삼삼오오 게임', price: 300, icon: 'fa-dice', iconColor: 'text-purple-400' },
            { id: 's_movie', name: '영화시간', desc: '다같이 영화 시청', price: 400, icon: 'fa-film', iconColor: 'text-blue-400' },
            { id: 's4', name: '체육시간', desc: '다같이 뛰놀기', price: 500, icon: 'fa-volleyball', iconColor: 'text-orange-400' },
            { id: 's7', name: '레전더리 타임', desc: '학급 전체 자유시간', price: 2000, icon: 'fa-crown', iconColor: 'text-sb-red' }
        ];

        const LEVEL_DATA = [
            { max: 1499, name: '새내기', prop: '🥚', borderColor: 'border-slate-600', bgColor: 'bg-slate-800', textColor: 'text-slate-400', anim: 'avatar-bounce' },
            { max: 4499, name: '초보', prop: '🐣', borderColor: 'border-sb-green', bgColor: 'bg-green-900/30', textColor: 'text-sb-green', anim: 'avatar-bounce' },
            { max: 9999, name: '중수', prop: '🐥', borderColor: 'border-blue-400', bgColor: 'bg-blue-900/30', textColor: 'text-blue-400', anim: 'avatar-bounce' },
            { max: 21999, name: '고수', prop: '🦅', borderColor: 'border-yellow-500', bgColor: 'bg-yellow-900/30', textColor: 'text-yellow-500', anim: 'avatar-flex' },
            { max: 39999, name: '수호자', prop: '☄️', borderColor: 'border-purple-500', bgColor: 'bg-purple-900/30', textColor: 'text-purple-400', anim: 'avatar-float' },
            { max: Infinity, name: '전설', prop: '🐦‍🔥', borderColor: 'border-sb-red', bgColor: 'bg-red-900/30', textColor: 'text-sb-red', anim: 'avatar-legend' }
        ];

        const STUDENT_NAMES = { 
            "1": "김단엘", "2": "김라희", "3": "김민지", "4": "김정훈", 
            "5": "박문경", "6": "박소윤", "7": "박하율", "8": "박현수", 
            "9": "백시율", "10": "임은영", "11": "조이담", "12": "황훈태", "13": "석서영", 
            "gm": "마스터 J", "gm_a": "마스터 A", "guest": "손님" 
        };
        const STUDENT_GENDERS = { 
            "1": "M", "2": "F", "3": "F", "4": "M", "5": "M", "6": "F", 
            "7": "F", "8": "M", "9": "M", "10": "F", "11": "M", "12": "M", 
            "13": "F", "gm": "M", "gm_a": "F", "guest": "M" 
        };

        /** 유니코드 주사위 면(⚀~⚅) — 미스테리 박스 UI용 */
        const DICE_UNICODE_FACES = ['\u2680','\u2681','\u2682','\u2683','\u2684','\u2685'];

        /** 석서영(학번 13) 부동산 복구용 자리 인덱스(0부터). 8번 자리 = 인덱스 7. */
        const ESTATE_RESTORE_SEOK_SEAT_INDEX = 7;

        /** 화면에서 제거할 자리(표시 번호 1, 13, 16 → 0부터 인덱스 0, 12, 15) */
        const ESTATE_HIDDEN_SEAT_IDS = [0, 12, 15];

        /** 부동산 초기 16칸 (1·13·16번 자리는 사용 안 함) */
        function buildInitialEstateSeats() {
            return Array.from({ length: 16 }, (_, i) => {
                const hide = ESTATE_HIDDEN_SEAT_IDS.includes(i);
                return { id: i, owner: null, price: 500, locked: hide, hidden: hide };
            });
        }

        window.playerState = { 
            xp: 0, bong: 0.0, quests: {}, unlockedQuests: {}, jobs: [], 
            ownedSkins: {}, equippedSkins: {}, hasShield: false, shieldHP: 0, 
            condition: null, dragonBalls: [], dragonBallWeekendKey: '', inventory: [], equippedWeapon: null, lunchBid: {date: '', amount: 0}, lastLunchDeductDate: '', questHistory: [], usedRaidPasswords: [],
            bankRegularSavings: 0, bankTermDeposits: [], bankDailyBonusLastDate: '', dailyAllClearBonusDate: '',
            isGuest: false, isGM: false, isGMA: false, isAdmin: false 
        };
        
        window.allStudentsData = []; 
        window.gmData = null; 
        window.gmaData = null; 
        window.globalSettings = { raidPassword: '1234', shieldStock: 10, lastAutoXpTime: '' };
        /** 공동구매 풀 스냅샷: shopId → { contributions: { 학번: B } } */
        window.shopGroupBuyPools = {};
        
        let db, auth, storage, currentStudentDocRef = null, unsubscribeGlobal = null, unsubscribeSettings = null, unsubscribeRaid = null, unsubscribeDragonBall = null;
        let unsubscribeGoldenBell = null;
        let unsubscribeMasterQuiz = null;
        let unsubscribeShopGroupBuy = null;
        /** Firestore artifacts 세그먼트 — 콘솔 실제 경로와 다르면 로드 전 window.__app_id 로 지정 */
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'sambong-class-2026';

        /**
         * Firestore 규칙이 request.auth != null 일 때, 로그인 직후 토큰이 아직 안 붙은 채로 쓰기하면 permission-denied가 날 수 있음.
         * authStateReady + 익명 로그인 후 getIdToken()으로 토큰을 확실히 받은 뒤에만 true.
         */
        async function ensureAnonAuthReady() {
            if (!auth) return false;
            const tryOnce = async () => {
                await auth.authStateReady();
                if (!auth.currentUser) await signInAnonymously(auth);
                const u = auth.currentUser;
                if (!u) return false;
                await u.getIdToken();
                return true;
            };
            try {
                return await tryOnce();
            } catch (e) {
                console.warn('ensureAnonAuthReady', e);
                try {
                    await new Promise((r) => setTimeout(r, 450));
                    return await tryOnce();
                } catch (e2) {
                    console.warn('ensureAnonAuthReady 재시도 실패', e2);
                    return false;
                }
            }
        }

        /** 서버 스냅샷으로 XP가 올라온 경우 안내(수업 자동 XP 등) — 직전 저장과 구분 */
        let _prevXpFromSnapshot = null;

        /** 학급 상점(s1 등) ID */
        function isClassShopId(id) {
            return id === 's1' || id === 's2' || id === 's_movie' || id === 's4' || id === 's7';
        }

        /** 상점 기본가(SHOP_DATA) — 마스터가 저장한 shopPrices와 병합 시 기준 */
        function getDefaultShopPrice(shopId) {
            const s = SHOP_DATA.find((x) => x.id === shopId);
            return s ? Number(s.price) || 0 : 0;
        }

        /** Firestore settings.global.shopPrices 우선, 없으면 SHOP_DATA 기본가 */
        function getEffectiveShopPrice(shopId) {
            const sp = window.globalSettings && window.globalSettings.shopPrices;
            if (sp && sp[shopId] != null && Number.isFinite(Number(sp[shopId])) && Number(sp[shopId]) >= 0) {
                return Math.round(Number(sp[shopId]) * 10) / 10;
            }
            return getDefaultShopPrice(shopId);
        }

        /** 플레이어 총 XP가 낮을수록 1에 가깝게 — 퀘스트 무기 드랍 보정 등에 사용 */
        function getLowXpBoostFactor(xp) {
            const x = Math.max(0, Number(xp) || 0);
            return Math.max(0, Math.min(1, 1 - x / 30000));
        }

        /** 상점 카드에 표시되는 가격 라벨 갱신(마스터 가격 변경 반영) */
        function updateShopPriceLabels() {
            SHOP_DATA.forEach((shop) => {
                const el = document.getElementById(`shop-price-${shop.id}`);
                if (el) el.textContent = `${getEffectiveShopPrice(shop.id)} B`;
            });
        }

        /** XP 동기화 힌트(학생용, 알림 스팸 방지) */
        function showXpSyncHintFromServer(delta) {
            if (window.playerState && window.playerState.isAdmin) return;
            const el = document.getElementById('xpSyncHint');
            if (!el) return;
            el.textContent = `서버에서 XP가 +${delta} 반영됐어요. (수업 자동 지급·다른 기기·퀘스트 저장 등)`;
            el.classList.remove('hidden');
            clearTimeout(window._xpSyncHintTimer);
            window._xpSyncHintTimer = setTimeout(() => el.classList.add('hidden'), 10000);
        }

        function buildShopCardHtml(shop) {
            const safeName = String(shop.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const groupBuyBtn =
                shop.id === 'item_mystery_dice'
                    ? ''
                    : `<button type="button" class="flex-1 min-w-[4.5rem] bg-cyan-900/80 hover:bg-cyan-800 text-cyan-100 text-[10px] font-bold py-2 px-2 rounded-lg border border-cyan-600" onclick="event.stopPropagation();window.openShopGroupBuyModal('${shop.id}')">공동구매</button>`;
            return `
                <div id="shop-btn-${shop.id}" class="shop-btn bg-slate-800/80 p-3 rounded-xl border-2 flex flex-col gap-2 unaffordable">
                    <div class="flex items-center gap-3">
                        <div class="bg-slate-900 w-10 h-10 rounded-full flex items-center justify-center ${shop.iconColor} shadow-inner shrink-0">
                            <i class="fa-solid ${shop.icon}"></i>
                        </div>
                        <div class="flex-grow min-w-0">
                            <div class="font-bold text-sm">${shop.name}</div>
                            <div class="text-[10px] text-slate-400">${shop.desc}</div>
                        </div>
                        <div id="shop-price-${shop.id}" class="text-sb-gold bg-slate-900 px-3 py-1 rounded border border-slate-700 text-xs font-bold shrink-0">${shop.price} B</div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="flex-1 min-w-[4.5rem] bg-pink-900/70 hover:bg-pink-800 text-white text-[10px] font-bold py-2 px-2 rounded-lg border border-pink-600" onclick="event.stopPropagation();window.buyItem('${shop.id}','${safeName}',${shop.isConsumable || false})">구매</button>
                        ${groupBuyBtn}
                    </div>
                </div>`;
        }

        window.currentRaidState = { 
            status: 'waiting', participants: [], bossHP: BASE_BOSS_HP, maxBossHP: BASE_BOSS_HP, 
            currentTurn: 0, startTime: 0, combo: 0, logs: [], questions: [] 
        };
        
        window.raidTimerInterval = null; 
        let isWeekend = false; 
        window.dragonBallState = null;
        window.goldenbellState = null;
        window.masterQuizState = null;
        let selectedEmotion = null; 
        let selectedBody = null;

        function calculateExactLevel(xp) { return Math.min(100, Math.max(1, Math.floor(1 + Math.sqrt((xp || 0) / 4.04)))); }

        /** 봉(B) 값을 소수 1자리로 맞춤 (마이너스 잔액·점심 차감 등 일관 표시) */
        function normalizeBongValue(v) {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return Math.round(n * 10) / 10;
        }

        /** 골든벨·스피드 퀴즈 공통: 앞뒤 공백 제거, 연속 공백 축소, 영문 소문자 통일 */
        function normalizeQuizAnswer(s) {
            if (s == null || s === undefined) return '';
            return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
        }

        /** 로컬 기준 오늘 날짜 YYYY-MM-DD */
        function getLocalDateStr(d = new Date()) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        /**
         * 일일 퀘스트 완료 플래그·밥줄(lunchBid)을 로컬 달력 날짜와 맞춤.
         * 학생 컬렉션 onSnapshot이 서버의 어제 데이터로 playerState를 덮을 때(자정 직후 저장 레이스) 초기화가 무효화되지 않도록,
         * 스냅샷 직후에도 동일 규칙을 다시 적용한다.
         * @param {{ silent?: boolean }} opts silent: true면 알림 없음(스냅샷·백그라운드 동기화용)
         * @returns {{ needSave: boolean, alertNewDay: boolean }}
         */
        function applyDailyQuestResetIfNewDay(opts = {}) {
            const silent = opts.silent === true;
            if (!window.playerState || window.playerState.isGuest || window.playerState.isAdmin) {
                return { needSave: false, alertNewDay: false };
            }
            const gameDateStr = getLocalDateStr();
            if (!window.playerState.lastDailyReset) {
                window.playerState.lastDailyReset = gameDateStr;
                return { needSave: true, alertNewDay: false };
            }
            if (window.playerState.lastDailyReset === gameDateStr) {
                return { needSave: false, alertNewDay: false };
            }

            const dailyQuestIds = QUEST_DATA.filter(q => q.type === 'daily').map(q => q.id);
            const updatedQuests = { ...(window.playerState.quests || {}) };
            let hadCompletedDaily = false;
            dailyQuestIds.forEach((qId) => {
                if (updatedQuests[qId]) {
                    hadCompletedDaily = true;
                    updatedQuests[qId] = false;
                }
            });
            window.playerState.quests = updatedQuests;
            window.playerState.lastDailyReset = gameDateStr;

            let lunchReset = false;
            if (!window.playerState.lunchBid || window.playerState.lunchBid.date !== gameDateStr) {
                window.playerState.lunchBid = { date: gameDateStr, amount: 0 };
                lunchReset = true;
            }
            return {
                needSave: true,
                alertNewDay: !silent && (hadCompletedDaily || lunchReset),
            };
        }

        /** 적금 가입일(YYYY-MM-DD)부터 오늘까지 경과 일수(가입 당일=0, 30 이상이면 만기) */
        function bankCalendarDaysElapsed(startDateStr) {
            if (!startDateStr || typeof startDateStr !== 'string') return 0;
            const parts = startDateStr.split('-');
            if (parts.length !== 3) return 0;
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return 0;
            const start = new Date(y, m, day);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            return Math.max(0, Math.floor((today - start) / 86400000));
        }

        /** YYYY-MM-DD 두 날짜 사이의 달력 일수(같은 날=0, 익일=1) */
        function bankDaysBetweenLocalDateStr(earlierStr, laterStr) {
            if (!earlierStr || !laterStr || typeof earlierStr !== 'string' || typeof laterStr !== 'string') return 0;
            const pe = earlierStr.split('-').map(Number);
            const pl = laterStr.split('-').map(Number);
            if (pe.length !== 3 || pl.length !== 3) return 0;
            const d1 = new Date(pe[0], pe[1] - 1, pe[2]);
            const d2 = new Date(pl[0], pl[1] - 1, pl[2]);
            return Math.max(0, Math.floor((d2 - d1) / 86400000));
        }

        /** 일반예금 + 적금 원금 합계 (주기 보너스 기준) */
        function getBankTotalDeposits() {
            if (!window.playerState) return 0;
            const reg = Number(window.playerState.bankRegularSavings) || 0;
            const termSum = (window.playerState.bankTermDeposits || []).reduce((s, t) => s + (Number(t && t.amount) || 0), 0);
            return reg + termSum;
        }

        /** 로컬 기준 주말(토·일) 여부 */
        function isLocalWeekend(d = new Date()) {
            const day = d.getDay();
            return day === 0 || day === 6;
        }

        /**
         * 이번 주말을 대표하는 토요일 날짜 키 (YYYY-MM-DD). 평일이면 null.
         * 일요일은 직전 토요일과 같은 키.
         */
        function getWeekendSaturdayKey(d = new Date()) {
            const day = d.getDay();
            const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (day === 6) return getLocalDateStr(x);
            if (day === 0) {
                x.setDate(x.getDate() - 1);
                return getLocalDateStr(x);
            }
            return null;
        }

        /** 평일 등 주말 키가 null일 때, 직전 토요일 날짜 키 (복구 저장·표시용) */
        function getLastSaturdayDateKey(d = new Date()) {
            const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const day = x.getDay();
            if (day === 6) return getLocalDateStr(x);
            if (day === 0) {
                x.setDate(x.getDate() - 1);
                return getLocalDateStr(x);
            }
            x.setDate(x.getDate() - (day + 1));
            return getLocalDateStr(x);
        }

        /** 탭 세션 시작 시각 기준 1시간 경과 시 새로고침(로컬 조작·새로고침 악용 완화) */
        function initSessionRefreshGuard() {
            const KEY = 'sambong_sess_start';
            let start = parseInt(sessionStorage.getItem(KEY) || '0', 10);
            if (!start || Number.isNaN(start)) {
                start = Date.now();
                sessionStorage.setItem(KEY, String(start));
            }
            setInterval(() => {
                const s = parseInt(sessionStorage.getItem(KEY) || '0', 10);
                if (!s || Number.isNaN(s)) return;
                if (Date.now() - s >= 60 * 60 * 1000) {
                    sessionStorage.setItem(KEY, String(Date.now()));
                    location.reload();
                }
            }, 30000);
        }
        initSessionRefreshGuard();

        /**
         * 식단표 URL이 PDF / 이미지 / 기타(iframe) 중 무엇인지 판별.
         * Firebase Storage URL처럼 쿼리스트링·퍼센트 인코딩이 붙은 경우도 처리합니다.
         */
        function getLunchMenuResourceType(url) {
            if (!url || typeof url !== 'string') return 'other';
            let pathOnly = url.split(/[?#]/)[0];
            try { pathOnly = decodeURIComponent(pathOnly); } catch (e) {}
            const lower = pathOnly.toLowerCase();
            if (/\.pdf$/i.test(lower)) return 'pdf';
            if (/\.(png|jpe?g|gif|webp)$/i.test(lower)) return 'image';
            return 'other';
        }

        /** HTML 속성값(쌍따옴표) 안전 이스케이프 */
        function escapeHtmlAttr(s) {
            return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        }
        
        function getLevelInfo(xp) { 
            for(let i=0; i<LEVEL_DATA.length; i++) { 
                if(xp <= LEVEL_DATA[i].max) return {info: LEVEL_DATA[i], index: i}; 
            } 
            return {info: LEVEL_DATA[LEVEL_DATA.length-1], index: LEVEL_DATA.length-1}; 
        }
        
        const getWeekId = () => { 
            const d = new Date(); 
            const day = d.getUTCDay()||7; 
            d.setUTCDate(d.getUTCDate()+4-day); 
            return `${d.getUTCFullYear()}-W${Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000)+1)/7)}`; 
        };


        // ==========================================
        // ★ 탭 이동 및 월드맵 기능 ★
        // ==========================================
        const TABS = ['dashboard', 'plaza', 'quests', 'jobs', 'lunch', 'goldenbell', 'estate', 'bank', 'admin'];
        /** 기본 탭: 광장(plaza) */
        let currentTabIndex = 1;

        window.switchTab = function(tabId) {
            TABS.forEach(t => {
                const sec = document.getElementById(t + 'Section');
                if(sec) sec.classList.add('hidden');
                
                const btn = document.getElementById('tab-' + t);
                if(btn) { 
                    btn.classList.remove('border-sb-gold', 'text-sb-gold', 'text-orange-400', 'border-orange-400', 'text-yellow-400', 'border-yellow-400', 'text-teal-400', 'border-teal-400', 'text-sky-400', 'border-sky-400', 'bg-slate-800/50'); 
                    btn.classList.add('text-slate-400', 'border-transparent'); 
                }
            });
            
            const activeSec = document.getElementById(tabId + 'Section');
            if(activeSec) activeSec.classList.remove('hidden');
            
            const activeBtn = document.getElementById('tab-' + tabId);
            if(activeBtn) { 
                activeBtn.classList.remove('text-slate-400', 'border-transparent'); 
                if (tabId === 'lunch') activeBtn.classList.add('border-orange-400', 'text-orange-400', 'bg-slate-800/50'); 
                else if (tabId === 'goldenbell') activeBtn.classList.add('border-yellow-400', 'text-yellow-400', 'bg-slate-800/50'); 
                else if (tabId === 'estate') activeBtn.classList.add('border-teal-400', 'text-teal-400', 'bg-slate-800/50');
                else if (tabId === 'bank') activeBtn.classList.add('border-sky-400', 'text-sky-400', 'bg-slate-800/50');
                else activeBtn.classList.add('border-sb-gold', 'text-sb-gold', 'bg-slate-800/50'); 
            }

            document.body.className = `antialiased selection:bg-sb-gold selection:text-slate-900 bg-theme-${tabId}`;
            if (window.updateBankPanel) window.updateBankPanel();
            currentTabIndex = TABS.indexOf(tabId);
            window.scrollTo(0,0);
        }

        window.visitWorldTree = function() {
            if(window.playerState.isAdmin) {
                window.switchTab('admin');
            } else {
                window.customAlert("🌳 [세계수]\n삼봉월드를 창조한 마스터 J의 성역입니다.\n성장한 자들만이 이곳의 비밀을 풀 수 있습니다.");
            }
        };

        window.visitPirateIsland = function() {
            window.customAlert("🌊 [난지도 분교]\n해적 마스터 A의 구역입니다!\n으스스한 해골 깃발이 펄럭이고 있습니다. 🏴‍☠️");
        };

        let touchstartX = 0; 
        let touchstartY = 0;
        
        document.getElementById('swipeWrapper').addEventListener('touchstart', e => { 
            touchstartX = e.changedTouches[0].screenX; 
            touchstartY = e.changedTouches[0].screenY; 
        }, {passive: true});
        
        document.getElementById('swipeWrapper').addEventListener('touchend', e => {
            let touchendX = e.changedTouches[0].screenX; 
            let touchendY = e.changedTouches[0].screenY;
            let diffX = touchstartX - touchendX; 
            let diffY = touchstartY - touchendY;
            
            if (Math.abs(diffX) > 80 && Math.abs(diffY) < 60) {
                if (e.target.closest('.overflow-x-auto') || e.target.closest('table') || e.target.closest('#dragonballContainer') || e.target.closest('#gbAdminInputs')) return;
                
                let visibleTabs = TABS.filter(t => !document.getElementById('tab-' + t).classList.contains('hidden'));
                let cIdx = visibleTabs.indexOf(TABS[currentTabIndex]);
                
                if (diffX > 0 && cIdx < visibleTabs.length - 1) {
                    window.switchTab(visibleTabs[cIdx + 1]);
                } else if (diffX < 0 && cIdx > 0) {
                    window.switchTab(visibleTabs[cIdx - 1]);
                }
            }
        });


        // ==========================================
        // ★ 커스텀 모달 유틸리티 ★
        // ==========================================
        window.customAlert = (m) => new Promise(r => {
            const d = document.createElement('div'); 
            d.className = "fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-4";
            d.innerHTML = `
                <div class="bg-sb-panel p-6 rounded-3xl border border-slate-700 max-w-sm w-full text-center space-y-4 shadow-2xl">
                    <h3 class="text-xl font-display text-white">알림</h3>
                    <p class="text-xs sm:text-sm text-slate-300 whitespace-pre-wrap">${m}</p>
                    <button id="bOk" class="bg-sb-blue hover:bg-blue-500 text-white font-bold py-2 px-8 rounded-full w-full">확인</button>
                </div>`;
            document.body.appendChild(d); 
            document.getElementById('bOk').onclick = () => { d.remove(); r(true); };
        });

        window.customConfirm = (m) => new Promise(r => {
            const d = document.createElement('div'); 
            d.className = "fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-4";
            d.innerHTML = `
                <div class="bg-sb-panel p-6 rounded-3xl border border-slate-700 max-w-sm w-full text-center space-y-4 shadow-2xl">
                    <h3 class="text-xl font-display text-white">확인</h3>
                    <p class="text-xs sm:text-sm text-slate-300 whitespace-pre-wrap">${m}</p>
                    <div class="flex gap-4 mt-4">
                        <button id="bNo" class="bg-slate-700 text-white font-bold py-2 rounded-full w-full">취소</button>
                        <button id="bYes" class="bg-sb-red text-white font-bold py-2 rounded-full w-full">확인</button>
                    </div>
                </div>`;
            document.body.appendChild(d); 
            document.getElementById('bYes').onclick = () => { d.remove(); r(true); }; 
            document.getElementById('bNo').onclick = () => { d.remove(); r(false); };
        });

        window.customPrompt = (m, type="password") => new Promise(r => {
            const d = document.createElement('div'); 
            d.className = "fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-4";
            d.innerHTML = `
                <div class="bg-sb-panel p-6 rounded-3xl border border-slate-700 max-w-sm w-full text-center space-y-4 shadow-2xl">
                    <h3 class="text-xl font-display text-sb-gold">입력</h3>
                    <p class="text-xs sm:text-sm text-slate-300 whitespace-pre-wrap">${m}</p>
                    <input type="${type}" id="pIn" class="w-full bg-slate-800 text-white rounded px-4 py-2 text-center my-2 font-bold">
                    <div class="flex gap-4">
                        <button id="bpNo" class="bg-slate-700 text-white font-bold py-2 w-full rounded">취소</button>
                        <button id="bpYes" class="bg-emerald-500 text-white font-bold py-2 w-full rounded">확인</button>
                    </div>
                </div>`;
            document.body.appendChild(d); 
            document.getElementById('pIn').focus();
            document.getElementById('bpYes').onclick = () => { r(document.getElementById('pIn').value); d.remove(); }; 
            document.getElementById('bpNo').onclick = () => { r(null); d.remove(); };
        });

        // 1~6 면 선택 (주사위 유니코드 면을 보여주고 고름)
        window.customPick1to6 = (m) => new Promise(r => {
            const d = document.createElement('div');
            d.className = "fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-4";
            d.innerHTML = `
                <div class="bg-gradient-to-b from-pink-950/95 to-slate-900 p-6 rounded-3xl border border-pink-400/40 max-w-sm w-full text-center space-y-4 shadow-2xl">
                    <h3 class="text-xl font-display text-pink-100">주사위 선택</h3>
                    <p class="text-xs sm:text-sm text-slate-300 whitespace-pre-wrap">${m}</p>
                    <p class="text-[10px] text-pink-200/90">1~6 면을 눌러 예측 번호를 고르세요</p>
                    <div class="grid grid-cols-3 gap-3">
                        ${[1,2,3,4,5,6].map(n => `
                            <button type="button" data-pick="${n}" class="bg-slate-800/90 hover:bg-pink-900/60 border-2 border-pink-500/35 hover:border-pink-300 rounded-2xl py-3 sm:py-4 flex flex-col items-center justify-center transition shadow-inner active:scale-95">
                                <span class="text-4xl sm:text-5xl leading-none select-none" style="font-family: Georgia, 'Times New Roman', serif">${DICE_UNICODE_FACES[n - 1]}</span>
                                <span class="text-[10px] text-slate-400 mt-1 font-bold">${n}</span>
                            </button>
                        `).join('')}
                    </div>
                    <button type="button" id="pickCancel" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 w-full rounded-xl">취소</button>
                </div>`;
            document.body.appendChild(d);
            d.querySelectorAll('button[data-pick]').forEach(btn => {
                btn.onclick = () => {
                    const v = parseInt(btn.getAttribute('data-pick'), 10);
                    d.remove();
                    r(v);
                };
            });
            document.getElementById('pickCancel').onclick = () => { d.remove(); r(null); };
        });

        /** 미스테리 박스: 결과 숫자가 나올 때까지 주사위 면이 빠르게 바뀌는 연출 */
        window.runDiceRollAnimation = function(finalRoll) {
            return new Promise(function(resolve) {
                const face = Math.max(1, Math.min(6, parseInt(finalRoll, 10) || 1));
                const overlay = document.createElement('div');
                overlay.className = 'fixed inset-0 z-[305] flex items-center justify-center bg-black/78 px-4';
                overlay.innerHTML = `
                    <div class="bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-pink-400/45 text-center shadow-2xl max-w-xs w-full">
                        <p class="text-pink-200 text-xs font-bold mb-4">주사위 굴리는 중...</p>
                        <div id="diceRollFace" class="dice-roll-stage text-7xl sm:text-8xl leading-none select-none text-pink-100" style="font-family: Georgia, 'Times New Roman', serif">${DICE_UNICODE_FACES[0]}</div>
                        <p class="text-slate-500 text-[10px] mt-4">잠시만 기다려 주세요</p>
                    </div>`;
                document.body.appendChild(overlay);
                const faceEl = overlay.querySelector('#diceRollFace');
                let ticks = 0;
                const maxTicks = 30;
                const timer = setInterval(function() {
                    ticks++;
                    const show = ticks < maxTicks ? (Math.floor(Math.random() * 6) + 1) : face;
                    faceEl.textContent = DICE_UNICODE_FACES[show - 1];
                    if (ticks >= maxTicks) {
                        clearInterval(timer);
                        faceEl.classList.remove('dice-roll-stage');
                        setTimeout(function() { overlay.remove(); resolve(); }, 480);
                    }
                }, 52);
            });
        };


        // ==========================================
        // ★ 동적 콘텐츠 렌더링 ★
        // ==========================================
        function initDynamicContent() {
            const jg = document.getElementById('jobGrid');
            if(jg) {
                jg.innerHTML = JOB_DATA.map(job => `
                    <div id="job-card-${job.id}" onclick="window.toggleJob('${job.name}', '${job.icon}', '${job.color}')" class="cursor-pointer glass-panel p-2 sm:p-3 rounded-xl border-l-4 border-l-${job.color.replace('text-', '')} hover:bg-slate-800 transition flex items-center gap-2 sm:gap-3 group">
                        <i class="fa-solid ${job.icon} text-xl sm:text-2xl ${job.color} group-hover:scale-110 w-8 text-center shrink-0"></i>
                        <div class="flex-grow min-w-0">
                            <div class="font-bold text-xs sm:text-sm truncate">${job.name} <span class="font-normal text-[9px] sm:text-[10px] text-slate-400">${job.sub}</span></div>
                            <div class="text-[9px] sm:text-[10px] text-slate-400 truncate">${job.desc}</div>
                        </div>
                        <div class="bg-slate-900 text-sb-gold px-2 py-1 rounded font-bold text-[9px] sm:text-[10px] shrink-0 border border-slate-700 whitespace-nowrap">${job.pay} B</div>
                    </div>
                `).join('');
            }

            const shopInstant = SHOP_DATA.filter((s) => s.isConsumable);
            const shopClass = SHOP_DATA.filter((s) => !s.isConsumable);
            document.getElementById('shopContainer').innerHTML = `
                <div class="text-[10px] text-slate-400 font-bold mb-2 pb-1 border-b border-slate-700/80"><i class="fa-solid fa-bolt text-amber-400 mr-1"></i>바로 적용되는 아이템</div>
                ${shopInstant.map((shop) => buildShopCardHtml(shop)).join('')}
                <div class="text-[10px] text-slate-400 font-bold mb-2 mt-4 pb-1 border-b border-slate-700/80"><i class="fa-solid fa-school text-pink-400 mr-1"></i>학급 특별 활동 <span class="font-normal text-slate-500">(삼봉 결제 · 선생님과 일정 조율)</span></div>
                ${shopClass.map((shop) => buildShopCardHtml(shop)).join('')}
            `;
            
            document.getElementById('skinContainer').innerHTML = SKIN_DATA.map(skin => `
                <div id="skin-btn-${skin.id}" class="shop-btn bg-slate-800/80 p-2 sm:p-3 rounded-xl border-2 flex items-center gap-2 unaffordable" onclick="window.handleSkin('${skin.id}')">
                    <div class="bg-slate-900 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-lg sm:text-xl shrink-0">${skin.emoji}</div>
                    <div class="flex-grow min-w-0">
                        <div class="font-bold text-xs sm:text-sm truncate">${skin.name}</div>
                        <div class="text-[9px] sm:text-[10px] text-slate-400 truncate">${skin.desc}</div>
                    </div>
                    <div id="skin-status-${skin.id}" class="shrink-0">
                        <div class="text-pink-400 bg-slate-900 px-2 py-1 rounded border text-[10px] font-bold">${skin.price} B</div>
                    </div>
                </div>`).join('');

            document.getElementById('emotionBtns').innerHTML = EMOTIONS.map(e => `
                <button onclick="window.selectEmotion('${e.id}')" id="btn-emo-${e.id}" class="cond-btn w-8 h-8 text-sm sm:text-base rounded-full bg-slate-900 border border-slate-600 flex justify-center items-center transition" title="${e.label}">
                    ${e.icon}
                </button>
            `).join('');
            
            document.getElementById('bodyBtns').innerHTML = BODY_STATES.map(b => `
                <button onclick="window.selectBody(${b.val})" id="btn-body-${b.val}" class="cond-btn w-8 h-8 text-xs rounded bg-slate-900 border border-slate-600 flex justify-center items-center transition ${b.color}" title="${b.label}">
                    <i class="fa-solid ${b.icon}"></i>
                </button>
            `).join('');
            
            let gbHtml = `
                <p class="text-[10px] text-slate-400 mb-2">각 문항마다 정답 시 지급할 XP·봉(B)을 입력하세요. (학생은 모든 문제 입력 후 한 번에 제출·채점됩니다.)</p>
            `;
            for(let i=0; i<10; i++) {
                gbHtml += `
                <div class="flex flex-wrap gap-1 sm:gap-2 mb-2 items-center">
                    <span class="text-sb-gold font-bold text-xs w-6 text-center shrink-0">Q${i+1}</span>
                    <input type="text" id="gb_admin_q_${i}" placeholder="문제 (빈칸은 출제안함)" class="flex-1 min-w-[120px] bg-slate-900 border border-slate-700 text-white px-2 py-1.5 rounded text-xs">
                    <input type="text" id="gb_admin_a_${i}" placeholder="정답" class="w-20 sm:w-24 bg-slate-900 border border-slate-700 text-white px-2 py-1.5 rounded text-xs text-center font-bold shrink-0">
                    <span class="text-[10px] text-slate-500 shrink-0">XP</span>
                    <input type="number" id="gb_admin_xp_${i}" min="0" step="1" value="10" title="이 문항 정답 시 지급 XP" class="w-14 bg-slate-900 border border-slate-700 text-white px-1 py-1.5 rounded text-xs text-center shrink-0">
                    <span class="text-[10px] text-slate-500 shrink-0">B</span>
                    <input type="number" id="gb_admin_bong_${i}" min="0" step="0.1" value="1" title="이 문항 정답 시 지급 봉" class="w-14 bg-slate-900 border border-slate-700 text-white px-1 py-1.5 rounded text-xs text-center shrink-0">
                </div>`;
            }
            document.getElementById('gbAdminInputs').innerHTML = gbHtml;

            const gmShopEl = document.getElementById('gmShopPriceInputs');
            if (gmShopEl) {
                gmShopEl.innerHTML = SHOP_DATA.map((s) => {
                    const safeLabel = String(s.name).replace(/</g, '').replace(/&/g, '');
                    return `
                    <div class="flex flex-wrap gap-2 items-center mb-2">
                        <span class="text-[10px] text-slate-300 w-32 sm:w-40 shrink-0 truncate">${safeLabel}</span>
                        <input type="number" id="gm_shop_price_${s.id}" min="0" step="0.1" value="${s.price}" class="w-24 bg-slate-900 border border-slate-600 text-white px-2 py-1.5 rounded text-xs font-bold" />
                        <span class="text-[9px] text-slate-500">B <span class="text-slate-600">(기본 ${s.price})</span></span>
                    </div>`;
                }).join('');
            }

            let html = '';
            for(let i=0; i<5; i++) {
                html += `
                <div class="bg-slate-800/80 p-2 rounded-lg border border-slate-600">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-sb-blue font-bold text-[10px] w-4 shrink-0">Q${i+1}</span>
                        <input type="text" id="rq_${i}" placeholder="문제" class="flex-1 bg-slate-900 border border-slate-700 text-white px-2 py-1 rounded text-[10px]">
                    </div>
                    <div class="grid grid-cols-2 gap-1 pl-6">`;
                for(let j=0; j<4; j++) {
                    html += `
                        <div class="flex items-center gap-1">
                            <input type="radio" name="ra_${i}" value="${j}" ${j===0?'checked':''} class="w-3 h-3 text-sb-blue bg-slate-900">
                            <input type="text" id="rop_${i}_${j}" placeholder="보기${j+1}" class="w-full bg-slate-900 border border-slate-700 text-white px-1.5 py-0.5 rounded text-[9px]">
                        </div>`;
                }
                html += `</div></div>`;
            }
            document.getElementById('raidQuestionInputs').innerHTML = html;
        }

        window.selectEmotion = async function(id, autoSave = true) {
            selectedEmotion = EMOTIONS.find(e => e.id === id);
            EMOTIONS.forEach(e => {
                const btn = document.getElementById(`btn-emo-${e.id}`);
                if(btn) btn.classList.remove('active');
            });
            const activeBtn = document.getElementById(`btn-emo-${id}`);
            if(activeBtn) activeBtn.classList.add('active');

            if (autoSave) {
                if (window.playerState.isGuest) return window.customAlert("👀 게스트는 이용할 수 없어요.");
                if (!selectedBody && window.playerState.condition) selectedBody = window.playerState.condition.body;
                if (!selectedBody) selectedBody = BODY_STATES[2];
                
                window.playerState.condition = { emotion: selectedEmotion, body: selectedBody };
                await saveDataToCloud();
            }
        };
        
        window.selectBody = async function(val, autoSave = true) {
            selectedBody = BODY_STATES.find(b => b.val === val);
            BODY_STATES.forEach(b => {
                const btn = document.getElementById(`btn-body-${b.val}`);
                if(btn) btn.classList.remove('active');
            });
            const activeBtn = document.getElementById(`btn-body-${val}`);
            if(activeBtn) activeBtn.classList.add('active');

            if (autoSave) {
                if (window.playerState.isGuest) return window.customAlert("👀 게스트는 이용할 수 없어요.");
                if (!selectedEmotion && window.playerState.condition) selectedEmotion = window.playerState.condition.emotion;
                if (!selectedEmotion) selectedEmotion = EMOTIONS[0];
                
                window.playerState.condition = { emotion: selectedEmotion, body: selectedBody };
                await saveDataToCloud();
            }
        };


        // ==========================================
        // ★ Firebase 초기화 및 연동 ★
        // ==========================================
        async function initApp() {
            initDynamicContent();
            
            try {
                const firebaseConfig = { 
                    apiKey: "AIzaSyAsih-sfnIZ_gX_1l7SAVZHCAhk3KzmiP8", 
                    authDomain: "sambong-world-2026.firebaseapp.com", 
                    projectId: "sambong-world-2026", 
                    storageBucket: "sambong-world-2026.firebasestorage.app", 
                    messagingSenderId: "728320769100", 
                    appId: "1:728320769100:web:7510c9a77cca6b87a788e9" 
                };
                
                const app = initializeApp(firebaseConfig); 
                auth = getAuth(app); 
                db = getFirestore(app);
                // 기본 버킷을 gs:// 로 명시 (일부 환경에서 업로드가 0%에서 멈추는 현상 완화)
                const gsBucket = firebaseConfig.storageBucket ? `gs://${firebaseConfig.storageBucket}` : undefined;
                storage = gsBucket ? getStorage(app, gsBucket) : getStorage(app);
                
                await auth.authStateReady();
                await signInAnonymously(auth);
                /** 스냅샷·setDoc가 토큰 없이 먼저 나가는 레이스 완화 */
                if (auth.currentUser) {
                    await auth.currentUser.getIdToken();
                }

                onAuthStateChanged(auth, user => {
                    if (user) {
                        checkTimeEvents();
                        setInterval(checkTimeEvents, 60000);
                        setInterval(() => { void tryDragonBallSpawnTick(); }, 45000);
                        void tryDragonBallSpawnTick();
                        
                        if(unsubscribeGlobal) unsubscribeGlobal();
                        unsubscribeGlobal = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'students'), snap => {
                            const students = []; 
                            let gmD = null, gmaD = null;
                            
                            snap.forEach((d) => {
                                const row = d.data();
                                if (d.id === 'student_gm') {
                                    gmD = { ...row, id: 'gm' };
                                } else if (d.id === 'student_gm_a') {
                                    gmaD = { ...row, id: 'gm_a' };
                                } else {
                                    /** 문서 id를 신뢰 — row.id가 있으면 숫자/문자 섞여 find 실패·덮어쓰기 유발 */
                                    students.push({ ...row, id: String(d.id.replace('student_', '')) });
                                }
                            });
                            
                            window.allStudentsData = students; 
                            window.gmData = gmD; 
                            window.gmaData = gmaD;
                            
                            const myId = localStorage.getItem('sambong_student_id');
                            if (myId && !window.playerState.isGuest) {
                                const myData = myId === 'gm' ? gmD : (myId === 'gm_a' ? gmaD : students.find((s) => String(s.id) === String(myId)));
                                if (myData) {
                                    const nx = Number(myData.xp) || 0;

                                    if (
                                        _prevXpFromSnapshot != null &&
                                        !window._suppressXpSyncToast &&
                                        nx > _prevXpFromSnapshot
                                    ) {
                                        showXpSyncHintFromServer(nx - _prevXpFromSnapshot);
                                    }
                                    _prevXpFromSnapshot = nx;

                                    window.playerState = {
                                        ...myData, isGuest: false, isGM: myId === 'gm', isGMA: myId === 'gm_a', isAdmin: (myId === 'gm' || myId === 'gm_a')
                                    };
                                    if (window.playerState.bong != null) window.playerState.bong = normalizeBongValue(window.playerState.bong);
                                    /** 스냅샷이 어제 quests·lastDailyReset을 다시 주면 자정 초기화가 덮어씌워지는 문제 보정(학생만, 알림 없음) */
                                    if (myId !== 'gm' && myId !== 'gm_a' && !window.playerState.isAdmin) {
                                        const dq = applyDailyQuestResetIfNewDay({ silent: true });
                                        if (dq.needSave) {
                                            if (!currentStudentDocRef) {
                                                currentStudentDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + myId);
                                            }
                                            void saveDataToCloud().then(() => updateUI());
                                        } else {
                                            updateUI();
                                        }
                                    } else {
                                        updateUI();
                                    }
                                }
                            }
                            
                            if (window.playerState && window.playerState.isAdmin) {
                                window.renderAdminTable(students);
                                window.renderAdminQuestBoard(students);
                            }
                            window.renderPlaza(students, gmD, gmaD); 
                            window.renderHallOfFame(students);
                            window.renderLunchQueue(students);
                        });

                        if(unsubscribeSettings) unsubscribeSettings();
                        unsubscribeSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), snap => {
                            if (snap.exists()) {
                                window.globalSettings = snap.data();
                                const pwDisplay = document.getElementById('currentRaidPwDisplay');
                                if (pwDisplay) pwDisplay.innerText = window.globalSettings.raidPassword || '1234';
                                
                                const npcEl = document.getElementById('npcText');
                                if (npcEl) {
                                    npcEl.innerText = window.globalSettings.announcement ? `"[공지] ${window.globalSettings.announcement}"` : '"(등록된 공지가 없습니다)"';
                                }
                                const rateEl = document.getElementById('gmBankInterestRate');
                                if (rateEl && window.globalSettings.bankInterestPercent != null) {
                                    rateEl.value = String(window.globalSettings.bankInterestPercent);
                                }
                                if (window.globalSettings.shopPrices) {
                                    SHOP_DATA.forEach((s) => {
                                        const el = document.getElementById('gm_shop_price_' + s.id);
                                        if (el && window.globalSettings.shopPrices[s.id] != null) {
                                            el.value = String(window.globalSettings.shopPrices[s.id]);
                                        }
                                    });
                                }
                                updateShopPriceLabels();
                                updateUI();
                            }
                        });

                        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'estate', 'state'), snap => {
                            if(snap.exists()) { 
                                window.estateState = snap.data(); 
                                if (!Array.isArray(window.estateState.purchaseHistory)) window.estateState.purchaseHistory = [];
                                window.ensureEstateSeokRestore();
                                window.renderEstate(); 
                            } else {
                                const initialSeats = buildInitialEstateSeats();
                                initialSeats[ESTATE_RESTORE_SEOK_SEAT_INDEX].owner = '13';
                                initialSeats[ESTATE_RESTORE_SEOK_SEAT_INDEX].locked = false;
                                const ph = [{ studentId: '13', seatId: ESTATE_RESTORE_SEOK_SEAT_INDEX, price: 500, at: Date.now(), note: '봄 시즌 초기 데이터(석서영 자리 복구)' }];
                                setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'estate', 'state'), { seats: initialSeats, purchaseHistory: ph });
                            }
                        });

                        if(unsubscribeRaid) unsubscribeRaid();
                        unsubscribeRaid = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), snap => {
                            if(snap.exists()) { 
                                window.currentRaidState = snap.data(); 
                                updateRaidEntryUI(); 
                                updateRaidBattleUI(); 
                            }
                        });

                        // 관리자(마스터 J)용: 레이드/골든벨 Draft 불러오기(새로고침 유지)
                        if(window._unsubRaidDraft) window._unsubRaidDraft();
                        window._unsubRaidDraft = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'draft'), snap => {
                            if(!window.playerState || !window.playerState.isGM) return;
                            if(!snap.exists()) return;
                            const d = snap.data();
                            const qs = Array.isArray(d.questions) ? d.questions : [];
                            for(let i=0; i<5; i++) {
                                const qi = qs[i] || {};
                                const qEl = document.getElementById(`rq_${i}`);
                                if(qEl && (qEl.value || '') === '') qEl.value = qi.q || '';
                                for(let j=0; j<4; j++) {
                                    const oEl = document.getElementById(`rop_${i}_${j}`);
                                    if(oEl && (oEl.value || '') === '') oEl.value = (qi.options && qi.options[j]) ? qi.options[j] : '';
                                }
                                if(qi.a !== undefined && qi.a !== null) {
                                    const r = document.querySelector(`input[name="ra_${i}"][value="${qi.a}"]`);
                                    if(r) r.checked = true;
                                }
                            }
                        });

                        if(window._unsubGbDraft) window._unsubGbDraft();
                        window._unsubGbDraft = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'goldenbell', 'draft'), snap => {
                            if(!window.playerState || !window.playerState.isAdmin) return;
                            if(!snap.exists()) return;
                            const d = snap.data();
                            const qs = Array.isArray(d.questions) ? d.questions : [];
                            for(let i=0; i<10; i++) {
                                const qi = qs.find(x => x.originalIndex === i) || qs[i] || {};
                                const qEl = document.getElementById(`gb_admin_q_${i}`);
                                const aEl = document.getElementById(`gb_admin_a_${i}`);
                                const xpEl = document.getElementById(`gb_admin_xp_${i}`);
                                const bongEl = document.getElementById(`gb_admin_bong_${i}`);
                                if(qEl && (qEl.value || '') === '') qEl.value = qi.q || '';
                                if(aEl && (aEl.value || '') === '') aEl.value = qi.a || '';
                                if(xpEl && (xpEl.value || '') === '') xpEl.value = (qi.rewardXp != null && qi.rewardXp !== '') ? qi.rewardXp : 10;
                                if(bongEl && (bongEl.value || '') === '') bongEl.value = (qi.rewardBong != null && qi.rewardBong !== '') ? qi.rewardBong : 1;
                            }
                        });

                        if(unsubscribeDragonBall) unsubscribeDragonBall();
                        unsubscribeDragonBall = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'dragonball', 'state'), snap => {
                            if(snap.exists()) { 
                                window.dragonBallState = snap.data(); 
                                updateDragonBallUI(); 
                                void tryDragonBallSpawnTick();
                            } else {
                                setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dragonball', 'state'), { 
                                    isActive: false, number: 1, posX: 50, posY: 50, 
                                    lastClaimTime: Date.now(), nextSpawnTime: Date.now(),
                                    weekendKey: '', spawnedStarsThisWeekend: []
                                });
                            }
                        });

                        if(unsubscribeGoldenBell) unsubscribeGoldenBell();
                        unsubscribeGoldenBell = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'goldenbell', 'state'), snap => {
                            if(snap.exists()) {
                                window.goldenbellState = snap.data();
                                if (window.playerState && window.playerState.isAdmin) {
                                    if(window._gbPreviewStudent) window.renderGoldenBellStudent();
                                    else window.renderGoldenBellMasterLive();
                                    window.updateGoldenBellAdminUI();
                                } else {
                                    window.renderGoldenBellStudent();
                                }
                                const gbAdminStatus = document.getElementById('gbAdminStatus');
                                if (gbAdminStatus) {
                                    gbAdminStatus.innerText = window.goldenbellState.isOpen ? '진행중' : '대기중';
                                    gbAdminStatus.className = window.goldenbellState.isOpen ? 'text-[10px] bg-sb-blue text-white px-2 py-0.5 rounded border border-blue-600' : 'text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-600';
                                }
                            }
                        });

                        if (unsubscribeMasterQuiz) unsubscribeMasterQuiz();
                        unsubscribeMasterQuiz = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'masterquiz', 'state'), (snap) => {
                            if (snap.exists()) {
                                window.masterQuizState = snap.data();
                            } else {
                                window.masterQuizState = { isOpen: false };
                            }
                            if (typeof window.syncMasterQuizModal === 'function') window.syncMasterQuizModal();
                            if (typeof window.updateMasterQuizAdminUI === 'function') window.updateMasterQuizAdminUI();
                        });

                        if (unsubscribeShopGroupBuy) unsubscribeShopGroupBuy();
                        unsubscribeShopGroupBuy = onSnapshot(
                            collection(db, 'artifacts', appId, 'public', 'data', 'shopGroupBuy'),
                            (snap) => {
                                window.shopGroupBuyPools = {};
                                snap.forEach((d) => {
                                    window.shopGroupBuyPools[d.id] = d.data();
                                });
                                if (typeof window._refreshShopGroupBuyModalIfOpen === 'function') {
                                    window._refreshShopGroupBuyModalIfOpen();
                                }
                                updateUI();
                            }
                        );

                        const savedId = localStorage.getItem('sambong_student_id'); 
                        const savedPin = localStorage.getItem('sambong_student_pin');
                        if (savedId && savedPin) {
                            attemptLogin(savedId, savedPin, true);
                        }
                    }
                });
            } catch(e) {
                console.error("Firebase 초기화 에러", e);
            }
        }

        function checkTimeEvents() {
            checkWeekendTime();
            
            const now = new Date();
            const h = now.getHours();
            const m = now.getMinutes();
            const isPast1210 = (h > 12) || (h === 12 && m >= 10);
            
            const lunchTab = document.getElementById('tab-lunch');
            if (lunchTab) lunchTab.classList.remove('hidden');

            const queueContainer = document.getElementById('lunchQueueWrapper');
            if (queueContainer) {
                if ((window.playerState && window.playerState.isAdmin) || isPast1210) {
                    queueContainer.classList.remove('hidden');
                } else {
                    queueContainer.classList.add('hidden');
                }
            }

            if (window.playerState && !window.playerState.isGuest && !window.playerState.isAdmin) {
                const r = applyDailyQuestResetIfNewDay({ silent: false });
                if (r.needSave) {
                    saveDataToCloud();
                    updateUI();
                    if (r.alertNewDay) window.customAlert("🌞 새로운 하루가 시작되어 일일 퀘스트와 밥줄 투자가 초기화되었습니다!");
                }
            }

            // 평일 점심값 차감(학생 본인 클라이언트, 12시 이후 1회) — 마스터 접속 여부와 무관
            if (window.playerState && !window.playerState.isGuest && currentStudentDocRef) {
                void window.applyPersonalLunchDeductionIfNeeded();
            }

            // 주급: 금요 15:00~ 직전 금요 분 기준 — 로그인 역할과 무관하게 누군가 앱을 켜면 트랜잭션 1회로 정산
            if (typeof db !== 'undefined' && db && window.allStudentsData && window.allStudentsData.length > 0) {
                void window.checkAndDistributeSalary();
            }
            // 수업 종료 XP: 마스터 J 접속 시에만(기존 설계 유지)
            if (window.playerState && window.playerState.isGM && typeof db !== 'undefined' && db && window.allStudentsData && window.allStudentsData.length > 0) {
                void window.checkAndDistributeClassXP();
            }
        }


        // ==========================================
        // ★ 광장 및 관리자 테이블 렌더링 ★
        // ==========================================
        window.renderPlaza = function(studentsData, gmData, gmaData) {
            const container = document.getElementById('plazaContainer');
            if(!container) return;
            
            const createCard = (data, isGMCard, idLabel) => {
                const emptyId = idLabel.split('.')[0].trim();
                const targetId = data ? data.id : emptyId;
                const canEdit = window.playerState.isGM || (window.playerState.isGMA && targetId === '13');
                const gmOnClick = canEdit && !isGMCard ? `onclick="window.plazaClickXP('${targetId}', this)"` : '';
                const gmCursor = canEdit && !isGMCard ? 'cursor-pointer hover:scale-[1.02] active:scale-95' : '';

                if (!data && !isGMCard) {
                    return `<div class="flex flex-col items-center p-2 rounded-xl border border-slate-700 bg-slate-800/30 w-full opacity-50">
                                <div class="text-3xl mb-1 opacity-30 grayscale">👤</div>
                                <div class="font-bold bg-slate-900 px-1 py-0.5 rounded text-[9px] w-full text-center truncate">${idLabel}</div>
                            </div>`;
                }

                const isMe = (window.playerState.isAdmin && isGMCard && data.id === localStorage.getItem('sambong_student_id')) || 
                             (!window.playerState.isAdmin && !isGMCard && data.id === localStorage.getItem('sambong_student_id'));
                             
                /** 스냅샷 행(data)을 우선 — 로컬 playerState가 서버 최신(xp·퀘스트 등)을 덮어씌워 동기화가 막히지 않게 함 */
                const displayData = isMe && data
                    ? {
                        ...window.playerState,
                        ...data,
                        isGM: window.playerState.isGM,
                        isGMA: window.playerState.isGMA,
                        isAdmin: window.playerState.isAdmin,
                        isGuest: window.playerState.isGuest,
                    }
                    : data;
                const lv = getLevelInfo(displayData.xp || 0);
                const exactLv = calculateExactLevel(displayData.xp || 0);

                let face = STUDENT_GENDERS[targetId] === 'F' ? '👧' : '👦';
                let overlays = ''; 
                let border = lv.info.borderColor; 
                let glow = 'shadow-md';
                
                if (displayData.equippedSkins) {
                    SKIN_DATA.forEach(s => {
                        if (displayData.equippedSkins[s.id]) {
                            if (s.type === 'face') face = s.emoji; 
                            else if (s.type === 'overlay') overlays += `<span class="absolute ${s.overlayClass} z-20 pointer-events-none">${s.emoji}</span>`;
                            else if (s.type === 'aura') { border = s.border; glow = s.glow; }
                        }
                    });
                }

                if (displayData.equippedWeapon) {
                    const wp = WEAPON_DATA.find(w => w.id === displayData.equippedWeapon);
                    if (wp) overlays += `<span class="absolute top-1/2 -translate-y-1/2 -left-8 text-[0.8em] z-30 drop-shadow-md">${wp.emoji}</span>`;
                }
                
                const hp = (displayData.shieldHP || 0) + (displayData.hasShield ? 100 : 0);
                const shieldHtml = hp > 0 ? `<div class="absolute -top-2 -left-2 z-30 animate-pulse text-lg">🛡️<span class="text-[8px] font-bold text-white bg-indigo-600 px-0.5 rounded -ml-1 shadow">${hp}</span></div>` : '';

                let jobHtml = '';
                if (displayData.jobs && displayData.jobs.length > 0) {
                    const jobIcons = displayData.jobs.map(j => `
                        <div class="w-5 h-5 rounded-full bg-slate-900 border flex items-center justify-center ${j.color} border-slate-600 shadow-sm" title="${j.name}">
                            <i class="fa-solid ${j.icon} text-[9px]"></i>
                        </div>
                    `).join('');
                    const topMargin = hp > 0 ? 'top-4' : 'top-1'; 
                    jobHtml = `<div class="absolute ${topMargin} left-1 flex flex-col gap-1 z-20">${jobIcons}</div>`;
                }

                let condHtml = '';
                if (displayData.condition && displayData.condition.emotion) {
                    const emo = displayData.condition.emotion.icon;
                    const bColor = displayData.condition.body ? displayData.condition.body.color : 'text-slate-400';
                    const bIcon = displayData.condition.body ? displayData.condition.body.icon : 'fa-battery-half';
                    condHtml = `<div class="absolute top-1 right-1 bg-slate-900/80 px-1.5 py-0.5 rounded-full border border-slate-600 flex items-center gap-1 shadow z-20">
                                    <span class="text-[10px] leading-none">${emo}</span><i class="fa-solid ${bIcon} text-[10px] ${bColor} leading-none"></i>
                                </div>`;
                }

                let gmControls = canEdit && !isGMCard ? `
                    <div class="w-full mt-1.5 pt-1.5 border-t border-slate-700/50 flex flex-col gap-0.5 z-20" onclick="event.stopPropagation();">
                        <div class="flex gap-0.5">
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('xp', 1, '${targetId}', this)" class="flex-1 bg-sb-blue/10 text-sb-blue text-[9px] font-bold py-1 rounded">+1X</button>
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('xp', 5, '${targetId}', this)" class="flex-1 bg-sb-blue/20 text-sb-blue text-[9px] font-bold py-1 rounded">+5X</button>
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('xp', -1, '${targetId}', this)" class="flex-1 bg-slate-700/80 text-slate-300 text-[9px] font-bold py-1 rounded hover:bg-sb-red">-1X</button>
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('xp', -5, '${targetId}', this)" class="flex-1 bg-slate-700 text-slate-300 text-[9px] font-bold py-1 rounded hover:bg-sb-red">-5X</button>
                        </div>
                        <div class="flex gap-0.5">
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('bong', 1, '${targetId}', this)" class="flex-1 bg-sb-gold/10 text-sb-gold text-[9px] font-bold py-1 rounded">+1B</button>
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('bong', 2, '${targetId}', this)" class="flex-1 bg-sb-gold/20 text-sb-gold text-[9px] font-bold py-1 rounded">+2B</button>
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('bong', -1, '${targetId}', this)" class="flex-1 bg-slate-700/80 text-slate-300 text-[9px] font-bold py-1 rounded hover:bg-sb-red">-1B</button>
                            <button type="button" onclick="event.stopPropagation(); void window.quickReward('bong', -2, '${targetId}', this)" class="flex-1 bg-slate-700 text-slate-300 text-[9px] font-bold py-1 rounded hover:bg-sb-red">-2B</button>
                        </div>
                    </div>` : '';

                if (isGMCard) {
                    const isA = targetId === 'gm_a';
                    const cBorder = isA ? 'border-cyan-500' : 'border-sb-gold';
                    const cGlow = isA ? 'shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'shadow-[0_0_15px_rgba(251,191,36,0.6)]';
                    
                    return `
                    <div class="flex flex-col items-center p-3 rounded-xl border-2 w-full transition ${cGlow} ${cBorder} bg-slate-900 mx-auto z-10 relative">
                        ${shieldHtml}${jobHtml}${condHtml}
                        <div class="text-4xl sm:text-5xl avatar-legend mb-2 z-10 relative">
                            ${isA?'🏴‍☠️':'🐉'}<span class="absolute -bottom-1 -right-1 text-xl">${isA?'🌊':'🔥'}</span>${overlays}
                        </div>
                        <div class="text-[8px] font-black ${isA?'text-cyan-400':'text-sb-gold'} mb-0.5">${isA?'해적섬 두목':'창조자'}</div>
                        <div class="font-bold bg-gradient-to-r ${isA?'from-cyan-600 to-blue-800 text-white':'from-sb-gold to-yellow-300 text-slate-900'} px-1 py-0.5 rounded text-[9px] w-full text-center truncate border border-slate-700">
                            ${idLabel}
                        </div>
                    </div>`;
                }

                return `
                <div ${gmOnClick} class="flex flex-col items-center p-2 rounded-xl border w-full transition ${glow} ${border} ${lv.info.bgColor} ${gmCursor} relative">
                    ${shieldHtml}${jobHtml}${condHtml}
                    <div class="text-3xl sm:text-4xl mb-1 flex items-end justify-center z-10 ${lv.info.anim}">
                        <div class="relative inline-block leading-none">${face}${overlays}</div>
                        <div class="text-[0.6em] leading-none animate-pulse">${lv.info.prop}</div>
                    </div>
                    <div class="text-[8px] font-bold mb-0.5 ${lv.info.textColor} bg-slate-900/50 px-1.5 py-0.5 rounded">Lv.${exactLv} ${lv.info.name}</div>
                    <div class="font-bold text-white bg-slate-900 px-1 py-0.5 rounded text-[9px] sm:text-[10px] w-full text-center truncate border border-slate-700">${idLabel}</div>
                    
                    <!-- XP 및 B 동시 표기 -->
                    <div class="w-full mt-1 flex justify-between items-center px-1 bg-slate-900/40 rounded border border-slate-700/50">
                        <span class="text-[9px] sm:text-[10px] text-sb-blue font-black">${(displayData.xp || 0).toLocaleString()}XP</span>
                        <span class="text-[9px] sm:text-[10px] font-black ${(Number(displayData.bong)||0) < 0 ? 'text-red-400' : 'text-sb-gold'}">${(Number(displayData.bong)||0).toFixed(1)}B</span>
                    </div>

                    ${gmControls}
                </div>`;
            };

            let html = createCard(gmData || {id: 'gm', xp: 0, bong: 0}, true, '마스터 J');
            if(gmaData || window.playerState.isGMA) html += createCard(gmaData || {id: 'gm_a', xp: 0, bong: 0}, true, '마스터 A');
            for(let i=1; i<=13; i++) html += createCard(studentsData.find(s => s.id === String(i)), false, `${i}. ${STUDENT_NAMES[i]}${i===13?' (해적섬)':''}`); 
            container.innerHTML = html;
        };

        window.renderAdminTable = function(studentsData) {
            const tbody = document.getElementById('adminTableBody');
            if(!tbody) return;
            
            tbody.innerHTML = '';
            for(let i=1; i<=13; i++) { 
                const stu = studentsData.find(s => s.id === String(i));
                const canEdit = window.playerState.isGM || (window.playerState.isGMA && String(i) === '13');
                
                if(stu) {
                    const exactLv = calculateExactLevel(stu.xp || 0);
                    let faceEmoji = STUDENT_GENDERS[String(i)] === 'F' ? '👧' : '👦';
                    
                    if (stu.equippedSkins) SKIN_DATA.forEach(sk => { if (stu.equippedSkins[sk.id] && sk.type === 'face') faceEmoji = sk.emoji; }); 
                    if (stu.equippedWeapon) {
                        const wp = WEAPON_DATA.find(w => w.id === stu.equippedWeapon);
                        if (wp) faceEmoji += wp.emoji;
                    }
                    
                    let condStr = '';
                    if(stu.condition && stu.condition.emotion) {
                        const bIcon = stu.condition.body ? stu.condition.body.icon : 'fa-battery-half';
                        const bColor = stu.condition.body ? stu.condition.body.color : 'text-slate-400';
                        condStr = `${stu.condition.emotion.icon} <i class="fa-solid ${bIcon} ${bColor}"></i>`;
                    }
                    
                    tbody.innerHTML += `
                    <tr id="admin-row-${stu.id}" class="border-b border-slate-700 hover:bg-slate-800 ${!canEdit ? 'opacity-50' : ''}">
                        <td class="p-2 cursor-pointer" onclick="window.changeStudentPin('${stu.id}', '${STUDENT_NAMES[i]}')">
                            ${i}. ${STUDENT_NAMES[i]} <span class="text-[8px] text-slate-500">****</span>
                        </td>
                        <td class="p-2 whitespace-nowrap">
                            ${faceEmoji} <span class="text-[9px] text-slate-400">Lv.${exactLv} ${condStr}</span>
                        </td>
                        <td class="p-2 text-sb-blue font-bold cursor-pointer" onclick="window.editStudentStat('${stu.id}', 'xp', '${STUDENT_NAMES[i]}', ${stu.xp || 0})">
                            ${(stu.xp||0)}
                        </td>
                        <td class="p-2 font-bold cursor-pointer ${(Number(stu.bong)||0) < 0 ? 'text-red-400' : 'text-sb-gold'}" onclick="window.editStudentStat('${stu.id}', 'bong', '${STUDENT_NAMES[i]}', ${stu.bong || 0})">
                            ${(Number(stu.bong)||0).toFixed(1)} B
                        </td>
                        <td class="p-2 border-l border-slate-700/50 w-24">
                            ${canEdit ? `<div class="flex gap-1"><button type="button" onclick="event.stopPropagation(); void window.quickReward('xp', 5, '${stu.id}', this)" class="bg-sb-blue/20 text-sb-blue px-1 py-1 rounded text-[8px]">+5X</button><button type="button" onclick="event.stopPropagation(); void window.quickReward('bong', 2, '${stu.id}', this)" class="bg-sb-gold/20 text-yellow-400 px-1 py-1 rounded text-[8px]">+2B</button></div>` : '-'}
                        </td>
                    </tr>`;
                }
            }
        };

        window.renderAdminQuestBoard = function(studentsData) {
            const board = document.getElementById('adminQuestBoard');
            const summaryEl = document.getElementById('adminQuestSummary');
            if(!board) return;
            
            const dailyQuests = QUEST_DATA.filter(q => q.type === 'daily');
            const total = dailyQuests.length;
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            // 열별 오늘 완료 인원 수(한 줄 요약 배지용)
            const colDone = dailyQuests.map(() => 0);
            let sumDoneAll = 0;
            let allClearStudents = 0;

            const headCells = dailyQuests.map((q, qi) => 
                `<th class="p-0.5 sm:p-1 text-center font-normal border-b border-slate-700/90 bg-slate-900/95 min-w-[1.65rem]" title="${q.name} · ${q.desc}">
                    <i class="fa-solid ${q.icon} ${q.color} text-[9px] sm:text-[10px]"></i>
                </th>`
            ).join('');

            let bodyRows = '';
            for (let i = 1; i <= 13; i++) {
                const stu = studentsData.find(s => s.id === String(i));
                const resetOk = stu && stu.lastDailyReset === todayStr;
                let rowDone = 0;
                const cells = dailyQuests.map((q, qi) => {
                    const ok = !!(resetOk && stu.quests && stu.quests[q.id]);
                    if (ok) {
                        rowDone++;
                        colDone[qi]++;
                    }
                    return `<td class="p-0.5 text-center border-b border-slate-800/80 ${ok ? 'text-emerald-400' : 'text-slate-600'}"><span class="font-black">${ok ? '✓' : '·'}</span></td>`;
                }).join('');
                sumDoneAll += rowDone;
                if (stu && rowDone === total && total > 0) allClearStudents++;

                const shortName = `${i}`;
                const rowBg = rowDone === total && total > 0 ? 'bg-emerald-950/35' : '';
                bodyRows += `
                <tr class="${rowBg}">
                    <td class="sticky left-0 z-[1] p-0.5 sm:p-1 pr-1 text-[8px] sm:text-[9px] text-slate-200 font-bold border-b border-r border-slate-700/80 bg-slate-900/98 max-w-[3.2rem] sm:max-w-[4.5rem] truncate" title="${STUDENT_NAMES[i] || ''}">${shortName}. ${STUDENT_NAMES[i] || '-'}</td>
                    ${cells}
                    <td class="p-0.5 text-center border-b border-slate-800/80 text-[8px] sm:text-[9px] tabular-nums text-slate-400 font-bold whitespace-nowrap">${rowDone}/${total}</td>
                </tr>`;
            }

            const avg = sumDoneAll / 13;
            const badgeLine = dailyQuests.map((q, qi) => 
                `<span class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-slate-800/90 border border-slate-600/60 text-[8px] text-slate-300 shrink-0" title="${q.name}"><i class="fa-solid ${q.icon} ${q.color} text-[7px]"></i>${colDone[qi]}</span>`
            ).join('');

            board.innerHTML = `
                <table class="w-full min-w-[280px] text-[8px] sm:text-[9px] border-collapse">
                    <thead>
                        <tr>
                            <th class="sticky left-0 z-[2] p-0.5 sm:p-1 text-left text-slate-400 font-bold border-b border-r border-slate-700 bg-slate-900/98 w-[4.5rem] sm:w-auto">이름</th>
                            ${headCells}
                            <th class="p-0.5 sm:p-1 text-center text-slate-500 font-bold border-b border-slate-700 bg-slate-900/95 whitespace-nowrap">합</th>
                        </tr>
                    </thead>
                    <tbody>${bodyRows}</tbody>
                </table>
                <div class="flex flex-nowrap gap-1 overflow-x-auto px-1 py-1 border-t border-slate-700/60 bg-slate-900/40 max-w-full">
                    <span class="text-[8px] text-slate-500 font-bold shrink-0 self-center">열별 완료</span>
                    ${badgeLine}
                </div>`;

            if (summaryEl) {
                summaryEl.innerHTML = `평균 <span class="text-emerald-300">${avg.toFixed(1)}</span>/${total} · 전원완료 <span class="text-yellow-300">${allClearStudents}</span>명`;
            }
        };

        window.renderHallOfFame = function(students) {
            const legends = students.filter(s => calculateExactLevel(s.xp || 0) >= 100);
            const hofSec = document.getElementById('hallOfFameSection');
            
            if (legends.length > 0) {
                hofSec.classList.remove('hidden');
                document.getElementById('hofContainer').innerHTML = legends.map(s => {
                    let face = STUDENT_GENDERS[s.id] === 'F' ? '👧' : '👦';
                    if (s.equippedSkins) SKIN_DATA.forEach(sk => { if (s.equippedSkins[sk.id] && sk.type === 'face') face = sk.emoji; });
                    return `
                    <div class="glass-panel p-4 rounded-xl border-2 border-yellow-500 bg-gradient-to-b from-yellow-900/60 flex flex-col items-center w-28">
                        <div class="text-3xl mb-1 drop-shadow-lg avatar-legend">👑</div>
                        <div class="text-3xl mb-2 drop-shadow-md">${face}</div>
                        <div class="font-display text-white text-sm">${STUDENT_NAMES[s.id]}</div>
                        <div class="text-[9px] text-yellow-400 mt-1 font-bold">Lv.100 전설</div>
                    </div>`;
                }).join('');
            } else { 
                hofSec.classList.add('hidden'); 
            }
        };

        window.renderLunchQueue = function(studentsData) {
            const container = document.getElementById('lunchQueueContainer');
            if(!container) return;
            
            const now = new Date(); 
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            
            let queue = studentsData.filter(s => s.id !== 'gm' && s.id !== 'gm_a');
            
            queue.sort((a, b) => {
                const aBid = (a.lunchBid && a.lunchBid.date === todayStr) ? a.lunchBid.amount : 0;
                const bBid = (b.lunchBid && b.lunchBid.date === todayStr) ? b.lunchBid.amount : 0;
                if (bBid !== aBid) return bBid - aBid; 
                return (b.xp || 0) - (a.xp || 0); 
            });
            
            container.innerHTML = queue.map((s, idx) => {
                const bidAmt = (s.lunchBid && s.lunchBid.date === todayStr) ? s.lunchBid.amount : 0;
                const exactLv = calculateExactLevel(s.xp || 0);
                let face = STUDENT_GENDERS[s.id] === 'F' ? '👧' : '👦';
                
                if (s.equippedSkins) SKIN_DATA.forEach(sk => { if (s.equippedSkins[sk.id] && sk.type === 'face') face = sk.emoji; });
                
                const rankColor = idx === 0 ? 'text-yellow-400 font-black' : (idx < 3 ? 'text-orange-300 font-bold' : 'text-slate-300 font-bold');
                const borderClass = idx === 0 ? 'border-yellow-500 bg-yellow-900/40 ring-1 ring-yellow-500' : 'border-slate-700 bg-slate-800/50';
                const crown = idx === 0 ? '<i class="fa-solid fa-crown text-yellow-400 text-[10px] absolute -top-2 left-1/2 transform -translate-x-1/2"></i>' : '';
                
                return `
                <div class="flex items-center justify-between p-3 rounded-xl border ${borderClass} relative">
                    <div class="flex items-center gap-3">
                        <div class="w-6 text-center text-lg ${rankColor}">${idx + 1}</div>
                        <div class="text-3xl relative">${crown}${face}</div>
                        <div>
                            <div class="font-bold text-sm text-white">${STUDENT_NAMES[s.id]}</div>
                            <div class="text-[10px] text-slate-400">Lv.${exactLv} ${bidAmt > 0 ? '· <span class="text-orange-300">VIP</span>' : ''}</div>
                        </div>
                    </div>
                    <div class="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-600 text-right min-w-[60px]">
                        <div class="text-orange-400 font-black text-xs">${bidAmt > 0 ? '+' : ''}${bidAmt} B</div>
                    </div>
                </div>`;
            }).join('');
        };

        window.renderEstate = function() {
            const grid = document.getElementById('estateGrid');
            if(!grid || !window.estateState) return;

            document.getElementById('btnEstateReset').style.display = window.playerState.isAdmin ? 'block' : 'none';

            const logEl = document.getElementById('estatePurchaseLog');
            if (logEl) {
                const hist = Array.isArray(window.estateState.purchaseHistory) ? [...window.estateState.purchaseHistory].reverse() : [];
                if (hist.length === 0) {
                    logEl.innerHTML = '<div class="text-slate-600">아직 기록이 없습니다.</div>';
                } else {
                    logEl.innerHTML = hist.slice(0, 50).map(h => {
                        if (!h) return '';
                        const name = STUDENT_NAMES[h.studentId] || h.studentId;
                        const note = h.note ? ' · ' + h.note : '';
                        const t = h.at ? new Date(h.at).toLocaleString('ko-KR') : '';
                        const sn = typeof h.seatId === 'number' ? (h.seatId + 1) : '?';
                        return '<div class="border-b border-slate-700/40 pb-0.5">' + t + ' — ' + name + ' · ' + sn + '번 자리 · ' + (h.price != null ? h.price : '?') + 'B' + note + '</div>';
                    }).join('');
                }
            }

            grid.innerHTML = window.estateState.seats.map((seat) => {
                if (ESTATE_HIDDEN_SEAT_IDS.includes(seat.id)) {
                    return `<div class="bg-slate-900/40 border border-dashed border-slate-600/60 rounded-xl p-3 text-center opacity-50 pointer-events-none select-none grayscale">
                        <div class="text-slate-500 font-bold text-[10px] mb-1"><i class="fa-solid fa-xmark text-slate-600"></i> 비활성</div>
                        <div class="text-slate-500 text-[10px]">${seat.id + 1}번 자리</div>
                        <div class="text-[9px] text-slate-600 mt-1">배치 없음</div>
                    </div>`;
                }
                if (seat.owner) {
                    const ownerName = STUDENT_NAMES[seat.owner] || '학생';
                    return `<div class="bg-teal-900/40 border border-teal-500 rounded-xl p-3 text-center shadow-[0_0_10px_rgba(20,184,166,0.3)]">
                        <div class="text-teal-400 font-bold text-xs mb-1">판매완료</div>
                        <div class="text-white text-[10px]">${ownerName}</div>
                    </div>`;
                }
                if (seat.locked) {
                    const gmOnClick = window.playerState.isAdmin ? `onclick="window.toggleSeatLock(${seat.id})"` : '';
                    return `<div class="bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-center transition ${window.playerState.isAdmin ? 'cursor-pointer hover:border-red-500' : ''}" ${gmOnClick}>
                        <div class="text-slate-500 font-bold text-xs mb-1"><i class="fa-solid fa-lock text-red-900"></i> 잠김</div>
                        <div class="text-slate-600 text-[10px]">${seat.id + 1}번 자리</div>
                    </div>`;
                }
                const clickAction = window.playerState.isAdmin ? `onclick="window.toggleSeatLock(${seat.id})"` : `onclick="window.buyEstateSeat(${seat.id}, ${seat.price})"`;
                return `<div class="bg-slate-800 border border-slate-600 hover:border-sb-gold rounded-xl p-3 text-center cursor-pointer transition group" ${clickAction}>
                    <div class="text-slate-300 font-bold text-xs mb-1 group-hover:text-white">${seat.id + 1}번 자리</div>
                    <div class="text-sb-gold text-[10px] bg-slate-900 px-1 py-0.5 rounded inline-block border border-slate-700">${seat.price} B</div>
                </div>`;
            }).join('');
        };

        window.visitBank = function() {
            window.switchTab('bank');
        };

        /** 레거시 필드 → 일반예금으로 이전 후 불필요 키 정리 */
        function migrateBankPlayerFields() {
            if (!window.playerState) return false;
            let touched = false;
            if (window.playerState.bankRegularSavings == null || window.playerState.bankRegularSavings === undefined) {
                window.playerState.bankRegularSavings = Number(window.playerState.bankSavings) || 0;
                touched = true;
            }
            if (!Array.isArray(window.playerState.bankTermDeposits)) {
                window.playerState.bankTermDeposits = [];
                touched = true;
            }
            if (window.playerState.bankDailyBonusLastDate == null || window.playerState.bankDailyBonusLastDate === undefined) {
                window.playerState.bankDailyBonusLastDate = '';
                touched = true;
            }
            if (Object.prototype.hasOwnProperty.call(window.playerState, 'bankSavings')) {
                delete window.playerState.bankSavings;
                touched = true;
            }
            if (Object.prototype.hasOwnProperty.call(window.playerState, 'bankLastInterestMonth')) {
                delete window.playerState.bankLastInterestMonth;
                touched = true;
            }
            return touched;
        }

        /**
         * 적금 만기(가입일 기준 30일 경과): 만기 시점의 마스터 설정 이자율(%)로 이자를 반올림하여 원금+이자를 지갑으로 지급.
         * @returns {{ changed: boolean, msgs: string[] }}
         */
        function applyBankTermDepositMaturity() {
            const out = { changed: false, msgs: [] };
            if (!window.playerState || window.playerState.isGuest) return out;
            const rate = Number(window.globalSettings && window.globalSettings.bankInterestPercent) || 0;
            const arr = window.playerState.bankTermDeposits || [];
            const left = [];
            for (const td of arr) {
                if (!td || td.amount == null || !td.startDate) continue;
                const elapsed = bankCalendarDaysElapsed(td.startDate);
                if (elapsed >= 30) {
                    const principal = Number(td.amount) || 0;
                    const interest = Math.round(principal * (rate / 100));
                    const total = normalizeBongValue(principal + interest);
                    window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + total);
                    out.changed = true;
                    out.msgs.push(`원금 ${principal.toFixed(1)} B + 이자 ${interest} B → 지갑 ${total.toFixed(1)} B`);
                } else {
                    left.push(td);
                }
            }
            if (out.changed) window.playerState.bankTermDeposits = left;
            return out;
        }

        /** 일반예금+적금 원금 합 100 B 이상: 마지막 지급일 기준 3일마다 지갑으로 1 B */
        function applyBankRegularDailyBonus() {
            if (!window.playerState || window.playerState.isGuest || window.playerState.isAdmin) return false;
            const total = getBankTotalDeposits();
            if (total < 100) return false;
            const today = getLocalDateStr();
            const last = window.playerState.bankDailyBonusLastDate || '';
            if (last) {
                const diff = bankDaysBetweenLocalDateStr(last, today);
                if (diff < 3) return false;
            }
            window.playerState.bankDailyBonusLastDate = today;
            window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + 1);
            return true;
        }

        window.updateBankPanel = function() {
            const w = document.getElementById('bankWalletDisplay');
            const s = document.getElementById('bankRegularDisplay');
            const r = document.getElementById('bankRateDisplay');
            const dailyLine = document.getElementById('bankDailyBonusLine');
            const termList = document.getElementById('bankTermDepositsList');
            if (!w || !s || !r) return;
            const rate = Number(window.globalSettings && window.globalSettings.bankInterestPercent) || 0;
            w.textContent = `${(window.playerState.bong != null ? Number(window.playerState.bong) : 0).toFixed(1)} B`;
            s.textContent = `${(Number(window.playerState.bankRegularSavings) || 0).toFixed(1)} B`;
            r.textContent = `${rate.toFixed(1)}`;
            if (dailyLine) {
                const total = getBankTotalDeposits();
                const today = getLocalDateStr();
                const last = window.playerState.bankDailyBonusLastDate || '';
                const gotToday = last === today;
                if (total < 100) {
                    dailyLine.textContent = '일반예금+적금 원금 합계 100 B 이상이면, 마지막 지급일 기준 3일마다 1 B가 지갑으로 지급됩니다.';
                } else if (gotToday) {
                    dailyLine.textContent = '오늘 주기 보너스(1 B)를 이미 받았습니다.';
                } else {
                    const diff = last ? bankDaysBetweenLocalDateStr(last, today) : 999;
                    if (!last || diff >= 3) {
                        dailyLine.textContent = '주기 보너스(1 B): 이번 접속에서 지급 처리됩니다.';
                    } else {
                        dailyLine.textContent = `다음 주기 보너스까지 약 ${3 - diff}일 남았습니다. (3일마다 1 B)`;
                    }
                }
            }
            if (termList) {
                const arr = window.playerState.bankTermDeposits || [];
                if (arr.length === 0) {
                    termList.innerHTML = '<p class="text-[10px] text-slate-500 py-1">아직 가입한 적금이 없습니다. 아래에서 보물상자 적금을 만들 수 있어요.</p>';
                } else {
                    termList.innerHTML = arr.map((td, idx) => {
                        const elapsed = bankCalendarDaysElapsed(td.startDate);
                        // 가입 당일=1일째 … 30일째 만기 (경과 일수+1, 상한 30)
                        const daysShow = Math.min(30, elapsed + 1);
                        const interestPrev = Math.round((Number(td.amount) || 0) * (rate / 100));
                        const sid = String(td.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        return `<div class="border border-amber-600/35 rounded-xl p-3 bg-slate-900/60 mb-2 text-left">
                            <div class="flex justify-between items-start gap-2">
                                <div class="min-w-0 flex-1">
                                    <div class="text-amber-200 font-bold text-sm">보물상자 #${idx + 1} 🔒</div>
                                    <div class="text-[10px] text-slate-400 mt-0.5">원금 <span class="text-white font-bold">${(Number(td.amount) || 0).toFixed(1)} B</span></div>
                                    <div class="text-[10px] text-sky-300 mt-1">누적 <span class="font-bold">${daysShow}</span>일 / 30일</div>
                                    <div class="text-[9px] text-slate-500 mt-0.5">만기 시 이자(현재 설정 ${rate}% 기준, 반올림): 약 ${interestPrev} B · 만기 시 이율은 만기 당시 설정이 적용됩니다.</div>
                                </div>
                                <button type="button" onclick="window.earlyWithdrawTermDeposit('${sid}')" class="text-[10px] shrink-0 bg-red-900/50 hover:bg-red-800 text-red-100 px-2 py-1 rounded border border-red-800/80">중도해지</button>
                            </div>
                        </div>`;
                    }).join('');
                }
            }
        };

        /** 일반예금 입금 (마스터·학생 동일하게 지갑에서 차감) */
        window.depositBank = async function() {
            if (window.playerState.isGuest) return window.customAlert('게스트는 이용할 수 없어요.');
            const inp = document.getElementById('bankDepositInput');
            const raw = inp && inp.value !== '' ? parseFloat(inp.value) : NaN;
            if (!Number.isFinite(raw) || raw <= 0) return window.customAlert('0보다 큰 금액을 입력하세요.');
            const amt = Math.round(raw * 10) / 10;
            const wallet = Number(window.playerState.bong) || 0;
            if (wallet < amt) return window.customAlert(`보유 삼봉이 부족합니다. (현재 ${wallet.toFixed(1)} B)`);
            const ok = await window.customConfirm(`일반예금 통장에 ${amt} B를 넣을까요?\n(일반예금은 이자가 없습니다.)`);
            if (!ok) return;
            window.playerState.bong = normalizeBongValue(wallet - amt);
            window.playerState.bankRegularSavings = normalizeBongValue((Number(window.playerState.bankRegularSavings) || 0) + amt);
            if (inp) inp.value = '';
            updateUI();
            await saveDataToCloud();
            window.customAlert(`🏦 일반예금에 ${amt} B를 넣었습니다.`);
        };

        /** 일반예금 출금 */
        window.withdrawBank = async function() {
            if (window.playerState.isGuest) return window.customAlert('게스트는 이용할 수 없어요.');
            const inp = document.getElementById('bankWithdrawInput');
            const raw = inp && inp.value !== '' ? parseFloat(inp.value) : NaN;
            if (!Number.isFinite(raw) || raw <= 0) return window.customAlert('0보다 큰 금액을 입력하세요.');
            const amt = Math.round(raw * 10) / 10;
            const sav = Number(window.playerState.bankRegularSavings) || 0;
            if (sav < amt) return window.customAlert('일반예금 잔액이 부족합니다.');
            const ok = await window.customConfirm(`일반예금에서 ${amt} B를 지갑으로 출금할까요?`);
            if (!ok) return;
            window.playerState.bankRegularSavings = normalizeBongValue(sav - amt);
            window.playerState.bong = normalizeBongValue(window.playerState.bong + amt);
            if (inp) inp.value = '';
            updateUI();
            await saveDataToCloud();
            window.customAlert(`💵 ${amt} B를 찾았습니다.`);
        };

        /** 일반예금 전액을 지갑으로 출금 */
        window.withdrawBankAll = async function() {
            if (window.playerState.isGuest) return window.customAlert('게스트는 이용할 수 없어요.');
            const sav = Number(window.playerState.bankRegularSavings) || 0;
            if (sav <= 0) return window.customAlert('일반예금에 출금할 잔액이 없습니다.');
            const ok = await window.customConfirm(`일반예금 ${sav.toFixed(1)} B를 전부 지갑으로 출금할까요?`);
            if (!ok) return;
            window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + sav);
            window.playerState.bankRegularSavings = 0;
            const inp = document.getElementById('bankWithdrawInput');
            if (inp) inp.value = '';
            updateUI();
            await saveDataToCloud();
            await window.customAlert(`💵 ${sav.toFixed(1)} B를 모두 찾았습니다.`);
        };

        /** 적금(보물상자) 가입 — 안내 후 확인 */
        window.openTermDeposit = async function() {
            if (window.playerState.isGuest) return window.customAlert('게스트는 이용할 수 없어요.');
            await window.customAlert(
                '📦 적금(보물상자) 안내\n\n' +
                '· 넣은 금액은 30일 동안 보물상자에 잠깁니다.\n' +
                '· 30일이 지나 만기되면, 그때 마스터가 설정한 이자율(%)을 원금에 적용한 이자(반올림)와 함께 지갑으로 돌아옵니다.\n' +
                '· 이자율이 바뀌면, 만기 처리 시점의 이율이 적용됩니다.\n' +
                '· 중도 해지 시 원금만 돌려받고 이자는 없습니다.\n' +
                '· 일반예금과 적금은 따로 관리됩니다.'
            );
            const ok = await window.customConfirm('위 내용을 확인했고, 적금에 가입할까요?');
            if (!ok) return;
            const inp = document.getElementById('bankTermDepositInput');
            const raw = inp && inp.value !== '' ? parseFloat(inp.value) : NaN;
            if (!Number.isFinite(raw) || raw <= 0) return window.customAlert('0보다 큰 금액을 입력하세요.');
            const amt = Math.round(raw * 10) / 10;
            const w0 = Number(window.playerState.bong) || 0;
            if (w0 < amt) return window.customAlert(`보유 삼봉이 부족합니다. (현재 ${w0.toFixed(1)} B)`);
            if (!window.playerState.bankTermDeposits) window.playerState.bankTermDeposits = [];
            window.playerState.bong = normalizeBongValue(w0 - amt);
            const id = `td_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            window.playerState.bankTermDeposits.push({ id, amount: amt, startDate: getLocalDateStr() });
            if (inp) inp.value = '';
            updateUI();
            await saveDataToCloud();
            await window.customAlert(`🎁 보물상자 적금 ${amt} B가 시작되었습니다. 30일 후 만기를 기다려 주세요!`);
        };

        /** 적금 중도 해지 — 원금만 지갑으로, 이자 없음 */
        window.earlyWithdrawTermDeposit = async function(termId) {
            if (window.playerState.isGuest) return window.customAlert('게스트는 이용할 수 없어요.');
            const arr = window.playerState.bankTermDeposits || [];
            const idx = arr.findIndex(t => String(t.id) === String(termId));
            if (idx < 0) return window.customAlert('해당 적금을 찾을 수 없어요.');
            const td = arr[idx];
            const ok = await window.customConfirm(
                `중도 해지 시 이자는 지급되지 않고 원금 ${(Number(td.amount) || 0).toFixed(1)} B만 지갑으로 돌아갑니다.\n해지할까요?`
            );
            if (!ok) return;
            const principal = Number(td.amount) || 0;
            arr.splice(idx, 1);
            window.playerState.bankTermDeposits = arr;
            window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + principal);
            updateUI();
            await saveDataToCloud();
            await window.customAlert(`💰 원금 ${principal.toFixed(1)} B가 지갑으로 반환되었습니다. (중도 해지로 이자 없음)`);
        };

        window.saveBankInterestRate = async function() {
            if (!window.playerState.isGM) return window.customAlert('마스터 J만 저장할 수 있습니다.');
            const el = document.getElementById('gmBankInterestRate');
            const v = el ? parseFloat(el.value) : NaN;
            if (!Number.isFinite(v) || v < 0 || v > 100) return window.customAlert('0~100 사이의 이자율(%)을 입력하세요.');
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { bankInterestPercent: v }, { merge: true });
                await window.customAlert(`적금 만기 이자율을 ${v}% 로 저장했습니다.\n(적금이 30일 만기될 때 이 비율이 적용됩니다.)`);
            } catch (e) {
                window.customAlert('저장 실패: ' + e.message);
            }
        };

        /**
         * 마스터 J 전용: 오류로 비워진 드래곤볼 보관함을 Firestore에 복구합니다.
         * 학번·성구는 쉼표로 구분; 기존 보관함과 합쳐 중복 제거 후 저장합니다.
         */
        window.restoreDragonBallsAdmin = async function () {
            if (!window.playerState.isGM) return window.customAlert('마스터 J 전용 기능입니다.');
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다.');
            const idsEl = document.getElementById('dragonBallRecoveryStudentIds');
            const ballsEl = document.getElementById('dragonBallRecoveryBallNums');
            const rawIds = idsEl && idsEl.value ? idsEl.value : '';
            const rawBalls = ballsEl && ballsEl.value ? ballsEl.value : '';
            const idTokens = rawIds.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
            const ballTokens = rawBalls.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
            if (idTokens.length === 0) return window.customAlert('학번을 하나 이상 입력하세요. (쉼표로 구분)');
            if (ballTokens.length === 0) return window.customAlert('복구할 성구 번호(1~7)를 하나 이상 입력하세요.');
            const balls = [];
            for (const t of ballTokens) {
                const n = parseInt(t, 10);
                if (!Number.isFinite(n) || n < 1 || n > 7) {
                    return window.customAlert(`성구 번호는 1~7만 가능합니다. 잘못된 값: ${t}`);
                }
                if (!balls.includes(n)) balls.push(n);
            }
            balls.sort((a, b) => a - b);
            const weekendKey = getWeekendSaturdayKey() || getLastSaturdayDateKey();
            const ok = await window.customConfirm(
                `다음 학생 ${idTokens.length}명의 보관함에 성구 [${balls.join(', ')}]를 합산 반영하고,\n주말 키를 "${weekendKey}" 로 맞춥니다.\n(기존에 있던 성구와 합쳐 중복은 제거됩니다.)\n계속할까요?`
            );
            if (!ok) return;
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                let okCount = 0;
                const errors = [];
                for (const sid of idTokens) {
                    if (sid === 'gm' || sid === 'gm_a') {
                        errors.push(`${sid}: 마스터 계정은 제외`);
                        continue;
                    }
                    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + sid);
                    let existing = [];
                    try {
                        const snap = await readStudentDocPreferServer(ref);
                        if (snap.exists()) {
                            const d = snap.data() || {};
                            existing = Array.isArray(d.dragonBalls)
                                ? d.dragonBalls.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 7)
                                : [];
                        }
                    } catch (e) {
                        errors.push(`${sid}: 읽기 실패`);
                        continue;
                    }
                    const merged = [...new Set([...existing, ...balls])].filter((n) => n >= 1 && n <= 7).sort((a, b) => a - b);
                    try {
                        await setDoc(ref, { dragonBalls: merged, dragonBallWeekendKey: weekendKey }, { merge: true });
                        okCount++;
                        const myId = localStorage.getItem('sambong_student_id');
                        if (myId === sid && window.playerState && !window.playerState.isGuest) {
                            window.playerState.dragonBalls = merged;
                            window.playerState.dragonBallWeekendKey = weekendKey;
                        }
                        const list = window.allStudentsData;
                        if (list && list.length) {
                            const i = list.findIndex((s) => String(s.id) === String(sid));
                            if (i >= 0) {
                                list[i].dragonBalls = merged;
                                list[i].dragonBallWeekendKey = weekendKey;
                            }
                        }
                    } catch (e) {
                        errors.push(`${sid}: ${e && e.message ? e.message : String(e)}`);
                    }
                }
                updateUI();
                let msg = `처리 완료: ${okCount}명`;
                if (errors.length) msg += '\n\n' + errors.join('\n');
                await window.customAlert(msg);
            } catch (e) {
                console.error('restoreDragonBallsAdmin', e);
                await window.customAlert('복구 중 오류: ' + (e && e.message ? e.message : String(e)));
            }
        };

        // ==========================================
        // ★ 내 상태 UI 및 퀘스트/인벤토리 처리 ★
        // ==========================================
        function updateUI() {
            /** docRef 없다고 전체 UI를 건너뛰면, 스냅샷이 playerState만 갱신한 뒤 대시보드·퀘스트가 영원히 옛값으로 남음(실시간 동기화 깨짐) */
            if (!window.playerState) return;
            const canRunBankSideEffects = !window.playerState.isGuest && currentStudentDocRef;

            if(!window.playerState.ownedSkins) window.playerState.ownedSkins = {};
            if(!window.playerState.equippedSkins) window.playerState.equippedSkins = {};
            if(!window.playerState.inventory) window.playerState.inventory = [];
            if(!window.playerState.lunchBid) window.playerState.lunchBid = {date: '', amount: 0};
            if(!window.playerState.questHistory) window.playerState.questHistory = [];
            if(!window.playerState.usedRaidPasswords) window.playerState.usedRaidPasswords = [];
            const bankMigrateTouched = migrateBankPlayerFields();
            let bankProcessingNeedSave = bankMigrateTouched;
            if (canRunBankSideEffects) {
                const termRes = applyBankTermDepositMaturity();
                if (termRes.changed) {
                    bankProcessingNeedSave = true;
                    if (termRes.msgs.length > 0) {
                        setTimeout(() => {
                            void window.customAlert(
                                '🎁 적금 만기!\n\n' +
                                termRes.msgs.join('\n') +
                                '\n\n원금과 이자가 지갑으로 입금되었습니다. (이자는 반올림)'
                            );
                        }, 80);
                    }
                }
                if (applyBankRegularDailyBonus()) {
                    bankProcessingNeedSave = true;
                    setTimeout(() => {
                        void window.customAlert('🏦 예금 주기 보너스: 일반+적금 원금 합 100 B 이상 유지로 이번 주기 1 B가 지갑에 들어왔습니다! (3일마다 지급)');
                    }, 120);
                }
                /**
                 * 새 주말(토요일 키가 바뀜)일 때만 보관함 초기화.
                 * dragonBallWeekendKey가 비어 있던 계정은 첫 주말 접속 시 키만 채우고 비우지 않음(기존 버그로 수집분이 날아가던 현상 방지).
                 */
                const satKey = getWeekendSaturdayKey();
                if (satKey) {
                    const prevKey = window.playerState.dragonBallWeekendKey || '';
                    if (prevKey && prevKey !== satKey) {
                        window.playerState.dragonBallWeekendKey = satKey;
                        window.playerState.dragonBalls = [];
                        bankProcessingNeedSave = true;
                    } else if (!prevKey) {
                        window.playerState.dragonBallWeekendKey = satKey;
                        bankProcessingNeedSave = true;
                    }
                }
            }

            if (window.playerState.isAdmin) {
                document.getElementById('tab-admin').classList.remove('hidden');
                document.getElementById('todoPanel').classList.add('hidden'); 
                if(window.playerState.isGM) {
                    document.getElementById('gmResetPanel').classList.remove('hidden');
                    document.getElementById('dbAdminStatus').classList.remove('hidden');
                    const plazaGM = document.getElementById('plazaGMControls');
                    if(plazaGM) plazaGM.classList.remove('hidden');
                    const bankRatePanel = document.getElementById('bankInterestAdminPanel');
                    if (bankRatePanel) bankRatePanel.classList.remove('hidden');
                    const dbRec = document.getElementById('dragonBallRecoveryPanel');
                    if (dbRec) dbRec.classList.remove('hidden');
                    const shopPricePanel = document.getElementById('gmShopPricePanel');
                    if (shopPricePanel) shopPricePanel.classList.remove('hidden');
                } else {
                    const bankRatePanel = document.getElementById('bankInterestAdminPanel');
                    if (bankRatePanel) bankRatePanel.classList.add('hidden');
                    const dbRec = document.getElementById('dragonBallRecoveryPanel');
                    if (dbRec) dbRec.classList.add('hidden');
                    const shopPricePanel = document.getElementById('gmShopPricePanel');
                    if (shopPricePanel) shopPricePanel.classList.add('hidden');
                }
            } else {
                document.getElementById('tab-admin').classList.add('hidden');
                document.getElementById('todoPanel').classList.remove('hidden');
                const plazaGM = document.getElementById('plazaGMControls');
                if(plazaGM) plazaGM.classList.add('hidden');
                const bankRatePanel = document.getElementById('bankInterestAdminPanel');
                if (bankRatePanel) bankRatePanel.classList.add('hidden');
                const dbRec = document.getElementById('dragonBallRecoveryPanel');
                if (dbRec) dbRec.classList.add('hidden');
                const shopPricePanel = document.getElementById('gmShopPricePanel');
                if (shopPricePanel) shopPricePanel.classList.add('hidden');
            }
            
            checkTimeEvents();
            
            const xp = window.playerState.xp || 0;
            const lvInfo = getLevelInfo(xp); 
            const exactLv = calculateExactLevel(xp);
            
            let face = STUDENT_GENDERS[localStorage.getItem('sambong_student_id')] === 'F' ? '👧' : '👦';
            if (window.playerState.isAdmin) face = window.playerState.isGM ? '🐉' : '🏴‍☠️';
            let overlays = '';
            
            let cardBorder = 'border-slate-600';
            let cardGlow = 'shadow-lg';

            if(window.playerState.equippedSkins) { 
                SKIN_DATA.forEach(s => { 
                    if(window.playerState.equippedSkins[s.id]) { 
                        if(s.type === 'face' && !window.playerState.isAdmin) face = s.emoji; 
                        if(s.type === 'overlay') overlays += `<span class="absolute ${s.overlayClass} pointer-events-none">${s.emoji}</span>`; 
                        if(s.type === 'aura') { cardBorder = s.border; cardGlow = s.glow; }
                    }
                }); 
            }

            if(window.playerState.equippedWeapon) {
                const wp = WEAPON_DATA.find(w => w.id === window.playerState.equippedWeapon);
                if(wp) overlays += `<span class="absolute top-1/2 -translate-y-1/2 -left-12 text-[0.6em] z-30 drop-shadow-lg animate-bounce">${wp.emoji}</span>`;
            }
            
            const dashCard = document.getElementById('dashAvatarCard');
            if (dashCard) dashCard.className = `glass-panel rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden bg-card-grad ${cardGlow} border-2 ${cardBorder} transition duration-300`;
            
            document.getElementById('dashAvatar').innerHTML = `<div class="relative inline-block leading-none">${face}${overlays}</div><div class="text-[0.5em] absolute -bottom-1 -right-2 animate-pulse">${window.playerState.isAdmin?'👑':lvInfo.info.prop}</div>`;
            document.getElementById('dashName').innerText = STUDENT_NAMES[localStorage.getItem('sambong_student_id')] || '손님';
            document.getElementById('dashLevelName').innerText = window.playerState.isAdmin ? '마스터 권한' : `Lv.${exactLv} ${lvInfo.info.name}`;
            document.getElementById('dashXp').innerText = xp.toLocaleString();
            const dashBongEl = document.getElementById('dashBong');
            if (dashBongEl) {
                const bBal = Number(window.playerState.bong) || 0;
                dashBongEl.innerText = bBal.toFixed(1);
                dashBongEl.classList.remove('text-sb-gold', 'text-red-400');
                dashBongEl.classList.add(bBal < 0 ? 'text-red-400' : 'text-sb-gold');
            }

            const hp = (window.playerState.shieldHP || 0) + (window.playerState.hasShield ? 100 : 0);
            document.getElementById('dashShield').innerHTML = hp > 0 ? `🛡️<span class="text-[10px] bg-indigo-600 px-1 rounded absolute -top-1 -right-2 font-bold text-white border border-indigo-400 shadow">${hp}</span>` : '';
            
            document.getElementById('dashJobBadge').innerHTML = (window.playerState.jobs||[]).map(j => `
                <div class="w-6 h-6 rounded-full bg-slate-900 border flex items-center justify-center ${j.color}">
                    <i class="fa-solid ${j.icon} text-[10px]"></i>
                </div>`).join('');

            let prevMax = lvInfo.index > 0 ? LEVEL_DATA[lvInfo.index-1].max : 0;
            let curMax = lvInfo.info.max === Infinity ? xp : lvInfo.info.max;
            let progress = exactLv >= 100 ? 100 : ((xp - prevMax) / (curMax - prevMax)) * 100;
            
            document.getElementById('expBar').style.width = window.playerState.isAdmin ? '100%' : `${Math.min(100, Math.max(0, progress))}%`;
            document.getElementById('expText').innerText = window.playerState.isAdmin ? 'MAX' : (exactLv >= 100 ? 'MAX' : `${Math.floor(progress)}%`);

            const invPanel = document.getElementById('weaponSlots');
            if (invPanel) {
                const inv = window.playerState.inventory || [];
                const counts = {};
                inv.forEach((id) => {
                    counts[id] = (counts[id] || 0) + 1;
                });
                invPanel.innerHTML = WEAPON_DATA.map((wp) => {
                    const n = counts[wp.id] || 0;
                    const isEquipped = window.playerState.equippedWeapon === wp.id;
                    const borderCls =
                        n === 0
                            ? 'opacity-40 border-slate-700 bg-slate-900/50'
                            : isEquipped
                              ? 'border-sb-gold bg-yellow-900/40 ring-2 ring-sb-gold scale-105'
                              : `${wp.border} ${wp.bg}`;
                    const click = n > 0 ? `onclick="window.equipWeapon('${wp.id}')"` : '';
                    const cursor = n > 0 ? 'cursor-pointer hover:scale-105' : 'cursor-default';
                    return `
                        <div ${click} class="${cursor} border-2 rounded-xl p-1.5 sm:p-2 flex flex-col items-center justify-center min-w-0 transition transform ${borderCls} relative">
                            ${isEquipped && n > 0 ? '<div class="absolute -top-1 -right-0.5 bg-sb-gold text-slate-900 text-[7px] font-black px-0.5 rounded z-10">E</div>' : ''}
                            <div class="text-lg sm:text-2xl mb-0.5 leading-none">${wp.emoji}</div>
                            <div class="text-[8px] sm:text-[9px] font-bold text-white text-center leading-tight line-clamp-2">${wp.name}</div>
                            <div class="text-[8px] text-amber-200/90 mt-0.5 font-bold">×${n}</div>
                            ${
                                n > 0
                                    ? `<div class="text-[7px] text-emerald-400 font-bold">+${wp.bonus}</div>`
                                    : '<div class="text-[7px] text-slate-600">미보유</div>'
                            }
                        </div>`;
                }).join('');
            }

            if(window.playerState.condition && window.playerState.condition.emotion) {
                window.selectEmotion(window.playerState.condition.emotion.id, false);
                window.selectBody(window.playerState.condition.body.val, false);
            }

            const dailyQuestList = QUEST_DATA.filter(q => q.type === 'daily');
            document.getElementById('todoContainer').innerHTML = dailyQuestList.map(q => {
                const done = window.playerState.quests && window.playerState.quests[q.id];
                return `
                <label class="flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${done ? 'border-cyan-400/80 bg-gradient-to-r from-cyan-950/70 to-slate-900/80 shadow-[0_0_12px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/30' : 'bg-slate-900/60 border-slate-700'}">
                    <input type="checkbox" class="todo-checkbox hidden" ${done ? 'checked' : ''} onchange="window.${done ? 'cancelQuest' : 'attemptQuest'}('${q.id}', ${q.xp}, ${q.bong})">
                    <div class="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${done?'border-cyan-400 bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.5)]':'border-slate-500'}">
                        <i class="fa-solid fa-check text-white text-[10px] ${done?'opacity-100':'opacity-0'}"></i>
                    </div>
                    <div class="flex-grow min-w-0">
                        <div class="text-xs font-bold ${done ? 'text-cyan-100' : q.color} truncate">${done ? '<span class="text-[9px] text-cyan-300 mr-1">완료</span>' : ''}${q.name}</div>
                    </div>
                    <div class="shrink-0 bg-slate-800 px-1.5 py-0.5 rounded text-right">
                        <span class="text-sb-blue text-[9px] font-bold block">+${q.xp}</span>
                    </div>
                </label>`;
            }).join('');

            const dqHint = document.getElementById('dailyQuestProgressHint');
            if (dqHint && window.playerState && !window.playerState.isGuest && !window.playerState.isAdmin) {
                const n = dailyQuestList.length;
                const doneN = dailyQuestList.filter((q) => window.playerState.quests && window.playerState.quests[q.id]).length;
                dqHint.textContent = `오늘 일일퀘스트 ${doneN} / ${n} 완료 · 서버에 저장되어 새로고침해도 유지됩니다`;
                dqHint.classList.remove('hidden');
            } else if (dqHint) {
                dqHint.classList.add('hidden');
            }

            const dbSlots = document.getElementById('dragonBallSlots');
            if(dbSlots) {
                const dbBox = document.getElementById('dragonballContainer');
                if (dbBox) dbBox.classList.remove('hidden');
                const collected = window.playerState.dragonBalls || [];
                let slotsHtml = '';
                
                for(let i=1; i<=7; i++) {
                    if (collected.includes(i)) {
                        let starsHtml = ''; 
                        for(let s=0; s<i; s++) starsHtml += `<i class="fa-solid fa-star text-red-700 drop-shadow-md text-[6px] sm:text-[8px] m-[0.5px]"></i>`;
                        slotsHtml += `
                        <div class="w-8 h-8 sm:w-10 sm:h-10 dragonball-3d shadow-md shrink-0">
                            <div class="flex flex-wrap items-center justify-center w-[70%] h-[70%] leading-none">${starsHtml}</div>
                        </div>`;
                    } else {
                        slotsHtml += `
                        <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-amber-900/50 border-2 border-amber-800/50 shadow-inner text-amber-700 font-black text-xs shrink-0">${i}</div>`;
                    }
                }
                dbSlots.innerHTML = slotsHtml;
            }

            const renderQuests = (quests, containerId) => {
                const today = new Date().getDay();
                document.getElementById(containerId).innerHTML = quests.map(q => {
                    const done = window.playerState.quests && window.playerState.quests[q.id];
                    const unlocked = window.playerState.unlockedQuests && window.playerState.unlockedQuests[q.id];
                    let cls = "border-slate-700"; 
                    let act = `window.attemptQuest('${q.id}', ${q.xp}, ${q.bong})`; 
                    let icn = q.icon ? `<i class="fa-solid ${q.icon} mr-1 text-slate-500"></i>` : '';
                    
                    if (done) {
                        cls =
                            q.type === 'daily'
                                ? 'border-cyan-400/80 bg-gradient-to-br from-cyan-950/50 to-slate-900/80 ring-1 ring-cyan-500/35 shadow-[0_0_12px_rgba(34,211,238,0.12)]'
                                : 'border-sb-blue bg-slate-800';
                        icn = `<i class="fa-solid fa-check ${q.type === 'daily' ? 'text-cyan-300' : 'text-sb-blue'} mr-1"></i>`;
                        act = `window.cancelQuest('${q.id}', ${q.xp}, ${q.bong})`;
                    }
                    else if (q.type === 'locked' && !unlocked) { 
                        cls = "opacity-50 border-slate-700"; 
                        act = `window.promptUnlock('${q.id}')`; 
                    }
                    else if (q.type === 'locked' && unlocked) { 
                        cls = "border-emerald-500"; 
                        icn = `<i class="fa-solid fa-unlock text-emerald-400 mr-1"></i>`; 
                    }
                    else if (q.type === 'weekly' && today !== 5 && !window.playerState.isAdmin) { 
                        cls = "opacity-50 border-slate-700"; 
                        act = `window.customAlert('금요일에만 가능합니다!')`; 
                    }
                    
                    let ext = ''; 
                    if(q.id === 'q1') ext = `<span class="text-orange-400 text-[9px] ml-1">(🔥${window.playerState.earlyBirdCount||0}/5)</span>`;

                    return `
                    <button onclick="${act}" class="w-full text-left p-3 rounded-xl border bg-slate-800/50 transition flex justify-between items-center ${cls}">
                        <div class="flex-grow min-w-0 pr-2">
                            <div class="font-bold ${done?'text-slate-400':q.color} text-sm truncate">${icn}${q.name}${ext}</div>
                            <div class="text-[9px] text-slate-400 truncate">${q.desc}</div>
                        </div>
                        <div class="shrink-0 bg-slate-900 px-2 py-1 rounded text-right">
                            <span class="text-sb-blue font-bold text-[10px] block">+${q.xp}X</span>
                            <span class="text-sb-gold font-bold text-[10px] block">+${q.bong.toFixed(1)}B</span>
                        </div>
                    </button>`;
                }).join('');
            };
            
            renderQuests(QUEST_DATA.filter(q => q.type === 'daily'), 'dailyQuestContainer');
            renderQuests(QUEST_DATA.filter(q => q.type === 'weekly'), 'weeklyQuestContainer');
            renderQuests(QUEST_DATA.filter(q => q.type === 'locked'), 'specialQuestContainer');

            // 밥줄 탭: 식단표 UI 갱신
            renderLunchMenuUI();

            JOB_DATA.forEach(job => {
                const card = document.getElementById(`job-card-${job.id}`);
                if (card) {
                    const isEquipped = window.playerState.jobs && window.playerState.jobs.some(j => j.name === job.name);
                    const existCheck = card.querySelector('.job-check-icon'); 
                    if(existCheck) existCheck.remove();
                    
                    if (isEquipped) { 
                        card.classList.add('ring-1', 'ring-sb-blue', 'bg-slate-800'); 
                        card.classList.replace(`border-l-${job.color.replace('text-', '')}`, 'border-l-sb-blue'); 
                        card.innerHTML += `<div class="job-check-icon absolute top-2 right-2 text-sb-blue"><i class="fa-solid fa-circle-check"></i></div>`; 
                    } else { 
                        card.classList.remove('ring-1', 'ring-sb-blue', 'bg-slate-800'); 
                        card.classList.replace('border-l-sb-blue', `border-l-${job.color.replace('text-', '')}`); 
                    }
                }
            });

            SKIN_DATA.forEach(skin => {
                const item = document.getElementById(`skin-btn-${skin.id}`); 
                const status = document.getElementById(`skin-status-${skin.id}`);
                
                if (item && status) {
                    const isOwned = window.playerState.ownedSkins[skin.id]; 
                    const isEquipped = window.playerState.equippedSkins[skin.id];
                    
                    if (isOwned) {
                        item.classList.replace('unaffordable', 'affordable'); 
                        item.classList.add('border-pink-500'); 
                        status.innerHTML = isEquipped 
                            ? '<span class="text-[9px] bg-pink-500 text-white px-2 py-1 rounded">장착중</span>' 
                            : '<span class="text-[9px] border border-pink-500 text-pink-400 px-2 py-1 rounded">보유중</span>';
                    } else {
                        item.classList.remove('border-pink-500');
                        if (window.playerState.bong >= skin.price || window.playerState.isAdmin) { 
                            item.classList.replace('unaffordable', 'affordable'); 
                        } else { 
                            item.classList.replace('affordable', 'unaffordable'); 
                        }
                        status.innerHTML = `<div class="text-pink-400 bg-slate-900 px-2 py-1 rounded border text-[10px] font-bold">${skin.price} B</div>`;
                    }
                }
            });

            SHOP_DATA.forEach(shop => {
                const item = document.getElementById('shop-btn-' + shop.id);
                if (item) {
                    const eff = getEffectiveShopPrice(shop.id);
                    if (shop.id === 'item_shield') {
                        const stock = window.globalSettings.shieldStock !== undefined ? window.globalSettings.shieldStock : 10;
                        let stockDiv = item.querySelector('.stock-display');
                        if (!stockDiv) {
                            stockDiv = document.createElement('div');
                            stockDiv.className = 'stock-display text-[10px] font-bold mt-0.5';
                            const fg = item.querySelector('.flex-grow');
                            if (fg) fg.appendChild(stockDiv);
                        }
                        stockDiv.innerText = stock <= 0 ? '(품절)' : `(남은재고: ${stock}개)`;
                        stockDiv.className = stock <= 0 ? 'stock-display text-[10px] font-bold mt-0.5 text-red-400' : 'stock-display text-[10px] font-bold mt-0.5 text-indigo-300';
                        
                        if ((window.playerState.bong >= eff || window.playerState.isAdmin) && stock > 0) { 
                            item.classList.replace('unaffordable', 'affordable'); 
                        } else { 
                            item.classList.replace('affordable', 'unaffordable'); 
                        } 
                    } else {
                        if (window.playerState.bong >= eff || window.playerState.isAdmin) { 
                            item.classList.replace('unaffordable', 'affordable'); 
                        } else { 
                            item.classList.replace('affordable', 'unaffordable'); 
                        } 
                    }
                }
            });

            updateShopPriceLabels();

            const logEl = document.getElementById('classPurchaseLog');
            if (logEl && window.playerState && !window.playerState.isGuest) {
                const arr = window.playerState.classEventPurchases;
                if (arr && arr.length > 0) {
                    const lines = arr.slice(-5).reverse().map((entry) => {
                        const d = entry.at ? new Date(entry.at) : null;
                        const ds = d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : '';
                        return `<div class="flex justify-between gap-2"><span class="text-pink-300/90 truncate">${entry.name || entry.id}</span><span class="text-slate-500 shrink-0">${ds} · ${entry.price}B</span></div>`;
                    });
                    logEl.innerHTML = '<div class="text-[10px] text-slate-500 font-bold mb-1">최근 학급 활동 예약</div>' + lines.join('');
                    logEl.classList.remove('hidden');
                } else {
                    logEl.innerHTML = '';
                    logEl.classList.add('hidden');
                }
            }

            updateLunchInvestLockUI();
            window.updateBankPanel();
            if (bankProcessingNeedSave) saveDataToCloud();

            // 스피드 퀴즈: 로그인 직후·상태 갱신 시 진행 중인 퀴즈 팝업을 다시 맞춤 (선생님이 먼저 출제한 경우 포함)
            if (typeof window.syncMasterQuizModal === 'function') window.syncMasterQuizModal();
        }

        // 밥줄: 보유 10B 이하(또는 마이너스)면 추가 투자 불가
        function updateLunchInvestLockUI() {
            const hint = document.getElementById('lunchInvestLockHint');
            const btn = document.getElementById('lunchBidSubmitBtn');
            const input = document.getElementById('lunchBidInput');
            if (!hint || !btn || !input || !window.playerState) return;
            if (window.playerState.isGuest || window.playerState.isAdmin) {
                hint.classList.add('hidden');
                btn.disabled = false;
                input.disabled = false;
                return;
            }
            const bal = Number(window.playerState.bong) || 0;
            const locked = bal <= 10;
            hint.classList.toggle('hidden', !locked);
            btn.disabled = locked;
            input.disabled = locked;
        }


        // ==========================================
        // ★ 로그인, 식권 구매 및 데이터 저장 로직 ★
        // ==========================================
        document.getElementById('btnLogin').onclick = () => {
            attemptLogin(document.getElementById('loginId').value, document.getElementById('loginPin').value, false);
        };
        
        window.loginAsGuest = function() {
            window.playerState = { 
                xp: 8500, bong: 120.0, quests: {}, unlockedQuests: {}, 
                jobs: [{name: '게스트', icon: 'fa-eye', color: 'text-slate-400'}], 
                ownedSkins: {}, equippedSkins: {}, hasShield: false, shieldHP: 100, 
                inventory: ['wp1'], equippedWeapon: 'wp1', lunchBid: {date: '', amount: 0}, questHistory: [], usedRaidPasswords: [],
                dragonBalls: [], dragonBallWeekendKey: '',
                bankRegularSavings: 0, bankTermDeposits: [], bankDailyBonusLastDate: '', dailyAllClearBonusDate: '',
                isGuest: true, isGM: false, isGMA: false, isAdmin: false 
            };
            
            document.getElementById('loginOverlay').style.opacity = '0'; 
            setTimeout(() => document.getElementById('loginOverlay').classList.add('hidden'), 500);
            document.getElementById('saveStatus').classList.replace('hidden', 'flex');
            document.getElementById('playerNameDisplay').innerText = "손님"; 
            document.getElementById('cloudIcon').className = "fa-solid fa-eye-slash text-slate-400";
            
            _prevXpFromSnapshot = Number(window.playerState.xp) || 0;
            updateUI(); 
            window.switchTab('plaza');
        };
        
        window.logout = async function() { 
            const isOk = await window.customConfirm("로그아웃 할까요?"); 
            if(isOk) { localStorage.clear(); location.reload(); } 
        };

        async function attemptLogin(studentId, pin, isAutoLogin) {
            // Firebase 미초기화(구버전 번들 등) 시 안내
            if (!auth || !db) {
                if (!isAutoLogin) await window.customAlert('서버에 연결되지 않았습니다. 페이지를 새로고침 후 다시 시도해 주세요.');
                return;
            }
            try {
                await auth.authStateReady();
                if (!auth.currentUser) await signInAnonymously(auth);
            } catch (e) {
                if (!isAutoLogin) await window.customAlert('인증 연결에 실패했습니다: ' + (e.message || String(e)));
                return;
            }
            if (!auth.currentUser) {
                if (!isAutoLogin) await window.customAlert('인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
                return;
            }
            try {
                await auth.currentUser.getIdToken();
            } catch (e) {
                if (!isAutoLogin) await window.customAlert('인증 토큰을 받지 못했습니다. 네트워크 확인 후 다시 시도해 주세요.');
                return;
            }
            if (!studentId) {
                if (!isAutoLogin) await window.customAlert('이름(학번)을 선택해 주세요.');
                return;
            }
            const isGM = (studentId === 'gm'); 
            const isGMA = (studentId === 'gm_a'); 
            const isAdmin = isGM || isGMA;
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + studentId);
            
            try {
                const docSnap = await getDoc(docRef); 
                let data = docSnap.exists() ? docSnap.data() : null;
                
                if (data) {
                    if (!data.pin) {
                        if (isAutoLogin) return; 
                        const isOk = await window.customConfirm(`[${STUDENT_NAMES[studentId]}]\n입력하신 [${pin}] 번호가 앞으로 계속 쓸 비밀번호가 됩니다.\n이대로 접속할까요?`);
                        if(!isOk) return; 
                        data.pin = pin; 
                        await setDoc(docRef, { pin: pin }, { merge: true });
                    } else if (data.pin !== pin) {
                        if (isAutoLogin) { localStorage.clear(); location.reload(); return; }
                        return await window.customAlert("❌ 비밀번호가 틀렸어요!");
                    }
                } else {
                    if (isAutoLogin) return; 
                    const isOk = await window.customConfirm(`[${STUDENT_NAMES[studentId]}]\n입력하신 [${pin}] 번호가 앞으로 계속 쓸 비밀번호가 됩니다.\n이대로 접속할까요?`);
                    if(!isOk) return;
                    
                    data = { pin, xp: 0, bong: 0.0, quests: {}, unlockedQuests: {}, jobs: [], ownedSkins: {}, equippedSkins: {}, inventory: [], equippedWeapon: null, hasShield: false, shieldHP: 0, lunchBid: {date: '', amount: 0}, lastLunchDeductDate: '', questHistory: [], usedRaidPasswords: [], dragonBalls: [], dragonBallWeekendKey: '', bankRegularSavings: 0, bankTermDeposits: [], bankDailyBonusLastDate: '', dailyAllClearBonusDate: '', classEventPurchases: [] };
                    await setDoc(docRef, data);
                }

                window.playerState = { ...data, isGuest: false, isGM, isGMA, isAdmin };
                localStorage.setItem('sambong_student_id', studentId);
                localStorage.setItem('sambong_student_pin', pin);
                currentStudentDocRef = docRef;
                /** 로그인 직후에도 checkTimeEvents·스냅샷과 동일한 일일 퀘스트 달력 동기화 */
                if (!isAdmin) {
                    const dq = applyDailyQuestResetIfNewDay({ silent: true });
                    if (dq.needSave) await saveDataToCloud();
                }
                if (!window.playerState.classEventPurchases) window.playerState.classEventPurchases = [];
                if (window.playerState.bong != null) window.playerState.bong = normalizeBongValue(window.playerState.bong);
                _prevXpFromSnapshot = Number(window.playerState.xp) || 0;
                window._suppressXpSyncToast = true;
                setTimeout(() => { window._suppressXpSyncToast = false; }, 1200);
                
                document.getElementById('loginOverlay').style.opacity = '0'; 
                setTimeout(() => document.getElementById('loginOverlay').classList.add('hidden'), 500);
                document.getElementById('saveStatus').classList.replace('hidden', 'flex');
                document.getElementById('playerNameDisplay').innerText = STUDENT_NAMES[studentId];
                document.getElementById('cloudIcon').className = "fa-solid fa-cloud text-sb-blue";
                
                updateUI(); 
                window.renderPlaza(window.allStudentsData, window.gmData, window.gmaData); 
                void window.applyPersonalLunchDeductionIfNeeded();
                /** 새로고침·재접속 시 항상 광장 탭(마스터도 동일 — 일괄 지급은 광장 상단 패널) */
                window.switchTab('plaza');
            } catch (e) { 
                await window.customAlert("에러: " + e.message); 
            }
        }

        async function saveDataToCloud() {
            if (window.playerState.isGuest || !currentStudentDocRef) return;
            const dataToSave = { ...window.playerState };
            delete dataToSave.isGuest;
            delete dataToSave.isGM;
            delete dataToSave.isGMA;
            delete dataToSave.isAdmin;
            if (Object.prototype.hasOwnProperty.call(dataToSave, 'bong')) {
                dataToSave.bong = normalizeBongValue(dataToSave.bong);
            }
            /** 직후 스냅샷의 XP 상승을 '내 저장'과 구분해 잘못된 안내 방지 */
            window._suppressXpSyncToast = true;
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) {
                    console.warn('saveDataToCloud: 익명 인증 실패');
                    return;
                }
                await setDoc(currentStudentDocRef, dataToSave, { merge: true });
            } catch (e) {
                console.warn('saveDataToCloud', e);
            } finally {
                setTimeout(() => { window._suppressXpSyncToast = false; }, 1000);
            }
        }

        window.submitLunchBid = async function() {
            if (window.playerState.isGuest) return window.customAlert("👀 게스트는 이용할 수 없어요.");
            if (window.playerState.isAdmin) return window.customAlert("선생님은 식권 경매에 참여할 수 없습니다.");
            
            const bal = Number(window.playerState.bong) || 0;
            if (bal <= 10) return window.customAlert("보유 삼봉이 10B 이하(또는 마이너스)인 경우 밥줄에 추가 투자할 수 없어요.");

            const inputEl = document.getElementById('lunchBidInput');
            const amt = parseInt(inputEl.value);
            
            if (isNaN(amt) || amt <= 0) return window.customAlert('정확한 금액을 입력해주세요.');
            if (window.playerState.bong < amt) return window.customAlert(`❌ 돈이 부족해요. ${(amt - window.playerState.bong).toFixed(1)}B가 더 필요해요.`);
            
            const ok = await window.customConfirm(`급식을 먼저 먹기 위해 ${amt}B를 결제할까요?\n(이미 결제했다면 합산됩니다.)`);
            if (ok) {
                window.playerState.bong -= amt;
                
                const now = new Date(); 
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                
                if (!window.playerState.lunchBid || window.playerState.lunchBid.date !== todayStr) {
                    window.playerState.lunchBid = { date: todayStr, amount: 0 };
                }
                window.playerState.lunchBid.amount += amt;
                
                updateUI();
                await saveDataToCloud();
                playSfx('bong', false); 
                
                await window.customAlert(`✅ 결제 완료!\n오늘 총 ${window.playerState.lunchBid.amount}B를 썼습니다.\n밥줄 탭에서 순위를 확인해보세요.`);
                inputEl.value = '';
            }
        };

        function renderLunchMenuUI() {
            const openBtn = document.getElementById('btnOpenLunchMenu');
            const emptyText = document.getElementById('lunchMenuEmptyText');
            const adminPanel = document.getElementById('lunchMenuAdminPanel');
            const updatedText = document.getElementById('lunchMenuUpdatedText');
            const titleInput = document.getElementById('lunchMenuTitleInput');
            const thumbWrap = document.getElementById('lunchMenuThumbWrap');
            const thumbImg = document.getElementById('lunchMenuThumbImg');
            const thumbPdf = document.getElementById('lunchMenuThumbPdf');

            const title = window.globalSettings && window.globalSettings.lunchMenuTitle ? String(window.globalSettings.lunchMenuTitle) : '';
            const url = window.globalSettings && window.globalSettings.lunchMenuUrl ? String(window.globalSettings.lunchMenuUrl) : '';
            const updatedAt = window.globalSettings && window.globalSettings.lunchMenuUpdatedAt ? window.globalSettings.lunchMenuUpdatedAt : 0;

            const hasUrl = !!url;
            const resType = hasUrl ? getLunchMenuResourceType(url) : 'other';
            if(openBtn) openBtn.classList.toggle('hidden', !hasUrl);
            if(emptyText) emptyText.classList.toggle('hidden', hasUrl);
            if(adminPanel) adminPanel.classList.toggle('hidden', !(window.playerState && window.playerState.isAdmin));

            if (thumbWrap && thumbImg && thumbPdf) {
                thumbWrap.classList.toggle('hidden', !hasUrl);
                if (hasUrl) {
                    if (resType === 'image') {
                        thumbImg.classList.remove('hidden');
                        thumbImg.src = url;
                        thumbPdf.classList.add('hidden');
                    } else if (resType === 'pdf') {
                        thumbImg.classList.add('hidden');
                        thumbImg.removeAttribute('src');
                        thumbPdf.classList.remove('hidden');
                        const pdfIcon = thumbPdf.querySelector('i');
                        const pdfLabel = thumbPdf.querySelector('span');
                        if (pdfIcon) { pdfIcon.className = 'fa-solid fa-file-pdf text-5xl text-red-400'; }
                        if (pdfLabel) pdfLabel.textContent = 'PDF 식단표';
                    } else {
                        thumbImg.classList.add('hidden');
                        thumbImg.removeAttribute('src');
                        thumbPdf.classList.remove('hidden');
                        const pdfIcon = thumbPdf.querySelector('i');
                        const pdfLabel = thumbPdf.querySelector('span');
                        if (pdfIcon) { pdfIcon.className = 'fa-solid fa-link text-5xl text-emerald-400'; }
                        if (pdfLabel) pdfLabel.textContent = '웹·링크 식단표';
                    }
                } else {
                    thumbImg.classList.add('hidden');
                    thumbImg.removeAttribute('src');
                    thumbPdf.classList.add('hidden');
                }
            }

            if(updatedText) {
                if(updatedAt) {
                    const d = new Date(updatedAt);
                    updatedText.innerText = `업데이트: ${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                } else {
                    updatedText.innerText = '';
                }
            }

            // 관리자 입력칸은 비어있을 때만 자동 채움 (작성중 방해 방지)
            // 파일 업로드 중에는 스냅샷으로 인한 덮어쓰기·빈 값 동기화 충돌 방지
            if(window.playerState && window.playerState.isAdmin && !window._lunchMenuUploading) {
                if(titleInput && (titleInput.value || '') === '' && title) titleInput.value = title;
            }
        }

        window.openLunchMenuLightbox = function(src) {
            const lb = document.getElementById('lunchMenuLightbox');
            const im = document.getElementById('lunchMenuLightboxImg');
            if (!lb || !im || !src) return;
            im.src = src;
            lb.classList.remove('hidden');
        };

        window.closeLunchMenuLightbox = function() {
            const lb = document.getElementById('lunchMenuLightbox');
            const im = document.getElementById('lunchMenuLightboxImg');
            if (lb) lb.classList.add('hidden');
            if (im) { im.src = ''; }
        };

        window.openLunchMenu = function() {
            const title = window.globalSettings && window.globalSettings.lunchMenuTitle ? String(window.globalSettings.lunchMenuTitle) : '식단표';
            const url = window.globalSettings && window.globalSettings.lunchMenuUrl ? String(window.globalSettings.lunchMenuUrl) : '';
            if(!url) return window.customAlert('첨부된 식단표가 없습니다.');

            const modal = document.getElementById('lunchMenuModal');
            const body = document.getElementById('lunchMenuModalBody');
            const titleEl = document.getElementById('lunchMenuModalTitle');
            if(titleEl) titleEl.innerText = `식단표 · ${title}`;
            if(body) {
                const attrUrl = escapeHtmlAttr(url);
                const kind = getLunchMenuResourceType(url);
                if (kind === 'pdf') {
                    body.innerHTML = `<embed src="${attrUrl}" type="application/pdf" class="w-full h-[70vh] rounded-xl" />`;
                } else if (kind === 'image') {
                    body.textContent = '';
                    const wrap = document.createElement('div');
                    wrap.className = 'space-y-2';
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'block w-full rounded-xl overflow-hidden border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500';
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = '식단표';
                    img.className = 'w-full max-h-[65vh] object-contain bg-slate-950';
                    img.decoding = 'async';
                    btn.appendChild(img);
                    btn.addEventListener('click', function() { window.openLunchMenuLightbox(url); });
                    wrap.appendChild(btn);
                    const hint = document.createElement('p');
                    hint.className = 'text-center text-[10px] text-slate-400 font-bold';
                    hint.textContent = '이미지를 탭하면 전체 화면으로 확대됩니다.';
                    wrap.appendChild(hint);
                    body.appendChild(wrap);
                } else {
                    body.innerHTML = `<iframe src="${attrUrl}" class="w-full h-[70vh] rounded-xl border border-slate-700" referrerpolicy="no-referrer"></iframe>`;
                }
            }
            if(modal) modal.classList.remove('hidden');
        };

        window.closeLunchMenu = function() {
            window.closeLunchMenuLightbox();
            const modal = document.getElementById('lunchMenuModal');
            if(modal) modal.classList.add('hidden');
        };

        window.saveLunchMenu = async function(options) {
            if(!window.playerState || !window.playerState.isAdmin) return;
            const opts = options || {};
            const skipSuccessAlert = !!opts.skipSuccessAlert;
            const titleEl = document.getElementById('lunchMenuTitleInput');
            let title = (titleEl?.value || '').trim();
            if (Object.prototype.hasOwnProperty.call(opts, 'titleOverride')) {
                const t = opts.titleOverride;
                if (t != null && String(t).trim() !== '') title = String(t).trim();
            }

            const payload = {
                lunchMenuTitle: title || '식단표',
                lunchMenuUpdatedAt: Date.now()
            };
            // 업로드 완료 시에만 다운로드 URL 갱신 (수동 저장은 제목·시간만 merge — 기존 lunchMenuUrl 유지)
            if (Object.prototype.hasOwnProperty.call(opts, 'urlOverride')) {
                const u = String(opts.urlOverride || '').trim();
                if (u) payload.lunchMenuUrl = u;
            }

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), payload, { merge: true });
            if (titleEl && title) titleEl.value = title;
            if (!skipSuccessAlert) await window.customAlert('✅ 저장되었습니다.');
        };

        window.clearLunchMenu = async function() {
            if(!window.playerState || !window.playerState.isAdmin) return;
            const ok = await window.customConfirm('식단표 첨부를 삭제할까요?');
            if(!ok) return;
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), {
                lunchMenuTitle: '',
                lunchMenuUrl: '',
                lunchMenuUpdatedAt: Date.now()
            }, { merge: true });
            window.customAlert('✅ 식단표가 삭제되었습니다.');
        };

        window.pickLunchMenuFile = function() {
            if(!window.playerState || !window.playerState.isAdmin) return;
            if (window._lunchMenuUploading) return;
            const input = document.getElementById('lunchMenuFileInput');
            if(!input) return;
            input.value = '';
            input.onchange = async () => {
                const file = input.files && input.files[0] ? input.files[0] : null;
                if(!file) return;
                try {
                    await window.uploadLunchMenuFile(file);
                } catch (e) {
                    console.error('pickLunchMenuFile', e);
                }
            };
            input.click();
        };

        /** 업로드 직전: Auth 준비 완료 + 익명 로그인 보장(Storage 쓰기 토큰) */
        async function ensureFirebaseAuthForUpload() {
            if (!auth) throw new Error('Firebase Auth가 없습니다.');
            await auth.authStateReady();
            if (!auth.currentUser) {
                try {
                    await signInAnonymously(auth);
                } catch (e) {
                    const m = e && e.message ? String(e.message) : String(e);
                    throw new Error('익명 로그인 실패: Firebase 콘솔 → Authentication → 로그인 방법에서 「익명」을 켜 주세요.\n(' + m + ')');
                }
            }
            if (auth.currentUser) await auth.currentUser.getIdToken(true);
        }

        /** 식단표 파일 업로드: uploadBytes 단일 요청(재개 업로드 0% 정지 이슈 회피). 경로는 artifacts/{appId}/public/... */
        window.uploadLunchMenuFile = async function(file) {
            if(!window.playerState || !window.playerState.isAdmin) return;
            if(!storage) {
                await window.customAlert('Storage가 초기화되지 않았습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
                return;
            }
            if(!file) return;
            if (window._lunchMenuUploading) return;

            const maxBytes = 15 * 1024 * 1024;
            if(file.size > maxBytes) {
                await window.customAlert('파일이 너무 큽니다. (최대 15MB)');
                return;
            }

            const safeName = (file.name || 'menu').replace(/[^\w.\-() ]+/g, '_');
            // Firestore 데이터와 동일한 appId 하위 public 경로 — Storage 규칙과 맞춤
            const path = `artifacts/${appId}/public/data/lunch-menu/${Date.now()}_${safeName}`;
            const refObj = storageRef(storage, path);

            const statusEl = document.getElementById('lunchMenuUploadStatus');
            const uploadBtn = document.getElementById('lunchMenuUploadBtn');
            window._lunchMenuUploading = true;
            if (uploadBtn) uploadBtn.disabled = true;

            const lower = (file.name || '').toLowerCase();
            let contentType = (file.type || '').trim();
            if (!contentType) {
                if (lower.endsWith('.pdf')) contentType = 'application/pdf';
                else if (lower.endsWith('.png')) contentType = 'image/png';
                else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg';
                else if (lower.endsWith('.webp')) contentType = 'image/webp';
                else if (lower.endsWith('.gif')) contentType = 'image/gif';
                else contentType = 'application/octet-stream';
            }

            try {
                if (statusEl) statusEl.textContent = '인증 확인 중…';
                await ensureFirebaseAuthForUpload();
                if (statusEl) statusEl.textContent = '업로드 중… (완료될 때까지 잠시만 기다려 주세요)';

                const meta = { contentType: contentType || 'application/octet-stream' };
                await uploadBytes(refObj, file, meta);

                const downloadUrl = await getDownloadURL(refObj);
                const urlStr = String(downloadUrl || '').trim();
                if (!urlStr) throw new Error('다운로드 URL을 가져오지 못했습니다.');

                const titleEl = document.getElementById('lunchMenuTitleInput');
                const titleFromForm = (titleEl?.value || '').trim();
                const saveOpts = { skipSuccessAlert: true, urlOverride: urlStr };
                if (titleFromForm) saveOpts.titleOverride = titleFromForm;
                await window.saveLunchMenu(saveOpts);
                await window.customAlert('✅ 파일 업로드 및 식단표 저장이 완료되었습니다.');
            } catch (e) {
                console.error('uploadLunchMenuFile', e);
                const code = e && e.code ? String(e.code) : '';
                const msg = e && e.message ? String(e.message) : String(e);
                let hint = '';
                if (code === 'storage/unauthorized' || code === 'storage/permission-denied' || /permission|unauthorized|403/i.test(msg)) {
                    hint = '\n\n※ [필요 조치] Firebase 콘솔 → Storage → 규칙에 인증된 사용자(익명 포함)의 쓰기를 허용해 주세요. 예:\n'
                        + 'match /artifacts/' + appId + '/public/{path=**} { allow read: if true; allow write: if request.auth != null; }';
                } else if (/auth\/|익명|anonymous|ADMIN_ONLY/i.test(msg) || code === 'auth/admin-restricted-operation') {
                    hint = '\n\n※ [필요 조치] Firebase 콘솔 → Authentication → 로그인 방법 → 「익명」 사용을 켜 주세요.';
                }
                await window.customAlert('업로드 또는 저장에 실패했습니다.\n' + (code ? '[' + code + '] ' : '') + msg + hint);
            } finally {
                window._lunchMenuUploading = false;
                if (uploadBtn) uploadBtn.disabled = false;
                if (statusEl) statusEl.textContent = '';
            }
        };


        // ==========================================
        // ★ 퀘스트, 아이템, 무기 및 부동산 로직 ★
        // ==========================================

        /** 빈 자리일 때 석서영(13번) 학생의 지정 자리(8번) 소유를 복구하고, 구매 기록에 남깁니다. (다른 자리를 이미 사도 복구 가능) */
        window.ensureEstateSeokRestore = async function() {
            if (!db || !window.estateState || !Array.isArray(window.estateState.seats)) return;
            const idx = ESTATE_RESTORE_SEOK_SEAT_INDEX;
            const seat = window.estateState.seats[idx];
            if (!seat || seat.locked || seat.owner) return;
            seat.owner = '13';
            if (!Array.isArray(window.estateState.purchaseHistory)) window.estateState.purchaseHistory = [];
            window.estateState.purchaseHistory.push({
                studentId: '13', seatId: idx, price: seat.price || 500, at: Date.now(),
                note: '자동 복구(데이터 동기화 시 빈 자리 감지)'
            });
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'estate', 'state'), window.estateState);
            } catch (e) { console.warn('ensureEstateSeokRestore', e); }
        };
        
        window.buyEstateSeat = async function(seatId, price) {
            if(window.playerState.isGuest || window.playerState.isAdmin) return window.customAlert('학생만 자리를 구매할 수 있습니다.');
            if (ESTATE_HIDDEN_SEAT_IDS.includes(seatId)) return;
            if(!window.estateState || !window.estateState.seats[seatId]) return;
            
            const seat = window.estateState.seats[seatId];
            if(seat.owner) return window.customAlert('이미 판매 완료된 자리입니다.');
            if(seat.locked) return window.customAlert('현재 잠겨있는 자리입니다.');
            
            if(window.playerState.bong < price) return window.customAlert(`자산(B)이 부족합니다! (${price} B 필요)`);

            const ok = await window.customConfirm(`${seatId + 1}번 자리를 ${price}B에 구매하시겠습니까?`);
            if(!ok) return;

            window.playerState.bong -= price;
            await saveDataToCloud();
            
            seat.owner = window.playerState.id;
            if (!Array.isArray(window.estateState.purchaseHistory)) window.estateState.purchaseHistory = [];
            window.estateState.purchaseHistory.push({
                studentId: String(window.playerState.id),
                seatId: seatId,
                price: price,
                at: Date.now()
            });
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'estate', 'state'), window.estateState);
            window.customAlert(`🎉 ${seatId + 1}번 자리를 구매했습니다! 자리표에 내 이름이 새겨집니다.`);
        };

        window.toggleSeatLock = async function(seatId) {
            if(!window.playerState.isAdmin) return;
            if (ESTATE_HIDDEN_SEAT_IDS.includes(seatId)) return;
            const seat = window.estateState.seats[seatId];
            const msg = seat.locked ? `${seatId+1}번 자리 잠금을 해제할까요?` : `${seatId+1}번 자리를 학생이 구매할 수 없도록 잠글까요?`;
            const ok = await window.customConfirm(msg);
            if(ok) {
                seat.locked = !seat.locked;
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'estate', 'state'), window.estateState);
            }
        };

        window.masterResetEstate = async function() {
            if(!window.playerState.isAdmin) return;
            const ok = await window.customConfirm('정말로 모든 학생의 자리를 초기화하고 매물로 내놓으시겠습니까?\n\n※ 자리 구매 기록(감사 로그)은 삭제되지 않습니다.\n※ 석서영 학생 지정 자리는 규칙에 따라 다시 부여됩니다.');
            if(!ok) return;

            const prevHistory = (window.estateState && Array.isArray(window.estateState.purchaseHistory))
                ? [...window.estateState.purchaseHistory] : [];
            const initialSeats = buildInitialEstateSeats();
            initialSeats[ESTATE_RESTORE_SEOK_SEAT_INDEX].owner = '13';
            initialSeats[ESTATE_RESTORE_SEOK_SEAT_INDEX].locked = false;
            prevHistory.push({
                studentId: '13',
                seatId: ESTATE_RESTORE_SEOK_SEAT_INDEX,
                price: 500,
                at: Date.now(),
                note: '전체 초기화 후 석서영 자리 복구'
            });
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'estate', 'state'), { seats: initialSeats, purchaseHistory: prevHistory });
            window.customAlert("✅ 부동산 전체 자리가 초기화되었습니다. (구매 기록은 보존되었습니다.)");
        };

        window.equipWeapon = async function(wpId) {
            if (window.playerState.isGuest) return window.customAlert("👀 게스트는 이용할 수 없어요.");
            if (window.playerState.equippedWeapon === wpId) window.playerState.equippedWeapon = null; 
            else window.playerState.equippedWeapon = wpId; 
            updateUI(); saveDataToCloud(); window.switchTab('plaza'); 
        };

        async function handleQuestDrop(xp) {
            // 기본 드랍 확률 배율 (무기 인벤 0개면 가중↑, 1개면 기본, 2개 이상이면 감쇠)
            let dropMultiplier = 1.0;
            if (!window.playerState.inventory) window.playerState.inventory = [];
            const invenCount = window.playerState.inventory.length;
            
            if (invenCount === 0) dropMultiplier = 6.0;
            else if (invenCount === 1) dropMultiplier = 1.0;
            else dropMultiplier = 0.5;

            // 총 경험치가 낮은 학생일수록 무기 획득 확률 추가 가중 (퀘스트 보상 xp와는 별개)
            const totalXp = Number(window.playerState.xp) || 0;
            dropMultiplier *= 1 + getLowXpBoostFactor(totalXp) * 2.0;

            const rand = Math.random() * 100;
            let dropped = null;
            
            // 아주 낮은 기본 드랍율 설정
            if (xp >= 500) {
                if (rand < 2 * dropMultiplier) dropped = 'wp5'; 
                else if (rand < 5 * dropMultiplier) dropped = 'wp4'; 
                else if (rand < 10 * dropMultiplier) dropped = 'wp3';
            } else if (xp >= 100) {
                if (rand < 0.5 * dropMultiplier) dropped = 'wp4'; 
                else if (rand < 2 * dropMultiplier) dropped = 'wp3'; 
                else if (rand < 5 * dropMultiplier) dropped = 'wp2';
            } else if (xp >= 50) {
                if (rand < 0.2 * dropMultiplier) dropped = 'wp3'; 
                else if (rand < 1 * dropMultiplier) dropped = 'wp2'; 
                else if (rand < 3 * dropMultiplier) dropped = 'wp1';
            } else {
                if (rand < 0.1 * dropMultiplier) dropped = 'wp2'; 
                else if (rand < 1.5 * dropMultiplier) dropped = 'wp1';
            }

            if (dropped) {
                const wp = WEAPON_DATA.find(w => w.id === dropped);
                const hadSame = (window.playerState.inventory || []).filter((id) => id === dropped).length;
                window.playerState.inventory.push(dropped);
                if (hadSame > 0) {
                    const comp = 10;
                    window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + comp);
                    await window.customAlert(
                        `🎁 [${wp.emoji} ${wp.name}] 중복 획득!\n컬렉션에 추가되었고, 보너스로 ${comp} B를 드려요.`
                    );
                } else {
                    await window.customAlert(
                        `🎉 [무기 획득!]\n[${wp.emoji} ${wp.name}] (데미지 +${wp.bonus}) 이 컬렉션에 추가되었어요!\n같은 종류를 탭하면 장착합니다.`
                    );
                }
            }
        }

        window.attemptQuest = async function(qId, xp, bong) {
            if (window.playerState.isGuest) return await window.customAlert("👀 게스트는 이용할 수 없어요.");
            if (window.playerState.quests[qId]) return;

            let finalXp = xp; 
            let finalBong = bong; 
            let isEarlyBirdJackpot = false;
            let buffAmount = 0;
            
            if (window.playerState.equippedWeapon) {
                buffAmount = Math.max(1, Math.floor(xp * 0.05));
                finalXp += buffAmount;
            }
            
            if (qId === 'q1') {
                window.playerState.earlyBirdCount = (window.playerState.earlyBirdCount || 0) + 1;
                if (new Date().getDay() === 5 && window.playerState.earlyBirdCount >= 5) { 
                    finalXp += 20; isEarlyBirdJackpot = true; window.playerState.earlyBirdCount = 0; 
                }
            }

            const oldLv = getLevelInfo(window.playerState.xp).index;
            window.playerState.xp += finalXp;
            window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + Number(finalBong));
            window.playerState.quests[qId] = true;

            const qMeta = QUEST_DATA.find((q) => q.id === qId);
            if (qMeta && qMeta.type === 'daily' && !window.playerState.lastDailyReset) {
                window.playerState.lastDailyReset = getLocalDateStr();
            }

            // 일일 퀘스트를 모두 완료한 날 1회 보너스 (50 XP, 10 B)
            const dailyIdsAll = QUEST_DATA.filter(q => q.type === 'daily').map(q => q.id);
            const allDailyDone = dailyIdsAll.length > 0 && dailyIdsAll.every(id => window.playerState.quests[id]);
            const nowBonus = new Date();
            const todayStrBonus = `${nowBonus.getFullYear()}-${String(nowBonus.getMonth() + 1).padStart(2, '0')}-${String(nowBonus.getDate()).padStart(2, '0')}`;
            let dailyAllClearMsg = '';
            if (allDailyDone && window.playerState.dailyAllClearBonusDate !== todayStrBonus) {
                window.playerState.dailyAllClearBonusDate = todayStrBonus;
                window.playerState.xp += 50;
                window.playerState.bong = normalizeBongValue(window.playerState.bong + 10);
                dailyAllClearMsg = `🌟 [일일 퀘스트 전부 완료!]\n보너스 경험치 +50 XP · 삼봉 +10 B\n\n`;
            }

            const newLv = getLevelInfo(window.playerState.xp).index;

            let alertMsg = "";
            if (dailyAllClearMsg) alertMsg += dailyAllClearMsg;
            if (isEarlyBirdJackpot) alertMsg += `🎊 [금요일 보너스]\n월~금 성실 등교 완주! 보너스 20 XP 지급!\n\n`;
            if (buffAmount > 0) alertMsg += `🗡️ [무기 버프] 추가 경험치 +${buffAmount} XP 획득!\n`;

            if(!window.playerState.questHistory) window.playerState.questHistory = [];
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const qInfo = QUEST_DATA.find(q => q.id === qId);
            if(qInfo) {
                window.playerState.questHistory.push({ id: qId, name: qInfo.name, date: dateStr, timestamp: now.getTime(), xp: finalXp, bong: finalBong });
            }

            if (newLv > oldLv) {
                const bonus = newLv * 3;
                window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + bonus);
                alertMsg += `\n🎉 레벨업을 축하해요!\n보너스 자산 [${bonus} B]를 드립니다!`;
            }
            window.playerState.bong = normalizeBongValue(Number(window.playerState.bong) || 0);
            if (alertMsg !== "") await window.customAlert(alertMsg.trim());

            await handleQuestDrop(xp);

            updateUI();

            if (!db || !currentStudentDocRef) return;

            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) {
                    await window.customAlert('인증에 실패해 퀘스트 진행을 서버에 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
                    return;
                }
                /** 퀘스트 직후 playerState가 이미 최종값이므로 전체 merge 저장(서버 재읽기·델타 계산 없음 — 실패 알림 오판 방지) */
                await saveDataToCloud();
            } catch (e) {
                console.error('attemptQuest persist', e);
                await window.customAlert('퀘스트 저장에 실패했습니다.\n' + (e && e.message ? e.message : String(e)));
            }
        };

        // ★ 버그 수정: 퀘스트 취소 시 UI 초기화 기능 개선
        window.cancelQuest = async function(qId, xp, bong) {
            if (window.playerState.isGuest) return;
            const isOk = await window.customConfirm("퀘스트를 취소할까요?\n⚠️ 수수료(0.5 B)가 깎여요.");
            
            if (isOk) {
                if (qId === 'q1') window.playerState.earlyBirdCount = Math.max(0, (window.playerState.earlyBirdCount || 1) - 1);

                if (window.playerState.questHistory) {
                    const now = new Date();
                    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const idx = window.playerState.questHistory.map(q => q.id === qId && q.date === dateStr).lastIndexOf(true);
                    if (idx !== -1) window.playerState.questHistory.splice(idx, 1);
                }

                window.playerState.xp = Math.max(0, window.playerState.xp - xp);
                window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) - (Number(bong) + 0.5));
                delete window.playerState.quests[qId]; 
                updateUI(); 
                saveDataToCloud();
            } else {
                // 취소 다이얼로그에서 '아니오'를 눌렀을 때 DOM 요소가 해제되는 현상을 막고 재렌더링하여 원상복구합니다.
                updateUI();
            }
        };

        /** 공동구매 풀 contributions 합계 */
        function sumShopPoolContributions(poolData) {
            const c = poolData && poolData.contributions && typeof poolData.contributions === 'object' ? poolData.contributions : {};
            let s = 0;
            Object.keys(c).forEach((k) => {
                s += Number(c[k]) || 0;
            });
            return normalizeBongValue(s);
        }

        /** 랜덤박스 당첨 총액을 출자 비율로 분배(마지막 인원에게 반올림 오차 보정) */
        function splitBongProportionally(totalB, contribs) {
            const keys = Object.keys(contribs).filter((k) => (Number(contribs[k]) || 0) > 0);
            if (keys.length === 0 || totalB <= 0) return {};
            const sum = keys.reduce((a, k) => a + (Number(contribs[k]) || 0), 0);
            if (sum <= 0) return {};
            const out = {};
            let allocated = 0;
            keys.forEach((k, idx) => {
                if (idx === keys.length - 1) {
                    out[k] = normalizeBongValue(totalB - allocated);
                } else {
                    const w = Number(contribs[k]) || 0;
                    const part = normalizeBongValue((totalB * w) / sum);
                    out[k] = part;
                    allocated = normalizeBongValue(allocated + part);
                }
            });
            return out;
        }

        /** 공동구매 랜덤박스: 한 번 굴리고 당첨 삼봉을 출자 비율로 학생 문서에 분배 */
        async function distributeGroupBuyRandomBox(savedContribs, target) {
            const result = Math.floor(Math.random() * 11) * 10;
            const shares = splitBongProportionally(result, savedContribs);

            if (result > 0 && Object.keys(shares).length > 0) {
                const batch = writeBatch(db);
                Object.keys(shares).forEach((sid) => {
                    const amt = shares[sid];
                    if (!amt || amt <= 0) return;
                    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + sid);
                    batch.set(ref, { bong: increment(amt) }, { merge: true });
                });
                await batch.commit();
            }

            await refreshStudentsCacheFromServer();
            updateUI();
            playSfx('bong', result >= 50);

            const floater = document.createElement('div');
            floater.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl sm:text-6xl font-black z-[9999] animate-bounce drop-shadow-[0_0_20px_rgba(251,191,36,1)] text-yellow-400 whitespace-nowrap text-center max-w-[95vw] px-2`;
            floater.innerHTML = `🎁<br>총 ${result} B<br><span class="text-lg sm:text-2xl font-bold">비율 분배 완료</span>`;
            document.body.appendChild(floater);
            setTimeout(() => floater.remove(), 2500);

            const lines = Object.keys(shares)
                .map((sid) => {
                    const nm = STUDENT_NAMES[String(sid)] || sid;
                    const v = shares[sid];
                    return `${nm}: +${Number(v).toFixed(1)} B`;
                })
                .join('\n');
            const myId = localStorage.getItem('sambong_student_id');
            const mine = myId && shares[myId] != null ? `\n\n내 지분: +${Number(shares[myId]).toFixed(1)} B` : '';
            const profit = result - target;
            let tail = '';
            if (result > target) tail = `\n\n모둠 순이익: +${profit.toFixed(1)} B (총 당첨 − 목표 ${target}B)`;
            else if (result < target) tail = `\n\n모둠 순손실: ${profit.toFixed(1)} B`;
            else tail = `\n\n모둠 본전 (총 당첨 = 목표 ${target}B)`;

            await window.customAlert(`🎁 공동구매 랜덤 박스 결과: 총 ${result} B\n\n출자 비율로 나눠 넣었어요:\n${lines}${mine}${tail}`);
        }

        window.buyItem = async function (id, name, isConsumable, opts) {
            const groupEx = opts && opts.groupBuyExecute === true;
            const price = getEffectiveShopPrice(id);
            if (window.playerState.isGuest) return await window.customAlert('👀 게스트는 이용할 수 없어요.');
            if (groupEx && id === 'item_mystery_dice') return;

            if (id === 'item_random') {
                // 공동구매 랜덤박스는 executeShopGroupBuy → distributeGroupBuyRandomBox에서만 처리(출자 비율 분배)
                if (groupEx) return;

                if (window.playerState.bong < price && !window.playerState.isAdmin) {
                    return await window.customAlert(`❌ 돈이 부족해요. ${(price - window.playerState.bong).toFixed(1)}B가 더 필요해요.`);
                }
                const ok = await window.customConfirm(`[${name}]을(를) ${price}B에 열어볼까요?\n(0~100B 획득 가능, 각 금액 균등 확률!)`);
                if (!ok) return;
                if (!window.playerState.isAdmin) window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) - price);
                const result = Math.floor(Math.random() * 11) * 10;
                window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + result);
                playSfx('bong', result >= 50);

                const floater = document.createElement('div');
                floater.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-5xl sm:text-6xl font-black z-[9999] animate-bounce drop-shadow-[0_0_20px_rgba(251,191,36,1)] text-yellow-400 whitespace-nowrap text-center`;
                floater.innerHTML = `🎁<br>${result} B 당첨!`;
                document.body.appendChild(floater);
                setTimeout(() => floater.remove(), 2500);

                updateUI();
                saveDataToCloud();

                if (result > price) await window.customAlert(`🎉 대박! 랜덤 박스 결과: [ ${result} B ] 획득!\n(수익: +${result - price} B)`);
                else if (result === price) await window.customAlert(`🎁 본전! 랜덤 박스 결과: [ ${result} B ] 획득!`);
                else await window.customAlert(`💦 아쉽네요! 랜덤 박스 결과: [ ${result} B ] 획득!\n(손해: ${result - price} B)`);
                return;
            }

            if (id === 'item_mystery_dice') {
                const betStr = await window.customPrompt(`[${name}]\n얼마를 투자할까요? (B)\n맞추면 투자금의 5배를 받습니다!`, 'number');
                if (betStr === null) return;
                const bet = Math.floor(parseFloat(betStr));
                if (!Number.isFinite(bet) || bet <= 0) return await window.customAlert('투자금은 1 이상 숫자여야 합니다.');
                if (!window.playerState.isAdmin && (window.playerState.bong || 0) < bet) {
                    return await window.customAlert(`❌ 돈이 부족해요. ${(bet - (window.playerState.bong || 0)).toFixed(1)}B가 더 필요해요.`);
                }

                const pick = await window.customPick1to6(`1~6 중에 하나를 선택하세요. (맞추면 ${bet * 5}B)`);
                if (pick === null) return;

                const ok = await window.customConfirm(`🎲 주사위를 굴릴까요?\n- 선택: ${pick}\n- 투자: ${bet}B\n- 성공 보상: ${bet * 5}B`);
                if (!ok) return;

                if (!window.playerState.isAdmin) window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) - bet);

                const roll = Math.floor(Math.random() * 6) + 1;
                await window.runDiceRollAnimation(roll);

                const win = roll === pick;
                const payout = win ? bet * 5 : 0;
                if (payout > 0) window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + payout);

                playSfx('bong', win);
                updateUI();
                await saveDataToCloud();

                const floater = document.createElement('div');
                floater.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl sm:text-5xl font-black z-[9999] animate-bounce drop-shadow-[0_0_20px_rgba(16,185,129,0.9)] text-emerald-400 whitespace-nowrap text-center`;
                floater.innerHTML = `🎲 ${roll}<br>${win ? `성공! +${payout}B` : `실패... (-${bet}B)`}`;
                document.body.appendChild(floater);
                setTimeout(() => floater.remove(), 2500);

                if (win) return await window.customAlert(`🎉 성공!\n선택: ${pick}\n주사위: ${roll}\n보상: +${payout} B\n(순이익: +${payout - bet} B)`);
                return await window.customAlert(`💦 실패!\n선택: ${pick}\n주사위: ${roll}\n손해: -${bet} B`);
            }

            if (id === 'item_xp_pack') {
                const packPrice = getEffectiveShopPrice('item_xp_pack');
                const gainXp = 100;
                if (!groupEx) {
                    if (window.playerState.bong < packPrice && !window.playerState.isAdmin) {
                        return await window.customAlert(`❌ 돈이 부족해요. ${(packPrice - window.playerState.bong).toFixed(1)}B가 더 필요해요.`);
                    }
                    const ok = await window.customConfirm(`[경험치 팩]\n${packPrice}B를 사용해 즉시 ${gainXp} XP를 획득할까요?`);
                    if (!ok) return;
                    if (!window.playerState.isAdmin) window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) - packPrice);
                }
                window.playerState.xp += gainXp;
                playSfx('xp', true);
                updateUI();
                await saveDataToCloud();
                return await window.customAlert(`⚡ 경험치 팩 사용!\n+${gainXp} XP 획득했습니다.`);
            }

            if (isClassShopId(id)) {
                const shop = SHOP_DATA.find((s) => s.id === id);
                if (!shop) return await window.customAlert('상품 정보를 찾을 수 없어요.');
                const eff = getEffectiveShopPrice(id);
                if (!groupEx) {
                    if (!window.playerState.isAdmin && (Number(window.playerState.bong) || 0) < eff) {
                        return await window.customAlert(`❌ 돈이 부족해요. ${(eff - (Number(window.playerState.bong) || 0)).toFixed(1)}B가 더 필요해요.`);
                    }
                    const ok = await window.customConfirm(
                        `[${shop.name}] ${eff}B를 내고 학급 활동 예약을 할까요?\n` + '삼봉은 즉시 차감되며, 진행은 담임 선생님과 일정을 맞춰 주세요.'
                    );
                    if (!ok) return;
                    if (!window.playerState.isAdmin) {
                        window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) - eff);
                    }
                }
                if (!window.playerState.classEventPurchases) window.playerState.classEventPurchases = [];
                window.playerState.classEventPurchases.push({ id: shop.id, name: shop.name, price: eff, at: Date.now() });
                if (window.playerState.classEventPurchases.length > 25) {
                    window.playerState.classEventPurchases = window.playerState.classEventPurchases.slice(-25);
                }
                playSfx('bong', true);
                updateUI();
                await saveDataToCloud();
                return await window.customAlert(`✅ [${shop.name}] 구매가 기록되었습니다!\n선생님께 일정을 요청해 주세요.\n(아래 '최근 학급 활동 예약'에 남습니다)`);
            }

            if (isConsumable) {
                if (groupEx && id === 'item_shield') {
                    const currentStock = window.globalSettings.shieldStock !== undefined ? window.globalSettings.shieldStock : 10;
                    if (currentStock <= 0 && !window.playerState.isAdmin) return await window.customAlert('❌ 현재 품절되었습니다! 마스터가 재입고해야 합니다.');
                    const hp = (window.playerState.shieldHP || 0) + (window.playerState.hasShield ? 100 : 0);
                    window.playerState.shieldHP = hp + 100;
                    window.playerState.hasShield = false;
                    const stNow = window.globalSettings.shieldStock !== undefined ? window.globalSettings.shieldStock : 10;
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { shieldStock: Math.max(0, stNow - 1) }, { merge: true });
                    updateUI();
                    saveDataToCloud();
                    return await window.customAlert(`🛡️ 방패 충전 완료!\n현재 방패 내구도: ${window.playerState.shieldHP}`);
                }

                if (window.playerState.bong >= price || window.playerState.isAdmin) {
                    let cMsg = `[${name}] 아이템을 ${price}B에 살까요?`;
                    if (id === 'item_shield') {
                        const currentStock = window.globalSettings.shieldStock !== undefined ? window.globalSettings.shieldStock : 10;
                        if (currentStock <= 0 && !window.playerState.isAdmin) return await window.customAlert('❌ 현재 품절되었습니다! 마스터가 재입고해야 합니다.');
                        const hp = (window.playerState.shieldHP || 0) + (window.playerState.hasShield ? 100 : 0);
                        cMsg = `[${name}] 아이템을 ${price}B에 살까요?\n(현재 방패 내구도: ${hp} / 남은 재고: ${currentStock}개)`;
                    }

                    const ok = await window.customConfirm(cMsg);
                    if (ok) {
                        if (!window.playerState.isAdmin) {
                            window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) - price);
                        }
                        if (id === 'item_shield') {
                            const hp = (window.playerState.shieldHP || 0) + (window.playerState.hasShield ? 100 : 0);
                            window.playerState.shieldHP = hp + 100;
                            window.playerState.hasShield = false;
                            const currentStock = window.globalSettings.shieldStock !== undefined ? window.globalSettings.shieldStock : 10;
                            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { shieldStock: Math.max(0, currentStock - 1) }, { merge: true });
                            updateUI();
                            saveDataToCloud();
                            await window.customAlert(`🛡️ 방패 충전 완료!\n현재 방패 내구도: ${window.playerState.shieldHP}`);
                        } else {
                            updateUI();
                            saveDataToCloud();
                        }
                    }
                } else await window.customAlert(`❌ 돈이 부족해요. ${(price - window.playerState.bong).toFixed(1)}B가 더 필요해요.`);
            } else {
                const msg =
                    window.playerState.bong >= price || window.playerState.isAdmin
                        ? '🎉 [구매 가능] 선생님께 말씀해주세요!'
                        : `❌ 돈이 부족해요. ${(price - window.playerState.bong).toFixed(1)}B가 더 필요해요.`;
                await window.customAlert(msg);
            }
        };

        window.saveShopPricesAdmin = async function () {
            if (!window.playerState || !window.playerState.isGM) return await window.customAlert('마스터 J만 저장할 수 있습니다.');
            if (!db) return await window.customAlert('데이터베이스에 연결되지 않았습니다.');
            const shopPrices = {};
            SHOP_DATA.forEach((s) => {
                const el = document.getElementById('gm_shop_price_' + s.id);
                if (!el) return;
                let v = parseFloat(el.value);
                if (!Number.isFinite(v) || v < 0) v = getDefaultShopPrice(s.id);
                shopPrices[s.id] = Math.round(v * 10) / 10;
            });
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { shopPrices }, { merge: true });
                await window.customAlert('✅ 아이템 상점 가격이 저장되었습니다.');
            } catch (e) {
                console.error('saveShopPricesAdmin', e);
                await window.customAlert('저장 실패: ' + (e && e.message ? e.message : String(e)));
            }
        };

        window._groupBuyModalShopId = '';

        window._refreshShopGroupBuyModalIfOpen = function () {
            const modal = document.getElementById('shopGroupBuyModal');
            if (!modal || modal.classList.contains('hidden')) return;
            if (window._groupBuyModalShopId) window.renderShopGroupBuyModalContent(window._groupBuyModalShopId);
        };

        window.openShopGroupBuyModal = function (shopId) {
            if (window.playerState.isGuest) return window.customAlert('👀 게스트는 이용할 수 없어요.');
            if (window.playerState.isAdmin) return window.customAlert('학생만 공동구매에 참여할 수 있어요.');
            if (shopId === 'item_mystery_dice') return;
            window._groupBuyModalShopId = shopId;
            const shop = SHOP_DATA.find((s) => s.id === shopId);
            const title = document.getElementById('shopGroupBuyModalTitle');
            const hint = document.getElementById('shopGroupBuyModalHint');
            if (title) title.innerHTML = `<i class="fa-solid fa-people-group text-cyan-400"></i> 공동구매 · ${shop ? shop.name : shopId}`;
            if (hint) {
                hint.textContent = shop
                    ? shopId === 'item_random'
                        ? `목표 ${getEffectiveShopPrice(shopId)}B가 모이면 실행 시, 랜덤 박스 당첨 삼봉(0~100B)이 출자 비율로 참여자에게 나뉩니다.`
                        : `목표 금액(${getEffectiveShopPrice(shopId)}B)이 모이면 「구매 실행」으로 상품이 적용됩니다. 누가 얼마를 냈는지 아래에서 확인하세요.`
                    : '';
            }
            window.renderShopGroupBuyModalContent(shopId);
            const modal = document.getElementById('shopGroupBuyModal');
            if (modal) modal.classList.remove('hidden');
        };

        window.renderShopGroupBuyModalContent = function (shopId) {
            const target = getEffectiveShopPrice(shopId);
            const pool = (window.shopGroupBuyPools && window.shopGroupBuyPools[shopId]) || {};
            const contribs = pool.contributions && typeof pool.contributions === 'object' ? pool.contributions : {};
            const sum = sumShopPoolContributions(pool);
            const curEl = document.getElementById('gbPoolCurrent');
            const tgtEl = document.getElementById('gbPoolTarget');
            const bar = document.getElementById('gbPoolBar');
            const listEl = document.getElementById('gbContributorList');
            const execBtn = document.getElementById('gbExecuteBtn');
            if (curEl) curEl.textContent = String(sum);
            if (tgtEl) tgtEl.textContent = String(target);
            if (bar) {
                const pct = target > 0 ? Math.min(100, (sum / target) * 100) : 0;
                bar.style.width = `${pct}%`;
            }
            if (listEl) {
                const rows = Object.keys(contribs)
                    .map((sid) => {
                        const amt = normalizeBongValue(Number(contribs[sid]) || 0);
                        const nm = STUDENT_NAMES[String(sid)] || sid;
                        return { sid, amt, nm };
                    })
                    .sort((a, b) => b.amt - a.amt);
                listEl.innerHTML =
                    rows.length === 0
                        ? '<div class="text-slate-500 text-center py-2">아직 입금 내역이 없어요.</div>'
                        : rows
                              .map((r) => `<div class="flex justify-between gap-2"><span class="text-slate-200">${r.nm}</span><span class="text-cyan-300 font-bold tabular-nums">${r.amt.toFixed(1)} B</span></div>`)
                              .join('');
            }
            const ready = target > 0 && sum >= target - 0.0001;
            if (execBtn) {
                execBtn.disabled = !ready;
                execBtn.classList.toggle('opacity-40', !ready);
            }
        };

        window.contributeShopGroupBuy = async function () {
            const shopId = window._groupBuyModalShopId;
            if (!shopId || !db || !currentStudentDocRef) return;
            if (window.playerState.isGuest || window.playerState.isAdmin) return;
            const myId = localStorage.getItem('sambong_student_id');
            if (!myId || myId === 'gm' || myId === 'gm_a') return;

            const target = getEffectiveShopPrice(shopId);
            if (target <= 0) return await window.customAlert('이 상품은 공동구매 대상이 아니에요.');

            const input = document.getElementById('gbContributeAmount');
            const raw = input ? input.value : '';
            let amount = parseFloat(raw);
            if (!Number.isFinite(amount) || amount <= 0) return await window.customAlert('입금액을 올바르게 입력해 주세요.');

            const poolRef = doc(db, 'artifacts', appId, 'public', 'data', 'shopGroupBuy', shopId);
            const stuRef = currentStudentDocRef;

            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');

                await runTransaction(db, async (transaction) => {
                    const poolSnap = await transaction.get(poolRef);
                    const stuSnap = await transaction.get(stuRef);
                    if (!stuSnap.exists()) throw new Error('no_student');
                    const stu = stuSnap.data() || {};
                    const bal = normalizeBongValue(Number(stu.bong) || 0);

                    const poolData = poolSnap.exists() ? poolSnap.data() : {};
                    const contributions = { ...(poolData.contributions && typeof poolData.contributions === 'object' ? poolData.contributions : {}) };
                    const currentSum = (() => {
                        let s = 0;
                        Object.keys(contributions).forEach((k) => {
                            s += Number(contributions[k]) || 0;
                        });
                        return normalizeBongValue(s);
                    })();
                    const remaining = Math.max(0, normalizeBongValue(target - currentSum));
                    if (remaining <= 0) throw new Error('full');

                    const pay = Math.min(amount, remaining, bal);
                    if (pay <= 0) throw new Error('no_pay');

                    const prev = Number(contributions[String(myId)]) || 0;
                    contributions[String(myId)] = normalizeBongValue(prev + pay);

                    transaction.set(
                        stuRef,
                        { bong: normalizeBongValue(bal - pay) },
                        { merge: true }
                    );
                    transaction.set(poolRef, { contributions, updatedAt: Date.now() }, { merge: true });
                });

                if (input) input.value = '';
                window.renderShopGroupBuyModalContent(shopId);
                await window.customAlert('입금이 반영되었습니다.');
                await refreshStudentsCacheFromServer();
                updateUI();
            } catch (e) {
                const code = e && e.message ? String(e.message) : String(e);
                if (code === 'full') return await window.customAlert('이미 목표 금액이 모였어요. 구매 실행을 눌러 주세요.');
                if (code === 'no_pay') return await window.customAlert('입금 가능한 금액이 없어요. (잔액·남은 목표 금액을 확인해 주세요.)');
                if (code === 'no_student') return await window.customAlert('학생 정보를 찾을 수 없어요.');
                console.error('contributeShopGroupBuy', e);
                await window.customAlert('입금 처리 중 오류: ' + code);
            }
        };

        window.executeShopGroupBuy = async function () {
            const shopId = window._groupBuyModalShopId;
            if (!shopId || !db) return;
            if (window.playerState.isGuest || window.playerState.isAdmin) return;

            const shop = SHOP_DATA.find((s) => s.id === shopId);
            if (!shop) return await window.customAlert('상품 정보를 찾을 수 없어요.');

            const target = getEffectiveShopPrice(shopId);
            const pool = (window.shopGroupBuyPools && window.shopGroupBuyPools[shopId]) || {};
            const sum = sumShopPoolContributions(pool);
            if (sum < target - 0.0001) return await window.customAlert('아직 목표 금액이 모이지 않았어요.');

            const ok = await window.customConfirm(
                shopId === 'item_random'
                    ? `공동구매로 「${shop.name}」을(를) 지금 열까요?\n당첨 삼봉은 출자 비율에 따라 참여 학생에게 나뉘어 들어갑니다.`
                    : `공동구매로 「${shop.name}」을(를) 지금 적용할까요?\n(실행한 학생에게 상품 효과가 적용됩니다.)`
            );
            if (!ok) return;

            const poolRef = doc(db, 'artifacts', appId, 'public', 'data', 'shopGroupBuy', shopId);
            let savedContribs = null;

            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');

                await runTransaction(db, async (transaction) => {
                    const poolSnap = await transaction.get(poolRef);
                    if (!poolSnap.exists()) throw new Error('no_pool');
                    const d = poolSnap.data() || {};
                    const contributions = d.contributions && typeof d.contributions === 'object' ? d.contributions : {};
                    let s = 0;
                    Object.keys(contributions).forEach((k) => {
                        s += Number(contributions[k]) || 0;
                    });
                    s = normalizeBongValue(s);
                    if (s < target - 0.0001) throw new Error('not_enough');
                    savedContribs = { ...contributions };
                    transaction.set(poolRef, { contributions: {}, updatedAt: Date.now() }, { merge: true });
                });
            } catch (e) {
                const msg = e && e.message ? String(e.message) : String(e);
                if (msg === 'not_enough') return await window.customAlert('다른 친구가 먼저 진행했거나 금액이 부족해요. 새로고침 후 확인해 주세요.');
                console.error('executeShopGroupBuy', e);
                return await window.customAlert('처리 중 오류: ' + msg);
            }

            document.getElementById('shopGroupBuyModal') && document.getElementById('shopGroupBuyModal').classList.add('hidden');

            if (shopId === 'item_random') {
                if (!savedContribs || Object.keys(savedContribs).length === 0) {
                    return await window.customAlert('입금 내역을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
                }
                await distributeGroupBuyRandomBox(savedContribs, target);
                return;
            }

            await window.buyItem(shopId, shop.name, !!shop.isConsumable, { groupBuyExecute: true });
        };

        window.toggleJob = async function(jobName, iconClass, colorClass) {
            if (window.playerState.isGuest) return await window.customAlert("👀 게스트는 이용할 수 없어요.");
            if (!window.playerState.jobs) window.playerState.jobs = [];
            const existingIndex = window.playerState.jobs.findIndex(j => j.name === jobName);
            if (existingIndex > -1) window.playerState.jobs.splice(existingIndex, 1);
            else window.playerState.jobs.push({ name: jobName, icon: iconClass, color: colorClass });
            
            updateUI(); saveDataToCloud(); window.switchTab('plaza');
        };

        window.handleSkin = async function(skinId) {
            if (window.playerState.isGuest) return await window.customAlert("👀 게스트는 이용할 수 없어요.");
            const skin = SKIN_DATA.find(s => s.id === skinId);
            
            if(!window.playerState.ownedSkins) window.playerState.ownedSkins = {};
            if(!window.playerState.equippedSkins) window.playerState.equippedSkins = {};

            if (window.playerState.ownedSkins[skinId]) {
                if (skin.type === 'aura') SKIN_DATA.forEach(s => { if(s.type === 'aura') window.playerState.equippedSkins[s.id] = false; });
                else if (skin.type === 'face') SKIN_DATA.forEach(s => { if(s.type === 'face') window.playerState.equippedSkins[s.id] = false; });
                
                window.playerState.equippedSkins[skinId] = !window.playerState.equippedSkins[skinId];
                updateUI(); saveDataToCloud(); window.switchTab('plaza');
            } else {
                if (window.playerState.bong >= skin.price || window.playerState.isAdmin) {
                    const isOk = await window.customConfirm(`스킨 '${skin.name}'을(를) ${skin.price} B에 살까요?`);
                    if (isOk) {
                        if (!window.playerState.isAdmin) window.playerState.bong -= skin.price;
                        window.playerState.ownedSkins[skinId] = true;
                        
                        if (skin.type === 'aura') SKIN_DATA.forEach(s => { if(s.type === 'aura') window.playerState.equippedSkins[s.id] = false; });
                        else if (skin.type === 'face') SKIN_DATA.forEach(s => { if(s.type === 'face') window.playerState.equippedSkins[s.id] = false; });
                        
                        window.playerState.equippedSkins[skinId] = true; 
                        await window.customAlert(`🎉 획득 완료! 바로 장착했어요.`); 
                        updateUI(); saveDataToCloud(); window.switchTab('plaza');
                    }
                } else await window.customAlert(`❌ 돈이 부족해요. ${(skin.price - window.playerState.bong).toFixed(1)}B가 더 필요해요.`); 
            }
        };

        window.promptUnlock = async function(qId) {
            if (window.playerState.isGuest) return;
            const pw = window.globalSettings.raidPassword || "1234";
            const code = await window.customPrompt(`전담 선생님 비밀번호를 입력하세요:`, "password");
            
            if (code === pw || code === "마스터J") { 
                if (code !== "마스터J") {
                    if (!window.playerState.usedRaidPasswords) window.playerState.usedRaidPasswords = [];
                    if (window.playerState.usedRaidPasswords.includes(code)) {
                        return await window.customAlert("❌ 이미 사용한 비밀번호입니다.\n비밀번호 하나당 하나의 레이드만 열 수 있습니다.");
                    }
                    window.playerState.usedRaidPasswords.push(code);
                }
                await window.customAlert("🔓 퀘스트가 열렸어요!");
                if(!window.playerState.unlockedQuests) window.playerState.unlockedQuests = {};
                window.playerState.unlockedQuests[qId] = true; 
                updateUI(); saveDataToCloud();
            } else if (code !== null) await window.customAlert("❌ 비밀번호가 틀렸어요.");
        };

        // ==========================================
        // ★ 관리자 권한 도구 모음 (자동 경험치 포함) ★
        // ==========================================
        window.hardResetAll = async function() {
            if (!window.playerState.isGM) return window.customAlert('선생님(마스터 J) 전용 기능입니다.');
            const ok1 = await window.customPrompt('⚠️ [위험] 모든 학생의 데이터가 0으로 영구 초기화됩니다.\n계속하시려면 "초기화확인"을 입력하세요:', 'text');
            if (ok1 !== "초기화확인") return;
            
            try {
                const batch = writeBatch(db);
                for (let i=1; i<=13; i++) {
                    let docRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + i);
                    let stu = window.allStudentsData.find(s => s.id === String(i)) || {};
                    batch.set(docRef, {
                        pin: stu.pin || '',
                        xp: 0, bong: 0.0, quests: {}, unlockedQuests: {}, jobs: [],
                        ownedSkins: {}, equippedSkins: {}, hasShield: false, shieldHP: 0,
                        condition: null, dragonBalls: [], dragonBallWeekendKey: '', earlyBirdCount: 0,
                        inventory: [], equippedWeapon: null, lunchBid: {date: '', amount: 0}, lastLunchDeductDate: '', questHistory: [], usedRaidPasswords: [],
                        bankRegularSavings: 0, bankTermDeposits: [], bankDailyBonusLastDate: '', dailyAllClearBonusDate: '',
                        classEventPurchases: []
                    });
                }
                
                batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { shieldStock: 10 }, { merge: true });

                await batch.commit();
                await window.customAlert("✅ 서버 대규모 초기화가 완료되었습니다! 내일부터 새로운 시즌을 시작하세요.");
            } catch(e) { window.customAlert("초기화 중 오류 발생: " + e.message); }
        };

        /** 평일 수업 종료 시각(타임테이블)마다 전 학생 문서에 XP+5. 담임 화면이 켜진 경우에만 트랜잭션 1회 실행. (특정 학번만 아님 — 전원 동일 규칙) */
        window.checkAndDistributeClassXP = async function() {
            if (!window.playerState.isGM || !window.allStudentsData || window.allStudentsData.length === 0) return;
            const now = new Date();
            const day = now.getDay();
            if (day === 0 || day === 6) return;

            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const targetTimes = ['09:40', '10:30', '11:20', '12:10', '13:50', '14:40'];
            if (!targetTimes.includes(timeStr)) return;

            const todayKey = `${now.getFullYear()}_${now.getMonth()+1}_${now.getDate()}_${timeStr}`;
            const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
            const stuList = window.allStudentsData.filter(s => s.id !== 'gm' && s.id !== 'gm_a');

            let granted = false;
            try {
                granted = await runTransaction(db, async (transaction) => {
                    const settingsSnap = await transaction.get(settingsRef);
                    const last = settingsSnap.exists() ? settingsSnap.data().lastAutoXpTime : null;
                    if (last === todayKey) return false;

                    for (const stu of stuList) {
                        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + stu.id);
                        transaction.set(ref, { xp: increment(5) }, { merge: true });
                    }
                    transaction.set(settingsRef, {
                        lastAutoXpTime: todayKey,
                        announcement: `[${timeStr}] 수업 종료! 모든 학생에게 경험치 +5XP가 자동 지급되었습니다! 🎉`
                    }, { merge: true });
                    return true;
                });
            } catch (e) {
                console.warn('checkAndDistributeClassXP', e);
                return;
            }

            if (granted) {
                window.customAlert(`⏰ [${timeStr}] 수업 종료!\n학생 ${stuList.length}명에게 경험치 +5 자동 지급을 완료했습니다.`);
            }
        };

        window.checkAndDistributeSalary = async function() {
            if (!db || !window.allStudentsData || window.allStudentsData.length === 0) return;
            const now = new Date();
            const day = now.getDay();
            const hours = now.getHours();

            /** 금요일 오후 3시(15:00) 이후부터 해당 주 주급 창구 오픈. 토·일은 직전 금요일분 정산. */
            const isFridayPayWindow = day === 5 && hours >= 15;
            const isPast = isFridayPayWindow || day === 6 || day === 0;
            if (!isPast) return;

            let dDate = new Date(now);
            if (day === 6) dDate.setDate(now.getDate() - 1);
            else if (day === 0) dDate.setDate(now.getDate() - 2);

            const wId = `SALARY_${dDate.getFullYear()}_${String(dDate.getMonth() + 1).padStart(2, '0')}_${String(dDate.getDate()).padStart(2, '0')}`;

            const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
            const stuList = window.allStudentsData.filter(s => s.id !== 'gm' && s.id !== 'gm_a');

            try {
                const paidCount = await runTransaction(db, async (transaction) => {
                    const settingsSnap = await transaction.get(settingsRef);
                    const last = settingsSnap.exists() ? settingsSnap.data().lastSalaryWeek : null;
                    if (last === wId) return null;

                    let count = 0;
                    for (const stu of stuList) {
                        let pay = 0;
                        if (stu.jobs) {
                            stu.jobs.forEach(j => {
                                const ji = JOB_DATA.find(jd => jd.name === j.name);
                                if (ji) pay += ji.pay;
                            });
                        }
                        if (pay > 0) {
                            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + stu.id);
                            transaction.set(ref, { bong: increment(pay) }, { merge: true });
                            count++;
                        }
                    }

                    transaction.set(settingsRef, { lastSalaryWeek: wId }, { merge: true });
                    return count;
                });

                if (paidCount != null && window.playerState && window.playerState.isGM) {
                    window.customAlert(`💰 자동 주급 정산 완료! (${paidCount}명 지급)\n(금요 15:00 이후 · 서버 트랜잭션 1회)`);
                }
            } catch (e) {
                console.warn('checkAndDistributeSalary', e);
            }
        };

        // 평일 12시(정오) 이후, 학생 계정당 하루 1회 점심값 10B 차감 (잔액 부족 시 마이너스 허용)
        window.applyPersonalLunchDeductionIfNeeded = async function() {
            if (!window.playerState || window.playerState.isGuest || !currentStudentDocRef) return;
            if (window.playerState.isAdmin) return;

            const now = new Date();
            const day = now.getDay();
            if (day < 1 || day > 5) return;
            if (now.getHours() < 12) return;

            const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            if (window.playerState.lastLunchDeductDate === todayYmd) return;

            window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) - 10);
            window.playerState.lastLunchDeductDate = todayYmd;
            await saveDataToCloud();
            updateUI();
            await window.customAlert(`🍱 점심값으로 삼봉 10B가 차감되었습니다.\n부족하면 잔액이 마이너스로 표시돼요.\n(오늘 날짜 기준 1회만 적용)`);
        };

        // 이전 버전 호환용 (일괄 차감). 현재는 applyPersonalLunchDeductionIfNeeded 로 개별 처리합니다.
        window.checkAndDeductLunch = async function() {};

        window.plazaClickXP = async function(stuId, element) {
            if (!window.playerState.isAdmin || stuId === 'gm' || stuId === 'gm_a') return;
            if (window.playerState.isGMA && String(stuId) !== '13') return;
            await window.quickReward('xp', 2, stuId, element);
        };

        window.quickReward = async function(type, amount, stuId, btnElement) {
            if (!window.playerState || window.playerState.isGuest) {
                await window.customAlert('로그인 후 마스터 계정으로 사용할 수 있어요.');
                return;
            }
            if (!window.playerState.isAdmin) {
                await window.customAlert('마스터 J / 마스터 A만 광장에서 지급할 수 있어요.');
                return;
            }
            const sid = String(stuId);
            if (window.playerState.isGMA && sid !== '13') {
                await window.customAlert('마스터 A는 석서영(13번) 학생만 수정 가능합니다.');
                return;
            }
            if (!db) {
                await window.customAlert('데이터베이스에 연결되지 않았습니다.');
                return;
            }

            playSfx(type, amount > 0);

            if (btnElement && typeof btnElement.getBoundingClientRect === 'function') {
                const rect = btnElement.getBoundingClientRect();
                const floater = document.createElement('div');
                floater.className = `floating-text ${amount > 0 ? (type === 'xp' ? 'text-sb-blue' : 'text-yellow-400') : 'text-sb-red'}`;
                floater.innerHTML = `${amount > 0 ? '+' : ''}${amount}<span class="text-[10px]">${type === 'xp' ? 'XP' : 'B'}</span>`;
                floater.style.left = `${rect.left + (rect.width / 2) - 15 + window.scrollX}px`;
                floater.style.top = `${rect.top + window.scrollY - 10}px`;
                document.body.appendChild(floater);
                setTimeout(() => floater.remove(), 1000);
            }

            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + sid);
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) {
                    await window.customAlert('인증에 실패했습니다. 네트워크 확인 후 새로고침해 주세요.');
                    return;
                }
                /** 베이스: 서버 읽기 실패해도 광장 캐시로 진행(쓰기만 성공하면 됨) */
                let stu = null;
                try {
                    const snapIn = await readStudentDocPreferServer(ref);
                    if (snapIn.exists()) stu = snapIn.data();
                } catch (eRead) {
                    console.warn('quickReward 초기 읽기', eRead);
                }
                if (stu == null && window.allStudentsData && window.allStudentsData.length) {
                    const row = window.allStudentsData.find((s) => String(s.id) === sid);
                    if (row) stu = { ...row };
                }
                if (stu == null) {
                    await window.customAlert('해당 학생 데이터를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
                    return;
                }

                let xp = Number(stu.xp);
                if (!Number.isFinite(xp)) xp = 0;
                let bong = Number(stu.bong);
                if (!Number.isFinite(bong)) bong = 0;
                bong = normalizeBongValue(bong);

                /** setDoc 성공 후 서버 재조회는 실패해도 저장은 된 것이므로 하지 않음(잘못된 실패 알림 원인) */
                let mergedForCache = { ...stu };

                if (amount > 0) {
                    if (type === 'xp') {
                        const nx = Math.floor(xp + Math.floor(amount));
                        await setDoc(ref, { xp: nx }, { merge: true });
                        mergedForCache = { ...stu, xp: nx };
                    } else {
                        const nb = normalizeBongValue(bong + Number(amount));
                        await setDoc(ref, { bong: nb }, { merge: true });
                        mergedForCache = { ...stu, bong: nb };
                    }
                } else {
                    let updates = {};
                    let hp = (Number(stu.shieldHP) || 0) + (stu.hasShield ? 100 : 0);
                    if (stu.hasShield) updates.hasShield = false;

                    let dAmt = Math.abs(amount);
                    if (hp > 0) {
                        if (hp >= dAmt) {
                            updates.shieldHP = hp - dAmt;
                            dAmt = 0;
                        } else {
                            dAmt -= hp;
                            updates.shieldHP = 0;
                        }
                    }

                    if (dAmt > 0) {
                        const cur = type === 'bong' ? bong : xp;
                        const nextV = cur - dAmt;
                        updates[type] = type === 'bong' ? normalizeBongValue(nextV) : Math.max(0, Math.floor(nextV));
                    }

                    if (Object.keys(updates).length === 0) return;

                    await setDoc(ref, updates, { merge: true });
                    mergedForCache = { ...stu, ...updates };
                }

                mergeStudentDocIntoPlazaCache(sid, mergedForCache);
                redrawPlazaGrantsUi();
            } catch (e) {
                console.error('quickReward', e);
                const code = e && e.code ? String(e.code) : '';
                const hint =
                    code === 'permission-denied' || /permission|insufficient/i.test(String(e && e.message))
                        ? '\n\n※ Firebase 콘솔 → Firestore → 규칙에서 익명 인증 사용자의 쓰기를 허용했는지 확인해 주세요.'
                        : '';
                await window.customAlert('저장에 실패했습니다.\n' + (e && e.message ? e.message : String(e)) + hint);
            }
        };

        window.bulkAdd = async function(type, amount) {
            if (!window.playerState.isGM) return window.customAlert('마스터 J 전용 기능입니다.');
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다.');
            const ok = await window.customConfirm(`모든 학생에게 +${amount} ${ type === 'xp' ? 'XP' : 'B' } 지급하시겠습니까?`);
            if (!ok) return;

            const amt = type === 'xp' ? Math.floor(Number(amount) || 0) : Number(amount) || 0;
            if (amt === 0) return;
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                let serverSnap;
                try {
                    serverSnap = await getDocsFromServer(colRef);
                } catch (eSrv) {
                    console.warn('bulkAdd getDocsFromServer', eSrv);
                    serverSnap = await getDocs(colRef);
                }
                const batch = writeBatch(db);
                let n = 0;
                serverSnap.forEach((docSnap) => {
                    const did = docSnap.id;
                    if (did === 'student_gm' || did === 'student_gm_a') return;
                    const d = docSnap.data() || {};
                    let xp = Number(d.xp);
                    if (!Number.isFinite(xp)) xp = 0;
                    let bong = Number(d.bong);
                    if (!Number.isFinite(bong)) bong = 0;
                    bong = normalizeBongValue(bong);
                    const r = doc(db, 'artifacts', appId, 'public', 'data', 'students', did);
                    if (type === 'xp') {
                        batch.set(r, { xp: Math.floor(xp + amt) }, { merge: true });
                    } else {
                        batch.set(r, { bong: normalizeBongValue(bong + amt) }, { merge: true });
                    }
                    n++;
                });
                if (n === 0) return await window.customAlert('학생 문서를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
                await batch.commit();
                try {
                    await refreshStudentsCacheFromServer();
                } catch (eRef) {
                    console.warn('bulkAdd refreshStudentsCacheFromServer', eRef);
                    (window.allStudentsData || []).forEach((stu) => {
                        if (stu.id === 'gm' || stu.id === 'gm_a') return;
                        if (type === 'xp') stu.xp = Math.floor((Number(stu.xp) || 0) + amt);
                        else stu.bong = normalizeBongValue((Number(stu.bong) || 0) + amt);
                    });
                    window.renderPlaza(window.allStudentsData, window.gmData, window.gmaData);
                    if (window.renderAdminTable) window.renderAdminTable(window.allStudentsData);
                }
                window.customAlert('✅ 일괄 지급 완료!');
            } catch (e) {
                console.error('bulkAdd', e);
                await window.customAlert('일괄 지급 저장에 실패했습니다.\n' + (e && e.message ? e.message : String(e)));
            }
        };

        window.bulkDeduct = async function(type, amount) {
            if (!window.playerState.isGM) return window.customAlert('마스터 J 전용 기능입니다.');
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다.');
            const ok = await window.customConfirm(`모든 학생의 ${type==='xp'?'XP':'B'}를 ${amount} 차감합니까?\n⚠️ 방패 보유자는 방패가 깎입니다.`); 
            if(!ok) return;
            
            let pCount = 0, aCount = 0;
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                let serverSnap;
                try {
                    serverSnap = await getDocsFromServer(colRef);
                } catch (eSrv) {
                    console.warn('bulkDeduct getDocsFromServer', eSrv);
                    serverSnap = await getDocs(colRef);
                }
                const batch = writeBatch(db);

                serverSnap.forEach((docSnap) => {
                    const did = docSnap.id;
                    if (did === 'student_gm' || did === 'student_gm_a') return;
                    const stu = docSnap.data() || {};
                    let xp = Number(stu.xp);
                    if (!Number.isFinite(xp)) xp = 0;
                    let bong = Number(stu.bong);
                    if (!Number.isFinite(bong)) bong = 0;
                    bong = normalizeBongValue(bong);

                    let updates = {};
                    let hp = (Number(stu.shieldHP) || 0) + (stu.hasShield ? 100 : 0);
                    if (stu.hasShield) updates.hasShield = false;

                    let dAmt = amount;
                    if (hp > 0) {
                        if (hp >= dAmt) {
                            updates.shieldHP = hp - dAmt;
                            dAmt = 0;
                            pCount++;
                        } else {
                            dAmt -= hp;
                            updates.shieldHP = 0;
                            pCount++;
                        }
                    }
                    if (dAmt > 0) {
                        const cur = type === 'bong' ? bong : xp;
                        const nextV = cur - dAmt;
                        updates[type] = type === 'bong' ? normalizeBongValue(nextV) : Math.max(0, Math.floor(nextV));
                        aCount++;
                    }

                    if (Object.keys(updates).length === 0) return;

                    batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'students', did), updates, { merge: true });
                });
                await batch.commit();
                try {
                    await refreshStudentsCacheFromServer();
                } catch (eRef) {
                    console.warn('bulkDeduct refreshStudentsCacheFromServer', eRef);
                }
                window.customAlert(`💥 일괄 차감 완료\n피해: ${aCount}명\n방패 방어: ${pCount}명`);
            } catch (e) {
                console.error('bulkDeduct', e);
                await window.customAlert('일괄 차감 저장에 실패했습니다.\n' + (e && e.message ? e.message : String(e)));
            }
        };

        window.editStudentStat = async function(stuId, type, stuName, currentVal) {
            if (!window.playerState.isAdmin) return; 
            if (window.playerState.isGMA && stuId !== '13') return;
            
            const input = await window.customPrompt(`[${stuName}] 새로운 값 입력 (현재: ${currentVal}):`, "number");
            if (input !== null && !isNaN(parseFloat(input))) {
                const raw = parseFloat(input);
                if (type === 'xp' && raw < 0) return await window.customAlert('경험치는 0 이상만 입력할 수 있어요.');
                const val = type === 'bong' ? parseFloat(raw.toFixed(1)) : Math.floor(raw);
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + stuId), { [type]: val }, { merge: true });
            }
        };

        window.changeStudentPin = async function(stuId, stuName) {
            if (!window.playerState.isAdmin) return; 
            if (window.playerState.isGMA && stuId !== '13') return;
            
            const newPin = await window.customPrompt(`[${stuName}] 새 4자리 PIN 입력:`, "number");
            if (newPin && newPin.length === 4) { 
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + stuId), { pin: newPin }, { merge: true }); 
                window.customAlert("✅ 변경 완료"); 
            }
        };

        /** 전담 레이드 퀘스트 ID (비번 변경·초기화 시 동일 목록 사용) */
        const RAID_QUEST_IDS = ['q_sci', 'q_prac', 'q_eng', 'q_dan', 'q_the', 'q_teacher'];

        /**
         * 1~13번 학생 문서에 전담 레이드 필드만 병합 반영. 광장 스냅샷과 무관하게 항상 13건 배치.
         * (merge: true로 기존 일일 퀘스트 등 다른 quests 키는 유지)
         */
        async function applyRaidResetToAllStudents() {
            const batch = writeBatch(db);
            const qPatch = {};
            const uqPatch = {};
            RAID_QUEST_IDS.forEach((id) => {
                qPatch[id] = false;
                uqPatch[id] = false;
            });
            for (let i = 1; i <= 13; i++) {
                batch.set(
                    doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + i),
                    { quests: qPatch, unlockedQuests: uqPatch, usedRaidPasswords: [] },
                    { merge: true }
                );
            }
            await batch.commit();
            return { count: 13 };
        }

        window.resetRaids = async function() {
            if (!window.playerState.isGM) return window.customAlert('마스터 J 전용 기능입니다.');
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다. 새로고침 후 다시 시도해 주세요.');
            const ok = await window.customConfirm("모든 학생의 '전담 레이드' 상태를 초기화합니다.");
            if (!ok) return;

            try {
                const r = await applyRaidResetToAllStudents();
                await window.customAlert(`✅ 초기화 완료! (${r.count}명) 전담 레이드가 잠금으로 돌아갔습니다.`);
            } catch (e) {
                console.error('resetRaids', e);
                await window.customAlert('초기화 중 오류가 났습니다.\n' + (e && e.message ? e.message : String(e)));
            }
        };

        window.setRaidPassword = async function() {
            if (!window.playerState.isGM) return;
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다. 새로고침 후 다시 시도해 주세요.');
            const p = await window.customPrompt('새 레이드 비밀번호:', 'text');
            if (p === null || String(p).trim() === '') return;

            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { raidPassword: String(p) }, { merge: true });
                const r = await applyRaidResetToAllStudents();
                await window.customAlert(`✅ 비밀번호 변경 및 전담 레이드 초기화 완료! (학생 ${r.count}명 반영)`);
            } catch (e) {
                console.error('setRaidPassword', e);
                await window.customAlert('비밀번호 저장 또는 초기화 중 오류가 났습니다.\n' + (e && e.message ? e.message : String(e)));
            }
        };

        window.openQuestHistory = function() {
            if (window.playerState.isGuest) return window.customAlert("👀 게스트는 이용할 수 없어요.");
            document.getElementById('questHistoryModal').classList.remove('hidden');
            
            const history = window.playerState.questHistory || [];
            const select = document.getElementById('qhMonthSelect');
            
            const months = [...new Set(history.map(q => q.date.substring(0, 7)))].sort().reverse();
            
            if (months.length === 0) {
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                select.innerHTML = `<option value="${currentMonth}">${currentMonth.split('-')[0]}년 ${currentMonth.split('-')[1]}월</option>`;
            } else {
                select.innerHTML = months.map(m => `<option value="${m}">${m.split('-')[0]}년 ${m.split('-')[1]}월</option>`).join('');
            }
            
            window.renderQuestHistory();
        };

        window.renderQuestHistory = function() {
            const select = document.getElementById('qhMonthSelect');
            const list = document.getElementById('qhList');
            const history = window.playerState.questHistory || [];
            const selectedMonth = select.value;
            
            const filtered = history.filter(q => q.date.startsWith(selectedMonth)).sort((a, b) => b.timestamp - a.timestamp);
            
            if (filtered.length === 0) {
                list.innerHTML = `<div class="text-center text-slate-500 py-10 text-xs font-bold glass-panel rounded-xl border border-slate-700">이 달에 완료한 퀘스트가 없습니다.</div>`;
                return;
            }
            
            list.innerHTML = filtered.map(q => `
                <div class="flex items-center justify-between bg-slate-800/80 p-3 rounded-xl border border-slate-700 shadow-sm">
                    <div>
                        <div class="text-white font-bold text-sm mb-0.5">${q.name}</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-regular fa-clock"></i> ${q.date}</div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-sb-blue text-[10px] font-bold">+${q.xp} XP</div>
                        <div class="text-sb-gold text-[10px] font-bold">+${q.bong.toFixed(1)} B</div>
                    </div>
                </div>
            `).join('');
        };

        window.talkToNPC = function() { 
            const el = document.getElementById('npcText'); 
            if(el) { 
                el.style.opacity = 0; 
                setTimeout(() => { 
                    if (window.globalSettings && window.globalSettings.announcement) {
                        el.innerText = `"[공지] ${window.globalSettings.announcement}"`;
                    } else {
                        el.innerText = '"(등록된 공지가 없습니다. 마스터에게 문의하세요.)"';
                    }
                    el.style.opacity = 1; 
                }, 300); 
            } 
        };
        
        window.setAnnouncement = async function() { 
            if(!window.playerState.isAdmin) return; 
            const t = document.getElementById('gmAnnouncementInput').value.trim(); 
            if (!t) return window.customAlert('공지 내용을 입력해주세요.');
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { announcement: t }, { merge: true }); 
            window.customAlert('✅ 공지 등록 완료!'); 
            document.getElementById('gmAnnouncementInput').value = ''; 
        };

        // ==========================================
        // ★ 마스터 스피드 퀴즈 (선착순 N명, Firestore 트랜잭션) ★
        // ==========================================
        window.updateMasterQuizAdminUI = function () {
            if (!window.playerState || !window.playerState.isAdmin) return;
            const st = window.masterQuizState;
            const status = document.getElementById('mqAdminStatus');
            const line = document.getElementById('mqWinnerLine');

            const maxW = Math.max(1, Math.floor(Number(st && st.maxWinners) || 1));
            const winners = (st && st.winners && typeof st.winners === 'object') ? st.winners : {};
            const winnerIds = Object.keys(winners);
            const count = (st && Number.isFinite(Number(st.winnersCount))) ? Number(st.winnersCount) : winnerIds.length;
            const isFull = count >= maxW;

            if (status) {
                if (st && st.isOpen) {
                    status.innerText = isFull ? `마감 (${count}/${maxW})` : `진행중 (${count}/${maxW})`;
                    status.className = isFull
                        ? 'text-[10px] bg-emerald-900/50 text-emerald-200 px-2 py-0.5 rounded border border-emerald-700'
                        : 'text-[10px] bg-cyan-900/50 text-cyan-100 px-2 py-0.5 rounded border border-cyan-700';
                } else {
                    status.innerText = '대기중';
                    status.className = 'text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-600';
                }
            }

            if (line) {
                if (st && (st.isOpen || winnerIds.length > 0)) {
                    if (winnerIds.length === 0) {
                        line.textContent = '';
                    } else {
                        const ordered = winnerIds
                            .map((id) => ({ id, at: Number(winners[id] && winners[id].at) || 0 }))
                            .sort((a, b) => a.at - b.at)
                            .slice(0, maxW);
                        const names = ordered.map((x, idx) => {
                            const w = winners[x.id] || {};
                            const n = w.name || STUDENT_NAMES[String(x.id)] || String(x.id);
                            return `${idx + 1}. ${n}(${x.id})`;
                        });
                        line.textContent = `정답자: ${names.join(' · ')}`;
                    }
                } else {
                    line.textContent = '';
                }
            }
        };

        window.syncMasterQuizModal = function () {
            const modal = document.getElementById('masterQuizModal');
            const qBlock = document.getElementById('masterQuizQuestionBlock');
            const hint = document.getElementById('masterQuizRewardHint');
            const input = document.getElementById('masterQuizAnswerInput');
            const feedback = document.getElementById('masterQuizFeedback');
            const submitBtn = document.getElementById('masterQuizSubmitBtn');
            if (!modal || !window.playerState) return;

            if (window.playerState.isGuest || window.playerState.isAdmin) {
                modal.classList.add('hidden');
                return;
            }

            // 로그인(또는 게스트 입장) 완료 전에는 팝업을 띄우지 않음. 선생님이 먼저 문제를 낸 뒤 학생이 접속하면
            // 스냅샷만으로는 이후에 다시 열리지 않으므로, 로그인 직후 updateUI()에서 syncMasterQuizModal을 반드시 호출함.
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay && !loginOverlay.classList.contains('hidden')) {
                modal.classList.add('hidden');
                return;
            }

            const st = window.masterQuizState;
            if (!st || !st.isOpen) {
                modal.classList.add('hidden');
                return;
            }

            const sid = st.sessionId != null ? String(st.sessionId) : '';
            const maxW = Math.max(1, Math.floor(Number(st.maxWinners) || 1));
            const winners = (st.winners && typeof st.winners === 'object') ? st.winners : {};
            const winnerIds = Object.keys(winners);
            const count = Number.isFinite(Number(st.winnersCount)) ? Number(st.winnersCount) : winnerIds.length;
            const isFull = count >= maxW;

            if (sid && sessionStorage.getItem('mq_dismissedSession') === sid && !isFull) {
                modal.classList.add('hidden');
                return;
            }

            const myId = localStorage.getItem('sambong_student_id');
            const iWon = !!(myId && winners[String(myId)]);
            // 정답·보상 처리된 학생은 팝업을 다시 띄우지 않음(선착순 N명일 때 마감 스냅샷 후 재오픈 방지)
            if (iWon) {
                modal.classList.add('hidden');
                return;
            }

            modal.classList.remove('hidden');

            if (qBlock) qBlock.textContent = st.question || '';
            if (hint) {
                const rx = Math.max(0, Math.floor(Number(st.rewardXp) || 0));
                const rb = Math.max(0, Number(st.rewardBong) || 0);
                hint.textContent = `보상(선착순 ${maxW}명): +${rx} XP · +${rb} B`;
            }

            if (isFull) {
                if (input) input.disabled = true;
                if (submitBtn) submitBtn.disabled = true;
                if (feedback) {
                    feedback.className = 'text-[10px] font-bold min-h-[1.25rem] text-amber-200';
                    feedback.textContent = '이미 정원이 차서 마감되었어요.';
                }
            } else {
                if (input) input.disabled = false;
                if (submitBtn) submitBtn.disabled = false;
                if (feedback) {
                    feedback.className = 'text-[10px] font-bold min-h-[1.25rem] text-slate-500';
                    feedback.textContent = '';
                }
            }
        };

        window.dismissMasterQuizModal = function () {
            const st = window.masterQuizState;
            if (st && st.sessionId != null) {
                sessionStorage.setItem('mq_dismissedSession', String(st.sessionId));
            }
            const modal = document.getElementById('masterQuizModal');
            if (modal) modal.classList.add('hidden');
        };

        window.publishMasterQuiz = async function () {
            if (!window.playerState || !window.playerState.isAdmin) return;
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다.');
            const qEl = document.getElementById('mq_adminQuestion');
            const aEl = document.getElementById('mq_adminAnswer');
            const maxEl = document.getElementById('mq_adminMaxWinners');
            const xpEl = document.getElementById('mq_adminXp');
            const bEl = document.getElementById('mq_adminBong');
            const q = qEl && qEl.value ? qEl.value.trim() : '';
            const a = aEl && aEl.value ? aEl.value.trim() : '';
            if (!q) return window.customAlert('문제를 입력해주세요.');
            if (!a) return window.customAlert('정답을 입력해주세요.');
            let maxWinners = maxEl ? parseInt(maxEl.value, 10) : 1;
            if (!Number.isFinite(maxWinners) || maxWinners < 1) maxWinners = 1;
            maxWinners = Math.min(13, Math.floor(maxWinners));
            let xp = xpEl ? parseInt(xpEl.value, 10) : 0;
            let bong = bEl ? parseFloat(bEl.value) : 0;
            if (!Number.isFinite(xp) || xp < 0) xp = 0;
            if (!Number.isFinite(bong) || bong < 0) bong = 0;
            const sessionId = Date.now();
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                await setDoc(
                    doc(db, 'artifacts', appId, 'public', 'data', 'masterquiz', 'state'),
                    {
                        isOpen: true,
                        sessionId,
                        question: q,
                        answer: a,
                        rewardXp: xp,
                        rewardBong: normalizeBongValue(bong),
                        maxWinners,
                        winners: {},
                        winnersCount: 0,
                        openedAt: sessionId,
                    },
                    { merge: true }
                );
                sessionStorage.removeItem('mq_dismissedSession');
                await window.customAlert('학생 화면에 스피드 퀴즈 팝업이 열렸습니다.');
            } catch (e) {
                console.error('publishMasterQuiz', e);
                await window.customAlert('저장 실패: ' + (e && e.message ? e.message : String(e)));
            }
        };

        window.resetMasterQuizState = async function () {
            if (!window.playerState || !window.playerState.isAdmin) return;
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다.');
            const ok = await window.customConfirm('스피드 퀴즈 상태를 초기화할까요?\n(진행중인 퀴즈가 있으면 학생 팝업이 닫힙니다)');
            if (!ok) return;
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                await setDoc(
                    doc(db, 'artifacts', appId, 'public', 'data', 'masterquiz', 'state'),
                    {
                        isOpen: false,
                        sessionId: Date.now(),
                        question: '',
                        answer: '',
                        maxWinners: 1,
                        winners: {},
                        winnersCount: 0,
                        resetAt: Date.now(),
                    },
                    { merge: true }
                );
                sessionStorage.removeItem('mq_dismissedSession');
                await window.customAlert('초기화 완료!');
            } catch (e) {
                console.error('resetMasterQuizState', e);
                await window.customAlert('초기화 실패: ' + (e && e.message ? e.message : String(e)));
            }
        };

        window.closeMasterQuizSession = async function () {
            if (!window.playerState || !window.playerState.isAdmin) return;
            if (!db) return window.customAlert('데이터베이스에 연결되지 않았습니다.');
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'masterquiz', 'state'), { isOpen: false }, { merge: true });
                await window.customAlert('스피드 퀴즈를 종료했습니다.');
            } catch (e) {
                console.error('closeMasterQuizSession', e);
                await window.customAlert('종료 실패: ' + (e && e.message ? e.message : String(e)));
            }
        };

        window.submitMasterQuizAnswer = async function () {
            if (window._mqSubmitting) return;
            if (!window.playerState || window.playerState.isGuest || window.playerState.isAdmin) return;
            const st = window.masterQuizState;
            if (!st || !st.isOpen) return window.customAlert('진행 중인 퀴즈가 없어요.');
            const maxW = Math.max(1, Math.floor(Number(st.maxWinners) || 1));
            const winners = (st.winners && typeof st.winners === 'object') ? st.winners : {};
            const winnerIds = Object.keys(winners);
            const count = Number.isFinite(Number(st.winnersCount)) ? Number(st.winnersCount) : winnerIds.length;
            if (count >= maxW) return window.customAlert('이미 정원이 차서 마감되었어요.');

            const myId = localStorage.getItem('sambong_student_id');
            if (!myId || myId === 'gm' || myId === 'gm_a') return;
            if (winners[String(myId)]) return window.customAlert('이미 이 퀴즈로 보상을 받았어요.');

            const inputEl = document.getElementById('masterQuizAnswerInput');
            const raw = inputEl ? inputEl.value : '';
            const feedback = document.getElementById('masterQuizFeedback');

            window._mqSubmitting = true;
            try {
                const authOk = await ensureAnonAuthReady();
                if (!authOk) return await window.customAlert('인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.');

                await runTransaction(db, async (transaction) => {
                    const qRef = doc(db, 'artifacts', appId, 'public', 'data', 'masterquiz', 'state');
                    const sRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + myId);
                    const qSnap = await transaction.get(qRef);
                    if (!qSnap.exists()) throw new Error('no_quiz');
                    const d = qSnap.data() || {};
                    if (!d.isOpen) throw new Error('closed');
                    const maxWinners = Math.max(1, Math.floor(Number(d.maxWinners) || 1));
                    const winners = (d.winners && typeof d.winners === 'object') ? d.winners : {};
                    const winnerIds = Object.keys(winners);
                    const count = Number.isFinite(Number(d.winnersCount)) ? Number(d.winnersCount) : winnerIds.length;
                    if (count >= maxWinners) throw new Error('taken');
                    if (winners[String(myId)]) throw new Error('already');
                    const expected = normalizeQuizAnswer(d.answer);
                    const got = normalizeQuizAnswer(raw);
                    if (got === '' || got !== expected) throw new Error('wrong');

                    const rx = Math.max(0, Math.floor(Number(d.rewardXp) || 0));
                    const rb = Math.max(0, Number(d.rewardBong) || 0);
                    const wname = STUDENT_NAMES[String(myId)] || String(myId);
                    const at = Date.now();
                    const nextCount = count + 1;
                    const fullNow = nextCount >= maxWinners;

                    transaction.set(
                        qRef,
                        {
                            [`winners.${String(myId)}`]: { name: wname, at },
                            winnersCount: nextCount,
                            ...(fullNow ? { isOpen: false, closedAt: at } : {})
                        },
                        { merge: true }
                    );
                    if (rx > 0 || rb > 0) {
                        transaction.set(sRef, { xp: increment(rx), bong: increment(normalizeBongValue(rb)) }, { merge: true });
                    }
                });

                // 보상은 트랜잭션에서 1회만 반영됨. 이 세션 팝업은 닫아 두고, syncMasterQuizModal이 다시 열지 않도록 dismiss와 동일하게 session에 기록
                window.dismissMasterQuizModal();
                await window.customAlert('🎉 선착순 정답! 보상이 반영되었습니다.');
            } catch (e) {
                const msg = e && e.message ? String(e.message) : String(e);
                if (msg === 'wrong') {
                    if (feedback) {
                        feedback.className = 'text-[10px] font-bold min-h-[1.25rem] text-rose-300';
                        feedback.textContent = '틀렸어요. 다시 생각해 보세요!';
                    }
                } else if (msg === 'taken' || msg === 'already' || msg === 'no_quiz' || msg === 'closed') {
                    await window.customAlert('이미 정원이 차서 마감되었거나, 이미 보상을 받은 퀴즈예요.');
                    window.syncMasterQuizModal();
                } else {
                    console.error('submitMasterQuizAnswer', e);
                    await window.customAlert('제출 처리 중 오류: ' + msg);
                }
            } finally {
                window._mqSubmitting = false;
            }
        };

        // ==========================================
        // ★ 골든벨 전용 함수 ★
        // ==========================================
        /** 마스터 화면·답안 표시용 HTML 이스케이프 */
        function escapeHtmlGb(s) {
            if (s == null || s === undefined) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        /** 실시간 제출 답안 표 (문항별 제출 내용·O/X·합계) */
        function buildGoldenBellMasterAnswerTableHtml(st) {
            const subs = st.submissions || {};
            const qs = st.questions || [];
            const n = qs.length;
            const subsKeys = Object.keys(subs);
            const submittedCount = subsKeys.filter(k => {
                const s = subs[k];
                return s && (s.finalized || s.rewardsGiven);
            }).length;

            let thead = '<thead><tr><th class="sticky left-0 z-10 bg-slate-800 p-1.5 text-[9px] border border-slate-600 min-w-[52px]">학생</th>';
            for (let i = 0; i < n; i++) {
                thead += `<th class="p-1.5 text-[9px] border border-slate-600 min-w-[76px]">Q${i + 1}</th>`;
            }
            thead += '<th class="p-1.5 text-[9px] border border-slate-600 min-w-[64px]">합계</th></tr></thead>';

            let body = '<tbody>';
            for (let i = 1; i <= 13; i++) {
                const id = String(i);
                const name = STUDENT_NAMES[id];
                const s = subs[id];
                body += `<tr><td class="sticky left-0 z-10 bg-slate-900/95 p-1.5 text-[9px] font-bold border border-slate-600">${escapeHtmlGb(name)}</td>`;
                if (!s || !Array.isArray(s.answers)) {
                    for (let j = 0; j < n; j++) {
                        body += `<td class="p-1.5 text-[9px] text-slate-500 border border-slate-600 align-top">—</td>`;
                    }
                    body += `<td class="p-1.5 text-[9px] text-slate-500 border border-slate-600">미제출</td></tr>`;
                    continue;
                }
                const results = Array.isArray(s.results) ? s.results : [];
                let correct = 0;
                for (let j = 0; j < n; j++) {
                    const ans = (s.answers[j] != null) ? String(s.answers[j]) : '';
                    const ok = results[j] === true;
                    if (ok) correct++;
                    const mark = ok ? '<span class="text-emerald-400 font-black">O</span>' : (results[j] === false ? '<span class="text-rose-400 font-black">X</span>' : '<span class="text-slate-500">—</span>');
                    const shortAns = ans.length > 14 ? ans.slice(0, 12) + '…' : ans;
                    const titleAttr = escapeHtmlGb(ans).replace(/"/g, '&quot;');
                    body += `<td class="p-1 text-[8px] border border-slate-600 align-top leading-tight" title="${titleAttr}"><div class="text-slate-200 break-all">${escapeHtmlGb(shortAns)}</div><div class="mt-0.5">${mark}</div></td>`;
                }
                const fin = !!(s.finalized || s.rewardsGiven);
                const rxp = s.rewardXpTotal;
                const rb = s.rewardBongTotal;
                const sumHtml = fin && rxp != null && rb != null
                    ? `<div class="text-emerald-300 font-bold">${correct}/${n}</div><div class="text-[8px] text-yellow-200/90">+${rxp}XP</div><div class="text-[8px] text-amber-200/90">+${rb}B</div>`
                    : `<div class="text-slate-300 font-bold">${correct}/${n}</div><div class="text-[8px] text-slate-500">${fin ? '완료' : '작성중'}</div>`;
                body += `<td class="p-1.5 text-[9px] border border-slate-600 align-top">${sumHtml}</td></tr>`;
            }
            body += '</tbody>';

            return `<div class="text-[10px] text-slate-300 mb-2">최종 제출·채점 완료: ${submittedCount} / 13 (실시간 반영)</div>
                <div class="overflow-x-auto max-h-[52vh] overflow-y-auto rounded-lg border border-slate-600/80">
                <table class="w-full border-collapse">${thead}${body}</table>
                </div>`;
        }

        window.updateGoldenBellAdminUI = function() {
            if(!window.playerState.isAdmin) return;
            const st = window.goldenbellState;
            const dash = document.getElementById('gbAdminDashboard');
            
            if (st && st.questions && st.questions.length > 0) {
                st.questions.forEach((item) => {
                    const qInput = document.getElementById(`gb_admin_q_${item.originalIndex}`);
                    const aInput = document.getElementById(`gb_admin_a_${item.originalIndex}`);
                    const xpInput = document.getElementById(`gb_admin_xp_${item.originalIndex}`);
                    const bongInput = document.getElementById(`gb_admin_bong_${item.originalIndex}`);
                    // 진행 중 스냅샷이 관리자 입력칸을 덮어써서 "작성 중 초기화"되는 문제 방지
                    if(qInput && aInput && st.isOpen) {
                        if(document.activeElement !== qInput && (qInput.value || '') === '') qInput.value = item.q;
                        if(document.activeElement !== aInput && (aInput.value || '') === '') aInput.value = item.a;
                    }
                    if (xpInput && bongInput && st.isOpen) {
                        const defXp = (item.rewardXp != null && item.rewardXp !== '') ? item.rewardXp : 10;
                        const defB = (item.rewardBong != null && item.rewardBong !== '') ? item.rewardBong : 1;
                        if(document.activeElement !== xpInput && (xpInput.value || '') === '') xpInput.value = defXp;
                        if(document.activeElement !== bongInput && (bongInput.value || '') === '') bongInput.value = defB;
                    }
                });
            }

            if (st && st.isOpen) {
                dash.classList.remove('hidden');
                dash.innerHTML = `
                    <h4 class="text-yellow-400 font-bold text-xs mb-2"><i class="fa-solid fa-table"></i> 실시간 답안·채점 현황</h4>
                    ${buildGoldenBellMasterAnswerTableHtml(st)}
                `;
            } else dash.classList.add('hidden');
        };

        window.renderGoldenBellMasterLive = function() {
            if(!window.playerState || !window.playerState.isAdmin) return;
            const container = document.getElementById('gbStudentContainer');
            if(!container) return;
            const st = window.goldenbellState;

            if(!st || !st.isOpen) return;

            const total = st.questions ? st.questions.length : 0;
            let html = `
                <div class="glass-panel p-4 rounded-2xl border border-yellow-500/50 mb-3 bg-slate-900/60">
                    <div class="flex items-center justify-between mb-1 gap-2 flex-wrap">
                        <div class="text-white font-bold text-sm"><i class="fa-solid fa-table text-yellow-400"></i> 골든벨 실시간 답안</div>
                        <div class="text-[10px] text-slate-400">총 ${total}문항 · 학생이 최종 제출하면 문항별로 O/X·합계가 갱신됩니다.</div>
                    </div>
                    ${buildGoldenBellMasterAnswerTableHtml(st)}
                </div>
            `;

            container.innerHTML = html;
        };

        window.saveAndOpenGoldenBell = async function() {
            if(!window.playerState.isAdmin) return;
            const qs = [];
            for(let i=0; i<10; i++) {
                const qText = document.getElementById(`gb_admin_q_${i}`).value.trim();
                const aText = document.getElementById(`gb_admin_a_${i}`).value.trim();
                if (!qText) continue;
                const xpEl = document.getElementById(`gb_admin_xp_${i}`);
                const bongEl = document.getElementById(`gb_admin_bong_${i}`);
                let rewardXp = xpEl ? parseInt(xpEl.value, 10) : 10;
                if (isNaN(rewardXp) || rewardXp < 0) rewardXp = 10;
                let rewardBong = bongEl ? parseFloat(bongEl.value) : 1;
                if (isNaN(rewardBong) || rewardBong < 0) rewardBong = 1;
                qs.push({ q: qText, a: aText, originalIndex: i, rewardXp, rewardBong });
            }
            if (qs.length === 0) return window.customAlert("문제를 1개 이상 입력해주세요.");
            
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'goldenbell', 'state'), { 
                isOpen: true, 
                questions: qs, 
                submissions: {} 
            }, {merge: true}); 
            window.customAlert(`🔔 골든벨 오픈 완료! (${qs.length}문제) 문항별 XP·봉은 출제 시 입력한 값으로 채점됩니다.`);
        };

        window.saveGoldenBellDraft = async function() {
            if(!window.playerState.isAdmin) return;
            const qs = [];
            for(let i=0; i<10; i++) {
                const qText = document.getElementById(`gb_admin_q_${i}`).value.trim();
                const aText = document.getElementById(`gb_admin_a_${i}`).value.trim();
                if (!qText) continue;
                const xpEl = document.getElementById(`gb_admin_xp_${i}`);
                const bongEl = document.getElementById(`gb_admin_bong_${i}`);
                let rewardXp = xpEl ? parseInt(xpEl.value, 10) : 10;
                if (isNaN(rewardXp) || rewardXp < 0) rewardXp = 10;
                let rewardBong = bongEl ? parseFloat(bongEl.value) : 1;
                if (isNaN(rewardBong) || rewardBong < 0) rewardBong = 1;
                qs.push({ q: qText, a: aText, originalIndex: i, rewardXp, rewardBong });
            }

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'goldenbell', 'draft'), {
                questions: qs,
                updatedAt: Date.now()
            }, { merge: true });
            window.customAlert('✅ 골든벨 문제가 저장되었습니다. (새로고침해도 유지)');
        };

        // 선생님 테스트용: 학생 화면 미리보기 토글
        window.toggleGoldenBellPreview = function() {
            if(!window.playerState || !window.playerState.isAdmin) return;
            window._gbPreviewStudent = !window._gbPreviewStudent;
            if(window._gbPreviewStudent) window.renderGoldenBellStudent();
            else window.renderGoldenBellMasterLive();
            window.customAlert(window._gbPreviewStudent ? '👀 학생 화면 미리보기 ON' : '📊 학생 화면 미리보기 OFF');
        };

        // 선생님 테스트용: 인원 부족해도 즉시 전투 시작
        window.forceStartRaidTest = async function() {
            if(!window.playerState || !window.playerState.isGM) return;
            const st = window.currentRaidState;
            if(!st || (st.status !== 'recruiting' && st.status !== 'playing')) return window.customAlert('먼저 레이드를 시작(모집)해주세요.');
            const participants = Array.isArray(st.participants) ? st.participants : [];
            if(participants.length < 1) return window.customAlert('참여자가 1명 이상 필요합니다. (선생님도 참여 버튼으로 들어갈 수 있어요)');

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                status: 'playing',
                currentTurn: st.currentTurn || 0,
                currentActorIndex: st.currentActorIndex || 0,
                turnStartTime: Date.now(),
                turnResolvedFor: null,
                [`turnSubmissions.${st.currentTurn || 0}`]: (st.turnSubmissions && st.turnSubmissions[st.currentTurn || 0]) ? st.turnSubmissions[st.currentTurn || 0] : {}
            }, { merge: true });

            window.customAlert('✅ 테스트 전투 시작! (인원 부족 무시)');
        };

        window.closeGoldenBell = async function() {
            if(!window.playerState.isAdmin) return;
            const ok = await window.customConfirm("골든벨을 종료하시겠습니까?\n(학생 화면에서 문제가 사라집니다)");
            if(ok) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'goldenbell', 'state'), { isOpen: false }, {merge: true});
        };

        window.renderGoldenBellStudent = function() {
            const container = document.getElementById('gbStudentContainer');
            if(!container) return;
            const st = window.goldenbellState;
            const mId = localStorage.getItem('sambong_student_id');
            
            if (!st || !st.isOpen) {
                container.innerHTML = '<div class="text-center p-6 text-slate-400 glass-panel rounded-2xl">현재 진행 중인 골든벨이 없습니다.</div>';
                return;
            }

            const totalQuestions = st.questions.length;
            const mySubmission = st.submissions && st.submissions[mId];
            const myAnswers = mySubmission && Array.isArray(mySubmission.answers) ? mySubmission.answers : [];
            const myResults = mySubmission && Array.isArray(mySubmission.results) ? mySubmission.results : [];
            const locked = !!(mySubmission && (mySubmission.finalized || mySubmission.rewardsGiven));
            const myScore = mySubmission && typeof mySubmission.score === 'number'
                ? mySubmission.score
                : (myResults || []).filter(r => r === true).length;
            const rxTotal = mySubmission && mySubmission.rewardXpTotal != null ? mySubmission.rewardXpTotal : null;
            const rbTotal = mySubmission && mySubmission.rewardBongTotal != null ? mySubmission.rewardBongTotal : null;

            // Firestore 스냅샷마다 이 함수가 호출되며 innerHTML로 DOM이 갈아끼워져 작성 중 답안이 사라지는 문제 방지:
            // 리렌더 직전 화면의 입력값·포커스(커서)를 보존한다.
            const prevAnswersByIdx = [];
            let restoreFocus = null;
            if (!locked) {
                for (let idx = 0; idx < totalQuestions; idx++) {
                    const el = document.getElementById(`gb_ans_${idx}`);
                    if (el) prevAnswersByIdx[idx] = el.value;
                }
                const ae = document.activeElement;
                if (ae && ae.id && /^gb_ans_\d+$/.test(ae.id)) {
                    restoreFocus = {
                        id: ae.id,
                        start: typeof ae.selectionStart === 'number' ? ae.selectionStart : null,
                        end: typeof ae.selectionEnd === 'number' ? ae.selectionEnd : null
                    };
                }
            }

            let html = `
                <div class="glass-panel p-3 rounded-2xl border border-yellow-500/40 mb-4 bg-slate-900/50">
                    <div class="text-white font-bold text-sm mb-1"><i class="fa-solid fa-bell text-yellow-400"></i> 골든벨</div>
                    <p class="text-[10px] text-slate-400 leading-relaxed">모든 문항에 답을 입력한 뒤 하단 <strong class="text-yellow-200">최종 제출 및 채점</strong>을 누르면 한 번에 채점·보상이 적용됩니다.</p>
                </div>
            `;
            
            st.questions.forEach((item, idx) => {
                const fromPrev = prevAnswersByIdx[idx];
                const val =
                    fromPrev !== undefined
                        ? fromPrev
                        : (myAnswers[idx] != null ? String(myAnswers[idx]) : '');
                const defRx = (item.rewardXp != null && !isNaN(Number(item.rewardXp))) ? Number(item.rewardXp) : 10;
                const defB = (item.rewardBong != null && !isNaN(Number(item.rewardBong))) ? Number(item.rewardBong) : 1;
                let inputCls = 'bg-slate-900/80 border border-slate-600 text-white';
                let resHtml = '';
                if (locked && myResults[idx] !== undefined && myResults[idx] !== null) {
                    const correct = myResults[idx] === true;
                    if (correct) {
                        inputCls = 'bg-emerald-900/20 border-emerald-500 text-white';
                        resHtml = `<span class="text-emerald-400 font-black text-sm">O</span> <span class="text-[10px] text-emerald-300/90">(+${defRx}XP · +${defB}B)</span>`;
                    } else {
                        inputCls = 'bg-red-900/20 border-sb-red text-white';
                        resHtml = `<span class="text-rose-400 font-bold text-sm">X</span> <span class="text-[10px] text-slate-400">(정답: ${escapeHtmlGb(item.a)})</span>`;
                    }
                }

                html += `
                <div class="glass-panel p-4 rounded-xl border-l-4 border-l-yellow-500 relative mb-3">
                    <div class="text-sb-gold font-black text-xs sm:text-sm mb-2">
                        <span class="bg-yellow-600/20 px-2 py-0.5 rounded text-yellow-400">문제 ${idx+1}</span>
                        <span class="text-white/95">${escapeHtmlGb(item.q)}</span>
                    </div>
                    <p class="text-[9px] text-slate-500 mb-2">이 문항 정답 시: ${defRx} XP · ${defB} B</p>
                    <div class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                        <input type="text"
                            id="gb_ans_${idx}"
                            value="${escapeHtmlGb(val)}"
                            ${locked ? 'disabled' : ''}
                            placeholder="정답 입력"
                            class="flex-1 px-3 py-2 rounded-lg text-sm font-bold focus:border-yellow-500 focus:outline-none transition shadow-inner ${inputCls}">
                        ${locked ? `<div class="text-right sm:text-left sm:min-w-[140px] shrink-0">${resHtml}</div>` : ''}
                    </div>
                </div>`;
            });

            if (locked) {
                html += `
                    <div class="mt-4 bg-emerald-900/25 border border-emerald-500/50 p-4 rounded-2xl text-center">
                        <div class="text-white font-black text-sm">✅ 채점 완료</div>
                        <div class="text-[11px] text-slate-200 font-bold mt-2">정답 ${myScore} / ${totalQuestions}문항</div>
                        <div class="text-[10px] text-yellow-200 mt-1">획득: +${rxTotal != null ? rxTotal : '—'} XP · +${rbTotal != null ? rbTotal : '—'} B</div>
                    </div>`;
            } else {
                html += `
                    <div class="mt-4">
                        <button type="button" onclick="window.submitGoldenBellAll()"
                            class="w-full py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-900 shadow-[0_0_18px_rgba(234,179,8,0.45)]">
                            최종 제출 및 채점
                        </button>
                        <p class="text-[9px] text-slate-500 text-center mt-2">제출 후에는 수정할 수 없습니다.</p>
                    </div>`;
            }

            container.innerHTML = html;

            if (restoreFocus) {
                const t = document.getElementById(restoreFocus.id);
                if (t && !t.disabled) {
                    t.focus();
                    try {
                        if (restoreFocus.start != null && restoreFocus.end != null) {
                            t.setSelectionRange(restoreFocus.start, restoreFocus.end);
                        }
                    } catch (_) {
                        /* 일부 브라우저/타입에서 selection 미지원 시 무시 */
                    }
                }
            }
        };

        /** 골든벨 최종 제출 직후: 문항별 내 답 vs 정답 비교 결과를 팝업으로 표시 */
        function showGoldenBellGradeModal({ score, totalQuestions, rewardXp, rewardBong, rows }) {
            return new Promise((resolve) => {
                const d = document.createElement('div');
                d.className =
                    'fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-3 py-6 overflow-y-auto';
                const rowsHtml = rows
                    .map((r, i) => {
                        const borderCls = r.ok
                            ? 'border-emerald-600/50 bg-emerald-950/25'
                            : 'border-rose-600/40 bg-rose-950/20';
                        const markCls = r.ok ? 'text-emerald-400' : 'text-rose-400';
                        const mark = r.ok ? 'O' : 'X';
                        return `
                    <div class="rounded-xl border ${borderCls} p-2.5 mb-2 text-left">
                        <div class="text-[10px] font-black text-yellow-400 mb-1">문제 ${i + 1}</div>
                        <div class="text-[10px] text-slate-400 mb-0.5">내 답</div>
                        <div class="text-xs font-bold text-white break-all mb-1.5">${escapeHtmlGb(r.my)}</div>
                        <div class="text-[10px] text-slate-400 mb-0.5">정답</div>
                        <div class="text-xs font-bold text-emerald-200/95 break-all mb-1">${escapeHtmlGb(r.correct)}</div>
                        <div class="text-right text-sm font-black ${markCls}">${mark}</div>
                    </div>`;
                    })
                    .join('');
                d.innerHTML = `
                    <div class="bg-sb-panel p-4 sm:p-6 rounded-3xl border border-yellow-500/40 max-w-md w-full shadow-2xl my-auto max-h-[90vh] flex flex-col">
                        <h3 class="text-lg font-display text-yellow-300 text-center shrink-0">채점 결과</h3>
                        <p class="text-center text-sm text-white font-bold mt-2 shrink-0">정답 ${score} / ${totalQuestions}문항</p>
                        <p class="text-center text-[11px] text-yellow-200/90 shrink-0 mb-3">보상: +${rewardXp} XP · +${rewardBong} B</p>
                        <div class="overflow-y-auto flex-1 min-h-0 pr-1">${rowsHtml}</div>
                        <button type="button" id="gbGradeOk" class="mt-4 bg-sb-blue hover:bg-blue-500 text-white font-bold py-2.5 px-8 rounded-full w-full shrink-0">확인</button>
                    </div>`;
                document.body.appendChild(d);
                document.getElementById('gbGradeOk').onclick = () => {
                    d.remove();
                    resolve(true);
                };
            });
        }

        /** 골든벨: 모든 문항 한 번에 채점·보상 (문항별 XP·봉 합산) */
        window.submitGoldenBellAll = async function() {
            if(window.playerState.isGuest) return window.customAlert("👀 게스트는 이용할 수 없어요.");
            if(window._gbFinalSubmitting) return;

            const st = window.goldenbellState;
            const mId = localStorage.getItem('sambong_student_id');
            if(!st || !st.isOpen) return window.customAlert("현재 진행 중인 골든벨이 없습니다.");

            const prev = st.submissions && st.submissions[mId];
            if (prev && (prev.finalized || prev.rewardsGiven)) {
                return window.customAlert('이미 최종 제출하여 채점이 완료되었습니다.');
            }

            const ok = await window.customConfirm("답안을 최종 제출하시겠습니까?\n제출 후에는 수정할 수 없습니다.");
            if(!ok) return;

            const totalQuestions = st.questions.length;
            const answers = [];
            const results = [];
            let rewardXp = 0;
            let rewardBong = 0;
            let score = 0;

            const gradeRows = [];
            st.questions.forEach((item, idx) => {
                const el = document.getElementById(`gb_ans_${idx}`);
                const val = el ? (el.value || '').trim() : '';
                answers.push(val);
                const isCorrect = normalizeQuizAnswer(val) === normalizeQuizAnswer(String(item.a));
                results.push(isCorrect);
                gradeRows.push({
                    ok: isCorrect,
                    my: val.length ? val : '(미입력)',
                    correct: String(item.a)
                });
                if (isCorrect) {
                    score++;
                    const rx = (typeof item.rewardXp === 'number' && !isNaN(item.rewardXp)) ? item.rewardXp : 10;
                    const rb = (typeof item.rewardBong === 'number' && !isNaN(item.rewardBong)) ? item.rewardBong : 1;
                    rewardXp += rx;
                    rewardBong += rb;
                }
            });

            window._gbFinalSubmitting = true;
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'goldenbell', 'state'), {
                    [`submissions.${mId}`]: {
                        answers,
                        results,
                        score,
                        finalized: true,
                        submittedAt: Date.now(),
                        rewardsGiven: true,
                        rewardXpTotal: rewardXp,
                        rewardBongTotal: rewardBong
                    }
                }, { merge: true });

                window.playerState.xp += rewardXp;
                window.playerState.bong = normalizeBongValue((Number(window.playerState.bong) || 0) + Number(rewardBong));
                await saveDataToCloud();
                updateUI();
                await showGoldenBellGradeModal({
                    score,
                    totalQuestions,
                    rewardXp,
                    rewardBong,
                    rows: gradeRows
                });
                window.renderGoldenBellStudent();
            } finally {
                window._gbFinalSubmitting = false;
            }
        };

        /**
         * 주말(토·일)에만: 서버 상태 기준으로 아직 이번 주말에 등장하지 않은 성구(1~7) 중 하나를 스폰.
         * 클레임 시 spawnedStarsThisWeekend에 누적되어 같은 주말 동안 같은 성구는 다시 뜨지 않음.
         */
        async function tryDragonBallSpawnTick() {
            if (!db) return;
            const dragonBallRef = doc(db, 'artifacts', appId, 'public', 'data', 'dragonball', 'state');
            const satKey = getWeekendSaturdayKey();

            if (!satKey) {
                const st = window.dragonBallState;
                if (st && st.isActive) {
                    try {
                        await setDoc(dragonBallRef, { isActive: false }, { merge: true });
                    } catch (e) {
                        console.error('dragonball weekday despawn', e);
                    }
                }
                return;
            }

            try {
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(dragonBallRef);
                    const st = snap.exists() ? snap.data() : {};
                    const now = Date.now();
                    if (st.isActive) return;
                    if (now < (st.nextSpawnTime || 0)) return;

                    let weekendKey = st.weekendKey || '';
                    let spawned = Array.isArray(st.spawnedStarsThisWeekend) ? [...st.spawnedStarsThisWeekend] : [];
                    if (weekendKey !== satKey) {
                        weekendKey = satKey;
                        spawned = [];
                    }

                    const pool = [1, 2, 3, 4, 5, 6, 7].filter((n) => !spawned.includes(n));
                    if (pool.length === 0) return;

                    const number = pool[Math.floor(Math.random() * pool.length)];
                    const posX = 8 + Math.random() * 84;
                    const posY = 8 + Math.random() * 84;

                    transaction.set(
                        dragonBallRef,
                        {
                            isActive: true,
                            number,
                            posX,
                            posY,
                            weekendKey,
                            spawnedStarsThisWeekend: spawned,
                        },
                        { merge: true }
                    );
                });
            } catch (e) {
                console.error('tryDragonBallSpawnTick', e);
            }
        }

        window.claimDragonBall = async function() {
            if(window.playerState.isGuest) return window.customAlert("👀 게스트는 이용할 수 없어요.");
            if(!window.dragonBallState || !window.dragonBallState.isActive) return;
            if (!isLocalWeekend()) return window.customAlert('드래곤볼은 주말(토·일)에만 수집할 수 있어요!');
            
            const dbNum = window.dragonBallState.number;
            if(!window.playerState.dragonBalls) window.playerState.dragonBalls = [];
            
            if(window.playerState.dragonBalls.includes(dbNum)) {
                return window.customAlert("이미 가지고 있는 드래곤볼입니다!");
            }
            
            window.playerState.dragonBalls.push(dbNum);
            window.playerState.xp += 50;
            await window.customAlert(`🐉 ${dbNum}성구를 찾았습니다! (+50 XP)\n7개를 모두 모으면 엄청난 일이 일어납니다!`);
            
            if(window.playerState.dragonBalls.length >= 7) {
                window.playerState.dragonBalls = [];
                window.playerState.xp += 700;
                await window.customAlert(`🌟 7개의 드래곤볼을 모두 모았습니다!\n신룡의 축복으로 엄청난 경험치(+700 XP)를 획득했습니다!`);
            }
            
            const dragonBallRef = doc(db, 'artifacts', appId, 'public', 'data', 'dragonball', 'state');
            try {
                await updateDoc(dragonBallRef, {
                    isActive: false,
                    lastClaimTime: Date.now(),
                    nextSpawnTime: Date.now() + 30 * 60 * 1000,
                    spawnedStarsThisWeekend: arrayUnion(dbNum),
                });
            } catch (e) {
                await setDoc(
                    dragonBallRef,
                    {
                        isActive: false,
                        lastClaimTime: Date.now(),
                        nextSpawnTime: Date.now() + 30 * 60 * 1000,
                        spawnedStarsThisWeekend: arrayUnion(dbNum),
                    },
                    { merge: true }
                );
            }
            updateUI();
            saveDataToCloud();
            updateDragonBallUI();
        };

        function updateDragonBallUI() {
            const zone = document.getElementById('dragonBallCatchZone');
            const stars = document.getElementById('dragonBallCatchStars');
            if (!zone) return;
            const showCatch =
                window.dragonBallState &&
                window.dragonBallState.isActive &&
                !window.playerState.isAdmin &&
                isLocalWeekend();
            if (showCatch) {
                zone.classList.remove('hidden');
                if (stars && window.dragonBallState) {
                    let starsHtml = '';
                    for (let i = 0; i < window.dragonBallState.number; i++) {
                        starsHtml += `<i class="fa-solid fa-star text-red-700 drop-shadow-md text-[6px] sm:text-[8px] m-[0.5px]"></i>`;
                    }
                    stars.innerHTML = starsHtml;
                }
            } else {
                zone.classList.add('hidden');
            }
        }

        function checkWeekendTime() {
            const day = new Date().getDay();
            isWeekend = (day === 0 || day === 6);
            // 드래곤볼 '보관함'은 주중에도 항상 보이게 하고(수집 현황), 주말 여부는 이벤트 스폰 등 다른 로직에서만 사용합니다.
        }

        // --- 레이드 관련 함수들 ---
        function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

        function getRaidTurnStartTime(st) {
            return st.turnStartTime || st.startTime || Date.now();
        }

        function raidIsMyParticipant(st) {
            if(!st || !Array.isArray(st.participants)) return false;
            return st.participants.some(p => p.id === window.playerState.id);
        }

        function getRaidBaseDamage(st) {
            const mhp = st.maxBossHP || BASE_BOSS_HP;
            const len = (st.questions && st.questions.length) ? st.questions.length : 1;
            return Math.max(10, Math.round(mhp / len));
        }

        function getRaidSpeedTier(elapsedMs) {
            if(elapsedMs <= RAID_CRITICAL_MS) return { label: '크리티컬', mul: 2 };
            if(elapsedMs <= RAID_TURN_MS) return { label: '그레이트', mul: 1 };
            return { label: '늦게', mul: 0.5 };
        }

        function renderRaidTimerUI() {
            const modal = document.getElementById('raidBattleModal');
            if(!modal || modal.classList.contains('hidden')) return;
            const st = window.currentRaidState;
            if(!st || st.status !== 'playing') return;

            const container = document.getElementById('raidTimerBarContainer');
            const bar = document.getElementById('raidTimerBar');
            const bossImg = document.getElementById('raidBossImage');
            const turnText = document.getElementById('raidTurnText');
            if(!container || !bar) return;

            container.classList.remove('hidden');
            const elapsed = Math.max(0, Date.now() - getRaidTurnStartTime(st));
            const remaining = Math.max(0, RAID_TURN_MS - elapsed);
            const pct = (remaining / RAID_TURN_MS) * 100;
            bar.style.width = `${pct}%`;

            // 타이머 숫자가 줄어들수록 보스가 점점 커지게
            if(bossImg) {
                const elapsedRatio = clamp(elapsed / RAID_TURN_MS, 0, 1);
                const scale = 1 + elapsedRatio * 0.9; // 최대 1.9배
                bossImg.style.transform = `scale(${scale})`;
            }

            if(turnText) {
                const sec = Math.max(0, Math.ceil(remaining / 1000));
                // 숫자 타이머 UI (레이드 턴 진행 중에는 여기서 갱신)
                const turn = st.currentTurn || 0;
                const questionsLen = (st.questions && st.questions.length) ? st.questions.length : 0;
                const shown = questionsLen > 0 ? `${turn + 1}/${questionsLen}` : `${turn + 1}`;
                turnText.innerText = `${shown} | ${sec}s`;
            }
        }

        async function tryAdvanceRaidTurn() {
            if(window._raidResolving) return;
            const st = window.currentRaidState;
            if(!st || st.status !== 'playing') return;

            const turn = st.currentTurn || 0;
            if(st.turnResolvedFor === turn) return;

            const participants = st.participants || [];
            const turnSubsAll = st.turnSubmissions || {};
            const turnSubs = turnSubsAll[turn] || {};

            const elapsed = Date.now() - getRaidTurnStartTime(st);
            const timeUp = elapsed >= RAID_TURN_MS;
            const actorIndex = typeof st.currentActorIndex === 'number' ? st.currentActorIndex : 0;
            const actor = participants[actorIndex] || null;
            const actorId = actor ? String(actor.id) : null;
            const actorDone = actorId ? turnSubs[actorId] !== undefined : false;

            // 한 명씩 턴제로: 현재 배우(actor)가 답을 했거나 시간이 다 되었을 때만 턴 진행
            const shouldAdvance = timeUp || actorDone;

            if(!shouldAdvance) return;

            window._raidResolving = true;
            try {
                const questionsLen = (st.questions && st.questions.length) ? st.questions.length : 0;
                const nextTurn = turn + 1;
                // 다음 턴의 배우 인덱스 (순환)
                const nextActorIndex = participants.length > 0 ? ((actorIndex + 1) % participants.length) : 0;
                const isLast = questionsLen > 0 ? nextTurn >= questionsLen : true;

                const newLogs = Array.isArray(st.logs) ? [...st.logs] : [];
                if(timeUp && !actorDone) newLogs.push(`⏱️ ${turn + 1}턴 시간초과 (차례: ${actor ? actor.name : '알 수 없음'})`);
                if(isLast) newLogs.push('✅ 레이드 완료!');

                if(isLast) {
                    const raidResult = (st.bossHP || 0) <= 0 ? 'success' : 'fail';
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                        status: 'waiting',
                        currentTurn: 0,
                        turnStartTime: 0,
                        turnResolvedFor: turn,
                        turnSubmissions: {},
                        raidResult: raidResult,
                        completedAt: Date.now(),
                        completionSessionId: st.startTime || null,
                        rewardsGivenFor: null,
                        logs: newLogs
                    }, { merge: true });
                } else {
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                        currentTurn: nextTurn,
                        turnStartTime: Date.now(),
                        turnResolvedFor: turn,
                        logs: newLogs,
                        currentActorIndex: nextActorIndex,
                        [`turnSubmissions.${nextTurn}`]: {}
                    }, { merge: true });
                }
            } finally {
                window._raidResolving = false;
            }
        }

        window.maybeDistributeRaidRewards = async function(st) {
            if(!window.playerState.isGM) return;
            if(!st || st.status !== 'waiting' || st.raidResult !== 'success') return;

            const sessionId = st.completionSessionId || st.startTime || st.completedAt;
            if(!sessionId) return;
            if(st.rewardsGivenFor === sessionId) return;
            if(window._raidRewardingFor === sessionId) return;

            window._raidRewardingFor = sessionId;
            try {
                // 먼저 보상 플래그를 박아 중복 지급 가능성을 줄임
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                    rewardsGivenFor: sessionId,
                    rewardsGivenAt: Date.now()
                }, { merge: true });

                const participants = Array.isArray(st.participants) ? st.participants : [];
                const dmgBy = (st && st.damageBy && typeof st.damageBy === 'object') ? st.damageBy : {};
                const maxHp = st.maxBossHP || BASE_BOSS_HP;

                const batch = writeBatch(db);
                participants.forEach(p => {
                    const id = p && p.id !== undefined ? String(p.id) : null;
                    if(!id) return;
                    // 보스에게 준 데미지에 비례 보상(최대 100XP/20B)
                    const dmg = Number(dmgBy[id]) || 0;
                    const ratio = maxHp > 0 ? (dmg / maxHp) : 0;
                    const rewardXp = Math.max(0, Math.min(100, Math.floor(ratio * 100)));
                    // 봉은 소수 1자리 사용중이므로 0.1 단위 반올림
                    const rewardBong = Math.max(0, Math.min(20, Math.round(ratio * 20 * 10) / 10));

                    if(rewardXp <= 0 && rewardBong <= 0) return;
                    batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'students', 'student_' + id), {
                        xp: increment(rewardXp),
                        bong: increment(rewardBong)
                    }, { merge: true });
                });
                await batch.commit();

                // GM만 간단 알림
                window.customAlert(`✅ 보스 격파 보상 지급 완료!\n(개인 데미지 비례 / 최대 100XP, 20B)`);
            } catch(e) {
                console.error('raid reward distribution failed', e);
            } finally {
                window._raidRewardingFor = null;
            }
        };

        window.openRaidLobby = async function() {
            if(!window.playerState.isGM) return;
            const qs = [];
            for(let i=0; i<5; i++) {
                const qText = document.getElementById(`rq_${i}`).value.trim();
                const options = [];
                for(let j=0; j<4; j++) {
                    options.push(document.getElementById(`rop_${i}_${j}`).value.trim());
                }
                const answer = document.querySelector(`input[name="ra_${i}"]:checked`).value;
                if(qText) qs.push({ q: qText, options, a: parseInt(answer) });
            }
            if(qs.length === 0) return window.customAlert('문제를 1개 이상 입력하세요.');
            
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                status: 'recruiting', participants: [], bossHP: BASE_BOSS_HP, maxBossHP: BASE_BOSS_HP,
                currentTurn: 0, currentActorIndex: 0,
                startTime: Date.now(), combo: 0, logs: [], questions: qs,
                turnStartTime: 0, turnResolvedFor: null, turnSubmissions: {},
                raidResult: null, completedAt: 0, completionSessionId: null, rewardsGivenFor: null,
                lastLogAnnouncedFor: null,
                damageBy: {}
            });
            window.customAlert('레이드 모집 시작!');
        };
        
        window.saveRaidQuestions = async function() {
            if(!window.playerState.isGM) return;
            const qs = [];
            for(let i=0; i<5; i++) {
                const qText = document.getElementById(`rq_${i}`).value.trim();
                const options = [];
                for(let j=0; j<4; j++) options.push(document.getElementById(`rop_${i}_${j}`).value.trim());
                const answer = document.querySelector(`input[name="ra_${i}"]:checked`).value;
                qs.push({ q: qText, options, a: parseInt(answer) });
            }
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'draft'), {
                questions: qs,
                updatedAt: Date.now()
            }, { merge: true });
            window.customAlert('✅ 레이드 문제가 저장되었습니다. (새로고침해도 유지)');
        };

        window.resetRaidForce = async function() {
            if(!window.playerState.isGM) return;
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                status: 'waiting',
                raidResult: null,
                completedAt: 0,
                completionSessionId: null,
                rewardsGivenFor: null
            }, {merge:true});
            window.customAlert('레이드 강제 종료됨.');
        };

        window.joinRaid = async function() {
            if(window.playerState.isGuest) return;
            if (!isLocalWeekend()) return window.customAlert('주말(토·일)에만 레이드에 참여할 수 있어요!');
            const st = window.currentRaidState;
            if(!st) return;
            const canJoin = (st.status === 'recruiting') || (st.status === 'playing' && (st.participants || []).length < 5);
            if(!canJoin) return window.customAlert('현재 참여할 수 있는 레이드가 없습니다.');
            if((st.participants || []).some(p => p.id === window.playerState.id)) return window.customAlert('이미 참여했습니다.');
            if((st.participants || []).length >= 5) return window.customAlert('최대 인원(5명)이 꽉 찼습니다!');
            
            const p = [...(st.participants || []), { id: window.playerState.id, name: STUDENT_NAMES[window.playerState.id] }];
            let newStatus = st.status || 'recruiting';
            let playingInit = null;
            if(newStatus === 'recruiting' && p.length === 5) {
                newStatus = 'playing';
                playingInit = { turnStartTime: Date.now(), turnResolvedFor: null, turnSubmissions: { 0: {} }, currentActorIndex: 0 };
            } else if(newStatus === 'playing') {
                // 진행 중 합류: 현재 턴 submissions가 없으면 보정
                playingInit = { [`turnSubmissions.${st.currentTurn || 0}`]: (st.turnSubmissions && st.turnSubmissions[st.currentTurn || 0]) ? st.turnSubmissions[st.currentTurn || 0] : {} };
            }
            
            window._raidSpectateActive = false;
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), { participants: p, status: newStatus, ...(playingInit || {}) }, {merge: true});
            document.getElementById('raidBattleModal').classList.remove('hidden');
        };

        window.giveUpRaid = async function() {
            if(window.playerState.isGuest) return;
            const st = window.currentRaidState;
            if(!st || !Array.isArray(st.participants)) {
                document.getElementById('raidBattleModal').classList.add('hidden');
                return;
            }

            const myId = window.playerState.id;
            if(!st.participants.some(p => String(p.id) === String(myId))) {
                // 관전자는 그냥 닫기
                window._raidSpectateActive = false;
                document.getElementById('raidBattleModal').classList.add('hidden');
                return;
            }

            const newParticipants = st.participants.filter(p => String(p.id) !== String(myId));
            const turn = st.currentTurn || 0;
            const actorIndex = typeof st.currentActorIndex === 'number' ? st.currentActorIndex : 0;
            const leavingIndex = st.participants.findIndex(p => String(p.id) === String(myId));

            // 로그
            const pName = st.participants.find(p => String(p.id) === String(myId))?.name || STUDENT_NAMES[myId] || myId;
            const newLogs = Array.isArray(st.logs) ? [...st.logs, `🏃 ${pName} 도망! (참여 탈퇴)`] : [`🏃 ${pName} 도망! (참여 탈퇴)`];

            // 현재 턴에 내 제출 기록이 있으면 제거 (차례 꼬임 방지)
            const turnSubs = (st.turnSubmissions && st.turnSubmissions[turn]) ? { ...st.turnSubmissions[turn] } : {};
            delete turnSubs[String(myId)];

            // actorIndex 보정: 내 앞에서 빠지면 index 감소, 내가 actor면 그대로 다음 사람으로 넘어가게
            let nextActorIndex = actorIndex;
            if(leavingIndex !== -1) {
                if(leavingIndex < actorIndex) nextActorIndex = Math.max(0, actorIndex - 1);
                if(leavingIndex === actorIndex) nextActorIndex = actorIndex; // 같은 인덱스 자리에 다음 사람이 들어오므로 그대로 유지
            }
            if(newParticipants.length > 0) nextActorIndex = nextActorIndex % newParticipants.length;
            else nextActorIndex = 0;

            let nextStatus = st.status;
            // 진행 중에 탈주해서 5명 미만이면: 진행 유지 + 빈 자리 합류 허용(이미 joinRaid가 허용)
            // 전부 나가면 대기 상태로
            if(newParticipants.length === 0) {
                nextStatus = 'waiting';
            }

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                participants: newParticipants,
                status: nextStatus,
                logs: newLogs,
                currentActorIndex: nextActorIndex,
                [`turnSubmissions.${turn}`]: turnSubs
            }, { merge: true });

            window._raidSpectateActive = false;
            document.getElementById('raidBattleModal').classList.add('hidden');
        };

        window.closeRaidModal = function() {
            document.getElementById('raidBattleModal').classList.add('hidden');
        };

        window.spectateRaid = function() {
            if(window.playerState.isGuest) return;
            if (!isLocalWeekend()) return window.customAlert('주말(토·일)에만 관전할 수 있어요!');
            const st = window.currentRaidState;
            if(!st || st.status !== 'playing') return window.customAlert('전투 중일 때만 관전할 수 있어요.');
            if(raidIsMyParticipant(st)) return window.customAlert('이미 참여자입니다.');

            window._raidSpectateActive = true;
            const modal = document.getElementById('raidBattleModal');
            if(modal) modal.classList.remove('hidden');
            updateRaidBattleUI();
            renderRaidTimerUI();
        };

        window.submitRaidAnswer = async function(ansIdx) {
            if(window.playerState.isGuest) return;
            const st = window.currentRaidState;
            if(!st || st.status !== 'playing') return;
            if(!raidIsMyParticipant(st)) return window.customAlert('관전 중이라 제출할 수 없습니다.');
            if(!Array.isArray(st.questions) || st.questions.length === 0) return;

            const turn = st.currentTurn || 0;
            const q = st.questions[turn];
            if(!q) return;

            const myId = window.playerState.id;
            const turnSubsAll = st.turnSubmissions || {};
            const turnSubs = turnSubsAll[turn] || {};
            if(turnSubs[myId] !== undefined) return; // 이미 제출한 경우 무시

            const ansNumber = parseInt(ansIdx);
            const correctIdx = q.a;
            const isCorrect = ansNumber === correctIdx;

            const elapsed = Math.max(0, Date.now() - getRaidTurnStartTime(st));
            const tier = getRaidSpeedTier(elapsed);

            const base = getRaidBaseDamage(st);
            const combo = st.combo || 0;

            let bossHP = st.bossHP || 0;
            // 장착 무기 등급에 따른 보너스 데미지(정답 시에만 적용)
            let weaponBonus = 0;
            let weaponMul = 1;
            if(window.playerState.equippedWeapon) {
                const wp = WEAPON_DATA.find(w => w.id === window.playerState.equippedWeapon);
                if(wp) {
                    weaponBonus = wp.bonus || 0;
                    weaponMul = 1 + (weaponBonus / 200);
                }
            }

            if(isCorrect) {
                const newCombo = combo + 1;
                // 빠를수록 크리티컬이 터질 확률이 올라감
                const criticalChance = elapsed <= RAID_CRITICAL_MS ? 0.65
                    : (elapsed <= RAID_TURN_MS ? 0.35 : 0.15);
                const isCritical = Math.random() < criticalChance;

                // 조합이 쌓이면 안정적으로 데미지 증가
                const comboMul = 1 + Math.min(0.6, combo * 0.07);
                const normalTierMul = tier.label === '그레이트' ? 1.05 : 1.0;
                const criticalMul = 2.2;

                const damage = Math.round(base * comboMul * weaponMul * normalTierMul * (isCritical ? criticalMul : 1));
                bossHP = clamp(bossHP - damage, 0, st.maxBossHP || BASE_BOSS_HP);

                const pName = (st.participants || []).find(p => p.id === myId)?.name || STUDENT_NAMES[myId] || myId;
                const newLogs = Array.isArray(st.logs) ? [...st.logs] : [];
                newLogs.push(`${pName}: 정답${isCritical ? ' (크리티컬!)' : ''} -${damage}${weaponBonus ? ` (무기 +${weaponBonus})` : ''}`);

                // 여러 참가자가 동시에 제출해도 turnSubmissions가 덮어써지지 않게
                // dot-notation으로 해당 턴/해당 학생만 업데이트
                const updatePayload = {
                    bossHP: bossHP,
                    combo: newCombo,
                    logs: newLogs,
                    [`damageBy.${myId}`]: increment(damage),
                    [`turnSubmissions.${turn}.${myId}`]: ansNumber
                };
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), updatePayload, { merge: true });

                // 보스가 0이 되면 즉시 종료 처리
                if(bossHP <= 0) {
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                        status: 'waiting',
                        currentTurn: 0,
                        turnStartTime: 0,
                        turnResolvedFor: turn,
                        turnSubmissions: {},
                        raidResult: 'success',
                        completedAt: Date.now(),
                        completionSessionId: st.startTime || null,
                        rewardsGivenFor: null,
                        logs: [...newLogs, '💥 보스 격파!']
                    }, { merge: true });
                }
            } else {
                const newCombo = 0;
                // 오답은 보스 체력을 소량 회복
                const heal = Math.round(base * 0.12);
                bossHP = clamp(bossHP + heal, 0, st.maxBossHP || BASE_BOSS_HP);

                const pName = (st.participants || []).find(p => p.id === myId)?.name || STUDENT_NAMES[myId] || myId;
                const newLogs = Array.isArray(st.logs) ? [...st.logs] : [];
                newLogs.push(`${pName}: 오답 +${heal}`);

                const updatePayload = {
                    bossHP: bossHP,
                    combo: newCombo,
                    logs: newLogs,
                    [`turnSubmissions.${turn}.${myId}`]: ansNumber
                };
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), updatePayload, { merge: true });
            }
        };

        function updateRaidEntryUI() {
            const st = window.currentRaidState;
            const btn = document.getElementById('btnJoinRaid');
            const cntDiv = document.getElementById('raidJoinCount');
            const rCount = document.getElementById('rCount');
            const statusTxt = document.getElementById('raidTimeStatusText');
            const spectateBtn = document.getElementById('btnSpectateRaid');
            
            if(!btn) return;

            if (!st || !st.status) {
                btn.disabled = true;
                btn.innerText = "모집 대기중";
                btn.className = "w-full bg-slate-700 text-slate-400 font-bold py-2.5 px-4 rounded-xl border border-slate-600 text-xs cursor-not-allowed";
                if (cntDiv) cntDiv.classList.add('hidden');
                if (statusTxt) {
                    statusTxt.innerText = "상태 확인 중...";
                    statusTxt.className = "text-[10px] text-slate-500 font-bold";
                }
                return;
            }

            const weekendOk = isLocalWeekend();

            if(st.status === 'recruiting') {
                if (!weekendOk) {
                    btn.disabled = true;
                    btn.innerText = "주말에만 참여";
                    btn.className = "w-full bg-slate-700 text-slate-400 font-bold py-2.5 px-4 rounded-xl border border-slate-600 text-xs cursor-not-allowed";
                    cntDiv.classList.remove('hidden');
                    rCount.innerText = (st.participants && st.participants.length) ? st.participants.length : 0;
                    statusTxt.innerText = "📅 주말(토·일)에만 참여 가능 (모집 준비 중)";
                    statusTxt.className = "text-[10px] text-amber-300 font-bold";
                } else {
                    btn.disabled = false;
                    btn.innerText = "레이드 참가하기";
                    btn.className = "w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-[0_0_15px_rgba(147,51,234,0.5)] transition transform hover:scale-105 text-xs";
                    cntDiv.classList.remove('hidden');
                    rCount.innerText = st.participants.length;
                    statusTxt.innerText = "🔥 용사 모집 중!";
                    statusTxt.className = "text-[10px] text-emerald-400 font-bold animate-pulse";
                }
            } else if (st.status === 'playing') {
                btn.disabled = true;
                btn.innerText = "전투 진행 중";
                btn.className = "w-full bg-slate-800 text-red-400 font-bold py-2.5 px-4 rounded-xl border border-red-500/50 text-xs";
                cntDiv.classList.add('hidden');
                statusTxt.innerText = "⚔️ 전투 중!";
                statusTxt.className = "text-[10px] text-red-400 font-bold animate-pulse";
            } else {
                btn.disabled = true;
                btn.innerText = "모집 대기중";
                btn.className = "w-full bg-slate-700 text-slate-400 font-bold py-2.5 px-4 rounded-xl border border-slate-600 text-xs cursor-not-allowed";
                cntDiv.classList.add('hidden');
                statusTxt.innerText = "휴식 중";
                statusTxt.className = "text-[10px] text-slate-500 font-bold";
            }

            // 관전 UI 제어 + 레이드 타이머 구동 (주말 협동 레이드: 관전도 주말에만)
            const canSpectate = weekendOk && st.status === 'playing' && window.playerState && !window.playerState.isGuest && !raidIsMyParticipant(st);
            if(spectateBtn) {
                if(canSpectate) {
                    spectateBtn.classList.remove('hidden');
                    spectateBtn.disabled = false;
                } else {
                    spectateBtn.classList.add('hidden');
                    spectateBtn.disabled = true;
                }
            }

            // 레이드가 시작되면 자동 관전 모드 (비참여자, 주말만)
            const modal = document.getElementById('raidBattleModal');
            if(canSpectate && modal && modal.classList.contains('hidden')) {
                window._raidSpectateActive = true;
                modal.classList.remove('hidden');
            }
            if(st.status !== 'playing' && window._raidSpectateActive) {
                if(modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
                window._raidSpectateActive = false;
            }

            // 기존 문서에 turnStartTime이 없으면(이미 시작된 레이드) 1회 보정
            if(st.status === 'playing' && !st.turnStartTime) {
                const key = st.startTime || 0;
                if(window._raidTurnStartInitKey !== key) {
                    window._raidTurnStartInitKey = key;
                    (async () => {
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'raid', 'state'), {
                            turnStartTime: Date.now(),
                            turnResolvedFor: null,
                            turnSubmissions: st.turnSubmissions || {}
                        }, { merge: true });
                    })().catch(e => console.error('raid turn init failed', e));
                }
            }

            // 턴 타이머(시간초과/모든 제출일 때 진행) 구동
            if(st.status === 'playing') {
                if(!window.raidTimerInterval) {
                    window.raidTimerInterval = setInterval(() => {
                        const st2 = window.currentRaidState;
                        if(!st2 || st2.status !== 'playing') {
                            if(window.raidTimerInterval) clearInterval(window.raidTimerInterval);
                            window.raidTimerInterval = null;
                            return;
                        }
                        renderRaidTimerUI();
                        void tryAdvanceRaidTurn();
                    }, 500);
                }
            } else {
                if(window.raidTimerInterval) clearInterval(window.raidTimerInterval);
                window.raidTimerInterval = null;
                window._raidTurnStartInitKey = null;
            }

            // 보상 지급 + 전투로그 공지 (레이드 종료 시 1회)
            if(st.status === 'waiting') {
                if(st.raidResult === 'success') {
                    void window.maybeDistributeRaidRewards(st);
                }

                const completionId = st.completedAt || st.completionSessionId || st.startTime;
                // 레이드 종료 팝업은 "종료 후 10분 이내"에만, 그리고 같은 종료건은 1회만 표시
                const within10Min = st.completedAt ? (Date.now() - st.completedAt) <= (10 * 60 * 1000) : true;
                const lsKey = completionId ? `raidPopupSeen_${completionId}` : null;
                const alreadySeen = lsKey ? localStorage.getItem(lsKey) === '1' : false;

                if(within10Min && completionId && !alreadySeen && window._raidLastAnnouncedId !== completionId && Array.isArray(st.logs)) {
                    window._raidLastAnnouncedId = completionId;
                    if(lsKey) localStorage.setItem(lsKey, '1');
                    const lastLogs = st.logs.slice(-5).join('\n');
                    const title = st.raidResult === 'success' ? '✅ 레이드 클리어!' : '⚔️ 레이드 종료';
                    (async () => {
                        await window.customAlert(`${title}\n\n${lastLogs}`);
                        // 팝업 확인 후 레이드 화면을 닫고 본 화면으로 복귀
                        const modal = document.getElementById('raidBattleModal');
                        if(modal) modal.classList.add('hidden');
                        window._raidSpectateActive = false;
                        window.switchTab('quests');
                    })();
                }
            }
        }

        function updateRaidBattleUI() {
            const st = window.currentRaidState;
            const modal = document.getElementById('raidBattleModal');
            if(!modal || modal.classList.contains('hidden')) return;

            const giveUpBtn = document.getElementById('btnGiveUpRaid');
            const exitBtn = document.getElementById('btnExitRaid');
            const spectatorLabel = document.getElementById('raidSpectatorLabel');
            const optGroup = document.getElementById('raidMultipleChoiceGroup');
            const timerContainer = document.getElementById('raidTimerBarContainer');

            const hpBar = document.getElementById('raidBossHPBar');
            const hpText = document.getElementById('raidBossHPText');
            if(hpBar && hpText) {
                const pct = Math.max(0, (st.bossHP / st.maxBossHP) * 100);
                hpBar.style.width = `${pct}%`;
                hpText.innerText = `${Math.ceil(st.bossHP)}/${st.maxBossHP}`;
            }

            const logDiv = document.getElementById('raidLogContainer');
            if(logDiv && st.logs) {
                logDiv.innerHTML = st.logs.map(l => `<div>${l}</div>`).join('');
            }

            const plist = document.getElementById('raidParticipantsList');
            if(plist && st.participants) {
                plist.innerHTML = st.participants.map(p => `<div class="text-[10px] text-slate-300 flex items-center gap-1"><i class="fa-solid fa-user text-slate-500"></i> ${p.name}</div>`).join('');
            }

            const isParticipant = raidIsMyParticipant(st);
            const isSpectator = st.status === 'playing' && !isParticipant;

            if(giveUpBtn) giveUpBtn.classList.toggle('hidden', !isParticipant);
            if(exitBtn) exitBtn.classList.remove('hidden');
            if(spectatorLabel) spectatorLabel.classList.toggle('hidden', !isSpectator);

            const turnText = document.getElementById('raidTurnText');
            const qText = document.getElementById('raidQuestionText');

            if(st.status !== 'playing') {
                if(optGroup) optGroup.classList.add('hidden');
                if(timerContainer) timerContainer.classList.add('hidden');
                if(turnText) {
                    if(st.status === 'recruiting') turnText.innerText = '용사 모집 중';
                    else if(st.raidResult === 'success') turnText.innerText = '보스 격파!';
                    else if(st.raidResult === 'fail') turnText.innerText = '도전 실패';
                    else turnText.innerText = '휴식 중';
                }
                if(qText) {
                    if(st.status === 'recruiting') qText.innerText = '레이드 대기중.';
                    else if(st.raidResult === 'success') qText.innerText = '✅ 보스 격파! 보상이 지급되었습니다.';
                    else if(st.raidResult === 'fail') qText.innerText = '☠️ 전투 종료! 보스가 쓰러지지 않았습니다.';
                    else qText.innerText = '전투가 종료되었습니다.';
                }
                renderRaidTimerUI();
                return;
            }

            // playing: 현재 턴 문제/보기 렌더링 + 현재 배우(차례) 표시
            const turn = st.currentTurn || 0;
            const q = (st.questions && st.questions[turn]) ? st.questions[turn] : null;
            const questionsLen = (st.questions && st.questions.length) ? st.questions.length : 0;
            const actorIndex = typeof st.currentActorIndex === 'number' ? st.currentActorIndex : 0;
            const participants = Array.isArray(st.participants) ? st.participants : [];
            const actor = participants[actorIndex] || null;
            const actorName = actor ? actor.name : '대기중';

            if(turnText) turnText.innerText = `${turn + 1}/${questionsLen}턴 · 차례: ${actorName}`;
            if(qText) qText.innerText = q ? q.q : '문제를 불러오는 중...';

            if(optGroup) optGroup.classList.remove('hidden');
            if(timerContainer) timerContainer.classList.remove('hidden');

            // 내 제출 이력 있으면 버튼 비활성화(중복 제출 방지) + 내 차례가 아니면 선택 불가
            const myId = window.playerState.id;
            const turnSubsAll = st.turnSubmissions || {};
            const myAns = (turnSubsAll[turn] || {})[myId];
            const isMyTurn = actor && String(actor.id) === String(myId);
            const shouldDisableOptions = isSpectator || myAns !== undefined || !isMyTurn;

            for(let j = 0; j < 4; j++) {
                const b = document.getElementById(`raidOption_${j}`);
                if(!b) continue;
                const optionText = q && q.options ? (q.options[j] || (j + 1)) : (j + 1);
                b.innerText = optionText;
                b.disabled = shouldDisableOptions;
                b.classList.toggle('opacity-50', b.disabled);
                b.classList.toggle('cursor-not-allowed', b.disabled);
            }

            renderRaidTimerUI();
        }

        // Firebase 초기화: 모듈 스크립트는 defer라 DOMContentLoaded 이후에도 실행될 수 있어 readyState로 분기
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            void initApp();
        }

