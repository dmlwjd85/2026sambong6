/**
 * 보고서·대회용 데모 학급 생성
 * 충남초 6학년 1반 · 가명 학생 20명 · 마스터 PIN 설정
 */
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyAsih-sfnIZ_gX_1l7SAVZHCAhk3KzmiP8',
  authDomain: 'sambong-world-2026.firebaseapp.com',
  projectId: 'sambong-world-2026',
  storageBucket: 'sambong-world-2026.firebasestorage.app',
  messagingSenderId: '728320769100',
  appId: '1:728320769100:web:7510c9a77cca6b87a788e9',
};

const SITE_BASE = 'https://dmlwjd85.github.io/2026sambong6/';

/** 대회·보고서용 가명 20명 (실명 아님) */
const DEMO_ROSTER = [
  { id: '1', name: '김서준', gender: 'M' },
  { id: '2', name: '이하은', gender: 'F' },
  { id: '3', name: '박도윤', gender: 'M' },
  { id: '4', name: '최지우', gender: 'F' },
  { id: '5', name: '정하준', gender: 'M' },
  { id: '6', name: '강서연', gender: 'F' },
  { id: '7', name: '윤지호', gender: 'M' },
  { id: '8', name: '장예은', gender: 'F' },
  { id: '9', name: '임준서', gender: 'M' },
  { id: '10', name: '한소율', gender: 'F' },
  { id: '11', name: '오민재', gender: 'M' },
  { id: '12', name: '송채원', gender: 'F' },
  { id: '13', name: '배현우', gender: 'M' },
  { id: '14', name: '신유나', gender: 'F' },
  { id: '15', name: '권태민', gender: 'M' },
  { id: '16', name: '홍나윤', gender: 'F' },
  { id: '17', name: '문서현', gender: 'M' },
  { id: '18', name: '양지우', gender: 'F' },
  { id: '19', name: '조하린', gender: 'M' },
  { id: '20', name: '노은우', gender: 'F' },
].map((r) => ({ ...r, label: '', active: true }));

const MASTER_PIN = '0611'; // 6학년 1반 연상
const TEACHER_NAME = '데모 선생님';
const DISPLAY_NAME = '충남초 6학년 1반';
const SCHOOL_NAME = '충남초등학교';
const WORLD_NAME = '충남월드';
const WORLD_NAME_EN = 'CHUNGNAM WORLD';
const SCHOOL_YEAR = 2026;
const GRADE = 6;
const HOMEROOM = 1;

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function generateUniqueInviteCode(db) {
  for (let i = 0; i < 24; i++) {
    const code = generateInviteCode();
    const snap = await getDoc(doc(db, 'inviteCodes', code));
    if (!snap.exists()) return code;
  }
  throw new Error('invite_gen_failed');
}

function buildClassId(suffix) {
  const s = suffix || Math.random().toString(36).slice(2, 6);
  return `sambong-${SCHOOL_YEAR}-${GRADE}-${HOMEROOM}-${s}`;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await signInAnonymously(auth);
  if (auth.currentUser) await auth.currentUser.getIdToken();

  const inviteCode = await generateUniqueInviteCode(db);
  let classId = buildClassId('demo');
  for (let i = 0; i < 5; i++) {
    const existing = await getDoc(doc(db, 'classes', classId));
    if (!existing.exists()) break;
    classId = buildClassId(Math.random().toString(36).slice(2, 6));
  }

  const classMeta = {
    classId,
    displayName: DISPLAY_NAME,
    className: DISPLAY_NAME,
    schoolName: SCHOOL_NAME,
    schoolYear: SCHOOL_YEAR,
    grade: GRADE,
    homeroom: HOMEROOM,
    masterDisplayName: TEACHER_NAME,
    inviteCode,
    gmaEditStudentId: '1',
    isActive: true,
    isDemoSeed: false,
    purpose: 'competition_demo',
    roster: DEMO_ROSTER,
    staff: [
      {
        id: 'gm',
        name: TEACHER_NAME,
        gender: 'M',
        role: 'teacher',
        label: '담임교사',
        optionClass: 'text-sb-gold',
        emoji: '👑',
      },
      {
        id: 'gm_a',
        name: '보조 마스터',
        gender: 'F',
        role: 'co_teacher',
        label: '보조',
        optionClass: 'text-cyan-400',
        emoji: '🏴‍☠️',
      },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'classes', classId), classMeta, { merge: true });
  await setDoc(
    doc(db, 'inviteCodes', inviteCode),
    {
      classId,
      displayName: DISPLAY_NAME,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, 'artifacts', classId, 'public', 'data', 'settings', 'global'),
    {
      raidPassword: 'demo',
      raidPasswordNeedsSetup: false,
      shieldStock: 5,
      weekendRaidRewardXp: 100,
      weekendRaidRewardBong: 20,
      applyDefaultTemplatePending: true,
      worldSettings: {
        worldName: WORLD_NAME,
        worldNameEn: WORLD_NAME_EN,
        navBadge: 'S1',
        seasonNumber: 1,
        seasonLabel: '시즌 1',
        seasonTheme: '충남초 모험',
        academicYear: SCHOOL_YEAR,
        footerCredit: `${WORLD_NAME} · ${TEACHER_NAME}`,
        announcement: '보고서·대회 시연용 데모 학급입니다. (가명 학생 20명)',
        pirateIslandLabel: '충남 분교',
        bankLabel: '충남 은행',
      },
    },
    { merge: true }
  );

  await setDoc(
    doc(db, 'artifacts', classId, 'public', 'data', 'students', 'student_gm'),
    {
      pin: MASTER_PIN,
      xp: 0,
      bong: 0,
      quests: {},
      unlockedQuests: {},
      jobs: [],
      inventory: [],
      questHistory: [],
    },
    { merge: true }
  );

  // 시연용: 학생 문서에 약간의 XP·봉 시드 (가독성)
  const seedXp = [120, 95, 210, 80, 150, 175, 60, 130, 200, 110, 90, 160, 140, 70, 185, 100, 125, 155, 85, 145];
  const seedBong = [18, 12, 25, 8, 20, 22, 6, 15, 28, 14, 10, 19, 16, 7, 24, 11, 13, 17, 9, 21];
  for (const r of DEMO_ROSTER) {
    const i = Number(r.id) - 1;
    await setDoc(
      doc(db, 'artifacts', classId, 'public', 'data', 'students', `student_${r.id}`),
      {
        pin: '', // 첫 접속 시 학생이 PIN 설정
        xp: seedXp[i] || 100,
        bong: seedBong[i] || 10,
        quests: {},
        unlockedQuests: {},
        jobs: [],
        inventory: [],
        questHistory: [],
      },
      { merge: true }
    );
  }

  const shareUrl = `${SITE_BASE}?c=${inviteCode}`;
  const result = {
    displayName: DISPLAY_NAME,
    schoolName: SCHOOL_NAME,
    classId,
    inviteCode,
    shareUrl,
    masterAccountId: 'gm',
    masterAccountLabel: TEACHER_NAME,
    masterPin: MASTER_PIN,
    studentCount: DEMO_ROSTER.length,
    rosterNames: DEMO_ROSTER.map((r) => `${r.id}. ${r.name}`),
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
