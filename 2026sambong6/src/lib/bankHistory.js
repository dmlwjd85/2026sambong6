/**
 * 은행 「사용 기록」: 내 지갑(봉)이 바뀐 기록을 최근 며칠만 보여 줘요.
 * 학생 문서의 bongChangeLog(최근 80건까지 보관)를 그대로 써서 Firestore 읽기를 더 쓰지 않아요.
 */
import { classifyBongLog } from './economyReport.js';

export const BANK_HISTORY_DAYS = 3;

const CATEGORY_LABEL = Object.freeze({
    income: '소득', spending: '소비', saving: '저축', investing: '투자',
    loan: '대출', transfer: '이체', refund: '환불', other: '기타',
});

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 오늘 포함 days 일 전 자정(이 기기 시간대) */
export function bankHistoryStart(nowMs = Date.now(), days = BANK_HISTORY_DAYS) {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (Math.max(1, Math.floor(days)) - 1));
    return d.getTime();
}

/** 최근 기록(새것부터). delta 0 은 빼요. */
export function bankHistoryRows(logs, { nowMs = Date.now(), days = BANK_HISTORY_DAYS } = {}) {
    const from = bankHistoryStart(nowMs, days);
    return (Array.isArray(logs) ? logs : [])
        .filter((l) => l && typeof l === 'object' && num(l.at) >= from && num(l.at) <= nowMs + 60000)
        .map((l) => {
            const delta = l.delta != null ? num(l.delta) : num(l.after) - num(l.before);
            const cat = classifyBongLog(l);
            const d = new Date(num(l.at));
            return {
                at: num(l.at),
                ymd: ymdOf(d),
                time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
                reason: String(l.reason || '기록').slice(0, 60),
                delta,
                after: l.after != null ? num(l.after) : null,
                category: cat,
                categoryLabel: CATEGORY_LABEL[cat] || '기타',
            };
        })
        .filter((r) => Math.abs(r.delta) > 0.0001)
        .sort((a, b) => b.at - a.at);
}

/** 날짜별로 묶고 날마다 들어온·나간 합계 */
export function groupBankHistory(rows) {
    const days = [];
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        let day = days.find((x) => x.ymd === r.ymd);
        if (!day) { day = { ymd: r.ymd, in: 0, out: 0, rows: [] }; days.push(day); }
        if (r.delta > 0) day.in += r.delta; else day.out += -r.delta;
        day.rows.push(r);
    });
    return days;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 사용 기록 HTML. fmt(n) → '12봉' 같은 글 */
export function bankHistoryHtml(logs, { nowMs = Date.now(), days = BANK_HISTORY_DAYS, fmt = (n) => `${n}B` } = {}) {
    const groups = groupBankHistory(bankHistoryRows(logs, { nowMs, days }));
    if (!groups.length) return `<p class="bank-hist-empty">최근 ${days}일 동안 지갑이 바뀐 기록이 없어요.</p>`;
    const sign = (n) => (n > 0 ? `+${fmt(n)}` : `−${fmt(-n)}`);
    return groups.map((g) => {
        const [y, m, d] = g.ymd.split('-').map(Number);
        const w = WEEK[new Date(y, m - 1, d).getDay()];
        const rows = g.rows.map((r) => `<li class="bank-hist-row">
                <span class="bank-hist-time">${esc(r.time)}</span>
                <span class="bank-hist-cat is-${esc(r.category)}">${esc(r.categoryLabel)}</span>
                <span class="bank-hist-reason">${esc(r.reason)}</span>
                <span class="bank-hist-delta ${r.delta > 0 ? 'is-in' : 'is-out'}">${esc(sign(r.delta))}</span>
                <span class="bank-hist-after">${r.after == null ? '' : `지갑 ${esc(fmt(r.after))}`}</span>
            </li>`).join('');
        return `<section class="bank-hist-day">
            <h4 class="bank-hist-date"><span>${m}월 ${d}일 (${w})</span><span class="bank-hist-sum"><b class="is-in">+${esc(fmt(g.in))}</b> <b class="is-out">−${esc(fmt(g.out))}</b></span></h4>
            <ul class="bank-hist-list">${rows}</ul>
        </section>`;
    }).join('');
}
