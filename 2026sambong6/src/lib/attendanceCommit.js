/**
 * 출석 칸과 경험치·봉을 한 트랜잭션에 적습니다.
 * set+merge 는 맵에서 뺀 키를 지우지 않으므로, 해제는 그 경로만 deleteField 합니다.
 */

import { deleteField, FieldPath, runTransaction } from 'firebase/firestore';
import { planAttendanceWrite, projectAttendanceDays } from './attendanceBlessing.js';

function serverDaysOf(snap) {
    if (!snap.exists()) return {};
    const data = snap.data() || {};
    return data.days && typeof data.days === 'object' ? data.days : {};
}

function serverStatusOf(days, today, studentId) {
    const marks = days && days[today];
    if (!marks || typeof marks !== 'object') return '';
    return String(marks[studentId] || '');
}

function rewardPayload(stu, xpDelta, bongDelta, attendanceMark) {
    const xp = Math.max(0, Math.floor((Number(stu && stu.xp) || 0) + Math.floor(xpDelta || 0)));
    const bong = Math.floor((Number(stu && stu.bong) || 0) + Number(bongDelta || 0));
    return { attendanceMark, xp, bong };
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {{ attRef: import('firebase/firestore').DocumentReference, stuRef: import('firebase/firestore').DocumentReference, today: string, studentId: string, requestedStatus: string, seenStatus: string }} args
 */
export async function commitAttendanceMark(db, { attRef, stuRef, today, studentId, requestedStatus, seenStatus }) {
    const todayYmd = String(today || '');
    const sid = String(studentId || '');
    if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(todayYmd)) {
        return { ok: false, reason: 'who' };
    }
    return runTransaction(db, async (tx) => {
        const attSnap = await tx.get(attRef);
        const stuSnap = await tx.get(stuRef);
        const serverDays = serverDaysOf(attSnap);
        const serverStatus = serverStatusOf(serverDays, todayYmd, sid);
        const plan = planAttendanceWrite({
            serverStatus,
            requestedStatus,
            seenStatus,
            today: todayYmd,
        });
        const days = projectAttendanceDays(serverDays, todayYmd, sid, plan);
        const stu = stuSnap.exists() ? (stuSnap.data() || {}) : {};
        if (!plan.ok) return { ok: false, reason: plan.reason, days, stu };
        if (plan.noop) return { ok: true, noop: true, plan, days, stu, payload: null };
        const payload = rewardPayload(stu, plan.xpDelta, plan.bongDelta, plan.attendanceMark);
        tx.set(stuRef, payload, { merge: true });
        if (plan.clearCell) {
            // merge 로 days 전체를 다시 쓰면 지운 학생 키가 서버에 남습니다.
            tx.update(attRef, new FieldPath('days', todayYmd, sid), deleteField());
        } else {
            tx.set(attRef, { days: { [todayYmd]: { [sid]: plan.status } } }, { merge: true });
        }
        return { ok: true, noop: false, plan, days, stu, payload };
    });
}
