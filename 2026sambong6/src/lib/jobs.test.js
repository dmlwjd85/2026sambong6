import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_JOB_LOOKS,
    JOB_COLOR_CHOICES,
    JOB_ICON_CHOICES,
    jobColorChoicesForPicker,
    jobIconChoicesForPicker,
    jobLookConflict,
    jobLookConflictMessage,
    jobLooksAreUnique,
    jobLooksInUse,
    lookForDefaultJob,
    normalizeJobColor,
    normalizeJobIcon,
    pickUnusedJobLook,
    resolveStudentJobsFromCatalog,
    sumCatalogPayForJobs,
    studentHasJob,
    studentHasJobName,
    toggleJobAssignment,
} from './jobs.js';

function mainNormalizeIcon(raw) {
    let icon = String(raw ?? '').trim().replace(/^fa-solid\s+/i, '');
    if (icon.startsWith('fas ')) icon = icon.slice(4).trim();
    if (/^fa-[a-z0-9-]+$/.test(icon)) return icon;
    return 'fa-star';
}

function mainNormalizeColor(raw) {
    const color = String(raw ?? '').trim();
    if (/^text-[a-z0-9-]+$/.test(color)) return color;
    return 'text-blue-500';
}

/** main의 직업 맞춤과 같은 순서입니다. id, 이름, 그다음 아이콘·색입니다. */
function mainSalaryPay(jobs, catalog) {
    return (Array.isArray(jobs) ? jobs : []).reduce((sum, owned) => {
        if (!owned) return sum;
        const ownedId = owned.id != null && owned.id !== '' ? String(owned.id) : '';
        let match = ownedId ? catalog.find((job) => String(job.id) === ownedId) : null;
        const name = String(owned.name || '').trim();
        if (!match && name) match = catalog.find((job) => String(job.name || '').trim() === name) || null;
        if (!match && owned.icon) {
            const icon = mainNormalizeIcon(owned.icon);
            const color = mainNormalizeColor(owned.color);
            match = catalog.find((job) =>
                mainNormalizeIcon(job.icon) === icon && mainNormalizeColor(job.color) === color) || null;
        }
        return sum + Math.max(0, Math.round(Number(match && match.pay) || 0));
    }, 0);
}


describe('직업 아이콘·색', () => {
    it('기본 직업은 모양과 색이 각각 겹치지 않는다', () => {
        assert.equal(DEFAULT_JOB_LOOKS.length, 17);
        assert.equal(jobLooksAreUnique(DEFAULT_JOB_LOOKS), true);
        const ids = DEFAULT_JOB_LOOKS.map((job) => job.id);
        assert.equal(new Set(ids).size, ids.length);
        DEFAULT_JOB_LOOKS.forEach((job) => {
            assert.ok(JOB_ICON_CHOICES.some((item) => item.class === job.icon), job.icon);
            assert.ok(JOB_COLOR_CHOICES.some((item) => item.class === job.color), job.color);
            assert.deepEqual(lookForDefaultJob(job.id), { icon: job.icon, color: job.color });
        });
    });

    it('고르기 목록의 클래스와 이름이 중복되지 않는다', () => {
        const iconClasses = JOB_ICON_CHOICES.map((item) => item.class);
        const colorClasses = JOB_COLOR_CHOICES.map((item) => item.class);
        assert.equal(new Set(iconClasses).size, iconClasses.length);
        assert.equal(new Set(colorClasses).size, colorClasses.length);
        assert.ok(JOB_ICON_CHOICES.length >= 40);
        assert.ok(JOB_COLOR_CHOICES.length >= 28);
        assert.ok(JOB_ICON_CHOICES.length - DEFAULT_JOB_LOOKS.length >= 20);
        assert.ok(JOB_COLOR_CHOICES.length - DEFAULT_JOB_LOOKS.length >= 10);
    });

    it('아이콘·색 값을 정리하고 모르는 값은 기본값으로 돌린다', () => {
        const fa = 'fa' + '-';
        const tx = 'text' + '-';
        assert.equal(normalizeJobIcon('  ' + fa + 'solid ' + fa + 'crown '), 'crown');
        assert.equal(normalizeJobIcon(fa + 'flag'), 'flag');
        assert.equal(normalizeJobIcon('not-an-icon'), 'star');
        assert.equal(normalizeJobColor(tx + 'amber-400'), 'tone-01');
        assert.equal(normalizeJobColor(tx + 'amber-200').startsWith('legacy-'), true);
        assert.equal(normalizeJobColor('blue'), 'tone-19');
    });

    it('이미 쓰는 모양·색은 새 직업 기본값에서 뺀다', () => {
        const used = jobLooksInUse(DEFAULT_JOB_LOOKS);
        assert.equal(used.icons.size, DEFAULT_JOB_LOOKS.length);
        assert.equal(used.colors.size, DEFAULT_JOB_LOOKS.length);
        const pick = pickUnusedJobLook(DEFAULT_JOB_LOOKS);
        assert.equal(used.icons.has(pick.icon), false);
        assert.equal(used.colors.has(pick.color), false);
        const keepCrown = pickUnusedJobLook(DEFAULT_JOB_LOOKS, 'job_sp');
        assert.equal(keepCrown.icon, 'crown');
        assert.equal(keepCrown.color, 'tone-01');
    });

    it('다른 직업과 아이콘 또는 색이 겹치면 막아 준다', () => {
        const iconConflict = jobLookConflict(DEFAULT_JOB_LOOKS, {
            icon: 'crown',
            color: 'tone-19',
        });
        assert.equal(iconConflict.kind, 'icon');
        assert.equal(iconConflict.job.id, 'job_sp');
        const namedLooks = DEFAULT_JOB_LOOKS.map((job) => ({
            ...job,
            name: job.id === 'job10' ? '삼봉은행' : job.id,
        }));
        const colorConflict = jobLookConflict(namedLooks, {
            icon: 'star',
            color: 'tone-13',
        });
        assert.equal(colorConflict.kind, 'color');
        assert.equal(colorConflict.job.id, 'job10');
        assert.match(jobLookConflictMessage(colorConflict), /삼봉은행/);
        assert.equal(jobLookConflict(DEFAULT_JOB_LOOKS, {
            icon: 'crown',
            color: 'tone-01',
            exceptId: 'job_sp',
        }), null);
    });

    it('예전에 쓰던 아이콘·색은 고르기 목록 앞에 붙인다', () => {
        const icons = jobIconChoicesForPicker('fa' + '-ghost');
        assert.equal(icons[0].class, 'ghost');
        assert.equal(icons[0].label, '현재');
        const colors = jobColorChoicesForPicker(normalizeJobColor('text' + '-amber-200'));
        assert.equal(colors[0].class, normalizeJobColor('text' + '-amber-200'));
        const same = jobIconChoicesForPicker('crown');
        assert.equal(same[0].class, 'crown');
        assert.equal(same.filter((item) => item.class === 'crown').length, 1);
    });

    it('학생 직업을 같은 카드로 장착·해제한다', () => {
        const job = { name: '길드 마스터', icon: 'flag', color: 'tone-03' };
        const on = toggleJobAssignment([], job);
        assert.equal(studentHasJobName(on, '길드 마스터'), true);
        assert.equal(on[0].icon, 'flag');
        const off = toggleJobAssignment(on, job);
        assert.equal(off.length, 0);
        assert.equal(studentHasJobName([{ name: '길드 마스터' }], '길드 마스터'), true);
    });

    it('직업 id를 저장하고 이름·아이콘이 바뀌어도 카탈로그와 맞춘다', () => {
        const job = { id: 'job1', name: '길드 마스터', icon: 'flag', color: 'tone-03' };
        const on = toggleJobAssignment([], job);
        assert.equal(on[0].id, 'job1');
        assert.equal(studentHasJob(on, job), true);
        const catalog = [{ id: 'job1', name: '학급 깃발', icon: 'crown', color: 'tone-01' }];
        const live = resolveStudentJobsFromCatalog(on, catalog);
        assert.equal(live[0].name, '학급 깃발');
        assert.equal(live[0].icon, 'crown');
        assert.equal(live[0].color, 'tone-01');
        assert.equal(studentHasJob(on, catalog[0], catalog), true);
        const off = toggleJobAssignment(on, catalog[0], catalog);
        assert.equal(off.length, 0);
    });

    it('다른 직업을 고르면 기존 직업을 유지한 채 하나 더 단다', () => {
        const vac = { id: 'job_vac', name: '블랙홀 마스터', icon: 'wind', color: 'tone-05' };
        const flag = { id: 'job1', name: '길드 마스터', icon: 'flag', color: 'tone-03' };
        const stacked = [
            { id: 'job3', name: '심연의 청소부', icon: 'trash', color: 'tone-06' },
            { id: 'job4', name: '체력물약 보급관', icon: 'glass', color: 'tone-07' },
        ];
        const switched = toggleJobAssignment([vac], flag);
        assert.equal(switched.length, 2);
        assert.equal(switched[0].id, 'job_vac');
        assert.equal(switched[1].id, 'job1');
        assert.equal(studentHasJobName(switched, '블랙홀 마스터'), true);
        const added = toggleJobAssignment(stacked, flag);
        assert.equal(added.length, 3);
        assert.equal(added[2].name, '길드 마스터');
        const peeled = toggleJobAssignment(stacked, stacked[0]);
        assert.equal(peeled.length, 1);
        assert.equal(peeled[0].id, 'job4');
    });

    it('예전에 id 없이 저장된 직업도 이름이나 모양으로 카탈로그에 맞춘다', () => {
        const snapshot = [{ name: '편의점 매니저', icon: 'store', color: 'tone-15' }];
        const byName = resolveStudentJobsFromCatalog(snapshot, [{
            id: 'job12', name: '편의점 매니저', icon: 'gem', color: 'tone-13',
        }]);
        assert.equal(byName[0].id, 'job12');
        assert.equal(byName[0].icon, 'gem');
        const byLook = resolveStudentJobsFromCatalog(snapshot, [{
            id: 'job12', name: '가게 지킴이', icon: 'store', color: 'tone-15',
        }]);
        assert.equal(byLook[0].id, 'job12');
        assert.equal(byLook[0].name, '가게 지킴이');
    });

    it('id 없이 아이콘·색만 남은 옛 직업 68가지는 main과 같은 주급이다', () => {
        const mainJobs = [
            { id: 'job_sp', name: '학생회 연합대장', pay: 15, icon: 'fa-crown', color: 'text-amber-400' },
            { id: 'job_svp', name: '학생회 부대장', pay: 12, icon: 'fa-shield-cat', color: 'text-orange-500' },
            { id: 'job1', name: '길드 마스터', pay: 12, icon: 'fa-flag', color: 'text-yellow-300' },
            { id: 'job2', name: '길드 매니저', pay: 10, icon: 'fa-star-half-stroke', color: 'text-lime-500' },
            { id: 'job_vac', name: '블랙홀 마스터', pay: 8, icon: 'fa-wind', color: 'text-teal-400' },
            { id: 'job3', name: '심연의 청소부', pay: 7, icon: 'fa-trash-can', color: 'text-stone-400' },
            { id: 'job4', name: '체력물약 보급관', pay: 6, icon: 'fa-glass-water', color: 'text-sky-400' },
            { id: 'job5', name: '역사 기록관', pay: 5, icon: 'fa-chalkboard', color: 'text-slate-400' },
            { id: 'job6', name: '시스템 매니저', pay: 6, icon: 'fa-desktop', color: 'text-cyan-400' },
            { id: 'job7', name: '자원 연금술사', pay: 7, icon: 'fa-recycle', color: 'text-sb-green' },
            { id: 'job8', name: '마나 충전소', pay: 6, icon: 'fa-tablet-screen-button', color: 'text-violet-500' },
            { id: 'job9', name: '빛의 파수꾼', pay: 5, icon: 'fa-lightbulb', color: 'text-orange-300' },
            { id: 'job10', name: '삼봉은행', pay: 6, icon: 'fa-piggy-bank', color: 'text-pink-500' },
            { id: 'job11', name: '생명의 수호자', pay: 5, icon: 'fa-leaf', color: 'text-emerald-500' },
            { id: 'job12', name: '편의점 매니저', pay: 6, icon: 'fa-store', color: 'text-rose-400' },
            { id: 'job_book', name: '마법서 관리관', pay: 6, icon: 'fa-book-skull', color: 'text-purple-500' },
            { id: 'job_newbie', name: '뉴비 매니저', pay: 6, icon: 'fa-hand-holding-heart', color: 'text-fuchsia-400' },
        ];
        const branchCatalog = mainJobs.map((job) => ({
            id: job.id,
            name: job.name,
            pay: job.pay,
            ...lookForDefaultJob(job.id),
        }));
        const cases = [];
        mainJobs.forEach((job) => {
            cases.push({ id: job.id });
            cases.push({ name: job.name });
            cases.push({ icon: job.icon, color: job.color });
            cases.push({ id: job.id, name: job.name, icon: job.icon, color: job.color });
        });
        assert.equal(cases.length, 68);
        cases.forEach((owned) => {
            const expected = mainSalaryPay([owned], mainJobs);
            const actual = sumCatalogPayForJobs([owned], branchCatalog);
            assert.equal(actual, expected, JSON.stringify(owned));
            assert.ok(expected > 0, JSON.stringify(owned));
        });
        assert.equal(sumCatalogPayForJobs(
            [{ icon: 'fa-shield-cat', color: 'text-orange-500' }],
            branchCatalog,
        ), 12);
        assert.deepEqual(lookForDefaultJob('fa-shield-cat'), lookForDefaultJob('job_svp'));
    });

    it('주급은 넘겨준 직업 목록의 카탈로그 금액만 합산한다', () => {
        const catalog = [
            { id: 'job1', name: '길드 마스터', icon: 'flag', color: 'tone-03', pay: 12 },
            { id: 'job4', name: '우유', icon: 'mug-hot', color: 'tone-28', pay: 6 },
        ];
        const serverJobs = [{ id: 'job4', name: '옛 이름', icon: 'star', color: normalizeJobColor('text' + '-slate-300'), pay: 99 }];
        assert.equal(sumCatalogPayForJobs(serverJobs, catalog), 6);
        assert.equal(sumCatalogPayForJobs([{ id: 'missing' }], catalog), 0);
    });
});
