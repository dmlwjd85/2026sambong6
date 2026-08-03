/**
 * 초대 코드 → classId 해석(순수 함수).
 * classes.inviteCode 를 권위로 두고, inviteCodes 매핑은 검증된 경우에만 보조로 씁니다.
 *
 * @param {object} args
 * @param {string} args.code 대문자 초대 코드
 * @param {{ classId?: string, isActive?: boolean } | null} args.mapped inviteCodes 문서
 * @param {Array<{ id: string, inviteCode?: string, isActive?: boolean, displayName?: string }>} args.classHits
 *        inviteCode == code 로 조회된 classes 문서들
 * @param {{ inviteCode?: string, isActive?: boolean } | null} args.mappedClassMeta
 *        mapped.classId 의 classes 메타(없을 수 있음)
 * @returns {{ classId: string, displayName?: string } | { error: string }}
 */
export function resolveInviteCodeToClassId({ code, mapped, classHits, mappedClassMeta }) {
    const upper = String(code || '').trim().toUpperCase();
    if (!upper) return { error: 'empty' };

    const hits = Array.isArray(classHits) ? classHits : [];
    const activeHits = hits.filter((d) => d && d.isActive !== false);

    if (activeHits.length === 1) {
        return { classId: String(activeHits[0].id), displayName: activeHits[0].displayName };
    }
    if (activeHits.length > 1) {
        // 동일 초대 코드를 여러 학급이 주장하면 임의 선택하지 않음(하이재킹/충돌 방지)
        return { error: 'invite_conflict' };
    }
    if (hits.length >= 1 && hits.every((d) => d && d.isActive === false)) {
        return { error: 'class_archived' };
    }

    // 매핑 테이블: 대상 학급의 inviteCode 가 코드와 일치할 때만 신뢰
    const mappedId = mapped && mapped.classId != null ? String(mapped.classId).trim() : '';
    if (mappedId && mappedClassMeta) {
        if (String(mappedClassMeta.inviteCode || '').toUpperCase() !== upper) {
            return { error: 'invite_not_found' };
        }
        if (mappedClassMeta.isActive === false) {
            return { error: 'class_archived' };
        }
        // mapped.isActive 단독 false 는 신뢰하지 않음(익명 인증 사용자의 오염 방지)
        return { classId: mappedId, displayName: mappedClassMeta.displayName };
    }

    return { error: 'invite_not_found' };
}
