/**
 * 학급 경제활동 리포트
 * 학생 문서(지갑·예금·적금·대출·지수투자·구매 기록·봉 변동 기록)를 모아
 * 학생별 저축·소비·투자 지표와 선생님 관찰 문구를 만듭니다.
 * 엑셀 시트(2차원 배열)로 내보내기 쉬운 형태만 돌려주고, 파일 쓰기는 하지 않습니다.
 */
import { sanitizeStockInvestments } from './stockMarket.js';

/** 봉 변동 기록 분류 */
export const ECONOMY_CATEGORIES = Object.freeze([
    { id: 'income', label: '소득(퀘스트·보상·급여)' },
    { id: 'spending', label: '소비(상점·구매)' },
    { id: 'saving', label: '저축(예금·적금)' },
    { id: 'investing', label: '투자(지수·부동산)' },
    { id: 'loan', label: '대출' },
    { id: 'transfer', label: '이체' },
    { id: 'refund', label: '환불' },
    { id: 'other', label: '기타' },
]);

/**
 * 앱 기능 ↔ 경제교육 학습 목표.
 * 성취기준 코드는 학교·교육과정 판에 따라 다르므로 비워 두고, 선생님이 엑셀에서 채웁니다.
 */
export const ECONOMY_LEARNING_GOALS = Object.freeze([
    {
        feature: '직업·퀘스트 보상',
        activity: '학급 직업을 맡고 퀘스트를 완료해 봉을 법니다.',
        goal: '일과 소득의 관계를 이해하고, 노동의 대가로 소득이 생긴다는 것을 경험한다.',
        evidence: '소득 합계, 직업 수, 퀘스트 완료 건수',
    },
    {
        feature: '상점·편의점·공동구매',
        activity: '한정된 봉으로 무엇을 살지 고르고, 친구와 돈을 모아 공동구매합니다.',
        goal: '희소성 속에서 합리적으로 선택하고, 선택에 따르는 기회비용을 설명한다.',
        evidence: '소비 합계, 구매 건수, 소비 비중',
    },
    {
        feature: '은행 예금·보물상자 적금',
        activity: '봉을 예금·적금에 맡기고 이자를 받습니다.',
        goal: '저축의 의미와 이자의 원리를 알고, 미래를 위한 계획적 소비·저축 습관을 기른다.',
        evidence: '예금·적금 잔액, 저축 비중',
    },
    {
        feature: '은행 대출·신용',
        activity: '봉을 빌리고 약정일까지 갚으며, 연체하면 신용 제한을 받습니다.',
        goal: '빌린 돈을 갚는 책임과 신용의 중요성을 이해한다.',
        evidence: '대출 잔액, 신용 제한 여부',
    },
    {
        feature: '지수투자(코스피·코스닥·나스닥)',
        activity: '실제 시장 지수에 연동된 투자 상품을 사고팝니다.',
        goal: '투자에는 수익과 위험이 함께 있음을 알고, 분산과 신중한 판단의 필요성을 이해한다.',
        evidence: '투자 원금, 투자 비중',
    },
    {
        feature: '부동산(자리)·버스 좌석 경매',
        activity: '교실 자리와 버스 좌석을 사고 경매로 가격이 정해집니다.',
        goal: '수요와 공급에 따라 가격이 정해지는 시장의 원리를 경험한다.',
        evidence: '부동산·좌석 거래 기록',
    },
    {
        feature: '학생 간 이체',
        activity: '친구에게 봉을 보내거나 받습니다.',
        goal: '거래의 기록과 약속을 지키는 경제 주체의 책임을 이해한다.',
        evidence: '이체 보낸·받은 건수와 금액',
    },
]);

const MAX_REASON_LEN = 200;

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function round1(n) {
    return Math.round(num(n) * 10) / 10;
}

function pct(part, whole) {
    const w = num(whole);
    if (w <= 0) return 0;
    return Math.round((num(part) / w) * 1000) / 10;
}

/**
 * 봉 변동 기록 한 줄을 경제 활동 분류로 나눕니다.
 * source가 있으면 먼저 보고, 없으면 사유 글자로 판단합니다.
 * @param {{ reason?: string, source?: string, kind?: string }} log
 * @returns {string} ECONOMY_CATEGORIES 의 id
 */
export function classifyBongLog(log) {
    if (!log || typeof log !== 'object') return 'other';
    const source = String(log.source || '');
    const reason = String(log.reason || '').slice(0, MAX_REASON_LEN);

    if (source === 'bankTransferIn' || source === 'bankTransferOut') return 'transfer';
    if (source === 'itemRefund' || source === 'busSeatRefund') return 'refund';
    if (source === 'bankTermMaturity' || source === 'bankTermEarly') return 'saving';
    if (/^bankLoan/.test(source)) return 'loan';
    if (source === 'skinPurchase') return 'spending';

    if (/환불/.test(reason)) return 'refund';
    if (/이체|송금/.test(reason)) return 'transfer';
    if (/대출/.test(reason)) return 'loan';
    if (/예금|적금/.test(reason)) return 'saving';
    if (/매수|매도|지수|부동산|투자/.test(reason)) return 'investing';
    if (/구매|잠금 해제|신청|경매|입찰/.test(reason)) return 'spending';
    if (/퀘스트|보상|급여|월급|직업|이자|보너스|출석|레이드|골든벨|퀴즈|칭찬|지급|수당|상금/.test(reason)) return 'income';
    return 'other';
}

/**
 * 봉 변동 기록을 분류별 들어온 봉/나간 봉/건수로 모읍니다.
 * @param {any[]} logs
 */
export function summarizeBongFlows(logs) {
    const flows = {};
    ECONOMY_CATEGORIES.forEach((c) => {
        flows[c.id] = { in: 0, out: 0, count: 0 };
    });
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        if (!log || typeof log !== 'object') return;
        const delta = num(log.delta != null ? log.delta : num(log.after) - num(log.before));
        if (!delta) return;
        const cat = classifyBongLog(log);
        const bucket = flows[cat] || flows.other;
        if (delta > 0) bucket.in += delta;
        else bucket.out += -delta;
        bucket.count += 1;
    });
    Object.values(flows).forEach((b) => {
        b.in = round1(b.in);
        b.out = round1(b.out);
    });
    return flows;
}

function sumPrices(rows, key = 'price') {
    return (Array.isArray(rows) ? rows : []).reduce((s, r) => s + Math.max(0, num(r && r[key])), 0);
}

/**
 * 학생 1명의 경제활동 요약.
 * @param {object} stu 학생 문서
 * @param {{ todayYmd?: string }} [opts]
 */
export function summarizeStudentEconomy(stu, opts = {}) {
    const s = stu && typeof stu === 'object' ? stu : {};
    const wallet = round1(Math.max(0, num(s.bong)));
    const regularSavings = round1(Math.max(0, num(s.bankRegularSavings)));
    const terms = Array.isArray(s.bankTermDeposits) ? s.bankTermDeposits : [];
    const termSavings = round1(terms.reduce((sum, t) => sum + Math.max(0, num(t && t.amount)), 0));
    const loan = s.bankLoan && typeof s.bankLoan === 'object' ? s.bankLoan : null;
    const loanOwed = round1(loan ? Math.max(0, num(loan.principal)) + Math.max(0, num(loan.interest)) : 0);

    const stocks = sanitizeStockInvestments(s.stockInvestments);
    const stockPrincipal = round1(Object.values(stocks).reduce((sum, p) => sum + (p ? p.principal : 0), 0));
    const stockMarkets = Object.values(stocks).filter(Boolean).length;

    const savings = round1(regularSavings + termSavings);
    const grossAssets = round1(wallet + savings + stockPrincipal);
    const netWorth = round1(grossAssets - loanOwed);

    const conv = Array.isArray(s.conveniencePurchases) ? s.conveniencePurchases : [];
    const events = Array.isArray(s.classEventPurchases) ? s.classEventPurchases : [];
    const purchaseCount = conv.length + events.length;
    const purchaseSpend = round1(sumPrices(conv) + sumPrices(events));

    const logs = Array.isArray(s.bongChangeLog) ? s.bongChangeLog : [];
    const flows = summarizeBongFlows(logs);
    const jobs = Array.isArray(s.jobs) ? s.jobs.length : 0;
    const quests = Array.isArray(s.questHistory) ? s.questHistory.length : 0;

    const today = String(opts.todayYmd || '');
    const creditLimited = !!(s.creditDefaultUntilYmd && (!today || String(s.creditDefaultUntilYmd) >= today));

    return {
        wallet,
        regularSavings,
        termSavings,
        savings,
        stockPrincipal,
        stockMarkets,
        loanOwed,
        grossAssets,
        netWorth,
        savingShare: pct(savings, grossAssets),
        investShare: pct(stockPrincipal, grossAssets),
        purchaseCount,
        purchaseSpend,
        jobs,
        quests,
        creditLimited,
        flows,
        logCount: logs.length,
    };
}

/**
 * 선생님이 관찰 기록의 근거로 참고할 수 있는 짧은 문구.
 * 평가가 아니라 기록된 사실만 말합니다.
 * @param {ReturnType<typeof summarizeStudentEconomy>} sum
 * @returns {string[]}
 */
export function describeEconomyHabits(sum) {
    if (!sum) return [];
    const notes = [];
    if (sum.grossAssets > 0 && sum.savingShare >= 50) {
        notes.push(`자산의 ${sum.savingShare}%를 예금·적금으로 관리함`);
    } else if (sum.savings > 0) {
        notes.push(`예금·적금 ${sum.savings}B 보유`);
    }
    if (sum.stockMarkets >= 2) {
        notes.push(`${sum.stockMarkets}개 지수에 나누어 투자함`);
    } else if (sum.stockMarkets === 1) {
        notes.push('지수투자를 경험함');
    }
    if (sum.loanOwed > 0) notes.push(`대출 ${sum.loanOwed}B 상환 중`);
    if (sum.creditLimited) notes.push('대출 연체로 신용 제한 기간에 있음');
    if (sum.flows && sum.flows.transfer && sum.flows.transfer.count > 0) {
        notes.push(`친구와 이체 ${sum.flows.transfer.count}건`);
    }
    if (sum.jobs > 0) notes.push(`학급 직업 ${sum.jobs}개 수행`);
    if (sum.purchaseCount > 0) notes.push(`상점 구매 ${sum.purchaseCount}건(${sum.purchaseSpend}B)`);
    if (!notes.length) notes.push('기록된 경제활동이 아직 적음');
    return notes;
}

/**
 * 학생별 경제활동 리포트 시트.
 * @param {{ students: any[], studentIds?: string[], getName?: (sid:string)=>string, todayYmd?: string }} args
 * @returns {Array<Array<string|number>>}
 */
export function buildEconomyReportRows(args = {}) {
    const header = [
        '학번', '이름',
        '지갑(B)', '예금·적금(B)', '지수투자 원금(B)', '대출 잔액(B)', '순자산(B)',
        '저축 비중(%)', '투자 비중(%)',
        '구매 건수', '구매 금액(B)', '직업 수', '퀘스트 완료',
        '최근 소득(B)', '최근 소비(B)', '최근 이체 건수',
        '관찰 문구',
    ];
    const rows = [header];
    const byId = new Map((args.students || []).map((s) => [String(s && s.id), s]));
    const ids = Array.isArray(args.studentIds) && args.studentIds.length
        ? args.studentIds.map(String)
        : [...byId.keys()];
    const getName = typeof args.getName === 'function' ? args.getName : (sid) => sid;
    ids.forEach((sid) => {
        const stu = byId.get(sid) || { id: sid };
        const sum = summarizeStudentEconomy(stu, { todayYmd: args.todayYmd });
        rows.push([
            sid,
            getName(sid) || sid,
            sum.wallet,
            sum.savings,
            sum.stockPrincipal,
            sum.loanOwed,
            sum.netWorth,
            sum.savingShare,
            sum.investShare,
            sum.purchaseCount,
            sum.purchaseSpend,
            sum.jobs,
            sum.quests,
            sum.flows.income.in,
            round1(sum.flows.spending.out),
            sum.flows.transfer.count,
            describeEconomyHabits(sum).join(' · '),
        ]);
    });
    return rows;
}

/**
 * 학급 전체 분류별 봉 흐름 시트.
 * @param {{ students: any[], studentIds?: string[] }} args
 */
export function buildEconomyFlowRows(args = {}) {
    const total = {};
    ECONOMY_CATEGORIES.forEach((c) => {
        total[c.id] = { in: 0, out: 0, count: 0 };
    });
    const allow = Array.isArray(args.studentIds) && args.studentIds.length
        ? new Set(args.studentIds.map(String))
        : null;
    (args.students || []).forEach((s) => {
        if (!s || (allow && !allow.has(String(s.id)))) return;
        const flows = summarizeBongFlows(s.bongChangeLog);
        Object.keys(flows).forEach((k) => {
            total[k].in += flows[k].in;
            total[k].out += flows[k].out;
            total[k].count += flows[k].count;
        });
    });
    const rows = [['분류', '들어온 봉(B)', '나간 봉(B)', '기록 건수']];
    ECONOMY_CATEGORIES.forEach((c) => {
        const t = total[c.id];
        rows.push([c.label, round1(t.in), round1(t.out), t.count]);
    });
    rows.push([]);
    rows.push(['※ 봉 변동 기록은 학생마다 최근 기록만 남으므로, 학기 전체 합계가 아니라 최근 흐름입니다.']);
    return rows;
}

/** 기능별 학습 목표 시트 (성취기준 칸은 선생님이 채움) */
export function buildEconomyGoalRows() {
    const rows = [['앱 기능', '학생 활동', '학습 목표', '확인할 기록', '연계 성취기준(선생님 입력)']];
    ECONOMY_LEARNING_GOALS.forEach((g) => {
        rows.push([g.feature, g.activity, g.goal, g.evidence, '']);
    });
    return rows;
}
