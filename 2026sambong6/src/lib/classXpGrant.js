/**
 * 수업 종료 경험치를 한 번 주는 흐름이에요. 화면(sambongWorld.js)은 저장·시계·토스트만 넘겨주고,
 * 순서와 재시도 규칙은 여기서 정해요. 그래서 단위 테스트로 그대로 확인할 수 있어요.
 *
 * 규칙
 * - 서버를 미리 읽지 않아요. 화면 데이터(학생 목록 리스너, autoXp 리스너)만 봐요.
 * - 학생 묶음과 autoXp 공지 문서를 한 번의 저장(commit 1번)으로 같이 써요.
 *   autoXp 규칙은 같은 종을 두 번 쓰면 거절해서(40분 간격), 다른 기기가 이미 준 종은 서버가 통째로 막아 줘요.
 * - '이 기기에서 줬음' 표시는 저장이 끝난 뒤에만 남겨요(성공, 또는 건너뛰기로 확정했을 때).
 * - 409(aborted): 잠깐 기다렸다가 최대 2번 더 보내요.
 * - 403(denied): 서버 시각을 확인해 시계 차이를 기억하고, 서버 기준으로 종이 지난 뒤 딱 한 번만 다시 보내요.
 * - 429(quota): 더 보내지 않고 그 종은 건너뛰어요.
 */
import {
    CLASS_XP_FIRE_DELAY_MS,
    CLASS_XP_MAX_WAIT_MS,
    classXpCatchupSlot,
    classXpChunks,
    classXpErrorKind,
    classXpTargets,
} from './classXpSlot.js';

/** 409일 때 더 보내는 최대 횟수 */
export const CLASS_XP_ABORT_RETRIES = 2;
/** 403일 때 다시 보내는 최대 횟수 */
export const CLASS_XP_DENIED_RETRIES = 1;
/** 시계 차이로 보지 않는 작은 오차(ms). Date 헤더는 초 단위라서 넉넉히 둬요. */
export const CLASS_XP_SKEW_IGNORE_MS = 2000;
/** 403 뒤 서버 시각을 모를 때 기다리는 시간 */
export const CLASS_XP_DENIED_FALLBACK_WAIT_MS = 40 * 1000;
/** 403 뒤 서버도 이미 같은 종이면 리스너가 따라올 때까지 잠깐 기다려요(다른 기기가 먼저 준 경우). */
export const CLASS_XP_DENIED_SETTLE_MS = 3000;

/** 409 뒤 기다리는 시간: 0.8초, 1.6초에 조금씩 흔들어요(여러 기기가 같이 다시 보내지 않게). */
export function classXpAbortBackoffMs(attempt, random = Math.random) {
    const base = 800 * Math.max(1, attempt);
    return base + Math.floor(Math.max(0, Math.min(1, random())) * 400);
}

/**
 * HTTP Date 헤더로 기기 시계가 서버보다 얼마나 빠른지(ms) 추정해요. 모르면 null이에요.
 * sentMs·receivedMs는 기기 시계예요. Date 헤더는 초 단위라 0.5초를 더해 가운데로 잡아요.
 */
export function classXpSkewFromDateHeader(dateHeader, sentMs, receivedMs) {
    const serverMs = Date.parse(String(dateHeader || ''));
    if (!Number.isFinite(serverMs) || !Number.isFinite(sentMs) || !Number.isFinite(receivedMs)) return null;
    const deviceMid = sentMs + Math.max(0, receivedMs - sentMs) / 2;
    const skew = Math.round(deviceMid - (serverMs + 500));
    return Math.abs(skew) < CLASS_XP_SKEW_IGNORE_MS ? 0 : skew;
}

/** 저장소에 남긴 시계 차이를 읽어요. 12시간이 지났거나 형식이 틀리면 0이에요. */
export function classXpStoredSkew(raw, nowMs, maxAgeMs = 12 * 60 * 60 * 1000) {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!data || !Number.isFinite(data.skew) || !Number.isFinite(data.at)) return 0;
        if (!Number.isFinite(nowMs) || nowMs - data.at > maxAgeMs || data.at - nowMs > maxAgeMs) return 0;
        return data.skew;
    } catch (_) {
        return 0;
    }
}

/**
 * 403 뒤 다시 보내기까지 기다릴 시간(ms).
 * 서버 시각으로 아직 그 종(+20초)이 안 됐으면 그때까지, 이미 지났으면 잠깐만 기다려요.
 */
export function classXpDeniedWaitMs(slotMs, serverNowMs, delayMs = CLASS_XP_FIRE_DELAY_MS) {
    if (!Number.isFinite(serverNowMs)) return CLASS_XP_DENIED_FALLBACK_WAIT_MS;
    const until = slotMs + delayMs - serverNowMs;
    if (until <= 0) return CLASS_XP_DENIED_SETTLE_MS;
    return Math.min(CLASS_XP_MAX_WAIT_MS, Math.max(CLASS_XP_DENIED_SETTLE_MS, until));
}

/**
 * 한 번 실행해요. deps:
 * - now(): 서버 기준으로 고친 지금 시각(ms) = 기기 시각 - 시계 차이
 * - students(): 화면의 학생 목록
 * - lastAutoXpKey(): 화면의 autoXp 리스너 값(다른 기기가 이미 준 종이면 같은 키)
 * - isGiven(key) / markGiven(key): 이 기기 표시
 * - isPaused(ymd), skipStudent(stu)
 * - commit(slot, ids, withAutoXp): 묶음 저장 1번(Promise)
 * - measureSkew(): 기기 시계 - 서버 시계(ms) 또는 null (Firestore 읽기 아님)
 * - setSkew(ms), sleep(ms), notify(kind, slot, invalidIds), random()
 * 돌려주는 값: { status, slotKey, granted, commits, kinds }
 */
export async function runClassXpGrant(deps) {
    const result = { status: 'idle', slotKey: '', granted: 0, commits: 0, kinds: [] };
    let deniedLeft = CLASS_XP_DENIED_RETRIES;
    let retryingFor = null;

    for (;;) {
        const nowMs = deps.now();
        const slot = classXpCatchupSlot(new Date(nowMs));
        if (!slot || nowMs - slot.slotMs < CLASS_XP_FIRE_DELAY_MS || deps.isPaused(slot.ymd)) {
            if (retryingFor) {
                // 다시 보내려고 기다리는 사이 그 종이 사라졌어요(예: 자정을 넘김). 그 종은 거절로 마무리해요.
                deps.markGiven(retryingFor.key);
                deps.notify('denied', retryingFor, []);
                result.status = 'denied';
                result.slotKey = retryingFor.key;
            }
            return result;
        }
        result.slotKey = slot.key;
        if (deps.isGiven(slot.key)) {
            result.status = retryingFor ? result.status : 'given-here';
            return result;
        }
        if (String(deps.lastAutoXpKey() || '') === slot.key) {
            // 다른 기기(또는 다른 탭)가 이미 줬어요. 서버에 보내지 않아요.
            deps.markGiven(slot.key);
            result.status = 'given-elsewhere';
            return result;
        }
        const { pending, invalidXp } = classXpTargets(deps.students(), slot.key, deps.skipStudent);
        if (!pending.length) {
            deps.markGiven(slot.key);
            if (invalidXp.length) deps.notify('xp', slot, invalidXp);
            result.status = 'nothing';
            return result;
        }

        let deniedHere = false;
        let failKind = '';
        const chunks = classXpChunks(pending);
        for (let i = 0; i < chunks.length; i += 1) {
            let abortedLeft = CLASS_XP_ABORT_RETRIES;
            for (;;) {
                try {
                    result.commits += 1;
                    await deps.commit(slot, chunks[i], i === 0);
                    result.granted += chunks[i].length;
                    break;
                } catch (e) {
                    const kind = classXpErrorKind(e);
                    result.kinds.push(kind);
                    if (kind === 'aborted' && abortedLeft > 0) {
                        const attempt = CLASS_XP_ABORT_RETRIES - abortedLeft + 1;
                        abortedLeft -= 1;
                        await deps.sleep(classXpAbortBackoffMs(attempt, deps.random || Math.random));
                        continue;
                    }
                    if (kind === 'denied' && deniedLeft > 0 && i === 0) {
                        deniedHere = true;
                    } else {
                        failKind = kind;
                    }
                    break;
                }
            }
            if (deniedHere || failKind) break;
        }

        if (deniedHere) {
            // 표시는 아직 남기지 않았어요. 서버 시각을 보고 한 번만 다시 시도해요.
            deniedLeft -= 1;
            retryingFor = slot;
            const skew = await deps.measureSkew();
            if (Number.isFinite(skew)) deps.setSkew(skew);
            const serverNowMs = Number.isFinite(skew) ? deps.now() : NaN;
            await deps.sleep(classXpDeniedWaitMs(slot.slotMs, serverNowMs));
            continue;
        }

        deps.markGiven(slot.key);
        if (failKind) {
            deps.notify(failKind === 'aborted' ? 'other' : failKind, slot, []);
            result.status = failKind;
            return result;
        }
        if (invalidXp.length) deps.notify('xp', slot, invalidXp);
        result.status = 'granted';
        return result;
    }
}
