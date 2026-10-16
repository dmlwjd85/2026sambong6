/**
 * 학습 온도계 정산이 어느 맵의 값을 쓸지 고릅니다.
 * 표(votes)가 하나라도 있으면 표만 봅니다. 없는 학생은 0이고, 0으로 지운 표를 옛 값으로 되돌리지 않습니다.
 * 표도 없고 부모 문서의 values도 없을 때만, allowLegacy 일 때 예전 settings/global 값을 봅니다.
 */
export function thermometerValueSource({ voteValues, parentValues, legacyValues, allowLegacy } = {}) {
    const votes = voteValues && typeof voteValues === 'object' ? voteValues : {};
    if (Object.keys(votes).length > 0) return { kind: 'votes', values: votes };
    const parent = parentValues && typeof parentValues === 'object' ? parentValues : null;
    if (parent && Object.keys(parent).length > 0) return { kind: 'parent', values: parent };
    const legacy = legacyValues && typeof legacyValues === 'object' ? legacyValues : null;
    if (allowLegacy && legacy && Object.keys(legacy).length > 0) return { kind: 'legacy', values: legacy };
    return { kind: 'empty', values: {} };
}

/**
 * 부모 문서가 생긴 뒤에도 옛 값을 볼 수 있는 경우.
 * - 부모 문서가 아직 없음
 * - 잠금만 커밋되고(running) 표는 아직 없음
 * 이미 done 인 기록은 다시 열지 않습니다. 경험치를 넣은 뒤 완료 기록만 실패한 날을 두 번 지급하지 않기 위해서입니다.
 */
export function allowLegacyThermometerValues({ parentExists, settlementStatus } = {}) {
    if (!parentExists) return true;
    return settlementStatus === 'running';
}
