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
    studentHasJob,
    studentHasJobName,
    toggleJobAssignment,
} from './jobs.js';

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
        assert.equal(normalizeJobIcon('  fa-solid fa-crown '), 'fa-crown');
        assert.equal(normalizeJobIcon('fa-flag'), 'fa-flag');
        assert.equal(normalizeJobIcon('not-an-icon'), 'fa-star');
        assert.equal(normalizeJobColor('text-amber-400'), 'text-amber-400');
        assert.equal(normalizeJobColor('text-amber-200'), 'text-amber-200');
        assert.equal(normalizeJobColor('blue'), 'text-blue-500');
    });

    it('이미 쓰는 모양·색은 새 직업 기본값에서 뺀다', () => {
        const used = jobLooksInUse(DEFAULT_JOB_LOOKS);
        assert.equal(used.icons.size, DEFAULT_JOB_LOOKS.length);
        assert.equal(used.colors.size, DEFAULT_JOB_LOOKS.length);
        const pick = pickUnusedJobLook(DEFAULT_JOB_LOOKS);
        assert.equal(used.icons.has(pick.icon), false);
        assert.equal(used.colors.has(pick.color), false);
        const keepCrown = pickUnusedJobLook(DEFAULT_JOB_LOOKS, 'job_sp');
        assert.equal(keepCrown.icon, 'fa-crown');
        assert.equal(keepCrown.color, 'text-amber-400');
    });

    it('다른 직업과 아이콘 또는 색이 겹치면 막아 준다', () => {
        const iconConflict = jobLookConflict(DEFAULT_JOB_LOOKS, {
            icon: 'fa-crown',
            color: 'text-blue-500',
        });
        assert.equal(iconConflict.kind, 'icon');
        assert.equal(iconConflict.job.id, 'job_sp');
        const namedLooks = DEFAULT_JOB_LOOKS.map((job) => ({
            ...job,
            name: job.id === 'job10' ? '삼봉은행' : job.id,
        }));
        const colorConflict = jobLookConflict(namedLooks, {
            icon: 'fa-star',
            color: 'text-pink-500',
        });
        assert.equal(colorConflict.kind, 'color');
        assert.equal(colorConflict.job.id, 'job10');
        assert.match(jobLookConflictMessage(colorConflict), /삼봉은행/);
        assert.equal(jobLookConflict(DEFAULT_JOB_LOOKS, {
            icon: 'fa-crown',
            color: 'text-amber-400',
            exceptId: 'job_sp',
        }), null);
    });

    it('예전에 쓰던 아이콘·색은 고르기 목록 앞에 붙인다', () => {
        const icons = jobIconChoicesForPicker('fa-ghost');
        assert.equal(icons[0].class, 'fa-ghost');
        assert.equal(icons[0].label, '현재');
        const colors = jobColorChoicesForPicker('text-amber-200');
        assert.equal(colors[0].class, 'text-amber-200');
        const same = jobIconChoicesForPicker('fa-crown');
        assert.equal(same[0].class, 'fa-crown');
        assert.equal(same.filter((item) => item.class === 'fa-crown').length, 1);
    });

    it('학생 직업을 같은 카드로 장착·해제한다', () => {
        const job = { name: '길드 마스터', icon: 'fa-flag', color: 'text-yellow-300' };
        const on = toggleJobAssignment([], job);
        assert.equal(studentHasJobName(on, '길드 마스터'), true);
        assert.equal(on[0].icon, 'fa-flag');
        const off = toggleJobAssignment(on, job);
        assert.equal(off.length, 0);
        assert.equal(studentHasJobName([{ name: '길드 마스터' }], '길드 마스터'), true);
    });

    it('직업 id를 저장하고 이름·아이콘이 바뀌어도 카탈로그와 맞춘다', () => {
        const job = { id: 'job1', name: '길드 마스터', icon: 'fa-flag', color: 'text-yellow-300' };
        const on = toggleJobAssignment([], job);
        assert.equal(on[0].id, 'job1');
        assert.equal(studentHasJob(on, job), true);
        const catalog = [{ id: 'job1', name: '학급 깃발', icon: 'fa-crown', color: 'text-amber-400' }];
        const live = resolveStudentJobsFromCatalog(on, catalog);
        assert.equal(live[0].name, '학급 깃발');
        assert.equal(live[0].icon, 'fa-crown');
        assert.equal(live[0].color, 'text-amber-400');
        assert.equal(studentHasJob(on, catalog[0], catalog), true);
        const off = toggleJobAssignment(on, catalog[0], catalog);
        assert.equal(off.length, 0);
    });

    it('다른 직업을 고르면 기존 직업을 교체하고 한 개만 남긴다', () => {
        const vac = { id: 'job_vac', name: '블랙홀 마스터', icon: 'fa-wind', color: 'text-teal-400' };
        const flag = { id: 'job1', name: '길드 마스터', icon: 'fa-flag', color: 'text-yellow-300' };
        const stacked = [
            { id: 'job3', name: '심연의 청소부', icon: 'fa-trash-can', color: 'text-stone-400' },
            { id: 'job4', name: '체력물약 보급관', icon: 'fa-glass-water', color: 'text-sky-400' },
        ];
        const switched = toggleJobAssignment([vac], flag);
        assert.equal(switched.length, 1);
        assert.equal(switched[0].id, 'job1');
        assert.equal(studentHasJobName(switched, '블랙홀 마스터'), false);
        const replaced = toggleJobAssignment(stacked, flag);
        assert.equal(replaced.length, 1);
        assert.equal(replaced[0].name, '길드 마스터');
        const peeled = toggleJobAssignment(stacked, stacked[0]);
        assert.equal(peeled.length, 1);
        assert.equal(peeled[0].id, 'job4');
    });

    it('예전에 id 없이 저장된 직업도 이름이나 모양으로 카탈로그에 맞춘다', () => {
        const snapshot = [{ name: '편의점 매니저', icon: 'fa-store', color: 'text-rose-400' }];
        const byName = resolveStudentJobsFromCatalog(snapshot, [{
            id: 'job12', name: '편의점 매니저', icon: 'fa-gem', color: 'text-pink-500',
        }]);
        assert.equal(byName[0].id, 'job12');
        assert.equal(byName[0].icon, 'fa-gem');
        const byLook = resolveStudentJobsFromCatalog(snapshot, [{
            id: 'job12', name: '가게 지킴이', icon: 'fa-store', color: 'text-rose-400',
        }]);
        assert.equal(byLook[0].id, 'job12');
        assert.equal(byLook[0].name, '가게 지킴이');
    });
});
