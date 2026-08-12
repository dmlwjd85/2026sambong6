/**
 * 기존 충남초 데모 학급의 worldSettings를 충남월드 브랜딩으로 갱신
 */
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  limit,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyAsih-sfnIZ_gX_1l7SAVZHCAhk3KzmiP8',
  authDomain: 'sambong-world-2026.firebaseapp.com',
  projectId: 'sambong-world-2026',
  storageBucket: 'sambong-world-2026.firebasestorage.app',
  messagingSenderId: '728320769100',
  appId: '1:728320769100:web:7510c9a77cca6b87a788e9',
};

const WORLD_PATCH = {
  worldName: '충남월드',
  worldNameEn: 'CHUNGNAM WORLD',
  footerCredit: '충남월드 · 데모 선생님',
  seasonTheme: '충남초 모험',
  pirateIslandLabel: '충남 분교',
  bankLabel: '충남 은행',
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInAnonymously(auth);
  if (auth.currentUser) await auth.currentUser.getIdToken();

  const found = [];
  const q = query(
    collection(db, 'classes'),
    where('schoolName', '==', '충남초등학교'),
    limit(20)
  );
  const snap = await getDocs(q);
  snap.forEach((d) => found.push({ id: d.id, ...d.data() }));

  // 학교명 인덱스가 없으면 purpose / displayName 으로 보조 검색
  if (found.length === 0) {
    const all = await getDocs(query(collection(db, 'classes'), limit(80)));
    all.forEach((d) => {
      const data = d.data() || {};
      const hit =
        data.schoolName === '충남초등학교' ||
        data.purpose === 'competition_demo' ||
        String(data.displayName || '').includes('충남');
      if (hit) found.push({ id: d.id, ...data });
    });
  }

  if (found.length === 0) {
    console.error('충남초 학급을 찾지 못했습니다.');
    process.exit(1);
  }

  const results = [];
  for (const c of found) {
    const classId = c.id || c.classId;
    const settingsRef = doc(db, 'artifacts', classId, 'public', 'data', 'settings', 'global');
    const settingsSnap = await getDoc(settingsRef);
    const prev = settingsSnap.exists() ? settingsSnap.data() : {};
    const prevWs = prev.worldSettings && typeof prev.worldSettings === 'object' ? prev.worldSettings : {};
    const nextWs = { ...prevWs, ...WORLD_PATCH };
    await setDoc(settingsRef, { worldSettings: nextWs }, { merge: true });
    results.push({
      classId,
      displayName: c.displayName,
      inviteCode: c.inviteCode,
      worldName: nextWs.worldName,
      pirateIslandLabel: nextWs.pirateIslandLabel,
      bankLabel: nextWs.bankLabel,
    });
  }

  console.log(JSON.stringify({ updated: results.length, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
