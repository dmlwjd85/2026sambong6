import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 광장 학생 카드 '보석 결정'(시안 A) 회귀 테스트.
 * 앱 본체(sambongWorld.js)는 브라우저 전용이라, 실제 소스의 LEVEL_DATA·getLevelInfo·tierClass 줄을
 * 그대로 잘라 와서 돌려 봅니다. 마스터가 카드를 눌러 +2 XP를 줄 때 등급 경계를 넘으면 카드 보석도 바뀌어야 해요.
 */
const src = fs.readFileSync(fileURLToPath(new URL('../sambongWorld.js', import.meta.url)), 'utf8');
const css = fs.readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

function sliceBetween(text, startMarker, endMarker) {
    const s = text.indexOf(startMarker);
    assert.ok(s >= 0, `${startMarker} 를 찾지 못했어요`);
    const e = text.indexOf(endMarker, s + startMarker.length);
    assert.ok(e > s, `${endMarker} 를 찾지 못했어요`);
    return text.slice(s, e + endMarker.length);
}

const levelDataSrc = sliceBetween(src, 'const LEVEL_DATA = [', '];');
const getLevelInfoSrc = sliceBetween(src, 'function getLevelInfo(xp) {', 'index: LEVEL_DATA.length-1}; \n        }');
const tierLineSrc = src.split('\n').find((l) => l.includes('const tierClass = ') && l.includes('plaza-tier-'));
const hasAuraLineSrc = src.split('\n').find((l) => l.includes('const hasAuraSkin = '));
assert.ok(tierLineSrc && hasAuraLineSrc, 'renderPlaza 의 tierClass/hasAuraSkin 줄이 있어야 해요');

// eslint-disable-next-line no-new-func
const { LEVEL_DATA, getLevelInfo, tierClassFor } = new Function(`
    ${levelDataSrc}
    ${getLevelInfoSrc}
    function tierClassFor(xp, aura) {
        const lv = getLevelInfo(xp);
        const border = aura ? aura.border : lv.info.borderColor;
        const glow = aura ? aura.glow : 'shadow-md';
        ${hasAuraLineSrc.trim()}
        ${tierLineSrc.trim()}
        return tierClass.trim();
    }
    return { LEVEL_DATA, getLevelInfo, tierClassFor };
`)();

const RINGS = ['saenaegi', 'chobo', 'jungsu', 'gosu', 'guardian', 'legend'];
const MASTER_CLICK_XP = 2;

describe('광장 카드 보석 등급(시안 A)', () => {
    it('등급은 여섯 개이고 순서가 새내기→전설이에요', () => {
        assert.deepEqual(LEVEL_DATA.map((d) => d.ring), RINGS);
        assert.deepEqual(LEVEL_DATA.map((d) => d.name), ['새내기', '초보', '중수', '고수', '수호자', '전설']);
    });

    it('등급마다 보석 색 변수 묶음이 CSS에 있어요', () => {
        for (const ring of RINGS) {
            const m = css.match(new RegExp(`\\.plaza-tier-${ring}\\s*\\{([^}]*)\\}`));
            assert.ok(m, `.plaza-tier-${ring} 규칙이 있어야 해요`);
            for (const v of ['--pt-g1', '--pt-g2', '--pt-g3', '--pt-edge', '--pt-plate', '--pt-ray', '--pt-fs']) {
                assert.match(m[1], new RegExp(`${v}\\s*:`), `${ring} 에 ${v} 가 있어야 해요`);
            }
        }
    });

    it('카드 클래스는 등급 이름을 그대로 따라가요', () => {
        const sample = [0, 520, 2800, 7200, 15800, 30500, 52000, 999999];
        const want = ['saenaegi', 'saenaegi', 'chobo', 'jungsu', 'gosu', 'guardian', 'legend', 'legend'];
        sample.forEach((xp, i) => assert.equal(tierClassFor(xp), `plaza-tier plaza-tier-${want[i]}`, `xp ${xp}`));
    });

    it('마스터가 카드를 눌러 +2 XP를 주면 경계에서 다음 보석으로 바뀌어요(전설까지)', () => {
        assert.match(src, /window\.plazaClickXP = async function[\s\S]{0,300}quickReward\('xp', 2, stuId, element\)/,
            '광장 카드 클릭 지급은 +2 XP 여야 해요');
        for (let i = 0; i < LEVEL_DATA.length - 1; i++) {
            const max = LEVEL_DATA[i].max;
            // 경계 바로 아래(max-1)와 경계(max)에서 +2 → 다음 등급
            for (const before of [max - 1, max]) {
                assert.equal(tierClassFor(before), `plaza-tier plaza-tier-${RINGS[i]}`, `${before}XP 는 ${RINGS[i]}`);
                assert.equal(tierClassFor(before + MASTER_CLICK_XP), `plaza-tier plaza-tier-${RINGS[i + 1]}`,
                    `${before}+2XP 는 ${RINGS[i + 1]}`);
            }
            // 경계에서 두 칸 아래는 +2 해도 그대로
            assert.equal(tierClassFor(max - 2 + MASTER_CLICK_XP), `plaza-tier plaza-tier-${RINGS[i]}`);
        }
        // 전설은 끝 — 아무리 눌러도 전설
        assert.equal(tierClassFor(40000 + MASTER_CLICK_XP * 1000), 'plaza-tier plaza-tier-legend');
    });

    it('오라 스킨을 끼면 plaza-tier-aura 가 붙어 오라 테두리·빛을 덮지 않아요', () => {
        assert.equal(tierClassFor(30500, { border: 'border-red-500', glow: 'shadow-[0_0_12px_red]' }),
            'plaza-tier plaza-tier-guardian plaza-tier-aura');
        assert.match(css, /\.plaza-card\.plaza-tier:not\(\.plaza-tier-aura\)\s*\{\s*border-color: var\(--pt-edge\)/);
    });

    it('renderPlaza 학생 카드에 등급 클래스가 붙고 쨈 글꼴은 한 번만 불러와요', () => {
        assert.match(src, /class="plaza-card [^"]*relative\$\{tierClass\}/);
        // 글꼴 CSS 는 한 함수에서만, 한 번만 불러와요
        const loader = sliceBetween(src, 'function loadAlkkagiFontsOnce(opts) {', '\n        }');
        assert.match(loader, /^function loadAlkkagiFontsOnce\(opts\) \{\s*if \(loadAlkkagiFontsOnce\.started\) return;/);
        assert.match(loader, /loadAlkkagiFontsOnce\.started = true;\s*import\('\.\/alkkagiFonts\.css'\)/);
        // 한가할 때 불러오기는 한 번만 예약해요
        assert.match(loader, /if \(loadAlkkagiFontsOnce\.queued\) return;\s*loadAlkkagiFontsOnce\.queued = true;/);
        assert.match(loader, /requestIdleCallback\(run, \{ timeout: 2000 \}\)/);
        assert.equal(src.split("import('./alkkagiFonts.css')").length - 1, 1, '글꼴 CSS import 는 한 곳에만 있어야 해요');
        assert.match(css, /\.plaza-tier \.plaza-card-name \{[^}]*font-family: 'JJAEM Title'/);
    });

    it('B-1: 쨈 제목 글꼴은 앱 시작이 아니라 광장이 보일 때만 불러와요', () => {
        // renderPlaza 는 광장이 숨어 있어도 앱 시작 때 불리므로, 여기서는 글꼴을 부르지 않아요
        const body = sliceBetween(src, 'window.renderPlaza = function(studentsData, gmData, gmaData) {', 'const createCard');
        assert.ok(body.length > 0);
        assert.doesNotMatch(body, /loadAlkkagiFontsOnce\(\)/);
        assert.doesNotMatch(body, /import\('\.\/alkkagiFonts\.css'\)/);
        // 광장 탭으로 바꿀 때 불러요
        const sw = sliceBetween(src, 'window.switchTab = function(tabId, subOrOpts) {', "if(activeSec) activeSec.classList.remove('hidden');");
        assert.ok(sw.length > 0);
        const afterShow = src.slice(src.indexOf("if(activeSec) activeSec.classList.remove('hidden');", src.indexOf('window.switchTab = function(tabId, subOrOpts) {')), src.indexOf("const activeBtn = document.getElementById('tab-' + tabId);"));
        assert.match(afterShow, /if \(tabId === 'plaza'\) loadAlkkagiFontsOnce\(\{ idle: true \}\);/);
        // 알까기 판도 같은 함수로 불러요
        assert.match(sliceBetween(src, 'function ensureAlkkagiBoard() {', '_alkBoard = createAlkkagiBoard('), /loadAlkkagiFontsOnce\(\);/);
    });

    it('숨쉬기 움직임은 수호자·전설만, 움직임 줄이기에서는 멈춰요', () => {
        const block = sliceBetween(css, '@media (prefers-reduced-motion: no-preference) {\n            .plaza-card.plaza-tier-guardian::before', '}\n        }');
        assert.match(block, /plaza-tier-guardian::before,\s*\.plaza-card\.plaza-tier-legend::before \{ animation: plaza-gem-breathe/);
        assert.doesNotMatch(block, /saenaegi|chobo|jungsu|gosu/);
    });
});

describe('광장 카드 좁은 화면(폰 6칸 자리표)', () => {
    it('좁은 카드에서 따봉·역따봉이 카드 폭 안에서 반씩 나뉘어요', () => {
        const block = sliceBetween(css, '@container (max-width: 6rem) {', '.praise-btn img { width: 0.72rem; height: 0.72rem; }\n        }');
        assert.match(block, /\.praise-btn \{[^}]*flex: 1 1 0;[^}]*min-width: 0;/);
        assert.match(block, /flex-direction: column;/);
    });

    it('C-1: 320·360px 폰에서 수치는 두 줄(경험치 / 온도계·봉)이고 아주 좁으면 온도계 아이콘만 빼요', () => {
        const block = sliceBetween(css, '@container (max-width: 5.2rem) {', '\n        }');
        assert.match(block, /\.plaza-card-stats \{ flex-wrap: wrap;/);
        assert.match(block, /\.plaza-stat-xp \{ flex: 0 0 100%;/);
        assert.match(block, /\.plaza-learning-thermometer \{ min-width: 0; max-width: none;/);
        const tiny = sliceBetween(css, '@container (max-width: 2.9rem) {', '\n        }');
        assert.match(tiny, /\.plaza-therm-ico \{ display: none; \}/);
        // 온도계 아이콘은 따로 감싸서 숫자만 남길 수 있어요
        assert.match(src, /<span class="plaza-therm-ico" aria-hidden="true">🌡<\/span>\$\{value >= 0 \? '\+' : ''\}\$\{value\}<\/span>/);
    });

    it('C-1: 폰에서도 방패 배지는 보이고, 카드 안쪽 오른쪽 위에 깜빡이지 않게 붙어요', () => {
        const phone = sliceBetween(css, '.plaza-card-extra { display: none !important; }', '/* 자리표 연동');
        const badge = sliceBetween(phone, '.plaza-card .plaza-card-extra.plaza-hp-badge {', '}');
        assert.match(badge, /display: flex !important;/);
        assert.match(badge, /top: 0\.12rem;/);
        assert.match(badge, /right: 0\.12rem;/);
        assert.match(badge, /animation: none;/);
        assert.match(src, /plaza-card-extra plaza-hp-badge absolute/);
    });
});
