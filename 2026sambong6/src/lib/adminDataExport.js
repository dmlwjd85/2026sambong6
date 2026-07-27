/**
 * 마스터 탭 — 학생 데이터 선택 엑셀(XLSX) 내보내기
 * SheetJS(xlsx)로 워크북을 만들고 브라우저에서 다운로드합니다.
 */
import * as XLSX from 'xlsx';

/** 시트 선택 옵션 (UI 체크박스와 동일 id) */
export const ADMIN_EXPORT_SHEET_OPTIONS = [
    { id: 'summary', label: '학생 요약 (XP·봉·레벨·직업 수)', defaultOn: true },
    { id: 'questHistory', label: '퀘스트 완료 기록', defaultOn: true },
    { id: 'xpLog', label: '경험치 변동 상세 기록', defaultOn: true },
    { id: 'xpDaily', label: '경험치 일별 집계 (그래프용)', defaultOn: true },
    { id: 'bongLog', label: '봉 변동 상세 기록', defaultOn: true },
    { id: 'bongDaily', label: '봉 일별 집계 (그래프용)', defaultOn: true },
    { id: 'jobs', label: '직업', defaultOn: true },
    { id: 'inventory', label: '인벤토리·스킨·장착', defaultOn: true },
    { id: 'purchases', label: '구매 기록 (편의점·학급활동·환불)', defaultOn: true },
    { id: 'bank', label: '은행·예금·적금', defaultOn: false },
    { id: 'questStatus', label: '오늘 일일 퀘스트 완료 현황', defaultOn: false },
    { id: 'dragonBalls', label: '드래곤볼 보관함', defaultOn: false },
    { id: 'lottoBets', label: '로또·승부예측', defaultOn: false },
];

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toLocalYmd(input) {
    if (input == null || input === '') return '';
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toLocalDateTime(input) {
    if (input == null || input === '') return '';
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '';
    return `${toLocalYmd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function safeSheetName(name) {
    const cleaned = String(name || 'Sheet').replace(/[\\/?*\[\]:]/g, ' ').trim() || 'Sheet';
    return cleaned.slice(0, 31);
}

function aoaToSheet(rows) {
    return XLSX.utils.aoa_to_sheet(rows.length ? rows : [['(데이터 없음)']]);
}

function appendSheet(wb, name, rows) {
    XLSX.utils.book_append_sheet(wb, aoaToSheet(rows), safeSheetName(name));
}

function studentName(ctx, sid) {
    return (ctx.getStudentName && ctx.getStudentName(sid)) || String(sid);
}

function listStudents(ctx) {
    const ids = typeof ctx.getActiveStudentIds === 'function'
        ? ctx.getActiveStudentIds()
        : [];
    const byId = new Map((ctx.students || []).map((s) => [String(s.id), s]));
    return ids.map((id) => {
        const sid = String(id);
        return byId.get(sid) || { id: sid };
    });
}

function resolveQuestName(ctx, qId, fallback) {
    const catalog = typeof ctx.getQuestCatalog === 'function' ? ctx.getQuestCatalog() : [];
    const found = catalog.find((q) => String(q.id) === String(qId));
    return (found && found.name) || fallback || String(qId || '');
}

function resolveItemName(ctx, itemId) {
    const id = String(itemId || '');
    if (!id) return '';
    const shop = typeof ctx.getShopCatalog === 'function' ? ctx.getShopCatalog() : [];
    const shopHit = shop.find((x) => String(x.id) === id);
    if (shopHit) return shopHit.name || id;
    const weapons = ctx.weaponData || [];
    const wp = weapons.find((x) => String(x.id) === id);
    if (wp) return wp.name || id;
    const skins = ctx.skinData || [];
    const sk = skins.find((x) => String(x.id) === id);
    if (sk) return sk.name || id;
    return id;
}

function jobNamesOf(stu, ctx) {
    const jobs = Array.isArray(stu.jobs) ? stu.jobs : [];
    return jobs.map((j) => {
        if (typeof ctx.getStudentJobName === 'function') return ctx.getStudentJobName(j);
        if (!j) return '';
        if (typeof j === 'string') return j;
        return String(j.name || '');
    }).filter(Boolean);
}

function buildSummaryRows(ctx) {
    const rows = [['학번', '이름', '레벨', 'XP', '지갑(B)', '일반예금(B)', '적금원금합(B)', '직업', '직업수', '퀘스트완료건수', '보유무기수', '보유스킨수', '드래곤볼수']];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const xp = Math.max(0, Math.floor(Number(stu.xp) || 0));
        const level = typeof ctx.calculateExactLevel === 'function' ? ctx.calculateExactLevel(xp) : '';
        const jobs = jobNamesOf(stu, ctx);
        const terms = Array.isArray(stu.bankTermDeposits) ? stu.bankTermDeposits : [];
        const termSum = terms.reduce((s, t) => s + (Number(t && t.amount) || 0), 0);
        const inv = Array.isArray(stu.inventory) ? stu.inventory : [];
        const skins = stu.ownedSkins && typeof stu.ownedSkins === 'object' ? Object.keys(stu.ownedSkins).filter((k) => stu.ownedSkins[k]) : [];
        const balls = Array.isArray(stu.dragonBalls) ? stu.dragonBalls : [];
        const qh = Array.isArray(stu.questHistory) ? stu.questHistory : [];
        rows.push([
            sid,
            studentName(ctx, sid),
            level,
            xp,
            Number(stu.bong) || 0,
            Number(stu.bankRegularSavings) || 0,
            termSum,
            jobs.join(', '),
            jobs.length,
            qh.length,
            inv.length,
            skins.length,
            balls.length,
        ]);
    });
    return rows;
}

function buildQuestHistoryRows(ctx) {
    const rows = [['학번', '이름', '날짜', '시각', '퀘스트ID', '퀘스트명', '획득XP', '획득B']];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const name = studentName(ctx, sid);
        const history = Array.isArray(stu.questHistory) ? stu.questHistory : [];
        history.forEach((h) => {
            if (!h) return;
            rows.push([
                sid,
                name,
                h.date || toLocalYmd(h.timestamp),
                h.timestamp ? toLocalDateTime(h.timestamp) : '',
                h.id || '',
                h.name || resolveQuestName(ctx, h.id, ''),
                Number(h.xp) || 0,
                Number(h.bong) || 0,
            ]);
        });
    });
    return rows;
}

function buildChangeLogRows(ctx, field, extraKeys = []) {
    const rows = [['학번', '이름', '날짜', '시각', '사유', '변동', '이전', '이후', ...extraKeys]];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const name = studentName(ctx, sid);
        const logs = Array.isArray(stu[field]) ? stu[field] : [];
        logs.forEach((log) => {
            if (!log) return;
            rows.push([
                sid,
                name,
                toLocalYmd(log.at),
                toLocalDateTime(log.at),
                log.reason || '',
                Number(log.delta) || 0,
                Number(log.before) || 0,
                Number(log.after) || 0,
                ...extraKeys.map((key) => (log[key] != null ? String(log[key]) : '')),
            ]);
        });
    });
    return rows;
}

function buildXpLogRows(ctx) {
    return buildChangeLogRows(ctx, 'xpChangeLog', ['source']);
}

function buildBongLogRows(ctx) {
    return buildChangeLogRows(ctx, 'bongChangeLog', ['source', 'kind']);
}

/** 일별 집계 — 엑셀에서 그래프로 쓰기 쉬운 형태 */
function buildDailyAggregateRows(ctx, field, valueLabel) {
    const perStudent = [['학번', '이름', '날짜', `${valueLabel} 획득합`, `${valueLabel} 차감합`, `${valueLabel} 순증감`, '기록건수', '일말값(추정)']];
    const classMap = new Map(); // date -> { gain, loss, net, count }

    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const name = studentName(ctx, sid);
        const logs = Array.isArray(stu[field]) ? stu[field] : [];
        const byDate = new Map();
        logs.forEach((log) => {
            if (!log) return;
            const day = toLocalYmd(log.at);
            if (!day) return;
            const delta = Number(log.delta) || 0;
            if (!byDate.has(day)) byDate.set(day, { gain: 0, loss: 0, net: 0, count: 0, lastAfter: null });
            const row = byDate.get(day);
            if (delta > 0) row.gain += delta;
            else if (delta < 0) row.loss += Math.abs(delta);
            row.net += delta;
            row.count += 1;
            if (log.after != null) row.lastAfter = Number(log.after) || 0;
        });
        [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([day, row]) => {
            perStudent.push([sid, name, day, row.gain, row.loss, row.net, row.count, row.lastAfter != null ? row.lastAfter : '']);
            if (!classMap.has(day)) classMap.set(day, { gain: 0, loss: 0, net: 0, count: 0 });
            const c = classMap.get(day);
            c.gain += row.gain;
            c.loss += row.loss;
            c.net += row.net;
            c.count += row.count;
        });
    });

    const classRows = [['날짜', `학급 ${valueLabel} 획득합`, `학급 ${valueLabel} 차감합`, `학급 ${valueLabel} 순증감`, '기록건수']];
    [...classMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([day, row]) => {
        classRows.push([day, row.gain, row.loss, row.net, row.count]);
    });

    return { perStudent, classRows };
}

function buildJobsRows(ctx) {
    const rows = [['학번', '이름', '직업명', '주급(B)', '설명']];
    const catalog = typeof ctx.getJobCatalog === 'function' ? ctx.getJobCatalog() : [];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const name = studentName(ctx, sid);
        const jobs = Array.isArray(stu.jobs) ? stu.jobs : [];
        if (!jobs.length) {
            rows.push([sid, name, '(없음)', '', '']);
            return;
        }
        jobs.forEach((job) => {
            const jobName = typeof ctx.getStudentJobName === 'function' ? ctx.getStudentJobName(job) : (job && job.name) || String(job || '');
            const info = catalog.find((j) => j.name === jobName || (job && job.icon && j.icon === job.icon));
            rows.push([
                sid,
                name,
                jobName,
                info ? info.pay : (job && job.pay != null ? job.pay : ''),
                info ? (info.desc || info.sub || '') : (job && (job.desc || job.sub) || ''),
            ]);
        });
    });
    return rows;
}

function buildInventoryRows(ctx) {
    const rows = [['학번', '이름', '구분', '아이템ID', '아이템명', '비고']];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const name = studentName(ctx, sid);
        const inv = Array.isArray(stu.inventory) ? stu.inventory : [];
        inv.forEach((itemId) => {
            rows.push([sid, name, '무기/인벤토리', itemId, resolveItemName(ctx, itemId), stu.equippedWeapon === itemId ? '장착중' : '']);
        });
        if (stu.equippedWeapon && !inv.includes(stu.equippedWeapon)) {
            rows.push([sid, name, '장착무기', stu.equippedWeapon, resolveItemName(ctx, stu.equippedWeapon), '장착중']);
        }
        const owned = stu.ownedSkins && typeof stu.ownedSkins === 'object' ? stu.ownedSkins : {};
        Object.keys(owned).forEach((skinId) => {
            if (!owned[skinId]) return;
            const equipped = stu.equippedSkins && stu.equippedSkins[skinId] ? '장착중' : '';
            rows.push([sid, name, '스킨', skinId, resolveItemName(ctx, skinId), equipped]);
        });
        if (stu.hasShield) {
            rows.push([sid, name, '방패', 'shield', '방패', `HP ${stu.shieldHP != null ? stu.shieldHP : ''}`]);
        }
    });
    return rows;
}

function buildPurchaseRows(ctx) {
    const rows = [['학번', '이름', '구분', '날짜', '시각', '항목', '금액(B)', '상세']];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const name = studentName(ctx, sid);
        (Array.isArray(stu.conveniencePurchases) ? stu.conveniencePurchases : []).forEach((p) => {
            rows.push([
                sid,
                name,
                '편의점',
                toLocalYmd(p.at),
                toLocalDateTime(p.at),
                p.name || '',
                Number(p.price) || 0,
                [
                    p.status ? `상태:${p.status}` : '',
                    p.deliveryRequested ? `배달(+${p.deliveryFee || 0}B)` : '',
                    p.requestNote ? `요청:${p.requestNote}` : '',
                ].filter(Boolean).join(' · '),
            ]);
        });
        (Array.isArray(stu.classEventPurchases) ? stu.classEventPurchases : []).forEach((p) => {
            rows.push([
                sid,
                name,
                '학급활동/상점',
                toLocalYmd(p.at),
                toLocalDateTime(p.at),
                p.name || p.id || '',
                Number(p.price) || 0,
                p.songTitle ? `신청곡:${p.songTitle}` : '',
            ]);
        });
        (Array.isArray(stu.itemRefundLedger) ? stu.itemRefundLedger : []).forEach((p) => {
            rows.push([
                sid,
                name,
                '환불',
                toLocalYmd(p.at),
                toLocalDateTime(p.at),
                resolveItemName(ctx, p.itemId) || p.itemId || '',
                Number(p.amount != null ? p.amount : p.refundB) || 0,
                p.kind || p.label || '',
            ]);
        });
    });
    return rows;
}

function buildBankRows(ctx) {
    const rows = [['학번', '이름', '지갑(B)', '일반예금(B)', '적금건수', '적금원금합(B)', '주기보너스최근일', '적금상세']];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const terms = Array.isArray(stu.bankTermDeposits) ? stu.bankTermDeposits : [];
        const termSum = terms.reduce((s, t) => s + (Number(t && t.amount) || 0), 0);
        const detail = terms.map((t, i) => `#${i + 1} ${Number(t.amount) || 0}B(${t.startDate || '?'})`).join(' / ');
        rows.push([
            sid,
            studentName(ctx, sid),
            Number(stu.bong) || 0,
            Number(stu.bankRegularSavings) || 0,
            terms.length,
            termSum,
            stu.bankDailyBonusLastDate || '',
            detail,
        ]);
    });
    return rows;
}

function buildQuestStatusRows(ctx) {
    const daily = (typeof ctx.getQuestCatalog === 'function' ? ctx.getQuestCatalog() : []).filter((q) => q.type === 'daily');
    const today = typeof ctx.getLocalDateStr === 'function' ? ctx.getLocalDateStr() : toLocalYmd(new Date());
    const header = ['학번', '이름', '완료수', '전체', '전부완료', ...daily.map((q) => q.name)];
    const rows = [header];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const history = Array.isArray(stu.questHistory) ? stu.questHistory : [];
        const doneIds = new Set(
            history.filter((h) => h && h.date === today).map((h) => String(h.id))
        );
        const flags = daily.map((q) => (doneIds.has(String(q.id)) ? 'O' : ''));
        const done = flags.filter(Boolean).length;
        rows.push([
            sid,
            studentName(ctx, sid),
            done,
            daily.length,
            daily.length > 0 && done === daily.length ? 'Y' : '',
            ...flags,
        ]);
    });
    return rows;
}

function buildDragonBallRows(ctx) {
    const rows = [['학번', '이름', '성구목록', '개수', '주말키']];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const balls = Array.isArray(stu.dragonBalls) ? stu.dragonBalls : [];
        rows.push([sid, studentName(ctx, sid), balls.join(', '), balls.length, stu.dragonBallWeekendKey || '']);
    });
    return rows;
}

function buildLottoBetRows(ctx) {
    const rows = [['학번', '이름', '구분', '회차/시장', '선택', '금액(B)', '시각', '결과']];
    listStudents(ctx).forEach((stu) => {
        const sid = String(stu.id);
        const name = studentName(ctx, sid);
        (Array.isArray(stu.lottoTickets) ? stu.lottoTickets : []).forEach((t) => {
            rows.push([
                sid,
                name,
                '로또',
                t.roundKey || '',
                Array.isArray(t.numbers) ? t.numbers.join(',') : (t.numbers || ''),
                Number(t.price) || 0,
                toLocalDateTime(t.at),
                t.result || t.matched || '',
            ]);
        });
        (Array.isArray(stu.worldCupBets) ? stu.worldCupBets : []).forEach((t) => {
            rows.push([
                sid,
                name,
                '승부예측',
                t.market || '',
                t.pick || t.label || '',
                Number(t.stake) || Number(t.amount) || 0,
                toLocalDateTime(t.at),
                t.payout != null ? `배당지급 ${t.payout}` : (t.settled ? '정산됨' : ''),
            ]);
        });
    });
    return rows;
}

/**
 * 선택된 시트로 워크북을 만들어 다운로드합니다.
 * @param {object} opts
 * @param {string[]} opts.selectedIds
 * @param {object} opts.ctx — students, getActiveStudentIds, getStudentName, catalogs 등
 * @param {string} [opts.fileName]
 */
export function downloadAdminStudentWorkbook({ selectedIds, ctx, fileName }) {
    const selected = new Set((selectedIds || []).map(String));
    if (!selected.size) throw new Error('선택된 항목이 없습니다.');

    const wb = XLSX.utils.book_new();
    let sheetCount = 0;

    const add = (id, sheetName, rows) => {
        if (!selected.has(id)) return;
        appendSheet(wb, sheetName, rows);
        sheetCount += 1;
    };

    add('summary', '학생요약', buildSummaryRows(ctx));
    add('questHistory', '퀘스트완료기록', buildQuestHistoryRows(ctx));
    add('xpLog', '경험치변동기록', buildXpLogRows(ctx));
    if (selected.has('xpDaily')) {
        const xpAgg = buildDailyAggregateRows(ctx, 'xpChangeLog', 'XP');
        appendSheet(wb, '경험치_일별_학생', xpAgg.perStudent);
        appendSheet(wb, '경험치_일별_학급', xpAgg.classRows);
        sheetCount += 2;
    }
    add('bongLog', '봉변동기록', buildBongLogRows(ctx));
    if (selected.has('bongDaily')) {
        const bongAgg = buildDailyAggregateRows(ctx, 'bongChangeLog', '봉');
        appendSheet(wb, '봉_일별_학생', bongAgg.perStudent);
        appendSheet(wb, '봉_일별_학급', bongAgg.classRows);
        sheetCount += 2;
    }
    add('jobs', '직업', buildJobsRows(ctx));
    add('inventory', '인벤토리_스킨', buildInventoryRows(ctx));
    add('purchases', '구매기록', buildPurchaseRows(ctx));
    add('bank', '은행', buildBankRows(ctx));
    add('questStatus', '오늘퀘스트현황', buildQuestStatusRows(ctx));
    add('dragonBalls', '드래곤볼', buildDragonBallRows(ctx));
    add('lottoBets', '로또_승부예측', buildLottoBetRows(ctx));

    if (!sheetCount) throw new Error('내보낼 시트가 없습니다.');

    const stamp = toLocalYmd(new Date()).replace(/-/g, '');
    const outName = fileName || `삼봉월드_학생데이터_${stamp}.xlsx`;
    XLSX.writeFile(wb, outName);
    return { fileName: outName, sheetCount };
}
