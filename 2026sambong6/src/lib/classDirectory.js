/**
 * 학급 관리 목록: 열람·초기화·보관 권한과 표시용 정리.
 * 시드 마스터는 서버의 모든 학급을, 그 외 마스터는 최근·현재 학급만 다룹니다.
 */
import { SEED_MASTER_CLASS_ID, isSeedMasterViewer } from './classCreateRequest.js';

/** onclick·경로에 넣을 수 있는 학급 ID만 통과 */
export function safeManagedClassId(classId) {
    const id = String(classId || '').trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) return '';
    return id;
}

export function sanitizeClassDirectoryEntry(raw, classId) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const id = safeManagedClassId(classId || src.classId);
    const invite = String(src.inviteCode || '').trim().toUpperCase().slice(0, 12);
    const name = String(src.displayName || id).trim().slice(0, 40) || id;
    return {
        classId: id,
        displayName: name,
        inviteCode: invite,
        schoolName: String(src.schoolName || '').trim().slice(0, 40),
        schoolYear: Number(src.schoolYear) || 0,
        grade: Number(src.grade) || 0,
        homeroom: Number(src.homeroom) || 0,
        isActive: src.isActive !== false,
        isDemoSeed: !!src.isDemoSeed || id === SEED_MASTER_CLASS_ID,
        teacherName: String(src.teacherName || src.masterDisplayName || '').trim().slice(0, 20),
    };
}

export function classDirectoryStatusLabel(entry) {
    if (!entry || !entry.classId) return '';
    if (entry.isDemoSeed) return '시드';
    if (!entry.isActive) return '보관됨';
    return '운영 중';
}

/** 시드 마스터이거나, 지금 들어와 있는 그 반의 마스터일 때 초기화 가능 */
export function canResetManagedClass(viewer, currentClassId, targetClassId) {
    const target = safeManagedClassId(targetClassId);
    if (!target || !viewer || !viewer.isGM) return false;
    if (isSeedMasterViewer(viewer, currentClassId)) return true;
    return String(currentClassId || '') === target;
}

/** 시드 반은 보관 불가. 그 외는 초기화와 같은 권한 */
export function canArchiveManagedClass(viewer, currentClassId, targetClassId) {
    const target = safeManagedClassId(targetClassId);
    if (!target || target === SEED_MASTER_CLASS_ID) return false;
    return canResetManagedClass(viewer, currentClassId, target);
}

export function sortClassDirectory(entries, currentClassId) {
    const cur = String(currentClassId || '');
    const list = Array.isArray(entries) ? entries.filter((e) => e && e.classId) : [];
    return list.slice().sort((a, b) => {
        if (a.classId === cur && b.classId !== cur) return -1;
        if (b.classId === cur && a.classId !== cur) return 1;
        if (a.isDemoSeed && !b.isDemoSeed) return -1;
        if (b.isDemoSeed && !a.isDemoSeed) return 1;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return String(a.displayName).localeCompare(String(b.displayName), 'ko');
    });
}

/** 시험 학급 초기화 때 마스터 PIN을 새로 뽑아 학생이 그대로 못 들어오게 함 */
export function shouldRotateMasterPinOnReset(targetClassId) {
    return safeManagedClassId(targetClassId) !== SEED_MASTER_CLASS_ID;
}

export function mergeClassDirectory(serverEntries, recentEntries, currentEntry) {
    const map = new Map();
    const push = (raw, id) => {
        const row = sanitizeClassDirectoryEntry(raw, id);
        if (!row.classId) return;
        const prev = map.get(row.classId) || {};
        map.set(row.classId, { ...prev, ...row, classId: row.classId });
    };
    (Array.isArray(recentEntries) ? recentEntries : []).forEach((r) => push(r, r && r.classId));
    (Array.isArray(serverEntries) ? serverEntries : []).forEach((r) => push(r, r && r.classId));
    if (currentEntry) push(currentEntry, currentEntry.classId);
    return [...map.values()];
}
